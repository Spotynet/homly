"""
Homly — API Views
All endpoints for the property management system.
"""
import uuid
from decimal import Decimal
from django.db.models import Sum, Count, Q, F  # noqa: F401 - Q used in estado cuenta
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
)
from .serializers import (
    LoginSerializer, ChangePasswordSerializer, UserSerializer, UserCreateSerializer,
    TenantListSerializer, TenantDetailSerializer, TenantUserSerializer,
    UnitSerializer, ExtraFieldSerializer,
    PaymentSerializer, PaymentCaptureSerializer, AddAdditionalPaymentSerializer, FieldPaymentSerializer,
    GastoEntrySerializer, CajaChicaEntrySerializer,
    BankStatementSerializer, ClosedPeriodSerializer, ReopenRequestSerializer,
    AssemblyPositionSerializer, CommitteeSerializer, UnrecognizedIncomeSerializer,
    DashboardSerializer,
)
from .permissions import IsSuperAdmin, IsTenantAdmin, IsTenantMember, IsAdminOrTesorero


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


class ChangePasswordView(APIView):
    """POST /api/auth/change-password/"""

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data,
                                               context={'request': request})
        serializer.is_valid(raise_exception=True)
        request.user.set_password(serializer.validated_data['new_password'])
        request.user.must_change_password = False
        request.user.save()
        return Response({'detail': 'Contraseña actualizada.'})


class TenantListForLoginView(APIView):
    """GET /api/auth/tenants/ — List tenants for login dropdown"""
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        tenants = Tenant.objects.all().values('id', 'name')
        return Response(list(tenants))


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
    serializer_class = UnitSerializer
    permission_classes = [IsTenantMember]

    def get_queryset(self):
        return Unit.objects.filter(tenant_id=self.kwargs['tenant_id'])

    def perform_create(self, serializer):
        serializer.save(tenant_id=self.kwargs['tenant_id'])


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
    'parcial' = mantenimiento fijo sin captura + al menos un campo adicional activo con pago.
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

    # Exenta sin pagos en campos adicionales: tipo 'excento' → pagado directamente
    if is_exempt and payment.payment_type == 'excento' and not has_non_maintenance_payment:
        return 'pagado'

    if total_req_received >= total_req_charge:
        return 'pagado'
    if maint_captured == 0 and has_non_maintenance_payment:
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
                'evidence': data.get('evidence', ''),
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


# ═══════════════════════════════════════════════════════════
#  GASTOS
# ═══════════════════════════════════════════════════════════

class GastoEntryViewSet(viewsets.ModelViewSet):
    """CRUD /api/tenants/{tenant_id}/gasto-entries/"""
    serializer_class = GastoEntrySerializer
    permission_classes = [IsAdminOrTesorero]

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
    permission_classes = [IsAdminOrTesorero]

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

        # Deuda total = suma de previous_debt de todas las unidades del tenant
        deuda_total = units.aggregate(total=Sum('previous_debt'))['total'] or Decimal('0')

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

    for p in payments_qs:
        fp_map = {fp.field_key: fp for fp in p.field_payments.all()}
        for field_key, fp in fp_map.items():
            at = fp.adelanto_targets or {}
            for target_period, amt in at.items():
                if target_period not in adelanto_credits:
                    adelanto_credits[target_period] = {}
                adelanto_credits[target_period][field_key] = adelanto_credits[target_period].get(field_key, Decimal('0')) + Decimal(str(amt or 0))

        ap = p.adeudo_payments or {}
        for target_p, field_map in ap.items():
            total = sum(Decimal(str(v or 0)) for v in (field_map or {}).values())
            if target_p == '__prevDebt':
                prev_debt_adeudo += total
            else:
                adeudo_credits_received[target_p] = adeudo_credits_received.get(target_p, Decimal('0')) + total

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

        oblig_abono = maint_abono + sum((fd['abono'] for fd in field_detail if fd.get('required')), 0)
        oblig_abono = Decimal(str(oblig_abono)) if not isinstance(oblig_abono, Decimal) else oblig_abono
        oblig_abono_capped = min(oblig_abono, cargo_oblig) if cargo_oblig > 0 else oblig_abono

        # Parcial: mantenimiento fijo sin abono + al menos un campo adicional activo con abono
        has_non_maint_abono = any(
            fd['abono'] > 0 for fd in field_detail if fd.get('id') != 'maintenance'
        )

        is_past = period <= today
        if pay:
            eff_status = pay.status
        else:
            eff_status = 'pendiente' if is_past else 'futuro'

        if is_exempt and cargo_oblig == Decimal('0'):
            # Período completamente exento sin campos adicionales obligatorios → pagado
            eff_status = 'pagado'
        elif cargo_oblig > 0 and oblig_abono_capped >= cargo_oblig:
            eff_status = 'pagado'
        elif maint_abono == Decimal('0') and has_non_maint_abono:
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
