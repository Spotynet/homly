import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authAPI } from '../api/client';
import { setAccessToken, clearAccessToken } from '../api/tokenStore';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user,               setUser]               = useState(null);
  const [role,               setRole]               = useState(null);
  const [tenantId,           setTenantId]           = useState(null);
  const [tenantName,         setTenantName]         = useState(null);
  const [userTenants,        setUserTenants]        = useState([]); // [{id, name}]
  const [loading,            setLoading]            = useState(true);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [profileId,          setProfileId]          = useState('');
  // system_role for Homly internal system users (always 'super_admin' for valid system users)
  const [systemRole,         setSystemRole]         = useState(null);

  // ── Restore session on page load ─────────────────────────────────────────
  useEffect(() => {
    const savedUser       = localStorage.getItem('user');
    const savedRole       = localStorage.getItem('role');
    const savedTenant     = localStorage.getItem('tenant_id');
    const savedTenantName = localStorage.getItem('tenant_name');
    const savedMustChange = localStorage.getItem('must_change_password');
    const savedProfileId  = localStorage.getItem('profile_id');
    const savedSystemRole = localStorage.getItem('system_role');

    const restoreSession = async () => {
      try {
        const { data } = await authAPI.refreshToken();
        setAccessToken(data.access);
        if (savedUser) {
          setUser(JSON.parse(savedUser));
          setRole(savedRole);
          setTenantId(savedTenant && savedTenant !== 'null' ? savedTenant : null);
          setTenantName(savedTenantName && savedTenantName !== 'null' ? savedTenantName : null);
          setMustChangePassword(savedMustChange === 'true');
          setProfileId(savedProfileId || '');
          setSystemRole(savedSystemRole && savedSystemRole !== 'null' ? savedSystemRole : null);
        }
      } catch {
        clearAccessToken();
        localStorage.removeItem('user');
        localStorage.removeItem('role');
        localStorage.removeItem('tenant_id');
        localStorage.removeItem('tenant_name');
        localStorage.removeItem('must_change_password');
        localStorage.removeItem('profile_id');
        localStorage.removeItem('system_role');
      } finally {
        setLoading(false);
      }
    };

    restoreSession();
  }, []);

  // ── Persist auth data ─────────────────────────────────────────────────────
  const _persist = (data) => {
    setAccessToken(data.access);
    localStorage.setItem('user',                JSON.stringify(data.user));
    localStorage.setItem('role',                data.role);
    localStorage.setItem('must_change_password', data.must_change_password ? 'true' : 'false');
    localStorage.setItem('profile_id',          data.profile_id || '');
    localStorage.setItem('system_role',         data.system_role || '');
    if (data.tenant_id) {
      localStorage.setItem('tenant_id',   data.tenant_id);
      localStorage.setItem('tenant_name', data.tenant_name);
    } else {
      localStorage.removeItem('tenant_id');
      localStorage.removeItem('tenant_name');
    }
  };

  // ── Login (password) ─────────────────────────────────────────────────────
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
    setProfileId(data.profile_id || '');
    setSystemRole(data.system_role || null);
    return data;
  }, []);

  // ── Login with email code (passwordless) ──────────────────────────────────
  const loginWithCode = useCallback(async (email, code, tenantId = null) => {
    const payload = { email, code };
    if (tenantId) payload.tenant_id = tenantId;
    const { data } = await authAPI.loginWithCode(payload);
    _persist(data);
    setUser(data.user);
    setRole(data.role);
    setTenantId(data.tenant_id);
    setTenantName(data.tenant_name);
    setMustChangePassword(data.must_change_password);
    setProfileId(data.profile_id || '');
    setSystemRole(data.system_role || null);
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
    setProfileId(data.profile_id || '');
    setSystemRole(data.system_role || null);
    return data;
  }, []);

  // ── Logout ────────────────────────────────────────────────────────────────
  const logout = useCallback(async () => {
    try { await authAPI.logout(); } catch { /* ignore — logout anyway */ }
    clearAccessToken();
    localStorage.removeItem('user');
    localStorage.removeItem('role');
    localStorage.removeItem('tenant_id');
    localStorage.removeItem('tenant_name');
    localStorage.removeItem('must_change_password');
    localStorage.removeItem('profile_id');
    localStorage.removeItem('system_role');
    setUser(null);
    setRole(null);
    setTenantId(null);
    setTenantName(null);
    setUserTenants([]);
    setMustChangePassword(false);
    setProfileId('');
    setSystemRole(null);
  }, []);

  const value = {
    user, role, tenantId, tenantName, userTenants, loading,
    mustChangePassword, setMustChangePassword,
    profileId, setProfileId,
    systemRole,
    login, loginWithCode, logout, switchTenant, loadUserTenants,
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
