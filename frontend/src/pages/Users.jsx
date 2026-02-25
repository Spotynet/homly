import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { usersAPI, unitsAPI } from '../api/client';
import { ROLES } from '../utils/helpers';
import { Plus, Trash2, X, Shield } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Users() {
  const { tenantId, isAdmin } = useAuth();
  const [users, setUsers] = useState([]);
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({});

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

  const openAdd = () => {
    setForm({ name: '', email: '', password: '', role: 'vecino', unit_id: '' });
    setModal(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.email || !form.password) return toast.error('Nombre, email y contraseña son obligatorios');
    if (form.role === 'vecino' && !form.unit_id) return toast.error('Seleccione una unidad para el vecino');
    try {
      await usersAPI.create({
        name: form.name,
        email: form.email,
        password: form.password,
        role: form.role,
        tenant_id: tenantId,
        unit_id: form.unit_id || null,
      });
      toast.success('Usuario creado');
      setModal(false);
      load();
    } catch (e) {
      toast.error(e.response?.data?.email?.[0] || 'Error creando usuario');
    }
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

  if (loading) return <div style={{ padding: 32, textAlign: 'center', color: 'var(--ink-400)' }}>Cargando usuarios...</div>;

  return (
    <div className="content-fade">
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 20 }}>
        <div>
          <p style={{ fontSize: 14, color: 'var(--ink-400)' }}>{users.length} usuarios con acceso</p>
        </div>
        {isAdmin && (
          <button onClick={openAdd} className="btn btn-primary">
            <Plus size={16} /> Nuevo Usuario
          </button>
        )}
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Email</th>
                <th>Rol</th>
                <th>Unidad</th>
                {isAdmin && <th style={{ width: 80 }}>Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {users.map(tu => {
                const roleInfo = ROLES[tu.role] || { label: tu.role, color: '#64748B', bg: '#F1F5F9' };
                return (
                  <tr key={tu.id}>
                    <td style={{ fontWeight: 600 }}>{tu.user_name}</td>
                    <td style={{ fontSize: 13, color: 'var(--ink-500)' }}>{tu.user_email}</td>
                    <td>
                      <span className="badge" style={{ background: roleInfo.bg, color: roleInfo.color }}>
                        {roleInfo.label}
                      </span>
                    </td>
                    <td style={{ fontSize: 13 }}>{tu.unit_code || '—'}</td>
                    {isAdmin && (
                      <td>
                        <button onClick={() => handleDelete(tu)} className="btn-icon" style={{ color: 'var(--coral-500)' }} title="Eliminar">
                          <Trash2 size={15} />
                        </button>
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

      {/* Modal */}
      {modal && (
        <div className="modal-bg open" onClick={() => setModal(false)}>
          <div className="modal lg" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Nuevo Usuario</h3>
              <button onClick={() => setModal(false)} className="modal-close"><X size={16} /></button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="field">
                  <label className="field-label">Nombre Completo *</label>
                  <input className="field-input" value={form.name}
                    onChange={e => setField('name', e.target.value)} />
                </div>
                <div className="field">
                  <label className="field-label">Email *</label>
                  <input type="email" className="field-input" value={form.email}
                    onChange={e => setField('email', e.target.value)} />
                </div>
                <div className="field">
                  <label className="field-label">Contraseña *</label>
                  <input type="password" className="field-input" value={form.password}
                    onChange={e => setField('password', e.target.value)} />
                </div>
                <div className="field">
                  <label className="field-label">Rol</label>
                  <select className="field-select" value={form.role}
                    onChange={e => setField('role', e.target.value)}>
                    {Object.entries(ROLES).filter(([k]) => k !== 'superadmin').map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                </div>
                {form.role === 'vecino' && (
                  <div className="field field-full">
                    <label className="field-label">Unidad Asignada *</label>
                    <select className="field-select" value={form.unit_id}
                      onChange={e => setField('unit_id', e.target.value)}>
                      <option value="">— Seleccione —</option>
                      {units.map(u => (
                        <option key={u.id} value={u.id}>{u.unit_id_code} — {u.unit_name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>
            <div className="modal-foot">
              <button onClick={() => setModal(false)} className="btn btn-outline">Cancelar</button>
              <button onClick={handleSave} className="btn btn-primary">Crear Usuario</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
