from django.db import migrations


def add_guias_module(apps, schema_editor):
    SubscriptionPlan = apps.get_model('core', 'SubscriptionPlan')
    for plan in SubscriptionPlan.objects.filter(workspace_type='rentas'):
        mods = list(plan.allowed_modules or [])
        if mods and 'rentas_guias' not in mods:
            mods.append('rentas_guias')
            plan.allowed_modules = mods
            plan.save(update_fields=['allowed_modules'])


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0086_rental_cafm_cmms'),
    ]

    operations = [
        migrations.RunPython(add_guias_module, migrations.RunPython.noop),
    ]
