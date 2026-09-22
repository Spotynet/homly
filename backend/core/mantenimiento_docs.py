"""Reportes PDF de mantenimientos: ficha de trabajo e historial del condominio."""
from __future__ import annotations

import logging
import re
from django.utils import timezone

from .closing_report import (
    NumberedCanvas, _dt_es, _esc, _fit_canvas_text, _hex,
    _homly_logo_reader, _logo_reader, _tenant_address,
)

logger = logging.getLogger(__name__)

NAVY = '#1b2a4a'
GOLD = '#b08d57'
INK = '#1c1917'
INK_MED = '#44403c'
INK_LIGHT = '#78716c'
SAND = '#f7f4ee'
RULE = '#d6cfc2'
WHITE = '#ffffff'

KIND_ES = {'preventivo': 'Preventivo', 'correctivo': 'Correctivo'}
STATUS_ES = {
    'planeado': 'Planeado',
    'en_curso': 'En curso',
    'realizado': 'Realizado',
    'cancelado': 'Cancelado',
}
PRIORITY_ES = {'baja': 'Baja', 'media': 'Media', 'alta': 'Alta', 'urgente': 'Urgente'}
FREQ_ES = {
    'unica': 'Única',
    'semanal': 'Semanal',
    'mensual': 'Mensual',
    'trimestral': 'Trimestral',
    'semestral': 'Semestral',
    'anual': 'Anual',
}
EV_ES = {'antes': 'Antes', 'durante': 'Durante', 'despues': 'Después', 'otro': 'Otro'}


def _safe_filename(text, fallback='documento'):
    raw = (text or fallback).strip() or fallback
    raw = re.sub(r'[^\w\s\-áéíóúÁÉÍÓÚñÑ.]', '', raw, flags=re.UNICODE)
    raw = re.sub(r'\s+', '_', raw)[:80]
    return raw or fallback


def _user_label(user) -> str:
    if not user:
        return ''
    return (getattr(user, 'name', None) or getattr(user, 'email', '') or '').strip()


def _date_es(d):
    if not d:
        return '—'
    months = (
        '', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
        'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
    )
    return f'{d.day} de {months[d.month]} de {d.year}'


def _money(n):
    if n is None:
        return ''
    try:
        return f'${float(n):,.2f}'
    except (TypeError, ValueError):
        return ''


def _header_footer(canvas, doc, tenant, generated_at, generated_by):
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import cm

    page_w, page_h = A4
    margin_h = 1.9 * cm
    tenant_name = (tenant.razon_social or tenant.name or 'Condominio').strip()
    tenant_alias = (tenant.name or '').strip()
    rfc = (tenant.rfc or '').strip()
    addr = _tenant_address(tenant)
    logo = _logo_reader(tenant)
    homly_logo = _homly_logo_reader()

    canvas.saveState()
    canvas.setFillColor(_hex(NAVY))
    canvas.rect(0, page_h - 0.28 * cm, page_w, 0.28 * cm, fill=1, stroke=0)
    canvas.setFillColor(_hex(GOLD))
    canvas.rect(0, page_h - 0.36 * cm, page_w, 0.08 * cm, fill=1, stroke=0)

    inner_top = page_h - 0.55 * cm
    inner_bottom = page_h - 3.35 * cm
    inner_h = inner_top - inner_bottom
    x0 = margin_h
    text_x = x0
    logo_h = 1.55 * cm
    if logo:
        try:
            logo_y = inner_bottom + (inner_h - logo_h) / 2
            canvas.drawImage(
                logo, x0, logo_y,
                width=logo_h, height=logo_h,
                mask='auto', preserveAspectRatio=True, anchor='c',
            )
            text_x = x0 + logo_h + 0.32 * cm
        except Exception:
            text_x = x0

    show_alias = bool(tenant_alias and tenant_alias.lower() != tenant_name.lower())
    meta_bits = []
    if rfc:
        meta_bits.append(f'RFC {rfc}')
    if tenant.state:
        meta_bits.append(tenant.state)
    meta_line = '  ·  '.join(meta_bits)
    text_max_w = page_w - margin_h - text_x
    name_txt, name_sz = _fit_canvas_text(canvas, tenant_name, 'Times-Bold', 12, text_max_w, 8)
    alias_txt, alias_sz = _fit_canvas_text(canvas, tenant_alias, 'Times-Italic', 8.5, text_max_w, 7) if show_alias else ('', 8)
    meta_txt, meta_sz = _fit_canvas_text(canvas, meta_line, 'Times-Roman', 8, text_max_w, 7) if meta_line else ('', 8)
    addr_txt, addr_sz = _fit_canvas_text(canvas, addr, 'Times-Roman', 8, text_max_w, 7) if addr else ('', 8)

    n_lines = 1 + (1 if show_alias else 0) + (1 if meta_line else 0) + (1 if addr else 0)
    line_h = 0.34 * cm
    text_h = n_lines * line_h
    y_cursor = inner_bottom + (inner_h + text_h) / 2 - 0.24 * cm
    canvas.setFillColor(_hex(NAVY))
    canvas.setFont('Times-Bold', name_sz)
    canvas.drawString(text_x, y_cursor, name_txt)
    y_cursor -= line_h
    canvas.setFillColor(_hex(INK_MED))
    if show_alias:
        canvas.setFont('Times-Italic', alias_sz)
        canvas.drawString(text_x, y_cursor, alias_txt)
        y_cursor -= line_h
    if meta_line:
        canvas.setFont('Times-Roman', meta_sz)
        canvas.drawString(text_x, y_cursor, meta_txt)
        y_cursor -= line_h
    if addr:
        canvas.setFont('Times-Roman', addr_sz)
        canvas.drawString(text_x, y_cursor, addr_txt)

    canvas.setStrokeColor(_hex(NAVY))
    canvas.setLineWidth(0.8)
    canvas.line(margin_h, page_h - 3.48 * cm, page_w - margin_h, page_h - 3.48 * cm)
    canvas.setStrokeColor(_hex(GOLD))
    canvas.setLineWidth(0.45)
    canvas.line(margin_h, page_h - 3.58 * cm, page_w - margin_h, page_h - 3.58 * cm)

    canvas.setFillColor(_hex(SAND))
    canvas.rect(0, 0, page_w, 1.95 * cm, fill=1, stroke=0)
    canvas.setFillColor(_hex(NAVY))
    canvas.rect(0, 1.95 * cm, page_w, 0.055 * cm, fill=1, stroke=0)
    canvas.setFillColor(_hex(GOLD))
    canvas.rect(0, 1.895 * cm, page_w, 0.055 * cm, fill=1, stroke=0)

    foot_text_x = margin_h
    if homly_logo:
        try:
            logo_fh = 0.72 * cm
            logo_fw = logo_fh * (677 / 369)
            canvas.drawImage(
                homly_logo, margin_h, 0.78 * cm,
                width=logo_fw, height=logo_fh,
                mask='auto', preserveAspectRatio=True, anchor='c',
            )
            foot_text_x = margin_h + logo_fw + 0.22 * cm
        except Exception:
            canvas.setFillColor(_hex(NAVY))
            canvas.setFont('Times-Bold', 8)
            canvas.drawString(margin_h, 1.22 * cm, 'Homly')
            foot_text_x = margin_h + 1.45 * cm
    else:
        canvas.setFillColor(_hex(NAVY))
        canvas.setFont('Times-Bold', 8)
        canvas.drawString(margin_h, 1.22 * cm, 'Homly')
        foot_text_x = margin_h + 1.45 * cm

    canvas.setFillColor(_hex(INK_LIGHT))
    canvas.setFont('Times-Roman', 7)
    foot_max = page_w - margin_h - 3.4 * cm - foot_text_x
    canvas.drawString(foot_text_x, 1.22 * cm, 'Plataforma de administración condominial')
    user_line, fs = _fit_canvas_text(
        canvas,
        f'Generado el {_dt_es(generated_at)}  ·  Por: {generated_by}',
        'Times-Roman', 7, foot_max, 6,
    )
    canvas.setFont('Times-Roman', fs)
    canvas.drawString(foot_text_x, 0.88 * cm, user_line)
    canvas.restoreState()


def _styles():
    from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    styles = getSampleStyleSheet()

    def S(name, **kw):
        return ParagraphStyle(name, parent=styles['Normal'], **kw)

    return {
        'kicker': S('kicker', fontName='Times-Bold', fontSize=8.5, textColor=_hex(GOLD),
                    leading=11, alignment=TA_CENTER, spaceAfter=4),
        'title': S('title', fontName='Times-Bold', fontSize=16, textColor=_hex(NAVY),
                   leading=20, alignment=TA_CENTER, spaceAfter=3),
        'sub': S('sub', fontName='Times-Italic', fontSize=10, textColor=_hex(INK_MED),
                 leading=13, alignment=TA_CENTER, spaceAfter=12),
        'body': S('body', fontName='Times-Roman', fontSize=10.5, textColor=_hex(INK),
                  leading=15.5, alignment=TA_JUSTIFY, spaceAfter=8),
        'h': S('h', fontName='Times-Bold', fontSize=11, textColor=_hex(NAVY),
               leading=14, spaceBefore=10, spaceAfter=6),
        'ml': S('ml', fontName='Times-Bold', fontSize=9, textColor=_hex(NAVY), leading=12),
        'mv': S('mv', fontName='Times-Roman', fontSize=9.5, textColor=_hex(INK), leading=13),
        'small': S('sm', fontName='Times-Roman', fontSize=8.5, textColor=_hex(INK_LIGHT),
                   leading=12, alignment=TA_JUSTIFY, spaceBefore=8),
        'th': S('th', fontName='Times-Bold', fontSize=8, textColor=_hex(WHITE), leading=10, alignment=TA_CENTER),
        'td': S('td', fontName='Times-Roman', fontSize=8, textColor=_hex(INK), leading=11, alignment=TA_LEFT),
        'tdc': S('tdc', fontName='Times-Roman', fontSize=8, textColor=_hex(INK), leading=11, alignment=TA_CENTER),
        'kpi': S('kpi', fontName='Times-Bold', fontSize=14, textColor=_hex(NAVY),
                 leading=17, alignment=TA_CENTER),
        'kpi_l': S('kpi_l', fontName='Times-Roman', fontSize=7.5, textColor=_hex(INK_LIGHT),
                   leading=10, alignment=TA_CENTER, spaceBefore=1),
        'card_k': S('card_k', fontName='Times-Bold', fontSize=8, textColor=_hex(GOLD),
                    leading=11),
        'card_t': S('card_t', fontName='Times-Bold', fontSize=11, textColor=_hex(NAVY),
                    leading=14, spaceAfter=2),
        'cap': S('cap', fontName='Times-Italic', fontSize=8, textColor=_hex(INK_LIGHT),
                 leading=10, alignment=TA_CENTER),
    }


def _meta_table(rows, st, page_w, margin_h):
    from reportlab.platypus import Paragraph, Table, TableStyle
    from reportlab.lib.units import cm
    data = [[Paragraph(_esc(k), st['ml']), Paragraph(_esc(v), st['mv'])] for k, v in rows if v]
    if not data:
        return []
    w = page_w - 2 * margin_h
    tbl = Table(data, colWidths=[4.4 * cm, w - 4.4 * cm])
    tbl.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('BACKGROUND', (0, 0), (0, -1), _hex(SAND)),
    ]))
    return [tbl]


def _image_flowable(evidence, max_w, max_h):
    """Incrusta la foto de la evidencia leyendo bytes (local o storage remoto)."""
    import io
    from reportlab.platypus import Image
    from reportlab.lib.utils import ImageReader

    if not evidence.file:
        return None
    name = f"{evidence.original_name or ''} {getattr(evidence.file, 'name', '') or ''}".lower()
    if not any(ext in name for ext in ('.png', '.jpg', '.jpeg', '.webp', '.gif', '.heic', '.bmp')):
        return None
    try:
        evidence.file.open('rb')
        try:
            raw = evidence.file.read()
        finally:
            try:
                evidence.file.close()
            except Exception:
                pass
        if not raw:
            return None
        jpeg = io.BytesIO()
        try:
            from PIL import Image as PILImage
            pil = PILImage.open(io.BytesIO(raw))
            pil.load()
            if pil.mode not in ('RGB',):
                pil = pil.convert('RGB')
            pil.save(jpeg, format='JPEG', quality=88)
        except Exception:
            jpeg = io.BytesIO(raw)
        payload = jpeg.getvalue()
        if not payload:
            return None
        reader = ImageReader(io.BytesIO(payload))
        iw, ih = reader.getSize()
        if not iw or not ih:
            return None
        scale = min(max_w / float(iw), max_h / float(ih), 1.0)
        stream = io.BytesIO(payload)
        stream.name = 'evidence.jpg'
        img = Image(stream, width=iw * scale, height=ih * scale)
        img.hAlign = 'CENTER'
        return img
    except Exception:
        logger.exception('No se pudo incrustar evidencia %s', evidence.id)
        return None


def generate_work_pdf(work, generated_by='') -> bytes | None:
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.units import cm
        from reportlab.platypus import HRFlowable, KeepTogether, Paragraph, SimpleDocTemplate, Spacer
    except ImportError:
        logger.exception('ReportLab no disponible')
        return None

    import io
    tenant = work.tenant
    generated_at = timezone.localtime(timezone.now())
    generated_by = (generated_by or '').strip() or _user_label(work.created_by) or '—'
    page_w, page_h = A4
    margin_h = 1.9 * cm
    st = _styles()

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=A4,
        leftMargin=margin_h, rightMargin=margin_h,
        topMargin=3.85 * cm, bottomMargin=2.35 * cm,
        title=f'Mantenimiento — {work.title}',
        author=generated_by,
        subject=f'Reporte de mantenimiento {KIND_ES.get(work.kind, work.kind)}',
    )
    story = [
        Paragraph('REPORTE DE MANTENIMIENTO', st['kicker']),
        Paragraph(_esc(work.title), st['title']),
        Paragraph(
            f'{KIND_ES.get(work.kind, work.kind)} · {STATUS_ES.get(work.status, work.status)}'
            + (f' · { _esc(work.area_name)}' if work.area_name else ''),
            st['sub'],
        ),
        HRFlowable(width='100%', thickness=0.4, color=_hex(RULE), spaceAfter=12),
    ]
    story.extend(_meta_table([
        ('Tipo', KIND_ES.get(work.kind, work.kind)),
        ('Estatus', STATUS_ES.get(work.status, work.status)),
        ('Prioridad', PRIORITY_ES.get(work.priority, work.priority)),
        ('Área o lugar', work.area_name),
        ('Quién lo realiza', work.performed_by),
        ('Proveedor', work.vendor_name),
        ('Fecha programada', _date_es(work.scheduled_date)),
        ('Fecha de realización', _date_es(work.performed_date)),
        ('Periodicidad', FREQ_ES.get(work.frequency, work.frequency) if work.kind == 'preventivo' else ''),
        ('Próxima fecha', _date_es(work.next_due_date) if work.next_due_date else ''),
        ('Costo', _money(work.cost)),
        ('Registró', _user_label(work.created_by)),
    ], st, page_w, margin_h))

    if work.description:
        story.append(Paragraph('Planeación del trabajo', st['h']))
        for para in (work.description or '').split('\n'):
            if para.strip():
                story.append(Paragraph(_esc(para.strip()), st['body']))
    if work.work_notes:
        story.append(Paragraph('Documentación de lo realizado', st['h']))
        for para in (work.work_notes or '').split('\n'):
            if para.strip():
                story.append(Paragraph(_esc(para.strip()), st['body']))

    evidences = list(work.evidences.all().order_by('captured_at', 'created_at', 'id'))
    if evidences:
        story.append(Paragraph('Evidencias (orden cronológico)', st['h']))
        max_w = page_w - 2 * margin_h
        for ev in evidences:
            when = _date_es(ev.captured_at or (ev.created_at.date() if ev.created_at else None))
            who = _esc(_user_label(ev.uploaded_by) or '—')
            block = [Paragraph(
                f'{when} · {EV_ES.get(ev.kind, ev.kind)} · Registró {who}'
                + (f' — {_esc(ev.notes)}' if ev.notes else '')
                + (f' · {_esc(ev.original_name)}' if ev.original_name else ''),
                st['mv'],
            )]
            img = _image_flowable(ev, max_w, 9.2 * cm)
            if img:
                block.append(Spacer(1, 6))
                block.append(img)
            elif ev.original_name:
                block.append(Paragraph(_esc(f'Archivo adjunto: {ev.original_name}'), st['small']))
            story.append(KeepTogether(block))
            story.append(Spacer(1, 8))

    story.append(Paragraph(
        'Este documento forma parte del historial de mantenimientos del condominio. '
        'Las fotografías y notas quedan como constancia interna de los trabajos.',
        st['small'],
    ))

    def hf(canvas, _doc):
        _header_footer(canvas, _doc, tenant, generated_at, generated_by)

    try:
        doc.build(story, onFirstPage=hf, onLaterPages=hf, canvasmaker=NumberedCanvas)
    except Exception:
        logger.exception('Error al construir PDF de mantenimiento')
        return None
    return buffer.getvalue()


def _work_evidences(work):
    try:
        return list(work.evidences.all())
    except Exception:
        return []


def _work_dates(work):
    start = work.scheduled_date
    if not start and work.created_at:
        start = work.created_at.date() if hasattr(work.created_at, 'date') else work.created_at
    end = work.performed_date
    return start, end


def _kpi_strip(items, st, inner_w):
    from reportlab.platypus import Paragraph, Table, TableStyle
    n = max(len(items), 1)
    col = inner_w / n
    top = [Paragraph(_esc(str(v if v not in (None, '') else '—')), st['kpi']) for v, _l in items]
    bot = [Paragraph(_esc(label), st['kpi_l']) for _v, label in items]
    tbl = Table([top, bot], colWidths=[col] * n)
    tbl.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), _hex(SAND)),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('TOPPADDING', (0, 0), (-1, 0), 8),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 0),
        ('TOPPADDING', (0, 1), (-1, 1), 2),
        ('BOTTOMPADDING', (0, 1), (-1, 1), 8),
        ('LEFTPADDING', (0, 0), (-1, -1), 4),
        ('RIGHTPADDING', (0, 0), (-1, -1), 4),
        ('BOX', (0, 0), (-1, -1), 0.4, _hex(GOLD)),
        ('LINEAFTER', (0, 0), (-2, -1), 0.3, _hex(RULE)),
    ]))
    return tbl


def _history_work_card(work, st, inner_w):
    from reportlab.platypus import KeepTogether, Paragraph, Spacer, Table, TableStyle
    from reportlab.lib.units import cm

    start, end = _work_dates(work)
    evidences = _work_evidences(work)
    kind_n = {}
    for ev in evidences:
        kind_n[ev.kind] = kind_n.get(ev.kind, 0) + 1
    ev_parts = [
        f'{EV_ES.get(k, k)} {kind_n[k]}'
        for k in ('antes', 'durante', 'despues', 'otro')
        if kind_n.get(k)
    ]
    ev_txt = str(len(evidences))
    if ev_parts:
        ev_txt = f'{len(evidences)}  ·  ' + ' · '.join(ev_parts)

    provider = (work.vendor_name or '').strip() or '—'
    who = (work.performed_by or '').strip() or '—'
    cost = _money(work.cost) or '—'
    kicker = (
        f'{KIND_ES.get(work.kind, work.kind)}  ·  '
        f'{STATUS_ES.get(work.status, work.status)}  ·  '
        f'Prioridad {PRIORITY_ES.get(work.priority, work.priority)}'
    )
    freq = ''
    if work.kind == 'preventivo':
        freq = FREQ_ES.get(work.frequency, work.frequency) or ''
        if work.next_due_date:
            freq = f'{freq}  ·  Próxima {_date_es(work.next_due_date)}' if freq else f'Próxima {_date_es(work.next_due_date)}'

    head = Table(
        [[
            Paragraph(_esc(kicker), st['card_k']),
            Paragraph(_esc(cost), st['card_k']),
        ]],
        colWidths=[inner_w * 0.72, inner_w * 0.28],
    )
    head.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('ALIGN', (1, 0), (1, 0), 'RIGHT'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
    ]))

    meta_pairs = [
        ('Área', work.area_name or '—'),
        ('Proveedor', provider),
        ('Quién lo realiza', who),
        ('Inicio', _date_es(start)),
        ('Fin / realización', _date_es(end) if end else 'Pendiente'),
        ('Evidencias', ev_txt),
        ('Registró', _user_label(work.created_by) or '—'),
    ]
    if freq:
        meta_pairs.append(('Periodicidad', freq))
    if work.description:
        meta_pairs.append(('Planeación', (work.description or '').strip()[:280]))
    if work.work_notes:
        meta_pairs.append(('Documentación', (work.work_notes or '').strip()[:280]))

    meta_data = []
    row = []
    for label, value in meta_pairs:
        cell = [
            Paragraph(_esc(label), st['ml']),
            Paragraph(_esc(value), st['mv']),
        ]
        row.append(cell)
        if len(row) == 2:
            meta_data.append(row)
            row = []
    if row:
        row.append([Paragraph('', st['mv']), Paragraph('', st['mv'])])
        meta_data.append(row)

    half = inner_w / 2
    meta = Table(meta_data, colWidths=[half, half])
    meta.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
    ]))

    wrap = Table(
        [
            [head],
            [Paragraph(_esc(work.title), st['card_t'])],
            [meta],
        ],
        colWidths=[inner_w],
    )
    wrap.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), _hex(WHITE)),
        ('BOX', (0, 0), (-1, -1), 0.5, _hex(GOLD)),
        ('LINEBELOW', (0, 0), (-1, 0), 0.3, _hex(RULE)),
        ('LEFTPADDING', (0, 0), (-1, -1), 10),
        ('RIGHTPADDING', (0, 0), (-1, -1), 10),
        ('TOPPADDING', (0, 0), (-1, 0), 8),
        ('BOTTOMPADDING', (0, -1), (-1, -1), 8),
        ('TOPPADDING', (0, 1), (-1, -1), 4),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
    ]))
    return KeepTogether([wrap, Spacer(1, 8)])


def generate_history_pdf(
    tenant, works, generated_by='', kind_filter='', status_filter='', year=None,
) -> bytes | None:
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.units import cm
        from reportlab.platypus import HRFlowable, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
    except ImportError:
        logger.exception('ReportLab no disponible')
        return None

    import io
    generated_at = timezone.localtime(timezone.now())
    generated_by = (generated_by or '').strip() or '—'
    page_w, _page_h = A4
    margin_h = 1.9 * cm
    inner = page_w - 2 * margin_h
    st = _styles()
    kind_label = KIND_ES.get(kind_filter, 'Preventivos y correctivos')
    status_label = STATUS_ES.get(status_filter, 'Todos los estatus')
    year_label = f'Ejercicio {year}' if year else 'Todos los periodos'
    subtitle = f'{kind_label}  ·  {status_label}  ·  {year_label}'

    starts, ends = [], []
    counts = {'planeado': 0, 'en_curso': 0, 'realizado': 0, 'cancelado': 0, 'preventivo': 0, 'correctivo': 0}
    evidence_total = 0
    cost_total = 0
    with_provider = 0
    for w in works:
        counts[w.status] = counts.get(w.status, 0) + 1
        counts[w.kind] = counts.get(w.kind, 0) + 1
        start, end = _work_dates(w)
        if start:
            starts.append(start)
        if end:
            ends.append(end)
        evs = _work_evidences(w)
        evidence_total += len(evs)
        if w.cost:
            try:
                cost_total += float(w.cost)
            except (TypeError, ValueError):
                pass
        if (w.vendor_name or '').strip() or getattr(w, 'provider_id', None):
            with_provider += 1

    period_start = min(starts) if starts else None
    period_end = max(ends) if ends else (max(starts) if starts else None)
    period_txt = (
        f'{_date_es(period_start)}  —  {_date_es(period_end)}'
        if period_start or period_end else 'Sin fechas registradas'
    )

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=A4,
        leftMargin=margin_h, rightMargin=margin_h,
        topMargin=3.85 * cm, bottomMargin=2.35 * cm,
        title=f'Historial de mantenimientos — {tenant.name}',
        author=generated_by,
        subject='Historial de mantenimientos',
    )
    story = [
        Paragraph('HISTORIAL DE MANTENIMIENTOS', st['kicker']),
        Paragraph(_esc(tenant.razon_social or tenant.name or 'Condominio'), st['title']),
        Paragraph(_esc(subtitle), st['sub']),
        HRFlowable(width='100%', thickness=0.6, color=_hex(GOLD), spaceAfter=10),
        Paragraph('Resumen del periodo', st['h']),
        Paragraph(_esc(f'Cobertura: {period_txt}'), st['mv']),
        Spacer(1, 8),
        _kpi_strip([
            (str(len(works)), 'Trabajos'),
            (str(counts.get('realizado') or 0), 'Realizados'),
            (str(evidence_total), 'Evidencias'),
            (_money(cost_total) or '$0.00', 'Costo total'),
        ], st, inner),
        Spacer(1, 8),
        _kpi_strip([
            (str(counts.get('preventivo') or 0), 'Preventivos'),
            (str(counts.get('correctivo') or 0), 'Correctivos'),
            (str(counts.get('en_curso') or 0), 'En curso'),
            (str(counts.get('planeado') or 0), 'Planeados'),
        ], st, inner),
        Spacer(1, 6),
    ]
    story.extend(_meta_table([
        ('Fecha de inicio', _date_es(period_start)),
        ('Fecha final', _date_es(period_end)),
        ('Con proveedor', str(with_provider)),
        ('Cancelados', str(counts.get('cancelado') or 0)),
        ('Registros de evidencia', str(evidence_total)),
        ('Generado por', generated_by),
    ], st, page_w, margin_h))
    story.append(Spacer(1, 12))
    story.append(Paragraph('Detalle de trabajos', st['h']))

    if not works:
        story.append(Paragraph('Aún no hay trabajos registrados en este filtro.', st['body']))
    else:
        story.append(Paragraph(
            'Cada bloque resume planeación, proveedor, fechas de inicio y realización, '
            'y la cantidad de evidencias cargadas.',
            st['small'],
        ))
        story.append(Spacer(1, 6))
        # Compact index table first
        header = [
            Paragraph('#', st['th']),
            Paragraph('Trabajo', st['th']),
            Paragraph('Proveedor', st['th']),
            Paragraph('Inicio', st['th']),
            Paragraph('Fin', st['th']),
            Paragraph('Ev.', st['th']),
            Paragraph('Estatus', st['th']),
        ]
        rows = [header]
        for i, w in enumerate(works, 1):
            start, end = _work_dates(w)
            ev_n = len(_work_evidences(w))
            rows.append([
                Paragraph(str(i), st['tdc']),
                Paragraph(_esc(f'{w.title}'), st['td']),
                Paragraph(_esc(w.vendor_name or '—'), st['td']),
                Paragraph(_esc(start.strftime('%d/%m/%Y') if start else '—'), st['tdc']),
                Paragraph(_esc(end.strftime('%d/%m/%Y') if end else '—'), st['tdc']),
                Paragraph(str(ev_n), st['tdc']),
                Paragraph(_esc(STATUS_ES.get(w.status, w.status)), st['tdc']),
            ])
        col_w = [1.0 * cm, inner * 0.32, inner * 0.22, 2.1 * cm, 2.1 * cm, 1.2 * cm, 2.2 * cm]
        # scale last cols if overflow
        used = sum(col_w)
        if used > inner:
            col_w[1] -= (used - inner)
        tbl = Table(rows, colWidths=col_w, repeatRows=1)
        tbl.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), _hex(NAVY)),
            ('BACKGROUND', (0, 1), (-1, -1), _hex(SAND)),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('ALIGN', (0, 0), (0, -1), 'CENTER'),
            ('LEFTPADDING', (0, 0), (-1, -1), 4),
            ('RIGHTPADDING', (0, 0), (-1, -1), 4),
            ('TOPPADDING', (0, 0), (-1, -1), 5),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
            ('GRID', (0, 0), (-1, -1), 0.25, _hex(RULE)),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [_hex(SAND), _hex(WHITE)]),
        ]))
        story.append(tbl)
        story.append(Spacer(1, 14))
        story.append(Paragraph('Fichas del historial', st['h']))
        for w in works:
            story.append(_history_work_card(w, st, inner))

    story.append(Paragraph(
        'Bitácora interna de trabajos de mantenimiento. Cada ficha individual '
        'puede consultarse en pantalla y descargarse con fotografías y notas en orden cronológico.',
        st['small'],
    ))

    def hf(canvas, _doc):
        _header_footer(canvas, _doc, tenant, generated_at, generated_by)

    try:
        doc.build(story, onFirstPage=hf, onLaterPages=hf, canvasmaker=NumberedCanvas)
    except Exception:
        logger.exception('Error al construir historial de mantenimiento')
        return None
    return buffer.getvalue()

