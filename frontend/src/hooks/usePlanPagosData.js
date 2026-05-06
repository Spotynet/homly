/**
 * usePlanPagosData — lista de planes de pago del tenant con filtros opcionales.
 *
 * Los params (status, unit_id, etc.) forman parte de la queryKey para que
 * cada combinación de filtros tenga su propia entrada de caché.
 *
 * staleTime: PERIOD_ACTIVE (2 min).
 *
 * Invalidación sugerida tras aprobar/rechazar/cancelar/crear un plan:
 *   queryClient.invalidateQueries({ queryKey: ['plan-pagos', tenantId] })
 *   (invalida todas las variantes de filtro del tenant)
 */
import { useQuery } from '@tanstack/react-query';
import { paymentPlansAPI } from '../api/client';
import { queryKeys, STALE } from './queryKeys';
import { useUnits }          from './useUnits';

export function usePlanPagosData(tenantId, params = {}) {
  const unitsQuery = useUnits(tenantId);

  const plansQuery = useQuery({
    queryKey:  queryKeys.planPagos(tenantId, params),
    queryFn:   () =>
      paymentPlansAPI.list(tenantId, params).then(r => {
        const raw = r.data;
        return Array.isArray(raw) ? raw : (raw?.results ?? []);
      }),
    enabled:   !!tenantId,
    staleTime: STALE.PERIOD_ACTIVE,
    placeholderData: [],
  });

  return {
    plans:     plansQuery.data  ?? [],
    units:     unitsQuery.data  ?? [],
    isLoading: plansQuery.isLoading || unitsQuery.isLoading,
    isError:   plansQuery.isError,
    refetch:   plansQuery.refetch,
  };
}
