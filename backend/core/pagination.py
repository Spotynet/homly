"""
Custom pagination that allows client to override page_size via query param.
Used for pages like Cobranza and Estado de Cuenta that need all units.
"""
from rest_framework.pagination import PageNumberPagination


class FlexiblePageNumberPagination(PageNumberPagination):
    """PageNumberPagination that accepts page_size from query params."""
    page_size = 25
    page_size_query_param = 'page_size'
    max_page_size = 10000  # Allow up to 10k items when client requests it
