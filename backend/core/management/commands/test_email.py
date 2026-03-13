"""
Test email sending. Run: python manage.py test_email your@email.com
Shows the exact SMTP error if it fails.
"""
from django.core.management.base import BaseCommand
from django.core.mail import send_mail
from django.conf import settings


class Command(BaseCommand):
    help = 'Test SMTP: python manage.py test_email your@email.com'

    def add_arguments(self, parser):
        parser.add_argument('email', nargs='?', default='test@example.com', help='Recipient email')

    def handle(self, *args, **options):
        email = options['email']
        self.stdout.write(f'Testing SMTP to {email}...')
        self.stdout.write(f'  EMAIL_HOST_USER: {settings.EMAIL_HOST_USER}')
        self.stdout.write(f'  EMAIL_BACKEND: {settings.EMAIL_BACKEND}')
        try:
            send_mail(
                subject='Test Homly',
                message='If you receive this, SMTP works.',
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[email],
                fail_silently=False,
            )
            self.stdout.write(self.style.SUCCESS('OK: Email sent'))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'ERROR: {type(e).__name__}: {e}'))
            raise
