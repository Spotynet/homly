"""
Homly — Middlewares de seguridad
=================================
"""
import logging
from django.core.cache import cache
from django.http import JsonResponse

logger = logging.getLogger(__name__)


class AuthRateLimitMiddleware:
    """
    Rate limiter basado en caché para los endpoints de autenticación.

    Bloquea temporalmente una IP que supere MAX_ATTEMPTS peticiones POST
    a los endpoints de auth dentro de WINDOW_SECONDS segundos.

    Usa Django cache framework (LocMemCache en dev, Redis en producción).
    Con múltiples workers de Gunicorn en producción configurar Redis:
        CACHES = {'default': {'BACKEND': 'django.core.cache.backends.redis.RedisCache',
                              'LOCATION': 'redis://127.0.0.1:6379/1'}}

    Responde HTTP 429 Too Many Requests con un mensaje en español.
    La IP bloqueada se desbloquea automáticamente al expirar la ventana.
    """

    # Endpoints protegidos (solo métodos POST)
    PROTECTED_PATHS = {
        '/api/auth/login/',
        '/api/auth/request-code/',
        '/api/auth/login-with-code/',
    }

    # Límite: 10 intentos por minuto por IP
    MAX_ATTEMPTS: int = 10
    WINDOW_SECONDS: int = 60

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.method == 'POST' and request.path in self.PROTECTED_PATHS:
            ip = self._get_client_ip(request)
            cache_key = f'homly_auth_rl:{ip}:{request.path}'

            attempts = cache.get(cache_key, 0)

            if attempts >= self.MAX_ATTEMPTS:
                logger.warning(
                    'Rate limit superado — IP: %s  path: %s  intentos: %d',
                    ip, request.path, attempts,
                )
                return JsonResponse(
                    {
                        'detail': (
                            f'Demasiados intentos desde tu dirección. '
                            f'Espera {self.WINDOW_SECONDS} segundos antes de volver a intentar.'
                        ),
                        'retry_after': self.WINDOW_SECONDS,
                    },
                    status=429,
                    headers={'Retry-After': str(self.WINDOW_SECONDS)},
                )

            # Incrementar contador; el timeout reinicia la ventana en cada nuevo intento
            cache.set(cache_key, attempts + 1, timeout=self.WINDOW_SECONDS)

        return self.get_response(request)

    @staticmethod
    def _get_client_ip(request) -> str:
        """
        Obtiene la IP real del cliente.
        Respeta el header X-Forwarded-For cuando está detrás de Nginx
        (configurado con proxy_set_header X-Forwarded-For en nginx.conf).
        """
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR', '')
        if x_forwarded_for:
            # El primer elemento es la IP del cliente original
            return x_forwarded_for.split(',')[0].strip()
        return request.META.get('REMOTE_ADDR', '0.0.0.0')
