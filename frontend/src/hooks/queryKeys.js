/**
 * Homly — Centralized React Query Key Definitions
 *
 * REGLA: cada clave es un array serializable que identifica univocamente un
 * recurso. La jerarquía permite invalidar por prefijo:
 *
 *   queryClient.invalidateQueries({ queryKey: ['tenant', tenantId] })
 *   → invalida tenant, units, extraFields, closedPeriods, payments, etc.
 *
 *   queryClient.invalidateQueries({ queryKey: ['gastos', tenantId] })
 *   → invalida todos los períodos de gastos de ese tenant.
 *
 *   queryClient.invalidateQueries({ queryKey: ['gastos', tenantId, period] })
 *   → invalida solo ese período específico.
 *
 * Jerarquía de claves:
 *   ['tenant', tenantId]                       → datos del tenant
 *   ['units',        tenantId]                 → unidades del tenant
 *   ['extra-fields', tenantId]                 → campos adicionales
 *   ['closed-periods', tenantId]               → períodos cerrados
 *   ['payments',     tenantId, period]         → cobranza por período
 *   ['unrecognized', tenantId, period]         → ingresos no reconocidos
 *   ['active-plans', tenantId]                 → planes de pago aceptados
 *   ['gastos',       tenantId, period]         → gastos por período
 *   ['caja-chica',   tenantId, period]         → caja chica por período
 *   ['dashboard',    tenantId, period]         → estadísticas del dashboard
 *   ['reporte-general', tenantId, period]      → reporte general
 *   ['notificaciones', tenantId]               → notificaciones del usuario
 *   ['reservas',     tenantId, params]         → reservas (con parámetros)
 *   ['reservas-areas', tenantId]               → áreas comunes del tenant
 *   ['plan-pagos',   tenantId, params]         → planes de pago (lista)
 */

export const queryKeys = {
  // ── Datos compartidos ─────────────────────────────────────────────────────
  tenant:         (tenantId)         => ['tenant',         tenantId],
  units:          (tenantId)         => ['units',          tenantId],
  extraFields:    (tenantId)         => ['extra-fields',   tenantId],
  closedPeriods:  (tenantId)         => ['closed-periods', tenantId],

  // ── Cobranza / Pagos ──────────────────────────────────────────────────────
  payments:       (tenantId, period) => ['payments',       tenantId, period],
  unrecognized:   (tenantId, period) => ['unrecognized',   tenantId, period],
  activePlans:    (tenantId)         => ['active-plans',   tenantId],

  // ── Gastos ────────────────────────────────────────────────────────────────
  gastos:         (tenantId, period) => ['gastos',         tenantId, period],

  // ── Caja Chica ────────────────────────────────────────────────────────────
  cajaChica:      (tenantId, period) => ['caja-chica',     tenantId, period],

  // ── Dashboard ─────────────────────────────────────────────────────────────
  dashboard:      (tenantId, period) => ['dashboard',      tenantId, period],
  reporteGeneral: (tenantId, period) => ['reporte-general',tenantId, period],

  // ── Estado de Cuenta ──────────────────────────────────────────────────────
  estadoCuenta:   (tenantId, params) => ['estado-cuenta',  tenantId, params],
  reporteAdeudos: (tenantId, params) => ['reporte-adeudos',tenantId, params],

  // ── Notificaciones ────────────────────────────────────────────────────────
  notificaciones: (tenantId)         => ['notificaciones', tenantId],

  // ── Reservas ──────────────────────────────────────────────────────────────
  reservas:       (tenantId, params) => ['reservas',       tenantId, params],
  reservasAreas:  (tenantId)         => ['reservas-areas', tenantId],

  // ── Plan de Pagos ─────────────────────────────────────────────────────────
  planPagos:      (tenantId, params) => ['plan-pagos',     tenantId, params],
};

// ── Constantes de staleTime reutilizables ─────────────────────────────────────
export const STALE = {
  SHARED:          5 * 60 * 1000,   // datos compartidos (tenant, units, fields): 5 min
  PERIOD_ACTIVE:   2 * 60 * 1000,   // datos de período activo: 2 min
  PERIOD_CLOSED:   Infinity,         // datos de período cerrado: nunca refetch
  CLOSED_PERIODS:  30 * 1000,        // lista de períodos cerrados: 30 seg
  NOTIFICATIONS:   30 * 1000,        // notificaciones: 30 seg (cambian frecuentemente)
  RESERVAS:        60 * 1000,        // reservas: 1 min
};
