from django.db import migrations, models


def default_mexico(apps, schema_editor):
    """Las propiedades existentes se capturaron en México: se les asigna ese país."""
    Prop = apps.get_model('core', 'RentalProperty')
    Prop.objects.filter(country_code='').update(country_code='MX', country='México')


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0095_rental_spaces_finance'),
    ]

    operations = [
        migrations.AddField(
            model_name='rentalproperty', name='country',
            field=models.CharField(blank=True, default='', help_text='País (nombre).', max_length=100),
        ),
        migrations.AddField(
            model_name='rentalproperty', name='country_code',
            field=models.CharField(blank=True, db_index=True, default='', help_text='País (ISO 3166-1 alfa-2).', max_length=2),
        ),
        migrations.AddField(
            model_name='rentalproperty', name='municipality',
            field=models.CharField(blank=True, default='', help_text='Delegación / alcaldía / municipio / condado.', max_length=200),
        ),
        migrations.AlterField(
            model_name='rentalproperty', name='neighborhood',
            field=models.CharField(blank=True, default='', help_text='Colonia / barrio / localidad.', max_length=200),
        ),
        migrations.RunPython(default_mexico, migrations.RunPython.noop),
    ]
