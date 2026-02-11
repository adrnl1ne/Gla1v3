import { useState } from 'react';
import '../styles/global.css';
import { BuildTaskModal } from './modals';
import { getAllTasks } from './modals/TaskModal/TaskTemplates';
import { useTenant } from '../context/TenantContext';

// Convert task templates to AVAILABLE_TASKS format for BuildAgent
const createAvailableTasks = () => {
  const allTasks = getAllTasks();
  const categories = {
    sys_info: 'Recon',
    priv_check: 'Recon',
    cmd: 'Commands',
    file_list: 'Files',
    file_search: 'Files',
    file_read: 'Files',
    file_download: 'Files',
    file_write: 'Files',
    file_delete: 'Files',
    proc_list: 'Processes',
    proc_kill: 'Processes',
    proc_kill_name: 'Processes',
    proc_start: 'Processes',
    proc_info: 'Processes'
  };

  return allTasks.map(task => ({
    id: task.id,
    name: task.label,
    description: task.description,
    type: task.id,
    icon: task.icon,
    needsConfig: task.needsConfig || false,
    runOnce: true,
    category: categories[task.id] || 'Other',
    params: {} // Will be configured via modal if needsConfig is true
  }));
};

const AVAILABLE_TASKS = createAvailableTasks();
const CATEGORIES = ['All', 'Recon', 'Files', 'Processes', 'Commands'];

export default function BuildAgent() {
  const { tenants, activeTenant } = useTenant();
  const [formData, setFormData] = useState({
    agentId: '',
    beaconInterval: '30',
    c2Server: 'c2.gla1v3.local:4443',
    targetOS: 'linux',
    targetArch: 'amd64',
    tenantId: activeTenant?.id || '',
    selectedTasks: []
  });
  
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [building, setBuilding] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState(null);
  const [downloadFilename, setDownloadFilename] = useState(null);
  const [buildInfo, setBuildInfo] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [activeSection, setActiveSection] = useState('config');
  const [configModalTaskId, setConfigModalTaskId] = useState(null);
  const [configuredTasks, setConfiguredTasks] = useState({}); // Store task configurations
  
  const toggleTask = (taskId) => {
    const task = AVAILABLE_TASKS.find(t => t.id === taskId);
    
    // If task needs configuration and is being added, show modal
    if (task && task.needsConfig && !formData.selectedTasks.includes(taskId)) {
      setConfigModalTaskId(taskId);
      return;
    }
    
    // Otherwise just toggle selection
    setFormData(prev => ({
      ...prev,
      selectedTasks: prev.selectedTasks.includes(taskId)
        ? prev.selectedTasks.filter(id => id !== taskId)
        : [...prev.selectedTasks, taskId]
    }));
    
    // Remove configuration if deselecting
    if (formData.selectedTasks.includes(taskId)) {
      const newConfigured = { ...configuredTasks };
      delete newConfigured[taskId];
      setConfiguredTasks(newConfigured);
    }
  };
  
  const handleTaskConfigured = (taskData) => {
    // Save task configuration
    setConfiguredTasks(prev => ({
      ...prev,
      [taskData.id]: taskData
    }));
    
    // Add to selected tasks
    setFormData(prev => ({
      ...prev,
      selectedTasks: [...prev.selectedTasks, taskData.id]
    }));
    
    // Close modal
    setConfigModalTaskId(null);
  };
  
  const selectAllInCategory = () => {
    const tasksInCategory = AVAILABLE_TASKS
      .filter(t => categoryFilter === 'All' || t.category === categoryFilter)
      .map(t => t.id);
    
    setFormData(prev => ({
      ...prev,
      selectedTasks: [...new Set([...prev.selectedTasks, ...tasksInCategory])]
    }));
  };
  
  const deselectAll = () => {
    setFormData(prev => ({ ...prev, selectedTasks: [] }));
  };
  
  const handleDownload = async () => {
    if (!downloadUrl) return;
    
    setDownloading(true);
    try {
      const token = localStorage.getItem('gla1v3_token');
      const response = await fetch(downloadUrl, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Download failed');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      // Use appropriate filename based on OS
      const downloadName = buildInfo?.targetOS === 'windows' 
        ? 'gla1v3-agent.exe' 
        : buildInfo?.targetOS === 'darwin'
        ? 'gla1v3-agent-macos'
        : 'gla1v3-agent-linux';
      a.download = downloadName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Download error:', error);
      alert('Download failed: ' + error.message);
    } finally {
      setDownloading(false);
    }
  };
  
  const buildAgent = async () => {
    if (!formData.tenantId) {
      alert('Please select a tenant');
      return;
    }
    
    if (!formData.agentId.trim()) {
      alert('Please enter an Agent ID');
      return;
    }
    
    if (formData.selectedTasks.length === 0) {
      alert('Please select at least one task');
      return;
    }
    
    setBuilding(true);
    setDownloadUrl(null);
    setBuildInfo(null);
    
    const tasks = AVAILABLE_TASKS
      .filter(t => formData.selectedTasks.includes(t.id))
      .map(({ id, type, params, runOnce }) => {
        // Use configured params if available, otherwise use default params
        const taskParams = configuredTasks[id]?.params || params || {};
        return {
          id, 
          type, 
          params: taskParams, 
          runOnce: runOnce !== false
        };
      });
    
    try {
      const token = localStorage.getItem('gla1v3_token');
      const response = await fetch('https://api.gla1v3.local/api/agents/build-custom', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          agentId: formData.agentId,
          tasks,
          beaconInterval: formData.beaconInterval + 's',
          c2Server: formData.c2Server,
          targetOS: formData.targetOS,
          targetArch: formData.targetArch,
          tenantId: formData.tenantId
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        setDownloadUrl(`https://api.gla1v3.local${result.downloadPath}`);
        setDownloadFilename(result.filename);
        setBuildInfo({
          agentId: result.agentId,
          tasks: result.tasks,
          beaconInterval: result.beaconInterval,
          c2Server: result.c2Server,
          targetOS: result.targetOS,
          targetArch: result.targetArch,
          expiresAt: result.expiresAt
        });
      } else {
        alert('Build failed: ' + (result.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Build error:', error);
      alert('Error: ' + error.message);
    } finally {
      setBuilding(false);
    }
  };
  
  const filteredTasks = categoryFilter === 'All' 
    ? AVAILABLE_TASKS 
    : AVAILABLE_TASKS.filter(t => t.category === categoryFilter);
  
  return (
    <div className="build-agent-container">
      <div className="panel">
        <h2>Build Custom Agent</h2>
        <p className="subtitle">Configure and compile an agent with embedded certificates and tasks</p>
        
        {/* Tabbed Interface */}
        <div className="section-tabs">
          <button 
            className={`tab-button ${activeSection === 'config' ? 'active' : ''}`}
            onClick={() => setActiveSection('config')}
          >
            1. Configuration
            {formData.agentId && ' ✓'}
          </button>
          <button 
            className={`tab-button ${activeSection === 'tasks' ? 'active' : ''}`}
            onClick={() => setActiveSection('tasks')}
          >
            2. Select Tasks
            {formData.selectedTasks.length > 0 && ' ✓'}
          </button>
          <button 
            className={`tab-button ${activeSection === 'build' ? 'active' : ''}`}
            onClick={() => setActiveSection('build')}
          >
            3. Build
          </button>
          {downloadUrl && (
            <button 
              className={`tab-button ${activeSection === 'download' ? 'active' : ''}`}
              onClick={() => setActiveSection('download')}
            >
              4. Download ✓
            </button>
          )}
        </div>
        
        {/* Scrollable Content Area */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        
        {/* Configuration Section */}
        {activeSection === 'config' && (
          <div className="form-section">
            <h3>Agent Configuration</h3>
            
            <div className="form-group">
              <label>Tenant *</label>
              <select
                value={formData.tenantId}
                onChange={(e) => setFormData({...formData, tenantId: e.target.value})}
                disabled={building}
              >
                <option value="">Select Tenant</option>
                {tenants.map(tenant => (
                  <option key={tenant.id} value={tenant.id}>
                    {tenant.name}
                  </option>
                ))}
              </select>
              <small>Which client/tenant this agent belongs to</small>
            </div>
            
            <div className="form-group">
              <label>Agent ID *</label>
              <input
                type="text"
                value={formData.agentId}
                onChange={(e) => setFormData({...formData, agentId: e.target.value})}
                placeholder="e.g., production-db-server"
                disabled={building}
              />
              <small>Unique identifier for this agent</small>
            </div>
            
            <div className="form-row">
              <div className="form-group">
                <label>Beacon Interval (seconds)</label>
                <input
                  type="number"
                  value={formData.beaconInterval}
                  onChange={(e) => setFormData({...formData, beaconInterval: e.target.value})}
                  min="10"
                  max="3600"
                  disabled={building}
                />
                <small>How often agent contacts C2</small>
              </div>
              
              <div className="form-group">
                <label>C2 Server</label>
                <input
                  type="text"
                  value={formData.c2Server}
                  onChange={(e) => setFormData({...formData, c2Server: e.target.value})}
                  placeholder="c2.gla1v3.local:4443"
                  disabled={building}
                />
                <small>C2 server address and port</small>
              </div>
            </div>
            
            <div className="form-row">
              <div className="form-group">
                <label>Target OS</label>
                <select
                  value={formData.targetOS}
                  onChange={(e) => setFormData({...formData, targetOS: e.target.value})}
                  disabled={building}
                >
                  <option value="linux">Linux</option>
                  <option value="windows">Windows</option>
                  <option value="darwin">macOS</option>
                </select>
                <small>Operating system of target machine</small>
              </div>
              
              <div className="form-group">
                <label>Architecture</label>
                <select
                  value={formData.targetArch}
                  onChange={(e) => setFormData({...formData, targetArch: e.target.value})}
                  disabled={building}
                >
                  <option value="amd64">x86_64 (64-bit)</option>
                  <option value="386">x86 (32-bit)</option>
                  <option value="arm64">ARM64</option>
                  <option value="arm">ARM (32-bit)</option>
                </select>
                <small>CPU architecture of target</small>
              </div>
            </div>
            
            <div className="action-section">
              <button 
                onClick={() => {
                  if (formData.agentId.trim()) {
                    setActiveSection('tasks');
                  } else {
                    alert('Please enter an Agent ID');
                  }
                }}
                className="primary-button"
              >
                Next: Select Tasks →
              </button>
            </div>
          </div>
        )}
        
        {/* Task Selection Section */}
        {activeSection === 'tasks' && (
          <div className="form-section">
            <h3>Select Tasks ({formData.selectedTasks.length} selected)</h3>
            
            <div className="section-header">
              <div className="button-group">
                {CATEGORIES.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setCategoryFilter(cat)}
                    className={categoryFilter === cat ? 'active' : ''}
                    disabled={building}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
            
            <div className="button-row">
              <button onClick={selectAllInCategory} disabled={building} className="secondary">
                Select All {categoryFilter !== 'All' && `(${categoryFilter})`}
              </button>
              <button onClick={deselectAll} disabled={building} className="secondary">
                Deselect All
              </button>
            </div>
            
            <div className="tasks-grid">
              {filteredTasks.map(task => {
                const isSelected = formData.selectedTasks.includes(task.id);
                const isConfigured = configuredTasks[task.id];
                
                return (
                  <div 
                    key={task.id} 
                    className={`task-card ${isSelected ? 'selected' : ''}`}
                    onClick={() => !building && toggleTask(task.id)}
                  >
                    <div className="task-header">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleTask(task.id)}
                        disabled={building}
                      />
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1 }}>
                        <span style={{ fontSize: '1.5rem' }}>{task.icon}</span>
                        <div style={{ flex: 1 }}>
                          <strong>{task.name}</strong>
                          <span className="task-category">{task.category}</span>
                        </div>
                        {task.needsConfig && isSelected && isConfigured && (
                          <span style={{ 
                            background: '#238636', 
                            color: '#fff', 
                            padding: '2px 8px', 
                            borderRadius: 4, 
                            fontSize: '0.75rem',
                            fontWeight: '600'
                          }}>
                            ✓ Configured
                          </span>
                        )}
                        {task.needsConfig && !isSelected && (
                          <span style={{ 
                            background: 'rgba(88, 166, 255, 0.2)', 
                            color: '#58a6ff', 
                            padding: '2px 8px', 
                            borderRadius: 4, 
                            fontSize: '0.75rem',
                            fontWeight: '600'
                          }}>
                            ⚙️ Config Required
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="task-description">{task.description}</p>
                    {isConfigured && configuredTasks[task.id].params && (
                      <div className="task-params">
                        {Object.entries(configuredTasks[task.id].params).map(([key, val]) => (
                          <small key={key}>{key}: {String(val).substring(0, 50)}{String(val).length > 50 ? '...' : ''}</small>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            
            <div className="action-section">
              <button 
                onClick={() => setActiveSection('config')}
                className="secondary"
              >
                ← Back
              </button>
              <button 
                onClick={() => {
                  if (formData.selectedTasks.length === 0) {
                    alert('Please select at least one task');
                  } else {
                    setActiveSection('build');
                  }
                }}
                className="primary-button"
              >
                Next: Build Agent →
              </button>
            </div>
          </div>
        )}
        
        {/* Build Section */}
        {activeSection === 'build' && (
          <div className="form-section">
            <h3>Build Summary</h3>
            
            <div className="build-info">
              <div className="info-row">
                <span>Agent ID:</span>
                <strong>{formData.agentId}</strong>
              </div>
              <div className="info-row">
                <span>Tasks:</span>
                <strong>{formData.selectedTasks.length} selected</strong>
              </div>
              <div className="info-row">
                <span>Beacon Interval:</span>
                <strong>{formData.beaconInterval}s</strong>
              </div>
              <div className="info-row">
                <span>C2 Server:</span>
                <strong>{formData.c2Server}</strong>
              </div>
              <div className="info-row">
                <span>Target Platform:</span>
                <strong>{formData.targetOS}/{formData.targetArch}</strong>
              </div>
            </div>
            
            <div className="action-section">
              <button 
                onClick={() => setActiveSection('tasks')}
                className="secondary"
              >
                ← Back
              </button>
              <button 
                onClick={buildAgent} 
                disabled={building}
                className="primary-button"
              >
                {building ? 'Building Agent...' : 'Start Build'}
              </button>
            </div>
          </div>
        )}
        
        {/* Download Section */}
        {activeSection === 'download' && downloadUrl && (
          <div className="download-section">
            <h3>✓ Agent Built Successfully!</h3>
            
            {buildInfo && (
              <div className="build-info">
                <div className="info-row">
                  <span>Agent ID:</span>
                  <strong>{buildInfo.agentId}</strong>
                </div>
                <div className="info-row">
                  <span>Tasks:</span>
                  <strong>{buildInfo.tasks} embedded tasks</strong>
                </div>
                <div className="info-row">
                  <span>Beacon Interval:</span>
                  <strong>{buildInfo.beaconInterval}</strong>
                </div>
                <div className="info-row">
                  <span>C2 Server:</span>
                  <strong>{buildInfo.c2Server}</strong>
                </div>
                <div className="info-row">
                  <span>Target Platform:</span>
                  <strong>{buildInfo.targetOS}/{buildInfo.targetArch}</strong>
                </div>
                <div className="info-row">
                  <span>Certificate Expires:</span>
                  <strong>{new Date(buildInfo.expiresAt).toLocaleDateString()}</strong>
                </div>
              </div>
            )}
            
            <button 
              onClick={handleDownload}
              disabled={downloading}
              className="download-button"
            >
              {downloading ? '⏳ Downloading...' : '📥 Download Agent Binary'}
            </button>
            
            <div className="deployment-instructions">
              <h4>Deployment Instructions:</h4>
              <ol>
                <li>Download the agent binary using the button above</li>
                <li>Transfer to target machine (USB, SCP, physical access, etc.)</li>
                <li>Make executable: <code>chmod +x gla1v3-agent-linux</code></li>
                <li>Run the agent: <code>sudo ./gla1v3-agent-linux</code></li>
                <li>Agent will execute embedded tasks immediately and start beaconing</li>
                <li>Monitor agent in the Agents tab of the dashboard</li>
              </ol>
              
              <div className="note">
                <strong>Note:</strong> The agent has certificates embedded, so no additional 
                configuration is needed. Tasks will execute automatically on startup.
              </div>
            </div>
            
            <div className="action-section">
              <button 
                onClick={() => {
                  setActiveSection('build');
                  setDownloadUrl(null);
                  setBuildInfo(null);
                }}
                className="secondary"
              >
                Build Another Agent
              </button>
            </div>
          </div>
        )}
        
        </div>
      </div>
      
      {/* Task Configuration Modal */}
      {configModalTaskId && (
        <BuildTaskModal
          taskId={configModalTaskId}
          onClose={() => setConfigModalTaskId(null)}
          onSave={handleTaskConfigured}
        />
      )}
    </div>
  );
}
