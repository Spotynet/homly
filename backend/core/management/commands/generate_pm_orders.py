from django.core.management.base import BaseCommand

from core.models import Tenant
from core.rental_ops import generate_due_plans


class Command(BaseCommand):
    help = 'Genera las órdenes de trabajo de los planes preventivos vencidos (Administrar Propiedades).'

    def handle(self, *args, **options):
        total = 0
        for tenant in Tenant.objects.filter(workspace_type='rentas', is_active=True):
            created = generate_due_plans(tenant)
            total += len(created)
            if created:
                self.stdout.write(f'{tenant.name}: {len(created)} orden(es) preventiva(s).')
        self.stdout.write(self.style.SUCCESS(f'Órdenes preventivas generadas: {total}.'))
