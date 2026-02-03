// Authentication and Authorization Middleware
const jwt = require('jsonwebtoken');
const { config } = require('../config/env');

// Session storage (will be moved to Redis/DB later)
const activeSessions = new Map();

// JWT Authentication
function authenticateJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  const token = authHeader.slice(7);
  
  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    req.user = decoded;
    
    // Check if session is still valid
    const session = activeSessions.get(decoded.sessionId);
    if (!session || new Date(session.expiresAt) < new Date()) {
      return res.status(403).json({ error: 'Session expired' });
    }
    
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

module.exports = {
  authenticateJWT,
  requireRole,
  activeSessions
};
