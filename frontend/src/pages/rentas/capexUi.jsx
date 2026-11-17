import React from 'react';

export const COLORS = {
  teal: '#2A9D73', tealDark: '#175F45', tealSoft: '#9BD9C0',
  blue: '#3B82F6', amber: '#F59E0B', coral: '#E85D43',
  purple: '#7C3AED', sand: '#D4C8B5', ink: '#9E9588',
};

export const PROJECT_STATUS = {
  propuesta: { label: 'Propuesta', color: 'var(--ink-600)', bg: 'var(--sand-100)', dot: '#9E9588' },
  aprobado: { label: 'Aprobado', color: 'var(--blue-700)', bg: 'var(--blue-50)', dot: '#3B82F6' },
  en_ejecucion: { label: 'En ejecución', color: 'var(--teal-700)', bg: 'var(--teal-50)', dot: '#2A9D73' },
  en_pausa: { label: 'En pausa', color: 'var(--amber-700)', bg: 'var(--amber-50)', dot: '#F59E0B' },
  completado: { label: 'Completado', color: 'var(--ink-700)', bg: 'var(--sand-50)', dot: '#175F45' },
  cancelado: { label: 'Cancelado', color: 'var(--coral-600)', bg: 'var(--coral-50)', dot: '#E85D43' },
};
export const BOARD_COLS = ['propuesta', 'aprobado', 'en_ejecucion', 'en_pausa', 'completado'];

export const HEALTH = {
  ok: { label: 'En orden', color: 'var(--teal-700)', bg: 'var(--teal-50)', dot: '#2A9D73' },
  riesgo: { label: 'En riesgo', color: 'var(--amber-700)', bg: 'var(--amber-50)', dot: '#F59E0B' },
  critico: { label: 'Crítico', color: 'var(--coral-600)', bg: 'var(--coral-50)', dot: '#E85D43' },
};

export const PRIORITIES = {
  baja: 'Baja', media: 'Media', alta: 'Alta', critica: 'Crítica',
};

export const CAPEX_CATEGORIES = {
  remodelacion: 'Remodelación',
  equipamiento: 'Equipamiento / reposición',
  estructura: 'Estructura e instalaciones',
  eficiencia: 'Eficiencia energética',
  seguridad: 'Seguridad y cumplimiento',
  ampliacion: 'Ampliación / nueva unidad',
  tecnologia: 'Tecnología',
  otro: 'Otro',
};

export const OPEX_CATEGORIES = {
  servicios: 'Servicios (agua, luz, gas, internet)',
  limpieza: 'Limpieza',
  jardineria: 'Jardinería y áreas verdes',
  seguridad: 'Seguridad y vigilancia',
  seguros: 'Seguros',
  impuestos: 'Impuestos y derechos (predial)',
  administracion: 'Administración y honorarios',
  nomina: 'Nómina y personal',
  marketing: 'Mercadotecnia y comisiones',
  mant_preventivo: 'Mantenimiento preventivo',
  mant_correctivo: 'Reparaciones y correctivos',
  otros: 'Otros gastos operativos',
};

export const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function mon(n, { dash = false } = {}) {
  const v = num(n);
  if (dash && v === 0) return '—';
  return v.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
}

export function compact(v) {
  const n = num(v);
  const a = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (a >= 1_000_000) return `${sign}$${(a / 1_000_000).toFixed(1)}M`;
  if (a >= 1_000) return `${sign}$${(a / 1_000).toFixed(0)}k`;
  return `${sign}$${a.toFixed(0)}`;
}

export const pctTxt = (v, d = 0) => (v == null ? '—' : `${num(v).toFixed(d)}%`);

export function HealthBadge({ health, small }) {
  const h = HEALTH[health] || HEALTH.ok;
  return (
    <span className="proj-chip" style={{ color: h.color, background: h.bg, fontSize: small ? 10.5 : undefined, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <i style={{ width: 7, height: 7, borderRadius: 99, background: h.dot, display: 'inline-block' }} />
      {h.label}
    </span>
  );
}

export function StatusChip({ status, label }) {
  const s = PROJECT_STATUS[status] || PROJECT_STATUS.propuesta;
  return <span className="proj-chip" style={{ color: s.color, background: s.bg }}>{label || s.label}</span>;
}

/** Barra de presupuesto: ejecutado + comprometido contra el presupuesto aprobado. */
export function BudgetBar({ budget, spent, committed = 0, height = 8, showText = true }) {
  const b = num(budget);
  const s = num(spent);
  const c = num(committed);
  const scale = Math.max(b, s + c, 1);
  const over = b > 0 && s + c > b;
  const spentPct = (s / scale) * 100;
  const commPct = (c / scale) * 100;
  const markPct = (b / scale) * 100;
  return (
    <div>
      <div style={{ position: 'relative', height, borderRadius: 99, background: 'var(--sand-100)', overflow: 'visible' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${spentPct}%`, background: s > b && b > 0 ? COLORS.coral : COLORS.teal, borderRadius: 99 }} />
        <div style={{
          position: 'absolute', left: `${spentPct}%`, top: 0, bottom: 0, width: `${commPct}%`,
          background: 'repeating-linear-gradient(45deg, #F59E0B, #F59E0B 4px, #FBD38D 4px, #FBD38D 8px)',
          borderRadius: spentPct ? '0 99px 99px 0' : 99,
        }} />
        {over && b > 0 && (
          <div title="Presupuesto" style={{ position: 'absolute', left: `${markPct}%`, top: -3, bottom: -3, width: 2, background: 'var(--ink-800)' }} />
        )}
      </div>
      {showText && (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11, color: 'var(--ink-500)', marginTop: 4 }}>
          <span><b style={{ color: 'var(--ink-800)' }}>{compact(s)}</b> ejecutado{c > 0 ? ` · ${compact(c)} comprometido` : ''}</span>
          <span style={{ color: over ? 'var(--coral-600)' : undefined, fontWeight: over ? 700 : 400 }}>de {compact(b)}</span>
        </div>
      )}
    </div>
  );
}

export function Progress({ value, color = COLORS.teal, height = 6 }) {
  const v = Math.max(0, Math.min(100, num(value)));
  return (
    <div style={{ height, borderRadius: 99, background: 'var(--sand-100)', overflow: 'hidden' }}>
      <div style={{ width: `${v}%`, height: '100%', background: color, borderRadius: 99, transition: 'width .4s' }} />
    </div>
  );
}

const dayMs = 86400000;
const toTime = (iso) => (iso ? new Date(`${String(iso).slice(0, 10)}T00:00:00`).getTime() : null);

/** Cronograma compacto: barra planeada, avance, hoy e hitos. */
export function Timeline({ project }) {
  const start = toTime(project.start_date);
  const end = toTime(project.end_date);
  if (!start || !end || end <= start) {
    return <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>Define fecha de inicio y fin para ver el cronograma.</div>;
  }
  const ms = (project.milestones || []).map(m => ({ ...m, t: toTime(m.due) })).filter(m => m.t);
  const lo = Math.min(start, ...ms.map(m => m.t));
  const hi = Math.max(end, ...ms.map(m => m.t));
  const span = hi - lo || 1;
  const pos = (t) => `${((t - lo) / span) * 100}%`;
  const today = Date.now();
  const days = Math.round((end - today) / dayMs);
  const late = project.status !== 'completado' && days < 0;
  return (
    <div>
      <div style={{ position: 'relative', height: 46, margin: '4px 0 2px' }}>
        <div style={{ position: 'absolute', left: pos(start), width: `${((end - start) / span) * 100}%`, top: 14, height: 14, borderRadius: 99, background: 'var(--sand-100)', overflow: 'hidden' }}>
          <div style={{ width: `${project.progress}%`, height: '100%', background: late ? COLORS.coral : COLORS.teal }} />
        </div>
        {today >= lo && today <= hi && (
          <div style={{ position: 'absolute', left: pos(today), top: 4, bottom: 0, width: 2, background: COLORS.blue }}>
            <span style={{ position: 'absolute', top: -2, left: 5, fontSize: 10, fontWeight: 800, color: COLORS.blue }}>Hoy</span>
          </div>
        )}
        {ms.map(m => (
          <div key={m.id} title={`${m.title} · ${m.due}`} style={{ position: 'absolute', left: pos(m.t), top: 16, transform: 'translateX(-50%)' }}>
            <div style={{ width: 10, height: 10, transform: 'rotate(45deg)', background: m.done ? COLORS.tealDark : '#fff', border: `2px solid ${m.done ? COLORS.tealDark : COLORS.amber}` }} />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--ink-500)' }}>
        <span>{new Date(start).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: '2-digit' })}</span>
        <span style={{ color: late ? 'var(--coral-600)' : undefined, fontWeight: late ? 700 : 400 }}>
          {project.status === 'completado' ? 'Completado' : late ? `${Math.abs(days)} día(s) de retraso` : `${days} día(s) restantes`}
        </span>
        <span>{new Date(end).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: '2-digit' })}</span>
      </div>
    </div>
  );
}

export function downloadCSV(filename, columns, rows) {
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = columns.map(c => esc(c.label)).join(',');
  const body = rows.map(r => columns.map(c => esc(typeof c.value === 'function' ? c.value(r) : r[c.value])).join(',')).join('\n');
  const blob = new Blob([`\ufeff${head}\n${body}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
