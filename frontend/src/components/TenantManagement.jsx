import { useState, useEffect } from 'react';

export default function TenantManagement({ token }) {
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  
  // Form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingTenant, setEditingTenant] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    apiKey: '',
    active: true
  });

  // Statistics state
  const [showStats, setShowStats] = useState(null);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    fetchTenants();
  }, []);

  const fetchTenants = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('https://api.gla1v3.local/api/tenants', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!res.ok) throw new Error('Failed to fetch tenants');
      
      const data = await res.json();
      setTenants(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchTenantStats = async (tenantId) => {
    try {
      const res = await fetch(`https://api.gla1v3.local/api/tenants/${tenantId}/stats`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!res.ok) throw new Error('Failed to fetch stats');
      
      const data = await res.json();
      setStats(data);
      setShowStats(tenantId);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      const url = editingTenant
        ? `https://api.gla1v3.local/api/tenants/${editingTenant.id}`
        : 'https://api.gla1v3.local/api/tenants';

      const method = editingTenant ? 'PUT' : 'POST';
      
      const payload = {
        name: formData.name,
        description: formData.description,
        active: formData.active
      };

      // Only include apiKey if it's provided
      if (formData.apiKey.trim()) {
        payload.apiKey = formData.apiKey;
      }

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Operation failed');
      }

      setSuccess(editingTenant ? 'Tenant updated successfully' : 'Tenant created successfully');
      resetForm();
      fetchTenants();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (tenantId, tenantName) => {
    if (!confirm(`Are you sure you want to delete tenant "${tenantName}"?\n\nThis will permanently delete all agents, tasks, and results associated with this tenant!`)) {
      return;
    }

    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      const res = await fetch(`https://api.gla1v3.local/api/tenants/${tenantId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete tenant');
      }

      setSuccess(`Tenant "${tenantName}" deleted successfully`);
      fetchTenants();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (tenant) => {
    setEditingTenant(tenant);
    setFormData({
      name: tenant.name,
      description: tenant.description || '',
      apiKey: '',
      active: tenant.active
    });
    setShowCreateForm(true);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      apiKey: '',
      active: true
    });
    setEditingTenant(null);
    setShowCreateForm(false);
  };

  return (
    <div style={{ padding: '2rem', color: '#c9d1d9' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h2 style={{ margin: 0, color: '#58a6ff' }}>Tenant Management</h2>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          style={{
            background: '#238636',
            border: 'none',
            color: '#fff',
            padding: '10px 20px',
            borderRadius: 6,
            cursor: 'pointer',
            fontWeight: '600'
          }}
        >
          {showCreateForm ? 'Cancel' : '+ Create Tenant'}
        </button>
      </div>

      {error && (
        <div style={{
          background: '#3d1f1f',
          border: '1px solid #f85149',
          borderRadius: 6,
          padding: '1rem',
          marginBottom: '1rem',
          color: '#f85149'
        }}>
          {error}
        </div>
      )}

      {success && (
        <div style={{
          background: '#1f3d1f',
          border: '1px solid #3fb950',
          borderRadius: 6,
          padding: '1rem',
          marginBottom: '1rem',
          color: '#3fb950'
        }}>
          {success}
        </div>
      )}

      {showCreateForm && (
        <div style={{
          background: '#161b22',
          border: '1px solid #30363d',
          borderRadius: 6,
          padding: '1.5rem',
          marginBottom: '2rem'
        }}>
          <h3 style={{ marginTop: 0, color: '#58a6ff' }}>
            {editingTenant ? 'Edit Tenant' : 'Create New Tenant'}
          </h3>
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                Tenant Name *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                required
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: '#0d1117',
                  border: '1px solid #30363d',
                  borderRadius: 6,
                  color: '#c9d1d9',
                  fontSize: '0.9rem'
                }}
                placeholder="e.g., Acme Corp"
              />
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: '#0d1117',
                  border: '1px solid #30363d',
                  borderRadius: 6,
                  color: '#c9d1d9',
                  fontSize: '0.9rem',
                  fontFamily: 'inherit',
                  resize: 'vertical'
                }}
                placeholder="e.g., Q1 2026 Red Team Engagement"
              />
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                API Key {editingTenant && '(leave blank to keep current)'}
              </label>
              <input
                type="text"
                value={formData.apiKey}
                onChange={e => setFormData({ ...formData, apiKey: e.target.value })}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: '#0d1117',
                  border: '1px solid #30363d',
                  borderRadius: 6,
                  color: '#c9d1d9',
                  fontSize: '0.9rem',
                  fontFamily: 'monospace'
                }}
                placeholder={editingTenant ? '(unchanged)' : '(auto-generated if empty)'}
              />
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={formData.active}
                  onChange={e => setFormData({ ...formData, active: e.target.checked })}
                  style={{ cursor: 'pointer' }}
                />
                <span>Active</span>
              </label>
            </div>

            <div style={{ display: 'flex', gap: '1rem' }}>
              <button
                type="submit"
                disabled={loading}
                style={{
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
                {loading ? 'Saving...' : (editingTenant ? 'Update' : 'Create')}
              </button>
              <button
                type="button"
                onClick={resetForm}
                style={{
                  background: 'transparent',
                  border: '1px solid #30363d',
                  color: '#c9d1d9',
                  padding: '10px 20px',
                  borderRadius: 6,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div style={{
        background: '#161b22',
        border: '1px solid #30363d',
        borderRadius: 6,
        overflow: 'hidden'
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#0d1117', borderBottom: '2px solid #30363d' }}>
              <th style={{ textAlign: 'left', padding: '1rem' }}>Name</th>
              <th style={{ textAlign: 'left', padding: '1rem' }}>Description</th>
              <th style={{ textAlign: 'left', padding: '1rem' }}>API Key</th>
              <th style={{ textAlign: 'left', padding: '1rem' }}>Status</th>
              <th style={{ textAlign: 'left', padding: '1rem' }}>Created</th>
              <th style={{ textAlign: 'right', padding: '1rem' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && tenants.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: '#8b949e' }}>
                  Loading tenants...
                </td>
              </tr>
            ) : tenants.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: '#8b949e' }}>
                  No tenants found
                </td>
              </tr>
            ) : (
              tenants.map(tenant => (
                <tr key={tenant.id} style={{ borderBottom: '1px solid #30363d' }}>
                  <td style={{ padding: '1rem', fontWeight: '600' }}>
                    {tenant.name}
                  </td>
                  <td style={{ padding: '1rem', color: '#8b949e', maxWidth: 300 }}>
                    {tenant.description || '—'}
                  </td>
                  <td style={{ padding: '1rem', fontFamily: 'monospace', fontSize: '0.85rem', color: '#79c0ff' }}>
                    {tenant.api_key?.substring(0, 20)}...
                  </td>
                  <td style={{ padding: '1rem' }}>
                    {tenant.active ? (
                      <span style={{ color: '#3fb950', fontWeight: '600' }}>● Active</span>
                    ) : (
                      <span style={{ color: '#8b949e' }}>○ Inactive</span>
                    )}
                  </td>
                  <td style={{ padding: '1rem', fontSize: '0.85rem', color: '#8b949e' }}>
                    {new Date(tenant.created_at).toLocaleDateString()}
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                      <button
                        onClick={() => fetchTenantStats(tenant.id)}
                        style={{
                          background: 'transparent',
                          border: '1px solid #30363d',
                          color: '#58a6ff',
                          padding: '6px 12px',
                          borderRadius: 6,
                          cursor: 'pointer',
                          fontSize: '0.85rem'
                        }}
                      >
                        Stats
                      </button>
                      <button
                        onClick={() => startEdit(tenant)}
                        style={{
                          background: 'transparent',
                          border: '1px solid #30363d',
                          color: '#58a6ff',
                          padding: '6px 12px',
                          borderRadius: 6,
                          cursor: 'pointer',
                          fontSize: '0.85rem'
                        }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(tenant.id, tenant.name)}
                        disabled={tenant.name === 'default'}
                        style={{
                          background: 'transparent',
                          border: '1px solid #30363d',
                          color: tenant.name === 'default' ? '#6b6f74' : '#f85149',
                          padding: '6px 12px',
                          borderRadius: 6,
                          cursor: tenant.name === 'default' ? 'not-allowed' : 'pointer',
                          fontSize: '0.85rem'
                        }}
                        title={tenant.name === 'default' ? 'Cannot delete default tenant' : ''}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Stats Modal */}
      {showStats && stats && (
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
              Tenant Statistics
            </h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
              <div style={{ background: '#0d1117', padding: '1rem', borderRadius: 6 }}>
                <div style={{ color: '#8b949e', fontSize: '0.85rem', marginBottom: '0.5rem' }}>Total Agents</div>
                <div style={{ fontSize: '2rem', fontWeight: '600', color: '#58a6ff' }}>{stats.total_agents}</div>
                <div style={{ fontSize: '0.75rem', color: '#3fb950' }}>
                  {stats.active_agents} active
                </div>
              </div>

              <div style={{ background: '#0d1117', padding: '1rem', borderRadius: 6 }}>
                <div style={{ color: '#8b949e', fontSize: '0.85rem', marginBottom: '0.5rem' }}>Total Tasks</div>
                <div style={{ fontSize: '2rem', fontWeight: '600', color: '#58a6ff' }}>{stats.total_tasks}</div>
                <div style={{ fontSize: '0.75rem', color: '#ffff00' }}>
                  {stats.pending_tasks} pending
                </div>
              </div>

              <div style={{ background: '#0d1117', padding: '1rem', borderRadius: 6 }}>
                <div style={{ color: '#8b949e', fontSize: '0.85rem', marginBottom: '0.5rem' }}>Completed</div>
                <div style={{ fontSize: '1.5rem', fontWeight: '600', color: '#3fb950' }}>
                  {stats.completed_tasks}
                </div>
              </div>

              <div style={{ background: '#0d1117', padding: '1rem', borderRadius: 6 }}>
                <div style={{ color: '#8b949e', fontSize: '0.85rem', marginBottom: '0.5rem' }}>Failed</div>
                <div style={{ fontSize: '1.5rem', fontWeight: '600', color: '#f85149' }}>
                  {stats.failed_tasks}
                </div>
              </div>
            </div>

            <button
              onClick={() => {
                setShowStats(null);
                setStats(null);
              }}
              style={{
                background: '#238636',
                border: 'none',
                color: '#fff',
                padding: '10px 20px',
                borderRadius: 6,
                cursor: 'pointer',
                fontWeight: '600',
                width: '100%'
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
