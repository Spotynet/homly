from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0028_closure_flow_and_requests'),
    ]

    operations = [
        migrations.AddField(
            model_name='amenityreservation',
            name='reviewer_notes',
            field=models.TextField(
                blank=True,
                default='',
                help_text='Observations written by the reviewer when approving or rejecting',
            ),
        ),
    ]
