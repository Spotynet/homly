"""APIs del espacio de trabajo de rentas."""
from calendar import monthrange
from datetime import date, timedelta
from decimal import Decimal

from django.db.models import Sum, Q
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from django.core.exceptions import ObjectDoesNotExist

from .models import (
    Tenant, RentalProperty, RentalParty, RentalChargeConcept,
    RentalContract, RentalCharge, RentalPayment,
)
from .permissions import IsTenantMember, IsAdminTesOrContador, IsFinancialManager
from .rental_serializers import (
    RentalPropertySerializer, RentalPartySerializer, RentalChargeConceptSerializer,
    RentalContractSerializer, RentalChargeSerializer, RentalPaymentSerializer,
)


DEFAULT_CONCEPTS = [
    ('Renta', True, True, 0),
    ('Depósito en garantía', False, False, 1),
    ('Mantenimiento', True, False, 2),
    ('Estacionamiento', True, False, 3),
    ('Servicios', False, False, 4),
]


def _require_rentas(tenant):
    if getattr(tenant, 'workspace_type', 'condominio') != 'rentas':
        from rest_framework.exceptions import ValidationError
        raise ValidationError({'detail': 'Este módulo solo aplica al espacio de rentas.'})


def _crm_dashboard(tenant):
    from .rental_crm_views import crm_dashboard
    return crm_dashboard(tenant)


def _airbnb_dashboard(tenant):
    from .models import AirbnbConnection, AirbnbListing
    conns = AirbnbConnection.objects.filter(tenant=tenant, is_active=True)
    listings = AirbnbListing.objects.filter(tenant=tenant)
    last = listings.exclude(last_synced_at=None).order_by('-last_synced_at').first()
    return {
        'connections': conns.count(),
        'listings': listings.count(),
        'mapped': listings.filter(property__isnull=False).count(),
        'occupied_now': listings.filter(occupied_now=True).count(),
        'last_synced_at': last.last_synced_at.isoformat() if last and last.last_synced_at else None,
    }


def _ensure_default_concepts(tenant):
    if RentalChargeConcept.objects.filter(tenant=tenant).exists():
        return
    for name, recurring, is_rent, order in DEFAULT_CONCEPTS:
        RentalChargeConcept.objects.create(
            tenant=tenant, name=name, is_recurring=recurring,
            is_rent=is_rent, sort_order=order,
        )


def _sync_property_occupancy(prop):
    active = prop.contracts.exclude(status__in=('cancelado', 'finalizado', 'borrador')).exists()
    airbnb_busy = False
    try:
        listing = prop.airbnb_listing
        airbnb_busy = bool(listing and listing.occupied_now)
    except ObjectDoesNotExist:
        airbnb_busy = False
    new = 'ocupada' if (active or airbnb_busy) else 'disponible'
    if prop.status in ('disponible', 'ocupada', 'reservada') and prop.status != new:
        prop.status = new
        prop.save(update_fields=['status', 'updated_at'])


class _RentalTenantMixin:
    permission_classes = [IsTenantMember]

    def get_tenant(self):
        tenant = Tenant.objects.get(id=self.kwargs['tenant_id'])
        _require_rentas(tenant)
        return tenant

    def get_queryset(self):
        return self.queryset.filter(tenant_id=self.kwargs['tenant_id'])

    def perform_create(self, serializer):
        tenant = self.get_tenant()
        serializer.save(tenant=tenant)


class RentalPropertyViewSet(_RentalTenantMixin, viewsets.ModelViewSet):
    queryset = RentalProperty.objects.all()
    serializer_class = RentalPropertySerializer
    permission_classes = [IsAdminTesOrContador]

    def get_queryset(self):
        qs = super().get_queryset()
        q = (self.request.query_params.get('search') or '').strip()
        st = self.request.query_params.get('status')
        if q:
            qs = qs.filter(
                Q(code__icontains=q) | Q(name__icontains=q) |
                Q(city__icontains=q) | Q(owner_name__icontains=q)
            )
        if st:
            qs = qs.filter(status=st)
        source = (self.request.query_params.get('source') or '').strip()
        if source:
            qs = qs.filter(source=source)
        return qs


class RentalPartyViewSet(_RentalTenantMixin, viewsets.ModelViewSet):
    queryset = RentalParty.objects.all()
    serializer_class = RentalPartySerializer
    permission_classes = [IsAdminTesOrContador]

    def get_queryset(self):
        qs = super().get_queryset()
        kind = self.request.query_params.get('kind')
        q = (self.request.query_params.get('search') or '').strip()
        if kind:
            qs = qs.filter(kind=kind)
        if q:
            qs = qs.filter(
                Q(first_name__icontains=q) | Q(last_name__icontains=q) |
                Q(email__icontains=q) | Q(phone__icontains=q)
            )
        return qs


class RentalChargeConceptViewSet(_RentalTenantMixin, viewsets.ModelViewSet):
    queryset = RentalChargeConcept.objects.all()
    serializer_class = RentalChargeConceptSerializer
    permission_classes = [IsAdminTesOrContador]


class RentalContractViewSet(_RentalTenantMixin, viewsets.ModelViewSet):
    queryset = RentalContract.objects.select_related('property', 'tenant_party', 'guarantor')
    serializer_class = RentalContractSerializer
    permission_classes = [IsAdminTesOrContador]

    def get_queryset(self):
        qs = super().get_queryset()
        for c in qs:
            c.refresh_lifecycle_status()
        st = self.request.query_params.get('status')
        q = (self.request.query_params.get('search') or '').strip()
        if st:
            qs = qs.filter(status=st)
        if q:
            qs = qs.filter(
                Q(code__icontains=q) | Q(property__code__icontains=q) |
                Q(property__name__icontains=q) |
                Q(tenant_party__first_name__icontains=q) |
                Q(tenant_party__last_name__icontains=q)
            )
        return qs

    def perform_create(self, serializer):
        tenant = self.get_tenant()
        contract = serializer.save(tenant=tenant)
        _sync_property_occupancy(contract.property)

    def perform_update(self, serializer):
        contract = serializer.save()
        contract.refresh_lifecycle_status()
        _sync_property_occupancy(contract.property)

    @action(detail=True, methods=['post'], url_path='activate')
    def activate(self, request, tenant_id=None, pk=None):
        contract = self.get_object()
        if contract.status == 'cancelado':
            return Response({'detail': 'El contrato está cancelado.'}, status=400)
        contract.status = 'activo'
        contract.save(update_fields=['status', 'updated_at'])
        contract.refresh_lifecycle_status()
        _sync_property_occupancy(contract.property)
        return Response(RentalContractSerializer(contract).data)

    @action(detail=True, methods=['post'], url_path='finish')
    def finish(self, request, tenant_id=None, pk=None):
        contract = self.get_object()
        next_status = request.data.get('status') or 'finalizado'
        if next_status not in ('finalizado', 'cancelado', 'renovado'):
            next_status = 'finalizado'
        contract.status = next_status
        contract.save(update_fields=['status', 'updated_at'])
        _sync_property_occupancy(contract.property)
        return Response(RentalContractSerializer(contract).data)


class RentalChargeViewSet(_RentalTenantMixin, viewsets.ModelViewSet):
    queryset = RentalCharge.objects.select_related(
        'contract', 'contract__property', 'contract__tenant_party', 'concept',
    )
    serializer_class = RentalChargeSerializer
    permission_classes = [IsAdminTesOrContador]

    def get_queryset(self):
        qs = super().get_queryset()
        period = self.request.query_params.get('period')
        st = self.request.query_params.get('status')
        contract_id = self.request.query_params.get('contract')
        if period:
            qs = qs.filter(period=period)
        if st:
            qs = qs.filter(status=st)
        if contract_id:
            qs = qs.filter(contract_id=contract_id)
        return qs

    @action(detail=False, methods=['post'], url_path='generate-period')
    def generate_period(self, request, tenant_id=None):
        """Genera cargos recurrentes (renta + conceptos) del período para contratos vigentes."""
        tenant = self.get_tenant()
        _ensure_default_concepts(tenant)
        period = (request.data.get('period') or date.today().strftime('%Y-%m'))[:7]
        try:
            year, month = [int(x) for x in period.split('-')]
            last_day = monthrange(year, month)[1]
        except Exception:
            return Response({'detail': 'Período inválido (YYYY-MM).'}, status=400)

        created = 0
        contracts = RentalContract.objects.filter(
            tenant=tenant,
            status__in=('activo', 'por_vencer', 'vencido'),
        ).select_related('property')
        rent_concept = RentalChargeConcept.objects.filter(tenant=tenant, is_rent=True).first()
        extras = list(RentalChargeConcept.objects.filter(
            tenant=tenant, enabled=True, is_recurring=True, is_rent=False,
        ))

        for contract in contracts:
            period_start = date(year, month, 1)
            period_end = date(year, month, last_day)
            if contract.end_date < period_start or contract.start_date > period_end:
                continue
            pay_day = min(max(int(contract.payment_day or 1), 1), last_day)
            due = date(year, month, pay_day)

            rent_exists = RentalCharge.objects.filter(
                contract=contract, period=period,
            ).filter(Q(concept=rent_concept) if rent_concept else Q(description__istartswith='Renta'))
            if not rent_exists.exists():
                RentalCharge.objects.create(
                    tenant=tenant, contract=contract, concept=rent_concept,
                    period=period,
                    description=f'Renta {period}',
                    amount=contract.rent_amount,
                    due_date=due,
                )
                created += 1

            for concept in extras:
                if concept.default_amount <= 0:
                    continue
                if RentalCharge.objects.filter(contract=contract, period=period, concept=concept).exists():
                    continue
                RentalCharge.objects.create(
                    tenant=tenant, contract=contract, concept=concept,
                    period=period,
                    description=f'{concept.name} {period}',
                    amount=concept.default_amount,
                    due_date=due,
                )
                created += 1

        return Response({'created': created, 'period': period})


class RentalPaymentViewSet(_RentalTenantMixin, viewsets.ModelViewSet):
    queryset = RentalPayment.objects.select_related('contract', 'charge')
    serializer_class = RentalPaymentSerializer
    permission_classes = [IsFinancialManager]

    def get_queryset(self):
        qs = super().get_queryset()
        period = self.request.query_params.get('period')
        contract_id = self.request.query_params.get('contract')
        if contract_id:
            qs = qs.filter(contract_id=contract_id)
        if period:
            qs = qs.filter(Q(charge__period=period) | Q(payment_date__startswith=period))
        return qs

    def perform_create(self, serializer):
        tenant = self.get_tenant()
        payment = serializer.save(tenant=tenant)
        if payment.charge_id:
            payment.charge.sync_status()

    def perform_destroy(self, instance):
        charge = instance.charge
        instance.delete()
        if charge:
            charge.sync_status()


class RentalDashboardView(APIView):
    permission_classes = [IsTenantMember]

    def get(self, request, tenant_id):
        tenant = Tenant.objects.get(id=tenant_id)
        _require_rentas(tenant)
        _ensure_default_concepts(tenant)
        today = date.today()
        period = request.query_params.get('period') or today.strftime('%Y-%m')

        props = RentalProperty.objects.filter(tenant=tenant, is_active=True)
        contracts = list(RentalContract.objects.filter(tenant=tenant).select_related('property', 'tenant_party'))
        for c in contracts:
            c.refresh_lifecycle_status(today)

        active = [c for c in contracts if c.status in ('activo', 'por_vencer')]
        expiring = [c for c in contracts if c.status == 'por_vencer']
        expired = [c for c in contracts if c.status == 'vencido']

        charges = RentalCharge.objects.filter(tenant=tenant, period=period).exclude(status='cancelado')
        expected = charges.aggregate(s=Sum('amount'))['s'] or Decimal('0')
        paid = Decimal('0')
        overdue_n = 0
        overdue_amt = Decimal('0')
        for ch in charges.prefetch_related('payments'):
            p = ch.paid_amount
            paid += p
            if ch.status != 'pagado' and ch.due_date and ch.due_date < today:
                overdue_n += 1
                overdue_amt += max(Decimal('0'), ch.amount - p)

        soon = today + timedelta(days=60)
        calendar = []
        for c in contracts:
            if c.status in ('cancelado',):
                continue
            if c.end_date < today - timedelta(days=30):
                continue
            calendar.append({
                'id': str(c.id),
                'code': c.code,
                'property_code': c.property.code,
                'property_name': c.property.name,
                'tenant_name': c.tenant_party.full_name,
                'start_date': str(c.start_date),
                'end_date': str(c.end_date),
                'status': c.status,
                'rent_amount': float(c.rent_amount),
                'days_left': (c.end_date - today).days,
            })
        calendar.sort(key=lambda x: x['end_date'])

        return Response({
            'period': period,
            'currency': tenant.currency,
            'properties': {
                'total': props.count(),
                'disponible': props.filter(status='disponible').count(),
                'ocupada': props.filter(status='ocupada').count(),
                'mantenimiento': props.filter(status='mantenimiento').count(),
            },
            'contracts': {
                'total': len(contracts),
                'active': len(active),
                'expiring': len(expiring),
                'expired': len(expired),
            },
            'period_finance': {
                'expected': float(expected),
                'collected': float(paid),
                'pending': float(max(Decimal('0'), expected - paid)),
                'overdue_count': overdue_n,
                'overdue_amount': float(overdue_amt),
            },
            'expiring_soon': [
                x for x in calendar if 0 <= x['days_left'] <= 60
            ][:12],
            'calendar': calendar,
            'airbnb': _airbnb_dashboard(tenant),
            'crm': _crm_dashboard(tenant),
        })


class RentalCalendarView(APIView):
    permission_classes = [IsTenantMember]

    def get(self, request, tenant_id):
        tenant = Tenant.objects.get(id=tenant_id)
        _require_rentas(tenant)
        today = date.today()
        horizon = int(request.query_params.get('days') or 180)
        until = today + timedelta(days=horizon)
        since = today - timedelta(days=30)
        rows = []
        qs = RentalContract.objects.filter(tenant=tenant).exclude(
            status='cancelado'
        ).select_related('property', 'tenant_party')
        for c in qs:
            c.refresh_lifecycle_status(today)
            if c.end_date < since and c.start_date < since:
                continue
            rows.append({
                'id': str(c.id),
                'code': c.code,
                'property_code': c.property.code,
                'property_name': c.property.name,
                'tenant_name': c.tenant_party.full_name,
                'start_date': str(c.start_date),
                'end_date': str(c.end_date),
                'status': c.status,
                'rent_amount': float(c.rent_amount),
                'days_left': (c.end_date - today).days,
                'kind': 'end' if c.end_date <= until else 'active',
            })
        rows.sort(key=lambda x: x['end_date'])
        include_ab = (request.query_params.get('airbnb') or '1') not in ('0', 'false', 'False')
        if include_ab:
            from .airbnb_views import airbnb_calendar_rows
            rows.extend(airbnb_calendar_rows(tenant, since, until))
            rows.sort(key=lambda x: x.get('end_date') or x.get('start_date') or '')
        return Response({'today': str(today), 'items': rows})
