// Tenant Management Routes
const express = require('express');
const router = express.Router();
const TenantModel = require('../models/Tenant');
const UserModel = require('../models/User');
const { authenticateJWT, requireRole } = require('../middleware/auth');
const { auditAction } = require('../middleware/audit');

// All tenant routes require admin role
router.use(authenticateJWT);
router.use(requireRole('admin'));

// Get all tenants
router.get('/', async (req, res) => {
  try {
    const activeOnly = req.query.activeOnly === 'true';
    const tenants = await TenantModel.getAll(activeOnly);
    res.json(tenants);
  } catch (error) {
    console.error('[TENANTS] Error listing tenants:', error);
    res.status(500).json({ error: 'Failed to retrieve tenants' });
  }
});

// Get tenant by ID
router.get('/:id', async (req, res) => {
  try {
    const tenant = await TenantModel.findById(req.params.id);
    
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }
    
    res.json(tenant);
  } catch (error) {
    console.error('[TENANTS] Error getting tenant:', error);
    res.status(500).json({ error: 'Failed to retrieve tenant' });
  }
});

// Create new tenant
router.post('/', auditAction('tenant_created'), async (req, res) => {
  try {
    const { name, description, apiKey } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Tenant name is required' });
    }
    
    // Check if tenant with same name exists
    const existing = await TenantModel.findByName(name);
    if (existing) {
      return res.status(409).json({ error: 'Tenant with this name already exists' });
    }
    
    const tenant = await TenantModel.create({
      name,
      description,
      apiKey,
      active: true
    });
    
    console.log(`[TENANTS] Created tenant: ${tenant.name} (${tenant.id})`);
    res.status(201).json(tenant);
  } catch (error) {
    console.error('[TENANTS] Error creating tenant:', error);
    res.status(500).json({ error: 'Failed to create tenant' });
  }
});

// Update tenant
router.put('/:id', auditAction('tenant_updated'), async (req, res) => {
  try {
    const { name, description, active, apiKey } = req.body;
    const updates = {};
    
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (active !== undefined) updates.active = active;
    if (apiKey !== undefined) updates.apiKey = apiKey;
    
    const tenant = await TenantModel.update(req.params.id, updates);
    
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }
    
    console.log(`[TENANTS] Updated tenant: ${tenant.name} (${tenant.id})`);
    res.json(tenant);
  } catch (error) {
    console.error('[TENANTS] Error updating tenant:', error);
    res.status(500).json({ error: 'Failed to update tenant' });
  }
});

// Delete tenant (cascade deletes agents, tasks, results)
router.delete('/:id', auditAction('tenant_deleted'), async (req, res) => {
  try {
    // Prevent deletion of default tenant
    const tenant = await TenantModel.findById(req.params.id);
    if (tenant && tenant.name === 'Default') {
      return res.status(403).json({ error: 'Cannot delete default tenant' });
    }
    
    const deleted = await TenantModel.delete(req.params.id);
    
    if (!deleted) {
      return res.status(404).json({ error: 'Tenant not found' });
    }
    
    res.json({ message: 'Tenant deleted successfully' });
  } catch (error) {
    console.error('[TENANTS] Error deleting tenant:', error);
    res.status(500).json({ error: 'Failed to delete tenant' });
  }
});

// Get users assigned to tenant
router.get('/:id/users', async (req, res) => {
  try {
    const users = await TenantModel.getUsers(req.params.id);
    res.json(users);
  } catch (error) {
    console.error('[TENANTS] Error getting tenant users:', error);
    res.status(500).json({ error: 'Failed to retrieve tenant users' });
  }
});

// Assign user to tenant
router.post('/:tenantId/users/:userId', auditAction('user_assigned_to_tenant'), async (req, res) => {
  try {
    const { tenantId, userId } = req.params;
    
    // Verify tenant exists
    const tenant = await TenantModel.findById(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }
    
    // Verify user exists
    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const success = await TenantModel.assignUser(tenantId, userId);
    
    if (!success) {
      return res.status(500).json({ error: 'Failed to assign user to tenant' });
    }
    
    console.log(`[TENANTS] Assigned user ${user.username} to tenant ${tenant.name}`);
    res.json({ 
      message: 'User assigned successfully',
      tenant: { id: tenant.id, name: tenant.name },
      user: { id: user.id, username: user.username }
    });
  } catch (error) {
    console.error('[TENANTS] Error assigning user:', error);
    res.status(500).json({ error: 'Failed to assign user to tenant' });
  }
});

// Remove user from tenant
router.delete('/:tenantId/users/:userId', auditAction('user_removed_from_tenant'), async (req, res) => {
  try {
    const { tenantId, userId } = req.params;
    
    const removed = await TenantModel.unassignUser(tenantId, userId);
    
    if (!removed) {
      return res.status(404).json({ error: 'User assignment not found' });
    }
    
    res.json({ message: 'User removed from tenant successfully' });
  } catch (error) {
    console.error('[TENANTS] Error removing user:', error);
    res.status(500).json({ error: 'Failed to remove user from tenant' });
  }
});

// Get tenant statistics
router.get('/:id/stats', async (req, res) => {
  try {
    const stats = await TenantModel.getStats(req.params.id);
    
    if (!stats) {
      return res.status(404).json({ error: 'Tenant not found' });
    }
    
    res.json(stats);
  } catch (error) {
    console.error('[TENANTS] Error getting tenant stats:', error);
    res.status(500).json({ error: 'Failed to retrieve tenant statistics' });
  }
});

module.exports = router;
