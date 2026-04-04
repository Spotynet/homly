from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0024_audit_log'),
    ]

    operations = [
        migrations.AddField(
            model_name='tenant',
            name='reservation_settings',
            field=models.JSONField(
                blank=True,
                default=dict,
                help_text='Reservation-module behaviour settings: approval_mode, etc.',
            ),
        ),
    ]
