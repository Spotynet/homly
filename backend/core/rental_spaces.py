"""Subniveles (espacios) de las propiedades Multi Tenant.

Una propiedad ``multi`` se divide en espacios (locales, oficinas, bays, habitaciones, espacios
temporales…). Cada espacio puede tener un contrato de renta (``RentalContract.space``) y de ahí
sale su inquilino, su renta y su estado de ocupación.
"""
from __future__ import annotations

from decimal import Decimal

from .models import RentalContract, RentalSpace
from .rental_mode import LEASE_KINDS

NOT_LIVE = ('cancelado', 'finalizado', 'renovado')   # contratos que ya no cuentan
DRAFT = 'borrador'


def live_contracts(space):
    """Contratos de renta que ocupan (o reservan) el espacio."""
    return [
        c for c in RentalContract.objects.filter(space=space, kind__in=LEASE_KINDS)
        .exclude(status__in=NOT_LIVE).select_related('tenant_party').order_by('-start_date')
    ]


def sync_space(space):
    """Estado del espacio según sus contratos (no toca mantenimiento / inactivo)."""
    if space.status not in ('disponible', 'ocupado', 'reservado'):
        return space
    cs = live_contracts(space)
    if any(c.status != DRAFT for c in cs):
        new = 'ocupado'
    elif cs:
        new = 'reservado'
    else:
        new = 'disponible'
    if new != space.status:
        space.status = new
        space.save(update_fields=['status', 'updated_at'])
    return space


def leaf_leasable(spaces):
    """Espacios rentables que no contienen otros (evita contar dos veces pisos y sus oficinas)."""
    spaces = [s for s in spaces if s.is_active and s.is_leasable and s.status != 'inactivo']
    parents = {s.parent_id for s in spaces if s.parent_id}
    return [s for s in spaces if s.id not in parents]


def gla_stats(prop, spaces=None):
    """GLA total / ocupado / vacante de una propiedad Multi Tenant."""
    spaces = list(spaces if spaces is not None else prop.spaces.all())
    leaves = leaf_leasable(spaces)
    spaces_gla = sum((s.area_m2 or Decimal('0') for s in leaves), Decimal('0'))
    occupied = sum((s.area_m2 or Decimal('0') for s in leaves if s.status == 'ocupado'), Decimal('0'))
    declared = prop.gla_sqm or Decimal('0')
    total = declared if declared > 0 else spaces_gla
    return {
        'spaces_count': len([s for s in spaces if s.is_active]),
        'leasable_count': len(leaves),
        'occupied_count': len([s for s in leaves if s.status == 'ocupado']),
        'spaces_gla': float(spaces_gla),
        'gla_total': float(total),
        'gla_occupied': float(occupied),
        'gla_vacant': float(max(Decimal('0'), total - occupied)),
        'gla_unassigned': float(max(Decimal('0'), declared - spaces_gla)) if declared > 0 else 0.0,
        'gla_occupancy_pct': round(float(occupied / total) * 100, 1) if total > 0 else 0.0,
    }


def sync_property_spaces(prop):
    """Sincroniza todos los espacios de la propiedad y su estado general."""
    spaces = list(prop.spaces.all())
    for s in spaces:
        sync_space(s)
    leaves = leaf_leasable(spaces)
    if prop.status in ('disponible', 'ocupada', 'reservada'):
        new = 'ocupada' if leaves and all(s.status == 'ocupado' for s in leaves) else 'disponible'
        if new != prop.status:
            prop.status = new
            prop.save(update_fields=['status', 'updated_at'])


def clean_contacts(value):
    out = []
    for c in (value if isinstance(value, list) else [])[:20]:
        if not isinstance(c, dict):
            continue
        item = {k: str(c.get(k) or '').strip()[:160] for k in ('name', 'role', 'email', 'phone')}
        if any(item.values()):
            out.append(item)
    return out


def check_space(tenant, prop, space):
    """Valida que el espacio pertenezca al tenant y a la propiedad elegida (para órdenes, solicitudes, activos…)."""
    from rest_framework.exceptions import ValidationError
    if space is None:
        return
    if space.tenant_id != tenant.id or (prop is not None and space.property_id != prop.id):
        raise ValidationError({'space': 'El espacio debe pertenecer a la propiedad seleccionada.'})


def inherit_space(vd, asset=None):
    """Si no se indicó espacio pero el activo está en uno, la orden / solicitud lo hereda."""
    if vd.get('space') is None and 'space' not in vd and asset is not None and getattr(asset, 'space_id', None):
        return {'space': asset.space}
    return {}


def resolve_property_space(tenant, prop, space):
    """Para finanzas (propiedad opcional): valida el espacio y, si no hay propiedad, usa la del espacio."""
    from rest_framework.exceptions import ValidationError
    if space is None:
        return prop
    if space.tenant_id != tenant.id:
        raise ValidationError({'space': 'El espacio no pertenece a este espacio de trabajo.'})
    if prop is None:
        return space.property
    if space.property_id != prop.id:
        raise ValidationError({'space': 'El espacio debe pertenecer a la propiedad seleccionada.'})
    return prop
