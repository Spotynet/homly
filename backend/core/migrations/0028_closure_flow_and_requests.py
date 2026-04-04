import uuid
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0027_unit_is_active'),
    ]

    operations = [
        # 1. Add closure_flow to Tenant
        migrations.AddField(
            model_name='tenant',
            name='closure_flow',
            field=models.JSONField(
                blank=True,
                default=dict,
                help_text='Period closure approval flow: enabled flag and ordered list of approver steps.',
            ),
        ),

        # 2. PeriodClosureRequest table
        migrations.CreateModel(
            name='PeriodClosureRequest',
            fields=[
                ('id',           models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
                ('period',       models.CharField(db_index=True, max_length=7)),
                ('status',       models.CharField(
                                    choices=[('in_progress', 'En proceso'), ('completed', 'Completado'), ('rejected', 'Rechazado')],
                                    default='in_progress', max_length=15)),
                ('notes',        models.TextField(blank=True, default='')),
                ('created_at',   models.DateTimeField(auto_now_add=True)),
                ('completed_at', models.DateTimeField(blank=True, null=True)),
                ('tenant',       models.ForeignKey(on_delete=django.db.models.deletion.CASCADE,
                                    related_name='closure_requests', to='core.tenant')),
                ('initiated_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL,
                                    related_name='initiated_closures', to=settings.AUTH_USER_MODEL)),
            ],
            options={'db_table': 'period_closure_requests', 'ordering': ['-created_at']},
        ),
        migrations.AddIndex(
            model_name='periodclosurerequest',
            index=models.Index(fields=['tenant', 'period'], name='pcr_tenant_period_idx'),
        ),

        # 3. PeriodClosureStep table
        migrations.CreateModel(
            name='PeriodClosureStep',
            fields=[
                ('id',          models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
                ('order',       models.PositiveSmallIntegerField()),
                ('label',       models.CharField(blank=True, default='', max_length=200)),
                ('status',      models.CharField(
                                    choices=[('pending', 'Pendiente'), ('approved', 'Aprobado'), ('rejected', 'Rechazado')],
                                    default='pending', max_length=10)),
                ('actioned_at', models.DateTimeField(blank=True, null=True)),
                ('notes',       models.TextField(blank=True, default='')),
                ('closure_request', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE,
                                        related_name='steps', to='core.periodclosurerequest')),
                ('approver',    models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL,
                                    related_name='closure_steps', to=settings.AUTH_USER_MODEL)),
            ],
            options={'db_table': 'period_closure_steps', 'ordering': ['order']},
        ),
        migrations.AlterUniqueTogether(
            name='periodclosurestep',
            unique_together={('closure_request', 'order')},
        ),
    ]
