"""
Homly — Comprehensive Tests
Validates all endpoints match original app functionality.
"""
from decimal import Decimal
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
from core.models import (
    User, Tenant, TenantUser, Unit, ExtraField,
    Payment, FieldPayment, GastoEntry, CajaChicaEntry,
    ClosedPeriod, ReopenRequest, AssemblyPosition, Committee,
)


class BaseTestCase(TestCase):
    """Setup shared test data matching original demo."""

    def setUp(self):
        self.client = APIClient()

        # Super admin
        self.super_admin = User.objects.create_superuser(
            email='admin@homly.app', name='Super Admin', password='Super123'
        )

        # Tenant
        self.tenant = Tenant.objects.create(
            name='Residencial Las Palmas',
            units_count=48,
            maintenance_fee=Decimal('2500.00'),
            currency='MXN',
            operation_start_date='2024-01',
            country='México',
            state='Ciudad de México',
        )

        # Units
        self.unit1 = Unit.objects.create(
            tenant=self.tenant, unit_name='Casa 1', unit_id_code='C-001',
            owner_first_name='Carlos', owner_last_name='Rodríguez',
            owner_email='carlos@email.com', occupancy='propietario',
        )
        self.unit2 = Unit.objects.create(
            tenant=self.tenant, unit_name='Casa 2', unit_id_code='C-002',
            owner_first_name='María', owner_last_name='López',
            occupancy='rentado', tenant_first_name='Juan', tenant_last_name='Pérez',
        )
        self.unit3 = Unit.objects.create(
            tenant=self.tenant, unit_name='Casa 3', unit_id_code='C-003',
            owner_first_name='Ana', owner_last_name='García', occupancy='propietario',
        )

        # Users
        self.admin_user = User.objects.create_user(
            email='carlos@email.com', name='Carlos Rodríguez', password='Admin123'
        )
        TenantUser.objects.create(
            tenant=self.tenant, user=self.admin_user, role='admin', unit=self.unit1
        )

        self.tesorero_user = User.objects.create_user(
            email='maria@email.com', name='María López', password='Teso1234'
        )
        self.tesorero_user.must_change_password = True
        self.tesorero_user.save()
        TenantUser.objects.create(
            tenant=self.tenant, user=self.tesorero_user, role='tesorero'
        )

        self.vecino_user = User.objects.create_user(
            email='ana@email.com', name='Ana García', password='Vecino12'
        )
        TenantUser.objects.create(
            tenant=self.tenant, user=self.vecino_user, role='vecino', unit=self.unit3
        )

        # Extra fields
        self.fondo_reserva = ExtraField.objects.create(
            tenant=self.tenant, label='Fondo de Reserva',
            default_amount=Decimal('500'), required=True, enabled=True,
            is_system_default=True
        )

    def login_as(self, email, password, tenant_id=None):
        """Helper to login and set auth token."""
        data = {'email': email, 'password': password}
        if tenant_id:
            data['tenant_id'] = str(tenant_id)
        response = self.client.post('/api/auth/login/', data, format='json')
        if response.status_code == 200:
            token = response.data['access']
            self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        return response


# ═══════════════════════════════════════════════════════════
#  AUTH TESTS
# ═══════════════════════════════════════════════════════════

class AuthTests(BaseTestCase):

    def test_super_admin_login(self):
        resp = self.login_as('admin@homly.app', 'Super123')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['role'], 'superadmin')
        self.assertIn('access', resp.data)

    def test_admin_login_with_tenant(self):
        resp = self.login_as('carlos@email.com', 'Admin123', self.tenant.id)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['role'], 'admin')

    def test_invalid_password(self):
        resp = self.login_as('carlos@email.com', 'wrong', self.tenant.id)
        self.assertEqual(resp.status_code, 400)

    def test_vecino_login(self):
        resp = self.login_as('ana@email.com', 'Vecino12', self.tenant.id)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['role'], 'vecino')

    def test_must_change_password_flag(self):
        resp = self.login_as('maria@email.com', 'Teso1234', self.tenant.id)
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data['must_change_password'])

    def test_change_password(self):
        self.login_as('maria@email.com', 'Teso1234', self.tenant.id)
        resp = self.client.post('/api/auth/change-password/', {
            'current_password': 'Teso1234',
            'new_password': 'NewPass123',
        }, format='json')
        self.assertEqual(resp.status_code, 200)
        # Verify new password works
        self.client.credentials()
        resp2 = self.login_as('maria@email.com', 'NewPass123', self.tenant.id)
        self.assertEqual(resp2.status_code, 200)
        self.assertFalse(resp2.data['must_change_password'])

    def test_tenants_list_for_login(self):
        resp = self.client.get('/api/auth/tenants/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 1)
        self.assertEqual(resp.data[0]['name'], 'Residencial Las Palmas')


# ═══════════════════════════════════════════════════════════
#  TENANT TESTS
# ═══════════════════════════════════════════════════════════

class TenantTests(BaseTestCase):

    def test_list_tenants(self):
        self.login_as('admin@homly.app', 'Super123')
        resp = self.client.get('/api/tenants/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data['results']), 1)

    def test_create_tenant(self):
        self.login_as('admin@homly.app', 'Super123')
        resp = self.client.post('/api/tenants/', {
            'name': 'Residencial Los Olivos',
            'maintenance_fee': '3000.00',
            'currency': 'MXN',
        }, format='json')
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(Tenant.objects.count(), 2)

    def test_update_tenant(self):
        self.login_as('carlos@email.com', 'Admin123', self.tenant.id)
        resp = self.client.patch(
            f'/api/tenants/{self.tenant.id}/',
            {'maintenance_fee': '3000.00'},
            format='json'
        )
        self.assertEqual(resp.status_code, 200)
        self.tenant.refresh_from_db()
        self.assertEqual(self.tenant.maintenance_fee, Decimal('3000.00'))


# ═══════════════════════════════════════════════════════════
#  UNIT TESTS
# ═══════════════════════════════════════════════════════════

class UnitTests(BaseTestCase):

    def test_list_units(self):
        self.login_as('carlos@email.com', 'Admin123', self.tenant.id)
        resp = self.client.get(f'/api/tenants/{self.tenant.id}/units/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data['results']), 3)

    def test_create_unit(self):
        self.login_as('carlos@email.com', 'Admin123', self.tenant.id)
        resp = self.client.post(f'/api/tenants/{self.tenant.id}/units/', {
            'unit_name': 'Casa 4',
            'unit_id_code': 'C-004',
            'owner_first_name': 'Pedro',
            'owner_last_name': 'Sánchez',
            'occupancy': 'propietario',
        }, format='json')
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(Unit.objects.filter(tenant=self.tenant).count(), 4)

    def test_responsible_name_owner(self):
        self.assertEqual(self.unit1.responsible_name, 'Carlos Rodríguez')

    def test_responsible_name_renter(self):
        self.assertEqual(self.unit2.responsible_name, 'Juan Pérez')


# ═══════════════════════════════════════════════════════════
#  PAYMENT / COBRANZA TESTS
# ═══════════════════════════════════════════════════════════

class PaymentTests(BaseTestCase):

    def test_capture_full_payment(self):
        self.login_as('carlos@email.com', 'Admin123', self.tenant.id)
        resp = self.client.post(
            f'/api/tenants/{self.tenant.id}/payments/capture/',
            {
                'unit_id': str(self.unit1.id),
                'period': '2025-01',
                'payment_type': 'transferencia',
                'payment_date': '2025-01-15',
                'field_payments': {
                    'maintenance': {'received': '2500'},
                    str(self.fondo_reserva.id): {'received': '500'},
                },
            },
            format='json'
        )
        self.assertEqual(resp.status_code, 201)
        payment = Payment.objects.get(unit=self.unit1, period='2025-01')
        self.assertEqual(payment.status, 'pagado')

    def test_capture_partial_payment(self):
        self.login_as('carlos@email.com', 'Admin123', self.tenant.id)
        self.client.post(
            f'/api/tenants/{self.tenant.id}/payments/capture/',
            {
                'unit_id': str(self.unit1.id),
                'period': '2025-02',
                'payment_type': 'efectivo',
                'field_payments': {
                    'maintenance': {'received': '1500'},
                },
            },
            format='json'
        )
        payment = Payment.objects.get(unit=self.unit1, period='2025-02')
        self.assertEqual(payment.status, 'parcial')

    def test_capture_blocked_on_closed_period(self):
        self.login_as('carlos@email.com', 'Admin123', self.tenant.id)
        ClosedPeriod.objects.create(
            tenant=self.tenant, period='2025-03', closed_by=self.admin_user
        )
        resp = self.client.post(
            f'/api/tenants/{self.tenant.id}/payments/capture/',
            {
                'unit_id': str(self.unit1.id),
                'period': '2025-03',
                'payment_type': 'transferencia',
                'field_payments': {'maintenance': {'received': '2500'}},
            },
            format='json'
        )
        self.assertEqual(resp.status_code, 400)

    def test_list_payments_by_period(self):
        self.login_as('carlos@email.com', 'Admin123', self.tenant.id)
        Payment.objects.create(
            tenant=self.tenant, unit=self.unit1, period='2025-01',
            status='pagado', payment_type='transferencia',
        )
        resp = self.client.get(
            f'/api/tenants/{self.tenant.id}/payments/?period=2025-01'
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data['results']), 1)


# ═══════════════════════════════════════════════════════════
#  GASTO / CAJA CHICA TESTS
# ═══════════════════════════════════════════════════════════

class GastoTests(BaseTestCase):

    def test_create_gasto_entry(self):
        self.login_as('carlos@email.com', 'Admin123', self.tenant.id)
        resp = self.client.post(
            f'/api/tenants/{self.tenant.id}/gasto-entries/',
            {
                'period': '2025-01',
                'field': str(self.fondo_reserva.id),
                'amount': '1500.00',
                'payment_type': 'transferencia',
                'provider_name': 'Proveedor ABC',
            },
            format='json'
        )
        self.assertEqual(resp.status_code, 201)

    def test_list_gastos_by_period(self):
        self.login_as('carlos@email.com', 'Admin123', self.tenant.id)
        GastoEntry.objects.create(
            tenant=self.tenant, period='2025-01', field=self.fondo_reserva,
            amount=Decimal('1000'), payment_type='transferencia',
        )
        resp = self.client.get(
            f'/api/tenants/{self.tenant.id}/gasto-entries/?period=2025-01'
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data['results']), 1)

    def test_create_caja_chica(self):
        self.login_as('carlos@email.com', 'Admin123', self.tenant.id)
        resp = self.client.post(
            f'/api/tenants/{self.tenant.id}/caja-chica/',
            {
                'period': '2025-01',
                'amount': '250.00',
                'description': 'Compra de material de limpieza',
                'payment_type': 'efectivo',
            },
            format='json'
        )
        self.assertEqual(resp.status_code, 201)

    def test_delete_caja_chica(self):
        self.login_as('carlos@email.com', 'Admin123', self.tenant.id)
        entry = CajaChicaEntry.objects.create(
            tenant=self.tenant, period='2025-01', amount=100,
            description='Test', payment_type='efectivo',
        )
        resp = self.client.delete(
            f'/api/tenants/{self.tenant.id}/caja-chica/{entry.id}/'
        )
        self.assertEqual(resp.status_code, 204)


# ═══════════════════════════════════════════════════════════
#  PERIOD MANAGEMENT TESTS
# ═══════════════════════════════════════════════════════════

class PeriodTests(BaseTestCase):

    def test_close_period(self):
        self.login_as('carlos@email.com', 'Admin123', self.tenant.id)
        resp = self.client.post(
            f'/api/tenants/{self.tenant.id}/closed-periods/',
            {'period': '2025-01'},
            format='json'
        )
        self.assertEqual(resp.status_code, 201)
        self.assertTrue(
            ClosedPeriod.objects.filter(tenant=self.tenant, period='2025-01').exists()
        )

    def test_reopen_request_workflow(self):
        self.login_as('carlos@email.com', 'Admin123', self.tenant.id)
        ClosedPeriod.objects.create(
            tenant=self.tenant, period='2025-01', closed_by=self.admin_user
        )
        # Create reopen request
        resp = self.client.post(
            f'/api/tenants/{self.tenant.id}/reopen-requests/',
            {'period': '2025-01', 'reason': 'Faltó registrar un pago'},
            format='json'
        )
        self.assertEqual(resp.status_code, 201)
        req_id = resp.data['id']

        # Approve it
        resp2 = self.client.post(
            f'/api/tenants/{self.tenant.id}/reopen-requests/{req_id}/approve/'
        )
        self.assertEqual(resp2.status_code, 200)
        self.assertEqual(resp2.data['status'], 'approved')
        # Period should be reopened
        self.assertFalse(
            ClosedPeriod.objects.filter(tenant=self.tenant, period='2025-01').exists()
        )


# ═══════════════════════════════════════════════════════════
#  DASHBOARD TESTS
# ═══════════════════════════════════════════════════════════

class DashboardTests(BaseTestCase):

    def test_dashboard_data(self):
        self.login_as('carlos@email.com', 'Admin123', self.tenant.id)
        resp = self.client.get(
            f'/api/tenants/{self.tenant.id}/dashboard/?period=2025-01'
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['total_units'], 3)
        self.assertEqual(resp.data['period'], '2025-01')

    def test_dashboard_with_payments(self):
        self.login_as('carlos@email.com', 'Admin123', self.tenant.id)
        # Create a payment
        payment = Payment.objects.create(
            tenant=self.tenant, unit=self.unit1, period='2025-01',
            status='pagado', payment_type='transferencia',
        )
        FieldPayment.objects.create(
            payment=payment, field_key='maintenance', received=Decimal('2500')
        )
        resp = self.client.get(
            f'/api/tenants/{self.tenant.id}/dashboard/?period=2025-01'
        )
        self.assertEqual(resp.data['paid_count'], 1)
        self.assertEqual(resp.data['pending_count'], 2)


# ═══════════════════════════════════════════════════════════
#  ESTADO DE CUENTA TESTS
# ═══════════════════════════════════════════════════════════

class EstadoCuentaTests(BaseTestCase):

    def test_estado_cuenta_unit(self):
        self.login_as('carlos@email.com', 'Admin123', self.tenant.id)
        # Create payment data
        payment = Payment.objects.create(
            tenant=self.tenant, unit=self.unit1, period='2025-01',
            status='pagado', payment_type='transferencia',
        )
        FieldPayment.objects.create(
            payment=payment, field_key='maintenance', received=Decimal('2500')
        )
        resp = self.client.get(
            f'/api/tenants/{self.tenant.id}/estado-cuenta/'
            f'?unit_id={self.unit1.id}&from=2025-01&to=2025-01'
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data['periods']), 1)


# ═══════════════════════════════════════════════════════════
#  EXTRA FIELDS TESTS
# ═══════════════════════════════════════════════════════════

class ExtraFieldTests(BaseTestCase):

    def test_list_extra_fields(self):
        self.login_as('carlos@email.com', 'Admin123', self.tenant.id)
        resp = self.client.get(f'/api/tenants/{self.tenant.id}/extra-fields/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data['results']), 1)

    def test_create_custom_field(self):
        self.login_as('carlos@email.com', 'Admin123', self.tenant.id)
        resp = self.client.post(
            f'/api/tenants/{self.tenant.id}/extra-fields/',
            {
                'label': 'Cuota Extraordinaria',
                'default_amount': '1000.00',
                'required': True,
                'enabled': True,
                'field_type': 'normal',
            },
            format='json'
        )
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(ExtraField.objects.filter(tenant=self.tenant).count(), 2)


# ═══════════════════════════════════════════════════════════
#  ASSEMBLY TESTS
# ═══════════════════════════════════════════════════════════

class AssemblyTests(BaseTestCase):

    def test_create_position(self):
        self.login_as('carlos@email.com', 'Admin123', self.tenant.id)
        resp = self.client.post(
            f'/api/tenants/{self.tenant.id}/assembly-positions/',
            {
                'title': 'Presidente',
                'holder_name': 'Carlos Rodríguez',
                'active': True,
            },
            format='json'
        )
        self.assertEqual(resp.status_code, 201)

    def test_create_committee(self):
        self.login_as('carlos@email.com', 'Admin123', self.tenant.id)
        resp = self.client.post(
            f'/api/tenants/{self.tenant.id}/committees/',
            {
                'name': 'Comité de Vigilancia',
                'description': 'Supervisa seguridad',
                'members': 'Ana García, Juan Pérez',
            },
            format='json'
        )
        self.assertEqual(resp.status_code, 201)


# ═══════════════════════════════════════════════════════════
#  PERMISSION TESTS
# ═══════════════════════════════════════════════════════════

class PermissionTests(BaseTestCase):

    def test_vecino_cannot_create_unit(self):
        self.login_as('ana@email.com', 'Vecino12', self.tenant.id)
        resp = self.client.post(f'/api/tenants/{self.tenant.id}/units/', {
            'unit_name': 'Hack',
            'unit_id_code': 'X-001',
            'occupancy': 'propietario',
        }, format='json')
        self.assertEqual(resp.status_code, 403)

    def test_vecino_cannot_access_other_tenant(self):
        other_tenant = Tenant.objects.create(name='Other', maintenance_fee=1000)
        self.login_as('ana@email.com', 'Vecino12', self.tenant.id)
        resp = self.client.get(f'/api/tenants/{other_tenant.id}/units/')
        self.assertEqual(resp.status_code, 403)

    def test_unauthenticated_rejected(self):
        resp = self.client.get(f'/api/tenants/{self.tenant.id}/units/')
        self.assertEqual(resp.status_code, 401)
