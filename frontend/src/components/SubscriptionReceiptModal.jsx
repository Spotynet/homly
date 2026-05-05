/**
 * SubscriptionReceiptModal — Recibo de pago de membresía Homly.
 *
 * Props:
 *   payment   – SubscriptionPayment object (amount, currency, period_label,
 *               payment_date, payment_method_label, reference, notes,
 *               recorded_by_name, created_at)
 *   tenant    – Tenant object (name, razon_social, rfc, logo, info_calle, info_ciudad)
 *   sub       – TenantSubscription object (plan_name, amount_per_cycle, currency)
 *   onClose   – () => void
 */
import React from 'react';
import { X, CreditCard, Printer, Calendar } from 'lucide-react';
import { APP_VERSION } from '../utils/helpers.jsx';

// ── Helpers ───────────────────────────────────────────────────────────────────

const CURRENCY_SYMBOLS = { MXN: '$', USD: 'US$', EUR: '€', COP: 'COP$' };

function fmtAmt(amount, currency = 'MXN') {
  const sym = CURRENCY_SYMBOLS[currency] || '$';
  return `${sym}${Number(amount || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
}

function fmtDate(d) {
  if (!d) return '—';
  try {
    return new Date(d + 'T12:00:00').toLocaleDateString('es-MX', {
      day: '2-digit', month: 'long', year: 'numeric',
    });
  } catch { return d; }
}

function fmtDatetime(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('es-MX', {
      day: '2-digit', month: 'long', year: 'numeric',
    });
  } catch { return d; }
}

// ── Row within receipt ────────────────────────────────────────────────────────

function Row({ label, value }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
      padding: '8px 0', borderBottom: '1px solid #F1F0EA',
    }}>
      <span style={{ fontSize: 12, color: '#6B7280', fontWeight: 500 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: '#1F2937', textAlign: 'right', maxWidth: '60%' }}>
        {value || '—'}
      </span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SubscriptionReceiptModal({ payment, tenant, sub, onClose }) {
  if (!payment) return null;

  const receiptNum = String(payment.id).slice(0, 8).toUpperCase();
  const condName   = tenant?.razon_social || tenant?.name || '';
  const logoSrc    = tenant?.logo
    ? (tenant.logo.startsWith('data:') ? tenant.logo : `data:image/png;base64,${tenant.logo}`)
    : null;

  const handlePrint = () => {
    const el = document.getElementById('sub-receipt-print-area');
    if (!el) return;

    let css = '';
    Array.from(document.styleSheets).forEach(sheet => {
      try {
        Array.from(sheet.cssRules || []).forEach(rule => { css += rule.cssText + '\n'; });
      } catch (_) { /* cross-origin */ }
    });

    const win = window.open('', '_blank');
    if (!win) return;

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Recibo de Membresía No. ${receiptNum} — ${condName}</title>
  <style>
    ${css}
    body { margin: 0; padding: 0; background: white; }
    .sub-receipt-wrapper {
      border: none !important;
      max-width: 100% !important;
      padding: 12mm 14mm !important;
      margin: 0 !important;
      border-radius: 0 !important;
      box-shadow: none !important;
    }
    @page { size: letter; margin: 0; }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  </style>
</head>
<body>${el.outerHTML}</body>
</html>`;

    win.document.write(html);
    win.document.close();
    const doPrint = () => { win.focus(); win.print(); win.close(); };
    if (win.document.readyState === 'complete') doPrint();
    else win.addEventListener('load', doPrint);
  };

  return (
    <div className="modal-bg open" onClick={onClose}>
      <div className="modal lg" onClick={e => e.stopPropagation()} style={{ maxWidth: 620 }}>

        {/* ── Header ── */}
        <div className="modal-head">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CreditCard size={18} style={{ display: 'inline', verticalAlign: -4 }} />
            Recibo de Membresía
          </h3>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>

        {/* ── Body ── */}
        <div className="modal-body">
          <div className="sub-receipt-wrapper" id="sub-receipt-print-area" style={{
            border: '1px solid #E5E7EB', borderRadius: 16,
            padding: 28, background: 'white',
          }}>

            {/* Encabezado del recibo */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>

              {/* Logo + datos del condominio */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
                {logoSrc ? (
                  <img src={logoSrc} alt="" style={{
                    width: 52, height: 52, objectFit: 'contain',
                    borderRadius: 10, border: '1px solid #F1F0EA', background: 'white', flexShrink: 0,
                  }} />
                ) : (
                  <div style={{
                    width: 52, height: 52, borderRadius: 10, flexShrink: 0,
                    background: 'var(--teal-50)', border: '1px solid var(--teal-100)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <CreditCard size={24} color="var(--teal-600)" />
                  </div>
                )}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#1F2937', lineHeight: 1.2 }}>
                    {condName}
                  </div>
                  {tenant?.rfc && (
                    <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>RFC: {tenant.rfc}</div>
                  )}
                  {(tenant?.info_calle || tenant?.info_ciudad) && (
                    <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 1 }}>
                      {[tenant.info_calle, tenant.info_ciudad].filter(Boolean).join(', ')}
                    </div>
                  )}
                </div>
              </div>

              {/* Folio */}
              <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                <div style={{
                  fontSize: 10, fontWeight: 800, color: '#9CA3AF',
                  textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4,
                }}>
                  RECIBO DE MEMBRESÍA
                </div>
                <div style={{
                  fontSize: 22, fontWeight: 900, color: 'var(--teal-600)',
                  fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.5px',
                }}>
                  #{receiptNum}
                </div>
                <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>
                  {fmtDate(payment.payment_date)}
                </div>
              </div>
            </div>

            {/* Línea divisora */}
            <div style={{
              height: 2,
              background: 'linear-gradient(to right, var(--teal-400), var(--teal-100))',
              margin: '0 0 18px', borderRadius: 2,
            }} />

            {/* Monto destacado */}
            <div style={{
              background: 'linear-gradient(135deg, var(--teal-600) 0%, var(--teal-500) 100%)',
              borderRadius: 14, padding: '18px 22px', marginBottom: 18,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.75)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Monto pagado
                </div>
                <div style={{ fontSize: 30, fontWeight: 900, color: 'white', marginTop: 2, letterSpacing: '-1px' }}>
                  {fmtAmt(payment.amount, payment.currency)}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>Período cubierto</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: 'white', marginTop: 2 }}>
                  {payment.period_label || '—'}
                </div>
              </div>
            </div>

            {/* Detalles del pago */}
            <div style={{ marginBottom: 16 }}>
              <div style={{
                fontSize: 10, fontWeight: 800, color: '#9CA3AF',
                textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10,
              }}>
                Detalles del pago
              </div>
              <Row label="Plan de membresía"  value={sub?.plan_name || 'Sin plan'}          />
              <Row label="Método de pago"     value={payment.payment_method_label}          />
              <Row label="Referencia / Folio" value={payment.reference || '—'}             />
              <Row label="Fecha de pago"      value={fmtDate(payment.payment_date)}         />
              <Row label="Registrado por"     value={payment.recorded_by_name || 'Sistema'} />
              <Row label="Moneda"             value={payment.currency}                      />
            </div>

            {/* Notas */}
            {payment.notes && (
              <div style={{
                background: '#F9FAFB', border: '1px solid #E5E7EB',
                borderRadius: 10, padding: '10px 14px', marginBottom: 16,
              }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                  Notas
                </div>
                <p style={{ fontSize: 13, color: '#4B5563', margin: 0, lineHeight: 1.5 }}>{payment.notes}</p>
              </div>
            )}

            {/* Sello de pago confirmado */}
            <div style={{ display: 'flex', justifyContent: 'center', margin: '16px 0' }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '7px 20px', borderRadius: 50,
                background: 'var(--teal-50)', border: '1.5px solid var(--teal-200)',
                fontSize: 13, fontWeight: 800, color: 'var(--teal-700)',
              }}>
                ✓ PAGO CONFIRMADO
              </span>
            </div>

            {/* Pie del recibo */}
            <div style={{
              marginTop: 18, paddingTop: 12,
              borderTop: '1px solid #F1F0EA',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              fontSize: 10, color: '#9CA3AF',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Calendar size={10} />
                Emitido: {fmtDatetime(payment.created_at || new Date().toISOString())}
              </div>
              <div style={{ fontWeight: 700, color: 'var(--teal-600)' }}>Homly v{APP_VERSION}</div>
              <div>{condName} — Membresía #{receiptNum}</div>
            </div>

          </div>
        </div>

        {/* ── Footer ── */}
        <div className="modal-foot">
          <button className="btn btn-secondary" onClick={onClose}>Cerrar</button>
          <button className="btn btn-primary" onClick={handlePrint}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Printer size={14} /> Imprimir / PDF
          </button>
        </div>

      </div>
    </div>
  );
}
