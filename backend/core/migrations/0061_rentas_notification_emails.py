from django.db import migrations, models


def add_rentas_notificaciones_module(apps, schema_editor):
    SubscriptionPlan = apps.get_model('core', 'SubscriptionPlan')
    for plan in SubscriptionPlan.objects.filter(workspace_type='rentas'):
        mods = list(plan.allowed_modules or [])
        if mods and 'notificaciones' not in mods:
            mods.append('notificaciones')
            plan.allowed_modules = mods
            plan.save(update_fields=['allowed_modules'])


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0060_planeacion_presupuesto_proyectos'),
    ]

    operations = [
        migrations.AlterField(
            model_name='notification',
            name='notif_type',
            field=models.CharField(
                choices=[
                    ('reservation_new', 'Nueva Reserva Solicitada'),
                    ('reservation_approved', 'Reserva Aprobada'),
                    ('reservation_rejected', 'Reserva Rechazada'),
                    ('reservation_cancelled', 'Reserva Cancelada'),
                    ('payment_registered', 'Pago Registrado'),
                    ('payment_updated', 'Pago Actualizado'),
                    ('payment_deleted', 'Cobro Eliminado'),
                    ('period_closed', 'Período Cerrado'),
                    ('period_reopened', 'Período Reabierto'),
                    ('plan_proposal_sent', 'Propuesta de Plan de Pagos Enviada'),
                    ('plan_accepted', 'Plan de Pagos Aceptado'),
                    ('plan_rejected', 'Plan de Pagos Rechazado'),
                    ('plan_cancelled', 'Plan de Pagos Cancelado'),
                    ('rental_property_created', 'Propiedad registrada'),
                    ('rental_property_status', 'Estado de propiedad'),
                    ('rental_contract_created', 'Contrato creado'),
                    ('rental_contract_activated', 'Contrato activado'),
                    ('rental_contract_finished', 'Contrato cerrado'),
                    ('rental_contract_expiring', 'Contrato por vencer'),
                    ('rental_contract_expired', 'Contrato vencido'),
                    ('rental_charge_generated', 'Cargos del período'),
                    ('rental_payment_registered', 'Pago de renta'),
                    ('rental_payment_deleted', 'Pago de renta eliminado'),
                    ('rental_lead_created', 'Nuevo lead'),
                    ('rental_lead_moved', 'Lead actualizado'),
                    ('rental_lead_converted', 'Lead convertido'),
                    ('rental_lead_lost', 'Lead perdido'),
                    ('rental_airbnb_imported', 'Airbnb importado'),
                    ('rental_airbnb_synced', 'Airbnb sincronizado'),
                    ('rental_airbnb_error', 'Error de Airbnb'),
                    ('general', 'Información General'),
                ],
                db_index=True,
                default='general',
                max_length=40,
            ),
        ),
        migrations.RunPython(add_rentas_notificaciones_module, migrations.RunPython.noop),
    ]
