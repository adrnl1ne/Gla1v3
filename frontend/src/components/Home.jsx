import { useState, useEffect } from 'react';
import { useTenant } from '../context/TenantContext';
import PurpleTeamTimeline from './PurpleTeamTimeline';

// Simple Pie Chart Component
function PieChart({ data, title }) {
  console.log(`[PieChart] ${title}:`, data);
  const total = data.reduce((sum, item) => sum + item.value, 0);
  
  // Handle empty data case
  if (total === 0) {
    return (
      <div style={{
        background: '#161b22',
        border: '1px solid #30363d',
        borderRadius: 12,
        padding: '1.5rem',
        overflow: 'hidden'
      }}>
        <h3 style={{
          margin: '0 0 1.5rem 0',
          color: '#c9d1d9',
          fontSize: '1.1rem',
          fontWeight: '600'
        }}>
          {title}
        </h3>

        <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
          {/* Empty Chart SVG */}
          <svg viewBox="0 0 100 100" style={{ width: 180, height: 180 }}>
            <circle cx="50" cy="50" r="45" fill="#0d1117" stroke="#30363d" strokeWidth="2" />
            <circle cx="50" cy="50" r="20" fill="#0d1117" />
          </svg>

          {/* Legend */}
          <div style={{ flex: 1 }}>
            {data.map((item, idx) => (
              <div key={idx} style={{
                display: 'flex',
                alignItems: 'center',
                marginBottom: '0.75rem',
                fontSize: '0.9rem'
              }}>
                <div style={{
                  width: 16,
                  height: 16,
                  background: '#888888',
                  borderRadius: 4,
                  marginRight: '0.75rem'
                }} />
                <div style={{ flex: 1, color: '#c9d1d9' }}>
                  {item.label}
                </div>
                <div style={{ color: '#8b949e', fontWeight: '600' }}>
                  {item.value} <span style={{ color: '#6e7681', fontSize: '0.85rem' }}>(0%)</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }
  
  let currentAngle = 0;

  const slices = data.map((item, index) => {
    const percentage = (item.value / total) * 100;
    const angle = (item.value / total) * 360;
    const startAngle = currentAngle;
    currentAngle += angle;

    // For single item or full circle, draw complete circle
    if (data.length === 1 || angle >= 359) {
      return {
        ...item,
        path: `M 50 5 A 45 45 0 1 1 49.99 5 Z`,
        color: item.color || '#888888',
        percentage: percentage.toFixed(1)
      };
    }

    // Calculate path for pie slice
    const startX = 50 + 45 * Math.cos((Math.PI / 180) * (startAngle - 90));
    const startY = 50 + 45 * Math.sin((Math.PI / 180) * (startAngle - 90));
    const endX = 50 + 45 * Math.cos((Math.PI / 180) * (startAngle + angle - 90));
    const endY = 50 + 45 * Math.sin((Math.PI / 180) * (startAngle + angle - 90));
    const largeArc = angle > 180 ? 1 : 0;

    return {
      ...item,
      path: `M 50 50 L ${startX} ${startY} A 45 45 0 ${largeArc} 1 ${endX} ${endY} Z`,
      color: item.color || '#888888',
      percentage: percentage.toFixed(1)
    };
  });

  return (
    <div style={{
      background: '#161b22',
      border: '1px solid #30363d',
      borderRadius: 12,
      padding: '1.5rem',
      overflow: 'hidden'
    }}>
      <h3 style={{
        margin: '0 0 1.5rem 0',
        color: '#c9d1d9',
        fontSize: '1.1rem',
        fontWeight: '600'
      }}>
        {title}
      </h3>

      <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
        {/* Pie Chart SVG */}
        <svg viewBox="0 0 100 100" style={{ width: 180, height: 180 }}>
          <circle cx="50" cy="50" r="45" fill="#0d1117" />
          {slices.map((slice, idx) => (
            <path
              key={idx}
              d={slice.path}
              fill={slice.color}
              stroke="#0d1117"
              strokeWidth="1"
            >
              <title>{`${slice.label}: ${slice.value} (${slice.percentage}%)`}</title>
            </path>
          ))}
          <circle cx="50" cy="50" r="20" fill="#0d1117" />
        </svg>

        {/* Legend */}
        <div style={{ flex: 1 }}>
          {slices.map((slice, idx) => (
            <div key={idx} style={{
              display: 'flex',
              alignItems: 'center',
              marginBottom: '0.75rem',
              fontSize: '0.9rem'
            }}>
              <div style={{
                width: 16,
                height: 16,
                background: slice.color,
                borderRadius: 4,
                marginRight: '0.75rem'
              }} />
              <div style={{ flex: 1, color: '#c9d1d9' }}>
                {slice.label}
              </div>
              <div style={{ color: '#8b949e', fontWeight: '600' }}>
                {slice.value} <span style={{ color: '#6e7681', fontSize: '0.85rem' }}>({slice.percentage}%)</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Home({ token, user }) {
  const { activeTenant } = useTenant();
  const [stats, setStats] = useState({
    agents: [],
    tasks: [],
    alerts: [],
    loading: true
  });

  useEffect(() => {
    if (!activeTenant) {
      setStats({ agents: [], tasks: [], alerts: [], loading: false });
      return;
    }
    
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 20000); // Reduced frequency to avoid 429 errors
    return () => clearInterval(interval);
  }, [token, activeTenant]);

  const fetchDashboardData = async () => {
    if (!activeTenant) {
      console.log('[Dashboard] No active tenant, skipping fetch');
      return;
    }
    
    try {
      const tenantId = activeTenant.id;
      console.log('[Dashboard] Fetching data for tenant:', tenantId);
      
      const [agentsRes, tasksRes, alertsRes] = await Promise.all([
        fetch(`https://api.gla1v3.local/api/agents?tenant_id=${tenantId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`https://api.gla1v3.local/api/tasks/recent?limit=100&tenant_id=${tenantId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }).catch(err => {
          console.warn('[Dashboard] Tasks fetch failed:', err);
          return { json: async () => [] };
        }),
        fetch('https://api.gla1v3.local/api/alerts/recent', {
          headers: { 'Authorization': `Bearer ${token}` }
        }).catch(err => {
          console.warn('[Dashboard] Alerts fetch failed:', err);
          return { json: async () => [] };
        })
      ]);

      // Check for rate limiting
      if (agentsRes.status === 429 || alertsRes.status === 429) {
        console.warn('[Dashboard] Rate limited, skipping this fetch cycle');
        return;
      }

      if (!agentsRes.ok) {
        throw new Error(`Agents fetch failed: ${agentsRes.status}`);
      }

      const agents = await agentsRes.json();
      const tasksData = await tasksRes.json();
      const tasks = Array.isArray(tasksData) ? tasksData : [];
      const alertsData = await alertsRes.json();
      const alerts = Array.isArray(alertsData) ? alertsData : [];

      console.log('[Dashboard] Fetched:', { 
        agents: agents.length, 
        tasks: tasks.length, 
        alerts: alerts.length,
        activeTenant: activeTenant.name 
      });

      setStats({ agents, tasks, alerts, loading: false });
    } catch (err) {
      console.error('Failed to fetch dashboard data:', err);
      setStats(prev => ({ ...prev, loading: false }));
    }
  };

  // Calculate detection effectiveness
  const getDetectionStats = () => {
    if (stats.alerts.length === 0) {
      return [
        { label: 'Detected', value: 0, color: '#1a7f37' },
        { label: 'Suspicious', value: 0, color: '#9e6a03' },
        { label: 'Evaded', value: 0, color: '#6e7681' }
      ];
    }
    
    const detected = stats.alerts.filter(a => a.level >= 10).length;
    const suspicious = stats.alerts.filter(a => a.level >= 7 && a.level < 10).length;
    const evaded = stats.alerts.filter(a => a.level < 7).length;

    return [
      { label: 'Detected', value: detected, color: '#1a7f37' },
      { label: 'Suspicious', value: suspicious, color: '#9e6a03' },
      { label: 'Evaded', value: evaded, color: '#6e7681' }
    ];
  };

  // Calculate agent status
  const getAgentStats = () => {
    if (stats.agents.length === 0) {
      return [
        { label: 'Active', value: 0, color: '#3fb950' },
        { label: 'Inactive', value: 0, color: '#d29922' },
        { label: 'Blacklisted', value: 0, color: '#f85149' }
      ];
    }
    const now = Date.now();
    
    // Separate blacklisted agents first
    const blacklisted = stats.agents.filter(a => a.is_blacklisted).length;
    const nonBlacklisted = stats.agents.filter(a => !a.is_blacklisted);
    
    // Among non-blacklisted, categorize as active or inactive
    const active = nonBlacklisted.filter(a => {
      const lastSeen = new Date(a.last_seen || a.lastSeen);
      return (now - lastSeen) / 1000 < 120;
    }).length;
    const inactive = nonBlacklisted.filter(a => {
      const lastSeen = new Date(a.last_seen || a.lastSeen);
      return (now - lastSeen) / 1000 >= 120;
    }).length;
    
    return [
      { label: 'Active', value: active, color: '#3fb950' },
      { label: 'Inactive', value: inactive, color: '#d29922' },
      { label: 'Blacklisted', value: blacklisted, color: '#f85149' }
    ];
  };

  // Calculate OS distribution
  const getOSStats = () => {
    if (stats.agents.length === 0) {
      return [
        { label: 'Linux', value: 0, color: '#1f6feb' },
        { label: 'Windows', value: 0, color: '#da3633' },
        { label: 'macOS', value: 0, color: '#8b949e' }
      ];
    }
    const osCounts = { 'Linux': 0, 'Windows': 0, 'macOS': 0, 'Other': 0 };
    const osColors = { 'Linux': '#1f6feb', 'Windows': '#da3633', 'macOS': '#8b949e', 'Other': '#9e6a03' };
    
    stats.agents.forEach(a => {
      const os = a.os || 'Unknown';
      const osType = os.toLowerCase().includes('windows') ? 'Windows' 
                   : os.toLowerCase().includes('linux') ? 'Linux'
                   : os.toLowerCase().includes('darwin') || os.toLowerCase().includes('mac') ? 'macOS'
                   : 'Other';
      osCounts[osType]++;
    });
    
    return Object.entries(osCounts)
      .filter(([label]) => label !== 'Other' || osCounts.Other > 0)
      .map(([label, value]) => ({ 
        label, 
        value, 
        color: osColors[label] || '#9e6a03' 
      }));
  };

  if (stats.loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        color: '#8b949e',
        fontSize: '1.2rem'
      }}>
        Loading dashboard...
      </div>
    );
  }

  const detectionData = getDetectionStats();
  const agentData = getAgentStats();
  const osData = getOSStats();

  console.log('[Home] Chart data:', {
    detectionData,
    agentData,
    osData,
    statsLoaded: !stats.loading,
    agentCount: stats.agents.length,
    alertCount: stats.alerts.length
  });

  return (
    <div style={{
      padding: '2rem',
      paddingRight: '2.5rem',
      height: '100%',
      overflowY: 'auto',
      position: 'relative'
    }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ margin: 0, color: '#c9d1d9', fontSize: '2.5rem', fontWeight: '700', display: 'inline-block' }}>
          GLA1V3 C2 Dashboard
        </h1>
      </div>
      <div style={{ color: '#8b949e', fontSize: '1rem', marginBottom: '1.5rem' }}>
        Real-time operational intelligence and purple team metrics
      </div>

      {/* Statistics Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap: '1.5rem',
        marginBottom: '2rem'
      }}>
        <PieChart
          title="🎯 Detection Effectiveness"
          data={detectionData}
        />
        <PieChart
          title="🤖 Agent Status"
          data={agentData}
        />
        <PieChart
          title="💻 OS Distribution"
          data={osData}
        />
      </div>

      {/* Purple Team Timeline */}
      <div style={{ marginBottom: '2rem' }}>
        <PurpleTeamTimeline token={token} />
      </div>
    </div>
  );
}

export default Home;
