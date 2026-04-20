"""
Migration 0036: Add SubscriptionPlan, TenantSubscription models
and extend CondominioRequest with subscription/trial tracking fields.
"""
import uuid
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0035_paymentplan_terms_conditions'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        # ── 1. Create SubscriptionPlan ─────────────────────────────────────
        migrations.CreateModel(
            name='SubscriptionPlan',
            fields=[
                ('id', models.UUIDField(
                    default=uuid.uuid4, editable=False, primary_key=True, serialize=False,
                )),
                ('name', models.CharField(max_length=100)),
                ('description', models.TextField(blank=True, default='')),
                ('price_per_unit', models.DecimalField(decimal_places=2, default=0, max_digits=10)),
                ('currency', models.CharField(
                    choices=[
                        ('MXN', 'Peso Mexicano'),
                        ('USD', 'US Dollar'),
                        ('EUR', 'Euro'),
                        ('COP', 'Peso Colombiano'),
                    ],
                    default='MXN', max_length=3,
                )),
                ('billing_cycle', models.CharField(
                    choices=[('monthly', 'Mensual'), ('annual', 'Anual')],
                    default='monthly', max_length=10,
                )),
                ('trial_days', models.PositiveIntegerField(default=7)),
                ('volume_tiers', models.JSONField(blank=True, default=list)),
                ('features', models.JSONField(blank=True, default=list)),
                ('is_active', models.BooleanField(db_index=True, default=True)),
                ('sort_order', models.PositiveIntegerField(default=0)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'db_table': 'subscription_plans',
                'ordering': ['sort_order', 'name'],
            },
        ),

        # ── 2. Create TenantSubscription ───────────────────────────────────
        migrations.CreateModel(
            name='TenantSubscription',
            fields=[
                ('id', models.UUIDField(
                    default=uuid.uuid4, editable=False, primary_key=True, serialize=False,
                )),
                ('tenant', models.OneToOneField(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='subscription',
                    to='core.tenant',
                )),
                ('plan', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='subscriptions',
                    to='core.subscriptionplan',
                )),
                ('status', models.CharField(
                    choices=[
                        ('trial', 'Período de Prueba'),
                        ('active', 'Activa'),
                        ('past_due', 'Vencida'),
                        ('cancelled', 'Cancelada'),
                        ('expired', 'Expirada'),
                    ],
                    db_index=True, default='trial', max_length=12,
                )),
                ('trial_start', models.DateField(blank=True, null=True)),
                ('trial_end', models.DateField(blank=True, null=True)),
                ('billing_start', models.DateField(blank=True, null=True)),
                ('units_count', models.PositiveIntegerField(default=0)),
                ('amount_per_cycle', models.DecimalField(decimal_places=2, default=0, max_digits=10)),
                ('currency', models.CharField(default='MXN', max_length=3)),
                ('next_billing_date', models.DateField(blank=True, null=True)),
                ('notes', models.TextField(blank=True, default='')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'db_table': 'tenant_subscriptions',
                'ordering': ['-created_at'],
            },
        ),

        # ── 3. Extend CondominioRequest ────────────────────────────────────
        migrations.AddField(
            model_name='condominioRequest',
            name='subscription_plan',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='trial_requests',
                to='core.subscriptionplan',
            ),
        ),
        migrations.AddField(
            model_name='condominioRequest',
            name='trial_days',
            field=models.PositiveIntegerField(default=7),
        ),
        migrations.AddField(
            model_name='condominioRequest',
            name='approved_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='condominioRequest',
            name='approved_by',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='approved_trial_requests',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name='condominioRequest',
            name='rejected_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='condominioRequest',
            name='rejection_reason',
            field=models.TextField(blank=True, default=''),
        ),
        migrations.AddField(
            model_name='condominioRequest',
            name='tenant',
            field=models.OneToOneField(
                blank=True, null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='trial_request',
                to='core.tenant',
            ),
        ),
        migrations.AddField(
            model_name='condominioRequest',
            name='admin_notes',
            field=models.TextField(blank=True, default=''),
        ),
    ]
