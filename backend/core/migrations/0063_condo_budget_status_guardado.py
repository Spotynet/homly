from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0062_planeacion_budget_scenarios_approval'),
    ]

    operations = [
        migrations.AlterField(
            model_name='condobudget',
            name='status',
            field=models.CharField(
                choices=[
                    ('borrador', 'Borrador'),
                    ('guardado', 'Guardado'),
                    ('en_aprobacion', 'En aprobación'),
                    ('aprobado', 'Aprobado'),
                    ('archivado', 'Archivado'),
                ],
                db_index=True,
                default='borrador',
                max_length=16,
            ),
        ),
    ]
