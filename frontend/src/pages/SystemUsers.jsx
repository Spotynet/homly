/**
 * SystemUsers.jsx — Roles y Usuarios del Sistema Homly
 * Solo disponible para SuperAdmin bajo el menú SISTEMA.
 *
 * Tab "Roles"   — CRUD de roles reutilizables con selector de permisos por módulo y tab.
 * Tab "Usuarios" — CRUD de usuarios del sistema. Al crear un usuario se selecciona un rol
 *                  existente; si el rol incluye el módulo "Tenants" aparece el selector de tenants.
 */
import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import api, { tenantsAPI, systemRolesAPI } from '../api/client';
import {
  Users, Plus, Edit, Trash2, RefreshCw, X, Check,
  Shield, Mail, Search, Eye, EyeOff,
  AlertCircle, ChevronDown, ChevronRight,
  Globe, CreditCard, Target, Activity, Lock,
  ShieldCheck, Tag, UserCog, ChevronUp,
} from 'lucide-react';
import toast from 'react-hot-toast';

// ─── Sistema Modules Definition ──────────────────────────────────────────────
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
    hasTenantSelector: true,
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
    label: 'Roles y Usuarios',
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
const inputCls = 'w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400 transition-colors';

function Modal({ title, onClose, children, wide = false, extraWide = false }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className={`bg-white rounded-2xl shadow-2xl w-full ${extraWide ? 'max-w-3xl' : wide ? 'max-w-2xl' : 'max-w-md'} max-h-[92vh] overflow-y-auto`}>
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
    violet:    'bg-gradient-to-r from-violet-500 to-purple-500 text-white hover:from-violet-600 hover:to-purple-600 shadow-sm',
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
// Renders the module + tab permission selector.
// Used both in RoleForm and (read-only preview) in UserForm.

function PermissionsGrid({ perms, onChange, readOnly = false }) {
  const [expanded, setExpanded] = useState({});

  const toggleModule = (modId) => {
    if (readOnly) return;
    const hasModule = perms.modules.includes(modId);
    const newModules = hasModule
      ? perms.modules.filter(m => m !== modId)
      : [...perms.modules, modId];
    const newTabs = { ...perms.module_tabs };
    if (hasModule) delete newTabs[modId];
    onChange({ ...perms, modules: newModules, module_tabs: newTabs });
  };

  const toggleTab = (modId, tabId) => {
    if (readOnly) return;
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
    if (readOnly) return;
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

  const isSuperAdmin = perms.is_super_admin;

  return (
    <div className="space-y-3">
      {/* Super-admin toggle */}
      <label className={`flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl select-none ${readOnly ? 'cursor-default' : 'cursor-pointer hover:bg-slate-100 transition-colors'}`}>
        <input
          type="checkbox"
          className="w-4 h-4 accent-teal-600 flex-shrink-0"
          checked={isSuperAdmin}
          disabled={readOnly}
          onChange={e => {
            if (readOnly) return;
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

      {/* Custom module permissions */}
      {!isSuperAdmin && (
        <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
          {SISTEMA_MODULES.map(mod => {
            const isActive   = perms.modules.includes(mod.id);
            const isExpanded = !!expanded[mod.id];
            const modTabs    = perms.module_tabs[mod.id] || [];
            const allTabIds  = mod.tabs.map(t => t.id);
            const allTabsSel = allTabIds.length > 0 && allTabIds.every(t => modTabs.includes(t));
            const ModIcon    = mod.icon;

            return (
              <div key={mod.id} className={`transition-colors ${isActive ? 'bg-teal-50/40' : 'bg-white'}`}>
                {/* Module row */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <input
                    type="checkbox"
                    className="w-4 h-4 accent-teal-600 flex-shrink-0"
                    checked={isActive}
                    disabled={readOnly}
                    onChange={() => toggleModule(mod.id)}
                  />
                  <ModIcon size={14} className={isActive ? 'text-teal-600' : 'text-slate-400'} />
                  <span className={`text-sm font-medium flex-1 ${isActive ? 'text-teal-800' : 'text-slate-700'}`}>
                    {mod.label}
                  </span>
                  {isActive && mod.tabs.length > 0 && (
                    <button
                      type="button"
                      disabled={readOnly}
                      onClick={() => setExpanded(p => ({ ...p, [mod.id]: !p[mod.id] }))}
                      className="flex items-center gap-1 text-xs text-teal-600 hover:text-teal-800 px-2 py-1 rounded-lg hover:bg-teal-100 transition-colors"
                    >
                      {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
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
                      {!readOnly && (
                        <button type="button" onClick={() => toggleAllTabs(mod.id, allTabIds)}
                          className="text-xs text-teal-600 hover:underline">
                          {allTabsSel ? 'Quitar todos' : 'Seleccionar todos'}
                        </button>
                      )}
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
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs transition-colors select-none ${readOnly ? 'cursor-default' : 'cursor-pointer'} ${active ? 'bg-teal-100 border-teal-300 text-teal-800 font-medium' : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'}`}
                          >
                            <input
                              type="checkbox"
                              className="w-3 h-3 accent-teal-600"
                              checked={active}
                              disabled={readOnly}
                              onChange={() => toggleTab(mod.id, tab.id)}
                            />
                            {tab.label}
                          </label>
                        );
                      })}
                    </div>
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

// ─── TenantSelector ───────────────────────────────────────────────────────────
function TenantSelector({ allowedTenants, onChange }) {
  const [tenantSearch, setTenantSearch] = useState('');
  const { data: tenantsList = [] } = useQuery({
    queryKey: ['tenants-for-perm-select'],
    queryFn: () => tenantsAPI.list().then(r => {
      const d = r.data;
      return Array.isArray(d) ? d : (d?.results ?? []);
    }),
    staleTime: 5 * 60 * 1000,
  });

  const filtered = useMemo(() =>
    tenantsList.filter(t =>
      !tenantSearch || (t.name || '').toLowerCase().includes(tenantSearch.toLowerCase())
    ), [tenantsList, tenantSearch]);

  const allSel = tenantsList.length > 0 && tenantsList.every(t => allowedTenants.includes(t.id));

  const toggleTenant = (id) => {
    const has = allowedTenants.includes(id);
    onChange(has ? allowedTenants.filter(t => t !== id) : [...allowedTenants, id]);
  };

  return (
    <div className="mt-3 border border-slate-200 rounded-xl p-3 bg-slate-50 space-y-2">
      <div className="flex items-center gap-2">
        <Globe size={13} className="text-teal-600" />
        <span className="text-xs font-semibold text-slate-700">Tenants accesibles</span>
        <button type="button" onClick={() => onChange(allSel ? [] : tenantsList.map(t => t.id))}
          className="ml-auto text-xs text-teal-600 hover:underline">
          {allSel ? 'Quitar todos' : 'Todos'}
        </button>
        <span className="text-xs text-slate-400">
          {allowedTenants.length === 0 ? 'Sin restricción (todos)' : `${allowedTenants.length} seleccionado${allowedTenants.length !== 1 ? 's' : ''}`}
        </span>
      </div>
      <div className="relative">
        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input className="w-full pl-7 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-teal-400"
          placeholder="Buscar tenant..." value={tenantSearch} onChange={e => setTenantSearch(e.target.value)} />
      </div>
      <div className="max-h-36 overflow-y-auto divide-y divide-slate-50 border border-slate-100 rounded-lg bg-white">
        {filtered.length === 0 ? (
          <div className="py-4 text-center text-xs text-slate-400">
            {tenantsList.length === 0 ? 'Cargando tenants…' : 'Sin coincidencias'}
          </div>
        ) : filtered.map(t => (
          <label key={t.id}
            className={`flex items-center gap-2 px-3 py-2 cursor-pointer select-none hover:bg-slate-50 transition-colors ${allowedTenants.includes(t.id) ? 'bg-teal-50' : ''}`}>
            <input type="checkbox" className="w-3.5 h-3.5 accent-teal-600 flex-shrink-0"
              checked={allowedTenants.includes(t.id)} onChange={() => toggleTenant(t.id)} />
            <span className="text-xs text-slate-700 flex-1 truncate">{t.name}</span>
            {t.plan_name && <span className="text-xs text-slate-400 flex-shrink-0">{t.plan_name}</span>}
          </label>
        ))}
      </div>
      {allowedTenants.length === 0 && (
        <p className="text-xs text-amber-600 flex items-center gap-1">
          <AlertCircle size={11} /> Sin tenants seleccionados — el usuario verá todos los tenants
        </p>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
//  TAB 1: ROLES
// ═══════════════════════════════════════════════════════════

const EMPTY_ROLE_PERMS = { is_super_admin: false, modules: [], module_tabs: {} };

function RoleForm({ initial = {}, onSave, onClose, loading }) {
  const isEdit = !!initial.id;
  const [name,        setName]        = useState(initial.name        || '');
  const [description, setDescription] = useState(initial.description || '');
  const [perms,       setPerms]       = useState(() => {
    if (initial.is_super_admin) return { is_super_admin: true, modules: SISTEMA_MODULES.map(m => m.id), module_tabs: {} };
    const p = initial.permissions || {};
    return { is_super_admin: false, modules: p.modules || [], module_tabs: p.module_tabs || {} };
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) { toast.error('El nombre del rol es obligatorio'); return; }
    onSave({
      name: name.trim(),
      description: description.trim(),
      is_super_admin: perms.is_super_admin,
      permissions: perms.is_super_admin ? {} : { modules: perms.modules, module_tabs: perms.module_tabs },
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Nombre del rol" required>
          <input className={inputCls} value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Operador de Tenants" />
        </Field>
        <Field label="Descripción" hint="Opcional — ayuda a identificar el propósito del rol">
          <input className={inputCls} value={description} onChange={e => setDescription(e.target.value)} placeholder="Ej: Acceso solo a Tenants e información" />
        </Field>
      </div>

      <div className="border-t border-slate-100 pt-4">
        <label className="block text-sm font-semibold text-slate-700 mb-3">Permisos del rol</label>
        <PermissionsGrid perms={perms} onChange={setPerms} />
      </div>

      <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
        <Btn variant="secondary" onClick={onClose}>Cancelar</Btn>
        <Btn type="submit" variant="violet" disabled={loading}>
          {loading ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
          {isEdit ? 'Guardar rol' : 'Crear rol'}
        </Btn>
      </div>
    </form>
  );
}

function RoleCard({ role, onEdit, onDelete, canManage }) {
  const moduleLabels = role.is_super_admin
    ? ['Acceso completo']
    : (role.permissions?.modules || []).map(id => SISTEMA_MODULES.find(m => m.id === id)?.label || id);

  return (
    <div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`p-2 rounded-xl flex-shrink-0 ${role.is_super_admin ? 'bg-violet-100 text-violet-600' : 'bg-teal-50 text-teal-600'}`}>
            <Shield size={16} />
          </div>
          <div className="min-w-0">
            <div className="font-bold text-slate-800 text-sm truncate">{role.name}</div>
            {role.description && <div className="text-xs text-slate-400 truncate mt-0.5">{role.description}</div>}
          </div>
        </div>
        {canManage && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button onClick={() => onEdit(role)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors" title="Editar">
              <Edit size={13} />
            </button>
            <button onClick={() => onDelete(role)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors" title="Eliminar">
              <Trash2 size={13} />
            </button>
          </div>
        )}
      </div>

      {/* Modules */}
      <div className="flex flex-wrap gap-1.5">
        {moduleLabels.slice(0, 4).map(l => (
          <span key={l} className={`px-2 py-0.5 rounded-full text-xs font-medium border ${role.is_super_admin ? 'bg-violet-50 text-violet-700 border-violet-200' : 'bg-teal-50 text-teal-700 border-teal-200'}`}>
            {l}
          </span>
        ))}
        {moduleLabels.length > 4 && (
          <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full text-xs border border-slate-200">
            +{moduleLabels.length - 4} más
          </span>
        )}
        {moduleLabels.length === 0 && !role.is_super_admin && (
          <span className="text-xs text-slate-400 italic">Sin módulos asignados</span>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center gap-2 text-xs text-slate-400 border-t border-slate-50 pt-2 mt-1">
        <Users size={11} />
        <span>{role.users_count ?? 0} usuario{(role.users_count ?? 0) !== 1 ? 's' : ''} asignado{(role.users_count ?? 0) !== 1 ? 's' : ''}</span>
      </div>
    </div>
  );
}

function RolesTab({ canManage }) {
  const queryClient = useQueryClient();
  const [roleModal,   setRoleModal]   = useState(null);   // null | 'new' | role object
  const [deleteModal, setDeleteModal] = useState(null);
  const [search,      setSearch]      = useState('');
  const [saving,      setSaving]      = useState(false);

  const { data: roles = [], isLoading } = useQuery({
    queryKey: ['system-roles', search],
    queryFn: () => systemRolesAPI.list({ search: search || undefined })
      .then(r => { const d = r.data; return Array.isArray(d) ? d : (d?.results ?? []); }),
    staleTime: 60 * 1000,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['system-roles'] });

  const apiErr = (e, fb = 'Error al guardar rol') => {
    const d = e?.response?.data;
    if (!d) return fb;
    if (typeof d === 'string') return d;
    if (d.detail) return d.detail;
    const f = Object.values(d).find(v => Array.isArray(v) && v.length);
    return f ? f[0] : fb;
  };

  const handleSaveRole = async (data) => {
    setSaving(true);
    try {
      if (roleModal?.id) {
        await systemRolesAPI.update(roleModal.id, data);
        toast.success('Rol actualizado');
      } else {
        await systemRolesAPI.create(data);
        toast.success('Rol creado');
      }
      setRoleModal(null);
      invalidate();
    } catch (e) {
      toast.error(apiErr(e));
    } finally { setSaving(false); }
  };

  const handleDeleteRole = async () => {
    if (!deleteModal) return;
    setSaving(true);
    try {
      await systemRolesAPI.delete(deleteModal.id);
      toast.success('Rol eliminado');
      setDeleteModal(null);
      invalidate();
    } catch (e) {
      toast.error(apiErr(e, 'Error al eliminar rol'));
    } finally { setSaving(false); }
  };

  return (
    <>
      <div className="flex items-center gap-3 mb-5">
        <div className="relative flex-1 max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400"
            placeholder="Buscar roles..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <span className="text-sm text-slate-400 ml-auto">{roles.length} rol{roles.length !== 1 ? 'es' : ''}</span>
        {canManage && (
          <Btn variant="violet" onClick={() => setRoleModal('new')}>
            <Plus size={14} /> Nuevo Rol
          </Btn>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <RefreshCw size={24} className="animate-spin text-violet-500" />
        </div>
      ) : roles.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center bg-white rounded-2xl border border-slate-100 shadow-sm">
          <div className="p-4 rounded-2xl bg-violet-50 text-violet-300 mb-4"><Shield size={32} /></div>
          <p className="text-slate-600 font-semibold text-lg mb-1">Sin roles creados</p>
          <p className="text-slate-400 text-sm mb-6">Crea roles para poder asignarlos a los usuarios del sistema</p>
          {canManage && <Btn variant="violet" onClick={() => setRoleModal('new')}><Plus size={14} /> Nuevo Rol</Btn>}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {roles.map(r => (
            <RoleCard key={r.id} role={r} canManage={canManage}
              onEdit={setRoleModal} onDelete={setDeleteModal} />
          ))}
        </div>
      )}

      {/* Role modal */}
      {roleModal && (
        <Modal
          title={roleModal === 'new' ? 'Nuevo Rol' : `Editar rol: ${roleModal.name}`}
          onClose={() => setRoleModal(null)}
          extraWide
        >
          <RoleForm
            initial={roleModal === 'new' ? {} : roleModal}
            onSave={handleSaveRole}
            onClose={() => setRoleModal(null)}
            loading={saving}
          />
        </Modal>
      )}

      {/* Delete confirm */}
      {deleteModal && (
        <Modal title="Eliminar rol" onClose={() => setDeleteModal(null)}>
          <div className="text-center space-y-4">
            <div className="p-4 bg-red-50 rounded-2xl">
              <AlertCircle size={32} className="text-red-500 mx-auto mb-2" />
              <p className="text-slate-700 font-medium">¿Eliminar el rol <strong>{deleteModal.name}</strong>?</p>
              {deleteModal.users_count > 0 && (
                <p className="text-xs text-amber-600 mt-2 font-semibold">
                  ⚠ {deleteModal.users_count} usuario{deleteModal.users_count !== 1 ? 's tienen' : ' tiene'} este rol asignado.
                  Deberás reasignarlos antes de eliminar.
                </p>
              )}
              <p className="text-xs text-slate-400 mt-2">Esta acción no se puede deshacer.</p>
            </div>
            <div className="flex gap-3 justify-center">
              <Btn variant="secondary" onClick={() => setDeleteModal(null)}>Cancelar</Btn>
              <Btn variant="danger" disabled={saving} onClick={handleDeleteRole}>
                {saving ? <RefreshCw size={13} className="animate-spin" /> : <Trash2 size={13} />}
                Eliminar
              </Btn>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════
//  TAB 2: USUARIOS
// ═══════════════════════════════════════════════════════════

function UserForm({ initial = {}, roles = [], onSave, onClose, loading }) {
  const isEdit = !!initial.id;

  const [form, setForm] = useState({ name: initial.name || '', email: initial.email || '' });

  // Role selector — pick from existing SystemRole entities
  const initRole = roles.find(r => r.name === initial.role_name) || null;
  const [selectedRoleId, setSelectedRoleId] = useState(initRole ? String(initRole.id) : '');

  // Derived role object from selection
  const selectedRole = roles.find(r => String(r.id) === selectedRoleId) || null;

  // Tenant selector — shown when selected role includes 'tenants' module
  const roleHasTenants = selectedRole?.is_super_admin ||
    (selectedRole?.permissions?.modules || []).includes('tenants');
  const [allowedTenants, setAllowedTenants] = useState(initial.allowed_tenant_ids || []);

  const set = k => e => setForm(p => ({ ...p, [k]: e.target.value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name.trim())  { toast.error('El nombre completo es obligatorio'); return; }
    if (!form.email.trim()) { toast.error('El email es obligatorio'); return; }
    if (!selectedRoleId)    { toast.error('Selecciona un rol'); return; }

    const payload = {
      name:  form.name,
      ...(isEdit ? {} : { email: form.email }),
      role_id: Number(selectedRoleId),
      ...(roleHasTenants ? { allowed_tenant_ids: allowedTenants } : { allowed_tenant_ids: [] }),
    };
    onSave(payload);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
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
          <input className={inputCls} value={form.name} onChange={set('name')} placeholder="Ana García" />
        </Field>
        <Field label="Email" required>
          <input className={inputCls} type="email" value={form.email} onChange={set('email')}
            placeholder="ana@homly.mx" disabled={isEdit} />
        </Field>
      </div>

      <div className="border-t border-slate-100" />

      {/* Role selector */}
      <Field label="Rol asignado" required hint="El usuario heredará los permisos del rol seleccionado">
        {roles.length === 0 ? (
          <div className="px-3 py-3 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2">
            <AlertCircle size={14} />
            No hay roles creados. Ve al tab <strong>Roles</strong> y crea uno primero.
          </div>
        ) : (
          <select className={inputCls} value={selectedRoleId} onChange={e => setSelectedRoleId(e.target.value)}>
            <option value="">— Selecciona un rol —</option>
            {roles.map(r => (
              <option key={r.id} value={String(r.id)}>
                {r.name}{r.is_super_admin ? ' (Super Admin)' : ''}
              </option>
            ))}
          </select>
        )}
      </Field>

      {/* Role permissions preview */}
      {selectedRole && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Shield size={14} className="text-violet-500" />
            <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Permisos del rol</span>
            {selectedRole.description && (
              <span className="ml-auto text-xs text-slate-400 italic">{selectedRole.description}</span>
            )}
          </div>
          <PermissionsGrid
            perms={
              selectedRole.is_super_admin
                ? { is_super_admin: true, modules: SISTEMA_MODULES.map(m => m.id), module_tabs: {} }
                : { is_super_admin: false, modules: selectedRole.permissions?.modules || [], module_tabs: selectedRole.permissions?.module_tabs || {} }
            }
            onChange={() => {}}
            readOnly
          />
        </div>
      )}

      {/* Tenant selector — only if role has 'tenants' module */}
      {selectedRole && roleHasTenants && (
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Globe size={14} className="text-teal-500" />
            <span className="text-sm font-medium text-slate-700">Tenants accesibles</span>
          </div>
          <p className="text-xs text-slate-400 mb-2">
            El rol tiene acceso al módulo de Tenants. Selecciona a cuáles tendrá acceso este usuario.
          </p>
          <TenantSelector allowedTenants={allowedTenants} onChange={setAllowedTenants} />
        </div>
      )}

      <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
        <Btn variant="secondary" onClick={onClose}>Cancelar</Btn>
        <Btn type="submit" disabled={loading || roles.length === 0}>
          {loading ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
          {isEdit ? 'Guardar cambios' : 'Crear usuario'}
        </Btn>
      </div>
    </form>
  );
}

function PermBadge({ user }) {
  if (user.is_super_admin !== false) {
    return (
      <div className="flex items-center gap-1.5">
        <Shield size={12} className="text-violet-500" />
        <span className="text-xs font-medium text-violet-700">Acceso completo</span>
      </div>
    );
  }
  const modules = (user.system_permissions || {}).modules || [];
  if (modules.length === 0) return <span className="text-xs text-slate-400 italic">Sin módulos</span>;
  const labels = modules.map(id => SISTEMA_MODULES.find(m => m.id === id)?.label || id);
  return (
    <div className="flex flex-wrap gap-1 max-w-xs">
      {labels.slice(0, 3).map(l => (
        <span key={l} className="px-1.5 py-0.5 bg-teal-50 text-teal-700 border border-teal-200 rounded text-xs">{l}</span>
      ))}
      {labels.length > 3 && (
        <span className="px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded text-xs">+{labels.length - 3} más</span>
      )}
    </div>
  );
}

function UsersTab({ canManage }) {
  const queryClient = useQueryClient();
  const [search,         setSearch]         = useState('');
  const [userModal,      setUserModal]      = useState(null);
  const [confirmDelete,  setConfirmDelete]  = useState(null);
  const [loading,        setLoading]        = useState(false);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['system-users', search],
    queryFn: () => systemUsersAPI.list({ search: search || undefined })
      .then(r => { const d = r.data; return Array.isArray(d) ? d : (d?.results ?? []); }),
    staleTime: 60 * 1000,
  });

  // Fetch roles so UserForm can show the selector
  const { data: roles = [] } = useQuery({
    queryKey: ['system-roles'],
    queryFn: () => systemRolesAPI.list().then(r => { const d = r.data; return Array.isArray(d) ? d : (d?.results ?? []); }),
    staleTime: 60 * 1000,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['system-users'] });
    queryClient.invalidateQueries({ queryKey: ['system-roles'] }); // refresh users_count
  };

  const apiErr = (e, fb = 'Error al guardar usuario') => {
    const d = e?.response?.data;
    if (!d) return fb;
    if (typeof d === 'string') return d;
    if (d.detail) return d.detail;
    const f = Object.values(d).find(v => Array.isArray(v) && v.length);
    return f ? f[0] : fb;
  };

  const handleSave = async (data) => {
    if (!canManage) { toast.error('Sin permisos para gestionar usuarios'); return; }
    setLoading(true);
    try {
      if (userModal?.id) {
        await systemUsersAPI.update(userModal.id, data);
        toast.success('Usuario actualizado');
      } else {
        await systemUsersAPI.create(data);
        toast.success('Usuario creado. Puede iniciar sesión con código de verificación por email.');
      }
      setUserModal(null);
      invalidate();
    } catch (e) {
      toast.error(apiErr(e));
    } finally { setLoading(false); }
  };

  const handleToggleActive = async (user) => {
    try {
      await systemUsersAPI.toggleActive(user.id);
      toast.success(user.is_active ? 'Usuario desactivado' : 'Usuario activado');
      invalidate();
    } catch (e) { toast.error(e.response?.data?.detail || 'Error'); }
  };

  const handleDelete = async (id) => {
    if (!canManage) { toast.error('Sin permisos'); return; }
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

  return (
    <>
      <div className="flex items-center gap-3 mb-5">
        <div className="relative flex-1 max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400"
            placeholder="Buscar por nombre o email..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <span className="text-sm text-slate-400 ml-auto">{users.length} usuario{users.length !== 1 ? 's' : ''}</span>
        {canManage && (
          <Btn onClick={() => setUserModal('new')}>
            <Plus size={14} /> Nuevo Usuario
          </Btn>
        )}
      </div>

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
            {canManage && <Btn onClick={() => setUserModal('new')}><Plus size={14} /> Nuevo Usuario</Btn>}
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
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${u.is_super_admin !== false ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-700'}`}>
                      <Shield size={11} className={u.is_super_admin !== false ? 'text-violet-500' : 'text-slate-500'} />
                      {u.role_name || 'Super Administrador'}
                    </span>
                  </td>
                  <td className="px-4 py-3"><PermBadge user={u} /></td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${u.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${u.is_active ? 'bg-green-500' : 'bg-red-400'}`} />
                      {u.is_active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {canManage ? (
                      <div className="flex items-center gap-1 justify-end">
                        <button onClick={() => setUserModal(u)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors" title="Editar">
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
                    ) : (
                      <div className="flex justify-end">
                        <Lock size={13} className="text-slate-300" />
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* User modal */}
      {userModal && (
        <Modal
          title={userModal === 'new' ? 'Nuevo Usuario del Sistema' : `Editar usuario: ${userModal.name}`}
          onClose={() => setUserModal(null)}
          extraWide
        >
          <UserForm
            initial={userModal === 'new' ? {} : userModal}
            roles={roles}
            onSave={handleSave}
            onClose={() => setUserModal(null)}
            loading={loading}
          />
        </Modal>
      )}

      {/* Delete confirm */}
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
    </>
  );
}

// ═══════════════════════════════════════════════════════════
//  MAIN PAGE
// ═══════════════════════════════════════════════════════════

export default function SystemUsers() {
  const { user: authUser } = useAuth();
  const canManage = authUser?.is_super_admin !== false;

  const [activeTab, setActiveTab] = useState('roles'); // 'roles' | 'usuarios'

  const TABS = [
    { id: 'roles',    label: 'Roles',    icon: Shield,  color: 'violet' },
    { id: 'usuarios', label: 'Usuarios', icon: UserCog, color: 'teal'   },
  ];

  return (
    <div className="min-h-screen bg-slate-50">

      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <span className="bg-gradient-to-br from-violet-600 to-teal-600 text-white p-2 rounded-xl">
                <ShieldCheck size={20} />
              </span>
              Roles y Usuarios
            </h1>
            <p className="text-slate-500 text-sm mt-0.5">Equipo interno Homly · Gestión de roles y accesos</p>
            {!canManage && (
              <div className="flex items-center gap-1.5 mt-1.5 text-xs text-amber-600">
                <Lock size={11} />
                <span>Solo los <strong>Super Administradores</strong> pueden gestionar roles y usuarios</span>
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-4 bg-slate-100 rounded-xl p-1 w-fit">
          {TABS.map(tab => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                  active
                    ? tab.color === 'violet'
                      ? 'bg-white text-violet-700 shadow-sm'
                      : 'bg-white text-teal-700 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <Icon size={15} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {activeTab === 'roles'    && <RolesTab    canManage={canManage} />}
        {activeTab === 'usuarios' && <UsersTab    canManage={canManage} />}
      </div>

    </div>
  );
}
