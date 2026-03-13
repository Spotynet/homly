import os
# Fix SSL cert verification on macOS
try:
    import certifi
    os.environ.setdefault('SSL_CERT_FILE', certifi.where())
    os.environ.setdefault('REQUESTS_CA_BUNDLE', certifi.where())
except ImportError:
    pass
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'homly_project.settings')
from django.core.wsgi import get_wsgi_application
application = get_wsgi_application()
