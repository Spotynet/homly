"""Asistente legal de contratos para Administrar Propiedades.

Genera redacciones a partir de los datos del espacio (inmueble, cliente,
proveedor, servicio) y de la entrevista. No sustituye asesoría de un
abogado titulado; el usuario revisa, firma y publica.
"""
from __future__ import annotations

from datetime import date

KIND_PREFIX = {
    'renta': 'RT',
    'proveedor': 'PV',
    'servicios_generales': 'SG',
    'mantenimiento': 'MT',
    'comodato': 'CM',
    'promesa': 'PR',
    'otro': 'CT',
}

KIND_TITLES = {
    'renta': 'Contrato de arrendamiento de inmueble',
    'proveedor': 'Contrato de prestación de servicios con proveedor',
    'servicios_generales': 'Contrato de servicios generales',
    'mantenimiento': 'Contrato de mantenimiento de inmueble',
    'comodato': 'Contrato de comodato (préstamo de uso)',
    'promesa': 'Contrato de promesa de arrendamiento',
    'otro': 'Contrato',
}


def next_contract_code(tenant, kind):
    from .models import RentalContract
    year = date.today().year
    prefix = f'{KIND_PREFIX.get(kind, "CT")}-{year}-'
    last = (
        RentalContract.objects
        .filter(tenant=tenant, code__startswith=prefix)
        .order_by('-code')
        .values_list('code', flat=True)
        .first()
    )
    seq = 1
    if last:
        try:
            seq = int(str(last).split('-')[-1]) + 1
        except (TypeError, ValueError):
            seq = RentalContract.objects.filter(tenant=tenant, code__startswith=prefix).count() + 1
    return f'{prefix}{seq:04d}'


def _d(value):
    if not value:
        return '________'
    if hasattr(value, 'strftime'):
        return value.strftime('%d/%m/%Y')
    return str(value)[:10]


def _money(amount):
    try:
        n = float(amount or 0)
    except (TypeError, ValueError):
        n = 0.0
    return f'${n:,.2f} MXN'


def _name(obj, *attrs):
    if not obj:
        return ''
    for a in attrs:
        v = getattr(obj, a, '') or ''
        if v:
            return str(v).strip()
    return ''


def context_from_contract(contract):
    tenant = contract.tenant
    prop = contract.property
    party = contract.tenant_party
    provider = contract.provider
    work = contract.work
    category = contract.category
    landlord = ''
    if prop:
        landlord = (prop.owner_name or '').strip()
    if not landlord:
        landlord = (getattr(tenant, 'name', None) or 'EL ARRENDADOR / CONTRATANTE').strip()

    counterpart = contract.counterpart_label if hasattr(contract, 'counterpart_label') else ''
    if not counterpart or counterpart == '—':
        counterpart = (contract.counterparty_name or '').strip() or 'LA CONTRAPARTE'

    return {
        'workspace': getattr(tenant, 'name', '') or 'Administrar Propiedades',
        'kind_title': KIND_TITLES.get(contract.kind, 'Contrato'),
        'code': contract.code or 'S/N',
        'title': (contract.title or KIND_TITLES.get(contract.kind, 'Contrato')).strip(),
        'landlord': landlord,
        'counterpart': counterpart,
        'party_rfc': _name(party, 'rfc'),
        'party_email': _name(party, 'email'),
        'party_phone': _name(party, 'phone'),
        'provider_name': (provider.trade_name or provider.name) if provider else (contract.counterparty_name or ''),
        'provider_rfc': _name(provider, 'rfc'),
        'property_label': f'{prop.code} · {prop.name}' if prop else 'el inmueble convenido',
        'property_address': (prop.address_line if prop else '') or 'domicilio que las partes acuerden',
        'category': category.name if category else '',
        'work_label': f'{work.folio} · {work.title}' if work else '',
        'service': (contract.service_description or (category.name if category else '') or 'los servicios convenidos').strip(),
        'start': _d(contract.start_date),
        'end': _d(contract.end_date),
        'amount': _money(contract.rent_amount),
        'deposit': _money(contract.deposit_amount),
        'payment_day': contract.payment_day or 1,
        'increment': contract.increment_pct or 0,
        'late_fee': contract.late_fee_pct or 0,
        'scheme': getattr(contract, 'rent_scheme', 'fija') or 'fija',
        'scheme_label': 'renta variable' if getattr(contract, 'rent_scheme', '') == 'variable' else 'renta fija',
        'conditions_summary': getattr(contract, 'rent_conditions_summary', '') or 'renta fija',
        'guarantor': contract.guarantor.full_name if contract.guarantor_id else '',
        'notes': (contract.notes or '').strip(),
        'today': _d(date.today()),
    }


def default_brief(contract=None):
    kind = getattr(contract, 'kind', 'renta') if contract else 'renta'
    return {
        'purpose': '',
        'jurisdiction': 'los Estados Unidos Mexicanos',
        'city': '',
        'payment_terms': '',
        'special_clauses': '',
        'include_deposit': kind == 'renta',
        'include_guarantor': bool(getattr(contract, 'guarantor_id', None)),
        'include_inventory': kind in ('renta', 'comodato'),
        'include_confidentiality': kind in ('proveedor', 'servicios_generales', 'mantenimiento'),
        'include_termination': True,
        'include_repse': kind == 'proveedor' and bool(getattr(getattr(contract, 'provider', None), 'is_repse', False)),
        'include_maintenance': kind in ('renta', 'mantenimiento'),
    }


def draft_contract(contract, brief=None):
    ctx = context_from_contract(contract)
    brief = {**default_brief(contract), **(brief or {}), **(contract.assistant_brief or {})}
    city = (brief.get('city') or '').strip() or 'la ciudad de residencia de las partes'
    purpose = (brief.get('purpose') or '').strip()
    payment_terms = (brief.get('payment_terms') or '').strip()
    special = (brief.get('special_clauses') or '').strip()
    jurisdiction = (brief.get('jurisdiction') or 'los Estados Unidos Mexicanos').strip()

    kind = contract.kind
    lines = []
    lines.append(ctx['kind_title'].upper())
    lines.append(f"Folio: {ctx['code']}")
    lines.append(f"Espacio: {ctx['workspace']}")
    lines.append('')
    lines.append(
        f"Celebrado en {city}, el {ctx['today']}, al amparo de las leyes de {jurisdiction}."
    )
    lines.append('')
    lines.append('I. PARTES')
    lines.append(
        f"1. {ctx['landlord']}, en lo sucesivo \"EL CONTRATANTE\"."
    )
    party_line = f"2. {ctx['counterpart']}, en lo sucesivo \"LA CONTRAPARTE\""
    extras = [x for x in (ctx['party_rfc'] and f"RFC {ctx['party_rfc']}", ctx['provider_rfc'] and f"RFC {ctx['provider_rfc']}") if x]
    if extras:
        party_line += f" ({', '.join(extras)})"
    party_line += '.'
    lines.append(party_line)
    if ctx['guarantor'] and brief.get('include_guarantor'):
        lines.append(f"3. {ctx['guarantor']}, en lo sucesivo \"EL FIADOR\", quien se constituye obligado solidario.")
    lines.append('')

    if kind == 'renta':
        lines += _renta_clauses(ctx, brief, purpose, payment_terms)
    elif kind == 'proveedor':
        lines += _proveedor_clauses(ctx, brief, purpose, payment_terms)
    elif kind == 'mantenimiento':
        lines += _mantenimiento_clauses(ctx, brief, purpose, payment_terms)
    elif kind == 'comodato':
        lines += _comodato_clauses(ctx, brief, purpose)
    elif kind == 'promesa':
        lines += _promesa_clauses(ctx, brief, purpose, payment_terms)
    else:
        lines += _servicios_clauses(ctx, brief, purpose, payment_terms)

    n = 6
    if brief.get('include_confidentiality'):
        lines.append(f'{_roman(n)}. CONFIDENCIALIDAD')
        lines.append(
            'Las partes se obligan a guardar reserva sobre la información comercial, de inmuebles, '
            'clientes y operaciones a la que tengan acceso con motivo de este contrato.'
        )
        lines.append('')
        n += 1
    if brief.get('include_termination'):
        lines.append(f'{_roman(n)}. TERMINACIÓN ANTICIPADA')
        lines.append(
            'Cualquiera de las partes podrá dar por terminado este contrato con aviso por escrito '
            'de treinta días naturales, o de inmediato ante incumplimiento grave, sin perjuicio '
            'de las obligaciones vencidas.'
        )
        lines.append('')
        n += 1
    if brief.get('include_repse'):
        lines.append(f'{_roman(n)}. SERVICIOS ESPECIALIZADOS (REPSE)')
        lines.append(
            'Si los servicios son especializados, LA CONTRAPARTE declara contar con registro vigente '
            'en el REPSE y se obliga a entregar constancia, opiniones de cumplimiento y soportes '
            'que solicite EL CONTRATANTE para su expediente.'
        )
        lines.append('')
        n += 1
    if special:
        lines.append(f'{_roman(n)}. CLÁUSULAS ESPECIALES')
        lines.append(special)
        lines.append('')
        n += 1
    if ctx['notes']:
        lines.append(f'{_roman(n)}. NOTAS DE LA ADMINISTRACIÓN')
        lines.append(ctx['notes'])
        lines.append('')
        n += 1

    lines.append(f'{_roman(n)}. JURISDICCIÓN')
    lines.append(
        f'Para la interpretación y cumplimiento, las partes se someten a los tribunales competentes '
        f'de {city}, renunciando a cualquier otro fuero. Este documento es una redacción asistida '
        f'por Homly; no sustituye la revisión de un abogado titulado.'
    )
    lines.append('')
    lines.append('Firmas')
    lines.append(f"EL CONTRATANTE: {ctx['landlord']}")
    lines.append(f"LA CONTRAPARTE: {ctx['counterpart']}")
    if ctx['guarantor'] and brief.get('include_guarantor'):
        lines.append(f"EL FIADOR: {ctx['guarantor']}")
    return '\n'.join(lines).strip() + '\n'


def _roman(n):
    return ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'][n - 1]


def _renta_clauses(ctx, brief, purpose, payment_terms):
    lines = [
        'II. OBJETO',
        f"EL CONTRATANTE da en arrendamiento {ctx['property_label']}, ubicado en {ctx['property_address']}, "
        f"para uso habitacional o el que las partes convengan"
        + (f'. {purpose}' if purpose else '.'),
        '',
        'III. VIGENCIA',
        f"El contrato rige del {ctx['start']} al {ctx['end']}. Al vencimiento, la ocupación sin nuevo "
        'convenio no implica prórroga automática.',
        '',
        'IV. RENTA Y PAGOS',
        (
            f"La contraprestación es {ctx['scheme_label']}. "
            + (
                f"Condiciones: {ctx['conditions_summary']}. La renta base o mínima es de {ctx['amount']}, "
                if ctx.get('scheme') == 'variable'
                else f"La renta mensual fija es de {ctx['amount']}, "
            )
            + f"pagadera el día {ctx['payment_day']} de cada mes. "
            + (payment_terms or 'El pago se cubrirá por transferencia o el medio que acuerden las partes.')
        ),
    ]
    if brief.get('include_deposit'):
        lines.append(f"Se entrega un depósito en garantía de {ctx['deposit']}, que se devolverá al término "
                     'si no existen adeudos ni daños imputables a LA CONTRAPARTE.')
    if ctx['increment']:
        lines.append(f"La renta se incrementará anualmente en {ctx['increment']}% o el índice que acuerden.")
    if ctx['late_fee']:
        lines.append(f"El atraso genera una pena convencional del {ctx['late_fee']}% sobre el saldo vencido.")
    lines += ['', 'V. OBLIGACIONES']
    lines.append(
        'LA CONTRAPARTE usará el inmueble de forma diligente, pagará los servicios a su cargo y '
        'no hará obras sin autorización. EL CONTRATANTE entregará el inmueble en condiciones de uso '
        'y conservará las instalaciones estructurales.'
    )
    if brief.get('include_maintenance'):
        lines.append(
            'Las reparaciones menores de uso cotidiano corresponden a LA CONTRAPARTE; las estructurales, '
            'a EL CONTRATANTE, salvo dolo o culpa de quien ocupa.'
        )
    if brief.get('include_inventory'):
        lines.append(
            'Se levantará inventario y estado del inmueble a la entrega y a la devolución. '
            'Los faltantes o daños no atribuibles al desgaste normal se descontarán del depósito.'
        )
    lines.append('')
    return lines


def _proveedor_clauses(ctx, brief, purpose, payment_terms):
    lines = [
        'II. OBJETO',
        f"LA CONTRAPARTE se obliga a prestar a EL CONTRATANTE los siguientes servicios: {ctx['service']}"
        + (f'. {purpose}' if purpose else '.'),
        '',
        'III. VIGENCIA',
        f"Los servicios se prestarán del {ctx['start']} al {ctx['end']}, o hasta su conclusión si es por obra determinada.",
        '',
        'IV. CONTRAPRESTACIÓN',
        f"El precio convenido es de {ctx['amount']}. "
        + (payment_terms or f"El pago se cubrirá contra entrega de factura y evidencia, a más tardar el día {ctx['payment_day']} del mes siguiente."),
        '',
        'V. OBLIGACIONES DEL PROVEEDOR',
        'LA CONTRAPARTE prestará el servicio con personal propio, herramientas y materiales, cumpliendo '
        'normas de seguridad y calidad. Es responsable de sus trabajadores y de las obligaciones laborales, '
        'fiscales y de seguridad social que le correspondan. No existe subordinación ni relación laboral '
        'con EL CONTRATANTE.',
    ]
    if ctx['work_label']:
        lines.append(f"Este contrato se relaciona con la orden de mantenimiento {ctx['work_label']}.")
    lines.append('')
    return lines


def _mantenimiento_clauses(ctx, brief, purpose, payment_terms):
    lines = [
        'II. OBJETO',
        f"LA CONTRAPARTE realizará trabajos de mantenimiento en {ctx['property_label']} "
        f"({ctx['property_address']}): {ctx['service']}"
        + (f'. {purpose}' if purpose else '.'),
        '',
        'III. VIGENCIA Y PROGRAMACIÓN',
        f"Del {ctx['start']} al {ctx['end']}. Las fechas de cada visita se coordinarán con la administración.",
        '',
        'IV. PRECIO',
        f"El importe es de {ctx['amount']}. "
        + (payment_terms or 'Se pagará contra evidencia de trabajo realizado y, en su caso, factura.'),
        '',
        'V. CALIDAD Y EVIDENCIAS',
        'LA CONTRAPARTE dejará el área limpia, reportará hallazgos y permitirá el registro fotográfico '
        'antes, durante y después. Los materiales serán de calidad comercial salvo pacto en contrario.',
    ]
    if ctx['work_label']:
        lines.append(f"Queda vinculado a la orden {ctx['work_label']}.")
    if ctx['category']:
        lines.append(f"Categoría de servicio: {ctx['category']}.")
    lines.append('')
    return lines


def _servicios_clauses(ctx, brief, purpose, payment_terms):
    return [
        'II. OBJETO',
        f"Las partes convienen {ctx['service']}"
        + (f'. {purpose}' if purpose else '.'),
        '',
        'III. VIGENCIA',
        f"Del {ctx['start']} al {ctx['end']}.",
        '',
        'IV. CONTRAPRESTACIÓN',
        f"El importe es de {ctx['amount']}. "
        + (payment_terms or 'Las condiciones de pago se liquidarán según lo acordado por las partes.'),
        '',
        'V. OBLIGACIONES',
        'Cada parte cumplirá de buena fe las prestaciones a su cargo y colaborará para la ejecución del objeto.',
        '',
    ]


def _comodato_clauses(ctx, brief, purpose):
    lines = [
        'II. OBJETO',
        f"EL CONTRATANTE entrega en comodato {ctx['property_label']}, ubicado en {ctx['property_address']}, "
        f"para su uso gratuito y temporal"
        + (f'. {purpose}' if purpose else '.'),
        '',
        'III. VIGENCIA',
        f"El comodato rige del {ctx['start']} al {ctx['end']}. Al término, LA CONTRAPARTE devolverá el bien "
        'en el estado en que lo recibió, salvo el deterioro normal.',
        '',
        'IV. USO Y CONSERVACIÓN',
        'El comodatario usará el bien conforme a su naturaleza, no lo cederá a terceros y avisará de inmediato '
        'cualquier daño o requerimiento de conservación.',
        '',
        'V. GASTOS',
        'Salvo pacto en contrario, los gastos ordinarios de uso son a cargo del comodatario; las reparaciones '
        'extraordinarias, del comodante.',
    ]
    if brief.get('include_inventory'):
        lines.append('Se levantará inventario a la entrega y a la devolución.')
    lines.append('')
    return lines


def _promesa_clauses(ctx, brief, purpose, payment_terms):
    return [
        'II. OBJETO',
        f"Las partes se prometen celebrar un contrato de arrendamiento sobre {ctx['property_label']} "
        f"({ctx['property_address']})"
        + (f'. {purpose}' if purpose else '.'),
        '',
        'III. PLAZO PARA FORMALIZAR',
        f"La promesa estará vigente del {ctx['start']} al {ctx['end']}. Si en ese plazo no se firma el "
        'arrendamiento definitivo, esta promesa quedará sin efecto, salvo las penas que se pacten.',
        '',
        'IV. CONDICIONES ECONÓMICAS PREVISTAS',
        f"La renta proyectada es de {ctx['amount']} y el depósito de {ctx['deposit']}. "
        + (payment_terms or 'El resto de condiciones se recogerá en el contrato definitivo.'),
        '',
        'V. RESERVA',
        'Mientras esté vigente la promesa, EL CONTRATANTE se obliga a no ofrecer el inmueble a un tercero '
        'en las mismas condiciones, salvo incumplimiento de LA CONTRAPARTE.',
        '',
    ]


def presentation_html(contract):
    body = (contract.published_body or contract.body or '').strip()
    if not body:
        return ''
    safe = (
        body.replace('&', '&amp;')
        .replace('<', '&lt;')
        .replace('>', '&gt;')
    )
    paras = []
    for block in safe.split('\n\n'):
        inner = '<br/>'.join(line for line in block.split('\n'))
        paras.append(f'<p>{inner}</p>')
    title = (contract.title or KIND_TITLES.get(contract.kind, 'Contrato')).replace('&', '&amp;')
    return (
        f'<article class="homly-contract">'
        f'<header><h1>{title}</h1><div class="folio">{contract.code}</div></header>'
        f'{"".join(paras)}</article>'
    )
