import jwt from 'jsonwebtoken';
import db from '../database.js';
export const canAccessPerformance = (user, targetEmployeeId) => {
  // Admin can access any employee's performance
  if (user.role === 'admin') return true;
  
  // Check if supervisor of the target employee or if it is the employee themselves (match by email)
  const emp = db.prepare('SELECT email, supervisor_id FROM employees WHERE id = ?').get(targetEmployeeId);
  if (emp) {
    if (emp.supervisor_id === user.id) return true;
    if (user.email && emp.email === user.email) return true;
  }
  return false;
};

const JWT_SECRET = 'your-secret-key-change-in-production';

export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access denied' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid token' });
  }
};

export const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
};

export const requirePermission = (module, action) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Access denied' });
    }

    // Admin has full access to everything
    if (req.user.role === 'admin') {
      return next();
    }

    // Default rules:
    // audit_manager has view access to all modules by default
    if (req.user.role === 'audit_manager' && action === 'view') {
      return next();
    }

    // Check custom permissions in database
    try {
      const permission = db.prepare('SELECT allowed FROM user_permissions WHERE user_id = ? AND module = ? AND action = ? AND is_archived = 0').get(req.user.id, module, action);
      
      if (permission && permission.allowed === 1) {
        return next();
      }
    } catch (err) {
      console.error('Error checking permissions:', err);
    }

    return res.status(403).json({ error: 'Insufficient permissions' });
  };
};

export { JWT_SECRET };
