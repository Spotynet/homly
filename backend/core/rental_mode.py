"""Modo de operación del espacio Administrar Propiedades.

Una propiedad puede operarse (mantenimiento, activos, inspecciones, CAPEX/OPEX) sin contrato de
renta. Cada tenant decide si administra rentas y cuáles de los módulos relacionados con la renta
usa. Los ajustes viven en ``Tenant.rental_settings`` (JSON):

* ``leasing_enabled`` (bool, por defecto True): si es False, no se rentan propiedades.
* ``off_modules`` (lista): módulos de renta que el tenant decidió no usar aunque administre rentas.

Los módulos de operación y los de finanzas CAPEX/OPEX nunca dependen de estos ajustes.
"""
from __future__ import annotations

LEASING_OPTIONAL_MODULES = ('rentas_crm', 'rentas_cobranza', 'rentas_rentroll')
MODULE_PATHS = {
    'rentas_crm': '/app/rentas/crm',
    'rentas_cobranza': '/app/rentas/cobranza',
    'rentas_rentroll': '/app/rentas/rentroll',
}
LEASE_KINDS = ('renta', 'comodato', 'promesa')


def _rs(tenant):
    rs = getattr(tenant, 'rental_settings', None)
    return rs if isinstance(rs, dict) else {}


def leasing_config(tenant):
    rs = _rs(tenant)
    enabled = rs.get('leasing_enabled', True) is not False
    raw = rs.get('off_modules')
    off = [m for m in (raw if isinstance(raw, list) else []) if m in LEASING_OPTIONAL_MODULES]
    return {
        'leasing_enabled': enabled,
        'off_modules': off,
        'effective_off': list(LEASING_OPTIONAL_MODULES) if not enabled else off,
    }


def leasing_enabled(tenant):
    return leasing_config(tenant)['leasing_enabled']


def module_is_off(tenant, module_key):
    return module_key in leasing_config(tenant)['effective_off']


def property_is_leasable(prop, tenant=None):
    """True si la propiedad puede tener contratos de renta."""
    tenant = tenant or prop.tenant
    return leasing_enabled(tenant) and prop.usage == 'renta'


def lease_block_reason(prop, tenant=None):
    """Mensaje de por qué no se puede rentar esta propiedad, o '' si se puede."""
    tenant = tenant or prop.tenant
    if not leasing_enabled(tenant):
        return 'Tu espacio está configurado para operar propiedades sin rentas (Configuración → Modo de operación).'
    if prop.usage != 'renta':
        return f'La propiedad {prop.code} es "Solo operación" y no admite contratos de renta. Cámbiala a "En renta" en su ficha.'
    return ''


def default_usage(tenant):
    return 'renta' if leasing_enabled(tenant) else 'operacion'


def filter_alerts(tenant, alerts):
    off_paths = [MODULE_PATHS[m] for m in leasing_config(tenant)['effective_off']]
    if not off_paths:
        return alerts
    return [a for a in alerts if not any(str(a.get('path', '')).startswith(p) for p in off_paths)]
