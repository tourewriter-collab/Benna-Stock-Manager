import express from 'express';
import db from '../database.js';
import { authenticateToken } from '../middleware/auth.js';
import * as crypto from 'crypto';

const router = express.Router();

// Get all trucks (excluding archived ones)
router.get('/', authenticateToken, (req, res) => {
  try {
    const trucks = db.prepare('SELECT * FROM trucks WHERE is_archived = 0 ORDER BY plate_number ASC').all();
    res.json(trucks);
  } catch (error) {
    console.error('[Trucks API] Get error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

// Get a single truck
router.get('/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  try {
    const truck = db.prepare('SELECT * FROM trucks WHERE id = ? AND is_archived = 0').get(id);
    if (!truck) {
      return res.status(404).json({ error: 'Truck not found' });
    }
    res.json(truck);
  } catch (error) {
    console.error('[Trucks API] Get single error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create a new truck
router.post('/', authenticateToken, (req, res) => {
  const { plate_number, model, capacity, status } = req.body;

  if (!plate_number) {
    return res.status(400).json({ error: 'Plate number is required' });
  }

  try {
    // Check if plate number already exists in active trucks
    const existingActive = db.prepare('SELECT * FROM trucks WHERE LOWER(TRIM(plate_number)) = LOWER(TRIM(?)) AND is_archived = 0').get(plate_number);
    if (existingActive) {
      return res.status(400).json({ error: 'A truck with this plate number already exists' });
    }

    const existingArchived = db.prepare('SELECT * FROM trucks WHERE LOWER(TRIM(plate_number)) = LOWER(TRIM(?)) AND is_archived = 1').get(plate_number);
    
    let newId;

    if (existingArchived) {
      newId = existingArchived.id;
      db.prepare(
        'UPDATE trucks SET model = ?, capacity = ?, status = ?, is_archived = 0, sync_status = ?, sync_updated_at = CURRENT_TIMESTAMP WHERE id = ?'
      ).run(
        model || '',
        capacity ? parseFloat(capacity) : 0,
        status || 'active',
        'pending',
        newId
      );
    } else {
      newId = crypto.randomUUID();
      db.prepare(
        'INSERT INTO trucks (id, plate_number, model, capacity, status, sync_status) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(
        newId,
        plate_number.trim(),
        model || '',
        capacity ? parseFloat(capacity) : 0,
        status || 'active',
        'pending'
      );
    }

    const newTruck = db.prepare('SELECT * FROM trucks WHERE id = ?').get(newId);

    // Add to sync queue for cloud sync
    try {
      db.prepare('INSERT INTO sync_queue (table_name, record_id, action, data) VALUES (?, ?, ?, ?)').run(
        'trucks',
        newId,
        'INSERT',
        JSON.stringify(newTruck)
      );
    } catch (e) {
      console.warn('[Trucks API] Sync queue write failed (non-fatal):', e.message);
    }

    res.status(201).json(newTruck);
  } catch (error) {
    console.error('[Trucks API] Create error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

// Update an existing truck
router.put('/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { plate_number, model, capacity, status } = req.body;

  if (!plate_number) {
    return res.status(400).json({ error: 'Plate number is required' });
  }

  try {
    const truck = db.prepare('SELECT * FROM trucks WHERE id = ?').get(id);
    if (!truck) {
      return res.status(404).json({ error: 'Truck not found' });
    }

    // Check unique plate number constraint
    const existing = db.prepare('SELECT * FROM trucks WHERE LOWER(TRIM(plate_number)) = LOWER(TRIM(?)) AND id != ? AND is_archived = 0').get(plate_number, id);
    if (existing) {
      return res.status(400).json({ error: 'Another truck with this plate number already exists' });
    }

    db.prepare(
      'UPDATE trucks SET plate_number = ?, model = ?, capacity = ?, status = ?, sync_status = ?, sync_updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(
      plate_number.trim(),
      model || '',
      capacity ? parseFloat(capacity) : 0,
      status || 'active',
      'pending',
      id
    );

    const updatedTruck = db.prepare('SELECT * FROM trucks WHERE id = ?').get(id);

    // Add to sync queue for cloud sync
    try {
      db.prepare('INSERT INTO sync_queue (table_name, record_id, action, data) VALUES (?, ?, ?, ?)').run(
        'trucks',
        id,
        'UPDATE',
        JSON.stringify(updatedTruck)
      );
    } catch (e) {
      console.warn('[Trucks API] Sync queue write failed (non-fatal):', e.message);
    }

    res.json(updatedTruck);
  } catch (error) {
    console.error('[Trucks API] Update error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

// Archive (soft delete) a truck
router.delete('/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  try {
    const truck = db.prepare('SELECT * FROM trucks WHERE id = ?').get(id);
    if (!truck) {
      return res.status(404).json({ error: 'Truck not found' });
    }

    db.prepare('UPDATE trucks SET is_archived = 1, sync_status = ?, sync_updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('pending', id);

    const updated = db.prepare('SELECT * FROM trucks WHERE id = ?').get(id);

    try {
      db.prepare('INSERT INTO sync_queue (table_name, record_id, action, data) VALUES (?, ?, ?, ?)').run(
        'trucks',
        id,
        'UPDATE',
        JSON.stringify(updated)
      );
    } catch (e) {
      console.warn('[Trucks API] Sync queue write failed (non-fatal):', e.message);
    }

    res.json({ message: 'Truck archived successfully', truck: updated });
  } catch (error) {
    console.error('[Trucks API] Archive error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

// Get real-time cost of spare parts and maintenance logs consumed for this truck
router.get('/:id/expenses', authenticateToken, (req, res) => {
  const { id } = req.params;
  try {
    const truck = db.prepare('SELECT * FROM trucks WHERE id = ?').get(id);
    if (!truck) {
      return res.status(404).json({ error: 'Truck not found' });
    }

    // Match either by UUID id or plate number string in the usage_logs.truck_id field
    const query = `
      SELECT 
        ul.id,
        ul.item_name,
        ul.quantity_changed,
        ul.timestamp,
        ul.transaction_type,
        ul.authorized_by_name,
        ul.authorized_by_title,
        COALESCE(i.price, 0) as unit_price,
        (ul.quantity_changed * COALESCE(i.price, 0)) as total_cost
      FROM usage_logs ul
      LEFT JOIN inventory i ON ul.inventory_item_id = i.id
      WHERE ul.truck_id = ? OR ul.truck_id = ?
      ORDER BY ul.timestamp DESC
    `;

    const expenses = db.prepare(query).all(truck.id, truck.plate_number);
    res.json(expenses);
  } catch (error) {
    console.error('[Trucks API] Expenses get error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

// Update truck location (GPS update)
router.post('/:id/location', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { latitude, longitude } = req.body;

  if (latitude === undefined || longitude === undefined) {
    return res.status(400).json({ error: 'Latitude and longitude are required' });
  }

  try {
    const truck = db.prepare('SELECT * FROM trucks WHERE id = ?').get(id);
    if (!truck) {
      return res.status(404).json({ error: 'Truck not found' });
    }

    const last_location_update = new Date().toISOString();
    
    db.prepare(
      'UPDATE trucks SET latitude = ?, longitude = ?, last_location_update = ?, sync_status = ?, sync_updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(
      latitude !== null ? parseFloat(latitude) : null,
      longitude !== null ? parseFloat(longitude) : null,
      last_location_update,
      'pending',
      id
    );

    const updatedTruck = db.prepare('SELECT * FROM trucks WHERE id = ?').get(id);

    // Add to sync queue for cloud sync
    try {
      db.prepare('INSERT INTO sync_queue (table_name, record_id, action, data) VALUES (?, ?, ?, ?)').run(
        'trucks',
        id,
        'UPDATE',
        JSON.stringify(updatedTruck)
      );
    } catch (e) {
      console.warn('[Trucks API] Sync queue write failed (non-fatal):', e.message);
    }

    res.json(updatedTruck);
  } catch (error) {
    console.error('[Trucks API] Location update error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

export default router;

