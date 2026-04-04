from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0025_tenant_reservation_settings'),
    ]

    operations = [
        migrations.AddField(
            model_name='tenant',
            name='custom_profiles',
            field=models.JSONField(
                blank=True,
                default=list,
                help_text='Custom role profiles with per-module access configuration.',
            ),
        ),
        migrations.AddField(
            model_name='tenantuser',
            name='profile_id',
            field=models.CharField(
                blank=True,
                default='',
                max_length=100,
            ),
        ),
    ]
