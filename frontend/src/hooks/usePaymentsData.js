/**
 * usePaymentsData — datos completos del módulo Cobranza para un período.
 *
 * Combina:
 *  - paymentsAPI.list          → pagos del período (sin Base64)
 *  - useUnits                  → unidades del tenant
 *  - useExtraFields            → campos de cobro adicionales
 *  - useTenantData             → datos del tenant
 *  - unrecognizedIncomeAPI     → ingresos no reconocidos del período
 *  - useClosedPeriods          → períodos cerrados
 *  - paymentPlansAPI.list      → planes de pago aceptados (para el mapa unit→plan)
 *
 * staleTime: Infinity para períodos cerrados, PERIOD_ACTIVE (2 min) para abiertos.
 *
 * Invalidación sugerida tras capturar/limpiar un pago:
 *   queryClient.invalidateQueries({ queryKey: queryKeys.payments(tenantId, period) })
 */
import { useQuery } from '@tanstack/react-query';
import { paymentsAPI, unrecognizedIncomeAPI, paymentPlansAPI } from '../api/client';
import { queryKeys, STALE } from './queryKeys';
import { useTenantData }    from './useTenantData';
import { useUnits }         from './useUnits';
import { useExtraFields }   from './useExtraFields';
import { useClosedPeriods } from './useClosedPeriods';
import { useMemo }          from 'react';

export function usePaymentsData(tenantId, period) {
  const tenantQuery       = useTenantData(tenantId);
  const unitsQuery        = useUnits(tenantId);
  const extraFieldsQuery  = useExtraFields(tenantId);
  const closedPeriodsHook = useClosedPeriods(tenantId);

  const isClosed  = closedPeriodsHook.isPeriodClosed(period);
  const staleTime = isClosed ? STALE.PERIOD_CLOSED : STALE.PERIOD_ACTIVE;

  const paymentsQuery = useQuery({
    queryKey:  queryKeys.payments(tenantId, period),
    queryFn:   () =>
      paymentsAPI.list(tenantId, { period, page_size: 9999 }).then(r => {
        const raw = r.data;
        return Array.isArray(raw) ? raw : (raw?.results ?? []);
      }),
    enabled:   !!tenantId && !!period,
    staleTime,
    placeholderData: [],
  });

  const unrecognizedQuery = useQuery({
    queryKey:  queryKeys.unrecognized(tenantId, period),
    queryFn:   () =>
      unrecognizedIncomeAPI.list(tenantId, { period, page_size: 9999 }).then(r => {
        const raw = r.data;
        return Array.isArray(raw) ? raw : (raw?.results ?? []);
      }).catch(() => []),
    enabled:   !!tenantId && !!period,
    staleTime,
    placeholderData: [],
  });

  const activePlansQuery = useQuery({
    queryKey:  queryKeys.activePlans(tenantId),
    queryFn:   () =>
      paymentPlansAPI.list(tenantId, { status: 'accepted', page_size: 9999 }).then(r => {
        const raw = r.data;
        return Array.isArray(raw) ? raw : (raw?.results ?? []);
      }).catch(() => []),
    enabled:   !!tenantId,
    staleTime: STALE.SHARED,
    placeholderData: [],
  });

  // Derivados
  const allFields    = extraFieldsQuery.data ?? [];
  const extraFields  = allFields.filter(
    f => f.enabled && (!f.field_type || f.field_type === 'normal') && f.show_in_normal !== false
  );
  const addlExtraFields = allFields.filter(
    f => f.enabled && (!f.field_type || f.field_type === 'normal') && f.show_in_additional !== false
  );
  const allNormalFields = allFields.filter(
    f => f.enabled && (!f.field_type || f.field_type === 'normal')
  );

  // Mapa unit_id → plan aceptado
  const activePlansMap = useMemo(() => {
    const map = {};
    (activePlansQuery.data ?? []).forEach(pl => { map[String(pl.unit)] = pl; });
    return map;
  }, [activePlansQuery.data]);

  return {
    payments:         paymentsQuery.data        ?? [],
    units:            unitsQuery.data           ?? [],
    extraFields,
    addlExtraFields,
    allNormalFields,
    tenantData:       tenantQuery.data          ?? null,
    unrecognizedIncome: unrecognizedQuery.data  ?? [],
    closedPeriods:    closedPeriodsHook.closedPeriods,
    activePlansMap,
    isPeriodClosed:   isClosed,

    isLoading:
      paymentsQuery.isLoading  ||
      unitsQuery.isLoading     ||
      tenantQuery.isLoading    ||
      closedPeriodsHook.isLoading,
    isError:
      paymentsQuery.isError || unitsQuery.isError,

    refetch: paymentsQuery.refetch,
  };
}
