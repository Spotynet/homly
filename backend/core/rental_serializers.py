"""Serializers del espacio de trabajo de rentas."""
from rest_framework import serializers
from .models import (
    RentalProperty, RentalParty, RentalChargeConcept,
    RentalContract, RentalCharge, RentalPayment,
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
            'is_active', 'active_contract_code', 'created_at', 'updated_at',
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
