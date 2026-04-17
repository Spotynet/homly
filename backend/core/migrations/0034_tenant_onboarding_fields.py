from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0033_paymentplan_cancel_reason'),
    ]

    operations = [
        migrations.AddField(
            model_name='tenant',
            name='onboarding_completed',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='tenant',
            name='onboarding_dismissed_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
