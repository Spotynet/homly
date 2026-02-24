"""
Homly — REST API Serializers
"""
from rest_framework import serializers
from django.contrib.auth import authenticate
from .models import (
    User, Tenant, TenantUser, Unit, ExtraField,
    Payment, FieldPayment, GastoEntry, CajaChicaEntry,
    BankStatement, ClosedPeriod, ReopenRequest,
    AssemblyPosition, Committee, UnrecognizedIncome,
)


# ═══════════════════════════════════════════════════════════
#  AUTH
# ═══════════════════════════════════════════════════════════

class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)
    tenant_id = serializers.UUIDField(required=False, allow_null=True)

    def validate(self, data):
        email = data['email'].lower()
        password = data['password']
        tenant_id = data.get('tenant_id')

        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            raise serializers.ValidationError('Credenciales inválidas.')

        if not user.check_password(password):
            raise serializers.ValidationError('Credenciales inválidas.')

        if not user.is_active:
            raise serializers.ValidationError('Cuenta desactivada.')

        # Super admin can log in without tenant
        if user.is_super_admin:
            data['user'] = user
            data['role'] = 'superadmin'
            data['tenant'] = None
            return data

        # Tenant-scoped login
        if not tenant_id:
            raise serializers.ValidationError('Seleccione un condominio.')

        try:
            tenant_user = TenantUser.objects.select_related('tenant').get(
                user=user, tenant_id=tenant_id
            )
        except TenantUser.DoesNotExist:
            raise serializers.ValidationError('No tiene acceso a este condominio.')

        data['user'] = user
        data['role'] = tenant_user.role
        data['tenant'] = tenant_user.tenant
        data['tenant_user'] = tenant_user
        return data


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, min_length=6)

    def validate_current_password(self, value):
        if not self.context['request'].user.check_password(value):
            raise serializers.ValidationError('Contraseña actual incorrecta.')
        return value


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'email', 'name', 'is_super_admin', 'must_change_password',
                  'is_active', 'created_at']
        read_only_fields = ['id', 'created_at']


class UserCreateSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=6)
    role = serializers.ChoiceField(choices=TenantUser.ROLE_CHOICES, write_only=True)
    tenant_id = serializers.UUIDField(write_only=True)
    unit_id = serializers.UUIDField(required=False, allow_null=True, write_only=True)

    class Meta:
        model = User
        fields = ['id', 'email', 'name', 'password', 'role', 'tenant_id', 'unit_id']
        read_only_fields = ['id']

    def create(self, validated_data):
        role = validated_data.pop('role')
        tenant_id = validated_data.pop('tenant_id')
        unit_id = validated_data.pop('unit_id', None)
        password = validated_data.pop('password')

        user = User.objects.create_user(password=password, **validated_data)
        user.must_change_password = True
        user.save()

        TenantUser.objects.create(
            user=user,
            tenant_id=tenant_id,
            role=role,
            unit_id=unit_id,
        )
        return user


# ═══════════════════════════════════════════════════════════
#  TENANT
# ═══════════════════════════════════════════════════════════

class TenantListSerializer(serializers.ModelSerializer):
    units_actual = serializers.IntegerField(source='units.count', read_only=True)
    users_count = serializers.IntegerField(source='tenant_users.count', read_only=True)

    class Meta:
        model = Tenant
        fields = ['id', 'name', 'units_count', 'units_actual', 'users_count',
                  'maintenance_fee', 'currency', 'country', 'state', 'created_at']


class TenantDetailSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tenant
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'updated_at']


class TenantUserSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source='user.name', read_only=True)
    user_email = serializers.CharField(source='user.email', read_only=True)
    unit_code = serializers.CharField(source='unit.unit_id_code', read_only=True,
                                       default=None)

    class Meta:
        model = TenantUser
        fields = ['id', 'user', 'user_name', 'user_email', 'role', 'unit',
                  'unit_code', 'created_at']
        read_only_fields = ['id', 'created_at']


# ═══════════════════════════════════════════════════════════
#  UNIT
# ═══════════════════════════════════════════════════════════

class UnitSerializer(serializers.ModelSerializer):
    responsible_name = serializers.ReadOnlyField()

    class Meta:
        model = Unit
        fields = ['id', 'tenant', 'unit_name', 'unit_id_code',
                  'owner_first_name', 'owner_last_name', 'owner_email', 'owner_phone',
                  'occupancy', 'tenant_first_name', 'tenant_last_name',
                  'tenant_email', 'tenant_phone', 'responsible_name',
                  'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']


# ═══════════════════════════════════════════════════════════
#  EXTRA FIELDS
# ═══════════════════════════════════════════════════════════

class ExtraFieldSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExtraField
        fields = ['id', 'tenant', 'label', 'default_amount', 'required',
                  'enabled', 'cross_unit', 'field_type', 'sort_order',
                  'is_system_default', 'created_at']
        read_only_fields = ['id', 'created_at']


# ═══════════════════════════════════════════════════════════
#  PAYMENTS
# ═══════════════════════════════════════════════════════════

class FieldPaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = FieldPayment
        fields = ['id', 'field_key', 'received', 'target_unit', 'adelanto_targets']
        read_only_fields = ['id']


class PaymentSerializer(serializers.ModelSerializer):
    field_payments = FieldPaymentSerializer(many=True, read_only=True)
    unit_code = serializers.CharField(source='unit.unit_id_code', read_only=True)
    unit_name = serializers.CharField(source='unit.unit_name', read_only=True)
    responsible = serializers.CharField(source='unit.responsible_name', read_only=True)

    class Meta:
        model = Payment
        fields = ['id', 'tenant', 'unit', 'unit_code', 'unit_name', 'responsible',
                  'period', 'status', 'payment_type', 'payment_date', 'notes',
                  'evidence', 'adeudo_payments', 'field_payments',
                  'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']


class PaymentCaptureSerializer(serializers.Serializer):
    """Serializer for capturing/updating a payment with field payments."""
    unit_id = serializers.UUIDField()
    period = serializers.CharField(max_length=7)
    payment_type = serializers.ChoiceField(choices=Payment.PAYMENT_TYPE_CHOICES)
    payment_date = serializers.DateField(required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True, default='')
    evidence = serializers.CharField(required=False, allow_blank=True, default='')
    field_payments = serializers.DictField(child=serializers.DictField(), required=False)
    adeudo_payments = serializers.DictField(required=False, default=dict)


# ═══════════════════════════════════════════════════════════
#  GASTOS
# ═══════════════════════════════════════════════════════════

class GastoEntrySerializer(serializers.ModelSerializer):
    field_label = serializers.CharField(source='field.label', read_only=True, default='')

    class Meta:
        model = GastoEntry
        fields = ['id', 'tenant', 'period', 'field', 'field_label', 'amount',
                  'payment_type', 'doc_number', 'gasto_date', 'provider_name',
                  'provider_rfc', 'provider_invoice', 'bank_reconciled', 'evidence',
                  'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']


# ═══════════════════════════════════════════════════════════
#  CAJA CHICA
# ═══════════════════════════════════════════════════════════

class CajaChicaEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = CajaChicaEntry
        fields = ['id', 'tenant', 'period', 'amount', 'description',
                  'date', 'payment_type', 'created_at']
        read_only_fields = ['id', 'created_at']


# ═══════════════════════════════════════════════════════════
#  BANK / PERIODS / ASSEMBLY
# ═══════════════════════════════════════════════════════════

class BankStatementSerializer(serializers.ModelSerializer):
    class Meta:
        model = BankStatement
        fields = ['id', 'tenant', 'period', 'file_data', 'uploaded_at']
        read_only_fields = ['id', 'uploaded_at']


class ClosedPeriodSerializer(serializers.ModelSerializer):
    closed_by_name = serializers.CharField(source='closed_by.name', read_only=True,
                                            default=None)

    class Meta:
        model = ClosedPeriod
        fields = ['id', 'tenant', 'period', 'closed_at', 'closed_by', 'closed_by_name']
        read_only_fields = ['id', 'closed_at']


class ReopenRequestSerializer(serializers.ModelSerializer):
    requested_by_name = serializers.CharField(source='requested_by.name', read_only=True)

    class Meta:
        model = ReopenRequest
        fields = ['id', 'tenant', 'period', 'requested_by', 'requested_by_name',
                  'reason', 'status', 'resolved_by', 'created_at', 'resolved_at']
        read_only_fields = ['id', 'created_at', 'resolved_at']


class AssemblyPositionSerializer(serializers.ModelSerializer):
    class Meta:
        model = AssemblyPosition
        fields = ['id', 'tenant', 'title', 'holder_name', 'holder_unit',
                  'active', 'sort_order', 'created_at']
        read_only_fields = ['id', 'created_at']


class CommitteeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Committee
        fields = ['id', 'tenant', 'name', 'description', 'members', 'created_at']
        read_only_fields = ['id', 'created_at']


class UnrecognizedIncomeSerializer(serializers.ModelSerializer):
    class Meta:
        model = UnrecognizedIncome
        fields = ['id', 'tenant', 'period', 'amount', 'description', 'date', 'created_at']
        read_only_fields = ['id', 'created_at']


# ═══════════════════════════════════════════════════════════
#  DASHBOARD / REPORTS
# ═══════════════════════════════════════════════════════════

class DashboardSerializer(serializers.Serializer):
    """Read-only serializer for dashboard data."""
    total_units = serializers.IntegerField()
    units_planned = serializers.IntegerField()
    rented_count = serializers.IntegerField()
    total_collected = serializers.FloatField()
    total_expected = serializers.FloatField()
    collection_rate = serializers.FloatField()
    paid_count = serializers.IntegerField()
    partial_count = serializers.IntegerField()
    pending_count = serializers.IntegerField()
    total_gastos = serializers.FloatField()
    total_caja_chica = serializers.FloatField()
    maintenance_fee = serializers.FloatField()
    period = serializers.CharField()


class EstadoCuentaSerializer(serializers.Serializer):
    """Read-only serializer for account statement."""
    unit = UnitSerializer()
    periods = serializers.ListField()
    total_charges = serializers.DecimalField(max_digits=14, decimal_places=2)
    total_payments = serializers.DecimalField(max_digits=14, decimal_places=2)
    balance = serializers.DecimalField(max_digits=14, decimal_places=2)
