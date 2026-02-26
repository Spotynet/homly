import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { unitsAPI, reportsAPI, tenantsAPI, paymentsAPI, gastosAPI, unrecognizedIncomeAPI } from '../api/client';
import PaginationBar from '../components/PaginationBar';
import { statusClass, statusLabel, fmtDate, periodLabel, todayPeriod, prevPeriod, nextPeriod, ROLES } from '../utils/helpers';
import { Search, ChevronLeft, ChevronRight, Building, Globe, DollarSign, ArrowDown, TrendingDown, AlertCircle, Calendar, Printer, ShoppingBag } from 'lucide-react';

function fmt(n) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n ?? 0);
}

export default function EstadoCuenta() {
  const { tenantId, isVecino, user, role } = useAuth();
  const location = useLocation();
  const [units, setUnits] = useState([]);
  const [unitSummaries, setUnitSummaries] = useState([]);
  const [selectedUnit, setSelectedUnit] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [view, setView] = useState('units');
  const [generalData, setGeneralData] = useState(null);
  const [genLoading, setGenLoading] = useState(false);
  const [adeudosData, setAdeudosData] = useState(null);
  const [adeudosLoading, setAdeudosLoading] = useState(false);
  const [adeudosCutoff, setAdeudosCutoff] = useState(todayPeriod());
  const [cutoff, setCutoff] = useState(todayPeriod());
  const [tenantData, setTenantData] = useState(null);
  const [detailFrom, setDetailFrom] = useState('');
  const [detailTo, setDetailTo] = useState(todayPeriod());
  const [unitsPage, setUnitsPage] = useState(1);
  const [unitsPerPage, setUnitsPerPage] = useState(25);
  const UNITS_PAGE_OPTIONS = [10, 25, 50, 100];

  // Load units + tenant info
  useEffect(() => {
    if (!tenantId) return;
    unitsAPI.list(tenantId, { page_size: 9999 }).then(r => {
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
  const [listMeta, setListMeta] = useState(null);
  useEffect(() => {
    if (!tenantId || selectedUnit) return;
    reportsAPI.estadoCuenta(tenantId, { cutoff })
      .then(r => {
        const unitsList = r.data?.units || [];
        setUnitSummaries(unitsList);
        setListMeta({
          total_ingresos_no_identificados: parseFloat(r.data?.total_ingresos_no_identificados || 0),
        });
      })
      .catch(() => { setUnitSummaries([]); setListMeta(null); });
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

  // Load reporte de adeudos
  useEffect(() => {
    if (view !== 'adeudos' || !tenantId) return;
    setAdeudosLoading(true);
    reportsAPI.reporteAdeudos(tenantId, { cutoff: adeudosCutoff })
      .then(r => setAdeudosData(r.data))
      .catch(() => {})
      .finally(() => setAdeudosLoading(false));
  }, [view, tenantId, adeudosCutoff]);

  // Marcar body para estilos de impresión (PDF = pantalla)
  useEffect(() => {
    if (!location.pathname.includes('estado-cuenta')) return;
    const onBeforePrint = () => document.body.classList.add('printing-ec');
    const onAfterPrint = () => document.body.classList.remove('printing-ec');
    window.addEventListener('beforeprint', onBeforePrint);
    window.addEventListener('afterprint', onAfterPrint);
    return () => {
      window.removeEventListener('beforeprint', onBeforePrint);
      window.removeEventListener('afterprint', onAfterPrint);
      document.body.classList.remove('printing-ec');
    };
  }, [location.pathname]);

  // Compute totals from unit summaries — total_abono from API already includes ingresos no identificados
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

  const unitsTotalPages = Math.max(1, Math.ceil(filteredUnits.length / unitsPerPage));
  const pagedUnits = useMemo(() => {
    const start = (unitsPage - 1) * unitsPerPage;
    return filteredUnits.slice(start, start + unitsPerPage);
  }, [filteredUnits, unitsPage, unitsPerPage]);

  const showDetail = isVecino ? true : !!selectedUnit;
  const balance = data ? parseFloat(data.balance) : 0;
  const unitPrevDebt = data ? parseFloat(data.previous_debt ?? data.unit?.previous_debt ?? 0) : 0;
  const prevDebtAdeudo = data ? parseFloat(data.prev_debt_adeudo ?? 0) : 0;
  const netPrevDebt = data ? (parseFloat(data.net_prev_debt ?? 0) || Math.max(0, unitPrevDebt - prevDebtAdeudo)) : 0;
  const unitCreditBalance = data ? parseFloat(data.credit_balance ?? data.unit?.credit_balance ?? 0) : 0;

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
          <button className={`ec-view-btn ${view === 'adeudos' ? 'active' : ''}`} onClick={() => { setView('adeudos'); setSelectedUnit(null); }}>
            <AlertCircle size={14} /> Reporte de Adeudos
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
                {unitCreditBalance > 0 && (
                  <div className="ec-sum-cell" style={{ background: 'var(--teal-50)' }}>
                    <div className="ec-sum-label" style={{ color: 'var(--teal-600)' }}>Saldo a Favor Previo</div>
                    <div className="ec-sum-val ok">+{fmt(unitCreditBalance)}</div>
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
                    {unitCreditBalance > 0 && (
                      <tr style={{ background: 'var(--teal-50)', fontStyle: 'italic' }}>
                        <td style={{ fontWeight: 700, color: 'var(--teal-600)', whiteSpace: 'nowrap' }}>
                          <DollarSign size={13} style={{ display: 'inline', verticalAlign: -2, marginRight: 6 }} />
                          Saldo a Favor Previo
                        </td>
                        <td colSpan={2} style={{ textAlign: 'right', color: 'var(--teal-500)', fontSize: 12 }}>
                          Saldo acumulado antes del inicio de operaciones
                        </td>
                        <td style={{ textAlign: 'right', color: 'var(--teal-600)', fontWeight: 600 }}>—</td>
                        <td></td>
                        <td style={{ textAlign: 'right' }}>
                          <span style={{ fontSize: 14, fontFamily: 'var(--font-display)', color: 'var(--teal-600)', fontWeight: 700 }}>
                            +{fmt(unitCreditBalance)}
                          </span>
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
                    onChange={e => { setSearch(e.target.value); setUnitsPage(1); }}
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
                    {listMeta?.total_ingresos_no_identificados > 0 && (
                      <div style={{ fontSize: 10, color: 'var(--amber-600)', marginTop: 2 }}>incl. {fmt(listMeta.total_ingresos_no_identificados)} no identificados</div>
                    )}
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
                      {pagedUnits.length === 0 ? (
                        <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: 'var(--ink-400)' }}>Sin resultados.</td></tr>
                      ) : (
                        pagedUnits.map(u => {
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
                {filteredUnits.length > 0 && (
                  <PaginationBar
                    page={unitsPage}
                    totalPages={unitsTotalPages}
                    totalItems={filteredUnits.length}
                    perPage={unitsPerPage}
                    onPageChange={setUnitsPage}
                    pageSizeOptions={UNITS_PAGE_OPTIONS}
                    onPerPageChange={(n) => { setUnitsPerPage(n); setUnitsPage(1); }}
                    itemLabel="unidades"
                  />
                )}
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
              tenantData={tenantData}
              generalData={generalData}
              genLoading={genLoading}
              cutoff={cutoff}
              setCutoff={setCutoff}
              startPeriod={startPeriod}
              user={user} role={role}
            />
          )}

          {/* ════════════════════════ REPORTE DE ADEUDOS ════════════════════════ */}
          {view === 'adeudos' && (
            <ReporteAdeudosView
              tenantData={tenantData}
              adeudosData={adeudosData}
              adeudosLoading={adeudosLoading}
              cutoff={adeudosCutoff}
              setCutoff={setAdeudosCutoff}
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
  // cajaChica ya no se incluye en el reporte general
  const [unrecognizedIncome, setUnrecognizedIncome] = useState([]);
  const [ecLoading, setEcLoading] = useState(false);
  const [expandedPeriods, setExpandedPeriods] = useState({});
  const togglePeriod = (period) => setExpandedPeriods(prev => ({ ...prev, [period]: !prev[period] }));
  const numUnits = generalData?.units?.length || 0;

  // Fetch ALL payments (no period filter) + gastos for the tenant
  // Nota: cajaChica NO se incluye en el reporte general
  useEffect(() => {
    if (!tenantId) return;
    setEcLoading(true);
    Promise.all([
      paymentsAPI.list(tenantId, { page_size: 9999 }).catch(() => ({ data: [] })),
      gastosAPI.list(tenantId, { page_size: 9999 }).catch(() => ({ data: [] })),
      unrecognizedIncomeAPI.list(tenantId, { page_size: 9999 }).catch(() => ({ data: [] })),
    ]).then(([pRes, gRes, uiRes]) => {
      setPayments(pRes.data?.results || pRes.data || []);
      setGastos(gRes.data?.results || gRes.data || []);
      setUnrecognizedIncome(Array.isArray(uiRes.data) ? uiRes.data : (uiRes.data?.results || []));
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
    // Gastos por período — solo inputs capturados como "gastos" (caja chica excluida)
    const gastoByPeriod = {};
    const gastoDetailByPeriod = {};
    gastos.forEach(g => {
      const per = g.period;
      if (!gastoByPeriod[per]) { gastoByPeriod[per] = { reconciled: 0, noReconciled: 0 }; gastoDetailByPeriod[per] = { reconciled: [], noReconciled: [] }; }
      const amt = parseFloat(g.amount || 0);
      if (g.bank_reconciled) {
        gastoByPeriod[per].reconciled += amt;
        gastoDetailByPeriod[per].reconciled.push({ label: g.field_label || g.field?.label || 'Gasto', amount: amt, provider: g.provider_name || '' });
      } else {
        gastoByPeriod[per].noReconciled += amt;
        gastoDetailByPeriod[per].noReconciled.push({ label: g.field_label || g.field?.label || 'Gasto', amount: amt, provider: g.provider_name || '' });
      }
    });

    const uiByPeriod = {};
    unrecognizedIncome.forEach(ui => {
      const per = ui.period;
      if (!uiByPeriod[per]) uiByPeriod[per] = 0;
      uiByPeriod[per] += parseFloat(ui.amount || 0);
    });

    return allPeriods.map(period => {
      const periodPayments = payByPeriod[period] || [];
      const totalCargo = chargePerUnit * numUnits;
      let recaudo = 0, recaudoConciliado = 0, recaudoNoConciliado = 0;
      let pagados = 0, parciales = 0, pendientesCount = 0;
      const recaudoDetails = { conciliado: [], noConciliado: [] };

      periodPayments.forEach(pay => {
        const income = payTotalIncome(pay);
        recaudo += income;
        const responsible = pay.responsible || '';
        if (pay.bank_reconciled) {
          recaudoConciliado += income;
          if (income > 0) recaudoDetails.conciliado.push({ unit: pay.unit_id_code || '', responsible, amount: income, payment_type: pay.payment_type });
        } else {
          recaudoNoConciliado += income;
          if (income > 0) recaudoDetails.noConciliado.push({ unit: pay.unit_id_code || '', responsible, amount: income, payment_type: pay.payment_type });
        }
        if (pay.status === 'pagado') pagados++;
        else if (pay.status === 'parcial') parciales++;
        else pendientesCount++;
      });
      const uiAmt = uiByPeriod[period] || 0;
      recaudo += uiAmt;
      recaudoConciliado += uiAmt;

      pendientesCount = numUnits - pagados - parciales;
      if (pendientesCount < 0) pendientesCount = 0;

      const gastosPer = gastoByPeriod[period] || { reconciled: 0, noReconciled: 0 };
      const gastoDetailPer = gastoDetailByPeriod[period] || { reconciled: [], noReconciled: [] };
      const pGastos = gastosPer.reconciled + gastosPer.noReconciled;
      const balance = recaudo - pGastos;
      return {
        period, totalCargo, cargoOblig: totalCargo, recaudo,
        recaudoConciliado, recaudoNoConciliado, recaudoDetails,
        pagados, parciales, pendientes: pendientesCount,
        pGastos, gastosConciliado: gastosPer.reconciled, gastosNoConciliado: gastosPer.noReconciled,
        gastoDetail: gastoDetailPer, balance,
      };
    });
  }, [allPeriods, payments, gastos, unrecognizedIncome, chargePerUnit, numUnits]);

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
                  <th style={{ textAlign: 'right' }}>Recaudo 🏦</th>
                  <th style={{ textAlign: 'right' }}>Recaudo ⏳</th>
                  <th style={{ textAlign: 'center' }}>✅</th>
                  <th style={{ textAlign: 'center' }}>🔶</th>
                  <th style={{ textAlign: 'center' }}>⏳</th>
                  <th style={{ textAlign: 'right' }}>Gastos 🏦</th>
                  <th style={{ textAlign: 'right' }}>Gastos ⏳</th>
                  <th style={{ textAlign: 'right' }}>Balance</th>
                </tr>
                <tr style={{ background: 'var(--sand-50)', fontSize: 10, color: 'var(--ink-400)' }}>
                  <td colSpan={1}></td>
                  <td style={{ textAlign: 'right', paddingBottom: 4 }}>Total período</td>
                  <td style={{ textAlign: 'right', paddingBottom: 4, color: 'var(--teal-600)' }}>Conciliados</td>
                  <td style={{ textAlign: 'right', paddingBottom: 4, color: 'var(--amber-500)' }}>No conciliados</td>
                  <td colSpan={3}></td>
                  <td style={{ textAlign: 'right', paddingBottom: 4, color: 'var(--amber-700)' }}>Conciliados</td>
                  <td style={{ textAlign: 'right', paddingBottom: 4, color: 'var(--ink-400)' }}>En tránsito</td>
                  <td></td>
                </tr>
              </thead>
              <tbody>
                {[...periodRows].reverse().map(row => {
                  const allPaid = row.pendientes === 0 && row.parciales === 0;
                  const hasRecaudoDetail = row.recaudoDetails.conciliado.length + row.recaudoDetails.noConciliado.length > 0;
                  const hasGastoDetail = row.gastoDetail.reconciled.length + row.gastoDetail.noReconciled.length > 0;
                  const hasDetail = hasRecaudoDetail || hasGastoDetail;
                  const isExpanded = !!expandedPeriods[row.period];
                  return (
                    <React.Fragment key={row.period}>
                      <tr
                        style={{ ...(allPaid ? { background: 'rgba(42,157,115,0.03)' } : {}), cursor: hasDetail ? 'pointer' : 'default' }}
                        onClick={() => hasDetail && togglePeriod(row.period)}
                        title={hasDetail ? (isExpanded ? 'Colapsar detalle' : 'Ver detalle') : undefined}
                      >
                        <td style={{ fontWeight: 600 }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                            {hasDetail && (
                              <span style={{
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                width: 16, height: 16, borderRadius: 4,
                                background: 'var(--sand-100)', color: 'var(--ink-400)',
                                fontSize: 10, flexShrink: 0,
                                transition: 'transform 0.15s',
                                transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                              }}>▶</span>
                            )}
                            {periodLabel(row.period)}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>{fmt(row.cargoOblig)}</td>
                        <td style={{ textAlign: 'right', color: 'var(--teal-600)', fontWeight: 700 }}>{row.recaudoConciliado > 0 ? fmt(row.recaudoConciliado) : <span style={{ color: 'var(--ink-300)' }}>—</span>}</td>
                        <td style={{ textAlign: 'right', color: 'var(--amber-500)', fontWeight: 700 }}>{row.recaudoNoConciliado > 0 ? fmt(row.recaudoNoConciliado) : <span style={{ color: 'var(--ink-300)' }}>—</span>}</td>
                        <td style={{ textAlign: 'center', color: 'var(--teal-600)', fontWeight: 700 }}>{row.pagados}</td>
                        <td style={{ textAlign: 'center', color: 'var(--amber-500)', fontWeight: 700 }}>{row.parciales}</td>
                        <td style={{ textAlign: 'center', color: 'var(--coral-400)', fontWeight: 700 }}>{row.pendientes}</td>
                        <td style={{ textAlign: 'right', color: 'var(--amber-700)' }}>{row.gastosConciliado > 0 ? fmt(row.gastosConciliado) : <span style={{ color: 'var(--ink-300)' }}>—</span>}</td>
                        <td style={{ textAlign: 'right', color: 'var(--ink-400)' }}>{row.gastosNoConciliado > 0 ? fmt(row.gastosNoConciliado) : <span style={{ color: 'var(--ink-300)' }}>—</span>}</td>
                        <td style={{ textAlign: 'right' }}>
                          <span style={{ fontWeight: 700, color: row.balance >= 0 ? 'var(--teal-600)' : 'var(--coral-500)' }}>{fmt(row.balance)}</span>
                        </td>
                      </tr>
                      {/* Detalle colapsable */}
                      {isExpanded && hasRecaudoDetail && row.recaudoDetails.conciliado.map((d, i) => (
                        <tr key={`rc-${i}`} style={{ background: 'rgba(42,157,115,0.04)', fontSize: 11 }}>
                          <td style={{ paddingLeft: 32, color: 'var(--teal-600)', fontStyle: 'italic' }}>↳ 🏦 {d.unit}{d.responsible ? ` — ${d.responsible}` : ''}</td>
                          <td></td>
                          <td style={{ textAlign: 'right', color: 'var(--teal-600)' }}>{fmt(d.amount)}</td>
                          <td colSpan={7}><span style={{ fontSize: 10, color: 'var(--ink-400)' }}>{d.payment_type || ''}</span></td>
                        </tr>
                      ))}
                      {isExpanded && hasRecaudoDetail && row.recaudoDetails.noConciliado.map((d, i) => (
                        <tr key={`rn-${i}`} style={{ background: 'rgba(255,180,0,0.04)', fontSize: 11 }}>
                          <td style={{ paddingLeft: 32, color: 'var(--amber-600)', fontStyle: 'italic' }}>↳ ⏳ {d.unit}{d.responsible ? ` — ${d.responsible}` : ''}</td>
                          <td></td>
                          <td></td>
                          <td style={{ textAlign: 'right', color: 'var(--amber-500)' }}>{fmt(d.amount)}</td>
                          <td colSpan={6}><span style={{ fontSize: 10, color: 'var(--ink-400)' }}>{d.payment_type || ''}</span></td>
                        </tr>
                      ))}
                      {isExpanded && hasGastoDetail && row.gastoDetail.reconciled.map((g, i) => (
                        <tr key={`gc-${i}`} style={{ background: 'rgba(255,140,0,0.04)', fontSize: 11 }}>
                          <td style={{ paddingLeft: 32, color: 'var(--amber-700)', fontStyle: 'italic' }}>↳ 🏦 {g.label}{g.provider ? ` — ${g.provider}` : ''}</td>
                          <td colSpan={6}></td>
                          <td style={{ textAlign: 'right', color: 'var(--amber-700)' }}>{fmt(g.amount)}</td>
                          <td colSpan={2}></td>
                        </tr>
                      ))}
                      {isExpanded && hasGastoDetail && row.gastoDetail.noReconciled.map((g, i) => (
                        <tr key={`gn-${i}`} style={{ background: 'rgba(100,100,100,0.03)', fontSize: 11 }}>
                          <td style={{ paddingLeft: 32, color: 'var(--ink-500)', fontStyle: 'italic' }}>↳ ⏳ {g.label}{g.provider ? ` — ${g.provider}` : ''}</td>
                          <td colSpan={7}></td>
                          <td style={{ textAlign: 'right', color: 'var(--ink-400)' }}>{fmt(g.amount)}</td>
                          <td></td>
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })}
                {allPeriods.length === 0 && (
                  <tr><td colSpan={10} style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--ink-300)' }}>Sin datos</td></tr>
                )}
                {/* TOTALES row */}
                {periodRows.length > 0 && (
                  <tr style={{ background: 'var(--sand-50)', fontWeight: 700, borderTop: '2px solid var(--sand-200)' }}>
                    <td>TOTALES</td>
                    <td style={{ textAlign: 'right' }}>{fmt(totals.grandCargo)}</td>
                    <td style={{ textAlign: 'right', color: 'var(--teal-600)' }}>{fmt(periodRows.reduce((s,r)=>s+r.recaudoConciliado,0))}</td>
                    <td style={{ textAlign: 'right', color: 'var(--amber-500)' }}>{fmt(periodRows.reduce((s,r)=>s+r.recaudoNoConciliado,0))}</td>
                    <td colSpan={3}></td>
                    <td style={{ textAlign: 'right', color: 'var(--amber-700)' }}>{fmt(periodRows.reduce((s,r)=>s+r.gastosConciliado,0))}</td>
                    <td style={{ textAlign: 'right', color: 'var(--ink-400)' }}>{fmt(periodRows.reduce((s,r)=>s+r.gastosNoConciliado,0))}</td>
                    <td style={{ textAlign: 'right' }}>
                      <span style={{ color: totals.balance >= 0 ? 'var(--teal-600)' : 'var(--coral-500)' }}>{fmt(totals.balance)}</span>
                    </td>
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
   REPORTE GENERAL (HTML original — conciliación bancaria)
   ═══════════════════════════════════════════════════════════ */
function ReporteGeneralView({ tenantData, generalData, genLoading, cutoff, setCutoff, startPeriod, user, role }) {
  const fmt2 = (n) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n ?? 0);
  const rd = generalData?.report_data || {};
  const saldoInicial = generalData?.saldo_inicial ?? 0;
  const saldoFinal = generalData?.saldo_final ?? 0;
  const unitsCount = generalData?.units_count ?? 0;

  const handlePrev = () => setCutoff(prevPeriod(cutoff));
  const handleNext = () => {
    const next = nextPeriod(cutoff);
    if (next <= todayPeriod()) setCutoff(next);
  };

  return (
    <div className="content-fade">
      {/* Period controls — oculto al imprimir */}
      <div className="card no-print" style={{ marginBottom: 20 }}>
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
            <button className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }} onClick={() => window.print()}>
              <Printer size={14} /> Exportar PDF
            </button>
          </div>
        </div>
      </div>

      {/* KPI Strip (HTML) — oculto al imprimir */}
      <div className="cob-stats no-print" style={{ marginBottom: 20, gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="cob-stat">
          <div className="cob-stat-icon" style={{ background: 'var(--blue-50)', color: 'var(--blue-500)' }}><DollarSign size={18} /></div>
          <div>
            <div className="cob-stat-label">Saldo Inicial</div>
            <div className="cob-stat-value">{fmt2(saldoInicial)}</div>
          </div>
        </div>
        <div className="cob-stat">
          <div className="cob-stat-icon" style={{ background: 'var(--teal-50)', color: 'var(--teal-500)' }}><ArrowDown size={18} /></div>
          <div>
            <div className="cob-stat-label">Ingresos Conciliados</div>
            <div className="cob-stat-value" style={{ color: 'var(--teal-600)' }}>{fmt2(rd.total_ingresos_reconciled)}</div>
          </div>
        </div>
        <div className="cob-stat">
          <div className="cob-stat-icon" style={{ background: 'var(--coral-50)', color: 'var(--coral-400)' }}><ShoppingBag size={18} /></div>
          <div>
            <div className="cob-stat-label">Egresos Conciliados</div>
            <div className="cob-stat-value" style={{ color: 'var(--coral-500)' }}>{fmt2(rd.total_egresos_reconciled)}</div>
          </div>
        </div>
        <div className="cob-stat">
          <div className="cob-stat-icon" style={{ background: saldoFinal >= 0 ? 'var(--teal-50)' : 'var(--coral-50)', color: saldoFinal >= 0 ? 'var(--teal-500)' : 'var(--coral-400)' }}>
            <DollarSign size={18} />
          </div>
          <div>
            <div className="cob-stat-label">Saldo Final Banco</div>
            <div className="cob-stat-value" style={{ color: saldoFinal >= 0 ? 'var(--teal-600)' : 'var(--coral-500)' }}>{fmt2(saldoFinal)}</div>
          </div>
        </div>
      </div>

      {genLoading && <div style={{ textAlign: 'center', padding: 40, color: 'var(--ink-400)' }}>Cargando…</div>}

      {!genLoading && generalData && (
        <div className="card" style={{ overflow: 'hidden' }}>

          {/* ── MEMBRETE EJECUTIVO ── */}
          <div style={{
            background: 'linear-gradient(135deg, #0f4c75 0%, #1b6ca8 50%, #2a9d8f 100%)',
            padding: '28px 32px 24px',
            position: 'relative',
            overflow: 'hidden',
          }}>
            {/* Decorative circles */}
            <div style={{ position: 'absolute', top: -30, right: -30, width: 120, height: 120, borderRadius: '50%', background: 'rgba(255,255,255,0.05)', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', bottom: -20, right: 60, width: 80, height: 80, borderRadius: '50%', background: 'rgba(255,255,255,0.07)', pointerEvents: 'none' }} />

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20, position: 'relative' }}>
              {/* Logo */}
              {tenantData?.logo ? (
                <img src={tenantData.logo} alt="Logo"
                  style={{ width: 64, height: 64, borderRadius: 12, objectFit: 'cover', background: 'white', padding: 4, flexShrink: 0, boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }} />
              ) : (
                <div style={{ width: 64, height: 64, borderRadius: 12, background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Building size={30} color="rgba(255,255,255,0.8)" />
                </div>
              )}

              {/* Tenant info */}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>
                  Condominio
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', lineHeight: 1.2, marginBottom: 6 }}>
                  {tenantData?.razon_social || tenantData?.name || ''}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}>
                  {tenantData?.rfc && (
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)' }}>RFC: {tenantData.rfc}</span>
                  )}
                  {[tenantData?.info_calle, tenantData?.info_num_externo, tenantData?.info_colonia, tenantData?.info_ciudad]
                    .filter(Boolean).join(', ') && (
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)' }}>
                      {[tenantData?.info_calle, tenantData?.info_num_externo, tenantData?.info_colonia, tenantData?.info_ciudad].filter(Boolean).join(', ')}
                    </span>
                  )}
                </div>
              </div>

              {/* Report meta — top right */}
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
                  Período
                </div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#fff', marginBottom: 8 }}>
                  {periodLabel(cutoff)}
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>
                  {unitsCount} unidades · {new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}
                </div>
              </div>
            </div>

            {/* Report title bar */}
            <div style={{
              marginTop: 20,
              paddingTop: 16,
              borderTop: '1px solid rgba(255,255,255,0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <div>
                <span style={{ fontSize: 15, fontWeight: 800, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Reporte General de Conciliación Bancaria
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 11, background: 'rgba(255,255,255,0.15)', color: '#fff', padding: '3px 10px', borderRadius: 20, fontWeight: 600 }}>
                  CONFIDENCIAL
                </span>
              </div>
            </div>
          </div>

          <div className="card-body" style={{ padding: 0 }}>

            {/* SALDO INICIAL (HTML) */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', background: 'var(--blue-50)', borderBottom: '2px solid var(--blue-100)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 20 }}>🏦</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--blue-700)' }}>Saldo Inicial de Banco</div>
                  <div style={{ fontSize: 11, color: 'var(--blue-600)' }}>Acumulado al cierre del período anterior</div>
                </div>
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 600, color: 'var(--blue-700)' }}>{fmt2(saldoInicial)}</div>
            </div>

            {/* INGRESOS CONCILIADOS (HTML) */}
            <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--sand-100)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--teal-500)', flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--teal-700)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Ingresos Conciliados
                </span>
                <span style={{ fontSize: 11, color: 'var(--ink-400)', marginLeft: 'auto' }}>
                  {rd.ingreso_units_count} de {unitsCount} unidades conciliadas
                </span>
              </div>

              {rd.ingreso_mantenimiento > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--sand-50)' }}>
                  <span style={{ fontSize: 13, color: 'var(--ink-600)' }}>Mantenimiento</span>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600, color: 'var(--teal-600)' }}>{fmt2(rd.ingreso_mantenimiento)}</span>
                </div>
              )}

              {rd.ingreso_maint_adelanto > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--sand-50)' }}>
                  <span style={{ fontSize: 13, color: 'var(--ink-500)' }}>
                    Mantenimiento Adelantado
                    <small style={{ fontSize: 11, color: 'var(--ink-400)', marginLeft: 6 }}>(pagos de períodos futuros)</small>
                  </span>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600, color: 'var(--teal-500)' }}>{fmt2(rd.ingreso_maint_adelanto)}</span>
                </div>
              )}

              {Object.entries(rd.ingresos_conceptos || {}).filter(([, obj]) => obj.total > 0).map(([fid, obj]) => (
                <div key={fid} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--sand-50)' }}>
                  <span style={{ fontSize: 13, color: 'var(--ink-600)' }}>{fid === '__prevDebt' ? 'Cobranza de deuda' : (obj.label || fid)}</span>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600, color: 'var(--teal-600)' }}>{fmt2(obj.total)}</span>
                </div>
              ))}

              {rd.ingresos_referenciados > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--sand-50)' }}>
                  <span style={{ fontSize: 13, color: 'var(--purple-500)', fontWeight: 600 }}>
                    Ingresos Referenciados <span style={{ fontWeight: 400, fontSize: 11, color: 'var(--ink-400)' }}>(centavos de identificación)</span>
                  </span>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600, color: 'var(--purple-500)' }}>{fmt2(rd.ingresos_referenciados)}</span>
                </div>
              )}

              {rd.ingresos_no_identificados > 0 && (
                <div style={{ padding: '8px 0', borderBottom: '1px solid var(--sand-50)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, color: 'var(--amber-700)', fontWeight: 600 }}>Ingresos No Identificados</span>
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600, color: 'var(--amber-700)' }}>{fmt2(rd.ingresos_no_identificados)}</span>
                  </div>
                  {(rd.ingresos_no_identificados_list || []).map((ui, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 12px', marginTop: 2 }}>
                      <span style={{ fontSize: 12, color: 'var(--amber-600)' }}>▸ {ui.concept}{ui.bank_reconciled ? ' 🏦' : ''}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--amber-600)' }}>{fmt2(ui.amount)}</span>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', marginTop: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--teal-700)' }}>TOTAL INGRESOS</span>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--teal-700)' }}>{fmt2(rd.total_ingresos_reconciled)}</span>
              </div>
            </div>

            {/* INGRESOS NO CONCILIADOS (HTML) */}
            {rd.ingresos_no_reconciled > 0 && (
              <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--sand-100)', background: 'var(--purple-50)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--purple-500)', flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--purple-500)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Ingresos No Conciliados
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--ink-400)', marginLeft: 'auto' }}>{rd.ingreso_no_recon_count} unidad(es) sin conciliar</span>
                </div>
                {(rd.ingresos_no_recon_details || []).map((nr, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid rgba(124,58,237,0.08)' }}>
                    <div>
                      <span style={{ fontSize: 13, color: 'var(--purple-700)', fontWeight: 600 }}>{nr.unit_id} · {nr.unit_name}</span>
                      {nr.payment_type && <span style={{ fontSize: 10, color: 'var(--purple-400)', marginLeft: 8 }}>{nr.payment_type}</span>}
                      {nr.payment_date && <span style={{ fontSize: 10, color: 'var(--purple-400)', marginLeft: 6 }}>{nr.payment_date}</span>}
                    </div>
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 600, color: 'var(--purple-500)' }}>{fmt2(nr.amount)}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', marginTop: 6, borderTop: '1.5px solid rgba(124,58,237,0.15)' }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--purple-500)' }}>TOTAL INGRESOS NO CONCILIADOS</span>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--purple-500)' }}>{fmt2(rd.ingresos_no_reconciled)}</span>
                </div>
              </div>
            )}

            {/* EGRESOS CONCILIADOS (HTML) */}
            <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--sand-100)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--coral-400)', flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--coral-600)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Egresos Conciliados
                </span>
                <span style={{ fontSize: 11, color: 'var(--ink-400)', marginLeft: 'auto' }}>{rd.egresos_reconciled?.length || 0} concepto(s)</span>
              </div>

              {(rd.egresos_reconciled || []).length === 0 ? (
                <div style={{ padding: '12px 0', color: 'var(--ink-300)', fontSize: 13, textAlign: 'center' }}>Sin egresos conciliados en este período</div>
              ) : (
                (rd.egresos_reconciled || []).map((eg, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--sand-50)' }}>
                    <div>
                      <span style={{ fontSize: 13, color: 'var(--ink-600)' }}>{eg.label}</span>
                      {eg.provider && <span style={{ fontSize: 11, color: 'var(--ink-400)', marginLeft: 8 }}>· {eg.provider}</span>}
                    </div>
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600, color: 'var(--coral-500)' }}>-{fmt2(eg.amount)}</span>
                  </div>
                ))
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', marginTop: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--coral-600)' }}>TOTAL EGRESOS</span>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--coral-500)' }}>-{fmt2(rd.total_egresos_reconciled)}</span>
              </div>
            </div>

            {/* CHEQUES EN TRÁNSITO (HTML) */}
            {((rd.cheques_transito || []).length > 0 || rd.total_cheques_transito > 0) && (
              <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--sand-100)', background: 'var(--amber-50)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--amber-500)', flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--amber-700)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Cheques en Tránsito
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--amber-600)', marginLeft: 'auto' }}>Gastos no conciliados en banco</span>
                </div>
                {(rd.cheques_transito || []).map((ch, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--amber-100)' }}>
                    <div>
                      <span style={{ fontSize: 13, color: 'var(--amber-800)' }}>{ch.label}</span>
                      {ch.provider && <span style={{ fontSize: 11, color: 'var(--amber-600)', marginLeft: 8 }}>· {ch.provider}</span>}
                    </div>
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600, color: 'var(--amber-700)' }}>{fmt2(ch.amount)}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', marginTop: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--amber-700)' }}>TOTAL CHEQUES EN TRÁNSITO</span>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--amber-700)' }}>{fmt2(rd.total_cheques_transito)}</span>
                </div>
              </div>
            )}

            {/* SALDO FINAL (HTML) */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '20px 24px',
              background: saldoFinal >= 0 ? 'linear-gradient(135deg, var(--teal-50), var(--blue-50))' : 'var(--coral-50)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 22 }}>🏦</span>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: saldoFinal >= 0 ? 'var(--teal-700)' : 'var(--coral-600)' }}>Saldo Final del Banco</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>Este saldo es el inicial para {periodLabel(nextPeriod(cutoff))}</div>
                </div>
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700, color: saldoFinal >= 0 ? 'var(--teal-700)' : 'var(--coral-600)' }}>{fmt2(saldoFinal)}</div>
            </div>

            {/* FÓRMULA (HTML) */}
            <div style={{ padding: '14px 24px', background: 'var(--sand-50)', fontSize: 12, color: 'var(--ink-400)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <AlertCircle size={13} />
              <span><strong>Fórmula:</strong> Saldo Inicial ({fmt2(saldoInicial)}) + Ingresos Conciliados ({fmt2(rd.total_ingresos_reconciled)}) − Egresos Conciliados ({fmt2(rd.total_egresos_reconciled)}) = <strong>{fmt2(saldoFinal)}</strong></span>
              {rd.ingresos_no_reconciled > 0 && (
                <div style={{ marginTop: 6, color: 'var(--purple-500)', fontSize: 11 }}>
                  <AlertCircle size={11} style={{ display: 'inline', verticalAlign: -1, marginRight: 4 }} />
                  Existen ingresos no conciliados por {fmt2(rd.ingresos_no_reconciled)} pendientes de verificación bancaria.
                </div>
              )}
              {rd.total_cheques_transito > 0 && (
                <span style={{ color: 'var(--amber-600)' }}> · Cheques en tránsito: {fmt2(rd.total_cheques_transito)} (pendientes de conciliar)</span>
              )}
            </div>

            {/* Footer ejecutivo */}
            <div style={{
              padding: '14px 32px',
              background: '#0f4c75',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: 11,
              color: 'rgba(255,255,255,0.6)',
            }}>
              <span>
                Generado por: <strong style={{ color: 'rgba(255,255,255,0.85)' }}>{user?.name || ''}</strong>
                {role && ROLES[role] ? ` · ${ROLES[role].label}` : ''} · Homly — Powered by Spotynet
              </span>
              <span style={{ color: 'rgba(255,255,255,0.5)' }}>
                {tenantData?.name || ''} · {periodLabel(cutoff)} · {new Date().toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   REPORTE DE ADEUDOS — deuda por unidad con corte de período
   ═══════════════════════════════════════════════════════════ */
function ReporteAdeudosView({ tenantData, adeudosData, adeudosLoading, cutoff, setCutoff, startPeriod }) {
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState({});
  const toggle = (id) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  const units = adeudosData?.units || [];
  const grandTotal = parseFloat(adeudosData?.grand_total_adeudo || 0);
  const unitsWithDebt = adeudosData?.units_with_debt || 0;
  const totalUnits = adeudosData?.total_units || 0;
  const avgDebt = unitsWithDebt > 0 ? grandTotal / unitsWithDebt : 0;

  const filtered = useMemo(() => {
    if (!search) return units;
    const q = search.toLowerCase();
    return units.filter(u =>
      (u.unit?.unit_id_code || '').toLowerCase().includes(q) ||
      (u.unit?.unit_name || '').toLowerCase().includes(q) ||
      (u.unit?.responsible_name || '').toLowerCase().includes(q)
    );
  }, [units, search]);

  const handlePrint = () => {
    const prev = document.title;
    document.title = `Reporte de Adeudos — Corte ${periodLabel(cutoff)} — ${tenantData?.name || ''}`;
    window.print();
    setTimeout(() => { document.title = prev; }, 1500);
  };

  return (
    <div>
      {/* Controls */}
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
        <button
          className="btn btn-outline btn-sm no-print"
          style={{ marginLeft: 'auto' }}
          onClick={handlePrint}
        >
          <Printer size={14} /> Imprimir / PDF
        </button>
      </div>

      {/* KPI Cards */}
      <div className="cob-stats" style={{ marginBottom: 20 }}>
        <div className="cob-stat">
          <div className="cob-stat-icon" style={{ background: 'var(--coral-50)', color: 'var(--coral-500)' }}>
            <AlertCircle size={18} />
          </div>
          <div>
            <div className="cob-stat-label">Unidades con Adeudo</div>
            <div className="cob-stat-value">{unitsWithDebt} / {totalUnits}</div>
          </div>
        </div>
        <div className="cob-stat">
          <div className="cob-stat-icon" style={{ background: 'var(--coral-50)', color: 'var(--coral-400)' }}>
            <TrendingDown size={18} />
          </div>
          <div>
            <div className="cob-stat-label">Adeudo Total</div>
            <div className="cob-stat-value">{fmt(grandTotal)}</div>
          </div>
        </div>
        <div className="cob-stat">
          <div className="cob-stat-icon" style={{ background: 'var(--amber-50)', color: 'var(--amber-500)' }}>
            <DollarSign size={18} />
          </div>
          <div>
            <div className="cob-stat-label">Promedio por Unidad</div>
            <div className="cob-stat-value">{fmt(avgDebt)}</div>
          </div>
        </div>
        <div className="cob-stat">
          <div className="cob-stat-icon" style={{ background: 'var(--blue-50)', color: 'var(--blue-500)' }}>
            <Calendar size={18} />
          </div>
          <div>
            <div className="cob-stat-label">Corte de Período</div>
            <div className="cob-stat-value" style={{ fontSize: 14 }}>{periodLabel(cutoff)}</div>
          </div>
        </div>
      </div>

      {/* Loading */}
      {adeudosLoading && (
        <div style={{ textAlign: 'center', padding: '50px 20px', color: 'var(--ink-400)', fontSize: 14 }}>
          Calculando adeudos…
        </div>
      )}

      {/* Table */}
      {!adeudosLoading && (
        <div className="card">
          <div className="card-head">
            <h3>Unidades con Adeudo</h3>
            <span style={{ fontSize: 12, color: 'var(--ink-400)' }}>
              Corte: {periodLabel(cutoff)} · {filtered.length} unidad(es)
            </span>
          </div>

          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--ink-400)' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>✅</div>
              <div style={{ fontWeight: 600 }}>Sin adeudos al corte seleccionado</div>
              <div style={{ fontSize: 13, marginTop: 6 }}>Todas las unidades están al corriente.</div>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Unidad</th>
                    <th>Responsable</th>
                    <th style={{ textAlign: 'right' }}>Adeudo Anterior</th>
                    <th style={{ textAlign: 'right' }}>Períodos con Deuda</th>
                    <th style={{ textAlign: 'right' }}>Adeudo Total</th>
                    <th style={{ width: 40 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(item => {
                    const u = item.unit || {};
                    const isOpen = !!expanded[u.id];
                    const prevDebt = parseFloat(item.net_prev_debt || 0);
                    const totalAdeudo = parseFloat(item.total_adeudo || 0);
                    const periodDebts = item.period_debts || [];

                    return (
                      <React.Fragment key={u.id}>
                        <tr
                          style={{ cursor: 'pointer', background: isOpen ? 'var(--sand-50)' : undefined }}
                          onClick={() => toggle(u.id)}
                        >
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <div style={{ width: 4, height: 36, borderRadius: 2, background: 'var(--coral-400)', flexShrink: 0 }} />
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
                            <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>
                              {u.occupancy === 'rentado' ? 'Inquilino' : 'Propietario'}
                            </div>
                          </td>
                          <td style={{ textAlign: 'right', fontSize: 13 }}>
                            {prevDebt > 0 ? (
                              <span style={{ color: 'var(--coral-500)', fontWeight: 600 }}>{fmt(prevDebt)}</span>
                            ) : '—'}
                          </td>
                          <td style={{ textAlign: 'right', fontSize: 13 }}>
                            <span className="badge badge-amber">{periodDebts.length}</span>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <span style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--coral-500)' }}>
                              -{fmt(totalAdeudo)}
                            </span>
                          </td>
                          <td style={{ color: 'var(--ink-400)' }}>
                            {isOpen ? <ChevronLeft size={16} style={{ transform: 'rotate(-90deg)' }} /> : <ChevronRight size={16} />}
                          </td>
                        </tr>

                        {/* Expanded detail */}
                        {isOpen && (
                          <tr>
                            <td colSpan={6} style={{ padding: 0, background: 'var(--sand-50)', borderTop: 'none' }}>
                              <div style={{ padding: '12px 24px 16px 24px' }}>
                                <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                                  <thead>
                                    <tr style={{ borderBottom: '1px solid var(--sand-200)' }}>
                                      <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600, color: 'var(--ink-500)', fontSize: 11 }}>Concepto / Período</th>
                                      <th style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 600, color: 'var(--ink-500)', fontSize: 11 }}>Cargo</th>
                                      <th style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 600, color: 'var(--ink-500)', fontSize: 11 }}>Abonado</th>
                                      <th style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 600, color: 'var(--ink-500)', fontSize: 11 }}>Déficit</th>
                                      <th style={{ textAlign: 'center', padding: '6px 8px', fontWeight: 600, color: 'var(--ink-500)', fontSize: 11 }}>Estado</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {/* Previous debt row */}
                                    {prevDebt > 0 && (
                                      <tr style={{ background: 'var(--coral-50)' }}>
                                        <td style={{ padding: '6px 8px', color: 'var(--coral-600)', fontWeight: 600, fontStyle: 'italic' }}>
                                          <AlertCircle size={12} style={{ display: 'inline', verticalAlign: -1, marginRight: 4 }} />
                                          Adeudo Anterior
                                          {parseFloat(item.prev_debt_adeudo || 0) > 0 && (
                                            <span style={{ fontSize: 11, color: 'var(--teal-600)', fontStyle: 'normal', marginLeft: 6 }}>
                                              (Abonado: {fmt(item.prev_debt_adeudo)})
                                            </span>
                                          )}
                                        </td>
                                        <td style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--coral-500)' }}>—</td>
                                        <td style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--coral-500)' }}>—</td>
                                        <td style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 700, color: 'var(--coral-500)' }}>{fmt(prevDebt)}</td>
                                        <td style={{ textAlign: 'center', padding: '6px 8px' }}>
                                          <span className="badge badge-coral">Pendiente</span>
                                        </td>
                                      </tr>
                                    )}
                                    {/* Period debt rows */}
                                    {periodDebts.map((pd, idx) => (
                                      <tr key={idx} style={{ borderBottom: '1px solid var(--sand-100)' }}>
                                        <td style={{ padding: '6px 8px', fontWeight: 600 }}>{periodLabel(pd.period)}</td>
                                        <td style={{ textAlign: 'right', padding: '6px 8px' }}>{fmt(pd.charge)}</td>
                                        <td style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--teal-600)' }}>
                                          {pd.paid > 0 ? fmt(pd.paid) : '—'}
                                        </td>
                                        <td style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 700, color: 'var(--coral-500)' }}>
                                          {fmt(pd.deficit)}
                                        </td>
                                        <td style={{ textAlign: 'center', padding: '6px 8px' }}>
                                          <span className={`badge ${statusClass(pd.status)}`}>{statusLabel(pd.status)}</span>
                                        </td>
                                      </tr>
                                    ))}
                                    {/* Total row */}
                                    <tr style={{ borderTop: '2px solid var(--coral-200)', background: 'var(--coral-50)' }}>
                                      <td colSpan={3} style={{ padding: '8px 8px', fontWeight: 700, color: 'var(--coral-700)', fontSize: 12 }}>
                                        Total Adeudo — {u.unit_name}
                                      </td>
                                      <td style={{ textAlign: 'right', padding: '8px 8px', fontWeight: 800, color: 'var(--coral-600)', fontSize: 15, fontFamily: 'var(--font-display)' }}>
                                        -{fmt(totalAdeudo)}
                                      </td>
                                      <td />
                                    </tr>
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
                {/* Grand total footer */}
                <tfoot>
                  <tr style={{ background: '#1e3a5f', color: 'white' }}>
                    <td colSpan={4} style={{ padding: '12px 16px', fontWeight: 700, fontSize: 13 }}>
                      Total General de Adeudos · {unitsWithDebt} unidad(es)
                    </td>
                    <td style={{ textAlign: 'right', padding: '12px 16px', fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 800 }}>
                      -{fmt(grandTotal)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
