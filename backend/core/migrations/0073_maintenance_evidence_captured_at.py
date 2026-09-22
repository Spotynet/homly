from django.db import migrations, models


def fill_captured_at(apps, schema_editor):
    Evidence = apps.get_model('core', 'CondoMaintenanceEvidence')
    for ev in Evidence.objects.all().iterator():
        if ev.captured_at:
            continue
        if ev.created_at:
            ev.captured_at = ev.created_at.date()
            ev.save(update_fields=['captured_at'])


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0072_condo_providers'),
    ]

    operations = [
        migrations.AddField(
            model_name='condomaintenanceevidence',
            name='captured_at',
            field=models.DateField(
                blank=True,
                help_text='Fecha en que se tomó o corresponde la evidencia (puede cargarse después).',
                null=True,
            ),
        ),
        migrations.AlterModelOptions(
            name='condomaintenanceevidence',
            options={'ordering': ['captured_at', 'created_at']},
        ),
        migrations.RunPython(fill_captured_at, migrations.RunPython.noop),
    ]
