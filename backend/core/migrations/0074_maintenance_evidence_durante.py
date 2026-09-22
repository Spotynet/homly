from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0073_maintenance_evidence_captured_at'),
    ]

    operations = [
        migrations.AlterField(
            model_name='condomaintenanceevidence',
            name='kind',
            field=models.CharField(
                choices=[
                    ('antes', 'Antes'),
                    ('durante', 'Durante'),
                    ('despues', 'Después'),
                    ('otro', 'Otro'),
                ],
                default='otro',
                max_length=12,
            ),
        ),
    ]
