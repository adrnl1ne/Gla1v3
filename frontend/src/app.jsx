import { useEffect, useState } from 'react';

function App() {
    const [agents, setAgents] =useState([]);

    useEffect(() => {
        const fetchAgents = async () => {
            try {
                const res = await fetch('https://api.gla1v3.local/api/agents');
                const data = await res.json();
            } catch (e) {
                console.error('Failed to fecth agents', e)
            }
        };

        fetchAgents();
        const interval = setInterval(fetchAgents, 5000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div style={{ padding: '2rem', fontFamily: 'monospace', background: '#0d1117', color: '#c9d1d9', minHeight: '100vh' }}>
      <h1 style={{ color: '#58a6ff' }}>GLA1V3 — LIVE AGENTS</h1>
      <p>Beaconing agents: {agents.length}</p>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #30363d' }}>
            <th style={{ textAlign: 'left', padding: '1rem' }}>Status</th>
            <th style={{ textAlign: 'left', padding: '1rem' }}>ID</th>
            <th style={{ textAlign: 'left', padding: '1rem' }}>CN</th>
            <th style={{ textAlign: 'left', padding: '1rem' }}>IP</th>
            <th style={{ textAlign: 'left', padding: '1rem' }}>Last Seen</th>
            <th style={{ textAlign: 'left', padding: '1rem' }}>Beacons</th>
          </tr>
        </thead>
        <tbody>
          {agents.map(a => (
            <tr key={a.id} style={{ borderBottom: '1px solid #30363d' }}>
              <td style={{ padding: '1rem' }}>
                <span style={{ color: '#238636', fontWeight: 'bold' }}>● LIVE</span>
              </td>
              <td style={{ padding: '1rem' }}>{a.id}</td>
              <td style={{ padding: '1rem', color: '#f85149' }}>{a.cn}</td>
              <td style={{ padding: '1rem' }}>{a.ip}</td>
              <td style={{ padding: '1rem' }}>{a.lastSeen.split('T')[1].split('.')[0]}</td>
              <td style={{ padding: '1rem' }}>{a.beaconCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    );
}

export default App;