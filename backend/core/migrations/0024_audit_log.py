from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0023_payment_folio'),
    ]

    operations = [
        migrations.CreateModel(
            name='AuditLog',
            fields=[
                ('id',          models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('tenant_name', models.CharField(blank=True, default='', max_length=200)),
                ('user_name',   models.CharField(blank=True, default='', max_length=200)),
                ('user_email',  models.CharField(blank=True, default='', max_length=200)),
                ('user_role',   models.CharField(blank=True, default='', max_length=40)),
                ('module',      models.CharField(choices=[('auth','Autenticación'),('cobranza','Cobranza'),('gastos','Gastos'),('reservas','Reservas'),('usuarios','Usuarios'),('unidades','Unidades'),('config','Configuración'),('tenants','Tenants'),('sistema','Sistema')], db_index=True, max_length=40)),
                ('action',      models.CharField(choices=[('login','Inicio de sesión'),('create','Crear registro'),('update','Actualizar registro'),('delete','Eliminar registro'),('approve','Aprobar'),('reject','Rechazar'),('cancel','Cancelar'),('close_period','Cerrar período'),('reopen_period','Reabrir período'),('send_email','Enviar correo'),('toggle_status','Cambiar estado'),('add_payment','Agregar pago adicional')], db_index=True, max_length=40)),
                ('description', models.TextField(blank=True, default='')),
                ('object_type', models.CharField(blank=True, default='', max_length=80)),
                ('object_id',   models.CharField(blank=True, default='', max_length=100)),
                ('object_repr', models.CharField(blank=True, default='', max_length=300)),
                ('ip_address',  models.GenericIPAddressField(blank=True, null=True)),
                ('extra_data',  models.JSONField(blank=True, default=dict)),
                ('created_at',  models.DateTimeField(auto_now_add=True)),
                ('tenant',      models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='audit_logs', to='core.tenant')),
                ('user',        models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='audit_logs', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'audit_logs',
                'ordering': ['-created_at'],
                'indexes': [
                    models.Index(fields=['tenant', '-created_at'], name='audit_tenant_dt_idx'),
                    models.Index(fields=['user',   '-created_at'], name='audit_user_dt_idx'),
                    models.Index(fields=['module', 'action'],      name='audit_module_action_idx'),
                ],
            },
        ),
    ]
