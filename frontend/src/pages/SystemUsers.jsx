/**
 * SystemUsers.jsx — Administración de Super Administradores del Sistema Homly
 * Solo disponible para SuperAdmin bajo el menú SISTEMA.
 *
 * Gestiona únicamente el perfil de Super Administrador del sistema.
 */
import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import {
  Users, Plus, Edit, Trash2, RefreshCw, X, Check,
  Shield, Mail, Search, Eye, EyeOff,
  AlertCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';

// ─── API helpers ─────────────────────────────────────────────────────────────

const systemUsersAPI = {
  list:         (params) => api.get('/system-users/', { params }),
  create:       (data)   => api.post('/system-users/', data),
  update:       (id, d)  => api.patch(`/system-users/${id}/`, d),
  delete:       (id)     => api.delete(`/system-users/${id}/`),
  toggleActive: (id)     => api.patch(`/system-users/${id}/toggle-active/`),
};

// ─── UI Atoms ─────────────────────────────────────────────────────────────────

function Modal({ title, onClose, children, wide = false }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className={`bg-white rounded-2xl shadow-2xl w-full ${wide ? 'max-w-lg' : 'max-w-md'} max-h-[92vh] overflow-y-auto`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
          <h2 className="text-lg font-bold text-slate-800">{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
            <X size={18} className="text-slate-500" />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

const inputCls = 'w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400 transition-colors';

function Field({ label, required, children, hint }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1.5">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}

function Btn({ onClick, disabled, variant = 'primary', size = 'md', children, type = 'button' }) {
  const v = {
    primary:   'bg-gradient-to-r from-teal-500 to-emerald-500 text-white hover:from-teal-600 hover:to-emerald-600 shadow-sm',
    secondary: 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50',
    danger:    'bg-red-500 text-white hover:bg-red-600',
  };
  const s = { sm: 'px-3 py-1.5 text-xs', md: 'px-4 py-2.5 text-sm', lg: 'px-6 py-3 text-sm' };
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      className={`inline-flex items-center gap-2 rounded-xl font-semibold transition-all ${v[variant]} ${s[size]} disabled:opacity-50 disabled:cursor-not-allowed`}>
      {children}
    </button>
  );
}

// ─── User Form ────────────────────────────────────────────────────────────────

function UserForm({ initial = {}, onSave, onClose, loading }) {
  const isEdit = !!initial.id;
  const [form, setForm] = useState({
    name:  initial.name  || '',
    email: initial.email || '',
  });
  const set = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.email.trim()) { toast.error('El email es obligatorio'); return; }
    if (!form.name.trim())  { toast.error('El nombre completo es obligatorio'); return; }
    onSave(isEdit ? { name: form.name } : { name: form.name, email: form.email });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Info banner (new user only) */}
      {!isEdit && (
        <div className="flex items-start gap-2.5 px-3 py-2.5 bg-teal-50 border border-teal-200 rounded-xl text-xs text-teal-700">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
          <span>
            El correo debe ser exclusivo — no puede estar registrado en ningún condominio ni perfil existente.
            El acceso es siempre mediante <strong>código de verificación por email</strong>.
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4">
        <Field label="Nombre completo" required>
          <input className={inputCls} value={form.name} onChange={set('name')} placeholder="Ana García" />
        </Field>
        <Field label="Email" required>
          <input
            className={inputCls}
            type="email"
            value={form.email}
            onChange={set('email')}
            placeholder="ana@homly.mx"
            disabled={isEdit}
          />
        </Field>
      </div>

      {/* Role info — read-only */}
      <div className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl">
        <div className="p-2 rounded-lg bg-gradient-to-br from-slate-600 to-slate-800 text-white flex-shrink-0">
          <Shield size={14} />
        </div>
        <div>
          <div className="text-sm font-bold text-slate-800">Super Administrador</div>
          <div className="text-xs text-slate-400">Acceso completo al sistema Homly</div>
        </div>
        <span className="ml-auto text-xs px-2 py-0.5 bg-slate-200 text-slate-600 rounded-full font-medium">Fijo</span>
      </div>

      <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
        <Btn variant="secondary" onClick={onClose}>Cancelar</Btn>
        <Btn type="submit" disabled={loading}>
          {loading ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
          {isEdit ? 'Guardar cambios' : 'Crear Super Admin'}
        </Btn>
      </div>
    </form>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SystemUsers() {
  const queryClient = useQueryClient();
  const [search, setSearch]               = useState('');
  const [userModal, setUserModal]         = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [loading, setLoading]             = useState(false);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['system-users', search],
    queryFn: () => systemUsersAPI.list({ search: search || undefined })
      .then(r => { const d = r.data; return Array.isArray(d) ? d : (d?.results ?? []); }),
    staleTime: 60 * 1000,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['system-users'] });

  const apiErrMsg = (e, fallback = 'Error al guardar usuario') => {
    const d = e?.response?.data;
    if (!d) return fallback;
    if (typeof d === 'string') return d;
    if (d.detail) return d.detail;
    const firstField = Object.values(d).find(v => Array.isArray(v) && v.length);
    return firstField ? firstField[0] : fallback;
  };

  // ── Save ──────────────────────────────────────────────────────────
  const handleSave = async (data) => {
    setLoading(true);
    try {
      if (userModal?.id) {
        await systemUsersAPI.update(userModal.id, data);
        toast.success('Usuario actualizado');
      } else {
        await systemUsersAPI.create(data);
        toast.success('Super Admin creado. Puede iniciar sesión con código de verificación por email.');
      }
      setUserModal(null);
      invalidate();
    } catch (e) {
      toast.error(apiErrMsg(e));
    } finally { setLoading(false); }
  };

  // ── Toggle active ─────────────────────────────────────────────────
  const handleToggleActive = async (user) => {
    try {
      await systemUsersAPI.toggleActive(user.id);
      toast.success(user.is_active ? 'Usuario desactivado' : 'Usuario activado');
      invalidate();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error');
    }
  };

  // ── Delete ────────────────────────────────────────────────────────
  const handleDelete = async (id) => {
    setLoading(true);
    try {
      await systemUsersAPI.delete(id);
      toast.success('Usuario eliminado');
      setConfirmDelete(null);
      invalidate();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error al eliminar');
    } finally { setLoading(false); }
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <span className="bg-gradient-to-br from-slate-600 to-slate-800 text-white p-2 rounded-xl">
                <Users size={20} />
              </span>
              Usuarios del Sistema
            </h1>
            <p className="text-slate-500 text-sm mt-0.5">Super Administradores · Equipo interno Homly</p>
          </div>
          <Btn onClick={() => setUserModal('new')}>
            <Plus size={14} /> Nuevo Super Admin
          </Btn>
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {/* Search */}
        <div className="flex items-center gap-3 mb-5">
          <div className="relative flex-1 max-w-sm">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400"
              placeholder="Buscar por nombre o email..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <span className="text-sm text-slate-400 ml-auto">
            {users.length} Super Admin{users.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <RefreshCw size={24} className="animate-spin text-teal-500" />
            </div>
          ) : users.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="p-4 rounded-2xl bg-slate-50 text-slate-300 mb-4"><Users size={32} /></div>
              <p className="text-slate-600 font-semibold text-lg mb-1">Sin usuarios del sistema</p>
              <p className="text-slate-400 text-sm mb-6">Crea el primer Super Administrador del equipo Homly</p>
              <Btn onClick={() => setUserModal('new')}><Plus size={14} /> Crear Super Admin</Btn>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  {['Usuario', 'Rol', 'Estado', ''].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {users.map(u => (
                  <tr key={u.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-slate-600 to-slate-800 flex items-center justify-center text-white flex-shrink-0 font-bold text-sm">
                          {u.name?.[0]?.toUpperCase()}
                        </div>
                        <div>
                          <div className="font-semibold text-slate-800">{u.name}</div>
                          <div className="text-xs text-slate-400 flex items-center gap-1">
                            <Mail size={10} />{u.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Shield size={13} className="text-slate-500" />
                        <span className="text-xs font-medium text-slate-700">Super Administrador</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${u.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${u.is_active ? 'bg-green-500' : 'bg-red-400'}`} />
                        {u.is_active ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button onClick={() => setUserModal(u)}
                          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors" title="Editar usuario">
                          <Edit size={14} />
                        </button>
                        <button onClick={() => handleToggleActive(u)}
                          className={`p-1.5 rounded-lg transition-colors ${u.is_active ? 'hover:bg-orange-50 text-slate-400 hover:text-orange-500' : 'hover:bg-green-50 text-slate-400 hover:text-green-600'}`}
                          title={u.is_active ? 'Desactivar' : 'Activar'}>
                          {u.is_active ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                        <button onClick={() => setConfirmDelete({ id: u.id, name: u.name })}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors" title="Eliminar">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modals */}

      {userModal && (
        <Modal
          title={userModal === 'new' || !userModal?.id ? 'Nuevo Super Administrador' : `Editar: ${userModal.name}`}
          onClose={() => setUserModal(null)}
        >
          <UserForm
            initial={userModal === 'new' ? {} : userModal}
            onSave={handleSave}
            onClose={() => setUserModal(null)}
            loading={loading}
          />
        </Modal>
      )}

      {/* Confirm delete */}
      {confirmDelete && (
        <Modal title="Confirmar eliminación" onClose={() => setConfirmDelete(null)}>
          <div className="text-center space-y-4">
            <div className="p-4 bg-red-50 rounded-2xl">
              <AlertCircle size={32} className="text-red-500 mx-auto mb-2" />
              <p className="text-slate-700 font-medium">¿Eliminar usuario del sistema?</p>
              <p className="text-slate-500 text-sm mt-1 font-semibold">{confirmDelete.name}</p>
              <p className="text-xs text-slate-400 mt-2">Esta acción no se puede deshacer.</p>
            </div>
            <div className="flex gap-3 justify-center">
              <Btn variant="secondary" onClick={() => setConfirmDelete(null)}>Cancelar</Btn>
              <Btn variant="danger" disabled={loading}
                onClick={() => handleDelete(confirmDelete.id)}>
                {loading ? <RefreshCw size={13} className="animate-spin" /> : <Trash2 size={13} />}
                Eliminar
              </Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
