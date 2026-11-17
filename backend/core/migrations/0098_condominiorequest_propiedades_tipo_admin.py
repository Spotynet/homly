from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0097_rental_property_coords'),
    ]

    operations = [
        migrations.AddField(
            model_name='condominiorequest',
            name='propiedades_tipo_admin',
            field=models.CharField(
                blank=True, default='', max_length=20,
                choices=[
                    ('propietario', 'Propietario'),
                    ('inmobiliaria', 'Inmobiliaria o administrador'),
                    ('operador', 'Equipo de operación y mantenimiento'),
                    ('corporativo', 'Fondo, desarrolladora o corporativo'),
                ],
                help_text='Solo si el interesado pidió Administrar Propiedades.',
            ),
        ),
    ]
