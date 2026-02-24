import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authAPI } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [tenantId, setTenantId] = useState(null);
  const [tenantName, setTenantName] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mustChangePassword, setMustChangePassword] = useState(false);

  // Restore session from localStorage
  useEffect(() => {
    const token = localStorage.getItem('access_token');
    const savedUser = localStorage.getItem('user');
    const savedRole = localStorage.getItem('role');
    const savedTenant = localStorage.getItem('tenant_id');
    const savedTenantName = localStorage.getItem('tenant_name');

    if (token && savedUser) {
      setUser(JSON.parse(savedUser));
      setRole(savedRole);
      // Guard against the string "null" being stored
      setTenantId(savedTenant && savedTenant !== 'null' ? savedTenant : null);
      setTenantName(savedTenantName && savedTenantName !== 'null' ? savedTenantName : null);
    }
    setLoading(false);
  }, []);

  const login = useCallback(async (email, password, selectedTenantId) => {
    const payload = { email, password };
    if (selectedTenantId && selectedTenantId !== '__super') {
      payload.tenant_id = selectedTenantId;
    }

    const { data } = await authAPI.login(payload);

    localStorage.setItem('access_token', data.access);
    localStorage.setItem('refresh_token', data.refresh);
    localStorage.setItem('user', JSON.stringify(data.user));
    localStorage.setItem('role', data.role);
    if (data.tenant_id) {
      localStorage.setItem('tenant_id', data.tenant_id);
      localStorage.setItem('tenant_name', data.tenant_name);
    } else {
      // Clear any tenant from a previous session (e.g. superadmin has no tenant)
      localStorage.removeItem('tenant_id');
      localStorage.removeItem('tenant_name');
    }

    setUser(data.user);
    setRole(data.role);
    setTenantId(data.tenant_id);
    setTenantName(data.tenant_name);
    setMustChangePassword(data.must_change_password);

    return data;
  }, []);

  const logout = useCallback(() => {
    localStorage.clear();
    setUser(null);
    setRole(null);
    setTenantId(null);
    setTenantName(null);
    setMustChangePassword(false);
  }, []);

  const switchTenant = useCallback((newTenantId, newTenantName) => {
    setTenantId(newTenantId);
    setTenantName(newTenantName);
    localStorage.setItem('tenant_id', newTenantId);
    localStorage.setItem('tenant_name', newTenantName);
  }, []);

  const value = {
    user, role, tenantId, tenantName, loading,
    mustChangePassword, setMustChangePassword,
    login, logout, switchTenant,
    isAuthenticated: !!user,
    isSuperAdmin: role === 'superadmin',
    isAdmin: role === 'admin' || role === 'superadmin',
    isTesorero: role === 'tesorero',
    isVecino: role === 'vecino',
    isReadOnly: role === 'auditor' || role === 'contador',
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
};
