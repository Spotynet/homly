"""Airbnb account + listing import for Homly Rentas."""
from datetime import date

from django.db.models import Count, Q
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .airbnb_sync import (
    is_allowed_ical_url, listing_url_from_id, next_code_for_listing,
    parse_listing_id, sync_listing_ical,
)
from .models import AirbnbConnection, AirbnbListing, RentalProperty, Tenant
from .permissions import IsAdminTesOrContador
from .rental_serializers import AirbnbConnectionSerializer, AirbnbListingSerializer
from .rental_views import _RentalTenantMixin, _require_rentas


class AirbnbConnectionViewSet(_RentalTenantMixin, viewsets.ModelViewSet):
    queryset = AirbnbConnection.objects.all()
    serializer_class = AirbnbConnectionSerializer
    permission_classes = [IsAdminTesOrContador]

    def get_queryset(self):
        return super().get_queryset().annotate(
            listings_count=Count('listings'),
            mapped_count=Count('listings', filter=Q(listings__property__isnull=False)),
        )

    @action(detail=True, methods=['post'], url_path='sync')
    def sync(self, request, tenant_id=None, pk=None):
        conn = self.get_object()
        results = []
        for listing in conn.listings.filter(sync_enabled=True):
            results.append({'id': str(listing.id), **sync_listing_ical(listing)})
        return Response({'connection': str(conn.id), 'results': results})

    @action(detail=True, methods=['post'], url_path='import-listings')
    def import_listings(self, request, tenant_id=None, pk=None):
        conn = self.get_object()
        tenant = conn.tenant
        items = request.data.get('listings') or []
        if not isinstance(items, list) or not items:
            return Response({'detail': 'Envía listings: [{ listing_url o listing_id, ical_url, name }]'}, status=400)
        created, updated, errors = [], [], []
        for raw in items:
            if not isinstance(raw, dict):
                errors.append({'error': 'Cada anuncio debe ser un objeto'})
                continue
            listing_id = parse_listing_id(raw.get('listing_id') or raw.get('listing_url') or '')
            if not listing_id:
                errors.append({'error': 'URL o ID de Airbnb inválido', 'input': raw.get('listing_url') or raw.get('listing_id')})
                continue
            ical_url = (raw.get('ical_url') or '').strip()
            if ical_url and not is_allowed_ical_url(ical_url):
                errors.append({'error': 'La URL iCal debe ser el export HTTPS de Airbnb', 'listing_id': listing_id})
                continue
            name = (raw.get('name') or raw.get('listing_name') or f'Airbnb {listing_id}').strip()[:300]
            listing_url = (raw.get('listing_url') or '').strip() or listing_url_from_id(listing_id)

            listing, was_created = AirbnbListing.objects.get_or_create(
                tenant=tenant, airbnb_listing_id=listing_id,
                defaults={
                    'connection': conn,
                    'listing_name': name,
                    'listing_url': listing_url,
                    'ical_url': ical_url,
                },
            )
            if not was_created:
                listing.connection = conn
                listing.listing_name = name or listing.listing_name
                listing.listing_url = listing_url or listing.listing_url
                if ical_url:
                    listing.ical_url = ical_url
                listing.save()

            prop = listing.property
            if not prop:
                prop = RentalProperty.objects.filter(
                    tenant=tenant, airbnb_listing_id=listing_id,
                ).first()
            if not prop:
                prop = RentalProperty.objects.create(
                    tenant=tenant,
                    code=next_code_for_listing(tenant, listing_id),
                    name=name,
                    property_type=(raw.get('property_type') or 'departamento'),
                    status='disponible',
                    city=(raw.get('city') or ''),
                    bedrooms=int(raw.get('bedrooms') or 0),
                    bathrooms=raw.get('bathrooms') or 0,
                    suggested_rent=raw.get('suggested_rent') or 0,
                    notes='Importado desde Airbnb (iCal / listing ID).',
                    source='airbnb',
                    airbnb_listing_id=listing_id,
                )
            else:
                prop.source = 'airbnb'
                prop.airbnb_listing_id = listing_id
                if name and prop.name.startswith('Airbnb '):
                    prop.name = name
                prop.save(update_fields=['source', 'airbnb_listing_id', 'name', 'updated_at'])

            listing.property = prop
            listing.save(update_fields=['property', 'updated_at'])

            sync_info = {}
            if listing.ical_url:
                sync_info = sync_listing_ical(listing)

            payload = AirbnbListingSerializer(listing).data
            payload['sync'] = sync_info
            (created if was_created else updated).append(payload)

        return Response({
            'created': created,
            'updated': updated,
            'errors': errors,
        })


class AirbnbListingViewSet(_RentalTenantMixin, viewsets.ModelViewSet):
    queryset = AirbnbListing.objects.select_related('connection', 'property')
    serializer_class = AirbnbListingSerializer
    permission_classes = [IsAdminTesOrContador]
    http_method_names = ['get', 'patch', 'delete', 'head', 'options']

    @action(detail=True, methods=['post'], url_path='sync')
    def sync(self, request, tenant_id=None, pk=None):
        listing = self.get_object()
        result = sync_listing_ical(listing)
        data = AirbnbListingSerializer(listing).data
        data['sync'] = result
        return Response(data)


def airbnb_calendar_rows(tenant, since: date, until: date):
    rows = []
    listings = AirbnbListing.objects.filter(tenant=tenant, sync_enabled=True).select_related('property')
    for listing in listings:
        for ev in listing.ical_events or []:
            start = ev.get('start') or ''
            end = ev.get('end') or start
            if end < str(since) or start > str(until):
                continue
            prop = listing.property
            rows.append({
                'id': f'ab-{listing.id}-{start}',
                'source': 'airbnb',
                'code': (prop.code if prop else listing.airbnb_listing_id),
                'property_code': prop.code if prop else '',
                'property_name': (prop.name if prop else listing.listing_name),
                'tenant_name': ev.get('summary') or 'Airbnb',
                'start_date': start,
                'end_date': end,
                'status': 'airbnb',
                'rent_amount': float(prop.suggested_rent) if prop else 0,
                'days_left': (date.fromisoformat(end) - date.today()).days if end else 0,
                'kind': 'airbnb',
                'listing_url': listing.listing_url,
            })
    return rows
