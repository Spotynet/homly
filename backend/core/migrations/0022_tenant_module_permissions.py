from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0021_unit_coowner_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='tenant',
            name='module_permissions',
            field=models.JSONField(
                blank=True,
                default=dict,
                help_text=(
                    'Per-role module visibility. Keys: admin, tesorero, contador, auditor, vigilante, vecino. '
                    'Values: list of enabled module keys. Empty dict = all defaults enabled.'
                ),
            ),
        ),
    ]
