"""API CAFM / CMMS de Administrar Propiedades.

Activos, planes preventivos, solicitudes de servicio, inspecciones, ajustes (SLA / portal),
indicadores y portal público de solicitudes.
"""
from __future__ import annotations

from datetime import date, timedelta

from django.db.models import Count, Q, Sum
from django.utils import timezone
from rest_framework import permissions, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

from . import rental_ops, rental_spaces
import os

from .models import (
    RentalAsset, RentalInspection, RentalInspectionEvidence, RentalInspectionTemplate,
    RentalInspectionTemplateFile, RentalMaintenanceCategory,
    RentalMaintenancePlan, RentalMaintenanceWork, RentalOpsSettings, RentalParty,
    RentalProperty, RentalServiceRequest, Tenant,
)
from .rental_access import RentalAccess
from .rental_mantenimiento import (
    FILE_EXTS, FILE_MAX, _RentasMixin, can_write, media_api_url, work_sla_state,
)
from .rental_views import _require_rentas

OPEN_WORK = ('planeado', 'en_curso')
OPEN_REQ = ('nueva', 'en_proceso')


def _audit(request, action_name, description, tenant_id, object_type, object_id, object_repr):
    from .views import _audit_log
    _audit_log(
        request, 'rentas_mantenimiento', action_name, description,
        tenant_id=tenant_id, object_type=object_type,
        object_id=str(object_id) if object_id else '', object_repr=object_repr or '',
    )


def _user(request):
    return request.user if getattr(request.user, 'is_authenticated', False) else None


class _OpsMixin(_RentasMixin):
    """Lectura/escritura por módulo (ver `rental_access`); cada viewset declara el suyo."""

    def _same_tenant(self, tenant, obj, field):
        if obj is not None and getattr(obj, 'tenant_id', tenant.id) != tenant.id:
            raise ValidationError({field: 'El registro no pertenece a este espacio.'})


# ─── Activos ─────────────────────────────────────────────────────────────────

def warranty_state(asset):
    if not asset.warranty_until:
        return 'sin_garantia'
    today = date.today()
    if asset.warranty_until < today:
        return 'vencida'
    if asset.warranty_until <= today + timedelta(days=60):
        return 'por_vencer'
    return 'vigente'


class AssetSerializer(serializers.ModelSerializer):
    property_code = serializers.CharField(source='property.code', read_only=True)
    property_name = serializers.CharField(source='property.name', read_only=True)
    space_code = serializers.CharField(source='space.code', read_only=True, default='')
    space_name = serializers.CharField(source='space.label', read_only=True, default='')
    category_name = serializers.CharField(source='category.name', read_only=True, default='')
    provider_name = serializers.SerializerMethodField()
    kind_label = serializers.CharField(source='get_kind_display', read_only=True)
    status_label = serializers.CharField(source='get_status_display', read_only=True)
    criticality_label = serializers.CharField(source='get_criticality_display', read_only=True)
    warranty_state = serializers.SerializerMethodField()
    age_years = serializers.SerializerMethodField()
    life_left_years = serializers.SerializerMethodField()
    capex_code = serializers.CharField(source='capex_project.code', read_only=True, default='')
    open_orders = serializers.IntegerField(read_only=True, default=0)
    failures = serializers.IntegerField(read_only=True, default=0)
    total_cost = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True, default=0)

    class Meta:
        model = RentalAsset
        fields = (
            'id', 'code', 'name', 'kind', 'kind_label', 'property', 'property_code', 'property_name',
            'space', 'space_code', 'space_name',
            'category', 'category_name', 'brand', 'model', 'serial_number', 'location',
            'status', 'status_label', 'criticality', 'criticality_label',
            'install_date', 'warranty_until', 'warranty_state', 'useful_life_years',
            'age_years', 'life_left_years', 'purchase_cost', 'provider', 'provider_name',
            'notes', 'is_active', 'capex_project', 'capex_code', 'open_orders', 'failures', 'total_cost',
            'created_at', 'updated_at',
        )
        read_only_fields = ('id', 'created_at', 'updated_at')
        extra_kwargs = {'code': {'required': False, 'allow_blank': True}}

    def get_provider_name(self, obj):
        if obj.provider_id:
            return obj.provider.trade_name or obj.provider.name
        return ''

    def get_warranty_state(self, obj):
        return warranty_state(obj)

    def get_age_years(self, obj):
        if not obj.install_date:
            return None
        return round((date.today() - obj.install_date).days / 365.25, 1)

    def get_life_left_years(self, obj):
        age = self.get_age_years(obj)
        if age is None or not obj.useful_life_years:
            return None
        return round(obj.useful_life_years - age, 1)


class AssetViewSet(_OpsMixin, viewsets.ModelViewSet):
    permission_classes = [RentalAccess('rentas_activos')]
    serializer_class = AssetSerializer
    queryset = RentalAsset.objects.all()
    pagination_class = None

    def get_queryset(self):
        qs = (
            RentalAsset.objects.filter(tenant=self.get_tenant())
            .select_related('property', 'space', 'category', 'provider', 'capex_project')
            .annotate(
                open_orders=Count('works', filter=Q(works__status__in=OPEN_WORK)),
                failures=Count('works', filter=Q(works__kind='correctivo', works__status__in=('planeado', 'en_curso', 'realizado'))),
                total_cost=Sum('works__cost', filter=Q(works__status='realizado')),
            )
        )
        p = self.request.query_params
        for key in ('property', 'space', 'kind', 'status', 'criticality', 'category'):
            if p.get(key):
                qs = qs.filter(**{f'{key}_id' if key in ('property', 'space', 'category') else key: p[key]})
        if p.get('active') in ('0', 'false'):
            qs = qs.filter(is_active=False)
        elif p.get('active') in ('1', 'true'):
            qs = qs.filter(is_active=True)
        if p.get('q'):
            q = p['q'].strip()
            qs = qs.filter(
                Q(name__icontains=q) | Q(code__icontains=q) | Q(brand__icontains=q)
                | Q(model__icontains=q) | Q(serial_number__icontains=q)
                | Q(property__code__icontains=q) | Q(property__name__icontains=q)
                | Q(space__code__icontains=q) | Q(space__name__icontains=q)
            )
        today = date.today()
        w = p.get('warranty')
        if w == 'vigente':
            qs = qs.filter(warranty_until__gt=today + timedelta(days=60))
        elif w == 'por_vencer':
            qs = qs.filter(warranty_until__gte=today, warranty_until__lte=today + timedelta(days=60))
        elif w == 'vencida':
            qs = qs.filter(warranty_until__lt=today)
        return qs

    def _validate_refs(self, tenant, vd):
        prop = vd.get('property')
        if prop is not None and prop.tenant_id != tenant.id:
            raise ValidationError({'property': 'Selecciona una propiedad de este espacio.'})
        for f in ('category', 'provider', 'capex_project'):
            self._same_tenant(tenant, vd.get(f), f)
        if 'space' in vd or 'property' in vd:
            cur = getattr(self, '_current', None)
            rental_spaces.check_space(
                tenant, prop or (cur.property if cur else None),
                vd['space'] if 'space' in vd else (cur.space if cur else None),
            )

    def perform_create(self, serializer):
        tenant = self.get_tenant()
        vd = serializer.validated_data
        self._current = None
        self._validate_refs(tenant, vd)
        code = (vd.get('code') or '').strip()
        if code and RentalAsset.objects.filter(tenant=tenant, code=code).exists():
            raise ValidationError({'code': 'Ya existe un activo con ese código.'})
        obj = serializer.save(tenant=tenant, code=code or rental_ops.next_asset_code(tenant))
        _audit(self.request, 'create', f'Activo {obj.code}: {obj.name}', tenant.id, 'RentalAsset', obj.id, obj.name)

    def perform_update(self, serializer):
        tenant = self.get_tenant()
        vd = serializer.validated_data
        self._current = serializer.instance
        self._validate_refs(tenant, vd)
        code = (vd.get('code') or '').strip() if 'code' in vd else None
        if code and RentalAsset.objects.filter(tenant=tenant, code=code).exclude(pk=serializer.instance.pk).exists():
            raise ValidationError({'code': 'Ya existe un activo con ese código.'})
        if 'code' in vd and not code:
            vd.pop('code')
        obj = serializer.save()
        _audit(self.request, 'update', f'Activo actualizado {obj.code}', tenant.id, 'RentalAsset', obj.id, obj.name)

    def perform_destroy(self, instance):
        if instance.works.exists() or instance.plans.exists():
            raise ValidationError({'detail': 'El activo tiene órdenes o planes. Márcalo como dado de baja en lugar de eliminarlo.'})
        label = f'{instance.code} {instance.name}'
        instance.delete()
        _audit(self.request, 'delete', f'Activo eliminado {label}', self.kwargs['tenant_id'], 'RentalAsset', instance.id, label)

    @action(detail=True, methods=['get'], url_path='history')
    def history(self, request, tenant_id=None, pk=None):
        asset = self.get_object()
        from .rental_mantenimiento import WorkSerializer
        works = (
            RentalMaintenanceWork.objects.filter(asset=asset)
            .select_related('property', 'category', 'provider', 'asset', 'plan', 'service_request', 'inspection')
            .annotate(evidence_count=Count('evidences'))
            .order_by('-scheduled_date', '-created_at')[:60]
        )
        plans = RentalMaintenancePlan.objects.filter(asset=asset).select_related('property', 'asset')
        return Response({
            'works': WorkSerializer(works, many=True, context={'request': request}).data,
            'plans': PlanSerializer(plans, many=True).data,
        })

    @action(detail=False, methods=['get'], url_path='summary')
    def summary(self, request, tenant_id=None):
        qs = RentalAsset.objects.filter(tenant=self.get_tenant(), is_active=True)
        today = date.today()
        return Response({
            'total': qs.count(),
            'en_falla': qs.filter(status='en_falla').count(),
            'en_mantenimiento': qs.filter(status='en_mantenimiento').count(),
            'criticos': qs.filter(criticality='critica').count(),
            'garantia_por_vencer': qs.filter(warranty_until__gte=today, warranty_until__lte=today + timedelta(days=60)).count(),
        })


# ─── Planes preventivos ──────────────────────────────────────────────────────

class PlanSerializer(serializers.ModelSerializer):
    property_code = serializers.CharField(source='property.code', read_only=True)
    property_name = serializers.CharField(source='property.name', read_only=True)
    asset_code = serializers.CharField(source='asset.code', read_only=True, default='')
    asset_name = serializers.CharField(source='asset.name', read_only=True, default='')
    space_code = serializers.CharField(source='space.code', read_only=True, default='')
    space_name = serializers.CharField(source='space.label', read_only=True, default='')
    category_name = serializers.CharField(source='category.name', read_only=True, default='')
    provider_name = serializers.SerializerMethodField()
    frequency_label = serializers.CharField(source='get_frequency_display', read_only=True)
    days_until = serializers.SerializerMethodField()
    state = serializers.SerializerMethodField()
    open_orders = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = RentalMaintenancePlan
        fields = (
            'id', 'name', 'property', 'property_code', 'property_name', 'space', 'space_code', 'space_name',
            'asset', 'asset_code', 'asset_name', 'category', 'category_name',
            'work_type', 'provider', 'provider_name', 'priority', 'frequency', 'frequency_label',
            'start_date', 'next_due_date', 'lead_days', 'estimated_cost', 'assigned_to',
            'description', 'checklist', 'auto_generate', 'is_active', 'last_generated_at',
            'days_until', 'state', 'open_orders', 'created_at', 'updated_at',
        )
        read_only_fields = ('id', 'last_generated_at', 'created_at', 'updated_at')
        extra_kwargs = {'next_due_date': {'required': False}}

    def get_provider_name(self, obj):
        if obj.provider_id:
            return obj.provider.trade_name or obj.provider.name
        return ''

    def get_days_until(self, obj):
        return (obj.next_due_date - date.today()).days

    def get_state(self, obj):
        if not obj.is_active:
            return 'pausado'
        d = (obj.next_due_date - date.today()).days
        if d < 0:
            return 'vencido'
        if d <= 7:
            return 'proximo'
        return 'al_dia'

    def validate_checklist(self, value):
        return [str(x).strip()[:200] for x in (value or []) if str(x).strip()]

    def validate_priority(self, value):
        if value not in rental_ops.PRIORITIES:
            raise serializers.ValidationError('Prioridad no válida.')
        return value


class PlanViewSet(_OpsMixin, viewsets.ModelViewSet):
    permission_classes = [RentalAccess('rentas_preventivo')]
    serializer_class = PlanSerializer
    queryset = RentalMaintenancePlan.objects.all()
    pagination_class = None

    def get_queryset(self):
        qs = (
            RentalMaintenancePlan.objects.filter(tenant=self.get_tenant())
            .select_related('property', 'space', 'asset', 'category', 'provider')
            .annotate(open_orders=Count('works', filter=Q(works__status__in=OPEN_WORK)))
        )
        p = self.request.query_params
        if p.get('property'):
            qs = qs.filter(property_id=p['property'])
        if p.get('space'):
            qs = qs.filter(space_id=p['space'])
        if p.get('asset'):
            qs = qs.filter(asset_id=p['asset'])
        if p.get('active') in ('1', 'true'):
            qs = qs.filter(is_active=True)
        elif p.get('active') in ('0', 'false'):
            qs = qs.filter(is_active=False)
        if p.get('q'):
            qs = qs.filter(Q(name__icontains=p['q'].strip()) | Q(property__code__icontains=p['q'].strip()))
        return qs

    def _validate_refs(self, tenant, vd, current=None):
        prop = vd.get('property') or (current.property if current else None)
        if prop is None or prop.tenant_id != tenant.id:
            raise ValidationError({'property': 'Selecciona una propiedad de este espacio.'})
        asset = vd.get('asset') if 'asset' in vd else (current.asset if current else None)
        if asset and (asset.tenant_id != tenant.id or asset.property_id != prop.id):
            raise ValidationError({'asset': 'El activo debe pertenecer a la propiedad seleccionada.'})
        for f in ('category', 'provider', 'work_type'):
            self._same_tenant(tenant, vd.get(f), f)
        rental_spaces.check_space(
            tenant, prop, vd['space'] if 'space' in vd else (current.space if current else None),
        )

    def perform_create(self, serializer):
        tenant = self.get_tenant()
        vd = serializer.validated_data
        self._validate_refs(tenant, vd)
        nxt = vd.get('next_due_date') or vd['start_date']
        plan = serializer.save(tenant=tenant, next_due_date=nxt, created_by=_user(self.request),
                               **rental_spaces.inherit_space(vd, vd.get('asset')))
        _audit(self.request, 'create', f'Plan preventivo: {plan.name}', tenant.id, 'RentalMaintenancePlan', plan.id, plan.name)

    def perform_update(self, serializer):
        self._validate_refs(self.get_tenant(), serializer.validated_data, serializer.instance)
        plan = serializer.save()
        _audit(self.request, 'update', f'Plan preventivo actualizado: {plan.name}', plan.tenant_id, 'RentalMaintenancePlan', plan.id, plan.name)

    def perform_destroy(self, instance):
        name = instance.name
        instance.delete()
        _audit(self.request, 'delete', f'Plan preventivo eliminado: {name}', self.kwargs['tenant_id'], 'RentalMaintenancePlan', instance.id, name)

    @action(detail=False, methods=['post'], url_path='generate-due')
    def generate_due(self, request, tenant_id=None):
        created = rental_ops.generate_due_plans(self.get_tenant(), user=_user(request))
        if created:
            _audit(request, 'create', f'Órdenes preventivas generadas: {len(created)}', tenant_id, 'RentalMaintenancePlan', '', 'generate-due')
        return Response({'created': len(created), 'folios': [w.folio for w in created]})

    @action(detail=True, methods=['post'], url_path='generate')
    def generate_now(self, request, tenant_id=None, pk=None):
        plan = self.get_object()
        if RentalMaintenanceWork.objects.filter(plan=plan, scheduled_date=plan.next_due_date).exists():
            raise ValidationError({'detail': 'Ya existe una orden para esta fecha.'})
        work = rental_ops.work_from_plan(plan, user=_user(request))
        plan.next_due_date = rental_ops.advance_date(plan.next_due_date, plan.frequency)
        plan.last_generated_at = timezone.now()
        plan.save(update_fields=['next_due_date', 'last_generated_at', 'updated_at'])
        return Response({'folio': work.folio, 'work': str(work.id), 'next_due_date': str(plan.next_due_date)})

    @action(detail=False, methods=['get'], url_path='summary')
    def summary(self, request, tenant_id=None):
        qs = RentalMaintenancePlan.objects.filter(tenant=self.get_tenant())
        today = date.today()
        act = qs.filter(is_active=True)
        return Response({
            'total': qs.count(),
            'activos': act.count(),
            'vencidos': act.filter(next_due_date__lt=today).count(),
            'proximos_7': act.filter(next_due_date__gte=today, next_due_date__lte=today + timedelta(days=7)).count(),
        })


# ─── Solicitudes de servicio ─────────────────────────────────────────────────

def request_sla_flags(req):
    now = timezone.now()
    resp = ''
    if req.response_due_at:
        if req.first_response_at:
            resp = 'cumplida' if req.first_response_at <= req.response_due_at else 'tarde'
        elif req.status in OPEN_REQ:
            resp = 'vencida' if now > req.response_due_at else 'en_tiempo'
    res = ''
    if req.resolution_due_at:
        if req.resolved_at:
            res = 'cumplida' if req.resolved_at <= req.resolution_due_at else 'tarde'
        elif req.status in OPEN_REQ:
            if now > req.resolution_due_at:
                res = 'vencida'
            elif req.resolution_due_at - now <= timedelta(hours=24):
                res = 'por_vencer'
            else:
                res = 'en_tiempo'
    return resp, res


class RequestSerializer(serializers.ModelSerializer):
    property_code = serializers.CharField(source='property.code', read_only=True)
    property_name = serializers.CharField(source='property.name', read_only=True)
    asset_code = serializers.CharField(source='asset.code', read_only=True, default='')
    asset_name = serializers.CharField(source='asset.name', read_only=True, default='')
    space_code = serializers.CharField(source='space.code', read_only=True, default='')
    space_name = serializers.CharField(source='space.label', read_only=True, default='')
    category_name = serializers.CharField(source='category.name', read_only=True, default='')
    channel_label = serializers.CharField(source='get_channel_display', read_only=True)
    works = serializers.SerializerMethodField()
    response_state = serializers.SerializerMethodField()
    resolution_state = serializers.SerializerMethodField()

    class Meta:
        model = RentalServiceRequest
        fields = (
            'id', 'folio', 'property', 'property_code', 'property_name', 'space', 'space_code', 'space_name',
            'asset', 'asset_code', 'asset_name', 'requester_party',
            'requester_name', 'requester_email', 'requester_phone',
            'channel', 'channel_label', 'category', 'category_name',
            'title', 'description', 'priority', 'status',
            'response_due_at', 'resolution_due_at', 'first_response_at', 'resolved_at',
            'response_state', 'resolution_state',
            'resolution_notes', 'reject_reason', 'satisfaction', 'satisfaction_comment',
            'works', 'created_at', 'updated_at',
        )
        read_only_fields = (
            'id', 'folio', 'status', 'response_due_at', 'resolution_due_at', 'first_response_at',
            'resolved_at', 'resolution_notes', 'reject_reason', 'satisfaction',
            'satisfaction_comment', 'created_at', 'updated_at',
        )

    def get_works(self, obj):
        return [
            {'id': str(w.id), 'folio': w.folio, 'status': w.status, 'title': w.title}
            for w in obj.works.all()
        ]

    def get_response_state(self, obj):
        return request_sla_flags(obj)[0]

    def get_resolution_state(self, obj):
        return request_sla_flags(obj)[1]


class RequestViewSet(_OpsMixin, viewsets.ModelViewSet):
    permission_classes = [RentalAccess('rentas_solicitudes')]
    serializer_class = RequestSerializer
    queryset = RentalServiceRequest.objects.all()
    pagination_class = None
    http_method_names = ['get', 'post', 'patch', 'delete', 'head', 'options']

    def get_queryset(self):
        qs = (
            RentalServiceRequest.objects.filter(tenant=self.get_tenant())
            .select_related('property', 'space', 'asset', 'category')
            .prefetch_related('works')
        )
        p = self.request.query_params
        if p.get('status') == 'abiertas':
            qs = qs.filter(status__in=OPEN_REQ)
        elif p.get('status'):
            qs = qs.filter(status=p['status'])
        for key in ('priority', 'channel'):
            if p.get(key):
                qs = qs.filter(**{key: p[key]})
        if p.get('property'):
            qs = qs.filter(property_id=p['property'])
        if p.get('space'):
            qs = qs.filter(space_id=p['space'])
        if p.get('overdue') in ('1', 'true'):
            qs = qs.filter(status__in=OPEN_REQ).filter(
                Q(resolution_due_at__lt=timezone.now())
                | Q(first_response_at__isnull=True, response_due_at__lt=timezone.now())
            )
        if p.get('q'):
            q = p['q'].strip()
            qs = qs.filter(
                Q(title__icontains=q) | Q(folio__icontains=q) | Q(requester_name__icontains=q)
                | Q(property__code__icontains=q) | Q(property__name__icontains=q) | Q(space__code__icontains=q)
            )
        return qs

    def _validate_refs(self, tenant, vd, current=None):
        prop = vd.get('property') or (current.property if current else None)
        if prop is None or prop.tenant_id != tenant.id:
            raise ValidationError({'property': 'Selecciona una propiedad de este espacio.'})
        asset = vd.get('asset') if 'asset' in vd else (current.asset if current else None)
        if asset and (asset.tenant_id != tenant.id or asset.property_id != prop.id):
            raise ValidationError({'asset': 'El activo debe pertenecer a la propiedad seleccionada.'})
        for f in ('category', 'requester_party'):
            self._same_tenant(tenant, vd.get(f), f)
        rental_spaces.check_space(
            tenant, prop, vd['space'] if 'space' in vd else (current.space if current else None),
        )

    def perform_create(self, serializer):
        tenant = self.get_tenant()
        vd = serializer.validated_data
        self._validate_refs(tenant, vd)
        req = serializer.save(tenant=tenant, folio=rental_ops.next_request_folio(tenant), created_by=_user(self.request),
                              **rental_spaces.inherit_space(vd, vd.get('asset')))
        rental_ops.apply_request_sla(req, tenant)
        req.save(update_fields=['response_due_at', 'resolution_due_at'])
        _audit(self.request, 'create', f'Solicitud {req.folio}: {req.title}', tenant.id, 'RentalServiceRequest', req.id, req.title)

    def perform_update(self, serializer):
        tenant = self.get_tenant()
        inst = serializer.instance
        self._validate_refs(tenant, serializer.validated_data, inst)
        old_priority = inst.priority
        req = serializer.save()
        if req.priority != old_priority and req.status in OPEN_REQ:
            rental_ops.apply_request_sla(req, tenant, base=req.created_at)
            req.save(update_fields=['response_due_at', 'resolution_due_at'])
        _audit(self.request, 'update', f'Solicitud actualizada {req.folio}', tenant.id, 'RentalServiceRequest', req.id, req.title)

    def perform_destroy(self, instance):
        if instance.works.exists():
            raise ValidationError({'detail': 'La solicitud tiene órdenes de trabajo. Ciérrala o recházala en lugar de eliminarla.'})
        label = f'{instance.folio} {instance.title}'
        instance.delete()
        _audit(self.request, 'delete', f'Solicitud eliminada {label}', self.kwargs['tenant_id'], 'RentalServiceRequest', instance.id, label)

    def _out(self, req):
        req = self.get_queryset().get(pk=req.pk)
        return RequestSerializer(req, context={'request': self.request}).data

    @action(detail=True, methods=['post'], url_path='create-order')
    def create_order(self, request, tenant_id=None, pk=None):
        req = self.get_object()
        if req.status in ('cerrada', 'rechazada'):
            raise ValidationError({'detail': 'No se puede generar una orden de una solicitud cerrada o rechazada.'})
        extra = {}
        d = request.data
        if d.get('provider'):
            from .models import RentalMaintenanceProvider
            prov = RentalMaintenanceProvider.objects.filter(tenant=req.tenant, pk=d['provider']).first()
            if not prov:
                raise ValidationError({'provider': 'Proveedor no válido.'})
            extra['provider'] = prov
        if d.get('assigned_to'):
            extra['assigned_to'] = str(d['assigned_to'])[:200]
        if d.get('scheduled_date'):
            try:
                extra['scheduled_date'] = date.fromisoformat(str(d['scheduled_date'])[:10])
            except ValueError:
                raise ValidationError({'scheduled_date': 'Fecha no válida.'})
        work = rental_ops.create_work_from_request(req, user=_user(request), **extra)
        audit_msg = f'Orden {work.folio} desde solicitud {req.folio}'
        _audit(request, 'create', audit_msg, tenant_id, 'RentalMaintenanceWork', work.id, work.title)
        return Response({'work_id': str(work.id), 'folio': work.folio, 'request': self._out(req)}, status=201)

    @action(detail=True, methods=['post'], url_path='set-status')
    def set_status(self, request, tenant_id=None, pk=None):
        req = self.get_object()
        new = request.data.get('status')
        if new not in dict(RentalServiceRequest.STATUS_CHOICES):
            raise ValidationError({'status': 'Estado no válido.'})
        now = timezone.now()
        if new in ('en_proceso', 'resuelta', 'cerrada', 'rechazada'):
            rental_ops.mark_request_responded(req)
        if new == 'rechazada':
            reason = str(request.data.get('reject_reason') or '').strip()
            if not reason:
                raise ValidationError({'reject_reason': 'Indica el motivo del rechazo.'})
            req.reject_reason = reason[:300]
        if new in ('resuelta', 'cerrada'):
            if not req.resolved_at:
                req.resolved_at = now
            if request.data.get('resolution_notes') is not None:
                req.resolution_notes = str(request.data.get('resolution_notes'))[:4000]
        if new == 'cerrada' and request.data.get('satisfaction'):
            try:
                score = int(request.data['satisfaction'])
            except (TypeError, ValueError):
                score = 0
            if not 1 <= score <= 5:
                raise ValidationError({'satisfaction': 'La calificación va de 1 a 5.'})
            req.satisfaction = score
            req.satisfaction_comment = str(request.data.get('satisfaction_comment') or '')[:400]
        if new in ('nueva', 'en_proceso'):
            req.resolved_at = None
        req.status = new
        req.save()
        _audit(request, 'update', f'Solicitud {req.folio} → {new}', tenant_id, 'RentalServiceRequest', req.id, req.title)
        return Response(self._out(req))

    @action(detail=False, methods=['get'], url_path='summary')
    def summary(self, request, tenant_id=None):
        qs = RentalServiceRequest.objects.filter(tenant=self.get_tenant())
        now = timezone.now()
        open_qs = qs.filter(status__in=OPEN_REQ)
        return Response({
            'total': qs.count(),
            'nueva': qs.filter(status='nueva').count(),
            'en_proceso': qs.filter(status='en_proceso').count(),
            'resuelta': qs.filter(status='resuelta').count(),
            'abiertas': open_qs.count(),
            'vencidas': open_qs.filter(
                Q(resolution_due_at__lt=now) | Q(first_response_at__isnull=True, response_due_at__lt=now)
            ).count(),
            'urgentes': open_qs.filter(priority='urgente').count(),
        })


# ─── Inspecciones ────────────────────────────────────────────────────────────

class InspectionFileSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()
    uploaded_by_name = serializers.SerializerMethodField()

    class Meta:
        model = RentalInspectionEvidence
        fields = ('id', 'item_id', 'item_label', 'original_name', 'notes', 'file_url',
                  'uploaded_by_name', 'captured_at', 'created_at')

    def get_file_url(self, obj):
        return media_api_url(obj.file, self.context.get('request'))

    def get_uploaded_by_name(self, obj):
        u = obj.uploaded_by
        return (getattr(u, 'name', None) or getattr(u, 'email', '') or '') if u else ''


class TemplateFileSerializer(InspectionFileSerializer):
    class Meta:
        model = RentalInspectionTemplateFile
        fields = ('id', 'original_name', 'notes', 'file_url', 'uploaded_by_name', 'created_at')


def _read_upload(request):
    """Valida el archivo recibido; devuelve (archivo, None) o (None, Response de error)."""
    uploaded = request.FILES.get('file') or request.FILES.get('archivo')
    if not uploaded:
        return None, Response({'detail': 'Adjunta un archivo.'}, status=400)
    name = getattr(uploaded, 'name', '') or 'archivo'
    ext = os.path.splitext(name)[1].lower()
    if ext not in FILE_EXTS:
        return None, Response({'detail': f'Tipo de archivo no permitido ({ext or "sin extensión"}).'}, status=400)
    if (getattr(uploaded, 'size', 0) or 0) > FILE_MAX:
        return None, Response({'detail': 'El archivo no puede superar 20 MB.'}, status=400)
    return uploaded, None


def _parse_day(raw):
    try:
        return date.fromisoformat((raw or '').strip()[:10])
    except ValueError:
        return None


class TemplateSerializer(serializers.ModelSerializer):
    kind_label = serializers.CharField(source='get_kind_display', read_only=True)
    items_count = serializers.SerializerMethodField()
    files = TemplateFileSerializer(many=True, read_only=True)

    class Meta:
        model = RentalInspectionTemplate
        fields = ('id', 'name', 'kind', 'kind_label', 'description', 'items', 'items_count',
                  'files', 'is_active', 'created_at')
        read_only_fields = ('id', 'created_at')

    def get_items_count(self, obj):
        return len(obj.items or [])

    def validate_items(self, value):
        out = []
        for n, it in enumerate(value or []):
            label = str((it or {}).get('label', '') if isinstance(it, dict) else it).strip()
            if label:
                item = {'id': f'i{n + 1}', 'label': label[:200]}
                if isinstance(it, dict):
                    if it.get('require_evidence'):
                        item['require_evidence'] = True
                    hint = str(it.get('hint') or '').strip()
                    if hint:
                        item['hint'] = hint[:300]
                out.append(item)
        if not out:
            raise serializers.ValidationError('Agrega al menos un punto a revisar.')
        return out


class TemplateViewSet(_OpsMixin, viewsets.ModelViewSet):
    permission_classes = [RentalAccess('rentas_inspecciones')]
    serializer_class = TemplateSerializer
    queryset = RentalInspectionTemplate.objects.all()
    pagination_class = None

    def get_queryset(self):
        tenant = self.get_tenant()
        rental_ops.ensure_default_templates(tenant)
        return RentalInspectionTemplate.objects.filter(tenant=tenant).prefetch_related('files')

    def perform_create(self, serializer):
        serializer.save(tenant=self.get_tenant())

    def perform_destroy(self, instance):
        for f in instance.files.all():
            if f.file:
                f.file.delete(save=False)
        instance.delete()

    @action(detail=True, methods=['post'], url_path='files')
    def add_file(self, request, tenant_id=None, pk=None):
        tpl = self.get_object()
        uploaded, err = _read_upload(request)
        if err:
            return err
        obj = RentalInspectionTemplateFile.objects.create(
            template=tpl, original_name=(getattr(uploaded, 'name', '') or 'archivo')[:240],
            notes=(request.data.get('notes') or '')[:400], file=uploaded, uploaded_by=_user(request),
        )
        _audit(request, 'update', f'Archivo agregado a plantilla {tpl.name}', tenant_id, 'RentalInspectionTemplate', tpl.id, tpl.name)
        return Response(TemplateFileSerializer(obj, context={'request': request}).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['delete'], url_path='files/(?P<file_id>[^/.]+)')
    def remove_file(self, request, tenant_id=None, pk=None, file_id=None):
        tpl = self.get_object()
        obj = tpl.files.filter(id=file_id).first()
        if not obj:
            return Response({'detail': 'Archivo no encontrado.'}, status=404)
        if obj.file:
            obj.file.delete(save=False)
        obj.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class InspectionSerializer(serializers.ModelSerializer):
    property_code = serializers.CharField(source='property.code', read_only=True)
    property_name = serializers.CharField(source='property.name', read_only=True)
    asset_code = serializers.CharField(source='asset.code', read_only=True, default='')
    asset_name = serializers.CharField(source='asset.name', read_only=True, default='')
    space_code = serializers.CharField(source='space.code', read_only=True, default='')
    space_name = serializers.CharField(source='space.label', read_only=True, default='')
    stats = serializers.SerializerMethodField()
    works = serializers.SerializerMethodField()
    evidences = InspectionFileSerializer(many=True, read_only=True)
    template_files = serializers.SerializerMethodField()

    class Meta:
        model = RentalInspection
        fields = (
            'id', 'folio', 'template', 'name', 'property', 'property_code', 'property_name',
            'space', 'space_code', 'space_name',
            'asset', 'asset_code', 'asset_name', 'inspector_name', 'inspected_date',
            'status', 'results', 'score', 'stats', 'summary', 'works', 'evidences', 'template_files', 'completed_at',
            'created_at', 'updated_at',
        )
        read_only_fields = ('id', 'folio', 'status', 'score', 'completed_at', 'created_at', 'updated_at')
        extra_kwargs = {'name': {'required': False, 'allow_blank': True}, 'inspected_date': {'required': False}}

    def get_stats(self, obj):
        return rental_ops.score_results(obj.results or [])

    def get_works(self, obj):
        return [{'id': str(w.id), 'folio': w.folio, 'status': w.status, 'title': w.title} for w in obj.works.all()]

    def get_template_files(self, obj):
        if not obj.template_id:
            return []
        return TemplateFileSerializer(obj.template.files.all(), many=True, context=self.context).data

    def validate_results(self, value):
        out = []
        for it in value or []:
            if not isinstance(it, dict):
                continue
            result = it.get('result') if it.get('result') in ('pendiente', 'ok', 'falla', 'na') else 'pendiente'
            prio = it.get('priority') if it.get('priority') in rental_ops.PRIORITIES else 'media'
            out.append({
                'id': str(it.get('id') or f'i{len(out) + 1}')[:20],
                'label': str(it.get('label') or '')[:200],
                'result': result,
                'note': str(it.get('note') or '')[:600],
                'priority': prio,
                'hint': str(it.get('hint') or '')[:300],
                'require_evidence': bool(it.get('require_evidence')),
            })
        return out


class InspectionViewSet(_OpsMixin, viewsets.ModelViewSet):
    permission_classes = [RentalAccess(
        'rentas_inspecciones',
        operate=('create', 'update', 'partial_update', 'add_evidence', 'remove_evidence', 'complete'),
    )]
    serializer_class = InspectionSerializer
    queryset = RentalInspection.objects.all()
    pagination_class = None
    http_method_names = ['get', 'post', 'patch', 'delete', 'head', 'options']

    def get_queryset(self):
        qs = (
            RentalInspection.objects.filter(tenant=self.get_tenant())
            .select_related('property', 'space', 'asset', 'template')
            .prefetch_related('works', 'evidences', 'template__files')
        )
        p = self.request.query_params
        if p.get('status'):
            qs = qs.filter(status=p['status'])
        if p.get('property'):
            qs = qs.filter(property_id=p['property'])
        if p.get('space'):
            qs = qs.filter(space_id=p['space'])
        if p.get('q'):
            q = p['q'].strip()
            qs = qs.filter(Q(name__icontains=q) | Q(folio__icontains=q) | Q(property__code__icontains=q) | Q(space__code__icontains=q))
        return qs

    def _validate_refs(self, tenant, vd, current=None):
        prop = vd.get('property') or (current.property if current else None)
        if prop is None or prop.tenant_id != tenant.id:
            raise ValidationError({'property': 'Selecciona una propiedad de este espacio.'})
        asset = vd.get('asset') if 'asset' in vd else (current.asset if current else None)
        if asset and (asset.tenant_id != tenant.id or asset.property_id != prop.id):
            raise ValidationError({'asset': 'El activo debe pertenecer a la propiedad seleccionada.'})
        self._same_tenant(tenant, vd.get('template'), 'template')
        rental_spaces.check_space(
            tenant, prop, vd['space'] if 'space' in vd else (current.space if current else None),
        )

    def perform_create(self, serializer):
        tenant = self.get_tenant()
        vd = serializer.validated_data
        self._validate_refs(tenant, vd)
        template = vd.get('template')
        results = vd.get('results') or (rental_ops.blank_results(template) if template else [])
        if not results:
            raise ValidationError({'results': 'Elige una plantilla o agrega puntos a revisar.'})
        name = vd.get('name') or (template.name if template else 'Inspección')
        obj = serializer.save(
            tenant=tenant, folio=rental_ops.next_inspection_folio(tenant), name=name,
            results=results, inspected_date=vd.get('inspected_date') or date.today(),
            inspector_name=vd.get('inspector_name') or getattr(self.request.user, 'name', '') or '',
            created_by=_user(self.request), **rental_spaces.inherit_space(vd, vd.get('asset')),
        )
        _audit(self.request, 'create', f'Inspección {obj.folio}: {obj.name}', tenant.id, 'RentalInspection', obj.id, obj.name)

    def perform_update(self, serializer):
        inst = serializer.instance
        self._validate_refs(self.get_tenant(), serializer.validated_data, inst)
        if inst.status == 'completada' and 'results' in serializer.validated_data:
            raise ValidationError({'results': 'La inspección ya está completada.'})
        obj = serializer.save()
        _audit(self.request, 'update', f'Inspección actualizada {obj.folio}', obj.tenant_id, 'RentalInspection', obj.id, obj.name)

    def perform_destroy(self, instance):
        label = f'{instance.folio} {instance.name}'
        for ev in instance.evidences.all():
            if ev.file:
                ev.file.delete(save=False)
        instance.delete()
        _audit(self.request, 'delete', f'Inspección eliminada {label}', self.kwargs['tenant_id'], 'RentalInspection', instance.id, label)

    @action(detail=True, methods=['post'], url_path='evidences')
    def add_evidence(self, request, tenant_id=None, pk=None):
        insp = self.get_object()
        if insp.status == 'completada':
            return Response({'detail': 'La inspección ya está completada: sus evidencias no se pueden modificar.'}, status=400)
        uploaded, err = _read_upload(request)
        if err:
            return err
        item_id = str(request.data.get('item_id') or '').strip()[:20]
        item_label = ''
        if item_id:
            row = next((r for r in (insp.results or []) if r.get('id') == item_id), None)
            if not row:
                return Response({'detail': 'El punto de la lista no existe en esta inspección.'}, status=400)
            item_label = (row.get('label') or '')[:200]
        obj = RentalInspectionEvidence.objects.create(
            inspection=insp, item_id=item_id, item_label=item_label,
            original_name=(getattr(uploaded, 'name', '') or 'archivo')[:240],
            notes=(request.data.get('notes') or '')[:400],
            captured_at=_parse_day(request.data.get('captured_at')) or date.today(),
            file=uploaded, uploaded_by=_user(request),
        )
        return Response(InspectionFileSerializer(obj, context={'request': request}).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['delete'], url_path='evidences/(?P<file_id>[^/.]+)')
    def remove_evidence(self, request, tenant_id=None, pk=None, file_id=None):
        insp = self.get_object()
        if insp.status == 'completada':
            return Response({'detail': 'La inspección ya está completada: sus evidencias no se pueden modificar.'}, status=400)
        obj = insp.evidences.filter(id=file_id).first()
        if not obj:
            return Response({'detail': 'Evidencia no encontrada.'}, status=404)
        if obj.file:
            obj.file.delete(save=False)
        obj.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['post'], url_path='complete')
    def complete(self, request, tenant_id=None, pk=None):
        insp = self.get_object()
        if insp.status == 'completada':
            raise ValidationError({'detail': 'La inspección ya está completada.'})
        stats = rental_ops.score_results(insp.results or [])
        with_ev = set(insp.evidences.values_list('item_id', flat=True))
        missing = [
            r.get('label') or r.get('id') for r in (insp.results or [])
            if r.get('require_evidence') and r.get('result') in ('ok', 'falla') and r.get('id') not in with_ev
        ]
        if missing:
            raise ValidationError({'detail': 'Falta evidencia (foto o archivo) en: ' + '; '.join(missing[:5]) + ('…' if len(missing) > 5 else '')})
        if stats['pending'] and not request.data.get('force'):
            raise ValidationError({'detail': f"Faltan {stats['pending']} punto(s) por revisar."})
        insp.status = 'completada'
        insp.completed_at = timezone.now()
        insp.score = stats['score']
        insp.save()
        created = []
        if request.data.get('create_orders', True):
            created = rental_ops.create_works_from_inspection(insp, user=_user(request))
        _audit(request, 'update', f'Inspección completada {insp.folio}', tenant_id, 'RentalInspection', insp.id, insp.name)
        insp = self.get_queryset().get(pk=insp.pk)
        return Response({
            'inspection': InspectionSerializer(insp, context={'request': request}).data,
            'orders_created': [w.folio for w in created],
        })


# ─── Ajustes (SLA y portal) ──────────────────────────────────────────────────

def _mode_payload(tenant):
    from .models import RentalContract, RentalProperty
    from .rental_mode import LEASE_KINDS, leasing_config
    cfg = leasing_config(tenant)
    live = RentalContract.objects.filter(tenant=tenant, kind__in=LEASE_KINDS).exclude(
        status__in=('cancelado', 'finalizado', 'borrador', 'renovado'),
    ).count()
    props = RentalProperty.objects.filter(tenant=tenant)
    return {
        'leasing_enabled': cfg['leasing_enabled'],
        'off_modules': cfg['off_modules'],
        'effective_off_modules': cfg['effective_off'],
        'live_lease_contracts': live,
        'properties_total': props.count(),
        'properties_operation_only': props.filter(usage='operacion').count(),
    }


def _settings_payload(tenant, settings_obj):
    return {
        'mode': _mode_payload(tenant),
        'portal_enabled': settings_obj.portal_enabled,
        'portal_token': settings_obj.portal_token,
        'portal_path': f'/solicitud/{settings_obj.portal_token}',
        'portal_welcome': settings_obj.portal_welcome,
        'notify_email': settings_obj.notify_email,
        'sla': rental_ops.sla_table(tenant),
        'sla_defaults': rental_ops.DEFAULT_SLA,
    }


class OpsSettingsView(APIView):
    permission_classes = [RentalAccess('rentas_config', 'rentas_mantenimiento', 'rentas_solicitudes')]

    def _tenant(self, tenant_id):
        tenant = Tenant.objects.get(id=tenant_id)
        _require_rentas(tenant)
        return tenant

    def get(self, request, tenant_id):
        tenant = self._tenant(tenant_id)
        return Response(_settings_payload(tenant, rental_ops.get_settings(tenant)))

    def patch(self, request, tenant_id):
        tenant = self._tenant(tenant_id)
        d = request.data
        # El modo de operación es configuración del espacio (solo administración);
        # SLA y portal también los puede ajustar quien dirige el mantenimiento.
        needs_config = 'leasing_enabled' in d or 'off_modules' in d
        allowed = can_write(request.user, tenant_id, 'rentas_config') or (
            not needs_config and can_write(request.user, tenant_id)
        )
        if not allowed:
            return Response({'detail': 'No tienes permiso para modificar los ajustes.'}, status=403)
        obj = rental_ops.get_settings(tenant)
        if 'leasing_enabled' in d or 'off_modules' in d:
            from .rental_mode import LEASING_OPTIONAL_MODULES, leasing_config
            cfg = leasing_config(tenant)
            enabled = bool(d['leasing_enabled']) if 'leasing_enabled' in d else cfg['leasing_enabled']
            off = cfg['off_modules']
            if 'off_modules' in d:
                raw = d['off_modules']
                if not isinstance(raw, list):
                    return Response({'off_modules': 'Debe ser una lista de módulos.'}, status=400)
                off = [m for m in LEASING_OPTIONAL_MODULES if m in raw]
            if cfg['leasing_enabled'] and not enabled:
                live = _mode_payload(tenant)['live_lease_contracts']
                if live:
                    return Response({'leasing_enabled': (
                        f'Tienes {live} contrato(s) de renta vigente(s). Finalízalos o cancélalos antes de '
                        'operar tus propiedades sin rentas.'
                    )}, status=400)
            rs = dict(tenant.rental_settings or {})
            rs['leasing_enabled'] = enabled
            rs['off_modules'] = off
            tenant.rental_settings = rs
            tenant.save(update_fields=['rental_settings', 'updated_at'])
            _audit(request, 'update', f'Modo de operación de propiedades: rentas {"activas" if enabled else "desactivadas"}',
                   tenant.id, 'Tenant', tenant.id, tenant.name)
        if 'portal_enabled' in d:
            obj.portal_enabled = bool(d['portal_enabled'])
        if 'portal_welcome' in d:
            obj.portal_welcome = str(d['portal_welcome'] or '')[:300]
        if 'notify_email' in d:
            email = str(d['notify_email'] or '').strip()
            if email:
                from django.core.exceptions import ValidationError as DjValidationError
                from django.core.validators import validate_email
                try:
                    validate_email(email)
                except DjValidationError:
                    return Response({'notify_email': 'Correo no válido.'}, status=400)
            obj.notify_email = email
        if isinstance(d.get('sla'), dict):
            clean = {}
            for prio in rental_ops.PRIORITIES:
                cur = d['sla'].get(prio) or {}
                base = rental_ops.DEFAULT_SLA[prio]
                resp = rental_ops._pos_int(cur.get('response_h'), base['response_h'])
                reso = rental_ops._pos_int(cur.get('resolution_h'), base['resolution_h'])
                if resp > reso:
                    return Response({'sla': f'En {prio}, la respuesta no puede tardar más que la resolución.'}, status=400)
                clean[prio] = {'response_h': min(resp, 9999), 'resolution_h': min(reso, 99999)}
            obj.sla = clean
        obj.save()
        return Response(_settings_payload(tenant, obj))

    def post(self, request, tenant_id):
        """Regenera el enlace público del portal."""
        tenant = self._tenant(tenant_id)
        if not (can_write(request.user, tenant_id, 'rentas_config') or can_write(request.user, tenant_id)):
            return Response({'detail': 'No tienes permiso para modificar los ajustes.'}, status=403)
        from .models import _rental_portal_token
        obj = rental_ops.get_settings(tenant)
        obj.portal_token = _rental_portal_token()
        obj.save(update_fields=['portal_token', 'updated_at'])
        return Response(_settings_payload(tenant, obj))


# ─── Indicadores ─────────────────────────────────────────────────────────────

class OpsIndicatorsView(APIView):
    permission_classes = [RentalAccess('rentas_indicadores')]

    def get(self, request, tenant_id):
        tenant = Tenant.objects.get(id=tenant_id)
        _require_rentas(tenant)
        try:
            months = max(1, min(24, int(request.query_params.get('months') or 6)))
        except ValueError:
            months = 6
        from .rental_ops_indicators import build_indicators
        return Response(build_indicators(tenant, months))


# ─── Portal público de solicitudes ───────────────────────────────────────────

class PortalThrottle(AnonRateThrottle):
    rate = '20/hour'
    scope = 'rental_portal'


class PublicPortalView(APIView):
    """GET: datos del formulario. POST: crea la solicitud. Sin autenticación (enlace con token)."""
    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_classes = [PortalThrottle]

    def _settings(self, token):
        obj = RentalOpsSettings.objects.select_related('tenant').filter(portal_token=token).first()
        if not obj or not obj.portal_enabled or obj.tenant.workspace_type != 'rentas' or not obj.tenant.is_active:
            return None
        return obj

    def get(self, request, token):
        obj = self._settings(token)
        if not obj:
            return Response({'detail': 'El portal de solicitudes no está disponible.'}, status=404)
        tenant = obj.tenant
        folio = (request.query_params.get('folio') or '').strip()
        email = (request.query_params.get('email') or '').strip().lower()
        if folio:
            req = RentalServiceRequest.objects.filter(
                tenant=tenant, folio__iexact=folio, requester_email__iexact=email,
            ).select_related('property').first() if email else None
            if not req:
                return Response({'detail': 'No encontramos una solicitud con ese folio y correo.'}, status=404)
            return Response({
                'folio': req.folio, 'title': req.title, 'status': req.status,
                'status_label': req.get_status_display(), 'property': req.property.name,
                'created_at': req.created_at, 'resolved_at': req.resolved_at,
                'resolution_notes': req.resolution_notes if req.status in ('resuelta', 'cerrada') else '',
            })
        props = RentalProperty.objects.filter(tenant=tenant, is_active=True).exclude(status='inactiva').order_by('code').prefetch_related('spaces')
        cats = RentalMaintenanceCategory.objects.filter(tenant=tenant, is_active=True)
        return Response({
            'name': tenant.name,
            'welcome': obj.portal_welcome,
            'properties': [{
                'id': str(p.id), 'code': p.code, 'name': p.name,
                'spaces': [
                    {'id': str(sp.id), 'code': sp.code, 'name': sp.name}
                    for sp in p.spaces.all() if sp.is_active and sp.status != 'inactivo'
                ] if p.tenancy_model == 'multi' else [],
            } for p in props],
            'categories': [{'id': str(c.id), 'name': c.name} for c in cats],
        })

    def post(self, request, token):
        obj = self._settings(token)
        if not obj:
            return Response({'detail': 'El portal de solicitudes no está disponible.'}, status=404)
        tenant = obj.tenant
        d = request.data
        if str(d.get('website') or '').strip():
            return Response({'folio': 'SOL-0000', 'message': 'Recibida.'}, status=201)  # honeypot
        name = str(d.get('requester_name') or '').strip()
        title = str(d.get('title') or '').strip()
        email = str(d.get('requester_email') or '').strip()
        phone = str(d.get('requester_phone') or '').strip()
        errors = {}
        if not name:
            errors['requester_name'] = 'Escribe tu nombre.'
        if not title:
            errors['title'] = 'Describe brevemente el problema.'
        if not email and not phone:
            errors['requester_email'] = 'Déjanos un correo o teléfono para contactarte.'
        if email:
            from django.core.exceptions import ValidationError as DjValidationError
            from django.core.validators import validate_email
            try:
                validate_email(email)
            except DjValidationError:
                errors['requester_email'] = 'Correo no válido.'
        prop = RentalProperty.objects.filter(tenant=tenant, pk=d.get('property'), is_active=True).first() if d.get('property') else None
        if not prop:
            errors['property'] = 'Selecciona el inmueble o unidad.'
        if errors:
            return Response(errors, status=400)
        category = None
        if d.get('category'):
            category = RentalMaintenanceCategory.objects.filter(tenant=tenant, pk=d['category']).first()
        priority = d.get('priority') if d.get('priority') in ('media', 'alta', 'urgente') else 'media'
        party = None
        if email:
            party = RentalParty.objects.filter(tenant=tenant, email__iexact=email).first()
        space = None
        if d.get('space'):
            space = prop.spaces.filter(pk=d['space'], is_active=True).first()
        req = RentalServiceRequest.objects.create(
            tenant=tenant, folio=rental_ops.next_request_folio(tenant), property=prop, space=space,
            requester_party=party, requester_name=name[:200], requester_email=email[:254],
            requester_phone=phone[:40], channel='portal', category=category,
            title=title[:240], description=str(d.get('description') or '')[:4000], priority=priority,
        )
        rental_ops.apply_request_sla(req, tenant)
        req.save(update_fields=['response_due_at', 'resolution_due_at'])
        try:
            from .rental_notifications import notify_rental_staff
            notify_rental_staff(
                tenant, 'rental_request_new', f'Nueva solicitud {req.folio}',
                f'{prop.code}{(" / " + space.code) if space else ""} · {title} (prioridad {req.get_priority_display().lower()}) — {name}',
            )
            if obj.notify_email:
                from .rental_notifications import email_contacts
                email_contacts(
                    tenant, [(obj.notify_email, 'Equipo')], 'rental_request_new',
                    f'Nueva solicitud {req.folio}', f'{prop.code} · {title} — {name} ({phone or email})',
                )
        except Exception:  # pragma: no cover - el aviso nunca debe romper el alta
            pass
        return Response({'folio': req.folio, 'message': 'Recibimos tu solicitud. Te contactaremos pronto.'}, status=201)
