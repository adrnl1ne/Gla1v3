import { useState, useEffect } from 'react';

export default function UserManagement({ token, currentUser }) {
  const [users, setUsers] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  
  // Form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    role: 'operator',
    active: true,
    tenantIds: []
  });

  // Tenant assignment modal
  const [showTenantModal, setShowTenantModal] = useState(null);
  const [userTenants, setUserTenants] = useState([]);
  const [selectedTenants, setSelectedTenants] = useState([]);

  useEffect(() => {
    fetchUsers();
    fetchTenants();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('https://api.gla1v3.local/api/users', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!res.ok) throw new Error('Failed to fetch users');
      
      const data = await res.json();
      setUsers(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchTenants = async () => {
    try {
      const res = await fetch('https://api.gla1v3.local/api/tenants?activeOnly=true', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!res.ok) throw new Error('Failed to fetch tenants');
      
      const data = await res.json();
      setTenants(data);
    } catch (err) {
      console.error('Failed to fetch tenants:', err);
    }
  };

  const fetchUserTenants = async (userId) => {
    try {
      const res = await fetch(`https://api.gla1v3.local/api/users/${userId}/tenants`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!res.ok) throw new Error('Failed to fetch user tenants');
      
      const data = await res.json();
      setUserTenants(data);
      setSelectedTenants(data.map(t => t.id));
      setShowTenantModal(userId);
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
      const url = editingUser
        ? `https://api.gla1v3.local/api/users/${editingUser.id}`
        : 'https://api.gla1v3.local/api/users';

      const method = editingUser ? 'PUT' : 'POST';
      
      const payload = {
        username: formData.username,
        role: formData.role,
        active: formData.active
      };

      // Only include password if it's provided
      if (formData.password.trim()) {
        payload.password = formData.password;
      }

      // For creation, include tenant IDs
      if (!editingUser && formData.tenantIds.length > 0) {
        payload.tenantIds = formData.tenantIds;
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

      setSuccess(editingUser ? 'User updated successfully' : 'User created successfully');
      resetForm();
      fetchUsers();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (userId, username) => {
    if (userId === currentUser.id) {
      setError('Cannot delete your own account');
      return;
    }

    if (!confirm(`Are you sure you want to delete user "${username}"?`)) {
      return;
    }

    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      const res = await fetch(`https://api.gla1v3.local/api/users/${userId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete user');
      }

      setSuccess(`User "${username}" deleted successfully`);
      fetchUsers();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveTenantAssignments = async () => {
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      const res = await fetch(`https://api.gla1v3.local/api/users/${showTenantModal}/tenants`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ tenantIds: selectedTenants })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update tenant assignments');
      }

      setSuccess('Tenant assignments updated successfully');
      setShowTenantModal(null);
      setUserTenants([]);
      setSelectedTenants([]);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (user) => {
    setEditingUser(user);
    setFormData({
      username: user.username,
      password: '',
      role: user.role,
      active: user.active,
      tenantIds: []
    });
    setShowCreateForm(true);
  };

  const resetForm = () => {
    setFormData({
      username: '',
      password: '',
      role: 'operator',
      active: true,
      tenantIds: []
    });
    setEditingUser(null);
    setShowCreateForm(false);
  };

  const toggleTenant = (tenantId) => {
    setSelectedTenants(prev =>
      prev.includes(tenantId)
        ? prev.filter(id => id !== tenantId)
        : [...prev, tenantId]
    );
  };

  return (
    <div style={{ padding: '2rem', color: '#c9d1d9' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h2 style={{ margin: 0, color: '#58a6ff' }}>User Management</h2>
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
          {showCreateForm ? 'Cancel' : '+ Create User'}
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
            {editingUser ? 'Edit User' : 'Create New User'}
          </h3>
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                Username *
              </label>
              <input
                type="text"
                value={formData.username}
                onChange={e => setFormData({ ...formData, username: e.target.value })}
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
                placeholder="e.g., operator1"
              />
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                Password {editingUser ? '(leave blank to keep current)' : '*'}
              </label>
              <input
                type="password"
                value={formData.password}
                onChange={e => setFormData({ ...formData, password: e.target.value })}
                required={!editingUser}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: '#0d1117',
                  border: '1px solid #30363d',
                  borderRadius: 6,
                  color: '#c9d1d9',
                  fontSize: '0.9rem'
                }}
                placeholder={editingUser ? '(unchanged)' : 'Minimum 8 characters'}
              />
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                Role *
              </label>
              <select
                value={formData.role}
                onChange={e => setFormData({ ...formData, role: e.target.value })}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: '#0d1117',
                  border: '1px solid #30363d',
                  borderRadius: 6,
                  color: '#c9d1d9',
                  fontSize: '0.9rem',
                  cursor: 'pointer'
                }}
              >
                <option value="operator">Operator</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            {!editingUser && tenants.length > 0 && (
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                  Assign to Tenants
                </label>
                <div style={{
                  background: '#0d1117',
                  border: '1px solid #30363d',
                  borderRadius: 6,
                  padding: '0.5rem',
                  maxHeight: 200,
                  overflowY: 'auto'
                }}>
                  {tenants.map(tenant => (
                    <label
                      key={tenant.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '6px',
                        cursor: 'pointer'
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={formData.tenantIds.includes(tenant.id)}
                        onChange={() => {
                          setFormData(prev => ({
                            ...prev,
                            tenantIds: prev.tenantIds.includes(tenant.id)
                              ? prev.tenantIds.filter(id => id !== tenant.id)
                              : [...prev.tenantIds, tenant.id]
                          }));
                        }}
                        style={{ cursor: 'pointer' }}
                      />
                      <span>{tenant.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

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
                {loading ? 'Saving...' : (editingUser ? 'Update' : 'Create')}
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
              <th style={{ textAlign: 'left', padding: '1rem' }}>Username</th>
              <th style={{ textAlign: 'left', padding: '1rem' }}>Role</th>
              <th style={{ textAlign: 'left', padding: '1rem' }}>Status</th>
              <th style={{ textAlign: 'left', padding: '1rem' }}>Created</th>
              <th style={{ textAlign: 'right', padding: '1rem' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && users.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: '#8b949e' }}>
                  Loading users...
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: '#8b949e' }}>
                  No users found
                </td>
              </tr>
            ) : (
              users.map(user => (
                <tr key={user.id} style={{ borderBottom: '1px solid #30363d' }}>
                  <td style={{ padding: '1rem', fontWeight: '600' }}>
                    {user.username}
                    {user.id === currentUser.id && (
                      <span style={{
                        marginLeft: '0.5rem',
                        background: '#1f6feb',
                        color: '#fff',
                        padding: '2px 6px',
                        borderRadius: 4,
                        fontSize: '0.75rem'
                      }}>
                        YOU
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '1rem' }}>
                    <span style={{
                      background: user.role === 'admin' ? '#9e6a03' : '#2d333b',
                      color: user.role === 'admin' ? '#fff' : '#c9d1d9',
                      padding: '4px 10px',
                      borderRadius: 4,
                      fontSize: '0.85rem',
                      fontWeight: '600'
                    }}>
                      {user.role}
                    </span>
                  </td>
                  <td style={{ padding: '1rem' }}>
                    {user.active ? (
                      <span style={{ color: '#3fb950', fontWeight: '600' }}>● Active</span>
                    ) : (
                      <span style={{ color: '#8b949e' }}>○ Inactive</span>
                    )}
                  </td>
                  <td style={{ padding: '1rem', fontSize: '0.85rem', color: '#8b949e' }}>
                    {new Date(user.created_at).toLocaleDateString()}
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                      <button
                        onClick={() => fetchUserTenants(user.id)}
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
                        Tenants
                      </button>
                      <button
                        onClick={() => startEdit(user)}
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
                        onClick={() => handleDelete(user.id, user.username)}
                        disabled={user.id === currentUser.id || user.username === 'admin'}
                        style={{
                          background: 'transparent',
                          border: '1px solid #30363d',
                          color: (user.id === currentUser.id || user.username === 'admin') ? '#6b6f74' : '#f85149',
                          padding: '6px 12px',
                          borderRadius: 6,
                          cursor: (user.id === currentUser.id || user.username === 'admin') ? 'not-allowed' : 'pointer',
                          fontSize: '0.85rem'
                        }}
                        title={(user.id === currentUser.id || user.username === 'admin') ? 'Cannot delete' : ''}
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

      {/* Tenant Assignment Modal */}
      {showTenantModal && (
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
            width: '90%',
            maxHeight: '80vh',
            overflowY: 'auto'
          }}>
            <h3 style={{ marginTop: 0, color: '#58a6ff' }}>
              Manage Tenant Assignments
            </h3>
            
            <div style={{ marginBottom: '1.5rem' }}>
              <p style={{ color: '#8b949e', marginBottom: '1rem' }}>
                Select tenants to assign to this user:
              </p>
              
              {tenants.map(tenant => (
                <label
                  key={tenant.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '10px',
                    background: '#0d1117',
                    borderRadius: 6,
                    marginBottom: '8px',
                    cursor: 'pointer',
                    border: selectedTenants.includes(tenant.id) ? '1px solid #58a6ff' : '1px solid #30363d'
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedTenants.includes(tenant.id)}
                    onChange={() => toggleTenant(tenant.id)}
                    style={{ cursor: 'pointer' }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: '600', color: '#c9d1d9' }}>
                      {tenant.name}
                    </div>
                    {tenant.description && (
                      <div style={{ fontSize: '0.8rem', color: '#8b949e', marginTop: '2px' }}>
                        {tenant.description}
                      </div>
                    )}
                  </div>
                </label>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '1rem' }}>
              <button
                onClick={handleSaveTenantAssignments}
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
                {loading ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={() => {
                  setShowTenantModal(null);
                  setUserTenants([]);
                  setSelectedTenants([]);
                }}
                style={{
                  flex: 1,
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
          </div>
        </div>
      )}
    </div>
  );
}
