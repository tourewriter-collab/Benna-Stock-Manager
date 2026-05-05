import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// In packaged Electron, main.js sets DB_PATH to app.getPath('userData')/database.sqlite
const dbPath = process.env.DB_PATH || join(__dirname, '..', 'database.sqlite');
console.log('[Database] Opening at:', dbPath);

const db = new Database(dbPath);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');

// --- 1. TABLE DEFINITIONS ---

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin', 'audit_manager', 'user')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    sync_status TEXT DEFAULT 'pending',
    sync_updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS inventory (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    category_id TEXT,
    quantity INTEGER NOT NULL DEFAULT 0,
    price REAL NOT NULL,
    supplier TEXT,
    location TEXT NOT NULL,
    min_stock INTEGER DEFAULT 10,
    max_stock INTEGER DEFAULT 100,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
    sync_status TEXT DEFAULT 'pending',
    sync_updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_archived BOOLEAN NOT NULL DEFAULT 0,
    _sync_error TEXT
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    table_name TEXT NOT NULL,
    record_id TEXT NOT NULL,
    old_values TEXT,
    new_values TEXT,
    ip_address TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    sync_status TEXT DEFAULT 'pending',
    sync_updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS usage_logs (
    id TEXT PRIMARY KEY,
    inventory_item_id TEXT NOT NULL,
    item_name TEXT NOT NULL,
    quantity_changed INTEGER NOT NULL,
    previous_quantity INTEGER NOT NULL,
    new_quantity INTEGER NOT NULL,
    user_id INTEGER,
    authorized_by_name TEXT,
    authorized_by_title TEXT,
    truck_id TEXT,
    transaction_type TEXT DEFAULT 'OUT',
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    sync_status TEXT DEFAULT 'pending',
    sync_updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name_en TEXT NOT NULL,
    name_fr TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    sync_status TEXT DEFAULT 'pending',
    sync_updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_archived BOOLEAN NOT NULL DEFAULT 0
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS suppliers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    contact TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    sync_status TEXT DEFAULT 'pending',
    sync_updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_archived BOOLEAN NOT NULL DEFAULT 0
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS app_config (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    supplier_id TEXT NOT NULL,
    order_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    expected_date DATE,
    total_amount REAL NOT NULL DEFAULT 0,
    paid_amount REAL DEFAULT 0,
    status TEXT CHECK(status IN ('pending', 'partial', 'paid', 'cancelled')) DEFAULT 'pending',
    delivery_status TEXT DEFAULT 'pending',
    actual_delivery_date DATE,
    notes TEXT,
    created_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    sync_status TEXT DEFAULT 'pending',
    sync_updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_archived BOOLEAN NOT NULL DEFAULT 0
  )
`);

// Migration: Add actual_delivery_date if it doesn't exist
try {
  db.exec("ALTER TABLE orders ADD COLUMN actual_delivery_date DATE");
} catch (e) {
  // Column likely already exists
}

db.exec(`
  CREATE TABLE IF NOT EXISTS order_items (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    inventory_item_id TEXT,
    description TEXT,
    quantity INTEGER NOT NULL CHECK(quantity > 0),
    delivered_quantity INTEGER DEFAULT 0,
    unit_price REAL NOT NULL CHECK(unit_price >= 0),
    total REAL NOT NULL,
    sync_status TEXT DEFAULT 'pending',
    sync_updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_archived BOOLEAN NOT NULL DEFAULT 0
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    amount REAL NOT NULL CHECK(amount > 0),
    payment_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    method TEXT CHECK(method IN ('cash', 'bank', 'check', 'credit', 'other')) DEFAULT 'cash',
    reference TEXT,
    notes TEXT,
    created_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    sync_status TEXT DEFAULT 'pending',
    sync_updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_archived BOOLEAN NOT NULL DEFAULT 0
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS sync_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_name TEXT NOT NULL,
    record_id TEXT NOT NULL,
    action TEXT NOT NULL,
    data TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    synced BOOLEAN DEFAULT 0,
    _sync_error TEXT
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  )
`);

// --- 2. COLUMN MIGRATIONS (Safe updates for existing DBs) ---

const tables = ['users', 'inventory', 'audit_logs', 'usage_logs', 'categories', 'suppliers', 'orders', 'order_items', 'payments'];
for (const table of tables) {
  try { db.exec(`ALTER TABLE ${table} ADD COLUMN sync_status TEXT DEFAULT 'pending'`); } catch (e) {}
  try { db.exec(`ALTER TABLE ${table} ADD COLUMN sync_updated_at DATETIME DEFAULT CURRENT_TIMESTAMP`); } catch (e) {}
  try { db.exec(`ALTER TABLE ${table} ADD COLUMN is_archived BOOLEAN NOT NULL DEFAULT 0`); } catch (e) {}
  try { db.exec(`ALTER TABLE ${table} ADD COLUMN _sync_error TEXT`); } catch (e) {}
  try { db.exec(`UPDATE ${table} SET is_archived = 0 WHERE is_archived IS NULL`); } catch (e) {}
}

try { db.exec(`ALTER TABLE inventory ADD COLUMN category_id TEXT`); } catch (e) {}
try { db.exec(`ALTER TABLE order_items ADD COLUMN delivered_quantity INTEGER DEFAULT 0`); } catch (e) {}
try { db.exec(`ALTER TABLE orders ADD COLUMN delivery_status TEXT DEFAULT 'pending'`); } catch (e) {}
try { db.exec(`ALTER TABLE sync_queue ADD COLUMN synced BOOLEAN NOT NULL DEFAULT 0`); } catch (e) {}
try { db.exec(`ALTER TABLE suppliers ADD COLUMN status TEXT DEFAULT 'active'`); } catch (e) {}
try { db.exec(`ALTER TABLE usage_logs ADD COLUMN transaction_type TEXT DEFAULT 'OUT'`); } catch (e) {}

// --- 3. SEEDING & HOUSEKEEPING ---

// Admin User
const checkAdmin = db.prepare('SELECT * FROM users WHERE email = ?').get('cheickahmedt@gmail.com');
if (!checkAdmin) {
  const hashedPassword = bcrypt.hashSync('admin123', 10);
  db.prepare('INSERT INTO users (email, password, name, role) VALUES (?, ?, ?, ?)').run(
    'cheickahmedt@gmail.com', hashedPassword, 'Default Admin', 'admin'
  );
}

// Default Settings
const seedSettings = [
  { key: 'high_balance_threshold', value: '100000' },
  { key: 'show_total_stock_value', value: 'true' },
  { key: 'company_logo', value: '' },
  { key: 'db_created_at', value: new Date().toISOString() }
];
for (const s of seedSettings) {
  if (!db.prepare('SELECT * FROM settings WHERE key = ?').get(s.key)) {
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(s.key, s.value);
  }
}

// One-time cleanup for corrupt sync queue entries
try {
  db.prepare("DELETE FROM sync_queue WHERE table_name = 'usage_logs' AND (record_id LIKE '%.%' OR length(record_id) < 10 OR data IS NULL OR data = 'null')").run();
  db.prepare("DELETE FROM sync_queue WHERE data IS NULL OR data = 'null'").run();
} catch (e) {}

// --- 4. CORE FUNCTIONS ---

export function sanitizeSchema() {
  const tablesToFix = ['inventory', 'categories', 'suppliers', 'orders', 'order_items', 'payments', 'usage_logs', 'audit_logs'];
  for (const table of tablesToFix) {
    try {
      const info = db.prepare(`PRAGMA table_info(${table})`).all();
      const idCol = info.find(c => c.name === 'id');
      if (idCol && (idCol.type === 'INTEGER' || idCol.type.includes('INT'))) {
        console.log(`[Database] Sanitizing schema for ${table}...`);
        db.transaction(() => {
          db.prepare(`ALTER TABLE ${table} RENAME TO ${table}_old`).run();
          const oldSql = db.prepare(`SELECT sql FROM sqlite_master WHERE name = '${table}_old'`).get().sql;
          const newSql = oldSql
            .replace(`${table}_old`, table)
            .replace(/id\s+INTEGER/i, 'id TEXT')
            .replace(/id\s+INT/i, 'id TEXT')
            .replace(/AUTOINCREMENT/gi, '');
          db.prepare(newSql).run();
          const cols = info.map(c => c.name).join(', ');
          db.prepare(`INSERT INTO ${table} (${cols}) SELECT ${cols} FROM ${table}_old`).run();
          db.prepare(`DROP TABLE ${table}_old`).run();
        })();
      }
    } catch (e) {
      console.warn(`[Database] Schema sanitization failed for ${table}:`, e.message);
    }
  }
}

export function repairAllIds() {
  console.log('[Database] Checking for non-UUID legacy IDs...');
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const repairTable = (table, pk, fkMap = []) => {
    const records = db.prepare(`SELECT * FROM ${table}`).all();
    for (const row of records) {
      const currentId = String(row[pk]);
      if (currentId && !uuidRegex.test(currentId)) {
        const newId = crypto.randomUUID();
        console.log(`[Database] Migrating ${table}.${pk}: ${currentId} -> ${newId}`);
        try {
          const newRecord = { ...row, [pk]: newId, sync_status: 'pending' };
          const cols = Object.keys(newRecord);
          const placeholders = cols.map(() => '?').join(', ');
          db.prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`).run(...cols.map(c => newRecord[c]));
          
          for (const fk of fkMap) {
            db.prepare(`UPDATE ${fk.table} SET ${fk.col} = ? WHERE ${fk.col} = ?`).run(newId, currentId);
            
            // Update foreign keys inside sync_queue JSON data
            const fkQueueItems = db.prepare(`SELECT id, data FROM sync_queue WHERE table_name = ? AND data LIKE ?`).all(fk.table, `%${currentId}%`);
            for (const qItem of fkQueueItems) {
              try {
                const parsed = JSON.parse(qItem.data);
                if (String(parsed[fk.col]) === String(currentId)) {
                  parsed[fk.col] = newId;
                  db.prepare(`UPDATE sync_queue SET data = ? WHERE id = ?`).run(JSON.stringify(parsed), qItem.id);
                }
              } catch(e) {}
            }
          }
          
          db.prepare("UPDATE sync_queue SET record_id = ?, synced = 0 WHERE table_name = ? AND record_id = ?").run(newId, table, currentId);
          
          // Update primary key inside sync_queue JSON data
          const pkQueueItems = db.prepare(`SELECT id, data FROM sync_queue WHERE table_name = ? AND record_id = ?`).all(table, newId);
          for (const qItem of pkQueueItems) {
            try {
              const parsed = JSON.parse(qItem.data);
              if (String(parsed[pk]) === String(currentId)) {
                parsed[pk] = newId;
                db.prepare(`UPDATE sync_queue SET data = ? WHERE id = ?`).run(JSON.stringify(parsed), qItem.id);
              }
            } catch(e) {}
          }
          
          db.prepare(`DELETE FROM ${table} WHERE ${pk} = ?`).run(currentId);
        } catch (e) {
          console.error(`[Database] Migration failed for ${table}.${pk}:`, e.message);
        }
      }
    }
  };
  db.transaction(() => {
    repairTable('categories', 'id', [{ table: 'inventory', col: 'category_id' }]);
    repairTable('suppliers', 'id', [{ table: 'inventory', col: 'supplier' }, { table: 'orders', col: 'supplier_id' }]);
    repairTable('inventory', 'id', [{ table: 'usage_logs', col: 'inventory_item_id' }, { table: 'order_items', col: 'inventory_item_id' }]);
    repairTable('orders', 'id', [{ table: 'order_items', col: 'order_id' }, { table: 'payments', col: 'order_id' }]);
    repairTable('order_items', 'id');
    repairTable('payments', 'id');
  })();
}

export function reconcileLedger(force = false) {
  try {
    // 0. Deduplicate inventory first to prevent doubling from migrated IDs
    deduplicateInventory();

    if (!force) {
      const alreadyDone = db.prepare("SELECT value FROM app_config WHERE key = 'ledger_reconciled'").get();
      if (alreadyDone && alreadyDone.value === 'true') return;
    }
    console.log('[Database] Running Ledger Reconciliation Audit...');
    const items = db.prepare('SELECT id, name, quantity FROM inventory').all();
    let adjustmentsMade = 0;
    
    for (const item of items) {
      // Calculate true balance from logs
      const ledger = db.prepare(`
        SELECT 
          SUM(CASE WHEN transaction_type IN ('IN', 'ADJUST_IN') THEN quantity_changed ELSE 0 END) as total_in,
          SUM(CASE WHEN transaction_type IN ('OUT', 'ADJUST_OUT') THEN quantity_changed ELSE 0 END) as total_out
        FROM usage_logs WHERE inventory_item_id = ?
      `).get(item.id);
      
      const trueBalance = (ledger.total_in || 0) - (ledger.total_out || 0);
      
      if (item.quantity !== trueBalance) {
        console.log(`[Database] Reconciling ${item.name}: ${item.quantity} -> ${trueBalance}`);
        
        // Update inventory to match ledger
        db.prepare('UPDATE inventory SET quantity = ?, sync_status = "pending", sync_updated_at = CURRENT_TIMESTAMP WHERE id = ?')
          .run(trueBalance, item.id);
          
        const updatedItem = db.prepare('SELECT * FROM inventory WHERE id = ?').get(item.id);
        
        // Record to sync queue
        db.prepare('INSERT INTO sync_queue (table_name, record_id, action, data) VALUES (?, ?, ?, ?)').run(
          'inventory', item.id, 'UPDATE', JSON.stringify(updatedItem)
        );
        
        adjustmentsMade++;
      }
    }
    db.prepare("INSERT OR REPLACE INTO app_config (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)").run('ledger_reconciled', 'true');
    console.log(`[Database] Reconciliation complete. Items adjusted: ${adjustmentsMade}`);
  } catch (error) {
    console.error('[Database] Reconciliation failed:', error);
  }
}

/**
 * Merges duplicate inventory items (same name/location) that may have been created
 * during sync or ID migrations. 
 */
export function deduplicateInventory() {
  try {
    console.log('[Database] Checking for duplicate inventory items...');
    const items = db.prepare('SELECT id, name, location, quantity FROM inventory').all();
    const seen = new Map();
    let mergedCount = 0;

    for (const item of items) {
      const key = `${item.name.toLowerCase().trim()}|${(item.location || 'Main Store').toLowerCase().trim()}`;
      if (seen.has(key)) {
        const originalId = seen.get(key);
        const duplicateId = item.id;
        
        console.log(`[Database] Merging duplicate: ${item.name} (${duplicateId} -> ${originalId})`);
        
        // 1. Move all logs to the original ID
        db.prepare('UPDATE usage_logs SET inventory_item_id = ? WHERE inventory_item_id = ?').run(originalId, duplicateId);
        
        // 2. Move all order items to the original ID
        db.prepare('UPDATE order_items SET inventory_item_id = ? WHERE inventory_item_id = ?').run(originalId, duplicateId);
        
        // 3. Update inventory quantity: sum them up
        const duplicateItem = db.prepare('SELECT quantity FROM inventory WHERE id = ?').get(duplicateId);
        if (duplicateItem && duplicateItem.quantity > 0) {
          db.prepare('UPDATE inventory SET quantity = quantity + ?, sync_status = "pending" WHERE id = ?').run(duplicateItem.quantity, originalId);
        }

        // 4. Update sync queue for the moved records
        db.prepare("UPDATE sync_queue SET data = REPLACE(data, ?, ?) WHERE table_name IN ('usage_logs', 'order_items') AND (record_id = ? OR data LIKE ?)").run(
           duplicateId, originalId, duplicateId, `%${duplicateId}%`
        );

        // 5. Delete the duplicate inventory item
        db.prepare('DELETE FROM inventory WHERE id = ?').run(duplicateId);
        
        // 6. Mark duplicate for deletion in cloud
        db.prepare('INSERT INTO sync_queue (table_name, record_id, action, data) VALUES (?, ?, ?, ?)').run(
          'inventory', duplicateId, 'DELETE', JSON.stringify({ id: duplicateId })
        );

        mergedCount++;
      } else {
        seen.set(key, item.id);
      }
    }
    
    if (mergedCount > 0) {
      console.log(`[Database] Deduplication complete. Merged ${mergedCount} duplicates.`);
    }

    // 7. Deduplicate usage logs themselves (same item, same user, same time, same quantity)
    console.log('[Database] Checking for duplicate usage logs...');
    const duplicateLogs = db.prepare(`
      SELECT id FROM usage_logs 
      WHERE id NOT IN (
        SELECT MIN(id) 
        FROM usage_logs 
        GROUP BY inventory_item_id, user_id, timestamp, quantity_changed, transaction_type
      )
    `).all();

    if (duplicateLogs.length > 0) {
      console.log(`[Database] Removing ${duplicateLogs.length} duplicate usage logs...`);
      const deleteStmt = db.prepare('DELETE FROM usage_logs WHERE id = ?');
      const queueStmt = db.prepare('INSERT INTO sync_queue (table_name, record_id, action, data) VALUES (?, ?, ?, ?)');
      
      db.transaction(() => {
        for (const log of duplicateLogs) {
          deleteStmt.run(log.id);
          queueStmt.run('usage_logs', log.id, 'DELETE', JSON.stringify({ id: log.id }));
        }
      })();
    }

  } catch (error) {
    console.error('[Database] Deduplication failed:', error);
  }
}


export function runPostStartupMaintenance() {
  console.log('[Database] Starting post-startup maintenance...');
  const defaultCategories = [
    { en: 'General', fr: 'Général' }, { en: 'Engine Parts', fr: 'Pièces moteur' },
    { en: 'Lubricants & Fluids', fr: 'Lubrifiants et fluides' }, { en: 'Tools & Equipment', fr: 'Outils et équipement' },
    { en: 'Tires & Wheels', fr: 'Pneus et roues' }, { en: 'Brake & Clutch System', fr: 'Système de frein et embrayage' },
    { en: 'Transmission & Drivetrain', fr: 'Transmission et chaîne cinématique' }, { en: 'Suspension & Steering', fr: 'Suspension et direction' },
    { en: 'Electrical & Electronics', fr: 'Électrique et électronique' }, { en: 'Cooling System', fr: 'Système de refroidissement' },
    { en: 'Fuel System', fr: "Système d'alimentation en carburant" }, { en: 'Body & Cab Parts', fr: 'Carrosserie et cabine' },
    { en: 'Hardware & Fasteners', fr: 'Quincaillerie et fixations' }, { en: 'Safety Gear (PPE)', fr: 'Équipement de sécurité (EPI)' },
    { en: 'Filters', fr: 'Filtres' }, { en: 'Hydraulics', fr: 'Hydraulique' }
  ];
  db.transaction(() => {
    for (const cat of defaultCategories) {
      if (!db.prepare('SELECT * FROM categories WHERE name_en = ?').get(cat.en)) {
        db.prepare('INSERT INTO categories (id, name_en, name_fr, is_archived, sync_status) VALUES (?, ?, ?, 0, ?)')
          .run(crypto.randomUUID(), cat.en, cat.fr, 'pending');
      }
    }
  })();
  try {
    repairAllIds();
    db.prepare("DELETE FROM sync_queue WHERE synced = 1 AND created_at < datetime('now', '-3 days')").run();
  } catch (e) {}
}

// --- 5. INITIALIZATION ---

sanitizeSchema();
setTimeout(() => reconcileLedger(), 1000);
setTimeout(() => runPostStartupMaintenance(), 2000);

export default db;
