import uuid

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import core.models


def add_maint_to_rentas_plans(apps, schema_editor):
    SubscriptionPlan = apps.get_model('core', 'SubscriptionPlan')
    for plan in SubscriptionPlan.objects.filter(workspace_type='rentas'):
        mods = list(plan.allowed_modules or [])
        if not mods:
            continue
        if 'rentas_mantenimiento' not in mods:
            mods.append('rentas_mantenimiento')
            plan.allowed_modules = mods
            plan.save(update_fields=['allowed_modules'])


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('core', '0080_visit_host_vehicle_catalog'),
    ]

    operations = [
        migrations.AlterField(
            model_name='tenant',
            name='workspace_type',
            field=models.CharField(
                choices=[('condominio', 'Administración de condominios'), ('rentas', 'Administrar Propiedades')],
                db_index=True,
                default='condominio',
                help_text='Espacio de trabajo: condominio o administrar propiedades.',
                max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name='subscriptionplan',
            name='workspace_type',
            field=models.CharField(
                choices=[('condominio', 'Administración de condominios'), ('rentas', 'Administrar Propiedades')],
                db_index=True,
                default='condominio',
                help_text='Catálogo de planes independiente por espacio de trabajo.',
                max_length=20,
            ),
        ),
        migrations.CreateModel(
            name='RentalMaintenanceCategory',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('name', models.CharField(max_length=120)),
                ('slug', models.CharField(blank=True, default='', max_length=40)),
                ('color', models.CharField(blank=True, default='#0f766e', max_length=16)),
                ('sort_order', models.PositiveSmallIntegerField(default=0)),
                ('is_active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('tenant', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='rental_maint_categories', to='core.tenant')),
            ],
            options={
                'db_table': 'rental_maintenance_categories',
                'ordering': ['sort_order', 'name'],
                'unique_together': {('tenant', 'name')},
            },
        ),
        migrations.CreateModel(
            name='RentalMaintenanceWorkType',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('name', models.CharField(max_length=200)),
                ('kind', models.CharField(choices=[('preventivo', 'Preventivo'), ('correctivo', 'Correctivo'), ('ambos', 'Ambos')], default='ambos', max_length=16)),
                ('default_frequency', models.CharField(blank=True, default='unica', max_length=16)),
                ('is_active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('category', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='work_types', to='core.rentalmaintenancecategory')),
                ('tenant', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='rental_maint_work_types', to='core.tenant')),
            ],
            options={
                'db_table': 'rental_maintenance_work_types',
                'ordering': ['name'],
            },
        ),
        migrations.CreateModel(
            name='RentalMaintenanceProvider',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('name', models.CharField(max_length=200)),
                ('trade_name', models.CharField(blank=True, default='', max_length=200)),
                ('contact_name', models.CharField(blank=True, default='', max_length=200)),
                ('email', models.EmailField(blank=True, default='', max_length=254)),
                ('phone', models.CharField(blank=True, default='', max_length=40)),
                ('rfc', models.CharField(blank=True, default='', max_length=20)),
                ('notes', models.TextField(blank=True, default='')),
                ('category_ids', models.JSONField(blank=True, default=list)),
                ('status', models.CharField(choices=[('activo', 'Activo'), ('inactivo', 'Inactivo')], default='activo', max_length=12)),
                ('is_active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('tenant', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='rental_maint_providers', to='core.tenant')),
            ],
            options={
                'db_table': 'rental_maintenance_providers',
                'ordering': ['name'],
            },
        ),
        migrations.CreateModel(
            name='RentalMaintenanceWork',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('folio', models.CharField(db_index=True, default='', max_length=40)),
                ('kind', models.CharField(choices=[('preventivo', 'Preventivo'), ('correctivo', 'Correctivo')], db_index=True, default='correctivo', max_length=16)),
                ('status', models.CharField(choices=[('planeado', 'Planeado'), ('en_curso', 'En curso'), ('realizado', 'Realizado'), ('cancelado', 'Cancelado')], db_index=True, default='planeado', max_length=16)),
                ('priority', models.CharField(choices=[('baja', 'Baja'), ('media', 'Media'), ('alta', 'Alta'), ('urgente', 'Urgente')], default='media', max_length=12)),
                ('title', models.CharField(max_length=240)),
                ('description', models.TextField(blank=True, default='')),
                ('work_notes', models.TextField(blank=True, default='')),
                ('vendor_name', models.CharField(blank=True, default='', max_length=200)),
                ('reported_by', models.CharField(blank=True, default='', max_length=200)),
                ('assigned_to', models.CharField(blank=True, default='', max_length=200)),
                ('scheduled_date', models.DateField(blank=True, null=True)),
                ('performed_date', models.DateField(blank=True, null=True)),
                ('next_due_date', models.DateField(blank=True, null=True)),
                ('frequency', models.CharField(choices=[('unica', 'Única'), ('semanal', 'Semanal'), ('mensual', 'Mensual'), ('trimestral', 'Trimestral'), ('semestral', 'Semestral'), ('anual', 'Anual')], default='unica', max_length=16)),
                ('cost', models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('category', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='works', to='core.rentalmaintenancecategory')),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='rental_maint_created', to=settings.AUTH_USER_MODEL)),
                ('property', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='maintenance_works', to='core.rentalproperty')),
                ('provider', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='works', to='core.rentalmaintenanceprovider')),
                ('tenant', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='rental_maint_works', to='core.tenant')),
                ('work_type', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='works', to='core.rentalmaintenanceworktype')),
            ],
            options={
                'db_table': 'rental_maintenance_works',
                'ordering': ['-scheduled_date', '-created_at'],
            },
        ),
        migrations.CreateModel(
            name='RentalMaintenanceEvidence',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('kind', models.CharField(choices=[('antes', 'Antes'), ('durante', 'Durante'), ('despues', 'Después'), ('otro', 'Otro')], default='otro', max_length=12)),
                ('original_name', models.CharField(blank=True, default='', max_length=240)),
                ('notes', models.CharField(blank=True, default='', max_length=400)),
                ('captured_at', models.DateField(blank=True, null=True)),
                ('file', models.FileField(upload_to=core.models.rental_maintenance_file_path)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('uploaded_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='rental_maint_files_uploaded', to=settings.AUTH_USER_MODEL)),
                ('work', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='evidences', to='core.rentalmaintenancework')),
            ],
            options={
                'db_table': 'rental_maintenance_evidences',
                'ordering': ['captured_at', 'created_at'],
            },
        ),
        migrations.AddIndex(
            model_name='rentalmaintenancework',
            index=models.Index(fields=['tenant', 'kind', 'status'], name='rental_main_tenant__kind_idx'),
        ),
        migrations.AddIndex(
            model_name='rentalmaintenancework',
            index=models.Index(fields=['tenant', 'property'], name='rental_main_tenant__prop_idx'),
        ),
        migrations.RunPython(add_maint_to_rentas_plans, migrations.RunPython.noop),
    ]
