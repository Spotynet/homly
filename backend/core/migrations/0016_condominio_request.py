"""
Migration 0016 — CondominioRequest model
Stores registration requests from the landing page.
"""
import uuid
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0015_amenity_reservations'),
    ]

    operations = [
        migrations.CreateModel(
            name='CondominioRequest',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                # Condominium info
                ('condominio_nombre', models.CharField(max_length=300)),
                ('condominio_pais', models.CharField(blank=True, default='', max_length=100)),
                ('condominio_estado', models.CharField(blank=True, default='', max_length=100)),
                ('condominio_ciudad', models.CharField(blank=True, default='', max_length=200)),
                ('condominio_unidades', models.PositiveIntegerField(default=0)),
                ('condominio_tipo_admin', models.CharField(
                    choices=[
                        ('mesa_directiva', 'Mesa Directiva'),
                        ('administrador', 'Administrador Externo'),
                        ('comite', 'Comité'),
                    ],
                    default='mesa_directiva', max_length=20,
                )),
                ('condominio_currency', models.CharField(
                    choices=[
                        ('MXN', 'Peso Mexicano'),
                        ('USD', 'US Dollar'),
                        ('EUR', 'Euro'),
                        ('COP', 'Peso Colombiano'),
                    ],
                    default='MXN', max_length=3,
                )),
                # Admin info
                ('admin_nombre', models.CharField(max_length=200)),
                ('admin_apellido', models.CharField(max_length=200)),
                ('admin_email', models.EmailField(db_index=True, max_length=254)),
                ('admin_telefono', models.CharField(blank=True, default='', max_length=30)),
                ('admin_cargo', models.CharField(blank=True, default='', max_length=200)),
                # Extra
                ('mensaje', models.TextField(blank=True, default='')),
                # Tracking
                ('status', models.CharField(
                    choices=[
                        ('pending',   'Pendiente'),
                        ('contacted', 'Contactado'),
                        ('enrolled',  'Inscrito'),
                        ('rejected',  'Rechazado'),
                    ],
                    db_index=True, default='pending', max_length=20,
                )),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'db_table': 'condominio_requests',
                'ordering': ['-created_at'],
            },
        ),
    ]
