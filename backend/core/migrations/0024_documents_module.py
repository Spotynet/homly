"""
Migration 0024 — Módulo de Documentos
Adds DocumentCategory and Document models.
"""
import django.db.models.deletion
import uuid
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0023_payment_folio'),
    ]

    operations = [
        migrations.CreateModel(
            name='DocumentCategory',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('name', models.CharField(max_length=120)),
                ('description', models.TextField(blank=True, default='')),
                ('icon', models.CharField(blank=True, default='📁', max_length=8)),
                ('color', models.CharField(blank=True, default='#0d7c6e', max_length=7)),
                ('order', models.IntegerField(default=0)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('tenant', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='document_categories',
                    to='core.tenant',
                )),
            ],
            options={'ordering': ['order', 'name']},
        ),
        migrations.CreateModel(
            name='Document',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('title', models.CharField(max_length=255)),
                ('description', models.TextField(blank=True, default='')),
                ('doc_type', models.CharField(
                    choices=[('file', 'Archivo subido'), ('richtext', 'Texto enriquecido')],
                    max_length=10,
                )),
                ('file_name', models.CharField(blank=True, default='', max_length=255)),
                ('file_mime', models.CharField(blank=True, default='', max_length=120)),
                ('file_data', models.TextField(blank=True, default='')),
                ('file_size', models.IntegerField(default=0)),
                ('content', models.TextField(blank=True, default='')),
                ('is_template', models.BooleanField(default=False)),
                ('permissions', models.JSONField(default=dict)),
                ('published', models.BooleanField(default=True)),
                ('created_by_name', models.CharField(blank=True, default='', max_length=120)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('tenant', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='documents',
                    to='core.tenant',
                )),
                ('category', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='documents',
                    to='core.documentcategory',
                )),
            ],
            options={'ordering': ['-created_at']},
        ),
    ]
