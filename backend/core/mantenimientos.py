"""Mantenimientos del condominio: preventivos, correctivos, evidencias e historial."""
from __future__ import annotations

import os
from datetime import date

from django.db.models import Count, Prefetch, Q
from django.http import HttpResponse
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from .asambleas import media_api_url, tenant_common_areas
from .models import ClosedPeriod, CondoMaintenanceEvidence, CondoMaintenanceWork, GastoEntry, Tenant
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


def parse_period(raw):
    raw = (raw or '').strip()
    if len(raw) >= 7 and raw[4] == '-':
        try:
            year, month = int(raw[:4]), int(raw[5:7])
            if 1 <= month <= 12:
                return year, month
        except (TypeError, ValueError):
            return None
    return None


def current_period():
    today = date.today()
    return f'{today.year:04d}-{today.month:02d}'


def filter_works_by_period(qs, period):
    if parse_period(period):
        return qs.filter(period=period[:7])
    return qs


def period_from_dates(*values):
    for value in values:
        if value is None:
            continue
        if hasattr(value, 'year') and hasattr(value, 'month'):
            return f'{value.year:04d}-{value.month:02d}'
        parsed = parse_period(str(value))
        if parsed:
            year, month = parsed
            return f'{year:04d}-{month:02d}'
    return current_period()


def _check_period_open(tenant_id, period):
    period = (period or '').strip()[:7]
    if not parse_period(period):
        raise ValidationError({'detail': 'El período debe tener el formato YYYY-MM.'})
    if ClosedPeriod.objects.filter(tenant_id=tenant_id, period=period).exists():
        raise ValidationError({
            'detail': f'El período {period} está cerrado y no acepta cambios en mantenimientos.',
        })
    return period


class MaintenanceEvidenceSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()
    uploaded_by_name = serializers.SerializerMethodField()

    class Meta:
        model = CondoMaintenanceEvidence
        fields = ('id', 'kind', 'original_name', 'notes', 'file_url', 'uploaded_by_name', 'captured_at', 'created_at')
        read_only_fields = ('id', 'created_at')

    def get_file_url(self, obj):
        return media_api_url(obj.file, self.context.get('request'))

    def get_uploaded_by_name(self, obj):
        u = obj.uploaded_by
        return (getattr(u, 'name', None) or getattr(u, 'email', '') or '') if u else ''


class MaintenanceLinkedGastoSerializer(serializers.ModelSerializer):
    field_label = serializers.CharField(source='field.label', read_only=True, default='')

    class Meta:
        model = GastoEntry
        fields = (
            'id', 'period', 'field_label', 'amount', 'gasto_date',
            'provider_name', 'doc_number', 'notes',
        )


class MaintenanceWorkSerializer(serializers.ModelSerializer):
    evidences = MaintenanceEvidenceSerializer(many=True, read_only=True)
    gastos = MaintenanceLinkedGastoSerializer(source='gasto_entries', many=True, read_only=True)
    gasto_ids = serializers.ListField(child=serializers.UUIDField(), write_only=True, required=False)
    created_by_name = serializers.SerializerMethodField()
    evidence_count = serializers.SerializerMethodField()
    gastos_total = serializers.SerializerMethodField()

    class Meta:
        model = CondoMaintenanceWork
        fields = (
            'id', 'kind', 'status', 'priority', 'title', 'description', 'work_notes',
            'area_id', 'area_name', 'performed_by', 'provider', 'vendor_name',
            'scheduled_date', 'performed_date', 'next_due_date', 'frequency', 'cost',
            'period', 'created_by_name', 'created_at', 'updated_at',
            'evidences', 'evidence_count', 'gastos', 'gasto_ids', 'gastos_total',
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

    def get_gastos_total(self, obj):
        rows = getattr(obj, '_prefetched_objects_cache', {}).get('gasto_entries')
        if rows is None:
            rows = list(obj.gasto_entries.all())
        total = 0
        for g in rows:
            try:
                total += float(g.amount or 0)
            except (TypeError, ValueError):
                pass
        return total

    def validate_period(self, value):
        raw = (value or '').strip()
        if not raw:
            return ''
        if not parse_period(raw):
            raise serializers.ValidationError('El período debe tener el formato YYYY-MM.')
        return raw[:7]

    def validate(self, attrs):
        from .proveedores import apply_name_snapshot
        provider = attrs.get('provider')
        if provider is None and 'provider' not in attrs and self.instance:
            provider = self.instance.provider
        apply_name_snapshot(attrs, provider, 'vendor_name')
        return attrs

    def create(self, validated_data):
        validated_data.pop('gasto_ids', None)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        validated_data.pop('gasto_ids', None)
        return super().update(instance, validated_data)


class MaintenanceWorkListSerializer(MaintenanceWorkSerializer):
    class Meta(MaintenanceWorkSerializer.Meta):
        fields = (
            'id', 'kind', 'status', 'priority', 'title', 'description',
            'area_name', 'performed_by', 'provider', 'vendor_name',
            'scheduled_date', 'performed_date', 'next_due_date', 'frequency', 'cost',
            'period', 'created_by_name', 'created_at', 'evidence_count', 'gastos_total',
        )


class MaintenanceContextView(APIView):
    permission_classes = [IsTenantMember]

    def get(self, request, tenant_id):
        tenant = Tenant.objects.get(id=tenant_id)
        _require_condominio(tenant)
        qs = CondoMaintenanceWork.objects.filter(tenant=tenant)
        period = (request.query_params.get('period') or '').strip()
        if parse_period(period):
            qs = qs.filter(period=period[:7])
        counts = {
            'preventivo': qs.filter(kind='preventivo').count(),
            'correctivo': qs.filter(kind='correctivo').count(),
            'planeado': qs.filter(status='planeado').count(),
            'en_curso': qs.filter(status='en_curso').count(),
            'realizado': qs.filter(status='realizado').count(),
        }
        by_kind = {
            'preventivo': {'planeado': 0, 'en_curso': 0, 'realizado': 0, 'cancelado': 0},
            'correctivo': {'planeado': 0, 'en_curso': 0, 'realizado': 0, 'cancelado': 0},
        }
        for row in qs.values('kind', 'status').annotate(n=Count('id')):
            kind = row.get('kind')
            st = row.get('status')
            if kind in by_kind and st in by_kind[kind]:
                by_kind[kind][st] = row['n']
        return Response({
            'common_areas': tenant_common_areas(tenant),
            'can_write': can_write(request.user, tenant_id),
            'counts': counts,
            'by_kind': by_kind,
            'name': tenant.name,
            'razon_social': tenant.razon_social or '',
            'operation_start_date': tenant.operation_start_date or '',
            'period': period[:7] if parse_period(period) else '',
            'period_closed': bool(
                parse_period(period)
                and ClosedPeriod.objects.filter(tenant=tenant, period=period[:7]).exists()
            ),
        })


class CondoMaintenanceWorkViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAdminOrTesOrAuditor]
    pagination_class = None

    def get_permissions(self):
        if self.action in ('list', 'retrieve', 'print_doc', 'print_report', 'evidences', 'gasto_options') and self.request.method == 'GET':
            return [IsTenantMember()]
        return super().get_permissions()

    def get_queryset(self):
        ev_qs = CondoMaintenanceEvidence.objects.select_related('uploaded_by').order_by(
            'captured_at', 'created_at', 'id',
        )
        gasto_qs = GastoEntry.objects.select_related('field').order_by('-gasto_date', '-created_at')
        qs = CondoMaintenanceWork.objects.filter(
            tenant_id=self.kwargs['tenant_id']
        ).select_related('created_by', 'provider').prefetch_related(
            Prefetch('evidences', queryset=ev_qs),
            Prefetch('gasto_entries', queryset=gasto_qs),
        )
        kind = self.request.query_params.get('kind')
        if kind in dict(CondoMaintenanceWork.KIND_CHOICES):
            qs = qs.filter(kind=kind)
        st = self.request.query_params.get('status')
        if st in dict(CondoMaintenanceWork.STATUS_CHOICES):
            qs = qs.filter(status=st)
        period = (self.request.query_params.get('period') or '').strip()
        if parse_period(period):
            qs = qs.filter(period=period[:7])
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

    def _sync_gastos(self, work, gasto_ids):
        ids = []
        for raw in gasto_ids or []:
            if raw:
                ids.append(str(raw))
        GastoEntry.objects.filter(
            tenant_id=work.tenant_id, maintenance_work=work,
        ).exclude(id__in=ids).update(maintenance_work=None)
        if ids:
            GastoEntry.objects.filter(
                tenant_id=work.tenant_id, id__in=ids,
            ).update(maintenance_work=work)

    def _gasto_ids_from_request(self):
        raw = self.request.data.get('gasto_ids', None)
        if raw is None:
            return None
        if isinstance(raw, str):
            raw = [part.strip() for part in raw.split(',') if part.strip()]
        elif not isinstance(raw, list):
            raw = [raw]
        return raw

    def perform_create(self, serializer):
        tenant = Tenant.objects.get(id=self.kwargs['tenant_id'])
        _require_condominio(tenant)
        data = serializer.validated_data
        data['period'] = _check_period_open(
            self.kwargs['tenant_id'],
            data.get('period') or period_from_dates(
                data.get('scheduled_date'), data.get('performed_date'), date.today(),
            ),
        )
        if data.get('status') == 'realizado' and not data.get('performed_date'):
            data['performed_date'] = date.today()
        work = serializer.save(tenant=tenant, created_by=request_user(self.request))
        gasto_ids = self._gasto_ids_from_request()
        if gasto_ids is not None:
            self._sync_gastos(work, gasto_ids)
        _audit(
            self.request, 'create', f'Mantenimiento: {work.title}',
            self.kwargs['tenant_id'], 'CondoMaintenanceWork', work.id, work.title,
        )

    def perform_update(self, serializer):
        data = serializer.validated_data
        instance = serializer.instance
        tenant_id = self.kwargs['tenant_id']
        _check_period_open(tenant_id, instance.period or period_from_dates(instance.scheduled_date, instance.created_at))
        if data.get('period'):
            data['period'] = _check_period_open(tenant_id, data['period'])
        if data.get('status') == 'realizado' and not (data.get('performed_date') or instance.performed_date):
            data['performed_date'] = date.today()
        work = serializer.save()
        gasto_ids = self._gasto_ids_from_request()
        if gasto_ids is not None:
            self._sync_gastos(work, gasto_ids)
        _audit(
            self.request, 'update', f'Mantenimiento actualizado: {work.title}',
            self.kwargs['tenant_id'], 'CondoMaintenanceWork', work.id, work.title,
        )

    def perform_destroy(self, instance):
        _check_period_open(
            self.kwargs['tenant_id'],
            instance.period or period_from_dates(instance.scheduled_date, instance.created_at),
        )
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
        _check_period_open(
            tenant_id,
            work.period or period_from_dates(work.scheduled_date, work.created_at),
        )
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
        captured_raw = (request.data.get('captured_at') or '').strip()
        captured = None
        if captured_raw:
            try:
                captured = date.fromisoformat(captured_raw[:10])
            except ValueError:
                captured = None
        if not captured:
            captured = date.today()
        user = request_user(request)
        if not getattr(user, 'is_authenticated', False) or not getattr(user, 'pk', None):
            user = None
        obj = CondoMaintenanceEvidence.objects.create(
            work=work,
            kind=kind,
            original_name=name[:240],
            notes=(request.data.get('notes') or '')[:400],
            captured_at=captured,
            file=uploaded,
            uploaded_by=user,
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
        _check_period_open(
            tenant_id,
            work.period or period_from_dates(work.scheduled_date, work.created_at),
        )
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

    @action(detail=False, methods=['get'], url_path='gasto-options')
    def gasto_options(self, request, tenant_id):
        work_id = (request.query_params.get('work') or '').strip()
        qs = GastoEntry.objects.filter(tenant_id=tenant_id).select_related(
            'field', 'maintenance_work',
        ).order_by('-gasto_date', '-created_at')
        today = date.today()
        month = today.month - 11
        year = today.year
        if month <= 0:
            month += 12
            year -= 1
        cutoff = f'{year:04d}-{month:02d}'
        recent_ids = set(qs.filter(period__gte=cutoff).values_list('id', flat=True)[:280])
        if work_id:
            recent_ids |= set(qs.filter(maintenance_work_id=work_id).values_list('id', flat=True))
        rows = qs.filter(id__in=recent_ids) if recent_ids else qs.none()
        data = []
        for g in rows:
            data.append({
                'id': str(g.id),
                'amount': str(g.amount),
                'period': g.period,
                'field_label': g.field.label if g.field_id else '',
                'gasto_date': g.gasto_date.isoformat() if g.gasto_date else None,
                'provider_name': g.provider_name or '',
                'maintenance_work': str(g.maintenance_work_id) if g.maintenance_work_id else None,
                'maintenance_work_title': g.maintenance_work.title if g.maintenance_work_id else '',
            })
        return Response(data)

    @action(detail=False, methods=['get'], url_path='print-report')
    def print_report(self, request, tenant_id):
        tenant = Tenant.objects.get(id=tenant_id)
        _require_condominio(tenant)
        period = (request.query_params.get('period') or '').strip() or current_period()
        ev_qs = CondoMaintenanceEvidence.objects.select_related('uploaded_by').order_by(
            'captured_at', 'created_at', 'id',
        )
        gasto_qs = GastoEntry.objects.select_related('field').order_by('-gasto_date', '-created_at')
        qs = CondoMaintenanceWork.objects.filter(tenant=tenant).select_related(
            'created_by', 'provider',
        ).prefetch_related(
            Prefetch('evidences', queryset=ev_qs),
            Prefetch('gasto_entries', queryset=gasto_qs),
        )
        qs = filter_works_by_period(qs, period)
        works = list(qs)
        from .mantenimiento_docs import generate_history_pdf
        try:
            pdf_bytes = generate_history_pdf(
                tenant, works,
                generated_by=_generated_by(request),
                period=period,
            )
        except Exception:
            import logging
            logging.getLogger(__name__).exception('Error generando historial de mantenimiento')
            return Response({'detail': 'No se pudo generar el documento.'}, status=500)
        if not pdf_bytes:
            return Response({'detail': 'No se pudo generar el PDF en el servidor.'}, status=500)
        filename = f'Historial_mantenimientos_{period}.pdf'
        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response
