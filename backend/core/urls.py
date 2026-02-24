"""
Homly — API URL Configuration
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'tenants', views.TenantViewSet, basename='tenants')
router.register(r'super-admins', views.SuperAdminViewSet, basename='super-admins')

# Nested routes under tenant
tenant_router = DefaultRouter()
tenant_router.register(r'units', views.UnitViewSet, basename='tenant-units')
tenant_router.register(r'users', views.TenantUserViewSet, basename='tenant-users')
tenant_router.register(r'extra-fields', views.ExtraFieldViewSet, basename='extra-fields')
tenant_router.register(r'payments', views.PaymentViewSet, basename='payments')
tenant_router.register(r'gasto-entries', views.GastoEntryViewSet, basename='gasto-entries')
tenant_router.register(r'caja-chica', views.CajaChicaViewSet, basename='caja-chica')
tenant_router.register(r'bank-statements', views.BankStatementViewSet, basename='bank-statements')
tenant_router.register(r'closed-periods', views.ClosedPeriodViewSet, basename='closed-periods')
tenant_router.register(r'reopen-requests', views.ReopenRequestViewSet, basename='reopen-requests')
tenant_router.register(r'assembly-positions', views.AssemblyPositionViewSet, basename='assembly-positions')
tenant_router.register(r'committees', views.CommitteeViewSet, basename='committees')
tenant_router.register(r'unrecognized-income', views.UnrecognizedIncomeViewSet, basename='unrecognized-income')

urlpatterns = [
    # Auth
    path('auth/login/', views.LoginView.as_view(), name='login'),
    path('auth/change-password/', views.ChangePasswordView.as_view(), name='change-password'),
    path('auth/tenants/', views.TenantListForLoginView.as_view(), name='login-tenants'),

    # Users
    path('users/', views.UserCreateView.as_view(), name='user-create'),

    # Top-level routes
    path('', include(router.urls)),

    # Tenant-scoped routes
    path('tenants/<uuid:tenant_id>/', include(tenant_router.urls)),

    # Dashboard & Reports
    path('tenants/<uuid:tenant_id>/dashboard/',
         views.DashboardView.as_view(), name='dashboard'),
    path('tenants/<uuid:tenant_id>/estado-cuenta/',
         views.EstadoCuentaView.as_view(), name='estado-cuenta'),
    path('tenants/<uuid:tenant_id>/reporte-general/',
         views.ReporteGeneralView.as_view(), name='reporte-general'),
]
