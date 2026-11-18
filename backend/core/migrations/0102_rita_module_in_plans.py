# Agrega 'rita' a allowed_modules de planes condominio que ya tienen cobranza/gastos.
from django.db import migrations


def add_rita(apps, schema_editor):
    SubscriptionPlan = apps.get_model('core', 'SubscriptionPlan')
    for plan in SubscriptionPlan.objects.all():
        mods = list(plan.allowed_modules or [])
        if not mods:
            continue
        # Solo planes condominio (tienen cobranza/gastos clásicos)
        if 'rita' in mods:
            continue
        if 'cobranza' in mods or 'gastos' in mods:
            plan.allowed_modules = [*mods, 'rita']
            plan.save(update_fields=['allowed_modules'])


def remove_rita(apps, schema_editor):
    SubscriptionPlan = apps.get_model('core', 'SubscriptionPlan')
    for plan in SubscriptionPlan.objects.all():
        mods = list(plan.allowed_modules or [])
        if 'rita' in mods:
            plan.allowed_modules = [m for m in mods if m != 'rita']
            plan.save(update_fields=['allowed_modules'])


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0101_ritabanksession_bank_statement'),
    ]

    operations = [
        migrations.RunPython(add_rita, remove_rita),
    ]
