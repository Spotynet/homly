import React from 'react';

export function fmtMoney(n, currency = 'MXN') {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency', currency,
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(n ?? 0);
}

export function fmtDate(value) {
  if (!value) return '—';
  const [y, m, d] = String(value).slice(0, 10).split('-');
  if (!y || !m || !d) return value;
  return new Date(+y, +m - 1, +d).toLocaleDateString('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

export function todayPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export const PROPERTY_TYPES = {
  casa: 'Casa',
  departamento: 'Departamento',
  local: 'Local comercial',
  oficina: 'Oficina',
  bodega: 'Bodega',
  terreno: 'Terreno',
  otro: 'Otro',
};

export const PROPERTY_STATUS = {
  disponible: { label: 'Disponible', color: 'var(--teal-700)', bg: 'var(--teal-50)' },
  ocupada: { label: 'Ocupada', color: 'var(--blue-700)', bg: 'var(--blue-50)' },
  reservada: { label: 'Reservada', color: '#92400e', bg: 'var(--amber-50)' },
  mantenimiento: { label: 'Mantenimiento', color: 'var(--ink-600)', bg: 'var(--sand-50)' },
  inactiva: { label: 'Inactiva', color: 'var(--ink-400)', bg: 'var(--sand-50)' },
};

export const CONTRACT_STATUS = {
  borrador: { label: 'Borrador', color: 'var(--ink-500)', bg: 'var(--sand-50)' },
  activo: { label: 'Activo', color: 'var(--teal-700)', bg: 'var(--teal-50)' },
  por_vencer: { label: 'Por vencer', color: '#92400e', bg: 'var(--amber-50)' },
  vencido: { label: 'Vencido', color: 'var(--coral-600)', bg: 'var(--coral-50)' },
  renovado: { label: 'Renovado', color: 'var(--blue-700)', bg: 'var(--blue-50)' },
  finalizado: { label: 'Finalizado', color: 'var(--ink-500)', bg: 'var(--sand-50)' },
  cancelado: { label: 'Cancelado', color: 'var(--ink-400)', bg: 'var(--sand-50)' },
};

export const CHARGE_STATUS = {
  pendiente: { label: 'Pendiente', color: '#92400e', bg: 'var(--amber-50)' },
  parcial: { label: 'Parcial', color: 'var(--blue-700)', bg: 'var(--blue-50)' },
  pagado: { label: 'Pagado', color: 'var(--teal-700)', bg: 'var(--teal-50)' },
  cancelado: { label: 'Cancelado', color: 'var(--ink-400)', bg: 'var(--sand-50)' },
};

export function StatusPill({ map, value }) {
  const s = map[value] || { label: value || '—', color: 'var(--ink-500)', bg: 'var(--sand-50)' };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      fontSize: 10, fontWeight: 700, color: s.color, background: s.bg,
      borderRadius: 20, padding: '2px 8px', textTransform: 'uppercase', letterSpacing: '0.04em',
    }}>
      {s.label}
    </span>
  );
}
