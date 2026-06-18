import db from '../database.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as crypto from 'crypto';

let lastRunTime = 0;
let checkIntervalId = null;

// Gathers current system metrics to supply to the AI
function gatherStrategicContext() {
  try {
    const lowStock = db.prepare('SELECT name, quantity, min_stock FROM inventory WHERE is_archived = 0 AND quantity <= min_stock').all();
    const trucks = db.prepare('SELECT plate_number, status, latitude, longitude FROM trucks WHERE is_archived = 0').all();
    const accounts = db.prepare('SELECT name, balance FROM accounts WHERE is_archived = 0').all();
    const recentTrips = db.prepare('SELECT date, client_name, granite_type, quantity, total_amount FROM granite_deliveries WHERE is_archived = 0 ORDER BY date DESC LIMIT 3').all();

    return {
      lowStock,
      trucks,
      accounts,
      recentTrips
    };
  } catch (err) {
    console.error('[Benna Strategy] Context gather failed:', err.message);
    return null;
  }
}

// Calls Gemini or DeepSeek to generate a strategic notification
async function generateStrategicAdvice(context) {
  // Read keys and settings
  let activeModel = 'gemini';
  let geminiKey = process.env.GEMINI_API_KEY;
  let deepseekKey = '';

  try {
    const settingsRecords = db.prepare("SELECT key, value FROM settings WHERE key IN ('gemini_api_key', 'deepseek_api_key', 'active_agent_model')").all();
    for (const s of settingsRecords) {
      if (s.key === 'gemini_api_key' && !geminiKey) geminiKey = s.value;
      if (s.key === 'deepseek_api_key') deepseekKey = s.value;
      if (s.key === 'active_agent_model') activeModel = s.value;
    }
  } catch (e) {}

  const prompt = `
Live Enterprise Context:
- Low Stock Items: ${context.lowStock.length > 0 ? context.lowStock.map(i => `${i.name} (Qty: ${i.quantity}, Min: ${i.min_stock})`).join(', ') : 'None'}
- Active Fleet status: ${context.trucks.length > 0 ? context.trucks.map(t => `${t.plate_number}: ${t.status} (Loc: ${t.latitude ? `${t.latitude.toFixed(4)},${t.longitude.toFixed(4)}` : 'No GPS'})`).join(' | ') : 'No trucks registered'}
- Accounts Balances: ${context.accounts.length > 0 ? context.accounts.map(a => `${a.name}: ${a.balance} GNF`).join(', ') : 'No accounts'}
- Recent Deliveries: ${context.recentTrips.length > 0 ? context.recentTrips.map(t => `${t.date}: ${t.client_name || 'Generic Client'} purchased ${t.quantity}T of ${t.granite_type} for ${t.total_amount} GNF`).join(' | ') : 'None'}

As IKIKÉ, an elite African business AI, formulate a single clinical, professional, strategic alert (max 2 sentences) based on this data.
Focus on operational efficiency, potential stockouts, or fleet optimization.
Do NOT say "Based on the data" or "Here is the alert". Start directly with the strategic advisory.
`;

  const fallbackAlert = generateHeuristicAlert(context);

  if (activeModel === 'deepseek' && !deepseekKey) {
    if (geminiKey) activeModel = 'gemini';
    else return fallbackAlert;
  } else if (activeModel === 'gemini' && !geminiKey) {
    if (deepseekKey) activeModel = 'deepseek';
    else return fallbackAlert;
  }

  try {
    if (activeModel === 'gemini') {
      const genAI = new GoogleGenerativeAI(geminiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
      
      const result = await model.generateContent([
        { text: "You are IKIKÉ, an elite business advisor. Formulate a strategic operational alert." },
        { text: prompt }
      ]);
      const text = result.response.text();
      return text.trim();
    } else {
      const response = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${deepseekKey}`
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: 'You are IKIKÉ, an elite business advisor. Formulate a strategic operational alert.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.7,
          max_tokens: 150
        })
      });
      const data = await response.json();
      return data.choices[0].message.content.trim();
    }
  } catch (err) {
    console.error('[Benna Strategy] AI call failed. Falling back to rule-based alerts:', err.message);
    return fallbackAlert;
  }
}

// Generate rule-based alerts when AI keys are missing or offline
function generateHeuristicAlert(context) {
  if (context.lowStock.length > 0) {
    return `Operational Warning: Critical stock shortages detected for ${context.lowStock[0].name}. Reorder immediately to avoid delivery bottlenecks.`;
  }
  
  const inactiveTruck = context.trucks.find(t => t.status === 'maintenance' || t.status === 'inactive');
  if (inactiveTruck) {
    return `Fleet Warning: Truck ${inactiveTruck.plate_number} is currently ${inactiveTruck.status}. Schedule swift repair/maintenance to prevent transport capacity deficits.`;
  }

  const highBalanceAcc = context.accounts.find(a => a.balance > 1000000);
  if (highBalanceAcc) {
    return `Strategy Advisory: Cash reserves in ${highBalanceAcc.name} are high. Consider reinvesting or paying outstanding suppliers to secure discounts.`;
  }

  return `Strategic Update: Operations are running within normal parameters. Fleet and inventory levels are optimized.`;
}

// Runs the check and strategy formulation if frequency is met
export async function checkAndRunStrategy() {
  try {
    // 1. Fetch current strategic frequency setting
    let minutesFreq = 15;
    const setting = db.prepare('SELECT value FROM settings WHERE key = ?').get('benna_cron_frequency');
    if (setting && setting.value) {
      const parsed = parseInt(setting.value);
      if (!isNaN(parsed) && parsed > 0) {
        minutesFreq = parsed;
      }
    }

    const currentTime = Date.now();
    const elapsedMinutes = (currentTime - lastRunTime) / (60 * 1000);

    if (elapsedMinutes >= minutesFreq || lastRunTime === 0) {
      console.log(`[Benna Strategy] Running strategic assessment. Frequency is ${minutesFreq} minutes.`);
      
      const context = gatherStrategicContext();
      if (!context) return;

      const advice = await generateStrategicAdvice(context);
      
      // Save strategic alert to local DB
      const id = crypto.randomUUID();
      db.prepare(
        'INSERT INTO notifications (id, message, type, created_at, is_read, sync_status) VALUES (?, ?, ?, CURRENT_TIMESTAMP, 0, ?)'
      ).run(id, advice, 'strategy', 'pending');

      const saved = db.prepare('SELECT * FROM notifications WHERE id = ?').get(id);

      // Add to sync queue for cloud upload
      try {
        db.prepare('INSERT INTO sync_queue (table_name, record_id, action, data) VALUES (?, ?, ?, ?)').run(
          'notifications',
          id,
          'INSERT',
          JSON.stringify(saved)
        );
      } catch (e) {}

      lastRunTime = currentTime;
      console.log('[Benna Strategy] Formulated strategic alert successfully:', advice);
    }
  } catch (err) {
    console.error('[Benna Strategy] Cron job run failed:', err.message);
  }
}

export function startBennaStrategyCron() {
  if (checkIntervalId) {
    clearInterval(checkIntervalId);
  }

  console.log('[Benna Strategy] Initializing dynamic strategic advisor cron...');
  
  // Check settings and run strategic assessment if time has elapsed (runs check every 1 minute)
  checkIntervalId = setInterval(() => {
    checkAndRunStrategy();
  }, 60000);

  // Run immediately on boot
  setImmediate(() => {
    checkAndRunStrategy();
  });
}

export function stopBennaStrategyCron() {
  if (checkIntervalId) {
    clearInterval(checkIntervalId);
    checkIntervalId = null;
    console.log('[Benna Strategy] Strategic advisor cron stopped.');
  }
}
