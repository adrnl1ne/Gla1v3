// User Model - PostgreSQL Version
const bcrypt = require('bcryptjs');
const { query } = require('../db/connection');
const { config } = require('../config/env');

class UserModel {
  static async create(userData) {
    const passwordHash = await bcrypt.hash(userData.password, config.saltRounds);
    
    const result = await query(
      `INSERT INTO users (username, password_hash, role, active)
       VALUES ($1, $2, $3, $4)
       RETURNING id, username, role, active, created_at, updated_at`,
      [
        userData.username,
        passwordHash,
        userData.role || 'operator',
        userData.active !== undefined ? userData.active : true
      ]
    );
    
    console.log(`[USER] Created: ${result.rows[0].username} (${result.rows[0].role})`);
    return result.rows[0];
  }
  
  static async findByUsername(username) {
    const result = await query(
      'SELECT * FROM users WHERE username = $1',
      [username]
    );
    return result.rows[0] || null;
  }
  
  static async findById(userId) {
    const result = await query(
      'SELECT * FROM users WHERE id = $1',
      [userId]
    );
    return result.rows[0] || null;
  }
  
  static async verifyPassword(user, password) {
    return await bcrypt.compare(password, user.password_hash);
  }
  
  static async getAll() {
    const result = await query(
      `SELECT id, username, role, active, created_at, updated_at
       FROM users
       ORDER BY username`
    );
    return result.rows;
  }
  
  // Get user's assigned tenants
  static async getTenants(userId) {
    const result = await query(
      `SELECT t.id, t.name, t.description, t.active, ut.assigned_at
       FROM tenants t
       INNER JOIN user_tenants ut ON ut.tenant_id = t.id
       WHERE ut.user_id = $1
       ORDER BY t.name`,
      [userId]
    );
    return result.rows;
  }
  
  // Update user
  static async update(userId, updates) {
    const fields = [];
    const values = [];
    let paramIndex = 1;
    
    if (updates.username !== undefined) {
      fields.push(`username = $${paramIndex++}`);
      values.push(updates.username);
    }
    if (updates.password !== undefined) {
      const passwordHash = await bcrypt.hash(updates.password, config.saltRounds);
      fields.push(`password_hash = $${paramIndex++}`);
      values.push(passwordHash);
    }
    if (updates.role !== undefined) {
      fields.push(`role = $${paramIndex++}`);
      values.push(updates.role);
    }
    if (updates.active !== undefined) {
      fields.push(`active = $${paramIndex++}`);
      values.push(updates.active);
    }
    
    if (fields.length === 0) {
      return await UserModel.findById(userId);
    }
    
    values.push(userId);
    const result = await query(
      `UPDATE users SET ${fields.join(', ')} 
       WHERE id = $${paramIndex}
       RETURNING id, username, role, active, created_at, updated_at`,
      values
    );
    
    return result.rows[0] || null;
  }
  
  // Delete user
  static async delete(userId) {
    const result = await query(
      'DELETE FROM users WHERE id = $1 RETURNING username',
      [userId]
    );
    
    if (result.rows[0]) {
      console.log(`[USER] Deleted: ${result.rows[0].username}`);
    }
    
    return result.rowCount > 0;
  }
  
  // Check if user has access to a specific tenant
  static async hasAccessToTenant(userId, tenantId) {
    // Admin has access to all tenants
    const user = await UserModel.findById(userId);
    if (user && user.role === 'admin') {
      return true;
    }
    
    // Check if user is assigned to tenant
    const result = await query(
      'SELECT 1 FROM user_tenants WHERE user_id = $1 AND tenant_id = $2',
      [userId, tenantId]
    );
    
    return result.rowCount > 0;
  }
}

module.exports = UserModel;
