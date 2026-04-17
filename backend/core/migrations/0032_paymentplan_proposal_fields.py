from django.db import migrations, models
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0031_paymentplan'),
    ]

    operations = [
        migrations.AddField(
            model_name='paymentplan',
            name='start_period',
            field=models.CharField(
                max_length=7, blank=True, default='',
                help_text='YYYY-MM period when this plan starts applying to cobranza',
            ),
        ),
        migrations.AddField(
            model_name='paymentplan',
            name='proposal_group',
            field=models.UUIDField(
                null=True, blank=True, db_index=True,
                help_text='Groups multiple options sent together as a proposal',
            ),
        ),
        migrations.AddField(
            model_name='paymentplan',
            name='option_number',
            field=models.PositiveSmallIntegerField(
                default=1,
                help_text='Option number within a proposal (1, 2, or 3)',
            ),
        ),
    ]
