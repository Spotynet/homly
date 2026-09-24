import secrets

from django.db import migrations, models
import core.models


def backfill_qr_tokens(apps, schema_editor):
    CondoPackage = apps.get_model('core', 'CondoPackage')
    seen = set(CondoPackage.objects.exclude(qr_token='').values_list('qr_token', flat=True))
    for pkg in CondoPackage.objects.filter(models.Q(qr_token='') | models.Q(qr_token__isnull=True)):
        token = secrets.token_urlsafe(16)
        while token in seen:
            token = secrets.token_urlsafe(16)
        pkg.qr_token = token
        pkg.save(update_fields=['qr_token'])
        seen.add(token)


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0077_condo_packages_module'),
    ]

    operations = [
        migrations.AddField(
            model_name='tenant',
            name='package_reminder_enabled',
            field=models.BooleanField(default=False, help_text='Si está activo, Homly recuerda paquetes que siguen en vigilancia.'),
        ),
        migrations.AddField(
            model_name='tenant',
            name='package_reminder_after_hours',
            field=models.PositiveIntegerField(default=24, help_text='Horas desde la recepción para el primer recordatorio.'),
        ),
        migrations.AddField(
            model_name='tenant',
            name='package_reminder_repeat_hours',
            field=models.PositiveIntegerField(default=24, help_text='Horas entre recordatorios. 0 = no repetir.'),
        ),
        migrations.AddField(
            model_name='tenant',
            name='package_reminder_max',
            field=models.PositiveIntegerField(default=3, help_text='Máximo de recordatorios automáticos por paquete.'),
        ),
        migrations.AddField(
            model_name='condopackage',
            name='qr_token',
            field=models.CharField(
                blank=True,
                default='',
                max_length=64,
                help_text='Token opaco del QR de identificación/entrega.',
            ),
        ),
        migrations.AddField(
            model_name='condopackage',
            name='delivery_method',
            field=models.CharField(blank=True, default='', help_text='qr | firma', max_length=12),
        ),
        migrations.AddField(
            model_name='condopackage',
            name='notify_recipients',
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name='condopackage',
            name='reminder_count',
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name='condopackage',
            name='last_reminded_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.RunPython(backfill_qr_tokens, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='condopackage',
            name='qr_token',
            field=models.CharField(
                db_index=True,
                default=core.models.default_package_qr_token,
                help_text='Token opaco del QR de identificación/entrega.',
                max_length=64,
                unique=True,
            ),
        ),
        migrations.AlterField(
            model_name='condopackageevent',
            name='event_type',
            field=models.CharField(
                choices=[
                    ('recibido', 'Recepción en vigilancia'),
                    ('notificado', 'Notificación enviada'),
                    ('recordatorio', 'Recordatorio automático'),
                    ('entregado', 'Entrega al destinatario'),
                    ('nota', 'Nota'),
                ],
                db_index=True,
                max_length=16,
            ),
        ),
    ]
