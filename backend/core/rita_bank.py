"""
Rita — motor de lectura de estados de cuenta bancarios (México).

Extrae movimientos, clasifica Ingreso/Egreso y sugiere unidad a partir
del concepto (ej. \"casa 48\", \"C-12\").

Perfiles soportados (tenant.rita_settings.bank_profile):
  santander | bbva | banorte | banamex | hsbc | inbursa | scotiabank | generic
"""
from __future__ import annotations

import re
import uuid
import logging
from decimal import Decimal, InvalidOperation
from datetime import datetime

logger = logging.getLogger(__name__)

BANK_PROFILES = {
    'santander': {
        'label': 'Santander México',
        'detect': [r'santander', r'e-pyme', r'grupo financiero santander'],
        'ingreso_keywords': ['abono', 'deposito', 'depósito', 'spei', 'enlace', 'tef', 'transf'],
        'egreso_keywords': ['retiro', 'cargo', 'pago cheque', 'comision', 'comisión', 'compra'],
    },
    'bbva': {
        'label': 'BBVA México',
        'detect': [r'bbva', r'bancomer'],
        'ingreso_keywords': ['abono', 'spei recibido', 'deposito', 'depósito', 'transferencia recibida'],
        'egreso_keywords': ['cargo', 'retiro', 'spei enviado', 'compra', 'comision'],
    },
    'banorte': {
        'label': 'Banorte',
        'detect': [r'banorte', r'ixe'],
        'ingreso_keywords': ['abono', 'deposito', 'depósito', 'spei'],
        'egreso_keywords': ['cargo', 'retiro', 'comision', 'comisión'],
    },
    'banamex': {
        'label': 'Citibanamex',
        'detect': [r'banamex', r'citibanamex', r'citibank'],
        'ingreso_keywords': ['abono', 'deposito', 'depósito', 'spei'],
        'egreso_keywords': ['cargo', 'retiro', 'comision'],
    },
    'hsbc': {
        'label': 'HSBC México',
        'detect': [r'\bhsbc\b'],
        'ingreso_keywords': ['abono', 'deposito', 'depósito', 'credito', 'crédito'],
        'egreso_keywords': ['cargo', 'retiro', 'debito', 'débito'],
    },
    'inbursa': {
        'label': 'Inbursa',
        'detect': [r'inbursa'],
        'ingreso_keywords': ['abono', 'deposito', 'depósito', 'spei'],
        'egreso_keywords': ['cargo', 'retiro', 'comision'],
    },
    'scotiabank': {
        'label': 'Scotiabank',
        'detect': [r'scotiabank', r'scotia'],
        'ingreso_keywords': ['abono', 'deposito', 'depósito', 'spei'],
        'egreso_keywords': ['cargo', 'retiro', 'comision'],
    },
    'generic': {
        'label': 'Genérico (México)',
        'detect': [],
        'ingreso_keywords': [
            'abono', 'deposito', 'depósito', 'spei', 'transferencia recibida',
            'ingreso', 'acreditacion', 'acreditación',
        ],
        'egreso_keywords': [
            'retiro', 'cargo', 'pago', 'comision', 'comisión', 'compra',
            'domiciliacion', 'domiciliación', 'spei enviado',
        ],
    },
}

MONTHS_ES = {
    'ene': 1, 'feb': 2, 'mar': 3, 'abr': 4, 'may': 5, 'jun': 6,
    'jul': 7, 'ago': 8, 'sep': 9, 'sept': 9, 'oct': 10, 'nov': 11, 'dic': 12,
}


def undouble_glyphs(text: str) -> str:
    """Corrige texto Santander/pdfplumber donde cada letra viene duplicada (AABBOONNOO)."""
    if not text:
        return text
    letters = [c for c in text if c.isalpha()]
    if len(letters) < 8:
        return text
    doubled = sum(1 for i in range(0, len(letters) - 1, 2) if letters[i] == letters[i + 1])
    pairs = max(1, len(letters) // 2)
    if doubled / pairs < 0.55:
        return text
    out = []
    i = 0
    while i < len(text):
        a = text[i]
        b = text[i + 1] if i + 1 < len(text) else None
        if b is not None and a == b and a.isalpha():
            out.append(a)
            i += 2
        else:
            out.append(a)
            i += 1
    return ''.join(out)


def normalize_text(raw: str) -> str:
    raw = raw.replace('\x00', ' ')
    lines = []
    for line in raw.splitlines():
        line = undouble_glyphs(line)
        line = re.sub(r'[ \t]+', ' ', line).strip()
        if line:
            lines.append(line)
    return '\n'.join(lines)


def parse_amount(token: str) -> Decimal | None:
    if not token:
        return None
    t = token.strip().replace('$', '').replace('€', '').replace(' ', '')
    t = t.replace('−', '-').replace('–', '-')
    # 1,250.46 or 1.250,46
    if re.search(r',\d{2}$', t) and '.' in t:
        t = t.replace('.', '').replace(',', '.')
    elif re.search(r',\d{2}$', t):
        t = t.replace(',', '.')
    else:
        t = t.replace(',', '')
    try:
        return Decimal(t)
    except (InvalidOperation, ValueError):
        return None


def parse_date_mx(token: str, default_year: int | None = None) -> str | None:
    """Return YYYY-MM-DD or None."""
    if not token:
        return None
    t = token.strip().lower().replace('.', '')
    # 02-ENE-2026 / 02/ENE/2026 / 02-ENE-26
    m = re.match(r'(\d{1,2})[-/\s]([a-záéíóú]{3,5})[-/\s](\d{2,4})', t)
    if m:
        d, mon, y = m.groups()
        mon = mon[:4] if mon.startswith('sept') else mon[:3]
        mon = mon.replace('á', 'a').replace('é', 'e')
        mi = MONTHS_ES.get(mon)
        if not mi:
            return None
        yi = int(y)
        if yi < 100:
            yi += 2000
        try:
            return datetime(yi, mi, int(d)).date().isoformat()
        except ValueError:
            return None
    m = re.match(r'(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})', t)
    if m:
        a, b, y = m.groups()
        yi = int(y)
        if yi < 100:
            yi += 2000
        # assume DD/MM/YYYY
        try:
            return datetime(yi, int(b), int(a)).date().isoformat()
        except ValueError:
            try:
                return datetime(yi, int(a), int(b)).date().isoformat()
            except ValueError:
                return None
    return None


def detect_bank_profile(text: str, preferred: str | None = None) -> str:
    if preferred and preferred in BANK_PROFILES and preferred != 'generic':
        return preferred
    low = text.lower()
    for key, cfg in BANK_PROFILES.items():
        if key == 'generic':
            continue
        for pat in cfg['detect']:
            if re.search(pat, low):
                return key
    return preferred if preferred in BANK_PROFILES else 'generic'


def extract_pdf_text(file_bytes: bytes) -> tuple[str, dict]:
    """Extrae texto de PDF. Si está vacío (escaneo), intenta OCR si hay tesseract."""
    meta = {'engine': None, 'pages': 0, 'ocr': False, 'warning': None}
    text = ''
    try:
        import pdfplumber
        import io
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            meta['pages'] = len(pdf.pages)
            parts = []
            for page in pdf.pages:
                parts.append(page.extract_text() or '')
            text = '\n'.join(parts)
            meta['engine'] = 'pdfplumber'
    except Exception as e:
        logger.warning('pdfplumber failed: %s', e)
        try:
            from pypdf import PdfReader
            import io
            reader = PdfReader(io.BytesIO(file_bytes))
            meta['pages'] = len(reader.pages)
            text = '\n'.join((p.extract_text() or '') for p in reader.pages)
            meta['engine'] = 'pypdf'
        except Exception as e2:
            meta['warning'] = f'No se pudo leer el PDF: {e2}'
            return '', meta

    if len(re.sub(r'\s+', '', text)) >= 40:
        return normalize_text(text), meta

    # OCR fallback for CamScanner / image PDFs
    try:
        from pdf2image import convert_from_bytes
        import pytesseract
        images = convert_from_bytes(file_bytes, dpi=200)
        meta['pages'] = len(images)
        ocr_parts = []
        for img in images:
            ocr_parts.append(pytesseract.image_to_string(img, lang='spa+eng') or '')
        text = normalize_text('\n'.join(ocr_parts))
        meta['engine'] = 'tesseract'
        meta['ocr'] = True
        if len(re.sub(r'\s+', '', text)) < 40:
            meta['warning'] = (
                'El PDF parece escaneado y el OCR no obtuvo texto útil. '
                'Sube un estado de cuenta digital (no foto) o habilita OCR en el servidor.'
            )
        return text, meta
    except Exception as e:
        meta['warning'] = (
            'El PDF no tiene texto seleccionable (p. ej. foto/CamScanner). '
            f'OCR no disponible ({e}). Usa el PDF digital del banco.'
        )
        return '', meta


_DATE_AMT_LINE = re.compile(
    r'^(?P<date>\d{1,2}[-/][A-Za-zÁÉÍÓÚáéíóú]{3,5}[-/]\d{2,4}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})'
    r'\s+(?P<folio>\d{4,12})?'
    r'\s*(?P<rest>.+)$'
)

_AMOUNT_TOKEN = re.compile(r'\$?\d{1,3}(?:,\d{3})*(?:\.\d{2})|\$?\d+\.\d{2}')


def _classify(description: str, deposit: Decimal | None, withdrawal: Decimal | None, profile: str) -> str:
    if deposit and deposit > 0 and (not withdrawal or withdrawal == 0):
        return 'ingreso'
    if withdrawal and withdrawal > 0 and (not deposit or deposit == 0):
        return 'egreso'
    cfg = BANK_PROFILES.get(profile) or BANK_PROFILES['generic']
    d = (description or '').lower()
    for k in cfg['egreso_keywords']:
        if k in d:
            return 'egreso'
    for k in cfg['ingreso_keywords']:
        if k in d:
            return 'ingreso'
    # default: positive amount alone → ingreso if "abono/deposito" else egreso
    if 'abono' in d or 'dep' in d or 'spei' in d and 'enviad' not in d:
        return 'ingreso'
    return 'egreso'


def _guess_unit(concept: str, description: str, units: list[dict]) -> dict | None:
    """units: [{id, unit_id_code, unit_name}]"""
    blob = f'{concept or ""} {description or ""}'.lower()
    if not units:
        return None
    # Solo con marcador explícito: casa 48, c-48, unidad 12, depto 3…
    m = re.search(
        r'\b(?:casa|casas|depto|departamento|departamento|unidad|apto|apartamento|c)\s*[-#:]?\s*0*(\d{1,4})\b',
        blob,
    )
    if not m:
        m = re.search(r'\b(c|u|d)\s*-\s*0*(\d{1,4})\b', blob)
        num = m.group(2) if m else None
    else:
        num = m.group(1)
    if not num:
        return None
    best = None
    best_score = 0
    for u in units:
        code = (u.get('unit_id_code') or '').lower()
        name = (u.get('unit_name') or '').lower()
        score = 0
        if re.search(rf'(?:^|[^0-9])0*{re.escape(num)}(?:[^0-9]|$)', code):
            score += 6
        if re.search(rf'(?:casa|depto|unidad|apto)?\s*0*{re.escape(num)}\b', name):
            score += 6
        if score > best_score:
            best_score = score
            best = u
    if best and best_score >= 6:
        return best
    return None


def parse_movements(text: str, profile: str = 'generic', units: list[dict] | None = None) -> dict:
    """Parse bank statement text into structured movements."""
    profile = detect_bank_profile(text, profile)
    units = units or []
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]

    movements = []
    i = 0
    while i < len(lines):
        line = lines[i]
        m = _DATE_AMT_LINE.match(line)
        if not m:
            i += 1
            continue

        date_s = parse_date_mx(m.group('date'))
        folio = (m.group('folio') or '').strip()
        rest = m.group('rest').strip()

        # Collect continuation lines until next date line
        block = [rest]
        j = i + 1
        while j < len(lines):
            if _DATE_AMT_LINE.match(lines[j]):
                break
            # skip headers
            if re.search(r'^(fecha|folio|descripcion|dep[oó]sito|retiro|saldo|p[aá]gina)\b', lines[j], re.I):
                j += 1
                continue
            if re.search(r'saldo final del periodo|detalle de movimientos|estado de cuenta', lines[j], re.I):
                j += 1
                continue
            block.append(lines[j])
            j += 1
            if len(block) > 12:
                break

        block_text = ' '.join(block)
        amounts = _AMOUNT_TOKEN.findall(line)  # amounts on header line
        # Also look in block for deposit/retiro columns — usually last 1-2 numbers on first line are deposit/balance
        header_amts = [parse_amount(a) for a in amounts]
        header_amts = [a for a in header_amts if a is not None]

        deposit = None
        withdrawal = None
        # Heuristic: description often contains ABONO... then deposit amount then balance
        desc_part = rest
        # Strip trailing amounts from rest for description
        desc_clean = re.sub(r'(\$?\d{1,3}(?:,\d{3})*(?:\.\d{2})\s*)+$', '', rest).strip()

        low = block_text.lower()
        if header_amts:
            # If clearly a withdrawal description
            if re.search(r'pago cheque|retiro|cargo|comisi[oó]n', low) and not re.search(r'\babono\b|\bdep[oó]sito\b', low):
                withdrawal = header_amts[0]
            elif len(header_amts) >= 2:
                deposit = header_amts[0]
            elif len(header_amts) == 1:
                if re.search(r'\babono\b|\bdep[oó]sito\b|\bspei\b|\benlace\b|\btef\b', low):
                    deposit = header_amts[0]
                else:
                    # ambiguous — prefer ingreso for SPEI-like
                    deposit = header_amts[0]

        kind = _classify(block_text, deposit, withdrawal, profile)
        amount = deposit if kind == 'ingreso' else (withdrawal or deposit)
        if not amount or amount <= 0:
            i = j
            continue

        counterparty = None
        cm = re.search(r'DEL CLIENTE\s+(.+?)(?:\s+CLAVE|\s+REF|\s+CONCEPTO|\s+RFC|$)', block_text, re.I)
        if cm:
            counterparty = cm.group(1).strip(' ,/')
        concept = None
        cnm = re.search(r'CONCEPTO\s+(.+?)(?:\s+RFC\b|$)', block_text, re.I)
        if cnm:
            concept = cnm.group(1).strip()
        bank_from = None
        bm = re.search(r'RECIBIDO DE\s+([A-ZÁÉÍÓÚÑ0-9 ]+?)(?:\s+DE LA CUENTA|\s+DEL CLIENTE|$)', block_text, re.I)
        if bm:
            bank_from = bm.group(1).strip()
        reference = None
        rm = re.search(r'\bREF\s+([A-Z0-9]+)', block_text, re.I)
        if rm:
            reference = rm.group(1)

        suggested = _guess_unit(concept or '', block_text, units)
        mov = {
            'id': str(uuid.uuid4()),
            'kind': kind,
            'date': date_s,
            'amount': float(amount),
            'folio': folio or None,
            'description': desc_clean[:240] or block_text[:240],
            'counterparty': counterparty,
            'concept': concept,
            'reference': reference,
            'bank_from': bank_from,
            'suggested_unit_id': suggested['id'] if suggested else None,
            'suggested_unit_code': suggested.get('unit_id_code') if suggested else None,
            'suggested_unit_name': suggested.get('unit_name') if suggested else None,
            'status': 'pending',
            'confidence': 0.85 if suggested else 0.55,
        }
        movements.append(mov)
        i = j

    # Dedupe by date+amount+folio/description prefix
    seen = set()
    unique = []
    for mov in movements:
        key = (mov.get('date'), mov.get('amount'), mov.get('folio') or mov.get('description', '')[:40])
        if key in seen:
            continue
        seen.add(key)
        unique.append(mov)

    ingresos = [m for m in unique if m['kind'] == 'ingreso']
    egresos = [m for m in unique if m['kind'] == 'egreso']
    return {
        'bank_profile': profile,
        'bank_label': BANK_PROFILES[profile]['label'],
        'movements': unique,
        'summary': {
            'total': len(unique),
            'ingresos': len(ingresos),
            'egresos': len(egresos),
            'suma_ingresos': round(sum(m['amount'] for m in ingresos), 2),
            'suma_egresos': round(sum(m['amount'] for m in egresos), 2),
        },
    }


def parse_bank_statement_pdf(file_bytes: bytes, bank_profile: str = 'generic', units: list[dict] | None = None) -> dict:
    text, meta = extract_pdf_text(file_bytes)
    if not text:
        return {
            'ok': False,
            'error': meta.get('warning') or 'No se pudo extraer texto del PDF.',
            'meta': meta,
            'movements': [],
            'summary': {'total': 0, 'ingresos': 0, 'egresos': 0, 'suma_ingresos': 0, 'suma_egresos': 0},
        }
    parsed = parse_movements(text, profile=bank_profile, units=units)
    parsed['ok'] = True
    parsed['error'] = None
    parsed['meta'] = meta
    if parsed['summary']['total'] == 0:
        parsed['ok'] = False
        parsed['error'] = (
            'Se leyó el PDF pero no se detectaron movimientos. '
            f'Revisa el perfil de banco (actual: {parsed["bank_label"]}) en Configuración → Rita.'
        )
    return parsed
