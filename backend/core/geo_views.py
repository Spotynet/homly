"""Catálogos geográficos para formularios de dirección: países, estados/regiones y búsqueda por código postal."""
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from . import geo


class GeoCountriesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response([
            {'code': c['code'], 'name_en': c['name_en'], 'has_postal': c['has_postal'], 'postal_format': c['postal_format']}
            for c in geo.countries()
        ])


class GeoRegionsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(geo.regions(request.query_params.get('country', '')))


class GeoPostalView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        cc = (request.query_params.get('country') or '').strip().upper()
        code = (request.query_params.get('code') or '').strip()
        if len(cc) != 2 or not code or len(code) > 12:
            return Response({'found': False})
        res = geo.lookup_postal(cc, code)
        if not res:
            return Response({'found': False, 'has_postal_data': any(c['code'] == cc and c['has_postal'] for c in geo.countries())})
        return Response({'found': True, **res})
