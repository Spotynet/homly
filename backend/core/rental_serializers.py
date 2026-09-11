"""Serializers del espacio de trabajo de rentas."""
from rest_framework import serializers
from .models import (
    RentalProperty, RentalParty, RentalChargeConcept,
    RentalContract, RentalCharge, RentalPayment,
    AirbnbConnection, AirbnbListing, RentalLead, RentalLeadActivity,
)


class RentalPropertySerializer(serializers.ModelSerializer):
    address_line = serializers.ReadOnlyField()
    active_contract_code = serializers.SerializerMethodField()

    class Meta:
        model = RentalProperty
        fields = [
            'id', 'tenant', 'code', 'name', 'property_type', 'status',
            'street', 'ext_number', 'int_number', 'neighborhood',
            'city', 'state', 'postal_code', 'address_line',
            'bedrooms', 'bathrooms', 'area_m2', 'suggested_rent',
            'owner_name', 'owner_email', 'owner_phone', 'notes',
            'is_active', 'source', 'airbnb_listing_id',
            'active_contract_code', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'tenant', 'created_at', 'updated_at']

    def get_active_contract_code(self, obj):
        c = obj.contracts.exclude(status__in=('cancelado', 'finalizado', 'borrador')).order_by('-start_date').first()
        return c.code if c else None


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
    concept_name = serializers.CharField(source='concept.name', read_only=True, default='')
    contract_code = serializers.CharField(source='contract.code', read_only=True)
    property_code = serializers.CharField(source='contract.property.code', read_only=True)
    tenant_name = serializers.CharField(source='contract.tenant_party.full_name', read_only=True)

    class Meta:
        model = RentalCharge
        fields = [
            'id', 'tenant', 'contract', 'concept', 'concept_name',
            'period', 'description', 'amount', 'paid_amount', 'due_date',
            'status', 'contract_code', 'property_code', 'tenant_name',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'tenant', 'status', 'created_at', 'updated_at']

    def get_paid_amount(self, obj):
        return float(obj.paid_amount)


class RentalPaymentSerializer(serializers.ModelSerializer):
    contract_code = serializers.CharField(source='contract.code', read_only=True)
    charge_description = serializers.CharField(source='charge.description', read_only=True, default='')

    class Meta:
        model = RentalPayment
        fields = [
            'id', 'tenant', 'contract', 'charge', 'amount', 'payment_date',
            'payment_type', 'reference', 'notes',
            'contract_code', 'charge_description',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'tenant', 'created_at', 'updated_at']


class RentalContractSerializer(serializers.ModelSerializer):
    property_code = serializers.CharField(source='property.code', read_only=True)
    property_name = serializers.CharField(source='property.name', read_only=True)
    tenant_name = serializers.CharField(source='tenant_party.full_name', read_only=True)
    tenant_email = serializers.CharField(source='tenant_party.email', read_only=True)
    tenant_phone = serializers.CharField(source='tenant_party.phone', read_only=True)
    guarantor_name = serializers.SerializerMethodField()
    balance_due = serializers.SerializerMethodField()

    class Meta:
        model = RentalContract
        fields = [
            'id', 'tenant', 'property', 'property_code', 'property_name',
            'tenant_party', 'tenant_name', 'tenant_email', 'tenant_phone',
            'guarantor', 'guarantor_name',
            'code', 'start_date', 'end_date', 'rent_amount', 'deposit_amount',
            'payment_day', 'increment_pct', 'late_fee_pct', 'status', 'notes',
            'balance_due', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'tenant', 'created_at', 'updated_at']

    def get_guarantor_name(self, obj):
        return obj.guarantor.full_name if obj.guarantor else ''

    def get_balance_due(self, obj):
        from django.db.models import Sum, F
        from decimal import Decimal
        charges = obj.charges.exclude(status='cancelado')
        total = charges.aggregate(s=Sum('amount'))['s'] or Decimal('0')
        paid = Decimal('0')
        for ch in charges.prefetch_related('payments'):
            paid += ch.paid_amount
        return float(max(Decimal('0'), total - paid))


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


