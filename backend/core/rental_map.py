"""Mapa del dashboard de Administrar Propiedades: ubicación e indicadores por propiedad."""
from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta

from django.db.models import Count
from django.utils import timezone
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import (
    RentalAsset, RentalContract, RentalMaintenanceWork, RentalProperty, RentalServiceRequest, Tenant,
)
from .rental_access import RentalAccess
from .rental_mode import LEASE_KINDS, leasing_enabled
from .rental_rentroll import build_rentroll

OPEN_WORK = ('planeado', 'en_curso')
OPEN_REQ = ('nueva', 'en_proceso')
ASSET_DOWN = ('en_falla', 'fuera_servicio')


def _coord(v):
    return float(v) if v is not None else None


def build_map(tenant):
    today = date.today()
    props = list(
        RentalProperty.objects.filter(tenant=tenant, is_active=True).exclude(status='inactiva').order_by('code')
    )
    ids = [p.id for p in props]

    # Rent Roll (solo propiedades en renta): ocupación, renta y morosidad por propiedad
    units = defaultdict(lambda: {'units': 0, 'occupied': 0, 'vacant': 0, 'rent': 0.0, 'overdue': 0.0, 'delinquent': 0})
    if leasing_enabled(tenant):
        for r in build_rentroll(tenant, today, False)['rows']:
            u = units[r['property_id']]
            u['units'] += 1
            if r['occupancy'] in ('ocupada', 'aviso', 'holdover'):
                u['occupied'] += 1
            else:
                u['vacant'] += 1
            u['rent'] += r['rent_monthly']
            u['overdue'] += r['overdue_amount']
            if r['overdue_amount'] > 0:
                u['delinquent'] += 1

    now = timezone.now()
    works = defaultdict(lambda: {'open': 0, 'late': 0})
    for w in RentalMaintenanceWork.objects.filter(tenant=tenant, status__in=OPEN_WORK, property_id__in=ids) \
            .values('property_id', 'scheduled_date', 'due_at'):
        d = works[str(w['property_id'])]
        d['open'] += 1
        if (w['scheduled_date'] and w['scheduled_date'] < today) or (w['due_at'] and w['due_at'] < now):
            d['late'] += 1
    reqs = {
        str(r['property_id']): r['n'] for r in
        RentalServiceRequest.objects.filter(tenant=tenant, status__in=OPEN_REQ, property_id__in=ids)
        .values('property_id').annotate(n=Count('id'))
    }
    assets = {
        str(r['property_id']): r['n'] for r in
        RentalAsset.objects.filter(tenant=tenant, status__in=ASSET_DOWN, property_id__in=ids)
        .values('property_id').annotate(n=Count('id'))
    }
    soon = today + timedelta(days=60)
    expiring = {
        str(r['property_id']): r['n'] for r in
        RentalContract.objects.filter(
            tenant=tenant, kind__in=LEASE_KINDS, status__in=('activo', 'por_vencer'),
            end_date__gte=today, end_date__lte=soon, property_id__in=ids,
        ).values('property_id').annotate(n=Count('id'))
    }

    points = []
    for p in props:
        pid = str(p.id)
        u = units.get(pid)
        w = works.get(pid, {'open': 0, 'late': 0})
        item = {
            'id': pid,
            'code': p.code,
            'name': p.name,
            'property_type': p.property_type,
            'type_label': p.get_property_type_display(),
            'type_group': p.type_group,
            'usage': p.usage,
            'status': p.status,
            'tenancy_model': p.tenancy_model,
            'address': p.address_line,
            'country': p.country,
            'country_code': p.country_code,
            'state': p.state,
            'postal_code': p.postal_code,
            'municipality': p.municipality,
            'city': p.city,
            'neighborhood': p.neighborhood,
            'street': p.street,
            'ext_number': p.ext_number,
            'latitude': _coord(p.latitude),
            'longitude': _coord(p.longitude),
            'leasable': bool(u),
            'units': u['units'] if u else 0,
            'occupied': u['occupied'] if u else 0,
            'vacant': u['vacant'] if u else 0,
            'occupancy_pct': round(u['occupied'] / u['units'] * 100) if u and u['units'] else None,
            'rent_monthly': round(u['rent'], 2) if u else 0,
            'overdue_amount': round(u['overdue'], 2) if u else 0,
            'delinquent': u['delinquent'] if u else 0,
            'expiring_60': expiring.get(pid, 0),
            'open_orders': w['open'],
            'late_orders': w['late'],
            'open_requests': reqs.get(pid, 0),
            'assets_down': assets.get(pid, 0),
        }
        # Semáforo del marcador: rojo = requiere atención, ámbar = por vigilar, verde = bien
        if item['overdue_amount'] > 0 or item['late_orders'] > 0 or item['assets_down'] > 0:
            item['health'] = 'critico'
        elif item['expiring_60'] or item['open_requests'] or item['vacant']:
            item['health'] = 'atencion'
        else:
            item['health'] = 'ok'
        points.append(item)

    located = sum(1 for p in points if p['latitude'] is not None and p['longitude'] is not None)
    return {
        'currency': tenant.currency,
        'leasing_enabled': leasing_enabled(tenant),
        'total': len(points),
        'located': located,
        'unlocated': len(points) - located,
        'points': points,
    }


class RentalMapView(APIView):
    permission_classes = [RentalAccess('rentas_propiedades', 'rentas_dashboard')]

    def get(self, request, tenant_id):
        tenant = Tenant.objects.get(id=tenant_id)
        if getattr(tenant, 'workspace_type', 'condominio') != 'rentas':
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'detail': 'Este módulo solo aplica a Administrar Propiedades.'})
        return Response(build_map(tenant))
