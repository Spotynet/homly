import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useGuide } from '../../context/GuideContext';
import { HomlyBrand, APP_VERSION, ROLES } from '../../utils/helpers';
import { notificationsAPI, tenantsAPI, paymentPlansAPI } from '../../api/client';
import { ROLE_BASE_MODULES } from '../../constants/modulePermissions';
import GuideModal from '../onboarding/GuideModal';
import {
  Home, Globe, FileText, ShoppingBag, Receipt, Settings,
  Users, Building, Shield, LogOut, Menu, X, Calendar,
  ChevronDown, Check, Building2, Bell, CheckCheck, Activity, Lock, TrendingDown,
  Sparkles, CreditCard, DollarSign, Target,
} from 'lucide-react';

const NAV_ITEMS = {
  superadmin: [
    { section: 'system', label: 'Sistema', items: [
      { path: '/app/sistema/tenants',          icon: Globe,      label: 'Tenants'           },
      { path: '/app/sistema/suscripciones',    icon: CreditCard, label: 'Suscripciones'     },
      { path: '/app/sistema/crm',              icon: Target,     label: 'CRM Comercial'     },
      { path: '/app/sistema/usuarios',         icon: Users,      label: 'Usuarios Sistema'  },
      { path: '/app/sistema/logs',             icon: Activity,   label: 'Logs del Sistema'  },
    ]},
    { section: 'tenant_general', label: 'General', items: [
      { path: '/app/dashboard',      icon: Home,      label: 'Dashboard'     },
      { path: '/app/reservas',       icon: Calendar,  label: 'Reservas'      },
      { path: '/app/notificaciones', icon: Bell,      label: 'Notificaciones' },
      { path: '/app/onboarding',     icon: Sparkles,  label: 'Guías de uso'  },
    ]},
    { section: 'tenant_finanzas', label: 'Finanzas', items: [
      { path: '/app/cobranza',       icon: Receipt,      label: 'Cobranza'          },
      { path: '/app/gastos',         icon: ShoppingBag,  label: 'Gastos'            },
      { path: '/app/caja-chica',     icon: DollarSign,   label: 'Caja Chica'        },
      { path: '/app/estado-cuenta',  icon: FileText,     label: 'Estado de Cuenta'  },
      { path: '/app/plan-pagos',     icon: TrendingDown, label: 'Plan de Pagos'     },
      { path: '/app/cierre-periodo', icon: Lock,         label: 'Cierre de Período' },
    ]},
    { section: 'tenant_ajustes', label: 'Ajustes', items: [
      { path: '/app/config', icon: Settings, label: 'Configuración' },
    ]},
  ],

  admin: [
    { section: 'general', label: 'General', items: [
      { path: '/app/dashboard',      icon: Home,      label: 'Dashboard'      },
      { path: '/app/reservas',       icon: Calendar,  label: 'Reservas'       },
      { path: '/app/notificaciones', icon: Bell,      label: 'Notificaciones' },
      { path: '/app/onboarding',     icon: Sparkles,  label: 'Guías de uso'   },
    ]},
    { section: 'finanzas', label: 'Finanzas', items: [
      { path: '/app/cobranza',       icon: Receipt,      label: 'Cobranza'          },
      { path: '/app/gastos',         icon: ShoppingBag,  label: 'Gastos'            },
      { path: '/app/caja-chica',     icon: DollarSign,   label: 'Caja Chica'        },
      { path: '/app/estado-cuenta',  icon: FileText,     label: 'Estado de Cuenta'  },
      { path: '/app/plan-pagos',     icon: TrendingDown, label: 'Plan de Pagos'     },
      { path: '/app/cierre-periodo', icon: Lock,         label: 'Cierre de Período' },
    ]},
    { section: 'ajustes', label: 'Ajustes', items: [
      { path: '/app/mi-membresia', icon: CreditCard, label: 'Mi Membresía'  },
      { path: '/app/config',       icon: Settings,   label: 'Configuración' },
    ]},
  ],

  tesorero: [
    { section: 'general', label: 'General', items: [
      { path: '/app/dashboard',      icon: Home,      label: 'Dashboard'      },
      { path: '/app/reservas',       icon: Calendar,  label: 'Reservas'       },
      { path: '/app/notificaciones', icon: Bell,      label: 'Notificaciones' },
      { path: '/app/onboarding',     icon: Sparkles,  label: 'Guías de uso'   },
    ]},
    { section: 'finanzas', label: 'Finanzas', items: [
      { path: '/app/cobranza',       icon: Receipt,      label: 'Cobranza'          },
      { path: '/app/gastos',         icon: ShoppingBag,  label: 'Gastos'            },
      { path: '/app/caja-chica',     icon: DollarSign,   label: 'Caja Chica'        },
      { path: '/app/estado-cuenta',  icon: FileText,     label: 'Estado de Cuenta'  },
      { path: '/app/plan-pagos',     icon: TrendingDown, label: 'Plan de Pagos'     },
      { path: '/app/cierre-periodo', icon: Lock,         label: 'Cierre de Período' },
    ]},
  ],

  contador: [
    { section: 'general', label: 'General', items: [
      { path: '/app/dashboard',      icon: Home,      label: 'Dashboard'      },
      { path: '/app/reservas',       icon: Calendar,  label: 'Reservas'       },
      { path: '/app/notificaciones', icon: Bell,      label: 'Notificaciones' },
      { path: '/app/onboarding',     icon: Sparkles,  label: 'Guías de uso'   },
    ]},
    { section: 'finanzas', label: 'Finanzas', items: [
      { path: '/app/cobranza',       icon: Receipt,      label: 'Cobranza'          },
      { path: '/app/gastos',         icon: ShoppingBag,  label: 'Gastos'            },
      { path: '/app/caja-chica',     icon: DollarSign,   label: 'Caja Chica'        },
      { path: '/app/estado-cuenta',  icon: FileText,     label: 'Estado de Cuenta'  },
      { path: '/app/plan-pagos',     icon: TrendingDown, label: 'Plan de Pagos'     },
      { path: '/app/cierre-periodo', icon: Lock,         label: 'Cierre de Período' },
    ]},
  ],

  auditor: [
    { section: 'general', label: 'General', items: [
      { path: '/app/dashboard',      icon: Home,      label: 'Dashboard'      },
      { path: '/app/reservas',       icon: Calendar,  label: 'Reservas'       },
      { path: '/app/notificaciones', icon: Bell,      label: 'Notificaciones' },
      { path: '/app/onboarding',     icon: Sparkles,  label: 'Guías de uso'   },
    ]},
    { section: 'finanzas', label: 'Finanzas', items: [
      { path: '/app/cobranza',       icon: Receipt,      label: 'Cobranza'          },
      { path: '/app/gastos',         icon: ShoppingBag,  label: 'Gastos'            },
      { path: '/app/caja-chica',     icon: DollarSign,   label: 'Caja Chica'        },
      { path: '/app/estado-cuenta',  icon: FileText,     label: 'Estado de Cuenta'  },
      { path: '/app/plan-pagos',     icon: TrendingDown, label: 'Plan de Pagos'     },
      { path: '/app/cierre-periodo', icon: Lock,         label: 'Cierre de Período' },
    ]},
  ],

  vigilante: [
    { section: 'general', label: 'General', items: [
      { path: '/app/dashboard',      icon: Home,     label: 'Dashboard'      },
      { path: '/app/reservas',       icon: Calendar, label: 'Reservas'       },
      { path: '/app/notificaciones', icon: Bell,     label: 'Notificaciones' },
    ]},
  ],

  vecino: [
    { section: 'general', label: 'General', items: [
      { path: '/app/my-unit',        icon: Home,     label: 'Mi Unidad'      },
      { path: '/app/reservas',       icon: Calendar, label: 'Reservas'       },
      { path: '/app/notificaciones', icon: Bell,     label: 'Notificaciones' },
      { path: '/app/onboarding',     icon: Sparkles, label: 'Guías de uso'   },
    ]},
    { section: 'finanzas', label: 'Finanzas', items: [
      { path: '/app/estado-cuenta',  icon: FileText,     label: 'Estado de Cuenta' },
      { path: '/app/plan-pagos',     icon: TrendingDown, label: 'Plan de Pagos'    },
    ]},
  ],
};

// Maps each nav path to its module key (for permission filtering)
const PATH_TO_MODULE = {
  '/app/dashboard':       'dashboard',
  '/app/reservas':        'reservas',
  '/app/cobranza':        'cobranza',
  '/app/gastos':          'gastos',
  '/app/caja-chica':      'caja_chica',
  '/app/estado-cuenta':   'estado_cuenta',
  '/app/plan-pagos':      'plan_pagos',
  '/app/cierre-periodo':  'cierre_periodo',
  '/app/notificaciones':  'notificaciones',
  '/app/config':          'config',
  '/app/my-unit':         'my_unit',
  '/app/onboarding':      'onboarding',
  '/app/mi-membresia':    'mi_membresia',
};

const PAGE_TITLES = {
  dashboard: 'Dashboard',
  'sistema/tenants': 'Gestión de Tenants',
  'sistema/suscripciones': 'Suscripciones',
  'sistema/logs': 'Logs del Sistema',
  cobranza: 'Cobranza',
  gastos: 'Gastos del Condominio',
  'caja-chica': 'Caja Chica',
  'estado-cuenta': 'Estado de Cuenta',
  'plan-pagos': 'Plan de Pagos',
  'cierre-periodo': 'Cierre de Período',
  config: 'Configuración',
  units: 'Unidades',
  users: 'Usuarios',
  'my-unit': 'Mi Unidad',
  'reservas': 'Reservas de Áreas Comunes',
  'notificaciones': 'Notificaciones',
  'onboarding': 'Guías de uso',
  'mi-membresia': 'Mi Membresía',
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

  // Dropdown only makes sense when there are 2+ tenants to choose from
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

// ── Guide Tour Button ─────────────────────────────────────────────────────────
function GuideTourButton() {
  const navigate = useNavigate();
  const location = useLocation();
  const isActive = location.pathname === '/app/onboarding';
  return (
    <button
      onClick={() => navigate('/app/onboarding')}
      title="Guía de Uso"
      aria-label="Guía de Uso"
      style={{
        position: 'relative', background: isActive ? 'var(--teal-50)' : 'none',
        border: 'none', cursor: 'pointer', padding: '6px', borderRadius: 8,
        color: isActive ? 'var(--teal-600)' : 'var(--ink-500)',
        display: 'flex', alignItems: 'center',
        transition: 'background 0.15s, color 0.15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--teal-50)'; e.currentTarget.style.color = 'var(--teal-600)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = isActive ? 'var(--teal-50)' : 'none'; e.currentTarget.style.color = isActive ? 'var(--teal-600)' : 'var(--ink-500)'; }}
    >
      <Sparkles size={20} />
    </button>
  );
}

// ── Notification module map (mirrors backend _NOTIF_MODULE_MAP) ──────────────
const NOTIF_MODULE_MAP = {
  reservation_new:       'reservas',
  reservation_approved:  'reservas',
  reservation_rejected:  'reservas',
  reservation_cancelled: 'reservas',
  payment_registered:    'estado_cuenta',
  payment_updated:       'estado_cuenta',
  payment_deleted:       'estado_cuenta',
  period_closed:         'cobranza',
  period_reopened:       'cobranza',
  plan_proposal_sent:    'plan_pagos',
  plan_accepted:         'plan_pagos',
  plan_rejected:         'plan_pagos',
  plan_cancelled:        'plan_pagos',
  plan_installment_paid: 'plan_pagos',
};

// ── Notification Bell + Dropdown ────────────────────────────────────────────
function NotificationBell({ tenantId, role, tenantModulePerms, activeProfile }) {
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

  // Returns true if the current user's role has access to the module
  // associated with a notification type. Superadmin/admin always have access.
  const canNavigateNotif = (n) => {
    if (!role || role === 'superadmin' || role === 'admin') return true;
    const moduleKey = n.related_reservation_id ? 'reservas' : NOTIF_MODULE_MAP[n.notif_type];
    if (!moduleKey) return false; // no known destination → read-only
    let permsEntry;
    if (activeProfile) {
      const profileMods = activeProfile.modules;
      if (!profileMods || (Array.isArray(profileMods) && profileMods.length === 0) ||
          (typeof profileMods === 'object' && !Array.isArray(profileMods) && Object.keys(profileMods).length === 0)) return true;
      permsEntry = profileMods;
    } else {
      permsEntry = tenantModulePerms ? tenantModulePerms[role] : undefined;
    }
    if (!permsEntry) return true;
    if (Array.isArray(permsEntry)) {
      return permsEntry.includes(moduleKey) || !!(ROLE_BASE_MODULES[role]?.includes(moduleKey));
    }
    const level = permsEntry[moduleKey];
    return level === undefined || level !== 'hidden';
  };

  const handleClickNotif = async (n) => {
    if (!n.is_read) {
      await notificationsAPI.markRead(tenantId, n.id).catch(() => {});
      setNotifs(prev => prev.map(x => x.id === n.id ? { ...x, is_read: true } : x));
      setUnread(prev => Math.max(0, prev - 1));
    }
    if (!canNavigateNotif(n)) return; // no permission → mark read only, no navigation
    setOpen(false);
    if (n.related_reservation_id) navigate('/app/reservas');
    else if (['plan_proposal_sent','plan_accepted','plan_rejected','plan_cancelled','plan_installment_paid'].includes(n.notif_type)) navigate('/app/plan-pagos');
    else if (['payment_registered','payment_updated','payment_deleted'].includes(n.notif_type)) {
      // Vecinos only see EC (they have no cobranza access); admin/tesorero/contador/auditor go to cobranza
      navigate(role === 'vecino' ? '/app/estado-cuenta' : '/app/cobranza');
    }
    else if (['period_closed','period_reopened'].includes(n.notif_type)) navigate('/app/cobranza');
  };

  const TYPE_ICON = {
    // Reservas
    reservation_new:       '📅',
    reservation_approved:  '✅',
    reservation_rejected:  '❌',
    reservation_cancelled: '🚫',
    // Cobranza
    payment_registered:    '💰',
    payment_updated:       '✏️',
    payment_deleted:       '🗑️',
    // Plan de pagos
    plan_proposal_sent:    '📋',
    plan_accepted:         '🤝',
    plan_rejected:         '↩️',
    plan_cancelled:        '🚫',
    plan_installment_paid: '✅',
    // Períodos
    period_closed:         '🔒',
    period_reopened:       '🔓',
    // General
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
              notifs.map(n => {
                const canNav = canNavigateNotif(n);
                return (
                <button
                  key={n.id}
                  onClick={() => handleClickNotif(n)}
                  title={canNav ? undefined : 'Tu rol no tiene acceso a este módulo'}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'flex-start', gap: 10,
                    padding: '11px 16px', border: 'none', background: n.is_read ? 'transparent' : 'var(--teal-50)',
                    cursor: canNav ? 'pointer' : 'default', textAlign: 'left', borderBottom: '1px solid var(--sand-50)',
                    transition: 'background 0.1s', opacity: canNav ? 1 : 0.75,
                  }}
                  onMouseEnter={e => { if (canNav) e.currentTarget.style.background = n.is_read ? 'var(--sand-50)' : 'var(--teal-100)'; }}
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
                    <div style={{ fontSize: 10, color: 'var(--ink-300)', marginTop: 3 }}>
                      {timeAgo(n.created_at)}
                      {!canNav && <span style={{ marginLeft: 6, color: 'var(--coral-400)', fontWeight: 600 }}>· Sin acceso</span>}
                    </div>
                  </div>
                  {!n.is_read && (
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--teal-500)', flexShrink: 0, marginTop: 5 }} />
                  )}
                </button>
                );
              })
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
    logout, isSuperAdmin, isSystemStaff, systemRole, systemPermissions, profileId,
  } = useAuth();

  // ── Guía interactiva flotante ────────────────────────────────────
  const { activeChapter, closeGuide } = useGuide();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Collapsible sidebar sections — default: all open
  const [collapsedSections, setCollapsedSections] = useState({});
  const toggleSection = (key) =>
    setCollapsedSections(prev => ({ ...prev, [key]: !prev[key] }));
  const [tenantModulePerms,          setTenantModulePerms]          = useState({});
  const [customProfiles,             setCustomProfiles]             = useState([]);
  const [subscriptionAllowedModules, setSubscriptionAllowedModules] = useState([]);
  const [subscriptionStatus,         setSubscriptionStatus]         = useState(null);
  // For vecino: only show Plan de Pagos if they have at least one plan (any status)
  const [vecHasPlan, setVecHasPlan] = useState(false);
  const navigate  = useNavigate();
  const location  = useLocation();

  const isVecino = role === 'vecino' || role === 'vigilante';

  // Fetch tenant data (module permissions + custom profiles) whenever the active tenant changes
  useEffect(() => {
    if (!tenantId || role === 'superadmin') {
      setTenantModulePerms({});
      setCustomProfiles([]);
      setSubscriptionAllowedModules([]);
      setSubscriptionStatus(null);
      return;
    }
    tenantsAPI.get(tenantId)
      .then(r => {
        setTenantModulePerms(r.data?.module_permissions || {});
        setCustomProfiles(Array.isArray(r.data?.custom_profiles) ? r.data.custom_profiles : []);
        setSubscriptionAllowedModules(
          Array.isArray(r.data?.subscription_allowed_modules) ? r.data.subscription_allowed_modules : []
        );
        setSubscriptionStatus(r.data?.subscription_status || null);
      })
      .catch(() => {
        setTenantModulePerms({});
        setCustomProfiles([]);
        setSubscriptionAllowedModules([]);
        setSubscriptionStatus(null);
      });
  }, [tenantId, role]);

  // Fetch vecino's plan de pagos — show the nav item only if at least one plan exists
  useEffect(() => {
    if (role !== 'vecino' || !tenantId) { setVecHasPlan(false); return; }
    paymentPlansAPI.list(tenantId, { page_size: 1 })
      .then(r => {
        const results = Array.isArray(r.data) ? r.data : (r.data?.results || []);
        setVecHasPlan(results.length > 0);
      })
      .catch(() => setVecHasPlan(false));
  }, [role, tenantId]);

  // Resolve the active custom profile (if any)
  const activeProfile = profileId
    ? customProfiles.find(p => String(p.id) === String(profileId)) || null
    : null;

  // Determine effective role for nav selection:
  // If user has a custom profile, use its base_role for the nav structure.
  const navRole = activeProfile ? (activeProfile.base_role || role) : role;

  // System role labels for restricted staff users
  const SYSTEM_ROLE_LABELS = {
    ventas:           'Revenue Growth Strategist',
    marketing:        'Content Strategist Lead',
    atencion_cliente: 'Customer Success Hero',
    soporte_tecnico:  'Systems Reliability Engineer',
    super_admin:      'Super Administrador',
  };

  // Role display info — use profile label/color when applicable
  // For system_staff, show their specific role label
  const roleConfig = activeProfile
    ? { label: activeProfile.label, color: activeProfile.color || 'var(--teal-500)' }
    : isSystemStaff && systemRole && SYSTEM_ROLE_LABELS[systemRole]
      ? { label: SYSTEM_ROLE_LABELS[systemRole], color: '#0F766E' }
      : (ROLES[role] || ROLES.vecino);

  // Helper: resolve visibility from a perms entry (handles old array + new object formats).
  // roleKey is needed to check ROLE_BASE_MODULES for new modules missing from old-format arrays.
  const isModuleVisible = (permsEntry, moduleKey, roleKey) => {
    if (!permsEntry) return true; // no config → show
    if (Array.isArray(permsEntry)) {
      // Old array format: explicit allowlist of visible modules.
      // If module is in the array → visible.
      if (permsEntry.includes(moduleKey)) return true;
      // If module is NOT in the array but IS in the role's base modules, it means the
      // module was added after this tenant saved their permissions. Default to visible
      // so new features appear automatically without forcing admins to re-save config.
      if (roleKey && ROLE_BASE_MODULES[roleKey]?.includes(moduleKey)) return true;
      return false;
    }
    // New format: object { moduleKey: "write"|"read"|"hidden" }
    const val = permsEntry[moduleKey];
    return val === undefined || val !== 'hidden'; // default: visible unless explicitly hidden
  };

  // Build dynamic nav for restricted system_staff users based on their permissions
  const systemStaffNav = React.useMemo(() => {
    if (!isSystemStaff) return null;
    const MODULE_TO_PATH = {
      tenants:       '/app/sistema/tenants',
      suscripciones: '/app/sistema/suscripciones',
      crm:           '/app/sistema/crm',
      system_users:  '/app/sistema/usuarios',
      logs:          '/app/sistema/logs',
    };
    const MODULE_TO_LABEL = {
      tenants:       { icon: Globe,      label: 'Tenants'          },
      suscripciones: { icon: CreditCard, label: 'Suscripciones'    },
      crm:           { icon: Target,     label: 'CRM Comercial'    },
      system_users:  { icon: Users,      label: 'Usuarios Sistema' },
      logs:          { icon: Activity,   label: 'Logs del Sistema' },
    };
    const items = Object.entries(systemPermissions || {})
      .filter(([, enabled]) => enabled)
      .map(([mod]) => MODULE_TO_PATH[mod] ? { path: MODULE_TO_PATH[mod], ...MODULE_TO_LABEL[mod] } : null)
      .filter(Boolean);
    if (items.length === 0) return [];
    return [{ section: 'system', label: 'Sistema', items }];
  }, [isSystemStaff, systemPermissions]);

  // Filter nav based on module permissions or custom profile modules
  const rawNav = isSystemStaff
    ? (systemStaffNav || [])
    : (NAV_ITEMS[navRole] || NAV_ITEMS.vecino);
  const effectiveNav = (role === 'superadmin' || isSystemStaff)
    ? rawNav
    : rawNav.map(group => ({
        ...group,
        items: group.items.filter(item => {
          const moduleKey = PATH_TO_MODULE[item.path];
          if (!moduleKey) return true;

          // Vecino: hide Plan de Pagos when no plan exists in any status
          if (role === 'vecino' && moduleKey === 'plan_pagos' && !vecHasPlan) return false;

          // ── Subscription plan filter ─────────────────────────────────────
          // If the tenant's subscription plan defines allowed_modules, only
          // show modules included in that list. Empty list = no restriction.
          // mi_membresia is always exempt: the admin must always be able to
          // view their own membership details regardless of the plan.
          if (
            subscriptionAllowedModules.length > 0 &&
            moduleKey !== 'mi_membresia' &&
            !subscriptionAllowedModules.includes(moduleKey)
          ) {
            return false;
          }

          // Custom profile: filter by profile's own modules config
          if (activeProfile) {
            const profileMods = activeProfile.modules;
            // Empty / no config → show all base role defaults
            if (!profileMods || (Array.isArray(profileMods) && profileMods.length === 0) || (typeof profileMods === 'object' && !Array.isArray(profileMods) && Object.keys(profileMods).length === 0)) return true;
            return isModuleVisible(profileMods, moduleKey, activeProfile.base_role);
          }

          // Standard role: filter by tenant module_permissions config
          return isModuleVisible(tenantModulePerms[role], moduleKey, role);
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
  //   • regular users whenever they belong to at least one tenant
  //     (tenant selection was removed from the login screen; switching happens here)
  const showTenantSwitcher = isSuperAdmin || userTenants.length >= 1;

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
          {effectiveNav.map((group, gi) => {
            const sectionKey = group.section || `section-${gi}`;
            const isCollapsed = !!collapsedSections[sectionKey];
            const hasActiveItem = group.items.some(item => location.pathname === item.path);
            return (
              <div key={gi}>
                {group.label && (
                  <button
                    onClick={() => toggleSection(sectionKey)}
                    className="nav-group-label"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      width: '100%',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '0',
                      userSelect: 'none',
                    }}
                  >
                    <span style={{ fontWeight: hasActiveItem && isCollapsed ? 700 : undefined }}>
                      {group.label}
                      {hasActiveItem && isCollapsed && (
                        <span style={{ display: 'inline-block', width: 5, height: 5, borderRadius: '50%', background: 'var(--teal-500, #0d9488)', marginLeft: 5, verticalAlign: 'middle' }} />
                      )}
                    </span>
                    <ChevronDown
                      size={12}
                      style={{
                        flexShrink: 0,
                        transition: 'transform 0.2s',
                        transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                        opacity: 0.5,
                      }}
                    />
                  </button>
                )}
                {!isCollapsed && group.items.map(item => {
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
            );
          })}
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
            {/* Guide Tour Button — visible to all roles with onboarding module access */}
            {tenantId && (
              role === 'superadmin' ||
              (
                (subscriptionAllowedModules.length === 0 || subscriptionAllowedModules.includes('onboarding')) &&
                (activeProfile
                  ? isModuleVisible(activeProfile.modules, 'onboarding', activeProfile.base_role)
                  : isModuleVisible(tenantModulePerms[role], 'onboarding', role))
              )
            ) && <GuideTourButton />}
            {/* Notification Bell */}
            {tenantId && (
              role === 'superadmin' ||
              (
                (subscriptionAllowedModules.length === 0 || subscriptionAllowedModules.includes('notificaciones')) &&
                (activeProfile
                  ? isModuleVisible(activeProfile.modules, 'notificaciones', activeProfile.base_role)
                  : isModuleVisible(tenantModulePerms[role], 'notificaciones', role))
              )
            ) && <NotificationBell tenantId={tenantId} role={role} tenantModulePerms={tenantModulePerms} activeProfile={activeProfile} />}
          </div>
        </header>

        {/* ── Subscription suspension banner ────────────────────────────── */}
        {/* Shown to all tenant roles (not superadmin) when the subscription
            is past_due, expired or cancelled. Admin gets a direct link to
            Mi Membresía; other roles are told to contact the admin.       */}
        {tenantId && role !== 'superadmin' && (() => {
          const SUSPENDED_STATUSES = ['past_due', 'expired', 'cancelled'];
          if (!subscriptionStatus || !SUSPENDED_STATUSES.includes(subscriptionStatus)) return null;

          const isAdmin = role === 'admin';
          const statusMessages = {
            past_due:  'La membresía de este condominio está vencida por falta de pago.',
            expired:   'La membresía de este condominio ha expirado.',
            cancelled: 'La membresía de este condominio ha sido cancelada.',
          };
          const msg = statusMessages[subscriptionStatus] || 'La membresía de este condominio está inactiva.';

          return (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 12, flexWrap: 'wrap',
              padding: '10px 20px',
              background: 'var(--coral-50, #fff1f0)',
              borderBottom: '2px solid var(--coral-300, #fca5a5)',
              color: 'var(--coral-700, #b91c1c)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {/* Warning icon */}
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  style={{ flexShrink: 0 }}>
                  <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/>
                  <line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                <span style={{ fontSize: 13, fontWeight: 600 }}>
                  {msg}{' '}
                  {isAdmin
                    ? 'Regulariza el pago para restaurar el acceso.'
                    : 'Contacta al administrador del condominio para regularizar el pago.'}
                </span>
              </div>
              {isAdmin && (
                <button
                  onClick={() => navigate('/app/mi-membresia')}
                  style={{
                    flexShrink: 0,
                    padding: '5px 14px',
                    borderRadius: 7,
                    border: '1.5px solid var(--coral-400, #f87171)',
                    background: 'white',
                    color: 'var(--coral-700, #b91c1c)',
                    fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--coral-50, #fff1f0)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'white'}
                >
                  Ver Mi Membresía →
                </button>
              )}
            </div>
          );
        })()}

        {/* Content */}
        <div className="content">
          <Outlet />
        </div>
      </main>

      {/* ── Guía interactiva flotante ──────────────────────────────
          Renderizada aquí (fuera del <main>) para persistir durante
          la navegación entre módulos mientras la guía está abierta. */}
      <GuideModal
        key={activeChapter?.id ?? '__none__'}
        open={!!activeChapter}
        chapter={activeChapter}
        onClose={closeGuide}
      />
    </div>
  );
}
