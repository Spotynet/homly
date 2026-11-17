import React from 'react';
import { X } from 'lucide-react';

export const PRIORITY = {
  baja: { label: 'Baja', color: 'var(--ink-600)', bg: 'var(--sand-100)' },
  media: { label: 'Media', color: 'var(--blue-700)', bg: 'var(--blue-50)' },
  alta: { label: 'Alta', color: 'var(--amber-700)', bg: 'var(--amber-50)' },
  urgente: { label: 'Urgente', color: 'var(--coral-600)', bg: 'var(--coral-50)' },
};

export const SLA_STATE = {
  en_tiempo: { label: 'En tiempo', color: 'var(--teal-700)', bg: 'var(--teal-50)' },
  por_vencer: { label: 'Por vencer', color: 'var(--amber-700)', bg: 'var(--amber-50)' },
  vencida: { label: 'Vencida', color: 'var(--coral-600)', bg: 'var(--coral-50)' },
  cumplida: { label: 'Cumplida', color: 'var(--blue-700)', bg: 'var(--blue-50)' },
  tarde: { label: 'Fuera de SLA', color: 'var(--coral-600)', bg: 'var(--coral-50)' },
};

export const CRITICALITY = {
  baja: { label: 'Baja', color: 'var(--ink-600)', bg: 'var(--sand-100)' },
  media: { label: 'Media', color: 'var(--blue-700)', bg: 'var(--blue-50)' },
  alta: { label: 'Alta', color: 'var(--amber-700)', bg: 'var(--amber-50)' },
  critica: { label: 'Crítica', color: 'var(--coral-600)', bg: 'var(--coral-50)' },
};

export function errMsg(e, fallback) {
  const data = e?.response?.data;
  if (!data) return fallback;
  if (typeof data === 'string') return fallback;
  if (typeof data.detail === 'string') return data.detail;
  const first = Object.values(data).flat().find(v => typeof v === 'string');
  return first || fallback;
}

export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function fmtD(iso) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

export function fmtDT(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function money(n, dash = true) {
  const v = Number(n);
  if (!Number.isFinite(v) || (dash && v === 0)) return '—';
  return v.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
}

/** "en 3 h", "hace 2 d" a partir de una fecha ISO. */
export function relTime(iso) {
  if (!iso) return '';
  const diff = new Date(iso).getTime() - Date.now();
  const abs = Math.abs(diff);
  const h = abs / 36e5;
  let txt;
  if (h < 1) txt = `${Math.max(1, Math.round(abs / 60000))} min`;
  else if (h < 48) txt = `${Math.round(h)} h`;
  else txt = `${Math.round(h / 24)} d`;
  return diff >= 0 ? `en ${txt}` : `hace ${txt}`;
}

export function Chip({ map, value, label }) {
  const m = map?.[value] || { label: label || value, color: 'var(--ink-500)', bg: 'var(--sand-50)' };
  return <span className="proj-chip" style={{ color: m.color, background: m.bg }}>{label || m.label}</span>;
}

export function PageHead({ title, subtitle, children }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', color: 'var(--teal-600)', textTransform: 'uppercase' }}>
          Administrar Propiedades
        </div>
        <h2 style={{ margin: '4px 0 0', fontSize: 24 }}>{title}</h2>
        {subtitle && <p style={{ color: 'var(--ink-400)', fontSize: 13, marginTop: 4, maxWidth: 640 }}>{subtitle}</p>}
      </div>
      {children && <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>{children}</div>}
    </div>
  );
}

export function Stat({ label, value, sub, tone }) {
  const color = tone === 'bad' ? 'var(--coral-600)' : tone === 'warn' ? 'var(--amber-600)' : tone === 'good' ? 'var(--teal-700)' : undefined;
  return (
    <div className="cob-stat">
      <div>
        <div className="cob-stat-label">{label}</div>
        <div className="cob-stat-value" style={{ color }}>{value}</div>
        {sub && <div style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );
}

export function Empty({ icon: Icon, text, children }) {
  return (
    <div className="card" style={{ padding: 36, textAlign: 'center', color: 'var(--ink-400)' }}>
      {Icon && <Icon size={22} style={{ marginBottom: 8, opacity: 0.5 }} />}
      <div>{text}</div>
      {children}
    </div>
  );
}

export function Modal({ title, subtitle, onClose, children, footer, wide }) {
  return (
    <div className="ops-report-overlay" onClick={onClose}>
      <div className="ops-report-modal" style={{ maxWidth: wide ? 860 : 720 }} onClick={e => e.stopPropagation()}>
        <div className="ops-report-head">
          <div>
            <div style={{ fontWeight: 800 }}>{title}</div>
            {subtitle && <div style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: 4 }}>{subtitle}</div>}
          </div>
          <button className="btn-icon" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="ops-report-body" style={{ display: 'grid', gap: 12 }}>{children}</div>
        {footer && <div className="ops-report-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, children, hint, style }) {
  return (
    <div className="field" style={{ margin: 0, ...style }}>
      <div className="field-label">{label}</div>
      {children}
      {hint && <div style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

export function Grid({ cols = 2, children }) {
  return <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: 12 }}>{children}</div>;
}

export function SearchBar({ value, onChange, placeholder }) {
  return (
    <input
      className="field-input" style={{ flex: 1, minWidth: 180 }}
      value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
    />
  );
}
