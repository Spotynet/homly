import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { paymentsAPI, unitsAPI, extraFieldsAPI, tenantsAPI } from '../api/client';
import { todayPeriod, periodLabel, prevPeriod, nextPeriod, fmtCurrency, statusClass, statusLabel, PAYMENT_TYPES, fmtDate } from '../utils/helpers';
import { ChevronLeft, ChevronRight, Search, Receipt, X, Users, CheckCircle, Clock, AlertCircle, DollarSign } from 'lucide-react';
import toast from 'react-hot-toast';

function fmt(n) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n ?? 0);
}

function DeltaTag({ charge, received }) {
  const c = parseFloat(charge) || 0;
  const r = parseFloat(received) || 0;
  if (!r) return <span style={{ fontSize: 11, color: 'var(--ink-300)' }}>—</span>;
  if (r >= c) return <span style={{ fontSize: 11, color: 'var(--teal-600)', fontWeight: 700 }}>✓ Completo</span>;
  return <span style={{ fontSize: 11, color: 'var(--amber-600)', fontWeight: 700 }}>Parcial {fmt(r - c)}</span>;
}

export default function Cobranza() {
  const { tenantId, isReadOnly } = useAuth();
  const [period, setPeriod] = useState(todayPeriod());
  const [units, setUnits] = useState([]);
  const [payments, setPayments] = useState([]);
  const [extraFields, setExtraFields] = useState([]);
  const [tenantData, setTenantData] = useState(null);
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(1);
  const [showCapture, setShowCapture] = useState(null);
  const [captureForm, setCaptureForm] = useState({});
  const [saving, setSaving] = useState(false);
  const perPage = 25;

  const load = async () => {
    if (!tenantId) return;
    try {
      const [uRes, pRes, efRes, tRes] = await Promise.all([
        unitsAPI.list(tenantId),
        paymentsAPI.list(tenantId, { period }),
        extraFieldsAPI.list(tenantId),
        tenantsAPI.get(tenantId).catch(() => ({ data: null })),
      ]);
      setUnits(uRes.data.results || uRes.data);
      setPayments(pRes.data.results || pRes.data);
      setExtraFields((efRes.data.results || efRes.data).filter(f => f.enabled));
      setTenantData(tRes.data);
    } catch (err) { console.error(err); }
  };

  useEffect(() => { load(); }, [tenantId, period]);

  const paymentMap = useMemo(() => {
    const m = {};
    payments.forEach(p => { m[p.unit] = p; });
    return m;
  }, [payments]);

  // ── Stats ──────────────────────────────────────
  const stats = useMemo(() => {
    const total = units.length;
    let paid = 0, partial = 0, pending = 0, recaudo = 0;
    units.forEach(u => {
      const p = paymentMap[u.id];
      const st = p?.status || 'pendiente';
      if (st === 'pagado') paid++;
      else if (st === 'parcial') partial++;
      else pending++;
      if (p?.field_payments) {
        recaudo += p.field_payments.reduce((s, f) => s + parseFloat(f.received || 0), 0);
      }
    });
    const paidPct = total > 0 ? (paid / total) * 100 : 0;
    return { total, paid, partial, pending, recaudo, paidPct };
  }, [units, paymentMap]);

  const maintenanceFee = parseFloat(tenantData?.maintenance_fee) || 0;

  const filtered = useMemo(() => {
    if (!filter) return units;
    const q = filter.toLowerCase();
    return units.filter(u =>
      u.unit_id_code.toLowerCase().includes(q) ||
      u.unit_name.toLowerCase().includes(q) ||
      (u.responsible_name || '').toLowerCase().includes(q)
    );
  }, [units, filter]);

  const totalPages = Math.ceil(filtered.length / perPage);
  const paged = filtered.slice((page - 1) * perPage, page * perPage);

  const openCapture = (unit) => {
    const existing = paymentMap[unit.id];
    const fp = {};
    if (existing?.field_payments) {
      existing.field_payments.forEach(f => { fp[f.field_key] = f.received; });
    }
    setCaptureForm({
      unit_id: unit.id,
      period,
      payment_type: existing?.payment_type || '',
      payment_date: existing?.payment_date || new Date().toISOString().slice(0, 10),
      folio: existing?.folio || '',
      notes: existing?.notes || '',
      field_payments: {
        maintenance: { received: fp.maintenance || '' },
        ...Object.fromEntries(extraFields.map(ef => [ef.id, { received: fp[ef.id] || '' }])),
      },
    });
    setShowCapture(unit);
  };

  const setReceived = (key, val) => {
    setCaptureForm(prev => ({
      ...prev,
      field_payments: { ...prev.field_payments, [key]: { received: val } }
    }));
  };

  const handleCapture = async () => {
    if (!captureForm.payment_type) { toast.error('La forma de pago es obligatoria'); return; }
    setSaving(true);
    try {
      await paymentsAPI.capture(tenantId, captureForm);
      toast.success('Pago registrado');
      setShowCapture(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al registrar pago');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1300, margin: '0 auto' }} className="content-fade">
      {/* ── Header ── */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 500, marginBottom: 4 }}>
          Cobranza<span className="brand-dot">.</span>
        </h1>
        <p style={{ color: 'var(--ink-400)', fontSize: 14 }}>{periodLabel(period)}</p>
      </div>

      {/* ── Period + Search ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div className="period-nav">
          <button className="period-nav-btn" onClick={() => { setPeriod(prevPeriod(period)); setPage(1); }}>
            <ChevronLeft size={16} />
          </button>
          <div className="period-label" style={{ fontSize: 14 }}>{periodLabel(period)}</div>
          <button className="period-nav-btn" onClick={() => { setPeriod(nextPeriod(period)); setPage(1); }}>
            <ChevronRight size={16} />
          </button>
        </div>
        <div style={{ flex: 1, minWidth: 220, position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-400)' }} />
          <input
            className="field-input"
            style={{ paddingLeft: 34 }}
            placeholder="Filtrar por unidad, ID o responsable..."
            value={filter}
            onChange={e => { setFilter(e.target.value); setPage(1); }}
          />
        </div>
      </div>

      {/* ── Stat cards ── */}
      <div className="cob-stats">
        <div className="cob-stat">
          <div className="cob-stat-icon stat-icon ink"><Users size={16} /></div>
          <div>
            <div className="cob-stat-label">Total Unidades</div>
            <div className="cob-stat-value">{stats.total}</div>
          </div>
        </div>
        <div className="cob-stat">
          <div className="cob-stat-icon stat-icon teal"><CheckCircle size={16} /></div>
          <div>
            <div className="cob-stat-label">Pagadas</div>
            <div className="cob-stat-value" style={{ color: 'var(--teal-600)' }}>{stats.paid}</div>
          </div>
        </div>
        <div className="cob-stat">
          <div className="cob-stat-icon stat-icon amber"><Clock size={16} /></div>
          <div>
            <div className="cob-stat-label">Parciales</div>
            <div className="cob-stat-value" style={{ color: 'var(--amber-600)' }}>{stats.partial}</div>
          </div>
        </div>
        <div className="cob-stat">
          <div className="cob-stat-icon stat-icon coral"><AlertCircle size={16} /></div>
          <div>
            <div className="cob-stat-label">Pendientes</div>
            <div className="cob-stat-value" style={{ color: 'var(--coral-500)' }}>{stats.pending}</div>
          </div>
        </div>
        <div className="cob-stat">
          <div className="cob-stat-icon stat-icon teal"><DollarSign size={16} /></div>
          <div>
            <div className="cob-stat-label">Recaudo Total</div>
            <div className="cob-stat-value" style={{ fontSize: 17 }}>{fmt(stats.recaudo)}</div>
          </div>
        </div>
      </div>

      {/* ── Progress bar ── */}
      <div style={{ background: 'var(--white)', border: '1px solid var(--sand-100)', borderRadius: 'var(--radius-lg)', padding: '16px 22px', marginBottom: 22 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-600)' }}>
            Avance de Cobranza
          </span>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--teal-600)' }}>
            {stats.paid} / {stats.total} unidades pagadas ({stats.paidPct.toFixed(0)}%)
          </span>
        </div>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${stats.paidPct}%` }} />
        </div>
      </div>

      {/* ── Table ── */}
      <div className="card">
        <div className="card-head">
          <h3>Registro de Pagos — {periodLabel(period)}</h3>
          <span className="badge badge-gray">{units.length} unidades</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Unidad</th>
                <th>Responsable</th>
                <th style={{ textAlign: 'right' }}>Mantenimiento</th>
                {extraFields.filter(f => f.required).map(f => (
                  <th key={f.id} style={{ textAlign: 'right' }}>{f.label} <span style={{ color: 'var(--coral-400)' }}>★</span></th>
                ))}
                <th style={{ textAlign: 'right' }}>Recaudo</th>
                <th>Estado</th>
                <th>Forma de Pago</th>
                <th>Fecha</th>
                <th>Folio / Notas</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {paged.map(u => {
                const pay = paymentMap[u.id];
                const st = pay?.status || 'pendiente';
                const totalRec = pay?.field_payments?.reduce((s, f) => s + parseFloat(f.received || 0), 0) || 0;
                return (
                  <tr key={u.id}>
                    <td>
                      <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--teal-600)', background: 'var(--teal-50)', padding: '2px 8px', borderRadius: 6, fontSize: 12, marginRight: 6 }}>
                        {u.unit_id_code}
                      </span>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{u.unit_name}</span>
                    </td>
                    <td style={{ fontSize: 13, color: 'var(--ink-500)' }}>{u.responsible_name || '—'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600, fontSize: 13 }}>
                      {pay?.field_payments ? fmt(pay.field_payments.find(f => f.field_key === 'maintenance')?.received || 0) : '—'}
                    </td>
                    {extraFields.filter(f => f.required).map(ef => {
                      const fp = pay?.field_payments?.find(f => f.field_key === ef.id);
                      return <td key={ef.id} style={{ textAlign: 'right', fontSize: 13 }}>{fp ? fmt(fp.received) : '—'}</td>;
                    })}
                    <td style={{ textAlign: 'right', fontWeight: 700, fontSize: 13, color: 'var(--teal-700)' }}>
                      {pay ? fmt(totalRec) : '—'}
                    </td>
                    <td>
                      <span className={`badge ${statusClass(st)}`}>{statusLabel(st)}</span>
                    </td>
                    <td style={{ fontSize: 12 }}>{pay?.payment_type ? (PAYMENT_TYPES[pay.payment_type]?.label || pay.payment_type) : '—'}</td>
                    <td style={{ fontSize: 12 }}>{fmtDate(pay?.payment_date)}</td>
                    <td style={{ fontSize: 12, color: 'var(--ink-400)', maxWidth: 160 }}>
                      {pay?.folio && <span style={{ fontFamily: 'monospace', marginRight: 4 }}>{pay.folio}</span>}
                      {pay?.notes && <span title={pay.notes}>{pay.notes.length > 30 ? pay.notes.slice(0, 30) + '…' : pay.notes}</span>}
                    </td>
                    <td>
                      {!isReadOnly && (
                        <button className="btn btn-primary btn-sm" onClick={() => openCapture(u)}>
                          <Receipt size={12} /> {pay ? 'Editar' : 'Capturar'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {paged.length === 0 && (
                <tr><td colSpan={10 + extraFields.filter(f => f.required).length} style={{ textAlign: 'center', padding: 40, color: 'var(--ink-300)', fontSize: 14 }}>Sin resultados</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="pag-bar">
            <span>{filtered.length} unidades</span>
            <div className="pag-btns">
              <button className="pag-btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>‹</button>
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => i + 1).map(p => (
                <button key={p} className={`pag-btn ${p === page ? 'active' : ''}`} onClick={() => setPage(p)}>{p}</button>
              ))}
              <button className="pag-btn" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>›</button>
            </div>
            <span>Pág. {page} / {totalPages}</span>
          </div>
        )}
      </div>

      {/* ── Capture Modal ── */}
      {showCapture && (
        <div className="modal-overlay" onClick={() => setShowCapture(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3 style={{ fontWeight: 700, fontSize: 17 }}>
                  Capturar Pago
                </h3>
                <p style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: 2 }}>
                  {showCapture.unit_id_code} · {showCapture.unit_name} · {periodLabel(period)}
                </p>
              </div>
              <button className="btn-icon" onClick={() => setShowCapture(null)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              {/* Payment meta */}
              <div className="grid-2" style={{ marginBottom: 20 }}>
                <div className="field">
                  <label className="field-label">Forma de Pago <span style={{ color: 'var(--coral-500)' }}>*</span></label>
                  <select className="field-select" value={captureForm.payment_type}
                    onChange={e => setCaptureForm({ ...captureForm, payment_type: e.target.value })}>
                    <option value="">Seleccionar...</option>
                    {Object.entries(PAYMENT_TYPES).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label className="field-label">Fecha de Pago</label>
                  <input type="date" className="field-input" value={captureForm.payment_date}
                    onChange={e => setCaptureForm({ ...captureForm, payment_date: e.target.value })} />
                </div>
              </div>

              {/* Per-concept rows */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px 12px', marginBottom: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-400)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Concepto</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-400)', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'right' }}>Cargo</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-400)', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'right' }}>Recibido</span>
                </div>
                <div style={{ borderTop: '1px solid var(--sand-100)', paddingTop: 10 }}>
                  {/* Maintenance row */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px 12px', alignItems: 'center', paddingBottom: 10, borderBottom: '1px solid var(--sand-50)' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-800)' }}>Mantenimiento</div>
                      <DeltaTag charge={maintenanceFee} received={captureForm.field_payments?.maintenance?.received} />
                    </div>
                    <div style={{ textAlign: 'right', fontSize: 13, color: 'var(--ink-400)' }}>{fmt(maintenanceFee)}</div>
                    <div>
                      <input type="number" className="field-input" style={{ textAlign: 'right' }}
                        placeholder={maintenanceFee.toFixed(2)}
                        value={captureForm.field_payments?.maintenance?.received || ''}
                        onChange={e => setReceived('maintenance', e.target.value)} />
                    </div>
                  </div>

                  {/* Extra fields rows */}
                  {extraFields.map(ef => (
                    <div key={ef.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px 12px', alignItems: 'center', paddingTop: 10, paddingBottom: 10, borderBottom: '1px solid var(--sand-50)' }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-800)' }}>
                          {ef.label}
                          {ef.required && <span style={{ color: 'var(--coral-400)', marginLeft: 4 }}>★</span>}
                          {!ef.required && <span style={{ fontSize: 10, color: 'var(--ink-300)', marginLeft: 4 }}>opcional</span>}
                        </div>
                        <DeltaTag charge={ef.default_amount} received={captureForm.field_payments?.[ef.id]?.received} />
                      </div>
                      <div style={{ textAlign: 'right', fontSize: 13, color: 'var(--ink-400)' }}>{fmt(ef.default_amount)}</div>
                      <div>
                        <input type="number" className="field-input" style={{ textAlign: 'right' }}
                          placeholder={(parseFloat(ef.default_amount) || 0).toFixed(2)}
                          value={captureForm.field_payments?.[ef.id]?.received || ''}
                          onChange={e => setReceived(ef.id, e.target.value)} />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Total row */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 16, paddingTop: 10 }}>
                  <span style={{ fontSize: 13, color: 'var(--ink-500)' }}>Total recibido:</span>
                  <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--teal-700)', fontFamily: 'var(--font-display)' }}>
                    {fmt(
                      (parseFloat(captureForm.field_payments?.maintenance?.received) || 0) +
                      extraFields.reduce((s, ef) => s + (parseFloat(captureForm.field_payments?.[ef.id]?.received) || 0), 0)
                    )}
                  </span>
                </div>
              </div>

              {/* Folio + Notes */}
              <div className="grid-2" style={{ marginBottom: 4 }}>
                <div className="field">
                  <label className="field-label">Folio / Referencia</label>
                  <input className="field-input" placeholder="Número de referencia..."
                    value={captureForm.folio || ''}
                    onChange={e => setCaptureForm({ ...captureForm, folio: e.target.value })} />
                </div>
                <div className="field">
                  <label className="field-label">Notas</label>
                  <input className="field-input" placeholder="Observaciones..."
                    value={captureForm.notes || ''}
                    onChange={e => setCaptureForm({ ...captureForm, notes: e.target.value })} />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowCapture(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleCapture} disabled={saving}>
                {saving ? 'Guardando…' : 'Guardar Pago'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
