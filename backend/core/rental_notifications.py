"""Avisos por correo (y en app) del espacio Homly Rentas.

Reutiliza la plantilla branded de `send_notification_email` (logo, crema, coral).
El equipo del tenant recibe Notification + mail; inquilinos, propietarios y
leads reciben solo el correo (no tienen usuario Homly).
"""
from __future__ import annotations

import threading
from decimal import Decimal

from .email_service import send_notification_email
from .models import RentalLead, RentalPayment

STAFF_ROLES = ('admin', 'tesorero', 'contador', 'auditor')

STAGE_LABELS = dict(RentalLead.STAGE_CHOICES)
PAY_TYPE_LABELS = dict(RentalPayment.PAYMENT_TYPE_CHOICES)

STATUS_LABELS = {
    'disponible': 'Disponible',
    'ocupada': 'Ocupada',
    'reservada': 'Reservada',
    'mantenimiento': 'En mantenimiento',
    'inactiva': 'Inactiva',
    'borrador': 'Borrador',
    'activo': 'Activo',
    'por_vencer': 'Por vencer',
    'vencido': 'Vencido',
    'finalizado': 'Finalizado',
    'cancelado': 'Cancelado',
    'renovado': 'Renovado',
}


def _money(amount) -> str:
    try:
        n = float(amount or 0)
    except (TypeError, ValueError):
        n = 0.0
    return f'${n:,.2f}'


def _date(value) -> str:
    if not value:
        return '—'
    if hasattr(value, 'strftime'):
        return value.strftime('%d/%m/%Y')
    return str(value)[:10]


def _party_name(party) -> str:
    if not party:
        return '—'
    return (party.full_name or '').strip() or '—'


def _party_email(party):
    if not party:
        return ''
    return (party.email or '').strip()


def _prop_label(prop) -> str:
    if not prop:
        return '—'
    code = (prop.code or '').strip()
    name = (prop.name or '').strip()
    if code and name and code != name:
        return f'{code} · {name}'
    return code or name or '—'


def _workspace_label():
    return 'Inmobiliaria'


def notify_rental_staff(tenant, notif_type, title, message=''):
    """In-app + mail al equipo del espacio de rentas."""
    from .views import _notify_roles
    _notify_roles(tenant.id, list(STAFF_ROLES), notif_type, title, message)


def email_contacts(tenant, contacts, notif_type, title, message, details=None):
    """Mail a contactos externos (inquilino, propietario, lead)."""
    seen = set()
    recipients = []
    for email, name in contacts or []:
        e = (email or '').strip().lower()
        if not e or e in seen:
            continue
        seen.add(e)
        recipients.append((e, (name or '').strip() or e.split('@')[0]))
    if not recipients:
        return
    tenant_name = getattr(tenant, 'name', '') or ''

    def _send_all():
        for email, user_name in recipients:
            send_notification_email(
                email=email,
                user_name=user_name,
                notif_type=notif_type,
                title=title,
                message=message,
                tenant_name=tenant_name,
                workspace_label=_workspace_label(),
                details=details,
            )
    threading.Thread(target=_send_all, daemon=True).start()


def _owner_contact(prop):
    if not prop:
        return []
    email = (prop.owner_email or '').strip()
    if not email:
        return []
    return [(email, prop.owner_name or 'Propietario')]


def _inquilino_contact(contract):
    party = getattr(contract, 'tenant_party', None)
    email = _party_email(party)
    if not email:
        return []
    return [(email, _party_name(party))]


# ── Propiedades ────────────────────────────────────────────────────────────

def on_property_created(prop):
    tenant = prop.tenant
    title = f'Propiedad {prop.code}'
    message = (
        f'Se dio de alta {prop.name} ({prop.get_property_type_display()}) '
        f'en {prop.city or "sin ciudad"}. Estado: {STATUS_LABELS.get(prop.status, prop.status)}.'
    )
    notify_rental_staff(tenant, 'rental_property_created', title, message)
    email_contacts(
        tenant, _owner_contact(prop), 'rental_property_created', title,
        f'Tu inmueble {prop.name} quedó registrado en Homly Rentas con el código {prop.code}.',
        details=[
            ('Código', prop.code),
            ('Inmueble', prop.name),
            ('Estado', STATUS_LABELS.get(prop.status, prop.status)),
            ('Renta sugerida', _money(prop.suggested_rent)),
        ],
    )


def on_property_status_changed(prop, old_status):
    if old_status == prop.status:
        return
    tenant = prop.tenant
    title = f'{prop.code}: {STATUS_LABELS.get(prop.status, prop.status)}'
    message = (
        f'{_prop_label(prop)} pasó de {STATUS_LABELS.get(old_status, old_status)} '
        f'a {STATUS_LABELS.get(prop.status, prop.status)}.'
    )
    notify_rental_staff(tenant, 'rental_property_status', title, message)
    email_contacts(
        tenant, _owner_contact(prop), 'rental_property_status', title, message,
        details=[
            ('Inmueble', _prop_label(prop)),
            ('Estado anterior', STATUS_LABELS.get(old_status, old_status)),
            ('Estado actual', STATUS_LABELS.get(prop.status, prop.status)),
        ],
    )


# ── Contratos ──────────────────────────────────────────────────────────────

def _contract_details(contract):
    return [
        ('Contrato', contract.code),
        ('Inmueble', _prop_label(contract.property)),
        ('Inquilino', _party_name(contract.tenant_party)),
        ('Vigencia', f'{_date(contract.start_date)} — {_date(contract.end_date)}'),
        ('Renta', _money(contract.rent_amount)),
        ('Estado', STATUS_LABELS.get(contract.status, contract.status)),
    ]


def _reload_contract(contract):
    from .models import RentalContract
    return RentalContract.objects.select_related(
        'property', 'tenant_party', 'tenant',
    ).get(pk=contract.pk)


def on_contract_created(contract):
    contract = _reload_contract(contract)
    tenant = contract.tenant
    title = f'Contrato {contract.code}'
    message = (
        f'Se creó el contrato {contract.code} de {_prop_label(contract.property)} '
        f'con {_party_name(contract.tenant_party)}. '
        f'Estado: {STATUS_LABELS.get(contract.status, contract.status)}.'
    )
    notify_rental_staff(tenant, 'rental_contract_created', title, message)
    email_contacts(
        tenant, _inquilino_contact(contract) + _owner_contact(contract.property),
        'rental_contract_created', title,
        f'Tu contrato {contract.code} quedó registrado en Homly Rentas.',
        details=_contract_details(contract),
    )


def on_contract_activated(contract):
    contract = _reload_contract(contract)
    tenant = contract.tenant
    title = f'Contrato {contract.code} activado'
    message = (
        f'El contrato {contract.code} de {_prop_label(contract.property)} '
        f'({_party_name(contract.tenant_party)}) ya está vigente.'
    )
    notify_rental_staff(tenant, 'rental_contract_activated', title, message)
    email_contacts(
        tenant, _inquilino_contact(contract) + _owner_contact(contract.property),
        'rental_contract_activated', title,
        'Tu contrato de renta quedó activo. A partir de ahora los cargos del período se generan en Homly.',
        details=_contract_details(contract),
    )


def on_contract_finished(contract, next_status):
    contract = _reload_contract(contract)
    tenant = contract.tenant
    label = STATUS_LABELS.get(next_status, next_status)
    title = f'Contrato {contract.code}: {label}'
    message = (
        f'El contrato {contract.code} de {_prop_label(contract.property)} '
        f'({_party_name(contract.tenant_party)}) quedó {label.lower()}.'
    )
    notify_rental_staff(tenant, 'rental_contract_finished', title, message)
    email_contacts(
        tenant, _inquilino_contact(contract) + _owner_contact(contract.property),
        'rental_contract_finished', title, message,
        details=_contract_details(contract),
    )


def on_contract_lifecycle(contract, old_status):
    if old_status == contract.status:
        return
    contract = _reload_contract(contract)
    tenant = contract.tenant
    if contract.status == 'por_vencer':
        ntype = 'rental_contract_expiring'
        title = f'{contract.code} por vencer'
        party_msg = (
            f'Tu contrato {contract.code} vence el {_date(contract.end_date)}. '
            'Habla con la inmobiliaria si quieres renovar.'
        )
    elif contract.status == 'vencido':
        ntype = 'rental_contract_expired'
        title = f'{contract.code} vencido'
        party_msg = (
            f'Tu contrato {contract.code} venció el {_date(contract.end_date)}. '
            'Contacta a la inmobiliaria para regularizar la ocupación.'
        )
    else:
        return
    message = (
        f'{contract.code} · {_prop_label(contract.property)} · {_party_name(contract.tenant_party)}. '
        f'Vence el {_date(contract.end_date)}.'
    )
    notify_rental_staff(tenant, ntype, title, message)
    email_contacts(
        tenant, _inquilino_contact(contract) + _owner_contact(contract.property),
        ntype, title, party_msg, details=_contract_details(contract),
    )


def refresh_contract_and_notify(contract):
    """Actualiza vigencia y avisa solo si el status cambió."""
    prev = contract.status
    if contract.refresh_lifecycle_status():
        on_contract_lifecycle(contract, prev)
        return True
    return False


# ── Cobranza ───────────────────────────────────────────────────────────────

def on_charges_generated(tenant, period, created, charges_by_contract):
    if created <= 0:
        return
    title = f'Cargos {period}'
    message = f'Se generaron {created} cargo{"s" if created != 1 else ""} del período {period}.'
    notify_rental_staff(tenant, 'rental_charge_generated', title, message)
    for contract, rows in (charges_by_contract or {}).items():
        if not rows:
            continue
        total = sum(Decimal(str(ch.amount or 0)) for ch in rows)
        lines = ', '.join(f'{ch.description} {_money(ch.amount)}' for ch in rows[:6])
        email_contacts(
            tenant, _inquilino_contact(contract),
            'rental_charge_generated',
            f'Tus cargos de {period}',
            f'Se cargaron {len(rows)} concepto{"s" if len(rows) != 1 else ""} de {period} '
            f'en el contrato {contract.code} ({_prop_label(contract.property)}). Total: {_money(total)}.',
            details=[
                ('Contrato', contract.code),
                ('Inmueble', _prop_label(contract.property)),
                ('Período', period),
                ('Conceptos', lines),
                ('Total', _money(total)),
                ('Vence', _date(rows[0].due_date)),
            ],
        )


def on_payment_registered(payment):
    tenant = payment.tenant
    contract = payment.contract
    charge = payment.charge
    concept = (charge.description if charge else 'Abono al contrato') or 'Pago'
    title = f'Pago {_money(payment.amount)}'
    message = (
        f'Se registró un pago de {_money(payment.amount)} en {contract.code} '
        f'({_prop_label(contract.property)}, {_party_name(contract.tenant_party)}) '
        f'por {concept}.'
    )
    notify_rental_staff(tenant, 'rental_payment_registered', title, message)
    email_contacts(
        tenant, _inquilino_contact(contract) + _owner_contact(contract.property),
        'rental_payment_registered', title,
        f'Registramos tu pago de {_money(payment.amount)} en Homly Rentas.',
        details=[
            ('Contrato', contract.code),
            ('Inmueble', _prop_label(contract.property)),
            ('Concepto', concept),
            ('Importe', _money(payment.amount)),
            ('Fecha', _date(payment.payment_date)),
            ('Forma de pago', PAY_TYPE_LABELS.get(payment.payment_type, payment.payment_type)),
            ('Referencia', payment.reference or '—'),
        ],
    )


def on_payment_deleted(payment):
    tenant = payment.tenant
    contract = payment.contract
    title = f'Pago eliminado {_money(payment.amount)}'
    message = (
        f'Se eliminó un pago de {_money(payment.amount)} del contrato {contract.code} '
        f'({_date(payment.payment_date)}).'
    )
    notify_rental_staff(tenant, 'rental_payment_deleted', title, message)
    email_contacts(
        tenant, _inquilino_contact(contract),
        'rental_payment_deleted', title, message,
        details=[
            ('Contrato', contract.code),
            ('Importe', _money(payment.amount)),
            ('Fecha del pago', _date(payment.payment_date)),
        ],
    )


# ── CRM ────────────────────────────────────────────────────────────────────

def on_lead_created(lead):
    tenant = lead.tenant
    title = f'Lead {lead.full_name}'
    unit = _prop_label(lead.rental_property) if lead.rental_property_id else 'sin unidad'
    message = f'{lead.full_name} se registró en el CRM ({unit}). Origen: {lead.get_source_display()}.'
    notify_rental_staff(tenant, 'rental_lead_created', title, message)
    if lead.email:
        email_contacts(
            tenant, [(lead.email, lead.full_name)],
            'rental_lead_created',
            'Recibimos tu interés',
            f'Hola {lead.first_name or lead.full_name}, la inmobiliaria {tenant.name} '
            f'registró tu solicitud de renta{" de " + unit if lead.rental_property_id else ""}. '
            'Pronto te contactan.',
            details=[
                ('Inmobiliaria', tenant.name),
                ('Unidad de interés', unit),
                ('Renta objetivo', _money(lead.interested_rent) if lead.interested_rent else '—'),
            ],
        )


def on_lead_moved(lead, old_stage):
    if old_stage == lead.stage:
        return
    tenant = lead.tenant
    new_label = STAGE_LABELS.get(lead.stage, lead.stage)
    old_label = STAGE_LABELS.get(old_stage, old_stage)
    unit = _prop_label(lead.rental_property) if lead.rental_property_id else 'sin unidad'
    if lead.stage == 'perdido':
        ntype = 'rental_lead_lost'
        title = f'{lead.full_name} perdido'
        message = f'{lead.full_name} ({unit}) pasó a Perdido. Motivo: {lead.lost_reason or "sin motivo"}.'
        notify_rental_staff(tenant, ntype, title, message)
        return
    ntype = 'rental_lead_moved'
    title = f'{lead.full_name}: {new_label}'
    message = f'{lead.full_name} ({unit}) pasó de {old_label} a {new_label}.'
    notify_rental_staff(tenant, ntype, title, message)
    if lead.email and lead.stage in ('visita', 'propuesta', 'negociacion'):
        party_copy = {
            'visita': 'Agendamos tu visita. La inmobiliaria te confirmará fecha y hora.',
            'propuesta': 'Hay una propuesta de renta para ti. Revisa el detalle con la inmobiliaria.',
            'negociacion': 'Seguimos en negociación de tu renta. Cualquier duda, responde a la inmobiliaria.',
        }[lead.stage]
        email_contacts(
            tenant, [(lead.email, lead.full_name)],
            ntype, f'Actualización de tu solicitud', party_copy,
            details=[
                ('Inmobiliaria', tenant.name),
                ('Unidad', unit),
                ('Etapa', new_label),
            ],
        )


def on_lead_converted(lead, contract, activated):
    tenant = lead.tenant
    contract = _reload_contract(contract)
    status_txt = 'activado' if activated else 'en borrador'
    title = f'{lead.full_name} → {contract.code}'
    message = (
        f'{lead.full_name} se convirtió en inquilino. '
        f'Contrato {contract.code} de {_prop_label(contract.property)} ({status_txt}).'
    )
    notify_rental_staff(tenant, 'rental_lead_converted', title, message)
    ntype = 'rental_contract_activated' if activated else 'rental_contract_created'
    party_title = f'Tu contrato {contract.code}' + (' está activo' if activated else ' quedó en borrador')
    party_msg = (
        f'La inmobiliaria {tenant.name} armó tu contrato {contract.code} '
        f'para {_prop_label(contract.property)}.'
        + (' Ya está vigente.' if activated else ' Quedó en borrador; te avisamos cuando se active.')
    )
    email_contacts(
        tenant, _inquilino_contact(contract),
        ntype, party_title, party_msg,
        details=_contract_details(contract),
    )


# ── Airbnb ─────────────────────────────────────────────────────────────────

def on_airbnb_imported(tenant, created_n, updated_n, error_n):
    title = 'Importación Airbnb'
    message = (
        f'Se importaron {created_n} anuncio{"s" if created_n != 1 else ""}, '
        f'{updated_n} actualizado{"s" if updated_n != 1 else ""}'
        + (f' y {error_n} con error.' if error_n else '.')
    )
    ntype = 'rental_airbnb_error' if error_n and created_n == 0 and updated_n == 0 else 'rental_airbnb_imported'
    notify_rental_staff(tenant, ntype, title, message)


def on_airbnb_sync_results(tenant, results, label=''):
    if not results:
        return
    errors = [r for r in results if not r.get('ok')]
    ok_n = len(results) - len(errors)
    where = f' ({label})' if label else ''
    if errors:
        first = errors[0].get('error') or 'Error de iCal'
        title = f'Error Airbnb{where}'
        message = (
            f'{len(errors)} de {len(results)} anuncios no se sincronizaron. '
            f'Ejemplo: {first}'
        )
        notify_rental_staff(tenant, 'rental_airbnb_error', title, message)
        return
    occupied = sum(1 for r in results if r.get('occupied_now'))
    title = f'Airbnb sincronizado{where}'
    message = (
        f'{ok_n} anuncio{"s" if ok_n != 1 else ""} al día. '
        f'{occupied} ocupado{"s" if occupied != 1 else ""} ahora.'
    )
    notify_rental_staff(tenant, 'rental_airbnb_synced', title, message)
