import express from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { authenticateToken } from '../middleware/auth.js';
import db from '../database.js';
import * as crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const router = express.Router();

function parseActionBlockBackend(text) {
  const actionRegex = /```action([\s\S]*?)```/g;
  const match = actionRegex.exec(text);
  if (match && match[1]) {
    try {
      const actionObj = JSON.parse(match[1].trim());
      const cleanText = text.replace(actionRegex, '').trim();
      return {
        action: {
          ...actionObj,
          status: 'pending'
        },
        cleanText: cleanText || 'Action Proposed by Benna'
      };
    } catch (e) {
      console.error('Failed to parse action JSON in backend:', e);
    }
  }
  return { action: undefined, cleanText: text };
}

// Paths to reflection files in all integrated environments
const reflectionPaths = [
  'C:\\Users\\Mosaid\\.gemini\\antigravity\\scratch\\benna-collective\\identity\\reflection.json',
  'C:\\Users\\Mosaid\\.gemini\\antigravity\\scratch\\benna-collective\\benna-core\\identity\\reflection.json',
  'C:\\Users\\Mosaid\\.gemini\\antigravity\\scratch\\benna-collective\\benna-engine\\identity\\reflection.json'
];

// Helper to read strategic reflection from the active path
function getReflection() {
  for (const p of reflectionPaths) {
    if (fs.existsSync(p)) {
      try {
        const content = fs.readFileSync(p, 'utf8');
        return JSON.parse(content);
      } catch (e) {
        console.error('[Benna] Failed to read reflection at', p, e.message);
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
      console.log('[Benna] Updated reflection file at', p);
    } catch (e) {
      console.error('[Benna] Failed to write reflection at', p, e.message);
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
          name: "Benna Projects Manager",
          type: "ERP / Fleet & Stock Management",
          data_scope: "Inventory (spare parts, lubricants, tools), Trucks fleet, Granite Deliveries, Accounting (Invoices, Ledger)",
          location: "Local SQLite database (`database.sqlite`) / Synced Supabase Cloud",
          status: "active",
          online_access_endpoint: `http://localhost:${process.env.PORT || 5000}/api/agent`,
          last_sync: new Date().toISOString()
        },
        {
          name: "Benna Collective Platform",
          type: "Strategic Web Platform & Hub",
          data_scope: "DAO Governance, Strategic Vault, Investment portfolio, Waitlist applications, UI self-editing code",
          location: "Local storage (`benna_memory_v2`), server-side local JSON files",
          status: "active",
          online_access_endpoint: "http://localhost:8080/api/identity",
          last_sync: new Date().toISOString()
        },
        {
          name: "Benna Core & Engine",
          type: "Autonomous Agent Core & Execution Bridge",
          data_scope: "System prompt overrides, Chameleon-mode code manipulation, DeepSeek API proxy",
          location: "c:/Users/Mosaid/.gemini/antigravity/scratch/benna-collective",
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
    access_online: accessUrl || `http://localhost:${process.env.PORT || 5000}/api/agent?source=${encodeURIComponent(source)}`
  });

  // Keep memory logs capped at 50 to avoid bloating
  if (reflection.memories.logs.length > 50) {
    reflection.memories.logs.shift();
  }

  updateReflection(reflection);
}

// Benna's default identity — adapted from the Benna Collective engine
const BENNA_SYSTEM_PROMPT = `You are IKIKÉ, an elite strategic advisor built by the Benna Collective SARL.
You are embedded inside Benna Projects Manager — a business management application for a construction/mining company in Guinea.

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
const outstandingPayments = db.prepare("SELECT COUNT(*) as count, SUM(total_amount - paid_amount) as total FROM orders WHERE status IN ('pending','partial') AND is_archived = 0").get();

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
    console.error('[Benna] Context gathering failed:', e.message);
    return '\nLIVE SYSTEM STATE: Unable to fetch.\n';
  }
}

// Helper to process chat with Gemini
async function callGemini(geminiKey, fullSystem, history, message, files, image) {
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
  parts.push(fullSystem + historyText + '\n\nUSER: ' + (message || 'Analyze the uploaded documents and extract all data you can find.'));

  // Process uploaded files if any
  if (files && files.length > 0) {
    for (const file of files) {
      const { data, type } = file;
      const mimeTypeMatch = data.match(/^data:([^;]+);base64,/);
      const mimeType = mimeTypeMatch ? mimeTypeMatch[1] : (type || 'image/jpeg');
      const base64Data = data.includes(',') ? data.split(',')[1] : data;
      parts.push({
        inlineData: { data: base64Data, mimeType }
      });
    }
  } else if (image) {
    // Fallback for single image legacy support
    const mimeTypeMatch = image.match(/^data:(image\/\w+);base64,/);
    const mimeType = mimeTypeMatch ? mimeTypeMatch[1] : 'image/jpeg';
    const base64Data = image.includes(',') ? image.split(',')[1] : image;
    parts.push({
      inlineData: { data: base64Data, mimeType }
    });
  }

  console.log('[Benna] Processing message with Gemini...');
  const result = await model.generateContent(parts);
  const response = await result.response;
  return response.text();
}

// Helper to process chat with DeepSeek (text-only)
async function callDeepSeek(deepseekKey, fullSystem, history, message, files) {
  let modifiedMessage = message || 'Analyze this context and assist the user.';
  if (files && files.length > 0) {
    modifiedMessage += '\n\n[ATTACHED FILES]:';
    for (const file of files) {
      const { data, type, name } = file;
      const isText = type.startsWith('text/') || type === 'application/json' || type === 'text/csv';
      if (isText) {
        const base64Data = data.includes(',') ? data.split(',')[1] : data;
        const textContent = Buffer.from(base64Data, 'base64').toString('utf8');
        modifiedMessage += `\n- File Name: ${name} (Type: ${type})\nContent:\n\`\`\`\n${textContent}\n\`\`\``;
      } else {
        modifiedMessage += `\n- File Name: ${name} (Type: ${type}) - Binary content (could not be read directly by text-only model)`;
      }
    }
  }

  const messages = [{ role: 'system', content: fullSystem }];
  if (history && history.length > 0) {
    for (const msg of history.slice(-12)) {
      messages.push({ role: msg.role === 'user' ? 'user' : 'assistant', content: msg.content });
    }
  }
  messages.push({ role: 'user', content: modifiedMessage });

  console.log('[Benna] Processing message with DeepSeek...');
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
    throw new Error(`DeepSeek API returned status ${dsRes.status}: ${errText}`);
  }

  const dsData = await dsRes.json();
  return dsData.choices[0].message.content;
}

// Chat endpoint
router.post('/chat', authenticateToken, async (req, res) => {
  try {
    const { message, history, image, files } = req.body;

    if (!message && !image && (!files || files.length === 0)) {
      return res.status(400).json({ error: 'Message, image, or files is required' });
    }

    // Save user message to local SQLite
    const userMsgId = crypto.randomUUID();
    const metadataVal = JSON.stringify({ image, files });
    db.prepare(`
      INSERT INTO ai_insights (id, role, content, metadata)
      VALUES (?, 'user', ?, ?)
    `).run(userMsgId, message || '', metadataVal);

    let activeModel = 'gemini';
    let geminiKey = process.env.GEMINI_API_KEY;
    let deepseekKey = '';

    const settingsRecords = db.prepare("SELECT key, value FROM settings WHERE key IN ('gemini_api_key', 'deepseek_api_key', 'active_agent_model')").all();
    for (const s of settingsRecords) {
      if (s.key === 'gemini_api_key' && !geminiKey) geminiKey = s.value;
      if (s.key === 'deepseek_api_key') deepseekKey = s.value;
      if (s.key === 'active_agent_model') activeModel = s.value;
    }

    // Force fallback to Gemini if any binary files (PDF, images) are provided since DeepSeek Chat doesn't support them
    const hasBinaryFile = image || (files && files.some(f => {
      const type = f.type || '';
      return !type.startsWith('text/') && type !== 'application/json' && type !== 'text/csv';
    }));

    if (hasBinaryFile && activeModel === 'deepseek') {
      if (geminiKey) {
        console.log('[Benna] Binary files or images detected. Falling back to Gemini for multimodal vision/doc processing.');
        activeModel = 'gemini';
      }
    }

    const fallbackMessage = "I apologize, but the system is currently heavily used and we are expanding our ability to handle larger user rates as the first African business AI. Please try again later.";

    if (activeModel === 'deepseek' && !deepseekKey) {
      if (geminiKey) activeModel = 'gemini';
      else return res.json({ reply: fallbackMessage });
    } else if (activeModel === 'gemini' && !geminiKey) {
      if (deepseekKey && !hasBinaryFile) activeModel = 'deepseek';
      else return res.json({ reply: fallbackMessage });
    }

    // Load active reflection core prompts and unified memories
    const reflection = getReflection();
    
    // Combine base system prompt (with domain tables & action protocols) with strategic reflection override
    let fullSystem = BENNA_SYSTEM_PROMPT;
    if (reflection?.core_prompt_override) {
      fullSystem = `${BENNA_SYSTEM_PROMPT}\n\nHIGH-PRIORITY STRATEGIC DIRECTIVE OVERRIDE:\n${reflection.core_prompt_override}\n`;
    }
    
    let reflectionContext = '';
    if (reflection && reflection.memories) {
      reflectionContext = `\nBENNAé'S DYNAMIC STRATEGIC MEMORIES & ARCHIVED INTEGRATIONS:\n${JSON.stringify(reflection.memories, null, 2)}\n`;
    }

    const context = gatherContext() + reflectionContext;
    fullSystem += '\n' + context;

    let reply = '';
    let success = false;
    let errors = [];

    // Attempt the active model first, with dynamic automatic switching fallback if it fails
    if (activeModel === 'gemini') {
      try {
        if (!geminiKey) throw new Error('Gemini API key is missing');
        reply = await callGemini(geminiKey, fullSystem, history, message, files, image);
        success = true;
      } catch (err) {
        console.error('[Benna] Gemini failed, attempting automatic fallback to DeepSeek...', err.message);
        errors.push(`Gemini: ${err.message}`);
        if (deepseekKey && !hasBinaryFile) {
          try {
            reply = await callDeepSeek(deepseekKey, fullSystem, history, message, files);
            success = true;
            console.log('[Benna] Automatic fallback to DeepSeek succeeded.');
          } catch (dsErr) {
            console.error('[Benna] DeepSeek fallback also failed:', dsErr.message);
            errors.push(`DeepSeek Fallback: ${dsErr.message}`);
          }
        }
      }
    } else {
      try {
        if (!deepseekKey) throw new Error('DeepSeek API key is missing');
        reply = await callDeepSeek(deepseekKey, fullSystem, history, message, files);
        success = true;
      } catch (err) {
        console.error('[Benna] DeepSeek failed, attempting automatic fallback to Gemini...', err.message);
        errors.push(`DeepSeek: ${err.message}`);
        if (geminiKey) {
          try {
            reply = await callGemini(geminiKey, fullSystem, history, message, files, image);
            success = true;
            console.log('[Benna] Automatic fallback to Gemini succeeded.');
          } catch (gemErr) {
            console.error('[Benna] Gemini fallback also failed:', gemErr.message);
            errors.push(`Gemini Fallback: ${gemErr.message}`);
          }
        }
      }
    }

    if (!success) {
      console.error('[Benna] All available strategic neural engines failed:', errors);
      return res.json({ 
        reply: "I apologize, but both the Gemini and DeepSeek strategic neural engines are currently experiencing high demand. Please verify your internet connection, confirm your API keys in the settings tab, or try again in a few moments." 
      });
    }

    // Save agent reply to local SQLite
    const agentMsgId = crypto.randomUUID();
    const { action, cleanText } = parseActionBlockBackend(reply);
    const agentMetadataVal = JSON.stringify(action ? { action } : {});
    db.prepare(`
      INSERT INTO ai_insights (id, role, content, metadata)
      VALUES (?, 'agent', ?, ?)
    `).run(agentMsgId, cleanText, agentMetadataVal);

    return res.json({ reply, id: agentMsgId });
  } catch (error) {
    console.error('[Benna] General chat error:', error);
    res.status(500).json({ error: error.message || 'Internal strategic error' });
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
    res.json({ success: true, message: 'Memory successfully filed in Benna strategic reflection files.' });
  } catch (error) {
    console.error('[Benna] Sync memory error:', error);
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
  const { actionType, data, messageId } = req.body;

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

    // Log this successful transaction/management event into Benna's reflection memories automatically!
    let memoryDesc = '';
    let memoryCategory = '';
    let accessLink = '';
    
    const backendPort = process.env.PORT || 5000;
    switch (actionType) {
      case 'create_inventory':
        memoryDesc = `Added spare part/inventory item "${data.name}" (Quantity: ${data.quantity}, Price: ${data.price} GNF) in location "${data.location || 'Main Store'}".`;
        memoryCategory = 'inventory_management';
        accessLink = `http://localhost:${backendPort}/inventory`;
        break;
      case 'create_truck':
        memoryDesc = `Registered fleet truck "${data.plate_number}" (Model: ${data.model || 'Unknown'}, Capacity: ${data.capacity || 0} tons).`;
        memoryCategory = 'fleet_management';
        accessLink = `http://localhost:${backendPort}/fleet`;
        break;
      case 'create_trip':
        memoryDesc = `Logged granite delivery trip for truck UUID "${data.truck_id}" by driver "${data.driver_name}" (Quantity: ${data.quantity}T, Client: "${data.client_name || 'N/A'}").`;
        memoryCategory = 'fleet_deliveries';
        accessLink = `http://localhost:${backendPort}/fleet`;
        break;
      case 'create_invoice':
        memoryDesc = `Created customer invoice for Client UUID "${data.client_id}" with total amount ${data.total_amount} GNF (Due: ${data.due_date || 'N/A'}).`;
        memoryCategory = 'accounting_receivables';
        accessLink = `http://localhost:${backendPort}/accounting/invoices`;
        break;
      case 'create_account':
        memoryDesc = `Opened new general ledger account "${data.name}" (Type: "${data.type}", Opening Balance: ${data.balance || 0} GNF).`;
        memoryCategory = 'accounting_chart';
        accessLink = `http://localhost:${backendPort}/accounting/accounts`;
        break;
      case 'create_transaction':
        memoryDesc = `Recorded ledger transaction of ${data.amount} GNF (${data.type}) for Account UUID "${data.account_id}" (Ref: "${data.reference || 'N/A'}", Description: "${data.description || 'N/A'}").`;
        memoryCategory = 'accounting_ledger';
        accessLink = `http://localhost:${backendPort}/accounting/transactions`;
        break;
    }

    if (memoryDesc) {
      try {
        fileMemory('Benna Projects Manager', memoryCategory, memoryDesc, accessLink);
      } catch (err) {
        console.error('[Benna] Failed to auto-file memory:', err);
      }
    }

    if (messageId) {
      try {
        const row = db.prepare('SELECT metadata FROM ai_insights WHERE id = ?').get(messageId);
        if (row && row.metadata) {
          const meta = JSON.parse(row.metadata);
          if (meta.action) {
            meta.action.status = 'approved';
            db.prepare('UPDATE ai_insights SET metadata = ? WHERE id = ?').run(JSON.stringify(meta), messageId);
          }
        }
      } catch (e) {
        console.error('[Benna] Failed to update action status:', e);
      }
    }

    res.json({ success: true, result });
  } catch (error) {
    console.error('[Benna] Execute error:', error);
    res.status(500).json({ error: error.message || 'Failed to execute action' });
  }
});

// Reject an action and update status in database
router.post('/reject-action', authenticateToken, async (req, res) => {
  const { messageId } = req.body;
  if (!messageId) {
    return res.status(400).json({ error: 'messageId is required' });
  }
  try {
    const row = db.prepare('SELECT metadata FROM ai_insights WHERE id = ?').get(messageId);
    if (row && row.metadata) {
      const meta = JSON.parse(row.metadata);
      if (meta.action) {
        meta.action.status = 'rejected';
        db.prepare('UPDATE ai_insights SET metadata = ? WHERE id = ?').run(JSON.stringify(meta), messageId);
      }
    }
    res.json({ success: true });
  } catch (error) {
    console.error('[Benna] Reject action error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Fetch conversation history
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const history = db.prepare('SELECT * FROM ai_insights ORDER BY timestamp ASC').all();
    const formatted = history.map(h => {
      let metadata = {};
      try { if (h.metadata) metadata = JSON.parse(h.metadata); } catch(e) {}
      return {
        id: h.id,
        role: h.role,
        content: h.content,
        image: metadata.image,
        files: metadata.files,
        action: metadata.action,
        timestamp: h.timestamp
      };
    });
    res.json(formatted);
  } catch (error) {
    console.error('[Benna] Get history error:', error);
    res.status(500).json({ error: 'Failed to fetch agent history' });
  }
});

// Clear conversation history based on interval
router.post('/clear', authenticateToken, async (req, res) => {
  const { interval } = req.body;
  try {
    let deletedCount = 0;
    if (interval === 'all') {
      const info = db.prepare('DELETE FROM ai_insights').run();
      deletedCount = info.changes;
    } else if (interval === '24h') {
      const info = db.prepare("DELETE FROM ai_insights WHERE timestamp < datetime('now', '-1 day')").run();
      deletedCount = info.changes;
    } else if (interval === '7d') {
      const info = db.prepare("DELETE FROM ai_insights WHERE timestamp < datetime('now', '-7 days')").run();
      deletedCount = info.changes;
    } else if (interval === '30d') {
      const info = db.prepare("DELETE FROM ai_insights WHERE timestamp < datetime('now', '-30 days')").run();
      deletedCount = info.changes;
    }
    res.json({ success: true, deletedCount });
  } catch (error) {
    console.error('[Benna] Clear history error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Post performance chat query
router.post('/performance-chat', authenticateToken, async (req, res) => {
  try {
    const { message, employeeId: inputEmployeeId } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    let employeeId = inputEmployeeId;
    let employeeName = 'Employee';
    
    // Resolve employee id if not admin
    if (req.user.role !== 'admin') {
      const emp = db.prepare('SELECT id, name FROM employees WHERE email = ?').get(req.user.email);
      if (!emp) {
        return res.status(403).json({ error: 'Access denied: No employee profile linked to your user account' });
      }
      employeeId = emp.id;
      employeeName = emp.name;
    } else if (employeeId) {
      const emp = db.prepare('SELECT name FROM employees WHERE id = ?').get(employeeId);
      if (emp) {
        employeeName = emp.name;
      }
    } else {
      employeeName = 'All Employees';
    }

    // Load settings
    let activeModel = 'gemini';
    let geminiKey = process.env.GEMINI_API_KEY;
    let deepseekKey = '';

    const settingsRecords = db.prepare("SELECT key, value FROM settings WHERE key IN ('gemini_api_key', 'deepseek_api_key', 'active_agent_model', 'global_ai_access')").all();
    let globalAiAccess = false;
    for (const s of settingsRecords) {
      if (s.key === 'gemini_api_key' && !geminiKey) geminiKey = s.value;
      if (s.key === 'deepseek_api_key') deepseekKey = s.value;
      if (s.key === 'active_agent_model') activeModel = s.value;
      if (s.key === 'global_ai_access') globalAiAccess = s.value === 'true';
    }

    const fallbackMessage = "The strategic performance evaluation engine is currently offline. Please try again shortly.";
    if (activeModel === 'deepseek' && !deepseekKey) {
      if (geminiKey) activeModel = 'gemini';
      else return res.json({ reply: fallbackMessage });
    } else if (activeModel === 'gemini' && !geminiKey) {
      if (deepseekKey) activeModel = 'deepseek';
      else return res.json({ reply: fallbackMessage });
    }

    // Determine performance context
    let performanceContext = '';
    if (req.user.role === 'admin' && globalAiAccess) {
      const allPerf = db.prepare(`
        SELECT p.*, e.name as employee_name, e.department, e.role
        FROM employee_performance p
        JOIN employees e ON p.employee_id = e.id
        WHERE e.is_archived = 0
      `).all();
      performanceContext = `GLOBAL PERFORMANCE CONTEXT (All Employees):\n${JSON.stringify(allPerf, null, 2)}\n`;
    } else if (employeeId) {
      const empPerf = db.prepare(`
        SELECT p.*, e.name as employee_name, e.department, e.role
        FROM employee_performance p
        JOIN employees e ON p.employee_id = e.id
        WHERE p.employee_id = ? AND e.is_archived = 0
      `).all(employeeId);
      performanceContext = `SILOED PERFORMANCE CONTEXT (Employee: ${employeeName}):\n${JSON.stringify(empPerf, null, 2)}\n`;
    } else {
      return res.status(400).json({ error: 'employeeId is required for this action' });
    }

    // Load or create siloed user memory JSON
    const userMemoryDir = path.join(__dirname, '..', 'user_memory');
    if (!fs.existsSync(userMemoryDir)) {
      fs.mkdirSync(userMemoryDir, { recursive: true });
    }

    const memoryFile = path.join(userMemoryDir, `${employeeId || 'admin_global'}.json`);
    let memoryData = { history: [], recommendations: [] };
    if (fs.existsSync(memoryFile)) {
      try {
        memoryData = JSON.parse(fs.readFileSync(memoryFile, 'utf8'));
      } catch (e) {
        console.error('[Benna] Failed to parse memory file:', e);
      }
    }

    // Compile system prompt
    const performanceSystemPrompt = `You are IKIKÉ, an elite performance evaluation and coaching AI expert.
Your goal is to help employees understand their performance metrics, provide actionable growth advice, and suggest concrete steps to improve.
You communicate directly and clinically, but remain constructive and focused on operational excellence.

RULES:
1. You have access to performance data and a historical memory file for the user.
2. Keep your recommendations highly personalized, data-driven, and focused on Guinean operational compliance and corporate standards.
3. Suggest training resources, time-management tips, or direct peer-feedback strategies.
4. If the user is an admin and global AI access is enabled, you can provide cross-employee comparisons and company-wide trends.

CONTEXT DATA:
${performanceContext}
`;

    // Add user message to history
    memoryData.history = memoryData.history || [];
    memoryData.history.push({ role: 'user', content: message, timestamp: new Date().toISOString() });

    // Truncate history to last 10 messages for prompt to avoid token bloat
    const truncatedHistory = memoryData.history.slice(-10);

    let replyText = '';
    if (activeModel === 'gemini') {
      replyText = await callGemini(geminiKey, performanceSystemPrompt, truncatedHistory, message, null, null);
    } else {
      replyText = await callDeepSeek(deepseekKey, performanceSystemPrompt, truncatedHistory, message, null);
    }

    // Add AI reply to history
    memoryData.history.push({ role: 'assistant', content: replyText, timestamp: new Date().toISOString() });

    // Store a recommendation entry
    memoryData.recommendations = memoryData.recommendations || [];
    memoryData.recommendations.push({
      date: new Date().toISOString(),
      message,
      aiSuggestion: replyText
    });

    // Write back to user memory file
    fs.writeFileSync(memoryFile, JSON.stringify(memoryData, null, 2), 'utf8');

    // Also write user chat interaction to database ai_insights for general audit
    const aiInsightId = crypto.randomUUID();
    db.prepare(`
      INSERT INTO ai_insights (id, role, content, metadata)
      VALUES (?, 'agent', ?, ?)
    `).run(aiInsightId, replyText, JSON.stringify({ employeeId, type: 'performance' }));

    res.json({ reply: replyText, history: memoryData.history });
  } catch (error) {
    console.error('[Benna] Performance chat error:', error);
    res.status(500).json({ error: error.message || 'Failed to process performance conversation' });
  }
});

// Get performance chat history for a specific employee
router.get('/performance-chat/history', authenticateToken, (req, res) => {
  try {
    let employeeId = req.query.employeeId;
    if (req.user.role !== 'admin') {
      const emp = db.prepare('SELECT id FROM employees WHERE email = ?').get(req.user.email);
      if (!emp) {
        return res.status(403).json({ error: 'Access denied' });
      }
      employeeId = emp.id;
    }
    
    if (!employeeId) {
      return res.status(400).json({ error: 'employeeId is required' });
    }

    const userMemoryDir = path.join(__dirname, '..', 'user_memory');
    const memoryFile = path.join(userMemoryDir, `${employeeId}.json`);
    
    if (fs.existsSync(memoryFile)) {
      try {
        const memoryData = JSON.parse(fs.readFileSync(memoryFile, 'utf8'));
        return res.json(memoryData.history || []);
      } catch (e) {
        return res.json([]);
      }
    }
    res.json([]);
  } catch (error) {
    console.error('[Benna] Get performance history error:', error);
    res.status(500).json({ error: 'Failed to fetch performance history' });
  }
});

export default router;
