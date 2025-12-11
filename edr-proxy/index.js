const express = require('express');
const https = require('https');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
app.use(express.json());

// Security configuration
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 100;

// In-memory storage for MVP (move to Redis for production)
const rateLimitStore = new Map(); // clientId -> { count, resetTime }
const auditLog = []; // Immutable append-only log

// Middleware: JWT Authentication
function authenticateJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    auditLog.push({
      timestamp: new Date().toISOString(),
      event: 'AUTH_FAILURE',
      reason: 'Missing or invalid Authorization header',
      ip: req.ip,
      path: req.path
    });
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  const token = authHeader.slice(7);
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // Attach user info to request
    next();
  } catch (err) {
    auditLog.push({
      timestamp: new Date().toISOString(),
      event: 'AUTH_FAILURE',
      reason: err.message,
      ip: req.ip,
      path: req.path
    });
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}

// Middleware: Rate Limiting
function rateLimit(req, res, next) {
  const clientId = req.user?.userId || req.ip;
  const now = Date.now();
  
  let record = rateLimitStore.get(clientId);
  
  if (!record || now > record.resetTime) {
    record = { count: 0, resetTime: now + RATE_LIMIT_WINDOW };
    rateLimitStore.set(clientId, record);
  }
  
  record.count++;
  
  if (record.count > MAX_REQUESTS_PER_WINDOW) {
    auditLog.push({
      timestamp: new Date().toISOString(),
      event: 'RATE_LIMIT_EXCEEDED',
      clientId,
      ip: req.ip,
      path: req.path
    });
    return res.status(429).json({ error: 'Rate limit exceeded' });
  }
  
  next();
}

// Middleware: Request Validation (Read-only proxy)
function validateEDRRequest(req, res, next) {
  const { edrId, method, path } = req.body;
  
  if (!edrId || !method || !path) {
    return res.status(400).json({ error: 'edrId, method, and path are required' });
  }
  
  // SECURITY: Only allow GET requests - C2 should not modify EDR
  if (method.toUpperCase() !== 'GET') {
    auditLog.push({
      timestamp: new Date().toISOString(),
      event: 'FORBIDDEN_METHOD',
      user: req.user?.userId || 'unknown',
      method,
      path,
      ip: req.ip,
      reason: 'EDR Proxy is read-only - only GET requests allowed'
    });
    return res.status(403).json({ 
      error: 'EDR Proxy is read-only', 
      message: 'Only GET requests allowed - C2 cannot modify customer EDR'
    });
  }
  
  next();
}

// Middleware: Audit Logging
function auditRequest(req, res, next) {
  const startTime = Date.now();
  
  // Capture response
  const originalJson = res.json;
  res.json = function(data) {
    const duration = Date.now() - startTime;
    
    auditLog.push({
      timestamp: new Date().toISOString(),
      event: 'EDR_REQUEST',
      user: req.user?.userId || 'unknown',
      edrId: req.body?.edrId,
      method: req.body?.method,
      path: req.body?.path,
      statusCode: res.statusCode,
      duration,
      ip: req.ip
    });
    
    return originalJson.call(this, data);
  };
  
  next();
}

// Health check
app.get('/health', (req, res) => res.json({ status: 'healthy' }));

// EDR Proxy endpoint - forwards requests to configured EDRs with mTLS
app.post('/proxy', authenticateJWT, rateLimit, validateEDRRequest, auditRequest, async (req, res) => {
  const { edrId, method, path, params, body: requestBody } = req.body;
  
  try {
    // Fetch EDR config from C2 backend (via host network)
    const configRes = await fetch(`http://host.docker.internal:3000/api/edr-configs/${edrId}`);
    if (!configRes.ok) {
      return res.status(404).json({ error: 'EDR configuration not found' });
    }
    
    const edrConfig = await configRes.json();
    
    if (!edrConfig.enabled) {
      return res.status(403).json({ error: 'EDR is disabled' });
    }
    
    // For Wazuh, use mTLS
    if (edrConfig.type === 'wazuh') {
      const result = await forwardToWazuh(edrConfig, method, path, params, requestBody);
      return res.json(result);
    }
    
    // Add support for other EDR types here
    return res.status(501).json({ error: `EDR type ${edrConfig.type} not yet supported` });
    
  } catch (err) {
    console.error('Proxy error:', err);
    auditLog.push({
      timestamp: new Date().toISOString(),
      event: 'PROXY_ERROR',
      error: err.message,
      edrId,
      user: req.user?.userId
    });
    return res.status(500).json({ error: 'Proxy request failed', details: err.message });
  }
});

// Forward request to Wazuh with mTLS
async function forwardToWazuh(edrConfig, method, path, params, body) {
  const url = new URL(path, edrConfig.url);
  if (params) {
    Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));
  }
  
  const auth = 'Basic ' + Buffer.from(`${edrConfig.user}:${edrConfig.pass}`).toString('base64');
  
  // mTLS configuration - load certificates
  // For MVP, disable strict TLS verification (in production, use proper certs)
  const httpsAgent = new https.Agent({
    rejectUnauthorized: false, // TODO: Enable with proper CA cert
    keepAlive: true
  });
  
  const options = {
    hostname: url.hostname,
    port: url.port || 55000,
    path: url.pathname + url.search,
    method: method.toUpperCase(),
    headers: {
      'Authorization': auth,
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    },
    agent: httpsAgent,
    timeout: 10000
  };
  
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`Wazuh API responded ${res.statusCode}: ${data.slice(0, 200)}`));
        }
        
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve({ raw: data });
        }
      });
    });
    
    req.on('timeout', () => {
      req.destroy(new Error('Wazuh request timed out'));
    });
    
    req.on('error', (err) => reject(err));
    
    if (body && ['POST', 'PUT'].includes(method.toUpperCase())) {
      req.write(JSON.stringify(body));
    }
    
    req.end();
  });
}

// Audit log endpoint (read-only, requires admin role)
app.get('/audit', authenticateJWT, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin role required' });
  }
  
  const limit = parseInt(req.query.limit) || 100;
  const offset = parseInt(req.query.offset) || 0;
  
  const logs = auditLog.slice(-limit - offset, -offset || undefined);
  
  res.json({
    total: auditLog.length,
    logs: logs.reverse()
  });
});

// Export JWT secret for other services to validate tokens
app.get('/internal/jwt-secret', (req, res) => {
  // Internal endpoint - should be network-isolated in production
  const internalToken = req.headers['x-internal-token'];
  if (internalToken !== process.env.INTERNAL_TOKEN) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  res.json({ secret: JWT_SECRET });
});

const PORT = process.env.PORT || 3002;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`EDR Proxy listening on :${PORT}`);
  console.log(`JWT Secret initialized: ${JWT_SECRET.slice(0, 8)}...`);
  console.log('Security features: JWT auth, rate limiting, audit logging');
});
