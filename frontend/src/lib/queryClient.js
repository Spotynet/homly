/**
 * Homly — React Query Client
 *
 * Singleton que se importa en App.jsx para el QueryClientProvider
 * y en los hooks para acceder a invalidateQueries y setQueryData.
 *
 * Configuración por defecto:
 *   staleTime   2 min  — datos se consideran frescos durante 2 minutos.
 *   gcTime     10 min  — datos se mantienen en caché 10 minutos sin
 *                        suscriptores activos antes de ser purgados.
 *   retry        1     — reintenta una vez antes de marcar como error.
 *   refetchOnWindowFocus  true — al regresar a la pestaña se refresca
 *                               si el dato está stale.
 *
 * Módulos específicos (periodos cerrados, tenant, etc.) sobreescriben
 * staleTime en su propio useQuery. Ver hooks/ para los valores exactos.
 */
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime:          2 * 60 * 1000,   // 2 minutos
      gcTime:            10 * 60 * 1000,   // 10 minutos
      retry:              1,
      refetchOnWindowFocus: true,
    },
    mutations: {
      retry: 0,
    },
  },
});
