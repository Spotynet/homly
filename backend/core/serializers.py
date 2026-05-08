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
    AuditLog, PaymentPlan, SubscriptionPlan, TenantSubscription,
    SubscriptionPayment,
    CRMContact, CRMOpportunity, CRMActivity,
    CRMCampaign, CRMCampaignContact, CRMTicket,
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


class SystemUserSerializer(serializers.ModelSerializer):
    """
    Serializer for Homly internal system staff users.
    Used by SystemUserViewSet (SuperAdmin only).
    """
    system_role_label = serializers.SerializerMethodField()
    allowed_tenants_data = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            'id', 'email', 'name', 'is_active',
            'system_role', 'system_role_label',
            'system_permissions', 'allowed_tenant_ids', 'allowed_tenants_data',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'system_role_label', 'allowed_tenants_data']

    def get_system_role_label(self, obj):
        # Legacy super admins (created before the system_role field was introduced)
        # have system_role=None but are full super admins — surface them as such.
        if not obj.system_role:
            return 'Super Administrador'
        return obj.get_system_role_display()

    def to_representation(self, instance):
        data = super().to_representation(instance)
        # Normalise legacy super admins: treat system_role=None as 'super_admin'
        # so the frontend renders their role card and permissions correctly.
        if not data.get('system_role') and instance.is_super_admin:
            data['system_role'] = 'super_admin'
        return data

    def get_allowed_tenants_data(self, obj):
        if not obj.allowed_tenant_ids:
            return []
        from .models import Tenant as _Tenant
        tenants = _Tenant.objects.filter(id__in=obj.allowed_tenant_ids).values('id', 'name')
        return [{'id': str(t['id']), 'name': t['name']} for t in tenants]


class SystemUserCreateSerializer(serializers.ModelSerializer):
    """
    Creates a new Homly internal staff user with system_role.
    Automatically sets is_super_admin=True so they can authenticate.
    """
    password = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = User
        fields = [
            'id', 'email', 'name',
            'system_role', 'system_permissions', 'allowed_tenant_ids',
            'password',
        ]
        read_only_fields = ['id']

    def validate_system_role(self, value):
        if not value:
            raise serializers.ValidationError('El rol de sistema es requerido.')
        return value

    def create(self, validated_data):
        import secrets
        raw_password = validated_data.pop('password', None)
        # If no password was provided, generate a secure temporary one and flag
        # the user so they are forced to change it on first login.
        auto_generated = not raw_password
        password = raw_password or secrets.token_urlsafe(12)
        email = validated_data.get('email', '').lower()
        validated_data['email'] = email
        # System staff users get is_super_admin=True so they can log in and
        # access the sistema section. Their actual access is gated by system_role
        # and system_permissions in the frontend and permission classes.
        validated_data['is_super_admin'] = True
        validated_data['is_staff'] = True
        # Force password change on first login when the password was auto-generated.
        validated_data['must_change_password'] = auto_generated
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        # Expose the generated password so the viewset can return it to the caller.
        user._temp_password = password if auto_generated else None
        return user


class UserCreateSerializer(serializers.ModelSerializer):
    # validators=[] removes the auto-generated UniqueValidator on email so we can
    # handle "existing user → just add to tenant" logic inside create().
    email      = serializers.EmailField(validators=[])
    role       = serializers.ChoiceField(choices=TenantUser.ROLE_CHOICES, write_only=True)
    tenant_id  = serializers.UUIDField(write_only=True)
    unit_id    = serializers.UUIDField(required=False, allow_null=True, write_only=True)
    # profile_id references a custom profile in tenant.custom_profiles.
    # When provided, the profile's base_role overrides the role field so the
    # user gets both the correct Django permission role AND the custom module
    # visibility configuration.
    profile_id = serializers.CharField(required=False, allow_blank=True, write_only=True, default='')

    class Meta:
        model = User
        fields = ['id', 'email', 'name', 'role', 'tenant_id', 'unit_id', 'profile_id']
        read_only_fields = ['id']
        extra_kwargs = {'name': {'required': False, 'allow_blank': True}}

    def create(self, validated_data):
        import secrets
        role       = validated_data.pop('role')
        tenant_id  = validated_data.pop('tenant_id')
        unit_id    = validated_data.pop('unit_id', None)
        profile_id = validated_data.pop('profile_id', '') or ''
        email      = validated_data.get('email', '').lower()

        # If a custom profile_id was provided, resolve its base_role so Django
        # permission checks use the correct built-in role.
        if profile_id:
            try:
                from .models import Tenant as _Tenant
                tenant_obj = _Tenant.objects.get(id=tenant_id)
                for p in (tenant_obj.custom_profiles or []):
                    if str(p.get('id', '')) == str(profile_id):
                        base = p.get('base_role')
                        if base:
                            role = base
                        break
            except Exception:
                pass  # Fall back to the role provided by the caller

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
            profile_id=profile_id,
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
    units_actual          = serializers.IntegerField(source='units.count', read_only=True)
    users_count           = serializers.IntegerField(source='tenant_users.count', read_only=True)
    subscription_status   = serializers.SerializerMethodField()
    subscription_plan_name = serializers.SerializerMethodField()
    subscription_trial_end = serializers.SerializerMethodField()

    class Meta:
        model = Tenant
        fields = [
            'id', 'name', 'units_count', 'units_actual', 'users_count',
            'maintenance_fee', 'currency', 'country', 'state',
            'is_active', 'hibernated', 'hibernation_reason', 'created_at',
            'subscription_status', 'subscription_plan_name', 'subscription_trial_end',
        ]

    def _sub(self, obj):
        try:
            return obj.subscription
        except Exception:
            return None

    def get_subscription_status(self, obj):
        sub = self._sub(obj)
        return sub.status if sub else None

    def get_subscription_plan_name(self, obj):
        sub = self._sub(obj)
        return sub.plan.name if sub and sub.plan else None

    def get_subscription_trial_end(self, obj):
        sub = self._sub(obj)
        return str(sub.trial_end) if sub and sub.trial_end else None


class TenantDetailSerializer(serializers.ModelSerializer):
    subscription_allowed_modules = serializers.SerializerMethodField()
    subscription_status          = serializers.SerializerMethodField()

    class Meta:
        model = Tenant
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_subscription_allowed_modules(self, obj):
        try:
            sub = obj.subscription
            if sub and sub.plan and sub.plan.allowed_modules:
                return sub.plan.allowed_modules
        except Exception:
            pass
        return []  # empty = all modules allowed

    def get_subscription_status(self, obj):
        """Expose the subscription status so the frontend can show
        account-suspended banners without a separate API call."""
        try:
            return obj.subscription.status
        except Exception:
            return None


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
                  'is_system_default', 'created_at',
                  'show_in_normal', 'show_in_additional', 'show_in_gastos']
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
    applied_to_unit_id   = serializers.UUIDField(source='applied_to_unit.id',          read_only=True, allow_null=True, default=None)
    applied_to_unit_code = serializers.CharField(source='applied_to_unit.unit_id_code', read_only=True, allow_null=True, default=None)
    applied_to_unit_name = serializers.CharField(source='applied_to_unit.unit_name',    read_only=True, allow_null=True, default=None)

    def get_evidence(self, obj):
        return _parse_evidence(obj.evidence)

    class Meta:
        model = Payment
        fields = ['id', 'tenant', 'unit', 'unit_code', 'unit_name', 'responsible',
                  'period', 'status', 'payment_type', 'payment_date', 'notes', 'folio',
                  'evidence', 'bank_reconciled', 'adeudo_payments', 'field_payments', 'additional_payments',
                  'applied_to_unit_id', 'applied_to_unit_code', 'applied_to_unit_name',
                  'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']


class PaymentListSerializer(serializers.ModelSerializer):
    """Serializer ligero para listados de Cobranza.

    Excluye el campo ``evidence`` (texto Base64) que puede pesar varios MB por
    período. En su lugar expone ``has_evidence`` (bool) para que el frontend
    muestre el ícono de adjunto sin transmitir los datos completos.
    La evidencia real se obtiene bajo demanda en GET /payments/{id}/.
    """
    field_payments = FieldPaymentSerializer(many=True, read_only=True)
    additional_payments = serializers.JSONField(read_only=True)
    unit_code = serializers.CharField(source='unit.unit_id_code', read_only=True)
    unit_name = serializers.CharField(source='unit.unit_name', read_only=True)
    responsible = serializers.CharField(source='unit.responsible_name', read_only=True)
    has_evidence = serializers.SerializerMethodField()
    applied_to_unit_id   = serializers.UUIDField(source='applied_to_unit.id',          read_only=True, allow_null=True, default=None)
    applied_to_unit_code = serializers.CharField(source='applied_to_unit.unit_id_code', read_only=True, allow_null=True, default=None)
    applied_to_unit_name = serializers.CharField(source='applied_to_unit.unit_name',    read_only=True, allow_null=True, default=None)

    def get_has_evidence(self, obj):
        return bool(obj.evidence)

    class Meta:
        model = Payment
        fields = ['id', 'tenant', 'unit', 'unit_code', 'unit_name', 'responsible',
                  'period', 'status', 'payment_type', 'payment_date', 'notes', 'folio',
                  'has_evidence', 'bank_reconciled', 'adeudo_payments', 'field_payments',
                  'additional_payments', 'applied_to_unit_id', 'applied_to_unit_code',
                  'applied_to_unit_name', 'created_at', 'updated_at']
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
    applied_to_unit_id = serializers.UUIDField(required=False, allow_null=True, default=None)


class AddAdditionalPaymentSerializer(serializers.Serializer):
    """Serializer for adding an extra payment event to an existing payment."""
    field_payments = serializers.DictField(child=serializers.DictField(), required=True)
    payment_type = serializers.ChoiceField(choices=Payment.PAYMENT_TYPE_CHOICES)
    payment_date = serializers.DateField(required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True, default='')
    bank_reconciled = serializers.BooleanField(required=False, default=False)
    applied_to_unit_id = serializers.UUIDField(required=False, allow_null=True, default=None)


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


class GastoListSerializer(serializers.ModelSerializer):
    """Serializer ligero para listados de Gastos.

    Excluye el campo ``evidence`` (Base64). Expone ``has_evidence`` (bool) para
    el ícono de adjunto. La evidencia completa se obtiene en GET /gasto-entries/{id}/.
    """
    field_label = serializers.CharField(source='field.label', read_only=True, default='')
    has_evidence = serializers.SerializerMethodField()

    def get_has_evidence(self, obj):
        return bool(obj.evidence)

    class Meta:
        model = GastoEntry
        fields = ['id', 'tenant', 'period', 'field', 'field_label', 'amount',
                  'payment_type', 'doc_number', 'gasto_date', 'provider_name',
                  'provider_rfc', 'provider_invoice', 'bank_reconciled', 'notes',
                  'has_evidence', 'created_at', 'updated_at']
        read_only_fields = ['id', 'tenant', 'created_at', 'updated_at']


# ═══════════════════════════════════════════════════════════
#  CAJA CHICA
# ═══════════════════════════════════════════════════════════

class CajaChicaEntrySerializer(serializers.ModelSerializer):
    evidence_list = serializers.SerializerMethodField()

    class Meta:
        model = CajaChicaEntry
        fields = ['id', 'tenant', 'period', 'amount', 'description',
                  'date', 'payment_type', 'evidence', 'evidence_list', 'created_at']
        read_only_fields = ['id', 'tenant', 'created_at', 'evidence_list']

    def get_evidence_list(self, obj):
        """Normalise evidence TextField to a list of {data, mime, name} dicts."""
        return _parse_evidence(obj.evidence)


class CajaChicaListSerializer(serializers.ModelSerializer):
    """Serializer ligero para listados de Caja Chica.

    Excluye ``evidence`` y ``evidence_list`` (ambos contienen Base64). Expone
    ``has_evidence`` (bool) para el ícono de adjunto. La evidencia completa se
    obtiene bajo demanda en GET /caja-chica/{id}/.
    """
    has_evidence = serializers.SerializerMethodField()

    def get_has_evidence(self, obj):
        return bool(obj.evidence)

    class Meta:
        model = CajaChicaEntry
        fields = ['id', 'tenant', 'period', 'amount', 'description',
                  'date', 'payment_type', 'has_evidence', 'created_at']
        read_only_fields = ['id', 'tenant', 'created_at']


# ═══════════════════════════════════════════════════════════
#  BANK / PERIODS / ASSEMBLY
# ═══════════════════════════════════════════════════════════

class BankStatementSerializer(serializers.ModelSerializer):
    class Meta:
        model = BankStatement
        fields = ['id', 'tenant', 'period', 'file_data', 'uploaded_at']
        read_only_fields = ['id', 'tenant', 'uploaded_at']


class PaymentPlanSerializer(serializers.ModelSerializer):
    unit_code = serializers.CharField(source='unit.unit_id_code', read_only=True)
    unit_name = serializers.CharField(source='unit.unit_name',    read_only=True)
    responsible_name = serializers.SerializerMethodField()
    owner_email  = serializers.CharField(source='unit.owner_email',  read_only=True)
    tenant_email = serializers.CharField(source='unit.tenant_email', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    installments_paid = serializers.IntegerField(read_only=True)
    total_paid_toward_debt = serializers.FloatField(read_only=True)
    # field_key is a model @property (e.g. "plan_<uuid>") — needed by the frontend
    # to correctly identify and send FieldPayment records for plan installments.
    field_key = serializers.CharField(read_only=True)

    def get_responsible_name(self, obj):
        u = obj.unit
        if u.occupancy == 'rentado' and (u.tenant_first_name or u.tenant_last_name):
            return f'{u.tenant_first_name} {u.tenant_last_name}'.strip()
        return f'{u.owner_first_name} {u.owner_last_name}'.strip() or ''

    class Meta:
        model  = PaymentPlan
        fields = [
            'id', 'tenant', 'unit', 'unit_code', 'unit_name', 'responsible_name',
            'owner_email', 'tenant_email',
            'total_adeudo', 'maintenance_fee',
            'frequency', 'num_payments', 'apply_interest', 'interest_rate',
            'total_with_interest', 'status', 'status_display', 'notes', 'terms_conditions',
            'created_by_name', 'created_by_email', 'created_at',
            'sent_by_name', 'sent_at',
            'accepted_by_name', 'accepted_at',
            'installments', 'installments_paid', 'total_paid_toward_debt',
            'start_period', 'proposal_group', 'option_number',
            'cancel_reason', 'cancelled_by_name', 'cancelled_at',
            'field_key',
        ]
        read_only_fields = [
            'id', 'tenant', 'status', 'created_at',
            'created_by_name', 'created_by_email',
            'sent_by_name', 'sent_at',
            'accepted_by_name', 'accepted_at',
            'proposal_group',
            'cancelled_by_name', 'cancelled_at',
        ]


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
    exempt_count = serializers.IntegerField()
    total_gastos = serializers.FloatField()
    total_gastos_conciliados = serializers.FloatField()
    total_caja_chica = serializers.FloatField()
    maintenance_fee = serializers.FloatField()
    period = serializers.CharField()
    ingreso_adicional = serializers.FloatField()
    total_adeudo_recibido = serializers.FloatField()
    deuda_total = serializers.FloatField()
    total_ingresos = serializers.FloatField()


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
    subscription_plan_name = serializers.SerializerMethodField()
    tenant_id = serializers.SerializerMethodField()

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
            'subscription_plan', 'subscription_plan_name',
            'trial_days', 'admin_notes',
            'approved_at', 'rejected_at', 'rejection_reason',
            'tenant_id',
            'status', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'approved_at', 'rejected_at', 'tenant_id', 'created_at', 'updated_at']

    def get_subscription_plan_name(self, obj):
        return obj.subscription_plan.name if obj.subscription_plan else None

    def get_tenant_id(self, obj):
        return str(obj.tenant_id) if obj.tenant_id else None

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


# ═══════════════════════════════════════════════════════════
#  SUBSCRIPTION PLANS
# ═══════════════════════════════════════════════════════════

class SubscriptionPlanSerializer(serializers.ModelSerializer):
    subscriptions_count = serializers.SerializerMethodField()

    class Meta:
        model = SubscriptionPlan
        fields = [
            'id', 'name', 'description',
            'price_per_unit', 'currency', 'billing_cycle',
            'annual_discount_percent',
            'trial_days',
            'volume_tiers', 'features', 'allowed_modules',
            'is_active', 'sort_order',
            'subscriptions_count',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'subscriptions_count']

    def get_subscriptions_count(self, obj):
        return obj.subscriptions.count()


class TenantSubscriptionSerializer(serializers.ModelSerializer):
    tenant_name          = serializers.SerializerMethodField()
    plan_name            = serializers.SerializerMethodField()
    plan_billing_cycle   = serializers.SerializerMethodField()
    trial_days_remaining = serializers.SerializerMethodField()
    status_label         = serializers.SerializerMethodField()

    class Meta:
        model = TenantSubscription
        fields = [
            'id', 'tenant', 'tenant_name',
            'plan', 'plan_name', 'plan_billing_cycle',
            'status', 'status_label',
            'trial_start', 'trial_end', 'trial_days_remaining',
            'billing_start', 'next_billing_date',
            'units_count', 'amount_per_cycle', 'currency',
            'notes',
            'subscription_history',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'trial_days_remaining', 'status_label', 'subscription_history', 'plan_billing_cycle']

    def get_tenant_name(self, obj):
        return obj.tenant.name if obj.tenant else None

    def get_plan_name(self, obj):
        return obj.plan.name if obj.plan else None

    def get_plan_billing_cycle(self, obj):
        """Expose plan.billing_cycle ('monthly'/'annual') so the frontend
        can render the correct cycle label without needing a separate plan request."""
        return obj.plan.billing_cycle if obj.plan else None

    def get_trial_days_remaining(self, obj):
        return obj.trial_days_remaining

    def get_status_label(self, obj):
        return obj.get_status_display()

    def validate(self, data):
        """
        On CREATE only: if a plan and units_count are provided but amount_per_cycle
        is absent or zero, auto-calculate it respecting the plan's billing cycle
        (monthly vs annual with discount) and volume tiers.
        This prevents amount_per_cycle from defaulting to 0 when the caller
        (e.g. the new-subscription form) does not compute it explicitly.
        On UPDATE (self.instance exists) we trust the caller's explicit value so
        that superadmins can store negotiated/custom amounts.
        """
        if self.instance:
            # UPDATE — do not override an explicitly provided amount
            return data

        # CREATE path
        plan = data.get('plan')
        units = data.get('units_count', 0) or 0
        amount = data.get('amount_per_cycle', None)

        # Auto-compute only when plan is known, units > 0, and amount was not explicitly set
        if plan and units > 0 and not amount:
            annual = (plan.billing_cycle == 'annual')
            computed = plan.price_for_units(units, annual=annual)
            data['amount_per_cycle'] = computed
            # Also carry over the plan's currency if not explicitly provided
            if not data.get('currency'):
                data['currency'] = plan.currency

        return data


class SubscriptionPaymentSerializer(serializers.ModelSerializer):
    recorded_by_name = serializers.SerializerMethodField()
    payment_method_label = serializers.SerializerMethodField()

    class Meta:
        model = SubscriptionPayment
        fields = [
            'id', 'subscription',
            'amount', 'currency', 'period_label',
            'payment_date', 'payment_method', 'payment_method_label',
            'reference', 'notes',
            'recorded_by', 'recorded_by_name',
            'created_at',
        ]
        read_only_fields = ['id', 'created_at', 'recorded_by', 'recorded_by_name', 'payment_method_label']

    def get_recorded_by_name(self, obj):
        return obj.recorded_by.name if obj.recorded_by else None

    def get_payment_method_label(self, obj):
        return obj.get_payment_method_display()


# ═══════════════════════════════════════════════════════════
#  CRM SERIALIZERS
# ═══════════════════════════════════════════════════════════

class CRMContactSerializer(serializers.ModelSerializer):
    full_name               = serializers.SerializerMethodField()
    assigned_to_name        = serializers.SerializerMethodField()
    status_label            = serializers.SerializerMethodField()
    source_label            = serializers.SerializerMethodField()
    open_opportunities      = serializers.SerializerMethodField()
    open_tickets            = serializers.SerializerMethodField()
    condominio_request_data = serializers.SerializerMethodField()

    class Meta:
        model = CRMContact
        fields = [
            'id', 'full_name', 'first_name', 'last_name', 'email', 'phone',
            'company', 'cargo', 'country', 'state', 'city', 'units_count',
            'source', 'source_label', 'status', 'status_label',
            'lead_score', 'assigned_to', 'assigned_to_name',
            'tags', 'notes', 'last_activity_at',
            'condominio_request', 'condominio_request_data',
            'tenant',
            'open_opportunities', 'open_tickets',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at',
                            'full_name', 'assigned_to_name', 'status_label',
                            'source_label', 'open_opportunities', 'open_tickets',
                            'condominio_request_data']

    def get_full_name(self, obj):
        return obj.full_name

    def get_assigned_to_name(self, obj):
        return obj.assigned_to.name if obj.assigned_to else None

    def get_status_label(self, obj):
        return obj.get_status_display()

    def get_source_label(self, obj):
        return obj.get_source_display()

    def get_open_opportunities(self, obj):
        return obj.opportunities.exclude(stage__in=['won', 'lost']).count()

    def get_open_tickets(self, obj):
        return obj.tickets.exclude(status__in=['resolved', 'closed']).count()

    def get_condominio_request_data(self, obj):
        if not obj.condominio_request:
            return None
        req = obj.condominio_request
        return {
            'id': str(req.id),
            'condominio_nombre': req.condominio_nombre,
            'status': req.status,
            'condominio_unidades': req.condominio_unidades,
            'created_at': req.created_at,
        }


class CRMOpportunitySerializer(serializers.ModelSerializer):
    stage_label       = serializers.SerializerMethodField()
    assigned_to_name  = serializers.SerializerMethodField()
    contact_name      = serializers.SerializerMethodField()
    contact_company   = serializers.SerializerMethodField()
    weighted_value    = serializers.SerializerMethodField()

    class Meta:
        model = CRMOpportunity
        fields = [
            'id', 'contact', 'contact_name', 'contact_company',
            'title', 'stage', 'stage_label', 'stage_order',
            'value', 'currency', 'probability', 'weighted_value',
            'expected_close', 'actual_close',
            'won_at', 'lost_at', 'lost_reason',
            'assigned_to', 'assigned_to_name',
            'notes', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'won_at', 'lost_at',
                            'stage_label', 'assigned_to_name', 'contact_name',
                            'contact_company', 'weighted_value']

    def get_stage_label(self, obj):
        return obj.get_stage_display()

    def get_assigned_to_name(self, obj):
        return obj.assigned_to.name if obj.assigned_to else None

    def get_contact_name(self, obj):
        return obj.contact.full_name if obj.contact else None

    def get_contact_company(self, obj):
        return obj.contact.company if obj.contact else None

    def get_weighted_value(self, obj):
        return float(obj.value) * obj.probability / 100


class CRMActivitySerializer(serializers.ModelSerializer):
    type_label       = serializers.SerializerMethodField()
    created_by_name  = serializers.SerializerMethodField()

    class Meta:
        model = CRMActivity
        fields = [
            'id', 'contact', 'opportunity',
            'type', 'type_label', 'title', 'description', 'outcome',
            'scheduled_at', 'completed_at', 'is_completed',
            'created_by', 'created_by_name', 'created_at',
        ]
        read_only_fields = ['id', 'created_at', 'type_label', 'created_by_name', 'created_by']

    def get_type_label(self, obj):
        return obj.get_type_display()

    def get_created_by_name(self, obj):
        return obj.created_by.name if obj.created_by else None

    def create(self, validated_data):
        request = self.context.get('request')
        if request and hasattr(request, 'user'):
            validated_data['created_by'] = request.user
        return super().create(validated_data)


class CRMCampaignContactSerializer(serializers.ModelSerializer):
    contact_name  = serializers.SerializerMethodField()
    contact_email = serializers.SerializerMethodField()
    status_label  = serializers.SerializerMethodField()

    class Meta:
        model = CRMCampaignContact
        fields = [
            'id', 'campaign', 'contact', 'contact_name', 'contact_email',
            'delivery_status', 'status_label',
            'sent_at', 'opened_at', 'clicked_at', 'converted_at',
        ]
        read_only_fields = ['id', 'contact_name', 'contact_email', 'status_label']

    def get_contact_name(self, obj):
        return obj.contact.full_name if obj.contact else None

    def get_contact_email(self, obj):
        return obj.contact.email if obj.contact else None

    def get_status_label(self, obj):
        return obj.get_delivery_status_display()


class CRMCampaignSerializer(serializers.ModelSerializer):
    type_label       = serializers.SerializerMethodField()
    status_label     = serializers.SerializerMethodField()
    created_by_name  = serializers.SerializerMethodField()
    recipient_count  = serializers.SerializerMethodField()

    class Meta:
        model = CRMCampaign
        fields = [
            'id', 'name', 'type', 'type_label', 'status', 'status_label',
            'subject', 'body_text', 'body_html',
            'target_filters', 'scheduled_at', 'sent_at', 'stats',
            'created_by', 'created_by_name', 'recipient_count',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'sent_at',
                            'type_label', 'status_label', 'created_by_name',
                            'recipient_count', 'created_by']

    def get_type_label(self, obj):
        return obj.get_type_display()

    def get_status_label(self, obj):
        return obj.get_status_display()

    def get_created_by_name(self, obj):
        return obj.created_by.name if obj.created_by else None

    def get_recipient_count(self, obj):
        return obj.recipients.count()

    def create(self, validated_data):
        request = self.context.get('request')
        if request and hasattr(request, 'user'):
            validated_data['created_by'] = request.user
        return super().create(validated_data)


class CRMTicketSerializer(serializers.ModelSerializer):
    type_label       = serializers.SerializerMethodField()
    priority_label   = serializers.SerializerMethodField()
    status_label     = serializers.SerializerMethodField()
    assigned_to_name = serializers.SerializerMethodField()
    contact_name     = serializers.SerializerMethodField()
    tenant_name      = serializers.SerializerMethodField()

    class Meta:
        model = CRMTicket
        fields = [
            'id', 'contact', 'contact_name', 'tenant', 'tenant_name',
            'subject', 'description',
            'type', 'type_label', 'priority', 'priority_label',
            'status', 'status_label',
            'assigned_to', 'assigned_to_name',
            'tags', 'resolution_notes',
            'first_response_at', 'resolved_at',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at',
                            'type_label', 'priority_label', 'status_label',
                            'assigned_to_name', 'contact_name', 'tenant_name']

    def get_type_label(self, obj):
        return obj.get_type_display()

    def get_priority_label(self, obj):
        return obj.get_priority_display()

    def get_status_label(self, obj):
        return obj.get_status_display()

    def get_assigned_to_name(self, obj):
        return obj.assigned_to.name if obj.assigned_to else None

    def get_contact_name(self, obj):
        return obj.contact.full_name if obj.contact else None

    def get_tenant_name(self, obj):
        return obj.tenant.name if obj.tenant else None


class CRMDashboardSerializer(serializers.Serializer):
    """Read-only aggregate stats for the CRM dashboard."""
    total_contacts    = serializers.IntegerField()
    contacts_by_status = serializers.DictField(child=serializers.IntegerField())
    total_opportunities  = serializers.IntegerField()
    pipeline_value       = serializers.FloatField()
    weighted_pipeline    = serializers.FloatField()
    opportunities_by_stage = serializers.DictField(child=serializers.IntegerField())
    won_this_month       = serializers.IntegerField()
    lost_this_month      = serializers.IntegerField()
    total_tickets        = serializers.IntegerField()
    open_tickets         = serializers.IntegerField()
    tickets_by_priority  = serializers.DictField(child=serializers.IntegerField())
    recent_activities    = serializers.ListField(child=serializers.DictField())

