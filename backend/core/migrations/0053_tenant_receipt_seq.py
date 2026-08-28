from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0052_closedperiod_dashboard_snapshot'),
    ]

    operations = [
        migrations.AddField(
            model_name='tenant',
            name='receipt_seq',
            field=models.PositiveIntegerField(
                default=0,
                help_text='Último consecutivo de recibo principal asignado en este condominio.',
            ),
        ),
    ]
