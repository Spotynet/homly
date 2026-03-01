from django.db import migrations, models


class Migration(migrations.Migration):
    """Add 'adelanto' field_type to ExtraField.
    Adelanto fields: optional payments that contribute to the balance as credit (saldo a favor).
    Other optional (normal) fields are neutral in balance calculations."""

    dependencies = [
        ('core', '0012_payment_type_excento'),
    ]

    operations = [
        migrations.AlterField(
            model_name='extrafield',
            name='field_type',
            field=models.CharField(
                max_length=10,
                choices=[
                    ('normal', 'Normal'),
                    ('gastos', 'Gastos'),
                    ('adelanto', 'Adelanto'),
                ],
                default='normal',
            ),
        ),
    ]
