"""Rent Roll de Homly Rentas — snapshot estándar de ocupación y renta in-place."""
from __future__ import annotations

import csv
import io
from datetime import date
from decimal import Decimal

from django.http import HttpResponse
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import RentalContract, RentalProperty, Tenant
from .permissions import IsAdminTesOrContador
from .rental_views import _require_rentas


LEASE_LIVE = ('activo', 'por_vencer', 'vencido', 'renovado')
LEASE_SKIP = ('cancelado', 'finalizado', 'borrador')


def _f(n):
    return float(n or 0)


def _months_left(end: date, as_of: date) -> int:
    if not end:
        return 0
    days = (end - as_of).days
    if days <= 0:
        return 0
    return max(1, round(days / 30.44))


def _lease_term_months(start: date | None, end: date | None) -> int:
    if not start or not end:
        return 0
    days = (end - start).days
    if days <= 0:
        return 0
    return max(1, round(days / 30.44))


def _pick_lease(contracts, as_of: date):
    covering = []
    holdover = []
    for c in contracts:
        if c.status in LEASE_SKIP:
            continue
        if c.start_date <= as_of <= c.end_date:
            covering.append(c)
        elif c.start_date <= as_of and as_of > c.end_date and c.status == 'vencido':
            holdover.append(c)
    pool = covering or holdover
    if not pool:
        return None, bool(holdover)
    pool.sort(key=lambda x: x.start_date, reverse=True)
    return pool[0], bool(holdover) and not covering


def _balances(contract, as_of: date):
    charges = [ch for ch in contract.charges.all() if ch.status != 'cancelado']
    billed = Decimal('0')
    paid = Decimal('0')
    overdue = Decimal('0')
    period = as_of.strftime('%Y-%m')
    period_billed = Decimal('0')
    period_paid = Decimal('0')
    for ch in charges:
        amt = ch.amount or Decimal('0')
        got = ch.paid_amount or Decimal('0')
        billed += amt
        paid += got
        due = ch.due_date
        if ch.status != 'pagado' and due and due < as_of:
            overdue += max(Decimal('0'), amt - got)
        if ch.period == period:
            period_billed += amt
            period_paid += got
    return {
        'balance_due': billed - paid,
        'overdue_amount': overdue,
        'period_billed': period_billed,
        'period_paid': period_paid,
        'period_current': period_billed <= 0 or period_paid >= period_billed,
    }


def build_rentroll(tenant, as_of: date, include_inactive=False):
    qs = RentalProperty.objects.filter(tenant=tenant)
    if not include_inactive:
        qs = qs.exclude(status='inactiva')
    props = list(qs.select_related('airbnb_listing').order_by('code'))

    contracts = list(
        RentalContract.objects.filter(tenant=tenant)
        .select_related('tenant_party', 'guarantor', 'property')
        .prefetch_related('charges__payments')
    )
    by_prop = {}
    for c in contracts:
        by_prop.setdefault(c.property_id, []).append(c)
        if c.status not in LEASE_SKIP:
            c.refresh_lifecycle_status(as_of)

    rows = []
    units = occupied = vacant = reserved = notice = holdover_n = airbnb_n = delinquent = 0
    in_place = Decimal('0')
    market = Decimal('0')
    deposits = Decimal('0')
    overdue_total = Decimal('0')
    vacancy_loss = Decimal('0')
    loss_to_lease = Decimal('0')
    annual = Decimal('0')
    expiring_30 = expiring_60 = expiring_90 = 0

    for prop in props:
        units += 1
        leases = by_prop.get(prop.id, [])
        lease, is_holdover = _pick_lease(leases, as_of)
        suggested = prop.suggested_rent or Decimal('0')
        market += suggested

        airbnb = None
        try:
            airbnb = prop.airbnb_listing
        except Exception:
            airbnb = None
        airbnb_busy = bool(airbnb and airbnb.occupied_now and airbnb.sync_enabled)

        occ = 'vacante'
        tenant_name = ''
        tenant_phone = ''
        tenant_email = ''
        guarantor_name = ''
        contract_id = None
        contract_code = ''
        contract_status = ''
        start = end = None
        days_left = None
        months_left = 0
        lease_term_months = 0
        rent = Decimal('0')
        deposit = Decimal('0')
        payment_day = None
        increment_pct = Decimal('0')
        late_fee_pct = Decimal('0')
        bal = {
            'balance_due': Decimal('0'), 'overdue_amount': Decimal('0'),
            'period_billed': Decimal('0'), 'period_paid': Decimal('0'),
            'period_current': True,
        }
        occ_source = 'homly'

        if lease:
            party = lease.tenant_party
            tenant_name = party.full_name if party else ''
            tenant_phone = party.phone if party else ''
            tenant_email = party.email if party else ''
            guarantor = lease.guarantor
            guarantor_name = guarantor.full_name if guarantor else ''
            contract_id = str(lease.id)
            contract_code = lease.code
            contract_status = lease.status
            start, end = lease.start_date, lease.end_date
            days_left = (end - as_of).days
            months_left = _months_left(end, as_of)
            lease_term_months = _lease_term_months(start, end)
            rent = lease.rent_amount or Decimal('0')
            deposit = lease.deposit_amount or Decimal('0')
            payment_day = lease.payment_day
            increment_pct = lease.increment_pct or Decimal('0')
            late_fee_pct = lease.late_fee_pct or Decimal('0')
            bal = _balances(lease, as_of)
            occ_source = 'homly'
            if is_holdover:
                occ = 'holdover'
                holdover_n += 1
                occupied += 1
            elif days_left is not None and 0 <= days_left <= 45:
                occ = 'aviso'
                notice += 1
                occupied += 1
            else:
                occ = 'ocupada'
                occupied += 1
            in_place += rent
            annual += rent * 12
            deposits += deposit
            overdue_total += bal['overdue_amount']
            if suggested > rent:
                loss_to_lease += (suggested - rent)
            if days_left is not None and days_left >= 0:
                if days_left <= 30:
                    expiring_30 += 1
                if days_left <= 60:
                    expiring_60 += 1
                if days_left <= 90:
                    expiring_90 += 1
            if bal['overdue_amount'] > 0:
                delinquent += 1
        elif airbnb_busy:
            occ = 'ocupada'
            occ_source = 'airbnb'
            tenant_name = airbnb.listing_name or 'Reserva Airbnb'
            occupied += 1
            airbnb_n += 1
            rent = suggested
            in_place += rent
            annual += rent * 12
        else:
            vacant += 1
            if prop.status == 'reservada':
                occ = 'reservada'
                reserved += 1
            elif prop.status == 'mantenimiento':
                occ = 'mantenimiento'
            vacancy_loss += suggested or Decimal('0')

        area = prop.area_m2 or Decimal('0')
        rent_m2 = (rent / area) if area and rent else Decimal('0')
        collection = 'al_corriente'
        if occ in ('vacante', 'reservada', 'mantenimiento'):
            collection = '—'
        elif bal['overdue_amount'] > 0:
            collection = 'moroso'
        elif not bal['period_current']:
            collection = 'pendiente_mes'

        rows.append({
            'property_id': str(prop.id),
            'code': prop.code,
            'name': prop.name,
            'property_type': prop.property_type,
            'status_unit': prop.status,
            'address': prop.address_line,
            'city': prop.city,
            'state': prop.state,
            'neighborhood': prop.neighborhood,
            'bedrooms': prop.bedrooms,
            'bathrooms': float(prop.bathrooms or 0),
            'area_m2': _f(area),
            'owner_name': prop.owner_name,
            'source': prop.source,
            'occupancy': occ,
            'occupancy_source': occ_source,
            'tenant_name': tenant_name,
            'tenant_phone': tenant_phone,
            'tenant_email': tenant_email,
            'guarantor_name': guarantor_name,
            'contract_id': contract_id,
            'contract_code': contract_code,
            'contract_status': contract_status,
            'start_date': str(start) if start else None,
            'end_date': str(end) if end else None,
            'days_left': days_left,
            'months_left': months_left,
            'lease_term_months': lease_term_months,
            'payment_day': payment_day,
            'increment_pct': _f(increment_pct),
            'late_fee_pct': _f(late_fee_pct),
            'rent_monthly': _f(rent),
            'rent_annual': _f(rent * 12),
            'deposit': _f(deposit),
            'suggested_rent': _f(suggested),
            'rent_m2': _f(rent_m2),
            'loss_to_lease': _f(max(Decimal('0'), suggested - rent) if lease else 0),
            'gain_to_lease': _f(max(Decimal('0'), rent - suggested) if lease else 0),
            'vacancy_loss': _f(suggested if occ in ('vacante', 'reservada', 'mantenimiento') else 0),
            'balance_due': _f(bal['balance_due']),
            'overdue_amount': _f(bal['overdue_amount']),
            'collection_status': collection,
        })

    occ_pct = round((occupied / units) * 100, 1) if units else 0
    gpr = market  # Gross Potential Rent = suma de renta de mercado del inventario
    econ_pct = round((in_place / gpr) * 100, 1) if gpr else 0
    return {
        'as_of': str(as_of),
        'currency': tenant.currency,
        'summary': {
            'units': units,
            'occupied': occupied,
            'vacant': vacant,
            'reserved': reserved,
            'notice': notice,
            'holdover': holdover_n,
            'airbnb_occupied': airbnb_n,
            'delinquent': delinquent,
            'occupancy_pct': occ_pct,
            'economic_occupancy_pct': econ_pct,
            'gpr': _f(gpr),
            'in_place_rent': _f(in_place),
            'annual_in_place': _f(annual),
            'vacancy_loss': _f(vacancy_loss),
            'loss_to_lease': _f(loss_to_lease),
            'deposits_held': _f(deposits),
            'overdue_amount': _f(overdue_total),
            'expiring_30': expiring_30,
            'expiring_60': expiring_60,
            'expiring_90': expiring_90,
        },
        'rows': rows,
    }


def rentroll_csv(payload) -> HttpResponse:
    buf = io.StringIO()
    buf.write('\ufeff')
    w = csv.writer(buf)
    w.writerow([
        'Unidad', 'Inmueble', 'Tipo', 'Colonia', 'Ciudad', 'Estado', 'Dirección',
        'Propietario', 'Inquilino', 'Teléfono', 'Correo', 'Fiador',
        'Contrato', 'Inicio', 'Fin', 'Plazo meses', 'Días restantes',
        'Meses restantes', 'Renta mensual', 'Renta anual', 'Depósito',
        'Renta mercado', 'Renta/m2', 'Loss-to-lease', 'Gain-to-lease', 'Pérdida vacancia',
        'Ocupación', 'Origen ocupación', 'Cobranza', 'Saldo', 'Vencido',
        'Día de pago', 'Incremento %', 'Mora %', 'Recámaras', 'Baños', 'm2', 'Fuente',
    ])
    for r in payload['rows']:
        w.writerow([
            r['code'], r['name'], r['property_type'], r.get('neighborhood') or '',
            r['city'], r.get('state') or '', r.get('address') or '',
            r['owner_name'], r['tenant_name'], r['tenant_phone'], r['tenant_email'],
            r.get('guarantor_name') or '',
            r['contract_code'],
            r['start_date'] or '', r['end_date'] or '', r.get('lease_term_months') or '',
            r['days_left'] if r['days_left'] is not None else '',
            r['months_left'], r['rent_monthly'], r['rent_annual'], r['deposit'],
            r['suggested_rent'], r['rent_m2'], r['loss_to_lease'], r.get('gain_to_lease') or 0,
            r['vacancy_loss'],
            r['occupancy'], r['occupancy_source'], r['collection_status'],
            r['balance_due'], r['overdue_amount'], r['payment_day'] or '',
            r.get('increment_pct') or 0, r.get('late_fee_pct') or 0,
            r['bedrooms'], r.get('bathrooms') or 0, r['area_m2'], r['source'],
        ])
    as_of = payload['as_of']
    resp = HttpResponse(buf.getvalue(), content_type='text/csv; charset=utf-8')
    resp['Content-Disposition'] = f'attachment; filename="rent-roll-{as_of}.csv"'
    return resp


class RentalRentRollView(APIView):
    permission_classes = [IsAdminTesOrContador]

    def get(self, request, tenant_id):
        tenant = Tenant.objects.get(id=tenant_id)
        _require_rentas(tenant)
        raw = (request.query_params.get('as_of') or '').strip()
        try:
            as_of = date.fromisoformat(raw) if raw else date.today()
        except ValueError:
            return Response({'detail': 'Fecha as_of inválida (YYYY-MM-DD).'}, status=400)
        include_inactive = (request.query_params.get('include_inactive') or '') in ('1', 'true', 'True')
        payload = build_rentroll(tenant, as_of, include_inactive=include_inactive)
        fmt = (request.query_params.get('format') or request.query_params.get('export') or '').lower()
        if fmt == 'csv':
            return rentroll_csv(payload)
        return Response(payload)
