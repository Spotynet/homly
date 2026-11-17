"""CAPEX y OPEX de Administrar Propiedades.

Proyectos de inversión (CAPEX) con presupuesto, hitos y gasto; gastos operativos (OPEX);
presupuesto anual por categoría; y un resumen que integra cobranza, órdenes de trabajo,
activos y propiedades en una sola vista financiera.
"""
from __future__ import annotations

import uuid
from collections import defaultdict
from datetime import date, datetime
from decimal import Decimal

from django.db.models import Q, Sum
from django.utils import timezone
from rest_framework import permissions, serializers, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import (
    RentalAsset, RentalBudgetLine, RentalCapexProject, RentalExpenseEntry, RentalMaintenanceWork,
    RentalPayment, RentalProperty, Tenant,
)
from .rental_access import RentalAccess, WRITE, has_level
from .rental_mantenimiento import _RentasMixin
from .rental_ops import _next_seq
from . import rental_spaces
from .rental_views import _require_rentas

MONTHS_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
OPEX_LABELS = dict(RentalExpenseEntry.OPEX_CATEGORIES)
CAPEX_LABELS = dict(RentalCapexProject.CATEGORY_CHOICES)
ACTIVE_PROJECT = ('aprobado', 'en_ejecucion', 'en_pausa')
CLOSED_PROJECT = ('completado', 'cancelado')
ZERO = Decimal('0')


def _f(v):
    return float(v or 0)


def _audit(request, action_name, description, tenant_id, object_type, object_id, object_repr):
    from .views import _audit_log
    _audit_log(
        request, 'rentas_mantenimiento', action_name, description,
        tenant_id=tenant_id, object_type=object_type,
        object_id=str(object_id) if object_id else '', object_repr=object_repr or '',
    )


def can_write_finance(user, tenant_id):
    return has_level(user, tenant_id, 'rentas_capex', WRITE)


class _FinMixin(_RentasMixin):
    """CAPEX/OPEX: lectura según el perfil; escritura para administración, tesorería y contabilidad."""
    permission_classes = [RentalAccess('rentas_capex')]

    def check_permissions(self, request):
        super().check_permissions(request)
        if request.method not in permissions.SAFE_METHODS and not can_write_finance(request.user, self.kwargs['tenant_id']):
            self.permission_denied(request, message='No tienes permiso para modificar este módulo.')

    def _same_tenant(self, tenant, obj, field):
        if obj is not None and getattr(obj, 'tenant_id', tenant.id) != tenant.id:
            raise ValidationError({field: 'El registro no pertenece a este espacio.'})


def next_project_code(tenant):
    qs = RentalCapexProject.objects.filter(tenant=tenant)
    seq = _next_seq(qs, 'code', 'PRY-')
    code = f'PRY-{seq:04d}'
    while qs.filter(code=code).exists():
        seq += 1
        code = f'PRY-{seq:04d}'
    return code


# ─── Cálculo de gasto y salud de proyectos ───────────────────────────────────

def _work_date(w):
    if w.status == 'realizado':
        if w.completed_at:
            return timezone.localtime(w.completed_at).date()
        return w.performed_date or w.scheduled_date or timezone.localtime(w.created_at).date()
    return w.scheduled_date or timezone.localtime(w.created_at).date()


def project_money(tenant, project_ids=None):
    """{project_id: {'spent': Decimal, 'committed': Decimal}} (de por vida)."""
    out = defaultdict(lambda: {'spent': ZERO, 'committed': ZERO})
    ent = RentalExpenseEntry.objects.filter(tenant=tenant, kind='capex', project__isnull=False)
    if project_ids is not None:
        ent = ent.filter(project_id__in=project_ids)
    for row in ent.values('project_id', 'status').annotate(t=Sum('amount')):
        key = 'spent' if row['status'] == 'pagado' else 'committed'
        out[row['project_id']][key] += row['t'] or ZERO
    works = RentalMaintenanceWork.objects.filter(tenant=tenant, capex_project__isnull=False).exclude(status='cancelado')
    if project_ids is not None:
        works = works.filter(capex_project_id__in=project_ids)
    for w in works.only('capex_project_id', 'status', 'cost', 'estimated_cost'):
        if w.status == 'realizado':
            out[w.capex_project_id]['spent'] += w.cost or ZERO
        else:
            out[w.capex_project_id]['committed'] += w.estimated_cost or w.cost or ZERO
    return out


def project_progress(p):
    if p.status == 'completado':
        return 100
    ms = p.milestones or []
    if ms:
        total = sum(max(1, int(m.get('weight') or 1)) for m in ms)
        done = sum(max(1, int(m.get('weight') or 1)) for m in ms if m.get('done'))
        return round(done / total * 100) if total else 0
    if p.progress_manual is not None:
        return int(p.progress_manual)
    return 0


def _parse_date(v):
    if not v:
        return None
    if isinstance(v, date):
        return v
    try:
        return datetime.strptime(str(v)[:10], '%Y-%m-%d').date()
    except ValueError:
        return None


def project_health(p, spent, committed, progress):
    """(cost_health, schedule_health, health) con valores ok | riesgo | critico."""
    rank = {'ok': 0, 'riesgo': 1, 'critico': 2}
    cost = 'ok'
    budget = p.budget_amount or ZERO
    exposure = spent + committed
    if p.status not in CLOSED_PROJECT and budget > 0:
        if exposure > budget:
            cost = 'critico'
        elif exposure >= budget * Decimal('0.9'):
            cost = 'riesgo'
    elif p.status == 'completado' and budget > 0 and spent > budget:
        cost = 'critico'
    sched = 'ok'
    today = date.today()
    if p.status not in CLOSED_PROJECT and p.status != 'propuesta':
        if p.end_date and today > p.end_date:
            sched = 'critico'
        elif p.start_date and p.end_date and p.end_date > p.start_date:
            planned = (today - p.start_date).days / (p.end_date - p.start_date).days * 100
            planned = max(0, min(100, planned))
            if planned - progress > 25:
                sched = 'riesgo'
    health = cost if rank[cost] >= rank[sched] else sched
    return cost, sched, health


# ─── Serializers ─────────────────────────────────────────────────────────────

def _clean_milestones(value):
    out = []
    for m in (value or [])[:40]:
        if not isinstance(m, dict):
            continue
        title = str(m.get('title') or '').strip()[:160]
        if not title:
            continue
        due = _parse_date(m.get('due'))
        try:
            weight = max(1, min(100, int(m.get('weight') or 1)))
        except (TypeError, ValueError):
            weight = 1
        out.append({
            'id': str(m.get('id') or uuid.uuid4().hex[:8])[:16],
            'title': title,
            'due': due.isoformat() if due else '',
            'weight': weight,
            'done': bool(m.get('done')),
        })
    return out


class CapexProjectSerializer(serializers.ModelSerializer):
    property_code = serializers.CharField(source='property.code', read_only=True, default='')
    property_name = serializers.CharField(source='property.name', read_only=True, default='')
    asset_code = serializers.CharField(source='asset.code', read_only=True, default='')
    asset_name = serializers.CharField(source='asset.name', read_only=True, default='')
    space_code = serializers.CharField(source='space.code', read_only=True, default='')
    space_name = serializers.CharField(source='space.label', read_only=True, default='')
    category_label = serializers.CharField(source='get_category_display', read_only=True)
    status_label = serializers.CharField(source='get_status_display', read_only=True)
    priority_label = serializers.CharField(source='get_priority_display', read_only=True)
    spent = serializers.SerializerMethodField()
    committed = serializers.SerializerMethodField()
    remaining = serializers.SerializerMethodField()
    budget_used_pct = serializers.SerializerMethodField()
    progress = serializers.SerializerMethodField()
    cost_health = serializers.SerializerMethodField()
    schedule_health = serializers.SerializerMethodField()
    health = serializers.SerializerMethodField()
    roi_pct = serializers.SerializerMethodField()
    payback_years = serializers.SerializerMethodField()
    milestones_done = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = RentalCapexProject
        fields = (
            'id', 'code', 'name', 'description', 'category', 'category_label', 'status', 'status_label',
            'priority', 'priority_label', 'property', 'property_code', 'property_name',
            'space', 'space_code', 'space_name',
            'asset', 'asset_code', 'asset_name', 'owner_name', 'approved_by', 'approved_date', 'budget_amount',
            'start_date', 'end_date', 'actual_start', 'actual_end', 'justification',
            'expected_annual_benefit', 'milestones', 'progress_manual',
            'spent', 'committed', 'remaining', 'budget_used_pct', 'progress',
            'cost_health', 'schedule_health', 'health', 'roi_pct', 'payback_years',
            'milestones_done', 'created_by_name', 'created_at', 'updated_at',
        )
        read_only_fields = ('id', 'code', 'created_at', 'updated_at')

    # El mapa de gasto se precarga en la vista para evitar consultas por proyecto.
    def _money(self, obj):
        cache = self.context.get('money')
        if cache is None:
            cache = project_money(obj.tenant, [obj.id])
            self.context['money'] = cache
        return cache.get(obj.id, {'spent': ZERO, 'committed': ZERO})

    def get_spent(self, obj):
        return _f(self._money(obj)['spent'])

    def get_committed(self, obj):
        return _f(self._money(obj)['committed'])

    def get_remaining(self, obj):
        m = self._money(obj)
        return _f((obj.budget_amount or ZERO) - m['spent'] - m['committed'])

    def get_budget_used_pct(self, obj):
        b = obj.budget_amount or ZERO
        return round(float(self._money(obj)['spent'] / b * 100), 1) if b > 0 else None

    def get_progress(self, obj):
        return project_progress(obj)

    def _health(self, obj):
        m = self._money(obj)
        return project_health(obj, m['spent'], m['committed'], project_progress(obj))

    def get_cost_health(self, obj):
        return self._health(obj)[0]

    def get_schedule_health(self, obj):
        return self._health(obj)[1]

    def get_health(self, obj):
        return self._health(obj)[2]

    def _invest(self, obj):
        m = self._money(obj)
        return m['spent'] if m['spent'] > 0 else (obj.budget_amount or ZERO)

    def get_roi_pct(self, obj):
        ben, inv = obj.expected_annual_benefit, self._invest(obj)
        if ben is None or not inv or inv <= 0:
            return None
        return round(float(ben / inv * 100), 1)

    def get_payback_years(self, obj):
        ben, inv = obj.expected_annual_benefit, self._invest(obj)
        if not ben or ben <= 0 or not inv or inv <= 0:
            return None
        return round(float(inv / ben), 1)

    def get_milestones_done(self, obj):
        ms = obj.milestones or []
        return [sum(1 for m in ms if m.get('done')), len(ms)]

    def get_created_by_name(self, obj):
        u = obj.created_by
        return (getattr(u, 'name', None) or getattr(u, 'email', '') or '') if u else ''

    def validate_milestones(self, value):
        return _clean_milestones(value)

    def validate_progress_manual(self, value):
        if value is not None and not 0 <= value <= 100:
            raise serializers.ValidationError('El avance va de 0 a 100.')
        return value

    def validate(self, attrs):
        start, end = attrs.get('start_date'), attrs.get('end_date')
        if self.instance:
            start = start if 'start_date' in attrs else self.instance.start_date
            end = end if 'end_date' in attrs else self.instance.end_date
        if start and end and end < start:
            raise serializers.ValidationError({'end_date': 'La fecha final no puede ser anterior a la inicial.'})
        return attrs


class ExpenseSerializer(serializers.ModelSerializer):
    property_code = serializers.CharField(source='property.code', read_only=True, default='')
    property_name = serializers.CharField(source='property.name', read_only=True, default='')
    project_code = serializers.CharField(source='project.code', read_only=True, default='')
    project_name = serializers.CharField(source='project.name', read_only=True, default='')
    space_code = serializers.CharField(source='space.code', read_only=True, default='')
    space_name = serializers.CharField(source='space.label', read_only=True, default='')
    provider_name = serializers.SerializerMethodField()
    category_label = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = RentalExpenseEntry
        fields = (
            'id', 'kind', 'status', 'date', 'amount', 'category', 'category_label', 'concept',
            'property', 'property_code', 'property_name', 'space', 'space_code', 'space_name',
            'project', 'project_code', 'project_name',
            'provider', 'provider_name', 'vendor_name', 'invoice_ref', 'approved_by', 'notes',
            'created_by_name', 'created_at', 'updated_at',
        )
        read_only_fields = ('id', 'created_at', 'updated_at')
        extra_kwargs = {'category': {'required': False, 'allow_blank': True}}

    def get_provider_name(self, obj):
        if obj.provider_id:
            return obj.provider.trade_name or obj.provider.name
        return obj.vendor_name or ''

    def get_category_label(self, obj):
        if obj.kind == 'capex':
            return CAPEX_LABELS.get(obj.category, 'CAPEX')
        return OPEX_LABELS.get(obj.category, obj.category)

    def get_created_by_name(self, obj):
        u = obj.created_by
        return (getattr(u, 'name', None) or getattr(u, 'email', '') or '') if u else ''

    def validate_amount(self, v):
        if v is None or v <= 0:
            raise serializers.ValidationError('El monto debe ser mayor a cero.')
        return v


class BudgetLineSerializer(serializers.ModelSerializer):
    property_code = serializers.CharField(source='property.code', read_only=True, default='')
    property_name = serializers.CharField(source='property.name', read_only=True, default='')
    space_code = serializers.CharField(source='space.code', read_only=True, default='')
    space_name = serializers.CharField(source='space.label', read_only=True, default='')
    category_label = serializers.SerializerMethodField()
    total = serializers.SerializerMethodField()

    class Meta:
        model = RentalBudgetLine
        fields = (
            'id', 'year', 'kind', 'category', 'category_label', 'property', 'property_code', 'property_name',
            'space', 'space_code', 'space_name', 'months', 'total', 'notes', 'created_at', 'updated_at',
        )
        read_only_fields = ('id', 'created_at', 'updated_at')

    def get_category_label(self, obj):
        if obj.kind == 'capex':
            return 'CAPEX total' if obj.category == 'total' else CAPEX_LABELS.get(obj.category, obj.category)
        return OPEX_LABELS.get(obj.category, obj.category)

    def get_total(self, obj):
        return round(sum(float(x or 0) for x in (obj.months or [])), 2)

    def validate_months(self, value):
        if not isinstance(value, list) or len(value) != 12:
            raise serializers.ValidationError('Captura los 12 meses.')
        out = []
        for x in value:
            try:
                n = round(float(x or 0), 2)
            except (TypeError, ValueError):
                raise serializers.ValidationError('Los montos deben ser numéricos.')
            if n < 0:
                raise serializers.ValidationError('Los montos no pueden ser negativos.')
            out.append(n)
        return out

    def validate_year(self, v):
        if not 2000 <= v <= 2100:
            raise serializers.ValidationError('Año inválido.')
        return v

    def validate(self, attrs):
        kind = attrs.get('kind') or (self.instance.kind if self.instance else 'opex')
        cat = attrs.get('category') or (self.instance.category if self.instance else 'otros')
        if kind == 'opex' and cat not in OPEX_LABELS:
            raise serializers.ValidationError({'category': 'Categoría OPEX inválida.'})
        if kind == 'capex' and cat != 'total' and cat not in CAPEX_LABELS:
            raise serializers.ValidationError({'category': 'Categoría CAPEX inválida.'})
        return attrs


# ─── ViewSets ────────────────────────────────────────────────────────────────

class CapexProjectViewSet(_FinMixin, viewsets.ModelViewSet):
    serializer_class = CapexProjectSerializer
    queryset = RentalCapexProject.objects.all()
    pagination_class = None
    http_method_names = ['get', 'post', 'patch', 'delete', 'head', 'options']

    def get_queryset(self):
        qs = RentalCapexProject.objects.filter(tenant=self.get_tenant()).select_related('property', 'space', 'created_by')
        p = self.request.query_params
        for key in ('status', 'category', 'priority'):
            if p.get(key):
                qs = qs.filter(**{key: p[key]})
        if p.get('property'):
            qs = qs.filter(property_id=p['property'])
        if p.get('space'):
            qs = qs.filter(space_id=p['space'])
        if p.get('q'):
            q = p['q'].strip()
            qs = qs.filter(Q(name__icontains=q) | Q(code__icontains=q) | Q(owner_name__icontains=q))
        return qs

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        if self.action == 'list':
            ctx['money'] = project_money(self.get_tenant())
        return ctx

    def _check(self, tenant, vd, inst=None):
        prop = vd.get('property')
        if prop is not None and prop.tenant_id != tenant.id:
            raise ValidationError({'property': 'Selecciona una propiedad de este espacio.'})
        self._same_tenant(tenant, vd.get('asset'), 'asset')
        # Con espacio: debe ser de la propiedad; sin propiedad, se toma la del espacio.
        extra = {}
        space = vd['space'] if 'space' in vd else (inst.space if inst else None)
        cur_prop = vd['property'] if 'property' in vd else (inst.property if inst else None)
        if space is not None:
            resolved = rental_spaces.resolve_property_space(tenant, cur_prop, space)
            if cur_prop is None:
                extra['property'] = resolved
        return extra

    def perform_create(self, serializer):
        tenant = self.get_tenant()
        vd = serializer.validated_data
        extra = self._check(tenant, vd)
        if vd.get('status') == 'en_ejecucion' and not vd.get('actual_start'):
            extra['actual_start'] = date.today()
        if vd.get('status') in ('aprobado', 'en_ejecucion') and not vd.get('approved_date'):
            extra['approved_date'] = date.today()
        user = self.request.user if getattr(self.request.user, 'is_authenticated', False) else None
        obj = serializer.save(tenant=tenant, code=next_project_code(tenant), created_by=user, **extra)
        _audit(self.request, 'create', f'Proyecto CAPEX {obj.code}: {obj.name}', tenant.id, 'RentalCapexProject', obj.id, obj.name)

    def perform_update(self, serializer):
        inst = serializer.instance
        vd = serializer.validated_data
        extra = self._check(inst.tenant, vd, inst)
        new = vd.get('status')
        if new and new != inst.status:
            if new == 'en_ejecucion' and not (vd.get('actual_start') or inst.actual_start):
                extra['actual_start'] = date.today()
            if new in ('aprobado', 'en_ejecucion') and not (vd.get('approved_date') or inst.approved_date):
                extra['approved_date'] = date.today()
            if new == 'completado' and not (vd.get('actual_end') or inst.actual_end):
                extra['actual_end'] = date.today()
            if inst.status == 'completado' and new != 'completado':
                extra['actual_end'] = None
        obj = serializer.save(**extra)
        _audit(self.request, 'update', f'Proyecto CAPEX actualizado {obj.code}', obj.tenant_id, 'RentalCapexProject', obj.id, obj.name)

    def perform_destroy(self, instance):
        if instance.entries.exists() or instance.works.exists():
            raise ValidationError({'detail': 'El proyecto ya tiene gastos u órdenes. Cancélalo en lugar de eliminarlo.'})
        label = f'{instance.code} {instance.name}'
        pid = instance.id
        instance.delete()
        _audit(self.request, 'delete', f'Proyecto CAPEX eliminado {label}', self.kwargs['tenant_id'], 'RentalCapexProject', pid, label)

    @action(detail=True, methods=['get'], url_path='detail')
    def detail_view(self, request, tenant_id=None, pk=None):
        proj = self.get_object()
        data = CapexProjectSerializer(proj, context={'request': request}).data
        entries = RentalExpenseEntry.objects.filter(project=proj).select_related('property', 'provider', 'created_by')
        works = (
            RentalMaintenanceWork.objects.filter(capex_project=proj)
            .exclude(status='cancelado').select_related('property', 'provider')
        )
        assets = RentalAsset.objects.filter(capex_project=proj).select_related('property')
        return Response({
            'project': data,
            'entries': ExpenseSerializer(entries, many=True).data,
            'works': [{
                'id': str(w.id), 'folio': w.folio, 'title': w.title, 'status': w.status,
                'status_label': w.get_status_display(), 'kind': w.kind,
                'property_code': w.property.code, 'property_name': w.property.name,
                'cost': _f(w.cost), 'estimated_cost': _f(w.estimated_cost),
                'date': _work_date(w).isoformat(),
                'provider': (w.provider.trade_name or w.provider.name) if w.provider_id else w.vendor_name,
            } for w in works],
            'assets': [{
                'id': str(a.id), 'code': a.code, 'name': a.name, 'property_code': a.property.code,
                'purchase_cost': _f(a.purchase_cost), 'status': a.status,
            } for a in assets],
        })


class ExpenseViewSet(_FinMixin, viewsets.ModelViewSet):
    serializer_class = ExpenseSerializer
    queryset = RentalExpenseEntry.objects.all()
    pagination_class = None
    http_method_names = ['get', 'post', 'patch', 'delete', 'head', 'options']

    def get_queryset(self):
        qs = (
            RentalExpenseEntry.objects.filter(tenant=self.get_tenant())
            .select_related('property', 'space', 'project', 'provider', 'created_by')
        )
        p = self.request.query_params
        for key in ('kind', 'status', 'category'):
            if p.get(key):
                qs = qs.filter(**{key: p[key]})
        if p.get('project'):
            qs = qs.filter(project_id=p['project'])
        if p.get('property'):
            qs = qs.filter(property_id=p['property'])
        if p.get('space'):
            qs = qs.filter(Q(space_id=p['space']) | Q(project__space_id=p['space']))
        return qs

    def _prepare(self, tenant, serializer, instance=None):
        vd = serializer.validated_data
        kind = vd.get('kind') or (instance.kind if instance else 'opex')
        project = vd.get('project') if 'project' in vd else (instance.project if instance else None)
        for f in ('property', 'provider', 'project'):
            self._same_tenant(tenant, vd.get(f), f)
        extra = {}
        space = vd['space'] if 'space' in vd else (instance.space if instance else None)
        cur_prop = vd['property'] if 'property' in vd else (instance.property if instance else None)
        if space is not None:
            resolved = rental_spaces.resolve_property_space(tenant, cur_prop, space)
            if cur_prop is None:
                extra['property'] = resolved
        if kind == 'capex':
            if not project:
                raise ValidationError({'project': 'Un gasto CAPEX debe pertenecer a un proyecto.'})
            if project.status in ('cancelado',):
                raise ValidationError({'project': 'El proyecto está cancelado.'})
            extra['category'] = project.category
        else:
            extra['project'] = None
            cat = vd.get('category') or (instance.category if instance else '') or 'otros'
            if cat not in OPEX_LABELS:
                raise ValidationError({'category': 'Categoría OPEX inválida.'})
            extra['category'] = cat
        return extra

    def perform_create(self, serializer):
        tenant = self.get_tenant()
        extra = self._prepare(tenant, serializer)
        user = self.request.user if getattr(self.request.user, 'is_authenticated', False) else None
        obj = serializer.save(tenant=tenant, created_by=user, **extra)
        _audit(self.request, 'create', f'Gasto {obj.kind.upper()}: {obj.concept} ({obj.amount})', tenant.id, 'RentalExpenseEntry', obj.id, obj.concept)

    def perform_update(self, serializer):
        extra = self._prepare(serializer.instance.tenant, serializer, serializer.instance)
        obj = serializer.save(**extra)
        _audit(self.request, 'update', f'Gasto actualizado: {obj.concept}', obj.tenant_id, 'RentalExpenseEntry', obj.id, obj.concept)

    def perform_destroy(self, instance):
        label = f'{instance.concept} ({instance.amount})'
        eid = instance.id
        instance.delete()
        _audit(self.request, 'delete', f'Gasto eliminado: {label}', self.kwargs['tenant_id'], 'RentalExpenseEntry', eid, label)


class BudgetLineViewSet(_FinMixin, viewsets.ModelViewSet):
    serializer_class = BudgetLineSerializer
    queryset = RentalBudgetLine.objects.all()
    pagination_class = None
    http_method_names = ['get', 'post', 'patch', 'delete', 'head', 'options']

    def get_queryset(self):
        qs = RentalBudgetLine.objects.filter(tenant=self.get_tenant()).select_related('property', 'space')
        p = self.request.query_params
        if p.get('year'):
            qs = qs.filter(year=p['year'])
        if p.get('kind'):
            qs = qs.filter(kind=p['kind'])
        if p.get('space'):
            qs = qs.filter(space_id=p['space'])
        return qs

    def _check(self, tenant, serializer, instance=None):
        vd = serializer.validated_data
        prop = vd.get('property') if 'property' in vd else (instance.property if instance else None)
        if prop is not None and prop.tenant_id != tenant.id:
            raise ValidationError({'property': 'Selecciona una propiedad de este espacio.'})
        year = vd.get('year') or (instance.year if instance else None)
        kind = vd.get('kind') or (instance.kind if instance else 'opex')
        cat = vd.get('category') or (instance.category if instance else 'otros')
        space = vd.get('space') if 'space' in vd else (instance.space if instance else None)
        rental_spaces.check_space(tenant, prop, space) if space else None
        dup = RentalBudgetLine.objects.filter(tenant=tenant, year=year, kind=kind, category=cat, property=prop, space=space)
        if instance:
            dup = dup.exclude(pk=instance.pk)
        if dup.exists():
            raise ValidationError({'category': 'Ya existe una partida para esa categoría, año, propiedad y espacio.'})

    def perform_create(self, serializer):
        tenant = self.get_tenant()
        self._check(tenant, serializer)
        obj = serializer.save(tenant=tenant)
        _audit(self.request, 'create', f'Presupuesto {obj.year} {obj.kind.upper()} {obj.category}', tenant.id, 'RentalBudgetLine', obj.id, obj.category)

    def perform_update(self, serializer):
        self._check(serializer.instance.tenant, serializer, serializer.instance)
        obj = serializer.save()
        _audit(self.request, 'update', f'Presupuesto actualizado {obj.year} {obj.category}', obj.tenant_id, 'RentalBudgetLine', obj.id, obj.category)

    @action(detail=False, methods=['post'], url_path='copy-year')
    def copy_year(self, request, tenant_id=None):
        """Copia las partidas de un año a otro aplicando un factor (p. ej. 1.05 = +5 %)."""
        tenant = self.get_tenant()
        try:
            src, dst = int(request.data.get('from_year')), int(request.data.get('to_year'))
            factor = float(request.data.get('factor') or 1)
        except (TypeError, ValueError):
            raise ValidationError({'detail': 'Indica año origen, año destino y factor.'})
        if src == dst or not 0 < factor <= 10:
            raise ValidationError({'detail': 'Datos inválidos.'})
        created = 0
        for line in RentalBudgetLine.objects.filter(tenant=tenant, year=src):
            if RentalBudgetLine.objects.filter(
                tenant=tenant, year=dst, kind=line.kind, category=line.category, property=line.property, space=line.space,
            ).exists():
                continue
            RentalBudgetLine.objects.create(
                tenant=tenant, year=dst, kind=line.kind, category=line.category, property=line.property, space=line.space,
                months=[round(float(x or 0) * factor, 2) for x in (line.months or [0] * 12)], notes=line.notes,
            )
            created += 1
        _audit(request, 'create', f'Presupuesto {src} copiado a {dst} ({created} partidas)', tenant.id, 'RentalBudgetLine', '', f'{src}->{dst}')
        return Response({'created': created})


# ─── Libro de gastos (manual + órdenes de trabajo) ───────────────────────────

def ledger_rows(tenant, d_from, d_to):
    """Todos los movimientos OPEX/CAPEX del rango: gastos manuales y costos de órdenes."""
    rows = []
    ent = (
        RentalExpenseEntry.objects.filter(tenant=tenant, date__gte=d_from, date__lte=d_to)
        .select_related('property', 'space', 'project', 'project__property', 'project__space', 'provider')
    )
    for e in ent:
        prop = e.property or (e.project.property if e.project_id else None)
        sp = e.space or (e.project.space if e.project_id else None)
        rows.append({
            'id': str(e.id), 'source': 'manual', 'kind': e.kind, 'status': e.status,
            'date': e.date.isoformat(), 'amount': _f(e.amount), 'category': e.category,
            'category_label': CAPEX_LABELS.get(e.category, 'CAPEX') if e.kind == 'capex' else OPEX_LABELS.get(e.category, e.category),
            'concept': e.concept,
            'property': str(prop.id) if prop else '', 'property_code': prop.code if prop else '',
            'property_name': prop.name if prop else '',
            'space': str(sp.id) if sp else '', 'space_code': sp.code if sp else '', 'space_name': sp.label if sp else '',
            'project': str(e.project_id) if e.project_id else '',
            'project_code': e.project.code if e.project_id else '',
            'vendor': (e.provider.trade_name or e.provider.name) if e.provider_id else e.vendor_name,
            'ref': e.invoice_ref, 'editable': True,
        })
    works = (
        RentalMaintenanceWork.objects.filter(tenant=tenant).exclude(status='cancelado')
        .filter(Q(cost__gt=0) | Q(estimated_cost__gt=0))
        .select_related('property', 'space', 'provider', 'capex_project')
    )
    for w in works:
        done = w.status == 'realizado'
        amount = w.cost if done else (w.estimated_cost or w.cost)
        if not amount or amount <= 0:
            continue
        d = _work_date(w)
        if d < d_from or d > d_to:
            continue
        capex = w.capex_project_id is not None
        cat = w.capex_project.category if capex else ('mant_preventivo' if w.kind == 'preventivo' else 'mant_correctivo')
        rows.append({
            'id': str(w.id), 'source': 'orden', 'kind': 'capex' if capex else 'opex',
            'status': 'pagado' if done else 'comprometido',
            'date': d.isoformat(), 'amount': _f(amount), 'category': cat,
            'category_label': CAPEX_LABELS.get(cat, 'CAPEX') if capex else OPEX_LABELS.get(cat, cat),
            'concept': f'{w.folio} · {w.title}',
            'property': str(w.property_id), 'property_code': w.property.code, 'property_name': w.property.name,
            'space': str(w.space_id) if w.space_id else '', 'space_code': w.space.code if w.space_id else '',
            'space_name': w.space.label if w.space_id else '',
            'project': str(w.capex_project_id) if capex else '',
            'project_code': w.capex_project.code if capex else '',
            'vendor': (w.provider.trade_name or w.provider.name) if w.provider_id else w.vendor_name,
            'ref': w.folio, 'editable': False,
        })
    rows.sort(key=lambda r: (r['date'], r['concept']), reverse=True)
    return rows


class LedgerView(APIView):
    permission_classes = [RentalAccess('rentas_capex')]

    def get(self, request, tenant_id):
        tenant = Tenant.objects.get(id=tenant_id)
        _require_rentas(tenant)
        p = request.query_params
        try:
            year = int(p.get('year') or date.today().year)
        except ValueError:
            year = date.today().year
        month = p.get('month')
        if month and month.isdigit() and 1 <= int(month) <= 12:
            m = int(month)
            from calendar import monthrange
            d_from, d_to = date(year, m, 1), date(year, m, monthrange(year, m)[1])
        else:
            d_from, d_to = date(year, 1, 1), date(year, 12, 31)
        rows = ledger_rows(tenant, d_from, d_to)
        for key in ('kind', 'status', 'category', 'property', 'space', 'project', 'source'):
            if p.get(key):
                rows = [r for r in rows if str(r.get(key)) == p[key]]
        q = (p.get('q') or '').strip().lower()
        if q:
            rows = [r for r in rows if q in f"{r['concept']} {r['vendor']} {r['property_code']} {r['property_name']} {r['space_code']} {r['space_name']} {r['ref']}".lower()]
        totals = {'opex_paid': 0.0, 'opex_committed': 0.0, 'capex_paid': 0.0, 'capex_committed': 0.0}
        for r in rows:
            totals[f"{r['kind']}_{'paid' if r['status'] == 'pagado' else 'committed'}"] += r['amount']
        return Response({
            'year': year, 'count': len(rows), 'totals': {k: round(v, 2) for k, v in totals.items()},
            'rows': rows[:1500], 'truncated': len(rows) > 1500,
        })


# ─── Resumen integrado ───────────────────────────────────────────────────────

def _book_value(a, today):
    if not a.purchase_cost:
        return None
    cost = float(a.purchase_cost)
    if not a.install_date or not a.useful_life_years:
        return cost
    age = (today - a.install_date).days / 365.25
    return round(cost * max(0.0, 1 - age / a.useful_life_years), 2)


def _equipment(tenant, today):
    assets = list(
        RentalAsset.objects.filter(tenant=tenant, is_active=True).exclude(status='baja')
        .select_related('property')
    )
    in_project = set(
        RentalCapexProject.objects.filter(tenant=tenant, asset__isnull=False)
        .exclude(status__in=CLOSED_PROJECT).values_list('asset_id', flat=True)
    )
    total_cost = book = 0.0
    repair = defaultdict(float)
    for w in RentalMaintenanceWork.objects.filter(
        tenant=tenant, asset__isnull=False, status='realizado', capex_project__isnull=True,
    ).only('asset_id', 'cost'):
        repair[w.asset_id] += _f(w.cost)
    cands = []
    for a in assets:
        bv = _book_value(a, today)
        total_cost += _f(a.purchase_cost)
        book += bv or 0
        if a.capex_project_id or a.id in in_project:
            continue
        reason = None
        age = (today - a.install_date).days / 365.25 if a.install_date else None
        left = (a.useful_life_years - age) if (age is not None and a.useful_life_years) else None
        cost = _f(a.purchase_cost)
        if left is not None and left <= 0:
            reason = 'Vida útil agotada'
        elif left is not None and left <= 1:
            reason = 'Vida útil por terminar (< 1 año)'
        elif a.status in ('en_falla', 'fuera_servicio'):
            reason = 'Fuera de operación'
        elif cost > 0 and repair[a.id] >= cost * 0.5:
            reason = 'Reparaciones ≥ 50 % de su costo'
        if reason:
            cands.append({
                'id': str(a.id), 'code': a.code, 'name': a.name, 'property': str(a.property_id),
                'property_code': a.property.code, 'reason': reason, 'criticality': a.criticality,
                'book_value': bv, 'purchase_cost': cost, 'repair_cost': round(repair[a.id], 2),
                'life_left': round(left, 1) if left is not None else None,
            })
    crit = {'critica': 0, 'alta': 1, 'media': 2, 'baja': 3}
    cands.sort(key=lambda c: (crit.get(c['criticality'], 4), -c['repair_cost']))
    return {
        'count': len(assets), 'total_cost': round(total_cost, 2), 'book_value': round(book, 2),
        'candidates': cands[:8], 'candidates_count': len(cands),
    }


def _totals(tenant, year):
    rows = ledger_rows(tenant, date(year, 1, 1), date(year, 12, 31))
    opex = sum(r['amount'] for r in rows if r['kind'] == 'opex' and r['status'] == 'pagado')
    capex = sum(r['amount'] for r in rows if r['kind'] == 'capex' and r['status'] == 'pagado')
    income = RentalPayment.objects.filter(tenant=tenant, payment_date__year=year).aggregate(s=Sum('amount'))['s']
    return {'opex': round(opex, 2), 'capex': round(capex, 2), 'income': round(_f(income), 2)}


def build_summary(tenant, year):
    today = date.today()
    ytd = today.month if year == today.year else (12 if year < today.year else 0)
    rows = ledger_rows(tenant, date(year, 1, 1), date(year, 12, 31))
    props = {p.id: p for p in RentalProperty.objects.filter(tenant=tenant, is_active=True)}

    # Presupuesto
    lines = list(RentalBudgetLine.objects.filter(tenant=tenant, year=year))
    opex_budget_m = [0.0] * 12
    capex_budget_year = 0.0
    cat_budget = defaultdict(lambda: [0.0] * 12)
    for ln in lines:
        months = [float(x or 0) for x in (ln.months or [0] * 12)] + [0.0] * 12
        if ln.kind == 'opex':
            for i in range(12):
                opex_budget_m[i] += months[i]
                cat_budget[ln.category][i] += months[i]
        else:
            capex_budget_year += sum(months[:12])

    # Mensual
    monthly = [{'key': f'{year}-{i + 1:02d}', 'label': MONTHS_ES[i], 'income': 0.0, 'opex': 0.0,
                'capex': 0.0, 'opex_budget': round(opex_budget_m[i], 2)} for i in range(12)]
    pay_by_prop = defaultdict(float)
    pay_by_space = defaultdict(float)
    for pay in RentalPayment.objects.filter(tenant=tenant, payment_date__year=year).select_related('contract'):
        monthly[pay.payment_date.month - 1]['income'] += _f(pay.amount)
        pay_by_prop[pay.contract.property_id] += _f(pay.amount)
        if pay.contract.space_id:
            pay_by_space[pay.contract.space_id] += _f(pay.amount)

    cat = defaultdict(lambda: {'actual': 0.0, 'committed': 0.0})
    by_prop = defaultdict(lambda: {'opex': 0.0, 'capex': 0.0})
    by_space = defaultdict(lambda: {'opex': 0.0, 'capex': 0.0})
    opex_committed = capex_committed = 0.0
    for r in rows:
        m = int(r['date'][5:7]) - 1
        paid = r['status'] == 'pagado'
        if r['kind'] == 'opex':
            if paid:
                monthly[m]['opex'] += r['amount']
                cat[r['category']]['actual'] += r['amount']
                by_prop[r['property'] or '']['opex'] += r['amount']
                if r.get('space'):
                    by_space[r['space']]['opex'] += r['amount']
            else:
                opex_committed += r['amount']
                cat[r['category']]['committed'] += r['amount']
        else:
            if paid:
                monthly[m]['capex'] += r['amount']
                by_prop[r['property'] or '']['capex'] += r['amount']
                if r.get('space'):
                    by_space[r['space']]['capex'] += r['amount']
            else:
                capex_committed += r['amount']
    for m in monthly:
        for k in ('income', 'opex', 'capex'):
            m[k] = round(m[k], 2)

    income = sum(m['income'] for m in monthly)
    opex = sum(m['opex'] for m in monthly)
    capex = sum(m['capex'] for m in monthly)
    opex_budget_year = sum(opex_budget_m)
    opex_budget_ytd = sum(opex_budget_m[:ytd])
    opex_ytd = sum(m['opex'] for m in monthly[:ytd]) if ytd else 0.0

    categories = []
    for key in list(OPEX_LABELS):
        b = cat_budget.get(key, [0.0] * 12)
        a = cat.get(key, {'actual': 0.0, 'committed': 0.0})
        if a['actual'] or a['committed'] or sum(b):
            categories.append({
                'key': key, 'label': OPEX_LABELS[key], 'actual': round(a['actual'], 2),
                'committed': round(a['committed'], 2), 'budget_year': round(sum(b), 2),
                'budget_ytd': round(sum(b[:ytd]), 2),
            })
    categories.sort(key=lambda c: c['actual'], reverse=True)

    properties = []
    pids = set(props) | {k for k in pay_by_prop} | {uuid.UUID(k) for k in by_prop if k}
    for pid in pids:
        p = props.get(pid)
        agg = by_prop.get(str(pid), {'opex': 0.0, 'capex': 0.0})
        inc = pay_by_prop.get(pid, 0.0)
        if not (inc or agg['opex'] or agg['capex']):
            continue
        properties.append({
            'id': str(pid), 'code': p.code if p else '—', 'name': p.name if p else 'Propiedad',
            'income': round(inc, 2), 'opex': round(agg['opex'], 2), 'capex': round(agg['capex'], 2),
            'noi': round(inc - agg['opex'], 2),
        })
    properties.sort(key=lambda x: x['noi'], reverse=True)
    general = by_prop.get('', {'opex': 0.0, 'capex': 0.0})
    if general['opex'] or general['capex']:
        properties.append({
            'id': '', 'code': '—', 'name': 'Gastos generales (sin propiedad)', 'income': 0.0,
            'opex': round(general['opex'], 2), 'capex': round(general['capex'], 2), 'noi': round(-general['opex'], 2),
        })

    # Espacios (propiedades Multi Tenant): ingreso, gasto y costo por m²
    spaces_out = []
    sids = {uuid.UUID(k) for k in by_space} | set(pay_by_space)
    if sids:
        from .models import RentalSpace
        for sp in RentalSpace.objects.filter(tenant=tenant, id__in=sids).select_related('property'):
            agg = by_space.get(str(sp.id), {'opex': 0.0, 'capex': 0.0})
            inc = pay_by_space.get(sp.id, 0.0)
            area = _f(sp.area_m2)
            spaces_out.append({
                'id': str(sp.id), 'code': sp.code, 'name': sp.label, 'property_code': sp.property.code,
                'property_name': sp.property.name, 'area_m2': area, 'income': round(inc, 2),
                'opex': round(agg['opex'], 2), 'capex': round(agg['capex'], 2),
                'noi': round(inc - agg['opex'], 2),
                'opex_per_m2': round(agg['opex'] / area, 2) if area else None,
            })
        spaces_out.sort(key=lambda x: x['noi'], reverse=True)

    # Proyectos
    projects_qs = list(RentalCapexProject.objects.filter(tenant=tenant).select_related('property', 'space'))
    money = project_money(tenant)
    status_counts = defaultdict(int)
    health_counts = {'ok': 0, 'riesgo': 0, 'critico': 0}
    plist = []
    active_budget = active_spent = active_committed = pipeline = 0.0
    for p in projects_qs:
        status_counts[p.status] += 1
        mny = money.get(p.id, {'spent': ZERO, 'committed': ZERO})
        prog = project_progress(p)
        cost_h, sched_h, health = project_health(p, mny['spent'], mny['committed'], prog)
        if p.status in ACTIVE_PROJECT:
            health_counts[health] += 1
            active_budget += _f(p.budget_amount)
            active_spent += _f(mny['spent'])
            active_committed += _f(mny['committed'])
        if p.status == 'propuesta':
            pipeline += _f(p.budget_amount)
        if p.status not in CLOSED_PROJECT:
            plist.append({
                'id': str(p.id), 'code': p.code, 'name': p.name, 'status': p.status,
                'status_label': p.get_status_display(), 'category_label': p.get_category_display(),
                'property_code': p.property.code if p.property_id else '',
                'space_code': p.space.code if p.space_id else '', 'budget': _f(p.budget_amount),
                'spent': _f(mny['spent']), 'committed': _f(mny['committed']), 'progress': prog,
                'health': health, 'cost_health': cost_h, 'schedule_health': sched_h,
                'end_date': p.end_date.isoformat() if p.end_date else '',
            })
    rank = {'critico': 0, 'riesgo': 1, 'ok': 2}
    plist.sort(key=lambda x: (rank[x['health']], x['end_date'] or '9999'))

    equipment = _equipment(tenant, today)
    prev = _totals(tenant, year - 1)

    alerts = []
    for p in plist:
        if p['status'] in ACTIVE_PROJECT and p['health'] != 'ok':
            why = []
            if p['cost_health'] != 'ok':
                why.append('presupuesto excedido' if p['cost_health'] == 'critico' else 'presupuesto casi agotado')
            if p['schedule_health'] != 'ok':
                why.append('fuera de calendario' if p['schedule_health'] == 'critico' else 'avance por debajo del plan')
            alerts.append({
                'level': 'critico' if p['health'] == 'critico' else 'riesgo', 'type': 'proyecto',
                'text': f"{p['code']} {p['name']}: {', '.join(why)}", 'tab': 'proyectos', 'id': p['id'],
            })
    for c in categories:
        if c['budget_ytd'] > 0 and c['actual'] > c['budget_ytd'] * 1.1:
            over = (c['actual'] / c['budget_ytd'] - 1) * 100
            alerts.append({
                'level': 'riesgo', 'type': 'presupuesto',
                'text': f"{c['label']} va {over:.0f} % arriba del presupuesto acumulado", 'tab': 'presupuesto', 'id': c['key'],
            })
    if equipment['candidates_count']:
        alerts.append({
            'level': 'info', 'type': 'equipo',
            'text': f"{equipment['candidates_count']} equipo(s) son candidatos a reposición (CAPEX)", 'tab': 'resumen', 'id': '',
        })
    pending = [p for p in projects_qs if p.status == 'propuesta']
    if pending:
        alerts.append({
            'level': 'info', 'type': 'propuesta',
            'text': f'{len(pending)} propuesta(s) esperando aprobación', 'tab': 'proyectos', 'id': '',
        })

    noi = income - opex
    return {
        'year': year, 'ytd_months': ytd, 'properties_count': len(props),
        'kpis': {
            'income': round(income, 2), 'opex': round(opex, 2), 'opex_committed': round(opex_committed, 2),
            'noi': round(noi, 2), 'noi_margin': round(noi / income * 100, 1) if income else None,
            'opex_ratio': round(opex / income * 100, 1) if income else None,
            'opex_per_property': round(opex / len(props), 2) if props else None,
            'opex_budget_year': round(opex_budget_year, 2), 'opex_budget_ytd': round(opex_budget_ytd, 2),
            'opex_ytd': round(opex_ytd, 2),
            'opex_variance_pct': round((opex_ytd / opex_budget_ytd - 1) * 100, 1) if opex_budget_ytd else None,
            'capex': round(capex, 2), 'capex_committed': round(capex_committed, 2),
            'capex_budget_year': round(capex_budget_year, 2),
            'capex_active_budget': round(active_budget, 2), 'capex_active_spent': round(active_spent, 2),
            'capex_active_committed': round(active_committed, 2), 'capex_pipeline': round(pipeline, 2),
            'projects_active': sum(status_counts[s] for s in ACTIVE_PROJECT),
            'projects_at_risk': health_counts['riesgo'] + health_counts['critico'],
        },
        'prev_year': prev,
        'monthly': monthly,
        'categories': categories,
        'properties': properties,
        'spaces': spaces_out[:30],
        'projects': plist[:12],
        'status_counts': dict(status_counts),
        'health_counts': health_counts,
        'equipment': equipment,
        'alerts': alerts[:8],
    }


class SummaryView(APIView):
    permission_classes = [RentalAccess('rentas_capex')]

    def get(self, request, tenant_id):
        tenant = Tenant.objects.get(id=tenant_id)
        _require_rentas(tenant)
        try:
            year = int(request.query_params.get('year') or date.today().year)
        except ValueError:
            year = date.today().year
        if not 2000 <= year <= 2100:
            year = date.today().year
        return Response(build_summary(tenant, year))
