"""Renta fija / variable y condiciones especiales de contratos de arrendamiento."""
from __future__ import annotations

from calendar import monthrange
from datetime import date
from decimal import Decimal, ROUND_HALF_UP

RENT_SCHEME_CHOICES = [
    ('fija', 'Renta fija'),
    ('variable', 'Renta variable'),
]

RENT_BASIS_CHOICES = [
    ('ventas', 'Porcentaje de ventas'),
    ('inpc', 'Indexada (INPC)'),
    ('escalonada', 'Escalonada / tramos'),
    ('ocupacion', 'Por ocupación / noches'),
    ('m2', 'Por metro cuadrado'),
    ('temporada', 'Por temporada'),
    ('otro', 'Otra condición'),
]

BASIS_LABELS = {k: v for k, v in RENT_BASIS_CHOICES}
SCHEME_LABELS = {k: v for k, v in RENT_SCHEME_CHOICES}
GROUP_LABELS = {
    'residencial': 'Residencial',
    'corta_estancia': 'Corta estancia',
    'comercial': 'Comercial',
    'industrial': 'Industrial',
    'otros': 'Otros',
}

_ZERO = Decimal('0')
_ONE = Decimal('1')
_HUNDRED = Decimal('100')
_CENT = Decimal('0.01')


def _dec(value, default='0'):
    if value in (None, ''):
        return Decimal(default)
    try:
        return Decimal(str(value))
    except Exception:
        return Decimal(default)


def _money(n):
    if n is None:
        return _ZERO
    if not isinstance(n, Decimal):
        n = _dec(n)
    if n < 0:
        n = _ZERO
    return n.quantize(_CENT, rounding=ROUND_HALF_UP)


def _as_of(value):
    if isinstance(value, date):
        return value
    if not value:
        return date.today()
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return date.today()


def _period_key(value):
    if hasattr(value, 'strftime'):
        return value.strftime('%Y-%m')
    return str(value or '')[:7]


def empty_conditions():
    return {
        'basis': 'ventas',
        'base_rent': 0,
        'percent': 0,
        'breakpoint': 0,
        'reported_sales': 0,
        'index_name': 'INPC',
        'review_months': 12,
        'index_base': 100,
        'index_current': 100,
        'cap_pct': 0,
        'floor_pct': 0,
        'steps': [],
        'nightly_rate': 0,
        'occupancy_pct': 0,
        'nights': 30,
        'platform_fee_pct': 0,
        'rate_m2': 0,
        'area_m2': 0,
        'common_area_factor': 1,
        'seasons': [],
        'notes': '',
    }


def normalize_conditions(raw):
    base = empty_conditions()
    if not isinstance(raw, dict):
        return base
    base.update({k: raw[k] for k in base if k in raw})
    steps = []
    for step in raw.get('steps') or []:
        if not isinstance(step, dict):
            continue
        start = str(step.get('from') or step.get('start') or '')[:7]
        if not start:
            continue
        steps.append({'from': start, 'amount': float(_dec(step.get('amount')))})
    steps.sort(key=lambda s: s['from'])
    base['steps'] = steps
    seasons = []
    for season in raw.get('seasons') or []:
        if not isinstance(season, dict):
            continue
        months = []
        for m in season.get('months') or []:
            try:
                n = int(m)
            except (TypeError, ValueError):
                continue
            if 1 <= n <= 12:
                months.append(n)
        if not months:
            continue
        seasons.append({'months': months, 'amount': float(_dec(season.get('amount')))})
    base['seasons'] = seasons
    base['notes'] = str(raw.get('notes') or '')[:800]
    base['index_name'] = str(raw.get('index_name') or 'INPC')[:24]
    basis = str(raw.get('basis') or 'ventas')
    if basis not in BASIS_LABELS:
        basis = 'otro'
    base['basis'] = basis
    return base


def apply_annual_increment(amount, increment_pct, start, as_of):
    amount = _money(amount)
    inc = _dec(increment_pct)
    if amount <= 0 or inc <= 0 or not start:
        return amount
    as_of = _as_of(as_of)
    years = as_of.year - start.year
    if (as_of.month, as_of.day) < (start.month, start.day):
        years -= 1
    years = max(0, years)
    if years <= 0:
        return amount
    factor = (_ONE + inc / _HUNDRED) ** years
    return _money(amount * factor)


def _base_rent(contract, conditions):
    return _money(conditions.get('base_rent') or getattr(contract, 'rent_amount', 0) or 0)


def _from_sales(contract, conditions):
    guaranteed = _base_rent(contract, conditions)
    sales = _dec(conditions.get('reported_sales'))
    pct = _dec(conditions.get('percent'))
    breakpoint = _dec(conditions.get('breakpoint'))
    if pct <= 0:
        return guaranteed
    if breakpoint > 0:
        overage = _money(max(_ZERO, sales - breakpoint) * pct / _HUNDRED)
        return _money(guaranteed + overage)
    return _money(max(guaranteed, sales * pct / _HUNDRED))


def _from_inpc(contract, conditions):
    base = _base_rent(contract, conditions)
    idx_base = _dec(conditions.get('index_base'), '100')
    idx_cur = _dec(conditions.get('index_current'), '0')
    if idx_cur <= 0:
        idx_cur = idx_base
    if idx_base <= 0 or base <= 0:
        return base
    raw = base * idx_cur / idx_base
    change_pct = (raw - base) / base * _HUNDRED
    cap = _dec(conditions.get('cap_pct'))
    floor = _dec(conditions.get('floor_pct'))
    if cap > 0 and change_pct > cap:
        raw = base * (_ONE + cap / _HUNDRED)
    if floor > 0 and change_pct < -floor:
        raw = base * (_ONE - floor / _HUNDRED)
    return _money(raw)


def _from_steps(contract, conditions, as_of):
    steps = conditions.get('steps') or []
    key = _period_key(as_of)
    chosen = None
    for step in steps:
        if step.get('from') and step['from'] <= key:
            chosen = step
    if chosen:
        return _money(chosen.get('amount'))
    return _base_rent(contract, conditions)


def _from_occupancy(contract, conditions, as_of):
    as_of = _as_of(as_of)
    nights = int(_dec(conditions.get('nights')))
    if nights <= 0:
        nights = monthrange(as_of.year, as_of.month)[1]
    nightly = _dec(conditions.get('nightly_rate'))
    occ = _dec(conditions.get('occupancy_pct'))
    fee = _dec(conditions.get('platform_fee_pct'))
    if nightly <= 0:
        return _base_rent(contract, conditions)
    occ = min(max(occ, _ZERO), _HUNDRED)
    fee = min(max(fee, _ZERO), _HUNDRED)
    gross = nightly * Decimal(nights) * occ / _HUNDRED
    return _money(gross * (_ONE - fee / _HUNDRED))


def _from_m2(contract, conditions, prop):
    rate = _dec(conditions.get('rate_m2'))
    area = _dec(conditions.get('area_m2'))
    if area <= 0 and prop is not None:
        area = _dec(getattr(prop, 'area_m2', 0))
    factor = _dec(conditions.get('common_area_factor'), '1')
    if factor <= 0:
        factor = _ONE
    if rate <= 0 or area <= 0:
        return _base_rent(contract, conditions)
    return _money(rate * area * factor)


def _from_season(contract, conditions, as_of):
    month = _as_of(as_of).month
    for season in conditions.get('seasons') or []:
        if month in (season.get('months') or []):
            return _money(season.get('amount'))
    return _base_rent(contract, conditions)


def compute_effective_rent(contract, as_of=None, prop=None):
    """Renta mensual vigente a la fecha, según esquema y condiciones."""
    as_of = _as_of(as_of)
    scheme = getattr(contract, 'rent_scheme', 'fija') or 'fija'
    contracted = _money(getattr(contract, 'rent_amount', 0))
    increment = getattr(contract, 'increment_pct', 0)
    start = getattr(contract, 'start_date', None)
    if getattr(contract, 'kind', 'renta') == 'comodato':
        return _ZERO
    if scheme != 'variable':
        return apply_annual_increment(contracted, increment, start, as_of)

    conditions = normalize_conditions(getattr(contract, 'rent_conditions', None) or {})
    # En propiedades Multi Tenant el área para renta por m² es la del espacio rentado
    space = getattr(contract, 'space', None) if getattr(contract, 'space_id', None) else None
    prop = space or prop or getattr(contract, 'property', None)
    basis = conditions.get('basis') or 'otro'
    if basis == 'ventas':
        amount = _from_sales(contract, conditions)
    elif basis == 'inpc':
        amount = _from_inpc(contract, conditions)
    elif basis == 'escalonada':
        amount = _from_steps(contract, conditions, as_of)
    elif basis == 'ocupacion':
        amount = _from_occupancy(contract, conditions, as_of)
    elif basis == 'm2':
        amount = _from_m2(contract, conditions, prop)
    elif basis == 'temporada':
        amount = _from_season(contract, conditions, as_of)
    else:
        amount = _base_rent(contract, conditions)
    if amount <= 0:
        amount = apply_annual_increment(contracted, increment, start, as_of)
    return amount


def is_rent_estimate(contract):
    scheme = getattr(contract, 'rent_scheme', 'fija') or 'fija'
    if scheme != 'variable':
        return False
    conditions = normalize_conditions(getattr(contract, 'rent_conditions', None) or {})
    basis = conditions.get('basis')
    if basis == 'ventas' and _dec(conditions.get('reported_sales')) <= 0:
        return True
    if basis == 'ocupacion':
        return True
    if basis == 'inpc' and _dec(conditions.get('index_current')) <= 0:
        return True
    return False


def conditions_summary(contract):
    scheme = getattr(contract, 'rent_scheme', 'fija') or 'fija'
    if scheme != 'variable':
        inc = _dec(getattr(contract, 'increment_pct', 0))
        parts = ['Renta fija']
        if inc > 0:
            parts.append(f'incremento {inc:g}% anual')
        return ' · '.join(parts)
    conditions = normalize_conditions(getattr(contract, 'rent_conditions', None) or {})
    basis = conditions.get('basis') or 'otro'
    label = BASIS_LABELS.get(basis, 'Variable')
    parts = [label]
    base = _base_rent(contract, conditions)
    if base > 0:
        parts.append(f'mín. ${base:,.2f}')
    if basis == 'ventas':
        pct = _dec(conditions.get('percent'))
        if pct > 0:
            parts.append(f'{pct:g}% ventas')
        brk = _dec(conditions.get('breakpoint'))
        if brk > 0:
            parts.append(f'a partir de ${brk:,.0f}')
    elif basis == 'inpc':
        name = conditions.get('index_name') or 'INPC'
        parts.append(name)
        review = int(_dec(conditions.get('review_months')) or 12)
        parts.append(f'cada {review} mes(es)')
        cap = _dec(conditions.get('cap_pct'))
        if cap > 0:
            parts.append(f'tope {cap:g}%')
    elif basis == 'escalonada':
        n = len(conditions.get('steps') or [])
        parts.append(f'{n} tramo(s)')
    elif basis == 'ocupacion':
        nightly = _dec(conditions.get('nightly_rate'))
        occ = _dec(conditions.get('occupancy_pct'))
        if nightly > 0:
            parts.append(f'${nightly:,.0f}/noche')
        if occ > 0:
            parts.append(f'{occ:g}% ocupación')
    elif basis == 'm2':
        rate = _dec(conditions.get('rate_m2'))
        if rate > 0:
            parts.append(f'${rate:,.2f}/m²')
    elif basis == 'temporada':
        n = len(conditions.get('seasons') or [])
        parts.append(f'{n} temporada(s)')
    notes = (conditions.get('notes') or '').strip()
    if notes:
        parts.append(notes[:80])
    return ' · '.join(str(p) for p in parts if p)


def rent_charge_label(contract, period):
    scheme = getattr(contract, 'rent_scheme', 'fija') or 'fija'
    if scheme != 'variable':
        return f'Renta {period}'
    conditions = normalize_conditions(getattr(contract, 'rent_conditions', None) or {})
    basis = BASIS_LABELS.get(conditions.get('basis'), 'variable')
    return f'Renta {period} · variable · {basis}'
