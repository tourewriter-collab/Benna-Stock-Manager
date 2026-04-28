import express from 'express';
import bcrypt from 'bcryptjs';
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

// Full Reset (Cloud + Local) - Admin only, requires password
router.post('/full-reset', authenticateToken, requireRole('admin'), async (req, res) => {
  const { password, options } = req.body;
  
  if (!password) {
    return res.status(400).json({ error: 'Admin password is required for full reset' });
  }

  try {
    // 1. Verify password
    const user = db.prepare('SELECT password FROM users WHERE id = ?').get(req.user.id);
    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'Invalid admin password' });
    }

    // Map options to tables (ORDER MATTERS for foreign keys)
    const tableMap = {
      usage: ['usage_logs'],
      payments: ['payments'],
      orders: ['order_items', 'orders'],
      inventory: ['inventory'],
      base_data: ['categories', 'suppliers'],
      audit: ['audit_logs']
    };

    // We define a strict deletion order to avoid FK issues in the cloud
    const deletionPriority = [
      'usage_logs', 'payments', 'order_items', 'orders', 
      'inventory', 'categories', 'suppliers', 'audit_logs'
    ];

    const selectedOptions = Object.entries(options || {})
      .filter(([_, enabled]) => enabled)
      .map(([opt, _]) => opt);

    const tablesToClear = deletionPriority.filter(table => {
      return selectedOptions.some(opt => tableMap[opt]?.includes(table));
    });

    console.log('[Settings] Starting Full Reset. Options:', options);
    console.log('[Settings] Final tables to clear (ordered):', tablesToClear);

    if (tablesToClear.length === 0) {
      return res.status(400).json({ error: 'No data categories selected for reset' });
    }

    // 2. Clear Local Database
    try {
      db.pragma('foreign_keys = OFF');
      const localTransaction = db.transaction(() => {
        for (const table of tablesToClear) {
          console.log(`[Settings] Clearing local table: ${table}`);
          db.prepare(`DELETE FROM ${table}`).run();
        }
        
        // If inventory or base data was cleared, we should also clear sync state
        if (options.inventory || options.base_data || options.orders) {
          console.log('[Settings] Clearing sync metadata...');
          db.prepare("DELETE FROM sync_queue").run();
          db.prepare("DELETE FROM sync_meta").run();
          db.prepare("DELETE FROM settings WHERE key NOT IN ('db_created_at', 'company_name')").run();
        }
      });
      localTransaction();
      db.pragma('foreign_keys = ON');
      console.log('[Settings] Local database cleared successfully.');
    } catch (localError) {
      db.pragma('foreign_keys = ON');
      console.error('[Settings] Local reset failed:', localError);
      throw new Error(`Local reset failed: ${localError.message}`);
    }

    // 3. Clear Cloud Database (if configured)
    const { supabase, isSupabaseConfigured } = await import('../supabaseClient.js');
    if (isSupabaseConfigured()) {
      console.log(`[Settings] Resetting cloud tables: ${tablesToClear.join(', ')}`);
      for (const table of tablesToClear) {
        // Use a filter that matches all rows (UUID neq zero)
        const { error } = await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
        if (error) {
          console.warn(`[Settings] Cloud reset failed for ${table}:`, error.message);
        }
      }
    }

    res.json({ message: 'Selective reset successful. Data cleared on local and cloud.' });
  } catch (error) {
    console.error('Error during full reset:', error);
    res.status(500).json({ error: 'Full reset failed', message: error.message });
  }
});

export default router;
