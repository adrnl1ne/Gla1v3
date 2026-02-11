// Authentication Routes
const express = require('express');
const router = express.Router();
const AuthService = require('../services/authService');
const TwoFactorService = require('../services/twoFactorService');
const SessionService = require('../services/sessionService');
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
router.post('/refresh', authenticateJWT, async (req, res) => {
  try {
    const jwt = require('jsonwebtoken');
    const { config } = require('../config/env');
    
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
    
    // Extend session expiration in Redis
    await SessionService.refresh(req.user.sessionId, expiresIn);
    
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

// ============================================================================
// 2FA Endpoints
// ============================================================================

// Setup 2FA - Generate secret and QR code
router.post('/2fa/setup', authenticateJWT, auditAction('2fa_setup'), async (req, res) => {
  try {
    const userId = req.user.userId;
    const username = req.user.username;
    
    // Check if 2FA is already enabled
    const isEnabled = await TwoFactorService.isTwoFactorEnabled(userId);
    if (isEnabled) {
      return res.status(400).json({ error: '2FA is already enabled' });
    }
    
    // Generate secret and QR code
    const { secret, qrCode } = await TwoFactorService.generateSecret(username);
    
    res.json({ 
      secret, 
      qrCode,
      message: 'Scan the QR code with your authenticator app, then verify with a code to enable 2FA'
    });
  } catch (err) {
    console.error('2FA setup error:', err);
    res.status(500).json({ error: 'Failed to setup 2FA' });
  }
});

// Enable 2FA - Verify token and activate
router.post('/2fa/enable', authenticateJWT, auditAction('2fa_enable'), async (req, res) => {
  try {
    const { secret, token } = req.body;
    
    if (!secret || !token) {
      return res.status(400).json({ error: 'Secret and verification token required' });
    }
    
    const result = await TwoFactorService.enableTwoFactor(req.user.userId, secret, token);
    
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    
    res.json({ 
      message: '2FA enabled successfully',
      backupCodes: result.backupCodes,
      warning: 'Save these backup codes securely. They will only be shown once.'
    });
  } catch (err) {
    console.error('2FA enable error:', err);
    res.status(500).json({ error: 'Failed to enable 2FA' });
  }
});

// Disable 2FA
router.post('/2fa/disable', authenticateJWT, auditAction('2fa_disable'), async (req, res) => {
  try {
    const { password, token } = req.body;
    
    if (!password) {
      return res.status(400).json({ error: 'Password required to disable 2FA' });
    }
    
    // Verify password
    const user = await UserModel.findByUsername(req.user.username);
    const isValidPassword = await UserModel.verifyPassword(user, password);
    
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid password' });
    }
    
    // If token provided, verify it
    if (token) {
      const secret = await TwoFactorService.getUserSecret(req.user.userId);
      const isValid = TwoFactorService.verifyToken(secret, token);
      
      if (!isValid) {
        return res.status(401).json({ error: 'Invalid 2FA token' });
      }
    }
    
    await TwoFactorService.disableTwoFactor(req.user.userId);
    
    res.json({ message: '2FA disabled successfully' });
  } catch (err) {
    console.error('2FA disable error:', err);
    res.status(500).json({ error: 'Failed to disable 2FA' });
  }
});

// Verify 2FA token during login
router.post('/2fa/verify', auditAction('2fa_verify'), async (req, res) => {
  try {
    const { tempToken, token, backupCode } = req.body;
    
    if (!tempToken) {
      return res.status(400).json({ error: 'Temporary token required' });
    }
    
    if (!token && !backupCode) {
      return res.status(400).json({ error: '2FA token or backup code required' });
    }
    
    // Verify temporary token
    const jwt = require('jsonwebtoken');
    const { config } = require('../config/env');
    
    let decoded;
    try {
      decoded = jwt.verify(tempToken, config.jwtSecret);
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired temporary token' });
    }
    
    if (decoded.step !== '2fa-pending') {
      return res.status(400).json({ error: 'Invalid token type' });
    }
    
    const userId = decoded.userId;
    
    // Verify 2FA token or backup code
    let isValid = false;
    
    if (token) {
      const secret = await TwoFactorService.getUserSecret(userId);
      if (!secret) {
        return res.status(400).json({ error: '2FA not enabled for this user' });
      }
      isValid = TwoFactorService.verifyToken(secret, token);
    } else if (backupCode) {
      isValid = await TwoFactorService.verifyBackupCode(userId, backupCode);
    }
    
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid 2FA token or backup code' });
    }
    
    // 2FA verified - complete login
    const result = await AuthService.completeLogin(decoded.userId, decoded.username, decoded.role);
    
    res.json(result);
  } catch (err) {
    console.error('2FA verification error:', err);
    res.status(500).json({ error: 'Failed to verify 2FA' });
  }
});

// Update user profile (own account)
router.put('/profile', authenticateJWT, auditAction('profile_update'), async (req, res) => {
  try {
    const { currentPassword, username, newPassword } = req.body;
    const userId = req.user.userId;

    if (!currentPassword) {
      return res.status(400).json({ error: 'Current password is required' });
    }

    // Get user
    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify current password
    const bcrypt = require('bcrypt');
    const isValidPassword = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    // Build update object
    const updates = {};
    
    if (username && username !== user.username) {
      // Check if new username is already taken
      const existingUser = await UserModel.findByUsername(username);
      if (existingUser && existingUser.id !== userId) {
        return res.status(400).json({ error: 'Username already taken' });
      }
      updates.username = username;
    }

    if (newPassword) {
      if (newPassword.length < 6) {
        return res.status(400).json({ error: 'New password must be at least 6 characters' });
      }
      const passwordHash = await bcrypt.hash(newPassword, 10);
      updates.password_hash = passwordHash;
    }

    // Update user
    if (Object.keys(updates).length > 0) {
      await UserModel.update(userId, updates);
      console.log(`[AUTH] User ${user.username} updated profile`);
    }

    res.json({
      message: 'Profile updated successfully',
      user: {
        id: userId,
        username: updates.username || user.username,
        role: user.role
      }
    });
  } catch (err) {
    console.error('Profile update error:', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

module.exports = router;
