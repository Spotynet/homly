"""Add newer condominio modules to existing subscription plans.

Plans with an empty allowed_modules list stay unrestricted. Plans that already
list modules receive mantenimientos and blog so the permissions tab can grant
them without an upgrade badge.
"""

from django.db import migrations


def add_new_condo_modules(apps, schema_editor):
    SubscriptionPlan = apps.get_model('core', 'SubscriptionPlan')
    extras = ('mantenimientos', 'blog')
    for plan in SubscriptionPlan.objects.filter(workspace_type='condominio'):
        mods = list(plan.allowed_modules or [])
        if not mods:
            continue
        changed = False
        for key in extras:
            if key not in mods:
                mods.append(key)
                changed = True
        if changed:
            plan.allowed_modules = mods
            plan.save(update_fields=['allowed_modules'])


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0070_condo_maintenance_module'),
    ]

    operations = [
        migrations.RunPython(add_new_condo_modules, migrations.RunPython.noop),
    ]
