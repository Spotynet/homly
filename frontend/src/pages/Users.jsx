import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { usersAPI, unitsAPI, authAPI } from '../api/client';
import { ROLES } from '../utils/helpers';
import { Plus, Trash2, X, Pencil, UserCheck, UserPlus, Loader } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Users() {
  const { tenantId, isAdmin } = useAuth();
  const [users,   setUsers]   = useState([]);
  const [units,   setUnits]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal,   setModal]   = useState(false);
  const [editId,  setEditId]  = useState(null); // TenantUser ID when editing
  const [saving,  setSaving]  = useState(false);
  const [form,    setForm]    = useState({});

  // ── Email lookup state (create mode) ───────────────────────────────────
  const [emailChecking, setEmailChecking]   = useState(false);
  const [existingUser,  setExistingUser]    = useState(null); // {id, name, email} | null | false
  // null = not checked yet, false = checked and does not exist, object = exists
  const emailCheckTimer = useRef(null);

  // ── Load ──────────────────────────────────────────────────────────────────
  const load = async () => {
    try {
      const [uRes, unitRes] = await Promise.all([
        usersAPI.list(tenantId, { page_size: 9999 }),
        unitsAPI.list(tenantId, { page_size: 9999 }),
      ]);
      setUsers(uRes.data.results || uRes.data);
      setUnits(unitRes.data.results || unitRes.data);
    } catch { toast.error('Error cargando usuarios'); }
    setLoading(false);
  };

  useEffect(() => { if (tenantId) load(); }, [tenantId]);

  // ── Open modal ────────────────────────────────────────────────────────────
  const openAdd = () => {
    setEditId(null);
    setExistingUser(null);
    setForm({ name: '', email: '', password: '', role: 'vecino', unit_id: '' });
    setModal(true);
  };

  const openEdit = (tu) => {
    setEditId(tu.id);
    setExistingUser(null);
    setForm({
      name:    tu.user_name  || '',
      email:   tu.user_email || '',
      role:    tu.role       || 'vecino',
      unit_id: tu.unit       || '',
    });
    setModal(true);
  };

  // ── Email check (debounced, create mode only) ─────────────────────────────
  const handleEmailChange = (val) => {
    setField('email', val);
    setExistingUser(null); // reset
    clearTimeout(emailCheckTimer.current);
    if (!val || !val.includes('@')) return;
    emailCheckTimer.current = setTimeout(async () => {
      setEmailChecking(true);
      try {
        const { data } = await authAPI.checkEmail(val.trim());
        setExistingUser(data.exists ? data : false);
      } catch { setExistingUser(false); }
      finally  { setEmailChecking(false); }
    }, 500);
  };

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    try {
      if (editId) {
        // Edit mode
        if (!form.name?.trim()) { toast.error('El nombre es obligatorio'); setSaving(false); return; }
        if (form.role === 'vecino' && !form.unit_id) { toast.error('Seleccione una unidad para el vecino'); setSaving(false); return; }
        await usersAPI.update(tenantId, editId, {
          name: form.name.trim(),
          role: form.role,
          unit: form.role === 'vecino' ? (form.unit_id || null) : null,
        });
        toast.success('Usuario actualizado');
      } else {
        // Create / associate mode
        if (!form.email) { toast.error('El email es obligatorio'); setSaving(false); return; }
        if (existingUser === false && !form.name) { toast.error('El nombre es obligatorio'); setSaving(false); return; }
        if (existingUser === false && !form.password) { toast.error('La contraseña es obligatoria'); setSaving(false); return; }
        if (form.role === 'vecino' && !form.unit_id) { toast.error('Seleccione una unidad para el vecino'); setSaving(false); return; }

        const payload = {
          email:     form.email.trim(),
          role:      form.role,
          tenant_id: tenantId,
          unit_id:   form.unit_id || null,
        };
        if (existingUser === false) {
          payload.name     = form.name.trim();
          payload.password = form.password;
        }
        await usersAPI.create(payload);
        toast.success(existingUser ? `${existingUser.name} agregado al condominio` : 'Usuario creado');
      }
      setModal(false);
      load();
    } catch (e) {
      toast.error(
        e.response?.data?.detail ||
        e.response?.data?.non_field_errors?.[0] ||
        e.response?.data?.email?.[0] ||
        (editId ? 'Error actualizando usuario' : 'Error al guardar usuario')
      );
    } finally { setSaving(false); }
  };

  const handleDelete = async (tu) => {
    if (!window.confirm(`¿Eliminar el acceso de ${tu.user_name} a este condominio?`)) return;
    try {
      await usersAPI.delete(tenantId, tu.id);
      toast.success('Acceso eliminado');
      load();
    } catch { toast.error('Error eliminando acceso'); }
  };

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const unitLabel = (u) => [u.unit_id_code, u.unit_name].filter(Boolean).join(' — ');
  const unitById  = (id) => units.find(u => String(u.id) === String(id));

  if (loading) return (
    <div style={{ padding: 32, textAlign: 'center', color: 'var(--ink-400)' }}>Cargando usuarios...</div>
  );

  return (
    <div className="content-fade">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 20 }}>
        <p style={{ fontSize: 14, color: 'var(--ink-400)', margin: 0 }}>
          {users.length} usuario{users.length !== 1 ? 's' : ''} con acceso
        </p>
        {isAdmin && (
          <button onClick={openAdd} className="btn btn-primary">
            <Plus size={16} /> Nuevo Usuario
          </button>
        )}
      </div>

      {/* ── Table ───────────────────────────────────────────────────────── */}
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Email</th>
                <th>Rol</th>
                <th>Unidad</th>
                {isAdmin && <th style={{ width: 90, textAlign: 'center' }}>Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {users.map(tu => {
                const roleInfo = ROLES[tu.role] || { label: tu.role, color: '#64748B', bg: '#F1F5F9' };
                const unit     = unitById(tu.unit);
                return (
                  <tr key={tu.id}>
                    <td style={{ fontWeight: 600 }}>{tu.user_name}</td>
                    <td style={{ fontSize: 13, color: 'var(--ink-500)' }}>{tu.user_email}</td>
                    <td>
                      <span className="badge" style={{ background: roleInfo.bg, color: roleInfo.color }}>
                        {roleInfo.label}
                      </span>
                    </td>
                    <td style={{ fontSize: 13 }}>
                      {unit ? unitLabel(unit) : (tu.unit_code || '—')}
                    </td>
                    {isAdmin && (
                      <td>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                          <button onClick={() => openEdit(tu)} className="btn-icon" style={{ color: 'var(--teal-600)' }} title="Editar">
                            <Pencil size={15} />
                          </button>
                          <button onClick={() => handleDelete(tu)} className="btn-icon" style={{ color: 'var(--coral-500)' }} title="Eliminar">
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
              {users.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: '32px 20px', color: 'var(--ink-400)' }}>Sin usuarios</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ══ Modal: Crear / Editar ══════════════════════════════════════════ */}
      {modal && (
        <div className="modal-bg open" onClick={() => setModal(false)}>
          <div className="modal lg" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3>{editId ? 'Editar Usuario' : 'Agregar Usuario'}</h3>
              <button onClick={() => setModal(false)} className="modal-close"><X size={16} /></button>
            </div>

            <div className="modal-body">
              <div className="form-grid">

                {/* ── EMAIL (+ lookup indicator) ──────────────────────── */}
                <div className="field field-full">
                  <label className="field-label">Email *</label>
                  <div style={{ position: 'relative' }}>
                    {editId ? (
                      <div style={{ padding: '8px 12px', background: 'var(--sand-50)', border: '1px solid var(--sand-100)', borderRadius: 8, fontSize: 14, color: 'var(--ink-600)' }}>
                        {form.email}
                      </div>
                    ) : (
                      <input
                        type="email" className="field-input"
                        value={form.email}
                        onChange={e => handleEmailChange(e.target.value)}
                        placeholder="usuario@email.com"
                        style={{ paddingRight: 36 }}
                      />
                    )}
                    {!editId && emailChecking && (
                      <Loader size={14} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-400)', animation: 'spin 0.8s linear infinite' }} />
                    )}
                  </div>
                </div>

                {/* ── EXISTING USER NOTICE ─────────────────────────────── */}
                {!editId && existingUser && (
                  <div className="field field-full">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--teal-50)', border: '1px solid var(--teal-100)', borderRadius: 10 }}>
                      <UserCheck size={18} color="var(--teal-500)" style={{ flexShrink: 0 }} />
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--teal-700)' }}>
                          Usuario existente: {existingUser.name}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--teal-600)', marginTop: 2 }}>
                          Se agregará a este condominio con el rol y unidad que selecciones.
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── NOMBRE — solo para usuarios nuevos ───────────────── */}
                {(editId || (!editId && existingUser === false)) && (
                  <div className="field">
                    <label className="field-label">Nombre Completo *</label>
                    <input className="field-input" value={form.name}
                      onChange={e => setField('name', e.target.value)} />
                  </div>
                )}

                {/* ── CONTRASEÑA — solo para usuarios nuevos ────────────── */}
                {!editId && existingUser === false && (
                  <div className="field">
                    <label className="field-label">Contraseña *</label>
                    <input type="password" className="field-input" value={form.password || ''}
                      onChange={e => setField('password', e.target.value)} />
                  </div>
                )}

                {/* ── ROL ─────────────────────────────────────────────── */}
                {(editId || existingUser !== null) && (
                  <div className="field">
                    <label className="field-label">Rol</label>
                    <select className="field-select" value={form.role}
                      onChange={e => {
                        setField('role', e.target.value);
                        if (e.target.value !== 'vecino') setField('unit_id', '');
                      }}>
                      {Object.entries(ROLES)
                        .filter(([k]) => k !== 'superadmin')
                        .map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                )}

                {/* ── UNIDAD — solo si rol vecino ───────────────────────── */}
                {(editId || existingUser !== null) && form.role === 'vecino' && (
                  <div className="field field-full">
                    <label className="field-label">Unidad Asignada *</label>
                    <select className="field-select" value={form.unit_id}
                      onChange={e => setField('unit_id', e.target.value)}>
                      <option value="">— Seleccione una unidad —</option>
                      {units.map(u => (
                        <option key={u.id} value={u.id}>
                          {unitLabel(u)}{u.owner_name ? ` · ${u.owner_name}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* ── HINT cuando email aún no verificado ──────────────── */}
                {!editId && existingUser === null && !emailChecking && form.email && !form.email.includes('@') && (
                  <div className="field field-full">
                    <p style={{ fontSize: 12, color: 'var(--ink-400)', margin: 0 }}>
                      Ingresa un email válido para continuar.
                    </p>
                  </div>
                )}

              </div>
            </div>

            <div className="modal-foot">
              <button onClick={() => setModal(false)} className="btn btn-outline">Cancelar</button>
              <button
                onClick={handleSave}
                className="btn btn-primary"
                disabled={saving || (!editId && existingUser === null && !emailChecking)}
              >
                {saving ? 'Guardando…' : editId ? 'Guardar Cambios' : existingUser ? 'Agregar al Condominio' : 'Crear Usuario'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
