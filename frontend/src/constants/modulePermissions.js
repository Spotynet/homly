/**
 * Shared module permission constants for Homly.
 *
 * ROLE_BASE_MODULES defines which modules each built-in role has access to
 * by default. This is the authoritative source used in:
 *   - Config.jsx  (profile/permission editor)
 *   - AppLayout.jsx (nav item visibility)
 *
 * When a new module is added here, it will automatically become visible for
 * the listed roles even if their saved module_permissions was in the old
 * array format (which acted as an explicit allowlist).
 */
export const ROLE_BASE_MODULES = {
  admin:     ['dashboard', 'reservas', 'cobranza', 'gastos', 'caja_chica', 'estado_cuenta', 'plan_pagos', 'cierre_periodo', 'notificaciones', 'onboarding', 'mi_membresia', 'config'],
  tesorero:  ['dashboard', 'reservas', 'cobranza', 'gastos', 'caja_chica', 'estado_cuenta', 'plan_pagos', 'cierre_periodo', 'notificaciones', 'onboarding'],
  contador:  ['dashboard', 'reservas', 'cobranza', 'gastos', 'caja_chica', 'estado_cuenta', 'plan_pagos', 'cierre_periodo', 'notificaciones', 'onboarding'],
  auditor:   ['dashboard', 'cobranza', 'reservas', 'gastos', 'caja_chica', 'estado_cuenta', 'plan_pagos', 'cierre_periodo', 'notificaciones', 'onboarding'],
  vigilante: ['dashboard', 'reservas', 'notificaciones'],
  vecino:    ['my_unit', 'reservas', 'estado_cuenta', 'plan_pagos', 'notificaciones', 'onboarding'],
};
