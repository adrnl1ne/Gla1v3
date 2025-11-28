import { useEffect, useState } from 'react';
import Splash from './components/Splash';

function Dashboard() {
  const [agents, setAgents] = useState([]);
  const [search, setSearch] = useState('');

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

  const filtered = agents.filter(a =>
    a.id.toLowerCase().includes(search.toLowerCase()) ||
    a.cn.toLowerCase().includes(search.toLowerCase())
  );

  const getStatus = (lastSeen) => {
    const age = (Date.now() - new Date(lastSeen)) / 1000;
    if (age < 30) return { color: '#00ff00', text: '● LIVE' };
    if (age < 120) return { color: '#ffff00', text: '● STALE' };
    return { color: '#ff0000', text: '● DEAD' };
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0d1117',
      color: '#c9d1d9',
      fontFamily: '"Fira Code", monospace',
      padding: '2rem'
    }}>
      <header style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '2rem',
        paddingBottom: '1rem',
        borderBottom: '2px solid #30363d'
      }}>
        <h1 style={{ margin: 0, color: '#58a6ff', fontSize: '2.5rem' }}>
          GLA1V3 — LIVE AGENTS ({filtered.length})
        </h1>
        <input
          type="text"
          placeholder="Search by ID or CN..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            padding: '0.8rem 1.2rem',
            background: '#161b22',
            border: '1px solid #30363d',
            borderRadius: '6px',
            color: '#c9d1d9',
            fontSize: '1rem',
            width: '300px'
          }}
        />
      </header>

      <div style={{
        background: '#161b22',
        borderRadius: '12px',
        overflow: 'hidden',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)'
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#21262d' }}>
              <th style={{ padding: '1.2rem', textAlign: 'left' }}>Status</th>
              <th style={{ padding: '1.2rem', textAlign: 'left' }}>Agent ID</th>
              <th style={{ padding: '1.2rem', textAlign: 'left' }}>Certificate CN</th>
              <th style={{ padding: '1.2rem', textAlign: 'left' }}>IP Address</th>
              <th style={{ padding: '1.2rem', textAlign: 'left' }}>Last Beacon</th>
              <th style={{ padding: '1.2rem', textAlign: 'left' }}>Total Beacons</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(agent => {
              const status = getStatus(agent.lastSeen);
              return (
                <tr key={agent.id} style={{
                  borderBottom: '1px solid #30363d',
                  transition: 'background 0.2s'
                }}>
                  <td style={{ padding: '1rem' }}>
                    <span style={{ color: status.color, fontWeight: 'bold' }}>
                      {status.text}
                    </span>
                  </td>
                  <td style={{ padding: '1rem', fontFamily: 'monospace' }}>{agent.id}</td>
                  <td style={{ padding: '1rem', color: '#ff7b72' }}>{agent.cn}</td>
                  <td style={{ padding: '1rem' }}>{agent.ip}</td>
                  <td style={{ padding: '1rem' }}>
                    {new Date(agent.lastSeen).toLocaleTimeString()}
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'center' }}>
                    {agent.beaconCount}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan="6" style={{
                  padding: '3rem',
                  textAlign: 'center',
                  color: '#8b949e',
                  fontSize: '1.2rem'
                }}>
                  No active agents — waiting for beacons...
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function App() {
  const [showSplash, setShowSplash] = useState(true);

  if (showSplash) {
    return <Splash onEnter={() => setShowSplash(false)} />;
  }

  return <Dashboard />;
}

export default App;