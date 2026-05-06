/**
 * useReservasData — reservas de áreas comunes con filtros opcionales.
 *
 * Combina:
 *  - useTenantData      → áreas comunes (tenant.common_areas) y settings
 *  - useUnits           → unidades para el selector del formulario
 *  - reservationsAPI    → reservas filtradas por los params actuales
 *
 * Los params de filtro (status, date, area_id…) forman parte de la queryKey.
 * staleTime: RESERVAS (1 min).
 *
 * Invalidación sugerida tras aprobar/rechazar/cancelar/crear una reserva:
 *   queryClient.invalidateQueries({ queryKey: ['reservas', tenantId] })
 */
import { useQuery }      from '@tanstack/react-query';
import { reservationsAPI } from '../api/client';
import { queryKeys, STALE } from './queryKeys';
import { useTenantData }    from './useTenantData';
import { useUnits }         from './useUnits';

export function useReservasData(tenantId, params = {}) {
  const tenantQuery = useTenantData(tenantId);
  const unitsQuery  = useUnits(tenantId);

  const reservasQuery = useQuery({
    queryKey:  queryKeys.reservas(tenantId, params),
    queryFn:   () =>
      reservationsAPI.list(tenantId, params).then(r => {
        const raw = r.data;
        return Array.isArray(raw) ? raw : (raw?.results ?? []);
      }),
    enabled:   !!tenantId,
    staleTime: STALE.RESERVAS,
    placeholderData: [],
  });

  return {
    reservas:  reservasQuery.data  ?? [],
    tenantData: tenantQuery.data   ?? null,
    units:     unitsQuery.data     ?? [],
    isLoading: reservasQuery.isLoading || tenantQuery.isLoading,
    isError:   reservasQuery.isError,
    refetch:   reservasQuery.refetch,
  };
}
