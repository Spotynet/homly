import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Mail, Plus, Power, Trash2, UserPlus } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { authAPI, usersAPI } from '../../api/client';
import {
  RENTAL_ROLES, RENTAL_ROLE_ACCESS, RENTAS_MODULE_CATALOG, groupModules,
} from '../../constants/modulePermissions';

const LEVEL_UI = {
  write:   { label: 'Total',    title: 'Consulta, crea, edita y elimina', color: '#166534', bg: '#DCFCE7' },
  operate: { label: 'Ejecuta',  title: 'Actualiza avance, evidencias e inspecciones; no crea ni elimina', color: '#9A3412', bg: '#FFEDD5' },
  read:    { label: 'Consulta', title: 'Solo lectura', color: '#1E40AF', bg: '#DBEAFE' },
  none:    { label: '—',        title: 'Sin acceso', color: '#94A3B8', bg: 'transparent' },
};

const roleOf = (key) => RENTAL_ROLES.find(r => r.key === key);

function RolePill({ role }) {
  const r = roleOf(role);
  if (!r) return <span className="proj-chip">{role}</span>;
  return <span className="proj-chip" style={{ color: r.color, background: r.bg, fontWeight: 700 }}>{r.label}</span>;
}

function LevelChip({ level }) {
  const ui = LEVEL_UI[level] || LEVEL_UI.none;
  return (
    <span
      title={ui.title}
      style={{ display: 'inline-block', minWidth: 62, padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700, color: ui.color, background: ui.bg }}
    >
      {ui.label}
    </span>
  );
}

const errText = (e, fallback) => {
  const d = e?.response?.data;
  if (!d) return fallback;
  if (typeof d === 'string') return d;
  return d.detail || d.role?.[0] || d.email?.[0] || d.name?.[0] || d.non_field_errors?.[0] || (Array.isArray(d) ? d[0] : '') || fallback;
};

/** Equipo del portafolio: alta de usuarios con los perfiles de Administrar Propiedades y matriz de accesos. */
export default function RentalTeam() {
  const { tenantId, user } = useAuth();
  const [view, setView] = useState('equipo');
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | { email, name, role }
  const [existing, setExisting] = useState(null); // null | false | { id, name }
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const timer = useRef(null);

  const load = useCallback(() => {
    if (!tenantId) return Promise.resolve();
    return usersAPI.list(tenantId)
      .then(r => setUsers(r.data.results || r.data || []))
      .catch(() => toast.error('No se pudo cargar el equipo'))
      .finally(() => setLoading(false));
  }, [tenantId]);

  useEffect(() => { load(); }, [load]);

  const counts = useMemo(() => {
    const c = {};
    users.forEach(u => { c[u.role] = (c[u.role] || 0) + 1; });
    return c;
  }, [users]);

  const onEmail = (val) => {
    setModal(m => ({ ...m, email: val }));
    setExisting(null);
    clearTimeout(timer.current);
    if (!val || !val.includes('@')) return;
    timer.current = setTimeout(async () => {
      setChecking(true);
      try {
        const { data } = await authAPI.checkEmail(val.trim());
        setExisting(data.exists ? data : false);
      } catch { setExisting(false); } finally { setChecking(false); }
    }, 500);
  };

  const invite = async () => {
    const email = (modal?.email || '').trim();
    if (!email) return toast.error('Escribe el correo');
    if (!existing?.id && !(modal.name || '').trim()) return toast.error('Escribe el nombre');
    setBusy(true);
    try {
      const payload = { email, role: modal.role, tenant_id: tenantId };
      if (!existing?.id) payload.name = modal.name.trim();
      await usersAPI.create(payload);
      toast.success(existing?.id ? `${existing.name} se agregó al portafolio` : 'Usuario creado; le enviamos su invitación por correo');
      setModal(null);
      setExisting(null);
      load();
    } catch (e) {
      toast.error(errText(e, 'No se pudo agregar al usuario'));
    } finally { setBusy(false); }
  };

  const changeRole = async (u, role) => {
    if (role === u.role) return;
    try {
      await usersAPI.update(tenantId, u.id, { role });
      toast.success(`${u.user_name || u.user_email}: ahora es ${roleOf(role)?.label || role}`);
      load();
    } catch (e) { toast.error(errText(e, 'No se pudo cambiar el perfil')); }
  };

  const toggle = async (u) => {
    try {
      const { data } = await usersAPI.toggleActive(tenantId, u.id);
      toast.success(data.is_active ? 'Acceso reactivado' : 'Acceso desactivado');
      load();
    } catch (e) { toast.error(errText(e, 'No se pudo cambiar el acceso')); }
  };

  const resend = async (u) => {
    try {
      await usersAPI.sendInvitation(tenantId, u.id);
      toast.success('Invitación enviada');
    } catch (e) { toast.error(errText(e, 'No se pudo enviar la invitación')); }
  };

  const remove = async (u) => {
    if (!window.confirm(`¿Quitar a ${u.user_name || u.user_email} de este portafolio?`)) return;
    try {
      await usersAPI.delete(tenantId, u.id);
      toast.success('Usuario removido');
      load();
    } catch (e) { toast.error(errText(e, 'No se pudo remover')); }
  };

  const groups = useMemo(() => groupModules(RENTAS_MODULE_CATALOG.filter(m => m.key in RENTAL_ROLE_ACCESS.admin)), []);
  const adminCount = counts.admin || 0;

  return (
    <div>
      <div className="tabs" style={{ marginBottom: 14 }}>
        <button className={`tab ${view === 'equipo' ? 'active' : ''}`} onClick={() => setView('equipo')}>Equipo</button>
        <button className={`tab ${view === 'perfiles' ? 'active' : ''}`} onClick={() => setView('perfiles')}>Perfiles y accesos</button>
      </div>

      {view === 'equipo' && (
        <div className="card">
          <div className="card-head">
            <h3>Equipo del portafolio</h3>
            <button className="btn btn-primary btn-sm" onClick={() => { setExisting(null); setModal({ email: '', name: '', role: 'gerente' }); }}>
              <UserPlus size={14} /> Agregar persona
            </button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Nombre</th><th>Correo</th><th>Perfil</th><th>Acceso</th><th style={{ width: 130 }} /></tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={5} style={{ padding: 24, textAlign: 'center', color: 'var(--ink-400)' }}>Cargando…</td></tr>}
                {!loading && users.length === 0 && (
                  <tr><td colSpan={5} style={{ padding: 24, textAlign: 'center', color: 'var(--ink-400)' }}>Aún no hay personas en este portafolio.</td></tr>
                )}
                {users.map(u => {
                  const isMe = user?.email && u.user_email === user.email;
                  const known = !!roleOf(u.role);
                  const lastAdmin = u.role === 'admin' && adminCount <= 1;
                  return (
                    <tr key={u.id}>
                      <td style={{ fontWeight: 600 }}>{u.user_name || '—'}{isMe && <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--ink-400)' }}>(tú)</span>}</td>
                      <td style={{ fontSize: 13 }}>{u.user_email}</td>
                      <td>
                        {known && !isMe && !lastAdmin ? (
                          <select className="field-select" style={{ maxWidth: 230 }} value={u.role} onChange={e => changeRole(u, e.target.value)} aria-label="Perfil">
                            {RENTAL_ROLES.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
                          </select>
                        ) : <RolePill role={u.role} />}
                      </td>
                      <td>
                        <span className="proj-chip" style={{ color: u.is_active ? '#166534' : '#991B1B', background: u.is_active ? '#DCFCE7' : '#FEE2E2' }}>
                          {u.is_active ? 'Activo' : 'Desactivado'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                          <button className="btn-icon" title="Reenviar invitación" onClick={() => resend(u)}><Mail size={14} /></button>
                          {!isMe && <button className="btn-icon" title={u.is_active ? 'Desactivar acceso' : 'Reactivar acceso'} onClick={() => toggle(u)}><Power size={14} /></button>}
                          {!isMe && !lastAdmin && <button className="btn-icon" title="Quitar del portafolio" style={{ color: 'var(--coral-500)' }} onClick={() => remove(u)}><Trash2 size={14} /></button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ padding: 14, fontSize: 12, color: 'var(--ink-400)' }}>
            Cada persona entra con su correo (recibe un código de verificación). El perfil define qué módulos ve y qué puede hacer en ellos.
            Siempre debe quedar al menos un Administrador.
          </div>
        </div>
      )}

      {view === 'perfiles' && (
        <>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', marginBottom: 16 }}>
            {RENTAL_ROLES.map(r => (
              <div key={r.key} className="card" style={{ padding: 14, borderTop: `3px solid ${r.color}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <strong style={{ fontSize: 14 }}>{r.label}</strong>
                  <span style={{ fontSize: 11, color: 'var(--ink-400)' }}>{counts[r.key] || 0} persona(s)</span>
                </div>
                <p style={{ fontSize: 12, color: 'var(--ink-500)', margin: '6px 0 0', lineHeight: 1.45 }}>{r.desc}</p>
              </div>
            ))}
          </div>

          <div className="card">
            <div className="card-head"><h3>Qué puede hacer cada perfil</h3></div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Módulo</th>
                    {RENTAL_ROLES.map(r => <th key={r.key} style={{ textAlign: 'center', fontSize: 11, color: r.color }}>{r.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {groups.map(g => (
                    <React.Fragment key={g.id}>
                      <tr><td colSpan={RENTAL_ROLES.length + 1} style={{ background: 'var(--sand-50, #faf8f5)', fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-400)' }}>{g.label}</td></tr>
                      {g.items.map(m => (
                        <tr key={m.key}>
                          <td>
                            <div style={{ fontWeight: 600, fontSize: 13 }}>{m.label}</div>
                            <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>{m.desc}</div>
                          </td>
                          {RENTAL_ROLES.map(r => (
                            <td key={r.key} style={{ textAlign: 'center' }}><LevelChip level={RENTAL_ROLE_ACCESS[r.key][m.key] || 'none'} /></td>
                          ))}
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ padding: 14, fontSize: 12, color: 'var(--ink-400)', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              {['write', 'operate', 'read', 'none'].map(k => (
                <span key={k}><LevelChip level={k} /> <span style={{ marginLeft: 4 }}>{LEVEL_UI[k].title}</span></span>
              ))}
            </div>
          </div>
        </>
      )}

      {modal && (
        <div className="modal-bg open" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Agregar persona al portafolio</h3>
              <button className="modal-close" onClick={() => setModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="field field-full">
                  <label className="field-label">Correo *</label>
                  <input className="field-input" type="email" value={modal.email} onChange={e => onEmail(e.target.value)} placeholder="nombre@empresa.com" />
                  {checking && <div style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 4 }}>Revisando…</div>}
                  {existing?.id && <div style={{ fontSize: 12, color: 'var(--teal-700)', marginTop: 4 }}>Ya tiene cuenta en Homly ({existing.name}); solo se le dará acceso a este portafolio.</div>}
                </div>
                {!existing?.id && (
                  <div className="field field-full">
                    <label className="field-label">Nombre *</label>
                    <input className="field-input" value={modal.name} onChange={e => setModal(m => ({ ...m, name: e.target.value }))} />
                  </div>
                )}
                <div className="field field-full">
                  <label className="field-label">Perfil *</label>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {RENTAL_ROLES.map(r => (
                      <label
                        key={r.key}
                        style={{
                          display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 10px', borderRadius: 10, cursor: 'pointer',
                          border: `1.5px solid ${modal.role === r.key ? r.color : 'var(--sand-200, #e5e7eb)'}`,
                          background: modal.role === r.key ? r.bg : 'transparent',
                        }}
                      >
                        <input type="radio" name="rental-role" checked={modal.role === r.key} onChange={() => setModal(m => ({ ...m, role: r.key }))} style={{ marginTop: 3 }} />
                        <span>
                          <strong style={{ fontSize: 13, color: r.color }}>{r.label}</strong>
                          <span style={{ display: 'block', fontSize: 12, color: 'var(--ink-500)', lineHeight: 1.4 }}>{r.desc}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancelar</button>
              <button className="btn btn-primary" disabled={busy} onClick={invite}><Plus size={14} /> {busy ? 'Agregando…' : 'Agregar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
