from django.core.management.base import BaseCommand
from core.models import AirbnbListing
from core.airbnb_sync import sync_listing_ical


class Command(BaseCommand):
    help = 'Sincroniza calendarios iCal de anuncios Airbnb vinculados a Homly Rentas.'

    def handle(self, *args, **options):
        qs = AirbnbListing.objects.filter(sync_enabled=True).exclude(ical_url='')
        ok = fail = 0
        for listing in qs.select_related('connection', 'property', 'tenant'):
            result = sync_listing_ical(listing)
            if result.get('ok'):
                ok += 1
            else:
                fail += 1
                self.stderr.write(f'{listing.airbnb_listing_id}: {result.get("error")}')
        self.stdout.write(self.style.SUCCESS(f'Sincronizados: {ok}. Errores: {fail}.'))
