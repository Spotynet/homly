/**
 * Modal de análisis financiero ejecutivo del estado de cuenta de una unidad.
 * Permite imprimir y enviar por correo a los contactos de la unidad.
 */
import React, { useMemo, useState } from 'react';
import { BarChart3, Mail, Printer, X, AlertCircle, CheckCircle2, TrendingUp, Landmark } from 'lucide-react';
import toast from 'react-hot-toast';
import SendEmailModal from './SendEmailModal';
import { reportsAPI } from '../api/client';
import { periodLabel } from '../utils/helpers';
import { buildUnitAnalysis } from '../utils/unitAnalysis';

function fmt(n, currency = 'MXN') {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(n ?? 0);
}

const SITUATION = {
  al_corriente: { label: 'Al corriente', color: 'var(--teal-700)', bg: 'var(--teal-50)', border: 'var(--teal-200)' },
  a_favor:      { label: 'Saldo a favor', color: 'var(--teal-700)', bg: 'var(--teal-50)', border: 'var(--teal-200)' },
  moroso:       { label: 'Con adeudo', color: 'var(--coral-700)', bg: 'var(--coral-50)', border: 'var(--coral-200)' },
};

export default function UnitStatementAnalysisModal({
  data,
  fromPeriod,
  toPeriod,
  tenantData,
  tenantId,
  isResidente,
  userEmail,
  onClose,
}) {
  const analysis = useMemo(
    () => buildUnitAnalysis(data, { fromPeriod, toPeriod }),
    [data, fromPeriod, toPeriod],
  );
  const [showEmail, setShowEmail] = useState(false);
  const [sending, setSending] = useState(false);
  const cur = tenantData?.currency || data?.currency || 'MXN';
  const sit = SITUATION[analysis.situation] || SITUATION.al_corriente;
  const unit = analysis.unit || {};
  const range = `${fromPeriod ? periodLabel(fromPeriod) : '—'} — ${toPeriod ? periodLabel(toPeriod) : '—'}`;
  const hasEmails = !!(unit.owner_email || unit.coowner_email || unit.tenant_email);

  const handlePrint = () => {
    const prev = document.title;
    const code = (unit.unit_id_code || 'unidad').replace(/\s+/g, '_');
    document.title = `Analisis_Ejecutivo_${code}_${toPeriod || ''}_${tenantData?.name || ''}`;
    document.body.classList.add('printing-analysis');
    window.print();
    setTimeout(() => {
      document.title = prev;
      document.body.classList.remove('printing-analysis');
    }, 1500);
  };

  const sendEmails = async (emails) => {
    setSending(true);
    try {
      const res = await reportsAPI.sendUnitAnalysisEmail(tenantId, {
        unit_id: unit.id,
        from_period: fromPeriod,
        to_period: toPeriod,
        emails,
      });
      toast.success(res.data?.detail || 'Análisis enviado');
      setShowEmail(false);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Error al enviar el correo');
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <div className="modal-bg open" style={{ zIndex: 500 }} onClick={onClose}>
        <div
          className="modal unit-analysis-print"
          onClick={e => e.stopPropagation()}
          style={{ maxWidth: 860, width: '96vw', maxHeight: '92vh' }}
        >
          <div className="modal-head no-print" style={{ alignItems: 'center' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <BarChart3 size={16} /> Análisis ejecutivo
            </h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
              {!isResidente && hasEmails && (
                <button className="btn btn-outline btn-sm" onClick={() => setShowEmail(true)} disabled={sending}>
                  <Mail size={13} /> Enviar por email
                </button>
              )}
              {isResidente && userEmail && (
                <button
                  className="btn btn-outline btn-sm"
                  disabled={sending}
                  onClick={() => sendEmails([userEmail])}
                >
                  <Mail size={13} /> {sending ? 'Enviando…' : 'Enviar a mi correo'}
                </button>
              )}
              <button className="btn btn-outline btn-sm" onClick={handlePrint}>
                <Printer size={13} /> Imprimir
              </button>
              <button className="modal-close" onClick={onClose}><X size={16} /></button>
            </div>
          </div>

          <div className="modal-body" style={{ padding: '20px 22px 24px', overflowY: 'auto' }}>
            <AnalysisBody analysis={analysis} tenantData={tenantData} sit={sit} range={range} fmt={n => fmt(n, cur)} />
          </div>
        </div>
      </div>

      {showEmail && (
        <SendEmailModal
          unit={unit}
          title="Enviar análisis ejecutivo"
          isSending={sending}
          onClose={() => setShowEmail(false)}
          onSend={sendEmails}
        />
      )}
    </>
  );
}

function AnalysisBody({ analysis, tenantData, sit, range, fmt }) {
  const unit = analysis.unit || {};
  const balAbs = Math.abs(analysis.balance);
  const balLabel = analysis.balance > 1 ? 'Adeudo al corte' : analysis.balance < -1 ? 'Saldo a favor' : 'Saldo al corte';

  return (
    <div className="unit-analysis-body">
      {/* Print header */}
      <div className="unit-analysis-print-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 14, paddingBottom: 12, borderBottom: '2px solid #0d7c6e' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#1a1a2e' }}>{tenantData?.razon_social || tenantData?.name}</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Análisis ejecutivo de estado de cuenta</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{unit.unit_name} <span style={{ fontWeight: 400, color: '#64748b' }}>({unit.unit_id_code})</span></div>
            <div style={{ fontSize: 11, color: '#0d7c6e', fontWeight: 600 }}>{range}</div>
          </div>
        </div>
      </div>

      {/* Identity */}
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-400)' }}>Unidad</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink-800)', lineHeight: 1.2 }}>
            {unit.unit_name || '—'}{' '}
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-400)' }}>({unit.unit_id_code})</span>
          </div>
          <div style={{ fontSize: 13, color: 'var(--ink-500)', marginTop: 2 }}>
            {unit.responsible_name || '—'} · {unit.occupancy === 'rentado' ? 'Inquilino' : 'Propietario'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: 2 }}>{range}</div>
        </div>
        <div style={{
          padding: '8px 14px', borderRadius: 999, fontSize: 12, fontWeight: 800,
          color: sit.color, background: sit.bg, border: `1.5px solid ${sit.border}`,
          letterSpacing: '0.04em', textTransform: 'uppercase',
        }}>
          {sit.label}
        </div>
      </div>

      {/* KPI grid */}
      <div className="ua-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10, marginBottom: 16 }}>
        <Kpi label="Cargos del rango" value={fmt(analysis.charges)} />
        <Kpi label="Total abonado" value={fmt(analysis.paid)} accent="var(--teal-700)" />
        <Kpi
          label={balLabel}
          value={`${analysis.balance > 1 ? '−' : analysis.balance < -1 ? '+' : ''}${fmt(balAbs)}`}
          accent={analysis.balance > 1 ? 'var(--coral-600)' : 'var(--teal-700)'}
        />
        <Kpi label="Cumplimiento" value={`${analysis.compliance.toFixed(0)}%`} hint={`${analysis.paidCount}/${analysis.periodsCount} períodos cubiertos`} />
      </div>

      {(analysis.prevDebt > 0.5 || analysis.credit > 0.5) && (
        <div style={{ display: 'grid', gridTemplateColumns: analysis.prevDebt > 0.5 && analysis.credit > 0.5 ? '1fr 1fr' : '1fr', gap: 10, marginBottom: 16 }}>
          {analysis.prevDebt > 0.5 && (
            <Kpi label="Deuda anterior neta" value={fmt(analysis.prevDebt)} accent="var(--coral-600)" hint={analysis.prevDebtPaid > 0 ? `Abonado ${fmt(analysis.prevDebtPaid)}` : 'Saldo previo al sistema'} />
          )}
          {analysis.credit > 0.5 && (
            <Kpi label="Saldo a favor previo" value={fmt(analysis.credit)} accent="var(--teal-700)" />
          )}
        </div>
      )}

      {/* Diagnosis */}
      <section style={{
        padding: '14px 16px', borderRadius: 12, marginBottom: 16,
        background: analysis.situation === 'moroso' ? 'var(--coral-50)' : 'var(--teal-50)',
        border: `1px solid ${analysis.situation === 'moroso' ? 'var(--coral-200)' : 'var(--teal-200)'}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: analysis.situation === 'moroso' ? 'var(--coral-700)' : 'var(--teal-700)' }}>
          {analysis.situation === 'moroso' ? <AlertCircle size={14} /> : <CheckCircle2 size={14} />}
          Diagnóstico
        </div>
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, color: 'var(--ink-700)' }}>{analysis.diagnosis}</p>
      </section>

      {/* Trend + mix */}
      <div className="ua-split" style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 12, marginBottom: 16 }}>
        <section style={{ border: '1px solid var(--sand-200)', borderRadius: 12, padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-400)', marginBottom: 12 }}>
            <TrendingUp size={13} /> Cobertura últimos {analysis.lastSix.length} períodos
          </div>
          {analysis.lastSix.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--ink-400)' }}>Sin períodos en el rango.</div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 92 }}>
              {analysis.lastSix.map(p => (
                <div key={p.period} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%' }}>
                  <div style={{ flex: 1, width: '100%', display: 'flex', alignItems: 'flex-end' }}>
                    <div style={{
                      width: '100%',
                      height: `${Math.max(8, p.coverage)}%`,
                      borderRadius: 5,
                      background: p.coverage >= 99 ? 'var(--teal-500)' : p.coverage >= 50 ? 'var(--amber-400)' : 'var(--coral-400)',
                    }} />
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--ink-400)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {periodLabel(p.period).slice(0, 3)}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--ink-500)' }}>
            Cobertura promedio: <strong>{analysis.lastSixCoverage.toFixed(0)}%</strong>
          </div>
        </section>

        <section style={{ border: '1px solid var(--sand-200)', borderRadius: 12, padding: '14px 16px' }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-400)', marginBottom: 12 }}>Composición</div>
          <MixRow label="Pagados / exentos" value={analysis.paidCount} color="var(--teal-600)" />
          <MixRow label="Parciales" value={analysis.partialCount} color="var(--amber-600)" />
          <MixRow label="Pendientes" value={analysis.pendingCount} color="var(--coral-600)" />
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--sand-100)', fontSize: 12, color: 'var(--ink-500)' }}>
            Cobertura de cargos: <strong>{analysis.coverageOverall.toFixed(0)}%</strong>
          </div>
        </section>
      </div>

      {analysis.hasPlan && analysis.plan && (
        <section style={{
          border: '1px solid var(--teal-200)', background: 'rgba(13,124,110,0.06)',
          borderRadius: 12, padding: '14px 16px', marginBottom: 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--teal-700)', marginBottom: 8 }}>
            <Landmark size={13} />
            {analysis.plan.plan_type === 'settlement' ? 'Liquidación con quita' : 'Plan de pagos activo'}
          </div>
          {analysis.plan.plan_type === 'settlement' ? (
            <div style={{ fontSize: 13, color: 'var(--ink-700)', lineHeight: 1.5 }}>
              Adeudo original {fmt(analysis.plan.total_adeudo)} · Quita −{fmt(analysis.plan.discount_amount)} · A liquidar <strong>{fmt(analysis.plan.settlement_amount || analysis.plan.total_with_interest)}</strong>
            </div>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--ink-700)' }}>
              {(analysis.plan.installments || []).filter(i => i.status === 'paid').length} cuotas pagadas / {(analysis.plan.installments || []).length} totales
            </div>
          )}
        </section>
      )}

      {analysis.overdueItems.length > 0 && (
        <section style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-400)', marginBottom: 8 }}>
            Antigüedad del adeudo
          </div>
          <div className="table-wrap" style={{ overflow: 'auto', maxHeight: 220 }}>
            <table className="ec-table" style={{ fontSize: 12 }}>
              <thead>
                <tr>
                  <th>Período</th>
                  <th style={{ textAlign: 'right' }}>Cargo</th>
                  <th style={{ textAlign: 'right' }}>Abono</th>
                  <th style={{ textAlign: 'right' }}>Faltante</th>
                </tr>
              </thead>
              <tbody>
                {analysis.overdueItems.map(item => (
                  <tr key={item.period}>
                    <td style={{ fontWeight: 600 }}>{periodLabel(item.period)}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(item.charge)}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(item.paidAmt)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--coral-600)' }}>{fmt(item.deficit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section style={{
        padding: '14px 16px', borderRadius: 12,
        background: 'var(--sand-50)', border: '1px solid var(--sand-200)',
      }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-400)', marginBottom: 6 }}>
          Recomendación
        </div>
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, color: 'var(--ink-700)' }}>{analysis.recommendation}</p>
      </section>
    </div>
  );
}

function Kpi({ label, value, accent, hint }) {
  return (
    <div style={{
      padding: '12px 12px 11px', borderRadius: 12,
      border: '1px solid var(--sand-200)', background: 'var(--white)',
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--ink-400)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800, fontFamily: 'var(--font-display)', color: accent || 'var(--ink-800)', lineHeight: 1.2 }}>{value}</div>
      {hint && <div style={{ fontSize: 10, color: 'var(--ink-400)', marginTop: 3 }}>{hint}</div>}
    </div>
  );
}

function MixRow({ label, value, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, fontSize: 13 }}>
      <span style={{ color: 'var(--ink-500)' }}>{label}</span>
      <span style={{ fontWeight: 800, color }}>{value}</span>
    </div>
  );
}
