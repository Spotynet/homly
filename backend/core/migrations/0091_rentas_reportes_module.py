# Agrega el módulo rentas_reportes a los planes de Administrar Propiedades que ya limitan módulos.
from django.db import migrations


def add_module(apps, schema_editor):
    SubscriptionPlan = apps.get_model('core', 'SubscriptionPlan')
    for plan in SubscriptionPlan.objects.filter(workspace_type='rentas'):
        mods = list(plan.allowed_modules or [])
        if mods and 'rentas_reportes' not in mods:
            mods.append('rentas_reportes')
            plan.allowed_modules = mods
            plan.save(update_fields=['allowed_modules'])


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0090_rental_inspection_evidence'),
    ]

    operations = [
        migrations.RunPython(add_module, migrations.RunPython.noop),
    ]
