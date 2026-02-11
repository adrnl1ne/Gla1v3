// Agent Model - PostgreSQL Version
const geoip = require('geoip-lite');
const { query } = require('../db/connection');

class AgentModel {
  static async register(agentData, tenantId) {
    const ip = agentData.ip || 'unknown';
    const geoResult = ip !== 'unknown' ? geoip.lookup(ip) : null;
    
    // Prepare geo data
    let latitude = null, longitude = null, geoCountry = null, geoRegion = null, geoCity = null;
    if (geoResult && Array.isArray(geoResult.ll)) {
      latitude = geoResult.ll[0];
      longitude = geoResult.ll[1];
      geoCountry = geoResult.country;
      geoRegion = geoResult.region;
      geoCity = geoResult.city;
    }
    
    const result = await query(
      `INSERT INTO agents (
        tenant_id, hostname, cn, os, arch, username, ip_address,
        latitude, longitude, geo_country, geo_region, geo_city,
        cert_fingerprint, cert_issued_at, cert_expiry, cert_status,
        status, first_seen, last_seen
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET
        hostname = EXCLUDED.hostname,
        ip_address = EXCLUDED.ip_address,
        last_seen = NOW()
      RETURNING *`,
      [
        tenantId,
        agentData.hostname,
        agentData.cn || 'unknown',
        agentData.os,
        agentData.arch,
        agentData.user,
        ip !== 'unknown' ? ip : null,
        latitude,
        longitude,
        geoCountry,
        geoRegion,
        geoCity,
        agentData.certFingerprint || null,
        agentData.certIssuedAt || null,
        agentData.certExpiry || null,
        agentData.certStatus || 'active',
        'active'
      ]
    );
    
    const agent = result.rows[0];
    const geoStr = agent.geo_city ? `${agent.geo_city}, ${agent.geo_country}` : 'N/A';
    const latLng = agent.latitude ? `${agent.latitude}/${agent.longitude}` : 'N/A';
    
    console.log(`[AGENT] Registered: ${agent.id} | CN: ${agent.cn} | IP: ${agent.ip_address} | GEO: ${geoStr} | Lat/Lng: ${latLng}`);
    
    return agent;
  }
  
  static async update(agentId, updates) {
    const fields = [];
    const values = [];
    let paramIndex = 1;
    
    // Check if IP is being updated to recalculate geo
    if (updates.ip && updates.ip !== 'unknown') {
      const geoResult = geoip.lookup(updates.ip);
      if (geoResult && Array.isArray(geoResult.ll)) {
        updates.latitude = geoResult.ll[0];
        updates.longitude = geoResult.ll[1];
        updates.geo_country = geoResult.country;
        updates.geo_region = geoResult.region;
        updates.geo_city = geoResult.city;
      }
    }
    
    // Build dynamic update query
    const allowedFields = ['hostname', 'cn', 'os', 'arch', 'username', 'ip_address', 
                          'latitude', 'longitude', 'geo_country', 'geo_region', 'geo_city',
                          'cert_fingerprint', 'cert_issued_at', 'cert_expiry', 'cert_status', 'status'];
    
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        fields.push(`${field} = $${paramIndex++}`);
        values.push(updates[field]);
      }
    }
    
    // Always update last_seen
    fields.push(`last_seen = NOW()`);
    
    if (fields.length === 1) { // Only last_seen update
      await query('UPDATE agents SET last_seen = NOW() WHERE id = $1', [agentId]);
      return await AgentModel.findById(agentId);
    }
    
    values.push(agentId);
    const result = await query(
      `UPDATE agents SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );
    
    return result.rows[0] || null;
  }
  
  static async findById(agentId) {
    const result = await query(
      'SELECT * FROM agents WHERE id = $1',
      [agentId]
    );
    return result.rows[0] || null;
  }
  
  static async getAll(tenantId = null) {
    let sql = 'SELECT * FROM agents';
    const params = [];
    
    if (tenantId) {
      sql += ' WHERE tenant_id = $1';
      params.push(tenantId);
    }
    
    sql += ' ORDER BY last_seen DESC';
    
    const result = await query(sql, params);
    return result.rows;
  }
  
  static async getByTenant(tenantId) {
    const result = await query(
      'SELECT * FROM agents WHERE tenant_id = $1 ORDER BY last_seen DESC',
      [tenantId]
    );
    return result.rows;
  }
  
  static async getByStatus(status, tenantId = null) {
    let sql = 'SELECT * FROM agents WHERE status = $1';
    const params = [status];
    
    if (tenantId) {
      sql += ' AND tenant_id = $2';
      params.push(tenantId);
    }
    
    sql += ' ORDER BY last_seen DESC';
    
    const result = await query(sql, params);
    return result.rows;
  }
  
  static async delete(agentId) {
    const result = await query(
      'DELETE FROM agents WHERE id = $1 RETURNING hostname',
      [agentId]
    );
    
    if (result.rows[0]) {
      console.log(`[AGENT] Deleted: ${result.rows[0].hostname}`);
    }
    
    return result.rowCount > 0;
  }
  
  // Mark stale agents as inactive
  static async markStaleAgentsInactive(staleMinutes = 60) {
    const result = await query(
      'SELECT mark_stale_agents_inactive($1)',
      [staleMinutes]
    );
    
    const count = result.rows[0].mark_stale_agents_inactive;
    if (count > 0) {
      console.log(`[AGENT] Marked ${count} stale agents as inactive`);
    }
    
    return count;
  }
  
  // Get agents with expiring certificates
  static async getExpiringCertificates(daysThreshold = 30) {
    const result = await query(
      'SELECT * FROM get_expiring_certificates($1)',
      [daysThreshold]
    );
    return result.rows;
  }
  
  // Update last seen timestamp
  static async updateLastSeen(agentId) {
    await query(
      'SELECT update_agent_last_seen($1)',
      [agentId]
    );
  }
  
  // Reassign agent to different tenant
  static async reassignTenant(agentId, newTenantId) {
    const result = await query(
      `UPDATE agents 
       SET tenant_id = $1, updated_at = NOW() 
       WHERE id = $2 
       RETURNING *`,
      [newTenantId, agentId]
    );
    
    if (result.rows.length === 0) {
      throw new Error('Agent not found');
    }
    
    return result.rows[0];
  }
}

module.exports = AgentModel;
