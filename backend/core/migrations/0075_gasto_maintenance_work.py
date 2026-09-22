from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0074_maintenance_evidence_durante'),
    ]

    operations = [
        migrations.AddField(
            model_name='gastoentry',
            name='maintenance_work',
            field=models.ForeignKey(
                blank=True,
                help_text='Trabajo de mantenimiento asociado a este gasto.',
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='gasto_entries',
                to='core.condomaintenancework',
            ),
        ),
    ]
