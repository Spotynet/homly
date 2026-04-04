import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { periodsAPI, tenantsAPI } from '../api/client';
import {
  Lock, LockOpen, CheckCircle2, XCircle, Clock, Plus,
  ChevronDown, ChevronRight, AlertCircle, RefreshCw, Loader,
  ListOrdered, CheckCheck, User, ArrowRight,
} from 'lucide-react';
import toast from 'react-hot-toast';

// ── helpers ──────────────────────────────────────────────────────────────────

function periodLabel(p) {
  if (!p) return '—';
  const [y, m] = p.split('-');
  return new Date(+y, +m - 1, 1).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
}

function generatePeriods(opStart) {
  const periods = [];
  if (!opStart) return periods;
  const [sy, sm] = opStart.split('-').map(Number);
  const now = new Date();
  let y = sy, m = sm;
  while (y < now.getFullYear() || (y === now.getFullYear() && m <= now.getMonth() + 1)) {
    periods.push(`${y}-${String(m).padStart(2,'0')}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return periods.reverse();
}

const STATUS_META = {
  in_progress: { label: 'En proceso',  icon: Clock,         color: 'var(--amber-600)', bg: 'var(--amber-50)' },
  completed:   { label: 'Completado',  icon: CheckCircle2,  color: 'var(--teal-700)',  bg: 'var(--teal-50)'  },
  rejected:    { label: 'Rechazado',   icon: XCircle,       color: 'var(--coral-500)', bg: 'var(--coral-50)' },
};

const STEP_STATUS_META = {
  pending:  { label: 'Pendiente', icon: Clock,        color: 'var(--ink-400)',   bg: 'var(--sand-100)' },
  approved: { label: 'Aprobado',  icon: CheckCircle2, color: 'var(--teal-700)',  bg: 'var(--teal-50)'  },
  rejected: { label: 'Rechazado', icon: XCircle,      color: 'var(--coral-500)', bg: 'var(--coral-50)' },
};

// ── ClosureRequestCard ────────────────────────────────────────────────────────

function ClosureRequestCard({ request, currentUserId, onApprove, onReject, onRefresh }) {
  const [expanded, setExpanded] = useState(false);
  const [actionWorking, setActionWorking] = useState(false);
  const [rejectNotes, setRejectNotes] = useState('');
  const [showReject, setShowReject] = useState(false);

  const meta   = STATUS_META[request.status] || STATUS_META.in_progress;
  const Icon   = meta.icon;

  const pendingStep = request.steps?.find(s => s.status === 'pending');
  const isMyTurn    = pendingStep?.approver === currentUserId;

  const handleApprove = async () => {
    setActionWorking(true);
    try {
      await onApprove(request.id, {});
      toast.success('Paso aprobado');
      onRefresh();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error al aprobar');
    } finally { setActionWorking(false); }
  };

  const handleReject = async () => {
    if (!rejectNotes.trim()) { toast.error('Indica el motivo del rechazo'); return; }
    setActionWorking(true);
    try {
      await onReject(request.id, { notes: rejectNotes });
      toast.success('Solicitud rechazada');
      onRefresh();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error al rechazar');
    } finally { setActionWorking(false); setShowReject(false); }
  };

  return (
    <div style={{
      border: '1px solid var(--sand-200)',
      borderRadius: 10,
      overflow: 'hidden',
      background: '#fff',
    }}>
      {/* Header */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '12px 16px', cursor: 'pointer',
          background: expanded ? 'var(--sand-50)' : '#fff',
          borderBottom: expanded ? '1px solid var(--sand-100)' : 'none',
        }}
        onClick={() => setExpanded(p => !p)}>
        {expanded ? <ChevronDown size={15}/> : <ChevronRight size={15}/>}
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
            {new Date(request.created_at).toLocaleDateString('es-MX', { day:'numeric', month:'short', year:'numeric' })}
          </div>
        </div>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700,
          padding: '3px 10px', borderRadius: 20, background: meta.bg, color: meta.color,
        }}>
          <Icon size={12}/> {meta.label}
        </span>
        {isMyTurn && request.status === 'in_progress' && (
          <span style={{
            fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
            background: 'var(--coral-50)', color: 'var(--coral-600)', marginLeft: 4,
          }}>
            Tu turno
          </span>
        )}
      </div>

      {/* Expanded content */}
      {expanded && (
        <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Steps timeline */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink-400)', marginBottom: 10 }}>
              Pasos de aprobación
            </div>
            {(!request.steps || request.steps.length === 0) ? (
              <div style={{ fontSize: 13, color: 'var(--ink-300)', padding: '8px 0' }}>Sin pasos configurados</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {request.steps.map((step, idx) => {
                  const sm   = STEP_STATUS_META[step.status] || STEP_STATUS_META.pending;
                  const SIcon = sm.icon;
                  const isActive = step.status === 'pending' && (idx === 0 || request.steps[idx-1]?.status === 'approved');
                  return (
                    <div key={step.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '9px 12px', borderRadius: 8,
                      background: isActive ? 'var(--teal-50)' : 'var(--sand-50)',
                      border: isActive ? '1px solid var(--teal-200)' : '1px solid transparent',
                    }}>
                      <span style={{
                        width: 22, height: 22, borderRadius: '50%',
                        background: isActive ? 'var(--teal-600)' : 'var(--sand-200)',
                        color: isActive ? '#fff' : 'var(--ink-400)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: 700, flexShrink: 0,
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
                        display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700,
                        padding: '2px 8px', borderRadius: 12, background: sm.bg, color: sm.color,
                      }}>
                        <SIcon size={11}/> {sm.label}
                      </span>
                      {step.actioned_at && (
                        <span style={{ fontSize: 10, color: 'var(--ink-300)' }}>
                          {new Date(step.actioned_at).toLocaleDateString('es-MX', { day:'numeric', month:'short' })}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Action buttons for current approver */}
          {isMyTurn && request.status === 'in_progress' && (
            <div style={{ borderTop: '1px solid var(--sand-100)', paddingTop: 12 }}>
              {!showReject ? (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={actionWorking}
                    onClick={handleApprove}>
                    {actionWorking ? <Loader size={12} className="spin"/> : <CheckCircle2 size={13}/>}
                    {' '}Aprobar paso
                  </button>
                  <button
                    className="btn btn-sm"
                    style={{ color: 'var(--coral-600)', borderColor: 'var(--coral-200)' }}
                    disabled={actionWorking}
                    onClick={() => setShowReject(true)}>
                    <XCircle size={13}/> Rechazar
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label style={{ fontSize: 12, color: 'var(--ink-500)', fontWeight: 600 }}>Motivo del rechazo *</label>
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
                      disabled={actionWorking}
                      onClick={handleReject}>
                      {actionWorking ? <Loader size={12} className="spin"/> : <XCircle size={13}/>}
                      {' '}Confirmar rechazo
                    </button>
                    <button className="btn btn-sm" onClick={() => setShowReject(false)}>Cancelar</button>
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
  const { user, tenantId } = useAuth();

  const [tenant,         setTenant]         = useState(null);
  const [closedPeriods,  setClosedPeriods]  = useState([]);
  const [closureReqs,    setClosureReqs]    = useState([]);
  const [loading,        setLoading]        = useState(true);

  // Initiate closure modal
  const [initiateOpen,   setInitiateOpen]   = useState(false);
  const [initPeriod,     setInitPeriod]     = useState('');
  const [initNotes,      setInitNotes]      = useState('');
  const [initiating,     setInitiating]     = useState(false);

  const isAdmin    = user?.role === 'admin';
  const isTesorero = user?.role === 'tesorero';
  const canInitiate = isAdmin || isTesorero;

  // ── load data ──────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [tenantRes, closedRes, reqsRes] = await Promise.all([
        tenantsAPI.get(tenantId),
        periodsAPI.closedList(tenantId),
        periodsAPI.closureList(tenantId),
      ]);
      setTenant(tenantRes.data);
      setClosedPeriods(Array.isArray(closedRes.data) ? closedRes.data : (closedRes.data?.results || []));
      setClosureReqs(Array.isArray(reqsRes.data)    ? reqsRes.data    : (reqsRes.data?.results || []));
    } catch (e) {
      toast.error('Error al cargar datos');
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── helpers ────────────────────────────────────────────────────────────────

  const closedSet = new Set(closedPeriods.map(cp => cp.period));
  const opStart   = tenant?.operation_start_date;
  const periods   = generatePeriods(opStart);

  const flowSteps = tenant?.closure_flow?.steps || [];
  const flowEnabled = tenant?.closure_flow?.enabled || false;

  // ── initiate closure ──────────────────────────────────────────────────────

  const handleInitiate = async () => {
    if (!initPeriod) { toast.error('Selecciona un período'); return; }
    setInitiating(true);
    try {
      await periodsAPI.initiateClosure(tenantId, { period: initPeriod, notes: initNotes });
      if (flowEnabled && flowSteps.length > 0) {
        toast.success('Solicitud de cierre iniciada — el flujo de aprobación está en curso');
      } else {
        toast.success(`Período ${initPeriod} cerrado exitosamente`);
      }
      setInitiateOpen(false);
      setInitPeriod('');
      setInitNotes('');
      loadData();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error al iniciar el cierre');
    } finally { setInitiating(false); }
  };

  // ── render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
        <Loader size={24} className="spin" style={{ color: 'var(--teal-600)' }}/>
      </div>
    );
  }

  const pendingReqs    = closureReqs.filter(r => r.status === 'in_progress');
  const completedReqs  = closureReqs.filter(r => r.status !== 'in_progress');
  const myPendingCount = pendingReqs.filter(r =>
    r.steps?.some(s => s.status === 'pending' && s.approver === user?.id)
  ).length;

  return (
    <div className="content-fade" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Cierre de Período</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--ink-400)' }}>
            Administra el cierre de períodos contables y flujos de aprobación
          </p>
        </div>
        {canInitiate && (
          <button className="btn btn-primary" onClick={() => setInitiateOpen(true)}>
            <Lock size={14}/> Iniciar Cierre
          </button>
        )}
      </div>

      {/* ── Flow info banner ── */}
      {flowEnabled && flowSteps.length > 0 ? (
        <div style={{
          background: 'var(--teal-50)', border: '1px solid var(--teal-200)',
          borderRadius: 10, padding: '12px 16px',
          display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13,
        }}>
          <ListOrdered size={16} style={{ color: 'var(--teal-600)', flexShrink: 0, marginTop: 1 }}/>
          <div>
            <strong style={{ color: 'var(--teal-700)' }}>Flujo de aprobación activo</strong>
            <span style={{ color: 'var(--teal-600)', marginLeft: 8 }}>
              {flowSteps.length} paso{flowSteps.length !== 1 ? 's' : ''} requerido{flowSteps.length !== 1 ? 's' : ''} para cerrar un período:
            </span>
            <span style={{ color: 'var(--teal-700)', marginLeft: 4 }}>
              {flowSteps.map(s => s.label || s.user_name).join(' → ')}
            </span>
          </div>
        </div>
      ) : (
        <div style={{
          background: 'var(--sand-50)', border: '1px solid var(--sand-200)',
          borderRadius: 10, padding: '12px 16px',
          display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--ink-400)',
        }}>
          <AlertCircle size={15} style={{ flexShrink: 0 }}/>
          Sin flujo de aprobación configurado — el cierre es inmediato al iniciarse. Configura un flujo en <strong style={{ marginLeft: 4 }}>Configuración → Roles y Perfiles</strong>.
        </div>
      )}

      {/* ── My pending approvals alert ── */}
      {myPendingCount > 0 && (
        <div style={{
          background: 'var(--amber-50)', border: '1px solid var(--amber-200)',
          borderRadius: 10, padding: '12px 16px',
          display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--amber-700)',
        }}>
          <AlertCircle size={15} style={{ flexShrink: 0 }}/>
          <strong>Tienes {myPendingCount} solicitud{myPendingCount !== 1 ? 'es' : ''} pendiente{myPendingCount !== 1 ? 's' : ''} de tu aprobación.</strong>
        </div>
      )}

      {/* ── Closed Periods summary ── */}
      <div className="card">
        <div className="card-head">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Lock size={15} style={{ color: 'var(--coral-500)' }}/> Períodos Cerrados
          </h3>
          <span style={{
            background: 'var(--coral-50)', color: 'var(--coral-600)',
            borderRadius: 20, padding: '2px 10px', fontSize: 12, fontWeight: 700,
          }}>
            {closedPeriods.length}
          </span>
        </div>
        <div className="card-body">
          {closedPeriods.length === 0 ? (
            <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--ink-300)', fontSize: 13 }}>
              <LockOpen size={28} style={{ display: 'block', margin: '0 auto 8px', opacity: 0.3 }}/>
              No hay períodos cerrados
            </div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {closedPeriods.slice().sort((a, b) => b.period.localeCompare(a.period)).map(cp => (
                <div key={cp.id} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '5px 12px', borderRadius: 20,
                  background: 'var(--coral-50)', border: '1px solid var(--coral-100)',
                  fontSize: 12, color: 'var(--coral-700)',
                }}>
                  <Lock size={11}/>
                  <span style={{ fontWeight: 700 }}>{periodLabel(cp.period)}</span>
                  <span style={{ color: 'var(--coral-400)' }}>·</span>
                  <span style={{ color: 'var(--coral-500)', fontWeight: 400 }}>Período cerrado</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Periods table with status ── */}
      <div className="card">
        <div className="card-head">
          <h3>Estado de Períodos</h3>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
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
                {periods.slice(0, 24).map(p => {
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
                            <Lock size={10}/> Período cerrado
                          </span>
                        ) : inProgress ? (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            padding: '3px 10px', borderRadius: 20,
                            background: 'var(--amber-50)', color: 'var(--amber-700)',
                            fontSize: 11, fontWeight: 700,
                          }}>
                            <Clock size={10}/> Cierre en proceso
                          </span>
                        ) : (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            padding: '3px 10px', borderRadius: 20,
                            background: 'var(--teal-50)', color: 'var(--teal-700)',
                            fontSize: 11, fontWeight: 700,
                          }}>
                            <LockOpen size={10}/> Abierto
                          </span>
                        )}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--ink-400)' }}>
                        {closedInfo?.closed_by_name || (closedInfo ? '—' : '')}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--ink-400)' }}>
                        {closedInfo?.closed_at
                          ? new Date(closedInfo.closed_at).toLocaleDateString('es-MX', { day:'numeric', month:'short', year:'numeric' })
                          : ''}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Active Closure Requests ── */}
      {pendingReqs.length > 0 && (
        <div className="card">
          <div className="card-head">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Clock size={15} style={{ color: 'var(--amber-600)' }}/> Solicitudes en Proceso
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

      {/* ── Historical Requests ── */}
      {completedReqs.length > 0 && (
        <div className="card">
          <div className="card-head">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <CheckCheck size={15} style={{ color: 'var(--ink-400)' }}/> Historial de Solicitudes
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

      {/* ── Initiate Closure Modal ── */}
      {initiateOpen && (
        <div
          className="modal-bg open"
          onClick={e => { if (e.target === e.currentTarget) setInitiateOpen(false); }}>
          <div className="modal">
            <div className="modal-head">
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
                <Lock size={16} style={{ color: 'var(--teal-600)' }}/> Iniciar Cierre de Período
              </span>
              <button className="btn-close" onClick={() => setInitiateOpen(false)}>&times;</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {flowEnabled && flowSteps.length > 0 && (
                <div style={{
                  background: 'var(--teal-50)', borderRadius: 8, padding: '10px 14px',
                  fontSize: 12, color: 'var(--teal-700)', border: '1px solid var(--teal-100)',
                  display: 'flex', alignItems: 'flex-start', gap: 8,
                }}>
                  <ListOrdered size={14} style={{ flexShrink: 0, marginTop: 1 }}/>
                  <div>
                    Este cierre requiere <strong>{flowSteps.length} aprobación{flowSteps.length !== 1 ? 'es'  : ''}</strong>.
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
                  {periods.filter(p => !closedSet.has(p)).map(p => (
                    <option key={p} value={p}>{periodLabel(p)} ({p})</option>
                  ))}
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
                  <AlertCircle size={14}/> Este período ya está cerrado.
                </div>
              )}
            </div>
            <div className="modal-foot">
              <button className="btn btn-sm" onClick={() => setInitiateOpen(false)}>Cancelar</button>
              <button
                className="btn btn-primary btn-sm"
                disabled={initiating || !initPeriod || closedSet.has(initPeriod)}
                onClick={handleInitiate}>
                {initiating ? <Loader size={13} className="spin"/> : <Lock size={13}/>}
                {' '}{flowEnabled && flowSteps.length > 0 ? 'Iniciar flujo de cierre' : 'Cerrar período'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
