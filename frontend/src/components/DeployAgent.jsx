import { useState } from 'react';
import '../styles/global.css';

export default function DeployAgent() {
  const [targetIP, setTargetIP] = useState('');
  const [sshUsername, setSSHUsername] = useState('');
  const [sshPassword, setSSHPassword] = useState('');
  const [agentName, setAgentName] = useState('');
  const [beaconInterval, setBeaconInterval] = useState('30s');
  const [c2Server, setC2Server] = useState('c2.gla1v3.local:4443');
  
  const [deploying, setDeploying] = useState(false);
  const [deployResult, setDeployResult] = useState(null);
  const [deployError, setDeployError] = useState(null);
  const [authDebug, setAuthDebug] = useState(null);

  const checkAuth = () => {
    const token = localStorage.getItem('gla1v3_token');
    const user = localStorage.getItem('gla1v3_user');
    
    setAuthDebug({
      hasToken: !!token,
      tokenPreview: token ? `${token.substring(0, 20)}...${token.substring(token.length - 20)}` : 'none',
      tokenLength: token ? token.length : 0,
      user: user ? JSON.parse(user) : null,
      allKeys: Object.keys(localStorage)
    });
  };

  const handleDeploy = async (e) => {
    e.preventDefault();
    setDeploying(true);
    setDeployResult(null);
    setDeployError(null);

    try {
      const token = localStorage.getItem('gla1v3_token');

      if (!token) {
        throw new Error('Not authenticated - please log in again');
      }

      const response = await fetch('/api/agents/deploy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          targetIP,
          sshUsername,
          sshPassword,
          agentName,
          agentConfig: {
            beaconInterval,
            c2Server
          }
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.details || 'Deployment failed');
      }

      setDeployResult(data);
      
      // Clear form on success
      setTargetIP('');
      setSSHUsername('');
      setSSHPassword('');
      setAgentName('');
      
    } catch (error) {
      console.error('Deployment error:', error);
      setDeployError(error.message);
    } finally {
      setDeploying(false);
    }
  };

  return (
    <div className="deploy-agent-container">
      <h2>Deploy Agent to Linux Target</h2>
      
      <div style={{ marginBottom: '20px', padding: '10px', background: 'rgba(255, 255, 0, 0.1)', border: '1px solid #ffff00' }}>
        <button type="button" onClick={checkAuth} style={{ padding: '8px 16px', background: '#ffff00', color: '#000', border: 'none', cursor: 'pointer', marginBottom: '10px' }}>
          🔍 Check Authentication
        </button>
        {authDebug && (
          <pre style={{ fontSize: '12px', color: '#ffff00', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {JSON.stringify(authDebug, null, 2)}
          </pre>
        )}
      </div>
      
      <form onSubmit={handleDeploy} className="deploy-form">
        <div className="form-section">
          <h3>Target Configuration</h3>
          
          <div className="form-group">
            <label htmlFor="targetIP">Target IP Address *</label>
            <input
              id="targetIP"
              type="text"
              placeholder="192.168.1.100"
              value={targetIP}
              onChange={(e) => setTargetIP(e.target.value)}
              required
              disabled={deploying}
            />
          </div>

          <div className="form-group">
            <label htmlFor="sshUsername">SSH Username *</label>
            <input
              id="sshUsername"
              type="text"
              placeholder="root"
              value={sshUsername}
              onChange={(e) => setSSHUsername(e.target.value)}
              required
              disabled={deploying}
            />
          </div>

          <div className="form-group">
            <label htmlFor="sshPassword">SSH Password *</label>
            <input
              id="sshPassword"
              type="password"
              placeholder="••••••••"
              value={sshPassword}
              onChange={(e) => setSSHPassword(e.target.value)}
              required
              disabled={deploying}
            />
          </div>

          <div className="form-group">
            <label htmlFor="agentName">Agent Name *</label>
            <input
              id="agentName"
              type="text"
              placeholder="web-server-01"
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              required
              disabled={deploying}
            />
            <small>Unique identifier for this agent</small>
          </div>
        </div>

        <div className="form-section">
          <h3>Agent Configuration</h3>
          
          <div className="form-group">
            <label htmlFor="beaconInterval">Beacon Interval</label>
            <select
              id="beaconInterval"
              value={beaconInterval}
              onChange={(e) => setBeaconInterval(e.target.value)}
              disabled={deploying}
            >
              <option value="10s">10 seconds (Fast)</option>
              <option value="30s">30 seconds (Default)</option>
              <option value="1m">1 minute</option>
              <option value="5m">5 minutes</option>
              <option value="15m">15 minutes</option>
              <option value="30m">30 minutes (Stealth)</option>
            </select>
            <small>How often the agent checks in with C2</small>
          </div>

          <div className="form-group">
            <label htmlFor="c2Server">C2 Server Address</label>
            <input
              id="c2Server"
              type="text"
              value={c2Server}
              onChange={(e) => setC2Server(e.target.value)}
              disabled={deploying}
            />
            <small>Server:Port for agent to connect to</small>
          </div>
        </div>

        <button type="submit" disabled={deploying} className="deploy-button">
          {deploying ? 'Deploying Agent...' : 'Deploy Agent'}
        </button>
      </form>

      {deployError && (
        <div className="deploy-error">
          <h3>⚠️ Deployment Failed</h3>
          <p>{deployError}</p>
        </div>
      )}

      {deployResult && (
        <div className="deploy-success">
          <h3>✅ Agent Deployed Successfully</h3>
          <div className="deploy-details">
            <p><strong>Agent Name:</strong> {deployResult.agentName}</p>
            <p><strong>Target IP:</strong> {deployResult.targetIP}</p>
            <p><strong>Beacon Interval:</strong> {deployResult.config?.beaconInterval}</p>
            <p><strong>C2 Server:</strong> {deployResult.config?.c2Server}</p>
          </div>
          
          {deployResult.output && (
            <details className="deploy-output">
              <summary>View Deployment Output</summary>
              <pre>{deployResult.output}</pre>
            </details>
          )}
          
          <p className="deploy-next-steps">
            Agent is now running as a systemd service on the target.<br/>
            It should begin beaconing to the C2 server within {deployResult.config?.beaconInterval}.
          </p>
        </div>
      )}

      <style>{`
        .deploy-agent-container {
          padding: 20px;
          max-width: 800px;
        }

        .deploy-form {
          background: rgba(0, 255, 0, 0.05);
          border: 1px solid #00ff00;
          padding: 20px;
          margin: 20px 0;
        }

        .form-section {
          margin-bottom: 30px;
          padding-bottom: 20px;
          border-bottom: 1px solid rgba(0, 255, 0, 0.2);
        }

        .form-section:last-of-type {
          border-bottom: none;
        }

        .form-section h3 {
          color: #00ff00;
          margin-bottom: 15px;
          font-size: 1.1em;
        }

        .form-group {
          margin-bottom: 15px;
        }

        .form-group label {
          display: block;
          color: #00ff00;
          margin-bottom: 5px;
          font-size: 0.9em;
        }

        .form-group input,
        .form-group select {
          width: 100%;
          padding: 8px;
          background: rgba(0, 0, 0, 0.5);
          border: 1px solid #00ff00;
          color: #00ff00;
          font-family: 'Courier New', monospace;
        }

        .form-group input:focus,
        .form-group select:focus {
          outline: none;
          border-color: #00ff00;
          box-shadow: 0 0 5px rgba(0, 255, 0, 0.5);
        }

        .form-group input:disabled,
        .form-group select:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .form-group small {
          display: block;
          color: rgba(0, 255, 0, 0.7);
          font-size: 0.8em;
          margin-top: 3px;
        }

        .deploy-button {
          width: 100%;
          padding: 12px;
          background: #00ff00;
          color: #000;
          border: none;
          font-weight: bold;
          cursor: pointer;
          font-family: 'Courier New', monospace;
          font-size: 1em;
        }

        .deploy-button:hover:not(:disabled) {
          background: #00cc00;
        }

        .deploy-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .deploy-error {
          background: rgba(255, 0, 0, 0.1);
          border: 1px solid #ff0000;
          padding: 15px;
          margin: 20px 0;
          color: #ff0000;
        }

        .deploy-error h3 {
          margin-top: 0;
        }

        .deploy-success {
          background: rgba(0, 255, 0, 0.1);
          border: 1px solid #00ff00;
          padding: 15px;
          margin: 20px 0;
        }

        .deploy-success h3 {
          color: #00ff00;
          margin-top: 0;
        }

        .deploy-details {
          margin: 15px 0;
        }

        .deploy-details p {
          margin: 5px 0;
        }

        .deploy-details strong {
          color: #00ff00;
        }

        .deploy-output {
          margin: 15px 0;
        }

        .deploy-output summary {
          cursor: pointer;
          color: #00ff00;
          padding: 5px;
        }

        .deploy-output summary:hover {
          background: rgba(0, 255, 0, 0.1);
        }

        .deploy-output pre {
          background: rgba(0, 0, 0, 0.5);
          border: 1px solid rgba(0, 255, 0, 0.3);
          padding: 10px;
          overflow-x: auto;
          font-size: 0.85em;
          max-height: 300px;
          overflow-y: auto;
        }

        .deploy-next-steps {
          margin-top: 15px;
          padding: 10px;
          background: rgba(0, 255, 0, 0.05);
          border-left: 3px solid #00ff00;
        }
      `}</style>
    </div>
  );
}
