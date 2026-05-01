"""
Homly — Django Settings
PostgreSQL optimized for exponential growth
"""
import os
from pathlib import Path
from datetime import timedelta

try:
    from decouple import config
except ImportError:
    # Fallback if python-decouple not installed yet
    def config(key, default=None, cast=None):
        val = os.environ.get(key, default)
        if cast and val is not None:
            return cast(val)
        return val

BASE_DIR = Path(__file__).resolve().parent.parent

# ─── Security ───────────────────────────────────────────
SECRET_KEY = config('SECRET_KEY', default='dev-secret-change-in-production-!@#$%')
DEBUG = config('DEBUG', default=True, cast=bool)
ALLOWED_HOSTS = config('ALLOWED_HOSTS', default='localhost,127.0.0.1').split(',')

# ─── Guardia de producción (riesgo ALTO corregido) ──────
# Evita arrancar el servidor si la configuración es insegura para producción.
_INSECURE_KEYS = {
    'dev-secret-change-in-production-!@#$%',
    'CAMBIA-ESTO-POR-UNA-CLAVE-ALEATORIA-DE-50-CARACTERES',
    'JJDKSAJDKWFJ525353',  # clave original comprometida — nunca reutilizar
}
if not DEBUG:
    # En producción: SECRET_KEY debe ser robusta (mínimo 50 caracteres y no default)
    if SECRET_KEY in _INSECURE_KEYS or len(SECRET_KEY) < 50:
        raise Exception(
            '[HOMLY SECURITY] No se puede iniciar en producción: SECRET_KEY es insegura o '
            'es el valor por defecto. Genera una clave de 50+ caracteres y configúrala '
            'como variable de entorno del sistema (NO en el archivo .env).\n'
            'Comando: python3 -c "import secrets,string; '
            'print(\'\'.join(secrets.choice(string.ascii_letters+string.digits+\'!@#$%^&*(-_=+)\') '
            'for _ in range(64)))"'
        )
    # En producción: ALLOWED_HOSTS no debe incluir * ni ser el valor local
    if '*' in ALLOWED_HOSTS:
        raise Exception(
            '[HOMLY SECURITY] ALLOWED_HOSTS no puede contener "*" en producción. '
            'Configura el dominio real, ej: homly.com.mx,www.homly.com.mx'
        )
    if set(ALLOWED_HOSTS) <= {'localhost', '127.0.0.1', ''}:
        import warnings
        warnings.warn(
            '[HOMLY SECURITY] ALLOWED_HOSTS solo contiene localhost. '
            'En producción configura el dominio real.',
            stacklevel=2,
        )

# ─── Applications ───────────────────────────────────────
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    # Third-party
    'rest_framework',
    'rest_framework_simplejwt',
    'corsheaders',
    'django_filters',
    # Local
    'core',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    # Rate limiting en endpoints de auth (riesgo ALTO corregido)
    # Debe ir antes de SessionMiddleware y CommonMiddleware para bloquear antes de procesar
    'core.middleware.AuthRateLimitMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'homly_project.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'homly_project.wsgi.application'

# ─── Database — PostgreSQL ──────────────────────────────
# PostgreSQL: Best choice for exponential growth
# - ACID compliant with MVCC for high concurrency
# - JSONB for flexible schema fields (fieldPayments, etc.)
# - Partial indexes, GIN indexes for fast lookups
# - Table partitioning for large payment tables
# - Connection pooling with pgBouncer at scale
# - Horizontal scaling with Citus extension
# - Built-in full-text search

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': config('DB_NAME', default='homly_db'),
        'USER': config('DB_USER', default='homly_user'),
        'PASSWORD': config('DB_PASSWORD', default='homly_pass'),
        'HOST': config('DB_HOST', default='localhost'),
        'PORT': config('DB_PORT', default='5432'),
        'OPTIONS': {
            'connect_timeout': 5,
        },
        # Connection pooling settings
        'CONN_MAX_AGE': 600,  # Keep connections alive 10 min
        'CONN_HEALTH_CHECKS': True,
    }
}

# ─── Auth ───────────────────────────────────────────────
AUTH_USER_MODEL = 'core.User'

AUTH_PASSWORD_VALIDATORS = [
    # Longitud mínima: 10 caracteres (antes era 6 — riesgo ALTO corregido)
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
        'OPTIONS': {'min_length': 10},
    },
    # No puede ser demasiado similar al nombre o email del usuario
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
        'OPTIONS': {'user_attributes': ('email', 'name'), 'max_similarity': 0.6},
    },
    # No puede ser una contraseña de la lista de las más comunes (ej. "password123")
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    # No puede ser enteramente numérica (ej. "1234567890")
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]

# ─── REST Framework ─────────────────────────────────────
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
    'DEFAULT_FILTER_BACKENDS': (
        'django_filters.rest_framework.DjangoFilterBackend',
        'rest_framework.filters.SearchFilter',
        'rest_framework.filters.OrderingFilter',
    ),
    'DEFAULT_PAGINATION_CLASS': 'core.pagination.FlexiblePageNumberPagination',
    'PAGE_SIZE': 25,
    'DEFAULT_RENDERER_CLASSES': (
        'rest_framework.renderers.JSONRenderer',
    ),
}

# ─── JWT ────────────────────────────────────────────────
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(hours=8),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'AUTH_HEADER_TYPES': ('Bearer',),
}

# ─── CORS ───────────────────────────────────────────────
CORS_ALLOWED_ORIGINS = config(
    'CORS_ORIGINS',
    default='http://localhost:3000,http://127.0.0.1:3000'
).split(',')
CORS_ALLOW_CREDENTIALS = True

# ─── CSRF ───────────────────────────────────────────────
CSRF_TRUSTED_ORIGINS = config(
    'CSRF_TRUSTED_ORIGINS',
    default='http://localhost:3000,http://127.0.0.1:3000'
).split(',')

# ─── HTTPS security (only when DEBUG=False, behind Nginx) ─
if not DEBUG:
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_CONTENT_TYPE_NOSNIFF = True
    SECURE_BROWSER_XSS_FILTER = True
    X_FRAME_OPTIONS = 'DENY'
    SECURE_HSTS_SECONDS = 31_536_000   # B-02: 1 año (era 3600 — 1 hora)
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True         # Habilita pre-carga en navegadores

# ─── Static / Media ────────────────────────────────────
STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
STATICFILES_STORAGE = 'whitenoise.storage.CompressedManifestStaticFilesStorage'

# MEDIA — archivos subidos por usuarios (FileField / ImageField)
# En producción reemplazar con almacenamiento externo (S3, DigitalOcean Spaces, etc.)
# Para S3: pip install django-storages boto3
#   DEFAULT_FILE_STORAGE = 'storages.backends.s3boto3.S3Boto3Storage'
#   AWS_STORAGE_BUCKET_NAME = config('AWS_STORAGE_BUCKET_NAME', default='homly-media')
#   AWS_S3_REGION_NAME = config('AWS_S3_REGION_NAME', default='us-east-1')
#   AWS_ACCESS_KEY_ID = config('AWS_ACCESS_KEY_ID', default='')
#   AWS_SECRET_ACCESS_KEY = config('AWS_SECRET_ACCESS_KEY', default='')
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

# Asegurar que el directorio de media exista
import os
os.makedirs(BASE_DIR / 'media', exist_ok=True)

# ─── Internationalization ──────────────────────────────
LANGUAGE_CODE = 'es-mx'
TIME_ZONE = 'America/Mexico_City'
USE_I18N = True
USE_TZ = True

# ─── Cache (usado por AuthRateLimitMiddleware) ──────────
# M-08: Usa Redis si REDIS_URL está definida en .env (producción).
# Redis comparte estado entre todos los workers Gunicorn → rate limiting efectivo.
# En desarrollo sin REDIS_URL cae a LocMemCache (aceptable para 1 solo proceso).
# Instalar: pip install django-redis
_REDIS_URL = config('REDIS_URL', default='')
if _REDIS_URL:
    CACHES = {
        'default': {
            'BACKEND': 'django.core.cache.backends.redis.RedisCache',
            'LOCATION': _REDIS_URL,
        }
    }
else:
    CACHES = {
        'default': {
            'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
            'LOCATION': 'homly-rate-limit',
            # ADVERTENCIA: LocMemCache no se comparte entre workers Gunicorn.
            # Definir REDIS_URL en .env de producción para rate limiting efectivo.
        }
    }

# ─── Defaults ──────────────────────────────────────────
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# ─── Email ──────────────────────────────────────────────
# Auto-selects SMTP or console backend based on whether credentials are set:
#   - If EMAIL_HOST_USER is configured in .env → SMTP (real sending), even in DEBUG mode
#   - If EMAIL_HOST_USER is empty and DEBUG=True → console (prints to terminal)
#   - If EMAIL_HOST_USER is empty and DEBUG=False → SMTP (will fail without credentials — set them!)
# You can always override with EMAIL_BACKEND explicitly in .env.
#
# Provider quick reference:
#   Gmail         → smtp.gmail.com          port 587  TLS=True  (use an App Password)
#   Outlook/M365  → smtp.office365.com      port 587  TLS=True
#   Yahoo         → smtp.mail.yahoo.com     port 587  TLS=True
#   AOL           → smtp.aol.com            port 587  TLS=True
#   Port 465      → EMAIL_USE_SSL=True, EMAIL_USE_TLS=False
#   Brevo / SendGrid / Mailgun → set EMAIL_HOST accordingly
#
# IMPORTANT: DEFAULT_FROM_EMAIL must match EMAIL_HOST_USER to pass SPF/DKIM.
EMAIL_HOST_USER     = config('EMAIL_HOST_USER',     default='')
EMAIL_HOST_PASSWORD = config('EMAIL_HOST_PASSWORD', default='')
EMAIL_HOST          = config('EMAIL_HOST',          default='smtp.gmail.com')
EMAIL_PORT          = config('EMAIL_PORT',          default=587, cast=int)
EMAIL_USE_TLS       = config('EMAIL_USE_TLS',       default=True,  cast=bool)
# Set EMAIL_USE_SSL=True (and EMAIL_PORT=465) for providers that use implicit SSL
EMAIL_USE_SSL       = config('EMAIL_USE_SSL',       default=False, cast=bool)
DEFAULT_FROM_EMAIL  = config('DEFAULT_FROM_EMAIL',  default='noreply@homly.com.mx')

# Auto-detect backend: SMTP when credentials are present, console fallback in dev
_has_smtp_creds = bool(EMAIL_HOST_USER)
_default_backend = (
    'django.core.mail.backends.smtp.EmailBackend'
    if (_has_smtp_creds or not DEBUG)
    else 'django.core.mail.backends.console.EmailBackend'
)
EMAIL_BACKEND = config('EMAIL_BACKEND', default=_default_backend)
# Timeout in seconds for the SMTP connection (avoids hanging on slow mail servers)
EMAIL_TIMEOUT       = config('EMAIL_TIMEOUT',       default=10, cast=int)
# No-reply address used in the From header of all outgoing Homly emails.
# Must match DEFAULT_FROM_EMAIL (and thus EMAIL_HOST_USER) or set an explicit alias.
HOMLY_NOREPLY_EMAIL = config('HOMLY_NOREPLY_EMAIL', default=DEFAULT_FROM_EMAIL)
HOMLY_APP_URL       = config('HOMLY_APP_URL',       default='https://homly.com.mx/login')

# ─── Logging ───────────────────────────────────────────
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '{levelname} {asctime} {module} {message}',
            'style': '{',
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'verbose',
        },
        'file': {
            'class': 'logging.handlers.RotatingFileHandler',
            'filename': BASE_DIR / 'logs' / 'homly.log',
            'maxBytes': 10 * 1024 * 1024,
            'backupCount': 5,
            'formatter': 'verbose',
        },
    },
    'root': {
        'handlers': ['console', 'file'],
        'level': 'INFO',
    },
}
