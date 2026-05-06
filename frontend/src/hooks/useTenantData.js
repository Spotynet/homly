/**
 * useTenantData — datos del tenant activo.
 *
 * Compartido entre Cobranza, Gastos, CajaChica, Dashboard, EstadoCuenta,
 * PlanPagos y Reservas. Al tener la misma queryKey todos comparten el
 * mismo resultado en caché: si Gastos ya lo cargó, CajaChica lo obtiene
 * instantáneamente sin hacer una nueva petición.
 *
 * staleTime: 5 min — el tenant no cambia con frecuencia.
 */
import { useQuery } from '@tanstack/react-query';
import { tenantsAPI } from '../api/client';
import { queryKeys, STALE } from './queryKeys';

export function useTenantData(tenantId) {
  return useQuery({
    queryKey:  queryKeys.tenant(tenantId),
    queryFn:   () => tenantsAPI.get(tenantId).then(r => r.data),
    enabled:   !!tenantId,
    staleTime: STALE.SHARED,
  });
}
