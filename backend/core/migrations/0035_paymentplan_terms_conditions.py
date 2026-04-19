from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0034_tenant_onboarding_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='paymentplan',
            name='terms_conditions',
            field=models.TextField(
                blank=True,
                default='',
                help_text='Políticas, condiciones y/o términos de la propuesta que el residente acepta al tomar el plan',
            ),
        ),
    ]
