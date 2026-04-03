import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// In packaged Electron, main.js sets DB_PATH to app.getPath('userData')/database.sqlite
// (a writable location outside the read-only ASAR archive).
// In development, fall back to the repo-root database.sqlite.
const dbPath = process.env.DB_PATH || join(__dirname, '..', 'database.sqlite');
console.log('[Database] Opening at:', dbPath);

const db = new Database(dbPath);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin', 'audit_manager', 'user')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    sync_status TEXT DEFAULT 'synced',
    sync_updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0,
    price REAL NOT NULL,
    supplier TEXT,
    location TEXT NOT NULL,
    min_stock INTEGER DEFAULT 10,
    max_stock INTEGER DEFAULT 100,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
    sync_status TEXT DEFAULT 'synced',
    sync_updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    table_name TEXT NOT NULL,
    record_id TEXT NOT NULL,
    old_values TEXT,
    new_values TEXT,
    ip_address TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    sync_status TEXT DEFAULT 'synced',
    sync_updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS usage_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    inventory_item_id TEXT NOT NULL,
    item_name TEXT NOT NULL,
    quantity_changed INTEGER NOT NULL,
    previous_quantity INTEGER NOT NULL,
    new_quantity INTEGER NOT NULL,
    user_id INTEGER,
    transaction_type TEXT DEFAULT 'OUT', -- 'IN' for delivery, 'OUT' for usage
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    sync_status TEXT DEFAULT 'synced',
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
    sync_status TEXT DEFAULT 'synced',
    sync_updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    sync_status TEXT DEFAULT 'synced',
    sync_updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
    notes TEXT,
    created_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    sync_status TEXT DEFAULT 'synced',
    sync_updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS order_items (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    inventory_item_id TEXT,
    description TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK(quantity > 0),
    unit_price REAL NOT NULL CHECK(unit_price >= 0),
    total REAL NOT NULL,
    sync_status TEXT DEFAULT 'synced',
    sync_updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
    sync_status TEXT DEFAULT 'synced',
    sync_updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
    synced BOOLEAN DEFAULT 0
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  )
`);

// Add columns to existing tables if they don't have them
const tables = ['users', 'inventory', 'audit_logs', 'usage_logs', 'categories', 'suppliers', 'orders', 'order_items', 'payments'];
for (const table of tables) {
  try { db.exec(`ALTER TABLE ${table} ADD COLUMN sync_status TEXT DEFAULT 'synced'`); } catch (e) {}
  try { db.exec(`ALTER TABLE ${table} ADD COLUMN sync_updated_at DATETIME DEFAULT CURRENT_TIMESTAMP`); } catch (e) {}
  try { db.exec(`ALTER TABLE ${table} ADD COLUMN is_archived BOOLEAN DEFAULT 0`); } catch (e) {}
}
try { db.exec(`ALTER TABLE inventory ADD COLUMN category_id TEXT`); } catch (e) {}
try { db.exec(`ALTER TABLE order_items ADD COLUMN delivered_quantity INTEGER DEFAULT 0`); } catch (e) {}
try { db.exec(`ALTER TABLE orders ADD COLUMN delivery_status TEXT DEFAULT 'pending'`); } catch (e) {}
try { db.exec(`ALTER TABLE sync_queue ADD COLUMN synced BOOLEAN DEFAULT 0`); } catch (e) {}
try { db.exec(`ALTER TABLE suppliers ADD COLUMN status TEXT DEFAULT 'active'`); } catch (e) {}
try { db.exec(`ALTER TABLE usage_logs ADD COLUMN transaction_type TEXT DEFAULT 'OUT'`); } catch (e) {}

// Add functional indexes for performance
try {
  db.exec('CREATE INDEX IF NOT EXISTS idx_inventory_category_id ON inventory(category_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_inventory_supplier ON inventory(supplier)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_inventory_name ON inventory(name)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_audit_logs_table_record ON audit_logs(table_name, record_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_usage_logs_item_id ON usage_logs(inventory_item_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_usage_logs_timestamp ON usage_logs(timestamp)');
} catch (e) {
  console.warn('[Database] Failed to create secondary indexes:', e.message);
}

try { db.exec(`ALTER TABLE categories ADD COLUMN is_archived BOOLEAN DEFAULT 0`); } catch (e) {}
try { db.exec(`ALTER TABLE suppliers ADD COLUMN is_archived BOOLEAN DEFAULT 0`); } catch (e) {}

// Seed default admin user if not present
const checkAdmin = db.prepare('SELECT * FROM users WHERE email = ?').get('cheickahmedt@gmail.com');

if (!checkAdmin) {
  const hashedPassword = bcrypt.hashSync('admin123', 10);
  db.prepare('INSERT INTO users (email, password, name, role) VALUES (?, ?, ?, ?)').run(
    'cheickahmedt@gmail.com',
    hashedPassword,
    'Default Admin',
    'admin'
  );
  console.log('[Database] Default admin user created');
}

// Seed default settings
const seedSettings = [
  { key: 'high_balance_threshold', value: '100000' },
  { key: 'company_logo', value: '' }
];

for (const setting of seedSettings) {
  const exists = db.prepare('SELECT * FROM settings WHERE key = ?').get(setting.key);
  if (!exists) {
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(setting.key, setting.value);
  }
}

// Stamp the DB creation time and app version if not already present.
// This lets us detect stale databases from old installs.
const dbCreatedAt = db.prepare("SELECT * FROM settings WHERE key = 'db_created_at'").get();
if (!dbCreatedAt) {
  db.prepare("INSERT INTO settings (key, value) VALUES ('db_created_at', datetime('now'))").run();
}

// Track the current application version that last touched this DB.
const appVersion = process.env.APP_VERSION || '1.0.14';
const dbAppVersion = db.prepare("SELECT * FROM settings WHERE key = 'db_app_version'").get();
if (!dbAppVersion) {
  db.prepare("INSERT INTO settings (key, value) VALUES ('db_app_version', ?)").run(appVersion);
} else if (dbAppVersion.value !== appVersion) {
  db.prepare("UPDATE settings SET value = ? WHERE key = 'db_app_version'").run(appVersion);
}

// ---------------------------------------------------------------------------
// CONDITIONAL SEEDING
// CRITICAL: Only seed default categories/suppliers if Supabase is NOT configured.
// When Supabase IS configured, the app will pull real UUID-based data from the cloud.
// Seeding with hardcoded fallback IDs (like 'cat_engine_parts') when cloud data exists
// creates DUPLICATES after every factory reset, inflating totals and breaking references.
// ---------------------------------------------------------------------------
const hasSupabaseConfig = !!(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL) &&
  !!process.env.SUPABASE_SERVICE_ROLE_KEY;

const categoryCount = db.prepare('SELECT COUNT(*) as c FROM categories').get().c;
const supplierCount = db.prepare('SELECT COUNT(*) as c FROM suppliers').get().c;

if (!hasSupabaseConfig && categoryCount === 0) {
  console.log('[Database] No Supabase config detected -- seeding default categories.');
  // seed happens below
} else if (hasSupabaseConfig) {
  console.log('[Database] Supabase configured -- skipping default category/supplier seeding (will pull from cloud).');
}

if (!hasSupabaseConfig && categoryCount === 0) {
  const defaultCategories = [
    { en: 'Engine Parts', fr: 'Pices moteur' },
    { en: 'Lubricants & Fluids', fr: 'Lubrifiants et fluides' },
    { en: 'Tools & Equipment', fr: 'Outils et quipement' },
    { en: 'Tires & Wheels', fr: 'Pneus et roues' },
    { en: 'Brake & Clutch System', fr: 'Systme de frein et embrayage' },
    { en: 'Transmission & Drivetrain', fr: 'Transmission et chane cinmatique' },
    { en: 'Suspension & Steering', fr: 'Suspension et direction' },
    { en: 'Electrical & Electronics', fr: 'lectrique et lectronique' },
    { en: 'Cooling System', fr: 'Systme de refroidissement' },
    { en: 'Fuel System', fr: "Systme d'alimentation en carburant" },
    { en: 'Body & Cab Parts', fr: 'Carrosserie et cabine' },
    { en: 'Hardware & Fasteners', fr: 'Quincaillerie et fixations' },
    { en: 'Safety Gear (PPE)', fr: 'quipement de scurit (EPI)' },
    { en: 'Filters', fr: 'Filtres' },
    { en: 'Hydraulics', fr: 'Hydraulique' }
  ];

  for (const cat of defaultCategories) {
    const exists = db.prepare('SELECT * FROM categories WHERE name_en = ?').get(cat.en);
    if (!exists) {
      const fallbackId = 'cat_' + cat.en.toLowerCase().replace(/[^a-z0-9]/g, '_');
      db.prepare('INSERT INTO categories (id, name_en, name_fr, is_archived, sync_status) VALUES (?, ?, ?, 0, ?)')
        .run(fallbackId, cat.en, cat.fr, 'synced'); // 'synced' so they don't push to cloud
    }
  }
}

if (!hasSupabaseConfig && supplierCount === 0) {
  const defaultSuppliers = [
    'AMMARS SARL',
    'ERA SHACMAN TRUCK SARLU',
    'ABOUBACAR CAMARA',
    'LAYE DIARRA KOUROUMA',
    'MOHAMED KANTE',
    'KOLABOUI',
    'KALLO SARL',
    'ABDOULAYE KABA & FRERE',
    'ALCOTEX',
    'BELT WAY SARLU',
    'ABDOULAYE DIABY',
    'SKOUBA TOURE'
  ];

  for (const supName of defaultSuppliers) {
    const exists = db.prepare('SELECT * FROM suppliers WHERE name = ?').get(supName);
    if (!exists) {
      const fallbackId = 'sup_' + supName.toLowerCase().replace(/[^a-z0-9]/g, '_');
      db.prepare('INSERT INTO suppliers (id, name, is_archived, sync_status) VALUES (?, ?, 0, ?)')
        .run(fallbackId, supName, 'synced'); // 'synced' so they don't push to cloud
    }
  }
}

// ---------------------------------------------------------------------------
// STARTUP INTEGRITY CHECK -- clean up orphaned order_items
// These can accumulate if an order was deleted on another device but items remain locally
// ---------------------------------------------------------------------------
try {
  const orphanCleanup = db.prepare(`
    DELETE FROM order_items 
    WHERE order_id NOT IN (SELECT id FROM orders)
  `).run();
  if (orphanCleanup.changes > 0) {
    console.log(`[Database] Cleaned up ${orphanCleanup.changes} orphaned order item(s) on startup.`);
  }
} catch (e) {
  console.warn('[Database] Orphan cleanup failed:', e.message);
}

export default db;
