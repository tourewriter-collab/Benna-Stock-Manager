import db from '../server/database.js';

console.log('--- Duplicate Inventory Check ---');
const duplicates = db.prepare(`
  SELECT name, COUNT(*) as count, GROUP_CONCAT(id) as ids, SUM(quantity) as total_qty
  FROM inventory 
  GROUP BY LOWER(TRIM(name))
  HAVING count > 1
`).all();

console.log(JSON.stringify(duplicates, null, 2));

console.log('\n--- Usage Logs for tires and wheels ---');
const logs = db.prepare(`
  SELECT item_name, inventory_item_id, quantity_changed, previous_quantity, new_quantity, transaction_type, timestamp
  FROM usage_logs 
  WHERE LOWER(item_name) LIKE '%tires%'
  ORDER BY timestamp DESC

`).all();

console.log(JSON.stringify(logs, null, 2));
