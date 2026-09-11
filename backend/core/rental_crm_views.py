"""CRM de Homly Rentas: leads → cliente (inquilino) + contrato."""
from datetime import date
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.db.models import Count, Q
from django.utils import timezone
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework import viewsets

from .models import RentalLead, RentalLeadActivity, RentalParty, RentalContract, RentalProperty
from .permissions import IsAdminTesOrContador
from .rental_serializers import (
    RentalLeadSerializer, RentalLeadActivitySerializer, RentalContractSerializer,
)
from .rental_views import _RentalTenantMixin, _sync_property_occupancy


OPEN_STAGES = ('nuevo', 'contactado', 'visita', 'propuesta', 'negociacion')
MOVE_STAGES = OPEN_STAGES + ('perdido',)


def crm_dashboard(tenant):
    leads = RentalLead.objects.filter(tenant=tenant)
    month_start = date.today().replace(day=1)
    return {
        'open': leads.filter(stage__in=OPEN_STAGES).count(),
        'visits': leads.filter(stage='visita').count(),
        'won': leads.filter(stage='ganado').count(),
        'won_month': leads.filter(stage='ganado', converted_at__gte=month_start).count(),
        'lost': leads.filter(stage='perdido').count(),
        'total': leads.count(),
    }


def next_contract_code(tenant):
    n = RentalContract.objects.filter(tenant=tenant).count() + 1
    for _ in range(200):
        code = f'CT-{n:04d}'
        if not RentalContract.objects.filter(tenant=tenant, code=code).exists():
            return code
        n += 1
    return f'CT-{timezone.now().strftime("%y%m%d%H%M")}'


def _as_decimal(value, default='0'):
    try:
        return Decimal(str(value if value not in (None, '') else default))
    except (InvalidOperation, TypeError, ValueError):
        return Decimal(default)


class RentalLeadViewSet(_RentalTenantMixin, viewsets.ModelViewSet):
    queryset = RentalLead.objects.select_related(
        'rental_property', 'party', 'contract', 'assigned_to', 'created_by',
    )
    serializer_class = RentalLeadSerializer
    permission_classes = [IsAdminTesOrContador]

    def get_queryset(self):
        qs = super().get_queryset().annotate(activities_count=Count('activities'))
        stage = (self.request.query_params.get('stage') or '').strip()
        prop = (self.request.query_params.get('property') or '').strip()
        q = (self.request.query_params.get('search') or '').strip()
        if stage:
            qs = qs.filter(stage=stage)
        if prop:
            qs = qs.filter(rental_property_id=prop)
        if q:
            qs = qs.filter(
                Q(first_name__icontains=q) | Q(last_name__icontains=q) |
                Q(email__icontains=q) | Q(phone__icontains=q) |
                Q(rental_property__code__icontains=q) | Q(rental_property__name__icontains=q)
            )
        return qs

    def perform_create(self, serializer):
        user = self.request.user if getattr(self.request.user, 'is_authenticated', False) else None
        serializer.save(tenant=self.get_tenant(), created_by=user)

    def update(self, request, *args, **kwargs):
        lead = self.get_object()
        if lead.contract_id and request.data.get('stage') and request.data.get('stage') != lead.stage:
            return Response(
                {'detail': 'Este lead ya tiene contrato. El pipeline queda cerrado.'},
                status=400,
            )
        if request.data.get('stage') == 'ganado' and not lead.contract_id:
            return Response(
                {'detail': 'Para marcarlo ganado convierte el lead a cliente y crea el contrato.'},
                status=400,
            )
        return super().update(request, *args, **kwargs)

    @action(detail=False, methods=['get'], url_path='pipeline')
    def pipeline(self, request, tenant_id=None):
        tenant = self.get_tenant()
        return Response({
            'summary': crm_dashboard(tenant),
            'stages': [
                {'key': k, 'label': lab}
                for k, lab in RentalLead.STAGE_CHOICES
            ],
        })

    @action(detail=True, methods=['post'], url_path='move')
    def move(self, request, tenant_id=None, pk=None):
        lead = self.get_object()
        stage = (request.data.get('stage') or '').strip()
        if lead.contract_id:
            return Response({'detail': 'El lead ya se convirtió en cliente.'}, status=400)
        if stage == 'ganado':
            return Response(
                {'detail': 'Usa convertir para crear el cliente y el contrato.'},
                status=400,
            )
        if stage not in MOVE_STAGES:
            return Response({'detail': 'Etapa no válida.'}, status=400)
        lead.stage = stage
        if stage == 'perdido':
            lead.lost_reason = (request.data.get('lost_reason') or lead.lost_reason or '')[:300]
        elif stage != 'perdido':
            lead.lost_reason = ''
        lead.save(update_fields=['stage', 'lost_reason', 'updated_at'])
        return Response(RentalLeadSerializer(lead).data)

    @action(detail=True, methods=['get', 'post'], url_path='activities')
    def activities(self, request, tenant_id=None, pk=None):
        lead = self.get_object()
        if request.method == 'GET':
            rows = lead.activities.select_related('created_by')[:80]
            return Response(RentalLeadActivitySerializer(rows, many=True).data)
        body = (request.data.get('body') or '').strip()
        if not body:
            return Response({'detail': 'Escribe una nota o el detalle del seguimiento.'}, status=400)
        kind = (request.data.get('kind') or 'note').strip()
        if kind not in dict(RentalLeadActivity.KIND_CHOICES):
            kind = 'note'
        user = request.user if getattr(request.user, 'is_authenticated', False) else None
        act = RentalLeadActivity.objects.create(
            tenant=lead.tenant, lead=lead, kind=kind, body=body[:4000], created_by=user,
        )
        return Response(RentalLeadActivitySerializer(act).data, status=201)

    @action(detail=True, methods=['post'], url_path='convert')
    def convert(self, request, tenant_id=None, pk=None):
        lead = self.get_object()
        if lead.contract_id:
            return Response({
                'detail': 'Este lead ya se convirtió.',
                'lead': RentalLeadSerializer(lead).data,
                'contract': RentalContractSerializer(lead.contract).data,
            }, status=400)

        tenant = lead.tenant
        prop_id = request.data.get('property') or (str(lead.rental_property_id) if lead.rental_property_id else '')
        if not prop_id:
            return Response({'detail': 'Elige la unidad que se va a rentar.'}, status=400)
        try:
            prop = RentalProperty.objects.get(id=prop_id, tenant=tenant)
        except RentalProperty.DoesNotExist:
            return Response({'detail': 'La unidad no existe en este inventario.'}, status=400)
        if prop.status == 'inactiva':
            return Response({'detail': 'La unidad está inactiva.'}, status=400)

        busy = prop.contracts.exclude(status__in=('cancelado', 'finalizado', 'borrador')).exists()
        if busy:
            return Response({'detail': 'La unidad ya tiene un contrato vigente.'}, status=400)

        start = request.data.get('start_date') or (
            str(lead.expected_start) if lead.expected_start else str(date.today())
        )
        end = request.data.get('end_date')
        try:
            start_d = date.fromisoformat(str(start)[:10])
            if end:
                end_d = date.fromisoformat(str(end)[:10])
            else:
                try:
                    end_d = date(start_d.year + 1, start_d.month, start_d.day)
                except ValueError:
                    end_d = date(start_d.year + 1, 2, 28)
        except ValueError:
            return Response({'detail': 'Fechas de contrato inválidas.'}, status=400)
        if end_d <= start_d:
            return Response({'detail': 'La fecha de fin debe ser posterior al inicio.'}, status=400)

        rent = _as_decimal(
            request.data.get('rent_amount'),
            str(lead.interested_rent or prop.suggested_rent or 0),
        )
        deposit = _as_decimal(request.data.get('deposit_amount'), str(rent))
        payment_day = int(request.data.get('payment_day') or 1)
        payment_day = min(28, max(1, payment_day))
        activate = str(request.data.get('activate') or '').lower() in ('1', 'true', 'yes', 'si', 'sí')
        code = (request.data.get('code') or '').strip() or next_contract_code(tenant)
        if RentalContract.objects.filter(tenant=tenant, code=code).exists():
            return Response({'detail': f'Ya existe el contrato {code}.'}, status=400)

        notes = (request.data.get('notes') or '').strip()
        if not notes:
            notes = f'Origen CRM: {lead.full_name}.'

        with transaction.atomic():
            party = lead.party
            if not party and lead.email:
                party = RentalParty.objects.filter(
                    tenant=tenant, kind='inquilino', email__iexact=lead.email,
                ).first()
            if not party:
                party = RentalParty.objects.create(
                    tenant=tenant,
                    kind='inquilino',
                    first_name=lead.first_name,
                    last_name=lead.last_name,
                    email=lead.email,
                    phone=lead.phone,
                    notes=f'Cliente convertido desde lead CRM.',
                )
            else:
                updates = []
                if lead.phone and not party.phone:
                    party.phone = lead.phone
                    updates.append('phone')
                if lead.email and not party.email:
                    party.email = lead.email
                    updates.append('email')
                if updates:
                    party.save(update_fields=updates + ['updated_at'])

            contract = RentalContract.objects.create(
                tenant=tenant,
                property=prop,
                tenant_party=party,
                code=code,
                start_date=start_d,
                end_date=end_d,
                rent_amount=rent,
                deposit_amount=deposit,
                payment_day=payment_day,
                status='borrador',
                notes=notes,
            )
            if activate:
                contract.status = 'activo'
                contract.save(update_fields=['status', 'updated_at'])
                contract.refresh_lifecycle_status()
            _sync_property_occupancy(prop)
            if not activate and prop.status == 'disponible':
                prop.status = 'reservada'
                prop.save(update_fields=['status', 'updated_at'])

            lead.rental_property = prop
            lead.party = party
            lead.contract = contract
            lead.stage = 'ganado'
            lead.lost_reason = ''
            lead.converted_at = timezone.now()
            lead.save(update_fields=[
                'rental_property', 'party', 'contract', 'stage', 'lost_reason',
                'converted_at', 'updated_at',
            ])
            user = request.user if getattr(request.user, 'is_authenticated', False) else None
            RentalLeadActivity.objects.create(
                tenant=tenant, lead=lead, kind='system', created_by=user,
                body=f'Ganado: cliente {party.full_name}. Contrato {contract.code}'
                     f'{" activado" if activate else " en borrador"}.',
            )

        return Response({
            'lead': RentalLeadSerializer(lead).data,
            'party_id': str(party.id),
            'contract': RentalContractSerializer(contract).data,
        })
