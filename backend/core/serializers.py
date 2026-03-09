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
    AmenityReservation,
)


# ═══════════════════════════════════════════════════════════
#  AUTH
# ═══════════════════════════════════════════════════════════

class LoginSerializer(serializers.Serializer):
    email     = serializers.EmailField()
    password  = serializers.CharField(write_only=True)
    tenant_id = serializers.UUIDField(required=False, allow_null=True)

    def validate(self, data):
        email     = data['email'].lower()
        password  = data['password']
        tenant_id = data.get('tenant_id')

        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            raise serializers.ValidationError('Credenciales inválidas.')

        if not user.check_password(password):
            raise serializers.ValidationError('Credenciales inválidas.')

        if not user.is_active:
            raise serializers.ValidationError('Cuenta desactivada.')

        # Super admin — can log into any tenant (or none)
        if user.is_super_admin:
            tenant = None
            if tenant_id:
                try:
                    tenant = Tenant.objects.get(id=tenant_id)
                except Tenant.DoesNotExist:
                    raise serializers.ValidationError('Condominio no encontrado.')
            data['user']   = user
            data['role']   = 'superadmin'
            data['tenant'] = tenant
            return data

        # Regular user — use selected tenant_id, or auto-select the first one
        user_tenants = TenantUser.objects.select_related('tenant').filter(user=user)
        if not user_tenants.exists():
            raise serializers.ValidationError('Este usuario no tiene acceso a ningún condominio.')

        if tenant_id:
            try:
                tenant_user = user_tenants.get(tenant_id=tenant_id)
            except TenantUser.DoesNotExist:
                raise serializers.ValidationError('No tienes acceso a este condominio.')
        else:
            tenant_user = user_tenants.first()

        data['user']        = user
        data['role']        = tenant_user.role
        data['tenant']      = tenant_user.tenant
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
    # validators=[] removes the auto-generated UniqueValidator on email so we can
    # handle "existing user → just add to tenant" logic inside create().
    email     = serializers.EmailField(validators=[])
    password  = serializers.CharField(write_only=True, min_length=6, required=False, allow_blank=True)
    role      = serializers.ChoiceField(choices=TenantUser.ROLE_CHOICES, write_only=True)
    tenant_id = serializers.UUIDField(write_only=True)
    unit_id   = serializers.UUIDField(required=False, allow_null=True, write_only=True)

    class Meta:
        model = User
        fields = ['id', 'email', 'name', 'password', 'role', 'tenant_id', 'unit_id']
        read_only_fields = ['id']
        extra_kwargs = {'name': {'required': False, 'allow_blank': True}}

    def create(self, validated_data):
        role      = validated_data.pop('role')
        tenant_id = validated_data.pop('tenant_id')
        unit_id   = validated_data.pop('unit_id', None)
        password  = validated_data.pop('password', None)
        email     = validated_data.get('email', '').lower()

        # ── Existing user: just associate with the tenant ─────────────────
        try:
            user = User.objects.get(email=email)
            if TenantUser.objects.filter(user=user, tenant_id=tenant_id).exists():
                raise serializers.ValidationError(
                    'Este usuario ya tiene acceso a este condominio.'
                )
        except User.DoesNotExist:
            # ── New user: require name + password ────────────────────────
            if not password:
                raise serializers.ValidationError(
                    {'password': 'La contraseña es obligatoria para nuevos usuarios.'}
                )
            if not validated_data.get('name'):
                raise serializers.ValidationError(
                    {'name': 'El nombre es obligatorio para nuevos usuarios.'}
                )
            validated_data['email'] = email
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

class UnitListSerializer(serializers.ModelSerializer):
    """Serializer ligero para el listado de unidades — excluye el Base64 de evidencia."""
    responsible_name = serializers.ReadOnlyField()
    has_evidence = serializers.SerializerMethodField()

    def get_has_evidence(self, obj):
        return bool(obj.previous_debt_evidence)

    class Meta:
        model = Unit
        fields = ['id', 'tenant', 'unit_name', 'unit_id_code',
                  'owner_first_name', 'owner_last_name', 'owner_email', 'owner_phone',
                  'occupancy', 'tenant_first_name', 'tenant_last_name',
                  'tenant_email', 'tenant_phone', 'responsible_name',
                  'admin_exempt', 'previous_debt', 'has_evidence',
                  'credit_balance',
                  'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']


class UnitSerializer(serializers.ModelSerializer):
    """Serializer completo — incluye previous_debt_evidence (Base64 PDF)."""
    responsible_name = serializers.ReadOnlyField()

    class Meta:
        model = Unit
        fields = ['id', 'tenant', 'unit_name', 'unit_id_code',
                  'owner_first_name', 'owner_last_name', 'owner_email', 'owner_phone',
                  'occupancy', 'tenant_first_name', 'tenant_last_name',
                  'tenant_email', 'tenant_phone', 'responsible_name',
                  'admin_exempt', 'previous_debt', 'previous_debt_evidence',
                  'credit_balance',
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
        # NOTE: show_in_normal, show_in_additional, show_in_gastos are intentionally
        # excluded here until migration 0014 is applied on the server.
        # After running: python manage.py migrate
        # Add them back to this fields list to enable the "Mostrar en formularios" feature.
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
    additional_payments = serializers.JSONField(read_only=True)
    unit_code = serializers.CharField(source='unit.unit_id_code', read_only=True)
    unit_name = serializers.CharField(source='unit.unit_name', read_only=True)
    responsible = serializers.CharField(source='unit.responsible_name', read_only=True)

    class Meta:
        model = Payment
        fields = ['id', 'tenant', 'unit', 'unit_code', 'unit_name', 'responsible',
                  'period', 'status', 'payment_type', 'payment_date', 'notes',
                  'evidence', 'bank_reconciled', 'adeudo_payments', 'field_payments', 'additional_payments',
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
    bank_reconciled = serializers.BooleanField(required=False, default=False)
    field_payments = serializers.DictField(child=serializers.DictField(), required=False)
    adeudo_payments = serializers.DictField(required=False, default=dict)


class AddAdditionalPaymentSerializer(serializers.Serializer):
    """Serializer for adding an extra payment event to an existing payment."""
    field_payments = serializers.DictField(child=serializers.DictField(), required=True)
    payment_type = serializers.ChoiceField(choices=Payment.PAYMENT_TYPE_CHOICES)
    payment_date = serializers.DateField(required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True, default='')
    bank_reconciled = serializers.BooleanField(required=False, default=False)


# ═══════════════════════════════════════════════════════════
#  GASTOS
# ═══════════════════════════════════════════════════════════

class GastoEntrySerializer(serializers.ModelSerializer):
    field_label = serializers.CharField(source='field.label', read_only=True, default='')

    class Meta:
        model = GastoEntry
        fields = ['id', 'tenant', 'period', 'field', 'field_label', 'amount',
                  'payment_type', 'doc_number', 'gasto_date', 'provider_name',
                  'provider_rfc', 'provider_invoice', 'bank_reconciled', 'notes', 'evidence',
                  'created_at', 'updated_at']
        read_only_fields = ['id', 'tenant', 'created_at', 'updated_at']


# ═══════════════════════════════════════════════════════════
#  CAJA CHICA
# ═══════════════════════════════════════════════════════════

class CajaChicaEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = CajaChicaEntry
        fields = ['id', 'tenant', 'period', 'amount', 'description',
                  'date', 'payment_type', 'created_at']
        read_only_fields = ['id', 'tenant', 'created_at']


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
    committee_id = serializers.PrimaryKeyRelatedField(
        queryset=Committee.objects.all(), source='committee', allow_null=True, required=False
    )

    class Meta:
        model = AssemblyPosition
        fields = ['id', 'tenant', 'title', 'holder_name', 'holder_unit', 'committee_id',
                  'email', 'phone', 'start_date', 'end_date', 'notes',
                  'active', 'sort_order', 'created_at']
        read_only_fields = ['id', 'created_at']


class AssemblyPositionBriefSerializer(serializers.ModelSerializer):
    """Serializer ligero para anidar posiciones dentro de un comité."""
    class Meta:
        model = AssemblyPosition
        fields = ['id', 'title', 'holder_name', 'email', 'phone', 'active', 'sort_order', 'notes']
        read_only_fields = ['id']


class CommitteeSerializer(serializers.ModelSerializer):
    positions = AssemblyPositionBriefSerializer(many=True, read_only=True)

    class Meta:
        model = Committee
        fields = ['id', 'tenant', 'name', 'description', 'exemption', 'members', 'positions', 'created_at']
        read_only_fields = ['id', 'created_at']


class UnrecognizedIncomeSerializer(serializers.ModelSerializer):
    class Meta:
        model = UnrecognizedIncome
        fields = ['id', 'tenant', 'period', 'amount', 'description', 'date', 'payment_type', 'notes', 'bank_reconciled', 'created_at']
        read_only_fields = ['id', 'tenant', 'created_at']


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
    total_gastos_conciliados = serializers.FloatField()
    total_caja_chica = serializers.FloatField()
    maintenance_fee = serializers.FloatField()
    period = serializers.CharField()
    ingreso_adicional = serializers.FloatField()
    total_adeudo_recibido = serializers.FloatField()
    deuda_total = serializers.FloatField()


class EstadoCuentaSerializer(serializers.Serializer):
    """Read-only serializer for account statement."""
    unit = UnitSerializer()
    periods = serializers.ListField()
    total_charges = serializers.DecimalField(max_digits=14, decimal_places=2)
    total_payments = serializers.DecimalField(max_digits=14, decimal_places=2)
    balance = serializers.DecimalField(max_digits=14, decimal_places=2)


# ═══════════════════════════════════════════════════════════
#  AMENITY RESERVATION
# ═══════════════════════════════════════════════════════════

class AmenityReservationSerializer(serializers.ModelSerializer):
    unit_name         = serializers.SerializerMethodField()
    unit_id_code      = serializers.SerializerMethodField()
    requested_by_name = serializers.SerializerMethodField()
    reviewed_by_name  = serializers.SerializerMethodField()

    class Meta:
        model  = AmenityReservation
        fields = '__all__'
        read_only_fields = ['id', 'tenant', 'unit', 'status',
                             'created_at', 'updated_at',
                             'requested_by', 'reviewed_by',
                             'unit_name', 'unit_id_code',
                             'requested_by_name', 'reviewed_by_name']

    def get_unit_name(self, obj):
        return obj.unit.unit_name if obj.unit else None

    def get_unit_id_code(self, obj):
        return obj.unit.unit_id_code if obj.unit else None

    def get_requested_by_name(self, obj):
        return obj.requested_by.name if obj.requested_by else None

    def get_reviewed_by_name(self, obj):
        return obj.reviewed_by.name if obj.reviewed_by else None
