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
        SUM(ul.quantity_changed) as usage,
        i.quantity,
        i.min_stock,
        i.category_id,
        c.name_en,
        c.name_fr
      FROM usage_logs ul
      JOIN inventory i ON ul.inventory_item_id = i.id
      LEFT JOIN categories c ON i.category_id = c.id
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

    sql += ` GROUP BY ul.inventory_item_id ORDER BY usage DESC`;

    const items = db.prepare(sql).all(...params);

    const usageReport = items.map(item => ({
      id: item.inventory_item_id,
      name: item.item_name,
      category_id: item.category_id,
      category: item.name_en ? { id: item.category_id, name_en: item.name_en, name_fr: item.name_fr } : null,
      quantity: item.quantity,
      min_stock: item.min_stock,
      usage: item.usage,
      usage_percentage: item.quantity > 0
        ? ((item.usage / (item.quantity + item.usage)) * 100).toFixed(2)
        : 100
    }));

    res.json(usageReport);
  } catch (error) {
    console.error('Error generating usage report:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get recent usage events
router.get('/usage-events', authenticateToken, (req, res) => {
  try {
    const { limit = 50 } = req.query;
    
    const logs = db.prepare(`
      SELECT ul.*, u.name as user_name, u.email as user_email
      FROM usage_logs ul
      LEFT JOIN users u ON ul.user_id = u.id
      ORDER BY ul.timestamp DESC
      LIMIT ?
    `).all(limit);

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
