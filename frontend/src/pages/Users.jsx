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
        usersAPI.list(tenantId),
        unitsAPI.list(tenantId),
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

  if (loading) return <div className="p-8 text-center text-ink-400">Cargando usuarios...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-ink-800">Usuarios</h2>
          <p className="text-sm text-ink-400">{users.length} usuarios con acceso</p>
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
                    <td className="font-semibold">{tu.user_name}</td>
                    <td className="text-sm text-ink-500">{tu.user_email}</td>
                    <td>
                      <span className="badge" style={{ background: roleInfo.bg, color: roleInfo.color }}>
                        {roleInfo.label}
                      </span>
                    </td>
                    <td className="text-sm">{tu.unit_code || '—'}</td>
                    {isAdmin && (
                      <td>
                        <button onClick={() => handleDelete(tu)} className="btn-icon text-coral-500" title="Eliminar">
                          <Trash2 size={15} />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
              {users.length === 0 && (
                <tr><td colSpan={5} className="text-center py-8 text-ink-400">Sin usuarios</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {modal && (
        <div className="modal-overlay" onClick={() => setModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <Shield size={20} className="text-teal-600" /> Nuevo Usuario
              </h3>
              <button onClick={() => setModal(false)} className="btn-icon"><X size={20} /></button>
            </div>
            <div className="modal-body space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="field-label">Nombre Completo *</label>
                  <input className="field-input" value={form.name}
                    onChange={e => setField('name', e.target.value)} />
                </div>
                <div>
                  <label className="field-label">Email *</label>
                  <input type="email" className="field-input" value={form.email}
                    onChange={e => setField('email', e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="field-label">Contraseña *</label>
                  <input type="password" className="field-input" value={form.password}
                    onChange={e => setField('password', e.target.value)} />
                </div>
                <div>
                  <label className="field-label">Rol</label>
                  <select className="field-select" value={form.role}
                    onChange={e => setField('role', e.target.value)}>
                    {Object.entries(ROLES).filter(([k]) => k !== 'superadmin').map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              {form.role === 'vecino' && (
                <div>
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
              <div className="flex justify-end gap-3 pt-4">
                <button onClick={() => setModal(false)} className="btn btn-outline">Cancelar</button>
                <button onClick={handleSave} className="btn btn-primary">Crear Usuario</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
