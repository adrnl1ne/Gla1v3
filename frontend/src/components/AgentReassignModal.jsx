import { useState } from 'react';
import { useTenant } from '../context/TenantContext';

export default function AgentReassignModal({ agent, onClose, onSuccess, token }) {
  const { tenants } = useTenant();
  const [selectedTenantId, setSelectedTenantId] = useState(agent.tenant_id || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!selectedTenantId) {
      setError('Please select a tenant');
      return;
    }
    
    if (selectedTenantId === agent.tenant_id) {
      setError('Agent is already in this tenant');
      return;
    }
    
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`https://api.gla1v3.local/api/agents/${agent.id}/tenant`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ tenantId: selectedTenantId })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to reassign agent');
      }

      onSuccess && onSuccess();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Get current tenant name
  const currentTenant = tenants.find(t => t.id === agent.tenant_id);

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999
    }}>
      <div style={{
        background: '#161b22',
        border: '1px solid #30363d',
        borderRadius: 12,
        padding: '2rem',
        maxWidth: 500,
        width: '90%'
      }}>
        <h3 style={{ marginTop: 0, color: '#58a6ff' }}>
          Reassign Agent
        </h3>

        <div style={{
          background: '#0d1117',
          padding: '1rem',
          borderRadius: 6,
          marginBottom: '1.5rem'
        }}>
          <div style={{ marginBottom: '0.5rem', color: '#8b949e', fontSize: '0.85rem' }}>
            Agent ID
          </div>
          <div style={{ fontFamily: 'monospace', color: '#c9d1d9', marginBottom: '1rem' }}>
            {agent.id}
          </div>

          <div style={{ marginBottom: '0.5rem', color: '#8b949e', fontSize: '0.85rem' }}>
            Hostname
          </div>
          <div style={{ color: '#c9d1d9', marginBottom: '1rem' }}>
            {agent.hostname || 'N/A'}
          </div>

          <div style={{ marginBottom: '0.5rem', color: '#8b949e', fontSize: '0.85rem' }}>
            Current Tenant
          </div>
          <div style={{ color: '#58a6ff', fontWeight: '600' }}>
            {currentTenant ? currentTenant.name : 'Unknown'}
          </div>
        </div>

        {error && (
          <div style={{
            background: '#3d1f1f',
            border: '1px solid #f85149',
            borderRadius: 6,
            padding: '0.75rem',
            marginBottom: '1rem',
            color: '#f85149',
            fontSize: '0.9rem'
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{
              display: 'block',
              marginBottom: '0.5rem',
              fontWeight: '500',
              color: '#c9d1d9'
            }}>
              New Tenant *
            </label>
            <select
              value={selectedTenantId}
              onChange={e => setSelectedTenantId(e.target.value)}
              disabled={loading}
              style={{
                width: '100%',
                padding: '10px 12px',
                background: '#0d1117',
                border: '1px solid #30363d',
                borderRadius: 6,
                color: '#c9d1d9',
                fontSize: '0.9rem',
                cursor: 'pointer'
              }}
            >
              <option value="">Select Tenant</option>
              {tenants.map(tenant => (
                <option
                  key={tenant.id}
                  value={tenant.id}
                  disabled={tenant.id === agent.tenant_id}
                >
                  {tenant.name} {tenant.id === agent.tenant_id && '(current)'}
                </option>
              ))}
            </select>
          </div>

          <div style={{
            background: '#26210c',
            border: '1px solid #9e6a03',
            borderRadius: 6,
            padding: '0.75rem',
            marginBottom: '1.5rem',
            color: '#f0b429',
            fontSize: '0.85rem'
          }}>
            ⚠️ <strong>Warning:</strong> Reassigning an agent will move all its tasks and results to the new tenant.
          </div>

          <div style={{ display: 'flex', gap: '1rem' }}>
            <button
              type="submit"
              disabled={loading}
              style={{
                flex: 1,
                background: '#238636',
                border: 'none',
                color: '#fff',
                padding: '10px 20px',
                borderRadius: 6,
                cursor: loading ? 'not-allowed' : 'pointer',
                fontWeight: '600',
                opacity: loading ? 0.5 : 1
              }}
            >
              {loading ? 'Reassigning...' : 'Reassign'}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              style={{
                flex: 1,
                background: 'transparent',
                border: '1px solid #30363d',
                color: '#c9d1d9',
                padding: '10px 20px',
                borderRadius: 6,
                cursor: loading ? 'not-allowed' : 'pointer'
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
