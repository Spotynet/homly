"""
Homly — Custom Permissions
Role-based access control matching the original app's role system.
"""
from rest_framework.permissions import BasePermission
from .models import Tenant, TenantUser


# Capacidades de Rita (deben coincidir con frontend RITA_CAPABILITIES).
RITA_CAP_KEYS = ('guides', 'bank_upload', 'ingresos', 'egresos', 'settings')

_RITA_DEFAULT_CAPS = {
    'admin':    {k: 'write' for k in RITA_CAP_KEYS},
    'tesorero': {k: 'write' for k in RITA_CAP_KEYS},
    'contador': {k: 'write' for k in RITA_CAP_KEYS},
}
_RITA_BASE_ROLES = frozenset(('admin', 'tesorero', 'contador'))


def _perms_entry_for_user(tenant, user):
    """Entrada de module_permissions del rol o perfil personalizado del usuario."""
    if not tenant or not user:
        return None, None
    tu = TenantUser.objects.filter(user=user, tenant=tenant).select_related('tenant').first()
    if not tu:
        return None, None
    role = tu.role
    perms = tenant.module_permissions or {}
    if tu.profile_id:
        for p in (tenant.custom_profiles or []):
            if str(p.get('id', '')) == str(tu.profile_id):
                return p.get('modules') or {}, role
    entry = perms.get(role)
    return entry, role


def _rita_module_level(entry, role, is_profile=False):
    if role == 'superadmin':
        return 'write'
    if entry is None:
        if is_profile:
            return 'hidden'
        return 'write' if role in _RITA_BASE_ROLES else 'hidden'
    if isinstance(entry, list):
        if 'rita' in entry:
            return 'write'
        return 'write' if (not is_profile and role in _RITA_BASE_ROLES) else 'hidden'
    if isinstance(entry, dict):
        if 'rita' in entry:
            return entry['rita'] if entry['rita'] in ('hidden', 'read', 'write') else 'hidden'
        return 'write' if (not is_profile and role in _RITA_BASE_ROLES) else 'hidden'
    return 'hidden'


def user_has_rita_capability(tenant, user, capability):
    """True si el usuario puede ejecutar la capacidad Rita indicada."""
    if not user or not user.is_authenticated:
        return False
    if getattr(user, 'is_super_admin', False):
        return True
    if capability not in RITA_CAP_KEYS:
        return False
    entry, role = _perms_entry_for_user(tenant, user)
    if role is None:
        return False
    tu = TenantUser.objects.filter(user=user, tenant=tenant).first()
    is_profile = bool(tu and tu.profile_id)
    level = _rita_module_level(entry, role, is_profile=is_profile)
    if level == 'hidden':
        return False
    caps = {}
    if isinstance(entry, dict) and isinstance(entry.get('rita_caps'), dict):
        caps = entry['rita_caps']
    if capability in caps:
        return caps[capability] == 'write'
    defaults = _RITA_DEFAULT_CAPS.get(role, {k: 'hidden' for k in RITA_CAP_KEYS})
    if is_profile:
        return False
    return defaults.get(capability) == 'write'


class HasRitaCapability(BasePermission):
    """
    Requiere capacidad Rita en el view:
      rita_capability = 'ingresos' | 'egresos' | 'bank_upload' | 'settings'
    o rita_capabilities = ('ingresos', 'egresos')  → basta con una.
    """
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_super_admin:
            return True
        tenant_id = view.kwargs.get('tenant_id')
        if not tenant_id:
            return False
        try:
            tenant = Tenant.objects.get(pk=tenant_id)
        except Tenant.DoesNotExist:
            return False
        caps = getattr(view, 'rita_capabilities', None)
        if caps:
            return any(user_has_rita_capability(tenant, request.user, c) for c in caps)
        cap = getattr(view, 'rita_capability', None)
        if not cap:
            # Sin capacidad explícita: cualquier acceso Rita (módulo no oculto)
            return any(user_has_rita_capability(tenant, request.user, c) for c in RITA_CAP_KEYS)
        return user_has_rita_capability(tenant, request.user, cap)


class IsSuperAdmin(BasePermission):
    """Any system staff user (is_super_admin=True), regardless of system_role."""
    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and request.user.is_super_admin
        )


class IsFullSuperAdmin(BasePermission):
    """
    Only full super admins: system_role == 'super_admin' OR system_role is None (legacy).
    Restricted staff (ventas, marketing, etc.) are NOT granted access.
    """
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if not request.user.is_super_admin:
            return False
        # Full super admin: legacy (no system_role) or explicitly 'super_admin'
        return not request.user.system_role or request.user.system_role == 'super_admin'


class IsTenantMember(BasePermission):
    """User must be a super admin OR a member of the tenant."""
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_super_admin:
            return True
        tenant_id = view.kwargs.get('tenant_id')
        if not tenant_id:
            return False
        return TenantUser.objects.filter(
            user=request.user, tenant_id=tenant_id
        ).exists()


class IsTenantAdmin(BasePermission):
    """User must be a super admin OR an admin of the tenant."""
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_super_admin:
            return True
        tenant_id = view.kwargs.get('tenant_id')
        if not tenant_id:
            return False
        return TenantUser.objects.filter(
            user=request.user, tenant_id=tenant_id, role='admin'
        ).exists()


class IsAdminOrTesorero(BasePermission):
    """User must be super admin, admin, or tesorero of the tenant."""
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_super_admin:
            return True
        tenant_id = view.kwargs.get('tenant_id')
        if not tenant_id:
            return False
        return TenantUser.objects.filter(
            user=request.user, tenant_id=tenant_id,
            role__in=['admin', 'tesorero']
        ).exists()


class IsReadOnly(BasePermission):
    """Read-only access for auditor/contador roles."""
    def has_permission(self, request, view):
        if request.method in ('GET', 'HEAD', 'OPTIONS'):
            return True
        return False


class IsFinancialManager(BasePermission):
    """
    Solo administrador, tesorero y contador del condominio (más superadmin).
    No incluye auditor ni otros roles. Aplica a todos los métodos HTTP.
    """
    ROLES = ('admin', 'tesorero', 'contador')

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_super_admin:
            return True
        tenant_id = view.kwargs.get('tenant_id')
        if not tenant_id:
            return False
        return TenantUser.objects.filter(
            user=request.user, tenant_id=tenant_id, role__in=self.ROLES
        ).exists()


class IsAdminTesOrContador(BasePermission):
    """
    Admin, tesorero y contador: lectura y escritura.
    Auditor: solo lectura.
    Superadmin: siempre permitido.
    """
    WRITE_ROLES = ('admin', 'tesorero', 'contador')
    READ_ROLES  = ('admin', 'tesorero', 'contador', 'auditor')

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_super_admin:
            return True
        tenant_id = view.kwargs.get('tenant_id')
        if not tenant_id:
            return False
        allowed = self.WRITE_ROLES if request.method not in ('GET', 'HEAD', 'OPTIONS') else self.READ_ROLES
        return TenantUser.objects.filter(
            user=request.user, tenant_id=tenant_id, role__in=allowed
        ).exists()


class IsAdminOrTesOrAuditor(BasePermission):
    """
    Admin / tesorero → acceso completo (lectura + escritura).
    Auditor / contador → solo lectura (GET, HEAD, OPTIONS).
    """
    WRITE_ROLES = ('admin', 'tesorero')
    READ_ROLES  = ('admin', 'tesorero', 'auditor', 'contador')

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_super_admin:
            return True
        tenant_id = view.kwargs.get('tenant_id')
        if not tenant_id:
            return False
        allowed = self.WRITE_ROLES if request.method not in ('GET', 'HEAD', 'OPTIONS') else self.READ_ROLES
        return TenantUser.objects.filter(
            user=request.user, tenant_id=tenant_id, role__in=allowed
        ).exists()


class CanApproveReservation(BasePermission):
    """
    Dynamic permission that checks tenant.reservation_settings.role_permissions[role].can_approve.
    Falls back to admin/tesorero if role_permissions is not configured.
    Super admins always pass.
    """
    _FALLBACK_APPROVE_ROLES = ('admin', 'tesorero')

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_super_admin:
            return True
        tenant_id = view.kwargs.get('tenant_id')
        if not tenant_id:
            return False
        try:
            tu = TenantUser.objects.get(user=request.user, tenant_id=tenant_id)
        except TenantUser.DoesNotExist:
            return False
        role = tu.role
        # Try to read per-role configuration from tenant reservation_settings
        try:
            from .models import Tenant
            tenant = Tenant.objects.get(id=tenant_id)
            role_perms = (tenant.reservation_settings or {}).get('role_permissions', {})
            if role_perms and role in role_perms:
                return bool(role_perms[role].get('can_approve', False))
        except Exception:
            pass
        # Fallback: admin and tesorero can approve by default
        return role in self._FALLBACK_APPROVE_ROLES
