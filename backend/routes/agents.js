// Agent Routes
const express = require('express');
const router = express.Router();
const AgentService = require('../services/agentService');
const TaskService = require('../services/taskService');
const TaskModel = require('../models/Task');
const { config } = require('../config/env');
const { authenticateJWT, requireRole } = require('../middleware/auth');
const tokenBlacklistService = require('../services/tokenBlacklistService');
const cacheService = require('../services/cacheService');
const taskQueueService = require('../services/taskQueueService');
const CAClient = require('../utils/caClient');
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');

const execPromise = promisify(exec);

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
    const tenantAPIKey = req.headers['x-tenant-api-key'];  // Read tenant API key from header
    
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
    
    // Determine tenant ID from API key or use default
    let tenantId = null;
    if (tenantAPIKey) {
      // Check cache first
      tenantId = await cacheService.getTenantByApiKey(tenantAPIKey);
      
      if (!tenantId) {
        const TenantModel = require('../models/Tenant');
        const tenant = await TenantModel.findByApiKey(tenantAPIKey);
        if (tenant) {
          tenantId = tenant.id;
          // Cache for future lookups
          await cacheService.cacheTenantApiKey(tenantAPIKey, tenantId);
          console.log(`[BEACON] Agent ${agentData.id} identified with tenant: ${tenant.name}`);
        } else {
          console.log(`[BEACON] Invalid tenant API key provided, using default tenant`);
        }
      }
    }
    
    // Determine IP (prefer publicIp from agent, fallback to x-forwarded-for)
    const providedPublic = agentData.publicIp ? String(agentData.publicIp).trim() : null;
    const ipHeader = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString();
    const ipRaw = providedPublic || ipHeader;
    const ipNorm = String(ipRaw).split(',')[0].trim().replace(/^.*:/, '');
    agentData.ip = ipNorm;
    
    const agent = await AgentService.handleBeacon(agentData, clientCert, tenantId);
    
    // CHECK BLACKLIST - Reject if agent is compromised
    // This check must happen AFTER handleBeacon so we have agent.tenant_id
    if (agent && agent.id && agent.tenant_id) {
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
    }
    
    // Cache agent status for quick lookups
    await cacheService.cacheAgentStatus(agent.id, {
      lastSeen: agent.last_seen,
      status: agent.status,
      ip: agent.ip_address
    }, agent.tenant_id);
    
    // Get pending tasks from Redis queue (fallback to SQL if Redis fails)
    let pendingTasks = [];
    try {
      pendingTasks = await taskQueueService.getPendingTasks(agent.id, agent.tenant_id);
      if (pendingTasks.length === 0) {
        // Fallback to SQL
        pendingTasks = await TaskService.getPendingTasks(agent.id);
      }
    } catch (err) {
      console.warn('[BEACON] Redis queue unavailable, using SQL fallback:', err.message);
      pendingTasks = await TaskService.getPendingTasks(agent.id);
    }
    
    console.log(`[BEACON] Agent ${agent.id} (${agent.cn}) checked in - IP: ${agent.ip_address} - ${pendingTasks.length} pending task(s)`);
    
    res.json({
      status: 'ok',
      agentId: agent.id,
      message: 'Beacon received',
      tasks: pendingTasks
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
  
  if (!results || !Array.isArray(results)) {
    return res.status(400).json({ error: 'Missing results array' });
  }
  
  console.log(`[EmbeddedTasks] Received ${results.length} task results from agent: ${agentId}`);
  
  try {
    // Embedded tasks are run once on agent startup (sys_info, priv_check, etc.)
    // Log the results for observability
    let processedCount = 0;
    
    for (const result of results) {
      const taskType = result.type || result.taskType;
      const output = result.output || result.result || '';
      
      // Extract and log useful information
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
        console.log(`[EmbeddedTasks] Agent ${agentId} ${taskType}: ${output.substring(0, 100)}${output.length > 100 ? '...' : ''}`);
      }
      
      processedCount++;
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
    if (type === 'embedded' || taskType) {
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
    const { result, error } = req.body;
    
    const task = await TaskService.updateTaskResult(agentId, taskId, result, error);
    
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
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
