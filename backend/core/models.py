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
from django.core.validators import MinValueValidator


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
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True, db_index=True)
    name = models.CharField(max_length=200)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    is_super_admin = models.BooleanField(default=False)
    must_change_password = models.BooleanField(default=False)
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

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=300, db_index=True)
    units_count = models.PositiveIntegerField(default=0, help_text='Planned number of units')
    common_areas = models.JSONField(default=list, blank=True)
    maintenance_fee = models.DecimalField(max_digits=12, decimal_places=2, default=0,
                                          validators=[MinValueValidator(0)])
    currency = models.CharField(max_length=3, choices=CURRENCY_CHOICES, default='MXN')
    logo = models.TextField(blank=True, default='', help_text='Base64-encoded logo image')
    operation_start_date = models.CharField(max_length=7, default='2024-01',
                                            help_text='Format: YYYY-MM')
    operation_type = models.CharField(max_length=10, choices=OPERATION_TYPE_CHOICES, default='fiscal')
    country = models.CharField(max_length=100, blank=True, default='')
    state = models.CharField(max_length=100, blank=True, default='')
    bank_initial_balance = models.DecimalField(max_digits=14, decimal_places=2, default=0)
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
            'Per-role module visibility. Keys: admin, tesorero, contador, auditor, vigilante, vecino. '
            'Values: list of enabled module keys. Empty dict = all defaults enabled.'
        ),
    )

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
        ('vecino',     'Vecino / Residente'),
        ('vigilante',  'Vigilante'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='tenant_users')
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='tenant_roles')
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, db_index=True)
    unit = models.ForeignKey('Unit', on_delete=models.SET_NULL, null=True, blank=True,
                             related_name='assigned_users',
                             help_text='Required for vecino role')
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
    previous_debt = models.DecimalField(max_digits=12, decimal_places=2, default=0,
                                        help_text='Adeudo anterior al inicio')
    previous_debt_evidence = models.TextField(blank=True, default='',
                                             help_text='Base64 PDF evidencia del adeudo anterior')
    credit_balance = models.DecimalField(max_digits=12, decimal_places=2, default=0,
                                         help_text='Saldo a favor previo al inicio de operaciones')
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
    evidence = models.TextField(blank=True, default='', help_text='Base64 evidence image')
    bank_reconciled = models.BooleanField(default=False)
    folio = models.CharField(max_length=50, blank=True, default='',
                             help_text='Folio / número de recibo asignado al pago')

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
    provider_name = models.CharField(max_length=300, blank=True, default='')
    provider_rfc = models.CharField(max_length=20, blank=True, default='')
    provider_invoice = models.CharField(max_length=100, blank=True, default='')
    bank_reconciled = models.BooleanField(default=False)
    notes = models.TextField(blank=True, default='')
    evidence = models.TextField(blank=True, default='')
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
    file_data = models.TextField(help_text='Base64 encoded PDF')
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
        ('reservation_new',       'Nueva Reserva Solicitada'),
        ('reservation_approved',  'Reserva Aprobada'),
        ('reservation_rejected',  'Reserva Rechazada'),
        ('reservation_cancelled', 'Reserva Cancelada'),
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
#  DOCUMENTOS
# ═══════════════════════════════════════════════════════════

class DocumentCategory(models.Model):
    """Carpeta / categoría de documentos por tenant."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='document_categories')
    name = models.CharField(max_length=120)
    description = models.TextField(blank=True, default='')
    icon = models.CharField(max_length=8, blank=True, default='📁')
    color = models.CharField(max_length=7, blank=True, default='#0d7c6e')
    order = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['order', 'name']

    def __str__(self):
        return f'{self.tenant} / {self.name}'


class Document(models.Model):
    """Documento publicado en el tenant: archivo subido o texto enriquecido."""
    DOC_TYPE_CHOICES = [
        ('file', 'Archivo subido'),
        ('richtext', 'Texto enriquecido'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='documents')
    category = models.ForeignKey(
        DocumentCategory, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='documents',
    )
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True, default='')
    doc_type = models.CharField(max_length=10, choices=DOC_TYPE_CHOICES)

    # Campos para archivos subidos (PDF, imagen, Word, Excel…)
    file_name = models.CharField(max_length=255, blank=True, default='')
    file_mime = models.CharField(max_length=120, blank=True, default='')
    file_data = models.TextField(blank=True, default='')   # base64
    file_size = models.IntegerField(default=0)              # bytes

    # Campos para texto enriquecido
    content = models.TextField(blank=True, default='')      # HTML

    # Soporte de plantillas
    is_template = models.BooleanField(default=False)

    # Permisos por rol:
    # { "admin":    {"read": true, "write": true, "delete": true},
    #   "tesorero": {"read": true, "write": true, "delete": false},
    #   "auditor":  {"read": true, "write": false, "delete": false},
    #   "vecino":   {"read": true, "write": false, "delete": false} }
    permissions = models.JSONField(default=dict)

    published = models.BooleanField(default=True)
    created_by_name = models.CharField(max_length=120, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.tenant} / {self.title}'

    @staticmethod
    def default_permissions():
        return {
            'admin':    {'read': True, 'write': True,  'delete': True},
            'tesorero': {'read': True, 'write': True,  'delete': False},
            'auditor':  {'read': True, 'write': False, 'delete': False},
            'vecino':   {'read': True, 'write': False, 'delete': False},
        }

    def save(self, *args, **kwargs):
        if not self.permissions:
            self.permissions = self.default_permissions()
        super().save(*args, **kwargs)
