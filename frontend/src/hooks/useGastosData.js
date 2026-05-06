/**
 * useGastosData — datos completos del módulo Gastos para un período.
 *
 * Combina:
 *  - gastosAPI.list      → entradas del período (serializer ligero, sin Base64)
 *  - useExtraFields      → campos tipo 'gastos' para el selector del formulario
 *  - useTenantData       → nombre, moneda y logo del tenant
 *  - useClosedPeriods    → lista de períodos cerrados
 *
 * staleTime del período: Infinity si el período está cerrado (nunca cambia),
 * PERIOD_ACTIVE (2 min) si está abierto.
 *
 * Invalidación sugerida tras mutaciones:
 *   queryClient.invalidateQueries({ queryKey: queryKeys.gastos(tenantId, period) })
 */
import { useQuery } from '@tanstack/react-query';
import { gastosAPI } from '../api/client';
import { queryKeys, STALE } from './queryKeys';
import { useTenantData }    from './useTenantData';
import { useExtraFields }   from './useExtraFields';
import { useClosedPeriods } from './useClosedPeriods';

export function useGastosData(tenantId, period) {
  const tenantQuery       = useTenantData(tenantId);
  const extraFieldsQuery  = useExtraFields(tenantId);
  const closedPeriodsHook = useClosedPeriods(tenantId);

  const isClosed  = closedPeriodsHook.isPeriodClosed(period);
  const staleTime = isClosed ? STALE.PERIOD_CLOSED : STALE.PERIOD_ACTIVE;

  const gastosQuery = useQuery({
    queryKey:  queryKeys.gastos(tenantId, period),
    queryFn:   () =>
      gastosAPI.list(tenantId, { period, page_size: 9999 }).then(r => {
        const raw = r.data;
        return Array.isArray(raw) ? raw : (raw?.results ?? []);
      }),
    enabled:   !!tenantId && !!period,
    staleTime,
    placeholderData: [],
  });

  // Derivados: campos tipo gastos habilitados
  const allFields = extraFieldsQuery.data ?? [];
  const fields = allFields.filter(
    f => f.field_type === 'gastos' && f.enabled && f.show_in_gastos !== false
  );

  return {
    // Datos principales
    gastos:        gastosQuery.data      ?? [],
    fields,
    tenant:        tenantQuery.data      ?? null,
    closedPeriods: closedPeriodsHook.closedPeriods,
    isPeriodClosed: isClosed,

    // Estados de carga
    isLoading:
      gastosQuery.isLoading ||
      tenantQuery.isLoading ||
      closedPeriodsHook.isLoading,
    isError:
      gastosQuery.isError ||
      tenantQuery.isError,

    // Refetch manual (útil para el botón de recargar)
    refetch: gastosQuery.refetch,
  };
}
