from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0030_payment_applied_to_unit'),
    ]

    operations = [
        migrations.CreateModel(
            name='PaymentPlan',
            fields=[
                ('id',                  models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
                ('total_adeudo',        models.DecimalField(decimal_places=2, max_digits=14)),
                ('maintenance_fee',     models.DecimalField(decimal_places=2, default=0, max_digits=14)),
                ('frequency',           models.PositiveSmallIntegerField(
                                            choices=[(1,'Mensual'),(2,'Bimestral'),(3,'Trimestral'),(6,'Semestral')],
                                            default=1)),
                ('num_payments',        models.PositiveSmallIntegerField(default=1)),
                ('apply_interest',      models.BooleanField(default=False)),
                ('interest_rate',       models.DecimalField(decimal_places=2, default=0, max_digits=5)),
                ('total_with_interest', models.DecimalField(decimal_places=2, max_digits=14)),
                ('status',              models.CharField(
                                            choices=[
                                                ('draft',     'Borrador'),
                                                ('sent',      'Enviado al vecino'),
                                                ('accepted',  'Aceptado / Activo'),
                                                ('rejected',  'Rechazado'),
                                                ('completed', 'Completado'),
                                                ('cancelled', 'Cancelado'),
                                            ],
                                            db_index=True, default='draft', max_length=20)),
                ('notes',              models.TextField(blank=True, default='')),
                ('created_by_name',    models.CharField(blank=True, max_length=200)),
                ('created_by_email',   models.CharField(blank=True, max_length=200)),
                ('created_at',         models.DateTimeField(auto_now_add=True)),
                ('sent_by_name',       models.CharField(blank=True, max_length=200)),
                ('sent_at',            models.DateTimeField(blank=True, null=True)),
                ('accepted_by_name',   models.CharField(blank=True, max_length=200)),
                ('accepted_at',        models.DateTimeField(blank=True, null=True)),
                ('installments',       models.JSONField(default=list)),
                ('tenant',             models.ForeignKey(
                                            on_delete=django.db.models.deletion.CASCADE,
                                            related_name='payment_plans', to='core.tenant')),
                ('unit',               models.ForeignKey(
                                            on_delete=django.db.models.deletion.CASCADE,
                                            related_name='payment_plans', to='core.unit')),
            ],
            options={'db_table': 'payment_plans', 'ordering': ['-created_at']},
        ),
    ]
