import { useState, useEffect } from 'react';
import { TaskModal } from './modals';

export default function TaskPanel({ agent, token, onClose }) {
  const [cmd, setCmd] = useState('');
  const [args, setArgs] = useState('');
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);

  useEffect(() => {
    fetchTasks();
    const interval = setInterval(fetchTasks, 12000); // Reduced frequency to avoid 429 errors
    return () => clearInterval(interval);
  }, [agent.id]);

  const fetchTasks = async () => {
    try {
      const token = localStorage.getItem('gla1v3_token');
      const res = await fetch(`https://api.gla1v3.local/api/tasks/${agent.id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (res.status === 429) {
        console.warn('[TaskPanel] Rate limited, skipping this fetch cycle');
        return;
      }
      
      const data = await res.json();
      
      // Ensure data is always an array
      setTasks(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch tasks:', err);
      setTasks([]);
    }
  };

  const sendTask = async () => {
    if (!cmd.trim()) return;
    
    setLoading(true);
    try {
      const token = localStorage.getItem('gla1v3_token');
      const argsArray = args.trim() ? args.trim().split(' ') : [];
      const res = await fetch(`https://api.gla1v3.local/api/tasks`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ 
          agentId: agent.id,
          cmd, 
          args: argsArray 
        })
      });
      
      if (res.ok) {
        setCmd('');
        setArgs('');
        fetchTasks();
      }
    } catch (err) {
      console.error('Failed to send task:', err);
    } finally {
      setLoading(false);
    }
  };

  const sendEmbeddedTask = async (task) => {
    setLoading(true);
    try {
      const res = await fetch(`https://api.gla1v3.local/api/agents/${agent.id}/tasks`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({
          type: 'embedded',
          taskType: task.type,
          params: task.params,
          runOnce: task.runOnce || false
        })
      });
      
      if (res.ok) {
        fetchTasks();
        return true;
      }
      return false;
    } catch (err) {
      console.error('Failed to send embedded task:', err);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const quickCommands = [
    { label: 'whoami', cmd: 'whoami', args: '', os: 'all' },
    { label: 'hostname', cmd: 'hostname', args: '', os: 'all' },
    // Linux/Unix commands
    { label: 'ps aux', cmd: 'ps', args: 'aux', os: 'linux' },
    { label: 'uname -a', cmd: 'uname', args: '-a', os: 'linux' },
    { label: 'netstat -tuln', cmd: 'netstat', args: '-tuln', os: 'linux' },
    { label: 'df -h', cmd: 'df', args: '-h', os: 'linux' },
    // Windows commands
    { label: 'ipconfig /all', cmd: 'ipconfig', args: '/all', os: 'windows' },
    { label: 'tasklist', cmd: 'tasklist', args: '', os: 'windows' },
    { label: 'netstat -ano', cmd: 'netstat', args: '-ano', os: 'windows' },
    { label: 'systeminfo', cmd: 'systeminfo', args: '', os: 'windows' },
  ];

  // Filter commands based on agent OS
  const agentOS = agent.os?.toLowerCase() || 'linux';
  const filteredCommands = quickCommands.filter(cmd => 
    cmd.os === 'all' || agentOS.includes(cmd.os)
  );

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
      <div style={{ width: '80vw', maxWidth: '900px', height: '85vh', background: '#0f1720', borderRadius: 12, overflow: 'hidden', boxShadow: '0 8px 48px rgba(0,0,0,0.7)', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.5rem', borderBottom: '1px solid #30363d', background: '#161b22' }}>
          <div>
            <div style={{ color: '#58a6ff', fontWeight: '600', fontSize: '1.2rem' }}>Task Agent: {agent.id}</div>
            <div style={{ color: '#8b949e', fontSize: '0.85rem', marginTop: '0.25rem' }}>CN: {agent.cn} | IP: {agent.ip}</div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: '1px solid #30363d', color: '#58a6ff', padding: '8px 16px', borderRadius: 6, cursor: 'pointer', fontWeight: '600' }}>Close</button>
        </div>

        <div style={{ flex: 1, display: 'flex', gap: '1rem', padding: '1rem', overflow: 'hidden' }}>
          {/* Command Panel */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Task Builder Button */}
            <button
              onClick={() => setShowTaskModal(true)}
              style={{
                background: 'linear-gradient(135deg, #6e40c9 0%, #8957e5 100%)',
                border: 'none',
                color: '#fff',
                padding: '16px 24px',
                borderRadius: 8,
                cursor: 'pointer',
                fontWeight: '700',
                fontSize: '1.1rem',
                boxShadow: '0 4px 16px rgba(110, 64, 201, 0.4)',
                transition: 'all 0.3s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.75rem'
              }}
              onMouseEnter={e => {
                e.target.style.transform = 'translateY(-2px)';
                e.target.style.boxShadow = '0 6px 20px rgba(110, 64, 201, 0.6)';
              }}
              onMouseLeave={e => {
                e.target.style.transform = 'none';
                e.target.style.boxShadow = '0 4px 16px rgba(110, 64, 201, 0.4)';
              }}
            >
              <span style={{ fontSize: '1.5rem' }}>🎯</span>
              Open Task Builder
            </button>

            <div style={{ background: '#161b22', borderRadius: 8, padding: '1rem', border: '1px solid #30363d' }}>
              <h3 style={{ margin: '0 0 1rem 0', color: '#58a6ff', fontSize: '1rem' }}>Quick Command (Legacy)</h3>
              
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', color: '#8b949e', fontSize: '0.85rem', marginBottom: '0.5rem' }}>Command</label>
                <input
                  type="text"
                  value={cmd}
                  onChange={(e) => setCmd(e.target.value)}
                  placeholder="e.g., whoami"
                  style={{ width: '100%', background: '#0d1117', border: '1px solid #30363d', color: '#c9d1d9', padding: '8px 12px', borderRadius: 6, fontFamily: 'monospace' }}
                  onKeyPress={(e) => e.key === 'Enter' && sendTask()}
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', color: '#8b949e', fontSize: '0.85rem', marginBottom: '0.5rem' }}>Arguments (space-separated)</label>
                <input
                  type="text"
                  value={args}
                  onChange={(e) => setArgs(e.target.value)}
                  placeholder="e.g., /all"
                  style={{ width: '100%', background: '#0d1117', border: '1px solid #30363d', color: '#c9d1d9', padding: '8px 12px', borderRadius: 6, fontFamily: 'monospace' }}
                  onKeyPress={(e) => e.key === 'Enter' && sendTask()}
                />
              </div>

              <button
                onClick={sendTask}
                disabled={loading || !cmd.trim()}
                style={{ 
                  background: loading || !cmd.trim() ? '#21262d' : '#238636',
                  border: 'none',
                  color: '#fff',
                  padding: '10px 20px',
                  borderRadius: 6,
                  cursor: loading || !cmd.trim() ? 'not-allowed' : 'pointer',
                  fontWeight: '600',
                  width: '100%'
                }}
              >
                {loading ? 'Sending...' : 'Send Task'}
              </button>

              <div style={{ marginTop: '1rem' }}>
                <div style={{ color: '#8b949e', fontSize: '0.85rem', marginBottom: '0.5rem' }}>Quick Commands ({agentOS}):</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {filteredCommands.map(qc => (
                    <button
                      key={qc.label}
                      onClick={() => { setCmd(qc.cmd); setArgs(qc.args); }}
                      style={{ background: '#21262d', border: '1px solid #30363d', color: '#58a6ff', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: '0.85rem' }}
                    >
                      {qc.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ background: '#161b22', borderRadius: 8, padding: '1rem', border: '1px solid #30363d', flex: 1, overflow: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ margin: 0, color: '#58a6ff', fontSize: '1rem' }}>Task History</h3>
                <button onClick={fetchTasks} style={{ background: 'transparent', border: '1px solid #30363d', color: '#58a6ff', padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: '0.85rem' }}>Refresh</button>
              </div>

              {!Array.isArray(tasks) || tasks.length === 0 ? (
                <div style={{ color: '#8b949e', textAlign: 'center', padding: '2rem', fontStyle: 'italic' }}>No tasks yet. Send a command to get started.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {tasks.slice().reverse().map(task => (
                    <div key={task.id} style={{ background: '#0d1117', border: '1px solid #30363d', borderRadius: 6, padding: '0.75rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <div style={{ fontFamily: 'monospace', color: '#79c0ff', fontSize: '0.9rem' }}>
                          {task.type === 'embedded' ? (
                            <span>
                              <span style={{ background: '#6e40c9', color: '#fff', padding: '2px 6px', borderRadius: 3, fontSize: '0.75rem', marginRight: '0.5rem' }}>EMBEDDED</span>
                              {task.taskType}
                            </span>
                          ) : (
                            <span>{task.cmd} {task.args?.join(' ')}</span>
                          )}
                        </div>
                        <span style={{ 
                          padding: '2px 8px', 
                          borderRadius: 4, 
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          background: task.status === 'completed' ? '#238636' : task.status === 'failed' ? '#da3633' : '#6e40c9',
                          color: '#fff'
                        }}>
                          {task.status}
                        </span>
                      </div>
                      
                      {task.result && (
                        <pre style={{ 
                          margin: '0.5rem 0 0 0', 
                          background: '#010409', 
                          padding: '0.5rem', 
                          borderRadius: 4, 
                          fontSize: '0.8rem',
                          color: '#c9d1d9',
                          maxHeight: '150px',
                          overflow: 'auto',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-all'
                        }}>
                          {task.result}
                        </pre>
                      )}
                      
                      {task.error && (
                        <div style={{ marginTop: '0.5rem', color: '#f85149', fontSize: '0.85rem' }}>
                          Error: {task.error}
                        </div>
                      )}
                      
                      <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#6e7681' }}>
                        Created: {new Date(task.createdAt).toLocaleString()}
                        {task.completedAt && ` | Completed: ${new Date(task.completedAt).toLocaleString()}`}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Task Modal */}
      {showTaskModal && (
        <TaskModal
          agent={agent}
          onClose={() => setShowTaskModal(false)}
          onSubmit={async (task) => {
            const success = await sendEmbeddedTask(task);
            if (success) {
              setShowTaskModal(false);
            }
          }}
        />
      )}
    </div>
  );
}
