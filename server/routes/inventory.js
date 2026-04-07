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

export const logUsage = (userId, inventoryId, itemName, oldQty, newQty, transactionType = 'OUT', authName = null, authTitle = null, truckId = null) => {
  const quantityChanged = Math.abs(oldQty - newQty);
  if (quantityChanged === 0) return;

  const result = db.prepare(
    'INSERT INTO usage_logs (inventory_item_id, item_name, quantity_changed, previous_quantity, new_quantity, user_id, transaction_type, authorized_by_name, authorized_by_title, truck_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(inventoryId, itemName, quantityChanged, oldQty, newQty, userId, transactionType, authName, authTitle, truckId);

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
    const { limit = 50, offset = 0, search = '', category_id, archived } = req.query;
    
    let sql = `
      SELECT i.*, c.name_en, c.name_fr, s.name as supplier_name
      FROM inventory i
      LEFT JOIN categories c ON i.category_id = c.id
      LEFT JOIN suppliers s ON i.supplier = s.id
      WHERE 1=1
    `;
    const params = [];

    const isArchived = archived === 'true' ? 1 : 0;
    sql += ` AND i.is_archived = ?`;
    params.push(isArchived);

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
      const { authorized_by_name, authorized_by_title, truck_id } = req.body;
      logUsage(req.user.id, id, updatedItem.name, oldItem.quantity, updatedItem.quantity, 'OUT', authorized_by_name, authorized_by_title, truck_id);
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
    const totalItems = db.prepare('SELECT COUNT(*) as count FROM inventory WHERE is_archived = 0').get().count;
    const lowStockItems = db.prepare('SELECT COUNT(*) as count FROM inventory WHERE quantity <= min_stock AND quantity > 0 AND is_archived = 0').get().count;
    const outOfStockItems = db.prepare('SELECT COUNT(*) as count FROM inventory WHERE quantity = 0 AND is_archived = 0').get().count;
    const totalValue = db.prepare('SELECT SUM(quantity * price) as value FROM inventory WHERE is_archived = 0').get().value || 0;

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

// Breakdown by category: item count + total units per category
router.get('/stats/by-category', authenticateToken, (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT
        COALESCE(c.name_en, 'Uncategorized') AS category_en,
        COALESCE(c.name_fr, 'Non classé')    AS category_fr,
        COUNT(i.id)                           AS item_count,
        COALESCE(SUM(i.quantity), 0)          AS total_units
      FROM inventory i
      LEFT JOIN categories c ON i.category_id = c.id
      WHERE i.is_archived = 0
      GROUP BY COALESCE(c.name_en, 'Uncategorized')
      ORDER BY item_count DESC
    `).all();
    res.json(rows);
  } catch (error) {
    console.error('Stats by-category error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

// Low-stock items: quantity > 0 but at or below min_stock threshold
router.get('/stats/low-stock', authenticateToken, (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT
        i.id, i.name, i.quantity, i.min_stock,
        COALESCE(c.name_en, 'Uncategorized') AS category_en,
        COALESCE(c.name_fr, 'Non classé')    AS category_fr
      FROM inventory i
      LEFT JOIN categories c ON i.category_id = c.id
      WHERE i.quantity <= i.min_stock AND i.quantity > 0 AND i.is_archived = 0
      ORDER BY (i.quantity * 1.0 / NULLIF(i.min_stock, 0)) ASC
    `).all();
    res.json(rows);
  } catch (error) {
    console.error('Stats low-stock error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

// Out-of-stock items: quantity = 0
router.get('/stats/out-of-stock', authenticateToken, (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT
        i.id, i.name, i.quantity, i.min_stock,
        COALESCE(c.name_en, 'Uncategorized') AS category_en,
        COALESCE(c.name_fr, 'Non classé')    AS category_fr
      FROM inventory i
      LEFT JOIN categories c ON i.category_id = c.id
      WHERE i.quantity = 0 AND i.is_archived = 0
      ORDER BY i.name ASC
    `).all();
    res.json(rows);
  } catch (error) {
    console.error('Stats out-of-stock error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

router.put('/:id/archive', authenticateToken, (req, res) => {
  const { id } = req.params;
  try {
    const item = db.prepare('SELECT * FROM inventory WHERE id = ?').get(id);
    if (!item) return res.status(404).json({ error: 'Item not found' });

    db.prepare('UPDATE inventory SET is_archived = 1, sync_status = ?, sync_updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('pending', id);
    const updated = db.prepare('SELECT * FROM inventory WHERE id = ?').get(id);
    db.prepare('INSERT INTO sync_queue (table_name, record_id, action, data) VALUES (?, ?, ?, ?)').run('inventory', id, 'UPDATE', JSON.stringify(updated));

    logAudit(req.user.id, 'archived', id, item, updated, req.ip);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

router.put('/:id/restore', authenticateToken, (req, res) => {
  const { id } = req.params;
  try {
    const item = db.prepare('SELECT * FROM inventory WHERE id = ?').get(id);
    if (!item) return res.status(404).json({ error: 'Item not found' });

    db.prepare('UPDATE inventory SET is_archived = 0, sync_status = ?, sync_updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('pending', id);
    const updated = db.prepare('SELECT * FROM inventory WHERE id = ?').get(id);
    db.prepare('INSERT INTO sync_queue (table_name, record_id, action, data) VALUES (?, ?, ?, ?)').run('inventory', id, 'UPDATE', JSON.stringify(updated));

    logAudit(req.user.id, 'restored', id, item, updated, req.ip);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

export default router;
