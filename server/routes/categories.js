import express from 'express';
import db from '../database.js';
import { authenticateToken } from '../middleware/auth.js';
import crypto from 'crypto';

const router = express.Router();

const logAudit = (userId, action, recordId, oldValues, newValues, ipAddress) => {
  db.prepare(
    'INSERT INTO audit_logs (user_id, action, table_name, record_id, old_values, new_values, ip_address) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(
    userId,
    action,
    'categories',
    recordId,
    oldValues ? JSON.stringify(oldValues) : null,
    newValues ? JSON.stringify(newValues) : null,
    ipAddress
  );
};

// Get all categories
router.get('/', authenticateToken, (req, res) => {
  try {
    const includeArchived = req.query.include_archived === 'true';
    const query = includeArchived 
      ? 'SELECT * FROM categories ORDER BY name_en'
      : 'SELECT * FROM categories WHERE is_archived = 0 ORDER BY name_en';
    
    const categories = db.prepare(query).all();
    res.json(categories);
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get single category
router.get('/:id', authenticateToken, (req, res) => {
  try {
    const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);

    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    res.json(category);
  } catch (error) {
    console.error('Error fetching category:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Create category (admin only)
router.post('/', authenticateToken, (req, res) => {
  try {
    const { name_en, name_fr } = req.body;

    if (!name_en || !name_fr) {
      return res.status(400).json({ message: 'Both English and French names are required' });
    }

    if (req.user.role !== 'admin') {
       return res.status(403).json({ message: 'Only admins can insert categories' });
    }

    const id = crypto.randomUUID();

    db.prepare('INSERT INTO categories (id, name_en, name_fr, sync_status, is_archived) VALUES (?, ?, ?, ?, 0)').run(
      id, name_en, name_fr, 'pending'
    );

    const newCategory = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);

    // Write to sync queue
    db.prepare('INSERT INTO sync_queue (table_name, record_id, action, data) VALUES (?, ?, ?, ?)').run(
      'categories',
      id,
      'INSERT',
      JSON.stringify(newCategory)
    );

    logAudit(req.user.id, 'created', id, null, newCategory, req.ip);

    res.status(201).json(newCategory);
  } catch (error) {
    console.error('Error creating category:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update category (admin only)
router.put('/:id', authenticateToken, (req, res) => {
  try {
    const { id } = req.params;
    const { name_en, name_fr } = req.body;

    if (req.user.role !== 'admin') {
       return res.status(403).json({ message: 'Only admins can update categories' });
    }

    const oldCategory = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);

    if (!oldCategory) {
      return res.status(404).json({ message: 'Category not found' });
    }

    db.prepare(
      'UPDATE categories SET name_en = ?, name_fr = ?, sync_status = ?, sync_updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(name_en, name_fr, 'pending', id);

    const updatedCategory = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);

    // Write to sync queue
    db.prepare('INSERT INTO sync_queue (table_name, record_id, action, data) VALUES (?, ?, ?, ?)').run(
      'categories',
      id,
      'UPDATE',
      JSON.stringify(updatedCategory)
    );

    logAudit(req.user.id, 'updated', id, oldCategory, updatedCategory, req.ip);

    res.json(updatedCategory);
  } catch (error) {
    console.error('Error updating category:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Soft Delete category (admin only)
router.delete('/:id', authenticateToken, (req, res) => {
  try {
    const { id } = req.params;

    if (req.user.role !== 'admin') {
       return res.status(403).json({ message: 'Only admins can delete categories' });
    }

    const inventoryCheck = db.prepare('SELECT id FROM inventory WHERE category_id = ? LIMIT 1').get(id);
    if (inventoryCheck) {
      return res.status(400).json({ message: 'Cannot delete category that is in use by inventory items' });
    }
    
    const inventoryCheckStr = db.prepare('SELECT id FROM inventory WHERE category = ? LIMIT 1').get(id);
    if (inventoryCheckStr) {
      return res.status(400).json({ message: 'Cannot delete category that is in use by inventory items' });
    }

    const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);

    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    db.prepare('UPDATE categories SET is_archived = 1, sync_status = ?, sync_updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('pending', id);
    const updatedCategory = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);

    // Write to sync queue
    db.prepare('INSERT INTO sync_queue (table_name, record_id, action, data) VALUES (?, ?, ?, ?)').run(
      'categories',
      id,
      'UPDATE',
      JSON.stringify(updatedCategory)
    );

    logAudit(req.user.id, 'archived', id, category, updatedCategory, req.ip);

    res.json({ message: 'Category archived successfully' });
  } catch (error) {
    console.error('Error deleting category:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Restore category (admin only)
router.patch('/:id/restore', authenticateToken, (req, res) => {
  try {
    const { id } = req.params;

    if (req.user.role !== 'admin') {
       return res.status(403).json({ message: 'Only admins can restore categories' });
    }

    const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);

    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    db.prepare('UPDATE categories SET is_archived = 0, sync_status = ?, sync_updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('pending', id);
    const updatedCategory = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);

    db.prepare('INSERT INTO sync_queue (table_name, record_id, action, data) VALUES (?, ?, ?, ?)').run(
      'categories',
      id,
      'UPDATE',
      JSON.stringify(updatedCategory)
    );

    logAudit(req.user.id, 'restored', id, category, updatedCategory, req.ip);

    res.json({ message: 'Category restored successfully', category: updatedCategory });
  } catch (error) {
    console.error('Error restoring category:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Permanent Delete category (admin only)
router.delete('/:id/permanent', authenticateToken, (req, res) => {
  try {
    const { id } = req.params;

    if (req.user.role !== 'admin') {
       return res.status(403).json({ message: 'Only admins can permanently delete categories' });
    }

    const inventoryCheck = db.prepare('SELECT id FROM inventory WHERE category_id = ? LIMIT 1').get(id);
    if (inventoryCheck) {
      return res.status(400).json({ message: 'Cannot delete category that is in use by inventory items' });
    }
    
    const inventoryCheckStr = db.prepare('SELECT id FROM inventory WHERE category = ? LIMIT 1').get(id);
    if (inventoryCheckStr) {
      return res.status(400).json({ message: 'Cannot delete category that is in use by inventory items' });
    }

    const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);

    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    db.prepare('DELETE FROM categories WHERE id = ?').run(id);

    // Write to sync queue
    db.prepare('INSERT INTO sync_queue (table_name, record_id, action, data) VALUES (?, ?, ?, ?)').run(
      'categories',
      id,
      'DELETE',
      JSON.stringify(category)
    );

    logAudit(req.user.id, 'deleted_permanently', id, category, null, req.ip);

    res.json({ message: 'Category permanently deleted successfully' });
  } catch (error) {
    console.error('Error permanently deleting category:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

export default router;
