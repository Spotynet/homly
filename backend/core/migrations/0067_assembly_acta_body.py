from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0066_assembly_agenda_source_links'),
    ]

    operations = [
        migrations.AddField(
            model_name='condoassembly',
            name='acta_body',
            field=models.TextField(
                blank=True,
                default='',
                help_text='Acta formal de la asamblea, para firma y protocolización.',
            ),
        ),
        migrations.AlterField(
            model_name='condoassembly',
            name='minute_body',
            field=models.TextField(
                blank=True,
                default='',
                help_text='Minuta de trabajo: notas del secretario durante la sesión.',
            ),
        ),
    ]
