import db from '../server/database.js';

console.log('--- LATEST INVENTORY ---');
const items = db.prepare('SELECT id, name, category, category_id, quantity FROM inventory ORDER BY last_updated DESC LIMIT 5').all();
console.log(items);

console.log('--- LATEST ORDERS ---');
const orders = db.prepare('SELECT id, status, delivery_status, total_amount, paid_amount FROM orders ORDER BY order_date DESC LIMIT 5').all();
console.log(orders);

console.log('--- LATEST ORDER ITEMS ---');
const orderItems = db.prepare('SELECT id, order_id, inventory_item_id, quantity, delivered_quantity FROM order_items ORDER BY sync_updated_at DESC LIMIT 5').all();
console.log(orderItems);

console.log('--- LATEST USAGE LOGS ---');
const usageLogs = db.prepare('SELECT id, inventory_item_id, item_name, quantity_changed, transaction_type FROM usage_logs ORDER BY timestamp DESC LIMIT 5').all();
console.log(usageLogs);
