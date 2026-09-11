import React, { useMemo, useState } from 'react';
import { X, FileOutput, Printer, Mail, RefreshCw } from 'lucide-react';

export function workspaceCopy(workspaceType) {
  const isRentas = workspaceType === 'rentas';
  return {
    isRentas,
    spaceNoun: isRentas ? 'inmobiliaria' : 'condominio',
    spaceLabel: isRentas ? 'Inmobiliaria' : 'Condominio',
    brandLine: isRentas
      ? 'Sistema de gestión de rentas'
      : 'Sistema de administración de condominios',
    clientLabel: isRentas ? 'Cliente / Inmobiliaria' : 'Cliente / Condominio',
    unitNoun: isRentas ? 'propiedad' : 'unidad',
  };
}

export function billingNoteDueDate(cycle) {
  if (!cycle?.cycleStart) return cycle?.dueDate;
  const d = new Date(cycle.cycleStart + 'T00:00:00');
  d.setDate(d.getDate() + 5);
  return d.toISOString().slice(0, 10);
}

export function buildMembershipBillingNoteHTML({
  cycle, sub, tenantData, planName, tenantAdmin, workspaceType,
}) {
  const ws = workspaceCopy(workspaceType || tenantData?.workspace_type || sub?.tenant_workspace_type);
  const sym = { MXN: '$', USD: 'US$', EUR: '€', COP: 'COP$' };
  const cs  = sym[cycle.currency] || '$';
  const fmtM = (n) => `${cs}${Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })} ${cycle.currency}`;
  const fmtD = (d) => {
    if (!d) return '—';
    try { return new Date(d + 'T00:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }); }
    catch { return d; }
  };
  const tn        = tenantData?.name || '—';
  const rfc       = tenantData?.rfc  || '';
  const addr      = [tenantData?.info_calle, tenantData?.info_num_externo].filter(Boolean).join(' ');
  const city      = [tenantData?.info_colonia, tenantData?.info_ciudad, tenantData?.info_codigo_postal ? `C.P. ${tenantData.info_codigo_postal}` : ''].filter(Boolean).join(', ');
  const adminName  = tenantAdmin?.name  || '';
  const adminEmail = tenantAdmin?.email || '';
  const noteDueDate = billingNoteDueDate(cycle);
  const now     = new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const cycleNo = String(cycle.number).padStart(2, '0');
  const logoUrl = (typeof window !== 'undefined' ? window.location.origin : '') + '/img/homly-full.png';

  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8">
<title>Recibo de Cobro — ${tn} — ${cycle.periodLabel}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:13px;color:#1E293B;background:#fff}
  @page{size:A4;margin:16mm 18mm}
  @media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
  .wrap{max-width:680px;margin:0 auto;padding:32px 28px}
  .header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:18px;border-bottom:3px solid #0D9488;margin-bottom:22px}
  .brand-sub{font-size:11px;color:#64748B;margin-top:2px;line-height:1.4}
  .note-title{font-size:19px;font-weight:800;color:#0F172A;margin-bottom:2px;text-align:right}
  .note-meta{font-size:11px;color:#64748B;text-align:right;line-height:1.5}
  .parties{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:22px}
  .party-box{background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;padding:14px}
  .party-label{font-size:9px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;color:#94A3B8;margin-bottom:5px}
  .party-name{font-size:14px;font-weight:700;color:#0F172A;margin-bottom:3px}
  .party-detail{font-size:11px;color:#64748B;line-height:1.5}
  table{width:100%;border-collapse:collapse;margin-bottom:20px}
  th{background:#F1F5F9;padding:9px 12px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#64748B}
  td{padding:11px 12px;border-bottom:1px solid #F1F5F9;font-size:13px;color:#334155;vertical-align:top}
  .total td{background:#0D9488;color:#fff!important;font-weight:800;font-size:15px;padding:13px 12px;border-bottom:none}
  .info-box{background:#F0FDF4;border:1px solid #BBF7D0;border-radius:10px;padding:14px;margin-bottom:20px}
  .info-title{font-size:11px;font-weight:800;color:#15803D;margin-bottom:5px}
  .info-body{font-size:11px;color:#166534;line-height:1.6}
  .footer{font-size:10px;color:#94A3B8;text-align:center;border-top:1px solid #E2E8F0;padding-top:14px;line-height:1.6}
</style></head>
<body><div class="wrap">
  <div class="header">
    <div>
      <img src="${logoUrl}" alt="Homly" style="height:38px;width:auto;object-fit:contain;display:block;margin-bottom:6px">
      <div class="brand-sub">by Spotynet · ${ws.brandLine}<br>contacto@spotynet.com · www.homly.com.mx</div>
    </div>
    <div>
      <div class="note-title">Recibo de Cobro</div>
      <div class="note-meta">N° ${cycleNo} · ${cycle.periodLabel}<br>Emitida: ${now}</div>
    </div>
  </div>

  <div class="parties">
    <div class="party-box">
      <div class="party-label">Cobrador / Proveedor</div>
      <div class="party-name">Spotynet</div>
      <div class="party-detail">Homly — ${ws.brandLine}<br>contacto@spotynet.com<br>www.homly.com.mx</div>
    </div>
    <div class="party-box">
      <div class="party-label">${ws.clientLabel}</div>
      <div class="party-name">${tn}</div>
      <div class="party-detail">
        ${rfc ? `RFC: ${rfc}<br>` : ''}${addr ? `${addr}<br>` : ''}${city ? `${city}<br>` : ''}
        ${adminName  ? `Contacto: ${adminName}<br>` : ''}
        ${adminEmail ? `${adminEmail}` : ''}
      </div>
    </div>
  </div>

  <table>
    <thead><tr>
      <th style="width:38%">Concepto</th>
      <th>Período</th>
      <th>Inicio</th>
      <th>Vencimiento</th>
      <th style="text-align:right">Importe</th>
    </tr></thead>
    <tbody>
      <tr>
        <td><strong>Membresía Homly</strong><br><span style="font-size:11px;color:#64748B">${planName || sub?.plan_name || '—'}</span></td>
        <td>${cycle.periodLabel}</td>
        <td>${fmtD(cycle.cycleStart)}</td>
        <td><strong>${fmtD(noteDueDate)}</strong></td>
        <td style="text-align:right;font-weight:700">${fmtM(cycle.expectedAmount)}</td>
      </tr>
      <tr class="total">
        <td colspan="4">Total a pagar</td>
        <td style="text-align:right">${fmtM(cycle.expectedAmount)}</td>
      </tr>
    </tbody>
  </table>

  <div class="info-box">
    <div class="info-title">Datos bancarios para transferencia</div>
    <div class="info-body">
      <table style="border-collapse:collapse;width:100%;margin-bottom:8px">
        <tr><td style="padding:3px 0;color:#166534;font-weight:700;width:140px">Banco</td><td style="padding:3px 0;color:#166534">BBVA</td></tr>
        <tr><td style="padding:3px 0;color:#166534;font-weight:700">Titular</td><td style="padding:3px 0;color:#166534">Spotynet S.A. de C.V.</td></tr>
        <tr><td style="padding:3px 0;color:#166534;font-weight:700">No. de Cuenta</td><td style="padding:3px 0;color:#166534;font-family:monospace">0117857578</td></tr>
        <tr><td style="padding:3px 0;color:#166534;font-weight:700">CLABE</td><td style="padding:3px 0;color:#166534;font-family:monospace">012 180 00117857578</td></tr>
        <tr><td style="padding:3px 0;color:#166534;font-weight:700">Referencia</td><td style="padding:3px 0;color:#166534"><strong>${tn} — ${cycle.periodLabel}</strong></td></tr>
      </table>
      Fecha límite de pago: <strong>${fmtD(noteDueDate)}</strong><br>
      Al realizar el pago, regístralo en Mi Membresía para emitir el recibo de pago.
    </div>
  </div>

  <div class="footer">
    Recibo de cobro generado automáticamente por Homly para la ${ws.spaceNoun} <strong>${tn}</strong>.<br>
    ${now} · Homly — ${ws.brandLine} · www.homly.com.mx
  </div>
</div></body></html>`;
}

export default function MembershipBillingNoteModal({
  cycle, sub, tenantData, planName, tenantAdmin, workspaceType, onClose, onSendEmail,
}) {
  const [emailTo, setEmailTo] = useState(tenantAdmin?.email || '');
  const [sending, setSending] = useState(false);
  const ws = workspaceCopy(workspaceType || tenantData?.workspace_type || sub?.tenant_workspace_type);
  const html = useMemo(
    () => buildMembershipBillingNoteHTML({ cycle, sub, tenantData, planName, tenantAdmin, workspaceType: ws.isRentas ? 'rentas' : 'condominio' }),
    [cycle, sub, tenantData, planName, tenantAdmin, ws.isRentas]
  );
  const noteDueDate = billingNoteDueDate(cycle);
  const sym  = { MXN: '$', USD: 'US$', EUR: '€', COP: 'COP$' };
  const cs   = sym[cycle.currency] || '$';
  const fmtM = (n) => `${cs}${Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })} ${cycle.currency}`;
  const fmtD = (d) => {
    if (!d) return '—';
    try { return new Date(d + 'T00:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }); }
    catch { return d; }
  };

  const handlePreview = () => {
    const w = window.open('', '_blank', 'width=820,height=900');
    if (!w) { alert('Permite ventanas emergentes para previsualizar.'); return; }
    w.document.open(); w.document.write(html); w.document.close();
  };

  const handleDownload = () => {
    const w = window.open('', '_blank', 'width=820,height=900');
    if (!w) { alert('Permite ventanas emergentes para descargar.'); return; }
    w.document.open(); w.document.write(html); w.document.close();
    setTimeout(() => w.print(), 600);
  };

  const handleSendEmail = async () => {
    if (!onSendEmail) return;
    if (!emailTo.trim()) return;
    setSending(true);
    try {
      await onSendEmail({
        period_label:  cycle.periodLabel,
        cycle_start:   cycle.cycleStart,
        cycle_end:     cycle.cycleEnd,
        due_date:      noteDueDate,
        amount:        cycle.expectedAmount,
        currency:      cycle.currency,
        cycle_number:  cycle.number,
        to_email:      emailTo.trim(),
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 680, maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.25)' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: '#F0FDF4', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <FileOutput size={18} color="#0D9488" />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 15, color: '#0F172A' }}>Recibo de Cobro</div>
              <div style={{ fontSize: 12, color: '#64748B' }}>N° {String(cycle.number).padStart(2, '0')} · {cycle.periodLabel}</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
            {[
              { label: ws.spaceLabel, value: tenantData?.name || '—' },
              { label: 'Plan', value: planName || sub?.plan_name || '—' },
              { label: 'Período', value: cycle.periodLabel },
              { label: 'Vencimiento pago', value: fmtD(noteDueDate) },
              { label: 'Importe', value: fmtM(cycle.expectedAmount) },
              { label: 'Estatus', value: { paid: '✓ Pagado', current: '⏳ Vigente', grace: '⚠ En gracia', overdue: '✗ Vencido' }[cycle.status] || cycle.status },
            ].map(({ label, value }) => (
              <div key={label} style={{ background: '#F8FAFC', borderRadius: 8, padding: '10px 14px', border: '1px solid #E2E8F0' }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#94A3B8', marginBottom: 3 }}>{label}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>{value}</div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 13, color: '#64748B', lineHeight: 1.55 }}>
            Usa este recibo de cobro para solicitar el pago de la membresía. Cuando el pago se registre, podrás emitir el recibo de pago.
          </p>
        </div>

        <div style={{ padding: '14px 24px 20px', borderTop: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={handlePreview}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: '1.5px solid #E2E8F0', background: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', color: '#334155' }}>
              <FileOutput size={13} /> Vista previa
            </button>
            <button type="button" onClick={handleDownload}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: 'none', background: '#0D9488', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
              <Printer size={13} /> Imprimir / PDF
            </button>
          </div>
          {onSendEmail && (
            <div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={emailTo}
                  onChange={e => setEmailTo(e.target.value)}
                  placeholder="correo@cliente.com"
                  style={{ flex: 1, border: '1.5px solid #E2E8F0', borderRadius: 8, padding: '8px 12px', fontSize: 13, outline: 'none' }}
                />
                <button
                  type="button"
                  onClick={handleSendEmail}
                  disabled={sending || !emailTo.trim()}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, border: 'none', background: sending ? '#94A3B8' : '#0D9488', color: '#fff', fontWeight: 700, fontSize: 13, cursor: sending ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}
                >
                  {sending ? <RefreshCw size={13} className="animate-spin" /> : <Mail size={13} />}
                  {sending ? 'Enviando…' : 'Enviar'}
                </button>
              </div>
              <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 6 }}>
                El recibo de cobro se enviará con los datos del período al correo indicado.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
