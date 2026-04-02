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
    'suppliers',
    recordId,
    oldValues ? JSON.stringify(oldValues) : null,
    newValues ? JSON.stringify(newValues) : null,
    ipAddress
  );
};

// Get all active suppliers
router.get('/', authenticateToken, (req, res) => {
  try {
    const suppliers = db.prepare("SELECT * FROM suppliers WHERE status = 'active' ORDER BY name").all();
    res.json(suppliers);
  } catch (error) {
    console.error('Error fetching suppliers:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get single supplier
router.get('/:id', authenticateToken, (req, res) => {
  try {
    const supplier = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(req.params.id);

    if (!supplier) {
      return res.status(404).json({ message: 'Supplier not found' });
    }

    res.json(supplier);
  } catch (error) {
    console.error('Error fetching supplier:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Create supplier
router.post('/', authenticateToken, (req, res) => {
  try {
    const { name, contact, phone, email, address } = req.body;

    if (!name) {
      return res.status(400).json({ message: 'Supplier name is required' });
    }

    if (req.user.role === 'user') {
      return res.status(403).json({ message: 'Users cannot create suppliers' });
    }

    const id = crypto.randomUUID();

    db.prepare(
      'INSERT INTO suppliers (id, name, contact, phone, email, address, sync_status) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(id, name, contact || null, phone || null, email || null, address || null, 'pending');

    const newSupplier = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(id);

    // Write to sync queue
    db.prepare('INSERT INTO sync_queue (table_name, record_id, action, data) VALUES (?, ?, ?, ?)').run(
      'suppliers',
      id,
      'INSERT',
      JSON.stringify(newSupplier)
    );

    logAudit(req.user.id, 'created', id, null, newSupplier, req.ip);

    res.status(201).json(newSupplier);
  } catch (error) {
    console.error('Error creating supplier:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update supplier
router.put('/:id', authenticateToken, (req, res) => {
  try {
    const { id } = req.params;
    const { name, contact, phone, email, address } = req.body;

    if (req.user.role === 'user') {
      return res.status(403).json({ message: 'Users cannot update suppliers' });
    }

    const oldSupplier = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(id);

    if (!oldSupplier) {
      return res.status(404).json({ message: 'Supplier not found' });
    }

    db.prepare(
      'UPDATE suppliers SET name = ?, contact = ?, phone = ?, email = ?, address = ?, sync_status = ?, sync_updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(name, contact || null, phone || null, email || null, address || null, 'pending', id);

    const updatedSupplier = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(id);

    db.prepare('INSERT INTO sync_queue (table_name, record_id, action, data) VALUES (?, ?, ?, ?)').run(
      'suppliers',
      id,
      'UPDATE',
      JSON.stringify(updatedSupplier)
    );

    logAudit(req.user.id, 'updated', id, oldSupplier, updatedSupplier, req.ip);

    res.json(updatedSupplier);
  } catch (error) {
    console.error('Error updating supplier:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Delete supplier
router.delete('/:id', authenticateToken, (req, res) => {
  try {
    const { id } = req.params;

    if (req.user.role === 'user') {
      return res.status(403).json({ message: 'Users cannot delete suppliers' });
    }

    // Check if supplier has orders (optional now since archiving doesn't break relationships, but we'll leave it as you requested archiving instead of deletion explicitly)
    // Actually, if we archive, having orders is fine. We just hide them from the dropdown.

    const supplier = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(id);

    if (!supplier) {
      return res.status(404).json({ message: 'Supplier not found' });
    }

    db.prepare("UPDATE suppliers SET status = 'archived', sync_status = 'pending', sync_updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);

    const updatedSupplier = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(id);

    db.prepare('INSERT INTO sync_queue (table_name, record_id, action, data) VALUES (?, ?, ?, ?)').run(
      'suppliers',
      id,
      'UPDATE',
      JSON.stringify(updatedSupplier)
    );

    logAudit(req.user.id, 'deleted', id, supplier, null, req.ip);

    res.json({ message: 'Supplier deleted successfully' });
  } catch (error) {
    console.error('Error deleting supplier:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

export default router;
