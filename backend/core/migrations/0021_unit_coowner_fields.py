from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0020_notification'),
    ]

    operations = [
        migrations.AddField(
            model_name='unit',
            name='coowner_first_name',
            field=models.CharField(blank=True, default='', help_text='Copropietario first name', max_length=150),
        ),
        migrations.AddField(
            model_name='unit',
            name='coowner_last_name',
            field=models.CharField(blank=True, default='', max_length=150),
        ),
        migrations.AddField(
            model_name='unit',
            name='coowner_email',
            field=models.EmailField(blank=True, default='', max_length=254),
        ),
        migrations.AddField(
            model_name='unit',
            name='coowner_phone',
            field=models.CharField(blank=True, default='', max_length=30),
        ),
    ]
