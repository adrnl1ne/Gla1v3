// Wazuh Alert Indexer
// Periodically indexes Wazuh alerts from file to OpenSearch
const fs = require('fs');
const http = require('http');
const https = require('https');
const { config } = require('../config/env');

const ALERTS_FILE = '/var/ossec/logs/alerts/alerts.json';
const PROCESSED_FILE = '/tmp/wazuh_last_alert_ts';
const INDEX_INTERVAL = 10000; // 10 seconds

let indexerInterval = null;

/**
 * Index Wazuh alerts from JSON file to OpenSearch
 */
async function indexWazuhAlerts() {
  try {
    const opensearchUrl = config.opensearch.url;
    
    // Check if alerts file exists
    if (!fs.existsSync(ALERTS_FILE)) {
      return;
    }
    
    // Read the last processed timestamp
    let lastProcessedTs = '';
    if (fs.existsSync(PROCESSED_FILE)) {
      lastProcessedTs = fs.readFileSync(PROCESSED_FILE, 'utf-8').trim();
    }
    
    // Read and parse all JSON objects from the file
    const content = fs.readFileSync(ALERTS_FILE, 'utf-8');
    const alerts = parseAlertsFile(content);
    
    if (alerts.length === 0) {
      return;
    }
    
    // Filter to only new alerts (newer than the last processed timestamp)
    const newAlerts = alerts.filter(a => {
      if (!lastProcessedTs) return true;
      const alertTs = a.timestamp || '';
      return alertTs > lastProcessedTs;
    });
    
    if (newAlerts.length === 0) {
      return;
    }
    
    // Index to OpenSearch
    let indexedCount = 0;
    for (const alert of newAlerts) {
      try {
        await indexAlert(opensearchUrl, alert);
        indexedCount++;
      } catch (error) {
        console.error(`[Indexer] Failed to index alert:`, error.message);
      }
    }
    
    // Save the latest timestamp
    if (indexedCount > 0) {
      const latest = newAlerts[newAlerts.length - 1];
      fs.writeFileSync(PROCESSED_FILE, latest.timestamp || new Date().toISOString(), 'utf-8');
      console.log(`[Indexer] Indexed ${indexedCount}/${newAlerts.length} new alerts (total: ${alerts.length})`);
    }
  } catch (error) {
    console.error(`[Indexer] Error:`, error.message);
  }
}

/**
 * Parse alerts from Wazuh JSON file
 * Handles concatenated JSON objects without delimiters
 */
function parseAlertsFile(content) {
  const alerts = [];
  let buffer = '';
  let bracketCount = 0;
  
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    buffer += char;
    
    if (char === '{') bracketCount++;
    if (char === '}') {
      bracketCount--;
      
      // When we close a top-level JSON object
      if (bracketCount === 0 && buffer.trim().length > 0) {
        try {
          const jsonStr = buffer.trim();
          if (jsonStr.startsWith('{') && jsonStr.endsWith('}')) {
            const alert = JSON.parse(jsonStr);
            alerts.push(alert);
          }
        } catch (e) {
          console.error('[Indexer] JSON parse error:', e.message);
        }
        buffer = '';
      }
    }
  }
  
  return alerts;
}

/**
 * Index a single alert to OpenSearch
 */
async function indexAlert(opensearchUrl, alert) {
  const timestamp = alert.timestamp || new Date().toISOString();
  const dateStr = timestamp.split('T')[0];
  const indexName = `wazuh-alerts-${dateStr}`;
  const docId = alert.id || `${Date.now()}-${Math.random()}`;
  
  const indexUrl = `${opensearchUrl}/${indexName}/_doc/${docId}`;
  
  return new Promise((resolve, reject) => {
    const protocol = indexUrl.startsWith('https') ? https : http;
    const parsedUrl = new URL(indexUrl);
    
    const data = JSON.stringify(alert);
    const options = {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      },
      rejectUnauthorized: false // Accept self-signed certificates
    };
    
    const req = protocol.request(parsedUrl, options, (res) => {
      let responseData = '';
      res.on('data', chunk => responseData += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve();
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${responseData.slice(0, 200)}`));
        }
      });
    });
    
    req.on('error', reject);
    req.setTimeout(5000);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    req.write(data);
    req.end();
  });
}

/**
 * Start the indexer (runs periodically)
 */
function startIndexer() {
  if (indexerInterval) {
    console.log('[Indexer] Already running');
    return;
  }
  
  console.log('[Indexer] Starting Wazuh alert indexer');
  
  // Run once immediately after a short delay
  setTimeout(() => {
    indexWazuhAlerts().catch(err => console.error('[Indexer] Init error:', err));
  }, 3000);
  
  // Then run periodically
  indexerInterval = setInterval(() => {
    indexWazuhAlerts().catch(err => console.error('[Indexer] Error:', err));
  }, INDEX_INTERVAL);
}

/**
 * Stop the indexer
 */
function stopIndexer() {
  if (indexerInterval) {
    clearInterval(indexerInterval);
    indexerInterval = null;
    console.log('[Indexer] Stopped');
  }
}

module.exports = {
  startIndexer,
  stopIndexer,
  indexWazuhAlerts
};
