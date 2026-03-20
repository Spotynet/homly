import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { HomlyBrand, APP_VERSION, ROLES } from '../../utils/helpers';
import { notificationsAPI, tenantsAPI } from '../../api/client';
import {
  Home, Globe, FileText, ShoppingBag, Receipt, Settings,
  Users, Building, Shield, LogOut, Menu, X, Calendar,
  ChevronDown, Check, Building2, Bell, CheckCheck,
} from 'lucide-react';

const NAV_ITEMS = {
  superadmin: [
    { section: 'system', label: 'Sistema', items: [
      { path: '/app/dashboard',       icon: Home,    label: 'Dashboard' },
      { path: '/app/sistema/tenants', icon: Globe,   label: 'Tenants'  },
    ]},
    { section: 'tenant', label: 'Tenant Actual', items: [
      { path: '/app/reservas',       icon: Calendar,    label: 'Reservas'         },
      { path: '/app/cobranza',       icon: Receipt,     label: 'Cobranza Mensual' },
      { path: '/app/gastos',         icon: ShoppingBag, label: 'Gastos'           },
      { path: '/app/estado-cuenta',  icon: FileText,    label: 'Estado de Cuenta' },
      { path: '/app/notificaciones', icon: Bell,        label: 'Notificaciones'   },
      { path: '/app/config',         icon: Settings,    label: 'Configuración'    },
    ]},
  ],

  admin: [{ section: 'main', items: [
    { path: '/app/dashboard',       icon: Home,        label: 'Dashboard'        },
    { path: '/app/reservas',        icon: Calendar,    label: 'Reservas'         },
    { path: '/app/cobranza',        icon: Receipt,     label: 'Cobranza Mensual' },
    { path: '/app/gastos',          icon: ShoppingBag, label: 'Gastos'           },
    { path: '/app/estado-cuenta',   icon: FileText,    label: 'Estado de Cuenta' },
    { path: '/app/notificaciones',  icon: Bell,        label: 'Notificaciones'   },
    { path: '/app/config',          icon: Settings,    label: 'Configuración'    },
  ]}],

  tesorero: [{ section: 'main', items: [
    { path: '/app/dashboard',       icon: Home,        label: 'Dashboard'        },
    { path: '/app/reservas',        icon: Calendar,    label: 'Reservas'         },
    { path: '/app/cobranza',        icon: Receipt,     label: 'Cobranza Mensual' },
    { path: '/app/gastos',          icon: ShoppingBag, label: 'Gastos'           },
    { path: '/app/estado-cuenta',   icon: FileText,    label: 'Estado de Cuenta' },
    { path: '/app/notificaciones',  icon: Bell,        label: 'Notificaciones'   },
    { path: '/app/config',          icon: Settings,    label: 'Configuración'    },
  ]}],

  contador: [{ section: 'main', items: [
    { path: '/app/dashboard',       icon: Home,        label: 'Dashboard'        },
    { path: '/app/cobranza',        icon: Receipt,     label: 'Cobranza Mensual' },
    { path: '/app/gastos',          icon: ShoppingBag, label: 'Gastos'           },
    { path: '/app/estado-cuenta',   icon: FileText,    label: 'Estado de Cuenta' },
    { path: '/app/notificaciones',  icon: Bell,        label: 'Notificaciones'   },
  ]}],

  auditor: [{ section: 'main', items: [
    { path: '/app/dashboard',       icon: Home,        label: 'Dashboard'        },
    { path: '/app/gastos',          icon: ShoppingBag, label: 'Gastos'           },
    { path: '/app/estado-cuenta',   icon: FileText,    label: 'Estado de Cuenta' },
    { path: '/app/notificaciones',  icon: Bell,        label: 'Notificaciones'   },
  ]}],

  vigilante: [{ section: 'main', items: [
    { path: '/app/dashboard',       icon: Home,     label: 'Dashboard'      },
    { path: '/app/reservas',        icon: Calendar, label: 'Reservas'       },
    { path: '/app/notificaciones',  icon: Bell,     label: 'Notificaciones' },
  ]}],

  vecino: [{ section: 'main', items: [
    { path: '/app/my-unit',         icon: Home,     label: 'Mi Unidad'        },
    { path: '/app/reservas',        icon: Calendar, label: 'Reservas'         },
    { path: '/app/estado-cuenta',   icon: FileText, label: 'Estado de Cuenta' },
    { path: '/app/notificaciones',  icon: Bell,     label: 'Notificaciones'   },
  ]}],
};

// Maps each nav path to its module key (for permission filtering)
const PATH_TO_MODULE = {
  '/app/dashboard':      'dashboard',
  '/app/reservas':       'reservas',
  '/app/cobranza':       'cobranza',
  '/app/gastos':         'gastos',
  '/app/estado-cuenta':  'estado_cuenta',
  '/app/notificaciones': 'notificaciones',
  '/app/config':         'config',
  '/app/my-unit':        'my_unit',
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
  'notificaciones': 'Notificaciones',
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

  // Dropdown available as long as there's at least one tenant to pick
  const canSwitch = userTenants.length > 0;

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

  // Helper: render avatar for a tenant (logo image or fallback icon)
  const TenantAvatar = ({ logo, size = 32, active = false, radius = 8 }) => {
    const logoSrc = logo
      ? (logo.startsWith('data:') ? logo : `data:image/png;base64,${logo}`)
      : null;
    return (
      <div style={{
        width: size, height: size, borderRadius: radius, flexShrink: 0,
        background: logoSrc ? 'white' : (active ? 'var(--teal-500)' : 'var(--sand-200)'),
        border: logoSrc ? '1px solid var(--sand-100)' : 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden',
      }}>
        {logoSrc
          ? <img src={logoSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          : <Building2 size={size * 0.5} color={active ? 'white' : 'var(--ink-400)'} />
        }
      </div>
    );
  };

  // Logo del tenant activo (buscado dentro de userTenants)
  const activeTenantLogo = userTenants.find(t => t.id === tenantId)?.logo || null;

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
        {/* Avatar — logo del tenant activo o icono de fallback */}
        <TenantAvatar logo={activeTenantLogo} size={32} radius={8} />

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
                {/* Logo del tenant en la opción del dropdown */}
                <TenantAvatar logo={t.logo} size={28} active={active} radius={6} />
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

// ── Notification Bell + Dropdown ────────────────────────────────────────────
function NotificationBell({ tenantId }) {
  const navigate = useNavigate();
  const [open,        setOpen]        = useState(false);
  const [unread,      setUnread]      = useState(0);
  const [notifs,      setNotifs]      = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const ref = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handle = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  // Poll unread count every 60 s
  const fetchCount = useCallback(async () => {
    if (!tenantId) return;
    try {
      const r = await notificationsAPI.unreadCount(tenantId);
      setUnread(r.data.count || 0);
    } catch { /* silent */ }
  }, [tenantId]);

  useEffect(() => {
    fetchCount();
    const id = setInterval(fetchCount, 60000);
    return () => clearInterval(id);
  }, [fetchCount]);

  // Load list when opening; also refresh the badge count
  const handleOpen = async () => {
    if (!tenantId) return;
    setOpen(o => !o);
    if (!open) {
      setLoadingList(true);
      try {
        const [listRes] = await Promise.all([
          notificationsAPI.list(tenantId, {}),
          fetchCount(),   // refresh badge count in parallel
        ]);
        setNotifs((listRes.data || []).slice(0, 10));
      } catch { /* silent */ }
      finally { setLoadingList(false); }
    }
  };

  const handleMarkAll = async () => {
    if (!tenantId) return;
    await notificationsAPI.markAllRead(tenantId).catch(() => {});
    setNotifs(prev => prev.map(n => ({ ...n, is_read: true })));
    setUnread(0);
  };

  const handleClickNotif = async (n) => {
    if (!n.is_read) {
      await notificationsAPI.markRead(tenantId, n.id).catch(() => {});
      setNotifs(prev => prev.map(x => x.id === n.id ? { ...x, is_read: true } : x));
      setUnread(prev => Math.max(0, prev - 1));
    }
    setOpen(false);
    if (n.related_reservation_id) navigate('/app/reservas');
  };

  const TYPE_ICON = {
    reservation_new:       '📅',
    reservation_approved:  '✅',
    reservation_rejected:  '❌',
    reservation_cancelled: '🚫',
    general:               'ℹ️',
  };

  function timeAgo(dateStr) {
    const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
    if (diff < 60) return 'ahora';
    if (diff < 3600) return `${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} h`;
    return `${Math.floor(diff / 86400)} d`;
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={handleOpen}
        title="Notificaciones"
        style={{
          position: 'relative', background: 'none', border: 'none',
          cursor: 'pointer', padding: '6px', borderRadius: 8,
          color: 'var(--ink-500)', display: 'flex', alignItems: 'center',
          transition: 'background 0.15s',
        }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--sand-100)'}
        onMouseLeave={e => e.currentTarget.style.background = 'none'}
      >
        <Bell size={20} />
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: 2, right: 2,
            minWidth: 16, height: 16, borderRadius: 8,
            background: 'var(--coral-500)', color: 'white',
            fontSize: 9, fontWeight: 800, lineHeight: '16px', textAlign: 'center',
            padding: '0 3px',
          }}>
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0,
          width: 340, maxHeight: 480,
          background: 'var(--white)', border: '1px solid var(--sand-100)',
          borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.14)',
          display: 'flex', flexDirection: 'column', zIndex: 300,
          overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--sand-100)', flexShrink: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink-800)' }}>
              Notificaciones {unread > 0 && <span style={{ color: 'var(--coral-500)' }}>({unread})</span>}
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              {unread > 0 && (
                <button onClick={handleMarkAll} title="Marcar todas como leídas"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--teal-500)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600 }}>
                  <CheckCheck size={13} /> Todo leído
                </button>
              )}
              <button onClick={() => { setOpen(false); navigate('/app/notificaciones'); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-400)', fontSize: 11, fontWeight: 600 }}>
                Ver todas →
              </button>
            </div>
          </div>

          {/* List */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {loadingList ? (
              <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--ink-400)', fontSize: 12 }}>Cargando…</div>
            ) : notifs.length === 0 ? (
              <div style={{ padding: '32px 16px', textAlign: 'center' }}>
                <Bell size={28} color="var(--sand-200)" style={{ display: 'block', margin: '0 auto 8px' }} />
                <div style={{ fontSize: 13, color: 'var(--ink-400)' }}>Sin notificaciones</div>
              </div>
            ) : (
              notifs.map(n => (
                <button
                  key={n.id}
                  onClick={() => handleClickNotif(n)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'flex-start', gap: 10,
                    padding: '11px 16px', border: 'none', background: n.is_read ? 'transparent' : 'var(--teal-50)',
                    cursor: 'pointer', textAlign: 'left', borderBottom: '1px solid var(--sand-50)',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = n.is_read ? 'var(--sand-50)' : 'var(--teal-100)'}
                  onMouseLeave={e => e.currentTarget.style.background = n.is_read ? 'transparent' : 'var(--teal-50)'}
                >
                  <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>{TYPE_ICON[n.notif_type] || 'ℹ️'}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: n.is_read ? 500 : 700, color: 'var(--ink-800)', lineHeight: 1.4 }}>
                      {n.title}
                    </div>
                    {n.message && (
                      <div style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 2, lineHeight: 1.4 }}>
                        {n.message}
                      </div>
                    )}
                    <div style={{ fontSize: 10, color: 'var(--ink-300)', marginTop: 3 }}>{timeAgo(n.created_at)}</div>
                  </div>
                  {!n.is_read && (
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--teal-500)', flexShrink: 0, marginTop: 5 }} />
                  )}
                </button>
              ))
            )}
          </div>
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
  const [tenantModulePerms, setTenantModulePerms] = useState({});
  const navigate  = useNavigate();
  const location  = useLocation();

  const roleConfig   = ROLES[role] || ROLES.vecino;
  const isVecino     = role === 'vecino' || role === 'vigilante';

  // Fetch tenant module permissions whenever the active tenant changes
  useEffect(() => {
    if (!tenantId || role === 'superadmin') { setTenantModulePerms({}); return; }
    tenantsAPI.get(tenantId)
      .then(r => setTenantModulePerms(r.data?.module_permissions || {}))
      .catch(() => setTenantModulePerms({}));
  }, [tenantId, role]);

  // Filter nav based on module permissions (superadmin bypasses all filters)
  const rawNav = NAV_ITEMS[role] || NAV_ITEMS.vecino;
  const effectiveNav = role === 'superadmin'
    ? rawNav
    : rawNav.map(group => ({
        ...group,
        items: group.items.filter(item => {
          const moduleKey = PATH_TO_MODULE[item.path];
          if (!moduleKey) return true;
          const rolePerms = tenantModulePerms[role];
          if (rolePerms === undefined) return true; // no custom config → show all defaults
          return rolePerms.includes(moduleKey);
        }),
      })).filter(group => group.items.length > 0);

  // Load the user's tenant list once on mount (needed for sidebar switcher)
  useEffect(() => { loadUserTenants(); }, [loadUserTenants]);

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
        {/* Brand — casita + nombre en verde (fondo crema) */}
        <div className="brand" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px 16px 12px' }}>
          <HomlyBrand iconSize={42} nameHeight={24} />
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
            ? (() => {
                const singleLogo = userTenants.find(t => t.id === tenantId)?.logo || null;
                const singleLogoSrc = singleLogo
                  ? (singleLogo.startsWith('data:') ? singleLogo : `data:image/png;base64,${singleLogo}`)
                  : null;
                return (
                  /* Single tenant — static display */
                  <div className="sidebar-tenant">
                    <div className="sidebar-tenant-avatar" style={{ overflow: 'hidden', background: singleLogoSrc ? 'white' : undefined, border: singleLogoSrc ? '1px solid var(--sand-100)' : undefined, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {singleLogoSrc
                        ? <img src={singleLogoSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                        : <Building2 size={18} color="var(--ink-500)" />
                      }
                    </div>
                    <div className="sidebar-tenant-info">
                      <div className="sidebar-tenant-name">{tenantName}</div>
                    </div>
                  </div>
                );
              })()
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
            <div className="version-badge">v{APP_VERSION}</div>
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
            <button className="mobile-toggle" onClick={() => setSidebarOpen(true)} aria-label="Abrir menú">
              <Menu size={22} />
            </button>
            {/* Page title — módulo activo + nombre del tenant */}
            <div>
              <div className="header-title">{pageTitle}</div>
              {tenantName && <div className="header-subtitle">{tenantName}</div>}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {tenantId && (
              role === 'superadmin' ||
              tenantModulePerms[role] === undefined ||
              (tenantModulePerms[role] || []).includes('notificaciones')
            ) && <NotificationBell tenantId={tenantId} />}
          </div>
        </header>

        {/* Content */}
        <div className="content">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
