"""Indicadores operativos (CAFM / CMMS) de Administrar Propiedades."""
from __future__ import annotations

from collections import Counter, defaultdict
from datetime import date, timedelta
from decimal import Decimal

from django.utils import timezone

from .models import (
    RentalAsset, RentalInspection, RentalMaintenancePlan, RentalMaintenanceWork, RentalServiceRequest,
)
from .rental_mantenimiento import work_sla_state
from .rental_ops import add_months

MONTHS_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
OPEN_WORK = ('planeado', 'en_curso')
OPEN_REQ = ('nueva', 'en_proceso')
ZERO = Decimal('0')


def _f(v):
    return float(v or 0)


def _pct(num, den):
    return round(num / den * 100, 1) if den else None


def _hours(a, b):
    return (b - a).total_seconds() / 3600.0


def _key(d):
    return f'{d.year:04d}-{d.month:02d}'


def _label(key):
    y, m = key.split('-')
    return f'{MONTHS_ES[int(m) - 1]} {y[2:]}'


def _done_date(w):
    if w.completed_at:
        return timezone.localtime(w.completed_at).date()
    return w.performed_date or w.scheduled_date


def build_indicators(tenant, months=6):
    today = date.today()
    now = timezone.now()
    first = add_months(today.replace(day=1), -(months - 1))
    keys = []
    cur = first
    for _ in range(months):
        keys.append(_key(cur))
        cur = add_months(cur, 1)

    works = list(
        RentalMaintenanceWork.objects.filter(tenant=tenant).exclude(status='cancelado')
        .select_related('property', 'category', 'provider', 'asset')
    )

    def created_date(w):
        return timezone.localtime(w.created_at).date()

    open_w = [w for w in works if w.status in OPEN_WORK]
    done_in = [w for w in works if w.status == 'realizado' and (_done_date(w) or today) >= first]
    created_in = [w for w in works if created_date(w) >= first]

    # Flujo mensual
    flow = {k: {'created': 0, 'completed': 0, 'cost': ZERO} for k in keys}
    for w in created_in:
        k = _key(created_date(w))
        if k in flow:
            flow[k]['created'] += 1
    for w in done_in:
        d = _done_date(w) or today
        k = _key(d)
        if k in flow:
            flow[k]['completed'] += 1
            flow[k]['cost'] += w.cost or ZERO

    # MTTR y SLA
    corr_done = [w for w in done_in if w.kind == 'correctivo' and w.completed_at]
    mttr = round(sum(_hours(w.created_at, w.completed_at) for w in corr_done) / len(corr_done), 1) if corr_done else None
    sla_done = [work_sla_state(w) for w in done_in if w.due_at]
    sla_ok = sum(1 for s in sla_done if s == 'cumplida')
    sla_late = sum(1 for s in sla_done if s == 'tarde')

    # Preventivo
    pm_due = [w for w in works if w.kind == 'preventivo' and w.scheduled_date and w.scheduled_date >= first
              and (w.status == 'realizado' or (w.due_at and w.due_at < now))]
    pm_ok = sum(1 for w in pm_due if w.status == 'realizado' and work_sla_state(w) == 'cumplida')
    prev_n = sum(1 for w in created_in if w.kind == 'preventivo')
    corr_n = sum(1 for w in created_in if w.kind == 'correctivo')

    # Backlog por antigüedad
    age = {'0-7': 0, '8-30': 0, '31-90': 0, '90+': 0}
    for w in open_w:
        d = (today - created_date(w)).days
        age['0-7' if d <= 7 else '8-30' if d <= 30 else '31-90' if d <= 90 else '90+'] += 1

    prio_labels = {'urgente': 'Urgente', 'alta': 'Alta', 'media': 'Media', 'baja': 'Baja'}
    prio = Counter(w.priority for w in open_w)

    # Costos
    cost_total = sum((w.cost or ZERO for w in done_in), ZERO)
    parts = sum((w.parts_cost or ZERO for w in done_in), ZERO)
    labor = sum((w.labor_cost or ZERO for w in done_in), ZERO)
    by_cat = defaultdict(lambda: {'count': 0, 'cost': ZERO})
    by_prop = defaultdict(lambda: {'count': 0, 'cost': ZERO, 'code': '', 'name': ''})
    by_prov = defaultdict(lambda: {'name': '', 'orders': 0, 'cost': ZERO, 'hours': [], 'ok': 0, 'late': 0})
    for w in done_in:
        c = by_cat[w.category.name if w.category_id else 'Sin categoría']
        c['count'] += 1
        c['cost'] += w.cost or ZERO
        p = by_prop[w.property_id]
        p.update(code=w.property.code, name=w.property.name)
        p['count'] += 1
        p['cost'] += w.cost or ZERO
        if w.provider_id:
            pr = by_prov[w.provider_id]
            pr['name'] = w.provider.trade_name or w.provider.name
            pr['orders'] += 1
            pr['cost'] += w.cost or ZERO
            if w.completed_at:
                pr['hours'].append(_hours(w.created_at, w.completed_at))
            st = work_sla_state(w)
            pr['ok'] += st == 'cumplida'
            pr['late'] += st == 'tarde'

    # Activos
    assets = list(RentalAsset.objects.filter(tenant=tenant, is_active=True).select_related('property'))
    a_status = Counter(a.status for a in assets)
    a_crit = Counter(a.criticality for a in assets)
    fails = defaultdict(lambda: {'count': 0, 'cost': ZERO})
    for w in works:
        if w.asset_id and w.kind == 'correctivo' and created_date(w) >= first:
            fails[w.asset_id]['count'] += 1
            fails[w.asset_id]['cost'] += w.cost or ZERO
    by_id = {a.id: a for a in assets}
    top_fail = sorted(
        [
            {'id': str(i), 'code': by_id[i].code, 'name': by_id[i].name,
             'property_code': by_id[i].property.code, 'failures': v['count'], 'cost': _f(v['cost'])}
            for i, v in fails.items() if i in by_id
        ],
        key=lambda x: (x['failures'], x['cost']), reverse=True,
    )[:6]
    eol = []
    for a in assets:
        if a.install_date and a.useful_life_years:
            years = (today - a.install_date).days / 365.25
            if years >= a.useful_life_years * 0.9:
                eol.append({'id': str(a.id), 'code': a.code, 'name': a.name, 'property_code': a.property.code,
                            'age': round(years, 1), 'life': a.useful_life_years})
    warranty_soon = [
        {'id': str(a.id), 'code': a.code, 'name': a.name, 'property_code': a.property.code,
         'warranty_until': str(a.warranty_until)}
        for a in assets if a.warranty_until and today <= a.warranty_until <= today + timedelta(days=60)
    ]

    # Solicitudes
    reqs = list(RentalServiceRequest.objects.filter(tenant=tenant, created_at__date__gte=first))
    r_resp = [r for r in reqs if r.first_response_at]
    r_resp_ok = sum(1 for r in r_resp if r.response_due_at and r.first_response_at <= r.response_due_at)
    r_done = [r for r in reqs if r.resolved_at]
    r_res_ok = sum(1 for r in r_done if r.resolution_due_at and r.resolved_at <= r.resolution_due_at)
    sat = [r.satisfaction for r in reqs if r.satisfaction]
    status_labels = dict(RentalServiceRequest.STATUS_CHOICES)
    channel_labels = dict(RentalServiceRequest.CHANNEL_CHOICES)
    r_status = Counter(r.status for r in reqs)
    r_channel = Counter(r.channel for r in reqs)
    open_reqs_total = RentalServiceRequest.objects.filter(tenant=tenant, status__in=OPEN_REQ).count()

    # Inspecciones
    insp = list(RentalInspection.objects.filter(tenant=tenant, status='completada', inspected_date__gte=first))
    scores = [float(i.score) for i in insp if i.score is not None]

    plans = RentalMaintenancePlan.objects.filter(tenant=tenant, is_active=True)

    return {
        'months': months,
        'since': str(first),
        'kpis': {
            'open_orders': len(open_w),
            'overdue_orders': sum(1 for w in open_w if w.due_at and w.due_at < now),
            'completed': len(done_in),
            'mttr_hours': mttr,
            'sla_pct': _pct(sla_ok, sla_ok + sla_late),
            'pm_compliance_pct': _pct(pm_ok, len(pm_due)),
            'preventive_pct': _pct(prev_n, prev_n + corr_n),
            'cost_total': _f(cost_total),
            'cost_avg': _f(cost_total / len(done_in)) if done_in else 0,
            'open_requests': open_reqs_total,
            'avg_response_hours': round(sum(_hours(r.created_at, r.first_response_at) for r in r_resp) / len(r_resp), 1) if r_resp else None,
            'satisfaction': round(sum(sat) / len(sat), 2) if sat else None,
            'assets_total': len(assets),
            'assets_down': a_status.get('en_falla', 0) + a_status.get('en_mantenimiento', 0) + a_status.get('fuera_servicio', 0),
            'plans_active': plans.count(),
            'plans_overdue': plans.filter(next_due_date__lt=today).count(),
        },
        'flow': [
            {'period': k, 'label': _label(k), 'created': flow[k]['created'],
             'completed': flow[k]['completed'], 'cost': _f(flow[k]['cost'])}
            for k in keys
        ],
        'mix': [
            {'key': 'preventivo', 'label': 'Preventivo', 'value': prev_n},
            {'key': 'correctivo', 'label': 'Correctivo', 'value': corr_n},
        ],
        'backlog_age': [
            {'key': '0-7', 'label': '0–7 días', 'value': age['0-7']},
            {'key': '8-30', 'label': '8–30 días', 'value': age['8-30']},
            {'key': '31-90', 'label': '31–90 días', 'value': age['31-90']},
            {'key': '90+', 'label': 'Más de 90', 'value': age['90+']},
        ],
        'backlog_priority': [
            {'key': k, 'label': prio_labels[k], 'value': prio.get(k, 0)} for k in prio_labels
        ],
        'cost': {
            'total': _f(cost_total), 'parts': _f(parts), 'labor': _f(labor),
            'by_category': sorted(
                [{'name': k, 'count': v['count'], 'cost': _f(v['cost'])} for k, v in by_cat.items()],
                key=lambda x: x['cost'], reverse=True)[:7],
            'by_property': sorted(
                [{'code': v['code'], 'name': v['name'], 'count': v['count'], 'cost': _f(v['cost'])} for v in by_prop.values()],
                key=lambda x: x['cost'], reverse=True)[:6],
        },
        'providers': sorted(
            [{
                'name': v['name'], 'orders': v['orders'], 'cost': _f(v['cost']),
                'avg_hours': round(sum(v['hours']) / len(v['hours']), 1) if v['hours'] else None,
                'sla_pct': _pct(v['ok'], v['ok'] + v['late']),
            } for v in by_prov.values()],
            key=lambda x: x['orders'], reverse=True)[:6],
        'assets': {
            'by_status': [
                {'key': k, 'label': lbl, 'value': a_status.get(k, 0)}
                for k, lbl in RentalAsset.STATUS_CHOICES if a_status.get(k, 0)
            ],
            'by_criticality': [
                {'key': k, 'label': lbl, 'value': a_crit.get(k, 0)}
                for k, lbl in RentalAsset.CRITICALITY_CHOICES
            ],
            'top_failures': top_fail,
            'end_of_life': eol[:6],
            'warranty_soon': warranty_soon[:6],
        },
        'requests': {
            'total': len(reqs),
            'by_status': [
                {'key': k, 'label': status_labels[k], 'value': r_status.get(k, 0)}
                for k in status_labels if r_status.get(k, 0)
            ],
            'by_channel': [
                {'key': k, 'label': channel_labels.get(k, k), 'value': v} for k, v in r_channel.most_common()
            ],
            'response_sla_pct': _pct(r_resp_ok, len(r_resp)),
            'resolution_sla_pct': _pct(r_res_ok, len(r_done)),
        },
        'inspections': {
            'completed': len(insp),
            'avg_score': round(sum(scores) / len(scores), 1) if scores else None,
        },
    }


def ops_summary(tenant):
    """Resumen corto para el dashboard general."""
    now = timezone.now()
    today = date.today()
    reqs = RentalServiceRequest.objects.filter(tenant=tenant, status__in=OPEN_REQ)
    plans = RentalMaintenancePlan.objects.filter(tenant=tenant, is_active=True)
    assets = RentalAsset.objects.filter(tenant=tenant, is_active=True)
    works = RentalMaintenanceWork.objects.filter(tenant=tenant, status__in=OPEN_WORK)
    return {
        'requests_open': reqs.count(),
        'requests_new': reqs.filter(status='nueva').count(),
        'requests_overdue': sum(
            1 for r in reqs
            if (r.resolution_due_at and r.resolution_due_at < now)
            or (not r.first_response_at and r.response_due_at and r.response_due_at < now)
        ),
        'plans_active': plans.count(),
        'plans_overdue': plans.filter(next_due_date__lt=today).count(),
        'assets_total': assets.count(),
        'assets_down': assets.filter(status__in=('en_falla', 'en_mantenimiento', 'fuera_servicio')).count(),
        'assets_warranty': assets.filter(warranty_until__gte=today, warranty_until__lte=today + timedelta(days=60)).count(),
        'orders_sla_overdue': works.filter(due_at__lt=now).count(),
        'inspections_open': RentalInspection.objects.filter(tenant=tenant, status='en_proceso').count(),
    }
