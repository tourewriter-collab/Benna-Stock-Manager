import db from '../server/database.js';

console.log('--- Usage Logs ID Check ---');
const logs = db.prepare(`
  SELECT id, item_name, quantity_changed, transaction_type, timestamp 
  FROM usage_logs 
  ORDER BY timestamp DESC 
  LIMIT 20
`).all();

console.log(JSON.stringify(logs, null, 2));

console.log('\n--- Usage Logs Duplicate Check (by content) ---');
const dups = db.prepare(`
  SELECT item_name, quantity_changed, transaction_type, timestamp, COUNT(*) as count
  FROM usage_logs 
  GROUP BY item_name, quantity_changed, transaction_type, timestamp
  HAVING count > 1
`).all();

console.log(JSON.stringify(dups, null, 2));
