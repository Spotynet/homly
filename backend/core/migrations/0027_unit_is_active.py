from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0026_custom_profiles'),
    ]

    operations = [
        migrations.AddField(
            model_name='unit',
            name='is_active',
            field=models.BooleanField(
                default=True,
                help_text='Unidad activa. Si es False queda de solo lectura y no acepta nuevos pagos.',
            ),
        ),
    ]
