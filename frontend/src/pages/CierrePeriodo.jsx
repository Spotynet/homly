import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { periodsAPI, tenantsAPI } from '../api/client';
import {
  Lock, LockOpen, CheckCircle2, XCircle, Clock, Plus,
  ChevronDown, ChevronRight, AlertCircle, Loader,
  ListOrdered, CheckCheck,
} from 'lucide-react';
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

export default function CierrePeriodo() {
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
        periodsAPI.closedList(tenantId),
        periodsAPI.closureList(tenantId),
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

  // ── render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
        <Loader size={24} style={{ ...spinStyle, color: 'var(--teal-600)' }} />
      </div>
    );
  }

  return (
    <div className="content-fade" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <style>{spinKeyframes}</style>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Cierre de Período</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--ink-400)' }}>
            Administra el cierre de períodos contables y flujos de aprobación
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
                  </tr>
                </thead>
                <tbody>
                  {periods.slice(0, 36).map(p => {
                    const closedInfo = closedPeriods.find(cp => cp.period === p);
                    const inProgress = pendingReqs.find(r => r.period === p);
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
