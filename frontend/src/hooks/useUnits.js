/**
 * useUnits — lista completa de unidades del tenant.
 *
 * Compartido entre Cobranza, EstadoCuenta, PlanPagos y Reservas.
 * staleTime: 5 min — las unidades no cambian durante una sesión normal.
 */
import { useQuery } from '@tanstack/react-query';
import { unitsAPI } from '../api/client';
import { queryKeys, STALE } from './queryKeys';

export function useUnits(tenantId, { pageSize = 9999 } = {}) {
  return useQuery({
    queryKey:  queryKeys.units(tenantId),
    queryFn:   () =>
      unitsAPI.list(tenantId, { page_size: pageSize }).then(r => {
        const raw = r.data;
        return Array.isArray(raw) ? raw : (raw?.results ?? []);
      }),
    enabled:   !!tenantId,
    staleTime: STALE.SHARED,
  });
}
