"""Serializers del espacio de trabajo de rentas."""
from datetime import date

from rest_framework import serializers
from rest_framework.exceptions import ValidationError
from .models import (
    RentalProperty, RentalSpace, RentalParty, RentalChargeConcept,
    RentalContract, RentalCharge, RentalPayment, RentalContractSignature,
    AirbnbConnection, AirbnbListing, RentalLead, RentalLeadActivity,
)


class RentalPropertySerializer(serializers.ModelSerializer):
    address_line = serializers.ReadOnlyField()
    type_label = serializers.CharField(source='get_property_type_display', read_only=True)
    type_group = serializers.ReadOnlyField()
    specs_summary = serializers.ReadOnlyField()
    active_contract_code = serializers.SerializerMethodField()
    usage_label = serializers.CharField(source='get_usage_display', read_only=True)
    is_leasable = serializers.SerializerMethodField()
    tenancy_label = serializers.CharField(source='get_tenancy_model_display', read_only=True)
    spaces_summary = serializers.SerializerMethodField()

    class Meta:
        model = RentalProperty
        fields = [
            'id', 'tenant', 'code', 'name', 'property_type', 'type_label', 'type_group',
            'status', 'usage', 'usage_label', 'is_leasable',
            'tenancy_model', 'tenancy_label', 'park_name', 'building_number', 'submarket', 'gla_sqm',
            'spaces_summary',
            'country', 'country_code', 'street', 'ext_number', 'int_number', 'neighborhood', 'municipality',
            'city', 'state', 'postal_code', 'address_line', 'latitude', 'longitude',
            'bedrooms', 'bathrooms', 'area_m2', 'suggested_rent', 'specs', 'specs_summary',
            'owner_name', 'owner_email', 'owner_phone', 'notes',
            'is_active', 'source', 'airbnb_listing_id',
            'active_contract_code', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'tenant', 'created_at', 'updated_at']

    def validate_code(self, value):
        value = (value or '').strip()
        if not value:
            raise serializers.ValidationError('Captura el código de la propiedad.')
        request = self.context.get('request')
        tenant_id = request.parser_context['kwargs'].get('tenant_id') if request else None
        if tenant_id:
            qs = RentalProperty.objects.filter(tenant_id=tenant_id, code__iexact=value)
            if self.instance is not None:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError(f'Ya existe una propiedad con el código {value}. Usa otro código.')
        return value

    def validate_latitude(self, value):
        if value is not None and not -90 <= value <= 90:
            raise serializers.ValidationError('La latitud debe estar entre -90 y 90.')
        return value

    def validate_longitude(self, value):
        if value is not None and not -180 <= value <= 180:
            raise serializers.ValidationError('La longitud debe estar entre -180 y 180.')
        return value

    def validate(self, attrs):
        attrs = super().validate(attrs)
        inst = self.instance
        lat = attrs['latitude'] if 'latitude' in attrs else getattr(inst, 'latitude', None)
        lng = attrs['longitude'] if 'longitude' in attrs else getattr(inst, 'longitude', None)
        if (lat is None) != (lng is None):
            raise serializers.ValidationError({'latitude': 'Captura latitud y longitud juntas, o deja ambas vacías.'})
        return attrs

    def get_is_leasable(self, obj):
        from .rental_mode import property_is_leasable
        return property_is_leasable(obj)

    def get_spaces_summary(self, obj):
        if obj.tenancy_model != 'multi':
            return None
        from .rental_spaces import gla_stats
        return gla_stats(obj)

    def get_active_contract_code(self, obj):
        c = obj.contracts.exclude(
            status__in=('cancelado', 'finalizado', 'borrador'),
        ).filter(kind='renta').order_by('-start_date').first()
        return c.code if c else None

    def validate_specs(self, value):
        if value in (None, ''):
            return {}
        if not isinstance(value, dict):
            raise serializers.ValidationError('Las especificaciones deben ser un objeto.')
        return value


class RentalSpaceSerializer(serializers.ModelSerializer):
    property_code = serializers.CharField(source='property.code', read_only=True)
    property_name = serializers.CharField(source='property.name', read_only=True)
    parent_label = serializers.SerializerMethodField()
    type_label = serializers.CharField(source='get_space_type_display', read_only=True)
    status_label = serializers.CharField(source='get_status_display', read_only=True)
    rent_per_m2 = serializers.SerializerMethodField()
    contract = serializers.SerializerMethodField()
    has_children = serializers.SerializerMethodField()
    open_works = serializers.IntegerField(read_only=True, default=0)
    open_requests = serializers.IntegerField(read_only=True, default=0)
    assets_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = RentalSpace
        fields = [
            'id', 'tenant', 'property', 'property_code', 'property_name', 'parent', 'parent_label', 'has_children',
            'code', 'name', 'space_type', 'type_label', 'status', 'status_label',
            'unit_number', 'external_ref', 'building', 'floor', 'zone',
            'area_m2', 'is_leasable', 'is_temporary', 'available_from', 'available_to',
            'suggested_rent', 'rent_per_m2', 'specs', 'contacts', 'notes', 'is_active',
            'contract', 'open_works', 'open_requests', 'assets_count', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'tenant', 'created_at', 'updated_at']

    def get_parent_label(self, obj):
        return obj.parent.label if obj.parent_id else ''

    def get_has_children(self, obj):
        return obj.children.exists()

    def get_rent_per_m2(self, obj):
        c = self._live(obj)
        base = float(c.rent_amount) if c and c.status != 'borrador' else float(obj.suggested_rent or 0)
        area = float(obj.area_m2 or 0)
        return round(base / area, 2) if area else 0

    def _live(self, obj):
        cached = getattr(obj, '_live_cache', None)
        if cached is not None:
            return cached or None
        from .rental_spaces import live_contracts
        cs = live_contracts(obj)
        pick = next((c for c in cs if c.status != 'borrador'), cs[0] if cs else None)
        obj._live_cache = pick or False
        return pick

    def get_contract(self, obj):
        c = self._live(obj)
        if not c:
            return None
        p = c.tenant_party
        return {
            'id': str(c.id), 'code': c.code, 'status': c.status,
            'tenant_name': p.full_name if p else c.counterpart_label,
            'tenant_email': p.email if p else '', 'tenant_phone': p.phone if p else '',
            'start_date': str(c.start_date), 'end_date': str(c.end_date),
            'rent_amount': float(c.rent_amount),
        }

    def validate_specs(self, value):
        if value in (None, ''):
            return {}
        if not isinstance(value, dict):
            raise serializers.ValidationError('Las especificaciones deben ser un objeto.')
        return value

    def validate_contacts(self, value):
        from .rental_spaces import clean_contacts
        return clean_contacts(value)

    def validate(self, attrs):
        inst = self.instance
        prop = attrs.get('property') or (inst.property if inst else None)
        request = self.context.get('request')
        tenant_id = request.parser_context['kwargs'].get('tenant_id') if request else None
        if prop and tenant_id and str(prop.tenant_id) != str(tenant_id):
            raise ValidationError({'property': 'La propiedad no pertenece a este espacio de trabajo.'})
        if prop and prop.tenancy_model != 'multi':
            raise ValidationError({'property': f'{prop.code} es Single Tenant. Cámbiala a Multi Tenant para agregarle espacios.'})
        parent = attrs.get('parent') if 'parent' in attrs else (inst.parent if inst else None)
        if parent:
            if prop and parent.property_id != prop.id:
                raise ValidationError({'parent': 'El subnivel superior debe ser de la misma propiedad.'})
            if inst:
                node, depth = parent, 0
                while node and depth < 10:
                    if node.id == inst.id:
                        raise ValidationError({'parent': 'Un espacio no puede estar dentro de sí mismo.'})
                    node, depth = node.parent, depth + 1
        a_from = attrs.get('available_from') if 'available_from' in attrs else (inst.available_from if inst else None)
        a_to = attrs.get('available_to') if 'available_to' in attrs else (inst.available_to if inst else None)
        if a_from and a_to and a_to < a_from:
            raise ValidationError({'available_to': 'La fecha final no puede ser anterior a la inicial.'})
        return attrs


class RentalPartySerializer(serializers.ModelSerializer):
    full_name = serializers.ReadOnlyField()

    class Meta:
        model = RentalParty
        fields = [
            'id', 'tenant', 'kind', 'first_name', 'last_name', 'full_name',
            'email', 'phone', 'rfc', 'notes', 'is_active',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'tenant', 'created_at', 'updated_at']


class RentalChargeConceptSerializer(serializers.ModelSerializer):
    class Meta:
        model = RentalChargeConcept
        fields = [
            'id', 'tenant', 'name', 'default_amount', 'is_recurring',
            'is_rent', 'enabled', 'sort_order', 'created_at',
        ]
        read_only_fields = ['id', 'tenant', 'created_at']


class RentalChargeSerializer(serializers.ModelSerializer):
    paid_amount = serializers.SerializerMethodField()
    remaining = serializers.SerializerMethodField()
    concept_name = serializers.CharField(source='concept.name', read_only=True, default='')
    is_rent = serializers.SerializerMethodField()
    contract_code = serializers.CharField(source='contract.code', read_only=True)
    contract_status = serializers.CharField(source='contract.status', read_only=True)
    contract_kind = serializers.CharField(source='contract.kind', read_only=True)
    rent_scheme = serializers.CharField(source='contract.rent_scheme', read_only=True)
    rent_scheme_label = serializers.CharField(source='contract.get_rent_scheme_display', read_only=True)
    rent_conditions_summary = serializers.SerializerMethodField()
    rent_is_estimate = serializers.SerializerMethodField()
    rent_basis = serializers.SerializerMethodField()
    rent_basis_label = serializers.SerializerMethodField()
    effective_rent = serializers.SerializerMethodField()
    increment_pct = serializers.SerializerMethodField()
    late_fee_pct = serializers.SerializerMethodField()
    payment_day = serializers.IntegerField(source='contract.payment_day', read_only=True, default=None)
    property_code = serializers.SerializerMethodField()
    property_name = serializers.SerializerMethodField()
    property_type = serializers.SerializerMethodField()
    type_label = serializers.SerializerMethodField()
    type_group = serializers.SerializerMethodField()
    type_group_label = serializers.SerializerMethodField()
    specs_summary = serializers.SerializerMethodField()
    city = serializers.SerializerMethodField()
    owner_name = serializers.SerializerMethodField()
    tenant_name = serializers.SerializerMethodField()
    tenant_phone = serializers.SerializerMethodField()
    tenant_email = serializers.SerializerMethodField()
    is_overdue = serializers.SerializerMethodField()
    suggested_late_fee = serializers.SerializerMethodField()

    class Meta:
        model = RentalCharge
        fields = [
            'id', 'tenant', 'contract', 'concept', 'concept_name', 'is_rent',
            'period', 'description', 'amount', 'paid_amount', 'remaining',
            'due_date', 'status', 'is_overdue', 'suggested_late_fee',
            'contract_code', 'contract_status', 'contract_kind',
            'rent_scheme', 'rent_scheme_label', 'rent_basis', 'rent_basis_label',
            'rent_conditions_summary', 'rent_is_estimate', 'effective_rent',
            'increment_pct', 'late_fee_pct', 'payment_day',
            'property_code', 'property_name', 'property_type', 'type_label',
            'type_group', 'type_group_label', 'specs_summary', 'city', 'owner_name',
            'tenant_name', 'tenant_phone', 'tenant_email',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'tenant', 'status', 'created_at', 'updated_at']

    def _prop(self, obj):
        return getattr(obj.contract, 'property', None) if obj.contract_id else None

    def _party(self, obj):
        return getattr(obj.contract, 'tenant_party', None) if obj.contract_id else None

    def get_paid_amount(self, obj):
        return float(obj.paid_amount)

    def get_remaining(self, obj):
        from decimal import Decimal
        return float(max(Decimal('0'), (obj.amount or 0) - (obj.paid_amount or 0)))

    def get_is_rent(self, obj):
        if obj.concept_id and obj.concept.is_rent:
            return True
        return (obj.description or '').lower().startswith('renta')

    def get_property_code(self, obj):
        prop = self._prop(obj)
        return prop.code if prop else ''

    def get_property_name(self, obj):
        prop = self._prop(obj)
        return prop.name if prop else ''

    def get_property_type(self, obj):
        prop = self._prop(obj)
        return prop.property_type if prop else ''

    def get_type_label(self, obj):
        prop = self._prop(obj)
        return prop.get_property_type_display() if prop else ''

    def get_type_group(self, obj):
        prop = self._prop(obj)
        return prop.type_group if prop else ''

    def get_type_group_label(self, obj):
        from .rental_rent import GROUP_LABELS
        group = self.get_type_group(obj)
        return GROUP_LABELS.get(group, group)

    def get_specs_summary(self, obj):
        prop = self._prop(obj)
        return prop.specs_summary if prop else ''

    def get_city(self, obj):
        prop = self._prop(obj)
        return prop.city if prop else ''

    def get_owner_name(self, obj):
        prop = self._prop(obj)
        return prop.owner_name if prop else ''

    def get_tenant_name(self, obj):
        party = self._party(obj)
        if party:
            return party.full_name
        return obj.contract.counterpart_label if obj.contract_id else ''

    def get_tenant_phone(self, obj):
        party = self._party(obj)
        return party.phone if party else ''

    def get_tenant_email(self, obj):
        party = self._party(obj)
        return party.email if party else ''

    def get_rent_conditions_summary(self, obj):
        return obj.contract.rent_conditions_summary if obj.contract_id else ''

    def get_rent_is_estimate(self, obj):
        return bool(obj.contract_id and obj.contract.rent_is_estimate)

    def get_rent_basis(self, obj):
        if not obj.contract_id or obj.contract.rent_scheme != 'variable':
            return ''
        cond = obj.contract.rent_conditions if isinstance(obj.contract.rent_conditions, dict) else {}
        return cond.get('basis') or ''

    def get_rent_basis_label(self, obj):
        from .rental_rent import BASIS_LABELS
        return BASIS_LABELS.get(self.get_rent_basis(obj), '')

    def get_effective_rent(self, obj):
        if not obj.contract_id:
            return None
        try:
            y, m = [int(x) for x in (obj.period or '')[:7].split('-')]
            as_of = date(y, m, 1)
        except Exception:
            as_of = None
        return float(obj.contract.effective_rent(as_of, self._prop(obj)))

    def get_increment_pct(self, obj):
        return float(obj.contract.increment_pct or 0) if obj.contract_id else 0

    def get_late_fee_pct(self, obj):
        return float(obj.contract.late_fee_pct or 0) if obj.contract_id else 0

    def get_is_overdue(self, obj):
        if obj.status in ('pagado', 'cancelado') or not obj.due_date:
            return False
        return obj.due_date < date.today()

    def get_suggested_late_fee(self, obj):
        from decimal import Decimal
        if not self.get_is_overdue(obj) or not obj.contract_id:
            return 0
        pct = obj.contract.late_fee_pct or 0
        if pct <= 0:
            return 0
        remaining = max(Decimal('0'), (obj.amount or 0) - (obj.paid_amount or 0))
        return float((remaining * pct / Decimal('100')).quantize(Decimal('0.01')))


class RentalPaymentSerializer(serializers.ModelSerializer):
    contract_code = serializers.CharField(source='contract.code', read_only=True)
    charge_description = serializers.CharField(source='charge.description', read_only=True, default='')
    property_code = serializers.SerializerMethodField()
    property_name = serializers.SerializerMethodField()
    type_label = serializers.SerializerMethodField()
    tenant_name = serializers.SerializerMethodField()
    rent_scheme = serializers.CharField(source='contract.rent_scheme', read_only=True)
    payment_type_label = serializers.CharField(source='get_payment_type_display', read_only=True)

    class Meta:
        model = RentalPayment
        fields = [
            'id', 'tenant', 'contract', 'charge', 'amount', 'payment_date',
            'payment_type', 'payment_type_label', 'reference', 'notes',
            'contract_code', 'charge_description',
            'property_code', 'property_name', 'type_label', 'tenant_name',
            'rent_scheme',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'tenant', 'created_at', 'updated_at']

    def get_property_code(self, obj):
        prop = getattr(obj.contract, 'property', None) if obj.contract_id else None
        return prop.code if prop else ''

    def get_property_name(self, obj):
        prop = getattr(obj.contract, 'property', None) if obj.contract_id else None
        return prop.name if prop else ''

    def get_type_label(self, obj):
        prop = getattr(obj.contract, 'property', None) if obj.contract_id else None
        return prop.get_property_type_display() if prop else ''

    def get_tenant_name(self, obj):
        if not obj.contract_id:
            return ''
        party = getattr(obj.contract, 'tenant_party', None)
        return party.full_name if party else obj.contract.counterpart_label


class RentalContractSignatureSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = RentalContractSignature
        fields = [
            'id', 'signer_name', 'signer_role', 'signer_email',
            'party', 'provider', 'status', 'method', 'signed_name',
            'file_url', 'notes', 'signed_at', 'created_at',
        ]
        read_only_fields = ['id', 'signed_at', 'created_at']

    def get_file_url(self, obj):
        from .asambleas import media_api_url
        return media_api_url(obj.file, self.context.get('request')) if obj.file else ''


class RentalContractSerializer(serializers.ModelSerializer):
    property_code = serializers.SerializerMethodField()
    property_name = serializers.SerializerMethodField()
    tenant_name = serializers.SerializerMethodField()
    tenant_email = serializers.SerializerMethodField()
    tenant_phone = serializers.SerializerMethodField()
    guarantor_name = serializers.SerializerMethodField()
    provider_name = serializers.SerializerMethodField()
    category_name = serializers.SerializerMethodField()
    work_label = serializers.SerializerMethodField()
    counterpart_label = serializers.SerializerMethodField()
    kind_label = serializers.CharField(source='get_kind_display', read_only=True)
    legal_stage_label = serializers.CharField(source='get_legal_stage_display', read_only=True)
    rent_scheme_label = serializers.CharField(source='get_rent_scheme_display', read_only=True)
    rent_conditions_summary = serializers.ReadOnlyField()
    effective_rent = serializers.SerializerMethodField()
    rent_is_estimate = serializers.ReadOnlyField()
    signature_count = serializers.IntegerField(read_only=True, default=0)
    signed_count = serializers.IntegerField(read_only=True, default=0)
    signatures = serializers.SerializerMethodField()
    balance_due = serializers.SerializerMethodField()
    space_code = serializers.SerializerMethodField()
    space_name = serializers.SerializerMethodField()

    class Meta:
        model = RentalContract
        fields = [
            'id', 'tenant', 'kind', 'kind_label', 'title',
            'property', 'property_code', 'property_name',
            'space', 'space_code', 'space_name',
            'tenant_party', 'tenant_name', 'tenant_email', 'tenant_phone',
            'guarantor', 'guarantor_name',
            'provider', 'provider_name', 'category', 'category_name',
            'work', 'work_label', 'counterparty_name', 'counterpart_label',
            'service_description',
            'code', 'start_date', 'end_date', 'rent_amount', 'deposit_amount',
            'payment_day', 'increment_pct', 'late_fee_pct',
            'rent_scheme', 'rent_scheme_label', 'rent_conditions',
            'rent_conditions_summary', 'effective_rent', 'rent_is_estimate',
            'status', 'notes',
            'legal_stage', 'legal_stage_label', 'assistant_brief',
            'body', 'published_body', 'published_at',
            'signature_count', 'signed_count', 'signatures',
            'balance_due', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'tenant', 'published_body', 'published_at', 'created_at', 'updated_at']

    def get_property_code(self, obj):
        return obj.property.code if obj.property_id else ''

    def get_property_name(self, obj):
        return obj.property.name if obj.property_id else ''

    def get_space_code(self, obj):
        return obj.space.code if obj.space_id else ''

    def get_space_name(self, obj):
        return obj.space.label if obj.space_id else ''

    def get_tenant_name(self, obj):
        return obj.tenant_party.full_name if obj.tenant_party_id else ''

    def get_tenant_email(self, obj):
        return obj.tenant_party.email if obj.tenant_party_id else ''

    def get_tenant_phone(self, obj):
        return obj.tenant_party.phone if obj.tenant_party_id else ''

    def get_guarantor_name(self, obj):
        return obj.guarantor.full_name if obj.guarantor_id else ''

    def get_provider_name(self, obj):
        if not obj.provider_id:
            return ''
        return obj.provider.trade_name or obj.provider.name

    def get_category_name(self, obj):
        return obj.category.name if obj.category_id else ''

    def get_work_label(self, obj):
        if not obj.work_id:
            return ''
        return f'{obj.work.folio} · {obj.work.title}'.strip(' ·')

    def get_counterpart_label(self, obj):
        return obj.counterpart_label

    def get_signatures(self, obj):
        if not self.context.get('include_signatures'):
            return []
        return RentalContractSignatureSerializer(
            obj.signatures.all(), many=True, context=self.context,
        ).data

    def get_balance_due(self, obj):
        from decimal import Decimal
        from django.db.models import Sum
        charges = obj.charges.exclude(status='cancelado')
        total = charges.aggregate(s=Sum('amount'))['s'] or Decimal('0')
        paid = Decimal('0')
        for ch in charges.prefetch_related('payments'):
            paid += ch.paid_amount
        return float(max(Decimal('0'), total - paid))

    def get_effective_rent(self, obj):
        return float(obj.effective_rent())

    def validate_rent_conditions(self, value):
        from .rental_rent import normalize_conditions
        if value in (None, ''):
            return {}
        if not isinstance(value, dict):
            raise ValidationError('Las condiciones de renta deben ser un objeto.')
        return normalize_conditions(value)

    def validate(self, attrs):
        kind = attrs.get('kind') or getattr(self.instance, 'kind', 'renta')
        inst = self.instance

        def pick(key):
            if key in attrs:
                return attrs.get(key)
            return getattr(inst, key, None) if inst else None

        prop = pick('property')
        party = pick('tenant_party')
        provider = pick('provider')
        from .rental_mode import LEASE_KINDS, lease_block_reason
        if prop and kind in LEASE_KINDS and (inst is None or 'property' in attrs or 'kind' in attrs):
            reason = lease_block_reason(prop)
            if reason:
                raise ValidationError({'property': reason})
        space = pick('space')
        if space and prop and space.property_id != prop.id:
            raise ValidationError({'space': 'El espacio no pertenece a la propiedad elegida.'})
        if prop and kind in LEASE_KINDS and (inst is None or any(k in attrs for k in ('property', 'kind', 'space'))):
            if prop.tenancy_model == 'multi':
                if not space:
                    raise ValidationError({'space': f'{prop.code} es Multi Tenant: elige el espacio que se renta.'})
                if not space.is_active or not space.is_leasable:
                    raise ValidationError({'space': 'Este espacio no está disponible para renta.'})
                from .rental_spaces import live_contracts
                busy = [c for c in live_contracts(space) if not inst or c.id != inst.id]
                if busy:
                    raise ValidationError({'space': f'El espacio {space.code} ya tiene el contrato {busy[0].code}.'})
            elif space:
                raise ValidationError({'space': f'{prop.code} es Single Tenant: el contrato no lleva espacio.'})
        name = (pick('counterparty_name') or '') if pick('counterparty_name') is not None else ''
        if kind == 'renta':
            if not prop:
                raise ValidationError({'property': 'El contrato de renta requiere una propiedad.'})
            if not party:
                raise ValidationError({'tenant_party': 'El contrato de renta requiere un inquilino o cliente.'})
        if kind == 'proveedor' and not provider and not str(name).strip():
            raise ValidationError({'provider': 'Selecciona un proveedor o escribe el nombre de la contraparte.'})
        start, end = pick('start_date'), pick('end_date')
        if start and end and end < start:
            raise ValidationError({'end_date': 'La fecha de fin no puede ser anterior al inicio.'})
        return attrs


class AirbnbConnectionSerializer(serializers.ModelSerializer):
    listings_count = serializers.IntegerField(read_only=True, default=0)
    mapped_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = AirbnbConnection
        fields = [
            'id', 'tenant', 'label', 'host_email', 'mode', 'notes',
            'last_synced_at', 'is_active', 'listings_count', 'mapped_count',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'tenant', 'mode', 'last_synced_at', 'created_at', 'updated_at']


class AirbnbListingSerializer(serializers.ModelSerializer):
    connection_label = serializers.CharField(source='connection.label', read_only=True)
    property_code = serializers.CharField(source='property.code', read_only=True, default='')
    property_name = serializers.CharField(source='property.name', read_only=True, default='')
    events_count = serializers.SerializerMethodField()
    ical_configured = serializers.SerializerMethodField()

    class Meta:
        model = AirbnbListing
        fields = [
            'id', 'tenant', 'connection', 'connection_label',
            'property', 'property_code', 'property_name',
            'airbnb_listing_id', 'listing_url', 'ical_url', 'listing_name',
            'sync_enabled', 'occupied_now', 'events_count', 'ical_configured',
            'last_synced_at', 'last_sync_error',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'tenant', 'airbnb_listing_id', 'occupied_now',
            'last_synced_at', 'last_sync_error', 'created_at', 'updated_at',
        ]

    def get_events_count(self, obj):
        return len(obj.ical_events or [])

    def get_ical_configured(self, obj):
        return bool(obj.ical_url)


class RentalLeadActivitySerializer(serializers.ModelSerializer):
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = RentalLeadActivity
        fields = [
            'id', 'tenant', 'lead', 'kind', 'body',
            'created_by', 'created_by_name', 'created_at',
        ]
        read_only_fields = ['id', 'tenant', 'lead', 'created_by', 'created_at']

    def get_created_by_name(self, obj):
        user = obj.created_by
        if not user:
            return ''
        return (getattr(user, 'name', None) or getattr(user, 'email', None) or str(user))[:80]


class RentalLeadSerializer(serializers.ModelSerializer):
    property = serializers.PrimaryKeyRelatedField(
        source='rental_property',
        queryset=RentalProperty.objects.all(),
        allow_null=True,
        required=False,
    )
    full_name = serializers.ReadOnlyField()
    property_code = serializers.SerializerMethodField()
    property_name = serializers.SerializerMethodField()
    assigned_to_name = serializers.SerializerMethodField()
    party_name = serializers.SerializerMethodField()
    contract_code = serializers.SerializerMethodField()
    contract_status = serializers.SerializerMethodField()
    activities_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = RentalLead
        fields = [
            'id', 'tenant', 'property', 'property_code', 'property_name',
            'first_name', 'last_name', 'full_name', 'email', 'phone',
            'source', 'stage', 'interested_rent', 'expected_start', 'notes',
            'lost_reason', 'assigned_to', 'assigned_to_name',
            'party', 'party_name', 'contract', 'contract_code', 'contract_status',
            'converted_at', 'activities_count', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'tenant', 'party', 'contract', 'converted_at',
            'created_at', 'updated_at',
        ]

    def validate_property(self, prop):
        if not prop:
            return prop
        request = self.context.get('request')
        tenant_id = request.parser_context['kwargs'].get('tenant_id') if request else None
        if tenant_id and str(prop.tenant_id) != str(tenant_id):
            raise serializers.ValidationError('La unidad no pertenece a esta inmobiliaria.')
        return prop

    def get_property_code(self, obj):
        return obj.rental_property.code if obj.rental_property_id else ''

    def get_property_name(self, obj):
        return obj.rental_property.name if obj.rental_property_id else ''

    def get_party_name(self, obj):
        return obj.party.full_name if obj.party_id else ''

    def get_contract_code(self, obj):
        return obj.contract.code if obj.contract_id else ''

    def get_contract_status(self, obj):
        return obj.contract.status if obj.contract_id else ''

    def get_assigned_to_name(self, obj):
        user = obj.assigned_to
        if not user:
            return ''
        return (getattr(user, 'name', None) or getattr(user, 'email', None) or str(user))[:80]


