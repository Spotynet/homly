"""API de Rita — asistente de estados de cuenta → cobranza / gastos."""
from __future__ import annotations

import base64
import logging
from django.core.files.base import ContentFile
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from .models import Tenant, Unit, BankStatement, RitaBankSession
from .permissions import HasRitaCapability, user_has_rita_capability, RITA_CAP_KEYS
from .rita_bank import BANK_PROFILES, parse_bank_statement_pdf
from .views import BankStatementViewSet

logger = logging.getLogger(__name__)


def _get_tenant(tenant_id):
    try:
        return Tenant.objects.get(pk=tenant_id)
    except Tenant.DoesNotExist:
        return None


def _units_payload(tenant):
    return list(
        Unit.objects.filter(tenant=tenant, is_active=True).values('id', 'unit_id_code', 'unit_name')
    )


def _session_payload(session: RitaBankSession, focus: str = 'ingresos'):
    movs = session.movements or []
    pending_ing = [m for m in movs if m.get('kind') == 'ingreso' and m.get('status') == 'pending']
    pending_egr = [m for m in movs if m.get('kind') == 'egreso' and m.get('status') == 'pending']
    if focus == 'egresos':
        pending = pending_egr
        current = pending_egr[0] if pending_egr else None
    elif focus == 'ambos':
        pending = pending_ing + pending_egr
        current = pending_ing[0] if pending_ing else (pending_egr[0] if pending_egr else None)
    else:
        pending = pending_ing
        current = pending_ing[0] if pending_ing else None

    stmt = session.bank_statement
    return {
        'id': str(session.id),
        'period': session.period,
        'bank_profile': session.bank_profile,
        'bank_label': BANK_PROFILES.get(session.bank_profile, {}).get('label', session.bank_profile),
        'source_filename': session.source_filename,
        'summary': session.summary or {},
        'meta': session.meta or {},
        'status': session.status,
        'movements': movs,
        'pending_ingresos': pending_ing,
        'pending_egresos': pending_egr,
        'pending_count': len(pending),
        'pending_ingresos_count': len(pending_ing),
        'pending_egresos_count': len(pending_egr),
        'current': current,
        'focus': focus,
        'bank_statement_id': str(stmt.id) if stmt else None,
        'has_bank_statement': bool(stmt),
        'created_at': session.created_at.isoformat() if session.created_at else None,
    }


def _upsert_bank_statement(tenant, period: str, raw: bytes, filename: str) -> BankStatement:
    """Guarda/actualiza el PDF canónico del período (Estado General)."""
    b64 = base64.b64encode(raw).decode('ascii')
    obj, _created = BankStatement.objects.update_or_create(
        tenant=tenant,
        period=period,
        defaults={'file_data': b64},
    )
    safe_name = filename or f'estado-bancario-{period}.pdf'
    if not safe_name.lower().endswith('.pdf'):
        safe_name = f'{safe_name}.pdf'
    obj.statement_file.save(safe_name, ContentFile(raw), save=True)
    return obj


def _create_session(tenant, period, profile, result, filename, user, bank_statement=None):
    """Crea sesión Rita; cierra sesiones open previas del mismo período."""
    RitaBankSession.objects.filter(tenant=tenant, period=period, status='open').update(status='cancelled')
    return RitaBankSession.objects.create(
        tenant=tenant,
        period=period,
        bank_statement=bank_statement,
        bank_profile=result.get('bank_profile') or profile,
        source_filename=filename or 'estado.pdf',
        summary=result.get('summary') or {},
        movements=result.get('movements') or [],
        meta={
            **(result.get('meta') or {}),
            'bank_statement_id': str(bank_statement.id) if bank_statement else None,
        },
        created_by=user if user and user.is_authenticated else None,
        status='open',
    )


def _read_statement_bytes(stmt: BankStatement):
    return BankStatementViewSet._pdf_bytes(stmt)


def _rita_caps_payload(tenant, user):
    return {k: user_has_rita_capability(tenant, user, k) for k in RITA_CAP_KEYS}


class RitaBankProfilesView(APIView):
    """GET perfiles de banco disponibles + capacidades del usuario."""
    permission_classes = [IsAuthenticated, HasRitaCapability]
    rita_capabilities = RITA_CAP_KEYS  # cualquiera basta para listar

    def get(self, request, tenant_id):
        tenant = _get_tenant(tenant_id)
        if not tenant:
            return Response({'detail': 'Tenant no encontrado.'}, status=404)
        profiles = [
            {'id': k, 'label': v['label']}
            for k, v in BANK_PROFILES.items()
        ]
        settings = tenant.rita_settings or {}
        return Response({
            'profiles': profiles,
            'settings': {
                'enabled': settings.get('enabled', True),
                'bank_profile': settings.get('bank_profile', 'generic'),
                'auto_suggest_unit': settings.get('auto_suggest_unit', True),
                'default_payment_type': settings.get('default_payment_type', 'transferencia'),
            },
            'capabilities': _rita_caps_payload(tenant, request.user),
        })


class RitaSettingsView(APIView):
    """GET/PATCH configuración Rita del tenant."""
    permission_classes = [IsAuthenticated, HasRitaCapability]
    rita_capabilities = RITA_CAP_KEYS  # GET: cualquiera; PATCH valida 'settings'

    def get(self, request, tenant_id):
        tenant = _get_tenant(tenant_id)
        if not tenant:
            return Response({'detail': 'Tenant no encontrado.'}, status=404)
        s = tenant.rita_settings or {}
        return Response({
            'enabled': s.get('enabled', True),
            'bank_profile': s.get('bank_profile', 'generic'),
            'auto_suggest_unit': s.get('auto_suggest_unit', True),
            'default_payment_type': s.get('default_payment_type', 'transferencia'),
            'capabilities': _rita_caps_payload(tenant, request.user),
        })

    def patch(self, request, tenant_id):
        tenant = _get_tenant(tenant_id)
        if not tenant:
            return Response({'detail': 'Tenant no encontrado.'}, status=404)
        if not user_has_rita_capability(tenant, request.user, 'settings'):
            return Response({'detail': 'Sin permiso para configurar Rita.'}, status=403)
        s = dict(tenant.rita_settings or {})
        for key in ('enabled', 'bank_profile', 'auto_suggest_unit', 'default_payment_type'):
            if key in request.data:
                s[key] = request.data[key]
        if s.get('bank_profile') and s['bank_profile'] not in BANK_PROFILES:
            return Response({'detail': 'Perfil de banco no válido.'}, status=400)
        tenant.rita_settings = s
        tenant.save(update_fields=['rita_settings'])
        return Response(s)


class RitaPeriodStatusView(APIView):
    """GET ?period=YYYY-MM — estado bancario + sesión abierta del período."""
    permission_classes = [IsAuthenticated, HasRitaCapability]
    rita_capabilities = ('ingresos', 'egresos', 'bank_upload')

    def get(self, request, tenant_id):
        tenant = _get_tenant(tenant_id)
        if not tenant:
            return Response({'detail': 'Tenant no encontrado.'}, status=404)
        period = (request.query_params.get('period') or '').strip()
        if not period:
            return Response({'detail': 'Indica period=YYYY-MM.'}, status=400)

        stmt = BankStatement.objects.filter(tenant=tenant, period=period).first()
        has_file = bool(stmt and (getattr(stmt.statement_file, 'name', None) or (stmt.file_data or '').strip()))
        session = (
            RitaBankSession.objects.filter(tenant=tenant, period=period, status='open')
            .order_by('-created_at')
            .first()
        )
        focus = (request.query_params.get('focus') or 'ingresos').strip()
        return Response({
            'period': period,
            'has_bank_statement': has_file,
            'bank_statement_id': str(stmt.id) if stmt and has_file else None,
            'bank_uploaded_at': stmt.uploaded_at.isoformat() if stmt and has_file else None,
            'open_session': _session_payload(session, focus=focus) if session else None,
            'capabilities': _rita_caps_payload(tenant, request.user),
        })


class RitaParseView(APIView):
    """
    POST multipart: file (PDF), period, bank_profile?, focus?
    Guarda PDF en BankStatement y crea sesión Rita.
    """
    permission_classes = [IsAuthenticated, HasRitaCapability]
    rita_capability = 'bank_upload'

    def post(self, request, tenant_id):
        tenant = _get_tenant(tenant_id)
        if not tenant:
            return Response({'detail': 'Tenant no encontrado.'}, status=404)

        settings = tenant.rita_settings or {}
        if settings.get('enabled') is False:
            return Response({'detail': 'Rita está desactivada para este condominio.'}, status=400)

        upload = request.FILES.get('file') or request.FILES.get('statement_file')
        if not upload:
            return Response({'detail': 'Adjunta el PDF del estado de cuenta.'}, status=400)

        period = (request.data.get('period') or '').strip()
        if not period or len(period) < 7:
            return Response({'detail': 'Indica el período (YYYY-MM).'}, status=400)

        profile = (request.data.get('bank_profile') or settings.get('bank_profile') or 'generic').strip()
        focus = (request.data.get('focus') or 'ingresos').strip()
        raw = upload.read()
        filename = getattr(upload, 'name', '') or f'estado-bancario-{period}.pdf'

        units = _units_payload(tenant) if settings.get('auto_suggest_unit', True) else []
        result = parse_bank_statement_pdf(raw, bank_profile=profile, units=units)
        if not result.get('ok'):
            return Response({
                'detail': result.get('error') or 'No se pudo interpretar el estado de cuenta.',
                'meta': result.get('meta'),
                'summary': result.get('summary'),
            }, status=400)

        try:
            stmt = _upsert_bank_statement(tenant, period, raw, filename)
        except Exception:
            logger.exception('Rita: no se pudo guardar BankStatement %s %s', tenant_id, period)
            return Response({'detail': 'Se leyó el PDF pero no se pudo guardar en Estado General.'}, status=500)

        session = _create_session(
            tenant, period, profile, result, filename,
            request.user, bank_statement=stmt,
        )
        payload = _session_payload(session, focus=focus)
        payload['capabilities'] = _rita_caps_payload(tenant, request.user)
        return Response(payload, status=201)


class RitaParseFromStatementView(APIView):
    """POST: usa BankStatement guardado del período."""
    permission_classes = [IsAuthenticated, HasRitaCapability]
    rita_capabilities = ('ingresos', 'egresos', 'bank_upload')

    def post(self, request, tenant_id):
        tenant = _get_tenant(tenant_id)
        if not tenant:
            return Response({'detail': 'Tenant no encontrado.'}, status=404)

        settings = tenant.rita_settings or {}
        if settings.get('enabled') is False:
            return Response({'detail': 'Rita está desactivada para este condominio.'}, status=400)

        period = (request.data.get('period') or '').strip()
        if not period or len(period) < 7:
            return Response({'detail': 'Indica el período (YYYY-MM).'}, status=400)

        focus = (request.data.get('focus') or 'ingresos').strip()
        force = bool(request.data.get('force'))

        stmt = BankStatement.objects.filter(tenant=tenant, period=period).first()
        if not stmt:
            return Response({
                'detail': 'No hay estado de cuenta guardado para este período. Súbelo en Estado General o con Rita.',
            }, status=404)

        raw = _read_statement_bytes(stmt)
        if not raw:
            return Response({'detail': 'El estado bancario del período no tiene archivo PDF.'}, status=404)

        existing = (
            RitaBankSession.objects.filter(
                tenant=tenant, period=period, status='open', bank_statement=stmt,
            ).order_by('-created_at').first()
        )
        if existing and not force:
            payload = _session_payload(existing, focus=focus)
            payload['capabilities'] = _rita_caps_payload(tenant, request.user)
            return Response(payload)

        profile = (
            request.data.get('bank_profile')
            or settings.get('bank_profile')
            or (existing.bank_profile if existing else None)
            or 'generic'
        ).strip()

        units = _units_payload(tenant) if settings.get('auto_suggest_unit', True) else []
        result = parse_bank_statement_pdf(raw, bank_profile=profile, units=units)
        if not result.get('ok'):
            return Response({
                'detail': result.get('error') or 'No se pudo interpretar el estado de cuenta.',
                'meta': result.get('meta'),
                'summary': result.get('summary'),
            }, status=400)

        filename = ''
        if getattr(stmt.statement_file, 'name', None):
            filename = stmt.statement_file.name.rsplit('/', 1)[-1]
        filename = filename or f'estado-bancario-{period}.pdf'

        session = _create_session(
            tenant, period, profile, result, filename,
            request.user, bank_statement=stmt,
        )
        payload = _session_payload(session, focus=focus)
        payload['capabilities'] = _rita_caps_payload(tenant, request.user)
        return Response(payload, status=201)


class RitaSessionDetailView(APIView):
    permission_classes = [IsAuthenticated, HasRitaCapability]
    rita_capabilities = ('ingresos', 'egresos', 'bank_upload')

    def get(self, request, tenant_id, session_id):
        tenant = _get_tenant(tenant_id)
        if not tenant:
            return Response({'detail': 'Tenant no encontrado.'}, status=404)
        try:
            session = RitaBankSession.objects.get(pk=session_id, tenant=tenant)
        except RitaBankSession.DoesNotExist:
            return Response({'detail': 'Sesión no encontrada.'}, status=404)
        focus = (request.query_params.get('focus') or 'ingresos').strip()
        payload = _session_payload(session, focus=focus)
        payload['capabilities'] = _rita_caps_payload(tenant, request.user)
        return Response(payload)


class RitaMovementActionView(APIView):
    """
    POST: skip | assign | reset
    Assign de ingreso requiere cap ingresos; egreso requiere egresos.
    """
    permission_classes = [IsAuthenticated, HasRitaCapability]
    rita_capabilities = ('ingresos', 'egresos')

    def post(self, request, tenant_id, session_id):
        tenant = _get_tenant(tenant_id)
        if not tenant:
            return Response({'detail': 'Tenant no encontrado.'}, status=404)
        try:
            session = RitaBankSession.objects.get(pk=session_id, tenant=tenant)
        except RitaBankSession.DoesNotExist:
            return Response({'detail': 'Sesión no encontrada.'}, status=404)

        action = (request.data.get('action') or '').strip()
        mid = (request.data.get('movement_id') or '').strip()
        focus = (request.data.get('focus') or request.query_params.get('focus') or 'ingresos').strip()
        if not action or not mid:
            return Response({'detail': 'action y movement_id son obligatorios.'}, status=400)

        movs = list(session.movements or [])
        found = None
        for m in movs:
            if str(m.get('id')) == mid:
                found = m
                break
        if not found:
            return Response({'detail': 'Movimiento no encontrado.'}, status=404)

        kind = found.get('kind')
        if action in ('assign', 'skip', 'reset'):
            need = 'egresos' if kind == 'egreso' else 'ingresos'
            if not user_has_rita_capability(tenant, request.user, need):
                return Response({
                    'detail': f'Sin permiso Rita para {need}.',
                }, status=403)

        if action == 'skip':
            found['status'] = 'skipped'
        elif action == 'assign':
            found['status'] = 'assigned'
            if request.data.get('payment_id'):
                found['payment_id'] = str(request.data['payment_id'])
            if request.data.get('gasto_id'):
                found['gasto_id'] = str(request.data['gasto_id'])
            if request.data.get('unit_id'):
                found['assigned_unit_id'] = str(request.data['unit_id'])
            if request.data.get('field_id'):
                found['assigned_field_id'] = str(request.data['field_id'])
        elif action == 'reset':
            found['status'] = 'pending'
            found.pop('payment_id', None)
            found.pop('gasto_id', None)
            found.pop('assigned_unit_id', None)
            found.pop('assigned_field_id', None)
        else:
            return Response({'detail': 'Acción no válida.'}, status=400)

        session.movements = movs
        pending_ing = [m for m in movs if m.get('kind') == 'ingreso' and m.get('status') == 'pending']
        pending_egr = [m for m in movs if m.get('kind') == 'egreso' and m.get('status') == 'pending']
        if not pending_ing and not pending_egr and session.status == 'open':
            session.status = 'completed'
        session.save(update_fields=['movements', 'status', 'updated_at'])
        payload = _session_payload(session, focus=focus)
        payload['capabilities'] = _rita_caps_payload(tenant, request.user)
        return Response(payload)
