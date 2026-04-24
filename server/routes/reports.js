import express from 'express';
import db from '../database.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Get usage report
router.get('/usage', authenticateToken, (req, res) => {
  try {
    const { start_date, end_date, category_id } = req.query;

    let sql = `
      SELECT 
        ul.inventory_item_id, 
        ul.item_name,
        -- Historical sums (before start_date)
        SUM(CASE WHEN ul.transaction_type = 'IN' AND (? IS NULL OR ul.timestamp < ?) THEN ul.quantity_changed ELSE 0 END) as historical_in,
        SUM(CASE WHEN ul.transaction_type = 'OUT' AND (? IS NULL OR ul.timestamp < ?) THEN ABS(ul.quantity_changed) ELSE 0 END) as historical_out,
        -- Period sums (between start_date and end_date)
        SUM(CASE WHEN ul.transaction_type = 'IN' AND (? IS NULL OR ul.timestamp >= ?) AND (? IS NULL OR ul.timestamp <= ?) THEN ul.quantity_changed ELSE 0 END) as period_in,
        SUM(CASE WHEN ul.transaction_type = 'OUT' AND (? IS NULL OR ul.timestamp >= ?) AND (? IS NULL OR ul.timestamp <= ?) THEN ABS(ul.quantity_changed) ELSE 0 END) as period_out,
        i.category_id,
        c.name_en,
        c.name_fr
      FROM usage_logs ul
      LEFT JOIN inventory i ON ul.inventory_item_id = i.id
      LEFT JOIN categories c ON i.category_id = c.id
      WHERE 1=1
    `;
    const params = [
      start_date || null, start_date || null,
      start_date || null, start_date || null,
      start_date || null, start_date || null, end_date ? `${end_date} 23:59:59` : null, end_date ? `${end_date} 23:59:59` : null,
      start_date || null, start_date || null, end_date ? `${end_date} 23:59:59` : null, end_date ? `${end_date} 23:59:59` : null
    ];

    if (category_id) {
      sql += ` AND (i.category_id = ? OR i.category_id IS NULL)`; // Include orphans if they match via name? No, just match by ID
      params.push(category_id);
    }

    sql += ` GROUP BY ul.inventory_item_id, ul.item_name ORDER BY period_out DESC, ul.item_name ASC`;

    const items = db.prepare(sql).all(...params);

    const usageReport = items.map(item => {
      const historicalIn = item.historical_in || 0;
      const historicalOut = item.historical_out || 0;
      const periodIn = item.period_in || 0;
      const periodOut = item.period_out || 0;
      
      // Stock at the exact start of the date range
      const initialStock = historicalIn - historicalOut;
      
      // Current stock calculated dynamically from ledger
      const calculatedCurrentStock = initialStock + periodIn - periodOut;
      
      // Total available to be used during this specific period
      const availableStock = initialStock + periodIn;
      
      return {
        id: item.inventory_item_id,
        name: item.item_name,
        category_id: item.category_id,
        category: item.name_en ? { id: item.category_id, name_en: item.name_en, name_fr: item.name_fr } : null,
        initial_stock: Math.max(initialStock, 0), 
        received: periodIn,
        usage: periodOut,
        current_stock: Math.max(calculatedCurrentStock, 0),
        usage_percentage: availableStock > 0
          ? ((periodOut / availableStock) * 100).toFixed(2)
          : 0
      };
    });



    res.json(usageReport);
  } catch (error) {
    console.error('Error generating usage report:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get recent usage events
router.get('/usage-events', authenticateToken, (req, res) => {
  try {
    const { start_date, end_date, category_id, limit = 100 } = req.query;
    
    let sql = `
      SELECT ul.*, u.name as user_name, u.email as user_email
      FROM usage_logs ul
      LEFT JOIN users u ON ul.user_id = u.id
      JOIN inventory i ON ul.inventory_item_id = i.id
      WHERE 1=1
    `;
    const params = [];

    if (start_date) {
      sql += ` AND ul.timestamp >= ?`;
      params.push(start_date);
    }
    if (end_date) {
      sql += ` AND ul.timestamp <= ?`;
      params.push(`${end_date} 23:59:59`);
    }
    if (category_id) {
      sql += ` AND i.category_id = ?`;
      params.push(category_id);
    }

    sql += ` ORDER BY ul.timestamp DESC LIMIT ?`;
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
      // Add end of day for comparison
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
