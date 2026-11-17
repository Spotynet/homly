"""Reportes de Administrar Propiedades.

- Informes rápidos: catálogo de conjuntos de datos con filtros, columnas y exportación.
- Informe anual: planeación del mantenimiento preventivo por semana.
- Cumplimiento de proveedores: SLA y riesgo de sanción.
- Resumen de widgets (panel global) y agenda de eventos para el calendario del dashboard.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta

from django.db.models import Count, Q, Sum
from django.utils import timezone
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import (
    RentalAsset, RentalCharge, RentalContract, RentalInspection, RentalMaintenancePlan,
    RentalMaintenanceProvider, RentalMaintenanceWork, RentalPayment,
    RentalProperty, RentalServiceRequest, RentalSpace, Tenant,
)
from .rental_access import READ, RentalAccess, user_level
from .rental_mantenimiento import work_sla_state
from .rental_ops import add_months, advance_date
from .rental_views import _require_rentas

MONTHS_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
OPEN_WORK = ('planeado', 'en_curso')
OPEN_REQ = ('nueva', 'en_proceso')
ROW_LIMIT = 5000


def _f(v):
    return float(v or 0)


def _d(v):
    return v.isoformat() if v else ''


def _dt_date(v):
    return timezone.localtime(v).date().isoformat() if v else ''


def _prop(p):
    return f'{p.code} · {p.name}' if p else ''


def _label(choices, key):
    return dict(choices).get(key, key or '')


def _parse_day(raw):
    try:
        return date.fromisoformat((raw or '').strip()[:10])
    except ValueError:
        return None


def _tenant(tenant_id):
    tenant = Tenant.objects.get(id=tenant_id)
    _require_rentas(tenant)
    return tenant


# ─── Informes rápidos ────────────────────────────────────────────────────────

def _col(key, label, kind='text'):
    return {'key': key, 'label': label, 'type': kind}


def ds_ordenes(tenant, f):
    qs = (
        RentalMaintenanceWork.objects.filter(tenant=tenant)
        .select_related('property', 'space', 'asset', 'category', 'provider', 'capex_project')
    )
    if f['date_from']:
        qs = qs.filter(Q(scheduled_date__gte=f['date_from']) | Q(performed_date__gte=f['date_from']))
    if f['date_to']:
        qs = qs.filter(Q(scheduled_date__lte=f['date_to']) | Q(performed_date__lte=f['date_to']))
    rows = []
    for w in qs:
        rows.append({
            'folio': w.folio, 'title': w.title, 'kind': _label(RentalMaintenanceWork.KIND_CHOICES, w.kind),
            'status': w.status, 'status_label': _label(RentalMaintenanceWork.STATUS_CHOICES, w.status),
            'priority': _label(RentalMaintenanceWork.PRIORITY_CHOICES, w.priority),
            'property_id': str(w.property_id), 'property': _prop(w.property), 'space': w.space.label if w.space_id else '',
            'asset': f'{w.asset.code} · {w.asset.name}' if w.asset_id else '',
            'category': w.category.name if w.category_id else '',
            'provider': (w.provider.trade_name or w.provider.name) if w.provider_id else w.vendor_name,
            'assigned_to': w.assigned_to,
            'scheduled_date': _d(w.scheduled_date), 'performed_date': _d(w.performed_date),
            'due_date': _dt_date(w.due_at),
            'sla': {'cumplida': 'Cumplida', 'tarde': 'Tarde', 'vencida': 'Vencida', 'por_vencer': 'Por vencer',
                    'en_tiempo': 'En tiempo'}.get(work_sla_state(w), ''),
            'cost': _f(w.cost), 'capex': w.capex_project.code if w.capex_project_id else '',
        })
    cols = [
        _col('folio', 'Folio'), _col('title', 'Trabajo'), _col('kind', 'Tipo'), _col('status_label', 'Estatus'),
        _col('priority', 'Prioridad'), _col('property', 'Propiedad'), _col('space', 'Espacio'), _col('asset', 'Equipo'),
        _col('category', 'Categoría'), _col('provider', 'Proveedor'), _col('assigned_to', 'Responsable'),
        _col('scheduled_date', 'Programada', 'date'), _col('performed_date', 'Realizada', 'date'),
        _col('due_date', 'Límite SLA', 'date'), _col('sla', 'SLA'), _col('cost', 'Costo', 'money'),
        _col('capex', 'Proyecto CAPEX'),
    ]
    return cols, rows, ['cost']


def ds_solicitudes(tenant, f):
    qs = RentalServiceRequest.objects.filter(tenant=tenant).select_related('property', 'space', 'asset')
    if f['date_from']:
        qs = qs.filter(created_at__date__gte=f['date_from'])
    if f['date_to']:
        qs = qs.filter(created_at__date__lte=f['date_to'])
    now = timezone.now()
    rows = []
    for r in qs:
        resp_h = ((r.first_response_at - r.created_at).total_seconds() / 3600) if r.first_response_at else None
        overdue = r.status in OPEN_REQ and r.resolution_due_at and now > r.resolution_due_at
        rows.append({
            'folio': r.folio, 'title': r.title, 'property_id': str(r.property_id), 'property': _prop(r.property),
            'space': r.space.label if r.space_id else '',
            'requester': r.requester_name, 'channel': r.channel,
            'priority': _label(RentalServiceRequest.PRIORITY_CHOICES, r.priority),
            'status': r.status, 'status_label': _label(RentalServiceRequest.STATUS_CHOICES, r.status),
            'created': _dt_date(r.created_at), 'response_h': round(resp_h, 1) if resp_h is not None else None,
            'resolved': _dt_date(r.resolved_at), 'sla': 'Vencida' if overdue else ('En tiempo' if r.status in OPEN_REQ else ''),
            'satisfaction': r.satisfaction,
        })
    cols = [
        _col('folio', 'Folio'), _col('title', 'Solicitud'), _col('property', 'Propiedad'), _col('space', 'Espacio'), _col('requester', 'Solicitante'),
        _col('channel', 'Canal'), _col('priority', 'Prioridad'), _col('status_label', 'Estatus'),
        _col('created', 'Creada', 'date'), _col('response_h', 'Primera respuesta (h)', 'number'),
        _col('resolved', 'Resuelta', 'date'), _col('sla', 'SLA'), _col('satisfaction', 'Satisfacción (1-5)', 'number'),
    ]
    return cols, rows, []


def ds_activos(tenant, f):
    qs = RentalAsset.objects.filter(tenant=tenant, is_active=True).select_related('property', 'space', 'provider', 'capex_project')
    if f['date_from']:
        qs = qs.filter(install_date__gte=f['date_from'])
    if f['date_to']:
        qs = qs.filter(install_date__lte=f['date_to'])
    today = date.today()
    rows = []
    for a in qs:
        age = round((today - a.install_date).days / 365.25, 1) if a.install_date else None
        rows.append({
            'code': a.code, 'name': a.name, 'kind': a.kind, 'property_id': str(a.property_id),
            'property': _prop(a.property), 'space': a.space.label if a.space_id else '', 'brand': ' '.join(x for x in (a.brand, a.model) if x),
            'status': a.status, 'status_label': a.get_status_display(), 'criticality': a.get_criticality_display(),
            'install_date': _d(a.install_date), 'warranty_until': _d(a.warranty_until),
            'useful_life': a.useful_life_years, 'age': age, 'purchase_cost': _f(a.purchase_cost),
            'provider': (a.provider.trade_name or a.provider.name) if a.provider_id else '',
            'capex': a.capex_project.code if a.capex_project_id else '',
        })
    cols = [
        _col('code', 'Código'), _col('name', 'Equipo'), _col('kind', 'Tipo'), _col('property', 'Propiedad'), _col('space', 'Espacio'),
        _col('brand', 'Marca / modelo'), _col('status_label', 'Estado'), _col('criticality', 'Criticidad'),
        _col('install_date', 'Instalación', 'date'), _col('warranty_until', 'Garantía hasta', 'date'),
        _col('useful_life', 'Vida útil (años)', 'number'), _col('age', 'Antigüedad (años)', 'number'),
        _col('purchase_cost', 'Costo de compra', 'money'), _col('provider', 'Proveedor'), _col('capex', 'Proyecto CAPEX'),
    ]
    return cols, rows, ['purchase_cost']


def ds_contratos(tenant, f):
    qs = RentalContract.objects.filter(tenant=tenant).select_related('property', 'space', 'tenant_party', 'provider')
    if f['date_from']:
        qs = qs.filter(end_date__gte=f['date_from'])
    if f['date_to']:
        qs = qs.filter(end_date__lte=f['date_to'])
    today = date.today()
    rows = []
    for c in qs:
        rows.append({
            'code': c.code, 'kind': _label(RentalContract.KIND_CHOICES, c.kind), 'title': c.title,
            'property_id': str(c.property_id) if c.property_id else '', 'property': _prop(c.property) if c.property_id else '',
            'space': c.space.label if c.space_id else '', 'party': c.counterpart_label, 'start_date': _d(c.start_date), 'end_date': _d(c.end_date),
            'status': c.status, 'status_label': _label(RentalContract.STATUS_CHOICES, c.status),
            'rent': _f(c.rent_amount), 'deposit': _f(c.deposit_amount), 'days_left': (c.end_date - today).days,
        })
    cols = [
        _col('code', 'Código'), _col('kind', 'Tipo'), _col('title', 'Contrato'), _col('property', 'Propiedad'), _col('space', 'Espacio'),
        _col('party', 'Contraparte'), _col('start_date', 'Inicio', 'date'), _col('end_date', 'Fin', 'date'),
        _col('days_left', 'Días restantes', 'number'), _col('status_label', 'Estatus'),
        _col('rent', 'Renta', 'money'), _col('deposit', 'Depósito', 'money'),
    ]
    return cols, rows, ['rent', 'deposit']


def ds_cargos(tenant, f):
    qs = (
        RentalCharge.objects.filter(tenant=tenant)
        .select_related('contract', 'contract__property', 'contract__tenant_party', 'contract__provider', 'concept')
        .annotate(paid=Sum('payments__amount'))
    )
    if f['date_from']:
        qs = qs.filter(due_date__gte=f['date_from'])
    if f['date_to']:
        qs = qs.filter(due_date__lte=f['date_to'])
    today = date.today()
    rows = []
    for ch in qs:
        paid = _f(ch.paid)
        amount = _f(ch.amount)
        c = ch.contract
        overdue = ch.status in ('pendiente', 'parcial') and ch.due_date and ch.due_date < today
        rows.append({
            'period': ch.period, 'contract': c.code, 'property_id': str(c.property_id) if c.property_id else '',
            'property': _prop(c.property) if c.property_id else '', 'party': c.counterpart_label,
            'concept': ch.concept.name if ch.concept_id else '', 'amount': amount, 'paid': paid, 'balance': round(max(0, amount - paid), 2),
            'due_date': _d(ch.due_date), 'status': ch.status,
            'status_label': 'Vencido' if overdue else _label(RentalCharge.STATUS_CHOICES, ch.status),
        })
    cols = [
        _col('period', 'Periodo'), _col('contract', 'Contrato'), _col('property', 'Propiedad'), _col('party', 'Inquilino'),
        _col('concept', 'Concepto'), _col('amount', 'Cargo', 'money'), _col('paid', 'Pagado', 'money'),
        _col('balance', 'Saldo', 'money'), _col('due_date', 'Vence', 'date'), _col('status_label', 'Estatus'),
    ]
    return cols, rows, ['amount', 'paid', 'balance']


def ds_pagos(tenant, f):
    qs = RentalPayment.objects.filter(tenant=tenant).select_related(
        'contract', 'contract__property', 'contract__tenant_party', 'contract__provider', 'charge', 'charge__concept',
    )
    if f['date_from']:
        qs = qs.filter(payment_date__gte=f['date_from'])
    if f['date_to']:
        qs = qs.filter(payment_date__lte=f['date_to'])
    rows = []
    for p in qs:
        c = p.contract
        rows.append({
            'date': _d(p.payment_date), 'contract': c.code, 'property_id': str(c.property_id) if c.property_id else '',
            'property': _prop(c.property) if c.property_id else '', 'party': c.counterpart_label,
            'concept': p.charge.concept.name if p.charge_id and p.charge.concept_id else '', 'amount': _f(p.amount),
            'type': p.payment_type, 'reference': p.reference, 'status': 'pagado', 'status_label': 'Pagado',
        })
    cols = [
        _col('date', 'Fecha', 'date'), _col('contract', 'Contrato'), _col('property', 'Propiedad'), _col('party', 'Inquilino'),
        _col('concept', 'Concepto'), _col('amount', 'Monto', 'money'), _col('type', 'Forma de pago'), _col('reference', 'Referencia'),
    ]
    return cols, rows, ['amount']


def ds_gastos(tenant, f):
    from .rental_finance import ledger_rows
    today = date.today()
    d_from = f['date_from'] or date(today.year, 1, 1)
    d_to = f['date_to'] or date(today.year, 12, 31)
    rows = []
    for r in ledger_rows(tenant, d_from, d_to):
        rows.append({
            'date': r['date'], 'kind': r['kind'].upper(), 'category': r['category_label'], 'concept': r['concept'],
            'property_id': r['property'], 'property': f"{r['property_code']} · {r['property_name']}" if r['property_code'] else '',
            'space': r.get('space_name') or '',
            'project': r['project_code'], 'vendor': r['vendor'], 'ref': r['ref'], 'amount': r['amount'],
            'status': r['status'], 'status_label': 'Pagado' if r['status'] == 'pagado' else 'Comprometido',
            'source': 'Orden de trabajo' if r['source'] == 'orden' else 'Captura manual',
        })
    cols = [
        _col('date', 'Fecha', 'date'), _col('kind', 'Tipo'), _col('category', 'Categoría'), _col('concept', 'Concepto'),
        _col('property', 'Propiedad'), _col('space', 'Espacio'), _col('project', 'Proyecto CAPEX'), _col('vendor', 'Proveedor'),
        _col('ref', 'Referencia'), _col('amount', 'Monto', 'money'), _col('status_label', 'Estatus'), _col('source', 'Origen'),
    ]
    return cols, rows, ['amount']


def ds_inspecciones(tenant, f):
    qs = RentalInspection.objects.filter(tenant=tenant).select_related('property', 'space', 'asset').prefetch_related('works')
    if f['date_from']:
        qs = qs.filter(inspected_date__gte=f['date_from'])
    if f['date_to']:
        qs = qs.filter(inspected_date__lte=f['date_to'])
    rows = []
    for i in qs:
        res = i.results or []
        fails = sum(1 for r in res if r.get('result') == 'falla')
        rows.append({
            'folio': i.folio, 'name': i.name, 'property_id': str(i.property_id), 'property': _prop(i.property), 'space': i.space.label if i.space_id else '',
            'asset': f'{i.asset.code} · {i.asset.name}' if i.asset_id else '', 'inspector': i.inspector_name,
            'date': _d(i.inspected_date), 'status': i.status, 'status_label': _label(RentalInspection.STATUS_CHOICES, i.status),
            'score': _f(i.score) if i.score is not None else None, 'fails': fails,
            'evidences': i.evidences.count(), 'orders': len(i.works.all()),
        })
    cols = [
        _col('folio', 'Folio'), _col('name', 'Inspección'), _col('property', 'Propiedad'), _col('space', 'Espacio'), _col('asset', 'Equipo'),
        _col('inspector', 'Inspector'), _col('date', 'Fecha', 'date'), _col('status_label', 'Estatus'),
        _col('score', 'Calificación (%)', 'number'), _col('fails', 'Fallas', 'number'),
        _col('evidences', 'Evidencias', 'number'), _col('orders', 'Órdenes generadas', 'number'),
    ]
    return cols, rows, []


def ds_proveedores(tenant, f):
    qs = RentalMaintenanceProvider.objects.filter(tenant=tenant).annotate(
        orders=Count('works', distinct=True), spent=Sum('works__cost'),
    )
    rows = []
    for p in qs:
        rows.append({
            'name': p.trade_name or p.name, 'person': 'Moral' if p.person_type == 'moral' else 'Física',
            'contact': p.contact_name, 'email': p.email, 'phone': p.phone or p.mobile,
            'status': p.status, 'status_label': p.get_status_display(),
            'repse': p.get_repse_status_display() if p.is_repse else 'No aplica',
            'expediente': 'Sí' if p.has_expediente else 'No',
            'orders': getattr(p, 'orders', None), 'spent': _f(getattr(p, 'spent', 0)),
            'property_id': '',
        })
    cols = [
        _col('name', 'Proveedor'), _col('person', 'Persona'), _col('contact', 'Contacto'), _col('email', 'Correo'),
        _col('phone', 'Teléfono'), _col('status_label', 'Estado'), _col('repse', 'REPSE'), _col('expediente', 'Expediente'),
        _col('orders', 'Órdenes', 'number'), _col('spent', 'Costo acumulado', 'money'),
    ]
    return cols, rows, ['spent']


def ds_espacios(tenant, f):
    """Directorio de espacios Multi Tenant: GLA, inquilino y contactos por espacio."""
    from .rental_spaces import live_contracts
    qs = RentalSpace.objects.filter(tenant=tenant).select_related('property', 'parent')
    rows = []
    for s in qs:
        cs = live_contracts(s)
        c = next((x for x in cs if x.status != 'borrador'), cs[0] if cs else None)
        contacts = s.contacts if isinstance(s.contacts, list) else []
        main = contacts[0] if contacts else {}
        rows.append({
            'property_id': str(s.property_id), 'property': _prop(s.property),
            'park': s.property.park_name, 'city': s.property.city,
            'building': s.building or s.property.building_number, 'floor': s.floor, 'zone': s.zone,
            'code': s.code, 'name': s.name, 'type': s.get_space_type_display(),
            'status': s.status, 'status_label': s.get_status_display(),
            'area': _f(s.area_m2), 'suggested': _f(s.suggested_rent),
            'tenant_name': (c.tenant_party.full_name if c and c.tenant_party_id else (c.counterpart_label if c else '')),
            'contract': c.code if c else '', 'rent': _f(c.rent_amount) if c and c.status != 'borrador' else 0,
            'end_date': _d(c.end_date) if c else '',
            'contact': main.get('name', ''), 'contact_email': main.get('email', ''), 'contact_phone': main.get('phone', ''),
        })
    cols = [
        _col('property', 'Propiedad'), _col('park', 'Park'), _col('city', 'Ciudad'), _col('building', 'Building'),
        _col('floor', 'Piso'), _col('code', 'Espacio'), _col('name', 'Nombre'), _col('type', 'Tipo'),
        _col('status_label', 'Estatus'), _col('area', 'M²', 'number'), _col('tenant_name', 'Inquilino'),
        _col('contract', 'Contrato'), _col('end_date', 'Vence', 'date'), _col('rent', 'Renta', 'money'),
        _col('suggested', 'Renta sugerida', 'money'), _col('contact', 'Contacto'),
        _col('contact_email', 'Correo'), _col('contact_phone', 'Teléfono'),
    ]
    return cols, rows, ['area', 'rent', 'suggested']


DATASETS = {
    'ordenes': ('Órdenes de trabajo', 'Preventivas y correctivas con SLA, responsable y costo.', ds_ordenes, 'Rango por fecha programada o realizada'),
    'solicitudes': ('Solicitudes', 'Reportes de inquilinos con tiempos de respuesta y satisfacción.', ds_solicitudes, 'Rango por fecha de creación'),
    'activos': ('Activos y equipos', 'Inventario con garantía, vida útil y costo de compra.', ds_activos, 'Rango por fecha de instalación'),
    'contratos': ('Contratos', 'Vigencias, rentas y depósitos.', ds_contratos, 'Rango por fecha de vencimiento'),
    'cargos': ('Cobranza (cargos)', 'Cargos con pagado, saldo y estatus.', ds_cargos, 'Rango por fecha de vencimiento'),
    'pagos': ('Pagos recibidos', 'Ingresos cobrados por contrato.', ds_pagos, 'Rango por fecha de pago'),
    'gastos': ('OPEX y CAPEX', 'Libro de gastos operativos y de inversión (incluye costos de órdenes).', ds_gastos, 'Rango por fecha del gasto (año actual por defecto)'),
    'inspecciones': ('Inspecciones', 'Calificación, fallas y evidencias por inspección.', ds_inspecciones, 'Rango por fecha de inspección'),
    'espacios': ('Espacios y GLA', 'Locales, bays y oficinas de propiedades Multi Tenant con inquilino, M² y contactos.', ds_espacios, ''),
    'proveedores': ('Proveedores', 'Directorio con REPSE, expediente y costos.', ds_proveedores, ''),
}


# Cada informe exige, además de «Reportes», acceso de lectura al módulo del que viene la información.
DATASET_MODULE = {
    'ordenes': 'rentas_mantenimiento', 'solicitudes': 'rentas_solicitudes', 'activos': 'rentas_activos',
    'contratos': 'rentas_contratos', 'cargos': 'rentas_cobranza', 'pagos': 'rentas_cobranza',
    'gastos': 'rentas_capex', 'inspecciones': 'rentas_inspecciones', 'espacios': 'rentas_propiedades',
    'proveedores': 'rentas_mantenimiento',
}


def _can_read(request, tenant_id, module):
    return user_level(request, tenant_id, module) >= READ


class ReportCatalogView(APIView):
    permission_classes = [RentalAccess('rentas_reportes')]

    def get(self, request, tenant_id):
        _tenant(tenant_id)
        return Response([
            {'key': k, 'label': v[0], 'description': v[1], 'range_hint': v[3]}
            for k, v in DATASETS.items() if _can_read(request, tenant_id, DATASET_MODULE.get(k, ''))
        ])


class ReportRunView(APIView):
    permission_classes = [RentalAccess('rentas_reportes')]

    def get(self, request, tenant_id, key):
        tenant = _tenant(tenant_id)
        if key not in DATASETS:
            return Response({'detail': 'Informe no encontrado.'}, status=404)
        if not _can_read(request, tenant_id, DATASET_MODULE.get(key, '')):
            return Response({'detail': 'Tu perfil no tiene acceso a este informe.'}, status=403)
        p = request.query_params
        flt = {'date_from': _parse_day(p.get('date_from')), 'date_to': _parse_day(p.get('date_to'))}
        cols, rows, sum_keys = DATASETS[key][2](tenant, flt)
        if p.get('property'):
            rows = [r for r in rows if r.get('property_id') == p['property']]
        if p.get('status'):
            rows = [r for r in rows if r.get('status') == p['status']]
        q = (p.get('q') or '').strip().lower()
        if q:
            rows = [r for r in rows if any(q in str(r.get(c['key'], '')).lower() for c in cols if c['type'] in ('text', 'date'))]
        order = p.get('order') or ''
        desc = order.startswith('-')
        okey = order.lstrip('-')
        if okey and any(c['key'] == okey for c in cols):
            rows.sort(key=lambda r: (r.get(okey) is None, r.get(okey) if r.get(okey) is not None else ''), reverse=desc)
        total = len(rows)
        totals = {k: round(sum(_f(r.get(k)) for r in rows), 2) for k in sum_keys}
        statuses = sorted({(r.get('status'), r.get('status_label')) for r in rows if r.get('status')})
        return Response({
            'key': key, 'label': DATASETS[key][0], 'columns': cols, 'rows': rows[:ROW_LIMIT], 'count': total,
            'truncated': total > ROW_LIMIT, 'totals': totals,
            'statuses': [{'value': s, 'label': lbl or s} for s, lbl in statuses],
            'generated_at': timezone.now().isoformat(),
        })


# ─── Informe anual (preventivo por semana) ───────────────────────────────────

WEEKS = 53


def _week(d):
    return min(WEEKS - 1, (d.timetuple().tm_yday - 1) // 7)


_RANK = {'': 0, 'd': 1, 'p': 2, 'c': 3, 'o': 4}


def build_annual(tenant, year):
    today = date.today()
    y_from, y_to = date(year, 1, 1), date(year, 12, 31)
    plans = list(
        RentalMaintenancePlan.objects.filter(tenant=tenant, is_active=True)
        .select_related('property', 'asset', 'category', 'provider')
    )
    works = (
        RentalMaintenanceWork.objects.filter(tenant=tenant, plan__in=plans).exclude(status='cancelado')
        .filter(Q(scheduled_date__range=(y_from, y_to)) | Q(performed_date__range=(y_from, y_to)))
    )
    by_plan = defaultdict(list)
    for w in works:
        by_plan[w.plan_id].append(w)
    groups = defaultdict(list)
    for pl in plans:
        cells = [''] * WEEKS

        def mark(d, code, cells=cells):
            if y_from <= d <= y_to:
                i = _week(d)
                if _RANK[code] > _RANK[cells[i]]:
                    cells[i] = code
        covered = set()
        for w in by_plan.get(pl.id, []):
            if w.status == 'realizado':
                mark(w.performed_date or w.scheduled_date or today, 'd')
                covered.add(w.scheduled_date)
            else:
                d = w.scheduled_date or w.performed_date
                if not d:
                    continue
                covered.add(d)
                mark(d, 'c' if w.status == 'en_curso' else ('o' if d < today else 'p'))
        # ocurrencias futuras proyectadas desde la próxima fecha del plan
        d = pl.next_due_date
        guard = 0
        while d and d <= y_to and guard < 400:
            if d >= y_from and d >= today and d not in covered:
                mark(d, 'p')
            elif d < today and d >= y_from and d not in covered and not by_plan.get(pl.id):
                mark(d, 'o')
            nxt = advance_date(d, pl.frequency)
            if nxt <= d:
                break
            d, guard = nxt, guard + 1
        counts = {k: sum(1 for c in cells if c == k) for k in ('d', 'p', 'o', 'c')}
        groups[pl.category.name if pl.category_id else 'Sin categoría'].append({
            'id': str(pl.id), 'name': pl.name, 'property': _prop(pl.property),
            'asset': f'{pl.asset.code} · {pl.asset.name}' if pl.asset_id else '',
            'frequency': pl.get_frequency_display(),
            'provider': (pl.provider.trade_name or pl.provider.name) if pl.provider_id else '',
            'cells': cells, 'counts': counts,
        })
    out = []
    for name in sorted(groups):
        rows = sorted(groups[name], key=lambda r: r['name'])
        out.append({
            'category': name, 'rows': rows,
            'counts': {k: sum(r['counts'][k] for r in rows) for k in ('d', 'p', 'o', 'c')},
        })
    totals = {k: sum(g['counts'][k] for g in out) for k in ('d', 'p', 'o', 'c')}
    done_or_late = totals['d'] + totals['o']
    # etiqueta de inicio de mes por semana
    month_starts = {}
    for m in range(1, 13):
        month_starts[_week(date(year, m, 1))] = MONTHS_ES[m - 1]
    return {
        'year': year, 'weeks': WEEKS, 'today_week': _week(today) if today.year == year else None,
        'month_starts': {str(k): v for k, v in month_starts.items()},
        'groups': out, 'totals': totals,
        'compliance_pct': round(totals['d'] / done_or_late * 100, 1) if done_or_late else None,
    }


class AnnualReportView(APIView):
    permission_classes = [RentalAccess('rentas_reportes')]

    def get(self, request, tenant_id):
        if not _can_read(request, tenant_id, 'rentas_preventivo'):
            return Response({'detail': 'Tu perfil no tiene acceso a este informe.'}, status=403)
        tenant = _tenant(tenant_id)
        try:
            year = int(request.query_params.get('year') or date.today().year)
        except ValueError:
            year = date.today().year
        if not 2000 <= year <= 2100:
            year = date.today().year
        return Response(build_annual(tenant, year))


# ─── Cumplimiento de proveedores (SLA y sanciones) ───────────────────────────

def build_provider_sla(tenant, months=12, threshold=80):
    since = date.today() - timedelta(days=30 * months)
    works = list(
        RentalMaintenanceWork.objects.filter(tenant=tenant, provider__isnull=False)
        .exclude(status='cancelado').filter(due_at__isnull=False)
        .filter(Q(created_at__date__gte=since))
        .select_related('provider', 'property')
    )
    acc = defaultdict(lambda: {
        'on_time': 0, 'late': 0, 'overdue_open': 0, 'open': 0, 'delay_h': [], 'res_h': [], 'cost': 0.0, 'late_orders': [], 'orders': 0,
    })
    names = {}
    for w in works:
        a = acc[w.provider_id]
        names[w.provider_id] = w.provider.trade_name or w.provider.name
        a['orders'] += 1
        a['cost'] += _f(w.cost)
        st = work_sla_state(w)
        if st == 'cumplida':
            a['on_time'] += 1
        elif st == 'tarde':
            a['late'] += 1
            if w.completed_at:
                dh = (w.completed_at - w.due_at).total_seconds() / 3600
                a['delay_h'].append(dh)
                a['late_orders'].append({'folio': w.folio, 'title': w.title, 'property': w.property.code, 'delay_h': round(dh, 1)})
        elif st == 'vencida':
            a['overdue_open'] += 1
            dh = (timezone.now() - w.due_at).total_seconds() / 3600
            a['late_orders'].append({'folio': w.folio, 'title': w.title, 'property': w.property.code, 'delay_h': round(dh, 1), 'open': True})
        if w.status in OPEN_WORK:
            a['open'] += 1
        if w.status == 'realizado' and w.started_at and w.completed_at:
            a['res_h'].append((w.completed_at - w.started_at).total_seconds() / 3600)
    rows = []
    for pid, a in acc.items():
        evaluated = a['on_time'] + a['late'] + a['overdue_open']
        pct = round(a['on_time'] / evaluated * 100, 1) if evaluated else None
        breaches = a['late'] + a['overdue_open']
        if evaluated >= 3 and pct is not None and pct < threshold - 15:
            risk = 'alto'
        elif (evaluated >= 3 and pct is not None and pct < threshold) or a['overdue_open'] >= 2:
            risk = 'medio'
        else:
            risk = 'ok'
        rows.append({
            'provider_id': str(pid), 'provider': names[pid], 'orders': a['orders'], 'evaluated': evaluated,
            'on_time': a['on_time'], 'late': a['late'], 'overdue_open': a['overdue_open'], 'open': a['open'],
            'breaches': breaches, 'compliance_pct': pct,
            'avg_delay_h': round(sum(a['delay_h']) / len(a['delay_h']), 1) if a['delay_h'] else None,
            'avg_resolution_h': round(sum(a['res_h']) / len(a['res_h']), 1) if a['res_h'] else None,
            'cost': round(a['cost'], 2), 'risk': risk,
            'late_orders': sorted(a['late_orders'], key=lambda x: -x['delay_h'])[:5],
        })
    order = {'alto': 0, 'medio': 1, 'ok': 2}
    rows.sort(key=lambda r: (order[r['risk']], r['compliance_pct'] if r['compliance_pct'] is not None else 101, -r['breaches']))
    return {
        'months': months, 'threshold': threshold, 'providers': rows,
        'at_risk': sum(1 for r in rows if r['risk'] != 'ok'),
        'overall_pct': (lambda t, n: round(t / n * 100, 1) if n else None)(
            sum(r['on_time'] for r in rows), sum(r['evaluated'] for r in rows)),
    }


class ProviderSlaView(APIView):
    permission_classes = [RentalAccess('rentas_reportes')]

    def get(self, request, tenant_id):
        if not _can_read(request, tenant_id, 'rentas_mantenimiento'):
            return Response({'detail': 'Tu perfil no tiene acceso a este informe.'}, status=403)
        tenant = _tenant(tenant_id)
        p = request.query_params
        try:
            months = max(1, min(36, int(p.get('months') or 12)))
        except ValueError:
            months = 12
        try:
            threshold = max(1, min(100, int(p.get('threshold') or 80)))
        except ValueError:
            threshold = 80
        return Response(build_provider_sla(tenant, months, threshold))


# ─── Widgets del panel global ────────────────────────────────────────────────

def build_overview(tenant):
    today = date.today()
    first = add_months(today.replace(day=1), -5)
    keys = []
    cur = first
    for _ in range(6):
        keys.append((cur.year, cur.month))
        cur = add_months(cur, 1)
    idx = {k: i for i, k in enumerate(keys)}
    flow = [{'label': f'{MONTHS_ES[m - 1]} {str(y)[2:]}', 'solicitudes': 0, 'ordenes': 0, 'resueltas': 0} for y, m in keys]
    for r in RentalServiceRequest.objects.filter(tenant=tenant, created_at__date__gte=first).values_list('created_at', flat=True):
        d = timezone.localtime(r).date()
        i = idx.get((d.year, d.month))
        if i is not None:
            flow[i]['solicitudes'] += 1
    works_all = list(
        RentalMaintenanceWork.objects.filter(tenant=tenant).exclude(status='cancelado')
        .select_related('property', 'provider')
    )
    for w in works_all:
        d = timezone.localtime(w.created_at).date()
        i = idx.get((d.year, d.month))
        if i is not None:
            flow[i]['ordenes'] += 1
        if w.status == 'realizado':
            dd = timezone.localtime(w.completed_at).date() if w.completed_at else (w.performed_date or d)
            j = idx.get((dd.year, dd.month))
            if j is not None:
                flow[j]['resueltas'] += 1
    now = timezone.now()
    orders_status = {'planeado': 0, 'en_curso': 0, 'realizado': 0, 'vencidas': 0}
    for w in works_all:
        orders_status[w.status] = orders_status.get(w.status, 0) + 1
        if w.status in OPEN_WORK and w.due_at and now > w.due_at:
            orders_status['vencidas'] += 1
    req_rows = list(RentalServiceRequest.objects.filter(tenant=tenant).values_list('status', 'satisfaction'))
    requests_status = defaultdict(int)
    sat = []
    for st, sv in req_rows:
        requests_status[st] += 1
        if sv:
            sat.append(sv)
    # órdenes por propiedad (últimos 12 meses) normalizadas por 100 m² cuando hay superficie
    since = today - timedelta(days=365)
    per = defaultdict(int)
    for w in works_all:
        if (w.scheduled_date or timezone.localtime(w.created_at).date()) >= since:
            per[w.property_id] += 1
    props = {p.id: p for p in RentalProperty.objects.filter(tenant=tenant, id__in=list(per))}
    with_area = [p for p in props.values() if p.area_m2]
    basis = 'm2' if len(with_area) >= max(1, len(props) // 2) else 'count'
    per_prop = []
    for pid, n in per.items():
        p = props.get(pid)
        if not p:
            continue
        area = _f(p.area_m2)
        val = round(n / area * 100, 2) if basis == 'm2' and area else (n if basis == 'count' else None)
        if val is None:
            continue
        per_prop.append({'code': p.code, 'name': p.name, 'orders': n, 'area_m2': area, 'value': val})
    per_prop.sort(key=lambda r: -r['value'])
    per_prop = per_prop[:8]
    avg_line = round(sum(r['value'] for r in per_prop) / len(per_prop), 2) if per_prop else 0
    # carga de trabajo por responsable
    load = defaultdict(lambda: {'open': 0, 'overdue': 0})
    for w in works_all:
        if w.status not in OPEN_WORK:
            continue
        who = w.assigned_to.strip() or ((w.provider.trade_name or w.provider.name) if w.provider_id else '') or 'Sin asignar'
        load[who]['open'] += 1
        if w.due_at and now > w.due_at:
            load[who]['overdue'] += 1
    workload = sorted(({'name': k, **v} for k, v in load.items()), key=lambda r: -r['open'])[:8]
    # presupuesto
    budget = None
    try:
        from .rental_finance import build_summary
        s = build_summary(tenant, today.year)
        k = s['kpis']
        budget = {
            'year': today.year,
            'opex_budget_year': k['opex_budget_year'], 'opex_budget_ytd': k['opex_budget_ytd'], 'opex_ytd': k['opex_ytd'],
            'opex_variance_pct': k['opex_variance_pct'], 'capex_budget_year': k['capex_budget_year'],
            'capex': k['capex'], 'capex_committed': k['capex_committed'], 'capex_active_budget': k['capex_active_budget'],
            'noi': k['noi'], 'income': k['income'], 'projects_active': k['projects_active'], 'projects_at_risk': k['projects_at_risk'],
            'categories': [c for c in s['categories'] if c['budget_year'] or c['actual']][:5],
        }
    except Exception:  # pragma: no cover - el panel no debe fallar si finanzas no está configurado
        budget = None
    sla = build_provider_sla(tenant, 6, 80)
    return {
        'flow': flow, 'orders_status': orders_status, 'requests_status': dict(requests_status),
        'satisfaction': {'avg': round(sum(sat) / len(sat), 2) if sat else None, 'count': len(sat)},
        'per_property': per_prop, 'per_property_basis': basis, 'per_property_avg': avg_line,
        'workload': workload, 'budget': budget,
        'providers_risk': [r for r in sla['providers'] if r['risk'] != 'ok'][:5],
        'providers_overall_pct': sla['overall_pct'],
    }


class OverviewView(APIView):
    permission_classes = [RentalAccess('rentas_dashboard')]

    def get(self, request, tenant_id):
        return Response(build_overview(_tenant(tenant_id)))


# ─── Agenda (calendario del dashboard) ───────────────────────────────────────

def build_agenda(tenant, d_from, d_to):
    ev = []

    def add(day, typ, title, sub='', path='', status=''):
        if day and d_from <= day <= d_to:
            ev.append({'date': day.isoformat(), 'type': typ, 'title': title, 'sub': sub, 'path': path, 'status': status})

    today = date.today()
    for c in RentalContract.objects.filter(tenant=tenant, status__in=('activo', 'por_vencer'), end_date__range=(d_from, d_to)).select_related('property', 'tenant_party', 'provider'):
        add(c.end_date, 'contrato', f'Vence contrato {c.code}', f'{c.property.code if c.property_id else ""} · {c.counterpart_label}'.strip(' ·'), '/app/rentas/contratos?tab=vigencias')
    for w in RentalMaintenanceWork.objects.filter(tenant=tenant, status__in=OPEN_WORK, scheduled_date__range=(d_from, d_to)).select_related('property'):
        add(w.scheduled_date, 'orden', f'{w.folio} · {w.title}', f'{w.property.code} · {"Preventivo" if w.kind == "preventivo" else "Correctivo"}', '/app/rentas/mantenimiento',
            'atrasada' if w.scheduled_date < today else '')
    for r in RentalServiceRequest.objects.filter(tenant=tenant, status__in=OPEN_REQ, resolution_due_at__date__range=(d_from, d_to)).select_related('property'):
        add(timezone.localtime(r.resolution_due_at).date(), 'solicitud', f'{r.folio} · {r.title}', f'{r.property.code} · límite de atención', '/app/rentas/solicitudes')
    for pl in RentalMaintenancePlan.objects.filter(tenant=tenant, is_active=True, next_due_date__range=(d_from, d_to)).select_related('property'):
        add(pl.next_due_date, 'preventivo', pl.name, f'{pl.property.code if pl.property_id else ""} · próximo preventivo'.strip(' ·'), '/app/rentas/preventivo')
    for i in RentalInspection.objects.filter(tenant=tenant, inspected_date__range=(d_from, d_to)).select_related('property'):
        add(i.inspected_date, 'inspeccion', f'{i.folio} · {i.name}', f'{i.property.code} · {"Completada" if i.status == "completada" else "En proceso"}', '/app/rentas/inspecciones')
    for ch in RentalCharge.objects.filter(tenant=tenant, status__in=('pendiente', 'parcial'), due_date__range=(d_from, d_to)).select_related('contract', 'contract__property', 'concept'):
        add(ch.due_date, 'cobro', f'Cobro {ch.concept.name if ch.concept_id else ""}'.strip(), f'{ch.contract.code} · ${float(ch.amount):,.0f}', '/app/rentas/cobranza',
            'atrasada' if ch.due_date < today else '')
    for a in RentalAsset.objects.filter(tenant=tenant, is_active=True, warranty_until__range=(d_from, d_to)).select_related('property'):
        add(a.warranty_until, 'garantia', f'Garantía vence: {a.name}', f'{a.code} · {a.property.code}', '/app/rentas/activos')
    ev.sort(key=lambda e: (e['date'], e['type']))
    return ev[:800]


AGENDA_MODULE = {
    'contrato': 'rentas_contratos', 'orden': 'rentas_mantenimiento', 'solicitud': 'rentas_solicitudes',
    'preventivo': 'rentas_preventivo', 'inspeccion': 'rentas_inspecciones', 'cobro': 'rentas_cobranza',
    'garantia': 'rentas_activos',
}


class AgendaView(APIView):
    permission_classes = [RentalAccess('rentas_dashboard')]

    def get(self, request, tenant_id):
        tenant = _tenant(tenant_id)
        p = request.query_params
        today = date.today()
        d_from = _parse_day(p.get('from')) or today.replace(day=1)
        d_to = _parse_day(p.get('to')) or add_months(d_from, 1) - timedelta(days=1)
        if (d_to - d_from).days > 400:
            d_to = d_from + timedelta(days=400)
        events = [
            e for e in build_agenda(tenant, d_from, d_to)
            if _can_read(request, tenant_id, AGENDA_MODULE.get(e['type'], ''))
        ]
        return Response({'from': d_from.isoformat(), 'to': d_to.isoformat(), 'events': events})
