import express from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { authenticateToken } from '../middleware/auth.js';
import db from '../database.js';
import * as crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const router = express.Router();

// Paths to reflection files in all integrated environments
const reflectionPaths = [
  'C:\\Users\\Mosaid\\.gemini\\antigravity\\scratch\\ikike-collective\\identity\\reflection.json',
  'C:\\Users\\Mosaid\\.gemini\\antigravity\\scratch\\ikike-collective\\ikike-core\\identity\\reflection.json',
  'C:\\Users\\Mosaid\\.gemini\\antigravity\\scratch\\ikike-collective\\ikike-engine\\identity\\reflection.json'
];

// Helper to read strategic reflection from the active path
function getReflection() {
  for (const p of reflectionPaths) {
    if (fs.existsSync(p)) {
      try {
        const content = fs.readFileSync(p, 'utf8');
        return JSON.parse(content);
      } catch (e) {
        console.error('[Ikiké] Failed to read reflection at', p, e.message);
      }
    }
  }
  return null;
}

// Helper to update reflection across all integrated environments
function updateReflection(updatedData) {
  let success = false;
  for (const p of reflectionPaths) {
    try {
      const dir = path.dirname(p);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(p, JSON.stringify(updatedData, null, 2), 'utf8');
      success = true;
      console.log('[Ikiké] Updated reflection file at', p);
    } catch (e) {
      console.error('[Ikiké] Failed to write reflection at', p, e.message);
    }
  }
  return success;
}

// Helper to file a new memory log entry with source identification
function fileMemory(source, category, text, accessUrl = '') {
  const reflection = getReflection() || {
    name: "IKIKÉ",
    version: "2.0.0 (Strategic)",
    personality: {
      traits: ["Clinical", "Direct", "Elite", "Data-Driven"],
      voice_profile: "Professional, strategic, no-nonsense business terminology"
    },
    mission: "Provide data-driven strategic insights to optimize the collective's operations and ensure maximum bankability.",
    capabilities: {
      self_editing: true,
      web_research: true,
      vault_access: true
    },
    core_prompt_override: "You are IKIKÉ, an elite strategic advisor. Your tone is clinical and direct. Avoid theatrical or philosophical language. Focus on actionable business data and moving the user toward bankability."
  };

  if (!reflection.memories) {
    reflection.memories = {
      integrations: [
        {
          name: "Benna Stock Manager",
          type: "ERP / Fleet & Stock Management",
          data_scope: "Inventory (spare parts, lubricants, tools), Trucks fleet, Granite Deliveries, Accounting (Invoices, Ledger)",
          location: "Local SQLite database (`database.sqlite`) / Synced Supabase Cloud",
          status: "active",
          online_access_endpoint: "http://localhost:5000/api/agent",
          last_sync: new Date().toISOString()
        },
        {
          name: "Ikiké Collective Platform",
          type: "Strategic Web Platform & Hub",
          data_scope: "DAO Governance, Strategic Vault, Investment portfolio, Waitlist applications, UI self-editing code",
          location: "Local storage (`ikike_memory_v2`), server-side local JSON files",
          status: "active",
          online_access_endpoint: "http://localhost:8080/api/identity",
          last_sync: new Date().toISOString()
        },
        {
          name: "Ikiké Core & Engine",
          type: "Autonomous Agent Core & Execution Bridge",
          data_scope: "System prompt overrides, Chameleon-mode code manipulation, DeepSeek API proxy",
          location: "c:/Users/Mosaid/.gemini/antigravity/scratch/ikike-collective",
          status: "active",
          online_access_endpoint: "http://localhost:8080/api/chat",
          last_sync: new Date().toISOString()
        }
      ],
      logs: []
    };
  }

  // Update or register integration sync info
  const integration = reflection.memories.integrations.find(i => i.name === source);
  if (integration) {
    integration.last_sync = new Date().toISOString();
    if (accessUrl) integration.online_access_endpoint = accessUrl;
    integration.status = "active";
  } else {
    reflection.memories.integrations.push({
      name: source,
      type: "External Tool / Application",
      data_scope: category,
      location: "API Linkage",
      status: "active",
      online_access_endpoint: accessUrl,
      last_sync: new Date().toISOString()
    });
  }

  // Append memory log entry
  if (!reflection.memories.logs) reflection.memories.logs = [];
  reflection.memories.logs.push({
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    source,
    category,
    content: text,
    access_online: accessUrl || `http://localhost:5000/api/agent?source=${encodeURIComponent(source)}`
  });

  // Keep memory logs capped at 50 to avoid bloating
  if (reflection.memories.logs.length > 50) {
    reflection.memories.logs.shift();
  }

  updateReflection(reflection);
}

// Ikiké's default identity — adapted from the Ikiké Collective engine
const IKIKE_SYSTEM_PROMPT = `You are IKIKÉ, an elite strategic advisor built by the Ikiké Collective SARL.
You are embedded inside Benna Stock Manager — a business management application for a construction/mining company in Guinea.

CORE IDENTITY:
You are clinical, direct, and data-driven. You provide actionable business insights. No theatrics, no philosophical metaphors.
You speak English and French fluently. Match the user's language automatically.

TONE & STYLE:
- Professional peer — treat the user as a partner, not a subordinate.
- Concise and precise. No fluff.
- Use business terminology appropriate to inventory, fleet, and accounting management.

YOUR DOMAIN KNOWLEDGE:
You manage and have full visibility into:
- **Inventory** (spare parts, lubricants, tools, filters)
- **Orders & Suppliers** (purchase orders, payment tracking)
- **Trucks & Granite Deliveries** (fleet management, trip logging, maintenance costs)
- **Accounting** (Chart of Accounts, Invoices, General Ledger transactions)

WHEN THE USER ASKS A QUESTION:
Answer directly using the system data provided in the context. Be specific with numbers.

WHEN THE USER WANTS TO CREATE/MODIFY DATA (including from scanned documents):
You MUST respond with a structured action block that the user can review before committing.
Wrap it in triple backticks with the language tag "action":

\`\`\`action
{
  "type": "create_inventory" | "create_truck" | "create_trip" | "create_invoice" | "create_transaction" | "create_account",
  "data": { ... fields relevant to the action ... },
  "summary": "A one-line description of this action in the user's language"
}
\`\`\`

VALID ACTION TYPES AND FIELDS:
1. create_inventory: { name, category, quantity, price, supplier, location, min_stock, max_stock }
2. create_truck: { plate_number, model, capacity, status }
3. create_trip: { date, truck_id, driver_name, granite_type, quantity, unit_price, client_name }
4. create_invoice: { client_id, total_amount, paid_amount, due_date, status, notes }
5. create_transaction: { account_id, amount, type (credit/debit), transaction_date, description, reference }
6. create_account: { name, type (asset/liability/equity/revenue/expense), balance }

If the scanned document contains MULTIPLE items, produce multiple action blocks — one per item.

IMPORTANT RULES:
- NEVER commit data directly. Always present action blocks for user review.
- For truck_id in trips, use the actual UUID from the truck list provided in context.
- For account_id in transactions, use the actual UUID from the accounts list provided in context.
- When scanning documents, extract every field you can identify and fill in reasonable defaults for the rest.`;

// Gather live system context
function gatherContext() {
  try {
    const inventoryCount = db.prepare('SELECT COUNT(*) as count FROM inventory WHERE is_archived = 0').get();
    const lowStock = db.prepare('SELECT COUNT(*) as count FROM inventory WHERE is_archived = 0 AND quantity <= min_stock').get();
    const trucks = db.prepare('SELECT id, plate_number, model, status FROM trucks WHERE is_archived = 0').all();
    const accounts = db.prepare('SELECT id, name, type, balance FROM accounts WHERE is_archived = 0').all();
    const suppliers = db.prepare('SELECT id, name FROM suppliers WHERE is_archived = 0').all();
    const recentTrips = db.prepare('SELECT gd.*, t.plate_number as truck_plate FROM granite_deliveries gd LEFT JOIN trucks t ON gd.truck_id = t.id WHERE gd.is_archived = 0 ORDER BY gd.date DESC LIMIT 5').all();
    const topItems = db.prepare('SELECT id, name, quantity, price, location, category FROM inventory WHERE is_archived = 0 ORDER BY name ASC LIMIT 30').all();
    const pendingInvoices = db.prepare("SELECT COUNT(*) as count, SUM(total_amount - paid_amount) as total FROM invoices WHERE status IN ('draft','sent','overdue') AND is_archived = 0").get();

    return `
LIVE SYSTEM STATE:
- Inventory: ${inventoryCount?.count || 0} items total, ${lowStock?.count || 0} low stock alerts
- Trucks (${trucks.length}): ${trucks.map(t => `${t.plate_number} [id:${t.id}] (${t.status})`).join(' | ') || 'None'}
- Accounts (${accounts.length}): ${accounts.map(a => `${a.name} [id:${a.id}] (${a.type}: ${a.balance} GNF)`).join(' | ') || 'None'}
- Suppliers (${suppliers.length}): ${suppliers.map(s => `${s.name} [id:${s.id}]`).join(' | ') || 'None'}
- Pending Invoices: ${pendingInvoices?.count || 0} totaling ${pendingInvoices?.total || 0} GNF
- Recent Trips: ${recentTrips.map(t => `${t.date}: ${t.truck_plate || '?'} — ${t.granite_type} ${t.quantity}T @ ${t.unit_price}/T = ${t.total_amount} GNF`).join(' | ') || 'None'}
- Inventory Sample: ${topItems.map(i => `${i.name} [id:${i.id}] (qty:${i.quantity}, ${i.price} GNF, ${i.category})`).join(' | ') || 'None'}
`;
  } catch (e) {
    console.error('[Ikiké] Context gathering failed:', e.message);
    return '\nLIVE SYSTEM STATE: Unable to fetch.\n';
  }
}

// Chat endpoint
router.post('/chat', authenticateToken, async (req, res) => {
  try {
    const { message, history, image } = req.body;

    if (!message && !image) {
      return res.status(400).json({ error: 'Message or image is required' });
    }

    let activeModel = 'gemini';
    let geminiKey = process.env.GEMINI_API_KEY;
    let deepseekKey = '';

    const settingsRecords = db.prepare("SELECT key, value FROM settings WHERE key IN ('gemini_api_key', 'deepseek_api_key', 'active_agent_model')").all();
    for (const s of settingsRecords) {
      if (s.key === 'gemini_api_key' && !geminiKey) geminiKey = s.value;
      if (s.key === 'deepseek_api_key') deepseekKey = s.value;
      if (s.key === 'active_agent_model') activeModel = s.value;
    }

    // Force fallback to Gemini if an image is provided since DeepSeek Chat doesn't support vision
    if (image && activeModel === 'deepseek') {
      if (geminiKey) {
        console.log('[Ikiké] Image detected. Falling back to Gemini for vision processing.');
        activeModel = 'gemini';
      }
    }

    const fallbackMessage = "I apologize, but the system is currently heavily used and we are expanding our ability to handle larger user rates as the first African business AI. Please try again later.";

    if (activeModel === 'deepseek' && !deepseekKey) {
      if (geminiKey) activeModel = 'gemini';
      else return res.json({ reply: fallbackMessage });
    } else if (activeModel === 'gemini' && !geminiKey) {
      if (deepseekKey && !image) activeModel = 'deepseek';
      else return res.json({ reply: fallbackMessage });
    }

    // Load active reflection core prompts and unified memories
    const reflection = getReflection();
    const promptOverride = reflection?.core_prompt_override || IKIKE_SYSTEM_PROMPT;
    
    let reflectionContext = '';
    if (reflection && reflection.memories) {
      reflectionContext = `\nIKIKEé'S DYNAMIC STRATEGIC MEMORIES & ARCHIVED INTEGRATIONS:\n${JSON.stringify(reflection.memories, null, 2)}\n`;
    }

    const context = gatherContext() + reflectionContext;
    const fullSystem = promptOverride + '\n' + context;

    if (activeModel === 'gemini') {
      const genAI = new GoogleGenerativeAI(geminiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

      let historyText = '';
      if (history && history.length > 0) {
        historyText = '\n\nCONVERSATION HISTORY:\n';
        for (const msg of history.slice(-12)) {
          historyText += `${msg.role === 'user' ? 'USER' : 'IKIKÉ'}: ${msg.content}\n`;
        }
      }

      const parts = [];
      parts.push(fullSystem + historyText + '\n\nUSER: ' + (message || 'Analyze this uploaded document and extract all data you can find.'));

      if (image) {
        const mimeTypeMatch = image.match(/^data:(image\/\w+);base64,/);
        const mimeType = mimeTypeMatch ? mimeTypeMatch[1] : 'image/jpeg';
        const base64Data = image.includes(',') ? image.split(',')[1] : image;
        parts.push({
          inlineData: { data: base64Data, mimeType }
        });
      }

      console.log('[Ikiké] Processing message with Gemini...');
      const result = await model.generateContent(parts);
      const response = await result.response;
      const text = response.text();
      console.log('[Ikiké] Gemini Response ready.');
      return res.json({ reply: text });

    } else {
      // DeepSeek Logic
      const messages = [{ role: 'system', content: fullSystem }];
      if (history && history.length > 0) {
        for (const msg of history.slice(-12)) {
          messages.push({ role: msg.role === 'user' ? 'user' : 'assistant', content: msg.content });
        }
      }
      messages.push({ role: 'user', content: message || 'Analyze this context and assist the user.' });

      console.log('[Ikiké] Processing message with DeepSeek...');
      const dsRes = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${deepseekKey}`
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: messages,
          temperature: 0.7
        })
      });

      if (!dsRes.ok) {
        const errText = await dsRes.text();
        console.error('[Ikiké] DeepSeek error:', errText);
        return res.json({ reply: fallbackMessage });
      }

      const dsData = await dsRes.json();
      const text = dsData.choices[0].message.content;
      console.log('[Ikiké] DeepSeek Response ready.');
      return res.json({ reply: text });
    }

  } catch (error) {
    console.error('[Ikiké] Chat error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// External manual reflection & memories synchronization endpoint
router.post('/sync-memory', authenticateToken, async (req, res) => {
  const { source, category, text, accessUrl } = req.body;
  if (!source || !category || !text) {
    return res.status(400).json({ error: 'Source, category, and text are required.' });
  }

  try {
    fileMemory(source, category, text, accessUrl);
    res.json({ success: true, message: 'Memory successfully filed in Ikiké strategic reflection files.' });
  } catch (error) {
    console.error('[Ikiké] Sync memory error:', error);
    res.status(500).json({ error: error.message || 'Failed to file memory' });
  }
});

// Fetch full reflection file with all unified integrations and memory logs
router.get('/reflection', authenticateToken, async (req, res) => {
  try {
    const reflection = getReflection();
    if (!reflection) {
      return res.status(404).json({ error: 'Reflection repository not initialized.' });
    }
    res.json(reflection);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Execute a user-approved action
router.post('/execute', authenticateToken, async (req, res) => {
  const { actionType, data } = req.body;

  if (!actionType || !data) {
    return res.status(400).json({ error: 'Action type and data are required' });
  }

  try {
    let result;

    switch (actionType) {
      case 'create_inventory': {
        const id = crypto.randomUUID();
        db.prepare(
          'INSERT INTO inventory (id, name, category, quantity, price, supplier, location, min_stock, max_stock, sync_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(id, data.name, data.category || 'General', parseInt(data.quantity) || 0, parseFloat(data.price) || 0, data.supplier || '', data.location || 'Main Store', parseInt(data.min_stock) || 10, parseInt(data.max_stock) || 100, 'pending');
        result = db.prepare('SELECT * FROM inventory WHERE id = ?').get(id);
        try { db.prepare('INSERT INTO sync_queue (table_name, record_id, action, data) VALUES (?, ?, ?, ?)').run('inventory', id, 'INSERT', JSON.stringify(result)); } catch(e) {}
        break;
      }
      case 'create_truck': {
        const id = crypto.randomUUID();
        db.prepare(
          'INSERT INTO trucks (id, plate_number, model, capacity, status, sync_status) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(id, data.plate_number, data.model || '', parseFloat(data.capacity) || 0, data.status || 'active', 'pending');
        result = db.prepare('SELECT * FROM trucks WHERE id = ?').get(id);
        try { db.prepare('INSERT INTO sync_queue (table_name, record_id, action, data) VALUES (?, ?, ?, ?)').run('trucks', id, 'INSERT', JSON.stringify(result)); } catch(e) {}
        break;
      }
      case 'create_trip': {
        const id = crypto.randomUUID();
        const qty = parseFloat(data.quantity) || 0;
        const price = parseFloat(data.unit_price) || 0;
        db.prepare(
          'INSERT INTO granite_deliveries (id, date, truck_id, driver_name, granite_type, quantity, unit_price, total_amount, client_name, status, sync_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(id, data.date || new Date().toISOString().split('T')[0], data.truck_id, data.driver_name, data.granite_type, qty, price, qty * price, data.client_name || '', 'delivered', 'pending');
        result = db.prepare('SELECT * FROM granite_deliveries WHERE id = ?').get(id);
        try { db.prepare('INSERT INTO sync_queue (table_name, record_id, action, data) VALUES (?, ?, ?, ?)').run('granite_deliveries', id, 'INSERT', JSON.stringify(result)); } catch(e) {}
        break;
      }
      case 'create_invoice': {
        const id = crypto.randomUUID();
        db.prepare(
          'INSERT INTO invoices (id, client_id, total_amount, paid_amount, due_date, status, notes, sync_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(id, data.client_id, parseFloat(data.total_amount) || 0, parseFloat(data.paid_amount) || 0, data.due_date || null, data.status || 'draft', data.notes || '', 'pending');
        result = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
        try { db.prepare('INSERT INTO sync_queue (table_name, record_id, action, data) VALUES (?, ?, ?, ?)').run('invoices', id, 'INSERT', JSON.stringify(result)); } catch(e) {}
        break;
      }
      case 'create_account': {
        const id = crypto.randomUUID();
        db.prepare(
          'INSERT INTO accounts (id, name, type, balance, sync_status) VALUES (?, ?, ?, ?, ?)'
        ).run(id, data.name, data.type, parseFloat(data.balance) || 0, 'pending');
        result = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id);
        try { db.prepare('INSERT INTO sync_queue (table_name, record_id, action, data) VALUES (?, ?, ?, ?)').run('accounts', id, 'INSERT', JSON.stringify(result)); } catch(e) {}
        break;
      }
      case 'create_transaction': {
        const id = crypto.randomUUID();
        const amt = parseFloat(data.amount) || 0;
        db.prepare(
          'INSERT INTO transactions (id, account_id, amount, type, transaction_date, description, reference, sync_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(id, data.account_id, amt, data.type, data.transaction_date || new Date().toISOString(), data.description || '', data.reference || '', 'pending');
        const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(data.account_id);
        if (account) {
          let change = (account.type === 'asset' || account.type === 'expense')
            ? (data.type === 'debit' ? amt : -amt)
            : (data.type === 'credit' ? amt : -amt);
          db.prepare('UPDATE accounts SET balance = balance + ?, sync_status = ? WHERE id = ?').run(change, 'pending', data.account_id);
        }
        result = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
        try { db.prepare('INSERT INTO sync_queue (table_name, record_id, action, data) VALUES (?, ?, ?, ?)').run('transactions', id, 'INSERT', JSON.stringify(result)); } catch(e) {}
        break;
      }
      default:
        return res.status(400).json({ error: `Unknown action type: ${actionType}` });
    }

    // Log this successful transaction/management event into Ikiké's reflection memories automatically!
    let memoryDesc = '';
    let memoryCategory = '';
    let accessLink = '';
    
    switch (actionType) {
      case 'create_inventory':
        memoryDesc = `Added spare part/inventory item "${data.name}" (Quantity: ${data.quantity}, Price: ${data.price} GNF) in location "${data.location || 'Main Store'}".`;
        memoryCategory = 'inventory_management';
        accessLink = 'http://localhost:5000/inventory';
        break;
      case 'create_truck':
        memoryDesc = `Registered fleet truck "${data.plate_number}" (Model: ${data.model || 'Unknown'}, Capacity: ${data.capacity || 0} tons).`;
        memoryCategory = 'fleet_management';
        accessLink = 'http://localhost:5000/fleet';
        break;
      case 'create_trip':
        memoryDesc = `Logged granite delivery trip for truck UUID "${data.truck_id}" by driver "${data.driver_name}" (Quantity: ${data.quantity}T, Client: "${data.client_name || 'N/A'}").`;
        memoryCategory = 'fleet_deliveries';
        accessLink = 'http://localhost:5000/fleet';
        break;
      case 'create_invoice':
        memoryDesc = `Created customer invoice for Client UUID "${data.client_id}" with total amount ${data.total_amount} GNF (Due: ${data.due_date || 'N/A'}).`;
        memoryCategory = 'accounting_receivables';
        accessLink = 'http://localhost:5000/accounting/invoices';
        break;
      case 'create_account':
        memoryDesc = `Opened new general ledger account "${data.name}" (Type: "${data.type}", Opening Balance: ${data.balance || 0} GNF).`;
        memoryCategory = 'accounting_chart';
        accessLink = 'http://localhost:5000/accounting/accounts';
        break;
      case 'create_transaction':
        memoryDesc = `Recorded ledger transaction of ${data.amount} GNF (${data.type}) for Account UUID "${data.account_id}" (Ref: "${data.reference || 'N/A'}", Description: "${data.description || 'N/A'}").`;
        memoryCategory = 'accounting_ledger';
        accessLink = 'http://localhost:5000/accounting/transactions';
        break;
    }

    if (memoryDesc) {
      try {
        fileMemory('Benna Stock Manager', memoryCategory, memoryDesc, accessLink);
      } catch (err) {
        console.error('[Ikiké] Failed to auto-file memory:', err);
      }
    }

    res.json({ success: true, result });
  } catch (error) {
    console.error('[Ikiké] Execute error:', error);
    res.status(500).json({ error: error.message || 'Failed to execute action' });
  }
});

export default router;
