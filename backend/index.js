const express = require('express');
const fs = require('fs');
const https = require('https');
const tls = require('tls');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const app = express();
// Separate app for C2 mTLS (HTTPS)
const c2app = express();


// Minimal PEM CN extractor using built-in crypto
const agents = new Map();
const taskQueue = new Map(); // agentID -> [{ id, cmd, args, status, createdAt, result }]
const geoip = require('geoip-lite');

// Security configuration
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const SALT_ROUNDS = 10;

// User storage (in-memory for MVP - move to database for production)
const users = new Map();

// Initialize default admin user
(async () => {
  const adminPassword = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'admin', SALT_ROUNDS);
  users.set('admin', {
    userId: 'admin',
    username: 'admin',
    passwordHash: adminPassword,
    role: 'admin',
    createdAt: new Date().toISOString()
  });
  console.log('Default admin user initialized (username: admin)');
})();

// Session storage for tracking active sessions
const activeSessions = new Map(); // sessionId -> { userId, role, createdAt, expiresAt, certId }

// Audit log storage
const auditLog = [];

// EDR Configuration storage — in-memory for MVP (can persist to file/DB later)
// Each EDR config: { id, name, type, url, user, pass, enabled, createdAt }
const edrConfigs = new Map();

// Initialize with default Wazuh EDR from environment
// TODO: Change WAZUH_URL to HTTPS for defense in depth
// TODO: Ensure all alert queries route through EDR proxy (localhost:3002) instead of direct connection
edrConfigs.set('wazuh-default', {
  id: 'wazuh-default',
  name: 'Wazuh EDR',
  type: 'wazuh',
  url: process.env.WAZUH_URL || 'https://host.docker.internal:55000',
  user: process.env.WAZUH_USER || 'wazuh-wui',
  pass: process.env.WAZUH_PASS || 'wazuh-wui',
  enabled: true,
  createdAt: new Date().toISOString()
});
const extractCN = (pem) => {
  try {
    // Remove header/footer and newlines
    const b64 = pem.replace(/-----BEGIN CERTIFICATE-----/g, '').replace(/-----END CERTIFICATE-----/g, '').replace(/[\r\n\s]/g, '');
    const der = Buffer.from(b64, 'base64');
    const asn1 = require('asn1.js');
    // ASN.1 X.509 Certificate parser (minimal, just for subject)
    const Certificate = asn1.define('Certificate', function() {
      this.seq().obj(
        this.key('tbsCertificate').seq().obj(
          this.key('version').explicit(0).int(),
          this.key('serialNumber').int(),
          this.key('signature').seq().obj(),
          this.key('issuer').seq().obj(),
          this.key('validity').seq().obj(),
          this.key('subject').seqof(asn1.define('RDN', function() {
            this.setof(asn1.define('AttributeTypeAndValue', function() {
              this.seq().obj(
                this.key('type').objid(),
                this.key('value').any()
              );
            }));
          })),
        ),
        this.key('signatureAlgorithm').seq().obj(),
        this.key('signatureValue').bitstr()
      );
    });
    const cert = Certificate.decode(der, 'der');
    // OID for CN is 2.5.4.3
    for (const rdn of cert.tbsCertificate.subject) {
      for (const attr of rdn) {
        if (attr.type.join('.') === '2.5.4.3') {
          return attr.value.toString();
        }
      }
    }
    return 'unknown';
  } catch (e) {
    return 'parse-error';
  }
};


// Manual CORS middleware — accept dashboard host variants used in dev
app.use((req, res, next) => {
  const domain = process.env.GLA1V3_DOMAIN || 'gla1v3.local';
  const allowed = [`https://dashboard.${domain}`, `https://${domain}`];
  const origin = req.headers.origin;
  if (origin && allowed.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  } else {
    // Fallback to the dashboard host to keep dev UX working when Origin is absent
    res.header('Access-Control-Allow-Origin', allowed[0]);
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, X-Agent-ID, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json());

// Log every request
app.use((req, res, next) => {
  console.log(`\nINCOMING → ${req.method} ${req.url} on port ${req.socket.localPort}`);
  console.log('HEADERS:', req.headers);
  next();
});

app.get('/health', (req, res) => res.send('OK'));

// Middleware: JWT Authentication
function authenticateJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  const token = authHeader.slice(7);
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    
    // Check if session is still valid
    const session = activeSessions.get(decoded.sessionId);
    if (!session || new Date(session.expiresAt) < new Date()) {
      return res.status(403).json({ error: 'Session expired' });
    }
    
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}

// Middleware: Role-based access control
function requireRole(role) {
  return (req, res, next) => {
    if (req.user.role !== role && req.user.role !== 'admin') {
      return res.status(403).json({ error: `${role} role required` });
    }
    next();
  };
}

// Middleware: Audit logging
function auditAction(action) {
  return (req, res, next) => {
    const originalJson = res.json;
    res.json = function(data) {
      auditLog.push({
        timestamp: new Date().toISOString(),
        action,
        user: req.user?.userId || 'anonymous',
        ip: req.ip,
        success: res.statusCode < 400,
        statusCode: res.statusCode
      });
      return originalJson.call(this, data);
    };
    next();
  };
}

// Authentication Endpoints

// Login endpoint
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  
  const user = users.get(username);
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  
  const validPassword = await bcrypt.compare(password, user.passwordHash);
  if (!validPassword) {
    auditLog.push({
      timestamp: new Date().toISOString(),
      action: 'LOGIN_FAILED',
      username,
      ip: req.ip
    });
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  
  // Generate session
  const sessionId = crypto.randomBytes(32).toString('hex');
  const expiresIn = 3600; // 1 hour
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
  
  // Request certificate from CA service
  let certData = null;
  try {
    const caRes = await fetch('http://ca-service:3003/generate-cert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: user.userId,
        sessionId,
        role: user.role,
        ttl: expiresIn
      })
    });
    
    if (caRes.ok) {
      certData = await caRes.json();
    }
  } catch (err) {
    console.error('Failed to generate session certificate:', err);
    // Continue without cert - non-blocking
  }
  
  // Create JWT token
  const token = jwt.sign(
    {
      userId: user.userId,
      username: user.username,
      role: user.role,
      sessionId
    },
    JWT_SECRET,
    { expiresIn: `${expiresIn}s` }
  );
  
  // Store session
  activeSessions.set(sessionId, {
    userId: user.userId,
    role: user.role,
    createdAt: new Date().toISOString(),
    expiresAt,
    certId: certData?.certId
  });
  
  auditLog.push({
    timestamp: new Date().toISOString(),
    action: 'LOGIN_SUCCESS',
    user: user.userId,
    sessionId,
    ip: req.ip
  });
  
  res.json({
    token,
    user: {
      userId: user.userId,
      username: user.username,
      role: user.role
    },
    session: {
      sessionId,
      expiresAt
    },
    certificate: certData ? {
      cert: certData.cert,
      key: certData.key,
      caCert: certData.caCert,
      expiresAt: certData.expiresAt
    } : null
  });
});

// Logout endpoint
app.post('/api/auth/logout', authenticateJWT, async (req, res) => {
  const session = activeSessions.get(req.user.sessionId);
  
  // Revoke certificate if exists
  if (session?.certId) {
    try {
      await fetch('http://ca-service:3003/revoke-cert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ certId: session.certId, reason: 'User logout' })
      });
    } catch (err) {
      console.error('Failed to revoke certificate:', err);
    }
  }
  
  activeSessions.delete(req.user.sessionId);
  
  auditLog.push({
    timestamp: new Date().toISOString(),
    action: 'LOGOUT',
    user: req.user.userId,
    sessionId: req.user.sessionId
  });
  
  res.json({ message: 'Logged out successfully' });
});

// Refresh token endpoint
app.post('/api/auth/refresh', authenticateJWT, (req, res) => {
  const expiresIn = 3600;
  
  const token = jwt.sign(
    {
      userId: req.user.userId,
      username: req.user.username,
      role: req.user.role,
      sessionId: req.user.sessionId
    },
    JWT_SECRET,
    { expiresIn: `${expiresIn}s` }
  );
  
  // Extend session expiration
  const session = activeSessions.get(req.user.sessionId);
  if (session) {
    session.expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
  }
  
  res.json({ token });
});

// User management endpoints (admin only)
app.post('/api/users', authenticateJWT, requireRole('admin'), auditAction('CREATE_USER'), async (req, res) => {
  const { username, password, role } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  
  if (users.has(username)) {
    return res.status(409).json({ error: 'User already exists' });
  }
  
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const user = {
    userId: username,
    username,
    passwordHash,
    role: role || 'operator',
    createdAt: new Date().toISOString()
  };
  
  users.set(username, user);
  
  res.status(201).json({
    userId: user.userId,
    username: user.username,
    role: user.role,
    createdAt: user.createdAt
  });
});

app.get('/api/users', authenticateJWT, requireRole('admin'), (req, res) => {
  const userList = Array.from(users.values()).map(u => ({
    userId: u.userId,
    username: u.username,
    role: u.role,
    createdAt: u.createdAt
  }));
  res.json(userList);
});

// Audit log endpoint
app.get('/api/audit', authenticateJWT, requireRole('admin'), (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  const logs = auditLog.slice(-limit).reverse();
  res.json({ total: auditLog.length, logs });
});

// Only /beacon route on c2app (mTLS)
c2app.use(express.json({ limit: '8kb' }));

// Helper: basic sanitize (strip angle brackets) and truncate
const sanitize = (s, maxLen = 1024) => {
  if (!s) return '';
  let out = String(s).replace(/[<>]/g, '');
  if (out.length > maxLen) out = out.slice(0, maxLen) + '...(truncated)';
  return out;
};

// Generic EDR alert fetcher — supports multiple EDR types
async function fetchEDRAlert(edrConfig, agentId, output) {
  if (!edrConfig || !edrConfig.enabled) return null;
  
  if (edrConfig.type === 'wazuh') {
    return await fetchWazuhAlert(edrConfig, agentId, output);
  }
  // Add support for other EDR types here (e.g., CrowdStrike, SentinelOne)
  return null;
}

// Fetch Wazuh alert (non-blocking background call). Uses EDR config
async function fetchWazuhAlert(edrConfig, agentId, output) {
  try {
    const base = edrConfig.url;
    const user = edrConfig.user;
    const pass = edrConfig.pass;
    // Simple search: limit to recent alerts for the agent
    const q = encodeURIComponent(`agent.name:${agentId}`);
    const urlStr = `${base.replace(/\/$/, '')}/alerts?q=${q}&limit=1&sort=-@timestamp`;
    const auth = 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');

    console.log(`Wazuh fetch: ${urlStr} (agent=${agentId})`);

    // For MVP, disable TLS verification for Wazuh API (simplifies setup)
    // In production, use proper certificates
    const httpsAgent = new https.Agent({ 
      rejectUnauthorized: false,
      keepAlive: true 
    });

    const u = new URL(urlStr);
    const options = {
      hostname: u.hostname,
      port: u.port || 55000,
      path: u.pathname + u.search,
      method: 'GET',
      headers: { Authorization: auth, Accept: 'application/json' },
      agent: httpsAgent,
      timeout: 8000
    };

    const body = await new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            return reject(new Error(`Wazuh responded ${res.statusCode} ${res.statusMessage} - ${data.slice(0, 200)}`));
          }
          resolve(data);
        });
      });
      req.on('timeout', () => {
        req.destroy(new Error('Wazuh request timed out'));
      });
      req.on('error', (err) => reject(err));
      req.end();
    }).catch((e) => {
      // Surface useful TLS error details
      console.error('Wazuh fetch failed:', e && (e.code || e.message || e));
      return null;
    });

    if (!body) return null;

    let json = null;
    try {
      json = JSON.parse(body);
    } catch (e) {
      console.error('Wazuh response JSON parse error:', e && e.message, 'body:', body.slice(0, 1000));
      return null;
    }

    const items = json?.data?.affected_items || [];
    if (!items.length) return null;
    const it = items[0];
    return {
      description: it?.rule?.description || '',
      rule_id: it?.rule?.id || '',
      timestamp: it['@timestamp'] || ''
    };
  } catch (e) {
    console.error('Wazuh fetch error (unexpected):', e && (e.stack || e.message || e));
    return null;
  }
}



c2app.post('/beacon', (req, res) => {
  const body = req.body || {};
  const agentID = sanitize(body.agent_id || req.headers['x-agent-id'] || 'unknown', 128);
  const seq = Number(body.seq || 0);
  const output = sanitize(body.output || '', 2048);
  const errStr = sanitize(body.error || '', 1024);

  // Extract CN from Traefik's client cert header (Traefik terminates mTLS)
  let cn = 'no-cert';
  
  // Traefik's passTLSClientCert middleware creates these headers:
  // - x-forwarded-tls-client-cert-info: contains subject.CN when info.subject.commonName=true (URL-encoded)
  // - x-forwarded-tls-client-cert: contains full PEM cert when pem=true (URL-encoded)
  const certInfo = req.headers['x-forwarded-tls-client-cert-info'];
  const certPem = req.headers['x-forwarded-tls-client-cert'];
  
  if (certInfo) {
    // Decode URL-encoded header: Subject%3D%22CN%3Dagent-client%22 → Subject="CN=agent-client"
    const decoded = decodeURIComponent(certInfo);
    const match = decoded.match(/CN=([^,\]"]+)/);
    if (match) {
      cn = match[1].trim();
    }
  } else if (certPem) {
    // Fallback: extract from PEM (URL-encoded)
    const decoded = decodeURIComponent(certPem);
    const match = decoded.match(/CN=([^,]+)/);
    if (match) {
      cn = match[1].trim();
    }
  }

  const now = new Date().toISOString();
  // Prefer agent-provided publicIp when present (agent calls /whoami), else use x-forwarded-for / socket
  const providedPublic = (req.body && req.body.publicIp) ? String(req.body.publicIp).trim() : null;
  const providedLocal = (req.body && req.body.localIp) ? String(req.body.localIp).trim() : null;
  const ipHeader = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').toString();
  // Determine the IP we will use (agent-provided public IP preferred)
  const ipRaw = (providedPublic || ipHeader);
  // Normalize IPv4-mapped IPv6 addresses like ::ffff:192.168.0.1 and handle comma lists
  const ipNorm = String(ipRaw).split(',')[0].trim().replace(/^.*:/, '');
  const geo = geoip.lookup(ipNorm);

  // Verbose debug logging to help diagnose geo failures
  console.log('BEACON GEO DEBUG → agentID:', agentID);
  console.log('BEACON GEO DEBUG → raw ip header:', ipHeader);
  console.log('BEACON GEO DEBUG → provided/raw ip:', ipRaw);
  console.log('BEACON GEO DEBUG → normalized ip:', ipNorm);
  console.log('BEACON GEO DEBUG → geoip.lookup result:', geo);

  // Helper: detect private RFC1918 addresses
  const isPrivateIP = (addr) => {
    if (!addr || addr === 'unknown') return false;
    try {
      const parts = addr.split('.').map(Number);
      if (parts.length !== 4 || parts.some(isNaN)) return false;
      if (parts[0] === 10) return true;
      if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
      if (parts[0] === 192 && parts[1] === 168) return true;
      return false;
    } catch (e) {
      return false;
    }
  };

  // Deterministic fallback: hash agent id to a world coordinate (so markers are stable)
  const hashToLatLng = (s) => {
    let h = 2166136261 >>> 0; // FNV-1a 32-bit
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
      h >>>= 0;
    }
    // map to lat -60..80 and lon -180..180
    const lat = -60 + (h % 140) ;
    const lon = -180 + ((h >>> 8) % 360);
    return [lat, lon];
  };

  let agent = agents.get(agentID) || { id: agentID, cn, ip: ipNorm, firstSeen: now };
  agent.cn = cn;
  agent.ip = ipNorm;
  if (providedLocal) {
    agent.localIp = providedLocal;
  }
  if (geo && Array.isArray(geo.ll)) {
    agent.lat = geo.ll[0];
    agent.lng = geo.ll[1];
    agent.geo = { country: geo.country, region: geo.region, city: geo.city };
  }
  else {
    // If geo lookup failed, log details and provide deterministic fallback for UI
    console.warn('Geo lookup failed for IP:', ipNorm, 'isPrivate:', isPrivateIP(ipNorm));
    const [flat, flng] = hashToLatLng(agentID);
    agent.lat = flat;
    agent.lng = flng;
    agent.geo = { country: null, region: null, city: null, note: isPrivateIP(ipNorm) ? 'private-ip' : 'geo-missing' };
  }
  // Log the agent object that will be stored (useful to inspect lat/lng types)
  try {
    console.log('BEACON GEO DEBUG → final agent object before store:', JSON.stringify({ id: agentID, cn, ip: ipNorm, lat: agent.lat, lng: agent.lng, geo: agent.geo }));
  } catch (e) {
    console.log('BEACON GEO DEBUG → final agent object (stringify failed)');
  }
  agent.lastSeen = now;
  agent.beaconCount = (agent.beaconCount || 0) + 1;
  agent.lastAction = `${output}${errStr ? ' | err: ' + errStr : ''} (at ${now})`;
  agent.seq = seq;
  agent.detection = 'pending';
  agents.set(agentID, agent);

  // Background EDR check — query all enabled EDRs (do not block the response)
  (async () => {
    const enabledEDRs = Array.from(edrConfigs.values()).filter(e => e.enabled);
    const detections = [];
    
    for (const edr of enabledEDRs) {
      const alert = await fetchEDRAlert(edr, agentID, output);
      if (alert) {
        detections.push(`[${edr.name}] ${alert.description} (rule ${alert.rule_id})`);
      }
    }
    
    if (detections.length > 0) {
      agent.detection = detections.join(' | ');
    } else {
      agent.detection = 'No detection';
    }
    agents.set(agentID, agent);
  })();

  // Check for pending tasks and send them to the agent
  const tasks = taskQueue.get(agentID) || [];
  const pendingTasks = tasks.filter(t => t.status === 'pending');
  
  if (pendingTasks.length > 0) {
    // Mark tasks as sent
    pendingTasks.forEach(t => t.status = 'sent');
    taskQueue.set(agentID, tasks);
    // Return tasks in response
    return res.status(200).json({ tasks: pendingTasks.map(t => ({ id: t.id, cmd: t.cmd, args: t.args })) });
  }

  res.status(200).json({ tasks: [] });
});

// Dashboard endpoint
app.get('/api/agents', (req, res) => {
  res.json(Array.from(agents.values()));
});

// Task management endpoints
// Create a new task for an agent
app.post('/api/agents/:agentId/tasks', (req, res) => {
  const agentId = req.params.agentId;
  const { cmd, args } = req.body;
  
  if (!cmd) {
    return res.status(400).json({ error: 'cmd is required' });
  }
  
  const tasks = taskQueue.get(agentId) || [];
  const task = {
    id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    cmd,
    args: args || [],
    status: 'pending',
    createdAt: new Date().toISOString(),
    result: null
  };
  
  tasks.push(task);
  taskQueue.set(agentId, tasks);
  
  console.log(`Created task ${task.id} for agent ${agentId}: ${cmd} ${JSON.stringify(args)}`);
  res.json(task);
});

// Get tasks for an agent
app.get('/api/agents/:agentId/tasks', (req, res) => {
  const agentId = req.params.agentId;
  const tasks = taskQueue.get(agentId) || [];
  res.json(tasks);
});

// Receive task results from agent
app.post('/api/agents/:agentId/tasks/:taskId/result', (req, res) => {
  const { agentId, taskId } = req.params;
  const { result, error, status } = req.body;
  
  const tasks = taskQueue.get(agentId) || [];
  const task = tasks.find(t => t.id === taskId);
  
  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }
  
  task.status = status || 'completed';
  task.result = result;
  task.error = error;
  task.completedAt = new Date().toISOString();
  
  taskQueue.set(agentId, tasks);
  console.log(`Task ${taskId} for agent ${agentId} completed with status: ${task.status}`);
  
  res.json(task);
});

// EDR Alerts endpoint — aggregate alerts from all enabled EDRs
// Supports filtering by ?edr=<edr-id> query parameter
app.get('/api/alerts/recent', async (req, res) => {
  try {
    const { exec } = require('child_process');
    const util = require('util');
    const execPromise = util.promisify(exec);
    
    const filterEdrId = req.query.edr; // Optional filter by EDR ID
    const enabledEDRs = Array.from(edrConfigs.values())
      .filter(e => e.enabled)
      .filter(e => !filterEdrId || e.id === filterEdrId);
    
    let allAlerts = [];
    
    // For each enabled EDR, fetch alerts
    for (const edr of enabledEDRs) {
      if (edr.type === 'wazuh') {
        // Read Wazuh alerts from file (assumes alerts.json is available)
        const alertsFilePath = '/wazuh-alerts/logs/alerts/alerts.json';
        const { stdout } = await execPromise(`tail -n 100 ${alertsFilePath} 2>&1 || echo ""`).catch(() => ({ stdout: '' }));
        
        if (!stdout || !stdout.trim() || stdout.includes('Permission denied') || stdout.includes('No such file')) {
          console.log(`No Wazuh alerts accessible for ${edr.name} (file missing or permission issue)`);
          continue;
        }
        
        const lines = stdout.trim().split('\n').filter(Boolean);
        
        // Parse each line as JSON and map to frontend format
        const alerts = lines
          .map(line => {
            try {
              return JSON.parse(line);
            } catch (e) {
              return null;
            }
          })
          .filter(Boolean)
          .map(alert => ({
            edrId: edr.id,
            edrName: edr.name,
            timestamp: alert.timestamp || new Date().toISOString(),
            agent: alert.agent?.name || 'unknown',
            ruleId: alert.rule?.id || '0',
            description: alert.rule?.description || 'No description',
            level: alert.rule?.level || 0,
            mitre: {
              tactics: alert.rule?.mitre?.tactic || [],
              techniques: alert.rule?.mitre?.id || []
            }
          }));
        
        allAlerts = allAlerts.concat(alerts);
        console.log(`Fetched ${alerts.length} alerts from ${edr.name}`);
      }
      // Add support for other EDR types here
    }
    
    // Sort by timestamp descending (most recent first)
    allAlerts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    console.log(`Total alerts returned: ${allAlerts.length} (filtered by: ${filterEdrId || 'all'})`);
    res.json(allAlerts);
  } catch (err) {
    console.error('EDR alerts fetch error:', err.message);
    res.status(500).json({ error: 'Failed to fetch EDR alerts', details: err.message });
  }
});

// EDR Configuration Management Endpoints

// Get all EDR configurations
app.get('/api/edr-configs', (req, res) => {
  const configs = Array.from(edrConfigs.values()).map(c => ({
    ...c,
    pass: '***' // Don't expose passwords
  }));
  res.json(configs);
});

// Get single EDR configuration
app.get('/api/edr-configs/:id', (req, res) => {
  const config = edrConfigs.get(req.params.id);
  if (!config) {
    return res.status(404).json({ error: 'EDR configuration not found' });
  }
  res.json({ ...config, pass: '***' });
});

// Create new EDR configuration
app.post('/api/edr-configs', (req, res) => {
  const { name, type, url, user, pass, enabled } = req.body;
  
  if (!name || !type || !url) {
    return res.status(400).json({ error: 'name, type, and url are required' });
  }
  
  const id = `edr-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const config = {
    id,
    name,
    type,
    url,
    user: user || '',
    pass: pass || '',
    enabled: enabled !== false, // Default to enabled
    createdAt: new Date().toISOString()
  };
  
  edrConfigs.set(id, config);
  console.log(`Created EDR config: ${name} (${type}) at ${url}`);
  
  res.status(201).json({ ...config, pass: '***' });
});

// Update EDR configuration
app.put('/api/edr-configs/:id', (req, res) => {
  const id = req.params.id;
  const config = edrConfigs.get(id);
  
  if (!config) {
    return res.status(404).json({ error: 'EDR configuration not found' });
  }
  
  const { name, type, url, user, pass, enabled } = req.body;
  
  // Update only provided fields
  if (name !== undefined) config.name = name;
  if (type !== undefined) config.type = type;
  if (url !== undefined) config.url = url;
  if (user !== undefined) config.user = user;
  if (pass !== undefined && pass !== '***') config.pass = pass; // Only update if not masked
  if (enabled !== undefined) config.enabled = enabled;
  config.updatedAt = new Date().toISOString();
  
  edrConfigs.set(id, config);
  console.log(`Updated EDR config: ${config.name}`);
  
  res.json({ ...config, pass: '***' });
});

// Delete EDR configuration
app.delete('/api/edr-configs/:id', authenticateJWT, requireRole('admin'), (req, res) => {
  const id = req.params.id;
  const config = edrConfigs.get(id);
  
  if (!config) {
    return res.status(404).json({ error: 'EDR configuration not found' });
  }
  
  edrConfigs.delete(id);
  console.log(`Deleted EDR config: ${config.name}`);
  
  res.json({ message: 'EDR configuration deleted', id });
});

// ==================== AGENT DEPLOYMENT ====================

const { spawn } = require('child_process');
const os = require('os');

// Compile agent with custom configuration
function compileAgent(config) {
  return new Promise((resolve, reject) => {
    const { beaconInterval, c2Server } = config;
    
    // Build flags to inject configuration
    const ldflags = `-X main.BeaconInterval=${beaconInterval} -X main.C2Server=${c2Server}`;
    
    // Generate unique filename for this build
    const timestamp = Date.now();
    const outputPath = path.join(__dirname, 'agents', `gla1v3-agent-linux-${timestamp}`);
    const agentSourcePath = './cmd/agent';
    
    console.log(`[Compile] Building agent with config:`, config);
    console.log(`[Compile] Output: ${outputPath}`);
    console.log(`[Compile] Ldflags: ${ldflags}`);
    
    // Spawn go build process
    const buildEnv = { ...process.env, GOOS: 'linux', GOARCH: 'amd64' };
    const goProcess = spawn('go', ['build', '-ldflags', ldflags, '-o', outputPath, agentSourcePath], {
      cwd: '/agents-go',
      env: buildEnv
    });
    
    let stdout = '';
    let stderr = '';
    
    goProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    goProcess.stderr.on('data', (data) => {
      stderr += data.toString();
      console.log(`[Compile] ${data.toString().trim()}`);
    });
    
    goProcess.on('close', (code) => {
      if (code === 0) {
        console.log(`[Compile] Build successful: ${outputPath}`);
        resolve(outputPath);
      } else {
        console.error(`[Compile] Build failed with code ${code}`);
        console.error(`[Compile] stderr: ${stderr}`);
        reject(new Error(`Go build failed: ${stderr || 'Unknown error'}`));
      }
    });
    
    goProcess.on('error', (err) => {
      reject(new Error(`Failed to spawn go build: ${err.message}`));
    });
  });
}

// Build custom agent with embedded certificates and tasks
app.post('/api/agents/build-custom', authenticateJWT, requireRole(['admin']), auditAction('BUILD_CUSTOM_AGENT'), async (req, res) => {
  const { agentId, tasks, beaconInterval, c2Server, targetOS, targetArch } = req.body;
  const sessionId = req.user.sessionId;
  
  if (!agentId || !tasks || !Array.isArray(tasks)) {
    return res.status(400).json({ error: 'Missing required fields: agentId, tasks (array)' });
  }

  const config = {
    beaconInterval: beaconInterval || '30s',
    c2Server: c2Server || 'c2.gla1v3.local:4443',
    targetOS: targetOS || 'linux',
    targetArch: targetArch || 'amd64'
  };

  let agentBinaryPath = null;

  try {
    console.log(`[Build] Creating custom agent: ${agentId} with ${tasks.length} tasks`);
    
    // Step 1: Generate session certificates for the agent
    console.log(`[Build] Generating certificates for agent: ${agentId}`);
    const caResponse = await fetch('http://ca-service:3003/generate-cert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        userId: agentId,
        sessionId: sessionId,
        role: 'agent',
        ttl: 31536000  // 1 year for deployed agents
      })
    });

    if (!caResponse.ok) {
      const errorText = await caResponse.text();
      console.log(`[Build] CA service error response:`, errorText);
      throw new Error(`CA service returned ${caResponse.status}: ${errorText}`);
    }

    const certs = await caResponse.json();
    
    if (!certs.cert || !certs.key || !certs.caCert) {
      throw new Error('CA service did not return valid certificates');
    }

    // Step 2: Prepare embedded data (escape newlines for ldflags)
    const tasksJSON = JSON.stringify(tasks).replace(/"/g, '\\"');
    const embeddedCACert = certs.caCert.replace(/\n/g, '\\n');
    const embeddedCert = certs.cert.replace(/\n/g, '\\n');
    const embeddedKey = certs.key.replace(/\n/g, '\\n');
    
    // Step 3: Compile agent with embedded certs and tasks
    const timestamp = Date.now();
    const fileExt = config.targetOS === 'windows' ? '.exe' : '';
    const outputFilename = `gla1v3-agent-${agentId}-${timestamp}${fileExt}`;
    agentBinaryPath = path.join('/app/agents', outputFilename);
    
    // Ensure agents directory exists
    if (!fs.existsSync('/app/agents')) {
      fs.mkdirSync('/app/agents', { recursive: true });
    }

    const ldflags = [
      `-X 'main.BeaconInterval=${config.beaconInterval}'`,
      `-X 'main.C2Server=${config.c2Server}'`,
      `-X 'main.EmbeddedTasks=${tasksJSON}'`,
      `-X 'main.EmbeddedCACert=${embeddedCACert}'`,
      `-X 'main.EmbeddedCert=${embeddedCert}'`,
      `-X 'main.EmbeddedKey=${embeddedKey}'`
    ].join(' ');

    console.log(`[Build] Compiling agent for ${config.targetOS}/${config.targetArch}...`);
    
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);

    const { stdout, stderr } = await execAsync(
      `CGO_ENABLED=0 GOOS=${config.targetOS} GOARCH=${config.targetArch} go build -ldflags "${ldflags}" -o ${agentBinaryPath} /agents-go/cmd/agent`,
      { 
        cwd: '/agents-go',
        maxBuffer: 1024 * 1024 * 10 // 10MB buffer
      }
    );

    if (stderr && stderr.includes('error')) {
      throw new Error(`Go build failed: ${stderr}`);
    }

    if (!fs.existsSync(agentBinaryPath)) {
      throw new Error('Agent binary was not created');
    }

    console.log(`[Build] Agent compiled successfully: ${agentBinaryPath}`);
    
    // Step 4: Return download info
    res.json({
      success: true,
      agentId,
      downloadPath: `/api/agents/download/${outputFilename}`,
      filename: outputFilename,
      tasks: tasks.length,
      beaconInterval: config.beaconInterval,
      c2Server: config.c2Server,
      targetOS: config.targetOS,
      targetArch: config.targetArch,
      expiresAt: certs.expiresAt || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
    });

  } catch (error) {
    console.error(`[Build] Error:`, error.message);
    
    // Cleanup: Delete compiled binary on error
    if (agentBinaryPath && fs.existsSync(agentBinaryPath)) {
      fs.unlinkSync(agentBinaryPath);
      console.log(`[Build] Cleaned up temporary binary after error`);
    }
    
    res.status(500).json({ 
      error: 'Agent build failed', 
      details: error.message 
    });
  }
});

// Download compiled agent binary
app.get('/api/agents/download/:filename', authenticateJWT, (req, res) => {
  const filename = req.params.filename;
  const filepath = path.join('/app/agents', filename);
  
  // Security: prevent path traversal
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return res.status(400).json({ error: 'Invalid filename' });
  }
  
  if (!fs.existsSync(filepath)) {
    return res.status(404).json({ error: 'Agent binary not found' });
  }
  
  console.log(`[Download] Serving agent binary: ${filename}`);
  
  res.download(filepath, 'gla1v3-agent-linux', (err) => {
    if (err) {
      console.error(`[Download] Error:`, err.message);
    } else {
      // Delete file after successful download (after 60 seconds)
      setTimeout(() => {
        if (fs.existsSync(filepath)) {
          fs.unlinkSync(filepath);
          console.log(`[Download] Cleaned up binary: ${filename}`);
        }
      }, 60000);
    }
  });
});

// Receive embedded task results from agents
app.post('/api/agents/:agentId/embedded-tasks', (req, res) => {
  const { agentId } = req.params;
  const { results } = req.body;
  
  if (!results || !Array.isArray(results)) {
    return res.status(400).json({ error: 'Missing results array' });
  }
  
  console.log(`[EmbeddedTasks] Received ${results.length} task results from agent: ${agentId}`);
  
  // Store results in the agent's task queue
  if (!taskQueue.has(agentId)) {
    taskQueue.set(agentId, []);
  }
  
  const queue = taskQueue.get(agentId);
  
  for (const result of results) {
    // Store as a completed task
    queue.push({
      id: result.taskID,
      type: 'embedded',
      taskType: result.type,
      status: result.status,
      result: result.output,
      error: result.error || '',
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString()
    });
    
    console.log(`[EmbeddedTasks] Stored result for task ${result.taskID} (${result.type}): ${result.status}`);
  }
  
  res.json({ success: true, stored: results.length });
});

// Secure whoami endpoint for agents to discover their public IP
// Protected by a bearer token (set AGENT_WHOAMI_TOKEN). The request
// should be made over HTTPS to Traefik so the X-Forwarded-For header
// contains the client's public IP.
app.get('/whoami', (req, res) => {
  const token = process.env.AGENT_WHOAMI_TOKEN || 'changeme-token';
  const auth = (req.headers.authorization || '').trim();
  if (!auth || !auth.toLowerCase().startsWith('bearer ')) {
    return res.status(401).json({ error: 'missing auth' });
  }
  const got = auth.slice(7).trim();
  if (got !== token) return res.status(403).json({ error: 'forbidden' });

  // Trust Traefik's X-Forwarded-For if present, otherwise fall back to socket
  const xf = req.headers['x-forwarded-for'];
  const ips = xf ? String(xf).split(',').map(s => s.trim()).filter(Boolean) : [];
  const sourceIp = ips.length ? ips[0] : (req.socket && req.socket.remoteAddress) || null;
  return res.json({ ip: sourceIp });
});



// Start HTTP server for dashboard/API
app.listen(3000, '0.0.0.0', () => console.log('API ready on :3000'));

// Start plain HTTP server for C2 beacon on :3001
// Traefik will terminate mTLS and forward requests here
c2app.listen(3001, '0.0.0.0', () => {
  console.log('C2 server ready on :3001 (Traefik handles mTLS)');
});