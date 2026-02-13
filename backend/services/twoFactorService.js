const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const pool = require('../db/connection');

class TwoFactorService {
  /**
   * Generate a new TOTP secret for a user
   * @param {string} username - Username for QR code label
   * @returns {Object} { secret, qrCode }
   */
  static async generateSecret(username) {
    const secret = speakeasy.generateSecret({
      name: `Gla1v3 C2 (${username})`,
      issuer: 'Gla1v3',
      length: 32
    });

    // Generate QR code as data URL
    const qrCode = await QRCode.toDataURL(secret.otpauth_url);

    return {
      secret: secret.base32, // Store this in database
      qrCode // Send this to frontend for display
    };
  }

  /**
   * Enable 2FA for a user
   * @param {string} userId - User ID
   * @param {string} secret - TOTP secret (base32)
   * @param {string} token - Verification token from user
   * @returns {Object} { success, backupCodes }
   */
  static async enableTwoFactor(userId, secret, token) {
    // Verify the token before enabling
    const isValid = this.verifyToken(secret, token);
    
    if (!isValid) {
      return { success: false, error: 'Invalid verification code' };
    }

    // Generate backup codes (10 codes)
    const backupCodes = this.generateBackupCodes(10);
    const hashedBackupCodes = await Promise.all(
      backupCodes.map(code => bcrypt.hash(code, 10))
    );

    // Store secret and backup codes in database
    await pool.query(
      `UPDATE users 
       SET totp_secret = $1, 
           totp_enabled = true, 
           totp_backup_codes = $2,
           totp_enabled_at = NOW(),
           updated_at = NOW()
       WHERE id = $3`,
      [secret, hashedBackupCodes, userId]
    );

    return { 
      success: true, 
      backupCodes // Return plain text codes to user ONCE
    };
  }

  /**
   * Disable 2FA for a user (requires admin or valid token)
   * @param {string} userId - User ID
   * @returns {boolean} Success status
   */
  static async disableTwoFactor(userId) {
    await pool.query(
      `UPDATE users 
       SET totp_secret = NULL, 
           totp_enabled = false, 
           totp_backup_codes = NULL,
           totp_enabled_at = NULL,
           updated_at = NOW()
       WHERE id = $1`,
      [userId]
    );

    return true;
  }

  /**
   * Verify a TOTP token
   * @param {string} secret - TOTP secret (base32)
   * @param {string} token - 6-digit token from user
   * @param {number} window - Time window tolerance (default: 1 = ±30 seconds)
   * @returns {boolean} Valid or not
   */
  static verifyToken(secret, token, window = 1) {
    return speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token,
      window // Allow ±1 time step (30 seconds before/after)
    });
  }

  /**
   * Verify a backup code and invalidate it
   * @param {string} userId - User ID
   * @param {string} code - Backup code from user
   * @returns {boolean} Valid or not
   */
  static async verifyBackupCode(userId, code) {
    const result = await pool.query(
      'SELECT totp_backup_codes FROM users WHERE id = $1',
      [userId]
    );

    if (!result.rows[0] || !result.rows[0].totp_backup_codes) {
      return false;
    }

    const hashedCodes = result.rows[0].totp_backup_codes;

    // Check each hashed code
    for (let i = 0; i < hashedCodes.length; i++) {
      const isMatch = await bcrypt.compare(code, hashedCodes[i]);
      
      if (isMatch) {
        // Remove the used backup code
        hashedCodes.splice(i, 1);
        
        await pool.query(
          'UPDATE users SET totp_backup_codes = $1, updated_at = NOW() WHERE id = $2',
          [hashedCodes, userId]
        );
        
        return true;
      }
    }

    return false;
  }

  /**
   * Generate random backup codes
   * @param {number} count - Number of codes to generate
   * @returns {string[]} Array of backup codes
   */
  static generateBackupCodes(count = 10) {
    const codes = [];
    for (let i = 0; i < count; i++) {
      // Generate 8-character alphanumeric code (XXXX-XXXX format)
      const code = crypto.randomBytes(4).toString('hex').toUpperCase();
      codes.push(`${code.slice(0, 4)}-${code.slice(4, 8)}`);
    }
    return codes;
  }

  /**
   * Check if user has 2FA enabled
   * @param {string} userId - User ID
   * @returns {boolean} 2FA enabled status
   */
  static async isTwoFactorEnabled(userId) {
    const result = await pool.query(
      'SELECT totp_enabled FROM users WHERE id = $1',
      [userId]
    );
    
    return result.rows[0]?.totp_enabled || false;
  }

  /**
   * Get user's TOTP secret for verification
   * @param {string} userId - User ID
   * @returns {string|null} TOTP secret or null
   */
  static async getUserSecret(userId) {
    const result = await pool.query(
      'SELECT totp_secret FROM users WHERE id = $1 AND totp_enabled = true',
      [userId]
    );
    
    return result.rows[0]?.totp_secret || null;
  }
}

module.exports = TwoFactorService;
