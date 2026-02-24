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
    common_areas = models.TextField(blank=True, default='')
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
        ('admin', 'Administrador'),
        ('tesorero', 'Tesorero'),
        ('contador', 'Contador'),
        ('auditor', 'Auditor'),
        ('vecino', 'Vecino / Residente'),
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
        ('vacío', 'Vacío'),
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
    occupancy = models.CharField(max_length=15, choices=OCCUPANCY_CHOICES, default='propietario')
    tenant_first_name = models.CharField(max_length=150, blank=True, default='',
                                          help_text='Renter first name')
    tenant_last_name = models.CharField(max_length=150, blank=True, default='')
    tenant_email = models.EmailField(blank=True, default='')
    tenant_phone = models.CharField(max_length=30, blank=True, default='')
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

    # JSONB for flexible adeudo payments across periods
    adeudo_payments = models.JSONField(default=dict, blank=True,
                                       help_text='Debt payments: {period: {fieldId: amount}}')
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
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'unrecognized_income'
        ordering = ['-created_at']

    def __str__(self):
        return f'Unrecognized: {self.amount} — {self.period}'
