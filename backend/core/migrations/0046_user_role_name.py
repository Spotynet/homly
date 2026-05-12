"""
Migration 0046 — Add role_name field to User model.

role_name stores a human-readable display label for the user's role
(e.g. "Operador de Tenants", "Analista CRM").  It is separate from
system_role (which is the internal auth key) so that super-admins can
give custom names without changing the auth role choices.

Also adds is_system_user flag so the queryset can return both
is_super_admin=True users and regular staff with custom roles.
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0045_user_system_role'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='role_name',
            field=models.CharField(
                max_length=120,
                blank=True,
                default='',
                help_text='Display name for this user\'s role (e.g. "Operador de Tenants"). '
                          'Empty = falls back to system_role display or "Super Administrador".',
            ),
        ),
    ]
