"""Mantenimientos del condominio: preventivos, correctivos, evidencias e historial."""
from __future__ import annotations

import os
from datetime import date

from django.db.models import Q
from django.http import HttpResponse
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from .asambleas import media_api_url, tenant_common_areas
from .models import CondoMaintenanceEvidence, CondoMaintenanceWork, Tenant
from .permissions import IsAdminOrTesOrAuditor, IsTenantMember

FILE_MAX = 20 * 1024 * 1024
FILE_EXTS = {'.pdf', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.heic', '.doc', '.docx'}


def _require_condominio(tenant):
    if getattr(tenant, 'workspace_type', 'condominio') != 'condominio':
        raise ValidationError({'detail': 'Este módulo solo aplica al espacio de condominios.'})


def _audit(request, action, description, tenant_id, object_type, object_id, object_repr):
    from .views import _audit_log
    _audit_log(
        request, 'mantenimientos', action, description,
        tenant_id=tenant_id, object_type=object_type,
        object_id=str(object_id) if object_id else '',
        object_repr=object_repr or '',
    )


def request_user(request):
    return getattr(request, 'user', None) if request else None


def can_write(user, tenant_id):
    if not user:
        return False
    if getattr(user, 'is_super_admin', False):
        return True
    from .models import TenantUser
    return TenantUser.objects.filter(
        user=user, tenant_id=tenant_id, role__in=('admin', 'tesorero'),
    ).exists()


def _generated_by(request):
    user = request_user(request)
    return (
        (getattr(user, 'name', None) or '').strip()
        or (getattr(user, 'email', None) or '').strip()
        or '—'
    )


class MaintenanceEvidenceSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()
    uploaded_by_name = serializers.SerializerMethodField()

    class Meta:
        model = CondoMaintenanceEvidence
        fields = ('id', 'kind', 'original_name', 'notes', 'file_url', 'uploaded_by_name', 'created_at')
        read_only_fields = ('id', 'created_at')

    def get_file_url(self, obj):
        return media_api_url(obj.file, self.context.get('request'))

    def get_uploaded_by_name(self, obj):
        u = obj.uploaded_by
        return (getattr(u, 'name', None) or getattr(u, 'email', '') or '') if u else ''


class MaintenanceWorkSerializer(serializers.ModelSerializer):
    evidences = MaintenanceEvidenceSerializer(many=True, read_only=True)
    created_by_name = serializers.SerializerMethodField()
    evidence_count = serializers.SerializerMethodField()

    class Meta:
        model = CondoMaintenanceWork
        fields = (
            'id', 'kind', 'status', 'priority', 'title', 'description', 'work_notes',
            'area_id', 'area_name', 'performed_by', 'provider', 'vendor_name',
            'scheduled_date', 'performed_date', 'next_due_date', 'frequency', 'cost',
            'created_by_name', 'created_at', 'updated_at',
            'evidences', 'evidence_count',
        )
        read_only_fields = ('id', 'created_at', 'updated_at')
        extra_kwargs = {'provider': {'allow_null': True, 'required': False}}

    def get_created_by_name(self, obj):
        u = obj.created_by
        return (getattr(u, 'name', None) or getattr(u, 'email', '') or '') if u else ''

    def get_evidence_count(self, obj):
        pre = getattr(obj, '_evidence_count', None)
        if pre is not None:
            return pre
        return obj.evidences.count()

    def validate(self, attrs):
        from .proveedores import apply_name_snapshot
        provider = attrs.get('provider')
        if provider is None and 'provider' not in attrs and self.instance:
            provider = self.instance.provider
        apply_name_snapshot(attrs, provider, 'vendor_name')
        return attrs


class MaintenanceWorkListSerializer(MaintenanceWorkSerializer):
    class Meta(MaintenanceWorkSerializer.Meta):
        fields = (
            'id', 'kind', 'status', 'priority', 'title', 'description',
            'area_name', 'performed_by', 'provider', 'vendor_name',
            'scheduled_date', 'performed_date', 'next_due_date', 'frequency', 'cost',
            'created_by_name', 'created_at', 'evidence_count',
        )


class MaintenanceContextView(APIView):
    permission_classes = [IsTenantMember]

    def get(self, request, tenant_id):
        tenant = Tenant.objects.get(id=tenant_id)
        _require_condominio(tenant)
        qs = CondoMaintenanceWork.objects.filter(tenant=tenant)
        counts = {
            'preventivo': qs.filter(kind='preventivo').count(),
            'correctivo': qs.filter(kind='correctivo').count(),
            'planeado': qs.filter(status='planeado').count(),
            'en_curso': qs.filter(status='en_curso').count(),
            'realizado': qs.filter(status='realizado').count(),
        }
        return Response({
            'common_areas': tenant_common_areas(tenant),
            'can_write': can_write(request.user, tenant_id),
            'counts': counts,
            'name': tenant.name,
            'razon_social': tenant.razon_social or '',
        })


class CondoMaintenanceWorkViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAdminOrTesOrAuditor]
    pagination_class = None

    def get_permissions(self):
        if self.action in ('list', 'retrieve', 'print_doc', 'print_report', 'evidences') and self.request.method == 'GET':
            return [IsTenantMember()]
        return super().get_permissions()

    def get_queryset(self):
        qs = CondoMaintenanceWork.objects.filter(
            tenant_id=self.kwargs['tenant_id']
        ).select_related('created_by').prefetch_related('evidences__uploaded_by')
        kind = self.request.query_params.get('kind')
        if kind in dict(CondoMaintenanceWork.KIND_CHOICES):
            qs = qs.filter(kind=kind)
        st = self.request.query_params.get('status')
        if st in dict(CondoMaintenanceWork.STATUS_CHOICES):
            qs = qs.filter(status=st)
        year = self.request.query_params.get('year')
        if year:
            try:
                y = int(year)
                qs = qs.filter(
                    Q(scheduled_date__year=y) | Q(performed_date__year=y) | Q(created_at__year=y)
                )
            except (TypeError, ValueError):
                pass
        return qs

    def get_serializer_class(self):
        if self.action == 'list':
            return MaintenanceWorkListSerializer
        return MaintenanceWorkSerializer

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx['request'] = self.request
        return ctx

    def _full(self, work):
        fresh = self.get_queryset().filter(pk=work.pk).first() or work
        return MaintenanceWorkSerializer(fresh, context=self.get_serializer_context()).data

    def perform_create(self, serializer):
        tenant = Tenant.objects.get(id=self.kwargs['tenant_id'])
        _require_condominio(tenant)
        data = serializer.validated_data
        if data.get('status') == 'realizado' and not data.get('performed_date'):
            data['performed_date'] = date.today()
        work = serializer.save(tenant=tenant, created_by=request_user(self.request))
        _audit(
            self.request, 'create', f'Mantenimiento: {work.title}',
            self.kwargs['tenant_id'], 'CondoMaintenanceWork', work.id, work.title,
        )

    def perform_update(self, serializer):
        data = serializer.validated_data
        instance = serializer.instance
        if data.get('status') == 'realizado' and not (data.get('performed_date') or instance.performed_date):
            data['performed_date'] = date.today()
        work = serializer.save()
        _audit(
            self.request, 'update', f'Mantenimiento actualizado: {work.title}',
            self.kwargs['tenant_id'], 'CondoMaintenanceWork', work.id, work.title,
        )

    def perform_destroy(self, instance):
        title = instance.title
        for ev in instance.evidences.all():
            if ev.file:
                ev.file.delete(save=False)
        instance.delete()
        _audit(
            self.request, 'delete', f'Mantenimiento eliminado: {title}',
            self.kwargs['tenant_id'], 'CondoMaintenanceWork', instance.id, title,
        )

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return Response(self._full(serializer.instance), status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return Response(self._full(serializer.instance))

    @action(detail=True, methods=['get', 'post'], url_path='evidences')
    def evidences(self, request, tenant_id, pk=None):
        work = self.get_object()
        if request.method == 'GET':
            return Response(
                MaintenanceEvidenceSerializer(
                    work.evidences.all(), many=True, context={'request': request},
                ).data
            )
        if not can_write(request.user, tenant_id):
            return Response({'detail': 'No puedes subir evidencias.'}, status=403)
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
        if kind not in dict(CondoMaintenanceEvidence.KIND_CHOICES):
            kind = 'otro'
        obj = CondoMaintenanceEvidence.objects.create(
            work=work,
            kind=kind,
            original_name=name[:240],
            notes=(request.data.get('notes') or '')[:400],
            file=uploaded,
            uploaded_by=request_user(request),
        )
        return Response(
            MaintenanceEvidenceSerializer(obj, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=['delete'], url_path='evidences/(?P<file_id>[^/.]+)')
    def destroy_evidence(self, request, tenant_id, pk=None, file_id=None):
        if not can_write(request.user, tenant_id):
            return Response({'detail': 'No puedes eliminar evidencias.'}, status=403)
        work = self.get_object()
        obj = work.evidences.filter(id=file_id).first()
        if not obj:
            return Response({'detail': 'Evidencia no encontrada.'}, status=404)
        if obj.file:
            obj.file.delete(save=False)
        obj.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['get'], url_path='print-doc')
    def print_doc(self, request, tenant_id, pk=None):
        work = self.get_object()
        from .mantenimiento_docs import _safe_filename, generate_work_pdf
        try:
            pdf_bytes = generate_work_pdf(work, generated_by=_generated_by(request))
        except Exception:
            import logging
            logging.getLogger(__name__).exception('Error generando PDF de mantenimiento %s', work.id)
            return Response({'detail': 'No se pudo generar el documento.'}, status=500)
        if not pdf_bytes:
            return Response({'detail': 'No se pudo generar el PDF en el servidor.'}, status=500)
        filename = f'Mantenimiento_{_safe_filename(work.title)}.pdf'
        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response

    @action(detail=False, methods=['get'], url_path='print-report')
    def print_report(self, request, tenant_id):
        tenant = Tenant.objects.get(id=tenant_id)
        _require_condominio(tenant)
        works = list(self.get_queryset())
        kind = (request.query_params.get('kind') or '').strip()
        year = request.query_params.get('year')
        from .mantenimiento_docs import generate_history_pdf
        try:
            pdf_bytes = generate_history_pdf(
                tenant, works,
                generated_by=_generated_by(request),
                kind_filter=kind,
                year=int(year) if year and str(year).isdigit() else None,
            )
        except Exception:
            import logging
            logging.getLogger(__name__).exception('Error generando historial de mantenimiento')
            return Response({'detail': 'No se pudo generar el documento.'}, status=500)
        if not pdf_bytes:
            return Response({'detail': 'No se pudo generar el PDF en el servidor.'}, status=500)
        filename = 'Historial_mantenimientos.pdf'
        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response
