import React, { useState, useEffect } from 'react';
import './BlacklistManager.css';

const BlacklistManager = () => {
  const [blacklistedAgents, setBlacklistedAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedTenant, setSelectedTenant] = useState(null);
  const [tenants, setTenants] = useState([]);

  useEffect(() => {
    fetchTenants();
  }, []);

  useEffect(() => {
    if (selectedTenant) {
      fetchBlacklistedAgents();
    }
  }, [selectedTenant]);

  const fetchTenants = async () => {
    try {
      const token = localStorage.getItem('gla1v3_token');
      const response = await fetch('https://api.gla1v3.local/api/tenants', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setTenants(data);
        if (data.length > 0) {
          setSelectedTenant(data[0].id);
        } else {
          setLoading(false);
        }
      } else {
        setLoading(false);
      }
    } catch (err) {
      console.error('Error fetching tenants:', err);
      setLoading(false);
    }
  };

  const fetchBlacklistedAgents = async () => {
    if (!selectedTenant) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const token = localStorage.getItem('gla1v3_token');
      const response = await fetch(`https://api.gla1v3.local/api/agents/blacklist/list?tenant_id=${selectedTenant}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch blacklisted agents');
      }

      const data = await response.json();
      setBlacklistedAgents(data.agents || []);
    } catch (err) {
      console.error('Error fetching blacklisted agents:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveFromBlacklist = async (agentId) => {
    if (!confirm(`Are you sure you want to restore access for agent ${agentId}?`)) {
      return;
    }

    try {
      const token = localStorage.getItem('gla1v3_token');
      const response = await fetch(`https://api.gla1v3.local/api/agents/${agentId}/blacklist`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) {
        throw new Error('Failed to remove agent from blacklist');
      }

      // Refresh the list
      fetchBlacklistedAgents();
    } catch (err) {
      console.error('Error removing from blacklist:', err);
      alert(`Error: ${err.message}`);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString();
  };

  const formatTTL = (ttl) => {
    if (!ttl || ttl < 0) return 'Expired';
    
    const hours = Math.floor(ttl / 3600);
    const minutes = Math.floor((ttl % 3600) / 60);
    
    if (hours > 24) {
      const days = Math.floor(hours / 24);
      return `${days}d ${hours % 24}h`;
    }
    
    return `${hours}h ${minutes}m`;
  };

  return (
    <div className="blacklist-manager">
      <div className="blacklist-header">
        <h2>🚫 Blacklisted Agents</h2>
        {tenants.length > 0 && (
          <div className="tenant-selector">
            <label>Tenant:</label>
            <select 
              value={selectedTenant || ''} 
              onChange={(e) => setSelectedTenant(parseInt(e.target.value))}
            >
              {tenants.map(tenant => (
                <option key={tenant.id} value={tenant.id}>
                  {tenant.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {loading ? (
        <div className="loading">Loading blacklisted agents...</div>
      ) : error ? (
        <div className="error-message">{error}</div>
      ) : tenants.length === 0 ? (
        <div className="empty-state">
          <p>No tenants available</p>
        </div>
      ) : blacklistedAgents.length === 0 ? (
        <div className="empty-state">
          <p>✅ No blacklisted agents for this tenant</p>
        </div>
      ) : (
        <div className="blacklist-table-container">
          <table className="blacklist-table">
            <thead>
              <tr>
                <th>Agent ID</th>
                <th>Reason</th>
                <th>Blacklisted At</th>
                <th>Expires At</th>
                <th>Remaining TTL</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {blacklistedAgents.map((agent) => (
                <tr key={agent.agentId}>
                  <td className="agent-id">{agent.agentId}</td>
                  <td className="reason">{agent.reason}</td>
                  <td>{formatDate(agent.blacklistedAt)}</td>
                  <td>{formatDate(agent.expiresAt)}</td>
                  <td className="ttl">
                    <span className={agent.remainingTTL < 3600 ? 'ttl-warning' : ''}>
                      {formatTTL(agent.remainingTTL)}
                    </span>
                  </td>
                  <td>
                    <button 
                      className="btn btn-remove"
                      onClick={() => handleRemoveFromBlacklist(agent.agentId)}
                      title="Restore agent access"
                    >
                      ✅ Restore
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="blacklist-info">
        <p>
          <strong>ℹ️ About Blacklisting:</strong> Blacklisted agents are immediately blocked from 
          checking in and receiving tasks. They will receive a 403 Forbidden error when attempting 
          to beacon. Blacklist entries automatically expire based on the TTL or can be manually removed.
        </p>
      </div>
    </div>
  );
};

export default BlacklistManager;
