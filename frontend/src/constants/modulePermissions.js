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
  admin:     ['dashboard', 'reservas', 'cobranza', 'gastos', 'caja_chica', 'estado_cuenta', 'plan_pagos', 'cierre_periodo', 'planeacion', 'asambleas', 'mantenimientos', 'paqueteria', 'visitas', 'notificaciones', 'onboarding', 'mi_membresia', 'config', 'blog'],
  tesorero:  ['dashboard', 'reservas', 'cobranza', 'gastos', 'caja_chica', 'estado_cuenta', 'plan_pagos', 'cierre_periodo', 'planeacion', 'asambleas', 'mantenimientos', 'notificaciones', 'onboarding', 'blog'],
  contador:  ['dashboard', 'reservas', 'cobranza', 'gastos', 'caja_chica', 'estado_cuenta', 'plan_pagos', 'cierre_periodo', 'planeacion', 'asambleas', 'mantenimientos', 'notificaciones', 'onboarding', 'blog'],
  auditor:   ['dashboard', 'cobranza', 'reservas', 'gastos', 'caja_chica', 'estado_cuenta', 'plan_pagos', 'cierre_periodo', 'planeacion', 'asambleas', 'mantenimientos', 'notificaciones', 'onboarding', 'blog'],
  vigilante: ['dashboard', 'reservas', 'asambleas', 'mantenimientos', 'paqueteria', 'visitas', 'notificaciones', 'blog'],
  vecino:    ['my_unit', 'reservas', 'estado_cuenta', 'plan_pagos', 'notificaciones', 'onboarding', 'blog', 'enviar_pago', 'asambleas', 'mantenimientos', 'visitas'],
};

/** Módulos del espacio de rentas (inmobiliaria). Independiente del condominio. */
export const RENTAL_ROLE_BASE_MODULES = {
  admin:    ['rentas_dashboard', 'rentas_propiedades', 'rentas_crm', 'rentas_contratos', 'rentas_cobranza', 'rentas_rentroll', 'rentas_calendario', 'rentas_config', 'notificaciones', 'mi_membresia'],
  tesorero: ['rentas_dashboard', 'rentas_propiedades', 'rentas_crm', 'rentas_contratos', 'rentas_cobranza', 'rentas_rentroll', 'rentas_calendario', 'notificaciones'],
  contador: ['rentas_dashboard', 'rentas_propiedades', 'rentas_crm', 'rentas_contratos', 'rentas_cobranza', 'rentas_rentroll', 'rentas_calendario', 'notificaciones'],
  auditor:  ['rentas_dashboard', 'rentas_propiedades', 'rentas_crm', 'rentas_contratos', 'rentas_cobranza', 'rentas_rentroll', 'rentas_calendario', 'notificaciones'],
  superadmin: ['rentas_dashboard', 'rentas_propiedades', 'rentas_crm', 'rentas_contratos', 'rentas_cobranza', 'rentas_rentroll', 'rentas_calendario', 'rentas_config', 'notificaciones', 'mi_membresia'],
};

/** Full condominio catalog shown in the permissions tab and custom profiles. */
export const CONDO_MODULE_KEYS = [
  'dashboard',
  'reservas',
  'cobranza',
  'gastos',
  'caja_chica',
  'estado_cuenta',
  'plan_pagos',
  'cierre_periodo',
  'planeacion',
  'asambleas',
  'mantenimientos',
  'paqueteria',
  'visitas',
  'notificaciones',
  'onboarding',
  'mi_membresia',
  'config',
  'my_unit',
  'blog',
  'enviar_pago',
];

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
  return Object.fromEntries(CONDO_MODULE_KEYS.map(k => [k, 'hidden']));
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
