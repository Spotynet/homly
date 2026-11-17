import uuid

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import core.models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('core', '0082_rental_provider_expediente'),
    ]

    operations = [
        migrations.AddField(
            model_name='rentalcontract',
            name='kind',
            field=models.CharField(
                choices=[
                    ('renta', 'Renta de propiedad'),
                    ('proveedor', 'Proveedor de servicios'),
                    ('servicios_generales', 'Servicios generales'),
                    ('mantenimiento', 'Mantenimiento de inmueble'),
                    ('comodato', 'Comodato / préstamo de uso'),
                    ('promesa', 'Promesa de arrendamiento'),
                    ('otro', 'Otro'),
                ],
                db_index=True,
                default='renta',
                max_length=24,
            ),
        ),
        migrations.AddField(
            model_name='rentalcontract',
            name='title',
            field=models.CharField(blank=True, default='', max_length=240),
        ),
        migrations.AlterField(
            model_name='rentalcontract',
            name='property',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='contracts',
                to='core.rentalproperty',
            ),
        ),
        migrations.AlterField(
            model_name='rentalcontract',
            name='tenant_party',
            field=models.ForeignKey(
                blank=True, null=True,
                help_text='Cliente, inquilino u otra parte del espacio.',
                on_delete=django.db.models.deletion.PROTECT,
                related_name='contracts',
                to='core.rentalparty',
            ),
        ),
        migrations.AddField(
            model_name='rentalcontract',
            name='provider',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='contracts',
                to='core.rentalmaintenanceprovider',
            ),
        ),
        migrations.AddField(
            model_name='rentalcontract',
            name='category',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='contracts',
                to='core.rentalmaintenancecategory',
            ),
        ),
        migrations.AddField(
            model_name='rentalcontract',
            name='work',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='contracts',
                to='core.rentalmaintenancework',
            ),
        ),
        migrations.AddField(
            model_name='rentalcontract',
            name='counterparty_name',
            field=models.CharField(blank=True, default='', max_length=240),
        ),
        migrations.AddField(
            model_name='rentalcontract',
            name='service_description',
            field=models.TextField(blank=True, default=''),
        ),
        migrations.AddField(
            model_name='rentalcontract',
            name='legal_stage',
            field=models.CharField(
                choices=[
                    ('none', 'Sin asistente'),
                    ('entrevista', 'Entrevista'),
                    ('redaccion', 'Redacción'),
                    ('firmas', 'Firmas'),
                    ('publicado', 'Publicado'),
                ],
                db_index=True,
                default='none',
                max_length=16,
            ),
        ),
        migrations.AddField(
            model_name='rentalcontract',
            name='assistant_brief',
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name='rentalcontract',
            name='body',
            field=models.TextField(blank=True, default=''),
        ),
        migrations.AddField(
            model_name='rentalcontract',
            name='published_body',
            field=models.TextField(blank=True, default=''),
        ),
        migrations.AddField(
            model_name='rentalcontract',
            name='published_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='rentalcontract',
            name='published_by',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='rental_contracts_published',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddIndex(
            model_name='rentalcontract',
            index=models.Index(fields=['tenant', 'kind'], name='rental_contr_tenant__kind_idx'),
        ),
        migrations.CreateModel(
            name='RentalContractSignature',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('signer_name', models.CharField(max_length=200)),
                ('signer_role', models.CharField(blank=True, default='', max_length=120)),
                ('signer_email', models.EmailField(blank=True, default='', max_length=254)),
                ('status', models.CharField(
                    choices=[('pendiente', 'Pendiente'), ('firmado', 'Firmado'), ('rechazado', 'Rechazado')],
                    default='pendiente',
                    max_length=12,
                )),
                ('method', models.CharField(
                    choices=[('acuse', 'Acuse con nombre'), ('imagen', 'Imagen de firma')],
                    default='acuse',
                    max_length=12,
                )),
                ('signed_name', models.CharField(blank=True, default='', max_length=200)),
                ('file', models.FileField(blank=True, null=True, upload_to=core.models.rental_contract_sign_path)),
                ('notes', models.CharField(blank=True, default='', max_length=400)),
                ('signed_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('contract', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='signatures',
                    to='core.rentalcontract',
                )),
                ('party', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='contract_signatures',
                    to='core.rentalparty',
                )),
                ('provider', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='contract_signatures',
                    to='core.rentalmaintenanceprovider',
                )),
            ],
            options={
                'db_table': 'rental_contract_signatures',
                'ordering': ['created_at'],
            },
        ),
    ]
