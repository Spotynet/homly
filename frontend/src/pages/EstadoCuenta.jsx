import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { unitsAPI, reportsAPI } from '../api/client';
import { fmtCurrency, statusClass, statusLabel, fmtDate, periodLabel } from '../utils/helpers';
import { Search, ChevronLeft, LayoutGrid, AlignJustify } from 'lucide-react';

function fmt(n) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n ?? 0);
}

export default function EstadoCuenta() {
  const { tenantId, isVecino, user } = useAuth();
  const [units, setUnits] = useState([]);
  const [selectedUnit, setSelectedUnit] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [view, setView] = useState('grid'); // 'grid' | 'general'
  const [generalData, setGeneralData] = useState(null);
  const [genLoading, setGenLoading] = useState(false);

  // Load units
  useEffect(() => {
    if (!tenantId) return;
    unitsAPI.list(tenantId).then(r => {
      const list = r.data.results || r.data;
      setUnits(list);
      // If vecino, auto-select their unit
      if (isVecino && user?.unit_id) {
        setSelectedUnit(user.unit_id);
      }
    });
  }, [tenantId, isVecino, user]);

  // Load unit detail
  useEffect(() => {
    if (!selectedUnit || !tenantId) return;
    setLoading(true);
    reportsAPI.estadoCuenta(tenantId, { unit_id: selectedUnit })
      .then(r => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [selectedUnit, tenantId]);

  // Load general report
  useEffect(() => {
    if (view !== 'general' || !tenantId) return;
    setGenLoading(true);
    reportsAPI.reporteGeneral(tenantId).then(r => {
      setGeneralData(r.data);
    }).catch(() => {}).finally(() => setGenLoading(false));
  }, [view, tenantId]);

  const filteredUnits = useMemo(() => {
    if (!search) return units;
    const q = search.toLowerCase();
    return units.filter(u =>
      u.unit_id_code?.toLowerCase().includes(q) ||
      u.unit_name?.toLowerCase().includes(q) ||
      (u.responsible_name || '').toLowerCase().includes(q)
    );
  }, [units, search]);

  // ── If vecino and unit selected, jump straight to detail ──
  const showDetail = isVecino ? true : !!selectedUnit;
  const balance = data ? parseFloat(data.balance) : 0;

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1300, margin: '0 auto' }} className="content-fade">
      {/* ── Header ── */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 500, marginBottom: 4 }}>
          Estado de Cuenta<span className="brand-dot">.</span>
        </h1>
        <p style={{ color: 'var(--ink-400)', fontSize: 14 }}>
          {isVecino ? 'Tu cuenta corriente' : 'Resumen de adeudos y abonos por unidad'}
        </p>
      </div>

      {/* View toggle (admins only) */}
      {!isVecino && (
        <div className="ec-view-toggle">
          <button className={`ec-view-btn ${view === 'grid' ? 'active' : ''}`} onClick={() => { setView('grid'); setSelectedUnit(null); }}>
            <LayoutGrid size={14} /> Por Unidad
          </button>
          <button className={`ec-view-btn ${view === 'general' ? 'active' : ''}`} onClick={() => { setView('general'); setSelectedUnit(null); }}>
            <AlignJustify size={14} /> Reporte General
          </button>
        </div>
      )}

      {/* ════════════════════════ UNIT DETAIL VIEW ════════════════════════ */}
      {showDetail && selectedUnit ? (
        <div className="card content-fade">
          {/* Dark header */}
          <div className="ec-detail-header">
            <div>
              <div className="ec-detail-title">
                {data?.unit?.unit_id_code} {data?.unit?.unit_name || '…'}
              </div>
              <div className="ec-detail-sub">{data?.unit?.responsible_name}</div>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              {!isVecino && (
                <button
                  className="btn btn-outline btn-sm"
                  style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.3)', color: 'white' }}
                  onClick={() => setSelectedUnit(null)}
                >
                  <ChevronLeft size={14} /> Volver
                </button>
              )}
            </div>
          </div>

          {/* Summary strip */}
          {data && (
            <div className="ec-summary-strip">
              <div className="ec-sum-cell">
                <div className="ec-sum-label">Total Cargos</div>
                <div className="ec-sum-val">{fmt(data.total_charges)}</div>
              </div>
              <div className="ec-sum-cell">
                <div className="ec-sum-label">Total Abonado</div>
                <div className="ec-sum-val ok">{fmt(data.total_payments)}</div>
              </div>
              <div className="ec-sum-cell">
                <div className="ec-sum-label">Saldo</div>
                <div className={`ec-sum-val ${balance > 0 ? 'debt' : 'ok'}`}>{fmt(balance)}</div>
              </div>
              <div className="ec-sum-cell">
                <div className="ec-sum-label">Períodos</div>
                <div className="ec-sum-val">{data.periods?.length || 0}</div>
              </div>
            </div>
          )}

          {loading && <div style={{ textAlign: 'center', padding: '50px 20px', color: 'var(--ink-400)', fontSize: 14 }}>Cargando estado de cuenta…</div>}

          {data && !loading && (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Período</th>
                    <th style={{ textAlign: 'right' }}>Cargo</th>
                    <th style={{ textAlign: 'right' }}>Abonado</th>
                    <th style={{ textAlign: 'right' }}>Saldo</th>
                    <th>Estado</th>
                    <th>Forma de Pago</th>
                    <th>Fecha</th>
                    <th>Notas</th>
                  </tr>
                </thead>
                <tbody>
                  {data.periods.map((p, i) => {
                    const rowBalance = parseFloat(p.charge) - parseFloat(p.paid);
                    return (
                      <tr key={i} className={rowBalance > 0.5 ? 'period-row-debt' : 'period-row-ok'}>
                        <td style={{ fontWeight: 700, fontSize: 13 }}>{periodLabel(p.period)}</td>
                        <td style={{ textAlign: 'right', fontSize: 13 }}>{fmt(p.charge)}</td>
                        <td style={{ textAlign: 'right', fontSize: 13 }} className="credit-cell">{fmt(p.paid)}</td>
                        <td style={{ textAlign: 'right', fontSize: 13 }} className={rowBalance > 0.5 ? 'debt-cell' : 'credit-cell'}>
                          {fmt(rowBalance)}
                        </td>
                        <td><span className={`badge ${statusClass(p.status)}`}>{statusLabel(p.status)}</span></td>
                        <td style={{ fontSize: 12 }}>{p.payment_type || '—'}</td>
                        <td style={{ fontSize: 12 }}>{fmtDate(p.payment_date)}</td>
                        <td style={{ fontSize: 12, color: 'var(--ink-400)', maxWidth: 160 }}>{p.notes || '—'}</td>
                      </tr>
                    );
                  })}
                  {data.periods.length === 0 && (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--ink-300)', fontSize: 14 }}>
                        Sin registros de pago
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* ════════════════════════ GRID VIEW ════════════════════════ */}
          {view === 'grid' && !isVecino && (
            <>
              {/* Search */}
              <div style={{ position: 'relative', marginBottom: 20, maxWidth: 360 }}>
                <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-400)' }} />
                <input
                  className="field-input"
                  style={{ paddingLeft: 36 }}
                  placeholder="Buscar unidad, ID o responsable…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>

              <div className="ec-unit-grid">
                {filteredUnits.map(u => {
                  // We don't have balance in unit list; color is decorative unless we load detail
                  return (
                    <div
                      key={u.id}
                      className={`ec-unit-card ${selectedUnit === u.id ? 'selected' : ''}`}
                      onClick={() => setSelectedUnit(u.id)}
                    >
                      <div className="ec-unit-card-bar ok" />
                      <div style={{ marginTop: 6 }}>
                        <span className="ec-unit-id">{u.unit_id_code}</span>
                        <div className="ec-unit-name">{u.unit_name}</div>
                        <div className="ec-unit-person">{u.responsible_name || 'Sin responsable'}</div>
                        {u.occupancy && (
                          <span className={`badge ${u.occupancy === 'habitada' ? 'badge-teal' : u.occupancy === 'rentada' ? 'badge-amber' : 'badge-gray'}`} style={{ fontSize: 11 }}>
                            {u.occupancy}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
                {filteredUnits.length === 0 && (
                  <div className="empty" style={{ gridColumn: '1/-1' }}>
                    <div className="empty-icon">🔍</div>
                    <h4>Sin resultados</h4>
                    <p>No se encontraron unidades con "{search}"</p>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ════════════════════════ GENERAL REPORT ════════════════════════ */}
          {view === 'general' && (
            <div className="card content-fade">
              <div className="card-head"><h3>Reporte General</h3></div>
              {genLoading && <div style={{ textAlign: 'center', padding: 40, color: 'var(--ink-400)' }}>Cargando…</div>}
              {!genLoading && generalData && (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Unidad</th>
                        <th>Responsable</th>
                        {(generalData.fields || []).map(f => (
                          <th key={f} style={{ textAlign: 'right' }}>{f}</th>
                        ))}
                        <th style={{ textAlign: 'right' }}>Total Cargos</th>
                        <th style={{ textAlign: 'right' }}>Total Pagado</th>
                        <th style={{ textAlign: 'right' }}>Saldo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(generalData.units || []).map((u, i) => {
                        const bal = parseFloat(u.total_charges || 0) - parseFloat(u.total_payments || 0);
                        return (
                          <tr key={i} className={bal > 0.5 ? 'period-row-debt' : ''}>
                            <td>
                              <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--teal-600)', background: 'var(--teal-50)', padding: '2px 8px', borderRadius: 6, fontSize: 12, marginRight: 6 }}>
                                {u.unit_id_code}
                              </span>
                              <span style={{ fontWeight: 600, fontSize: 13 }}>{u.unit_name}</span>
                            </td>
                            <td style={{ fontSize: 13, color: 'var(--ink-500)' }}>{u.responsible_name}</td>
                            {(generalData.fields || []).map(f => (
                              <td key={f} style={{ textAlign: 'right', fontSize: 13 }}>{fmt(u.field_totals?.[f] || 0)}</td>
                            ))}
                            <td style={{ textAlign: 'right', fontSize: 13 }}>{fmt(u.total_charges)}</td>
                            <td style={{ textAlign: 'right', fontSize: 13 }} className="credit-cell">{fmt(u.total_payments)}</td>
                            <td style={{ textAlign: 'right', fontSize: 13 }} className={bal > 0.5 ? 'debt-cell' : 'credit-cell'}>{fmt(bal)}</td>
                          </tr>
                        );
                      })}
                      {(!generalData.units || generalData.units.length === 0) && (
                        <tr><td colSpan={10} style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--ink-300)' }}>Sin datos</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
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
