"""
Migration 0015 — Amenity Reservations system
- Changes Tenant.common_areas from TextField to JSONField (preserves existing data)
- Adds AmenityReservation model

Uses AddField + RunPython + RemoveField + RenameField because AlterField fails when
existing TEXT data (e.g. "Palapa", "Alberca, Gimnasio") is not valid JSON.
"""
import django.db.models.deletion
import uuid
from django.conf import settings
from django.db import migrations, models


def migrate_common_areas_to_json(apps, schema_editor):
    """Convert existing comma-separated common_areas (text) to JSON in common_areas_new."""
    Tenant = apps.get_model('core', 'Tenant')
    for tenant in Tenant.objects.all():
        raw = tenant.common_areas  # old TextField, e.g. "Palapa" or "Alberca, Gimnasio"
        if isinstance(raw, list):
            tenant.common_areas_new = raw
        elif not raw or (isinstance(raw, str) and not raw.strip()):
            tenant.common_areas_new = []
        else:
            s = raw if isinstance(raw, str) else str(raw)
            names = [n.strip() for n in s.split(',') if n.strip()]
            tenant.common_areas_new = [
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
        tenant.save(update_fields=['common_areas_new'])


def reverse_migrate(apps, schema_editor):
    """Reverse: convert JSON back to comma-separated string."""
    Tenant = apps.get_model('core', 'Tenant')
    for tenant in Tenant.objects.all():
        arr = tenant.common_areas_new if hasattr(tenant, 'common_areas_new') else []
        if isinstance(arr, list) and arr:
            names = [item.get('name', '') if isinstance(item, dict) else str(item) for item in arr]
            tenant.common_areas = ', '.join(names)
        else:
            tenant.common_areas = ''
        tenant.save(update_fields=['common_areas'])


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0014_extrafield_show_in_forms'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        # 1. Add new JSON column
        migrations.AddField(
            model_name='tenant',
            name='common_areas_new',
            field=models.JSONField(blank=True, default=list),
        ),
        # 2. Migrate data from old text column to new JSON column
        migrations.RunPython(migrate_common_areas_to_json, reverse_migrate),
        # 3. Remove old text column
        migrations.RemoveField(
            model_name='tenant',
            name='common_areas',
        ),
        # 4. Rename new column to common_areas
        migrations.RenameField(
            model_name='tenant',
            old_name='common_areas_new',
            new_name='common_areas',
        ),
        # 5. Create AmenityReservation
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
