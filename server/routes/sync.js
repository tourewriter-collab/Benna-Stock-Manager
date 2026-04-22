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
  if (now - lastOnlineCheck < 60000) {
    return cachedOnlineStatus;
  }

  lastOnlineCheck = now;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1000); // 1s timeout
    
    // Check Supabase directly as it's the only one that matters
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    if (supabaseUrl) {
      const res = await fetch(supabaseUrl, { method: 'HEAD', signal: controller.signal });
      clearTimeout(timeout);
      cachedOnlineStatus = res.ok;
      return res.ok;
    }
    
    clearTimeout(timeout);
    cachedOnlineStatus = true; // Default to true to allow attempt
    return true;
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

    // Fetch recent sync errors to show in the UI
    let recentErrors = [];
    try {
      recentErrors = db.prepare(`
        SELECT table_name, record_id, action, _sync_error 
        FROM sync_queue 
        WHERE synced = 0 AND _sync_error IS NOT NULL 
        ORDER BY created_at DESC 
        LIMIT 5
      `).all();
    } catch(e) {}

    res.json({
      pendingItems: queueCount,
      configured: isSupabaseConfigured(),
      online: await isOnline(),
      hasPulledBefore,
      recentErrors
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
    const pendingItems = db.prepare("SELECT * FROM sync_queue WHERE synced = 0 ORDER BY created_at ASC").all();
    if (pendingItems.length === 0) {
      return res.json({ success: true, pushed: 0, total: 0 });
    }

    let successTotal = 0;
    
    // Group and execute batches. We use a transaction for the local status updates.
    // NOTE: Remote Supabase calls are already batch-optimized but separate from the local TX.
    const grouped = pendingItems.reduce((acc, item) => {
      const key = `${item.table_name}:${item.action}`;
      if (!acc[key]) acc[key] = { table: item.table_name, action: item.action, items: [] };
      acc[key].items.push(item);
      return acc;
    }, {});

    for (const key in grouped) {
      const { table: table, action, items } = grouped[key];
      try {
        if (action === 'INSERT' || action === 'UPDATE') {
          // Flatten data and filter
          const payloads = items.map(it => {
            const data = JSON.parse(it.data);
            // Schema mapping for cloud
            if (table === 'orders') {
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
            } else if (table === 'order_items') {
              return {
                id: data.id,
                order_id: data.order_id,
                inventory_id: data.inventory_item_id || data.id,
                quantity: data.quantity || 1,
                unit_price: data.unit_price || 0,
                total_price: data.total || (data.quantity * data.unit_price) || 0
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
            return null;
          }).filter(Boolean);
          
          if (payloads.length === 0) continue;

          // UUID Validation Filter
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          const validPayloads = [];
          for (const payload of payloads) {
             if (!uuidRegex.test(payload.id)) {
                console.warn(`[Sync] CRITICAL: Stripping invalid UUID payload from Push batch - ID: ${payload.id}`);
                // Safely erase it from the local sync_queue within the larger transaction logic
                db.prepare('DELETE FROM sync_queue WHERE record_id = ?').run(payload.id);
             } else {
                validPayloads.push(payload);
             }
          }

          if (validPayloads.length === 0) continue;
          
          // DEDUPLICATE BY ID: Postgres cannot UPSERT the same row twice in one transaction!
          const uniquePayloads = Object.values(validPayloads.reduce((acc, curr) => {
            acc[curr.id] = curr;
            return acc;
          }, {}));

          // FAILSAFE: Supabase enforces strict Foreign Keys. 
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
             if (dummyInvs.length > 0) {
                 await supabase.from('inventory').upsert(dummyInvs, { onConflict: 'id' });
             }
          }
          
          const { error } = await supabase
            .from(table)
            .upsert(uniquePayloads, { onConflict: 'id' });

          if (error) {
            console.error(`[Sync] Batch Push failed for ${table}:`, error.message);
            // Mark individual errors in local DB
            items.forEach(it => {
               db.prepare("UPDATE sync_queue SET synced = 0, _sync_error = ? WHERE id = ?").run(error.message, it.id);
            });
          } else {
            // SUCCESS: Mark all in this batch as synced inside a TRANSACTION for massive speedup
            db.transaction(() => {
              const itemIds = items.map(it => it.id);
              const placeholders = itemIds.map(() => '?').join(',');
              db.prepare(`UPDATE sync_queue SET synced = 1, _sync_error = NULL WHERE id IN (${placeholders})`).run(...itemIds);
              
              const recordIds = items.map(it => it.record_id);
              const recPlaceholders = recordIds.map(() => '?').join(',');
              try {
                db.prepare(`UPDATE ${table} SET sync_status = 'synced' WHERE id IN (${recPlaceholders})`).run(...recordIds);
              } catch (e) { /* Ignore if no sync_status column */ }
            })();
            
            successTotal += items.length;
          }
        } else if (action === 'DELETE') {
          for (const it of items) {
            const { error } = await supabase.from(table).delete().eq('id', it.record_id);
            if (!error) {
              db.prepare("UPDATE sync_queue SET synced = 1, _sync_error = NULL WHERE id = ?").run(it.id);
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

        // ... Schema mapping logic ...
        const filteredKeys = Object.keys(row).filter(k => localColumns.has(k));
        if (filteredKeys.length === 0) continue;

        const placeholders = filteredKeys.map(() => '?').join(', ');
        const values = filteredKeys.map(k => row[k]);

        // Accumulate for batch transaction
        batchOps.push({ sql: `INSERT OR REPLACE INTO ${table} (${filteredKeys.join(', ')}) VALUES (${placeholders})`, params: values });
        totalPulled++;
      }

      // Execute pull batch in a TRANSACTION for massive performance gain vs row-by-row commits
      if (batchOps.length > 0) {
        db.transaction(() => {
          for (const op of batchOps) {
             db.prepare(op.sql).run(...op.params);
          }
        })();
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

/**
 * Manual ID repair: converts any legacy non-UUID IDs to valid UUIDs
 */
router.post('/repair-ids', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden', message: 'Only admins can repair IDs' });
  }

  try {
    const { runPostStartupMaintenance } = await import('../database.js');
    // We call the maintenance function which now includes repairAllIds()
    // It's safe to call multiple times as it has intrinsic safeguards
    runPostStartupMaintenance();
    res.json({ success: true, message: 'ID repair triggered successfully. Check logs for progress.' });
  } catch (error) {
    console.error('[Sync] Manual repair failed:', error);
    res.status(500).json({ error: 'Repair failed', message: error.message });
  }
});

export default router;
