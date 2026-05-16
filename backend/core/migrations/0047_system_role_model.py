"""
Migration 0047 — Add SystemRole model.

SystemRole is a reusable role template for Homly internal staff users.
It stores a name, description, is_super_admin flag and a permissions
JSONField ({ modules: [], module_tabs: {} }).

When a system user is created or updated, the assigned role's permissions
are copied (denormalised) onto the user's own fields for fast access.
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0046_user_role_name'),
    ]

    operations = [
        migrations.CreateModel(
            name='SystemRole',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=120, unique=True,
                    help_text='Display name for the role (e.g. "Operador de Tenants")')),
                ('description', models.CharField(max_length=255, blank=True, default='',
                    help_text='Short description of what this role can do')),
                ('is_super_admin', models.BooleanField(default=False,
                    help_text='Grants full system access to users assigned this role')),
                ('permissions', models.JSONField(default=dict, blank=True,
                    help_text='{ modules: [str], module_tabs: {modId: [tabId]} }')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'db_table': 'system_roles',
                'ordering': ['name'],
            },
        ),
    ]
