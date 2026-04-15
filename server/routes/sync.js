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
    // Fallback 1: Try to reach Supabase directly if possible
    const { getSupabaseDiagnostics } = await import('../supabaseClient.js');
    const diag = getSupabaseDiagnostics();
    if (diag.hasUrl && diag.urlValid) {
       try {
         const res = await fetch(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, { method: 'HEAD' });
         if (res.ok) return true;
       } catch(err) { /* ignore */ }
    }

    // Fallback 2: ping a public API
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
    
    const queueCount = db.prepare("SELECT COUNT(*) as count FROM sync_queue WHERE synced = 0").get().count;
    
    res.json({
      ...diag,
      isOnline: online,
      pendingItems: queueCount,
      navigatorOnline: req.headers['x-navigator-online'] === 'true',
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
    const { getSupabaseDiagnostics } = await import('../supabaseClient.js');
    return res.status(400).json({ 
      error: 'Supabase is not configured', 
      details: getSupabaseDiagnostics() 
    });
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

    // 2. Group items by Table and Action to enable batching
    const groups = {};
    pendingItems.forEach(item => {
      const key = `${item.table_name}:${item.action}`;
      if (!groups[key]) groups[key] = { table: item.table_name, action: item.action, items: [] };
      groups[key].items.push(item);
    });

    let successTotal = 0;

    // 3. Process groups
    for (const key of Object.keys(groups)) {
      const { table, action, items } = groups[key];
      
      try {
        if (action === 'INSERT' || action === 'UPDATE') {
          // Supabase upsert works with an array of objects
          const payloads = items.map(it => JSON.parse(it.data));
          
          const { error } = await supabase
            .from(table)
            .upsert(payloads, { onConflict: 'id' });

          if (error) {
            console.error(`[Sync] Batch Push failed for ${table}:`, error.message);
            // Mark individual errors
            items.forEach(it => {
               db.prepare("UPDATE sync_queue SET synced = 0, data = ? WHERE id = ?").run(
                 JSON.stringify({ ...JSON.parse(it.data), _sync_error: error.message }),
                 it.id
               );
            });
          } else {
            // Success: mark all in this batch as synced
            const itemIds = items.map(it => it.id);
            const placeholders = itemIds.map(() => '?').join(',');
            db.prepare(`UPDATE sync_queue SET synced = 1 WHERE id IN (${placeholders})`).run(...itemIds);
            
            // Mark local records as synced
            const recordIds = items.map(it => it.record_id);
            const recPlaceholders = recordIds.map(() => '?').join(',');
            try {
              db.prepare(`UPDATE ${table} SET sync_status = 'synced' WHERE id IN (${recPlaceholders})`).run(...recordIds);
            } catch (e) { /* Ignore if no sync_status column */ }
            
            successTotal += items.length;
          }
        } else if (action === 'DELETE') {
          // Process deletes sequentially but quickly (Supabase doesn't have a batch 'IN' delete via simple JS client yet)
          for (const it of items) {
            const { error } = await supabase.from(table).delete().eq('id', it.record_id);
            if (!error) {
              db.prepare("UPDATE sync_queue SET synced = 1 WHERE id = ?").run(it.id);
              successTotal++;
            }
          }
        }
      } catch (err) {
        console.error(`[Sync] Critical failure in batch ${key}:`, err);
      }
    }

    res.json({ success: true, pushed: successTotal, total: pendingItems.length });
  } catch (error) {
    console.error('[Sync] General Push error:', error);
    res.status(500).json({ error: 'Sync Push failed', message: error.message });
  }
});

/**
 * PULL operation: fetch remote changes and apply locally
 */
router.get('/pull', async (req, res) => {
  if (!isSupabaseConfigured()) {
    const { getSupabaseDiagnostics } = await import('../supabaseClient.js');
    return res.status(400).json({ 
      error: 'Supabase is not configured', 
      details: getSupabaseDiagnostics() 
    });
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
        if (error) {
          console.error(`[Sync] Ghost Recovery lookup failed for ${table}:`, error.message);
          continue; // Don't cleanup if we can't verify cloud state
        }

        // SAFETY CHECK: If cloud returns 0 results but local has many, 
        // it's statistically likely to be a transient cloud loading issue or empty response.
        const localCount = db.prepare(`SELECT COUNT(*) as c FROM ${table} WHERE is_archived = 0`).get().c;
        if ((!cloudIds || cloudIds.length === 0) && localCount > 5) {
          console.warn(`[Sync] Ghost Recovery SKIPPED for ${table}: Cloud returned 0 items but local has ${localCount}. Safety first!`);
          continue;
        }

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
