import { useState, useEffect } from 'react';
import { useTenant } from '../context/TenantContext';
import PurpleTeamTimeline from './PurpleTeamTimeline';

// Simple test version to isolate the issue
function SimpleChart({ title, data }) {
  console.log(`[${title}] Rendering with data:`, data);
  
  if (!data || data.length === 0) {
    return (
      <div style={{ 
        border: '1px solid red', 
        padding: '1rem', 
        background: '#161b22',
        borderRadius: '8px',
        color: 'white'
      }}>
        <h3>{title}</h3>
        <p>No data available</p>
      </div>
    );
  }

  return (
    <div style={{ 
      border: '1px solid green', 
      padding: '1rem', 
      background: '#161b22',
      borderRadius: '8px',
      color: 'white'
    }}>
      <h3>{title}</h3>
      <div>
        {data.map((item, idx) => (
          <div key={idx} style={{ marginBottom: '8px' }}>
            <strong>{item.label}:</strong> {item.value}
            {item.color && <span style={{ 
              display: 'inline-block', 
              width: '12px', 
              height: '12px', 
              backgroundColor: item.color, 
              marginLeft: '8px' 
            }}></span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function TestHome({ token, user }) {
  const { activeTenant } = useTenant();
  const [stats, setStats] = useState({
    agents: [],
    tasks: [],
    alerts: [],
    loading: true
  });

  useEffect(() => {
    if (!activeTenant) {
      console.log('[TestHome] No active tenant, skipping fetch');
      setStats({ agents: [], tasks: [], alerts: [], loading: false });
      return;
    }
    
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 10000);
    return () => clearInterval(interval);
  }, [token, activeTenant]);

  const fetchDashboardData = async () => {
    if (!activeTenant) return;
    
    try {
      console.log('[TestHome] Fetching data for tenant:', activeTenant.id);
      
      const agentsRes = await fetch(`https://api.gla1v3.local/api/agents?tenant_id=${activeTenant.id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!agentsRes.ok) {
        throw new Error(`Agents fetch failed: ${agentsRes.status}`);
      }

      const agents = await agentsRes.json();
      console.log('[TestHome] Raw agents data:', agents);

      // Simple hardcoded data for testing
      const testData = {
        agents: agents,
        tasks: [],
        alerts: [],
        loading: false
      };

      console.log('[TestHome] Setting stats to:', testData);
      setStats(testData);
    } catch (err) {
      console.error('[TestHome] Fetch failed:', err);
      setStats(prev => ({ ...prev, loading: false }));
    }
  };

  const getAgentStats = () => {
    console.log('[TestHome] Processing agent stats, agents:', stats.agents);
    
    if (!stats.agents || stats.agents.length === 0) {
      return [{ label: 'No Agents', value: 1, color: '#ff0000' }];
    }

    // Simple logic for testing
    const blacklisted = stats.agents.filter(a => a.is_blacklisted).length;
    const total = stats.agents.length;
    const nonBlacklisted = total - blacklisted;

    const result = [];
    if (nonBlacklisted > 0) {
      result.push({ label: 'Normal', value: nonBlacklisted, color: '#00ff00' });
    }
    if (blacklisted > 0) {
      result.push({ label: 'Blacklisted', value: blacklisted, color: '#ff0000' });
    }

    console.log('[TestHome] Agent stats result:', result);
    return result;
  };

  const getOSStats = () => {
    console.log('[TestHome] Processing OS stats, agents:', stats.agents);
    
    if (!stats.agents || stats.agents.length === 0) {
      return [{ label: 'No Data', value: 1, color: '#888888' }];
    }

    const osCounts = {};
    stats.agents.forEach(agent => {
      const os = agent.os || 'Unknown';
      osCounts[os] = (osCounts[os] || 0) + 1;
    });

    const result = Object.entries(osCounts).map(([label, value]) => ({
      label,
      value,
      color: label === 'linux' ? '#0066ff' : '#ff6600'
    }));

    console.log('[TestHome] OS stats result:', result);
    return result;
  };

  if (stats.loading) {
    return <div style={{ color: 'white', padding: '2rem' }}>Loading...</div>;
  }

  console.log('[TestHome] Rendering with stats:', stats);
  
  const agentData = getAgentStats();
  const osData = getOSStats();

  return (
    <div style={{ padding: '2rem', color: 'white' }}>
      <h1>Test Dashboard</h1>
      <p>Tenant: {activeTenant?.name || 'None'}</p>
      <p>Agents loaded: {stats.agents?.length || 0}</p>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <SimpleChart title="Agent Status" data={agentData} />
        <SimpleChart title="OS Distribution" data={osData} />
      </div>
    </div>
  );
}

export default TestHome;