import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { reservationsAPI, tenantsAPI, unitsAPI } from '../api/client';
import {
  Calendar, ChevronLeft, ChevronRight, Plus, X, Check,
  Clock, CheckCircle, AlertCircle, Ban, RefreshCw, FileText,
  Eye, User,
} from 'lucide-react';
import toast from 'react-hot-toast';

// ─── Constantes ────────────────────────────────────────────────────────────
const DAYS_ES   = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
const MONTHS_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                   'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

const STATUS_CFG = {
  pending:   { label: 'Pendiente',  cls: 'badge-amber',  icon: Clock,        color: 'var(--amber-400)' },
  approved:  { label: 'Aprobada',   cls: 'badge-teal',   icon: CheckCircle,  color: 'var(--teal-400)'  },
  rejected:  { label: 'Rechazada',  cls: 'badge-coral',  icon: AlertCircle,  color: 'var(--coral-400)' },
  cancelled: { label: 'Cancelada',  cls: '',             icon: Ban,          color: 'var(--ink-300)'   },
};

const pad = n => String(n).padStart(2, '0');

// ─── Helpers ───────────────────────────────────────────────────────────────
function makeDateStr(y, m, d) { return `${y}-${pad(m + 1)}-${pad(d)}`; }
function fmtDate(ds) {
  if (!ds) return '—';
  return new Date(ds + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── Componente área-card ──────────────────────────────────────────────────
function AreaCard({ area, reservations, selected, onSelect }) {
  const areaRes = reservations.filter(r => r.area_id === area.id);
  const pending  = areaRes.filter(r => r.status === 'pending').length;
  const approved = areaRes.filter(r => r.status === 'approved').length;

  return (
    <button
      onClick={onSelect}
      style={{
        background: selected ? 'var(--teal-500)' : 'var(--white)',
        border: `2px solid ${selected ? 'var(--teal-500)' : 'var(--sand-100)'}`,
        borderRadius: 'var(--radius-lg)', padding: '14px 16px',
        cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s',
        color: selected ? 'white' : 'inherit',
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>{area.name}</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {pending > 0 && (
          <span style={{
            fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
            background: selected ? 'rgba(255,255,255,0.25)' : 'var(--amber-50)',
            color: selected ? 'white' : 'var(--amber-700)',
          }}>
            {pending} pendiente{pending !== 1 ? 's' : ''}
          </span>
        )}
        {approved > 0 && (
          <span style={{
            fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
            background: selected ? 'rgba(255,255,255,0.25)' : 'var(--teal-50)',
            color: selected ? 'white' : 'var(--teal-700)',
          }}>
            {approved} aprobada{approved !== 1 ? 's' : ''}
          </span>
        )}
        {pending === 0 && approved === 0 && (
          <span style={{
            fontSize: 11, padding: '2px 8px', borderRadius: 20,
            background: selected ? 'rgba(255,255,255,0.15)' : 'var(--sand-50)',
            color: selected ? 'rgba(255,255,255,0.8)' : 'var(--ink-400)',
          }}>
            Sin reservas
          </span>
        )}
        {area.charge_enabled && (
          <span style={{
            fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
            background: selected ? 'rgba(255,255,255,0.2)' : 'var(--blue-50)',
            color: selected ? 'white' : 'var(--blue-600)',
          }}>
            ${Number(area.charge_amount || 0).toLocaleString('es-MX')}
          </span>
        )}
      </div>
    </button>
  );
}

// ─── Default per-role reservation permissions (backward-compatible) ─────────
const DEFAULT_ROLE_PERMS = {
  superadmin: { can_request: true,  can_approve: true  },
  admin:      { can_request: true,  can_approve: true  },
  tesorero:   { can_request: true,  can_approve: true  },
  contador:   { can_request: false, can_approve: false },
  auditor:    { can_request: false, can_approve: false },
  vigilante:  { can_request: true,  can_approve: false },
  vecino:     { can_request: true,  can_approve: false },
};

// ─── Main ──────────────────────────────────────────────────────────────────
export default function Reservas() {
  const { tenantId, isVecino, role, user } = useAuth();

  // Per-role reservation permissions loaded from tenant settings
  const [rolePermissions, setRolePermissions] = useState({});

  const today = new Date();
  const [calYear,  setCalYear]  = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());
  const [selectedDay,  setSelectedDay]  = useState(null);
  const [selectedArea, setSelectedArea] = useState(null); // area.id | null

  const [areas,        setAreas]        = useState([]);
  const [units,        setUnits]        = useState([]);
  const [reservations, setReservations] = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [resStatusFilter, setResStatusFilter] = useState('all');

  // Vecino view toggle: "mine" (only own reservations in list) vs "all" (calendar availability)
  const [myResOnly, setMyResOnly] = useState(true);

  // Tenant reservation settings (approval mode)
  const [approvalMode, setApprovalMode] = useState('require_vecinos'); // default

  // New reservation modal
  const [modalOpen,         setModalOpen]         = useState(false);
  const [form,              setForm]              = useState({ area_id: '', unit_id: '', date: '', start_time: '', end_time: '', notes: '' });
  const [saving,            setSaving]            = useState(false);
  const [policiesAccepted,  setPoliciesAccepted]  = useState(false);
  const [policiesModalOpen, setPoliciesModalOpen] = useState(false);

  // Approve modal (with optional reviewer observations)
  const [approveOpen,   setApproveOpen]   = useState(false);
  const [approveId,     setApproveId]     = useState(null);
  const [approveNotes,  setApproveNotes]  = useState('');

  // Reject modal
  const [rejectOpen,    setRejectOpen]    = useState(false);
  const [rejectId,      setRejectId]      = useState(null);
  const [rejectReason,  setRejectReason]  = useState('');
  const [rejectNotes,   setRejectNotes]   = useState('');

  // ── Derived flags — computed from per-role settings ─────────────────────
  const _rolePerms = rolePermissions[role] ?? DEFAULT_ROLE_PERMS[role] ?? { can_request: false, can_approve: false };
  const canRequest        = role === 'superadmin' ? true : _rolePerms.can_request;
  const canManage         = role === 'superadmin' ? true : _rolePerms.can_approve;
  const canCancelOwn      = !canManage && canRequest;   // requesters can cancel their own
  const showActionsCol    = canManage || canCancelOwn;
  const needsUnitSelector = !isVecino;                  // admins / managers pick unit manually

  // ── Load tenant (areas + reservation_settings) ─────────────────────────
  const loadAreas = useCallback(async () => {
    if (!tenantId) return;
    try {
      const res = await tenantsAPI.get(tenantId);
      const raw = res.data?.common_areas;
      const all = Array.isArray(raw)
        ? raw.filter(a => typeof a === 'object' && a !== null)
        : [];
      setAreas(all.filter(a => a.active !== false && a.reservations_enabled));
      // Load reservation settings (approval mode + per-role permissions)
      const settings = res.data?.reservation_settings || {};
      setApprovalMode(settings.approval_mode || 'require_vecinos');
      setRolePermissions(settings.role_permissions || {});
    } catch { setAreas([]); }
  }, [tenantId]);

  // ── Load units (only for admin/tesorero) ───────────────────────────────
  const loadUnits = useCallback(async () => {
    if (!tenantId || isVecino) return;
    try {
      const res = await unitsAPI.list(tenantId, { page_size: 500 });
      const d = res.data;
      setUnits(Array.isArray(d) ? d : (d?.results || []));
    } catch { setUnits([]); }
  }, [tenantId, isVecino]);

  // ── Load reservations ─────────────────────────────────────────────────
  const loadReservations = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const firstDay = `${calYear}-${pad(calMonth + 1)}-01`;
      const lastDate = new Date(calYear, calMonth + 1, 0);
      const lastDay  = `${calYear}-${pad(calMonth + 1)}-${pad(lastDate.getDate())}`;
      const params   = { date_from: firstDay, date_to: lastDay };
      if (selectedArea) params.area_id = selectedArea;
      const res  = await reservationsAPI.list(tenantId, params);
      const data = res.data;
      setReservations(Array.isArray(data) ? data : (data?.results || []));
    } catch { setReservations([]); }
    finally  { setLoading(false); }
  }, [tenantId, calYear, calMonth, selectedArea]);

  useEffect(() => { loadAreas(); }, [loadAreas]);
  useEffect(() => { loadUnits(); }, [loadUnits]);
  useEffect(() => { loadReservations(); }, [loadReservations]);

  // ── Calendar ────────────────────────────────────────────────────────────
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const firstDOW    = new Date(calYear, calMonth, 1).getDay();

  const resByDate = {};
  reservations.forEach(r => {
    if (!resByDate[r.date]) resByDate[r.date] = [];
    resByDate[r.date].push(r);
  });

  // ── Filtered list ─────────────────────────────────────────────────────
  const visibleRes = reservations.filter(r => {
    if (selectedDay && r.date !== selectedDay) return false;
    if (resStatusFilter !== 'all' && r.status !== resStatusFilter) return false;
    // Vecinos in "Mis reservas" mode: show only their own
    if (isVecino && myResOnly && r.requested_by !== user?.id) return false;
    return true;
  });

  // ── Actions ───────────────────────────────────────────────────────────
  const openApprove = (id) => { setApproveId(id); setApproveNotes(''); setApproveOpen(true); };
  const confirmApprove = async () => {
    try {
      await reservationsAPI.approve(tenantId, approveId, approveNotes);
      toast.success('Reserva aprobada');
      setApproveOpen(false);
      loadReservations();
    } catch { toast.error('Error al aprobar'); }
  };

  const openReject = (id) => { setRejectId(id); setRejectReason(''); setRejectNotes(''); setRejectOpen(true); };
  const confirmReject = async () => {
    try {
      await reservationsAPI.reject(tenantId, rejectId, rejectReason, rejectNotes || rejectReason);
      toast.success('Reserva rechazada');
      setRejectOpen(false);
      loadReservations();
    } catch { toast.error('Error al rechazar'); }
  };

  const handleCancel = async (id) => {
    if (!window.confirm('¿Cancelar esta reserva?')) return;
    try {
      await reservationsAPI.cancel(tenantId, id);
      toast.success('Reserva cancelada');
      loadReservations();
    } catch { toast.error('Error al cancelar'); }
  };

  // ── Create reservation ─────────────────────────────────────────────────
  const openNew = () => {
    const preArea = areas.find(a => a.id === selectedArea);
    setForm({
      area_id:    preArea?.id || (areas[0]?.id || ''),
      unit_id:    '',
      date:       selectedDay || '',
      start_time: '',
      end_time:   '',
      notes:      '',
    });
    setPoliciesAccepted(false);
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.area_id)    return toast.error('Selecciona un área');
    if (needsUnitSelector && !form.unit_id) return toast.error('Selecciona la unidad que solicita la reserva');
    if (!form.date)       return toast.error('Selecciona una fecha');
    if (!form.start_time) return toast.error('Indica hora de inicio');
    if (!form.end_time)   return toast.error('Indica hora de fin');
    if (form.start_time >= form.end_time) return toast.error('La hora de fin debe ser mayor a la de inicio');
    setSaving(true);
    try {
      const area = areas.find(a => a.id === form.area_id);
      const payload = {
        area_id:       form.area_id,
        area_name:     area?.name || '',
        date:          form.date,
        start_time:    form.start_time,
        end_time:      form.end_time,
        notes:         form.notes,
        charge_amount: area?.charge_enabled ? (area.charge_amount || 0) : 0,
      };
      if (needsUnitSelector && form.unit_id) payload.unit_id = form.unit_id;
      await reservationsAPI.create(tenantId, payload);
      toast.success(isAutoApprover ? 'Reserva aprobada' : 'Reserva solicitada');
      setModalOpen(false);
      loadReservations();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error al crear la reserva');
    } finally { setSaving(false); }
  };

  // ── Derived flags ────────────────────────────────────────────────────────
  // Whether THIS user's new reservation will be auto-approved (mirrors backend logic)
  const isAutoApprover = (() => {
    if (approvalMode === 'auto_approve_all') return true;
    if (approvalMode === 'require_all') return false;
    // require_vecinos: roles with can_approve get auto-approved
    return canManage;
  })();

  // ── Selected area object ───────────────────────────────────────────────
  const selectedAreaObj = areas.find(a => a.id === form.area_id);
  const hasPolicies = !!(selectedAreaObj?.reservation_policy || selectedAreaObj?.usage_policy);
  const pendingCount = reservations.filter(r => r.status === 'pending').length;
  const myPendingCount = reservations.filter(r => r.status === 'pending' && r.requested_by === user?.id).length;

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="content-fade">
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .res-table th, .res-table td { padding: 10px 14px; }
        .reservas-area-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
          gap: 10px;
          margin-bottom: 20px;
        }
        .reservas-layout {
          display: flex;
          gap: 16px;
          align-items: flex-start;
          flex-wrap: wrap;
        }
        .reservas-calendar {
          flex: 0 0 300px;
          min-width: 260px;
        }
        .reservas-list {
          flex: 1 1 380px;
          min-width: 0;
        }
        @media (max-width: 640px) {
          .reservas-area-grid {
            grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
            gap: 8px;
          }
          .reservas-layout {
            flex-direction: column;
          }
          .reservas-calendar {
            flex: 1 1 100%;
            min-width: 0;
            width: 100%;
          }
          .reservas-list {
            flex: 1 1 100%;
            min-width: 0;
            width: 100%;
          }
        }
      `}</style>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink-800)', margin: 0 }}>Reservas de Áreas Comunes</h2>
          <p style={{ fontSize: 13, color: 'var(--ink-400)', margin: '4px 0 0' }}>
            {MONTHS_ES[calMonth]} {calYear}
            {canManage && pendingCount > 0 && (
              <span style={{ marginLeft: 8, background: 'var(--amber-50)', color: 'var(--amber-700)', border: '1px solid var(--amber-100)', borderRadius: 20, padding: '1px 8px', fontSize: 11, fontWeight: 700 }}>
                {pendingCount} pendiente{pendingCount !== 1 ? 's' : ''} de revisión
              </span>
            )}
            {isVecino && myPendingCount > 0 && (
              <span style={{ marginLeft: 8, background: 'var(--amber-50)', color: 'var(--amber-700)', border: '1px solid var(--amber-100)', borderRadius: 20, padding: '1px 8px', fontSize: 11, fontWeight: 700 }}>
                {myPendingCount} reserva{myPendingCount !== 1 ? 's' : ''} en espera
              </span>
            )}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Vecino view toggle */}
          {isVecino && (
            <div style={{ display: 'flex', background: 'var(--sand-100)', borderRadius: 8, padding: 3, gap: 2 }}>
              <button
                onClick={() => setMyResOnly(true)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '5px 12px', borderRadius: 6, border: 'none',
                  background: myResOnly ? 'var(--white)' : 'transparent',
                  color: myResOnly ? 'var(--teal-600)' : 'var(--ink-400)',
                  fontWeight: myResOnly ? 700 : 500, fontSize: 12,
                  cursor: 'pointer', boxShadow: myResOnly ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                  transition: 'all 0.15s',
                }}
              >
                <User size={13} /> Mis Reservas
              </button>
              <button
                onClick={() => setMyResOnly(false)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '5px 12px', borderRadius: 6, border: 'none',
                  background: !myResOnly ? 'var(--white)' : 'transparent',
                  color: !myResOnly ? 'var(--teal-600)' : 'var(--ink-400)',
                  fontWeight: !myResOnly ? 700 : 500, fontSize: 12,
                  cursor: 'pointer', boxShadow: !myResOnly ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                  transition: 'all 0.15s',
                }}
              >
                <Eye size={13} /> Disponibilidad
              </button>
            </div>
          )}
          <button className="btn btn-secondary btn-sm" onClick={loadReservations}>
            <RefreshCw size={14} style={loading ? { animation: 'spin 0.8s linear infinite' } : {}} />
            Actualizar
          </button>
          {areas.length > 0 && canRequest && (
            <button className="btn btn-primary" onClick={openNew}>
              <Plus size={15} /> Nueva Reserva
            </button>
          )}
        </div>
      </div>

      {/* ── Vecino: info sobre modo de aprobación ─────────────────────── */}
      {isVecino && (
        <div style={{
          marginBottom: 16, padding: '10px 14px', borderRadius: 10,
          background: isAutoApprover ? 'var(--teal-50)' : 'var(--amber-50)',
          border: `1px solid ${isAutoApprover ? 'var(--teal-200)' : 'var(--amber-200)'}`,
          display: 'flex', alignItems: 'center', gap: 10, fontSize: 13,
        }}>
          {isAutoApprover
            ? <CheckCircle size={16} color="var(--teal-500)" style={{ flexShrink: 0 }} />
            : <Clock size={16} color="var(--amber-600)" style={{ flexShrink: 0 }} />
          }
          <span style={{ color: isAutoApprover ? 'var(--teal-700)' : 'var(--amber-800)', fontWeight: 500 }}>
            {isAutoApprover
              ? 'Las reservas que solicites serán aprobadas automáticamente.'
              : 'Tus solicitudes de reserva requieren autorización por parte de la administración.'
            }
          </span>
        </div>
      )}

      {/* ── Area cards ─────────────────────────────────────────────────── */}
      {areas.length > 0 && (
        <div className="reservas-area-grid">
          <button
            onClick={() => setSelectedArea(null)}
            style={{
              background: !selectedArea ? 'var(--ink-800)' : 'var(--white)',
              border: `2px solid ${!selectedArea ? 'var(--ink-800)' : 'var(--sand-100)'}`,
              borderRadius: 'var(--radius-lg)', padding: '14px 16px',
              cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s',
              color: !selectedArea ? 'white' : 'inherit',
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>Todas las áreas</div>
            <div style={{ fontSize: 11, opacity: 0.8 }}>{reservations.length} reserva{reservations.length !== 1 ? 's' : ''} este mes</div>
          </button>
          {areas.map(area => (
            <AreaCard
              key={area.id}
              area={area}
              reservations={reservations}
              selected={selectedArea === area.id}
              onSelect={() => setSelectedArea(selectedArea === area.id ? null : area.id)}
            />
          ))}
        </div>
      )}

      {areas.length === 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-body" style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--ink-400)' }}>
            <Calendar size={40} color="var(--sand-200)" style={{ display: 'block', margin: '0 auto 12px' }} />
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Sin áreas con reservas habilitadas</div>
            <div style={{ fontSize: 13 }}>Activa la opción de reservas en Configuración → General → Áreas Comunes</div>
          </div>
        </div>
      )}

      {/* ── Calendario + Lista ─────────────────────────────────────────── */}
      <div className="reservas-layout">

        {/* Calendario */}
        <div className="card reservas-calendar">
          <div className="card-head" style={{ justifyContent: 'space-between' }}>
            <button className="btn-ghost" onClick={() => {
              if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11); }
              else setCalMonth(m => m - 1);
              setSelectedDay(null);
            }}><ChevronLeft size={16} /></button>
            <span style={{ fontWeight: 700, fontSize: 14 }}>{MONTHS_ES[calMonth]} {calYear}</span>
            <button className="btn-ghost" onClick={() => {
              if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0); }
              else setCalMonth(m => m + 1);
              setSelectedDay(null);
            }}><ChevronRight size={16} /></button>
          </div>
          {isVecino && !myResOnly && (
            <div style={{ padding: '6px 12px 0', fontSize: 11, color: 'var(--ink-400)', textAlign: 'center' }}>
              Vista de disponibilidad — todas las áreas
            </div>
          )}
          <div className="card-body" style={{ padding: '8px 12px 16px' }}>
            {/* Encabezados días */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
              {DAYS_ES.map(d => (
                <div key={d} style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: 'var(--ink-400)', padding: '2px 0' }}>{d}</div>
              ))}
            </div>
            {/* Celdas */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
              {Array.from({ length: firstDOW }, (_, i) => <div key={`e${i}`} />)}
              {Array.from({ length: daysInMonth }, (_, i) => {
                const d   = i + 1;
                const ds  = makeDateStr(calYear, calMonth, d);
                const recs = resByDate[ds] || [];
                const isSelected  = selectedDay === ds;
                const isTodayDate = ds === makeDateStr(today.getFullYear(), today.getMonth(), today.getDate());
                // Collect unique statuses present on this day (in priority order)
                const STATUS_ORDER = ['pending', 'approved', 'rejected', 'cancelled'];
                const dayStatuses  = STATUS_ORDER.filter(s => recs.some(r => r.status === s));
                return (
                  <button
                    key={d}
                    onClick={() => setSelectedDay(isSelected ? null : ds)}
                    style={{
                      position: 'relative', aspectRatio: '1', borderRadius: 8, border: 'none',
                      background: isSelected ? 'var(--teal-500)' : isTodayDate ? 'var(--teal-50)' : 'transparent',
                      color: isSelected ? 'white' : isTodayDate ? 'var(--teal-700)' : 'var(--ink-700)',
                      fontWeight: isTodayDate ? 800 : 500, fontSize: 12, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'background 0.15s',
                    }}
                  >
                    {d}
                    {dayStatuses.length > 0 && (
                      <span style={{
                        position: 'absolute', bottom: 2, left: '50%', transform: 'translateX(-50%)',
                        display: 'flex', gap: 2,
                      }}>
                        {dayStatuses.map(s => (
                          <span key={s} style={{
                            width: 5, height: 5, borderRadius: '50%',
                            background: STATUS_CFG[s]?.color || 'var(--ink-300)',
                            flexShrink: 0,
                          }} />
                        ))}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {/* Leyenda — un punto por estatus */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 12px', marginTop: 12, fontSize: 10, color: 'var(--ink-400)' }}>
              {Object.entries(STATUS_CFG).map(([key, cfg]) => (
                <span key={key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.color, flexShrink: 0 }} />
                  {cfg.label}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Lista de reservas */}
        <div className="reservas-list">
          {/* Filtros */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              {isVecino && (
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-400)', marginRight: 4 }}>
                  {myResOnly ? 'Mis reservas' : 'Todas las áreas'}:
                </span>
              )}
              {[['all','Todas'],['pending','Pendientes'],['approved','Aprobadas'],['rejected','Rechazadas'],['cancelled','Canceladas']].map(([v,l]) => (
                <button key={v} className={`tab ${resStatusFilter === v ? 'active' : ''}`}
                  style={{ padding: '4px 10px', fontSize: 12 }}
                  onClick={() => setResStatusFilter(v)}>
                  {l}
                  {v === 'pending' && (isVecino ? myPendingCount : pendingCount) > 0 && (
                    <span className="badge badge-amber" style={{ marginLeft: 5, fontSize: 10, padding: '1px 5px' }}>
                      {isVecino ? myPendingCount : pendingCount}
                    </span>
                  )}
                </button>
              ))}
            </div>
            {selectedDay && (
              <button className="btn btn-secondary btn-sm" onClick={() => setSelectedDay(null)}>
                <X size={12} /> {fmtDate(selectedDay)}
              </button>
            )}
          </div>

          {/* Tabla / vacío */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--ink-400)', fontSize: 13 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', border: '3px solid var(--sand-100)', borderTopColor: 'var(--teal-400)', animation: 'spin 0.8s linear infinite', margin: '0 auto 10px' }} />
              Cargando reservas…
            </div>
          ) : visibleRes.length === 0 ? (
            <div className="card">
              <div className="card-body" style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--ink-300)' }}>
                <Calendar size={36} color="var(--sand-200)" style={{ display: 'block', margin: '0 auto 10px' }} />
                <div style={{ fontSize: 13 }}>
                  {selectedDay
                    ? `Sin reservas para el ${fmtDate(selectedDay)}`
                    : resStatusFilter !== 'all'
                      ? `Sin reservas con estado "${STATUS_CFG[resStatusFilter]?.label || resStatusFilter}"`
                      : isVecino && myResOnly
                        ? 'No tienes reservas este mes — usa "Nueva Reserva" para solicitar un área'
                        : 'Sin reservas este mes'}
                </div>
              </div>
            </div>
          ) : (
            <div className="card">
              <div className="table-wrap">
                <table className="res-table">
                  <thead>
                    <tr>
                      <th>Área</th>
                      <th>Fecha</th>
                      <th>Horario</th>
                      <th>Unidad / Solicitante</th>
                      <th>Estado</th>
                      {showActionsCol && <th style={{ width: 130, textAlign: 'center' }}>Acciones</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRes.map(r => {
                      const sc = STATUS_CFG[r.status] || { label: r.status, cls: '' };
                      const Ico = sc.icon;
                      return (
                        <tr key={r.id}>
                          <td>
                            <div style={{ fontWeight: 600, fontSize: 13 }}>{r.area_name}</div>
                            {r.notes && (
                              <div style={{ fontSize: 11, color: 'var(--ink-400)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                title={r.notes}>
                                💬 {r.notes}
                              </div>
                            )}
                          </td>
                          <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{fmtDate(r.date)}</td>
                          <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                            {r.start_time?.slice(0, 5)} – {r.end_time?.slice(0, 5)}
                          </td>
                          <td style={{ fontSize: 12 }}>
                            <div>{r.unit_id_code || r.unit_name || <span style={{ color: 'var(--ink-300)' }}>—</span>}</div>
                            {r.requested_by_name && (
                              <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>{r.requested_by_name}</div>
                            )}
                          </td>
                          <td>
                            <span className={`badge ${sc.cls}`}
                              style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              {Ico && <Ico size={10} />}
                              {sc.label}
                            </span>
                            {r.rejection_reason && (
                              <div style={{ fontSize: 10, color: 'var(--ink-400)', marginTop: 2, maxWidth: 120 }} title={r.rejection_reason}>
                                {r.rejection_reason.slice(0, 40)}{r.rejection_reason.length > 40 ? '…' : ''}
                              </div>
                            )}
                          </td>
                          {showActionsCol && (
                            <td style={{ textAlign: 'center' }}>
                              <div style={{ display: 'flex', gap: 4, justifyContent: 'center', flexWrap: 'wrap' }}>
                                {/* Managers: approve / reject / cancel */}
                                {canManage && r.status === 'pending' && (
                                  <>
                                    <button className="btn btn-primary btn-sm" style={{ padding: '3px 10px', fontSize: 11 }}
                                      onClick={() => openApprove(r.id)}>
                                      <Check size={11} /> Aprobar
                                    </button>
                                    <button className="btn btn-secondary btn-sm" style={{ padding: '3px 10px', fontSize: 11, color: 'var(--coral-500)' }}
                                      onClick={() => openReject(r.id)}>
                                      <X size={11} /> Rechazar
                                    </button>
                                  </>
                                )}
                                {canManage && r.status === 'approved' && (
                                  <button className="btn btn-secondary btn-sm" style={{ padding: '3px 10px', fontSize: 11 }}
                                    onClick={() => handleCancel(r.id)}>
                                    Cancelar
                                  </button>
                                )}
                                {/* Vecino / Vigilante: cancel own pending or approved reservations */}
                                {canCancelOwn && (r.status === 'pending' || r.status === 'approved') && r.requested_by === user?.id && (
                                  <button className="btn btn-secondary btn-sm" style={{ padding: '3px 10px', fontSize: 11 }}
                                    onClick={() => handleCancel(r.id)}>
                                    Cancelar
                                  </button>
                                )}
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ══ Modal: Nueva Reserva ════════════════════════════════════════════ */}
      {modalOpen && (
        <div className="modal-bg open" onClick={() => setModalOpen(false)}>
          <div className="modal" style={{ maxWidth: 500 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3><Calendar size={16} style={{ marginRight: 6 }} />Nueva Reserva</h3>
              <button className="modal-close" onClick={() => setModalOpen(false)}><X size={16} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* Área */}
              <div>
                <label className="field-label">Área *</label>
                <select className="field-input" value={form.area_id}
                  onChange={e => { setForm(f => ({ ...f, area_id: e.target.value })); setPoliciesAccepted(false); }}>
                  <option value="">Selecciona un área</option>
                  {areas.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.name}{a.charge_enabled ? ` — $${Number(a.charge_amount || 0).toLocaleString('es-MX')}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* ── Políticas del área ── botón para abrir lector + indicador de aceptación */}
              {hasPolicies && (
                policiesAccepted ? (
                  /* Estado: políticas aceptadas */
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--teal-50)', border: '1px solid var(--teal-200)', borderRadius: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <CheckCircle size={16} color="var(--teal-500)" style={{ flexShrink: 0 }} />
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--teal-700)' }}>
                        Políticas del área aceptadas
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPoliciesModalOpen(true)}
                      style={{ fontSize: 11, color: 'var(--teal-600)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                    >
                      Ver políticas
                    </button>
                  </div>
                ) : (
                  /* Estado: políticas pendientes de aceptar */
                  <button
                    type="button"
                    onClick={() => setPoliciesModalOpen(true)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '12px 16px', background: 'var(--amber-50)',
                      border: '1.5px dashed var(--amber-400)', borderRadius: 10, cursor: 'pointer',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--amber-100)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'var(--amber-50)'}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <AlertCircle size={16} color="var(--amber-600)" style={{ flexShrink: 0 }} />
                      <div style={{ textAlign: 'left' }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--amber-800)' }}>
                          Leer y aceptar políticas del área
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--amber-600)', marginTop: 1 }}>
                          Obligatorio antes de enviar la solicitud
                        </div>
                      </div>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--amber-700)' }}>Ver →</span>
                  </button>
                )
              )}

              {/* Unidad — solo para admin/tesorero */}
              {needsUnitSelector && (
                <div>
                  <label className="field-label">Unidad solicitante *</label>
                  <select className="field-input" value={form.unit_id}
                    onChange={e => setForm(f => ({ ...f, unit_id: e.target.value }))}>
                    <option value="">Selecciona una unidad</option>
                    {units.map(u => (
                      <option key={u.id} value={u.id}>
                        {u.unit_id_code ? `${u.unit_id_code}` : ''}{u.unit_name ? ` — ${u.unit_name}` : ''}
                        {u.owner_name ? ` (${u.owner_name})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Fecha */}
              <div>
                <label className="field-label">Fecha *</label>
                <input type="date" className="field-input"
                  value={form.date}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
              </div>

              {/* Horario */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label className="field-label">Hora inicio *</label>
                  <input type="time" className="field-input"
                    value={form.start_time}
                    onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} />
                </div>
                <div>
                  <label className="field-label">Hora fin *</label>
                  <input type="time" className="field-input"
                    value={form.end_time}
                    onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} />
                </div>
              </div>

              {/* Notas */}
              <div>
                <label className="field-label">Notas (opcional)</label>
                <textarea className="field-input" rows={2}
                  style={{ resize: 'vertical', fontFamily: 'var(--font-body)', fontSize: 13 }}
                  placeholder="Descripción del evento, número de personas, etc."
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>

              {/* Aprobación info para vecinos */}
              {isVecino && (
                <div style={{
                  padding: '10px 14px', borderRadius: 10, fontSize: 12,
                  background: isAutoApprover ? 'var(--teal-50)' : 'var(--amber-50)',
                  border: `1px solid ${isAutoApprover ? 'var(--teal-200)' : 'var(--amber-200)'}`,
                  display: 'flex', alignItems: 'center', gap: 8,
                  color: isAutoApprover ? 'var(--teal-700)' : 'var(--amber-800)',
                }}>
                  {isAutoApprover
                    ? <CheckCircle size={14} color="var(--teal-500)" style={{ flexShrink: 0 }} />
                    : <Clock size={14} color="var(--amber-600)" style={{ flexShrink: 0 }} />
                  }
                  {isAutoApprover
                    ? 'Tu reserva será aprobada automáticamente.'
                    : 'Tu solicitud quedará pendiente hasta que la administración la autorice.'
                  }
                </div>
              )}

              {/* Cargo */}
              {selectedAreaObj?.charge_enabled && (
                <div style={{ padding: '10px 14px', background: 'var(--blue-50)', border: '1px solid var(--blue-100)', borderRadius: 10, fontSize: 13, color: 'var(--blue-700)', display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontWeight: 700 }}>Cargo por reserva:</span>
                  ${Number(selectedAreaObj.charge_amount || 0).toLocaleString('es-MX')} MXN
                </div>
              )}
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button>
              <button
                className="btn btn-primary"
                onClick={handleSave}
                disabled={saving || (hasPolicies && !policiesAccepted)}
                title={hasPolicies && !policiesAccepted ? 'Debes aceptar las políticas del área antes de continuar' : ''}
              >
                {saving ? 'Guardando…' : isAutoApprover ? 'Crear Reserva' : 'Solicitar Reserva'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Modal: Lector de Políticas ══════════════════════════════════════ */}
      {policiesModalOpen && selectedAreaObj && (
        <div className="modal-bg open" onClick={() => setPoliciesModalOpen(false)} style={{ zIndex: 1100 }}>
          <div
            className="modal"
            style={{ maxWidth: 560, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="modal-head" style={{ background: 'var(--amber-50)', borderBottom: '1px solid var(--amber-200)', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <FileText size={18} color="var(--amber-600)" />
                <div>
                  <h3 style={{ margin: 0, fontSize: 15, color: 'var(--ink-800)' }}>Políticas del Área</h3>
                  <div style={{ fontSize: 12, color: 'var(--amber-700)', fontWeight: 600, marginTop: 1 }}>
                    {selectedAreaObj.name}
                  </div>
                </div>
              </div>
              <button className="modal-close" onClick={() => setPoliciesModalOpen(false)}><X size={16} /></button>
            </div>

            {/* Scrollable content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
              {selectedAreaObj?.reservation_policy && (
                <div>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
                    paddingBottom: 8, borderBottom: '1px solid var(--sand-100)',
                  }}>
                    <span style={{ fontSize: 16 }}>📋</span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink-800)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Política de Reserva
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--ink-700)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                    {selectedAreaObj.reservation_policy}
                  </div>
                </div>
              )}
              {selectedAreaObj?.usage_policy && (
                <div>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
                    paddingBottom: 8, borderBottom: '1px solid var(--sand-100)',
                  }}>
                    <span style={{ fontSize: 16 }}>🏛</span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink-800)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Política de Uso
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--ink-700)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                    {selectedAreaObj.usage_policy}
                  </div>
                </div>
              )}
            </div>

            {/* Acceptance footer — fixed at bottom */}
            <div style={{
              flexShrink: 0, borderTop: '2px solid var(--sand-100)',
              padding: '14px 24px', background: 'var(--sand-50)',
              display: 'flex', flexDirection: 'column', gap: 12,
            }}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={policiesAccepted}
                  onChange={e => setPoliciesAccepted(e.target.checked)}
                  style={{ marginTop: 3, accentColor: 'var(--teal-500)', width: 16, height: 16, flexShrink: 0 }}
                />
                <span style={{
                  fontSize: 13, lineHeight: 1.45,
                  color: policiesAccepted ? 'var(--teal-700)' : 'var(--ink-700)',
                  fontWeight: policiesAccepted ? 700 : 400,
                }}>
                  He leído y acepto las políticas de reserva y uso de <strong>{selectedAreaObj.name}</strong>
                </span>
              </label>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn btn-secondary" onClick={() => { setPoliciesModalOpen(false); }}>
                  Cancelar
                </button>
                <button
                  className="btn btn-primary"
                  onClick={() => { if (policiesAccepted) setPoliciesModalOpen(false); }}
                  disabled={!policiesAccepted}
                  style={{ opacity: policiesAccepted ? 1 : 0.5 }}
                >
                  <Check size={14} /> Confirmar y continuar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ Modal: Rechazar ═════════════════════════════════════════════════ */}
      {rejectOpen && (
        <div className="modal-bg open" onClick={() => setRejectOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Rechazar Reserva</h3>
              <button className="modal-close" onClick={() => setRejectOpen(false)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <label className="field-label">Motivo del rechazo (opcional)</label>
              <textarea className="field-input" rows={3}
                style={{ resize: 'vertical', fontFamily: 'var(--font-body)', fontSize: 13, marginTop: 6 }}
                placeholder="Área no disponible, mantenimiento programado..."
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)} />
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setRejectOpen(false)}>Cancelar</button>
              <button className="btn btn-danger" onClick={confirmReject}>Confirmar rechazo</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
