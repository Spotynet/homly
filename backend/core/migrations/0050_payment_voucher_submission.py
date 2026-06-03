from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0049_blog_module'),
    ]

    operations = [
        migrations.CreateModel(
            name='PaymentVoucherSubmission',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('period', models.CharField(help_text='YYYY-MM', max_length=7)),
                ('notes', models.TextField(blank=True, default='')),
                ('evidence_file', models.FileField(blank=True, help_text='Imagen o PDF del comprobante de pago', null=True, upload_to='voucher_submissions/')),
                ('status', models.CharField(choices=[('pending', 'Pendiente'), ('received', 'Recibido'), ('rejected', 'Rechazado')], db_index=True, default='pending', max_length=10)),
                ('reviewed_at', models.DateTimeField(blank=True, null=True)),
                ('review_notes', models.TextField(blank=True, default='')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('reviewed_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='reviewed_vouchers', to=settings.AUTH_USER_MODEL)),
                ('submitted_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='voucher_submissions', to=settings.AUTH_USER_MODEL)),
                ('tenant', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='voucher_submissions', to='core.tenant')),
                ('unit', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='voucher_submissions', to='core.unit')),
            ],
            options={
                'db_table': 'payment_voucher_submissions',
                'ordering': ['-created_at'],
            },
        ),
        migrations.AddIndex(
            model_name='paymentvouchersubmission',
            index=models.Index(fields=['tenant', 'status'], name='pvs_tenant_status_idx'),
        ),
        migrations.AddIndex(
            model_name='paymentvouchersubmission',
            index=models.Index(fields=['tenant', 'unit', 'period'], name='pvs_tenant_unit_period_idx'),
        ),
    ]
