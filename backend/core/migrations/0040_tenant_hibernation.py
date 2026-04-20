"""
Migration 0040: Add hibernated and hibernation_reason fields to Tenant.

hibernated=True means the tenant is in read-only preservation mode set by a
superadmin as an alternative to deletion. All data is kept; users cannot log in.
Only the superadmin can reactivate the tenant.
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0039_tenant_is_active'),
    ]

    operations = [
        migrations.AddField(
            model_name='tenant',
            name='hibernated',
            field=models.BooleanField(
                db_index=True,
                default=False,
                help_text='Modo hibernación: datos preservados en solo lectura.',
            ),
        ),
        migrations.AddField(
            model_name='tenant',
            name='hibernation_reason',
            field=models.TextField(
                blank=True,
                default='',
                help_text='Razón por la que el superadmin hibernó este condominio.',
            ),
        ),
    ]
