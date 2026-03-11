import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authAPI } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user,               setUser]               = useState(null);
  const [role,               setRole]               = useState(null);
  const [tenantId,           setTenantId]           = useState(null);
  const [tenantName,         setTenantName]         = useState(null);
  const [userTenants,        setUserTenants]        = useState([]); // [{id, name}]
  const [loading,            setLoading]            = useState(true);
  const [mustChangePassword, setMustChangePassword] = useState(false);

  // ── Restore session from localStorage ────────────────────────────────────
  useEffect(() => {
    const token          = localStorage.getItem('access_token');
    const savedUser      = localStorage.getItem('user');
    const savedRole      = localStorage.getItem('role');
    const savedTenant    = localStorage.getItem('tenant_id');
    const savedTenantName= localStorage.getItem('tenant_name');
    const savedMustChange= localStorage.getItem('must_change_password');

    if (token && savedUser) {
      setUser(JSON.parse(savedUser));
      setRole(savedRole);
      setTenantId(savedTenant && savedTenant !== 'null' ? savedTenant : null);
      setTenantName(savedTenantName && savedTenantName !== 'null' ? savedTenantName : null);
      setMustChangePassword(savedMustChange === 'true');
    }
    setLoading(false);
  }, []);

  // ── Persist auth data to localStorage ────────────────────────────────────
  const _persist = (data) => {
    localStorage.setItem('access_token',  data.access);
    localStorage.setItem('refresh_token', data.refresh);
    localStorage.setItem('user',          JSON.stringify(data.user));
    localStorage.setItem('role',                data.role);
    localStorage.setItem('must_change_password', data.must_change_password ? 'true' : 'false');
    if (data.tenant_id) {
      localStorage.setItem('tenant_id',   data.tenant_id);
      localStorage.setItem('tenant_name', data.tenant_name);
    } else {
      localStorage.removeItem('tenant_id');
      localStorage.removeItem('tenant_name');
    }
  };

  // ── Login ─────────────────────────────────────────────────────────────────
  const login = useCallback(async (email, password, tenantId = null) => {
    const payload = { email, password };
    if (tenantId) payload.tenant_id = tenantId;
    const { data } = await authAPI.login(payload);
    _persist(data);
    setUser(data.user);
    setRole(data.role);
    setTenantId(data.tenant_id);
    setTenantName(data.tenant_name);
    setMustChangePassword(data.must_change_password);
    return data;
  }, []);

  // ── Load the list of tenants the current user belongs to ─────────────────
  const loadUserTenants = useCallback(async () => {
    try {
      const { data } = await authAPI.getMyTenants();
      setUserTenants(Array.isArray(data) ? data : []);
    } catch {
      setUserTenants([]);
    }
  }, []);

  // ── Switch tenant — re-issues JWT with new tenant/role claims ─────────────
  const switchTenant = useCallback(async (newTenantId) => {
    const { data } = await authAPI.switchTenant(newTenantId);
    _persist(data);
    setUser(data.user);
    setRole(data.role);
    setTenantId(data.tenant_id);
    setTenantName(data.tenant_name);
    setMustChangePassword(data.must_change_password);
    return data;
  }, []);

  // ── Logout ────────────────────────────────────────────────────────────────
  const logout = useCallback(() => {
    localStorage.clear();
    setUser(null);
    setRole(null);
    setTenantId(null);
    setTenantName(null);
    setUserTenants([]);
    setMustChangePassword(false);
  }, []);

  const value = {
    user, role, tenantId, tenantName, userTenants, loading,
    mustChangePassword, setMustChangePassword,
    login, logout, switchTenant, loadUserTenants,
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
