from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0050_payment_voucher_submission'),
    ]

    operations = [
        migrations.AddField(
            model_name='paymentplan',
            name='plan_type',
            field=models.CharField(
                choices=[('installment', 'Plan de cuotas'), ('settlement', 'Liquidación con quita')],
                db_index=True,
                default='installment',
                help_text='installment = cuotas; settlement = liquidación completa con quita',
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name='paymentplan',
            name='discount_type',
            field=models.CharField(
                blank=True,
                choices=[('percent', 'Porcentaje'), ('amount', 'Monto fijo')],
                default='',
                help_text='Cómo se expresa el descuento autorizado (solo settlement)',
                max_length=10,
            ),
        ),
        migrations.AddField(
            model_name='paymentplan',
            name='discount_value',
            field=models.DecimalField(
                decimal_places=2,
                default=0,
                help_text='Valor del descuento: porcentaje (0-100) o monto, según discount_type',
                max_digits=14,
            ),
        ),
        migrations.AddField(
            model_name='paymentplan',
            name='discount_amount',
            field=models.DecimalField(
                decimal_places=2,
                default=0,
                help_text='Quita autorizada en moneda (adeudo original − importe a liquidar)',
                max_digits=14,
            ),
        ),
        migrations.AddField(
            model_name='paymentplan',
            name='settlement_amount',
            field=models.DecimalField(
                decimal_places=2,
                default=0,
                help_text='Importe que el residente debe pagar para liquidar (después de la quita)',
                max_digits=14,
            ),
        ),
        migrations.AddField(
            model_name='paymentplan',
            name='debt_cutoff_period',
            field=models.CharField(
                blank=True,
                default='',
                help_text='YYYY-MM: períodos con cargo hasta este corte quedan absorbidos por el plan',
                max_length=7,
            ),
        ),
    ]
