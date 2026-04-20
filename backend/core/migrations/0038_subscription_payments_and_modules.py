"""
Migration 0038:
- Add allowed_modules JSONField to SubscriptionPlan
- Create SubscriptionPayment model
"""
import uuid
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0037_subscriptionplan_annual_discount'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        # ── 1. allowed_modules on SubscriptionPlan ─────────────────────────
        migrations.AddField(
            model_name='subscriptionplan',
            name='allowed_modules',
            field=models.JSONField(
                blank=True,
                default=list,
                help_text='Module keys visible to tenants on this plan. Empty = all modules.',
            ),
        ),

        # ── 2. SubscriptionPayment model ────────────────────────────────────
        migrations.CreateModel(
            name='SubscriptionPayment',
            fields=[
                ('id', models.UUIDField(
                    default=uuid.uuid4, editable=False,
                    primary_key=True, serialize=False,
                )),
                ('subscription', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='payments',
                    to='core.tenantsubscription',
                )),
                ('amount', models.DecimalField(decimal_places=2, max_digits=12)),
                ('currency', models.CharField(default='MXN', max_length=3)),
                ('period_label', models.CharField(
                    blank=True, default='', max_length=100,
                    help_text='Billing period covered, e.g. "Enero 2025"',
                )),
                ('payment_date', models.DateField()),
                ('payment_method', models.CharField(
                    choices=[
                        ('transfer', 'Transferencia Bancaria'),
                        ('cash', 'Efectivo'),
                        ('card', 'Tarjeta'),
                        ('other', 'Otro'),
                    ],
                    default='transfer', max_length=15,
                )),
                ('reference', models.CharField(
                    blank=True, default='', max_length=200,
                    help_text='Transaction ID, check number, etc.',
                )),
                ('notes', models.TextField(blank=True, default='')),
                ('recorded_by', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='recorded_payments',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={
                'db_table': 'subscription_payments',
                'ordering': ['-payment_date', '-created_at'],
            },
        ),
    ]
