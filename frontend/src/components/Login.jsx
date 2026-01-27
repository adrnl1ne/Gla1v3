import { useState } from 'react';

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('https://api.gla1v3.local/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Login failed');
      }

      const data = await res.json();
      onLogin(data);
    } catch (err) {
      console.error('Login error:', err);
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div style={{ 
      height: '100vh', 
      width: '100vw', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center', 
      background: 'linear-gradient(135deg, #0d1117 0%, #1a1e2e 100%)',
      position: 'fixed',
      top: 0,
      left: 0
    }}>
      <div style={{ 
        width: '100%', 
        maxWidth: 420, 
        background: '#161b22', 
        borderRadius: 12, 
        padding: '3rem',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        border: '1px solid #30363d'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h1 style={{ 
            margin: 0, 
            color: '#58a6ff', 
            fontSize: '2.5rem',
            fontFamily: 'monospace',
            letterSpacing: 2
          }}>
            GLA1V3
          </h1>
          <p style={{ 
            margin: '0.5rem 0 0', 
            color: '#8b949e', 
            fontSize: '0.9rem' 
          }}>
            Command & Control Framework
          </p>
        </div>

        {error && (
          <div style={{ 
            background: '#3d1f1f', 
            border: '1px solid #f85149', 
            borderRadius: 6, 
            padding: '1rem',
            marginBottom: '1.5rem',
            color: '#f85149',
            fontSize: '0.9rem'
          }}>
            <strong>Error:</strong> {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ 
              display: 'block', 
              marginBottom: '0.5rem', 
              color: '#c9d1d9',
              fontWeight: '600',
              fontSize: '0.9rem'
            }}>
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus
              placeholder="Enter your username"
              style={{ 
                width: '100%', 
                padding: '0.75rem', 
                background: '#0d1117', 
                border: '1px solid #30363d', 
                borderRadius: 6, 
                color: '#c9d1d9',
                fontSize: '1rem',
                boxSizing: 'border-box'
              }}
            />
          </div>

          <div style={{ marginBottom: '2rem' }}>
            <label style={{ 
              display: 'block', 
              marginBottom: '0.5rem', 
              color: '#c9d1d9',
              fontWeight: '600',
              fontSize: '0.9rem'
            }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="Enter your password"
              style={{ 
                width: '100%', 
                padding: '0.75rem', 
                background: '#0d1117', 
                border: '1px solid #30363d', 
                borderRadius: 6, 
                color: '#c9d1d9',
                fontSize: '1rem',
                boxSizing: 'border-box'
              }}
            />
          </div>

          <button 
            type="submit"
            disabled={loading}
            style={{ 
              width: '100%',
              background: loading ? '#21262d' : '#238636', 
              border: 'none', 
              color: '#fff', 
              padding: '0.875rem', 
              borderRadius: 6, 
              cursor: loading ? 'not-allowed' : 'pointer',
              fontWeight: '600',
              fontSize: '1rem',
              transition: 'all 0.2s'
            }}>
            {loading ? 'Authenticating...' : 'Login'}
          </button>
        </form>

        <div style={{ 
          marginTop: '2rem', 
          paddingTop: '1.5rem', 
          borderTop: '1px solid #30363d',
          textAlign: 'center'
        }}>
          <div style={{ color: '#8b949e', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
            🔒 Secured with JWT + mTLS
          </div>
          <div style={{ color: '#6b6f74', fontSize: '0.75rem' }}>
            Default credentials: admin / admin
          </div>
        </div>
      </div>
    </div>
  );
}
