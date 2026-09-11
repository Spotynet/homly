"""Planeación del condominio: presupuesto anual y proyectos."""
from __future__ import annotations

from collections import defaultdict
from datetime import date
from decimal import Decimal

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import (
    CajaChicaEntry, CondoBudget, CondoBudgetLine, CondoProject, CondoProjectCost,
    ExtraField, FieldPayment, GastoEntry, Tenant, Unit,
)
from .permissions import IsAdminOrTesOrAuditor

MONTH_KEYS = [f'{m:02d}' for m in range(1, 13)]


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


def seed_budget_lines(budget, tenant):
    ctx = tenant_planning_context(tenant)
    billable = ctx['units_billable']
    lines = []
    order = 0
    maint_month = _d(tenant.maintenance_fee) * billable
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
        month = _d(f.default_amount) * billable
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

    class Meta:
        model = CondoBudget
        fields = (
            'id', 'year', 'name', 'notes', 'status',
            'created_by_name', 'approved_by_name', 'approved_at',
            'created_at', 'updated_at', 'lines', 'totals',
        )
        read_only_fields = ('id', 'status', 'approved_at', 'created_at', 'updated_at')

    def get_created_by_name(self, obj):
        u = obj.created_by
        return (getattr(u, 'name', None) or getattr(u, 'email', '') or '') if u else ''

    def get_approved_by_name(self, obj):
        u = obj.approved_by
        return (getattr(u, 'name', None) or getattr(u, 'email', '') or '') if u else ''

    class Meta:
        model = CondoBudget
        fields = (
            'id', 'year', 'name', 'notes', 'status',
            'created_by_name', 'approved_by_name', 'approved_at',
            'created_at', 'updated_at', 'lines', 'totals',
        )
        read_only_fields = ('id', 'status', 'approved_at', 'created_at', 'updated_at')

    def get_totals(self, obj):
        income = expense = 0.0
        act_in = act_ex = 0.0
        actuals = self.context.get('actuals')
        year = obj.year
        for line in obj.lines.all():
            annual = line_annual(line.monthly_amounts)
            if line.kind == 'ingreso':
                income += annual
            else:
                expense += annual
            if actuals:
                real = sum(attach_actuals(line, actuals, year).values())
                if line.kind == 'ingreso':
                    act_in += real
                else:
                    act_ex += real
        return {
            'income': round(income, 2),
            'expense': round(expense, 2),
            'surplus': round(income - expense, 2),
            'actual_income': round(act_in, 2) if actuals else None,
            'actual_expense': round(act_ex, 2) if actuals else None,
        }


class CondoBudgetListSerializer(serializers.ModelSerializer):
    totals = serializers.SerializerMethodField()

    class Meta:
        model = CondoBudget
        fields = ('id', 'year', 'name', 'status', 'notes', 'updated_at', 'totals')

    def get_totals(self, obj):
        income = expense = 0.0
        for line in obj.lines.all():
            annual = line_annual(line.monthly_amounts)
            if line.kind == 'ingreso':
                income += annual
            else:
                expense += annual
        return {
            'income': round(income, 2),
            'expense': round(expense, 2),
            'surplus': round(income - expense, 2),
        }


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
            'created_by_name', 'created_at', 'updated_at',
            'spent', 'progress_pct', 'costs',
        )
        read_only_fields = ('id', 'created_at', 'updated_at')

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
            'created_at', 'spent', 'progress_pct',
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
        budgets = CondoBudget.objects.filter(tenant=tenant).values('id', 'year', 'status')
        ctx['existing_years'] = list(budgets)
        return Response(ctx)


class CondoBudgetViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAdminOrTesOrAuditor]
    pagination_class = None

    def get_queryset(self):
        return CondoBudget.objects.filter(
            tenant_id=self.kwargs['tenant_id']
        ).prefetch_related('lines__extra_field')

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
        ctx = self.get_serializer_context()
        if include:
            tenant = Tenant.objects.get(id=self.kwargs['tenant_id'])
            ctx['actuals'] = actuals_for_year(tenant, instance.year)
            ctx['year'] = instance.year
        ser = CondoBudgetSerializer(instance, context=ctx)
        return Response(ser.data)

    def perform_create(self, serializer):
        tenant = Tenant.objects.get(id=self.kwargs['tenant_id'])
        _require_condominio(tenant)
        year = serializer.validated_data.get('year')
        if CondoBudget.objects.filter(tenant=tenant, year=year).exists():
            raise ValidationError({'detail': f'Ya existe un presupuesto para {year}.'})
        name = serializer.validated_data.get('name') or f'Presupuesto {year}'
        user = request_user(self.request)
        budget = serializer.save(tenant=tenant, name=name, created_by=user)
        _audit(
            self.request, 'create', f'Presupuesto {budget.year} creado',
            tenant.id, 'CondoBudget', budget.id, budget.name,
        )

    def perform_update(self, serializer):
        if serializer.instance.status == 'archivado':
            raise ValidationError({'detail': 'Un presupuesto archivado no se puede editar.'})
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

    @action(detail=False, methods=['post'], url_path='seed')
    def seed(self, request, tenant_id):
        tenant = Tenant.objects.get(id=tenant_id)
        _require_condominio(tenant)
        try:
            year = int(request.data.get('year') or date.today().year)
        except (TypeError, ValueError):
            return Response({'detail': 'Año inválido.'}, status=400)
        if CondoBudget.objects.filter(tenant=tenant, year=year).exists():
            return Response({'detail': f'Ya existe un presupuesto para {year}.'}, status=400)
        with transaction.atomic():
            budget = CondoBudget.objects.create(
                tenant=tenant, year=year,
                name=request.data.get('name') or f'Presupuesto {year}',
                notes=request.data.get('notes') or '',
                created_by=request_user(request),
            )
            count = seed_budget_lines(budget, tenant)
        _audit(
            request, 'create', f'Presupuesto {year} generado con datos del condominio ({count} partidas)',
            tenant.id, 'CondoBudget', budget.id, budget.name,
        )
        ctx = {'actuals': actuals_for_year(tenant, year), 'year': year, 'request': request}
        return Response(CondoBudgetSerializer(budget, context=ctx).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['put', 'patch'], url_path='lines')
    def replace_lines(self, request, tenant_id, pk=None):
        budget = self.get_object()
        if budget.status == 'archivado':
            return Response({'detail': 'No se puede editar un presupuesto archivado.'}, status=400)
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
        ctx = {
            'actuals': actuals_for_year(budget.tenant, budget.year),
            'year': budget.year,
            'request': request,
        }
        return Response(CondoBudgetSerializer(budget, context=ctx).data)

    @action(detail=True, methods=['post'])
    def approve(self, request, tenant_id, pk=None):
        budget = self.get_object()
        if budget.status == 'aprobado':
            return Response({'detail': 'Este presupuesto ya está aprobado.'}, status=400)
        budget.status = 'aprobado'
        budget.approved_at = timezone.now()
        budget.approved_by = request_user(request)
        budget.save(update_fields=['status', 'approved_at', 'approved_by', 'updated_at'])
        _audit(
            request, 'update', f'Presupuesto {budget.year} aprobado',
            tenant_id, 'CondoBudget', budget.id, budget.name,
        )
        return Response(CondoBudgetSerializer(budget, context=self.get_serializer_context()).data)

    @action(detail=True, methods=['post'])
    def archive(self, request, tenant_id, pk=None):
        budget = self.get_object()
        budget.status = 'archivado'
        budget.save(update_fields=['status', 'updated_at'])
        _audit(
            request, 'update', f'Presupuesto {budget.year} archivado',
            tenant_id, 'CondoBudget', budget.id, budget.name,
        )
        return Response(CondoBudgetSerializer(budget).data)


def request_user(request):
    user = getattr(request, 'user', None)
    if user and getattr(user, 'is_authenticated', False):
        return user
    return None


class CondoProjectViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAdminOrTesOrAuditor]
    pagination_class = None

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
        project = serializer.save(
            tenant=tenant, extra_field=extra, created_by=request_user(self.request),
        )
        _audit(
            self.request, 'create', f'Proyecto creado: {project.name}',
            tenant.id, 'CondoProject', project.id, project.name,
        )

    def perform_update(self, serializer):
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
