import express from 'express';
import bcrypt from 'bcryptjs';
import db from '../database.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = express.Router();

router.get('/', authenticateToken, requireRole('admin'), (req, res) => {
  try {
    const users = db.prepare('SELECT id, email, name, role, created_at FROM users').all();
    res.json(users);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', authenticateToken, requireRole('admin'), (req, res) => {
  const { email, password, name, role } = req.body;

  if (!email || !password || !name || !role) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  if (!['admin', 'audit_manager', 'user'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  try {
    const existingUser = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const hashedPassword = bcrypt.hashSync(password, 10);

    const result = db.prepare(
      'INSERT INTO users (email, password, name, role) VALUES (?, ?, ?, ?)'
    ).run(email, hashedPassword, name, role);

    const newUser = db.prepare('SELECT id, email, name, role, created_at FROM users WHERE id = ?').get(result.lastInsertRowid);

    res.status(201).json(newUser);
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id', authenticateToken, requireRole('admin'), (req, res) => {
  const { id } = req.params;
  const { role, name } = req.body;

  if (role && !['admin', 'audit_manager', 'user'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (role && user.email === 'admin@inventory.com' && role !== 'admin') {
      return res.status(400).json({ error: 'Cannot change default admin role' });
    }

    const updatedRole = role !== undefined ? role : user.role;
    const updatedName = name !== undefined ? name : user.name;

    db.prepare('UPDATE users SET role = ?, name = ? WHERE id = ?').run(updatedRole, updatedName, id);

    const updatedUser = db.prepare('SELECT id, email, name, role, created_at FROM users WHERE id = ?').get(id);

    res.json(updatedUser);
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id/permissions', authenticateToken, (req, res) => {
  const { id } = req.params;
  try {
    const permissions = db.prepare('SELECT id, module, action, allowed FROM user_permissions WHERE user_id = ? AND is_archived = 0').all(id);
    res.json(permissions);
  } catch (error) {
    console.error('Get permissions error:', error);
    res.status(500).json({ error: 'Failed to fetch user permissions' });
  }
});

router.put('/:id/permissions', authenticateToken, requireRole('admin'), (req, res) => {
  const { id } = req.params;
  const { permissions } = req.body;

  if (!Array.isArray(permissions)) {
    return res.status(400).json({ error: 'Permissions must be an array' });
  }

  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    db.transaction(() => {
      // Archive current permissions
      db.prepare('UPDATE user_permissions SET is_archived = 1, sync_status = "pending", sync_updated_at = CURRENT_TIMESTAMP WHERE user_id = ?').run(id);

      const insertStmt = db.prepare(`
        INSERT INTO user_permissions (user_id, module, action, allowed, sync_status)
        VALUES (?, ?, ?, ?, 'pending')
        ON CONFLICT(user_id, module, action) DO UPDATE SET
          allowed = excluded.allowed,
          is_archived = 0,
          sync_status = 'pending',
          sync_updated_at = CURRENT_TIMESTAMP
      `);

      for (const p of permissions) {
        insertStmt.run(id, p.module, p.action, p.allowed ? 1 : 0);
      }
    })();

    res.json({ success: true });
  } catch (error) {
    console.error('Update permissions error:', error);
    res.status(500).json({ error: 'Failed to update user permissions' });
  }
});

router.delete('/:id', authenticateToken, requireRole('admin'), (req, res) => {
  const { id } = req.params;

  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.email === 'admin@inventory.com') {
      return res.status(400).json({ error: 'Cannot delete default admin' });
    }

    db.prepare('DELETE FROM users WHERE id = ?').run(id);

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/change-password', authenticateToken, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current password and new password are required' });
  }

  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const validPassword = bcrypt.compareSync(currentPassword, user.password);
    if (!validPassword) {
      return res.status(400).json({ error: 'Incorrect current password' });
    }

    const hashedNewPassword = bcrypt.hashSync(newPassword, 10);
    db.prepare('UPDATE users SET password = ?, sync_status = "pending", sync_updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(hashedNewPassword, req.user.id);

    // Also write to sync queue
    const updatedUser = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    try {
      db.prepare('INSERT INTO sync_queue (table_name, record_id, action, data) VALUES (?, ?, ?, ?)').run(
        'users',
        String(req.user.id),
        'UPDATE',
        JSON.stringify(updatedUser)
      );
    } catch(e) {}

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
