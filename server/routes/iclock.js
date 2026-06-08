import express from 'express';
import db from '../database.js';
import crypto from 'crypto';

const router = express.Router();

// Helper to update device status in settings
function updateDeviceStatus(req) {
  try {
    const sn = req.query.SN || 'unknown';
    let ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    
    // Clean up IPv6 prefix if present
    if (ip.startsWith('::ffff:')) {
      ip = ip.substring(7);
    }
    
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('device_last_seen', ?)").run(new Date().toISOString());
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('device_sn', ?)").run(String(sn));
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('device_ip', ?)").run(String(ip));
  } catch (err) {
    console.error('[ADMS] Error updating device status:', err);
  }
}

// 1. Handshake and option loading
// GET /iclock/cdata?SN=xxx&options=all
router.get('/cdata', (req, res) => {
  console.log('[ADMS] Handshake request from device:', req.query);
  updateDeviceStatus(req);
  
  const sn = req.query.SN || 'unknown';
  
  // Respond with ZKTeco ADMS settings
  res.setHeader('Content-Type', 'text/plain');
  res.send(`GET OPTION FROM: ${sn}
RegistryCode=
ServerVersion=2.2.14
ServerName=ADMS
PushVersion=2.0.28
ErrorDelay=30
Delay=10
TransInterval=10
TransFlag=1000000000
Realtime=1
Encrypt=0
`);
});

// 2. Fetch server commands (usually empty unless admin sends reboot/clear commands)
// GET /iclock/getrequest?SN=xxx
router.get('/getrequest', (req, res) => {
  updateDeviceStatus(req);
  res.setHeader('Content-Type', 'text/plain');
  res.send('OK');
});

// 3. Command execution response from device
// POST /iclock/devicecmd?SN=xxx
router.post('/devicecmd', (req, res) => {
  updateDeviceStatus(req);
  res.setHeader('Content-Type', 'text/plain');
  res.send('OK');
});

// 4. Data uploads (ATTLOG, USER, etc.)
// POST /iclock/cdata?SN=xxx&table=ATTLOG
router.post('/cdata', (req, res) => {
  updateDeviceStatus(req);
  const { table, SN } = req.query;
  console.log(`[ADMS] Data upload for table: ${table} from SN: ${SN}`);
  
  if (table && table.toUpperCase() === 'ATTLOG') {
    const rawData = req.body;
    if (!rawData) {
      return res.status(200).send('OK: 0');
    }
    
    const lines = rawData.split(/\r?\n/);
    let insertedCount = 0;
    
    // Prepare statements for SQLite
    const insertStmt = db.prepare(`
      INSERT OR IGNORE INTO attendance (
        id, employee_id, device_enroll_id, timestamp, verification_method, direction, source, sync_status
      ) VALUES (?, ?, ?, ?, ?, ?, 'online_push', 'pending')
    `);
    
    const syncQueueStmt = db.prepare(`
      INSERT INTO sync_queue (table_name, record_id, action, data)
      VALUES ('attendance', ?, 'INSERT', ?)
    `);
    
    // Cache employees mapping for performance
    const employeesList = db.prepare('SELECT id, device_enroll_id FROM employees WHERE is_archived = 0').all();
    const empMap = new Map();
    for (const emp of employeesList) {
      if (emp.device_enroll_id) {
        empMap.set(String(emp.device_enroll_id).trim(), emp.id);
      }
    }
    
    db.transaction(() => {
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        
        // Split by tab or space
        const parts = trimmed.split(/[\t,]+| {2,}/).map(p => p.trim()).filter(Boolean);
        const finalParts = parts.length >= 2 ? parts : trimmed.split(/\s+/).map(p => p.trim()).filter(Boolean);
        
        if (finalParts.length < 2) continue;
        
        const enrollId = finalParts[0];
        const timestampStr = finalParts[1];
        const verifyMode = finalParts[2] || 'unknown';
        const state = finalParts[3] || 'unknown';
        
        // Find employee ID
        const employeeId = empMap.get(String(enrollId).trim()) || null;
        
        // Map verify_mode (1 = fingerprint, 15 = face, 4 = card, 3 = password)
        let method = 'unknown';
        const modeLower = String(verifyMode).toLowerCase();
        if (modeLower === '1' || modeLower.includes('finger') || modeLower.includes('empreinte')) method = 'fingerprint';
        else if (modeLower === '15' || modeLower.includes('face') || modeLower.includes('visage')) method = 'face';
        else if (modeLower === '4' || modeLower.includes('card') || modeLower.includes('carte')) method = 'card';
        else if (modeLower === '3' || modeLower.includes('pass')) method = 'password';
        
        // Map state/direction (0 = in, 1 = out)
        let direction = 'unknown';
        const stateLower = String(state).toLowerCase();
        if (stateLower === '0' || stateLower.includes('in') || stateLower.includes('entree') || stateLower.includes('entrée')) direction = 'in';
        else if (stateLower === '1' || stateLower.includes('out') || stateLower.includes('sortie')) direction = 'out';
        
        const logId = crypto.randomUUID();
        try {
          const runRes = insertStmt.run(logId, employeeId, String(enrollId).trim(), timestampStr, method, direction);
          if (runRes.changes > 0) {
            syncQueueStmt.run(logId, JSON.stringify({
              id: logId, employee_id: employeeId, device_enroll_id: String(enrollId).trim(), timestamp: timestampStr, verification_method: method, direction, source: 'online_push'
            }));
            insertedCount++;
          }
        } catch (err) {
          console.error('[ADMS] Row insert error:', err);
        }
      }
    })();
    
    console.log(`[ADMS] Successfully processed ${insertedCount} attendance records.`);
    res.setHeader('Content-Type', 'text/plain');
    return res.status(200).send(`OK: ${insertedCount}`);
  }
  
  res.setHeader('Content-Type', 'text/plain');
  res.send('OK');
});

export default router;
