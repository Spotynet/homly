import React, { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { HOMLY_LOGO, APP_VERSION, ROLES } from '../../utils/helpers';
import { Home, Globe, FileText, ShoppingBag, Receipt, Settings, Users, Building, Shield, LogOut, Menu, X, Search } from 'lucide-react';

const NAV_ITEMS = {
  superadmin: [
    { section: 'system', label: 'Sistema', items: [
      { path: '/app/dashboard', icon: Home, label: 'Dashboard' },
      { path: '/app/tenants', icon: Globe, label: 'Tenants' },
    ]},
    { section: 'tenant', label: 'Tenant Actual', items: [
      { path: '/app/cobranza', icon: Receipt, label: 'Cobranza Mensual' },
      { path: '/app/gastos', icon: ShoppingBag, label: 'Gastos' },
      { path: '/app/estado-cuenta', icon: FileText, label: 'Estado de Cuenta' },
      { path: '/app/config', icon: Settings, label: 'Configuración' },
    ]},
  ],
  admin: [
    { section: 'main', items: [
      { path: '/app/dashboard', icon: Home, label: 'Dashboard' },
      { path: '/app/units', icon: Building, label: 'Unidades' },
      { path: '/app/users', icon: Users, label: 'Usuarios' },
      { path: '/app/cobranza', icon: Receipt, label: 'Cobranza Mensual' },
      { path: '/app/gastos', icon: ShoppingBag, label: 'Gastos' },
      { path: '/app/estado-cuenta', icon: FileText, label: 'Estado de Cuenta' },
      { path: '/app/config', icon: Settings, label: 'Configuración' },
    ]},
  ],
  tesorero: [
    { section: 'main', items: [
      { path: '/app/dashboard', icon: Home, label: 'Dashboard' },
      { path: '/app/cobranza', icon: Receipt, label: 'Cobranza Mensual' },
      { path: '/app/gastos', icon: ShoppingBag, label: 'Gastos' },
      { path: '/app/estado-cuenta', icon: FileText, label: 'Estado de Cuenta' },
    ]},
  ],
  vecino: [
    { section: 'main', items: [
      { path: '/app/my-unit', icon: Home, label: 'Mi Unidad' },
      { path: '/app/estado-cuenta', icon: FileText, label: 'Estado de Cuenta' },
    ]},
  ],
};

const PAGE_TITLES = {
  dashboard: 'Dashboard',
  tenants: 'Gestión de Tenants',
  cobranza: 'Cobranza Mensual',
  gastos: 'Gastos del Condominio',
  'estado-cuenta': 'Estado de Cuenta',
  config: 'Configuración',
  units: 'Unidades',
  users: 'Usuarios',
  'my-unit': 'Mi Unidad',
};

function getPageTitle(pathname) {
  for (const [key, title] of Object.entries(PAGE_TITLES)) {
    if (pathname.includes(key)) return title;
  }
  return '';
}

export default function AppLayout() {
  const { user, role, tenantName, logout, isSuperAdmin } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const roleConfig = ROLES[role] || ROLES.vecino;
  const navGroups = NAV_ITEMS[role] || NAV_ITEMS.vecino;
  const effectiveNav = ['contador', 'auditor'].includes(role) ? NAV_ITEMS.tesorero : navGroups;
  const isVecino = role === 'vecino';

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const initials = user?.name?.split(' ').map(w => w[0]).join('').slice(0, 2) || '?';
  const pageTitle = getPageTitle(location.pathname);

  return (
    <div className="app">
      {/* Sidebar overlay for mobile */}
      <div
        className={`sidebar-overlay${sidebarOpen ? ' show' : ''}`}
        onClick={() => setSidebarOpen(false)}
      />

      {/* Sidebar */}
      <aside className={`sidebar${sidebarOpen ? ' open' : ''}`}>
        {/* Brand */}
        <div className="brand">
          <div className="brand-logo">{HOMLY_LOGO}</div>
          <div className="brand-text">
            <h1>homly<span className="brand-dot">.</span></h1>
            <span>Property Management</span>
          </div>
        </div>

        {/* Tenant selector */}
        {tenantName && (
          <div className="sidebar-tenant">
            <div className="sidebar-tenant-avatar">
              {tenantName?.[0]}
            </div>
            <div className="sidebar-tenant-info">
              <div className="sidebar-tenant-name">{tenantName}</div>
              {isSuperAdmin && <div className="sidebar-tenant-sub">Cambiar tenant</div>}
            </div>
          </div>
        )}

        {/* Navigation */}
        <nav className="sidebar-nav">
          {effectiveNav.map((group, gi) => (
            <div key={gi}>
              {group.label && (
                <div className="nav-group-label">{group.label}</div>
              )}
              {group.items.map(item => {
                const active = location.pathname === item.path;
                const Icon = item.icon;
                return (
                  <button
                    key={item.path}
                    onClick={() => { navigate(item.path); setSidebarOpen(false); }}
                    className={`nav-item${active ? ' active' : ''}`}
                  >
                    <Icon size={18} />
                    {item.label}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="sidebar-footer">
          <div className="sidebar-footer-avatar" style={{ background: roleConfig.color }}>
            {initials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="sidebar-footer-name">{user?.name}</div>
            <div className="sidebar-footer-role" style={{ color: roleConfig.color, fontWeight: 600 }}>
              {roleConfig.label}
            </div>
            <div className="version-badge">v{APP_VERSION} · Powered by Spotynet</div>
          </div>
          <button onClick={handleLogout} className="logout-btn" title="Cerrar sesión">
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="main">
        {/* Header */}
        <header className="header">
          <div className="header-left">
            <button className="mobile-toggle" onClick={() => setSidebarOpen(true)}>
              <Menu size={20} />
            </button>
            <div>
              <div className="header-title">{pageTitle}</div>
              {tenantName && <div className="header-subtitle">{tenantName}</div>}
            </div>
          </div>
          {!isVecino && (
            <div className="search-bar">
              <Search size={16} />
              <input type="text" placeholder="Buscar..." />
            </div>
          )}
        </header>

        {/* Content */}
        <div className="content">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
