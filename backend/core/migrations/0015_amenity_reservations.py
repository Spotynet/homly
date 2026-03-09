"""
Migration 0015 — Amenity Reservations system
- Changes Tenant.common_areas from TextField to JSONField (preserves existing data)
- Adds AmenityReservation model
"""
import django.db.models.deletion
import uuid
from django.conf import settings
from django.db import migrations, models


def migrate_common_areas_to_json(apps, schema_editor):
    """Convert existing comma-separated common_areas strings to JSON arrays."""
    Tenant = apps.get_model('core', 'Tenant')
    for tenant in Tenant.objects.all():
        raw = tenant.common_areas
        if isinstance(raw, list):
            continue  # already JSON
        if not raw or not raw.strip():
            tenant.common_areas = []
        else:
            names = [n.strip() for n in raw.split(',') if n.strip()]
            tenant.common_areas = [
                {
                    'id': str(uuid.uuid4()),
                    'name': name,
                    'active': True,
                    'reservations_enabled': False,
                    'charge_enabled': False,
                    'charge_amount': 0,
                    'usage_policy': '',
                    'reservation_policy': '',
                }
                for name in names
            ]
        tenant.save(update_fields=['common_areas'])


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0014_extrafield_show_in_forms'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        # 1. Change common_areas to JSONField
        migrations.AlterField(
            model_name='tenant',
            name='common_areas',
            field=models.JSONField(blank=True, default=list),
        ),

        # 2. Migrate existing string data to JSON
        migrations.RunPython(
            migrate_common_areas_to_json,
            migrations.RunPython.noop,
        ),

        # 3. Create AmenityReservation
        migrations.CreateModel(
            name='AmenityReservation',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('area_id',   models.CharField(db_index=True, max_length=100)),
                ('area_name', models.CharField(max_length=200)),
                ('date',       models.DateField(db_index=True)),
                ('start_time', models.TimeField()),
                ('end_time',   models.TimeField()),
                ('status',     models.CharField(
                    choices=[
                        ('pending',   'Pendiente'),
                        ('approved',  'Aprobada'),
                        ('rejected',  'Rechazada'),
                        ('cancelled', 'Cancelada'),
                    ],
                    db_index=True, default='pending', max_length=20,
                )),
                ('notes',            models.TextField(blank=True, default='')),
                ('charge_amount',    models.DecimalField(decimal_places=2, default=0, max_digits=10)),
                ('rejection_reason', models.TextField(blank=True, default='')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('tenant', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='amenity_reservations',
                    to='core.tenant',
                )),
                ('unit', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='amenity_reservations',
                    to='core.unit',
                )),
                ('requested_by', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='requested_reservations',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('reviewed_by', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='reviewed_reservations',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'db_table': 'amenity_reservations',
                'ordering': ['-date', 'start_time'],
                'indexes': [
                    models.Index(fields=['tenant', 'date'],   name='amenity_tenant_date_idx'),
                    models.Index(fields=['tenant', 'status'], name='amenity_tenant_status_idx'),
                ],
            },
        ),
    ]
