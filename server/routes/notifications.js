import express from 'express';
import db from '../database.js';
import { authenticateToken } from '../middleware/auth.js';
import * as crypto from 'crypto';

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// ATTENDANCE DEVICE CAPTURE — no auth required, wide-open CORS
// Mounted directly at /api/notifications to listen for OPTIONS and GET requests
// from the biometric device.
// ─────────────────────────────────────────────────────────────────────────────

// CORS middleware applied to all requests in this router
const deviceCors = (_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type');
  next();
};

// Handle pre-flight OPTIONS on /api/notifications root
router.options('/', deviceCors, (_req, res) => res.sendStatus(200));

// Map numeric status / direction codes from the device
function mapDirection(raw) {
  const v = String(raw ?? '').toLowerCase();
  if (v === '0' || v === 'in')        return 'in';
  if (v === '1' || v === 'out')       return 'out';
  if (v === '2' || v === 'break_out') return 'break_out';
  if (v === '3' || v === 'break_in')  return 'break_in';
  return 'unknown';
}

function mapVerification(raw) {
  const v = String(raw ?? '').toLowerCase();
  if (v === '1'  || v.includes('finger')) return 'fingerprint';
  if (v === '15' || v.includes('face'))   return 'face';
  if (v === '4'  || v.includes('card'))   return 'card';
  if (v === '3'  || v.includes('pass'))   return 'password';
  return 'unknown';
}

// GET /api/notifications — handles both biometric device pushes (if query params match)
// and standard dashboard notification fetches (requiring token auth).
router.get('/', deviceCors, (req, res, next) => {
  const enrollId  = req.query.user_id   ?? req.query.UserID   ?? req.query.EnrollNumber ?? req.query.uid   ?? null;
  const timestamp = req.query.timestamp ?? req.query.Timestamp ?? req.query.time          ?? null;

  if (enrollId || timestamp) {
    try {
      const devSn     = req.query.sn        ?? req.query.SN        ?? req.query.DeviceID      ?? null;
      const statusRaw = req.query.status    ?? req.query.Status    ?? req.query.direction      ?? '0';
      const verifyRaw = req.query.verify    ?? req.query.Verify    ?? req.query.VerifyMode     ?? '1';

      if (!enrollId || !timestamp) {
        console.warn('[Device] GET /api/notifications — missing enrollId or timestamp:', req.query);
        return res.status(200).send('OK: 0');
      }

      const direction = mapDirection(statusRaw);
      const method    = mapVerification(verifyRaw);

      let isoTs;
      try {
        isoTs = new Date(timestamp.replace(' ', 'T')).toISOString();
      } catch {
        isoTs = new Date().toISOString();
      }

      // Look up employee by device_enroll_id
      const emp = db.prepare(
        'SELECT id FROM employees WHERE device_enroll_id = ? AND is_archived = 0 LIMIT 1'
      ).get(String(enrollId).trim());

      const logId     = crypto.randomUUID();
      const empId     = emp?.id ?? null;
      const enrollStr = String(enrollId).trim();

      // Insert into local SQLite
      const result = db.prepare(`
        INSERT OR IGNORE INTO attendance
          (id, employee_id, device_enroll_id, timestamp, verification_method, direction, source, sync_status)
        VALUES (?, ?, ?, ?, ?, ?, 'online_push', 'pending')
      `).run(logId, empId, enrollStr, isoTs, method, direction);

      if (result.changes > 0) {
        try {
          db.prepare(`
            INSERT INTO sync_queue (table_name, record_id, action, data)
            VALUES ('attendance', ?, 'INSERT', ?)
          `).run(logId, JSON.stringify({
            id: logId, employee_id: empId, device_enroll_id: enrollStr,
            timestamp: isoTs, verification_method: method, direction,
            source: 'online_push', device_sn: devSn
          }));
        } catch (e) {
          console.warn('[Device] sync_queue write failed (non-fatal):', e.message);
        }
        console.log(`[Device] ✅ Attendance recorded — enrollId=${enrollStr}  ts=${isoTs}  dir=${direction}`);
      }

      return res.status(200).send('OK: 1');
    } catch (err) {
      console.error('[Device] GET /api/notifications error:', err);
      return res.status(200).send('OK: 0');
    }
  }

  // Standard notification fetch (requires authentication)
  authenticateToken(req, res, (err) => {
    if (err) return next(err);
    try {
      const notifications = db.prepare('SELECT * FROM notifications ORDER BY created_at DESC LIMIT 100').all();
      res.json(notifications);
    } catch (error) {
      console.error('[Notifications API] Get error:', error);
      res.status(500).json({ error: 'Internal server error', message: error.message });
    }
  });
});

// POST /api/notifications — handles POST device pushes
router.post('/', deviceCors, (req, res, next) => {
  req.query = { ...req.body, ...req.query };
  const enrollId  = req.query.user_id   ?? req.query.UserID   ?? req.query.EnrollNumber ?? req.query.uid   ?? null;
  const timestamp = req.query.timestamp ?? req.query.Timestamp ?? req.query.time          ?? null;

  if (enrollId || timestamp) {
    try {
      const devSn     = req.query.sn        ?? req.query.SN        ?? req.query.DeviceID      ?? null;
      const statusRaw = req.query.status    ?? req.query.Status    ?? req.query.direction      ?? '0';
      const verifyRaw = req.query.verify    ?? req.query.Verify    ?? req.query.VerifyMode     ?? '1';

      if (!enrollId || !timestamp) {
        return res.status(200).send('OK: 0');
      }

      const direction = mapDirection(statusRaw);
      const method    = mapVerification(verifyRaw);

      let isoTs;
      try { isoTs = new Date(String(timestamp).replace(' ', 'T')).toISOString(); }
      catch { isoTs = new Date().toISOString(); }

      const emp       = db.prepare('SELECT id FROM employees WHERE device_enroll_id = ? AND is_archived = 0 LIMIT 1').get(String(enrollId).trim());
      const logId     = crypto.randomUUID();
      const empId     = emp?.id ?? null;
      const enrollStr = String(enrollId).trim();

      const result = db.prepare(`
        INSERT OR IGNORE INTO attendance
          (id, employee_id, device_enroll_id, timestamp, verification_method, direction, source, sync_status)
        VALUES (?, ?, ?, ?, ?, ?, 'online_push', 'pending')
      `).run(logId, empId, enrollStr, isoTs, method, direction);

      if (result.changes > 0) {
        try {
          db.prepare(`INSERT INTO sync_queue (table_name, record_id, action, data) VALUES ('attendance', ?, 'INSERT', ?)`)
            .run(logId, JSON.stringify({ id: logId, employee_id: empId, device_enroll_id: enrollStr, timestamp: isoTs, verification_method: method, direction, source: 'online_push', device_sn: devSn }));
        } catch (e) {}
      }
      return res.status(200).send('OK: 1');
    } catch (err) {
      console.error('[Device] POST /api/notifications error:', err);
      return res.status(200).send('OK: 0');
    }
  }

  res.status(405).json({ error: 'Method Not Allowed' });
});
// ─────────────────────────────────────────────────────────────────────────────

// Get all notifications
router.get('/', authenticateToken, (req, res) => {
  try {
    const notifications = db.prepare('SELECT * FROM notifications ORDER BY created_at DESC LIMIT 100').all();
    res.json(notifications);
  } catch (error) {
    console.error('[Notifications API] Get error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

// Mark a single notification as read
router.put('/:id/read', authenticateToken, (req, res) => {
  const { id } = req.params;
  try {
    const notification = db.prepare('SELECT * FROM notifications WHERE id = ?').get(id);
    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    db.prepare('UPDATE notifications SET is_read = 1, sync_status = ?, sync_updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('pending', id);
    const updated = db.prepare('SELECT * FROM notifications WHERE id = ?').get(id);

    // Queue for sync
    try {
      db.prepare('INSERT INTO sync_queue (table_name, record_id, action, data) VALUES (?, ?, ?, ?)').run(
        'notifications',
        id,
        'UPDATE',
        JSON.stringify(updated)
      );
    } catch (e) {
      console.warn('[Notifications API] Sync queue write failed (non-fatal):', e.message);
    }

    res.json(updated);
  } catch (error) {
    console.error('[Notifications API] Read update error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

// Mark all notifications as read
router.put('/read-all', authenticateToken, (req, res) => {
  try {
    const unread = db.prepare('SELECT id FROM notifications WHERE is_read = 0').all();
    if (unread.length === 0) {
      return res.json({ message: 'No unread notifications' });
    }

    db.transaction(() => {
      for (const notif of unread) {
        db.prepare('UPDATE notifications SET is_read = 1, sync_status = ?, sync_updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('pending', notif.id);
        const updated = db.prepare('SELECT * FROM notifications WHERE id = ?').get(notif.id);
        try {
          db.prepare('INSERT INTO sync_queue (table_name, record_id, action, data) VALUES (?, ?, ?, ?)').run(
            'notifications',
            notif.id,
            'UPDATE',
            JSON.stringify(updated)
          );
        } catch (e) {}
      }
    })();

    res.json({ message: 'All notifications marked as read', count: unread.length });
  } catch (error) {
    console.error('[Notifications API] Read-all error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

// Delete a single notification
router.delete('/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  try {
    const notification = db.prepare('SELECT * FROM notifications WHERE id = ?').get(id);
    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    db.prepare('DELETE FROM notifications WHERE id = ?').run(id);

    // Queue for sync
    try {
      db.prepare('INSERT INTO sync_queue (table_name, record_id, action, data) VALUES (?, ?, ?, ?)').run(
        'notifications',
        id,
        'DELETE',
        JSON.stringify({ id })
      );
    } catch (e) {
      console.warn('[Notifications API] Sync queue delete write failed (non-fatal):', e.message);
    }

    res.json({ message: 'Notification deleted successfully' });
  } catch (error) {
    console.error('[Notifications API] Delete error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

// Delete all notifications
router.delete('/', authenticateToken, (req, res) => {
  try {
    const all = db.prepare('SELECT id FROM notifications').all();
    
    db.transaction(() => {
      db.prepare('DELETE FROM notifications').run();
      for (const notif of all) {
        try {
          db.prepare('INSERT INTO sync_queue (table_name, record_id, action, data) VALUES (?, ?, ?, ?)').run(
            'notifications',
            notif.id,
            'DELETE',
            JSON.stringify({ id: notif.id })
          );
        } catch (e) {}
      }
    })();

    res.json({ message: 'All notifications deleted', count: all.length });
  } catch (error) {
    console.error('[Notifications API] Delete-all error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

export default router;
