from django.core.management.base import BaseCommand

from core.paqueteria import run_package_reminders


class Command(BaseCommand):
    help = 'Envía recordatorios de paquetes que siguen en vigilancia.'

    def handle(self, *args, **options):
        sent = run_package_reminders()
        self.stdout.write(self.style.SUCCESS(f'Recordatorios enviados: {sent}.'))
