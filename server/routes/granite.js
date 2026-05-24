import express from 'express';
import db from '../database.js';
import { authenticateToken } from '../middleware/auth.js';
import * as crypto from 'crypto';

const router = express.Router();

// Get all granite deliveries
router.get('/', authenticateToken, (req, res) => {
  try {
    const deliveries = db.prepare(`
      SELECT gd.*, t.plate_number as truck_plate, t.model as truck_model
      FROM granite_deliveries gd
      LEFT JOIN trucks t ON gd.truck_id = t.id
      WHERE gd.is_archived = 0
      ORDER BY gd.date DESC, gd.sync_updated_at DESC
    `).all();
    res.json(deliveries);
  } catch (error) {
    console.error('[Granite API] Get error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

// Create a new granite delivery trip
router.post('/', authenticateToken, (req, res) => {
  const { date, truck_id, driver_name, granite_type, quantity, unit_price, client_name, status } = req.body;

  if (!date || !truck_id || !driver_name || !granite_type || quantity === undefined || unit_price === undefined) {
    return res.status(400).json({ error: 'Required fields missing' });
  }

  try {
    // Verify truck exists
    const truck = db.prepare('SELECT * FROM trucks WHERE id = ?').get(truck_id);
    if (!truck) {
      return res.status(404).json({ error: 'Selected truck not found' });
    }

    const newId = crypto.randomUUID();
    const totalAmount = parseFloat(quantity) * parseFloat(unit_price);

    db.prepare(`
      INSERT INTO granite_deliveries (id, date, truck_id, driver_name, granite_type, quantity, unit_price, total_amount, client_name, status, sync_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      newId,
      date,
      truck_id,
      driver_name.trim(),
      granite_type.trim(),
      parseFloat(quantity),
      parseFloat(unit_price),
      totalAmount,
      client_name ? client_name.trim() : '',
      status || 'delivered',
      'pending'
    );

    const newTrip = db.prepare('SELECT * FROM granite_deliveries WHERE id = ?').get(newId);

    // Sync queue write
    try {
      db.prepare('INSERT INTO sync_queue (table_name, record_id, action, data) VALUES (?, ?, ?, ?)').run(
        'granite_deliveries',
        newId,
        'INSERT',
        JSON.stringify(newTrip)
      );
    } catch (e) {
      console.warn('[Granite API] Sync queue write failed (non-fatal):', e.message);
    }

    res.status(201).json(newTrip);
  } catch (error) {
    console.error('[Granite API] Create error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

// Update a granite delivery trip
router.put('/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { date, truck_id, driver_name, granite_type, quantity, unit_price, client_name, status } = req.body;

  if (!date || !truck_id || !driver_name || !granite_type || quantity === undefined || unit_price === undefined) {
    return res.status(400).json({ error: 'Required fields missing' });
  }

  try {
    const trip = db.prepare('SELECT * FROM granite_deliveries WHERE id = ?').get(id);
    if (!trip) {
      return res.status(404).json({ error: 'Granite delivery trip not found' });
    }

    // Verify truck exists
    const truck = db.prepare('SELECT * FROM trucks WHERE id = ?').get(truck_id);
    if (!truck) {
      return res.status(404).json({ error: 'Selected truck not found' });
    }

    const totalAmount = parseFloat(quantity) * parseFloat(unit_price);

    db.prepare(`
      UPDATE granite_deliveries
      SET date = ?, truck_id = ?, driver_name = ?, granite_type = ?, quantity = ?, unit_price = ?, total_amount = ?, client_name = ?, status = ?, sync_status = ?, sync_updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      date,
      truck_id,
      driver_name.trim(),
      granite_type.trim(),
      parseFloat(quantity),
      parseFloat(unit_price),
      totalAmount,
      client_name ? client_name.trim() : '',
      status || 'delivered',
      'pending',
      id
    );

    const updated = db.prepare('SELECT * FROM granite_deliveries WHERE id = ?').get(id);

    // Sync queue write
    try {
      db.prepare('INSERT INTO sync_queue (table_name, record_id, action, data) VALUES (?, ?, ?, ?)').run(
        'granite_deliveries',
        id,
        'UPDATE',
        JSON.stringify(updated)
      );
    } catch (e) {
      console.warn('[Granite API] Sync queue write failed (non-fatal):', e.message);
    }

    res.json(updated);
  } catch (error) {
    console.error('[Granite API] Update error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

// Soft delete / archive a granite delivery trip
router.delete('/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  try {
    const trip = db.prepare('SELECT * FROM granite_deliveries WHERE id = ?').get(id);
    if (!trip) {
      return res.status(404).json({ error: 'Granite delivery trip not found' });
    }

    db.prepare('UPDATE granite_deliveries SET is_archived = 1, sync_status = ?, sync_updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('pending', id);

    const updated = db.prepare('SELECT * FROM granite_deliveries WHERE id = ?').get(id);

    try {
      db.prepare('INSERT INTO sync_queue (table_name, record_id, action, data) VALUES (?, ?, ?, ?)').run(
        'granite_deliveries',
        id,
        'UPDATE',
        JSON.stringify(updated)
      );
    } catch (e) {
      console.warn('[Granite API] Sync queue write failed (non-fatal):', e.message);
    }

    res.json({ message: 'Granite delivery trip archived successfully', trip: updated });
  } catch (error) {
    console.error('[Granite API] Delete error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

export default router;
