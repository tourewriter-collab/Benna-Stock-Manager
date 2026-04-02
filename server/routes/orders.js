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
    'orders',
    recordId,
    oldValues ? JSON.stringify(oldValues) : null,
    newValues ? JSON.stringify(newValues) : null,
    ipAddress
  );
};

// Get all orders with filters
router.get('/', authenticateToken, (req, res) => {
  try {
    const { supplier_id, status, start_date, end_date, unpaid } = req.query;

    let sql = `
      SELECT o.*, s.id as supp_id, s.name as supp_name
      FROM orders o
      LEFT JOIN suppliers s ON o.supplier_id = s.id
      WHERE 1=1
    `;
    const params = [];

    if (supplier_id) {
      sql += ` AND o.supplier_id = ?`;
      params.push(supplier_id);
    }
    if (status) {
      sql += ` AND o.status = ?`;
      params.push(status);
    }
    if (start_date) {
      sql += ` AND o.order_date >= ?`;
      params.push(start_date);
    }
    if (end_date) {
      sql += ` AND o.order_date <= ?`;
      params.push(end_date);
    }
    if (unpaid === 'true') {
      sql += ` AND o.status IN ('pending', 'partial')`;
    }

    sql += ` ORDER BY o.order_date DESC`;

    const ordersRaw = db.prepare(sql).all(...params);

    const orders = ordersRaw.map(row => {
      const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(row.id);
      
      return {
        id: row.id,
        supplier_id: row.supplier_id,
        order_date: row.order_date,
        expected_date: row.expected_date,
        total_amount: row.total_amount,
        paid_amount: row.paid_amount,
        status: row.status,
        notes: row.notes,
        created_by: row.created_by,
        balance: row.total_amount - row.paid_amount,
        supplier: row.supp_id ? { id: row.supp_id, name: row.supp_name } : null,
        items
      };
    });

    res.json(orders);
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get single order with details
router.get('/:id', authenticateToken, (req, res) => {
  try {
    const orderRow = db.prepare(`
      SELECT o.*, s.id as supp_id, s.name as supp_name, s.contact, s.phone, s.email, s.address 
      FROM orders o 
      LEFT JOIN suppliers s ON o.supplier_id = s.id 
      WHERE o.id = ?
    `).get(req.params.id);

    if (!orderRow) {
      return res.status(404).json({ message: 'Order not found' });
    }

    const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderRow.id);
    const payments = db.prepare('SELECT * FROM payments WHERE order_id = ?').all(orderRow.id);

    const orderWithBalance = {
      id: orderRow.id,
      supplier_id: orderRow.supplier_id,
      order_date: orderRow.order_date,
      expected_date: orderRow.expected_date,
      total_amount: orderRow.total_amount,
      paid_amount: orderRow.paid_amount,
      status: orderRow.status,
      notes: orderRow.notes,
      created_by: orderRow.created_by,
      balance: orderRow.total_amount - orderRow.paid_amount,
      supplier: orderRow.supp_id ? {
        id: orderRow.supp_id,
        name: orderRow.supp_name,
        contact: orderRow.contact,
        phone: orderRow.phone,
        email: orderRow.email,
        address: orderRow.address
      } : null,
      items,
      payments
    };

    res.json(orderWithBalance);
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get outstanding payments summary
router.get('/summary/outstanding', authenticateToken, (req, res) => {
  try {
    const ordersRaw = db.prepare(`
      SELECT o.id, o.total_amount, o.paid_amount, o.order_date, s.name as supp_name
      FROM orders o
      LEFT JOIN suppliers s ON o.supplier_id = s.id
      WHERE o.status IN ('pending', 'partial')
      ORDER BY o.order_date DESC
    `).all();

    const totalOutstanding = ordersRaw.reduce((sum, order) =>
      sum + (order.total_amount - order.paid_amount), 0
    );

    const ordersWithHighBalance = ordersRaw
      .map(order => ({
        id: order.id,
        total_amount: order.total_amount,
        paid_amount: order.paid_amount,
        order_date: order.order_date,
        supplier: { name: order.supp_name },
        balance: order.total_amount - order.paid_amount
      }))
      .filter(order => order.balance > 0)
      .sort((a, b) => b.balance - a.balance)
      .slice(0, 5);

    res.json({
      totalOutstanding,
      count: ordersRaw.length,
      recentHighBalance: ordersWithHighBalance
    });
  } catch (error) {
    console.error('Error fetching outstanding payments:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Create order
router.post('/', authenticateToken, (req, res) => {
  try {
    const { supplier_id, expected_date, notes, items } = req.body;

    if (!supplier_id || !items || items.length === 0) {
      return res.status(400).json({ message: 'Supplier and items are required' });
    }

    if (req.user.role === 'user') {
      return res.status(403).json({ message: 'Users cannot create orders' });
    }

    const total_amount = items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
    const orderId = crypto.randomUUID();

    db.prepare(`
      INSERT INTO orders (id, supplier_id, expected_date, total_amount, notes, created_by, sync_status) 
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(orderId, supplier_id, expected_date || null, total_amount, notes || null, req.user.id, 'pending');

    const newOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);

    db.prepare('INSERT INTO sync_queue (table_name, record_id, action, data) VALUES (?, ?, ?, ?)').run(
      'orders', orderId, 'INSERT', JSON.stringify(newOrder)
    );

    const orderItems = items.map(item => {
      const itemId = crypto.randomUUID();
      const total = item.quantity * item.unit_price;
      db.prepare(`
        INSERT INTO order_items (id, order_id, inventory_item_id, description, quantity, unit_price, total, sync_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(itemId, orderId, item.inventory_item_id || null, item.description, item.quantity, item.unit_price, total, 'pending');
      
      const inserted = db.prepare('SELECT * FROM order_items WHERE id = ?').get(itemId);
      db.prepare('INSERT INTO sync_queue (table_name, record_id, action, data) VALUES (?, ?, ?, ?)').run(
        'order_items', itemId, 'INSERT', JSON.stringify(inserted)
      );
      return inserted;
    });

    logAudit(req.user.id, 'created', orderId, null, newOrder, req.ip);

    newOrder.items = orderItems;
    newOrder.supplier = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(supplier_id);

    res.status(201).json(newOrder);
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update order
router.put('/:id', authenticateToken, (req, res) => {
  try {
    const { id } = req.params;
    const { supplier_id, expected_date, status, notes } = req.body;

    if (req.user.role === 'user') {
      return res.status(403).json({ message: 'Users cannot update orders' });
    }

    const oldOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);

    if (!oldOrder) {
      return res.status(404).json({ message: 'Order not found' });
    }

    db.prepare(`
      UPDATE orders 
      SET supplier_id = ?, expected_date = ?, status = ?, notes = ?, sync_status = ?, sync_updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(supplier_id, expected_date || null, status, notes || null, 'pending', id);

    const updatedOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);

    db.prepare('INSERT INTO sync_queue (table_name, record_id, action, data) VALUES (?, ?, ?, ?)').run(
      'orders', id, 'UPDATE', JSON.stringify(updatedOrder)
    );

    logAudit(req.user.id, 'updated', id, oldOrder, updatedOrder, req.ip);

    res.json(updatedOrder);
  } catch (error) {
    console.error('Error updating order:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Delete order
router.delete('/:id', authenticateToken, (req, res) => {
  try {
    const { id } = req.params;

    if (req.user.role === 'user') {
      return res.status(403).json({ message: 'Users cannot delete orders' });
    }

    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Delete items first
    const items = db.prepare('SELECT id FROM order_items WHERE order_id = ?').all(id);
    for (const item of items) {
      db.prepare('DELETE FROM order_items WHERE id = ?').run(item.id);
      db.prepare('INSERT INTO sync_queue (table_name, record_id, action, data) VALUES (?, ?, ?, ?)').run(
        'order_items', item.id, 'DELETE', JSON.stringify({ id: item.id })
      );
    }

    // Delete payments
    const payments = db.prepare('SELECT id FROM payments WHERE order_id = ?').all(id);
    for (const payment of payments) {
      db.prepare('DELETE FROM payments WHERE id = ?').run(payment.id);
      db.prepare('INSERT INTO sync_queue (table_name, record_id, action, data) VALUES (?, ?, ?, ?)').run(
        'payments', payment.id, 'DELETE', JSON.stringify({ id: payment.id })
      );
    }

    db.prepare('DELETE FROM orders WHERE id = ?').run(id);

    db.prepare('INSERT INTO sync_queue (table_name, record_id, action, data) VALUES (?, ?, ?, ?)').run(
      'orders', id, 'DELETE', JSON.stringify(order)
    );

    logAudit(req.user.id, 'deleted', id, order, null, req.ip);

    res.json({ message: 'Order deleted successfully' });
  } catch (error) {
    console.error('Error deleting order:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Add item to order
router.post('/:id/items', authenticateToken, (req, res) => {
  try {
    const { inventory_item_id, description, quantity, unit_price } = req.body;

    if (!description || !quantity || !unit_price) {
      return res.status(400).json({ message: 'Description, quantity, and unit price are required' });
    }

    const itemId = crypto.randomUUID();
    const total = quantity * unit_price;

    db.prepare(`
      INSERT INTO order_items (id, order_id, inventory_item_id, description, quantity, unit_price, total, sync_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(itemId, req.params.id, inventory_item_id || null, description, quantity, unit_price, total, 'pending');

    const item = db.prepare('SELECT * FROM order_items WHERE id = ?').get(itemId);
    db.prepare('INSERT INTO sync_queue (table_name, record_id, action, data) VALUES (?, ?, ?, ?)').run(
      'order_items', itemId, 'INSERT', JSON.stringify(item)
    );

    // Recalculate order total
    const itemTotals = db.prepare('SELECT sum(total) as val FROM order_items WHERE order_id = ?').get(req.params.id);
    db.prepare('UPDATE orders SET total_amount = ? WHERE id = ?').run(itemTotals.val || 0, req.params.id);

    res.status(201).json(item);
  } catch (error) {
    console.error('Error adding order item:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update order item
router.put('/:orderId/items/:itemId', authenticateToken, (req, res) => {
  try {
    const { inventory_item_id, description, quantity, unit_price } = req.body;
    const total = quantity * unit_price;

    db.prepare(`
      UPDATE order_items 
      SET inventory_item_id = ?, description = ?, quantity = ?, unit_price = ?, total = ?, sync_status = ?, sync_updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND order_id = ?
    `).run(inventory_item_id || null, description, quantity, unit_price, total, 'pending', req.params.itemId, req.params.orderId);

    const item = db.prepare('SELECT * FROM order_items WHERE id = ?').get(req.params.itemId);
    db.prepare('INSERT INTO sync_queue (table_name, record_id, action, data) VALUES (?, ?, ?, ?)').run(
      'order_items', req.params.itemId, 'UPDATE', JSON.stringify(item)
    );

    // Recalculate order total
    const itemTotals = db.prepare('SELECT sum(total) as val FROM order_items WHERE order_id = ?').get(req.params.orderId);
    db.prepare('UPDATE orders SET total_amount = ? WHERE id = ?').run(itemTotals.val || 0, req.params.orderId);

    res.json(item);
  } catch (error) {
    console.error('Error updating order item:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Delete order item
router.delete('/:orderId/items/:itemId', authenticateToken, (req, res) => {
  try {
    db.prepare('DELETE FROM order_items WHERE id = ? AND order_id = ?').run(req.params.itemId, req.params.orderId);

    db.prepare('INSERT INTO sync_queue (table_name, record_id, action, data) VALUES (?, ?, ?, ?)').run(
      'order_items', req.params.itemId, 'DELETE', JSON.stringify({ id: req.params.itemId })
    );

    // Recalculate order total
    const itemTotals = db.prepare('SELECT sum(total) as val FROM order_items WHERE order_id = ?').get(req.params.orderId);
    db.prepare('UPDATE orders SET total_amount = ? WHERE id = ?').run(itemTotals.val || 0, req.params.orderId);

    res.json({ message: 'Order item deleted successfully' });
  } catch (error) {
    console.error('Error deleting order item:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update item delivery status
router.put('/:orderId/items/:itemId/delivery', authenticateToken, (req, res) => {
  try {
    const { orderId, itemId } = req.params;
    const { delivered_quantity } = req.body;

    if (req.user.role === 'user') {
      return res.status(403).json({ message: 'Users cannot update delivery status' });
    }

    const oldItem = db.prepare('SELECT * FROM order_items WHERE id = ? AND order_id = ?').get(itemId, orderId);
    if (!oldItem) {
      return res.status(404).json({ message: 'Item not found' });
    }

    const oldDelivered = oldItem.delivered_quantity || 0;
    const delta = delivered_quantity - oldDelivered;

    db.prepare(`
      UPDATE order_items 
      SET delivered_quantity = ?, sync_status = 'pending', sync_updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND order_id = ?
    `).run(delivered_quantity, itemId, orderId);

    // If linked to an inventory item, update the physical stock
    if (delta !== 0 && oldItem.inventory_item_id) {
      db.prepare(
        'UPDATE inventory SET quantity = quantity + ?, last_updated = CURRENT_TIMESTAMP WHERE id = ?'
      ).run(delta, oldItem.inventory_item_id);

      const updatedInv = db.prepare('SELECT * FROM inventory WHERE id = ?').get(oldItem.inventory_item_id);
      db.prepare('INSERT INTO sync_queue (table_name, record_id, action, data) VALUES (?, ?, ?, ?)').run(
        'inventory', oldItem.inventory_item_id, 'UPDATE', JSON.stringify(updatedInv)
      );
    }

    const updatedItem = db.prepare('SELECT * FROM order_items WHERE id = ?').get(itemId);
    db.prepare('INSERT INTO sync_queue (table_name, record_id, action, data) VALUES (?, ?, ?, ?)').run(
      'order_items', itemId, 'UPDATE', JSON.stringify(updatedItem)
    );

    // Update order delivery status
    const items = db.prepare('SELECT quantity, delivered_quantity FROM order_items WHERE order_id = ?').all(orderId);
    
    let allDelivered = true;
    let noneDelivered = true;
    
    for (const item of items) {
      if (item.delivered_quantity < item.quantity) {
        allDelivered = false;
      }
      if (item.delivered_quantity > 0) {
        noneDelivered = false;
      }
    }

    let newDeliveryStatus = 'pending';
    if (allDelivered) {
      newDeliveryStatus = 'delivered';
    } else if (!noneDelivered) {
      newDeliveryStatus = 'partial';
    }

    db.prepare('UPDATE orders SET delivery_status = ?, sync_status = \'pending\', sync_updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newDeliveryStatus, orderId);
    const updatedOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    db.prepare('INSERT INTO sync_queue (table_name, record_id, action, data) VALUES (?, ?, ?, ?)').run(
      'orders', orderId, 'UPDATE', JSON.stringify(updatedOrder)
    );

    logAudit(req.user.id, 'updated_delivery', itemId, oldItem, { delivered_quantity }, req.ip);

    res.json({ item: updatedItem, order: updatedOrder });
  } catch (error) {
    console.error('Error updating delivery status:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

export default router;
