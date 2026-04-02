import express from 'express';
import db from '../database.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

const logAudit = (userId, action, recordId, oldValues, newValues, ipAddress) => {
  db.prepare(
    'INSERT INTO audit_logs (user_id, action, table_name, record_id, old_values, new_values, ip_address) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(
    userId,
    action,
    'inventory',
    recordId,
    oldValues ? JSON.stringify(oldValues) : null,
    newValues ? JSON.stringify(newValues) : null,
    ipAddress
  );
};

const logUsage = (userId, inventoryId, itemName, oldQty, newQty) => {
  const quantityChanged = oldQty - newQty;
  if (quantityChanged <= 0) return; // Only log stock reduction as usage

  const result = db.prepare(
    'INSERT INTO usage_logs (inventory_item_id, item_name, quantity_changed, previous_quantity, new_quantity, user_id) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(inventoryId, itemName, quantityChanged, oldQty, newQty, userId);

  const usageLog = db.prepare('SELECT * FROM usage_logs WHERE id = ?').get(result.lastInsertRowid);

  // Add to sync queue
  db.prepare('INSERT INTO sync_queue (table_name, record_id, action, data) VALUES (?, ?, ?, ?)').run(
    'usage_logs',
    result.lastInsertRowid,
    'INSERT',
    JSON.stringify(usageLog)
  );
};

const isEditingFrozen = (userRole) => {
  const today = new Date();
  const dayOfMonth = today.getDate();
  return dayOfMonth > 15 && userRole === 'user';
};

router.get('/', authenticateToken, (req, res) => {
  try {
    const { limit = 50, offset = 0, search = '', category_id } = req.query;
    
    let sql = `
      SELECT i.*, c.name_en, c.name_fr, s.name as supplier_name
      FROM inventory i
      LEFT JOIN categories c ON i.category_id = c.id
      LEFT JOIN suppliers s ON i.supplier = s.id
      WHERE 1=1
    `;
    const params = [];

    if (search) {
      sql += ` AND (i.name LIKE ? OR i.location LIKE ? OR s.name LIKE ? OR c.name_en LIKE ? OR c.name_fr LIKE ?)`;
      const searchParam = `%${search}%`;
      params.push(searchParam, searchParam, searchParam, searchParam, searchParam);
    }

    if (category_id) {
      sql += ` AND i.category_id = ?`;
      params.push(category_id);
    }

    sql += ` ORDER BY i.last_updated DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), parseInt(offset));

    const items = db.prepare(sql).all(...params);
    
    // Also get total count for pagination metadata
    let countSql = `SELECT COUNT(*) as count FROM inventory i LEFT JOIN suppliers s ON i.supplier = s.id LEFT JOIN categories c ON i.category_id = c.id WHERE 1=1`;
    const countParams = [];
    if (search) {
      countSql += ` AND (i.name LIKE ? OR i.location LIKE ? OR s.name LIKE ? OR c.name_en LIKE ? OR c.name_fr LIKE ?)`;
      countParams.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (category_id) {
      countSql += ` AND i.category_id = ?`;
      countParams.push(category_id);
    }
    const totalCount = db.prepare(countSql).get(...countParams).count;

    // Map joined columns into a category and supplier object for the frontend
    const mappedItems = items.map(item => ({
      ...item,
      category: item.category_id ? {
        id: item.category_id,
        name_en: item.name_en,
        name_fr: item.name_fr
      } : null,
      supplier_name: item.supplier_name || item.supplier // Fallback to raw value if join fails
    }));
    
    res.json({
      items: mappedItems,
      totalCount,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Get inventory error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

router.get('/:id', authenticateToken, (req, res) => {
  const { id } = req.params;

  try {
    const item = db.prepare('SELECT * FROM inventory WHERE id = ?').get(id);

    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    res.json(item);
  } catch (error) {
    console.error('Get inventory item error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

router.post('/', authenticateToken, (req, res) => {
  const { name, category, category_id, quantity, price, supplier, location, min_stock, max_stock } = req.body;

  // Validation: at least one of category or category_id must be present
  if (!name || (!category && !category_id) || quantity === undefined || price === undefined || !location) {
    return res.status(400).json({ error: 'Required fields missing', details: { name, category, category_id, quantity, price, location } });
  }

  try {
    const result = db.prepare(
      'INSERT INTO inventory (name, category, category_id, quantity, price, supplier, location, min_stock, max_stock, sync_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      name,
      category || 'Uncategorized', // Fallback for the NOT NULL column
      category_id || null,
      quantity,
      price,
      supplier || null,
      location,
      min_stock || 10,
      max_stock || 100,
      'pending'
    );

    const newItem = db.prepare('SELECT * FROM inventory WHERE id = ?').get(result.lastInsertRowid);

    // Write to sync queue
    db.prepare('INSERT INTO sync_queue (table_name, record_id, action, data) VALUES (?, ?, ?, ?)').run(
      'inventory',
      result.lastInsertRowid,
      'INSERT',
      JSON.stringify(newItem)
    );

    logAudit(req.user.id, 'created', result.lastInsertRowid, null, newItem, req.ip);

    res.status(201).json(newItem);
  } catch (error) {
    console.error('Create inventory error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

router.put('/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { name, category, category_id, quantity, price, supplier, location, min_stock, max_stock } = req.body;

  if (isEditingFrozen(req.user.role)) {
    return res.status(403).json({ error: 'Editing is frozen after the 15th of the month' });
  }

  if (!name || (!category && !category_id) || quantity === undefined || price === undefined || !location) {
    return res.status(400).json({ error: 'Required fields missing', details: { name, category, category_id, quantity, price, location } });
  }

  try {
    const oldItem = db.prepare('SELECT * FROM inventory WHERE id = ?').get(id);

    if (!oldItem) {
      return res.status(404).json({ error: 'Item not found' });
    }

    db.prepare(
      'UPDATE inventory SET name = ?, category = ?, category_id = ?, quantity = ?, price = ?, supplier = ?, location = ?, min_stock = ?, max_stock = ?, last_updated = CURRENT_TIMESTAMP, sync_status = ?, sync_updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(
      name, 
      category || oldItem.category, 
      category_id || oldItem.category_id, 
      quantity, 
      price, 
      supplier || null, 
      location, 
      min_stock || 10, 
      max_stock || 100, 
      'pending', 
      id
    );

    const updatedItem = db.prepare('SELECT * FROM inventory WHERE id = ?').get(id);

    // Write to sync queue
    db.prepare('INSERT INTO sync_queue (table_name, record_id, action, data) VALUES (?, ?, ?, ?)').run(
      'inventory',
      id,
      'UPDATE',
      JSON.stringify(updatedItem)
    );

    logAudit(req.user.id, 'updated', id, oldItem, updatedItem, req.ip);

    // Explicitly log usage if quantity decreased
    if (oldItem.quantity > updatedItem.quantity) {
      logUsage(req.user.id, id, updatedItem.name, oldItem.quantity, updatedItem.quantity);
    }

    res.json(updatedItem);
  } catch (error) {
    console.error('Update inventory error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

router.delete('/:id', authenticateToken, (req, res) => {
  const { id } = req.params;

  if (isEditingFrozen(req.user.role)) {
    return res.status(403).json({ error: 'Editing is frozen after the 15th of the month' });
  }

  try {
    const item = db.prepare('SELECT * FROM inventory WHERE id = ?').get(id);

    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    db.prepare('DELETE FROM inventory WHERE id = ?').run(id);

    // Write to sync queue
    db.prepare('INSERT INTO sync_queue (table_name, record_id, action, data) VALUES (?, ?, ?, ?)').run(
      'inventory',
      id,
      'DELETE',
      JSON.stringify(item)
    );

    logAudit(req.user.id, 'deleted', id, item, null, req.ip);

    res.json({ message: 'Item deleted successfully' });
  } catch (error) {
    console.error('Delete inventory error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

router.get('/stats/summary', authenticateToken, (req, res) => {
  try {
    const totalItems = db.prepare('SELECT COUNT(*) as count FROM inventory').get().count;
    const lowStockItems = db.prepare('SELECT COUNT(*) as count FROM inventory WHERE quantity <= min_stock AND quantity > 0').get().count;
    const outOfStockItems = db.prepare('SELECT COUNT(*) as count FROM inventory WHERE quantity = 0').get().count;
    const totalValue = db.prepare('SELECT SUM(quantity * price) as value FROM inventory').get().value || 0;

    res.json({
      totalItems,
      lowStockItems,
      outOfStockItems,
      totalValue: parseFloat(totalValue.toFixed(2)),
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

export default router;
