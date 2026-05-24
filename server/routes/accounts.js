import express from 'express';
import db from '../database.js';
import { authenticateToken } from '../middleware/auth.js';
import * as crypto from 'crypto';

const router = express.Router();

router.get('/', authenticateToken, (req, res) => {
  try {
    const accounts = db.prepare('SELECT * FROM accounts WHERE is_archived = 0 ORDER BY name ASC').all();
    res.json(accounts);
  } catch (error) {
    console.error('[Accounts API] Get error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

router.post('/', authenticateToken, (req, res) => {
  const { name, type, balance, currency } = req.body;
  if (!name || !type) return res.status(400).json({ error: 'Name and type are required' });

  try {
    const newId = crypto.randomUUID();
    db.prepare(
      'INSERT INTO accounts (id, name, type, balance, currency, sync_status) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(newId, name.trim(), type, balance ? parseFloat(balance) : 0, currency || 'GNF', 'pending');

    const newAccount = db.prepare('SELECT * FROM accounts WHERE id = ?').get(newId);

    try {
      db.prepare('INSERT INTO sync_queue (table_name, record_id, action, data) VALUES (?, ?, ?, ?)').run(
        'accounts', newId, 'INSERT', JSON.stringify(newAccount)
      );
    } catch (e) {
      console.warn('[Accounts API] Sync queue write failed:', e.message);
    }

    res.status(201).json(newAccount);
  } catch (error) {
    console.error('[Accounts API] Create error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

router.put('/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { name, type, balance, currency } = req.body;

  try {
    const existing = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Account not found' });

    db.prepare(
      'UPDATE accounts SET name = ?, type = ?, balance = ?, currency = ?, sync_status = ?, sync_updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(
      name ? name.trim() : existing.name,
      type || existing.type,
      balance !== undefined ? parseFloat(balance) : existing.balance,
      currency || existing.currency,
      'pending',
      id
    );

    const updated = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id);

    try {
      db.prepare('INSERT INTO sync_queue (table_name, record_id, action, data) VALUES (?, ?, ?, ?)').run(
        'accounts', id, 'UPDATE', JSON.stringify(updated)
      );
    } catch (e) {
      console.warn('[Accounts API] Sync queue write failed:', e.message);
    }

    res.json(updated);
  } catch (error) {
    console.error('[Accounts API] Update error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

router.delete('/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  try {
    db.prepare('UPDATE accounts SET is_archived = 1, sync_status = ?, sync_updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('pending', id);
    const updated = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id);
    
    try {
      db.prepare('INSERT INTO sync_queue (table_name, record_id, action, data) VALUES (?, ?, ?, ?)').run(
        'accounts', id, 'UPDATE', JSON.stringify(updated)
      );
    } catch (e) {}

    res.json({ message: 'Account archived', account: updated });
  } catch (error) {
    console.error('[Accounts API] Archive error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

export default router;
