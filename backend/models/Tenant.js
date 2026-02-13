// Tenant Model - Client companies being assessed
const { query } = require('../db/connection');
const crypto = require('crypto');

class TenantModel {
  // Create a new tenant
  static async create(tenantData) {
    const apiKey = tenantData.apiKey || `tenant_${crypto.randomBytes(16).toString('hex')}`;
    
    const result = await query(
      `INSERT INTO tenants (name, api_key, description, active)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [
        tenantData.name,
        apiKey,
        tenantData.description || null,
        tenantData.active !== undefined ? tenantData.active : true
      ]
    );
    
    console.log(`[TENANT] Created: ${result.rows[0].name} (${result.rows[0].id})`);
    return result.rows[0];
  }
  
  // Find tenant by ID
  static async findById(tenantId) {
    const result = await query(
      'SELECT * FROM tenants WHERE id = $1',
      [tenantId]
    );
    return result.rows[0] || null;
  }
  
  // Find tenant by name
  static async findByName(name) {
    const result = await query(
      'SELECT * FROM tenants WHERE name = $1',
      [name]
    );
    return result.rows[0] || null;
  }
  
  // Find tenant by API key
  static async findByApiKey(apiKey) {
    console.log(`[TENANT] Looking up tenant by API key: ${apiKey}`);
    const result = await query(
      'SELECT * FROM tenants WHERE api_key = $1',
      [apiKey]
    );
    console.log(`[TENANT] findByApiKey result:`, result.rows[0] || 'NOT FOUND');
    return result.rows[0] || null;
  }
  
  // Get all tenants
  static async getAll(activeOnly = false) {
    const sql = activeOnly 
      ? 'SELECT * FROM tenants WHERE active = true ORDER BY name'
      : 'SELECT * FROM tenants ORDER BY name';
    
    const result = await query(sql);
    return result.rows;
  }
  
  // Get tenants accessible by a specific user (respects RLS)
  static async getByUser(userId) {
    const result = await query(
      'SELECT * FROM get_user_tenants($1)',
      [userId]
    );
    return result.rows;
  }
  
  // Update tenant
  static async update(tenantId, updates) {
    const fields = [];
    const values = [];
    let paramIndex = 1;
    
    if (updates.name !== undefined) {
      fields.push(`name = $${paramIndex++}`);
      values.push(updates.name);
    }
    if (updates.description !== undefined) {
      fields.push(`description = $${paramIndex++}`);
      values.push(updates.description);
    }
    if (updates.active !== undefined) {
      fields.push(`active = $${paramIndex++}`);
      values.push(updates.active);
    }
    if (updates.apiKey !== undefined) {
      fields.push(`api_key = $${paramIndex++}`);
      values.push(updates.apiKey);
    }
    
    if (fields.length === 0) {
      return await TenantModel.findById(tenantId);
    }
    
    values.push(tenantId);
    const result = await query(
      `UPDATE tenants SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );
    
    return result.rows[0] || null;
  }
  
  // Delete tenant (cascade deletes agents, tasks, results)
  static async delete(tenantId) {
    const result = await query(
      'DELETE FROM tenants WHERE id = $1 RETURNING *',
      [tenantId]
    );
    
    if (result.rows[0]) {
      console.log(`[TENANT] Deleted: ${result.rows[0].name} (${tenantId})`);
    }
    
    return result.rowCount > 0;
  }
  
  // Assign user to tenant
  static async assignUser(tenantId, userId) {
    try {
      await query(
        `INSERT INTO user_tenants (user_id, tenant_id)
         VALUES ($1, $2)
         ON CONFLICT (user_id, tenant_id) DO NOTHING`,
        [userId, tenantId]
      );
      console.log(`[TENANT] Assigned user ${userId} to tenant ${tenantId}`);
      return true;
    } catch (error) {
      console.error('[TENANT] Failed to assign user:', error.message);
      return false;
    }
  }
  
  // Remove user from tenant
  static async unassignUser(tenantId, userId) {
    const result = await query(
      'DELETE FROM user_tenants WHERE user_id = $1 AND tenant_id = $2',
      [userId, tenantId]
    );
    
    if (result.rowCount > 0) {
      console.log(`[TENANT] Removed user ${userId} from tenant ${tenantId}`);
    }
    
    return result.rowCount > 0;
  }
  
  // Get users assigned to a tenant
  static async getUsers(tenantId) {
    const result = await query(
      `SELECT u.id, u.username, u.role, u.active, ut.assigned_at
       FROM users u
       INNER JOIN user_tenants ut ON ut.user_id = u.id
       WHERE ut.tenant_id = $1
       ORDER BY u.username`,
      [tenantId]
    );
    return result.rows;
  }
  
  // Get statistics for a tenant
  static async getStats(tenantId) {
    const result = await query(
      'SELECT * FROM get_tenant_stats($1)',
      [tenantId]
    );
    return result.rows[0] || null;
  }
  
  // Get default tenant (for backward compatibility)
  static async getDefault() {
    console.log('[TENANT] Getting default tenant');
    const tenant = await TenantModel.findByName('Default');
    console.log('[TENANT] getDefault result:', tenant || 'NOT FOUND');
    return tenant;
  }
}

module.exports = TenantModel;
