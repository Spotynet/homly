import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, Building2, Calendar, CheckCircle, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ClipboardList, Cpu, Eye, EyeOff, FileText, GripVertical, Home, LayoutGrid, LifeBuoy, Maximize2, Plus, Receipt, RotateCcw, Settings2, Star, Target, Wrench } from 'lucide-react';
import { rentalAPI } from '../../api/client';
import { fmtDate } from './rentalUtils';
import { PRIORITY, SLA_STATE } from './opsUi';
import { Card, COLORS, CollectionChart, DaysBadge, Donut, Empty, ModuleCard, OCC_COLORS, TOOLTIP_STYLE, WorkRow, money0 } from './dashUi';

const PropertyMap = lazy(() => import('./PropertyMap'));

/* ─────────────── utilidades de fecha ─────────────── */

const pad = n => String(n).padStart(2, '0');
const isoOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DOW = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const DOW_LONG = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

function dayLabel(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return `${DOW_LONG[dt.getDay()]} ${d} de ${MONTHS[m - 1]}`;
}

export const EVENT_TYPES = {
  contrato: { label: 'Vencimiento de contrato', color: '#7C3AED' },
  orden: { label: 'Orden de trabajo', color: COLORS.teal },
  solicitud: { label: 'Límite de solicitud', color: COLORS.blue },
  preventivo: { label: 'Preventivo programado', color: COLORS.tealDark },
  inspeccion: { label: 'Inspección', color: '#0EA5E9' },
  cobro: { label: 'Cobro', color: COLORS.amber },
  garantia: { label: 'Garantía de activo', color: COLORS.ink },
};

/* ─────────────── Calendario ─────────────── */

export function AgendaCalendar({ tenantId, go }) {
  const today = useMemo(() => new Date(), []);
  const [month, setMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState(isoOf(today));
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  const cells = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7; // lunes primero
    const start = new Date(first.getFullYear(), first.getMonth(), 1 - offset);
    return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  }, [month]);

  useEffect(() => {
    if (!tenantId) return undefined;
    let alive = true;
    setLoading(true);
    rentalAPI.ops.reports.agenda(tenantId, { from: isoOf(cells[0]), to: isoOf(cells[41]) })
      .then(r => { if (alive) setEvents(r.data?.events || []); })
      .catch(() => { if (alive) setEvents([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [tenantId, cells]);

  const byDay = useMemo(() => {
    const m = {};
    events.forEach(e => { (m[e.date] = m[e.date] || []).push(e); });
    return m;
  }, [events]);

  const todayIso = isoOf(today);
  const dayEvents = byDay[selected] || [];
  const monthEvents = events.filter(e => e.date.slice(0, 7) === `${month.getFullYear()}-${pad(month.getMonth() + 1)}`).length;

  const shift = delta => setMonth(new Date(month.getFullYear(), month.getMonth() + delta, 1));
  const goToday = () => { setMonth(new Date(today.getFullYear(), today.getMonth(), 1)); setSelected(todayIso); };

  return (
    <div className="cal">
      <div className="cal-nav">
        <button className="btn-icon" onClick={() => shift(-1)} aria-label="Mes anterior"><ChevronLeft size={16} /></button>
        <div className="cal-title">
          {MONTHS[month.getMonth()]} {month.getFullYear()}
          <small>{loading ? 'Cargando…' : `${monthEvents} evento${monthEvents === 1 ? '' : 's'}`}</small>
        </div>
        <button className="btn-icon" onClick={() => shift(1)} aria-label="Mes siguiente"><ChevronRight size={16} /></button>
        <button className="btn btn-outline btn-sm" onClick={goToday}>Hoy</button>
      </div>
      <div className="cal-grid">
        {DOW.map((d, i) => <div key={i} className="cal-dow">{d}</div>)}
        {cells.map(d => {
          const iso = isoOf(d);
          const evs = byDay[iso] || [];
          const types = [...new Set(evs.map(e => e.type))].slice(0, 3);
          const late = evs.some(e => e.status === 'atrasada');
          return (
            <button
              key={iso}
              type="button"
              className={`cal-day${d.getMonth() !== month.getMonth() ? ' out' : ''}${iso === todayIso ? ' today' : ''}${iso === selected ? ' sel' : ''}${late ? ' late' : ''}`}
              onClick={() => setSelected(iso)}
              title={evs.length ? `${evs.length} evento(s)` : undefined}
            >
              <span>{d.getDate()}</span>
              <i>{types.map(t => <b key={t} style={{ background: EVENT_TYPES[t]?.color || COLORS.ink }} />)}</i>
            </button>
          );
        })}
      </div>
      <div className="cal-detail">
        <div className="cal-detail-title">{dayLabel(selected)}{selected === todayIso ? ' · hoy' : ''}</div>
        {dayEvents.length === 0 ? (
          <div className="cal-none">Sin eventos para este día.</div>
        ) : (
          <div className="cal-events">
            {dayEvents.map((e, i) => (
              <button key={i} type="button" className="cal-ev" onClick={() => e.path && go(e.path)}>
                <span className="cal-ev-bar" style={{ background: EVENT_TYPES[e.type]?.color || COLORS.ink }} />
                <span className="cal-ev-main">
                  <b>{e.title}</b>
                  <small>{EVENT_TYPES[e.type]?.label}{e.sub ? ` · ${e.sub}` : ''}</small>
                </span>
                {e.status === 'atrasada' && <em>Atrasada</em>}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="cal-legend">
        {Object.entries(EVENT_TYPES).map(([k, v]) => (
          <span key={k}><i style={{ background: v.color }} />{v.label.split(' ')[0]}</span>
        ))}
      </div>
    </div>
  );
}

/* ─────────────── Widgets de gráficas ─────────────── */

function FlowChart({ flow = [] }) {
  if (!flow.some(f => f.solicitudes || f.ordenes || f.resueltas)) {
    return <Empty text="Aún no hay solicitudes ni órdenes en los últimos meses." />;
  }
  return (
    <div className="rd-card-body">
      <ResponsiveContainer width="100%" height={230}>
        <AreaChart data={flow} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <defs>
            <linearGradient id="gSol" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={COLORS.blue} stopOpacity={0.35} /><stop offset="100%" stopColor={COLORS.blue} stopOpacity={0} /></linearGradient>
            <linearGradient id="gOrd" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={COLORS.teal} stopOpacity={0.35} /><stop offset="100%" stopColor={COLORS.teal} stopOpacity={0} /></linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--sand-100)" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--ink-500)' }} axisLine={false} tickLine={false} />
          <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: 'var(--ink-400)' }} axisLine={false} tickLine={false} width={34} />
          <Tooltip contentStyle={TOOLTIP_STYLE} />
          <Legend wrapperStyle={{ fontSize: 12, paddingTop: 6 }} />
          <Area type="monotone" dataKey="solicitudes" name="Solicitudes nuevas" stroke={COLORS.blue} strokeWidth={2} fill="url(#gSol)" />
          <Area type="monotone" dataKey="ordenes" name="Órdenes creadas" stroke={COLORS.teal} strokeWidth={2} fill="url(#gOrd)" />
          <Area type="monotone" dataKey="resueltas" name="Resueltas" stroke={COLORS.amber} strokeWidth={2} fill="none" strokeDasharray="4 3" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function PerPropertyChart({ rows = [], basis, avg }) {
  if (!rows.length) return <Empty text="Sin propiedades con órdenes registradas." />;
  const data = rows.slice(0, 12);
  const label = basis === 'm2' ? 'Órdenes por 100 m²' : 'Órdenes';
  return (
    <div className="rd-card-body">
      <ResponsiveContainer width="100%" height={230}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--sand-100)" vertical={false} />
          <XAxis dataKey="code" tick={{ fontSize: 11, fill: 'var(--ink-500)' }} axisLine={false} tickLine={false} />
          <YAxis allowDecimals={basis === 'm2'} tick={{ fontSize: 10, fill: 'var(--ink-400)' }} axisLine={false} tickLine={false} width={34} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'var(--sand-50)' }}
            formatter={(v, n, p) => [v, label]}
            labelFormatter={(l, p) => (p && p[0] ? `${p[0].payload.name} (${p[0].payload.orders} órdenes${p[0].payload.area_m2 ? ` · ${p[0].payload.area_m2} m²` : ''})` : l)}
          />
          {avg > 0 && <ReferenceLine y={avg} stroke={COLORS.coral} strokeDasharray="5 4" label={{ value: `Promedio ${avg}`, position: 'insideTopRight', fontSize: 11, fill: COLORS.coral }} />}
          <Bar dataKey="value" name={label} radius={[6, 6, 0, 0]}>
            {data.map(r => <Cell key={r.code} fill={avg > 0 && r.value > avg ? COLORS.coral : COLORS.teal} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div style={{ fontSize: 11.5, color: 'var(--ink-400)', marginTop: 6 }}>
        {basis === 'm2' ? 'Intensidad de órdenes de trabajo por cada 100 m² de superficie.' : 'Las propiedades no tienen m² capturados: se muestra el total de órdenes.'} En rojo, por encima del promedio.
      </div>
    </div>
  );
}

function ProgressLine({ label, actual, budget, currency, note }) {
  const pct = budget > 0 ? Math.round((actual / budget) * 100) : null;
  const tone = pct == null ? COLORS.blue : pct > 100 ? COLORS.coral : pct > 85 ? COLORS.amber : COLORS.teal;
  return (
    <div className="wg-prog">
      <div className="wg-prog-top">
        <span>{label}</span>
        <strong>{money0(actual, currency)}{budget > 0 ? <small> / {money0(budget, currency)}</small> : null}</strong>
      </div>
      <div className="rd-bar"><span style={{ width: `${Math.min(100, pct ?? 0)}%`, background: tone }} /></div>
      <div className="wg-prog-note">{pct == null ? (note || 'Sin presupuesto definido') : `${pct}% del presupuesto`}</div>
    </div>
  );
}

function BudgetWidget({ budget, currency, go }) {
  if (!budget) return <Empty text="Sin datos de presupuesto." />;
  const cats = (budget.categories || []).filter(c => c.actual > 0 || c.budget_year > 0).slice(0, 5);
  const maxCat = Math.max(1, ...cats.map(c => Math.max(c.actual, c.budget_ytd || 0)));
  return (
    <div className="rd-card-body">
      <ProgressLine label={`OPEX acumulado ${budget.year}`} actual={budget.opex_ytd} budget={budget.opex_budget_ytd} currency={currency} note="Define presupuesto OPEX para comparar" />
      <ProgressLine label="CAPEX ejecutado" actual={budget.capex} budget={budget.capex_active_budget || budget.capex_budget_year} currency={currency} note="Sin proyectos CAPEX con presupuesto" />
      <div className="rd-mini-grid" style={{ margin: '12px 0' }}>
        <div className="rd-mini"><div className="rd-mini-label">Ingresos</div><div className="rd-mini-value">{money0(budget.income, currency)}</div></div>
        <div className="rd-mini"><div className="rd-mini-label">NOI</div><div className="rd-mini-value" style={{ color: budget.noi < 0 ? 'var(--coral-600)' : undefined }}>{money0(budget.noi, currency)}</div></div>
        <div className="rd-mini"><div className="rd-mini-label">Proyectos CAPEX</div><div className="rd-mini-value">{budget.projects_active || 0}{budget.projects_at_risk ? <small style={{ color: 'var(--coral-600)' }}> · {budget.projects_at_risk} en riesgo</small> : null}</div></div>
      </div>
      {cats.length > 0 && (
        <div>
          <div className="wg-sub">Gasto por categoría</div>
          {cats.map(c => (
            <div key={c.key} className="wg-cat">
              <div className="wg-cat-top"><span>{c.label}</span><strong>{money0(c.actual, currency)}</strong></div>
              <div className="rd-bar" style={{ position: 'relative' }}>
                <span style={{ width: `${(c.actual / maxCat) * 100}%`, background: c.budget_ytd > 0 && c.actual > c.budget_ytd ? COLORS.coral : COLORS.teal }} />
                {c.budget_ytd > 0 && <i className="wg-cat-mark" style={{ left: `${Math.min(100, (c.budget_ytd / maxCat) * 100)}%` }} title={`Presupuesto: ${money0(c.budget_ytd, currency)}`} />}
              </div>
            </div>
          ))}
        </div>
      )}
      <div style={{ marginTop: 10 }}>
        <button className="btn btn-outline btn-sm" onClick={() => go('/app/rentas/capex')}>Abrir CAPEX y OPEX</button>
      </div>
    </div>
  );
}

const RISK = {
  alto: { label: 'Riesgo alto', color: 'var(--coral-600)', bg: 'var(--coral-50)' },
  medio: { label: 'Riesgo medio', color: 'var(--amber-700)', bg: 'var(--amber-50)' },
  bajo: { label: 'Cumple', color: 'var(--teal-700)', bg: 'var(--teal-50)' },
};

function ProvidersRisk({ rows = [], overall, go }) {
  if (!rows.length) return <Empty icon={CheckCircle} text="Aún no hay proveedores con órdenes evaluadas por SLA." />;
  return (
    <div className="rd-card-body" style={{ paddingTop: 0 }}>
      <div className="wg-overall">
        <div>
          <div className="wg-overall-val" style={{ color: overall >= 90 ? 'var(--teal-700)' : overall >= 70 ? 'var(--amber-700)' : 'var(--coral-600)' }}>{overall ?? '—'}%</div>
          <div className="wg-overall-lbl">cumplimiento global de SLA</div>
        </div>
        <button className="btn btn-outline btn-sm" onClick={() => go('/app/rentas/reportes?tab=proveedores')}>Ver informe</button>
      </div>
      {rows.slice(0, 5).map(p => {
        const r = RISK[p.risk] || RISK.bajo;
        return (
          <div key={p.provider_id || p.provider} className="rd-row">
            <div className="rd-row-main">
              <div className="rd-row-title">{p.provider}</div>
              <div className="rd-row-sub">{p.evaluated} evaluadas · {p.late + p.overdue_open} fuera de SLA · {p.compliance_pct ?? 0}% cumple</div>
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 99, background: r.bg, color: r.color, whiteSpace: 'nowrap' }}>{r.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function ServiceWidget({ ov, go }) {
  const sat = ov.satisfaction || {};
  const rs = ov.requests_status || {};
  const labels = { nueva: 'Nuevas', en_proceso: 'En proceso', en_espera: 'En espera', resuelta: 'Resueltas', cerrada: 'Cerradas', cancelada: 'Canceladas' };
  const entries = Object.entries(rs).filter(([, v]) => v > 0);
  return (
    <div className="rd-card-body">
      <div className="wg-sat">
        <div className="wg-sat-val">{sat.count ? sat.avg.toFixed(1) : '—'}</div>
        <div>
          <div className="wg-stars">{[1, 2, 3, 4, 5].map(i => <Star key={i} size={15} fill={sat.count && i <= Math.round(sat.avg) ? COLORS.amber : 'none'} color={COLORS.amber} />)}</div>
          <div className="wg-sat-lbl">{sat.count ? `Satisfacción · ${sat.count} encuesta${sat.count === 1 ? '' : 's'}` : 'Aún sin calificaciones de inquilinos'}</div>
        </div>
      </div>
      <div className="wg-sub">Solicitudes por estado</div>
      {entries.length === 0 ? <div className="cal-none">Sin solicitudes registradas.</div> : (
        <div className="rd-legend" style={{ marginTop: 6 }}>
          {entries.map(([k, v]) => <span key={k}><i style={{ background: k === 'nueva' ? COLORS.blue : k === 'resuelta' || k === 'cerrada' ? COLORS.teal : COLORS.amber }} />{labels[k] || k} · <strong>{v}</strong></span>)}
        </div>
      )}
      <div style={{ marginTop: 10 }}>
        <button className="btn btn-outline btn-sm" onClick={() => go('/app/rentas/solicitudes')}>Abrir solicitudes</button>
      </div>
    </div>
  );
}

export function WorkloadBars({ rows = [] }) {
  if (!rows.length) return <Empty icon={CheckCircle} text="Nadie tiene órdenes abiertas." />;
  const max = Math.max(1, ...rows.map(r => r.open + r.overdue));
  return (
    <div className="rd-card-body">
      {rows.slice(0, 8).map(r => (
        <div key={r.name} className="wg-cat">
          <div className="wg-cat-top"><span>{r.name}</span><strong>{r.open + r.overdue}{r.overdue ? <small style={{ color: 'var(--coral-600)' }}> · {r.overdue} atrasadas</small> : null}</strong></div>
          <div className="wg-stack">
            <span style={{ width: `${(r.open / max) * 100}%`, background: COLORS.teal }} />
            <span style={{ width: `${(r.overdue / max) * 100}%`, background: COLORS.coral }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─────────────── Panel global personalizable ─────────────── */

const SIZES = [4, 6, 8, 12];
const SIZE_LABEL = { 4: 'Pequeño', 6: 'Mediano', 8: 'Grande', 12: 'Ancho completo' };

const WIDGETS = [
  { id: 'alertas', title: 'Requiere tu atención', size: 8 },
  { id: 'calendario', title: 'Calendario de operación', size: 4 },
  { id: 'mapa', title: 'Mapa de propiedades', size: 12 },
  { id: 'cobranza', title: 'Cobranza de los últimos 6 meses', size: 8 },
  { id: 'unidades', title: 'Estado de tus unidades', size: 4 },
  { id: 'propiedades', title: 'Estado de tus propiedades', size: 4 },
  { id: 'flujo', title: 'Solicitudes y órdenes nuevas', size: 6 },
  { id: 'estado_ordenes', title: 'Estado de las órdenes', size: 6 },
  { id: 'por_m2', title: 'Órdenes por propiedad', size: 6 },
  { id: 'presupuesto', title: 'Seguimiento de presupuesto', size: 6 },
  { id: 'sla', title: 'Proveedores y SLA', size: 6 },
  { id: 'servicio', title: 'Servicio al inquilino', size: 6 },
  { id: 'carga', title: 'Carga de trabajo', size: 6 },
  { id: 'contratos', title: 'Contratos por vencer', size: 6 },
  { id: 'mantenimiento', title: 'Mantenimiento por atender', size: 6 },
  { id: 'accesos', title: 'Accesos por módulo', size: 12 },
];
const WIDGET_IDS = WIDGETS.map(w => w.id);

function normalizeLayout(raw) {
  const l = raw && typeof raw === 'object' ? raw : {};
  const order = [...(Array.isArray(l.order) ? l.order.filter(id => WIDGET_IDS.includes(id)) : [])];
  // Un widget nuevo se inserta justo después del que lo precede en el diseño original
  WIDGET_IDS.forEach((id, i) => {
    if (order.includes(id)) return;
    const prev = i > 0 ? order.indexOf(WIDGET_IDS[i - 1]) : -1;
    order.splice(prev + 1, 0, id);
  });
  const hidden = Array.isArray(l.hidden) ? l.hidden.filter(id => WIDGET_IDS.includes(id)) : [];
  const sizes = {};
  WIDGETS.forEach(w => { sizes[w.id] = SIZES.includes(l.sizes?.[w.id]) ? l.sizes[w.id] : w.size; });
  return { order, hidden, sizes };
}

function useLayout(tenantId) {
  const key = `homly_rd_layout_${tenantId || 'x'}`;
  const [layout, setLayout] = useState(() => {
    try { return normalizeLayout(JSON.parse(localStorage.getItem(key) || 'null')); } catch { return normalizeLayout(null); }
  });
  useEffect(() => {
    try { setLayout(normalizeLayout(JSON.parse(localStorage.getItem(key) || 'null'))); } catch { setLayout(normalizeLayout(null)); }
  }, [key]);
  const update = useCallback(fn => {
    setLayout(prev => {
      const next = normalizeLayout(fn(prev));
      try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* sin almacenamiento */ }
      return next;
    });
  }, [key]);
  const reset = useCallback(() => {
    try { localStorage.removeItem(key); } catch { /* ok */ }
    setLayout(normalizeLayout(null));
  }, [key]);
  return [layout, update, reset];
}

// Widgets que dependen de módulos de renta que el tenant puede apagar
const WIDGET_NEEDS = { cobranza: 'rentas_cobranza', unidades: 'rentas_rentroll' };

export function GlobalPanel({ tenantId, data, pf, fin, ct, mt, crm, ab, currency, go, alerts, off = [], canWrite = false }) {
  const [layout, update, reset] = useLayout(tenantId);
  const mode = data.mode || {};
  const leasingOn = mode.leasing_enabled !== false;
  const unavailable = new Set([
    ...WIDGETS.filter(w => WIDGET_NEEDS[w.id] && off.includes(WIDGET_NEEDS[w.id])).map(w => w.id),
    ...(off.includes('rentas_rentroll') ? [] : ['propiedades']),
  ]);
  const [editing, setEditing] = useState(false);
  const [ov, setOv] = useState(null);
  const [ovLoading, setOvLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [dragId, setDragId] = useState(null);
  const [overId, setOverId] = useState(null);
  const ops = data.ops || {};

  useEffect(() => {
    if (!tenantId) return undefined;
    let alive = true;
    setOvLoading(true);
    rentalAPI.ops.reports.overview(tenantId)
      .then(r => { if (alive) setOv(r.data); })
      .catch(() => { if (alive) setOv({}); })
      .finally(() => { if (alive) setOvLoading(false); });
    return () => { alive = false; };
  }, [tenantId]);

  const move = (id, targetId) => {
    if (!id || !targetId || id === targetId) return;
    update(l => {
      const order = l.order.filter(x => x !== id);
      const at = order.indexOf(targetId);
      order.splice(at < 0 ? order.length : at, 0, id);
      return { ...l, order };
    });
  };
  const nudge = (id, dir) => update(l => {
    const vis = l.order.filter(x => !l.hidden.includes(x) && !unavailable.has(x));
    const i = vis.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= vis.length) return l;
    const order = [...l.order];
    const a = order.indexOf(vis[i]);
    const b = order.indexOf(vis[j]);
    [order[a], order[b]] = [order[b], order[a]];
    return { ...l, order };
  });
  const cycleSize = id => update(l => {
    const cur = l.sizes[id];
    return { ...l, sizes: { ...l.sizes, [id]: SIZES[(SIZES.indexOf(cur) + 1) % SIZES.length] } };
  });
  const hide = id => update(l => ({ ...l, hidden: [...l.hidden, id] }));
  const show = id => update(l => ({ ...l, hidden: l.hidden.filter(x => x !== id) }));

  const highCount = alerts.filter(a => a.level === 'high').length;
  const visibleAlerts = showAll ? alerts : alerts.slice(0, 4);
  const occupancy = data.portfolio?.occupancy || [];
  const o = ov || {};
  const os = o.orders_status || {};
  const orderStatusData = [
    { key: 'planeado', label: 'Planeadas', value: Math.max(0, (os.planeado || 0) - (os.vencidas || 0)) },
    { key: 'en_curso', label: 'En curso', value: os.en_curso || 0 },
    { key: 'vencidas', label: 'Vencidas', value: os.vencidas || 0 },
    { key: 'realizado', label: 'Realizadas', value: os.realizado || 0 },
  ];
  const orderColors = { planeado: COLORS.blue, en_curso: COLORS.amber, vencidas: COLORS.coral, realizado: COLORS.teal };
  const totalOrders = (os.planeado || 0) + (os.en_curso || 0) + (os.realizado || 0);

  const loadingBox = <div className="rd-empty">Cargando…</div>;

  const defs = {
    alertas: {
      title: (
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {alerts.length === 0 ? <CheckCircle size={16} color="var(--teal-600)" /> : <AlertTriangle size={16} color={highCount ? 'var(--coral-500)' : 'var(--amber-600)'} />}
          Requiere tu atención
          {alerts.length > 0 && (
            <span style={{ fontSize: 11, fontWeight: 700, background: highCount ? 'var(--coral-50)' : 'var(--amber-50)', color: highCount ? 'var(--coral-600)' : 'var(--amber-700)', padding: '2px 8px', borderRadius: 99 }}>{alerts.length}</span>
          )}
        </span>
      ),
      body: alerts.length === 0 ? (
        <div className="rd-empty"><CheckCircle size={22} style={{ marginBottom: 8, opacity: 0.5 }} /><div>Todo en orden. No hay pendientes críticos.</div></div>
      ) : (
        <>
          <div className="rd-alerts">
            {visibleAlerts.map(a => (
              <div key={a.key} className={`rd-alert rd-alert-${a.level}`}>
                <div className="rd-alert-count">{a.count}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="rd-alert-title">{a.title}</div>
                  <div className="rd-alert-detail">{a.detail}</div>
                </div>
                <button className="btn btn-outline btn-sm" onClick={() => go(a.path)}>{a.cta}</button>
              </div>
            ))}
          </div>
          {alerts.length > 4 && (
            <div style={{ padding: '0 16px 14px' }}>
              <button className="btn btn-outline btn-sm" onClick={() => setShowAll(v => !v)}>
                {showAll ? <>Ver menos <ChevronUp size={13} /></> : <>Ver todas ({alerts.length}) <ChevronDown size={13} /></>}
              </button>
            </div>
          )}
        </>
      ),
    },
    calendario: { hint: 'Vencimientos, órdenes, cobros e inspecciones.', body: <AgendaCalendar tenantId={tenantId} go={go} /> },
    mapa: {
      hint: 'Dónde están tus propiedades y cómo va cada una. Haz clic en un pin para ver sus indicadores y abrir sus módulos.',
      action: { label: 'Propiedades', onClick: () => go('/app/rentas/propiedades') },
      body: (
        <Suspense fallback={loadingBox}>
          <PropertyMap tenantId={tenantId} go={go} canWrite={canWrite} off={off} />
        </Suspense>
      ),
    },
    cobranza: {
      hint: 'Lo facturado contra lo realmente cobrado.',
      action: { label: 'Ir a cobranza', onClick: () => go('/app/rentas/cobranza') },
      body: <CollectionChart data={fin.trend} currency={currency} />,
    },
    unidades: { hint: 'Cómo está ocupado tu inventario hoy.', body: <Donut data={occupancy} colorMap={OCC_COLORS} centerValue={`${pf.occupancy_pct ?? 0}%`} centerLabel="ocupación" /> },
    propiedades: {
      hint: 'Cómo está tu inventario de propiedades.',
      action: { label: 'Abrir', onClick: () => go('/app/rentas/propiedades') },
      body: (
        <Donut
          data={[
            { key: 'operativa', label: 'En operación', value: data.properties?.operativa || 0 },
            { key: 'ocupada', label: 'Ocupadas', value: data.properties?.ocupada || 0 },
            { key: 'disponible', label: 'Disponibles', value: data.properties?.disponible || 0 },
            { key: 'mantenimiento', label: 'En mantenimiento', value: data.properties?.mantenimiento || 0 },
          ]}
          colorMap={{ operativa: COLORS.teal, ocupada: COLORS.blue, disponible: COLORS.sand, mantenimiento: COLORS.amber }}
          centerValue={data.properties?.total ?? mode.properties_total ?? 0}
          centerLabel="propiedades"
        />
      ),
    },
    flujo: {
      hint: 'Tendencia de los últimos meses.',
      action: { label: 'Reportes', onClick: () => go('/app/rentas/reportes') },
      body: ovLoading ? loadingBox : <FlowChart flow={o.flow} />,
    },
    estado_ordenes: {
      hint: 'Órdenes de trabajo según su avance.',
      action: { label: 'Abrir', onClick: () => go('/app/rentas/mantenimiento') },
      body: ovLoading ? loadingBox : <Donut data={orderStatusData} colorMap={orderColors} centerValue={totalOrders} centerLabel="órdenes" />,
    },
    por_m2: {
      hint: 'Dónde se concentra el trabajo de mantenimiento.',
      body: ovLoading ? loadingBox : <PerPropertyChart rows={o.per_property} basis={o.per_property_basis} avg={o.per_property_avg} />,
    },
    presupuesto: { hint: 'OPEX, CAPEX y NOI del año.', body: ovLoading ? loadingBox : <BudgetWidget budget={o.budget} currency={currency} go={go} /> },
    sla: { hint: 'Cumplimiento de tiempos de respuesta de tus proveedores.', body: ovLoading ? loadingBox : <ProvidersRisk rows={o.providers_risk} overall={o.providers_overall_pct} go={go} /> },
    servicio: { hint: 'Satisfacción y estado de las solicitudes.', body: ovLoading ? loadingBox : <ServiceWidget ov={o} go={go} /> },
    carga: { hint: 'Órdenes abiertas por proveedor o responsable.', body: ovLoading ? loadingBox : <WorkloadBars rows={o.workload} /> },
    contratos: {
      hint: 'Próximos 90 días.',
      action: { label: 'Vigencias', onClick: () => go('/app/rentas/contratos?tab=vigencias') },
      body: (ct.upcoming || []).length === 0 ? (
        <Empty icon={CheckCircle} text="No hay contratos por vencer en los próximos 90 días." />
      ) : (
        <div className="rd-card-body" style={{ paddingTop: 0 }}>
          {ct.upcoming.slice(0, 6).map(row => (
            <div key={row.id} className="rd-row">
              <div className="rd-row-main">
                <div className="rd-row-title">{row.property_code} · {row.tenant_name || 'Sin inquilino'}</div>
                <div className="rd-row-sub">{row.code} · vence {fmtDate(row.end_date)}</div>
              </div>
              <DaysBadge days={row.days_left} />
            </div>
          ))}
        </div>
      ),
    },
    mantenimiento: {
      hint: 'Urgentes, de prioridad alta o atrasados.',
      action: { label: 'Abrir', onClick: () => go('/app/rentas/mantenimiento') },
      body: (mt.attention || []).length === 0 ? (
        <Empty icon={CheckCircle} text="Sin trabajos críticos pendientes." />
      ) : (
        <div className="rd-card-body" style={{ paddingTop: 0 }}>
          {mt.attention.slice(0, 6).map(w => <WorkRow key={w.id} w={w} />)}
        </div>
      ),
    },
    accesos: {
      body: (
        <div className="rd-mini-grid" style={{ padding: 16 }}>
          <ModuleCard
            icon={Building2} title="Propiedades"
            value={`${mode.properties_total ?? pf.units ?? 0} propiedades`}
            sub={leasingOn ? `${pf.vacant || 0} vacantes · ${mode.operation_only || 0} solo operación` : 'Operadas sin renta'}
            onClick={() => go('/app/rentas/propiedades')}
          />
          {!off.includes('rentas_rentroll') && <ModuleCard icon={ClipboardList} title="Rent Roll" value={money0(pf.in_place_rent, currency)} sub={`Potencial ${money0(pf.gpr, currency)}`} onClick={() => go('/app/rentas/rentroll')} />}
          <ModuleCard icon={FileText} title="Contratos" value={`${ct.active || 0} vigentes`} sub={`${ct.expiring || 0} por vencer`} onClick={() => go('/app/rentas/contratos')} />
          {!off.includes('rentas_cobranza') && <ModuleCard icon={Receipt} title="Cobranza" value={`${Math.round(fin.collection_pct || 0)}% cobrado`} sub={`Pendiente ${money0(fin.pending, currency)}`} onClick={() => go('/app/rentas/cobranza')} />}
          <ModuleCard icon={Wrench} title="Órdenes de trabajo" value={`${mt.open || 0} abiertas`} sub={`${mt.overdue || 0} atrasadas`} onClick={() => go('/app/rentas/mantenimiento')} />
          <ModuleCard icon={LifeBuoy} title="Solicitudes" value={`${ops.requests_open || 0} abiertas`} sub={`${ops.requests_overdue || 0} fuera de SLA`} onClick={() => go('/app/rentas/solicitudes')} />
          <ModuleCard icon={Cpu} title="Activos" value={`${ops.assets_total || 0} equipos`} sub={`${ops.assets_down || 0} fuera de operación`} onClick={() => go('/app/rentas/activos')} />
          {!off.includes('rentas_crm') && <ModuleCard icon={Target} title="CRM" value={`${crm.open || 0} prospectos`} sub={`${crm.won_month || 0} ganados este mes`} onClick={() => go('/app/rentas/crm')} />}
          <ModuleCard icon={Calendar} title="Vigencias" value={`${pf.expiring_30 || 0} vencen en 30 d`} sub={`${pf.expiring_90 || 0} en 90 días`} onClick={() => go('/app/rentas/contratos?tab=vigencias')} />
          {leasingOn && <ModuleCard icon={Home} title="Airbnb" value={`${ab.listings || 0} anuncios`} sub={ab.occupied_now ? `${ab.occupied_now} ocupados ahora` : 'Sin ocupación ahora'} onClick={() => go('/app/rentas/config#airbnb')} />}
        </div>
      ),
    },
  };

  const visible = layout.order.filter(id => !layout.hidden.includes(id) && !unavailable.has(id));
  const hiddenWidgets = WIDGETS.filter(w => layout.hidden.includes(w.id) && !unavailable.has(w.id));
  const titleOf = id => WIDGETS.find(w => w.id === id)?.title || id;

  return (
    <div>
      <div className="wg-bar">
        <div className="wg-bar-text">
          {editing
            ? 'Modo personalización: arrastra las tarjetas, cambia su tamaño u ocúltalas. Tu diseño se guarda en este navegador.'
            : 'Panel global de tu portafolio. Personalízalo a tu manera.'}
        </div>
        <div className="wg-bar-actions">
          {editing && (
            <button className="btn btn-outline btn-sm" onClick={reset} title="Volver al diseño original"><RotateCcw size={13} /> Restablecer</button>
          )}
          <button className={`btn btn-sm ${editing ? 'btn-primary' : 'btn-outline'}`} onClick={() => setEditing(v => !v)}>
            {editing ? <><CheckCircle size={13} /> Listo</> : <><Settings2 size={13} /> Personalizar</>}
          </button>
        </div>
      </div>

      {editing && hiddenWidgets.length > 0 && (
        <div className="wg-tray">
          <span className="wg-tray-title"><LayoutGrid size={13} /> Widgets ocultos</span>
          {hiddenWidgets.map(w => (
            <button key={w.id} className="wg-tray-chip" onClick={() => show(w.id)}><Plus size={12} /> {w.title}</button>
          ))}
        </div>
      )}

      <div className="wg-grid">
        {visible.map((id, idx) => {
          const d = defs[id];
          if (!d) return null;
          const size = layout.sizes[id];
          return (
            <div
              key={id}
              className={`wg wg-w${size}${editing ? ' editing' : ''}${dragId === id ? ' dragging' : ''}${overId === id && dragId && dragId !== id ? ' drop' : ''}`}
              draggable={editing}
              onDragStart={e => { if (!editing) return; setDragId(id); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', id); } catch { /* ok */ } }}
              onDragOver={e => { if (editing && dragId) { e.preventDefault(); if (overId !== id) setOverId(id); } }}
              onDrop={e => { e.preventDefault(); move(dragId, id); setDragId(null); setOverId(null); }}
              onDragEnd={() => { setDragId(null); setOverId(null); }}
            >
              {editing && (
                <div className="wg-edit">
                  <span className="wg-grip" title="Arrastra para mover"><GripVertical size={15} /> {titleOf(id)}</span>
                  <span className="wg-edit-btns">
                    <button type="button" onClick={() => nudge(id, -1)} disabled={idx === 0} title="Mover antes"><ChevronLeft size={14} /></button>
                    <button type="button" onClick={() => nudge(id, 1)} disabled={idx === visible.length - 1} title="Mover después"><ChevronRight size={14} /></button>
                    <button type="button" onClick={() => cycleSize(id)} title={`Tamaño: ${SIZE_LABEL[size]} (clic para cambiar)`}><Maximize2 size={13} /> {SIZE_LABEL[size]}</button>
                    <button type="button" onClick={() => hide(id)} title="Ocultar"><EyeOff size={14} /></button>
                  </span>
                </div>
              )}
              <Card title={d.title || titleOf(id)} hint={d.hint} action={d.action}>
                {d.body}
              </Card>
            </div>
          );
        })}
      </div>
      {visible.length === 0 && (
        <div className="rd-empty">
          Ocultaste todos los widgets. <button className="btn btn-outline btn-sm" onClick={reset}><Eye size={13} /> Mostrar todo</button>
        </div>
      )}
    </div>
  );
}

/* ─────────────── Panel de FM: tablero de órdenes + agenda ─────────────── */

const BOARD_COLS = [
  { key: 'planeado', label: 'Planeadas', color: COLORS.blue },
  { key: 'en_curso', label: 'En curso', color: COLORS.amber },
  { key: 'realizado', label: 'Realizadas (30 días)', color: COLORS.teal },
];

export function FMBoard({ tenantId, canWrite, go }) {
  const [workload, setWorkload] = useState([]);
  const [cols, setCols] = useState({ planeado: [], en_curso: [], realizado: [] });
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [dragId, setDragId] = useState(null);
  const [overCol, setOverCol] = useState(null);
  const [busy, setBusy] = useState(false);
  const [agenda, setAgenda] = useState([]);
  const colsRef = useRef(cols);
  colsRef.current = cols;

  const load = useCallback(() => {
    if (!tenantId) return Promise.resolve();
    setLoading(true);
    const since = new Date(); since.setDate(since.getDate() - 30);
    const sinceIso = isoOf(since);
    return Promise.all(BOARD_COLS.map(c => rentalAPI.maintenance.list(tenantId, { status: c.key })))
      .then(([a, b, c]) => {
        const done = (c.data || []).filter(w => (w.performed_date || '') >= sinceIso).slice(0, 30);
        setCols({ planeado: a.data || [], en_curso: b.data || [], realizado: done });
        setErr('');
      })
      .catch(() => setErr('No se pudo cargar el tablero.'))
      .finally(() => setLoading(false));
  }, [tenantId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!tenantId) return;
    const from = new Date(); const to = new Date(); to.setDate(to.getDate() + 7);
    rentalAPI.ops.reports.agenda(tenantId, { from: isoOf(from), to: isoOf(to) })
      .then(r => setAgenda(r.data?.events || []))
      .catch(() => setAgenda([]));
    rentalAPI.ops.reports.overview(tenantId)
      .then(r => setWorkload(r.data?.workload || []))
      .catch(() => setWorkload([]));
  }, [tenantId]);

  const find = id => {
    for (const k of Object.keys(colsRef.current)) {
      const w = colsRef.current[k].find(x => x.id === id);
      if (w) return { w, from: k };
    }
    return null;
  };

  const drop = async col => {
    const id = dragId;
    setDragId(null); setOverCol(null);
    if (!canWrite || !id || busy) return;
    const hit = find(id);
    if (!hit || hit.from === col) return;
    const prev = colsRef.current;
    const moved = { ...hit.w, status: col };
    setCols({
      ...prev,
      [hit.from]: prev[hit.from].filter(x => x.id !== id),
      [col]: [moved, ...prev[col]],
    });
    setBusy(true);
    try {
      await rentalAPI.maintenance.update(tenantId, id, { status: col });
      load();
    } catch (e) {
      setCols(prev);
      setErr(e?.response?.data?.detail || 'No se pudo mover la orden.');
    } finally { setBusy(false); }
  };

  const byDay = useMemo(() => {
    const m = {};
    agenda.forEach(e => { (m[e.date] = m[e.date] || []).push(e); });
    return Object.entries(m).sort(([a], [b]) => (a < b ? -1 : 1));
  }, [agenda]);

  return (
    <div className="fm-wrap">
      <Card
        title="Tablero de órdenes de trabajo"
        hint={canWrite ? 'Arrastra una tarjeta a otra columna para cambiar su estado.' : 'Vista de solo lectura.'}
        action={{ label: 'Abrir órdenes', onClick: () => go('/app/rentas/mantenimiento') }}
      >
        {err && <div className="ev-error" style={{ margin: '0 16px 8px', color: 'var(--coral-600)', fontSize: 12.5 }}>{err}</div>}
        <div className="fm-board">
          {BOARD_COLS.map(c => (
            <div
              key={c.key}
              className={`fm-col${overCol === c.key && dragId ? ' over' : ''}`}
              onDragOver={e => { if (canWrite && dragId) { e.preventDefault(); setOverCol(c.key); } }}
              onDragLeave={() => setOverCol(v => (v === c.key ? null : v))}
              onDrop={e => { e.preventDefault(); drop(c.key); }}
            >
              <div className="fm-col-head" style={{ borderTopColor: c.color }}>
                <span>{c.label}</span><b>{cols[c.key].length}</b>
              </div>
              <div className="fm-col-body">
                {loading && cols[c.key].length === 0 && <div className="cal-none">Cargando…</div>}
                {!loading && cols[c.key].length === 0 && <div className="cal-none">Sin órdenes.</div>}
                {cols[c.key].map(w => {
                  const pr = PRIORITY[w.priority] || PRIORITY.media;
                  const sla = SLA_STATE[w.sla_state];
                  return (
                    <div
                      key={w.id}
                      className={`fm-card${dragId === w.id ? ' dragging' : ''}${canWrite ? ' can' : ''}`}
                      draggable={canWrite}
                      onDragStart={e => { setDragId(w.id); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', w.id); } catch { /* ok */ } }}
                      onDragEnd={() => { setDragId(null); setOverCol(null); }}
                      onClick={() => go('/app/rentas/mantenimiento')}
                    >
                      <div className="fm-card-top">
                        <span className="fm-folio">{w.folio}</span>
                        <span className="proj-chip" style={{ color: pr.color, background: pr.bg }}>{pr.label}</span>
                      </div>
                      <div className="fm-card-title">{w.title}</div>
                      <div className="fm-card-sub">
                        {w.property_code} · {w.kind === 'preventivo' ? 'Preventivo' : 'Correctivo'}
                        {w.provider_name ? ` · ${w.provider_name}` : ''}
                      </div>
                      <div className="fm-card-foot">
                        <span>{w.status === 'realizado' ? `Hecha ${fmtDate(w.performed_date)}` : w.scheduled_date ? fmtDate(w.scheduled_date) : 'Sin fecha'}</span>
                        {sla && w.status !== 'realizado' && <span className="proj-chip" style={{ color: sla.color, background: sla.bg }}>{sla.label}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="rd-grid-2">
        <Card title="Agenda de los próximos 7 días" hint="Lo que viene en tu operación." action={{ label: 'Reportes', onClick: () => go('/app/rentas/reportes') }}>
          {byDay.length === 0 ? <Empty icon={CheckCircle} text="No hay eventos programados esta semana." /> : (
            <div className="rd-card-body" style={{ paddingTop: 0 }}>
              {byDay.map(([day, evs]) => (
                <div key={day} className="fm-day">
                  <div className="fm-day-title">{dayLabel(day)}</div>
                  {evs.map((e, i) => (
                    <button key={i} type="button" className="cal-ev" onClick={() => e.path && go(e.path)}>
                      <span className="cal-ev-bar" style={{ background: EVENT_TYPES[e.type]?.color || COLORS.ink }} />
                      <span className="cal-ev-main"><b>{e.title}</b><small>{EVENT_TYPES[e.type]?.label}{e.sub ? ` · ${e.sub}` : ''}</small></span>
                      {e.status === 'atrasada' && <em>Atrasada</em>}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card title="Carga de trabajo" hint="Órdenes abiertas por proveedor o responsable.">
          <WorkloadBars rows={workload} />
        </Card>
      </div>
    </div>
  );
}
