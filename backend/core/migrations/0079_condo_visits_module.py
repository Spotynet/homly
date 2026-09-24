import uuid

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import core.models


def add_visitas_to_plans(apps, schema_editor):
    SubscriptionPlan = apps.get_model('core', 'SubscriptionPlan')
    for plan in SubscriptionPlan.objects.filter(workspace_type='condominio'):
        mods = list(plan.allowed_modules or [])
        if not mods:
            continue
        if 'visitas' not in mods:
            mods.append('visitas')
            plan.allowed_modules = mods
            plan.save(update_fields=['allowed_modules'])


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0078_package_qr_reminders'),
    ]

    operations = [
        migrations.AddField(
            model_name='tenant',
            name='visit_notify_rules',
            field=models.TextField(blank=True, default='', help_text='Normas del condominio que se incluyen en el correo de autorización de visitas.'),
        ),
        migrations.CreateModel(
            name='CondoVisitAuth',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('folio', models.CharField(db_index=True, help_text='{id-unidad}-{AAAA}-{###}', max_length=80)),
                ('folio_year', models.PositiveIntegerField()),
                ('folio_seq', models.PositiveIntegerField()),
                ('qr_token', models.CharField(db_index=True, default=core.models.default_visit_qr_token, max_length=64, unique=True)),
                ('visitor_first_name', models.CharField(max_length=120)),
                ('visitor_last_name', models.CharField(max_length=120)),
                ('visitor_email', models.EmailField(max_length=254)),
                ('visitor_phone', models.CharField(blank=True, default='', max_length=40)),
                ('kind', models.CharField(choices=[('ocasional', 'Ocasional'), ('permanente', 'Permanente')], db_index=True, max_length=16)),
                ('expected_arrive_at', models.DateTimeField(blank=True, null=True)),
                ('duration_mode', models.CharField(blank=True, choices=[('count', 'Cantidad de visitas'), ('indefinido', 'Indefinido')], default='', max_length=16)),
                ('max_visits', models.PositiveIntegerField(blank=True, null=True)),
                ('visits_used', models.PositiveIntegerField(default=0)),
                ('valid_from', models.DateField()),
                ('valid_until', models.DateField()),
                ('status', models.CharField(choices=[('vigente', 'Vigente'), ('en_condominio', 'En el condominio'), ('completada', 'Completada'), ('agotada', 'Visitas agotadas'), ('vencida', 'Vencida'), ('cancelada', 'Cancelada')], db_index=True, default='vigente', max_length=16)),
                ('currently_inside', models.BooleanField(db_index=True, default=False)),
                ('last_check_in_at', models.DateTimeField(blank=True, null=True)),
                ('last_check_out_at', models.DateTimeField(blank=True, null=True)),
                ('notes', models.TextField(blank=True, default='')),
                ('cancelled_at', models.DateTimeField(blank=True, null=True)),
                ('cancel_reason', models.CharField(blank=True, default='', max_length=300)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('cancelled_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='visit_auths_cancelled', to=settings.AUTH_USER_MODEL)),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='visit_auths_created', to=settings.AUTH_USER_MODEL)),
                ('tenant', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='visit_auths', to='core.tenant')),
                ('unit', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='visit_auths', to='core.unit')),
            ],
            options={
                'db_table': 'condo_visit_auths',
                'ordering': ['-created_at'],
                'unique_together': {('tenant', 'folio')},
            },
        ),
        migrations.CreateModel(
            name='CondoVisitEvent',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('event_type', models.CharField(choices=[('creado', 'Autorización creada'), ('ingreso', 'Ingreso al condominio'), ('salida', 'Salida del condominio'), ('cancelado', 'Autorización cancelada'), ('reenviado', 'Correo reenviado')], db_index=True, max_length=16)),
                ('method', models.CharField(blank=True, choices=[('qr', 'Código QR'), ('identificacion', 'Identificación con foto')], default='', max_length=16)),
                ('notes', models.TextField(blank=True, default='')),
                ('extra', models.JSONField(blank=True, default=dict)),
                ('evidence_photo', models.ImageField(blank=True, null=True, upload_to=core.models.condo_visit_evidence_path)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('actor', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='visit_events', to=settings.AUTH_USER_MODEL)),
                ('visit', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='events', to='core.condovisitauth')),
            ],
            options={
                'db_table': 'condo_visit_events',
                'ordering': ['created_at'],
            },
        ),
        migrations.AddIndex(
            model_name='condovisitauth',
            index=models.Index(fields=['tenant', 'kind', 'status'], name='condo_visit_tenant__kind_idx'),
        ),
        migrations.AddIndex(
            model_name='condovisitauth',
            index=models.Index(fields=['tenant', 'unit'], name='condo_visit_tenant__unit_idx'),
        ),
        migrations.AddIndex(
            model_name='condovisitauth',
            index=models.Index(fields=['tenant', 'currently_inside'], name='condo_visit_tenant__inside_idx'),
        ),
        migrations.AddIndex(
            model_name='condovisitauth',
            index=models.Index(fields=['tenant', 'folio_year', 'unit'], name='condo_visit_tenant__folio_idx'),
        ),
        migrations.RunPython(add_visitas_to_plans, migrations.RunPython.noop),
    ]
