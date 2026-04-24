import db from '../../server/database.js';

console.log('Cleaning up corrupt sync queue entries...');

// Delete usage_logs entries with numeric IDs (corrupt)
const result = db.prepare("DELETE FROM sync_queue WHERE table_name = 'usage_logs' AND (record_id LIKE '%.%' OR length(record_id) < 10)").run();

console.log(`Deleted ${result.changes} corrupt sync entries.`);

// Also fix any items with data = 'null'
const result2 = db.prepare("DELETE FROM sync_queue WHERE data IS NULL OR data = 'null'").run();
console.log(`Deleted ${result2.changes} null sync entries.`);
