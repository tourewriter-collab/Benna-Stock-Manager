import express from 'express';
import db from '../database.js';
import { authenticateToken } from '../middleware/auth.js';
import { logUsage } from './inventory.js';
import * as crypto from 'crypto';

const router = express.Router();

// Recalculates and saves the payment status of an order based on actual payments
function recalculateOrderPaymentStatus(orderId) {
  const order = db.prepare('SELECT total_amount, delivery_status FROM orders WHERE id = ?').get(orderId);
  if (!order) return;
  const payments = db.prepare('SELECT COALESCE(SUM(amount), 0) as val FROM payments WHERE order_id = ?').get(orderId);
  const totalPaid = payments.val || 0;
  let newStatus = totalPaid <= 0 ? 'pending' : totalPaid >= order.total_amount ? 'paid' : 'partial';
  const isArchived = newStatus === 'paid' && order.delivery_status === 'delivered' ? 1 : 0;
  db.prepare('UPDATE orders SET paid_amount = ?, status = ?, is_archived = ?, sync_status = \'pending\', sync_updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(totalPaid, newStatus, isArchived, orderId);
  const updated = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  db.prepare('INSERT INTO sync_queue (table_name, record_id, action, data) VALUES (?, ?, ?, ?)').run('orders', orderId, 'UPDATE', JSON.stringify(updated));
}

const logAudit = (userId, action, recordId, oldValues, newValues, ipAddress) => {
  try {
    const auditId = crypto.randomUUID();
    db.prepare(
      'INSERT INTO audit_logs (id, user_id, action, table_name, record_id, old_values, new_values, ip_address) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      auditId,
      Number(userId) || 0,
      action,
      'orders',
      recordId,
      oldValues ? JSON.stringify(oldValues) : null,
      newValues ? JSON.stringify(newValues) : null,
      ipAddress
    );
  } catch (e) {
    console.warn('[Audit] Failed to write audit log (non-fatal):', e.message);
  }
};

// Get all orders with filters
router.get('/', authenticateToken, (req, res) => {
  try {
    const { supplier_id, status, start_date, end_date, unpaid, archived } = req.query;

    let sql = `
      SELECT o.*, s.id as supp_id, s.name as supp_name
      FROM orders o
      LEFT JOIN suppliers s ON o.supplier_id = s.id
      WHERE 1=1
    `;
    const params = [];

    const isArchived = archived === 'true' ? 1 : 0;
    sql += ` AND o.is_archived = ?`;
    params.push(isArchived);

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
      const items = db.prepare(`
        SELECT oi.*, c.name_en as item_category
        FROM order_items oi
        LEFT JOIN inventory inv ON oi.inventory_item_id = inv.id
        LEFT JOIN categories c ON inv.category_id = c.id
        WHERE oi.order_id = ?
      `).all(row.id);
      items.forEach((it) => { if (it.item_category) it.category = it.item_category; });
      
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

    const items = db.prepare(`
      SELECT oi.*, c.name_en as item_category
      FROM order_items oi
      LEFT JOIN inventory inv ON oi.inventory_item_id = inv.id
      LEFT JOIN categories c ON inv.category_id = c.id
      WHERE oi.order_id = ?
    `).all(orderRow.id);
    // Map the joined category name onto the item
    items.forEach((it) => { if (it.item_category) it.category = it.item_category; });
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
  const createOrderTransaction = db.transaction((userId, supplierId, expectedDate, notes, items, markAsPaid, markAsDelivered, ipAddress) => {
    const total_amount = items.reduce((sum, item) => {
      const q = Number(item.quantity) || 0;
      const p = Number(item.unit_price) || 0;
      return sum + (q * p);
    }, 0);

    if (isNaN(total_amount)) {
      throw new Error('Invalid total amount calculation');
    }

    const orderId = crypto.randomUUID();
    const initialDeliveryStatus = markAsDelivered ? 'delivered' : 'pending';

    db.prepare(`
      INSERT INTO orders (id, supplier_id, expected_date, total_amount, notes, created_by, sync_status, delivery_status, is_archived, actual_delivery_date) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
    `).run(orderId, supplierId, expectedDate || null, total_amount, notes || null, String(userId), 'pending', initialDeliveryStatus, markAsDelivered ? new Date().toISOString() : null);

    const newOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);

    db.prepare('INSERT INTO sync_queue (table_name, record_id, action, data) VALUES (?, ?, ?, ?)').run(
      'orders', orderId, 'INSERT', JSON.stringify(newOrder)
    );

    const orderItems = items.map(item => {
      const itemId = crypto.randomUUID();
      const q = Number(item.quantity) || 0;
      let d = Number(item.delivered_quantity) || 0;
      if (markAsDelivered) d = q; // Force full delivery if flag is set
      if (d > q) d = q; // CAP: Cannot deliver more than ordered
      const p = Number(item.unit_price) || 0;
      const total = q * p;
      
      let inventoryId = item.inventory_item_id || null;
      
      if (!inventoryId) {
        const existingInv = db.prepare('SELECT id FROM inventory WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))').get(item.description);
        if (existingInv) {
          inventoryId = existingInv.id;
        }
      }

      let currentInv;
      if (inventoryId) {
        const supplier = db.prepare('SELECT name FROM suppliers WHERE id = ?').get(supplierId);
        const supplierName = supplier ? supplier.name : null;
        
        db.prepare(`
          UPDATE inventory 
          SET last_updated = CURRENT_TIMESTAMP,
              sync_status = 'pending',
              supplier = COALESCE(NULLIF(supplier, ''), ?)
          WHERE id = ?
        `).run(supplierName, inventoryId);
        // Refetch right before use to avoid stale data if multiple items in one order refer to same inventory ID
        currentInv = db.prepare('SELECT * FROM inventory WHERE id = ?').get(inventoryId);
      } else {
        let catId = item.category_id;
        let catName = 'General';
        
        if (catId) {
          const matchedCat = db.prepare('SELECT name_en FROM categories WHERE id = ?').get(catId);
          if (matchedCat) catName = matchedCat.name_en;
        } else {
          const generalCat = db.prepare('SELECT id FROM categories WHERE name_en = ?').get('General');
          catId = generalCat ? generalCat.id : 'cat_general';
        }

        const newInvId = crypto.randomUUID();
        const supplier = db.prepare('SELECT name FROM suppliers WHERE id = ?').get(supplierId);
        const supplierName = supplier ? supplier.name : null;

        db.prepare(`
          INSERT INTO inventory (id, name, category_id, category, quantity, price, location, supplier, sync_status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(newInvId, item.description, catId, catName, 0, p, 'Main Store', supplierName, 'pending');
        
        inventoryId = newInvId;
        currentInv = db.prepare('SELECT * FROM inventory WHERE id = ?').get(newInvId);
        
        db.prepare('INSERT INTO sync_queue (table_name, record_id, action, data) VALUES (?, ?, ?, ?)').run(
          'inventory', newInvId, 'INSERT', JSON.stringify(currentInv)
        );
      }

      // If delivered quantity is provided during creation, update inventory immediately
      if (d > 0) {
        const oldQty = currentInv.quantity;
        const newQty = oldQty + d;
        db.prepare('UPDATE inventory SET quantity = ?, sync_status = \'pending\', last_updated = CURRENT_TIMESTAMP WHERE id = ?')
          .run(newQty, inventoryId);
        
        // Re-read currentInv after update so subsequent items in the same order see the new quantity
        currentInv = db.prepare('SELECT * FROM inventory WHERE id = ?').get(inventoryId);
        db.prepare('INSERT INTO sync_queue (table_name, record_id, action, data) VALUES (?, ?, ?, ?)').run(
          'inventory', inventoryId, 'UPDATE', JSON.stringify(currentInv)
        );

        // Log the inflow in usage_logs
        logUsage(userId, inventoryId, currentInv.name, oldQty, newQty, 'IN');
      }

      db.prepare(`
        INSERT INTO order_items (id, order_id, inventory_item_id, description, quantity, delivered_quantity, unit_price, total, sync_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(itemId, orderId, inventoryId, item.description, q, d, p, total, 'pending');
      
      const inserted = db.prepare('SELECT * FROM order_items WHERE id = ?').get(itemId);
      db.prepare('INSERT INTO sync_queue (table_name, record_id, action, data) VALUES (?, ?, ?, ?)').run(
        'order_items', itemId, 'INSERT', JSON.stringify(inserted)
      );
      return inserted;
    });

    if (markAsPaid) {
      const paymentId = crypto.randomUUID();
      db.prepare(`
        INSERT INTO payments (id, order_id, amount, payment_date, method, created_by, sync_status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(paymentId, orderId, total_amount, new Date().toISOString(), 'cash', String(userId), 'pending');
      
      const p = db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId);
      db.prepare('INSERT INTO sync_queue (table_name, record_id, action, data) VALUES (?, ?, ?, ?)').run(
        'payments', paymentId, 'INSERT', JSON.stringify(p)
      );
      
      db.prepare('UPDATE orders SET paid_amount = ?, status = ? WHERE id = ?').run(total_amount, 'paid', orderId);
      
      // Auto-archive if both paid and delivered
      if (markAsDelivered) {
        db.prepare('UPDATE orders SET is_archived = 1 WHERE id = ?').run(orderId);
      }
    }

    const finalOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    // Update the sync queue with the final state of the order
    db.prepare('UPDATE sync_queue SET data = ? WHERE table_name = ? AND record_id = ?').run(
      JSON.stringify(finalOrder), 'orders', orderId
    );

    finalOrder.items = orderItems;
    finalOrder.supplier = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(supplierId);
    return finalOrder;
  });

  try {
    const { supplier_id, expected_date, notes, items, mark_as_paid, mark_as_delivered } = req.body;

    if (!supplier_id || !items || items.length === 0) {
      return res.status(400).json({ message: 'Supplier and items are required' });
    }

    if (req.user.role === 'user') {
      return res.status(403).json({ message: 'Users cannot create orders' });
    }

    const order = createOrderTransaction(
      req.user.id, 
      supplier_id, 
      expected_date, 
      notes, 
      items, 
      mark_as_paid, 
      mark_as_delivered,
      req.ip
    );
    // logAudit outside the transaction so failures don't roll back the order
    logAudit(req.user.id, 'created', order.id, null, order, req.ip);
    res.status(201).json(order);
  } catch (error) {
    console.error('Error creating order:', error.message);
    console.error('Stack:', error.stack);
    res.status(500).json({ message: error.message || 'Server error', error: error.message });
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

    logAudit(Number(req.user.id), 'updated', id, oldOrder, updatedOrder, req.ip);

    res.json(updatedOrder);
  } catch (error) {
    console.error('Error updating order:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Delete order
router.delete('/:id', authenticateToken, (req, res) => {
  const deleteOrderTransaction = db.transaction((orderId) => {
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    if (!order) return null;

    // Delete items first
    const items = db.prepare('SELECT id FROM order_items WHERE order_id = ?').all(orderId);
    for (const item of items) {
      db.prepare('DELETE FROM order_items WHERE id = ?').run(item.id);
      db.prepare('INSERT INTO sync_queue (table_name, record_id, action, data) VALUES (?, ?, ?, ?)').run(
        'order_items', item.id, 'DELETE', JSON.stringify({ id: item.id })
      );
    }

    // Delete payments
    const payments = db.prepare('SELECT id FROM payments WHERE order_id = ?').all(orderId);
    for (const payment of payments) {
      db.prepare('DELETE FROM payments WHERE id = ?').run(payment.id);
      db.prepare('INSERT INTO sync_queue (table_name, record_id, action, data) VALUES (?, ?, ?, ?)').run(
        'payments', payment.id, 'DELETE', JSON.stringify({ id: payment.id })
      );
    }

    db.prepare('DELETE FROM orders WHERE id = ?').run(orderId);

    db.prepare('INSERT INTO sync_queue (table_name, record_id, action, data) VALUES (?, ?, ?, ?)').run(
      'orders', orderId, 'DELETE', JSON.stringify(order)
    );

    return order;
  });

  try {
    const { id } = req.params;

    if (req.user.role === 'user') {
      return res.status(403).json({ message: 'Users cannot delete orders' });
    }

    const order = deleteOrderTransaction(id);

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    logAudit(Number(req.user.id), 'deleted', id, order, null, req.ip);
    res.json({ message: 'Order deleted successfully' });
  } catch (error) {
    console.error('Error deleting order:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Add item to order
router.post('/:id', authenticateToken, (req, res) => {
  const addItemTransaction = db.transaction((orderId, inventoryItemId, description, quantity, deliveredQuantity, unitPrice, categoryId) => {
    const q = Number(quantity) || 0;
    const d = Number(deliveredQuantity) || 0;
    const p = Number(unitPrice) || 0;
    const itemId = crypto.randomUUID();
    const total = q * p;

    let inventoryId = inventoryItemId || null;
    
    if (!inventoryId) {
      const existingInv = db.prepare('SELECT id FROM inventory WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))').get(description);
      if (existingInv) {
        inventoryId = existingInv.id;
      }
    }

    let currentInv;
    if (inventoryId) {
      currentInv = db.prepare('SELECT * FROM inventory WHERE id = ?').get(inventoryId);
    } else {
      let catId = categoryId;
      let catName = 'General';
      
      if (catId) {
        const matchedCat = db.prepare('SELECT name_en FROM categories WHERE id = ?').get(catId);
        if (matchedCat) catName = matchedCat.name_en;
      } else {
        const generalCat = db.prepare('SELECT id FROM categories WHERE name_en = ?').get('General');
        catId = generalCat ? generalCat.id : 'cat_general';
      }

      const newInvId = crypto.randomUUID();
      db.prepare(`
        INSERT INTO inventory (id, name, category_id, category, quantity, price, location, sync_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(newInvId, description, catId, catName, 0, p, 'Main Store', 'pending');
      
      inventoryId = newInvId;
      currentInv = db.prepare('SELECT * FROM inventory WHERE id = ?').get(newInvId);
      
      db.prepare('INSERT INTO sync_queue (table_name, record_id, action, data) VALUES (?, ?, ?, ?)').run(
        'inventory', newInvId, 'INSERT', JSON.stringify(currentInv)
      );
    }

    // Handle initial delivery if provided
    if (d > 0) {
      const oldQty = currentInv.quantity;
      const newQty = oldQty + d;
      db.prepare('UPDATE inventory SET quantity = ?, sync_status = \'pending\', last_updated = CURRENT_TIMESTAMP WHERE id = ?')
        .run(newQty, inventoryId);
      
      const updatedInv = db.prepare('SELECT * FROM inventory WHERE id = ?').get(inventoryId);
      db.prepare('INSERT INTO sync_queue (table_name, record_id, action, data) VALUES (?, ?, ?, ?)').run(
        'inventory', inventoryId, 'UPDATE', JSON.stringify(updatedInv)
      );

      logUsage(req.user.id, inventoryId, updatedInv.name, oldQty, newQty, 'IN');
    }

    db.prepare(`
      INSERT INTO order_items (id, order_id, inventory_item_id, description, quantity, delivered_quantity, unit_price, total, sync_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(itemId, orderId, inventoryId, description, q, d, p, total, 'pending');

    const item = db.prepare('SELECT * FROM order_items WHERE id = ?').get(itemId);
    db.prepare('INSERT INTO sync_queue (table_name, record_id, action, data) VALUES (?, ?, ?, ?)').run(
      'order_items', itemId, 'INSERT', JSON.stringify(item)
    );

    const itemTotals = db.prepare('SELECT sum(total) as val FROM order_items WHERE order_id = ?').get(orderId);
    db.prepare('UPDATE orders SET total_amount = ?, sync_status = \'pending\', sync_updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(itemTotals.val || 0, orderId);

    return item;
  });

  try {
    const { inventory_item_id, description, quantity, delivered_quantity, unit_price, category_id } = req.body;

    if (!description || !quantity || !unit_price) {
      return res.status(400).json({ message: 'Description, quantity, and unit price are required' });
    }

    const item = addItemTransaction(req.params.id, inventory_item_id, description, quantity, delivered_quantity || 0, unit_price, category_id);
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
    // LINKING logic
    let inventoryId = inventory_item_id || null;
    if (!inventoryId) {
      const existingInv = db.prepare('SELECT id FROM inventory WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))').get(description);
      if (existingInv) {
        inventoryId = existingInv.id;
      } else {
        let catId = req.body.category_id;
        let catName = 'General';
        
        if (catId) {
          const matchedCat = db.prepare('SELECT name_en FROM categories WHERE id = ?').get(catId);
          if (matchedCat) catName = matchedCat.name_en;
        } else {
          const generalCat = db.prepare('SELECT id FROM categories WHERE name_en = ?').get('General');
          catId = generalCat ? generalCat.id : 'cat_general';
        }

        const newInvId = crypto.randomUUID();
        db.prepare(`
          INSERT INTO inventory (id, name, category_id, category, quantity, price, location, sync_status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(newInvId, description, catId, catName, 0, unit_price, 'Main Store', 'pending');
        inventoryId = newInvId;
        const newInv = db.prepare('SELECT * FROM inventory WHERE id = ?').get(newInvId);
        db.prepare('INSERT INTO sync_queue (table_name, record_id, action, data) VALUES (?, ?, ?, ?)').run(
          'inventory', newInvId, 'INSERT', JSON.stringify(newInv)
        );
      }
    }

    const total = quantity * unit_price;

    db.prepare(`
      UPDATE order_items 
      SET inventory_item_id = ?, description = ?, quantity = ?, unit_price = ?, total = ?, sync_status = ?, sync_updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND order_id = ?
    `).run(inventoryId, description, quantity, unit_price, total, 'pending', req.params.itemId, req.params.orderId);

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

// Link an unlinked order item to an inventory item
router.post('/:orderId/items/:itemId/link', authenticateToken, (req, res) => {
  try {
    const { orderId, itemId } = req.params;
    const { inventory_item_id } = req.body;

    if (!inventory_item_id) {
      return res.status(400).json({ message: 'inventory_item_id is required' });
    }

    if (req.user.role === 'user') {
      return res.status(403).json({ message: 'Users cannot map inventory items' });
    }

    const orderItem = db.prepare('SELECT * FROM order_items WHERE id = ? AND order_id = ?').get(itemId, orderId);
    if (!orderItem) {
      return res.status(404).json({ message: 'Item not found' });
    }

    // Update the link
    db.prepare(`
      UPDATE order_items 
      SET inventory_item_id = ?, sync_status = 'pending', sync_updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND order_id = ?
    `).run(inventory_item_id, itemId, orderId);

    // If there was already a delivered quantity, we need to retroactively add it to the inventory!
    if (orderItem.delivered_quantity > 0) {
      db.prepare('UPDATE inventory SET quantity = quantity + ?, sync_status = \'pending\', last_updated = CURRENT_TIMESTAMP WHERE id = ?')
        .run(orderItem.delivered_quantity, inventory_item_id);

      const updatedInv = db.prepare('SELECT * FROM inventory WHERE id = ?').get(inventory_item_id);
      db.prepare('INSERT INTO sync_queue (table_name, record_id, action, data) VALUES (?, ?, ?, ?)').run(
        'inventory', inventory_item_id, 'UPDATE', JSON.stringify(updatedInv)
      );

      // Log the inflow retroactively
      logUsage(req.user.id, inventory_item_id, updatedInv.name, updatedInv.quantity - orderItem.delivered_quantity, updatedInv.quantity, 'IN');
    }

    const updatedItem = db.prepare('SELECT * FROM order_items WHERE id = ?').get(itemId);
    db.prepare('INSERT INTO sync_queue (table_name, record_id, action, data) VALUES (?, ?, ?, ?)').run(
      'order_items', itemId, 'UPDATE', JSON.stringify(updatedItem)
    );

    logAudit(Number(req.user.id), 'linked_inventory', itemId, orderItem, updatedItem, req.ip);

    // Recalculate order total (just in case)
    const itemTotals = db.prepare('SELECT sum(total) as val FROM order_items WHERE order_id = ?').get(orderId);
    db.prepare('UPDATE orders SET total_amount = ? WHERE id = ?').run(itemTotals.val || 0, orderId);

    const updatedOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);

    res.json({ item: updatedItem, order: updatedOrder, message: 'Item mapped to inventory successfully' });
  } catch (error) {
    console.error('Error linking order item:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update item delivery status
router.put('/:orderId/items/:itemId/delivery', authenticateToken, (req, res) => {
  try {
    const { orderId, itemId } = req.params;
    const { delivered_quantity } = req.body;

    const oldItem = db.prepare('SELECT * FROM order_items WHERE id = ? AND order_id = ?').get(itemId, orderId);
    if (!oldItem) {
      return res.status(404).json({ message: 'Item not found' });
    }

    if (delivered_quantity > oldItem.quantity) {
      return res.status(400).json({ message: 'Delivered quantity cannot exceed ordered quantity' });
    }

    const oldDelivered = oldItem.delivered_quantity || 0;
    const delta = delivered_quantity - oldDelivered;

    db.prepare(`
      UPDATE order_items 
      SET delivered_quantity = ?, sync_status = 'pending', sync_updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND order_id = ?
    `).run(delivered_quantity, itemId, orderId);

    // If linked to an inventory item, update the physical stock AND the price
    if (delta !== 0 && oldItem.inventory_item_id) {
      const result = db.prepare(
        'UPDATE inventory SET quantity = quantity + ?, price = ?, sync_status = \'pending\', last_updated = CURRENT_TIMESTAMP WHERE id = ?'
      ).run(delta, oldItem.unit_price, oldItem.inventory_item_id);

      const updatedInv = db.prepare('SELECT * FROM inventory WHERE id = ?').get(oldItem.inventory_item_id);
      db.prepare('INSERT INTO sync_queue (table_name, record_id, action, data) VALUES (?, ?, ?, ?)').run(
        'inventory', oldItem.inventory_item_id, 'UPDATE', JSON.stringify(updatedInv)
      );

      // Log the inflow in usage_logs
      logUsage(req.user.id, oldItem.inventory_item_id, updatedInv.name, updatedInv.quantity - delta, updatedInv.quantity, 'IN');
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
      if ((item.delivered_quantity || 0) < (item.quantity || 0)) {
        allDelivered = false;
      }
      if ((item.delivered_quantity || 0) > 0) {
        noneDelivered = false;
      }
    }

    let newDeliveryStatus = 'pending';
    if (allDelivered && items.length > 0) {
      newDeliveryStatus = 'delivered';
    } else if (!noneDelivered) {
      newDeliveryStatus = 'partial';
    }

    // Check for auto-archive: if delivered AND fully paid
    const currentOrder = db.prepare('SELECT status FROM orders WHERE id = ?').get(orderId);
    let finalArchived = 0;
    if (newDeliveryStatus === 'delivered' && currentOrder.status === 'paid') {
      finalArchived = 1;
    }

    db.prepare(`
      UPDATE orders 
      SET delivery_status = ?,
          actual_delivery_date = COALESCE(actual_delivery_date, CASE WHEN ? = 'delivered' THEN CURRENT_TIMESTAMP ELSE NULL END),
          sync_status = 'pending', 
          sync_updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(newDeliveryStatus, newDeliveryStatus, orderId);

    // Recompute full payment status so order moves from pending → partial → paid correctly
    recalculateOrderPaymentStatus(orderId);

    logAudit(Number(req.user.id), 'updated_delivery', itemId, oldItem, { delivered_quantity }, req.ip);
    res.json(updatedItem);
  } catch (error) {
    console.error('Error updating delivery status:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Mark entire order as delivered
router.put('/:id/deliver-all', authenticateToken, (req, res) => {
  try {
    const { id } = req.params;
    const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(id);
    
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
            'UPDATE inventory SET quantity = quantity + ?, price = ?, sync_status = \'pending\', last_updated = CURRENT_TIMESTAMP WHERE id = ?'
          ).run(remaining, item.unit_price, item.inventory_item_id);

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

    // Update order delivery status and recompute payment status
    db.prepare(`
      UPDATE orders 
      SET delivery_status = 'delivered', 
          actual_delivery_date = COALESCE(actual_delivery_date, CURRENT_TIMESTAMP),
          sync_status = 'pending', 
          sync_updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(id);
    recalculateOrderPaymentStatus(id);
    
    // recalculateOrderPaymentStatus above already handles archiving + sync_queue

    logAudit(Number(req.user.id), 'delivered_all', id, null, null, req.ip);
    res.json({ message: 'Order marked as fully delivered' });
  } catch (error) {
    console.error('Error marking order as delivered:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

export default router;
