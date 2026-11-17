import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useGuide } from '../../context/GuideContext';
import { TenantAccessProvider } from '../../context/TenantAccessContext';
import { useWorkspaceConfig } from '../../context/WorkspaceConfigContext';
import { HomlyBrand, APP_VERSION, ROLES } from '../../utils/helpers';
import { notificationsAPI, tenantsAPI, paymentPlansAPI } from '../../api/client';
import { isModuleVisible, PATH_TO_MODULE, rentalAccessLevel, levelAtLeast, rentalOffModules, userCanAccessModule } from '../../constants/modulePermissions';
import GuideModal from '../onboarding/GuideModal';
import HelpDrawer from './HelpDrawer';
import {
  Home, Globe, FileText, ShoppingBag, Receipt, Settings,
  Users, Building, Shield, LogOut, Menu, X, Calendar,
  ChevronDown, Check, Building2, Bell, CheckCheck, Activity, Lock, TrendingDown,
  Sparkles, CreditCard, DollarSign, Target, Newspaper, Send, HelpCircle, ClipboardList, ClipboardCheck, Vote, Wrench, Package, UserCheck,
  LifeBuoy, Cpu, CalendarClock, ScanSearch, Gauge, GraduationCap, LayoutGrid, PiggyBank,
  PanelLeftClose, PanelLeftOpen, FileBarChart,
} from 'lucide-react';

const NAV_SISTEMA = [
  { path: '/app/sistema/tenants',       icon: Globe,      label: 'Tenants' },
  { path: '/app/sistema/suscripciones', icon: CreditCard, label: 'Suscripciones' },
  { path: '/app/sistema/espacios',      icon: LayoutGrid, label: 'Espacios y módulos' },
  { path: '/app/sistema/crm',           icon: Target,     label: 'CRM Comercial' },
  { path: '/app/sistema/usuarios',      icon: Users,      label: 'Roles y Usuarios' },
  { path: '/app/sistema/logs',          icon: Activity,   label: 'Logs del Sistema' },
];

const NAV_CONDO_GENERAL = [
  { path: '/app/dashboard',      icon: Home,     label: 'Dashboard' },
  { path: '/app/notificaciones', icon: Bell,     label: 'Notificaciones' },
  { path: '/app/onboarding',     icon: Sparkles, label: 'Guías de uso' },
];

const NAV_CONDO_OPERACION = [
  { path: '/app/reservas',        icon: Calendar,  label: 'Reservas' },
  { path: '/app/paqueteria',      icon: Package,   label: 'Paquetería' },
  { path: '/app/visitas',         icon: UserCheck, label: 'Visitas Autorizadas' },
  { path: '/app/mantenimientos',  icon: Wrench,    label: 'Mantenimientos' },
];

const NAV_CONDO_COMUNIDAD = [
  { path: '/app/blog',      icon: Newspaper, label: 'Comunicación' },
  { path: '/app/asambleas', icon: Vote,      label: 'Asambleas' },
];

const NAV_CONDO_FINANZAS = [
  { path: '/app/cobranza',       icon: Receipt,        label: 'Cobranza' },
  { path: '/app/gastos',         icon: ShoppingBag,    label: 'Gastos' },
  { path: '/app/caja-chica',     icon: DollarSign,     label: 'Caja Chica' },
  { path: '/app/estado-cuenta',  icon: FileText,       label: 'Estado de Cuenta' },
  { path: '/app/plan-pagos',     icon: TrendingDown,   label: 'Plan de Pagos' },
  { path: '/app/cierre-periodo', icon: Lock,           label: 'Periodos' },
  { path: '/app/planeacion',     icon: ClipboardCheck, label: 'Planeación' },
];

const NAV_CONDO_AJUSTES = [
  { path: '/app/mi-membresia', icon: CreditCard, label: 'Mi Membresía' },
  { path: '/app/config',       icon: Settings,   label: 'Configuración' },
];

function condoNav({ system = false, guides = true, finanzas = NAV_CONDO_FINANZAS, ajustes = false, home = null } = {}) {
  const general = home
    ? [home, ...NAV_CONDO_GENERAL.filter(i => i.path !== '/app/dashboard' && (guides || i.path !== '/app/onboarding'))]
    : NAV_CONDO_GENERAL.filter(i => guides || i.path !== '/app/onboarding');
  return [
    ...(system ? [{ section: 'sistema', label: 'Sistema', items: NAV_SISTEMA }] : []),
    { section: 'general', label: 'General', items: general },
    { section: 'operacion', label: 'Operación', items: NAV_CONDO_OPERACION },
    { section: 'comunidad', label: 'Comunidad', items: NAV_CONDO_COMUNIDAD },
    ...(finanzas?.length ? [{ section: 'finanzas', label: 'Finanzas', items: finanzas }] : []),
    ...(ajustes ? [{ section: 'ajustes', label: 'Ajustes', items: NAV_CONDO_AJUSTES }] : []),
  ];
}

const NAV_ITEMS = {
  // Espacio virtual Súper Admin: solo Sistema. Al entrar a un tenant se usa admin/rentas.
  superadmin: [{ section: 'sistema', label: 'Sistema', items: NAV_SISTEMA }],
  admin:      condoNav({ ajustes: true }),
  tesorero:   condoNav(),
  contador:   condoNav(),
  auditor:    condoNav(),
  vigilante:  condoNav({ guides: true, finanzas: [] }),
  vecino: condoNav({
    home: { path: '/app/my-unit', icon: Home, label: 'Mi Unidad' },
    finanzas: [
      { path: '/app/enviar-pago',   icon: Send,         label: 'Enviar pago' },
      { path: '/app/estado-cuenta', icon: FileText,     label: 'Estado de Cuenta' },
      { path: '/app/plan-pagos',    icon: TrendingDown, label: 'Plan de Pagos' },
    ],
  }),
};

const RENTAL_NAV_CORE = [
  { section: 'general', label: 'General', items: [
    { path: '/app/rentas/dashboard', icon: Home, label: 'Dashboard' },
    { path: '/app/rentas/reportes',  icon: FileBarChart, label: 'Reportes' },
    { path: '/app/notificaciones',   icon: Bell, label: 'Notificaciones' },
    { path: '/app/rentas/guias',     icon: GraduationCap, label: 'Guías de uso' },
  ]},
  { section: 'operacion', label: 'Operación', items: [
    { path: '/app/rentas/propiedades',   icon: Building2,    label: 'Propiedades' },
    { path: '/app/rentas/solicitudes',   icon: LifeBuoy,     label: 'Solicitudes' },
    { path: '/app/rentas/mantenimiento', icon: Wrench,       label: 'Órdenes de trabajo' },
    { path: '/app/rentas/preventivo',    icon: CalendarClock, label: 'Preventivo' },
    { path: '/app/rentas/activos',       icon: Cpu,          label: 'Activos' },
    { path: '/app/rentas/inspecciones',  icon: ScanSearch,   label: 'Inspecciones' },
    { path: '/app/rentas/indicadores',   icon: Gauge,        label: 'Indicadores' },
  ]},
  { section: 'comercial', label: 'Comercial', items: [
    { path: '/app/rentas/crm',       icon: Target,   label: 'CRM' },
    { path: '/app/rentas/contratos', icon: FileText, label: 'Contratos' },
  ]},
  { section: 'finanzas', label: 'Finanzas', items: [
    { path: '/app/rentas/cobranza', icon: Receipt,       label: 'Cobranza' },
    { path: '/app/rentas/rentroll', icon: ClipboardList, label: 'Rent Roll' },
    { path: '/app/rentas/capex',    icon: PiggyBank, label: 'CAPEX y OPEX' },
  ]},
];

const RENTAL_NAV_AJUSTES = {
  section: 'ajustes',
  label: 'Ajustes',
  items: [
    { path: '/app/mi-membresia',  icon: CreditCard, label: 'Mi Membresía' },
    { path: '/app/rentas/config', icon: Settings,   label: 'Configuración' },
  ],
};

// Cada perfil recibe el menú completo y se filtra por su matriz de módulos (ver modulePermissions.js).
const RENTAL_NAV_ITEMS = {
  admin:         [...RENTAL_NAV_CORE, RENTAL_NAV_AJUSTES],
  gerente:       RENTAL_NAV_CORE,
  comercial:     RENTAL_NAV_CORE,
  mantenimiento: RENTAL_NAV_CORE,
  tecnico:       RENTAL_NAV_CORE,
  tesorero:      RENTAL_NAV_CORE,
  contador:      RENTAL_NAV_CORE,
  auditor:       RENTAL_NAV_CORE,
};

const PAGE_TITLES = {
  dashboard: 'Dashboard',
  'sistema/tenants': 'Gestión de Tenants',
  'sistema/suscripciones': 'Suscripciones',
  'sistema/espacios': 'Espacios de trabajo y módulos',
  'sistema/logs': 'Logs del Sistema',
  cobranza: 'Cobranza',
  gastos: 'Gastos del Condominio',
  'caja-chica': 'Caja Chica',
  'estado-cuenta': 'Estado de Cuenta',
  'plan-pagos': 'Plan de Pagos',
  'cierre-periodo': 'Periodos',
  planeacion: 'Planeación',
  asambleas: 'Asambleas',
  mantenimientos: 'Mantenimientos',
  paqueteria: 'Paquetería / Mensajería',
  visitas: 'Visitas Autorizadas',
  config: 'Configuración',
  units: 'Unidades',
  users: 'Usuarios',
  'my-unit': 'Mi Unidad',
  'reservas': 'Reservas de Áreas Comunes',
  'notificaciones': 'Notificaciones',
  'onboarding': 'Guías de uso',
  'mi-membresia': 'Mi Membresía',
  'blog': 'Comunicación',
  'enviar-pago': 'Enviar pago',
  'rentas/dashboard': 'Rentas',
  'rentas/propiedades': 'Propiedades en renta',
  'rentas/crm': 'CRM de rentas',
  'rentas/contratos': 'Contratos',
  'rentas/cobranza': 'Cobranza de rentas',
  'rentas/rentroll': 'Rent Roll',
  'rentas/capex': 'CAPEX y OPEX',
  'rentas/reportes': 'Reportes',
  'rentas/calendario': 'Contratos · Vigencias',
  'rentas/mantenimiento': 'Órdenes de trabajo',
  'rentas/solicitudes': 'Solicitudes de servicio',
  'rentas/preventivo': 'Mantenimiento preventivo',
  'rentas/activos': 'Activos y equipos',
  'rentas/inspecciones': 'Inspecciones',
  'rentas/indicadores': 'Indicadores operativos',
  'rentas/config': 'Configuración',
  'rentas/guias': 'Guías de uso',
};

function getPageTitle(pathname) {
  const keys = Object.keys(PAGE_TITLES).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (pathname.includes(key)) return PAGE_TITLES[key];
  }
  return '';
}

// ── Tenant Switcher ────────────────────────────────────────────────────────
/** Id virtual del espacio Súper Admin (sin tenant; solo módulos de Sistema). */
export const SISTEMA_WORKSPACE_ID = '__sistema__';

function TenantSwitcher({ tenantId, tenantName, userTenants, onSwitch, isSuperAdmin, workspaceType }) {
  const { wsShort, configs } = useWorkspaceConfig();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handle = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  const inSistema = isSuperAdmin && (!tenantId || workspaceType === 'sistema');
  // Superadmin siempre puede abrir el selector (Súper Admin + tenants).
  // Usuarios normales: solo si hay 2+ tenants activos.
  const canSwitch = isSuperAdmin || userTenants.length > 1;

  const handleSelect = async (id) => {
    const targetId = id === SISTEMA_WORKSPACE_ID ? null : id;
    const already = (targetId === null && inSistema) || (targetId !== null && targetId === tenantId);
    if (already) { setOpen(false); return; }
    setSwitching(true);
    try {
      await onSwitch(targetId);
      setOpen(false);
    } catch {
      // error handled upstream
    } finally {
      setSwitching(false);
    }
  };

  const TenantAvatar = ({ logo, size = 32, active = false, radius = 8, sistema = false }) => {
    const logoSrc = logo
      ? (logo.startsWith('data:') ? logo : `data:image/png;base64,${logo}`)
      : null;
    return (
      <div style={{
        width: size, height: size, borderRadius: radius, flexShrink: 0,
        background: logoSrc ? 'white' : (sistema ? 'var(--violet-600, #6D28D9)' : (active ? 'var(--teal-500)' : 'var(--sand-200)')),
        border: logoSrc ? '1px solid var(--sand-100)' : 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden',
      }}>
        {logoSrc
          ? <img src={logoSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          : sistema
            ? <Shield size={size * 0.5} color="white" />
            : <Building2 size={size * 0.5} color={active ? 'white' : 'var(--ink-400)'} />
        }
      </div>
    );
  };

  const activeTenantLogo = userTenants.find(t => t.id === tenantId)?.logo || null;
  const displayName = inSistema ? 'Súper Admin' : (tenantName || 'Seleccionar espacio…');
  const spaceCount = (isSuperAdmin ? 1 : 0) + userTenants.length;

  const Row = ({ id, name, logo, active, sistema = false, inactive = false, hibernated = false }) => (
    <button
      key={id}
      onClick={() => handleSelect(id)}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 10,
        padding: '9px 12px',
        background: active ? (sistema ? 'var(--violet-50, #F5F3FF)' : 'var(--teal-50)') : 'transparent',
        border: 'none', cursor: 'pointer', textAlign: 'left',
        transition: 'background 0.1s',
        opacity: inactive || hibernated ? 0.75 : 1,
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--sand-50)'; }}
      onMouseLeave={e => {
        e.currentTarget.style.background = active
          ? (sistema ? 'var(--violet-50, #F5F3FF)' : 'var(--teal-50)')
          : 'transparent';
      }}
    >
      <TenantAvatar logo={logo} size={28} active={active} radius={6} sistema={sistema} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{
          display: 'block', fontSize: 13, fontWeight: active ? 700 : 500,
          color: active
            ? (sistema ? 'var(--violet-700, #5B21B6)' : 'var(--teal-700)')
            : 'var(--ink-700)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {name}
        </span>
        {(hibernated || inactive) && (
          <span style={{ fontSize: 10, fontWeight: 700, color: hibernated ? 'var(--amber-700)' : 'var(--ink-400)' }}>
            {hibernated ? 'Hibernado' : 'Inactivo'}
          </span>
        )}
      </span>
      {active && <Check size={13} color={sistema ? 'var(--violet-600, #6D28D9)' : 'var(--teal-500)'} style={{ flexShrink: 0 }} />}
    </button>
  );

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
        <TenantAvatar logo={inSistema ? null : activeTenantLogo} size={32} radius={8} sistema={inSistema} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 13, fontWeight: 700,
            color: displayName ? 'var(--ink-800)' : 'var(--ink-400)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            fontStyle: displayName ? 'normal' : 'italic',
          }}>
            {switching ? 'Cambiando…' : displayName}
          </div>
          {spaceCount > 0 && (
            <div style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 1 }}>
              {inSistema
                ? 'Espacio de sistema'
                : `${spaceCount} espacio${spaceCount !== 1 ? 's' : ''} de trabajo`}
            </div>
          )}
        </div>
        {canSwitch && (
          <ChevronDown size={14} style={{
            color: 'var(--ink-400)', flexShrink: 0,
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.2s',
          }} />
        )}
      </button>

      {open && canSwitch && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 200,
          background: 'var(--white)', border: '1px solid var(--sand-100)',
          borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          overflow: 'hidden', maxHeight: 360, overflowY: 'auto',
        }}>
          {isSuperAdmin && (
            <div>
              <div style={{
                padding: '8px 12px 6px',
                fontSize: 10, fontWeight: 800, letterSpacing: '0.06em',
                color: 'var(--ink-400)', textTransform: 'uppercase',
              }}>
                Sistema
              </div>
              <Row id={SISTEMA_WORKSPACE_ID} name="Súper Admin" active={inSistema} sistema />
            </div>
          )}
          {configs.map(c => c.workspace_type).map(ws => {
            if (ws === 'sistema') return null;
            const group = userTenants.filter(t => (t.workspace_type || 'condominio') === ws);
            if (!group.length) return null;
            return (
              <div key={ws}>
                <div style={{
                  padding: '8px 12px 6px',
                  fontSize: 10, fontWeight: 800, letterSpacing: '0.06em',
                  color: 'var(--ink-400)', textTransform: 'uppercase',
                }}>
                  {wsShort(ws)}
                </div>
                {group.map(t => (
                  <Row
                    key={t.id}
                    id={t.id}
                    name={t.name}
                    logo={t.logo}
                    active={!inSistema && t.id === tenantId}
                    inactive={t.is_active === false}
                    hibernated={!!t.hibernated}
                  />
                ))}
              </div>
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
  rental_property_created:   'rentas_propiedades',
  rental_property_status:    'rentas_propiedades',
  rental_contract_created:   'rentas_contratos',
  rental_contract_activated: 'rentas_contratos',
  rental_contract_finished:  'rentas_contratos',
  rental_contract_expiring:  'rentas_calendario',
  rental_contract_expired:   'rentas_calendario',
  rental_charge_generated:   'rentas_cobranza',
  rental_payment_registered: 'rentas_cobranza',
  rental_payment_deleted:    'rentas_cobranza',
  rental_lead_created:       'rentas_crm',
  rental_lead_moved:         'rentas_crm',
  rental_lead_converted:     'rentas_crm',
  rental_lead_lost:          'rentas_crm',
  rental_airbnb_imported:    'rentas_propiedades',
  rental_airbnb_synced:      'rentas_propiedades',
  rental_airbnb_error:       'rentas_propiedades',
  rental_request_new:        'rentas_solicitudes',
  rental_work_overdue:       'rentas_mantenimiento',
  assembly_notice:           'asambleas',
  assembly_started:          'asambleas',
  assembly_minute:           'asambleas',
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
    if (activeProfile) {
      // Custom profile: strict — only explicitly enabled modules grant navigation
      return isModuleVisible(activeProfile.modules, moduleKey, null, true);
    }
    return isModuleVisible(tenantModulePerms ? tenantModulePerms[role] : undefined, moduleKey, role);
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
      // Residentes only see EC (they have no cobranza access); admin/tesorero/contador/auditor go to cobranza
      navigate(role === 'vecino' ? '/app/estado-cuenta' : '/app/cobranza');
    }
    else if (['period_closed','period_reopened'].includes(n.notif_type)) navigate('/app/cobranza');
    else if ((n.notif_type || '').startsWith('rental_lead')) navigate('/app/rentas/crm');
    else if (n.notif_type === 'rental_request_new') navigate('/app/rentas/solicitudes');
    else if (n.notif_type === 'rental_work_overdue') navigate('/app/rentas/mantenimiento');
    else if (['rental_contract_expiring','rental_contract_expired'].includes(n.notif_type)) navigate('/app/rentas/contratos?tab=vigencias');
    else if ((n.notif_type || '').startsWith('rental_contract')) navigate('/app/rentas/contratos');
    else if ((n.notif_type || '').startsWith('rental_charge') || (n.notif_type || '').startsWith('rental_payment')) navigate('/app/rentas/cobranza');
    else if ((n.notif_type || '').startsWith('rental_')) navigate('/app/rentas/propiedades');
    else if ((n.notif_type || '').startsWith('assembly_')) navigate('/app/asambleas');
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
    assembly_notice:       '📣',
    assembly_started:      '🗳️',
    assembly_minute:       '📝',
    period_closed:         '🔒',
    period_reopened:       '🔓',
    rental_property_created:   '🏠',
    rental_property_status:    '🏷️',
    rental_contract_created:   '📄',
    rental_contract_activated: '✅',
    rental_contract_finished:  '📁',
    rental_contract_expiring:  '⏳',
    rental_contract_expired:   '⚠️',
    rental_charge_generated:   '📑',
    rental_payment_registered: '💳',
    rental_payment_deleted:    '🗑️',
    rental_lead_created:       '🎯',
    rental_lead_moved:         '📌',
    rental_lead_converted:     '🤝',
    rental_lead_lost:          '↩️',
    rental_airbnb_imported:    '🔗',
    rental_airbnb_synced:      '🔄',
    rental_airbnb_error:       '⚠️',
    rental_request_new:        '🛟',
    rental_work_overdue:       '⏰',
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
    user, role, tenantId, tenantName, workspaceType,
    userTenants, loadUserTenants, switchTenant,
    logout, isSuperAdmin, profileId,
  } = useAuth();

  // ── Guía interactiva flotante ────────────────────────────────────
  const { activeChapter, closeGuide } = useGuide();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Menú lateral oculto (escritorio): se recuerda entre sesiones para ganar espacio de trabajo
  const [sidebarHidden, setSidebarHidden] = useState(() => {
    try { return localStorage.getItem('homly_sidebar_hidden') === '1'; } catch { return false; }
  });
  const toggleSidebarHidden = useCallback(() => {
    setSidebarHidden(v => {
      const next = !v;
      try { localStorage.setItem('homly_sidebar_hidden', next ? '1' : '0'); } catch { /* sin almacenamiento */ }
      return next;
    });
  }, []);
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'b') {
        const tag = (e.target?.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea' || e.target?.isContentEditable) return;
        e.preventDefault();
        toggleSidebarHidden();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleSidebarHidden]);
  const [helpOpen,    setHelpOpen]    = useState(false);
  // Collapsible sidebar sections — default: all open
  const [collapsedSections, setCollapsedSections] = useState({});
  const toggleSection = (key) =>
    setCollapsedSections(prev => ({ ...prev, [key]: !prev[key] }));
  const [tenantModulePerms,          setTenantModulePerms]          = useState({});
  const [customProfiles,             setCustomProfiles]             = useState([]);
  const [subscriptionAllowedModules, setSubscriptionAllowedModules] = useState([]);
  const [subscriptionStatus,         setSubscriptionStatus]         = useState(null);
  const [rentalSettings,             setRentalSettings]             = useState({});
  const [metaTick,                   setMetaTick]                   = useState(0);
  const silentMetaRefresh = useRef(false);

  // Configuración → Modo de operación avisa para refrescar el menú sin recargar la página
  useEffect(() => {
    const onChange = () => { silentMetaRefresh.current = true; setMetaTick(t => t + 1); };
    window.addEventListener('homly:tenant-settings-changed', onChange);
    return () => window.removeEventListener('homly:tenant-settings-changed', onChange);
  }, []);
  const [permsReady,                 setPermsReady]                 = useState(false);
  // Para residente: only show Plan de Pagos if they have at least one plan (any status)
  const [resHasPlan, setResHasPlan] = useState(false);
  const navigate  = useNavigate();
  const location  = useLocation();

  const isResidente = role === 'vecino' || role === 'vigilante';

  // Fetch tenant data (module permissions + custom profiles) whenever the active tenant changes.
  // Superadmin en espacio Súper Admin (sin tenant) no carga metadatos de tenant.
  useEffect(() => {
    if (!tenantId) {
      setTenantModulePerms({});
      setCustomProfiles([]);
      setSubscriptionAllowedModules([]);
      setSubscriptionStatus(null);
      setRentalSettings({});
      setPermsReady(true);
      return;
    }
    if (!silentMetaRefresh.current) setPermsReady(false);
    silentMetaRefresh.current = false;
    tenantsAPI.get(tenantId)
      .then(r => {
        setTenantModulePerms(r.data?.module_permissions || {});
        setCustomProfiles(Array.isArray(r.data?.custom_profiles) ? r.data.custom_profiles : []);
        setSubscriptionAllowedModules(
          Array.isArray(r.data?.subscription_allowed_modules) ? r.data.subscription_allowed_modules : []
        );
        setSubscriptionStatus(r.data?.subscription_status || null);
        setRentalSettings(r.data?.rental_settings || {});
      })
      .catch(() => {
        setTenantModulePerms({});
        setCustomProfiles([]);
        setSubscriptionAllowedModules([]);
        setSubscriptionStatus(null);
      })
      .finally(() => setPermsReady(true));
  }, [tenantId, role, metaTick]);

  // Fetch residente's plan de pagos — show the nav item only if at least one plan exists
  useEffect(() => {
    if (role !== 'vecino' || !tenantId) { setResHasPlan(false); return; }
    paymentPlansAPI.list(tenantId, { page_size: 1 })
      .then(r => {
        const results = Array.isArray(r.data) ? r.data : (r.data?.results || []);
        setResHasPlan(results.length > 0);
      })
      .catch(() => setResHasPlan(false));
  }, [role, tenantId]);

  // Resolve the active custom profile (if any)
  const activeProfile = profileId
    ? customProfiles.find(p => String(p.id) === String(profileId)) || null
    : null;

  // Personalización del superadmin: módulos desactivados y nombres propios
  const { disabledFor, getCatalog } = useWorkspaceConfig();
  const disabledModules = useMemo(() => {
    const base = disabledFor(workspaceType);
    if (workspaceType !== 'rentas') return base;
    // Módulos de renta que este tenant decidió no usar (las propiedades se operan sin contrato)
    return [...new Set([...(base || []), ...rentalOffModules(rentalSettings)])];
  }, [disabledFor, workspaceType, rentalSettings]);
  const customLabels = useMemo(() => Object.fromEntries(
    getCatalog(workspaceType).filter(m => m.label !== m.baseLabel).map(m => [m.key, m.label]),
  ), [getCatalog, workspaceType]);

  // Solo se renombra la entrada principal del módulo (p. ej. no /units ni /users bajo "config")
  const navLabel = (item) => {
    const key = PATH_TO_MODULE[item.path];
    const label = key && customLabels[key];
    if (!label) return item.label;
    return Object.keys(PATH_TO_MODULE).find(p => PATH_TO_MODULE[p] === key) === item.path ? label : item.label;
  };

  const canAccessModule = useCallback((moduleKey) => userCanAccessModule({
    role,
    isSuperAdmin,
    moduleKey,
    tenantPermsEntry: tenantModulePerms[role],
    profileModules: activeProfile?.modules || null,
    allowedModules: subscriptionAllowedModules,
    disabledModules,
  }), [role, isSuperAdmin, tenantModulePerms, activeProfile, subscriptionAllowedModules, disabledModules]);

  // Nivel de acceso (none | read | operate | write) sobre un módulo de Administrar Propiedades.
  const levelOf = useCallback((moduleKey) => {
    if (isSuperAdmin || role === 'superadmin') return 'write';
    if (!canAccessModule(moduleKey)) return 'none';
    if (activeProfile) {
      const v = activeProfile.modules && !Array.isArray(activeProfile.modules) ? activeProfile.modules[moduleKey] : (activeProfile.modules || []).includes(moduleKey) ? 'write' : 'hidden';
      return v === 'write' ? 'write' : 'read';
    }
    const lvl = rentalAccessLevel(role, moduleKey, tenantModulePerms[role]);
    return lvl === 'none' ? 'read' : lvl; // módulo visible por personalización antigua → consulta
  }, [role, isSuperAdmin, canAccessModule, activeProfile, tenantModulePerms]);

  const tenantAccess = useMemo(() => ({
    canAccessModule,
    levelOf,
    can: (moduleKey, need = 'write') => levelAtLeast(levelOf(moduleKey), need),
    accessReady: permsReady,
  }), [canAccessModule, levelOf, permsReady]);

  // Determine effective role for nav selection:
  // Custom profile users use the 'admin' nav set (all modules), and the
  // profile's own module list handles visibility filtering below.
  const navRole = activeProfile ? 'admin' : role;

  // Role display info — use profile label/color when applicable
  const roleConfig = activeProfile
    ? { label: activeProfile.label, color: activeProfile.color || 'var(--teal-500)' }
    : (ROLES[role] || ROLES.vecino);

  // Filter nav based on module permissions or custom profile modules
  // Súper Admin (sin tenant): solo menú Sistema.
  // Tenant seleccionado: menú del tenant (sin grupo Sistema).
  const inSistemaWorkspace = isSuperAdmin && (!tenantId || workspaceType === 'sistema');
  const isRentalWorkspace = workspaceType === 'rentas';
  const rentalNav = RENTAL_NAV_ITEMS[navRole] || RENTAL_NAV_ITEMS.admin;
  const condoNavBase = NAV_ITEMS[navRole] || NAV_ITEMS.vecino;
  const condoNav = isSuperAdmin && !inSistemaWorkspace
    ? (NAV_ITEMS.admin || condoNavBase)  // superadmin dentro de un condominio usa menú admin
    : condoNavBase;
  const rawNav = inSistemaWorkspace
    ? NAV_ITEMS.superadmin
    : (isRentalWorkspace ? rentalNav : condoNav);
  const effectiveNav = (role === 'superadmin' || inSistemaWorkspace)
    ? rawNav
    : rawNav.map(group => ({
        ...group,
        items: group.items.filter(item => {
          const moduleKey = PATH_TO_MODULE[item.path];
          if (!moduleKey) return true;

          // Módulo retirado del sistema por el superadmin
          if (moduleKey !== 'mi_membresia' && disabledModules.includes(moduleKey)) return false;

          // Residente: hide Plan de Pagos when no plan exists in any status
          if (role === 'vecino' && moduleKey === 'plan_pagos' && !resHasPlan) return false;

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

          // Custom profile: filter strictly by profile's own module config
          // (no base_role inheritance — unset modules default to hidden)
          if (activeProfile) {
            return isModuleVisible(activeProfile.modules, moduleKey, null, true);
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
    const data = await switchTenant(newTenantId);
    const ws = data?.workspace_type
      || (newTenantId ? userTenants.find(t => t.id === newTenantId)?.workspace_type : 'sistema');
    if (ws === 'sistema' || !newTenantId) {
      navigate('/app/sistema/tenants');
    } else if (ws === 'rentas') {
      navigate(isSuperAdmin ? '/app/rentas/dashboard' : '/app');
    } else {
      navigate('/app/dashboard');
    }
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
    <TenantAccessProvider value={tenantAccess}>
    <div className={`app${sidebarHidden ? ' sidebar-hidden' : ''}`}>
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
              isSuperAdmin={isSuperAdmin}
              workspaceType={workspaceType}
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
                      {navLabel(item)}
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
            <button
              className="desktop-toggle" onClick={toggleSidebarHidden}
              aria-label={sidebarHidden ? 'Mostrar menú lateral' : 'Ocultar menú lateral'}
              title={`${sidebarHidden ? 'Mostrar' : 'Ocultar'} menú lateral (Ctrl+B)`}
            >
              {sidebarHidden ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
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
                  ? isModuleVisible(activeProfile.modules, 'onboarding', null, true)
                  : isModuleVisible(tenantModulePerms[role], 'onboarding', role))
              )
            ) && <GuideTourButton />}
            {/* Notification Bell */}
            {tenantId && (
              role === 'superadmin' ||
              (
                (subscriptionAllowedModules.length === 0 || subscriptionAllowedModules.includes('notificaciones')) &&
                (activeProfile
                  ? isModuleVisible(activeProfile.modules, 'notificaciones', null, true)
                  : isModuleVisible(tenantModulePerms[role], 'notificaciones', role))
              )
            ) && <NotificationBell tenantId={tenantId} role={role} tenantModulePerms={tenantModulePerms} activeProfile={activeProfile} />}
            {/* Help Button — always visible for all roles */}
            <button
              onClick={() => setHelpOpen(true)}
              title="Centro de Ayuda"
              style={{
                width: 34, height: 34, borderRadius: '50%',
                border: '1.5px solid var(--sand-200)',
                background: 'var(--white)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: 'var(--ink-500)',
                transition: 'all 0.15s',
                fontWeight: 800, fontSize: 15,
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--teal-50)'; e.currentTarget.style.borderColor = 'var(--teal-400)'; e.currentTarget.style.color = 'var(--teal-600)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--white)'; e.currentTarget.style.borderColor = 'var(--sand-200)'; e.currentTarget.style.color = 'var(--ink-500)'; }}
            >
              <HelpCircle size={17} />
            </button>
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
      <HelpDrawer open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
    </TenantAccessProvider>
  );
}
