from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0042_tenantsubscription_history'),
    ]

    operations = [
        migrations.AddField(
            model_name='cajachicaentry',
            name='evidence',
            field=models.TextField(
                blank=True,
                default='',
                help_text='JSON array of {data, mime, name} base64-encoded evidence files for this entry.',
            ),
        ),
    ]
