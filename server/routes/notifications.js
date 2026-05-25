import express from 'express';
import db from '../database.js';
import { authenticateToken } from '../middleware/auth.js';
import * as crypto from 'crypto';

const router = express.Router();

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
