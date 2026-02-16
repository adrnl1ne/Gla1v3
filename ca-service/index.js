const express = require('express');
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

const execPromise = promisify(exec);
const app = express();
app.use(express.json());

// Certificate storage
const CERT_DIR = process.env.CERT_DIR || '/certs';
const SESSION_CERT_DIR = path.join(CERT_DIR, 'sessions');
const CRL_PATH = path.join(CERT_DIR, 'crl.pem');

// Certificate Revocation List (in-memory for MVP)
const revokedCerts = new Set();

// Ensure CA exists
async function ensureCA() {
  const caKeyPath = path.join(CERT_DIR, 'ca-key.pem');
  const caCertPath = path.join(CERT_DIR, 'ca-cert.pem');
  
  try {
    await fs.access(caKeyPath);
    await fs.access(caCertPath);
    console.log('Root CA already exists');
  } catch {
    console.log('Generating root CA...');
    await execPromise(`openssl genrsa -out ${caKeyPath} 4096`);
    await execPromise(`openssl req -new -x509 -days 3650 -key ${caKeyPath} -out ${caCertPath} -subj "/CN=GLA1V3-CA/O=GLA1V3/OU=Security"`);
    console.log('Root CA generated successfully');
  }
}

// Initialize directories and CA
(async () => {
  try {
    await fs.mkdir(SESSION_CERT_DIR, { recursive: true });
    console.log('Certificate directories initialized');
    
    // Generate root CA on startup
    await ensureCA();
  } catch (err) {
    console.error('Failed to initialize CA service:', err);
    process.exit(1);
  }
})();

// Health check
app.get('/health', (req, res) => res.json({ status: 'healthy' }));

// Serve CA certificate for client setup
app.get('/ca.crt', async (req, res) => {
  try {
    const caCertPath = path.join(CERT_DIR, 'ca-cert.pem');
    const certData = await fs.readFile(caCertPath);
    res.setHeader('Content-Type', 'application/x-x509-ca-cert');
    res.setHeader('Content-Disposition', 'attachment; filename="gla1v3-ca.crt"');
    res.send(certData);
  } catch (err) {
    console.error('Failed to serve CA certificate:', err);
    res.status(500).json({ error: 'Failed to retrieve CA certificate' });
  }
});

// Generate session-based certificate
app.post('/generate-cert', async (req, res) => {
  const { userId, sessionId, role, ttl } = req.body;
  
  if (!userId || !sessionId) {
    return res.status(400).json({ error: 'userId and sessionId required' });
  }
  
  const certTTL = ttl || 3600; // Default 1 hour
  const certId = `${userId}-${sessionId}-${Date.now()}`;
  const certDir = path.join(SESSION_CERT_DIR, certId);
  
  try {
    await fs.mkdir(certDir, { recursive: true });
    
    // Generate private key
    const keyPath = path.join(certDir, 'key.pem');
    await execPromise(`openssl genrsa -out ${keyPath} 2048`);
    
    // Create certificate signing request with metadata
    const subject = `/CN=${userId}/O=GLA1V3/OU=${role || 'operator'}/serialNumber=${sessionId}`;
    const csrPath = path.join(certDir, 'csr.pem');
    await execPromise(`openssl req -new -key ${keyPath} -out ${csrPath} -subj "${subject}"`);
    
    // Sign certificate with CA
    const certPath = path.join(certDir, 'cert.pem');
    const caKeyPath = path.join(CERT_DIR, 'ca-key.pem');
    const caCertPath = path.join(CERT_DIR, 'ca-cert.pem');
    
    // Sign the certificate (CA guaranteed to exist from startup)
    await execPromise(`openssl x509 -req -in ${csrPath} -CA ${caCertPath} -CAkey ${caKeyPath} -CAcreateserial -out ${certPath} -days ${Math.ceil(certTTL / 86400)} -sha256`);
    
    // Read generated cert and key
    const cert = await fs.readFile(certPath, 'utf8');
    const key = await fs.readFile(keyPath, 'utf8');
    const caCert = await fs.readFile(caCertPath, 'utf8');
    
    // Calculate expiration
    const expiresAt = new Date(Date.now() + certTTL * 1000).toISOString();
    
    console.log(`Generated certificate for ${userId} (session: ${sessionId}, TTL: ${certTTL}s)`);
    
    res.json({
      certId,
      cert,
      key,
      caCert,
      expiresAt,
      metadata: {
        userId,
        sessionId,
        role,
        issuedAt: new Date().toISOString()
      }
    });
    
  } catch (err) {
    console.error('Certificate generation failed:', err);
    res.status(500).json({ error: 'Failed to generate certificate', details: err.message });
  }
});

// Revoke certificate
app.post('/revoke-cert', async (req, res) => {
  const { certId, reason } = req.body;
  
  if (!certId) {
    return res.status(400).json({ error: 'certId required' });
  }
  
  revokedCerts.add(certId);
  
  console.log(`Certificate revoked: ${certId} (reason: ${reason || 'unspecified'})`);
  
  // Update CRL file
  try {
    const crlData = Array.from(revokedCerts).join('\n');
    await fs.writeFile(CRL_PATH, crlData);
  } catch (err) {
    console.error('Failed to update CRL:', err);
  }
  
  res.json({ message: 'Certificate revoked', certId });
});

// Check if certificate is revoked
app.get('/check-cert/:certId', (req, res) => {
  const { certId } = req.params;
  const isRevoked = revokedCerts.has(certId);
  
  res.json({
    certId,
    isRevoked,
    status: isRevoked ? 'revoked' : 'valid'
  });
});

// Get CRL (Certificate Revocation List)
app.get('/crl', async (req, res) => {
  try {
    const crl = await fs.readFile(CRL_PATH, 'utf8').catch(() => '');
    res.type('text/plain').send(crl);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve CRL' });
  }
});

// List active certificates (for admin)
app.get('/certs', async (req, res) => {
  try {
    const sessions = await fs.readdir(SESSION_CERT_DIR);
    
    const certs = await Promise.all(sessions.map(async (certId) => {
      const certPath = path.join(SESSION_CERT_DIR, certId, 'cert.pem');
      try {
        const certPem = await fs.readFile(certPath, 'utf8');
        // Extract expiration date
        const { stdout } = await execPromise(`openssl x509 -in ${certPath} -noout -enddate`);
        const expiry = stdout.match(/notAfter=(.*)/)?.[1];
        
        return {
          certId,
          isRevoked: revokedCerts.has(certId),
          expiresAt: expiry
        };
      } catch {
        return null;
      }
    }));
    
    res.json({ certs: certs.filter(Boolean) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to list certificates' });
  }
});

// Cleanup expired certificates (runs every hour)
setInterval(async () => {
  console.log('Running certificate cleanup...');
  try {
    const sessions = await fs.readdir(SESSION_CERT_DIR);
    
    for (const certId of sessions) {
      const certPath = path.join(SESSION_CERT_DIR, certId, 'cert.pem');
      try {
        const { stdout } = await execPromise(`openssl x509 -in ${certPath} -noout -checkend 0`);
        // If command fails, cert is expired
      } catch {
        // Certificate expired, remove
        await fs.rm(path.join(SESSION_CERT_DIR, certId), { recursive: true, force: true });
        console.log(`Removed expired certificate: ${certId}`);
      }
    }
  } catch (err) {
    console.error('Cleanup error:', err);
  }
}, 3600000); // 1 hour

const PORT = process.env.PORT || 3003;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Certificate Authority listening on :${PORT}`);
  console.log(`Certificate directory: ${CERT_DIR}`);
  console.log('Features: Dynamic cert generation, auto-expiration, CRL');
});
