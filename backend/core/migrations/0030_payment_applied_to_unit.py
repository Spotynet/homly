from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0029_amenityreservation_reviewer_notes'),
    ]

    operations = [
        migrations.AddField(
            model_name='payment',
            name='applied_to_unit',
            field=models.ForeignKey(
                blank=True,
                help_text='Unidad a la que aplica este pago cuando difiere de la unidad de registro',
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='applied_payments',
                to='core.unit',
            ),
        ),
    ]
