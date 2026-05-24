import express from 'express';
import db from '../database.js';
import { authenticateToken } from '../middleware/auth.js';
import * as crypto from 'crypto';

const router = express.Router();

router.get('/', authenticateToken, (req, res) => {
  try {
    const invoices = db.prepare('SELECT * FROM invoices WHERE is_archived = 0 ORDER BY created_at DESC').all();
    res.json(invoices);
  } catch (error) {
    console.error('[Invoices API] Get error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

router.post('/', authenticateToken, (req, res) => {
  const { client_id, order_id, due_date, total_amount, paid_amount, status, notes } = req.body;
  if (!client_id) return res.status(400).json({ error: 'Client ID is required' });

  try {
    const newId = crypto.randomUUID();
    db.prepare(
      'INSERT INTO invoices (id, client_id, order_id, due_date, total_amount, paid_amount, status, notes, created_by, sync_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      newId,
      client_id,
      order_id || null,
      due_date || null,
      parseFloat(total_amount) || 0,
      parseFloat(paid_amount) || 0,
      status || 'draft',
      notes || '',
      req.user?.name || 'System',
      'pending'
    );

    const newInvoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(newId);

    try {
      db.prepare('INSERT INTO sync_queue (table_name, record_id, action, data) VALUES (?, ?, ?, ?)').run(
        'invoices', newId, 'INSERT', JSON.stringify(newInvoice)
      );
    } catch (e) { }

    res.status(201).json(newInvoice);
  } catch (error) {
    console.error('[Invoices API] Create error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

router.put('/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { status, paid_amount, due_date, notes } = req.body;

  try {
    const existing = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Invoice not found' });

    db.prepare(
      'UPDATE invoices SET status = ?, paid_amount = ?, due_date = ?, notes = ?, sync_status = ?, sync_updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(
      status || existing.status,
      paid_amount !== undefined ? parseFloat(paid_amount) : existing.paid_amount,
      due_date || existing.due_date,
      notes !== undefined ? notes : existing.notes,
      'pending',
      id
    );

    const updated = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);

    try {
      db.prepare('INSERT INTO sync_queue (table_name, record_id, action, data) VALUES (?, ?, ?, ?)').run(
        'invoices', id, 'UPDATE', JSON.stringify(updated)
      );
    } catch (e) { }

    res.json(updated);
  } catch (error) {
    console.error('[Invoices API] Update error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

router.delete('/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  try {
    db.prepare('UPDATE invoices SET is_archived = 1, sync_status = ?, sync_updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('pending', id);
    const updated = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
    
    try {
      db.prepare('INSERT INTO sync_queue (table_name, record_id, action, data) VALUES (?, ?, ?, ?)').run(
        'invoices', id, 'UPDATE', JSON.stringify(updated)
      );
    } catch (e) {}

    res.json({ message: 'Invoice archived', invoice: updated });
  } catch (error) {
    console.error('[Invoices API] Archive error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

export default router;
