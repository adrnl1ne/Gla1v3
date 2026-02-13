// Authentication and Authorization Middleware
const jwt = require('jsonwebtoken');
const { config } = require('../config/env');
const { requestContext, pool } = require('../db/connection');
const SessionService = require('../services/sessionService');

// JWT Authentication with RLS Context using AsyncLocalStorage
async function authenticateJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  const token = authHeader.slice(7);
  
  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    req.user = decoded;
    
    // Validate session in Redis
    const session = await SessionService.validate(decoded.sessionId);
    if (!session) {
      return res.status(403).json({ error: 'Session expired' });
    }
    
    // Get a dedicated database client for this request  
    const client = await pool.connect();
    
    // Set RLS context on this connection
    try {
      await client.query("SELECT set_config('app.current_user_id', $1, false)", [decoded.userId]);
    } catch (err) {
      console.error('[AUTH] Failed to set RLS context:', err.message);
      client.release();
      return res.status(500).json({ error: 'Failed to initialize security context' });
    }
    
    // Store client in AsyncLocalStorage for this request
    // All database queries in this request will automatically use this client
    requestContext.enterWith(client);
    
    // Release the client when the response finishes
    res.on('finish', () => {
      client.release();
    });
    
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}

// Role-based access control
function requireRole(role) {
  return (req, res, next) => {
    if (req.user.role !== role && req.user.role !== 'admin') {
      return res.status(403).json({ error: `${role} role required` });
    }
    next();
  };
}

// Tenant access control - check if user has access to specific tenant
async function requireTenantAccess(req, res, next) {
  const tenantId = req.params.tenantId || req.body.tenantId || req.query.tenantId;
  
  if (!tenantId) {
    return res.status(400).json({ error: 'Tenant ID required' });
  }
  
  // Admins have access to all tenants
  if (req.user.role === 'admin') {
    return next();
  }
  
  // Check if user has access to this tenant
  const UserModel = require('../models/User');
  const hasAccess = await UserModel.hasAccessToTenant(req.user.userId, tenantId);
  
  if (!hasAccess) {
    return res.status(403).json({ error: 'Access denied to this tenant' });
  }
  
  next();
}

module.exports = {
  authenticateJWT,
  requireRole,
  requireTenantAccess
};
