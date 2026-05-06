/**
 * useClosedPeriods — lista de períodos cerrados del tenant.
 *
 * Compartido entre Cobranza, Gastos, CajaChica, Dashboard y CierrePeriodo.
 * staleTime corto (30 seg) porque el admin puede cerrar/abrir períodos
 * durante la sesión y queremos que los otros módulos lo reflejen pronto.
 *
 * Expone también una función auxiliar isPeriodClosed(period) para que
 * los componentes no tengan que re-implementar el .some().
 */
import { useQuery } from '@tanstack/react-query';
import { periodsAPI } from '../api/client';
import { queryKeys, STALE } from './queryKeys';

export function useClosedPeriods(tenantId) {
  const query = useQuery({
    queryKey:  queryKeys.closedPeriods(tenantId),
    queryFn:   () =>
      periodsAPI.closedList(tenantId).then(r => {
        const raw = r.data;
        return Array.isArray(raw) ? raw : (raw?.results ?? []);
      }),
    enabled:   !!tenantId,
    staleTime: STALE.CLOSED_PERIODS,
    placeholderData: [],
  });

  const closedPeriods = query.data ?? [];

  return {
    ...query,
    closedPeriods,
    isPeriodClosed: (period) => closedPeriods.some(cp => cp.period === period),
  };
}
