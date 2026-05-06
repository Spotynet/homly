/**
 * useCajaChicaData — datos completos del módulo Caja Chica para un período.
 *
 * Combina:
 *  - cajaChicaAPI.list   → entradas del período (serializer ligero, sin Base64)
 *  - useTenantData       → nombre, moneda y logo del tenant
 *  - useClosedPeriods    → lista de períodos cerrados
 *
 * staleTime: Infinity para períodos cerrados, PERIOD_ACTIVE (2 min) para abiertos.
 *
 * Invalidación sugerida tras mutaciones:
 *   queryClient.invalidateQueries({ queryKey: queryKeys.cajaChica(tenantId, period) })
 */
import { useQuery } from '@tanstack/react-query';
import { cajaChicaAPI } from '../api/client';
import { queryKeys, STALE } from './queryKeys';
import { useTenantData }    from './useTenantData';
import { useClosedPeriods } from './useClosedPeriods';

export function useCajaChicaData(tenantId, period) {
  const tenantQuery       = useTenantData(tenantId);
  const closedPeriodsHook = useClosedPeriods(tenantId);

  const isClosed  = closedPeriodsHook.isPeriodClosed(period);
  const staleTime = isClosed ? STALE.PERIOD_CLOSED : STALE.PERIOD_ACTIVE;

  const cajaQuery = useQuery({
    queryKey:  queryKeys.cajaChica(tenantId, period),
    queryFn:   () =>
      cajaChicaAPI.list(tenantId, { period, page_size: 9999 }).then(r => {
        const raw = r.data;
        return Array.isArray(raw) ? raw : (raw?.results ?? []);
      }),
    enabled:   !!tenantId && !!period,
    staleTime,
    placeholderData: [],
  });

  return {
    cajaChica:      cajaQuery.data          ?? [],
    tenant:         tenantQuery.data        ?? null,
    closedPeriods:  closedPeriodsHook.closedPeriods,
    isPeriodClosed: isClosed,

    isLoading:
      cajaQuery.isLoading ||
      tenantQuery.isLoading ||
      closedPeriodsHook.isLoading,
    isError:
      cajaQuery.isError || tenantQuery.isError,

    refetch: cajaQuery.refetch,
  };
}
