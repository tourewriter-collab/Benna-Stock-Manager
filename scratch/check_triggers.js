import Database from 'better-sqlite3';
import { join } from 'path';

const db = new Database('database.sqlite');
const triggers = db.prepare("SELECT name, sql FROM sqlite_master WHERE type='trigger'").all();
console.log('Triggers found:', JSON.stringify(triggers, null, 2));
db.close();
