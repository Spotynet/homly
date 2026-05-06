/**
 * useNotificacionesData — lista de notificaciones del usuario en el tenant.
 *
 * staleTime corto (30 seg) porque las notificaciones cambian con frecuencia.
 * Se refrescará automáticamente cada vez que el usuario vuelva a la pestaña.
 *
 * Invalidación sugerida tras marcar como leída:
 *   queryClient.invalidateQueries({ queryKey: queryKeys.notificaciones(tenantId) })
 */
import { useQuery } from '@tanstack/react-query';
import { notificationsAPI } from '../api/client';
import { queryKeys, STALE } from './queryKeys';

export function useNotificacionesData(tenantId) {
  const query = useQuery({
    queryKey:  queryKeys.notificaciones(tenantId),
    queryFn:   () =>
      notificationsAPI.list(tenantId, {}).then(r => {
        const raw = r.data;
        return Array.isArray(raw) ? raw : (raw?.results ?? []);
      }),
    enabled:   !!tenantId,
    staleTime: STALE.NOTIFICATIONS,
    placeholderData: [],
  });

  return {
    notifications: query.data ?? [],
    isLoading:     query.isLoading,
    isError:       query.isError,
    refetch:       query.refetch,
  };
}
