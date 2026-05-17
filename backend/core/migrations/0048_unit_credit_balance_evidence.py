from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0047_system_role_model'),
    ]

    operations = [
        migrations.AddField(
            model_name='unit',
            name='credit_balance_evidence',
            field=models.TextField(
                blank=True,
                default='',
                help_text='Base64 PDF evidencia del saldo a favor previo',
            ),
        ),
    ]
