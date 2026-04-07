import express from 'express';
import dns from 'dns';
import { promisify } from 'util';
import db from '../database.js';
import { supabase, isSupabaseConfigured } from '../supabaseClient.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();
const resolveDns = promisify(dns.resolve);

/** Determine if we have internet connection by trying to reach multiple endpoints */
async function isOnline() {
  try {
    // Try primary DNS lookup first
    await resolveDns('supabase.co');
    return true;
  } catch (e) {
    // Fallback: ping a public API if DNS fails (may be blocked in some envs)
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const res = await fetch('https://www.google.com/favicon.ico', { signal: controller.signal });
      clearTimeout(timeout);
      return res.ok;
    } catch (err) {
      return false;
    }
  }
}

/** 
 * Status endpoint used by the frontend to see if sync is needed 
 */
router.get('/status', async (req, res) => {
  try {
    const queueCount = db.prepare("SELECT COUNT(*) as count FROM sync_queue WHERE synced = 0").get().count;
    
    let hasPulledBefore = false;
    try {
      const metaCount = db.prepare("SELECT COUNT(*) as c FROM sqlite_master WHERE type='table' AND name='sync_meta'").get().c;
      if (metaCount > 0) {
        const rowCount = db.prepare("SELECT COUNT(*) as c FROM sync_meta").get().c;
        hasPulledBefore = rowCount > 0;
      }
    } catch(e) {
      // Ignore
    }

    res.json({
      pendingItems: queueCount,
      configured: isSupabaseConfigured(),
      online: await isOnline(),
      hasPulledBefore
    });
  } catch (error) {
    console.error('[Sync] Status error:', error);
    res.status(500).json({ error: 'Failed to get sync status', message: error.message });
  }
});

/** 
 * Extended diagnostics for troubleshooting 
 */
router.get('/diagnostics', async (req, res) => {
  try {
    const { getSupabaseDiagnostics } = await import('../supabaseClient.js');
    const diag = getSupabaseDiagnostics();
    const online = await isOnline();
    
    res.json({
      ...diag,
      isOnline: online,
      navigatorOnline: req.headers['x-navigator-online'] === 'true', // Optional hint from browser
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: 'Diagnostics failed', message: error.message });
  }
});

/**
 * PUSH operation: send all local unsynced changes to Supabase
 */
router.post('/push', async (req, res) => {
  if (!isSupabaseConfigured()) {
    return res.status(400).json({ error: 'Supabase is not configured' });
  }

  const online = await isOnline();
  if (!online) {
    return res.status(503).json({ error: 'Offline', message: 'No internet connection' });
  }

  try {
    // 1. Get all pending items ordered by oldest first
    const pendingItems = db.prepare("SELECT * FROM sync_queue WHERE synced = 0 ORDER BY created_at ASC").all();
    
    if (pendingItems.length === 0) {
      return res.json({ success: true, message: 'Nothing to push', pushed: 0 });
    }

    let successCount = 0;

    // 2. Process each item (super naive loop for demonstration — production would batch)
    for (const item of pendingItems) {
      const data = JSON.parse(item.data);
      const tableName = item.table_name;
      
      let pushError = null;

      try {
        if (item.action === 'INSERT' || item.action === 'UPDATE') {
          // Both are handled via upset in Supabase to maintain id consistency
          // Note: ensuring SQLite IDs match Supabase IDs requires care, but we trust local DB
          const { error } = await supabase
            .from(tableName)
            .upsert(data, { onConflict: 'id' });
          pushError = error;
          
        } else if (item.action === 'DELETE') {
          const { error } = await supabase
            .from(tableName)
            .delete()
            .eq('id', item.record_id);
          pushError = error;
        }

        if (pushError) {
          console.error(`[Sync] Push failed for ${tableName} id=${item.record_id}:`, pushError.message);
          // Update queue entry with error note
          db.prepare("UPDATE sync_queue SET data = ? WHERE id = ?").run(
            JSON.stringify({ ...data, _sync_error: pushError.message }),
            item.id
          );
        } else {
          // Success: mark as synced in queue
          db.prepare("UPDATE sync_queue SET synced = 1 WHERE id = ?").run(item.id);
          
          // Also mark the actual record as 'synced' in its home table (if it wasn't deleted)
          if (item.action !== 'DELETE') {
            try {
              db.prepare(`UPDATE ${tableName} SET sync_status = 'synced' WHERE id = ?`).run(item.record_id);
            } catch (e) {
              // Ignore if table lacks sync_status column
            }
          }
          
          successCount++;
        }
      } catch (err) {
        console.error(`[Sync] Exceptional error processing item ${item.id}:`, err);
      }
    }

    res.json({ success: true, pushed: successCount, total: pendingItems.length });
  } catch (error) {
    console.error('[Sync] Push error:', error);
    res.status(500).json({ error: 'Failed to push changes to Supabase', message: error.message });
  }
});

/**
 * PULL operation: fetch remote changes and apply locally
 */
router.get('/pull', async (req, res) => {
  if (!isSupabaseConfigured()) {
    return res.status(400).json({ error: 'Supabase is not configured' });
  }

  const online = await isOnline();
  if (!online) {
    return res.status(503).json({ error: 'Offline', message: 'No internet connection' });
  }

  try {
    const tablesToSync = ['inventory', 'categories', 'suppliers', 'orders', 'order_items', 'payments', 'usage_logs'];
    
    const tableTimeCols = {
      inventory: 'updated_at',
      categories: 'created_at',
      suppliers: 'updated_at',
      orders: 'updated_at',
      order_items: null, // No timestamp column, full sync
      payments: 'created_at',
      usage_logs: 'timestamp'
    };

    db.exec(`CREATE TABLE IF NOT EXISTS sync_meta (table_name TEXT PRIMARY KEY, last_pulled DATETIME)`);
    
    let totalPulled = 0;

    for (const table of tablesToSync) {
      const meta = db.prepare("SELECT last_pulled FROM sync_meta WHERE table_name = ?").get(table);
      const lastPulled = meta ? meta.last_pulled : '1970-01-01T00:00:00.000Z';
      const timeCol = tableTimeCols[table];

      let query = supabase.from(table).select('*');
      
      if (timeCol) {
        query = query.gt(timeCol, lastPulled).order(timeCol, { ascending: true });
      }

      const { data: remoteData, error } = await query;

      if (error) {
        console.error(`[Sync] Pull failed for table ${table}:`, error.message);
        continue;
      }

      if (!remoteData || remoteData.length === 0) continue;

      const localColumns = new Set(
        db.prepare(`PRAGMA table_info(${table})`).all().map(col => col.name)
      );

      for (const row of remoteData) {
        const filteredKeys = Object.keys(row).filter(k => localColumns.has(k));
        if (filteredKeys.length === 0) continue;

        const placeholders = filteredKeys.map(() => '?').join(', ');
        const values = filteredKeys.map(k => row[k]);

        try {
          db.prepare(`INSERT OR REPLACE INTO ${table} (${filteredKeys.join(', ')}) VALUES (${placeholders})`).run(...values);
          totalPulled++;
        } catch (e) {
          console.error(`[Sync] Local upsert failed for ${table} row ${row.id}:`, e.message);
        }
      }

      if (timeCol) {
        const newestDate = remoteData[remoteData.length - 1][timeCol];
        if (newestDate) {
          db.prepare(`INSERT OR REPLACE INTO sync_meta (table_name, last_pulled) VALUES (?, ?)`).run(table, newestDate);
        }
      } else {
        db.prepare(`INSERT OR REPLACE INTO sync_meta (table_name, last_pulled) VALUES (?, ?)`).run(table, new Date().toISOString());
      }
    }

    // --- GHOST RECOVERY (Clean up deletions) ---
    // For critical tables, ensure local matches cloud IDs. 
    // If it's missing from cloud, we archive it locally.
    const cleanupTables = ['inventory', 'orders', 'categories', 'suppliers'];
    for (const table of cleanupTables) {
      try {
        const { data: cloudIds, error } = await supabase.from(table).select('id');
        if (error) throw error;

        if (cloudIds) {
          const cloudIdSet = new Set(cloudIds.map(row => row.id));
          const localItems = db.prepare(`SELECT id, is_archived FROM ${table}`).all();
          
          for (const local of localItems) {
            // If local item is NOT in cloud AND it's NOT already archived locally
            if (!cloudIdSet.has(local.id) && local.is_archived === 0) {
              console.log(`[Sync] Ghost Recovery: Archiving ${table} id=${local.id} (missing from cloud)`);
              db.prepare(`UPDATE ${table} SET is_archived = 1, sync_status = 'synced' WHERE id = ?`).run(local.id);
            }
          }
        }
      } catch (e) {
        console.error(`[Sync] Cleanup failed for ${table}:`, e.message);
      }
    }

    res.json({ success: true, pulled: totalPulled });
  } catch (error) {
    console.error('[Sync] Pull error:', error);
    res.status(500).json({ error: 'Failed to pull changes from Supabase', message: error.message });
  }
});

export default router;
