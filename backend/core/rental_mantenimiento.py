"""Mantenimiento de propiedades: preventivos, correctivos, catálogos y proveedores."""
from __future__ import annotations

import os
from datetime import date, datetime, time, timedelta

from django.db.models import Count, Q
from django.utils import timezone
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from .asambleas import media_api_url
from .models import (
    RentalAsset, RentalMaintenancePlan, RentalServiceRequest, RentalInspection,
    RentalMaintenanceCategory, RentalMaintenanceEvidence, RentalMaintenanceProvider,
    RentalMaintenanceProviderContact, RentalMaintenanceProviderDocument,
    RentalMaintenanceWork, RentalMaintenanceWorkType, RentalProperty, Tenant,
)
from .rental_access import OPERATE, WRITE, RentalAccess, has_level
from .rental_views import _require_rentas
from . import rental_ops, rental_spaces

FILE_MAX = 20 * 1024 * 1024
FILE_EXTS = {'.pdf', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.heic', '.doc', '.docx', '.xls', '.xlsx'}

GENERAL_DOCS_FISICA = [
    ('identificacion', 'Identificación oficial'),
    ('rfc_csf', 'Constancia de situación fiscal'),
    ('curp', 'CURP'),
    ('comprobante_domicilio', 'Comprobante de domicilio'),
    ('opinion_sat', 'Opinión de cumplimiento SAT'),
    ('estado_cuenta', 'Estado de cuenta'),
    ('contrato', 'Contrato de servicios'),
]
GENERAL_DOCS_MORAL = [
    ('acta_constitutiva', 'Acta constitutiva'),
    ('poder_notarial', 'Poder notarial del representante'),
    ('rfc_csf', 'Constancia de situación fiscal'),
    ('identificacion_rep', 'Identificación del representante'),
    ('comprobante_domicilio', 'Comprobante de domicilio'),
    ('opinion_sat', 'Opinión de cumplimiento SAT'),
    ('estado_cuenta', 'Estado de cuenta'),
    ('contrato', 'Contrato de servicios'),
]
REPSE_DOCS = [
    ('constancia_repse', 'Constancia de inscripción REPSE'),
    ('icsoe', 'ICSOE'),
    ('sisub', 'SISUB'),
    ('opinion_imss', 'Opinión de cumplimiento IMSS'),
    ('opinion_infonavit', 'Opinión de cumplimiento INFONAVIT'),
    ('contrato_especializado', 'Contrato de servicios especializados'),
    ('listado_trabajadores', 'Listado de trabajadores'),
]


def general_doc_kinds(person_type):
    return GENERAL_DOCS_FISICA if person_type == 'fisica' else GENERAL_DOCS_MORAL


def checklist_for(provider):
    by_section = {}
    for d in provider.documents.all():
        by_section.setdefault((d.section, d.kind), []).append(d)

    def items(section, kinds):
        out = []
        for kind, label in kinds:
            found = by_section.get((section, kind), [])
            out.append({
                'kind': kind,
                'label': label,
                'required': True,
                'uploaded': bool(found),
                'count': len(found),
            })
        return out

    general = items('general', general_doc_kinds(provider.person_type))
    repse = items('repse', REPSE_DOCS) if provider.is_repse else []
    return {
        'general': general,
        'repse': repse,
        'missing_general': [i['kind'] for i in general if not i['uploaded']],
        'missing_repse': [i['kind'] for i in repse if not i['uploaded']],
    }

DEFAULT_CATEGORIES = [
    ('plomeria', 'Plomería', '#0369a1'),
    ('electrico', 'Eléctrico', '#b45309'),
    ('hvac', 'Aire acondicionado / HVAC', '#0f766e'),
    ('pintura', 'Pintura', '#7c3aed'),
    ('jardineria', 'Jardinería', '#15803d'),
    ('limpieza', 'Limpieza profunda', '#0ea5e9'),
    ('cerradura', 'Cerraduras y seguridad', '#334155'),
    ('albanileria', 'Albañilería', '#92400e'),
    ('carpinteria', 'Carpintería', '#9a3412'),
    ('electrodomesticos', 'Electrodomésticos', '#be123c'),
    ('fumigacion', 'Fumigación', '#4d7c0f'),
    ('otro', 'Otro', '#64748b'),
]

DEFAULT_WORK_TYPES = [
    ('plomeria', 'preventivo', 'Revisión de tuberías e instalaciones', 'semestral'),
    ('plomeria', 'correctivo', 'Fuga, destape o desazolve', 'unica'),
    ('electrico', 'preventivo', 'Revisión de contactos e iluminación', 'anual'),
    ('electrico', 'correctivo', 'Falla eléctrica o corto', 'unica'),
    ('hvac', 'preventivo', 'Limpieza y cambio de filtros', 'trimestral'),
    ('hvac', 'correctivo', 'Reparación de minisplit o clima', 'unica'),
    ('pintura', 'preventivo', 'Retoque de pintura', 'anual'),
    ('pintura', 'correctivo', 'Pintura general o por humedad', 'unica'),
    ('jardineria', 'preventivo', 'Poda y riego programado', 'mensual'),
    ('limpieza', 'preventivo', 'Limpieza de entrega / vacancia', 'unica'),
    ('cerradura', 'correctivo', 'Cambio o reparación de cerradura', 'unica'),
    ('albanileria', 'correctivo', 'Grieta, aplanado o impermeabilización', 'unica'),
    ('carpinteria', 'correctivo', 'Puertas, closets o pisos', 'unica'),
    ('electrodomesticos', 'correctivo', 'Reparación de electrodoméstico', 'unica'),
    ('fumigacion', 'preventivo', 'Fumigación programada', 'trimestral'),
    ('otro', 'ambos', 'Trabajo general', 'unica'),
]


def _audit(request, action, description, tenant_id, object_type, object_id, object_repr):
    from .views import _audit_log
    _audit_log(
        request, 'rentas_mantenimiento', action, description,
        tenant_id=tenant_id, object_type=object_type,
        object_id=str(object_id) if object_id else '',
        object_repr=object_repr or '',
    )


OPS_MODULES = (
    'rentas_mantenimiento', 'rentas_solicitudes', 'rentas_preventivo', 'rentas_activos', 'rentas_inspecciones',
)


def can_write(user, tenant_id, module='rentas_mantenimiento'):
    return has_level(user, tenant_id, module, WRITE)


def can_operate(user, tenant_id, module='rentas_mantenimiento'):
    """Ejecución en campo: avance, evidencias, inspecciones (incluye a quien puede escribir)."""
    return has_level(user, tenant_id, module, OPERATE)


# Campos que un perfil de ejecución (técnico) puede actualizar en una orden.
WORK_OPERATE_FIELDS = frozenset({
    'status', 'work_notes', 'performed_date', 'checklist', 'parts_cost', 'labor_cost', 'cost',
})


def next_folio(tenant):
    year = date.today().year
    prefix = f'{year}-'
    last = (
        RentalMaintenanceWork.objects
        .filter(tenant=tenant, folio__startswith=prefix)
        .order_by('-folio')
        .values_list('folio', flat=True)
        .first()
    )
    seq = 1
    if last:
        try:
            seq = int(str(last).split('-')[-1]) + 1
        except (TypeError, ValueError):
            seq = RentalMaintenanceWork.objects.filter(tenant=tenant, folio__startswith=prefix).count() + 1
    return f'{year}-{seq:04d}'


def ensure_default_catalogs(tenant):
    if RentalMaintenanceCategory.objects.filter(tenant=tenant).exists():
        return
    cats = {}
    for i, (slug, name, color) in enumerate(DEFAULT_CATEGORIES):
        cats[slug] = RentalMaintenanceCategory.objects.create(
            tenant=tenant, name=name, slug=slug, color=color, sort_order=i,
        )
    for slug, kind, name, freq in DEFAULT_WORK_TYPES:
        cat = cats.get(slug)
        if not cat:
            continue
        RentalMaintenanceWorkType.objects.create(
            tenant=tenant, category=cat, name=name, kind=kind, default_frequency=freq,
        )


class _RentasMixin:
    permission_classes = [RentalAccess(*OPS_MODULES)]

    def get_tenant(self):
        tenant = Tenant.objects.get(id=self.kwargs['tenant_id'])
        _require_rentas(tenant)
        return tenant

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        self.get_tenant()


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = RentalMaintenanceCategory
        fields = ('id', 'name', 'slug', 'color', 'sort_order', 'is_active', 'created_at')
        read_only_fields = ('id', 'created_at')


class WorkTypeSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)

    class Meta:
        model = RentalMaintenanceWorkType
        fields = (
            'id', 'category', 'category_name', 'name', 'kind',
            'default_frequency', 'is_active', 'created_at',
        )
        read_only_fields = ('id', 'created_at')


class ProviderContactSerializer(serializers.ModelSerializer):
    class Meta:
        model = RentalMaintenanceProviderContact
        fields = (
            'id', 'name', 'role', 'email', 'phone', 'mobile',
            'is_primary', 'notes', 'sort_order', 'created_at',
        )
        read_only_fields = ('id', 'created_at')


class ProviderDocumentSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()
    uploaded_by_name = serializers.SerializerMethodField()
    kind_label = serializers.CharField(source='get_kind_display', read_only=True)
    section_label = serializers.CharField(source='get_section_display', read_only=True)

    class Meta:
        model = RentalMaintenanceProviderDocument
        fields = (
            'id', 'section', 'section_label', 'kind', 'kind_label',
            'original_name', 'notes', 'expires_at', 'file_url',
            'uploaded_by_name', 'created_at',
        )
        read_only_fields = ('id', 'created_at')

    def get_file_url(self, obj):
        return media_api_url(obj.file, self.context.get('request'))

    def get_uploaded_by_name(self, obj):
        u = obj.uploaded_by
        return (getattr(u, 'name', None) or getattr(u, 'email', '') or '') if u else ''


PROVIDER_FIELDS = (
    'id', 'name', 'trade_name', 'person_type',
    'contact_name', 'email', 'phone', 'mobile',
    'rfc', 'curp', 'tax_regime', 'legal_rep_name', 'legal_rep_rfc', 'website',
    'notes', 'category_ids', 'status', 'is_active',
    'has_expediente', 'expediente_opened_at',
    'street', 'ext_number', 'int_number', 'colonia', 'city', 'state', 'zip_code', 'country',
    'bank_name', 'bank_clabe', 'bank_account', 'bank_beneficiary', 'bank_account_type',
    'is_repse', 'repse_registro', 'repse_folio', 'repse_activity',
    'repse_registered_at', 'repse_expires_at', 'repse_status', 'repse_notes',
    'contact_count', 'document_count',
    'created_at', 'updated_at',
)


class ProviderSerializer(serializers.ModelSerializer):
    contact_count = serializers.IntegerField(read_only=True, default=0)
    document_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = RentalMaintenanceProvider
        fields = PROVIDER_FIELDS
        read_only_fields = ('id', 'has_expediente', 'expediente_opened_at', 'created_at', 'updated_at')


class ProviderDetailSerializer(ProviderSerializer):
    contacts = ProviderContactSerializer(many=True, read_only=True)
    documents = ProviderDocumentSerializer(many=True, read_only=True)
    checklist = serializers.SerializerMethodField()

    class Meta(ProviderSerializer.Meta):
        fields = PROVIDER_FIELDS + ('contacts', 'documents', 'checklist')

    def get_checklist(self, obj):
        return checklist_for(obj)


class EvidenceSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()
    uploaded_by_name = serializers.SerializerMethodField()

    class Meta:
        model = RentalMaintenanceEvidence
        fields = ('id', 'kind', 'original_name', 'notes', 'file_url', 'uploaded_by_name', 'captured_at', 'created_at')
        read_only_fields = ('id', 'created_at')

    def get_file_url(self, obj):
        return media_api_url(obj.file, self.context.get('request'))

    def get_uploaded_by_name(self, obj):
        u = obj.uploaded_by
        return (getattr(u, 'name', None) or getattr(u, 'email', '') or '') if u else ''


def work_sla_state(w):
    """cumplida | tarde | vencida | por_vencer | en_tiempo | ''."""
    if not w.due_at or w.status == 'cancelado':
        return ''
    if w.status == 'realizado':
        done = w.completed_at or (timezone.make_aware(datetime.combine(w.performed_date, time(12, 0))) if w.performed_date else None)
        if not done:
            return 'cumplida'
        return 'cumplida' if done <= w.due_at else 'tarde'
    now = timezone.now()
    if now > w.due_at:
        return 'vencida'
    if w.due_at - now <= timedelta(hours=24):
        return 'por_vencer'
    return 'en_tiempo'


class WorkSerializer(serializers.ModelSerializer):
    property_code = serializers.CharField(source='property.code', read_only=True)
    property_name = serializers.CharField(source='property.name', read_only=True)
    space_code = serializers.CharField(source='space.code', read_only=True, default='')
    space_name = serializers.CharField(source='space.label', read_only=True, default='')
    category_name = serializers.CharField(source='category.name', read_only=True, default='')
    category_color = serializers.CharField(source='category.color', read_only=True, default='')
    work_type_name = serializers.CharField(source='work_type.name', read_only=True, default='')
    provider_name = serializers.SerializerMethodField()
    evidence_count = serializers.IntegerField(read_only=True)
    evidences = EvidenceSerializer(many=True, read_only=True)
    created_by_name = serializers.SerializerMethodField()
    asset_code = serializers.CharField(source='asset.code', read_only=True, default='')
    asset_name = serializers.CharField(source='asset.name', read_only=True, default='')
    plan_name = serializers.CharField(source='plan.name', read_only=True, default='')
    request_folio = serializers.CharField(source='service_request.folio', read_only=True, default='')
    inspection_folio = serializers.CharField(source='inspection.folio', read_only=True, default='')
    capex_code = serializers.CharField(source='capex_project.code', read_only=True, default='')
    capex_name = serializers.CharField(source='capex_project.name', read_only=True, default='')
    sla_state = serializers.SerializerMethodField()

    class Meta:
        model = RentalMaintenanceWork
        fields = (
            'id', 'folio', 'kind', 'status', 'priority',
            'property', 'property_code', 'property_name', 'space', 'space_code', 'space_name',
            'category', 'category_name', 'category_color',
            'work_type', 'work_type_name',
            'provider', 'provider_name', 'vendor_name',
            'title', 'description', 'work_notes',
            'reported_by', 'assigned_to',
            'scheduled_date', 'performed_date', 'next_due_date', 'frequency', 'cost',
            'evidence_count', 'evidences', 'created_by_name',
            'asset', 'asset_code', 'asset_name', 'plan', 'plan_name',
            'service_request', 'request_folio', 'inspection', 'inspection_folio',
            'due_at', 'started_at', 'completed_at', 'sla_state',
            'estimated_cost', 'parts_cost', 'labor_cost', 'checklist',
            'capex_project', 'capex_code', 'capex_name',
            'created_at', 'updated_at',
        )
        read_only_fields = (
            'id', 'folio', 'created_at', 'updated_at', 'plan', 'service_request',
            'inspection', 'started_at', 'completed_at',
        )

    def get_sla_state(self, obj):
        return work_sla_state(obj)

    def validate_checklist(self, value):
        out = []
        for it in value or []:
            if isinstance(it, dict) and str(it.get('label', '')).strip():
                out.append({'label': str(it['label']).strip()[:200], 'done': bool(it.get('done'))})
        return out

    def validate(self, attrs):
        parts, labor = attrs.get('parts_cost'), attrs.get('labor_cost')
        if attrs.get('cost') is None and (parts is not None or labor is not None):
            attrs['cost'] = (parts or 0) + (labor or 0)
        return attrs

    def get_provider_name(self, obj):
        if obj.provider_id:
            return obj.provider.trade_name or obj.provider.name
        return obj.vendor_name or ''

    def get_created_by_name(self, obj):
        u = obj.created_by
        return (getattr(u, 'name', None) or getattr(u, 'email', '') or '') if u else ''


class RentalMaintCategoryViewSet(_RentasMixin, viewsets.ModelViewSet):
    serializer_class = CategorySerializer
    queryset = RentalMaintenanceCategory.objects.all()
    pagination_class = None

    def get_queryset(self):
        tenant = self.get_tenant()
        ensure_default_catalogs(tenant)
        return RentalMaintenanceCategory.objects.filter(tenant=tenant)

    def perform_create(self, serializer):
        serializer.save(tenant=self.get_tenant())


class RentalMaintWorkTypeViewSet(_RentasMixin, viewsets.ModelViewSet):
    serializer_class = WorkTypeSerializer
    queryset = RentalMaintenanceWorkType.objects.all()
    pagination_class = None

    def get_queryset(self):
        tenant = self.get_tenant()
        ensure_default_catalogs(tenant)
        qs = RentalMaintenanceWorkType.objects.filter(tenant=tenant).select_related('category')
        cat = self.request.query_params.get('category')
        kind = self.request.query_params.get('kind')
        if cat:
            qs = qs.filter(category_id=cat)
        if kind in ('preventivo', 'correctivo'):
            qs = qs.filter(Q(kind=kind) | Q(kind='ambos'))
        return qs

    def perform_create(self, serializer):
        tenant = self.get_tenant()
        cat = serializer.validated_data.get('category')
        if cat and cat.tenant_id != tenant.id:
            raise ValidationError({'category': 'La categoría no pertenece a este espacio.'})
        serializer.save(tenant=tenant)


class RentalMaintProviderViewSet(_RentasMixin, viewsets.ModelViewSet):
    serializer_class = ProviderSerializer
    queryset = RentalMaintenanceProvider.objects.all()
    pagination_class = None
    http_method_names = ['get', 'post', 'patch', 'delete', 'head', 'options']

    def get_queryset(self):
        qs = (
            RentalMaintenanceProvider.objects
            .filter(tenant=self.get_tenant())
            .annotate(
                contact_count=Count('contacts', distinct=True),
                document_count=Count('documents', distinct=True),
            )
        )
        if self.action in (
            'retrieve', 'expediente', 'open_expediente',
            'contacts', 'documents', 'contact_item', 'destroy_document',
        ):
            qs = qs.prefetch_related('contacts', 'documents')
        return qs

    def get_serializer_class(self):
        if self.action in ('retrieve', 'expediente', 'open_expediente'):
            return ProviderDetailSerializer
        return ProviderSerializer

    def _full(self, instance):
        obj = (
            RentalMaintenanceProvider.objects
            .prefetch_related('contacts', 'documents')
            .annotate(
                contact_count=Count('contacts', distinct=True),
                document_count=Count('documents', distinct=True),
            )
            .get(pk=instance.pk)
        )
        return ProviderDetailSerializer(obj, context={'request': self.request}).data

    def perform_create(self, serializer):
        serializer.save(tenant=self.get_tenant())

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        _audit(
            request, 'create', f'Proveedor {serializer.instance.name}',
            self.kwargs['tenant_id'], 'RentalMaintenanceProvider',
            serializer.instance.id, serializer.instance.name,
        )
        return Response(self._full(serializer.instance), status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        if not can_write(request.user, self.kwargs['tenant_id']):
            return Response({'detail': 'No puedes editar proveedores.'}, status=403)
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        data = request.data.copy() if hasattr(request.data, 'copy') else dict(request.data)
        extra = {}
        if data.get('is_repse') in (True, 'true', '1', 1):
            if instance.repse_status == 'no_aplica' and not data.get('repse_status'):
                data['repse_status'] = 'pendiente'
            if not instance.has_expediente:
                extra['has_expediente'] = True
                extra['expediente_opened_at'] = timezone.now()
        elif data.get('is_repse') in (False, 'false', '0', 0):
            if not data.get('repse_status'):
                data['repse_status'] = 'no_aplica'
        serializer = self.get_serializer(instance, data=data, partial=partial)
        serializer.is_valid(raise_exception=True)
        provider = serializer.save()
        if extra:
            for key, value in extra.items():
                setattr(provider, key, value)
            provider.save(update_fields=[*extra.keys(), 'updated_at'])
        _audit(
            request, 'update', f'Proveedor actualizado {provider.name}',
            self.kwargs['tenant_id'], 'RentalMaintenanceProvider',
            provider.id, provider.name,
        )
        return Response(self._full(provider))

    def perform_destroy(self, instance):
        name = instance.name
        for doc in instance.documents.all():
            if doc.file:
                doc.file.delete(save=False)
        instance.delete()
        _audit(
            self.request, 'delete', f'Proveedor eliminado {name}',
            self.kwargs['tenant_id'], 'RentalMaintenanceProvider', instance.id, name,
        )

    def _require_write(self):
        if not can_write(self.request.user, self.kwargs['tenant_id']):
            return Response({'detail': 'No puedes modificar el expediente.'}, status=403)
        return None

    def _seed_primary_contact(self, provider):
        if provider.contacts.exists():
            return
        name = (provider.contact_name or provider.legal_rep_name or '').strip()
        if not name and not provider.email and not provider.phone:
            return
        RentalMaintenanceProviderContact.objects.create(
            provider=provider,
            name=name or provider.name,
            role='Contacto principal',
            email=provider.email or '',
            phone=provider.phone or '',
            mobile=provider.mobile or '',
            is_primary=True,
        )

    @action(detail=True, methods=['post'], url_path='open-expediente')
    def open_expediente(self, request, tenant_id, pk=None):
        denied = self._require_write()
        if denied:
            return denied
        provider = self.get_object()
        if not provider.has_expediente:
            provider.has_expediente = True
            provider.expediente_opened_at = timezone.now()
            provider.save(update_fields=['has_expediente', 'expediente_opened_at', 'updated_at'])
        self._seed_primary_contact(provider)
        _audit(
            request, 'update', f'Expediente digital abierto: {provider.name}',
            tenant_id, 'RentalMaintenanceProvider', provider.id, provider.name,
        )
        return Response(self._full(provider))

    @action(detail=True, methods=['get', 'patch'], url_path='expediente')
    def expediente(self, request, tenant_id, pk=None):
        provider = self.get_object()
        if request.method == 'GET':
            return Response(self._full(provider))
        denied = self._require_write()
        if denied:
            return denied
        if not provider.has_expediente:
            provider.has_expediente = True
            provider.expediente_opened_at = timezone.now()
            provider.save(update_fields=['has_expediente', 'expediente_opened_at', 'updated_at'])
        return self.update(request, tenant_id=tenant_id, pk=pk, partial=True)

    @action(detail=True, methods=['get', 'post'], url_path='contacts')
    def contacts(self, request, tenant_id, pk=None):
        provider = self.get_object()
        if request.method == 'GET':
            return Response(ProviderContactSerializer(provider.contacts.all(), many=True).data)
        denied = self._require_write()
        if denied:
            return denied
        ser = ProviderContactSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        if ser.validated_data.get('is_primary'):
            provider.contacts.update(is_primary=False)
        ser.save(provider=provider)
        return Response(ser.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['patch', 'delete'], url_path='contacts/(?P<contact_id>[^/.]+)')
    def contact_item(self, request, tenant_id, pk=None, contact_id=None):
        denied = self._require_write()
        if denied:
            return denied
        provider = self.get_object()
        obj = provider.contacts.filter(id=contact_id).first()
        if not obj:
            return Response({'detail': 'Contacto no encontrado.'}, status=404)
        if request.method == 'DELETE':
            obj.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        ser = ProviderContactSerializer(obj, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        if ser.validated_data.get('is_primary'):
            provider.contacts.exclude(id=obj.id).update(is_primary=False)
        ser.save()
        return Response(ser.data)

    @action(detail=True, methods=['get', 'post'], url_path='documents')
    def documents(self, request, tenant_id, pk=None):
        provider = self.get_object()
        if request.method == 'GET':
            return Response(ProviderDocumentSerializer(provider.documents.all(), many=True, context={'request': request}).data)
        denied = self._require_write()
        if denied:
            return denied
        uploaded = request.FILES.get('file') or request.FILES.get('archivo')
        if not uploaded:
            return Response({'detail': 'Adjunta un archivo.'}, status=400)
        name = getattr(uploaded, 'name', '') or 'archivo'
        ext = os.path.splitext(name)[1].lower()
        if ext not in FILE_EXTS:
            return Response({'detail': f'Tipo de archivo no permitido ({ext or "sin extensión"}).'}, status=400)
        if (getattr(uploaded, 'size', 0) or 0) > FILE_MAX:
            return Response({'detail': 'El archivo no puede superar 20 MB.'}, status=400)
        section = (request.data.get('section') or 'general').strip()
        if section not in dict(RentalMaintenanceProviderDocument.SECTION_CHOICES):
            section = 'general'
        kind = (request.data.get('kind') or 'otro').strip()
        if kind not in dict(RentalMaintenanceProviderDocument.KIND_CHOICES):
            kind = 'otro'
        expires_raw = (request.data.get('expires_at') or '').strip()
        expires = None
        if expires_raw:
            try:
                expires = date.fromisoformat(expires_raw[:10])
            except ValueError:
                expires = None
        user = request.user if getattr(request.user, 'is_authenticated', False) else None
        obj = RentalMaintenanceProviderDocument.objects.create(
            provider=provider, section=section, kind=kind,
            original_name=name[:240],
            notes=(request.data.get('notes') or '')[:400],
            expires_at=expires, file=uploaded, uploaded_by=user,
        )
        if not provider.has_expediente:
            provider.has_expediente = True
            provider.expediente_opened_at = timezone.now()
            provider.save(update_fields=['has_expediente', 'expediente_opened_at', 'updated_at'])
        return Response(ProviderDocumentSerializer(obj, context={'request': request}).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['delete'], url_path='documents/(?P<doc_id>[^/.]+)')
    def destroy_document(self, request, tenant_id, pk=None, doc_id=None):
        denied = self._require_write()
        if denied:
            return denied
        provider = self.get_object()
        obj = provider.documents.filter(id=doc_id).first()
        if not obj:
            return Response({'detail': 'Documento no encontrado.'}, status=404)
        if obj.file:
            obj.file.delete(save=False)
        obj.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class RentalMaintWorkViewSet(_RentasMixin, viewsets.ModelViewSet):
    permission_classes = [RentalAccess(
        'rentas_mantenimiento', operate=('update', 'partial_update', 'evidences', 'destroy_evidence'),
    )]
    serializer_class = WorkSerializer
    queryset = RentalMaintenanceWork.objects.all()
    pagination_class = None
    http_method_names = ['get', 'post', 'patch', 'delete', 'head', 'options']

    def get_queryset(self):
        qs = (
            RentalMaintenanceWork.objects
            .filter(tenant=self.get_tenant())
            .select_related('property', 'space', 'category', 'work_type', 'provider', 'created_by',
                            'asset', 'plan', 'service_request', 'inspection', 'capex_project')
            .annotate(evidence_count=Count('evidences'))
        )
        params = self.request.query_params
        if params.get('capex_project'):
            qs = qs.filter(capex_project_id=params['capex_project'])
        if params.get('asset'):
            qs = qs.filter(asset_id=params['asset'])
        if params.get('priority') in ('baja', 'media', 'alta', 'urgente'):
            qs = qs.filter(priority=params['priority'])
        if params.get('overdue') in ('1', 'true'):
            qs = qs.filter(status__in=('planeado', 'en_curso'), due_at__lt=timezone.now())
        if params.get('source') == 'plan':
            qs = qs.filter(plan__isnull=False)
        elif params.get('source') == 'request':
            qs = qs.filter(service_request__isnull=False)
        elif params.get('source') == 'inspection':
            qs = qs.filter(inspection__isnull=False)
        if params.get('kind') in ('preventivo', 'correctivo'):
            qs = qs.filter(kind=params['kind'])
        if params.get('status'):
            qs = qs.filter(status=params['status'])
        if params.get('property'):
            qs = qs.filter(property_id=params['property'])
        if params.get('space'):
            qs = qs.filter(space_id=params['space'])
        if params.get('category'):
            qs = qs.filter(category_id=params['category'])
        if params.get('q'):
            q = params['q'].strip()
            qs = qs.filter(
                Q(title__icontains=q) | Q(folio__icontains=q)
                | Q(property__name__icontains=q) | Q(property__code__icontains=q) | Q(space__code__icontains=q)
            )
        return qs

    def _full(self, instance):
        obj = (
            RentalMaintenanceWork.objects
            .select_related('property', 'category', 'work_type', 'provider', 'created_by',
                            'asset', 'plan', 'service_request', 'inspection', 'capex_project')
            .prefetch_related('evidences')
            .annotate(evidence_count=Count('evidences'))
            .get(pk=instance.pk)
        )
        return WorkSerializer(obj, context={'request': self.request}).data

    def _check_asset(self, tenant, prop, asset):
        if asset and (asset.tenant_id != tenant.id or asset.property_id != prop.id):
            raise ValidationError({'asset': 'El activo debe pertenecer a la propiedad seleccionada.'})

    def _check_capex(self, tenant, vd):
        proj = vd.get('capex_project')
        if proj is not None and proj.tenant_id != tenant.id:
            raise ValidationError({'capex_project': 'El proyecto no pertenece a este espacio.'})

    def perform_create(self, serializer):
        tenant = self.get_tenant()
        vd = serializer.validated_data
        prop = vd.get('property')
        if not prop or prop.tenant_id != tenant.id:
            raise ValidationError({'property': 'Selecciona una propiedad de este espacio.'})
        self._check_asset(tenant, prop, vd.get('asset'))
        self._check_capex(tenant, vd)
        rental_spaces.check_space(tenant, prop, vd.get('space'))
        data = dict(rental_spaces.inherit_space(vd, vd.get('asset')))
        now = timezone.now()
        if vd.get('status') == 'realizado':
            if not vd.get('performed_date'):
                data['performed_date'] = date.today()
            data['completed_at'] = now
        if vd.get('status') == 'en_curso':
            data['started_at'] = now
        if not vd.get('due_at'):
            if vd.get('kind', 'correctivo') == 'correctivo':
                hours = rental_ops.sla_for(tenant, vd.get('priority', 'media'))['resolution_h']
                data['due_at'] = now + timedelta(hours=hours)
            elif vd.get('scheduled_date'):
                data['due_at'] = rental_ops.end_of_day(vd['scheduled_date'])
        user = self.request.user if getattr(self.request.user, 'is_authenticated', False) else None
        work = serializer.save(tenant=tenant, folio=next_folio(tenant), created_by=user, **data)
        rental_ops.sync_asset_status(work.asset)
        _audit(self.request, 'create', f'Mantenimiento {work.folio}: {work.title}', tenant.id, 'RentalMaintenanceWork', work.id, work.title)

    def perform_update(self, serializer):
        vd = serializer.validated_data
        inst = serializer.instance
        prop = vd.get('property') or inst.property
        self._check_asset(inst.tenant, prop, vd.get('asset', inst.asset) if 'asset' in vd else inst.asset)
        self._check_capex(inst.tenant, vd)
        rental_spaces.check_space(inst.tenant, prop, vd['space'] if 'space' in vd else inst.space)
        data = {}
        new_status = vd.get('status')
        now = timezone.now()
        if new_status and new_status != inst.status:
            if new_status == 'en_curso' and not inst.started_at:
                data['started_at'] = now
            if new_status == 'realizado':
                data['completed_at'] = now
                if not (vd.get('performed_date') or inst.performed_date):
                    data['performed_date'] = date.today()
            elif inst.status == 'realizado':
                data['completed_at'] = None
        old_asset = inst.asset
        work = serializer.save(**data)
        rental_ops.sync_asset_status(work.asset)
        if old_asset and old_asset != work.asset:
            rental_ops.sync_asset_status(old_asset)
        rental_ops.sync_request_from_work(work)
        _audit(self.request, 'update', f'Mantenimiento actualizado {work.folio}', work.tenant_id, 'RentalMaintenanceWork', work.id, work.title)

    def perform_destroy(self, instance):
        title = instance.title
        folio = instance.folio
        for ev in instance.evidences.all():
            if ev.file:
                ev.file.delete(save=False)
        asset = instance.asset
        instance.delete()
        rental_ops.sync_asset_status(asset)
        _audit(self.request, 'delete', f'Mantenimiento eliminado {folio}: {title}', self.kwargs['tenant_id'], 'RentalMaintenanceWork', instance.id, title)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return Response(self._full(serializer.instance), status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        if not can_write(request.user, self.kwargs['tenant_id']):
            extra = set(request.data.keys()) - WORK_OPERATE_FIELDS
            if extra:
                return Response(
                    {'detail': 'Tu perfil solo puede actualizar el avance, las notas, el checklist y los costos de la orden.'},
                    status=403,
                )
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return Response(self._full(serializer.instance))

    @action(detail=False, methods=['get'], url_path='summary')
    def summary(self, request, tenant_id=None):
        tenant = self.get_tenant()
        qs = RentalMaintenanceWork.objects.filter(tenant=tenant)
        today = date.today()
        return Response({
            'total': qs.count(),
            'preventivo': qs.filter(kind='preventivo').count(),
            'correctivo': qs.filter(kind='correctivo').count(),
            'planeado': qs.filter(status='planeado').count(),
            'en_curso': qs.filter(status='en_curso').count(),
            'realizado': qs.filter(status='realizado').count(),
            'vencidos': qs.filter(kind='preventivo', status__in=('planeado', 'en_curso'), next_due_date__lt=today).count(),
            'sla_vencidas': qs.filter(status__in=('planeado', 'en_curso'), due_at__lt=timezone.now()).count(),
            'abiertas': qs.filter(status__in=('planeado', 'en_curso')).count(),
        })

    @action(detail=True, methods=['get', 'post'], url_path='evidences')
    def evidences(self, request, tenant_id, pk=None):
        work = self.get_object()
        if request.method == 'GET':
            return Response(EvidenceSerializer(work.evidences.all(), many=True, context={'request': request}).data)
        if not can_operate(request.user, tenant_id):
            return Response({'detail': 'No puedes subir evidencias.'}, status=403)
        if work.status == 'cancelado':
            return Response({'detail': 'No se puede agregar evidencia a un trabajo cancelado.'}, status=400)
        uploaded = request.FILES.get('file') or request.FILES.get('archivo')
        if not uploaded:
            return Response({'detail': 'Adjunta un archivo.'}, status=400)
        name = getattr(uploaded, 'name', '') or 'archivo'
        ext = os.path.splitext(name)[1].lower()
        if ext not in FILE_EXTS:
            return Response({'detail': f'Tipo de archivo no permitido ({ext or "sin extensión"}).'}, status=400)
        if (getattr(uploaded, 'size', 0) or 0) > FILE_MAX:
            return Response({'detail': 'El archivo no puede superar 20 MB.'}, status=400)
        kind = (request.data.get('kind') or 'otro').strip()
        if kind not in dict(RentalMaintenanceEvidence.KIND_CHOICES):
            kind = 'otro'
        captured_raw = (request.data.get('captured_at') or '').strip()
        captured = None
        if captured_raw:
            try:
                captured = date.fromisoformat(captured_raw[:10])
            except ValueError:
                captured = None
        if not captured:
            captured = date.today()
        user = request.user if getattr(request.user, 'is_authenticated', False) else None
        obj = RentalMaintenanceEvidence.objects.create(
            work=work, kind=kind, original_name=name[:240],
            notes=(request.data.get('notes') or '')[:400],
            captured_at=captured, file=uploaded, uploaded_by=user,
        )
        return Response(EvidenceSerializer(obj, context={'request': request}).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['delete'], url_path='evidences/(?P<file_id>[^/.]+)')
    def destroy_evidence(self, request, tenant_id, pk=None, file_id=None):
        if not can_operate(request.user, tenant_id):
            return Response({'detail': 'No puedes eliminar evidencias.'}, status=403)
        work = self.get_object()
        obj = work.evidences.filter(id=file_id).first()
        if not obj:
            return Response({'detail': 'Evidencia no encontrada.'}, status=404)
        if obj.file:
            obj.file.delete(save=False)
        obj.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
