/**
 * PaymentReceiptModal — shared receipt viewer used in Cobranza and EstadoCuenta.
 *
 * Props:
 *   pay           – Payment object (field_payments, adeudo_payments, additional_payments, …)
 *   unit          – Unit object
 *   tc            – Tenant config object (razon_social, name, logo, maintenance_fee, currency, …)
 *   extraFields   – Array of ExtraField objects
 *   reservations  – Array of approved reservations for this payment (default [])
 *   onClose       – () => void
 */
import React, { useState } from 'react';
import { AlertCircle, Calendar, FileText, Mail, Printer, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { paymentsAPI } from '../api/client';
import { PAYMENT_TYPES, ROLES, APP_VERSION, CURRENCIES, periodLabel } from '../utils/helpers';
import SendEmailModal from './SendEmailModal';

// ── Helpers ──────────────────────────────────────────────────────────────────

function receiptFmt(n, currency = 'MXN') {
  const c = CURRENCIES[currency] || CURRENCIES.MXN;
  return c.symbol + (parseFloat(n) || 0).toLocaleString('es-MX');
}

function receiptStatusBadge(status) {
  const map = {
    pagado: { cls: 'badge-teal', si: 'si-pagado', label: 'Pagado' },
    exento: { cls: 'badge-teal', si: 'si-pagado', label: 'Exento' },
    parcial: { cls: 'badge-amber', si: 'si-parcial', label: 'Parcial' },
    pendiente: { cls: 'badge-gray', si: 'si-pendiente', label: 'Pendiente' },
    pagado_posteriormente: { cls: 'badge-blue', si: 'si-pagado-posteriormente', label: 'Pagado posteriormente' },
  };
  const s = map[status] || map.pendiente;
  return (
    <span className={`badge ${s.cls}`}>
      <span className={`status-indicator ${s.si}`} /> {s.label}
    </span>
  );
}

function getEffectiveFieldTotals(pay) {
  const tot = {};
  (pay?.field_payments || []).forEach(f => {
    tot[f.field_key] = (tot[f.field_key] || 0) + parseFloat(f.received || 0);
  });
  (pay?.additional_payments || []).forEach(ap => {
    const fp = ap.field_payments || ap.fieldPayments || {};
    Object.entries(fp).forEach(([fk, fd]) => {
      const v = typeof fd === 'object' ? (fd.received ?? fd) : fd;
      tot[fk] = (tot[fk] || 0) + parseFloat(v || 0);
    });
  });
  return tot;
}

// ── Evidence popup ────────────────────────────────────────────────────────────

function EvidencePopup({ ev, onClose }) {
  const { b64, mime, fileName } = ev;
  const isPdf = mime === 'application/pdf' || b64.startsWith('JVBER') || /\.pdf$/i.test(fileName || '');
  const isImage = (mime && mime.startsWith('image/'))
    || b64.startsWith('iVBOR')
    || b64.startsWith('/9j/')
    || b64.startsWith('R0lGO')
    || b64.startsWith('UklGR');
  const effectiveMime = isPdf ? 'application/pdf'
    : mime && mime !== 'application/octet-stream' ? mime
    : b64.startsWith('iVBOR') ? 'image/png'
    : b64.startsWith('/9j/')  ? 'image/jpeg'
    : b64.startsWith('R0lGO') ? 'image/gif'
    : b64.startsWith('UklGR') ? 'image/webp'
    : 'application/octet-stream';
  return (
    <div className="modal-bg open" style={{ zIndex: 9999 }} onClick={onClose}>
      <div className="modal lg" onClick={e => e.stopPropagation()} style={{ maxWidth: 820, width: '92vw' }}>
        <div className="modal-head">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FileText size={16} /> {fileName || 'Evidencia de Pago'}
          </h3>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body" style={{ padding: 16 }}>
          {isPdf ? (
            <div style={{ height: '72vh', border: '1px solid var(--sand-200)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
              <iframe src={`data:application/pdf;base64,${b64}`} style={{ width: '100%', height: '100%', border: 'none' }} title="Evidencia PDF" />
            </div>
          ) : isImage ? (
            <div style={{ textAlign: 'center', background: 'var(--sand-50)', borderRadius: 'var(--radius-md)', padding: 8, maxHeight: '72vh', overflow: 'auto' }}>
              <img src={`data:${effectiveMime};base64,${b64}`} alt="Evidencia" style={{ maxWidth: '100%', borderRadius: 'var(--radius-sm)', display: 'inline-block' }} />
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: 48 }}>
              <FileText size={52} style={{ color: 'var(--ink-300)', marginBottom: 16 }} />
              <p style={{ color: 'var(--ink-500)', marginBottom: 20 }}>Vista previa no disponible para este tipo de archivo.</p>
              <a href={`data:${effectiveMime};base64,${b64}`} download={fileName || 'evidencia'} className="btn btn-primary">
                Descargar archivo
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PaymentReceiptModal({ pay, unit, tc, extraFields = [], reservations = [], onClose }) {
  const { tenantId, user } = useAuth();
  const [evidencePopup, setEvidencePopup] = useState(null);
  const [sendingReceipt, setSendingReceipt] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);

  // ── Computed receipt values ──
  const isReceiptExempt = !!unit?.admin_exempt;
  const maintCharge = isReceiptExempt ? 0 : (parseFloat(tc?.maintenance_fee) || 0);
  const reqEFs = extraFields.filter(ef => ef.required);
  const optEFs = extraFields.filter(ef => !ef.required);
  const effTotals = getEffectiveFieldTotals(pay);

  const fp = {};
  (pay?.field_payments || []).forEach(f => { fp[f.field_key] = f; });

  const maintAbono = Math.min(effTotals.maintenance || 0, maintCharge);
  let totReqCharge = maintCharge, totReqAbono = maintAbono;
  reqEFs.forEach(ef => {
    const ch = parseFloat(ef.default_amount) || 0;
    const ab = Math.min(effTotals[ef.id] || 0, ch);
    totReqCharge += ch; totReqAbono += ab;
  });
  let totOptAbono = 0;
  optEFs.forEach(ef => { totOptAbono += effTotals[ef.id] || 0; });
  const totSaldo = Math.max(0, totReqCharge - totReqAbono);

  let totalAdelanto = 0;
  const adelantoRows = [];
  Object.entries(fp).forEach(([fieldId, fd]) => {
    if (fd?.adelanto_targets && typeof fd.adelanto_targets === 'object') {
      Object.entries(fd.adelanto_targets).forEach(([tp, amt]) => {
        const a = parseFloat(amt) || 0;
        if (a > 0) {
          const fLabel = fieldId === 'maintenance' ? 'Mantenimiento' : (extraFields.find(e => e.id === fieldId) || {}).label || fieldId;
          adelantoRows.push({ fieldLabel: fLabel, targetPeriod: tp, amount: a });
          totalAdelanto += a;
        }
      });
    }
  });

  let totalAdeudo = 0;
  const adeudoRows = [];
  Object.entries(pay?.adeudo_payments || {}).forEach(([targetPeriod, fieldMap]) => {
    Object.entries(fieldMap || {}).forEach(([fieldId, amt]) => {
      const a = parseFloat(amt) || 0;
      if (a > 0) {
        const fLabel = fieldId === 'maintenance' ? 'Mantenimiento' : fieldId === 'prevDebt' ? 'Deuda Anterior' : (extraFields.find(e => e.id === fieldId) || {}).label || fieldId;
        adeudoRows.push({ fieldLabel: fLabel, targetPeriod, amount: a });
        totalAdeudo += a;
      }
    });
  });
  const adeudoRowsPrev = adeudoRows.filter(r => r.targetPeriod === '__prevDebt');
  const adeudoRowsPeriods = adeudoRows.filter(r => r.targetPeriod !== '__prevDebt');

  const totalReservations = reservations.reduce((s, r) => s + (parseFloat(r.charge_amount) || 0), 0);
  const grandTotal = totReqAbono + totOptAbono + totalAdelanto + totalAdeudo + totalReservations;

  const ptLabel = pay?.payment_type ? (PAYMENT_TYPES[pay.payment_type]?.label || pay.payment_type) : 'No especificado';
  const pdLabel = pay?.payment_date
    ? new Date(pay.payment_date + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })
    : 'No registrada';
  const condominioName = tc?.razon_social || tc?.name || '';
  const roleLabel = user ? (ROLES[user.role]?.label || user.role) : '';
  const rfmt = (n) => receiptFmt(n, tc?.currency || 'MXN');

  // ── Print ──
  // Imprime en una ventana nueva aislada para evitar conflictos CSS del modal
  // (visibility/overflow/position:fixed rompen el print preview en Chromium)
  const handlePrint = () => {
    const folioNum = pay?.folio || pay?.id?.slice(0, 8)?.toUpperCase() || 'SN';
    const tenantName = (tc?.name || '').replace(/[^a-zA-Z0-9À-ÿ\s]/g, '').trim();
    const unitCode = (unit?.unit_id_code || '').replace(/[^a-zA-Z0-9]/g, '');
    const periodo = pay?.period || '';
    const printTitle = `Recibo de pago No. ${folioNum} ${tenantName} ${unitCode} ${periodo}`;

    const el = document.getElementById('receipt-print-area');
    if (!el) return;

    // Recolectar todas las reglas CSS del documento (variables, clases de recibo, badges, etc.)
    let css = '';
    Array.from(document.styleSheets).forEach(sheet => {
      try {
        Array.from(sheet.cssRules || []).forEach(rule => { css += rule.cssText + '\n'; });
      } catch (_) { /* cross-origin, ignorar */ }
    });

    const win = window.open('', '_blank');
    if (!win) return; // popup bloqueado

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${printTitle}</title>
  <style>
    ${css}
    body { margin: 0; padding: 0; background: white; }
    .receipt-container {
      border: none !important;
      max-width: 100% !important;
      padding: 12mm 14mm !important;
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

    // Imprimir una vez cargado (recursos ya están como data-URLs; fallback a readyState)
    const doPrint = () => { win.focus(); win.print(); win.close(); };
    if (win.document.readyState === 'complete') {
      doPrint();
    } else {
      win.addEventListener('load', doPrint);
    }
  };

  return (
    <>
      <div className="modal-bg open" onClick={onClose}>
        <div className="modal lg" onClick={e => e.stopPropagation()} style={{ maxWidth: 680 }}>
          <div className="modal-head">
            <h3><FileText size={18} style={{ display: 'inline', verticalAlign: -4, marginRight: 8 }} />Recibo de Pago — {periodLabel(pay.period)}</h3>
            <button className="modal-close" onClick={onClose}><X size={16} /></button>
          </div>
          <div className="modal-body">
            <div className="receipt-container" id="receipt-print-area">
              <div className="receipt-header">
                {tc?.logo && <img src={tc.logo.startsWith('data:') ? tc.logo : `data:image/png;base64,${tc.logo}`} className="receipt-logo" alt="" />}
                <div className="receipt-header-info">
                  <div className="receipt-condominio">{condominioName}</div>
                  {tc?.rfc && <div className="receipt-sub">RFC: {tc.rfc}</div>}
                  {(tc?.info_calle || tc?.info_ciudad) && <div className="receipt-sub">{[tc.info_calle, tc.info_ciudad].filter(Boolean).join(', ')}</div>}
                </div>
                <div className="receipt-folio-block">
                  <div className="receipt-folio-label">RECIBO DE PAGO</div>
                  {pay?.folio && <div className="receipt-folio-num">{pay.folio}</div>}
                  <div className="receipt-folio-date">{pdLabel}</div>
                </div>
              </div>
              <div style={{ height: 2, background: 'linear-gradient(to right, var(--teal-400), var(--teal-100))', margin: '0 0 16px' }} />
              <div className="receipt-info-grid">
                <div className="receipt-info-row"><span className="receipt-info-label">Unidad</span><span className="receipt-info-val">{unit?.unit_id_code} — {unit?.unit_name}</span></div>
                <div className="receipt-info-row"><span className="receipt-info-label">Responsable</span><span className="receipt-info-val">{pay?.responsible || unit?.responsible_name || '—'}</span></div>
                <div className="receipt-info-row"><span className="receipt-info-label">Período</span><span className="receipt-info-val">{periodLabel(pay.period)}</span></div>
                <div className="receipt-info-row"><span className="receipt-info-label">Forma de Pago</span><span className="receipt-info-val">{ptLabel}</span></div>
              </div>
              <table className="receipt-table">
                <thead><tr><th>Concepto</th><th style={{ textAlign: 'right' }}>Cargo</th><th style={{ textAlign: 'right' }}>Abono</th><th style={{ textAlign: 'right' }}>Saldo</th></tr></thead>
                <tbody>
                  <tr className="receipt-section-header"><td colSpan={4}>● CAMPOS OBLIGATORIOS</td></tr>
                  <tr>
                    <td>Mantenimiento<br /><small>Cuota base del condominio</small></td>
                    <td style={{ textAlign: 'right' }}>{rfmt(maintCharge)}</td>
                    <td style={{ textAlign: 'right', color: 'var(--teal-600)', fontWeight: 700 }}>{rfmt(maintAbono)}</td>
                    <td style={{ textAlign: 'right', color: (maintCharge - maintAbono) > 0 ? 'var(--coral-500)' : 'var(--teal-600)' }}>{rfmt(maintCharge - maintAbono)}</td>
                  </tr>
                  {reqEFs.map(ef => {
                    const ch = parseFloat(ef.default_amount) || 0;
                    const ab = Math.min(effTotals[ef.id] || 0, ch);
                    const sd = ch - ab;
                    return (
                      <tr key={ef.id}>
                        <td>{ef.label}<br /><small>Obligatorio</small></td>
                        <td style={{ textAlign: 'right' }}>{rfmt(ch)}</td>
                        <td style={{ textAlign: 'right', color: 'var(--teal-600)', fontWeight: 700 }}>{rfmt(ab)}</td>
                        <td style={{ textAlign: 'right', color: sd > 0 ? 'var(--coral-500)' : 'var(--teal-600)' }}>{rfmt(sd)}</td>
                      </tr>
                    );
                  })}
                  {optEFs.filter(ef => (effTotals[ef.id] || 0) > 0).length > 0 && (
                    <>
                      <tr className="receipt-section-header"><td colSpan={4}>○ CAMPOS OPCIONALES</td></tr>
                      {optEFs.filter(ef => (effTotals[ef.id] || 0) > 0).map(ef => (
                        <tr key={ef.id}>
                          <td>{ef.label}<br /><small>Opcional</small></td>
                          <td style={{ textAlign: 'right', color: 'var(--ink-300)' }}>—</td>
                          <td style={{ textAlign: 'right', color: 'var(--teal-600)', fontWeight: 700 }}>{rfmt(effTotals[ef.id] || 0)}</td>
                          <td style={{ textAlign: 'right', color: 'var(--ink-300)' }}>—</td>
                        </tr>
                      ))}
                    </>
                  )}
                  {adelantoRows.length > 0 && (
                    <>
                      <tr className="receipt-section-header"><td colSpan={4} style={{ color: 'var(--blue-700)', background: 'var(--blue-50)' }}>▸ PAGOS ADELANTADOS</td></tr>
                      {adelantoRows.map((ar, i) => (
                        <tr key={i}>
                          <td>{ar.fieldLabel}<br /><small style={{ color: 'var(--blue-600)' }}>Adelanto → {periodLabel(ar.targetPeriod)}</small></td>
                          <td style={{ textAlign: 'right', color: 'var(--ink-300)' }}>—</td>
                          <td style={{ textAlign: 'right', color: 'var(--blue-600)', fontWeight: 700 }}>{rfmt(ar.amount)}</td>
                          <td style={{ textAlign: 'right', color: 'var(--ink-300)' }}>—</td>
                        </tr>
                      ))}
                    </>
                  )}
                  {adeudoRowsPrev.length > 0 && (
                    <>
                      <tr className="receipt-section-header">
                        <td colSpan={4} style={{ color: 'var(--coral-700)', background: 'var(--coral-100)', fontWeight: 800 }}>◂ ABONO A DEUDA ANTERIOR</td>
                      </tr>
                      {adeudoRowsPrev.map((ar, i) => (
                        <tr key={`prev-${i}`}>
                          <td>{ar.fieldLabel}<br /><small style={{ color: 'var(--coral-600)' }}>Abono a saldo de deuda acumulada previa</small></td>
                          <td style={{ textAlign: 'right', color: 'var(--ink-300)' }}>—</td>
                          <td style={{ textAlign: 'right', color: 'var(--coral-600)', fontWeight: 700 }}>{rfmt(ar.amount)}</td>
                          <td style={{ textAlign: 'right', color: 'var(--ink-300)' }}>—</td>
                        </tr>
                      ))}
                    </>
                  )}
                  {adeudoRowsPeriods.length > 0 && (
                    <>
                      <tr className="receipt-section-header">
                        <td colSpan={4} style={{ color: 'var(--amber-700)', background: 'var(--amber-50)', fontWeight: 800 }}>◂ ABONO A PERÍODO ANTERIOR NO PAGADO</td>
                      </tr>
                      {adeudoRowsPeriods.map((ar, i) => (
                        <tr key={`period-${i}`}>
                          <td>{ar.fieldLabel}<br /><small style={{ color: 'var(--amber-700)' }}>Período sin pago aplicado: {periodLabel(ar.targetPeriod)}</small></td>
                          <td style={{ textAlign: 'right', color: 'var(--ink-300)' }}>—</td>
                          <td style={{ textAlign: 'right', color: 'var(--amber-600)', fontWeight: 700 }}>{rfmt(ar.amount)}</td>
                          <td style={{ textAlign: 'right', color: 'var(--ink-300)' }}>—</td>
                        </tr>
                      ))}
                    </>
                  )}
                  {(() => {
                    const addlPays = pay?.additional_payments || [];
                    if (addlPays.length === 0) return null;
                    const rows = [];
                    addlPays.forEach((ap, apIdx) => {
                      const fpAP = ap.field_payments || ap.fieldPayments || {};
                      const apPtLabel = ap.payment_type ? (PAYMENT_TYPES[ap.payment_type]?.label || ap.payment_type) : '';
                      const apPdLabel = ap.payment_date ? new Date(ap.payment_date + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
                      Object.entries(fpAP).forEach(([fid, fd2]) => {
                        const aAmt = parseFloat((fd2 && fd2.received) ?? fd2 ?? 0) || 0;
                        if (aAmt <= 0) return;
                        const fLabel = fid === 'maintenance' ? 'Mantenimiento' : fid === 'prevDebt' ? 'Recaudo de adeudos' : (extraFields.find(e => e.id === fid) || {}).label || fid;
                        const sublabel = ['Pago #' + (apIdx + 2), apPtLabel, apPdLabel].filter(Boolean).join(' · ') + (ap.bank_reconciled ? ' 🏦' : '');
                        rows.push({ fLabel, sublabel, amount: aAmt });
                      });
                      if (ap.notes) rows.push({ isNote: true, notes: ap.notes });
                    });
                    if (rows.filter(r => !r.isNote).length === 0) return null;
                    return (
                      <>
                        <tr className="receipt-section-header"><td colSpan={4} style={{ color: 'var(--blue-700)', background: 'var(--blue-50)' }}>+ PAGOS ADICIONALES ({addlPays.length})</td></tr>
                        {rows.map((r, i) => (
                          r.isNote ? (
                            <tr key={i}><td colSpan={4} style={{ fontSize: 11, color: 'var(--ink-400)', padding: '2px 12px 8px' }}><AlertCircle size={11} style={{ display: 'inline', verticalAlign: -2, marginRight: 4 }} />{r.notes}</td></tr>
                          ) : (
                            <tr key={i}>
                              <td>{r.fLabel}<br /><small style={{ color: 'var(--blue-600)' }}>{r.sublabel}</small></td>
                              <td style={{ textAlign: 'right', color: 'var(--ink-300)' }}>—</td>
                              <td style={{ textAlign: 'right', color: 'var(--blue-600)', fontWeight: 700 }}>{rfmt(r.amount)}</td>
                              <td style={{ textAlign: 'right', color: 'var(--ink-300)' }}>—</td>
                            </tr>
                          )
                        ))}
                      </>
                    );
                  })()}
                  {reservations.length > 0 && (
                    <>
                      <tr className="receipt-section-header">
                        <td colSpan={4} style={{ color: 'var(--teal-700)', background: 'var(--teal-50)' }}>📅 RESERVAS DE ÁREAS COMUNES ({reservations.length})</td>
                      </tr>
                      {reservations.map(r => {
                        const resDate = new Date(r.date + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
                        const horario = `${r.start_time?.slice(0, 5)} – ${r.end_time?.slice(0, 5)}`;
                        return (
                          <tr key={r.id}>
                            <td>{r.area_name}<br /><small style={{ color: 'var(--teal-600)' }}>{resDate} · {horario}</small></td>
                            <td style={{ textAlign: 'right' }}>{rfmt(r.charge_amount)}</td>
                            <td style={{ textAlign: 'right', color: 'var(--teal-600)', fontWeight: 700 }}>{rfmt(r.charge_amount)}</td>
                            <td style={{ textAlign: 'right', color: 'var(--ink-300)' }}>—</td>
                          </tr>
                        );
                      })}
                    </>
                  )}
                </tbody>
                <tfoot>
                  <tr className="receipt-total">
                    <td>TOTAL</td>
                    <td style={{ textAlign: 'right' }}>{rfmt(totReqCharge)}</td>
                    <td style={{ textAlign: 'right', color: 'var(--teal-600)' }}>{rfmt(grandTotal)}</td>
                    <td style={{ textAlign: 'right', color: totSaldo > 0 ? 'var(--coral-500)' : 'var(--teal-600)' }}>{rfmt(totSaldo)}</td>
                  </tr>
                  {totalAdelanto > 0 && <tr><td colSpan={4} style={{ textAlign: 'right', fontSize: 11, color: 'var(--blue-600)', padding: '4px 12px' }}>Incluye {rfmt(totalAdelanto)} en pagos adelantados</td></tr>}
                  {adeudoRowsPrev.length > 0 && <tr><td colSpan={4} style={{ textAlign: 'right', fontSize: 11, color: 'var(--coral-600)', padding: '4px 12px' }}>Incluye {rfmt(adeudoRowsPrev.reduce((s, r) => s + r.amount, 0))} en abono a <strong>deuda anterior</strong></td></tr>}
                  {adeudoRowsPeriods.length > 0 && <tr><td colSpan={4} style={{ textAlign: 'right', fontSize: 11, color: 'var(--amber-700)', padding: '4px 12px' }}>Incluye {rfmt(adeudoRowsPeriods.reduce((s, r) => s + r.amount, 0))} en abono a <strong>período(s) anterior(es) no pagado(s)</strong></td></tr>}
                  {totalReservations > 0 && <tr><td colSpan={4} style={{ textAlign: 'right', fontSize: 11, color: 'var(--teal-600)', padding: '4px 12px' }}>Incluye {rfmt(totalReservations)} en reservas de áreas comunes</td></tr>}
                  {(pay?.additional_payments || []).length > 0 && (() => {
                    let t = 0;
                    (pay.additional_payments || []).forEach(ap => {
                      const fp2 = ap.field_payments || ap.fieldPayments || {};
                      Object.values(fp2).forEach(fd => { t += parseFloat((fd && fd.received) ?? fd ?? 0) || 0; });
                    });
                    return t > 0 ? <tr><td colSpan={4} style={{ textAlign: 'right', fontSize: 11, color: 'var(--blue-600)', padding: '4px 12px' }}>Incluye {rfmt(t)} en pagos adicionales</td></tr> : null;
                  })()}
                </tfoot>
              </table>
              {pay?.notes && <div className="receipt-notes"><AlertCircle size={13} /> <strong>Notas:</strong> {pay.notes}</div>}
              {isReceiptExempt && pay?.payment_type === 'excento' ? (
                <div className="receipt-notes" style={{ background: 'var(--teal-50)', borderColor: 'var(--teal-200)', color: 'var(--teal-700)', marginTop: 10, fontWeight: 600 }}>
                  🛡 Exento por cargo en la mesa directiva
                </div>
              ) : isReceiptExempt ? (
                <div className="receipt-notes" style={{ background: 'var(--teal-50)', borderColor: 'var(--teal-200)', color: 'var(--teal-700)', marginTop: 10 }}>
                  🛡 Unidad Exenta — Sin cargo de mantenimiento base para este período
                </div>
              ) : null}
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
                {receiptStatusBadge(isReceiptExempt ? 'exento' : pay?.status)}
              </div>
              {(pay?.evidence || []).length > 0 && (
                <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
                  {(pay.evidence || []).map((ev, idx) => (
                    <button key={idx} type="button" className="btn btn-secondary btn-sm" style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 5 }}
                      onClick={() => setEvidencePopup({ b64: ev.data, mime: ev.mime || '', fileName: ev.name || `Evidencia ${idx + 1}` })}>
                      <FileText size={12} /> {ev.name || `Evidencia ${idx + 1}`}
                    </button>
                  ))}
                </div>
              )}
              <div style={{ marginTop: 20, paddingTop: 14, borderTop: '1.5px solid var(--sand-100)', display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--ink-400)' }}>
                <div><Calendar size={11} style={{ display: 'inline', verticalAlign: -2, marginRight: 4 }} /> <strong>Fecha de pago:</strong> {pdLabel}</div>
                <div><FileText size={11} style={{ display: 'inline', verticalAlign: -2, marginRight: 4 }} /> <strong>Recibo creado:</strong> {new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
              </div>
              <div style={{ marginTop: 12, textAlign: 'center' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 'var(--radius-full)', fontSize: 12, fontWeight: 700, background: pay?.bank_reconciled ? 'var(--teal-50)' : 'var(--sand-50)', border: `1.5px solid ${pay?.bank_reconciled ? 'var(--teal-200)' : 'var(--sand-200)'}`, color: pay?.bank_reconciled ? 'var(--teal-700)' : 'var(--ink-400)' }}>
                  {pay?.bank_reconciled ? '🏦 ✓ Conciliado en Banco' : '🏦 Sin conciliar'}
                </span>
              </div>
              <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--sand-100)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10, color: 'var(--ink-300)' }}>
                <span>Generado por: {user?.name || ''} ({roleLabel})</span>
                <span>Homly v{APP_VERSION}</span>
                <span>{condominioName} — Recibo — {periodLabel(pay.period)}</span>
              </div>
            </div>
          </div>
          <div className="modal-foot" style={{ flexWrap: 'wrap', gap: 8 }}>
            <button className="btn btn-secondary" onClick={onClose}>Cerrar</button>
<<<<<<< HEAD
            {/* Botón de email — siempre visible; el popup avisa si no hay correos */}
            <button
              className="btn btn-secondary"
              disabled={sendingReceipt}
              onClick={() => setShowEmailModal(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 5 }}
            >
              <Mail size={14} /> {sendingReceipt ? 'Enviando…' : 'Enviar por Email'}
            </button>
=======
            {/* Email send controls */}
            {(unit?.owner_email || unit?.tenant_email) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 'auto' }}>
                {unit?.owner_email && unit?.tenant_email ? (
                  <select
                    value={receiptEmailRecipient}
                    onChange={e => setReceiptEmailRecipient(e.target.value)}
                    style={{ fontSize: 12, padding: '5px 8px', border: '1px solid var(--sand-200)', borderRadius: 6, color: 'var(--ink-700)', background: 'var(--white)' }}
                  >
                    <option value="owner">Propietario</option>
                    <option value="tenant">Inquilino</option>
                    <option value="both">Ambos</option>
                  </select>
                ) : (
                  <span style={{ fontSize: 11, color: 'var(--ink-400)' }}>
                    {unit?.owner_email || unit?.tenant_email}
                  </span>
                )}
                <button
                  className="btn btn-secondary btn-sm"
                  disabled={sendingReceipt}
                  onClick={async () => {
                    if (!pay?.id) return;
                    const recipient = (unit?.owner_email && unit?.tenant_email) ? receiptEmailRecipient : (unit?.owner_email ? 'owner' : 'tenant');
                    setSendingReceipt(true);
                    try {
                      const res = await paymentsAPI.sendReceipt(tenantId, pay.id, { recipients: recipient });
                      toast.success(res.data?.detail || 'Recibo enviado');
                    } catch (err) {
                      toast.error(err?.response?.data?.detail || 'Error al enviar el recibo');
                    } finally {
                      setSendingReceipt(false);
                    }
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: 5 }}
                >
                  <Mail size={13} /> {sendingReceipt ? 'Enviando…' : 'Enviar por Email'}
                </button>
              </div>
            )}
>>>>>>> 26f66ee (“update”)
            <button className="btn btn-primary" onClick={handlePrint} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <Printer size={14} /> Imprimir / PDF
            </button>
          </div>
        </div>
      </div>

      {/* Evidence viewer */}
      {evidencePopup && <EvidencePopup ev={evidencePopup} onClose={() => setEvidencePopup(null)} />}

      {/* Popup de selección de destinatarios de email */}
      {showEmailModal && (
        <SendEmailModal
          unit={unit}
          title="Enviar Recibo de Pago"
          isSending={sendingReceipt}
          onClose={() => setShowEmailModal(false)}
          onSend={async (emails) => {
            if (!pay?.id) return;
            setSendingReceipt(true);
            try {
              const res = await paymentsAPI.sendReceipt(tenantId, pay.id, { emails });
              toast.success(res.data?.detail || 'Recibo enviado');
              setShowEmailModal(false);
            } catch (err) {
              toast.error(err?.response?.data?.detail || 'Error al enviar el recibo');
            } finally {
              setSendingReceipt(false);
            }
          }}
        />
      )}
    </>
  );
}
