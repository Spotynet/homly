"""
Expediente de períodos — catálogo y PDFs de respaldo por módulo.

Incluye el grupo Finanzas y el grupo Operación del espacio condominio.
"""
from __future__ import annotations

import base64
import calendar
import io
import logging
from datetime import date, datetime, time
from decimal import Decimal

from django.db.models import Prefetch
from django.utils import timezone

from .models import (
    AmenityReservation, BankStatement, ClosedPeriod,
    CondoMaintenanceEvidence, CondoMaintenanceWork, CondoPackage,
    CondoVisitAuth, GastoEntry, Payment, PaymentPlan,
)

logger = logging.getLogger(__name__)

DOC_DEFS = (
    # ── Finanzas ─────────────────────────────────────────────
    {
        'key': 'cierre',
        'group': 'finanzas',
        'module': 'cierre_periodo',
        'module_label': 'Periodos',
        'title': 'Informe consolidado de cierre',
        'description': 'Expediente completo del período (dashboard, reporte general, adeudos, gastos y caja chica).',
        'requires_closed': True,
    },
    {
        'key': 'cobranza',
        'group': 'finanzas',
        'module': 'cobranza',
        'module_label': 'Cobranza',
        'title': 'Ingresos y cobranza del período',
        'description': 'Pagos capturados en el período, con totales por forma de pago.',
        'requires_closed': False,
    },
    {
        'key': 'gastos',
        'group': 'finanzas',
        'module': 'gastos',
        'module_label': 'Gastos',
        'title': 'Egresos del período',
        'description': 'Listado de gastos conciliados y pendientes del período.',
        'requires_closed': False,
    },
    {
        'key': 'caja_chica',
        'group': 'finanzas',
        'module': 'caja_chica',
        'module_label': 'Caja Chica',
        'title': 'Caja chica del período',
        'description': 'Movimientos de caja chica registrados en el período.',
        'requires_closed': False,
    },
    {
        'key': 'reporte_general',
        'group': 'finanzas',
        'module': 'estado_cuenta',
        'module_label': 'Estado de Cuenta',
        'title': 'Reporte general del período',
        'description': 'Resumen financiero conciliado: ingresos, egresos y saldo del período.',
        'requires_closed': False,
    },
    {
        'key': 'adeudos',
        'group': 'finanzas',
        'module': 'estado_cuenta',
        'module_label': 'Estado de Cuenta',
        'title': 'Cartera de adeudos al corte',
        'description': 'Unidades con saldo pendiente al cierre del período seleccionado.',
        'requires_closed': False,
    },
    {
        'key': 'plan_pagos',
        'group': 'finanzas',
        'module': 'plan_pagos',
        'module_label': 'Plan de Pagos',
        'title': 'Cuotas de planes en el período',
        'description': 'Cuotas de planes de pago con vencimiento en este período.',
        'requires_closed': False,
    },
    {
        'key': 'estado_bancario',
        'group': 'finanzas',
        'module': 'estado_cuenta',
        'module_label': 'Estado de Cuenta',
        'title': 'Estado de cuenta bancario',
        'description': 'PDF del estado bancario cargado para este período (si existe).',
        'requires_closed': False,
        'is_upload': True,
    },
    # ── Operación ────────────────────────────────────────────
    {
        'key': 'reservas',
        'group': 'operacion',
        'module': 'reservas',
        'module_label': 'Reservas',
        'title': 'Reservas de áreas comunes',
        'description': 'Solicitudes y reservas del período (aprobadas, pendientes, rechazadas o canceladas).',
        'requires_closed': False,
    },
    {
        'key': 'paqueteria',
        'group': 'operacion',
        'module': 'paqueteria',
        'module_label': 'Paquetería',
        'title': 'Reporte de paquetería',
        'description': 'Paquetes recibidos en el período y su estado de entrega.',
        'requires_closed': False,
    },
    {
        'key': 'visitas',
        'group': 'operacion',
        'module': 'visitas',
        'module_label': 'Visitas Autorizadas',
        'title': 'Reporte de visitas autorizadas',
        'description': 'Autorizaciones creadas en el período e ingresos/salidas de caseta.',
        'requires_closed': False,
    },
    {
        'key': 'mantenimientos',
        'group': 'operacion',
        'module': 'mantenimientos',
        'module_label': 'Mantenimientos',
        'title': 'Historial de mantenimientos',
        'description': 'Trabajos de mantenimiento registrados en el período, con evidencias y costos.',
        'requires_closed': False,
    },
)


def _pay_label(code):
    return {
        'transferencia': 'Transferencia',
        'deposito': 'Depósito',
        'efectivo': 'Efectivo',
        'excento': 'Exento',
        'exento': 'Exento',
    }.get(code or '', code or '—')


def _payment_income(payment):
    from .views import _payment_total_income
    try:
        return float(_payment_total_income(payment) or 0)
    except Exception:
        total = Decimal('0')
        for fp in payment.field_payments.all():
            total += Decimal(str(fp.received or 0))
        return float(total)




def _period_bounds(period):
    """Inicio/fin del mes (date + datetime aware) para reportes operativos."""
    y, m = map(int, period.split('-')[:2])
    date_from = date(y, m, 1)
    date_to = date(y, m, calendar.monthrange(y, m)[1])
    tz = timezone.get_current_timezone()
    start = timezone.make_aware(datetime.combine(date_from, time.min), tz)
    end = timezone.make_aware(datetime.combine(date_to, time.max), tz)
    return date_from, date_to, start, end


def _reservation_report_payload(tenant, period):
    date_from, date_to, _start, _end = _period_bounds(period)
    qs = (
        AmenityReservation.objects.filter(tenant=tenant, date__gte=date_from, date__lte=date_to)
        .select_related('unit', 'requested_by')
        .order_by('date', 'start_time')
    )
    rows = list(qs)
    status_label = {
        'pending': 'Pendiente', 'approved': 'Aprobada',
        'rejected': 'Rechazada', 'cancelled': 'Cancelada',
    }
    counts = {k: 0 for k in status_label}
    items = []
    for r in rows:
        counts[r.status] = counts.get(r.status, 0) + 1
        unit = ''
        if r.unit_id:
            unit = f'{(r.unit.unit_name or "").strip()} ({(r.unit.unit_id_code or "").strip()})'.strip()
        items.append({
            'date_label': r.date.strftime('%d/%m/%Y') if r.date else '—',
            'time_label': f'{r.start_time.strftime("%H:%M") if r.start_time else "—"}–{r.end_time.strftime("%H:%M") if r.end_time else "—"}',
            'area_name': r.area_name or '—',
            'unit_label': unit or '—',
            'status_label': status_label.get(r.status, r.status or '—'),
            'requested_by': (getattr(r.requested_by, 'name', None) or getattr(r.requested_by, 'email', None) or '—') if r.requested_by_id else '—',
        })
    from .ops_reports import period_label as _pl
    return {
        'module': 'reservas',
        'title': 'Reporte de reservas de áreas comunes',
        'date_from': date_from.isoformat(),
        'date_to': date_to.isoformat(),
        'period_label': _pl(date_from, date_to),
        'summary': [
            {'key': 'total', 'label': 'Total', 'value': len(rows)},
            {'key': 'approved', 'label': 'Aprobadas', 'value': counts.get('approved', 0)},
            {'key': 'pending', 'label': 'Pendientes', 'value': counts.get('pending', 0)},
            {'key': 'rejected', 'label': 'Rechazadas', 'value': counts.get('rejected', 0) + counts.get('cancelled', 0)},
        ],
        'columns': [
            {'key': 'date_label', 'label': 'Fecha'},
            {'key': 'time_label', 'label': 'Horario'},
            {'key': 'area_name', 'label': 'Área'},
            {'key': 'unit_label', 'label': 'Unidad'},
            {'key': 'status_label', 'label': 'Estado'},
            {'key': 'requested_by', 'label': 'Solicitó'},
        ],
        'items': items[:2000],
        'total': len(rows),
        'note': 'Incluye reservas con fecha de uso dentro del período seleccionado.',
        'tenant_name': (tenant.razon_social or tenant.name or '').strip(),
    }


def _ops_counts(tenant, period):
    date_from, date_to, start, end = _period_bounds(period)
    reservas_n = AmenityReservation.objects.filter(
        tenant=tenant, date__gte=date_from, date__lte=date_to,
    ).count()
    paquetes_n = CondoPackage.objects.filter(
        tenant=tenant, received_at__gte=start, received_at__lte=end,
    ).count()
    visitas_n = CondoVisitAuth.objects.filter(
        tenant=tenant, created_at__gte=start, created_at__lte=end,
    ).count()
    from .mantenimientos import filter_works_by_period
    mant_n = filter_works_by_period(
        CondoMaintenanceWork.objects.filter(tenant=tenant), period,
    ).count()
    return {
        'reservas': reservas_n,
        'paqueteria': paquetes_n,
        'visitas': visitas_n,
        'mantenimientos': mant_n,
    }

def build_expediente_catalog(tenant, period):
    """Lista de documentos disponibles para un período."""
    from .closing_report import (
        _adeudos_slice, _caja_slice, _gastos_slice, _period_label, _report_slice,
    )

    closed = ClosedPeriod.objects.filter(tenant=tenant, period=period).select_related('closed_by').first()
    is_closed = closed is not None

    payments = list(
        Payment.objects.filter(tenant=tenant, period=period)
        .select_related('unit')
        .prefetch_related('field_payments')
    )
    cobranza_total = sum(_payment_income(p) for p in payments)
    gastos = _gastos_slice(tenant, period)
    caja = _caja_slice(tenant, period)
    report = _report_slice(tenant, period)
    adeudos = _adeudos_slice(tenant, period)

    plan_count = 0
    for plan in PaymentPlan.objects.filter(tenant=tenant, status__in=('accepted', 'completed', 'draft', 'proposed')):
        for inst in (plan.installments or []):
            if inst.get('period_key') == period:
                plan_count += 1
                break

    bank = BankStatement.objects.filter(tenant=tenant, period=period).first()
    has_bank = bool(
        bank and (
            (getattr(bank, 'statement_file', None) and getattr(bank.statement_file, 'name', ''))
            or (bank.file_data or '').strip()
        )
    )

    ops_counts = _ops_counts(tenant, period)

    docs = []
    for d in DOC_DEFS:
        key = d['key']
        available = True
        count = None
        detail = ''
        if key == 'cierre':
            available = is_closed
            detail = 'Disponible cuando el período está cerrado' if not is_closed else (
                f'Cerrado por {(closed.closed_by.name if closed.closed_by else "—")}'
            )
            count = 1 if is_closed else 0
        elif key == 'cobranza':
            count = len(payments)
            available = count > 0
            detail = f'{count} pago(s) · ${_fmt(cobranza_total)}'
        elif key == 'gastos':
            count = len(gastos.get('conciliados') or []) + len(gastos.get('no_conciliados') or [])
            available = count > 0
            detail = f'{count} gasto(s) · ${_fmt((gastos.get("total_conciliados") or 0) + (gastos.get("total_no_conciliados") or 0))}'
        elif key == 'caja_chica':
            count = len(caja.get('rows') or [])
            available = count > 0
            detail = f'{count} movimiento(s) · ${_fmt(caja.get("total") or 0)}'
        elif key == 'reporte_general':
            available = True
            count = 1
            rd = report.get('report_data') or {}
            detail = f'Saldo ${_fmt(report.get("saldo_final"))} · Ingresos ${_fmt(rd.get("total_ingresos_reconciled"))}'
        elif key == 'adeudos':
            count = adeudos.get('units_with_debt') or 0
            available = count > 0
            detail = f'{count} unidad(es) · ${_fmt(adeudos.get("grand_total") or 0)}'
        elif key == 'plan_pagos':
            count = plan_count
            available = count > 0
            detail = f'{count} plan(es) con cuota en el período'
        elif key == 'estado_bancario':
            available = has_bank
            count = 1 if has_bank else 0
            detail = 'PDF cargado' if has_bank else 'Sin estado bancario cargado'
        elif key in ('reservas', 'paqueteria', 'visitas', 'mantenimientos'):
            count = ops_counts.get(key, 0)
            available = count > 0
            noun = {
                'reservas': 'reserva(s)',
                'paqueteria': 'paquete(s)',
                'visitas': 'autorización(es)',
                'mantenimientos': 'trabajo(s)',
            }[key]
            detail = f'{count} {noun} en el período' if available else f'Sin {noun} en el período'

        docs.append({
            **d,
            'available': available,
            'count': count,
            'detail': detail,
        })

    return {
        'period': period,
        'period_label': _period_label(period),
        'is_closed': is_closed,
        'closed_at': closed.closed_at.isoformat() if closed and closed.closed_at else None,
        'documents': docs,
    }


def _fmt(n):
    try:
        return f'{float(n or 0):,.2f}'
    except Exception:
        return '0.00'


def get_bank_statement_bytes(tenant, period):
    bank = BankStatement.objects.filter(tenant=tenant, period=period).first()
    if not bank:
        return None, None
    name = f'Estado_bancario_{period}.pdf'
    sf = getattr(bank, 'statement_file', None)
    if sf and getattr(sf, 'name', ''):
        try:
            sf.open('rb')
            data = sf.read()
            sf.close()
            if data:
                fname = (sf.name or name).split('/')[-1]
                return data, fname
        except Exception:
            logger.exception('No se pudo leer statement_file %s %s', tenant.id, period)
    raw = (bank.file_data or '').strip()
    if not raw:
        return None, None
    try:
        if ',' in raw and raw.lower().startswith('data:'):
            raw = raw.split(',', 1)[1]
        return base64.b64decode(raw), name
    except Exception:
        logger.exception('file_data inválido estado bancario %s %s', tenant.id, period)
        return None, None


def generate_expediente_doc_pdf(tenant, period, doc_key, generated_by=None):
    """Genera PDF de un documento del expediente. Retorna bytes o None."""
    from .closing_report import (
        NumberedCanvas, _adeudos_slice, _caja_slice, _esc, _gastos_slice,
        _hex, _logo_reader, _money, _period_label, _period_short, _report_slice,
        generate_closing_report_pdf,
    )

    if doc_key == 'cierre':
        cp = ClosedPeriod.objects.filter(tenant=tenant, period=period).select_related('closed_by').first()
        if not cp:
            raise ValueError('El período no está cerrado.')
        return generate_closing_report_pdf(tenant, period, closed_period=cp, generated_by=generated_by)

    if doc_key == 'estado_bancario':
        data, _name = get_bank_statement_bytes(tenant, period)
        if not data:
            raise ValueError('No hay estado bancario para este período.')
        return data

    if doc_key in ('reservas', 'paqueteria', 'visitas', 'mantenimientos'):
        return _generate_ops_expediente_pdf(tenant, period, doc_key, generated_by=generated_by)

    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.units import cm
        from reportlab.platypus import (
            SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable,
        )
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.enums import TA_LEFT, TA_RIGHT, TA_CENTER
    except ImportError:
        logger.exception('ReportLab no disponible')
        return None

    NAVY = '#0F3D3E'
    TEAL = '#0F766E'
    INK = '#1A1612'
    INK_MED = '#443D33'
    INK_LIGHT = '#7A7165'
    WHITE = '#FFFFFF'
    LINE = '#E7DFD3'
    CORAL = '#E11D48'

    cur = getattr(tenant, 'currency', None) or 'MXN'
    m = lambda n: _money(n, cur)
    page_w, page_h = A4
    margin_h = 1.6 * cm
    content_w = page_w - 2 * margin_h
    tenant_name = (tenant.razon_social or tenant.name or 'Condominio').strip()
    generated_by = (generated_by or '').strip() or '—'
    gen_label = timezone.localtime(timezone.now()).strftime('%d/%m/%Y %H:%M')
    logo = _logo_reader(tenant)
    title_map = {d['key']: d['title'] for d in DOC_DEFS}
    doc_title = title_map.get(doc_key, 'Documento del período')

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=A4,
        leftMargin=margin_h, rightMargin=margin_h,
        topMargin=3.2 * cm, bottomMargin=2.0 * cm,
        title=f'{doc_title} — {_period_label(period)}',
        author=generated_by if generated_by != '—' else 'Homly',
        subject=f'Expediente {period} — {tenant_name}',
    )
    styles = getSampleStyleSheet()

    def S(name, **kw):
        return ParagraphStyle(name, parent=styles['Normal'], **kw)

    st_h1 = S('h1', fontName='Helvetica-Bold', fontSize=14, textColor=_hex(NAVY), leading=18, spaceAfter=4)
    st_h2 = S('h2', fontName='Helvetica-Bold', fontSize=10, textColor=_hex(TEAL), leading=13, spaceBefore=8, spaceAfter=4)
    st_body = S('body', fontName='Helvetica', fontSize=9, textColor=_hex(INK_MED), leading=12, spaceAfter=6)
    st_muted = S('mut', fontName='Helvetica-Oblique', fontSize=8, textColor=_hex(INK_LIGHT), leading=11)
    st_th = S('th', fontName='Helvetica-Bold', fontSize=7, textColor=_hex(WHITE), leading=9)
    st_td = S('td', fontName='Helvetica', fontSize=7.5, textColor=_hex(INK), leading=10)
    st_tdr = S('tdr', fontName='Helvetica', fontSize=7.5, textColor=_hex(INK), leading=10, alignment=TA_RIGHT)

    def header_footer(canvas, _doc):
        canvas.saveState()
        canvas.setFillColor(_hex(NAVY))
        canvas.rect(0, page_h - 2.9 * cm, page_w, 2.9 * cm, fill=1, stroke=0)
        canvas.setFillColor(_hex(TEAL))
        canvas.rect(0, page_h - 3.0 * cm, page_w, 0.1 * cm, fill=1, stroke=0)
        x = margin_h
        if logo:
            try:
                canvas.drawImage(logo, x, page_h - 2.55 * cm, width=1.7 * cm, height=1.7 * cm, mask='auto', preserveAspectRatio=True, anchor='c')
                x += 2.0 * cm
            except Exception:
                pass
        canvas.setFillColor(_hex(WHITE))
        canvas.setFont('Helvetica-Bold', 11)
        canvas.drawString(x, page_h - 1.15 * cm, tenant_name[:55])
        canvas.setFont('Helvetica', 8)
        canvas.drawString(x, page_h - 1.55 * cm, f'Expediente de períodos · {_period_label(period)}')
        canvas.setFont('Helvetica', 7.5)
        canvas.setFillColor(_hex('#B7C9C8'))
        canvas.drawString(x, page_h - 1.95 * cm, f'Generado {_esc(gen_label)} · {_esc(generated_by)}')
        canvas.setFillColor(_hex(INK_LIGHT))
        canvas.setFont('Helvetica', 7)
        canvas.drawString(margin_h, 1.0 * cm, 'Homly · Respaldo financiero del período')
        canvas.drawRightString(page_w - margin_h, 1.0 * cm, f'Pág. {_doc.page}')
        canvas.restoreState()

    def data_table(headers, rows, widths):
        data = [[Paragraph(_esc(h), st_th) for h in headers]]
        for row in rows:
            cells = []
            for i, cell in enumerate(row):
                style = st_tdr if i == len(row) - 1 and i > 0 else st_td
                cells.append(Paragraph(_esc(str(cell)), style))
            data.append(cells)
        t = Table(data, colWidths=widths, repeatRows=1)
        t.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), _hex(NAVY)),
            ('TEXTCOLOR', (0, 0), (-1, 0), _hex(WHITE)),
            ('BACKGROUND', (0, 1), (-1, -1), _hex(WHITE)),
            ('GRID', (0, 0), (-1, -1), 0.4, _hex(LINE)),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('LEFTPADDING', (0, 0), (-1, -1), 4),
            ('RIGHTPADDING', (0, 0), (-1, -1), 4),
            ('TOPPADDING', (0, 0), (-1, -1), 3),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [_hex(WHITE), _hex('#F8F5F0')]),
        ]))
        return t

    story = []
    story.append(Paragraph(_esc(doc_title), st_h1))
    story.append(Paragraph(
        f'{_esc(tenant_name)} · Período {_esc(_period_label(period))} · Respaldo del expediente financiero',
        st_muted,
    ))
    story.append(Spacer(1, 6))
    story.append(HRFlowable(width='100%', thickness=1, color=_hex(TEAL), spaceAfter=10))

    if doc_key == 'cobranza':
        payments = list(
            Payment.objects.filter(tenant=tenant, period=period)
            .select_related('unit')
            .prefetch_related('field_payments')
            .order_by('unit__unit_id_code')
        )
        by_type = {}
        rows = []
        total = 0.0
        for p in payments:
            amt = _payment_income(p)
            total += amt
            pt = _pay_label(p.payment_type)
            by_type[pt] = by_type.get(pt, 0) + amt
            rows.append([
                p.unit.unit_id_code if p.unit else '—',
                (p.unit.unit_name if p.unit else '')[:28],
                (p.status or '—').capitalize(),
                pt,
                str(p.payment_date or '—'),
                m(amt),
            ])
        story.append(Paragraph(f'Total cobranza del período: <b>{m(total)}</b> · {len(payments)} pago(s)', st_body))
        if by_type:
            story.append(Paragraph('Por forma de pago', st_h2))
            story.append(data_table(
                ['Forma de pago', 'Monto'],
                [[k, m(v)] for k, v in sorted(by_type.items())],
                [content_w * 0.55, content_w * 0.45],
            ))
            story.append(Spacer(1, 8))
        story.append(Paragraph('Detalle de pagos', st_h2))
        if rows:
            story.append(data_table(
                ['Unidad', 'Nombre', 'Estatus', 'Forma', 'Fecha', 'Monto'],
                rows,
                [content_w * x for x in (0.12, 0.24, 0.14, 0.16, 0.14, 0.20)],
            ))
        else:
            story.append(Paragraph('Sin pagos registrados en este período.', st_muted))

    elif doc_key == 'gastos':
        gr = _gastos_slice(tenant, period)
        story.append(Paragraph(
            f'Conciliados {m(gr["total_conciliados"])} · No conciliados {m(gr["total_no_conciliados"])}',
            st_body,
        ))
        for label, key in (('Gastos conciliados', 'conciliados'), ('Gastos no conciliados', 'no_conciliados')):
            story.append(Paragraph(label, st_h2))
            items = gr.get(key) or []
            if not items:
                story.append(Paragraph('Sin registros.', st_muted))
                continue
            rows = [[
                (g.get('date') or '—'),
                (g.get('category') or '—')[:18],
                (g.get('notes') or g.get('description') or g.get('label') or '—')[:40],
                (g.get('provider') or '—')[:18],
                m(g.get('amount')),
            ] for g in items]
            story.append(data_table(
                ['Fecha', 'Categoría', 'Concepto', 'Proveedor', 'Monto'],
                rows,
                [content_w * x for x in (0.14, 0.16, 0.34, 0.18, 0.18)],
            ))

    elif doc_key == 'caja_chica':
        caja = _caja_slice(tenant, period)
        story.append(Paragraph(f'Total caja chica: <b>{m(caja.get("total"))}</b>', st_body))
        rows = [[
            (r.get('date') or '—'),
            (r.get('description') or '—')[:48],
            (r.get('payment_type') or '—'),
            m(r.get('amount')),
        ] for r in (caja.get('rows') or [])]
        if rows:
            story.append(data_table(
                ['Fecha', 'Concepto', 'Forma', 'Monto'],
                rows,
                [content_w * x for x in (0.16, 0.48, 0.18, 0.18)],
            ))
        else:
            story.append(Paragraph('Sin movimientos de caja chica en este período.', st_muted))

    elif doc_key == 'reporte_general':
        sl = _report_slice(tenant, period)
        rd = sl.get('report_data') or {}
        story.append(Paragraph('Resumen conciliado del período', st_h2))
        rows = [
            ['Ingresos conciliados', m(rd.get('total_ingresos_reconciled'))],
            ['Egresos conciliados', m(rd.get('total_egresos_reconciled'))],
            ['Saldo del período', m(sl.get('saldo_final'))],
            ['Saldo inicial', m(sl.get('saldo_inicial'))],
            ['Ingresos no conciliados', m(rd.get('ingresos_no_reconciled'))],
            ['Egresos no conciliados', m(rd.get('total_cheques_transito'))],
        ]
        story.append(data_table(['Concepto', 'Monto'], rows, [content_w * 0.6, content_w * 0.4]))
        conceptos = rd.get('ingresos_conceptos') or {}
        if isinstance(conceptos, dict) and conceptos:
            story.append(Paragraph('Ingresos por concepto', st_h2))
            story.append(data_table(
                ['Concepto', 'Monto'],
                [[k, m((v or {}).get('total') if isinstance(v, dict) else v)] for k, v in conceptos.items()],
                [content_w * 0.6, content_w * 0.4],
            ))

    elif doc_key == 'adeudos':
        ad = _adeudos_slice(tenant, period)
        story.append(Paragraph(
            f'Unidades con adeudo: <b>{ad.get("units_with_debt") or 0}</b> · '
            f'Total cartera: <b>{m(ad.get("grand_total"))}</b>',
            st_body,
        ))
        rows = []
        for u in ad.get('units') or []:
            periods = ', '.join(_period_short(p['period']) for p in (u.get('period_debts') or [])[:6])
            if len(u.get('period_debts') or []) > 6:
                periods += '…'
            rows.append([
                u.get('code') or '',
                (u.get('name') or '')[:22],
                (u.get('responsible') or '')[:22],
                periods or '—',
                m(u.get('total_adeudo')),
            ])
        if rows:
            story.append(data_table(
                ['Unidad', 'Nombre', 'Responsable', 'Períodos', 'Adeudo'],
                rows,
                [content_w * x for x in (0.12, 0.22, 0.22, 0.24, 0.20)],
            ))
        else:
            story.append(Paragraph('No hay unidades con adeudo al corte de este período.', st_muted))

    elif doc_key == 'plan_pagos':
        rows = []
        for plan in PaymentPlan.objects.filter(tenant=tenant).select_related('unit').order_by('unit__unit_id_code'):
            for inst in (plan.installments or []):
                if inst.get('period_key') != period:
                    continue
                rows.append([
                    plan.unit.unit_id_code if plan.unit else '—',
                    (plan.unit.unit_name if plan.unit else '')[:20],
                    (plan.get_status_display() if hasattr(plan, 'get_status_display') else plan.status) or '—',
                    f"Cuota {inst.get('num') or '—'}",
                    (inst.get('status') or '—'),
                    m(inst.get('total') or inst.get('amount') or 0),
                    m(inst.get('paid_amount') or 0),
                ])
        story.append(Paragraph(f'{len(rows)} cuota(s) con vencimiento en el período', st_body))
        if rows:
            story.append(data_table(
                ['Unidad', 'Nombre', 'Plan', 'Cuota', 'Estatus', 'Total', 'Pagado'],
                rows,
                [content_w * x for x in (0.11, 0.18, 0.14, 0.12, 0.12, 0.16, 0.17)],
            ))
        else:
            story.append(Paragraph('No hay cuotas de planes con vencimiento en este período.', st_muted))

    else:
        raise ValueError(f'Documento no reconocido: {doc_key}')

    story.append(Spacer(1, 14))
    story.append(Paragraph(
        'Documento de respaldo generado desde el Expediente de Períodos. '
        'Conserve este archivo junto con el resto del expediente del mes.',
        st_muted,
    ))

    doc.build(story, onFirstPage=header_footer, onLaterPages=header_footer, canvasmaker=NumberedCanvas)
    return buffer.getvalue()


def _generate_ops_expediente_pdf(tenant, period, doc_key, generated_by=None):
    """PDFs del grupo Operación reutilizando los generadores de cada módulo."""
    generated_by = (generated_by or '').strip() or '—'

    if doc_key == 'mantenimientos':
        from .mantenimientos import filter_works_by_period
        from .mantenimiento_docs import generate_history_pdf
        ev_qs = CondoMaintenanceEvidence.objects.select_related('uploaded_by').order_by(
            'captured_at', 'created_at', 'id',
        )
        gasto_qs = GastoEntry.objects.select_related('field').order_by('-gasto_date', '-created_at')
        qs = CondoMaintenanceWork.objects.filter(tenant=tenant).select_related(
            'created_by', 'provider',
        ).prefetch_related(
            Prefetch('evidences', queryset=ev_qs),
            Prefetch('gasto_entries', queryset=gasto_qs),
        )
        works = list(filter_works_by_period(qs, period))
        if not works:
            raise ValueError('No hay trabajos de mantenimiento en este período.')
        pdf_bytes = generate_history_pdf(
            tenant, works, generated_by=generated_by, period=period,
        )
        if not pdf_bytes:
            raise ValueError('No se pudo generar el historial de mantenimientos.')
        return pdf_bytes

    from .ops_reports import (
        generate_ops_report_pdf, package_report_payload, visit_report_payload,
    )
    date_from, date_to, start, end = _period_bounds(period)

    if doc_key == 'reservas':
        payload = _reservation_report_payload(tenant, period)
        if not payload.get('total'):
            raise ValueError('No hay reservas en este período.')
    elif doc_key == 'paqueteria':
        qs = CondoPackage.objects.filter(tenant=tenant).select_related(
            'unit', 'received_by', 'delivered_by',
        )
        payload = package_report_payload(qs, date_from, date_to, start, end)
        payload['tenant_name'] = (tenant.razon_social or tenant.name or '').strip()
        if not payload.get('total'):
            raise ValueError('No hay paquetes recibidos en este período.')
    elif doc_key == 'visitas':
        qs = CondoVisitAuth.objects.filter(tenant=tenant).select_related('unit', 'created_by')
        payload = visit_report_payload(qs, date_from, date_to, start, end)
        payload['tenant_name'] = (tenant.razon_social or tenant.name or '').strip()
        if not payload.get('total'):
            raise ValueError('No hay autorizaciones de visita en este período.')
    else:
        raise ValueError(f'Documento operativo no reconocido: {doc_key}')

    pdf_bytes = generate_ops_report_pdf(tenant, payload, generated_by)
    if not pdf_bytes:
        raise ValueError('No se pudo generar el reporte operativo.')
    return pdf_bytes
