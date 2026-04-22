import express from 'express';
import dns from 'dns';
import { promisify } from 'util';
import db from '../database.js';
import { supabase, isSupabaseConfigured } from '../supabaseClient.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();
const resolveDns = promisify(dns.resolve);

let lastOnlineCheck = 0;
let cachedOnlineStatus = true;

/** Determine if we have internet connection by trying to reach multiple endpoints */
async function isOnline() {
  const now = Date.now();
  // Cache the result for 60 seconds to avoid repeating slow DNS lookups on every request
  if (now - lastOnlineCheck < 60000) {
    return cachedOnlineStatus;
  }

  lastOnlineCheck = now;
  try {
    // Try primary DNS lookup first with a fast timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    
    // We use a simple fetch to a small resource as it's often more reliable 
    // than raw DNS resolution which can hang indefinitely on some Windows setups.
    const res = await fetch('https://8.8.8.8', { // Google Public DNS IP (no DNS resolution needed)
      method: 'HEAD',
      mode: 'no-cors',
      signal: controller.signal
    }).catch(() => null);
    
    clearTimeout(timeout);
    cachedOnlineStatus = !!res;
    if (cachedOnlineStatus) return true;

    // Fallback: Try Supabase URL if configured
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    if (supabaseUrl) {
      try {
        const res = await fetch(supabaseUrl, { method: 'HEAD', signal: controller.signal });
        if (res.ok) {
          cachedOnlineStatus = true;
          return true;
        }
      } catch (err) { /* ignore */ }
    }
    
    cachedOnlineStatus = false;
    return false;
  } catch (e) {
    cachedOnlineStatus = false;
    return false;
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
          const payloads = items.map(it => {
            const data = JSON.parse(it.data);
            if (table === 'order_items') {
              return {
                id: data.id,
                order_id: data.order_id,
                inventory_id: data.inventory_item_id || data.id,
                quantity: data.quantity || 1,
                unit_price: data.unit_price || 0,
                total_price: data.total || (data.quantity * data.unit_price) || 0
              };
            } else if (table === 'orders') {
              return {
                id: data.id,
                order_number: `ORD-${(data.id || '').substring(0, 8).toUpperCase()}`,
                supplier_id: data.supplier_id || null,
                order_date: data.order_date || new Date().toISOString(),
                expected_delivery_date: data.expected_date || null,
                status: ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'].includes(data.status) ? data.status : 'pending',
                total_amount: data.total_amount || 0,
                notes: data.notes || null
              };
            } else if (table === 'inventory') {
              return {
                 id: data.id,
                 name: data.name,
                 reference: (data.id || '').substring(0, 8),
                 category: data.category || 'General',
                 quantity: data.quantity || 0,
                 min_quantity: data.min_stock || 0,
                 unit_price: data.price || 0,
                 supplier: data.supplier || null,
                 location: data.location || 'Main Store'
              };
            } else if (table === 'categories') {
              return {
                 id: data.id,
                 name_en: data.name_en || 'Unknown',
                 name_fr: data.name_fr || 'Inconnu'
              };
            } else if (table === 'suppliers') {
              return {
                 id: data.id,
                 name: data.name || 'Unknown',
                 contact_person: data.contact || null,
                 email: data.email || null,
                 phone: data.phone || null,
                 address: data.address || null
              };
            } else if (table === 'payments') {
              const methodMap = { cash: 'cash', bank: 'bank_transfer', check: 'check', credit: 'credit_card', other: 'cash' };
              return {
                 id: data.id,
                 order_id: data.order_id,
                 payment_date: data.payment_date || new Date().toISOString(),
                 amount: data.amount || 0,
                 payment_method: methodMap[data.method] || 'cash',
                 reference: data.reference || null,
                 notes: data.notes || null
              };
            } else if (table === 'audit_logs') {
              return {
                 id: data.id,
                 table_name: data.table_name || 'unknown',
                 record_id: data.record_id || data.id,
                 action: data.action || 'unknown',
                 old_data: typeof data.old_values === 'string' ? JSON.parse(data.old_values || '{}') : data.old_values,
                 new_data: typeof data.new_values === 'string' ? JSON.parse(data.new_values || '{}') : data.new_values,
                 user_id: null,
                 timestamp: data.timestamp || new Date().toISOString()
              };
            }
            return null; // e.g. usage_logs which has no cloud equivalent
          }).filter(Boolean);
          
          if (payloads.length === 0) continue;

          // UUID Validation Filter: Drop corrupt non-UUID local records (e.g. ID "1", "2") from the queue
          // because pushing them will crash the Postgres query with an "invalid syntax for type uuid" error.
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          const validPayloads = [];
          for (const payload of payloads) {
             if (!uuidRegex.test(payload.id)) {
                console.warn(`[Sync] CRITICAL: Stripping invalid UUID payload from Push batch - ID: ${payload.id}`);
                // Safely erase it from the local sync_queue so it stops blocking the server
                db.prepare('DELETE FROM sync_queue WHERE record_id = ?').run(payload.id);
             } else {
                validPayloads.push(payload);
             }
          }

          if (validPayloads.length === 0) continue;
          
          // DEDUPLICATE BY ID: Postgres cannot UPSERT the same row twice in one transaction!
          // We keep the LAST item in the array to represent the final updated state of that record.
          const uniquePayloads = Object.values(validPayloads.reduce((acc, curr) => {
            acc[curr.id] = curr;
            return acc;
          }, {}));

          // FAILSAFE: Supabase enforces strict Foreign Keys. 
          // If a local order_item references an inventory item that failed to push, or didn't exist locally, 
          // Supabase will violently reject the order_item. We must safely inject placeholders first.
          if (table === 'order_items') {
             const dummyInvs = uniquePayloads.map(it => ({
                 id: it.inventory_id,
                 name: 'Legacy / Recovered Item',
                 reference: String(it.inventory_id).substring(0, 8),
                 category: 'General',
                 quantity: 0,
                 min_quantity: 0,
                 unit_price: it.unit_price || 0,
                 supplier: null,
                 location: 'Main Store'
             }));
             // Fire-and-forget upsert to satisfy constraints. Pre-existing real items are unharmed.
             if (dummyInvs.length > 0) {
                 await supabase.from('inventory').upsert(dummyInvs, { onConflict: 'id' });
             }
          }
          
          const { error } = await supabase
            .from(table)
            .upsert(uniquePayloads, { onConflict: 'id' });

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
        // MAP CLOUD TO LOCAL SCHEMA Let's map remote fields back into the local shape
        if (table === 'order_items') {
          row.inventory_item_id = row.inventory_id;
          const q = Number(row.quantity) || 0;
          const p = Number(row.unit_price) || 0;
          row.quantity = q;
          row.unit_price = p;
          row.total = Number(row.total_price) || (q * p);
          
          // RECOVERY logic for missing descriptions (ghost recovery)
          if (!row.description) {
            if (row.inventory_id) {
              const inv = db.prepare('SELECT name FROM inventory WHERE id = ?').get(row.inventory_id);
              row.description = inv ? inv.name : 'Unknown Item';
            } else {
              // Try to preserve local description if it already exists
              const local = db.prepare('SELECT description FROM order_items WHERE id = ?').get(row.id);
              row.description = local ? local.description : 'Unknown Item';
            }
          }
        } else if (table === 'orders') {
          row.expected_date = row.expected_delivery_date;
          
          // Preserve local-only calculation fields
          try {
            const localOrder = db.prepare('SELECT paid_amount, is_archived, created_by FROM orders WHERE id = ?').get(row.id);
            if (localOrder) {
              row.paid_amount = localOrder.paid_amount;
              row.is_archived = localOrder.is_archived;
              row.created_by = localOrder.created_by;
            }
          } catch(e) {}
        }
        
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

    // Ensure hasPulledBefore will become true even if all tables were empty on the cloud
    db.prepare(`INSERT OR IGNORE INTO sync_meta (table_name, last_pulled) VALUES ('_system_init', ?)`).run(new Date().toISOString());

    
    // --- GHOST RECOVERY (Clean up deletions) ---
    // For critical tables, ensure local matches cloud IDs. 
    // If it's missing from cloud, we archive it locally.
    const cleanupTables = ['inventory', 'orders'];
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
          const localItems = db.prepare(`SELECT id, is_archived, sync_status FROM ${table}`).all();
          
          for (const local of localItems) {
            // Ignore non-UUID fallback items (like cat_ or sup_) from getting archived
            if (!local.id.includes('-')) continue;

            // If local item is NOT in cloud AND it's NOT already archived locally AND it's NOT a new local item (pending)
            if (!cloudIdSet.has(local.id) && local.is_archived === 0 && local.sync_status !== 'pending') {
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
