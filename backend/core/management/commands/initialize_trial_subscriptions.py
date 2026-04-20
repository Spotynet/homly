"""
Management command: initialize_trial_subscriptions

Creates a 'trial' TenantSubscription (30-day trial) for every Tenant
that does NOT already have a subscription, then syncs tenant.is_active.

Usage:
    python manage.py initialize_trial_subscriptions
    python manage.py initialize_trial_subscriptions --days 60
    python manage.py initialize_trial_subscriptions --dry-run
"""
import datetime
from django.core.management.base import BaseCommand
from django.utils import timezone
from core.models import Tenant, TenantSubscription


class Command(BaseCommand):
    help = 'Create trial subscriptions for all tenants that do not have one.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--days',
            type=int,
            default=30,
            help='Number of trial days (default: 30)',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be done without making changes',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        trial_days = options['days']
        today = timezone.now().date()
        trial_end = today + datetime.timedelta(days=trial_days)

        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN — no changes will be saved.\n'))

        tenants = Tenant.objects.all().order_by('name')
        created = 0
        already = 0

        for tenant in tenants:
            try:
                # OneToOneField: accessing .subscription raises DoesNotExist if missing
                sub = tenant.subscription
                already += 1
                self.stdout.write(
                    f'  SKIP  {tenant.name!r:40s} → ya tiene suscripción [{sub.status}]'
                )
            except Exception:
                created += 1
                self.stdout.write(
                    f'  CREATE {tenant.name!r:40s} → trial {today} → {trial_end}'
                )
                if not dry_run:
                    sub = TenantSubscription.objects.create(
                        tenant=tenant,
                        status='trial',
                        trial_start=today,
                        trial_end=trial_end,
                        amount_per_cycle=0,
                        currency=getattr(tenant, 'currency', 'MXN') or 'MXN',
                    )
                    sub.sync_tenant_active()

        self.stdout.write('')
        if dry_run:
            self.stdout.write(self.style.WARNING(
                f'DRY RUN — se crearían {created} suscripciones trial. '
                f'{already} ya tienen suscripción.'
            ))
        else:
            self.stdout.write(self.style.SUCCESS(
                f'Listo. Creadas: {created} suscripciones trial. '
                f'{already} ya tenían suscripción.'
            ))
