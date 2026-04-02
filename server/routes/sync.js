import express from 'express';
import dns from 'dns';
import { promisify } from 'util';
import db from '../database.js';
import { supabase, isSupabaseConfigured } from '../supabaseClient.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();
const resolveDns = promisify(dns.resolve);

/** Determine if we have internet connection by pinging supabase.co */
async function isOnline() {
  try {
    await resolveDns('supabase.co');
    return true;
  } catch (e) {
    return false;
  }
}

/** 
 * Status endpoint used by the frontend to see if sync is needed 
 */
router.get('/status', async (req, res) => {
  try {
    const queueCount = db.prepare("SELECT COUNT(*) as count FROM sync_queue WHERE synced = 0").get().count;
    res.json({
      pendingItems: queueCount,
      configured: isSupabaseConfigured(),
      online: await isOnline(),
    });
  } catch (error) {
    console.error('[Sync] Status error:', error);
    res.status(500).json({ error: 'Failed to get sync status', message: error.message });
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
    const tablesToSync = ['inventory', 'users', 'categories', 'suppliers', 'orders', 'order_items', 'payments', 'usage_logs', 'audit_logs', 'sync_meta']; // Define synced tables
    
    // We need a place to store "last pulled" timestamp per table.
    // We'll create a quick meta table if we haven't.
    db.exec(`CREATE TABLE IF NOT EXISTS sync_meta (table_name TEXT PRIMARY KEY, last_pulled DATETIME)`);
    
    let totalPulled = 0;

    for (const table of tablesToSync) {
      // Find when we last pulled this table
      const meta = db.prepare("SELECT last_pulled FROM sync_meta WHERE table_name = ?").get(table);
      const lastPulled = meta ? meta.last_pulled : '1970-01-01T00:00:00.000Z';

      // Ask Supabase for anything newer than our last pull
      // Note: we use updated_at, falling back to id if not available
      const { data: remoteData, error } = await supabase
        .from(table)
        .select('*')
        .gt('updated_at', lastPulled) // Assume Supabase has updated_at columns
        .order('updated_at', { ascending: true });

      if (error) {
        console.error(`[Sync] Pull failed for table ${table}:`, error.message);
        continue; // Skip this table and continue with others
      }

      if (!remoteData || remoteData.length === 0) continue;

      // Upsert into local DB
      for (const row of remoteData) {
        // Construct naive INSERT OR REPLACE statement based on row keys
        // SQLite will replace the row if the ID exists (requires id to be PRIMARY KEY)
        const keys = Object.keys(row);
        
        // Remove 'updated_at' if local table doesn't have it, or map correctly
        // We'll just map raw row directly.
        const placeholders = keys.map(() => '?').join(', ');
        const values = Object.values(row);

        try {
          db.prepare(`INSERT OR REPLACE INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`).run(...values);
          totalPulled++;
        } catch (e) {
          console.error(`[Sync] Local upsert failed for ${table} row ${row.id}:`, e.message);
        }
      }

      // Update our last known pulled timestamp to the newest updated_at from this batch
      const newestDate = remoteData[remoteData.length - 1].updated_at;
      if (newestDate) {
        db.prepare(`INSERT OR REPLACE INTO sync_meta (table_name, last_pulled) VALUES (?, ?)`).run(table, newestDate);
      }
    }

    res.json({ success: true, pulled: totalPulled });
  } catch (error) {
    console.error('[Sync] Pull error:', error);
    res.status(500).json({ error: 'Failed to pull changes from Supabase', message: error.message });
  }
});

export default router;
