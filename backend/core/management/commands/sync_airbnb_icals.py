from collections import defaultdict

from django.core.management.base import BaseCommand

from core.airbnb_sync import sync_listing_ical
from core.models import AirbnbListing
from core.rental_notifications import on_airbnb_sync_results


class Command(BaseCommand):
    help = 'Sincroniza calendarios iCal de anuncios Airbnb vinculados a Homly Rentas.'

    def handle(self, *args, **options):
        qs = AirbnbListing.objects.filter(sync_enabled=True).exclude(ical_url='')
        ok = fail = 0
        by_tenant = defaultdict(list)
        for listing in qs.select_related('connection', 'property', 'tenant'):
            result = sync_listing_ical(listing)
            by_tenant[listing.tenant].append({'id': str(listing.id), **result})
            if result.get('ok'):
                ok += 1
            else:
                fail += 1
                self.stderr.write(f'{listing.airbnb_listing_id}: {result.get("error")}')
        for tenant, results in by_tenant.items():
            on_airbnb_sync_results(tenant, results, label='sincronización automática')
        self.stdout.write(self.style.SUCCESS(f'Sincronizados: {ok}. Errores: {fail}.'))
