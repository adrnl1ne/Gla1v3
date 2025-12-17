import { useEffect, useState } from 'react';
import WorldMap from './WorldMap';
import AlertTable from './AlertTable';
import TaskPanel from './TaskPanel';
import EDRManager from './EDRManager';
import BuildAgent from './BuildAgent';

export default function Dashboard({ user, token, onLogout }) {
  const [agents, setAgents] = useState([]);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [activeTab, setActiveTab] = useState('agents'); // 'agents', 'alerts', 'edr-config', or 'build'
  const [taskAgent, setTaskAgent] = useState(null);

  useEffect(() => {
    const fetchAgents = async () => {
      try {
        const res = await fetch('https://api.gla1v3.local/api/agents');
        const data = await res.json();
        setAgents(data);
      } catch (err) {
        console.error('Failed to fetch agents:', err);
      }
    };
    fetchAgents();
    const interval = setInterval(fetchAgents, 5000);
    return () => clearInterval(interval);
  }, []);

  const getColor = (lastSeen) => {
    const age = (Date.now() - new Date(lastSeen)) / 1000;
    if (age < 30) return '#00ff00';
    if (age < 120) return '#ffff00';
    return '#ff0000';
  };

  const [showRaw, setShowRaw] = useState(false);
  const [showMapModal, setShowMapModal] = useState(false);

  return (
    <div style={{ height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column', background: '#0d1117', color: '#c9d1d9', margin: 0, padding: 0, overflow: 'hidden', position: 'fixed', top: 0, left: 0, boxSizing: 'border-box' }}>
      {/* Header */}
      <header style={{ padding: '1.5rem 2rem', background: '#161b22', borderBottom: '1px solid #30363d' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ margin: 0, color: '#58a6ff', fontSize: '2.2rem' }}>
              GLA1V3 — LIVE AGENTS ({agents.length})
            </h1>
            <div style={{ marginTop: '0.25rem', color: '#8b949e', fontSize: '0.85rem' }}>
              Logged in as <span style={{ color: '#58a6ff', fontWeight: '600' }}>{user?.username}</span>
              {user?.role && <span style={{ color: '#9e6a03', marginLeft: '0.5rem', background: '#26210c', padding: '2px 6px', borderRadius: 4 }}>
                {user.role}
              </span>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button 
              onClick={() => setActiveTab('agents')}
              style={{ 
                background: activeTab === 'agents' ? '#1f6feb' : 'transparent', 
                border: '1px solid #30363d', 
                color: activeTab === 'agents' ? '#fff' : '#58a6ff', 
                padding: '8px 16px', 
                borderRadius: 6, 
                cursor: 'pointer',
                fontWeight: '600',
                transition: 'all 0.2s'
              }}>
              Agents
            </button>
            <button 
              onClick={() => setActiveTab('alerts')}
              style={{ 
                background: activeTab === 'alerts' ? '#1f6feb' : 'transparent', 
                border: '1px solid #30363d', 
                color: activeTab === 'alerts' ? '#fff' : '#58a6ff', 
                padding: '8px 16px', 
                borderRadius: 6, 
                cursor: 'pointer',
                fontWeight: '600',
                transition: 'all 0.2s'
              }}>
              EDR Alerts
            </button>
            <button 
              onClick={() => setActiveTab('edr-config')}
              style={{ 
                background: activeTab === 'edr-config' ? '#1f6feb' : 'transparent', 
                border: '1px solid #30363d', 
                color: activeTab === 'edr-config' ? '#fff' : '#58a6ff', 
                padding: '8px 16px', 
                borderRadius: 6, 
                cursor: 'pointer',
                fontWeight: '600',
                transition: 'all 0.2s'
              }}>
              EDR Config
            </button>
            <button 
              onClick={() => setActiveTab('build')}
              style={{ 
                background: activeTab === 'build' ? '#1f6feb' : 'transparent', 
                border: '1px solid #30363d', 
                color: activeTab === 'build' ? '#fff' : '#58a6ff', 
                padding: '8px 16px', 
                borderRadius: 6, 
                cursor: 'pointer',
                fontWeight: '600',
                transition: 'all 0.2s'
              }}>
              Build Agent
            </button>
            <button 
              onClick={onLogout}
              style={{ 
                background: 'transparent', 
                border: '1px solid #da3633', 
                color: '#da3633', 
                padding: '8px 16px', 
                borderRadius: 6, 
                cursor: 'pointer',
                fontWeight: '600',
                transition: 'all 0.2s',
                marginLeft: '1rem'
              }}>
              Logout
            </button>
          </div>
        </div>
      </header>

      <div style={{ flex: 1, display: 'flex', gap: '1rem', padding: '1rem' }}>
        {/* Content area — switches between agents and alerts */}
        <div style={{ flex: 1, background: '#161b22', borderRadius: '12px', padding: '1.5rem', overflow: 'auto', boxShadow: '0 4px 20px rgba(0,0,0,0.5)' }}>
          {activeTab !== 'edr-config' && (
            <h2 style={{ marginTop: 0, color: '#58a6ff' }}>
              {activeTab === 'agents' ? 'Agent Status' : 'EDR Alerts — Live Detections'}
            </h2>
          )}
          
          {activeTab === 'alerts' && <AlertTable />}
          {activeTab === 'edr-config' && <EDRManager />}
          {activeTab === 'build' && <BuildAgent />}
          
          {activeTab === 'agents' && (
            <div>
          <div style={{ marginBottom: '0.5rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button onClick={() => setShowRaw(s => !s)} style={{ background: 'transparent', border: '1px solid #30363d', color: '#58a6ff', padding: '6px 8px', borderRadius: 6, cursor: 'pointer' }}>{showRaw ? 'Hide' : 'Show'} Raw Agents</button>
            <button onClick={() => { setSelectedAgent(null); setShowMapModal(true); }} style={{ background: 'transparent', border: '1px solid #30363d', color: '#58a6ff', padding: '6px 8px', borderRadius: 6, cursor: 'pointer' }}>Open Map</button>
          </div>
          {showRaw && (
            <pre style={{ background: '#0b1220', color: '#c9d1d9', padding: '0.75rem', borderRadius: 6, maxHeight: 200, overflow: 'auto', fontSize: '0.8rem' }}>{JSON.stringify(agents, null, 2)}</pre>
          )}
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #30363d' }}>
                <th style={{ textAlign: 'left', padding: '0.8rem' }}>Status</th>
                <th style={{ textAlign: 'left', padding: '0.8rem' }}>ID</th>
                <th style={{ textAlign: 'left', padding: '0.8rem' }}>CN</th>
                <th style={{ textAlign: 'left', padding: '0.8rem' }}>IP</th>
                <th style={{ textAlign: 'left', padding: '0.8rem' }}>Last</th>
                <th style={{ textAlign: 'left', padding: '0.8rem' }}>Last Action</th>
                <th style={{ textAlign: 'left', padding: '0.8rem' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {agents.map(a => {
                const status = getColor(a.lastSeen);
                const lat = Number(a.lat);
                const lng = Number(a.lng);
                const hasGeo = Number.isFinite(lat) && Number.isFinite(lng);
                return (
                  <tr key={a.id} style={{ borderBottom: '1px solid #30363d' }}>
                    <td style={{ padding: '0.8rem' }}>
                      <span style={{ color: status, fontWeight: 'bold' }}>●</span>
                    </td>
                    <td style={{ padding: '0.8rem', fontFamily: 'monospace' }}>{a.id}</td>
                    <td style={{ padding: '0.8rem', color: '#ff7b72' }}>{a.cn}</td>
                    <td style={{ padding: '0.8rem', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                      {a.localIp && (<div style={{ color: '#ffa657' }}>L: {a.localIp}</div>)}
                      <div style={{ color: '#79c0ff' }}>P: {a.ip}</div>
                    </td>
                    <td style={{ padding: '0.8rem' }}>{new Date(a.lastSeen).toLocaleTimeString()}</td>
                    <td style={{ padding: '0.8rem', maxWidth: 240, whiteSpace: 'normal', wordBreak: 'break-word' }}>
                      <div style={{ fontFamily: 'monospace', fontSize: '0.9rem' }}>{a.lastAction || '—'}</div>
                      <div style={{ color: '#9ae6b4', fontSize: '0.8rem', marginTop: '0.25rem' }}>{a.detection || ''} <span style={{ background: '#1f6feb', color: '#fff', padding: '2px 6px', borderRadius: 4, marginLeft: 6 }}>D3-PCA</span></div>
                      {a.geo && a.geo.note && (
                        <div style={{ color: '#f1c40f', fontSize: '0.8rem', marginTop: '0.25rem' }}>Geo note: {a.geo.note}</div>
                      )}
                    </td>
                    <td style={{ padding: '0.8rem', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                        <button 
                          onClick={() => setTaskAgent(a)} 
                          style={{ background: '#238636', border: 'none', color: '#fff', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: '0.85rem', fontWeight: '600' }}
                        >
                          Task
                        </button>
                        {hasGeo ? (
                          <button onClick={() => { setSelectedAgent(a); setShowMapModal(true); }} style={{ background: 'transparent', border: '1px solid #30363d', color: '#58a6ff', padding: '6px 8px', borderRadius: 6, cursor: 'pointer', fontSize: '0.85rem' }}>Map</button>
                        ) : (
                          <button disabled style={{ background: '#262b31', border: '1px solid #202428', color: '#6b6f74', padding: '6px 8px', borderRadius: 6, fontSize: '0.85rem' }}>No Geo</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
            </div>
          )}
        </div>

        {/* Logistics panel removed per UX request */}
      </div>

      {/* Map Modal */}
      {showMapModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ width: '90vw', height: '85vh', background: '#0f1720', borderRadius: 12, overflow: 'hidden', boxShadow: '0 8px 48px rgba(0,0,0,0.7)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 1rem', borderBottom: '1px solid #20303a' }}>
              <div style={{ color: '#58a6ff', fontWeight: '600' }}>{selectedAgent ? `Map — ${selectedAgent.id}` : 'Global Agent Map'}</div>
              <div>
                <button onClick={() => { setShowMapModal(false); setSelectedAgent(null); }} style={{ background: 'transparent', border: '1px solid #30363d', color: '#58a6ff', padding: '6px 10px', borderRadius: 6, cursor: 'pointer' }}>Close</button>
              </div>
            </div>
            <div style={{ flex: 1 }}>
              {selectedAgent ? (
                <WorldMap agent={selectedAgent} getColor={getColor} />
              ) : (
                <WorldMap agents={agents} getColor={getColor} />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Task Panel Modal */}
      {taskAgent && (
        <TaskPanel agent={taskAgent} onClose={() => setTaskAgent(null)} />
      )}
    </div>
  );
}
