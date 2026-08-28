from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0051_paymentplan_settlement_quita'),
    ]

    operations = [
        migrations.AddField(
            model_name='closedperiod',
            name='snapshot',
            field=models.JSONField(
                blank=True,
                default=dict,
                help_text='Cifras congeladas del dashboard y reporte general al momento del cierre.',
            ),
        ),
        migrations.AddField(
            model_name='closedperiod',
            name='snapshot_at',
            field=models.DateTimeField(
                blank=True,
                help_text='Cuándo se generó o actualizó el snapshot de cifras.',
                null=True,
            ),
        ),
    ]
