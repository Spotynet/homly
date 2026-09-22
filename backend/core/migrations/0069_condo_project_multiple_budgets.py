from django.db import migrations, models


def copy_fk_to_m2m(apps, schema_editor):
    CondoProject = apps.get_model('core', 'CondoProject')
    Through = CondoProject.budgets.through
    rows = [
        Through(condoproject_id=pid, condobudget_id=bid)
        for pid, bid in CondoProject.objects.exclude(budget_id__isnull=True).values_list('id', 'budget_id')
    ]
    if rows:
        Through.objects.bulk_create(rows, ignore_conflicts=True)


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0068_agenda_item_notes_vote_detail'),
    ]

    operations = [
        migrations.AddField(
            model_name='condoproject',
            name='budgets',
            field=models.ManyToManyField(
                blank=True,
                help_text='Presupuestos anuales donde está incluida la partida del proyecto.',
                related_name='linked_projects_m2m',
                to='core.condobudget',
            ),
        ),
        migrations.RunPython(copy_fk_to_m2m, migrations.RunPython.noop),
        migrations.RemoveField(
            model_name='condoproject',
            name='budget',
        ),
        migrations.AlterField(
            model_name='condoproject',
            name='budgets',
            field=models.ManyToManyField(
                blank=True,
                help_text='Presupuestos anuales donde está incluida la partida del proyecto.',
                related_name='linked_projects',
                to='core.condobudget',
            ),
        ),
    ]
