"""Reportes operativos de Paquetería y Visitas Autorizadas (JSON + PDF)."""
from __future__ import annotations

import io
import logging
import re
from datetime import datetime, time

from django.http import HttpResponse
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from .closing_report import NumberedCanvas, _dt_es, _esc, _hex, _homly_logo_reader, _logo_reader
from .models import CondoVisitAuth, CondoVisitEvent

logger = logging.getLogger(__name__)

TEAL = '#0d7c6e'
NAVY = '#1b2a4a'
INK = '#1c1917'
INK_MED = '#44403c'
INK_LIGHT = '#78716c'
SAND = '#f7f4ee'
RULE = '#d6cfc2'
WHITE = '#ffffff'
GOLD = '#b08d57'


def parse_report_range(request):
    today = timezone.localdate()
    raw_from = (request.query_params.get('date_from') or '').strip()
    raw_to = (request.query_params.get('date_to') or '').strip()
    try:
        date_from = datetime.strptime(raw_from, '%Y-%m-%d').date() if raw_from else today.replace(day=1)
    except ValueError:
        raise ValidationError({'date_from': 'Usa el formato AAAA-MM-DD.'})
    try:
        date_to = datetime.strptime(raw_to, '%Y-%m-%d').date() if raw_to else today
    except ValueError:
        raise ValidationError({'date_to': 'Usa el formato AAAA-MM-DD.'})
    if date_to < date_from:
        raise ValidationError({'date_to': 'La fecha final debe ser igual o posterior a la inicial.'})
    if (date_to - date_from).days > 366:
        raise ValidationError({'date_to': 'El periodo no puede superar 12 meses.'})
    tz = timezone.get_current_timezone()
    start = timezone.make_aware(datetime.combine(date_from, time.min), tz)
    end = timezone.make_aware(datetime.combine(date_to, time.max), tz)
    return date_from, date_to, start, end


def period_label(date_from, date_to):
    def fmt(d):
        return d.strftime('%d/%m/%Y')
    return f'{fmt(date_from)} — {fmt(date_to)}'


def generated_by(request):
    user = getattr(request, 'user', None)
    if not user or not getattr(user, 'is_authenticated', False):
        return '—'
    return (getattr(user, 'name', None) or getattr(user, 'email', None) or '—').strip()


def _dt_short(value):
    if not value:
        return '—'
    if timezone.is_aware(value):
        value = timezone.localtime(value)
    return value.strftime('%d/%m/%Y %H:%M')


def _unit_label(obj):
    name = (getattr(obj.unit, 'unit_name', None) or '').strip()
    code = (getattr(obj.unit, 'unit_id_code', None) or '').strip()
    if name and code:
        return f'{name} ({code})'
    return name or code or '—'


def _safe_filename(text, fallback='reporte'):
    raw = (text or fallback).strip() or fallback
    raw = re.sub(r'[^\w\s\-áéíóúÁÉÍÓÚñÑ.]', '', raw, flags=re.UNICODE)
    raw = re.sub(r'\s+', '_', raw)[:80]
    return raw or fallback


def _actor(user):
    if not user:
        return '—'
    return (getattr(user, 'name', None) or getattr(user, 'email', None) or '—').strip()


def pdf_response(pdf_bytes, filename):
    if not pdf_bytes:
        return None
    response = HttpResponse(pdf_bytes, content_type='application/pdf')
    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    return response


def package_report_payload(qs, date_from, date_to, start, end):
    received = list(qs.filter(received_at__gte=start, received_at__lte=end).order_by('-received_at', '-folio'))
    delivered_in_period = qs.filter(delivered_at__gte=start, delivered_at__lte=end).count()
    pending = sum(1 for p in received if p.status != 'entregado')
    delivered = sum(1 for p in received if p.status == 'entregado')
    items = [{
        'id': str(p.id),
        'folio': p.folio,
        'status': p.status,
        'status_label': 'Entregado' if p.status == 'entregado' else 'En vigilancia',
        'unit_name': p.unit.unit_name if p.unit_id else '',
        'unit_code': p.unit.unit_id_code if p.unit_id else '',
        'unit_label': _unit_label(p),
        'receive_notes': p.receive_notes or '',
        'received_at': p.received_at.isoformat() if p.received_at else None,
        'received_at_label': _dt_short(p.received_at),
        'received_by_name': _actor(p.received_by),
        'delivered_at': p.delivered_at.isoformat() if p.delivered_at else None,
        'delivered_at_label': _dt_short(p.delivered_at) if p.delivered_at else '—',
        'delivered_by_name': _actor(p.delivered_by) if p.delivered_at else '—',
        'delivery_method_label': (
            'Código QR' if p.delivery_method == 'qr'
            else 'Firma' if p.delivery_method == 'firma'
            else ''
        ),
    } for p in received[:2000]]
    return {
        'module': 'paqueteria',
        'title': 'Reporte de paquetería',
        'date_from': date_from.isoformat(),
        'date_to': date_to.isoformat(),
        'period_label': period_label(date_from, date_to),
        'summary': [
            {'key': 'recibidos', 'label': 'Recibidos', 'value': len(received)},
            {'key': 'en_vigilancia', 'label': 'En vigilancia', 'value': pending},
            {'key': 'entregados', 'label': 'Entregados', 'value': delivered},
            {'key': 'entregas_periodo', 'label': 'Entregas en el periodo', 'value': delivered_in_period},
        ],
        'columns': [
            {'key': 'folio', 'label': 'Folio'},
            {'key': 'unit_label', 'label': 'Unidad'},
            {'key': 'status_label', 'label': 'Estado'},
            {'key': 'received_at_label', 'label': 'Recepción'},
            {'key': 'delivered_at_label', 'label': 'Entrega'},
            {'key': 'received_by_name', 'label': 'Recibió'},
        ],
        'items': items,
        'total': len(received),
        'note': 'La lista incluye paquetes recibidos en el periodo. Las entregas del periodo pueden incluir paquetes recibidos antes.',
    }


def visit_report_payload(qs, date_from, date_to, start, end):
    created = list(qs.filter(created_at__gte=start, created_at__lte=end).order_by('-created_at', '-folio'))
    visit_ids = qs.values_list('id', flat=True)
    ingresos = CondoVisitEvent.objects.filter(
        visit_id__in=visit_ids, event_type='ingreso', created_at__gte=start, created_at__lte=end,
    ).count()
    salidas = CondoVisitEvent.objects.filter(
        visit_id__in=visit_ids, event_type='salida', created_at__gte=start, created_at__lte=end,
    ).count()
    counts = {
        'permanente': 0,
        'ocasional': 0,
        'vigente': 0,
        'en_condominio': 0,
        'cancelada': 0,
    }
    for v in created:
        if v.kind in counts:
            counts[v.kind] += 1
        if v.status in counts:
            counts[v.status] += 1
        if v.currently_inside:
            counts['en_condominio'] += 1
    items = [{
        'id': str(v.id),
        'folio': v.folio,
        'kind': v.kind,
        'kind_label': 'Permanente' if v.kind == 'permanente' else 'Ocasional',
        'status': v.status,
        'status_label': dict(CondoVisitAuth.STATUS_CHOICES).get(v.status, v.status),
        'visitor_name': v.visitor_full_name,
        'host_name': v.host_name or '',
        'unit_name': v.unit.unit_name if v.unit_id else '',
        'unit_code': v.unit.unit_id_code if v.unit_id else '',
        'unit_label': _unit_label(v),
        'currently_inside': v.currently_inside,
        'visits_used': v.visits_used or 0,
        'created_at': v.created_at.isoformat() if v.created_at else None,
        'created_at_label': _dt_short(v.created_at),
        'valid_from': v.valid_from.isoformat() if v.valid_from else None,
        'valid_until': v.valid_until.isoformat() if v.valid_until else None,
        'valid_label': (
            f'{v.valid_from.strftime("%d/%m/%Y") if v.valid_from else "—"}'
            f' — {v.valid_until.strftime("%d/%m/%Y") if v.valid_until else "—"}'
        ),
    } for v in created[:2000]]
    return {
        'module': 'visitas',
        'title': 'Reporte de visitas autorizadas',
        'date_from': date_from.isoformat(),
        'date_to': date_to.isoformat(),
        'period_label': period_label(date_from, date_to),
        'summary': [
            {'key': 'autorizaciones', 'label': 'Autorizaciones', 'value': len(created)},
            {'key': 'permanentes', 'label': 'Permanentes', 'value': counts['permanente']},
            {'key': 'ocasionales', 'label': 'Ocasionales', 'value': counts['ocasional']},
            {'key': 'ingresos', 'label': 'Ingresos en el periodo', 'value': ingresos},
            {'key': 'salidas', 'label': 'Salidas en el periodo', 'value': salidas},
        ],
        'columns': [
            {'key': 'folio', 'label': 'Folio'},
            {'key': 'visitor_name', 'label': 'Visitante'},
            {'key': 'unit_label', 'label': 'Unidad'},
            {'key': 'kind_label', 'label': 'Tipo'},
            {'key': 'status_label', 'label': 'Estado'},
            {'key': 'created_at_label', 'label': 'Registrada'},
        ],
        'items': items,
        'total': len(created),
        'note': 'La lista incluye autorizaciones creadas en el periodo. Ingresos y salidas cuentan movimientos de caseta en esas fechas.',
    }


def generate_ops_report_pdf(tenant, payload, generated_by_name='') -> bytes | None:
    try:
        from reportlab.lib.enums import TA_CENTER
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import ParagraphStyle
        from reportlab.lib.units import cm
        from reportlab.platypus import (
            Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle,
        )
    except ImportError:
        logger.exception('ReportLab no disponible')
        return None

    generated_at = timezone.localtime(timezone.now())
    generated_by_name = (generated_by_name or '').strip() or '—'
    tenant_name = (getattr(tenant, 'razon_social', None) or tenant.name or 'Condominio').strip()
    page_w, _page_h = A4
    margin_h = 1.7 * cm
    buffer = io.BytesIO()

    def draw_chrome(canvas, doc):
        page_w, page_h = A4
        canvas.saveState()
        canvas.setFillColor(_hex(NAVY))
        canvas.rect(0, page_h - 0.26 * cm, page_w, 0.26 * cm, fill=1, stroke=0)
        canvas.setFillColor(_hex(GOLD))
        canvas.rect(0, page_h - 0.34 * cm, page_w, 0.08 * cm, fill=1, stroke=0)
        logo = _logo_reader(tenant)
        text_x = margin_h
        if logo:
            try:
                canvas.drawImage(
                    logo, margin_h, page_h - 2.55 * cm,
                    width=1.35 * cm, height=1.35 * cm,
                    mask='auto', preserveAspectRatio=True, anchor='c',
                )
                text_x = margin_h + 1.6 * cm
            except Exception:
                text_x = margin_h
        canvas.setFillColor(_hex(NAVY))
        canvas.setFont('Times-Bold', 12)
        canvas.drawString(text_x, page_h - 1.45 * cm, tenant_name[:70])
        canvas.setFillColor(_hex(INK_LIGHT))
        canvas.setFont('Times-Roman', 8)
        canvas.drawString(text_x, page_h - 1.85 * cm, payload.get('title') or 'Reporte')
        canvas.setStrokeColor(_hex(NAVY))
        canvas.setLineWidth(0.7)
        canvas.line(margin_h, page_h - 2.85 * cm, page_w - margin_h, page_h - 2.85 * cm)
        canvas.setFillColor(_hex(SAND))
        canvas.rect(0, 0, page_w, 1.55 * cm, fill=1, stroke=0)
        canvas.setFillColor(_hex(NAVY))
        canvas.rect(0, 1.55 * cm, page_w, 0.05 * cm, fill=1, stroke=0)
        homly = _homly_logo_reader()
        foot_x = margin_h
        if homly:
            try:
                canvas.drawImage(
                    homly, margin_h, 0.55 * cm,
                    width=1.35 * cm, height=0.72 * cm,
                    mask='auto', preserveAspectRatio=True, anchor='c',
                )
                foot_x = margin_h + 1.55 * cm
            except Exception:
                foot_x = margin_h
        canvas.setFillColor(_hex(INK_LIGHT))
        canvas.setFont('Times-Roman', 7.5)
        canvas.drawString(foot_x, 0.85 * cm, f'Generado {_dt_es(generated_at)} · {generated_by_name}')
        canvas.restoreState()

    styles = {
        'kicker': ParagraphStyle('kicker', fontName='Times-Bold', fontSize=8, textColor=_hex(TEAL), letterSpacing=0.6),
        'title': ParagraphStyle('title', fontName='Times-Bold', fontSize=16, textColor=_hex(NAVY), leading=20, spaceAfter=4),
        'sub': ParagraphStyle('sub', fontName='Times-Roman', fontSize=10, textColor=_hex(INK_MED), leading=14, spaceAfter=10),
        'note': ParagraphStyle('note', fontName='Times-Italic', fontSize=8, textColor=_hex(INK_LIGHT), leading=11, spaceBefore=8),
        'th': ParagraphStyle('th', fontName='Helvetica-Bold', fontSize=7.5, textColor=_hex(WHITE), leading=10),
        'td': ParagraphStyle('td', fontName='Helvetica', fontSize=7.5, textColor=_hex(INK), leading=10),
        'kpi_l': ParagraphStyle('kpi_l', fontName='Helvetica', fontSize=7, textColor=_hex(INK_LIGHT), alignment=TA_CENTER, leading=9),
        'kpi_v': ParagraphStyle('kpi_v', fontName='Times-Bold', fontSize=14, textColor=_hex(NAVY), alignment=TA_CENTER, leading=16),
        'cell': ParagraphStyle('cell', fontName='Helvetica', fontSize=7.5, textColor=_hex(INK), leading=10),
    }

    usable = page_w - 2 * margin_h
    summary = payload.get('summary') or []
    kpi_data = [[
        [Paragraph(_esc(s.get('label')), styles['kpi_l']), Paragraph(str(s.get('value') or 0), styles['kpi_v'])]
        for s in summary
    ]]
    kpi_w = usable / max(len(summary), 1)
    kpi = Table(kpi_data, colWidths=[kpi_w] * len(summary)) if summary else None
    if kpi:
        kpi.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), _hex(SAND)),
            ('BOX', (0, 0), (-1, -1), 0.4, _hex(RULE)),
            ('INNERGRID', (0, 0), (-1, -1), 0.3, _hex(RULE)),
            ('TOPPADDING', (0, 0), (-1, -1), 8),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ('LEFTPADDING', (0, 0), (-1, -1), 4),
            ('RIGHTPADDING', (0, 0), (-1, -1), 4),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ]))

    columns = payload.get('columns') or []
    items = payload.get('items') or []
    header = [Paragraph(_esc(c['label']), styles['th']) for c in columns]
    rows = [header]
    for item in items:
        rows.append([Paragraph(_esc(item.get(c['key']) or '—'), styles['cell']) for c in columns])
    empty = len(items) == 0
    if empty:
        rows.append([Paragraph('Sin registros en el periodo seleccionado.', styles['cell'])] + [''] * max(len(columns) - 1, 0))

    n = max(len(columns), 1)
    col_w = [usable / n] * n
    if n >= 6:
        col_w = [2.3 * cm, 4.2 * cm, 2.4 * cm, 2.6 * cm, 3.0 * cm, 2.8 * cm]
        col_w = col_w[:n]
        leftover = usable - sum(col_w)
        if leftover:
            col_w[1] += leftover
    styles_tbl = [
        ('BACKGROUND', (0, 0), (-1, 0), _hex(NAVY)),
        ('TEXTCOLOR', (0, 0), (-1, 0), _hex(WHITE)),
        ('BACKGROUND', (0, 1), (-1, -1), _hex(WHITE)),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [_hex(WHITE), _hex('#fbfaf7')]),
        ('GRID', (0, 0), (-1, -1), 0.25, _hex(RULE)),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 4),
        ('RIGHTPADDING', (0, 0), (-1, -1), 4),
    ]
    if empty and n > 1:
        styles_tbl.append(('SPAN', (0, 1), (-1, 1)))
    table = Table(rows, colWidths=col_w, repeatRows=1)
    table.setStyle(TableStyle(styles_tbl))

    story = [
        Paragraph('REPORTE OPERATIVO', styles['kicker']),
        Paragraph(_esc(payload.get('title') or 'Reporte'), styles['title']),
        Paragraph(f'Periodo { _esc(payload.get("period_label")) } · {len(items)} registro{"s" if len(items) != 1 else ""}', styles['sub']),
    ]
    if kpi:
        story += [kpi, Spacer(1, 12)]
    story.append(table)
    if payload.get('note'):
        story.append(Paragraph(_esc(payload['note']), styles['note']))

    doc = SimpleDocTemplate(
        buffer, pagesize=A4,
        leftMargin=margin_h, rightMargin=margin_h,
        topMargin=3.2 * cm, bottomMargin=2.0 * cm,
        title=payload.get('title') or 'Reporte',
        author=generated_by_name,
        subject=payload.get('period_label') or '',
    )
    try:
        doc.build(story, onFirstPage=draw_chrome, onLaterPages=draw_chrome, canvasmaker=NumberedCanvas)
    except Exception:
        logger.exception('Error generando PDF operativo')
        return None
    return buffer.getvalue()
