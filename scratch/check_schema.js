import Database from 'better-sqlite3';
const db = new Database('database.sqlite');
const tables = ['inventory', 'sync_queue', 'categories', 'suppliers', 'orders', 'order_items', 'payments'];
for (const table of tables) {
  console.log(`Schema for ${table}:`);
  const info = db.prepare(`PRAGMA table_info(${table})`).all();
  console.table(info);
}
db.close();
