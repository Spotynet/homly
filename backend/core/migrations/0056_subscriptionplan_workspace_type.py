from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0055_tenant_workspace_type_and_rentals'),
    ]

    operations = [
        migrations.AddField(
            model_name='subscriptionplan',
            name='workspace_type',
            field=models.CharField(
                choices=[
                    ('condominio', 'Administración de condominios'),
                    ('rentas', 'Gestión de rentas'),
                ],
                db_index=True,
                default='condominio',
                help_text='Catálogo de planes independiente por espacio de trabajo.',
                max_length=20,
            ),
        ),
    ]
