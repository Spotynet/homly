import uuid
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0019_merge_20260312_2256'),
    ]

    operations = [
        migrations.CreateModel(
            name='Notification',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('notif_type', models.CharField(
                    choices=[
                        ('reservation_new', 'Nueva Reserva Solicitada'),
                        ('reservation_approved', 'Reserva Aprobada'),
                        ('reservation_rejected', 'Reserva Rechazada'),
                        ('reservation_cancelled', 'Reserva Cancelada'),
                        ('general', 'Información General'),
                    ],
                    db_index=True, default='general', max_length=40,
                )),
                ('title', models.CharField(max_length=200)),
                ('message', models.TextField(blank=True, default='')),
                ('is_read', models.BooleanField(db_index=True, default=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('tenant', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='notifications',
                    to='core.tenant',
                )),
                ('user', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='notifications',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('related_reservation', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='notifications',
                    to='core.amenityreservation',
                )),
            ],
            options={
                'db_table': 'notifications',
                'ordering': ['-created_at'],
            },
        ),
        migrations.AddIndex(
            model_name='notification',
            index=models.Index(fields=['tenant', 'user', 'is_read'], name='notif_tenant_user_read_idx'),
        ),
    ]
