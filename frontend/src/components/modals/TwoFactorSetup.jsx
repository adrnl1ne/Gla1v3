import { useState } from 'react';

export default function TwoFactorSetup({ token, onCancel, onSuccess }) {
  const [step, setStep] = useState('generate'); // 'generate' | 'verify'
  const [secret, setSecret] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [verifyToken, setVerifyToken] = useState('');
  const [backupCodes, setBackupCodes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleGenerateSecret = async () => {
    setLoading(true);
    setError('');

    try {
      const res = await fetch('https://api.gla1v3.local/api/auth/2fa/setup', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate 2FA secret');
      }

      setSecret(data.secret);
      setQrCode(data.qrCode);
      setStep('verify');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEnable2FA = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('https://api.gla1v3.local/api/auth/2fa/enable', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ secret, token: verifyToken })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to enable 2FA');
      }

      setBackupCodes(data.backupCodes);
      setStep('complete');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const downloadBackupCodes = () => {
    const text = `Gla1v3 Backup Codes\n\nSave these codes securely. Each can only be used once.\n\n${backupCodes.join('\n')}`;
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'gla1v3-backup-codes.txt';
    a.click();
    URL.revokeObjectURL(url);
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
        maxWidth: 500,
        width: '90%'
      }}>
        <h2>Setup Two-Factor Authentication</h2>

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

        {step === 'generate' && (
          <div>
            <p style={{ color: '#c9d1d9', marginBottom: '1.5rem' }}>
              Two-factor authentication adds an extra layer of security to your account.
              You'll need an authenticator app like Google Authenticator or Authy.
            </p>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button onClick={handleGenerateSecret} disabled={loading} style={{
                background: '#2ea043',
                color: '#fff',
                border: 'none',
                padding: '0.75rem 1.5rem',
                borderRadius: 4,
                cursor: loading ? 'wait' : 'pointer'
              }}>
                {loading ? 'Generating...' : 'Generate QR Code'}
              </button>
              <button onClick={onCancel} style={{
                background: '#21262d',
                color: '#c9d1d9',
                border: '1px solid #30363d',
                padding: '0.75rem 1.5rem',
                borderRadius: 4,
                cursor: 'pointer'
              }}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {step === 'verify' && (
          <form onSubmit={handleEnable2FA}>
            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
              <p style={{ color: '#c9d1d9', marginBottom: '1rem' }}>
                Scan this QR code with your authenticator app:
              </p>
              {qrCode && <img src={qrCode} alt="2FA QR Code" style={{ maxWidth: '100%' }} />}
              <p style={{ color: '#8b949e', fontSize: '0.875rem', marginTop: '0.5rem' }}>
                Manual entry code: <code style={{ background: '#21262d', padding: '2px 6px', borderRadius: 3 }}>{secret}</code>
              </p>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: '#c9d1d9' }}>
                Enter verification code:
              </label>
              <input
                type="text"
                value={verifyToken}
                onChange={(e) => setVerifyToken(e.target.value.replace(/\D/g, ''))}
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
                  fontSize: '1.25rem',
                  textAlign: 'center',
                  letterSpacing: '0.5rem'
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '1rem' }}>
              <button type="submit" disabled={loading || verifyToken.length !== 6} style={{
                background: '#2ea043',
                color: '#fff',
                border: 'none',
                padding: '0.75rem 1.5rem',
                borderRadius: 4,
                cursor: (loading || verifyToken.length !== 6) ? 'not-allowed' : 'pointer',
                opacity: (loading || verifyToken.length !== 6) ? 0.5 : 1
              }}>
                {loading ? 'Enabling...' : 'Enable 2FA'}
              </button>
              <button type="button" onClick={onCancel} style={{
                background: '#21262d',
                color: '#c9d1d9',
                border: '1px solid #30363d',
                padding: '0.75rem 1.5rem',
                borderRadius: 4,
                cursor: 'pointer'
              }}>
                Cancel
              </button>
            </div>
          </form>
        )}

        {step === 'complete' && (
          <div>
            <div style={{ 
              background: '#2ea043', 
              color: '#fff', 
              padding: '0.75rem', 
              borderRadius: 4, 
              marginBottom: '1.5rem',
              textAlign: 'center'
            }}>
              ✅ 2FA Enabled Successfully!
            </div>

            <h3>Backup Codes</h3>
            <p style={{ color: '#c9d1d9', marginBottom: '1rem' }}>
              Save these backup codes securely. Each code can be used once to access your account if you lose your authenticator device.
            </p>

            <div style={{ 
              background: '#0d1117', 
              padding: '1rem', 
              borderRadius: 4, 
              marginBottom: '1rem',
              fontFamily: 'monospace'
            }}>
              {backupCodes.map((code, idx) => (
                <div key={idx} style={{ color: '#c9d1d9', padding: '0.25rem 0' }}>
                  {code}
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '1rem' }}>
              <button onClick={downloadBackupCodes} style={{
                background: '#1f6feb',
                color: '#fff',
                border: 'none',
                padding: '0.75rem 1.5rem',
                borderRadius: 4,
                cursor: 'pointer'
              }}>
                📥 Download Codes
              </button>
              <button onClick={onSuccess} style={{
                background: '#2ea043',
                color: '#fff',
                border: 'none',
                padding: '0.75rem 1.5rem',
                borderRadius: 4,
                cursor: 'pointer'
              }}>
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
