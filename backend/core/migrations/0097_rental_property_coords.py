from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0096_rental_property_geo'),
    ]

    operations = [
        migrations.AddField(
            model_name='rentalproperty', name='latitude',
            field=models.DecimalField(blank=True, decimal_places=6, help_text='Latitud (WGS84) para el mapa del dashboard.', max_digits=9, null=True),
        ),
        migrations.AddField(
            model_name='rentalproperty', name='longitude',
            field=models.DecimalField(blank=True, decimal_places=6, help_text='Longitud (WGS84) para el mapa del dashboard.', max_digits=9, null=True),
        ),
    ]
