"""
Homly — API Views
All endpoints for the property management system.
"""
import uuid
import json
from decimal import Decimal
from django.db.models import Sum, Count, Q, F  # noqa: F401 - Q used in estado cuenta
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
    AssemblyPosition, Committee, UnrecognizedIncome,
    AmenityReservation, CondominioRequest, EmailVerificationCode,
    Notification,
)
from .email_service import send_verification_email, CODE_EXPIRY_MINUTES
from .serializers import (
    LoginSerializer, RequestCodeSerializer, LoginWithCodeSerializer,
    UserSerializer, UserCreateSerializer,
    TenantListSerializer, TenantDetailSerializer, TenantUserSerializer,
    UnitSerializer, UnitListSerializer, ExtraFieldSerializer,
    PaymentSerializer, PaymentCaptureSerializer, AddAdditionalPaymentSerializer, FieldPaymentSerializer,
    GastoEntrySerializer, CajaChicaEntrySerializer,
    BankStatementSerializer, ClosedPeriodSerializer, ReopenRequestSerializer,
    AssemblyPositionSerializer, CommitteeSerializer, UnrecognizedIncomeSerializer,
    DashboardSerializer, AmenityReservationSerializer, CondominioRequestSerializer,
    NotificationSerializer,
)
from .permissions import IsSuperAdmin, IsTenantAdmin, IsTenantMember, IsAdminOrTesorero, IsAdminOrTesOrAuditor


# ═══════════════════════════════════════════════════════════
#  AUTH
# ═══════════════════════════════════════════════════════════

class LoginView(APIView):
    """POST /api/auth/login/"""
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = serializer.validated_data['user']
        role = serializer.validated_data['role']
        tenant = serializer.validated_data.get('tenant')

        refresh = RefreshToken.for_user(user)
        # Add custom claims
        refresh['role'] = role
        if tenant:
            refresh['tenant_id'] = str(tenant.id)

        return Response({
            'access': str(refresh.access_token),
            'refresh': str(refresh),
            'user': UserSerializer(user).data,
            'role': role,
            'tenant_id': str(tenant.id) if tenant else None,
            'tenant_name': tenant.name if tenant else None,
            'must_change_password': user.must_change_password,
        })


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

        user   = serializer.validated_data['user']
        role   = serializer.validated_data['role']
        tenant = serializer.validated_data.get('tenant')

        # Code-only auth: no passwords. Clear must_change_password so we never prompt.
        if user.must_change_password:
            user.must_change_password = False
            user.save(update_fields=['must_change_password'])

        refresh = RefreshToken.for_user(user)
        refresh['role'] = role
        if tenant:
            refresh['tenant_id'] = str(tenant.id)

        return Response({
            'access': str(refresh.access_token),
            'refresh': str(refresh),
            'user': UserSerializer(user).data,
            'role': role,
            'tenant_id': str(tenant.id) if tenant else None,
            'tenant_name': tenant.name if tenant else None,
            'must_change_password': False,  # Code-only: never prompt for password
        })


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
        return Response({'exists': True, 'id': str(user.id), 'name': user.name, 'email': user.email})


class SwitchTenantView(APIView):
    """POST /api/auth/switch-tenant/ — Issue a new JWT for a different tenant."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        tenant_id = request.data.get('tenant_id')
        if not tenant_id:
            return Response({'detail': 'tenant_id requerido.'}, status=400)
        user = request.user
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
            tenant = tu.tenant
            role   = tu.role
        refresh = RefreshToken.for_user(user)
        refresh['role']      = role
        refresh['tenant_id'] = str(tenant.id)
        return Response({
            'access':               str(refresh.access_token),
            'refresh':              str(refresh),
            'user':                 UserSerializer(user).data,
            'role':                 role,
            'tenant_id':            str(tenant.id),
            'tenant_name':          tenant.name,
            'must_change_password': user.must_change_password,
        })


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
        # Auto-create an inactive vecino user when the unit has an owner email
        self._auto_create_vecino(unit)

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

        updates = {k: v for k, v in request.data.items() if k in ALLOWED_FIELDS}
        if not updates:
            return Response({'detail': 'No hay campos válidos para actualizar.'}, status=status.HTTP_400_BAD_REQUEST)

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
        ).select_related('user', 'unit')

    def perform_update(self, serializer):
        """Also update the related User.name if provided in request data."""
        instance = serializer.save()
        name = self.request.data.get('name')
        if name and name.strip():
            instance.user.name = name.strip()
            instance.user.save(update_fields=['name'])

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

def _compute_payment_status(payment, tenant, extra_fields):
    """Compute status from main field_payments + additional_payments.
    'parcial' = mantenimiento fijo sin captura + al menos un campo adicional activo con pago,
               O mantenimiento fijo capturado de forma incompleta (abono < cargo).
    Unidades exentas (admin_exempt): cargo de mantenimiento = 0; tipo 'excento' → pagado."""
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
    return 'pendiente'


class PaymentViewSet(viewsets.ModelViewSet):
    """CRUD /api/tenants/{tenant_id}/payments/"""
    serializer_class = PaymentSerializer
    permission_classes = [IsTenantMember]

    def get_queryset(self):
        qs = Payment.objects.filter(
            tenant_id=self.kwargs['tenant_id']
        ).select_related('unit').prefetch_related('field_payments')

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

        # Create or update payment
        payment, created = Payment.objects.update_or_create(
            tenant_id=tenant_id,
            unit_id=data['unit_id'],
            period=data['period'],
            defaults={
                'payment_type': data['payment_type'],
                'payment_date': data.get('payment_date'),
                'notes': data.get('notes', ''),
                'evidence': json.dumps(data.get('evidence', [])),
                'bank_reconciled': data.get('bank_reconciled', False),
                'adeudo_payments': data.get('adeudo_payments', {}),
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

        # Auto-compute status (main + additional_payments)
        extra_fields = ExtraField.objects.filter(
            tenant_id=tenant_id, enabled=True, required=True
        )
        payment.refresh_from_db()
        payment.status = _compute_payment_status(payment, tenant, list(extra_fields))
        payment.save()

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
        }
        payment.additional_payments = (payment.additional_payments or []) + [entry]
        tenant = Tenant.objects.get(id=tenant_id)
        extra_fields = ExtraField.objects.filter(
            tenant_id=tenant_id, enabled=True, required=True
        )
        payment.status = _compute_payment_status(payment, tenant, list(extra_fields))
        payment.save()

        return Response(PaymentSerializer(payment).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['delete'], url_path='clear')
    def clear_payment(self, request, tenant_id=None, pk=None):
        """DELETE /api/tenants/{tenant_id}/payments/{id}/clear/"""
        payment = self.get_object()
        payment.field_payments.all().delete()
        payment.delete()
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
        payment.status = _compute_payment_status(payment, tenant, list(extra_fields))
        payment.save()
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
        payment.status = _compute_payment_status(payment, tenant, list(extra_fields))
        payment.save()
        return Response(PaymentSerializer(payment).data, status=status.HTTP_200_OK)

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

        recipients = request.data.get('recipients', 'owner')  # 'owner' | 'tenant' | 'both'
        emails = []
        if recipients in ('owner', 'both') and (unit.owner_email or '').strip():
            emails.append(unit.owner_email.strip())
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

        from .email_service import send_receipt_email
        ok = send_receipt_email(emails=emails, **receipt_data)

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

    def perform_create(self, serializer):
        serializer.save(tenant_id=self.kwargs['tenant_id'])


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

    def perform_create(self, serializer):
        serializer.save(tenant_id=self.kwargs['tenant_id'])


# ═══════════════════════════════════════════════════════════
#  BANK STATEMENTS
# ═══════════════════════════════════════════════════════════

class BankStatementViewSet(viewsets.ModelViewSet):
    """CRUD /api/tenants/{tenant_id}/bank-statements/"""
    serializer_class = BankStatementSerializer
    permission_classes = [IsTenantAdmin]

    def get_queryset(self):
        return BankStatement.objects.filter(tenant_id=self.kwargs['tenant_id'])

    def perform_create(self, serializer):
        serializer.save(tenant_id=self.kwargs['tenant_id'])


# ═══════════════════════════════════════════════════════════
#  CLOSED PERIODS / REOPEN REQUESTS
# ═══════════════════════════════════════════════════════════

class ClosedPeriodViewSet(viewsets.ModelViewSet):
    serializer_class = ClosedPeriodSerializer
    permission_classes = [IsTenantAdmin]

    def get_queryset(self):
        return ClosedPeriod.objects.filter(tenant_id=self.kwargs['tenant_id'])

    def perform_create(self, serializer):
        serializer.save(
            tenant_id=self.kwargs['tenant_id'],
            closed_by=self.request.user
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
        return Response(ReopenRequestSerializer(req).data)

    @action(detail=True, methods=['post'])
    def reject(self, request, tenant_id=None, pk=None):
        req = self.get_object()
        req.status = 'rejected'
        req.resolved_by = request.user
        req.resolved_at = timezone.now()
        req.save()
        return Response(ReopenRequestSerializer(req).data)


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
            return [IsTenantAdmin()]
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
        """Send notification to all admin/tesorero users of this tenant."""
        manager_roles = ('admin', 'tesorero', 'superadmin')
        tu_qs = TenantUser.objects.filter(
            tenant_id=res.tenant_id, role__in=manager_roles,
        ).select_related('user')
        notifs = [
            Notification(
                tenant_id=res.tenant_id,
                user=tu.user,
                notif_type=notif_type,
                title=title,
                message=message,
                related_reservation=res,
            )
            for tu in tu_qs
        ]
        if notifs:
            Notification.objects.bulk_create(notifs)

    def _notify_unit_vecinos(self, res, notif_type, title, message=''):
        """Send notification to all vecinos linked to the reservation's unit."""
        if not res.unit_id:
            return
        tu_qs = TenantUser.objects.filter(
            tenant_id=res.tenant_id, unit_id=res.unit_id, role='vecino',
        ).select_related('user')
        notifs = [
            Notification(
                tenant_id=res.tenant_id,
                user=tu.user,
                notif_type=notif_type,
                title=title,
                message=message,
                related_reservation=res,
            )
            for tu in tu_qs
        ]
        if notifs:
            Notification.objects.bulk_create(notifs)

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

        admin_roles = ('admin', 'tesorero', 'superadmin')
        res_status = 'approved' if role in admin_roles else 'pending'

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

    @action(detail=True, methods=['post'])
    def approve(self, request, tenant_id=None, pk=None):
        res = self.get_object()
        res.status = 'approved'
        res.reviewed_by = request.user
        res.rejection_reason = ''
        res.save()
        self._notify_unit_vecinos(
            res,
            notif_type='reservation_approved',
            title=f'✅ Tu reserva de {res.area_name} fue aprobada',
            message=f'Fecha: {res.date}  {str(res.start_time)[:5]}–{str(res.end_time)[:5]}',
        )
        return Response(self.get_serializer(res).data)

    @action(detail=True, methods=['post'])
    def reject(self, request, tenant_id=None, pk=None):
        res = self.get_object()
        res.status = 'rejected'
        res.reviewed_by = request.user
        res.rejection_reason = request.data.get('reason', '')
        res.save()
        reason_txt = f'\nMotivo: {res.rejection_reason}' if res.rejection_reason else ''
        self._notify_unit_vecinos(
            res,
            notif_type='reservation_rejected',
            title=f'❌ Tu reserva de {res.area_name} fue rechazada',
            message=f'Fecha: {res.date}{reason_txt}',
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
        paid_count = payments.filter(status='pagado').count()
        partial_count = payments.filter(status='parcial').count()
        # pending = non-exempt units without a paid/partial payment
        non_exempt_units = total_units - exempt_count
        pending_count = max(0, non_exempt_units - paid_count - partial_count)

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
        for unit in units:
            _, _, _, bal, prev_debt_adeudo = _compute_statement(
                tenant, str(unit.id), start_period, period
            )
            previous_debt_u = Decimal(str(unit.previous_debt or 0))
            credit_balance_u = Decimal(str(unit.credit_balance or 0))
            prev_debt_adeudo_dec = Decimal(str(prev_debt_adeudo))
            adj_bal = Decimal(str(bal)) + previous_debt_u - prev_debt_adeudo_dec - credit_balance_u
            deuda_total += max(Decimal('0'), adj_bal)

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


def _compute_statement(tenant, unit_id, start_period, cutoff_period):
    """
    Replicate HTML computeStatement logic.
    Returns list of period rows: charge, paid, status, maintenance, saldo_accum.
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

    payments_qs = Payment.objects.filter(
        tenant_id=tenant.id, unit_id=unit_id
    ).prefetch_related('field_payments')

    payments_by_period = {p.period: p for p in payments_qs}

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

    # Saldo inicial = deuda anterior - abonos a deuda - saldo a favor previo
    # Sin max(0,...): el excedente de saldo a favor reduce los cargos de los periodos
    saldo_acum = Decimal(str(previous_debt)) - prev_debt_adeudo - Decimal(str(credit_balance))

    periods = _periods_between(start_period, cutoff_period)
    rows = []

    for period in periods:
        pay = payments_by_period.get(period)
        fp_map = {}
        if pay:
            for fp in pay.field_payments.all():
                fp_map[fp.field_key] = fp

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
            adelanto = Decimal(str(ac.get(str(ef.id), 0))) if str(ef.id) in ac else Decimal('0')
            abono = received + adelanto
            total_cargo_req += charge
            total_abono_req += abono
            field_detail.append({'id': str(ef.id), 'label': ef.label, 'charge': float(charge), 'received': float(received), 'adelanto': float(adelanto), 'abono': float(abono), 'required': True})

        for ef in opt_fields:
            field_fp = fp_map.get(str(ef.id))
            charge = Decimal('0')  # Optional fields: no fixed charge
            received = Decimal(str(field_fp.received or 0)) if field_fp else Decimal('0')
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

        oblig_abono = maint_abono + sum((fd['abono'] for fd in field_detail if fd.get('required')), 0)
        oblig_abono = Decimal(str(oblig_abono)) if not isinstance(oblig_abono, Decimal) else oblig_abono
        oblig_abono_capped = min(oblig_abono, cargo_oblig) if cargo_oblig > 0 else oblig_abono

        # Parcial: mantenimiento fijo sin abono + al menos un campo adicional activo con abono,
        #          o mantenimiento fijo con abono incompleto (abono < cargo).
        has_non_maint_abono = any(
            fd['abono'] > 0 for fd in field_detail if fd.get('id') != 'maintenance'
        )

        is_past = period <= today
        if pay:
            eff_status = pay.status
        else:
            eff_status = 'pendiente' if is_past else 'futuro'

        if is_exempt and cargo_oblig == Decimal('0'):
            # Período completamente exento sin campos adicionales obligatorios → exento
            eff_status = 'exento'
        elif cargo_oblig > 0 and oblig_abono_capped >= cargo_oblig:
            eff_status = 'exento' if is_exempt else 'pagado'
        elif maint_abono == Decimal('0') and has_non_maint_abono:
            eff_status = 'parcial'
        # Pago de mantenimiento base fija registrado de forma incompleta → Parcial
        elif maint_charge > 0 and Decimal('0') < maint_abono < maint_charge:
            eff_status = 'parcial'
        elif is_past:
            eff_status = 'pendiente'
        else:
            eff_status = 'futuro'

        saldo_periodo = cargo_total - abono_balance   # El saldo solo usa pagos que afectan el balance
        saldo_acum += saldo_periodo

        rows.append({
            'period': period,
            'charge': float(cargo_total),
            'paid': float(abono_display),   # Muestra todos los pagos recibidos en la columna Abonos
            'paid_balance': float(abono_balance),  # Solo para cálculo de balance (no expuesto al frontend)
            'maintenance': float(maint_charge),
            'status': eff_status,
            'payment_type': pay.payment_type if pay else None,
            'payment_date': str(pay.payment_date) if pay and pay.payment_date else None,
            'field_detail': field_detail,
            'maint_detail': {'charge': float(maint_charge), 'received': float(maint_received), 'adelanto': float(maint_adelanto), 'abono': float(maint_abono)},
            'pay': PaymentSerializer(pay).data if pay else None,
            'saldo_accum': float(saldo_acum),
        })

    total_charges = sum(r['charge'] for r in rows)
    total_paid_balance = sum(r['paid_balance'] for r in rows)   # Para cálculo correcto del saldo
    total_paid_display = sum(r['paid'] for r in rows)           # Todos los pagos recibidos (para mostrar)
    balance = total_charges - total_paid_balance

    return rows, float(total_charges), float(total_paid_display), float(balance), float(prev_debt_adeudo)


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

            for unit in units:
                rows, tc, tp, bal, pda = _compute_statement(tenant, str(unit.id), start_period, cutoff)
                # Apply same adjustment as unit detail: include previous_debt and credit_balance
                prev_debt = float(unit.previous_debt or 0)
                credit_bal = float(unit.credit_balance or 0)
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
        rows, total_charges, total_paid, balance, prev_debt_adeudo = _compute_statement(tenant, str(unit_id), start_period, cutoff)
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
            })

        prev_debt_adeudo_val = float(prev_debt_adeudo)
        net_prev_debt = max(0, previous_debt - prev_debt_adeudo_val)
        credit_balance = float(unit.credit_balance or 0)

        # Saldo final real: cargos de periodos + deuda previa - abonos de periodos
        #   - abonos a deuda previa - saldo a favor previo
        # El saldo a favor resta del total adeudado (cubre primero la deuda previa y
        # luego los cargos de los periodos si hubiera excedente)
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

    ingreso_mantenimiento = Decimal('0')       # Mantenimiento del período
    ingreso_maint_adelanto = Decimal('0')      # Mantenimiento adelantado (otros períodos)
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

        # Adeudo payments
        ap = pay.adeudo_payments or {}
        for _tp, field_map in ap.items():
            for f_id, amt in (field_map or {}).items():
                a3 = Decimal(str(amt or 0))
                if a3 > 0:
                    if f_id == 'maintenance':
                        from decimal import ROUND_FLOOR
                        int_a3 = a3.quantize(Decimal('1'), rounding=ROUND_FLOOR)
                        cm = a3 - int_a3
                        if cm > Decimal('0.001'):
                            ingreso_mantenimiento += int_a3
                            ingresos_referenciados += cm
                        else:
                            ingreso_mantenimiento += a3
                    else:
                        if f_id not in ingresos_conceptos:
                            cf3 = cf_map.get(f_id)
                            default_label = 'Recaudo de adeudos' if f_id == '__prevDebt' else f_id
                            ingresos_conceptos[f_id] = {'total': Decimal('0'), 'label': getattr(cf3, 'label', default_label) if cf3 else default_label}
                        ingresos_conceptos[f_id]['total'] += a3

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
        entry = {'label': label, 'amount': float(amt), 'provider': g.provider_name or ''}
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

    total_ingresos = ingreso_mantenimiento + ingreso_maint_adelanto + ingresos_referenciados + sum(
        x['total'] for x in ingresos_conceptos.values()
    ) + ingresos_no_identificados

    return {
        'ingreso_mantenimiento': float(ingreso_mantenimiento),
        'ingreso_maint_adelanto': float(ingreso_maint_adelanto),
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

        for unit in units:
            rows, tc, tp, bal, prev_debt_adeudo = _compute_statement(
                tenant, str(unit.id), start_period, cutoff
            )
            previous_debt = Decimal(str(unit.previous_debt or 0))
            credit_balance = Decimal(str(unit.credit_balance or 0))
            prev_debt_adeudo_dec = Decimal(str(prev_debt_adeudo))

            # Saldo ajustado igual que EstadoCuentaView (lista por unidad)
            adj_bal = Decimal(str(bal)) + previous_debt - prev_debt_adeudo_dec - credit_balance
            total_adeudo = max(Decimal('0'), adj_bal)

            net_prev_debt = max(
                Decimal('0'),
                previous_debt - prev_debt_adeudo_dec - credit_balance
            )

            # Períodos con déficit — usamos paid_balance (no el display) para el cálculo correcto
            period_debts = []
            for row in rows:
                paid_bal = Decimal(str(row.get('paid_balance', row['paid'])))
                deficit = Decimal(str(row['charge'])) - paid_bal
                if deficit > Decimal('0'):
                    period_debts.append({
                        'period': row['period'],
                        'charge': float(row['charge']),
                        'paid': float(row['paid']),           # display (incluye neutros)
                        'paid_balance': float(paid_bal),     # para cálculo de saldo
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

        if not unit_id:
            return Response({'detail': 'Falta unit_id.'}, status=status.HTTP_400_BAD_REQUEST)

        unit = Unit.objects.filter(tenant_id=tenant_id, id=unit_id).first()
        if not unit:
            return Response({'detail': 'Unidad no encontrada.'}, status=status.HTTP_404_NOT_FOUND)

        emails = []
        if recipients in ('owner', 'both') and (unit.owner_email or '').strip():
            emails.append(unit.owner_email.strip())
        if recipients in ('tenant', 'both') and (unit.tenant_email or '').strip():
            emails.append(unit.tenant_email.strip())

        if not emails:
            return Response(
                {'detail': 'No hay correo electrónico configurado para esta unidad.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        tenant = Tenant.objects.get(id=tenant_id)
        start_period = from_period or tenant.operation_start_date or '2024-01'

        rows, total_charges, total_paid, balance, prev_debt_adeudo = _compute_statement(
            tenant, str(unit_id), start_period, to_period
        )
        # Adjust balance like EstadoCuentaView does
        prev_debt = float(unit.previous_debt or 0)
        credit_bal = float(unit.credit_balance or 0)
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
        if not unit:
            return Response(
                {'detail': 'Tu usuario no tiene una unidad asignada. Contacta al administrador.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user_email = (request.user.email or '').strip().lower()
        if not user_email:
            return Response(
                {'detail': 'Tu usuario no tiene un correo electrónico registrado.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        tenant = Tenant.objects.get(id=tenant_id)
        start_period = from_period or tenant.operation_start_date or '2024-01'

        rows, total_charges, total_paid, balance, prev_debt_adeudo = _compute_statement(
            tenant, str(unit.id), start_period, to_period
        )
        prev_debt  = float(unit.previous_debt  or 0)
        credit_bal = float(unit.credit_balance or 0)
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

        for unit in units:
            rows, tc, tp, bal, pda = _compute_statement(tenant, str(unit.id), start_period, cutoff)
            prev_debt = float(unit.previous_debt or 0)
            credit_bal = float(unit.credit_balance or 0)
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

        tenant = Tenant.objects.get(id=tenant_id)
        start_period = tenant.operation_start_date or '2024-01'

        # Build unit data
        units = Unit.objects.filter(tenant_id=tenant_id).order_by('unit_id_code')
        unit_rows = []
        total_cargo_all = Decimal('0')
        total_abono_all = Decimal('0')
        total_deuda_all = Decimal('0')
        con_adeudo = 0

        for unit in units:
            rows, tc, tp, bal, pda = _compute_statement(tenant, str(unit.id), start_period, cutoff)
            prev_debt = float(unit.previous_debt or 0)
            credit_bal = float(unit.credit_balance or 0)
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
            serializer.save()
            return Response(
                {'message': 'Solicitud recibida. Nos pondremos en contacto pronto.'},
                status=status.HTTP_201_CREATED,
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
