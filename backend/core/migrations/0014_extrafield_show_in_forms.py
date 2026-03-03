from django.db import migrations, models


class Migration(migrations.Migration):
    """Add show_in_normal, show_in_additional, show_in_gastos to ExtraField.
    These flags control in which capture forms each field is visible,
    independently of field_type which keeps its semantic meaning."""

    dependencies = [
        ('core', '0013_extrafield_adelanto_type'),
    ]

    operations = [
        migrations.AddField(
            model_name='extrafield',
            name='show_in_normal',
            field=models.BooleanField(
                default=True,
                help_text='Show in regular monthly payment capture',
            ),
        ),
        migrations.AddField(
            model_name='extrafield',
            name='show_in_additional',
            field=models.BooleanField(
                default=True,
                help_text='Show in additional payments capture',
            ),
        ),
        migrations.AddField(
            model_name='extrafield',
            name='show_in_gastos',
            field=models.BooleanField(
                default=True,
                help_text='Show in gastos (expenses) form',
            ),
        ),
    ]
