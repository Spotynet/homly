"""Planeación del condominio: presupuesto anual y proyectos."""
from __future__ import annotations

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
    ExtraField, FieldPayment, GastoEntry, Notification, Tenant, TenantUser, Unit, User,
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
    return {
        'currency': tenant.currency,
        'name': tenant.name,
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

    class Meta:
        model = CondoBudgetLine
        fields = (
            'id', 'kind', 'concept_key', 'name', 'extra_field_id', 'extra_field_label',
            'monthly_amounts', 'sort_order', 'annual_amount',
            'actual_monthly', 'actual_annual',
        )
        read_only_fields = ('id',)

    def get_annual_amount(self, obj):
        return line_annual(obj.monthly_amounts)

    def get_extra_field_label(self, obj):
        return obj.extra_field.label if obj.extra_field_id else ''

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
    seed_fee = serializers.DecimalField(max_digits=14, decimal_places=2, required=False)
    cashflow_rules = serializers.JSONField(required=False)

    class Meta:
        model = CondoBudget
        fields = (
            'id', 'year', 'name', 'notes', 'status',
            'seed_units', 'seed_fee', 'cashflow_rules', 'approval_steps',
            'created_by_name', 'approved_by_name', 'approved_at',
            'created_at', 'updated_at', 'lines', 'totals',
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


class CondoProjectSerializer(serializers.ModelSerializer):
    extra_field_id = serializers.UUIDField(required=False, allow_null=True)
    extra_field_label = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()
    spent = serializers.SerializerMethodField()
    costs = CondoProjectCostSerializer(many=True, read_only=True)
    progress_pct = serializers.SerializerMethodField()

    class Meta:
        model = CondoProject
        fields = (
            'id', 'name', 'description', 'status', 'priority',
            'extra_field_id', 'extra_field_label', 'budget_amount',
            'start_period', 'end_period', 'responsible_name', 'notes',
            'approval_steps', 'created_by_name', 'created_at', 'updated_at',
            'spent', 'progress_pct', 'costs',
        )
        read_only_fields = ('id', 'approval_steps', 'created_at', 'updated_at')

    def get_spent(self, obj):
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


class CondoProjectListSerializer(CondoProjectSerializer):
    class Meta(CondoProjectSerializer.Meta):
        fields = (
            'id', 'name', 'description', 'status', 'priority',
            'extra_field_id', 'extra_field_label', 'budget_amount',
            'start_period', 'end_period', 'responsible_name',
            'approval_steps', 'created_at', 'spent', 'progress_pct',
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
        ).prefetch_related('lines__extra_field')
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
        with transaction.atomic():
            budget.lines.all().delete()
            objs = []
            for i, item in enumerate(ser.validated_data):
                fid = item.pop('extra_field_id', None)
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
        budget.refresh_from_db()
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
        if budget.status not in ('borrador',):
            return Response({'detail': 'Solo un borrador se puede enviar a aprobación.'}, status=400)
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
        budget.status = 'borrador'
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
        ).select_related('extra_field', 'created_by').prefetch_related('costs__extra_field')
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
        _audit(
            self.request, 'update', f'Proyecto actualizado: {instance.name}',
            instance.tenant_id, 'CondoProject', instance.id, instance.name,
        )

    def perform_destroy(self, instance):
        desc = instance.name
        oid = instance.id
        tid = instance.tenant_id
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
