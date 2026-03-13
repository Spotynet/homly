"""
Homly — Custom Permissions
Role-based access control matching the original app's role system.
"""
from rest_framework.permissions import BasePermission
from .models import TenantUser


class IsSuperAdmin(BasePermission):
    """Only super admins (system-level)."""
    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and request.user.is_super_admin
        )


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
