from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0032_paymentplan_proposal_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='paymentplan',
            name='cancel_reason',
            field=models.TextField(
                blank=True, default='',
                help_text='Reason provided when cancelling the plan',
            ),
        ),
        migrations.AddField(
            model_name='paymentplan',
            name='cancelled_by_name',
            field=models.CharField(max_length=200, blank=True),
        ),
        migrations.AddField(
            model_name='paymentplan',
            name='cancelled_at',
            field=models.DateTimeField(null=True, blank=True),
        ),
    ]
