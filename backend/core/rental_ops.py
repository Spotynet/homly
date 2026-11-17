"""Lógica CAFM / CMMS de Administrar Propiedades: SLA, folios, preventivo e inspecciones."""
from __future__ import annotations

from calendar import monthrange
from datetime import date, datetime, time, timedelta

from django.utils import timezone

from .models import (
    RentalAsset, RentalInspection, RentalInspectionTemplate, RentalMaintenancePlan,
    RentalMaintenanceWork, RentalOpsSettings, RentalServiceRequest,
)

PRIORITIES = ('baja', 'media', 'alta', 'urgente')

# Horas de primera respuesta y de resolución por prioridad (editable por espacio).
DEFAULT_SLA = {
    'urgente': {'response_h': 1, 'resolution_h': 8},
    'alta':    {'response_h': 4, 'resolution_h': 48},
    'media':   {'response_h': 12, 'resolution_h': 120},
    'baja':    {'response_h': 24, 'resolution_h': 240},
}

FREQ_MONTHS = {'mensual': 1, 'bimestral': 2, 'trimestral': 3, 'semestral': 6, 'anual': 12}
FREQ_DAYS = {'semanal': 7, 'quincenal': 15}

DEFAULT_TEMPLATES = [
    ('Entrega / recepción de inmueble', 'entrega', 'Estado general al entregar o recibir la unidad.', [
        'Llaves y controles completos', 'Paredes y pintura', 'Pisos y zoclos', 'Puertas y chapas',
        'Ventanas y cristales', 'Instalación eléctrica y contactos', 'Instalación hidráulica y fugas',
        'Baños (sanitarios, regadera, lavabo)', 'Cocina y tarja', 'Clima / ventilación',
        'Lectura de medidores', 'Limpieza general',
    ]),
    ('Seguridad y protección civil', 'seguridad', 'Equipos de seguridad, señalización y rutas de evacuación.', [
        'Extintores vigentes y accesibles', 'Detectores de humo operando', 'Salidas de emergencia libres',
        'Señalización visible', 'Luces de emergencia', 'Botiquín completo', 'Cámaras y control de acceso',
    ]),
    ('Recorrido de áreas comunes', 'areas_comunes', 'Limpieza, iluminación y estado de áreas compartidas.', [
        'Limpieza de pasillos y accesos', 'Iluminación funcionando', 'Elevadores operando',
        'Cisternas / tinacos', 'Estacionamiento y portón', 'Jardines y exteriores', 'Cuarto de basura',
    ]),
    ('Instalaciones técnicas', 'instalaciones', 'Revisión eléctrica, hidráulica y de climatización.', [
        'Tablero eléctrico y centros de carga', 'Bombas e hidroneumático', 'Calentadores / boilers',
        'Equipos de clima y filtros', 'Tuberías y válvulas', 'Humedad o filtraciones en techos',
    ]),
]


# ─── Ajustes y SLA ───────────────────────────────────────────────────────────

def get_settings(tenant):
    obj, _ = RentalOpsSettings.objects.get_or_create(tenant=tenant)
    return obj


def sla_table(tenant):
    saved = (get_settings(tenant).sla or {})
    out = {}
    for prio, base in DEFAULT_SLA.items():
        cur = saved.get(prio) or {}
        out[prio] = {
            'response_h': _pos_int(cur.get('response_h'), base['response_h']),
            'resolution_h': _pos_int(cur.get('resolution_h'), base['resolution_h']),
        }
    return out


def _pos_int(value, default):
    try:
        n = int(value)
        return n if n > 0 else default
    except (TypeError, ValueError):
        return default


def sla_for(tenant, priority):
    table = sla_table(tenant)
    return table.get(priority) or table['media']


# ─── Fechas ──────────────────────────────────────────────────────────────────

def add_months(d: date, months: int) -> date:
    y = d.year + (d.month - 1 + months) // 12
    m = (d.month - 1 + months) % 12 + 1
    return date(y, m, min(d.day, monthrange(y, m)[1]))


def advance_date(d: date, frequency: str) -> date:
    if frequency in FREQ_DAYS:
        return d + timedelta(days=FREQ_DAYS[frequency])
    return add_months(d, FREQ_MONTHS.get(frequency, 1))


def end_of_day(d: date):
    return timezone.make_aware(datetime.combine(d, time(23, 59)))


# ─── Folios ──────────────────────────────────────────────────────────────────

def _next_seq(qs, field, prefix):
    last = qs.filter(**{f'{field}__startswith': prefix}).order_by(f'-{field}').values_list(field, flat=True).first()
    seq = 1
    if last:
        try:
            seq = int(str(last).split('-')[-1]) + 1
        except (TypeError, ValueError):
            seq = qs.filter(**{f'{field}__startswith': prefix}).count() + 1
    return seq


def next_request_folio(tenant):
    prefix = f'SOL-{date.today().year}-'
    return f'{prefix}{_next_seq(RentalServiceRequest.objects.filter(tenant=tenant), "folio", prefix):04d}'


def next_inspection_folio(tenant):
    prefix = f'INS-{date.today().year}-'
    return f'{prefix}{_next_seq(RentalInspection.objects.filter(tenant=tenant), "folio", prefix):04d}'


def next_asset_code(tenant):
    qs = RentalAsset.objects.filter(tenant=tenant)
    seq = _next_seq(qs, 'code', 'ACT-')
    code = f'ACT-{seq:04d}'
    while qs.filter(code=code).exists():
        seq += 1
        code = f'ACT-{seq:04d}'
    return code


# ─── Solicitudes ─────────────────────────────────────────────────────────────

def apply_request_sla(req, tenant, base=None):
    base = base or timezone.now()
    sla = sla_for(tenant, req.priority)
    req.response_due_at = base + timedelta(hours=sla['response_h'])
    req.resolution_due_at = base + timedelta(hours=sla['resolution_h'])


def mark_request_responded(req):
    if not req.first_response_at:
        req.first_response_at = timezone.now()


def create_work_from_request(req, user=None, **overrides):
    """Crea una orden de trabajo correctiva ligada a la solicitud."""
    from .rental_mantenimiento import next_folio
    tenant = req.tenant
    sla = sla_for(tenant, req.priority)
    now = timezone.now()
    work = RentalMaintenanceWork.objects.create(
        tenant=tenant,
        property=req.property,
        space=req.space,
        asset=req.asset,
        service_request=req,
        folio=next_folio(tenant),
        kind='correctivo',
        status='planeado',
        priority=req.priority,
        category=req.category,
        title=req.title,
        description=req.description,
        reported_by=req.requester_name,
        scheduled_date=timezone.localdate(),
        due_at=req.resolution_due_at or now + timedelta(hours=sla['resolution_h']),
        created_by=user if getattr(user, 'is_authenticated', False) else None,
        **overrides,
    )
    mark_request_responded(req)
    if req.status == 'nueva':
        req.status = 'en_proceso'
    req.save()
    return work


# ─── Preventivo ──────────────────────────────────────────────────────────────

def work_from_plan(plan, scheduled=None, user=None):
    from .rental_mantenimiento import next_folio
    scheduled = scheduled or plan.next_due_date
    return RentalMaintenanceWork.objects.create(
        tenant=plan.tenant,
        property=plan.property,
        space=plan.space,
        asset=plan.asset,
        plan=plan,
        folio=next_folio(plan.tenant),
        kind='preventivo',
        status='planeado',
        priority=plan.priority or 'media',
        category=plan.category,
        work_type=plan.work_type,
        provider=plan.provider,
        title=plan.name,
        description=plan.description,
        assigned_to=plan.assigned_to,
        scheduled_date=scheduled,
        due_at=end_of_day(scheduled),
        frequency=plan.frequency,
        estimated_cost=plan.estimated_cost,
        checklist=[{'label': str(x), 'done': False} for x in (plan.checklist or []) if str(x).strip()],
        created_by=user if getattr(user, 'is_authenticated', False) else None,
    )


def generate_due_plans(tenant, today=None, user=None):
    """Genera las órdenes preventivas de los planes cuya fecha (menos anticipación) ya llegó."""
    today = today or date.today()
    created = []
    plans = RentalMaintenancePlan.objects.filter(
        tenant=tenant, is_active=True, auto_generate=True,
    ).select_related('property', 'asset', 'category', 'work_type', 'provider')
    for plan in plans:
        guard = 0
        # Periodos con más de 30 días de atraso se saltan para no inundar de órdenes viejas.
        while plan.next_due_date - timedelta(days=plan.lead_days or 0) <= today and guard < 60:
            exists = RentalMaintenanceWork.objects.filter(
                plan=plan, scheduled_date=plan.next_due_date,
            ).exists()
            if not exists and plan.next_due_date >= today - timedelta(days=30):
                created.append(work_from_plan(plan, user=user))
            plan.next_due_date = advance_date(plan.next_due_date, plan.frequency)
            plan.last_generated_at = timezone.now()
            guard += 1
        if guard:
            plan.save(update_fields=['next_due_date', 'last_generated_at', 'updated_at'])
    return created


# ─── Inspecciones ────────────────────────────────────────────────────────────

def ensure_default_templates(tenant):
    if RentalInspectionTemplate.objects.filter(tenant=tenant).exists():
        return
    for name, kind, desc, labels in DEFAULT_TEMPLATES:
        RentalInspectionTemplate.objects.create(
            tenant=tenant, name=name, kind=kind, description=desc,
            items=[{'id': f'i{n + 1}', 'label': label} for n, label in enumerate(labels)],
        )


def blank_results(template):
    return [
        {
            'id': it.get('id') or f'i{n + 1}', 'label': it.get('label', ''), 'result': 'pendiente', 'note': '',
            'priority': 'media', 'hint': it.get('hint', ''), 'require_evidence': bool(it.get('require_evidence')),
        }
        for n, it in enumerate(template.items or [])
    ]


def score_results(results):
    ok = sum(1 for r in results if r.get('result') == 'ok')
    fail = sum(1 for r in results if r.get('result') == 'falla')
    pending = sum(1 for r in results if r.get('result') == 'pendiente')
    score = round(ok / (ok + fail) * 100, 1) if (ok + fail) else None
    return {'ok': ok, 'fail': fail, 'pending': pending, 'score': score}


def create_works_from_inspection(inspection, user=None):
    """Una orden correctiva por cada falla que aún no la tenga."""
    from .rental_mantenimiento import next_folio
    tenant = inspection.tenant
    existing = set(
        RentalMaintenanceWork.objects.filter(inspection=inspection).values_list('title', flat=True)
    )
    created = []
    for r in inspection.results or []:
        if r.get('result') != 'falla':
            continue
        title = f"{inspection.folio}: {r.get('label', 'Falla detectada')}"[:240]
        if title in existing:
            continue
        prio = r.get('priority') if r.get('priority') in PRIORITIES else 'media'
        sla = sla_for(tenant, prio)
        work = RentalMaintenanceWork.objects.create(
            tenant=tenant,
            property=inspection.property,
            space=inspection.space,
            asset=inspection.asset,
            inspection=inspection,
            folio=next_folio(tenant),
            kind='correctivo',
            status='planeado',
            priority=prio,
            title=title,
            description=(r.get('note') or '')[:2000],
            reported_by=inspection.inspector_name,
            scheduled_date=date.today(),
            due_at=timezone.now() + timedelta(hours=sla['resolution_h']),
            created_by=user if getattr(user, 'is_authenticated', False) else None,
        )
        _copy_inspection_evidence(inspection, r.get('id'), work, user)
        created.append(work)
    return created


def _copy_inspection_evidence(inspection, item_id, work, user=None):
    """Las fotos y archivos del punto con falla viajan a la orden correctiva como evidencia 'antes'."""
    from django.core.files.base import ContentFile
    from .models import RentalMaintenanceEvidence
    for ev in inspection.evidences.filter(item_id=str(item_id or '')):
        try:
            with ev.file.open('rb') as fh:
                content = fh.read()
        except Exception:
            continue
        RentalMaintenanceEvidence.objects.create(
            work=work, kind='antes', original_name=ev.original_name, notes=(ev.notes or f'Inspección {inspection.folio}')[:400],
            captured_at=ev.captured_at, uploaded_by=ev.uploaded_by,
            file=ContentFile(content, name=ev.original_name or 'evidencia'),
        )


# ─── Sincronía de estado ─────────────────────────────────────────────────────

def sync_asset_status(asset):
    """Marca el activo en falla / mantenimiento / operativo según sus órdenes abiertas."""
    if not asset or asset.status in ('baja', 'fuera_servicio'):
        return
    open_corr = RentalMaintenanceWork.objects.filter(
        asset=asset, kind='correctivo', status__in=('planeado', 'en_curso'),
    )
    if open_corr.filter(status='en_curso').exists():
        new = 'en_mantenimiento'
    elif open_corr.exists():
        new = 'en_falla'
    else:
        new = 'operativo'
    if new != asset.status:
        asset.status = new
        asset.save(update_fields=['status', 'updated_at'])


def sync_request_from_work(work):
    """Cuando todas las órdenes de una solicitud terminan, la solicitud pasa a resuelta."""
    req = work.service_request
    if not req or req.status in ('cerrada', 'rechazada', 'resuelta'):
        return
    works = list(req.works.all())
    if works and all(w.status in ('realizado', 'cancelado') for w in works) and any(w.status == 'realizado' for w in works):
        req.status = 'resuelta'
        req.resolved_at = timezone.now()
        req.save(update_fields=['status', 'resolved_at', 'updated_at'])
    elif work.status == 'en_curso' and req.status == 'nueva':
        mark_request_responded(req)
        req.status = 'en_proceso'
        req.save(update_fields=['status', 'first_response_at', 'updated_at'])
