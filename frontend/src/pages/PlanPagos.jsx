/**
 * Homly — Plan de Pagos
 * Módulo dedicado para gestionar planes de pago de adeudos.
 * - Managers (admin/tesorero/contador/auditor): seleccionan unidad, crean/envían/cancelan planes.
 * - Vecinos: ven los planes de su unidad, pueden aceptar/rechazar.
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { reportsAPI, tenantsAPI, paymentPlansAPI, periodsAPI, unitsAPI } from '../api/client';
import { todayPeriod, periodLabel, prevPeriod } from '../utils/helpers';
import {
  TrendingDown, Search, X, Send, Download,
  ChevronLeft, Building, CheckCircle, Calendar,
} from 'lucide-react';
import toast from 'react-hot-toast';

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

function fmt(n) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency', currency: 'MXN',
    minimumFractionDigits: 0, maximumFractionDigits: 2,
  }).format(n || 0);
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function PlanPagos() {
  const { tenantId, role } = useAuth();
  const [searchParams] = useSearchParams();

  const isManager  = ['admin', 'tesorero', 'superadmin'].includes(role);
  const isReadOnly = ['contador', 'auditor'].includes(role);
  const isVecino   = role === 'vecino';
  const canWrite   = isManager; // contador/auditor = read-only

  // ─── Periodo de corte ──────────────────────────────────────────────────────
  const [cutoff,        setCutoff]        = useState(todayPeriod());
  const [closedPeriods, setClosedPeriods] = useState([]);

  // ─── Tenant & units ────────────────────────────────────────────────────────
  const [tenantData,    setTenantData]    = useState(null);
  const [adeudosItems,  setAdeudosItems]  = useState([]);  // items from reporte-adeudos
  const [adeudosLoading, setAdeudosLoading] = useState(false);
  const [unitSearch,    setUnitSearch]    = useState('');
  const [selectedUnit,       setSelectedUnit]       = useState(null);
  const [selectedDebt,       setSelectedDebt]       = useState(0);
  const [selectedAdeudoItem, setSelectedAdeudoItem] = useState(null); // full item incl. period_debts

  // ─── Plans state ───────────────────────────────────────────────────────────
  const [plans,        setPlans]        = useState([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [tab,          setTab]          = useState('list');   // 'list' | 'new'

  // ─── New plan form ─────────────────────────────────────────────────────────
  const [freq,          setFreq]          = useState(1);
  const [numPagos,      setNumPagos]      = useState(6);
  const [applyInterest, setApplyInterest] = useState(false);
  const [interestRate,  setInterestRate]  = useState(5);
  const [notes,         setNotes]         = useState('');
  const [saving,        setSaving]        = useState(false);

  const maintenanceFee = parseFloat(tenantData?.maintenance_fee || 0);
  const currentFreq    = PLAN_FREQUENCIES.find(f => f.value === freq);
  const maxPagos       = currentFreq?.max ?? 12;
  const durMonths      = freq * numPagos;

  useEffect(() => {
    if (numPagos > maxPagos) setNumPagos(maxPagos);
  }, [freq, maxPagos]); // eslint-disable-line

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
    // Reset selection when period changes
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

    // Try to find unit in the adeudos list (units with debt)
    const item = adeudosItems.find(i => String((i.unit || {}).id) === String(uid));
    if (item) {
      setSelectedUnit(item.unit);
      setSelectedDebt(parseFloat(item.total_adeudo || 0));
      setSelectedAdeudoItem(item);
      return;
    }

    // Fallback: unit has no adeudo for this cutoff period — load it directly
    // Only attempt once loading has finished (adeudosLoading = false)
    if (!adeudosLoading && tenantId) {
      unitsAPI.get(tenantId, uid)
        .then(r => {
          setSelectedUnit(r.data);
          setSelectedDebt(0);
          setSelectedAdeudoItem(null);
        })
        .catch(() => {}); // silently fail if unit not found
    }
  }, [adeudosItems, adeudosLoading, searchParams, tenantId, isVecino]);

  // ─── Load plans for selected unit ─────────────────────────────────────────
  const loadPlans = useCallback(async () => {
    if (!tenantId) return;
    const params = isVecino ? {} : { unit_id: selectedUnit?.id };
    if (!isVecino && !selectedUnit?.id) { setPlans([]); return; }
    setPlansLoading(true);
    try {
      const res = await paymentPlansAPI.list(tenantId, params);
      setPlans(res.data || []);
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

  // ─── Computed plan form rows ───────────────────────────────────────────────
  const totalConInteres = useMemo(() => {
    if (!applyInterest || interestRate <= 0) return selectedDebt;
    const monthlyRate = (interestRate / 100) / 12;
    return selectedDebt * (1 + monthlyRate * durMonths);
  }, [selectedDebt, applyInterest, interestRate, durMonths]);

  const debtPorPago    = numPagos > 0 ? totalConInteres / numPagos : 0;
  const regularPorPago = maintenanceFee * freq;
  const interesTotal   = totalConInteres - selectedDebt;

  const rows = useMemo(() => {
    const now = new Date();
    return Array.from({ length: numPagos }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() + (i + 1) * freq, 1);
      const periodKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const lbl = d.toLocaleString('es-MX', { month: 'long', year: 'numeric' });
      return {
        num: i + 1,
        period_key:   periodKey,
        period_label: lbl.charAt(0).toUpperCase() + lbl.slice(1),
        debt_part:    debtPorPago,
        regular_part: regularPorPago,
        total:        debtPorPago + regularPorPago,
        paid_amount:  0,
        status:       'pending',
      };
    });
  }, [numPagos, freq, debtPorPago, regularPorPago]);

  const grandDebt  = totalConInteres;
  const grandReg   = regularPorPago * numPagos;
  const grandTotal = grandDebt + grandReg;

  // ─── Actions ───────────────────────────────────────────────────────────────
  const handleSaveDraft = async () => {
    setSaving(true);
    try {
      await paymentPlansAPI.create(tenantId, {
        unit:                selectedUnit.id,
        cutoff_period:       cutoff,
        total_adeudo:        selectedDebt,
        maintenance_fee:     maintenanceFee,
        frequency:           freq,
        num_payments:        numPagos,
        apply_interest:      applyInterest,
        interest_rate:       applyInterest ? interestRate : 0,
        total_with_interest: totalConInteres,
        notes,
        installments:        rows,
      });
      toast.success('Plan de pago guardado como borrador.');
      await loadPlans();
      setTab('list');
      setNotes('');
      setApplyInterest(false);
      setFreq(1);
      setNumPagos(6);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Error al guardar el plan.');
    } finally {
      setSaving(false);
    }
  };

  const handleSend = async (plan) => {
    setActionLoading(true);
    try {
      await paymentPlansAPI.send(tenantId, plan.id);
      toast.success('Plan enviado al vecino por correo.');
      await loadPlans();
      setSelectedPlan(null);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Error al enviar el plan.');
    } finally { setActionLoading(false); }
  };

  const handleAccept = async (plan) => {
    setActionLoading(true);
    try {
      await paymentPlansAPI.accept(tenantId, plan.id);
      toast.success('Plan aceptado. Se incluirá en la cobranza mensual.');
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

  const handleCancel = async (plan) => {
    if (!window.confirm('¿Cancelar este plan de pago? Esta acción no se puede deshacer.')) return;
    setActionLoading(true);
    try {
      await paymentPlansAPI.cancel(tenantId, plan.id);
      toast.success('Plan cancelado.');
      await loadPlans();
      setSelectedPlan(null);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Error al cancelar el plan.');
    } finally { setActionLoading(false); }
  };

  const handleDownloadPDF = async (plan) => {
    try {
      const res = await paymentPlansAPI.pdf(tenantId, plan.id);
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      const unitCode = (selectedUnit?.unit_id_code || plan.unit_id_code || 'unidad').replace(/\s/g, '_');
      a.download = `plan_pago_${unitCode}_${plan.id.slice(0, 8)}.pdf`;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast.error('No se pudo descargar el PDF.');
    }
  };

  // ─── Period options for the cutoff selector ──────────────────────────────
  const periodOptions = useMemo(() => {
    const today = todayPeriod();
    // Build a set of period strings from closed periods + last 12 months
    const set = new Set();
    // Add last 12 months back from today
    let p = today;
    for (let i = 0; i < 13; i++) { set.add(p); p = prevPeriod(p); }
    // Add all closed periods
    closedPeriods.forEach(cp => { if (cp.period) set.add(cp.period); });
    // Sort descending
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [closedPeriods]);

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

  // ─── Render helpers ───────────────────────────────────────────────────────
  const freqBtnStyle = (isActive) => ({
    padding: '8px 14px', borderRadius: 8,
    border: `2px solid ${isActive ? 'var(--teal-500)' : 'var(--sand-200)'}`,
    background: isActive ? 'var(--teal-50)' : '#fff',
    color: isActive ? 'var(--teal-700)' : 'var(--ink-600)',
    fontWeight: isActive ? 700 : 400, cursor: 'pointer', fontSize: 12,
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
        {/* Back button */}
        <button
          onClick={() => setSelectedPlan(null)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--teal-600)', background: 'none', border: 'none', cursor: 'pointer', width: 'fit-content' }}
        >
          <ChevronLeft size={14} /> Volver a la lista
        </button>

        {/* Plan header info grid */}
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
            { label: 'No. de pagos',     value: `${plan.num_payments}` },
          ].map(c => (
            <div key={c.label} style={{ background: 'var(--sand-50)', border: '1px solid var(--sand-200)', borderRadius: 7, padding: '8px 12px' }}>
              <div style={{ fontSize: 10, color: 'var(--ink-400)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.04em', marginBottom: 3 }}>{c.label}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: c.color || 'var(--ink-700)' }}>{c.value}</div>
            </div>
          ))}
        </div>

        {/* Totals strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {[
            { label: 'Adeudo Base',      value: fmt(parseFloat(plan.total_adeudo || 0)),        color: 'var(--coral-500)' },
            { label: 'Total con Interés', value: fmt(parseFloat(plan.total_with_interest || 0)), color: '#1e3a5f' },
            { label: 'Pagado hasta hoy', value: fmt(totalPaid),                                  color: 'var(--teal-600)' },
          ].map(c => (
            <div key={c.label} style={{ background: '#fff', border: '1px solid var(--sand-200)', borderRadius: 8, padding: '10px 14px', textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: 'var(--ink-400)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.04em', marginBottom: 4 }}>{c.label}</div>
              <div style={{ fontSize: 17, fontWeight: 800, color: c.color }}>{c.value}</div>
            </div>
          ))}
        </div>

        {/* Progress bar for active plans */}
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

        {/* Installments table */}
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

        {/* Notes */}
        {plan.notes && (
          <div style={{ background: 'var(--sand-50)', border: '1px solid var(--sand-200)', borderRadius: 7, padding: '10px 14px', fontSize: 12, color: 'var(--ink-600)', fontStyle: 'italic' }}>
            <strong>Notas:</strong> {plan.notes}
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end', borderTop: '1px solid var(--sand-200)', paddingTop: 12 }}>
          <button className="btn btn-outline btn-sm" onClick={() => handleDownloadPDF(plan)}>
            <Download size={13} /> Descargar PDF
          </button>
          {canWrite && plan.status === 'draft' && (
            <button className="btn btn-primary btn-sm" disabled={actionLoading} onClick={() => handleSend(plan)}>
              <Send size={13} /> Enviar al vecino
            </button>
          )}
          {isVecino && plan.status === 'sent' && (
            <>
              <button
                className="btn btn-primary btn-sm"
                disabled={actionLoading}
                onClick={() => handleAccept(plan)}
                style={{ background: 'var(--teal-500)', borderColor: 'var(--teal-500)' }}
              >
                <CheckCircle size={13} /> Aceptar plan
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
    if (plans.length === 0) {
      return (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--ink-400)' }}>
          <TrendingDown size={36} style={{ opacity: 0.25, marginBottom: 10 }} />
          <div style={{ fontSize: 14, marginBottom: 4 }}>
            {isVecino
              ? 'No hay planes de pago disponibles para tu unidad.'
              : 'No hay planes de pago para esta unidad.'}
          </div>
          {canWrite && selectedUnit && (
            <button className="btn btn-primary btn-sm" style={{ marginTop: 14 }} onClick={() => setTab('new')}>
              + Crear primer plan
            </button>
          )}
        </div>
      );
    }
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {plans.map(plan => {
          const sc         = PLAN_STATUS_COLORS[plan.status] || '#64748b';
          const sl         = PLAN_STATUS_LABELS[plan.status] || plan.status;
          const freq_lbl   = PLAN_FREQUENCIES.find(f => f.value === plan.frequency)?.label || plan.frequency;
          const installs   = plan.installments || [];
          const paidCount  = installs.filter(i => i.status === 'paid').length;
          const progressPct = installs.length > 0 ? (paidCount / installs.length) * 100 : 0;
          return (
            <div
              key={plan.id}
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
            </div>
          );
        })}
      </div>
    );
  };

  // ─── New plan form ─────────────────────────────────────────────────────────
  const renderNewPlanForm = () => {
    const u = selectedUnit || {};
    const periodDebts = selectedAdeudoItem?.period_debts || [];
    const netPrevDebt = parseFloat(selectedAdeudoItem?.net_prev_debt || 0);
    // Occupancy label
    const OCCUPANCY_LABEL = { propietario: 'Propietario', rentado: 'Rentado', 'vacío': 'Vacío' };
    const occLabel = OCCUPANCY_LABEL[u.occupancy] || u.occupancy || '—';
    // Contact info based on occupancy
    const contactName  = u.responsible_name || [u.owner_first_name, u.owner_last_name].filter(Boolean).join(' ') || '—';
    const contactEmail = u.occupancy === 'rentado' ? (u.tenant_email || u.owner_email || '—') : (u.owner_email || '—');
    const contactPhone = u.occupancy === 'rentado' ? (u.tenant_phone || u.owner_phone || '—') : (u.owner_phone || '—');
    const ownerFull    = [u.owner_first_name, u.owner_last_name].filter(Boolean).join(' ') || '—';

    return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── UNIT INFO CARD ── */}
      <div style={{ border: '1px solid var(--teal-200)', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
        {/* Card header */}
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

        {/* Contact + debt totals */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
          {/* Contact info */}
          <div style={{ padding: '12px 16px', borderRight: '1px solid var(--sand-100)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-400)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
              Información de contacto
            </div>
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

          {/* Debt totals */}
          <div style={{ padding: '12px 16px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-400)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
              Resumen de adeudo al {periodLabel(cutoff)}
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

      {/* Plan config */}
      <div style={{ background: 'var(--sand-50)', border: '1px solid var(--sand-200)', borderRadius: 10, padding: '14px 16px' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-600)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 14 }}>
          ⚙️ Configuración del Plan
        </div>
        {/* Frequency */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-600)', marginBottom: 8 }}>Frecuencia de pago</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {PLAN_FREQUENCIES.map(f => (
              <button key={f.value} style={freqBtnStyle(freq === f.value)} onClick={() => setFreq(f.value)}>
                <div>{f.label}</div>
                <div style={{ fontSize: 10, opacity: 0.7 }}>{f.sublabel}</div>
              </button>
            ))}
          </div>
        </div>
        {/* Num payments */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-600)', marginBottom: 8 }}>
            Número de pagos
            <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--ink-400)', fontWeight: 400 }}>
              (máx. {maxPagos} pagos → {maxPagos * freq} meses)
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <input type="range" min={1} max={maxPagos} value={numPagos}
              onChange={e => setNumPagos(Number(e.target.value))}
              style={{ flex: 1, accentColor: 'var(--teal-500)' }} />
            <div style={{ textAlign: 'center', minWidth: 42 }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--teal-700)', lineHeight: 1 }}>{numPagos}</div>
              <div style={{ fontSize: 10, color: 'var(--ink-400)' }}>pagos</div>
            </div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink-500)', marginTop: 4 }}>
            ⏱ Duración: <strong>{durMonths} {durMonths === 1 ? 'mes' : 'meses'}</strong>
            {durMonths <= 3 && <span style={{ color: 'var(--coral-500)', marginLeft: 8 }}>· Plan corto</span>}
            {durMonths >= 9 && <span style={{ color: '#d97706', marginLeft: 8 }}>· Plan largo</span>}
          </div>
        </div>
        {/* Interest */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', paddingTop: 10, borderTop: '1px solid var(--sand-200)' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={applyInterest} onChange={e => setApplyInterest(e.target.checked)}
              style={{ width: 16, height: 16, accentColor: 'var(--coral-500)' }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-700)' }}>Aplicar intereses moratorios</span>
          </label>
          {applyInterest && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: 'var(--ink-600)' }}>Tasa anual:</span>
              <input type="number" min={0} max={100} step={0.5} value={interestRate}
                onChange={e => setInterestRate(parseFloat(e.target.value) || 0)}
                style={{ width: 70, padding: '4px 8px', border: '1px solid var(--sand-200)', borderRadius: 6, fontSize: 13, textAlign: 'right' }} />
              <span style={{ fontSize: 12, color: 'var(--ink-600)' }}>%</span>
              {interesTotal > 0.01 && (
                <span style={{ fontSize: 12, color: 'var(--coral-500)', fontWeight: 700 }}>
                  → +{fmt(interesTotal)} de interés
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Preview table */}
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-600)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
          📋 Tabla de Pagos
        </div>
        <div style={{ border: '1px solid var(--sand-200)', borderRadius: 8, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#1e3a5f', color: 'white' }}>
                {['#', 'Período', 'Abono Deuda', `Cuota Regular${freq > 1 ? ` (×${freq})` : ''}`, 'Total a Pagar'].map(h => (
                  <th key={h} style={{ padding: '9px 12px', fontWeight: 600, fontSize: 11, textAlign: h === '#' ? 'left' : 'right', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.num} style={{ background: i % 2 === 0 ? '#fff' : 'var(--sand-50)', borderBottom: '1px solid var(--sand-100)' }}>
                  <td style={{ padding: '7px 12px', color: 'var(--ink-400)', fontWeight: 600 }}>{r.num}</td>
                  <td style={{ padding: '7px 12px', textAlign: 'right', color: 'var(--ink-700)' }}>{r.period_label}</td>
                  <td style={{ padding: '7px 12px', textAlign: 'right', color: 'var(--coral-600)', fontWeight: 600 }}>{fmt(r.debt_part)}</td>
                  <td style={{ padding: '7px 12px', textAlign: 'right', color: 'var(--ink-600)' }}>{fmt(r.regular_part)}</td>
                  <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 700, color: '#1e3a5f' }}>{fmt(r.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: '#1e3a5f', color: 'white', fontWeight: 700 }}>
                <td colSpan={2} style={{ padding: '9px 12px', fontSize: 11 }}>
                  TOTAL · {numPagos} pago{numPagos !== 1 ? 's' : ''} en {durMonths} mes{durMonths !== 1 ? 'es' : ''}
                </td>
                <td style={{ padding: '9px 12px', textAlign: 'right' }}>{fmt(grandDebt)}</td>
                <td style={{ padding: '9px 12px', textAlign: 'right' }}>{fmt(grandReg)}</td>
                <td style={{ padding: '9px 12px', textAlign: 'right', fontSize: 14 }}>{fmt(grandTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Notes */}
      <div>
        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-600)', display: 'block', marginBottom: 6 }}>Notas (opcional)</label>
        <textarea
          value={notes} onChange={e => setNotes(e.target.value)}
          placeholder="Condiciones especiales, acuerdos, observaciones…"
          rows={3}
          style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--sand-200)', borderRadius: 8, fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }}
        />
      </div>

      {/* Save button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, borderTop: '1px solid var(--sand-200)', paddingTop: 12 }}>
        <span style={{ fontSize: 11, color: 'var(--ink-400)', flex: 1, alignSelf: 'center' }}>
          El plan se guardará como borrador. Podrás enviarlo al vecino cuando esté listo.
        </span>
        <button className="btn btn-secondary" onClick={() => setTab('list')}>Cancelar</button>
        <button className="btn btn-primary" disabled={saving || selectedDebt <= 0} onClick={handleSaveDraft}>
          {saving ? 'Guardando…' : 'Guardar borrador'}
        </button>
      </div>
    </div>
    );
  };

  // ─── Vecino: auto-load plans on mount ─────────────────────────────────────
  // (loadPlans already handles isVecino case — no unit selection needed)

  // ─── Render ───────────────────────────────────────────────────────────────
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
            ? 'Revisa y gestiona los planes de pago asignados a tu unidad.'
            : 'Gestiona los planes de pago de adeudos de las unidades del condominio.'}
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
            {/* Header */}
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--sand-100)', background: 'var(--sand-50)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-600)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                Unidades con adeudos
              </div>

              {/* ── Periodo de corte selector ── */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-500)', marginBottom: 5, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Calendar size={11} />
                  Período de corte
                </div>
                <select
                  value={cutoff}
                  onChange={e => setCutoff(e.target.value)}
                  style={{
                    width: '100%', padding: '6px 8px', border: '1px solid var(--sand-200)',
                    borderRadius: 7, fontSize: 12, boxSizing: 'border-box',
                    background: '#fff', color: 'var(--ink-700)', cursor: 'pointer',
                    fontWeight: 600,
                  }}
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
                  style={{
                    width: '100%', padding: '6px 8px 6px 26px', border: '1px solid var(--sand-200)',
                    borderRadius: 7, fontSize: 12, boxSizing: 'border-box', outline: 'none',
                    background: '#fff',
                  }}
                />
              </div>
            </div>

            {/* Units list */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {adeudosLoading ? (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--ink-400)', fontSize: 12 }}>Cargando…</div>
              ) : filteredItems.length === 0 ? (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--ink-400)', fontSize: 12 }}>
                  {adeudosItems.length === 0 ? 'No hay unidades con adeudos.' : 'Sin coincidencias.'}
                </div>
              ) : (
                filteredItems.map(item => {
                  const u    = item.unit || {};
                  const debt = parseFloat(item.total_adeudo || 0);
                  const isSel = selectedUnit?.id === u.id;
                  return (
                    <div
                      key={u.id}
                      onClick={() => {
                        setSelectedUnit(u);
                        setSelectedDebt(debt);
                        setSelectedAdeudoItem(item);
                        setSelectedPlan(null);
                        setTab('list');
                      }}
                      style={{
                        padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--sand-100)',
                        background: isSel ? 'var(--teal-50)' : '#fff',
                        borderLeft: isSel ? '3px solid var(--teal-500)' : '3px solid transparent',
                        transition: 'background 0.1s',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
                        <div>
                          <div style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 700, color: 'var(--teal-600)', background: 'var(--teal-50)', padding: '1px 6px', borderRadius: 4, marginBottom: 3, display: 'inline-block' }}>
                            {u.unit_id_code}
                          </div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-700)' }}>{u.unit_name}</div>
                          {u.responsible_name && (
                            <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>{u.responsible_name}</div>
                          )}
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: debt > 0 ? 'var(--coral-500)' : 'var(--teal-600)' }}>
                            {fmt(debt)}
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--ink-400)' }}>adeudo</div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* ── RIGHT: Plans area ── */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 0 }}>
          {/* No unit selected (managers) */}
          {!isVecino && !selectedUnit ? (
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              background: '#fff', border: '1px solid var(--sand-200)', borderRadius: 12, padding: 40, textAlign: 'center',
            }}>
              <Building size={48} style={{ opacity: 0.15, marginBottom: 14 }} />
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink-600)', marginBottom: 6 }}>
                Selecciona una unidad
              </div>
              <div style={{ fontSize: 13, color: 'var(--ink-400)' }}>
                Elige una unidad de la lista de la izquierda para ver y gestionar sus planes de pago.
              </div>
            </div>
          ) : (
            <div style={{ flex: 1, background: '#fff', border: '1px solid var(--sand-200)', borderRadius: 12, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {/* Unit header */}
              {!isVecino && selectedUnit && (
                <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--sand-100)', background: 'var(--sand-50)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <TrendingDown size={16} color="var(--coral-500)" />
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: 'var(--teal-700)', background: 'var(--teal-50)', padding: '2px 8px', borderRadius: 5 }}>
                          {selectedUnit.unit_id_code}
                        </span>
                        <span style={{ fontWeight: 700, color: 'var(--ink-700)', fontSize: 14 }}>{selectedUnit.unit_name}</span>
                      </div>
                      {selectedUnit.responsible_name && (
                        <div style={{ fontSize: 11, color: 'var(--ink-500)', marginTop: 2 }}>Responsable: {selectedUnit.responsible_name}</div>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 10, color: 'var(--ink-400)', textTransform: 'uppercase', fontWeight: 600 }}>
                        Adeudo al {periodLabel(cutoff)}
                      </div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--coral-500)' }}>{fmt(selectedDebt)}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Vecino header */}
              {isVecino && (
                <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--sand-100)', background: 'var(--sand-50)', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <TrendingDown size={16} color="var(--coral-500)" />
                  <span style={{ fontWeight: 700, color: 'var(--ink-700)', fontSize: 14 }}>Mis Planes de Pago</span>
                </div>
              )}

              {/* Tabs (managers only) */}
              {(isManager || isReadOnly) && selectedUnit && !selectedPlan && (
                <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--sand-200)', background: 'var(--sand-50)' }}>
                  {[
                    { key: 'list', label: 'Planes existentes' },
                    ...(canWrite ? [{ key: 'new', label: '+ Nuevo plan' }] : []),
                  ].map(t => (
                    <button
                      key={t.key}
                      onClick={() => { setTab(t.key); setSelectedPlan(null); }}
                      style={{
                        padding: '10px 20px', border: 'none', background: 'none', cursor: 'pointer',
                        fontSize: 13, fontWeight: tab === t.key ? 700 : 400,
                        color: tab === t.key ? 'var(--teal-700)' : 'var(--ink-500)',
                        borderBottom: tab === t.key ? '2px solid var(--teal-500)' : '2px solid transparent',
                        marginBottom: -1,
                      }}
                    >{t.label}</button>
                  ))}
                  <div style={{ flex: 1 }} />
                  {tab === 'list' && (
                    <button className="btn btn-ghost btn-sm" style={{ margin: 'auto 12px' }} onClick={loadPlans} title="Recargar planes">
                      ↻
                    </button>
                  )}
                </div>
              )}

              {/* Content */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
                {/* Detail view */}
                {selectedPlan ? (
                  renderPlanDetail(selectedPlan)
                ) : tab === 'new' && canWrite && selectedUnit ? (
                  renderNewPlanForm()
                ) : (
                  renderPlansList()
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
