import { createContext, useState, useEffect, useContext } from 'react';

const TenantContext = createContext();

export function TenantProvider({ children, user, token }) {
  const [tenants, setTenants] = useState([]);
  const [activeTenant, setActiveTenant] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !token) {
      setTenants([]);
      setActiveTenant(null);
      setLoading(false);
      return;
    }

    fetchUserTenants();
  }, [user, token]);

  const fetchUserTenants = async () => {
    try {
      setLoading(true);
      
      // Admins can see all tenants, operators see assigned tenants
      let url = 'https://api.gla1v3.local/api/tenants';
      if (user.role !== 'admin') {
        url = `https://api.gla1v3.local/api/users/${user.id}/tenants`;
      }

      const res = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!res.ok) {
        console.error('Failed to fetch tenants');
        setTenants([]);
        setActiveTenant(null);
        return;
      }

      const data = await res.json();
      const activeTenantList = data.filter(t => t.active);
      
      setTenants(activeTenantList);

      // Restore active tenant from localStorage if valid
      const savedTenantId = localStorage.getItem('gla1v3_active_tenant');
      const savedTenant = activeTenantList.find(t => t.id === savedTenantId);
      
      if (savedTenant) {
        setActiveTenant(savedTenant);
      } else if (activeTenantList.length > 0) {
        // Default to first tenant
        setActiveTenant(activeTenantList[0]);
        localStorage.setItem('gla1v3_active_tenant', activeTenantList[0].id);
      }
    } catch (err) {
      console.error('Error fetching tenants:', err);
      setTenants([]);
      setActiveTenant(null);
    } finally {
      setLoading(false);
    }
  };

  const switchTenant = (tenant) => {
    setActiveTenant(tenant);
    localStorage.setItem('gla1v3_active_tenant', tenant.id);
  };

  const refreshTenants = () => {
    fetchUserTenants();
  };

  return (
    <TenantContext.Provider value={{
      tenants,
      activeTenant,
      switchTenant,
      refreshTenants,
      loading
    }}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  const context = useContext(TenantContext);
  if (!context) {
    throw new Error('useTenant must be used within TenantProvider');
  }
  return context;
}
