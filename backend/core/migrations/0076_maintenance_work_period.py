from django.db import migrations, models


def backfill_periods(apps, schema_editor):
    Work = apps.get_model('core', 'CondoMaintenanceWork')
    for work in Work.objects.all().iterator():
        day = work.performed_date or work.scheduled_date
        if day:
            period = f'{day.year:04d}-{day.month:02d}'
        elif work.created_at:
            dt = work.created_at
            period = f'{dt.year:04d}-{dt.month:02d}'
        else:
            period = '2024-01'
        if work.period != period:
            work.period = period
            work.save(update_fields=['period'])


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0075_gasto_maintenance_work'),
    ]

    operations = [
        migrations.AddField(
            model_name='condomaintenancework',
            name='period',
            field=models.CharField(db_index=True, default='', help_text='Periodo del sistema YYYY-MM', max_length=7),
        ),
        migrations.AddIndex(
            model_name='condomaintenancework',
            index=models.Index(fields=['tenant', 'period'], name='condo_maint_tenant__period_idx'),
        ),
        migrations.RunPython(backfill_periods, migrations.RunPython.noop),
    ]
