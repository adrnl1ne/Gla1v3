import { useEffect, useState } from 'react';

// D3FEND technique mapping for MITRE ATT&CK tactics
const d3fendLink = (technique) => `https://d3fend.mitre.org/offensive-technique/attack/${technique}`;
const mitreLink = (technique) => `https://attack.mitre.org/techniques/${technique}`;

// Detection status badge component
const DetectionBadge = ({ alert }) => {
  // Determine detection status based on alert severity and context
  // High severity (10+) = EDR detected and alerted (bad for red team)
  // Medium severity (7-9) = Suspicious activity detected
  // Low severity (<7) = Logged but not actively detected
  const getDetectionStatus = () => {
    if (alert.detectionStatus) {
      return alert.detectionStatus; // Use explicit status if provided
    }
    
    // Heuristic: High severity alerts indicate EDR detected the activity
    if (alert.level >= 10) return 'detected';
    if (alert.level >= 7) return 'suspicious';
    return 'evaded';
  };
  
  const status = getDetectionStatus();
  
  const badges = {
    detected: {
      icon: '✅',
      label: 'Detected',
      bg: '#1a7f37',
      color: '#fff',
      title: 'EDR actively detected and alerted on this activity'
    },
    suspicious: {
      icon: '⚠️',
      label: 'Suspicious',
      bg: '#9e6a03',
      color: '#fff',
      title: 'EDR flagged as suspicious but may not have blocked'
    },
    evaded: {
      icon: '❌',
      label: 'Evaded',
      bg: '#6e7681',
      color: '#fff',
      title: 'Activity logged but appears to have evaded active detection'
    },
    unknown: {
      icon: '❓',
      label: 'Unknown',
      bg: '#484f58',
      color: '#c9d1d9',
      title: 'Detection status could not be determined'
    }
  };
  
  const badge = badges[status] || badges.unknown;
  
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <span 
        style={{ 
          background: badge.bg,
          color: badge.color,
          padding: '4px 10px',
          borderRadius: 12,
          fontSize: '0.75rem',
          fontWeight: '600',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.3rem',
          whiteSpace: 'nowrap'
        }}
        title={badge.title}>
        <span style={{ fontSize: '0.9rem' }}>{badge.icon}</span>
        {badge.label}
      </span>
    </div>
  );
};

const AlertRow = ({ alert }) => {
  const levelColor = alert.level >= 10 ? '#ff4444' : alert.level >= 7 ? '#ffaa00' : '#ffff00';
  
  return (
    <tr style={{ borderBottom: '1px solid #30363d', transition: 'background 0.2s' }}
        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(88, 166, 255, 0.1)'}
        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
      <td style={{ padding: '0.8rem', fontFamily: 'monospace', fontSize: '0.85rem', color: '#8b949e' }}>
        {new Date(alert.timestamp).toLocaleTimeString()}
      </td>
      <td style={{ padding: '0.8rem' }}>
        <span style={{ 
          background: '#1f6feb', 
          color: '#fff', 
          padding: '3px 8px', 
          borderRadius: 4, 
          fontSize: '0.75rem',
          fontWeight: '600'
        }}>
          {alert.edrName || 'Unknown'}
        </span>
      </td>
      <td style={{ padding: '0.8rem', fontFamily: 'monospace', color: '#58a6ff' }}>
        {alert.agent}
      </td>
      <td style={{ padding: '0.8rem', fontWeight: 'bold', color: levelColor }}>
        Level {alert.level}
      </td>
      <td style={{ padding: '0.8rem', maxWidth: 320, wordBreak: 'break-word' }}>
        {alert.description}
      </td>
      <td style={{ padding: '0.8rem' }}>
        <DetectionBadge alert={alert} />
      </td>
      <td style={{ padding: '0.8rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {alert.mitre?.tactics?.map((tactic, i) => (
            <span key={i} style={{ 
              background: '#1f6feb', 
              color: '#fff', 
              padding: '3px 8px', 
              borderRadius: 4, 
              fontSize: '0.75rem',
              fontWeight: '500'
            }}>
              {tactic}
            </span>
          ))}
          {alert.mitre?.techniques?.map((tech, i) => (
            <a key={i} href={mitreLink(tech)} target="_blank" rel="noopener noreferrer"
               style={{ 
                 background: '#9e6a03', 
                 color: '#fff', 
                 padding: '3px 8px', 
                 borderRadius: 4, 
                 fontSize: '0.75rem',
                 textDecoration: 'none',
                 fontWeight: '500'
               }}
               onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'}
               onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}>
              {tech}
            </a>
          ))}
        </div>
      </td>
      <td style={{ padding: '0.8rem', textAlign: 'center' }}>
        {alert.mitre?.techniques?.length > 0 ? (
          <a href={d3fendLink(alert.mitre.techniques[0])} target="_blank" rel="noopener noreferrer"
             style={{ 
               background: '#7c3aed', 
               color: '#fff', 
               padding: '6px 12px', 
               borderRadius: 6, 
               textDecoration: 'none',
               fontSize: '0.8rem',
               fontWeight: '600'
             }}
             onMouseEnter={(e) => e.currentTarget.style.background = '#8b5cf6'}
             onMouseLeave={(e) => e.currentTarget.style.background = '#7c3aed'}>
            D3FEND
          </a>
        ) : (
          <span style={{ color: '#6b6f74', fontSize: '0.8rem' }}>—</span>
        )}
      </td>
    </tr>
  );
};

export default function AlertTable() {
  const [alerts, setAlerts] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [edrs, setEdrs] = useState([]);
  const [selectedEdr, setSelectedEdr] = useState('all');

  // Fetch EDR configs for filter dropdown
  useEffect(() => {
    const fetchEDRs = async () => {
      try {
        const res = await fetch('https://api.gla1v3.local/api/edr-configs');
        if (res.ok) {
          const data = await res.json();
          setEdrs(data);
        }
      } catch (err) {
        console.error('Failed to fetch EDR configs:', err);
      }
    };
    fetchEDRs();
  }, []);

  useEffect(() => {
    const fetchAlerts = async () => {
      try {
        // Build URL with optional EDR filter
        let url = 'https://api.gla1v3.local/api/alerts/recent';
        if (selectedEdr && selectedEdr !== 'all') {
          url += `?edr=${selectedEdr}`;
        }
        
        const res = await fetch(url);
        
        if (res.status === 429) {
          console.warn('[AlertTable] Rate limited, skipping this fetch cycle');
          return;
        }
        
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }
        const data = await res.json();
        setAlerts(data);
        setError(null);
        setLoading(false);
      } catch (err) {
        console.error('Failed to fetch alerts:', err);
        setError(err.message);
        setLoading(false);
      }
    };

    fetchAlerts();
    const interval = setInterval(fetchAlerts, 18000); // Reduced frequency to avoid 429 errors
    return () => clearInterval(interval);
  }, [selectedEdr]);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem', color: '#8b949e' }}>
        Loading EDR alerts...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '1rem', background: '#3d1f1f', border: '1px solid #f85149', borderRadius: 6, color: '#f85149' }}>
        <strong>Error loading alerts:</strong> {error}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* EDR Filter Dropdown */}
      <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
        <label style={{ color: '#8b949e', fontWeight: '600', fontSize: '0.9rem' }}>
          Filter by EDR:
        </label>
        <select
          value={selectedEdr}
          onChange={(e) => setSelectedEdr(e.target.value)}
          style={{
            padding: '6px 12px',
            background: '#0d1117',
            border: '1px solid #30363d',
            borderRadius: 6,
            color: '#c9d1d9',
            fontSize: '0.9rem',
            cursor: 'pointer'
          }}>
          <option value="all">All EDRs</option>
          {edrs.map((edr) => (
            <option key={edr.id} value={edr.id}>
              {edr.name} ({edr.type})
            </option>
          ))}
        </select>
        {selectedEdr !== 'all' && (
          <span style={{ color: '#58a6ff', fontSize: '0.85rem' }}>
            ({alerts.length} alerts)
          </span>
        )}
      </div>

      <div className="alert-table-container">
        <table className="alert-table">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>EDR</th>
              <th>Detection</th>
              <th>Agent</th>
              <th>Severity</th>
              <th>Description</th>
              <th>MITRE ATT&CK</th>
              <th>Mitigation</th>
            </tr>
          </thead>
          <tbody>
            {alerts.length === 0 ? (
              <tr>8
                <td colSpan="7" style={{ padding: '2rem', textAlign: 'center', color: '#8b949e' }}>
                  No alerts found. System is clean or EDR is still initializing.
                </td>
              </tr>
            ) : (
              alerts.map((alert, idx) => <AlertRow key={idx} alert={alert} />)
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
