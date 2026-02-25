import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { unitsAPI, reportsAPI, tenantsAPI, paymentsAPI, gastosAPI, cajaChicaAPI } from '../api/client';
import { statusClass, statusLabel, fmtDate, periodLabel, todayPeriod, prevPeriod, nextPeriod } from '../utils/helpers';
import { Search, ChevronLeft, ChevronRight, Building, Globe, DollarSign, ArrowDown, TrendingDown, AlertCircle, Calendar, Printer, ShoppingBag } from 'lucide-react';

function fmt(n) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n ?? 0);
}

export default function EstadoCuenta() {
  const { tenantId, isVecino, user } = useAuth();
  const [units, setUnits] = useState([]);
  const [unitSummaries, setUnitSummaries] = useState([]);
  const [selectedUnit, setSelectedUnit] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [view, setView] = useState('units');
  const [generalData, setGeneralData] = useState(null);
  const [genLoading, setGenLoading] = useState(false);
  const [cutoff, setCutoff] = useState(todayPeriod());
  const [tenantData, setTenantData] = useState(null);
  const [detailFrom, setDetailFrom] = useState('');
  const [detailTo, setDetailTo] = useState(todayPeriod());

  // Load units + tenant info
  useEffect(() => {
    if (!tenantId) return;
    unitsAPI.list(tenantId).then(r => {
      const list = r.data.results || r.data;
      setUnits(list);
      if (isVecino && user?.unit_id) {
        setSelectedUnit(user.unit_id);
      }
    });
    tenantsAPI.get(tenantId).then(r => {
      setTenantData(r.data);
      const start = r.data?.operation_start_date || r.data?.created_at?.slice(0, 7) || '';
      if (start) setDetailFrom(start);
    }).catch(() => {});
  }, [tenantId, isVecino, user]);

  const startPeriod = tenantData?.operation_start_date || tenantData?.created_at?.slice(0, 7) || '';

  // When selecting a unit, initialize detailFrom from tenant start
  const handleSelectUnit = useCallback((unitId) => {
    setSelectedUnit(unitId);
    setData(null);
    if (startPeriod) setDetailFrom(startPeriod);
    setDetailTo(cutoff || todayPeriod());
  }, [startPeriod, cutoff]);

  // Load unit summaries via estado-cuenta (without unit_id) for list view
  useEffect(() => {
    if (!tenantId || selectedUnit) return;
    reportsAPI.estadoCuenta(tenantId, { cutoff })
      .then(r => {
        const unitsList = r.data?.units || [];
        setUnitSummaries(unitsList);
      })
      .catch(() => setUnitSummaries([]));
  }, [tenantId, cutoff, selectedUnit]);

  // Load unit detail with from/to params
  useEffect(() => {
    if (!selectedUnit || !tenantId) return;
    setLoading(true);
    const params = { unit_id: selectedUnit };
    if (detailFrom) params.from = detailFrom;
    if (detailTo) params.to = detailTo;
    reportsAPI.estadoCuenta(tenantId, params)
      .then(r => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [selectedUnit, tenantId, detailFrom, detailTo]);

  // Load general / reporte
  useEffect(() => {
    if ((view !== 'tenant' && view !== 'reporte') || !tenantId) return;
    setGenLoading(true);
    reportsAPI.reporteGeneral(tenantId, cutoff).then(r => {
      setGeneralData(r.data);
    }).catch(() => {}).finally(() => setGenLoading(false));
  }, [view, tenantId, cutoff]);

  // Compute totals from unit summaries — handle { unit, total_charge, total_paid, balance } from estado-cuenta API
  const summaryData = useMemo(() => {
    const raw = unitSummaries.length > 0 ? unitSummaries : [];
    const items = raw.map(item => {
      const u = item.unit || item;
      const charge = parseFloat(item.total_charge ?? u.total_charges ?? 0) || 0;
      const paid = parseFloat(item.total_paid ?? u.total_payments ?? 0) || 0;
      const bal = parseFloat(item.balance ?? (charge - paid)) || 0;
      return {
        id: u.id,
        unit_id_code: u.unit_id_code || '',
        unit_name: u.unit_name || '',
        responsible_name: u.responsible_name || `${u.owner_first_name || ''} ${u.owner_last_name || ''}`.trim(),
        occupancy: u.occupancy || 'propietario',
        total_charges: charge,
        total_payments: paid,
        balance: bal,
      };
    });

    // If reporteGeneral returned nothing useful, fallback to units list
    if (items.length === 0 && units.length > 0) {
      return {
        totalCargos: 0, totalAbonos: 0, totalDeuda: 0, conAdeudo: 0,
        items: units.map(u => ({
          id: u.id,
          unit_id_code: u.unit_id_code || '',
          unit_name: u.unit_name || '',
          responsible_name: u.responsible_name || `${u.owner_first_name || ''} ${u.owner_last_name || ''}`.trim(),
          occupancy: u.occupancy || 'propietario',
          total_charges: 0,
          total_payments: 0,
          balance: 0,
        }))
      };
    }

    let totalCargos = 0, totalAbonos = 0, totalDeuda = 0, conAdeudo = 0;
    items.forEach(u => {
      totalCargos += u.total_charges;
      totalAbonos += u.total_payments;
      if (u.balance > 0) { totalDeuda += u.balance; conAdeudo++; }
    });
    return { totalCargos, totalAbonos, totalDeuda, conAdeudo, items };
  }, [unitSummaries, units]);

  const filteredUnits = useMemo(() => {
    const items = summaryData.items || [];
    if (!search) return items;
    const q = search.toLowerCase();
    return items.filter(u =>
      (u.unit_id_code || '').toLowerCase().includes(q) ||
      (u.unit_name || '').toLowerCase().includes(q) ||
      (u.responsible_name || '').toLowerCase().includes(q)
    );
  }, [summaryData.items, search]);

  const showDetail = isVecino ? true : !!selectedUnit;
  const balance = data ? parseFloat(data.balance) : 0;
  const unitPrevDebt = data ? parseFloat(data.previous_debt ?? data.unit?.previous_debt ?? 0) : 0;
  const prevDebtAdeudo = data ? parseFloat(data.prev_debt_adeudo ?? 0) : 0;
  const netPrevDebt = data ? (parseFloat(data.net_prev_debt ?? 0) || Math.max(0, unitPrevDebt - prevDebtAdeudo)) : 0;

  // Find selected unit info from units list (for immediate display before API returns)
  const selectedUnitInfo = useMemo(() => {
    return units.find(u => u.id === selectedUnit);
  }, [units, selectedUnit]);

  return (
    <div className="content-fade">
      {/* ── 3-tab toggle (only when not in detail) ── */}
      {!isVecino && !selectedUnit && (
        <div className="ec-view-toggle">
          <button className={`ec-view-btn ${view === 'units' ? 'active' : ''}`} onClick={() => { setView('units'); setSelectedUnit(null); }}>
            <Building size={14} /> Estado por Unidad
          </button>
          <button className={`ec-view-btn ${view === 'tenant' ? 'active' : ''}`} onClick={() => { setView('tenant'); setSelectedUnit(null); }}>
            <Globe size={14} /> Estado General
          </button>
          <button className={`ec-view-btn ${view === 'reporte' ? 'active' : ''}`} onClick={() => { setView('reporte'); setSelectedUnit(null); }}>
            <DollarSign size={14} /> Reporte General
          </button>
        </div>
      )}

      {/* ════════════════════════ UNIT DETAIL VIEW ════════════════════════ */}
      {showDetail && selectedUnit ? (
        <div>
          {!isVecino && (
            <div className="no-print" style={{ marginBottom: 16 }}>
              <button className="btn btn-outline btn-sm" onClick={() => { setSelectedUnit(null); setData(null); }}>
                <ChevronLeft size={14} /> Volver al listado
              </button>
            </div>
          )}

          <div className="ec-detail">
            {/* Dark header */}
            <div className="ec-detail-header">
              <div>
                <div className="ec-detail-title">
                  {data?.unit?.unit_name || selectedUnitInfo?.unit_name || '…'}{' '}
                  <span style={{ opacity: 0.6, fontSize: 16 }}>({data?.unit?.unit_id_code || selectedUnitInfo?.unit_id_code})</span>
                </div>
                <div className="ec-detail-sub">
                  {data?.unit?.responsible_name || selectedUnitInfo?.responsible_name} · {(data?.unit?.occupancy || selectedUnitInfo?.occupancy) === 'rentado' ? 'Inquilino' : 'Propietario'} · {data?.tenant_name || tenantData?.name || ''}
                </div>
              </div>
              <div className="ec-detail-actions">
                <button className="btn-outline-white" onClick={() => window.print()}>
                  <Printer size={14} /> Imprimir / PDF
                </button>
              </div>
            </div>

            {/* Period controls */}
            <div className="ec-period-controls">
              <span className="ec-period-label">Desde:</span>
              <input
                type="month"
                className="period-month-select"
                value={detailFrom}
                onChange={e => setDetailFrom(e.target.value)}
                min={startPeriod}
                max={detailTo}
              />
              <span className="ec-period-label" style={{ marginLeft: 8 }}>Hasta:</span>
              <input
                type="month"
                className="period-month-select"
                value={detailTo}
                onChange={e => setDetailTo(e.target.value)}
                min={startPeriod || detailFrom}
                max={todayPeriod()}
              />
              <span style={{ fontSize: 12, color: 'var(--ink-400)', marginLeft: 'auto' }}>
                {data?.periods?.length || 0} período(s)
              </span>
            </div>

            {/* Summary strip */}
            {data && (
              <div className="ec-summary-strip">
                {unitPrevDebt > 0 && (
                  <div className="ec-sum-cell" style={{ background: 'var(--coral-50)' }}>
                    <div className="ec-sum-label" style={{ color: 'var(--coral-500)' }}>
                      Adeudo Anterior
                      {prevDebtAdeudo > 0 && (
                        <span style={{ fontSize: 9, color: 'var(--teal-600)', fontWeight: 400, marginLeft: 4 }}>
                          (Abonado: {fmt(prevDebtAdeudo)})
                        </span>
                      )}
                    </div>
                    <div className="ec-sum-val debt">-{fmt(netPrevDebt)}</div>
                  </div>
                )}
                <div className="ec-sum-cell">
                  <div className="ec-sum-label">Cargos Obligatorios</div>
                  <div className="ec-sum-val">{fmt(data.total_charges)}</div>
                </div>
                <div className="ec-sum-cell">
                  <div className="ec-sum-label">Total Abonado</div>
                  <div className="ec-sum-val ok">{fmt(data.total_payments)}</div>
                </div>
                <div className="ec-sum-cell">
                  <div className="ec-sum-label">Saldo Final</div>
                  <div className={`ec-sum-val ${balance > 0 ? 'debt' : 'ok'}`}>
                    {balance > 0 ? '-' : balance < 0 ? '+' : ''}{fmt(Math.abs(balance))}
                  </div>
                </div>
                {balance < 0 && (
                  <div className="ec-sum-cell" style={{ background: 'var(--teal-50)' }}>
                    <div className="ec-sum-label" style={{ color: 'var(--teal-700)' }}>Saldo a Favor</div>
                    <div className="ec-sum-val ok" style={{ color: 'var(--teal-600)' }}>+{fmt(Math.abs(balance))}</div>
                  </div>
                )}
              </div>
            )}

            {loading && <div style={{ textAlign: 'center', padding: '50px 20px', color: 'var(--ink-400)', fontSize: 14 }}>Cargando estado de cuenta…</div>}

            {data && !loading && (
              <div className="table-wrap">
                <table className="ec-table">
                  <thead>
                    <tr>
                      <th>Período</th>
                      <th style={{ textAlign: 'right' }}>Mant.</th>
                      <th style={{ textAlign: 'right' }}>Cargo Total</th>
                      <th style={{ textAlign: 'right' }}>Abono</th>
                      <th>Estado</th>
                      <th style={{ textAlign: 'right' }}>Saldo Acum.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unitPrevDebt > 0 && (
                      <tr style={{ background: 'var(--coral-50)', fontStyle: 'italic' }}>
                        <td style={{ fontWeight: 700, color: 'var(--coral-500)', whiteSpace: 'nowrap' }}>
                          <AlertCircle size={13} style={{ display: 'inline', verticalAlign: -2, marginRight: 6 }} />
                          Adeudo Anterior
                        </td>
                        <td colSpan={2} style={{ textAlign: 'right', color: 'var(--coral-500)', fontSize: 12 }}>
                          Saldo previo
                          {prevDebtAdeudo > 0 && (
                            <span style={{ color: 'var(--teal-600)', marginLeft: 4 }}>· Abonado: {fmt(prevDebtAdeudo)}</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right', color: 'var(--coral-500)', fontWeight: 600 }}>—</td>
                        <td></td>
                        <td style={{ textAlign: 'right' }}>
                          <span className="debt-cell" style={{ fontSize: 14, fontFamily: 'var(--font-display)' }}>
                            -{fmt(netPrevDebt)}
                          </span>
                          {prevDebtAdeudo > 0 && (
                            <div style={{ fontSize: 9, color: 'var(--teal-600)', fontStyle: 'normal' }}>Abono: {fmt(prevDebtAdeudo)}</div>
                          )}
                        </td>
                      </tr>
                    )}
                    {data.periods.map((p, i) => {
                      const charge = parseFloat(p.charge || 0);
                      const paid = parseFloat(p.paid || 0);
                      const saldoAcum = parseFloat(p.saldo_accum ?? 0);
                      const maint = parseFloat(p.maintenance || p.charge || 0);
                      const hasDebt = saldoAcum > 0.5;

                      return (
                        <tr key={i} className={hasDebt ? 'period-row-debt' : 'period-row-ok'}>
                          <td style={{ fontWeight: 700, fontSize: 13 }}>{periodLabel(p.period)}</td>
                          <td style={{ textAlign: 'right', fontSize: 13 }}>{fmt(maint)}</td>
                          <td style={{ textAlign: 'right', fontSize: 13, fontWeight: 700 }}>{fmt(charge)}</td>
                          <td style={{ textAlign: 'right', fontSize: 13 }} className="credit-cell">
                            {paid > 0 ? fmt(paid) : '—'}
                          </td>
                          <td><span className={`badge ${statusClass(p.status)}`}>{statusLabel(p.status)}</span></td>
                          <td style={{ textAlign: 'right' }}>
                            <span style={{
                              fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 500,
                              color: saldoAcum > 0 ? 'var(--coral-500)' : 'var(--teal-600)'
                            }}>
                              {saldoAcum > 0 ? '-' : saldoAcum < 0 ? '+' : ''}{fmt(Math.abs(saldoAcum))}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                    {data.periods.length === 0 && (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--ink-300)', fontSize: 14 }}>
                          Sin registros de pago
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* ════════════════════════ UNIT LIST VIEW ════════════════════════ */}
          {view === 'units' && !isVecino && (
            <>
              {/* Search + Cutoff */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
                <div className="ec-search-bar">
                  <Search size={16} style={{ color: 'var(--ink-400)', flexShrink: 0 }} />
                  <input
                    placeholder="Buscar unidad o residente..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--ink-500)' }}>Corte:</span>
                  <input
                    type="month"
                    className="period-month-select"
                    value={cutoff}
                    onChange={e => setCutoff(e.target.value)}
                    max={todayPeriod()}
                    min={startPeriod}
                  />
                </div>
              </div>

              {/* KPI Stats */}
              <div className="cob-stats" style={{ marginBottom: 20 }}>
                <div className="cob-stat">
                  <div className="cob-stat-icon" style={{ background: 'var(--blue-50)', color: 'var(--blue-500)' }}><Building size={18} /></div>
                  <div>
                    <div className="cob-stat-label">Total Cargos</div>
                    <div className="cob-stat-value">{fmt(summaryData.totalCargos)}</div>
                  </div>
                </div>
                <div className="cob-stat">
                  <div className="cob-stat-icon" style={{ background: 'var(--teal-50)', color: 'var(--teal-500)' }}><ArrowDown size={18} /></div>
                  <div>
                    <div className="cob-stat-label">Total Abonos</div>
                    <div className="cob-stat-value">{fmt(summaryData.totalAbonos)}</div>
                  </div>
                </div>
                <div className="cob-stat">
                  <div className="cob-stat-icon" style={{ background: 'var(--coral-50)', color: 'var(--coral-400)' }}><TrendingDown size={18} /></div>
                  <div>
                    <div className="cob-stat-label">Deuda Total</div>
                    <div className="cob-stat-value">{fmt(summaryData.totalDeuda)}</div>
                  </div>
                </div>
                <div className="cob-stat">
                  <div className="cob-stat-icon" style={{ background: 'var(--amber-50)', color: 'var(--amber-500)' }}><AlertCircle size={18} /></div>
                  <div>
                    <div className="cob-stat-label">Con Adeudo</div>
                    <div className="cob-stat-value">{summaryData.conAdeudo} uds.</div>
                  </div>
                </div>
              </div>

              {/* Units Table */}
              <div className="card">
                <div className="card-head">
                  <h3>Unidades</h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {startPeriod && (
                      <span style={{ fontSize: 12, color: 'var(--ink-400)', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Calendar size={13} /> Desde {periodLabel(startPeriod)}
                      </span>
                    )}
                    {search && <span className="badge badge-amber">Filtrado: {filteredUnits.length}</span>}
                  </div>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Unidad</th>
                        <th>Responsable</th>
                        <th style={{ textAlign: 'right' }}>Total Cargos</th>
                        <th style={{ textAlign: 'right' }}>Abonado</th>
                        <th style={{ textAlign: 'right' }}>Saldo</th>
                        <th>Estado</th>
                        <th style={{ width: 40 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUnits.length === 0 ? (
                        <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: 'var(--ink-400)' }}>Sin resultados.</td></tr>
                      ) : (
                        filteredUnits.map(u => {
                          const hasDebt = u.balance > 0;
                          const hasFavor = u.balance < 0;
                          const occupancyLabel = u.occupancy === 'rentado' ? 'Inquilino' : 'Propietario';

                          return (
                            <tr
                              key={u.id}
                              style={{ cursor: 'pointer' }}
                              onClick={() => handleSelectUnit(u.id)}
                            >
                              <td>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                  <div style={{ width: 4, height: 36, borderRadius: 2, background: hasDebt ? 'var(--coral-400)' : 'var(--teal-400)', flexShrink: 0 }} />
                                  <div>
                                    <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--teal-600)', background: 'var(--teal-50)', padding: '2px 8px', borderRadius: 5, fontSize: 12 }}>
                                      {u.unit_id_code}
                                    </span>
                                    <div style={{ fontWeight: 600, fontSize: 13, marginTop: 3 }}>{u.unit_name}</div>
                                  </div>
                                </div>
                              </td>
                              <td>
                                <div style={{ fontSize: 13 }}>{u.responsible_name || '—'}</div>
                                <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>{occupancyLabel}</div>
                              </td>
                              <td style={{ textAlign: 'right', fontSize: 13 }}>{fmt(u.total_charges)}</td>
                              <td style={{ textAlign: 'right', fontSize: 13, color: 'var(--teal-600)' }}>{fmt(u.total_payments)}</td>
                              <td style={{ textAlign: 'right' }}>
                                <span style={{
                                  fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 500,
                                  color: hasDebt ? 'var(--coral-500)' : hasFavor ? 'var(--teal-600)' : 'var(--ink-400)'
                                }}>
                                  {hasDebt ? '-' : hasFavor ? '+' : ''}{fmt(Math.abs(u.balance))}
                                </span>
                              </td>
                              <td>
                                <span className={`badge ${hasDebt ? 'badge-coral' : hasFavor ? 'badge-teal' : 'badge-teal'}`}>
                                  {hasDebt ? 'Con adeudo' : hasFavor ? 'Saldo a favor' : 'Al corriente'}
                                </span>
                              </td>
                              <td style={{ color: 'var(--ink-400)' }}><ChevronRight size={16} /></td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* ════════════════════════ ESTADO GENERAL (tenant) ════════════════════════ */}
          {view === 'tenant' && (
            <EstadoGeneralView
              tenantId={tenantId}
              tenantData={tenantData}
              generalData={generalData}
              genLoading={genLoading}
              cutoff={cutoff}
              setCutoff={setCutoff}
              startPeriod={startPeriod}
            />
          )}

          {/* ════════════════════════ REPORTE GENERAL ════════════════════════ */}
          {view === 'reporte' && (
            <ReporteGeneralView
              tenantId={tenantId}
              tenantData={tenantData}
              generalData={generalData}
              genLoading={genLoading}
              cutoff={cutoff}
              setCutoff={setCutoff}
              startPeriod={startPeriod}
            />
          )}

          {/* Vecino without unit */}
          {isVecino && !selectedUnit && (
            <div className="empty">
              <div className="empty-icon">📋</div>
              <h4>Sin unidad asignada</h4>
              <p>Tu cuenta no tiene una unidad vinculada. Contacta al administrador.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Total income from payment (matches HTML payTotalIncome: received + adelantos + adeudos)
function payTotalIncome(pay) {
  if (!pay) return 0;
  let total = 0;
  (pay.field_payments || []).forEach(fp => { total += parseFloat(fp.received || 0); });
  (pay.field_payments || []).forEach(fp => {
    const at = fp.adelanto_targets || {};
    Object.values(at).forEach(amt => { total += parseFloat(amt) || 0; });
  });
  const ap = pay.adeudo_payments || {};
  Object.values(ap).forEach(fm => {
    Object.values(fm || {}).forEach(amt => { total += parseFloat(amt) || 0; });
  });
  return total;
}

/* ═══════════════════════════════════════════════════════════
   ESTADO GENERAL — per-period rows across all units
   ═══════════════════════════════════════════════════════════ */
function EstadoGeneralView({ tenantId, tenantData, generalData, genLoading, cutoff, setCutoff, startPeriod }) {
  const [payments, setPayments] = useState([]);
  const [gastos, setGastos] = useState([]);
  const [cajaChica, setCajaChica] = useState([]);
  const [ecLoading, setEcLoading] = useState(false);
  const numUnits = generalData?.units?.length || 0;

  // Fetch ALL payments (no period filter) + gastos + caja chica for the tenant
  useEffect(() => {
    if (!tenantId) return;
    setEcLoading(true);
    Promise.all([
      paymentsAPI.list(tenantId, {}).catch(() => ({ data: [] })),
      gastosAPI.list(tenantId).catch(() => ({ data: [] })),
      cajaChicaAPI.list(tenantId).catch(() => ({ data: [] })),
    ]).then(([pRes, gRes, cRes]) => {
      setPayments(pRes.data?.results || pRes.data || []);
      setGastos(gRes.data?.results || gRes.data || []);
      setCajaChica(cRes.data?.results || cRes.data || []);
    }).finally(() => setEcLoading(false));
  }, [tenantId]);

  // Generate all periods between startPeriod and cutoff
  const allPeriods = useMemo(() => {
    if (!startPeriod || !cutoff) return [];
    const periods = [];
    let current = startPeriod;
    while (current <= cutoff) {
      periods.push(current);
      const [y, m] = current.split('-').map(Number);
      const next = new Date(y, m);
      current = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
    }
    return periods;
  }, [startPeriod, cutoff]);

  // Compute charge per unit per period
  const chargePerUnit = useMemo(() => {
    const maint = parseFloat(tenantData?.maintenance_fee || 0);
    let charge = maint;
    (generalData?.extra_fields || []).filter(f => f.required).forEach(f => {
      charge += parseFloat(f.default_amount || 0);
    });
    return charge;
  }, [tenantData, generalData]);

  // Group payments by period
  const periodRows = useMemo(() => {
    const payByPeriod = {};
    payments.forEach(p => {
      if (!payByPeriod[p.period]) payByPeriod[p.period] = [];
      payByPeriod[p.period].push(p);
    });
    const gastoByPeriod = {};
    gastos.forEach(g => {
      const per = g.period;
      if (!gastoByPeriod[per]) gastoByPeriod[per] = 0;
      gastoByPeriod[per] += parseFloat(g.amount || 0);
    });
    cajaChica.forEach(c => {
      const per = c.period;
      if (!gastoByPeriod[per]) gastoByPeriod[per] = 0;
      gastoByPeriod[per] += parseFloat(c.amount || 0);
    });

    return allPeriods.map(period => {
      const periodPayments = payByPeriod[period] || [];
      const totalCargo = chargePerUnit * numUnits;
      let recaudo = 0;
      let pagados = 0, parciales = 0, pendientesCount = 0;

      periodPayments.forEach(pay => {
        recaudo += payTotalIncome(pay);

        if (pay.status === 'pagado') pagados++;
        else if (pay.status === 'parcial') parciales++;
        else pendientesCount++;
      });

      pendientesCount = numUnits - pagados - parciales;
      if (pendientesCount < 0) pendientesCount = 0;

      const pGastos = gastoByPeriod[period] || 0;
      const balance = recaudo - pGastos;
      return { period, totalCargo, cargoOblig: totalCargo, recaudo, pagados, parciales, pendientes: pendientesCount, pGastos, balance };
    });
  }, [allPeriods, payments, gastos, cajaChica, chargePerUnit, numUnits]);

  // Grand totals
  const totals = useMemo(() => {
    let grandCargo = 0, grandRecaudo = 0, grandGastos = 0;
    periodRows.forEach(r => {
      grandCargo += r.totalCargo;
      grandRecaudo += r.recaudo;
      grandGastos += r.pGastos;
    });
    return { grandCargo, grandRecaudo, grandGastos, balance: grandRecaudo - grandGastos };
  }, [periodRows]);

  const loading = genLoading || ecLoading;

  return (
    <div className="content-fade">
      {/* Controls bar */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-body" style={{ padding: '16px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-600)' }}>Corte hasta:</span>
            <input
              type="month"
              className="period-month-select"
              value={cutoff}
              onChange={e => setCutoff(e.target.value)}
              min={startPeriod}
              max={todayPeriod()}
            />
            {startPeriod && (
              <span style={{ fontSize: 12, color: 'var(--ink-400)' }}>Desde: {periodLabel(startPeriod)}</span>
            )}
            <button className="btn btn-primary btn-sm no-print" style={{ marginLeft: 'auto' }} onClick={() => window.print()}>
              <Printer size={14} /> Exportar PDF
            </button>
          </div>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="cob-stats" style={{ marginBottom: 20, gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="cob-stat">
          <div className="cob-stat-icon" style={{ background: 'var(--blue-50)', color: 'var(--blue-500)' }}><Building size={18} /></div>
          <div>
            <div className="cob-stat-label">Total Cargos</div>
            <div className="cob-stat-value">{fmt(totals.grandCargo)}</div>
          </div>
        </div>
        <div className="cob-stat">
          <div className="cob-stat-icon" style={{ background: 'var(--teal-50)', color: 'var(--teal-500)' }}><ArrowDown size={18} /></div>
          <div>
            <div className="cob-stat-label">Recaudo Total</div>
            <div className="cob-stat-value">{fmt(totals.grandRecaudo)}</div>
          </div>
        </div>
        <div className="cob-stat">
          <div className="cob-stat-icon" style={{ background: 'var(--amber-50)', color: 'var(--amber-500)' }}><ShoppingBag size={18} /></div>
          <div>
            <div className="cob-stat-label">Total Gastos</div>
            <div className="cob-stat-value">{fmt(totals.grandGastos)}</div>
          </div>
        </div>
        <div className="cob-stat">
          <div className="cob-stat-icon" style={{ background: totals.balance >= 0 ? 'var(--teal-50)' : 'var(--coral-50)', color: totals.balance >= 0 ? 'var(--teal-500)' : 'var(--coral-400)' }}>
            <DollarSign size={18} />
          </div>
          <div>
            <div className="cob-stat-label">Balance Neto</div>
            <div className="cob-stat-value" style={{ color: totals.balance >= 0 ? 'var(--teal-600)' : 'var(--coral-500)' }}>{fmt(totals.balance)}</div>
          </div>
        </div>
      </div>

      {loading && <div style={{ textAlign: 'center', padding: 40, color: 'var(--ink-400)' }}>Cargando…</div>}

      {!loading && (
        <div className="card">
          <div className="card-head">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Globe size={16} /> Estado de Cuenta General — {tenantData?.name || ''}
            </h3>
            <span style={{ fontSize: 12, color: 'var(--ink-400)' }}>
              {allPeriods.length} período(s) · {numUnits} unidades
            </span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Período</th>
                  <th style={{ textAlign: 'right' }}>Cargos Oblig.</th>
                  <th style={{ textAlign: 'right' }}>Total Cargos</th>
                  <th style={{ textAlign: 'right' }}>Recaudo</th>
                  <th style={{ textAlign: 'center' }}>✅</th>
                  <th style={{ textAlign: 'center' }}>🔶</th>
                  <th style={{ textAlign: 'center' }}>⏳</th>
                  {totals.grandGastos > 0 && <th style={{ textAlign: 'right' }}>Gastos</th>}
                  {totals.grandGastos > 0 && <th style={{ textAlign: 'right' }}>Balance</th>}
                </tr>
              </thead>
              <tbody>
                {[...periodRows].reverse().map(row => {
                  const allPaid = row.pendientes === 0 && row.parciales === 0;
                  return (
                    <tr key={row.period} style={allPaid ? { background: 'rgba(42,157,115,0.03)' } : undefined}>
                      <td style={{ fontWeight: 600 }}>{periodLabel(row.period)}</td>
                      <td style={{ textAlign: 'right' }}>{fmt(row.cargoOblig)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(row.totalCargo)}</td>
                      <td style={{ textAlign: 'right', color: 'var(--teal-600)', fontWeight: 700 }}>{fmt(row.recaudo)}</td>
                      <td style={{ textAlign: 'center', color: 'var(--teal-600)', fontWeight: 700 }}>{row.pagados}</td>
                      <td style={{ textAlign: 'center', color: 'var(--amber-500)', fontWeight: 700 }}>{row.parciales}</td>
                      <td style={{ textAlign: 'center', color: 'var(--coral-400)', fontWeight: 700 }}>{row.pendientes}</td>
                      {totals.grandGastos > 0 && (
                        <td style={{ textAlign: 'right', color: 'var(--amber-500)' }}>
                          {row.pGastos > 0 ? fmt(row.pGastos) : <span style={{ color: 'var(--ink-300)' }}>—</span>}
                        </td>
                      )}
                      {totals.grandGastos > 0 && (
                        <td style={{ textAlign: 'right' }}>
                          <span style={{ fontWeight: 700, color: row.balance >= 0 ? 'var(--teal-600)' : 'var(--coral-500)' }}>
                            {fmt(row.balance)}
                          </span>
                        </td>
                      )}
                    </tr>
                  );
                })}
                {allPeriods.length === 0 && (
                  <tr><td colSpan={9} style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--ink-300)' }}>Sin datos</td></tr>
                )}
                {/* TOTALES row */}
                {periodRows.length > 0 && (
                  <tr style={{ background: 'var(--sand-50)', fontWeight: 700, borderTop: '2px solid var(--sand-200)' }}>
                    <td>TOTALES</td>
                    <td style={{ textAlign: 'right' }}>{fmt(totals.grandCargo)}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(totals.grandCargo)}</td>
                    <td style={{ textAlign: 'right', color: 'var(--teal-600)' }}>{fmt(totals.grandRecaudo)}</td>
                    <td colSpan={3}></td>
                    {totals.grandGastos > 0 && (
                      <td style={{ textAlign: 'right', color: 'var(--amber-500)' }}>{fmt(totals.grandGastos)}</td>
                    )}
                    {totals.grandGastos > 0 && (
                      <td style={{ textAlign: 'right' }}>
                        <span style={{ color: totals.balance >= 0 ? 'var(--teal-600)' : 'var(--coral-500)' }}>{fmt(totals.balance)}</span>
                      </td>
                    )}
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   REPORTE GENERAL (bank-style income/expense report)
   ═══════════════════════════════════════════════════════════ */
function ReporteGeneralView({ tenantId, tenantData, generalData, genLoading, cutoff, setCutoff, startPeriod }) {
  const tenantUnits = generalData?.units || [];

  // Compute income/expense totals (payment income = received + adelantos + adeudos)
  const reportData = useMemo(() => {
    let totalIngresos = 0, totalEgresos = 0;
    let maintIncome = 0;
    const fieldIncome = {};

    tenantUnits.forEach(item => {
      const payment = item.payment;
      totalIngresos += payTotalIncome(payment);

      if (payment) {
        const fps = item.field_payments || {};
        const fpList = payment.field_payments || [];
        const fpMap = { ...fps };
        fpList.forEach(fp => { fpMap[fp.field_key] = fp; });
        const mr = parseFloat((fpMap.maintenance || {}).received || 0);
        maintIncome += mr;
        Object.entries(fpMap).forEach(([fid, fp]) => {
          const rec = parseFloat((fp && fp.received) || 0);
          if (rec > 0) {
            if (!fieldIncome[fid]) fieldIncome[fid] = 0;
            fieldIncome[fid] += rec;
          }
        });
      }
    });

    (generalData?.gastos || []).forEach(g => { totalEgresos += parseFloat(g.amount || 0); });
    (generalData?.caja_chica || []).forEach(c => { totalEgresos += parseFloat(c.amount || 0); });

    const saldoFinal = totalIngresos - totalEgresos;
    const gastosTotal = (generalData?.gastos || []).reduce((a, g) => a + parseFloat(g.amount || 0), 0);
    const cajaTotal = (generalData?.caja_chica || []).reduce((a, c) => a + parseFloat(c.amount || 0), 0);

    return { totalIngresos, totalEgresos, saldoFinal, maintIncome, fieldIncome, gastosTotal, cajaTotal };
  }, [tenantUnits, generalData]);

  const handlePrev = () => setCutoff(prevPeriod(cutoff));
  const handleNext = () => {
    const next = nextPeriod(cutoff);
    if (next <= todayPeriod()) setCutoff(next);
  };

  return (
    <div className="content-fade">
      {/* Period controls */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-body" style={{ padding: '16px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-600)' }}>Período:</span>
            <div className="period-nav" style={{ gap: 4 }}>
              <button className="period-nav-btn" onClick={handlePrev}><ChevronLeft size={16} /></button>
              <input
                type="month"
                className="period-month-select"
                style={{ fontSize: 15, fontWeight: 700 }}
                value={cutoff}
                onChange={e => setCutoff(e.target.value)}
                min={startPeriod}
                max={todayPeriod()}
              />
              <button className="period-nav-btn" onClick={handleNext}><ChevronRight size={16} /></button>
            </div>
            {startPeriod && (
              <span style={{ fontSize: 12, color: 'var(--ink-400)' }}>Inicio: {periodLabel(startPeriod)}</span>
            )}
            <button className="btn btn-primary btn-sm no-print" style={{ marginLeft: 'auto' }} onClick={() => window.print()}>
              <Printer size={14} /> Exportar PDF
            </button>
          </div>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="cob-stats" style={{ marginBottom: 20, gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="cob-stat">
          <div className="cob-stat-icon" style={{ background: 'var(--blue-50)', color: 'var(--blue-500)' }}><DollarSign size={18} /></div>
          <div>
            <div className="cob-stat-label">Saldo Inicial</div>
            <div className="cob-stat-value">{fmt(0)}</div>
          </div>
        </div>
        <div className="cob-stat">
          <div className="cob-stat-icon" style={{ background: 'var(--teal-50)', color: 'var(--teal-500)' }}><ArrowDown size={18} /></div>
          <div>
            <div className="cob-stat-label">Ingresos Conciliados</div>
            <div className="cob-stat-value" style={{ color: 'var(--teal-600)' }}>{fmt(reportData.totalIngresos)}</div>
          </div>
        </div>
        <div className="cob-stat">
          <div className="cob-stat-icon" style={{ background: 'var(--coral-50)', color: 'var(--coral-400)' }}><ShoppingBag size={18} /></div>
          <div>
            <div className="cob-stat-label">Egresos Conciliados</div>
            <div className="cob-stat-value" style={{ color: 'var(--coral-500)' }}>{fmt(reportData.totalEgresos)}</div>
          </div>
        </div>
        <div className="cob-stat">
          <div className="cob-stat-icon" style={{ background: reportData.saldoFinal >= 0 ? 'var(--teal-50)' : 'var(--coral-50)', color: reportData.saldoFinal >= 0 ? 'var(--teal-500)' : 'var(--coral-400)' }}>
            <DollarSign size={18} />
          </div>
          <div>
            <div className="cob-stat-label">Saldo Final Banco</div>
            <div className="cob-stat-value" style={{ color: reportData.saldoFinal >= 0 ? 'var(--teal-600)' : 'var(--coral-500)' }}>{fmt(reportData.saldoFinal)}</div>
          </div>
        </div>
      </div>

      {genLoading && <div style={{ textAlign: 'center', padding: 40, color: 'var(--ink-400)' }}>Cargando…</div>}

      {!genLoading && generalData && (
        <div className="card">
          <div className="card-head">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <DollarSign size={16} /> Reporte General de {tenantData?.name || ''} — {periodLabel(cutoff)}
            </h3>
            <span style={{ fontSize: 12, color: 'var(--ink-400)' }}>{tenantUnits.length} unidades</span>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            {/* Ingresos Section */}
            <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--sand-100)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--teal-500)', flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--teal-700)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Ingresos Conciliados
                </span>
                <span style={{ fontSize: 11, color: 'var(--ink-400)', marginLeft: 'auto' }}>
                  {tenantUnits.filter(i => i.payment).length} de {tenantUnits.length} unidades
                </span>
              </div>

              {reportData.maintIncome > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--sand-50)' }}>
                  <span style={{ fontSize: 13, color: 'var(--ink-600)' }}>Mantenimiento</span>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600, color: 'var(--teal-600)' }}>{fmt(reportData.maintIncome)}</span>
                </div>
              )}

              {(generalData.extra_fields || []).map(f => {
                const val = reportData.fieldIncome[f.id] || 0;
                if (val <= 0) return null;
                return (
                  <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--sand-50)' }}>
                    <span style={{ fontSize: 13, color: 'var(--ink-600)' }}>{f.label}</span>
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600, color: 'var(--teal-600)' }}>{fmt(val)}</span>
                  </div>
                );
              })}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', marginTop: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--teal-700)' }}>TOTAL INGRESOS</span>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--teal-700)' }}>{fmt(reportData.totalIngresos)}</span>
              </div>
            </div>

            {/* Egresos Section */}
            <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--sand-100)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--coral-400)', flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--coral-500)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Egresos
                </span>
              </div>

              {reportData.gastosTotal > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--sand-50)' }}>
                  <span style={{ fontSize: 13, color: 'var(--ink-600)' }}>Gastos del Período</span>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600, color: 'var(--coral-500)' }}>{fmt(reportData.gastosTotal)}</span>
                </div>
              )}

              {reportData.cajaTotal > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--sand-50)' }}>
                  <span style={{ fontSize: 13, color: 'var(--ink-600)' }}>Caja Chica</span>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600, color: 'var(--coral-500)' }}>{fmt(reportData.cajaTotal)}</span>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', marginTop: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--coral-500)' }}>TOTAL EGRESOS</span>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--coral-500)' }}>{fmt(reportData.totalEgresos)}</span>
              </div>
            </div>

            {/* Saldo Final */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '20px 24px',
              background: reportData.saldoFinal >= 0 ? 'var(--teal-50)' : 'var(--coral-50)',
              borderTop: `2px solid ${reportData.saldoFinal >= 0 ? 'var(--teal-200)' : 'var(--coral-200)'}`
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 20 }}>💰</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: reportData.saldoFinal >= 0 ? 'var(--teal-700)' : 'var(--coral-600)' }}>
                    Saldo Final
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>
                    Ingresos - Egresos del período
                  </div>
                </div>
              </div>
              <div style={{
                fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 700,
                color: reportData.saldoFinal >= 0 ? 'var(--teal-700)' : 'var(--coral-600)'
              }}>
                {fmt(reportData.saldoFinal)}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
