import { useState, useRef, useEffect } from 'react';
import { useTenant } from '../context/TenantContext';

export default function TenantSelector() {
  const { tenants, activeTenant, switchTenant, loading } = useTenant();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (loading) {
    return (
      <div style={{
        padding: '8px 16px',
        background: '#21262d',
        borderRadius: 6,
        color: '#8b949e',
        fontSize: '0.9rem'
      }}>
        Loading tenants...
      </div>
    );
  }

  if (tenants.length === 0) {
    return (
      <div style={{
        padding: '8px 16px',
        background: '#3d1f1f',
        border: '1px solid #f85149',
        borderRadius: 6,
        color: '#f85149',
        fontSize: '0.9rem'
      }}>
        No tenants assigned
      </div>
    );
  }

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          padding: '8px 16px',
          background: '#21262d',
          border: '1px solid #30363d',
          borderRadius: 6,
          color: '#c9d1d9',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '0.9rem',
          fontWeight: '500',
          minWidth: 200,
          justifyContent: 'space-between'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: '#58a6ff' }}>🏢</span>
          <span>{activeTenant?.name || 'Select Tenant'}</span>
        </div>
        <span style={{ color: '#8b949e', fontSize: '0.75rem' }}>▼</span>
      </button>

      {isOpen && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 4px)',
          left: 0,
          right: 0,
          background: '#161b22',
          border: '1px solid #30363d',
          borderRadius: 6,
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          zIndex: 1000,
          maxHeight: '300px',
          overflowY: 'auto'
        }}>
          {tenants.map(tenant => (
            <div
              key={tenant.id}
              onClick={() => {
                switchTenant(tenant);
                setIsOpen(false);
              }}
              style={{
                padding: '10px 16px',
                cursor: 'pointer',
                borderBottom: '1px solid #21262d',
                background: activeTenant?.id === tenant.id ? '#1f2937' : 'transparent',
                transition: 'background 0.15s'
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#21262d'}
              onMouseLeave={e => e.currentTarget.style.background = activeTenant?.id === tenant.id ? '#1f2937' : 'transparent'}
            >
              <div style={{
                color: '#c9d1d9',
                fontWeight: activeTenant?.id === tenant.id ? '600' : '400',
                marginBottom: '4px'
              }}>
                {tenant.name}
                {activeTenant?.id === tenant.id && (
                  <span style={{ color: '#58a6ff', marginLeft: '8px' }}>✓</span>
                )}
              </div>
              {tenant.description && (
                <div style={{
                  color: '#8b949e',
                  fontSize: '0.8rem'
                }}>
                  {tenant.description}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
