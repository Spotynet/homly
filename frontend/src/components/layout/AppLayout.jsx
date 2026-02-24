import React, { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { HOMLY_LOGO, APP_VERSION, ROLES } from '../../utils/helpers';
import { Home, Globe, FileText, ShoppingBag, Receipt, Settings, Users, Building, Shield, LogOut, Menu, X } from 'lucide-react';

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

export default function AppLayout() {
  const { user, role, tenantName, logout, isSuperAdmin } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const roleConfig = ROLES[role] || ROLES.vecino;
  const navGroups = NAV_ITEMS[role] || NAV_ITEMS.vecino;
  // For contador/auditor, show same as tesorero but read-only
  const effectiveNav = ['contador', 'auditor'].includes(role) ? NAV_ITEMS.tesorero : navGroups;

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const initials = user?.name?.split(' ').map(w => w[0]).join('').slice(0, 2) || '?';

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/30 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed lg:static inset-y-0 left-0 z-50 w-72 bg-white border-r border-slate-200 flex flex-col transform transition-transform duration-200 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        {/* Brand */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-100">
          <div className="w-9 h-9">{HOMLY_LOGO}</div>
          <div>
            <h1 className="text-lg font-extrabold text-teal-800 leading-none">
              homly<span className="brand-dot">.</span>
            </h1>
            <span className="text-[10px] text-ink-400 font-semibold">Property Management</span>
          </div>
        </div>

        {/* Tenant selector (super admin) */}
        {tenantName && (
          <div className="px-4 py-3 border-b border-slate-100">
            <div className="flex items-center gap-3 px-2">
              <div className="w-8 h-8 rounded-lg bg-teal-100 flex items-center justify-center text-teal-700 font-bold text-xs">
                {tenantName?.[0]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-ink-800 truncate">{tenantName}</div>
                {isSuperAdmin && <div className="text-[10px] text-ink-400">Cambiar tenant</div>}
              </div>
            </div>
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {effectiveNav.map((group, gi) => (
            <div key={gi}>
              {group.label && (
                <div className="px-3 pt-4 pb-2 text-[10px] font-bold text-ink-400 uppercase tracking-wider">
                  {group.label}
                </div>
              )}
              {group.items.map(item => {
                const active = location.pathname === item.path;
                const Icon = item.icon;
                return (
                  <button key={item.path} onClick={() => { navigate(item.path); setSidebarOpen(false); }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                      active
                        ? 'bg-teal-50 text-teal-700'
                        : 'text-ink-500 hover:bg-slate-50 hover:text-ink-700'
                    }`}>
                    <Icon size={18} />
                    {item.label}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-4 py-4 border-t border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-xs font-bold"
              style={{ background: roleConfig.color }}>
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-ink-800 truncate">{user?.name}</div>
              <div className="text-[10px] font-semibold" style={{ color: roleConfig.color }}>
                {roleConfig.label}
              </div>
              <div className="text-[9px] text-ink-400 mt-0.5">
                v{APP_VERSION} · <span className="text-teal-500">💾 Auto-guardado</span>
              </div>
              <div className="text-[9px] text-ink-400">Powered by Spotynet</div>
            </div>
            <button onClick={handleLogout} className="btn-icon" title="Cerrar sesión">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-200">
          <div className="flex items-center gap-4">
            <button className="lg:hidden btn-icon" onClick={() => setSidebarOpen(true)}>
              <Menu size={20} />
            </button>
            <div>
              <h2 className="text-lg font-bold text-ink-800">
                {location.pathname.includes('dashboard') ? 'Dashboard' :
                 location.pathname.includes('tenants') ? 'Gestión de Tenants' :
                 location.pathname.includes('cobranza') ? 'Cobranza Mensual' :
                 location.pathname.includes('gastos') ? 'Gastos del Condominio' :
                 location.pathname.includes('estado-cuenta') ? 'Estado de Cuenta' :
                 location.pathname.includes('config') ? 'Configuración' :
                 location.pathname.includes('units') ? 'Unidades' :
                 location.pathname.includes('users') ? 'Usuarios' :
                 location.pathname.includes('my-unit') ? 'Mi Unidad' : ''}
              </h2>
              {tenantName && <div className="text-xs text-ink-400">{tenantName}</div>}
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
