from django.db import migrations, models


class Migration(migrations.Migration):
    """Add 'excento' to Payment.PAYMENT_TYPE_CHOICES for units exempt by committee decision."""

    dependencies = [
        ('core', '0011_unit_credit_balance'),
    ]

    operations = [
        migrations.AlterField(
            model_name='payment',
            name='payment_type',
            field=models.CharField(
                max_length=15,
                choices=[
                    ('transferencia', 'Transferencia'),
                    ('deposito', 'Depósito'),
                    ('efectivo', 'Efectivo'),
                    ('excento', 'Exento'),
                ],
                blank=True,
                default='',
            ),
        ),
    ]
