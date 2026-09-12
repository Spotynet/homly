from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0067_assembly_acta_body'),
    ]

    operations = [
        migrations.AlterField(
            model_name='condoassemblyagendaitem',
            name='notes',
            field=models.TextField(blank=True, default='', help_text='Notas de minuta de este punto.'),
        ),
        migrations.AddField(
            model_name='condoassemblyagendaitem',
            name='vote_detail',
            field=models.JSONField(blank=True, default=list),
        ),
    ]
