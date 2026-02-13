import { useState, useRef, useEffect } from 'react';

export default function UserMenu({ user, onOpenProfile, onOpen2FA, onLogout }) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={menuRef} style={{ position: 'relative' }}>
      {/* User Avatar Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          background: 'linear-gradient(135deg, #1f6feb 0%, #0d419d 100%)',
          border: '2px solid #30363d',
          borderRadius: '50%',
          width: 48,
          height: 48,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          fontSize: '1.2rem',
          fontWeight: '700',
          transition: 'all 0.2s',
          boxShadow: '0 2px 8px rgba(31, 111, 235, 0.3)'
        }}
        onMouseEnter={(e) => {
          e.target.style.transform = 'scale(1.1)';
          e.target.style.boxShadow = '0 4px 12px rgba(31, 111, 235, 0.5)';
        }}
        onMouseLeave={(e) => {
          e.target.style.transform = 'scale(1)';
          e.target.style.boxShadow = '0 2px 8px rgba(31, 111, 235, 0.3)';
        }}
        title={`${user?.username} (${user?.role})`}
      >
        {user?.username?.charAt(0).toUpperCase() || 'U'}
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 8px)',
          right: 0,
          background: '#161b22',
          border: '1px solid #30363d',
          borderRadius: 8,
          boxShadow: '0 8px 24px rgba(0,0,0,0.7)',
          minWidth: 220,
          zIndex: 1000,
          overflow: 'hidden'
        }}>
          {/* User Info */}
          <div style={{
            padding: '1rem',
            borderBottom: '1px solid #30363d',
            background: '#0d1117'
          }}>
            <div style={{
              color: '#c9d1d9',
              fontWeight: '600',
              fontSize: '1rem',
              marginBottom: '0.25rem'
            }}>
              {user?.username}
            </div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              <span style={{
                background: user?.role === 'admin' ? '#9e6a03' : '#1f6feb',
                color: '#fff',
                padding: '2px 8px',
                borderRadius: 4,
                fontSize: '0.75rem',
                fontWeight: '600'
              }}>
                {user?.role}
              </span>
              {user?.twoFactorEnabled && (
                <span style={{
                  color: '#3fb950',
                  fontSize: '0.85rem'
                }}
                  title="Two-factor authentication enabled"
                >
                  🔐
                </span>
              )}
            </div>
          </div>

          {/* Menu Items */}
          <div style={{ padding: '0.5rem 0' }}>
            <button
              onClick={() => {
                setIsOpen(false);
                onOpenProfile();
              }}
              style={{
                width: '100%',
                background: 'transparent',
                border: 'none',
                color: '#c9d1d9',
                padding: '0.75rem 1rem',
                textAlign: 'left',
                cursor: 'pointer',
                fontSize: '0.9rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                transition: 'background 0.2s'
              }}
              onMouseEnter={(e) => e.target.style.background = '#21262d'}
              onMouseLeave={(e) => e.target.style.background = 'transparent'}
            >
              <span>⚙️</span>
              <span>Profile Settings</span>
            </button>

            {onOpen2FA && (
              <button
                onClick={() => {
                  setIsOpen(false);
                  onOpen2FA();
                }}
                style={{
                  width: '100%',
                  background: 'transparent',
                  border: 'none',
                  color: user?.twoFactorEnabled ? '#3fb950' : '#9e6a03',
                  padding: '0.75rem 1rem',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  transition: 'background 0.2s'
                }}
                onMouseEnter={(e) => e.target.style.background = '#21262d'}
                onMouseLeave={(e) => e.target.style.background = 'transparent'}
              >
                <span>🔐</span>
                <span>{user?.twoFactorEnabled ? 'Manage 2FA' : 'Setup 2FA'}</span>
              </button>
            )}

            <button
              onClick={() => {
                setIsOpen(false);
                onLogout();
              }}
              style={{
                width: '100%',
                background: 'transparent',
                border: 'none',
                color: '#f85149',
                padding: '0.75rem 1rem',
                textAlign: 'left',
                cursor: 'pointer',
                fontSize: '0.9rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                transition: 'background 0.2s'
              }}
              onMouseEnter={(e) => {
                e.target.style.background = '#21262d';
              }}
              onMouseLeave={(e) => {
                e.target.style.background = 'transparent';
              }}
            >
              <span>🚪</span>
              <span>Logout</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
