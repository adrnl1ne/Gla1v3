// CA Service Client - HTTP client for Certificate Authority service
const crypto = require('crypto');

const CA_SERVICE_URL = process.env.CA_SERVICE_URL || 'http://ca-service:3003';

class CAClient {
  /**
   * Revoke a certificate by cert ID
   * @param {string} certId - Certificate ID to revoke
   * @param {string} reason - Revocation reason (e.g., 'agent_blacklisted')
   * @returns {Promise<Object>} Revocation response
   */
  static async revokeCertificate(certId, reason = 'unspecified') {
    try {
      const response = await fetch(`${CA_SERVICE_URL}/revoke-cert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ certId, reason })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to revoke certificate');
      }

      const data = await response.json();
      console.log(`[CA] Certificate revoked: ${certId} (reason: ${reason})`);
      return data;
    } catch (err) {
      console.error(`[CA] Failed to revoke certificate ${certId}:`, err);
      throw err;
    }
  }

  /**
   * Check if a certificate is revoked
   * @param {string} certId - Certificate ID to check
   * @returns {Promise<boolean>} True if revoked, false otherwise
   */
  static async checkCertificateStatus(certId) {
    try {
      const response = await fetch(`${CA_SERVICE_URL}/check-cert/${certId}`);
      
      if (!response.ok) {
        throw new Error('Failed to check certificate status');
      }

      const data = await response.json();
      return data.isRevoked;
    } catch (err) {
      console.error(`[CA] Failed to check certificate ${certId}:`, err);
      return false;
    }
  }

  /**
   * Generate a new certificate
   * @param {Object} params - Certificate parameters
   * @param {string} params.userId - User ID
   * @param {string} params.sessionId - Session ID
   * @param {string} params.role - User role
   * @param {number} params.ttl - Time to live in seconds
   * @returns {Promise<Object>} Certificate data
   */
  static async generateCertificate({ userId, sessionId, role, ttl }) {
    try {
      const response = await fetch(`${CA_SERVICE_URL}/generate-cert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, sessionId, role, ttl })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate certificate');
      }

      const data = await response.json();
      console.log(`[CA] Certificate generated: ${data.certId}`);
      return data;
    } catch (err) {
      console.error('[CA] Failed to generate certificate:', err);
      throw err;
    }
  }

  /**
   * List all certificates (admin only)
   * @returns {Promise<Array>} List of certificates
   */
  static async listCertificates() {
    try {
      const response = await fetch(`${CA_SERVICE_URL}/certs`);
      
      if (!response.ok) {
        throw new Error('Failed to list certificates');
      }

      const data = await response.json();
      return data.certs;
    } catch (err) {
      console.error('[CA] Failed to list certificates:', err);
      throw err;
    }
  }

  /**
   * Get Certificate Revocation List (CRL)
   * @returns {Promise<string>} CRL in text format
   */
  static async getCRL() {
    try {
      const response = await fetch(`${CA_SERVICE_URL}/crl`);
      
      if (!response.ok) {
        throw new Error('Failed to retrieve CRL');
      }

      return await response.text();
    } catch (err) {
      console.error('[CA] Failed to get CRL:', err);
      throw err;
    }
  }
}

module.exports = CAClient;
