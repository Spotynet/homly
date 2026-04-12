import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { paymentsAPI, unitsAPI, extraFieldsAPI, tenantsAPI, unrecognizedIncomeAPI, reservationsAPI, reportsAPI, periodsAPI } from '../api/client';
import PaginationBar from '../components/PaginationBar';
import PaymentReceiptModal from '../components/PaymentReceiptModal';
import { todayPeriod, periodLabel, prevPeriod, nextPeriod, tenantStartPeriod, fmtCurrency, statusClass, statusLabel, PAYMENT_TYPES, fmtDate, ROLES, CURRENCIES, APP_VERSION } from '../utils/helpers';
import { ChevronLeft, ChevronRight, Search, Receipt, X, Users, CheckCircle, Clock, AlertCircle, DollarSign, Calendar, Building2, Upload, FileText, Check, Plus, Edit, Edit2, Trash2, Banknote, Mail, Lock } from 'lucide-react';
import toast from 'react-hot-toast';

function fmt(n) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n ?? 0);
}

// Format with cents (2 decimal places) for payment inputs
function fmtDec(n) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(parseFloat(n) || 0);
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
    exento: { cls: 'badge-teal', si: 'si-pagado', label: 'Exento' },
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

// Effective received per field (main + additional_payments).
// NOTE: does NOT include adelanto_targets — use getUnitRecaudo() for the full collection total.
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

// Total physically collected for a payment — mirrors backend _payment_total_income:
//   field_payments.received  +  field_payments.adelanto_targets  +
//   additional_payments.received  +  adeudo_payments
function getUnitRecaudo(pay) {
  if (!pay) return 0;
  let total = 0;
  // Main field_payments: received amount + advance amounts for future periods
  (pay.field_payments || []).forEach(f => {
    total += parseFloat(f.received || 0);
    Object.values(f.adelanto_targets || {}).forEach(amt => {
      total += parseFloat(amt) || 0;
    });
  });
  // Additional payment events
  (pay.additional_payments || []).forEach(ap => {
    const fp = ap.field_payments || ap.fieldPayments || {};
    Object.values(fp).forEach(fd => {
      const v = typeof fd === 'object' ? (fd.received ?? fd) : fd;
      total += parseFloat(v || 0);
    });
  });
  // Adeudo (debt) payments captured in this period
  Object.values(pay.adeudo_payments || {}).forEach(fieldMap => {
    Object.values(fieldMap || {}).forEach(amt => {
      total += parseFloat(amt) || 0;
    });
  });
  return total;
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
  const [receiptReservations, setReceiptReservations] = useState([]); // approved reservations for receipt unit+period
  const [unrecognizedIncome, setUnrecognizedIncome] = useState([]);
  const [showUnidentModal, setShowUnidentModal] = useState(null); // { editId } or true for new
  const [unidentForm, setUnidentForm] = useState({ concept: '', amount: '', payment_type: '', payment_date: '', notes: '', bank_reconciled: false });
  const [showAddPaymentModal, setShowAddPaymentModal] = useState(null); // { unit, pay }
  const [addPaymentForm, setAddPaymentForm] = useState({ extraFieldPayments: {}, payment_type: '', payment_date: '', notes: '', bank_reconciled: false, applied_to_unit_id: null });
  const [showAdditionalPaymentsModal, setShowAdditionalPaymentsModal] = useState(null); // { unit, pay }
  const [editingAdditional, setEditingAdditional] = useState(null); // additional payment being edited
  const [perPage, setPerPage] = useState(25);
  const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
  const [evidencePopup, setEvidencePopup] = useState(null); // { b64, mime, fileName }
  const [addlExtraFields, setAddlExtraFields] = useState([]); // campos para pagos adicionales (sin adelanto)
  const [allNormalFields, setAllNormalFields] = useState([]); // todos los campos normales habilitados (para recibo)
  const [captureUnitPeriods, setCaptureUnitPeriods] = useState([]); // períodos con adeudo de la unidad en captura
  const [captureUnitPeriodsLoading, setCaptureUnitPeriodsLoading] = useState(false);
  const [closedPeriods, setClosedPeriods] = useState([]);
  const load = async () => {
    if (!tenantId) return;
    try {
      const [uRes, pRes, efRes, tRes, uiRes, cpRes] = await Promise.all([
        unitsAPI.list(tenantId, { page_size: 9999 }),
        paymentsAPI.list(tenantId, { period, page_size: 9999 }),
        extraFieldsAPI.list(tenantId, { page_size: 9999 }).catch(() => ({ data: [] })),
        tenantsAPI.get(tenantId).catch(() => ({ data: null })),
        unrecognizedIncomeAPI.list(tenantId, { period, page_size: 9999 }).catch(() => ({ data: [] })),
        periodsAPI.closedList(tenantId).catch(() => ({ data: [] })),
      ]);
      setUnits(uRes.data.results || uRes.data);
      setPayments(pRes.data.results || pRes.data);
      const rawEFs = Array.isArray(efRes.data) ? efRes.data : (efRes.data?.results || []);
      setExtraFields(rawEFs.filter(f => f.enabled && (!f.field_type || f.field_type === 'normal') && f.show_in_normal !== false));
      setAddlExtraFields(rawEFs.filter(f => f.enabled && (!f.field_type || f.field_type === 'normal') && f.show_in_additional !== false));
      setAllNormalFields(rawEFs.filter(f => f.enabled && (!f.field_type || f.field_type === 'normal')));
      setTenantData(tRes.data);
      setUnrecognizedIncome(Array.isArray(uiRes.data) ? uiRes.data : (uiRes.data?.results || []));
      setClosedPeriods(Array.isArray(cpRes.data) ? cpRes.data : (cpRes.data?.results || []));
    } catch (err) { console.error(err); }
  };

  useEffect(() => { load(); }, [tenantId, period]);

  const isPeriodClosed = closedPeriods.some(cp => cp.period === period);

  // Load approved reservations with charge when receipt opens
  useEffect(() => {
    if (!showReceipt || !tenantId) { setReceiptReservations([]); return; }
    const { unit, pay } = showReceipt;
    if (!unit?.id || !pay?.period) { setReceiptReservations([]); return; }
    const [y, m] = pay.period.split('-');
    const firstDay = `${y}-${m}-01`;
    const lastDate = new Date(parseInt(y), parseInt(m), 0);
    const lastDay  = `${y}-${m}-${String(lastDate.getDate()).padStart(2, '0')}`;
    reservationsAPI.list(tenantId, {
      unit_id: unit.id, status: 'approved',
      date_from: firstDay, date_to: lastDay,
    }).then(res => {
      const data = res.data;
      const all = Array.isArray(data) ? data : (data?.results || []);
      setReceiptReservations(all.filter(r => parseFloat(r.charge_amount) > 0));
    }).catch(() => setReceiptReservations([]));
  }, [showReceipt, tenantId]);

  // Cargar períodos con adeudo cuando se abre el modal de captura
  useEffect(() => {
    if (!showCapture || !tenantId) { setCaptureUnitPeriods([]); return; }
    setCaptureUnitPeriodsLoading(true);
    reportsAPI.estadoCuenta(tenantId, { unit_id: showCapture.id })
      .then(res => {
        const rawPeriods = res.data?.periods || [];
        // Solo períodos anteriores al período actual con saldo pendiente
        const withDebt = rawPeriods
          .filter(p => p.period < period && (parseFloat(p.charge) - parseFloat(p.paid)) > 0.01)
          .map(p => ({
            period: p.period,
            charge: parseFloat(p.charge),
            paid: parseFloat(p.paid),
            saldoPeriodo: parseFloat(p.charge) - parseFloat(p.paid),
            status: p.status,
          }))
          .sort((a, b) => a.period.localeCompare(b.period));
        setCaptureUnitPeriods(withDebt);
      })
      .catch(() => setCaptureUnitPeriods([]))
      .finally(() => setCaptureUnitPeriodsLoading(false));
  }, [showCapture, tenantId, period]);

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
      // Unidades exentas (admin_exempt) se cuentan como exentas en KPI
      const isExempt = !!u.admin_exempt;
      const st = isExempt ? 'exento' : (p?.status || 'pendiente');
      if (st === 'pagado' || st === 'exento') paid++;
      else if (st === 'parcial') partial++;
      else pending++;
      // Total físicamente cobrado (received + adelanto_targets + adeudos + adicionales)
      recaudo += getUnitRecaudo(p);
    });
    // Suma ingresos no identificados del período
    recaudo += unrecognizedIncome.reduce((s, r) => s + parseFloat(r.amount || 0), 0);
    const paidPct = total > 0 ? (paid / total) * 100 : 0;
    return { total, paid, partial, pending, recaudo, paidPct };
  }, [units, paymentMap, unrecognizedIncome]);

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
    // Rebuild adeudoSelections from existing adeudo_payments so checkboxes/inputs
    // are correctly shown when editing a previously-saved payment.
    const existingAp = existing?.adeudo_payments || {};
    const restoredSelections = {};
    Object.keys(existingAp).forEach(k => {
      if (Object.keys(existingAp[k] || {}).length > 0) restoredSelections[k] = {};
    });
    setCaptureForm({
      unit_id: unit.id,
      period,
      payment_type: existing?.payment_type || (!!unit.admin_exempt ? 'excento' : ''),
      payment_date: existing?.payment_date || new Date().toISOString().slice(0, 10),
      notes: existing?.notes || '',
      folio: existing?.folio || '',
      evidences: Array.isArray(existing?.evidence) ? existing.evidence : [],
      bank_reconciled: !!existing?.bank_reconciled,
      field_payments: fieldPayments,
      adeudo_payments: existingAp,
      adeudoSelections: restoredSelections,
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
      const newAp = { ...(prev.adeudo_payments || {}) };
      if (has) {
        // Unchecking: remove selection AND wipe amounts so nothing stale gets sent
        delete newSel[period];
        delete newAp[period];
      } else {
        newSel[period] = {};
      }
      return { ...prev, adeudoSelections: newSel, adeudo_payments: newAp };
    });
  };

  const handleEvidence = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    files.forEach(file => {
      if (file.size > 5 * 1024 * 1024) { toast.error(`${file.name}: máximo 5 MB`); return; }
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result?.split(',')[1] || '';
        const entry = { data: base64, mime: file.type, name: file.name };
        setCaptureForm(p => ({ ...p, evidences: [...(p.evidences || []), entry] }));
      };
      reader.readAsDataURL(file);
    });
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
      folio: captureForm.folio || '',
      evidence: captureForm.evidences || [],
      bank_reconciled: !!captureForm.bank_reconciled,
      field_payments: fp,
      adeudo_payments: captureForm.adeudo_payments || {},
    };
  };

  const handleCapture = async () => {
    const fp2 = captureForm.field_payments || {};
    const hasOtherPmts = extraFields.some(ef => (parseFloat(fp2[String(ef.id)]?.received) || 0) > 0);
    const isExemptUnit = !!units.find(u => u.id === captureForm.unit_id)?.admin_exempt;
    const needsRealType = isExemptUnit && hasOtherPmts;
    if (!captureForm.payment_type || (needsRealType && captureForm.payment_type === 'excento')) {
      toast.error('La forma de pago es obligatoria'); return;
    }
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
          {isPeriodClosed && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '3px 10px', borderRadius: 20, marginLeft: 8,
              background: 'var(--coral-50)', color: 'var(--coral-700)',
              fontSize: 11, fontWeight: 700, border: '1px solid var(--coral-100)',
            }}>
              <Lock size={10}/> Período cerrado
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
                // Exentas siempre aparecen como exentas
                const st = u.admin_exempt ? 'exento' : (pay?.status || 'pendiente');
                const effTotals = getEffectiveFieldTotals(pay);
                // Total físicamente cobrado (received + adelantos + adeudos + adicionales)
                const totalRec = getUnitRecaudo(pay);
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
                      {u.admin_exempt ? '—' : fmtDec(maintenanceFee)}
                    </td>
                    {extraFields.filter(f => f.required).map(ef => {
                      const amt = effTotals[ef.id] || 0;
                      return <td key={ef.id} style={{ textAlign: 'right', fontSize: 13 }}>{pay ? fmtDec(amt) : '—'}</td>;
                    })}
                    <td style={{ textAlign: 'right', fontWeight: 700, fontSize: 13, color: 'var(--teal-700)' }}>
                      {pay ? fmtDec(totalRec) : '—'}
                    </td>
                    <td>
                      <span className={`badge ${statusClass(st)}`}>{statusLabel(st)}</span>
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {pay?.payment_type ? (PAYMENT_TYPES[pay.payment_type]?.label || pay.payment_type) : '—'}
                      {pay?.bank_reconciled && <div style={{ fontSize: 10, color: 'var(--teal-600)', marginTop: 2, fontWeight: 700 }}>🏦 Conciliado</div>}
                    </td>
                    <td style={{ fontSize: 12 }}>{fmtDate(pay?.payment_date)}</td>
                    <td style={{ fontSize: 12, color: 'var(--ink-400)', maxWidth: 160 }}>
                      {pay?.notes && <span title={pay.notes}>{pay.notes.length > 30 ? pay.notes.slice(0, 30) + '…' : pay.notes}</span>}
                      {pay?.applied_to_unit_id && (
                        <div style={{ marginTop: pay?.notes ? 4 : 0, display: 'inline-flex', alignItems: 'center', gap: 4,
                          background: 'var(--amber-50)', color: 'var(--amber-700)', border: '1px solid var(--amber-200)',
                          borderRadius: 6, padding: '2px 7px', fontSize: 11, fontWeight: 700 }}>
                          🔀 → {pay.applied_to_unit_code || pay.applied_to_unit_id}
                        </div>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {pay && (
                          <button className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }} onClick={() => setShowReceipt({ unit: u, pay })}>
                            <FileText size={12} /> Ver Recibo
                          </button>
                        )}
                        {!isReadOnly && !isPeriodClosed && pay && (
                          <button className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }} onClick={() => {
                            setAddPaymentForm({
                              extraFieldPayments: Object.fromEntries(addlExtraFields.map(ef => [ef.id, ''])),
                              payment_type: '',
                              payment_date: new Date().toISOString().slice(0, 10),
                              notes: '',
                              bank_reconciled: false,
                              applied_to_unit_id: null,
                            });
                            setShowAddPaymentModal({ unit: u, pay });
                          }}>
                            <Plus size={12} /> Agregar pago
                          </button>
                        )}
                        {!isReadOnly && pay && (pay.additional_payments || []).length > 0 && (
                          <button className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, borderColor: 'var(--blue-200)', color: 'var(--blue-700)' }}
                            onClick={() => setShowAdditionalPaymentsModal({ unit: u, pay })}>
                            <Edit size={12} /> Pagos adicionales ({(pay.additional_payments || []).length})
                          </button>
                        )}
                        {!isReadOnly && !isPeriodClosed && (
                          <button
                            className="btn btn-sm"
                            title={pay ? 'Editar cobro' : 'Capturar pago'}
                            onClick={() => openCapture(u)}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 5,
                              background: pay ? 'var(--teal-600)' : 'var(--teal-500)',
                              color: 'white',
                              border: 'none',
                              fontWeight: 700,
                              letterSpacing: '0.01em',
                              boxShadow: '0 1px 4px rgba(0,0,0,0.10)',
                              padding: '5px 12px',
                              borderRadius: 8,
                              fontSize: 12,
                              transition: 'background 0.15s, box-shadow 0.15s',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'var(--teal-700)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.16)'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = pay ? 'var(--teal-600)' : 'var(--teal-500)'; e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.10)'; }}
                          >
                            {pay ? <Edit2 size={12} /> : <Receipt size={12} />}
                            {pay ? 'Editar' : 'Capturar'}
                          </button>
                        )}
                        {!isReadOnly && !isPeriodClosed && pay && (
                          <button
                            title="Eliminar cobro"
                            onClick={async () => {
                              if (window.confirm(`¿Eliminar el cobro de ${u.unit_id_code} — ${u.unit_name}? Esta acción no se puede deshacer.`)) {
                                try { await paymentsAPI.clear(tenantId, pay.id); toast.success('Cobro eliminado'); load(); }
                                catch (e) { toast.error(e.response?.data?.detail || 'Error al eliminar'); }
                              }
                            }}
                            style={{
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                              width: 30, height: 30, padding: 0,
                              background: 'var(--coral-50)',
                              color: 'var(--coral-500)',
                              border: '1.5px solid var(--coral-200)',
                              borderRadius: 8,
                              cursor: 'pointer',
                              transition: 'background 0.15s, color 0.15s, border-color 0.15s',
                              flexShrink: 0,
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'var(--coral-500)'; e.currentTarget.style.color = 'white'; e.currentTarget.style.borderColor = 'var(--coral-500)'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'var(--coral-50)'; e.currentTarget.style.color = 'var(--coral-500)'; e.currentTarget.style.borderColor = 'var(--coral-200)'; }}
                          >
                            <Trash2 size={13} />
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
        {filtered.length > 0 && (
          <PaginationBar
            page={page}
            totalPages={totalPages}
            totalItems={filtered.length}
            perPage={perPage}
            onPageChange={(p) => setPage(p)}
            pageSizeOptions={PAGE_SIZE_OPTIONS}
            onPerPageChange={(n) => { setPerPage(n); setPage(1); }}
            itemLabel="unidades"
          />
        )}
      </div>

      {/* ── Ingresos No Identificados ── */}
      <div className="card" style={{ marginTop: 24, border: '1.5px solid var(--amber-200)' }}>
        <div className="card-head" style={{ background: 'var(--amber-50)' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--amber-800)' }}>
            <DollarSign size={18} /> Ingresos No Identificados — {periodLabel(period)}
          </h3>
          {!isReadOnly && (
            <button className="btn btn-primary btn-sm" style={{ background: 'var(--amber-500)' }} onClick={() => { setUnidentForm({ concept: '', amount: '', payment_type: '', payment_date: new Date().toISOString().slice(0, 10), notes: '', bank_reconciled: false }); setShowUnidentModal(true); }}>
              <Plus size={12} /> Agregar Ingreso
            </button>
          )}
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr style={{ background: 'var(--sand-50)' }}>
                <th>Concepto</th>
                <th>Forma de Pago</th>
                <th>Fecha</th>
                <th style={{ textAlign: 'right' }}>Monto</th>
                <th>Notas</th>
                <th>Conciliado</th>
                {!isReadOnly && <th style={{ width: 90 }}>Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {unrecognizedIncome.length === 0 ? (
                <tr><td colSpan={isReadOnly ? 6 : 7} style={{ textAlign: 'center', padding: 32, color: 'var(--ink-400)', fontSize: 13 }}>Sin ingresos no identificados en este período</td></tr>
              ) : (
                unrecognizedIncome.map(row => (
                  <tr key={row.id} style={{ borderBottom: '1px solid var(--sand-100)' }}>
                    <td style={{ fontWeight: 600, color: 'var(--ink-700)' }}>{row.description || '—'}</td>
                    <td style={{ fontSize: 12 }}>
                      {row.payment_type ? (PAYMENT_TYPES[row.payment_type]?.label || row.payment_type) : '—'}
                      {row.payment_type === 'transferencia' && <Banknote size={12} style={{ marginLeft: 4, verticalAlign: -2, color: 'var(--teal-500)' }} />}
                    </td>
                    <td style={{ fontSize: 12 }}>{fmtDate(row.date)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--teal-700)', fontSize: 13 }}>{fmtDec(row.amount)}</td>
                    <td style={{ fontSize: 12, color: 'var(--ink-500)', maxWidth: 140 }}>{row.notes ? (row.notes.length > 30 ? row.notes.slice(0, 30) + '…' : row.notes) : '—'}</td>
                    <td><span style={{ color: row.bank_reconciled ? 'var(--teal-600)' : 'var(--ink-300)', fontSize: 12 }}>{row.bank_reconciled ? <><Check size={12} style={{ verticalAlign: -2 }} /> Sí</> : '—'}</span></td>
                    {!isReadOnly && (
                      <td>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button className="btn-icon" title="Editar" onClick={() => { setUnidentForm({ editId: row.id, concept: row.description || '', amount: row.amount ?? '', payment_type: row.payment_type || '', payment_date: row.date || new Date().toISOString().slice(0, 10), notes: row.notes || '', bank_reconciled: !!row.bank_reconciled }); setShowUnidentModal({ edit: true }); }}>
                            <Edit2 size={13} />
                          </button>
                          <button className="btn-icon" style={{ color: 'var(--coral-500)' }} title="Eliminar" onClick={() => { if (window.confirm('¿Eliminar este ingreso no identificado?')) unrecognizedIncomeAPI.delete(tenantId, row.id).then(() => load()).catch(e => toast.error(e.response?.data?.detail || 'Error')); }}>
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {unrecognizedIncome.length > 0 && (
          <div style={{ padding: '12px 16px', background: 'var(--amber-50)', borderTop: '2px solid var(--amber-200)', fontWeight: 800, color: 'var(--amber-800)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>TOTAL NO IDENTIFICADO</span>
            <span style={{ fontSize: 15 }}>{fmtDec(unrecognizedIncome.reduce((s, r) => s + parseFloat(r.amount || 0), 0))}</span>
          </div>
        )}
      </div>

      {/* ── Modal: Ingreso No Identificado ── */}
      {showUnidentModal && (
        <div className="modal-bg open" onClick={() => setShowUnidentModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="modal-head">
              <h3>{unidentForm.editId ? 'Editar' : 'Nuevo'} Ingreso No Identificado</h3>
              <button className="modal-close" onClick={() => setShowUnidentModal(null)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <div className="form-grid" style={{ gridTemplateColumns: '1fr', gap: 12 }}>
                <div className="field">
                  <label className="field-label">Concepto / Descripción <span style={{ color: 'var(--coral-500)' }}>*</span></label>
                  <input className="field-input" placeholder="Ej: Mantenimiento, Donativo, Evento" value={unidentForm.concept || ''} onChange={e => setUnidentForm(f => ({ ...f, concept: e.target.value }))} />
                </div>
                <div className="field">
                  <label className="field-label">Monto <span style={{ color: 'var(--coral-500)' }}>*</span></label>
                  <input className="field-input" type="number" min={0} step={0.01} placeholder="0.00" value={unidentForm.amount ?? ''} onChange={e => setUnidentForm(f => ({ ...f, amount: e.target.value }))} />
                </div>
                <div className="field">
                  <label className="field-label">Forma de Pago</label>
                  <select className="field-select" value={unidentForm.payment_type || ''} onChange={e => setUnidentForm(f => ({ ...f, payment_type: e.target.value }))}>
                    <option value="">— Sin especificar —</option>
                    <option value="transferencia">🏦 Transferencia</option>
                    <option value="deposito">💵 Depósito en efectivo</option>
                    <option value="efectivo">💰 Efectivo directo</option>
                  </select>
                </div>
                <div className="field">
                  <label className="field-label">Fecha</label>
                  <input className="field-input" type="date" value={unidentForm.payment_date || ''} onChange={e => setUnidentForm(f => ({ ...f, payment_date: e.target.value }))} />
                </div>
                <div className="field">
                  <label className="field-label">Notas</label>
                  <input className="field-input" placeholder="Observaciones adicionales" value={unidentForm.notes || ''} onChange={e => setUnidentForm(f => ({ ...f, notes: e.target.value }))} />
                </div>
                <div style={{ padding: 14, border: `1.5px solid ${unidentForm.bank_reconciled ? 'var(--teal-200)' : 'var(--sand-200)'}`, background: unidentForm.bank_reconciled ? 'var(--teal-50)' : 'var(--sand-50)', borderRadius: 'var(--radius-md)', cursor: 'pointer' }} onClick={() => setUnidentForm(f => ({ ...f, bank_reconciled: !f.bank_reconciled }))}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${unidentForm.bank_reconciled ? 'var(--teal-500)' : 'var(--sand-300)'}`, background: unidentForm.bank_reconciled ? 'var(--teal-500)' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {unidentForm.bank_reconciled && <Check size={14} style={{ color: 'white' }} />}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: unidentForm.bank_reconciled ? 'var(--teal-700)' : 'var(--ink-600)' }}>🏦 Conciliación Bancaria</div>
                      <div style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 2 }}>Marca si este ingreso ya está confirmado en el banco</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setShowUnidentModal(null)}>Cancelar</button>
              <button className="btn btn-primary" style={{ background: 'var(--amber-500)' }} onClick={async () => {
                if (!(unidentForm.concept || '').trim()) { toast.error('El concepto es obligatorio.'); return; }
                const amt = parseFloat(unidentForm.amount);
                if (!amt || amt <= 0) { toast.error('Ingresa un monto mayor a cero.'); return; }
                setSaving(true);
                try {
                  const payload = { period, amount: amt, description: unidentForm.concept.trim(), date: unidentForm.payment_date || null, payment_type: unidentForm.payment_type || '', notes: unidentForm.notes || '', bank_reconciled: !!unidentForm.bank_reconciled };
                  if (unidentForm.editId) {
                    await unrecognizedIncomeAPI.update(tenantId, unidentForm.editId, payload);
                  } else {
                    await unrecognizedIncomeAPI.create(tenantId, payload);
                  }
                  toast.success('Ingreso guardado');
                  setShowUnidentModal(null);
                  load();
                } catch (err) { toast.error(err.response?.data?.detail || 'Error al guardar'); }
                finally { setSaving(false); }
              }} disabled={saving}>{saving ? 'Guardando…' : 'Guardar Ingreso'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Agregar Pago Adicional ── */}
      {showAddPaymentModal && (
        <div className="modal-bg open" onClick={() => setShowAddPaymentModal(null)}>
          <div className="modal lg" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <div className="modal-head">
              <h3>Agregar Pago Adicional — {periodLabel(period)}</h3>
              <button className="modal-close" onClick={() => setShowAddPaymentModal(null)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              {(() => {
                const { unit, pay } = showAddPaymentModal;
                const resp = unit.responsible_name || (unit.occupancy === 'rentado' ? `${unit.tenant_first_name || ''} ${unit.tenant_last_name || ''}`.trim() : `${unit.owner_first_name || ''} ${unit.owner_last_name || ''}`.trim());
                const existingCount = 1 + (pay?.additional_payments || []).length;
                const pagoNum = existingCount + 1;
                return (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'var(--sand-50)', border: '1px solid var(--sand-100)', borderRadius: 'var(--radius-md)', marginBottom: 16 }}>
                      <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--teal-600)', background: 'var(--teal-50)', padding: '4px 10px', borderRadius: 6, fontSize: 12 }}>{unit.unit_id_code}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{unit.unit_name}</div>
                        <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>{resp || '—'}</div>
                      </div>
                      <span style={{ fontSize: 12, padding: '4px 10px', background: 'var(--blue-50)', color: 'var(--blue-700)', borderRadius: 99, fontWeight: 700 }}>Pago #{pagoNum}</span>
                    </div>
                    <div style={{ marginBottom: 14, padding: 12, background: 'var(--blue-50)', border: '1.5px solid var(--blue-100)', borderRadius: 'var(--radius-md)', fontSize: 12, color: 'var(--blue-700)', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                      <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                      Ingreso adicional para la unidad en el mismo período. Se suman al estado de cuenta.
                    </div>
                    <div style={{ background: 'var(--white)', border: '1.5px solid var(--teal-100)', borderRadius: 'var(--radius-md)', overflow: 'hidden', marginBottom: 16 }}>
                      <div style={{ padding: '8px 16px', background: 'var(--teal-50)', borderBottom: '1px solid var(--teal-100)', fontSize: 10, fontWeight: 800, color: 'var(--teal-700)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Conceptos a Abonar</div>
                      {addlExtraFields.map(ef => (
                        <div key={ef.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 16px', borderBottom: '1px solid var(--sand-50)' }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-800)' }}>{ef.label} <span style={{ marginLeft: 6, fontSize: 10, color: ef.required ? 'var(--coral-400)' : 'var(--ink-400)', background: 'var(--sand-100)', padding: '2px 6px', borderRadius: 4 }}>{ef.required ? 'Oblig.' : 'Opcional'}</span></div>
                          <input type="number" className="field-input" min={0} step={0.01} style={{ width: 100, textAlign: 'right' }} placeholder="0.00" value={addPaymentForm.extraFieldPayments?.[ef.id] ?? ''} onChange={e => setAddPaymentForm(f => ({ ...f, extraFieldPayments: { ...(f.extraFieldPayments || {}), [ef.id]: e.target.value } }))} />
                        </div>
                      ))}
                      {addlExtraFields.length === 0 && (
                        <div style={{ padding: '16px', fontSize: 12, color: 'var(--ink-400)', textAlign: 'center' }}>No hay campos adicionales configurados.</div>
                      )}
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-500)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Información del Pago</div>
                    <div className="grid-2" style={{ gap: 12, marginBottom: 12 }}>
                      <div className="field">
                        <label className="field-label">Forma de Pago <span style={{ color: 'var(--coral-500)' }}>*</span></label>
                        <select className="field-select" value={addPaymentForm.payment_type} onChange={e => setAddPaymentForm(f => ({ ...f, payment_type: e.target.value }))} style={!addPaymentForm.payment_type ? { borderColor: 'var(--coral-400)' } : {}}>
                          <option value="">— Seleccionar —</option>
                          <option value="transferencia">🏦 Transferencia</option>
                          <option value="deposito">💵 Depósito en efectivo</option>
                          <option value="efectivo">💰 Efectivo directo</option>
                        </select>
                      </div>
                      <div className="field">
                        <label className="field-label">Fecha de Pago</label>
                        <input type="date" className="field-input" value={addPaymentForm.payment_date || ''} onChange={e => setAddPaymentForm(f => ({ ...f, payment_date: e.target.value }))} />
                      </div>
                      <div className="field" style={{ gridColumn: '1 / -1' }}>
                        <label className="field-label">Notas (opcional)</label>
                        <input className="field-input" placeholder="Referencia, observaciones..." value={addPaymentForm.notes || ''} onChange={e => setAddPaymentForm(f => ({ ...f, notes: e.target.value }))} />
                      </div>
                    </div>
                    <div style={{ padding: 14, border: `1.5px solid ${addPaymentForm.bank_reconciled ? 'var(--teal-200)' : 'var(--sand-200)'}`, background: addPaymentForm.bank_reconciled ? 'var(--teal-50)' : 'var(--sand-50)', borderRadius: 'var(--radius-md)', cursor: 'pointer' }} onClick={() => setAddPaymentForm(f => ({ ...f, bank_reconciled: !f.bank_reconciled }))}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${addPaymentForm.bank_reconciled ? 'var(--teal-500)' : 'var(--sand-300)'}`, background: addPaymentForm.bank_reconciled ? 'var(--teal-500)' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {addPaymentForm.bank_reconciled && <Check size={14} style={{ color: 'white' }} />}
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: addPaymentForm.bank_reconciled ? 'var(--teal-700)' : 'var(--ink-600)' }}>🏦 Conciliación Bancaria</div>
                          <div style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 2 }}>Marca si está verificado en banco</div>
                        </div>
                      </div>
                    </div>

                    {/* ── Pago de otra unidad ── */}
                    <div style={{ marginTop: 12 }}>
                      <div
                        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14,
                          border: `1.5px solid ${addPaymentForm.applied_to_unit_id ? 'var(--amber-200)' : 'var(--sand-200)'}`,
                          background: addPaymentForm.applied_to_unit_id ? 'var(--amber-50)' : 'var(--sand-50)',
                          borderRadius: 'var(--radius-md)', cursor: 'pointer' }}
                        onClick={e => { e.stopPropagation(); setAddPaymentForm(f => ({ ...f, applied_to_unit_id: f.applied_to_unit_id ? null : '' })); }}
                      >
                        <div style={{ width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                          border: `2px solid ${addPaymentForm.applied_to_unit_id ? 'var(--amber-500)' : 'var(--sand-300)'}`,
                          background: addPaymentForm.applied_to_unit_id ? 'var(--amber-500)' : 'white',
                          display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {addPaymentForm.applied_to_unit_id && <Check size={14} style={{ color: 'white' }} />}
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: addPaymentForm.applied_to_unit_id ? 'var(--amber-700)' : 'var(--ink-600)' }}>
                            🔀 Este pago corresponde a otra unidad
                          </div>
                          <div style={{ fontSize: 11, color: addPaymentForm.applied_to_unit_id ? 'var(--amber-600)' : 'var(--ink-400)', marginTop: 2 }}>
                            Activa si este cobro aplica al estado de cuenta de una unidad diferente
                          </div>
                        </div>
                      </div>
                      {addPaymentForm.applied_to_unit_id !== null && addPaymentForm.applied_to_unit_id !== undefined && (
                        <div className="field" style={{ marginTop: 10 }}>
                          <label className="field-label">Unidad que debe recibir el crédito <span style={{ color: 'var(--coral-500)' }}>*</span></label>
                          <select
                            className="field-select"
                            value={addPaymentForm.applied_to_unit_id || ''}
                            onClick={e => e.stopPropagation()}
                            onChange={e => setAddPaymentForm(f => ({ ...f, applied_to_unit_id: e.target.value || null }))}
                            style={!addPaymentForm.applied_to_unit_id ? { borderColor: 'var(--coral-400)' } : {}}
                          >
                            <option value="">— Seleccionar unidad destino —</option>
                            {units
                              .filter(u => u.id !== showAddPaymentModal?.unit?.id)
                              .map(u => (
                                <option key={u.id} value={u.id}>
                                  {u.unit_id_code}{u.unit_name ? ` — ${u.unit_name}` : ''}{u.responsible_name ? ` (${u.responsible_name})` : ''}
                                </option>
                              ))
                            }
                          </select>
                        </div>
                      )}
                    </div>
                  </>
                );
              })()}
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setShowAddPaymentModal(null)}>Cancelar</button>
              {!isPeriodClosed && (
                <button className="btn btn-primary" onClick={async () => {
                  if (!addPaymentForm.payment_type) { toast.error('La Forma de Pago es obligatoria.'); return; }
                  if (addPaymentForm.applied_to_unit_id === '') { toast.error('Selecciona la unidad destino para este pago.'); return; }
                  const fpx = addPaymentForm.extraFieldPayments || {};
                  const totalAmount = Object.values(fpx).reduce((a, v) => a + (parseFloat(v) || 0), 0);
                  if (totalAmount <= 0) { toast.error('Ingresa al menos un monto mayor a cero.'); return; }
                  setSaving(true);
                  try {
                    const fp = {};
                    Object.entries(fpx).forEach(([k, v]) => {
                      const amt = parseFloat(v) || 0;
                      if (amt > 0) fp[k] = { received: amt };
                    });
                    await paymentsAPI.addAdditional(tenantId, showAddPaymentModal.pay.id, {
                      field_payments: fp,
                      payment_type: addPaymentForm.payment_type,
                      payment_date: addPaymentForm.payment_date || null,
                      notes: addPaymentForm.notes || '',
                      bank_reconciled: !!addPaymentForm.bank_reconciled,
                      applied_to_unit_id: addPaymentForm.applied_to_unit_id || null,
                    });
                    toast.success('Pago adicional registrado');
                    setShowAddPaymentModal(null);
                    load();
                  } catch (err) { toast.error(err.response?.data?.detail || 'Error al registrar'); }
                  finally { setSaving(false); }
                }} disabled={saving}>{saving ? 'Guardando…' : 'Guardar Pago Adicional'}</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Ver / Editar / Eliminar Pagos Adicionales ── */}
      {showAdditionalPaymentsModal && (() => {
        const { unit, pay } = showAdditionalPaymentsModal;
        const additionals = pay?.additional_payments || [];
        const reqEFs = extraFields.filter(f => f.required);
        const optEFs = extraFields.filter(f => !f.required);
        const allEFs = [...reqEFs, ...optEFs];
        const getLabelForField = (fid) => fid === 'maintenance' ? 'Mantenimiento' : fid === 'prevDebt' ? 'Recaudo de adeudos' : (extraFields.find(e => e.id === fid) || {}).label || fid;
        return (
          <div className="modal-bg open" onClick={() => { setShowAdditionalPaymentsModal(null); setEditingAdditional(null); }}>
            <div className="modal lg" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
              <div className="modal-head">
                <h3><Edit size={16} style={{ display: 'inline', verticalAlign: -3, marginRight: 8 }} />Pagos Adicionales — {unit.unit_id_code} — {periodLabel(period)}</h3>
                <button className="modal-close" onClick={() => { setShowAdditionalPaymentsModal(null); setEditingAdditional(null); }}><X size={16} /></button>
              </div>
              <div className="modal-body">
                {additionals.length === 0 && (
                  <div style={{ textAlign: 'center', padding: 30, color: 'var(--ink-300)' }}>Sin pagos adicionales registrados</div>
                )}
                {additionals.map((ap, apIdx) => {
                  const fp = ap.field_payments || {};
                  const total = Object.values(fp).reduce((s, v) => s + (parseFloat((v && v.received != null ? v.received : v) ?? 0) || 0), 0);
                  const pdLabel = ap.payment_date ? new Date(ap.payment_date + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
                  const isEditing = editingAdditional?.id === ap.id;
                  return (
                    <div key={ap.id || apIdx} style={{ border: '1.5px solid var(--blue-100)', borderRadius: 'var(--radius-md)', marginBottom: 12, overflow: 'hidden' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', background: isEditing ? 'var(--blue-50)' : 'var(--sand-50)', borderBottom: '1px solid var(--sand-100)' }}>
                        <div>
                          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--blue-700)' }}>Pago #{apIdx + 2}</span>
                          <span style={{ marginLeft: 10, fontSize: 11, color: 'var(--ink-400)' }}>{pdLabel} · {PAYMENT_TYPES[ap.payment_type]?.label || ap.payment_type || '—'}</span>
                          {ap.bank_reconciled && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: 'var(--teal-600)' }}>🏦</span>}
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {!isPeriodClosed && (
                            <button className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                              onClick={() => setEditingAdditional(isEditing ? null : {
                                id: ap.id,
                                extraFieldPayments: { ...Object.fromEntries(Object.entries(fp).map(([k, v]) => [k, (v && v.received != null ? v.received : v) ?? ''])) },
                                payment_type: ap.payment_type || '',
                                payment_date: ap.payment_date || '',
                                notes: ap.notes || '',
                                bank_reconciled: !!ap.bank_reconciled,
                              })}>
                              <Edit size={12} /> {isEditing ? 'Cancelar' : 'Editar'}
                            </button>
                          )}
                          {!isPeriodClosed && (
                            <button className="btn btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--coral-50)', color: 'var(--coral-600)', border: '1px solid var(--coral-200)' }}
                              onClick={async () => {
                                if (!window.confirm('¿Eliminar este pago adicional?')) return;
                                try {
                                  const res = await paymentsAPI.deleteAdditional(tenantId, pay.id, ap.id);
                                  setShowAdditionalPaymentsModal(prev => ({ ...prev, pay: res.data }));
                                  setEditingAdditional(null);
                                  toast.success('Pago adicional eliminado');
                                  load();
                                } catch (e) { toast.error(e.response?.data?.detail || 'Error al eliminar'); }
                              }}>
                              <Trash2 size={12} /> Eliminar
                            </button>
                          )}
                          {isPeriodClosed && (
                            <span style={{ fontSize: 11, color: 'var(--ink-400)', display: 'flex', alignItems: 'center', gap: 4 }}>
                              <Lock size={11} /> Período cerrado
                            </span>
                          )}
                        </div>
                      </div>
                      {!isEditing && (
                        <div style={{ padding: '10px 16px' }}>
                          {Object.entries(fp).map(([fid, fd]) => {
                            const amt = parseFloat((fd && fd.received != null ? fd.received : fd) ?? 0) || 0;
                            if (amt <= 0) return null;
                            return <div key={fid} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                              <span style={{ color: 'var(--ink-600)' }}>{getLabelForField(fid)}</span>
                              <span style={{ fontWeight: 700, color: 'var(--teal-600)' }}>{fmt(amt)}</span>
                            </div>;
                          })}
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 14, borderTop: '1px solid var(--sand-100)', paddingTop: 8, marginTop: 4, color: 'var(--teal-700)' }}>
                            <span>Total</span><span>{fmt(total)}</span>
                          </div>
                          {ap.notes && <div style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 6 }}><AlertCircle size={11} style={{ display: 'inline', verticalAlign: -2, marginRight: 4 }} />{ap.notes}</div>}
                        </div>
                      )}
                      {isEditing && (
                        <div style={{ padding: '12px 16px' }}>
                          <div style={{ background: 'white', border: '1.5px solid var(--teal-100)', borderRadius: 'var(--radius-md)', overflow: 'hidden', marginBottom: 12 }}>
                            <div style={{ padding: '6px 12px', background: 'var(--teal-50)', fontSize: 10, fontWeight: 800, color: 'var(--teal-700)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Conceptos</div>
                            {[{ id: 'maintenance', label: 'Mantenimiento' }, ...allEFs].map(ef => (
                              <div key={ef.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderBottom: '1px solid var(--sand-50)' }}>
                                <span style={{ fontSize: 13, color: 'var(--ink-700)' }}>{getLabelForField(ef.id)}</span>
                                <input type="number" className="field-input" min={0} step={0.01} style={{ width: 100, textAlign: 'right' }} placeholder="0.00"
                                  value={editingAdditional?.extraFieldPayments?.[ef.id] ?? ''}
                                  onChange={e => setEditingAdditional(prev => ({ ...prev, extraFieldPayments: { ...(prev.extraFieldPayments || {}), [ef.id]: e.target.value } }))} />
                              </div>
                            ))}
                          </div>
                          <div className="grid-2" style={{ gap: 10, marginBottom: 10 }}>
                            <div className="field">
                              <label className="field-label">Forma de Pago</label>
                              <select className="field-select" value={editingAdditional?.payment_type || ''} onChange={e => setEditingAdditional(prev => ({ ...prev, payment_type: e.target.value }))}>
                                <option value="">— Seleccionar —</option>
                                <option value="transferencia">🏦 Transferencia</option>
                                <option value="deposito">💵 Depósito</option>
                                <option value="efectivo">💰 Efectivo</option>
                              </select>
                            </div>
                            <div className="field">
                              <label className="field-label">Fecha de Pago</label>
                              <input type="date" className="field-input" value={editingAdditional?.payment_date || ''} onChange={e => setEditingAdditional(prev => ({ ...prev, payment_date: e.target.value }))} />
                            </div>
                            <div className="field" style={{ gridColumn: '1 / -1' }}>
                              <label className="field-label">Notas</label>
                              <input className="field-input" value={editingAdditional?.notes || ''} onChange={e => setEditingAdditional(prev => ({ ...prev, notes: e.target.value }))} />
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, cursor: 'pointer' }}
                            onClick={e => { e.stopPropagation(); setEditingAdditional(prev => ({ ...prev, bank_reconciled: !prev.bank_reconciled })); }}>
                            <div style={{ width: 20, height: 20, borderRadius: 5, border: `2px solid ${editingAdditional?.bank_reconciled ? 'var(--teal-500)' : 'var(--sand-300)'}`, background: editingAdditional?.bank_reconciled ? 'var(--teal-500)' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              {editingAdditional?.bank_reconciled && <Check size={12} style={{ color: 'white' }} />}
                            </div>
                            <span style={{ fontSize: 12, fontWeight: 600, color: editingAdditional?.bank_reconciled ? 'var(--teal-700)' : 'var(--ink-500)' }}>🏦 Conciliado en Banco</span>
                          </div>
                          <button className="btn btn-primary" style={{ width: '100%' }} disabled={saving} onClick={async () => {
                            const fpx = editingAdditional?.extraFieldPayments || {};
                            const newFP = {};
                            Object.entries(fpx).forEach(([k, v]) => { const amt = parseFloat(v) || 0; if (amt > 0) newFP[k] = { received: amt }; });
                            setSaving(true);
                            try {
                              const res = await paymentsAPI.updateAdditional(tenantId, pay.id, editingAdditional.id, {
                                field_payments: newFP,
                                payment_type: editingAdditional.payment_type,
                                payment_date: editingAdditional.payment_date || null,
                                notes: editingAdditional.notes || '',
                                bank_reconciled: !!editingAdditional.bank_reconciled,
                              });
                              setShowAdditionalPaymentsModal(prev => ({ ...prev, pay: res.data }));
                              setEditingAdditional(null);
                              toast.success('Pago adicional actualizado');
                              load();
                            } catch (e) { toast.error(e.response?.data?.detail || 'Error al actualizar'); }
                            finally { setSaving(false); }
                          }}><Check size={14} /> {saving ? 'Guardando…' : 'Guardar cambios'}</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="modal-foot">
                <button className="btn btn-secondary" onClick={() => { setShowAdditionalPaymentsModal(null); setEditingAdditional(null); }}>Cerrar</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Capture Modal ── */}
      {showCapture && (() => {
        const reqEFs = extraFields.filter(ef => ef.required);
        const optEFs = extraFields.filter(ef => !ef.required);
        const allEFs = [...reqEFs, ...optEFs];
        const isUnitExempt = !!showCapture.admin_exempt;
        // Para unidades exentas: el cargo de mantenimiento es 0
        const maintCharge = isUnitExempt ? 0 : maintenanceFee;
        const maintAbono = isUnitExempt ? 0 : Math.min(parseFloat(captureForm.field_payments?.maintenance?.received) || 0, maintenanceFee);
        let totalReqCharge = maintCharge, totalReqAbono = maintAbono;
        reqEFs.forEach(ef => {
          const ch = parseFloat(ef.default_amount) || 0;
          const ab = Math.min(parseFloat(captureForm.field_payments?.[ef.id]?.received) || 0, ch);
          totalReqCharge += ch; totalReqAbono += ab;
        });
        const totalReqSaldo = Math.max(0, totalReqCharge - totalReqAbono);
        const totalOptAbono = optEFs.reduce((s, ef) => s + (parseFloat(captureForm.field_payments?.[ef.id]?.received) || 0), 0);
        // Parcial: mantenimiento fijo sin captura + al menos un campo adicional activo con pago
        const maintCaptured = isUnitExempt ? 0 : (parseFloat(captureForm.field_payments?.maintenance?.received) || 0);
        const hasNonMaintPayment = reqEFs.some(ef => (parseFloat(captureForm.field_payments?.[ef.id]?.received) || 0) > 0)
          || optEFs.some(ef => (parseFloat(captureForm.field_payments?.[ef.id]?.received) || 0) > 0);
        const autoStatus = (isUnitExempt && totalReqCharge === 0) ? 'pagado'
          : (totalReqAbono >= totalReqCharge ? 'pagado'
          : (maintCaptured === 0 && hasNonMaintPayment ? 'parcial' : 'pendiente'));
        const obligFields = [{ id: 'maintenance', label: 'Mantenimiento', charge: maintCharge }, ...reqEFs.map(ef => ({ id: ef.id, label: ef.label, charge: parseFloat(ef.default_amount) || 0 }))];
        const totalAdelantoCount = obligFields.reduce((s, fd) => s + Object.keys(captureForm.field_payments?.[fd.id]?.adelantoTargets || {}).length, 0);
        const prevDebt = parseFloat(showCapture.previous_debt) || 0;
        // Abono ya capturado a deuda anterior
        const prevDebtCaptured = Object.values(captureForm.adeudo_payments?.__prevDebt || {})
          .reduce((s, v) => s + (parseFloat(v) || 0), 0);
        const netPrevDebt = Math.max(0, prevDebt - prevDebtCaptured);
        // Lista final para el panel: deuda anterior + períodos reales cargados
        const hasDeudaAnterior = prevDebt > 0;
        const hasPeriodosDeuda = captureUnitPeriods.length > 0 || captureUnitPeriodsLoading;
        const hasAnyDebt = hasDeudaAnterior || hasPeriodosDeuda;
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
                  {(() => {
                    const isExempt = !!showCapture.admin_exempt;
                    return (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 120px 85px', gap: 0, alignItems: 'center', padding: '11px 16px', borderBottom: '1px solid var(--sand-50)', background: isExempt ? 'var(--teal-50)' : undefined }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-800)' }}>Mantenimiento <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--coral-500)', background: 'var(--coral-50)', padding: '2px 6px', borderRadius: 4 }}>Oblig.</span></div>
                        <div style={{ fontSize: 11, color: isExempt ? 'var(--teal-600)' : 'var(--ink-400)' }}>{isExempt ? '🛡 Unidad Exenta — sin cargo de mantenimiento' : 'Cuota base fija'}</div>
                      </div>
                      <div style={{ textAlign: 'right', fontSize: 15, fontWeight: 700, color: isExempt ? 'var(--teal-500)' : 'var(--ink-700)' }}>{isExempt ? '—' : fmt(maintCharge)}</div>
                      <div style={{ textAlign: 'right' }}>
                        {isExempt
                          ? <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--teal-600)', background: 'var(--teal-100)', padding: '4px 10px', borderRadius: 6 }}>Exento ✓</span>
                          : <input type="number" className="field-input" min={0} step="0.01" style={{ textAlign: 'right', maxWidth: 100 }}
                              value={captureForm.field_payments?.maintenance?.received ?? ''}
                              onChange={e => setReceived('maintenance', e.target.value)} />
                        }
                      </div>
                      <div style={{ textAlign: 'right', fontWeight: 700, fontSize: 13, color: 'var(--teal-600)' }}>
                        {isExempt ? '✓' : (maintCharge - maintAbono === 0 ? '✓' : fmt(maintCharge - maintAbono))}
                      </div>
                    </div>
                    );
                  })()}
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

                {/* SECCIÓN 4: ADEUDOS — separado en Deuda Anterior y Períodos No Pagados */}
                {hasAnyDebt && (
                  <div style={{ marginTop: 8, border: '1.5px solid var(--coral-200)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>

                    {/* ── Toggle principal ── */}
                    <button type="button"
                      style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', background: 'var(--coral-50)', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)' }}
                      onClick={() => setCaptureForm(p => ({ ...p, showAdeudoPanel: !p.showAdeudoPanel }))}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700, color: 'var(--coral-700)' }}>
                        <AlertCircle size={14} />
                        Abonos a Adeudos
                        {hasDeudaAnterior && <span style={{ background: 'var(--coral-200)', color: 'var(--coral-700)', borderRadius: 4, padding: '1px 6px', fontSize: 10 }}>⚠ Deuda anterior</span>}
                        {captureUnitPeriods.length > 0 && <span style={{ background: 'var(--amber-100)', color: 'var(--amber-700)', borderRadius: 4, padding: '1px 6px', fontSize: 10 }}>📅 {captureUnitPeriods.length} período(s)</span>}
                        {captureUnitPeriodsLoading && <span style={{ fontSize: 10, color: 'var(--ink-400)' }}>Cargando…</span>}
                      </span>
                      <span style={{ fontSize: 12, color: 'var(--ink-400)' }}>{captureForm.showAdeudoPanel ? '▲' : '▼'}</span>
                    </button>

                    {captureForm.showAdeudoPanel && (
                      <div>

                        {/* ════ BLOQUE A: DEUDA ANTERIOR ════ */}
                        {hasDeudaAnterior && (() => {
                          const ds = captureForm.adeudo_payments?.__prevDebt || {};
                          const capturedPrev = Object.values(ds).reduce((a, v) => a + (parseFloat(v) || 0), 0);
                          const selPrev = !!(captureForm.adeudoSelections?.__prevDebt);
                          return (
                            <div style={{ borderBottom: '2px solid var(--coral-100)' }}>
                              {/* Sub-header */}
                              <div style={{ padding: '7px 16px', background: 'var(--coral-100)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--coral-700)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                                  ⚠ Deuda Anterior al Período Inicial
                                </span>
                                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--coral-600)' }}>
                                  Saldo: {fmt(netPrevDebt)}
                                  {capturedPrev > 0 && <span style={{ color: 'var(--teal-600)', marginLeft: 6 }}>· Abonando: {fmt(capturedPrev)}</span>}
                                </span>
                              </div>
                              {/* Fila con checkbox */}
                              <div
                                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', cursor: 'pointer', background: selPrev ? 'var(--coral-50)' : 'white' }}
                                onClick={() => toggleAdeudoPeriod('__prevDebt')}
                              >
                                <div style={{ width: 20, height: 20, borderRadius: 6, border: `2px solid ${selPrev ? 'var(--coral-400)' : 'var(--sand-300)'}`, background: selPrev ? 'var(--coral-400)' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                  {selPrev && <Check size={12} style={{ color: 'white' }} />}
                                </div>
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-800)' }}>Saldo acumulado previo al inicio del sistema</div>
                                  <div style={{ fontSize: 11, color: 'var(--coral-500)' }}>Total deuda anterior: {fmt(prevDebt)}{capturedPrev > 0 ? ` · Pendiente: ${fmt(netPrevDebt)}` : ''}</div>
                                </div>
                                <span style={{ fontSize: 11, color: 'var(--ink-400)' }}>{selPrev ? '▲ cerrar' : '▼ aplicar abono'}</span>
                              </div>
                              {/* Inputs de captura */}
                              {selPrev && (
                                <div style={{ padding: '10px 16px 14px', background: 'var(--coral-50)', borderTop: '1px solid var(--coral-100)' }}>
                                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--coral-700)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                                    Monto a abonar a deuda anterior:
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <div style={{ flex: 1 }}>
                                      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-700)' }}>Abono a deuda anterior</label>
                                      <input type="number" className="field-input" min={0} max={prevDebt} step="0.01"
                                        style={{ marginTop: 4, maxWidth: 160 }}
                                        value={ds.prevDebt ?? ''}
                                        onChange={e => setAdeudoSelection('__prevDebt', 'prevDebt', e.target.value)} />
                                    </div>
                                    {capturedPrev > 0 && (
                                      <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: 10, color: 'var(--ink-400)' }}>Abonando</div>
                                        <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--teal-700)' }}>{fmt(capturedPrev)}</div>
                                        <div style={{ fontSize: 10, color: 'var(--coral-500)' }}>Queda: {fmt(Math.max(0, netPrevDebt - capturedPrev))}</div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })()}

                        {/* ════ BLOQUE B: PERÍODOS NO PAGADOS ════ */}
                        <div>
                          {/* Sub-header */}
                          <div style={{ padding: '7px 16px', background: 'var(--amber-50)', borderBottom: '1px solid var(--amber-100)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--amber-700)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                              📅 Períodos Anteriores No Pagados
                            </span>
                            {!captureUnitPeriodsLoading && (
                              <span style={{ fontSize: 11, color: 'var(--amber-700)', fontWeight: 600 }}>
                                {captureUnitPeriods.length > 0
                                  ? `${captureUnitPeriods.length} período(s) · Total: ${fmt(captureUnitPeriods.reduce((s, p) => s + p.saldoPeriodo, 0))}`
                                  : 'Sin períodos con saldo pendiente'}
                              </span>
                            )}
                          </div>

                          {/* Estado de carga */}
                          {captureUnitPeriodsLoading && (
                            <div style={{ padding: '16px', textAlign: 'center', color: 'var(--ink-400)', fontSize: 13 }}>
                              Cargando períodos con adeudo…
                            </div>
                          )}

                          {/* Sin períodos */}
                          {!captureUnitPeriodsLoading && captureUnitPeriods.length === 0 && (
                            <div style={{ padding: '12px 16px', color: 'var(--ink-400)', fontSize: 12, fontStyle: 'italic' }}>
                              No se encontraron períodos anteriores con saldo pendiente.
                            </div>
                          )}

                          {/* Lista de períodos con deuda */}
                          {!captureUnitPeriodsLoading && captureUnitPeriods.map(d => {
                            const ds = captureForm.adeudo_payments?.[d.period] || {};
                            const capturedTotal = Object.values(ds).reduce((a, v) => a + (parseFloat(v) || 0), 0);
                            const sel = !!(captureForm.adeudoSelections?.[d.period]);
                            const remaining = Math.max(0, d.saldoPeriodo - capturedTotal);
                            return (
                              <div key={d.period} style={{ borderBottom: '1px solid var(--amber-50)' }}>
                                {/* Fila con checkbox */}
                                <div
                                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', cursor: 'pointer', background: sel ? 'var(--amber-50)' : 'white' }}
                                  onClick={() => toggleAdeudoPeriod(d.period)}
                                >
                                  <div style={{ width: 20, height: 20, borderRadius: 6, border: `2px solid ${sel ? 'var(--amber-500)' : 'var(--sand-300)'}`, background: sel ? 'var(--amber-500)' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    {sel && <Check size={12} style={{ color: 'white' }} />}
                                  </div>
                                  <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-800)' }}>{periodLabel(d.period)}</div>
                                    <div style={{ fontSize: 11, color: 'var(--amber-700)', fontWeight: 600 }}>
                                      Cargo: {fmt(d.charge)} · Pagado: {fmt(d.paid)} · <strong>Saldo: {fmt(d.saldoPeriodo)}</strong>
                                      {capturedTotal > 0 && <span style={{ color: 'var(--teal-600)', marginLeft: 4 }}>· Abonando: {fmt(capturedTotal)}</span>}
                                    </div>
                                  </div>
                                  <span style={{ fontSize: 11, color: 'var(--ink-400)' }}>{sel ? '▲ cerrar' : '▼ aplicar abono'}</span>
                                </div>
                                {/* Inputs de captura por campo */}
                                {sel && (
                                  <div style={{ padding: '10px 16px 14px', background: 'var(--amber-50)', borderTop: '1px solid var(--amber-100)' }}>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--amber-700)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                                      Abono por concepto — {periodLabel(d.period)}:
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
                                      <div>
                                        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-700)' }}>Mantenimiento</label>
                                        <input type="number" className="field-input" min={0} step="0.01"
                                          style={{ marginTop: 4 }}
                                          placeholder="0.00"
                                          value={ds.maintenance ?? ''}
                                          onChange={e => setAdeudoSelection(d.period, 'maintenance', e.target.value)} />
                                      </div>
                                    </div>
                                    {capturedTotal > 0 && (
                                      <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'white', border: '1px solid var(--amber-200)', borderRadius: 'var(--radius-sm)' }}>
                                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--amber-700)' }}>Total abonado a {periodLabel(d.period)}</span>
                                        <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--teal-700)' }}>
                                          {fmt(capturedTotal)}
                                          {remaining > 0.01 && <span style={{ fontSize: 11, color: 'var(--coral-500)', marginLeft: 6 }}>· Queda: {fmt(remaining)}</span>}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}

                          {/* Totales de lo que se está abonando a períodos */}
                          {captureUnitPeriods.some(d => Object.values(captureForm.adeudo_payments?.[d.period] || {}).reduce((s, v) => s + (parseFloat(v) || 0), 0) > 0) && (
                            <div style={{ padding: '8px 16px', background: 'var(--amber-50)', borderTop: '1px solid var(--amber-100)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--amber-700)' }}>Total abonado a períodos no pagados</span>
                              <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--teal-700)' }}>
                                {fmt(captureUnitPeriods.reduce((s, d) => s + Object.values(captureForm.adeudo_payments?.[d.period] || {}).reduce((a, v) => a + (parseFloat(v) || 0), 0), 0))}
                              </span>
                            </div>
                          )}
                        </div>

                      </div>
                    )}
                  </div>
                )}

                {/* SECCIÓN 5: Información del Pago */}
                <div style={{ marginTop: 16, fontSize: 12, fontWeight: 700, color: 'var(--ink-500)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Información del Pago</div>
                <div className="grid-2" style={{ gap: 12, marginTop: 8 }}>
                  <div className="field">
                    {/* Exento automático: unidad exenta sin ingresos en campos adicionales activos */}
                    <label className="field-label">Forma de Pago {(!isUnitExempt || hasNonMaintPayment) && <span style={{ color: 'var(--coral-500)' }}>*</span>}</label>
                    {(isUnitExempt && !hasNonMaintPayment) ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--teal-50)', border: '1.5px solid var(--teal-200)', borderRadius: 'var(--radius-md)' }}>
                        <span style={{ fontSize: 15 }}>🛡</span>
                        <span style={{ fontWeight: 700, color: 'var(--teal-700)', fontSize: 13 }}>Exento — Sin costo para esta unidad</span>
                      </div>
                    ) : (
                      <select className="field-select"
                        value={captureForm.payment_type === 'excento' ? '' : captureForm.payment_type}
                        onChange={e => setCaptureForm({ ...captureForm, payment_type: e.target.value })}
                        style={(!captureForm.payment_type || captureForm.payment_type === 'excento') ? { borderColor: 'var(--coral-400)' } : {}}>
                        <option value="">— Seleccionar (obligatorio) —</option>
                        <option value="transferencia">🏦 Transferencia</option>
                        <option value="deposito">💵 Depósito en efectivo</option>
                        <option value="efectivo">💰 Efectivo directo</option>
                      </select>
                    )}
                  </div>
                  <div className="field">
                    <label className="field-label">Fecha de Pago</label>
                    <input type="date" className="field-input" value={captureForm.payment_date}
                      onChange={e => setCaptureForm({ ...captureForm, payment_date: e.target.value })} />
                  </div>
                  <div className="field">
                    <label className="field-label">Folio (opcional)</label>
                    <input className="field-input" placeholder="Ej. REC-0001" value={captureForm.folio || ''}
                      onChange={e => setCaptureForm(p => ({ ...p, folio: e.target.value }))} />
                  </div>
                  <div className="field" style={{ gridColumn: '1 / -1' }}>
                    <label className="field-label">Notas (opcional)</label>
                    <input className="field-input" placeholder="Referencia, observaciones..." value={captureForm.notes || ''}
                      onChange={e => setCaptureForm(p => ({ ...p, notes: e.target.value }))} />
                  </div>
                </div>

                {/* SECCIÓN: Conciliación Bancaria */}
                <div style={{ marginTop: 14, padding: 14, border: `1.5px solid ${captureForm.bank_reconciled ? 'var(--teal-200)' : 'var(--sand-200)'}`, background: captureForm.bank_reconciled ? 'var(--teal-50)' : 'var(--sand-50)', borderRadius: 'var(--radius-md)', cursor: 'pointer' }} onClick={e => { e.stopPropagation(); setCaptureForm(p => ({ ...p, bank_reconciled: !p.bank_reconciled })); }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${captureForm.bank_reconciled ? 'var(--teal-500)' : 'var(--sand-300)'}`, background: captureForm.bank_reconciled ? 'var(--teal-500)' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {captureForm.bank_reconciled && <Check size={14} style={{ color: 'white' }} />}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: captureForm.bank_reconciled ? 'var(--teal-700)' : 'var(--ink-600)' }}>🏦 Conciliación Bancaria</div>
                      <div style={{ fontSize: 11, color: captureForm.bank_reconciled ? 'var(--teal-600)' : 'var(--ink-400)', marginTop: 2 }}>
                        {captureForm.bank_reconciled ? '✓ Este ingreso está confirmado en el estado de cuenta bancario' : 'Marca esta casilla si el ingreso está verificado en el banco'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* SECCIÓN 6: Evidencia */}
                <div style={{ marginTop: 12, fontSize: 12, fontWeight: 700, color: 'var(--ink-500)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Evidencia de Pago (opcional)</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
                  <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
                    <Upload size={14} style={{ display: 'inline', verticalAlign: -2 }} /> Adjuntar
                    <input type="file" multiple style={{ display: 'none' }} onChange={handleEvidence} />
                  </label>
                  {(captureForm.evidences || []).length === 0 && (
                    <span style={{ fontSize: 12, color: 'var(--ink-300)' }}>Imagen, PDF u otro archivo — máx. 5 MB por archivo</span>
                  )}
                </div>
                {(captureForm.evidences || []).length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                    {(captureForm.evidences || []).map((ev, idx) => (
                      <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--blue-50)', border: '1px solid var(--blue-100)', padding: '6px 12px', borderRadius: 'var(--radius-sm)' }}>
                        <FileText size={14} style={{ flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: 'var(--blue-600)', fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.name || `Evidencia ${idx + 1}`}</span>
                        <button type="button" className="btn btn-secondary btn-sm" style={{ padding: '3px 8px', fontSize: 11, flexShrink: 0 }}
                          onClick={() => setEvidencePopup({ b64: ev.data, mime: ev.mime || '', fileName: ev.name || `Evidencia ${idx + 1}` })}>
                          Ver
                        </button>
                        <button type="button" className="btn-ghost" style={{ color: 'var(--coral-500)', padding: 0, marginLeft: 2, flexShrink: 0 }}
                          onClick={() => setCaptureForm(p => ({ ...p, evidences: p.evidences.filter((_, i) => i !== idx) }))}>✕</button>
                      </div>
                    ))}
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
        return (
          <PaymentReceiptModal
            pay={pay}
            unit={unit}
            tc={tenantData}
            extraFields={allNormalFields}
            reservations={receiptReservations}
            onClose={() => setShowReceipt(null)}
          />
        );
      })()}

      {/* ── Popup visor de evidencia (adjuntos) ── */}
      {evidencePopup && (() => {
        const { b64, mime, fileName } = evidencePopup;
        const isPdf = mime === 'application/pdf' || b64.startsWith('JVBER') || /\.pdf$/i.test(fileName || '');
        const isImage = (mime && mime.startsWith('image/'))
          || b64.startsWith('iVBOR')   // PNG
          || b64.startsWith('/9j/')    // JPEG
          || b64.startsWith('R0lGO')   // GIF
          || b64.startsWith('UklGR');  // WebP
        const effectiveMime = isPdf ? 'application/pdf'
          : mime && mime !== 'application/octet-stream' ? mime
          : b64.startsWith('iVBOR') ? 'image/png'
          : b64.startsWith('/9j/')  ? 'image/jpeg'
          : b64.startsWith('R0lGO') ? 'image/gif'
          : b64.startsWith('UklGR') ? 'image/webp'
          : 'application/octet-stream';
        return (
          <div className="modal-bg open" style={{ zIndex: 9999 }} onClick={() => setEvidencePopup(null)}>
            <div className="modal lg" onClick={e => e.stopPropagation()} style={{ maxWidth: 820, width: '92vw' }}>
              <div className="modal-head">
                <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <FileText size={16} /> {fileName || 'Evidencia de Pago'}
                </h3>
                <button className="modal-close" onClick={() => setEvidencePopup(null)}><X size={16} /></button>
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
      })()}
    </div>
  );
}
