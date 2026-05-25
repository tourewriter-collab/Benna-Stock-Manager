import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import db from '../database.js';
import crypto from 'crypto';
import { GoogleGenerativeAI } from '@google/generative-ai';

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

    db.transaction(() => {
      for (const item of assessments) {
        if (item.id && item.score !== undefined && item.assessment) {
          updateStmt.run(Number(item.score), item.assessment, item.id);
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

export default router;
