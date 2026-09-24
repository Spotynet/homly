import uuid

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import core.models


def add_paqueteria_to_plans(apps, schema_editor):
    SubscriptionPlan = apps.get_model('core', 'SubscriptionPlan')
    for plan in SubscriptionPlan.objects.filter(workspace_type='condominio'):
        mods = list(plan.allowed_modules or [])
        if not mods:
            continue
        if 'paqueteria' not in mods:
            mods.append('paqueteria')
            plan.allowed_modules = mods
            plan.save(update_fields=['allowed_modules'])


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0076_maintenance_work_period'),
    ]

    operations = [
        migrations.AddField(
            model_name='tenant',
            name='package_folio_seq',
            field=models.PositiveIntegerField(default=0, help_text='Último consecutivo de paquetería del año en curso.'),
        ),
        migrations.AddField(
            model_name='tenant',
            name='package_folio_year',
            field=models.PositiveIntegerField(default=0, help_text='Año del último folio de paquetería (AAAA-####).'),
        ),
        migrations.AddField(
            model_name='tenant',
            name='package_notify_rules',
            field=models.TextField(blank=True, default='', help_text='Reglamento interno que se incluye en las notificaciones de paquetería.'),
        ),
        migrations.CreateModel(
            name='CondoPackage',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('folio', models.CharField(db_index=True, help_text='AAAA-####', max_length=12)),
                ('folio_year', models.PositiveIntegerField()),
                ('folio_seq', models.PositiveIntegerField()),
                ('status', models.CharField(choices=[('recibido', 'En vigilancia'), ('entregado', 'Entregado')], db_index=True, default='recibido', max_length=16)),
                ('receive_notes', models.TextField(blank=True, default='')),
                ('receive_photo', models.ImageField(upload_to=core.models.condo_package_photo_path)),
                ('received_at', models.DateTimeField(auto_now_add=True)),
                ('delivery_notes', models.TextField(blank=True, default='')),
                ('delivery_signature', models.ImageField(blank=True, null=True, upload_to=core.models.condo_package_signature_path)),
                ('delivered_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('delivered_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='packages_delivered', to=settings.AUTH_USER_MODEL)),
                ('received_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='packages_received', to=settings.AUTH_USER_MODEL)),
                ('tenant', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='packages', to='core.tenant')),
                ('unit', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='packages', to='core.unit')),
            ],
            options={
                'db_table': 'condo_packages',
                'ordering': ['-received_at'],
                'unique_together': {('tenant', 'folio')},
            },
        ),
        migrations.CreateModel(
            name='CondoPackageEvent',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('event_type', models.CharField(choices=[('recibido', 'Recepción en vigilancia'), ('notificado', 'Notificación enviada'), ('entregado', 'Entrega al destinatario'), ('nota', 'Nota')], db_index=True, max_length=16)),
                ('notes', models.TextField(blank=True, default='')),
                ('extra', models.JSONField(blank=True, default=dict)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('actor', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='package_events', to=settings.AUTH_USER_MODEL)),
                ('package', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='events', to='core.condopackage')),
            ],
            options={
                'db_table': 'condo_package_events',
                'ordering': ['created_at'],
            },
        ),
        migrations.AddIndex(
            model_name='condopackage',
            index=models.Index(fields=['tenant', 'status'], name='condo_packa_tenant__status_idx'),
        ),
        migrations.AddIndex(
            model_name='condopackage',
            index=models.Index(fields=['tenant', 'folio_year'], name='condo_packa_tenant__year_idx'),
        ),
        migrations.AddIndex(
            model_name='condopackage',
            index=models.Index(fields=['tenant', 'unit'], name='condo_packa_tenant__unit_idx'),
        ),
        migrations.RunPython(add_paqueteria_to_plans, migrations.RunPython.noop),
    ]
