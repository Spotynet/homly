from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0041_filefield_migration'),
    ]

    operations = [
        migrations.AddField(
            model_name='tenantsubscription',
            name='subscription_history',
            field=models.JSONField(
                blank=True,
                default=list,
                help_text='Historial de periodos anteriores de suscripción (snapshots al desactivar).',
            ),
        ),
    ]
