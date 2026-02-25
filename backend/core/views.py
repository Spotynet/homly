"""
Homly — API Views
All endpoints for the property management system.
"""
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
    PaymentSerializer, PaymentCaptureSerializer, FieldPaymentSerializer,
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

        # Auto-compute status
        maint_charge = tenant.maintenance_fee
        maint_fp = field_payments_data.get('maintenance', {})
        maint_received = min(Decimal(str(maint_fp.get('received', 0))), maint_charge)

        total_req_charge = maint_charge
        total_req_received = maint_received

        extra_fields = ExtraField.objects.filter(
            tenant_id=tenant_id, enabled=True, required=True
        )
        for ef in extra_fields:
            charge = ef.default_amount
            fp = field_payments_data.get(str(ef.id), {})
            received = min(Decimal(str(fp.get('received', 0))), charge)
            total_req_charge += charge
            total_req_received += received

        if total_req_received <= 0:
            payment.status = 'pendiente'
        elif total_req_received >= total_req_charge:
            payment.status = 'pagado'
        else:
            payment.status = 'parcial'

        payment.save()

        return Response(
            PaymentSerializer(payment).data,
            status=status.HTTP_200_OK if not created else status.HTTP_201_CREATED
        )

    @action(detail=True, methods=['delete'], url_path='clear')
    def clear_payment(self, request, tenant_id=None, pk=None):
        """DELETE /api/tenants/{tenant_id}/payments/{id}/clear/"""
        payment = self.get_object()
        payment.field_payments.all().delete()
        payment.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


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
        return UnrecognizedIncome.objects.filter(tenant_id=self.kwargs['tenant_id'])

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

        payments = Payment.objects.filter(tenant_id=tenant_id, period=period)
        paid_count = payments.filter(status='pagado').count()
        partial_count = payments.filter(status='parcial').count()
        pending_count = max(0, total_units - paid_count - partial_count)

        # Total collected
        total_collected = FieldPayment.objects.filter(
            payment__tenant_id=tenant_id,
            payment__period=period,
        ).aggregate(total=Sum('received'))['total'] or Decimal('0')

        total_expected = tenant.maintenance_fee * total_units

        # Required extra fields
        req_fields = ExtraField.objects.filter(
            tenant_id=tenant_id, enabled=True, required=True
        )
        for ef in req_fields:
            total_expected += ef.default_amount * total_units

        collection_rate = (
            float(total_collected / total_expected * 100) if total_expected > 0 else 0
        )

        # Gastos
        total_gastos = GastoEntry.objects.filter(
            tenant_id=tenant_id, period=period
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0')

        total_caja = CajaChicaEntry.objects.filter(
            tenant_id=tenant_id, period=period
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0')

        rented_count = units.filter(occupancy='rentada').count()

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
            'total_gastos': float(total_gastos),
            'total_caja_chica': float(total_caja),
            'maintenance_fee': float(tenant.maintenance_fee),
            'period': period,
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

    saldo_acum = max(Decimal('0'), Decimal(str(previous_debt)) - prev_debt_adeudo)

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

        is_past = period <= today
        if pay:
            eff_status = pay.status
        else:
            eff_status = 'pendiente' if is_past else 'futuro'
        if cargo_oblig > 0 and oblig_abono_capped >= cargo_oblig:
            eff_status = 'pagado'
        elif oblig_abono > 0:
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

            for unit in units:
                rows, tc, tp, bal = _compute_statement(tenant, str(unit.id), start_period, cutoff)
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
                'total_abono': str(total_abono),
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
        })


# ═══════════════════════════════════════════════════════════
#  REPORTE GENERAL
# ═══════════════════════════════════════════════════════════

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

        # Payments for period
        payments = {
            p.unit_id: p for p in
            Payment.objects.filter(
                tenant_id=tenant_id, period=period
            ).prefetch_related('field_payments')
        }

        # Extra fields
        extra_fields = list(ExtraField.objects.filter(
            tenant_id=tenant_id, enabled=True
        ))

        # Gastos
        gastos = GastoEntry.objects.filter(
            tenant_id=tenant_id, period=period
        ).select_related('field')

        caja_chica = CajaChicaEntry.objects.filter(
            tenant_id=tenant_id, period=period
        )

        unit_data = []
        for unit in units:
            payment = payments.get(unit.id)
            fp_data = {}
            if payment:
                for fp in payment.field_payments.all():
                    fp_data[fp.field_key] = {
                        'received': str(fp.received),
                        'target_unit_id': str(fp.target_unit_id) if fp.target_unit_id else None,
                    }

            unit_data.append({
                'unit': UnitSerializer(unit).data,
                'payment': PaymentSerializer(payment).data if payment else None,
                'field_payments': fp_data,
            })

        return Response({
            'tenant': TenantDetailSerializer(tenant).data,
            'period': period,
            'units': unit_data,
            'extra_fields': ExtraFieldSerializer(extra_fields, many=True).data,
            'gastos': GastoEntrySerializer(gastos, many=True).data,
            'caja_chica': CajaChicaEntrySerializer(caja_chica, many=True).data,
            'is_closed': ClosedPeriod.objects.filter(
                tenant_id=tenant_id, period=period
            ).exists(),
        })
