from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0084_rental_property_types_specs'),
    ]

    operations = [
        migrations.AddField(
            model_name='rentalcontract',
            name='rent_scheme',
            field=models.CharField(
                choices=[('fija', 'Renta fija'), ('variable', 'Renta variable')],
                db_index=True,
                default='fija',
                help_text='fija = monto mensual pactado; variable = según condiciones especiales.',
                max_length=12,
            ),
        ),
        migrations.AddField(
            model_name='rentalcontract',
            name='rent_conditions',
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
