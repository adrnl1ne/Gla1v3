import { useState } from 'react';

export default function TwoFactorVerify({ tempToken, onSuccess, onCancel }) {
  const [token, setToken] = useState('');
  const [backupCode, setBackupCode] = useState('');
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleVerify = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('https://api.gla1v3.local/api/auth/2fa/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          tempToken,
          token: useBackupCode ? undefined : token,
          backupCode: useBackupCode ? backupCode : undefined
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to verify 2FA');
      }

      onSuccess(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ 
      position: 'fixed', 
      top: 0, 
      left: 0, 
      right: 0, 
      bottom: 0, 
      background: 'rgba(0,0,0,0.8)', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div style={{ 
        background: '#1e1e1e', 
        padding: '2rem', 
        borderRadius: 8, 
        maxWidth: 400,
        width: '90%'
      }}>
        <h2>Two-Factor Authentication</h2>
        
        {error && (
          <div style={{ 
            background: '#ff4444', 
            color: '#fff', 
            padding: '0.75rem', 
            borderRadius: 4, 
            marginBottom: '1rem' 
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleVerify}>
          {!useBackupCode ? (
            <>
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: '#c9d1d9' }}>
                  Enter your 6-digit authentication code:
                </label>
                <input
                  type="text"
                  value={token}
                  onChange={(e) => setToken(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  maxLength={6}
                  required
                  autoFocus
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    background: '#0d1117',
                    border: '1px solid #30363d',
                    borderRadius: 4,
                    color: '#c9d1d9',
                    fontSize: '1.5rem',
                    textAlign: 'center',
                    letterSpacing: '0.5rem'
                  }}
                />
              </div>

              <button
                type="button"
                onClick={() => setUseBackupCode(true)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#1f6feb',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  marginBottom: '1.5rem',
                  textDecoration: 'underline'
                }}
              >
                Use backup code instead
              </button>
            </>
          ) : (
            <>
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: '#c9d1d9' }}>
                  Enter backup code:
                </label>
                <input
                  type="text"
                  value={backupCode}
                  onChange={(e) => setBackupCode(e.target.value.toUpperCase())}
                  placeholder="XXXX-XXXX"
                  maxLength={9}
                  required
                  autoFocus
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    background: '#0d1117',
                    border: '1px solid #30363d',
                    borderRadius: 4,
                    color: '#c9d1d9',
                    fontSize: '1.25rem',
                    textAlign: 'center',
                    letterSpacing: '0.25rem',
                    fontFamily: 'monospace'
                  }}
                />
              </div>

              <button
                type="button"
                onClick={() => setUseBackupCode(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#1f6feb',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  marginBottom: '1.5rem',
                  textDecoration: 'underline'
                }}
              >
                Use authenticator app instead
              </button>
            </>
          )}

          <div style={{ display: 'flex', gap: '1rem' }}>
            <button 
              type="submit" 
              disabled={loading || (!useBackupCode && token.length !== 6) || (useBackupCode && !backupCode)}
              style={{
                flex: 1,
                background: '#2ea043',
                color: '#fff',
                border: 'none',
                padding: '0.75rem',
                borderRadius: 4,
                cursor: loading ? 'wait' : 'pointer',
                opacity: (loading || (!useBackupCode && token.length !== 6) || (useBackupCode && !backupCode)) ? 0.5 : 1
              }}
            >
              {loading ? 'Verifying...' : 'Verify'}
            </button>
            <button 
              type="button" 
              onClick={onCancel}
              style={{
                background: '#21262d',
                color: '#c9d1d9',
                border: '1px solid #30363d',
                padding: '0.75rem 1.5rem',
                borderRadius: 4,
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
          </div>
        </form>

        <p style={{ color: '#8b949e', fontSize: '0.75rem', marginTop: '1rem', textAlign: 'center' }}>
          Open your authenticator app to get the code
        </p>
      </div>
    </div>
  );
}
