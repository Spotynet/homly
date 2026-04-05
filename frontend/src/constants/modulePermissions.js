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
  admin:     ['dashboard', 'reservas', 'cobranza', 'gastos', 'estado_cuenta', 'cierre_periodo', 'notificaciones', 'config'],
  tesorero:  ['dashboard', 'reservas', 'cobranza', 'gastos', 'estado_cuenta', 'cierre_periodo', 'notificaciones', 'config'],
  contador:  ['dashboard', 'cobranza', 'gastos', 'estado_cuenta', 'notificaciones'],
  auditor:   ['dashboard', 'gastos', 'estado_cuenta', 'notificaciones'],
  vigilante: ['dashboard', 'reservas', 'notificaciones'],
  vecino:    ['my_unit', 'reservas', 'estado_cuenta', 'notificaciones'],
};
