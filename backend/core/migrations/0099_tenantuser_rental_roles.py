from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0098_condominiorequest_propiedades_tipo_admin'),
    ]

    operations = [
        migrations.AlterField(
            model_name='tenantuser',
            name='role',
            field=models.CharField(
                db_index=True, max_length=20,
                choices=[
                    ('admin', 'Administrador'),
                    ('tesorero', 'Tesorero'),
                    ('contador', 'Contador'),
                    ('auditor', 'Auditor'),
                    ('vecino', 'Residente'),
                    ('vigilante', 'Vigilante'),
                    ('gerente', 'Gerente de propiedades'),
                    ('comercial', 'Ejecutivo comercial'),
                    ('mantenimiento', 'Coordinador de mantenimiento'),
                    ('tecnico', 'Técnico de campo'),
                ],
            ),
        ),
    ]
