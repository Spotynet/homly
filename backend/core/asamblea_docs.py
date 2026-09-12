"""Documentos formales de asamblea: convocatoria y acta (PDF)."""
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
NAVY_SOFT = '#2c3e66'
GOLD = '#b08d57'
INK = '#1c1917'
INK_MED = '#44403c'
INK_LIGHT = '#78716c'
SAND = '#f7f4ee'
RULE = '#d6cfc2'
WHITE = '#ffffff'

_WEEKDAYS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']
_MONTHS = [
    '', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]
VOTE_LABEL = {
    'informativo': 'Informativo',
    'simple': 'Mayoría simple',
    'calificada': 'Mayoría calificada',
    'unanimidad': 'Unanimidad',
}
RESULT_LABEL = {
    'pendiente': 'Pendiente',
    'aprobado': 'Aprobado',
    'rechazado': 'Rechazado',
    'diferido': 'Diferido',
}
KIND_LABEL = {
    'ordinaria': 'ordinaria',
    'extraordinaria': 'extraordinaria',
}


def _when_es(dt) -> str:
    if not dt:
        return 'por definir'
    if timezone.is_aware(dt):
        dt = timezone.localtime(dt)
    return (
        f'{_WEEKDAYS[dt.weekday()]} {dt.day} de {_MONTHS[dt.month]} de {dt.year}, '
        f'{dt.strftime("%H:%M")} horas'
    )


def _user_label(user) -> str:
    if not user:
        return ''
    return (getattr(user, 'name', None) or getattr(user, 'email', '') or '').strip()


def _safe_filename(text, fallback='documento'):
    raw = (text or fallback).strip() or fallback
    raw = re.sub(r'[^\w\s\-áéíóúÁÉÍÓÚñÑ.]', '', raw, flags=re.UNICODE)
    raw = re.sub(r'\s+', '_', raw)[:80]
    return raw or fallback


def generate_assembly_pdf(assembly, kind='convocatoria', generated_by='') -> bytes | None:
    try:
        from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT, TA_RIGHT
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
        from reportlab.lib.units import cm
        from reportlab.platypus import (
            HRFlowable, KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle,
        )
    except ImportError:
        logger.exception('ReportLab no disponible')
        return None

    import io

    tenant = assembly.tenant
    rules = assembly.legal_snapshot or {}
    generated_at = timezone.localtime(timezone.now())
    generated_by = (generated_by or '').strip() or _user_label(assembly.created_by) or '—'
    tenant_name = (tenant.razon_social or tenant.name or 'Condominio').strip()
    tenant_alias = (tenant.name or '').strip()
    rfc = (tenant.rfc or '').strip()
    addr = _tenant_address(tenant)
    logo = _logo_reader(tenant)
    homly_logo = _homly_logo_reader()
    is_minute = kind == 'minuta'
    is_acta = kind == 'acta'
    if is_acta:
        doc_title = 'ACTA DE ASAMBLEA'
    elif is_minute:
        doc_title = 'MINUTA DE TRABAJO'
    else:
        doc_title = 'CONVOCATORIA A ASAMBLEA'
    kind_es = KIND_LABEL.get(assembly.kind, assembly.kind)
    page_w, page_h = A4
    margin_h = 1.9 * cm

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=A4,
        leftMargin=margin_h, rightMargin=margin_h,
        topMargin=3.85 * cm, bottomMargin=2.35 * cm,
        title=f'{doc_title} — {assembly.title}',
        author=generated_by,
        subject=f'{doc_title} {kind_es} — {tenant_name}',
    )
    styles = getSampleStyleSheet()

    def S(name, **kw):
        return ParagraphStyle(name, parent=styles['Normal'], **kw)

    st_kicker = S('kicker', fontName='Times-Bold', fontSize=8.5, textColor=_hex(GOLD),
                  leading=11, alignment=TA_CENTER, spaceAfter=4)
    st_title = S('title', fontName='Times-Bold', fontSize=16, textColor=_hex(NAVY),
                 leading=20, alignment=TA_CENTER, spaceAfter=3)
    st_sub = S('sub', fontName='Times-Italic', fontSize=10, textColor=_hex(INK_MED),
               leading=13, alignment=TA_CENTER, spaceAfter=12)
    st_body = S('body', fontName='Times-Roman', fontSize=10.5, textColor=_hex(INK),
                leading=15.5, alignment=TA_JUSTIFY, spaceAfter=9)
    st_h = S('h', fontName='Times-Bold', fontSize=11, textColor=_hex(NAVY),
             leading=14, spaceBefore=10, spaceAfter=6)
    st_meta_l = S('ml', fontName='Times-Bold', fontSize=9, textColor=_hex(NAVY), leading=12)
    st_meta_v = S('mv', fontName='Times-Roman', fontSize=9.5, textColor=_hex(INK), leading=13)
    st_item = S('item', fontName='Times-Roman', fontSize=10.5, textColor=_hex(INK), leading=14.5)
    st_item_sub = S('isub', fontName='Times-Italic', fontSize=8.5, textColor=_hex(INK_LIGHT), leading=11)
    st_small = S('sm', fontName='Times-Roman', fontSize=8.5, textColor=_hex(INK_LIGHT),
                 leading=12, alignment=TA_JUSTIFY, spaceBefore=10)
    st_sign = S('sign', fontName='Times-Roman', fontSize=9.5, textColor=_hex(INK),
                leading=12, alignment=TA_CENTER)
    st_th = S('th', fontName='Times-Bold', fontSize=8, textColor=_hex(WHITE), leading=10, alignment=TA_CENTER)
    st_td = S('td', fontName='Times-Roman', fontSize=8, textColor=_hex(INK), leading=11)

    def header_footer(canvas, _doc):
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

    story = []
    story.append(Paragraph(doc_title, st_kicker))
    story.append(Paragraph(_esc(assembly.title or f'Asamblea {kind_es} {assembly.year}'), st_title))
    story.append(Paragraph(
        f'Asamblea {kind_es} · Ejercicio {assembly.year}'
        + (f' · { _esc(rules.get("jurisdiction") or "")}' if rules.get('jurisdiction') else ''),
        st_sub,
    ))
    story.append(HRFlowable(width='100%', thickness=0.4, color=_hex(RULE), spaceAfter=12))

    if is_acta or is_minute:
        story.extend(_minute_story(
            assembly, rules, tenant_name, st_body, st_h, st_meta_l, st_meta_v,
            st_item, st_item_sub, st_small, st_sign, st_th, st_td, page_w, margin_h,
            mode='acta' if is_acta else 'minuta',
        ))
    else:
        story.extend(_notice_story(assembly, rules, tenant_name, st_body, st_h, st_meta_l, st_meta_v,
                                   st_item, st_item_sub, st_small, page_w, margin_h))

    try:
        doc.build(story, onFirstPage=header_footer, onLaterPages=header_footer, canvasmaker=NumberedCanvas)
    except Exception:
        logger.exception('Error al construir PDF de asamblea')
        return None
    return buffer.getvalue()


def _meta_table(rows, st_l, st_v, page_w, margin_h):
    from reportlab.platypus import Paragraph, Spacer, Table, TableStyle
    from reportlab.lib.units import cm
    data = [[Paragraph(_esc(k), st_l), Paragraph(_esc(v), st_v)] for k, v in rows if v]
    if not data:
        return []
    w = page_w - 2 * margin_h
    tbl = Table(data, colWidths=[4.4 * cm, w - 4.4 * cm])
    tbl.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('LINEBELOW', (0, 0), (-1, -2), 0.3, _hex(RULE)),
    ]))
    return [tbl, Spacer_(8)]


def Spacer_(h=8):
    from reportlab.platypus import Spacer
    from reportlab.lib.units import mm
    return Spacer(1, h * mm / 2.8)


def _agenda_block(assembly, st_h, st_item, st_item_sub, with_votes=False):
    from reportlab.platypus import KeepTogether, Paragraph
    parts = [Paragraph('Orden del día', st_h)]
    items = list(assembly.agenda.all())
    if not items:
        parts.append(Paragraph('Sin puntos registrados.', st_item))
        return parts
    for i, item in enumerate(items, 1):
        vote = VOTE_LABEL.get(item.vote_type, item.vote_type)
        title = f'{i}. {_esc(item.title)}'
        extra = f'Tipo de votación: {vote}'
        if with_votes and item.result != 'pendiente':
            extra += f'  ·  Acuerdo: {RESULT_LABEL.get(item.result, item.result)}'
            if item.votes_for or item.votes_against or item.votes_abstain:
                extra += (
                    f'  (a favor {item.votes_for}, en contra {item.votes_against}, '
                    f'abstenciones {item.votes_abstain})'
                )
        if item.source_kind and item.source_kind != 'manual' and item.source_label:
            extra += f'  ·  Origen: {item.source_label}'
        block = [
            Paragraph(title, st_item),
            Paragraph(_esc(extra), st_item_sub),
        ]
        if item.description:
            block.append(Paragraph(_esc(item.description), st_item_sub))
        if with_votes and item.notes:
            block.append(Paragraph(_esc(f'Notas de minuta: {item.notes}'), st_item_sub))
        if with_votes and item.applied_notes:
            block.append(Paragraph(_esc(item.applied_notes), st_item_sub))
        parts.append(KeepTogether(block + [Spacer_(4)]))
    return parts


def _notice_story(assembly, rules, tenant_name, st_body, st_h, st_l, st_v, st_item, st_item_sub, st_small, page_w, margin_h):
    from reportlab.platypus import Paragraph
    who = assembly.issued_by_name or 'la Administración'
    first = _when_es(assembly.first_call_at)
    second = _when_es(assembly.second_call_at) if assembly.second_call_at else (
        f'{rules.get("second_call_wait_minutes") or 30} minutos después de la primera, '
        'si no se reúne el quórum'
    )
    place = assembly.location or 'el lugar que se señale oportunamente'
    q1 = rules.get('first_quorum_pct')
    q2 = rules.get('second_quorum_pct')
    intro = (
        f'Por medio del presente instrumento, <b>{_esc(tenant_name)}</b> convoca a los condóminos '
        f'y/o propietarios a la asamblea <b>{_esc(KIND_LABEL.get(assembly.kind, assembly.kind))}</b> '
        f'del ejercicio <b>{assembly.year}</b>, a celebrarse en los términos siguientes. '
        f'La convocatoria es emitida por <b>{_esc(who)}</b>'
        + (f', con al menos {assembly.notice_days} días de anticipación' if assembly.notice_days else '')
        + '.'
    )
    story = [Paragraph(intro, st_body)]
    story.append(Paragraph('Datos de la reunión', st_h))
    story.extend(_meta_table([
        ('Primera convocatoria', first),
        ('Segunda convocatoria', second),
        ('Lugar', place),
        ('Quien convoca', who),
        ('Quórum 1ª', f'{q1}% de {rules.get("quorum_basis") or "unidades"}' if q1 else ''),
        ('Quórum 2ª', f'{q2}% de {rules.get("quorum_basis") or "unidades"}' if q2 else ''),
    ], st_l, st_v, page_w, margin_h))
    story.extend(_agenda_block(assembly, st_h, st_item, st_item_sub, with_votes=False))
    delivery = assembly.delivery_methods or rules.get('delivery') or []
    if delivery:
        story.append(Paragraph('Medios de notificación', st_h))
        story.append(Paragraph(_esc('; '.join(delivery)), st_body))
    law = rules.get('law') or ''
    disc = rules.get('disclaimer') or (
        'Este documento se emite para constancia interna y, en su caso, para su protocolización. '
        'Confirme el reglamento del condominio y la legislación aplicable.'
    )
    story.append(Paragraph(
        (f'Fundamento: {_esc(law)}. ' if law else '') + _esc(disc),
        st_small,
    ))
    return story


def _minute_story(assembly, rules, tenant_name, st_body, st_h, st_l, st_v, st_item, st_item_sub,
                  st_small, st_sign, st_th, st_td, page_w, margin_h, mode='acta'):
    from reportlab.lib.units import cm
    from reportlab.platypus import Paragraph, Table, TableStyle

    q = {}
    try:
        from .asambleas import quorum_snapshot
        q = quorum_snapshot(assembly) or {}
    except Exception:
        q = {}
    held = assembly.installed_at or assembly.first_call_at
    intro = (
        f'En { _esc(assembly.location or "el domicilio del condominio") }, '
        f'siendo {_esc(_when_es(held))}, se reunieron los condóminos de '
        f'<b>{_esc(tenant_name)}</b> a efecto de celebrar la asamblea '
        f'<b>{_esc(KIND_LABEL.get(assembly.kind, assembly.kind))}</b> correspondiente al ejercicio '
        f'<b>{assembly.year}</b>, bajo el siguiente desahogo.'
    )
    story = [Paragraph(intro, st_body)]
    story.append(Paragraph('Instalación y quórum', st_h))
    story.extend(_meta_table([
        ('Presidente de debates', assembly.president_name or '________________'),
        ('Secretario', assembly.secretary_name or '________________'),
        ('Asistencia', f'{q.get("present") or 0} de {q.get("total") or 0} ({q.get("present_pct") or 0}%)'),
        ('Quórum requerido', f'{q.get("required_pct") or rules.get("first_quorum_pct") or "—"}%'),
        ('Quórum', 'Sí se reunió' if q.get('met') else 'Registrado en el sistema'),
        ('Estatus del acta', (assembly.minute_status or 'borrador').replace('_', ' ').title()),
        ('Notario', f'{assembly.notary_name} · {assembly.notary_folio}' if assembly.protocolized else ''),
        ('Naturaleza', 'Minuta de trabajo (notas de la sesión)' if mode == 'minuta' else 'Acta formal de la asamblea'),
    ], st_l, st_v, page_w, margin_h))

    present = [
        a for a in assembly.attendees.all()
        if a.present and a.capacity != 'invitado'
    ]
    if present:
        story.append(Paragraph('Lista de asistencia', st_h))
        header = [
            Paragraph('Unidad', st_th),
            Paragraph('Asistente', st_th),
            Paragraph('Carácter', st_th),
            Paragraph('Representante', st_th),
        ]
        rows = [header]
        for a in present[:80]:
            rows.append([
                Paragraph(_esc(a.unit.unit_id_code if a.unit_id else '—'), st_td),
                Paragraph(_esc(a.attendee_name or '—'), st_td),
                Paragraph(_esc(a.capacity or ''), st_td),
                Paragraph(_esc(a.proxy_name or '—'), st_td),
            ])
        w = page_w - 2 * margin_h
        tbl = Table(rows, colWidths=[2.2 * cm, w * 0.38, 3.2 * cm, w * 0.28])
        tbl.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), _hex(NAVY)),
            ('BACKGROUND', (0, 1), (-1, -1), _hex(SAND)),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('LEFTPADDING', (0, 0), (-1, -1), 4),
            ('RIGHTPADDING', (0, 0), (-1, -1), 4),
            ('TOPPADDING', (0, 0), (-1, -1), 3),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
            ('GRID', (0, 0), (-1, -1), 0.25, _hex(RULE)),
        ]))
        story.append(tbl)
        story.append(Spacer_(10))

    story.extend(_agenda_block(assembly, st_h, st_item, st_item_sub, with_votes=True))
    if mode == 'minuta':
        story.append(Paragraph('Notas de la sesión (minuta)', st_h))
        body = (assembly.minute_body or '').strip()
        empty = (
            'La minuta de trabajo aún no ha sido capturada. Este documento refleja '
            'asistencia y votaciones registradas en el sistema.'
        )
    else:
        story.append(Paragraph('Acuerdos y constancias del acta', st_h))
        body = (assembly.acta_body or assembly.minute_body or '').strip()
        empty = (
            'El acta formal aún no ha sido redactada. Este documento refleja '
            'únicamente los datos de instalación, asistencia y votaciones capturados.'
        )
    if body:
        for para in body.split('\n'):
            if para.strip():
                story.append(Paragraph(_esc(para.strip()), st_body))
            else:
                story.append(Spacer_(4))
    else:
        story.append(Paragraph(empty, st_body))

    story.append(Paragraph('Firmas' if mode == 'acta' else 'Rúbrica de quien elaboró la minuta', st_h))
    w = page_w - 2 * margin_h
    signs = Table(
        [[
            Paragraph('____________________________<br/>Presidente de debates<br/>'
                      f'{_esc(assembly.president_name or "")}', st_sign),
            Paragraph('____________________________<br/>Secretario<br/>'
                      f'{_esc(assembly.secretary_name or "")}', st_sign),
        ]],
        colWidths=[w / 2, w / 2],
    )
    from reportlab.platypus import TableStyle
    signs.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 18),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
    ]))
    story.append(signs)
    law = rules.get('law') or ''
    if mode == 'minuta':
        story.append(Paragraph(
            (f'Fundamento: {_esc(law)}. ' if law else '')
            + 'Esta minuta es el registro de trabajo de la sesión. El documento formal para firma '
              'y protocolización es el acta de asamblea.',
            st_small,
        ))
    else:
        story.append(Paragraph(
            (f'Fundamento: {_esc(law)}. ' if law else '')
            + 'Documento generado por Homly para su revisión, firma y, en su caso, protocolización ante notario. '
              'No sustituye por sí mismo el instrumento notarial.',
            st_small,
        ))
    return story
