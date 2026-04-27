import db from '../server/database.js';

try {
    const info = db.prepare('PRAGMA table_info(orders)').all();
    console.log('Orders Schema:');
    console.log(JSON.stringify(info, null, 2));
} catch (err) {
    console.error(err);
}
