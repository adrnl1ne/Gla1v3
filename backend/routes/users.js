// User Management Routes
const express = require('express');
const router = express.Router();
const UserModel = require('../models/User');
const TenantModel = require('../models/Tenant');
const { authenticateJWT, requireRole } = require('../middleware/auth');
const { auditAction } = require('../middleware/audit');

// All user management routes require admin role
router.use(authenticateJWT);
router.use(requireRole('admin'));

// Get all users
router.get('/', async (req, res) => {
  try {
    const users = await UserModel.getAll();
    res.json(users);
  } catch (error) {
    console.error('[USERS] Error listing users:', error);
    res.status(500).json({ error: 'Failed to retrieve users' });
  }
});

// Get user by ID
router.get('/:id', async (req, res) => {
  try {
    const user = await UserModel.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Don't return password hash
    const { password_hash, ...userWithoutPassword } = user;
    res.json(userWithoutPassword);
  } catch (error) {
    console.error('[USERS] Error getting user:', error);
    res.status(500).json({ error: 'Failed to retrieve user' });
  }
});

// Get user's assigned tenants
router.get('/:id/tenants', async (req, res) => {
  try {
    const tenants = await UserModel.getTenants(req.params.id);
    res.json(tenants);
  } catch (error) {
    console.error('[USERS] Error getting user tenants:', error);
    res.status(500).json({ error: 'Failed to retrieve user tenants' });
  }
});

// Create new user
router.post('/', auditAction('user_created'), async (req, res) => {
  try {
    const { username, password, role, tenantIds } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    
    // Check if username already exists
    const existing = await UserModel.findByUsername(username);
    if (existing) {
      return res.status(409).json({ error: 'Username already exists' });
    }
    
    // Create user
    const user = await UserModel.create({
      username,
      password,
      role: role || 'operator',
      active: true
    });
    
    // Assign to tenants if provided
    if (tenantIds && Array.isArray(tenantIds) && tenantIds.length > 0) {
      for (const tenantId of tenantIds) {
        await TenantModel.assignUser(tenantId, user.id);
      }
    }
    
    console.log(`[USERS] Created user: ${user.username} (${user.role})`);
    
    // Return user without password hash
    const { password_hash, ...userWithoutPassword } = user;
    res.status(201).json({
      ...userWithoutPassword,
      assignedTenants: tenantIds || []
    });
  } catch (error) {
    console.error('[USERS] Error creating user:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Update user
router.put('/:id', auditAction('user_updated'), async (req, res) => {
  try {
    const { username, password, role, active } = req.body;
    const updates = {};
    
    if (username !== undefined) updates.username = username;
    if (password !== undefined) {
      if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }
      updates.password = password;
    }
    if (role !== undefined) updates.role = role;
    if (active !== undefined) updates.active = active;
    
    // Prevent self-demotion from admin
    if (role && role !== 'admin' && req.params.id === req.user.userId) {
      return res.status(403).json({ error: 'Cannot remove your own admin role' });
    }
    
    const user = await UserModel.update(req.params.id, updates);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    console.log(`[USERS] Updated user: ${user.username}`);
    
    // Return user without password hash
    const { password_hash, ...userWithoutPassword } = user;
    res.json(userWithoutPassword);
  } catch (error) {
    console.error('[USERS] Error updating user:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Delete user
router.delete('/:id', auditAction('user_deleted'), async (req, res) => {
  try {
    // Prevent self-deletion
    if (req.params.id === req.user.userId) {
      return res.status(403).json({ error: 'Cannot delete your own account' });
    }
    
    // Prevent deletion of default admin
    const user = await UserModel.findById(req.params.id);
    if (user && user.username === 'admin') {
      return res.status(403).json({ error: 'Cannot delete default admin account' });
    }
    
    const deleted = await UserModel.delete(req.params.id);
    
    if (!deleted) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('[USERS] Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Bulk assign user to multiple tenants
router.post('/:id/tenants', auditAction('user_tenants_updated'), async (req, res) => {
  try {
    const { tenantIds } = req.body;
    
    if (!Array.isArray(tenantIds)) {
      return res.status(400).json({ error: 'tenantIds must be an array' });
    }
    
    const user = await UserModel.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Assign to each tenant
    for (const tenantId of tenantIds) {
      await TenantModel.assignUser(tenantId, user.id);
    }
    
    console.log(`[USERS] Assigned user ${user.username} to ${tenantIds.length} tenant(s)`);
    res.json({ 
      message: 'User assigned to tenants successfully',
      assignedTenants: tenantIds.length
    });
  } catch (error) {
    console.error('[USERS] Error assigning tenants:', error);
    res.status(500).json({ error: 'Failed to assign user to tenants' });
  }
});

module.exports = router;
