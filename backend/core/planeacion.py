"""Planeación del condominio: presupuesto anual y proyectos."""
from __future__ import annotations

import os
import uuid
from collections import defaultdict
from datetime import date
from decimal import Decimal

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import (
    CajaChicaEntry, CondoBudget, CondoBudgetLine, CondoProject, CondoProjectCost,
    CondoProjectFile, CondoProjectQuote, ExtraField, FieldPayment, GastoEntry,
    Notification, Tenant, TenantUser, Unit, User,
)
from .permissions import IsAdminOrTesOrAuditor

MONTH_KEYS = [f'{m:02d}' for m in range(1, 13)]
BUDGET_LOCKED = ('aprobado', 'archivado', 'en_aprobacion')
PROJECT_FLOW_STATUSES = ('idea', 'en_aprobacion')


def _require_condominio(tenant):
    if getattr(tenant, 'workspace_type', 'condominio') != 'condominio':
        raise ValidationError({'detail': 'Este módulo solo aplica al espacio de condominios.'})


def _audit(request, action, description, tenant_id, object_type, object_id, object_repr):
    from .views import _audit_log
    _audit_log(
        request, 'planeacion', action, description,
        tenant_id=tenant_id, object_type=object_type,
        object_id=str(object_id), object_repr=object_repr,
    )


def _f(n):
    try:
        return float(n or 0)
    except (TypeError, ValueError):
        return 0.0


def _d(n):
    try:
        return Decimal(str(n or 0))
    except Exception:
        return Decimal('0')


QUOTE_LIMIT = 8
PROJECT_FILE_MAX = 20 * 1024 * 1024
PROJECT_FILE_EXTS = {
    '.pdf', '.png', '.jpg', '.jpeg', '.webp', '.doc', '.docx', '.xls', '.xlsx', '.zip',
}


def normalize_funding(mode, condo_pct, residents_pct):
    mode = mode if mode in ('condominio', 'residentes', 'compartido') else 'condominio'
    if mode == 'condominio':
        return 'condominio', Decimal('100.00'), Decimal('0.00')
    if mode == 'residentes':
        return 'residentes', Decimal('0.00'), Decimal('100.00')
    c = _d(condo_pct)
    if c < 0:
        c = Decimal('0')
    if c > 100:
        c = Decimal('100')
    c = c.quantize(Decimal('0.01'))
    r = (Decimal('100') - c).quantize(Decimal('0.01'))
    return 'compartido', c, r


def apply_funding_to_project(project, data):
    if not isinstance(data, dict):
        data = {}
    keys = (
        'funding_mode', 'funding_condo_pct', 'funding_residents_pct',
        'funding_notes', 'funding_units',
    )
    if not any(k in data for k in keys):
        return project
    mode, condo, resi = normalize_funding(
        data.get('funding_mode', project.funding_mode),
        data.get('funding_condo_pct', project.funding_condo_pct),
        data.get('funding_residents_pct', project.funding_residents_pct),
    )
    project.funding_mode = mode
    project.funding_condo_pct = condo
    project.funding_residents_pct = resi
    if 'funding_notes' in data:
        project.funding_notes = (data.get('funding_notes') or '')[:4000]
    if 'funding_units' in data:
        try:
            project.funding_units = max(0, int(data.get('funding_units') or 0))
        except (TypeError, ValueError):
            pass
    return project


def project_contract_amount(project):
    winner = getattr(project, 'winner_quote', None)
    if winner is None and project.winner_quote_id:
        winner = project.quotes.filter(id=project.winner_quote_id).first()
    if winner is None:
        quotes = list(project.quotes.all())
        winner = next((q for q in quotes if q.is_winner), None)
    if winner and _d(winner.amount) > 0:
        return _d(winner.amount), 'winner'
    return _d(project.budget_amount), 'budget_amount'


def funding_units_for(project, tenant=None):
    if project.funding_units:
        return int(project.funding_units)
    tenant = tenant or project.tenant
    return Unit.objects.filter(tenant=tenant, is_active=True).count()


def project_funding_breakdown(project):
    amount, source = project_contract_amount(project)
    mode, condo_pct, res_pct = normalize_funding(
        project.funding_mode, project.funding_condo_pct, project.funding_residents_pct,
    )
    condo_amt = (amount * condo_pct / Decimal('100')).quantize(Decimal('0.01'))
    res_amt = (amount - condo_amt).quantize(Decimal('0.01'))
    units = funding_units_for(project)
    per_unit = None
    if units and res_amt > 0:
        per_unit = (res_amt / Decimal(units)).quantize(Decimal('0.01'))
    return {
        'amount': _f(amount),
        'source': source,
        'funding_mode': mode,
        'condo_pct': _f(condo_pct),
        'residents_pct': _f(res_pct),
        'condo_amount': _f(condo_amt),
        'residents_amount': _f(res_amt),
        'units': units,
        'per_unit': _f(per_unit) if per_unit is not None else None,
    }


def months_for_project_in_year(project, year):
    start = (project.start_period or '').strip() or f'{year}-01'
    end = (project.end_period or '').strip() or f'{year}-12'
    months = [m for m in MONTH_KEYS if start <= f'{year}-{m}' <= end]
    return months or list(MONTH_KEYS)


def spread_on_months(amount, months):
    amount = _d(amount)
    months = months or list(MONTH_KEYS)
    amounts = {m: 0.0 for m in MONTH_KEYS}
    n = len(months)
    if amount <= 0 or n <= 0:
        return amounts
    base = (amount / n).quantize(Decimal('0.01'))
    leftover = amount
    for i, m in enumerate(months):
        if i == n - 1:
            amounts[m] = float(leftover)
        else:
            amounts[m] = float(base)
            leftover -= base
    return amounts


def sync_contest_status(project, save=True):
    quotes = list(project.quotes.all())
    winner = next((q for q in quotes if q.is_winner), None)
    if winner:
        project.contest_status = 'adjudicado'
        project.winner_quote = winner
    elif quotes:
        project.contest_status = 'en_concurso'
        project.winner_quote = None
    else:
        project.contest_status = 'sin_concurso'
        project.winner_quote = None
    if save:
        project.save(update_fields=['contest_status', 'winner_quote', 'updated_at'])
    return project


def parse_budget_ids(data):
    if not isinstance(data, dict):
        return None
    if 'budget_ids' in data:
        raw = data.get('budget_ids')
    elif 'budget_id' in data:
        raw = data.get('budget_id')
    else:
        return None
    if raw in (None, ''):
        return []
    if not isinstance(raw, (list, tuple)):
        raw = [raw]
    ids = []
    seen = set()
    for item in raw:
        sid = str(item or '').strip()
        if sid and sid not in seen:
            seen.add(sid)
            ids.append(sid)
    return ids


def project_budget_list(project):
    qs = project.budgets.all()
    if hasattr(project, '_prefetched_objects_cache') and 'budgets' in project._prefetched_objects_cache:
        return sorted(qs, key=lambda b: (-int(b.year or 0), b.name or ''))
    return list(qs.order_by('-year', 'name'))


def serialize_project_budget(budget):
    if not budget:
        return None
    return {
        'id': str(budget.id),
        'name': budget.name or f'Presupuesto {budget.year}',
        'year': budget.year,
        'status': budget.status,
    }


def maybe_resync_budget(project):
    linked = project_budget_list(project)
    if not linked:
        return project
    for budget in linked:
        if budget.status in BUDGET_LOCKED:
            continue
        include_project_in_budget(project, budget)
    return project


def include_project_in_budget(project, budget):
    if str(budget.tenant_id) != str(project.tenant_id):
        raise ValidationError({'detail': 'El presupuesto no pertenece a este condominio.'})
    if budget.status in BUDGET_LOCKED:
        raise ValidationError({'detail': 'Ese presupuesto no se puede editar en su estado actual.'})
    breakdown = project_funding_breakdown(project)
    year = budget.year
    months = months_for_project_in_year(project, year)
    CondoBudgetLine.objects.filter(project=project, budget=budget).delete()
    next_gasto = budget.lines.filter(kind='gasto').count()
    next_ing = budget.lines.filter(kind='ingreso').count()
    if breakdown['condo_amount'] > 0 or breakdown['residents_amount'] <= 0:
        CondoBudgetLine.objects.create(
            budget=budget,
            kind='gasto',
            extra_field=project.extra_field,
            concept_key=f'project:{project.id}',
            name=f'Proyecto: {project.name}',
            monthly_amounts=spread_on_months(breakdown['condo_amount'], months),
            project=project,
            sort_order=next_gasto + 50,
        )
    if breakdown['residents_amount'] > 0:
        CondoBudgetLine.objects.create(
            budget=budget,
            kind='ingreso',
            concept_key=f'project_income:{project.id}',
            name=f'Aportes extra: {project.name}',
            monthly_amounts=spread_on_months(breakdown['residents_amount'], months),
            project=project,
            sort_order=next_ing + 50,
        )
    project.budgets.add(budget)
    if breakdown['source'] == 'winner' and breakdown['amount'] > 0:
        project.budget_amount = _d(breakdown['amount'])
        project.save(update_fields=['budget_amount', 'updated_at'])
    mark_budget_saved(budget)
    return project


def unlink_project_from_budget(project, budget=None):
    if budget is None:
        locked = [b for b in project_budget_list(project) if b.status in BUDGET_LOCKED]
        if locked:
            names = ', '.join((b.name or str(b.year)) for b in locked)
            raise ValidationError({
                'detail': f'No se puede retirar de presupuestos bloqueados: {names}.',
            })
        CondoBudgetLine.objects.filter(project=project).delete()
        project.budgets.clear()
        return project
    if budget.status in BUDGET_LOCKED:
        raise ValidationError({
            'detail': 'El presupuesto ligado ya no se puede editar. No se pueden quitar las partidas.',
        })
    CondoBudgetLine.objects.filter(project=project, budget=budget).delete()
    project.budgets.remove(budget)
    mark_budget_saved(budget)
    return project


def sync_project_budgets(project, budget_ids, tenant_id):
    wanted = {str(i) for i in (budget_ids or [])}
    current = {str(b.id): b for b in project_budget_list(project)}
    for bid, budget in current.items():
        if bid not in wanted:
            unlink_project_from_budget(project, budget)
    for bid in budget_ids or []:
        if str(bid) in current:
            budget = current[str(bid)]
            if budget.status not in BUDGET_LOCKED:
                include_project_in_budget(project, budget)
            continue
        budget = CondoBudget.objects.filter(tenant_id=tenant_id, id=bid).first()
        if not budget:
            raise ValidationError({'detail': 'Presupuesto no encontrado.'})
        include_project_in_budget(project, budget)
    return project


def validate_project_upload(uploaded):
    if not uploaded:
        raise ValidationError({'detail': 'Adjunta un archivo.'})
    name = getattr(uploaded, 'name', '') or 'archivo'
    ext = os.path.splitext(name)[1].lower()
    if ext not in PROJECT_FILE_EXTS:
        raise ValidationError({
            'detail': f'Tipo de archivo no permitido ({ext or "sin extensión"}).',
        })
    size = getattr(uploaded, 'size', 0) or 0
    if size > PROJECT_FILE_MAX:
        raise ValidationError({'detail': 'El archivo no puede superar 20 MB.'})
    return name[:240]


def media_api_url(file_field, request=None):
    if not file_field:
        return None
    path = f'/api/media/{file_field.name}'
    if request:
        return request.build_absolute_uri(path)
    return path


def is_project_managed_line(item):
    if item.get('project_id'):
        return True
    key = str(item.get('concept_key') or '')
    return key.startswith('project:') or key.startswith('project_income:')


def year_periods(year: int):
    return [f'{int(year)}-{m}' for m in MONTH_KEYS]


def even_months(annual) -> dict:
    annual = _d(annual)
    if annual <= 0:
        return {m: 0 for m in MONTH_KEYS}
    base = (annual / 12).quantize(Decimal('0.01'))
    amounts = {m: float(base) for m in MONTH_KEYS}
    leftover = annual - base * 12
    amounts['12'] = float(base + leftover)
    return amounts


def line_annual(amounts) -> float:
    total = 0.0
    amounts = amounts or {}
    for m in MONTH_KEYS:
        total += _f(amounts.get(m, 0))
    return round(total, 2)


def max_seed_units(tenant, ctx=None):
    ctx = ctx or tenant_planning_context(tenant)
    return int(ctx.get('units_active') or ctx.get('units_count') or 0)


def cap_seed_units(tenant, units, ctx=None):
    ctx = ctx or tenant_planning_context(tenant)
    max_u = max_seed_units(tenant, ctx)
    try:
        units = int(units)
    except (TypeError, ValueError):
        units = int(ctx.get('units_billable') or 0)
    if units < 0:
        units = 0
    if max_u and units > max_u:
        raise ValidationError({
            'detail': f'Las unidades no pueden superar las {max_u} activas del condominio.',
        })
    return units


def normalize_cashflow_rules(raw):
    out = []
    if not isinstance(raw, list):
        return out
    for r in raw:
        if not isinstance(r, dict):
            continue
        name = (r.get('name') or '').strip()[:120]
        if not name:
            continue
        pct = min(100.0, max(0.0, _f(r.get('pct'))))
        takeup = min(100.0, max(0.0, _f(r.get('takeup_pct', 100))))
        apply_to = r.get('apply_to') if r.get('apply_to') in ('ingresos', 'maintenance') else 'ingresos'
        rid = str(r.get('id') or uuid.uuid4())
        out.append({
            'id': rid,
            'name': name,
            'pct': round(pct, 4),
            'takeup_pct': round(takeup, 4),
            'apply_to': apply_to,
        })
    return out


def compute_discounts(income, maint_annual, rules):
    discounts = []
    total = 0.0
    for rule in rules or []:
        base = maint_annual if rule.get('apply_to') == 'maintenance' else income
        amt = round(base * (_f(rule.get('pct')) / 100.0) * (_f(rule.get('takeup_pct', 100)) / 100.0), 2)
        discounts.append({**rule, 'amount': amt, 'base': round(base, 2)})
        total += amt
    return discounts, round(total, 2)


def compute_budget_totals(obj, actuals=None):
    income = expense = 0.0
    maint_annual = 0.0
    act_in = act_ex = 0.0
    year = obj.year
    for line in obj.lines.all():
        annual = line_annual(line.monthly_amounts)
        if line.kind == 'ingreso':
            income += annual
            if line.concept_key == 'maintenance':
                maint_annual += annual
        else:
            expense += annual
        if actuals:
            real = sum(attach_actuals(line, actuals, year).values())
            if line.kind == 'ingreso':
                act_in += real
            else:
                act_ex += real
    discounts, disc_total = compute_discounts(income, maint_annual, obj.cashflow_rules)
    net_income = round(income - disc_total, 2)
    return {
        'income': round(income, 2),
        'expense': round(expense, 2),
        'discount_total': disc_total,
        'net_income': net_income,
        'surplus': round(net_income - expense, 2),
        'gross_surplus': round(income - expense, 2),
        'maintenance_annual': round(maint_annual, 2),
        'discounts': discounts,
        'actual_income': round(act_in, 2) if actuals else None,
        'actual_expense': round(act_ex, 2) if actuals else None,
    }


def planning_flow_enabled(tenant):
    flow = tenant.planning_flow or {}
    return bool(flow.get('enabled') and flow.get('steps'))


def snapshot_flow_steps(tenant):
    steps = []
    for i, s in enumerate((tenant.planning_flow or {}).get('steps') or []):
        if not isinstance(s, dict):
            continue
        steps.append({
            'order': i + 1,
            'user_id': str(s.get('user_id') or ''),
            'user_name': s.get('user_name') or '',
            'label': (s.get('label') or f'Paso {i + 1}')[:80],
            'status': 'pending',
            'actioned_at': None,
            'notes': '',
        })
    return steps


def pending_step(steps):
    pending = [s for s in (steps or []) if s.get('status') == 'pending']
    pending.sort(key=lambda s: int(s.get('order') or 0))
    return pending[0] if pending else None


def normalize_planning_flow(raw):
    if not isinstance(raw, dict):
        raw = {}
    steps = []
    for i, s in enumerate(raw.get('steps') or []):
        if not isinstance(s, dict) or not s.get('user_id'):
            continue
        steps.append({
            'order': i + 1,
            'user_id': str(s.get('user_id')),
            'user_name': (s.get('user_name') or '')[:200],
            'label': (s.get('label') or f'Paso {i + 1}')[:80],
        })
    return {'enabled': bool(raw.get('enabled')) and bool(steps), 'steps': steps}


def tenant_approvers(tenant):
    rows = []
    qs = TenantUser.objects.filter(
        tenant=tenant, role__in=('admin', 'tesorero', 'contador'),
    ).select_related('user')
    for tu in qs:
        u = tu.user
        if not u:
            continue
        rows.append({
            'user_id': str(u.id),
            'user_name': getattr(u, 'name', None) or u.email or '',
            'email': u.email or '',
            'role': tu.role,
        })
    return rows


def _notify_user(tenant, user, title, message):
    if not user:
        return
    try:
        Notification.objects.create(
            tenant=tenant, user=user, notif_type='general',
            title=title[:200], message=message or '',
        )
    except Exception:
        pass
    email = getattr(user, 'email', None)
    if not email:
        return
    try:
        from .email_service import send_notification_email
        send_notification_email(
            email=email,
            user_name=getattr(user, 'name', None) or email,
            notif_type='general',
            title=title,
            message=message,
            tenant_name=tenant.name,
            workspace_label='Condominio',
        )
    except Exception:
        pass


def _user_by_id(user_id):
    if not user_id:
        return None
    return User.objects.filter(id=user_id).first()


def _ensure_tenant_member(user, tenant_id):
    if not user or not getattr(user, 'is_authenticated', False):
        raise ValidationError({'detail': 'No autenticado.'})
    if getattr(user, 'is_super_admin', False):
        return
    if not TenantUser.objects.filter(user=user, tenant_id=tenant_id).exists():
        raise ValidationError({'detail': 'No perteneces a este condominio.'})


def tenant_logo_src(tenant):
    if getattr(tenant, 'logo_file', None):
        try:
            url = tenant.logo_file.url
            if url:
                return url
        except Exception:
            pass
    raw = (getattr(tenant, 'logo', None) or '').strip()
    if not raw:
        return ''
    if raw.startswith('data:') or raw.startswith('http') or raw.startswith('/'):
        return raw
    if raw.startswith('/9j/'):
        return f'data:image/jpeg;base64,{raw}'
    if raw.startswith('iVBOR'):
        return f'data:image/png;base64,{raw}'
    return f'data:image/png;base64,{raw}'


def tenant_planning_context(tenant):
    units_qs = Unit.objects.filter(tenant=tenant)
    active = units_qs.filter(is_active=True)
    billable = active.exclude(admin_exempt=True).count()
    total = units_qs.count()
    fields = list(
        ExtraField.objects.filter(tenant=tenant, enabled=True).order_by('sort_order', 'label')
    )
    income_fields = [
        f for f in fields
        if f.field_type in ('normal', 'adelanto') and f.show_in_normal
    ]
    gasto_fields = [
        f for f in fields
        if f.field_type == 'gastos' and f.show_in_gastos is not False
    ]
    start = tenant.operation_start_date or '2024-01'
    try:
        start_year = int(str(start)[:4])
    except ValueError:
        start_year = date.today().year
    addr = [
        tenant.info_calle or tenant.addr_calle,
        tenant.info_num_externo or tenant.addr_num_externo,
        tenant.info_colonia or tenant.addr_colonia,
        tenant.info_delegacion or tenant.addr_delegacion,
        tenant.info_ciudad or tenant.addr_ciudad,
        tenant.info_codigo_postal or tenant.addr_codigo_postal,
    ]
    return {
        'currency': tenant.currency,
        'name': tenant.name,
        'razon_social': tenant.razon_social or '',
        'rfc': tenant.rfc or '',
        'address': ', '.join(p for p in addr if p),
        'country': tenant.country or '',
        'state': tenant.state or '',
        'logo': tenant_logo_src(tenant),
        'maintenance_fee': _f(tenant.maintenance_fee),
        'units_count': total,
        'units_active': active.count(),
        'units_billable': billable,
        'units_exempt': active.filter(admin_exempt=True).count(),
        'operation_start_date': start,
        'operation_type': tenant.operation_type,
        'suggested_income_monthly': round(_f(tenant.maintenance_fee) * billable, 2),
        'start_year': start_year,
        'income_fields': [
            {
                'id': str(f.id), 'label': f.label,
                'default_amount': _f(f.default_amount),
                'required': f.required, 'field_type': f.field_type,
            }
            for f in income_fields
        ],
        'gasto_fields': [
            {
                'id': str(f.id), 'label': f.label,
                'default_amount': _f(f.default_amount),
                'field_type': f.field_type,
            }
            for f in gasto_fields
        ],
    }


def seed_budget_lines(budget, tenant, units=None, fee=None):
    ctx = tenant_planning_context(tenant)
    units = cap_seed_units(tenant, units if units is not None else ctx['units_billable'], ctx)
    fee = _d(fee if fee is not None else tenant.maintenance_fee)
    budget.seed_units = units
    budget.seed_fee = fee
    budget.save(update_fields=['seed_units', 'seed_fee', 'updated_at'])

    lines = []
    order = 0
    maint_month = fee * units
    lines.append(CondoBudgetLine(
        budget=budget, kind='ingreso', concept_key='maintenance',
        name='Cuota de mantenimiento',
        monthly_amounts=even_months(maint_month * 12),
        sort_order=order,
    ))
    order += 1
    for f in ExtraField.objects.filter(
        tenant=tenant, enabled=True, field_type__in=('normal', 'adelanto'),
    ).order_by('sort_order'):
        if not f.required and not f.default_amount:
            continue
        month = _d(f.default_amount) * units
        lines.append(CondoBudgetLine(
            budget=budget, kind='ingreso', extra_field=f,
            concept_key=str(f.id), name=f.label,
            monthly_amounts=even_months(month * 12),
            sort_order=order,
        ))
        order += 1

    g_order = 0
    for f in ExtraField.objects.filter(
        tenant=tenant, enabled=True, field_type='gastos',
    ).order_by('sort_order'):
        month = _d(f.default_amount)
        lines.append(CondoBudgetLine(
            budget=budget, kind='gasto', extra_field=f,
            concept_key=str(f.id), name=f.label,
            monthly_amounts=even_months(month * 12) if month else even_months(0),
            sort_order=g_order,
        ))
        g_order += 1
    lines.append(CondoBudgetLine(
        budget=budget, kind='gasto', concept_key='caja_chica',
        name='Caja chica',
        monthly_amounts=even_months(0),
        sort_order=g_order,
    ))
    CondoBudgetLine.objects.bulk_create(lines)
    return len(lines)


def apply_seed_to_existing_lines(budget, tenant, units, fee):
    """Recalcula cuota y extras de ingreso que aún existen; no recrea partidas borradas."""
    ctx = tenant_planning_context(tenant)
    units = cap_seed_units(tenant, units, ctx)
    fee = _d(fee)
    budget.seed_units = units
    budget.seed_fee = fee
    budget.save(update_fields=['seed_units', 'seed_fee', 'updated_at'])

    maint = budget.lines.filter(concept_key='maintenance', kind='ingreso').first()
    if maint:
        maint.monthly_amounts = even_months(fee * units * 12)
        maint.save(update_fields=['monthly_amounts', 'updated_at'])

    for f in ExtraField.objects.filter(
        tenant=tenant, enabled=True, field_type__in=('normal', 'adelanto'),
    ):
        line = budget.lines.filter(concept_key=str(f.id), kind='ingreso').first()
        if not line:
            continue
        month = _d(f.default_amount) * units
        line.monthly_amounts = even_months(month * 12) if month else even_months(0)
        line.save(update_fields=['monthly_amounts', 'updated_at'])
    return budget


def actuals_for_year(tenant, year: int):
    periods = year_periods(year)
    maint = {p: 0.0 for p in periods}
    extra_income = defaultdict(lambda: {p: 0.0 for p in periods})
    gastos = defaultdict(lambda: {p: 0.0 for p in periods})
    caja = {p: 0.0 for p in periods}

    for row in FieldPayment.objects.filter(
        payment__tenant=tenant, payment__period__in=periods, field_key='maintenance',
    ).values('payment__period').annotate(t=Sum('received')):
        maint[row['payment__period']] = _f(row['t'])

    for row in FieldPayment.objects.filter(
        payment__tenant=tenant, payment__period__in=periods,
    ).exclude(field_key='maintenance').exclude(field_key__startswith='plan_').values(
        'payment__period', 'field_key',
    ).annotate(t=Sum('received')):
        extra_income[row['field_key']][row['payment__period']] = _f(row['t'])

    for row in GastoEntry.objects.filter(
        tenant=tenant, period__in=periods,
    ).values('period', 'field_id').annotate(t=Sum('amount')):
        key = str(row['field_id']) if row['field_id'] else 'sin_categoria'
        gastos[key][row['period']] = _f(row['t'])

    for row in CajaChicaEntry.objects.filter(
        tenant=tenant, period__in=periods,
    ).values('period').annotate(t=Sum('amount')):
        caja[row['period']] = _f(row['t'])

    return {
        'periods': periods,
        'maintenance': maint,
        'extra_income': dict(extra_income),
        'gastos': dict(gastos),
        'caja_chica': caja,
    }


def attach_actuals(line, actuals, year):
    periods = year_periods(year)
    monthly = {}
    if line.concept_key == 'maintenance':
        src = actuals['maintenance']
    elif line.concept_key == 'caja_chica':
        src = actuals['caja_chica']
    elif line.kind == 'ingreso':
        src = actuals['extra_income'].get(line.concept_key, {})
    else:
        src = actuals['gastos'].get(str(line.extra_field_id or line.concept_key), {})
    for p in periods:
        monthly[p[-2:]] = _f(src.get(p, 0))
    return monthly


def mark_budget_saved(budget):
    """Pasa de borrador a guardado al persistir cambios del escenario."""
    if budget.status == 'borrador':
        budget.status = 'guardado'
        budget.save(update_fields=['status', 'updated_at'])
    return budget


def mark_budget_approved(budget, user):
    CondoBudget.objects.filter(
        tenant_id=budget.tenant_id, year=budget.year, status='aprobado',
    ).exclude(pk=budget.pk).update(status='archivado')
    budget.status = 'aprobado'
    budget.approved_at = timezone.now()
    budget.approved_by = user
    budget.save(update_fields=['status', 'approved_at', 'approved_by', 'updated_at'])
    return budget


def budget_payload(budget, request=None, include_actuals=True):
    ctx = {'request': request}
    if include_actuals:
        ctx['actuals'] = actuals_for_year(budget.tenant, budget.year)
        ctx['year'] = budget.year
    return CondoBudgetSerializer(budget, context=ctx).data


class CondoBudgetLineSerializer(serializers.ModelSerializer):
    extra_field_id = serializers.UUIDField(required=False, allow_null=True)
    extra_field_label = serializers.SerializerMethodField()
    annual_amount = serializers.SerializerMethodField()
    actual_monthly = serializers.SerializerMethodField()
    actual_annual = serializers.SerializerMethodField()
    project_id = serializers.UUIDField(required=False, allow_null=True)
    project_name = serializers.SerializerMethodField()

    class Meta:
        model = CondoBudgetLine
        fields = (
            'id', 'kind', 'concept_key', 'name', 'extra_field_id', 'extra_field_label',
            'monthly_amounts', 'sort_order', 'annual_amount',
            'actual_monthly', 'actual_annual', 'project_id', 'project_name',
        )
        read_only_fields = ('id',)

    def get_annual_amount(self, obj):
        return line_annual(obj.monthly_amounts)

    def get_extra_field_label(self, obj):
        return obj.extra_field.label if obj.extra_field_id else ''

    def get_project_name(self, obj):
        return obj.project.name if obj.project_id else ''

    def get_actual_monthly(self, obj):
        actuals = self.context.get('actuals')
        year = self.context.get('year')
        if not actuals or not year:
            return None
        return attach_actuals(obj, actuals, year)

    def get_actual_annual(self, obj):
        monthly = self.get_actual_monthly(obj)
        if monthly is None:
            return None
        return round(sum(_f(v) for v in monthly.values()), 2)

    def validate_monthly_amounts(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError('monthly_amounts debe ser un objeto mes → monto.')
        clean = {}
        for m in MONTH_KEYS:
            raw = value.get(m, value.get(str(int(m)), 0))
            amt = _f(raw)
            if amt < 0:
                raise serializers.ValidationError('Los montos no pueden ser negativos.')
            clean[m] = round(amt, 2)
        return clean


class CondoBudgetSerializer(serializers.ModelSerializer):
    lines = CondoBudgetLineSerializer(many=True, required=False)
    created_by_name = serializers.SerializerMethodField()
    approved_by_name = serializers.SerializerMethodField()
    totals = serializers.SerializerMethodField()
    linked_projects = serializers.SerializerMethodField()
    seed_fee = serializers.DecimalField(max_digits=14, decimal_places=2, required=False)
    cashflow_rules = serializers.JSONField(required=False)

    class Meta:
        model = CondoBudget
        fields = (
            'id', 'year', 'name', 'notes', 'status',
            'seed_units', 'seed_fee', 'cashflow_rules', 'approval_steps',
            'created_by_name', 'approved_by_name', 'approved_at',
            'created_at', 'updated_at', 'lines', 'totals', 'linked_projects',
        )
        read_only_fields = (
            'id', 'status', 'approval_steps', 'approved_at', 'created_at', 'updated_at',
        )

    def get_created_by_name(self, obj):
        u = obj.created_by
        return (getattr(u, 'name', None) or getattr(u, 'email', '') or '') if u else ''

    def get_approved_by_name(self, obj):
        u = obj.approved_by
        return (getattr(u, 'name', None) or getattr(u, 'email', '') or '') if u else ''

    def get_totals(self, obj):
        return compute_budget_totals(obj, self.context.get('actuals'))

    def get_linked_projects(self, obj):
        seen = {}
        lines = obj.lines.all()
        for line in lines:
            if not line.project_id or line.project_id in seen:
                continue
            p = line.project
            seen[p.id] = {
                'id': str(p.id),
                'name': p.name,
                'status': p.status,
                'budget_amount': _f(p.budget_amount),
                'gasto_annual': 0,
                'ingreso_annual': 0,
            }
        for line in lines:
            if not line.project_id or line.project_id not in seen:
                continue
            amt = line_annual(line.monthly_amounts)
            if line.kind == 'ingreso':
                seen[line.project_id]['ingreso_annual'] += amt
            else:
                seen[line.project_id]['gasto_annual'] += amt
        return list(seen.values())

    def validate_cashflow_rules(self, value):
        return normalize_cashflow_rules(value)


class CondoBudgetListSerializer(serializers.ModelSerializer):
    totals = serializers.SerializerMethodField()

    class Meta:
        model = CondoBudget
        fields = (
            'id', 'year', 'name', 'status', 'notes', 'seed_units', 'seed_fee',
            'updated_at', 'totals',
        )

    def get_totals(self, obj):
        return compute_budget_totals(obj)


class CondoProjectCostSerializer(serializers.ModelSerializer):
    extra_field_id = serializers.UUIDField(required=False, allow_null=True)
    extra_field_label = serializers.SerializerMethodField()
    gasto_entry_id = serializers.UUIDField(required=False, allow_null=True)

    class Meta:
        model = CondoProjectCost
        fields = (
            'id', 'period', 'amount', 'description', 'cost_date',
            'extra_field_id', 'extra_field_label', 'gasto_entry_id', 'created_at',
        )
        read_only_fields = ('id', 'created_at')

    def get_extra_field_label(self, obj):
        return obj.extra_field.label if obj.extra_field_id else ''


class CondoProjectFileSerializer(serializers.ModelSerializer):
    quote_id = serializers.UUIDField(required=False, allow_null=True)
    file_url = serializers.SerializerMethodField()
    uploaded_by_name = serializers.SerializerMethodField()
    size = serializers.SerializerMethodField()
    quote_supplier = serializers.SerializerMethodField()

    class Meta:
        model = CondoProjectFile
        fields = (
            'id', 'kind', 'original_name', 'notes', 'quote_id', 'quote_supplier',
            'file_url', 'size', 'uploaded_by_name', 'created_at',
        )
        read_only_fields = ('id', 'created_at')

    def get_file_url(self, obj):
        return media_api_url(obj.file, self.context.get('request'))

    def get_uploaded_by_name(self, obj):
        u = obj.uploaded_by
        return (getattr(u, 'name', None) or getattr(u, 'email', '') or '') if u else ''

    def get_size(self, obj):
        try:
            return obj.file.size
        except Exception:
            return None

    def get_quote_supplier(self, obj):
        return obj.quote.supplier_name if obj.quote_id else ''


class CondoProjectQuoteSerializer(serializers.ModelSerializer):
    files = CondoProjectFileSerializer(many=True, read_only=True)

    class Meta:
        model = CondoProjectQuote
        fields = (
            'id', 'provider', 'supplier_name', 'supplier_rfc', 'supplier_contact',
            'supplier_phone', 'supplier_email', 'supplier_notes',
            'amount', 'validity_date', 'delivery_days', 'warranty_months',
            'scope', 'is_winner', 'sort_order', 'files', 'created_at', 'updated_at',
        )
        read_only_fields = ('id', 'is_winner', 'created_at', 'updated_at')
        extra_kwargs = {'provider': {'allow_null': True, 'required': False}}

    def validate(self, attrs):
        from .proveedores import snapshot_from_provider
        provider = attrs.get('provider')
        if provider is None and self.instance:
            provider = self.instance.provider
        if not provider:
            raise serializers.ValidationError({
                'provider': 'Selecciona un proveedor del catálogo de Configuración. No se dan de alta desde Planeación.',
            })
        snap = snapshot_from_provider(provider)
        if snap:
            if not (attrs.get('supplier_name') or '').strip():
                attrs['supplier_name'] = snap['name']
            if not (attrs.get('supplier_rfc') or '').strip():
                attrs['supplier_rfc'] = snap['rfc']
            if not (attrs.get('supplier_contact') or '').strip():
                attrs['supplier_contact'] = snap['contact']
            if not (attrs.get('supplier_phone') or '').strip():
                attrs['supplier_phone'] = snap['phone']
            if not (attrs.get('supplier_email') or '').strip():
                attrs['supplier_email'] = snap['email']
        attrs['provider'] = provider
        return attrs


class CondoProjectSerializer(serializers.ModelSerializer):
    extra_field_id = serializers.UUIDField(required=False, allow_null=True)
    extra_field_label = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()
    spent = serializers.SerializerMethodField()
    costs = CondoProjectCostSerializer(many=True, read_only=True)
    quotes = CondoProjectQuoteSerializer(many=True, read_only=True)
    files = serializers.SerializerMethodField()
    progress_pct = serializers.SerializerMethodField()
    funding = serializers.SerializerMethodField()
    budgets = serializers.SerializerMethodField()
    budget_id = serializers.SerializerMethodField()
    budget_name = serializers.SerializerMethodField()
    budget_year = serializers.SerializerMethodField()
    budget_status = serializers.SerializerMethodField()
    winner_quote_id = serializers.UUIDField(read_only=True)
    winner_supplier_name = serializers.SerializerMethodField()
    quotes_count = serializers.SerializerMethodField()
    files_count = serializers.SerializerMethodField()

    class Meta:
        model = CondoProject
        fields = (
            'id', 'name', 'description', 'status', 'priority',
            'extra_field_id', 'extra_field_label', 'budget_amount',
            'start_period', 'end_period', 'responsible_name', 'notes',
            'funding_mode', 'funding_condo_pct', 'funding_residents_pct',
            'funding_units', 'funding_notes', 'funding',
            'contest_status', 'winner_quote_id', 'winner_supplier_name',
            'budgets', 'budget_id', 'budget_name', 'budget_year', 'budget_status',
            'approval_steps', 'created_by_name', 'created_at', 'updated_at',
            'spent', 'progress_pct', 'quotes_count', 'files_count',
            'costs', 'quotes', 'files',
        )
        read_only_fields = (
            'id', 'approval_steps', 'contest_status', 'created_at', 'updated_at',
        )

    def get_spent(self, obj):
        if hasattr(obj, '_prefetched_objects_cache') and 'costs' in obj._prefetched_objects_cache:
            return round(sum(_f(c.amount) for c in obj.costs.all()), 2)
        total = obj.costs.aggregate(s=Sum('amount'))['s']
        return _f(total)

    def get_extra_field_label(self, obj):
        return obj.extra_field.label if obj.extra_field_id else ''

    def get_created_by_name(self, obj):
        u = obj.created_by
        return (getattr(u, 'name', None) or getattr(u, 'email', '') or '') if u else ''

    def get_progress_pct(self, obj):
        budget = _f(obj.budget_amount)
        if budget <= 0:
            return 0
        return round(min(999, (_f(self.get_spent(obj)) / budget) * 100), 1)

    def get_funding(self, obj):
        return project_funding_breakdown(obj)

    def get_budgets(self, obj):
        return [serialize_project_budget(b) for b in project_budget_list(obj)]

    def get_budget_id(self, obj):
        linked = project_budget_list(obj)
        return linked[0].id if linked else None

    def get_budget_name(self, obj):
        linked = project_budget_list(obj)
        if not linked:
            return ''
        if len(linked) == 1:
            return linked[0].name or f'Presupuesto {linked[0].year}'
        return f'{len(linked)} presupuestos'

    def get_budget_year(self, obj):
        linked = project_budget_list(obj)
        return linked[0].year if linked else None

    def get_budget_status(self, obj):
        linked = project_budget_list(obj)
        return linked[0].status if linked else ''

    def get_winner_supplier_name(self, obj):
        q = obj.winner_quote
        return q.supplier_name if q else ''

    def get_quotes_count(self, obj):
        if hasattr(obj, '_prefetched_objects_cache') and 'quotes' in obj._prefetched_objects_cache:
            return len(obj.quotes.all())
        return obj.quotes.count()

    def get_files_count(self, obj):
        if hasattr(obj, '_prefetched_objects_cache') and 'files' in obj._prefetched_objects_cache:
            return len(obj.files.all())
        return obj.files.count()

    def get_files(self, obj):
        return CondoProjectFileSerializer(obj.files.all(), many=True, context=self.context).data


class CondoProjectListSerializer(CondoProjectSerializer):
    class Meta(CondoProjectSerializer.Meta):
        fields = (
            'id', 'name', 'description', 'status', 'priority',
            'extra_field_id', 'extra_field_label', 'budget_amount',
            'start_period', 'end_period', 'responsible_name',
            'funding_mode', 'contest_status', 'winner_supplier_name',
            'budgets', 'budget_id', 'budget_name', 'budget_year',
            'approval_steps', 'created_at', 'spent', 'progress_pct',
            'quotes_count', 'files_count', 'funding',
        )


class PlaneacionContextView(APIView):
    permission_classes = [IsAdminOrTesOrAuditor]

    def get(self, request, tenant_id):
        tenant = Tenant.objects.get(id=tenant_id)
        _require_condominio(tenant)
        ctx = tenant_planning_context(tenant)
        year = request.query_params.get('year')
        try:
            year_i = int(year) if year else date.today().year
        except ValueError:
            return Response({'detail': 'Año inválido.'}, status=400)
        ctx['year'] = year_i
        ctx['actuals'] = actuals_for_year(tenant, year_i)
        budgets = list(
            CondoBudget.objects.filter(tenant=tenant).values(
                'id', 'year', 'name', 'status', 'updated_at',
            )
        )
        ctx['existing_years'] = budgets
        ctx['existing_budgets'] = [
            {**b, 'id': str(b['id'])} for b in budgets
        ]
        ctx['planning_flow'] = tenant.planning_flow or {'enabled': False, 'steps': []}
        ctx['approvers'] = tenant_approvers(tenant)
        ctx['max_seed_units'] = max_seed_units(tenant, ctx)
        return Response(ctx)


class CondoBudgetViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAdminOrTesOrAuditor]
    pagination_class = None

    def get_permissions(self):
        if self.action in ('approve_step', 'reject_step'):
            return [IsAuthenticated()]
        return super().get_permissions()

    def get_queryset(self):
        qs = CondoBudget.objects.filter(
            tenant_id=self.kwargs['tenant_id']
        ).prefetch_related('lines__extra_field', 'lines__project')
        year = self.request.query_params.get('year')
        if year:
            try:
                qs = qs.filter(year=int(year))
            except (TypeError, ValueError):
                pass
        return qs

    def get_serializer_class(self):
        if self.action == 'list':
            return CondoBudgetListSerializer
        return CondoBudgetSerializer

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        include = (self.request.query_params.get('include_actuals') or '') in ('1', 'true', 'True')
        obj = getattr(self, '_budget_for_actuals', None)
        if include and self.action in ('retrieve', 'list') or (include and obj):
            tenant = Tenant.objects.get(id=self.kwargs['tenant_id'])
            year = None
            if self.action == 'retrieve':
                year = self.get_object().year
            elif obj:
                year = obj.year
            if year:
                ctx['actuals'] = actuals_for_year(tenant, year)
                ctx['year'] = year
        return ctx

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        include = (request.query_params.get('include_actuals') or '1') not in ('0', 'false', 'False')
        return Response(budget_payload(instance, request, include_actuals=include))

    def perform_create(self, serializer):
        tenant = Tenant.objects.get(id=self.kwargs['tenant_id'])
        _require_condominio(tenant)
        year = serializer.validated_data.get('year')
        name = serializer.validated_data.get('name') or f'Presupuesto {year}'
        user = request_user(self.request)
        units = serializer.validated_data.get('seed_units')
        fee = serializer.validated_data.get('seed_fee')
        if units is not None:
            serializer.validated_data['seed_units'] = cap_seed_units(tenant, units)
        if serializer.validated_data.get('cashflow_rules') is not None:
            serializer.validated_data['cashflow_rules'] = normalize_cashflow_rules(
                serializer.validated_data['cashflow_rules']
            )
        budget = serializer.save(tenant=tenant, name=name, created_by=user, status='borrador')
        if fee is not None:
            budget.seed_fee = _d(fee)
            budget.save(update_fields=['seed_fee', 'updated_at'])
        _audit(
            self.request, 'create', f'Presupuesto {budget.year} creado',
            tenant.id, 'CondoBudget', budget.id, budget.name,
        )

    def perform_update(self, serializer):
        inst = serializer.instance
        if inst.status in BUDGET_LOCKED:
            allowed = {'name', 'notes'} if inst.status != 'archivado' else set()
            dirty = set(serializer.validated_data.keys()) - allowed
            if inst.status == 'archivado' or dirty:
                raise ValidationError({'detail': 'Este presupuesto no se puede editar en su estado actual.'})
        tenant = inst.tenant
        if 'seed_units' in serializer.validated_data:
            serializer.validated_data['seed_units'] = cap_seed_units(
                tenant, serializer.validated_data['seed_units'],
            )
        instance = serializer.save()
        mark_budget_saved(instance)
        _audit(
            self.request, 'update', f'Presupuesto {instance.year} actualizado',
            instance.tenant_id, 'CondoBudget', instance.id, instance.name,
        )

    def perform_destroy(self, instance):
        if instance.status == 'aprobado':
            raise ValidationError({'detail': 'Archiva el presupuesto aprobado antes de eliminarlo.'})
        desc = instance.name
        oid = instance.id
        tid = instance.tenant_id
        instance.delete()
        _audit(self.request, 'delete', f'Presupuesto eliminado: {desc}', tid, 'CondoBudget', oid, desc)

    @action(detail=False, methods=['post'], url_path='planning-flow')
    def save_planning_flow(self, request, tenant_id):
        tenant = Tenant.objects.get(id=tenant_id)
        _require_condominio(tenant)
        tenant.planning_flow = normalize_planning_flow(request.data)
        tenant.save(update_fields=['planning_flow', 'updated_at'])
        _audit(
            request, 'update', 'Flujo de aprobación de planeación actualizado',
            tenant.id, 'Tenant', tenant.id, tenant.name,
        )
        return Response({
            'planning_flow': tenant.planning_flow,
            'approvers': tenant_approvers(tenant),
        })

    @action(detail=False, methods=['post'], url_path='seed')
    def seed(self, request, tenant_id):
        tenant = Tenant.objects.get(id=tenant_id)
        _require_condominio(tenant)
        try:
            year = int(request.data.get('year') or date.today().year)
        except (TypeError, ValueError):
            return Response({'detail': 'Año inválido.'}, status=400)
        ctx = tenant_planning_context(tenant)
        units = cap_seed_units(
            tenant,
            request.data.get('units', request.data.get('seed_units', ctx['units_billable'])),
            ctx,
        )
        fee = _d(request.data.get('fee', request.data.get('seed_fee', tenant.maintenance_fee)))
        n_year = CondoBudget.objects.filter(tenant=tenant, year=year).count()
        default_name = f'Presupuesto {year}' if n_year == 0 else f'Escenario {n_year + 1} · {year}'
        with transaction.atomic():
            budget = CondoBudget.objects.create(
                tenant=tenant, year=year,
                name=(request.data.get('name') or default_name).strip() or default_name,
                notes=request.data.get('notes') or '',
                created_by=request_user(request),
                cashflow_rules=normalize_cashflow_rules(request.data.get('cashflow_rules') or []),
            )
            count = seed_budget_lines(budget, tenant, units=units, fee=fee)
        _audit(
            request, 'create', f'Presupuesto {year} generado con datos del condominio ({count} partidas)',
            tenant.id, 'CondoBudget', budget.id, budget.name,
        )
        return Response(budget_payload(budget, request), status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='clone')
    def clone(self, request, tenant_id, pk=None):
        src = self.get_object()
        name = (request.data.get('name') or f'{src.name or "Presupuesto"} (copia)').strip()
        with transaction.atomic():
            budget = CondoBudget.objects.create(
                tenant_id=tenant_id,
                year=src.year,
                name=name,
                notes=src.notes,
                status='borrador',
                seed_units=src.seed_units,
                seed_fee=src.seed_fee,
                cashflow_rules=list(src.cashflow_rules or []),
                created_by=request_user(request),
            )
            CondoBudgetLine.objects.bulk_create([
                CondoBudgetLine(
                    budget=budget,
                    kind=line.kind,
                    concept_key=line.concept_key,
                    name=line.name,
                    extra_field_id=line.extra_field_id,
                    monthly_amounts=line.monthly_amounts,
                    sort_order=line.sort_order,
                )
                for line in src.lines.all()
                if not line.project_id
            ])
        _audit(
            request, 'create', f'Escenario clonado desde {src.name}',
            tenant_id, 'CondoBudget', budget.id, budget.name,
        )
        return Response(budget_payload(budget, request), status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='apply-seed')
    def apply_seed(self, request, tenant_id, pk=None):
        budget = self.get_object()
        if budget.status in BUDGET_LOCKED:
            return Response({'detail': 'Este presupuesto no se puede recalcular en su estado actual.'}, status=400)
        tenant = budget.tenant
        ctx = tenant_planning_context(tenant)
        units = request.data.get('units', request.data.get('seed_units', budget.seed_units or ctx['units_billable']))
        fee = request.data.get('fee', request.data.get('seed_fee', budget.seed_fee or tenant.maintenance_fee))
        apply_seed_to_existing_lines(budget, tenant, units, fee)
        mark_budget_saved(budget)
        _audit(
            request, 'update', f'Variables base aplicadas a {budget.name}',
            tenant_id, 'CondoBudget', budget.id, budget.name,
        )
        return Response(budget_payload(budget, request))

    @action(detail=True, methods=['put', 'patch'], url_path='lines')
    def replace_lines(self, request, tenant_id, pk=None):
        budget = self.get_object()
        if budget.status in BUDGET_LOCKED:
            return Response({'detail': 'No se puede editar un presupuesto en este estado.'}, status=400)
        payload = request.data if isinstance(request.data, list) else request.data.get('lines')
        if not isinstance(payload, list):
            return Response({'detail': 'Envía una lista de partidas.'}, status=400)
        ser = CondoBudgetLineSerializer(data=payload, many=True)
        ser.is_valid(raise_exception=True)
        field_ids = {
            str(f.id): f
            for f in ExtraField.objects.filter(tenant_id=tenant_id)
        }
        project_lines = list(budget.lines.filter(project_id__isnull=False))
        with transaction.atomic():
            budget.lines.all().delete()
            objs = []
            for i, item in enumerate(ser.validated_data):
                if is_project_managed_line(item):
                    continue
                fid = item.pop('extra_field_id', None)
                item.pop('project_id', None)
                extra = field_ids.get(str(fid)) if fid else None
                objs.append(CondoBudgetLine(
                    budget=budget,
                    extra_field=extra,
                    sort_order=item.get('sort_order', i),
                    kind=item['kind'],
                    concept_key=item.get('concept_key') or (str(fid) if fid else 'custom'),
                    name=item['name'],
                    monthly_amounts=item.get('monthly_amounts') or even_months(0),
                ))
            CondoBudgetLine.objects.bulk_create(objs)
            CondoBudgetLine.objects.bulk_create([
                CondoBudgetLine(
                    budget=budget,
                    kind=line.kind,
                    extra_field_id=line.extra_field_id,
                    concept_key=line.concept_key,
                    name=line.name,
                    monthly_amounts=line.monthly_amounts,
                    project_id=line.project_id,
                    sort_order=line.sort_order,
                )
                for line in project_lines
            ])
        budget.refresh_from_db()
        mark_budget_saved(budget)
        return Response(budget_payload(budget, request))

    @action(detail=True, methods=['post'])
    def approve(self, request, tenant_id, pk=None):
        budget = self.get_object()
        if budget.status == 'aprobado':
            return Response({'detail': 'Este presupuesto ya está aprobado.'}, status=400)
        if budget.status == 'archivado':
            return Response({'detail': 'Un presupuesto archivado no se puede aprobar.'}, status=400)
        tenant = budget.tenant
        if planning_flow_enabled(tenant) and budget.status != 'en_aprobacion':
            return Response({
                'detail': 'Este condominio tiene flujo de aprobación. Envíalo a aprobación primero.',
            }, status=400)
        if planning_flow_enabled(tenant) and budget.status == 'en_aprobacion':
            return Response({
                'detail': 'El presupuesto está en flujo. Cada aprobador debe confirmar su paso.',
            }, status=400)
        mark_budget_approved(budget, request_user(request))
        _audit(
            request, 'update', f'Presupuesto {budget.year} aprobado',
            tenant_id, 'CondoBudget', budget.id, budget.name,
        )
        return Response(budget_payload(budget, request))

    @action(detail=True, methods=['post'], url_path='submit-approval')
    def submit_approval(self, request, tenant_id, pk=None):
        budget = self.get_object()
        if budget.status not in ('borrador', 'guardado'):
            return Response({'detail': 'Solo un presupuesto en borrador o guardado se puede enviar a aprobación.'}, status=400)
        tenant = budget.tenant
        if not planning_flow_enabled(tenant):
            return Response({'detail': 'Configura el flujo de aprobación antes de enviarlo.'}, status=400)
        steps = snapshot_flow_steps(tenant)
        if not steps:
            return Response({'detail': 'El flujo no tiene pasos de aprobación.'}, status=400)
        budget.status = 'en_aprobacion'
        budget.approval_steps = steps
        budget.save(update_fields=['status', 'approval_steps', 'updated_at'])
        nxt = pending_step(steps)
        _notify_user(
            tenant, _user_by_id(nxt.get('user_id') if nxt else None),
            f'Aprobación de presupuesto {budget.year}',
            f'Se requiere tu visto bueno para el escenario «{budget.name}» de {tenant.name}.',
        )
        _audit(
            request, 'update', f'Presupuesto {budget.name} enviado a aprobación',
            tenant_id, 'CondoBudget', budget.id, budget.name,
        )
        return Response(budget_payload(budget, request))

    @action(detail=True, methods=['post'], url_path='approve-step')
    def approve_step(self, request, tenant_id, pk=None):
        budget = self.get_object()
        user = request_user(request)
        _ensure_tenant_member(user, tenant_id)
        if budget.status != 'en_aprobacion':
            return Response({'detail': 'Este presupuesto no está en aprobación.'}, status=400)
        step = pending_step(budget.approval_steps)
        if not step:
            return Response({'detail': 'No hay pasos pendientes.'}, status=400)
        if str(step.get('user_id')) != str(user.pk) and not getattr(user, 'is_super_admin', False):
            return Response({'detail': 'No eres el aprobador de este paso.'}, status=403)
        notes = (request.data.get('notes') or '')[:400]
        new_steps = []
        for s in budget.approval_steps or []:
            if s.get('order') == step.get('order') and s.get('status') == 'pending':
                new_steps.append({
                    **s, 'status': 'approved',
                    'actioned_at': timezone.now().isoformat(),
                    'notes': notes,
                })
            else:
                new_steps.append(s)
        budget.approval_steps = new_steps
        nxt = pending_step(new_steps)
        if not nxt:
            mark_budget_approved(budget, user)
            budget.approval_steps = new_steps
            budget.save(update_fields=['approval_steps', 'updated_at'])
            _audit(
                request, 'update', f'Presupuesto {budget.name} aprobado (flujo completo)',
                tenant_id, 'CondoBudget', budget.id, budget.name,
            )
        else:
            budget.save(update_fields=['approval_steps', 'updated_at'])
            _notify_user(
                budget.tenant, _user_by_id(nxt.get('user_id')),
                f'Aprobación de presupuesto {budget.year}',
                f'El paso anterior ya fue aprobado. Te toca revisar «{budget.name}».',
            )
            _audit(
                request, 'update', f'Paso {step.get("order")} aprobado en {budget.name}',
                tenant_id, 'CondoBudget', budget.id, budget.name,
            )
        return Response(budget_payload(budget, request))

    @action(detail=True, methods=['post'], url_path='reject-step')
    def reject_step(self, request, tenant_id, pk=None):
        budget = self.get_object()
        user = request_user(request)
        _ensure_tenant_member(user, tenant_id)
        if budget.status != 'en_aprobacion':
            return Response({'detail': 'Este presupuesto no está en aprobación.'}, status=400)
        step = pending_step(budget.approval_steps)
        if not step:
            return Response({'detail': 'No hay pasos pendientes.'}, status=400)
        if str(step.get('user_id')) != str(user.pk) and not getattr(user, 'is_super_admin', False):
            return Response({'detail': 'No eres el aprobador de este paso.'}, status=403)
        notes = (request.data.get('notes') or '').strip()
        if not notes:
            return Response({'detail': 'Indica el motivo del rechazo.'}, status=400)
        new_steps = []
        for s in budget.approval_steps or []:
            if s.get('order') == step.get('order') and s.get('status') == 'pending':
                new_steps.append({
                    **s, 'status': 'rejected',
                    'actioned_at': timezone.now().isoformat(),
                    'notes': notes[:400],
                })
            else:
                new_steps.append(s)
        budget.status = 'guardado'
        budget.approval_steps = new_steps
        budget.save(update_fields=['status', 'approval_steps', 'updated_at'])
        _audit(
            request, 'update', f'Presupuesto {budget.name} rechazado en aprobación',
            tenant_id, 'CondoBudget', budget.id, budget.name,
        )
        return Response(budget_payload(budget, request))

    @action(detail=True, methods=['post'])
    def archive(self, request, tenant_id, pk=None):
        budget = self.get_object()
        budget.status = 'archivado'
        budget.save(update_fields=['status', 'updated_at'])
        _audit(
            request, 'update', f'Presupuesto {budget.year} archivado',
            tenant_id, 'CondoBudget', budget.id, budget.name,
        )
        return Response(budget_payload(budget, request, include_actuals=False))


def request_user(request):
    user = getattr(request, 'user', None)
    if user and getattr(user, 'is_authenticated', False):
        return user
    return None


class CondoProjectViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAdminOrTesOrAuditor]
    pagination_class = None

    def get_permissions(self):
        if self.action in ('approve_step', 'reject_step'):
            return [IsAuthenticated()]
        return super().get_permissions()

    def get_queryset(self):
        qs = CondoProject.objects.filter(
            tenant_id=self.kwargs['tenant_id']
        ).select_related(
            'extra_field', 'created_by', 'winner_quote',
        ).prefetch_related(
            'budgets',
            'costs__extra_field',
            'quotes__files__uploaded_by',
            'files__uploaded_by',
            'files__quote',
        )
        st = self.request.query_params.get('status')
        if st:
            qs = qs.filter(status=st)
        return qs

    def get_serializer_class(self):
        if self.action == 'list':
            return CondoProjectListSerializer
        return CondoProjectSerializer

    def perform_create(self, serializer):
        tenant = Tenant.objects.get(id=self.kwargs['tenant_id'])
        _require_condominio(tenant)
        extra = None
        fid = serializer.validated_data.pop('extra_field_id', None)
        if fid:
            extra = ExtraField.objects.filter(tenant=tenant, id=fid).first()
        status_in = serializer.validated_data.get('status') or 'idea'
        if status_in == 'aprobado' and planning_flow_enabled(tenant):
            serializer.validated_data['status'] = 'idea'
        project = serializer.save(
            tenant=tenant, extra_field=extra, created_by=request_user(self.request),
        )
        apply_funding_to_project(project, self.request.data)
        project.save()
        budget_ids = parse_budget_ids(self.request.data)
        if budget_ids:
            sync_project_budgets(project, budget_ids, tenant.id)
        _audit(
            self.request, 'create', f'Proyecto creado: {project.name}',
            tenant.id, 'CondoProject', project.id, project.name,
        )

    def perform_update(self, serializer):
        inst = serializer.instance
        tenant = inst.tenant
        new_status = serializer.validated_data.get('status')
        if (
            new_status == 'aprobado'
            and inst.status in PROJECT_FLOW_STATUSES
            and planning_flow_enabled(tenant)
        ):
            raise ValidationError({
                'detail': 'Usa el flujo de aprobación para aprobar este proyecto.',
            })
        fid = serializer.validated_data.pop('extra_field_id', serializers.empty)
        extra_kw = {}
        if fid is not serializers.empty:
            extra_kw['extra_field'] = ExtraField.objects.filter(
                tenant_id=self.kwargs['tenant_id'], id=fid,
            ).first() if fid else None
        instance = serializer.save(**extra_kw)
        apply_funding_to_project(instance, self.request.data)
        instance.save()
        budget_ids = parse_budget_ids(self.request.data)
        if budget_ids is not None:
            sync_project_budgets(instance, budget_ids, instance.tenant_id)
        else:
            maybe_resync_budget(instance)
        _audit(
            self.request, 'update', f'Proyecto actualizado: {instance.name}',
            instance.tenant_id, 'CondoProject', instance.id, instance.name,
        )

    def perform_destroy(self, instance):
        desc = instance.name
        oid = instance.id
        tid = instance.tenant_id
        CondoBudgetLine.objects.filter(project=instance).delete()
        instance.delete()
        _audit(self.request, 'delete', f'Proyecto eliminado: {desc}', tid, 'CondoProject', oid, desc)

    @action(detail=True, methods=['post'], url_path='submit-approval')
    def submit_approval(self, request, tenant_id, pk=None):
        project = self.get_object()
        tenant = project.tenant
        if project.status not in ('idea',):
            return Response({'detail': 'Solo un proyecto en idea se puede enviar a aprobación.'}, status=400)
        if not planning_flow_enabled(tenant):
            project.status = 'aprobado'
            project.save(update_fields=['status', 'updated_at'])
            _audit(
                request, 'update', f'Proyecto {project.name} aprobado',
                tenant_id, 'CondoProject', project.id, project.name,
            )
            return Response(CondoProjectSerializer(project).data)
        steps = snapshot_flow_steps(tenant)
        project.status = 'en_aprobacion'
        project.approval_steps = steps
        project.save(update_fields=['status', 'approval_steps', 'updated_at'])
        nxt = pending_step(steps)
        _notify_user(
            tenant, _user_by_id(nxt.get('user_id') if nxt else None),
            f'Aprobación de proyecto: {project.name}',
            f'Se requiere tu visto bueno para el proyecto «{project.name}» de {tenant.name}.',
        )
        _audit(
            request, 'update', f'Proyecto {project.name} enviado a aprobación',
            tenant_id, 'CondoProject', project.id, project.name,
        )
        return Response(CondoProjectSerializer(project).data)

    @action(detail=True, methods=['post'], url_path='approve-step')
    def approve_step(self, request, tenant_id, pk=None):
        project = self.get_object()
        user = request_user(request)
        _ensure_tenant_member(user, tenant_id)
        if project.status != 'en_aprobacion':
            return Response({'detail': 'Este proyecto no está en aprobación.'}, status=400)
        step = pending_step(project.approval_steps)
        if not step:
            return Response({'detail': 'No hay pasos pendientes.'}, status=400)
        if str(step.get('user_id')) != str(user.pk) and not getattr(user, 'is_super_admin', False):
            return Response({'detail': 'No eres el aprobador de este paso.'}, status=403)
        notes = (request.data.get('notes') or '')[:400]
        new_steps = []
        for s in project.approval_steps or []:
            if s.get('order') == step.get('order') and s.get('status') == 'pending':
                new_steps.append({
                    **s, 'status': 'approved',
                    'actioned_at': timezone.now().isoformat(),
                    'notes': notes,
                })
            else:
                new_steps.append(s)
        project.approval_steps = new_steps
        nxt = pending_step(new_steps)
        if not nxt:
            project.status = 'aprobado'
            project.save(update_fields=['status', 'approval_steps', 'updated_at'])
            _audit(
                request, 'update', f'Proyecto {project.name} aprobado (flujo completo)',
                tenant_id, 'CondoProject', project.id, project.name,
            )
        else:
            project.save(update_fields=['approval_steps', 'updated_at'])
            _notify_user(
                project.tenant, _user_by_id(nxt.get('user_id')),
                f'Aprobación de proyecto: {project.name}',
                f'El paso anterior ya fue aprobado. Te toca revisar «{project.name}».',
            )
            _audit(
                request, 'update', f'Paso {step.get("order")} aprobado en proyecto {project.name}',
                tenant_id, 'CondoProject', project.id, project.name,
            )
        return Response(CondoProjectSerializer(project).data)

    @action(detail=True, methods=['post'], url_path='reject-step')
    def reject_step(self, request, tenant_id, pk=None):
        project = self.get_object()
        user = request_user(request)
        _ensure_tenant_member(user, tenant_id)
        if project.status != 'en_aprobacion':
            return Response({'detail': 'Este proyecto no está en aprobación.'}, status=400)
        step = pending_step(project.approval_steps)
        if not step:
            return Response({'detail': 'No hay pasos pendientes.'}, status=400)
        if str(step.get('user_id')) != str(user.pk) and not getattr(user, 'is_super_admin', False):
            return Response({'detail': 'No eres el aprobador de este paso.'}, status=403)
        notes = (request.data.get('notes') or '').strip()
        if not notes:
            return Response({'detail': 'Indica el motivo del rechazo.'}, status=400)
        new_steps = []
        for s in project.approval_steps or []:
            if s.get('order') == step.get('order') and s.get('status') == 'pending':
                new_steps.append({
                    **s, 'status': 'rejected',
                    'actioned_at': timezone.now().isoformat(),
                    'notes': notes[:400],
                })
            else:
                new_steps.append(s)
        project.status = 'idea'
        project.approval_steps = new_steps
        project.save(update_fields=['status', 'approval_steps', 'updated_at'])
        _audit(
            request, 'update', f'Proyecto {project.name} rechazado en aprobación',
            tenant_id, 'CondoProject', project.id, project.name,
        )
        return Response(CondoProjectSerializer(project).data)

    @action(detail=True, methods=['get', 'post'], url_path='costs')
    def costs(self, request, tenant_id, pk=None):
        project = self.get_object()
        if request.method == 'GET':
            return Response(CondoProjectCostSerializer(project.costs.all(), many=True).data)
        ser = CondoProjectCostSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        extra = None
        fid = ser.validated_data.get('extra_field_id') or (project.extra_field_id)
        if fid:
            extra = ExtraField.objects.filter(tenant_id=tenant_id, id=fid).first()
        gasto = None
        gid = ser.validated_data.get('gasto_entry_id')
        if gid:
            gasto = GastoEntry.objects.filter(tenant_id=tenant_id, id=gid).first()
            if not gasto:
                return Response({'detail': 'El gasto no existe en este condominio.'}, status=400)
            if CondoProjectCost.objects.filter(gasto_entry=gasto).exists():
                return Response({'detail': 'Ese gasto ya está ligado a un proyecto.'}, status=400)
        cost = CondoProjectCost.objects.create(
            project=project,
            period=ser.validated_data['period'],
            amount=ser.validated_data['amount'],
            description=ser.validated_data.get('description') or (gasto.notes if gasto else ''),
            cost_date=ser.validated_data.get('cost_date') or (gasto.gasto_date if gasto else None),
            extra_field=extra,
            gasto_entry=gasto,
        )
        _audit(
            request, 'create', f'Costo en {project.name}: {cost.amount}',
            tenant_id, 'CondoProjectCost', cost.id, project.name,
        )
        return Response(CondoProjectCostSerializer(cost).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['delete'], url_path='costs/(?P<cost_id>[^/.]+)')
    def destroy_cost(self, request, tenant_id, pk=None, cost_id=None):
        project = self.get_object()
        cost = project.costs.filter(id=cost_id).first()
        if not cost:
            return Response({'detail': 'Costo no encontrado.'}, status=404)
        cost.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['get', 'post'], url_path='import-gastos')
    def import_gastos(self, request, tenant_id, pk=None):
        project = self.get_object()
        period = (request.query_params.get('period') or request.data.get('period') or '').strip()
        qs = GastoEntry.objects.filter(tenant_id=tenant_id).select_related('field')
        if period:
            qs = qs.filter(period=period)
        if project.extra_field_id:
            qs = qs.filter(field_id=project.extra_field_id)
        linked = set(
            CondoProjectCost.objects.filter(
                project__tenant_id=tenant_id, gasto_entry__isnull=False,
            ).values_list('gasto_entry_id', flat=True)
        )
        if request.method == 'GET':
            rows = []
            for g in qs.order_by('-period', '-gasto_date')[:80]:
                rows.append({
                    'id': str(g.id),
                    'period': g.period,
                    'amount': _f(g.amount),
                    'description': g.notes or (g.field.label if g.field else 'Gasto'),
                    'provider_name': g.provider_name,
                    'gasto_date': str(g.gasto_date) if g.gasto_date else None,
                    'field_label': g.field.label if g.field else '',
                    'already_linked': g.id in linked,
                })
            return Response(rows)

        ids = request.data.get('gasto_ids') or []
        created = 0
        for gid in ids:
            g = qs.filter(id=gid).first()
            if not g or g.id in linked:
                continue
            CondoProjectCost.objects.create(
                project=project,
                period=g.period,
                amount=g.amount,
                description=g.notes or (g.field.label if g.field else 'Gasto'),
                cost_date=g.gasto_date,
                extra_field=g.field,
                gasto_entry=g,
            )
            created += 1
        project.refresh_from_db()
        data = dict(CondoProjectSerializer(project).data)
        data['imported'] = created
        return Response(data)

    @action(detail=True, methods=['get', 'post'], url_path='quotes')
    def quotes(self, request, tenant_id, pk=None):
        project = self.get_object()
        if request.method == 'GET':
            return Response(
                CondoProjectQuoteSerializer(
                    project.quotes.all(), many=True, context={'request': request},
                ).data
            )
        if project.quotes.count() >= QUOTE_LIMIT:
            return Response(
                {'detail': f'Solo se permiten {QUOTE_LIMIT} cotizaciones por proyecto.'},
                status=400,
            )
        ser = CondoProjectQuoteSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        quote = CondoProjectQuote.objects.create(
            project=project,
            **ser.validated_data,
            sort_order=ser.validated_data.get('sort_order') or project.quotes.count(),
        )
        sync_contest_status(project)
        _audit(
            request, 'create', f'Cotización {quote.supplier_name} en {project.name}',
            tenant_id, 'CondoProjectQuote', quote.id, quote.supplier_name,
        )
        return Response(
            CondoProjectQuoteSerializer(quote, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=['patch', 'delete'], url_path='quotes/(?P<quote_id>[^/.]+)')
    def quote_detail(self, request, tenant_id, pk=None, quote_id=None):
        project = self.get_object()
        quote = project.quotes.filter(id=quote_id).first()
        if not quote:
            return Response({'detail': 'Cotización no encontrada.'}, status=404)
        if request.method == 'DELETE':
            was_winner = quote.is_winner
            name = quote.supplier_name
            quote.delete()
            sync_contest_status(project)
            if was_winner:
                maybe_resync_budget(project)
            _audit(
                request, 'delete', f'Cotización {name} eliminada de {project.name}',
                tenant_id, 'CondoProjectQuote', quote_id, name,
            )
            return Response(status=status.HTTP_204_NO_CONTENT)
        ser = CondoProjectQuoteSerializer(quote, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        if quote.is_winner:
            project.budget_amount = quote.amount
            project.save(update_fields=['budget_amount', 'updated_at'])
            maybe_resync_budget(project)
        _audit(
            request, 'update', f'Cotización {quote.supplier_name} actualizada',
            tenant_id, 'CondoProjectQuote', quote.id, quote.supplier_name,
        )
        return Response(CondoProjectQuoteSerializer(quote, context={'request': request}).data)

    @action(detail=True, methods=['post'], url_path='quotes/(?P<quote_id>[^/.]+)/select-winner')
    def select_winner(self, request, tenant_id, pk=None, quote_id=None):
        project = self.get_object()
        quote = project.quotes.filter(id=quote_id).first()
        if not quote:
            return Response({'detail': 'Cotización no encontrada.'}, status=404)
        if project.quotes.count() < 2:
            return Response(
                {'detail': 'El concurso necesita al menos 2 cotizaciones para adjudicar.'},
                status=400,
            )
        project.quotes.update(is_winner=False)
        quote.is_winner = True
        quote.save(update_fields=['is_winner', 'updated_at'])
        project.winner_quote = quote
        project.contest_status = 'adjudicado'
        if _d(quote.amount) > 0:
            project.budget_amount = quote.amount
        project.save(update_fields=[
            'winner_quote', 'contest_status', 'budget_amount', 'updated_at',
        ])
        maybe_resync_budget(project)
        _audit(
            request, 'update',
            f'{quote.supplier_name} adjudicado en {project.name}',
            tenant_id, 'CondoProjectQuote', quote.id, quote.supplier_name,
        )
        return Response(self._full_project(project, request))

    @action(detail=True, methods=['get', 'post'], url_path='files')
    def files(self, request, tenant_id, pk=None):
        project = self.get_object()
        if request.method == 'GET':
            return Response(
                CondoProjectFileSerializer(
                    project.files.all(), many=True, context={'request': request},
                ).data
            )
        uploaded = request.FILES.get('file') or request.FILES.get('archivo')
        original = validate_project_upload(uploaded)
        kind = (request.data.get('kind') or 'documento').strip()
        if kind not in dict(CondoProjectFile.KIND_CHOICES):
            kind = 'documento'
        quote = None
        qid = request.data.get('quote_id') or None
        if qid:
            quote = project.quotes.filter(id=qid).first()
            if not quote:
                return Response({'detail': 'La cotización no existe en este proyecto.'}, status=400)
            if kind == 'documento':
                kind = 'cotizacion'
        obj = CondoProjectFile.objects.create(
            project=project,
            quote=quote,
            kind=kind,
            original_name=original,
            notes=(request.data.get('notes') or '')[:400],
            file=uploaded,
            uploaded_by=request_user(request),
        )
        _audit(
            request, 'create', f'Archivo {original} en {project.name}',
            tenant_id, 'CondoProjectFile', obj.id, original,
        )
        return Response(
            CondoProjectFileSerializer(obj, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=['delete'], url_path='files/(?P<file_id>[^/.]+)')
    def destroy_file(self, request, tenant_id, pk=None, file_id=None):
        project = self.get_object()
        obj = project.files.filter(id=file_id).first()
        if not obj:
            return Response({'detail': 'Archivo no encontrado.'}, status=404)
        name = obj.original_name
        if obj.file:
            obj.file.delete(save=False)
        obj.delete()
        _audit(
            request, 'delete', f'Archivo {name} eliminado de {project.name}',
            tenant_id, 'CondoProjectFile', file_id, name,
        )
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['post'], url_path='include-in-budget')
    def include_in_budget(self, request, tenant_id, pk=None):
        project = self.get_object()
        ids = parse_budget_ids(request.data) or []
        if not ids:
            return Response({'detail': 'Indica el presupuesto (budget_id o budget_ids).'}, status=400)
        included = []
        for bid in ids:
            budget = CondoBudget.objects.filter(tenant_id=tenant_id, id=bid).first()
            if not budget:
                return Response({'detail': 'Presupuesto no encontrado.'}, status=404)
            include_project_in_budget(project, budget)
            included.append(budget)
        years = ', '.join(str(b.year) for b in included)
        _audit(
            request, 'update',
            f'Proyecto {project.name} incluido en presupuesto {years}',
            tenant_id, 'CondoProject', project.id, project.name,
        )
        return Response(self._full_project(project, request))

    @action(detail=True, methods=['post'], url_path='unlink-budget')
    def unlink_budget(self, request, tenant_id, pk=None):
        project = self.get_object()
        bid = request.data.get('budget_id') if isinstance(request.data, dict) else None
        if bid:
            budget = CondoBudget.objects.filter(tenant_id=tenant_id, id=bid).first()
            if not budget:
                return Response({'detail': 'Presupuesto no encontrado.'}, status=404)
            unlink_project_from_budget(project, budget)
            label = budget.name or str(budget.year)
        else:
            if not project.budgets.exists():
                return Response(self._full_project(project, request))
            unlink_project_from_budget(project)
            label = 'todos los presupuestos'
        _audit(
            request, 'update', f'Proyecto {project.name} retirado de {label}',
            tenant_id, 'CondoProject', project.id, project.name,
        )
        return Response(self._full_project(project, request))

    def _full_project(self, project, request):
        fresh = self.get_queryset().filter(pk=project.pk).first() or project
        return CondoProjectSerializer(fresh, context={'request': request}).data
