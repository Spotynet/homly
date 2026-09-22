import uuid

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion

import core.models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0069_condo_project_multiple_budgets'),
    ]

    operations = [
        migrations.CreateModel(
            name='CondoMaintenanceWork',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('kind', models.CharField(choices=[('preventivo', 'Preventivo'), ('correctivo', 'Correctivo')], db_index=True, default='preventivo', max_length=16)),
                ('status', models.CharField(choices=[('planeado', 'Planeado'), ('en_curso', 'En curso'), ('realizado', 'Realizado'), ('cancelado', 'Cancelado')], db_index=True, default='planeado', max_length=16)),
                ('priority', models.CharField(choices=[('baja', 'Baja'), ('media', 'Media'), ('alta', 'Alta'), ('urgente', 'Urgente')], default='media', max_length=12)),
                ('title', models.CharField(max_length=240)),
                ('description', models.TextField(blank=True, default='')),
                ('work_notes', models.TextField(blank=True, default='', help_text='Documentación de lo realizado.')),
                ('area_id', models.CharField(blank=True, default='', max_length=80)),
                ('area_name', models.CharField(blank=True, default='', max_length=200)),
                ('performed_by', models.CharField(blank=True, default='', max_length=200)),
                ('vendor_name', models.CharField(blank=True, default='', max_length=200)),
                ('scheduled_date', models.DateField(blank=True, null=True)),
                ('performed_date', models.DateField(blank=True, null=True)),
                ('next_due_date', models.DateField(blank=True, null=True)),
                ('frequency', models.CharField(choices=[('unica', 'Única'), ('semanal', 'Semanal'), ('mensual', 'Mensual'), ('trimestral', 'Trimestral'), ('semestral', 'Semestral'), ('anual', 'Anual')], default='unica', max_length=16)),
                ('cost', models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='condo_maintenance_created', to=settings.AUTH_USER_MODEL)),
                ('tenant', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='condo_maintenance_works', to='core.tenant')),
            ],
            options={
                'db_table': 'condo_maintenance_works',
                'ordering': ['-scheduled_date', '-created_at'],
            },
        ),
        migrations.CreateModel(
            name='CondoMaintenanceEvidence',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('kind', models.CharField(choices=[('antes', 'Antes'), ('despues', 'Después'), ('otro', 'Otro')], default='otro', max_length=12)),
                ('original_name', models.CharField(blank=True, default='', max_length=240)),
                ('notes', models.CharField(blank=True, default='', max_length=400)),
                ('file', models.FileField(upload_to=core.models.condo_maintenance_file_path)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('uploaded_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='condo_maintenance_files_uploaded', to=settings.AUTH_USER_MODEL)),
                ('work', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='evidences', to='core.condomaintenancework')),
            ],
            options={
                'db_table': 'condo_maintenance_evidences',
                'ordering': ['kind', 'created_at'],
            },
        ),
        migrations.AddIndex(
            model_name='condomaintenancework',
            index=models.Index(fields=['tenant', 'kind', 'status'], name='condo_maint_tenant__idx'),
        ),
    ]
