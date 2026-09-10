"""
Homly — Reporte de cierre de período (PDF).

Documento consolidado para períodos cerrados: KPIs y gráficas del dashboard
económicos, resumen ejecutivo, reporte general, adeudos, gastos y caja chica.
"""
from __future__ import annotations

import base64
import io
import logging
from collections import defaultdict
from decimal import Decimal
from xml.sax.saxutils import escape

from django.utils import timezone

from .models import CajaChicaEntry, GastoEntry, Unit

logger = logging.getLogger(__name__)

_MONTHS_FULL = [
    '', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]
_MONTHS_SHORT = [
    '', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
    'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
]
_PAY_LABELS = {
    'efectivo': 'Efectivo',
    'transferencia': 'Transferencia',
    'cheque': 'Cheque',
    'tarjeta': 'Tarjeta',
    'deposito': 'Depósito',
    'otro': 'Otro',
}
_CUR_SYM = {'MXN': '$', 'USD': 'US$', 'EUR': '€', 'COP': '$'}

# Paleta alineada al dashboard económicos
TEAL = '#0d7c6e'
TEAL_DARK = '#0a5f55'
TEAL_SOFT = '#e8f4f2'
CORAL = '#c45c4a'
CORAL_SOFT = '#fde8e4'
AMBER = '#d97706'
AMBER_SOFT = '#fef3c7'
NAVY = '#1e3a5f'
INK = '#1a1a2e'
INK_MED = '#374151'
INK_LIGHT = '#64748b'
SAND = '#f9f7f3'
LINE = '#d6d0c4'
WHITE = '#ffffff'
PURPLE = '#5b21b6'
CONCEPT_PALETTE = [
    '#f97316', '#a855f7', '#ec4899', '#3b82f6', '#84cc16',
    '#ef4444', '#f59e0b', '#06b6d4', '#6366f1', '#d946ef',
]


# ═══════════════════════════════════════════════════════════
#  Formato
# ═══════════════════════════════════════════════════════════

def _esc(text) -> str:
    return escape(str(text or ''))


def _money(n, currency='MXN') -> str:
    try:
        v = float(n or 0)
    except (TypeError, ValueError):
        v = 0.0
    sign = '-' if v < 0 else ''
    return f'{sign}{_CUR_SYM.get(currency, "$")}{abs(v):,.2f}'


def _pct(num, den) -> int:
    try:
        d = float(den or 0)
        if d <= 0:
            return 0
        return int(round(float(num or 0) / d * 100))
    except (TypeError, ValueError):
        return 0


def _f(n) -> float:
    try:
        return float(n or 0)
    except (TypeError, ValueError):
        return 0.0


def _period_label(period: str) -> str:
    if not period or len(period) < 7:
        return period or ''
    try:
        y, m = period[:7].split('-')
        return f'{_MONTHS_FULL[int(m)].capitalize()} {y}'
    except (ValueError, IndexError):
        return period


def _period_short(period: str) -> str:
    try:
        y, m = period[:7].split('-')
        return f'{_MONTHS_SHORT[int(m)]} {y[2:]}'
    except (ValueError, IndexError):
        return period or ''


def _dt_es(dt) -> str:
    if not dt:
        return ''
    if timezone.is_aware(dt):
        dt = timezone.localtime(dt)
    return f'{dt.day} de {_MONTHS_FULL[dt.month]} de {dt.year}, {dt.strftime("%H:%M")}'


def _date_es(d) -> str:
    if not d:
        return '—'
    if hasattr(d, 'day'):
        return f'{d.day:02d}/{d.month:02d}/{d.year}'
    s = str(d)
    if len(s) >= 10:
        y, m, day = s[:10].split('-')
        return f'{day}/{m}/{y}'
    return s


def _prev_periods(period: str, n: int = 6) -> list[str]:
    y, m = map(int, period.split('-'))
    out = []
    for i in range(n - 1, -1, -1):
        month = m - i
        year = y
        while month <= 0:
            month += 12
            year -= 1
        out.append(f'{year}-{month:02d}')
    return out


def _tenant_address(tenant) -> str:
    fisc = [
        tenant.info_calle, tenant.info_num_externo, tenant.info_colonia,
        tenant.info_ciudad, tenant.state,
        f'C.P. {tenant.info_codigo_postal}' if tenant.info_codigo_postal else '',
    ]
    phys = [
        tenant.addr_calle, tenant.addr_num_externo, tenant.addr_colonia,
        tenant.addr_ciudad, tenant.state,
        f'C.P. {tenant.addr_codigo_postal}' if tenant.addr_codigo_postal else '',
    ]
    parts = [p.strip() for p in fisc if (p or '').strip()]
    if not parts:
        parts = [p.strip() for p in phys if (p or '').strip()]
    return ', '.join(parts)


def _logo_reader(tenant):
    from reportlab.lib.utils import ImageReader
    try:
        if tenant.logo_file and getattr(tenant.logo_file, 'path', None):
            return ImageReader(tenant.logo_file.path)
    except Exception:
        pass
    b64 = (getattr(tenant, 'logo', '') or '').strip()
    if not b64:
        return None
    try:
        if ',' in b64:
            b64 = b64.split(',', 1)[1]
        return ImageReader(io.BytesIO(base64.b64decode(b64)))
    except Exception:
        return None


# ═══════════════════════════════════════════════════════════
#  Canvas con página X de Y
# ═══════════════════════════════════════════════════════════

def NumberedCanvas(*args, **kwargs):
    """reportlab canvasmaker: Canvas subclass with delayed page numbers."""
    from reportlab.pdfgen.canvas import Canvas

    class _NC(Canvas):
        def __init__(self, *a, **kw):
            Canvas.__init__(self, *a, **kw)
            self._saved_page_states = []

        def showPage(self):
            self._saved_page_states.append(dict(self.__dict__))
            self._startPage()

        def save(self):
            num_pages = len(self._saved_page_states)
            for state in self._saved_page_states:
                self.__dict__.update(state)
                self._draw_page_number(num_pages)
                Canvas.showPage(self)
            Canvas.save(self)

        def _draw_page_number(self, page_count):
            from reportlab.lib.pagesizes import A4
            from reportlab.lib.units import cm
            page_w, _ = A4
            self.saveState()
            self.setFillColor(_hex('#94a3b8'))
            self.setFont('Helvetica', 7.5)
            self.drawRightString(
                page_w - 1.6 * cm, 1.05 * cm,
                f'Página {self._pageNumber} de {page_count}',
            )
            self.restoreState()

    return _NC(*args, **kwargs)


def _hex(code):
    from reportlab.lib import colors
    return colors.HexColor(code)


# ═══════════════════════════════════════════════════════════
#  Recolección de datos
# ═══════════════════════════════════════════════════════════

def _report_slice(tenant, period) -> dict:
    from .views import (
        _compute_report_data,
        _compute_saldo_inicial,
        _get_closed_period_snapshot,
    )
    snap = _get_closed_period_snapshot(tenant, period, need='report')
    if snap and snap.get('report_data') is not None:
        return {
            'report_data': snap.get('report_data') or {},
            'saldo_inicial': _f(snap.get('saldo_inicial')),
            'saldo_final': _f(snap.get('saldo_final')),
            'units_count': snap.get('units_count') or Unit.objects.filter(tenant=tenant).count(),
        }
    rd = _compute_report_data(tenant, period)
    si = _compute_saldo_inicial(tenant, period)
    sf = _f(si) + _f(rd.get('total_ingresos_reconciled')) - _f(rd.get('total_egresos_reconciled'))
    return {
        'report_data': rd,
        'saldo_inicial': _f(si),
        'saldo_final': sf,
        'units_count': Unit.objects.filter(tenant=tenant).count(),
    }


def _dashboard_slice(tenant, period) -> dict:
    from .views import (
        DashboardSerializer,
        _compute_dashboard_stats,
        _get_closed_period_snapshot,
    )
    snap = _get_closed_period_snapshot(tenant, period, need='dashboard')
    if snap and isinstance(snap.get('dashboard'), dict) and snap['dashboard']:
        return dict(snap['dashboard'])
    data = _compute_dashboard_stats(tenant, period)
    return dict(DashboardSerializer(data).data)


def _adeudos_slice(tenant, period) -> dict:
    from .views import _compute_statement, _covering_plans_by_unit

    start_period = tenant.operation_start_date or '2024-01'
    units = Unit.objects.filter(tenant=tenant).order_by('unit_id_code')
    plans = _covering_plans_by_unit(tenant.id)
    result = []
    grand_total = Decimal('0')
    units_with_debt = 0

    for unit in units:
        rows, _tc, _tp, bal, prev_debt_adeudo, active_plan = _compute_statement(
            tenant, str(unit.id), start_period, period,
            _prefetched_plan=plans.get(str(unit.id)),
        )
        previous_debt = Decimal(str(unit.previous_debt or 0))
        credit_balance = Decimal(str(unit.credit_balance or 0))
        prev_debt_adeudo_dec = Decimal(str(prev_debt_adeudo))
        if active_plan:
            adj_bal = Decimal(str(bal)) - credit_balance
        else:
            adj_bal = Decimal(str(bal)) + previous_debt - prev_debt_adeudo_dec - credit_balance
        total_adeudo = max(Decimal('0'), adj_bal)
        net_prev_debt = Decimal('0') if active_plan else max(
            Decimal('0'), previous_debt - prev_debt_adeudo_dec - credit_balance
        )
        period_debts = []
        for row in rows:
            paid_bal = Decimal(str(row.get('paid_balance', row['paid'])))
            adeudo_for_period = Decimal(str(row.get('adeudo_received_for_period', 0)))
            effective_paid = paid_bal + adeudo_for_period
            deficit = Decimal(str(row['charge'])) - effective_paid
            if deficit > Decimal('0'):
                period_debts.append({
                    'period': row['period'],
                    'deficit': float(deficit),
                })
        if total_adeudo > Decimal('0'):
            units_with_debt += 1
            grand_total += total_adeudo
            result.append({
                'code': unit.unit_id_code,
                'name': unit.unit_name,
                'responsible': unit.responsible_name,
                'net_prev_debt': float(net_prev_debt),
                'period_debts': period_debts,
                'total_adeudo': float(total_adeudo),
            })

    result.sort(key=lambda x: x['total_adeudo'], reverse=True)
    return {
        'units': result,
        'grand_total': float(grand_total),
        'units_with_debt': units_with_debt,
        'total_units': units.count(),
    }


def _gastos_slice(tenant, period) -> dict:
    qs = (
        GastoEntry.objects.filter(tenant=tenant, period=period)
        .select_related('field')
        .order_by('field__label', 'gasto_date', 'created_at')
    )
    conc, noconc = [], []
    tot_c = tot_n = Decimal('0')
    for g in qs:
        amt = Decimal(str(g.amount or 0))
        row = {
            'payment_type': _PAY_LABELS.get(g.payment_type or '', g.payment_type or '—'),
            'doc_number': g.doc_number or '',
            'date': _date_es(g.gasto_date),
            'provider': g.provider_name or '',
            'notes': (g.notes or '')[:180],
            'rfc': g.provider_rfc or '',
            'invoice': g.provider_invoice or '',
            'amount': float(amt),
            'category': (g.field.label if g.field else (g.field_id_legacy or 'Sin categoría')),
        }
        if g.bank_reconciled:
            conc.append(row)
            tot_c += amt
        else:
            noconc.append(row)
            tot_n += amt
    return {
        'conciliados': conc,
        'no_conciliados': noconc,
        'total_conciliados': float(tot_c),
        'total_no_conciliados': float(tot_n),
    }


def _caja_slice(tenant, period) -> dict:
    qs = CajaChicaEntry.objects.filter(tenant=tenant, period=period).order_by('date', 'created_at')
    rows = []
    total = Decimal('0')
    for c in qs:
        amt = Decimal(str(c.amount or 0))
        total += amt
        rows.append({
            'description': c.description or '',
            'payment_type': _PAY_LABELS.get(c.payment_type or '', c.payment_type or '—'),
            'date': _date_es(c.date),
            'amount': float(amt),
        })
    return {'rows': rows, 'total': float(total)}


def _history_slice(tenant, period) -> list[dict]:
    items = []
    for p in _prev_periods(period, 6):
        sl = _report_slice(tenant, p)
        rd = sl.get('report_data') or {}
        items.append({
            'period': p,
            'label': _period_short(p),
            'ingresos': _f(rd.get('total_ingresos_reconciled')),
            'gastos': _f(rd.get('total_egresos_reconciled')),
            'saldo': _f(sl.get('saldo_final')),
            'ingresos_no': _f(rd.get('ingresos_no_reconciled')),
            'gastos_no': _f(rd.get('total_cheques_transito')),
        })
    return items


def collect_closing_data(tenant, period, closed_period=None) -> dict:
    dash = _dashboard_slice(tenant, period)
    gen = _report_slice(tenant, period)
    rd = gen.get('report_data') or {}
    currency = getattr(tenant, 'currency', None) or 'MXN'

    cargos = _f(dash.get('total_expected'))
    cobranza = _f(rd.get('ingreso_mantenimiento', dash.get('total_collected')))
    ing_adeudo = _f(rd.get('ingreso_adeudo'))
    ing_adelanto = _f(rd.get('ingreso_maint_adelanto'))
    conceptos = rd.get('ingresos_conceptos') or {}
    ing_conceptos = sum(_f(v.get('total')) for v in conceptos.values()) if isinstance(conceptos, dict) else 0
    ing_noid = _f(rd.get('ingresos_no_identificados'))
    ing_ref = _f(rd.get('ingresos_referenciados'))
    ing_noconc = _f(rd.get('ingresos_no_reconciled'))
    total_ing = _f(rd.get('total_ingresos_reconciled', dash.get('total_ingresos')))
    gastos = _f(rd.get('total_egresos_reconciled', dash.get('total_gastos_conciliados')))
    gastos_tot = _f(dash.get('total_gastos', gastos))
    gastos_noconc = max(0.0, gastos_tot - gastos)
    saldo_ini = _f(gen.get('saldo_inicial'))
    saldo_fin = _f(gen.get('saldo_final'))
    balance = total_ing - gastos
    deuda = _f(dash.get('deuda_total'))
    adeudo_rec = _f(dash.get('total_adeudo_recibido'))
    quita = _f(dash.get('total_quita_aplicada'))

    return {
        'tenant': tenant,
        'period': period,
        'currency': currency,
        'closed_period': closed_period,
        'dash': dash,
        'rd': rd,
        'units_count': gen.get('units_count') or dash.get('total_units') or 0,
        'cargos': cargos,
        'cobranza': cobranza,
        'ing_adeudo': ing_adeudo,
        'ing_adelanto': ing_adelanto,
        'ing_conceptos': ing_conceptos,
        'conceptos': conceptos if isinstance(conceptos, dict) else {},
        'ing_noid': ing_noid,
        'ing_ref': ing_ref,
        'ing_noconc': ing_noconc,
        'total_ing': total_ing,
        'gastos': gastos,
        'gastos_noconc': gastos_noconc,
        'saldo_ini': saldo_ini,
        'saldo_fin': saldo_fin,
        'balance': balance,
        'deuda': deuda,
        'adeudo_rec': adeudo_rec,
        'quita': quita,
        'adeudos': _adeudos_slice(tenant, period),
        'gastos_rep': _gastos_slice(tenant, period),
        'caja': _caja_slice(tenant, period),
        'history': _history_slice(tenant, period),
    }


# ═══════════════════════════════════════════════════════════
#  Resumen ejecutivo
# ═══════════════════════════════════════════════════════════

def _executive_paragraphs(d: dict) -> list[str]:
    p = _period_label(d['period'])
    m = lambda n: _money(n, d['currency'])
    cargos, cob, tot, gas, bal = d['cargos'], d['cobranza'], d['total_ing'], d['gastos'], d['balance']
    pct_cob = _pct(cob, cargos)
    pct_ing = _pct(tot, cargos)
    pct_gv = _pct(gas, tot) if tot else 0
    cp = d.get('closed_period')
    closed_txt = ''
    if cp and getattr(cp, 'closed_at', None):
        who = ''
        if getattr(cp, 'closed_by', None) and getattr(cp.closed_by, 'name', None):
            who = f' por {cp.closed_by.name}'
        closed_txt = f' El período quedó cerrado el {_dt_es(cp.closed_at)}{who}.'

    paras = []
    paras.append(
        f'Este documento consolida el cierre económico de <b>{_esc(p)}</b> del condominio '
        f'<b>{_esc(d["tenant"].razon_social or d["tenant"].name)}</b>. '
        f'Las cifras de conciliación bancaria y del tablero económicos corresponden al snapshot '
        f'congelado al cierre.{closed_txt}'
    )

    if cargos > 0:
        cubre = (
            'La cobranza de mantenimiento cubrió el cargo fijo del período.'
            if pct_cob >= 95 else
            'La cobranza de mantenimiento quedó cerca del cargo fijo, con un rezago menor por regularizar.'
            if pct_cob >= 80 else
            'La cobranza de mantenimiento quedó por debajo del cargo fijo esperado; hay un hueco de cobertura que conviene dar seguimiento en el período siguiente.'
            if pct_cob >= 50 else
            'La cobertura de mantenimiento es baja frente a los cargos fijos. El rezago de cobranza es el principal riesgo de liquidez del cierre.'
        )
        paras.append(
            f'Se esperaban <b>{m(cargos)}</b> de cargos fijos (mantenimiento y conceptos obligatorios). '
            f'Se cobró <b>{m(cob)}</b> de mantenimiento del período (<b>{pct_cob}%</b>). {cubre} '
            f'Los ingresos conciliados con banco sumaron <b>{m(tot)}</b> '
            f'({pct_ing}% respecto a los cargos fijos).'
        )
    else:
        paras.append(
            f'No hay cargos fijos configurados para el período. Los ingresos conciliados fueron <b>{m(tot)}</b>.'
        )

    if d['ing_adelanto'] > 0 or d['ing_adeudo'] > 0 or d['ing_conceptos'] > 0:
        bits = []
        if d['ing_adelanto'] > 0:
            bits.append(f'adelantos de mantenimiento por {m(d["ing_adelanto"])}')
        if d['ing_adeudo'] > 0:
            bits.append(f'recuperación de adeudos previos por {m(d["ing_adeudo"])}')
        if d['ing_conceptos'] > 0:
            bits.append(f'conceptos adicionales por {m(d["ing_conceptos"])}')
        paras.append(
            'Además del mantenimiento del mes, el cierre incluye ' + '; '.join(bits) + '.'
        )

    if bal >= 0:
        paras.append(
            f'Los egresos conciliados fueron <b>{m(gas)}</b> ({pct_gv}% de los ingresos conciliados). '
            f'El período cierra con <b>superávit de {m(bal)}</b>. '
            f'El saldo bancario pasa de {m(d["saldo_ini"])} a <b>{m(d["saldo_fin"])}</b>.'
        )
    else:
        paras.append(
            f'Los egresos conciliados fueron <b>{m(gas)}</b> ({pct_gv}% de los ingresos conciliados). '
            f'El período cierra con <b>déficit de {m(abs(bal))}</b>. '
            f'El saldo bancario pasa de {m(d["saldo_ini"])} a <b>{m(d["saldo_fin"])}</b>. '
            'Conviene revisar la concentración de gastos y el ritmo de cobranza antes del siguiente cierre.'
        )

    alerts = []
    if d['ing_noid'] > 0:
        alerts.append(
            f'Quedan <b>{m(d["ing_noid"])}</b> de ingresos no identificados en banco, sin asignar a una unidad. '
            'Deben identificarse para no distorsionar la cobranza ni los estados de cuenta.'
        )
    if d['ing_noconc'] > 0:
        alerts.append(
            f'Hay <b>{m(d["ing_noconc"])}</b> de ingresos registrados en el sistema que no se conciliaron con banco '
            'y por tanto no entran al saldo final.'
        )
    if d['gastos_noconc'] > 0:
        alerts.append(
            f'Hay <b>{m(d["gastos_noconc"])}</b> de gastos (o cheques en tránsito) sin conciliar.'
        )
    caja_tot = _f(d['caja'].get('total'))
    if caja_tot > 0:
        alerts.append(
            f'La caja chica del período suma <b>{m(caja_tot)}</b> en {len(d["caja"]["rows"])} movimiento(s); '
            'este monto no forma parte de la conciliación bancaria del reporte general.'
        )
    if alerts:
        paras.append(' '.join(alerts))

    ad = d['adeudos']
    if ad['units_with_debt'] > 0:
        top = ad['units'][:3]
        top_txt = ', '.join(
            f'{_esc(u["code"])} ({m(u["total_adeudo"])})' for u in top
        )
        rec_den = d['adeudo_rec'] + d['quita'] + d['deuda']
        rec_pct = _pct(d['adeudo_rec'] + d['quita'], rec_den) if rec_den else 0
        paras.append(
            f'Al corte del cierre, <b>{ad["units_with_debt"]}</b> de {ad["total_units"]} unidades '
            f'mantienen adeudo, por un total de <b>{m(ad["grand_total"])}</b>. '
            f'En el período se recuperaron {m(d["adeudo_rec"])} de adeudo previo'
            + (f' y se aplicó quita por {m(d["quita"])}' if d['quita'] else '')
            + f' (recuperación efectiva {rec_pct}%). '
            f'Las unidades con mayor saldo son: {top_txt}.'
        )
    else:
        paras.append(
            'Al corte del cierre no hay unidades con adeudo pendiente. '
            'La cartera se considera al corriente.'
        )

    hist = d.get('history') or []
    if len(hist) >= 2:
        prev = hist[-2]
        cur = hist[-1]
        di = cur['ingresos'] - prev['ingresos']
        dg = cur['gastos'] - prev['gastos']
        dir_i = 'subieron' if di >= 0 else 'bajaron'
        dir_g = 'subieron' if dg >= 0 else 'bajaron'
        paras.append(
            f'Frente al período anterior ({_esc(_period_label(prev["period"]))}), '
            f'los ingresos conciliados {dir_i} {m(abs(di))} y los egresos conciliados {dir_g} {m(abs(dg))}.'
        )

    paras.append(
        'Los anexos de este expediente reproducen el Reporte general de conciliación, '
        'el Reporte de adeudos, el Reporte de gastos y el Reporte de caja chica '
        'con el mismo criterio de cálculo de cada módulo, para archivo del cierre.'
    )
    return paras


# ═══════════════════════════════════════════════════════════
#  Gráficas (Drawing)
# ═══════════════════════════════════════════════════════════

def _hbar_drawing(items, width, height, currency='MXN'):
    """Barras horizontales simples: [{label, value, color}]."""
    from reportlab.graphics.shapes import Drawing, Rect, String

    items = [i for i in items if _f(i.get('value')) > 0 or i.get('show_zero')]
    if not items:
        d = Drawing(width, 28)
        d.add(String(0, 10, 'Sin datos para graficar', fontName='Helvetica-Oblique', fontSize=8, fillColor=_hex(INK_LIGHT)))
        return d

    max_v = max((_f(i['value']) for i in items), default=1) or 1
    row_h = max(16, min(22, (height - 8) / max(len(items), 1)))
    h = max(height, row_h * len(items) + 8)
    d = Drawing(width, h)
    label_w = min(150, width * 0.32)
    val_w = 78
    bar_max = width - label_w - val_w - 12
    y = h - row_h
    for it in items:
        v = _f(it['value'])
        bw = max(2, bar_max * (v / max_v))
        d.add(String(0, y + 4, (it.get('label') or '')[:28], fontName='Helvetica', fontSize=7.5, fillColor=_hex(INK_MED)))
        d.add(Rect(label_w, y + 2, bar_max, row_h - 6, fillColor=_hex('#eef2f6'), strokeColor=None))
        d.add(Rect(label_w, y + 2, bw, row_h - 6, fillColor=_hex(it.get('color') or TEAL), strokeColor=None))
        d.add(String(
            width - 2, y + 4, _money(v, currency),
            fontName='Helvetica-Bold', fontSize=7.5, fillColor=_hex(INK),
            textAnchor='end',
        ))
        y -= row_h
    return d


def _pie_drawing(items, width, height, currency='MXN'):
    from reportlab.graphics.charts.piecharts import Pie
    from reportlab.graphics.shapes import Drawing, String

    segs = [(i.get('label') or '', _f(i.get('value')), i.get('color') or TEAL) for i in items if _f(i.get('value')) > 0]
    d = Drawing(width, height)
    if not segs:
        d.add(String(8, height / 2, 'Sin composición para graficar', fontName='Helvetica-Oblique', fontSize=8, fillColor=_hex(INK_LIGHT)))
        return d
    pie = Pie()
    side = min(height - 8, width * 0.42)
    pie.x = 6
    pie.y = (height - side) / 2
    pie.width = side
    pie.height = side
    pie.data = [s[1] for s in segs]
    pie.labels = [''] * len(segs)
    pie.slices.strokeWidth = 0.6
    pie.slices.strokeColor = _hex(WHITE)
    for i, s in enumerate(segs):
        pie.slices[i].fillColor = _hex(s[2])
    d.add(pie)
    lx = side + 18
    total = sum(s[1] for s in segs) or 1
    row = min(14, (height - 10) / max(len(segs), 1))
    y = height - 14
    for lab, val, col in segs:
        d.add(String(lx, y, '●', fontName='Helvetica', fontSize=8, fillColor=_hex(col)))
        pct = int(round(val / total * 100))
        d.add(String(
            lx + 12, y,
            f'{lab[:26]}  {_money(val, currency)} ({pct}%)',
            fontName='Helvetica', fontSize=7, fillColor=_hex(INK_MED),
        ))
        y -= row
        if y < 4:
            break
    return d


def _history_drawing(history, width, height, currency='MXN'):
    from reportlab.graphics.shapes import Drawing, Rect, String, Line

    d = Drawing(width, height)
    if not history:
        d.add(String(8, height / 2, 'Sin historial', fontName='Helvetica-Oblique', fontSize=8, fillColor=_hex(INK_LIGHT)))
        return d

    pad_l, pad_r, pad_t, pad_b = 44, 12, 16, 28
    plot_w = width - pad_l - pad_r
    plot_h = height - pad_t - pad_b
    vals = []
    for h in history:
        vals.extend([h['ingresos'], h['gastos'], h['saldo'], h['ingresos_no'], h['gastos_no']])
    vmin = min(vals + [0])
    vmax = max(vals + [1])
    if vmin == vmax:
        vmax = vmin + 1
    span = vmax - vmin

    def yx(v):
        return pad_b + (v - vmin) / span * plot_h

    def xx(i, n):
        return pad_l + (i + 0.5) * (plot_w / n)

    # grid
    d.add(Rect(pad_l, pad_b, plot_w, plot_h, fillColor=_hex(WHITE), strokeColor=_hex(LINE), strokeWidth=0.4))
    for g in range(5):
        gy = pad_b + plot_h * g / 4
        d.add(Line(pad_l, gy, pad_l + plot_w, gy, strokeColor=_hex('#e5e7eb'), strokeWidth=0.3))
        gv = vmin + span * g / 4
        if abs(gv) >= 1_000_000:
            lab = f'${gv/1_000_000:.1f}M'
        elif abs(gv) >= 1000:
            lab = f'${gv/1000:.0f}k'
        else:
            lab = f'${gv:.0f}'
        d.add(String(pad_l - 4, gy - 3, lab, fontName='Helvetica', fontSize=6, fillColor=_hex(INK_LIGHT), textAnchor='end'))

    n = len(history)
    bw = plot_w / n * 0.18
    series = [
        ('ingresos', TEAL, 0),
        ('gastos', CORAL, 1),
        ('ingresos_no', '#5eead4', 2),
        ('gastos_no', '#f0a090', 3),
    ]
    for i, h in enumerate(history):
        cx = xx(i, n)
        for key, col, off in series:
            v = h.get(key) or 0
            y0 = yx(0)
            y1 = yx(v)
            x = cx - 2 * bw + off * (bw * 0.95)
            top, bot = (y1, y0) if y1 >= y0 else (y0, y1)
            d.add(Rect(x, bot, bw * 0.85, max(1, top - bot), fillColor=_hex(col), strokeColor=None))
        d.add(String(cx, 8, h.get('label') or '', fontName='Helvetica', fontSize=6.5, fillColor=_hex(INK_MED), textAnchor='middle'))

    # saldo line
    pts = []
    for i, h in enumerate(history):
        pts.append((xx(i, n), yx(h.get('saldo') or 0)))
    for a, b in zip(pts, pts[1:]):
        d.add(Line(a[0], a[1], b[0], b[1], strokeColor=_hex(NAVY), strokeWidth=1.4))
    for x, y in pts:
        d.add(Rect(x - 2.2, y - 2.2, 4.4, 4.4, fillColor=_hex(NAVY), strokeColor=_hex(WHITE), strokeWidth=0.6))

    # legend
    legend = [
        (TEAL, 'Ing. conc.'),
        (CORAL, 'Egr. conc.'),
        ('#5eead4', 'Ing. no conc.'),
        ('#f0a090', 'Egr. no conc.'),
        (NAVY, 'Saldo final'),
    ]
    lx = pad_l
    for col, lab in legend:
        d.add(Rect(lx, height - 12, 8, 8, fillColor=_hex(col), strokeColor=None))
        d.add(String(lx + 11, height - 11, lab, fontName='Helvetica', fontSize=6.5, fillColor=_hex(INK_MED)))
        lx += 78
    return d


def _gauge_bar(pct, color, width, label_left, label_right):
    from reportlab.platypus import Table, TableStyle, Paragraph
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.enums import TA_LEFT, TA_RIGHT, TA_CENTER
    from reportlab.lib.units import cm

    safe = max(0, min(100, int(pct)))
    st_l = ParagraphStyle('gl', fontName='Helvetica', fontSize=7.5, textColor=_hex(INK_LIGHT), alignment=TA_LEFT)
    st_c = ParagraphStyle('gc', fontName='Helvetica-Bold', fontSize=11, textColor=_hex(color), alignment=TA_CENTER)
    st_r = ParagraphStyle('gr', fontName='Helvetica', fontSize=7.5, textColor=_hex(INK_LIGHT), alignment=TA_RIGHT)
    fill_w = max(0.15 * cm, width * safe / 100)
    empty_w = max(0.01, width - fill_w)
    bar = Table([['']], colWidths=[fill_w])
    bar.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), _hex(color)),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
    ]))
    track = Table([[bar, '']], colWidths=[fill_w, empty_w])
    track.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), _hex('#eef2f6')),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
        ('ROUNDEDCORNERS', [3, 3, 3, 3]),
    ]))
    head = Table(
        [[Paragraph(_esc(label_left), st_l), Paragraph(f'{int(pct)}%', st_c), Paragraph(_esc(label_right), st_r)]],
        colWidths=[width * 0.38, width * 0.24, width * 0.38],
    )
    head.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
    ]))
    wrap = Table([[head], [track]], colWidths=[width])
    wrap.setStyle(TableStyle([
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 2),
        ('TOPPADDING', (0, 0), (-1, -1), 2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
    ]))
    return wrap


# ═══════════════════════════════════════════════════════════
#  Construcción del PDF
# ═══════════════════════════════════════════════════════════

def generate_closing_report_pdf(tenant, period, closed_period=None) -> bytes | None:
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.units import cm
        from reportlab.platypus import (
            SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
            PageBreak, HRFlowable, Flowable,
        )
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.enums import TA_LEFT, TA_RIGHT, TA_CENTER, TA_JUSTIFY
    except ImportError:
        logger.exception('ReportLab no disponible')
        return None

    data = collect_closing_data(tenant, period, closed_period=closed_period)
    cur = data['currency']
    m = lambda n: _money(n, cur)
    generated_at = timezone.localtime(timezone.now())
    gen_label = _dt_es(generated_at)
    page_w, page_h = A4
    margin_h = 1.6 * cm
    content_w = page_w - 2 * margin_h
    logo = _logo_reader(tenant)
    tenant_name = (tenant.razon_social or tenant.name or 'Condominio').strip()
    tenant_alias = (tenant.name or '').strip()
    rfc = (tenant.rfc or '').strip()
    addr = _tenant_address(tenant)
    phone = (getattr(tenant, 'phone', None) or '').strip()

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=A4,
        leftMargin=margin_h, rightMargin=margin_h,
        topMargin=3.55 * cm, bottomMargin=2.15 * cm,
        title=f'Reporte de Cierre — {_period_label(period)}',
        author='Homly',
        subject=f'Cierre de período {period} — {tenant_name}',
    )
    styles = getSampleStyleSheet()

    def S(name, **kw):
        return ParagraphStyle(name, parent=styles['Normal'], **kw)

    st_h1 = S('h1', fontName='Helvetica-Bold', fontSize=16, textColor=_hex(NAVY), leading=20, spaceAfter=2)
    st_h2 = S('h2', fontName='Helvetica-Bold', fontSize=11, textColor=_hex(TEAL_DARK), leading=14, spaceBefore=8, spaceAfter=6)
    st_h3 = S('h3', fontName='Helvetica-Bold', fontSize=9, textColor=_hex(NAVY), leading=12, spaceBefore=6, spaceAfter=4)
    st_body = S('body', fontName='Helvetica', fontSize=9, textColor=_hex(INK_MED), leading=13, alignment=TA_JUSTIFY, spaceAfter=7)
    st_small = S('sm', fontName='Helvetica', fontSize=8, textColor=_hex(INK_LIGHT), leading=11)
    st_th = S('th', fontName='Helvetica-Bold', fontSize=7, textColor=_hex(WHITE), leading=9)
    st_td = S('td', fontName='Helvetica', fontSize=7.5, textColor=_hex(INK), leading=10)
    st_tdr = S('tdr', fontName='Helvetica', fontSize=7.5, textColor=_hex(INK), leading=10, alignment=TA_RIGHT)
    st_tdb = S('tdb', fontName='Helvetica-Bold', fontSize=7.5, textColor=_hex(INK), leading=10, alignment=TA_RIGHT)
    st_kpi_l = S('kpil', fontName='Helvetica', fontSize=7, textColor=_hex(INK_LIGHT), leading=9, alignment=TA_CENTER)
    st_kpi_v = S('kpiv', fontName='Helvetica-Bold', fontSize=10, textColor=_hex(INK), leading=13, alignment=TA_CENTER)
    st_kpi_s = S('kpis', fontName='Helvetica', fontSize=6.5, textColor=_hex(INK_LIGHT), leading=8, alignment=TA_CENTER)
    st_cat = S('cat', fontName='Helvetica-Bold', fontSize=8, textColor=_hex(NAVY), leading=10)
    st_muted = S('mut', fontName='Helvetica-Oblique', fontSize=8, textColor=_hex(INK_LIGHT), leading=11)

    def header_footer(canvas, _doc):
        canvas.saveState()
        # Header band
        canvas.setFillColor(_hex(NAVY))
        canvas.rect(0, page_h - 3.25 * cm, page_w, 3.25 * cm, fill=1, stroke=0)
        canvas.setFillColor(_hex(TEAL))
        canvas.rect(0, page_h - 3.35 * cm, page_w, 0.12 * cm, fill=1, stroke=0)

        x0 = margin_h
        y_logo = page_h - 2.85 * cm
        text_x = x0
        if logo:
            try:
                canvas.drawImage(logo, x0, y_logo, width=1.7 * cm, height=1.7 * cm, mask='auto', preserveAspectRatio=True, anchor='c')
                text_x = x0 + 1.95 * cm
            except Exception:
                text_x = x0

        canvas.setFillColor(_hex(WHITE))
        canvas.setFont('Helvetica-Bold', 11)
        canvas.drawString(text_x, page_h - 1.35 * cm, tenant_name[:70])
        canvas.setFont('Helvetica', 7.5)
        canvas.setFillColor(_hex('#c5d4e8'))
        yinfo = page_h - 1.7 * cm
        if tenant_alias and tenant_alias.lower() != tenant_name.lower():
            canvas.drawString(text_x, yinfo, tenant_alias[:70])
            yinfo -= 0.32 * cm
        meta = []
        if rfc:
            meta.append(f'RFC {rfc}')
        if phone:
            meta.append(f'Tel. {phone}')
        if meta:
            canvas.drawString(text_x, yinfo, '  ·  '.join(meta)[:90])
            yinfo -= 0.32 * cm
        if addr:
            canvas.drawString(text_x, yinfo, addr[:95])

        canvas.setFillColor(_hex(WHITE))
        canvas.setFont('Helvetica-Bold', 9)
        canvas.drawRightString(page_w - margin_h, page_h - 1.4 * cm, 'REPORTE DE CIERRE')
        canvas.setFont('Helvetica', 8)
        canvas.setFillColor(_hex('#c5d4e8'))
        canvas.drawRightString(page_w - margin_h, page_h - 1.8 * cm, _period_label(period))
        canvas.setFont('Helvetica', 7)
        canvas.drawRightString(page_w - margin_h, page_h - 2.15 * cm, 'CONFIDENCIAL')

        # Footer
        canvas.setFillColor(_hex(SAND))
        canvas.rect(0, 0, page_w, 1.85 * cm, fill=1, stroke=0)
        canvas.setFillColor(_hex(TEAL))
        canvas.rect(0, 1.85 * cm, page_w, 0.08 * cm, fill=1, stroke=0)
        canvas.setFillColor(_hex(INK_MED))
        canvas.setFont('Helvetica-Bold', 8)
        canvas.drawString(margin_h, 1.25 * cm, 'Homly')
        canvas.setFont('Helvetica', 7)
        canvas.setFillColor(_hex(INK_LIGHT))
        canvas.drawString(margin_h + 1.4 * cm, 1.25 * cm, '· Sistema de administración condominial')
        canvas.drawString(margin_h, 0.9 * cm, f'Generado: {gen_label}')
        canvas.restoreState()

    def section(title):
        return Paragraph(_esc(title).upper(), st_h2)

    def kpi_grid(cells):
        """cells: list of (label, value, sub, accent_hex)"""
        n = len(cells)
        col_w = content_w / n
        row1 = []
        for lab, val, sub, accent in cells:
            inner = Table(
                [
                    [Paragraph(_esc(lab).upper(), st_kpi_l)],
                    [Paragraph(_esc(val), st_kpi_v)],
                    [Paragraph(_esc(sub), st_kpi_s)],
                ],
                colWidths=[col_w - 8],
            )
            inner.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, -1), _hex(WHITE)),
                ('BOX', (0, 0), (-1, -1), 0.4, _hex(LINE)),
                ('LINEABOVE', (0, 0), (-1, 0), 2.2, _hex(accent)),
                ('TOPPADDING', (0, 0), (-1, -1), 5),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
                ('LEFTPADDING', (0, 0), (-1, -1), 4),
                ('RIGHTPADDING', (0, 0), (-1, -1), 4),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ]))
            row1.append(inner)
        t = Table([row1], colWidths=[col_w] * n)
        t.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('LEFTPADDING', (0, 0), (-1, -1), 3),
            ('RIGHTPADDING', (0, 0), (-1, -1), 3),
        ]))
        return t

    def data_table(headers, rows, col_widths, emphasize_last=True):
        head = [Paragraph(_esc(h), st_th) for h in headers]
        body = [head]
        for r in rows:
            cells = []
            for i, c in enumerate(r):
                sty = st_tdb if (emphasize_last and i == len(r) - 1) else (st_tdr if i == len(r) - 1 else st_td)
                if i == 0:
                    sty = st_td
                cells.append(Paragraph(_esc(c).replace('\n', '<br/>'), sty))
            body.append(cells)
        t = Table(body, colWidths=col_widths, repeatRows=1)
        cmds = [
            ('BACKGROUND', (0, 0), (-1, 0), _hex(NAVY)),
            ('TEXTCOLOR', (0, 0), (-1, 0), _hex(WHITE)),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 7.5),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('GRID', (0, 0), (-1, -1), 0.25, _hex('#e5e7eb')),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ('LEFTPADDING', (0, 0), (-1, -1), 5),
            ('RIGHTPADDING', (0, 0), (-1, -1), 5),
            ('ALIGN', (-1, 1), (-1, -1), 'RIGHT'),
        ]
        for i in range(1, len(body)):
            if i % 2 == 0:
                cmds.append(('BACKGROUND', (0, i), (-1, i), _hex(SAND)))
        t.setStyle(TableStyle(cmds))
        return t

    def kv_rows(pairs, total_label=None, total_value=None, color=TEAL):
        rows = []
        for lab, val in pairs:
            if _f(val) == 0 and lab not in ('Saldo inicial',):
                continue
            rows.append([
                Paragraph(_esc(lab), st_td),
                Paragraph(m(val), st_tdb),
            ])
        if not rows and total_label is None:
            return Paragraph('Sin movimientos en esta sección.', st_muted)
        if total_label is not None:
            rows.append([
                Paragraph(f'<b>{_esc(total_label)}</b>', st_td),
                Paragraph(f'<b>{m(total_value)}</b>', st_tdb),
            ])
        t = Table(rows, colWidths=[content_w * 0.72, content_w * 0.28])
        cmds = [
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('LINEBELOW', (0, 0), (-1, -2), 0.3, _hex('#e5e7eb')),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
        ]
        if total_label is not None:
            cmds += [
                ('BACKGROUND', (0, -1), (-1, -1), _hex(TEAL_SOFT if color == TEAL else CORAL_SOFT)),
                ('LINEABOVE', (0, -1), (-1, -1), 1.0, _hex(color)),
            ]
        t.setStyle(TableStyle(cmds))
        return t

    def grouped_gasto_table(items):
        if not items:
            return [Paragraph('Sin registros en este período.', st_muted)]
        groups = defaultdict(list)
        order = []
        for it in items:
            cat = it.get('category') or 'Sin categoría'
            if cat not in groups:
                order.append(cat)
            groups[cat].append(it)
        flow = []
        for cat in order:
            rows_g = groups[cat]
            sub = sum(_f(x['amount']) for x in rows_g)
            flow.append(Paragraph(
                f'{_esc(cat).upper()}  —  {len(rows_g)} registro(s)  ·  subtotal {m(sub)}',
                st_cat,
            ))
            table_rows = []
            for g in rows_g:
                rfc_fac = ' / '.join(x for x in [g.get('rfc'), (f'Fac. {g["invoice"]}' if g.get('invoice') else '')] if x) or '—'
                prov = g.get('provider') or '—'
                if g.get('notes'):
                    prov = f'{prov}\n{g["notes"]}'
                table_rows.append([
                    g.get('payment_type') or '—',
                    g.get('doc_number') or '—',
                    g.get('date') or '—',
                    prov,
                    rfc_fac,
                    m(g.get('amount')),
                ])
            flow.append(data_table(
                ['Forma de pago', 'No. doc.', 'Fecha', 'Proveedor', 'RFC / Factura', 'Monto'],
                table_rows,
                [content_w * x for x in (0.16, 0.12, 0.12, 0.28, 0.18, 0.14)],
            ))
            flow.append(Spacer(1, 8))
        return flow

    story = []

    # ── Portada / título ───────────────────────────────────
    story.append(Paragraph('Reporte de cierre de período', st_h1))
    story.append(Paragraph(
        f'{_esc(_period_label(period))}  ·  Expediente de cierre económico  ·  Homly',
        st_small,
    ))
    story.append(Spacer(1, 6))
    story.append(HRFlowable(width='100%', thickness=1, color=_hex(TEAL), spaceAfter=10))

    # ── KPIs ───────────────────────────────────────────────
    story.append(section('1. Resumen del dashboard económicos'))
    pct_cob_m = _pct(data['cobranza'], data['cargos'])
    pct_ing_c = _pct(data['total_ing'], data['cargos'])
    pct_gv = _pct(data['gastos'], data['total_ing'])
    kpis_top = [
        ('Cargos fijos', m(data['cargos']), 'mantenimiento + obligatorios', NAVY),
        ('Cobranza mensual', m(data['cobranza']), f'{pct_cob_m}% del cargo fijo', TEAL),
        ('Total ingresos', m(data['total_ing']), f'{pct_ing_c}% vs cargos · conciliados', TEAL),
        ('Egresos conciliados', m(data['gastos']), f'{pct_gv}% de los ingresos', CORAL),
    ]
    story.append(kpi_grid(kpis_top))
    story.append(Spacer(1, 8))
    kpis_bot = [
        ('Balance neto', m(data['balance']), 'superávit' if data['balance'] >= 0 else 'déficit', TEAL if data['balance'] >= 0 else CORAL),
        ('Conceptos adicionales', m(data['ing_conceptos']), f'{_pct(data["ing_conceptos"], data["total_ing"])}% del ingreso', AMBER),
        ('No identificados', m(data['ing_noid']), 'en banco sin asignar a unidad', AMBER),
        ('Caja chica', m(data['caja']['total']), f'{len(data["caja"]["rows"])} movimiento(s)', PURPLE),
    ]
    story.append(kpi_grid(kpis_bot))
    story.append(Spacer(1, 12))

    # Gauges
    story.append(Paragraph('Indicadores de eficiencia', st_h3))
    g1 = _gauge_bar(
        _pct(data['total_ing'], data['cargos']) if data['cargos'] else 0,
        TEAL if _pct(data['total_ing'], data['cargos']) >= 90 else (AMBER if _pct(data['total_ing'], data['cargos']) >= 70 else CORAL),
        content_w / 2 - 10,
        f"Ingresos {m(data['total_ing'])}",
        f"Cargos {m(data['cargos'])}",
    )
    g2 = _gauge_bar(
        pct_gv,
        TEAL if pct_gv <= 60 else (AMBER if pct_gv <= 89 else CORAL),
        content_w / 2 - 10,
        f"Egresos {m(data['gastos'])}",
        f"Ingresos {m(data['total_ing'])}",
    )
    gauges = Table(
        [[
            [Paragraph('Eficiencia de cobranza', st_h3), g1],
            [Paragraph('Ratio egresos vs ingresos', st_h3), g2],
        ]],
        colWidths=[content_w / 2, content_w / 2],
    )
    gauges.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 4),
        ('RIGHTPADDING', (0, 0), (-1, -1), 4),
    ]))
    story.append(gauges)
    story.append(Spacer(1, 10))

    # Composición + estatus
    concept_segs = []
    for idx, (key, obj) in enumerate((data['conceptos'] or {}).items()):
        lab = (obj or {}).get('label') or key
        if lab in ('prevDebt', 'prev_debt'):
            lab = 'Cobranza de adeudo'
        concept_segs.append({
            'label': lab,
            'value': _f((obj or {}).get('total')),
            'color': CONCEPT_PALETTE[idx % len(CONCEPT_PALETTE)],
        })
    income_segs = [
        {'label': 'Mantenimiento', 'value': data['cobranza'], 'color': TEAL},
        {'label': 'Adelantos', 'value': data['ing_adelanto'], 'color': '#2dd4bf'},
        {'label': 'Cobranza de adeudo', 'value': data['ing_adeudo'], 'color': AMBER},
        *concept_segs,
        {'label': 'No identificados', 'value': data['ing_noid'], 'color': '#f59e0b'},
        {'label': 'Ajustes de centavos', 'value': data['ing_ref'], 'color': '#64748b'},
    ]
    dash = data['dash']
    paid = int(dash.get('paid_count') or 0)
    exempt = int(dash.get('exempt_count') or 0)
    partial = int(dash.get('partial_count') or 0)
    pending = int(dash.get('pending_count') or 0)
    status_items = [
        {'label': f'Pagado ({paid + exempt})', 'value': paid + exempt, 'color': TEAL, 'show_zero': True},
        {'label': f'Parcial ({partial})', 'value': partial, 'color': AMBER, 'show_zero': True},
        {'label': f'Pendiente ({pending})', 'value': pending, 'color': CORAL, 'show_zero': True},
    ]

    pie = _pie_drawing(income_segs, content_w / 2 - 8, 150, cur)
    bars = _hbar_drawing(status_items, content_w / 2 - 8, 120, cur)
    class _Draw(Flowable):
        def __init__(self, drawing):
            super().__init__()
            self.d = drawing
            self.width = drawing.width
            self.height = drawing.height

        def draw(self):
            self.d.drawOn(self.canv, 0, 0)

        def wrap(self, aw, ah):
            return self.width, self.height

    charts = Table(
        [[
            [Paragraph('Composición de ingresos conciliados', st_h3), _Draw(pie)],
            [Paragraph('Unidades por estatus', st_h3), _Draw(bars)],
        ]],
        colWidths=[content_w / 2, content_w / 2],
    )
    charts.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('BOX', (0, 0), (0, 0), 0.4, _hex(LINE)),
        ('BOX', (1, 0), (1, 0), 0.4, _hex(LINE)),
        ('BACKGROUND', (0, 0), (-1, -1), _hex(WHITE)),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(charts)
    story.append(Spacer(1, 10))

    # Saldos
    story.append(Paragraph('Saldos bancarios del período', st_h3))
    story.append(kpi_grid([
        ('Saldo inicial', m(data['saldo_ini']), 'cierre del período anterior', NAVY),
        ('Ingresos conciliados', m(data['total_ing']), 'entran al banco', TEAL),
        ('Egresos conciliados', m(data['gastos']), 'salen del banco', CORAL),
        ('Saldo final', m(data['saldo_fin']), 'al cierre', TEAL if data['saldo_fin'] >= 0 else CORAL),
    ]))
    story.append(Spacer(1, 10))

    if data['deuda'] > 0 or data['adeudo_rec'] > 0:
        rec_den = data['adeudo_rec'] + data['quita'] + data['deuda']
        rec_pct = _pct(data['adeudo_rec'] + data['quita'], rec_den)
        story.append(Paragraph('Recuperación de deuda', st_h3))
        story.append(kpi_grid([
            ('Deuda al corte', m(data['deuda']), 'saldo de unidades', CORAL),
            ('Recibido en el período', m(data['adeudo_rec']), 'cobro de adeudo previo', TEAL),
            ('Quita aplicada', m(data['quita']), 'liquidaciones', AMBER),
            ('Recuperación efectiva', f'{rec_pct}%', 'recibido + quita vs cartera', TEAL),
        ]))
        story.append(Spacer(1, 8))

    # Comparativo
    story.append(Paragraph('Comparativo de períodos (últimos 6)', st_h3))
    story.append(_Draw(_history_drawing(data['history'], content_w, 165, cur)))
    story.append(Spacer(1, 6))
    hist_rows = [[
        h['label'], m(h['ingresos']), m(h['gastos']), m(h['saldo']),
        m(h['ingresos_no']), m(h['gastos_no']),
    ] for h in data['history']]
    story.append(data_table(
        ['Período', 'Ing. conc.', 'Egr. conc.', 'Saldo final', 'Ing. no conc.', 'Egr. no conc.'],
        hist_rows,
        [content_w * x for x in (0.14, 0.18, 0.18, 0.18, 0.16, 0.16)],
    ))

    # ── Resumen ejecutivo ──────────────────────────────────
    story.append(PageBreak())
    story.append(section('2. Resumen ejecutivo del cierre'))
    story.append(Paragraph(
        'Análisis de los movimientos del período cerrado. Redacción generada a partir de las cifras '
        'congeladas del tablero y de la conciliación bancaria.',
        st_muted,
    ))
    story.append(Spacer(1, 6))
    for para in _executive_paragraphs(data):
        story.append(Paragraph(para, st_body))

    # ── Reporte general ────────────────────────────────────
    story.append(PageBreak())
    story.append(section('3. Anexo A — Reporte general'))
    story.append(Paragraph(
        'Conciliación bancaria del período (mismo criterio que el módulo Estados de cuenta → Reporte general).',
        st_muted,
    ))
    story.append(Spacer(1, 6))
    story.append(kpi_grid([
        ('Saldo inicial', m(data['saldo_ini']), 'banco', NAVY),
        ('Ingresos conciliados', m(data['total_ing']), f'{data["rd"].get("ingreso_units_count", 0)} unidades', TEAL),
        ('Egresos conciliados', m(data['gastos']), '', CORAL),
        ('Saldo final banco', m(data['saldo_fin']), '', TEAL if data['saldo_fin'] >= 0 else CORAL),
    ]))
    story.append(Spacer(1, 10))
    rd = data['rd']
    ing_pairs = [
        ('Mantenimiento', rd.get('ingreso_mantenimiento')),
        ('Mantenimiento adelantado', rd.get('ingreso_maint_adelanto')),
        ('Cobranza de adeudo', rd.get('ingreso_adeudo')),
        ('Ajustes de centavos / referenciados', rd.get('ingresos_referenciados')),
    ]
    for _k, obj in (rd.get('ingresos_conceptos') or {}).items():
        ing_pairs.append(((obj or {}).get('label') or _k, (obj or {}).get('total')))
    for ui in (rd.get('ingresos_no_identificados_list') or []):
        lab = f'No identificado: {(ui or {}).get("concept") or "depósito"}'
        ing_pairs.append((lab, (ui or {}).get('amount')))
    if not (rd.get('ingresos_no_identificados_list') or []) and _f(rd.get('ingresos_no_identificados')):
        ing_pairs.append(('Ingresos no identificados', rd.get('ingresos_no_identificados')))
    story.append(Paragraph('Ingresos conciliados', st_h3))
    story.append(kv_rows(ing_pairs, 'Total ingresos conciliados', rd.get('total_ingresos_reconciled'), TEAL))

    story.append(Paragraph('Egresos conciliados', st_h3))
    egr_pairs = [(e.get('label') or 'Gasto', e.get('amount')) for e in (rd.get('egresos_reconciled') or [])]
    if not egr_pairs:
        story.append(Paragraph('Sin egresos conciliados.', st_muted))
    else:
        story.append(kv_rows(egr_pairs, 'Total egresos conciliados', rd.get('total_egresos_reconciled'), CORAL))

    if _f(rd.get('ingresos_no_reconciled')) or (rd.get('ingresos_no_recon_details') or []):
        story.append(Paragraph('Ingresos no conciliados (no entran al saldo)', st_h3))
        det_rows = [
            [
                d.get('unit_id') or '',
                d.get('unit_name') or '',
                _PAY_LABELS.get(d.get('payment_type') or '', d.get('payment_type') or '—'),
                d.get('payment_date') or '—',
                m(d.get('amount')),
            ]
            for d in (rd.get('ingresos_no_recon_details') or [])
        ]
        if det_rows:
            story.append(data_table(
                ['Unidad', 'Nombre', 'Forma de pago', 'Fecha', 'Monto'],
                det_rows,
                [content_w * x for x in (0.16, 0.28, 0.2, 0.16, 0.2)],
            ))
        else:
            story.append(Paragraph(f'Total no conciliado: {m(rd.get("ingresos_no_reconciled"))}', st_td))

    if rd.get('cheques_transito') or _f(rd.get('total_cheques_transito')):
        story.append(Paragraph('Egresos no conciliados / cheques en tránsito', st_h3))
        ch_pairs = [(e.get('label') or 'Gasto', e.get('amount')) for e in (rd.get('cheques_transito') or [])]
        story.append(kv_rows(ch_pairs, 'Total no conciliado', rd.get('total_cheques_transito'), CORAL))

    # ── Adeudos ────────────────────────────────────────────
    story.append(PageBreak())
    story.append(section('4. Anexo B — Reporte de adeudos'))
    story.append(Paragraph(
        'Cartera al corte del período cerrado (mismo criterio que Estados de cuenta → Reporte de adeudos).',
        st_muted,
    ))
    ad = data['adeudos']
    avg = (ad['grand_total'] / ad['units_with_debt']) if ad['units_with_debt'] else 0
    story.append(Spacer(1, 6))
    story.append(kpi_grid([
        ('Unidades con adeudo', f'{ad["units_with_debt"]} / {ad["total_units"]}', 'al corte', CORAL),
        ('Adeudo total', m(ad['grand_total']), 'cartera', CORAL),
        ('Promedio por unidad', m(avg), 'con saldo', AMBER),
        ('Corte', _period_label(period), 'período cerrado', NAVY),
    ]))
    story.append(Spacer(1, 10))
    if not ad['units']:
        story.append(Paragraph('No hay unidades con adeudo al corte de este período.', st_muted))
    else:
        ad_rows = []
        for u in ad['units']:
            periods = ', '.join(_period_short(p['period']) for p in (u.get('period_debts') or [])[:8])
            if len(u.get('period_debts') or []) > 8:
                periods += '…'
            ad_rows.append([
                u.get('code') or '',
                u.get('name') or '',
                u.get('responsible') or '',
                m(u.get('net_prev_debt')),
                periods or '—',
                m(u.get('total_adeudo')),
            ])
        story.append(data_table(
            ['Unidad', 'Nombre', 'Responsable', 'Deuda ant.', 'Períodos con saldo', 'Total adeudo'],
            ad_rows,
            [content_w * x for x in (0.12, 0.18, 0.22, 0.14, 0.18, 0.16)],
        ))

    # ── Gastos ─────────────────────────────────────────────
    story.append(PageBreak())
    story.append(section('5. Anexo C — Reporte de gastos'))
    story.append(Paragraph(
        'Egresos del período (mismo criterio que el módulo Gastos).',
        st_muted,
    ))
    gr = data['gastos_rep']
    story.append(Spacer(1, 6))
    story.append(kpi_grid([
        ('Conciliados', m(gr['total_conciliados']), f'{len(gr["conciliados"])} registro(s)', TEAL),
        ('No conciliados', m(gr['total_no_conciliados']), f'{len(gr["no_conciliados"])} registro(s)', CORAL),
        ('Total egresos', m(gr['total_conciliados'] + gr['total_no_conciliados']), 'conciliados + pendientes', NAVY),
        ('Período', _period_label(period), 'cierre', NAVY),
    ]))
    story.append(Paragraph('Gastos conciliados', st_h3))
    for fl in grouped_gasto_table(gr['conciliados']):
        story.append(fl)
    story.append(Paragraph('Gastos no conciliados', st_h3))
    for fl in grouped_gasto_table(gr['no_conciliados']):
        story.append(fl)

    # ── Caja chica ─────────────────────────────────────────
    story.append(PageBreak())
    story.append(section('6. Anexo D — Reporte de caja chica'))
    story.append(Paragraph(
        'Gastos menores del período (mismo criterio que el módulo Caja chica). '
        'La caja chica no se incluye en la conciliación bancaria del reporte general.',
        st_muted,
    ))
    cj = data['caja']
    story.append(Spacer(1, 6))
    story.append(kpi_grid([
        ('Movimientos', str(len(cj['rows'])), 'registros', PURPLE),
        ('Total caja chica', m(cj['total']), 'gastos menores', PURPLE),
        ('Período', _period_label(period), 'cierre', NAVY),
        ('Moneda', cur, tenant.currency or 'MXN', NAVY),
    ]))
    story.append(Spacer(1, 8))
    if not cj['rows']:
        story.append(Paragraph('Sin registros de caja chica en este período.', st_muted))
    else:
        story.append(data_table(
            ['Descripción', 'Forma de pago', 'Fecha', 'Monto'],
            [[c['description'] or '—', c['payment_type'], c['date'], m(c['amount'])] for c in cj['rows']],
            [content_w * x for x in (0.48, 0.20, 0.16, 0.16)],
        ))
        story.append(Spacer(1, 6))
        story.append(kv_rows([], 'Total caja chica', cj['total'], PURPLE))

    story.append(Spacer(1, 16))
    story.append(HRFlowable(width='100%', thickness=0.6, color=_hex(LINE), spaceBefore=4, spaceAfter=8))
    story.append(Paragraph(
        'Fin del expediente de cierre. Documento generado por Homly para archivo de la administración. '
        'Las cifras de un período cerrado no se recalculan salvo reapertura autorizada.',
        st_muted,
    ))

    doc.build(story, onFirstPage=header_footer, onLaterPages=header_footer, canvasmaker=NumberedCanvas)
    return buffer.getvalue()
