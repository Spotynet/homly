"""
Homly — Data Models (PostgreSQL optimized)
Complete mapping from the original single-file application.

Model hierarchy:
  User (custom auth)
  └── Tenant (condominium)
       ├── Unit (housing unit)
       ├── TenantUser (role assignment per tenant)
       ├── ExtraField (custom payment fields)
       ├── Payment (monthly per unit)
       │    └── FieldPayment (per-field amounts)
       ├── GastoEntry (expense records)
       ├── CajaChicaEntry (petty cash)
       ├── BankStatement (PDF uploads per period)
       ├── ClosedPeriod (period locks)
       ├── ReopenRequest (reopen period workflow)
       ├── AssemblyPosition (org chart)
       └── Committee (committees)
"""

import uuid
from django.db import models
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.core.validators import MinValueValidator, MaxValueValidator


# ═══════════════════════════════════════════════════════════
#  CUSTOM USER
# ═══════════════════════════════════════════════════════════

class UserManager(BaseUserManager):
    def create_user(self, email, name, password=None, **extra):
        if not email:
            raise ValueError('El email es obligatorio')
        user = self.model(email=self.normalize_email(email), name=name, **extra)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, name, password=None, **extra):
        extra.setdefault('is_staff', True)
        extra.setdefault('is_superuser', True)
        extra.setdefault('is_super_admin', True)
        return self.create_user(email, name, password, **extra)


class User(AbstractBaseUser, PermissionsMixin):
    """
    Custom user model. Supports both super-admins and tenant-scoped users.
    Maps from: S.superAdmins + tenant.users[]
    """
    SYSTEM_ROLE_CHOICES = [
        ('super_admin',        'Super Administrador'),
        ('ventas',             'Revenue Growth Strategist'),
        ('marketing',          'Content Strategist Lead'),
        ('atencion_cliente',   'Customer Success Hero'),
        ('soporte_tecnico',    'Systems Reliability Engineer'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True, db_index=True)
    name = models.CharField(max_length=200)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    is_super_admin = models.BooleanField(default=False)
    must_change_password = models.BooleanField(default=False)

    # System staff role (null = regular tenant user)
    system_role = models.CharField(
        max_length=20, choices=SYSTEM_ROLE_CHOICES,
        null=True, blank=True, db_index=True,
        help_text='Role within the Homly internal team. Null = not a system user.',
    )
    # Granular module access for system staff (not for super_admin — they have all)
    # Keys: 'crm', 'tenants', 'suscripciones', 'logs', 'system_users'
    system_permissions = models.JSONField(
        default=dict, blank=True,
        help_text='Module-level access flags for non-superadmin system users.',
    )
    # Human-readable role label set by super-admin when creating staff users
    # (e.g. "Operador de Tenants", "Analista CRM").
    role_name = models.CharField(
        max_length=120, blank=True, default='',
        help_text='Display label for this user\'s role. '
                  'Falls back to system_role display or "Super Administrador" if blank.',
    )
    # Restrict which tenants a staff user can see (empty = all visible tenants)
    allowed_tenant_ids = models.JSONField(
        default=list, blank=True,
        help_text='UUIDs of tenants this system user may access. Empty = all.',
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = UserManager()
    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['name']

    class Meta:
        db_table = 'users'
        ordering = ['name']

    def __str__(self):
        return f'{self.name} <{self.email}>'


# ═══════════════════════════════════════════════════════════
#  TENANT (Condominium)
# ═══════════════════════════════════════════════════════════

class Tenant(models.Model):
    """
    A condominium/property managed by Homly.
    Maps from: S.tenants[] items
    """
    CURRENCY_CHOICES = [
        ('MXN', 'Peso Mexicano'),
        ('USD', 'US Dollar'),
        ('EUR', 'Euro'),
        ('COP', 'Peso Colombiano'),
    ]
    OPERATION_TYPE_CHOICES = [
        ('fiscal', 'Año Fiscal (Ene-Dic)'),
        ('custom', 'Personalizado'),
    ]
    ADMIN_TYPE_CHOICES = [
        ('mesa_directiva', 'Mesa Directiva'),
        ('administrador', 'Administrador Externo'),
        ('comite', 'Comité'),
    ]
    WORKSPACE_TYPE_CHOICES = [
        ('condominio', 'Administración de condominios'),
        ('rentas', 'Gestión de rentas'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=300, db_index=True)
    workspace_type = models.CharField(
        max_length=20,
        choices=WORKSPACE_TYPE_CHOICES,
        default='condominio',
        db_index=True,
        help_text='Espacio de trabajo: condominio o inmobiliaria de rentas.',
    )
    rental_settings = models.JSONField(
        default=dict,
        blank=True,
        help_text='Ajustes propios del espacio de rentas (día de cobro, aviso de vencimiento, etc.).',
    )
    units_count = models.PositiveIntegerField(default=0, help_text='Planned number of units')
    common_areas = models.JSONField(default=list, blank=True)
    maintenance_fee = models.DecimalField(max_digits=12, decimal_places=2, default=0,
                                          validators=[MinValueValidator(0)])
    currency = models.CharField(max_length=3, choices=CURRENCY_CHOICES, default='MXN')
    logo = models.TextField(blank=True, default='', help_text='Base64-encoded logo image (deprecado — usar logo_file)')
    # MIGRACIÓN Base64→File: nuevo campo que reemplazará a `logo`
    logo_file = models.ImageField(
        upload_to='tenant_logos/', null=True, blank=True,
        help_text='Logo almacenado como archivo. Reemplaza al campo logo (Base64).',
    )
    operation_start_date = models.CharField(max_length=7, default='2024-01',
                                            help_text='Format: YYYY-MM')
    operation_type = models.CharField(max_length=10, choices=OPERATION_TYPE_CHOICES, default='fiscal')
    country = models.CharField(max_length=100, blank=True, default='')
    state = models.CharField(max_length=100, blank=True, default='')
    bank_initial_balance = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    receipt_seq = models.PositiveIntegerField(
        default=0,
        help_text='Último consecutivo de recibo principal asignado en este condominio.',
    )
    admin_type = models.CharField(max_length=20, choices=ADMIN_TYPE_CHOICES, default='mesa_directiva')

    # Fiscal info (Info tab)
    razon_social = models.CharField(max_length=300, blank=True, default='')
    rfc = models.CharField(max_length=20, blank=True, default='')
    info_calle = models.CharField(max_length=300, blank=True, default='')
    info_num_externo = models.CharField(max_length=50, blank=True, default='')
    info_colonia = models.CharField(max_length=200, blank=True, default='')
    info_delegacion = models.CharField(max_length=200, blank=True, default='')
    info_ciudad = models.CharField(max_length=200, blank=True, default='')
    info_codigo_postal = models.CharField(max_length=10, blank=True, default='')

    # Physical address (Address tab)
    addr_nombre = models.CharField(max_length=300, blank=True, default='')
    addr_calle = models.CharField(max_length=300, blank=True, default='')
    addr_num_externo = models.CharField(max_length=50, blank=True, default='')
    addr_colonia = models.CharField(max_length=200, blank=True, default='')
    addr_delegacion = models.CharField(max_length=200, blank=True, default='')
    addr_ciudad = models.CharField(max_length=200, blank=True, default='')
    addr_codigo_postal = models.CharField(max_length=10, blank=True, default='')

    # Module visibility permissions per role
    # Dict: { role_key: [enabled_module_keys...] }
    # An empty dict means "all modules enabled" (defaults apply).
    module_permissions = models.JSONField(
        default=dict,
        blank=True,
        help_text=(
            'Per-role module visibility. Keys: admin, tesorero, contador, auditor, vigilante, vecino (residente). '
            'Values: list of enabled module keys. Empty dict = all defaults enabled.'
        ),
    )

    # Configurable behaviour for the reservations module.
    # approval_mode choices:
    #   "require_vecinos"   → residentes/vigilantes need admin approval (default)
    #   "require_all"       → every request (including admin/tesorero) goes through approval
    #   "auto_approve_all"  → all requests are auto-approved (no approval step)
    reservation_settings = models.JSONField(
        default=dict,
        blank=True,
        help_text='Reservation-module behaviour settings: approval_mode, etc.',
    )

    # Custom role profiles defined by the tenant admin.
    # List of: {id, label, color, base_role, modules:[]}
    custom_profiles = models.JSONField(
        default=list,
        blank=True,
        help_text='Custom role profiles with per-module access configuration.',
    )

    # Period closure approval flow configuration.
    # Structure: {"enabled": bool, "steps": [{"order": int, "user_id": str, "user_name": str, "label": str}]}
    closure_flow = models.JSONField(
        default=dict,
        blank=True,
        help_text='Period closure approval flow: enabled flag and ordered list of approver steps.',
    )

    # Planeación: flujo de aprobación de presupuestos y proyectos.
    # {"enabled": bool, "steps": [{"order": int, "user_id": str, "user_name": str, "label": str}]}
    planning_flow = models.JSONField(
        default=dict,
        blank=True,
        help_text='Flujo de aprobación de presupuesto y proyectos: enabled y pasos ordenados.',
    )

    # Active / inactive flag — managed by TenantSubscription.sync_tenant_active().
    # When False, users of this tenant cannot log in (access is blocked).
    is_active = models.BooleanField(
        default=True,
        db_index=True,
        help_text='Si es False el acceso al condominio está bloqueado para sus usuarios.',
    )

    # Hibernation — superadmin alternative to deletion.
    # Preserves all data in read-only mode until the superadmin reactivates it.
    hibernated = models.BooleanField(
        default=False,
        db_index=True,
        help_text='Modo hibernación: datos preservados en solo lectura.',
    )
    hibernation_reason = models.TextField(
        blank=True,
        default='',
        help_text='Razón por la que el superadmin hibernó este condominio.',
    )

    # Onboarding tour state
    # onboarding_completed: el admin terminó el tour y confirmó que el tenant está listo
    # onboarding_dismissed_at: fecha cuando un admin descartó el banner/auto-launch
    #                         (se muestra de nuevo si vuelve a entrar al tour manualmente)
    onboarding_completed = models.BooleanField(default=False)
    onboarding_dismissed_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'tenants'
        ordering = ['name']

    def __str__(self):
        return self.name


# ═══════════════════════════════════════════════════════════
#  TENANT USER (Role per tenant)
# ═══════════════════════════════════════════════════════════

class TenantUser(models.Model):
    """
    Links a User to a Tenant with a specific role.
    Maps from: tenant.users[] with role field
    """
    ROLE_CHOICES = [
        ('admin',      'Administrador'),
        ('tesorero',   'Tesorero'),
        ('contador',   'Contador'),
        ('auditor',    'Auditor'),
        ('vecino',     'Residente'),
        ('vigilante',  'Vigilante'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='tenant_users')
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='tenant_roles')
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, db_index=True)
    unit = models.ForeignKey('Unit', on_delete=models.SET_NULL, null=True, blank=True,
                             related_name='assigned_users',
                             help_text='Required for residente role')
    # ID referencing a custom profile in tenant.custom_profiles (blank = using built-in role)
    profile_id = models.CharField(max_length=100, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'tenant_users'
        unique_together = ['tenant', 'user']
        indexes = [
            models.Index(fields=['tenant', 'role']),
        ]

    def __str__(self):
        return f'{self.user.name} → {self.tenant.name} ({self.role})'


# ═══════════════════════════════════════════════════════════
#  UNIT (Housing unit within a tenant)
# ═══════════════════════════════════════════════════════════

class Unit(models.Model):
    """
    A housing unit (casa, depto, local) within a condominium.
    Maps from: tenant.unitsList[]
    """
    OCCUPANCY_CHOICES = [
        ('propietario', 'Propietario'),
        ('rentado', 'Rentado'),
        ('vacío', 'Sin habitar'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='units')
    unit_name = models.CharField(max_length=100, help_text='e.g. Casa 1, Depto 301')
    unit_id_code = models.CharField(max_length=50, db_index=True,
                                     help_text='e.g. C-001, D-301')
    owner_first_name = models.CharField(max_length=150, blank=True, default='')
    owner_last_name = models.CharField(max_length=150, blank=True, default='')
    owner_email = models.EmailField(blank=True, default='')
    owner_phone = models.CharField(max_length=30, blank=True, default='')
    coowner_first_name = models.CharField(max_length=150, blank=True, default='', help_text='Copropietario first name')
    coowner_last_name = models.CharField(max_length=150, blank=True, default='')
    coowner_email = models.EmailField(blank=True, default='')
    coowner_phone = models.CharField(max_length=30, blank=True, default='')
    occupancy = models.CharField(max_length=15, choices=OCCUPANCY_CHOICES, default='propietario')
    tenant_first_name = models.CharField(max_length=150, blank=True, default='',
                                          help_text='Renter first name')
    tenant_last_name = models.CharField(max_length=150, blank=True, default='')
    tenant_email = models.EmailField(blank=True, default='')
    tenant_phone = models.CharField(max_length=30, blank=True, default='')
    admin_exempt = models.BooleanField(default=False,
                                       help_text='Exento por Mesa Directiva')
    services_suspended = models.BooleanField(
        default=False,
        help_text='Suspensión de servicios por adeudo (aviso informativo).',
    )
    services_suspended_at = models.DateTimeField(
        null=True, blank=True,
        help_text='Cuándo se activó la suspensión de servicios.',
    )
    previous_debt = models.DecimalField(max_digits=12, decimal_places=2, default=0,
                                        help_text='Adeudo anterior al inicio')
    previous_debt_evidence = models.TextField(blank=True, default='',
                                             help_text='Base64 PDF evidencia del adeudo anterior (deprecado — usar previous_debt_evidence_file)')
    # MIGRACIÓN Base64→File: nuevo campo que reemplazará a `previous_debt_evidence`
    previous_debt_evidence_file = models.FileField(
        upload_to='unit_debt_evidences/', null=True, blank=True,
        help_text='Evidencia de adeudo anterior como archivo. Reemplaza al campo previous_debt_evidence (Base64).',
    )
    credit_balance = models.DecimalField(max_digits=12, decimal_places=2, default=0,
                                         help_text='Saldo a favor previo al inicio de operaciones')
    credit_balance_evidence = models.TextField(blank=True, default='',
                                               help_text='Base64 PDF evidencia del saldo a favor previo')
    is_active = models.BooleanField(default=True,
                                    help_text='Unidad activa. Si es False queda de solo lectura y no acepta nuevos pagos.')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'units'
        ordering = ['unit_id_code']
        unique_together = ['tenant', 'unit_id_code']
        indexes = [
            models.Index(fields=['tenant', 'unit_name']),
        ]

    def __str__(self):
        return f'{self.unit_id_code} — {self.unit_name}'

    @property
    def responsible_name(self):
        if self.occupancy == 'rentado' and self.tenant_first_name:
            return f'{self.tenant_first_name} {self.tenant_last_name}'.strip()
        return f'{self.owner_first_name} {self.owner_last_name}'.strip()


# ═══════════════════════════════════════════════════════════
#  EXTRA FIELD (Custom payment fields)
# ═══════════════════════════════════════════════════════════

class ExtraField(models.Model):
    """
    Custom payment fields for a tenant (e.g., Fondo de Reserva, Estacionamiento).
    Maps from: tenant.extraFields[]
    """
    FIELD_TYPE_CHOICES = [
        ('normal', 'Normal'),
        ('gastos', 'Gastos'),
        ('adelanto', 'Adelanto'),  # Fondo de adelantos: pagos que suman como saldo a favor
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='extra_fields')
    label = models.CharField(max_length=200)
    default_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    required = models.BooleanField(default=False)
    enabled = models.BooleanField(default=True)
    cross_unit = models.BooleanField(default=False,
                                      help_text='Can target another unit')
    field_type = models.CharField(max_length=10, choices=FIELD_TYPE_CHOICES, default='normal')
    sort_order = models.PositiveIntegerField(default=0)
    is_system_default = models.BooleanField(default=False,
                                             help_text='Created by system, cannot delete')
    created_at = models.DateTimeField(auto_now_add=True)
    # Visibility per form — controls in which capture forms the field is shown
    show_in_normal = models.BooleanField(default=True,
                                          help_text='Show in regular monthly payment capture')
    show_in_additional = models.BooleanField(default=True,
                                              help_text='Show in additional payments capture')
    show_in_gastos = models.BooleanField(default=True,
                                          help_text='Show in gastos (expenses) form')

    class Meta:
        db_table = 'extra_fields'
        ordering = ['sort_order', 'label']

    def __str__(self):
        return f'{self.label} ({self.tenant.name})'


# ═══════════════════════════════════════════════════════════
#  PAYMENT (Monthly collection per unit)
# ═══════════════════════════════════════════════════════════

class Payment(models.Model):
    """
    A monthly payment record for a unit.
    Maps from: tenant.payments[]
    """
    STATUS_CHOICES = [
        ('pendiente', 'Pendiente'),
        ('parcial', 'Parcial'),
        ('pagado', 'Pagado'),
    ]
    PAYMENT_TYPE_CHOICES = [
        ('transferencia', 'Transferencia'),
        ('deposito', 'Depósito'),
        ('efectivo', 'Efectivo'),
        ('excento', 'Exento'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='payments')
    unit = models.ForeignKey(Unit, on_delete=models.CASCADE, related_name='payments')
    period = models.CharField(max_length=7, db_index=True, help_text='Format: YYYY-MM')
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='pendiente')
    payment_type = models.CharField(max_length=15, choices=PAYMENT_TYPE_CHOICES,
                                     blank=True, default='')
    payment_date = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True, default='')
    evidence = models.TextField(blank=True, default='', help_text='Base64 evidence image (deprecado — usar evidence_file)')
    # MIGRACIÓN Base64→File: nuevo campo que reemplazará a `evidence`
    evidence_file = models.ImageField(
        upload_to='payment_evidences/', null=True, blank=True,
        help_text='Comprobante de pago como archivo. Reemplaza al campo evidence (Base64).',
    )
    bank_reconciled = models.BooleanField(default=False)
    folio = models.CharField(max_length=50, blank=True, default='',
                             help_text='Folio / número de recibo asignado al pago')

    # Pago que físicamente se registró en esta unidad pero corresponde a otra unidad
    applied_to_unit = models.ForeignKey(
        'Unit', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='applied_payments',
        help_text='Unidad a la que aplica este pago cuando difiere de la unidad de registro'
    )

    # JSONB for flexible adeudo payments across periods
    adeudo_payments = models.JSONField(default=dict, blank=True,
                                       help_text='Debt payments: {period: {fieldId: amount}}')
    additional_payments = models.JSONField(default=list, blank=True,
                                           help_text='Extra payment events per unit/period')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'payments'
        unique_together = ['tenant', 'unit', 'period']
        indexes = [
            models.Index(fields=['tenant', 'period']),
            models.Index(fields=['tenant', 'period', 'status']),
            models.Index(fields=['unit', 'period']),
        ]

    def __str__(self):
        return f'{self.unit.unit_id_code} — {self.period} ({self.status})'


class FieldPayment(models.Model):
    """
    Per-field payment amounts within a Payment.
    Maps from: payment.fieldPayments[fieldId]
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    payment = models.ForeignKey(Payment, on_delete=models.CASCADE, related_name='field_payments')
    field_key = models.CharField(max_length=100, help_text='"maintenance" or ExtraField.id')
    received = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    target_unit = models.ForeignKey(Unit, on_delete=models.SET_NULL, null=True, blank=True,
                                     help_text='Cross-unit target')
    # JSONB for adelanto targets: {period: amount}
    adelanto_targets = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = 'field_payments'
        unique_together = ['payment', 'field_key']

    def __str__(self):
        return f'{self.field_key}: {self.received}'


# ═══════════════════════════════════════════════════════════
#  GASTO ENTRY (Expense records)
# ═══════════════════════════════════════════════════════════

class GastoEntry(models.Model):
    """
    Individual expense entry.
    Maps from: tenant.gastosEntries[]
    """
    PAYMENT_TYPE_CHOICES = [
        ('efectivo', 'Efectivo'),
        ('cheque', 'Cheque'),
        ('transferencia', 'Transferencia'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='gasto_entries')
    period = models.CharField(max_length=7, db_index=True)
    field = models.ForeignKey(ExtraField, on_delete=models.CASCADE, related_name='gasto_entries',
                               null=True, blank=True)
    field_id_legacy = models.CharField(max_length=100, blank=True, default='',
                                        help_text='Legacy field ID for migration')
    amount = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(0)])
    payment_type = models.CharField(max_length=15, choices=PAYMENT_TYPE_CHOICES,
                                     default='transferencia')
    doc_number = models.CharField(max_length=100, blank=True, default='')
    gasto_date = models.DateField(null=True, blank=True)
    provider = models.ForeignKey(
        'CondoProvider', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='gasto_entries',
    )
    provider_name = models.CharField(max_length=300, blank=True, default='')
    provider_rfc = models.CharField(max_length=20, blank=True, default='')
    provider_invoice = models.CharField(max_length=100, blank=True, default='')
    bank_reconciled = models.BooleanField(default=False)
    notes = models.TextField(blank=True, default='')
    maintenance_work = models.ForeignKey(
        'CondoMaintenanceWork', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='gasto_entries',
        help_text='Trabajo de mantenimiento asociado a este gasto.',
    )
    evidence = models.TextField(blank=True, default='', help_text='Base64 evidence (deprecado — usar evidence_file)')
    # MIGRACIÓN Base64→File: nuevo campo que reemplazará a `evidence`
    evidence_file = models.FileField(
        upload_to='gasto_evidences/', null=True, blank=True,
        help_text='Comprobante de gasto como archivo. Reemplaza al campo evidence (Base64).',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'gasto_entries'
        ordering = ['-gasto_date', '-created_at']
        indexes = [
            models.Index(fields=['tenant', 'period']),
        ]

    def __str__(self):
        return f'Gasto {self.amount} — {self.period}'


# ═══════════════════════════════════════════════════════════
#  CAJA CHICA (Petty Cash)
# ═══════════════════════════════════════════════════════════

class CajaChicaEntry(models.Model):
    """
    Petty cash entry.
    Maps from: tenant.cajaChica[]
    """
    PAYMENT_TYPE_CHOICES = [
        ('efectivo', 'Efectivo'),
        ('cheque', 'Cheque'),
        ('transferencia', 'Transferencia'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='caja_chica_entries')
    period = models.CharField(max_length=7, db_index=True)
    amount = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(0)])
    description = models.CharField(max_length=500)
    date = models.DateField(null=True, blank=True)
    payment_type = models.CharField(max_length=15, choices=PAYMENT_TYPE_CHOICES, default='efectivo')
    provider = models.ForeignKey(
        'CondoProvider', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='caja_chica_entries',
    )
    provider_name = models.CharField(max_length=300, blank=True, default='')
    evidence = models.TextField(
        blank=True, default='',
        help_text='JSON array of {data, mime, name} base64-encoded evidence files for this entry.',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'caja_chica'
        ordering = ['-date', '-created_at']
        indexes = [
            models.Index(fields=['tenant', 'period']),
        ]

    def __str__(self):
        return f'Caja Chica {self.amount} — {self.description[:50]}'


# ═══════════════════════════════════════════════════════════
#  PAYMENT PLAN (Plan de Pago de Adeudos)
# ═══════════════════════════════════════════════════════════

class PaymentPlan(models.Model):
    """
    Debt payment plan agreed between the administration and a unit resident.

    Workflow:
        draft → sent → accepted (active) → completed
                     → rejected
        (admin can cancel from any non-terminal state)

    installments JSON schema (list of dicts):
        {
          "num":          int,          # 1-based
          "period_key":   "YYYY-MM",    # billing period when this payment is due
          "period_label": str,          # human-readable month/year (es-MX)
          "debt_part":    float,        # debt installment amount
          "regular_part": float,        # maintenance × freq (reference, not enforced here)
          "total":        float,        # debt_part + regular_part (reference)
          "paid_amount":  float,        # amount actually paid toward this installment
          "status":       "pending"|"partial"|"paid",
          "paid_at":      null|str      # ISO date when marked paid
        }
    """
    STATUS_CHOICES = [
        ('draft',     'Borrador'),
        ('sent',      'Enviado al residente'),
        ('accepted',  'Aceptado / Activo'),
        ('rejected',  'Rechazado'),
        ('completed', 'Completado'),
        ('cancelled', 'Cancelado'),
    ]
    FREQ_CHOICES = [
        (1, 'Mensual'),
        (2, 'Bimestral'),
        (3, 'Trimestral'),
        (6, 'Semestral'),
    ]
    PLAN_TYPE_CHOICES = [
        ('installment', 'Plan de cuotas'),
        ('settlement',  'Liquidación con quita'),
    ]
    DISCOUNT_TYPE_CHOICES = [
        ('percent', 'Porcentaje'),
        ('amount',  'Monto fijo'),
    ]

    id             = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant         = models.ForeignKey('Tenant', on_delete=models.CASCADE, related_name='payment_plans')
    unit           = models.ForeignKey('Unit',   on_delete=models.CASCADE, related_name='payment_plans')

    # Debt snapshot at creation time
    total_adeudo        = models.DecimalField(max_digits=14, decimal_places=2)
    maintenance_fee     = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    frequency           = models.PositiveSmallIntegerField(choices=FREQ_CHOICES, default=1)
    num_payments        = models.PositiveSmallIntegerField(default=1)
    apply_interest      = models.BooleanField(default=False)
    interest_rate       = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    total_with_interest = models.DecimalField(max_digits=14, decimal_places=2)

    # Settlement / quita (complete liquidation with authorized discount)
    plan_type = models.CharField(
        max_length=20, choices=PLAN_TYPE_CHOICES, default='installment', db_index=True,
        help_text='installment = cuotas; settlement = liquidación completa con quita',
    )
    discount_type = models.CharField(
        max_length=10, choices=DISCOUNT_TYPE_CHOICES, blank=True, default='',
        help_text='Cómo se expresa el descuento autorizado (solo settlement)',
    )
    discount_value = models.DecimalField(
        max_digits=14, decimal_places=2, default=0,
        help_text='Valor del descuento: porcentaje (0-100) o monto, según discount_type',
    )
    discount_amount = models.DecimalField(
        max_digits=14, decimal_places=2, default=0,
        help_text='Quita autorizada en moneda (adeudo original − importe a liquidar)',
    )
    settlement_amount = models.DecimalField(
        max_digits=14, decimal_places=2, default=0,
        help_text='Importe que el residente debe pagar para liquidar (después de la quita)',
    )
    debt_cutoff_period = models.CharField(
        max_length=7, blank=True, default='',
        help_text='YYYY-MM: períodos con cargo hasta este corte quedan absorbidos por el plan',
    )

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft', db_index=True)
    notes  = models.TextField(blank=True, default='')
    terms_conditions = models.TextField(
        blank=True, default='',
        help_text='Políticas, condiciones y/o términos de la propuesta que el residente acepta al tomar el plan',
    )

    # Workflow audit (denormalized for display without joins)
    created_by_name  = models.CharField(max_length=200, blank=True)
    created_by_email = models.CharField(max_length=200, blank=True)
    created_at       = models.DateTimeField(auto_now_add=True)

    sent_by_name = models.CharField(max_length=200, blank=True)
    sent_at      = models.DateTimeField(null=True, blank=True)

    accepted_by_name = models.CharField(max_length=200, blank=True)
    accepted_at      = models.DateTimeField(null=True, blank=True)

    # Installment schedule (see schema above)
    installments = models.JSONField(default=list)

    # Multi-option proposal support
    start_period   = models.CharField(
        max_length=7, blank=True, default='',
        help_text='YYYY-MM period when this plan starts applying to cobranza',
    )
    proposal_group = models.UUIDField(
        null=True, blank=True, db_index=True,
        help_text='Groups multiple options sent together as a proposal',
    )
    option_number  = models.PositiveSmallIntegerField(
        default=1,
        help_text='Option number within a proposal (1, 2, or 3)',
    )

    # Cancellation
    cancel_reason    = models.TextField(blank=True, default='', help_text='Reason provided when cancelling the plan')
    cancelled_by_name = models.CharField(max_length=200, blank=True)
    cancelled_at      = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'payment_plans'
        ordering = ['-created_at']

    def __str__(self):
        return f'Plan {self.unit} — {self.get_status_display()} — {self.total_with_interest}'

    @property
    def field_key(self):
        """FieldPayment key used to track installment payments for this plan."""
        return f'plan_{self.id}'

    @property
    def installments_paid(self):
        return sum(1 for i in self.installments if i.get('status') == 'paid')

    @property
    def total_paid_toward_debt(self):
        return sum(float(i.get('paid_amount', 0)) for i in self.installments)


# ═══════════════════════════════════════════════════════════
#  BANK STATEMENT (Uploaded PDFs per period)
# ═══════════════════════════════════════════════════════════

class BankStatement(models.Model):
    """
    Bank statement PDF upload for a period.
    Maps from: tenant.bankStatements[period]
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='bank_statements')
    period = models.CharField(max_length=7)
    file_data = models.TextField(help_text='Base64 encoded PDF (deprecado — usar statement_file)')
    # MIGRACIÓN Base64→File: nuevo campo que reemplazará a `file_data`
    statement_file = models.FileField(
        upload_to='bank_statements/', null=True, blank=True,
        help_text='Estado bancario PDF como archivo. Reemplaza al campo file_data (Base64).',
    )
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'bank_statements'
        unique_together = ['tenant', 'period']

    def __str__(self):
        return f'Bank Statement {self.tenant.name} — {self.period}'


# ═══════════════════════════════════════════════════════════
#  CLOSED PERIOD / REOPEN REQUEST
# ═══════════════════════════════════════════════════════════

class ClosedPeriod(models.Model):
    """
    Marks a period as closed (locked).
    Maps from: tenant.closedPeriods[period]
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='closed_periods')
    period = models.CharField(max_length=7, db_index=True)
    closed_at = models.DateTimeField(auto_now_add=True)
    closed_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    # Frozen dashboard + reporte-general figures so closed periods are not recomputed.
    snapshot = models.JSONField(
        default=dict, blank=True,
        help_text='Cifras congeladas del dashboard y reporte general al momento del cierre.',
    )
    snapshot_at = models.DateTimeField(
        null=True, blank=True,
        help_text='Cuándo se generó o actualizó el snapshot de cifras.',
    )

    class Meta:
        db_table = 'closed_periods'
        unique_together = ['tenant', 'period']

    def __str__(self):
        return f'Closed: {self.tenant.name} — {self.period}'


class ReopenRequest(models.Model):
    """
    Request to reopen a closed period.
    Maps from: tenant.reopenRequests[]
    """
    STATUS_CHOICES = [
        ('pending', 'Pendiente'),
        ('approved', 'Aprobado'),
        ('rejected', 'Rechazado'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='reopen_requests')
    period = models.CharField(max_length=7)
    requested_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name='reopen_requests')
    reason = models.TextField()
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='pending')
    resolved_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True,
                                     related_name='resolved_reopen_requests')
    created_at = models.DateTimeField(auto_now_add=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'reopen_requests'
        ordering = ['-created_at']

    def __str__(self):
        return f'Reopen: {self.period} ({self.status})'


# ═══════════════════════════════════════════════════════════
#  PERIOD CLOSURE REQUEST (Multi-step approval workflow)
# ═══════════════════════════════════════════════════════════

class PeriodClosureRequest(models.Model):
    """
    A request to close a period via a configurable multi-step approval workflow.
    When all steps are approved, a ClosedPeriod record is automatically created.
    """
    STATUS_CHOICES = [
        ('in_progress', 'En proceso'),
        ('completed',   'Completado'),
        ('rejected',    'Rechazado'),
    ]

    id           = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant       = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='closure_requests')
    period       = models.CharField(max_length=7, db_index=True)
    initiated_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='initiated_closures')
    status       = models.CharField(max_length=15, choices=STATUS_CHOICES, default='in_progress')
    notes        = models.TextField(blank=True, default='')
    created_at   = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'period_closure_requests'
        ordering = ['-created_at']
        indexes  = [models.Index(fields=['tenant', 'period'])]

    def __str__(self):
        return f'ClosureRequest {self.period} [{self.status}] — {self.tenant.name}'


class PeriodClosureStep(models.Model):
    """
    One approval step within a PeriodClosureRequest.
    Each step corresponds to a specific user who must approve (or reject) the closure.
    """
    STATUS_CHOICES = [
        ('pending',  'Pendiente'),
        ('approved', 'Aprobado'),
        ('rejected', 'Rechazado'),
    ]

    id              = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    closure_request = models.ForeignKey(PeriodClosureRequest, on_delete=models.CASCADE, related_name='steps')
    order           = models.PositiveSmallIntegerField()
    approver        = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='closure_steps')
    label           = models.CharField(max_length=200, blank=True, default='')
    status          = models.CharField(max_length=10, choices=STATUS_CHOICES, default='pending')
    actioned_at     = models.DateTimeField(null=True, blank=True)
    notes           = models.TextField(blank=True, default='')

    class Meta:
        db_table = 'period_closure_steps'
        ordering = ['order']
        unique_together = ['closure_request', 'order']

    def __str__(self):
        return f'Step {self.order} [{self.status}] — {self.closure_request}'


# ═══════════════════════════════════════════════════════════
#  ASSEMBLY (Organizational structure)
# ═══════════════════════════════════════════════════════════

class AssemblyPosition(models.Model):
    """
    Position in the condominium's organizational chart.
    Maps from: tenant.assemblyPositions[]
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='assembly_positions')
    title = models.CharField(max_length=200)
    holder_name = models.CharField(max_length=300, blank=True, default='')
    holder_unit = models.ForeignKey(Unit, on_delete=models.SET_NULL, null=True, blank=True)
    committee = models.ForeignKey('Committee', on_delete=models.SET_NULL, null=True, blank=True, related_name='positions')
    email = models.EmailField(blank=True, default='')
    phone = models.CharField(max_length=50, blank=True, default='')
    start_date = models.CharField(max_length=7, blank=True, default='', help_text='YYYY-MM period')
    end_date = models.CharField(max_length=7, blank=True, default='', help_text='YYYY-MM period')
    notes = models.TextField(blank=True, default='')
    active = models.BooleanField(default=True)
    sort_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'assembly_positions'
        ordering = ['sort_order']

    def __str__(self):
        return f'{self.title}: {self.holder_name or "Vacante"}'


class Committee(models.Model):
    """
    Committees within the condominium.
    Maps from: tenant.committees[]
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='committees')
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True, default='')
    exemption = models.BooleanField(default=False)
    members = models.TextField(blank=True, default='', help_text='Comma-separated member names')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'committees'
        ordering = ['name']

    def __str__(self):
        return self.name


# ═══════════════════════════════════════════════════════════
#  UNRECOGNIZED INCOME
# ═══════════════════════════════════════════════════════════

class UnrecognizedIncome(models.Model):
    """
    Income that hasn't been matched to a unit.
    Maps from: tenant.unrecognizedIncome[]
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE,
                                related_name='unrecognized_income')
    period = models.CharField(max_length=7)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    description = models.CharField(max_length=500, blank=True, default='')
    date = models.DateField(null=True, blank=True)
    payment_type = models.CharField(max_length=32, blank=True, default='')
    notes = models.CharField(max_length=500, blank=True, default='')
    bank_reconciled = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'unrecognized_income'
        ordering = ['-created_at']

    def __str__(self):
        return f'Unrecognized: {self.amount} — {self.period}'


# ═══════════════════════════════════════════════════════════
#  AMENITY RESERVATION
# ═══════════════════════════════════════════════════════════

class AmenityReservation(models.Model):
    """
    Reservation of a common area (amenity) by a unit resident.
    common_areas on Tenant is now a JSONField array of area objects.
    """
    STATUS_CHOICES = [
        ('pending',   'Pendiente'),
        ('approved',  'Aprobada'),
        ('rejected',  'Rechazada'),
        ('cancelled', 'Cancelada'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE,
                                related_name='amenity_reservations')
    unit = models.ForeignKey('Unit', on_delete=models.CASCADE,
                              related_name='amenity_reservations',
                              null=True, blank=True)
    area_id   = models.CharField(max_length=100, db_index=True)
    area_name = models.CharField(max_length=200)
    date       = models.DateField(db_index=True)
    start_time = models.TimeField()
    end_time   = models.TimeField()
    status     = models.CharField(max_length=20, choices=STATUS_CHOICES,
                                   default='pending', db_index=True)
    notes           = models.TextField(blank=True, default='')
    charge_amount   = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    requested_by    = models.ForeignKey(User, on_delete=models.SET_NULL,
                                         null=True, blank=True,
                                         related_name='requested_reservations')
    reviewed_by     = models.ForeignKey(User, on_delete=models.SET_NULL,
                                         null=True, blank=True,
                                         related_name='reviewed_reservations')
    rejection_reason = models.TextField(blank=True, default='')
    reviewer_notes   = models.TextField(blank=True, default='', help_text='Observations written by the reviewer when approving or rejecting')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'amenity_reservations'
        ordering = ['-date', 'start_time']
        indexes = [
            models.Index(fields=['tenant', 'date']),
            models.Index(fields=['tenant', 'status']),
        ]

    def __str__(self):
        return f'{self.area_name} — {self.date} {self.start_time}'


# ═══════════════════════════════════════════════════════════
#  NOTIFICATIONS
# ═══════════════════════════════════════════════════════════

class Notification(models.Model):
    TYPES = [
        # Reservas
        ('reservation_new',       'Nueva Reserva Solicitada'),
        ('reservation_approved',  'Reserva Aprobada'),
        ('reservation_rejected',  'Reserva Rechazada'),
        ('reservation_cancelled', 'Reserva Cancelada'),
        # Cobranza
        ('payment_registered',    'Pago Registrado'),
        ('payment_updated',       'Pago Actualizado'),
        ('payment_deleted',       'Cobro Eliminado'),
        # Períodos
        ('period_closed',         'Período Cerrado'),
        ('period_reopened',       'Período Reabierto'),
        # Plan de Pagos
        ('plan_proposal_sent',    'Propuesta de Plan de Pagos Enviada'),
        ('plan_accepted',         'Plan de Pagos Aceptado'),
        ('plan_rejected',         'Plan de Pagos Rechazado'),
        ('plan_cancelled',        'Plan de Pagos Cancelado'),
        # Homly Rentas
        ('rental_property_created',    'Propiedad registrada'),
        ('rental_property_status',     'Estado de propiedad'),
        ('rental_contract_created',    'Contrato creado'),
        ('rental_contract_activated',  'Contrato activado'),
        ('rental_contract_finished',   'Contrato cerrado'),
        ('rental_contract_expiring',   'Contrato por vencer'),
        ('rental_contract_expired',    'Contrato vencido'),
        ('rental_charge_generated',    'Cargos del período'),
        ('rental_payment_registered',  'Pago de renta'),
        ('rental_payment_deleted',     'Pago de renta eliminado'),
        ('rental_lead_created',        'Nuevo lead'),
        ('rental_lead_moved',          'Lead actualizado'),
        ('rental_lead_converted',      'Lead convertido'),
        ('rental_lead_lost',           'Lead perdido'),
        ('rental_airbnb_imported',     'Airbnb importado'),
        ('rental_airbnb_synced',       'Airbnb sincronizado'),
        ('rental_airbnb_error',        'Error de Airbnb'),
        # Asambleas
        ('assembly_notice',       'Convocatoria de asamblea'),
        ('assembly_started',      'Asamblea en curso'),
        ('assembly_minute',       'Minuta de asamblea'),
        # General
        ('general',               'Información General'),
    ]

    id        = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant    = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='notifications')
    user      = models.ForeignKey(User,   on_delete=models.CASCADE, related_name='notifications')
    notif_type = models.CharField(max_length=40, choices=TYPES, default='general', db_index=True)
    title     = models.CharField(max_length=200)
    message   = models.TextField(blank=True, default='')
    is_read   = models.BooleanField(default=False, db_index=True)
    # Optional link back to a reservation
    related_reservation = models.ForeignKey(
        AmenityReservation, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='notifications',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'notifications'
        ordering = ['-created_at']
        indexes  = [
            models.Index(fields=['tenant', 'user', 'is_read']),
        ]

    def __str__(self):
        return f'[{self.notif_type}] {self.title} → {self.user}'



# ═══════════════════════════════════════════════════════════
#  AUDIT LOG
# ═══════════════════════════════════════════════════════════

class AuditLog(models.Model):
    """Immutable record of every significant action performed in the system.
    Visible only to super-admin users."""

    MODULE_CHOICES = [
        ('auth',       'Autenticación'),
        ('cobranza',   'Cobranza'),
        ('gastos',     'Gastos'),
        ('reservas',   'Reservas'),
        ('usuarios',   'Usuarios'),
        ('unidades',   'Unidades'),
        ('config',     'Configuración'),
        ('tenants',    'Tenants'),
        ('sistema',    'Sistema'),
    ]

    ACTION_CHOICES = [
        ('login',            'Inicio de sesión'),
        ('create',           'Crear registro'),
        ('update',           'Actualizar registro'),
        ('delete',           'Eliminar registro'),
        ('approve',          'Aprobar'),
        ('reject',           'Rechazar'),
        ('cancel',           'Cancelar'),
        ('close_period',     'Cerrar período'),
        ('reopen_period',    'Reabrir período'),
        ('send_email',       'Enviar correo'),
        ('toggle_status',    'Cambiar estado'),
        ('add_payment',      'Agregar pago adicional'),
    ]

    id          = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    # Context — stored as snapshot so logs survive deletions
    tenant      = models.ForeignKey(Tenant, on_delete=models.SET_NULL, null=True, blank=True, related_name='audit_logs')
    tenant_name = models.CharField(max_length=200, blank=True, default='')
    user        = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='audit_logs')
    user_name   = models.CharField(max_length=200, blank=True, default='')
    user_email  = models.CharField(max_length=200, blank=True, default='')
    user_role   = models.CharField(max_length=40, blank=True, default='')
    # What happened
    module      = models.CharField(max_length=40, choices=MODULE_CHOICES, db_index=True)
    action      = models.CharField(max_length=40, choices=ACTION_CHOICES, db_index=True)
    description = models.TextField(blank=True, default='')
    # Affected object
    object_type = models.CharField(max_length=80, blank=True, default='')
    object_id   = models.CharField(max_length=100, blank=True, default='')
    object_repr = models.CharField(max_length=300, blank=True, default='')
    # Network
    ip_address  = models.GenericIPAddressField(null=True, blank=True)
    # Extra structured data
    extra_data  = models.JSONField(default=dict, blank=True)
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'audit_logs'
        ordering = ['-created_at']
        indexes  = [
            models.Index(fields=['tenant', '-created_at']),
            models.Index(fields=['user',   '-created_at']),
            models.Index(fields=['module', 'action']),
        ]

    def __str__(self):
        return f'[{self.module}/{self.action}] {self.description[:60]}'


# ═══════════════════════════════════════════════════════════
#  CONDOMINIO REQUEST (Landing page registration leads)
# ═══════════════════════════════════════════════════════════

class CondominioRequest(models.Model):
    """
    Stores registration requests submitted through the landing page.
    Each record represents a potential new condominium/tenant.
    """
    STATUS_CHOICES = [
        ('pending',   'Pendiente'),
        ('contacted', 'Contactado'),
        ('enrolled',  'Inscrito'),
        ('rejected',  'Rechazado'),
    ]
    ADMIN_TYPE_CHOICES = [
        ('mesa_directiva',   'Mesa Directiva'),
        ('administrador',    'Administrador Externo'),
        ('comite',           'Comité'),
    ]
    CURRENCY_CHOICES = [
        ('MXN', 'Peso Mexicano'),
        ('USD', 'US Dollar'),
        ('EUR', 'Euro'),
        ('COP', 'Peso Colombiano'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # Condominium info
    condominio_nombre    = models.CharField(max_length=300)
    condominio_pais      = models.CharField(max_length=100, blank=True, default='')
    condominio_estado    = models.CharField(max_length=100, blank=True, default='')
    condominio_ciudad    = models.CharField(max_length=200, blank=True, default='')
    condominio_unidades  = models.PositiveIntegerField(default=0)
    condominio_tipo_admin = models.CharField(max_length=20, choices=ADMIN_TYPE_CHOICES, default='mesa_directiva')
    condominio_currency  = models.CharField(max_length=3, choices=CURRENCY_CHOICES, default='MXN')

    # Responsible admin info
    admin_nombre    = models.CharField(max_length=200)
    admin_apellido  = models.CharField(max_length=200)
    admin_email     = models.EmailField(db_index=True)
    admin_telefono  = models.CharField(max_length=30, blank=True, default='')
    admin_cargo     = models.CharField(max_length=200, blank=True, default='')

    # Additional
    mensaje = models.TextField(blank=True, default='')

    # Subscription / trial tracking
    subscription_plan = models.ForeignKey(
        'SubscriptionPlan', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='trial_requests'
    )
    trial_days       = models.PositiveIntegerField(default=7)
    approved_at      = models.DateTimeField(null=True, blank=True)
    approved_by      = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='approved_trial_requests'
    )
    rejected_at      = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True, default='')
    # Set after approval — FK to the auto-created tenant
    tenant           = models.OneToOneField(
        'Tenant', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='trial_request'
    )
    # Admin notes (internal, not visible to applicant)
    admin_notes      = models.TextField(blank=True, default='')

    # Internal tracking
    status     = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending', db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'condominio_requests'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.condominio_nombre} — {self.admin_email}'


# ═══════════════════════════════════════════════════════════
#  EMAIL VERIFICATION CODE (magic link / OTP login)
# ═══════════════════════════════════════════════════════════

class EmailVerificationCode(models.Model):
    """
    Temporary verification codes for passwordless login.
    Codes expire after CODE_EXPIRY_MINUTES (typically 10–15 min).
    """
    id        = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email     = models.EmailField(db_index=True)
    code      = models.CharField(max_length=8, db_index=True)  # 6-digit typical
    used      = models.BooleanField(default=False, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(db_index=True)

    class Meta:
        db_table = 'email_verification_codes'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.email} — {self.code[:3]}*** (exp: {self.expires_at})'


# ═══════════════════════════════════════════════════════════
#  SUBSCRIPTION PLANS
# ═══════════════════════════════════════════════════════════

class SubscriptionPlan(models.Model):
    """
    Configurable subscription tiers offered to tenants.
    Supports per-unit pricing, volume tiers, and multi-currency.
    """
    CURRENCY_CHOICES = [
        ('MXN', 'Peso Mexicano'),
        ('USD', 'US Dollar'),
        ('EUR', 'Euro'),
        ('COP', 'Peso Colombiano'),
    ]
    BILLING_CHOICES = [
        ('monthly', 'Mensual'),
        ('annual',  'Anual'),
    ]
    WORKSPACE_TYPE_CHOICES = [
        ('condominio', 'Administración de condominios'),
        ('rentas', 'Gestión de rentas'),
    ]

    id               = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name             = models.CharField(max_length=100)
    workspace_type   = models.CharField(
        max_length=20,
        choices=WORKSPACE_TYPE_CHOICES,
        default='condominio',
        db_index=True,
        help_text='Catálogo de planes independiente por espacio de trabajo.',
    )
    description      = models.TextField(blank=True, default='')
    price_per_unit   = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    currency         = models.CharField(max_length=3, choices=CURRENCY_CHOICES, default='MXN')
    billing_cycle    = models.CharField(max_length=10, choices=BILLING_CHOICES, default='monthly')
    # Discount applied when tenant pays the full annual amount upfront (0–100 %)
    annual_discount_percent = models.DecimalField(
        max_digits=5, decimal_places=2, default=0,
        help_text='Porcentaje de descuento por pago anual anticipado (0–100)',
    )
    trial_days       = models.PositiveIntegerField(default=7)
    # Volume tiers JSON: [{"min_units": 1, "max_units": 50, "price_per_unit": 50.00}, ...]
    # max_units=null means "unlimited"
    volume_tiers     = models.JSONField(default=list, blank=True)
    # Features list: ["Cobranza mensual", "Estado de cuenta", ...]  (marketing copy)
    features         = models.JSONField(default=list, blank=True)
    # Module keys included in this plan. Empty list = all modules allowed.
    # Keys: dashboard, reservas, notificaciones, onboarding,
    #       cobranza, gastos, caja_chica, estado_cuenta, plan_pagos,
    #       cierre_periodo, config, my_unit
    # Note: mi_membresia is always exempt from plan restrictions.
    allowed_modules  = models.JSONField(
        default=list, blank=True,
        help_text='Module keys visible to tenants on this plan. Empty = all modules.',
    )
    is_active        = models.BooleanField(default=True, db_index=True)
    sort_order       = models.PositiveIntegerField(default=0)
    created_at       = models.DateTimeField(auto_now_add=True)
    updated_at       = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'subscription_plans'
        ordering = ['sort_order', 'name']

    def __str__(self):
        return f'{self.name} ({self.currency} {self.price_per_unit}/unidad/{self.billing_cycle})'

    def price_for_units(self, units_count, annual=False):
        """
        Calculate price for a given number of units.
        If annual=True, returns the annual total after applying annual_discount_percent.
        Otherwise returns the monthly total.
        """
        if self.volume_tiers:
            for tier in sorted(self.volume_tiers, key=lambda t: t.get('min_units', 0)):
                min_u = tier.get('min_units', 0)
                max_u = tier.get('max_units')  # None = unlimited
                if units_count >= min_u and (max_u is None or units_count <= max_u):
                    monthly = float(tier.get('price_per_unit', 0)) * units_count
                    break
            else:
                monthly = float(self.price_per_unit) * units_count
        else:
            monthly = float(self.price_per_unit) * units_count

        if annual:
            discount = float(self.annual_discount_percent or 0) / 100
            return monthly * 12 * (1 - discount)
        return monthly


# ═══════════════════════════════════════════════════════════
#  TENANT SUBSCRIPTION
# ═══════════════════════════════════════════════════════════

class TenantSubscription(models.Model):
    """
    Tracks the subscription status for each tenant.
    One record per tenant (upserted on each plan change).
    """
    STATUS_CHOICES = [
        ('trial',     'Período de Prueba'),
        ('active',    'Activa'),
        ('past_due',  'Vencida'),
        ('cancelled', 'Cancelada'),
        ('expired',   'Expirada'),
    ]

    id               = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant           = models.OneToOneField(Tenant, on_delete=models.CASCADE, related_name='subscription')
    plan             = models.ForeignKey(
        SubscriptionPlan, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='subscriptions'
    )
    status           = models.CharField(max_length=12, choices=STATUS_CHOICES, default='trial', db_index=True)
    trial_start      = models.DateField(null=True, blank=True)
    trial_end        = models.DateField(null=True, blank=True)
    billing_start    = models.DateField(null=True, blank=True)
    units_count      = models.PositiveIntegerField(default=0)
    amount_per_cycle = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    currency         = models.CharField(max_length=3, default='MXN')
    next_billing_date = models.DateField(null=True, blank=True)
    notes            = models.TextField(blank=True, default='')
    # Immutable log of past subscription periods.
    # Each entry is a snapshot dict saved when the subscription is deactivated.
    subscription_history = models.JSONField(
        default=list, blank=True,
        help_text='Historial de periodos anteriores de suscripción (snapshots al desactivar).'
    )
    created_at       = models.DateTimeField(auto_now_add=True)
    updated_at       = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'tenant_subscriptions'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.tenant.name} — {self.get_status_display()}'

    @property
    def trial_days_remaining(self):
        from datetime import date
        if self.status == 'trial' and self.trial_end:
            delta = (self.trial_end - date.today()).days
            return max(0, delta)
        return 0

    def sync_tenant_active(self):
        """
        Keep Tenant.is_active in sync with subscription status.
        - trial / active  → tenant active (can use the platform)
        - past_due        → tenant INACTIVE (suspended until payment is registered)
        - cancelled / expired → tenant inactive
        The grace period (5 days from next_billing_date) is enforced by the
        billing-check job BEFORE setting status to past_due, so by the time
        a subscription is past_due the grace has already elapsed.
        """
        active_statuses = {'trial', 'active'}
        should_be_active = self.status in active_statuses
        if self.tenant.is_active != should_be_active:
            Tenant.objects.filter(pk=self.tenant_id).update(is_active=should_be_active)
            self.tenant.is_active = should_be_active


# ═══════════════════════════════════════════════════════════
#  SUBSCRIPTION PAYMENTS (manual confirmations by superadmin)
# ═══════════════════════════════════════════════════════════

class SubscriptionPayment(models.Model):
    """
    Manual payment record for a tenant subscription.
    Superadmins create these to confirm received payments.
    """
    PAYMENT_METHOD_CHOICES = [
        ('transfer', 'Transferencia Bancaria'),
        ('cash',     'Efectivo'),
        ('card',     'Tarjeta'),
        ('other',    'Otro'),
    ]

    id               = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    subscription     = models.ForeignKey(
        TenantSubscription, on_delete=models.CASCADE, related_name='payments',
    )
    amount           = models.DecimalField(max_digits=12, decimal_places=2)
    currency         = models.CharField(max_length=3, default='MXN')
    period_label     = models.CharField(
        max_length=100, blank=True, default='',
        help_text='Billing period covered, e.g. "Enero 2025" or "2025-01 / 2025-12"',
    )
    payment_date     = models.DateField()
    payment_method   = models.CharField(
        max_length=15, choices=PAYMENT_METHOD_CHOICES, default='transfer',
    )
    reference        = models.CharField(max_length=200, blank=True, default='',
                                        help_text='Transaction ID, check number, etc.')
    notes            = models.TextField(blank=True, default='')
    recorded_by      = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='recorded_payments',
    )
    created_at       = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'subscription_payments'
        ordering = ['-payment_date', '-created_at']

    def __str__(self):
        return f'{self.subscription.tenant.name} — {self.amount} {self.currency} ({self.payment_date})'


# ═══════════════════════════════════════════════════════════
#  CRM — Commercial Management Module (SuperAdmin only)
# ═══════════════════════════════════════════════════════════

class CRMContact(models.Model):
    """
    CRM Contact: prospect or customer in the Homly commercial pipeline.
    Can be created from a CondominioRequest (landing page lead) or manually.
    """
    SOURCE_CHOICES = [
        ('landing_form', 'Formulario Landing Page'),
        ('manual',       'Ingreso Manual'),
        ('referral',     'Referido'),
        ('import',       'Importación'),
        ('cold_outreach','Prospección Directa'),
        ('social_media', 'Redes Sociales'),
        ('event',        'Evento / Expo'),
        ('other',        'Otro'),
    ]
    STATUS_CHOICES = [
        ('lead',        'Lead'),
        ('prospect',    'Prospecto'),
        ('qualified',   'Calificado'),
        ('customer',    'Cliente Activo'),
        ('churned',     'Cliente Perdido'),
        ('lost',        'Perdido'),
    ]

    id              = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # Link to landing page request
    condominio_request = models.OneToOneField(
        CondominioRequest, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='crm_contact',
    )
    # Link to tenant if already enrolled
    tenant          = models.OneToOneField(
        Tenant, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='crm_contact',
    )

    # Contact info
    first_name      = models.CharField(max_length=200)
    last_name       = models.CharField(max_length=200, blank=True, default='')
    email           = models.EmailField(db_index=True)
    phone           = models.CharField(max_length=50, blank=True, default='')
    company         = models.CharField(max_length=300, blank=True, default='',
                                        help_text='Nombre del condominio / empresa')
    cargo           = models.CharField(max_length=200, blank=True, default='')
    country         = models.CharField(max_length=100, blank=True, default='')
    state           = models.CharField(max_length=100, blank=True, default='')
    city            = models.CharField(max_length=200, blank=True, default='')
    units_count     = models.PositiveIntegerField(default=0,
                                                   help_text='Número de unidades del condominio')

    # Pipeline
    source          = models.CharField(max_length=20, choices=SOURCE_CHOICES, default='manual', db_index=True)
    status          = models.CharField(max_length=20, choices=STATUS_CHOICES, default='lead', db_index=True)
    lead_score      = models.PositiveSmallIntegerField(default=0,
                                                        help_text='Score 0-100 de calidad del lead')

    # Assignment
    assigned_to     = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='crm_contacts_assigned',
    )

    # Meta
    tags            = models.JSONField(default=list, blank=True)
    notes           = models.TextField(blank=True, default='')
    last_activity_at = models.DateTimeField(null=True, blank=True)
    created_at      = models.DateTimeField(auto_now_add=True)
    updated_at      = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'crm_contacts'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.first_name} {self.last_name} <{self.email}>'

    @property
    def full_name(self):
        return f'{self.first_name} {self.last_name}'.strip()


class CRMOpportunity(models.Model):
    """
    Sales opportunity linked to a CRM contact. Visualized as a kanban pipeline.
    """
    STAGE_CHOICES = [
        ('new',          'Nuevo'),
        ('contacted',    'Contactado'),
        ('qualified',    'Calificado'),
        ('demo',         'Demo / Presentación'),
        ('proposal',     'Propuesta Enviada'),
        ('negotiation',  'Negociación'),
        ('won',          'Ganado'),
        ('lost',         'Perdido'),
    ]
    CURRENCY_CHOICES = [
        ('MXN', 'Peso Mexicano'), ('USD', 'US Dollar'),
        ('EUR', 'Euro'), ('COP', 'Peso Colombiano'),
    ]

    id              = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    contact         = models.ForeignKey(
        CRMContact, on_delete=models.CASCADE, related_name='opportunities',
    )
    title           = models.CharField(max_length=300)
    stage           = models.CharField(max_length=20, choices=STAGE_CHOICES, default='new', db_index=True)
    stage_order     = models.PositiveSmallIntegerField(default=0,
                                                        help_text='Ordering within the stage column')
    value           = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    currency        = models.CharField(max_length=3, choices=CURRENCY_CHOICES, default='MXN')
    probability     = models.PositiveSmallIntegerField(default=50,
                                                        help_text='Probabilidad de cierre 0-100%')
    expected_close  = models.DateField(null=True, blank=True)
    actual_close    = models.DateField(null=True, blank=True)
    won_at          = models.DateTimeField(null=True, blank=True)
    lost_at         = models.DateTimeField(null=True, blank=True)
    lost_reason     = models.TextField(blank=True, default='')
    assigned_to     = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='crm_opportunities_assigned',
    )
    notes           = models.TextField(blank=True, default='')
    created_at      = models.DateTimeField(auto_now_add=True)
    updated_at      = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'crm_opportunities'
        ordering = ['stage_order', '-created_at']

    def __str__(self):
        return f'{self.title} ({self.contact.full_name}) — {self.stage}'


class CRMActivity(models.Model):
    """
    Activity / interaction log entry for a contact or opportunity.
    Tracks calls, emails, meetings, demos, tasks, notes, etc.
    """
    TYPE_CHOICES = [
        ('call',      'Llamada'),
        ('email',     'Email'),
        ('whatsapp',  'WhatsApp'),
        ('meeting',   'Reunión'),
        ('demo',      'Demo'),
        ('note',      'Nota Interna'),
        ('task',      'Tarea'),
        ('follow_up', 'Seguimiento'),
    ]

    id          = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    contact     = models.ForeignKey(
        CRMContact, on_delete=models.CASCADE, related_name='activities',
        null=True, blank=True,
    )
    opportunity = models.ForeignKey(
        CRMOpportunity, on_delete=models.CASCADE, related_name='activities',
        null=True, blank=True,
    )
    type        = models.CharField(max_length=20, choices=TYPE_CHOICES, default='note')
    title       = models.CharField(max_length=300)
    description = models.TextField(blank=True, default='')
    outcome     = models.TextField(blank=True, default='',
                                    help_text='Result / next step from this activity')
    scheduled_at  = models.DateTimeField(null=True, blank=True)
    completed_at  = models.DateTimeField(null=True, blank=True)
    is_completed  = models.BooleanField(default=False)
    created_by    = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='crm_activities_created',
    )
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'crm_activities'
        ordering = ['-created_at']

    def __str__(self):
        return f'[{self.type}] {self.title}'


class CRMCampaign(models.Model):
    """
    Marketing campaign targeting CRM contacts.
    """
    TYPE_CHOICES = [
        ('email',     'Email Marketing'),
        ('whatsapp',  'WhatsApp Masivo'),
        ('sms',       'SMS'),
        ('social',    'Redes Sociales'),
    ]
    STATUS_CHOICES = [
        ('draft',     'Borrador'),
        ('scheduled', 'Programada'),
        ('active',    'Activa'),
        ('paused',    'Pausada'),
        ('completed', 'Completada'),
        ('cancelled', 'Cancelada'),
    ]

    id              = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name            = models.CharField(max_length=300)
    type            = models.CharField(max_length=20, choices=TYPE_CHOICES, default='email')
    status          = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft', db_index=True)
    subject         = models.CharField(max_length=300, blank=True, default='',
                                        help_text='Email subject line')
    body_text       = models.TextField(blank=True, default='')
    body_html       = models.TextField(blank=True, default='')
    target_filters  = models.JSONField(default=dict, blank=True,
                                        help_text='Audience filter criteria: {status, source, tags, ...}')
    scheduled_at    = models.DateTimeField(null=True, blank=True)
    sent_at         = models.DateTimeField(null=True, blank=True)
    stats           = models.JSONField(default=dict, blank=True,
                                        help_text='{sent, opened, clicked, converted, bounced}')
    created_by      = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='crm_campaigns_created',
    )
    created_at      = models.DateTimeField(auto_now_add=True)
    updated_at      = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'crm_campaigns'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.name} [{self.type} — {self.status}]'


class CRMCampaignContact(models.Model):
    """
    Many-to-many: Campaign ↔ Contact with delivery status tracking.
    """
    DELIVERY_STATUS_CHOICES = [
        ('pending',       'Pendiente'),
        ('sent',          'Enviado'),
        ('opened',        'Abierto'),
        ('clicked',       'Clic'),
        ('converted',     'Convertido'),
        ('bounced',       'Rebotado'),
        ('unsubscribed',  'Desuscrito'),
    ]

    id              = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    campaign        = models.ForeignKey(CRMCampaign, on_delete=models.CASCADE, related_name='recipients')
    contact         = models.ForeignKey(CRMContact, on_delete=models.CASCADE, related_name='campaign_entries')
    delivery_status = models.CharField(max_length=20, choices=DELIVERY_STATUS_CHOICES, default='pending')
    sent_at         = models.DateTimeField(null=True, blank=True)
    opened_at       = models.DateTimeField(null=True, blank=True)
    clicked_at      = models.DateTimeField(null=True, blank=True)
    converted_at    = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'crm_campaign_contacts'
        unique_together = [('campaign', 'contact')]
        ordering = ['-sent_at']

    def __str__(self):
        return f'{self.campaign.name} → {self.contact.email} [{self.delivery_status}]'


class CRMTicket(models.Model):
    """
    Support / service ticket linked to a contact or an existing tenant.
    """
    TYPE_CHOICES = [
        ('support',         'Soporte Técnico'),
        ('billing',         'Facturación / Cobro'),
        ('onboarding',      'Onboarding'),
        ('feature_request', 'Solicitud de Función'),
        ('complaint',       'Reclamo'),
        ('other',           'Otro'),
    ]
    PRIORITY_CHOICES = [
        ('low',    'Baja'),
        ('normal', 'Normal'),
        ('high',   'Alta'),
        ('urgent', 'Urgente'),
    ]
    STATUS_CHOICES = [
        ('open',        'Abierto'),
        ('in_progress', 'En Progreso'),
        ('waiting',     'Esperando Cliente'),
        ('resolved',    'Resuelto'),
        ('closed',      'Cerrado'),
    ]

    id                  = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    contact             = models.ForeignKey(
        CRMContact, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='tickets',
    )
    tenant              = models.ForeignKey(
        Tenant, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='crm_tickets',
    )
    subject             = models.CharField(max_length=400)
    description         = models.TextField(blank=True, default='')
    type                = models.CharField(max_length=20, choices=TYPE_CHOICES, default='support')
    priority            = models.CharField(max_length=10, choices=PRIORITY_CHOICES, default='normal', db_index=True)
    status              = models.CharField(max_length=20, choices=STATUS_CHOICES, default='open', db_index=True)
    assigned_to         = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='crm_tickets_assigned',
    )
    tags                = models.JSONField(default=list, blank=True)
    resolution_notes    = models.TextField(blank=True, default='')
    first_response_at   = models.DateTimeField(null=True, blank=True)
    resolved_at         = models.DateTimeField(null=True, blank=True)
    created_at          = models.DateTimeField(auto_now_add=True)
    updated_at          = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'crm_tickets'
        ordering = ['-created_at']

    def __str__(self):
        return f'[{self.priority.upper()}] {self.subject} — {self.status}'


# ═══════════════════════════════════════════════════════════
#  SYSTEM ROLES (Homly staff role templates)
# ═══════════════════════════════════════════════════════════

# ═══════════════════════════════════════════════════════════
#  BLOG
# ═══════════════════════════════════════════════════════════

class BlogPost(models.Model):
    """
    Community blog post for a tenant. Supports drafts, publishing workflow,
    audience targeting, and rich-text content with optional cover media.
    """
    STATUS_CHOICES = [
        ('draft',     'Borrador'),
        ('published', 'Publicado'),
        ('editing',   'En Edición'),
    ]
    AUDIENCE_CHOICES = [
        ('all',      'Todos los miembros'),
        ('roles',    'Por Rol'),
        ('specific', 'Usuarios Específicos'),
    ]
    CATEGORY_CHOICES = [
        ('aviso',        'Aviso'),
        ('mantenimiento','Mantenimiento'),
        ('evento',       'Evento'),
        ('reglamento',   'Reglamento'),
        ('logro',        'Noticia / Logro'),
    ]

    id               = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant           = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='blog_posts')
    author           = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name='blog_posts'
    )
    title            = models.CharField(max_length=300)
    excerpt          = models.CharField(max_length=500, blank=True, default='')
    content          = models.TextField(blank=True, default='')
    # Visual cover — gradient theme (Tailwind class strings) + emoji fallback + optional image
    cover_gradient   = models.CharField(max_length=120, default='from-teal-400 to-cyan-500')
    cover_emoji      = models.CharField(max_length=10,  default='📰')
    cover_image      = models.ImageField(upload_to='blog/covers/', null=True, blank=True)
    status           = models.CharField(max_length=20,  choices=STATUS_CHOICES,   default='draft',  db_index=True)
    category         = models.CharField(max_length=30,  choices=CATEGORY_CHOICES, blank=True, default='', db_index=True)
    tags             = models.JSONField(default=list,  blank=True)
    # Audience targeting
    audience_type    = models.CharField(max_length=20, choices=AUDIENCE_CHOICES, default='all')
    audience_roles   = models.JSONField(default=list, blank=True,
                        help_text='Role keys included when audience_type == "roles"')
    audience_user_ids = models.JSONField(default=list, blank=True,
                        help_text='User UUIDs (str) included when audience_type == "specific"')
    views_count      = models.PositiveIntegerField(default=0)
    published_at     = models.DateTimeField(null=True, blank=True)
    created_at       = models.DateTimeField(auto_now_add=True)
    updated_at       = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'blog_posts'
        ordering = ['-created_at']
        indexes  = [
            models.Index(fields=['tenant', 'status']),
            models.Index(fields=['tenant', 'category']),
        ]

    def __str__(self):
        return f'[{self.status}] {self.title} ({self.tenant})'

    def is_visible_to(self, user, role):
        """Return True if *user* with *role* can see this post."""
        if self.status != 'published':
            # Non-published posts visible only to admins / authors
            return role in ('superadmin', 'admin') or (user and self.author_id == user.pk)
        if self.audience_type == 'all':
            return True
        if self.audience_type == 'roles':
            return role in (self.audience_roles or [])
        if self.audience_type == 'specific':
            return user and str(user.pk) in (self.audience_user_ids or [])
        return True


class BlogReaction(models.Model):
    """Emoji reaction on a blog post (one per user per type)."""
    REACTION_CHOICES = [
        ('like',    '👍'),
        ('love',    '❤️'),
        ('clap',    '👏'),
        ('idea',    '💡'),
    ]
    id       = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    post     = models.ForeignKey(BlogPost, on_delete=models.CASCADE, related_name='reactions')
    user     = models.ForeignKey(User,     on_delete=models.CASCADE, related_name='blog_reactions')
    reaction = models.CharField(max_length=10, choices=REACTION_CHOICES)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'blog_reactions'
        unique_together = ['post', 'user', 'reaction']

    def __str__(self):
        return f'{self.user} {self.reaction} → {self.post_id}'


class BlogComment(models.Model):
    """Comment thread on a blog post."""
    id         = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    post       = models.ForeignKey(BlogPost,   on_delete=models.CASCADE, related_name='comments')
    author     = models.ForeignKey(User,       on_delete=models.SET_NULL, null=True, related_name='blog_comments')
    content    = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'blog_comments'
        ordering = ['created_at']

    def __str__(self):
        return f'Comment by {self.author} on {self.post_id}'


# ═══════════════════════════════════════════════════════════

class SystemRole(models.Model):
    """
    Reusable role template for Homly internal staff users.
    Defines a name, description and a permission set (modules + tabs).
    When a SystemUser is created or updated, the role's permissions are
    copied onto the user (denormalised for fast access).
    """
    name          = models.CharField(max_length=120, unique=True)
    description   = models.CharField(max_length=255, blank=True, default='')
    is_super_admin = models.BooleanField(default=False,
                     help_text='Grants full system access to users assigned this role')
    permissions   = models.JSONField(default=dict, blank=True,
                    help_text='{ modules: [str], module_tabs: {modId: [tabId]} }')
    created_at    = models.DateTimeField(auto_now_add=True)
    updated_at    = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'system_roles'
        ordering = ['name']

    def __str__(self):
        return self.name


# ═══════════════════════════════════════════════════════════
#  PAYMENT VOUCHER SUBMISSION (Comprobantes de pago de residentes)
# ═══════════════════════════════════════════════════════════

class PaymentVoucherSubmission(models.Model):
    """
    Comprobante de pago enviado por un residente.
    El residente adjunta una imagen/archivo como evidencia de pago para un
    período determinado. El admin/tesorero puede aceptar o rechazar el envío.
    """
    STATUS_CHOICES = [
        ('pending',  'Pendiente'),
        ('received', 'Recibido'),
        ('rejected', 'Rechazado'),
    ]

    id           = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant       = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='voucher_submissions')
    unit         = models.ForeignKey(Unit,   on_delete=models.CASCADE, related_name='voucher_submissions')
    submitted_by = models.ForeignKey(User,   on_delete=models.SET_NULL, null=True, related_name='voucher_submissions')
    period       = models.CharField(max_length=7, help_text='YYYY-MM')
    notes        = models.TextField(blank=True, default='')
    evidence_file = models.FileField(
        upload_to='voucher_submissions/', null=True, blank=True,
        help_text='Imagen o PDF del comprobante de pago'
    )
    status       = models.CharField(max_length=10, choices=STATUS_CHOICES, default='pending', db_index=True)
    reviewed_by  = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True,
                                     related_name='reviewed_vouchers')
    reviewed_at  = models.DateTimeField(null=True, blank=True)
    review_notes = models.TextField(blank=True, default='')
    created_at   = models.DateTimeField(auto_now_add=True)
    updated_at   = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'payment_voucher_submissions'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['tenant', 'status']),
            models.Index(fields=['tenant', 'unit', 'period']),
        ]

    def __str__(self):
        return f'Voucher {self.unit} {self.period} [{self.status}]'


# ═══════════════════════════════════════════════════════════
#  RENTAS — inventario, contratos y cobranza (workspace independiente)
# ═══════════════════════════════════════════════════════════

class RentalProperty(models.Model):
    """Inmueble administrado en renta por un tenant tipo inmobiliaria."""
    PROPERTY_TYPE_CHOICES = [
        ('casa', 'Casa'),
        ('departamento', 'Departamento'),
        ('local', 'Local comercial'),
        ('oficina', 'Oficina'),
        ('bodega', 'Bodega'),
        ('terreno', 'Terreno'),
        ('otro', 'Otro'),
    ]
    STATUS_CHOICES = [
        ('disponible', 'Disponible'),
        ('ocupada', 'Ocupada'),
        ('reservada', 'Reservada'),
        ('mantenimiento', 'En mantenimiento'),
        ('inactiva', 'Inactiva'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='rental_properties')
    code = models.CharField(max_length=40, db_index=True)
    name = models.CharField(max_length=300)
    property_type = models.CharField(max_length=20, choices=PROPERTY_TYPE_CHOICES, default='departamento')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='disponible', db_index=True)
    street = models.CharField(max_length=300, blank=True, default='')
    ext_number = models.CharField(max_length=50, blank=True, default='')
    int_number = models.CharField(max_length=50, blank=True, default='')
    neighborhood = models.CharField(max_length=200, blank=True, default='')
    city = models.CharField(max_length=200, blank=True, default='')
    state = models.CharField(max_length=100, blank=True, default='')
    postal_code = models.CharField(max_length=12, blank=True, default='')
    bedrooms = models.PositiveSmallIntegerField(default=0)
    bathrooms = models.DecimalField(max_digits=4, decimal_places=1, default=0)
    area_m2 = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    suggested_rent = models.DecimalField(max_digits=12, decimal_places=2, default=0,
                                         validators=[MinValueValidator(0)])
    owner_name = models.CharField(max_length=200, blank=True, default='')
    owner_email = models.EmailField(blank=True, default='')
    owner_phone = models.CharField(max_length=40, blank=True, default='')
    notes = models.TextField(blank=True, default='')
    is_active = models.BooleanField(default=True)
    source = models.CharField(
        max_length=20, default='homly', db_index=True,
        help_text='homly | airbnb',
    )
    airbnb_listing_id = models.CharField(max_length=40, blank=True, default='', db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'rental_properties'
        ordering = ['code']
        unique_together = ['tenant', 'code']

    def __str__(self):
        return f'{self.code} — {self.name}'

    @property
    def address_line(self):
        parts = [
            ' '.join(p for p in [self.street, self.ext_number] if p).strip(),
            self.int_number and f'Int. {self.int_number}',
            self.neighborhood, self.city, self.state, self.postal_code,
        ]
        return ', '.join(p for p in parts if p)


class RentalParty(models.Model):
    """Contacto del espacio de rentas: inquilino, fiador o propietario."""
    KIND_CHOICES = [
        ('inquilino', 'Inquilino'),
        ('fiador', 'Fiador'),
        ('propietario', 'Propietario'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='rental_parties')
    kind = models.CharField(max_length=20, choices=KIND_CHOICES, default='inquilino', db_index=True)
    first_name = models.CharField(max_length=150)
    last_name = models.CharField(max_length=150, blank=True, default='')
    email = models.EmailField(blank=True, default='')
    phone = models.CharField(max_length=40, blank=True, default='')
    rfc = models.CharField(max_length=20, blank=True, default='')
    notes = models.TextField(blank=True, default='')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'rental_parties'
        ordering = ['last_name', 'first_name']

    def __str__(self):
        return self.full_name

    @property
    def full_name(self):
        return f'{self.first_name} {self.last_name}'.strip()


class RentalChargeConcept(models.Model):
    """Conceptos cobrables del tenant de rentas (renta, depósito, extras)."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='rental_concepts')
    name = models.CharField(max_length=120)
    default_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0,
                                         validators=[MinValueValidator(0)])
    is_recurring = models.BooleanField(default=True)
    is_rent = models.BooleanField(default=False)
    enabled = models.BooleanField(default=True)
    sort_order = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'rental_charge_concepts'
        ordering = ['sort_order', 'name']
        unique_together = ['tenant', 'name']

    def __str__(self):
        return self.name


class RentalContract(models.Model):
    """Contrato de arrendamiento."""
    STATUS_CHOICES = [
        ('borrador', 'Borrador'),
        ('activo', 'Activo'),
        ('por_vencer', 'Por vencer'),
        ('vencido', 'Vencido'),
        ('renovado', 'Renovado'),
        ('finalizado', 'Finalizado'),
        ('cancelado', 'Cancelado'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='rental_contracts')
    property = models.ForeignKey(RentalProperty, on_delete=models.PROTECT, related_name='contracts')
    tenant_party = models.ForeignKey(
        RentalParty, on_delete=models.PROTECT, related_name='contracts',
        help_text='Inquilino titular del contrato.',
    )
    guarantor = models.ForeignKey(
        RentalParty, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='guaranteed_contracts',
    )
    code = models.CharField(max_length=40, db_index=True)
    start_date = models.DateField()
    end_date = models.DateField()
    rent_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0,
                                      validators=[MinValueValidator(0)])
    deposit_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0,
                                         validators=[MinValueValidator(0)])
    payment_day = models.PositiveSmallIntegerField(default=1)
    increment_pct = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    late_fee_pct = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='borrador', db_index=True)
    notes = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'rental_contracts'
        ordering = ['-start_date']
        unique_together = ['tenant', 'code']
        indexes = [
            models.Index(fields=['tenant', 'status']),
            models.Index(fields=['tenant', 'end_date']),
        ]

    def __str__(self):
        return f'{self.code} — {self.property.code}'

    def refresh_lifecycle_status(self, today=None):
        """Actualiza status operativo según vigencia. No toca borrador/cancelado/finalizado/renovado."""
        from datetime import date, timedelta
        if self.status in ('borrador', 'cancelado', 'finalizado', 'renovado'):
            return False
        today = today or date.today()
        if today > self.end_date:
            new = 'vencido'
        elif self.end_date <= today + timedelta(days=45):
            new = 'por_vencer'
        else:
            new = 'activo'
        if new != self.status:
            self.status = new
            self.save(update_fields=['status', 'updated_at'])
            return True
        return False


class RentalCharge(models.Model):
    """Cargo a un contrato (renta u otro concepto) para un período."""
    STATUS_CHOICES = [
        ('pendiente', 'Pendiente'),
        ('parcial', 'Parcial'),
        ('pagado', 'Pagado'),
        ('cancelado', 'Cancelado'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='rental_charges')
    contract = models.ForeignKey(RentalContract, on_delete=models.CASCADE, related_name='charges')
    concept = models.ForeignKey(
        RentalChargeConcept, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='charges',
    )
    period = models.CharField(max_length=7, db_index=True, help_text='YYYY-MM')
    description = models.CharField(max_length=200)
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=0,
                                 validators=[MinValueValidator(0)])
    due_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pendiente', db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'rental_charges'
        ordering = ['-period', 'description']
        indexes = [
            models.Index(fields=['tenant', 'period', 'status']),
        ]

    def __str__(self):
        return f'{self.period} {self.description}'

    @property
    def paid_amount(self):
        from django.db.models import Sum
        total = self.payments.aggregate(s=Sum('amount'))['s']
        return total or 0

    def sync_status(self):
        if self.status == 'cancelado':
            return
        paid = self.paid_amount
        if paid <= 0:
            new = 'pendiente'
        elif paid >= self.amount:
            new = 'pagado'
        else:
            new = 'parcial'
        if new != self.status:
            self.status = new
            self.save(update_fields=['status', 'updated_at'])


class RentalPayment(models.Model):
    """Pago registrado contra un cargo (o abono general al contrato)."""
    PAYMENT_TYPE_CHOICES = [
        ('transfer', 'Transferencia'),
        ('cash', 'Efectivo'),
        ('card', 'Tarjeta'),
        ('check', 'Cheque'),
        ('other', 'Otro'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='rental_payments')
    contract = models.ForeignKey(RentalContract, on_delete=models.CASCADE, related_name='payments')
    charge = models.ForeignKey(
        RentalCharge, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='payments',
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2,
                                 validators=[MinValueValidator(0)])
    payment_date = models.DateField()
    payment_type = models.CharField(max_length=20, choices=PAYMENT_TYPE_CHOICES, default='transfer')
    reference = models.CharField(max_length=120, blank=True, default='')
    notes = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'rental_payments'
        ordering = ['-payment_date', '-created_at']

    def __str__(self):
        return f'{self.payment_date} {self.amount}'


# ═══════════════════════════════════════════════════════════
#  AIRBNB — cuentas y anuncios vinculados al inventario de rentas
# ═══════════════════════════════════════════════════════════

class AirbnbConnection(models.Model):
    """Cuenta de anfitrión Airbnb asociada a un espacio de rentas.
    No guarda contraseñas. La visibilidad automática de anuncios vía API
    oficial requiere ser partner de Airbnb; mientras tanto se usan
    listing ID + calendario iCal que el anfitrión exporta desde Airbnb.
    """
    MODE_CHOICES = [
        ('ical', 'Calendario iCal (oficial del anfitrión)'),
        ('oauth', 'API partner (cuando Homly esté aprobado)'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='airbnb_connections')
    label = models.CharField(max_length=160, help_text='Ej. Cuenta personal, Cuenta de la inmobiliaria')
    host_email = models.EmailField(blank=True, default='', help_text='Correo del anfitrión en Airbnb (identificador, no contraseña)')
    mode = models.CharField(max_length=12, choices=MODE_CHOICES, default='ical')
    notes = models.TextField(blank=True, default='')
    last_synced_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'airbnb_connections'
        ordering = ['label']

    def __str__(self):
        return f'{self.label} ({self.tenant.name})'


class AirbnbListing(models.Model):
    """Anuncio de Airbnb mapeado a una propiedad del inventario Homly."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='airbnb_listings')
    connection = models.ForeignKey(
        AirbnbConnection, on_delete=models.CASCADE, related_name='listings',
    )
    property = models.OneToOneField(
        'RentalProperty', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='airbnb_listing',
    )
    airbnb_listing_id = models.CharField(max_length=40, db_index=True)
    listing_url = models.URLField(max_length=500, blank=True, default='')
    ical_url = models.URLField(max_length=800, blank=True, default='',
                               help_text='URL de exportación de calendario que Airbnb da al anfitrión')
    listing_name = models.CharField(max_length=300)
    sync_enabled = models.BooleanField(default=True)
    occupied_now = models.BooleanField(default=False)
    ical_events = models.JSONField(default=list, blank=True)
    last_synced_at = models.DateTimeField(null=True, blank=True)
    last_sync_error = models.CharField(max_length=400, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'airbnb_listings'
        ordering = ['listing_name']
        unique_together = ['tenant', 'airbnb_listing_id']

    def __str__(self):
        return f'{self.airbnb_listing_id} — {self.listing_name}'


# ═══════════════════════════════════════════════════════════
#  CRM DE RENTAS — leads por unidad → cliente + contrato
# ═══════════════════════════════════════════════════════════

class RentalLead(models.Model):
    """Prospecto interesado en una unidad del inventario de rentas."""
    STAGE_CHOICES = [
        ('nuevo', 'Nuevo'),
        ('contactado', 'Contactado'),
        ('visita', 'Visita'),
        ('propuesta', 'Propuesta'),
        ('negociacion', 'Negociación'),
        ('ganado', 'Ganado'),
        ('perdido', 'Perdido'),
    ]
    SOURCE_CHOICES = [
        ('web', 'Sitio web'),
        ('whatsapp', 'WhatsApp'),
        ('telefono', 'Teléfono'),
        ('visita', 'Visita al inmueble'),
        ('airbnb', 'Airbnb'),
        ('referido', 'Referido'),
        ('otro', 'Otro'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='rental_leads')
    rental_property = models.ForeignKey(
        RentalProperty, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='leads',
    )
    first_name = models.CharField(max_length=150)
    last_name = models.CharField(max_length=150, blank=True, default='')
    email = models.EmailField(blank=True, default='')
    phone = models.CharField(max_length=40, blank=True, default='')
    source = models.CharField(max_length=20, choices=SOURCE_CHOICES, default='otro', db_index=True)
    stage = models.CharField(max_length=20, choices=STAGE_CHOICES, default='nuevo', db_index=True)
    interested_rent = models.DecimalField(
        max_digits=12, decimal_places=2, default=0, validators=[MinValueValidator(0)],
    )
    expected_start = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True, default='')
    lost_reason = models.CharField(max_length=300, blank=True, default='')
    assigned_to = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='rental_leads_assigned',
    )
    created_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='rental_leads_created',
    )
    party = models.ForeignKey(
        'RentalParty', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='leads',
    )
    contract = models.ForeignKey(
        'RentalContract', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='source_leads',
    )
    converted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'rental_leads'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['tenant', 'stage']),
            models.Index(fields=['tenant', 'rental_property']),
        ]

    def __str__(self):
        return f'{self.full_name} ({self.stage})'

    @property
    def full_name(self):
        return f'{self.first_name} {self.last_name}'.strip()


class RentalLeadActivity(models.Model):
    """Nota o seguimiento sobre un lead de rentas."""
    KIND_CHOICES = [
        ('note', 'Nota'),
        ('call', 'Llamada'),
        ('whatsapp', 'WhatsApp'),
        ('email', 'Correo'),
        ('visit', 'Visita'),
        ('system', 'Sistema'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='rental_lead_activities')
    lead = models.ForeignKey(RentalLead, on_delete=models.CASCADE, related_name='activities')
    kind = models.CharField(max_length=16, choices=KIND_CHOICES, default='note')
    body = models.TextField()
    created_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='rental_lead_activities_created',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'rental_lead_activities'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.kind} — {self.lead.full_name}'


# ═══════════════════════════════════════════════════════════
#  PLANEACIÓN (Presupuesto anual + Proyectos del condominio)
# ═══════════════════════════════════════════════════════════

class CondoBudget(models.Model):
    """Presupuesto anual del condominio. Varios escenarios (borradores) por año; uno aprobado final."""
    STATUS_CHOICES = [
        ('borrador', 'Borrador'),
        ('guardado', 'Guardado'),
        ('en_aprobacion', 'En aprobación'),
        ('aprobado', 'Aprobado'),
        ('archivado', 'Archivado'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='condo_budgets')
    year = models.PositiveSmallIntegerField(db_index=True)
    name = models.CharField(max_length=200, blank=True, default='')
    notes = models.TextField(blank=True, default='')
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default='borrador', db_index=True)
    seed_units = models.PositiveIntegerField(
        default=0,
        help_text='Unidades usadas para el sugerido (no puede superar las unidades activas del tenant).',
    )
    seed_fee = models.DecimalField(
        max_digits=14, decimal_places=2, default=0,
        validators=[MinValueValidator(0)],
        help_text='Cuota de mantenimiento usada para armar el sugerido.',
    )
    cashflow_rules = models.JSONField(
        default=list, blank=True,
        help_text='Descuentos/incentivos de cobranza: [{id,name,pct,takeup_pct,apply_to}]',
    )
    approval_steps = models.JSONField(
        default=list, blank=True,
        help_text='Pasos del flujo de aprobación en curso.',
    )
    created_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='condo_budgets_created',
    )
    approved_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='condo_budgets_approved',
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'condo_budgets'
        ordering = ['-year', '-created_at']
        indexes = [
            models.Index(fields=['tenant', 'year']),
            models.Index(fields=['tenant', 'status']),
        ]

    def __str__(self):
        return f'Presupuesto {self.year} — {self.name or self.tenant.name}'


class CondoBudgetLine(models.Model):
    """Partida de ingreso o gasto. monthly_amounts: {'01': 1000, ..., '12': 1000}."""
    KIND_CHOICES = [
        ('ingreso', 'Ingreso'),
        ('gasto', 'Gasto'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    budget = models.ForeignKey(CondoBudget, on_delete=models.CASCADE, related_name='lines')
    kind = models.CharField(max_length=12, choices=KIND_CHOICES, db_index=True)
    extra_field = models.ForeignKey(
        ExtraField, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='budget_lines',
    )
    concept_key = models.CharField(
        max_length=80, db_index=True,
        help_text='maintenance | caja_chica | extra_field UUID | custom',
    )
    name = models.CharField(max_length=200)
    monthly_amounts = models.JSONField(default=dict, blank=True)
    project = models.ForeignKey(
        'CondoProject', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='budget_lines',
        help_text='Partida generada al incluir un proyecto en este presupuesto.',
    )
    sort_order = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'condo_budget_lines'
        ordering = ['kind', 'sort_order', 'name']

    def __str__(self):
        return f'{self.kind} {self.name}'

    @property
    def annual_amount(self):
        total = 0
        amounts = self.monthly_amounts or {}
        for m in range(1, 13):
            try:
                total += float(amounts.get(f'{m:02d}', 0) or 0)
            except (TypeError, ValueError):
                pass
        return total


class CondoProject(models.Model):
    """Obra, mejora o proyecto extraordinario del condominio."""
    STATUS_CHOICES = [
        ('idea', 'Idea'),
        ('en_aprobacion', 'En aprobación'),
        ('aprobado', 'Aprobado'),
        ('en_curso', 'En curso'),
        ('pausado', 'Pausado'),
        ('concluido', 'Concluido'),
        ('cancelado', 'Cancelado'),
    ]
    PRIORITY_CHOICES = [
        ('baja', 'Baja'),
        ('media', 'Media'),
        ('alta', 'Alta'),
        ('urgente', 'Urgente'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='condo_projects')
    name = models.CharField(max_length=240)
    description = models.TextField(blank=True, default='')
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default='idea', db_index=True)
    priority = models.CharField(max_length=12, choices=PRIORITY_CHOICES, default='media')
    extra_field = models.ForeignKey(
        ExtraField, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='condo_projects',
        help_text='Categoría de gastos con la que se compara el avance.',
    )
    budget_amount = models.DecimalField(
        max_digits=14, decimal_places=2, default=0,
        validators=[MinValueValidator(0)],
    )
    start_period = models.CharField(max_length=7, blank=True, default='', help_text='YYYY-MM')
    end_period = models.CharField(max_length=7, blank=True, default='', help_text='YYYY-MM')
    responsible_name = models.CharField(max_length=200, blank=True, default='')
    notes = models.TextField(blank=True, default='')
    FUNDING_CHOICES = [
        ('condominio', 'Recursos del condominio'),
        ('residentes', 'Aportes extraordinarios de residentes'),
        ('compartido', 'Compartido'),
    ]
    CONTEST_CHOICES = [
        ('sin_concurso', 'Sin concurso'),
        ('en_concurso', 'En concurso'),
        ('adjudicado', 'Adjudicado'),
    ]
    funding_mode = models.CharField(max_length=16, choices=FUNDING_CHOICES, default='condominio')
    funding_condo_pct = models.DecimalField(
        max_digits=5, decimal_places=2, default=100,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
    )
    funding_residents_pct = models.DecimalField(
        max_digits=5, decimal_places=2, default=0,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
    )
    funding_units = models.PositiveIntegerField(
        default=0,
        help_text='Unidades que aportan la parte de residentes (0 = usar las activas del tenant).',
    )
    funding_notes = models.TextField(blank=True, default='')
    contest_status = models.CharField(
        max_length=16, choices=CONTEST_CHOICES, default='sin_concurso', db_index=True,
    )
    winner_quote = models.ForeignKey(
        'CondoProjectQuote', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='won_projects',
    )
    budgets = models.ManyToManyField(
        CondoBudget,
        related_name='linked_projects',
        blank=True,
        help_text='Presupuestos anuales donde está incluida la partida del proyecto.',
    )
    approval_steps = models.JSONField(
        default=list, blank=True,
        help_text='Pasos del flujo de aprobación en curso.',
    )
    created_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='condo_projects_created',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'condo_projects'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['tenant', 'status']),
        ]

    def __str__(self):
        return self.name


class CondoProjectCost(models.Model):
    """Costo registrado en un proyecto; puede enlazar un gasto real del tenant."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(CondoProject, on_delete=models.CASCADE, related_name='costs')
    period = models.CharField(max_length=7, db_index=True)
    amount = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(0)])
    description = models.CharField(max_length=400, blank=True, default='')
    cost_date = models.DateField(null=True, blank=True)
    extra_field = models.ForeignKey(
        ExtraField, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='project_costs',
    )
    gasto_entry = models.ForeignKey(
        GastoEntry, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='project_costs',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'condo_project_costs'
        ordering = ['-period', '-created_at']
        indexes = [
            models.Index(fields=['project', 'period']),
        ]

    def __str__(self):
        return f'{self.project.name} {self.amount}'


def condo_project_file_path(instance, filename):
    ext = ''
    if filename and '.' in filename:
        ext = '.' + filename.rsplit('.', 1)[-1].lower()[:8]
    return f'condo_project_files/{instance.project_id}/{uuid.uuid4().hex}{ext}'


class CondoProjectQuote(models.Model):
    """Cotización de un proveedor para el concurso del proyecto."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(CondoProject, on_delete=models.CASCADE, related_name='quotes')
    provider = models.ForeignKey(
        'CondoProvider', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='project_quotes',
    )
    supplier_name = models.CharField(max_length=240)
    supplier_rfc = models.CharField(max_length=20, blank=True, default='')
    supplier_contact = models.CharField(max_length=200, blank=True, default='')
    supplier_phone = models.CharField(max_length=40, blank=True, default='')
    supplier_email = models.CharField(max_length=200, blank=True, default='')
    supplier_notes = models.TextField(blank=True, default='')
    amount = models.DecimalField(max_digits=14, decimal_places=2, validators=[MinValueValidator(0)])
    validity_date = models.DateField(null=True, blank=True)
    delivery_days = models.PositiveIntegerField(null=True, blank=True)
    warranty_months = models.PositiveIntegerField(null=True, blank=True)
    scope = models.TextField(blank=True, default='')
    is_winner = models.BooleanField(default=False)
    sort_order = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'condo_project_quotes'
        ordering = ['sort_order', 'created_at']

    def __str__(self):
        return f'{self.supplier_name} — {self.project.name}'


class CondoProjectFile(models.Model):
    """Documento, plano, contrato o archivo de cotización del proyecto."""
    KIND_CHOICES = [
        ('cotizacion', 'Cotización'),
        ('plano', 'Plano'),
        ('contrato', 'Contrato'),
        ('foto', 'Foto'),
        ('documento', 'Documento'),
        ('otro', 'Otro'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(CondoProject, on_delete=models.CASCADE, related_name='files')
    quote = models.ForeignKey(
        CondoProjectQuote, on_delete=models.CASCADE, null=True, blank=True,
        related_name='files',
    )
    kind = models.CharField(max_length=16, choices=KIND_CHOICES, default='documento')
    original_name = models.CharField(max_length=240, blank=True, default='')
    notes = models.CharField(max_length=400, blank=True, default='')
    file = models.FileField(upload_to=condo_project_file_path)
    uploaded_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='condo_project_files_uploaded',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'condo_project_files'
        ordering = ['-created_at']

    def __str__(self):
        return self.original_name or str(self.id)


# ═══════════════════════════════════════════════════════════
#  ASAMBLEAS DEL CONDOMINIO
# ═══════════════════════════════════════════════════════════

class CondoAssembly(models.Model):
    """Proceso completo de una asamblea: convocatoria, reunión, minuta e historial."""
    KIND_CHOICES = [
        ('ordinaria', 'Ordinaria'),
        ('extraordinaria', 'Extraordinaria'),
    ]
    STATUS_CHOICES = [
        ('borrador', 'Borrador'),
        ('convocada', 'Convocada'),
        ('en_curso', 'En curso'),
        ('cerrada', 'Cerrada'),
        ('cancelada', 'Cancelada'),
    ]
    MINUTE_STATUS_CHOICES = [
        ('borrador', 'Borrador'),
        ('firmada', 'Firmada'),
        ('protocolizada', 'Protocolizada'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='condo_assemblies')
    title = models.CharField(max_length=240)
    kind = models.CharField(max_length=16, choices=KIND_CHOICES, default='ordinaria', db_index=True)
    year = models.PositiveSmallIntegerField(db_index=True)
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default='borrador', db_index=True)
    location = models.CharField(max_length=300, blank=True, default='')
    first_call_at = models.DateTimeField(null=True, blank=True)
    second_call_at = models.DateTimeField(null=True, blank=True)
    call_number = models.PositiveSmallIntegerField(default=1)
    notice_issued_at = models.DateTimeField(null=True, blank=True)
    notice_days = models.PositiveSmallIntegerField(default=10)
    delivery_methods = models.JSONField(default=list, blank=True)
    issued_by_name = models.CharField(max_length=200, blank=True, default='')
    president_name = models.CharField(max_length=200, blank=True, default='')
    secretary_name = models.CharField(max_length=200, blank=True, default='')
    legal_snapshot = models.JSONField(default=dict, blank=True)
    minute_body = models.TextField(
        blank=True, default='',
        help_text='Minuta de trabajo: notas del secretario durante la sesión.',
    )
    acta_body = models.TextField(
        blank=True, default='',
        help_text='Acta formal de la asamblea, para firma y protocolización.',
    )
    minute_status = models.CharField(max_length=16, choices=MINUTE_STATUS_CHOICES, default='borrador')
    minute_signed_at = models.DateTimeField(null=True, blank=True)
    protocolized = models.BooleanField(default=False)
    notary_name = models.CharField(max_length=200, blank=True, default='')
    notary_folio = models.CharField(max_length=80, blank=True, default='')
    installed_at = models.DateTimeField(null=True, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True, default='')
    created_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='condo_assemblies_created',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'condo_assemblies'
        ordering = ['-first_call_at', '-created_at']
        indexes = [
            models.Index(fields=['tenant', 'status']),
            models.Index(fields=['tenant', 'year']),
        ]

    def __str__(self):
        return self.title


class CondoAssemblyAgendaItem(models.Model):
    VOTE_CHOICES = [
        ('informativo', 'Informativo'),
        ('simple', 'Mayoría simple'),
        ('calificada', 'Mayoría calificada'),
        ('unanimidad', 'Unanimidad'),
    ]
    RESULT_CHOICES = [
        ('pendiente', 'Pendiente'),
        ('aprobado', 'Aprobado'),
        ('rechazado', 'Rechazado'),
        ('diferido', 'Diferido'),
    ]
    SOURCE_CHOICES = [
        ('manual', 'Manual'),
        ('presupuesto', 'Presupuesto (Planeación)'),
        ('proyecto', 'Proyecto (Planeación)'),
        ('cierre', 'Cierre de período'),
        ('cuota', 'Cuota / cargo extra'),
        ('organizacion', 'Comité / cargo'),
    ]
    APPLY_CHOICES = [
        ('pendiente', 'Pendiente'),
        ('aplicado', 'Aplicado en el módulo'),
        ('omitido', 'Solo constancia'),
        ('error', 'No se pudo aplicar'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    assembly = models.ForeignKey(CondoAssembly, on_delete=models.CASCADE, related_name='agenda')
    sort_order = models.PositiveSmallIntegerField(default=0)
    title = models.CharField(max_length=240)
    description = models.TextField(blank=True, default='')
    vote_type = models.CharField(max_length=16, choices=VOTE_CHOICES, default='simple')
    result = models.CharField(max_length=16, choices=RESULT_CHOICES, default='pendiente')
    votes_for = models.PositiveIntegerField(default=0)
    votes_against = models.PositiveIntegerField(default=0)
    votes_abstain = models.PositiveIntegerField(default=0)
    notes = models.TextField(blank=True, default='', help_text='Notas de minuta de este punto.')
    vote_detail = models.JSONField(default=list, blank=True)
    source_kind = models.CharField(max_length=16, choices=SOURCE_CHOICES, default='manual')
    source_id = models.UUIDField(null=True, blank=True)
    source_label = models.CharField(max_length=240, blank=True, default='')
    source_meta = models.JSONField(default=dict, blank=True)
    apply_on_approve = models.BooleanField(
        default=False,
        help_text='Si el punto se aprueba en asamblea, actualizar el módulo origen (presupuesto/proyecto).',
    )
    applied_status = models.CharField(max_length=16, choices=APPLY_CHOICES, default='pendiente')
    applied_at = models.DateTimeField(null=True, blank=True)
    applied_notes = models.CharField(max_length=400, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'condo_assembly_agenda'
        ordering = ['sort_order', 'created_at']

    def __str__(self):
        return self.title


class CondoAssemblyAttendee(models.Model):
    CAPACITY_CHOICES = [
        ('propietario', 'Propietario'),
        ('representante', 'Representante / carta poder'),
        ('invitado', 'Invitado'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    assembly = models.ForeignKey(CondoAssembly, on_delete=models.CASCADE, related_name='attendees')
    unit = models.ForeignKey(
        Unit, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='assembly_attendances',
    )
    attendee_name = models.CharField(max_length=240, blank=True, default='')
    capacity = models.CharField(max_length=16, choices=CAPACITY_CHOICES, default='propietario')
    proxy_name = models.CharField(max_length=200, blank=True, default='')
    present = models.BooleanField(default=False)
    vote_weight = models.DecimalField(max_digits=8, decimal_places=4, default=1)
    signed_in_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'condo_assembly_attendees'
        ordering = ['unit__unit_id_code', 'attendee_name']
        indexes = [
            models.Index(fields=['assembly', 'present']),
        ]

    def __str__(self):
        return self.attendee_name or str(self.id)


def condo_assembly_file_path(instance, filename):
    ext = ''
    if filename and '.' in filename:
        ext = '.' + filename.rsplit('.', 1)[-1].lower()[:8]
    return f'condo_assembly_files/{instance.assembly_id}/{uuid.uuid4().hex}{ext}'


class CondoAssemblyFile(models.Model):
    KIND_CHOICES = [
        ('convocatoria', 'Convocatoria'),
        ('poder', 'Carta poder'),
        ('lista', 'Lista de asistencia'),
        ('minuta', 'Minuta / acta'),
        ('evidencia', 'Evidencia de notificación'),
        ('otro', 'Otro'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    assembly = models.ForeignKey(CondoAssembly, on_delete=models.CASCADE, related_name='files')
    kind = models.CharField(max_length=16, choices=KIND_CHOICES, default='otro')
    original_name = models.CharField(max_length=240, blank=True, default='')
    notes = models.CharField(max_length=400, blank=True, default='')
    file = models.FileField(upload_to=condo_assembly_file_path)
    uploaded_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='condo_assembly_files_uploaded',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'condo_assembly_files'
        ordering = ['-created_at']

    def __str__(self):
        return self.original_name or str(self.id)


# ═══════════════════════════════════════════════════════════
#  MANTENIMIENTOS DEL CONDOMINIO
# ═══════════════════════════════════════════════════════════

def condo_maintenance_file_path(instance, filename):
    ext = ''
    if filename and '.' in filename:
        ext = '.' + filename.rsplit('.', 1)[-1].lower()[:8]
    return f'condo_maintenance/{instance.work_id}/{uuid.uuid4().hex}{ext}'


class CondoMaintenanceWork(models.Model):
    """Planeación y bitácora de un trabajo de mantenimiento preventivo o correctivo."""
    KIND_CHOICES = [
        ('preventivo', 'Preventivo'),
        ('correctivo', 'Correctivo'),
    ]
    STATUS_CHOICES = [
        ('planeado', 'Planeado'),
        ('en_curso', 'En curso'),
        ('realizado', 'Realizado'),
        ('cancelado', 'Cancelado'),
    ]
    PRIORITY_CHOICES = [
        ('baja', 'Baja'),
        ('media', 'Media'),
        ('alta', 'Alta'),
        ('urgente', 'Urgente'),
    ]
    FREQUENCY_CHOICES = [
        ('unica', 'Única'),
        ('semanal', 'Semanal'),
        ('mensual', 'Mensual'),
        ('trimestral', 'Trimestral'),
        ('semestral', 'Semestral'),
        ('anual', 'Anual'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='condo_maintenance_works')
    kind = models.CharField(max_length=16, choices=KIND_CHOICES, default='preventivo', db_index=True)
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default='planeado', db_index=True)
    priority = models.CharField(max_length=12, choices=PRIORITY_CHOICES, default='media')
    title = models.CharField(max_length=240)
    description = models.TextField(blank=True, default='')
    work_notes = models.TextField(blank=True, default='', help_text='Documentación de lo realizado.')
    area_id = models.CharField(max_length=80, blank=True, default='')
    area_name = models.CharField(max_length=200, blank=True, default='')
    performed_by = models.CharField(max_length=200, blank=True, default='')
    provider = models.ForeignKey(
        'CondoProvider', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='maintenance_works',
    )
    vendor_name = models.CharField(max_length=200, blank=True, default='')
    period = models.CharField(max_length=7, db_index=True, default='', help_text='Periodo del sistema YYYY-MM')
    scheduled_date = models.DateField(null=True, blank=True)
    performed_date = models.DateField(null=True, blank=True)
    next_due_date = models.DateField(null=True, blank=True)
    frequency = models.CharField(max_length=16, choices=FREQUENCY_CHOICES, default='unica')
    cost = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    created_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='condo_maintenance_created',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'condo_maintenance_works'
        ordering = ['-scheduled_date', '-created_at']
        indexes = [
            models.Index(fields=['tenant', 'kind', 'status']),
            models.Index(fields=['tenant', 'period']),
        ]

    def __str__(self):
        return self.title


class CondoMaintenanceEvidence(models.Model):
    """Evidencia fotográfica o documental de un trabajo (antes, durante, después u otro)."""
    KIND_CHOICES = [
        ('antes', 'Antes'),
        ('durante', 'Durante'),
        ('despues', 'Después'),
        ('otro', 'Otro'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    work = models.ForeignKey(CondoMaintenanceWork, on_delete=models.CASCADE, related_name='evidences')
    kind = models.CharField(max_length=12, choices=KIND_CHOICES, default='otro')
    original_name = models.CharField(max_length=240, blank=True, default='')
    notes = models.CharField(max_length=400, blank=True, default='')
    captured_at = models.DateField(
        null=True, blank=True,
        help_text='Fecha en que se tomó o corresponde la evidencia (puede cargarse después).',
    )
    file = models.FileField(upload_to=condo_maintenance_file_path)
    uploaded_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='condo_maintenance_files_uploaded',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'condo_maintenance_evidences'
        ordering = ['captured_at', 'created_at']

    def __str__(self):
        return self.original_name or str(self.id)


# ═══════════════════════════════════════════════════════════
#  PROVEEDORES DEL CONDOMINIO
# ═══════════════════════════════════════════════════════════

PROVIDER_MODULE_KEYS = ('gastos', 'caja_chica', 'mantenimientos', 'planeacion')


def default_provider_modules():
    return list(PROVIDER_MODULE_KEYS)


def condo_provider_file_path(instance, filename):
    ext = ''
    if filename and '.' in filename:
        ext = '.' + filename.rsplit('.', 1)[-1].lower()[:8]
    return f'condo_providers/{instance.provider_id}/{uuid.uuid4().hex}{ext}'


class CondoProvider(models.Model):
    """Catálogo de proveedores del tenant para gastos, caja chica, mantenimientos y planeación."""
    PERSON_CHOICES = [
        ('fisica', 'Persona física'),
        ('moral', 'Persona moral'),
    ]
    STATUS_CHOICES = [
        ('activo', 'Activo'),
        ('inactivo', 'Inactivo'),
        ('suspendido', 'Suspendido'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='condo_providers')
    person_type = models.CharField(max_length=12, choices=PERSON_CHOICES, default='moral')
    legal_name = models.CharField(max_length=300)
    trade_name = models.CharField(max_length=300, blank=True, default='')
    first_name = models.CharField(max_length=150, blank=True, default='')
    last_name = models.CharField(max_length=150, blank=True, default='')
    rfc = models.CharField(max_length=20, blank=True, default='')
    curp = models.CharField(max_length=20, blank=True, default='')
    tax_regime = models.CharField(max_length=200, blank=True, default='')
    legal_rep_name = models.CharField(max_length=200, blank=True, default='')
    contact_name = models.CharField(max_length=200, blank=True, default='')
    email = models.EmailField(blank=True, default='')
    phone = models.CharField(max_length=40, blank=True, default='')
    mobile = models.CharField(max_length=40, blank=True, default='')
    website = models.CharField(max_length=300, blank=True, default='')
    street = models.CharField(max_length=300, blank=True, default='')
    ext_number = models.CharField(max_length=40, blank=True, default='')
    int_number = models.CharField(max_length=40, blank=True, default='')
    colonia = models.CharField(max_length=200, blank=True, default='')
    city = models.CharField(max_length=200, blank=True, default='')
    state = models.CharField(max_length=100, blank=True, default='')
    zip_code = models.CharField(max_length=12, blank=True, default='')
    bank_name = models.CharField(max_length=120, blank=True, default='')
    bank_clabe = models.CharField(max_length=20, blank=True, default='')
    bank_account = models.CharField(max_length=30, blank=True, default='')
    notes = models.TextField(blank=True, default='')
    status = models.CharField(max_length=12, choices=STATUS_CHOICES, default='activo', db_index=True)
    visible_in_modules = models.JSONField(default=default_provider_modules, blank=True)
    created_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='condo_providers_created',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'condo_providers'
        ordering = ['legal_name', 'trade_name']

    @property
    def display_name(self):
        if (self.trade_name or '').strip():
            return self.trade_name.strip()
        if (self.legal_name or '').strip():
            return self.legal_name.strip()
        parts = ' '.join(p for p in (self.first_name, self.last_name) if p)
        return parts.strip() or 'Proveedor'

    def is_visible_in(self, module_key):
        mods = self.visible_in_modules or []
        return module_key in mods

    def __str__(self):
        return self.display_name


class CondoProviderDocument(models.Model):
    KIND_CHOICES = [
        ('csf', 'Constancia de situación fiscal'),
        ('identificacion', 'Identificación oficial'),
        ('acta_constitutiva', 'Acta constitutiva'),
        ('comprobante_domicilio', 'Comprobante de domicilio'),
        ('estado_cuenta', 'Estado de cuenta'),
        ('contrato', 'Contrato'),
        ('otro', 'Otro'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    provider = models.ForeignKey(CondoProvider, on_delete=models.CASCADE, related_name='documents')
    kind = models.CharField(max_length=24, choices=KIND_CHOICES, default='otro')
    original_name = models.CharField(max_length=240, blank=True, default='')
    notes = models.CharField(max_length=400, blank=True, default='')
    file = models.FileField(upload_to=condo_provider_file_path)
    uploaded_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='condo_provider_files_uploaded',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'condo_provider_documents'
        ordering = ['kind', 'created_at']

    def __str__(self):
        return self.original_name or str(self.id)


