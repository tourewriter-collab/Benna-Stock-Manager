import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import db from '../database.js';
import crypto from 'crypto';
import { GoogleGenerativeAI } from '@google/generative-ai';
import ExcelJS from 'exceljs';

const router = express.Router();

// Helper to run AI screening with Gemini
async function callGeminiHr(geminiKey, prompt, systemPrompt) {
  const genAI = new GoogleGenerativeAI(geminiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const parts = [
    systemPrompt + "\n\n" + prompt
  ];

  console.log('[HR AI] Processing screening with Gemini...');
  const result = await model.generateContent(parts);
  const response = await result.response;
  return response.text();
}

// Helper to run AI screening with DeepSeek
async function callDeepSeekHr(deepseekKey, prompt, systemPrompt) {
  console.log('[HR AI] Processing screening with DeepSeek...');
  const dsRes = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${deepseekKey}`
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3
    })
  });

  if (!dsRes.ok) {
    const errText = await dsRes.text();
    throw new Error(`DeepSeek HR API returned status ${dsRes.status}: ${errText}`);
  }

  const dsData = await dsRes.json();
  return dsData.choices[0].message.content;
}

// ── STAFF / EMPLOYEES ENDPOINTS ──

// Get all active employees
router.get('/employees', authenticateToken, (req, res) => {
  try {
    const employees = db.prepare('SELECT * FROM employees WHERE is_archived = 0 ORDER BY name ASC').all();
    res.json(employees);
  } catch (error) {
    console.error('[HR] Get employees error:', error);
    res.status(500).json({ error: 'Failed to fetch employees' });
  }
});

// ── EXCEL BULK IMPORT EMPLOYEES ──
router.post('/employees/import', authenticateToken, async (req, res) => {
  try {
    const { fileBase64 } = req.body;
    if (!fileBase64) {
      return res.status(400).json({ error: 'No file data provided.' });
    }

    // Decode the base64 Excel file into a Buffer
    const buffer = Buffer.from(fileBase64, 'base64');

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      return res.status(400).json({ error: 'The Excel file appears to be empty or has no sheets.' });
    }

    // Build a flexible header map from row 1
    // Supports English and French column headers (case-insensitive)
    const COLUMN_ALIASES = {
      name:               ['name', 'nom', 'full name', 'nom complet', 'employee name', 'nom de l\'employé'],
      role:               ['role', 'poste', 'job title', 'title', 'titre', 'function', 'fonction'],
      department:         ['department', 'département', 'dept', 'service', 'division'],
      email:              ['email', 'e-mail', 'mail', 'courriel'],
      phone:              ['phone', 'téléphone', 'telephone', 'tel', 'mobile', 'portable'],
      salary:             ['salary', 'salaire', 'wage', 'pay', 'rémunération', 'remuneration'],
      hire_date:          ['hire date', 'hire_date', 'start date', 'date d\'embauche', 'date embauche', 'joining date'],
      status:             ['status', 'statut', 'état', 'etat'],
      performance_notes:  ['notes', 'performance notes', 'notes de performance', 'comments', 'commentaires'],
    };

    // Resolve the header row to a column index map
    const headerRow = worksheet.getRow(1);
    const colMap = {}; // field -> 1-based col index
    headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const headerText = String(cell.value || '').trim().toLowerCase();
      for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
        if (aliases.includes(headerText) && !colMap[field]) {
          colMap[field] = colNumber;
        }
      }
    });

    if (!colMap.name) {
      return res.status(400).json({
        error: 'Could not find a "Name" / "Nom" column in the first row. Please check your Excel file against the template.'
      });
    }

    const today = new Date().toISOString().split('T')[0];
    let imported = 0;
    let skipped  = 0;
    const errors = [];

    const insertStmt = db.prepare(`
      INSERT INTO employees (
        id, name, email, phone, role, department, salary, hire_date, status, performance_notes, resume_text, is_archived, sync_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', 0, 'pending')
    `);

    const syncQueueStmt = db.prepare(`
      INSERT INTO sync_queue (table_name, record_id, action, data)
      VALUES ('employees', ?, 'INSERT', ?)
    `);

    const auditStmt = db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, table_name, record_id, new_values, sync_status)
      VALUES (?, ?, ?, ?, ?, ?, 'pending')
    `);

    const getValue = (row, field) => {
      if (!colMap[field]) return null;
      const val = row.getCell(colMap[field]).value;
      if (val === null || val === undefined) return null;
      // Handle rich text objects from Excel
      if (typeof val === 'object' && val.richText) {
        return val.richText.map(r => r.text).join('').trim() || null;
      }
      return String(val).trim() || null;
    };

    db.transaction(() => {
      // Start from row 2 (skip header)
      worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        if (rowNumber === 1) return; // skip header

        try {
          const name = getValue(row, 'name');
          if (!name) { skipped++; return; } // Skip blank name rows

          const role       = getValue(row, 'role')       || 'N/A';
          const department = getValue(row, 'department') || 'N/A';
          const email      = getValue(row, 'email');
          const phone      = getValue(row, 'phone');
          const notes      = getValue(row, 'performance_notes');
          const statusVal  = getValue(row, 'status') || 'active';

          // Parse salary — strip currency symbols
          let salary = 0;
          const rawSalary = getValue(row, 'salary');
          if (rawSalary) {
            const cleaned = rawSalary.replace(/[^0-9.,-]/g, '').replace(',', '.');
            salary = parseFloat(cleaned) || 0;
          }

          // Parse hire date — Excel may return a JS Date object or a string
          let hireDate = today;
          const rawDate = colMap.hire_date ? row.getCell(colMap.hire_date).value : null;
          if (rawDate instanceof Date && !isNaN(rawDate)) {
            hireDate = rawDate.toISOString().split('T')[0];
          } else if (rawDate) {
            const parsed = new Date(String(rawDate));
            if (!isNaN(parsed)) hireDate = parsed.toISOString().split('T')[0];
          }

          const id = crypto.randomUUID();
          insertStmt.run(id, name, email, phone, role, department, salary, hireDate, statusVal, notes || '');

          syncQueueStmt.run(id, JSON.stringify({
            id, name, email, phone, role, department, salary, hire_date: hireDate, status: statusVal, performance_notes: notes || '', resume_text: '', device_enroll_id: null
          }));

          auditStmt.run(
            crypto.randomUUID(), req.user.id, 'INSERT', 'employees', id,
            JSON.stringify({ name, role, department, source: 'excel_import' })
          );

          imported++;
        } catch (rowErr) {
          errors.push(`Row ${rowNumber}: ${rowErr.message}`);
          skipped++;
        }
      });
    })();

    return res.json({
      success: true,
      imported,
      skipped,
      errors: errors.slice(0, 10), // cap to 10 error messages
    });

  } catch (error) {
    console.error('[HR] Excel import error:', error);
    res.status(500).json({ error: 'Failed to process Excel file: ' + error.message });
  }
});



// Add new employee
router.post('/employees', authenticateToken, (req, res) => {
  try {
    const { name, email, phone, role, department, salary, hire_date, status, performance_notes, resume_text } = req.body;

    if (!name || !role || !department || !hire_date) {
      return res.status(400).json({ error: 'Name, role, department, and hire date are required.' });
    }

    const id = crypto.randomUUID();
    const hireDateStr = hire_date || new Date().toISOString().split('T')[0];

    db.prepare(`
      INSERT INTO employees (
        id, name, email, phone, role, department, salary, hire_date, status, performance_notes, resume_text, is_archived, sync_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'pending')
    `).run(
      id, name, email || null, phone || null, role, department, salary || 0, hireDateStr, status || 'active', performance_notes || '', resume_text || '',
    );

    db.prepare(`
      INSERT INTO sync_queue (table_name, record_id, action, data)
      VALUES ('employees', ?, 'INSERT', ?)
    `).run(id, JSON.stringify({
      id, name, email: email || null, phone: phone || null, role, department, salary: salary || 0, hire_date: hireDateStr, status: status || 'active', performance_notes: performance_notes || '', resume_text: resume_text || '', device_enroll_id: null
    }));

    // File strategic audit log
    const auditId = crypto.randomUUID();
    db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, table_name, record_id, new_values, sync_status)
      VALUES (?, ?, ?, ?, ?, ?, 'pending')
    `).run(auditId, req.user.id, 'INSERT', 'employees', id, JSON.stringify({ name, role, department }));

    res.status(201).json({ success: true, id });
  } catch (error) {
    console.error('[HR] Create employee error:', error);
    res.status(500).json({ error: 'Failed to create employee record' });
  }
});

// Edit employee details
router.put('/employees/:id', authenticateToken, (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, phone, role, department, salary, hire_date, status, performance_notes, resume_text } = req.body;

    const existing = db.prepare('SELECT * FROM employees WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    db.prepare(`
      UPDATE employees SET
        name = ?, email = ?, phone = ?, role = ?, department = ?, salary = ?, hire_date = ?, status = ?, performance_notes = ?, resume_text = ?, sync_status = 'pending', sync_updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      name || existing.name,
      email !== undefined ? email : existing.email,
      phone !== undefined ? phone : existing.phone,
      role || existing.role,
      department || existing.department,
      salary !== undefined ? salary : existing.salary,
      hire_date || existing.hire_date,
      status || existing.status,
      performance_notes !== undefined ? performance_notes : existing.performance_notes,
      resume_text !== undefined ? resume_text : existing.resume_text,
      id
    );

    const updatedEmployee = db.prepare('SELECT * FROM employees WHERE id = ?').get(id);
    db.prepare(`
      INSERT INTO sync_queue (table_name, record_id, action, data)
      VALUES ('employees', ?, 'UPDATE', ?)
    `).run(id, JSON.stringify(updatedEmployee));

    // File audit log
    const auditId = crypto.randomUUID();
    db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, table_name, record_id, old_values, new_values, sync_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
    `).run(auditId, req.user.id, 'UPDATE', 'employees', id, JSON.stringify(existing), JSON.stringify(req.body));

    res.json({ success: true });
  } catch (error) {
    console.error('[HR] Update employee error:', error);
    res.status(500).json({ error: 'Failed to update employee record' });
  }
});

// Archive employee profile
router.delete('/employees/:id', authenticateToken, (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM employees WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    db.prepare("UPDATE employees SET is_archived = 1, sync_status = 'pending', sync_updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);

    const archivedEmployee = db.prepare('SELECT * FROM employees WHERE id = ?').get(id);
    db.prepare(`
      INSERT INTO sync_queue (table_name, record_id, action, data)
      VALUES ('employees', ?, 'UPDATE', ?)
    `).run(id, JSON.stringify(archivedEmployee));

    // File audit log
    const auditId = crypto.randomUUID();
    db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, table_name, record_id, sync_status)
      VALUES (?, ?, ?, ?, ?, 'pending')
    `).run(auditId, req.user.id, 'DELETE', 'employees', id);

    res.json({ success: true });
  } catch (error) {
    console.error('[HR] Archive employee error:', error);
    res.status(500).json({ error: 'Failed to archive employee record' });
  }
});


// ── JOB APPLICATIONS / APPLICANTS ENDPOINTS ──

// Get applicants list
router.get('/applicants', authenticateToken, (req, res) => {
  try {
    const applicants = db.prepare('SELECT * FROM applicants WHERE is_archived = 0 ORDER BY applied_date DESC').all();
    res.json(applicants);
  } catch (error) {
    console.error('[HR] Get applicants error:', error);
    res.status(500).json({ error: 'Failed to fetch applicants' });
  }
});

// Submit job application
router.post('/applicants', authenticateToken, (req, res) => {
  try {
    const { name, email, phone, role_applied, experience_years, skills, resume_text } = req.body;

    if (!name || !email || !role_applied) {
      return res.status(400).json({ error: 'Name, email, and role applied are required.' });
    }

    const id = crypto.randomUUID();
    db.prepare(`
      INSERT INTO applicants (
        id, name, email, phone, role_applied, experience_years, skills, resume_text, ai_score, ai_assessment, status, applied_date, is_archived, sync_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, '', 'pending', CURRENT_TIMESTAMP, 0, 'pending')
    `).run(
      id, name, email, phone || null, role_applied, experience_years || 0, skills || '', resume_text || ''
    );

    db.prepare(`
      INSERT INTO sync_queue (table_name, record_id, action, data)
      VALUES ('applicants', ?, 'INSERT', ?)
    `).run(id, JSON.stringify({
      id, name, email, phone: phone || null, role_applied, experience_years: experience_years || 0, skills: skills || '', resume_text: resume_text || '', ai_score: 0, ai_assessment: '', status: 'pending', applied_date: new Date().toISOString()
    }));

    res.status(201).json({ success: true, id });
  } catch (error) {
    console.error('[HR] Create applicant error:', error);
    res.status(500).json({ error: 'Failed to submit applicant record' });
  }
});

// Transition applicant status
router.put('/applicants/:id', authenticateToken, (req, res) => {
  try {
    const { id } = req.params;
    const { status, ai_score, ai_assessment } = req.body;

    const existing = db.prepare('SELECT * FROM applicants WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Applicant not found' });
    }

    db.prepare(`
      UPDATE applicants SET
        status = ?,
        ai_score = ?,
        ai_assessment = ?,
        sync_status = 'pending',
        sync_updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      status || existing.status,
      ai_score !== undefined ? ai_score : existing.ai_score,
      ai_assessment !== undefined ? ai_assessment : existing.ai_assessment,
      id
    );

    const updatedApplicant = db.prepare('SELECT * FROM applicants WHERE id = ?').get(id);
    db.prepare(`
      INSERT INTO sync_queue (table_name, record_id, action, data)
      VALUES ('applicants', ?, 'UPDATE', ?)
    `).run(id, JSON.stringify(updatedApplicant));

    res.json({ success: true });
  } catch (error) {
    console.error('[HR] Update applicant error:', error);
    res.status(500).json({ error: 'Failed to update applicant record' });
  }
});

// Delete or reject applicant
router.delete('/applicants/:id', authenticateToken, (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM applicants WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Applicant not found' });
    }

    db.prepare("UPDATE applicants SET is_archived = 1, sync_status = 'pending', sync_updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);

    const archivedApplicant = db.prepare('SELECT * FROM applicants WHERE id = ?').get(id);
    db.prepare(`
      INSERT INTO sync_queue (table_name, record_id, action, data)
      VALUES ('applicants', ?, 'UPDATE', ?)
    `).run(id, JSON.stringify(archivedApplicant));
    res.json({ success: true });
  } catch (error) {
    console.error('[HR] Archive applicant error:', error);
    res.status(500).json({ error: 'Failed to archive applicant record' });
  }
});


// ── IKIKÉ STRATEGIC AI SCREENING EVALUATOR ──

router.post('/assess', authenticateToken, async (req, res) => {
  try {
    const { jobDescription } = req.body;

    if (!jobDescription || !jobDescription.trim()) {
      return res.status(400).json({ error: 'Job description is required for AI screening.' });
    }

    // Fetch all pending or reviewed applicants
    const candidates = db.prepare("SELECT * FROM applicants WHERE status IN ('pending', 'reviewed') AND is_archived = 0").all();

    if (candidates.length === 0) {
      return res.json({ success: true, message: 'No pending or reviewed candidates available for screening.', results: [] });
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

    const fallbackMessage = "I apologize, but both the Gemini and DeepSeek strategic neural engines are currently experiencing high demand. Please verify your settings or try again in a few moments.";

    if (activeModel === 'deepseek' && !deepseekKey) {
      if (geminiKey) activeModel = 'gemini';
      else return res.status(503).json({ error: fallbackMessage });
    } else if (activeModel === 'gemini' && !geminiKey) {
      if (deepseekKey) activeModel = 'deepseek';
      else return res.status(503).json({ error: fallbackMessage });
    }

    const systemPrompt = `You are IKIKÉ, an elite HR and recruitment AI expert.
Your job is to assess candidate resumes against the provided Job Description.
For each candidate:
1. Evaluate their fit on a scale of 0 to 100 based on their experience years, skills, and resume details.
2. Provide a 2-sentence highly clinical, direct, and data-driven suitability summary. Focus strictly on their competence, OHADA compliance if applicable, and alignment with operational needs.

You MUST respond strictly in valid JSON format representing an array of candidate assessments.
Each object in the array must contain:
- "id": The candidate's UUID string (provided in the input).
- "score": A numeric integer from 0 to 100.
- "assessment": Your professional 2-sentence clinical fit report.

Output format (MUST be raw JSON, no markdown wrapper or extra words):
[
  {
    "id": "applicant-uuid-here",
    "score": 85,
    "assessment": "Detailed 2-sentence assessment here."
  }
]`;

    let prompt = `JOB DESCRIPTION:\n${jobDescription}\n\nCANDIDATES TO ASSESS:\n`;
    for (const candidate of candidates) {
      prompt += `\nID: ${candidate.id}\nName: ${candidate.name}\nRole Applied: ${candidate.role_applied}\nExperience: ${candidate.experience_years} years\nSkills: ${candidate.skills}\nResume / Background details:\n${candidate.resume_text || 'No resume details provided.'}\n---\n`;
    }

    let responseText = '';
    let success = false;
    let errors = [];

    // Attempt active model with dynamic fallback switching
    if (activeModel === 'gemini') {
      try {
        responseText = await callGeminiHr(geminiKey, prompt, systemPrompt);
        success = true;
      } catch (err) {
        console.error('[HR AI] Gemini failed, attempting fallback to DeepSeek...', err.message);
        errors.push(`Gemini: ${err.message}`);
        if (deepseekKey) {
          try {
            responseText = await callDeepSeekHr(deepseekKey, prompt, systemPrompt);
            success = true;
          } catch (dsErr) {
            console.error('[HR AI] DeepSeek fallback failed:', dsErr.message);
            errors.push(`DeepSeek Fallback: ${dsErr.message}`);
          }
        }
      }
    } else {
      try {
        responseText = await callDeepSeekHr(deepseekKey, prompt, systemPrompt);
        success = true;
      } catch (err) {
        console.error('[HR AI] DeepSeek failed, attempting fallback to Gemini...', err.message);
        errors.push(`DeepSeek: ${err.message}`);
        if (geminiKey) {
          try {
            responseText = await callGeminiHr(geminiKey, prompt, systemPrompt);
            success = true;
          } catch (gemErr) {
            console.error('[HR AI] Gemini fallback failed:', gemErr.message);
            errors.push(`Gemini Fallback: ${gemErr.message}`);
          }
        }
      }
    }

    if (!success) {
      console.error('[HR AI] All screening neural engines failed:', errors);
      return res.status(503).json({ error: fallbackMessage });
    }

    // Clean JSON response (strip markdown wrappers if any)
    let cleanJson = responseText.trim();
    if (cleanJson.startsWith('```json')) {
      cleanJson = cleanJson.replace(/^```json/, '').replace(/```$/, '').trim();
    } else if (cleanJson.startsWith('```')) {
      cleanJson = cleanJson.replace(/^```/, '').replace(/```$/, '').trim();
    }

    let assessments = [];
    try {
      assessments = JSON.parse(cleanJson);
    } catch (parseError) {
      console.error('[HR AI] Failed to parse AI JSON response:', cleanJson, parseError);
      return res.status(500).json({ error: 'The neural engine produced an unparsable response format. Please try again.' });
    }

    if (!Array.isArray(assessments)) {
      return res.status(500).json({ error: 'Strategic assessment output was not in correct array format.' });
    }

    // Persist scores and assessments back to database in a single transaction
    const updateStmt = db.prepare(`
      UPDATE applicants SET
        ai_score = ?,
        ai_assessment = ?,
        status = 'reviewed',
        sync_status = 'pending',
        sync_updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    const syncQueueStmt = db.prepare(`
      INSERT INTO sync_queue (table_name, record_id, action, data)
      VALUES ('applicants', ?, 'UPDATE', ?)
    `);

    db.transaction(() => {
      for (const item of assessments) {
        if (item.id && item.score !== undefined && item.assessment) {
          updateStmt.run(Number(item.score), item.assessment, item.id);
          const updated = db.prepare('SELECT * FROM applicants WHERE id = ?').get(item.id);
          if (updated) {
            syncQueueStmt.run(item.id, JSON.stringify(updated));
          }
        }
      }
    })();

    // Fetch updated candidates list to return to frontend
    const updatedCandidates = db.prepare("SELECT * FROM applicants WHERE status = 'reviewed' AND is_archived = 0 ORDER BY ai_score DESC").all();

    // Create strategic strategy notification for the manager
    try {
      const topStaff = updatedCandidates.find(c => c.ai_score >= 80);
      if (topStaff) {
        const notifId = crypto.randomUUID();
        const msgText = `Ikiké Profile Screening complete for Job: "${jobDescription.substring(0, 30)}...". Top match: ${topStaff.name} with strategic fit score of ${topStaff.ai_score}%.`;
        db.prepare("INSERT INTO notifications (id, message, type, created_at, is_read, sync_status) VALUES (?, ?, 'strategy', CURRENT_TIMESTAMP, 0, 'pending')")
          .run(notifId, msgText);
      }
    } catch (e) {
      console.error('[HR AI] Failed to file strategic notification:', e);
    }

    res.json({ success: true, results: updatedCandidates });

  } catch (error) {
    console.error('[HR AI] Screening service error:', error);
    res.status(500).json({ error: error.message || 'Internal strategic recruitment error' });
  }
});

// ── SMART ATTENDANCE ENDPOINTS ──

// Get all attendance logs
router.get('/attendance', authenticateToken, (req, res) => {
  try {
    const logs = db.prepare(`
      SELECT a.*, e.name as employee_name, e.role as employee_role, e.department as employee_department
      FROM attendance a
      LEFT JOIN employees e ON a.employee_id = e.id
      WHERE a.is_archived = 0
      ORDER BY a.timestamp DESC
    `).all();
    res.json(logs);
  } catch (error) {
    console.error('[HR] Get attendance error:', error);
    res.status(500).json({ error: 'Failed to fetch attendance logs' });
  }
});

// Real-time online device pushes (ADMS/Cloud Push)
router.post('/attendance/log', (req, res) => {
  try {
    const { enroll_id, timestamp, verify_mode, state } = req.body;
    
    if (!enroll_id || !timestamp) {
      return res.status(400).json({ error: 'enroll_id and timestamp are required' });
    }
    
    // Map verify_mode (1 = fingerprint, 15 = face, etc.)
    let method = 'unknown';
    const modeStr = String(verify_mode).trim();
    if (modeStr === '1') method = 'fingerprint';
    else if (modeStr === '15') method = 'face';
    else if (modeStr === '4') method = 'card';
    else if (modeStr === '3') method = 'password';

    // Map state (0 = in, 1 = out)
    let direction = 'unknown';
    const stateStr = String(state).trim();
    if (stateStr === '0') direction = 'in';
    else if (stateStr === '1') direction = 'out';
    
    // Find employee by device_enroll_id
    const employee = db.prepare('SELECT id FROM employees WHERE device_enroll_id = ?').get(String(enroll_id).trim());
    const employeeId = employee ? employee.id : null;
    
    const id = crypto.randomUUID();
    db.prepare(`
      INSERT INTO attendance (
        id, employee_id, device_enroll_id, timestamp, verification_method, direction, source, sync_status
      ) VALUES (?, ?, ?, ?, ?, ?, 'online_push', 'pending')
    `).run(id, employeeId, String(enroll_id).trim(), timestamp, method, direction);

    db.prepare(`
      INSERT INTO sync_queue (table_name, record_id, action, data)
      VALUES ('attendance', ?, 'INSERT', ?)
    `).run(id, JSON.stringify({
      id, employee_id: employeeId, device_enroll_id: String(enroll_id).trim(), timestamp, verification_method: method, direction, source: 'online_push'
    }));
    
    res.status(201).json({ success: true, id });
  } catch (error) {
    console.error('[HR] Log attendance error:', error);
    res.status(500).json({ error: 'Failed to log attendance' });
  }
});

// Import USB logs manually
router.post('/attendance/upload', authenticateToken, (req, res) => {
  try {
    const { fileContent } = req.body;
    if (!fileContent) {
      return res.status(400).json({ error: 'No file content provided' });
    }
    
    const lines = fileContent.split(/\r?\n/);
    let insertedCount = 0;
    
    const insertStmt = db.prepare(`
      INSERT OR IGNORE INTO attendance (
        id, employee_id, device_enroll_id, timestamp, verification_method, direction, source, sync_status
      ) VALUES (?, ?, ?, ?, ?, ?, 'usb_import', 'pending')
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
        if (!trimmed || trimmed.toLowerCase().startsWith('enrollno') || trimmed.toLowerCase().startsWith('id')) {
          continue; // Skip header or empty lines
        }
        
        // Split by tab, comma, or multiple spaces
        const parts = trimmed.split(/[\t,]+| {2,}/).map(p => p.trim()).filter(Boolean);
        // If it failed to split, fall back to simple whitespace split
        const finalParts = parts.length >= 2 ? parts : trimmed.split(/\s+/).map(p => p.trim()).filter(Boolean);
        
        if (finalParts.length < 2) continue;
        
        const enrollId = finalParts[0];
        const timestamp = finalParts[1];
        const verifyMode = finalParts[2] || 'unknown';
        const state = finalParts[3] || 'unknown';
        
        // Match employee
        const employeeId = empMap.get(String(enrollId).trim()) || null;
        
        // Map verify_mode
        let method = 'unknown';
        const modeLower = verifyMode.toLowerCase();
        if (modeLower === '1' || modeLower.includes('finger') || modeLower.includes('empreinte')) method = 'fingerprint';
        else if (modeLower === '15' || modeLower.includes('face') || modeLower.includes('visage')) method = 'face';
        else if (modeLower === '4' || modeLower.includes('card') || modeLower.includes('carte')) method = 'card';
        else if (modeLower === '3' || modeLower.includes('pass')) method = 'password';
        
        // Map state
        let direction = 'unknown';
        const stateLower = state.toLowerCase();
        if (stateLower === '0' || stateLower.includes('in') || stateLower.includes('entree') || stateLower.includes('entrée')) direction = 'in';
        else if (stateLower === '1' || stateLower.includes('out') || stateLower.includes('sortie')) direction = 'out';
        
        const logId = crypto.randomUUID();
        const runRes = insertStmt.run(logId, employeeId, String(enrollId).trim(), timestamp, method, direction);
        if (runRes.changes > 0) {
          syncQueueStmt.run(logId, JSON.stringify({
            id: logId, employee_id: employeeId, device_enroll_id: String(enrollId).trim(), timestamp, verification_method: method, direction, source: 'usb_import'
          }));
          insertedCount++;
        }
      }
    })();
    
    res.json({ success: true, count: insertedCount });
  } catch (error) {
    console.error('[HR] Upload attendance error:', error);
    res.status(500).json({ error: 'Failed to import attendance file: ' + error.message });
  }
});

// Map employee to device ID
router.put('/employees/:id/enroll', authenticateToken, (req, res) => {
  try {
    const { id } = req.params;
    const { device_enroll_id } = req.body;
    
    const existing = db.prepare('SELECT * FROM employees WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    
    db.prepare(`
      UPDATE employees SET
        device_enroll_id = ?, sync_status = 'pending', sync_updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(device_enroll_id ? String(device_enroll_id).trim() : null, id);

    const updated = db.prepare('SELECT * FROM employees WHERE id = ?').get(id);
    db.prepare(`
      INSERT INTO sync_queue (table_name, record_id, action, data)
      VALUES ('employees', ?, 'UPDATE', ?)
    `).run(id, JSON.stringify(updated));
    
    res.json({ success: true });
  } catch (error) {
    console.error('[HR] Enroll employee error:', error);
    res.status(500).json({ error: 'Failed to update device enroll ID' });
  }
});

export default router;
