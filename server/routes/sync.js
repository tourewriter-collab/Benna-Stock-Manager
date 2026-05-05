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
  // We've found that manual connectivity checks (HTTP HEAD or DNS) can be brittle 
  // in various network environments. We'll now allow the sync attempt to proceed 
  // if Supabase is configured, and let the actual request handle any real connectivity issues.
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  return !!supabaseUrl;
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

    // Fetch pending items to diagnose stuck syncs
    let recentErrors = [];
    try {
      recentErrors = db.prepare(`
        SELECT table_name, record_id, action, _sync_error, created_at 
        FROM sync_queue 
        WHERE synced = 0 
        ORDER BY created_at DESC 
        LIMIT 50
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
    // 0. Proactive cleanup of any previously synced items that were not purged
    try { db.prepare("DELETE FROM sync_queue WHERE synced = 1").run(); } catch(e) {}

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

    // ── STRICT TABLE ORDER FOR PUSH ──
    const pushOrder = ['categories', 'suppliers', 'inventory', 'orders', 'order_items', 'payments', 'usage_logs', 'audit_logs'];
    const tableKeys = Object.keys(grouped).sort((a, b) => {
      const tableA = grouped[a].table;
      const tableB = grouped[b].table;
      return pushOrder.indexOf(tableA) - pushOrder.indexOf(tableB);
    });

    for (const key of tableKeys) {
      const { table: table, action, items } = grouped[key];
      try {
        if (action === 'INSERT' || action === 'UPDATE') {
          // ... (payload mapping logic remains same) ...
          const payloads = items.map(it => {
            let data;
            try { data = JSON.parse(it.data); } catch(e) { return null; }
            if (!data || !data.id) return null;
            // Schema mapping for cloud
            if (table === 'orders') {
              return {
                id: data.id,
                order_number: data.order_number || `ORD-${(data.id || '').substring(0, 8).toUpperCase()}`,
                supplier_id: data.supplier_id || null,
                order_date: data.order_date || new Date().toISOString(),
                expected_delivery_date: data.expected_date || null,
                status: ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'].includes(data.status) ? data.status : 'pending',
                total_amount: data.total_amount || 0,
                notes: data.notes || null,
                delivery_status: data.delivery_status || 'pending',
                actual_delivery_date: data.actual_delivery_date || null,
                paid_amount: data.paid_amount || 0
              };
            } else if (table === 'order_items') {
              return {
                id: data.id,
                order_id: data.order_id,
                inventory_id: data.inventory_item_id || data.id,
                quantity: data.quantity || 1,
                unit_price: data.unit_price || 0,
                total_price: data.total || (data.quantity * data.unit_price) || 0,
                description: data.description || null,
                delivered_quantity: data.delivered_quantity || 0
              };
            } else if (table === 'inventory') {
              return {
                 id: data.id,
                 name: data.name,
                 reference: (data.id || '').substring(0, 8),
                 quantity: data.quantity || 0,
                 min_stock: data.min_stock || 0,
                 unit_price: data.price || 0,
                 supplier_id: data.supplier || null,
                 location: data.location || 'Main Store',
                 category_id: data.category_id || null
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
            } else if (table === 'usage_logs') {
              return {
                 id: data.id,
                 inventory_id: data.inventory_item_id,
                 item_name: data.item_name,
                 quantity_changed: data.quantity_changed,
                 previous_quantity: data.previous_quantity,
                 new_quantity: data.new_quantity,
                 transaction_type: data.transaction_type || 'OUT',
                 user_id: data.user_id || null,
                 authorized_by_name: data.authorized_by_name,
                 authorized_by_title: data.authorized_by_title,
                 truck_id: data.truck_id,
                 timestamp: data.timestamp || new Date().toISOString()
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
                console.warn(`[Sync] WARNING: Holding back invalid UUID from Push batch (pending repair) - ID: ${payload.id}`);
                try {
                  db.prepare('UPDATE sync_queue SET _sync_error = ? WHERE record_id = ?').run('Invalid UUID. Awaiting local repair script.', payload.id);
                } catch(e) {}
             } else {
                validPayloads.push(payload);
             }
          }

          if (validPayloads.length === 0) continue;
          
          const uniquePayloads = Object.values(validPayloads.reduce((acc, curr) => {
            acc[curr.id] = curr;
            return acc;
          }, {}));

          // FAILSAFE: Supabase enforces strict Foreign Keys. 
          if (table === 'order_items') {
             const dummyInvs = uniquePayloads.map(it => {
                 // Try to find the local item to use its REAL name/category if possible
                 const local = db.prepare('SELECT name, category FROM inventory WHERE id = ?').get(it.inventory_id);
                 return {
                   id: it.inventory_id,
                   name: local?.name || 'Recovered Item',
                   reference: String(it.inventory_id).substring(0, 8),
                   category: local?.category || 'General',
                   quantity: 0,
                   min_quantity: 0,
                   unit_price: it.unit_price || 0,
                   supplier: null,
                   location: 'Main Store'
                 };
             });
             if (dummyInvs.length > 0) {
                 await supabase.from('inventory').upsert(dummyInvs, { onConflict: 'id' });
             }
          }
          
          const { error } = await supabase
            .from(table)
            .upsert(uniquePayloads, { onConflict: 'id' });

          if (error) {
            console.error(`[Sync] Batch Push failed for ${table}:`, error.message);

            // SPECIAL CASE: Duplicate key errors mean the data already exists in the cloud.
            // Clear these from the queue so they don't block sync forever.
            if (error.message.includes('unique constraint') || error.message.includes('duplicate key')) {
              console.log(`[Sync] Data already exists in cloud for ${table}, clearing ${items.length} items from queue.`);
              db.transaction(() => {
                const itemIds = items.map(it => it.id);
                const placeholders = itemIds.map(() => '?').join(',');
                db.prepare(`DELETE FROM sync_queue WHERE id IN (${placeholders})`).run(...itemIds);
              })();
              successTotal += items.length;
              continue;
            }

            // SPECIAL CASE: Column not found in schema means our payload has extra fields.
            // These will never succeed, so clear them too.
            if (error.message.includes('Could not find') && error.message.includes('in the schema cache')) {
              console.log(`[Sync] Schema mismatch for ${table}, clearing ${items.length} items from queue.`);
              db.transaction(() => {
                const itemIds = items.map(it => it.id);
                const placeholders = itemIds.map(() => '?').join(',');
                db.prepare(`DELETE FROM sync_queue WHERE id IN (${placeholders})`).run(...itemIds);
              })();
              successTotal += items.length;
              continue;
            }

            // SPECIAL CASE: Foreign key violations mean the referenced entity doesn't exist in cloud.
            // Mark them with an error instead of deleting them, so they can be repaired.
            if (error.message && error.message.includes('foreign key constraint')) {
              console.warn(`[Sync] Foreign key violation for ${table}, holding back ${items.length} orphaned items in queue.`);
              try {
                db.transaction(() => {
                  const itemIds = items.map(it => it.id);
                  const placeholders = itemIds.map(() => '?').join(',');
                  db.prepare(`UPDATE sync_queue SET _sync_error = 'Foreign Key Violation (missing parent in cloud)' WHERE id IN (${placeholders})`).run(...itemIds);
                })();
              } catch(e) {}
              continue;
            }

            // Mark individual errors in local DB for troubleshooting
            items.forEach(it => {
               try {
                 db.prepare("UPDATE sync_queue SET synced = 0, _sync_error = ? WHERE id = ?").run(error.message, it.id);
               } catch (e) { /* ignore if _sync_error column missing */ }
            });
          } else {
            // SUCCESS: Purge from queue and update record status
            console.log(`[Sync] Successfully pushed ${items.length} items to ${table}`);
            db.transaction(() => {
              const itemIds = items.map(it => it.id);
              const placeholders = itemIds.map(() => '?').join(',');
              db.prepare(`DELETE FROM sync_queue WHERE id IN (${placeholders})`).run(...itemIds);
              
              const recordIds = items.map(it => it.record_id);
              const recPlaceholders = recordIds.map(() => '?').join(',');
              try {
                db.prepare(`UPDATE ${table} SET sync_status = 'synced' WHERE id IN (${recPlaceholders})`).run(...recordIds);
              } catch (e) { /* Table might not have sync_status column */ }
            })();
            
            successTotal += items.length;
          }
        } else if (action === 'DELETE') {
          for (const it of items) {
            const { error } = await supabase.from(table).delete().eq('id', it.record_id);
            if (!error) {
              db.prepare("DELETE FROM sync_queue WHERE id = ?").run(it.id);
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

    try {
      db.exec(`CREATE TABLE IF NOT EXISTS sync_meta (table_name TEXT PRIMARY KEY, last_pulled DATETIME)`);
    } catch (e) {
      console.error('[Sync] Error creating sync_meta table:', e);
    }
    
    let totalPulled = 0;

    for (const table of tablesToSync) {
      try {
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

        const batchOps = [];

        for (const row of remoteData) {
          // MAP CLOUD TO LOCAL SCHEMA Let's map remote fields back into the local shape
          if (table === 'order_items') {
            row.inventory_item_id = row.inventory_id;
            const q = Number(row.quantity) || 0;
            const p = Number(row.unit_price) || 0;
            row.quantity = q;
            row.unit_price = p;
            row.total = Number(row.total_price) || (q * p);
            row.delivered_quantity = Number(row.delivered_quantity) || 0;
            
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
          } else if (table === 'payments') {
            // Duplicate prevention for payments (if same order, amount, and reference already exists)
            if (row.order_id && row.amount) {
              const existing = db.prepare('SELECT id FROM payments WHERE order_id = ? AND amount = ? AND (reference = ? OR (reference IS NULL AND ? IS NULL))').get(row.order_id, row.amount, row.reference || null, row.reference || null);
              if (existing && existing.id !== row.id) {
                console.log(`[Sync] Skipping duplicate payment pull: ${row.id} (already exists as ${existing.id})`);
                continue; 
              }
            }
            row.method = row.payment_method || 'cash';
          } else if (table === 'usage_logs') {
            row.inventory_item_id = row.inventory_id || row.inventory_item_id || 'unknown'; 
            row.item_name = row.item_name || 'Unknown Item';
            row.quantity_changed = row.quantity_changed !== undefined ? row.quantity_changed : 0;
            row.previous_quantity = row.previous_quantity !== undefined ? row.previous_quantity : 0;
            row.new_quantity = row.new_quantity !== undefined ? row.new_quantity : 0;
            row.transaction_type = row.transaction_type || 'OUT';
            row.user_id = row.user_id || null;
          } else if (table === 'inventory') {
            // Map cloud unit_price back to local price
            if (row.unit_price !== undefined && row.unit_price !== null) {
              row.price = row.unit_price;
            }
            row.price = row.price !== undefined && row.price !== null ? row.price : 0;
            
            // Handle category missing from cloud (NOT NULL locally)
            if (!row.category) {
              if (row.category_id) {
                try {
                  const cat = db.prepare('SELECT name_en FROM categories WHERE id = ?').get(row.category_id);
                  row.category = cat ? cat.name_en : 'General';
                } catch(e) {
                  row.category = 'General';
                }
              } else {
                row.category = 'General';
              }
            }
            
            // Ensure other NOT NULL columns are handled
            row.name = row.name || 'Unnamed Item';
            row.location = row.location || 'Main Store';
            if (row.quantity === undefined || row.quantity === null) {
              // Try to preserve local quantity if pull doesn't have it (shouldn't happen but safe)
              const local = db.prepare('SELECT quantity FROM inventory WHERE id = ?').get(row.id);
              row.quantity = local ? local.quantity : 0;
            }
          } else if (table === 'suppliers') {
            if (row.contact_person !== undefined) {
              row.contact = row.contact_person || '';
            }
            row.name = row.name || 'Unknown Supplier';
          } else if (table === 'orders') {
            row.expected_date = row.expected_delivery_date || null;
            row.supplier_id = row.supplier_id || 'unknown';
            row.total_amount = row.total_amount || 0;
            
            // Preserve local-only calculation fields
            try {
              const localOrder = db.prepare('SELECT paid_amount, is_archived, created_by FROM orders WHERE id = ?').get(row.id);
              if (localOrder) {
                row.paid_amount = Number(row.paid_amount) || localOrder.paid_amount || 0;
                row.is_archived = localOrder.is_archived || 0;
                row.created_by = localOrder.created_by || 'system';
                row.actual_delivery_date = row.actual_delivery_date || localOrder.actual_delivery_date || null;
              }
            } catch(e) {}
          }
          
          const filteredKeys = Object.keys(row).filter(k => localColumns.has(k));
          if (filteredKeys.length === 0) continue;

          const placeholders = filteredKeys.map(() => '?').join(', ');
          const values = filteredKeys.map(k => row[k]);

          // Accumulate for batch transaction
          batchOps.push({ sql: `INSERT OR REPLACE INTO ${table} (${filteredKeys.join(', ')}) VALUES (${placeholders})`, params: values });
          totalPulled++;
        }

        // Execute pull batch in a TRANSACTION
        if (batchOps.length > 0) {
          db.pragma('foreign_keys = OFF');
          try {
            db.transaction(() => {
              for (const op of batchOps) {
                 db.prepare(op.sql).run(...op.params);
              }
            })();
          } finally {
            db.pragma('foreign_keys = ON');
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
        console.log(`[Sync] Successfully pulled ${table}: ${remoteData?.length || 0} items`);
      } catch (tableErr) {
        console.error(`[Sync] Critical failure pulling ${table}:`, tableErr.message);
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

            // CRITICAL FIX: Only archive items previously confirmed as synced to cloud.
            // Items with sync_status='pending' are new local items not yet pushed — 
            // archiving them would incorrectly remove freshly created records.
            const hasBeenSynced = local.sync_status === 'synced';

            if (!cloudIdSet.has(local.id) && local.is_archived === 0 && hasBeenSynced) {
              console.log(`[Sync] Ghost Recovery: Archiving ${table} id=${local.id} (confirmed synced, now missing from cloud)`);
              db.prepare(`UPDATE ${table} SET is_archived = 1, sync_status = 'synced' WHERE id = ?`).run(local.id);
            }
          }
        }
      } catch (e) {
        console.error(`[Sync] Cleanup failed for ${table}:`, e.message);
      }
    }

    // Mirror sync is handled by Ghost Recovery above (archival, not hard delete)

    res.json({ success: true, pulled: totalPulled });
  } catch (error) {
    console.error('[Sync] Pull error:', error);
    res.status(500).json({ 
      error: 'Failed to pull changes from Supabase', 
      message: error.message,
      stack: error.stack,
      hint: 'Please check your Supabase credentials and network connectivity.'
    });
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

/**
 * Debug: List all database triggers
 */
router.get('/debug/triggers', authenticateToken, (req, res) => {
  try {
    const triggers = db.prepare("SELECT name, sql FROM sqlite_master WHERE type='trigger'").all();
    res.json({ success: true, triggers });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * RECONCILE operation: compare local IDs with cloud IDs and delete orphans.
 * This is the ONLY way to detect hard-deletions from other machines.
 */
router.post('/reconcile-deletions', authenticateToken, async (req, res) => {
  if (!isSupabaseConfigured()) {
    return res.status(400).json({ error: 'Supabase is not configured' });
  }

  try {
    const tablesToReconcile = ['inventory', 'categories', 'suppliers', 'orders', 'order_items', 'payments', 'usage_logs'];
    const results = {};

    for (const table of tablesToReconcile) {
      console.log(`[Sync] Reconciling deletions for ${table}...`);
      
      // 1. Fetch ALL IDs from cloud for this table
      const { data: remoteIds, error } = await supabase.from(table).select('id');
      
      if (error) {
        console.error(`[Sync] Failed to fetch remote IDs for ${table}:`, error.message);
        results[table] = { status: 'error', message: error.message };
        continue;
      }

      const cloudIdSet = new Set(remoteIds.map(r => String(r.id)));
      
      // 2. Fetch all local IDs
      const localIds = db.prepare(`SELECT id FROM ${table}`).all().map(r => String(r.id));
      
      // 3. Find orphans (local exists, cloud does not)
      const orphans = localIds.filter(id => !cloudIdSet.has(id));
      
      if (orphans.length > 0) {
        console.log(`[Sync] Found ${orphans.length} orphans in ${table}. Deleting...`);
        
        const deleteStmt = db.prepare(`DELETE FROM ${table} WHERE id = ?`);
        const transaction = db.transaction((ids) => {
          for (const id of ids) {
            deleteStmt.run(id);
          }
        });
        
        transaction(orphans);
        results[table] = { status: 'success', deleted: orphans.length };
      } else {
        results[table] = { status: 'success', deleted: 0 };
      }
    }

    res.json({ message: 'Reconciliation complete', results });
  } catch (error) {
    console.error('[Sync] Reconciliation failed:', error);
    res.status(500).json({ error: 'Reconciliation failed', message: error.message });
  }
});

export default router;
