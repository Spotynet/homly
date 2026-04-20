"""
Migration 0039: Add is_active field to Tenant model.

This field controls whether a tenant's users can access the system.
It is managed automatically by TenantSubscription.sync_tenant_active():
  - trial / active / past_due → is_active = True
  - cancelled / expired       → is_active = False

Default is True so all existing tenants remain accessible after migration.
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0038_subscription_payments_and_modules'),
    ]

    operations = [
        migrations.AddField(
            model_name='tenant',
            name='is_active',
            field=models.BooleanField(
                db_index=True,
                default=True,
                help_text='Si es False el acceso al condominio está bloqueado para sus usuarios.',
            ),
        ),
    ]
