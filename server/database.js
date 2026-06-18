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
  CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('asset', 'liability', 'equity', 'revenue', 'expense')),
    balance REAL DEFAULT 0,
    currency TEXT DEFAULT 'XAF',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    sync_status TEXT DEFAULT 'pending',
    sync_updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_archived BOOLEAN NOT NULL DEFAULT 0,
    _sync_error TEXT
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS invoices (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    order_id TEXT,
    invoice_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    due_date DATETIME,
    total_amount REAL NOT NULL DEFAULT 0,
    paid_amount REAL DEFAULT 0,
    status TEXT CHECK(status IN ('draft', 'sent', 'paid', 'overdue', 'cancelled')) DEFAULT 'draft',
    notes TEXT,
    created_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    sync_status TEXT DEFAULT 'pending',
    sync_updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_archived BOOLEAN NOT NULL DEFAULT 0,
    _sync_error TEXT
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS employee_performance (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL,
    month TEXT NOT NULL,
    task_score INTEGER DEFAULT 0,
    boss_review_score INTEGER DEFAULT 0,
    attendance_score INTEGER DEFAULT 0,
    peer_feedback_score INTEGER DEFAULT 0,
    skill_dev_score INTEGER DEFAULT 0,
    overtime_score INTEGER DEFAULT 0,
    composite_score INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    sync_status TEXT DEFAULT 'pending',
    sync_updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees(id)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  INSERT OR IGNORE INTO settings (key, value) VALUES ('global_ai_access', 'false');
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    invoice_id TEXT,
    amount REAL NOT NULL,
    type TEXT CHECK(type IN ('credit', 'debit')) NOT NULL,
    transaction_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    description TEXT,
    reference TEXT,
    created_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    sync_status TEXT DEFAULT 'pending',
    sync_updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_archived BOOLEAN NOT NULL DEFAULT 0,
    _sync_error TEXT,
    FOREIGN KEY (account_id) REFERENCES accounts(id),
    FOREIGN KEY (invoice_id) REFERENCES invoices(id)
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
  CREATE TABLE IF NOT EXISTS trucks (
    id TEXT PRIMARY KEY,
    plate_number TEXT UNIQUE NOT NULL,
    model TEXT,
    capacity REAL,
    status TEXT DEFAULT 'active' CHECK(status IN ('active', 'maintenance', 'inactive')),
    latitude REAL,
    longitude REAL,
    last_location_update TEXT
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS granite_deliveries (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    truck_id TEXT NOT NULL,
    driver_name TEXT NOT NULL,
    granite_type TEXT NOT NULL,
    empty_weight REAL,
    loaded_weight REAL,
    net_weight REAL,
    volume_m3 REAL,
    quantity REAL NOT NULL,
    unit_price REAL NOT NULL,
    total_amount REAL NOT NULL,
    client_name TEXT,
    status TEXT DEFAULT 'delivered' CHECK(status IN ('pending', 'delivered', 'cancelled')),
    FOREIGN KEY (truck_id) REFERENCES trucks(id)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    message TEXT NOT NULL,
    type TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_read BOOLEAN DEFAULT 0
  )
`);


db.exec(`
  CREATE TABLE IF NOT EXISTS employees (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    role TEXT NOT NULL,
    department TEXT NOT NULL,
    salary REAL NOT NULL DEFAULT 0,
    hire_date TEXT NOT NULL,
    status TEXT CHECK(status IN ('active', 'inactive', 'on_leave')) DEFAULT 'active',
    performance_notes TEXT,
    resume_text TEXT,
    device_enroll_id TEXT UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS applicants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    role_applied TEXT NOT NULL,
    experience_years INTEGER NOT NULL DEFAULT 0,
    skills TEXT,
    resume_text TEXT,
    ai_score REAL DEFAULT 0,
    ai_assessment TEXT,
    status TEXT CHECK(status IN ('pending', 'reviewed', 'interviewed', 'accepted', 'rejected')) DEFAULT 'pending',
    applied_date DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS attendance (
    id TEXT PRIMARY KEY,
    employee_id TEXT,
    device_enroll_id TEXT NOT NULL,
    timestamp DATETIME NOT NULL,
    verification_method TEXT CHECK(verification_method IN ('face', 'fingerprint', 'card', 'password', 'manual', 'unknown')),
    direction TEXT CHECK(direction IN ('in', 'out', 'break_in', 'break_out', 'unknown')) DEFAULT 'unknown',
    source TEXT CHECK(source IN ('online_push', 'usb_import', 'manual_entry')) DEFAULT 'online_push',
    sync_status TEXT DEFAULT 'pending',
    sync_updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_archived BOOLEAN NOT NULL DEFAULT 0,
    _sync_error TEXT,
    FOREIGN KEY (employee_id) REFERENCES employees(id)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS ai_insights (
    id TEXT PRIMARY KEY,
    role TEXT NOT NULL CHECK(role IN ('user', 'agent')),
    content TEXT NOT NULL,
    metadata TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS user_permissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    module TEXT NOT NULL,
    action TEXT NOT NULL,
    allowed INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, module, action)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS employee_tasks (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL CHECK(status IN ('pending', 'in_progress', 'completed')) DEFAULT 'pending',
    due_date TEXT,
    assigned_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_by) REFERENCES users(id)
  )
`);


// --- 2. COLUMN MIGRATIONS (Safe updates for existing DBs) ---

const tables = ['users', 'inventory', 'audit_logs', 'usage_logs', 'categories', 'suppliers', 'orders', 'order_items', 'payments', 'accounts', 'invoices', 'transactions', 'trucks', 'granite_deliveries', 'notifications', 'employees', 'applicants', 'attendance', 'user_permissions', 'employee_tasks'];
for (const table of tables) {
  try { db.exec(`ALTER TABLE ${table} ADD COLUMN sync_status TEXT DEFAULT 'pending'`); } catch (e) {}
  try { db.exec(`ALTER TABLE ${table} ADD COLUMN sync_updated_at DATETIME DEFAULT CURRENT_TIMESTAMP`); } catch (e) {}
  try { db.exec(`ALTER TABLE ${table} ADD COLUMN is_archived BOOLEAN NOT NULL DEFAULT 0`); } catch (e) {}
  try { db.exec(`ALTER TABLE ${table} ADD COLUMN _sync_error TEXT`); } catch (e) {}
  try { db.exec(`UPDATE ${table} SET is_archived = 0 WHERE is_archived IS NULL`); } catch (e) {}
}

try { db.exec(`ALTER TABLE employees ADD COLUMN device_enroll_id TEXT`); } catch (e) {}
try { db.exec(`ALTER TABLE employees ADD COLUMN supervisor_id INTEGER REFERENCES users(id)`); } catch (e) {}
try { db.exec(`ALTER TABLE inventory ADD COLUMN category_id TEXT`); } catch (e) {}
try { db.exec(`ALTER TABLE order_items ADD COLUMN delivered_quantity INTEGER DEFAULT 0`); } catch (e) {}
try { db.exec(`ALTER TABLE orders ADD COLUMN delivery_status TEXT DEFAULT 'pending'`); } catch (e) {}
try { db.exec(`ALTER TABLE sync_queue ADD COLUMN synced BOOLEAN NOT NULL DEFAULT 0`); } catch (e) {}
try { db.exec(`ALTER TABLE sync_queue ADD COLUMN _sync_error TEXT`); } catch (e) {}
try { db.exec(`ALTER TABLE suppliers ADD COLUMN status TEXT DEFAULT 'active'`); } catch (e) {}
try { db.exec(`ALTER TABLE usage_logs ADD COLUMN transaction_type TEXT DEFAULT 'OUT'`); } catch (e) {}
try { db.exec(`ALTER TABLE trucks ADD COLUMN latitude REAL`); } catch (e) {}
try { db.exec(`ALTER TABLE trucks ADD COLUMN longitude REAL`); } catch (e) {}
try { db.exec(`ALTER TABLE trucks ADD COLUMN last_location_update TEXT`); } catch (e) {}
try { db.exec(`ALTER TABLE granite_deliveries ADD COLUMN empty_weight REAL`); } catch (e) {}
try { db.exec(`ALTER TABLE granite_deliveries ADD COLUMN loaded_weight REAL`); } catch (e) {}
try { db.exec(`ALTER TABLE granite_deliveries ADD COLUMN net_weight REAL`); } catch (e) {}
try { db.exec(`ALTER TABLE granite_deliveries ADD COLUMN volume_m3 REAL`); } catch (e) {}

// --- 3. SEEDING & HOUSEKEEPING ---

// Helper to check if a user can view or edit their own performance data
export const canAccessPerformance = (user, targetEmployeeId) => {
  // Admin can access any employee's performance
  if (user.role === 'admin') return true;
  
  // Check if supervisor of the target employee or if it is the employee themselves (match by email)
  const emp = db.prepare('SELECT email, supervisor_id FROM employees WHERE id = ?').get(targetEmployeeId);
  if (emp) {
    if (emp.supervisor_id === user.id) return true;
    if (user.email && emp.email === user.email) return true;
  }
  return false;
};

export const canAdminToggleGlobalAI = (user) => {
  // Only admin can toggle the global AI access flag
  return user.role === 'admin';
};

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
  { key: 'active_agent_model', value: 'gemini' },
  { key: 'deepseek_api_key', value: 'sk-87f10ecb478848afbc85468bde6027e1' },
  { key: 'default_map_lat', value: '9.509167' },
  { key: 'default_map_lng', value: '-13.712222' },
  { key: 'ikike_cron_frequency', value: '15' },
  { key: 'clear_insights_interval', value: 'never' },
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

// One-time migration: reset sync_meta pull timestamps now that we use `sync_updated_at`
// instead of the incorrect `updated_at` column. This forces a full re-pull on next sync
// so no records are missed due to stale bookmarks from the old (wrong) column name.
try {
  const metaExists = db.prepare("SELECT COUNT(*) as c FROM sqlite_master WHERE type='table' AND name='sync_meta'").get().c;
  if (metaExists > 0) {
    const alreadyMigrated = db.prepare("SELECT value FROM app_config WHERE key = 'sync_meta_col_fix_v1'").get();
    if (!alreadyMigrated) {
      console.log('[Database] Resetting sync_meta timestamps for tableTimeCols column fix...');
      db.prepare("DELETE FROM sync_meta WHERE table_name != '_system_init'").run();
      db.prepare("INSERT OR REPLACE INTO app_config (key, value, updated_at) VALUES ('sync_meta_col_fix_v1', 'done', CURRENT_TIMESTAMP)").run();
      console.log('[Database] sync_meta reset complete. Next pull will be a full re-pull.');
    }
  }
} catch (e) {
  console.warn('[Database] sync_meta reset skipped (non-fatal):', e.message);
}

// --- 4. CORE FUNCTIONS ---

// Global error handling to prevent the app from crashing on unexpected errors
process.on('uncaughtException', (err) => {
  console.error('[Uncaught Exception]', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Unhandled Rejection]', reason);
});

export function sanitizeSchema() {
  const tablesToFix = ['inventory', 'categories', 'suppliers', 'orders', 'order_items', 'payments', 'usage_logs', 'audit_logs'];
  for (const table of tablesToFix) {
    try {
      const info = db.prepare(`PRAGMA table_info(${table})`).all();
      const idCol = info.find(c => c.name === 'id');
      // Only alter if the primary key is an INTEGER AUTOINCREMENT (legacy) that needs conversion to TEXT UUID
      if (idCol && (idCol.type === 'INTEGER' || idCol.type.toUpperCase().includes('INT')) && idCol.pk) {
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
    repairTable('usage_logs', 'id');
    repairTable('audit_logs', 'id');
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
      
      // Skip items with NO usage logs — they were set manually (e.g. via order delivery)
      // and reconciling them to 0 would incorrectly zero out the stock.
      if ((ledger.total_in || 0) === 0 && (ledger.total_out || 0) === 0) {
        continue;
      }

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


export function runIntegrityAnalysis() {
  console.log('--- [Database Integrity Analysis] ---');
  let issues = 0;

  // 1. Check for orphaned foreign keys
  const orphanChecks = [
    { table: 'order_items', fk: 'order_id', parent: 'orders' },
    { table: 'payments', fk: 'order_id', parent: 'orders' },
    { table: 'usage_logs', fk: 'inventory_item_id', parent: 'inventory' },
    { table: 'employee_performance', fk: 'employee_id', parent: 'employees' },
    { table: 'employee_tasks', fk: 'employee_id', parent: 'employees' },
    { table: 'attendance', fk: 'employee_id', parent: 'employees' }
  ];

  for (const check of orphanChecks) {
    try {
      const orphans = db.prepare(`SELECT COUNT(*) as count FROM ${check.table} WHERE ${check.fk} NOT IN (SELECT id FROM ${check.parent}) AND ${check.fk} IS NOT NULL`).get();
      if (orphans.count > 0) {
        console.warn(`[Integrity] Found ${orphans.count} orphaned records in ${check.table} (missing ${check.parent})`);
        issues += orphans.count;
      }
    } catch(e) {}
  }

  // 2. Check sync queue status
  try {
    const queueStats = db.prepare('SELECT synced, COUNT(*) as count FROM sync_queue GROUP BY synced').all();
    let pending = 0;
    for (const stat of queueStats) {
      if (stat.synced === 0) pending = stat.count;
    }
    const errors = db.prepare('SELECT COUNT(*) as count FROM sync_queue WHERE _sync_error IS NOT NULL AND synced = 0').get().count;
    console.log(`[Integrity] Sync Queue: ${pending} pending items (${errors} currently in error state)`);
  } catch(e) {}

  console.log(`--- [Analysis Complete] Found ${issues} issues. ---`);
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
    sanitizeSchema();
    repairAllIds();
    reconcileLedger();
    
    // Auto-retry queue items that previously failed due to schema mismatches or missing parents
    console.log('[Database] Resetting stuck sync_queue items...');
    const result = db.prepare(`
      UPDATE sync_queue 
      SET synced = 0, _sync_error = NULL 
      WHERE _sync_error LIKE '%schema%' OR _sync_error LIKE '%Could not find%' OR _sync_error LIKE '%foreign key%'
    `).run();
    if (result.changes > 0) {
      console.log(`[Database] Unblocked ${result.changes} stuck sync items for retry.`);
    }

    runIntegrityAnalysis();
  } catch (error) {
    console.error('[Database] Post-startup maintenance failed:', error);
  }
}

export const canToggleGlobalAI = (user) => user.role === 'admin';

export default db;
