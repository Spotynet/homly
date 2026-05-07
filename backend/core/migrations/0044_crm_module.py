"""
Migration 0044: CRM Module
Creates CRM tables for commercial management:
  - crm_contacts
  - crm_opportunities
  - crm_activities
  - crm_campaigns
  - crm_campaign_contacts
  - crm_tickets
"""
import uuid
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0043_cajachicaentry_evidence'),
    ]

    operations = [

        # ── CRMContact ────────────────────────────────────────────────────────
        migrations.CreateModel(
            name='CRMContact',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('first_name', models.CharField(max_length=200)),
                ('last_name', models.CharField(blank=True, default='', max_length=200)),
                ('email', models.EmailField(db_index=True)),
                ('phone', models.CharField(blank=True, default='', max_length=50)),
                ('company', models.CharField(blank=True, default='', help_text='Nombre del condominio / empresa', max_length=300)),
                ('cargo', models.CharField(blank=True, default='', max_length=200)),
                ('country', models.CharField(blank=True, default='', max_length=100)),
                ('state', models.CharField(blank=True, default='', max_length=100)),
                ('city', models.CharField(blank=True, default='', max_length=200)),
                ('units_count', models.PositiveIntegerField(default=0, help_text='Número de unidades del condominio')),
                ('source', models.CharField(
                    choices=[
                        ('landing_form', 'Formulario Landing Page'),
                        ('manual', 'Ingreso Manual'),
                        ('referral', 'Referido'),
                        ('import', 'Importación'),
                        ('cold_outreach', 'Prospección Directa'),
                        ('social_media', 'Redes Sociales'),
                        ('event', 'Evento / Expo'),
                        ('other', 'Otro'),
                    ],
                    db_index=True, default='manual', max_length=20,
                )),
                ('status', models.CharField(
                    choices=[
                        ('lead', 'Lead'), ('prospect', 'Prospecto'),
                        ('qualified', 'Calificado'), ('customer', 'Cliente Activo'),
                        ('churned', 'Cliente Perdido'), ('lost', 'Perdido'),
                    ],
                    db_index=True, default='lead', max_length=20,
                )),
                ('lead_score', models.PositiveSmallIntegerField(default=0, help_text='Score 0-100 de calidad del lead')),
                ('tags', models.JSONField(blank=True, default=list)),
                ('notes', models.TextField(blank=True, default='')),
                ('last_activity_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('condominio_request', models.OneToOneField(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='crm_contact', to='core.condominioRequest',
                )),
                ('tenant', models.OneToOneField(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='crm_contact', to='core.tenant',
                )),
                ('assigned_to', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='crm_contacts_assigned', to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={'db_table': 'crm_contacts', 'ordering': ['-created_at']},
        ),

        # ── CRMOpportunity ────────────────────────────────────────────────────
        migrations.CreateModel(
            name='CRMOpportunity',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('title', models.CharField(max_length=300)),
                ('stage', models.CharField(
                    choices=[
                        ('new', 'Nuevo'), ('contacted', 'Contactado'), ('qualified', 'Calificado'),
                        ('demo', 'Demo / Presentación'), ('proposal', 'Propuesta Enviada'),
                        ('negotiation', 'Negociación'), ('won', 'Ganado'), ('lost', 'Perdido'),
                    ],
                    db_index=True, default='new', max_length=20,
                )),
                ('stage_order', models.PositiveSmallIntegerField(default=0, help_text='Ordering within the stage column')),
                ('value', models.DecimalField(decimal_places=2, default=0, max_digits=14)),
                ('currency', models.CharField(
                    choices=[('MXN', 'Peso Mexicano'), ('USD', 'US Dollar'), ('EUR', 'Euro'), ('COP', 'Peso Colombiano')],
                    default='MXN', max_length=3,
                )),
                ('probability', models.PositiveSmallIntegerField(default=50, help_text='Probabilidad de cierre 0-100%')),
                ('expected_close', models.DateField(blank=True, null=True)),
                ('actual_close', models.DateField(blank=True, null=True)),
                ('won_at', models.DateTimeField(blank=True, null=True)),
                ('lost_at', models.DateTimeField(blank=True, null=True)),
                ('lost_reason', models.TextField(blank=True, default='')),
                ('notes', models.TextField(blank=True, default='')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('contact', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='opportunities', to='core.crmcontact',
                )),
                ('assigned_to', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='crm_opportunities_assigned', to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={'db_table': 'crm_opportunities', 'ordering': ['stage_order', '-created_at']},
        ),

        # ── CRMActivity ───────────────────────────────────────────────────────
        migrations.CreateModel(
            name='CRMActivity',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('type', models.CharField(
                    choices=[
                        ('call', 'Llamada'), ('email', 'Email'), ('whatsapp', 'WhatsApp'),
                        ('meeting', 'Reunión'), ('demo', 'Demo'), ('note', 'Nota Interna'),
                        ('task', 'Tarea'), ('follow_up', 'Seguimiento'),
                    ],
                    default='note', max_length=20,
                )),
                ('title', models.CharField(max_length=300)),
                ('description', models.TextField(blank=True, default='')),
                ('outcome', models.TextField(blank=True, default='', help_text='Result / next step from this activity')),
                ('scheduled_at', models.DateTimeField(blank=True, null=True)),
                ('completed_at', models.DateTimeField(blank=True, null=True)),
                ('is_completed', models.BooleanField(default=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('contact', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='activities', to='core.crmcontact',
                )),
                ('opportunity', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='activities', to='core.crmopportunity',
                )),
                ('created_by', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='crm_activities_created', to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={'db_table': 'crm_activities', 'ordering': ['-created_at']},
        ),

        # ── CRMCampaign ───────────────────────────────────────────────────────
        migrations.CreateModel(
            name='CRMCampaign',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('name', models.CharField(max_length=300)),
                ('type', models.CharField(
                    choices=[
                        ('email', 'Email Marketing'), ('whatsapp', 'WhatsApp Masivo'),
                        ('sms', 'SMS'), ('social', 'Redes Sociales'),
                    ],
                    default='email', max_length=20,
                )),
                ('status', models.CharField(
                    choices=[
                        ('draft', 'Borrador'), ('scheduled', 'Programada'), ('active', 'Activa'),
                        ('paused', 'Pausada'), ('completed', 'Completada'), ('cancelled', 'Cancelada'),
                    ],
                    db_index=True, default='draft', max_length=20,
                )),
                ('subject', models.CharField(blank=True, default='', help_text='Email subject line', max_length=300)),
                ('body_text', models.TextField(blank=True, default='')),
                ('body_html', models.TextField(blank=True, default='')),
                ('target_filters', models.JSONField(blank=True, default=dict, help_text='Audience filter criteria')),
                ('scheduled_at', models.DateTimeField(blank=True, null=True)),
                ('sent_at', models.DateTimeField(blank=True, null=True)),
                ('stats', models.JSONField(blank=True, default=dict, help_text='{sent, opened, clicked, converted, bounced}')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('created_by', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='crm_campaigns_created', to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={'db_table': 'crm_campaigns', 'ordering': ['-created_at']},
        ),

        # ── CRMCampaignContact ────────────────────────────────────────────────
        migrations.CreateModel(
            name='CRMCampaignContact',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('delivery_status', models.CharField(
                    choices=[
                        ('pending', 'Pendiente'), ('sent', 'Enviado'), ('opened', 'Abierto'),
                        ('clicked', 'Clic'), ('converted', 'Convertido'),
                        ('bounced', 'Rebotado'), ('unsubscribed', 'Desuscrito'),
                    ],
                    default='pending', max_length=20,
                )),
                ('sent_at', models.DateTimeField(blank=True, null=True)),
                ('opened_at', models.DateTimeField(blank=True, null=True)),
                ('clicked_at', models.DateTimeField(blank=True, null=True)),
                ('converted_at', models.DateTimeField(blank=True, null=True)),
                ('campaign', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='recipients', to='core.crmcampaign',
                )),
                ('contact', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='campaign_entries', to='core.crmcontact',
                )),
            ],
            options={'db_table': 'crm_campaign_contacts', 'ordering': ['-sent_at']},
        ),
        migrations.AddConstraint(
            model_name='crmcampaigncontact',
            constraint=models.UniqueConstraint(fields=['campaign', 'contact'], name='unique_campaign_contact'),
        ),

        # ── CRMTicket ─────────────────────────────────────────────────────────
        migrations.CreateModel(
            name='CRMTicket',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('subject', models.CharField(max_length=400)),
                ('description', models.TextField(blank=True, default='')),
                ('type', models.CharField(
                    choices=[
                        ('support', 'Soporte Técnico'), ('billing', 'Facturación / Cobro'),
                        ('onboarding', 'Onboarding'), ('feature_request', 'Solicitud de Función'),
                        ('complaint', 'Reclamo'), ('other', 'Otro'),
                    ],
                    default='support', max_length=20,
                )),
                ('priority', models.CharField(
                    choices=[('low', 'Baja'), ('normal', 'Normal'), ('high', 'Alta'), ('urgent', 'Urgente')],
                    db_index=True, default='normal', max_length=10,
                )),
                ('status', models.CharField(
                    choices=[
                        ('open', 'Abierto'), ('in_progress', 'En Progreso'),
                        ('waiting', 'Esperando Cliente'), ('resolved', 'Resuelto'), ('closed', 'Cerrado'),
                    ],
                    db_index=True, default='open', max_length=20,
                )),
                ('tags', models.JSONField(blank=True, default=list)),
                ('resolution_notes', models.TextField(blank=True, default='')),
                ('first_response_at', models.DateTimeField(blank=True, null=True)),
                ('resolved_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('contact', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='tickets', to='core.crmcontact',
                )),
                ('tenant', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='crm_tickets', to='core.tenant',
                )),
                ('assigned_to', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='crm_tickets_assigned', to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={'db_table': 'crm_tickets', 'ordering': ['-created_at']},
        ),
    ]
