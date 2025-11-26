import { useEffect, useState } from 'react';
import WorldMap from './WorldMap';

export default function Dashboard() {
  const [agents, setAgents] = useState([]);

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

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#0d1117', color: '#c9d1d9' }}>
      {/* Header */}
      <header style={{ padding: '1.5rem 2rem', background: '#161b22', borderBottom: '1px solid #30363d' }}>
        <h1 style={{ margin: 0, color: '#58a6ff', fontSize: '2.2rem' }}>
          GLA1V3 — LIVE AGENTS ({agents.length})
        </h1>
      </header>

      <div style={{ flex: 1, display: 'flex', gap: '1rem', padding: '1rem' }}>
        {/* World Map — 60% width */}
        <div style={{ flex: '0 0 60%', background: '#161b22', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.5)' }}>
          <WorldMap agents={agents} getColor={getColor} />
        </div>

        {/* Agent Table — 40% width */}
        <div style={{ flex: 1, background: '#161b22', borderRadius: '12px', padding: '1.5rem', overflow: 'auto', boxShadow: '0 4px 20px rgba(0,0,0,0.5)' }}>
          <h2 style={{ marginTop: 0, color: '#58a6ff' }}>Agent Status</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #30363d' }}>
                <th style={{ textAlign: 'left', padding: '0.8rem' }}>Status</th>
                <th style={{ textAlign: 'left', padding: '0.8rem' }}>ID</th>
                <th style={{ textAlign: 'left', padding: '0.8rem' }}>CN</th>
                <th style={{ textAlign: 'left', padding: '0.8rem' }}>Last</th>
              </tr>
            </thead>
            <tbody>
              {agents.map(a => {
                const status = getColor(a.lastSeen);
                return (
                  <tr key={a.id} style={{ borderBottom: '1px solid #30363d' }}>
                    <td style={{ padding: '0.8rem' }}>
                      <span style={{ color: status, fontWeight: 'bold' }}>●</span>
                    </td>
                    <td style={{ padding: '0.8rem', fontFamily: 'monospace' }}>{a.id}</td>
                    <td style={{ padding: '0.8rem', color: '#ff7b72' }}>{a.cn}</td>
                    <td style={{ padding: '0.8rem' }}>{new Date(a.lastSeen).toLocaleTimeString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
