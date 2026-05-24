import express from 'express';
import db from '../database.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

router.get('/dashboard', authenticateToken, (req, res) => {
  try {
    // Calculate total revenue, expenses, and net profit
    const revenueObj = db.prepare("SELECT SUM(balance) as total FROM accounts WHERE type = 'revenue' AND is_archived = 0").get();
    const expenseObj = db.prepare("SELECT SUM(balance) as total FROM accounts WHERE type = 'expense' AND is_archived = 0").get();
    const assetObj = db.prepare("SELECT SUM(balance) as total FROM accounts WHERE type = 'asset' AND is_archived = 0").get();

    const totalRevenue = revenueObj?.total || 0;
    const totalExpenses = expenseObj?.total || 0;
    const totalAssets = assetObj?.total || 0;
    const netProfit = totalRevenue - totalExpenses;

    // Get recent 5 transactions
    const recentTransactions = db.prepare(`
      SELECT t.*, a.name as account_name 
      FROM transactions t
      LEFT JOIN accounts a ON t.account_id = a.id
      WHERE t.is_archived = 0 
      ORDER BY t.transaction_date DESC
      LIMIT 5
    `).all();

    // Pending invoices total
    const pendingInvoices = db.prepare(`
      SELECT SUM(total_amount - paid_amount) as pending_total 
      FROM invoices 
      WHERE status IN ('draft', 'sent', 'overdue') AND is_archived = 0
    `).get();

    res.json({
      totalRevenue,
      totalExpenses,
      netProfit,
      totalAssets,
      pendingInvoicesAmount: pendingInvoices?.pending_total || 0,
      recentTransactions
    });
  } catch (error) {
    console.error('[Accounting API] Dashboard error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

export default router;
