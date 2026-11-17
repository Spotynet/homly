# Generated manually for Rita
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('core', '0099_tenantuser_rental_roles'),
    ]

    operations = [
        migrations.AddField(
            model_name='tenant',
            name='rita_settings',
            field=models.JSONField(blank=True, default=dict, help_text='Configuración de Rita: bank_profile (santander/bbva/…), auto_suggest_unit, etc.'),
        ),
        migrations.CreateModel(
            name='RitaBankSession',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('period', models.CharField(db_index=True, max_length=7)),
                ('bank_profile', models.CharField(default='generic', max_length=40)),
                ('source_filename', models.CharField(blank=True, default='', max_length=255)),
                ('summary', models.JSONField(blank=True, default=dict)),
                ('movements', models.JSONField(blank=True, default=list)),
                ('meta', models.JSONField(blank=True, default=dict)),
                ('status', models.CharField(choices=[('open', 'Abierta'), ('completed', 'Completada'), ('cancelled', 'Cancelada')], db_index=True, default='open', max_length=12)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='rita_sessions', to=settings.AUTH_USER_MODEL)),
                ('tenant', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='rita_sessions', to='core.tenant')),
            ],
            options={
                'db_table': 'rita_bank_sessions',
                'ordering': ['-created_at'],
            },
        ),
    ]
