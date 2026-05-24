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

router.post('/seed-ohada', authenticateToken, (req, res) => {
  const standardAccounts = [
    { name: '1010 - Capital Social', type: 'equity', balance: 0, currency: 'GNF' },
    { name: '2450 - Matériel de Transport (Camions)', type: 'asset', balance: 0, currency: 'GNF' },
    { name: '2411 - Matériel de Production', type: 'asset', balance: 0, currency: 'GNF' },
    { name: '3210 - Stocks de Matières Premières & Consommables', type: 'asset', balance: 0, currency: 'GNF' },
    { name: '4110 - Clients (Factures à recevoir)', type: 'asset', balance: 0, currency: 'GNF' },
    { name: '4010 - Fournisseurs (Dettes d\'exploitation)', type: 'liability', balance: 0, currency: 'GNF' },
    { name: '5211 - Banques Locales GNF', type: 'asset', balance: 0, currency: 'GNF' },
    { name: '5711 - Caisse Principale', type: 'asset', balance: 0, currency: 'GNF' },
    { name: '6011 - Achats de Pièces de Rechange', type: 'expense', balance: 0, currency: 'GNF' },
    { name: '6012 - Achats de Carburants et Lubrifiants', type: 'expense', balance: 0, currency: 'GNF' },
    { name: '6241 - Frais de Transport sur Ventes', type: 'expense', balance: 0, currency: 'GNF' },
    { name: '7011 - Ventes de Granite (Production)', type: 'revenue', balance: 0, currency: 'GNF' },
    { name: '7060 - Prestations de Services de Transport', type: 'revenue', balance: 0, currency: 'GNF' }
  ];

  try {
    const inserted = [];
    const stmt = db.prepare(
      'INSERT INTO accounts (id, name, type, balance, currency, sync_status) VALUES (?, ?, ?, ?, ?, ?)'
    );

    const transaction = db.transaction((accountsList) => {
      for (const acc of accountsList) {
        const exists = db.prepare('SELECT id FROM accounts WHERE name = ? AND is_archived = 0').get(acc.name);
        if (!exists) {
          const id = crypto.randomUUID();
          stmt.run(id, acc.name, acc.type, acc.balance, acc.currency, 'pending');
          const created = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id);
          inserted.push(created);
          try {
            db.prepare('INSERT INTO sync_queue (table_name, record_id, action, data) VALUES (?, ?, ?, ?)').run(
              'accounts', id, 'INSERT', JSON.stringify(created)
            );
          } catch (e) {}
        }
      }
    });

    transaction(standardAccounts);
    res.json({ success: true, seededCount: inserted.length, seeded: inserted });
  } catch (error) {
    console.error('[Accounts API] Seed OHADA error:', error);
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
