const express = require('express');
const fs = require('fs');
const https = require('https');
const tls = require('tls');
const path = require('path');
const app = express();
// Separate app for C2 mTLS (HTTPS)
const c2app = express();


// Minimal PEM CN extractor using built-in crypto
const agents = new Map();
const geoip = require('geoip-lite');
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
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, X-Agent-ID');
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


// Only /beacon route on c2app (mTLS)
c2app.use(express.json({ limit: '8kb' }));

// Helper: basic sanitize (strip angle brackets) and truncate
const sanitize = (s, maxLen = 1024) => {
  if (!s) return '';
  let out = String(s).replace(/[<>]/g, '');
  if (out.length > maxLen) out = out.slice(0, maxLen) + '...(truncated)';
  return out;
};

// Fetch Wazuh alert (non-blocking background call). Uses env vars WAZUH_URL, WAZUH_USER, WAZUH_PASS
async function fetchWazuhAlert(agentId, output) {
  try {
    const base = process.env.WAZUH_URL || 'https://wazuh-manager:55000';
    const user = process.env.WAZUH_USER || 'wazuh';
    const pass = process.env.WAZUH_PASS || 'password';
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

  // Background Wazuh check — do not block the response
  (async () => {
    const alert = await fetchWazuhAlert(agentID, output);
    if (alert) {
      agent.detection = `Detected: ${alert.description} (rule ${alert.rule_id})`;
    } else {
      agent.detection = 'No detection';
    }
    agents.set(agentID, agent);
  })();

  res.status(200).send('OK');
});

// Dashboard endpoint
app.get('/api/agents', (req, res) => {
  res.json(Array.from(agents.values()));
});

// EDR Alerts endpoint — read Wazuh alerts from volume as root
// MVP approach: read alerts.json with elevated permissions
// This works without needing wazuh-indexer (simplified architecture)
app.get('/api/alerts/recent', async (req, res) => {
  try {
    const alertsFilePath = '/wazuh-alerts/logs/alerts/alerts.json';
    
    // Read last 100 lines from alerts.json (each line is one JSON alert)
    // Use child_process with sudo/elevated perms if needed
    const { exec } = require('child_process');
    const util = require('util');
    const execPromise = util.promisify(exec);
    
    // Try reading with cat (will work if container runs as root or file is readable)
    const { stdout } = await execPromise(`tail -n 100 ${alertsFilePath} 2>&1 || echo ""`).catch(() => ({ stdout: '' }));
    
    if (!stdout || !stdout.trim() || stdout.includes('Permission denied') || stdout.includes('No such file')) {
      console.log('No Wazuh alerts accessible yet (file missing or permission issue)');
      return res.json([]);
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
        timestamp: alert.timestamp || new Date().toISOString(),
        agent: alert.agent?.name || 'unknown',
        ruleId: alert.rule?.id || '0',
        description: alert.rule?.description || 'No description',
        level: alert.rule?.level || 0,
        mitre: {
          tactics: alert.rule?.mitre?.tactic || [],
          techniques: alert.rule?.mitre?.id || []
        }
      }))
      .reverse(); // Most recent first

    console.log(`Fetched ${alerts.length} Wazuh alerts from file`);
    res.json(alerts);
  } catch (err) {
    console.error('Wazuh alerts fetch error:', err.message);
    res.status(500).json({ error: 'Failed to fetch Wazuh alerts', details: err.message });
  }
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