from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0022_tenant_module_permissions'),
    ]

    operations = [
        migrations.AddField(
            model_name='payment',
            name='folio',
            field=models.CharField(
                blank=True,
                default='',
                help_text='Folio / número de recibo asignado al pago',
                max_length=50,
            ),
        ),
    ]
