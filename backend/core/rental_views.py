"""APIs del espacio de trabajo de rentas."""
from calendar import monthrange
from datetime import date, timedelta
from decimal import Decimal

from django.db.models import Sum, Q, Count
from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from django.core.exceptions import ObjectDoesNotExist

from .models import (
    Tenant, RentalProperty, RentalSpace, RentalParty, RentalChargeConcept,
    RentalContract, RentalCharge, RentalPayment, RentalContractSignature,
)
from .permissions import IsTenantMember
from .rental_access import RentalAccess
from .rental_notifications import (
    on_charges_generated, on_contract_activated, on_contract_created,
    on_contract_finished, on_payment_deleted, on_payment_registered,
    on_property_created, on_property_status_changed, refresh_contract_and_notify,
)
from .rental_mode import LEASE_KINDS
from .rental_legal import default_brief, draft_contract, next_contract_code, presentation_html
from .rental_rent import compute_effective_rent, rent_charge_label
from .rental_serializers import (
    RentalPropertySerializer, RentalSpaceSerializer, RentalPartySerializer, RentalChargeConceptSerializer,
    RentalContractSerializer, RentalChargeSerializer, RentalPaymentSerializer,
    RentalContractSignatureSerializer,
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
        raise ValidationError({'detail': 'Este módulo solo aplica a Administrar Propiedades.'})


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
    if not prop or prop.usage == 'operacion':
        return
    if prop.tenancy_model == 'multi':
        from .rental_spaces import sync_property_spaces
        sync_property_spaces(prop)
        return
    active = prop.contracts.filter(kind='renta').exclude(status__in=('cancelado', 'finalizado', 'borrador')).exists()
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


def _apply_usage_rules(prop):
    """Una propiedad solo-operación nunca figura como disponible/ocupada para renta."""
    if prop.usage == 'operacion':
        if prop.status in ('disponible', 'ocupada', 'reservada'):
            prop.status = 'operativa'
            prop.save(update_fields=['status', 'updated_at'])
    elif prop.status == 'operativa':
        prop.status = 'disponible'
        prop.save(update_fields=['status', 'updated_at'])
        _sync_property_occupancy(prop)


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
    permission_classes = [RentalAccess('rentas_propiedades')]

    def get_queryset(self):
        qs = super().get_queryset().prefetch_related('spaces')
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
        ptype = (self.request.query_params.get('property_type') or '').strip()
        if ptype:
            qs = qs.filter(property_type=ptype)
        usage = (self.request.query_params.get('usage') or '').strip()
        if usage in ('renta', 'operacion'):
            qs = qs.filter(usage=usage)
        tenancy = (self.request.query_params.get('tenancy') or '').strip()
        if tenancy in ('single', 'multi'):
            qs = qs.filter(tenancy_model=tenancy)
        group = (self.request.query_params.get('group') or '').strip()
        group_types = RentalProperty.TYPE_GROUPS.get(group)
        if group_types:
            qs = qs.filter(property_type__in=group_types)
        return qs

    def perform_create(self, serializer):
        from .rental_mode import default_usage
        tenant = self.get_tenant()
        extra = {}
        if 'usage' not in self.request.data:
            extra['usage'] = default_usage(tenant)
        prop = serializer.save(tenant=tenant, **extra)
        _apply_usage_rules(prop)
        on_property_created(prop)

    def perform_update(self, serializer):
        from rest_framework.exceptions import ValidationError
        inst = self.get_object()
        old_status = inst.status
        new_usage = serializer.validated_data.get('usage')
        if new_usage == 'operacion' and inst.usage != 'operacion':
            live = inst.contracts.filter(kind__in=LEASE_KINDS).exclude(
                status__in=('cancelado', 'finalizado', 'borrador', 'renovado'),
            ).first()
            if live:
                raise ValidationError({'usage': f'Tiene el contrato de renta {live.code} vigente. Finalízalo o cancélalo antes de cambiarla a "Solo operación".'})
        new_tenancy = serializer.validated_data.get('tenancy_model')
        if new_tenancy == 'single' and inst.tenancy_model == 'multi':
            tied = inst.contracts.filter(kind__in=LEASE_KINDS, space__isnull=False).exclude(
                status__in=('cancelado', 'finalizado', 'borrador', 'renovado'),
            ).first()
            if tied:
                raise ValidationError({'tenancy_model': f'El contrato {tied.code} está ligado a un espacio. Finalízalo antes de cambiar a Single Tenant.'})
        prop = serializer.save()
        _apply_usage_rules(prop)
        if prop.tenancy_model != inst.tenancy_model:
            _sync_property_occupancy(prop)
        on_property_status_changed(prop, old_status)


class RentalPartyViewSet(_RentalTenantMixin, viewsets.ModelViewSet):
    queryset = RentalParty.objects.all()
    serializer_class = RentalPartySerializer
    permission_classes = [RentalAccess('rentas_contratos', 'rentas_crm', 'rentas_cobranza', 'rentas_propiedades')]

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
    permission_classes = [RentalAccess('rentas_cobranza', 'rentas_contratos')]


class RentalContractViewSet(_RentalTenantMixin, viewsets.ModelViewSet):
    queryset = RentalContract.objects.select_related(
        'property', 'tenant_party', 'guarantor', 'provider', 'category', 'work',
    )
    serializer_class = RentalContractSerializer
    permission_classes = [RentalAccess('rentas_contratos')]

    def get_queryset(self):
        qs = super().get_queryset().annotate(
            signature_count=Count('signatures', distinct=True),
            signed_count=Count('signatures', filter=Q(signatures__status='firmado'), distinct=True),
        )
        for c in qs:
            refresh_contract_and_notify(c)
        st = self.request.query_params.get('status')
        kind = self.request.query_params.get('kind')
        q = (self.request.query_params.get('search') or '').strip()
        if st:
            qs = qs.filter(status=st)
        if kind:
            qs = qs.filter(kind=kind)
        if q:
            qs = qs.filter(
                Q(code__icontains=q) | Q(title__icontains=q) |
                Q(property__code__icontains=q) | Q(property__name__icontains=q) |
                Q(tenant_party__first_name__icontains=q) | Q(tenant_party__last_name__icontains=q) |
                Q(provider__name__icontains=q) | Q(counterparty_name__icontains=q)
            )
        if self.action in ('retrieve', 'draft', 'present', 'publish', 'signatures', 'sign'):
            qs = qs.prefetch_related('signatures')
        return qs

    def _full(self, contract):
        obj = (
            RentalContract.objects
            .select_related('property', 'tenant_party', 'guarantor', 'provider', 'category', 'work')
            .prefetch_related('signatures')
            .annotate(
                signature_count=Count('signatures', distinct=True),
                signed_count=Count('signatures', filter=Q(signatures__status='firmado'), distinct=True),
            )
            .get(pk=contract.pk)
        )
        return RentalContractSerializer(obj, context={'request': self.request, 'include_signatures': True}).data

    def perform_create(self, serializer):
        tenant = self.get_tenant()
        extra = {}
        code = (serializer.validated_data.get('code') or '').strip()
        kind = serializer.validated_data.get('kind') or 'renta'
        if not code:
            extra['code'] = next_contract_code(tenant, kind)
        if not (serializer.validated_data.get('title') or '').strip():
            from .rental_legal import KIND_TITLES
            extra['title'] = KIND_TITLES.get(kind, 'Contrato')
        contract = serializer.save(tenant=tenant, **extra)
        _sync_property_occupancy(contract.property)
        on_contract_created(contract)

    def retrieve(self, request, *args, **kwargs):
        return Response(self._full(self.get_object()))

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return Response(self._full(serializer.instance), status=status.HTTP_201_CREATED)

    def perform_update(self, serializer):
        prev = self.get_object().status
        contract = serializer.save()
        refresh_contract_and_notify(contract)
        _sync_property_occupancy(contract.property)
        if prev in ('borrador',) and contract.status not in ('borrador', 'cancelado'):
            on_contract_activated(contract)
        elif prev != contract.status and contract.status in ('finalizado', 'cancelado', 'renovado'):
            on_contract_finished(contract, contract.status)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return Response(self._full(serializer.instance))

    @action(detail=True, methods=['post'], url_path='activate')
    def activate(self, request, tenant_id=None, pk=None):
        contract = self.get_object()
        if contract.status == 'cancelado':
            return Response({'detail': 'El contrato está cancelado.'}, status=400)
        contract.status = 'activo'
        contract.save(update_fields=['status', 'updated_at'])
        refresh_contract_and_notify(contract)
        _sync_property_occupancy(contract.property)
        on_contract_activated(contract)
        return Response(self._full(contract))

    @action(detail=True, methods=['post'], url_path='finish')
    def finish(self, request, tenant_id=None, pk=None):
        contract = self.get_object()
        next_status = request.data.get('status') or 'finalizado'
        if next_status not in ('finalizado', 'cancelado', 'renovado'):
            next_status = 'finalizado'
        contract.status = next_status
        contract.save(update_fields=['status', 'updated_at'])
        _sync_property_occupancy(contract.property)
        on_contract_finished(contract, next_status)
        return Response(self._full(contract))

    @action(detail=True, methods=['post'], url_path='draft')
    def draft(self, request, tenant_id=None, pk=None):
        contract = self.get_object()
        brief = request.data.get('brief') if isinstance(request.data.get('brief'), dict) else {}
        merged = {**default_brief(contract), **(contract.assistant_brief or {}), **brief}
        contract.assistant_brief = merged
        contract.body = draft_contract(contract, merged)
        if contract.legal_stage in ('none', 'entrevista'):
            contract.legal_stage = 'redaccion'
        if request.data.get('title'):
            contract.title = str(request.data.get('title'))[:240]
        contract.save(update_fields=['assistant_brief', 'body', 'legal_stage', 'title', 'updated_at'])
        return Response(self._full(contract))

    @action(detail=True, methods=['get'], url_path='present')
    def present(self, request, tenant_id=None, pk=None):
        contract = self.get_object()
        html = presentation_html(contract)
        if not html:
            return Response({'detail': 'Aún no hay redacción para presentar. Usa el asistente legal.'}, status=400)
        return Response({
            'id': str(contract.id),
            'code': contract.code,
            'title': contract.title,
            'kind': contract.kind,
            'html': html,
            'body': contract.published_body or contract.body,
            'legal_stage': contract.legal_stage,
            'published_at': contract.published_at,
        })

    @action(detail=True, methods=['post'], url_path='publish')
    def publish(self, request, tenant_id=None, pk=None):
        contract = self.get_object()
        body = (request.data.get('body') or contract.body or '').strip()
        if not body:
            return Response({'detail': 'No hay texto para publicar. Genera el contrato con el asistente.'}, status=400)
        if request.data.get('require_signatures') and contract.signatures.exclude(status='firmado').exists():
            return Response({'detail': 'Aún hay firmas pendientes.'}, status=400)
        user = request.user if getattr(request.user, 'is_authenticated', False) else None
        contract.body = body
        contract.published_body = body
        contract.published_at = timezone.now()
        contract.published_by = user
        contract.legal_stage = 'publicado'
        contract.save(update_fields=['body', 'published_body', 'published_at', 'published_by', 'legal_stage', 'updated_at'])
        activate = request.data.get('activate')
        if activate and contract.status == 'borrador':
            contract.status = 'activo'
            contract.save(update_fields=['status', 'updated_at'])
            refresh_contract_and_notify(contract)
            _sync_property_occupancy(contract.property)
            on_contract_activated(contract)
        return Response(self._full(contract))

    @action(detail=True, methods=['get', 'post'], url_path='signatures')
    def signatures(self, request, tenant_id=None, pk=None):
        contract = self.get_object()
        if request.method == 'GET':
            return Response(RentalContractSignatureSerializer(contract.signatures.all(), many=True, context={'request': request}).data)
        name = (request.data.get('signer_name') or '').strip()
        if not name:
            return Response({'detail': 'Indica el nombre de quien firma.'}, status=400)
        party_id = str(request.data.get('party') or '').strip() or None
        provider_id = str(request.data.get('provider') or '').strip() or None
        obj = RentalContractSignature.objects.create(
            contract=contract,
            signer_name=name[:200],
            signer_role=(request.data.get('signer_role') or '')[:120],
            signer_email=(request.data.get('signer_email') or '')[:254],
            party_id=party_id,
            provider_id=provider_id,
        )
        if contract.legal_stage in ('none', 'entrevista', 'redaccion'):
            contract.legal_stage = 'firmas'
            contract.save(update_fields=['legal_stage', 'updated_at'])
        return Response(RentalContractSignatureSerializer(obj, context={'request': request}).data, status=201)

    @action(detail=True, methods=['post'], url_path='signatures/(?P<sig_id>[^/.]+)/sign')
    def sign(self, request, tenant_id=None, pk=None, sig_id=None):
        contract = self.get_object()
        obj = contract.signatures.filter(id=sig_id).first()
        if not obj:
            return Response({'detail': 'Firma no encontrada.'}, status=404)
        signed_name = (request.data.get('signed_name') or obj.signer_name or '').strip()
        if not signed_name:
            return Response({'detail': 'Escribe el nombre para el acuse de firma.'}, status=400)
        uploaded = request.FILES.get('file')
        obj.signed_name = signed_name[:200]
        obj.method = 'imagen' if uploaded else 'acuse'
        obj.status = 'firmado'
        obj.signed_at = timezone.now()
        obj.notes = (request.data.get('notes') or '')[:400]
        if uploaded:
            obj.file = uploaded
        obj.save()
        return Response(RentalContractSignatureSerializer(obj, context={'request': request}).data)

    @action(detail=True, methods=['delete'], url_path='signatures/(?P<sig_id>[^/.]+)')
    def destroy_signature(self, request, tenant_id=None, pk=None, sig_id=None):
        contract = self.get_object()
        obj = contract.signatures.filter(id=sig_id).first()
        if not obj:
            return Response({'detail': 'Firma no encontrada.'}, status=404)
        if obj.file:
            obj.file.delete(save=False)
        obj.delete()
        return Response(status=204)


class RentalChargeViewSet(_RentalTenantMixin, viewsets.ModelViewSet):
    queryset = RentalCharge.objects.select_related(
        'contract', 'contract__property', 'contract__tenant_party', 'concept',
    ).prefetch_related('payments')
    serializer_class = RentalChargeSerializer
    permission_classes = [RentalAccess('rentas_cobranza')]

    def get_queryset(self):
        qs = super().get_queryset()
        period = self.request.query_params.get('period')
        st = self.request.query_params.get('status')
        contract_id = self.request.query_params.get('contract')
        q = (self.request.query_params.get('search') or '').strip()
        ptype = (self.request.query_params.get('property_type') or '').strip()
        group = (self.request.query_params.get('group') or '').strip()
        scheme = (self.request.query_params.get('rent_scheme') or '').strip()
        overdue = (self.request.query_params.get('overdue') or '') in ('1', 'true', 'True')
        is_rent = (self.request.query_params.get('is_rent') or '').strip()
        if period:
            qs = qs.filter(period=period)
        if st:
            qs = qs.filter(status=st)
        if contract_id:
            qs = qs.filter(contract_id=contract_id)
        if q:
            qs = qs.filter(
                Q(description__icontains=q) | Q(contract__code__icontains=q) |
                Q(contract__property__code__icontains=q) | Q(contract__property__name__icontains=q) |
                Q(contract__tenant_party__first_name__icontains=q) |
                Q(contract__tenant_party__last_name__icontains=q) |
                Q(contract__property__city__icontains=q)
            )
        if ptype:
            qs = qs.filter(contract__property__property_type=ptype)
        group_types = RentalProperty.TYPE_GROUPS.get(group)
        if group_types:
            qs = qs.filter(contract__property__property_type__in=group_types)
        if scheme:
            qs = qs.filter(contract__rent_scheme=scheme)
        if overdue:
            qs = qs.exclude(status__in=('pagado', 'cancelado')).filter(due_date__lt=date.today())
        if is_rent in ('1', 'true', 'True'):
            qs = qs.filter(Q(concept__is_rent=True) | Q(description__istartswith='Renta'))
        return qs

    def perform_create(self, serializer):
        tenant = self.get_tenant()
        charge = serializer.save(tenant=tenant)
        charge = RentalCharge.objects.select_related(
            'contract', 'contract__property', 'contract__tenant_party',
        ).get(pk=charge.pk)
        on_charges_generated(tenant, charge.period, 1, {charge.contract: [charge]})

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
        variable_n = estimated_n = contracts_n = 0
        charges_by_contract = {}
        contracts = RentalContract.objects.filter(
            tenant=tenant,
            kind='renta',
            status__in=('activo', 'por_vencer', 'vencido'),
            property__isnull=False,
        ).select_related('property', 'tenant_party')
        rent_concept = RentalChargeConcept.objects.filter(tenant=tenant, is_rent=True).first()
        extras = list(RentalChargeConcept.objects.filter(
            tenant=tenant, enabled=True, is_recurring=True, is_rent=False,
        ))

        for contract in contracts:
            period_start = date(year, month, 1)
            period_end = date(year, month, last_day)
            if contract.end_date < period_start or contract.start_date > period_end:
                continue
            contracts_n += 1
            pay_day = min(max(int(contract.payment_day or 1), 1), last_day)
            due = date(year, month, pay_day)
            new_rows = []

            rent_exists = RentalCharge.objects.filter(
                contract=contract, period=period,
            ).filter(Q(concept=rent_concept) if rent_concept else Q(description__istartswith='Renta'))
            if not rent_exists.exists():
                amount = compute_effective_rent(contract, period_start, contract.property)
                ch = RentalCharge.objects.create(
                    tenant=tenant, contract=contract, concept=rent_concept,
                    period=period,
                    description=rent_charge_label(contract, period),
                    amount=amount,
                    due_date=due,
                )
                created += 1
                new_rows.append(ch)
                if contract.rent_scheme == 'variable':
                    variable_n += 1
                    if contract.rent_is_estimate:
                        estimated_n += 1

            for concept in extras:
                if concept.default_amount <= 0:
                    continue
                if RentalCharge.objects.filter(contract=contract, period=period, concept=concept).exists():
                    continue
                ch = RentalCharge.objects.create(
                    tenant=tenant, contract=contract, concept=concept,
                    period=period,
                    description=f'{concept.name} {period}',
                    amount=concept.default_amount,
                    due_date=due,
                )
                created += 1
                new_rows.append(ch)

            if new_rows:
                charges_by_contract[contract] = new_rows

        on_charges_generated(tenant, period, created, charges_by_contract)
        return Response({
            'created': created,
            'period': period,
            'variable': variable_n,
            'estimated': estimated_n,
            'contracts': contracts_n,
        })

    @action(detail=False, methods=['post'], url_path='recalculate-period')
    def recalculate_period(self, request, tenant_id=None):
        """Recalcula cargos de renta no cubiertos (variable o con incremento)."""
        tenant = self.get_tenant()
        period = (request.data.get('period') or date.today().strftime('%Y-%m'))[:7]
        try:
            year, month = [int(x) for x in period.split('-')]
            period_start = date(year, month, 1)
        except Exception:
            return Response({'detail': 'Período inválido (YYYY-MM).'}, status=400)

        charges = (
            RentalCharge.objects.filter(
                tenant=tenant, period=period, status__in=('pendiente', 'parcial'),
            )
            .filter(Q(concept__is_rent=True) | Q(description__istartswith='Renta'))
            .select_related('contract', 'contract__property', 'concept')
        )
        updated = 0
        for ch in charges:
            contract = ch.contract
            if not contract or contract.kind != 'renta':
                continue
            new_amt = compute_effective_rent(contract, period_start, contract.property)
            new_desc = rent_charge_label(contract, period)
            if ch.amount == new_amt and ch.description == new_desc:
                continue
            ch.amount = new_amt
            ch.description = new_desc
            ch.save(update_fields=['amount', 'description', 'updated_at'])
            ch.sync_status()
            updated += 1
        return Response({'updated': updated, 'period': period})

    @action(detail=True, methods=['post'], url_path='late-fee')
    def late_fee(self, request, pk=None, tenant_id=None):
        charge = self.get_object()
        contract = charge.contract
        pct = contract.late_fee_pct or Decimal('0')
        if pct <= 0:
            return Response({'detail': 'Este contrato no tiene mora pactada.'}, status=400)
        if charge.status in ('pagado', 'cancelado'):
            return Response({'detail': 'El cargo ya está cubierto o cancelado.'}, status=400)
        remaining = max(Decimal('0'), (charge.amount or 0) - (charge.paid_amount or 0))
        if remaining <= 0:
            return Response({'detail': 'No hay saldo para calcular mora.'}, status=400)
        amount = (remaining * pct / Decimal('100')).quantize(Decimal('0.01'))
        desc = f'Mora {charge.period} · {contract.code}'
        if RentalCharge.objects.filter(contract=contract, period=charge.period, description=desc).exists():
            return Response({'detail': 'Ya existe un cargo de mora de este período.'}, status=400)
        obj = RentalCharge.objects.create(
            tenant=self.get_tenant(),
            contract=contract,
            period=charge.period,
            description=desc,
            amount=amount,
            due_date=date.today(),
        )
        obj = RentalCharge.objects.select_related(
            'contract', 'contract__property', 'contract__tenant_party', 'concept',
        ).get(pk=obj.pk)
        return Response(RentalChargeSerializer(obj).data, status=201)

    @action(detail=True, methods=['post'], url_path='cancel')
    def cancel(self, request, pk=None, tenant_id=None):
        charge = self.get_object()
        if charge.paid_amount > 0:
            return Response({'detail': 'No se puede cancelar un cargo con pagos. Anula los pagos primero.'}, status=400)
        charge.status = 'cancelado'
        charge.save(update_fields=['status', 'updated_at'])
        return Response(RentalChargeSerializer(charge).data)


class RentalPaymentViewSet(_RentalTenantMixin, viewsets.ModelViewSet):
    queryset = RentalPayment.objects.select_related(
        'contract', 'contract__property', 'contract__tenant_party', 'charge',
    )
    serializer_class = RentalPaymentSerializer
    permission_classes = [RentalAccess('rentas_cobranza')]

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
        payment = RentalPayment.objects.select_related(
            'contract', 'contract__property', 'contract__tenant_party', 'charge',
        ).get(pk=payment.pk)
        on_payment_registered(payment)

    def perform_destroy(self, instance):
        payment = RentalPayment.objects.select_related(
            'contract', 'contract__property', 'contract__tenant_party', 'charge',
        ).get(pk=instance.pk)
        charge = payment.charge
        on_payment_deleted(payment)
        payment.delete()
        if charge:
            charge.sync_status()


class RentalDashboardView(APIView):
    permission_classes = [RentalAccess('rentas_dashboard')]

    def get(self, request, tenant_id):
        tenant = Tenant.objects.get(id=tenant_id)
        _require_rentas(tenant)
        _ensure_default_concepts(tenant)
        today = date.today()
        period = request.query_params.get('period') or today.strftime('%Y-%m')

        props = RentalProperty.objects.filter(tenant=tenant, is_active=True)
        contracts = list(RentalContract.objects.filter(tenant=tenant).select_related('property', 'tenant_party', 'provider'))
        for c in contracts:
            refresh_contract_and_notify(c)

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
                'kind': c.kind,
                'property_code': c.property.code if c.property_id else '',
                'property_name': c.property.name if c.property_id else '',
                'tenant_name': c.counterpart_label,
                'start_date': str(c.start_date),
                'end_date': str(c.end_date),
                'status': c.status,
                'rent_amount': float(c.rent_amount),
                'days_left': (c.end_date - today).days,
            })
        calendar.sort(key=lambda x: x['end_date'])

        from .rental_dashboard import build_dashboard_insights
        insights = build_dashboard_insights(tenant, period, contracts)

        return Response({
            **insights,
            'period': period,
            'currency': tenant.currency,
            'properties': {
                'total': props.count(),
                'disponible': props.filter(status='disponible').count(),
                'ocupada': props.filter(status='ocupada').count(),
                'mantenimiento': props.filter(status='mantenimiento').count(),
                'operativa': props.filter(status='operativa').count(),
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
    permission_classes = [RentalAccess('rentas_calendario', 'rentas_contratos', 'rentas_dashboard')]

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
        ).select_related('property', 'tenant_party', 'provider')
        for c in qs:
            refresh_contract_and_notify(c)
            if c.end_date < since and c.start_date < since:
                continue
            rows.append({
                'id': str(c.id),
                'code': c.code,
                'kind': c.kind,
                'property_code': c.property.code if c.property_id else '',
                'property_name': c.property.name if c.property_id else '',
                'tenant_name': c.counterpart_label,
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


class RentalSpaceViewSet(_RentalTenantMixin, viewsets.ModelViewSet):
    """Subniveles (espacios) de una propiedad Multi Tenant."""
    queryset = RentalSpace.objects.all()
    serializer_class = RentalSpaceSerializer
    permission_classes = [RentalAccess('rentas_propiedades')]
    pagination_class = None

    def get_queryset(self):
        qs = super().get_queryset().select_related('property', 'parent').annotate(
            open_works=Count('maintenance_works', filter=Q(maintenance_works__status__in=('planeado', 'en_curso')), distinct=True),
            open_requests=Count('service_requests', filter=Q(service_requests__status__in=('nueva', 'en_proceso')), distinct=True),
            assets_count=Count('assets', filter=Q(assets__is_active=True), distinct=True),
        )
        p = self.request.query_params
        if p.get('property'):
            qs = qs.filter(property_id=p['property'])
        if p.get('status'):
            qs = qs.filter(status=p['status'])
        if p.get('space_type'):
            qs = qs.filter(space_type=p['space_type'])
        if p.get('parent'):
            qs = qs.filter(parent_id=p['parent'])
        if p.get('active') in ('1', 'true'):
            qs = qs.filter(is_active=True)
        q = (p.get('search') or '').strip()
        if q:
            qs = qs.filter(
                Q(code__icontains=q) | Q(name__icontains=q) | Q(unit_number__icontains=q) |
                Q(building__icontains=q) | Q(external_ref__icontains=q) |
                Q(contracts__tenant_party__first_name__icontains=q) | Q(contracts__tenant_party__last_name__icontains=q)
            ).distinct()
        return qs

    def perform_create(self, serializer):
        from .rental_spaces import sync_space
        space = serializer.save(tenant=self.get_tenant())
        sync_space(space)
        _sync_property_occupancy(space.property)

    def perform_update(self, serializer):
        from .rental_spaces import sync_space
        space = serializer.save()
        sync_space(space)
        _sync_property_occupancy(space.property)

    def destroy(self, request, *args, **kwargs):
        space = self.get_object()
        if space.contracts.exists():
            return Response({'detail': 'El espacio tiene contratos. Márcalo como inactivo en lugar de eliminarlo.'}, status=400)
        prop = space.property
        space.delete()
        _sync_property_occupancy(prop)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=['post'], url_path='bulk')
    def bulk(self, request, tenant_id=None):
        """Crea varios espacios consecutivos (p. ej. 12 bays de una nave o 40 habitaciones)."""
        tenant = self.get_tenant()
        d = request.data
        try:
            prop = RentalProperty.objects.get(id=d.get('property'), tenant=tenant)
        except Exception:
            return Response({'detail': 'Elige una propiedad válida.'}, status=400)
        if prop.tenancy_model != 'multi':
            return Response({'detail': f'{prop.code} es Single Tenant. Cámbiala a Multi Tenant primero.'}, status=400)
        try:
            count = int(d.get('count') or 0)
            start = int(d.get('start') or 1)
            pad = max(0, min(int(d.get('pad') if d.get('pad') not in (None, '') else 2), 6))
        except (TypeError, ValueError):
            return Response({'detail': 'Cantidad, inicio y relleno deben ser números.'}, status=400)
        if not 1 <= count <= 200:
            return Response({'detail': 'Puedes crear de 1 a 200 espacios a la vez.'}, status=400)
        prefix = str(d.get('prefix') or '').strip()[:20]
        space_type = d.get('space_type') or 'local'
        if space_type not in dict(RentalSpace.TYPE_CHOICES):
            return Response({'detail': 'Tipo de espacio no válido.'}, status=400)
        try:
            area = Decimal(str(d.get('area_m2') or 0))
            rent = Decimal(str(d.get('suggested_rent') or 0))
        except Exception:
            return Response({'detail': 'Superficie o renta no válidas.'}, status=400)
        if area < 0 or rent < 0:
            return Response({'detail': 'Superficie y renta no pueden ser negativas.'}, status=400)
        name_prefix = str(d.get('name_prefix') or '').strip()[:200]
        existing = set(prop.spaces.values_list('code', flat=True))
        created, skipped = [], []
        for n in range(start, start + count):
            code = f'{prefix}{str(n).zfill(pad)}'[:40]
            if code in existing:
                skipped.append(code)
                continue
            created.append(RentalSpace(
                tenant=tenant, property=prop, code=code, name=f'{name_prefix} {code}'.strip() if name_prefix else '',
                space_type=space_type, building=str(d.get('building') or '')[:80], floor=str(d.get('floor') or '')[:40],
                zone=str(d.get('zone') or '')[:80], area_m2=area, suggested_rent=rent,
                is_temporary=space_type == 'temporal',
            ))
        RentalSpace.objects.bulk_create(created)
        _sync_property_occupancy(prop)
        return Response({'created': len(created), 'skipped': skipped}, status=201)
