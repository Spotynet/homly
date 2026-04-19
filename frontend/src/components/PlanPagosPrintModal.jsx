/**
 * PlanPagosPrintModal — Vista y PDF del Plan de Pago de Adeudos.
 *
 * Sigue el mismo patrón que PaymentReceiptModal:
 *   - Un área de impresión (#plan-print-area) con todos los datos del plan.
 *   - Botón "Imprimir / PDF" que abre window.open() con CSS recolectado + outerHTML.
 *
 * Props:
 *   plan    – PaymentPlan object (installments, status, totals, etc.)
 *   unit    – Unit object { unit_id_code, unit_name, responsible_name, … }
 *   tc      – Tenant config { name, razon_social, logo, currency, rfc, … }
 *   onClose – () => void
 */
import React from 'react';
import { FileText, Printer, X } from 'lucide-react';
import { CURRENCIES, periodLabel } from '../utils/helpers';

// ── Formateador de moneda ─────────────────────────────────────────────────────
function planFmt(n, currency = 'MXN') {
  const c = CURRENCIES[currency] || CURRENCIES.MXN;
  return c.symbol + (parseFloat(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const PLAN_STATUS_LABELS = {
  draft:     'Borrador',
  sent:      'Enviado',
  accepted:  'Aceptado',
  rejected:  'Rechazado',
  cancelled: 'Cancelado',
};
const INSTALL_STATUS_LABELS = {
  paid:    'Pagado',
  partial: 'Parcial',
  pending: 'Pendiente',
};
const INSTALL_STATUS_COLORS = {
  paid:    '#0d7c6e',
  partial: '#d97706',
  pending: '#e84040',
};
const PLAN_FREQ_LABELS = { 1: 'Mensual', 2: 'Bimestral', 3: 'Trimestral', 6: 'Semestral', 12: 'Anual' };

export default function PlanPagosPrintModal({ plan, unit, tc, onClose }) {
  if (!plan) return null;

  const currency     = tc?.currency || 'MXN';
  const fmt          = (n) => planFmt(n, currency);
  const installments = plan.installments || [];
  const totalPaid    = installments.reduce((s, i) => s + (parseFloat(i.paid_amount) || 0), 0);
  const totalDebt    = installments.reduce((s, i) => s + (parseFloat(i.debt_part)   || 0), 0);
  const totalReg     = installments.reduce((s, i) => s + (parseFloat(i.regular_part)|| 0), 0);
  const totalAll     = installments.reduce((s, i) => s + (parseFloat(i.total)        || 0), 0);
  const statusLabel  = PLAN_STATUS_LABELS[plan.status] || plan.status;
  const freqLabel    = PLAN_FREQ_LABELS[plan.frequency] || `c/${plan.frequency} meses`;
  const unitCode     = unit?.unit_id_code || plan.unit_code || '—';
  const unitName     = unit?.unit_name    || plan.unit_name || '—';
  const responsible  = unit?.responsible_name || '—';
  const fmtDate      = (d) => d ? new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' }) : '—';

  // ── Print ────────────────────────────────────────────────────────────────────
  const handlePrint = () => {
    const el = document.getElementById('plan-print-area');
    if (!el) return;

    const tenantName = (tc?.name || '').replace(/[^a-zA-Z0-9À-ÿ\s]/g, '').trim();
    const printTitle = `Plan de Pago — ${unitCode} — ${tenantName}`;

    let css = '';
    Array.from(document.styleSheets).forEach(sheet => {
      try {
        Array.from(sheet.cssRules || []).forEach(rule => { css += rule.cssText + '\n'; });
      } catch (_) { /* cross-origin, ignorar */ }
    });

    const win = window.open('', '_blank');
    if (!win) return;

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${printTitle}</title>
  <style>
    ${css}
    body { margin: 0; padding: 0; background: white; }
    .plan-print-container {
      border: none !important;
      max-width: 100% !important;
      padding: 10mm 14mm !important;
      margin: 0 !important;
      border-radius: 0 !important;
    }
    @page { size: letter; margin: 0; }
  </style>
</head>
<body>${el.outerHTML}</body>
</html>`;

    win.document.write(html);
    win.document.close();
    const doPrint = () => { win.focus(); win.print(); win.close(); };
    if (win.document.readyState === 'complete') {
      doPrint();
    } else {
      win.addEventListener('load', doPrint);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="modal-bg open" onClick={onClose}>
      <div className="modal lg" onClick={e => e.stopPropagation()} style={{ maxWidth: 700 }}>

        {/* ── Modal header ── */}
        <div className="modal-head">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FileText size={18} style={{ display: 'inline', verticalAlign: -4 }} />
            Plan de Pago — {unitCode}
          </h3>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="modal-body">

          {/* ── Área de impresión ── */}
          <div className="plan-print-container" id="plan-print-area" style={{
            background: '#fff',
            borderRadius: 10,
            border: '1px solid var(--sand-200)',
            padding: '20px 24px',
            fontSize: 13,
            color: '#1a1a2e',
            fontFamily: 'system-ui, -apple-system, sans-serif',
          }}>

            {/* ── Encabezado: logo + datos del tenant ── */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, borderBottom: '2px solid #1e3a5f', paddingBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                {tc?.logo && (() => {
                  const b64 = tc.logo;
                  const mime = b64.startsWith('/9j/') ? 'image/jpeg' : b64.startsWith('iVBOR') ? 'image/png' : 'image/png';
                  const src  = b64.startsWith('data:') ? b64 : `data:${mime};base64,${b64}`;
                  return <img src={src} alt="logo" style={{ height: 50, width: 'auto', objectFit: 'contain' }} />;
                })()}
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#1e3a5f', lineHeight: 1.2 }}>
                    {tc?.razon_social || tc?.name || 'Condominio'}
                  </div>
                  {tc?.name && tc?.razon_social && tc.name !== tc.razon_social && (
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>{tc.name}</div>
                  )}
                  {tc?.rfc && <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>RFC: {tc.rfc}</div>}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 18, fontWeight: 900, color: '#1e3a5f', letterSpacing: '0.02em' }}>PLAN DE PAGO</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                  Estado: <strong style={{ color: plan.status === 'accepted' ? '#0d7c6e' : plan.status === 'cancelled' ? '#64748b' : '#d97706' }}>{statusLabel}</strong>
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                  {currency} · {new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })}
                </div>
              </div>
            </div>

            {/* ── Datos de la unidad ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
              <InfoCell label="Unidad" value={`${unitCode}  ${unitName !== '—' ? unitName : ''}`} />
              <InfoCell label="Responsable" value={responsible} />
              <InfoCell label="Frecuencia de pago" value={`${freqLabel} · ${plan.num_payments} cuotas`} />
              <InfoCell label="Período inicial" value={plan.start_period ? periodLabel(plan.start_period) : '—'} />
              <InfoCell label="Creado por" value={`${plan.created_by_name || '—'}  ${plan.created_at ? '· ' + fmtDate(plan.created_at) : ''}`} />
              {plan.accepted_by_name && (
                <InfoCell label="Aceptado por" value={`${plan.accepted_by_name}  ${plan.accepted_at ? '· ' + fmtDate(plan.accepted_at) : ''}`} />
              )}
            </div>

            {/* ── Resumen financiero ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14 }}>
              <SummaryCard label="Adeudo base" value={fmt(parseFloat(plan.total_adeudo || 0))} color="#e84040" />
              <SummaryCard
                label={plan.apply_interest ? `Total con interés (${plan.interest_rate}%)` : 'Total del plan'}
                value={fmt(parseFloat(plan.total_with_interest || 0))}
                color="#1e3a5f"
              />
              <SummaryCard label="Pagado hasta hoy" value={fmt(totalPaid)} color="#0d7c6e" />
            </div>

            {/* ── Tabla de cuotas ── */}
            {installments.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', color: '#64748b', textTransform: 'uppercase', marginBottom: 6 }}>
                  Tabla de Cuotas
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#1e3a5f', color: '#fff' }}>
                        <th style={th()}>#</th>
                        <th style={th()}>Período</th>
                        <th style={th({ textAlign: 'right' })}>Cuota Adeudo</th>
                        <th style={th({ textAlign: 'right' })}>Cuota Regular</th>
                        <th style={th({ textAlign: 'right' })}>Total Cuota</th>
                        <th style={th({ textAlign: 'right' })}>Pagado</th>
                        <th style={th({ textAlign: 'right' })}>Saldo</th>
                        <th style={th({ textAlign: 'center' })}>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {installments.map((inst, i) => {
                        const paid   = parseFloat(inst.paid_amount || 0);
                        const total  = parseFloat(inst.total || 0);
                        const saldo  = Math.max(0, total - paid);
                        const color  = INSTALL_STATUS_COLORS[inst.status] || '#64748b';
                        const odd    = i % 2 === 0;
                        return (
                          <tr key={inst.period_key || i} style={{ background: odd ? '#f8f7f5' : '#fff' }}>
                            <td style={td({ color: '#94a3b8' })}>{i + 1}</td>
                            <td style={td({ fontWeight: 600 })}>{inst.period_label || periodLabel(inst.period_key)}</td>
                            <td style={td({ textAlign: 'right', color: '#e84040' })}>{fmt(inst.debt_part)}</td>
                            <td style={td({ textAlign: 'right', color: '#64748b' })}>{fmt(inst.regular_part)}</td>
                            <td style={td({ textAlign: 'right', fontWeight: 700, color: '#1e3a5f' })}>{fmt(inst.total)}</td>
                            <td style={td({ textAlign: 'right', color: '#0d7c6e', fontWeight: 600 })}>{paid > 0 ? fmt(paid) : '—'}</td>
                            <td style={td({ textAlign: 'right', color: saldo > 0.01 ? '#e84040' : '#0d7c6e', fontWeight: 600 })}>
                              {saldo > 0.01 ? fmt(saldo) : '✓'}
                            </td>
                            <td style={td({ textAlign: 'center' })}>
                              <span style={{ fontSize: 10, fontWeight: 700, color, background: color + '18', padding: '2px 7px', borderRadius: 10 }}>
                                {INSTALL_STATUS_LABELS[inst.status] || inst.status}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: '#e8f4f1', fontWeight: 800, fontSize: 12 }}>
                        <td colSpan={2} style={td({ fontWeight: 800, color: '#1e3a5f' })}>TOTALES</td>
                        <td style={td({ textAlign: 'right', color: '#e84040' })}>{fmt(totalDebt)}</td>
                        <td style={td({ textAlign: 'right', color: '#64748b' })}>{fmt(totalReg)}</td>
                        <td style={td({ textAlign: 'right', fontWeight: 800, color: '#1e3a5f' })}>{fmt(totalAll)}</td>
                        <td style={td({ textAlign: 'right', color: '#0d7c6e' })}>{fmt(totalPaid)}</td>
                        <td style={td({ textAlign: 'right', color: (totalAll - totalPaid) > 0.01 ? '#e84040' : '#0d7c6e' })}>
                          {(totalAll - totalPaid) > 0.01 ? fmt(totalAll - totalPaid) : '✓'}
                        </td>
                        <td style={td()} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* ── Notas ── */}
            {plan.notes && (
              <div style={{ borderTop: '1px dashed var(--sand-200)', paddingTop: 10, fontSize: 12, color: '#64748b' }}>
                <strong style={{ color: '#1e3a5f' }}>Notas:</strong> {plan.notes}
              </div>
            )}

            {/* ── Pie de página ── */}
            <div style={{ borderTop: '1px solid var(--sand-200)', marginTop: 14, paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#94a3b8' }}>
              <span>Plan de Pago de Adeudos · {tc?.razon_social || tc?.name || ''}</span>
              <span>Generado: {new Date().toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}</span>
            </div>

          </div>{/* /plan-print-area */}
        </div>{/* /modal-body */}

        {/* ── Footer de acciones ── */}
        <div className="modal-foot" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button className="btn btn-secondary" onClick={onClose}>Cerrar</button>
          <button className="btn btn-primary" onClick={handlePrint} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <Printer size={14} /> Imprimir / PDF
          </button>
        </div>

      </div>
    </div>
  );
}

// ── Helper sub-components ─────────────────────────────────────────────────────

function InfoCell({ label, value }) {
  return (
    <div style={{ background: 'var(--sand-50)', border: '1px solid var(--sand-200)', borderRadius: 7, padding: '7px 11px' }}>
      <div style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#1a1a2e' }}>{value || '—'}</div>
    </div>
  );
}

function SummaryCard({ label, value, color }) {
  return (
    <div style={{ border: `1.5px solid ${color}22`, borderRadius: 9, padding: '10px 14px', textAlign: 'center', background: color + '08' }}>
      <div style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 900, color }}>{value}</div>
    </div>
  );
}

function th(extra = {}) {
  return { padding: '7px 10px', textAlign: 'left', fontWeight: 700, fontSize: 11, letterSpacing: '0.03em', ...extra };
}
function td(extra = {}) {
  return { padding: '6px 10px', borderBottom: '1px solid #f0ede7', ...extra };
}
