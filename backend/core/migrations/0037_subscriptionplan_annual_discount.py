"""
Migration 0037: Add annual_discount_percent to SubscriptionPlan.
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0036_subscription_plans_and_trial'),
    ]

    operations = [
        migrations.AddField(
            model_name='subscriptionplan',
            name='annual_discount_percent',
            field=models.DecimalField(
                decimal_places=2,
                default=0,
                help_text='Porcentaje de descuento por pago anual anticipado (0–100)',
                max_digits=5,
            ),
        ),
    ]
