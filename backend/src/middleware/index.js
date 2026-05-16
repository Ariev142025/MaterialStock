import jwt from 'jsonwebtoken';
import { queryOne } from '../database/connection.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Authenticate JWT token
export async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Verify user still exists and is active
    const user = await queryOne(
      'SELECT id, email, full_name, role, is_active FROM users WHERE id = $1',
      [decoded.id]
    );

    if (!user || !user.is_active) {
      return res.status(401).json({ error: 'User not found or inactive' });
    }

    req.user = { ...user, ...decoded };
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}

// Authorization middleware - check roles
export function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: 'Forbidden - insufficient permissions',
        required_roles: allowedRoles,
        user_role: req.user.role
      });
    }

    next();
  };
}

// Check project access
export async function checkProjectAccess(req, res, next) {
  const { projectId } = req.params;

  try {
    // Admin can access all projects
    if (req.user.role === 'ADMIN') {
      return next();
    }

    // Check if user has access to project
    const access = await queryOne(
      `SELECT * FROM project_users 
       WHERE project_id = $1 AND user_id = $2`,
      [projectId, req.user.id]
    );

    if (!access) {
      return res.status(403).json({ error: 'No access to this project' });
    }

    req.projectId = projectId;
    next();
  } catch (error) {
    res.status(500).json({ error: 'Access check failed' });
  }
}

// Error handler middleware
export function errorHandler(err, req, res, next) {
  console.error('Error:', err);

  const status = err.status || 500;
  const message = err.message || 'Internal Server Error';

  res.status(status).json({
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
}

// Generate JWT token
export function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role
    },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
}

// Generate Refresh Token
export function generateRefreshToken(user) {
  return jwt.sign(
    { id: user.id },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// Audit logging middleware
export async function auditLog(action, entityType, entityId, oldValues, newValues, req) {
  try {
    const { query } = await import('../database/connection.js');
    
    await query(
      `INSERT INTO audit_logs 
       (user_id, action, entity_type, entity_id, old_values, new_values, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        req.user?.id,
        action,
        entityType,
        entityId,
        JSON.stringify(oldValues || null),
        JSON.stringify(newValues || null),
        req.ip,
        req.get('user-agent')
      ]
    );
  } catch (error) {
    console.error('Audit log error:', error);
  }
}
