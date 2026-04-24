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
    'payments',
    recordId,
    oldValues ? JSON.stringify(oldValues) : null,
    newValues ? JSON.stringify(newValues) : null,
    ipAddress
  );
};

// Get all payments for an order
router.get('/order/:orderId', authenticateToken, (req, res) => {
  try {
    const payments = db.prepare('SELECT * FROM payments WHERE order_id = ? ORDER BY payment_date DESC').all(req.params.orderId);
    res.json(payments);
  } catch (error) {
    console.error('Error fetching payments:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

function recalculateOrderPaymentStatus(orderId) {
  const order = db.prepare('SELECT total_amount, delivery_status FROM orders WHERE id = ?').get(orderId);
  if (!order) return;

  const payments = db.prepare('SELECT sum(amount) as val FROM payments WHERE order_id = ?').get(orderId);
  const totalPaid = payments.val || 0;

  let newStatus = 'partial';
  let isArchived = 0;

  if (totalPaid >= order.total_amount) {
    newStatus = 'paid';
    // Auto-archive only if it's ALSO fully delivered
    if (order.delivery_status === 'delivered') {
      isArchived = 1;
    }
  } else if (totalPaid === 0) {
    newStatus = 'pending';
  }

  db.prepare('UPDATE orders SET paid_amount = ?, status = ?, is_archived = ?, sync_updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(totalPaid, newStatus, isArchived, orderId);
  
  const updatedOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  db.prepare('INSERT INTO sync_queue (table_name, record_id, action, data) VALUES (?, ?, ?, ?)').run(
    'orders', orderId, 'UPDATE', JSON.stringify(updatedOrder)
  );
}

import { logUsage } from './inventory.js';

// Create payment
router.post('/', authenticateToken, (req, res) => {
  try {
    const { order_id, amount, payment_date, method, reference, notes, mark_as_delivered } = req.body;

    if (!order_id || !amount) {
      return res.status(400).json({ message: 'Order ID and amount are required' });
    }

    if (req.user.role === 'user') {
      return res.status(403).json({ message: 'Users cannot create payments' });
    }

    const order = db.prepare('SELECT total_amount, paid_amount, status, delivery_status FROM orders WHERE id = ?').get(order_id);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    if (order.status === 'paid') {
      return res.status(400).json({ message: 'This order is already fully paid and finalized.' });
    }

    // Use rounding to 2 decimal places to avoid floating point errors
    const totalAmount = Math.round(parseFloat(order.total_amount) * 100) / 100;
    const currentPaid = Math.round(parseFloat(order.paid_amount) * 100) / 100;
    const paymentAmount = Math.round(parseFloat(amount) * 100) / 100;
    
    if (currentPaid + paymentAmount > totalAmount + 0.01) {
      return res.status(400).json({ message: 'Payment amount exceeds order balance' });
    }

    const id = crypto.randomUUID();
    const pDate = payment_date || new Date().toISOString();

    db.prepare(`
      INSERT INTO payments (id, order_id, amount, payment_date, method, reference, notes, created_by, sync_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, order_id, amount, pDate, method || 'cash', reference || null, notes || null, req.user.id, 'pending');

    const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(id);

    db.prepare('INSERT INTO sync_queue (table_name, record_id, action, data) VALUES (?, ?, ?, ?)').run(
      'payments', id, 'INSERT', JSON.stringify(payment)
    );

    // HANDLE DELIVERY INTEGRATION
    if (mark_as_delivered && order.delivery_status !== 'delivered') {
      const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order_id);
      
      for (const item of items) {
        const remaining = (item.quantity || 0) - (item.delivered_quantity || 0);
        if (remaining > 0) {
          // Update item
          db.prepare(`
            UPDATE order_items 
            SET delivered_quantity = quantity, sync_status = 'pending', sync_updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(item.id);

          // Update inventory if linked
          if (item.inventory_item_id) {
            db.prepare(
              'UPDATE inventory SET quantity = quantity + ?, last_updated = CURRENT_TIMESTAMP WHERE id = ?'
            ).run(remaining, item.inventory_item_id);

            const updatedInv = db.prepare('SELECT * FROM inventory WHERE id = ?').get(item.inventory_item_id);
            db.prepare('INSERT INTO sync_queue (table_name, record_id, action, data) VALUES (?, ?, ?, ?)').run(
              'inventory', item.inventory_item_id, 'UPDATE', JSON.stringify(updatedInv)
            );

            // Log inflow
            logUsage(req.user.id, item.inventory_item_id, updatedInv.name, updatedInv.quantity - remaining, updatedInv.quantity, 'IN');
          }

          const updatedItem = db.prepare('SELECT * FROM order_items WHERE id = ?').get(item.id);
          db.prepare('INSERT INTO sync_queue (table_name, record_id, action, data) VALUES (?, ?, ?, ?)').run(
            'order_items', item.id, 'UPDATE', JSON.stringify(updatedItem)
          );
        }
      }

      // Update order delivery status BEFORE recalculating payment status
      db.prepare('UPDATE orders SET delivery_status = ?, sync_status = \'pending\', sync_updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('delivered', order_id);
    }

    // Now recalculate payment status (it will see the 'delivered' status and archive if needed)
    recalculateOrderPaymentStatus(order_id);
    logAudit(req.user.id, 'created', id, null, payment, req.ip);

    res.status(201).json(payment);
  } catch (error) {
    console.error('Error creating payment:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update payment
router.put('/:id', authenticateToken, (req, res) => {
  try {
    const { amount, payment_date, method, reference, notes } = req.body;

    if (req.user.role === 'user') {
      return res.status(403).json({ message: 'Users cannot update payments' });
    }

    const currentPayment = db.prepare('SELECT * FROM payments WHERE id = ?').get(req.params.id);
    if (!currentPayment) {
        return res.status(404).json({ message: 'Payment not found' });
    }

    db.prepare(`
      UPDATE payments 
      SET amount = ?, payment_date = ?, method = ?, reference = ?, notes = ?, sync_status = ?, sync_updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(amount, payment_date || currentPayment.payment_date, method || currentPayment.method, reference || null, notes || null, 'pending', req.params.id);

    const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(req.params.id);

    db.prepare('INSERT INTO sync_queue (table_name, record_id, action, data) VALUES (?, ?, ?, ?)').run(
      'payments', req.params.id, 'UPDATE', JSON.stringify(payment)
    );

    recalculateOrderPaymentStatus(currentPayment.order_id);
    logAudit(req.user.id, 'updated', req.params.id, currentPayment, payment, req.ip);

    res.json(payment);
  } catch (error) {
    console.error('Error updating payment:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Delete payment
router.delete('/:id', authenticateToken, (req, res) => {
  try {
    if (req.user.role === 'user') {
      return res.status(403).json({ message: 'Users cannot delete payments' });
    }

    const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(req.params.id);
    if (!payment) {
        return res.status(404).json({ message: 'Payment not found' });
    }

    db.prepare('DELETE FROM payments WHERE id = ?').run(req.params.id);

    db.prepare('INSERT INTO sync_queue (table_name, record_id, action, data) VALUES (?, ?, ?, ?)').run(
      'payments', req.params.id, 'DELETE', JSON.stringify(payment)
    );

    recalculateOrderPaymentStatus(payment.order_id);
    logAudit(req.user.id, 'deleted', req.params.id, payment, null, req.ip);

    res.json({ message: 'Payment deleted successfully' });
  } catch (error) {
    console.error('Error deleting payment:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

export default router;
