/**
 * Homly — Plan de Pagos
 * Módulo dedicado para gestionar planes de pago de adeudos.
 * - Managers (admin/tesorero/contador/auditor): seleccionan unidad, crean propuestas con hasta 3 opciones.
 * - Vecinos: ven las opciones que les enviaron y eligen una; la opción aceptada queda en firme.
 */
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { reportsAPI, tenantsAPI, paymentPlansAPI, periodsAPI, unitsAPI } from '../api/client';
import { todayPeriod, periodLabel, prevPeriod } from '../utils/helpers';
import {
  TrendingDown, Search, X, Send, Printer,
  ChevronLeft, Building, CheckCircle, Calendar, Plus, Trash2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import PlanPagosPrintModal from '../components/PlanPagosPrintModal';

// ─── Constants ───────────────────────────────────────────────────────────────
const PLAN_FREQUENCIES = [
  { value: 1, label: 'Mensual',    sublabel: 'Cada mes',     max: 12 },
  { value: 2, label: 'Bimestral',  sublabel: 'Cada 2 meses', max: 6  },
  { value: 3, label: 'Trimestral', sublabel: 'Cada 3 meses', max: 4  },
  { value: 6, label: 'Semestral',  sublabel: 'Cada 6 meses', max: 2  },
];

const PLAN_STATUS_LABELS = {
  draft:     'Borrador',
  sent:      'Enviado',
  accepted:  'Activo',
  rejected:  'Rechazado',
  completed: 'Completado',
  cancelled: 'Cancelado',
};
const PLAN_STATUS_COLORS = {
  draft:     '#d97706',
  sent:      '#2563eb',
  accepted:  '#0d7c6e',
  rejected:  '#e84040',
  completed: '#1E594F',
  cancelled: '#64748b',
};

const INSTALL_STATUS_COLOR = { paid: '#1E594F', partial: '#d97706', pending: '#e84040' };
const INSTALL_STATUS_LABEL = { paid: 'Pagado', partial: 'Parcial', pending: 'Pendiente' };

function _fmt(n, currency = 'MXN') {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency', currency,
    minimumFractionDigits: 0, maximumFractionDigits: 2,
  }).format(n || 0);
}

// Build installments preview for a given option config
function buildInstallmentRows(totalDebt, maintenanceFee, opt) {
  const { freq, numPagos, applyInterest, interestRate, startPeriod } = opt;
  const total = applyInterest && interestRate > 0
    ? totalDebt * (1 + interestRate / 100)
    : totalDebt;
  const debtPer    = numPagos > 0 ? total / numPagos : 0;
  const regularPer = maintenanceFee * freq;

  function nextPeriod(yyyymm, steps = 1) {
    let y = parseInt(yyyymm.slice(0, 4)), m = parseInt(yyyymm.slice(5, 7));
    for (let i = 0; i < steps; i++) {
      m++; if (m > 12) { m = 1; y++; }
    }
    return `${y.toString().padStart(4, '0')}-${m.toString().padStart(2, '0')}`;
  }
  function periodLbl(yyyymm) {
    const months = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                    'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    const y = parseInt(yyyymm.slice(0, 4)), m = parseInt(yyyymm.slice(5, 7));
    return `${months[m - 1]} ${y}`;
  }
  const base = startPeriod || todayPeriod();
  return Array.from({ length: numPagos }, (_, i) => {
    const pk = i === 0 ? base : nextPeriod(base, i);
    return {
      num: i + 1, period_key: pk, period_label: periodLbl(pk),
      debt_part: debtPer, regular_part: regularPer, total: debtPer + regularPer,
      paid_amount: 0, status: 'pending',
    };
  });
}

// Default option config
function defaultOption(startPeriod) {
  return { freq: 1, numPagos: 6, applyInterest: false, interestRate: 5, startPeriod: startPeriod || todayPeriod(), notes: '' };
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function PlanPagos() {
  const { tenantId, role } = useAuth();
  const [searchParams] = useSearchParams();

  const isManager  = ['admin', 'tesorero', 'superadmin'].includes(role);
  const isReadOnly = ['contador', 'auditor'].includes(role);
  const isVecino   = role === 'vecino';
  const canWrite   = isManager;

  // Tracks which unit_id we've already fetched via fallback to avoid repeated calls
  const fallbackFetchedRef = useRef(null);

  // ─── Periodo de corte ──────────────────────────────────────────────────────
  const [cutoff,        setCutoff]        = useState(todayPeriod());
  const [closedPeriods, setClosedPeriods] = useState([]);

  // ─── Tenant & units ────────────────────────────────────────────────────────
  const [tenantData,    setTenantData]    = useState(null);
  const [adeudosItems,  setAdeudosItems]  = useState([]);
  const [adeudosLoading, setAdeudosLoading] = useState(false);
  const [unitSearch,    setUnitSearch]    = useState('');
  // ─── Paginación vista de unidades con adeudos ──────────────────────
  const [pageSize,      setPageSize]      = useState(10);   // 10 | 25 | 50
  const [currentPage,   setCurrentPage]   = useState(1);
  const [selectedUnit,       setSelectedUnit]       = useState(null);
  const [selectedDebt,       setSelectedDebt]       = useState(0);
  const [selectedAdeudoItem, setSelectedAdeudoItem] = useState(null);

  // ─── Plans state ───────────────────────────────────────────────────────────
  const [plans,        setPlans]        = useState([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [tab,          setTab]          = useState('list');   // 'list' | 'new'

  // Cancel dialog
  const [cancelDialog, setCancelDialog] = useState(null); // null | { plan }
  const [cancelReason, setCancelReason] = useState('');

  // ─── Print modal ───────────────────────────────────────────────────────────
  const [printPlan, setPrintPlan] = useState(null); // plan to print

  // ─── Diálogo de selección de destinatarios ────────────────────────
  // Abre cuando el usuario pulsa "Enviar propuesta"; permite marcar/desmarcar
  // propietario y copropietario antes de realmente enviar.
  const [recipientDialog, setRecipientDialog] = useState(null);
  // null | { sendOwner: bool, sendCoowner: bool, ownerEmail: str, coownerEmail: str }

  // ─── Multi-option proposal form ────────────────────────────────────────────
  const [options,  setOptions]  = useState([defaultOption()]);  // up to 3
  const [sharedNotes, setSharedNotes] = useState('');
  const [termsConditions, setTermsConditions] = useState('');
  const [saving,   setSaving]   = useState(false);
  const [activeOptIdx, setActiveOptIdx] = useState(0);

  const maintenanceFee = parseFloat(tenantData?.maintenance_fee || 0);
  // Currency-aware formatter (shadows module-level _fmt)
  const cur = tenantData?.currency || 'MXN';
  const fmt = (n) => _fmt(n, cur);

  // ─── Load tenant ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!tenantId) return;
    tenantsAPI.get(tenantId).then(r => setTenantData(r.data)).catch(() => {});
  }, [tenantId]);

  // ─── Load closed periods for the cutoff selector ───────────────────────────
  useEffect(() => {
    if (!tenantId || isVecino) return;
    periodsAPI.closedList(tenantId)
      .then(r => setClosedPeriods(Array.isArray(r.data) ? r.data : (r.data?.results || [])))
      .catch(() => setClosedPeriods([]));
  }, [tenantId, isVecino]);

  // ─── Load units with adeudos (managers) ────────────────────────────────────
  const loadUnits = useCallback(() => {
    if (!tenantId || isVecino) return;
    setAdeudosLoading(true);
    setSelectedUnit(null);
    setSelectedDebt(0);
    setSelectedAdeudoItem(null);
    reportsAPI.reporteAdeudos(tenantId, { cutoff })
      .then(r => setAdeudosItems(r.data?.units || []))
      .catch(() => toast.error('No se pudieron cargar las unidades.'))
      .finally(() => setAdeudosLoading(false));
  }, [tenantId, isVecino, cutoff]);

  useEffect(() => { loadUnits(); }, [loadUnits]);

  // ─── Auto-select unit from URL ?unit_id= ─────────────────────────────────
  useEffect(() => {
    const uid = searchParams.get('unit_id');
    if (!uid || isVecino) return;
    const item = adeudosItems.find(i => String((i.unit || {}).id) === String(uid));
    if (item) {
      fallbackFetchedRef.current = null;
      setSelectedUnit(item.unit);
      setSelectedDebt(parseFloat(item.total_adeudo || 0));
      setSelectedAdeudoItem(item);
      return;
    }
    if (!adeudosLoading && tenantId && fallbackFetchedRef.current !== uid) {
      fallbackFetchedRef.current = uid;
      unitsAPI.get(tenantId, uid)
        .then(r => { setSelectedUnit(r.data); setSelectedDebt(0); setSelectedAdeudoItem(null); })
        .catch(() => { fallbackFetchedRef.current = null; });
    }
  }, [adeudosItems, adeudosLoading, searchParams, tenantId, isVecino]);

  // ─── Load plans for selected unit ─────────────────────────────────────────
  const loadPlans = useCallback(async () => {
    if (!tenantId) return;
    const params = isVecino
      ? { page_size: 1000 }
      : { unit_id: selectedUnit?.id, page_size: 1000 };
    if (!isVecino && !selectedUnit?.id) { setPlans([]); return; }
    setPlansLoading(true);
    try {
      const res = await paymentPlansAPI.list(tenantId, params);
      const data = res.data;
      setPlans(Array.isArray(data) ? data : (data?.results || []));
    } catch {
      toast.error('No se pudieron cargar los planes de pago.');
    } finally {
      setPlansLoading(false);
    }
  }, [tenantId, selectedUnit?.id, isVecino]);

  useEffect(() => {
    loadPlans();
    setSelectedPlan(null);
    setTab('list');
  }, [loadPlans]);

  // ─── Period options for the cutoff selector ──────────────────────────────
  const periodOptions = useMemo(() => {
    const today = todayPeriod();
    const set = new Set();
    let p = today;
    for (let i = 0; i < 13; i++) { set.add(p); p = prevPeriod(p); }
    closedPeriods.forEach(cp => { if (cp.period) set.add(cp.period); });
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [closedPeriods]);

  // Start-period options (next 12 months from today)
  const startPeriodOptions = useMemo(() => {
    const opts = [];
    let p = todayPeriod();
    for (let i = 0; i < 13; i++) { opts.push(p); p = prevPeriod(p); }
    // also add next 6 months forward
    p = todayPeriod();
    for (let i = 0; i < 7; i++) {
      let y = parseInt(p.slice(0, 4)), m = parseInt(p.slice(5, 7));
      m++; if (m > 12) { m = 1; y++; }
      p = `${y.toString().padStart(4, '0')}-${m.toString().padStart(2, '0')}`;
      opts.unshift(p);
    }
    return [...new Set(opts)].sort((a, b) => b.localeCompare(a));
  }, []);

  // ─── Filtered units list ──────────────────────────────────────────────────
  const filteredItems = useMemo(() => {
    if (!unitSearch.trim()) return adeudosItems;
    const q = unitSearch.toLowerCase();
    return adeudosItems.filter(item => {
      const u = item.unit || {};
      return (
        (u.unit_id_code || '').toLowerCase().includes(q) ||
        (u.unit_name    || '').toLowerCase().includes(q) ||
        (u.responsible_name || '').toLowerCase().includes(q)
      );
    });
  }, [adeudosItems, unitSearch]);

  // ─── Paginación derivada ───────────────────────────────────────────
  const totalItems = filteredItems.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  // Clamp de página cuando cambian los filtros o el tamaño
  const safePage = Math.min(currentPage, totalPages);
  useEffect(() => {
    if (currentPage !== safePage) setCurrentPage(safePage);
  }, [safePage, currentPage]);
  // Reset a la página 1 al cambiar búsqueda o tamaño de página
  useEffect(() => { setCurrentPage(1); }, [unitSearch, pageSize]);
  const pagedItems = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, safePage, pageSize]);

  // ─── Actions ───────────────────────────────────────────────────────────────
  const handleAccept = async (plan) => {
    setActionLoading(true);
    try {
      await paymentPlansAPI.accept(tenantId, plan.id);
      toast.success('¡Plan aceptado! Se incluirá en tu cobranza mensual.');
      await loadPlans();
      setSelectedPlan(null);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Error al aceptar el plan.');
    } finally { setActionLoading(false); }
  };

  const handleReject = async (plan) => {
    setActionLoading(true);
    try {
      await paymentPlansAPI.reject(tenantId, plan.id);
      toast.success('Plan rechazado.');
      await loadPlans();
      setSelectedPlan(null);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Error al rechazar el plan.');
    } finally { setActionLoading(false); }
  };

  const handleCancel = (plan) => {
    setCancelReason('');
    setCancelDialog({ plan });
  };

  const handleCancelConfirm = async () => {
    if (!cancelDialog) return;
    setActionLoading(true);
    try {
      await paymentPlansAPI.cancel(tenantId, cancelDialog.plan.id, { reason: cancelReason });
      toast.success('Plan cancelado.');
      setCancelDialog(null);
      setCancelReason('');
      await loadPlans();
      setSelectedPlan(null);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Error al cancelar el plan.');
    } finally { setActionLoading(false); }
  };

  const handleDownloadPDF = async (plan) => {
    // Use native fetch to avoid any Axios blob-wrapping issues.
    // B-04: REACT_APP_ → import.meta.env.VITE_ (migración CRA → Vite)
    // M-06: access_token en memoria (tokenStore), no en localStorage
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';
    const { getAccessToken } = await import('../api/tokenStore');
    const token = getAccessToken();
    try {
      const response = await fetch(
        `${apiUrl}/tenants/${tenantId}/payment-plans/${plan.id}/pdf/`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!response.ok) {
        // Try to parse error JSON
        let detail = 'No se pudo descargar el PDF.';
        try {
          const errJson = await response.json();
          detail = errJson?.detail || detail;
        } catch { /* ignore */ }
        toast.error(detail);
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const unitCode = (plan.unit_code || selectedUnit?.unit_id_code || 'unidad').replace(/\s/g, '_');
      const planShortId = String(plan.id || '').slice(0, 8) || 'plan';
      a.download = `plan_pago_${unitCode}_${planShortId}.pdf`;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      toast.error('No se pudo descargar el PDF.');
    }
  };

  // Paso 1 — abre el diálogo de destinatarios con los emails de la unidad.
  // NO envía todavía: sólo muestra el selector.
  const handleSendProposal = () => {
    if (!selectedUnit) return;
    const ownerEmail   = (selectedUnit.owner_email   || '').trim();
    const coownerEmail = (selectedUnit.coowner_email || '').trim();
    // Pre-seleccionamos los que existan
    setRecipientDialog({
      sendOwner:   !!ownerEmail,
      sendCoowner: !!coownerEmail,
      ownerEmail,
      coownerEmail,
    });
  };

  // Paso 2 — confirmado el diálogo, recolecta los emails elegidos y envía.
  const submitProposal = async () => {
    if (!selectedUnit || !recipientDialog) return;
    const { sendOwner, sendCoowner, ownerEmail, coownerEmail } = recipientDialog;
    const emails = [];
    if (sendOwner   && ownerEmail)   emails.push(ownerEmail);
    if (sendCoowner && coownerEmail) emails.push(coownerEmail);

    setSaving(true);
    try {
      const payload = {
        unit_id:          selectedUnit.id,
        total_adeudo:     selectedDebt,
        maintenance_fee:  maintenanceFee,
        notes:            sharedNotes,
        terms_conditions: termsConditions,
        emails,  // lista final de destinatarios (vacía = no mandar email)
        options: options.map(opt => ({
          frequency:      opt.freq,
          num_payments:   opt.numPagos,
          apply_interest: opt.applyInterest,
          interest_rate:  opt.applyInterest ? opt.interestRate : 0,
          start_period:   opt.startPeriod,
          notes:          opt.notes || sharedNotes,
        })),
      };
      const res = await paymentPlansAPI.createProposal(tenantId, payload);
      // El backend devuelve { plans, emails_sent_to } ahora; fallback para compat
      const sentTo = Array.isArray(res?.data?.emails_sent_to) ? res.data.emails_sent_to : emails;

      if (sentTo.length > 0) {
        toast.success(
          `Propuesta enviada con ${options.length} opción${options.length > 1 ? 'es' : ''}. ` +
          `Correo enviado a: ${sentTo.join(', ')}`
        );
      } else {
        toast.success(
          `Propuesta guardada con ${options.length} opción${options.length > 1 ? 'es' : ''}. ` +
          `No se envió correo (no se seleccionó ningún destinatario).`
        );
      }

      await loadPlans();
      setTab('list');
      setOptions([defaultOption()]);
      setSharedNotes('');
      setTermsConditions('');
      setActiveOptIdx(0);
      setRecipientDialog(null);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Error al enviar la propuesta.');
    } finally {
      setSaving(false);
    }
  };

  // Add a new option
  const addOption = () => {
    if (options.length >= 3) return;
    const last = options[options.length - 1];
    setOptions([...options, defaultOption(last?.startPeriod)]);
    setActiveOptIdx(options.length);
  };

  // Remove an option
  const removeOption = (idx) => {
    if (options.length <= 1) return;
    const newOpts = options.filter((_, i) => i !== idx);
    setOptions(newOpts);
    setActiveOptIdx(Math.min(activeOptIdx, newOpts.length - 1));
  };

  // Update a field in an option
  const updateOption = (idx, field, value) => {
    setOptions(prev => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: value };
      // Clamp numPagos to max allowed
      const freqObj = PLAN_FREQUENCIES.find(f => f.value === (field === 'freq' ? value : updated[idx].freq));
      const maxP = freqObj?.max ?? 12;
      if (updated[idx].numPagos > maxP) updated[idx].numPagos = maxP;
      return updated;
    });
  };

  // ─── Render helpers ───────────────────────────────────────────────────────
  const freqBtnStyle = (isActive) => ({
    padding: '7px 12px', borderRadius: 7,
    border: `2px solid ${isActive ? 'var(--teal-500)' : 'var(--sand-200)'}`,
    background: isActive ? 'var(--teal-50)' : '#fff',
    color: isActive ? 'var(--teal-700)' : 'var(--ink-600)',
    fontWeight: isActive ? 700 : 400, cursor: 'pointer', fontSize: 11,
    lineHeight: 1.4, transition: 'all 0.15s', textAlign: 'center',
  });

  // ─── Plan detail ──────────────────────────────────────────────────────────
  const renderPlanDetail = (plan) => {
    const installments = plan.installments || [];
    const totalPaid    = installments.reduce((s, i) => s + (i.paid_amount || 0), 0);
    const paidCount    = installments.filter(i => i.status === 'paid').length;
    const statusColor  = PLAN_STATUS_COLORS[plan.status] || '#64748b';
    const statusLabel2 = PLAN_STATUS_LABELS[plan.status] || plan.status;
    const freq_lbl     = PLAN_FREQUENCIES.find(f => f.value === plan.frequency)?.label || plan.frequency;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <button
          onClick={() => setSelectedPlan(null)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--teal-600)', background: 'none', border: 'none', cursor: 'pointer', width: 'fit-content' }}
        >
          <ChevronLeft size={14} /> Volver a la lista
        </button>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {[
            { label: 'Estado',           value: statusLabel2, color: statusColor },
            { label: 'Creado por',       value: plan.created_by_name || '—' },
            { label: 'Fecha creación',   value: plan.created_at ? new Date(plan.created_at).toLocaleDateString('es-MX') : '—' },
            { label: 'Enviado por',      value: plan.sent_by_name || '—' },
            { label: 'Fecha envío',      value: plan.sent_at ? new Date(plan.sent_at).toLocaleDateString('es-MX') : '—' },
            { label: 'Aceptado por',     value: plan.accepted_by_name || '—' },
            { label: 'Fecha aceptación', value: plan.accepted_at ? new Date(plan.accepted_at).toLocaleDateString('es-MX') : '—' },
            { label: 'Frecuencia',       value: freq_lbl },
            { label: 'Período inicial',  value: plan.start_period ? periodLabel(plan.start_period) : '—' },
          ].map(c => (
            <div key={c.label} style={{ background: 'var(--sand-50)', border: '1px solid var(--sand-200)', borderRadius: 7, padding: '8px 12px' }}>
              <div style={{ fontSize: 10, color: 'var(--ink-400)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.04em', marginBottom: 3 }}>{c.label}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: c.color || 'var(--ink-700)' }}>{c.value}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {[
            { label: 'Adeudo Base',      value: fmt(parseFloat(plan.total_adeudo || 0)),        color: 'var(--coral-500)' },
            { label: 'Total con Plan',   value: fmt(parseFloat(plan.total_with_interest || 0)), color: '#1e3a5f' },
            { label: 'Pagado hasta hoy', value: fmt(totalPaid),                                  color: 'var(--teal-600)' },
          ].map(c => (
            <div key={c.label} style={{ background: '#fff', border: '1px solid var(--sand-200)', borderRadius: 8, padding: '10px 14px', textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: 'var(--ink-400)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.04em', marginBottom: 4 }}>{c.label}</div>
              <div style={{ fontSize: 17, fontWeight: 800, color: c.color }}>{c.value}</div>
            </div>
          ))}
        </div>

        {plan.status === 'accepted' && installments.length > 0 && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--ink-500)', marginBottom: 5 }}>
              <span>Progreso: {paidCount} / {installments.length} pagos completados</span>
              <span>{fmt(totalPaid)} pagado de {fmt(parseFloat(plan.total_with_interest))}</span>
            </div>
            <div style={{ height: 10, background: 'var(--sand-200)', borderRadius: 5, overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 5, background: 'var(--teal-500)',
                width: `${installments.length > 0 ? (paidCount / installments.length) * 100 : 0}%`,
                transition: 'width 0.4s',
              }} />
            </div>
          </div>
        )}

        {installments.length > 0 && (
          <div style={{ border: '1px solid var(--sand-200)', borderRadius: 8, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#1e3a5f', color: 'white' }}>
                  {['#', 'Período', 'Abono Deuda', 'Cuota Regular', 'Total', 'Pagado', 'Estado'].map(h => (
                    <th key={h} style={{ padding: '8px 10px', fontWeight: 600, fontSize: 11, textAlign: h === '#' ? 'center' : 'right', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {installments.map((inst, i) => (
                  <tr key={inst.num} style={{ background: i % 2 === 0 ? '#fff' : 'var(--sand-50)', borderBottom: '1px solid var(--sand-100)' }}>
                    <td style={{ padding: '7px 10px', textAlign: 'center', color: 'var(--ink-400)', fontWeight: 600 }}>{inst.num}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--ink-700)' }}>{inst.period_label || inst.period_key}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--coral-600)', fontWeight: 600 }}>{fmt(inst.debt_part)}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--ink-600)' }}>{fmt(inst.regular_part)}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, color: '#1e3a5f' }}>{fmt(inst.total)}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--teal-700)', fontWeight: 600 }}>{fmt(inst.paid_amount || 0)}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: INSTALL_STATUS_COLOR[inst.status] || '#64748b' }}>
                        {INSTALL_STATUS_LABEL[inst.status] || inst.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: '#1e3a5f', color: 'white', fontWeight: 700 }}>
                  <td colSpan={2} style={{ padding: '8px 10px', fontSize: 11 }}>TOTAL</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right' }}>{fmt(installments.reduce((s, i) => s + (i.debt_part || 0), 0))}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right' }}>{fmt(installments.reduce((s, i) => s + (i.regular_part || 0), 0))}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right' }}>{fmt(installments.reduce((s, i) => s + (i.total || 0), 0))}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right' }}>{fmt(totalPaid)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {plan.notes && (
          <div style={{ background: 'var(--sand-50)', border: '1px solid var(--sand-200)', borderRadius: 7, padding: '10px 14px', fontSize: 12, color: 'var(--ink-600)', fontStyle: 'italic' }}>
            <strong>Notas:</strong> {plan.notes}
          </div>
        )}
        {plan.terms_conditions && (
          <div style={{ background: 'rgba(13,124,110,0.04)', border: '1.5px solid var(--teal-200)', borderRadius: 8, padding: '12px 16px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--teal-700)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>📋</span> Políticas y Condiciones de la Propuesta
            </div>
            <div style={{ fontSize: 13, color: 'var(--ink-700)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
              {plan.terms_conditions}
            </div>
            {(plan.status === 'accepted' || plan.status === 'completed') && (
              <div style={{ marginTop: 8, fontSize: 11, color: 'var(--teal-600)', fontStyle: 'italic' }}>
                ✓ El residente aceptó estas condiciones al aceptar el plan.
              </div>
            )}
          </div>
        )}
        {plan.status === 'cancelled' && plan.cancel_reason && (
          <div style={{ background: '#f3f4f6', border: '1px solid #d1d5db', borderLeft: '4px solid #64748b', borderRadius: 7, padding: '10px 14px', fontSize: 12, color: '#64748b', fontStyle: 'italic' }}>
            <strong>Motivo de cancelación:</strong> {plan.cancel_reason}
            {plan.cancelled_by_name && <span style={{ marginLeft: 8, color: '#9ca3af' }}>— {plan.cancelled_by_name}</span>}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end', borderTop: '1px solid var(--sand-200)', paddingTop: 12 }}>
          <button className="btn btn-outline btn-sm" onClick={() => setPrintPlan(plan)}>
            <Printer size={13} /> Imprimir / PDF
          </button>
          {isVecino && plan.status === 'sent' && (
            <>
              <button
                className="btn btn-primary btn-sm"
                disabled={actionLoading}
                onClick={() => handleAccept(plan)}
                style={{ background: 'var(--teal-500)', borderColor: 'var(--teal-500)' }}
              >
                <CheckCircle size={13} /> Aceptar este plan
              </button>
              <button
                className="btn btn-outline btn-sm"
                disabled={actionLoading}
                onClick={() => handleReject(plan)}
                style={{ color: 'var(--coral-500)', borderColor: 'var(--coral-300)' }}
              >
                <X size={13} /> Rechazar
              </button>
            </>
          )}
          {canWrite && ['draft', 'sent', 'accepted'].includes(plan.status) && (
            <button
              className="btn btn-outline btn-sm"
              disabled={actionLoading}
              onClick={() => handleCancel(plan)}
              style={{ color: 'var(--ink-400)', borderColor: 'var(--sand-200)' }}
            >
              Cancelar plan
            </button>
          )}
        </div>
      </div>
    );
  };

  // ─── Plans list ───────────────────────────────────────────────────────────
  const renderPlansList = () => {
    if (plansLoading) {
      return <div style={{ textAlign: 'center', padding: 40, color: 'var(--ink-400)' }}>Cargando planes…</div>;
    }

    // For vecinos: group plans by proposal_group so they see the options side by side
    if (isVecino) {
      return renderVecinoProposals();
    }

    if (plans.length === 0) {
      return (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--ink-400)' }}>
          <TrendingDown size={36} style={{ opacity: 0.25, marginBottom: 10 }} />
          <div style={{ fontSize: 14, marginBottom: 4 }}>No hay planes de pago para esta unidad.</div>
          {canWrite && selectedUnit && (
            <button className="btn btn-primary btn-sm" style={{ marginTop: 14 }} onClick={() => setTab('new')}>
              + Crear propuesta
            </button>
          )}
        </div>
      );
    }

    // Group by proposal_group for manager view
    const grouped = groupByProposal(plans);

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {grouped.map((group, gi) => {
          if (group.length === 1) {
            // Single plan (not a proposal group)
            const plan = group[0];
            return renderPlanCard(plan, gi);
          }
          // Multi-option proposal
          return renderProposalGroup(group, gi);
        })}
      </div>
    );
  };

  function groupByProposal(planList) {
    const groups = {};
    const singles = [];
    planList.forEach(p => {
      if (p.proposal_group) {
        if (!groups[p.proposal_group]) groups[p.proposal_group] = [];
        groups[p.proposal_group].push(p);
      } else {
        singles.push([p]);
      }
    });
    const groupArrays = Object.values(groups).map(g => g.sort((a, b) => a.option_number - b.option_number));
    return [...groupArrays, ...singles];
  }

  function renderPlanCard(plan, key) {
    const sc       = PLAN_STATUS_COLORS[plan.status] || '#64748b';
    const sl       = PLAN_STATUS_LABELS[plan.status] || plan.status;
    const freq_lbl = PLAN_FREQUENCIES.find(f => f.value === plan.frequency)?.label || plan.frequency;
    const installs = plan.installments || [];
    const paidCount = installs.filter(i => i.status === 'paid').length;
    const progressPct = installs.length > 0 ? (paidCount / installs.length) * 100 : 0;
    return (
      <div
        key={plan.id || key}
        style={{ border: '1px solid var(--sand-200)', borderRadius: 10, padding: '14px 16px', background: '#fff', cursor: 'pointer', transition: 'box-shadow 0.15s' }}
        onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.08)'}
        onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
        onClick={() => setSelectedPlan(plan)}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: plan.status === 'accepted' ? 10 : 0 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-700)' }}>
                {freq_lbl} · {plan.num_payments} pagos
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, color: sc, background: sc + '18', padding: '2px 8px', borderRadius: 12 }}>
                {sl}
              </span>
              {plan.start_period && (
                <span style={{ fontSize: 11, color: 'var(--ink-400)' }}>
                  desde {periodLabel(plan.start_period)}
                </span>
              )}
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-500)' }}>
              Total: <strong>{fmt(parseFloat(plan.total_with_interest))}</strong>
              &nbsp;·&nbsp;Adeudo base: {fmt(parseFloat(plan.total_adeudo))}
              {plan.apply_interest && <span style={{ color: 'var(--coral-500)' }}>&nbsp;· Interés: {plan.interest_rate}%</span>}
            </div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink-400)', whiteSpace: 'nowrap', textAlign: 'right', flexShrink: 0 }}>
            <div>Creado por: {plan.created_by_name}</div>
            <div>{plan.created_at ? new Date(plan.created_at).toLocaleDateString('es-MX') : ''}</div>
          </div>
        </div>
        {plan.status === 'accepted' && installs.length > 0 && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--teal-700)', marginBottom: 4 }}>
              <span>Progreso: {paidCount}/{installs.length} pagos</span>
              <span>{Math.round(progressPct)}%</span>
            </div>
            <div style={{ height: 5, background: 'var(--sand-200)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 3, background: 'var(--teal-500)', width: `${progressPct}%`, transition: 'width 0.4s' }} />
            </div>
          </div>
        )}
        {plan.status === 'cancelled' && plan.cancel_reason && (
          <div style={{ marginTop: 8, padding: '6px 10px', background: '#f3f4f6', borderRadius: 7, borderLeft: '3px solid #64748b', fontSize: 12, color: '#64748b', fontStyle: 'italic' }}>
            <strong>Motivo cancelación:</strong> {plan.cancel_reason}
          </div>
        )}
      </div>
    );
  }

  function renderProposalGroup(group, key) {
    // All plans in the group should have the same status (all sent, all accepted, etc.)
    const groupStatus = group.some(p => p.status === 'accepted') ? 'accepted'
      : group.some(p => p.status === 'sent') ? 'sent'
      : group[0]?.status || 'draft';
    const sc = PLAN_STATUS_COLORS[groupStatus] || '#64748b';
    const sl = PLAN_STATUS_LABELS[groupStatus] || groupStatus;

    return (
      <div key={group[0]?.proposal_group || key} style={{ border: `2px solid ${sc}33`, borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
        {/* Proposal header */}
        <div style={{ background: '#1e3a5f', padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ color: '#fff', fontWeight: 700, fontSize: 13 }}>
            Propuesta — {group.length} opción{group.length > 1 ? 'es' : ''}
          </span>
          <span style={{ fontSize: 11, fontWeight: 700, color: sc, background: sc + '22', padding: '2px 8px', borderRadius: 10 }}>
            {sl}
          </span>
        </div>
        {/* Options grid */}
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${group.length}, 1fr)`, gap: 0 }}>
          {group.map((plan, i) => {
            const freq_lbl = PLAN_FREQUENCIES.find(f => f.value === plan.frequency)?.label || plan.frequency;
            const planSc   = PLAN_STATUS_COLORS[plan.status] || '#64748b';
            const planSl   = PLAN_STATUS_LABELS[plan.status] || plan.status;
            return (
              <div
                key={plan.id}
                style={{
                  padding: '12px 14px',
                  borderRight: i < group.length - 1 ? '1px solid var(--sand-100)' : 'none',
                  cursor: 'pointer',
                  transition: 'background 0.12s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--sand-50)'}
                onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                onClick={() => setSelectedPlan(plan)}
              >
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-400)', textTransform: 'uppercase', marginBottom: 6 }}>
                  Opción {plan.option_number || i + 1}
                  {plan.status !== group[0].status && (
                    <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: planSc }}>({planSl})</span>
                  )}
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-700)', marginBottom: 3 }}>
                  {freq_lbl} · {plan.num_payments} pago{plan.num_payments !== 1 ? 's' : ''}
                </div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#1e3a5f', marginBottom: 2 }}>
                  {fmt(parseFloat(plan.total_with_interest))}
                </div>
                {plan.start_period && (
                  <div style={{ fontSize: 11, color: 'var(--ink-400)', marginBottom: 4 }}>
                    Desde {periodLabel(plan.start_period)}
                  </div>
                )}
                {plan.apply_interest && (
                  <div style={{ fontSize: 11, color: 'var(--coral-500)' }}>Interés: {plan.interest_rate}%</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ─── Vecino: grouped proposals with accept/reject per option ──────────────
  const renderVecinoProposals = () => {
    if (plans.length === 0) {
      return (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--ink-400)' }}>
          <TrendingDown size={36} style={{ opacity: 0.25, marginBottom: 10 }} />
          <div style={{ fontSize: 14 }}>No hay planes de pago disponibles para tu unidad.</div>
        </div>
      );
    }

    const grouped = groupByProposal(plans);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {grouped.map((group, gi) => {
          const hasSentOptions = group.some(p => p.status === 'sent');
          const acceptedPlan   = group.find(p => p.status === 'accepted');

          if (group.length === 1) {
            return renderPlanCard(group[0], gi);
          }

          return (
            <div key={group[0]?.proposal_group || gi} style={{ border: '1px solid var(--sand-200)', borderRadius: 12, overflow: 'hidden', background: '#fff', boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
              {/* Header */}
              <div style={{ background: '#1e3a5f', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>
                    Propuesta de Plan de Pago
                  </div>
                  <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12, marginTop: 2 }}>
                    Se te presentan {group.length} opciones. Elige la que mejor se adapte a ti.
                  </div>
                </div>
                {acceptedPlan && (
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#0d7c6e', background: '#0d7c6e22', padding: '3px 10px', borderRadius: 12 }}>
                    ✓ Aceptado
                  </span>
                )}
              </div>

              {/* Options */}
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${group.length}, 1fr)`, gap: 0 }}>
                {group.map((plan, i) => {
                  const freq_lbl = PLAN_FREQUENCIES.find(f => f.value === plan.frequency)?.label || plan.frequency;
                  const isAccepted  = plan.status === 'accepted';
                  const isCancelled = plan.status === 'cancelled';
                  const isRejected  = plan.status === 'rejected';
                  return (
                    <div
                      key={plan.id}
                      style={{
                        padding: '16px',
                        borderRight: i < group.length - 1 ? '1px solid var(--sand-200)' : 'none',
                        background: isAccepted ? '#e6f4f2' : isCancelled || isRejected ? '#f8f6f1' : '#fff',
                        opacity: isCancelled ? 0.55 : 1,
                        display: 'flex', flexDirection: 'column', gap: 10,
                        position: 'relative',
                      }}
                    >
                      {isAccepted && (
                        <div style={{ position: 'absolute', top: 10, right: 10, fontSize: 10, fontWeight: 700, color: '#0d7c6e', background: '#0d7c6e18', padding: '2px 7px', borderRadius: 10 }}>
                          ✓ ACTIVO
                        </div>
                      )}
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-400)', textTransform: 'uppercase' }}>
                        Opción {plan.option_number || i + 1}
                      </div>
                      <div>
                        <div style={{ fontSize: 16, fontWeight: 800, color: '#1e3a5f' }}>
                          {fmt(parseFloat(plan.total_with_interest))}
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--ink-600)', marginTop: 2 }}>
                          {freq_lbl} · {plan.num_payments} pago{plan.num_payments !== 1 ? 's' : ''}
                        </div>
                        {plan.start_period && (
                          <div style={{ fontSize: 12, color: 'var(--ink-500)', marginTop: 1 }}>
                            Inicia en {periodLabel(plan.start_period)}
                          </div>
                        )}
                        {plan.apply_interest && (
                          <div style={{ fontSize: 11, color: 'var(--coral-500)', marginTop: 1 }}>
                            Incluye {plan.interest_rate}% de interés anual
                          </div>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--ink-500)' }}>
                        Adeudo base: {fmt(parseFloat(plan.total_adeudo))}
                      </div>
                      {!isCancelled && !isRejected && !isAccepted && plan.status === 'sent' && hasSentOptions && (
                        <button
                          className="btn btn-primary btn-sm"
                          disabled={actionLoading}
                          onClick={() => handleAccept(plan)}
                          style={{ background: 'var(--teal-500)', borderColor: 'var(--teal-500)', marginTop: 4 }}
                        >
                          <CheckCircle size={12} /> Elegir esta opción
                        </button>
                      )}
                      {!isCancelled && !isRejected && !isAccepted && plan.status === 'sent' && (
                        <button
                          className="btn btn-outline btn-sm"
                          disabled={actionLoading}
                          onClick={() => setSelectedPlan(plan)}
                          style={{ fontSize: 11 }}
                        >
                          Ver detalle
                        </button>
                      )}
                      {isAccepted && (
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={() => setSelectedPlan(plan)}
                          style={{ fontSize: 11, borderColor: 'var(--teal-300)', color: 'var(--teal-600)' }}
                        >
                          Ver detalle del plan
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // ─── Single option config card ────────────────────────────────────────────
  const renderOptionCard = (opt, idx, totalDebt) => {
    const freqObj    = PLAN_FREQUENCIES.find(f => f.value === opt.freq);
    const maxPagos   = freqObj?.max ?? 12;
    const durMonths  = opt.freq * opt.numPagos;
    const rows       = buildInstallmentRows(totalDebt, maintenanceFee, opt);
    const totalCon   = opt.applyInterest && opt.interestRate > 0
      ? totalDebt * (1 + opt.interestRate / 100)
      : totalDebt;
    const grandReg   = (maintenanceFee * opt.freq) * opt.numPagos;
    const grandTotal = totalCon + grandReg;

    return (
      <div style={{ background: '#fff', border: `2px solid ${activeOptIdx === idx ? 'var(--teal-400)' : 'var(--sand-200)'}`, borderRadius: 10, overflow: 'hidden' }}>
        {/* Option tab header */}
        <div
          style={{ background: activeOptIdx === idx ? 'var(--teal-50)' : 'var(--sand-50)', padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', borderBottom: '1px solid var(--sand-100)' }}
          onClick={() => setActiveOptIdx(activeOptIdx === idx ? -1 : idx)}
        >
          <span style={{ fontWeight: 700, fontSize: 13, color: activeOptIdx === idx ? 'var(--teal-700)' : 'var(--ink-700)' }}>
            Opción {idx + 1} — {PLAN_FREQUENCIES.find(f => f.value === opt.freq)?.label} · {opt.numPagos} pagos · {fmt(totalCon)}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {options.length > 1 && (
              <button
                onClick={e => { e.stopPropagation(); removeOption(idx); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--coral-500)', display: 'flex', padding: 2 }}
                title="Eliminar opción"
              >
                <Trash2 size={14} />
              </button>
            )}
            <span style={{ fontSize: 11, color: 'var(--ink-400)' }}>{activeOptIdx === idx ? '▲' : '▼'}</span>
          </div>
        </div>

        {activeOptIdx === idx && (
          <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Frequency */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-600)', marginBottom: 7 }}>Frecuencia de pago</div>
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                {PLAN_FREQUENCIES.map(f => (
                  <button key={f.value} style={freqBtnStyle(opt.freq === f.value)} onClick={() => updateOption(idx, 'freq', f.value)}>
                    <div>{f.label}</div>
                    <div style={{ fontSize: 10, opacity: 0.7 }}>{f.sublabel}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Num payments */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-600)', marginBottom: 7 }}>
                Número de pagos
                <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--ink-400)', fontWeight: 400 }}>
                  (máx. {maxPagos} → {maxPagos * opt.freq} meses)
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <input type="range" min={1} max={maxPagos} value={opt.numPagos}
                  onChange={e => updateOption(idx, 'numPagos', Number(e.target.value))}
                  style={{ flex: 1, accentColor: 'var(--teal-500)' }} />
                <div style={{ textAlign: 'center', minWidth: 38 }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--teal-700)', lineHeight: 1 }}>{opt.numPagos}</div>
                  <div style={{ fontSize: 10, color: 'var(--ink-400)' }}>pagos</div>
                </div>
              </div>
              <div style={{ fontSize: 11, color: 'var(--ink-500)', marginTop: 3 }}>
                ⏱ Duración: <strong>{durMonths} mes{durMonths !== 1 ? 'es' : ''}</strong>
              </div>
            </div>

            {/* Start period */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-600)', marginBottom: 6 }}>
                <Calendar size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                A partir de qué período aplica
              </div>
              <select
                value={opt.startPeriod}
                onChange={e => updateOption(idx, 'startPeriod', e.target.value)}
                style={{ width: '100%', padding: '6px 10px', border: '1px solid var(--sand-200)', borderRadius: 7, fontSize: 12, background: '#fff', color: 'var(--ink-700)', boxSizing: 'border-box' }}
              >
                {startPeriodOptions.map(p => (
                  <option key={p} value={p}>
                    {periodLabel(p)}{p === todayPeriod() ? ' (actual)' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Interest */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', paddingTop: 10, borderTop: '1px solid var(--sand-100)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={opt.applyInterest} onChange={e => updateOption(idx, 'applyInterest', e.target.checked)}
                  style={{ width: 16, height: 16, accentColor: 'var(--coral-500)' }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-700)' }}>Intereses moratorios</span>
              </label>
              {opt.applyInterest && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, color: 'var(--ink-600)' }}>Tasa anual:</span>
                  <input type="number" min={0} max={100} step={0.5} value={opt.interestRate}
                    onChange={e => updateOption(idx, 'interestRate', parseFloat(e.target.value) || 0)}
                    style={{ width: 65, padding: '4px 8px', border: '1px solid var(--sand-200)', borderRadius: 6, fontSize: 13, textAlign: 'right' }} />
                  <span style={{ fontSize: 12, color: 'var(--ink-600)' }}>%</span>
                  {opt.applyInterest && opt.interestRate > 0 && (
                    <span style={{ fontSize: 12, color: 'var(--coral-500)', fontWeight: 700 }}>
                      +{fmt(totalDebt * opt.interestRate / 100)}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Installments preview */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-500)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 7 }}>
                Vista previa de cuotas
              </div>
              <div style={{ border: '1px solid var(--sand-200)', borderRadius: 8, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead>
                    <tr style={{ background: '#1e3a5f', color: 'white' }}>
                      {['#', 'Período', 'Abono Deuda', `Cuota${opt.freq > 1 ? ` ×${opt.freq}` : ''}`, 'Total'].map(h => (
                        <th key={h} style={{ padding: '7px 10px', fontWeight: 600, fontSize: 10, textAlign: h === '#' ? 'left' : 'right' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, ri) => (
                      <tr key={r.num} style={{ background: ri % 2 === 0 ? '#fff' : 'var(--sand-50)', borderBottom: '1px solid var(--sand-100)' }}>
                        <td style={{ padding: '5px 10px', color: 'var(--ink-400)', fontWeight: 600 }}>{r.num}</td>
                        <td style={{ padding: '5px 10px', textAlign: 'right', color: 'var(--ink-700)' }}>{r.period_label}</td>
                        <td style={{ padding: '5px 10px', textAlign: 'right', color: 'var(--coral-600)', fontWeight: 600 }}>{fmt(r.debt_part)}</td>
                        <td style={{ padding: '5px 10px', textAlign: 'right', color: 'var(--ink-600)' }}>{fmt(r.regular_part)}</td>
                        <td style={{ padding: '5px 10px', textAlign: 'right', fontWeight: 700, color: '#1e3a5f' }}>{fmt(r.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#1e3a5f', color: 'white', fontWeight: 700 }}>
                      <td colSpan={2} style={{ padding: '7px 10px', fontSize: 10 }}>
                        TOTAL · {opt.numPagos} pagos en {durMonths} mes{durMonths !== 1 ? 'es' : ''}
                      </td>
                      <td style={{ padding: '7px 10px', textAlign: 'right' }}>{fmt(totalCon)}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right' }}>{fmt(grandReg)}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', fontSize: 12 }}>{fmt(grandTotal)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ─── New plan form (multi-option proposal) ────────────────────────────────
  const renderNewPlanForm = () => {
    const u             = selectedUnit || {};
    const periodDebts   = selectedAdeudoItem?.period_debts || [];
    const netPrevDebt   = parseFloat(selectedAdeudoItem?.net_prev_debt || 0);
    const OCCUPANCY_LABEL = { propietario: 'Propietario', rentado: 'Rentado', 'vacío': 'Vacío' };
    const occLabel      = OCCUPANCY_LABEL[u.occupancy] || u.occupancy || '—';
    const contactName   = u.responsible_name || [u.owner_first_name, u.owner_last_name].filter(Boolean).join(' ') || '—';
    const contactEmail  = u.occupancy === 'rentado' ? (u.tenant_email || u.owner_email || '—') : (u.owner_email || '—');
    const contactPhone  = u.occupancy === 'rentado' ? (u.tenant_phone || u.owner_phone || '—') : (u.owner_phone || '—');
    const ownerFull     = [u.owner_first_name, u.owner_last_name].filter(Boolean).join(' ') || '—';

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* ── UNIT INFO CARD ── */}
        <div style={{ border: '1px solid var(--teal-200)', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
          <div style={{ background: '#1e3a5f', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Building size={15} color="#fff" />
            <span style={{ color: '#fff', fontWeight: 700, fontSize: 13 }}>
              {u.unit_id_code && <span style={{ fontFamily: 'monospace', background: 'rgba(255,255,255,0.15)', padding: '1px 7px', borderRadius: 4, marginRight: 8 }}>{u.unit_id_code}</span>}
              {u.unit_name || '—'}
            </span>
            <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.7)', background: 'rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: 10 }}>
              {occLabel}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
            <div style={{ padding: '12px 16px', borderRight: '1px solid var(--sand-100)' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-400)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Contacto</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ fontSize: 11, color: 'var(--ink-400)', width: 60, flexShrink: 0 }}>Responsable</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-700)' }}>{contactName}</span>
                </div>
                {u.occupancy === 'rentado' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span style={{ fontSize: 11, color: 'var(--ink-400)', width: 60, flexShrink: 0 }}>Propietario</span>
                    <span style={{ fontSize: 12, color: 'var(--ink-600)' }}>{ownerFull}</span>
                  </div>
                )}
                {contactEmail !== '—' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span style={{ fontSize: 11, color: 'var(--ink-400)', width: 60, flexShrink: 0 }}>Correo</span>
                    <span style={{ fontSize: 12, color: 'var(--teal-600)', wordBreak: 'break-all' }}>{contactEmail}</span>
                  </div>
                )}
                {contactPhone !== '—' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span style={{ fontSize: 11, color: 'var(--ink-400)', width: 60, flexShrink: 0 }}>Teléfono</span>
                    <span style={{ fontSize: 12, color: 'var(--ink-700)' }}>{contactPhone}</span>
                  </div>
                )}
                {u.coowner_first_name && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span style={{ fontSize: 11, color: 'var(--ink-400)', width: 60, flexShrink: 0 }}>Co-propiet.</span>
                    <span style={{ fontSize: 12, color: 'var(--ink-600)' }}>{[u.coowner_first_name, u.coowner_last_name].filter(Boolean).join(' ')}</span>
                  </div>
                )}
              </div>
            </div>

            <div style={{ padding: '12px 16px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-400)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                Adeudo al {periodLabel(cutoff)}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {netPrevDebt > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: 'var(--ink-500)' }}>Deuda anterior</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#d97706' }}>{fmt(netPrevDebt)}</span>
                  </div>
                )}
                {periodDebts.filter(pd => pd.deficit > 0).map(pd => (
                  <div key={pd.period} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: 'var(--ink-500)' }}>{periodLabel(pd.period)}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--coral-500)' }}>{fmt(pd.deficit)}</span>
                  </div>
                ))}
                {selectedDebt === 0 && netPrevDebt === 0 && periodDebts.length === 0 && (
                  <div style={{ fontSize: 12, color: 'var(--teal-600)', fontStyle: 'italic' }}>Sin adeudos en este período</div>
                )}
                <div style={{ marginTop: 4, paddingTop: 6, borderTop: '1px solid var(--sand-200)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-600)' }}>Total adeudo</span>
                  <span style={{ fontSize: 16, fontWeight: 800, color: selectedDebt > 0 ? 'var(--coral-500)' : 'var(--teal-600)' }}>{fmt(selectedDebt)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: 'var(--ink-500)' }}>Cuota mensual</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-700)' }}>{fmt(maintenanceFee)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── PROPOSAL CONFIG ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: -4 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-700)' }}>
            Opciones de la Propuesta ({options.length}/3)
          </div>
          {options.length < 3 && (
            <button
              className="btn btn-outline btn-sm"
              onClick={addOption}
              style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}
            >
              <Plus size={13} /> Agregar opción
            </button>
          )}
        </div>

        {/* Option cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {options.map((opt, idx) => renderOptionCard(opt, idx, selectedDebt))}
        </div>

        {/* Shared notes */}
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-600)', display: 'block', marginBottom: 6 }}>
            Notas para el propietario (opcional)
          </label>
          <textarea
            value={sharedNotes} onChange={e => setSharedNotes(e.target.value)}
            placeholder="Condiciones especiales, acuerdos, observaciones…"
            rows={3}
            style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--sand-200)', borderRadius: 8, fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }}
          />
        </div>

        {/* Terms & Conditions */}
        <div style={{ marginTop: 4 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--teal-700)', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <span style={{ fontSize: 15 }}>📋</span> Políticas, condiciones y términos (opcional)
          </label>
          <textarea
            value={termsConditions} onChange={e => setTermsConditions(e.target.value)}
            placeholder={
              'Escribe aquí las políticas y condiciones de la propuesta. Por ejemplo:\n' +
              '• El residente se compromete a realizar el pago puntual cada período.\n' +
              '• El incumplimiento de dos cuotas consecutivas cancela este plan.\n' +
              '• La administración se reserva el derecho de renegociar los términos en caso de mora.'
            }
            rows={5}
            style={{
              width: '100%', padding: '10px 12px',
              border: '1.5px solid var(--teal-200)', borderRadius: 8,
              fontSize: 13, resize: 'vertical', boxSizing: 'border-box',
              background: 'rgba(13,124,110,0.03)',
              lineHeight: 1.6,
            }}
          />
          <div style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span>Si se completa, este texto aparecerá en el correo y en el PDF del plan. Al aceptar, el residente declara haber leído y aceptado estos términos.</span>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, borderTop: '1px solid var(--sand-200)', paddingTop: 12 }}>
          <div style={{ fontSize: 11, color: 'var(--ink-400)', flex: 1, alignSelf: 'center' }}>
            Se enviará la propuesta por correo al propietario/copropietario.
          </div>
          <button className="btn btn-secondary" onClick={() => setTab('list')}>Cancelar</button>
          <button
            className="btn btn-primary"
            disabled={saving || selectedDebt <= 0}
            onClick={handleSendProposal}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Send size={14} />
            {saving ? 'Enviando…' : `Enviar propuesta (${options.length} opción${options.length > 1 ? 'es' : ''})`}
          </button>
        </div>
      </div>
    );
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  // Vecino: hide entire module if no proposals exist
  if (isVecino && !plansLoading && plans.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 40 }}>
        <div style={{ textAlign: 'center', color: 'var(--ink-400)' }}>
          <TrendingDown size={48} style={{ opacity: 0.15, marginBottom: 14 }} />
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink-500)', marginBottom: 4 }}>
            Sin propuestas de plan de pagos
          </div>
          <div style={{ fontSize: 13 }}>
            La administración no ha enviado ninguna propuesta de plan de pagos para tu unidad.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, height: '100%' }}>

      {/* ── Page header ── */}
      <div style={{ padding: '0 0 20px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <TrendingDown size={22} color="var(--coral-500)" />
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--ink-800)' }}>Plan de Pagos</h2>
        </div>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-500)' }}>
          {isVecino
            ? 'Revisa las propuestas de plan de pago enviadas a tu unidad y elige la que mejor te convenga.'
            : 'Crea y envía propuestas de plan de pago con hasta 3 opciones para que el propietario elija.'}
        </p>
      </div>

      {/* ── Main layout ── */}
      <div style={{ display: 'flex', gap: 20, flex: 1, minHeight: 0 }}>

        {/* ── LEFT: Unit selector (managers only) ── */}
        {!isVecino && (
          <div style={{
            width: 280, flexShrink: 0, background: '#fff', border: '1px solid var(--sand-200)',
            borderRadius: 12, display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--sand-100)', background: 'var(--sand-50)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-600)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                Unidades con adeudos
              </div>

              {/* Period selector */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-500)', marginBottom: 5, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Calendar size={11} /> Período de corte
                </div>
                <select
                  value={cutoff}
                  onChange={e => setCutoff(e.target.value)}
                  style={{ width: '100%', padding: '6px 8px', border: '1px solid var(--sand-200)', borderRadius: 7, fontSize: 12, boxSizing: 'border-box', background: '#fff', color: 'var(--ink-700)', cursor: 'pointer', fontWeight: 600 }}
                >
                  {periodOptions.map(opt => (
                    <option key={opt} value={opt}>
                      {opt === todayPeriod() ? `${periodLabel(opt)} (actual)` : periodLabel(opt)}
                    </option>
                  ))}
                </select>
                <div style={{ fontSize: 10, color: 'var(--ink-400)', marginTop: 3 }}>
                  Adeudos calculados hasta este período
                </div>
              </div>

              <div style={{ position: 'relative' }}>
                <Search size={13} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-400)' }} />
                <input
                  type="text"
                  placeholder="Buscar unidad…"
                  value={unitSearch}
                  onChange={e => setUnitSearch(e.target.value)}
                  style={{ width: '100%', paddingLeft: 28, paddingRight: 10, paddingTop: 7, paddingBottom: 7, border: '1px solid var(--sand-200)', borderRadius: 8, fontSize: 12, boxSizing: 'border-box', outline: 'none' }}
                />
              </div>
            </div>

            {/* Units list */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {adeudosLoading ? (
                <div style={{ textAlign: 'center', padding: 24, color: 'var(--ink-400)', fontSize: 13 }}>Cargando…</div>
              ) : filteredItems.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 24, color: 'var(--ink-400)', fontSize: 13 }}>
                  {unitSearch ? 'Sin resultados' : 'Sin unidades con adeudos'}
                </div>
              ) : (
                pagedItems.map(item => {
                  const u        = item.unit || {};
                  const isActive = selectedUnit?.id === u.id;
                  return (
                    <div
                      key={u.id}
                      style={{
                        padding: '11px 16px',
                        borderBottom: '1px solid var(--sand-50)',
                        background: isActive ? 'var(--teal-50)' : '#fff',
                        cursor: 'pointer',
                        borderLeft: `3px solid ${isActive ? 'var(--teal-500)' : 'transparent'}`,
                        transition: 'background 0.12s',
                      }}
                      onClick={() => {
                        setSelectedUnit(u);
                        setSelectedDebt(parseFloat(item.total_adeudo || 0));
                        setSelectedAdeudoItem(item);
                        setTab('list');
                        setOptions([defaultOption()]);
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: isActive ? 'var(--teal-700)' : 'var(--ink-700)', marginBottom: 2 }}>
                            {u.unit_id_code || u.id}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--ink-500)' }}>{u.unit_name || ''}</div>
                          <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>{u.responsible_name || ''}</div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--coral-500)' }}>
                            {fmt(parseFloat(item.total_adeudo || 0))}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* ── Paginación (solo cuando hay al menos 1 unidad y no está cargando) ── */}
            {!adeudosLoading && filteredItems.length > 0 && (
              <div style={{
                padding: '8px 12px',
                borderTop: '1px solid var(--sand-100)',
                background: 'var(--sand-50)',
                display: 'flex', flexDirection: 'column', gap: 6,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: 11, color: 'var(--ink-500)' }}>
                    {`${Math.min((safePage - 1) * pageSize + 1, totalItems)}–${Math.min(safePage * pageSize, totalItems)} de ${totalItems}`}
                  </span>
                  <select
                    value={pageSize}
                    onChange={e => setPageSize(Number(e.target.value))}
                    style={{ fontSize: 11, padding: '3px 6px', border: '1px solid var(--sand-200)', borderRadius: 6, background: '#fff', color: 'var(--ink-700)', cursor: 'pointer' }}
                    aria-label="Unidades por página"
                  >
                    <option value={10}>10 / pág.</option>
                    <option value={25}>25 / pág.</option>
                    <option value={50}>50 / pág.</option>
                  </select>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <button
                    type="button"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={safePage <= 1}
                    style={{
                      padding: '3px 8px', fontSize: 11, border: '1px solid var(--sand-200)',
                      borderRadius: 6, background: safePage <= 1 ? 'var(--sand-100)' : '#fff',
                      color: safePage <= 1 ? 'var(--ink-400)' : 'var(--ink-700)',
                      cursor: safePage <= 1 ? 'not-allowed' : 'pointer',
                    }}
                  >
                    ‹ Ant.
                  </button>
                  <span style={{ fontSize: 11, color: 'var(--ink-600)', fontWeight: 600 }}>
                    {safePage} / {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={safePage >= totalPages}
                    style={{
                      padding: '3px 8px', fontSize: 11, border: '1px solid var(--sand-200)',
                      borderRadius: 6, background: safePage >= totalPages ? 'var(--sand-100)' : '#fff',
                      color: safePage >= totalPages ? 'var(--ink-400)' : 'var(--ink-700)',
                      cursor: safePage >= totalPages ? 'not-allowed' : 'pointer',
                    }}
                  >
                    Sig. ›
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── RIGHT: Plans panel ── */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 0 }}>
          {!isVecino && !selectedUnit ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--sand-50)', borderRadius: 12, border: '1px solid var(--sand-200)' }}>
              <div style={{ textAlign: 'center', color: 'var(--ink-400)' }}>
                <TrendingDown size={40} style={{ opacity: 0.2, marginBottom: 12 }} />
                <div style={{ fontSize: 14 }}>Selecciona una unidad para ver o crear un plan de pago.</div>
              </div>
            </div>
          ) : (
            <div style={{ flex: 1, background: '#fff', borderRadius: 12, border: '1px solid var(--sand-200)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {/* Panel header */}
              <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--sand-100)', background: 'var(--sand-50)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                <div>
                  {!isVecino && selectedUnit && (
                    <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink-800)' }}>
                      {selectedUnit.unit_id_code} {selectedUnit.unit_name && `— ${selectedUnit.unit_name}`}
                    </div>
                  )}
                  {isVecino && (
                    <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink-800)' }}>Mis planes de pago</div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {!selectedPlan && tab === 'list' && canWrite && selectedUnit && (() => {
                    const hasActivePlan = plans.some(p => p.status === 'accepted');
                    return hasActivePlan ? (
                      <span style={{ fontSize: 12, color: 'var(--ink-400)', fontStyle: 'italic', padding: '4px 8px', background: '#f3f4f6', borderRadius: 7 }}>
                        Plan activo en curso — cancélalo para crear uno nuevo
                      </span>
                    ) : (
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => { setTab('new'); setActiveOptIdx(0); setOptions([defaultOption()]); }}
                        style={{ display: 'flex', alignItems: 'center', gap: 5 }}
                      >
                        <Plus size={13} /> Nueva propuesta
                      </button>
                    );
                  })()}
                  {tab === 'new' && (
                    <button className="btn btn-secondary btn-sm" onClick={() => setTab('list')}>
                      Cancelar
                    </button>
                  )}
                </div>
              </div>

              {/* Content */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
                {selectedPlan
                  ? renderPlanDetail(selectedPlan)
                  : tab === 'new'
                    ? renderNewPlanForm()
                    : renderPlansList()
                }
              </div>
            </div>
          )}
        </div>

      </div>

      {/* ── Recipient Selection Modal (envío de propuesta) ── */}
      {recipientDialog && (() => {
        const { sendOwner, sendCoowner, ownerEmail, coownerEmail } = recipientDialog;
        const selectedCount = (sendOwner && ownerEmail ? 1 : 0) + (sendCoowner && coownerEmail ? 1 : 0);
        return (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000,
          }}
            onClick={e => { if (e.target === e.currentTarget && !saving) setRecipientDialog(null); }}
          >
            <div style={{
              background: '#fff', borderRadius: 14, padding: 28, maxWidth: 480, width: '90%',
              boxShadow: '0 8px 40px rgba(0,0,0,0.2)',
            }}>
              <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 800, color: 'var(--ink-800)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Send size={16} color="var(--teal-500)" />
                Enviar propuesta por correo
              </h3>
              <p style={{ margin: '0 0 18px', fontSize: 13, color: 'var(--ink-500)' }}>
                Selecciona a quiénes deseas enviar la propuesta de plan de pagos.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
                {/* Propietario */}
                <label style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 14px',
                  border: `1.5px solid ${sendOwner && ownerEmail ? 'var(--teal-500)' : 'var(--sand-200)'}`,
                  borderRadius: 10,
                  background: sendOwner && ownerEmail ? 'var(--teal-50)' : '#fff',
                  cursor: ownerEmail ? 'pointer' : 'not-allowed',
                  opacity: ownerEmail ? 1 : 0.5,
                }}>
                  <input
                    type="checkbox"
                    checked={sendOwner && !!ownerEmail}
                    disabled={!ownerEmail}
                    onChange={e => setRecipientDialog(d => ({ ...d, sendOwner: e.target.checked }))}
                    style={{ width: 16, height: 16, cursor: 'pointer' }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-700)' }}>
                      Propietario
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--ink-500)', wordBreak: 'break-all' }}>
                      {ownerEmail || 'Sin correo registrado'}
                    </div>
                  </div>
                </label>

                {/* Copropietario */}
                <label style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 14px',
                  border: `1.5px solid ${sendCoowner && coownerEmail ? 'var(--teal-500)' : 'var(--sand-200)'}`,
                  borderRadius: 10,
                  background: sendCoowner && coownerEmail ? 'var(--teal-50)' : '#fff',
                  cursor: coownerEmail ? 'pointer' : 'not-allowed',
                  opacity: coownerEmail ? 1 : 0.5,
                }}>
                  <input
                    type="checkbox"
                    checked={sendCoowner && !!coownerEmail}
                    disabled={!coownerEmail}
                    onChange={e => setRecipientDialog(d => ({ ...d, sendCoowner: e.target.checked }))}
                    style={{ width: 16, height: 16, cursor: 'pointer' }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-700)' }}>
                      Copropietario
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--ink-500)', wordBreak: 'break-all' }}>
                      {coownerEmail || 'Sin correo registrado'}
                    </div>
                  </div>
                </label>

                {!ownerEmail && !coownerEmail && (
                  <div style={{ fontSize: 11, color: 'var(--coral-500)', padding: '6px 4px' }}>
                    Esta unidad no tiene correos registrados. La propuesta se guardará sin envío.
                  </div>
                )}
              </div>

              <div style={{ fontSize: 11, color: 'var(--ink-400)', marginBottom: 14 }}>
                {selectedCount > 0
                  ? `Se enviará a ${selectedCount} destinatario${selectedCount > 1 ? 's' : ''}.`
                  : 'No hay destinatarios seleccionados — la propuesta se guardará sin enviar correo.'}
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => setRecipientDialog(null)}
                  disabled={saving}
                >
                  Cancelar
                </button>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={submitProposal}
                  disabled={saving}
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <Send size={13} />
                  {saving
                    ? 'Enviando…'
                    : (selectedCount > 0 ? 'Confirmar y enviar' : 'Guardar sin enviar')}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Cancel Dialog Modal ── */}
      {cancelDialog && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000,
        }}
          onClick={e => { if (e.target === e.currentTarget) setCancelDialog(null); }}
        >
          <div style={{
            background: '#fff', borderRadius: 14, padding: 28, maxWidth: 440, width: '90%',
            boxShadow: '0 8px 40px rgba(0,0,0,0.2)',
          }}>
            <h3 style={{ margin: '0 0 10px', fontSize: 16, fontWeight: 800, color: 'var(--ink-800)' }}>
              Cancelar plan de pagos
            </h3>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--ink-500)' }}>
              ¿Estás seguro de que deseas cancelar este plan? Esta acción no se puede deshacer.
            </p>
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-600)', display: 'block', marginBottom: 6 }}>
                Motivo de cancelación (opcional)
              </label>
              <textarea
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
                placeholder="Ingresa el motivo de la cancelación…"
                rows={3}
                style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--sand-200)', borderRadius: 8, fontSize: 13, resize: 'vertical', boxSizing: 'border-box', outline: 'none' }}
                autoFocus
              />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setCancelDialog(null)}
                disabled={actionLoading}
              >
                No cancelar
              </button>
              <button
                className="btn btn-outline btn-sm"
                onClick={handleCancelConfirm}
                disabled={actionLoading}
                style={{ color: '#e84040', borderColor: '#e84040' }}
              >
                {actionLoading ? 'Cancelando…' : 'Confirmar cancelación'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Plan PDF Print Modal ── */}
      {printPlan && (
        <PlanPagosPrintModal
          plan={printPlan}
          unit={selectedUnit}
          tc={tenantData}
          onClose={() => setPrintPlan(null)}
        />
      )}

    </div>
  );
}
