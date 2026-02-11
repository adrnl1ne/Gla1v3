
import { useState, useEffect } from 'react';
import Splash from './components/Splash';
import Dashboard from './components/Dashboard';
import TestHome from './components/TestHome';
import Login from './components/Login';
import { TenantProvider } from './context/TenantContext';

function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);

  useEffect(() => {
    // Check for existing token in localStorage
    const savedToken = localStorage.getItem('gla1v3_token');
    const savedUser = localStorage.getItem('gla1v3_user');
    
    if (savedToken && savedUser) {
      setToken(savedToken);
      setUser(JSON.parse(savedUser));
      setIsAuthenticated(true);
    }
  }, []);

  const handleLogin = (authData) => {
    localStorage.setItem('gla1v3_token', authData.token);
    localStorage.setItem('gla1v3_user', JSON.stringify(authData.user));
    setToken(authData.token);
    setUser(authData.user);
    setIsAuthenticated(true);
  };

  const handleLogout = async () => {
    try {
      await fetch('https://api.gla1v3.local/api/auth/logout', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
    } catch (err) {
      console.error('Logout error:', err);
    }
    
    localStorage.removeItem('gla1v3_token');
    localStorage.removeItem('gla1v3_user');
    setToken(null);
    setUser(null);
    setIsAuthenticated(false);
  };

  if (showSplash) {
    return <Splash onEnter={() => setShowSplash(false)} />;
  }

  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <TenantProvider user={user} token={token}>
      <Dashboard user={user} token={token} onLogout={handleLogout} />
    </TenantProvider>
  );
}

export default App;