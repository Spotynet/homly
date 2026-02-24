"""
Homly — Seed Demo Data
Recreates the exact demo data from the original single-file application.
Usage: python manage.py seed_data
"""
from django.core.management.base import BaseCommand
from core.models import (
    User, Tenant, TenantUser, Unit, ExtraField,
    AssemblyPosition, Committee,
)


class Command(BaseCommand):
    help = 'Seed database with Homly demo data'

    def handle(self, *args, **options):
        self.stdout.write('🌱 Seeding Homly demo data...\n')

        # ── Super Admin ──────────────────────────
        sa, created = User.objects.get_or_create(
            email='admin@homly.app',
            defaults={
                'name': 'Super Administrador',
                'is_super_admin': True,
                'is_staff': True,
                'is_superuser': True,
                'must_change_password': False,
            }
        )
        if created:
            sa.set_password('Super123')
            sa.save()
            self.stdout.write(self.style.SUCCESS('  ✓ Super Admin created'))
        else:
            self.stdout.write('  · Super Admin already exists')

        # ── Tenant: Residencial Las Palmas ───────
        tenant, t_created = Tenant.objects.get_or_create(
            name='Residencial Las Palmas',
            defaults={
                'units_count': 48,
                'common_areas': 'Alberca, Gimnasio, Salón de eventos, Jardín central',
                'maintenance_fee': 2500.00,
                'currency': 'MXN',
                'operation_start_date': '2024-01',
                'operation_type': 'fiscal',
                'country': 'México',
                'state': 'Ciudad de México',
                'bank_initial_balance': 0,
                'admin_type': 'mesa_directiva',
            }
        )
        if t_created:
            self.stdout.write(self.style.SUCCESS('  ✓ Tenant "Residencial Las Palmas" created'))
        else:
            self.stdout.write('  · Tenant already exists')

        # ── Units ────────────────────────────────
        units_data = [
            {
                'unit_name': 'Casa 1', 'unit_id_code': 'C-001',
                'owner_first_name': 'Carlos', 'owner_last_name': 'Rodríguez',
                'owner_email': 'carlos@email.com', 'owner_phone': '+52 55 1234 5678',
                'occupancy': 'propietario',
            },
            {
                'unit_name': 'Casa 2', 'unit_id_code': 'C-002',
                'owner_first_name': 'María', 'owner_last_name': 'López',
                'owner_email': 'maria@email.com', 'owner_phone': '+52 55 2345 6789',
                'occupancy': 'rentado',
                'tenant_first_name': 'Juan', 'tenant_last_name': 'Pérez',
                'tenant_email': 'juan@email.com', 'tenant_phone': '+52 55 8765 4321',
            },
            {
                'unit_name': 'Casa 3', 'unit_id_code': 'C-003',
                'owner_first_name': 'Ana', 'owner_last_name': 'García',
                'owner_email': 'ana@email.com', 'owner_phone': '+52 55 3456 7890',
                'occupancy': 'propietario',
            },
        ]

        unit_objs = {}
        for ud in units_data:
            unit, u_created = Unit.objects.get_or_create(
                tenant=tenant,
                unit_id_code=ud['unit_id_code'],
                defaults=ud,
            )
            unit_objs[ud['unit_id_code']] = unit
            if u_created:
                self.stdout.write(f'  ✓ Unit {ud["unit_id_code"]} created')

        # ── Users & Roles ────────────────────────
        users_data = [
            ('Carlos Rodríguez', 'carlos@email.com', 'Admin123', 'admin', 'C-001'),
            ('María López', 'maria@email.com', 'Teso1234', 'tesorero', None),
            ('Ana García', 'ana@email.com', 'Vecino12', 'vecino', 'C-003'),
            ('Pedro Sánchez', 'pedro@email.com', 'Conta123', 'contador', None),
            ('Laura Martínez', 'laura@email.com', 'Audit123', 'auditor', None),
            ('Juan Pérez', 'juan@email.com', 'Vecino34', 'vecino', 'C-002'),
        ]

        for name, email, pwd, role, unit_code in users_data:
            user, created = User.objects.get_or_create(
                email=email,
                defaults={
                    'name': name,
                    'must_change_password': role != 'admin',
                }
            )
            if created:
                user.set_password(pwd)
                user.save()

            unit_ref = unit_objs.get(unit_code) if unit_code else None
            TenantUser.objects.get_or_create(
                tenant=tenant,
                user=user,
                defaults={'role': role, 'unit': unit_ref},
            )
            if created:
                self.stdout.write(f'  ✓ User {email} ({role}) created')

        # ── Default Extra Fields ─────────────────
        default_fields = [
            {'label': 'Fondo de Reserva', 'default_amount': 500, 'required': True,
             'enabled': False, 'field_type': 'normal'},
            {'label': 'Estacionamiento', 'default_amount': 300, 'required': False,
             'enabled': False, 'field_type': 'normal'},
            {'label': 'Amenidades', 'default_amount': 200, 'required': False,
             'enabled': False, 'field_type': 'normal'},
            {'label': 'Multas / Recargos', 'default_amount': 0, 'required': False,
             'enabled': False, 'field_type': 'normal'},
            {'label': 'Agua', 'default_amount': 0, 'required': False,
             'enabled': False, 'field_type': 'gastos'},
            {'label': 'Luz Áreas Comunes', 'default_amount': 0, 'required': False,
             'enabled': False, 'field_type': 'gastos'},
            {'label': 'Jardinería', 'default_amount': 0, 'required': False,
             'enabled': False, 'field_type': 'gastos'},
            {'label': 'Limpieza', 'default_amount': 0, 'required': False,
             'enabled': False, 'field_type': 'gastos'},
            {'label': 'Vigilancia', 'default_amount': 0, 'required': False,
             'enabled': False, 'field_type': 'gastos'},
            {'label': 'Mantenimiento General', 'default_amount': 0, 'required': False,
             'enabled': False, 'field_type': 'gastos'},
            {'label': 'Seguros', 'default_amount': 0, 'required': False,
             'enabled': False, 'field_type': 'gastos'},
            {'label': 'Administración', 'default_amount': 0, 'required': False,
             'enabled': False, 'field_type': 'gastos'},
        ]

        for i, fd in enumerate(default_fields):
            ExtraField.objects.get_or_create(
                tenant=tenant,
                label=fd['label'],
                defaults={
                    **fd,
                    'sort_order': i,
                    'is_system_default': True,
                },
            )

        self.stdout.write(self.style.SUCCESS('  ✓ Extra fields created'))

        self.stdout.write(self.style.SUCCESS(
            '\n✅ Demo data seeded successfully!\n'
            '   Super Admin: admin@homly.app / Super123\n'
            '   Admin: carlos@email.com / Admin123\n'
            '   Tesorero: maria@email.com / Teso1234\n'
            '   Vecino: ana@email.com / Vecino12'
        ))
