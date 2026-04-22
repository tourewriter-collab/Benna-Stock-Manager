const Database = require('better-sqlite3');
const db = new Database('database.sqlite');
const items = db.prepare('SELECT record_id, data FROM sync_queue WHERE table_name="inventory"').all();
items.forEach(i => console.log('ID:', i.record_id, 'DATA:', i.data));
