"""Catálogo de proveedores del condominio."""
from __future__ import annotations

import os

from django.db.models import Q
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from .asambleas import media_api_url
from .models import (
    CondoProvider, CondoProviderDocument, PROVIDER_MODULE_KEYS, Tenant,
)
from .permissions import IsAdminOrTesorero, IsTenantMember

FILE_MAX = 20 * 1024 * 1024
FILE_EXTS = {'.pdf', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.heic', '.doc', '.docx', '.xls', '.xlsx'}


def _require_condominio(tenant):
    if getattr(tenant, 'workspace_type', 'condominio') != 'condominio':
        raise ValidationError({'detail': 'Este módulo solo aplica al espacio de condominios.'})


def _audit(request, action, description, tenant_id, object_type, object_id, object_repr):
    from .views import _audit_log
    _audit_log(
        request, 'config', action, description,
        tenant_id=tenant_id, object_type=object_type,
        object_id=str(object_id) if object_id else '',
        object_repr=object_repr or '',
    )


def request_user(request):
    return getattr(request, 'user', None) if request else None


def snapshot_from_provider(provider):
    if not provider:
        return {}
    return {
        'name': provider.display_name,
        'rfc': provider.rfc or '',
        'contact': provider.contact_name or provider.legal_rep_name or '',
        'phone': provider.phone or provider.mobile or '',
        'email': provider.email or '',
    }


def apply_name_snapshot(validated, provider, name_field, rfc_field=None):
    if not provider:
        return validated
    snap = snapshot_from_provider(provider)
    if not (validated.get(name_field) or '').strip():
        validated[name_field] = snap['name']
    if rfc_field and not (validated.get(rfc_field) or '').strip():
        validated[rfc_field] = snap['rfc']
    return validated


class ProviderDocumentSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()
    uploaded_by_name = serializers.SerializerMethodField()
    kind_label = serializers.CharField(source='get_kind_display', read_only=True)

    class Meta:
        model = CondoProviderDocument
        fields = (
            'id', 'kind', 'kind_label', 'original_name', 'notes',
            'file_url', 'uploaded_by_name', 'created_at',
        )
        read_only_fields = ('id', 'created_at')

    def get_file_url(self, obj):
        return media_api_url(obj.file, self.context.get('request'))

    def get_uploaded_by_name(self, obj):
        u = obj.uploaded_by
        return (getattr(u, 'name', None) or getattr(u, 'email', '') or '') if u else ''


class ProviderSerializer(serializers.ModelSerializer):
    documents = ProviderDocumentSerializer(many=True, read_only=True)
    display_name = serializers.CharField(read_only=True)
    document_count = serializers.SerializerMethodField()

    class Meta:
        model = CondoProvider
        fields = (
            'id', 'person_type', 'legal_name', 'trade_name', 'first_name', 'last_name',
            'display_name', 'rfc', 'curp', 'tax_regime', 'legal_rep_name',
            'contact_name', 'email', 'phone', 'mobile', 'website',
            'street', 'ext_number', 'int_number', 'colonia', 'city', 'state', 'zip_code',
            'bank_name', 'bank_clabe', 'bank_account', 'notes',
            'status', 'visible_in_modules', 'document_count', 'documents',
            'created_at', 'updated_at',
        )
        read_only_fields = ('id', 'created_at', 'updated_at')

    def get_document_count(self, obj):
        pre = getattr(obj, '_document_count', None)
        if pre is not None:
            return pre
        return obj.documents.count()

    def validate_legal_name(self, value):
        if not (value or '').strip():
            raise ValidationError('El nombre o razón social es obligatorio.')
        return value.strip()

    def validate_visible_in_modules(self, value):
        if value is None:
            return list(PROVIDER_MODULE_KEYS)
        if not isinstance(value, list):
            raise ValidationError('Debe ser una lista de módulos.')
        clean = []
        for key in value:
            if key in PROVIDER_MODULE_KEYS and key not in clean:
                clean.append(key)
        return clean

    def validate_rfc(self, value):
        return (value or '').strip().upper()

    def validate_curp(self, value):
        return (value or '').strip().upper()


class ProviderListSerializer(ProviderSerializer):
    class Meta(ProviderSerializer.Meta):
        fields = (
            'id', 'person_type', 'legal_name', 'trade_name', 'display_name',
            'rfc', 'contact_name', 'email', 'phone', 'mobile',
            'status', 'visible_in_modules', 'document_count', 'updated_at',
        )


class ProviderOptionSerializer(serializers.ModelSerializer):
    display_name = serializers.CharField(read_only=True)

    class Meta:
        model = CondoProvider
        fields = (
            'id', 'display_name', 'person_type', 'rfc',
            'contact_name', 'phone', 'mobile', 'email', 'legal_rep_name',
        )


class CondoProviderViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAdminOrTesorero]
    pagination_class = None

    def get_permissions(self):
        if self.action in ('list', 'retrieve', 'options_list'):
            return [IsTenantMember()]
        return super().get_permissions()

    def get_queryset(self):
        qs = CondoProvider.objects.filter(
            tenant_id=self.kwargs['tenant_id']
        ).prefetch_related('documents__uploaded_by')
        st = self.request.query_params.get('status')
        if st in dict(CondoProvider.STATUS_CHOICES):
            qs = qs.filter(status=st)
        module = self.request.query_params.get('module')
        if module in PROVIDER_MODULE_KEYS:
            visible_ids = [p.id for p in qs if p.is_visible_in(module)]
            qs = qs.filter(id__in=visible_ids)
        q = (self.request.query_params.get('q') or '').strip()
        if q:
            qs = qs.filter(
                Q(legal_name__icontains=q) | Q(trade_name__icontains=q)
                | Q(rfc__icontains=q) | Q(contact_name__icontains=q)
                | Q(first_name__icontains=q) | Q(last_name__icontains=q)
            )
        return qs

    def get_serializer_class(self):
        if self.action == 'list':
            lite = self.request.query_params.get('lite')
            if lite in ('1', 'true', 'yes'):
                return ProviderOptionSerializer
            return ProviderListSerializer
        return ProviderSerializer

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx['request'] = self.request
        return ctx

    def perform_create(self, serializer):
        tenant = Tenant.objects.get(id=self.kwargs['tenant_id'])
        _require_condominio(tenant)
        provider = serializer.save(tenant=tenant, created_by=request_user(self.request))
        _audit(
            self.request, 'create', f'Proveedor: {provider.display_name}',
            self.kwargs['tenant_id'], 'CondoProvider', provider.id, provider.display_name,
        )

    def perform_update(self, serializer):
        provider = serializer.save()
        _audit(
            self.request, 'update', f'Proveedor actualizado: {provider.display_name}',
            self.kwargs['tenant_id'], 'CondoProvider', provider.id, provider.display_name,
        )

    def perform_destroy(self, instance):
        name = instance.display_name
        tenant_id = self.kwargs['tenant_id']
        instance.delete()
        _audit(
            self.request, 'delete', f'Proveedor eliminado: {name}',
            tenant_id, 'CondoProvider', None, name,
        )

    @action(detail=False, methods=['get'], url_path='options')
    def options_list(self, request, tenant_id=None):
        module = request.query_params.get('module')
        qs = list(CondoProvider.objects.filter(tenant_id=tenant_id, status='activo').order_by('trade_name', 'legal_name'))
        if module in PROVIDER_MODULE_KEYS:
            qs = [p for p in qs if p.is_visible_in(module)]
        return Response(ProviderOptionSerializer(qs, many=True).data)

    @action(detail=True, methods=['post'], url_path='documents')
    def upload_document(self, request, tenant_id=None, pk=None):
        provider = self.get_object()
        upload = request.FILES.get('file')
        if not upload:
            return Response({'detail': 'Adjunta un archivo.'}, status=400)
        if upload.size and upload.size > FILE_MAX:
            return Response({'detail': 'El archivo no puede superar 20 MB.'}, status=400)
        ext = os.path.splitext(upload.name or '')[1].lower()
        if ext and ext not in FILE_EXTS:
            return Response({'detail': f'Tipo de archivo no permitido: {ext}'}, status=400)
        kind = request.data.get('kind') or 'otro'
        if kind not in dict(CondoProviderDocument.KIND_CHOICES):
            kind = 'otro'
        doc = CondoProviderDocument.objects.create(
            provider=provider,
            kind=kind,
            original_name=(upload.name or '')[:240],
            notes=(request.data.get('notes') or '')[:400],
            file=upload,
            uploaded_by=request_user(request),
        )
        _audit(
            request, 'create', f'Documento de proveedor: {provider.display_name}',
            tenant_id, 'CondoProviderDocument', doc.id, doc.original_name,
        )
        return Response(
            ProviderDocumentSerializer(doc, context=self.get_serializer_context()).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=['delete'], url_path='documents/(?P<doc_id>[^/.]+)')
    def delete_document(self, request, tenant_id=None, pk=None, doc_id=None):
        provider = self.get_object()
        doc = provider.documents.filter(id=doc_id).first()
        if not doc:
            return Response({'detail': 'Documento no encontrado.'}, status=404)
        name = doc.original_name
        doc.delete()
        _audit(
            request, 'delete', f'Documento de proveedor eliminado: {name}',
            tenant_id, 'CondoProviderDocument', doc_id, name,
        )
        return Response(status=status.HTTP_204_NO_CONTENT)
