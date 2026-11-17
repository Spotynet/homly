import uuid
from django.db import migrations, models


DEFAULTS = {
    'condominio': dict(label='Administración de condominios', short_label='Condominio',
                       description='Cuotas, gastos, reservas, asambleas y comunicación para comunidades.',
                       unit_noun='unidad', color='#0f766e', sort_order=0),
    'rentas': dict(label='Administrar Propiedades', short_label='Propiedades',
                   description='Inmuebles en renta: contratos, cobranza, mantenimiento (CAFM/CMMS) y rent roll.',
                   unit_noun='propiedad', color='#1d4ed8', sort_order=1),
}


def seed(apps, schema_editor):
    WorkspaceConfig = apps.get_model('core', 'WorkspaceConfig')
    for ws, d in DEFAULTS.items():
        WorkspaceConfig.objects.get_or_create(workspace_type=ws, defaults=d)


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0087_rentas_guias_module'),
    ]

    operations = [
        migrations.CreateModel(
            name='WorkspaceConfig',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('workspace_type', models.CharField(max_length=20, unique=True)),
                ('label', models.CharField(max_length=80)),
                ('short_label', models.CharField(blank=True, default='', max_length=40)),
                ('description', models.CharField(blank=True, default='', max_length=240)),
                ('unit_noun', models.CharField(default='unidad', max_length=30)),
                ('color', models.CharField(default='#0f766e', max_length=9)),
                ('is_enabled', models.BooleanField(default=True)),
                ('sort_order', models.PositiveIntegerField(default=0)),
                ('module_overrides', models.JSONField(blank=True, default=dict)),
                ('module_bundles', models.JSONField(blank=True, default=list)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={'db_table': 'workspace_configs', 'ordering': ['sort_order', 'workspace_type']},
        ),
        migrations.RunPython(seed, migrations.RunPython.noop),
    ]
