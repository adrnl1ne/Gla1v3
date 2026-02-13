import { useState, useEffect } from 'react';

export default function PurpleTeamTimeline({ token }) {
  const [timelineData, setTimelineData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [agents, setAgents] = useState([]);

  useEffect(() => {
    fetchAgents();
  }, []);

  useEffect(() => {
    if (selectedAgent) {
      fetchTimelineData();
    }
  }, [selectedAgent]);

  const fetchAgents = async () => {
    try {
      const res = await fetch('https://api.gla1v3.local/api/agents', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setAgents(data);
      if (data.length > 0) {
        setSelectedAgent(data[0].id);
      } else {
        setLoading(false);
      }
    } catch (err) {
      console.error('Failed to fetch agents:', err);
      setLoading(false);
    }
  };

  const fetchTimelineData = async () => {
    if (!selectedAgent) return;
    
    setLoading(true);
    try {
      // Fetch tasks and alerts in parallel
      const [tasksRes, alertsRes] = await Promise.all([
        fetch(`https://api.gla1v3.local/api/tasks/${selectedAgent}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch('https://api.gla1v3.local/api/alerts/recent', {
          headers: { 'Authorization': `Bearer ${token}` }
        })
      ]);

      const tasks = await tasksRes.json();
      const allAlerts = await alertsRes.json();
      
      // Filter alerts for this agent
      const alerts = allAlerts.filter(a => a.agent === selectedAgent);

      // Build unified timeline with correlation
      const timeline = [];

      // Add tasks (only completed ones with execution timestamps)
      tasks.forEach(task => {
        if (task.executed_at) {
          const executedTime = new Date(task.executed_at);
          const completedTime = task.completed_at ? new Date(task.completed_at) : null;
          
          // Find correlated alerts (within ±5 minutes)
          const correlatedAlerts = alerts.filter(alert => {
            const alertTime = new Date(alert.timestamp);
            const diff = Math.abs(alertTime - executedTime) / 1000 / 60; // minutes
            return diff <= 5;
          });

          timeline.push({
            type: 'task',
            id: task.id,
            timestamp: executedTime,
            completedAt: completedTime,
            command: task.command || task.embedded_type,
            args: task.args,
            status: task.status,
            correlated: correlatedAlerts
          });
        }
      });

      // Add alerts
      alerts.forEach(alert => {
        timeline.push({
          type: 'alert',
          id: alert.id,
          timestamp: new Date(alert.timestamp),
          edrName: alert.edrName,
          level: alert.level,
          description: alert.description,
          detectionStatus: alert.level >= 10 ? 'detected' : alert.level >= 7 ? 'suspicious' : 'evaded'
        });
      });

      // Sort by timestamp
      timeline.sort((a, b) => a.timestamp - b.timestamp);
      
      setTimelineData(timeline);
    } catch (err) {
      console.error('Failed to fetch timeline data:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (date) => {
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const renderTaskItem = (item) => {
    const duration = item.completedAt 
      ? Math.round((item.completedAt - item.timestamp) / 1000) + 's'
      : 'running...';

    return (
      <div style={{
        background: '#161b22',
        border: '2px solid #238636',
        borderRadius: 8,
        padding: '1rem',
        marginBottom: '0.75rem',
        position: 'relative'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
          <div>
            <div style={{ color: '#58a6ff', fontWeight: '600', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>⚡</span>
              <span>{item.command}</span>
              {item.args && item.args.length > 0 && (
                <span style={{ color: '#8b949e', fontSize: '0.85rem' }}>
                  {Array.isArray(item.args) ? item.args.join(' ') : item.args}
                </span>
              )}
            </div>
            <div style={{ color: '#8b949e', fontSize: '0.85rem', marginTop: '0.25rem' }}>
              Executed: {formatTime(item.timestamp)}
              {item.completedAt && ` • Completed: ${formatTime(item.completedAt)}`}
              <span style={{ marginLeft: '0.5rem', color: '#6e7681' }}>({duration})</span>
            </div>
          </div>
          <div style={{
            background: item.status === 'completed' ? '#238636' : item.status === 'failed' ? '#da3633' : '#f78166',
            color: '#fff',
            padding: '4px 10px',
            borderRadius: 4,
            fontSize: '0.75rem',
            fontWeight: '600'
          }}>
            {item.status}
          </div>
        </div>

        {/* Correlated Alerts */}
        {item.correlated && item.correlated.length > 0 && (
          <div style={{ 
            marginTop: '0.75rem', 
            paddingTop: '0.75rem', 
            borderTop: '1px solid #30363d' 
          }}>
            <div style={{ color: '#f85149', fontSize: '0.85rem', fontWeight: '600', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>⚠️</span>
              <span>EDR Correlation ({item.correlated.length} alert{item.correlated.length > 1 ? 's' : ''})</span>
            </div>
            {item.correlated.map(alert => (
              <div key={alert.id} style={{
                background: '#1c1f23',
                padding: '0.5rem',
                borderRadius: 4,
                marginBottom: '0.25rem',
                fontSize: '0.85rem',
                borderLeft: `3px solid ${alert.level >= 10 ? '#f85149' : alert.level >= 7 ? '#f78166' : '#6e7681'}`
              }}>
                <div style={{ color: '#c9d1d9', marginBottom: '0.25rem' }}>
                  <strong>[{alert.edrName}]</strong> {alert.description}
                </div>
                <div style={{ color: '#8b949e', fontSize: '0.8rem' }}>
                  Detected {formatTime(new Date(alert.timestamp))} • Level {alert.level}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderAlertItem = (item) => {
    const badge = item.detectionStatus === 'detected' 
      ? { icon: '✅', label: 'Detected', color: '#1a7f37' }
      : item.detectionStatus === 'suspicious'
      ? { icon: '⚠️', label: 'Suspicious', color: '#9e6a03' }
      : { icon: '❌', label: 'Evaded', color: '#6e7681' };

    return (
      <div style={{
        background: '#161b22',
        border: '2px solid #f85149',
        borderRadius: 8,
        padding: '1rem',
        marginBottom: '0.75rem'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
          <div>
            <div style={{ color: '#f78166', fontWeight: '600', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>🚨</span>
              <span>[{item.edrName}]</span>
              <span style={{ color: '#c9d1d9' }}>{item.description}</span>
            </div>
            <div style={{ color: '#8b949e', fontSize: '0.85rem', marginTop: '0.25rem' }}>
              Detected: {formatTime(item.timestamp)} • Level {item.level}
            </div>
          </div>
          <div style={{
            background: badge.color,
            color: '#fff',
            padding: '4px 10px',
            borderRadius: 4,
            fontSize: '0.75rem',
            fontWeight: '600',
            display: 'flex',
            alignItems: 'center',
            gap: '0.25rem'
          }}>
            <span>{badge.icon}</span>
            <span>{badge.label}</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{ 
      background: '#0d1117', 
      borderRadius: 12, 
      padding: '1.5rem',
      border: '1px solid #30363d',
      height: '100%',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginBottom: '1rem'
        }}>
          <div>
            <h2 style={{ margin: 0, color: '#c9d1d9', fontSize: '1.5rem', fontWeight: '600' }}>
              Purple Team Timeline
            </h2>
            <div style={{ color: '#8b949e', fontSize: '0.9rem', marginTop: '0.5rem' }}>
              Correlates C2 task execution with EDR alert detection (±5 minute window)
            </div>
          </div>
          
          {/* Agent Selector */}
          {agents.length > 0 && (
            <select
              value={selectedAgent || ''}
              onChange={(e) => setSelectedAgent(e.target.value)}
              style={{
                background: '#161b22',
                border: '1px solid #30363d',
                color: '#c9d1d9',
                padding: '8px 12px',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: '0.9rem'
              }}
            >
              {agents.map(agent => (
                <option key={agent.id} value={agent.id}>
                  {agent.hostname || agent.cn || agent.id.substring(0, 8)}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.85rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ width: 12, height: 12, background: '#238636', borderRadius: 2 }}></div>
            <span style={{ color: '#8b949e' }}>C2 Task</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ width: 12, height: 12, background: '#f85149', borderRadius: 2 }}></div>
            <span style={{ color: '#8b949e' }}>EDR Alert</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ color: '#8b949e' }}>⚠️ = Correlated events</span>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div style={{ flex: 1, overflowY: 'auto', paddingRight: '0.5rem' }}>
        {loading ? (
          <div style={{ textAlign: 'center', color: '#8b949e', padding: '2rem' }}>
            Loading timeline data...
          </div>
        ) : agents.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#8b949e', padding: '2rem' }}>
            No agents available
          </div>
        ) : timelineData.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#8b949e', padding: '2rem' }}>
            No timeline data available for this agent
          </div>
        ) : (
          timelineData.map(item => (
            <div key={`${item.type}-${item.id}`}>
              {item.type === 'task' ? renderTaskItem(item) : renderAlertItem(item)}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
