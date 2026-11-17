import uuid

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import core.models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('core', '0081_rental_property_maintenance'),
    ]

    operations = [
        migrations.AddField(
            model_name='rentalmaintenanceprovider',
            name='person_type',
            field=models.CharField(
                choices=[('fisica', 'Persona física'), ('moral', 'Persona moral')],
                default='moral',
                max_length=12,
            ),
        ),
        migrations.AddField(
            model_name='rentalmaintenanceprovider',
            name='mobile',
            field=models.CharField(blank=True, default='', max_length=40),
        ),
        migrations.AddField(
            model_name='rentalmaintenanceprovider',
            name='curp',
            field=models.CharField(blank=True, default='', max_length=20),
        ),
        migrations.AddField(
            model_name='rentalmaintenanceprovider',
            name='tax_regime',
            field=models.CharField(blank=True, default='', max_length=200),
        ),
        migrations.AddField(
            model_name='rentalmaintenanceprovider',
            name='legal_rep_name',
            field=models.CharField(blank=True, default='', max_length=200),
        ),
        migrations.AddField(
            model_name='rentalmaintenanceprovider',
            name='legal_rep_rfc',
            field=models.CharField(blank=True, default='', max_length=20),
        ),
        migrations.AddField(
            model_name='rentalmaintenanceprovider',
            name='website',
            field=models.CharField(blank=True, default='', max_length=300),
        ),
        migrations.AddField(
            model_name='rentalmaintenanceprovider',
            name='has_expediente',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='rentalmaintenanceprovider',
            name='expediente_opened_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='rentalmaintenanceprovider',
            name='street',
            field=models.CharField(blank=True, default='', max_length=300),
        ),
        migrations.AddField(
            model_name='rentalmaintenanceprovider',
            name='ext_number',
            field=models.CharField(blank=True, default='', max_length=40),
        ),
        migrations.AddField(
            model_name='rentalmaintenanceprovider',
            name='int_number',
            field=models.CharField(blank=True, default='', max_length=40),
        ),
        migrations.AddField(
            model_name='rentalmaintenanceprovider',
            name='colonia',
            field=models.CharField(blank=True, default='', max_length=200),
        ),
        migrations.AddField(
            model_name='rentalmaintenanceprovider',
            name='city',
            field=models.CharField(blank=True, default='', max_length=200),
        ),
        migrations.AddField(
            model_name='rentalmaintenanceprovider',
            name='state',
            field=models.CharField(blank=True, default='', max_length=100),
        ),
        migrations.AddField(
            model_name='rentalmaintenanceprovider',
            name='zip_code',
            field=models.CharField(blank=True, default='', max_length=12),
        ),
        migrations.AddField(
            model_name='rentalmaintenanceprovider',
            name='country',
            field=models.CharField(blank=True, default='México', max_length=80),
        ),
        migrations.AddField(
            model_name='rentalmaintenanceprovider',
            name='bank_name',
            field=models.CharField(blank=True, default='', max_length=120),
        ),
        migrations.AddField(
            model_name='rentalmaintenanceprovider',
            name='bank_clabe',
            field=models.CharField(blank=True, default='', max_length=20),
        ),
        migrations.AddField(
            model_name='rentalmaintenanceprovider',
            name='bank_account',
            field=models.CharField(blank=True, default='', max_length=30),
        ),
        migrations.AddField(
            model_name='rentalmaintenanceprovider',
            name='bank_beneficiary',
            field=models.CharField(blank=True, default='', max_length=200),
        ),
        migrations.AddField(
            model_name='rentalmaintenanceprovider',
            name='bank_account_type',
            field=models.CharField(
                blank=True,
                choices=[('clabe', 'CLABE interbancaria'), ('cheques', 'Cuenta de cheques'), ('ahorro', 'Cuenta de ahorro')],
                default='clabe',
                max_length=16,
            ),
        ),
        migrations.AddField(
            model_name='rentalmaintenanceprovider',
            name='is_repse',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='rentalmaintenanceprovider',
            name='repse_registro',
            field=models.CharField(blank=True, default='', max_length=40),
        ),
        migrations.AddField(
            model_name='rentalmaintenanceprovider',
            name='repse_folio',
            field=models.CharField(blank=True, default='', max_length=40),
        ),
        migrations.AddField(
            model_name='rentalmaintenanceprovider',
            name='repse_activity',
            field=models.TextField(blank=True, default=''),
        ),
        migrations.AddField(
            model_name='rentalmaintenanceprovider',
            name='repse_registered_at',
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='rentalmaintenanceprovider',
            name='repse_expires_at',
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='rentalmaintenanceprovider',
            name='repse_status',
            field=models.CharField(
                choices=[
                    ('no_aplica', 'No aplica'),
                    ('pendiente', 'Pendiente de expediente'),
                    ('vigente', 'Vigente'),
                    ('vencido', 'Vencido'),
                ],
                default='no_aplica',
                max_length=16,
            ),
        ),
        migrations.AddField(
            model_name='rentalmaintenanceprovider',
            name='repse_notes',
            field=models.TextField(blank=True, default=''),
        ),
        migrations.CreateModel(
            name='RentalMaintenanceProviderContact',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('name', models.CharField(max_length=200)),
                ('role', models.CharField(blank=True, default='', max_length=120)),
                ('email', models.EmailField(blank=True, default='', max_length=254)),
                ('phone', models.CharField(blank=True, default='', max_length=40)),
                ('mobile', models.CharField(blank=True, default='', max_length=40)),
                ('is_primary', models.BooleanField(default=False)),
                ('notes', models.CharField(blank=True, default='', max_length=400)),
                ('sort_order', models.PositiveSmallIntegerField(default=0)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('provider', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='contacts',
                    to='core.rentalmaintenanceprovider',
                )),
            ],
            options={
                'db_table': 'rental_maintenance_provider_contacts',
                'ordering': ['-is_primary', 'sort_order', 'name'],
            },
        ),
        migrations.CreateModel(
            name='RentalMaintenanceProviderDocument',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('section', models.CharField(
                    choices=[('general', 'Expediente general'), ('repse', 'Expediente REPSE')],
                    default='general',
                    max_length=12,
                )),
                ('kind', models.CharField(
                    choices=[
                        ('identificacion', 'Identificación oficial'),
                        ('rfc_csf', 'Constancia de situación fiscal'),
                        ('curp', 'CURP'),
                        ('comprobante_domicilio', 'Comprobante de domicilio'),
                        ('opinion_sat', 'Opinión de cumplimiento SAT'),
                        ('estado_cuenta', 'Estado de cuenta'),
                        ('contrato', 'Contrato de servicios'),
                        ('acta_constitutiva', 'Acta constitutiva'),
                        ('poder_notarial', 'Poder notarial del representante'),
                        ('identificacion_rep', 'Identificación del representante'),
                        ('constancia_repse', 'Constancia de inscripción REPSE'),
                        ('icsoe', 'ICSOE'),
                        ('sisub', 'SISUB'),
                        ('opinion_imss', 'Opinión de cumplimiento IMSS'),
                        ('opinion_infonavit', 'Opinión de cumplimiento INFONAVIT'),
                        ('contrato_especializado', 'Contrato de servicios especializados'),
                        ('listado_trabajadores', 'Listado de trabajadores'),
                        ('otro', 'Otro'),
                    ],
                    default='otro',
                    max_length=32,
                )),
                ('original_name', models.CharField(blank=True, default='', max_length=240)),
                ('notes', models.CharField(blank=True, default='', max_length=400)),
                ('expires_at', models.DateField(blank=True, null=True)),
                ('file', models.FileField(upload_to=core.models.rental_provider_file_path)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('provider', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='documents',
                    to='core.rentalmaintenanceprovider',
                )),
                ('uploaded_by', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='rental_provider_files_uploaded',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'db_table': 'rental_maintenance_provider_documents',
                'ordering': ['section', 'kind', 'created_at'],
            },
        ),
    ]
