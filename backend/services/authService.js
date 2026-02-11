// Authentication Service
const jwt = require('jsonwebtoken');
const UserModel = require('../models/User');
const TenantModel = require('../models/Tenant');
const TwoFactorService = require('./twoFactorService');
const SessionService = require('./sessionService');
const { config } = require('../config/env');

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
    
    // Check if 2FA is enabled
    const has2FA = await TwoFactorService.isTwoFactorEnabled(user.id);
    
    if (has2FA) {
      // Return temporary token for 2FA verification
      const tempToken = jwt.sign(
        { 
          userId: user.id, 
          username: user.username, 
          role: user.role,
          step: '2fa-pending'
        },
        config.jwtSecret,
        { expiresIn: '5m' } // 5 minutes to complete 2FA
      );
      
      return {
        requires2FA: true,
        tempToken,
        message: 'Please provide your 2FA token'
      };
    }
    
    // No 2FA - complete login immediately
    return await this.completeLogin(user.id, user.username, user.role);
  }
  
  static async completeLogin(userId, username, role) {
    // Get user's accessible tenants
    const tenants = await UserModel.getTenants(userId);
    
    // Create session in Redis
    const { sessionId, expiresAt } = await SessionService.create(userId, username, role);
    
    // Generate JWT
    const token = jwt.sign(
      { userId, username, role, sessionId },
      config.jwtSecret,
      { expiresIn: '24h' }
    );
    
    return {
      token,
      sessionId,
      user: {
        userId,
        username,
        role
      },
      tenants: tenants.map(t => ({
        id: t.id,
        name: t.name,
        description: t.description
      }))
    };
  }
  
  static async logout(sessionId) {
    return await SessionService.delete(sessionId);
  }
  
  static async initializeDefaultAdmin() {
    try {
      // Check if admin already exists
      const existingAdmin = await UserModel.findByUsername('admin');
      if (existingAdmin) {
        console.log('✅ Admin user already exists');
        return;
      }
      
      // Create admin user
      const adminPassword = config.adminPassword;
      const admin = await UserModel.create({
        username: 'admin',
        password: adminPassword,
        role: 'admin'
      });
      
      // Assign admin to default tenant
      const defaultTenant = await TenantModel.getDefault();
      if (defaultTenant) {
        await TenantModel.assignUser(defaultTenant.id, admin.id);
      }
      
      console.log('✅ Default admin user initialized (username: admin)');
    } catch (error) {
      console.error('❌ Failed to initialize admin user:', error.message);
    }
  }
}

module.exports = AuthService;
