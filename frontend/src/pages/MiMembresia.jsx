import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { tenantsAPI, usersAPI } from '../api/client';
import {
  CreditCard, AlertCircle, CheckCircle, Clock, XCircle, ShieldOff,
  Calendar, DollarSign, RefreshCw, Building2, Receipt, Eye,
  TrendingUp, Award, AlertTriangle, Bell, Info, FileText, Printer,
  ChevronDown, ChevronUp,
} from 'lucide-react';
import SubscriptionReceiptModal from '../components/SubscriptionReceiptModal';
import { APP_VERSION } from '../utils/helpers.jsx';

// ─── Status config ─────────────────────────────────────────────────────────────
const SUB_STATUS = {
  trial:     { label: 'Período de Prueba', color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE', icon: Clock },
  active:    { label: 'Activa',            color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0', icon: CheckCircle },
  past_due:  { label: 'Pago Vencido',      color: '#D97706', bg: '#FFFBEB', border: '#FDE68A', icon: AlertCircle },
  cancelled: { label: 'Cancelada',         color: '#6B7280', bg: '#F9FAFB', border: '#E5E7EB', icon: ShieldOff },
  expired:   { label: 'Expirada',          color: '#DC2626', bg: '#FEF2F2', border: '#FECACA', icon: XCircle },
};

// ─── Helpers ───────────────────────────────────────────────────────────────────
const fmtAmt = (amount, currency = 'MXN') => {
  const sym = { MXN: '$', USD: 'US$', EUR: '€', COP: 'COP$' };
  return `${sym[currency] || '$'}${Number(amount || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
};

const fmtDate = (d) => {
  if (!d) return '—';
  try {
    return new Date(d + 'T00:00:00').toLocaleDateString('es-MX', {
      day: '2-digit', month: 'long', year: 'numeric',
    });
  } catch { return d; }
};

const fmtDateShort = (d) => {
  if (!d) return '—';
  try {
    return new Date(d + 'T00:00:00').toLocaleDateString('es-MX', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  } catch { return d; }
};

/** Days between two ISO date strings (or Date objects). Positive = future. */
const daysDiff = (from, to) => {
  if (!from || !to) return null;
  const a = new Date(from + (from.includes('T') ? '' : 'T00:00:00'));
  const b = new Date(to + (to.includes('T') ? '' : 'T00:00:00'));
  return Math.round((b - a) / 86400000);
};

/** Build human-readable tenure string from a start date to today. */
const calcTenure = (startDateStr) => {
  if (!startDateStr) return null;
  const start = new Date(startDateStr + 'T00:00:00');
  const now = new Date();
  let years = now.getFullYear() - start.getFullYear();
  let months = now.getMonth() - start.getMonth();
  let days = now.getDate() - start.getDate();
  if (days < 0) { months--; }
  if (months < 0) { years--; months += 12; }
  if (years < 0) return 'Menos de un mes';
  if (years === 0 && months === 0) return 'Menos de un mes';
  const parts = [];
  if (years > 0) parts.push(`${years} ${years === 1 ? 'año' : 'años'}`);
  if (months > 0) parts.push(`${months} ${months === 1 ? 'mes' : 'meses'}`);
  return parts.join(', ');
};

// ─── Billing Cycle Generation ─────────────────────────────────────────────────

const MONTHS_ES = [
  'enero','febrero','marzo','abril','mayo','junio',
  'julio','agosto','septiembre','octubre','noviembre','diciembre',
];

/** Try to parse a period_label like "Enero 2025" → { month:1, year:2025 } */
function parsePeriodLabel(label) {
  if (!label) return null;
  const lower = label.toLowerCase().trim();
  for (let i = 0; i < MONTHS_ES.length; i++) {
    if (lower.includes(MONTHS_ES[i])) {
      const m = lower.match(/\d{4}/);
      if (m) return { month: i + 1, year: parseInt(m[0]) };
    }
  }
  return null;
}

/**
 * Produce an ordered list of billing cycles from billing_start to today.
 * Each cycle is matched against payments by period_label (month/year) first,
 * then by date range as a fallback.
 */
function generateBillingCycles(sub, payments) {
  if (!sub?.billing_start) return [];

  const today = new Date();
  today.setHours(23, 59, 59, 0);

  const isAnnual  = sub.plan_billing_cycle === 'annual';
  const GRACE     = 5; // days

  const [sy, sm, sd] = sub.billing_start.split('-').map(Number);
  let cs = new Date(sy, sm - 1, sd); // cycle start

  const cycles = [];

  while (cs <= today) {
    // Cycle end = start of NEXT cycle
    const ce = new Date(cs);
    if (isAnnual) ce.setFullYear(ce.getFullYear() + 1);
    else           ce.setMonth(ce.getMonth() + 1);

    // Try label match first
    const csLabel = cs.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
    const csMonth = cs.getMonth() + 1;
    const csYear  = cs.getFullYear();

    const payment = payments.find(p => {
      const parsed = parsePeriodLabel(p.period_label);
      if (parsed) return parsed.month === csMonth && parsed.year === csYear;
      // fallback: payment_date within [cs, ce)
      if (!p.payment_date) return false;
      const pd = new Date(p.payment_date + 'T00:00:00');
      return pd >= cs && pd < ce;
    }) || null;

    // Status
    let status;
    if (payment) {
      status = 'paid';
    } else {
      const graceEnd = new Date(ce);
      graceEnd.setDate(graceEnd.getDate() + GRACE);
      if (ce > today)        status = 'current';
      else if (graceEnd > today) status = 'grace';
      else                   status = 'overdue';
    }

    cycles.push({
      number: cycles.length + 1,
      cycleStart:     cs.toISOString().slice(0, 10),
      cycleEnd:       new Date(ce.getTime() - 1).toISOString().slice(0, 10),
      dueDate:        cs.toISOString().slice(0, 10),
      periodLabel:    csLabel.charAt(0).toUpperCase() + csLabel.slice(1),
      isAnnual,
      expectedAmount: Number(sub.amount_per_cycle || 0),
      currency:       sub.currency || 'MXN',
      payment,
      status,
    });

    cs = ce;
  }

  return cycles;
}

// ─── PDF Printer ───────────────────────────────────────────────────────────────

function printKardexPDF({ cycles, sub, tenantData, adminName, adminEmail }) {
  const sym = { MXN: '$', USD: 'US$', EUR: '€', COP: 'COP$' };
  const curr = sym[sub.currency] || '$';
  const fmtM = (n) => `${curr}${Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
  const fmtD = (d) => {
    if (!d) return '—';
    try { return new Date(d + 'T00:00:00').toLocaleDateString('es-MX', { day:'2-digit', month:'short', year:'numeric' }); }
    catch { return d; }
  };

  // Homly logo — absolute URL for the print window
  const logoUrl = window.location.origin + '/img/homly-full.png';

  // Build address
  const addrParts = [
    tenantData?.info_calle && [tenantData.info_calle, tenantData.info_num_externo].filter(Boolean).join(' #'),
    tenantData?.info_colonia,
    tenantData?.info_ciudad,
    tenantData?.info_codigo_postal && `C.P. ${tenantData.info_codigo_postal}`,
  ].filter(Boolean);
  const addr = addrParts.join(', ');

  // Summaries
  const totalExpected = cycles.reduce((s, c) => s + c.expectedAmount, 0);
  const totalPaid     = cycles.filter(c => c.payment).reduce((s, c) => s + Number(c.payment.amount), 0);
  const paidCount     = cycles.filter(c => c.status === 'paid').length;
  const overdueCount  = cycles.filter(c => c.status === 'overdue').length;
  const graceCount    = cycles.filter(c => c.status === 'grace').length;
  const balance       = totalExpected - totalPaid;

  // Trial row (if applicable)
  const trialRow = sub.trial_start ? `
    <tr style="background:#F0F9FF">
      <td style="padding:7px 10px;text-align:center;font-weight:600;color:#475569">—</td>
      <td style="padding:7px 10px;font-weight:600;color:#2563EB">Período de Prueba</td>
      <td style="padding:7px 10px;color:#475569">${fmtD(sub.trial_start)}</td>
      <td style="padding:7px 10px;color:#475569">${fmtD(sub.trial_end)}</td>
      <td style="padding:7px 10px;color:#475569">—</td>
      <td style="padding:7px 10px;color:#16A34A;font-weight:700">${fmtM(0)}</td>
      <td style="padding:7px 10px;color:#6B7280">—</td>
      <td style="padding:7px 10px;color:#6B7280">—</td>
      <td style="padding:7px 10px">
        <span style="background:#DBEAFE;color:#1D4ED8;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:700">Prueba gratuita</span>
      </td>
    </tr>` : '';

  const STATUS_STYLE = {
    paid:    'background:#DCFCE7;color:#15803D;',
    current: 'background:#FEF3C7;color:#92400E;',
    grace:   'background:#FFEDD5;color:#9A3412;',
    overdue: 'background:#FEE2E2;color:#991B1B;',
  };
  const STATUS_LABEL = { paid:'✓ Pagado', current:'⏳ Vigente', grace:'⚠ En gracia', overdue:'✗ Vencido' };

  const cycleRows = cycles.map(c => `
    <tr style="${c.status === 'paid' ? '' : 'background:#FFFBEB'}">
      <td style="padding:7px 10px;text-align:center;font-weight:700;color:#475569">${c.number}</td>
      <td style="padding:7px 10px;font-weight:600;color:#1E293B">${c.periodLabel}</td>
      <td style="padding:7px 10px;color:#475569">${fmtD(c.cycleStart)}</td>
      <td style="padding:7px 10px;color:#475569">${fmtD(c.cycleEnd)}</td>
      <td style="padding:7px 10px;color:#475569">${fmtD(c.dueDate)}</td>
      <td style="padding:7px 10px;font-weight:700;color:#1E293B">${fmtM(c.expectedAmount)}</td>
      <td style="padding:7px 10px;font-weight:700;color:${c.payment ? '#15803D' : '#9CA3AF'}">${c.payment ? fmtM(c.payment.amount) : '—'}</td>
      <td style="padding:7px 10px;color:#475569">${c.payment ? fmtD(c.payment.payment_date) : '—'}</td>
      <td style="padding:7px 10px">
        <span style="${STATUS_STYLE[c.status] || ''}padding:2px 8px;border-radius:99px;font-size:11px;font-weight:700">
          ${STATUS_LABEL[c.status] || c.status}
        </span>
      </td>
    </tr>`).join('');

  const generatedAt = new Date().toLocaleDateString('es-MX', { day:'2-digit', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' });

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <title>Kardex Membresía — ${tenantData?.name || ''}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; font-size:12px; color:#1E293B; background:white; }
    @page { size: A4 landscape; margin: 14mm 16mm; }
    @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
    .page { padding:0; }
    .header { display:flex; align-items:flex-start; justify-content:space-between; padding-bottom:14px; border-bottom:2px solid #0D9488; margin-bottom:14px; }
    .header-left { display:flex; align-items:center; gap:14px; }
    .header-logo { height:38px; width:auto; object-fit:contain; }
    .header-title h1 { font-size:17px; font-weight:900; color:#0F766E; letter-spacing:-0.3px; }
    .header-title p  { font-size:11px; color:#64748B; margin-top:2px; }
    .header-right { text-align:right; }
    .header-right .doc-label { font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:.06em; color:#94A3B8; }
    .header-right .doc-num   { font-size:13px; font-weight:900; color:#1E293B; margin-top:3px; }
    .info-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:14px; }
    .info-box { background:#F8FAFC; border:1px solid #E2E8F0; border-radius:8px; padding:10px 14px; }
    .info-box h3 { font-size:9px; font-weight:800; text-transform:uppercase; letter-spacing:.07em; color:#94A3B8; margin-bottom:6px; }
    .info-box p  { font-size:12px; font-weight:600; color:#1E293B; line-height:1.5; }
    .info-box .sub { font-size:11px; font-weight:400; color:#64748B; }
    .plan-strip { background:#F0FDFA; border:1px solid #99F6E4; border-radius:8px; padding:10px 16px; margin-bottom:14px; display:flex; gap:24px; align-items:center; }
    .plan-strip .item { }
    .plan-strip .item .label { font-size:9px; font-weight:800; text-transform:uppercase; letter-spacing:.06em; color:#0F766E; }
    .plan-strip .item .value { font-size:13px; font-weight:900; color:#0F766E; margin-top:2px; }
    .pay-info { background:#FFF7ED; border:1px solid #FED7AA; border-radius:8px; padding:10px 16px; margin-bottom:14px; display:flex; gap:32px; align-items:center; flex-wrap:wrap; }
    .pay-info h3 { font-size:9px; font-weight:800; text-transform:uppercase; letter-spacing:.07em; color:#C2410C; margin-bottom:4px; width:100%; }
    .pay-info .pi { display:flex; flex-direction:column; gap:1px; }
    .pay-info .pi .lbl { font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; color:#9A3412; }
    .pay-info .pi .val { font-size:12px; font-weight:800; color:#1E293B; }
    table { width:100%; border-collapse:collapse; font-size:11px; }
    thead tr { background:#0F766E; }
    thead th { padding:8px 10px; text-align:left; font-size:9px; font-weight:800; text-transform:uppercase; letter-spacing:.06em; color:white; white-space:nowrap; }
    tbody tr:nth-child(even) { background:#F8FAFC; }
    tbody td { border-bottom:1px solid #F1F5F9; }
    .summary { display:grid; grid-template-columns:repeat(5,1fr); gap:8px; margin-top:14px; }
    .sum-card { background:#F8FAFC; border:1px solid #E2E8F0; border-radius:8px; padding:8px 12px; text-align:center; }
    .sum-card .s-label { font-size:9px; font-weight:800; text-transform:uppercase; letter-spacing:.05em; color:#94A3B8; }
    .sum-card .s-val   { font-size:15px; font-weight:900; color:#1E293B; margin-top:4px; }
    .sum-card.green .s-val { color:#15803D; }
    .sum-card.red   .s-val { color:#DC2626; }
    .footer { margin-top:14px; padding-top:10px; border-top:1px solid #E2E8F0; display:flex; justify-content:space-between; font-size:10px; color:#94A3B8; }
  </style>
</head>
<body>
<div class="page">

  <!-- Header -->
  <div class="header">
    <div class="header-left">
      <img src="${logoUrl}" alt="Homly" class="header-logo" onerror="this.style.display='none'"/>
      <div class="header-title">
        <h1>Estado de Cuenta — Membresía</h1>
        <p>Kardex de ciclos de facturación</p>
      </div>
    </div>
    <div class="header-right">
      <div class="doc-label">Documento</div>
      <div class="doc-num">Membresía Homly</div>
      <div style="font-size:11px;color:#64748B;margin-top:3px">${generatedAt}</div>
    </div>
  </div>

  <!-- Info grid -->
  <div class="info-grid">
    <div class="info-box">
      <h3>Condominio</h3>
      <p>${tenantData?.name || '—'}</p>
      ${tenantData?.razon_social && tenantData.razon_social !== tenantData?.name ? `<p class="sub">Razón social: ${tenantData.razon_social}</p>` : ''}
      ${tenantData?.rfc ? `<p class="sub">RFC: ${tenantData.rfc}</p>` : ''}
      ${addr ? `<p class="sub">${addr}</p>` : ''}
    </div>
    <div class="info-box">
      <h3>Contacto Administrador</h3>
      <p>${adminName || '—'}</p>
      ${adminEmail ? `<p class="sub">${adminEmail}</p>` : ''}
      <p class="sub" style="margin-top:6px">
        Estado membresía: <strong style="color:${sub.status==='active'?'#15803D':sub.status==='trial'?'#2563EB':'#DC2626'}">${sub.status_label || sub.status}</strong>
      </p>
    </div>
  </div>

  <!-- Información de Pago -->
  <div class="pay-info">
    <h3>Información de Pago</h3>
    <div class="pi"><div class="lbl">Banco</div><div class="val">BBVA</div></div>
    <div class="pi"><div class="lbl">Titular</div><div class="val">Spotynet S.A. de C.V.</div></div>
    <div class="pi"><div class="lbl">No. Cuenta</div><div class="val">011 785 7578</div></div>
    <div class="pi"><div class="lbl">Cuenta CLABE</div><div class="val">012 180 00117857578</div></div>
  </div>

  <!-- Plan strip -->
  <div class="plan-strip">
    <div class="item">
      <div class="label">Plan</div>
      <div class="value">${sub.plan_name || 'Sin plan'}</div>
    </div>
    <div class="item">
      <div class="label">Ciclo</div>
      <div class="value">${sub.plan_billing_cycle === 'annual' ? 'Anual' : 'Mensual'}</div>
    </div>
    <div class="item">
      <div class="label">Monto por ciclo</div>
      <div class="value">${fmtM(sub.amount_per_cycle)} ${sub.currency}</div>
    </div>
    ${sub.units_count > 0 ? `<div class="item"><div class="label">Unidades</div><div class="value">${sub.units_count}</div></div>` : ''}
    ${sub.billing_start ? `<div class="item"><div class="label">Inicio facturación</div><div class="value">${fmtD(sub.billing_start)}</div></div>` : ''}
    ${sub.next_billing_date ? `<div class="item"><div class="label">Próximo vencimiento</div><div class="value">${fmtD(sub.next_billing_date)}</div></div>` : ''}
  </div>

  <!-- Kardex table -->
  <table>
    <thead>
      <tr>
        <th style="width:36px">#</th>
        <th>Período</th>
        <th>Inicio ciclo</th>
        <th>Fin ciclo</th>
        <th>Vencimiento</th>
        <th>Cargo esperado</th>
        <th>Pago registrado</th>
        <th>Fecha de pago</th>
        <th>Estado</th>
      </tr>
    </thead>
    <tbody>
      ${trialRow}
      ${cycleRows || '<tr><td colspan="9" style="text-align:center;padding:20px;color:#94A3B8">Sin ciclos de facturación registrados</td></tr>'}
    </tbody>
  </table>

  <!-- Summary -->
  <div class="summary">
    <div class="sum-card">
      <div class="s-label">Total ciclos</div>
      <div class="s-val">${cycles.length}</div>
    </div>
    <div class="sum-card green">
      <div class="s-label">Pagados</div>
      <div class="s-val">${paidCount}</div>
    </div>
    <div class="sum-card ${overdueCount > 0 ? 'red' : ''}">
      <div class="s-label">Vencidos</div>
      <div class="s-val">${overdueCount}</div>
    </div>
    <div class="sum-card green">
      <div class="s-label">Total pagado</div>
      <div class="s-val">${fmtM(totalPaid)}</div>
    </div>
    <div class="sum-card ${balance > 0 ? 'red' : 'green'}">
      <div class="s-label">Saldo pendiente</div>
      <div class="s-val">${fmtM(Math.max(0, balance))}</div>
    </div>
  </div>

  <!-- Footer -->
  <div class="footer">
    <span>Homly · Sistema de Gestión de Condominios · soporte@homly.mx</span>
    <span>Generado: ${generatedAt} · v${APP_VERSION}</span>
  </div>

</div>
</body>
</html>`;

  const w = window.open('', '_blank', 'width=1100,height=800');
  if (!w) { alert('Permite las ventanas emergentes para generar el PDF.'); return; }
  w.document.write(html);
  w.document.close();
  setTimeout(() => { w.focus(); w.print(); }, 700);
}

// ─── Kardex Section (on-screen) ───────────────────────────────────────────────

const CYCLE_STATUS = {
  paid:    { label: 'Pagado',    color: '#15803D', bg: '#DCFCE7', border: '#BBF7D0' },
  current: { label: 'Vigente',   color: '#92400E', bg: '#FEF3C7', border: '#FDE68A' },
  grace:   { label: 'En gracia', color: '#9A3412', bg: '#FFEDD5', border: '#FED7AA' },
  overdue: { label: 'Vencido',   color: '#991B1B', bg: '#FEE2E2', border: '#FECACA' },
};

function KardexSection({ cycles, sub, tenantData, adminName, adminEmail, onViewReceipt }) {
  const [expanded, setExpanded] = useState(true);

  const sym = { MXN: '$', USD: 'US$', EUR: '€', COP: 'COP$' };
  const curr = sym[sub?.currency] || '$';
  const fmtM = (n) => `${curr}${Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
  const fmtD = (d) => {
    if (!d) return '—';
    try { return new Date(d + 'T00:00:00').toLocaleDateString('es-MX', { day:'2-digit', month:'short', year:'numeric' }); }
    catch { return d; }
  };

  const totalPaid  = cycles.filter(c => c.payment).reduce((s, c) => s + Number(c.payment.amount), 0);
  const paidCount  = cycles.filter(c => c.status === 'paid').length;
  const overdueCount = cycles.filter(c => c.status === 'overdue').length;

  if (!sub?.billing_start && !sub?.trial_start) return null;

  return (
    <div style={{
      gridColumn: '1 / -1',
      background: 'var(--white)', border: '1px solid var(--sand-200)', borderRadius: 16,
    }}>
      {/* Section header */}
      <button
        onClick={() => setExpanded(p => !p)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          padding: '16px 20px', background: 'none', border: 'none', cursor: 'pointer',
          borderBottom: expanded ? '1px solid var(--sand-100)' : 'none',
          borderRadius: expanded ? '16px 16px 0 0' : 16,
        }}
      >
        <FileText size={13} color="var(--ink-400)" />
        <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--ink-400)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          Kardex de Membresía
        </span>
        <span style={{
          fontSize: 11, fontWeight: 700,
          background: 'var(--teal-50)', color: 'var(--teal-700)', border: '1px solid var(--teal-200)',
          borderRadius: 12, padding: '2px 10px',
        }}>
          {cycles.length} ciclos
        </span>
        {/* Summary chips */}
        {paidCount > 0 && (
          <span style={{ fontSize: 11, fontWeight: 700, background: '#DCFCE7', color: '#15803D', border: '1px solid #BBF7D0', borderRadius: 12, padding: '2px 8px' }}>
            {paidCount} pagados
          </span>
        )}
        {overdueCount > 0 && (
          <span style={{ fontSize: 11, fontWeight: 700, background: '#FEE2E2', color: '#991B1B', border: '1px solid #FECACA', borderRadius: 12, padding: '2px 8px' }}>
            {overdueCount} vencidos
          </span>
        )}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); printKardexPDF({ cycles, sub, tenantData, adminName, adminEmail }); }}
          style={{
            marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '6px 14px', background: 'var(--teal-600)', border: 'none',
            borderRadius: 8, fontSize: 12, fontWeight: 700, color: 'white',
            cursor: 'pointer', flexShrink: 0,
          }}
          title="Imprimir / Descargar PDF"
        >
          <Printer size={12} /> PDF
        </button>
        {expanded ? <ChevronUp size={14} color="var(--ink-400)" /> : <ChevronDown size={14} color="var(--ink-400)" />}
      </button>

      {expanded && (
        <div style={{ padding: '0 0 4px' }}>
          {/* Trial period row */}
          {sub.trial_start && (
            <div style={{
              display: 'grid', gridTemplateColumns: '44px 1fr 1fr 1fr 110px 110px 120px',
              gap: 0, padding: '10px 20px',
              background: '#EFF6FF', borderBottom: '1px solid #DBEAFE',
              alignItems: 'center',
            }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#475569', textAlign: 'center' }}>—</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#2563EB' }}>Período de Prueba</span>
              <span style={{ fontSize: 11, color: '#475569' }}>{fmtD(sub.trial_start)}</span>
              <span style={{ fontSize: 11, color: '#475569' }}>{fmtD(sub.trial_end)}</span>
              <span style={{ fontSize: 11, color: '#475569' }}>—</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#16A34A' }}>{fmtM(0)}</span>
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
                background: '#DBEAFE', color: '#1D4ED8', display: 'inline-block',
              }}>Prueba gratuita</span>
            </div>
          )}

          {/* Column headers */}
          <div style={{
            display: 'grid', gridTemplateColumns: '44px 1fr 1fr 1fr 110px 110px 120px',
            gap: 0, padding: '6px 20px 4px',
            background: 'var(--sand-50)', borderBottom: '1px solid var(--sand-100)',
          }}>
            {['#','Período','Inicio ciclo','Vencimiento','Cargo esperado','Pagado','Estado'].map(h => (
              <span key={h} style={{ fontSize: 10, fontWeight: 800, color: 'var(--ink-400)', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: h === '#' ? 'center' : 'left' }}>{h}</span>
            ))}
          </div>

          {/* Cycle rows */}
          {cycles.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--ink-400)', fontSize: 13 }}>
              No hay ciclos de facturación registrados.
            </div>
          ) : (
            cycles.map((c) => {
              const st = CYCLE_STATUS[c.status] || CYCLE_STATUS.current;
              return (
                <div key={c.number} style={{
                  display: 'grid', gridTemplateColumns: '44px 1fr 1fr 1fr 110px 110px 120px',
                  gap: 0, padding: '10px 20px',
                  background: c.status === 'paid' ? 'transparent' : c.status === 'current' ? '#FFFBEB' : c.status === 'overdue' ? '#FFF5F5' : '#FFF7ED',
                  borderBottom: '1px solid var(--sand-50)',
                  alignItems: 'center',
                }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-500)', textAlign: 'center' }}>{c.number}</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-800)' }}>{c.periodLabel}</div>
                    {c.payment?.reference && (
                      <div style={{ fontSize: 10, color: 'var(--ink-300)', marginTop: 1 }}>Ref: {c.payment.reference}</div>
                    )}
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--ink-500)' }}>{fmtD(c.cycleStart)}</span>
                  <span style={{ fontSize: 11, color: 'var(--ink-500)' }}>{fmtD(c.dueDate)}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-700)' }}>{fmtM(c.expectedAmount)}</span>
                  <div>
                    {c.payment ? (
                      <>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#15803D' }}>{fmtM(c.payment.amount)}</div>
                        <div style={{ fontSize: 10, color: 'var(--ink-400)', marginTop: 1 }}>{fmtD(c.payment.payment_date)}</div>
                      </>
                    ) : (
                      <span style={{ fontSize: 11, color: 'var(--ink-300)' }}>—</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
                      background: st.bg, color: st.color, border: `1px solid ${st.border}`,
                    }}>{st.label}</span>
                    {c.payment && onViewReceipt && (
                      <button
                        onClick={() => onViewReceipt(c.payment)}
                        style={{
                          padding: '3px 7px', background: 'var(--teal-50)', border: '1.5px solid var(--teal-200)',
                          borderRadius: 6, fontSize: 10, fontWeight: 700, color: 'var(--teal-700)',
                          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                        }}
                        title="Ver recibo"
                      >
                        <Eye size={10} /> Recibo
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}

          {/* Totals row */}
          {cycles.length > 0 && (
            <div style={{
              display: 'grid', gridTemplateColumns: '44px 1fr 1fr 1fr 110px 110px 120px',
              gap: 0, padding: '10px 20px',
              background: 'var(--sand-50)', borderTop: '2px solid var(--sand-200)',
              alignItems: 'center',
            }}>
              <span />
              <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--ink-600)', textTransform: 'uppercase', letterSpacing: '0.05em', gridColumn: '2 / 5' }}>
                Total · {cycles.length} ciclo{cycles.length !== 1 ? 's' : ''}
              </span>
              <span />
              <span style={{ fontSize: 13, fontWeight: 900, color: '#15803D' }}>{fmtM(totalPaid)}</span>
              <span />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────
function InfoRow({ label, value, accent, chip }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 0', borderBottom: '1px solid var(--sand-100)',
    }}>
      <span style={{ fontSize: 13, color: 'var(--ink-500)', fontWeight: 500 }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {chip && (
          <span style={{
            fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 12,
            background: chip.bg, color: chip.color, border: `1px solid ${chip.border}`,
          }}>{chip.label}</span>
        )}
        <span style={{
          fontSize: 13, fontWeight: 700,
          color: accent || 'var(--ink-800)',
          textAlign: 'right', maxWidth: '55%',
        }}>{value || '—'}</span>
      </div>
    </div>
  );
}

function MetricCard({ icon, label, value, sub: subtitle, color, bg, border }) {
  return (
    <div style={{
      background: bg || 'var(--white)', border: `1px solid ${border || 'var(--sand-200)'}`,
      borderRadius: 14, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: color || 'var(--ink-400)' }}>
        {icon}
        <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {label}
        </span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 900, color: color || 'var(--ink-800)', lineHeight: 1.1 }}>{value}</div>
      {subtitle && <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>{subtitle}</div>}
    </div>
  );
}

function AlertBanner({ type, title, message }) {
  const styles = {
    warning: { bg: '#FFFBEB', border: '#FDE68A', color: '#92400E', icon: <AlertTriangle size={18} color="#D97706" /> },
    danger:  { bg: '#FEF2F2', border: '#FECACA', color: '#7F1D1D', icon: <AlertCircle size={18} color="#DC2626" /> },
    info:    { bg: '#EFF6FF', border: '#BFDBFE', color: '#1E3A5F', icon: <Info size={18} color="#2563EB" /> },
    success: { bg: '#F0FDF4', border: '#BBF7D0', color: '#14532D', icon: <CheckCircle size={18} color="#16A34A" /> },
  };
  const s = styles[type] || styles.info;
  return (
    <div style={{
      background: s.bg, border: `1.5px solid ${s.border}`, borderRadius: 14,
      padding: '14px 18px', display: 'flex', alignItems: 'flex-start', gap: 12,
    }}>
      <div style={{ flexShrink: 0, marginTop: 1 }}>{s.icon}</div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 800, color: s.color, marginBottom: 3 }}>{title}</div>
        <div style={{ fontSize: 13, color: s.color, opacity: 0.85, lineHeight: 1.5 }}>{message}</div>
      </div>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function MiMembresia() {
  const { tenantId, tenantName, user: authUser } = useAuth();

  const [sub,            setSub]            = useState(null);
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState(null);
  const [payments,       setPayments]       = useState([]);
  const [tenantData,     setTenantData]     = useState(null);
  const [receiptPayment, setReceiptPayment] = useState(null);
  const [adminUser,      setAdminUser]      = useState(null);

  const loadSub = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const [subRes, paysRes, tenantRes, usersRes] = await Promise.allSettled([
        tenantsAPI.getSubscription(tenantId),
        tenantsAPI.getSubscriptionPayments(tenantId),
        tenantsAPI.get(tenantId),
        usersAPI.list(tenantId, { page_size: 50 }),
      ]);
      if (subRes.status === 'fulfilled') {
        setSub(subRes.value.data);
      } else if (subRes.reason?.response?.status === 404) {
        setSub(null);
      } else {
        setError('No se pudo cargar la información de la membresía.');
      }
      if (paysRes.status === 'fulfilled') {
        setPayments(Array.isArray(paysRes.value.data) ? paysRes.value.data : []);
      }
      if (tenantRes.status === 'fulfilled') {
        setTenantData(tenantRes.value.data || null);
      }
      if (usersRes.status === 'fulfilled') {
        const allUsers = Array.isArray(usersRes.value.data)
          ? usersRes.value.data
          : (usersRes.value.data?.results || []);
        const admin = allUsers.find(u => u.role === 'admin') || allUsers[0] || null;
        setAdminUser(admin);
      }
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { loadSub(); }, [loadSub]);

  // ─── Billing cycles (kardex) ─────────────────────────────────────────────────
  const cycles = useMemo(() => generateBillingCycles(sub, payments), [sub, payments]);

  // Admin contact for PDF
  const adminName  = adminUser?.user_name  || authUser?.name  || '';
  const adminEmail = adminUser?.user_email || authUser?.email || '';

  // ─── Derived values ──────────────────────────────────────────────────────────
  const derived = useMemo(() => {
    if (!sub) return {};
    const today = new Date().toISOString().slice(0, 10);

    // Tenure: from billing_start or trial_start
    const tenureStart = sub.billing_start || sub.trial_start;
    const tenure = calcTenure(tenureStart);

    // Days until next billing
    const daysUntilDue = sub.next_billing_date ? daysDiff(today, sub.next_billing_date) : null;

    // Last payment
    const sortedPays = [...payments].sort((a, b) =>
      new Date(b.payment_date || 0) - new Date(a.payment_date || 0)
    );
    const lastPayment = sortedPays[0] || null;

    // Billing cycle label — plan_billing_cycle comes from TenantSubscriptionSerializer
    const cycleLabel = sub.plan_billing_cycle
      ? (sub.plan_billing_cycle === 'annual' ? 'Anual' : 'Mensual')
      : null;

    // Grace period: 5 days from next_billing_date
    const graceEnd = sub.next_billing_date
      ? new Date(sub.next_billing_date + 'T00:00:00')
      : null;
    if (graceEnd) graceEnd.setDate(graceEnd.getDate() + 5);
    const graceEndStr = graceEnd ? graceEnd.toISOString().slice(0, 10) : null;
    const daysUntilGrace = graceEndStr ? daysDiff(today, graceEndStr) : null;

    return { tenure, tenureStart, daysUntilDue, sortedPays, lastPayment, cycleLabel, graceEndStr, daysUntilGrace };
  }, [sub, payments]);

  // ─── Loading ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="content-fade" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 300 }}>
        <div style={{ textAlign: 'center', color: 'var(--ink-400)' }}>
          <RefreshCw size={28} className="spin" style={{ display: 'block', margin: '0 auto 12px' }} />
          Cargando membresía…
        </div>
      </div>
    );
  }

  // ─── Error ───────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="content-fade">
        <div style={{
          background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 14,
          padding: 24, textAlign: 'center', maxWidth: 480, margin: '48px auto',
        }}>
          <AlertCircle size={32} color="#DC2626" style={{ display: 'block', margin: '0 auto 12px' }} />
          <p style={{ fontWeight: 700, color: '#DC2626', marginBottom: 8 }}>Error</p>
          <p style={{ fontSize: 14, color: 'var(--ink-600)' }}>{error}</p>
          <button onClick={loadSub} style={{
            marginTop: 16, padding: '8px 20px', background: 'var(--teal-600)',
            color: 'white', border: 'none', borderRadius: 10, fontWeight: 600, cursor: 'pointer',
          }}>
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  // ─── No subscription ─────────────────────────────────────────────────────────
  if (!sub) {
    return (
      <div className="content-fade">
        <div style={{
          background: 'var(--sand-50)', border: '1px solid var(--sand-200)', borderRadius: 20,
          padding: '48px 24px', textAlign: 'center', maxWidth: 480, margin: '48px auto',
        }}>
          <CreditCard size={40} color="var(--sand-300)" style={{ display: 'block', margin: '0 auto 16px' }} />
          <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink-600)', marginBottom: 8 }}>
            Sin membresía configurada
          </p>
          <p style={{ fontSize: 14, color: 'var(--ink-400)' }}>
            Este condominio aún no tiene una membresía asignada. Comunícate con el equipo de Homly para activar tu plan.
          </p>
        </div>
      </div>
    );
  }

  const s = SUB_STATUS[sub.status] || { label: sub.status_label || sub.status, color: '#6B7280', bg: '#F9FAFB', border: '#E5E7EB', icon: AlertCircle };
  const StatusIcon = s.icon;
  const { tenure, tenureStart, daysUntilDue, sortedPays, lastPayment, cycleLabel, graceEndStr, daysUntilGrace } = derived;

  // Due date color
  const dueDateColor = daysUntilDue === null ? 'var(--ink-800)'
    : daysUntilDue < 0   ? '#DC2626'
    : daysUntilDue <= 3  ? '#D97706'
    : daysUntilDue <= 7  ? '#CA8A04'
    : '#16A34A';

  const dueDateLabel = daysUntilDue === null ? '—'
    : daysUntilDue < 0   ? `Vencido hace ${Math.abs(daysUntilDue)} ${Math.abs(daysUntilDue) === 1 ? 'día' : 'días'}`
    : daysUntilDue === 0 ? 'Vence hoy'
    : daysUntilDue === 1 ? 'Vence mañana'
    : `${daysUntilDue} días restantes`;

  return (
    <>
    <div className="content-fade">

      {/* ── Page header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12,
          background: 'var(--teal-50)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <CreditCard size={22} color="var(--teal-600)" />
        </div>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink-800)', margin: 0 }}>
            Estado de Cuenta — Membresía
          </h2>
          <div style={{ fontSize: 13, color: 'var(--ink-400)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Building2 size={12} /> {tenantName}
          </div>
        </div>
        <button
          onClick={loadSub}
          title="Actualizar"
          style={{
            marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 14px', background: 'var(--sand-50)', border: '1px solid var(--sand-200)',
            borderRadius: 10, fontSize: 12, fontWeight: 700, color: 'var(--ink-500)', cursor: 'pointer',
          }}
        >
          <RefreshCw size={13} /> Actualizar
        </button>
      </div>

      {/* ── Alert banners ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
        {sub.status === 'past_due' && (
          <AlertBanner
            type="danger"
            title="Pago de membresía vencido"
            message={`Tu membresía tiene un pago pendiente${sub.next_billing_date ? ` desde el ${fmtDate(sub.next_billing_date)}` : ''}. El acceso a la plataforma puede estar restringido hasta que se registre el pago. Comunícate con el equipo de Homly para regularizar tu cuenta.`}
          />
        )}
        {sub.status === 'trial' && sub.trial_days_remaining <= 7 && sub.trial_days_remaining > 0 && (
          <AlertBanner
            type="warning"
            title="Tu período de prueba está por vencer"
            message={`Te quedan ${sub.trial_days_remaining} ${sub.trial_days_remaining === 1 ? 'día' : 'días'} de prueba gratuita. Contacta a nuestro equipo para activar tu plan y continuar sin interrupciones.`}
          />
        )}
        {sub.status === 'trial' && sub.trial_days_remaining <= 0 && (
          <AlertBanner
            type="danger"
            title="Período de prueba expirado"
            message="Tu período de prueba ha concluido. Contacta al equipo de Homly para activar tu plan de membresía."
          />
        )}
        {sub.status === 'expired' && (
          <AlertBanner
            type="danger"
            title="Membresía expirada"
            message="Tu membresía ha expirado. Para reactivar el acceso completo, contacta a nuestro equipo de soporte."
          />
        )}
        {sub.status === 'cancelled' && (
          <AlertBanner
            type="info"
            title="Membresía cancelada"
            message="Esta membresía ha sido cancelada. Si deseas reactivarla, comunícate con el equipo de Homly."
          />
        )}
        {sub.status === 'active' && daysUntilDue !== null && daysUntilDue >= 0 && daysUntilDue <= 5 && (
          <AlertBanner
            type="warning"
            title="Próximo vencimiento de pago"
            message={`Tu pago mensual vence el ${fmtDate(sub.next_billing_date)}. Recuerda que tienes hasta 5 días después del vencimiento (${fmtDate(graceEndStr)}) antes de que la cuenta sea suspendida.`}
          />
        )}
        {sub.status === 'active' && (
          <AlertBanner
            type="info"
            title="Política de cobro"
            message="Los pagos deben registrarse dentro de los primeros 5 días de cada mes. Pasado este plazo sin confirmación de pago, la cuenta podrá ser suspendida temporalmente de forma automática."
          />
        )}
      </div>

      {/* ── Status hero card ── */}
      <div style={{
        background: s.bg, border: `2px solid ${s.border}`, borderRadius: 20, padding: '24px 28px',
        marginBottom: 20, display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap',
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: 16,
          background: 'rgba(255,255,255,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <StatusIcon size={32} color={s.color} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: s.color, marginBottom: 4 }}>
            Estado de membresía
          </div>
          <div style={{ fontSize: 28, fontWeight: 900, color: s.color, lineHeight: 1.1, marginBottom: 6 }}>
            {sub.status_label || s.label}
          </div>
          <div style={{ fontSize: 13, color: 'var(--ink-500)' }}>
            {sub.plan_name ? `Plan ${sub.plan_name}` : 'Sin plan asignado'}
            {cycleLabel && sub.plan_name ? ` · ${cycleLabel}` : ''}
            {tenure ? ` · ${tenure} de antigüedad` : ''}
          </div>
        </div>
        {sub.status === 'trial' && sub.trial_days_remaining > 0 && (
          <div style={{
            textAlign: 'center', flexShrink: 0,
            background: 'rgba(255,255,255,0.8)', borderRadius: 14, padding: '12px 20px',
          }}>
            <div style={{ fontSize: 32, fontWeight: 900, color: '#2563EB', lineHeight: 1 }}>
              {sub.trial_days_remaining}
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#1D4ED8', marginTop: 4 }}>
              días de prueba
            </div>
          </div>
        )}
        {sub.next_billing_date && sub.status === 'active' && (
          <div style={{
            textAlign: 'center', flexShrink: 0,
            background: 'rgba(255,255,255,0.8)', borderRadius: 14, padding: '12px 20px',
          }}>
            <div style={{ fontSize: 28, fontWeight: 900, color: dueDateColor, lineHeight: 1 }}>
              {daysUntilDue !== null ? (daysUntilDue < 0 ? Math.abs(daysUntilDue) : daysUntilDue) : '—'}
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: dueDateColor, marginTop: 4 }}>
              {dueDateLabel}
            </div>
          </div>
        )}
      </div>

      {/* ── Metric grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14, marginBottom: 20 }}>
        <MetricCard
          icon={<Award size={14} />}
          label="Antigüedad"
          value={tenure || 'Nuevo'}
          sub={tenureStart ? `Desde ${fmtDateShort(tenureStart)}` : undefined}
          color="var(--teal-700)"
          bg="var(--teal-50)"
          border="var(--teal-200)"
        />
        <MetricCard
          icon={<DollarSign size={14} />}
          label="Monto por ciclo"
          value={sub.amount_per_cycle > 0 ? fmtAmt(sub.amount_per_cycle, sub.currency) : 'Por definir'}
          sub={cycleLabel || undefined}
          color="var(--ink-700)"
        />
        <MetricCard
          icon={<Calendar size={14} />}
          label="Próximo vencimiento"
          value={sub.next_billing_date ? fmtDateShort(sub.next_billing_date) : '—'}
          sub={daysUntilDue !== null ? dueDateLabel : undefined}
          color={dueDateColor}
          bg={daysUntilDue !== null && daysUntilDue <= 3 ? '#FEF2F2' : undefined}
          border={daysUntilDue !== null && daysUntilDue <= 3 ? '#FECACA' : undefined}
        />
        <MetricCard
          icon={<Receipt size={14} />}
          label="Pagos registrados"
          value={payments.length}
          sub={lastPayment ? `Último: ${fmtDateShort(lastPayment.payment_date)}` : 'Ninguno aún'}
          color="var(--ink-700)"
        />
        {sub.units_count > 0 && (
          <MetricCard
            icon={<Building2 size={14} />}
            label="Unidades"
            value={sub.units_count}
            sub="Unidades en el plan"
            color="var(--ink-700)"
          />
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 18 }}>

        {/* ── Estado de cuenta detallado ── */}
        <div style={{ background: 'var(--white)', border: '1px solid var(--sand-200)', borderRadius: 16, padding: 20 }}>
          <div style={{
            fontSize: 11, fontWeight: 800, color: 'var(--ink-400)', textTransform: 'uppercase',
            letterSpacing: '0.07em', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <CreditCard size={13} /> Estado de Cuenta
          </div>
          <InfoRow
            label="Estado de membresía"
            value={sub.status_label || s.label}
            accent={s.color}
          />
          <InfoRow label="Plan" value={sub.plan_name || 'Sin plan'} />
          <InfoRow label="Ciclo de facturación" value={cycleLabel || '—'} />
          <InfoRow label="Monto por ciclo"    value={sub.amount_per_cycle > 0 ? fmtAmt(sub.amount_per_cycle, sub.currency) : '—'} />
          <InfoRow label="Moneda"             value={sub.currency || '—'} />
          <InfoRow
            label="Próximo vencimiento"
            value={fmtDate(sub.next_billing_date)}
            accent={dueDateColor}
          />
          {graceEndStr && sub.status === 'active' && (
            <InfoRow
              label="Límite con período de gracia"
              value={fmtDate(graceEndStr)}
              accent={daysUntilGrace !== null && daysUntilGrace <= 0 ? '#DC2626' : 'var(--ink-600)'}
            />
          )}
          <InfoRow label="Pagos registrados" value={payments.length > 0 ? `${payments.length} pagos` : 'Ninguno'} />
          {lastPayment && (
            <InfoRow
              label="Último pago"
              value={`${fmtAmt(lastPayment.amount, lastPayment.currency)} · ${fmtDateShort(lastPayment.payment_date)}`}
              accent="#16A34A"
            />
          )}
        </div>

        {/* ── Antigüedad y datos del condominio ── */}
        <div style={{ background: 'var(--white)', border: '1px solid var(--sand-200)', borderRadius: 16, padding: 20 }}>
          <div style={{
            fontSize: 11, fontWeight: 800, color: 'var(--ink-400)', textTransform: 'uppercase',
            letterSpacing: '0.07em', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <TrendingUp size={13} /> Membresía y Antigüedad
          </div>
          {tenantData && (
            <>
              <InfoRow label="Condominio"  value={tenantData.name} />
              {tenantData.city && <InfoRow label="Ciudad" value={tenantData.city} />}
            </>
          )}
          {sub.trial_start && (
            <InfoRow label="Inicio de prueba"       value={fmtDate(sub.trial_start)} />
          )}
          {sub.trial_end && (
            <InfoRow label="Fin de prueba"          value={fmtDate(sub.trial_end)} />
          )}
          {sub.billing_start && (
            <InfoRow label="Inicio de facturación"  value={fmtDate(sub.billing_start)} />
          )}
          <InfoRow
            label="Antigüedad en Homly"
            value={tenure || 'Nuevo miembro'}
            accent="var(--teal-700)"
          />
          {sub.trial_days_remaining > 0 && sub.status === 'trial' && (
            <InfoRow
              label="Días restantes de prueba"
              value={`${sub.trial_days_remaining} días`}
              accent="#2563EB"
            />
          )}
        </div>

        {/* ── Notas ── */}
        {sub.notes && (
          <div style={{ gridColumn: '1 / -1', background: 'var(--sand-50)', border: '1px solid var(--sand-200)', borderRadius: 14, padding: 20 }}>
            <div style={{
              fontSize: 11, fontWeight: 800, color: 'var(--ink-400)', textTransform: 'uppercase',
              letterSpacing: '0.07em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <Bell size={13} /> Notas
            </div>
            <p style={{ fontSize: 14, color: 'var(--ink-600)', margin: 0, lineHeight: 1.6 }}>{sub.notes}</p>
          </div>
        )}

        {/* ── Historial de pagos ── */}
        <div style={{
          gridColumn: '1 / -1',
          background: 'var(--white)', border: '1px solid var(--sand-200)', borderRadius: 16, padding: 20,
        }}>
          <div style={{
            fontSize: 11, fontWeight: 800, color: 'var(--ink-400)', textTransform: 'uppercase',
            letterSpacing: '0.07em', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <Receipt size={13} /> Historial de Pagos
            {payments.length > 0 && (
              <span style={{
                marginLeft: 'auto', fontSize: 11, fontWeight: 700,
                background: 'var(--teal-50)', color: 'var(--teal-700)',
                border: '1px solid var(--teal-200)', borderRadius: 12, padding: '2px 10px',
              }}>
                {payments.length} {payments.length === 1 ? 'pago' : 'pagos'}
              </span>
            )}
          </div>

          {payments.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--ink-400)', padding: '24px 0', fontSize: 13 }}>
              <CreditCard size={28} color="var(--sand-300)" style={{ display: 'block', margin: '0 auto 10px' }} />
              No hay pagos registrados aún.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {sortedPays.map((p, idx) => (
                <div key={p.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 14px',
                  background: idx === 0 ? '#F0FDF4' : 'var(--sand-50)',
                  border: `1px solid ${idx === 0 ? '#BBF7D0' : 'var(--sand-100)'}`,
                  borderRadius: 10, gap: 12,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                      background: idx === 0 ? '#DCFCE7' : 'var(--sand-100)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <CheckCircle size={16} color={idx === 0 ? '#16A34A' : 'var(--ink-400)'} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink-800)' }}>
                        {fmtAmt(p.amount, p.currency)}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: 2 }}>
                        {p.period_label || '—'}
                        {p.payment_method_label ? ` · ${p.payment_method_label}` : ''}
                        {p.payment_date ? ` · ${fmtDate(p.payment_date)}` : ''}
                      </div>
                      {p.reference && (
                        <div style={{ fontSize: 11, color: 'var(--ink-300)', marginTop: 1 }}>
                          Ref: {p.reference}
                        </div>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => setReceiptPayment(p)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '7px 14px', background: 'var(--teal-50)',
                      border: '1.5px solid var(--teal-200)', borderRadius: 8,
                      fontSize: 12, fontWeight: 700, color: 'var(--teal-700)',
                      cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap',
                    }}
                  >
                    <Eye size={13} /> Ver recibo
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Kardex de ciclos ── */}
        <KardexSection
          cycles={cycles}
          sub={sub}
          tenantData={tenantData}
          adminName={adminName}
          adminEmail={adminEmail}
          onViewReceipt={(p) => setReceiptPayment(p)}
        />

        {/* ── Contact CTA ── */}
        <div style={{
          gridColumn: '1 / -1',
          background: 'linear-gradient(135deg, var(--teal-600) 0%, var(--teal-500) 100%)',
          borderRadius: 16, padding: '20px 24px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
          flexWrap: 'wrap',
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'white', marginBottom: 4 }}>
              ¿Tienes dudas sobre tu membresía?
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)' }}>
              Nuestro equipo puede ayudarte con pagos, upgrades o cualquier situación con tu cuenta.
            </div>
          </div>
          <a
            href="mailto:soporte@homly.mx"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '10px 20px', background: 'white', color: 'var(--teal-700)',
              borderRadius: 10, fontWeight: 700, fontSize: 13,
              textDecoration: 'none', flexShrink: 0,
            }}
          >
            Contactar soporte
          </a>
        </div>

      </div>
    </div>

    {/* Receipt modal */}
    {receiptPayment && (
      <SubscriptionReceiptModal
        payment={receiptPayment}
        tenant={tenantData}
        sub={sub}
        onClose={() => setReceiptPayment(null)}
      />
    )}
  </>
  );
}
