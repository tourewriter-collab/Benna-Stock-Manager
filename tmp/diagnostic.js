import db from '../server/database.js';

function diag() {
  console.log('--- Database Diagnostics ---');
  
  // 1. Check schemas
  try {
    const usageInfo = db.prepare("PRAGMA table_info(usage_logs)").all();
    console.log('usage_logs columns:', usageInfo.map(c => c.name).join(', '));
  } catch (e) {
    console.error('Error checking usage_logs:', e.message);
  }

  // 2. Check pending sync items
  try {
    const pending = db.prepare("SELECT * FROM sync_queue WHERE synced = 0 LIMIT 5").all();
    console.log('Total pending in queue:', db.prepare("SELECT COUNT(*) as c FROM sync_queue WHERE synced = 0").get().c);
    pending.forEach(p => {
      console.log(`- [${p.id}] Table: ${p.table_name}, Action: ${p.action}`);
      try {
        const data = JSON.parse(p.data);
        console.log(`  Data fragment: ${JSON.stringify(data).substring(0, 100)}...`);
      } catch (e) {
        console.log(`  Error parsing data: ${e.message}`);
      }
    });
  } catch (e) {
    console.error('Error checking sync_queue:', e.message);
  }
}

diag();
process.exit(0);
