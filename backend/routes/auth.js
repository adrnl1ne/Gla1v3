// Authentication Routes
const express = require('express');
const router = express.Router();
const AuthService = require('../services/authService');
const UserModel = require('../models/User');
const { authenticateJWT, requireRole } = require('../middleware/auth');
const { auditAction } = require('../middleware/audit');

// Login
router.post('/login', auditAction('login'), async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    
    const result = await AuthService.login(username, password);
    res.json(result);
  } catch (err) {
    console.error('Login error:', err);
    res.status(401).json({ error: err.message });
  }
});

// Logout
router.post('/logout', authenticateJWT, auditAction('logout'), (req, res) => {
  AuthService.logout(req.user.sessionId);
  res.json({ message: 'Logged out successfully' });
});

// Refresh token
router.post('/refresh', authenticateJWT, (req, res) => {
  try {
    const jwt = require('jsonwebtoken');
    const { config } = require('../config/env');
    const { activeSessions } = require('../middleware/auth');
    
    const expiresIn = 3600; // 1 hour
    
    const token = jwt.sign(
      {
        userId: req.user.userId,
        username: req.user.username,
        role: req.user.role,
        sessionId: req.user.sessionId
      },
      config.jwtSecret,
      { expiresIn: `${expiresIn}s` }
    );
    
    // Extend session expiration
    const session = activeSessions.get(req.user.sessionId);
    if (session) {
      session.expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
    }
    
    res.json({ token });
  } catch (err) {
    console.error('Token refresh error:', err);
    res.status(500).json({ error: 'Failed to refresh token' });
  }
});

// Create user (admin only)
router.post('/users', authenticateJWT, requireRole('admin'), auditAction('create_user'), async (req, res) => {
  try {
    const { username, password, role } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    
    const existing = await UserModel.findByUsername(username);
    if (existing) {
      return res.status(409).json({ error: 'Username already exists' });
    }
    
    const user = await UserModel.create({ username, password, role: role || 'operator' });
    const { passwordHash, ...userWithoutPassword } = user;
    
    res.status(201).json(userWithoutPassword);
  } catch (err) {
    console.error('User creation error:', err);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// List users (admin only)
router.get('/users', authenticateJWT, requireRole('admin'), (req, res) => {
  const users = UserModel.getAll();
  res.json(users);
});

// Get audit logs (admin only)
router.get('/audit', authenticateJWT, requireRole('admin'), (req, res) => {
  const { getAuditLog } = require('../middleware/audit');
  const limit = parseInt(req.query.limit) || 100;
  const logs = getAuditLog();
  const recentLogs = logs.slice(-limit).reverse();
  res.json({ total: logs.length, logs: recentLogs });
});

module.exports = router;
