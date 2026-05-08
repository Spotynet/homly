/**
 * SystemUsers.jsx — Administración de Usuarios del Sistema Homly
 * Solo disponible para SuperAdmin bajo el menú SISTEMA.
 *
 * Gestiona los perfiles internos del equipo Homly:
 *  - Super Administrador
 *  - Revenue Growth Strategist (Ventas)
 *  - Content Strategist Lead (Marketing)
 *  - Customer Success Hero (Atención al cliente)
 *  - Systems Reliability Engineer (Soporte técnico)
 */
import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import {
  Users, Plus, Edit, Trash2, RefreshCw, X, Check,
  Shield, TrendingUp, Megaphone, HeartHandshake, Wrench,
  Mail, Search, Eye, EyeOff, KeyRound, ToggleLeft,
  ToggleRight, Building2, Lock, Globe, Activity,
  Target, CreditCard, ChevronDown, ChevronUp,
  AlertCircle, CheckCircle, Copy,
} from 'lucide-react';
import toast from 'react-hot-toast';

// ─── API helpers ─────────────────────────────────────────────────────────────

const systemUsersAPI = {
  list:              (params) => api.get('/system-users/', { params }),
  get:               (id)     => api.get(`/system-users/${id}/`),
  create:            (data)   => api.post('/system-users/', data),
  update:            (id, d)  => api.patch(`/system-users/${id}/`, d),
  delete:            (id)     => api.delete(`/system-users/${id}/`),
  updatePermissions: (id, d)  => api.patch(`/system-users/${id}/update-permissions/`, d),
  toggleActive:      (id)     => api.patch(`/system-users/${id}/toggle-active/`),
  resetPassword:     (id)     => api.post(`/system-users/${id}/reset-password/`),
};

// Also fetch tenants for the permission assignment
const tenantsListAPI = () => api.get('/tenants/', { params: { page_size: 500 } });

// ─── Role definitions ─────────────────────────────────────────────────────────

const ROLE_PROFILES = {
  super_admin: {
    label:       'Super Administrador',
    subtitle:    'Acceso completo al sistema',
    icon:        Shield,
    gradient:    'from-slate-600 to-slate-800',
    lightBg:     'bg-slate-50 border-slate-200',
    badgeColor:  'bg-slate-100 text-slate-700',
    dot:         'bg-slate-600',
    modules:     ['tenants', 'suscripciones', 'crm', 'logs', 'system_users'],
    description: 'Control total de la plataforma. Puede crear y gestionar todos los usuarios del sistema.',
  },
  ventas: {
    label:       'Revenue Growth Strategist',
    subtitle:    'Estratega de Crecimiento de Negocio',
    icon:        TrendingUp,
    gradient:    'from-teal-500 to-emerald-600',
    lightBg:     'bg-teal-50 border-teal-200',
    badgeColor:  'bg-teal-100 text-teal-700',
    dot:         'bg-teal-500',
    modules:     ['crm', 'tenants'],
    description: 'Acceso al CRM, pipeline de ventas, gestión de leads y contactos. Visibilidad de tenants asignados.',
  },
  marketing: {
    label:       'Content Strategist Lead',
    subtitle:    'Líder Estratega de Contenido',
    icon:        Megaphone,
    gradient:    'from-violet-500 to-purple-600',
    lightBg:     'bg-violet-50 border-violet-200',
    badgeColor:  'bg-violet-100 text-violet-700',
    dot:         'bg-violet-500',
    modules:     ['crm'],
    description: 'Acceso al módulo de Marketing del CRM: campañas, segmentación y análisis de audiencia.',
  },
  atencion_cliente: {
    label:       'Customer Success Hero',
    subtitle:    'Héroe de Éxito del Cliente',
    icon:        HeartHandshake,
    gradient:    'from-rose-500 to-pink-600',
    lightBg:     'bg-rose-50 border-rose-200',
    badgeColor:  'bg-rose-100 text-rose-700',
    dot:         'bg-rose-500',
    modules:     ['crm', 'tenants'],
    description: 'Gestión de tickets de soporte, atención a clientes activos y resolución de incidencias.',
  },
  soporte_tecnico: {
    label:       'Systems Reliability Engineer',
    subtitle:    'Ingeniero de Confiabilidad de Sistemas',
    icon:        Wrench,
    gradient:    'from-amber-500 to-orange-600',
    lightBg:     'bg-amber-50 border-amber-200',
    badgeColor:  'bg-amber-100 text-amber-700',
    dot:         'bg-amber-500',
    modules:     ['logs', 'tenants'],
    description: 'Acceso a logs del sistema, monitoreo de tenants y soporte técnico de plataforma.',
  },
};

const MODULE_INFO = {
  tenants:       { label: 'Tenants',      icon: Building2,  desc: 'Ver y gestionar condominios' },
  suscripciones: { label: 'Suscripciones',icon: CreditCard, desc: 'Planes y pagos de suscripción' },
  crm:           { label: 'CRM Comercial',icon: Target,     desc: 'Contactos, pipeline, campañas y tickets' },
  logs:          { label: 'Logs',         icon: Activity,   desc: 'Logs y auditoría del sistema' },
  system_users:  { label: 'Usuarios Sistema', icon: Users,  desc: 'Gestión de usuarios internos' },
};

const DEFAULT_PERMISSIONS = (role) => {
  const profile = ROLE_PROFILES[role];
  if (!profile || role === 'super_admin') return {};
  return Object.fromEntries(
    profile.modules.map(m => [m, true])
  );
};

// ─── UI Atoms ─────────────────────────────────────────────────────────────────

function Modal({ title, onClose, children, wide = false }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className={`bg-white rounded-2xl shadow-2xl w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} max-h-[92vh] overflow-y-auto`}>
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
    primary:  'bg-gradient-to-r from-teal-500 to-emerald-500 text-white hover:from-teal-600 hover:to-emerald-600 shadow-sm',
    secondary:'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50',
    danger:   'bg-red-500 text-white hover:bg-red-600',
    ghost:    'text-slate-500 hover:text-slate-700 hover:bg-slate-100',
    indigo:   'bg-gradient-to-r from-indigo-500 to-violet-500 text-white hover:from-indigo-600 hover:to-violet-600',
  };
  const s = { sm: 'px-3 py-1.5 text-xs', md: 'px-4 py-2.5 text-sm', lg: 'px-6 py-3 text-sm' };
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      className={`inline-flex items-center gap-2 rounded-xl font-semibold transition-all ${v[variant]} ${s[size]} disabled:opacity-50 disabled:cursor-not-allowed`}>
      {children}
    </button>
  );
}

// ─── Role Card (compact selector) ─────────────────────────────────────────────

function RoleCard({ roleKey, selected, onSelect, currentUserRole }) {
  const p = ROLE_PROFILES[roleKey];
  const Icon = p.icon;
  // Restrict: only full super_admins can create another super_admin
  const restricted = roleKey === 'super_admin' && currentUserRole && currentUserRole !== 'super_admin';

  return (
    <button
      type="button"
      disabled={restricted}
      onClick={() => !restricted && onSelect(roleKey)}
      className={`w-full text-left p-4 rounded-2xl border-2 transition-all ${
        selected
          ? `${p.lightBg} border-current`
          : 'bg-white border-slate-100 hover:border-slate-300'
      } ${restricted ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <div className="flex items-start gap-3">
        <div className={`p-2.5 rounded-xl bg-gradient-to-br ${p.gradient} text-white flex-shrink-0`}>
          <Icon size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-bold text-slate-800">{p.label}</span>
            {selected && <CheckCircle size={16} className="text-teal-500 flex-shrink-0" />}
            {restricted && <Lock size={14} className="text-slate-400 flex-shrink-0" />}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">{p.subtitle}</p>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">{p.description}</p>
          <div className="flex flex-wrap gap-1 mt-2">
            {(p.modules || []).map(m => (
              <span key={m} className="text-xs px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded-md">
                {MODULE_INFO[m]?.label || m}
              </span>
            ))}
          </div>
        </div>
      </div>
    </button>
  );
}

// ─── User Form ────────────────────────────────────────────────────────────────

function UserForm({ initial = {}, onSave, onClose, loading, tenants = [], currentUserRole }) {
  const [form, setForm] = useState({
    name: '', email: '', system_role: 'ventas',
    system_permissions: {}, allowed_tenant_ids: [], ...initial,
  });
  const [showRoles, setShowRoles] = useState(true);
  const set = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }));

  const handleRoleSelect = (role) => {
    setForm(p => ({
      ...p,
      system_role: role,
      system_permissions: role === 'super_admin' ? {} : DEFAULT_PERMISSIONS(role),
    }));
  };

  const toggleModule = (mod) => {
    if (form.system_role === 'super_admin') return; // super_admin has all — no toggling
    setForm(p => ({
      ...p,
      system_permissions: { ...p.system_permissions, [mod]: !p.system_permissions[mod] },
    }));
  };

  const toggleTenant = (id) => {
    setForm(p => {
      const ids = p.allowed_tenant_ids || [];
      return {
        ...p,
        allowed_tenant_ids: ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id],
      };
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.system_role) {
      toast.error('Nombre, email y rol son requeridos');
      return;
    }
    onSave(form);
  };

  const profile = ROLE_PROFILES[form.system_role];

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Basic info */}
      <div className="grid grid-cols-2 gap-4">
        <Field label="Nombre completo" required>
          <input className={inputCls} value={form.name} onChange={set('name')} placeholder="Ana García" />
        </Field>
        <Field label="Email" required>
          <input className={inputCls} type="email" value={form.email} onChange={set('email')} placeholder="ana@homly.mx" disabled={!!initial.id} />
        </Field>
      </div>

      {/* Role selector */}
      <div>
        <button type="button" onClick={() => setShowRoles(p => !p)}
          className="flex items-center justify-between w-full mb-3 text-sm font-semibold text-slate-700">
          <span>Rol del Sistema <span className="text-red-500">*</span></span>
          {showRoles ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        {showRoles && (
          <div className="space-y-2.5">
            {Object.keys(ROLE_PROFILES).map(r => (
              <RoleCard
                key={r}
                roleKey={r}
                selected={form.system_role === r}
                onSelect={handleRoleSelect}
                currentUserRole={currentUserRole}
              />
            ))}
          </div>
        )}
      </div>

      {/* Module permissions (only for non super_admin) */}
      {form.system_role && form.system_role !== 'super_admin' && (
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-3">
            Permisos de módulos
          </label>
          <div className="grid grid-cols-1 gap-2">
            {Object.entries(MODULE_INFO).map(([modKey, modInfo]) => {
              const ModIcon = modInfo.icon;
              const enabled = !!form.system_permissions[modKey];
              return (
                <button
                  key={modKey}
                  type="button"
                  onClick={() => toggleModule(modKey)}
                  className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                    enabled
                      ? 'bg-teal-50 border-teal-300 text-teal-700'
                      : 'bg-slate-50 border-slate-200 text-slate-500'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <ModIcon size={14} />
                    <div className="text-left">
                      <div className="text-sm font-semibold">{modInfo.label}</div>
                      <div className="text-xs opacity-70">{modInfo.desc}</div>
                    </div>
                  </div>
                  {enabled
                    ? <ToggleRight size={20} className="text-teal-500 flex-shrink-0" />
                    : <ToggleLeft size={20} className="text-slate-300 flex-shrink-0" />
                  }
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Tenant access restriction */}
      {form.system_role && form.system_role !== 'super_admin' && tenants.length > 0 && (
        <div>
          <Field
            label="Tenants con acceso"
            hint={`Sin selección = acceso a todos. Seleccionados: ${(form.allowed_tenant_ids || []).length}`}
          >
            <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
              {tenants.slice(0, 100).map(t => {
                const sel = (form.allowed_tenant_ids || []).includes(String(t.id));
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => toggleTenant(String(t.id))}
                    className={`flex items-center gap-3 w-full px-3 py-2.5 text-left hover:bg-slate-50 transition-colors ${sel ? 'bg-teal-50' : ''}`}
                  >
                    <div className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 ${sel ? 'bg-teal-500' : 'border border-slate-300'}`}>
                      {sel && <Check size={10} className="text-white" />}
                    </div>
                    <span className="text-sm text-slate-700">{t.name}</span>
                  </button>
                );
              })}
            </div>
          </Field>
        </div>
      )}

      <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
        <Btn variant="secondary" onClick={onClose}>Cancelar</Btn>
        <Btn type="submit" disabled={loading}>
          {loading ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
          {initial.id ? 'Guardar cambios' : 'Crear usuario'}
        </Btn>
      </div>
    </form>
  );
}

// ─── Permissions Editor Modal ─────────────────────────────────────────────────

function PermissionsEditor({ user, tenants, onSave, onClose, loading }) {
  const [perms, setPerms] = useState({ ...user.system_permissions });
  const [tenantIds, setTenantIds] = useState([...(user.allowed_tenant_ids || [])]);

  const toggleModule = (k) => setPerms(p => ({ ...p, [k]: !p[k] }));
  const toggleTenant = (id) => setTenantIds(p =>
    p.includes(id) ? p.filter(x => x !== id) : [...p, id]
  );

  return (
    <div className="space-y-5">
      {/* Modules */}
      <div>
        <h4 className="text-sm font-semibold text-slate-700 mb-3">Módulos habilitados</h4>
        <div className="space-y-2">
          {Object.entries(MODULE_INFO).map(([k, m]) => {
            const Icon = m.icon;
            const on = !!perms[k];
            return (
              <button key={k} type="button" onClick={() => toggleModule(k)}
                className={`flex items-center justify-between w-full p-3 rounded-xl border transition-all ${on ? 'bg-teal-50 border-teal-300 text-teal-700' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
                <div className="flex items-center gap-2">
                  <Icon size={14} />
                  <span className="text-sm font-medium">{m.label}</span>
                </div>
                {on ? <ToggleRight size={20} className="text-teal-500" /> : <ToggleLeft size={20} className="text-slate-300" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tenants */}
      {tenants.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-slate-700 mb-1">
            Tenants con acceso
            <span className="ml-1.5 text-slate-400 font-normal">({tenantIds.length} seleccionados — vacío = todos)</span>
          </h4>
          <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
            {tenants.slice(0, 100).map(t => {
              const sel = tenantIds.includes(String(t.id));
              return (
                <button key={t.id} type="button" onClick={() => toggleTenant(String(t.id))}
                  className={`flex items-center gap-3 w-full px-3 py-2.5 text-left hover:bg-slate-50 transition-colors ${sel ? 'bg-teal-50' : ''}`}>
                  <div className={`w-4 h-4 rounded flex-shrink-0 flex items-center justify-center ${sel ? 'bg-teal-500' : 'border border-slate-300'}`}>
                    {sel && <Check size={10} className="text-white" />}
                  </div>
                  <span className="text-sm text-slate-700 truncate">{t.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
        <Btn variant="secondary" onClick={onClose}>Cancelar</Btn>
        <Btn onClick={() => onSave({ system_permissions: perms, allowed_tenant_ids: tenantIds })} disabled={loading}>
          {loading ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
          Guardar permisos
        </Btn>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SystemUsers({ currentUserRole }) {
  const queryClient = useQueryClient();
  const [search, setSearch]               = useState('');
  const [roleFilter, setRoleFilter]       = useState('');
  const [userModal, setUserModal]         = useState(null);
  const [permsModal, setPermsModal]       = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [tempPwd, setTempPwd]             = useState(null);
  const [loading, setLoading]             = useState(false);

  // Fetch system users
  const { data: users = [], isLoading, refetch } = useQuery({
    queryKey: ['system-users', search, roleFilter],
    queryFn: () => systemUsersAPI.list({
      search: search || undefined,
      system_role: roleFilter || undefined,
    }).then(r => {
      const d = r.data;
      return Array.isArray(d) ? d : (d?.results ?? []);
    }),
    staleTime: 60 * 1000,
  });

  // Fetch tenants for permission assignment
  const { data: allTenants = [] } = useQuery({
    queryKey: ['tenants-for-sysusr'],
    queryFn: () => tenantsListAPI().then(r => {
      const d = r.data;
      return Array.isArray(d) ? d : (d?.results ?? []);
    }),
    staleTime: 5 * 60 * 1000,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['system-users'] });

  // ── Save user ─────────────────────────────────────────────────────
  const handleSave = async (data) => {
    setLoading(true);
    try {
      if (userModal?.id) {
        await systemUsersAPI.update(userModal.id, {
          name: data.name,
          system_role: data.system_role,
          system_permissions: data.system_permissions,
          allowed_tenant_ids: data.allowed_tenant_ids,
        });
        toast.success('Usuario actualizado');
      } else {
        const res = await systemUsersAPI.create(data);
        // If the backend auto-generated a temp password, show it so the admin
        // can communicate it to the new user (same dialog as reset-password).
        if (res.data?.temp_password) {
          setTempPwd({
            name: data.name,
            email: data.email,
            pwd: res.data.temp_password,
            isNew: true,
          });
        } else {
          toast.success('Usuario del sistema creado');
        }
      }
      setUserModal(null);
      invalidate();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error al guardar usuario');
    } finally { setLoading(false); }
  };

  // ── Save permissions ──────────────────────────────────────────────
  const handleSavePerms = async (data) => {
    setLoading(true);
    try {
      await systemUsersAPI.updatePermissions(permsModal.id, data);
      toast.success('Permisos actualizados');
      setPermsModal(null);
      invalidate();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error al guardar permisos');
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

  // ── Reset password ────────────────────────────────────────────────
  const handleResetPwd = async (user) => {
    setLoading(true);
    try {
      const res = await systemUsersAPI.resetPassword(user.id);
      setTempPwd({ name: user.name, email: user.email, pwd: res.data.temp_password });
      invalidate();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error al restablecer contraseña');
    } finally { setLoading(false); }
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

  const roleStats = Object.entries(ROLE_PROFILES).map(([k, p]) => ({
    key: k, ...p,
    count: users.filter(u => u.system_role === k).length,
  }));

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-6 py-5">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <span className="bg-gradient-to-br from-slate-600 to-slate-800 text-white p-2 rounded-xl">
                <Users size={20} />
              </span>
              Usuarios del Sistema
            </h1>
            <p className="text-slate-500 text-sm mt-0.5">Equipo interno Homly · Solo SuperAdmin</p>
          </div>
          <Btn onClick={() => setUserModal('new')}>
            <Plus size={14} /> Nuevo usuario
          </Btn>
        </div>

        {/* Role stat cards */}
        <div className="grid grid-cols-5 gap-3">
          {roleStats.map(r => {
            const Icon = r.icon;
            return (
              <button key={r.key}
                onClick={() => setRoleFilter(roleFilter === r.key ? '' : r.key)}
                className={`flex items-center gap-3 p-3 rounded-2xl border-2 transition-all text-left ${
                  roleFilter === r.key
                    ? `${r.lightBg} border-current`
                    : 'bg-white border-slate-100 hover:border-slate-300'
                }`}>
                <div className={`p-2 rounded-xl bg-gradient-to-br ${r.gradient} text-white flex-shrink-0`}>
                  <Icon size={14} />
                </div>
                <div className="min-w-0">
                  <div className="text-lg font-bold text-slate-800">{r.count}</div>
                  <div className="text-xs text-slate-500 truncate">{r.label}</div>
                </div>
              </button>
            );
          })}
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
          {roleFilter && (
            <button onClick={() => setRoleFilter('')}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 text-slate-600 rounded-xl text-sm hover:bg-slate-200 transition-colors">
              <X size={12} /> Quitar filtro
            </button>
          )}
          <span className="text-sm text-slate-400 ml-auto">{users.length} usuario{users.length !== 1 ? 's' : ''}</span>
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
              <p className="text-slate-400 text-sm mb-6">Crea el primer usuario del equipo Homly</p>
              <Btn onClick={() => setUserModal('new')}><Plus size={14} /> Crear usuario</Btn>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  {['Usuario','Rol del Sistema','Módulos','Tenants asignados','Estado',''].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {users.map(u => {
                  const profile = ROLE_PROFILES[u.system_role] || {};
                  const Icon = profile.icon || Shield;
                  const mods = u.system_role === 'super_admin'
                    ? Object.keys(MODULE_INFO)
                    : Object.entries(u.system_permissions || {}).filter(([,v]) => v).map(([k]) => k);

                  return (
                    <tr key={u.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${profile.gradient || 'from-slate-400 to-slate-600'} flex items-center justify-center text-white flex-shrink-0 font-bold text-sm`}>
                            {u.name?.[0]?.toUpperCase()}
                          </div>
                          <div>
                            <div className="font-semibold text-slate-800">{u.name}</div>
                            <div className="text-xs text-slate-400">{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Icon size={13} className="text-slate-500" />
                          <div>
                            <div className="font-medium text-slate-700 text-xs">{profile.label || u.system_role}</div>
                            <div className="text-xs text-slate-400">{profile.subtitle}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {mods.length === 0
                            ? <span className="text-xs text-slate-400">Sin permisos</span>
                            : mods.map(m => (
                                <span key={m} className="text-xs px-1.5 py-0.5 bg-teal-50 text-teal-600 rounded-md font-medium">
                                  {MODULE_INFO[m]?.label || m}
                                </span>
                              ))
                          }
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs">
                        {u.system_role === 'super_admin'
                          ? <span className="text-slate-400 italic">Todos</span>
                          : u.allowed_tenants_data?.length > 0
                            ? <span>{u.allowed_tenants_data.length} tenant{u.allowed_tenants_data.length !== 1 ? 's' : ''}</span>
                            : <span className="text-slate-400 italic">Todos</span>
                        }
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${u.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${u.is_active ? 'bg-green-500' : 'bg-red-400'}`} />
                          {u.is_active ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          {u.system_role !== 'super_admin' && (
                            <button onClick={() => setPermsModal(u)}
                              className="p-1.5 rounded-lg hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 transition-colors" title="Editar permisos">
                              <Lock size={14} />
                            </button>
                          )}
                          <button onClick={() => setUserModal(u)}
                            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors" title="Editar usuario">
                            <Edit size={14} />
                          </button>
                          <button onClick={() => handleResetPwd(u)} disabled={loading}
                            className="p-1.5 rounded-lg hover:bg-amber-50 text-slate-400 hover:text-amber-600 transition-colors" title="Restablecer contraseña">
                            <KeyRound size={14} />
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
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Legend: role descriptions */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Object.entries(ROLE_PROFILES).map(([k, p]) => {
            const Icon = p.icon;
            return (
              <div key={k} className={`${p.lightBg} border rounded-2xl p-4`}>
                <div className="flex items-center gap-2.5 mb-2">
                  <div className={`p-2 rounded-lg bg-gradient-to-br ${p.gradient} text-white`}>
                    <Icon size={14} />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-slate-800">{p.label}</div>
                    <div className="text-xs text-slate-500">{p.subtitle}</div>
                  </div>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">{p.description}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Modals */}

      {userModal && (
        <Modal title={userModal === 'new' || !userModal?.id ? 'Nuevo Usuario del Sistema' : `Editar: ${userModal.name}`}
          onClose={() => setUserModal(null)} wide>
          <UserForm
            initial={userModal === 'new' ? {} : userModal}
            onSave={handleSave}
            onClose={() => setUserModal(null)}
            loading={loading}
            tenants={allTenants}
            currentUserRole={currentUserRole}
          />
        </Modal>
      )}

      {permsModal && (
        <Modal title={`Permisos: ${permsModal.name}`} onClose={() => setPermsModal(null)} wide>
          <PermissionsEditor
            user={permsModal}
            tenants={allTenants}
            onSave={handleSavePerms}
            onClose={() => setPermsModal(null)}
            loading={loading}
          />
        </Modal>
      )}

      {/* Temp password dialog */}
      {tempPwd && (
        <Modal title={tempPwd.isNew ? 'Usuario creado — contraseña inicial' : 'Contraseña restablecida'} onClose={() => setTempPwd(null)}>
          <div className="space-y-4 text-center">
            <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl">
              <KeyRound size={28} className="text-amber-500 mx-auto mb-2" />
              <p className="text-sm text-slate-700 font-medium">
                {tempPwd.isNew ? 'Contraseña inicial para ' : 'Contraseña temporal para '}
                <strong>{tempPwd.name}</strong>
              </p>
              <p className="text-xs text-slate-500 mt-0.5">{tempPwd.email}</p>
              <div className="mt-3 bg-white border border-amber-200 rounded-xl px-4 py-3 flex items-center justify-between gap-2">
                <code className="text-lg font-mono font-bold text-slate-800 tracking-wider">{tempPwd.pwd}</code>
                <button onClick={() => { navigator.clipboard.writeText(tempPwd.pwd); toast.success('Copiado'); }}
                  className="p-1.5 rounded-lg hover:bg-amber-50 text-amber-600 transition-colors">
                  <Copy size={14} />
                </button>
              </div>
              <p className="text-xs text-amber-600 mt-2 font-medium">El usuario deberá cambiar su contraseña en el próximo inicio de sesión.</p>
            </div>
            <Btn onClick={() => setTempPwd(null)}>Entendido</Btn>
          </div>
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
