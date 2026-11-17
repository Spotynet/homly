import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { periodsAPI, tenantsAPI, reportsAPI } from '../api/client';
import {
  Lock, LockOpen, CheckCircle2, XCircle, Clock, Plus,
  ChevronDown, ChevronRight, AlertCircle, Loader,
  ListOrdered, CheckCheck, FolderArchive, Download, Printer, Eye, FileText, Calendar,
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { todayPeriod, prevPeriod } from '../utils/helpers';
import toast from 'react-hot-toast';

const spinStyle = { animation: 'spin 0.8s linear infinite' };
const spinKeyframes = `@keyframes spin { to { transform: rotate(360deg); } }`;

// ── helpers ──────────────────────────────────────────────────────────────────

function periodLabel(p) {
  if (!p) return '—';
  const [y, m] = p.split('-');
  return new Date(+y, +m - 1, 1).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
}

function generatePeriods(opStart) {
  if (!opStart) return [];
  const periods = [];
  const [sy, sm] = opStart.split('-').map(Number);
  const now = new Date();
  let y = sy, m = sm;
  while (y < now.getFullYear() || (y === now.getFullYear() && m <= now.getMonth() + 1)) {
    periods.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return periods.reverse();
}

const STATUS_META = {
  in_progress: { label: 'En proceso', icon: Clock,        color: 'var(--amber-600)', bg: 'var(--amber-50)' },
  completed:   { label: 'Completado', icon: CheckCircle2, color: 'var(--teal-700)',  bg: 'var(--teal-50)'  },
  rejected:    { label: 'Rechazado',  icon: XCircle,      color: 'var(--coral-500)', bg: 'var(--coral-50)' },
};

const STEP_META = {
  pending:  { label: 'Pendiente', icon: Clock,        color: 'var(--ink-400)',   bg: 'var(--sand-100)' },
  approved: { label: 'Aprobado',  icon: CheckCircle2, color: 'var(--teal-700)',  bg: 'var(--teal-50)'  },
  rejected: { label: 'Rechazado', icon: XCircle,      color: 'var(--coral-500)', bg: 'var(--coral-50)' },
};

// ── ClosureRequestCard ────────────────────────────────────────────────────────

function ClosureRequestCard({ request, currentUserId, onApprove, onReject, onRefresh }) {
  const [expanded,     setExpanded]     = useState(false);
  const [working,      setWorking]      = useState(false);
  const [rejectNotes,  setRejectNotes]  = useState('');
  const [showReject,   setShowReject]   = useState(false);

  const meta = STATUS_META[request.status] || STATUS_META.in_progress;
  const StatusIcon = meta.icon;

  // The pending step is the lowest-order step that is still 'pending'
  const pendingStep = (request.steps || [])
    .filter(s => s.status === 'pending')
    .sort((a, b) => a.order - b.order)[0];

  // Compare as strings to avoid UUID type mismatch
  const isMyTurn = pendingStep &&
    String(pendingStep.approver) === String(currentUserId) &&
    request.status === 'in_progress';

  const handleApprove = async () => {
    setWorking(true);
    try {
      await onApprove(request.id, {});
      toast.success('Paso aprobado');
      onRefresh();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Error al aprobar');
    } finally { setWorking(false); }
  };

  const handleReject = async () => {
    if (!rejectNotes.trim()) { toast.error('Indica el motivo del rechazo'); return; }
    setWorking(true);
    try {
      await onReject(request.id, { notes: rejectNotes });
      toast.success('Solicitud rechazada');
      onRefresh();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Error al rechazar');
    } finally { setWorking(false); setShowReject(false); }
  };

  return (
    <div style={{ border: '1px solid var(--sand-200)', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
      {/* Header row */}
      <div
        onClick={() => setExpanded(p => !p)}
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '12px 16px', cursor: 'pointer',
          background: expanded ? 'var(--sand-50)' : '#fff',
          borderBottom: expanded ? '1px solid var(--sand-100)' : 'none',
        }}>
        {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>
            Período: {periodLabel(request.period)}
            {' '}
            <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--ink-400)' }}>
              ({request.period})
            </span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: 2 }}>
            Iniciado por {request.initiated_by_name || '—'} ·{' '}
            {new Date(request.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}
          </div>
        </div>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
          background: meta.bg, color: meta.color,
        }}>
          <StatusIcon size={12} /> {meta.label}
        </span>
        {isMyTurn && (
          <span style={{
            fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
            background: 'var(--coral-50)', color: 'var(--coral-600)', marginLeft: 4,
          }}>
            ● Tu turno
          </span>
        )}
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Steps timeline */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink-400)', marginBottom: 10 }}>
              Pasos de aprobación
            </div>
            {(!request.steps || request.steps.length === 0) ? (
              <div style={{ fontSize: 13, color: 'var(--ink-300)', padding: '8px 0' }}>Sin pasos</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[...request.steps].sort((a, b) => a.order - b.order).map((step, idx) => {
                  const sm = STEP_META[step.status] || STEP_META.pending;
                  const StepIcon = sm.icon;
                  // A step is "active" if it is pending and all previous steps are approved
                  const prevApproved = idx === 0 || request.steps
                    .filter(s => s.order < step.order)
                    .every(s => s.status === 'approved');
                  const isActive = step.status === 'pending' && prevApproved;
                  return (
                    <div key={step.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '9px 12px', borderRadius: 8,
                      background: isActive ? 'var(--teal-50)' : 'var(--sand-50)',
                      border: isActive ? '1px solid var(--teal-200)' : '1px solid transparent',
                    }}>
                      <span style={{
                        width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                        background: isActive ? 'var(--teal-600)' : step.status === 'approved' ? 'var(--teal-100)' : 'var(--sand-200)',
                        color: isActive ? '#fff' : step.status === 'approved' ? 'var(--teal-700)' : 'var(--ink-400)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: 700,
                      }}>{idx + 1}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{step.label || `Paso ${idx + 1}`}</div>
                        <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>
                          {step.approver_name || '—'}
                          {step.approver_email ? ` · ${step.approver_email}` : ''}
                        </div>
                        {step.notes && (
                          <div style={{ fontSize: 11, color: 'var(--ink-500)', marginTop: 2, fontStyle: 'italic' }}>
                            "{step.notes}"
                          </div>
                        )}
                      </div>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 12,
                        background: sm.bg, color: sm.color,
                      }}>
                        <StepIcon size={11} /> {sm.label}
                      </span>
                      {step.actioned_at && (
                        <span style={{ fontSize: 10, color: 'var(--ink-300)' }}>
                          {new Date(step.actioned_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Action buttons — only shown when it's this user's turn */}
          {isMyTurn && (
            <div style={{ borderTop: '1px solid var(--sand-100)', paddingTop: 12 }}>
              {!showReject ? (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={working}
                    onClick={handleApprove}>
                    {working ? <Loader size={13} style={spinStyle} /> : <CheckCircle2 size={13} />}
                    {' '}Aprobar paso
                  </button>
                  <button
                    className="btn btn-sm"
                    style={{ color: 'var(--coral-600)', borderColor: 'var(--coral-200)' }}
                    disabled={working}
                    onClick={() => setShowReject(true)}>
                    <XCircle size={13} /> Rechazar
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-500)' }}>Motivo del rechazo *</label>
                  <textarea
                    className="input"
                    rows={2}
                    placeholder="Indica el motivo del rechazo..."
                    value={rejectNotes}
                    onChange={e => setRejectNotes(e.target.value)}
                    style={{ resize: 'vertical', fontSize: 13 }}
                  />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      className="btn btn-sm"
                      style={{ background: 'var(--coral-500)', color: '#fff', border: 'none' }}
                      disabled={working}
                      onClick={handleReject}>
                      {working ? <Loader size={13} style={spinStyle} /> : <XCircle size={13} />}
                      {' '}Confirmar rechazo
                    </button>
                    <button className="btn btn-sm" onClick={() => { setShowReject(false); setRejectNotes(''); }}>
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

function GestionPeriodosTab() {
  // ✅ Use role, isAdmin, isTesorero directly from useAuth (not user.role)
  const { user, role, tenantId, isAdmin, isTesorero } = useAuth();

  const [tenant,       setTenant]       = useState(null);
  const [closedPeriods, setClosedPeriods] = useState([]);
  const [closureReqs,  setClosureReqs]  = useState([]);
  const [loading,      setLoading]      = useState(true);

  // Initiate closure modal
  const [initiateOpen, setInitiateOpen] = useState(false);
  const [initPeriod,   setInitPeriod]   = useState('');
  const [initNotes,    setInitNotes]    = useState('');
  const [initiating,   setInitiating]   = useState(false);

  // Admin and tesorero can initiate closures; superadmin also maps to isAdmin=true
  const canInitiate = isAdmin || isTesorero;

  // ── load data ──────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const [tenantRes, closedRes, reqsRes] = await Promise.all([
        tenantsAPI.get(tenantId),
        periodsAPI.closedList(tenantId).catch(() => ({ data: [] })),
        periodsAPI.closureList(tenantId).catch(() => ({ data: [] })),
      ]);
      setTenant(tenantRes.data);
      setClosedPeriods(Array.isArray(closedRes.data) ? closedRes.data : (closedRes.data?.results || []));
      setClosureReqs(Array.isArray(reqsRes.data) ? reqsRes.data : (reqsRes.data?.results || []));
    } catch (e) {
      toast.error('Error al cargar datos de cierre de período');
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── derived state ─────────────────────────────────────────────────────────

  const closedSet   = new Set(closedPeriods.map(cp => cp.period));
  const opStart     = tenant?.operation_start_date;
  const periods     = generatePeriods(opStart);
  const flowSteps   = tenant?.closure_flow?.steps || [];
  const flowEnabled = !!(tenant?.closure_flow?.enabled && flowSteps.length > 0);

  const pendingReqs   = closureReqs.filter(r => r.status === 'in_progress');
  const completedReqs = closureReqs.filter(r => r.status !== 'in_progress');

  // Count how many in-progress requests have a pending step assigned to the current user
  const myPendingCount = pendingReqs.filter(r =>
    (r.steps || []).some(s =>
      s.status === 'pending' && String(s.approver) === String(user?.id)
    )
  ).length;

  // ── initiate closure ──────────────────────────────────────────────────────

  const handleInitiate = async () => {
    if (!initPeriod) { toast.error('Selecciona un período'); return; }
    setInitiating(true);
    try {
      await periodsAPI.initiateClosure(tenantId, { period: initPeriod, notes: initNotes });
      toast.success(
        flowEnabled
          ? `Flujo de cierre iniciado para ${periodLabel(initPeriod)}`
          : `Período ${periodLabel(initPeriod)} cerrado exitosamente`
      );
      setInitiateOpen(false);
      setInitPeriod('');
      setInitNotes('');
      loadData();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Error al iniciar el cierre');
    } finally {
      setInitiating(false);
    }
  };

  // ── direct reopen (admin only) ────────────────────────────────────────────

  const [reopeningId, setReopeningId] = useState(null);

  const handleDirectReopen = async (closedId, periodStr) => {
    if (!window.confirm(`¿Confirmas que deseas reabrir el período ${periodLabel(periodStr)}? Los registros de ingresos, gastos y mantenimientos podrán modificarse nuevamente.`)) return;
    setReopeningId(closedId);
    try {
      await periodsAPI.directReopen(tenantId, closedId);
      toast.success(`Período ${periodLabel(periodStr)} reabierto correctamente`);
      loadData();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Error al reabrir el período');
    } finally {
      setReopeningId(null);
    }
  };

  // ── render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
        <Loader size={24} style={{ ...spinStyle, color: 'var(--teal-600)' }} />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Gestión de períodos</h3>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--ink-400)' }}>
            Cierra, reabre y da seguimiento a los períodos contables y sus flujos de aprobación.
          </p>
        </div>
        {canInitiate && (
          <button className="btn btn-primary" onClick={() => setInitiateOpen(true)}>
            <Lock size={14} /> Iniciar Cierre
          </button>
        )}
      </div>

      {/* ── Flow info banner ────────────────────────────────────────────── */}
      {flowEnabled ? (
        <div style={{
          background: 'var(--teal-50)', border: '1px solid var(--teal-200)',
          borderRadius: 10, padding: '12px 16px',
          display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13,
        }}>
          <ListOrdered size={16} style={{ color: 'var(--teal-600)', flexShrink: 0, marginTop: 1 }} />
          <div>
            <strong style={{ color: 'var(--teal-700)' }}>Flujo de aprobación activo</strong>
            <span style={{ color: 'var(--teal-600)', marginLeft: 8 }}>
              {flowSteps.length} paso{flowSteps.length !== 1 ? 's' : ''} requerido{flowSteps.length !== 1 ? 's' : ''}:
            </span>
            <span style={{ color: 'var(--teal-700)', marginLeft: 4 }}>
              {flowSteps.map(s => s.label || s.user_name || 'Paso').join(' → ')}
            </span>
          </div>
        </div>
      ) : (
        <div style={{
          background: 'var(--sand-50)', border: '1px solid var(--sand-200)',
          borderRadius: 10, padding: '12px 16px',
          display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--ink-400)',
        }}>
          <AlertCircle size={15} style={{ flexShrink: 0 }} />
          Sin flujo de aprobación configurado — el cierre es inmediato al iniciarse.
          {isAdmin && (
            <span style={{ marginLeft: 4 }}>
              Configura un flujo en <strong>Configuración → Roles y Perfiles → Flujo de Cierre de Período</strong>.
            </span>
          )}
        </div>
      )}

      {/* ── My pending approvals alert ──────────────────────────────────── */}
      {myPendingCount > 0 && (
        <div style={{
          background: 'var(--amber-50)', border: '1px solid var(--amber-200)',
          borderRadius: 10, padding: '12px 16px',
          display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--amber-700)',
        }}>
          <AlertCircle size={15} style={{ flexShrink: 0 }} />
          <strong>
            Tienes {myPendingCount} solicitud{myPendingCount !== 1 ? 'es' : ''} pendiente{myPendingCount !== 1 ? 's' : ''} de tu aprobación. Expande la solicitud para aprobar o rechazar.
          </strong>
        </div>
      )}

      {/* ── Active closure requests ─────────────────────────────────────── */}
      {pendingReqs.length > 0 && (
        <div className="card">
          <div className="card-head">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Clock size={15} style={{ color: 'var(--amber-600)' }} /> Solicitudes en Proceso
            </h3>
            <span style={{
              background: 'var(--amber-50)', color: 'var(--amber-600)',
              borderRadius: 20, padding: '2px 10px', fontSize: 12, fontWeight: 700,
            }}>
              {pendingReqs.length}
            </span>
          </div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {pendingReqs.map(req => (
              <ClosureRequestCard
                key={req.id}
                request={req}
                currentUserId={user?.id}
                onApprove={(id, data) => periodsAPI.approveStep(tenantId, id, data)}
                onReject={(id, data) => periodsAPI.rejectStep(tenantId, id, data)}
                onRefresh={loadData}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Periods table ──────────────────────────────────────────────── */}
      <div className="card">
        <div className="card-head">
          <h3>Estado de Períodos</h3>
          <span style={{
            background: 'var(--coral-50)', color: 'var(--coral-600)',
            borderRadius: 20, padding: '2px 10px', fontSize: 12, fontWeight: 700,
          }}>
            {closedPeriods.length} cerrado{closedPeriods.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          {periods.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--ink-300)', fontSize: 13 }}>
              No hay períodos disponibles
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Período</th>
                    <th>Estado</th>
                    <th>Cerrado por</th>
                    <th>Fecha de cierre</th>
                    {isAdmin && <th style={{ width: 120 }}>Acciones</th>}
                  </tr>
                </thead>
                <tbody>
                  {periods.slice(0, 36).map(p => {
                    const closedInfo = closedPeriods.find(cp => cp.period === p);
                    const inProgress = pendingReqs.find(r => r.period === p);
                    const isReopening = reopeningId === closedInfo?.id;
                    return (
                      <tr key={p}>
                        <td style={{ fontWeight: 600 }}>{periodLabel(p)}</td>
                        <td>
                          {closedInfo ? (
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: 5,
                              padding: '3px 10px', borderRadius: 20,
                              background: 'var(--coral-50)', color: 'var(--coral-700)',
                              fontSize: 11, fontWeight: 700,
                            }}>
                              <Lock size={10} /> Período cerrado
                            </span>
                          ) : inProgress ? (
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: 5,
                              padding: '3px 10px', borderRadius: 20,
                              background: 'var(--amber-50)', color: 'var(--amber-700)',
                              fontSize: 11, fontWeight: 700,
                            }}>
                              <Clock size={10} /> Cierre en proceso
                            </span>
                          ) : (
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: 5,
                              padding: '3px 10px', borderRadius: 20,
                              background: 'var(--teal-50)', color: 'var(--teal-700)',
                              fontSize: 11, fontWeight: 700,
                            }}>
                              <LockOpen size={10} /> Abierto
                            </span>
                          )}
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--ink-400)' }}>
                          {closedInfo?.closed_by_name || (closedInfo ? '—' : '')}
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--ink-400)' }}>
                          {closedInfo?.closed_at
                            ? new Date(closedInfo.closed_at).toLocaleDateString('es-MX', {
                                day: 'numeric', month: 'short', year: 'numeric',
                              })
                            : ''}
                        </td>
                        {isAdmin && (
                          <td>
                            {closedInfo && (
                              <button
                                className="btn btn-sm"
                                disabled={isReopening}
                                onClick={() => handleDirectReopen(closedInfo.id, p)}
                                style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 5,
                                  fontSize: 11, padding: '4px 10px',
                                  border: '1px solid var(--teal-200)',
                                  background: 'var(--teal-50)', color: 'var(--teal-700)',
                                  borderRadius: 8, cursor: isReopening ? 'not-allowed' : 'pointer',
                                }}
                              >
                                {isReopening
                                  ? <Loader size={11} style={spinStyle} />
                                  : <LockOpen size={11} />
                                }
                                {' '}Reabrir
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Historical requests ─────────────────────────────────────────── */}
      {completedReqs.length > 0 && (
        <div className="card">
          <div className="card-head">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <CheckCheck size={15} style={{ color: 'var(--ink-400)' }} /> Historial de Solicitudes
            </h3>
          </div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {completedReqs.map(req => (
              <ClosureRequestCard
                key={req.id}
                request={req}
                currentUserId={user?.id}
                onApprove={(id, data) => periodsAPI.approveStep(tenantId, id, data)}
                onReject={(id, data) => periodsAPI.rejectStep(tenantId, id, data)}
                onRefresh={loadData}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Initiate Closure Modal ──────────────────────────────────────── */}
      {initiateOpen && (
        <div
          className="modal-bg open"
          onClick={e => { if (e.target === e.currentTarget) setInitiateOpen(false); }}>
          <div className="modal">
            <div className="modal-head">
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
                <Lock size={16} style={{ color: 'var(--teal-600)' }} /> Iniciar Cierre de Período
              </span>
              <button className="btn-close" onClick={() => setInitiateOpen(false)}>&times;</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              {flowEnabled && (
                <div style={{
                  background: 'var(--teal-50)', borderRadius: 8, padding: '10px 14px',
                  fontSize: 12, color: 'var(--teal-700)', border: '1px solid var(--teal-100)',
                  display: 'flex', alignItems: 'flex-start', gap: 8,
                }}>
                  <ListOrdered size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                  <div>
                    Este cierre requiere <strong>{flowSteps.length} aprobación{flowSteps.length !== 1 ? 'es' : ''}</strong>.
                    Se notificará automáticamente a cada aprobador conforme avance el flujo.
                  </div>
                </div>
              )}

              <div>
                <label className="field-label">Período a cerrar *</label>
                <select
                  className="input"
                  value={initPeriod}
                  onChange={e => setInitPeriod(e.target.value)}>
                  <option value="">— Selecciona el período —</option>
                  {periods
                    .filter(p => !closedSet.has(p))
                    .map(p => (
                      <option key={p} value={p}>{periodLabel(p)} ({p})</option>
                    ))
                  }
                </select>
              </div>

              <div>
                <label className="field-label">Notas (opcional)</label>
                <textarea
                  className="input"
                  rows={2}
                  placeholder="Observaciones sobre este cierre..."
                  value={initNotes}
                  onChange={e => setInitNotes(e.target.value)}
                  style={{ resize: 'vertical', fontSize: 13 }}
                />
              </div>

              {initPeriod && closedSet.has(initPeriod) && (
                <div style={{
                  background: 'var(--coral-50)', borderRadius: 8, padding: '10px 14px',
                  fontSize: 12, color: 'var(--coral-700)', display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <AlertCircle size={14} /> Este período ya está cerrado.
                </div>
              )}

              {initPeriod && pendingReqs.some(r => r.period === initPeriod) && (
                <div style={{
                  background: 'var(--amber-50)', borderRadius: 8, padding: '10px 14px',
                  fontSize: 12, color: 'var(--amber-700)', display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <AlertCircle size={14} /> Ya existe una solicitud de cierre en proceso para este período.
                </div>
              )}
            </div>
            <div className="modal-foot">
              <button className="btn btn-sm" onClick={() => { setInitiateOpen(false); setInitPeriod(''); setInitNotes(''); }}>
                Cancelar
              </button>
              <button
                className="btn btn-primary btn-sm"
                disabled={
                  initiating ||
                  !initPeriod ||
                  closedSet.has(initPeriod) ||
                  pendingReqs.some(r => r.period === initPeriod)
                }
                onClick={handleInitiate}>
                {initiating ? <Loader size={13} style={spinStyle} /> : <Lock size={13} />}
                {' '}{flowEnabled ? 'Iniciar flujo de cierre' : 'Cerrar período'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


// ── Expediente de Períodos ────────────────────────────────────────────────────

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function blobErrorMessage(err, fallback) {
  let msg = fallback;
  const payload = err?.response?.data;
  try {
    if (payload instanceof Blob) {
      const txt = await payload.text();
      const j = JSON.parse(txt);
      if (j.detail) msg = j.detail;
    } else if (typeof payload?.detail === 'string') {
      msg = payload.detail;
    }
  } catch { /* keep */ }
  return msg;
}


const MONTHS_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

/** Modal para elegir año y mes dentro de los períodos permitidos del tenant. */
function PeriodYearMonthPicker({ value, options, onChange, disabled }) {
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(() => (value || '').slice(0, 4));
  const [month, setMonth] = useState(() => (value || '').slice(5, 7));

  const years = Array.from(new Set(options.map(p => p.slice(0, 4)))).sort((a, b) => b.localeCompare(a));
  const monthsForYear = (y) => options
    .filter(p => p.startsWith(`${y}-`))
    .map(p => p.slice(5, 7));

  const openModal = () => {
    if (disabled || !options.length) return;
    const y = (value && options.includes(value)) ? value.slice(0, 4) : (years[0] || '');
    const ms = monthsForYear(y);
    const m = (value && value.startsWith(`${y}-`) && ms.includes(value.slice(5, 7)))
      ? value.slice(5, 7)
      : (ms[ms.length - 1] || ms[0] || '01');
    setYear(y);
    setMonth(m);
    setOpen(true);
  };

  const availableMonths = monthsForYear(year);
  const draft = year && month ? `${year}-${month}` : '';
  const canApply = draft && options.includes(draft);

  const apply = () => {
    if (!canApply) return;
    onChange(draft);
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        className="btn"
        onClick={openModal}
        disabled={disabled || !options.length}
        title="Seleccionar período"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '8px 14px', fontWeight: 700, fontSize: 13,
          background: 'var(--white)', border: '1.5px solid var(--sand-200)',
          borderRadius: 10, color: 'var(--ink-800)', minWidth: 190, justifyContent: 'space-between',
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <Calendar size={15} style={{ color: 'var(--teal-600)' }} />
          {value ? periodLabel(value) : 'Seleccionar período'}
        </span>
        <ChevronDown size={14} style={{ color: 'var(--ink-400)' }} />
      </button>

      {open && (
        <div className="modal-bg open" onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="modal" style={{ width: 'min(420px, 94vw)' }}>
            <div className="modal-head">
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
                <Calendar size={16} style={{ color: 'var(--teal-600)' }} /> Seleccionar período
              </span>
              <button className="btn-close" onClick={() => setOpen(false)}>&times;</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <div className="field-label" style={{ marginBottom: 8 }}>Año</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {years.map(y => {
                    const active = y === year;
                    return (
                      <button
                        key={y}
                        type="button"
                        onClick={() => {
                          setYear(y);
                          const ms = monthsForYear(y);
                          setMonth(m => (ms.includes(m) ? m : (ms[ms.length - 1] || ms[0] || '')));
                        }}
                        style={{
                          padding: '8px 14px', borderRadius: 8, fontWeight: 700, fontSize: 13,
                          border: `1.5px solid ${active ? 'var(--teal-500)' : 'var(--sand-200)'}`,
                          background: active ? 'var(--teal-50)' : 'var(--white)',
                          color: active ? 'var(--teal-700)' : 'var(--ink-700)',
                          cursor: 'pointer',
                        }}
                      >
                        {y}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <div className="field-label" style={{ marginBottom: 8 }}>Mes</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  {MONTHS_ES.map((label, idx) => {
                    const mm = String(idx + 1).padStart(2, '0');
                    const enabled = availableMonths.includes(mm);
                    const active = enabled && mm === month;
                    return (
                      <button
                        key={mm}
                        type="button"
                        disabled={!enabled}
                        onClick={() => enabled && setMonth(mm)}
                        style={{
                          padding: '10px 8px', borderRadius: 8, fontWeight: active ? 800 : 600, fontSize: 13,
                          border: `1.5px solid ${active ? 'var(--teal-500)' : 'var(--sand-200)'}`,
                          background: active ? 'var(--teal-600)' : (enabled ? 'var(--white)' : 'var(--sand-50)'),
                          color: active ? 'white' : (enabled ? 'var(--ink-700)' : 'var(--ink-300)'),
                          cursor: enabled ? 'pointer' : 'not-allowed',
                          opacity: enabled ? 1 : 0.55,
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>
                Solo se muestran períodos desde el inicio de operaciones del condominio.
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-sm" onClick={() => setOpen(false)}>Cancelar</button>
              <button className="btn btn-primary btn-sm" disabled={!canApply} onClick={apply}>
                Aplicar {canApply ? periodLabel(draft) : ''}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ExpedientePeriodosTab() {
  const { tenantId, tenantName } = useAuth();
  const [opStart, setOpStart] = useState(null);
  const [period, setPeriod] = useState('');
  const [catalog, setCatalog] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewTitle, setPreviewTitle] = useState('');

  // Solo períodos desde el inicio de operaciones del tenant (configuración).
  const periodOptions = generatePeriods(opStart);

  useEffect(() => {
    if (!tenantId) return;
    tenantsAPI.get(tenantId)
      .then(r => {
        const start = r.data?.operation_start_date || null;
        setOpStart(start);
        const opts = generatePeriods(start);
        setPeriod(prev => {
          if (prev && opts.includes(prev)) return prev;
          // Preferir el período anterior al actual si está en rango; si no, el más reciente permitido.
          const pref = prevPeriod(todayPeriod());
          if (opts.includes(pref)) return pref;
          return opts[0] || '';
        });
      })
      .catch(() => { setOpStart(null); setPeriod(''); });
  }, [tenantId]);

  const load = useCallback(async () => {
    if (!tenantId || !period) return;
    // No consultar períodos anteriores al inicio configurado.
    if (opStart && period < opStart) {
      setCatalog(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data } = await reportsAPI.periodExpediente(tenantId, period);
      setCatalog(data);
    } catch (e) {
      setCatalog(null);
      toast.error(e?.response?.data?.detail || 'No se pudo cargar el expediente');
    } finally {
      setLoading(false);
    }
  }, [tenantId, period, opStart]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const safeName = (s) => (s || '').trim().replace(/[/\\:*?"<>|]/g, '').replace(/\s+/g, '_');

  const fetchDoc = async (docKey) => {
    const res = await reportsAPI.periodExpedienteDoc(tenantId, period, docKey);
    const blob = new Blob([res.data], { type: 'application/pdf' });
    if (blob.size < 40) throw new Error('El servidor no devolvió un PDF.');
    return blob;
  };

  const handleDownload = async (doc) => {
    if (!doc?.available || busyKey) return;
    setBusyKey(doc.key + ':dl');
    try {
      const blob = await fetchDoc(doc.key);
      downloadBlob(blob, `${safeName(doc.title)}_${period}_${safeName(tenantName)}.pdf`);
      toast.success('Documento descargado');
    } catch (err) {
      toast.error(await blobErrorMessage(err, 'No se pudo descargar el documento'));
    } finally {
      setBusyKey(null);
    }
  };

  const handlePreview = async (doc) => {
    if (!doc?.available || busyKey) return;
    setBusyKey(doc.key + ':view');
    try {
      const blob = await fetchDoc(doc.key);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(blob));
      setPreviewTitle(doc.title);
    } catch (err) {
      toast.error(await blobErrorMessage(err, 'No se pudo abrir el documento'));
    } finally {
      setBusyKey(null);
    }
  };

  const handlePrint = async (doc) => {
    if (!doc?.available || busyKey) return;
    setBusyKey(doc.key + ':print');
    try {
      const blob = await fetchDoc(doc.key);
      const url = URL.createObjectURL(blob);
      const w = window.open(url, '_blank');
      if (!w) {
        toast.error('Permite ventanas emergentes para imprimir');
      } else {
        const tryPrint = () => { try { w.focus(); w.print(); } catch { /* */ } };
        setTimeout(tryPrint, 700);
      }
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      toast.error(await blobErrorMessage(err, 'No se pudo preparar la impresión'));
    } finally {
      setBusyKey(null);
    }
  };

  const docs = catalog?.documents || [];
  const availableCount = docs.filter(d => d.available).length;
  const GROUP_META = {
    finanzas: { label: 'Finanzas', hint: 'Respaldo contable y de cobranza del período' },
    operacion: { label: 'Operación', hint: 'Reportes de reservas, paquetería, visitas y mantenimientos' },
  };
  const groupedDocs = ['finanzas', 'operacion'].map(g => ({
    key: g,
    ...GROUP_META[g],
    items: docs.filter(d => (d.group || 'finanzas') === g),
  })).filter(g => g.items.length > 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
            <FolderArchive size={18} style={{ color: 'var(--teal-600)' }} /> Expediente de Períodos
          </h3>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--ink-400)', maxWidth: 560 }}>
            Respaldo del período: consulta, descarga o imprime los documentos de Finanzas y Operación.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <label className="field-label" style={{ margin: 0 }}>Período</label>
          <PeriodYearMonthPicker
            value={period}
            options={periodOptions}
            onChange={setPeriod}
            disabled={!periodOptions.length}
          />
        </div>
      </div>

      {catalog && (
        <div style={{
          background: catalog.is_closed ? 'var(--coral-50)' : 'var(--teal-50)',
          border: `1px solid ${catalog.is_closed ? 'var(--coral-200)' : 'var(--teal-200)'}`,
          borderRadius: 10, padding: '10px 14px', fontSize: 13,
          color: catalog.is_closed ? 'var(--coral-700)' : 'var(--teal-700)',
          display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        }}>
          {catalog.is_closed ? <Lock size={14} /> : <LockOpen size={14} />}
          <span>
            {catalog.is_closed ? 'Período cerrado' : 'Período abierto'} · {availableCount} documento{availableCount !== 1 ? 's' : ''} disponible{availableCount !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      {!opStart ? (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink-400)', fontSize: 13 }}>
          Define el período inicial de operaciones en Configuración del condominio para consultar el expediente.
        </div>
      ) : loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <Loader size={22} style={{ ...spinStyle, color: 'var(--teal-600)' }} />
        </div>
      ) : !periodOptions.length ? (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink-400)', fontSize: 13 }}>
          No hay períodos disponibles a partir del inicio de operaciones ({periodLabel(opStart)}).
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {groupedDocs.map(group => (
            <div key={group.key}>
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-500)' }}>
                  {group.label}
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: 2 }}>{group.hint}</div>
              </div>
              <div style={{ display: 'grid', gap: 10 }}>
                {group.items.map(doc => {
                  const busy = busyKey && busyKey.startsWith(doc.key);
                  return (
                    <div
                      key={doc.key}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
                        padding: '14px 16px',
                        background: 'var(--white)',
                        border: `1px solid ${doc.available ? 'var(--sand-200)' : 'var(--sand-100)'}`,
                        borderRadius: 12,
                        opacity: doc.available ? 1 : 0.72,
                      }}
                    >
                      <div style={{
                        width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                        background: doc.available ? 'var(--teal-50)' : 'var(--sand-100)',
                        color: doc.available ? 'var(--teal-700)' : 'var(--ink-400)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <FileText size={18} />
                      </div>
                      <div style={{ flex: 1, minWidth: 200 }}>
                        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-400)' }}>
                          {doc.module_label}
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink-800)', marginTop: 2 }}>{doc.title}</div>
                        <div style={{ fontSize: 12, color: 'var(--ink-500)', marginTop: 2 }}>{doc.description}</div>
                        <div style={{ fontSize: 12, color: doc.available ? 'var(--teal-700)' : 'var(--ink-400)', marginTop: 4, fontWeight: 600 }}>
                          {doc.detail || (doc.available ? 'Disponible' : 'Sin información en este período')}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button className="btn btn-sm" disabled={!doc.available || busy} onClick={() => handlePreview(doc)} title="Ver">
                          {busyKey === doc.key + ':view' ? <Loader size={13} style={spinStyle} /> : <Eye size={13} />} Ver
                        </button>
                        <button className="btn btn-sm" disabled={!doc.available || busy} onClick={() => handleDownload(doc)} title="Descargar">
                          {busyKey === doc.key + ':dl' ? <Loader size={13} style={spinStyle} /> : <Download size={13} />} Descargar
                        </button>
                        <button className="btn btn-sm" disabled={!doc.available || busy} onClick={() => handlePrint(doc)} title="Imprimir">
                          {busyKey === doc.key + ':print' ? <Loader size={13} style={spinStyle} /> : <Printer size={13} />} Imprimir
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {previewUrl && (
        <div className="modal-bg open" onClick={e => { if (e.target === e.currentTarget) { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); } }}>
          <div className="modal" style={{ width: 'min(960px, 96vw)', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-head">
              <span style={{ fontWeight: 700 }}>{previewTitle}</span>
              <button className="btn-close" onClick={() => { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }}>&times;</button>
            </div>
            <div className="modal-body" style={{ padding: 0, flex: 1, minHeight: 0 }}>
              <iframe src={previewUrl} title={previewTitle} style={{ width: '100%', height: '72vh', border: 'none' }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const TABS = [
  { key: 'gestion', label: 'Gestión de períodos' },
  { key: 'expediente', label: 'Expediente de Períodos' },
];

export default function CierrePeriodo() {
  const [sp, setSp] = useSearchParams();
  const tab = TABS.some(t => t.key === sp.get('tab')) ? sp.get('tab') : 'gestion';
  const setTab = (k) => setSp(prev => {
    const n = new URLSearchParams(prev);
    n.set('tab', k);
    return n;
  }, { replace: true });

  return (
    <div className="content-fade" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <style>{spinKeyframes}</style>
      <div>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Periodos</h2>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--ink-400)' }}>
          Gestiona el cierre contable y conserva el expediente financiero de cada período.
        </p>
      </div>
      <div className="tabs" style={{ marginBottom: 4 }}>
        {TABS.map(t => (
          <button
            key={t.key}
            className={`tab ${tab === t.key ? 'active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'gestion' ? <GestionPeriodosTab /> : <ExpedientePeriodosTab />}
    </div>
  );
}
