import express from 'express';
import db from '../database.js';
import { authenticateToken } from '../middleware/auth.js';
import * as crypto from 'crypto';

const router = express.Router();

router.get('/', authenticateToken, (req, res) => {
  try {
    const transactions = db.prepare(`
      SELECT t.*, a.name as account_name, a.type as account_type 
      FROM transactions t
      LEFT JOIN accounts a ON t.account_id = a.id
      WHERE t.is_archived = 0 
      ORDER BY t.transaction_date DESC
    `).all();
    res.json(transactions);
  } catch (error) {
    console.error('[Transactions API] Get error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

router.post('/', authenticateToken, (req, res) => {
  const { account_id, invoice_id, amount, type, transaction_date, description, reference } = req.body;
  
  if (!account_id || !amount || !type) {
    return res.status(400).json({ error: 'Account ID, amount, and type are required' });
  }

  try {
    // 1. Verify account exists
    const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(account_id);
    if (!account) return res.status(404).json({ error: 'Account not found' });

    const newId = crypto.randomUUID();
    const parsedAmount = parseFloat(amount);
    
    db.transaction(() => {
      // 2. Insert transaction
      db.prepare(
        'INSERT INTO transactions (id, account_id, invoice_id, amount, type, transaction_date, description, reference, created_by, sync_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(
        newId,
        account_id,
        invoice_id || null,
        parsedAmount,
        type,
        transaction_date || new Date().toISOString(),
        description || '',
        reference || '',
        req.user?.name || 'System',
        'pending'
      );

      // 3. Update account balance based on transaction type and account type (simplified ledger logic)
      let balanceChange = 0;
      if (account.type === 'asset' || account.type === 'expense') {
        // Debits increase assets/expenses, Credits decrease them
        balanceChange = type === 'debit' ? parsedAmount : -parsedAmount;
      } else {
        // Credits increase liability/equity/revenue, Debits decrease them
        balanceChange = type === 'credit' ? parsedAmount : -parsedAmount;
      }

      db.prepare(
        'UPDATE accounts SET balance = balance + ?, sync_status = ?, sync_updated_at = CURRENT_TIMESTAMP WHERE id = ?'
      ).run(balanceChange, 'pending', account_id);

      // 4. Update sync queue for both transaction and account
      const newTransaction = db.prepare('SELECT * FROM transactions WHERE id = ?').get(newId);
      const updatedAccount = db.prepare('SELECT * FROM accounts WHERE id = ?').get(account_id);

      try {
        db.prepare('INSERT INTO sync_queue (table_name, record_id, action, data) VALUES (?, ?, ?, ?)').run(
          'transactions', newId, 'INSERT', JSON.stringify(newTransaction)
        );
        db.prepare('INSERT INTO sync_queue (table_name, record_id, action, data) VALUES (?, ?, ?, ?)').run(
          'accounts', account_id, 'UPDATE', JSON.stringify(updatedAccount)
        );
      } catch (e) {
        console.warn('[Transactions API] Sync queue write failed:', e.message);
      }
    })();

    const result = db.prepare(`
      SELECT t.*, a.name as account_name, a.type as account_type 
      FROM transactions t
      LEFT JOIN accounts a ON t.account_id = a.id
      WHERE t.id = ?
    `).get(newId);

    res.status(201).json(result);
  } catch (error) {
    console.error('[Transactions API] Create error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

export default router;
