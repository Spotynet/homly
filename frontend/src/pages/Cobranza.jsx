import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { paymentsAPI, unitsAPI, extraFieldsAPI, tenantsAPI } from '../api/client';
import { todayPeriod, periodLabel, prevPeriod, nextPeriod, tenantStartPeriod, fmtCurrency, statusClass, statusLabel, PAYMENT_TYPES, fmtDate, ROLES, CURRENCIES, APP_VERSION } from '../utils/helpers';
import { ChevronLeft, ChevronRight, Search, Receipt, X, Users, CheckCircle, Clock, AlertCircle, DollarSign, Calendar, Building2, Upload, FileText, Check, Printer } from 'lucide-react';
import toast from 'react-hot-toast';

function fmt(n) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n ?? 0);
}

// Receipt format: symbol + toLocaleString (matches HTML exactly)
function receiptFmt(n, currency = 'MXN') {
  const c = CURRENCIES[currency] || CURRENCIES.MXN;
  return c.symbol + (parseFloat(n) || 0).toLocaleString('es-MX');
}

// Receipt status badge (matches HTML statusBadge exactly)
function receiptStatusBadge(status) {
  const map = {
    pagado: { cls: 'badge-teal', si: 'si-pagado', label: 'Pagado' },
    parcial: { cls: 'badge-amber', si: 'si-parcial', label: 'Parcial' },
    pendiente: { cls: 'badge-gray', si: 'si-pendiente', label: 'Pendiente' },
  };
  const s = map[status] || map.pendiente;
  return (
    <span className={`badge ${s.cls}`}>
      <span className={`status-indicator ${s.si}`} /> {s.label}
    </span>
  );
}

// Future periods for adelantos (next N periods after fromPeriod)
function futurePeriods(fromPeriod, count = 12) {
  const out = [];
  let p = nextPeriod(fromPeriod);
  for (let i = 0; i < count; i++) {
    out.push(p);
    p = nextPeriod(p);
  }
  return out;
}

// Past periods between start and end (inclusive)
function periodsBetween(startPeriod, endPeriod) {
  const out = [];
  let p = startPeriod;
  while (p <= endPeriod) {
    out.push(p);
    p = nextPeriod(p);
  }
  return out;
}

export default function Cobranza() {
  const { tenantId, isReadOnly, user } = useAuth();
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
  const [showReceipt, setShowReceipt] = useState(null); // { unit, pay }
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
      setExtraFields((efRes.data.results || efRes.data).filter(f => f.enabled && (!f.field_type || f.field_type === 'normal')));
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
      existing.field_payments.forEach(f => {
        const tid = f.target_unit;
        fp[f.field_key] = {
          received: f.received,
          targetUnitId: (typeof tid === 'object' ? tid?.id : tid) || null,
          adelantoTargets: f.adelanto_targets || {},
        };
      });
    }
    // Build field_payments for all fields
    const fieldPayments = {
      maintenance: fp.maintenance || { received: '', targetUnitId: null, adelantoTargets: {} },
      ...Object.fromEntries(extraFields.map(ef => [
        ef.id,
        fp[ef.id] || { received: '', targetUnitId: null, adelantoTargets: {} },
      ])),
    };
    // Normalize received to string for inputs
    Object.keys(fieldPayments).forEach(k => {
      const v = fieldPayments[k];
      if (typeof v === 'object' && v !== null && v.received !== undefined) {
        fieldPayments[k] = { ...v, received: v.received ?? '' };
      }
    });
    setCaptureForm({
      unit_id: unit.id,
      period,
      payment_type: existing?.payment_type || '',
      payment_date: existing?.payment_date || new Date().toISOString().slice(0, 10),
      notes: existing?.notes || '',
      evidence: existing?.evidence || '',
      evidenceFileName: '',
      field_payments: fieldPayments,
      adeudo_payments: existing?.adeudo_payments || {},
      showAdelantoPanel: false,
      showAdeudoPanel: false,
      showPreview: false,
    });
    setShowCapture(unit);
  };

  const setReceived = (key, val) => {
    setCaptureForm(prev => ({
      ...prev,
      field_payments: {
        ...prev.field_payments,
        [key]: { ...(prev.field_payments?.[key] || {}), received: val },
      },
    }));
  };

  const setFieldTargetUnit = (key, unitId) => {
    setCaptureForm(prev => ({
      ...prev,
      field_payments: {
        ...prev.field_payments,
        [key]: { ...(prev.field_payments?.[key] || {}), targetUnitId: unitId || null },
      },
    }));
  };

  const toggleAdelanto = (fieldKey, targetPeriod, charge) => {
    setCaptureForm(prev => {
      const fp = prev.field_payments?.[fieldKey] || {};
      const targets = { ...(fp.adelantoTargets || {}) };
      if (targets[targetPeriod] != null) {
        delete targets[targetPeriod];
      } else {
        targets[targetPeriod] = parseFloat(charge) || 0;
      }
      return {
        ...prev,
        field_payments: {
          ...prev.field_payments,
          [fieldKey]: { ...fp, adelantoTargets: targets },
        },
      };
    });
  };

  const setAdeudoSelection = (period, fieldKey, amount) => {
    setCaptureForm(prev => {
      const ap = { ...(prev.adeudo_payments || {}) };
      if (!ap[period]) ap[period] = {};
      if (amount === 0 || amount === '' || amount === null) {
        delete ap[period][fieldKey];
        if (Object.keys(ap[period]).length === 0) delete ap[period];
      } else {
        ap[period][fieldKey] = parseFloat(amount) || 0;
      }
      return { ...prev, adeudo_payments: ap };
    });
  };

  const toggleAdeudoPeriod = (period) => {
    setCaptureForm(prev => {
      const sel = prev.adeudoSelections || {};
      const has = !!sel[period];
      const newSel = { ...sel };
      if (has) delete newSel[period];
      else newSel[period] = {};
      return { ...prev, adeudoSelections: newSel };
    });
  };

  const handleEvidence = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error('Máximo 5 MB'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result?.split(',')[1] || '';
      setCaptureForm(p => ({ ...p, evidence: base64, evidenceFileName: file.name, showPreview: false }));
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const buildCapturePayload = () => {
    const fp = {};
    const allKeys = ['maintenance', ...extraFields.map(ef => ef.id)];
    allKeys.forEach(k => {
      const v = captureForm.field_payments?.[k];
      const rec = parseFloat(v?.received) || 0;
      const targets = v?.adelantoTargets && Object.keys(v.adelantoTargets).length ? v.adelantoTargets : undefined;
      const targetUnit = v?.targetUnitId || undefined;
      fp[k] = {
        received: rec,
        ...(targetUnit && { targetUnitId: targetUnit }),
        ...(targets && { adelantoTargets: targets }),
      };
    });
    return {
      unit_id: captureForm.unit_id,
      period: captureForm.period,
      payment_type: captureForm.payment_type,
      payment_date: captureForm.payment_date || null,
      notes: captureForm.notes || '',
      evidence: captureForm.evidence || '',
      field_payments: fp,
      adeudo_payments: captureForm.adeudo_payments || {},
    };
  };

  const handleCapture = async () => {
    if (!captureForm.payment_type) { toast.error('La forma de pago es obligatoria'); return; }
    setSaving(true);
    try {
      await paymentsAPI.capture(tenantId, buildCapturePayload());
      toast.success('Pago registrado');
      setShowCapture(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al registrar pago');
    } finally {
      setSaving(false);
    }
  };

  const minPeriod = tenantStartPeriod(tenantData);

  return (
    <div className="content-fade">
      {/* ── Period + Search ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div className="period-nav" style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
          <button
            className="period-nav-btn"
            disabled={period <= minPeriod}
            style={period <= minPeriod ? { opacity: 0.3, cursor: 'not-allowed' } : undefined}
            onClick={() => { if (period > minPeriod) { setPeriod(prevPeriod(period)); setPage(1); } }}
          >
            <ChevronLeft size={16} />
          </button>
          <div className="period-label" style={{ fontSize: 14 }}>{periodLabel(period)}</div>
          <button className="period-nav-btn" onClick={() => { setPeriod(nextPeriod(period)); setPage(1); }}>
            <ChevronRight size={16} />
          </button>
          {period <= minPeriod && (
            <span style={{ fontSize: 11, color: 'var(--ink-400)', marginLeft: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
              <AlertCircle size={12} /> Período inicial del tenant
            </span>
          )}
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
                <th>Notas</th>
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
                      {pay?.notes && <span title={pay.notes}>{pay.notes.length > 30 ? pay.notes.slice(0, 30) + '…' : pay.notes}</span>}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {pay && (
                          <button className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }} onClick={() => setShowReceipt({ unit: u, pay })}>
                            <FileText size={12} /> Ver Recibo
                          </button>
                        )}
                        {!isReadOnly && (
                          <button className="btn btn-primary btn-sm" onClick={() => openCapture(u)}>
                            <Receipt size={12} /> {pay ? 'Editar' : 'Capturar'}
                          </button>
                        )}
                      </div>
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
      {showCapture && (() => {
        const reqEFs = extraFields.filter(ef => ef.required);
        const optEFs = extraFields.filter(ef => !ef.required);
        const maintCharge = maintenanceFee;
        const maintAbono = Math.min(parseFloat(captureForm.field_payments?.maintenance?.received) || 0, maintCharge);
        let totalReqCharge = maintCharge, totalReqAbono = maintAbono;
        reqEFs.forEach(ef => {
          const ch = parseFloat(ef.default_amount) || 0;
          const ab = Math.min(parseFloat(captureForm.field_payments?.[ef.id]?.received) || 0, ch);
          totalReqCharge += ch; totalReqAbono += ab;
        });
        const totalReqSaldo = Math.max(0, totalReqCharge - totalReqAbono);
        const totalOptAbono = optEFs.reduce((s, ef) => s + (parseFloat(captureForm.field_payments?.[ef.id]?.received) || 0), 0);
        const autoStatus = totalReqAbono <= 0 ? 'pendiente' : (totalReqAbono >= totalReqCharge ? 'pagado' : 'parcial');
        const obligFields = [{ id: 'maintenance', label: 'Mantenimiento', charge: maintCharge }, ...reqEFs.map(ef => ({ id: ef.id, label: ef.label, charge: parseFloat(ef.default_amount) || 0 }))];
        const totalAdelantoCount = obligFields.reduce((s, fd) => s + Object.keys(captureForm.field_payments?.[fd.id]?.adelantoTargets || {}).length, 0);
        const prevDebt = parseFloat(showCapture.previous_debt) || 0;
        const tenantStart = tenantData?.operation_start_date || (() => { let p = period; for (let i = 0; i < 12; i++) p = prevPeriod(p); return p; })();
        const allPast = periodsBetween(tenantStart, prevPeriod(period));
        const periodsWithDebt = [];
        if (prevDebt > 0) {
          const existingPrev = captureForm.adeudo_payments?.__prevDebt;
          const existingPrevSum = existingPrev ? Object.values(existingPrev).reduce((a, v) => a + (parseFloat(v) || 0), 0) : 0;
          periodsWithDebt.push({ period: '__prevDebt', saldoPeriodo: prevDebt, label: 'Adeudo Anterior al Inicio' });
        }
        const responsible = showCapture.occupancy === 'rentado'
          ? `${showCapture.tenant_first_name || ''} ${showCapture.tenant_last_name || ''}`.trim() || showCapture.responsible_name
          : `${showCapture.owner_first_name || ''} ${showCapture.owner_last_name || ''}`.trim() || showCapture.responsible_name;

        return (
          <div className="modal-bg open" onClick={() => setShowCapture(null)}>
            <div className="modal lg" onClick={e => e.stopPropagation()} style={{ maxWidth: 620 }}>
              <div className="modal-head">
                <div>
                  <h3>Captura de Pago — {periodLabel(period)}</h3>
                </div>
                <button className="modal-close" onClick={() => setShowCapture(null)}><X size={16} /></button>
              </div>
              <div className="modal-body" style={{ maxHeight: 'calc(100vh - 140px)', overflowY: 'auto' }}>
                {/* Unit header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'var(--sand-50)', border: '1px solid var(--sand-100)', borderRadius: 'var(--radius-md)' }}>
                  <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--teal-600)', background: 'var(--teal-50)', padding: '4px 10px', borderRadius: 6, fontSize: 12 }}>{showCapture.unit_id_code}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{showCapture.unit_name}</div>
                    <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>{responsible || '—'} · {showCapture.occupancy === 'rentado' ? 'Inquilino' : 'Propietario'}</div>
                  </div>
                  <span className={`badge ${statusClass(autoStatus)}`}>{statusLabel(autoStatus)}</span>
                </div>

                {/* SECCIÓN 1: OBLIGATORIOS */}
                <div style={{ marginTop: 14, background: 'var(--white)', border: '1.5px solid var(--teal-100)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 120px 85px', gap: 0, padding: '8px 16px', background: 'var(--teal-50)', borderBottom: '1px solid var(--teal-100)', alignItems: 'center' }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--teal-700)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>● Obligatorios — {periodLabel(period)}</div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-400)', textAlign: 'right', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Cargo</div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--teal-600)', textAlign: 'right', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Abono</div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--coral-400)', textAlign: 'right', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Saldo</div>
                  </div>
                  {/* Mantenimiento */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 120px 85px', gap: 0, alignItems: 'center', padding: '11px 16px', borderBottom: '1px solid var(--sand-50)' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-800)' }}>Mantenimiento <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--coral-500)', background: 'var(--coral-50)', padding: '2px 6px', borderRadius: 4 }}>Oblig.</span></div>
                      <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>Cuota base fija</div>
                    </div>
                    <div style={{ textAlign: 'right', fontSize: 15, fontWeight: 700, color: 'var(--ink-700)' }}>{fmt(maintCharge)}</div>
                    <div style={{ textAlign: 'right' }}>
                      <input type="number" className="field-input" min={0} step="0.01" style={{ textAlign: 'right', maxWidth: 100 }}
                        value={captureForm.field_payments?.maintenance?.received ?? ''}
                        onChange={e => setReceived('maintenance', e.target.value)} />
                    </div>
                    <div style={{ textAlign: 'right', fontWeight: 700, fontSize: 13, color: maintCharge - maintAbono > 0 ? 'var(--coral-500)' : 'var(--teal-600)' }}>
                      {maintCharge - maintAbono === 0 ? '✓' : fmt(maintCharge - maintAbono)}
                    </div>
                  </div>
                  {reqEFs.map(ef => {
                    const ch = parseFloat(ef.default_amount) || 0;
                    const ab = Math.min(parseFloat(captureForm.field_payments?.[ef.id]?.received) || 0, ch);
                    const saldo = ch - ab;
                    return (
                      <div key={ef.id}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 120px 85px', gap: 0, alignItems: 'center', padding: '11px 16px', borderBottom: '1px solid var(--sand-50)' }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-800)' }}>{ef.label} <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--coral-500)', background: 'var(--coral-50)', padding: '2px 6px', borderRadius: 4 }}>Oblig.</span></div>
                            <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>Campo obligatorio</div>
                          </div>
                          <div style={{ textAlign: 'right', fontSize: 15, fontWeight: 700, color: 'var(--ink-700)' }}>{fmt(ch)}</div>
                          <div style={{ textAlign: 'right' }}>
                            <input type="number" className="field-input" min={0} step="0.01" style={{ textAlign: 'right', maxWidth: 100 }}
                              value={captureForm.field_payments?.[ef.id]?.received ?? ''}
                              onChange={e => setReceived(ef.id, e.target.value)} />
                          </div>
                          <div style={{ textAlign: 'right', fontWeight: 700, fontSize: 13, color: saldo > 0 ? 'var(--coral-500)' : 'var(--teal-600)' }}>
                            {saldo === 0 ? '✓' : fmt(saldo)}
                          </div>
                        </div>
                        {ef.cross_unit && (
                          <div style={{ marginTop: 6, padding: 8, background: 'var(--blue-50)', borderRadius: 6, border: '1px solid var(--blue-200)', marginLeft: 16, marginRight: 16, marginBottom: 8 }}>
                            <div style={{ fontSize: 11, color: 'var(--blue-700)', fontWeight: 700, marginBottom: 4 }}><Building2 size={11} style={{ display: 'inline', verticalAlign: -2 }} /> Aplicar a otra unidad</div>
                            <select className="field-select" style={{ fontSize: 12 }}
                              value={captureForm.field_payments?.[ef.id]?.targetUnitId || ''}
                              onChange={e => setFieldTargetUnit(ef.id, e.target.value || null)}>
                              <option value="">— Seleccionar unidad destino —</option>
                              {units.filter(u => u.id !== showCapture.id).map(u => (
                                <option key={u.id} value={u.id}>{u.unit_id_code} — {u.unit_name}</option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 120px 85px', gap: 0, padding: '10px 16px', background: 'var(--teal-50)', borderTop: '2px solid var(--teal-200)', alignItems: 'center' }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--teal-700)' }}>SUBTOTAL OBLIGATORIOS</div>
                    <div style={{ textAlign: 'right', fontWeight: 700, fontSize: 13, color: 'var(--ink-700)' }}>{fmt(totalReqCharge)}</div>
                    <div style={{ textAlign: 'right', fontWeight: 800, fontSize: 13, color: 'var(--teal-700)' }}>{fmt(totalReqAbono)}</div>
                    <div style={{ textAlign: 'right', fontWeight: 800, fontSize: 13, color: totalReqSaldo > 0 ? 'var(--coral-500)' : 'var(--teal-600)' }}>{fmt(totalReqSaldo)}</div>
                  </div>
                </div>

                {/* SECCIÓN 2: OPCIONALES */}
                {optEFs.length > 0 && (
                  <div style={{ marginTop: 8, background: 'var(--white)', border: '1.5px solid var(--sand-200)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 0, padding: '8px 16px', background: 'var(--sand-50)', borderBottom: '1px solid var(--sand-100)', alignItems: 'center' }}>
                      <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--ink-500)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>○ Opcionales</div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--teal-600)', textAlign: 'right', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Abono</div>
                    </div>
                    {optEFs.map(ef => (
                      <div key={ef.id}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 0, alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid var(--sand-50)' }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-700)' }}>{ef.label} <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: 'var(--ink-400)', background: 'var(--sand-100)', padding: '2px 6px', borderRadius: 4 }}>Opcional</span></div>
                            <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>Monto variable — sin cargo fijo</div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <input type="number" className="field-input" min={0} step="0.01" style={{ textAlign: 'right' }}
                              value={captureForm.field_payments?.[ef.id]?.received ?? ''}
                              onChange={e => setReceived(ef.id, e.target.value)} />
                          </div>
                        </div>
                        {ef.cross_unit && (
                          <div style={{ marginTop: 6, padding: 8, background: 'var(--blue-50)', borderRadius: 6, border: '1px solid var(--blue-200)', marginLeft: 16, marginRight: 16, marginBottom: 8 }}>
                            <div style={{ fontSize: 11, color: 'var(--blue-700)', fontWeight: 700, marginBottom: 4 }}><Building2 size={11} style={{ display: 'inline', verticalAlign: -2 }} /> Aplicar a otra unidad</div>
                            <select className="field-select" style={{ fontSize: 12 }}
                              value={captureForm.field_payments?.[ef.id]?.targetUnitId || ''}
                              onChange={e => setFieldTargetUnit(ef.id, e.target.value || null)}>
                              <option value="">— Seleccionar unidad destino —</option>
                              {units.filter(u => u.id !== showCapture.id).map(u => (
                                <option key={u.id} value={u.id}>{u.unit_id_code} — {u.unit_name}</option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    ))}
                    {totalOptAbono > 0 && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 0, padding: '8px 16px', background: 'var(--sand-50)', borderTop: '2px solid var(--sand-200)' }}>
                        <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--ink-500)' }}>SUBTOTAL OPCIONALES</div>
                        <div style={{ textAlign: 'right', fontWeight: 800, fontSize: 13, color: 'var(--ink-600)' }}>{fmt(totalOptAbono)}</div>
                      </div>
                    )}
                  </div>
                )}

                {/* SECCIÓN 3: ADELANTOS */}
                <div style={{ marginTop: 8, border: '1.5px solid var(--blue-100)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                  <button type="button" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', background: 'var(--blue-50)', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)' }}
                    onClick={() => setCaptureForm(p => ({ ...p, showAdelantoPanel: !p.showAdelantoPanel }))}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700, color: 'var(--blue-700)' }}><Calendar size={14} /> Adelantos (Períodos Futuros){totalAdelantoCount > 0 ? ` (${totalAdelantoCount} período(s))` : ''}</span>
                    <span style={{ fontSize: 11, color: 'var(--blue-500)', fontWeight: 600 }}>{captureForm.showAdelantoPanel ? '▲ Ocultar' : '▼ Expandir'}</span>
                  </button>
                  {captureForm.showAdelantoPanel && (
                    <div style={{ background: 'white', borderTop: '1px solid var(--blue-100)' }}>
                      <div style={{ padding: '10px 16px 4px', fontSize: 11, color: 'var(--blue-700)', borderBottom: '1px solid var(--blue-50)' }}>Selecciona los períodos futuros a los que aplica este pago como adelanto, campo por campo.</div>
                      {obligFields.map(fd => {
                        const targets = captureForm.field_payments?.[fd.id]?.adelantoTargets || {};
                        const selCount = Object.keys(targets).length;
                        const panelKey = 'showAdelanto_' + fd.id;
                        const isOpen = !!(captureForm[panelKey]);
                        const futPeriods = futurePeriods(period, 12);
                        return (
                          <div key={fd.id} style={{ borderBottom: '1px solid var(--blue-50)' }}>
                            <button type="button" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', background: selCount > 0 ? 'var(--blue-50)' : 'white', border: 'none', cursor: 'pointer' }}
                              onClick={() => setCaptureForm(p => ({ ...p, [panelKey]: !p[panelKey] }))}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-700)' }}>{fd.label} <span style={{ fontSize: 11, color: 'var(--ink-400)' }}>cargo: {fmt(fd.charge)}</span>{selCount > 0 ? ` (${selCount} per.)` : ''}</span>
                              <span style={{ fontSize: 10, color: 'var(--blue-400)' }}>{isOpen ? '▲' : '▼'}</span>
                            </button>
                            {isOpen && (
                              <div style={{ padding: '10px 16px 12px', background: 'var(--sand-50)' }}>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
                                  {futPeriods.map(p3 => {
                                    const sel = targets[p3] != null;
                                    return (
                                      <button key={p3} type="button" style={{ padding: '5px 12px', borderRadius: 999, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: `1.5px solid ${sel ? 'var(--blue-500)' : 'var(--sand-200)'}`, background: sel ? 'var(--blue-50)' : 'white', color: sel ? 'var(--blue-700)' : 'var(--ink-500)' }}
                                        onClick={() => toggleAdelanto(fd.id, p3, fd.charge)}>
                                        {periodLabel(p3)}{sel ? ' ✓' : ''}
                                      </button>
                                    );
                                  })}
                                </div>
                                {selCount > 0 && (
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                    {Object.entries(targets).map(([tp, amt]) => (
                                      <span key={tp} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--blue-50)', border: '1px solid var(--blue-100)', padding: '3px 8px', borderRadius: 999, fontSize: 11, color: 'var(--blue-700)' }}>
                                        <Check size={10} /> {periodLabel(tp)}: {fmt(amt)}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* SECCIÓN 4: ADEUDOS */}
                {periodsWithDebt.length > 0 && (
                  <div style={{ marginTop: 8, border: '1.5px solid var(--coral-100)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                    <button type="button" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', background: 'var(--coral-50)', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)' }}
                      onClick={() => setCaptureForm(p => ({ ...p, showAdeudoPanel: !p.showAdeudoPanel }))}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700, color: 'var(--coral-700)' }}><AlertCircle size={14} /> Abono a Adeudo — {periodsWithDebt.length} período(s) con saldo pendiente</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--coral-500)' }}>{fmt(periodsWithDebt.reduce((a, d) => a + (d.saldoPeriodo || 0), 0))} {captureForm.showAdeudoPanel ? '▲' : '▼'}</span>
                    </button>
                    {captureForm.showAdeudoPanel && (
                      <div style={{ background: 'white', borderTop: '1px solid var(--coral-100)' }}>
                        {periodsWithDebt.map(d => {
                          const sel = !!(captureForm.adeudoSelections && captureForm.adeudoSelections[d.period]);
                          const ds = (captureForm.adeudo_payments && captureForm.adeudo_payments[d.period]) || {};
                          const capturedTotal = Object.values(ds).reduce((a, v) => a + (parseFloat(v) || 0), 0);
                          return (
                            <div key={d.period} style={{ borderBottom: '1px solid var(--coral-50)' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', cursor: 'pointer', background: sel ? 'var(--coral-50)' : undefined }}
                                onClick={() => toggleAdeudoPeriod(d.period)}>
                                <div style={{ width: 20, height: 20, borderRadius: 6, border: `2px solid ${sel ? 'var(--coral-400)' : 'var(--sand-300)'}`, background: sel ? 'var(--coral-400)' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                  {sel && <Check size={12} style={{ color: 'white' }} />}
                                </div>
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-800)' }}>{d.period === '__prevDebt' ? '⚠️ Adeudo Anterior al Inicio' : periodLabel(d.period)}</div>
                                  <div style={{ fontSize: 11, color: 'var(--coral-500)', fontWeight: 600 }}>Saldo pendiente: {fmt(d.saldoPeriodo)}{capturedTotal > 0 ? ` · Abonando: ${fmt(capturedTotal)}` : ''}</div>
                                </div>
                                <span style={{ fontSize: 11, color: 'var(--ink-400)' }}>{sel ? '▲ ocultar' : '▼ capturar'}</span>
                              </div>
                              {sel && (
                                <div style={{ padding: '10px 16px 14px', background: 'var(--coral-50)' }}>
                                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--coral-700)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Abono por campo — período {d.period === '__prevDebt' ? 'Adeudo Anterior' : periodLabel(d.period)}:</div>
                                  {d.period === '__prevDebt' ? (
                                    <div style={{ marginBottom: 8 }}>
                                      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-700)' }}>Adeudo Anterior (Pre-Inicio)</label>
                                      <input type="number" className="field-input" min={0} step="0.01" style={{ marginTop: 4, maxWidth: 140 }}
                                        value={ds.prevDebt ?? ''}
                                        onChange={e => setAdeudoSelection(d.period, 'prevDebt', e.target.value)} />
                                    </div>
                                  ) : (
                                    <>
                                      <div style={{ marginBottom: 8 }}>
                                        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-700)' }}>Mantenimiento</label>
                                        <input type="number" className="field-input" min={0} step="0.01" style={{ marginTop: 4, maxWidth: 140 }}
                                          value={ds.maintenance ?? ''}
                                          onChange={e => setAdeudoSelection(d.period, 'maintenance', e.target.value)} />
                                      </div>
                                      {reqEFs.map(ef => (
                                        <div key={ef.id} style={{ marginBottom: 8 }}>
                                          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-700)' }}>{ef.label}</label>
                                          <input type="number" className="field-input" min={0} step="0.01" style={{ marginTop: 4, maxWidth: 140 }}
                                            value={ds[ef.id] ?? ''}
                                            onChange={e => setAdeudoSelection(d.period, ef.id, e.target.value)} />
                                        </div>
                                      ))}
                                    </>
                                  )}
                                  {capturedTotal > 0 && (
                                    <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'white', border: '1px solid var(--coral-100)', borderRadius: 'var(--radius-sm)' }}>
                                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--coral-700)' }}>Total a abonar este período</span>
                                      <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--teal-700)' }}>{fmt(capturedTotal)}</span>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                        <div style={{ padding: '8px 14px', background: 'var(--sand-50)', borderTop: '1px solid var(--sand-100)', fontSize: 11, color: 'var(--ink-500)' }}>Cada campo abonado actualiza el período correspondiente.</div>
                      </div>
                    )}
                  </div>
                )}

                {/* SECCIÓN 5: Información del Pago */}
                <div style={{ marginTop: 16, fontSize: 12, fontWeight: 700, color: 'var(--ink-500)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Información del Pago</div>
                <div className="grid-2" style={{ gap: 12, marginTop: 8 }}>
                  <div className="field">
                    <label className="field-label">Forma de Pago <span style={{ color: 'var(--coral-500)' }}>*</span></label>
                    <select className="field-select" value={captureForm.payment_type}
                      onChange={e => setCaptureForm({ ...captureForm, payment_type: e.target.value })} style={!captureForm.payment_type ? { borderColor: 'var(--coral-400)' } : {}}>
                      <option value="">— Seleccionar (obligatorio) —</option>
                      <option value="transferencia">🏦 Transferencia</option>
                      <option value="deposito">💵 Depósito en efectivo</option>
                      <option value="efectivo">💰 Efectivo directo</option>
                    </select>
                  </div>
                  <div className="field">
                    <label className="field-label">Fecha de Pago</label>
                    <input type="date" className="field-input" value={captureForm.payment_date}
                      onChange={e => setCaptureForm({ ...captureForm, payment_date: e.target.value })} />
                  </div>
                  <div className="field" style={{ gridColumn: '1 / -1' }}>
                    <label className="field-label">Notas (opcional)</label>
                    <input className="field-input" placeholder="Referencia, observaciones..." value={captureForm.notes || ''}
                      onChange={e => setCaptureForm({ ...captureForm, notes: e.target.value })} />
                  </div>
                </div>

                {/* SECCIÓN 6: Evidencia */}
                <div style={{ marginTop: 12, fontSize: 12, fontWeight: 700, color: 'var(--ink-500)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Evidencia de Pago (opcional)</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
                  <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}><Upload size={14} style={{ display: 'inline', verticalAlign: -2 }} /> Adjuntar<input type="file" accept=".png,.jpg,.jpeg,.pdf" style={{ display: 'none' }} onChange={handleEvidence} /></label>
                  {(captureForm.evidenceFileName || captureForm.evidence) ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--blue-50)', border: '1px solid var(--blue-100)', padding: '6px 12px', borderRadius: 'var(--radius-sm)' }}>
                      <FileText size={14} />
                      <span style={{ fontSize: 12, color: 'var(--blue-600)', fontWeight: 600 }}>{captureForm.evidenceFileName || 'Evidencia adjunta'}</span>
                      <button type="button" className="btn btn-secondary btn-sm" style={{ padding: '3px 8px', fontSize: 11 }}
                        onClick={() => setCaptureForm(p => ({ ...p, showPreview: !p.showPreview }))}>
                        {captureForm.showPreview ? 'Ocultar' : 'Ver'}
                      </button>
                      <button type="button" className="btn-ghost" style={{ color: 'var(--coral-500)', padding: 0, marginLeft: 4 }}
                        onClick={() => setCaptureForm(p => ({ ...p, evidenceFileName: '', evidence: '', showPreview: false }))}>✕</button>
                    </div>
                  ) : (
                    <span style={{ fontSize: 12, color: 'var(--ink-300)' }}>PNG, JPG o PDF — máx. 5 MB</span>
                  )}
                </div>
                {captureForm.showPreview && captureForm.evidence && (
                  <div style={{ width: '100%', marginTop: 8 }}>
                    {(captureForm.evidenceFileName || '').match(/\.(pdf)$/i) ? (
                      <div style={{ border: '1px solid var(--sand-200)', borderRadius: 'var(--radius-md)', overflow: 'hidden', height: 200 }}><iframe src={`data:application/pdf;base64,${captureForm.evidence}`} style={{ width: '100%', height: '100%', border: 'none' }} title="Evidencia" /></div>
                    ) : (
                      <div style={{ border: '1px solid var(--sand-200)', borderRadius: 'var(--radius-md)', overflow: 'hidden', maxHeight: 200 }}><img src={`data:image/jpeg;base64,${captureForm.evidence}`} alt="Evidencia" style={{ width: '100%', display: 'block' }} /></div>
                    )}
                  </div>
                )}
              </div>
              <div className="modal-foot">
                <button className="btn btn-secondary" onClick={() => setShowCapture(null)}>Cancelar</button>
                <button className="btn btn-primary" onClick={handleCapture} disabled={saving}>
                  {saving ? 'Guardando…' : 'Guardar Pago'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Receipt Modal (Ver Recibo / Imprimir) ── */}
      {showReceipt && (() => {
        const { unit, pay } = showReceipt;
        const tc = tenantData;
        const maintCharge = parseFloat(tc?.maintenance_fee) || 0;
        const reqEFs = extraFields.filter(ef => ef.required);
        const optEFs = extraFields.filter(ef => !ef.required);
        const fp = {};
        (pay?.field_payments || []).forEach(f => { fp[f.field_key] = f; });
        const maintAbono = Math.min(parseFloat(fp.maintenance?.received || 0), maintCharge);
        let totReqCharge = maintCharge, totReqAbono = maintAbono;
        reqEFs.forEach(ef => {
          const ch = parseFloat(ef.default_amount) || 0;
          const ab = fp[ef.id] ? Math.min(parseFloat(fp[ef.id].received || 0), ch) : 0;
          totReqCharge += ch; totReqAbono += ab;
        });
        let totOptAbono = 0;
        optEFs.forEach(ef => { totOptAbono += parseFloat(fp[ef.id]?.received || 0) || 0; });
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
        const adeudoOut = pay?.adeudo_payments || {};
        Object.entries(adeudoOut).forEach(([targetPeriod, fieldMap]) => {
          Object.entries(fieldMap || {}).forEach(([fieldId, amt]) => {
            const a = parseFloat(amt) || 0;
            if (a > 0) {
              const fLabel = fieldId === 'maintenance' ? 'Mantenimiento' : (extraFields.find(e => e.id === fieldId) || {}).label || fieldId;
              adeudoRows.push({ fieldLabel: fLabel, targetPeriod, amount: a });
              totalAdeudo += a;
            }
          });
        });
        const grandTotal = totReqAbono + totOptAbono + totalAdelanto + totalAdeudo;
        const ptLabel = pay?.payment_type ? (PAYMENT_TYPES[pay.payment_type]?.label || pay.payment_type) : 'No especificado';
        const pdLabel = pay?.payment_date ? new Date(pay.payment_date + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' }) : 'No registrada';
        const condominioName = tc?.razon_social || tc?.name || '';
        const roleLabel = user ? (ROLES[user.role]?.label || user.role) : '';
        const rfmt = (n) => receiptFmt(n, tc?.currency || 'MXN');

        return (
          <div className="modal-bg open" onClick={() => setShowReceipt(null)}>
            <div className="modal lg" onClick={e => e.stopPropagation()} style={{ maxWidth: 680 }}>
              <div className="modal-head">
                <h3><FileText size={18} style={{ display: 'inline', verticalAlign: -4, marginRight: 8 }} />Recibo de Pago — {periodLabel(pay.period)}</h3>
                <button className="modal-close" onClick={() => setShowReceipt(null)}><X size={16} /></button>
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
                        const ab = fp[ef.id] ? Math.min(parseFloat(fp[ef.id].received || 0), ch) : 0;
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
                      {optEFs.filter(ef => fp[ef.id] && parseFloat(fp[ef.id].received || 0) > 0).length > 0 && (
                        <>
                          <tr className="receipt-section-header"><td colSpan={4}>○ CAMPOS OPCIONALES</td></tr>
                          {optEFs.filter(ef => fp[ef.id] && parseFloat(fp[ef.id].received || 0) > 0).map(ef => (
                            <tr key={ef.id}>
                              <td>{ef.label}<br /><small>Opcional</small></td>
                              <td style={{ textAlign: 'right', color: 'var(--ink-300)' }}>—</td>
                              <td style={{ textAlign: 'right', color: 'var(--teal-600)', fontWeight: 700 }}>{rfmt(parseFloat(fp[ef.id].received || 0))}</td>
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
                      {adeudoRows.length > 0 && (
                        <>
                          <tr className="receipt-section-header"><td colSpan={4} style={{ color: 'var(--coral-500)', background: 'var(--coral-50)' }}>◂ ABONOS A ADEUDO</td></tr>
                          {adeudoRows.map((ar, i) => (
                            <tr key={i}>
                              <td>{ar.fieldLabel}<br /><small style={{ color: 'var(--coral-500)' }}>{ar.targetPeriod === '__prevDebt' ? 'Adeudo Anterior al Inicio' : `Abono a Adeudo → ${periodLabel(ar.targetPeriod)}`}</small></td>
                              <td style={{ textAlign: 'right', color: 'var(--ink-300)' }}>—</td>
                              <td style={{ textAlign: 'right', color: 'var(--coral-500)', fontWeight: 700 }}>{rfmt(ar.amount)}</td>
                              <td style={{ textAlign: 'right', color: 'var(--ink-300)' }}>—</td>
                            </tr>
                          ))}
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
                      {totalAdeudo > 0 && <tr><td colSpan={4} style={{ textAlign: 'right', fontSize: 11, color: 'var(--coral-500)', padding: '4px 12px' }}>Incluye {rfmt(totalAdeudo)} en abonos a adeudo</td></tr>}
                    </tfoot>
                  </table>
                  {pay?.notes && <div className="receipt-notes"><AlertCircle size={13} /> <strong>Notas:</strong> {pay.notes}</div>}
                  <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>{receiptStatusBadge(pay?.status)}</div>
                  {pay?.evidence && <div style={{ marginTop: 12, textAlign: 'center', fontSize: 12, color: 'var(--blue-500)' }}><FileText size={14} style={{ display: 'inline', verticalAlign: -2, marginRight: 4 }} /> Evidencia adjunta</div>}
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
                    <span>Homly v{APP_VERSION} · Powered by Spotynet</span>
                    <span>{tc?.name || ''} — Recibo — {periodLabel(pay.period)}</span>
                  </div>
                </div>
              </div>
              <div className="modal-foot">
                <button className="btn btn-secondary" onClick={() => setShowReceipt(null)}>Cerrar</button>
                <button className="btn btn-primary" onClick={() => window.print()}>
                  <Printer size={14} /> Imprimir
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
