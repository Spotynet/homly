/**
 * useExtraFields — campos adicionales de cobro del tenant.
 *
 * Compartido entre Cobranza y Gastos.
 * Devuelve el array completo. Los filtros por field_type se aplican
 * en el componente con useMemo (no se duplican peticiones).
 *
 * staleTime: 5 min.
 */
import { useQuery } from '@tanstack/react-query';
import { extraFieldsAPI } from '../api/client';
import { queryKeys, STALE } from './queryKeys';

export function useExtraFields(tenantId) {
  return useQuery({
    queryKey:  queryKeys.extraFields(tenantId),
    queryFn:   () =>
      extraFieldsAPI.list(tenantId, { page_size: 9999 }).then(r => {
        const raw = r.data;
        return Array.isArray(raw) ? raw : (raw?.results ?? []);
      }),
    enabled:   !!tenantId,
    staleTime: STALE.SHARED,
    placeholderData: [],
  });
}
