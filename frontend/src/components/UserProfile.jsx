import { useState } from 'react';

export default function UserProfile({ user, token, onClose, onSuccess }) {
  const [formData, setFormData] = useState({
    username: user?.username || '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // Validation
    if (formData.newPassword && formData.newPassword !== formData.confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    if (formData.newPassword && formData.newPassword.length < 6) {
      setError('New password must be at least 6 characters');
      return;
    }

    if (!formData.currentPassword) {
      setError('Current password is required to make changes');
      return;
    }

    setLoading(true);

    try {
      const payload = {
        currentPassword: formData.currentPassword
      };

      if (formData.username !== user.username) {
        payload.username = formData.username;
      }

      if (formData.newPassword) {
        payload.newPassword = formData.newPassword;
      }

      const res = await fetch('https://api.gla1v3.local/api/auth/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to update profile');
      }

      setSuccess('Profile updated successfully!');
      setTimeout(() => {
        onSuccess?.(data);
        onClose();
      }, 1500);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

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
        background: '#0d1117',
        borderRadius: 12,
        width: '90%',
        maxWidth: 500,
        border: '1px solid #30363d',
        boxShadow: '0 8px 32px rgba(0,0,0,0.8)'
      }}>
        {/* Header */}
        <div style={{
          padding: '1.5rem',
          borderBottom: '1px solid #30363d',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h2 style={{
            margin: 0,
            color: '#c9d1d9',
            fontSize: '1.25rem',
            fontWeight: '600'
          }}>
            ⚙️ Profile Settings
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#8b949e',
              fontSize: '1.5rem',
              cursor: 'pointer',
              padding: 4,
              lineHeight: 1
            }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} style={{ padding: '1.5rem' }}>
          {error && (
            <div style={{
              background: '#f85149',
              color: '#fff',
              padding: '0.75rem',
              borderRadius: 6,
              marginBottom: '1rem',
              fontSize: '0.9rem'
            }}>
              {error}
            </div>
          )}

          {success && (
            <div style={{
              background: '#3fb950',
              color: '#fff',
              padding: '0.75rem',
              borderRadius: 6,
              marginBottom: '1rem',
              fontSize: '0.9rem'
            }}>
              {success}
            </div>
          )}

          {/* Username */}
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{
              display: 'block',
              color: '#8b949e',
              fontSize: '0.9rem',
              marginBottom: '0.5rem',
              fontWeight: '600'
            }}>
              Username
            </label>
            <input
              type="text"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              style={{
                width: '100%',
                background: '#161b22',
                border: '1px solid #30363d',
                color: '#c9d1d9',
                padding: '0.75rem',
                borderRadius: 6,
                fontSize: '0.95rem',
                outline: 'none'
              }}
              required
            />
          </div>

          {/* Current Password */}
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{
              display: 'block',
              color: '#8b949e',
              fontSize: '0.9rem',
              marginBottom: '0.5rem',
              fontWeight: '600'
            }}>
              Current Password *
            </label>
            <input
              type="password"
              value={formData.currentPassword}
              onChange={(e) => setFormData({ ...formData, currentPassword: e.target.value })}
              placeholder="Required to make changes"
              style={{
                width: '100%',
                background: '#161b22',
                border: '1px solid #30363d',
                color: '#c9d1d9',
                padding: '0.75rem',
                borderRadius: 6,
                fontSize: '0.95rem',
                outline: 'none'
              }}
              required
            />
          </div>

          {/* Divider */}
          <div style={{
            borderTop: '1px solid #30363d',
            margin: '1.5rem 0',
            paddingTop: '1.5rem'
          }}>
            <div style={{
              color: '#8b949e',
              fontSize: '0.85rem',
              marginBottom: '1rem'
            }}>
              Leave blank to keep current password
            </div>
          </div>

          {/* New Password */}
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{
              display: 'block',
              color: '#8b949e',
              fontSize: '0.9rem',
              marginBottom: '0.5rem',
              fontWeight: '600'
            }}>
              New Password (optional)
            </label>
            <input
              type="password"
              value={formData.newPassword}
              onChange={(e) => setFormData({ ...formData, newPassword: e.target.value })}
              placeholder="Min. 6 characters"
              style={{
                width: '100%',
                background: '#161b22',
                border: '1px solid #30363d',
                color: '#c9d1d9',
                padding: '0.75rem',
                borderRadius: 6,
                fontSize: '0.95rem',
                outline: 'none'
              }}
            />
          </div>

          {/* Confirm Password */}
          {formData.newPassword && (
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{
                display: 'block',
                color: '#8b949e',
                fontSize: '0.9rem',
                marginBottom: '0.5rem',
                fontWeight: '600'
              }}>
                Confirm New Password
              </label>
              <input
                type="password"
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                placeholder="Re-enter new password"
                style={{
                  width: '100%',
                  background: '#161b22',
                  border: '1px solid #30363d',
                  color: '#c9d1d9',
                  padding: '0.75rem',
                  borderRadius: 6,
                  fontSize: '0.95rem',
                  outline: 'none'
                }}
              />
            </div>
          )}

          {/* Buttons */}
          <div style={{
            display: 'flex',
            gap: '0.75rem',
            marginTop: '2rem'
          }}>
            <button
              type="submit"
              disabled={loading}
              style={{
                flex: 1,
                background: loading ? '#21262d' : '#238636',
                border: 'none',
                color: '#fff',
                padding: '0.875rem',
                borderRadius: 6,
                fontSize: '0.95rem',
                fontWeight: '600',
                cursor: loading ? 'not-allowed' : 'pointer'
              }}
            >
              {loading ? 'Updating...' : 'Save Changes'}
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'transparent',
                border: '1px solid #30363d',
                color: '#c9d1d9',
                padding: '0.875rem 1.5rem',
                borderRadius: 6,
                fontSize: '0.95rem',
                fontWeight: '600',
                cursor: 'pointer'
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
