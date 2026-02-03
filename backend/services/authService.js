// Authentication Service
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const UserModel = require('../models/User');
const { config } = require('../config/env');
const { activeSessions } = require('../middleware/auth');

class AuthService {
  static async login(username, password) {
    const user = await UserModel.findByUsername(username);
    
    if (!user) {
      throw new Error('Invalid credentials');
    }
    
    const isValid = await UserModel.verifyPassword(user, password);
    if (!isValid) {
      throw new Error('Invalid credentials');
    }
    
    // Create session
    const sessionId = crypto.randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    
    activeSessions.set(sessionId, {
      userId: user.userId,
      role: user.role,
      createdAt: new Date().toISOString(),
      expiresAt: expiresAt.toISOString()
    });
    
    // Generate JWT
    const token = jwt.sign(
      { userId: user.userId, username: user.username, role: user.role, sessionId },
      config.jwtSecret,
      { expiresIn: '24h' }
    );
    
    return {
      token,
      sessionId,
      user: {
        userId: user.userId,
        username: user.username,
        role: user.role
      }
    };
  }
  
  static logout(sessionId) {
    return activeSessions.delete(sessionId);
  }
  
  static async initializeDefaultAdmin() {
    const adminPassword = config.adminPassword;
    await UserModel.create({
      userId: 'admin',
      username: 'admin',
      password: adminPassword,
      role: 'admin'
    });
    console.log('Default admin user initialized (username: admin)');
  }
}

module.exports = AuthService;
