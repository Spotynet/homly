import uuid

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion

import core.models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('core', '0071_condo_new_modules_in_plans'),
    ]

    operations = [
        migrations.CreateModel(
            name='CondoProvider',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('person_type', models.CharField(choices=[('fisica', 'Persona física'), ('moral', 'Persona moral')], default='moral', max_length=12)),
                ('legal_name', models.CharField(max_length=300)),
                ('trade_name', models.CharField(blank=True, default='', max_length=300)),
                ('first_name', models.CharField(blank=True, default='', max_length=150)),
                ('last_name', models.CharField(blank=True, default='', max_length=150)),
                ('rfc', models.CharField(blank=True, default='', max_length=20)),
                ('curp', models.CharField(blank=True, default='', max_length=20)),
                ('tax_regime', models.CharField(blank=True, default='', max_length=200)),
                ('legal_rep_name', models.CharField(blank=True, default='', max_length=200)),
                ('contact_name', models.CharField(blank=True, default='', max_length=200)),
                ('email', models.EmailField(blank=True, default='', max_length=254)),
                ('phone', models.CharField(blank=True, default='', max_length=40)),
                ('mobile', models.CharField(blank=True, default='', max_length=40)),
                ('website', models.CharField(blank=True, default='', max_length=300)),
                ('street', models.CharField(blank=True, default='', max_length=300)),
                ('ext_number', models.CharField(blank=True, default='', max_length=40)),
                ('int_number', models.CharField(blank=True, default='', max_length=40)),
                ('colonia', models.CharField(blank=True, default='', max_length=200)),
                ('city', models.CharField(blank=True, default='', max_length=200)),
                ('state', models.CharField(blank=True, default='', max_length=100)),
                ('zip_code', models.CharField(blank=True, default='', max_length=12)),
                ('bank_name', models.CharField(blank=True, default='', max_length=120)),
                ('bank_clabe', models.CharField(blank=True, default='', max_length=20)),
                ('bank_account', models.CharField(blank=True, default='', max_length=30)),
                ('notes', models.TextField(blank=True, default='')),
                ('status', models.CharField(choices=[('activo', 'Activo'), ('inactivo', 'Inactivo'), ('suspendido', 'Suspendido')], db_index=True, default='activo', max_length=12)),
                ('visible_in_modules', models.JSONField(blank=True, default=core.models.default_provider_modules)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='condo_providers_created', to=settings.AUTH_USER_MODEL)),
                ('tenant', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='condo_providers', to='core.tenant')),
            ],
            options={
                'db_table': 'condo_providers',
                'ordering': ['legal_name', 'trade_name'],
            },
        ),
        migrations.CreateModel(
            name='CondoProviderDocument',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('kind', models.CharField(choices=[('csf', 'Constancia de situación fiscal'), ('identificacion', 'Identificación oficial'), ('acta_constitutiva', 'Acta constitutiva'), ('comprobante_domicilio', 'Comprobante de domicilio'), ('estado_cuenta', 'Estado de cuenta'), ('contrato', 'Contrato'), ('otro', 'Otro')], default='otro', max_length=24)),
                ('original_name', models.CharField(blank=True, default='', max_length=240)),
                ('notes', models.CharField(blank=True, default='', max_length=400)),
                ('file', models.FileField(upload_to=core.models.condo_provider_file_path)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('provider', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='documents', to='core.condoprovider')),
                ('uploaded_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='condo_provider_files_uploaded', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'condo_provider_documents',
                'ordering': ['kind', 'created_at'],
            },
        ),
        migrations.AddField(
            model_name='gastoentry',
            name='provider',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='gasto_entries', to='core.condoprovider'),
        ),
        migrations.AddField(
            model_name='cajachicaentry',
            name='provider',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='caja_chica_entries', to='core.condoprovider'),
        ),
        migrations.AddField(
            model_name='cajachicaentry',
            name='provider_name',
            field=models.CharField(blank=True, default='', max_length=300),
        ),
        migrations.AddField(
            model_name='condomaintenancework',
            name='provider',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='maintenance_works', to='core.condoprovider'),
        ),
        migrations.AddField(
            model_name='condoprojectquote',
            name='provider',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='project_quotes', to='core.condoprovider'),
        ),
    ]
