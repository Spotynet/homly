"""
Homly — REST API Serializers
"""
import json
from rest_framework import serializers
from django.contrib.auth import authenticate
from .models import (
    User, Tenant, TenantUser, Unit, ExtraField,
    Payment, FieldPayment, GastoEntry, CajaChicaEntry,
    BankStatement, ClosedPeriod, ReopenRequest,
    PeriodClosureRequest, PeriodClosureStep,
    AssemblyPosition, Committee, UnrecognizedIncome,
    AmenityReservation, CondominioRequest, Notification,
    AuditLog,
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
                    tenant = Tenant.objects.get(id=str(tenant_id))
                except Tenant.DoesNotExist:
                    raise serializers.ValidationError('Condominio no encontrado.')
            data['user']   = user
            data['role']   = 'superadmin'
            data['tenant'] = tenant
            return data

        # Regular user — use the selected tenant_id, or fall back to first assigned
        user_tenants = TenantUser.objects.select_related('tenant').filter(user=user)
        if not user_tenants.exists():
            raise serializers.ValidationError(
                'Este usuario no tiene acceso a ningún condominio.'
            )

        if tenant_id:
            try:
                tenant_user = user_tenants.get(tenant_id=str(tenant_id))
            except TenantUser.DoesNotExist:
                raise serializers.ValidationError(
                    'No tienes acceso a este condominio.'
                )
        else:
            tenant_user = user_tenants.first()

        data['user']        = user
        data['role']        = tenant_user.role
        data['tenant']      = tenant_user.tenant
        data['tenant_user'] = tenant_user
        data['profile_id']  = tenant_user.profile_id
        return data


class RequestCodeSerializer(serializers.Serializer):
    """Request a verification code to be sent to the email."""
    email = serializers.EmailField()

    def validate_email(self, value):
        email = value.strip().lower()
        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            raise serializers.ValidationError(
                'No existe ninguna cuenta con este correo.'
            )
        if not user.is_active:
            raise serializers.ValidationError('Cuenta desactivada.')
        return email


class LoginWithCodeSerializer(serializers.Serializer):
    """Login using email + verification code instead of password."""
    email     = serializers.EmailField()
    code      = serializers.CharField(max_length=8, trim_whitespace=True)
    tenant_id = serializers.UUIDField(required=False, allow_null=True)

    def validate(self, data):
        from django.utils import timezone
        from .models import EmailVerificationCode
        from .models import Tenant, TenantUser

        email     = data['email'].strip().lower()
        code      = (data['code'] or '').strip()
        tenant_id = data.get('tenant_id')

        if not code:
            raise serializers.ValidationError({'code': 'Ingresa el código.'})

        # Find valid, unused, non-expired code
        now = timezone.now()
        try:
            rec = EmailVerificationCode.objects.get(
                email=email,
                code=code,
                used=False,
                expires_at__gt=now,
            )
        except EmailVerificationCode.DoesNotExist:
            raise serializers.ValidationError(
                {'code': 'Código inválido o expirado. Solicita uno nuevo.'}
            )

        rec.used = True
        rec.save(update_fields=['used'])

        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            raise serializers.ValidationError('Usuario no encontrado.')

        if not user.is_active:
            raise serializers.ValidationError('Cuenta desactivada.')

        # Same tenant logic as LoginSerializer
        if user.is_super_admin:
            tenant = None
            if tenant_id:
                try:
                    tenant = Tenant.objects.get(id=str(tenant_id))
                except Tenant.DoesNotExist:
                    raise serializers.ValidationError(
                        {'tenant_id': 'Condominio no encontrado.'}
                    )
            data['user']   = user
            data['role']   = 'superadmin'
            data['tenant'] = tenant
            return data

        user_tenants = TenantUser.objects.select_related('tenant').filter(user=user)
        if not user_tenants.exists():
            raise serializers.ValidationError(
                'Este usuario no tiene acceso a ningún condominio.'
            )

        if tenant_id:
            try:
                tenant_user = user_tenants.get(tenant_id=str(tenant_id))
            except TenantUser.DoesNotExist:
                raise serializers.ValidationError(
                    {'tenant_id': 'No tienes acceso a este condominio.'}
                )
        else:
            tenant_user = user_tenants.first()

        data['user']        = user
        data['role']        = tenant_user.role
        data['tenant']      = tenant_user.tenant
        data['tenant_user'] = tenant_user
        data['profile_id']  = tenant_user.profile_id
        return data


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
    role      = serializers.ChoiceField(choices=TenantUser.ROLE_CHOICES, write_only=True)
    tenant_id = serializers.UUIDField(write_only=True)
    unit_id   = serializers.UUIDField(required=False, allow_null=True, write_only=True)

    class Meta:
        model = User
        fields = ['id', 'email', 'name', 'role', 'tenant_id', 'unit_id']
        read_only_fields = ['id']
        extra_kwargs = {'name': {'required': False, 'allow_blank': True}}

    def create(self, validated_data):
        import secrets
        role      = validated_data.pop('role')
        tenant_id = validated_data.pop('tenant_id')
        unit_id   = validated_data.pop('unit_id', None)
        email     = validated_data.get('email', '').lower()

        # ── Existing user: just associate with the tenant ─────────────────
        try:
            user = User.objects.get(email=email)
            if TenantUser.objects.filter(user=user, tenant_id=tenant_id).exists():
                raise serializers.ValidationError(
                    'Este usuario ya tiene acceso a este condominio.'
                )
        except User.DoesNotExist:
            # ── New user: require name; auto-generate password (login is via email code) ──
            if not validated_data.get('name'):
                raise serializers.ValidationError(
                    {'name': 'El nombre es obligatorio para nuevos usuarios.'}
                )
            validated_data['email'] = email
            auto_password = secrets.token_urlsafe(24)
            user = User.objects.create_user(password=auto_password, **validated_data)
            user.must_change_password = False
            user.save()

        tenant_user = TenantUser.objects.create(
            user=user,
            tenant_id=tenant_id,
            role=role,
            unit_id=unit_id,
        )

        # Enviar email de bienvenida al nuevo usuario (no bloquea si falla)
        try:
            from .email_service import send_welcome_invitation
            from .models import Tenant, Unit
            tenant = Tenant.objects.get(id=tenant_id)
            unit_name = None
            if unit_id:
                unit_obj = Unit.objects.filter(id=unit_id).first()
                if unit_obj:
                    parts = [p for p in [unit_obj.unit_id_code, unit_obj.unit_name] if p]
                    unit_name = ' — '.join(parts) if parts else None
            send_welcome_invitation(
                email=user.email,
                user_name=user.name or user.email,
                tenant_name=tenant.name,
                role=role,
                unit_name=unit_name,
            )
        except Exception:
            pass  # El email es opcional — la creación del usuario no debe fallar

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
    user_name             = serializers.CharField(source='user.name',                 read_only=True)
    user_email            = serializers.CharField(source='user.email',                read_only=True)
    unit_code             = serializers.CharField(source='unit.unit_id_code',         read_only=True, default=None)
    must_change_password  = serializers.BooleanField(source='user.must_change_password', read_only=True)
    is_active             = serializers.BooleanField(source='user.is_active',         read_only=True)
    profile_label         = serializers.SerializerMethodField()
    profile_color         = serializers.SerializerMethodField()

    def _find_profile(self, obj):
        """Look up the custom profile entry from the tenant's custom_profiles list."""
        if not obj.profile_id:
            return None
        profiles = (obj.tenant.custom_profiles or []) if obj.tenant else []
        for p in profiles:
            if str(p.get('id', '')) == str(obj.profile_id):
                return p
        return None

    def get_profile_label(self, obj):
        profile = self._find_profile(obj)
        return profile['label'] if profile else None

    def get_profile_color(self, obj):
        profile = self._find_profile(obj)
        return profile['color'] if profile else None

    class Meta:
        model = TenantUser
        fields = ['id', 'user', 'user_name', 'user_email', 'role', 'unit',
                  'unit_code', 'must_change_password', 'is_active',
                  'profile_id', 'profile_label', 'profile_color', 'created_at']
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
                  'coowner_first_name', 'coowner_last_name', 'coowner_email', 'coowner_phone',
                  'occupancy', 'tenant_first_name', 'tenant_last_name',
                  'tenant_email', 'tenant_phone', 'responsible_name',
                  'admin_exempt', 'previous_debt', 'has_evidence',
                  'credit_balance', 'is_active',
                  'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']


class UnitSerializer(serializers.ModelSerializer):
    """Serializer completo — incluye previous_debt_evidence (Base64 PDF)."""
    responsible_name = serializers.ReadOnlyField()

    class Meta:
        model = Unit
        fields = ['id', 'tenant', 'unit_name', 'unit_id_code',
                  'owner_first_name', 'owner_last_name', 'owner_email', 'owner_phone',
                  'coowner_first_name', 'coowner_last_name', 'coowner_email', 'coowner_phone',
                  'occupancy', 'tenant_first_name', 'tenant_last_name',
                  'tenant_email', 'tenant_phone', 'responsible_name',
                  'admin_exempt', 'previous_debt', 'previous_debt_evidence',
                  'credit_balance', 'is_active',
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


def _parse_evidence(raw):
    """Normalise the evidence TextField to a list of {data, mime, name} dicts.
    Handles: empty string, legacy single-base64 string, and JSON array string."""
    if not raw:
        return []
    stripped = raw.strip()
    if stripped.startswith('['):
        try:
            return json.loads(stripped)
        except (json.JSONDecodeError, ValueError):
            pass
    # Legacy: plain base64 string — wrap as single-item list
    return [{'data': stripped, 'mime': '', 'name': 'Evidencia adjunta'}]


class PaymentSerializer(serializers.ModelSerializer):
    field_payments = FieldPaymentSerializer(many=True, read_only=True)
    additional_payments = serializers.JSONField(read_only=True)
    unit_code = serializers.CharField(source='unit.unit_id_code', read_only=True)
    unit_name = serializers.CharField(source='unit.unit_name', read_only=True)
    responsible = serializers.CharField(source='unit.responsible_name', read_only=True)
    evidence = serializers.SerializerMethodField()

    def get_evidence(self, obj):
        return _parse_evidence(obj.evidence)

    class Meta:
        model = Payment
        fields = ['id', 'tenant', 'unit', 'unit_code', 'unit_name', 'responsible',
                  'period', 'status', 'payment_type', 'payment_date', 'notes', 'folio',
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
    folio = serializers.CharField(required=False, allow_blank=True, default='')
    evidence = serializers.ListField(child=serializers.DictField(), required=False, default=list)
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


class PeriodClosureStepSerializer(serializers.ModelSerializer):
    approver_name = serializers.CharField(source='approver.name', read_only=True, default=None)
    approver_email = serializers.CharField(source='approver.email', read_only=True, default=None)

    class Meta:
        model  = PeriodClosureStep
        fields = ['id', 'order', 'approver', 'approver_name', 'approver_email',
                  'label', 'status', 'actioned_at', 'notes']
        read_only_fields = ['id', 'actioned_at']


class PeriodClosureRequestSerializer(serializers.ModelSerializer):
    steps              = PeriodClosureStepSerializer(many=True, read_only=True)
    initiated_by_name  = serializers.CharField(source='initiated_by.name', read_only=True, default=None)

    class Meta:
        model  = PeriodClosureRequest
        fields = ['id', 'tenant', 'period', 'initiated_by', 'initiated_by_name',
                  'status', 'notes', 'created_at', 'completed_at', 'steps']
        read_only_fields = ['id', 'created_at', 'completed_at', 'status']


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


# ═══════════════════════════════════════════════════════════
#  NOTIFICATIONS
# ═══════════════════════════════════════════════════════════

class NotificationSerializer(serializers.ModelSerializer):
    notif_type_label = serializers.SerializerMethodField()

    class Meta:
        model  = Notification
        fields = [
            'id', 'notif_type', 'notif_type_label',
            'title', 'message', 'is_read',
            'related_reservation_id', 'created_at',
        ]
        read_only_fields = fields

    def get_notif_type_label(self, obj):
        return obj.get_notif_type_display()


# ═══════════════════════════════════════════════════════════
#  CONDOMINIO REQUEST (Landing page lead form)
# ═══════════════════════════════════════════════════════════

class CondominioRequestSerializer(serializers.ModelSerializer):
    class Meta:
        model  = CondominioRequest
        fields = [
            'id',
            'condominio_nombre', 'condominio_pais', 'condominio_estado',
            'condominio_ciudad', 'condominio_unidades', 'condominio_tipo_admin',
            'condominio_currency',
            'admin_nombre', 'admin_apellido', 'admin_email',
            'admin_telefono', 'admin_cargo',
            'mensaje',
            'status', 'created_at',
        ]
        read_only_fields = ['id', 'status', 'created_at']

    def validate_admin_email(self, value):
        return value.lower().strip()

    def validate_condominio_nombre(self, value):
        if not value.strip():
            raise serializers.ValidationError('El nombre del condominio es requerido.')
        return value.strip()


# ═══════════════════════════════════════════════════════════
#  AUDIT LOG
# ═══════════════════════════════════════════════════════════

class AuditLogSerializer(serializers.ModelSerializer):
    module_label = serializers.SerializerMethodField()
    action_label = serializers.SerializerMethodField()

    class Meta:
        model  = AuditLog
        fields = [
            'id', 'created_at',
            'tenant_name', 'user_name', 'user_email', 'user_role',
            'module', 'module_label', 'action', 'action_label',
            'description', 'object_type', 'object_id', 'object_repr',
            'ip_address', 'extra_data',
        ]
        read_only_fields = fields

    def get_module_label(self, obj):
        return obj.get_module_display()

    def get_action_label(self, obj):
        return obj.get_action_display()

