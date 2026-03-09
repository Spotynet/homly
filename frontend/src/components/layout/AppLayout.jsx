import React, { useState, useEffect, useRef } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { HOMLY_LOGO, APP_VERSION, ROLES } from '../../utils/helpers';
import {
  Home, Globe, FileText, ShoppingBag, Receipt, Settings,
  Users, Building, Shield, LogOut, Menu, X, Search, Calendar,
  ChevronDown, Check, Building2,
} from 'lucide-react';

const NAV_ITEMS = {
  superadmin: [
    { section: 'system', label: 'Sistema', items: [
      { path: '/app/dashboard',       icon: Home,    label: 'Dashboard' },
      { path: '/app/sistema/tenants', icon: Globe,   label: 'Tenants'  },
    ]},
    { section: 'tenant', label: 'Tenant Actual', items: [
      { path: '/app/reservas',      icon: Calendar,    label: 'Reservas'         },
      { path: '/app/cobranza',      icon: Receipt,     label: 'Cobranza Mensual' },
      { path: '/app/gastos',        icon: ShoppingBag, label: 'Gastos'           },
      { path: '/app/estado-cuenta', icon: FileText,    label: 'Estado de Cuenta' },
      { path: '/app/config',        icon: Settings,    label: 'Configuración'    },
    ]},
  ],

  admin: [{ section: 'main', items: [
    { path: '/app/dashboard',     icon: Home,        label: 'Dashboard'        },
    { path: '/app/reservas',      icon: Calendar,    label: 'Reservas'         },
    { path: '/app/cobranza',      icon: Receipt,     label: 'Cobranza Mensual' },
    { path: '/app/gastos',        icon: ShoppingBag, label: 'Gastos'           },
    { path: '/app/estado-cuenta', icon: FileText,    label: 'Estado de Cuenta' },
    { path: '/app/config',        icon: Settings,    label: 'Configuración'    },
  ]}],

  tesorero: [{ section: 'main', items: [
    { path: '/app/dashboard',     icon: Home,        label: 'Dashboard'        },
    { path: '/app/reservas',      icon: Calendar,    label: 'Reservas'         },
    { path: '/app/cobranza',      icon: Receipt,     label: 'Cobranza Mensual' },
    { path: '/app/gastos',        icon: ShoppingBag, label: 'Gastos'           },
    { path: '/app/estado-cuenta', icon: FileText,    label: 'Estado de Cuenta' },
    { path: '/app/config',        icon: Settings,    label: 'Configuración'    },
  ]}],

  contador: [{ section: 'main', items: [
    { path: '/app/dashboard',     icon: Home,        label: 'Dashboard'        },
    { path: '/app/cobranza',      icon: Receipt,     label: 'Cobranza Mensual' },
    { path: '/app/gastos',        icon: ShoppingBag, label: 'Gastos'           },
    { path: '/app/estado-cuenta', icon: FileText,    label: 'Estado de Cuenta' },
  ]}],

  auditor: [{ section: 'main', items: [
    { path: '/app/dashboard',     icon: Home,        label: 'Dashboard'        },
    { path: '/app/gastos',        icon: ShoppingBag, label: 'Gastos'           },
    { path: '/app/estado-cuenta', icon: FileText,    label: 'Estado de Cuenta' },
  ]}],

  vigilante: [{ section: 'main', items: [
    { path: '/app/dashboard', icon: Home,     label: 'Dashboard' },
    { path: '/app/reservas',  icon: Calendar, label: 'Reservas'  },
  ]}],

  vecino: [{ section: 'main', items: [
    { path: '/app/my-unit',       icon: Home,     label: 'Mi Unidad'        },
    { path: '/app/reservas',      icon: Calendar, label: 'Reservas'         },
    { path: '/app/estado-cuenta', icon: FileText, label: 'Estado de Cuenta' },
  ]}],
};

const PAGE_TITLES = {
  dashboard: 'Dashboard',
  'sistema/tenants': 'Gestión de Tenants',
  cobranza: 'Cobranza Mensual',
  gastos: 'Gastos del Condominio',
  'estado-cuenta': 'Estado de Cuenta',
  config: 'Configuración',
  units: 'Unidades',
  users: 'Usuarios',
  'my-unit': 'Mi Unidad',
  'reservas': 'Reservas de Áreas Comunes',
};

function getPageTitle(pathname) {
  for (const [key, title] of Object.entries(PAGE_TITLES)) {
    if (pathname.includes(key)) return title;
  }
  return '';
}

// ── Tenant Switcher ────────────────────────────────────────────────────────
function TenantSwitcher({ tenantId, tenantName, userTenants, onSwitch }) {
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const ref = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handle = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  // Dropdown is available once tenants have loaded
  const canSwitch = userTenants.length > 1;

  const handleSelect = async (t) => {
    if (t.id === tenantId) { setOpen(false); return; }
    setSwitching(true);
    try {
      await onSwitch(t.id);
      setOpen(false);
    } catch {
      // error handled upstream
    } finally {
      setSwitching(false);
    }
  };

  return (
    <div ref={ref} style={{ position: 'relative', margin: '8px 12px' }}>
      <button
        onClick={() => canSwitch && setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 12px',
          background: open ? 'var(--teal-50)' : 'rgba(255,255,255,0.06)',
          border: `1px solid ${open ? 'var(--teal-200)' : 'rgba(255,255,255,0.10)'}`,
          borderRadius: 10, cursor: canSwitch ? 'pointer' : 'default',
          transition: 'all 0.15s', textAlign: 'left',
        }}
      >
        {/* Avatar */}
        <div style={{
          width: 32, height: 32, borderRadius: 8, flexShrink: 0,
          background: tenantName ? 'var(--teal-500)' : 'var(--sand-200)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, fontWeight: 800, color: 'white',
        }}>
          {tenantName?.[0]?.toUpperCase() || <Building2 size={16} color="var(--ink-400)" />}
        </div>

        {/* Name */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 13, fontWeight: 700,
            color: tenantName ? 'var(--ink-800)' : 'var(--ink-400)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            fontStyle: tenantName ? 'normal' : 'italic',
          }}>
            {switching ? 'Cambiando…' : (tenantName || 'Seleccionar condominio…')}
          </div>
          {userTenants.length > 0 && (
            <div style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 1 }}>
              {userTenants.length} condominio{userTenants.length !== 1 ? 's' : ''}
            </div>
          )}
        </div>

        {/* Chevron */}
        {canSwitch && (
          <ChevronDown size={14} style={{
            color: 'var(--ink-400)', flexShrink: 0,
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.2s',
          }} />
        )}
      </button>

      {/* Dropdown */}
      {open && canSwitch && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 200,
          background: 'var(--white)', border: '1px solid var(--sand-100)',
          borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          overflow: 'hidden',
        }}>
          <div style={{
            padding: '8px 12px 6px',
            fontSize: 10, fontWeight: 800, letterSpacing: '0.06em',
            color: 'var(--ink-400)', textTransform: 'uppercase',
          }}>
            Mis condominios
          </div>
          {userTenants.map(t => {
            const active = t.id === tenantId;
            return (
              <button
                key={t.id}
                onClick={() => handleSelect(t)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 12px',
                  background: active ? 'var(--teal-50)' : 'transparent',
                  border: 'none', cursor: 'pointer', textAlign: 'left',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--sand-50)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = active ? 'var(--teal-50)' : 'transparent'; }}
              >
                <div style={{
                  width: 28, height: 28, borderRadius: 6, flexShrink: 0,
                  background: active ? 'var(--teal-500)' : 'var(--sand-100)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 800,
                  color: active ? 'white' : 'var(--ink-500)',
                }}>
                  {t.name[0]?.toUpperCase()}
                </div>
                <span style={{
                  flex: 1, fontSize: 13, fontWeight: active ? 700 : 500,
                  color: active ? 'var(--teal-700)' : 'var(--ink-700)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {t.name}
                </span>
                {active && <Check size={13} color="var(--teal-500)" style={{ flexShrink: 0 }} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main Layout ─────────────────────────────────────────────────────────────
export default function AppLayout() {
  const {
    user, role, tenantId, tenantName,
    userTenants, loadUserTenants, switchTenant,
    logout, isSuperAdmin,
  } = useAuth();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate  = useNavigate();
  const location  = useLocation();

  const roleConfig   = ROLES[role] || ROLES.vecino;
  const effectiveNav = NAV_ITEMS[role] || NAV_ITEMS.vecino;
  const isVecino     = role === 'vecino' || role === 'vigilante';

  // Load the user's tenant list once on mount
  useEffect(() => { loadUserTenants(); }, [loadUserTenants]);

  // For superadmin: auto-select the first available tenant if none is currently selected.
  // This mirrors how regular admin users always land with a tenant pre-selected on login.
  useEffect(() => {
    if (isSuperAdmin && !tenantId && userTenants.length > 0) {
      switchTenant(userTenants[0].id).catch(() => {});
    }
  }, [userTenants, isSuperAdmin, tenantId, switchTenant]);

  const handleLogout = () => { logout(); navigate('/'); };

  // Switch tenant + navigate to dashboard
  const handleSwitchTenant = async (newTenantId) => {
    await switchTenant(newTenantId);
    navigate('/app/dashboard');
    setSidebarOpen(false);
  };

  const initials  = user?.name?.split(' ').map(w => w[0]).join('').slice(0, 2) || '?';
  const pageTitle = getPageTitle(location.pathname);

  // Show tenant switcher:
  //   • superadmin always (they can switch across all tenants)
  //   • regular users only when assigned to more than one tenant
  const showTenantSwitcher = isSuperAdmin || userTenants.length > 1;

  return (
    <div className="app">
      {/* Sidebar overlay (mobile) */}
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

        {/* Tenant section */}
        {showTenantSwitcher
          ? <TenantSwitcher
              tenantId={tenantId}
              tenantName={tenantName}
              userTenants={userTenants}
              onSwitch={handleSwitchTenant}
            />
          : tenantName
            ? (
              /* Single tenant — static display */
              <div className="sidebar-tenant">
                <div className="sidebar-tenant-avatar">{tenantName?.[0]}</div>
                <div className="sidebar-tenant-info">
                  <div className="sidebar-tenant-name">{tenantName}</div>
                </div>
              </div>
            )
            : null
        }

        {/* Navigation */}
        <nav className="sidebar-nav">
          {effectiveNav.map((group, gi) => (
            <div key={gi}>
              {group.label && (
                <div className="nav-group-label">{group.label}</div>
              )}
              {group.items.map(item => {
                const active = location.pathname === item.path;
                const Icon   = item.icon;
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
