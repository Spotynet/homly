/**
 * Shared module permission constants for Homly.
 *
 * ROLE_BASE_MODULES defines the default modules each built-in role receives.
 * The permissions tab can grant any other assignable module on top of that.
 *
 * When a new module is added here, it becomes visible for the listed roles
 * even if their saved module_permissions was in the old array format.
 */

export const ROLE_BASE_MODULES = {
  admin:     ['dashboard', 'reservas', 'cobranza', 'gastos', 'caja_chica', 'estado_cuenta', 'plan_pagos', 'cierre_periodo', 'planeacion', 'asambleas', 'mantenimientos', 'paqueteria', 'visitas', 'notificaciones', 'onboarding', 'mi_membresia', 'config', 'blog', 'rita'],
  tesorero:  ['dashboard', 'reservas', 'cobranza', 'gastos', 'caja_chica', 'estado_cuenta', 'plan_pagos', 'cierre_periodo', 'planeacion', 'asambleas', 'mantenimientos', 'notificaciones', 'onboarding', 'blog', 'rita'],
  contador:  ['dashboard', 'reservas', 'cobranza', 'gastos', 'caja_chica', 'estado_cuenta', 'plan_pagos', 'cierre_periodo', 'planeacion', 'asambleas', 'mantenimientos', 'notificaciones', 'onboarding', 'blog', 'rita'],
  auditor:   ['dashboard', 'cobranza', 'reservas', 'gastos', 'caja_chica', 'estado_cuenta', 'plan_pagos', 'cierre_periodo', 'planeacion', 'asambleas', 'mantenimientos', 'notificaciones', 'onboarding', 'blog'],
  vigilante: ['dashboard', 'reservas', 'asambleas', 'mantenimientos', 'paqueteria', 'visitas', 'notificaciones', 'blog'],
  vecino:    ['my_unit', 'reservas', 'estado_cuenta', 'plan_pagos', 'notificaciones', 'onboarding', 'blog', 'enviar_pago', 'asambleas', 'mantenimientos', 'visitas'],
};

/**
 * Capacidades de Rita (asistente). Se otorgan por rol/perfil bajo el módulo `rita`.
 * Agregar aquí cada nueva función de Rita para exponerla en Config → Permisos.
 *
 * Niveles: hidden | write  (lectura no aplica a acciones de captura).
 */
export const RITA_CAPABILITIES = [
  {
    key: 'bank_upload',
    label: 'Cargar estado de cuenta',
    desc: 'Subir o reemplazar el PDF del período (también queda en Estado General)',
  },
  {
    key: 'ingresos',
    label: 'Asignar ingresos',
    desc: 'Relacionar abonos del banco con el formulario de Cobranza',
  },
  {
    key: 'egresos',
    label: 'Asignar egresos',
    desc: 'Relacionar cargos del banco con el formulario de Gastos',
  },
  {
    key: 'settings',
    label: 'Configurar Rita',
    desc: 'Cambiar banco, sugerencias y forma de pago por defecto',
  },
];

export const RITA_CAP_KEYS = RITA_CAPABILITIES.map(c => c.key);

/** Capacidades Rita por defecto según rol predefinido. */
export function defaultRitaCaps(roleKey) {
  const allWrite = Object.fromEntries(RITA_CAP_KEYS.map(k => [k, 'write']));
  const allHidden = Object.fromEntries(RITA_CAP_KEYS.map(k => [k, 'hidden']));
  if (roleKey === 'admin' || roleKey === 'tesorero' || roleKey === 'contador' || roleKey === 'superadmin') {
    return allWrite;
  }
  return allHidden;
}

/**
 * Resuelve nivel de una capacidad Rita (hidden|write).
 * Si el módulo `rita` está oculto, todas las capacidades quedan ocultas.
 */
export function resolveRitaCap(permsEntry, roleKey, capKey, { isProfile = false } = {}) {
  if (!RITA_CAP_KEYS.includes(capKey)) return 'hidden';
  if (roleKey === 'superadmin') return 'write';

  const ritaLevel = isProfile
    ? (permsEntry && !Array.isArray(permsEntry) ? (permsEntry.rita ?? 'hidden') : 'hidden')
    : resolveModuleAccess(permsEntry, roleKey, 'rita');

  if (ritaLevel === 'hidden' || ritaLevel === 'na') return 'hidden';

  const caps = (permsEntry && !Array.isArray(permsEntry) && permsEntry.rita_caps
    && typeof permsEntry.rita_caps === 'object')
    ? permsEntry.rita_caps
    : null;

  if (caps && caps[capKey] !== undefined) {
    return caps[capKey] === 'write' ? 'write' : 'hidden';
  }
  if (isProfile) return 'hidden';
  return defaultRitaCaps(roleKey)[capKey] || 'hidden';
}

export function canRitaCapability(permsEntry, roleKey, capKey, opts) {
  return resolveRitaCap(permsEntry, roleKey, capKey, opts) === 'write';
}

/**
 * Perfiles de usuario de Administrar Propiedades (rentas). Independientes del condominio.
 * Misma matriz que `backend/core/rental_access.py` (verificada con un script en cada despliegue).
 *
 * Niveles por módulo:  W = escritura · O = ejecución (avance, evidencias, inspecciones) · R = consulta · - = sin acceso
 */
export const RENTAL_ROLES = [
  { key: 'admin',         label: 'Administrador',                color: '#1F7D5B', bg: '#EDFDF7',
    desc: 'Control total del portafolio: propiedades, contratos, cobranza, mantenimiento, finanzas, configuración y equipo.' },
  { key: 'gerente',       label: 'Gerente de propiedades',       color: '#0E7490', bg: '#ECFEFF',
    desc: 'Opera el portafolio día a día: propiedades, contratos, CRM y todo el mantenimiento. Consulta cobranza y finanzas; no cambia la configuración.' },
  { key: 'comercial',     label: 'Ejecutivo comercial',          color: '#C2410C', bg: '#FFF7ED',
    desc: 'Coloca espacios: gestiona el CRM de rentas, contratos y vigencias. Consulta propiedades y ocupación; no ve cobranza ni finanzas.' },
  { key: 'mantenimiento', label: 'Coordinador de mantenimiento', color: '#7C3AED', bg: '#F5F3FF',
    desc: 'Dirige la operación técnica: solicitudes, órdenes de trabajo, preventivo, activos e inspecciones, con sus indicadores y costos.' },
  { key: 'tecnico',       label: 'Técnico de campo',             color: '#B45309', bg: '#FFFBEB',
    desc: 'Ejecuta en campo: actualiza el avance de las órdenes, sube evidencias y realiza inspecciones. No crea ni elimina registros.' },
  { key: 'tesorero',      label: 'Tesorero',                     color: '#D97706', bg: '#FFFBEB',
    desc: 'Cobranza y tesorería: cargos, pagos, rent roll y CAPEX/OPEX. Consulta contratos y mantenimiento.' },
  { key: 'contador',      label: 'Contador',                     color: '#2563EB', bg: '#EFF6FF',
    desc: 'Contabilidad: CAPEX/OPEX y presupuesto; consulta cobranza, rent roll, contratos y reportes.' },
  { key: 'auditor',       label: 'Auditor',                      color: '#64748B', bg: '#F1F5F9',
    desc: 'Consulta de todo el portafolio para revisión, sin modificar datos ni ver la configuración.' },
];

export const RENTAL_ROLE_KEYS = RENTAL_ROLES.map(r => r.key);

//                              admin gerente comercial mantto tecnico tesor contador auditor
const RENTAL_MATRIX_ROWS = {
  rentas_dashboard:     'W W - - - R R R',
  rentas_reportes:      'W R R R - R R R',
  rentas_propiedades:   'W W R R R R R R',
  rentas_solicitudes:   'W W - W R - - R',
  rentas_mantenimiento: 'W W - W O R R R',
  rentas_preventivo:    'W W - W R - - R',
  rentas_activos:       'W W - W R R R R',
  rentas_inspecciones:  'W W - W O - - R',
  rentas_indicadores:   'W R - R - R R R',
  rentas_crm:           'W W W - - - - R',
  rentas_contratos:     'W W W - - R R R',
  rentas_calendario:    'W W W - - R R R',
  rentas_cobranza:      'W R - - - W R R',
  rentas_rentroll:      'W R R - - R R R',
  rentas_capex:         'W R - R - W W R',
  rentas_config:        'W - - - - - - -',
  rentas_guias:         'W R R R R R R R',
};

const LEVEL_OF_CODE = { W: 'write', O: 'operate', R: 'read', '-': 'none' };
const LEVEL_RANK = { none: 0, read: 1, operate: 2, write: 3 };

export const RENTAL_ROLE_ACCESS = Object.fromEntries(
  RENTAL_ROLE_KEYS.map((role, i) => [
    role,
    Object.fromEntries(Object.entries(RENTAL_MATRIX_ROWS).map(([mod, row]) => [mod, LEVEL_OF_CODE[row.split(' ')[i]]])),
  ]),
);

/** Nivel por defecto de un perfil de rentas sobre un módulo. */
export function rentalDefaultLevel(role, moduleKey) {
  const mods = RENTAL_ROLE_ACCESS[role];
  if (!mods) return 'none';
  if (moduleKey in mods) return mods[moduleKey];
  if (moduleKey === 'notificaciones') return 'read';
  if (moduleKey === 'mi_membresia') return role === 'admin' ? 'read' : 'none';
  return 'none';
}

/** Aplica la personalización del tenant (`module_permissions[role]`) igual que el backend. */
export function rentalAccessLevel(role, moduleKey, permsEntry) {
  if (role === 'superadmin') return 'write';
  const base = rentalDefaultLevel(role, moduleKey);
  if (permsEntry === undefined || permsEntry === null) return base;
  if (Array.isArray(permsEntry)) return permsEntry.includes(moduleKey) && base === 'none' ? 'read' : base;
  const v = permsEntry[moduleKey];
  if (v === 'hidden') return 'none';
  if (v === 'read') return base === 'none' ? 'read' : (LEVEL_RANK[base] > 1 ? 'read' : base);
  if (v === 'write') return 'write';
  return base;
}

/** ¿El nivel alcanza lo que se necesita? (`need`: read | operate | write) */
export function levelAtLeast(level, need = 'write') {
  return (LEVEL_RANK[level] || 0) >= (LEVEL_RANK[need] || 0);
}

/** Módulos de rentas visibles por perfil (menú). Derivado de la matriz. */
const modulesOf = (role) => [
  ...Object.keys(RENTAL_MATRIX_ROWS).filter(m => rentalDefaultLevel(role, m) !== 'none'),
  'notificaciones',
  ...(role === 'admin' ? ['mi_membresia'] : []),
];

/** Módulos del espacio de rentas (inmobiliaria). Independiente del condominio. */
export const RENTAL_ROLE_BASE_MODULES = {
  ...Object.fromEntries(RENTAL_ROLE_KEYS.map(r => [r, modulesOf(r)])),
  superadmin: [...Object.keys(RENTAL_MATRIX_ROWS), 'rentas_preventivo', 'notificaciones', 'mi_membresia'].filter((m, i, a) => a.indexOf(m) === i),
};

/** Grupos de menú y catálogo (condominio y Administrar Propiedades). */
export const MODULE_GROUPS = {
  sistema:   { id: 'sistema',   label: 'Sistema' },
  general:   { id: 'general',   label: 'General' },
  operacion: { id: 'operacion', label: 'Operación' },
  comunidad: { id: 'comunidad', label: 'Comunidad' },
  comercial: { id: 'comercial', label: 'Comercial' },
  finanzas:  { id: 'finanzas',  label: 'Finanzas' },
  ajustes:   { id: 'ajustes',   label: 'Ajustes' },
};

const GROUP_ORDER = ['sistema', 'general', 'operacion', 'comunidad', 'comercial', 'finanzas', 'ajustes'];

export const CONDO_MODULE_CATALOG = [
  { key: 'dashboard',       group: 'general',   label: 'Dashboard',              desc: 'Vista general del condominio' },
  { key: 'notificaciones',  group: 'general',   label: 'Notificaciones',         desc: 'Avisos y alertas internos' },
  { key: 'onboarding',      group: 'general',   label: 'Guías de uso',           desc: 'Tutoriales y guía de inicio' },
  { key: 'my_unit',         group: 'general',   label: 'Mi Unidad',              desc: 'Vista individual para residentes' },
  { key: 'reservas',        group: 'operacion', label: 'Reservas',               desc: 'Reservas de áreas comunes' },
  { key: 'paqueteria',      group: 'operacion', label: 'Paquetería / Mensajería', desc: 'Recepción y entrega de paquetes en vigilancia' },
  { key: 'visitas',         group: 'operacion', label: 'Visitas Autorizadas',     desc: 'Autorizaciones de visitas, QR e ingreso en caseta' },
  { key: 'mantenimientos',  group: 'operacion', label: 'Mantenimientos',          desc: 'Preventivos, correctivos, evidencias e historial' },
  { key: 'blog',            group: 'comunidad', label: 'Comunicación',            desc: 'Publicaciones y comunicados para la comunidad' },
  { key: 'asambleas',       group: 'comunidad', label: 'Asambleas',               desc: 'Convocatorias, quórum, minutas e historial' },
  { key: 'cobranza',        group: 'finanzas',  label: 'Cobranza',               desc: 'Registro y seguimiento de cuotas' },
  { key: 'gastos',          group: 'finanzas',  label: 'Gastos',                 desc: 'Control de egresos conciliados y en tránsito' },
  { key: 'caja_chica',      group: 'finanzas',  label: 'Caja Chica',             desc: 'Registro de gastos menores de caja chica' },
  { key: 'estado_cuenta',   group: 'finanzas',  label: 'Estado de Cuenta',       desc: 'Resumen financiero por unidad' },
  { key: 'plan_pagos',      group: 'finanzas',  label: 'Plan de Pagos',          desc: 'Acuerdos de pago diferido' },
  { key: 'cierre_periodo',  group: 'finanzas',  label: 'Periodos',               desc: 'Gestión y expediente de períodos financieros' },
  { key: 'planeacion',      group: 'finanzas',  label: 'Planeación',             desc: 'Presupuesto anual y proyectos del condominio' },
  { key: 'enviar_pago',     group: 'finanzas',  label: 'Enviar pago',            desc: 'Envío de comprobantes por el residente' },
  {
    key: 'rita',
    group: 'finanzas',
    label: 'Rita',
    desc: 'Asistente de estados de cuenta → Cobranza y Gastos. Los permisos detallados se configuran por función debajo.',
    hasCapabilities: true,
  },
  { key: 'config',          group: 'ajustes',   label: 'Configuración',          desc: 'Ajustes generales del condominio' },
  { key: 'mi_membresia',    group: 'ajustes',   label: 'Mi Membresía',           desc: 'Plan, facturación y estado de la suscripción' },
];

export const RENTAS_MODULE_CATALOG = [
  { key: 'rentas_dashboard',     group: 'general',   label: 'Dashboard',       desc: 'Vista general del portafolio' },
  { key: 'rentas_reportes',      group: 'general',   label: 'Reportes',        desc: 'Informes a pedido, informe anual de preventivo y SLA de proveedores' },
  { key: 'notificaciones',       group: 'general',   label: 'Notificaciones',  desc: 'Avisos por correo y en la app' },
  { key: 'rentas_guias',         group: 'general',   label: 'Guías de uso',    desc: 'Tutoriales interactivos para aprender cada módulo' },
  { key: 'rentas_propiedades',   group: 'operacion', label: 'Propiedades',     desc: 'Tipos rentables y especificaciones por inmueble' },
  { key: 'rentas_solicitudes',   group: 'operacion', label: 'Solicitudes',     desc: 'Helpdesk: reportes de inquilinos y propietarios con SLA' },
  { key: 'rentas_mantenimiento', group: 'operacion', label: 'Órdenes de trabajo', desc: 'Correctivos, preventivos, evidencias, proveedores y catálogos' },
  { key: 'rentas_preventivo',    group: 'operacion', label: 'Preventivo',      desc: 'Planes por frecuencia que generan órdenes automáticas' },
  { key: 'rentas_activos',       group: 'operacion', label: 'Activos',         desc: 'Equipos por inmueble: garantía, vida útil e historial' },
  { key: 'rentas_inspecciones',  group: 'operacion', label: 'Inspecciones',    desc: 'Listas de verificación; las fallas crean órdenes' },
  { key: 'rentas_indicadores',   group: 'operacion', label: 'Indicadores',     desc: 'SLA, MTTR, costos, cumplimiento preventivo y activos' },
  { key: 'rentas_crm',           group: 'comercial', label: 'CRM de rentas',   desc: 'Leads, pipeline y conversión a contrato' },
  { key: 'rentas_contratos',     group: 'comercial', label: 'Contratos',       desc: 'Tipos de contrato, asistente legal, firmas y publicación' },
  { key: 'rentas_calendario',    group: 'comercial', label: 'Contratos · Vigencias', desc: 'Submódulo de Contratos: vencimientos, renovaciones y reservas' },
  { key: 'rentas_cobranza',      group: 'finanzas',  label: 'Cobranza',        desc: 'Cargos por tipo, renta fija/variable y mora' },
  { key: 'rentas_rentroll',      group: 'finanzas',  label: 'Rent Roll',       desc: 'Ocupación, specs y renta fija o variable' },
  { key: 'rentas_capex',         group: 'finanzas',  label: 'CAPEX y OPEX',    desc: 'Proyectos de inversión, gasto operativo y presupuesto en un solo lugar' },
  { key: 'rentas_config',        group: 'ajustes',   label: 'Configuración',   desc: 'Ajustes de Administrar Propiedades' },
  { key: 'mi_membresia',         group: 'ajustes',   label: 'Mi Membresía',    desc: 'Plan y estado de la suscripción' },
];

/** Catálogo base por espacio de trabajo (antes de personalizaciones del superadmin). */
export function baseCatalogFor(ws) {
  return ws === 'rentas' ? RENTAS_MODULE_CATALOG : CONDO_MODULE_CATALOG;
}

/**
 * Aplica la personalización del superadmin (nombre, descripción, activo) al catálogo.
 * includeDisabled=false retira los módulos desactivados del sistema.
 */
export function applyModuleOverrides(catalog, overrides, { includeDisabled = true } = {}) {
  return (catalog || [])
    .map(m => {
      const o = (overrides && overrides[m.key]) || {};
      return {
        ...m,
        label: o.label || m.label,
        desc: o.desc || m.desc,
        baseLabel: m.label,
        baseDesc: m.desc,
        enabled: o.enabled !== false,
        customized: !!(o.label || o.desc || o.enabled === false),
      };
    })
    .filter(m => includeDisabled || m.enabled);
}

export function disabledModuleKeys(overrides) {
  return Object.entries(overrides || {})
    .filter(([key, o]) => o && o.enabled === false && key !== 'mi_membresia')
    .map(([key]) => key);
}

export function groupModules(catalog) {
  const buckets = new Map(GROUP_ORDER.map(id => [id, []]));
  for (const mod of catalog || []) {
    const id = MODULE_GROUPS[mod.group] ? mod.group : 'general';
    if (!buckets.has(id)) buckets.set(id, []);
    buckets.get(id).push(mod);
  }
  return [...buckets.entries()]
    .filter(([, items]) => items.length)
    .map(([id, items]) => ({ id, label: MODULE_GROUPS[id]?.label || id, items }));
}

/** Full condominio catalog shown in the permissions tab and custom profiles. */
export const CONDO_MODULE_KEYS = CONDO_MODULE_CATALOG.map(m => m.key);

/** Modules that only make sense for specific predefined roles. */
export const ROLE_LOCKED_MODULES = {
  my_unit:     ['vecino'],
  enviar_pago: ['vecino'],
};

export function isCondoModuleAssignable(roleKey, moduleKey) {
  if (!CONDO_MODULE_KEYS.includes(moduleKey)) return false;
  const locked = ROLE_LOCKED_MODULES[moduleKey];
  if (locked) return locked.includes(roleKey);
  return true;
}

export function defaultModuleAccess(roleKey, moduleKey) {
  if (!isCondoModuleAssignable(roleKey, moduleKey)) return 'na';
  return (ROLE_BASE_MODULES[roleKey] || []).includes(moduleKey) ? 'write' : 'hidden';
}

/**
 * Resolve hidden | read | write | na for a predefined role.
 * Handles missing config, old allowlist arrays, and the object format.
 */
export function resolveModuleAccess(permsEntry, roleKey, moduleKey) {
  if (!isCondoModuleAssignable(roleKey, moduleKey)) return 'na';
  if (permsEntry === undefined || permsEntry === null) {
    return defaultModuleAccess(roleKey, moduleKey);
  }
  if (Array.isArray(permsEntry)) {
    if (permsEntry.includes(moduleKey)) return 'write';
    return defaultModuleAccess(roleKey, moduleKey);
  }
  if (permsEntry[moduleKey] !== undefined) return permsEntry[moduleKey];
  return defaultModuleAccess(roleKey, moduleKey);
}

/**
 * Nav / route visibility from a perms entry (old array + new object).
 * isProfilePerms=true: custom profile — unset modules stay hidden.
 * Works for condominio and rentas: missing keys fall back to the role base.
 */
export function isModuleVisible(permsEntry, moduleKey, roleKey, isProfilePerms = false) {
  if (isProfilePerms) {
    if (!permsEntry) return false;
    if (Array.isArray(permsEntry)) return permsEntry.includes(moduleKey);
    const val = permsEntry[moduleKey];
    if (val === undefined) return false;
    return val !== 'hidden';
  }
  const inBase = !!(
    ROLE_BASE_MODULES[roleKey]?.includes(moduleKey)
    || RENTAL_ROLE_BASE_MODULES[roleKey]?.includes(moduleKey)
  );
  if (permsEntry === undefined || permsEntry === null) return inBase;
  if (Array.isArray(permsEntry)) {
    if (permsEntry.includes(moduleKey)) return true;
    return inBase;
  }
  if (permsEntry[moduleKey] !== undefined) return permsEntry[moduleKey] !== 'hidden';
  return inBase;
}

export function emptyProfileModules() {
  return {
    ...Object.fromEntries(CONDO_MODULE_KEYS.map(k => [k, 'hidden'])),
    rita_caps: Object.fromEntries(RITA_CAP_KEYS.map(k => [k, 'hidden'])),
  };
}

/** Normaliza rita_caps al guardar / cargar perfiles y roles. */
export function normalizeRitaCaps(caps, roleKey, { isProfile = false } = {}) {
  const base = isProfile
    ? Object.fromEntries(RITA_CAP_KEYS.map(k => [k, 'hidden']))
    : defaultRitaCaps(roleKey);
  const src = (caps && typeof caps === 'object' && !Array.isArray(caps)) ? caps : {};
  return Object.fromEntries(
    RITA_CAP_KEYS.map(k => [k, src[k] === 'write' ? 'write' : (src[k] === 'hidden' ? 'hidden' : base[k])]),
  );
}

/** Maps app routes to module keys (nav, guides, route guards). */
export const PATH_TO_MODULE = {
  '/app/dashboard':       'dashboard',
  '/app/reservas':        'reservas',
  '/app/cobranza':        'cobranza',
  '/app/gastos':          'gastos',
  '/app/caja-chica':      'caja_chica',
  '/app/estado-cuenta':   'estado_cuenta',
  '/app/plan-pagos':      'plan_pagos',
  '/app/cierre-periodo':  'cierre_periodo',
  '/app/planeacion':      'planeacion',
  '/app/asambleas':       'asambleas',
  '/app/mantenimientos':  'mantenimientos',
  '/app/paqueteria':      'paqueteria',
  '/app/visitas':         'visitas',
  '/app/notificaciones':  'notificaciones',
  '/app/config':          'config',
  '/app/units':           'config',
  '/app/users':           'config',
  '/app/my-unit':         'my_unit',
  '/app/onboarding':      'onboarding',
  '/app/mi-membresia':    'mi_membresia',
  '/app/blog':            'blog',
  '/app/enviar-pago':     'enviar_pago',
  '/app/rentas/dashboard':    'rentas_dashboard',
  '/app/rentas/propiedades':  'rentas_propiedades',
  '/app/rentas/crm':          'rentas_crm',
  '/app/rentas/contratos':    'rentas_contratos',
  '/app/rentas/cobranza':     'rentas_cobranza',
  '/app/rentas/rentroll':     'rentas_rentroll',
  '/app/rentas/calendario':   'rentas_calendario',
  '/app/rentas/mantenimiento': 'rentas_mantenimiento',
  '/app/rentas/solicitudes':  'rentas_solicitudes',
  '/app/rentas/preventivo':   'rentas_preventivo',
  '/app/rentas/activos':      'rentas_activos',
  '/app/rentas/inspecciones': 'rentas_inspecciones',
  '/app/rentas/indicadores':  'rentas_indicadores',
  '/app/rentas/reportes':     'rentas_reportes',
  '/app/rentas/config':       'rentas_config',
  '/app/rentas/guias':        'rentas_guias',
  '/app/rentas/capex':        'rentas_capex',
};

/**
 * Whether the current user can open a module in this tenant.
 * Superadmin always. Then subscription plan, then custom profile, then role matrix.
 */
/**
 * Módulos de renta que cada tenant puede dejar de usar (Configuración → Modo de operación).
 * Las propiedades se operan sin contrato de renta; Operación y CAPEX/OPEX no dependen de esto.
 */
export const LEASING_OPTIONAL_MODULES = ['rentas_crm', 'rentas_cobranza', 'rentas_rentroll'];

export function rentalOffModules(rentalSettings) {
  const rs = rentalSettings && typeof rentalSettings === 'object' ? rentalSettings : {};
  if (rs.leasing_enabled === false) return [...LEASING_OPTIONAL_MODULES];
  return Array.isArray(rs.off_modules) ? rs.off_modules.filter(m => LEASING_OPTIONAL_MODULES.includes(m)) : [];
}

export function userCanAccessModule({
  role,
  isSuperAdmin,
  moduleKey,
  tenantPermsEntry,
  profileModules,
  allowedModules,
  disabledModules,
}) {
  if (!moduleKey) return true;
  if (isSuperAdmin || role === 'superadmin') return true;
  // Módulo retirado del sistema por el superadmin (Espacios y módulos)
  if (Array.isArray(disabledModules) && moduleKey !== 'mi_membresia' && disabledModules.includes(moduleKey)) {
    return false;
  }
  if (
    Array.isArray(allowedModules) &&
    allowedModules.length > 0 &&
    moduleKey !== 'mi_membresia' &&
    !allowedModules.includes(moduleKey)
  ) {
    return false;
  }
  if (profileModules) {
    return isModuleVisible(profileModules, moduleKey, null, true);
  }
  return isModuleVisible(tenantPermsEntry, moduleKey, role);
}

export function normalizeProfileModules(mods) {
  if (!mods || (Array.isArray(mods) && mods.length === 0)) return emptyProfileModules();
  if (Array.isArray(mods)) {
    return {
      ...emptyProfileModules(),
      ...Object.fromEntries(mods.map(k => [k, 'write'])),
    };
  }
  return { ...emptyProfileModules(), ...mods };
}
