"""
Migration 0045: Add system_role, system_permissions, allowed_tenant_ids to User
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0044_crm_module'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='system_role',
            field=models.CharField(
                blank=True, db_index=True,
                choices=[
                    ('super_admin',      'Super Administrador'),
                    ('ventas',           'Revenue Growth Strategist'),
                    ('marketing',        'Content Strategist Lead'),
                    ('atencion_cliente', 'Customer Success Hero'),
                    ('soporte_tecnico',  'Systems Reliability Engineer'),
                ],
                help_text='Role within the Homly internal team. Null = not a system user.',
                max_length=20, null=True,
            ),
        ),
        migrations.AddField(
            model_name='user',
            name='system_permissions',
            field=models.JSONField(
                blank=True, default=dict,
                help_text='Module-level access flags for non-superadmin system users.',
            ),
        ),
        migrations.AddField(
            model_name='user',
            name='allowed_tenant_ids',
            field=models.JSONField(
                blank=True, default=list,
                help_text='UUIDs of tenants this system user may access. Empty = all.',
            ),
        ),
    ]
