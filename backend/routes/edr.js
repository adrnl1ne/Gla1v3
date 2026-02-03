// EDR Routes
const express = require('express');
const router = express.Router();
const EDRService = require('../services/edrService');
const { authenticateJWT, requireRole } = require('../middleware/auth');
const { auditAction } = require('../middleware/audit');

// Get recent alerts
router.get('/alerts/recent', async (req, res) => {
  try {
    const edrId = req.query.edr;
    const alerts = await EDRService.fetchAlerts(edrId);
    res.json(alerts);
  } catch (err) {
    console.error('Alert fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
});

// List EDR configurations
router.get('/edr-configs', (req, res) => {
  const configs = EDRService.getAllConfigs();
  res.json(configs);
});

// Get single EDR config
router.get('/edr-configs/:id', (req, res) => {
  const config = EDRService.getConfig(req.params.id);
  if (!config) {
    return res.status(404).json({ error: 'EDR config not found' });
  }
  res.json({ ...config, pass: config.pass ? '***' : '' });
});

// Create EDR config (admin only)
router.post('/edr-configs', authenticateJWT, requireRole('admin'), auditAction('create_edr'), (req, res) => {
  try {
    const config = EDRService.createConfig(req.body);
    res.status(201).json(config);
  } catch (err) {
    console.error('EDR config creation error:', err);
    res.status(500).json({ error: 'Failed to create EDR config' });
  }
});

// Update EDR config (admin only)
router.put('/edr-configs/:id', authenticateJWT, requireRole('admin'), auditAction('update_edr'), (req, res) => {
  try {
    const config = EDRService.updateConfig(req.params.id, req.body);
    if (!config) {
      return res.status(404).json({ error: 'EDR config not found' });
    }
    res.json(config);
  } catch (err) {
    console.error('EDR config update error:', err);
    res.status(500).json({ error: 'Failed to update EDR config' });
  }
});

// Delete EDR config (admin only)
router.delete('/edr-configs/:id', authenticateJWT, requireRole('admin'), auditAction('delete_edr'), (req, res) => {
  const deleted = EDRService.deleteConfig(req.params.id);
  if (!deleted) {
    return res.status(404).json({ error: 'EDR config not found' });
  }
  res.json({ message: 'EDR config deleted' });
});

module.exports = router;
