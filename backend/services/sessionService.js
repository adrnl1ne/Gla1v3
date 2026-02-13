// Session Service - Redis-backed session management
const crypto = require('crypto');
const redisClient = require('../utils/redisClient');

const SESSION_PREFIX = 'session';
const SESSION_TTL = 24 * 60 * 60; // 24 hours in seconds

class SessionService {
  /**
   * Create a new session
   * @param {string} userId - User ID
   * @param {string} username - Username
   * @param {string} role - User role (admin/operator)
   * @returns {Promise<{sessionId: string, expiresAt: Date}>}
   */
  static async create(userId, username, role) {
    const sessionId = crypto.randomBytes(16).toString('hex');
    const createdAt = new Date();
    const expiresAt = new Date(Date.now() + SESSION_TTL * 1000);
    
    const sessionData = {
      userId,
      username,
      role,
      createdAt: createdAt.toISOString(),
      expiresAt: expiresAt.toISOString()
    };
    
    const key = redisClient.getKey(SESSION_PREFIX, sessionId);
    
    // Store session as JSON with TTL
    await redisClient.set(key, JSON.stringify(sessionData), SESSION_TTL);
    
    return { sessionId, expiresAt };
  }
  
  /**
   * Get session data
   * @param {string} sessionId - Session ID
   * @returns {Promise<Object|null>} Session data or null if not found
   */
  static async get(sessionId) {
    const key = redisClient.getKey(SESSION_PREFIX, sessionId);
    const data = await redisClient.get(key);
    
    if (!data) {
      return null;
    }
    
    try {
      return JSON.parse(data);
    } catch (err) {
      console.error('[Session] Failed to parse session data:', err);
      return null;
    }
  }
  
  /**
   * Validate session (check if exists and not expired)
   * @param {string} sessionId - Session ID
   * @returns {Promise<Object|null>} Session data if valid, null otherwise
   */
  static async validate(sessionId) {
    const session = await this.get(sessionId);
    
    if (!session) {
      return null;
    }
    
    // Check if expired
    const expiresAt = new Date(session.expiresAt);
    if (expiresAt < new Date()) {
      // Delete expired session
      await this.delete(sessionId);
      return null;
    }
    
    return session;
  }
  
  /**
   * Delete session (logout)
   * @param {string} sessionId - Session ID
   * @returns {Promise<boolean>} True if deleted, false if not found
   */
  static async delete(sessionId) {
    const key = redisClient.getKey(SESSION_PREFIX, sessionId);
    const result = await redisClient.del(key);
    return result > 0;
  }
  
  /**
   * Refresh session TTL (extend expiration)
   * @param {string} sessionId - Session ID
   * @param {number} ttlSeconds - New TTL in seconds (default: 24 hours)
   * @returns {Promise<boolean>} True if refreshed, false if not found
   */
  static async refresh(sessionId, ttlSeconds = SESSION_TTL) {
    const key = redisClient.getKey(SESSION_PREFIX, sessionId);
    const exists = await redisClient.exists(key);
    
    if (!exists) {
      return false;
    }
    
    // Update expiresAt in session data
    const session = await this.get(sessionId);
    if (session) {
      session.expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
      await redisClient.set(key, JSON.stringify(session), ttlSeconds);
    }
    
    return true;
  }
  
  /**
   * Get all active sessions for a user
   * @param {string} userId - User ID
   * @returns {Promise<Array>} Array of session objects
   */
  static async getUserSessions(userId) {
    // This requires scanning all session keys - expensive operation
    // Only use for admin purposes (e.g., force logout all user sessions)
    const pattern = redisClient.getKey(SESSION_PREFIX, '*');
    const sessions = [];
    
    // Note: In production, consider maintaining a user->sessions index
    // For now, we'll scan (acceptable for moderate session counts)
    const keys = await redisClient.client.keys(pattern);
    
    for (const key of keys) {
      const data = await redisClient.get(key);
      if (data) {
        try {
          const session = JSON.parse(data);
          if (session.userId === userId) {
            sessions.push({
              ...session,
              sessionId: key.split(':').pop()
            });
          }
        } catch (err) {
          console.error('[Session] Failed to parse session:', err);
        }
      }
    }
    
    return sessions;
  }
  
  /**
   * Delete all sessions for a user (force logout everywhere)
   * @param {string} userId - User ID
   * @returns {Promise<number>} Number of sessions deleted
   */
  static async deleteUserSessions(userId) {
    const sessions = await this.getUserSessions(userId);
    let count = 0;
    
    for (const session of sessions) {
      const deleted = await this.delete(session.sessionId);
      if (deleted) count++;
    }
    
    return count;
  }
  
  /**
   * Get session statistics
   * @returns {Promise<Object>} Session stats
   */
  static async getStats() {
    const pattern = redisClient.getKey(SESSION_PREFIX, '*');
    const keys = await redisClient.client.keys(pattern);
    
    const stats = {
      totalSessions: keys.length,
      sessions: []
    };
    
    for (const key of keys) {
      const ttl = await redisClient.ttl(key);
      const data = await redisClient.get(key);
      
      if (data) {
        try {
          const session = JSON.parse(data);
          stats.sessions.push({
            sessionId: key.split(':').pop(),
            userId: session.userId,
            username: session.username,
            role: session.role,
            createdAt: session.createdAt,
            expiresAt: session.expiresAt,
            ttl: ttl > 0 ? ttl : 0
          });
        } catch (err) {
          console.error('[Session] Failed to parse session:', err);
        }
      }
    }
    
    return stats;
  }
}

module.exports = SessionService;
