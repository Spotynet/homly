# Generated manually for Rita ↔ BankStatement link
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0100_rita_bank_session'),
    ]

    operations = [
        migrations.AddField(
            model_name='ritabanksession',
            name='bank_statement',
            field=models.ForeignKey(
                blank=True,
                help_text='Estado bancario canónico del período (Estado General).',
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='rita_sessions',
                to='core.bankstatement',
            ),
        ),
    ]
