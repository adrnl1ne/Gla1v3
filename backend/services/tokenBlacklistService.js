const redisClient = require('../utils/redisClient');
const jwt = require('jsonwebtoken');
const { query } = require('../db/connection');
const CAClient = require('../utils/caClient');

class TokenBlacklistService {
  /**
   * Blacklist an agent token (revoke access)
   * @param {string} agentId - The agent ID
   * @param {string} token - The JWT token or agent identifier
   * @param {string} reason - Reason for blacklisting
   * @param {number} tenantId - The tenant ID
   * @param {number} ttl - Time to live in seconds (optional, auto-calculated from JWT)
   */
  async blacklistAgentToken(agentId, token, reason, tenantId, ttl = null) {
    try {
      // Calculate TTL from JWT expiration if not provided
      if (!ttl) {
        try {
          const decoded = jwt.decode(token);
          if (decoded && decoded.exp) {
            const now = Math.floor(Date.now() / 1000);
            ttl = decoded.exp - now;
            
            // If token already expired, no need to blacklist
            if (ttl <= 0) {
              console.log(`Token for agent ${agentId} already expired, skipping blacklist`);
              return { success: true, alreadyExpired: true };
            }
          } else {
            // Token isn't a valid JWT or has no expiration - default to 7 days
            ttl = 7 * 24 * 60 * 60;
          }
        } catch (err) {
          console.error('Error decoding token for TTL:', err);
          // Default to 7 days if we can't decode
          ttl = 7 * 24 * 60 * 60;
        }
      }

      const key = redisClient.getKey('blacklist:agent', agentId, tenantId);
      console.log(`[BLACKLIST-DEBUG] Creating Redis key: ${key} with TTL: ${ttl}s, tenantId: ${tenantId}`);
      
      const metadata = JSON.stringify({
        token: token.substring(0, 20) + '...', // Store only prefix for audit
        reason,
        blacklistedAt: new Date().toISOString(),
        expiresAt: ttl ? new Date(Date.now() + ttl * 1000).toISOString() : null
      });

      await redisClient.set(key, metadata, ttl);

      // Also add to tenant-wide blacklist set for quick lookups
      const setKey = redisClient.getKey('blacklist:set', 'agents', tenantId);
      await redisClient.sAdd(setKey, agentId);

      // Persist to database for Redis restart resilience
      const expiresAt = new Date(Date.now() + ttl * 1000);
      try {
        await query(
          `INSERT INTO agent_blacklist (agent_id, tenant_id, reason, expires_at)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT ON CONSTRAINT unique_active_blacklist
           DO UPDATE SET reason = $3, expires_at = $4, blacklisted_at = NOW()`,
          [agentId, tenantId, reason, expiresAt]
        );
        console.log(`[BLACKLIST] Persisted to database: agent ${agentId}`);
      } catch (dbErr) {
        console.error('[BLACKLIST] DB persistence failed:', dbErr.message);
      }

      // Automatically revoke certificate if agent has one
      try {
        const agentResult = await query(
          'SELECT cert_id FROM agents WHERE id = $1',
          [agentId]
        );
        
        if (agentResult.rows.length > 0 && agentResult.rows[0].cert_id) {
          const certId = agentResult.rows[0].cert_id;
          console.log(`[BLACKLIST] Revoking certificate for agent ${agentId}: ${certId}`);
          
          const revocationResult = await CAClient.revokeCertificate(certId, `Agent blacklisted: ${reason}`);
          
          if (revocationResult.success) {
            console.log(`✅ [BLACKLIST] Certificate ${certId} revoked successfully`);
          } else {
            console.warn(`⚠️  [BLACKLIST] Certificate revocation failed for ${certId}: ${revocationResult.error}`);
          }
        } else {
          console.log(`[BLACKLIST] Agent ${agentId} has no cert_id, skipping certificate revocation`);
        }
      } catch (certErr) {
        console.error(`[BLACKLIST] Certificate revocation error for agent ${agentId}:`, certErr.message);
        // Don't fail the blacklist operation if cert revocation fails
      }

      console.log(`🚫 Agent ${agentId} token blacklisted for ${ttl}s: ${reason}`);

      return { success: true, ttl, expiresAt: expiresAt.toISOString() };
    } catch (error) {
      console.error('Error blacklisting agent token:', error);
      throw error;
    }
  }

  /**
   * Check if an agent token is blacklisted
   * @param {string} agentId - The agent ID
   * @param {number} tenantId - The tenant ID
   * @returns {Promise<boolean>}
   */
  async isAgentBlacklisted(agentId, tenantId) {
    try {
      const key = redisClient.getKey('blacklist:agent', agentId, tenantId);
      console.log(`[BLACKLIST-DEBUG] Checking Redis key: ${key} (agentId: ${agentId}, tenantId: ${tenantId})`);
      const exists = await redisClient.exists(key);
      console.log(`[BLACKLIST-DEBUG] Key exists: ${exists === 1}, raw value: ${exists}`);
      return exists === 1;
    } catch (error) {
      console.error('Error checking agent blacklist:', error);
      // Fail open on Redis errors (allow access)
      return false;
    }
  }

  /**
   * Get blacklist metadata for an agent
   * @param {string} agentId - The agent ID
   * @param {number} tenantId - The tenant ID
   */
  async getBlacklistInfo(agentId, tenantId) {
    try {
      const key = redisClient.getKey('blacklist:agent', agentId, tenantId);
      const metadata = await redisClient.get(key);
      
      if (!metadata) {
        return null;
      }

      const ttl = await redisClient.ttl(key);
      const info = JSON.parse(metadata);
      
      return {
        ...info,
        remainingTTL: ttl
      };
    } catch (error) {
      console.error('Error getting blacklist info:', error);
      return null;
    }
  }

  /**
   * Remove an agent from blacklist (unrevoke)
   * @param {string} agentId - The agent ID
   * @param {number} tenantId - The tenant ID
   */
  async removeFromBlacklist(agentId, tenantId) {
    try {
      const key = redisClient.getKey('blacklist:agent', agentId, tenantId);
      await redisClient.del(key);

      // Remove from tenant-wide set
      const setKey = redisClient.getKey('blacklist:set', 'agents', tenantId);
      await redisClient.sRem(setKey, agentId);

      // Mark as revoked in database
      try {
        await query(
          `UPDATE agent_blacklist 
           SET revoked = true, revoked_at = NOW()
           WHERE agent_id = $1 AND tenant_id = $2 AND revoked = false`,
          [agentId, tenantId]
        );
        console.log(`[BLACKLIST] Marked as revoked in database: agent ${agentId}`);
      } catch (dbErr) {
        console.error('[BLACKLIST] DB revoke update failed:', dbErr.message);
      }

      console.log(`✅ Agent ${agentId} removed from blacklist`);
      return { success: true };
    } catch (error) {
      console.error('Error removing from blacklist:', error);
      throw error;
    }
  }

  /**
   * Get all blacklisted agents for a tenant
   * @param {number} tenantId - The tenant ID
   */
  async getBlacklistedAgents(tenantId) {
    try {
      const setKey = redisClient.getKey('blacklist:set', 'agents', tenantId);
      const agentIds = await redisClient.sMembers(setKey);

      const blacklistedAgents = [];
      for (const agentId of agentIds) {
        const info = await this.getBlacklistInfo(agentId, tenantId);
        if (info) {
          blacklistedAgents.push({
            agentId,
            ...info
          });
        }
      }

      return blacklistedAgents;
    } catch (error) {
      console.error('Error getting blacklisted agents:', error);
      return [];
    }
  }

  /**
   * Blacklist user session token
   * @param {string} token - The JWT token
   * @param {number} userId - The user ID
   * @param {string} reason - Reason for blacklisting
   */
  async blacklistUserToken(token, userId, reason) {
    try {
      // Decode token to get expiration
      let ttl = 24 * 60 * 60; // Default 24 hours
      try {
        const decoded = jwt.decode(token);
        if (decoded && decoded.exp) {
          const now = Math.floor(Date.now() / 1000);
          ttl = decoded.exp - now;
          
          if (ttl <= 0) {
            return { success: true, alreadyExpired: true };
          }
        }
      } catch (err) {
        console.error('Error decoding user token:', err);
      }

      // Use token hash or JTI as key if available
      const decoded = jwt.decode(token);
      const tokenId = decoded?.jti || token.substring(0, 32);
      
      const key = redisClient.getKey('blacklist:user', tokenId);
      const metadata = JSON.stringify({
        userId,
        reason,
        blacklistedAt: new Date().toISOString()
      });

      await redisClient.set(key, metadata, ttl);

      console.log(`🚫 User ${userId} token blacklisted: ${reason}`);
      return { success: true, ttl };
    } catch (error) {
      console.error('Error blacklisting user token:', error);
      throw error;
    }
  }

  /**
   * Check if a user token is blacklisted
   * @param {string} token - The JWT token
   */
  async isUserTokenBlacklisted(token) {
    try {
      const decoded = jwt.decode(token);
      const tokenId = decoded?.jti || token.substring(0, 32);
      
      const key = redisClient.getKey('blacklist:user', tokenId);
      const exists = await redisClient.exists(key);
      return exists === 1;
    } catch (error) {
      console.error('Error checking user token blacklist:', error);
      return false; // Fail open
    }
  }

  /**
   * Sync active blacklist entries from database to Redis
   * Called on startup to restore blacklist state after Redis restart
   */
  async syncFromDatabase() {
    try {
      const result = await query(
        `SELECT agent_id, tenant_id, reason, expires_at, blacklisted_at
         FROM agent_blacklist
         WHERE revoked = false AND (expires_at IS NULL OR expires_at > NOW())`,
        []
      );

      let synced = 0;
      for (const row of result.rows) {
        const ttl = row.expires_at 
          ? Math.floor((new Date(row.expires_at) - new Date()) / 1000)
          : 7 * 24 * 60 * 60;

        if (ttl > 0) {
          const key = redisClient.getKey('blacklist:agent', row.agent_id, row.tenant_id);
          const metadata = JSON.stringify({
            token: 'synced-from-db',
            reason: row.reason,
            blacklistedAt: row.blacklisted_at,
            expiresAt: row.expires_at
          });

          await redisClient.set(key, metadata, ttl);

          // Add to tenant set
          const setKey = redisClient.getKey('blacklist:set', 'agents', row.tenant_id);
          await redisClient.sAdd(setKey, row.agent_id);

          synced++;
        }
      }

      console.log(`[BLACKLIST] Synced ${synced} entries from database to Redis`);
      return { success: true, synced };
    } catch (error) {
      console.error('[BLACKLIST] Failed to sync from database:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new TokenBlacklistService();
