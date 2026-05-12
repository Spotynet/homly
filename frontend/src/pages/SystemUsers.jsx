/**
 * SystemUsers.jsx — Administración de Usuarios del Sistema Homly
 * Solo disponible para SuperAdmin bajo el menú SISTEMA.
 *
 * Permite crear usuarios con roles y permisos de módulo personalizados.
 * El acceso es siempre mediante código de verificación por email (sin contraseña).
 */
import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import api, { tenantsAPI } from '../api/client';
import {
  Users, Plus, Edit, Trash2, RefreshCw, X, Check,
  Shield, Mail, Search, Eye, EyeOff,
  AlertCircle, ChevronDown, ChevronRight,
  Globe, CreditCard, Target, Activity, Lock,
} from 'lucide-react';
import toast from 'react-hot-toast';

// ─── Sistema Modules Definition ──────────────────────────────────────────────
// Each entry maps to a route in the superadmin "Sistema" nav section.
// tabs[] defines the sub-sections within each module page.

const SISTEMA_MODULES = [
  {
    id: 'tenants',
    label: 'Tenants',
    icon: Globe,
    tabs: [
      { id: 'info',     label: 'Información' },
      { id: 'payments', label: 'Pagos'        },
      { id: 'update',   label: 'Actualizar'   },
    ],
    hasTenantSelector: true, // this module allows per-user tenant filtering
  },
  {
    id: 'suscripciones',
    label: 'Suscripciones',
    icon: CreditCard,
    tabs: [
      { id: 'planes',        label: 'Planes'        },
      { id: 'solicitudes',   label: 'Solicitudes'   },
      { id: 'suscripciones', label: 'Suscripciones' },
    ],
  },
  {
    id: 'crm',
    label: 'CRM Comercial',
    icon: Target,
    tabs: [
      { id: 'dashboard', label: 'Dashboard' },
      { id: 'ventas',    label: 'Ventas'    },
      { id: 'marketing', label: 'Marketing' },
      { id: 'servicio',  label: 'Servicio'  },
    ],
  },
  {
    id: 'usuarios',
    label: 'Usuarios Sistema',
    icon: Users,
    tabs: [],
  },
  {
    id: 'logs',
    label: 'Logs del Sistema',
    icon: Activity,
    tabs: [],
  },
];

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
      <div className={`bg-white rounded-2xl shadow-2xl w-full ${wide ? 'max-w-2xl' : 'max-w-md'} max-h-[92vh] overflow-y-auto`}>
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

// ─── PermissionsGrid ──────────────────────────────────────────────────────────
// Renders the module + tab permission selector, plus tenant selector for the
// Tenants module.

function PermissionsGrid({ perms, onChange }) {
  const [expanded, setExpanded] = useState({});
  const [tenantSearch, setTenantSearch] = useState('');

  // Load tenant list for the per-user tenant selector
  const { data: tenantsList = [] } = useQuery({
    queryKey: ['tenants-for-perm-select'],
    queryFn: () => tenantsAPI.list().then(r => {
      const d = r.data;
      return Array.isArray(d) ? d : (d?.results ?? []);
    }),
    staleTime: 5 * 60 * 1000,
  });

  const filteredTenants = useMemo(() =>
    tenantsList.filter(t =>
      !tenantSearch ||
      (t.name || '').toLowerCase().includes(tenantSearch.toLowerCase())
    ), [tenantsList, tenantSearch]);

  // ── Module toggle ────────────────────────────────────────────────
  const toggleModule = (modId) => {
    const hasModule = perms.modules.includes(modId);
    const newModules = hasModule
      ? perms.modules.filter(m => m !== modId)
      : [...perms.modules, modId];

    const newTabs = { ...perms.module_tabs };
    if (hasModule) delete newTabs[modId];

    const newTenants = (hasModule && modId === 'tenants')
      ? []
      : perms.allowed_tenants;

    onChange({ ...perms, modules: newModules, module_tabs: newTabs, allowed_tenants: newTenants });
  };

  // ── Tab toggle ───────────────────────────────────────────────────
  const toggleTab = (modId, tabId) => {
    const current = perms.module_tabs[modId] || [];
    const hasTab = current.includes(tabId);
    onChange({
      ...perms,
      module_tabs: {
        ...perms.module_tabs,
        [modId]: hasTab ? current.filter(t => t !== tabId) : [...current, tabId],
      },
    });
  };

  const toggleAllTabs = (modId, allTabIds) => {
    const current = perms.module_tabs[modId] || [];
    const allSelected = allTabIds.every(t => current.includes(t));
    onChange({
      ...perms,
      module_tabs: {
        ...perms.module_tabs,
        [modId]: allSelected ? [] : [...allTabIds],
      },
    });
  };

  // ── Tenant toggle ────────────────────────────────────────────────
  const toggleTenant = (tenantId) => {
    const has = perms.allowed_tenants.includes(tenantId);
    onChange({
      ...perms,
      allowed_tenants: has
        ? perms.allowed_tenants.filter(t => t !== tenantId)
        : [...perms.allowed_tenants, tenantId],
    });
  };

  const selectAllTenants = () => {
    const allIds = tenantsList.map(t => t.id);
    const allSelected = allIds.length > 0 && allIds.every(id => perms.allowed_tenants.includes(id));
    onChange({ ...perms, allowed_tenants: allSelected ? [] : allIds });
  };

  const isSuperAdmin = perms.is_super_admin;

  return (
    <div className="space-y-3">

      {/* Super-admin toggle — grants full access */}
      <label className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100 transition-colors select-none">
        <input
          type="checkbox"
          className="w-4 h-4 accent-teal-600 flex-shrink-0"
          checked={isSuperAdmin}
          onChange={e => {
            const checked = e.target.checked;
            onChange({
              ...perms,
              is_super_admin: checked,
              modules: checked ? SISTEMA_MODULES.map(m => m.id) : perms.modules,
            });
          }}
        />
        <div className="flex items-center gap-2">
          <Shield size={14} className="text-slate-600" />
          <span className="text-sm font-semibold text-slate-800">Super Administrador</span>
        </div>
        <span className="ml-auto text-xs text-slate-400">Acceso completo</span>
      </label>

      {/* Custom module permissions — shown when NOT super admin */}
      {!isSuperAdmin && (
        <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
          {SISTEMA_MODULES.map(mod => {
            const isActive  = perms.modules.includes(mod.id);
            const isExpanded = !!expanded[mod.id];
            const modTabs   = perms.module_tabs[mod.id] || [];
            const allTabIds = mod.tabs.map(t => t.id);
            const allTabsSel = allTabIds.length > 0 && allTabIds.every(t => modTabs.includes(t));
            const tenantsAllSel = tenantsList.length > 0 &&
              tenantsList.every(t => perms.allowed_tenants.includes(t.id));

            return (
              <div key={mod.id} className={`transition-colors ${isActive ? 'bg-teal-50/40' : 'bg-white'}`}>

                {/* Module row */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <input
                    type="checkbox"
                    className="w-4 h-4 accent-teal-600 flex-shrink-0"
                    checked={isActive}
                    onChange={() => toggleModule(mod.id)}
                  />
                  <span className={`text-sm font-medium flex-1 ${isActive ? 'text-teal-800' : 'text-slate-700'}`}>
                    {mod.label}
                  </span>

                  {/* Expand/collapse tabs button */}
                  {isActive && mod.tabs.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setExpanded(p => ({ ...p, [mod.id]: !p[mod.id] }))}
                      className="flex items-center gap-1 text-xs text-teal-600 hover:text-teal-800 px-2 py-1 rounded-lg hover:bg-teal-100 transition-colors"
                    >
                      {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                      {modTabs.length === 0 ? 'Todos los tabs' : `${modTabs.length} tab${modTabs.length !== 1 ? 's' : ''}`}
                    </button>
                  )}
                  {!isActive && mod.tabs.length > 0 && (
                    <span className="text-xs text-slate-400">{mod.tabs.length} tabs</span>
                  )}
                </div>

                {/* Tab sub-permissions */}
                {isActive && isExpanded && mod.tabs.length > 0 && (
                  <div className="px-4 pb-3 pt-2 border-t border-teal-100/60 bg-white/70">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-xs font-medium text-slate-500">Tabs accesibles</span>
                      <button
                        type="button"
                        onClick={() => toggleAllTabs(mod.id, allTabIds)}
                        className="text-xs text-teal-600 hover:underline"
                      >
                        {allTabsSel ? 'Quitar todos' : 'Seleccionar todos'}
                      </button>
                      {modTabs.length === 0 && (
                        <span className="text-xs text-amber-600 ml-auto">Sin restricción de tabs</span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {mod.tabs.map(tab => {
                        const active = modTabs.includes(tab.id);
                        return (
                          <label
                            key={tab.id}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border cursor-pointer text-xs transition-colors select-none ${active ? 'bg-teal-100 border-teal-300 text-teal-800 font-medium' : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'}`}
                          >
                            <input
                              type="checkbox"
                              className="w-3 h-3 accent-teal-600"
                              checked={active}
                              onChange={() => toggleTab(mod.id, tab.id)}
                            />
                            {tab.label}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Per-user tenant selector — only for Tenants module */}
                {isActive && mod.hasTenantSelector && (
                  <div className="px-4 pb-3 pt-2 border-t border-teal-100/60 bg-white/70">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-medium text-slate-600">Tenants accesibles</span>
                      <button
                        type="button"
                        onClick={selectAllTenants}
                        className="text-xs text-teal-600 hover:underline"
                      >
                        {tenantsAllSel ? 'Quitar todos' : 'Todos'}
                      </button>
                      <span className="ml-auto text-xs text-slate-400">
                        {perms.allowed_tenants.length === 0
                          ? 'Sin restricción'
                          : `${perms.allowed_tenants.length} seleccionado${perms.allowed_tenants.length !== 1 ? 's' : ''}`}
                      </span>
                    </div>

                    {/* Tenant search */}
                    <div className="relative mb-2">
                      <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        className="w-full pl-7 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-teal-400 transition-colors"
                        placeholder="Buscar tenant..."
                        value={tenantSearch}
                        onChange={e => setTenantSearch(e.target.value)}
                      />
                    </div>

                    {/* Tenant list */}
                    <div className="max-h-40 overflow-y-auto divide-y divide-slate-50 border border-slate-100 rounded-lg bg-white">
                      {filteredTenants.length === 0 ? (
                        <div className="py-5 text-center text-xs text-slate-400">
                          {tenantsList.length === 0 ? 'Cargando tenants…' : 'Sin coincidencias'}
                        </div>
                      ) : filteredTenants.map(t => (
                        <label
                          key={t.id}
                          className={`flex items-center gap-2 px-3 py-2 cursor-pointer select-none hover:bg-slate-50 transition-colors ${perms.allowed_tenants.includes(t.id) ? 'bg-teal-50' : ''}`}
                        >
                          <input
                            type="checkbox"
                            className="w-3.5 h-3.5 accent-teal-600 flex-shrink-0"
                            checked={perms.allowed_tenants.includes(t.id)}
                            onChange={() => toggleTenant(t.id)}
                          />
                          <span className="text-xs text-slate-700 flex-1 truncate">{t.name}</span>
                          {t.plan_name && (
                            <span className="text-xs text-slate-400 flex-shrink-0">{t.plan_name}</span>
                          )}
                        </label>
                      ))}
                    </div>

                    {perms.allowed_tenants.length === 0 && (
                      <p className="text-xs text-amber-600 mt-1.5 flex items-center gap-1">
                        <AlertCircle size={11} />
                        Sin tenants seleccionados — el usuario verá todos los tenants
                      </p>
                    )}
                  </div>
                )}

              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── User Form ────────────────────────────────────────────────────────────────

function UserForm({ initial = {}, existingRoles = [], onSave, onClose, loading }) {
  const isEdit = !!initial.id;

  const [form, setForm] = useState({
    name:  initial.name  || '',
    email: initial.email || '',
  });

  // Role selector
  const initRoleMode = (initial.role_name && existingRoles.length > 0 &&
    existingRoles.includes(initial.role_name)) ? 'existing' : 'new';
  const [roleMode, setRoleMode] = useState(initRoleMode);
  const [roleName, setRoleName]     = useState(initial.role_name || 'Super Administrador');
  const [selectedRole, setSelectedRole] = useState(
    initial.role_name || (existingRoles.length > 0 ? existingRoles[0] : '')
  );

  // Permissions state — map backend fields (system_permissions / allowed_tenant_ids)
  // to the flat perms structure used by PermissionsGrid.
  const backendPerms = initial.system_permissions || {};
  const [perms, setPerms] = useState({
    is_super_admin:  initial.is_super_admin ?? true,
    modules:         backendPerms.modules      || SISTEMA_MODULES.map(m => m.id),
    module_tabs:     backendPerms.module_tabs  || {},
    allowed_tenants: initial.allowed_tenant_ids || [],
  });

  const set = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }));
  const finalRoleName = roleMode === 'existing' ? selectedRole : roleName;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name.trim())  { toast.error('El nombre completo es obligatorio'); return; }
    if (!form.email.trim()) { toast.error('El email es obligatorio'); return; }
    if (!finalRoleName.trim()) { toast.error('El nombre del rol es obligatorio'); return; }

    const payload = {
      name: form.name,
      ...(isEdit ? {} : { email: form.email }),
      role_name: finalRoleName,
      is_super_admin: perms.is_super_admin,
      permissions: perms.is_super_admin ? null : {
        modules:         perms.modules,
        module_tabs:     perms.module_tabs,
        allowed_tenants: perms.allowed_tenants,
      },
    };
    onSave(payload);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">

      {/* Info banner */}
      {!isEdit && (
        <div className="flex items-start gap-2.5 px-3 py-2.5 bg-teal-50 border border-teal-200 rounded-xl text-xs text-teal-700">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
          <span>
            El correo debe ser exclusivo — no puede estar registrado en ningún condominio ni perfil existente.
            El acceso es siempre mediante <strong>código de verificación por email</strong>, sin contraseña.
          </span>
        </div>
      )}

      {/* Name + Email */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Nombre completo" required>
          <input
            className={inputCls}
            value={form.name}
            onChange={set('name')}
            placeholder="Ana García"
          />
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

      {/* Divider */}
      <div className="border-t border-slate-100" />

      {/* Role */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-slate-700">
          Rol del usuario
        </label>

        {/* Mode toggle */}
        <div className="flex gap-2 mb-2">
          {[['new', 'Nuevo rol'], ['existing', 'Rol existente']].map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() => setRoleMode(mode)}
              className={`flex-1 py-2 px-3 rounded-xl text-sm font-medium border transition-colors ${roleMode === mode ? 'bg-teal-500 text-white border-teal-500' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {roleMode === 'new' ? (
          <input
            className={inputCls}
            value={roleName}
            onChange={e => setRoleName(e.target.value)}
            placeholder="Ej: Operador de Tenants, Analista CRM…"
          />
        ) : existingRoles.length > 0 ? (
          <select
            className={inputCls}
            value={selectedRole}
            onChange={e => setSelectedRole(e.target.value)}
          >
            {existingRoles.map(r => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        ) : (
          <div className="px-3 py-2.5 text-sm text-slate-400 bg-slate-50 border border-slate-200 rounded-xl">
            No hay roles existentes — crea uno nuevo
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="border-t border-slate-100" />

      {/* Permissions */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-slate-700">
          Permisos del sistema
          <span className="ml-2 text-xs text-slate-400 font-normal">Sección: Sistema</span>
        </label>
        <PermissionsGrid perms={perms} onChange={setPerms} />
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
        <Btn variant="secondary" onClick={onClose}>Cancelar</Btn>
        <Btn type="submit" disabled={loading}>
          {loading ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
          {isEdit ? 'Guardar cambios' : 'Crear usuario'}
        </Btn>
      </div>
    </form>
  );
}

// ─── Permission Badge ─────────────────────────────────────────────────────────

function PermBadge({ user }) {
  if (user.is_super_admin !== false) {
    return (
      <div className="flex items-center gap-1.5">
        <Shield size={12} className="text-slate-500" />
        <span className="text-xs font-medium text-slate-700">Acceso completo</span>
      </div>
    );
  }
  // Backend returns system_permissions; fall back to permissions for any local state
  const modules = (user.system_permissions || user.permissions || {}).modules || [];
  if (modules.length === 0) {
    return <span className="text-xs text-slate-400 italic">Sin módulos</span>;
  }
  const labels = modules.map(id => SISTEMA_MODULES.find(m => m.id === id)?.label || id);
  return (
    <div className="flex flex-wrap gap-1 max-w-xs">
      {labels.slice(0, 3).map(l => (
        <span key={l} className="px-1.5 py-0.5 bg-teal-50 text-teal-700 border border-teal-200 rounded text-xs">
          {l}
        </span>
      ))}
      {labels.length > 3 && (
        <span className="px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded text-xs">
          +{labels.length - 3} más
        </span>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SystemUsers() {
  const queryClient = useQueryClient();
  const { user: authUser } = useAuth();

  // Solo los usuarios con is_super_admin pueden crear / editar / eliminar usuarios del sistema.
  // Si el campo no existe en el objeto (usuarios legacy), se asume acceso completo.
  const canManageUsers = authUser?.is_super_admin !== false;

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

  // Derive unique role names from existing users for the "existing role" dropdown
  const existingRoles = useMemo(() => {
    const roles = users.map(u => u.role_name).filter(Boolean);
    return [...new Set(roles)];
  }, [users]);

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
    if (!canManageUsers) { toast.error('Sin permisos para gestionar usuarios'); return; }
    setLoading(true);
    try {
      if (userModal?.id) {
        // PATCH uses SystemUserSerializer: expects system_permissions + allowed_tenant_ids
        // directly (not nested under "permissions").
        const { permissions, ...rest } = data;
        const patchPayload = {
          ...rest,
          ...(data.is_super_admin
            ? { system_permissions: {}, allowed_tenant_ids: [] }
            : {
                system_permissions: {
                  modules:     permissions?.modules     || [],
                  module_tabs: permissions?.module_tabs || {},
                },
                allowed_tenant_ids: permissions?.allowed_tenants || [],
              }
          ),
        };
        await systemUsersAPI.update(userModal.id, patchPayload);
        toast.success('Usuario actualizado');
      } else {
        // POST uses SystemUserCreateSerializer: accepts { role_name, is_super_admin, permissions:{...} }
        await systemUsersAPI.create(data);
        toast.success('Usuario creado. Puede iniciar sesión con código de verificación por email.');
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
    if (!canManageUsers) { toast.error('Sin permisos para gestionar usuarios'); return; }
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
            <p className="text-slate-500 text-sm mt-0.5">Equipo interno Homly · Acceso por módulos y roles</p>
            {!canManageUsers && (
              <div className="flex items-center gap-1.5 mt-1.5 text-xs text-amber-600">
                <Lock size={11} />
                <span>Solo los <strong>Super Administradores</strong> pueden gestionar usuarios</span>
              </div>
            )}
          </div>
          {canManageUsers && (
            <Btn onClick={() => setUserModal('new')}>
              <Plus size={14} /> Nuevo Usuario
            </Btn>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-6">

        {/* Search + counter */}
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
            {users.length} usuario{users.length !== 1 ? 's' : ''}
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
              <p className="text-slate-400 text-sm mb-6">Crea el primer usuario del equipo Homly</p>
              {canManageUsers && (
                <Btn onClick={() => setUserModal('new')}><Plus size={14} /> Nuevo Usuario</Btn>
              )}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  {['Usuario', 'Rol', 'Permisos', 'Estado', ''].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {users.map(u => (
                  <tr key={u.id} className="hover:bg-slate-50/50 transition-colors">

                    {/* Usuario */}
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

                    {/* Rol */}
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 text-slate-700 rounded-full text-xs font-medium">
                        <Shield size={11} className="text-slate-500" />
                        {u.role_name || 'Super Administrador'}
                      </span>
                    </td>

                    {/* Permisos */}
                    <td className="px-4 py-3">
                      <PermBadge user={u} />
                    </td>

                    {/* Estado */}
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${u.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${u.is_active ? 'bg-green-500' : 'bg-red-400'}`} />
                        {u.is_active ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      {canManageUsers ? (
                        <div className="flex items-center gap-1 justify-end">
                          <button
                            onClick={() => setUserModal(u)}
                            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                            title="Editar usuario"
                          >
                            <Edit size={14} />
                          </button>
                          <button
                            onClick={() => handleToggleActive(u)}
                            className={`p-1.5 rounded-lg transition-colors ${u.is_active ? 'hover:bg-orange-50 text-slate-400 hover:text-orange-500' : 'hover:bg-green-50 text-slate-400 hover:text-green-600'}`}
                            title={u.is_active ? 'Desactivar' : 'Activar'}
                          >
                            {u.is_active ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                          <button
                            onClick={() => setConfirmDelete({ id: u.id, name: u.name })}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
                            title="Eliminar"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex justify-end">
                          <Lock size={13} className="text-slate-300" title="Sin permisos de gestión" />
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Modals ───────────────────────────────────────────────────────────── */}

      {userModal && (
        <Modal
          title={
            userModal === 'new' || !userModal?.id
              ? 'Nuevo Usuario del Sistema'
              : `Editar usuario: ${userModal.name}`
          }
          onClose={() => setUserModal(null)}
          wide
        >
          <UserForm
            initial={userModal === 'new' ? {} : userModal}
            existingRoles={existingRoles}
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
              <Btn variant="danger" disabled={loading} onClick={() => handleDelete(confirmDelete.id)}>
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
