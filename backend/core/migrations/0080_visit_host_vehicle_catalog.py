import uuid

from django.db import migrations, models
import django.db.models.deletion
import core.models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0079_condo_visits_module'),
    ]

    operations = [
        migrations.AddField(
            model_name='tenant',
            name='visit_use_parking',
            field=models.BooleanField(default=True, help_text='Si está activo, vigilancia asigna cajón de visitas al ingreso en vehículo.'),
        ),
        migrations.AddField(
            model_name='tenant',
            name='visit_use_badges',
            field=models.BooleanField(default=False, help_text='Si está activo, vigilancia asigna un gafete de visitas al ingreso.'),
        ),
        migrations.CreateModel(
            name='CondoVisitParkingSpot',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('code', models.CharField(max_length=40)),
                ('name', models.CharField(blank=True, default='', max_length=120)),
                ('notes', models.CharField(blank=True, default='', max_length=200)),
                ('is_active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('tenant', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='visit_parking_spots', to='core.tenant')),
            ],
            options={
                'db_table': 'condo_visit_parking_spots',
                'ordering': ['code'],
                'unique_together': {('tenant', 'code')},
            },
        ),
        migrations.CreateModel(
            name='CondoVisitBadge',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('code', models.CharField(max_length=40)),
                ('name', models.CharField(blank=True, default='', max_length=120)),
                ('notes', models.CharField(blank=True, default='', max_length=200)),
                ('is_active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('tenant', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='visit_badges', to='core.tenant')),
            ],
            options={
                'db_table': 'condo_visit_badges',
                'ordering': ['code'],
                'unique_together': {('tenant', 'code')},
            },
        ),
        migrations.AddField(
            model_name='condovisitauth',
            name='host_key',
            field=models.CharField(blank=True, default='', max_length=80),
        ),
        migrations.AddField(
            model_name='condovisitauth',
            name='host_kind_label',
            field=models.CharField(blank=True, default='', max_length=40),
        ),
        migrations.AddField(
            model_name='condovisitauth',
            name='host_name',
            field=models.CharField(blank=True, default='', max_length=200),
        ),
        migrations.AddField(
            model_name='condovisitauth',
            name='arrived_by_vehicle',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='condovisitauth',
            name='vehicle_plate',
            field=models.CharField(blank=True, default='', max_length=20),
        ),
        migrations.AddField(
            model_name='condovisitauth',
            name='vehicle_photo',
            field=models.ImageField(blank=True, null=True, upload_to=core.models.condo_visit_vehicle_path),
        ),
        migrations.AddField(
            model_name='condovisitauth',
            name='parking_label',
            field=models.CharField(blank=True, default='', max_length=120),
        ),
        migrations.AddField(
            model_name='condovisitauth',
            name='badge_label',
            field=models.CharField(blank=True, default='', max_length=120),
        ),
        migrations.AddField(
            model_name='condovisitauth',
            name='parking_spot',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='current_visits', to='core.condovisitparkingspot'),
        ),
        migrations.AddField(
            model_name='condovisitauth',
            name='badge',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='current_visits', to='core.condovisitbadge'),
        ),
        migrations.AddField(
            model_name='condovisitevent',
            name='vehicle_photo',
            field=models.ImageField(blank=True, null=True, upload_to=core.models.condo_visit_vehicle_path),
        ),
    ]
