/**
 * Overlay del estado de cuenta de una unidad, pensado para abrirse desde Cobranza
 * sin abandonar esa pantalla.
 */
import React, { useEffect, useState } from 'react';
import { BarChart3, ChevronLeft, FileText, X } from 'lucide-react';
import { reportsAPI } from '../api/client';
import { periodLabel, statusClass, statusLabel, todayPeriod } from '../utils/helpers';
import UnitStatementAnalysisModal from './UnitStatementAnalysisModal';

function fmt(n, currency = 'MXN') {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(n ?? 0);
}

export default function UnitStatementOverlay({
  tenantId,
  tenantData,
  unit,
  cutoffPeriod,
  onClose,
}) {
  const start = tenantData?.operation_start_date || tenantData?.created_at?.slice(0, 7) || '';
  const [fromPeriod, setFromPeriod] = useState(start);
  const [toPeriod, setToPeriod] = useState(cutoffPeriod || todayPeriod());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAnalysis, setShowAnalysis] = useState(false);
  const cur = tenantData?.currency || 'MXN';

  useEffect(() => {
    if (!tenantId || !unit?.id) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    const params = { unit_id: unit.id };
    if (fromPeriod) params.from = fromPeriod;
    if (toPeriod) params.to = toPeriod;
    reportsAPI.estadoCuenta(tenantId, params)
      .then(r => { if (!cancelled) setData(r.data); })
      .catch(() => { if (!cancelled) setError('No se pudo cargar el estado de cuenta.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tenantId, unit?.id, fromPeriod, toPeriod]);

  const balance = data ? parseFloat(data.balance) : 0;
  const displayUnit = data?.unit || unit;

  return (
    <>
      <div className="modal-bg open" style={{ zIndex: 450 }} onClick={onClose}>
        <div
          className="modal"
          onClick={e => e.stopPropagation()}
          style={{ maxWidth: 920, width: '96vw', maxHeight: '92vh' }}
        >
          <div className="modal-head" style={{ alignItems: 'center', gap: 10 }}>
            <button className="btn btn-outline btn-sm" onClick={onClose} title="Volver a cobranza">
              <ChevronLeft size={14} /> Cobranza
            </button>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
              <FileText size={16} /> Estado de cuenta
            </h3>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
              {data && (
                <button className="btn btn-primary btn-sm" onClick={() => setShowAnalysis(true)}>
                  <BarChart3 size={13} /> Análisis ejecutivo
                </button>
              )}
              <button className="modal-close" onClick={onClose}><X size={16} /></button>
            </div>
          </div>

          <div className="modal-body" style={{ padding: 0, overflowY: 'auto' }}>
            <div style={{ padding: '14px 18px 12px', background: 'var(--sand-50)', borderBottom: '1px solid var(--sand-100)', display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800 }}>
                  {displayUnit.unit_name}{' '}
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-400)' }}>({displayUnit.unit_id_code})</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink-500)', marginTop: 2 }}>
                  {displayUnit.responsible_name || '—'} · {displayUnit.occupancy === 'rentado' ? 'Inquilino' : 'Propietario'}
                </div>
              </div>
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: 'var(--ink-400)' }}>Desde</span>
                <input type="month" className="period-month-select" value={fromPeriod} min={start || undefined} max={toPeriod} onChange={e => setFromPeriod(e.target.value)} />
                <span style={{ fontSize: 12, color: 'var(--ink-400)' }}>Hasta</span>
                <input type="month" className="period-month-select" value={toPeriod} min={fromPeriod || start || undefined} max={todayPeriod()} onChange={e => setToPeriod(e.target.value)} />
              </div>
            </div>

            {loading && (
              <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--ink-400)', fontSize: 14 }}>Cargando estado de cuenta…</div>
            )}
            {error && !loading && (
              <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--coral-600)', fontSize: 14 }}>{error}</div>
            )}

            {data && !loading && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0, borderBottom: '1px solid var(--sand-100)' }}>
                  <SumCell label="Cargos" value={fmt(data.total_charges, cur)} />
                  <SumCell label="Abonado" value={fmt(data.total_payments, cur)} color="var(--teal-700)" />
                  <SumCell
                    label="Saldo"
                    value={`${balance > 0 ? '−' : balance < 0 ? '+' : ''}${fmt(Math.abs(balance), cur)}`}
                    color={balance > 0 ? 'var(--coral-600)' : 'var(--teal-700)'}
                  />
                </div>
                <div className="table-wrap">
                  <table className="ec-table">
                    <thead>
                      <tr>
                        <th>Período</th>
                        <th style={{ textAlign: 'right' }}>Cargo</th>
                        <th style={{ textAlign: 'right' }}>Abono</th>
                        <th>Estado</th>
                        <th style={{ textAlign: 'right' }}>Saldo acum.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data.periods || []).map(p => {
                        const saldo = parseFloat(p.saldo_accum || 0);
                        return (
                          <tr key={p.period}>
                            <td style={{ fontWeight: 700 }}>{periodLabel(p.period)}</td>
                            <td style={{ textAlign: 'right' }}>{fmt(p.charge, cur)}</td>
                            <td style={{ textAlign: 'right' }}>{parseFloat(p.paid) > 0 ? fmt(p.paid, cur) : '—'}</td>
                            <td><span className={`badge ${statusClass(p.status)}`}>{statusLabel(p.status)}</span></td>
                            <td style={{ textAlign: 'right', fontWeight: 700, color: saldo > 0 ? 'var(--coral-600)' : 'var(--teal-700)' }}>
                              {saldo > 0 ? '−' : saldo < 0 ? '+' : ''}{fmt(Math.abs(saldo), cur)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {showAnalysis && data && (
        <UnitStatementAnalysisModal
          data={data}
          fromPeriod={fromPeriod}
          toPeriod={toPeriod}
          tenantData={tenantData}
          tenantId={tenantId}
          onClose={() => setShowAnalysis(false)}
        />
      )}
    </>
  );
}

function SumCell({ label, value, color }) {
  return (
    <div style={{ padding: '12px 16px', borderRight: '1px solid var(--sand-100)' }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--ink-400)' }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800, fontFamily: 'var(--font-display)', color: color || 'var(--ink-800)', marginTop: 2 }}>{value}</div>
    </div>
  );
}
