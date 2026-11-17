"""Rent Roll de Homly — ocupación, renta in-place y condiciones de cada contrato."""
from __future__ import annotations

import csv
import io
from datetime import date
from decimal import Decimal

from django.http import HttpResponse
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import RentalContract, RentalProperty, Tenant
from .rental_access import RentalAccess
from .rental_rent import BASIS_LABELS, SCHEME_LABELS, compute_effective_rent, conditions_summary, is_rent_estimate
from .rental_views import _require_rentas


LEASE_SKIP = ('cancelado', 'finalizado', 'borrador')
LEASE_KINDS = ('renta', 'comodato')  # los que cuentan como ocupación
GROUP_LABELS = {
    'residencial': 'Residencial',
    'corta_estancia': 'Corta estancia',
    'comercial': 'Comercial',
    'industrial': 'Industrial',
    'otros': 'Otros',
}


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
        if getattr(c, 'kind', 'renta') not in LEASE_KINDS:
            continue
        if c.status in LEASE_SKIP:
            continue
        if c.start_date <= as_of <= c.end_date:
            covering.append(c)
        elif c.start_date <= as_of and as_of > c.end_date and c.status == 'vencido':
            holdover.append(c)
    pool = covering or holdover
    if not pool:
        return None, bool(holdover)
    pool.sort(key=lambda x: (0 if x.kind == 'renta' else 1, -x.start_date.toordinal()))
    return pool[0], bool(holdover) and not covering


def _balances(contract, as_of: date):
    charges = [ch for ch in contract.charges.all() if ch.status != 'cancelado']
    billed = Decimal('0')
    paid = Decimal('0')
    overdue = Decimal('0')
    period = as_of.strftime('%Y-%m')
    period_billed = Decimal('0')
    period_paid = Decimal('0')
    last_charge = None
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
            last_charge = ch
    return {
        'balance_due': billed - paid,
        'overdue_amount': overdue,
        'period_billed': period_billed,
        'period_paid': period_paid,
        'period_current': period_billed <= 0 or period_paid >= period_billed,
        'period_charge': last_charge.amount if last_charge else None,
        'period_charge_label': last_charge.description if last_charge else '',
    }


def _airbnb_info(prop):
    try:
        listing = prop.airbnb_listing
    except Exception:
        listing = None
    if not listing:
        return None
    return {
        'listing_name': listing.listing_name or '',
        'occupied_now': bool(listing.occupied_now and listing.sync_enabled),
        'sync_enabled': bool(listing.sync_enabled),
        'last_synced_at': listing.last_synced_at.isoformat() if listing.last_synced_at else None,
    }


def build_rentroll(tenant, as_of: date, include_inactive=False):
    from .rental_mode import leasing_enabled
    all_qs = RentalProperty.objects.filter(tenant=tenant)
    if not include_inactive:
        all_qs = all_qs.exclude(status='inactiva')
    if leasing_enabled(tenant):
        qs = all_qs.filter(usage='renta')
        operation_only = all_qs.exclude(usage='renta').count()
    else:
        qs = all_qs.none()
        operation_only = all_qs.count()
    props = list(qs.select_related('airbnb_listing').prefetch_related('spaces').order_by('code'))

    contracts = list(
        RentalContract.objects.filter(tenant=tenant)
        .select_related('tenant_party', 'guarantor', 'property')
        .prefetch_related('charges__payments')
    )
    by_prop = {}
    by_unit = {}
    for c in contracts:
        if c.property_id:
            by_prop.setdefault(c.property_id, []).append(c)
            by_unit.setdefault((c.property_id, c.space_id), []).append(c)
        if c.status not in LEASE_SKIP and getattr(c, 'kind', 'renta') in LEASE_KINDS:
            c.refresh_lifecycle_status(as_of)

    rows = []
    units = occupied = vacant = reserved = notice = holdover_n = airbnb_n = delinquent = 0
    fixed_n = variable_n = comodato_n = 0
    in_place = Decimal('0')
    market = Decimal('0')
    deposits = Decimal('0')
    overdue_total = Decimal('0')
    vacancy_loss = Decimal('0')
    loss_to_lease = Decimal('0')
    annual = Decimal('0')
    fixed_rent = Decimal('0')
    variable_rent = Decimal('0')
    expiring_30 = expiring_60 = expiring_90 = 0
    by_group = {k: {'units': 0, 'occupied': 0, 'rent': Decimal('0')} for k in GROUP_LABELS}

    # Unidades del rent roll: la propiedad completa (Single Tenant) o cada espacio rentable (Multi Tenant)
    from .rental_spaces import leaf_leasable
    unit_list = []
    for prop in props:
        if prop.tenancy_model == 'multi':
            leaves = sorted(leaf_leasable(list(prop.spaces.all())), key=lambda s: (s.building, s.floor, s.code))
            legacy = any(
                c.space_id is None and getattr(c, 'kind', 'renta') in LEASE_KINDS and c.status not in LEASE_SKIP
                for c in by_prop.get(prop.id, [])
            )
            unit_list.extend((prop, sp) for sp in leaves)
            if legacy:
                unit_list.append((prop, None))
        else:
            unit_list.append((prop, None))
    gla_total = Decimal('0')
    gla_occupied = Decimal('0')
    multi_ids = set()

    for prop, sp in unit_list:
        units += 1
        if sp:
            multi_ids.add(prop.id)
        group = prop.type_group
        by_group.setdefault(group, {'units': 0, 'occupied': 0, 'rent': Decimal('0')})
        by_group[group]['units'] += 1
        leases = by_unit.get((prop.id, sp.id if sp else None), [])
        lease, is_holdover = _pick_lease(leases, as_of)
        suggested = (sp.suggested_rent if sp else prop.suggested_rent) or Decimal('0')
        market += suggested
        airbnb = None if sp else _airbnb_info(prop)
        airbnb_busy = bool(airbnb and airbnb['occupied_now'])

        occ = 'vacante'
        tenant_name = tenant_phone = tenant_email = tenant_rfc = ''
        guarantor_name = ''
        contract_id = None
        contract_code = contract_title = contract_status = contract_kind = ''
        legal_stage = ''
        start = end = None
        days_left = None
        months_left = lease_term_months = 0
        rent = Decimal('0')
        contracted = Decimal('0')
        deposit = Decimal('0')
        payment_day = None
        increment_pct = Decimal('0')
        late_fee_pct = Decimal('0')
        scheme = ''
        basis = ''
        cond_summary = ''
        conditions = {}
        notes = ''
        estimate = False
        bal = {
            'balance_due': Decimal('0'), 'overdue_amount': Decimal('0'),
            'period_billed': Decimal('0'), 'period_paid': Decimal('0'),
            'period_current': True, 'period_charge': None, 'period_charge_label': '',
        }
        occ_source = 'homly'

        if lease:
            party = lease.tenant_party
            tenant_name = party.full_name if party else lease.counterpart_label
            tenant_phone = party.phone if party else ''
            tenant_email = party.email if party else ''
            tenant_rfc = party.rfc if party else ''
            guarantor = lease.guarantor
            guarantor_name = guarantor.full_name if guarantor else ''
            contract_id = str(lease.id)
            contract_code = lease.code
            contract_title = lease.title or ''
            contract_status = lease.status
            contract_kind = lease.kind
            legal_stage = lease.legal_stage
            start, end = lease.start_date, lease.end_date
            days_left = (end - as_of).days
            months_left = _months_left(end, as_of)
            lease_term_months = _lease_term_months(start, end)
            contracted = lease.rent_amount or Decimal('0')
            rent = compute_effective_rent(lease, as_of, sp or prop)
            deposit = lease.deposit_amount or Decimal('0')
            payment_day = lease.payment_day
            increment_pct = lease.increment_pct or Decimal('0')
            late_fee_pct = lease.late_fee_pct or Decimal('0')
            scheme = lease.rent_scheme or 'fija'
            conditions = lease.rent_conditions if isinstance(lease.rent_conditions, dict) else {}
            basis = (conditions.get('basis') or '') if scheme == 'variable' else ''
            cond_summary = conditions_summary(lease)
            notes = (lease.notes or '')[:240]
            estimate = is_rent_estimate(lease)
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
            if lease.kind == 'comodato':
                comodato_n += 1
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
            if scheme == 'variable':
                variable_n += 1
                variable_rent += rent
            else:
                fixed_n += 1
                fixed_rent += rent
            by_group[group]['occupied'] += 1
            by_group[group]['rent'] += rent
        elif airbnb_busy:
            occ = 'ocupada'
            occ_source = 'airbnb'
            tenant_name = airbnb['listing_name'] or 'Reserva Airbnb'
            occupied += 1
            airbnb_n += 1
            rent = suggested
            in_place += rent
            annual += rent * 12
            scheme = 'variable'
            basis = 'ocupacion'
            cond_summary = 'Ocupación Airbnb (iCal)'
            estimate = True
            variable_n += 1
            variable_rent += rent
            by_group[group]['occupied'] += 1
            by_group[group]['rent'] += rent
        else:
            vacant += 1
            unit_status = sp.status if sp else prop.status
            if unit_status in ('reservada', 'reservado'):
                occ = 'reservada'
                reserved += 1
            elif unit_status == 'mantenimiento':
                occ = 'mantenimiento'
            vacancy_loss += suggested or Decimal('0')

        area = (sp.area_m2 if sp else prop.area_m2) or Decimal('0')
        gla_total += area
        if occ in ('ocupada', 'aviso', 'holdover'):
            gla_occupied += area
        rent_m2 = (rent / area) if area and rent else Decimal('0')
        collection = 'al_corriente'
        if occ in ('vacante', 'reservada', 'mantenimiento'):
            collection = '—'
        elif bal['overdue_amount'] > 0:
            collection = 'moroso'
        elif not bal['period_current']:
            collection = 'pendiente_mes'

        specs = (sp.specs if sp else prop.specs) if isinstance(sp.specs if sp else prop.specs, dict) else {}
        rows.append({
            'property_id': str(prop.id),
            'space_id': str(sp.id) if sp else None,
            'property_code': prop.code,
            'property_name': prop.name,
            'tenancy_model': prop.tenancy_model,
            'park_name': prop.park_name,
            'building': (sp.building if sp and sp.building else prop.building_number),
            'floor': sp.floor if sp else '',
            'space_type_label': sp.get_space_type_display() if sp else '',
            'code': f'{prop.code}-{sp.code}' if sp else prop.code,
            'name': f'{prop.name} · {sp.label}' if sp else prop.name,
            'property_type': prop.property_type,
            'type_label': prop.get_property_type_display(),
            'type_group': group,
            'type_group_label': GROUP_LABELS.get(group, group),
            'specs': specs,
            'specs_summary': (f'{sp.area_m2:g} m²' if sp else prop.specs_summary),
            'status_unit': sp.status if sp else prop.status,
            'address': prop.address_line,
            'city': prop.city,
            'state': prop.state,
            'neighborhood': prop.neighborhood,
            'postal_code': prop.postal_code,
            'bedrooms': prop.bedrooms,
            'bathrooms': float(prop.bathrooms or 0),
            'area_m2': _f(area),
            'owner_name': prop.owner_name,
            'owner_email': prop.owner_email,
            'owner_phone': prop.owner_phone,
            'source': prop.source,
            'notes': (prop.notes or '')[:240],
            'occupancy': occ,
            'occupancy_source': occ_source,
            'airbnb': airbnb,
            'tenant_name': tenant_name,
            'tenant_phone': tenant_phone,
            'tenant_email': tenant_email,
            'tenant_rfc': tenant_rfc,
            'guarantor_name': guarantor_name,
            'contract_id': contract_id,
            'contract_code': contract_code,
            'contract_title': contract_title,
            'contract_status': contract_status,
            'contract_kind': contract_kind,
            'legal_stage': legal_stage,
            'start_date': str(start) if start else None,
            'end_date': str(end) if end else None,
            'days_left': days_left,
            'months_left': months_left,
            'lease_term_months': lease_term_months,
            'payment_day': payment_day,
            'increment_pct': _f(increment_pct),
            'late_fee_pct': _f(late_fee_pct),
            'rent_scheme': scheme,
            'rent_scheme_label': SCHEME_LABELS.get(scheme, scheme or '—'),
            'rent_basis': basis,
            'rent_basis_label': BASIS_LABELS.get(basis, '') if basis else '',
            'rent_conditions': conditions,
            'rent_conditions_summary': cond_summary,
            'rent_is_estimate': estimate,
            'rent_contracted': _f(contracted),
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
            'period_billed': _f(bal['period_billed']),
            'period_paid': _f(bal['period_paid']),
            'period_charge': _f(bal['period_charge']) if bal['period_charge'] is not None else None,
            'period_charge_label': bal['period_charge_label'] or '',
            'collection_status': collection,
            'contract_notes': notes,
        })

    occ_pct = round((occupied / units) * 100, 1) if units else 0
    gpr = market
    econ_pct = round((in_place / gpr) * 100, 1) if gpr else 0
    groups_out = {
        key: {
            'label': GROUP_LABELS.get(key, key),
            'units': val['units'],
            'occupied': val['occupied'],
            'rent': _f(val['rent']),
        }
        for key, val in by_group.items() if val['units']
    }
    return {
        'as_of': str(as_of),
        'currency': tenant.currency,
        'summary': {
            'units': units,
            'multi_tenant_properties': len(multi_ids),
            'gla_total': _f(gla_total),
            'gla_occupied': _f(gla_occupied),
            'gla_vacant': _f(max(Decimal('0'), gla_total - gla_occupied)),
            'gla_occupancy_pct': round(float(gla_occupied / gla_total) * 100, 1) if gla_total > 0 else 0,
            'operation_only': operation_only,
            'occupied': occupied,
            'vacant': vacant,
            'reserved': reserved,
            'notice': notice,
            'holdover': holdover_n,
            'airbnb_occupied': airbnb_n,
            'comodato': comodato_n,
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
            'fixed_count': fixed_n,
            'variable_count': variable_n,
            'fixed_rent': _f(fixed_rent),
            'variable_rent': _f(variable_rent),
            'by_group': groups_out,
        },
        'rows': rows,
    }


def rentroll_csv(payload) -> HttpResponse:
    buf = io.StringIO()
    buf.write('\ufeff')
    w = csv.writer(buf)
    w.writerow([
        'Unidad', 'Inmueble', 'Grupo', 'Tipo', 'Especificaciones', 'Colonia', 'Ciudad', 'Estado',
        'Dirección', 'm2', 'Propietario', 'Tel. propietario',
        'Inquilino', 'Teléfono', 'Correo', 'RFC', 'Fiador',
        'Contrato', 'Título', 'Tipo contrato', 'Etapa legal', 'Inicio', 'Fin',
        'Plazo meses', 'Días restantes', 'Meses restantes',
        'Esquema', 'Base variable', 'Condiciones', 'Estimada',
        'Renta contratada', 'Renta vigente', 'Renta anual', 'Depósito',
        'Renta mercado', 'Renta/m2', 'Loss-to-lease', 'Gain-to-lease', 'Pérdida vacancia',
        'Ocupación', 'Origen ocupación', 'Cobranza', 'Cargo del mes', 'Saldo', 'Vencido',
        'Día de pago', 'Incremento %', 'Mora %', 'Recámaras', 'Baños', 'Fuente',
        'Modelo', 'Park', 'Building', 'Piso', 'Tipo de espacio',
    ])
    for r in payload['rows']:
        w.writerow([
            r['code'], r['name'], r.get('type_group_label') or '',
            r.get('type_label') or r['property_type'], r.get('specs_summary') or '',
            r.get('neighborhood') or '', r['city'], r.get('state') or '',
            r.get('address') or '', r['area_m2'],
            r['owner_name'], r.get('owner_phone') or '',
            r['tenant_name'], r['tenant_phone'], r['tenant_email'],
            r.get('tenant_rfc') or '', r.get('guarantor_name') or '',
            r['contract_code'], r.get('contract_title') or '',
            r.get('contract_kind') or '', r.get('legal_stage') or '',
            r['start_date'] or '', r['end_date'] or '', r.get('lease_term_months') or '',
            r['days_left'] if r['days_left'] is not None else '',
            r['months_left'],
            r.get('rent_scheme_label') or '', r.get('rent_basis_label') or '',
            r.get('rent_conditions_summary') or '',
            'sí' if r.get('rent_is_estimate') else '',
            r.get('rent_contracted') or 0, r['rent_monthly'], r['rent_annual'], r['deposit'],
            r['suggested_rent'], r['rent_m2'], r['loss_to_lease'], r.get('gain_to_lease') or 0,
            r['vacancy_loss'],
            r['occupancy'], r['occupancy_source'], r['collection_status'],
            r.get('period_charge') if r.get('period_charge') is not None else '',
            r['balance_due'], r['overdue_amount'], r['payment_day'] or '',
            r.get('increment_pct') or 0, r.get('late_fee_pct') or 0,
            r['bedrooms'], r.get('bathrooms') or 0, r['source'],
            'Multi Tenant' if r.get('tenancy_model') == 'multi' else 'Single Tenant',
            r.get('park_name') or '', r.get('building') or '', r.get('floor') or '',
            r.get('space_type_label') or '',
        ])
    as_of = payload['as_of']
    resp = HttpResponse(buf.getvalue(), content_type='text/csv; charset=utf-8')
    resp['Content-Disposition'] = f'attachment; filename="rent-roll-{as_of}.csv"'
    return resp


class RentalRentRollView(APIView):
    permission_classes = [RentalAccess('rentas_rentroll')]

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
