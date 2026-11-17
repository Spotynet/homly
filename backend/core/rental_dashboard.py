"""Dashboard de Administrar Propiedades: resumen consolidado de todos los módulos.

Une Rent Roll (portafolio), cobranza, contratos, mantenimiento, proveedores y CRM
en un solo payload pensado para mostrarse con gráficas simples y alertas accionables.
"""
from __future__ import annotations

from calendar import monthrange
from collections import Counter, defaultdict
from datetime import date, timedelta
from decimal import Decimal

from django.db.models import Count, Sum

from .models import (
    RentalCharge,
    RentalContractSignature,
    RentalLead,
    RentalMaintenanceProvider,
    RentalMaintenanceWork,
    RentalPayment,
)
from .rental_ops_indicators import ops_summary
from .rental_rentroll import build_rentroll

MONTHS_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
LIVE_CONTRACT = ('activo', 'por_vencer', 'vencido')
OPEN_WORK = ('planeado', 'en_curso')
OPEN_LEAD = ('nuevo', 'contactado', 'visita', 'propuesta', 'negociacion')
PRIORITY_ORDER = {'urgente': 0, 'alta': 1, 'media': 2, 'baja': 3}
ZERO = Decimal('0')


def _f(value):
    return float(value or 0)


def _period_parts(period):
    try:
        y, m = period.split('-')
        y, m = int(y), int(m)
        if not 1 <= m <= 12:
            raise ValueError
        return y, m
    except (ValueError, AttributeError):
        today = date.today()
        return today.year, today.month


def _months_back(period, n=6):
    y, m = _period_parts(period)
    out = []
    for i in range(n - 1, -1, -1):
        mm, yy = m - i, y
        while mm <= 0:
            mm += 12
            yy -= 1
        out.append(f'{yy:04d}-{mm:02d}')
    return out


def _label(period):
    y, m = _period_parts(period)
    return f'{MONTHS_ES[m - 1]} {str(y)[2:]}'


def _paid(charge):
    return sum((p.amount or ZERO for p in charge.payments.all()), ZERO)


def _is_rent(charge):
    if charge.concept_id and charge.concept and charge.concept.is_rent:
        return True
    return (charge.description or '').lower().startswith('renta')


def _party_name(contract):
    try:
        return contract.counterpart_label
    except Exception:  # pragma: no cover - defensivo
        return contract.tenant_party.full_name if contract.tenant_party_id else ''


# ─── Cobranza ────────────────────────────────────────────────────────────────

def _finance(tenant, period, today):
    months = _months_back(period, 6)
    y, m = _period_parts(period)
    start = date(y, m, 1)
    end = date(y, m, monthrange(y, m)[1])

    charges = list(
        RentalCharge.objects.filter(tenant=tenant, period__in=months)
        .exclude(status='cancelado')
        .select_related('concept', 'contract')
        .prefetch_related('payments')
    )
    trend = {p: {'period': p, 'label': _label(p), 'expected': ZERO, 'collected': ZERO} for p in months}
    scheme = {'fija': ZERO, 'variable': ZERO, 'extras': ZERO}
    scheme_paid = {'fija': ZERO, 'variable': ZERO, 'extras': ZERO}
    concepts = defaultdict(lambda: ZERO)
    for ch in charges:
        paid = _paid(ch)
        trend[ch.period]['expected'] += ch.amount
        trend[ch.period]['collected'] += min(paid, ch.amount)
        if ch.period == period:
            key = 'extras'
            if _is_rent(ch):
                key = 'variable' if getattr(ch.contract, 'rent_scheme', 'fija') == 'variable' else 'fija'
            scheme[key] += ch.amount
            scheme_paid[key] += min(paid, ch.amount)
            concepts[(ch.concept.name if ch.concept_id and ch.concept else 'Renta')] += ch.amount

    trend_out = []
    for p in months:
        row = trend[p]
        exp = row['expected']
        trend_out.append({
            'period': p,
            'label': row['label'],
            'expected': _f(exp),
            'collected': _f(row['collected']),
            'pending': _f(max(ZERO, exp - row['collected'])),
            'pct': round(float(row['collected'] / exp) * 100, 1) if exp else 0,
        })

    cur = trend[period]
    expected = cur['expected']
    collected = cur['collected']

    # Cartera vencida a hoy (todos los periodos)
    overdue_qs = (
        RentalCharge.objects.filter(tenant=tenant, due_date__lt=today)
        .exclude(status__in=('pagado', 'cancelado'))
        .select_related('contract', 'contract__property', 'contract__tenant_party')
        .prefetch_related('payments')
    )
    buckets = [
        {'key': '1-30', 'label': '1–30 días', 'amount': ZERO, 'count': 0},
        {'key': '31-60', 'label': '31–60 días', 'amount': ZERO, 'count': 0},
        {'key': '61-90', 'label': '61–90 días', 'amount': ZERO, 'count': 0},
        {'key': '90+', 'label': 'Más de 90', 'amount': ZERO, 'count': 0},
    ]
    by_contract = {}
    overdue_amount = ZERO
    overdue_count = 0
    for ch in overdue_qs:
        remaining = ch.amount - _paid(ch)
        if remaining <= 0:
            continue
        days = (today - ch.due_date).days
        idx = 0 if days <= 30 else 1 if days <= 60 else 2 if days <= 90 else 3
        buckets[idx]['amount'] += remaining
        buckets[idx]['count'] += 1
        overdue_amount += remaining
        overdue_count += 1
        c = ch.contract
        item = by_contract.setdefault(c.id, {
            'contract_id': str(c.id),
            'property_code': c.property.code if c.property_id else '',
            'property_name': c.property.name if c.property_id else '',
            'tenant_name': _party_name(c),
            'amount': ZERO,
            'charges': 0,
            'max_days': 0,
        })
        item['amount'] += remaining
        item['charges'] += 1
        item['max_days'] = max(item['max_days'], days)
    top_overdue = sorted(by_contract.values(), key=lambda x: x['amount'], reverse=True)[:6]
    for it in top_overdue:
        it['amount'] = _f(it['amount'])

    # Cobros recibidos en el mes (por fecha de pago)
    pays = list(
        RentalPayment.objects.filter(tenant=tenant, payment_date__gte=start, payment_date__lte=end)
        .select_related('contract', 'contract__property', 'contract__tenant_party')
    )
    methods = defaultdict(lambda: ZERO)
    labels = dict(RentalPayment.PAYMENT_TYPE_CHOICES)
    received = ZERO
    for p in pays:
        methods[labels.get(p.payment_type, p.payment_type)] += p.amount
        received += p.amount
    recent = sorted(pays, key=lambda p: (p.payment_date, p.created_at), reverse=True)[:6]

    return {
        'period': period,
        'expected': _f(expected),
        'collected': _f(collected),
        'pending': _f(max(ZERO, expected - collected)),
        'collection_pct': round(float(collected / expected) * 100, 1) if expected else 0,
        'received_in_month': _f(received),
        'overdue_amount': _f(overdue_amount),
        'overdue_count': overdue_count,
        'trend': trend_out,
        'by_scheme': [
            {'key': 'fija', 'label': 'Renta fija', 'expected': _f(scheme['fija']), 'collected': _f(scheme_paid['fija'])},
            {'key': 'variable', 'label': 'Renta variable', 'expected': _f(scheme['variable']), 'collected': _f(scheme_paid['variable'])},
            {'key': 'extras', 'label': 'Otros cargos', 'expected': _f(scheme['extras']), 'collected': _f(scheme_paid['extras'])},
        ],
        'by_concept': sorted(
            [{'name': k, 'amount': _f(v)} for k, v in concepts.items()],
            key=lambda x: x['amount'], reverse=True,
        )[:6],
        'aging': [{**b, 'amount': _f(b['amount'])} for b in buckets],
        'top_overdue': top_overdue,
        'by_method': sorted(
            [{'name': k, 'amount': _f(v)} for k, v in methods.items()],
            key=lambda x: x['amount'], reverse=True,
        ),
        'recent_payments': [{
            'id': str(p.id),
            'date': str(p.payment_date),
            'amount': _f(p.amount),
            'method': labels.get(p.payment_type, p.payment_type),
            'property_code': p.contract.property.code if p.contract.property_id else '',
            'tenant_name': _party_name(p.contract),
        } for p in recent],
    }


# ─── Portafolio (Rent Roll) ──────────────────────────────────────────────────

def _portfolio(tenant, as_of):
    rr = build_rentroll(tenant, as_of, False)
    rows = rr['rows']
    s = rr['summary']

    occ_labels = {
        'ocupada': 'Ocupada', 'aviso': 'Con aviso', 'holdover': 'Sin renovar',
        'vacante': 'Vacante', 'reservada': 'Reservada', 'mantenimiento': 'En mantenimiento',
    }
    occ = Counter(r['occupancy'] for r in rows)

    types = {}
    for r in rows:
        t = types.setdefault(r['type_label'] or 'Otro', {'name': r['type_label'] or 'Otro', 'units': 0, 'occupied': 0, 'rent': 0.0})
        t['units'] += 1
        if r['occupancy'] in ('ocupada', 'aviso', 'holdover'):
            t['occupied'] += 1
        t['rent'] += r['rent_monthly']
    owners = {}
    for r in rows:
        if r['rent_monthly'] <= 0:
            continue
        name = r['owner_name'] or 'Sin propietario'
        o = owners.setdefault(name, {'name': name, 'units': 0, 'rent': 0.0})
        o['units'] += 1
        o['rent'] += r['rent_monthly']

    vacants = sorted(
        [r for r in rows if r['occupancy'] in ('vacante', 'reservada', 'mantenimiento')],
        key=lambda r: r['suggested_rent'], reverse=True,
    )[:6]
    top_rents = sorted([r for r in rows if r['rent_monthly'] > 0], key=lambda r: r['rent_monthly'], reverse=True)[:5]

    def mini(r):
        return {
            'property_id': r['property_id'],
            'code': r['code'],
            'name': r['name'],
            'type_label': r['type_label'],
            'specs_summary': r['specs_summary'],
            'occupancy': r['occupancy'],
            'suggested_rent': r['suggested_rent'],
            'rent_monthly': r['rent_monthly'],
            'tenant_name': r['tenant_name'],
        }

    groups = [
        {'key': k, **v} for k, v in s['by_group'].items()
    ]
    summary = {k: s[k] for k in (
            'units', 'operation_only', 'multi_tenant_properties', 'gla_total', 'gla_occupied',
            'gla_vacant', 'gla_occupancy_pct', 'occupied', 'vacant', 'reserved', 'notice', 'holdover', 'airbnb_occupied',
            'comodato', 'delinquent', 'occupancy_pct', 'economic_occupancy_pct', 'gpr',
            'in_place_rent', 'annual_in_place', 'vacancy_loss', 'loss_to_lease', 'deposits_held',
            'expiring_30', 'expiring_60', 'expiring_90', 'fixed_count', 'variable_count',
            'fixed_rent', 'variable_rent',
    )}
    for key, val in list(summary.items()):
        if isinstance(val, Decimal):
            summary[key] = float(val)
    return {
        'summary': summary,
        'occupancy': [
            {'key': k, 'label': occ_labels[k], 'value': occ.get(k, 0)}
            for k in occ_labels if occ.get(k, 0)
        ],
        'by_group': groups,
        'by_type': sorted(types.values(), key=lambda x: x['units'], reverse=True),
        'by_owner': sorted(owners.values(), key=lambda x: x['rent'], reverse=True)[:5],
        'vacants': [mini(r) for r in vacants],
        'top_rents': [mini(r) for r in top_rents],
    }


# ─── Contratos ───────────────────────────────────────────────────────────────

def _contracts(tenant, contracts, today):
    status_labels = {
        'borrador': 'Borrador', 'activo': 'Activo', 'por_vencer': 'Por vencer', 'vencido': 'Vencido',
        'renovado': 'Renovado', 'finalizado': 'Finalizado',
    }
    kind_labels = {
        'renta': 'Renta', 'proveedor': 'Proveedor', 'servicios_generales': 'Serv. generales',
        'mantenimiento': 'Mantenimiento', 'comodato': 'Comodato', 'promesa': 'Promesa', 'otro': 'Otro',
    }
    stage_labels = {'entrevista': 'Entrevista', 'redaccion': 'Redacción', 'firmas': 'Firmas', 'publicado': 'Publicado'}

    non_cancel = [c for c in contracts if c.status != 'cancelado']
    by_status = Counter(c.status for c in non_cancel)
    open_contracts = [c for c in non_cancel if c.status not in ('finalizado', 'renovado')]
    by_kind = Counter(c.kind for c in open_contracts)
    by_stage = Counter(c.legal_stage for c in open_contracts if c.legal_stage and c.legal_stage != 'none')

    leases = [c for c in open_contracts if c.kind == 'renta' and c.status in LIVE_CONTRACT]
    buckets = {'0-30': 0, '31-60': 0, '61-90': 0, '91-180': 0}
    for c in leases:
        d = (c.end_date - today).days
        if d < 0:
            continue
        if d <= 30:
            buckets['0-30'] += 1
        elif d <= 60:
            buckets['31-60'] += 1
        elif d <= 90:
            buckets['61-90'] += 1
        elif d <= 180:
            buckets['91-180'] += 1

    variable = [c for c in leases if getattr(c, 'rent_scheme', 'fija') == 'variable']
    estimates = [c for c in variable if c.rent_is_estimate]
    pending_sign = RentalContractSignature.objects.filter(
        contract__tenant=tenant, status='pendiente',
    ).exclude(contract__status__in=('cancelado', 'finalizado')).values('contract_id').distinct().count()

    upcoming = []
    for c in sorted(leases, key=lambda x: x.end_date):
        d = (c.end_date - today).days
        if d > 90:
            break
        upcoming.append({
            'id': str(c.id),
            'code': c.code,
            'property_code': c.property.code if c.property_id else '',
            'property_name': c.property.name if c.property_id else '',
            'tenant_name': _party_name(c),
            'end_date': str(c.end_date),
            'days_left': d,
            'status': c.status,
            'rent': float(c.rent_amount or 0),
        })

    return {
        'total': len(non_cancel),
        'active': by_status.get('activo', 0),
        'expiring': by_status.get('por_vencer', 0),
        'expired': by_status.get('vencido', 0),
        'draft': by_status.get('borrador', 0),
        'by_status': [
            {'key': k, 'label': status_labels[k], 'value': by_status.get(k, 0)}
            for k in status_labels if by_status.get(k, 0)
        ],
        'by_kind': [
            {'key': k, 'label': kind_labels.get(k, k), 'value': v}
            for k, v in by_kind.most_common()
        ],
        'by_stage': [
            {'key': k, 'label': stage_labels[k], 'value': by_stage.get(k, 0)}
            for k in stage_labels
        ],
        'expiry_buckets': [
            {'key': '0-30', 'label': '0–30 días', 'value': buckets['0-30']},
            {'key': '31-60', 'label': '31–60 días', 'value': buckets['31-60']},
            {'key': '61-90', 'label': '61–90 días', 'value': buckets['61-90']},
            {'key': '91-180', 'label': '3–6 meses', 'value': buckets['91-180']},
        ],
        'fixed_count': len(leases) - len(variable),
        'variable_count': len(variable),
        'estimated_count': len(estimates),
        'pending_signatures': pending_sign,
        'upcoming': upcoming[:8],
    }


# ─── Mantenimiento y proveedores ─────────────────────────────────────────────

def _maintenance(tenant, period, today):
    months = _months_back(period, 6)
    y, m = _period_parts(months[0])
    window_start = date(y, m, 1)

    works = list(
        RentalMaintenanceWork.objects.filter(tenant=tenant)
        .exclude(status='cancelado')
        .select_related('property', 'category', 'provider')
    )
    open_w = [w for w in works if w.status in OPEN_WORK]
    status_labels = dict(RentalMaintenanceWork.STATUS_CHOICES)
    prio_labels = dict(RentalMaintenanceWork.PRIORITY_CHOICES)

    by_status = Counter(w.status for w in works)
    by_prio = Counter(w.priority for w in open_w)
    open_kind = Counter(w.kind for w in open_w)

    overdue = [w for w in open_w if w.scheduled_date and w.scheduled_date < today]

    cost_by_month = {p: ZERO for p in months}
    done_by_month = {p: 0 for p in months}
    for w in works:
        if w.status != 'realizado':
            continue
        d = w.performed_date or w.scheduled_date
        if not d:
            continue
        key = f'{d.year:04d}-{d.month:02d}'
        if key in cost_by_month:
            cost_by_month[key] += w.cost or ZERO
            done_by_month[key] += 1

    cats = {}
    props = {}
    for w in works:
        d = w.performed_date or w.scheduled_date or w.created_at.date()
        if d < window_start:
            continue
        name = w.category.name if w.category_id else 'Sin categoría'
        c = cats.setdefault(name, {'name': name, 'count': 0, 'cost': ZERO})
        c['count'] += 1
        c['cost'] += w.cost or ZERO
        pk = w.property_id
        p = props.setdefault(pk, {
            'code': w.property.code, 'name': w.property.name, 'count': 0, 'cost': ZERO,
        })
        p['count'] += 1
        p['cost'] += w.cost or ZERO

    def work_item(w):
        return {
            'id': str(w.id),
            'folio': w.folio,
            'title': w.title,
            'kind': w.kind,
            'status': w.status,
            'status_label': status_labels.get(w.status, w.status),
            'priority': w.priority,
            'priority_label': prio_labels.get(w.priority, w.priority),
            'property_code': w.property.code,
            'property_name': w.property.name,
            'scheduled_date': str(w.scheduled_date) if w.scheduled_date else None,
            'provider_name': (w.provider.trade_name or w.provider.name) if w.provider_id else (w.vendor_name or ''),
            'overdue': bool(w.scheduled_date and w.scheduled_date < today),
        }

    attention = sorted(
        [w for w in open_w if w.priority in ('urgente', 'alta') or (w.scheduled_date and w.scheduled_date < today)],
        key=lambda w: (PRIORITY_ORDER.get(w.priority, 9), w.scheduled_date or date.max),
    )[:6]
    horizon = today + timedelta(days=14)
    upcoming = sorted(
        [w for w in open_w if w.scheduled_date and today <= w.scheduled_date <= horizon],
        key=lambda w: w.scheduled_date,
    )[:6]

    cur_cost = cost_by_month.get(period, ZERO)
    return {
        'open': len(open_w),
        'open_preventivo': open_kind.get('preventivo', 0),
        'open_correctivo': open_kind.get('correctivo', 0),
        'overdue': len(overdue),
        'urgent': by_prio.get('urgente', 0),
        'high': by_prio.get('alta', 0),
        'done_total': by_status.get('realizado', 0),
        'cost_month': _f(cur_cost),
        'cost_window': _f(sum(cost_by_month.values(), ZERO)),
        'by_status': [
            {'key': k, 'label': status_labels[k], 'value': by_status.get(k, 0)}
            for k in ('planeado', 'en_curso', 'realizado') if by_status.get(k, 0)
        ],
        'by_priority': [
            {'key': k, 'label': prio_labels[k], 'value': by_prio.get(k, 0)}
            for k in ('urgente', 'alta', 'media', 'baja')
        ],
        'by_kind': [
            {'key': 'preventivo', 'label': 'Preventivo', 'value': sum(1 for w in works if w.kind == 'preventivo')},
            {'key': 'correctivo', 'label': 'Correctivo', 'value': sum(1 for w in works if w.kind == 'correctivo')},
        ],
        'cost_trend': [
            {'period': p, 'label': _label(p), 'cost': _f(cost_by_month[p]), 'done': done_by_month[p]}
            for p in months
        ],
        'by_category': sorted(
            [{**c, 'cost': _f(c['cost'])} for c in cats.values()],
            key=lambda x: x['count'], reverse=True,
        )[:6],
        'top_properties': sorted(
            [{**p, 'cost': _f(p['cost'])} for p in props.values() if p['cost'] > 0],
            key=lambda x: x['cost'], reverse=True,
        )[:5],
        'attention': [work_item(w) for w in attention],
        'upcoming': [work_item(w) for w in upcoming],
    }


def _providers(tenant, today):
    provs = list(RentalMaintenanceProvider.objects.filter(tenant=tenant, is_active=True))
    soon = today + timedelta(days=60)
    repse = [p for p in provs if p.is_repse]
    expired = [
        p for p in repse
        if p.repse_status == 'vencido' or (p.repse_expires_at and p.repse_expires_at < today)
    ]
    expiring = [
        p for p in repse
        if p not in expired and p.repse_expires_at and today <= p.repse_expires_at <= soon
    ]
    pending = [p for p in repse if p.repse_status == 'pendiente']
    return {
        'total': len(provs),
        'with_expediente': sum(1 for p in provs if p.has_expediente),
        'without_expediente': sum(1 for p in provs if not p.has_expediente),
        'repse_total': len(repse),
        'repse_vigente': sum(1 for p in repse if p.repse_status == 'vigente' and p not in expired),
        'repse_expired': len(expired),
        'repse_expiring': len(expiring),
        'repse_pending': len(pending),
        'repse_alerts': [
            {
                'id': str(p.id),
                'name': p.trade_name or p.name,
                'expires_at': str(p.repse_expires_at) if p.repse_expires_at else None,
                'expired': p in expired,
            }
            for p in (expired + expiring)[:5]
        ],
    }


# ─── CRM ─────────────────────────────────────────────────────────────────────

def _crm(tenant, today):
    leads = RentalLead.objects.filter(tenant=tenant)
    counts = dict(leads.order_by().values_list('stage').annotate(c=Count('id')))
    sources = dict(leads.order_by().values_list('source').annotate(c=Count('id')))
    source_labels = dict(RentalLead.SOURCE_CHOICES)
    stage_labels = dict(RentalLead.STAGE_CHOICES)
    won = counts.get('ganado', 0)
    lost = counts.get('perdido', 0)
    pipeline = leads.filter(stage__in=OPEN_LEAD).aggregate(s=Sum('interested_rent'))['s'] or ZERO
    month_start = today.replace(day=1)
    return {
        'open': sum(counts.get(k, 0) for k in OPEN_LEAD),
        'won': won,
        'lost': lost,
        'total': sum(counts.values()),
        'won_month': leads.filter(stage='ganado', converted_at__date__gte=month_start).count(),
        'new_month': leads.filter(created_at__date__gte=month_start).count(),
        'conversion_pct': round(won / (won + lost) * 100, 1) if (won + lost) else 0,
        'pipeline_value': _f(pipeline),
        'funnel': [
            {'key': k, 'label': stage_labels[k], 'value': counts.get(k, 0)}
            for k in ('nuevo', 'contactado', 'visita', 'propuesta', 'negociacion', 'ganado')
        ],
        'by_source': sorted(
            [{'key': k, 'label': source_labels.get(k, k), 'value': v} for k, v in sources.items()],
            key=lambda x: x['value'], reverse=True,
        )[:6],
    }


# ─── Alertas ─────────────────────────────────────────────────────────────────

def _alerts(portfolio, finance, contracts, maintenance, providers, crm, missing_charges, period_is_past, ops=None):
    out = []
    s = portfolio['summary']

    def add(key, level, title, detail, count, path, cta):
        out.append({
            'key': key, 'level': level, 'title': title, 'detail': detail,
            'count': count, 'path': path, 'cta': cta,
        })

    if finance['overdue_count']:
        add('overdue', 'high', 'Cobranza vencida',
            f"{finance['overdue_count']} cargo(s) sin pagar fuera de fecha.",
            finance['overdue_count'], '/app/rentas/cobranza', 'Ir a cobranza')
    if missing_charges and not period_is_past:
        add('missing_charges', 'medium', 'Faltan cargos del mes',
            f'{missing_charges} contrato(s) vigentes sin cargo de renta este periodo.',
            missing_charges, '/app/rentas/cobranza', 'Generar mes')
    if contracts['expired']:
        add('expired', 'high', 'Contratos vencidos sin renovar',
            'El inquilino sigue ocupando con el contrato vencido.',
            contracts['expired'], '/app/rentas/contratos', 'Revisar contratos')
    exp30 = contracts['expiry_buckets'][0]['value']
    if exp30:
        add('expiring30', 'medium', 'Contratos por vencer en 30 días',
            'Define renovación, aumento o salida.',
            exp30, '/app/rentas/calendario', 'Ver calendario')
    if contracts['estimated_count']:
        add('estimates', 'medium', 'Rentas variables por confirmar',
            'Captura ventas, INPC u ocupación para cerrar el monto real.',
            contracts['estimated_count'], '/app/rentas/cobranza', 'Recalcular variables')
    if contracts['pending_signatures']:
        add('signatures', 'info', 'Contratos pendientes de firma',
            'Hay partes que aún no firman.',
            contracts['pending_signatures'], '/app/rentas/contratos', 'Ver contratos')
    if maintenance['urgent']:
        add('maint_urgent', 'high', 'Mantenimiento urgente abierto',
            'Trabajos con prioridad urgente sin cerrar.',
            maintenance['urgent'], '/app/rentas/mantenimiento', 'Atender')
    if maintenance['overdue']:
        add('maint_overdue', 'medium', 'Mantenimiento atrasado',
            'Fecha programada vencida y sin realizar.',
            maintenance['overdue'], '/app/rentas/mantenimiento', 'Ver trabajos')
    if providers['repse_expired']:
        add('repse_expired', 'high', 'REPSE vencido',
            'Proveedores con registro vencido. Evita contratarlos hasta regularizar.',
            providers['repse_expired'], '/app/rentas/mantenimiento', 'Ver proveedores')
    if providers['repse_expiring']:
        add('repse_expiring', 'medium', 'REPSE por vencer (60 días)',
            'Solicita la renovación al proveedor.',
            providers['repse_expiring'], '/app/rentas/mantenimiento', 'Ver proveedores')
    ops = ops or {}
    if ops.get('requests_new'):
        add('requests_new', 'medium', 'Solicitudes nuevas sin atender',
            'Responde para cumplir el SLA de primera respuesta.',
            ops['requests_new'], '/app/rentas/solicitudes', 'Ver solicitudes')
    if ops.get('requests_overdue'):
        add('requests_overdue', 'high', 'Solicitudes fuera de SLA',
            'Tiempo de respuesta o resolución vencido.',
            ops['requests_overdue'], '/app/rentas/solicitudes', 'Atender')
    if ops.get('orders_sla_overdue'):
        add('orders_sla', 'high', 'Órdenes de trabajo fuera de SLA',
            'Pasaron su fecha compromiso y siguen abiertas.',
            ops['orders_sla_overdue'], '/app/rentas/mantenimiento', 'Ver órdenes')
    if ops.get('plans_overdue'):
        add('plans_overdue', 'medium', 'Planes preventivos vencidos',
            'Genera las órdenes para no perder el calendario preventivo.',
            ops['plans_overdue'], '/app/rentas/preventivo', 'Ir a preventivo')
    if ops.get('assets_down'):
        add('assets_down', 'medium', 'Equipos fuera de operación',
            'Activos en falla, en mantenimiento o fuera de servicio.',
            ops['assets_down'], '/app/rentas/activos', 'Ver activos')
    if ops.get('assets_warranty'):
        add('assets_warranty', 'info', 'Garantías por vencer (60 días)',
            'Aprovecha la garantía antes de que termine.',
            ops['assets_warranty'], '/app/rentas/activos', 'Ver activos')
    vacancy = s['vacant'] + s['reserved']
    if vacancy and s['vacancy_loss']:
        add('vacancy', 'info', 'Unidades sin renta',
            f"{vacancy} unidad(es) disponibles dejan de generar ingreso.",
            vacancy, '/app/rentas/rentroll', 'Ver Rent Roll')
    if crm['open']:
        add('leads', 'info', 'Prospectos en seguimiento',
            'Da seguimiento para ocupar unidades vacantes.',
            crm['open'], '/app/rentas/crm', 'Ir a CRM')

    order = {'high': 0, 'medium': 1, 'info': 2}
    out.sort(key=lambda a: order.get(a['level'], 9))
    return out


def _missing_rent_charges(tenant, contracts, period):
    y, m = _period_parts(period)
    start = date(y, m, 1)
    end = date(y, m, monthrange(y, m)[1])
    covered = set(
        RentalCharge.objects.filter(tenant=tenant, period=period, contract__kind='renta')
        .exclude(status='cancelado').values_list('contract_id', flat=True)
    )
    n = 0
    for c in contracts:
        if c.kind != 'renta' or c.status not in ('activo', 'por_vencer', 'vencido'):
            continue
        if c.start_date > end or c.end_date < start:
            continue
        if c.id not in covered:
            n += 1
    return n


def build_dashboard_insights(tenant, period, contracts):
    today = date.today()
    y, m = _period_parts(period)
    period = f'{y:04d}-{m:02d}'
    start = date(y, m, 1)
    end = date(y, m, monthrange(y, m)[1])
    if start <= today <= end:
        as_of = today
    elif end < today:
        as_of = end
    else:
        as_of = start

    portfolio = _portfolio(tenant, as_of)
    finance = _finance(tenant, period, today)
    contract_stats = _contracts(tenant, contracts, today)
    maintenance = _maintenance(tenant, period, today)
    providers = _providers(tenant, today)
    crm = _crm(tenant, today)
    missing = _missing_rent_charges(tenant, contracts, period)
    ops = ops_summary(tenant)
    alerts = _alerts(
        portfolio, finance, contract_stats, maintenance, providers, crm,
        missing, period_is_past=end < today.replace(day=1), ops=ops,
    )
    from .models import RentalProperty
    from .rental_mode import filter_alerts, leasing_config
    mode = leasing_config(tenant)
    all_props = RentalProperty.objects.filter(tenant=tenant, is_active=True).exclude(status='inactiva')
    mode['properties_total'] = all_props.count()
    mode['operation_only'] = portfolio['summary'].get('operation_only', 0)
    alerts = filter_alerts(tenant, alerts)
    return {
        'as_of': str(as_of),
        'mode': mode,
        'portfolio': portfolio,
        'finance': finance,
        'contract_stats': contract_stats,
        'maintenance': maintenance,
        'providers': providers,
        'crm_stats': crm,
        'ops': ops,
        'alerts': alerts,
    }
