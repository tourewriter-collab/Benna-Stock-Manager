import express from 'express';
import db from '../database.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Get usage report summary
router.get('/usage-summary', authenticateToken, (req, res) => {
  try {
    const { start_date, end_date, category_id } = req.query;

    const sDate = start_date || null;
    const eDate = end_date ? `${end_date} 23:59:59` : null;

    let sql = `
      SELECT 
        ul.inventory_item_id,
        COALESCE(i.name, MAX(ul.item_name)) as item_name,
        
        -- Period IN (received)
        SUM(CASE WHEN ul.transaction_type = 'IN' AND (? IS NULL OR ul.timestamp >= ?) AND (? IS NULL OR ul.timestamp <= ?) THEN ul.quantity_changed ELSE 0 END) as period_in,
        
        -- Period OUT (used)
        SUM(CASE WHEN ul.transaction_type = 'OUT' AND (? IS NULL OR ul.timestamp >= ?) AND (? IS NULL OR ul.timestamp <= ?) THEN ul.quantity_changed ELSE 0 END) as period_out,

        -- Period Adjustments
        SUM(CASE WHEN ul.transaction_type = 'ADJUST_IN' AND (? IS NULL OR ul.timestamp >= ?) AND (? IS NULL OR ul.timestamp <= ?) THEN ul.quantity_changed ELSE 0 END) as period_adjust_in,
        SUM(CASE WHEN ul.transaction_type = 'ADJUST_OUT' AND (? IS NULL OR ul.timestamp >= ?) AND (? IS NULL OR ul.timestamp <= ?) THEN ul.quantity_changed ELSE 0 END) as period_adjust_out,
        
        -- Live stock directly from inventory (single value per item id)
        i.quantity as live_stock,
        
        -- Initial stock: net movement BEFORE the start date
        COALESCE((
          SELECT SUM(CASE WHEN transaction_type IN ('IN', 'ADJUST_IN') THEN quantity_changed ELSE -quantity_changed END)
          FROM usage_logs 
          WHERE inventory_item_id = ul.inventory_item_id 
          AND (? IS NULL OR timestamp < ?)
        ), 0) as initial_stock,

        i.category_id as category_id,
        c.name_en as name_en,
        c.name_fr as name_fr
      FROM usage_logs ul
      JOIN inventory i ON ul.inventory_item_id = i.id
      LEFT JOIN categories c ON i.category_id = c.id
      WHERE ul.inventory_item_id IS NOT NULL
    `;

    const params = [
      sDate, sDate, eDate, eDate, // IN
      sDate, sDate, eDate, eDate, // OUT
      sDate, sDate, eDate, eDate, // ADJUST_IN
      sDate, sDate, eDate, eDate, // ADJUST_OUT
      sDate, sDate                // initial_stock
    ];

    if (category_id) {
      sql += ` AND i.category_id = ?`;
      params.push(category_id);
    }

    sql += ` GROUP BY ul.inventory_item_id, i.id, i.name, i.quantity, i.category_id, c.name_en, c.name_fr ORDER BY period_out DESC, item_name ASC`;

    const items = db.prepare(sql).all(...params);

    const usageReport = items.map(item => {
      const pIn = item.period_in || 0;
      const pOut = item.period_out || 0;
      const adjustIn = item.period_adjust_in || 0;
      const adjustOut = item.period_adjust_out || 0;
      const initial = Math.max(0, item.initial_stock || 0);
      const periodEndStock = initial + pIn - pOut + adjustIn - adjustOut;

      return {
        id: item.inventory_item_id,
        name: item.item_name,
        category_id: item.category_id,
        category: item.name_en ? { id: item.category_id, name_en: item.name_en, name_fr: item.name_fr } : null,
        received: pIn,
        usage: pOut,
        initial_stock: initial,
        current_stock: periodEndStock,   // Calculated balance for the period
        live_stock: item.live_stock ?? 0  // The real-time inventory quantity
      };
    });

    res.json(usageReport);
  } catch (error) {
    console.error('Error generating usage report:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get recent usage events with cumulative stock calculation
router.get('/usage-events', authenticateToken, (req, res) => {
  try {
    const { start_date, end_date, category_id, limit = 100 } = req.query;
    
    // We use a window function to calculate cumulative stock per item
    let sql = `
      WITH EventHistory AS (
        SELECT 
          ul.*,
          u.name as user_name,
          u.email as user_email,
          SUM(CASE WHEN ul.transaction_type IN ('IN', 'ADJUST_IN') THEN ul.quantity_changed ELSE -ul.quantity_changed END) 
            OVER (PARTITION BY ul.inventory_item_id ORDER BY ul.timestamp, ul.id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) as cumulative_stock,
          COALESCE(i.name, ul.item_name) as current_item_name
        FROM usage_logs ul
        LEFT JOIN users u ON ul.user_id = u.id
        LEFT JOIN inventory i ON ul.inventory_item_id = i.id
        WHERE 1=1
    `;
    const params = [];

    if (category_id) {
      sql += ` AND i.category_id = ?`;
      params.push(category_id);
    }

    sql += `
      )
      SELECT * FROM EventHistory
      WHERE 1=1
    `;

    if (start_date) {
      sql += ` AND timestamp >= ?`;
      params.push(start_date);
    }
    if (end_date) {
      sql += ` AND timestamp <= ?`;
      params.push(`${end_date} 23:59:59`);
    }

    sql += ` ORDER BY timestamp DESC LIMIT ?`;
    params.push(parseInt(limit));

    const logs = db.prepare(sql).all(...params);
    res.json(logs);
  } catch (error) {
    console.error('Error fetching usage events:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get low stock report
router.get('/low-stock', authenticateToken, (req, res) => {
  try {
    const sql = `
      SELECT i.*, c.id as cat_id, c.name_en, c.name_fr
      FROM inventory i
      LEFT JOIN categories c ON i.category = c.id
      WHERE i.quantity <= i.min_stock
      ORDER BY i.quantity ASC
    `;
    const itemsRaw = db.prepare(sql).all();

    const data = itemsRaw.map(item => ({
      ...item,
      category: item.cat_id ? { id: item.cat_id, name_en: item.name_en, name_fr: item.name_fr } : null
    }));

    res.json(data);
  } catch (error) {
    console.error('Error generating low stock report:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get inventory value report
router.get('/inventory-value', authenticateToken, (req, res) => {
  try {
    const { category_id } = req.query;

    let sql = `
      SELECT i.id, i.name, i.quantity, i.price, c.id as cat_id, c.name_en, c.name_fr
      FROM inventory i
      LEFT JOIN categories c ON i.category = c.id
      WHERE 1=1
    `;
    const params = [];

    if (category_id) {
      sql += ` AND i.category = ?`;
      params.push(category_id);
    }

    const itemsRaw = db.prepare(sql).all(...params);

    const itemsWithValue = itemsRaw.map(item => ({
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      price: item.price,
      total_value: item.quantity * item.price,
      category: item.cat_id ? { id: item.cat_id, name_en: item.name_en, name_fr: item.name_fr } : null
    }));

    const totalValue = itemsWithValue.reduce((sum, item) => sum + item.total_value, 0);

    res.json({
      items: itemsWithValue,
      totalValue,
      itemCount: itemsWithValue.length
    });
  } catch (error) {
    console.error('Error generating inventory value report:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get audit logs for export
router.get('/audit-logs', authenticateToken, (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    let sql = `
      SELECT al.*, u.email as user_email
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (start_date) {
      sql += ` AND al.timestamp >= ?`;
      params.push(start_date);
    }
    if (end_date) {
      sql += ` AND al.timestamp <= ?`;
      params.push(`${end_date} 23:59:59`);
    }

    sql += ` ORDER BY al.timestamp DESC`;

    const logs = db.prepare(sql).all(...params);
    res.json(logs);
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

export default router;
