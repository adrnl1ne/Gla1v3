import { useEffect, useState } from 'react';

export default function EDRManager() {
  const [edrs, setEdrs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingEdr, setEditingEdr] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    type: 'wazuh',
    url: '',
    user: '',
    pass: '',
    enabled: true
  });

  // Fetch EDR configs
  const fetchEDRs = async () => {
    try {
      const res = await fetch('https://api.gla1v3.local/api/edr-configs');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setEdrs(data);
      setError(null);
      setLoading(false);
    } catch (err) {
      console.error('Failed to fetch EDR configs:', err);
      setError(err.message);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEDRs();
  }, []);

  // Handle form submit (create or update)
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      const url = editingEdr 
        ? `https://api.gla1v3.local/api/edr-configs/${editingEdr.id}`
        : 'https://api.gla1v3.local/api/edr-configs';
      
      const method = editingEdr ? 'PUT' : 'POST';
      
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      
      // Reset form and refresh list
      setFormData({ name: '', type: 'wazuh', url: '', user: '', pass: '', enabled: true });
      setShowAddForm(false);
      setEditingEdr(null);
      fetchEDRs();
    } catch (err) {
      console.error('Failed to save EDR config:', err);
      alert(`Error: ${err.message}`);
    }
  };

  // Handle delete
  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this EDR configuration?')) return;
    
    try {
      const token = localStorage.getItem('gla1v3_token');
      const res = await fetch(`https://api.gla1v3.local/api/edr-configs/${id}`, {
        method: 'DELETE',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${res.status}`);
      }
      await fetchEDRs();
    } catch (err) {
      console.error('Failed to delete EDR config:', err);
      alert(`Error deleting config: ${err.message}`);
    }
  };

  // Handle edit click
  const handleEdit = (edr) => {
    setEditingEdr(edr);
    setFormData({
      name: edr.name,
      type: edr.type,
      url: edr.url,
      user: edr.user,
      pass: '', // Don't populate password (it's masked)
      enabled: edr.enabled
    });
    setShowAddForm(true);
  };

  // Cancel form
  const handleCancel = () => {
    setFormData({ name: '', type: 'wazuh', url: '', user: '', pass: '', enabled: true });
    setShowAddForm(false);
    setEditingEdr(null);
  };

  if (loading) {
    return <div style={{ color: '#8b949e', fontSize: '1rem' }}>Loading EDR configurations...</div>;
  }

  return (
    <div>
      <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0, color: '#58a6ff' }}>EDR Configurations</h2>
        <button 
          onClick={() => setShowAddForm(!showAddForm)}
          style={{ 
            background: '#238636', 
            border: 'none', 
            color: '#fff', 
            padding: '10px 20px', 
            borderRadius: 6, 
            cursor: 'pointer',
            fontWeight: '600',
            fontSize: '0.9rem'
          }}>
          {showAddForm ? 'Cancel' : '+ Add EDR'}
        </button>
      </div>

      {error && (
        <div style={{ 
          background: '#da3633', 
          color: '#fff', 
          padding: '1rem', 
          borderRadius: 6, 
          marginBottom: '1rem' 
        }}>
          Error: {error}
        </div>
      )}

      {/* Add/Edit Form */}
      {showAddForm && (
        <div style={{ 
          background: '#161b22', 
          border: '1px solid #30363d', 
          borderRadius: 8, 
          padding: '1.5rem', 
          marginBottom: '1.5rem' 
        }}>
          <h3 style={{ marginTop: 0, color: '#c9d1d9' }}>
            {editingEdr ? 'Edit EDR Configuration' : 'Add New EDR'}
          </h3>
          
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: '#8b949e', fontWeight: '600' }}>
                  Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  placeholder="e.g., Wazuh Production"
                  style={{ 
                    width: '100%', 
                    padding: '8px', 
                    background: '#0d1117', 
                    border: '1px solid #30363d', 
                    borderRadius: 6, 
                    color: '#c9d1d9',
                    fontSize: '0.9rem'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: '#8b949e', fontWeight: '600' }}>
                  Type *
                </label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  required
                  style={{ 
                    width: '100%', 
                    padding: '8px', 
                    background: '#0d1117', 
                    border: '1px solid #30363d', 
                    borderRadius: 6, 
                    color: '#c9d1d9',
                    fontSize: '0.9rem'
                  }}>
                  <option value="wazuh">Wazuh</option>
                  <option value="crowdstrike">CrowdStrike</option>
                  <option value="sentinelone">SentinelOne</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: '#8b949e', fontWeight: '600' }}>
                API URL *
              </label>
              <input
                type="text"
                value={formData.url}
                onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                required
                placeholder="e.g., https://wazuh.example.com:55000"
                style={{ 
                  width: '100%', 
                  padding: '8px', 
                  background: '#0d1117', 
                  border: '1px solid #30363d', 
                  borderRadius: 6, 
                  color: '#c9d1d9',
                  fontSize: '0.9rem'
                }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: '#8b949e', fontWeight: '600' }}>
                  Username
                </label>
                <input
                  type="text"
                  value={formData.user}
                  onChange={(e) => setFormData({ ...formData, user: e.target.value })}
                  placeholder="API username"
                  style={{ 
                    width: '100%', 
                    padding: '8px', 
                    background: '#0d1117', 
                    border: '1px solid #30363d', 
                    borderRadius: 6, 
                    color: '#c9d1d9',
                    fontSize: '0.9rem'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: '#8b949e', fontWeight: '600' }}>
                  Password
                </label>
                <input
                  type="password"
                  value={formData.pass}
                  onChange={(e) => setFormData({ ...formData, pass: e.target.value })}
                  placeholder={editingEdr ? 'Leave blank to keep current' : 'API password'}
                  style={{ 
                    width: '100%', 
                    padding: '8px', 
                    background: '#0d1117', 
                    border: '1px solid #30363d', 
                    borderRadius: 6, 
                    color: '#c9d1d9',
                    fontSize: '0.9rem'
                  }}
                />
              </div>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', color: '#c9d1d9', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={formData.enabled}
                  onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                  style={{ marginRight: '0.5rem', cursor: 'pointer' }}
                />
                <span style={{ fontWeight: '600' }}>Enabled</span>
              </label>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button 
                type="submit"
                style={{ 
                  background: '#238636', 
                  border: 'none', 
                  color: '#fff', 
                  padding: '10px 20px', 
                  borderRadius: 6, 
                  cursor: 'pointer',
                  fontWeight: '600'
                }}>
                {editingEdr ? 'Update' : 'Create'}
              </button>
              <button 
                type="button"
                onClick={handleCancel}
                style={{ 
                  background: 'transparent', 
                  border: '1px solid #30363d', 
                  color: '#c9d1d9', 
                  padding: '10px 20px', 
                  borderRadius: 6, 
                  cursor: 'pointer'
                }}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* EDR List */}
      <div style={{ background: '#0d1117', borderRadius: 8, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#161b22', borderBottom: '2px solid #30363d' }}>
              <th style={{ textAlign: 'left', padding: '1rem', color: '#8b949e', fontWeight: '600' }}>Status</th>
              <th style={{ textAlign: 'left', padding: '1rem', color: '#8b949e', fontWeight: '600' }}>Name</th>
              <th style={{ textAlign: 'left', padding: '1rem', color: '#8b949e', fontWeight: '600' }}>Type</th>
              <th style={{ textAlign: 'left', padding: '1rem', color: '#8b949e', fontWeight: '600' }}>URL</th>
              <th style={{ textAlign: 'left', padding: '1rem', color: '#8b949e', fontWeight: '600' }}>User</th>
              <th style={{ textAlign: 'left', padding: '1rem', color: '#8b949e', fontWeight: '600' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {edrs.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: '#8b949e' }}>
                  No EDR configurations found. Click "Add EDR" to create one.
                </td>
              </tr>
            ) : (
              edrs.map((edr) => (
                <tr key={edr.id} style={{ borderBottom: '1px solid #30363d' }}>
                  <td style={{ padding: '1rem' }}>
                    <span style={{ 
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      background: edr.enabled ? '#3fb950' : '#8b949e',
                      marginRight: '0.5rem'
                    }}></span>
                    <span style={{ color: edr.enabled ? '#3fb950' : '#8b949e', fontSize: '0.85rem', fontWeight: '600' }}>
                      {edr.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </td>
                  <td style={{ padding: '1rem', color: '#c9d1d9', fontWeight: '600' }}>{edr.name}</td>
                  <td style={{ padding: '1rem', color: '#58a6ff', textTransform: 'uppercase', fontSize: '0.85rem', fontWeight: '600' }}>
                    {edr.type}
                  </td>
                  <td style={{ padding: '1rem', color: '#8b949e', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                    {edr.url}
                  </td>
                  <td style={{ padding: '1rem', color: '#8b949e', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                    {edr.user || '—'}
                  </td>
                  <td style={{ padding: '1rem' }}>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button 
                        onClick={() => handleEdit(edr)}
                        style={{ 
                          background: 'transparent', 
                          border: '1px solid #30363d', 
                          color: '#58a6ff', 
                          padding: '6px 12px', 
                          borderRadius: 6, 
                          cursor: 'pointer',
                          fontSize: '0.85rem'
                        }}>
                        Edit
                      </button>
                      <button 
                        onClick={() => handleDelete(edr.id)}
                        style={{ 
                          background: 'transparent', 
                          border: '1px solid #da3633', 
                          color: '#da3633', 
                          padding: '6px 12px', 
                          borderRadius: 6, 
                          cursor: 'pointer',
                          fontSize: '0.85rem'
                        }}>
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
    </div>
  );
}
