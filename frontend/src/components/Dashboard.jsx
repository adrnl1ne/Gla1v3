import { useEffect, useState } from 'react';
import WorldMap from './WorldMap';
import AlertTable from './AlertTable';
import TaskPanel from './TaskPanel';
import EDRManager from './EDRManager';
import BuildAgent from './BuildAgent';
import TenantSelector from './TenantSelector';
import TenantManagement from './TenantManagement';
import UserManagement from './UserManagement';
import AgentReassignModal from './AgentReassignModal';
import AgentBlacklistModal from './modals/AgentBlacklistModal';
import BlacklistManager from './BlacklistManager';
import TwoFactorSetup from './modals/TwoFactorSetup';
import DashboardHome from './Home';
import Sidebar from './Sidebar';
import UserMenu from './UserMenu';
import UserProfile from './UserProfile';
import { useTenant } from '../context/TenantContext';

export default function Dashboard({ user, token, onLogout }) {
  const { activeTenant, refreshTenants } = useTenant();
  const [agents, setAgents] = useState([]);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [activeTab, setActiveTab] = useState('home'); // Start on home dashboard
  const [taskAgent, setTaskAgent] = useState(null);
  const [reassignAgent, setReassignAgent] = useState(null);
  const [blacklistAgent, setBlacklistAgent] = useState(null);
  const [show2FASetup, setShow2FASetup] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!activeTenant) return;

    fetchAgents();
    const interval = setInterval(fetchAgents, 5000);
    return () => clearInterval(interval);
  }, [activeTenant, token]);
  
  const fetchAgents = async () => {
    if (!activeTenant) return;
    
    try {
      const res = await fetch(`https://api.gla1v3.local/api/agents?tenant_id=${activeTenant.id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setAgents(data);
    } catch (err) {
      console.error('Failed to fetch agents:', err);
    }
  };

  const getColor = (lastSeen) => {
    const age = (Date.now() - new Date(lastSeen)) / 1000;
    if (age < 30) return '#00ff00';
    if (age < 120) return '#ffff00';
    return '#ff0000';
  };

  const [showRaw, setShowRaw] = useState(false);
  const [showMapModal, setShowMapModal] = useState(false);

  return (
    <div style={{ height: '100vh', width: '100vw', display: 'flex', background: '#0d1117', color: '#c9d1d9', margin: 0, padding: 0, position: 'fixed', top: 0, left: 0, boxSizing: 'border-box' }}>
      {/* Ghost image - fixed top left on all pages */}
      <img
        src="/assets/GHOST_MACHINE_DRIBBLE.png"
        alt="Dashboard"
        style={{
          position: 'fixed',
          top: '8px',
          bottom: '8px',
          left: '20px',
          width: '64px',
          height: '64px',
          cursor: 'pointer',
          zIndex: 1002
        }}
        onClick={() => {
          if (activeTab !== 'home') {
            setActiveTab('home');
          }
        }}
      />
      
      {/* Sidebar */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        user={user}
        isOpen={sidebarOpen}
        toggleSidebar={() => setSidebarOpen(!sidebarOpen)}
      />

      {/* Main Content Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Top Bar */}
        <header style={{
          background: '#161b22',
          borderBottom: '1px solid #30363d',
          padding: '1rem 2rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
            {activeTenant && activeTab === 'agents' && (
              <div style={{
                background: '#21262d',
                padding: '0.5rem 1rem',
                borderRadius: 6,
                fontSize: '0.9rem',
                color: '#8b949e'
              }}>
                <span style={{ color: '#6e7681' }}>Tenant:</span>{' '}
                <span style={{ color: '#58a6ff', fontWeight: '600' }}>{activeTenant.name}</span>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
            <TenantSelector />
            <UserMenu
              user={user}
              onOpenProfile={() => setShowProfile(true)}
              onOpen2FA={() => setShow2FASetup(true)}
              onLogout={onLogout}
            />
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              style={{
                background: 'transparent',
                border: '1px solid #30363d',
                color: '#c9d1d9',
                padding: '0.5rem',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: '1.2rem',
                display: 'flex',
                alignItems: 'center',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.target.style.borderColor = '#58a6ff';
                e.target.style.color = '#58a6ff';
              }}
              onMouseLeave={(e) => {
                e.target.style.borderColor = '#30363d';
                e.target.style.color = '#c9d1d9';
              }}
              title={sidebarOpen ? "Close menu" : "Open menu"}
            >
              ☰
            </button>
          </div>
        </header>

        {/* Content Panel */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          {activeTab === 'home' && <DashboardHome token={token} user={user} />}
          {activeTab === 'alerts' && (
            <div style={{ padding: '2rem' }}>
              <h2 style={{ margin: '0 0 1.5rem 0', color: '#c9d1d9' }}>🚨 EDR Alerts — Live Detections</h2>
              <AlertTable />
            </div>
          )}
          {activeTab === 'edr-config' && (
            <div style={{ padding: '2rem' }}>
              <EDRManager />
            </div>
          )}
          {activeTab === 'build' && (
            <div style={{ padding: '2rem' }}>
              <h2 style={{ margin: '0 0 1.5rem 0', color: '#c9d1d9' }}>🔨 Build Agent</h2>
              <BuildAgent />
            </div>
          )}
          {activeTab === 'tenants' && user?.role === 'admin' && (
            <div style={{ padding: '2rem' }}>
              <TenantManagement token={token} />
            </div>
          )}
          {activeTab === 'users' && user?.role === 'admin' && (
            <div style={{ padding: '2rem' }}>
              <UserManagement token={token} currentUser={user} />
            </div>
          )}
          {activeTab === 'blacklist' && user?.role === 'admin' && (
            <div style={{ padding: '2rem' }}>
              <BlacklistManager />
            </div>
          )}
          
          {activeTab === 'agents' && (
            <div style={{ padding: '2rem' }}>
              <h2 style={{ margin: '0 0 1.5rem 0', color: '#c9d1d9' }}>🤖 Agent Status</h2>
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
                          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
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
                            {user?.role === 'admin' && (
                              <>
                                <button 
                                  onClick={() => setReassignAgent(a)} 
                                  style={{ background: 'transparent', border: '1px solid #30363d', color: '#f0b429', padding: '6px 8px', borderRadius: 6, cursor: 'pointer', fontSize: '0.85rem' }}
                                >
                                  Reassign
                                </button>
                                <button 
                                  onClick={() => setBlacklistAgent(a)} 
                                  style={{ background: 'transparent', border: '1px solid #ff0000', color: '#ff0000', padding: '6px 8px', borderRadius: 6, cursor: 'pointer', fontSize: '0.85rem' }}
                                  title="Revoke agent access"
                                >
                                  🚫 Blacklist
                                </button>
                              </>
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
      </div>

      {/* Map Modal */}
      {showMapModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ width: '90vw', height: '90vh', maxWidth: '1200px', maxHeight: '80vh', background: '#0f1720', borderRadius: 12, overflow: 'hidden', boxShadow: '0 8px 48px rgba(0,0,0,0.7)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 1rem', borderBottom: '1px solid #20303a' }}>
              <div style={{ color: '#58a6ff', fontWeight: '600' }}>{selectedAgent ? `Map — ${selectedAgent.id}` : 'Global Agent Map'}</div>
              <div>
                <button onClick={() => { setShowMapModal(false); setSelectedAgent(null); }} style={{ background: 'transparent', border: '1px solid #30363d', color: '#58a6ff', padding: '6px 10px', borderRadius: 6, cursor: 'pointer' }}>Close</button>
              </div>
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
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
        <TaskPanel agent={taskAgent} token={token} onClose={() => setTaskAgent(null)} />
      )}
      
      {/* Agent Reassign Modal */}
      {reassignAgent && (
        <AgentReassignModal 
          agent={reassignAgent} 
          token={token}
          onClose={() => setReassignAgent(null)}
          onSuccess={() => {
            fetchAgents();
            refreshTenants();
          }}
        />
      )}
      
      {/* Agent Blacklist Modal */}
      {blacklistAgent && (
        <AgentBlacklistModal 
          agent={blacklistAgent}
          onClose={() => setBlacklistAgent(null)}
          onBlacklist={() => {
            fetchAgents();
          }}
        />
      )}
      
      {/* 2FA Setup Modal */}
      {show2FASetup && (
        <TwoFactorSetup
          token={token}
          onCancel={() => setShow2FASetup(false)}
          onSuccess={() => setShow2FASetup(false)}
        />
      )}

      {/* User Profile Modal */}
      {showProfile && (
        <UserProfile
          user={user}
          token={token}
          onClose={() => setShowProfile(false)}
          onSuccess={() => {
            // Optionally refresh user data or show success message
            setShowProfile(false);
          }}
        />
      )}
    </div>
  );
}
