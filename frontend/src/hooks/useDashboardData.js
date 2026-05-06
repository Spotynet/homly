/**
 * useDashboardData — estadísticas completas del Dashboard para un período.
 *
 * Usa Promise.allSettled internamente para que un endpoint lento o roto
 * no impida mostrar el resto del dashboard (misma política que el código
 * original con allSettled).
 *
 * Cada query es independiente para que React Query pueda cachearlas y
 * refetchearlas por separado. El reporte general es más pesado y tiene
 * staleTime más largo (5 min).
 *
 * staleTime: PERIOD_CLOSED (Infinity) si el período está cerrado,
 *            PERIOD_ACTIVE (2 min) si está abierto.
 */
import { useQuery } from '@tanstack/react-query';
import { reportsAPI, assemblyAPI } from '../api/client';
import { queryKeys, STALE }        from './queryKeys';
import { useTenantData }           from './useTenantData';
import { useClosedPeriods }        from './useClosedPeriods';

export function useDashboardData(tenantId, period) {
  const tenantQuery       = useTenantData(tenantId);
  const closedPeriodsHook = useClosedPeriods(tenantId);

  const isClosed  = closedPeriodsHook.isPeriodClosed(period);
  const staleTime = isClosed ? STALE.PERIOD_CLOSED : STALE.PERIOD_ACTIVE;

  // Stats principales del dashboard
  const dashQuery = useQuery({
    queryKey:  queryKeys.dashboard(tenantId, period),
    queryFn:   () => reportsAPI.dashboard(tenantId, period).then(r => r.data),
    enabled:   !!tenantId && !!period,
    staleTime,
  });

  // Reporte general (más pesado — staleTime mayor)
  const reporteQuery = useQuery({
    queryKey:  queryKeys.reporteGeneral(tenantId, period),
    queryFn:   () =>
      reportsAPI.reporteGeneral(tenantId, period)
        .then(r => r.data)
        .catch(() => null),
    enabled:   !!tenantId && !!period,
    staleTime: isClosed ? STALE.PERIOD_CLOSED : STALE.SHARED,
  });

  // Comités (datos del tenant — poco frecuentes)
  const committeesQuery = useQuery({
    queryKey:  ['committees', tenantId],
    queryFn:   () =>
      assemblyAPI.committees(tenantId).then(r => {
        const raw = r.data;
        return Array.isArray(raw) ? raw : (raw?.results ?? []);
      }).catch(() => []),
    enabled:   !!tenantId,
    staleTime: STALE.SHARED,
    placeholderData: [],
  });

  return {
    stats:         dashQuery.data       ?? null,
    tenant:        tenantQuery.data     ?? null,
    committees:    committeesQuery.data ?? [],
    generalReport: reporteQuery.data    ?? null,
    closedPeriods: closedPeriodsHook.closedPeriods,
    isPeriodClosed: isClosed,

    isLoading:
      dashQuery.isLoading ||
      tenantQuery.isLoading,
    isError:    dashQuery.isError,
    error:      dashQuery.error,

    refetch: dashQuery.refetch,
  };
}
