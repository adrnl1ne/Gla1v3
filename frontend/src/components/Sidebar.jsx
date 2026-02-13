import { useState, useEffect, useRef } from 'react';

export default function Sidebar({ activeTab, setActiveTab, user, isOpen, toggleSidebar }) {
  const sidebarRef = useRef(null);
  
  const menuItems = [
    { id: 'agents', label: 'Agents', icon: '🤖', roles: ['admin', 'operator'] },
    { id: 'alerts', label: 'EDR Alerts', icon: '🚨', roles: ['admin', 'operator'] },
    { id: 'edr-config', label: 'EDR Config', icon: '⚙️', roles: ['admin', 'operator'] },
    { id: 'build', label: 'Build Agent', icon: '🔨', roles: ['admin', 'operator'] },
    { id: 'tenants', label: 'Tenants', icon: '👥', roles: ['admin'] },
    { id: 'users', label: 'Users', icon: '👤', roles: ['admin'] },
    { id: 'blacklist', label: 'Blacklist', icon: '🚫', roles: ['admin'] }
  ];
  
  // Auto-collapse when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (isOpen && sidebarRef.current && !sidebarRef.current.contains(event.target)) {
        toggleSidebar();
      }
    };
    
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, toggleSidebar]);

  const filteredItems = menuItems.filter(item => 
    item.roles.includes(user?.role || 'operator')
  );

  return (
    <>
      {/* Overlay when sidebar is open on mobile */}
      {isOpen && (
        <div 
          onClick={toggleSidebar}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 998,
            display: window.innerWidth < 768 ? 'block' : 'none'
          }}
        />
      )}

      {/* Sidebar */}
      <div 
        ref={sidebarRef}
        style={{
          position: 'fixed',
          top: 0,
          right: isOpen ? 0 : '-280px',
          height: '100vh',
          width: '280px',
          background: '#161b22',
          borderLeft: '1px solid #30363d',
          transition: 'right 0.3s ease',
          zIndex: 999,
          display: 'flex',
          flexDirection: 'column',
          boxShadow: isOpen ? '-4px 0 12px rgba(0,0,0,0.5)' : 'none'
        }}>
        {/* Sidebar Header */}
        <div style={{
          padding: '1.5rem 1rem',
          borderBottom: '1px solid #30363d',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ color: '#58a6ff', fontWeight: '700', fontSize: '1.2rem' }}>
            MENU
          </div>
          <button
            onClick={toggleSidebar}
            style={{
              background: 'transparent',
              border: '1px solid #30363d',
              color: '#8b949e',
              padding: '6px 12px',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: '1.2rem',
              lineHeight: 1
            }}
            title="Close sidebar"
          >
            ✕
          </button>
        </div>

        {/* Menu Items */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '1rem 0'
        }}>
          {filteredItems.map(item => (
            <button
              key={item.id}
              onClick={() => {
                setActiveTab(item.id);
                if (window.innerWidth < 768) toggleSidebar();
              }}
              style={{
                width: '100%',
                background: activeTab === item.id ? '#1f6feb' : 'transparent',
                border: 'none',
                color: activeTab === item.id ? '#fff' : '#c9d1d9',
                padding: '0.875rem 1.5rem',
                textAlign: 'left',
                cursor: 'pointer',
                fontSize: '0.95rem',
                fontWeight: activeTab === item.id ? '600' : '400',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                transition: 'all 0.2s',
                borderLeft: activeTab === item.id ? '4px solid #58a6ff' : '4px solid transparent'
              }}
              onMouseEnter={(e) => {
                if (activeTab !== item.id) {
                  e.target.style.background = '#21262d';
                }
              }}
              onMouseLeave={(e) => {
                if (activeTab !== item.id) {
                  e.target.style.background = 'transparent';
                }
              }}
            >
              <span style={{ fontSize: '1.25rem' }}>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </div>

        {/* Sidebar Footer */}
        <div style={{
          padding: '1rem',
          borderTop: '1px solid #30363d',
          color: '#8b949e',
          fontSize: '0.8rem',
          textAlign: 'center'
        }}>
          GLA1V3 C2 Platform
          <div style={{ marginTop: '0.25rem', fontSize: '0.75rem', color: '#6e7681' }}>
            v2.0.0
          </div>
        </div>
      </div>


    </>
  );
}
