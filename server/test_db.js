import db from './database.js';

try {
  const categories = db.prepare('SELECT * FROM categories ORDER BY name_en').all();
  console.log('Categories:', categories);
} catch (e) {
  console.error('Error fetching categories:', e);
}

try {
  const outstanding = db.prepare(`
    SELECT o.id, o.total_amount, o.paid_amount, o.order_date, s.name as supplier_name 
    FROM orders o JOIN suppliers s ON o.supplier_id = s.id 
    WHERE o.status IN ('pending', 'partial') 
    ORDER BY o.order_date DESC
  `).all();
  console.log('Outstanding orders:', outstanding);
} catch(e) {
  console.error('Error fetching outstanding orders:', e);
}
