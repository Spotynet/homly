from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0083_rental_contract_kinds_legal'),
    ]

    operations = [
        migrations.AlterField(
            model_name='rentalproperty',
            name='property_type',
            field=models.CharField(
                choices=[
                    ('casa', 'Casa'),
                    ('departamento', 'Departamento'),
                    ('studio', 'Studio / loft'),
                    ('cuarto', 'Habitación / cuarto'),
                    ('airbnb', 'Airbnb / corta estancia'),
                    ('local', 'Local comercial'),
                    ('oficina', 'Oficina'),
                    ('consultorio', 'Consultorio'),
                    ('kiosco', 'Kiosco / isla'),
                    ('bodega', 'Bodega'),
                    ('nave', 'Nave industrial'),
                    ('patio', 'Patio / yard'),
                    ('terreno', 'Terreno'),
                    ('estacionamiento', 'Estacionamiento'),
                    ('salon', 'Salón / espacio de eventos'),
                    ('otro', 'Otro'),
                ],
                db_index=True,
                default='departamento',
                max_length=24,
            ),
        ),
        migrations.AddField(
            model_name='rentalproperty',
            name='specs',
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
