"""
Homly — API Views
All endpoints for the property management system.
"""
import uuid
import json
import threading
from decimal import Decimal
from django.db.models import Sum, Count, Q, F  # noqa: F401 - Q used in estado cuenta
from django.conf import settings
from django.http import HttpResponse
from datetime import timedelta
from django.utils import timezone
from rest_framework import viewsets, status, generics, permissions
from rest_framework.decorators import api_view, permission_classes, action
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from .models import (
    User, Tenant, TenantUser, Unit, ExtraField,
    Payment, FieldPayment, GastoEntry, CajaChicaEntry,
    BankStatement, ClosedPeriod, ReopenRequest,
    PeriodClosureRequest, PeriodClosureStep,
    AssemblyPosition, Committee, UnrecognizedIncome,
    AmenityReservation, CondominioRequest, EmailVerificationCode,
    Notification, AuditLog, PaymentPlan, SubscriptionPlan, TenantSubscription,
    SubscriptionPayment,
)
from .email_service import (
    send_verification_email, send_notification_email, CODE_EXPIRY_MINUTES,
    send_payment_plan_email, send_trial_welcome_email, send_trial_approved_email,
    send_trial_rejected_email,
)
from .serializers import (
    LoginSerializer, RequestCodeSerializer, LoginWithCodeSerializer,
    UserSerializer, UserCreateSerializer,
    TenantListSerializer, TenantDetailSerializer, TenantUserSerializer,
    UnitSerializer, UnitListSerializer, ExtraFieldSerializer,
    PaymentSerializer, PaymentCaptureSerializer, AddAdditionalPaymentSerializer, FieldPaymentSerializer,
    GastoEntrySerializer, CajaChicaEntrySerializer,
    BankStatementSerializer, ClosedPeriodSerializer, ReopenRequestSerializer,
    PeriodClosureRequestSerializer,
    AssemblyPositionSerializer, CommitteeSerializer, UnrecognizedIncomeSerializer,
    DashboardSerializer, AmenityReservationSerializer, CondominioRequestSerializer,
    NotificationSerializer, AuditLogSerializer, PaymentPlanSerializer,
    SubscriptionPlanSerializer, TenantSubscriptionSerializer,
    SubscriptionPaymentSerializer,
)
from .permissions import IsSuperAdmin, IsTenantAdmin, IsTenantMember, IsAdminOrTesorero, IsAdminOrTesOrAuditor, CanApproveReservation


# ═══════════════════════════════════════════════════════════
#  NOTIFICATION HELPERS
# ═══════════════════════════════════════════════════════════

# Maps each notification type to the module key that must be enabled
# for the recipient role (via tenant.module_permissions).
_NOTIF_MODULE_MAP = {
    'reservation_new':       'reservas',
    'reservation_approved':  'reservas',
    'reservation_rejected':  'reservas',
    'reservation_cancelled': 'reservas',
    'payment_registered':    'estado_cuenta',
    'payment_updated':       'estado_cuenta',
    'payment_deleted':       'estado_cuenta',
    'period_closed':         'cobranza',
    'period_reopened':       'cobranza',
    # Plan de pagos
    'plan_proposal_sent':    'plan_pagos',
    'plan_accepted':         'plan_pagos',
    'plan_rejected':         'plan_pagos',
    'plan_cancelled':        'plan_pagos',
}


def _role_has_module(module_perms, role, module_key):
    """Return True if *role* has access to *module_key* given tenant module_permissions.
    When module_permissions is empty / not configured, all modules are accessible.

    Supports two formats:
    - Old format: { role: ['module1', 'module2', ...] }  (list of allowed modules)
    - New format: { role: { module_key: 'write'|'read'|'hidden' } }
    """
    if not module_perms:
        return True
    role_modules = module_perms.get(role)
    if role_modules is None:
        return True   # role not explicitly restricted → allow
    if isinstance(role_modules, dict):
        # New format: check the level value; 'hidden' means no access
        level = role_modules.get(module_key)
        if level is None:
            return True   # not in dict → not restricted
        return level != 'hidden'
    # Old format: list of allowed module keys
    return module_key in role_modules


def _notify_roles(tenant_id, roles, notif_type, title, message='', **extra_fields):
    """Create notifications for every TenantUser whose role is in *roles*,
    respecting the tenant's per-role module-permission configuration.
    Also sends a branded alert email to each recipient in a background thread."""
    required_module = _NOTIF_MODULE_MAP.get(notif_type)
    try:
        tenant = Tenant.objects.get(id=tenant_id)
        module_perms = tenant.module_permissions or {}
    except Tenant.DoesNotExist:
        return

    notifs = []
    recipients = []   # list of (email, user_name)
    for role in roles:
        if required_module and not _role_has_module(module_perms, role, required_module):
            continue
        for tu in TenantUser.objects.filter(tenant_id=tenant_id, role=role).select_related('user'):
            notifs.append(Notification(
                tenant_id=tenant_id,
                user=tu.user,
                notif_type=notif_type,
                title=title,
                message=message,
                **extra_fields,
            ))
            if tu.user.email:
                recipients.append((tu.user.email, tu.user.name or tu.user.email))
    if notifs:
        Notification.objects.bulk_create(notifs)
    if recipients:
        tenant_name = tenant.name
        def _send_all():
            for email, user_name in recipients:
                send_notification_email(
                    email=email,
                    user_name=user_name,
                    notif_type=notif_type,
                    title=title,
                    message=message,
                    tenant_name=tenant_name,
                )
        threading.Thread(target=_send_all, daemon=True).start()


def _notify_unit_residents(tenant_id, unit_id, notif_type, title, message='', **extra_fields):
    """Create notifications for all vecinos assigned to *unit_id*,
    respecting tenant module permissions.
    Also sends a branded alert email to each resident in a background thread."""
    if not unit_id:
        return
    required_module = _NOTIF_MODULE_MAP.get(notif_type)
    try:
        tenant = Tenant.objects.get(id=tenant_id)
        module_perms = tenant.module_permissions or {}
    except Tenant.DoesNotExist:
        return

    if required_module and not _role_has_module(module_perms, 'vecino', required_module):
        return

    notifs = []
    recipients = []   # list of (email, user_name)
    for tu in TenantUser.objects.filter(
        tenant_id=tenant_id, unit_id=unit_id, role='vecino'
    ).select_related('user'):
        notifs.append(Notification(
            tenant_id=tenant_id,
            user=tu.user,
            notif_type=notif_type,
            title=title,
            message=message,
            **extra_fields,
        ))
        if tu.user.email:
            recipients.append((tu.user.email, tu.user.name or tu.user.email))
    if notifs:
        Notification.objects.bulk_create(notifs)
    if recipients:
        tenant_name = tenant.name
        def _send_all():
            for email, user_name in recipients:
                send_notification_email(
                    email=email,
                    user_name=user_name,
                    notif_type=notif_type,
                    title=title,
                    message=message,
                    tenant_name=tenant_name,
                )
        threading.Thread(target=_send_all, daemon=True).start()


# ═══════════════════════════════════════════════════════════
#  AUDIT LOG HELPERS
# ═══════════════════════════════════════════════════════════

def _get_client_ip(request):
    """Extract real client IP from request headers."""
    forwarded = request.META.get('HTTP_X_FORWARDED_FOR')
    if forwarded:
        return forwarded.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR')


def _audit_log(request, module, action, description,
               tenant_id=None, object_type='', object_id='',
               object_repr='', extra_data=None):
    """Create an AuditLog entry. Always wrapped in try/except so it
    never interrupts the main request flow."""
    try:
        user    = getattr(request, 'user', None)
        ip      = _get_client_ip(request)

        # Resolve tenant snapshot
        tenant      = None
        tenant_name = ''
        if tenant_id:
            try:
                tenant      = Tenant.objects.get(id=tenant_id)
                tenant_name = tenant.name
            except Tenant.DoesNotExist:
                pass

        # Resolve user snapshot
        user_name  = ''
        user_email = ''
        user_role  = ''
        if user and getattr(user, 'is_authenticated', False):
            user_name  = getattr(user, 'name', '') or getattr(user, 'email', '')
            user_email = getattr(user, 'email', '')
            if tenant_id:
                tu = TenantUser.objects.filter(tenant_id=tenant_id, user=user).first()
                user_role = tu.role if tu else ('superadmin' if getattr(user, 'is_super_admin', False) else '')
            elif getattr(user, 'is_super_admin', False):
                user_role = 'superadmin'

        AuditLog.objects.create(
            tenant      = tenant,
            tenant_name = tenant_name,
            user        = user if user and getattr(user, 'is_authenticated', False) else None,
            user_name   = user_name,
            user_email  = user_email,
            user_role   = user_role,
            module      = module,
            action      = action,
            description = description,
            object_type = object_type,
            object_id   = str(object_id) if object_id else '',
            object_repr = object_repr or '',
            ip_address  = ip,
            extra_data  = extra_data or {},
        )
    except Exception:
        pass  # audit logs must never break the main flow


# ═══════════════════════════════════════════════════════════
#  AUTH — helpers y vistas de autenticación
# ═══════════════════════════════════════════════════════════

# ── Cookie helpers (M-06: JWT en HttpOnly cookie) ─────────────────────────────
_REFRESH_COOKIE_NAME  = 'homly_refresh'
_REFRESH_COOKIE_AGE   = 7 * 24 * 3600  # 7 días (igual que SIMPLE_JWT REFRESH_TOKEN_LIFETIME)


def _set_refresh_cookie(response, refresh_token_str):
    """
    Agrega el refresh token como cookie HttpOnly al response.
    HttpOnly → no accesible por JavaScript (protección XSS).
    Secure  → solo enviada por HTTPS en producción.
    SameSite=Strict → protección CSRF.
    """
    response.set_cookie(
        _REFRESH_COOKIE_NAME,
        str(refresh_token_str),
        max_age=_REFRESH_COOKIE_AGE,
        httponly=True,
        secure=not getattr(settings, 'DEBUG', True),  # Secure solo en producción
        samesite='Strict',
        path='/api/auth/',  # Solo se envía a endpoints de auth
    )
    return response


def _clear_refresh_cookie(response):
    """Elimina la cookie del refresh token (logout)."""
    response.delete_cookie(
        _REFRESH_COOKIE_NAME,
        path='/api/auth/',
        samesite='Strict',
    )
    return response


class CookieTokenRefreshView(APIView):
    """
    POST /api/auth/token/refresh/
    Lee el refresh token desde la cookie HttpOnly (no desde el body).
    Devuelve un nuevo access token y rota el refresh token en la cookie.
    (M-06: sustituye el endpoint de simplejwt que lee del body)
    """
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        refresh_str = request.COOKIES.get(_REFRESH_COOKIE_NAME)
        if not refresh_str:
            return Response(
                {'detail': 'No hay sesión activa. Inicia sesión nuevamente.'},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        try:
            refresh = RefreshToken(refresh_str)
            new_access = str(refresh.access_token)
            # Rotación del refresh token
            refresh.blacklist()
            new_refresh = RefreshToken.for_user(
                User.objects.get(id=refresh['user_id'])
            )
            # Copiar claims personalizados
            for claim in ('role', 'tenant_id'):
                if claim in refresh:
                    new_refresh[claim] = refresh[claim]
            response = Response({'access': new_access})
            _set_refresh_cookie(response, new_refresh)
            return response
        except Exception:
            response = Response(
                {'detail': 'Sesión expirada. Inicia sesión nuevamente.'},
                status=status.HTTP_401_UNAUTHORIZED,
            )
            _clear_refresh_cookie(response)
            return response


class LogoutView(APIView):
    """
    POST /api/auth/logout/
    Blacklistea el refresh token de la cookie y la elimina.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        refresh_str = request.COOKIES.get(_REFRESH_COOKIE_NAME)
        if refresh_str:
            try:
                RefreshToken(refresh_str).blacklist()
            except Exception:
                pass  # Ya expirado o inválido; eliminar la cookie igualmente
        response = Response({'detail': 'Sesión cerrada correctamente.'})
        _clear_refresh_cookie(response)
        return response


class LoginView(APIView):
    """POST /api/auth/login/"""
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user       = serializer.validated_data['user']
        role       = serializer.validated_data['role']
        tenant     = serializer.validated_data.get('tenant')
        profile_id = serializer.validated_data.get('profile_id', '')

        refresh = RefreshToken.for_user(user)
        # Add custom claims
        refresh['role'] = role
        if tenant:
            refresh['tenant_id'] = str(tenant.id)

        response_data = {
            'access': str(refresh.access_token),
            # 'refresh' omitido del body — se envía como HttpOnly cookie (M-06)
            'user': UserSerializer(user).data,
            'role': role,
            'tenant_id': str(tenant.id) if tenant else None,
            'tenant_name': tenant.name if tenant else None,
            'must_change_password': user.must_change_password,
            'profile_id': profile_id or '',
        }
        # Audit log — set user on request so _audit_log can read it
        request.user = user
        _audit_log(
            request, module='auth', action='login',
            description=f'Inicio de sesión: {user.email} (rol: {role})',
            tenant_id=str(tenant.id) if tenant else None,
            object_type='User', object_id=str(user.id),
            object_repr=user.email,
            extra_data={'role': role},
        )
        response = Response(response_data)
        _set_refresh_cookie(response, refresh)  # M-06: HttpOnly cookie
        return response


class RequestCodeView(APIView):
    """POST /api/auth/request-code/
    Generates a 6-digit code, stores it, and sends it via email.
    Implement send_verification_email() in core/email_service.py with your SMTP/variables.
    """
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = RequestCodeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data['email']

        # Generate 6-digit code
        import random
        code = ''.join(str(random.randint(0, 9)) for _ in range(6))
        expires_at = timezone.now() + timedelta(minutes=CODE_EXPIRY_MINUTES)

        # Invalidate any previous unused codes for this email
        EmailVerificationCode.objects.filter(
            email=email, used=False
        ).update(used=True)

        # Create new code
        EmailVerificationCode.objects.create(
            email=email,
            code=code,
            expires_at=expires_at,
        )

        # Send email — implement in core/email_service.py
        sent = send_verification_email(email, code)
        if not sent:
            return Response(
                {'detail': 'No se pudo enviar el correo. Intenta de nuevo.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        return Response({
            'detail': f'Código enviado a {email}. Válido por {CODE_EXPIRY_MINUTES} minutos.',
            'expires_in_minutes': CODE_EXPIRY_MINUTES,
        })


class LoginWithCodeView(APIView):
    """POST /api/auth/login-with-code/
    Login using email + verification code. Returns same JWT payload as password login.
    """
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = LoginWithCodeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user       = serializer.validated_data['user']
        role       = serializer.validated_data['role']
        tenant     = serializer.validated_data.get('tenant')
        profile_id = serializer.validated_data.get('profile_id', '')

        # Code-only auth: no passwords. Clear must_change_password so we never prompt.
        if user.must_change_password:
            user.must_change_password = False
            user.save(update_fields=['must_change_password'])

        refresh = RefreshToken.for_user(user)
        refresh['role'] = role
        if tenant:
            refresh['tenant_id'] = str(tenant.id)

        response = Response({
            'access': str(refresh.access_token),
            # 'refresh' omitido del body — se envía como HttpOnly cookie (M-06)
            'user': UserSerializer(user).data,
            'role': role,
            'tenant_id': str(tenant.id) if tenant else None,
            'tenant_name': tenant.name if tenant else None,
            'must_change_password': False,  # Code-only: never prompt for password
            'profile_id': profile_id or '',
        })
        _set_refresh_cookie(response, refresh)  # M-06: HttpOnly cookie
        return response


class CheckEmailView(APIView):
    """GET /api/auth/check-email/?email=...
    Returns whether the email belongs to an existing user and their basic info.
    Used by the admin form to decide between creating vs. associating a user.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        email = (request.query_params.get('email') or '').strip().lower()
        if not email:
            return Response({'exists': False})
        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            return Response({'exists': False})
        # B-01: Solo devolver boolean — no exponer id, name ni email del usuario encontrado.
        return Response({'exists': True})


class SwitchTenantView(APIView):
    """POST /api/auth/switch-tenant/ — Issue a new JWT for a different tenant."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        tenant_id = request.data.get('tenant_id')
        if not tenant_id:
            return Response({'detail': 'tenant_id requerido.'}, status=400)
        user = request.user
        profile_id = ''
        if user.is_super_admin:
            try:
                tenant = Tenant.objects.get(id=tenant_id)
            except Tenant.DoesNotExist:
                return Response({'detail': 'Tenant no encontrado.'}, status=404)
            role = 'superadmin'
        else:
            try:
                tu = TenantUser.objects.select_related('tenant').get(
                    user=user, tenant_id=tenant_id
                )
            except TenantUser.DoesNotExist:
                return Response({'detail': 'No tienes acceso a este condominio.'}, status=403)
            tenant     = tu.tenant
            role       = tu.role
            profile_id = tu.profile_id or ''
        refresh = RefreshToken.for_user(user)
        refresh['role']      = role
        refresh['tenant_id'] = str(tenant.id)
        response = Response({
            'access':               str(refresh.access_token),
            # 'refresh' omitido del body — se envía como HttpOnly cookie (M-06)
            'user':                 UserSerializer(user).data,
            'role':                 role,
            'tenant_id':            str(tenant.id),
            'tenant_name':          tenant.name,
            'must_change_password': user.must_change_password,
            'profile_id':           profile_id,
        })
        _set_refresh_cookie(response, refresh)  # M-06: HttpOnly cookie
        return response


class UserTenantsView(APIView):
    """GET /api/auth/my-tenants/ — Return all tenants the authenticated user belongs to."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        if user.is_super_admin:
            tenants = Tenant.objects.all().values('id', 'name')
            return Response([{'id': str(t['id']), 'name': t['name']} for t in tenants])
        qs = TenantUser.objects.filter(user=user).select_related('tenant')
        return Response([{'id': str(tu.tenant.id), 'name': tu.tenant.name} for tu in qs])


class ProtectedMediaView(APIView):
    """
    GET /api/media/<path>/
    M-04: Sirve archivos de media solo a usuarios autenticados.
    Delega la entrega real del archivo a Nginx via X-Accel-Redirect
    (la respuesta real viene de Nginx desde el location /protected-media/ internal).
    En desarrollo (DEBUG=True) sirve el archivo directamente desde MEDIA_ROOT.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, media_path):
        import os
        import mimetypes
        full_path = os.path.join(str(settings.MEDIA_ROOT), media_path)
        if not os.path.exists(full_path):
            return Response({'detail': 'Archivo no encontrado.'}, status=404)

        if settings.DEBUG:
            # Desarrollo: servir directamente
            with open(full_path, 'rb') as f:
                content = f.read()
            content_type, _ = mimetypes.guess_type(full_path)
            resp = HttpResponse(content, content_type=content_type or 'application/octet-stream')
            resp['Content-Disposition'] = f'inline; filename="{os.path.basename(full_path)}"'
            return resp
        else:
            # Producción: X-Accel-Redirect — Nginx entrega el archivo desde /protected-media/
            resp = HttpResponse()
            resp['X-Accel-Redirect'] = f'/protected-media/{media_path}'
            resp['Content-Type'] = ''  # Nginx infiere el Content-Type
            return resp


class TenantListForLoginView(APIView):
    """GET /api/auth/tenants/ — List tenants for login dropdown (legacy)"""
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        tenants = Tenant.objects.all().values('id', 'name')
        return Response(list(tenants))


class TenantsForEmailView(APIView):
    """POST /api/auth/tenants-for-email/
    Returns the list of tenants the email can log into, plus a flag indicating
    whether the user is a superadmin (who sees all tenants).
    Response: { is_super_admin: bool, tenants: [{id, name}] }
    Returns { is_super_admin: false, tenants: [] } when email is unknown (never leak existence).
    """
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        email = (request.data.get('email') or '').strip().lower()
        if not email:
            return Response({'is_super_admin': False, 'tenants': []})

        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            # Don't reveal whether the email exists
            return Response({'is_super_admin': False, 'tenants': []})

        # Inactive account — return empty to avoid leaking existence
        if not user.is_active:
            return Response({'is_super_admin': False, 'tenants': []})

        # Super admin — can access every tenant in the system
        if user.is_super_admin:
            try:
                tenants = list(
                    Tenant.objects.all().order_by('name').values('id', 'name')
                )
                return Response({
                    'is_super_admin': True,
                    'tenants': [{'id': str(t['id']), 'name': t['name']} for t in tenants],
                })
            except Exception:
                return Response(
                    {'detail': 'Error al obtener los condominios.'},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )

        # Regular user — only their assigned tenants
        try:
            qs = (
                TenantUser.objects
                .filter(user=user)
                .select_related('tenant')
                .order_by('tenant__name')
            )
            tenants = [
                {'id': str(tu.tenant.id), 'name': tu.tenant.name}
                for tu in qs
            ]
            return Response({'is_super_admin': False, 'tenants': tenants})
        except Exception:
            return Response(
                {'detail': 'Error al obtener los condominios.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


# ═══════════════════════════════════════════════════════════
#  TENANTS (Super Admin)
# ═══════════════════════════════════════════════════════════

class TenantViewSet(viewsets.ModelViewSet):
    """CRUD /api/tenants/"""
    queryset = Tenant.objects.all()
    permission_classes = [permissions.IsAuthenticated]

    def get_serializer_class(self):
        if self.action == 'list':
            return TenantListSerializer
        return TenantDetailSerializer

    def get_permissions(self):
        if self.action in ['create', 'destroy']:
            return [IsSuperAdmin()]
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        user = self.request.user
        if not user or not user.is_authenticated:
            return Tenant.objects.none()
        # Pre-fetch subscription + plan to avoid N+1 queries in TenantListSerializer
        qs_base = Tenant.objects.select_related('subscription', 'subscription__plan')
        if user.is_super_admin:
            return qs_base.all()
        # Regular users: only tenants they belong to
        tenant_ids = TenantUser.objects.filter(user=user).values_list('tenant_id', flat=True)
        return qs_base.filter(id__in=tenant_ids)

    def perform_create(self, serializer):
        obj = serializer.save()
        _audit_log(self.request, 'tenants', 'create',
                   f'Tenant creado: {obj.name}',
                   object_type='Tenant', object_id=str(obj.id), object_repr=obj.name)

    def perform_update(self, serializer):
        obj = serializer.save()
        _audit_log(self.request, 'tenants', 'update',
                   f'Tenant actualizado: {obj.name}',
                   object_type='Tenant', object_id=str(obj.id), object_repr=obj.name)

    def perform_destroy(self, instance):
        """
        Physical deletion is disabled for tenants.
        If the tenant has any records in any module, return 409 Conflict.
        Otherwise (completely empty tenant), also block and suggest hibernation —
        the correct action is always hibernate, never hard-delete.
        """
        from rest_framework.exceptions import PermissionDenied
        from .models import (
            Unit, TenantUser, Payment, GastoEntry, CajaChicaEntry,
            BankStatement, ClosedPeriod, AmenityReservation,
        )
        counts = {
            'unidades':    Unit.objects.filter(tenant=instance).count(),
            'usuarios':    TenantUser.objects.filter(tenant=instance).count(),
            'pagos':       Payment.objects.filter(tenant=instance).count(),
            'gastos':      GastoEntry.objects.filter(tenant=instance).count(),
            'caja_chica':  CajaChicaEntry.objects.filter(tenant=instance).count(),
            'estados_bancarios': BankStatement.objects.filter(tenant=instance).count(),
            'reservas':    AmenityReservation.objects.filter(tenant=instance).count(),
            'periodos':    ClosedPeriod.objects.filter(tenant=instance).count(),
        }
        total = sum(counts.values())
        if total > 0:
            detail = (
                f'No es posible eliminar "{instance.name}" porque tiene {total} '
                f'registro(s) en sus módulos. Usa la acción "hibernar" para '
                f'desactivarlo de forma segura preservando todos sus datos.'
            )
        else:
            detail = (
                f'La eliminación de condominios está deshabilitada. '
                f'Usa la acción "hibernar" para desactivar "{instance.name}" '
                f'de forma segura.'
            )
        raise PermissionDenied(detail)

    # ─── Hibernate / Reactivate ────────────────────────────────

    @action(detail=True, methods=['post'], url_path='hibernate',
            permission_classes=[IsSuperAdmin])
    def hibernate(self, request, pk=None):
        """
        POST /api/tenants/{id}/hibernate/
        Hiberna el tenant: bloquea el acceso de usuarios y deja los datos en
        modo solo-lectura hasta que el superadmin lo reactive.
        Body opcional: { "reason": "..." }
        Responde: { detail, record_counts, total_records }
        """
        tenant = self.get_object()
        if tenant.hibernated:
            return Response(
                {'detail': 'El condominio ya está en modo hibernación.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        reason = (request.data.get('reason') or '').strip()

        # Count records across all modules for informational purposes
        from .models import (
            Unit, TenantUser, Payment, GastoEntry, CajaChicaEntry,
            BankStatement, ClosedPeriod, AmenityReservation,
        )
        record_counts = {
            'unidades':          Unit.objects.filter(tenant=tenant).count(),
            'usuarios':          TenantUser.objects.filter(tenant=tenant).count(),
            'pagos':             Payment.objects.filter(tenant=tenant).count(),
            'gastos':            GastoEntry.objects.filter(tenant=tenant).count(),
            'caja_chica':        CajaChicaEntry.objects.filter(tenant=tenant).count(),
            'estados_bancarios': BankStatement.objects.filter(tenant=tenant).count(),
            'reservas':          AmenityReservation.objects.filter(tenant=tenant).count(),
            'periodos_cerrados': ClosedPeriod.objects.filter(tenant=tenant).count(),
        }
        total_records = sum(record_counts.values())

        tenant.hibernated = True
        tenant.is_active = False
        tenant.hibernation_reason = reason
        tenant.save(update_fields=['hibernated', 'is_active', 'hibernation_reason', 'updated_at'])

        _audit_log(
            request, 'tenants', 'update',
            f'Tenant hibernado: {tenant.name}. '
            f'Razón: {reason or "No especificada"}. '
            f'Registros preservados: {total_records}.',
            object_type='Tenant', object_id=str(tenant.id), object_repr=tenant.name,
        )

        return Response({
            'detail': f'Condominio "{tenant.name}" hibernado correctamente.',
            'record_counts': record_counts,
            'total_records': total_records,
        })

    @action(detail=True, methods=['post'], url_path='reactivate',
            permission_classes=[IsSuperAdmin])
    def reactivate(self, request, pk=None):
        """
        POST /api/tenants/{id}/reactivate/
        Reactiva un tenant previamente hibernado.
        Restaura is_active según el estado de su suscripción (o True si no tiene).
        """
        tenant = self.get_object()
        if not tenant.hibernated:
            return Response(
                {'detail': 'El condominio no está en modo hibernación.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        tenant.hibernated = False
        tenant.hibernation_reason = ''
        tenant.save(update_fields=['hibernated', 'hibernation_reason', 'updated_at'])

        # Restore is_active: sync from subscription status; default to True if no sub
        try:
            tenant.subscription.sync_tenant_active()
        except Exception:
            tenant.is_active = True
            tenant.save(update_fields=['is_active', 'updated_at'])

        _audit_log(
            request, 'tenants', 'update',
            f'Tenant reactivado desde hibernación: {tenant.name}.',
            object_type='Tenant', object_id=str(tenant.id), object_repr=tenant.name,
        )

        return Response({
            'detail': f'Condominio "{tenant.name}" reactivado correctamente.',
        })

    # ─── Onboarding tour state ─────────────────────────────────
    @action(detail=True, methods=['get'], url_path='subscription', permission_classes=[permissions.IsAuthenticated])
    def get_subscription(self, request, pk=None):
        """
        GET /api/tenants/{id}/subscription/
        Returns the subscription for this tenant.
        Accessible to the tenant's own members (admin, tesorero, etc.) and superadmins.
        """
        tenant = self.get_object()
        # Extra guard: non-superadmin must be a member of this tenant
        if not request.user.is_super_admin:
            if not TenantUser.objects.filter(user=request.user, tenant=tenant).exists():
                return Response({'detail': 'No tienes acceso a este condominio.'}, status=403)
        try:
            sub = tenant.subscription
            return Response(TenantSubscriptionSerializer(sub).data)
        except Exception:
            return Response({'detail': 'Sin suscripción registrada.'}, status=404)

    @action(detail=True, methods=['get'], url_path='subscription/payments', permission_classes=[permissions.IsAuthenticated])
    def get_subscription_payments(self, request, pk=None):
        """
        GET /api/tenants/{id}/subscription/payments/
        Returns the payment history for this tenant's subscription.
        Accessible to the tenant's own admin and superadmins.
        """
        tenant = self.get_object()
        # Non-superadmin must be a member of this tenant
        if not request.user.is_super_admin:
            if not TenantUser.objects.filter(user=request.user, tenant=tenant).exists():
                return Response({'detail': 'No tienes acceso a este condominio.'}, status=403)
        try:
            sub = tenant.subscription
            payments = sub.payments.select_related('recorded_by').all()
            return Response(SubscriptionPaymentSerializer(payments, many=True).data)
        except Exception:
            return Response([], status=200)

    @action(detail=True, methods=['post'], url_path='onboarding/complete')
    def mark_onboarding_complete(self, request, pk=None):
        """Marca el tour de onboarding como completado para este tenant."""
        tenant = self.get_object()
        tenant.onboarding_completed = True
        tenant.save(update_fields=['onboarding_completed', 'updated_at'])
        _audit_log(request, 'onboarding', 'complete',
                   f'Onboarding completado: {tenant.name}',
                   tenant_id=str(tenant.id),
                   object_type='Tenant', object_id=str(tenant.id),
                   object_repr=tenant.name)
        return Response({'onboarding_completed': True})

    @action(detail=True, methods=['post'], url_path='onboarding/dismiss')
    def mark_onboarding_dismissed(self, request, pk=None):
        """Marca el banner/auto-launch como descartado ('más tarde')."""
        tenant = self.get_object()
        tenant.onboarding_dismissed_at = timezone.now()
        tenant.save(update_fields=['onboarding_dismissed_at', 'updated_at'])
        return Response({'onboarding_dismissed_at': tenant.onboarding_dismissed_at})

    @action(detail=True, methods=['post'], url_path='onboarding/reset')
    def reset_onboarding(self, request, pk=None):
        """Permite re-ejecutar el tour (desde el menú lateral)."""
        tenant = self.get_object()
        tenant.onboarding_completed = False
        tenant.onboarding_dismissed_at = None
        tenant.save(update_fields=['onboarding_completed',
                                   'onboarding_dismissed_at',
                                   'updated_at'])
        return Response({'onboarding_completed': False,
                         'onboarding_dismissed_at': None})


# ═══════════════════════════════════════════════════════════
#  UNITS
# ═══════════════════════════════════════════════════════════

class UnitViewSet(viewsets.ModelViewSet):
    """CRUD /api/tenants/{tenant_id}/units/"""
    permission_classes = [IsTenantMember]

    def get_serializer_class(self):
        # Lista: serializer ligero sin Base64 de evidencia
        if self.action == 'list':
            return UnitListSerializer
        return UnitSerializer

    def get_queryset(self):
        return Unit.objects.filter(tenant_id=self.kwargs['tenant_id'])

    def perform_create(self, serializer):
        unit = serializer.save(tenant_id=self.kwargs['tenant_id'])
        _audit_log(self.request, 'unidades', 'create',
                   f'Unidad creada: {unit.unit_id_code} — {unit.unit_name}',
                   tenant_id=self.kwargs['tenant_id'],
                   object_type='Unit', object_id=str(unit.id),
                   object_repr=f'{unit.unit_id_code} {unit.unit_name}')
        self._auto_create_vecino(unit)

    def perform_update(self, serializer):
        unit = serializer.save()
        _audit_log(self.request, 'unidades', 'update',
                   f'Unidad actualizada: {unit.unit_id_code} — {unit.unit_name}',
                   tenant_id=self.kwargs['tenant_id'],
                   object_type='Unit', object_id=str(unit.id),
                   object_repr=f'{unit.unit_id_code} {unit.unit_name}')

    def perform_destroy(self, instance):
        from .models import Payment as _Payment
        # Bloquear eliminación si la unidad tiene registros de pago o adeudo previo
        has_records = _Payment.objects.filter(unit=instance).exists()
        has_previous_debt = (instance.previous_debt or 0) != 0

        if has_records or has_previous_debt:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({
                'code': 'has_records',
                'detail': (
                    'Esta unidad tiene historial de pagos o adeudo registrado. '
                    'No puede eliminarse. Puedes inactivarla para dejarla de solo lectura.'
                ),
            })
        _audit_log(self.request, 'unidades', 'delete',
                   f'Unidad eliminada: {instance.unit_id_code} — {instance.unit_name}',
                   tenant_id=self.kwargs['tenant_id'],
                   object_type='Unit', object_id=str(instance.id),
                   object_repr=f'{instance.unit_id_code} {instance.unit_name}')
        instance.delete()

    @action(detail=True, methods=['post'], url_path='inactivate', permission_classes=[IsTenantAdmin])
    def inactivate(self, request, tenant_id=None, pk=None):
        """POST /api/tenants/{tenant_id}/units/{id}/inactivate/
           Marca la unidad como inactiva (solo lectura). No elimina datos."""
        unit = self.get_object()
        if not unit.is_active:
            return Response({'detail': 'La unidad ya está inactiva.'}, status=status.HTTP_200_OK)
        unit.is_active = False
        unit.save(update_fields=['is_active', 'updated_at'])
        _audit_log(request, 'unidades', 'inactivate',
                   f'Unidad inactivada: {unit.unit_id_code} — {unit.unit_name}',
                   tenant_id=tenant_id,
                   object_type='Unit', object_id=str(unit.id),
                   object_repr=f'{unit.unit_id_code} {unit.unit_name}')
        return Response(UnitListSerializer(unit).data)

    @action(detail=True, methods=['post'], url_path='activate', permission_classes=[IsTenantAdmin])
    def activate(self, request, tenant_id=None, pk=None):
        """POST /api/tenants/{tenant_id}/units/{id}/activate/
           Reactiva una unidad previamente inactivada."""
        unit = self.get_object()
        if unit.is_active:
            return Response({'detail': 'La unidad ya está activa.'}, status=status.HTTP_200_OK)
        unit.is_active = True
        unit.save(update_fields=['is_active', 'updated_at'])
        _audit_log(request, 'unidades', 'activate',
                   f'Unidad reactivada: {unit.unit_id_code} — {unit.unit_name}',
                   tenant_id=tenant_id,
                   object_type='Unit', object_id=str(unit.id),
                   object_repr=f'{unit.unit_id_code} {unit.unit_name}')
        return Response(UnitListSerializer(unit).data)

    def _auto_create_vecino(self, unit):
        """
        If the unit has an owner_email, create (or associate) a vecino User
        with is_active=False and link it to this unit via TenantUser.
        Silently skips if email is blank or user already has access.
        """
        email = (unit.owner_email or '').strip().lower()
        if not email:
            return
        owner_name = f'{unit.owner_first_name or ""} {unit.owner_last_name or ""}'.strip() or email

        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            import secrets, string
            alphabet = string.ascii_letters + string.digits
            tmp_pw = ''.join(secrets.choice(alphabet) for _ in range(16))
            user = User.objects.create_user(
                email=email,
                name=owner_name,
                password=tmp_pw,
            )
            user.is_active = False
            user.must_change_password = True
            user.save(update_fields=['is_active', 'must_change_password'])

        # Associate with tenant as vecino (skip if already a member)
        if not TenantUser.objects.filter(user=user, tenant_id=unit.tenant_id).exists():
            TenantUser.objects.create(
                user=user,
                tenant_id=unit.tenant_id,
                role='vecino',
                unit=unit,
            )

    @action(detail=True, methods=['get'], url_path='evidence')
    def evidence(self, request, tenant_id=None, pk=None):
        """GET /api/tenants/{tenant_id}/units/{pk}/evidence/ — devuelve solo el Base64 PDF."""
        unit = self.get_object()
        return Response({'evidence': unit.previous_debt_evidence or ''})

    @action(detail=False, methods=['patch'], url_path='update-my-info')
    def update_my_info(self, request, tenant_id=None):
        """PATCH /api/tenants/{tenant_id}/units/update-my-info/
           Allows a vecino to update their own unit's contact information.
           Only specific contact fields are writable; admin-only fields are ignored."""
        try:
            tenant_user = TenantUser.objects.select_related('unit').get(
                user=request.user, tenant_id=tenant_id
            )
        except TenantUser.DoesNotExist:
            return Response({'detail': 'No tienes acceso a este condominio.'}, status=status.HTTP_403_FORBIDDEN)

        unit = tenant_user.unit
        if not unit:
            # Fallback: find a unit whose owner/coowner/tenant email matches the user
            user_email = (request.user.email or '').strip().lower()
            from django.db.models import Q
            matched_unit = Unit.objects.filter(
                tenant_id=tenant_id
            ).filter(
                Q(owner_email__iexact=user_email) |
                Q(coowner_email__iexact=user_email) |
                Q(tenant_email__iexact=user_email)
            ).first()
            if matched_unit:
                tenant_user.unit = matched_unit
                tenant_user.save(update_fields=['unit'])
                unit = matched_unit
            else:
                return Response(
                    {'detail': 'Tu usuario no tiene una unidad asignada.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        # Whitelist: only contact fields are allowed — admin fields are never touched
        ALLOWED_FIELDS = {
            'owner_first_name', 'owner_last_name', 'owner_email', 'owner_phone',
            'coowner_first_name', 'coowner_last_name', 'coowner_email', 'coowner_phone',
            'tenant_first_name', 'tenant_last_name', 'tenant_email', 'tenant_phone',
            'occupancy',
        }

        VALID_OCCUPANCY = {'propietario', 'rentado', 'vacío'}

        updates = {k: v for k, v in request.data.items() if k in ALLOWED_FIELDS}
        if not updates:
            return Response({'detail': 'No hay campos válidos para actualizar.'}, status=status.HTTP_400_BAD_REQUEST)

        # Validate occupancy value if provided
        if 'occupancy' in updates and updates['occupancy'] not in VALID_OCCUPANCY:
            return Response(
                {'detail': f'Valor de ocupación inválido. Use: {", ".join(sorted(VALID_OCCUPANCY))}'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        for field, value in updates.items():
            setattr(unit, field, value)
        unit.save(update_fields=list(updates.keys()) + ['updated_at'])

        serializer = UnitListSerializer(unit)
        return Response(serializer.data)

    @action(detail=True, methods=['post'], url_path='create-user', permission_classes=[IsTenantAdmin])
    def create_user(self, request, tenant_id=None, pk=None):
        """
        POST /api/tenants/{tenant_id}/units/{pk}/create-user/
        Body: { "persona": "owner" | "coowner" | "tenant" }

        Creates (or associates) a System User with role=vecino for the given
        persona in this unit. Returns the TenantUser record.
        """
        import secrets, string as pystring

        unit = self.get_object()
        persona = request.data.get('persona', 'owner')

        if persona == 'owner':
            email = (unit.owner_email or '').strip().lower()
            first  = unit.owner_first_name or ''
            last   = unit.owner_last_name or ''
        elif persona == 'coowner':
            email = (unit.coowner_email or '').strip().lower()
            first  = unit.coowner_first_name or ''
            last   = unit.coowner_last_name or ''
        elif persona == 'tenant':
            email = (unit.tenant_email or '').strip().lower()
            first  = unit.tenant_first_name or ''
            last   = unit.tenant_last_name or ''
        else:
            return Response({'detail': 'Valor de "persona" inválido. Use: owner, coowner o tenant.'},
                            status=status.HTTP_400_BAD_REQUEST)

        if not email:
            label = {'owner': 'propietario', 'coowner': 'copropietario', 'tenant': 'inquilino'}.get(persona, persona)
            return Response({'detail': f'El {label} no tiene email registrado en esta unidad.'},
                            status=status.HTTP_400_BAD_REQUEST)

        full_name = f'{first} {last}'.strip() or email

        # Get or create the User
        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            alphabet = pystring.ascii_letters + pystring.digits
            tmp_pw = ''.join(secrets.choice(alphabet) for _ in range(16))
            user = User.objects.create_user(email=email, name=full_name, password=tmp_pw)
            user.is_active = True
            user.must_change_password = True
            user.save(update_fields=['is_active', 'must_change_password'])

        # Associate with tenant as vecino (or update existing)
        tenant_user, created = TenantUser.objects.get_or_create(
            user=user,
            tenant_id=unit.tenant_id,
            defaults={'role': 'vecino', 'unit': unit},
        )
        if not created:
            # Already a member — just update name if needed
            if full_name and user.name != full_name:
                user.name = full_name
                user.save(update_fields=['name'])
            return Response(
                {'detail': f'El usuario ya existe en este condominio.',
                 'tenant_user': TenantUserSerializer(tenant_user).data},
                status=status.HTTP_200_OK,
            )

        # Send welcome invitation email (non-blocking)
        try:
            from .email_service import send_welcome_invitation
            tenant_obj = Tenant.objects.get(id=unit.tenant_id)
            unit_name = f'{unit.unit_id_code} — {unit.unit_name}'
            send_welcome_invitation(
                email=user.email,
                user_name=user.name or user.email,
                tenant_name=tenant_obj.name,
                role='vecino',
                unit_name=unit_name,
            )
        except Exception:
            pass

        return Response(
            {'detail': 'Usuario creado y dado de alta como vecino.',
             'tenant_user': TenantUserSerializer(tenant_user).data},
            status=status.HTTP_201_CREATED,
        )


# ═══════════════════════════════════════════════════════════
#  USERS PER TENANT
# ═══════════════════════════════════════════════════════════

class TenantUserViewSet(viewsets.ModelViewSet):
    """CRUD /api/tenants/{tenant_id}/users/"""
    serializer_class = TenantUserSerializer
    permission_classes = [IsTenantAdmin]

    def get_queryset(self):
        return TenantUser.objects.filter(
            tenant_id=self.kwargs['tenant_id']
        ).select_related('user', 'unit', 'tenant')

    def _resolve_role_from_profile(self, profile_id, tenant_id):
        """
        Given a profile_id, look it up in the tenant's custom_profiles and
        return the base_role (used as the actual Django/DRF permission role).
        Returns None if not found.
        """
        if not profile_id:
            return None
        try:
            tenant = Tenant.objects.get(id=tenant_id)
            for p in (tenant.custom_profiles or []):
                if str(p.get('id', '')) == str(profile_id):
                    return p.get('base_role')
        except Tenant.DoesNotExist:
            pass
        return None

    def perform_create(self, serializer):
        profile_id = self.request.data.get('profile_id', '')
        role = serializer.validated_data.get('role')
        # If a custom profile is selected, override role with its base_role
        if profile_id:
            base_role = self._resolve_role_from_profile(profile_id, self.kwargs['tenant_id'])
            if base_role:
                role = base_role
        instance = serializer.save(role=role, profile_id=profile_id)
        _audit_log(self.request, 'usuarios', 'create',
                   f'Usuario asignado: {instance.user.email} (rol: {instance.role})',
                   tenant_id=self.kwargs['tenant_id'],
                   object_type='TenantUser', object_id=str(instance.id),
                   object_repr=f'{instance.user.email} / {instance.role}')

    def perform_update(self, serializer):
        """Also update the related User.name if provided in request data."""
        profile_id = self.request.data.get('profile_id', None)
        kwargs = {}
        if profile_id is not None:
            kwargs['profile_id'] = profile_id
            if profile_id:
                base_role = self._resolve_role_from_profile(profile_id, self.kwargs['tenant_id'])
                if base_role:
                    kwargs['role'] = base_role
            else:
                # Profile cleared — role from the request payload takes over
                pass
        instance = serializer.save(**kwargs)
        name = self.request.data.get('name')
        if name and name.strip():
            instance.user.name = name.strip()
            instance.user.save(update_fields=['name'])
        _audit_log(self.request, 'usuarios', 'update',
                   f'Usuario actualizado: {instance.user.email} (rol: {instance.role})',
                   tenant_id=self.kwargs['tenant_id'],
                   object_type='TenantUser', object_id=str(instance.id),
                   object_repr=f'{instance.user.email} / {instance.role}')

    def perform_destroy(self, instance):
        _audit_log(self.request, 'usuarios', 'delete',
                   f'Usuario removido: {instance.user.email} (rol: {instance.role})',
                   tenant_id=self.kwargs['tenant_id'],
                   object_type='TenantUser', object_id=str(instance.id),
                   object_repr=f'{instance.user.email} / {instance.role}')
        instance.delete()

    @action(detail=True, methods=['post'], url_path='toggle-active')
    def toggle_active(self, request, tenant_id=None, pk=None):
        """
        POST /api/tenants/{tenant_id}/users/{id}/toggle-active/
        Activates or deactivates the user's account (is_active toggle).
        """
        tenant_user = self.get_object()
        user = tenant_user.user
        user.is_active = not user.is_active
        user.save(update_fields=['is_active'])
        state = 'activado' if user.is_active else 'desactivado'
        return Response(
            {'detail': f'Usuario {state}.', 'is_active': user.is_active},
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=['post'], url_path='send-invitation')
    def send_invitation(self, request, tenant_id=None, pk=None):
        """
        POST /api/tenants/{tenant_id}/users/{id}/send-invitation/
        Sends a branded welcome email to the user with access info and login instructions.
        """
        from .email_service import send_welcome_invitation
        tenant_user = self.get_object()
        user = tenant_user.user
        tenant = tenant_user.tenant
        unit = tenant_user.unit
        unit_name = None
        if unit:
            parts = [p for p in [unit.unit_id_code, unit.unit_name] if p]
            unit_name = ' — '.join(parts) if parts else None

        success = send_welcome_invitation(
            email=user.email,
            user_name=user.name or user.email,
            tenant_name=tenant.name,
            role=tenant_user.role,
            unit_name=unit_name,
        )
        if success:
            return Response({'detail': 'Invitación enviada correctamente.'}, status=status.HTTP_200_OK)
        return Response({'detail': 'Error al enviar el correo. Verifica la configuración de email.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class UserCreateView(generics.CreateAPIView):
    """POST /api/users/"""
    serializer_class = UserCreateSerializer
    permission_classes = [permissions.IsAuthenticated]


# ═══════════════════════════════════════════════════════════
#  SUPER ADMINS
# ═══════════════════════════════════════════════════════════

class SuperAdminViewSet(viewsets.ModelViewSet):
    """CRUD /api/super-admins/"""
    serializer_class = UserSerializer
    permission_classes = [IsSuperAdmin]

    def get_queryset(self):
        return User.objects.filter(is_super_admin=True)


# ═══════════════════════════════════════════════════════════
#  EXTRA FIELDS
# ═══════════════════════════════════════════════════════════

class ExtraFieldViewSet(viewsets.ModelViewSet):
    """CRUD /api/tenants/{tenant_id}/extra-fields/"""
    serializer_class = ExtraFieldSerializer

    def get_permissions(self):
        # All tenant members can read fields; only admins can write
        if self.request.method in permissions.SAFE_METHODS:
            return [IsTenantMember()]
        return [IsTenantAdmin()]

    def get_queryset(self):
        return ExtraField.objects.filter(tenant_id=self.kwargs['tenant_id'])

    def perform_create(self, serializer):
        serializer.save(tenant_id=self.kwargs['tenant_id'])


# ═══════════════════════════════════════════════════════════
#  PAYMENTS (Cobranza)
# ═══════════════════════════════════════════════════════════

def _compute_payment_status(payment, tenant, extra_fields, plan_charge=Decimal('0'), plan_key=''):
    """Compute status from main field_payments + additional_payments.
    'parcial' = mantenimiento fijo sin captura + al menos un campo adicional activo con pago,
               O mantenimiento fijo capturado de forma incompleta (abono < cargo).
    Unidades exentas (admin_exempt): cargo de mantenimiento = 0; tipo 'excento' → pagado.

    plan_charge: the installment amount due this period from an active PaymentPlan.
    plan_key: field_key used in FieldPayment to track the plan installment (e.g. 'plan_<uuid>').
    """
    is_exempt = getattr(payment.unit, 'admin_exempt', False)

    all_fp = {}
    for fp in payment.field_payments.all():
        all_fp[fp.field_key] = float(fp.received or 0)
    for ap in payment.additional_payments or []:
        for fk, data in (ap.get('field_payments') or {}).items():
            rec = float(data.get('received', 0) or 0)
            if rec > 0:
                all_fp[fk] = all_fp.get(fk, 0) + rec

    has_non_maintenance_payment = any(v > 0 for k, v in all_fp.items() if k != 'maintenance')

    # Exentas de mantenimiento: cargo base = 0
    maint_charge = 0 if is_exempt else float(tenant.maintenance_fee or 0)
    maint_captured = all_fp.get('maintenance', 0)
    maint_rec = min(maint_captured, maint_charge)
    total_req_charge = maint_charge
    total_req_received = maint_rec
    for ef in extra_fields:
        ch = float(ef.default_amount or 0)
        rc = min(all_fp.get(str(ef.id), 0), ch)
        total_req_charge += ch
        total_req_received += rc

    # Plan installment charge contribution
    if plan_charge and plan_key:
        plan_ch = float(plan_charge)
        plan_rec = min(all_fp.get(plan_key, 0), plan_ch)
        total_req_charge += plan_ch
        total_req_received += plan_rec

    # Exenta sin pagos en campos adicionales: tipo 'excento' → exento directamente
    if is_exempt and payment.payment_type == 'excento' and not has_non_maintenance_payment:
        return 'exento'

    if total_req_received >= total_req_charge:
        return 'pagado'
    if maint_captured == 0 and has_non_maintenance_payment:
        return 'parcial'
    # Pago de mantenimiento base fija registrado de forma incompleta → Parcial
    if maint_charge > 0 and 0 < maint_captured < maint_charge:
        return 'parcial'
    # Catch-all: algún cargo obligatorio tiene pago pero no es suficiente para "pagado".
    # Cubre el caso de mantenimiento cubierto pero cuota del plan solo parcialmente pagada.
    if total_req_received > 0 and total_req_charge > 0:
        return 'parcial'
    return 'pendiente'


class PaymentViewSet(viewsets.ModelViewSet):
    """CRUD /api/tenants/{tenant_id}/payments/"""
    serializer_class = PaymentSerializer
    permission_classes = [IsTenantMember]

    def get_queryset(self):
        qs = Payment.objects.filter(
            tenant_id=self.kwargs['tenant_id']
        ).select_related('unit').prefetch_related('field_payments')

        # M-01: Restricción IDOR — vecino solo ve pagos de su propia unidad.
        # Se aplica antes de cualquier filtro de query params para evitar bypass.
        if not self.request.user.is_super_admin:
            try:
                tu = TenantUser.objects.get(
                    user=self.request.user,
                    tenant_id=self.kwargs['tenant_id'],
                )
                if tu.role == 'vecino':
                    if tu.unit_id:
                        qs = qs.filter(unit_id=tu.unit_id)
                    else:
                        return Payment.objects.none()
                    # Para vecino: solo se aplica filtro de período; no se permite
                    # sobreescribir unit_id desde query params (evita bypass del IDOR).
                    period = self.request.query_params.get('period')
                    if period:
                        qs = qs.filter(period=period)
                    return qs
            except TenantUser.DoesNotExist:
                return Payment.objects.none()

        period = self.request.query_params.get('period')
        if period:
            qs = qs.filter(period=period)

        unit_id = self.request.query_params.get('unit_id')
        if unit_id:
            qs = qs.filter(unit_id=unit_id)

        return qs

    @action(detail=False, methods=['post'], url_path='capture')
    def capture_payment(self, request, tenant_id=None):
        """POST /api/tenants/{tenant_id}/payments/capture/"""
        serializer = PaymentCaptureSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        # Check if period is closed
        if ClosedPeriod.objects.filter(tenant_id=tenant_id, period=data['period']).exists():
            return Response(
                {'detail': 'El periodo está cerrado.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        tenant = Tenant.objects.get(id=tenant_id)

        # Validate applied_to_unit_id belongs to the same tenant
        applied_to_unit_id = data.get('applied_to_unit_id')
        if applied_to_unit_id:
            from .models import Unit as UnitModel
            if not UnitModel.objects.filter(id=applied_to_unit_id, tenant_id=tenant_id).exists():
                return Response({'detail': 'La unidad destino no pertenece a este tenant.'},
                                status=status.HTTP_400_BAD_REQUEST)
            if str(applied_to_unit_id) == str(data['unit_id']):
                applied_to_unit_id = None  # misma unidad = sin redirección

        # Create or update payment
        payment, created = Payment.objects.update_or_create(
            tenant_id=tenant_id,
            unit_id=data['unit_id'],
            period=data['period'],
            defaults={
                'payment_type': data['payment_type'],
                'payment_date': data.get('payment_date'),
                'notes': data.get('notes', ''),
                'folio': data.get('folio', ''),
                'evidence': json.dumps(data.get('evidence', [])),
                'bank_reconciled': data.get('bank_reconciled', False),
                'adeudo_payments': data.get('adeudo_payments', {}),
                'applied_to_unit_id': applied_to_unit_id,
            }
        )

        # Process field payments
        field_payments_data = data.get('field_payments', {})
        for field_key, fp_data in field_payments_data.items():
            FieldPayment.objects.update_or_create(
                payment=payment,
                field_key=field_key,
                defaults={
                    'received': Decimal(str(fp_data.get('received', 0))),
                    'target_unit_id': fp_data.get('targetUnitId'),
                    'adelanto_targets': fp_data.get('adelantoTargets', {}),
                }
            )

        # Auto-compute status (main + additional_payments + active plan installment)
        extra_fields = ExtraField.objects.filter(
            tenant_id=tenant_id, enabled=True, required=True
        )
        payment.refresh_from_db()

        # Check if this unit has an active payment plan with an installment due this period
        plan_charge = Decimal('0')
        plan_key = ''
        active_plan = None
        try:
            active_plan = PaymentPlan.objects.filter(
                tenant_id=tenant_id,
                unit_id=data['unit_id'],
                status='accepted',
            ).first()
            if active_plan:
                period_str = data['period']
                for inst in (active_plan.installments or []):
                    if inst.get('period_key') == period_str:
                        plan_charge = Decimal(str(inst.get('debt_part', 0)))
                        plan_key = active_plan.field_key
                        break
        except Exception:
            pass

        payment.status = _compute_payment_status(
            payment, tenant, list(extra_fields),
            plan_charge=plan_charge, plan_key=plan_key,
        )
        payment.save()

        # Update plan installment statuses after payment capture
        if active_plan:
            try:
                _update_plan_installments(active_plan)
            except Exception:
                pass

        # ── Notify vecinos of the unit ──────────────────────────
        try:
            unit_obj = payment.unit
            period_label = payment.period  # e.g. "2025-03"
            notif_type = 'payment_registered' if created else 'payment_updated'
            notif_title = (
                f'Pago registrado — {unit_obj.unit_id_code}'
                if created else
                f'Pago actualizado — {unit_obj.unit_id_code}'
            )
            notif_msg = f'Período: {period_label}'
            _notify_unit_residents(tenant_id, str(unit_obj.id), notif_type, notif_title, notif_msg)
        except Exception:
            pass  # notifications must never break the main flow
        # ────────────────────────────────────────────────────────

        # ── Audit log ───────────────────────────────────────────
        _audit_log(
            request, 'cobranza', 'create' if created else 'update',
            f'{"Pago registrado" if created else "Pago actualizado"}: unidad {payment.unit.unit_id_code}, período {payment.period}',
            tenant_id=tenant_id,
            object_type='Payment', object_id=str(payment.id),
            object_repr=f'{payment.unit.unit_id_code} / {payment.period}',
        )
        # ────────────────────────────────────────────────────────

        return Response(
            PaymentSerializer(payment).data,
            status=status.HTTP_200_OK if not created else status.HTTP_201_CREATED
        )

    @action(detail=True, methods=['post'], url_path='add-additional')
    def add_additional(self, request, tenant_id=None, pk=None):
        """POST /api/tenants/{tenant_id}/payments/{id}/add-additional/"""
        payment = self.get_object()
        if payment.tenant_id != tenant_id:
            return Response({'detail': 'No encontrado.'}, status=status.HTTP_404_NOT_FOUND)

        if ClosedPeriod.objects.filter(tenant_id=tenant_id, period=payment.period).exists():
            return Response({'detail': 'El periodo está cerrado.'}, status=status.HTTP_400_BAD_REQUEST)

        serializer = AddAdditionalPaymentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        # Validate applied_to_unit_id if provided
        applied_to_unit_id = data.get('applied_to_unit_id')
        if applied_to_unit_id:
            from .models import Unit as UnitModel
            if not UnitModel.objects.filter(id=applied_to_unit_id, tenant_id=tenant_id).exists():
                return Response({'detail': 'La unidad destino no pertenece a este tenant.'},
                                status=status.HTTP_400_BAD_REQUEST)
            if str(applied_to_unit_id) == str(payment.unit_id):
                applied_to_unit_id = None

        total = sum(
            float((v or {}).get('received', 0) or 0)
            for v in (data.get('field_payments') or {}).values()
        )
        if total <= 0:
            return Response(
                {'detail': 'Ingresa al menos un monto mayor a cero.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        new_fp = {}
        for fk, fp_data in (data.get('field_payments') or {}).items():
            rec = float((fp_data or {}).get('received', 0) or 0)
            if rec > 0:
                new_fp[fk] = {'received': rec}

        entry = {
            'id': str(uuid.uuid4()),
            'field_payments': new_fp,
            'payment_type': data['payment_type'],
            'payment_date': (data.get('payment_date') or '').isoformat() if hasattr(data.get('payment_date'), 'isoformat') else str(data.get('payment_date') or ''),
            'notes': data.get('notes', ''),
            'bank_reconciled': data.get('bank_reconciled', False),
            'created_at': timezone.now().isoformat(),
            **({'applied_to_unit_id': str(applied_to_unit_id)} if applied_to_unit_id else {}),
        }
        payment.additional_payments = (payment.additional_payments or []) + [entry]
        tenant = Tenant.objects.get(id=tenant_id)
        extra_fields = ExtraField.objects.filter(
            tenant_id=tenant_id, enabled=True, required=True
        )
        # Include plan installment charge in status calculation
        _add_plan_charge = Decimal('0')
        _add_plan_key = ''
        _add_active_plan = None
        try:
            _add_active_plan = PaymentPlan.objects.filter(
                tenant_id=tenant_id, unit_id=payment.unit_id, status='accepted',
            ).first()
            if _add_active_plan:
                for _inst in (_add_active_plan.installments or []):
                    if _inst.get('period_key') == payment.period:
                        _add_plan_charge = Decimal(str(_inst.get('debt_part', 0)))
                        _add_plan_key = _add_active_plan.field_key
                        break
        except Exception:
            pass
        payment.status = _compute_payment_status(
            payment, tenant, list(extra_fields),
            plan_charge=_add_plan_charge, plan_key=_add_plan_key,
        )
        payment.save()

        # Sync plan installments if there is an active plan for this unit
        try:
            if _add_active_plan:
                _update_plan_installments(_add_active_plan)
        except Exception:
            pass

        return Response(PaymentSerializer(payment).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['delete'], url_path='clear')
    def clear_payment(self, request, tenant_id=None, pk=None):
        """DELETE /api/tenants/{tenant_id}/payments/{id}/clear/"""
        payment = self.get_object()
        # Capture data before deletion for the notification
        try:
            unit_obj   = payment.unit
            period_lbl = payment.period
            unit_id_str = str(unit_obj.id)
            notif_title = f'Cobro eliminado — {unit_obj.unit_id_code}'
            notif_msg   = f'Período: {period_lbl}'
        except Exception:
            unit_id_str = notif_title = notif_msg = None

        # Capture repr before deletion for audit
        pay_id   = str(payment.id)
        pay_repr = f'{payment.unit.unit_id_code} / {payment.period}'

        # Capture active plan before deleting the payment (needed for sync after deletion)
        active_plan_for_sync = None
        try:
            active_plan_for_sync = PaymentPlan.objects.filter(
                tenant_id=tenant_id, unit_id=payment.unit_id, status='accepted',
            ).first()
        except Exception:
            pass

        payment.field_payments.all().delete()
        payment.delete()

        # Sync plan installments after payment deletion
        if active_plan_for_sync:
            try:
                _update_plan_installments(active_plan_for_sync)
            except Exception:
                pass

        # Notify vecinos after deletion
        if unit_id_str:
            try:
                _notify_unit_residents(tenant_id, unit_id_str, 'payment_deleted', notif_title, notif_msg)
            except Exception:
                pass

        # ── Audit log ───────────────────────────────────────────
        _audit_log(
            request, 'cobranza', 'delete',
            f'Cobro eliminado: {pay_repr}',
            tenant_id=tenant_id,
            object_type='Payment', object_id=pay_id,
            object_repr=pay_repr,
        )
        # ────────────────────────────────────────────────────────

        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['delete'], url_path='delete-additional/(?P<additional_id>[^/.]+)')
    def delete_additional(self, request, tenant_id=None, pk=None, additional_id=None):
        """DELETE /api/tenants/{tenant_id}/payments/{id}/delete-additional/{additional_id}/"""
        payment = self.get_object()
        if payment.tenant_id != tenant_id:
            return Response({'detail': 'No encontrado.'}, status=status.HTTP_404_NOT_FOUND)
        if ClosedPeriod.objects.filter(tenant_id=tenant_id, period=payment.period).exists():
            return Response({'detail': 'El periodo está cerrado.'}, status=status.HTTP_400_BAD_REQUEST)
        existing = payment.additional_payments or []
        new_list = [ap for ap in existing if str(ap.get('id', '')) != str(additional_id)]
        if len(new_list) == len(existing):
            return Response({'detail': 'Pago adicional no encontrado.'}, status=status.HTTP_404_NOT_FOUND)
        payment.additional_payments = new_list
        tenant = Tenant.objects.get(id=tenant_id)
        extra_fields = ExtraField.objects.filter(tenant_id=tenant_id, enabled=True, required=True)
        # Include plan installment charge in status calculation
        _del_plan_charge = Decimal('0')
        _del_plan_key = ''
        _del_active_plan = None
        try:
            _del_active_plan = PaymentPlan.objects.filter(
                tenant_id=tenant_id, unit_id=payment.unit_id, status='accepted',
            ).first()
            if _del_active_plan:
                for _inst in (_del_active_plan.installments or []):
                    if _inst.get('period_key') == payment.period:
                        _del_plan_charge = Decimal(str(_inst.get('debt_part', 0)))
                        _del_plan_key = _del_active_plan.field_key
                        break
        except Exception:
            pass
        payment.status = _compute_payment_status(
            payment, tenant, list(extra_fields),
            plan_charge=_del_plan_charge, plan_key=_del_plan_key,
        )
        payment.save()
        # Sync plan installments
        try:
            if _del_active_plan:
                _update_plan_installments(_del_active_plan)
        except Exception:
            pass
        return Response(PaymentSerializer(payment).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['patch'], url_path='update-additional/(?P<additional_id>[^/.]+)')
    def update_additional(self, request, tenant_id=None, pk=None, additional_id=None):
        """PATCH /api/tenants/{tenant_id}/payments/{id}/update-additional/{additional_id}/"""
        payment = self.get_object()
        if payment.tenant_id != tenant_id:
            return Response({'detail': 'No encontrado.'}, status=status.HTTP_404_NOT_FOUND)
        if ClosedPeriod.objects.filter(tenant_id=tenant_id, period=payment.period).exists():
            return Response({'detail': 'El periodo está cerrado.'}, status=status.HTTP_400_BAD_REQUEST)
        existing = payment.additional_payments or []
        data = request.data
        new_fp = {}
        for fk, fp_data in (data.get('field_payments') or {}).items():
            rec = float((fp_data or {}).get('received', 0) or 0)
            if rec > 0:
                new_fp[fk] = {'received': rec}
        updated = False
        new_list = []
        for ap in existing:
            if str(ap.get('id', '')) == str(additional_id):
                ap = dict(ap)
                ap['field_payments'] = new_fp
                ap['payment_type'] = data.get('payment_type', ap.get('payment_type', ''))
                ap['payment_date'] = data.get('payment_date', ap.get('payment_date', ''))
                ap['notes'] = data.get('notes', ap.get('notes', ''))
                ap['bank_reconciled'] = data.get('bank_reconciled', ap.get('bank_reconciled', False))
                updated = True
            new_list.append(ap)
        if not updated:
            return Response({'detail': 'Pago adicional no encontrado.'}, status=status.HTTP_404_NOT_FOUND)
        payment.additional_payments = new_list
        tenant = Tenant.objects.get(id=tenant_id)
        extra_fields = ExtraField.objects.filter(tenant_id=tenant_id, enabled=True, required=True)
        # Include plan installment charge in status calculation
        _upd_plan_charge = Decimal('0')
        _upd_plan_key = ''
        _upd_active_plan = None
        try:
            _upd_active_plan = PaymentPlan.objects.filter(
                tenant_id=tenant_id, unit_id=payment.unit_id, status='accepted',
            ).first()
            if _upd_active_plan:
                for _inst in (_upd_active_plan.installments or []):
                    if _inst.get('period_key') == payment.period:
                        _upd_plan_charge = Decimal(str(_inst.get('debt_part', 0)))
                        _upd_plan_key = _upd_active_plan.field_key
                        break
        except Exception:
            pass
        payment.status = _compute_payment_status(
            payment, tenant, list(extra_fields),
            plan_charge=_upd_plan_charge, plan_key=_upd_plan_key,
        )
        payment.save()
        # Sync plan installments
        try:
            if _upd_active_plan:
                _update_plan_installments(_upd_active_plan)
        except Exception:
            pass
        return Response(PaymentSerializer(payment).data, status=status.HTTP_200_OK)

    def _check_payment_period_open(self, payment):
        """Raise ValidationError if payment's period is closed."""
        if ClosedPeriod.objects.filter(
            tenant_id=payment.tenant_id, period=payment.period
        ).exists():
            from rest_framework.exceptions import ValidationError
            raise ValidationError({
                'detail': f'El período {payment.period} está cerrado. '
                          'No se pueden modificar ni eliminar registros de un período cerrado.'
            })

    def perform_update(self, serializer):
        # Prevent editing payments in closed periods
        self._check_payment_period_open(serializer.instance)
        serializer.save()

    def perform_destroy(self, instance):
        # Prevent deleting payments in closed periods
        self._check_payment_period_open(instance)
        instance.delete()

    @action(detail=True, methods=['get'], url_path='receipt-pdf')
    def receipt_pdf(self, request, tenant_id=None, pk=None):
        """GET /api/tenants/{tenant_id}/payments/{id}/receipt-pdf/
           Returns the payment receipt as a downloadable PDF.
           Vecinos can only download receipts for their own unit."""
        payment = self.get_object()
        unit = payment.unit

        # Vecino authorization: only their own unit
        tu = TenantUser.objects.filter(tenant_id=tenant_id, user=request.user).first()
        if tu and tu.role == 'vecino' and str(tu.unit_id) != str(unit.id):
            return Response({'detail': 'No autorizado.'}, status=status.HTTP_403_FORBIDDEN)

        tenant = Tenant.objects.get(id=tenant_id)
        extra_fields = list(ExtraField.objects.filter(tenant_id=tenant_id, enabled=True))

        receipt_data = _compute_receipt_email_data(payment, unit, tenant, extra_fields)

        pdf_bytes = _generate_receipt_pdf(tenant, unit, payment, receipt_data)
        if pdf_bytes is None:
            return Response(
                {'detail': 'No se pudo generar el PDF. Verifica que reportlab esté instalado.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        period_safe = payment.period.replace('-', '')
        unit_safe = ''.join(c if c.isalnum() or c in '-_' else '_' for c in (unit.unit_id_code or 'unidad'))
        filename = f'recibo_{unit_safe}_{period_safe}.pdf'

        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response

    @action(detail=True, methods=['post'], url_path='send-receipt')
    def send_receipt(self, request, tenant_id=None, pk=None):
        """POST /api/tenants/{tenant_id}/payments/{id}/send-receipt/
           Sends the payment receipt by email to the unit's owner or tenant."""
        payment = self.get_object()
        unit = payment.unit

        # Acepta lista explícita de emails O el campo clásico recipients
        emails_param = request.data.get('emails')  # lista directa: ['a@b.com', ...]
        if emails_param and isinstance(emails_param, list):
            emails = [e.strip() for e in emails_param if isinstance(e, str) and e.strip()]
        else:
            recipients = request.data.get('recipients', 'owner')  # 'owner' | 'tenant' | 'both'
            emails = []
            if recipients in ('owner', 'both') and (unit.owner_email or '').strip():
                emails.append(unit.owner_email.strip())
            if recipients in ('coowner', 'both') and (unit.coowner_email or '').strip():
                emails.append(unit.coowner_email.strip())
            if recipients in ('tenant', 'both') and (unit.tenant_email or '').strip():
                emails.append(unit.tenant_email.strip())

        if not emails:
            return Response(
                {'detail': 'No hay correo electrónico configurado para esta unidad.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        tenant = Tenant.objects.get(id=tenant_id)
        extra_fields = list(ExtraField.objects.filter(tenant_id=tenant_id, enabled=True))

        receipt_data = _compute_receipt_email_data(payment, unit, tenant, extra_fields)

        # Generate PDF attachment
        pdf_bytes = _generate_receipt_pdf(tenant, unit, payment, receipt_data)
        folio_label = receipt_data.get('folio') or str(payment.id)[:8].upper()
        period_label = (payment.period or '').replace('-', '')   # e.g. "202501"
        unit_label = ''.join(c if c.isalnum() or c in '-_' else '_' for c in (unit.unit_id_code or 'unidad'))
        pdf_attachment = (
            f'Recibo_{unit_label}_{period_label}_{folio_label}.pdf',
            pdf_bytes,
            'application/pdf',
        ) if pdf_bytes else None

        from .email_service import send_receipt_email
        ok = send_receipt_email(emails=emails, pdf_attachment=pdf_attachment, **receipt_data)

        if ok:
            return Response({'detail': f'Recibo enviado a {", ".join(emails)}'})
        return Response({'detail': 'Error al enviar el correo. Verifica la configuración SMTP.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# ═══════════════════════════════════════════════════════════
#  GASTOS
# ═══════════════════════════════════════════════════════════

class GastoEntryViewSet(viewsets.ModelViewSet):
    """CRUD /api/tenants/{tenant_id}/gasto-entries/"""
    serializer_class = GastoEntrySerializer
    permission_classes = [IsAdminOrTesOrAuditor]

    def get_queryset(self):
        qs = GastoEntry.objects.filter(
            tenant_id=self.kwargs['tenant_id']
        ).select_related('field')

        period = self.request.query_params.get('period')
        if period:
            qs = qs.filter(period=period)
        return qs

    def _check_gasto_period_open(self, period):
        if ClosedPeriod.objects.filter(tenant_id=self.kwargs['tenant_id'], period=period).exists():
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'detail': f'El período {period} está cerrado y no acepta nuevos registros.'})

    def perform_create(self, serializer):
        period = serializer.validated_data.get('period', '')
        self._check_gasto_period_open(period)
        instance = serializer.save(tenant_id=self.kwargs['tenant_id'])
        _audit_log(
            self.request, 'gastos', 'create',
            f'Gasto registrado: {instance.field.label if instance.field else ""} — período {instance.period}',
            tenant_id=self.kwargs['tenant_id'],
            object_type='GastoEntry', object_id=str(instance.id),
            object_repr=f'{instance.field.label if instance.field else ""} / {instance.period}',
        )

    def perform_update(self, serializer):
        period = serializer.validated_data.get('period', serializer.instance.period)
        self._check_gasto_period_open(period)
        instance = serializer.save()
        _audit_log(
            self.request, 'gastos', 'update',
            f'Gasto actualizado: {instance.field.label if instance.field else ""} — período {instance.period}',
            tenant_id=self.kwargs['tenant_id'],
            object_type='GastoEntry', object_id=str(instance.id),
            object_repr=f'{instance.field.label if instance.field else ""} / {instance.period}',
        )

    def perform_destroy(self, instance):
        self._check_gasto_period_open(instance.period)
        desc = f'{instance.field.label if instance.field else ""} / {instance.period}'
        obj_id = str(instance.id)
        instance.delete()
        _audit_log(
            self.request, 'gastos', 'delete',
            f'Gasto eliminado: {desc}',
            tenant_id=self.kwargs['tenant_id'],
            object_type='GastoEntry', object_id=obj_id,
            object_repr=desc,
        )


# ═══════════════════════════════════════════════════════════
#  CAJA CHICA
# ═══════════════════════════════════════════════════════════

class CajaChicaViewSet(viewsets.ModelViewSet):
    """CRUD /api/tenants/{tenant_id}/caja-chica/"""
    serializer_class = CajaChicaEntrySerializer
    permission_classes = [IsAdminOrTesOrAuditor]

    def get_queryset(self):
        qs = CajaChicaEntry.objects.filter(tenant_id=self.kwargs['tenant_id'])
        period = self.request.query_params.get('period')
        if period:
            qs = qs.filter(period=period)
        return qs

    def _check_caja_period_open(self, period):
        if ClosedPeriod.objects.filter(tenant_id=self.kwargs['tenant_id'], period=period).exists():
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'detail': f'El período {period} está cerrado y no acepta nuevos registros.'})

    def perform_create(self, serializer):
        period = serializer.validated_data.get('period', '')
        self._check_caja_period_open(period)
        instance = serializer.save(tenant_id=self.kwargs['tenant_id'])
        _audit_log(
            self.request, 'gastos', 'create',
            f'Caja chica registrada — período {instance.period}',
            tenant_id=self.kwargs['tenant_id'],
            object_type='CajaChicaEntry', object_id=str(instance.id),
            object_repr=f'CajaChica / {instance.period}',
        )

    def perform_update(self, serializer):
        period = serializer.validated_data.get('period', serializer.instance.period)
        self._check_caja_period_open(period)
        instance = serializer.save()
        _audit_log(
            self.request, 'gastos', 'update',
            f'Caja chica actualizada — período {instance.period}',
            tenant_id=self.kwargs['tenant_id'],
            object_type='CajaChicaEntry', object_id=str(instance.id),
            object_repr=f'CajaChica / {instance.period}',
        )

    def perform_destroy(self, instance):
        self._check_caja_period_open(instance.period)
        desc = f'CajaChica / {instance.period}'
        obj_id = str(instance.id)
        instance.delete()
        _audit_log(
            self.request, 'gastos', 'delete',
            f'Caja chica eliminada: {desc}',
            tenant_id=self.kwargs['tenant_id'],
            object_type='CajaChicaEntry', object_id=obj_id,
            object_repr=desc,
        )


# ═══════════════════════════════════════════════════════════
#  BANK STATEMENTS
# ═══════════════════════════════════════════════════════════

class BankStatementViewSet(viewsets.ModelViewSet):
    """CRUD /api/tenants/{tenant_id}/bank-statements/"""
    serializer_class = BankStatementSerializer
    permission_classes = [IsAdminOrTesorero]

    def get_queryset(self):
        return BankStatement.objects.filter(tenant_id=self.kwargs['tenant_id'])

    def perform_create(self, serializer):
        serializer.save(tenant_id=self.kwargs['tenant_id'])

    def create(self, request, *args, **kwargs):
        """Upsert: if a statement already exists for this period, replace it."""
        period = request.data.get('period')
        file_data = request.data.get('file_data')
        tenant_id = self.kwargs['tenant_id']
        obj, created = BankStatement.objects.update_or_create(
            tenant_id=tenant_id,
            period=period,
            defaults={'file_data': file_data},
        )
        serializer = self.get_serializer(obj)
        st = status.HTTP_201_CREATED if created else status.HTTP_200_OK
        return Response(serializer.data, status=st)


# ═══════════════════════════════════════════════════════════
#  PAYMENT PLANS
# ═══════════════════════════════════════════════════════════

def _update_plan_installments(plan):
    """
    Re-check FieldPayment records for each installment of a PaymentPlan
    and update the JSON installment statuses. Marks the plan as 'completed'
    when all installments are paid.
    """
    from .models import FieldPayment as FP
    plan_key = plan.field_key
    installments = list(plan.installments or [])
    changed = False

    for inst in installments:
        period_key = inst.get('period_key', '')
        total_paid = FP.objects.filter(
            payment__tenant_id=plan.tenant_id,
            payment__unit_id=plan.unit_id,
            payment__period=period_key,
            field_key=plan_key,
        ).aggregate(s=Sum('received'))['s'] or Decimal('0')

        inst_total = Decimal(str(inst.get('debt_part', 0)))
        new_paid_amount = float(total_paid)

        if total_paid >= inst_total and inst_total > 0:
            new_status = 'paid'
        elif total_paid > 0:
            new_status = 'partial'
        else:
            new_status = 'pending'

        if new_status != inst.get('status') or new_paid_amount != inst.get('paid_amount', 0):
            inst['status'] = new_status
            inst['paid_amount'] = new_paid_amount
            changed = True

    if changed:
        plan.installments = installments
        all_paid = all(i.get('status') == 'paid' for i in installments)
        if all_paid and plan.status == 'accepted':
            plan.status = 'completed'
        plan.save()


def _generate_payment_plan_pdf(plan, tenant):
    """
    Generate a PDF document for a PaymentPlan.
    Returns bytes or None if reportlab is not installed.
    """
    import io as _io
    from datetime import datetime as _dt
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib import colors
        from reportlab.lib.units import cm
        from reportlab.platypus import (
            SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, HRFlowable,
        )
        from reportlab.lib.styles import ParagraphStyle
        from reportlab.lib.enums import TA_CENTER, TA_RIGHT, TA_LEFT
    except ImportError:
        return None

    COL_TEAL    = colors.HexColor('#0d7c6e')
    COL_TEAL_LT = colors.HexColor('#e6f4f2')
    COL_INK     = colors.HexColor('#1a1a2e')
    COL_INK_LT  = colors.HexColor('#64748b')
    COL_HDR     = colors.HexColor('#1a1a2e')
    COL_WHITE   = colors.white
    COL_AMBER   = colors.HexColor('#d97706')
    COL_GREEN   = colors.HexColor('#1E594F')
    COL_CORAL   = colors.HexColor('#e84040')
    COL_SAND    = colors.HexColor('#f8f6f1')

    STATUS_COLORS = {
        'draft': COL_AMBER, 'sent': COL_AMBER, 'accepted': COL_TEAL,
        'rejected': COL_CORAL, 'completed': COL_GREEN, 'cancelled': COL_INK_LT,
    }

    buf = _io.BytesIO()
    margin = 1.8 * cm
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=margin, rightMargin=margin,
        topMargin=1.4 * cm, bottomMargin=1.6 * cm,
    )
    W = A4[0] - 2 * margin

    st_hdr_title = ParagraphStyle('HT', fontSize=13, fontName='Helvetica-Bold', textColor=COL_WHITE)
    st_hdr_sub   = ParagraphStyle('HS', fontSize=10, fontName='Helvetica', textColor=colors.HexColor('#b2dcd8'))
    st_hdr_right = ParagraphStyle('HR', fontSize=11, fontName='Helvetica-Bold', textColor=COL_WHITE, alignment=TA_RIGHT)
    st_lbl       = ParagraphStyle('LB', fontSize=8, fontName='Helvetica', textColor=COL_INK_LT)
    st_val       = ParagraphStyle('VL', fontSize=9.5, fontName='Helvetica-Bold', textColor=COL_INK, leading=12)
    st_col_hdr   = ParagraphStyle('CH', fontSize=8.5, fontName='Helvetica-Bold', textColor=COL_WHITE, alignment=TA_CENTER)
    st_cell      = ParagraphStyle('CE', fontSize=8.5, fontName='Helvetica', textColor=COL_INK)
    st_cell_r    = ParagraphStyle('CR', fontSize=8.5, fontName='Helvetica', textColor=COL_INK, alignment=TA_RIGHT)
    st_note      = ParagraphStyle('NT', fontSize=8, fontName='Helvetica-Oblique', textColor=COL_INK_LT)

    story = []

    # ── Header ─────────────────────────────────────────────────────────────
    tenant_display = (getattr(tenant, 'razon_social', '') or tenant.name or '').strip()
    freq_map = {1: 'Mensual', 2: 'Bimestral', 3: 'Trimestral', 6: 'Semestral'}
    freq_label = freq_map.get(plan.frequency, str(plan.frequency))

    # Build address line from tenant fiscal/physical info
    addr_parts = []
    for field in ['info_calle', 'info_colonia', 'info_ciudad', 'info_codigo_postal']:
        val = (getattr(tenant, field, '') or '').strip()
        if val:
            addr_parts.append(val)
    tenant_address = ', '.join(addr_parts) if addr_parts else ''

    # Try to embed tenant logo (base64 stored in tenant.logo)
    logo_image = None
    logo_b64 = (getattr(tenant, 'logo', '') or '').strip()
    if logo_b64:
        try:
            import base64 as _b64
            import io as _io2
            # Strip data URL prefix if present
            if ',' in logo_b64:
                logo_b64 = logo_b64.split(',', 1)[1]
            logo_data = _b64.b64decode(logo_b64)
            from reportlab.platypus import Image as RLImage
            img_buf = _io2.BytesIO(logo_data)
            logo_image = RLImage(img_buf, width=2.2 * cm, height=2.2 * cm)
            logo_image.hAlign = 'LEFT'
        except Exception:
            logo_image = None

    # Header row: logo + tenant name | folio
    if logo_image:
        header_left_content = [
            [logo_image,
             [Paragraph(tenant_display, st_hdr_title),
              Paragraph(tenant_address, st_hdr_sub) if tenant_address else Paragraph('Plan de Pago de Adeudo', st_hdr_sub)]]
        ]
        logo_tbl = Table(header_left_content, colWidths=[2.6 * cm, (W * 0.65) - 2.6 * cm])
        logo_tbl.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ]))
        header_left = logo_tbl
    else:
        header_left = [Paragraph(tenant_display, st_hdr_title),
                       Paragraph(tenant_address or 'Plan de Pago de Adeudo', st_hdr_sub)]

    header_data = [[
        header_left,
        Paragraph(f'Folio: {str(plan.id)[:8].upper()}', st_hdr_right),
    ]]
    header_tbl = Table(header_data, colWidths=[W * 0.65, W * 0.35])
    header_tbl.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), COL_HDR),
        ('ROWPADDING', (0, 0), (-1, -1), 14),
        ('LEFTPADDING', (0, 0), (0, -1), 16),
        ('RIGHTPADDING', (-1, 0), (-1, -1), 16),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    story.append(header_tbl)

    # ── Status badge ───────────────────────────────────────────────────────
    status_color = STATUS_COLORS.get(plan.status, COL_INK_LT)
    status_label_map = {
        'draft': 'Borrador', 'sent': 'Enviado al vecino', 'accepted': 'Aceptado / Activo',
        'rejected': 'Rechazado', 'completed': 'Completado', 'cancelled': 'Cancelado',
    }
    status_label = status_label_map.get(plan.status, plan.status)
    badge_data = [[Paragraph(f'Estado: {status_label}',
                             ParagraphStyle('BD', fontSize=9, fontName='Helvetica-Bold',
                                            textColor=COL_WHITE, alignment=TA_CENTER))]]
    badge_tbl = Table(badge_data, colWidths=[W])
    badge_tbl.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), status_color),
        ('ROWPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(badge_tbl)
    story.append(Spacer(1, 0.3 * cm))

    # ── Unit / Responsible info ─────────────────────────────────────────────
    unit = plan.unit
    unit_label = unit.unit_id_code or ''
    if unit.unit_name:
        unit_label += f' — {unit.unit_name}'
    responsible = (unit.tenant_name or unit.owner_name or '—').strip()

    def _fmt_date(dt):
        if not dt:
            return '—'
        if hasattr(dt, 'strftime'):
            return dt.strftime('%d/%m/%Y %H:%M')
        return str(dt)

    # Owner contact info for PDF
    owner_name = f'{unit.owner_first_name} {unit.owner_last_name}'.strip() or '—'
    owner_email_str = unit.owner_email or '—'
    owner_phone_str = unit.owner_phone or '—'
    start_period_label = plan.start_period or '—'
    option_label = f'Opción {plan.option_number}' if plan.option_number else '—'

    info_rows = [
        [
            [Paragraph('UNIDAD', st_lbl), Paragraph(unit_label or '—', st_val)],
            [Paragraph('RESPONSABLE', st_lbl), Paragraph(responsible, st_val)],
            [Paragraph('FRECUENCIA', st_lbl), Paragraph(freq_label, st_val)],
        ],
        [
            [Paragraph('PROPIETARIO', st_lbl), Paragraph(owner_name, st_val)],
            [Paragraph('CORREO', st_lbl), Paragraph(owner_email_str, st_val)],
            [Paragraph('TELÉFONO', st_lbl), Paragraph(owner_phone_str, st_val)],
        ],
        [
            [Paragraph('PERÍODO INICIAL', st_lbl), Paragraph(start_period_label, st_val)],
            [Paragraph('OPCIÓN', st_lbl), Paragraph(option_label, st_val)],
            [Paragraph('', st_lbl), Paragraph('', st_val)],
        ],
        [
            [Paragraph('CREADO POR', st_lbl), Paragraph(plan.created_by_name or '—', st_val)],
            [Paragraph('FECHA CREACIÓN', st_lbl), Paragraph(_fmt_date(plan.created_at), st_val)],
            [Paragraph('ENVIADO POR', st_lbl), Paragraph(plan.sent_by_name or '—', st_val)],
        ],
    ]
    if plan.accepted_at or plan.accepted_by_name:
        info_rows.append([
            [Paragraph('ACEPTADO POR', st_lbl), Paragraph(plan.accepted_by_name or '—', st_val)],
            [Paragraph('FECHA ACEPTACIÓN', st_lbl), Paragraph(_fmt_date(plan.accepted_at), st_val)],
            [Paragraph('', st_lbl), Paragraph('', st_val)],
        ])

    info_tbl = Table(info_rows, colWidths=[W / 3, W / 3, W / 3])
    info_tbl.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), COL_SAND),
        ('LEFTPADDING', (0, 0), (-1, -1), 10),
        ('RIGHTPADDING', (0, 0), (-1, -1), 10),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('LINEBELOW', (0, 0), (-1, -2), 0.5, colors.HexColor('#e5e0d5')),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
    ]))
    story.append(info_tbl)
    story.append(Spacer(1, 0.3 * cm))

    # ── Totals summary ─────────────────────────────────────────────────────
    interest_str = f'{float(plan.interest_rate):.1f}%' if plan.apply_interest else 'Sin interés'
    totals_data = [
        [Paragraph('Total Adeudo', st_lbl),
         Paragraph('Cuota Regular / Período', st_lbl),
         Paragraph('Interés', st_lbl),
         Paragraph('TOTAL CON PLAN', st_lbl)],
        [Paragraph(f'${float(plan.total_adeudo):,.2f}', st_val),
         Paragraph(f'${float(plan.maintenance_fee):,.2f}', st_val),
         Paragraph(interest_str, st_val),
         Paragraph(f'${float(plan.total_with_interest):,.2f}',
                   ParagraphStyle('TV2', fontSize=10, fontName='Helvetica-Bold', textColor=COL_TEAL))],
    ]
    totals_tbl = Table(totals_data, colWidths=[W / 4, W / 4, W / 4, W / 4])
    totals_tbl.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), COL_TEAL_LT),
        ('LEFTPADDING', (0, 0), (-1, -1), 10),
        ('RIGHTPADDING', (0, 0), (-1, -1), 10),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('BOX', (0, 0), (-1, -1), 0.5, COL_TEAL),
    ]))
    story.append(totals_tbl)
    story.append(Spacer(1, 0.4 * cm))

    # ── Installments table ─────────────────────────────────────────────────
    inst_header = [
        Paragraph('#', st_col_hdr),
        Paragraph('Período', st_col_hdr),
        Paragraph('Abono Deuda', st_col_hdr),
        Paragraph('Cuota Regular', st_col_hdr),
        Paragraph('Total a Pagar', st_col_hdr),
        Paragraph('Pagado', st_col_hdr),
        Paragraph('Estado', st_col_hdr),
    ]
    inst_rows = [inst_header]
    inst_status_colors_map = {'paid': COL_GREEN, 'partial': COL_AMBER, 'pending': COL_CORAL}

    for inst in (plan.installments or []):
        s = inst.get('status', 'pending')
        s_color = inst_status_colors_map.get(s, COL_CORAL)
        s_labels = {'paid': 'Pagado', 'partial': 'Parcial', 'pending': 'Pendiente'}
        inst_rows.append([
            Paragraph(str(inst.get('num', '')), st_cell),
            Paragraph(inst.get('period_label', inst.get('period_key', '')), st_cell),
            Paragraph(f"${float(inst.get('debt_part', 0)):,.2f}", st_cell_r),
            Paragraph(f"${float(inst.get('regular_part', 0)):,.2f}", st_cell_r),
            Paragraph(f"${float(inst.get('total', 0)):,.2f}", st_cell_r),
            Paragraph(f"${float(inst.get('paid_amount', 0)):,.2f}", st_cell_r),
            Paragraph(s_labels.get(s, s),
                      ParagraphStyle('IS', fontSize=8, fontName='Helvetica-Bold', textColor=s_color)),
        ])

    # Footer row — totals
    total_debt_parts = sum(float(i.get('debt_part', 0)) for i in (plan.installments or []))
    total_regular_parts = sum(float(i.get('regular_part', 0)) for i in (plan.installments or []))
    total_all = sum(float(i.get('total', 0)) for i in (plan.installments or []))
    total_paid_all = sum(float(i.get('paid_amount', 0)) for i in (plan.installments or []))
    inst_rows.append([
        Paragraph('', st_col_hdr),
        Paragraph('TOTALES', st_col_hdr),
        Paragraph(f'${total_debt_parts:,.2f}', ParagraphStyle('TotR', fontSize=8.5, fontName='Helvetica-Bold', textColor=COL_WHITE, alignment=TA_RIGHT)),
        Paragraph(f'${total_regular_parts:,.2f}', ParagraphStyle('TotR2', fontSize=8.5, fontName='Helvetica-Bold', textColor=COL_WHITE, alignment=TA_RIGHT)),
        Paragraph(f'${total_all:,.2f}', ParagraphStyle('TotR3', fontSize=8.5, fontName='Helvetica-Bold', textColor=COL_WHITE, alignment=TA_RIGHT)),
        Paragraph(f'${total_paid_all:,.2f}', ParagraphStyle('TotR4', fontSize=8.5, fontName='Helvetica-Bold', textColor=COL_WHITE, alignment=TA_RIGHT)),
        Paragraph('', st_col_hdr),
    ])

    col_w = [W * 0.06, W * 0.17, W * 0.14, W * 0.14, W * 0.14, W * 0.14, W * 0.21]
    inst_tbl = Table(inst_rows, colWidths=col_w)
    n_data = len(inst_rows)
    inst_tbl.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), COL_TEAL),
        ('BACKGROUND', (0, n_data - 1), (-1, n_data - 1), COL_HDR),
        ('ROWBACKGROUNDS', (0, 1), (-1, n_data - 2), [COL_WHITE, COL_TEAL_LT]),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('GRID', (0, 0), (-1, -2), 0.3, colors.HexColor('#ddd')),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    story.append(inst_tbl)

    # ── Notes ──────────────────────────────────────────────────────────────
    if plan.notes:
        story.append(Spacer(1, 0.3 * cm))
        story.append(HRFlowable(width=W, thickness=0.5, color=colors.HexColor('#ddd')))
        story.append(Spacer(1, 0.2 * cm))
        story.append(Paragraph(f'Notas: {plan.notes}', st_note))

    doc.build(story)
    buf.seek(0)
    return buf.read()


class PaymentPlanViewSet(viewsets.ModelViewSet):
    """
    CRUD + workflow actions for payment plans.
    GET/POST  /api/tenants/{tenant_id}/payment-plans/
    GET/PATCH /api/tenants/{tenant_id}/payment-plans/{id}/
    POST      /api/tenants/{tenant_id}/payment-plans/{id}/send/
    POST      /api/tenants/{tenant_id}/payment-plans/{id}/accept/
    POST      /api/tenants/{tenant_id}/payment-plans/{id}/reject/
    POST      /api/tenants/{tenant_id}/payment-plans/{id}/cancel/
    GET       /api/tenants/{tenant_id}/payment-plans/{id}/pdf/
    """
    serializer_class = PaymentPlanSerializer

    def get_permissions(self):
        # Vecino can list/retrieve/accept/reject/pdf; management roles can do everything
        if self.action in ['accept', 'reject', 'list', 'retrieve', 'pdf']:
            return [IsTenantMember()]
        return [IsAdminOrTesOrAuditor()]

    def get_queryset(self):
        tenant_id = self.kwargs['tenant_id']
        qs = PaymentPlan.objects.filter(tenant_id=tenant_id).select_related('unit', 'tenant')

        # Vecinos only see plans that have been sent/accepted/rejected/completed
        user = self.request.user
        if not user.is_super_admin:
            try:
                tu = TenantUser.objects.get(user=user, tenant_id=tenant_id)
                if tu.role == 'vecino':
                    qs = qs.filter(
                        unit_id=tu.unit_id,
                        status__in=['sent', 'accepted', 'rejected', 'completed', 'cancelled'],
                    )
            except TenantUser.DoesNotExist:
                pass

        # Optional filters
        unit_id = self.request.query_params.get('unit_id')
        if unit_id:
            qs = qs.filter(unit_id=unit_id)

        plan_status = self.request.query_params.get('status')
        if plan_status:
            qs = qs.filter(status=plan_status)

        return qs

    def _get_user_info(self, tenant_id):
        """Return (display_name, email) for the current request user."""
        user = self.request.user
        name = (getattr(user, 'full_name', '') or '').strip()
        if not name:
            name = (getattr(user, 'name', '') or '').strip()
        if not name:
            name = user.email or ''
        return name, (user.email or '')

    def perform_create(self, serializer):
        tenant_id = self.kwargs['tenant_id']
        name, email = self._get_user_info(tenant_id)
        serializer.save(
            tenant_id=tenant_id,
            status='draft',
            created_by_name=name,
            created_by_email=email,
        )
        _audit_log(
            self.request, 'cobranza', 'create',
            f'Plan de pago creado: unidad {serializer.instance.unit.unit_id_code}',
            tenant_id=tenant_id,
            object_type='PaymentPlan', object_id=str(serializer.instance.id),
        )

    @action(detail=False, methods=['post'])
    def create_proposal(self, request, tenant_id=None):
        """
        Create up to 3 payment plan options for a unit and send them all to the owner/co-owner.

        Expected payload:
        {
          "unit_id": "<uuid>",
          "total_adeudo": 12000.00,
          "maintenance_fee": 1500.00,
          "notes": "...",           # optional, shared across options
          "options": [
            {
              "frequency": 1,
              "num_payments": 6,
              "apply_interest": false,
              "interest_rate": 0,
              "start_period": "2026-05",
              "notes": "..."        # optional, per-option notes
            },
            ...   # up to 3 items
          ]
        }
        """
        from decimal import Decimal as _D

        unit_id          = request.data.get('unit_id')
        options_raw      = request.data.get('options', [])
        total_adeudo     = request.data.get('total_adeudo', 0)
        maintenance      = request.data.get('maintenance_fee', 0)
        shared_notes     = request.data.get('notes', '')
        terms_conditions = request.data.get('terms_conditions', '')
        # Lista explícita de emails seleccionados por el usuario (propietario / copropietario).
        # Si viene vacía o no se manda, se usan los de la unidad por defecto.
        emails_param  = request.data.get('emails', None)

        if not unit_id:
            return Response({'detail': 'unit_id es requerido.'}, status=status.HTTP_400_BAD_REQUEST)
        if not options_raw:
            return Response({'detail': 'Se requiere al menos una opción.'}, status=status.HTTP_400_BAD_REQUEST)
        if len(options_raw) > 3:
            return Response({'detail': 'Máximo 3 opciones por propuesta.'}, status=status.HTTP_400_BAD_REQUEST)

        # Block if there is already an active (accepted) plan for this unit
        active_exists = PaymentPlan.objects.filter(
            tenant_id=tenant_id, unit_id=unit_id, status='accepted',
        ).exists()
        if active_exists:
            return Response(
                {'detail': 'Ya existe un plan de pagos activo para esta unidad. Cancélalo o espera a que se complete antes de crear uno nuevo.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            unit = Unit.objects.get(id=unit_id, tenant_id=tenant_id)
        except Unit.DoesNotExist:
            return Response({'detail': 'Unidad no encontrada.'}, status=status.HTTP_404_NOT_FOUND)

        try:
            tenant = Tenant.objects.get(id=tenant_id)
        except Tenant.DoesNotExist:
            return Response({'detail': 'Tenant no encontrado.'}, status=status.HTTP_404_NOT_FOUND)

        name, email = self._get_user_info(tenant_id)
        group_id    = uuid.uuid4()
        now         = timezone.now()
        created_plans = []

        for idx, opt in enumerate(options_raw[:3], start=1):
            frequency    = int(opt.get('frequency', 1))
            num_payments = int(opt.get('num_payments', 1))
            apply_int    = bool(opt.get('apply_interest', False))
            int_rate     = _D(str(opt.get('interest_rate', 0)))
            start_period = opt.get('start_period', '')
            opt_notes    = opt.get('notes', '') or shared_notes

            # Build installments schedule
            total_debt = _D(str(total_adeudo))
            if apply_int and int_rate > 0:
                total_with_int = total_debt * (1 + int_rate / 100)
            else:
                total_with_int = total_debt
                int_rate = _D('0')

            debt_per_inst     = total_with_int / num_payments
            maint             = _D(str(maintenance))
            regular_per_period = maint * frequency

            installments = []
            # Build period keys starting from start_period or today's next period
            def _next_period(yyyymm, steps=1):
                y, m = int(yyyymm[:4]), int(yyyymm[5:7])
                for _ in range(steps):
                    m += 1
                    if m > 12:
                        m = 1; y += 1
                return f'{y:04d}-{m:02d}'

            def _period_label(yyyymm):
                months_es = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                             'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
                y, m = int(yyyymm[:4]), int(yyyymm[5:7])
                return f'{months_es[m-1]} {y}'

            # Use start_period if provided, else default to today's period
            _today  = timezone.now()
            _cur_period = f'{_today.year:04d}-{_today.month:02d}'
            base_period = start_period if start_period else _cur_period

            for n in range(1, num_payments + 1):
                period_key = base_period if n == 1 else _next_period(base_period, n - 1)
                installments.append({
                    'num':          n,
                    'period_key':   period_key,
                    'period_label': _period_label(period_key),
                    'debt_part':    float(round(debt_per_inst, 2)),
                    'regular_part': float(round(regular_per_period, 2)),
                    'total':        float(round(debt_per_inst + regular_per_period, 2)),
                    'paid_amount':  0.0,
                    'status':       'pending',
                    'paid_at':      None,
                })

            plan = PaymentPlan.objects.create(
                tenant_id        = tenant_id,
                unit             = unit,
                total_adeudo     = total_debt,
                maintenance_fee  = maint,
                frequency        = frequency,
                num_payments     = num_payments,
                apply_interest   = apply_int,
                interest_rate    = int_rate,
                total_with_interest = total_with_int,
                status           = 'sent',
                notes            = opt_notes,
                terms_conditions = terms_conditions,
                created_by_name  = name,
                created_by_email = email,
                sent_by_name     = name,
                sent_at          = now,
                installments     = installments,
                start_period     = start_period,
                proposal_group   = group_id,
                option_number    = idx,
            )
            created_plans.append(plan)

        # Resolver destinatarios: si el cliente manda lista explícita se usa esa
        # (ya filtrada del UI: propietario/copropietario seleccionados).
        # Fallback: propietario + copropietario de la unidad.
        if isinstance(emails_param, list):
            emails = [e.strip() for e in emails_param if isinstance(e, str) and e.strip()]
        else:
            emails = [e for e in [unit.owner_email, unit.coowner_email] if e]
        # Deduplicar preservando orden
        seen_em = set()
        emails = [e for e in emails if not (e.lower() in seen_em or seen_em.add(e.lower()))]

        # Send email with all options
        if emails:
            try:
                freq_map = {1: 'Mensual', 2: 'Bimestral', 3: 'Trimestral', 6: 'Semestral'}
                _owner_name_parts = [unit.owner_first_name or '', unit.owner_last_name or '']
                _tenant_name_parts = [unit.tenant_first_name or '', unit.tenant_last_name or '']
                responsible = (' '.join(p for p in _tenant_name_parts if p).strip()
                               or ' '.join(p for p in _owner_name_parts if p).strip())
                options_for_email = []
                for p in created_plans:
                    options_for_email.append({
                        'option_number':    p.option_number,
                        'frequency_label':  freq_map.get(p.frequency, str(p.frequency)),
                        'num_payments':     p.num_payments,
                        'apply_interest':   p.apply_interest,
                        'interest_rate':    float(p.interest_rate),
                        'total_with_interest': float(p.total_with_interest),
                        'start_period':     p.start_period,
                        'installments':     p.installments or [],
                    })
                threading.Thread(
                    target=send_payment_plan_email,
                    kwargs=dict(
                        emails=emails,
                        tenant_name=tenant.name,
                        unit_code=unit.unit_id_code or '',
                        unit_name=unit.unit_name or '',
                        responsible=responsible,
                        total_adeudo=float(total_adeudo),
                        total_with_interest=float(created_plans[0].total_with_interest),
                        apply_interest=created_plans[0].apply_interest,
                        interest_rate=float(created_plans[0].interest_rate),
                        frequency_label=freq_map.get(created_plans[0].frequency, ''),
                        num_payments=created_plans[0].num_payments,
                        installments=created_plans[0].installments or [],
                        created_by_name=name,
                        notes=shared_notes,
                        terms_conditions=terms_conditions,
                        num_options=len(created_plans),
                    ),
                    daemon=True,
                ).start()
            except Exception:
                pass

        _audit_log(
            request, 'cobranza', 'create',
            f'Propuesta de plan de pago enviada: unidad {unit.unit_id_code} ({len(created_plans)} opciones)',
            tenant_id=tenant_id, object_type='PaymentPlan',
            object_id=str(group_id),
        )

        # Notify vecinos of the unit
        num_opts = len(created_plans)
        opts_label = f'{num_opts} opción' if num_opts == 1 else f'{num_opts} opciones'
        _notify_unit_residents(
            tenant_id=tenant_id,
            unit_id=str(unit.id),
            notif_type='plan_proposal_sent',
            title=f'📋 Propuesta de plan de pagos — {unit.unit_id_code}',
            message=f'Se te ha enviado una propuesta de plan de pagos con {opts_label}. Ingresa al módulo de Plan de Pagos para revisarla y elegir la que mejor te convenga.',
        )
        # Notify admins/tesorer
        _notify_roles(
            tenant_id=tenant_id,
            roles=['admin', 'tesorero'],
            notif_type='plan_proposal_sent',
            title=f'Propuesta enviada — Unidad {unit.unit_id_code}',
            message=f'Se envió una propuesta de plan de pagos con {opts_label} a la unidad {unit.unit_name or unit.unit_id_code}.',
        )

        return Response(
            {
                'plans': PaymentPlanSerializer(created_plans, many=True).data,
                'emails_sent_to': emails,
            },
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=['post'])
    def send(self, request, tenant_id=None, pk=None):
        """Enviar plan al vecino (cambia estado a 'sent', manda email)."""
        plan = self.get_object()
        if plan.status not in ('draft',):
            return Response(
                {'detail': 'Solo se puede enviar un plan en estado Borrador.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        name, _email = self._get_user_info(tenant_id)
        plan.status = 'sent'
        plan.sent_by_name = name
        plan.sent_at = timezone.now()
        plan.save()

        # Gather recipient emails
        unit = plan.unit
        emails = [e for e in [unit.owner_email, unit.tenant_email] if e]
        if emails:
            try:
                tenant = Tenant.objects.get(id=tenant_id)
                freq_map = {1: 'Mensual', 2: 'Bimestral', 3: 'Trimestral', 6: 'Semestral'}
                freq_label = freq_map.get(plan.frequency, str(plan.frequency))
                responsible = (unit.tenant_name or unit.owner_name or '').strip()

                threading.Thread(
                    target=send_payment_plan_email,
                    kwargs=dict(
                        emails=emails,
                        tenant_name=tenant.name,
                        unit_code=unit.unit_id_code or '',
                        unit_name=unit.unit_name or '',
                        responsible=responsible,
                        total_adeudo=float(plan.total_adeudo),
                        total_with_interest=float(plan.total_with_interest),
                        apply_interest=plan.apply_interest,
                        interest_rate=float(plan.interest_rate),
                        frequency_label=freq_label,
                        num_payments=plan.num_payments,
                        installments=plan.installments or [],
                        created_by_name=plan.created_by_name,
                        notes=plan.notes,
                        terms_conditions=plan.terms_conditions or '',
                        num_options=1,
                    ),
                    daemon=True,
                ).start()
            except Exception:
                pass  # email must never break main flow

        _audit_log(
            request, 'cobranza', 'update',
            f'Plan de pago enviado al vecino: {unit.unit_id_code}',
            tenant_id=tenant_id, object_type='PaymentPlan', object_id=str(plan.id),
        )
        return Response(PaymentPlanSerializer(plan).data)

    @action(detail=True, methods=['post'])
    def accept(self, request, tenant_id=None, pk=None):
        """Vecino acepta el plan (cambia estado a 'accepted')."""
        plan = self.get_object()
        if plan.status != 'sent':
            return Response(
                {'detail': 'Solo se puede aceptar un plan enviado.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        # Ensure only vecino of the unit (or admin) can accept
        user = request.user
        if not user.is_super_admin:
            try:
                tu = TenantUser.objects.get(user=user, tenant_id=tenant_id)
                if tu.role == 'vecino' and str(tu.unit_id) != str(plan.unit_id):
                    return Response({'detail': 'No autorizado.'}, status=status.HTTP_403_FORBIDDEN)
            except TenantUser.DoesNotExist:
                return Response({'detail': 'No autorizado.'}, status=status.HTTP_403_FORBIDDEN)

        name, _email = self._get_user_info(tenant_id)
        plan.status = 'accepted'
        plan.accepted_by_name = name
        plan.accepted_at = timezone.now()
        plan.save()

        # If this plan is part of a proposal group, cancel all sibling options
        if plan.proposal_group:
            PaymentPlan.objects.filter(
                tenant_id=tenant_id,
                proposal_group=plan.proposal_group,
            ).exclude(id=plan.id).filter(
                status__in=['draft', 'sent'],
            ).update(status='cancelled')

        _audit_log(
            request, 'cobranza', 'update',
            f'Plan de pago aceptado por vecino: {plan.unit.unit_id_code}',
            tenant_id=tenant_id, object_type='PaymentPlan', object_id=str(plan.id),
        )

        # Notify admins/tesorero
        _notify_roles(
            tenant_id=tenant_id,
            roles=['admin', 'tesorero'],
            notif_type='plan_accepted',
            title=f'✅ Plan de pagos aceptado — Unidad {plan.unit.unit_id_code}',
            message=f'El vecino de la unidad {plan.unit.unit_name or plan.unit.unit_id_code} aceptó el plan de pagos (Opción {plan.option_number}). El plan está ahora activo.',
        )

        return Response(PaymentPlanSerializer(plan).data)

    @action(detail=True, methods=['post'])
    def reject(self, request, tenant_id=None, pk=None):
        """Vecino rechaza el plan (cambia estado a 'rejected')."""
        plan = self.get_object()
        if plan.status != 'sent':
            return Response(
                {'detail': 'Solo se puede rechazar un plan enviado.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user = request.user
        if not user.is_super_admin:
            try:
                tu = TenantUser.objects.get(user=user, tenant_id=tenant_id)
                if tu.role == 'vecino' and str(tu.unit_id) != str(plan.unit_id):
                    return Response({'detail': 'No autorizado.'}, status=status.HTTP_403_FORBIDDEN)
            except TenantUser.DoesNotExist:
                return Response({'detail': 'No autorizado.'}, status=status.HTTP_403_FORBIDDEN)

        plan.status = 'rejected'
        plan.save()

        _audit_log(
            request, 'cobranza', 'update',
            f'Plan de pago rechazado por vecino: {plan.unit.unit_id_code}',
            tenant_id=tenant_id, object_type='PaymentPlan', object_id=str(plan.id),
        )

        # Notify admins/tesorero
        _notify_roles(
            tenant_id=tenant_id,
            roles=['admin', 'tesorero'],
            notif_type='plan_rejected',
            title=f'❌ Plan de pagos rechazado — Unidad {plan.unit.unit_id_code}',
            message=f'El vecino de la unidad {plan.unit.unit_name or plan.unit.unit_id_code} rechazó el plan de pagos (Opción {plan.option_number}).',
        )

        return Response(PaymentPlanSerializer(plan).data)

    @action(detail=True, methods=['post'])
    def cancel(self, request, tenant_id=None, pk=None):
        """Admin cancela el plan."""
        plan = self.get_object()
        if plan.status in ('completed', 'cancelled'):
            return Response(
                {'detail': 'El plan ya está completado o cancelado.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        name, _email = self._get_user_info(tenant_id)
        reason = (request.data.get('reason') or '').strip()

        plan.status = 'cancelled'
        plan.cancel_reason = reason
        plan.cancelled_by_name = name
        plan.cancelled_at = timezone.now()
        plan.save()

        _audit_log(
            request, 'cobranza', 'update',
            f'Plan de pago cancelado: {plan.unit.unit_id_code}',
            tenant_id=tenant_id, object_type='PaymentPlan', object_id=str(plan.id),
        )

        # Notify vecinos of the unit
        reason_text = f' Motivo: {reason}' if reason else ''
        _notify_unit_residents(
            tenant_id=tenant_id,
            unit_id=str(plan.unit_id),
            notif_type='plan_cancelled',
            title=f'🚫 Plan de pagos cancelado — {plan.unit.unit_id_code}',
            message=f'Tu plan de pagos ha sido cancelado por la administración.{reason_text}',
        )

        return Response(PaymentPlanSerializer(plan).data)

    @action(detail=True, methods=['get'])
    def pdf(self, request, tenant_id=None, pk=None):
        """Descargar el plan de pagos en PDF."""
        plan = self.get_object()
        try:
            tenant = Tenant.objects.get(id=tenant_id)
        except Tenant.DoesNotExist:
            return Response({'detail': 'Tenant no encontrado.'}, status=status.HTTP_404_NOT_FOUND)

        pdf_bytes = _generate_payment_plan_pdf(plan, tenant)
        if pdf_bytes is None:
            return Response(
                {'detail': 'No se pudo generar el PDF (reportlab no instalado).'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        safe_code = ''.join(
            c if c.isalnum() or c in '-_' else '_'
            for c in (plan.unit.unit_id_code or 'unidad')
        )
        filename = f'plan_pago_{safe_code}_{str(plan.id)[:8]}.pdf'
        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response

    def _update_plan_installment_from_payments(self, plan):
        """
        After a payment is captured, re-check FieldPayment records for plan installments
        and update the JSON installment statuses accordingly.
        """
        from .models import FieldPayment as FP
        plan_key = plan.field_key  # e.g. 'plan_<uuid>'
        installments = plan.installments or []
        updated = False

        for inst in installments:
            period_key = inst.get('period_key', '')
            # Find FieldPayment records for this plan key in payments matching the installment's period
            total_paid = FP.objects.filter(
                payment__tenant_id=plan.tenant_id,
                payment__unit_id=plan.unit_id,
                payment__period=period_key,
                field_key=plan_key,
            ).aggregate(s=Sum('received'))['s'] or Decimal('0')

            inst_total = Decimal(str(inst.get('total', 0)))
            paid_amount = float(total_paid)
            inst['paid_amount'] = paid_amount

            if total_paid >= inst_total and inst_total > 0:
                new_status = 'paid'
            elif total_paid > 0:
                new_status = 'partial'
            else:
                new_status = 'pending'

            if new_status != inst.get('status'):
                inst['status'] = new_status
                updated = True
            if float(total_paid) != inst.get('paid_amount', 0):
                updated = True

        if updated:
            plan.installments = installments
            # Check if all installments are paid → complete the plan
            all_paid = all(i.get('status') == 'paid' for i in installments)
            if all_paid and plan.status == 'accepted':
                plan.status = 'completed'
            plan.save()


# ═══════════════════════════════════════════════════════════
#  CLOSED PERIODS / REOPEN REQUESTS
# ═══════════════════════════════════════════════════════════

class ClosedPeriodViewSet(viewsets.ModelViewSet):
    serializer_class = ClosedPeriodSerializer

    def get_permissions(self):
        """
        Reads (list / retrieve) are visible to any authenticated tenant member
        so that all roles can see which periods are closed (e.g. in Gastos,
        Cobranza, CierrePeriodo, Dashboard).
        Writes (create, destroy) remain restricted to tenant admins only.
        """
        if self.action in ('list', 'retrieve'):
            return [IsTenantMember()]
        return [IsTenantAdmin()]

    def get_queryset(self):
        return ClosedPeriod.objects.filter(tenant_id=self.kwargs['tenant_id'])

    def perform_create(self, serializer):
        tenant_id = self.kwargs['tenant_id']
        obj = serializer.save(tenant_id=tenant_id, closed_by=self.request.user)
        # Notify all roles that have access to the cobranza module
        try:
            _notify_roles(
                tenant_id,
                roles=('admin', 'tesorero', 'contador', 'auditor'),
                notif_type='period_closed',
                title=f'Período {obj.period} cerrado',
                message=f'El período {obj.period} ha sido cerrado. Ya no se pueden registrar pagos.',
            )
        except Exception:
            pass
        _audit_log(
            self.request, 'cobranza', 'close_period',
            f'Período {obj.period} cerrado',
            tenant_id=tenant_id,
            object_type='ClosedPeriod', object_id=str(obj.id),
            object_repr=obj.period,
        )

    def perform_destroy(self, instance):
        tenant_id = self.kwargs['tenant_id']
        period = instance.period
        instance.delete()
        # Notify roles with access to cobranza
        try:
            _notify_roles(
                tenant_id,
                roles=('admin', 'tesorero', 'contador', 'auditor'),
                notif_type='period_reopened',
                title=f'Período {period} reabierto',
                message=f'El período {period} ha sido reabierto por el administrador. Ya se pueden registrar pagos.',
            )
        except Exception:
            pass
        _audit_log(
            self.request, 'cobranza', 'reopen_period',
            f'Período {period} reabierto directamente por administrador',
            tenant_id=tenant_id,
            object_type='ClosedPeriod', object_id='deleted',
            object_repr=period,
        )


class ReopenRequestViewSet(viewsets.ModelViewSet):
    serializer_class = ReopenRequestSerializer
    permission_classes = [IsTenantMember]

    def get_queryset(self):
        return ReopenRequest.objects.filter(tenant_id=self.kwargs['tenant_id'])

    def perform_create(self, serializer):
        serializer.save(
            tenant_id=self.kwargs['tenant_id'],
            requested_by=self.request.user
        )

    @action(detail=True, methods=['post'])
    def approve(self, request, tenant_id=None, pk=None):
        req = self.get_object()
        req.status = 'approved'
        req.resolved_by = request.user
        req.resolved_at = timezone.now()
        req.save()
        # Remove closed period
        ClosedPeriod.objects.filter(tenant_id=tenant_id, period=req.period).delete()
        # Notify roles with access to cobranza
        try:
            _notify_roles(
                tenant_id,
                roles=('admin', 'tesorero', 'contador', 'auditor'),
                notif_type='period_reopened',
                title=f'Período {req.period} reabierto',
                message=f'La solicitud de reapertura fue aprobada. Ya se pueden registrar pagos en {req.period}.',
            )
        except Exception:
            pass
        _audit_log(
            request, 'cobranza', 'reopen_period',
            f'Solicitud de reapertura aprobada: período {req.period}',
            tenant_id=tenant_id,
            object_type='ReopenRequest', object_id=str(req.id),
            object_repr=req.period,
        )
        return Response(ReopenRequestSerializer(req).data)

    @action(detail=True, methods=['post'])
    def reject(self, request, tenant_id=None, pk=None):
        req = self.get_object()
        req.status = 'rejected'
        req.resolved_by = request.user
        req.resolved_at = timezone.now()
        req.save()
        _audit_log(
            request, 'cobranza', 'reject',
            f'Solicitud de reapertura rechazada: período {req.period}',
            tenant_id=tenant_id,
            object_type='ReopenRequest', object_id=str(req.id),
            object_repr=req.period,
        )
        return Response(ReopenRequestSerializer(req).data)


# ═══════════════════════════════════════════════════════════
#  PERIOD CLOSURE REQUEST (multi-step approval workflow)
# ═══════════════════════════════════════════════════════════

class PeriodClosureRequestViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Read + custom actions for period closure approval workflow.
    Routes: /api/tenants/{tenant_id}/period-closure-requests/
    Actions:
      POST   /initiate/           — Start a new closure request for a period
      POST   /{pk}/approve_step/  — Approve the current pending step (must be assigned approver)
      POST   /{pk}/reject_step/   — Reject the current step, cancels the whole request
    """
    serializer_class   = PeriodClosureRequestSerializer
    permission_classes = [IsTenantMember]

    def get_queryset(self):
        return (
            PeriodClosureRequest.objects
            .filter(tenant_id=self.kwargs['tenant_id'])
            .prefetch_related('steps__approver')
        )

    # ── helpers ──────────────────────────────────────────────────

    def _get_tenant(self):
        return Tenant.objects.get(pk=self.kwargs['tenant_id'])

    def _is_admin_or_tesorero(self, request, tenant_id):
        if request.user.is_super_admin:
            return True
        return TenantUser.objects.filter(
            tenant_id=tenant_id,
            user=request.user,
            role__in=['admin', 'tesorero'],
        ).exists()

    # ── initiate ─────────────────────────────────────────────────

    @action(detail=False, methods=['post'])
    def initiate(self, request, tenant_id=None):
        """
        Body: { "period": "YYYY-MM", "notes": "optional" }
        Creates a PeriodClosureRequest + one PeriodClosureStep per flow step.
        If the closure_flow has no steps configured, immediately closes the period
        (direct admin close — backwards-compatible with old behaviour).
        """
        period = request.data.get('period', '').strip()
        if not period:
            return Response({'detail': 'El campo period es requerido.'}, status=400)

        # Must be admin or tesorero to initiate
        if not self._is_admin_or_tesorero(request, tenant_id):
            return Response({'detail': 'Solo administradores o tesoreros pueden iniciar el cierre.'}, status=403)

        # Cannot initiate if period is already closed
        if ClosedPeriod.objects.filter(tenant_id=tenant_id, period=period).exists():
            return Response({'detail': f'El período {period} ya está cerrado.'}, status=400)

        # Cannot initiate if there is already an in_progress request for this period
        if PeriodClosureRequest.objects.filter(tenant_id=tenant_id, period=period, status='in_progress').exists():
            return Response({'detail': f'Ya existe una solicitud de cierre en proceso para {period}.'}, status=400)

        tenant = self._get_tenant()
        flow = tenant.closure_flow or {}
        steps_config = flow.get('steps', [])

        # If no flow configured → direct close (simple mode)
        if not steps_config:
            cp, _ = ClosedPeriod.objects.get_or_create(
                tenant_id=tenant_id, period=period,
                defaults={'closed_by': request.user},
            )
            try:
                _notify_roles(
                    tenant_id,
                    roles=('admin', 'tesorero', 'contador', 'auditor'),
                    notif_type='period_closed',
                    title=f'Período {period} cerrado',
                    message=f'El período {period} ha sido cerrado.',
                )
            except Exception:
                pass
            _audit_log(
                request, 'cierre_periodo', 'close_period',
                f'Período {period} cerrado directamente (sin flujo configurado)',
                tenant_id=tenant_id,
                object_type='ClosedPeriod', object_id=str(cp.id),
                object_repr=period,
            )
            return Response({'detail': f'Período {period} cerrado exitosamente.', 'period': period}, status=201)

        # Create the closure request
        closure = PeriodClosureRequest.objects.create(
            tenant_id=tenant_id,
            period=period,
            initiated_by=request.user,
            status='in_progress',
            notes=request.data.get('notes', ''),
        )
        for step_cfg in sorted(steps_config, key=lambda s: s.get('order', 0)):
            try:
                approver = User.objects.get(pk=step_cfg['user_id'])
            except (User.DoesNotExist, KeyError):
                approver = None
            PeriodClosureStep.objects.create(
                closure_request=closure,
                order=step_cfg.get('order', 1),
                approver=approver,
                label=step_cfg.get('label', ''),
                status='pending',
            )

        # Notify the first approver
        first_step = closure.steps.order_by('order').first()
        if first_step and first_step.approver and first_step.approver.email:
            try:
                from .email_service import send_notification_email
                send_notification_email(
                    email=first_step.approver.email,
                    user_name=first_step.approver.name or first_step.approver.email,
                    notif_type='period_closed',
                    title=f'Solicitud de cierre — período {period}',
                    message=f'Se requiere tu aprobación para cerrar el período {period} en {tenant.name}.',
                    tenant_name=tenant.name,
                )
            except Exception:
                pass

        _audit_log(
            request, 'cierre_periodo', 'initiate_closure',
            f'Solicitud de cierre iniciada para período {period}',
            tenant_id=tenant_id,
            object_type='PeriodClosureRequest', object_id=str(closure.id),
            object_repr=period,
        )
        return Response(PeriodClosureRequestSerializer(closure).data, status=201)

    # ── approve_step ─────────────────────────────────────────────

    @action(detail=True, methods=['post'], url_path='approve_step')
    def approve_step(self, request, tenant_id=None, pk=None):
        """
        Body: { "notes": "optional comment" }
        The current user must be the assigned approver for the next pending step.
        If all steps are approved, the period is automatically closed.
        """
        closure = self.get_object()
        if closure.status != 'in_progress':
            return Response({'detail': 'Esta solicitud ya no está en proceso.'}, status=400)

        pending_step = closure.steps.filter(status='pending').order_by('order').first()
        if not pending_step:
            return Response({'detail': 'No hay pasos pendientes en esta solicitud.'}, status=400)

        if pending_step.approver_id != request.user.pk:
            return Response({'detail': 'No eres el aprobador asignado para este paso.'}, status=403)

        pending_step.status      = 'approved'
        pending_step.actioned_at = timezone.now()
        pending_step.notes       = request.data.get('notes', '')
        pending_step.save()

        # Check if all steps are now approved
        all_approved = not closure.steps.filter(status='pending').exists()
        if all_approved:
            closure.status       = 'completed'
            closure.completed_at = timezone.now()
            closure.save()
            # Close the period
            cp, _ = ClosedPeriod.objects.get_or_create(
                tenant_id=tenant_id, period=closure.period,
                defaults={'closed_by': request.user},
            )
            try:
                _notify_roles(
                    tenant_id,
                    roles=('admin', 'tesorero', 'contador', 'auditor'),
                    notif_type='period_closed',
                    title=f'Período {closure.period} cerrado',
                    message=f'El período {closure.period} ha sido cerrado tras completar el flujo de aprobación.',
                )
            except Exception:
                pass
            _audit_log(
                request, 'cierre_periodo', 'close_period',
                f'Período {closure.period} cerrado (flujo completado)',
                tenant_id=tenant_id,
                object_type='ClosedPeriod', object_id=str(cp.id),
                object_repr=closure.period,
            )
        else:
            # Notify next approver
            next_step = closure.steps.filter(status='pending').order_by('order').first()
            if next_step and next_step.approver and next_step.approver.email:
                try:
                    tenant = self._get_tenant()
                    from .email_service import send_notification_email
                    send_notification_email(
                        email=next_step.approver.email,
                        user_name=next_step.approver.name or next_step.approver.email,
                        notif_type='period_closed',
                        title=f'Solicitud de cierre — período {closure.period}',
                        message=(
                            f'Se requiere tu aprobación para cerrar el período {closure.period} '
                            f'en {tenant.name}. El paso anterior ya fue aprobado.'
                        ),
                        tenant_name=tenant.name,
                    )
                except Exception:
                    pass
            _audit_log(
                request, 'cierre_periodo', 'approve_step',
                f'Paso {pending_step.order} aprobado para cierre de período {closure.period}',
                tenant_id=tenant_id,
                object_type='PeriodClosureStep', object_id=str(pending_step.id),
                object_repr=closure.period,
            )

        return Response(PeriodClosureRequestSerializer(closure).data)

    # ── reject_step ──────────────────────────────────────────────

    @action(detail=True, methods=['post'], url_path='reject_step')
    def reject_step(self, request, tenant_id=None, pk=None):
        """
        Body: { "notes": "reason for rejection" }
        Rejects the current pending step and cancels the entire closure request.
        """
        closure = self.get_object()
        if closure.status != 'in_progress':
            return Response({'detail': 'Esta solicitud ya no está en proceso.'}, status=400)

        pending_step = closure.steps.filter(status='pending').order_by('order').first()
        if not pending_step:
            return Response({'detail': 'No hay pasos pendientes en esta solicitud.'}, status=400)

        if pending_step.approver_id != request.user.pk:
            return Response({'detail': 'No eres el aprobador asignado para este paso.'}, status=403)

        pending_step.status      = 'rejected'
        pending_step.actioned_at = timezone.now()
        pending_step.notes       = request.data.get('notes', '')
        pending_step.save()

        closure.status       = 'rejected'
        closure.completed_at = timezone.now()
        closure.save()

        try:
            _notify_roles(
                tenant_id,
                roles=('admin', 'tesorero'),
                notif_type='general',
                title=f'Cierre de período {closure.period} rechazado',
                message=(
                    f'La solicitud de cierre para el período {closure.period} fue rechazada '
                    f'en el paso {pending_step.order}: {pending_step.notes}'
                ),
            )
        except Exception:
            pass

        _audit_log(
            request, 'cierre_periodo', 'reject_step',
            f'Solicitud de cierre de período {closure.period} rechazada en paso {pending_step.order}',
            tenant_id=tenant_id,
            object_type='PeriodClosureRequest', object_id=str(closure.id),
            object_repr=closure.period,
        )
        return Response(PeriodClosureRequestSerializer(closure).data)


# ═══════════════════════════════════════════════════════════
#  ASSEMBLY
# ═══════════════════════════════════════════════════════════

class AssemblyPositionViewSet(viewsets.ModelViewSet):
    serializer_class = AssemblyPositionSerializer

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [IsTenantMember()]
        return [IsTenantAdmin()]

    def get_queryset(self):
        return AssemblyPosition.objects.filter(tenant_id=self.kwargs['tenant_id'])

    def perform_create(self, serializer):
        serializer.save(tenant_id=self.kwargs['tenant_id'])


class CommitteeViewSet(viewsets.ModelViewSet):
    serializer_class = CommitteeSerializer

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [IsTenantMember()]
        return [IsTenantAdmin()]

    def get_queryset(self):
        return Committee.objects.filter(
            tenant_id=self.kwargs['tenant_id']
        ).prefetch_related('positions')

    def perform_create(self, serializer):
        serializer.save(tenant_id=self.kwargs['tenant_id'])


# ═══════════════════════════════════════════════════════════
#  UNRECOGNIZED INCOME
# ═══════════════════════════════════════════════════════════

class UnrecognizedIncomeViewSet(viewsets.ModelViewSet):
    serializer_class = UnrecognizedIncomeSerializer
    permission_classes = [IsAdminOrTesorero]

    def get_queryset(self):
        qs = UnrecognizedIncome.objects.filter(tenant_id=self.kwargs['tenant_id'])
        period = self.request.query_params.get('period')
        if period:
            qs = qs.filter(period=period)
        return qs

    def perform_create(self, serializer):
        serializer.save(tenant_id=self.kwargs['tenant_id'])


# ═══════════════════════════════════════════════════════════
#  AMENITY RESERVATIONS
# ═══════════════════════════════════════════════════════════

class AmenityReservationViewSet(viewsets.ModelViewSet):
    """CRUD + approve/reject for amenity reservations."""
    serializer_class = AmenityReservationSerializer

    def get_permissions(self):
        if self.action in ['approve', 'reject']:
            # Dynamic: checks tenant.reservation_settings.role_permissions[role].can_approve
            return [CanApproveReservation()]
        if self.action in ['list', 'retrieve']:
            return [IsTenantMember()]
        return [IsTenantMember()]

    def get_queryset(self):
        qs = AmenityReservation.objects.filter(
            tenant_id=self.kwargs['tenant_id']
        ).select_related('unit', 'requested_by', 'reviewed_by')

        status_filter = self.request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)

        date_from = self.request.query_params.get('date_from')
        date_to   = self.request.query_params.get('date_to')
        if date_from:
            qs = qs.filter(date__gte=date_from)
        if date_to:
            qs = qs.filter(date__lte=date_to)

        area_id = self.request.query_params.get('area_id')
        if area_id:
            qs = qs.filter(area_id=area_id)

        unit_id = self.request.query_params.get('unit_id')
        if unit_id:
            qs = qs.filter(unit_id=unit_id)

        # All tenant members see all reservations so they can check availability
        # before making a new reservation (no per-unit restriction).
        return qs

    def _notify_managers(self, res, notif_type, title, message=''):
        """Notify admin/tesorero users respecting their module permissions."""
        _notify_roles(
            res.tenant_id,
            roles=('admin', 'tesorero'),
            notif_type=notif_type,
            title=title,
            message=message,
            related_reservation=res,
        )

    def _notify_unit_vecinos(self, res, notif_type, title, message=''):
        """Notify vecinos of the reservation's unit respecting module permissions."""
        _notify_unit_residents(
            res.tenant_id,
            unit_id=str(res.unit_id) if res.unit_id else None,
            notif_type=notif_type,
            title=title,
            message=message,
            related_reservation=res,
        )

    def perform_create(self, serializer):
        from .models import TenantUser as TU, Unit
        user = self.request.user
        unit = None
        role = None

        if user.is_super_admin:
            role = 'superadmin'
        else:
            try:
                tu = TU.objects.get(user=user, tenant_id=self.kwargs['tenant_id'])
                role = tu.role
                if tu.role == 'vecino' and tu.unit_id:
                    unit = tu.unit
            except TU.DoesNotExist:
                pass

        if unit is None:
            unit_id = self.request.data.get('unit_id')
            if unit_id:
                unit = Unit.objects.filter(
                    id=unit_id, tenant_id=self.kwargs['tenant_id']
                ).first()

        # Determine approval status based on tenant's reservation_settings
        try:
            tenant_obj = Tenant.objects.get(id=self.kwargs['tenant_id'])
            res_settings  = tenant_obj.reservation_settings or {}
            approval_mode = res_settings.get('approval_mode', 'require_vecinos')
            role_perms    = res_settings.get('role_permissions', {})
        except Tenant.DoesNotExist:
            approval_mode = 'require_vecinos'
            role_perms    = {}

        # Whether this role auto-approves in require_vecinos mode:
        # use per-role config if present, otherwise fall back to admin/tesorero/superadmin
        if role == 'superadmin':
            role_can_approve = True
        elif role_perms and role in role_perms:
            role_can_approve = bool(role_perms[role].get('can_approve', False))
        else:
            role_can_approve = role in ('admin', 'tesorero')

        if approval_mode == 'auto_approve_all':
            res_status = 'approved'
        elif approval_mode == 'require_all':
            res_status = 'pending'
        else:  # 'require_vecinos' (default): roles with can_approve auto-approve, others pending
            res_status = 'approved' if role_can_approve else 'pending'

        res = serializer.save(
            tenant_id=self.kwargs['tenant_id'],
            requested_by=user,
            unit=unit,
            status=res_status,
            reviewed_by=user if res_status == 'approved' else None,
        )

        time_str = f'{str(res.start_time)[:5]}–{str(res.end_time)[:5]}'
        if res_status == 'pending':
            # Vecino created → notify managers for review
            unit_label = f' — {unit.unit_name}' if unit else ''
            self._notify_managers(
                res,
                notif_type='reservation_new',
                title=f'Nueva reserva solicitada: {res.area_name}{unit_label}',
                message=f'Fecha: {res.date}  {time_str}',
            )
        elif res_status == 'approved':
            # Admin created directly approved → notify vecinos of the unit
            self._notify_unit_vecinos(
                res,
                notif_type='reservation_approved',
                title=f'✅ Nueva reserva aprobada: {res.area_name}',
                message=f'Fecha: {res.date}  {time_str}',
            )

        _audit_log(
            self.request, 'reservas', 'create',
            f'Reserva creada ({res_status}): {res.area_name} — {res.date} {time_str}',
            tenant_id=self.kwargs['tenant_id'],
            object_type='AmenityReservation', object_id=str(res.id),
            object_repr=f'{res.area_name} / {res.date}',
        )

    @action(detail=True, methods=['post'])
    def approve(self, request, tenant_id=None, pk=None):
        res = self.get_object()
        res.status = 'approved'
        res.reviewed_by = request.user
        res.rejection_reason = ''
        res.reviewer_notes = request.data.get('reviewer_notes', '')
        res.save()
        notes_txt = f'\nObservaciones: {res.reviewer_notes}' if res.reviewer_notes else ''
        self._notify_unit_vecinos(
            res,
            notif_type='reservation_approved',
            title=f'✅ Tu reserva de {res.area_name} fue aprobada',
            message=f'Fecha: {res.date}  {str(res.start_time)[:5]}–{str(res.end_time)[:5]}{notes_txt}',
        )
        _audit_log(
            request, 'reservas', 'approve',
            f'Reserva aprobada: {res.area_name} — {res.date}',
            tenant_id=tenant_id,
            object_type='AmenityReservation', object_id=str(res.id),
            object_repr=f'{res.area_name} / {res.date}',
        )
        return Response(self.get_serializer(res).data)

    @action(detail=True, methods=['post'])
    def reject(self, request, tenant_id=None, pk=None):
        res = self.get_object()
        res.status = 'rejected'
        res.reviewed_by = request.user
        res.rejection_reason = request.data.get('reason', '')
        res.reviewer_notes = request.data.get('reviewer_notes', res.rejection_reason)
        res.save()
        reason_txt = f'\nMotivo: {res.rejection_reason}' if res.rejection_reason else ''
        self._notify_unit_vecinos(
            res,
            notif_type='reservation_rejected',
            title=f'❌ Tu reserva de {res.area_name} fue rechazada',
            message=f'Fecha: {res.date}{reason_txt}',
        )
        _audit_log(
            request, 'reservas', 'reject',
            f'Reserva rechazada: {res.area_name} — {res.date}',
            tenant_id=tenant_id,
            object_type='AmenityReservation', object_id=str(res.id),
            object_repr=f'{res.area_name} / {res.date}',
        )
        return Response(self.get_serializer(res).data)

    @action(detail=True, methods=['post'])
    def cancel(self, request, tenant_id=None, pk=None):
        res = self.get_object()
        res.status = 'cancelled'
        res.save()
        time_str    = f'{str(res.start_time)[:5]}–{str(res.end_time)[:5]}'
        unit_label  = f' — {res.unit.unit_name}' if res.unit else ''
        cancel_msg  = f'Fecha: {res.date}  {time_str}'

        user = request.user
        canceller_role = None
        try:
            tu = TenantUser.objects.get(user=user, tenant_id=tenant_id)
            canceller_role = tu.role
        except TenantUser.DoesNotExist:
            pass

        if canceller_role in ('admin', 'tesorero', 'superadmin', None):
            # Admin/manager cancelled → notify vecinos of the unit
            self._notify_unit_vecinos(
                res,
                notif_type='reservation_cancelled',
                title=f'🚫 Tu reserva de {res.area_name} fue cancelada',
                message=cancel_msg,
            )
        else:
            # Vecino/vigilante cancelled → notify managers
            self._notify_managers(
                res,
                notif_type='reservation_cancelled',
                title=f'Reserva cancelada: {res.area_name}{unit_label}',
                message=cancel_msg,
            )
        _audit_log(
            request, 'reservas', 'cancel',
            f'Reserva cancelada: {res.area_name} — {res.date}',
            tenant_id=tenant_id,
            object_type='AmenityReservation', object_id=str(res.id),
            object_repr=f'{res.area_name} / {res.date}',
        )
        return Response(self.get_serializer(res).data)


# ═══════════════════════════════════════════════════════════
#  NOTIFICATIONS
# ═══════════════════════════════════════════════════════════

class NotificationViewSet(viewsets.GenericViewSet):
    """
    GET  /tenants/{id}/notifications/           → list (current user)
    GET  /tenants/{id}/notifications/unread-count/ → {count}
    POST /tenants/{id}/notifications/{id}/mark-read/ → mark one read
    POST /tenants/{id}/notifications/mark-all-read/  → mark all read
    """
    serializer_class   = NotificationSerializer
    permission_classes = [IsTenantMember]

    def get_queryset(self):
        return Notification.objects.filter(
            tenant_id=self.kwargs['tenant_id'],
            user=self.request.user,
        )

    def list(self, request, tenant_id=None):
        qs = self.get_queryset()
        only_unread = request.query_params.get('unread') == '1'
        if only_unread:
            qs = qs.filter(is_read=False)
        # cap to 100 most recent
        qs = qs[:100]
        return Response(self.get_serializer(qs, many=True).data)

    @action(detail=False, methods=['get'], url_path='unread-count')
    def unread_count(self, request, tenant_id=None):
        count = self.get_queryset().filter(is_read=False).count()
        return Response({'count': count})

    @action(detail=True, methods=['post'], url_path='mark-read')
    def mark_read(self, request, tenant_id=None, pk=None):
        try:
            notif = self.get_queryset().get(pk=pk)
            notif.is_read = True
            notif.save(update_fields=['is_read'])
            return Response({'ok': True})
        except Notification.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)

    @action(detail=False, methods=['post'], url_path='mark-all-read')
    def mark_all_read(self, request, tenant_id=None):
        self.get_queryset().filter(is_read=False).update(is_read=True)
        return Response({'ok': True})


# ═══════════════════════════════════════════════════════════
#  AUDIT LOG VIEWSET  (super-admin only)
# ═══════════════════════════════════════════════════════════

class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    """
    GET  /api/audit-logs/           → list (with filters)
    GET  /api/audit-logs/{id}/      → retrieve
    GET  /api/audit-logs/summary/   → counts per module / action (last 30 days)
    Super-admin access only.
    """
    serializer_class   = AuditLogSerializer
    permission_classes = [IsSuperAdmin]

    def get_queryset(self):
        qs = AuditLog.objects.select_related('tenant', 'user').all()

        # ── Filters ────────────────────────────────────────────
        tenant_id = self.request.query_params.get('tenant_id')
        if tenant_id:
            qs = qs.filter(tenant_id=tenant_id)

        module = self.request.query_params.get('module')
        if module:
            qs = qs.filter(module=module)

        action = self.request.query_params.get('action')
        if action:
            qs = qs.filter(action=action)

        user_q = self.request.query_params.get('user')
        if user_q:
            qs = qs.filter(
                Q(user_name__icontains=user_q) | Q(user_email__icontains=user_q)
            )

        date_from = self.request.query_params.get('date_from')
        if date_from:
            qs = qs.filter(created_at__date__gte=date_from)

        date_to = self.request.query_params.get('date_to')
        if date_to:
            qs = qs.filter(created_at__date__lte=date_to)

        search = self.request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(
                Q(description__icontains=search) |
                Q(object_repr__icontains=search) |
                Q(user_name__icontains=search) |
                Q(tenant_name__icontains=search)
            )

        return qs

    def list(self, request, *args, **kwargs):
        qs     = self.get_queryset()
        total  = qs.count()
        # Pagination
        try:
            page     = max(1, int(request.query_params.get('page', 1)))
            per_page = max(10, min(200, int(request.query_params.get('per_page', 50))))
        except (ValueError, TypeError):
            page, per_page = 1, 50
        offset  = (page - 1) * per_page
        sliced  = qs[offset: offset + per_page]
        serializer = self.get_serializer(sliced, many=True)
        return Response({
            'count':    total,
            'page':     page,
            'per_page': per_page,
            'results':  serializer.data,
        })

    @action(detail=False, methods=['get'], url_path='summary')
    def summary(self, request):
        """Returns total counts per module and action for quick stats."""
        from django.db.models import Count as DjCount
        from datetime import date, timedelta
        since = timezone.now() - timedelta(days=30)
        qs = AuditLog.objects.filter(created_at__gte=since)

        # Filter by tenant if provided (super-admin viewing a specific tenant)
        tenant_id = request.query_params.get('tenant_id')
        if tenant_id:
            qs = qs.filter(tenant_id=tenant_id)

        by_module = (
            qs.values('module')
              .annotate(count=DjCount('id'))
              .order_by('-count')
        )
        by_action = (
            qs.values('action')
              .annotate(count=DjCount('id'))
              .order_by('-count')
        )
        total_today_qs = AuditLog.objects.filter(created_at__date=date.today())
        if tenant_id:
            total_today_qs = total_today_qs.filter(tenant_id=tenant_id)
        total_today = total_today_qs.count()

        return Response({
            'total_today':  total_today,
            'total_30d':    qs.count(),
            'by_module':    list(by_module),
            'by_action':    list(by_action),
        })


# ═══════════════════════════════════════════════════════════
#  DASHBOARD
# ═══════════════════════════════════════════════════════════

class DashboardView(APIView):
    """GET /api/tenants/{tenant_id}/dashboard/?period=YYYY-MM"""
    permission_classes = [IsTenantMember]

    def get(self, request, tenant_id):
        period = request.query_params.get('period')
        if not period:
            from datetime import date
            period = date.today().strftime('%Y-%m')

        tenant = Tenant.objects.get(id=tenant_id)
        units = Unit.objects.filter(tenant_id=tenant_id)
        total_units = units.count()
        exempt_count = units.filter(admin_exempt=True).count()

        payments = Payment.objects.filter(tenant_id=tenant_id, period=period)

        # Count by unique unit IDs to avoid double-counting and to exclude exempt units
        exempt_unit_ids = set(units.filter(admin_exempt=True).values_list('id', flat=True))
        non_exempt_unit_ids = set(units.filter(admin_exempt=False).values_list('id', flat=True))

        paid_unit_ids = (
            set(payments.filter(status='pagado').values_list('unit_id', flat=True))
            - exempt_unit_ids
        )
        partial_unit_ids = (
            set(payments.filter(status='parcial').values_list('unit_id', flat=True))
            - exempt_unit_ids
            - paid_unit_ids  # unit paid in full takes precedence over partial
        )
        paid_count = len(paid_unit_ids)
        partial_count = len(partial_unit_ids)
        pending_count = max(0, len(non_exempt_unit_ids) - paid_count - partial_count)

        # Total collected — solo mantenimiento fijo
        total_collected = FieldPayment.objects.filter(
            payment__tenant_id=tenant_id,
            payment__period=period,
            field_key='maintenance',
        ).aggregate(total=Sum('received'))['total'] or Decimal('0')

        # Cargos fijos: solo unidades no exentas
        billable_units = total_units - exempt_count
        total_expected = tenant.maintenance_fee * billable_units

        # Required extra fields
        req_fields = ExtraField.objects.filter(
            tenant_id=tenant_id, enabled=True, required=True
        )
        for ef in req_fields:
            total_expected += ef.default_amount * billable_units

        collection_rate = (
            float(total_collected / total_expected * 100) if total_expected > 0 else 0
        )

        # Gastos
        total_gastos = GastoEntry.objects.filter(
            tenant_id=tenant_id, period=period
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0')

        # Solo gastos conciliados (para tarjeta Gastos vs Ingresos)
        total_gastos_conciliados = GastoEntry.objects.filter(
            tenant_id=tenant_id, period=period, bank_reconciled=True
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0')

        total_caja = CajaChicaEntry.objects.filter(
            tenant_id=tenant_id, period=period
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0')

        rented_count = units.filter(occupancy='rentada').count()

        # Ingresos adicionales: FieldPayments del periodo que NO sean mantenimiento
        # (campos extra opcionales/obligatorios — NO incluye adeudo_payments que son JSON aparte)
        ingreso_adicional = FieldPayment.objects.filter(
            payment__tenant_id=tenant_id,
            payment__period=period,
        ).exclude(field_key='maintenance').aggregate(total=Sum('received'))['total'] or Decimal('0')

        # Adeudo recibido este periodo (suma de adeudo_payments JSON — métrica separada, no forma parte de ingresos)
        total_adeudo_recibido = Decimal('0')
        for p in payments:
            for period_debt in (p.adeudo_payments or {}).values():
                if isinstance(period_debt, dict):
                    for amt in period_debt.values():
                        total_adeudo_recibido += Decimal(str(amt or 0))

        # Deuda total = suma del adeudo real por unidad al corte del período
        # (misma lógica que ReporteAdeudosView para que coincida con el reporte)
        start_period = tenant.operation_start_date or '2024-01'
        deuda_total = Decimal('0')
        # Pre-fetch planes activos una sola vez para evitar N+1 queries en _compute_statement
        _unit_active_plans = {
            str(_p.unit_id): _p
            for _p in PaymentPlan.objects.filter(tenant_id=tenant_id, status='accepted')
        }
        for unit in units:
            # Si una unidad falla en el cálculo, no debe tumbar todo el dashboard
            try:
                _, _, _, bal, prev_debt_adeudo, _u_active_plan = _compute_statement(
                    tenant, str(unit.id), start_period, period,
                    _prefetched_plan=_unit_active_plans.get(str(unit.id)),
                )
                previous_debt_u = Decimal(str(unit.previous_debt or 0))
                credit_balance_u = Decimal(str(unit.credit_balance or 0))
                prev_debt_adeudo_dec = Decimal(str(prev_debt_adeudo))
                if _u_active_plan:
                    adj_bal = Decimal(str(bal)) - credit_balance_u
                else:
                    adj_bal = Decimal(str(bal)) + previous_debt_u - prev_debt_adeudo_dec - credit_balance_u
                deuda_total += max(Decimal('0'), adj_bal)
            except Exception:
                # Omitir unidades con datos inconsistentes; la deuda total queda subestimada
                # para esa unidad pero el dashboard continúa cargando.
                import logging
                logging.getLogger(__name__).exception(
                    'Error computing statement for unit %s in tenant %s', unit.id, tenant_id
                )
                continue

        # Total ingresos = mantenimiento + campos adicionales (SIN adeudos)
        # total_collected = solo FieldPayments de mantenimiento fijo
        # ingreso_adicional = campos extra (opcionales/obligatorios, no mantenimiento)
        # los adeudo_payments son un JSON aparte y NO deben sumarse aquí
        total_ingresos = total_collected + ingreso_adicional

        data = {
            'total_units': total_units,
            'units_planned': tenant.units_count,
            'rented_count': rented_count,
            'total_collected': float(total_collected),
            'total_expected': float(total_expected),
            'collection_rate': round(collection_rate, 1),
            'paid_count': paid_count,
            'partial_count': partial_count,
            'pending_count': pending_count,
            'exempt_count': exempt_count,
            'total_gastos': float(total_gastos),
            'total_gastos_conciliados': float(total_gastos_conciliados),
            'total_caja_chica': float(total_caja),
            'maintenance_fee': float(tenant.maintenance_fee),
            'period': period,
            'ingreso_adicional': float(ingreso_adicional),
            'total_adeudo_recibido': float(total_adeudo_recibido),
            'deuda_total': float(deuda_total),
            'total_ingresos': float(total_ingresos),
        }
        return Response(DashboardSerializer(data).data)


# ═══════════════════════════════════════════════════════════
#  ESTADO DE CUENTA (Account Statement) — Replicates HTML computeStatement
# ═══════════════════════════════════════════════════════════

def _periods_between(start_ym, end_ym):
    """Yield YYYY-MM strings from start to end inclusive."""
    from datetime import date
    if not start_ym or not end_ym or start_ym > end_ym:
        return []
    y, m = map(int, start_ym.split('-'))
    end_y, end_m = map(int, end_ym.split('-'))
    out = []
    while (y, m) <= (end_y, end_m):
        out.append(f'{y}-{m:02d}')
        m += 1
        if m > 12:
            m, y = 1, y + 1
    return out


def _today_period():
    from datetime import date
    d = date.today()
    return f'{d.year}-{d.month:02d}'


_MONTH_NAMES_ES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                   'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

_PAYMENT_TYPE_LABELS = {
    'efectivo': 'Efectivo',
    'transferencia': 'Transferencia Bancaria',
    'cheque': 'Cheque',
    'tarjeta': 'Tarjeta',
    'deposito': 'Depósito',
    'otro': 'Otro',
}

_CURRENCY_SYMBOLS = {'MXN': '$', 'USD': 'US$', 'EUR': '€'}


def _period_label_es(period: str) -> str:
    """Convert 'YYYY-MM' to 'Mes YYYY' in Spanish."""
    if not period or len(period) < 7:
        return period or ''
    try:
        year, month = period[:7].split('-')
        return f'{_MONTH_NAMES_ES[int(month)]} {year}'
    except (ValueError, IndexError):
        return period


def _compute_receipt_email_data(payment, unit, tenant, extra_fields: list) -> dict:
    """Compute receipt rows and totals for the email, mirroring JS receipt logic."""
    # Effective totals: main field_payments + additional_payments
    eff_totals: dict[str, Decimal] = {}
    for fp in payment.field_payments.all():
        eff_totals[fp.field_key] = eff_totals.get(fp.field_key, Decimal('0')) + fp.received
    for ap in (payment.additional_payments or []):
        for fk, fd in (ap.get('field_payments') or {}).items():
            v = fd.get('received', 0) if isinstance(fd, dict) else fd
            eff_totals[fk] = eff_totals.get(fk, Decimal('0')) + Decimal(str(v or 0))

    is_exempt = bool(unit.admin_exempt)
    maint_charge = Decimal('0') if is_exempt else Decimal(str(tenant.maintenance_fee or 0))

    req_efs = [ef for ef in extra_fields if ef.required]
    opt_efs = [ef for ef in extra_fields if not ef.required]

    rows = []
    total_req_charges = Decimal('0')
    total_req_paid = Decimal('0')
    total_received = Decimal('0')

    # Required section
    rows.append({'is_section': True, 'concept': '● Campos Obligatorios'})

    # Maintenance
    maint_abono = min(eff_totals.get('maintenance', Decimal('0')), maint_charge)
    maint_bal = maint_charge - maint_abono
    rows.append({'concept': 'Mantenimiento', 'charge': float(maint_charge), 'paid': float(maint_abono), 'balance': float(maint_bal)})
    total_req_charges += maint_charge
    total_req_paid += maint_abono
    total_received += maint_abono

    for ef in req_efs:
        ch = Decimal(str(ef.default_amount or 0))
        ab = min(eff_totals.get(str(ef.id), Decimal('0')), ch)
        bal = ch - ab
        rows.append({'concept': ef.label, 'charge': float(ch), 'paid': float(ab), 'balance': float(bal)})
        total_req_charges += ch
        total_req_paid += ab
        total_received += ab

    # Optional section
    opt_rows = []
    for ef in opt_efs:
        ab = eff_totals.get(str(ef.id), Decimal('0'))
        if ab > 0:
            opt_rows.append({'concept': ef.label, 'charge': 0, 'paid': float(ab), 'balance': 0})
            total_received += ab
    if opt_rows:
        rows.append({'is_section': True, 'concept': '◦ Campos Opcionales'})
        rows.extend(opt_rows)

    # Adelantos (future-period credits)
    fp_map = {fp.field_key: fp for fp in payment.field_payments.all()}
    adelanto_rows = []
    for field_key, fp in fp_map.items():
        if fp.adelanto_targets and isinstance(fp.adelanto_targets, dict):
            for tp, amt in fp.adelanto_targets.items():
                a = Decimal(str(amt or 0))
                if a > 0:
                    f_label = 'Mantenimiento' if field_key == 'maintenance' else next(
                        (e.label for e in extra_fields if str(e.id) == field_key), field_key)
                    adelanto_rows.append({'concept': f'{f_label} — {_period_label_es(tp)}', 'charge': 0, 'paid': float(a), 'balance': 0})
                    total_received += a
    if adelanto_rows:
        rows.append({'is_section': True, 'concept': '→ Adelantos a Períodos Futuros'})
        rows.extend(adelanto_rows)

    # Adeudos
    adeudo_rows = []
    for target_period, field_map in (payment.adeudo_payments or {}).items():
        for field_id, amt in (field_map or {}).items():
            a = Decimal(str(amt or 0))
            if a > 0:
                if field_id == 'maintenance':
                    f_label = 'Mantenimiento'
                elif field_id == 'prevDebt':
                    f_label = 'Deuda Anterior'
                else:
                    f_label = next((e.label for e in extra_fields if str(e.id) == field_id), field_id)
                tp_display = 'Saldo Previo' if target_period == '__prevDebt' else _period_label_es(target_period)
                adeudo_rows.append({'concept': f'{f_label} — {tp_display}', 'charge': 0, 'paid': float(a), 'balance': 0})
                total_received += a
    if adeudo_rows:
        rows.append({'is_section': True, 'concept': '↑ Abonos a Adeudos Previos'})
        rows.extend(adeudo_rows)

    # Plan de pagos installments
    plan_rows = []
    for fk, fp in fp_map.items():
        if not fk.startswith('plan_'):
            continue
        plan_uuid = fk[5:]  # strip 'plan_' prefix
        try:
            from .models import PaymentPlan as _PP
            plan_obj = _PP.objects.get(id=plan_uuid, tenant_id=tenant.id, unit_id=unit.id)
        except Exception:
            continue
        inst = next((i for i in (plan_obj.installments or []) if i.get('period_key') == payment.period), None)
        if inst is None:
            continue
        debt = Decimal(str(inst.get('debt_part', 0)))
        paid_amt = min(fp.received, debt) if debt > 0 else fp.received
        bal_amt  = max(Decimal('0'), debt - paid_amt)
        inst_label = inst.get('period_label') or _period_label_es(payment.period)
        plan_rows.append({
            'concept': f'Cuota Plan de Pago — {inst_label}',
            'charge': float(debt),
            'paid': float(paid_amt),
            'balance': float(bal_amt),
        })
        total_req_charges += debt
        total_req_paid += paid_amt
        total_received += paid_amt
    if plan_rows:
        rows.append({'is_section': True, 'concept': '📋 Plan de Pago de Adeudos'})
        rows.extend(plan_rows)

    saldo = max(Decimal('0'), total_req_charges - total_req_paid)

    # Payment info labels
    pt_label = _PAYMENT_TYPE_LABELS.get(payment.payment_type or '', payment.payment_type or 'No especificado')
    if payment.payment_date:
        from datetime import date as _date
        pd = payment.payment_date
        if hasattr(pd, 'month'):
            pd_label = f'{pd.day:02d} de {_MONTH_NAMES_ES[pd.month]} de {pd.year}'
        else:
            pd_label = str(pd)
    else:
        pd_label = 'No registrada'

    currency_sym = _CURRENCY_SYMBOLS.get(getattr(tenant, 'currency', 'MXN') or 'MXN', '$')

    return {
        'tenant_name': getattr(tenant, 'razon_social', '') or tenant.name or '',
        'tenant_rfc': getattr(tenant, 'rfc', '') or '',
        'currency_symbol': currency_sym,
        'unit_code': unit.unit_id_code or '',
        'unit_name': unit.unit_name or '',
        'responsible': unit.responsible_name or '',
        'period_str': _period_label_es(payment.period),
        'folio': payment.folio or '',
        'payment_type_label': pt_label,
        'payment_date_label': pd_label,
        'rows': rows,
        'total_charges': float(total_req_charges),
        'total_paid': float(total_received),
        'saldo': float(saldo),
    }


def _has_admin_exempt(tenant, unit_id, period):
    """Check if unit has active admin exemption for period (mesa_directiva)."""
    if not tenant or getattr(tenant, 'admin_type', None) != 'mesa_directiva':
        return False
    unit = Unit.objects.filter(id=unit_id, tenant_id=tenant.id).first()
    if not unit or not unit.admin_exempt:
        return False
    qs = AssemblyPosition.objects.filter(tenant_id=tenant.id, holder_unit_id=unit_id, active=True)
    for pos in qs:
        if pos.start_date and period < pos.start_date:
            continue
        if pos.end_date and period > pos.end_date:
            continue
        if pos.committee_id:
            cm = Committee.objects.filter(id=pos.committee_id).first()
            if cm and cm.exemption:
                return True
        return True
    return False


# Sentinel: distinguishes "caller did not pass a plan" (do the DB lookup)
# from "caller explicitly passed None" (no active plan, skip lookup).
_NO_PREFETCH = object()


def _compute_statement(tenant, unit_id, start_period, cutoff_period, _prefetched_plan=_NO_PREFETCH):
    """
    Replicate HTML computeStatement logic.
    Returns list of period rows: charge, paid, status, maintenance, saldo_accum.

    _prefetched_plan: pass a PaymentPlan instance (or None) to skip the DB lookup.
    When omitted the function queries the DB itself (fine for single-unit calls).
    Always pass this in loops to avoid N+1 queries.
    """
    from datetime import date
    today = _today_period()

    cob_fields = list(ExtraField.objects.filter(
        tenant_id=tenant.id, enabled=True
    ).exclude(field_type='gastos'))
    req_fields = [f for f in cob_fields if f.required]
    # Adelanto: pagos opcionales que suman como saldo a favor (reducen saldo_acum y saldo_final).
    # Neutral: pagos registrados pero que NO afectan el saldo (ni suman ni restan).
    adelanto_opt_fields = [f for f in cob_fields if not f.required and f.field_type == 'adelanto']
    neutral_opt_fields  = [f for f in cob_fields if not f.required and f.field_type != 'adelanto']
    opt_fields = adelanto_opt_fields + neutral_opt_fields  # orden: adelantos primero en field_detail

    unit = Unit.objects.filter(id=unit_id, tenant_id=tenant.id).first()
    previous_debt = float(unit.previous_debt or 0) if unit else 0
    credit_balance = float(unit.credit_balance or 0) if unit else 0

    # Solo pagos propios que NO fueron redirigidos a otra unidad
    payments_qs = Payment.objects.filter(
        tenant_id=tenant.id, unit_id=unit_id
    ).filter(
        Q(applied_to_unit__isnull=True) | Q(applied_to_unit_id=unit_id)
    ).prefetch_related('field_payments')

    payments_by_period = {p.period: p for p in payments_qs}

    # Pagos de OTRAS unidades que aplican a esta unidad (cross-unit)
    # Caso A: el Payment principal tiene applied_to_unit_id = unit_id
    # → sumas de field_payments del FieldPayment model
    cross_fp_by_period = {}   # period → {field_key: Decimal total}
    cross_meta_by_period = {} # period → first cross Payment (para metadata display)
    cross_qs = Payment.objects.filter(
        tenant_id=tenant.id,
        applied_to_unit_id=unit_id,
    ).exclude(unit_id=unit_id).prefetch_related('field_payments', 'unit')
    for cp in cross_qs:
        if cp.period not in cross_meta_by_period:
            cross_meta_by_period[cp.period] = cp
        for cfp in cp.field_payments.all():
            amt = Decimal(str(cfp.received or 0))
            if amt > 0:
                cross_fp_by_period.setdefault(cp.period, {})[cfp.field_key] = \
                    cross_fp_by_period.get(cp.period, {}).get(cfp.field_key, Decimal('0')) + amt

    # Caso B: una additional_payment entry de OTRO pago tiene applied_to_unit_id = unit_id
    # → sumas de los field_payments JSON de esa entrada adicional
    addl_cross_qs = Payment.objects.filter(
        tenant_id=tenant.id,
    ).exclude(unit_id=unit_id).only('id', 'unit_id', 'period', 'additional_payments').select_related('unit')
    for ap_pay in addl_cross_qs:
        for ap_entry in (ap_pay.additional_payments or []):
            if str(ap_entry.get('applied_to_unit_id', '')) != str(unit_id):
                continue
            fp_data = ap_entry.get('field_payments') or {}
            for f_id, fd in fp_data.items():
                amt = Decimal(str(fd.get('received', 0) if isinstance(fd, dict) else fd or 0))
                if amt > 0:
                    cross_fp_by_period.setdefault(ap_pay.period, {})[f_id] = \
                        cross_fp_by_period.get(ap_pay.period, {}).get(f_id, Decimal('0')) + amt
                    if ap_pay.period not in cross_meta_by_period:
                        cross_meta_by_period[ap_pay.period] = ap_pay

    adelanto_credits = {}
    adeudo_credits_received = {}
    prev_debt_adeudo = Decimal('0')
    # Adeudo recibido por período de pago (para mostrar en la columna Abono del período receptor)
    adeudo_all_by_recv = {}   # payment.period -> total adeudo cobrado (todos los tipos, para display)
    adeudo_spec_by_recv = {}  # payment.period -> total adeudo de períodos específicos (para balance)

    for p in payments_qs:
        fp_map = {fp.field_key: fp for fp in p.field_payments.all()}
        for field_key, fp in fp_map.items():
            at = fp.adelanto_targets or {}
            for target_period, amt in at.items():
                if target_period not in adelanto_credits:
                    adelanto_credits[target_period] = {}
                adelanto_credits[target_period][field_key] = adelanto_credits[target_period].get(field_key, Decimal('0')) + Decimal(str(amt or 0))

        ap = p.adeudo_payments or {}
        recv_period = p.period
        for target_p, field_map in ap.items():
            total = sum(Decimal(str(v or 0)) for v in (field_map or {}).values())
            if target_p == '__prevDebt':
                prev_debt_adeudo += total
            else:
                adeudo_credits_received[target_p] = adeudo_credits_received.get(target_p, Decimal('0')) + total
                adeudo_spec_by_recv[recv_period] = adeudo_spec_by_recv.get(recv_period, Decimal('0')) + total
            adeudo_all_by_recv[recv_period] = adeudo_all_by_recv.get(recv_period, Decimal('0')) + total

    # ── Plan de pagos activo ────────────────────────────────────────
    # Cuando la unidad tiene un plan de pagos aceptado, la deuda anterior
    # queda absorbida en las cuotas del plan (debt_part por periodo).
    # El saldo inicial no incluye previous_debt; arranca limpio menos credit_balance.
    #
    # Use _prefetched_plan when the caller is looping over units (avoids N+1).
    # When not provided, query the DB here (single-unit calls, e.g. unit detail).
    if _prefetched_plan is _NO_PREFETCH:
        active_plan = PaymentPlan.objects.filter(
            tenant_id=tenant.id, unit_id=unit_id, status='accepted',
        ).first()
    else:
        active_plan = _prefetched_plan  # may be None (no plan for this unit)
    plan_installments_by_period = {}
    plan_field_payments_by_period = {}
    if active_plan:
        _plan_key = active_plan.field_key
        for _inst in (active_plan.installments or []):
            _pk = _inst.get('period_key')
            if _pk:
                plan_installments_by_period[_pk] = _inst
        _plan_fps = FieldPayment.objects.filter(
            payment__tenant_id=tenant.id,
            payment__unit_id=unit_id,
            field_key=_plan_key,
        ).values('payment__period', 'received')
        for _pfp in _plan_fps:
            _prd = _pfp['payment__period']
            plan_field_payments_by_period[_prd] = (
                plan_field_payments_by_period.get(_prd, Decimal('0')) +
                Decimal(str(_pfp['received'] or 0))
            )
    # ──────────────────────────────────────────────────────────────

    # Saldo inicial = deuda anterior - abonos a deuda - saldo a favor previo
    # Sin max(0,...): el excedente de saldo a favor reduce los cargos de los periodos
    # Cuando hay plan activo, la deuda anterior está absorbida en el plan.
    if active_plan:
        saldo_acum = Decimal('0') - Decimal(str(credit_balance))
    else:
        saldo_acum = Decimal(str(previous_debt)) - prev_debt_adeudo - Decimal(str(credit_balance))

    periods = _periods_between(start_period, cutoff_period)
    rows = []

    for period in periods:
        pay = payments_by_period.get(period)
        fp_map = {}
        if pay:
            for fp in pay.field_payments.all():
                fp_map[fp.field_key] = fp

        # Montos adicionales de pagos cross-unit (de otra unidad aplicados aquí)
        cross_extra = cross_fp_by_period.get(period, {})
        # Si no hay pago directo pero sí cross, usar el cross payment como metadato display
        cross_pay = cross_meta_by_period.get(period)

        ac = adelanto_credits.get(period, {})

        is_exempt = _has_admin_exempt(tenant, unit_id, period)
        maint_charge = Decimal('0') if is_exempt else (tenant.maintenance_fee or Decimal('0'))
        maint_fp = fp_map.get('maintenance')
        # Unidades exentas: mantenimiento completamente neutro (cargo=0, abono=0)
        # para que ni sume ni reste en saldo y totales
        if is_exempt:
            maint_received = Decimal('0')
            maint_adelanto = Decimal('0')
        else:
            maint_received = Decimal(str(maint_fp.received or 0)) if maint_fp else Decimal('0')
            # Incluir montos de pago cross-unit para mantenimiento
            maint_received += cross_extra.get('maintenance', Decimal('0'))
            maint_adelanto = Decimal(str(ac.get('maintenance', 0))) if isinstance(ac.get('maintenance'), (int, float, str)) else Decimal(str(ac.get('maintenance', 0) or 0))
        maint_abono = maint_received + maint_adelanto

        total_cargo_req = maint_charge
        total_abono_req = maint_abono
        total_cargo_opt = Decimal('0')
        total_abono_opt = Decimal('0')
        total_received_neutral = Decimal('0')  # Pagos de campos neutrales (solo para mostrar, no afectan saldo)

        field_detail = []

        for ef in req_fields:
            charge = Decimal(str(ef.default_amount or 0))
            field_fp = fp_map.get(str(ef.id))
            received = Decimal(str(field_fp.received or 0)) if field_fp else Decimal('0')
            received += cross_extra.get(str(ef.id), Decimal('0'))  # cross-unit supplement
            adelanto = Decimal(str(ac.get(str(ef.id), 0))) if str(ef.id) in ac else Decimal('0')
            abono = received + adelanto
            total_cargo_req += charge
            total_abono_req += abono
            field_detail.append({'id': str(ef.id), 'label': ef.label, 'charge': float(charge), 'received': float(received), 'adelanto': float(adelanto), 'abono': float(abono), 'required': True})

        for ef in opt_fields:
            field_fp = fp_map.get(str(ef.id))
            charge = Decimal('0')  # Optional fields: no fixed charge
            received = Decimal(str(field_fp.received or 0)) if field_fp else Decimal('0')
            received += cross_extra.get(str(ef.id), Decimal('0'))  # cross-unit supplement
            ef_adelanto = Decimal(str(ac.get(str(ef.id), 0))) if str(ef.id) in ac else Decimal('0')
            abono = received + ef_adelanto
            total_cargo_opt += charge
            # Solo los campos tipo 'adelanto' suman al saldo (crédito a favor).
            # Los campos neutrales se registran para mostrar en la columna de abonos pero NO afectan el saldo.
            if ef.field_type == 'adelanto':
                total_abono_opt += abono
            else:
                total_received_neutral += abono
            field_detail.append({
                'id': str(ef.id), 'label': ef.label,
                'charge': float(charge), 'received': float(received),
                'adelanto': float(ef_adelanto), 'abono': float(abono),
                'required': False, 'contributes_balance': ef.field_type == 'adelanto',
            })

        cargo_oblig = maint_charge + sum(Decimal(str(ef.default_amount or 0)) for ef in req_fields)

        # ── Cuota de plan de pagos activo para este período ──────────────
        plan_inst = plan_installments_by_period.get(period) if active_plan else None
        if plan_inst:
            _debt_part = Decimal(str(plan_inst.get('debt_part', 0)))
            _plan_rcvd = plan_field_payments_by_period.get(period, Decimal('0'))
            total_cargo_req += _debt_part
            cargo_oblig += _debt_part
            total_abono_req += _plan_rcvd
            _n_inst = plan_inst.get('num', '?')
            _n_total = len(active_plan.installments or [])
            # Compute installment status dynamically from actual payment data
            # (the JSON field may be stale if _update_plan_installments wasn't called)
            if _debt_part > 0 and _plan_rcvd >= _debt_part:
                _inst_status = 'paid'
            elif _plan_rcvd > 0:
                _inst_status = 'partial'
            else:
                _inst_status = plan_inst.get('status', 'pending')  # fall back to JSON if no payment
            field_detail.append({
                'id': active_plan.field_key,
                'label': f'Plan de Pagos — Cuota {_n_inst}/{_n_total}',
                'charge': float(_debt_part),
                'received': float(_plan_rcvd),
                'adelanto': 0.0,
                'abono': float(_plan_rcvd),
                'required': True,
                'is_plan_installment': True,
                'plan_inst': {
                    'num': _n_inst,
                    'n_total': _n_total,
                    'debt_part': float(_debt_part),
                    'regular_part': float(plan_inst.get('regular_part', 0)),
                    'total': float(plan_inst.get('total', 0)),
                    'paid_amount': float(_plan_rcvd),  # always from real payment data
                    'status': _inst_status,             # always from real payment data
                },
            })
        # ─────────────────────────────────────────────────────────────────

        cargo_opt = total_cargo_opt
        cargo_total = cargo_oblig + cargo_opt
        abono_balance = total_abono_req + total_abono_opt          # Solo pagos que afectan el saldo
        abono_display = abono_balance + total_received_neutral     # Todos los pagos recibidos (para mostrar)

        # Adeudo cobrado en este período: se suma al display y al balance
        # __prevDebt: solo display (ya está en saldo_acum inicial vía prev_debt_adeudo)
        # Específicos: display + balance (reducen el saldo acumulado de deudas pasadas)
        adeudo_recv_all = adeudo_all_by_recv.get(period, Decimal('0'))
        adeudo_recv_spec = adeudo_spec_by_recv.get(period, Decimal('0'))
        abono_display += adeudo_recv_all
        abono_balance += adeudo_recv_spec

        oblig_abono = maint_abono + sum((Decimal(str(fd['abono'])) for fd in field_detail if fd.get('required')), Decimal('0'))
        # oblig_abono is always Decimal now (maint_abono is Decimal, sum starts at Decimal('0'))
        oblig_abono_capped = min(oblig_abono, cargo_oblig) if cargo_oblig > 0 else oblig_abono

        # Parcial: mantenimiento fijo sin abono + al menos un campo adicional activo con abono,
        #          o mantenimiento fijo con abono incompleto (abono < cargo).
        has_non_maint_abono = any(
            fd['abono'] > 0 for fd in field_detail if fd.get('id') != 'maintenance'
        )

        is_past = period <= today
        # Si no hay pago directo pero hay un cross-unit, usarlo como base de metadatos
        eff_pay = pay or (cross_pay if cross_extra.get(period) or cross_pay else None)
        if eff_pay:
            eff_status = eff_pay.status
        else:
            eff_status = 'pendiente' if is_past else 'futuro'

        if is_exempt and cargo_oblig == Decimal('0'):
            # Período completamente exento sin campos adicionales obligatorios → exento
            eff_status = 'exento'
        elif cargo_oblig > 0 and oblig_abono_capped >= cargo_oblig:
            eff_status = 'exento' if is_exempt else 'pagado'
        elif maint_abono == Decimal('0') and has_non_maint_abono:
            # Mantenimiento no cubierto pero algún otro campo sí tiene pago
            eff_status = 'parcial'
        # Pago de mantenimiento base fija registrado de forma incompleta → Parcial
        elif maint_charge > 0 and Decimal('0') < maint_abono < maint_charge:
            eff_status = 'parcial'
        elif cargo_oblig > Decimal('0') and oblig_abono > Decimal('0'):
            # Catch-all: algún cargo obligatorio tiene pago pero no es suficiente para "pagado".
            # Cubre el caso de mantenimiento cubierto pero cuota del plan de pagos solo parcialmente pagada,
            # o cualquier combinación donde hay pago registrado pero no cubre el total de cargos obligatorios.
            eff_status = 'parcial'
        elif is_past:
            eff_status = 'pendiente'
        else:
            eff_status = 'futuro'

        saldo_periodo = cargo_total - abono_balance   # El saldo solo usa pagos que afectan el balance
        saldo_acum += saldo_periodo

        # Info de pago cross-unit para mostrar nota en el estado de cuenta
        cross_unit_info = None
        if cross_pay and cross_extra:
            cross_unit_info = {
                'unit_code': cross_pay.unit.unit_id_code,
                'unit_name': cross_pay.unit.unit_name,
                'payment_date': str(cross_pay.payment_date) if cross_pay.payment_date else None,
                'payment_type': cross_pay.payment_type,
                'total': float(sum(cross_extra.values())),
            }

        rows.append({
            'period': period,
            'charge': float(cargo_total),
            'paid': float(abono_display),   # Muestra todos los pagos recibidos en la columna Abonos
            'paid_balance': float(abono_balance),  # Solo para cálculo de balance (no expuesto al frontend)
            # Abono de adeudo DIRIGIDO a este período (pagado en otro período via adeudo_payments)
            # No está incluido en paid_balance (que se acredita en el período receptor),
            # pero SÍ reduce el déficit real de este período en el reporte de adeudos.
            'adeudo_received_for_period': float(adeudo_credits_received.get(period, Decimal('0'))),
            'maintenance': float(maint_charge),
            'status': eff_status,
            'payment_type': (pay or eff_pay).payment_type if (pay or eff_pay) else None,
            'payment_date': str((pay or eff_pay).payment_date) if (pay or eff_pay) and (pay or eff_pay).payment_date else None,
            'field_detail': field_detail,
            'maint_detail': {'charge': float(maint_charge), 'received': float(maint_received), 'adelanto': float(maint_adelanto), 'abono': float(maint_abono)},
            'pay': PaymentSerializer(pay).data if pay else None,
            'cross_unit_payment': cross_unit_info,
            'saldo_accum': float(saldo_acum),
        })

    total_charges = sum(r['charge'] for r in rows)
    total_paid_balance = sum(r['paid_balance'] for r in rows)   # Para cálculo correcto del saldo
    total_paid_display = sum(r['paid'] for r in rows)           # Todos los pagos recibidos (para mostrar)
    balance = total_charges - total_paid_balance

    return rows, float(total_charges), float(total_paid_display), float(balance), float(prev_debt_adeudo), active_plan


class EstadoCuentaView(APIView):
    """GET /api/tenants/{tenant_id}/estado-cuenta/?unit_id=X&from=YYYY-MM&to=YYYY-MM
       Without unit_id: returns units list with totals (for Estado por Unidad view)."""
    permission_classes = [IsTenantMember]

    def get(self, request, tenant_id):
        unit_id = request.query_params.get('unit_id')
        period_from = request.query_params.get('from')
        period_to = request.query_params.get('to')
        cutoff_param = request.query_params.get('cutoff')  # for units list

        # Resolve 'me' → the unit assigned to the requesting vecino
        if unit_id == 'me':
            try:
                tu = TenantUser.objects.get(user=request.user, tenant_id=tenant_id)
                if tu.unit_id:
                    unit_id = str(tu.unit_id)
                else:
                    # Fallback: find a unit whose owner/coowner/tenant email matches the user
                    user_email = (request.user.email or '').strip().lower()
                    from django.db.models import Q
                    matched_unit = Unit.objects.filter(
                        tenant_id=tenant_id
                    ).filter(
                        Q(owner_email__iexact=user_email) |
                        Q(coowner_email__iexact=user_email) |
                        Q(tenant_email__iexact=user_email)
                    ).first()
                    if matched_unit:
                        # Auto-assign the unit to this TenantUser for future requests
                        tu.unit = matched_unit
                        tu.save(update_fields=['unit'])
                        unit_id = str(matched_unit.id)
                    else:
                        return Response({'detail': 'No tienes una unidad asignada. Contacta al administrador.'}, status=404)
            except TenantUser.DoesNotExist:
                return Response({'detail': 'Usuario no encontrado en este condominio.'}, status=404)

        tenant = Tenant.objects.get(id=tenant_id)
        start_period = period_from or tenant.operation_start_date or '2024-01'
        cutoff = period_to or cutoff_param or _today_period()

        if not unit_id:
            units = Unit.objects.filter(tenant_id=tenant_id).order_by('unit_id_code')
            unit_data = []
            total_cargo = Decimal('0')
            total_abono = Decimal('0')
            total_deuda = Decimal('0')
            con_adeudo = 0
            total_ingresos_no_identificados = Decimal('0')
            # Agregado por período para que EstadoGeneralView use las mismas cifras
            period_agg = {}

            for ui in UnrecognizedIncome.objects.filter(tenant_id=tenant_id, period__lte=cutoff, period__gte=start_period):
                amt = float(ui.amount or 0)
                total_ingresos_no_identificados += Decimal(str(amt))
                p = ui.period
                if p not in period_agg:
                    period_agg[p] = {'period': p, 'total_charge': 0.0, 'total_paid': 0.0,
                                     'pagados': 0, 'parciales': 0, 'pendientes': 0, 'futuros': 0}
                period_agg[p]['total_paid'] += amt

            # Pre-fetch planes activos una sola vez para evitar N+1 queries en _compute_statement
            _ec_unit_plans = {
                str(_p.unit_id): _p
                for _p in PaymentPlan.objects.filter(tenant_id=tenant_id, status='accepted')
            }
            for unit in units:
                rows, tc, tp, bal, pda, _unit_active_plan = _compute_statement(
                    tenant, str(unit.id), start_period, cutoff,
                    _prefetched_plan=_ec_unit_plans.get(str(unit.id)),
                )
                # Apply same adjustment as unit detail: include previous_debt and credit_balance
                # When unit has active payment plan, previous_debt is absorbed into plan installments
                prev_debt = float(unit.previous_debt or 0)
                credit_bal = float(unit.credit_balance or 0)
                if _unit_active_plan:
                    adj_bal = bal - credit_bal
                else:
                    adj_bal = bal + prev_debt - float(pda) - credit_bal
                total_cargo += Decimal(str(tc))
                total_abono += Decimal(str(tp))
                deuda = max(Decimal('0'), Decimal(str(adj_bal)))
                if deuda > 0:
                    con_adeudo += 1
                total_deuda += deuda

                # Acumular por período — incluyendo estatus reales de _compute_statement
                for row in rows:
                    p = row['period']
                    if p not in period_agg:
                        period_agg[p] = {'period': p, 'total_charge': 0.0, 'total_paid': 0.0,
                                         'pagados': 0, 'parciales': 0, 'pendientes': 0, 'futuros': 0}
                    period_agg[p]['total_charge'] += row['charge']
                    period_agg[p]['total_paid'] += row['paid']  # abono_display
                    st = row.get('status', 'pendiente')
                    if st == 'pagado':
                        period_agg[p]['pagados'] += 1
                    elif st == 'parcial':
                        period_agg[p]['parciales'] += 1
                    elif st == 'futuro':
                        period_agg[p]['futuros'] += 1
                    else:
                        period_agg[p]['pendientes'] += 1

                unit_data.append({
                    'unit': UnitSerializer(unit).data,
                    'payment': None,
                    'total_charge': str(tc),
                    'total_paid': str(tp),
                    'balance': str(adj_bal),
                    'previous_debt': str(prev_debt),
                    'credit_balance': str(credit_bal),
                })

            return Response({
                'tenant': TenantDetailSerializer(tenant).data,
                'period': cutoff,
                'units': unit_data,
                'total_cargo': str(total_cargo),
                'total_abono': str(total_abono + total_ingresos_no_identificados),
                'total_ingresos_no_identificados': str(total_ingresos_no_identificados),
                'total_deuda': str(total_deuda),
                'con_adeudo': con_adeudo,
                'start_period': start_period,
                'cutoff': cutoff,
                'period_aggregates': sorted(period_agg.values(), key=lambda x: x['period']),
            })

        unit = Unit.objects.get(id=unit_id, tenant_id=tenant_id)

        # Sync plan installment statuses against actual FieldPayment records
        # before computing the statement, so plan badges and totals are always accurate.
        _sync_plan = PaymentPlan.objects.filter(
            tenant_id=tenant_id, unit_id=unit_id, status='accepted'
        ).first()
        if _sync_plan:
            try:
                _update_plan_installments(_sync_plan)
                _sync_plan.refresh_from_db()
            except Exception:
                pass

        rows, total_charges, total_paid, balance, prev_debt_adeudo, active_plan = _compute_statement(tenant, str(unit_id), start_period, cutoff)
        previous_debt = float(unit.previous_debt or 0)

        periods_out = []
        for r in rows:
            periods_out.append({
                'period': r['period'],
                'charge': str(r['charge']),
                'paid': str(r['paid']),
                'maintenance': str(r['maintenance']),
                'status': r['status'],
                'payment_type': r.get('payment_type'),
                'payment_date': r.get('payment_date'),
                'saldo_accum': str(r['saldo_accum']),
                'pay': r.get('pay'),
                'field_detail': r.get('field_detail', []),
                'cross_unit_payment': r.get('cross_unit_payment'),
            })

        prev_debt_adeudo_val = float(prev_debt_adeudo)
        net_prev_debt = max(0, previous_debt - prev_debt_adeudo_val)
        credit_balance = float(unit.credit_balance or 0)

        # Saldo final real: cargos de periodos + deuda previa - abonos de periodos
        #   - abonos a deuda previa - saldo a favor previo
        # El saldo a favor resta del total adeudado (cubre primero la deuda previa y
        # luego los cargos de los periodos si hubiera excedente)
        # Cuando hay plan activo, previous_debt está absorbido en las cuotas del plan.
        if active_plan:
            adjusted_balance = balance - credit_balance
        else:
            adjusted_balance = balance + previous_debt - prev_debt_adeudo_val - credit_balance

        return Response({
            'unit': UnitSerializer(unit).data,
            'periods': periods_out,
            'total_charges': str(total_charges),
            'total_payments': str(total_paid),
            'balance': str(adjusted_balance),
            'currency': tenant.currency,
            'tenant_name': tenant.name,
            'previous_debt': float(previous_debt),
            'prev_debt_adeudo': prev_debt_adeudo_val,
            'net_prev_debt': net_prev_debt,
            'credit_balance': credit_balance,
            'has_active_plan': active_plan is not None,
            'active_plan': PaymentPlanSerializer(active_plan).data if active_plan else None,
        })


# ═══════════════════════════════════════════════════════════
#  REPORTE GENERAL — Replicates HTML computePeriodBankData + computeBankBalanceForPeriod
# ═══════════════════════════════════════════════════════════

def _payment_total_income(pay):
    """Total income from payment (field_payments + additional_payments)."""
    total = Decimal('0')
    for fp in pay.field_payments.all():
        total += Decimal(str(fp.received or 0))
        for amt in (fp.adelanto_targets or {}).values():
            total += Decimal(str(amt or 0))
    ap = pay.adeudo_payments or {}
    for _tp, field_map in ap.items():
        for amt in (field_map or {}).values():
            total += Decimal(str(amt or 0))
    for ap_entry in (pay.additional_payments or []):
        fp = ap_entry.get('field_payments') or ap_entry.get('fieldPayments') or {}
        for v in fp.values():
            rec = v.get('received', v) if isinstance(v, dict) else v
            total += Decimal(str(rec or 0))
    return total


def _compute_report_data(tenant, period):
    """Compute bank reconciliation data for a period (HTML computePeriodBankData)."""
    units = Unit.objects.filter(tenant_id=tenant.id).order_by('unit_id_code')
    cob_fields = list(ExtraField.objects.filter(
        tenant_id=tenant.id, enabled=True
    ).exclude(field_type='gastos'))
    cf_map = {str(f.id): f for f in cob_fields}

    payments = {
        p.unit_id: p for p in
        Payment.objects.filter(tenant_id=tenant.id, period=period).prefetch_related('field_payments')
    }

    ingreso_mantenimiento = Decimal('0')       # Mantenimiento del período (solo período actual)
    ingreso_maint_adelanto = Decimal('0')      # Mantenimiento adelantado (otros períodos)
    ingreso_adeudo = Decimal('0')              # Cobros de adeudos de períodos anteriores
    ingresos_referenciados = Decimal('0')
    ingresos_conceptos = {}
    ingreso_units_count = 0
    ingresos_no_reconciled = Decimal('0')
    ingreso_no_recon_count = 0
    ingresos_no_recon_details = []

    for unit in units:
        pay = payments.get(unit.id)
        if not pay:
            continue
        if not pay.bank_reconciled:
            pti = _payment_total_income(pay)
            if pti > 0:
                ingresos_no_reconciled += pti
                ingreso_no_recon_count += 1
                ingresos_no_recon_details.append({
                    'unit_id': unit.unit_id_code,
                    'unit_name': unit.unit_name,
                    'amount': float(pti),
                    'payment_type': pay.payment_type or '',
                    'payment_date': str(pay.payment_date) if pay.payment_date else '',
                })
            continue
        ingreso_units_count += 1
        fp_map = {fp.field_key: fp for fp in pay.field_payments.all()}

        # Maintenance
        maint = fp_map.get('maintenance')
        if maint:
            rec = Decimal(str(maint.received or 0))
            if rec > 0:
                from decimal import ROUND_FLOOR
                int_rec = rec.quantize(Decimal('1'), rounding=ROUND_FLOOR)
                cents = rec - int_rec
                if cents > Decimal('0.001'):
                    ingreso_mantenimiento += int_rec
                    ingresos_referenciados += cents
                else:
                    ingreso_mantenimiento += rec

        # Adelanto targets (maintenance) — pagos adelantados de mantenimiento
        if maint and maint.adelanto_targets:
            for amt in (maint.adelanto_targets or {}).values():
                a = Decimal(str(amt or 0))
                if a > 0:
                    from decimal import ROUND_FLOOR
                    int_a = a.quantize(Decimal('1'), rounding=ROUND_FLOOR)
                    cents_a = a - int_a
                    if cents_a > Decimal('0.001'):
                        ingreso_maint_adelanto += int_a
                        ingresos_referenciados += cents_a
                    else:
                        ingreso_maint_adelanto += a

        # Extra cobranza fields
        for fk, fp in fp_map.items():
            if fk == 'maintenance':
                continue
            rec = Decimal(str((fp and fp.received) or 0))
            if rec > 0:
                if fk not in ingresos_conceptos:
                    cf = cf_map.get(fk)
                    ingresos_conceptos[fk] = {'total': Decimal('0'), 'label': getattr(cf, 'label', fk) if cf else fk}
                from decimal import ROUND_FLOOR
                int_rec = rec.quantize(Decimal('1'), rounding=ROUND_FLOOR)
                cents_rec = rec - int_rec
                if cents_rec > Decimal('0.001'):
                    ingresos_conceptos[fk]['total'] += int_rec
                    ingresos_referenciados += cents_rec
                else:
                    ingresos_conceptos[fk]['total'] += rec
            if fp and fp.adelanto_targets:
                for amt in fp.adelanto_targets.values():
                    a2 = Decimal(str(amt or 0))
                    if a2 > 0:
                        if fk not in ingresos_conceptos:
                            cf2 = cf_map.get(fk)
                            ingresos_conceptos[fk] = {'total': Decimal('0'), 'label': getattr(cf2, 'label', fk) if cf2 else fk}
                        ingresos_conceptos[fk]['total'] += a2

        # Adeudo payments — todos los cobros de adeudos previos van a ingreso_adeudo (NO a mantenimiento)
        ap = pay.adeudo_payments or {}
        for _tp, field_map in ap.items():
            for f_id, amt in (field_map or {}).items():
                a3 = Decimal(str(amt or 0))
                if a3 > 0:
                    ingreso_adeudo += a3

        # Additional payments (igual que HTML: cuando main está conciliado, incluir adicionales)
        for ap_entry in (pay.additional_payments or []):
            ap_recon = ap_entry.get('bank_reconciled', True)
            if not pay.bank_reconciled and not ap_recon:
                continue
            fp_a = ap_entry.get('field_payments') or ap_entry.get('fieldPayments') or {}
            for f_id, fd in fp_a.items():
                a_r = Decimal(str((fd or {}).get('received', 0) or 0))
                if a_r <= 0:
                    continue
                if f_id == 'maintenance':
                    from decimal import ROUND_FLOOR
                    int_ar = a_r.quantize(Decimal('1'), rounding=ROUND_FLOOR)
                    cents_ar = a_r - int_ar
                    if cents_ar > Decimal('0.001'):
                        ingreso_mantenimiento += int_ar
                        ingresos_referenciados += cents_ar
                    else:
                        ingreso_mantenimiento += a_r
                else:
                    if f_id not in ingresos_conceptos:
                        cf_a = cf_map.get(f_id)
                        ingresos_conceptos[f_id] = {'total': Decimal('0'), 'label': getattr(cf_a, 'label', f_id) if cf_a else f_id}
                    ingresos_conceptos[f_id]['total'] += a_r

    for cf in cob_fields:
        fid = str(cf.id)
        if fid in ingresos_conceptos:
            ingresos_conceptos[fid]['label'] = cf.label

    # Egresos: gastos conciliados vs cheques en tránsito
    egresos_reconciled = []
    cheques_transito = []
    total_egresos = Decimal('0')
    total_cheques = Decimal('0')

    gastos = GastoEntry.objects.filter(tenant_id=tenant.id, period=period).select_related('field')
    for g in gastos:
        amt = Decimal(str(g.amount or 0))
        if amt <= 0:
            continue
        label = g.field.label if g.field else str(g.field_id_legacy or 'Gasto')
        entry = {'label': label, 'amount': float(amt), 'provider': g.provider_name or '', 'notes': g.notes or ''}
        if g.bank_reconciled:
            egresos_reconciled.append(entry)
            total_egresos += amt
        else:
            cheques_transito.append(entry)
            total_cheques += amt

    # Nota: Caja chica NO se incluye en el reporte general (sólo se incluyen gastos)

    # Ingresos no identificados (UnrecognizedIncome)
    ingresos_no_identificados = Decimal('0')
    ingresos_no_identificados_list = []
    for ui in UnrecognizedIncome.objects.filter(tenant_id=tenant.id, period=period):
        amt = Decimal(str(ui.amount or 0))
        if amt > 0:
            ingresos_no_identificados += amt
            ingresos_no_identificados_list.append({
                'concept': ui.description or '',
                'amount': float(amt),
                'bank_reconciled': ui.bank_reconciled,
            })

    total_ingresos = ingreso_mantenimiento + ingreso_maint_adelanto + ingreso_adeudo + ingresos_referenciados + sum(
        x['total'] for x in ingresos_conceptos.values()
    ) + ingresos_no_identificados

    return {
        'ingreso_mantenimiento': float(ingreso_mantenimiento),
        'ingreso_maint_adelanto': float(ingreso_maint_adelanto),
        'ingreso_adeudo': float(ingreso_adeudo),
        'ingresos_referenciados': float(ingresos_referenciados),
        'ingresos_conceptos': {k: {'total': float(v['total']), 'label': v['label']} for k, v in ingresos_conceptos.items()},
        'ingresos_no_identificados': float(ingresos_no_identificados),
        'ingresos_no_identificados_list': ingresos_no_identificados_list,
        'total_ingresos_reconciled': float(total_ingresos),
        'ingreso_units_count': ingreso_units_count,
        'egresos_reconciled': egresos_reconciled,
        'cheques_transito': cheques_transito,
        'total_egresos_reconciled': float(total_egresos),
        'total_cheques_transito': float(total_cheques),
        'ingresos_no_reconciled': float(ingresos_no_reconciled),
        'ingreso_no_recon_count': ingreso_no_recon_count,
        'ingresos_no_recon_details': ingresos_no_recon_details,
    }


def _compute_saldo_inicial(tenant, target_period):
    """Saldo inicial = bank_initial_balance + sum(ingresos-egresos) of all periods before target."""
    start = getattr(tenant, 'operation_start_date', None) or '2024-01'
    periods = _periods_between(start, target_period)
    if not periods or target_period not in periods:
        return float(tenant.bank_initial_balance or 0)
    idx = periods.index(target_period) if target_period in periods else len(periods)
    prev_periods = periods[:idx]
    running = Decimal(str(tenant.bank_initial_balance or 0))
    for p in prev_periods:
        data = _compute_report_data(tenant, p)
        running += Decimal(str(data['total_ingresos_reconciled'])) - Decimal(str(data['total_egresos_reconciled']))
    return float(running)


class ReporteAdeudosView(APIView):
    """GET /api/tenants/{tenant_id}/reporte-adeudos/?cutoff=YYYY-MM
    Returns per-unit debt breakdown: previous debt + unpaid periods up to cutoff."""
    permission_classes = [IsTenantMember]

    def get(self, request, tenant_id):
        cutoff = request.query_params.get('cutoff') or _today_period()

        tenant = Tenant.objects.get(id=tenant_id)
        start_period = tenant.operation_start_date or '2024-01'
        units = Unit.objects.filter(tenant_id=tenant_id).order_by('unit_id_code')

        result = []
        grand_total = Decimal('0')
        units_with_debt = 0

        # Pre-fetch planes activos una sola vez para evitar N+1 queries en _compute_statement
        _ra_unit_plans = {
            str(_p.unit_id): _p
            for _p in PaymentPlan.objects.filter(tenant_id=tenant_id, status='accepted')
        }

        for unit in units:
            rows, tc, tp, bal, prev_debt_adeudo, _u_active_plan = _compute_statement(
                tenant, str(unit.id), start_period, cutoff,
                _prefetched_plan=_ra_unit_plans.get(str(unit.id)),
            )
            previous_debt = Decimal(str(unit.previous_debt or 0))
            credit_balance = Decimal(str(unit.credit_balance or 0))
            prev_debt_adeudo_dec = Decimal(str(prev_debt_adeudo))

            # Saldo ajustado igual que EstadoCuentaView (lista por unidad)
            # Si hay plan activo, la deuda anterior está absorbida en las cuotas
            if _u_active_plan:
                adj_bal = Decimal(str(bal)) - credit_balance
            else:
                adj_bal = Decimal(str(bal)) + previous_debt - prev_debt_adeudo_dec - credit_balance
            total_adeudo = max(Decimal('0'), adj_bal)

            net_prev_debt = Decimal('0') if _u_active_plan else max(
                Decimal('0'),
                previous_debt - prev_debt_adeudo_dec - credit_balance
            )

            # Períodos con déficit real — combinamos paid_balance con adeudo_received_for_period.
            # paid_balance acredita el adeudo en el período receptor (no en el período destino),
            # por lo que un período con adeudo pagado en otro período no aparece cubierto aquí.
            # adeudo_received_for_period corrige esto: es el monto de adeudo que en OTRO período
            # fue marcado como destino a ESTE período.
            period_debts = []
            for row in rows:
                paid_bal = Decimal(str(row.get('paid_balance', row['paid'])))
                adeudo_for_period = Decimal(str(row.get('adeudo_received_for_period', 0)))
                effective_paid = paid_bal + adeudo_for_period
                deficit = Decimal(str(row['charge'])) - effective_paid
                if deficit > Decimal('0'):
                    period_debts.append({
                        'period': row['period'],
                        'charge': float(row['charge']),
                        'paid': float(row['paid']),               # display (incluye neutros)
                        'paid_balance': float(effective_paid),    # para cálculo: paid + adeudo dirigido
                        'deficit': float(deficit),
                        'status': row['status'],
                        'maintenance': float(row['maintenance']),
                    })

            if total_adeudo > Decimal('0'):
                units_with_debt += 1
                grand_total += total_adeudo
                result.append({
                    'unit': UnitSerializer(unit).data,
                    'net_prev_debt': float(net_prev_debt),
                    'previous_debt': float(previous_debt),
                    'prev_debt_adeudo': float(prev_debt_adeudo_dec),
                    'credit_balance': float(credit_balance),
                    'period_debts': period_debts,
                    'total_adeudo': float(total_adeudo),
                })

        result.sort(key=lambda x: x['total_adeudo'], reverse=True)

        return Response({
            'tenant': TenantDetailSerializer(tenant).data,
            'cutoff': cutoff,
            'start_period': start_period,
            'units': result,
            'grand_total_adeudo': float(grand_total),
            'units_with_debt': units_with_debt,
            'total_units': units.count(),
        })


class ReporteGeneralView(APIView):
    """GET /api/tenants/{tenant_id}/reporte-general/?period=YYYY-MM"""
    permission_classes = [IsTenantMember]

    def get(self, request, tenant_id):
        period = request.query_params.get('period')
        if not period:
            from datetime import date
            period = date.today().strftime('%Y-%m')

        tenant = Tenant.objects.get(id=tenant_id)
        units = Unit.objects.filter(tenant_id=tenant_id).order_by('unit_id_code')

        report_data = _compute_report_data(tenant, period)
        saldo_inicial = _compute_saldo_inicial(tenant, period)
        saldo_final = saldo_inicial + report_data['total_ingresos_reconciled'] - report_data['total_egresos_reconciled']

        return Response({
            'tenant': TenantDetailSerializer(tenant).data,
            'period': period,
            'units_count': units.count(),
            'saldo_inicial': saldo_inicial,
            'saldo_final': saldo_final,
            'report_data': report_data,
            'is_closed': ClosedPeriod.objects.filter(
                tenant_id=tenant_id, period=period
            ).exists(),
        })


# ═══════════════════════════════════════════════════════════
#  EMAIL — ESTADO DE CUENTA POR UNIDAD
# ═══════════════════════════════════════════════════════════

class SendUnitStatementEmailView(APIView):
    """POST /api/tenants/{tenant_id}/send-unit-statement-email/
       Sends the estado de cuenta for a single unit by email."""
    permission_classes = [IsAdminOrTesorero]

    def post(self, request, tenant_id=None):
        unit_id = request.data.get('unit_id')
        from_period = request.data.get('from_period', '')
        to_period = request.data.get('to_period', _today_period())
        recipients = request.data.get('recipients', 'owner')  # 'owner' | 'tenant' | 'both'
        emails_param = request.data.get('emails')  # lista directa

        if not unit_id:
            return Response({'detail': 'Falta unit_id.'}, status=status.HTTP_400_BAD_REQUEST)

        unit = Unit.objects.filter(tenant_id=tenant_id, id=unit_id).first()
        if not unit:
            return Response({'detail': 'Unidad no encontrada.'}, status=status.HTTP_404_NOT_FOUND)

        # Acepta lista explícita de emails O el campo clásico recipients
        if emails_param and isinstance(emails_param, list):
            emails = [e.strip() for e in emails_param if isinstance(e, str) and e.strip()]
        else:
            emails = []
            if recipients in ('owner', 'both') and (unit.owner_email or '').strip():
                emails.append(unit.owner_email.strip())
            if recipients in ('coowner', 'both') and (unit.coowner_email or '').strip():
                emails.append(unit.coowner_email.strip())
            if recipients in ('tenant', 'both') and (unit.tenant_email or '').strip():
                emails.append(unit.tenant_email.strip())

        if not emails:
            return Response(
                {'detail': 'No hay correo electrónico configurado para esta unidad.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        tenant = Tenant.objects.get(id=tenant_id)
        start_period = from_period or tenant.operation_start_date or '2024-01'

        rows, total_charges, total_paid, balance, prev_debt_adeudo, _stmt_active_plan = _compute_statement(
            tenant, str(unit_id), start_period, to_period
        )
        # Adjust balance like EstadoCuentaView does
        prev_debt = float(unit.previous_debt or 0)
        credit_bal = float(unit.credit_balance or 0)
        if _stmt_active_plan:
            adj_balance = balance - credit_bal
        else:
            adj_balance = balance + prev_debt - float(prev_debt_adeudo) - credit_bal

        email_rows = [
            {
                'period': _period_label_es(r.get('period', '')),
                'charges': r.get('charge', 0),
                'paid': r.get('paid', 0),
                'balance': r.get('saldo_accum', 0),
                'status': r.get('status', 'pendiente'),
            }
            for r in (rows or [])
        ]

        # Generate PDF attachment
        stmt_pdf_bytes = _generate_unit_statement_pdf(
            tenant, unit, rows, total_charges, total_paid, adj_balance,
            start_period, to_period,
        )
        stmt_pdf_attachment = (
            f'EstadoCuenta_{unit.unit_id_code}_{start_period}_{to_period}.pdf',
            stmt_pdf_bytes,
            'application/pdf',
        ) if stmt_pdf_bytes else None

        from .email_service import send_unit_statement_email
        ok = send_unit_statement_email(
            emails=emails,
            tenant_name=getattr(tenant, 'razon_social', '') or tenant.name or '',
            unit_code=unit.unit_id_code or '',
            unit_name=unit.unit_name or '',
            responsible=unit.responsible_name or '',
            period_from=_period_label_es(start_period),
            period_to=_period_label_es(to_period),
            rows=email_rows,
            total_charges=total_charges,
            total_paid=total_paid,
            balance=adj_balance,
            pdf_attachment=stmt_pdf_attachment,
        )

        if ok:
            return Response({'detail': f'Estado de cuenta enviado a {", ".join(emails)}'})
        return Response({'detail': 'Error al enviar el correo. Verifica la configuración SMTP.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# ═══════════════════════════════════════════════════════════
#  EMAIL — VECINO ENVÍA SU PROPIO ESTADO DE CUENTA
# ═══════════════════════════════════════════════════════════

def _generate_receipt_pdf(tenant, unit, payment, receipt_data):
    """
    Generate a single-page receipt PDF for a payment.
    Returns bytes or None if reportlab is not installed.
    """
    import io as _io
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib import colors
        from reportlab.lib.units import cm
        from reportlab.platypus import (
            SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer,
        )
        from reportlab.lib.styles import ParagraphStyle
        from reportlab.lib.enums import TA_CENTER, TA_RIGHT, TA_LEFT
    except ImportError:
        return None

    COL_TEAL      = colors.HexColor('#0d7c6e')
    COL_TEAL_LT   = colors.HexColor('#e6f4f2')
    COL_CORAL     = colors.HexColor('#e84040')
    COL_AMBER     = colors.HexColor('#d97706')
    COL_GREEN     = colors.HexColor('#1E594F')
    COL_INK       = colors.HexColor('#1a1a2e')
    COL_INK_LT    = colors.HexColor('#64748b')
    COL_SAND      = colors.HexColor('#f8f6f1')
    COL_SAND_BRD  = colors.HexColor('#e5e0d5')
    COL_HDR       = colors.HexColor('#1a1a2e')
    COL_WHITE     = colors.white

    STATUS_COLORS = {
        'pagado': COL_GREEN, 'exento': COL_GREEN,
        'parcial': COL_AMBER, 'pendiente': COL_CORAL,
    }
    STATUS_LABELS_MAP = {
        'pagado': 'Pagado', 'exento': 'Exento',
        'parcial': 'Parcial', 'pendiente': 'Pendiente',
    }

    buf = _io.BytesIO()
    margin = 1.8 * cm
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=margin, rightMargin=margin,
        topMargin=1.4 * cm, bottomMargin=1.6 * cm,
    )

    W = A4[0] - 2 * margin

    st_hdr_title = ParagraphStyle('HT', fontSize=13, fontName='Helvetica-Bold', textColor=COL_WHITE)
    st_hdr_sub   = ParagraphStyle('HS', fontSize=10, fontName='Helvetica', textColor=colors.HexColor('#b2dcd8'))
    st_hdr_right = ParagraphStyle('HR', fontSize=14, fontName='Helvetica-Bold', textColor=COL_WHITE, alignment=TA_RIGHT)
    st_info_lbl  = ParagraphStyle('IL', fontSize=8, fontName='Helvetica', textColor=COL_INK_LT)
    st_info_val  = ParagraphStyle('IV', fontSize=9.5, fontName='Helvetica-Bold', textColor=COL_INK, leading=12)
    st_col_hdr   = ParagraphStyle('CH', fontSize=8.5, fontName='Helvetica-Bold', textColor=COL_WHITE, alignment=TA_CENTER)
    st_cell      = ParagraphStyle('CE', fontSize=8.5, fontName='Helvetica', textColor=COL_INK)
    st_cell_r    = ParagraphStyle('CR', fontSize=8.5, fontName='Helvetica', textColor=COL_INK, alignment=TA_RIGHT)
    st_section   = ParagraphStyle('SC', fontSize=8, fontName='Helvetica-Bold', textColor=COL_TEAL)
    st_total_lbl = ParagraphStyle('TL', fontSize=10, fontName='Helvetica-Bold', textColor=COL_WHITE)
    st_total_val = ParagraphStyle('TV', fontSize=10, fontName='Helvetica-Bold', textColor=COL_WHITE, alignment=TA_RIGHT)
    st_status    = ParagraphStyle('ST', fontSize=11, fontName='Helvetica-Bold', textColor=COL_WHITE, alignment=TA_CENTER)

    story = []

    # ── Header ──────────────────────────────────────────────────────────────
    tenant_display = (getattr(tenant, 'razon_social', '') or tenant.name or '').strip()
    rfc_str = getattr(tenant, 'rfc', '') or ''
    rfc_part = f' · RFC: {rfc_str}' if rfc_str else ''

    header_data = [[
        [Paragraph(tenant_display, st_hdr_title),
         Paragraph(f'Condominio{rfc_part}', st_hdr_sub)],
        Paragraph('Recibo de Pago', st_hdr_right),
    ]]
    header_tbl = Table(header_data, colWidths=[W * 0.62, W * 0.38])
    header_tbl.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), COL_HDR),
        ('ROWPADDING', (0, 0), (-1, -1), 14),
        ('LEFTPADDING', (0, 0), (0, -1), 16),
        ('RIGHTPADDING', (-1, 0), (-1, -1), 16),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('ROUNDEDCORNERS', [8, 8, 0, 0]),
    ]))
    story.append(header_tbl)

    # ── Info strip ──────────────────────────────────────────────────────────
    unit_label = receipt_data.get('unit_code', '')
    if receipt_data.get('unit_name'):
        unit_label += f' — {receipt_data["unit_name"]}'
    responsible = receipt_data.get('responsible', '') or '—'
    period_str  = receipt_data.get('period_str', payment.period)
    pay_date    = receipt_data.get('payment_date_label', '—')
    pay_type    = receipt_data.get('payment_type_label', '—')
    folio       = getattr(payment, 'folio', '') or ''

    info_rows = [
        [
            [Paragraph('UNIDAD', st_info_lbl), Paragraph(unit_label or '—', st_info_val)],
            [Paragraph('RESPONSABLE', st_info_lbl), Paragraph(responsible, st_info_val)],
            [Paragraph('PERÍODO', st_info_lbl), Paragraph(period_str, st_info_val)],
        ],
        [
            [Paragraph('FECHA DE PAGO', st_info_lbl), Paragraph(pay_date, st_info_val)],
            [Paragraph('FORMA DE PAGO', st_info_lbl), Paragraph(pay_type, st_info_val)],
            [Paragraph('FOLIO', st_info_lbl), Paragraph(folio or payment.period, st_info_val)],
        ],
    ]
    info_tbl = Table(info_rows, colWidths=[W / 3, W / 3, W / 3])
    info_tbl.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), COL_SAND),
        ('ROWPADDING', (0, 0), (-1, -1), 8),
        ('LEFTPADDING', (0, 0), (-1, -1), 12),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('LINEBELOW', (0, 0), (-1, 0), 0.5, COL_SAND_BRD),
        ('LINEAFTER', (0, 0), (-2, -1), 0.5, COL_SAND_BRD),
        ('LINEBEFORE', (0, 0), (0, -1), 0.5, COL_SAND_BRD),
        ('LINEAFTER', (-1, 0), (-1, -1), 0.5, COL_SAND_BRD),
        ('LINEBELOW', (0, -1), (-1, -1), 0.5, COL_SAND_BRD),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
    ]))
    story.append(info_tbl)
    story.append(Spacer(1, 0.3 * cm))

    # ── Detail table ────────────────────────────────────────────────────────
    def fmt_cur(n):
        try:
            v = float(n)
            sym = receipt_data.get('currency_symbol', '$')
            return f'{sym}{v:,.2f}'
        except Exception:
            return '—'

    col_w = [W * 0.50, W * 0.17, W * 0.17, W * 0.16]
    tbl_header = [
        Paragraph('Concepto', st_col_hdr),
        Paragraph('Cargo', st_col_hdr),
        Paragraph('Abono', st_col_hdr),
        Paragraph('Saldo', st_col_hdr),
    ]
    tbl_data = [tbl_header]
    row_styles = []

    for idx, r in enumerate(receipt_data.get('rows', [])):
        if r.get('is_section'):
            tbl_data.append([
                Paragraph(r.get('concept', ''), st_section),
                '', '', '',
            ])
            row_styles.append(('BACKGROUND', (0, len(tbl_data) - 1), (-1, len(tbl_data) - 1), COL_TEAL_LT))
            row_styles.append(('SPAN', (0, len(tbl_data) - 1), (-1, len(tbl_data) - 1)))
        else:
            charge = r.get('charge', 0) or 0
            paid   = r.get('paid', 0) or 0
            bal    = r.get('balance', 0) or 0
            bg = COL_SAND if (len(tbl_data) % 2 == 0) else COL_WHITE
            tbl_data.append([
                Paragraph(r.get('concept', ''), st_cell),
                Paragraph(fmt_cur(charge) if charge else '—', st_cell_r),
                Paragraph(fmt_cur(paid) if paid else '—', st_cell_r),
                Paragraph(fmt_cur(bal) if bal else '—', st_cell_r),
            ])
            row_styles.append(('BACKGROUND', (0, len(tbl_data) - 1), (-1, len(tbl_data) - 1), bg))

    detail_tbl = Table(tbl_data, colWidths=col_w, repeatRows=1)
    base_style = [
        ('BACKGROUND', (0, 0), (-1, 0), COL_HDR),
        ('ROWPADDING', (0, 0), (-1, -1), 6),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('ALIGN', (1, 1), (-1, -1), 'RIGHT'),
        ('LINEBELOW', (0, 0), (-1, -1), 0.3, COL_SAND_BRD),
        ('LINEBEFORE', (0, 0), (0, -1), 0.5, COL_SAND_BRD),
        ('LINEAFTER', (-1, 0), (-1, -1), 0.5, COL_SAND_BRD),
        ('LINEBELOW', (0, -1), (-1, -1), 0.5, COL_SAND_BRD),
    ]
    detail_tbl.setStyle(TableStyle(base_style + row_styles))
    story.append(detail_tbl)

    # ── Totals footer ───────────────────────────────────────────────────────
    total_charges = receipt_data.get('total_charges', 0)
    total_paid    = receipt_data.get('total_paid', 0)
    saldo         = receipt_data.get('saldo', 0)

    pay_status = payment.status or 'pendiente'
    # Override with exento if unit is exempt
    if unit.admin_exempt:
        pay_status = 'exento'
    st_color = STATUS_COLORS.get(pay_status, COL_CORAL)
    st_label = STATUS_LABELS_MAP.get(pay_status, pay_status.capitalize())

    totals_data = [[
        Paragraph('Total Cargos', st_total_lbl),
        Paragraph(fmt_cur(total_charges), st_total_val),
        Paragraph('Total Abonos', st_total_lbl),
        Paragraph(fmt_cur(total_paid), st_total_val),
        Paragraph('Saldo Pendiente', st_total_lbl),
        Paragraph(fmt_cur(saldo), st_total_val),
        Paragraph(st_label, st_status),
    ]]
    col_w_tot = [W * 0.14, W * 0.13, W * 0.14, W * 0.13, W * 0.16, W * 0.13, W * 0.17]
    totals_tbl = Table(totals_data, colWidths=col_w_tot)
    totals_tbl.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (5, 0), COL_TEAL),
        ('BACKGROUND', (6, 0), (6, 0), st_color),
        ('ROWPADDING', (0, 0), (-1, -1), 10),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('ALIGN', (1, 0), (-1, 0), 'RIGHT'),
        ('ROUNDEDCORNERS', [0, 0, 6, 6]),
    ]))
    story.append(totals_tbl)

    # ── Footer note ─────────────────────────────────────────────────────────
    story.append(Spacer(1, 0.4 * cm))
    from datetime import date as _date
    today_str = _date.today().strftime('%d/%m/%Y')
    story.append(Table([[
        Paragraph(f'Documento generado el {today_str} · {tenant_display}', ParagraphStyle('FT', fontSize=7, fontName='Helvetica', textColor=COL_INK_LT)),
        Paragraph('Homly · Sistema de Gestión Condominial', ParagraphStyle('FR', fontSize=7, fontName='Helvetica', textColor=COL_INK_LT, alignment=TA_RIGHT)),
    ]], colWidths=[W * 0.6, W * 0.4]))

    doc.build(story)
    return buf.getvalue()


def _generate_unit_statement_pdf(tenant, unit, rows, total_charges, total_paid, adj_balance, from_period, to_period):
    """
    Generate an in-memory PDF for a single unit's estado de cuenta.
    Returns bytes or None if reportlab is not installed.
    """
    import io
    import base64
    from datetime import date as _date
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib import colors
        from reportlab.lib.units import cm
        from reportlab.platypus import (
            SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, HRFlowable,
        )
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.enums import TA_CENTER, TA_RIGHT, TA_LEFT
    except ImportError:
        return None

    MONTHS_FULL = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                   'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

    def period_lbl(p):
        try:
            y, m = p.split('-')
            return f'{MONTHS_FULL[int(m)]} {y}'
        except Exception:
            return p or ''

    def fmt_cur(n):
        try:
            return f'${float(n):,.2f}'
        except Exception:
            return '$0.00'

    currency = tenant.currency or 'MXN'

    # Colour palette
    COL_TEAL       = colors.HexColor('#0d7c6e')
    COL_TEAL_LIGHT = colors.HexColor('#e6f4f2')
    COL_CORAL      = colors.HexColor('#e84040')
    COL_AMBER      = colors.HexColor('#d97706')
    COL_GREEN_OK   = colors.HexColor('#1E594F')
    COL_INK        = colors.HexColor('#1a1a2e')
    COL_INK_LIGHT  = colors.HexColor('#64748b')
    COL_SAND       = colors.HexColor('#f8f6f1')
    COL_SAND_BRD   = colors.HexColor('#e5e0d5')
    COL_WHITE      = colors.white
    COL_HDR_BG     = colors.HexColor('#1a1a2e')

    STATUS_MAP = {
        'pagado':    ('Pagado',    COL_GREEN_OK),
        'exento':    ('Exento',    COL_GREEN_OK),
        'parcial':   ('Parcial',   COL_AMBER),
        'pendiente': ('Pendiente', COL_CORAL),
        'futuro':    ('Futuro',    COL_INK_LIGHT),
    }

    buffer = io.BytesIO()
    page_w, _ = A4
    margin = 1.8 * cm
    doc = SimpleDocTemplate(
        buffer, pagesize=A4,
        leftMargin=margin, rightMargin=margin,
        topMargin=1.4 * cm, bottomMargin=1.6 * cm,
    )

    styles = getSampleStyleSheet()
    st_title   = ParagraphStyle('T', fontSize=16, fontName='Helvetica-Bold', textColor=COL_INK, spaceAfter=2, leading=20)
    st_sub     = ParagraphStyle('S', fontSize=9,  fontName='Helvetica', textColor=COL_INK_LIGHT, spaceAfter=1)
    st_info    = ParagraphStyle('I', fontSize=8.5, fontName='Helvetica', textColor=COL_INK_LIGHT, spaceAfter=1, leading=11)
    st_bold    = ParagraphStyle('B', fontSize=10, fontName='Helvetica-Bold', textColor=COL_INK)
    st_center  = ParagraphStyle('C', fontSize=9,  fontName='Helvetica-Bold', textColor=COL_WHITE, alignment=TA_CENTER)
    st_right   = ParagraphStyle('R', fontSize=9,  fontName='Helvetica', textColor=COL_INK, alignment=TA_RIGHT)
    st_kpi_val = ParagraphStyle('KV', fontSize=13, fontName='Helvetica-Bold', textColor=COL_INK, alignment=TA_CENTER, leading=16)
    st_kpi_lbl = ParagraphStyle('KL', fontSize=7.5, fontName='Helvetica', textColor=COL_INK_LIGHT, alignment=TA_CENTER)

    story = []

    # ── Header bar ──
    tenant_display = (getattr(tenant, 'razon_social', '') or tenant.name or '').strip()
    tenant_sub     = tenant.name if tenant_display != tenant.name else ''
    rfc_str        = getattr(tenant, 'rfc', '') or ''

    header_data = [[
        Paragraph(f'<b>{tenant_display}</b>', ParagraphStyle('HD', fontSize=12, fontName='Helvetica-Bold', textColor=COL_WHITE)),
        Paragraph('Estado de Cuenta', ParagraphStyle('HT', fontSize=14, fontName='Helvetica-Bold', textColor=COL_WHITE, alignment=TA_RIGHT)),
    ]]
    header_tbl = Table(header_data, colWidths=[None, 6*cm])
    header_tbl.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), COL_HDR_BG),
        ('LEFTPADDING',  (0,0), (-1,-1), 12),
        ('RIGHTPADDING', (0,0), (-1,-1), 12),
        ('TOPPADDING',   (0,0), (-1,-1), 10),
        ('BOTTOMPADDING',(0,0), (-1,-1), 10),
        ('VALIGN',       (0,0), (-1,-1), 'MIDDLE'),
    ]))
    story.append(header_tbl)
    story.append(Spacer(1, 0.3*cm))

    # ── Unit info block ──
    period_range_str = f'{period_lbl(from_period)} — {period_lbl(to_period)}'
    resp_str   = unit.responsible_name or ''
    occ_label  = 'Inquilino' if unit.occupancy == 'rentado' else 'Propietario'

    info_rows = [
        [Paragraph('<b>Unidad</b>', st_info), Paragraph(f'{unit.unit_id_code} — {unit.unit_name}', st_info)],
        [Paragraph('<b>Responsable</b>', st_info), Paragraph(f'{resp_str} ({occ_label})', st_info)],
        [Paragraph('<b>Período</b>', st_info), Paragraph(period_range_str, st_info)],
        [Paragraph('<b>Moneda</b>', st_info), Paragraph(currency, st_info)],
    ]
    if rfc_str:
        info_rows.insert(1, [Paragraph('<b>RFC</b>', st_info), Paragraph(rfc_str, st_info)])

    info_tbl = Table(info_rows, colWidths=[3*cm, None])
    info_tbl.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), COL_SAND),
        ('LEFTPADDING',  (0,0), (-1,-1), 8),
        ('RIGHTPADDING', (0,0), (-1,-1), 8),
        ('TOPPADDING',   (0,0), (-1,-1), 4),
        ('BOTTOMPADDING',(0,0), (-1,-1), 4),
        ('BOX', (0,0), (-1,-1), 0.5, COL_SAND_BRD),
        ('ROWBACKGROUNDS', (0,0), (-1,-1), [COL_SAND, COL_WHITE]),
    ]))
    story.append(info_tbl)
    story.append(Spacer(1, 0.35*cm))

    # ── KPI row ──
    saldo_color = COL_CORAL if adj_balance > 0.01 else COL_GREEN_OK
    kpi_data = [[
        Paragraph(f'<b>{fmt_cur(total_charges)}</b>', ParagraphStyle('K1', fontSize=13, fontName='Helvetica-Bold', textColor=COL_INK, alignment=TA_CENTER, leading=16)),
        Paragraph(f'<b>{fmt_cur(total_paid)}</b>', ParagraphStyle('K2', fontSize=13, fontName='Helvetica-Bold', textColor=COL_GREEN_OK, alignment=TA_CENTER, leading=16)),
        Paragraph(f'<b>{fmt_cur(adj_balance)}</b>', ParagraphStyle('K3', fontSize=13, fontName='Helvetica-Bold', textColor=saldo_color, alignment=TA_CENTER, leading=16)),
    ],[
        Paragraph('Total Cargos', st_kpi_lbl),
        Paragraph('Total Abonado', st_kpi_lbl),
        Paragraph('Saldo Actual', st_kpi_lbl),
    ]]
    kpi_tbl = Table(kpi_data, colWidths=[(page_w - 2*margin) / 3] * 3)
    kpi_tbl.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), COL_TEAL_LIGHT),
        ('BOX', (0,0), (-1,-1), 0.5, COL_TEAL),
        ('LINEAFTER', (0,0), (1,-1), 0.5, COL_TEAL),
        ('TOPPADDING',   (0,0), (-1,-1), 8),
        ('BOTTOMPADDING',(0,0), (-1,-1), 6),
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
    ]))
    story.append(kpi_tbl)
    story.append(Spacer(1, 0.4*cm))

    # ── Period detail table ──
    col_w = (page_w - 2*margin)
    col_widths = [col_w*0.28, col_w*0.18, col_w*0.18, col_w*0.20, col_w*0.16]

    detail_rows = [[
        Paragraph('Período',           ParagraphStyle('DH', fontSize=9, fontName='Helvetica-Bold', textColor=COL_WHITE)),
        Paragraph('Cargo',             ParagraphStyle('DH', fontSize=9, fontName='Helvetica-Bold', textColor=COL_WHITE, alignment=TA_RIGHT)),
        Paragraph('Abono',             ParagraphStyle('DH', fontSize=9, fontName='Helvetica-Bold', textColor=COL_WHITE, alignment=TA_RIGHT)),
        Paragraph('Saldo Acum.',       ParagraphStyle('DH', fontSize=9, fontName='Helvetica-Bold', textColor=COL_WHITE, alignment=TA_RIGHT)),
        Paragraph('Estado',            ParagraphStyle('DH', fontSize=9, fontName='Helvetica-Bold', textColor=COL_WHITE, alignment=TA_CENTER)),
    ]]

    row_styles = []
    for i, row in enumerate(rows or []):
        st_key    = row.get('status', 'pendiente')
        st_label, st_col = STATUS_MAP.get(st_key, ('—', COL_INK_LIGHT))
        bal_val   = float(row.get('balance', 0))
        bal_color = COL_CORAL if bal_val > 0.01 else COL_GREEN_OK
        bg = COL_SAND if i % 2 == 0 else COL_WHITE

        detail_rows.append([
            Paragraph(row.get('period', ''), ParagraphStyle('DR', fontSize=8.5, fontName='Helvetica', textColor=COL_INK)),
            Paragraph(fmt_cur(row.get('charges', 0)), ParagraphStyle('DR', fontSize=8.5, fontName='Helvetica', textColor=COL_INK, alignment=TA_RIGHT)),
            Paragraph(fmt_cur(row.get('paid', 0)), ParagraphStyle('DR', fontSize=8.5, fontName='Helvetica', textColor=COL_GREEN_OK, alignment=TA_RIGHT)),
            Paragraph(fmt_cur(bal_val), ParagraphStyle('DR', fontSize=8.5, fontName='Helvetica', textColor=bal_color, alignment=TA_RIGHT)),
            Paragraph(st_label, ParagraphStyle('DS', fontSize=8.5, fontName='Helvetica-Bold', textColor=st_col, alignment=TA_CENTER)),
        ])
        row_styles.append(('BACKGROUND', (0, i+1), (-1, i+1), bg))

    detail_tbl = Table(detail_rows, colWidths=col_widths)
    base_style = [
        ('BACKGROUND',   (0, 0), (-1, 0), COL_HDR_BG),
        ('ROWBACKGROUNDS',(0, 1), (-1, -1), [COL_SAND, COL_WHITE]),
        ('TOPPADDING',   (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING',(0, 0), (-1, -1), 5),
        ('LEFTPADDING',  (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('LINEBELOW',    (0, 0), (-1, -1), 0.3, COL_SAND_BRD),
        ('BOX',          (0, 0), (-1, -1), 0.5, COL_SAND_BRD),
    ]
    detail_tbl.setStyle(TableStyle(base_style))
    story.append(detail_tbl)
    story.append(Spacer(1, 0.4*cm))

    # ── Footer ──
    now_str = _date.today().strftime('%d/%m/%Y')
    story.append(HRFlowable(width='100%', thickness=0.5, color=COL_SAND_BRD))
    story.append(Spacer(1, 0.15*cm))
    story.append(Paragraph(
        f'Generado el {now_str} · Homly — La administración que tu hogar se merece',
        ParagraphStyle('FT', fontSize=7.5, fontName='Helvetica', textColor=COL_INK_LIGHT, alignment=TA_CENTER),
    ))

    doc.build(story)
    return buffer.getvalue()


class SendVecinoStatementEmailView(APIView):
    """POST /api/tenants/{tenant_id}/send-vecino-statement-email/
       Allows a vecino (resident) to send their own unit estado de cuenta
       to their own user email address, with the PDF attached."""
    permission_classes = [IsTenantMember]

    def post(self, request, tenant_id=None):
        from_period = request.data.get('from_period', '')
        to_period   = request.data.get('to_period',   _today_period())

        # Get the vecino's TenantUser and unit
        try:
            tenant_user = TenantUser.objects.select_related('unit').get(
                user=request.user, tenant_id=tenant_id
            )
        except TenantUser.DoesNotExist:
            return Response({'detail': 'No tienes acceso a este condominio.'}, status=status.HTTP_403_FORBIDDEN)

        unit = tenant_user.unit
        user_email = (request.user.email or '').strip().lower()
        if not unit:
            # Fallback: find a unit whose owner/coowner/tenant email matches the user
            if user_email:
                from django.db.models import Q
                matched_unit = Unit.objects.filter(
                    tenant_id=tenant_id
                ).filter(
                    Q(owner_email__iexact=user_email) |
                    Q(coowner_email__iexact=user_email) |
                    Q(tenant_email__iexact=user_email)
                ).first()
                if matched_unit:
                    tenant_user.unit = matched_unit
                    tenant_user.save(update_fields=['unit'])
                    unit = matched_unit
            if not unit:
                return Response(
                    {'detail': 'Tu usuario no tiene una unidad asignada. Contacta al administrador.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        if not user_email:
            return Response(
                {'detail': 'Tu usuario no tiene un correo electrónico registrado.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        tenant = Tenant.objects.get(id=tenant_id)
        start_period = from_period or tenant.operation_start_date or '2024-01'

        rows, total_charges, total_paid, balance, prev_debt_adeudo, _stmt_active_plan2 = _compute_statement(
            tenant, str(unit.id), start_period, to_period
        )
        prev_debt  = float(unit.previous_debt  or 0)
        credit_bal = float(unit.credit_balance or 0)
        if _stmt_active_plan2:
            adj_balance = balance - credit_bal
        else:
            adj_balance = balance + prev_debt - float(prev_debt_adeudo) - credit_bal

        # Build email rows
        email_rows = [
            {
                'period':  _period_label_es(r.get('period', '')),
                'charges': r.get('charge', 0),
                'paid':    r.get('paid', 0),
                'balance': r.get('saldo_accum', 0),
                'status':  r.get('status', 'pendiente'),
            }
            for r in (rows or [])
        ]

        # Generate PDF for this unit
        pdf_bytes = _generate_unit_statement_pdf(
            tenant=tenant,
            unit=unit,
            rows=email_rows,
            total_charges=total_charges,
            total_paid=total_paid,
            adj_balance=adj_balance,
            from_period=start_period,
            to_period=to_period,
        )

        pdf_attachment = None
        if pdf_bytes:
            safe_code = ''.join(c if c.isalnum() or c in '-_' else '_' for c in (unit.unit_id_code or 'unidad'))
            pdf_attachment = (
                f'estado_cuenta_{safe_code}.pdf',
                pdf_bytes,
                'application/pdf',
            )

        from .email_service import send_unit_statement_email
        ok = send_unit_statement_email(
            emails=[user_email],
            tenant_name=getattr(tenant, 'razon_social', '') or tenant.name or '',
            unit_code=unit.unit_id_code or '',
            unit_name=unit.unit_name or '',
            responsible=unit.responsible_name or '',
            period_from=_period_label_es(start_period),
            period_to=_period_label_es(to_period),
            rows=email_rows,
            total_charges=total_charges,
            total_paid=total_paid,
            balance=adj_balance,
            pdf_attachment=pdf_attachment,
        )

        if ok:
            return Response({'detail': f'Estado de cuenta enviado a {user_email}'})
        return Response(
            {'detail': 'Error al enviar el correo. Verifica la configuración SMTP.'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


# ═══════════════════════════════════════════════════════════
#  EMAIL — ESTADO GENERAL DE CUENTA
# ═══════════════════════════════════════════════════════════

class SendGeneralStatementEmailView(APIView):
    """POST /api/tenants/{tenant_id}/send-statement-email/
       Sends the general estado de cuenta summary by email to a list of recipients."""
    permission_classes = [IsAdminOrTesorero]

    def post(self, request, tenant_id=None):
        recipient_emails = request.data.get('emails', [])  # list of email strings
        cutoff = request.data.get('cutoff', _today_period())

        if not recipient_emails or not isinstance(recipient_emails, list):
            return Response({'detail': 'Proporciona una lista de correos en el campo "emails".'}, status=status.HTTP_400_BAD_REQUEST)

        # Validate emails are non-empty strings
        emails = [e.strip() for e in recipient_emails if isinstance(e, str) and e.strip()]
        if not emails:
            return Response({'detail': 'No hay correos válidos.'}, status=status.HTTP_400_BAD_REQUEST)

        tenant = Tenant.objects.get(id=tenant_id)
        start_period = tenant.operation_start_date or '2024-01'

        units = Unit.objects.filter(tenant_id=tenant_id).order_by('unit_id_code')
        units_data = []
        total_cargo = 0.0
        total_abono = 0.0
        total_deuda = 0.0

        # Pre-fetch planes activos una sola vez para evitar N+1 queries en _compute_statement
        _sge_unit_plans = {
            str(_p.unit_id): _p
            for _p in PaymentPlan.objects.filter(tenant_id=tenant_id, status='accepted')
        }

        for unit in units:
            rows, tc, tp, bal, pda, _u_ap = _compute_statement(
                tenant, str(unit.id), start_period, cutoff,
                _prefetched_plan=_sge_unit_plans.get(str(unit.id)),
            )
            prev_debt = float(unit.previous_debt or 0)
            credit_bal = float(unit.credit_balance or 0)
            if _u_ap:
                adj_bal = bal - credit_bal
            else:
                adj_bal = bal + prev_debt - float(pda) - credit_bal
            deuda = max(0.0, adj_bal)
            total_cargo += tc
            total_abono += tp
            total_deuda += deuda
            units_data.append({
                'unit_code': unit.unit_id_code or '',
                'unit_name': unit.unit_name or '',
                'responsible': unit.responsible_name or '',
                'total_charges': tc,
                'total_paid': tp,
                'balance': adj_bal,
            })

        from .email_service import send_general_statement_email
        ok = send_general_statement_email(
            emails=emails,
            tenant_name=getattr(tenant, 'razon_social', '') or tenant.name or '',
            cutoff_str=_period_label_es(cutoff),
            units_data=units_data,
            total_cargo=total_cargo,
            total_abono=total_abono,
            total_deuda=total_deuda,
        )

        if ok:
            return Response({'detail': f'Estado general enviado a {", ".join(emails)}'})
        return Response({'detail': 'Error al enviar el correo. Verifica la configuración SMTP.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# ═══════════════════════════════════════════════════════════
#  ESTADO POR UNIDAD — PDF EXPORT
# ═══════════════════════════════════════════════════════════

class EstadoPorUnidadPDFView(APIView):
    """GET /api/tenants/{tenant_id}/estado-cuenta-pdf/?cutoff=YYYY-MM
       Generates a downloadable PDF of the unit list with tenant header."""
    permission_classes = [IsTenantMember]

    def get(self, request, tenant_id):
        import io
        import base64
        from datetime import date
        from django.http import HttpResponse
        try:
            from reportlab.lib.pagesizes import A4
            from reportlab.lib import colors
            from reportlab.lib.units import cm
            from reportlab.platypus import (
                SimpleDocTemplate, Table, TableStyle, Paragraph,
                Spacer, HRFlowable, Image,
            )
            from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
            from reportlab.lib.enums import TA_CENTER, TA_RIGHT
            from reportlab.platypus import KeepTogether  # noqa: F401
        except ImportError:
            return Response(
                {'error': 'reportlab no instalado. Ejecuta: docker-compose up -d --build backend'},
                status=503
            )

        cutoff_param = request.query_params.get('cutoff', '')
        cutoff = cutoff_param or _today_period()
        unit_id_param = request.query_params.get('unit_id', '')
        from_period_param = request.query_params.get('from_period', '')

        tenant = Tenant.objects.get(id=tenant_id)
        start_period = from_period_param or tenant.operation_start_date or '2024-01'

        # ── PER-UNIT statement PDF ────────────────────────────────────────────
        if unit_id_param:
            return self._generate_unit_statement_pdf_view(
                request, tenant, unit_id_param, start_period, cutoff
            )

        # Build unit data
        units = Unit.objects.filter(tenant_id=tenant_id).order_by('unit_id_code')
        unit_rows = []
        total_cargo_all = Decimal('0')
        total_abono_all = Decimal('0')
        total_deuda_all = Decimal('0')
        con_adeudo = 0

        # Pre-fetch planes activos una sola vez para evitar N+1 queries en _compute_statement
        _gsp_unit_plans = {
            str(_p.unit_id): _p
            for _p in PaymentPlan.objects.filter(tenant_id=tenant_id, status='accepted')
        }

        for unit in units:
            rows, tc, tp, bal, pda, _u_ap2 = _compute_statement(
                tenant, str(unit.id), start_period, cutoff,
                _prefetched_plan=_gsp_unit_plans.get(str(unit.id)),
            )
            prev_debt = float(unit.previous_debt or 0)
            credit_bal = float(unit.credit_balance or 0)
            if _u_ap2:
                adj_bal = bal - credit_bal
            else:
                adj_bal = bal + prev_debt - float(pda) - credit_bal
            total_cargo_all += Decimal(str(tc))
            total_abono_all += Decimal(str(tp))
            deuda = max(0, adj_bal)
            if deuda > 0.01:
                con_adeudo += 1
            total_deuda_all += Decimal(str(max(0, adj_bal)))
            resp = unit.responsible_name or f'{unit.owner_first_name or ""} {unit.owner_last_name or ""}'.strip()
            unit_rows.append({
                'code': unit.unit_id_code or '',
                'name': unit.unit_name or '',
                'responsible': resp or '—',
                'total_charge': tc,
                'total_paid': tp,
                'balance': adj_bal,
                'exempt': unit.admin_exempt,
            })

        # Currency formatter
        currency = tenant.currency or 'MXN'
        def fmt_cur(n):
            try:
                return f'${float(n):,.0f}'
            except Exception:
                return '$0'

        # Period label helper
        MONTHS_ES = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
                     'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
        MONTHS_FULL = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                       'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
        def period_label(p):
            try:
                y, m = p.split('-')
                return f'{MONTHS_FULL[int(m)]} {y}'
            except Exception:
                return p or ''

        # Build PDF in memory
        buffer = io.BytesIO()
        page_w, page_h = A4
        margin = 1.8 * cm
        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            leftMargin=margin,
            rightMargin=margin,
            topMargin=1.4 * cm,
            bottomMargin=1.6 * cm,
        )

        styles = getSampleStyleSheet()
        # Colour palette
        COL_TEAL = colors.HexColor('#0d7c6e')
        COL_TEAL_LIGHT = colors.HexColor('#e6f4f2')
        COL_CORAL = colors.HexColor('#e84040')
        COL_CORAL_LIGHT = colors.HexColor('#fff1f0')
        COL_AMBER = colors.HexColor('#d97706')
        COL_AMBER_LIGHT = colors.HexColor('#fffbeb')
        COL_INK = colors.HexColor('#1a1a2e')
        COL_INK_LIGHT = colors.HexColor('#64748b')
        COL_SAND = colors.HexColor('#f8f6f1')
        COL_SAND_BORDER = colors.HexColor('#e5e0d5')
        COL_WHITE = colors.white
        COL_HEADER_BG = colors.HexColor('#1a1a2e')

        st_title = ParagraphStyle('DocTitle', fontSize=18, fontName='Helvetica-Bold',
                                   textColor=COL_INK, spaceAfter=2, leading=22)
        st_subtitle = ParagraphStyle('DocSub', fontSize=10, fontName='Helvetica',
                                      textColor=COL_INK_LIGHT, spaceAfter=1)
        st_tenant = ParagraphStyle('TenantName', fontSize=13, fontName='Helvetica-Bold',
                                    textColor=COL_INK, spaceAfter=2, leading=16)
        st_info = ParagraphStyle('Info', fontSize=8.5, fontName='Helvetica',
                                  textColor=COL_INK_LIGHT, spaceAfter=1, leading=11)
        st_kpi_val = ParagraphStyle('KpiVal', fontSize=14, fontName='Helvetica-Bold',
                                     textColor=COL_INK, leading=17, spaceAfter=0)
        st_kpi_label = ParagraphStyle('KpiLabel', fontSize=7.5, fontName='Helvetica',
                                       textColor=COL_INK_LIGHT, leading=9, spaceAfter=0)
        st_footer = ParagraphStyle('Footer', fontSize=7.5, fontName='Helvetica',
                                    textColor=COL_INK_LIGHT, alignment=TA_CENTER)
        st_cell = ParagraphStyle('Cell', fontSize=8, fontName='Helvetica',
                                  textColor=COL_INK, leading=10)
        st_cell_bold = ParagraphStyle('CellBold', fontSize=8, fontName='Helvetica-Bold',
                                       textColor=COL_INK, leading=10)
        st_cell_right = ParagraphStyle('CellRight', fontSize=8, fontName='Helvetica',
                                        textColor=COL_INK, leading=10, alignment=TA_RIGHT)
        st_cell_right_bold = ParagraphStyle('CellRightBold', fontSize=8.5, fontName='Helvetica-Bold',
                                             textColor=COL_INK, leading=10, alignment=TA_RIGHT)

        story = []

        # ── HEADER: logo + tenant info ───────────────────────────────
        logo_img = None
        if tenant.logo:
            try:
                # logo may be stored as plain base64 or data-URL
                b64 = tenant.logo
                if ',' in b64:
                    b64 = b64.split(',', 1)[1]
                logo_bytes = base64.b64decode(b64)
                logo_io = io.BytesIO(logo_bytes)
                max_logo_h = 1.6 * cm
                max_logo_w = 4.5 * cm
                logo_img = Image(logo_io, width=max_logo_w, height=max_logo_h, kind='proportional')
            except Exception:
                logo_img = None

        # Build address string
        def _addr(*parts):
            return ', '.join(p for p in parts if p and p.strip())

        fiscal_addr = _addr(
            tenant.info_calle,
            tenant.info_num_externo,
            tenant.info_colonia,
            tenant.info_delegacion,
            tenant.info_ciudad,
            tenant.info_codigo_postal,
        )
        phys_addr = _addr(
            tenant.addr_calle,
            tenant.addr_num_externo,
            tenant.addr_colonia,
            tenant.addr_delegacion,
            tenant.addr_ciudad,
            tenant.addr_codigo_postal,
        )
        display_addr = fiscal_addr or phys_addr

        tenant_name_str = tenant.razon_social or tenant.name
        rfc_str = f'RFC: {tenant.rfc}' if tenant.rfc else ''
        addr_str = display_addr
        gen_date = date.today().strftime('%d/%m/%Y')

        # Info column paragraphs
        info_lines = [
            Paragraph(tenant_name_str, st_tenant),
        ]
        if tenant.name and tenant.razon_social and tenant.name != tenant.razon_social:
            info_lines.append(Paragraph(tenant.name, st_info))
        if rfc_str:
            info_lines.append(Paragraph(rfc_str, st_info))
        if addr_str:
            info_lines.append(Paragraph(addr_str, st_info))

        title_lines = [
            Paragraph('Estado por Unidad', st_title),
            Paragraph(f'Corte al período: <b>{period_label(cutoff)}</b>', st_subtitle),
            Paragraph(f'Desde: {period_label(start_period)}  ·  Generado: {gen_date}', st_info),
        ]

        # Combine logo + info + title in a 3-column header table
        if logo_img:
            header_data = [[logo_img, info_lines, title_lines]]
            col_widths = [4.6 * cm, 8.2 * cm, None]
        else:
            header_data = [[info_lines, title_lines]]
            col_widths = [10 * cm, None]

        avail_w = page_w - 2 * margin
        if logo_img:
            col_widths[-1] = avail_w - col_widths[0] - col_widths[1]
        else:
            col_widths[-1] = avail_w - col_widths[0]

        header_table = Table(header_data, colWidths=col_widths)
        header_table.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 8),
            ('TOPPADDING', (0, 0), (-1, -1), 0),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
        ]))
        story.append(header_table)
        story.append(HRFlowable(width='100%', thickness=1.5, color=COL_TEAL, spaceAfter=8))

        # ── KPI STRIP ───────────────────────────────────────────────
        kpi_data = [[
            [Paragraph(fmt_cur(total_cargo_all), st_kpi_val), Paragraph('Total Cargos', st_kpi_label)],
            [Paragraph(fmt_cur(total_abono_all), st_kpi_val), Paragraph('Total Abonado', st_kpi_label)],
            [Paragraph(fmt_cur(total_deuda_all), ParagraphStyle('KpiValDebt', fontSize=14, fontName='Helvetica-Bold', textColor=COL_CORAL, leading=17)), Paragraph('Deuda Total', st_kpi_label)],
            [Paragraph(str(con_adeudo), st_kpi_val), Paragraph('Unidades con adeudo', st_kpi_label)],
            [Paragraph(str(len(unit_rows)), st_kpi_val), Paragraph('Total unidades', st_kpi_label)],
        ]]
        kpi_col_w = avail_w / 5
        kpi_table = Table(kpi_data, colWidths=[kpi_col_w] * 5, rowHeights=[1.4 * cm])
        kpi_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), COL_SAND),
            ('BACKGROUND', (2, 0), (2, 0), COL_CORAL_LIGHT),
            ('BOX', (0, 0), (-1, -1), 0.5, COL_SAND_BORDER),
            ('INNERGRID', (0, 0), (-1, -1), 0.5, COL_SAND_BORDER),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('LEFTPADDING', (0, 0), (-1, -1), 6),
            ('RIGHTPADDING', (0, 0), (-1, -1), 6),
            ('ROUNDEDCORNERS', [4]),
        ]))
        story.append(kpi_table)
        story.append(Spacer(1, 10))

        # ── UNIT TABLE ──────────────────────────────────────────────
        # Column widths: # | Código | Nombre | Responsable | Cargos | Abonado | Saldo | Estado
        cw = [0.8*cm, 2.0*cm, 4.8*cm, 4.2*cm, 2.4*cm, 2.4*cm, 2.4*cm, 2.2*cm]
        # Adjust proportionally to avail_w
        total_cw = sum(cw)
        cw = [c * avail_w / total_cw for c in cw]

        th_style = ParagraphStyle('TH', fontSize=7.5, fontName='Helvetica-Bold',
                                   textColor=COL_WHITE, leading=9, alignment=TA_CENTER)
        th_right = ParagraphStyle('THR', fontSize=7.5, fontName='Helvetica-Bold',
                                   textColor=COL_WHITE, leading=9, alignment=TA_RIGHT)

        table_data = [[
            Paragraph('#', th_style),
            Paragraph('Código', th_style),
            Paragraph('Nombre / Unidad', th_style),
            Paragraph('Responsable', th_style),
            Paragraph('Cargos', th_right),
            Paragraph('Abonado', th_right),
            Paragraph('Saldo', th_right),
            Paragraph('Estado', th_style),
        ]]

        for idx, u in enumerate(unit_rows):
            bal = u['balance']
            has_debt = bal > 0.01
            has_favor = bal < -0.01

            if has_debt:
                bal_str = f'-{fmt_cur(abs(bal))}'
                bal_color = COL_CORAL
                status_str = 'Con adeudo'
                row_bg = COL_CORAL_LIGHT if has_debt else COL_WHITE
            elif has_favor:
                bal_str = f'+{fmt_cur(abs(bal))}'
                bal_color = COL_TEAL
                status_str = 'A favor'
                row_bg = COL_TEAL_LIGHT
            else:
                bal_str = '$0'
                bal_color = COL_INK_LIGHT
                status_str = 'Al corriente'
                row_bg = COL_WHITE

            if u.get('exempt'):
                status_str = 'Exento'
                bal_color = colors.HexColor('#0891b2')

            num_style = ParagraphStyle('Num', fontSize=7.5, fontName='Helvetica',
                                        textColor=COL_INK_LIGHT, leading=9, alignment=TA_CENTER)
            code_style = ParagraphStyle('Code', fontSize=7.5, fontName='Helvetica-Bold',
                                         textColor=COL_TEAL, leading=9, alignment=TA_CENTER,
                                         backColor=COL_TEAL_LIGHT)
            name_style = ParagraphStyle('Name', fontSize=8, fontName='Helvetica-Bold',
                                         textColor=COL_INK, leading=10)
            resp_style = ParagraphStyle('Resp', fontSize=7.5, fontName='Helvetica',
                                         textColor=COL_INK_LIGHT, leading=9)
            bal_style = ParagraphStyle('Bal', fontSize=8.5, fontName='Helvetica-Bold',
                                        textColor=bal_color, leading=10, alignment=TA_RIGHT)
            stat_style = ParagraphStyle('Stat', fontSize=7.5, fontName='Helvetica-Bold',
                                         textColor=bal_color, leading=9, alignment=TA_CENTER)

            row = [
                Paragraph(str(idx + 1), num_style),
                Paragraph(u['code'], code_style),
                Paragraph(u['name'] or '—', name_style),
                Paragraph(u['responsible'], resp_style),
                Paragraph(fmt_cur(u['total_charge']), st_cell_right),
                Paragraph(fmt_cur(u['total_paid']), st_cell_right),
                Paragraph(bal_str, bal_style),
                Paragraph(status_str, stat_style),
            ]
            table_data.append(row)

        # Totals row
        total_row = [
            Paragraph('', th_style),
            Paragraph('', th_style),
            Paragraph('TOTALES', ParagraphStyle('Tot', fontSize=8, fontName='Helvetica-Bold',
                                                  textColor=COL_WHITE, leading=10)),
            Paragraph('', th_style),
            Paragraph(fmt_cur(total_cargo_all), ParagraphStyle('TotV', fontSize=8, fontName='Helvetica-Bold',
                                                                  textColor=COL_WHITE, leading=10, alignment=TA_RIGHT)),
            Paragraph(fmt_cur(total_abono_all), ParagraphStyle('TotV2', fontSize=8, fontName='Helvetica-Bold',
                                                                  textColor=COL_WHITE, leading=10, alignment=TA_RIGHT)),
            Paragraph(fmt_cur(total_deuda_all) if float(total_deuda_all) > 0 else '$0',
                      ParagraphStyle('TotBal', fontSize=8, fontName='Helvetica-Bold',
                                     textColor=colors.HexColor('#fca5a5'), leading=10, alignment=TA_RIGHT)),
            Paragraph('', th_style),
        ]
        table_data.append(total_row)

        unit_table = Table(table_data, colWidths=cw, repeatRows=1)

        # Build row-level background styles
        ts_cmds = [
            # Header
            ('BACKGROUND', (0, 0), (-1, 0), COL_HEADER_BG),
            ('TEXTCOLOR', (0, 0), (-1, 0), COL_WHITE),
            # Totals row
            ('BACKGROUND', (0, -1), (-1, -1), COL_TEAL),
            # Grid
            ('GRID', (0, 0), (-1, -1), 0.4, COL_SAND_BORDER),
            ('LINEBELOW', (0, 0), (-1, 0), 1, COL_TEAL),
            # Padding
            ('TOPPADDING', (0, 0), (-1, -1), 5),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
            ('LEFTPADDING', (0, 0), (-1, -1), 5),
            ('RIGHTPADDING', (0, 0), (-1, -1), 5),
            # Vertical alignment
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ]

        # Alternating row backgrounds + debt/favor highlights
        for row_idx, u in enumerate(unit_rows, start=1):
            bal = u['balance']
            has_debt = bal > 0.01
            has_favor = bal < -0.01
            if has_debt:
                ts_cmds.append(('BACKGROUND', (0, row_idx), (-1, row_idx), COL_CORAL_LIGHT))
            elif has_favor:
                ts_cmds.append(('BACKGROUND', (0, row_idx), (-1, row_idx), COL_TEAL_LIGHT))
            elif row_idx % 2 == 0:
                ts_cmds.append(('BACKGROUND', (0, row_idx), (-1, row_idx), COL_SAND))

        unit_table.setStyle(TableStyle(ts_cmds))

        story.append(unit_table)
        story.append(Spacer(1, 8))

        # ── FOOTER NOTE ──────────────────────────────────────────────
        story.append(HRFlowable(width='100%', thickness=0.5, color=COL_SAND_BORDER, spaceBefore=4))
        story.append(Paragraph(
            f'Homly · {tenant.name} · Corte: {period_label(cutoff)} · Generado el {gen_date}',
            st_footer
        ))

        # Build PDF
        doc.build(story)
        buffer.seek(0)

        filename = f'estado_por_unidad_{cutoff}.pdf'
        response = HttpResponse(buffer.read(), content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response

    def _generate_unit_statement_pdf_view(self, request, tenant, unit_id, start_period, cutoff):
        """Generate and return a per-unit estado de cuenta PDF using the shared helper."""
        from django.http import HttpResponse

        unit = Unit.objects.filter(id=unit_id, tenant_id=tenant.id).first()
        if not unit:
            return Response({'detail': 'Unidad no encontrada.'}, status=404)

        # Vecino authorization: can only download their own unit
        tu = TenantUser.objects.filter(tenant_id=tenant.id, user=request.user).first()
        if tu and tu.role == 'vecino' and str(tu.unit_id) != str(unit.id):
            return Response({'detail': 'No autorizado.'}, status=403)

        rows, total_charges, total_paid, balance, prev_debt_adeudo, _pdf_active_plan = _compute_statement(
            tenant, str(unit.id), start_period, cutoff
        )
        prev_debt   = float(unit.previous_debt  or 0)
        credit_bal  = float(unit.credit_balance or 0)
        if _pdf_active_plan:
            adj_balance = balance - credit_bal
        else:
            adj_balance = balance + prev_debt - float(prev_debt_adeudo) - credit_bal

        # Convert rows to the format expected by the shared PDF helper
        email_rows = [
            {
                'period':  _period_label_es(r.get('period', '')),
                'charges': r.get('charge', 0),
                'paid':    r.get('paid', 0),
                'balance': r.get('saldo_accum', 0),
                'status':  r.get('status', 'pendiente'),
            }
            for r in (rows or [])
        ]

        pdf_bytes = _generate_unit_statement_pdf(
            tenant=tenant,
            unit=unit,
            rows=email_rows,
            total_charges=total_charges,
            total_paid=total_paid,
            adj_balance=adj_balance,
            from_period=start_period,
            to_period=cutoff,
        )

        if pdf_bytes is None:
            return Response(
                {'detail': 'No se pudo generar el PDF. Verifica que reportlab esté instalado.'},
                status=503,
            )

        safe_code = ''.join(c if c.isalnum() or c in '-_' else '_' for c in (unit.unit_id_code or 'unidad'))
        filename = f'estado_cuenta_{safe_code}_{cutoff}.pdf'
        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response


# ═══════════════════════════════════════════════════════════
#  CONDOMINIO REQUEST (Landing page — public endpoint)
# ═══════════════════════════════════════════════════════════

class CondominioRequestView(APIView):
    """
    Public endpoint — no authentication required.
    POST: submit a new condominium registration request from the landing page.
    """
    permission_classes = [permissions.AllowAny]
    throttle_scope = 'anon'   # optional: rate-limit anonymous submissions

    def post(self, request):
        serializer = CondominioRequestSerializer(data=request.data)
        if serializer.is_valid():
            instance = serializer.save()
            # Send welcome email to applicant in background
            import threading, logging as _logging
            _log = _logging.getLogger(__name__)
            def _send():
                try:
                    plan = instance.subscription_plan
                    send_trial_welcome_email(
                        email=instance.admin_email,
                        nombre=f'{instance.admin_nombre} {instance.admin_apellido}'.strip(),
                        condominio=instance.condominio_nombre,
                        trial_days=instance.trial_days,
                        plan_name=plan.name if plan else None,
                    )
                except Exception as _e:
                    _log.exception('Error sending trial welcome email to %s: %s', instance.admin_email, _e)
            threading.Thread(target=_send, daemon=True).start()
            return Response(
                {'message': 'Solicitud recibida. Nos pondremos en contacto pronto.'},
                status=status.HTTP_201_CREATED,
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


# ═══════════════════════════════════════════════════════════
#  SUBSCRIPTION PLANS — CRUD (superadmin only)
# ═══════════════════════════════════════════════════════════

class SubscriptionPlanViewSet(viewsets.ModelViewSet):
    """CRUD for subscription plans. Only superadmins can access."""
    serializer_class = SubscriptionPlanSerializer
    permission_classes = [IsSuperAdmin]

    def get_queryset(self):
        qs = SubscriptionPlan.objects.all()
        active_only = self.request.query_params.get('active_only')
        if active_only in ('1', 'true', 'True'):
            qs = qs.filter(is_active=True)
        return qs


# ═══════════════════════════════════════════════════════════
#  TRIAL REQUESTS — manage CondominioRequests with subscription flow
# ═══════════════════════════════════════════════════════════

class TrialRequestViewSet(viewsets.ModelViewSet):
    """
    Manage incoming trial/registration requests from the landing page.
    Superadmin only. Supports approve and reject custom actions.
    """
    serializer_class = CondominioRequestSerializer
    permission_classes = [IsSuperAdmin]
    # Must include 'post' so the /approve/ and /reject/ custom actions are reachable
    http_method_names = ['get', 'post', 'patch', 'head', 'options']

    def get_queryset(self):
        qs = CondominioRequest.objects.all()
        status_filter = self.request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)
        return qs

    @action(detail=True, methods=['post'], url_path='approve')
    def approve(self, request, pk=None):
        """
        Approve a trial request:
        1. Create Tenant from request data
        2. Create admin User with temporary password
        3. Create TenantUser as admin
        4. Create TenantSubscription (trial)
        5. Update CondominioRequest (enrolled + tenant FK)
        6. Send approval email with credentials
        """
        from datetime import date, timedelta
        import secrets, string

        trial_req = self.get_object()
        if trial_req.status == 'enrolled':
            return Response({'detail': 'Ya fue aprobada y procesada.'}, status=400)
        if trial_req.status == 'rejected':
            return Response({'detail': 'No se puede aprobar una solicitud rechazada.'}, status=400)

        plan_id = request.data.get('subscription_plan')
        trial_days = int(request.data.get('trial_days', trial_req.trial_days or 7))
        admin_notes = request.data.get('admin_notes', trial_req.admin_notes or '')

        plan = None
        if plan_id:
            plan = SubscriptionPlan.objects.filter(id=plan_id).first()

        # 1. Create Tenant
        tenant = Tenant.objects.create(
            name=trial_req.condominio_nombre,
            units_count=trial_req.condominio_unidades or 0,
            currency=trial_req.condominio_currency or 'MXN',
            operation_start_date=date.today().strftime('%Y-%m'),
            admin_type=trial_req.condominio_tipo_admin or 'administrador',
        )

        # 2. Generate temp password
        alphabet = string.ascii_letters + string.digits
        temp_password = ''.join(secrets.choice(alphabet) for _ in range(12))

        # 3. Create or reuse User
        admin_email = trial_req.admin_email.lower().strip()
        admin_name = f'{trial_req.admin_nombre} {trial_req.admin_apellido}'.strip()
        user, created = User.objects.get_or_create(
            email=admin_email,
            defaults={'name': admin_name, 'is_active': True, 'must_change_password': True},
        )
        if created:
            user.set_password(temp_password)
            user.save(update_fields=['password', 'must_change_password'])
        else:
            # Existing user: set a new temp password and must_change_password flag
            user.set_password(temp_password)
            user.must_change_password = True
            user.save(update_fields=['password', 'must_change_password'])

        # 4. Create TenantUser as admin
        TenantUser.objects.get_or_create(
            tenant=tenant, user=user,
            defaults={'role': 'admin'},
        )

        # 5. Create TenantSubscription
        trial_start = date.today()
        trial_end   = trial_start + timedelta(days=trial_days)
        units_count = trial_req.condominio_unidades or 0
        if plan:
            # Respect the plan's billing cycle — annual plans must multiply by 12
            # and apply the annual discount before storing amount_per_cycle.
            annual = (plan.billing_cycle == 'annual')
            amount = plan.price_for_units(units_count, annual=annual)
        else:
            amount = 0
        TenantSubscription.objects.create(
            tenant=tenant,
            plan=plan,
            status='trial',
            trial_start=trial_start,
            trial_end=trial_end,
            units_count=units_count,
            amount_per_cycle=amount,
            currency=plan.currency if plan else (trial_req.condominio_currency or 'MXN'),
            notes=admin_notes,
        )

        # 6. Update trial request
        trial_req.status = 'enrolled'
        trial_req.approved_at = _django_now()
        trial_req.approved_by = request.user
        trial_req.subscription_plan = plan
        trial_req.trial_days = trial_days
        trial_req.admin_notes = admin_notes
        trial_req.tenant = tenant
        trial_req.save()

        # 7. Send approval email
        import threading, logging as _logging
        _log = _logging.getLogger(__name__)
        def _notify():
            try:
                send_trial_approved_email(
                    email=admin_email,
                    nombre=admin_name,
                    condominio=tenant.name,
                    trial_start=trial_start,
                    trial_end=trial_end,
                    trial_days=trial_days,
                    plan_name=plan.name if plan else None,
                )
            except Exception as _e:
                _log.exception('Error sending trial approval email to %s: %s', admin_email, _e)
        threading.Thread(target=_notify, daemon=True).start()

        return Response({
            'detail': 'Solicitud aprobada. Tenant y usuario creados correctamente.',
            'tenant_id': str(tenant.id),
            'user_email': admin_email,
            'trial_end': str(trial_end),
        })

    @action(detail=True, methods=['post'], url_path='reject')
    def reject(self, request, pk=None):
        """Reject a trial request and optionally send a rejection email."""
        trial_req = self.get_object()
        if trial_req.status == 'enrolled':
            return Response({'detail': 'No se puede rechazar una solicitud ya aprobada.'}, status=400)

        reason = request.data.get('rejection_reason', '').strip()
        trial_req.status = 'rejected'
        trial_req.rejected_at = _django_now()
        trial_req.rejection_reason = reason
        trial_req.save(update_fields=['status', 'rejected_at', 'rejection_reason'])

        import threading, logging as _logging
        _log = _logging.getLogger(__name__)
        def _notify():
            try:
                send_trial_rejected_email(
                    email=trial_req.admin_email,
                    nombre=f'{trial_req.admin_nombre} {trial_req.admin_apellido}'.strip(),
                    condominio=trial_req.condominio_nombre,
                    reason=reason,
                )
            except Exception as _e:
                _log.exception('Error sending trial rejection email to %s: %s', trial_req.admin_email, _e)
        threading.Thread(target=_notify, daemon=True).start()

        return Response({'detail': 'Solicitud rechazada.'})


# ═══════════════════════════════════════════════════════════
#  TENANT SUBSCRIPTIONS — view and manage per-tenant subscriptions
# ═══════════════════════════════════════════════════════════

class TenantSubscriptionViewSet(viewsets.ModelViewSet):
    """List and manage tenant subscriptions. Superadmin only."""
    serializer_class = TenantSubscriptionSerializer
    permission_classes = [IsSuperAdmin]
    http_method_names = ['get', 'post', 'patch', 'head', 'options']

    def get_queryset(self):
        qs = TenantSubscription.objects.select_related('tenant', 'plan').all()
        status_filter = self.request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)
        tenant_id = self.request.query_params.get('tenant')
        if tenant_id:
            qs = qs.filter(tenant_id=tenant_id)
        return qs

    def perform_update(self, serializer):
        """Override to sync tenant is_active whenever status is part of the PATCH."""
        instance = serializer.save()
        if 'status' in self.request.data:
            instance.sync_tenant_active()

    @action(detail=True, methods=['post'], url_path='record-payment')
    def record_payment(self, request, pk=None):
        """Record a manual payment for this subscription (superadmin only)."""
        import datetime
        from django.utils import timezone as tz
        sub = self.get_object()
        data = request.data.copy()
        data['subscription'] = str(sub.id)
        ser = SubscriptionPaymentSerializer(data=data)
        if not ser.is_valid():
            return Response(ser.errors, status=400)
        payment = ser.save(recorded_by=request.user)

        # Activate if was past_due, and update next_billing_date
        update_fields = ['updated_at']
        if sub.status in ('past_due', 'expired'):
            sub.status = 'active'
            update_fields.append('status')

        # Calculate next_billing_date based on billing cycle
        today = tz.now().date()
        if sub.plan:
            if sub.plan.billing_cycle == 'annual':
                # Annual: same day next year
                base = sub.next_billing_date or today
                try:
                    sub.next_billing_date = base.replace(year=base.year + 1)
                except ValueError:
                    # Feb 29 edge case
                    sub.next_billing_date = base.replace(year=base.year + 1, day=28)
            else:
                # Monthly: 1st of next month from today
                if today.month == 12:
                    sub.next_billing_date = today.replace(year=today.year + 1, month=1, day=1)
                else:
                    sub.next_billing_date = today.replace(month=today.month + 1, day=1)
        else:
            # No plan: default to 1st of next month
            if today.month == 12:
                sub.next_billing_date = today.replace(year=today.year + 1, month=1, day=1)
            else:
                sub.next_billing_date = today.replace(month=today.month + 1, day=1)

        update_fields.append('next_billing_date')
        sub.save(update_fields=update_fields)
        sub.sync_tenant_active()

        return Response(SubscriptionPaymentSerializer(payment).data, status=201)

    @action(detail=True, methods=['get'], url_path='payments')
    def payments(self, request, pk=None):
        """List all payments for this subscription."""
        sub = self.get_object()
        payments = sub.payments.select_related('recorded_by').all()
        return Response(SubscriptionPaymentSerializer(payments, many=True).data)

    @action(detail=True, methods=['post'], url_path='sync-status')
    def sync_status(self, request, pk=None):
        """Manually trigger tenant is_active sync from subscription status."""
        sub = self.get_object()
        sub.sync_tenant_active()
        return Response({'detail': 'Sincronizado correctamente.', 'is_active': sub.tenant.is_active})

    @action(detail=True, methods=['post'], url_path='calculate-amount')
    def calculate_amount(self, request, pk=None):
        """
        POST /api/tenant-subscriptions/{id}/calculate-amount/
        Recalculates amount_per_cycle from plan.price_for_units(units_count)
        and saves the result. Returns the updated subscription.
        Accepts optional body: { units_count: N } to override the stored count.
        """
        sub = self.get_object()
        if not sub.plan:
            return Response({'detail': 'Sin plan asignado. Selecciona un plan primero.'}, status=400)

        # Allow caller to pass a units_count override (e.g. after editing)
        units_override = request.data.get('units_count')
        units = int(units_override) if units_override is not None else sub.units_count
        if units < 0:
            return Response({'detail': 'El número de unidades no puede ser negativo.'}, status=400)

        annual = (sub.plan.billing_cycle == 'annual')
        amount = sub.plan.price_for_units(units, annual=annual)

        update_fields = ['amount_per_cycle', 'currency', 'updated_at']
        sub.amount_per_cycle = amount
        sub.currency = sub.plan.currency
        if units_override is not None:
            sub.units_count = units
            update_fields.append('units_count')
        sub.save(update_fields=update_fields)

        return Response(TenantSubscriptionSerializer(sub).data)

    @action(detail=True, methods=['post'], url_path='deactivate')
    def deactivate(self, request, pk=None):
        """
        POST /api/tenant-subscriptions/{id}/deactivate/
        Saves a snapshot of the current subscription state to subscription_history,
        then sets status to 'cancelled' and clears active billing data.
        This preserves the history while allowing a new subscription to be created
        for the tenant via the standard create endpoint.
        Body: { reason: "optional reason" }
        """
        from django.utils import timezone as tz
        sub = self.get_object()

        if sub.status in ('cancelled', 'expired'):
            return Response(
                {'detail': 'La suscripción ya está cancelada o expirada.'},
                status=400,
            )

        reason = (request.data.get('reason') or '').strip()

        # Build history snapshot from current state
        snapshot = {
            'plan_id':          str(sub.plan_id) if sub.plan_id else None,
            'plan_name':        sub.plan.name if sub.plan else None,
            'status':           sub.status,
            'trial_start':      str(sub.trial_start)      if sub.trial_start      else None,
            'trial_end':        str(sub.trial_end)        if sub.trial_end        else None,
            'billing_start':    str(sub.billing_start)    if sub.billing_start    else None,
            'next_billing_date': str(sub.next_billing_date) if sub.next_billing_date else None,
            'amount_per_cycle': str(sub.amount_per_cycle),
            'currency':         sub.currency,
            'units_count':      sub.units_count,
            'notes':            sub.notes,
            'deactivated_at':   tz.now().isoformat(),
            'reason':           reason,
        }

        history = list(sub.subscription_history or [])
        history.append(snapshot)

        sub.status              = 'cancelled'
        sub.plan                = None
        sub.billing_start       = None
        sub.next_billing_date   = None
        sub.amount_per_cycle    = 0
        sub.subscription_history = history
        if reason:
            sub.notes = f'[Desactivada] {reason}'.strip()
        sub.save()
        sub.sync_tenant_active()

        return Response(TenantSubscriptionSerializer(sub).data)

    @action(detail=False, methods=['post'], url_path='run-billing-check')
    def run_billing_check(self, request):
        """
        POST /api/tenant-subscriptions/run-billing-check/
        Checks all active/trial subscriptions and marks as past_due any tenant
        whose next_billing_date + 5-day grace period has elapsed without a payment
        for the current cycle. Automatically syncs tenant.is_active.
        Superadmin only.
        Returns: { checked, marked_past_due, already_past_due, details }
        """
        import datetime
        from django.utils import timezone as tz

        today = tz.now().date()
        grace_days = 5
        grace_deadline = today - datetime.timedelta(days=grace_days)

        # Only subscriptions that are active or trial and have a next_billing_date
        # Evaluate to a list immediately so the count is captured BEFORE modifying records
        candidates = list(
            TenantSubscription.objects.select_related('tenant', 'plan').filter(
                status__in=['active', 'trial'],
                next_billing_date__isnull=False,
                next_billing_date__lte=grace_deadline,
            )
        )
        total_checked = len(candidates)

        marked_past_due = []

        for sub in candidates:
            # Check if there's a payment for the current cycle
            # A payment counts if its date is >= the billing date being checked
            has_payment = sub.payments.filter(
                payment_date__gte=sub.next_billing_date
            ).exists()

            if not has_payment:
                sub.status = 'past_due'
                sub.save(update_fields=['status', 'updated_at'])
                sub.sync_tenant_active()
                marked_past_due.append({
                    'tenant_id': str(sub.tenant_id),
                    'tenant_name': sub.tenant.name,
                    'next_billing_date': str(sub.next_billing_date),
                    'days_overdue': (today - sub.next_billing_date).days,
                })

        # Count all past_due subscriptions after this run
        total_past_due_now = TenantSubscription.objects.filter(status='past_due').count()

        return Response({
            'checked': total_checked,
            'marked_past_due': len(marked_past_due),
            'total_past_due_now': total_past_due_now,
            'grace_days': grace_days,
            'details': marked_past_due,
        })

    @action(detail=True, methods=['post'], url_path='force-activate')
    def force_activate(self, request, pk=None):
        """
        POST /api/tenant-subscriptions/{id}/force-activate/
        Superadmin manually activates a tenant's subscription regardless of
        billing status. Optionally extends next_billing_date.
        Body: { reason: "...", extend_billing: true }
        """
        import datetime
        from django.utils import timezone as tz

        sub = self.get_object()
        reason = (request.data.get('reason') or '').strip()
        extend_billing = request.data.get('extend_billing', False)

        previous_status = sub.status
        sub.status = 'active'
        update_fields = ['status', 'updated_at']

        # Optionally push next_billing_date forward 1 cycle
        if extend_billing and sub.plan:
            today = tz.now().date()
            if sub.plan.billing_cycle == 'annual':
                base = sub.next_billing_date or today
                try:
                    sub.next_billing_date = base.replace(year=base.year + 1)
                except ValueError:
                    sub.next_billing_date = base.replace(year=base.year + 1, day=28)
            else:
                if today.month == 12:
                    sub.next_billing_date = today.replace(year=today.year + 1, month=1, day=1)
                else:
                    sub.next_billing_date = today.replace(month=today.month + 1, day=1)
            update_fields.append('next_billing_date')

        if reason:
            sub.notes = f'[Activado manualmente] {reason}'.strip()
            update_fields.append('notes')

        sub.save(update_fields=update_fields)
        sub.sync_tenant_active()

        return Response({
            'detail': 'Tenant activado manualmente.',
            'previous_status': previous_status,
            'current_status': sub.status,
            'tenant_is_active': sub.tenant.is_active,
            'next_billing_date': str(sub.next_billing_date) if sub.next_billing_date else None,
        })

    @action(detail=True, methods=['post'], url_path='force-deactivate')
    def force_deactivate(self, request, pk=None):
        """
        POST /api/tenant-subscriptions/{id}/force-deactivate/
        Superadmin manually deactivates a tenant (sets to past_due + inactivates).
        Different from /deactivate/ which cancels — this just suspends billing.
        Body: { reason: "..." }
        """
        sub = self.get_object()
        reason = (request.data.get('reason') or '').strip()

        if sub.status in ('cancelled', 'expired'):
            return Response({'detail': 'La suscripción ya está cancelada o expirada.'}, status=400)

        previous_status = sub.status
        sub.status = 'past_due'
        update_fields = ['status', 'updated_at']

        if reason:
            sub.notes = f'[Desactivado manualmente] {reason}'.strip()
            update_fields.append('notes')

        sub.save(update_fields=update_fields)
        sub.sync_tenant_active()

        return Response({
            'detail': 'Tenant desactivado manualmente.',
            'previous_status': previous_status,
            'current_status': sub.status,
            'tenant_is_active': sub.tenant.is_active,
        })

    def create(self, request, *args, **kwargs):
        """
        Override create to support re-subscribing a tenant that has a cancelled
        or expired subscription. Since TenantSubscription is OneToOne, we cannot
        insert a second row — instead we update (reset) the existing record.
        """
        tenant_id = request.data.get('tenant')
        if tenant_id:
            try:
                existing = TenantSubscription.objects.select_related('plan').get(tenant_id=tenant_id)
                if existing.status in ('cancelled', 'expired'):
                    # Reset the existing record with the new subscription data
                    serializer = self.get_serializer(existing, data=request.data, partial=False)
                    serializer.is_valid(raise_exception=True)
                    instance = serializer.save()
                    instance.sync_tenant_active()
                    return Response(self.get_serializer(instance).data, status=201)
                else:
                    return Response(
                        {'detail': 'Este tenant ya tiene una suscripción activa. '
                                   'Desactívala antes de crear una nueva.'},
                        status=400,
                    )
            except TenantSubscription.DoesNotExist:
                pass  # Fall through to normal create
        return super().create(request, *args, **kwargs)

    @action(detail=False, methods=['post'], url_path='initialize-all')
    def initialize_all(self, request):
        """
        POST /api/tenant-subscriptions/initialize-all/
        Creates a 'trial' TenantSubscription for every tenant that doesn't
        already have one, then syncs tenant.is_active.
        Superadmin only.
        Returns: { created: N, already_had: M, tenants: [{id, name, status}] }
        """
        from django.utils import timezone
        import datetime

        today = timezone.now().date()
        trial_end = today + datetime.timedelta(days=30)

        tenants = Tenant.objects.all()
        created_count = 0
        already_count = 0
        results = []

        # Fetch all existing subscription tenant IDs in one query
        existing_tenant_ids = set(
            TenantSubscription.objects.filter(tenant__in=tenants)
            .values_list('tenant_id', flat=True)
        )

        for tenant in tenants:
            if tenant.id in existing_tenant_ids:
                try:
                    existing_status = tenant.subscription.status
                except TenantSubscription.DoesNotExist:
                    existing_status = 'unknown'
                already_count += 1
                results.append({
                    'id': str(tenant.id),
                    'name': tenant.name,
                    'status': existing_status,
                    'action': 'existing',
                })
            else:
                # No subscription yet — create trial
                sub = TenantSubscription.objects.create(
                    tenant=tenant,
                    status='trial',
                    trial_start=today,
                    trial_end=trial_end,
                    amount_per_cycle=0,
                    currency=getattr(tenant, 'currency', 'MXN') or 'MXN',
                )
                sub.sync_tenant_active()
                created_count += 1
                results.append({
                    'id': str(tenant.id),
                    'name': tenant.name,
                    'status': 'trial',
                    'action': 'created',
                })

        return Response({
            'detail': f'Inicialización completada. Creadas: {created_count}, ya tenían: {already_count}.',
            'created': created_count,
            'already_had': already_count,
            'tenants': results,
        })


def _django_now():
    """Return timezone-aware now (or naive if USE_TZ=False)."""
    from django.utils import timezone
    return timezone.now()

