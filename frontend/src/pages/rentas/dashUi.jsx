import React, { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Info } from 'lucide-react';
import { fmtDate, fmtMoney } from './rentalUtils';

export const COLORS = {
  teal: '#2A9D73', tealDark: '#175F45', tealSoft: '#9BD9C0',
  blue: '#3B82F6', amber: '#F59E0B', coral: '#E85D43',
  purple: '#7C3AED', sand: '#D4C8B5', ink: '#9E9588',
};
export const PALETTE = [COLORS.teal, COLORS.blue, COLORS.amber, COLORS.purple, COLORS.coral, COLORS.tealSoft, COLORS.ink];
export const OCC_COLORS = {
  ocupada: COLORS.teal, aviso: COLORS.amber, holdover: COLORS.coral,
  vacante: COLORS.sand, reservada: COLORS.blue, mantenimiento: COLORS.purple,
};
export const STATUS_COLORS = {
  activo: COLORS.teal, por_vencer: COLORS.amber, vencido: COLORS.coral,
  borrador: COLORS.sand, renovado: COLORS.blue, finalizado: COLORS.ink,
};
export const PRIORITY_COLORS = { urgente: COLORS.coral, alta: COLORS.amber, media: COLORS.blue, baja: COLORS.sand };

export const TOOLTIP_STYLE = {
  background: 'white', border: '1px solid var(--sand-100)', borderRadius: 10,
  boxShadow: '0 4px 16px rgba(0,0,0,0.10)', fontSize: 12,
};

export function money0(n, currency = 'MXN') {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n ?? 0);
}

export function compact(v) {
  const n = Math.abs(v);
  if (n >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(v / 1_000).toFixed(0)}k`;
  return `$${v}`;
}


export function Card({ title, hint, action, children }) {
  return (
    <div className="card" style={{ minWidth: 0 }}>
      <div className="card-head">
        <div>
          <h3>{title}</h3>
          {hint && <div className="rd-card-hint" style={{ margin: '2px 0 0' }}>{hint}</div>}
        </div>
        {action && <button className="btn btn-outline btn-sm" onClick={action.onClick}>{action.label}</button>}
      </div>
      {children}
    </div>
  );
}

export function Empty({ icon: Icon = Info, text }) {
  return (
    <div className="rd-empty">
      <Icon size={22} style={{ marginBottom: 8, opacity: 0.5 }} />
      <div>{text}</div>
    </div>
  );
}

export function MiniStat({ label, value, sub, tone }) {
  const color = tone === 'bad' ? 'var(--coral-600)' : tone === 'warn' ? 'var(--amber-600)' : tone === 'good' ? 'var(--teal-700)' : undefined;
  return (
    <div className="rd-mini">
      <div className="rd-mini-label">{label}</div>
      <div className="rd-mini-value" style={{ color }}>{value}</div>
      {sub && <div className="rd-mini-sub">{sub}</div>}
    </div>
  );
}

export function ModuleCard({ icon: Icon, title, value, sub, onClick }) {
  return (
    <button className="rd-module" onClick={onClick}>
      <span className="rd-kpi-icon" style={{ background: 'var(--teal-50)', color: 'var(--teal-600)' }}><Icon size={16} /></span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 11, color: 'var(--ink-400)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</span>
        <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: 'var(--ink-800)' }}>{value}</span>
        <span style={{ display: 'block', fontSize: 11, color: 'var(--ink-500)' }}>{sub}</span>
      </span>
    </button>
  );
}

export function DaysBadge({ days, plain }) {
  const color = days <= 15 ? 'var(--coral-600)' : days <= 30 ? 'var(--amber-600)' : 'var(--ink-500)';
  const text = days < 0 ? `Venció hace ${Math.abs(days)} d` : days === 0 ? 'Vence hoy' : `En ${days} día(s)`;
  if (plain) return <span style={{ color }}>{text}</span>;
  return (
    <span style={{ fontSize: 12, fontWeight: 700, color, background: 'var(--sand-50)', padding: '3px 9px', borderRadius: 99, whiteSpace: 'nowrap' }}>
      {text}
    </span>
  );
}

export function WorkRow({ w, showDate }) {
  const pc = PRIORITY_COLORS[w.priority] || COLORS.sand;
  return (
    <div className="rd-row">
      <div className="rd-row-main">
        <div className="rd-row-title">{w.title}</div>
        <div className="rd-row-sub">
          {w.property_code} · {w.kind === 'preventivo' ? 'Preventivo' : 'Correctivo'}
          {w.provider_name ? ` · ${w.provider_name}` : ''}
          {(showDate || w.overdue) && w.scheduled_date ? ` · ${w.overdue ? 'atrasado desde' : 'programado'} ${fmtDate(w.scheduled_date)}` : ''}
        </div>
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 99, background: `${pc}22`, color: w.priority === 'baja' ? 'var(--ink-600)' : pc, whiteSpace: 'nowrap' }}>
        {w.priority_label}
      </span>
    </div>
  );
}

export function CollectionChart({ data = [], currency }) {
  if (!data.some(d => d.expected > 0)) return <Empty text="Aún no hay cargos generados. Genera el mes desde Cobranza." />;
  return (
    <div className="rd-card-body">
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={4}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--sand-100)" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--ink-500)' }} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={compact} tick={{ fontSize: 10, fill: 'var(--ink-400)' }} axisLine={false} tickLine={false} width={48} />
          <Tooltip
            formatter={(v, n) => [fmtMoney(v, currency), n]}
            contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'var(--sand-50)' }}
          />
          <Legend wrapperStyle={{ fontSize: 12, paddingTop: 6 }} />
          <Bar dataKey="expected" name="Facturado" fill={COLORS.sand} radius={[6, 6, 0, 0]} />
          <Bar dataKey="collected" name="Cobrado" fill={COLORS.teal} radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Donut({ data = [], colorMap, centerValue, centerLabel, money, currency }) {
  const items = useMemo(() => data.filter(d => d.value > 0), [data]);
  if (items.length === 0) return <Empty text="Sin datos para mostrar." />;
  const colorOf = (d, i) => (colorMap && colorMap[d.key]) || PALETTE[i % PALETTE.length];
  return (
    <div className="rd-card-body">
      <div className="rd-chart-center">
        <ResponsiveContainer width="100%" height={190}>
          <PieChart>
            <Pie data={items} dataKey="value" nameKey="label" innerRadius={58} outerRadius={84} paddingAngle={2} stroke="none">
              {items.map((d, i) => <Cell key={d.key || d.label} fill={colorOf(d, i)} />)}
            </Pie>
            <Tooltip
              formatter={(v, n) => [money ? fmtMoney(v, currency) : v, n]}
              contentStyle={TOOLTIP_STYLE}
            />
          </PieChart>
        </ResponsiveContainer>
        {centerValue !== undefined && (
          <div className="rd-chart-center-label">
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, color: 'var(--ink-800)', lineHeight: 1.1 }}>{centerValue}</div>
            {centerLabel && <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>{centerLabel}</div>}
          </div>
        )}
      </div>
      <div className="rd-legend">
        {items.map((d, i) => (
          <span key={d.key || d.label}>
            <i style={{ background: colorOf(d, i) }} />
            {d.label} · <strong>{money ? money0(d.value, currency) : d.value}</strong>
          </span>
        ))}
      </div>
    </div>
  );
}

export function HBars({ data = [], color }) {
  const max = Math.max(1, ...data.map(d => d.value));
  if (data.length === 0) return <Empty text="Sin datos." />;
  return (
    <div className="rd-card-body">
      {data.map(d => (
        <div key={d.key || d.label} style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
            <span style={{ color: 'var(--ink-600)' }}>{d.label}</span>
            <strong>{d.value}</strong>
          </div>
          <div className="rd-bar"><span style={{ width: `${(d.value / max) * 100}%`, background: color }} /></div>
        </div>
      ))}
    </div>
  );
}

export function SplitBar({ parts, currency, counts }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  if (total <= 0) return <Empty text="Sin datos." />;
  return (
    <>
      <div style={{ display: 'flex', height: 14, borderRadius: 99, overflow: 'hidden', background: 'var(--sand-100)' }}>
        {parts.filter(p => p.value > 0).map(p => (
          <div key={p.label} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} title={p.label} />
        ))}
      </div>
      <div className="rd-legend" style={{ marginTop: 12 }}>
        {parts.map(p => (
          <span key={p.label}>
            <i style={{ background: p.color }} />
            {p.label} · <strong>{counts ? p.value : money0(p.value, currency)}</strong> ({Math.round((p.value / total) * 100)}%)
          </span>
        ))}
      </div>
    </>
  );
}
