import React, { useState } from 'react';
import './modals.css';

const AgentBlacklistModal = ({ agent, onClose, onBlacklist }) => {
  const [reason, setReason] = useState('');
  const [ttl, setTtl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleBlacklist = async () => {
    if (!reason.trim()) {
      setError('Please provide a reason for blacklisting');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const token = localStorage.getItem('gla1v3_token');
      const payload = {
        reason: reason.trim()
      };

      // Add TTL if specified (in seconds)
      if (ttl && parseInt(ttl) > 0) {
        payload.ttl = parseInt(ttl);
      }

      const response = await fetch(`https://api.gla1v3.local/api/agents/${agent.id}/blacklist`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to blacklist agent');
      }

      const data = await response.json();
      
      // Notify parent component
      if (onBlacklist) {
        onBlacklist(data);
      }

      onClose();
    } catch (err) {
      console.error('Error blacklisting agent:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>🚫 Blacklist Agent</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          <div className="agent-info">
            <p><strong>Agent ID:</strong> {agent.id}</p>
            <p><strong>Hostname:</strong> {agent.hostname || 'N/A'}</p>
            <p><strong>IP:</strong> {agent.ip_address || 'N/A'}</p>
          </div>

          <div className="warning-box">
            <p>⚠️ <strong>Warning:</strong> Blacklisting this agent will immediately revoke its access. 
            The agent will be blocked from checking in and receiving tasks until removed from the blacklist.</p>
          </div>

          <div className="form-group">
            <label htmlFor="reason">Reason for Blacklisting *</label>
            <textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., Compromised by red team, detected malicious activity, unauthorized access..."
              rows={3}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="ttl">TTL (Time to Live) in seconds</label>
            <input
              type="number"
              id="ttl"
              value={ttl}
              onChange={(e) => setTtl(e.target.value)}
              placeholder="Leave empty for automatic expiry based on token"
              min="1"
            />
            <small className="form-help">
              Optional: Specify how long the blacklist should last. If not provided, 
              it will use the agent's token expiration time or default to 7 days.
            </small>
          </div>

          {error && (
            <div className="error-message">
              {error}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button 
            className="btn btn-secondary" 
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </button>
          <button 
            className="btn btn-danger" 
            onClick={handleBlacklist}
            disabled={loading || !reason.trim()}
          >
            {loading ? 'Blacklisting...' : '🚫 Blacklist Agent'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AgentBlacklistModal;
