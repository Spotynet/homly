from django.contrib import admin
from .models import (
    User, Tenant, TenantUser, Unit, ExtraField,
    Payment, FieldPayment, GastoEntry, CajaChicaEntry,
    BankStatement, ClosedPeriod, ReopenRequest,
    AssemblyPosition, Committee,
)

@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ['email', 'name', 'is_super_admin', 'is_active', 'created_at']
    search_fields = ['email', 'name']
    list_filter = ['is_super_admin', 'is_active']

@admin.register(Tenant)
class TenantAdmin(admin.ModelAdmin):
    list_display = ['name', 'units_count', 'maintenance_fee', 'currency', 'country']
    search_fields = ['name']

@admin.register(TenantUser)
class TenantUserAdmin(admin.ModelAdmin):
    list_display = ['user', 'tenant', 'role']
    list_filter = ['role', 'tenant']

@admin.register(Unit)
class UnitAdmin(admin.ModelAdmin):
    list_display = ['unit_id_code', 'unit_name', 'tenant', 'occupancy']
    list_filter = ['tenant', 'occupancy']
    search_fields = ['unit_id_code', 'unit_name', 'owner_last_name']

@admin.register(ExtraField)
class ExtraFieldAdmin(admin.ModelAdmin):
    list_display = ['label', 'tenant', 'default_amount', 'required', 'enabled']
    list_filter = ['tenant', 'required', 'enabled']

@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = ['unit', 'period', 'status', 'payment_type', 'payment_date']
    list_filter = ['tenant', 'status', 'period']
    search_fields = ['unit__unit_id_code']

@admin.register(GastoEntry)
class GastoEntryAdmin(admin.ModelAdmin):
    list_display = ['tenant', 'period', 'amount', 'provider_name', 'payment_type']
    list_filter = ['tenant', 'period']

@admin.register(CajaChicaEntry)
class CajaChicaAdmin(admin.ModelAdmin):
    list_display = ['tenant', 'period', 'amount', 'description', 'payment_type']
    list_filter = ['tenant', 'period']

admin.site.register(FieldPayment)
admin.site.register(BankStatement)
admin.site.register(ClosedPeriod)
admin.site.register(ReopenRequest)
admin.site.register(AssemblyPosition)
admin.site.register(Committee)
