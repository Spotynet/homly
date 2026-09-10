from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0053_tenant_receipt_seq'),
    ]

    operations = [
        migrations.AddField(
            model_name='unit',
            name='services_suspended',
            field=models.BooleanField(
                default=False,
                help_text='Suspensión de servicios por adeudo (aviso informativo).',
            ),
        ),
        migrations.AddField(
            model_name='unit',
            name='services_suspended_at',
            field=models.DateTimeField(
                blank=True,
                help_text='Cuándo se activó la suspensión de servicios.',
                null=True,
            ),
        ),
    ]
