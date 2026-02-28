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
    'parcial' = mantenimiento fijo sin captura + al menos un campo adicional activo con pago."""
    all_fp = {}
    for fp in payment.field_payments.all():
        all_fp[fp.field_key] = float(fp.received or 0)
    for ap in payment.additional_payments or []:
        for fk, data in (ap.get('field_payments') or {}).items():
            rec = float(data.get('received', 0) or 0)
            if rec > 0:
                all_fp[fk] = all_fp.get(fk, 0) + rec

    maint_charge = float(tenant.maintenance_fee or 0)
    maint_captured = all_fp.get('maintenance', 0)  # raw captured, not capped
    maint_rec = min(maint_captured, maint_charge)
    total_req_charge = maint_charge
    total_req_received = maint_rec
    for ef in extra_fields:
        ch = float(ef.default_amount or 0)
        rc = min(all_fp.get(str(ef.id), 0), ch)
        total_req_charge += ch
        total_req_received += rc

    # Parcial: mantenimiento fijo sin pago + al menos un campo adicional activo pagado
    has_non_maintenance_payment = any(v > 0 for k, v in all_fp.items() if k != 'maintenance')

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
    permission_classes = [IsTenantAdmin]

    def get_queryset(self):
        return AssemblyPosition.objects.filter(tenant_id=self.kwargs['tenant_id'])

    def perform_create(self, serializer):
        serializer.save(tenant_id=self.kwargs['tenant_id'])


class CommitteeViewSet(viewsets.ModelViewSet):
    serializer_class = CommitteeSerializer
    permission_classes = [IsTenantAdmin]

    def get_queryset(self):
        return Committee.objects.filter(tenant_id=self.kwargs['tenant_id'])

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

        # Total collected
        total_collected = FieldPayment.objects.filter(
            payment__tenant_id=tenant_id,
            payment__period=period,
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
        ingreso_adicional_fp = FieldPayment.objects.filter(
            payment__tenant_id=tenant_id,
            payment__period=period,
        ).exclude(field_key='maintenance').aggregate(total=Sum('received'))['total'] or Decimal('0')

        # Adeudo recibido este periodo (suma de adeudo_payments de todos los pagos del periodo)
        total_adeudo_recibido = Decimal('0')
        for p in payments:
            for period_debt in (p.adeudo_payments or {}).values():
                if isinstance(period_debt, dict):
                    for amt in period_debt.values():
                        total_adeudo_recibido += Decimal(str(amt or 0))

        # Ingresos adicionales netos (excluir adeudo)
        ingreso_adicional = max(Decimal('0'), ingreso_adicional_fp - total_adeudo_recibido)

        # Deuda total = suma de previous_debt de todas las unidades del tenant
        deuda_total = units.aggregate(total=Sum('previous_debt'))['total'] or Decimal('0')

        # Total ingresos del periodo = cobranza + adeudo recibido + ingreso adicional
        total_ingresos = total_collected + total_adeudo_recibido + ingreso_adicional

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
    opt_fields = [f for f in cob_fields if not f.required]

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
    saldo_acum = max(Decimal('0'), Decimal(str(previous_debt)) - prev_debt_adeudo - Decimal(str(credit_balance)))

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
        maint_received = Decimal(str(maint_fp.received or 0)) if maint_fp else Decimal('0')
        maint_adelanto = Decimal(str(ac.get('maintenance', 0))) if isinstance(ac.get('maintenance'), (int, float, str)) else Decimal(str(ac.get('maintenance', 0) or 0))
        maint_abono = maint_received + maint_adelanto

        total_cargo_req = maint_charge
        total_abono_req = maint_abono
        total_cargo_opt = Decimal('0')
        total_abono_opt = Decimal('0')

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
            charge = Decimal('0')  # Optional fields: charge from capture not stored in FieldPayment
            received = Decimal(str(field_fp.received or 0)) if field_fp else Decimal('0')
            adelanto = Decimal(str(ac.get(str(ef.id), 0))) if str(ef.id) in ac else Decimal('0')
            abono = received + adelanto
            total_cargo_opt += charge
            total_abono_opt += abono
            field_detail.append({'id': str(ef.id), 'label': ef.label, 'charge': float(charge), 'received': float(received), 'adelanto': float(adelanto), 'abono': float(abono), 'required': False})

        cargo_oblig = maint_charge + sum(Decimal(str(ef.default_amount or 0)) for ef in req_fields)
        cargo_opt = total_cargo_opt
        cargo_total = cargo_oblig + cargo_opt
        abono = total_abono_req + total_abono_opt

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
        if cargo_oblig > 0 and oblig_abono_capped >= cargo_oblig:
            eff_status = 'pagado'
        elif maint_abono == Decimal('0') and has_non_maint_abono:
            eff_status = 'parcial'
        elif is_past:
            eff_status = 'pendiente'
        else:
            eff_status = 'futuro'

        saldo_periodo = cargo_total - abono
        saldo_acum += saldo_periodo

        rows.append({
            'period': period,
            'charge': float(cargo_total),
            'paid': float(abono),
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
    total_paid = sum(r['paid'] for r in rows)
    balance = total_charges - total_paid

    return rows, float(total_charges), float(total_paid), float(balance), float(prev_debt_adeudo)


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
            for ui in UnrecognizedIncome.objects.filter(tenant_id=tenant_id, period__lte=cutoff, period__gte=start_period):
                total_ingresos_no_identificados += Decimal(str(ui.amount or 0))

            for unit in units:
                rows, tc, tp, bal, _pda = _compute_statement(tenant, str(unit.id), start_period, cutoff)
                total_cargo += Decimal(str(tc))
                total_abono += Decimal(str(tp))
                deuda = max(Decimal('0'), Decimal(str(bal)))
                if deuda > 0:
                    con_adeudo += 1
                total_deuda += deuda

                unit_data.append({
                    'unit': UnitSerializer(unit).data,
                    'payment': None,
                    'total_charge': str(tc),
                    'total_paid': str(tp),
                    'balance': str(bal),
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

        return Response({
            'unit': UnitSerializer(unit).data,
            'periods': periods_out,
            'total_charges': str(total_charges),
            'total_payments': str(total_paid),
            'balance': str(balance),
            'currency': tenant.currency,
            'tenant_name': tenant.name,
            'previous_debt': float(previous_debt),
            'prev_debt_adeudo': prev_debt_adeudo_val,
            'net_prev_debt': net_prev_debt,
            'credit_balance': float(credit_balance),
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

            net_prev_debt = max(
                Decimal('0'),
                previous_debt - prev_debt_adeudo_dec - credit_balance
            )

            # Periods with outstanding debt (charge > paid)
            period_debts = []
            for row in rows:
                deficit = Decimal(str(row['charge'])) - Decimal(str(row['paid']))
                if deficit > Decimal('0'):
                    period_debts.append({
                        'period': row['period'],
                        'charge': float(row['charge']),
                        'paid': float(row['paid']),
                        'deficit': float(deficit),
                        'status': row['status'],
                        'maintenance': float(row['maintenance']),
                    })

            total_adeudo = net_prev_debt + sum(
                Decimal(str(pd['deficit'])) for pd in period_debts
            )

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
