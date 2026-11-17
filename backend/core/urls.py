"""
Homly — API URL Configuration
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views
from . import rental_views
from . import airbnb_views
from . import rental_crm_views
from . import rental_rentroll
from . import rental_reports
from . import planeacion
from . import asambleas
from . import mantenimientos
from . import proveedores
from . import paqueteria
from . import visitas
from . import rental_mantenimiento
from . import rental_ops_views
from . import workspace_views
from . import rental_finance
from . import geo_views
from . import rental_map
from . import rita_views

router = DefaultRouter()
router.register(r'tenants', views.TenantViewSet, basename='tenants')
router.register(r'super-admins', views.SuperAdminViewSet, basename='super-admins')
router.register(r'audit-logs', views.AuditLogViewSet, basename='audit-logs')
router.register(r'subscription-plans', views.SubscriptionPlanViewSet, basename='subscription-plans')
router.register(r'trial-requests', views.TrialRequestViewSet, basename='trial-requests')
router.register(r'tenant-subscriptions', views.TenantSubscriptionViewSet, basename='tenant-subscriptions')
router.register(r'subscription-payments', views.SubscriptionPaymentViewSet, basename='subscription-payments')
router.register(r'system-roles', views.SystemRoleViewSet, basename='system-roles')
router.register(r'workspace-configs', workspace_views.WorkspaceConfigViewSet, basename='workspace-configs')

# System staff users (superadmin only)
router.register(r'system-users', views.SystemUserViewSet, basename='system-users')

# CRM routes (superadmin only)
router.register(r'crm/contacts', views.CRMContactViewSet, basename='crm-contacts')
router.register(r'crm/opportunities', views.CRMOpportunityViewSet, basename='crm-opportunities')
router.register(r'crm/activities', views.CRMActivityViewSet, basename='crm-activities')
router.register(r'crm/campaigns', views.CRMCampaignViewSet, basename='crm-campaigns')
router.register(r'crm/tickets', views.CRMTicketViewSet, basename='crm-tickets')

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
tenant_router.register(r'period-closure-requests', views.PeriodClosureRequestViewSet, basename='period-closure-requests')
tenant_router.register(r'assembly-positions', views.AssemblyPositionViewSet, basename='assembly-positions')
tenant_router.register(r'committees', views.CommitteeViewSet, basename='committees')
tenant_router.register(r'unrecognized-income', views.UnrecognizedIncomeViewSet, basename='unrecognized-income')
tenant_router.register(r'amenity-reservations', views.AmenityReservationViewSet, basename='amenity-reservations')
tenant_router.register(r'notifications', views.NotificationViewSet, basename='notifications')
tenant_router.register(r'payment-plans', views.PaymentPlanViewSet, basename='payment-plans')
tenant_router.register(r'blog-posts',        views.BlogPostViewSet,                basename='blog-posts')
tenant_router.register(r'payment-vouchers',  views.PaymentVoucherSubmissionViewSet, basename='payment-vouchers')
tenant_router.register(r'rental-properties', rental_views.RentalPropertyViewSet, basename='rental-properties')
tenant_router.register(r'rental-spaces', rental_views.RentalSpaceViewSet, basename='rental-spaces')
tenant_router.register(r'rental-parties', rental_views.RentalPartyViewSet, basename='rental-parties')
tenant_router.register(r'rental-concepts', rental_views.RentalChargeConceptViewSet, basename='rental-concepts')
tenant_router.register(r'rental-contracts', rental_views.RentalContractViewSet, basename='rental-contracts')
tenant_router.register(r'rental-charges', rental_views.RentalChargeViewSet, basename='rental-charges')
tenant_router.register(r'rental-payments', rental_views.RentalPaymentViewSet, basename='rental-payments')
tenant_router.register(r'airbnb-connections', airbnb_views.AirbnbConnectionViewSet, basename='airbnb-connections')
tenant_router.register(r'airbnb-listings', airbnb_views.AirbnbListingViewSet, basename='airbnb-listings')
tenant_router.register(r'rental-leads', rental_crm_views.RentalLeadViewSet, basename='rental-leads')
tenant_router.register(r'condo-budgets', planeacion.CondoBudgetViewSet, basename='condo-budgets')
tenant_router.register(r'condo-projects', planeacion.CondoProjectViewSet, basename='condo-projects')
tenant_router.register(r'condo-assemblies', asambleas.CondoAssemblyViewSet, basename='condo-assemblies')
tenant_router.register(r'condo-maintenance', mantenimientos.CondoMaintenanceWorkViewSet, basename='condo-maintenance')
tenant_router.register(r'condo-providers', proveedores.CondoProviderViewSet, basename='condo-providers')
tenant_router.register(r'condo-packages', paqueteria.CondoPackageViewSet, basename='condo-packages')
tenant_router.register(r'condo-visits', visitas.CondoVisitAuthViewSet, basename='condo-visits')
tenant_router.register(r'rental-maint-categories', rental_mantenimiento.RentalMaintCategoryViewSet, basename='rental-maint-categories')
tenant_router.register(r'rental-maint-work-types', rental_mantenimiento.RentalMaintWorkTypeViewSet, basename='rental-maint-work-types')
tenant_router.register(r'rental-maint-providers', rental_mantenimiento.RentalMaintProviderViewSet, basename='rental-maint-providers')
tenant_router.register(r'rental-maint-works', rental_mantenimiento.RentalMaintWorkViewSet, basename='rental-maint-works')
tenant_router.register(r'rental-assets', rental_ops_views.AssetViewSet, basename='rental-assets')
tenant_router.register(r'rental-plans', rental_ops_views.PlanViewSet, basename='rental-plans')
tenant_router.register(r'rental-requests', rental_ops_views.RequestViewSet, basename='rental-requests')
tenant_router.register(r'rental-inspection-templates', rental_ops_views.TemplateViewSet, basename='rental-inspection-templates')
tenant_router.register(r'rental-inspections', rental_ops_views.InspectionViewSet, basename='rental-inspections')
tenant_router.register(r'rental-capex-projects', rental_finance.CapexProjectViewSet, basename='rental-capex-projects')
tenant_router.register(r'rental-expenses', rental_finance.ExpenseViewSet, basename='rental-expenses')
tenant_router.register(r'rental-budget-lines', rental_finance.BudgetLineViewSet, basename='rental-budget-lines')

urlpatterns = [
    # Auth
    path('auth/login/', views.LoginView.as_view(), name='login'),
    path('auth/request-code/', views.RequestCodeView.as_view(), name='request-code'),
    path('auth/login-with-code/', views.LoginWithCodeView.as_view(), name='login-with-code'),
    path('auth/tenants/', views.TenantListForLoginView.as_view(), name='login-tenants'),
    path('auth/tenants-for-email/', views.TenantsForEmailView.as_view(), name='tenants-for-email'),
    path('auth/check-email/', views.CheckEmailView.as_view(), name='check-email'),
    path('auth/my-tenants/', views.UserTenantsView.as_view(), name='my-tenants'),
    path('auth/switch-tenant/', views.SwitchTenantView.as_view(), name='switch-tenant'),
    # M-06: refresh desde HttpOnly cookie (reemplaza el endpoint de simplejwt que lee del body)
    path('auth/token/refresh/', views.CookieTokenRefreshView.as_view(), name='token-refresh-cookie'),
    # M-06: logout que blacklistea el token y elimina la cookie
    path('auth/logout/', views.LogoutView.as_view(), name='logout'),
    # M-04: endpoint de media protegido (requiere autenticación, sirve via X-Accel-Redirect)
    path('media/<path:media_path>', views.ProtectedMediaView.as_view(), name='protected-media'),

    # Portadas de blog — públicas (no son datos sensibles; sólo imágenes decorativas)
    path('public/blog-covers/<str:filename>', views.BlogCoverPublicView.as_view(), name='blog-cover-public'),

    # Users
    path('users/', views.UserCreateView.as_view(), name='user-create'),

    # Landing page — public registration request (no auth)
    path('public/registro/', views.CondominioRequestView.as_view(), name='condominio-request'),

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
    path('tenants/<uuid:tenant_id>/reporte-adeudos/',
         views.ReporteAdeudosView.as_view(), name='reporte-adeudos'),
    path('tenants/<uuid:tenant_id>/estado-cuenta-pdf/',
         views.EstadoPorUnidadPDFView.as_view(), name='estado-cuenta-pdf'),
    path('tenants/<uuid:tenant_id>/carta-no-adeudo/',
         views.CartaNoAdeudoView.as_view(), name='carta-no-adeudo'),
    path('tenants/<uuid:tenant_id>/closing-report/',
         views.ClosingReportView.as_view(), name='closing-report'),
    path('tenants/<uuid:tenant_id>/period-expediente/',
         views.PeriodExpedienteView.as_view(), name='period-expediente'),
    path('tenants/<uuid:tenant_id>/period-expediente-doc/',
         views.PeriodExpedienteDocView.as_view(), name='period-expediente-doc'),
    # Rita — asistente estados de cuenta → cobranza / gastos
    path('tenants/<uuid:tenant_id>/rita/bank-profiles/',
         rita_views.RitaBankProfilesView.as_view(), name='rita-bank-profiles'),
    path('tenants/<uuid:tenant_id>/rita/settings/',
         rita_views.RitaSettingsView.as_view(), name='rita-settings'),
    path('tenants/<uuid:tenant_id>/rita/period-status/',
         rita_views.RitaPeriodStatusView.as_view(), name='rita-period-status'),
    path('tenants/<uuid:tenant_id>/rita/parse/',
         rita_views.RitaParseView.as_view(), name='rita-parse'),
    path('tenants/<uuid:tenant_id>/rita/parse-from-statement/',
         rita_views.RitaParseFromStatementView.as_view(), name='rita-parse-from-statement'),
    path('tenants/<uuid:tenant_id>/rita/sessions/<uuid:session_id>/',
         rita_views.RitaSessionDetailView.as_view(), name='rita-session'),
    path('tenants/<uuid:tenant_id>/rita/sessions/<uuid:session_id>/movement/',
         rita_views.RitaMovementActionView.as_view(), name='rita-movement'),
    path('tenants/<uuid:tenant_id>/rental-dashboard/',
         rental_views.RentalDashboardView.as_view(), name='rental-dashboard'),
    path('tenants/<uuid:tenant_id>/rental-map/',
         rental_map.RentalMapView.as_view(), name='rental-map'),
    path('geo/countries/', geo_views.GeoCountriesView.as_view(), name='geo-countries'),
    path('geo/regions/', geo_views.GeoRegionsView.as_view(), name='geo-regions'),
    path('geo/postal/', geo_views.GeoPostalView.as_view(), name='geo-postal'),
    path('tenants/<uuid:tenant_id>/rental-ops-settings/',
         rental_ops_views.OpsSettingsView.as_view(), name='rental-ops-settings'),
    path('tenants/<uuid:tenant_id>/rental-finance-summary/',
         rental_finance.SummaryView.as_view(), name='rental-finance-summary'),
    path('tenants/<uuid:tenant_id>/rental-finance-ledger/',
         rental_finance.LedgerView.as_view(), name='rental-finance-ledger'),
    path('tenants/<uuid:tenant_id>/rental-ops-indicators/',
         rental_ops_views.OpsIndicatorsView.as_view(), name='rental-ops-indicators'),
    path('public/rental-portal/<str:token>/',
         rental_ops_views.PublicPortalView.as_view(), name='rental-portal-public'),
    path('tenants/<uuid:tenant_id>/rental-calendar/',
         rental_views.RentalCalendarView.as_view(), name='rental-calendar'),
    path('tenants/<uuid:tenant_id>/rental-report-catalog/',
         rental_reports.ReportCatalogView.as_view(), name='rental-report-catalog'),
    path('tenants/<uuid:tenant_id>/rental-report/<str:key>/',
         rental_reports.ReportRunView.as_view(), name='rental-report-run'),
    path('tenants/<uuid:tenant_id>/rental-report-annual/',
         rental_reports.AnnualReportView.as_view(), name='rental-report-annual'),
    path('tenants/<uuid:tenant_id>/rental-report-provider-sla/',
         rental_reports.ProviderSlaView.as_view(), name='rental-report-provider-sla'),
    path('tenants/<uuid:tenant_id>/rental-report-overview/',
         rental_reports.OverviewView.as_view(), name='rental-report-overview'),
    path('tenants/<uuid:tenant_id>/rental-agenda/',
         rental_reports.AgendaView.as_view(), name='rental-agenda'),
    path('tenants/<uuid:tenant_id>/rental-rentroll/',
         rental_rentroll.RentalRentRollView.as_view(), name='rental-rentroll'),
    path('tenants/<uuid:tenant_id>/planeacion-context/',
         planeacion.PlaneacionContextView.as_view(), name='planeacion-context'),
    path('tenants/<uuid:tenant_id>/asambleas-context/',
         asambleas.AsambleaContextView.as_view(), name='asambleas-context'),
    path('tenants/<uuid:tenant_id>/mantenimientos-context/',
         mantenimientos.MaintenanceContextView.as_view(), name='mantenimientos-context'),

    # CRM Dashboard (aggregate stats)
    path('crm/dashboard/', views.CRMDashboardView.as_view(), name='crm-dashboard'),

    # Email endpoints
    path('tenants/<uuid:tenant_id>/send-unit-statement-email/',
         views.SendUnitStatementEmailView.as_view(), name='send-unit-statement-email'),
    path('tenants/<uuid:tenant_id>/send-unit-analysis-email/',
         views.SendUnitAnalysisEmailView.as_view(), name='send-unit-analysis-email'),
    path('tenants/<uuid:tenant_id>/send-statement-email/',
         views.SendGeneralStatementEmailView.as_view(), name='send-statement-email'),
    path('tenants/<uuid:tenant_id>/send-residente-statement-email/',
         views.SendResidenteStatementEmailView.as_view(), name='send-residente-statement-email'),
]
