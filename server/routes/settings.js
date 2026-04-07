import express from 'express';
import db from '../database.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = express.Router();

// Get all settings
router.get('/', authenticateToken, (req, res) => {
  try {
    const settings = db.prepare('SELECT * FROM settings').all();
    const settingsMap = settings.reduce((acc, curr) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {});
    res.json(settingsMap);
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update settings (Admin only)
router.post('/', authenticateToken, requireRole('admin'), (req, res) => {
  try {
    const updates = req.body;
    const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    
    const transaction = db.transaction((items) => {
      for (const [key, value] of Object.entries(items)) {
        stmt.run(key, String(value));
      }
    });

    transaction(updates);
    res.json({ message: 'Settings updated successfully' });
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Factory Reset (Admin only) - Clears all local data including settings
router.delete('/factory-reset', authenticateToken, requireRole('admin'), (req, res) => {
  try {
    const tablesToClear = [
      'inventory', 'categories', 'suppliers', 'orders', 'order_items', 'payments', 
      'usage_logs', 'audit_logs', 'sync_queue', 'sync_meta', 'settings'
    ];
    
    // Explicit list of internal settings we MUST NOT delete
    const protectedKeys = ["db_created_at"];
    
    const transaction = db.transaction(() => {
      db.prepare('PRAGMA foreign_keys = OFF').run();
      
      for (const table of tablesToClear) {
        try {
          if (table === 'settings') {
             db.prepare(`DELETE FROM settings WHERE key NOT IN (${protectedKeys.map(() => '?').join(',')})`).run(...protectedKeys);
          } else {
             db.prepare(`DELETE FROM ${table}`).run();
          }
        } catch(e) {
          console.error(`[Settings] Failed to clear ${table}:`, e.message);
        }
      }
      
      db.prepare('PRAGMA foreign_keys = ON').run();
    });
    
    transaction();
    res.json({ message: 'Factory reset successful. All local data cleared.' });
  } catch (error) {
    console.error('Error during factory reset:', error);
    db.prepare('PRAGMA foreign_keys = ON').run();
    res.status(500).json({ error: 'Internal server error during factory reset' });
  }
});

/**
 * Purge Local Data (Specific to fixing "Poisoning")
 * Similar to factory reset but keeps user sessions and focus on sync state.
 */
router.post('/purge-local', authenticateToken, requireRole('admin'), (req, res) => {
  try {
    const syncTables = ['inventory', 'categories', 'suppliers', 'orders', 'order_items', 'payments', 'usage_logs', 'sync_meta'];
    
    const transaction = db.transaction(() => {
      db.prepare('PRAGMA foreign_keys = OFF').run();
      for (const table of syncTables) {
        db.prepare(`DELETE FROM ${table}`).run();
      }
      db.prepare('PRAGMA foreign_keys = ON').run();
    });
    
    transaction();
    res.json({ message: 'Local data purged. App will re-pull from cloud on next sync.' });
  } catch (error) {
    res.status(500).json({ error: 'Purge failed', message: error.message });
  }
});

export default router;
