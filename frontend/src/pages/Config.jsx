import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { tenantsAPI, extraFieldsAPI, assemblyAPI, usersAPI, unitsAPI, superAdminAPI, authAPI, periodsAPI } from '../api/client';
import { ROLE_BASE_MODULES } from '../constants/modulePermissions';
import { CURRENCIES, getStatesForCountry, COUNTRIES } from '../utils/helpers';
import AdminConfigTour from '../components/onboarding/AdminConfigTour';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Settings, Plus, Trash2, Check, X, Upload, Users,
  Building2, RefreshCw, Edit2, Search, Home, Lock, Pencil, UserCheck, Loader,
  Calendar, DollarSign, ShieldCheck, Receipt, ShoppingBag,
  AlertCircle, Shield, FileText, Globe, ChevronRight, TrendingUp,
  ShieldAlert, Mail, UserPlus, Bell, Layers, Eye, EyeOff,
  ListOrdered, ArrowUp, ArrowDown, CheckCircle2, Sparkles,
} from 'lucide-react';
import toast from 'react-hot-toast';

function fmt(n) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n ?? 0);
}

function periodLabel(p) {
  if (!p) return '—';
  const [y, m] = p.split('-');
  return new Date(+y, +m - 1, 1).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
}

const ROLE_META = {
  super_admin: { label: 'Super Admin',    color: 'var(--coral-500)', bg: 'var(--coral-50)',   desc: 'Acceso total al sistema y todos los condominios' },
  superadmin:  { label: 'Super Admin',    color: 'var(--coral-500)', bg: 'var(--coral-50)',   desc: 'Acceso total al sistema y todos los condominios' },
  admin:       { label: 'Administrador',  color: 'var(--teal-700)',  bg: 'var(--teal-50)',    desc: 'Gestión completa del condominio' },
  tesorero:    { label: 'Tesorero',       color: 'var(--blue-600)',  bg: 'var(--blue-50)',    desc: 'Cobranza, gastos y reportes financieros' },
  contador:    { label: 'Contador',       color: 'var(--blue-500)',  bg: 'var(--blue-50)',    desc: 'Lectura de reportes y gastos' },
  auditor:     { label: 'Auditor',        color: 'var(--amber-600)', bg: 'var(--amber-50)',   desc: 'Solo lectura del sistema' },
  vigilante:   { label: 'Vigilante',      color: 'var(--amber-600)', bg: 'var(--amber-50)',   desc: 'Solo lectura de unidades y residentes' },
  vecino:      { label: 'Vecino',         color: 'var(--ink-500)',   bg: 'var(--sand-100)',   desc: 'Acceso a su unidad y estado de cuenta' },
};

const TENANT_ROLES = ['admin','tesorero','contador','auditor','vigilante','vecino'];

// ── Default per-role reservation permissions ─────────────────────────────────
const DEFAULT_RESERVATION_ROLE_PERMS = {
  admin:     { can_request: true,  can_approve: true  },
  tesorero:  { can_request: true,  can_approve: true  },
  contador:  { can_request: false, can_approve: false },
  auditor:   { can_request: false, can_approve: false },
  vigilante: { can_request: true,  can_approve: false },
  vecino:    { can_request: true,  can_approve: false },
};

// ── Módulos del menú principal ───────────────────────────────────────────────
const MODULE_DEFINITIONS = [
  { key: 'dashboard',       label: 'Dashboard',           icon: Home,         desc: 'Panel principal con métricas del condominio' },
  { key: 'reservas',        label: 'Reservas',            icon: Calendar,     desc: 'Reserva de áreas comunes' },
  { key: 'cobranza',        label: 'Cobranza Mensual',    icon: Receipt,      desc: 'Registro y cobro de mantenimiento' },
  { key: 'gastos',          label: 'Gastos',              icon: ShoppingBag,  desc: 'Gestión de gastos y caja chica' },
  { key: 'estado_cuenta',   label: 'Estado de Cuenta',    icon: FileText,     desc: 'Reportes y movimientos financieros' },
  { key: 'plan_pagos',      label: 'Plan de Pagos',       icon: TrendingUp,   desc: 'Gestión de planes de pago para adeudos de unidades' },
  { key: 'cierre_periodo',  label: 'Cierre de Período',   icon: Lock,         desc: 'Cierre y flujo de aprobación de períodos contables' },
  { key: 'notificaciones',  label: 'Notificaciones',      icon: Bell,         desc: 'Centro de avisos y notificaciones' },
  { key: 'onboarding',      label: 'Guía de Inicio',      icon: Sparkles,     desc: 'Tour interactivo para configurar el tenant paso a paso' },
  { key: 'config',          label: 'Configuración',       icon: Settings,     desc: 'Configuración del condominio' },
  { key: 'my_unit',         label: 'Mi Unidad',           icon: Home,         desc: 'Vista de la unidad del residente (solo Vecino)' },
];

// ROLE_BASE_MODULES is now imported from '../constants/modulePermissions'

// ── Generic read-only field ───────────────────────────────────────────────────
function FieldView({ label, value, mono = false, children }) {
  const empty = !value && !children;
  return (
    <div className="field">
      <div className="field-label">{label}</div>
      {children
        ? <div className="field-value">{children}</div>
        : <div className={`field-value${empty ? ' empty' : ''}`} style={mono ? { fontFamily: 'monospace' } : {}}>
            {value || 'Sin datos'}
          </div>
      }
    </div>
  );
}

// ── Modal wrapper ─────────────────────────────────────────────────────────────
function Modal({ title, large, onClose, onSave, saveLabel = 'Guardar', saving, children }) {
  return (
    <div className="modal-bg open" onClick={onClose}>
      <div
        className={`modal${large ? ' lg' : ''}`}
        style={{ maxHeight:'92vh', display:'flex', flexDirection:'column' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-head" style={{ flexShrink:0 }}>
          <h3>{title}</h3>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body" style={{ overflowY:'auto', flex:1 }}>{children}</div>
        <div className="modal-foot" style={{ flexShrink:0 }}>
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={onSave} disabled={saving}>
            <Check size={14} /> {saving ? 'Guardando…' : saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Config() {
  const { tenantId, isAdmin, isSuperAdmin, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // ── Core state ────────────────────────────────────────────────────────────
  const [tab, setTab] = useState('general');
  const [tenant, setTenant] = useState(null);

  // ── Onboarding tour state ─────────────────────────────────────────────────
  const [tourOpen, setTourOpen] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const logoRef = useRef();

  // ── Data state ────────────────────────────────────────────────────────────
  const [fields, setFields] = useState([]);
  const [tenantUsers, setTenantUsers] = useState([]);
  const [positions, setPositions] = useState([]);
  const [committees, setCommittees] = useState([]);
  const [units, setUnits] = useState([]);

  // ── Modal states ──────────────────────────────────────────────────────────
  // Datos Fiscales edit
  const [editInfoOpen, setEditInfoOpen] = useState(false);
  const [editInfoForm, setEditInfoForm] = useState({});

  // Datos Generales edit (non-fiscal)
  const [editAddrOpen, setEditAddrOpen] = useState(false);
  const [editAddrForm, setEditAddrForm] = useState({});

  // General edit
  const [editGenOpen, setEditGenOpen] = useState(false);
  const [editGenForm, setEditGenForm] = useState({});

  // Unit modal + pagination (tab Unidades)
  const [unitSearch, setUnitSearch] = useState('');
  const [unitModal, setUnitModal] = useState(null);
  const [unitForm, setUnitForm] = useState({});
  const [unitsPage, setUnitsPage] = useState(1);
  const [unitsPageSize, setUnitsPageSize] = useState(25);
  const [unitsTotalCount, setUnitsTotalCount] = useState(0);
  const UNITS_PAGE_OPTIONS = [10, 25, 50, 100];
  // "Dar de alta" — create user from unit persona
  const [altaModal, setAltaModal] = useState(null); // { unit, persona } | null
  const [altaSaving, setAltaSaving] = useState(false);

  // Users pagination + search/filter/sort
  const [usersPage, setUsersPage] = useState(1);
  const [usersPageSize, setUsersPageSize] = useState(25);
  const USERS_PAGE_OPTIONS = [25, 50, 100];
  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState('all');
  const [userStatusFilter, setUserStatusFilter] = useState('all'); // 'all' | 'active' | 'pending'
  const [userSort, setUserSort] = useState({ col: 'name', dir: 'asc' });

  // Unit delete/inactivate modal
  const [unitActionModal, setUnitActionModal] = useState(null); // null | { unit, mode: 'confirm_delete' | 'has_records' }
  const [unitActionWorking, setUnitActionWorking] = useState(false);

  // Module permissions tab
  const [modulePerms,          setModulePerms]          = useState({});
  const [moduleSaving,         setModuleSaving]         = useState(false);
  const [reservationSettings,  setReservationSettings]  = useState({ approval_mode: 'require_vecinos' });
  const [customProfiles,       setCustomProfiles]       = useState([]);

  // Period closure flow configuration
  const [closureFlow,       setClosureFlow]       = useState({ enabled: false, steps: [] });
  const [closureFlowSaving, setClosureFlowSaving] = useState(false);
  const [addingFlowStep,    setAddingFlowStep]    = useState(false);
  const [newFlowStepUser,   setNewFlowStepUser]   = useState('');
  const [newFlowStepLabel,  setNewFlowStepLabel]  = useState('');

  // Custom profile modal
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [profileForm,      setProfileForm]      = useState(null); // null = closed; object = open
  const [profileSaving,    setProfileSaving]    = useState(false);

  // Field modal
  const [fieldForm, setFieldForm] = useState(null);
  const [cobCollapsed, setCobCollapsed] = useState(false);
  const [gasCollapsed, setGasCollapsed] = useState(false);

  // Área Común modal
  const [areaModalOpen, setAreaModalOpen] = useState(false);
  const [areaForm,      setAreaForm]      = useState({});
  const [areaSaving,    setAreaSaving]    = useState(false);

  // General tab collapse state
  const [genCollapsed,    setGenCollapsed]    = useState(false);
  const [fiscalCollapsed, setFiscalCollapsed] = useState(false);
  const [areasCollapsed,  setAreasCollapsed]  = useState(false);
  const [logoCollapsed,   setLogoCollapsed]   = useState(false);

  // User modal — create
  const [addUserOpen,           setAddUserOpen]           = useState(false);
  const [addUserForm,           setAddUserForm]            = useState({});
  const [addUserExisting,       setAddUserExisting]        = useState(null); // null|false|{id,name,email}
  const [addUserChecking,       setAddUserChecking]        = useState(false);
  const [showUserEmailConfirm,  setShowUserEmailConfirm]  = useState(false);
  const addUserEmailTimer = useRef(null);

  // User modal — edit
  const [editUserOpen, setEditUserOpen] = useState(false);
  const [editUserId,   setEditUserId]   = useState(null);
  const [editUserForm, setEditUserForm] = useState({});

  // Org modals
  const [cmtForm, setCmtForm] = useState(null);
  const [posForm, setPosForm] = useState(null);

  // Super Admin modal (Roles tab)
  const [addSAOpen, setAddSAOpen] = useState(false);
  const [addSAForm, setAddSAForm] = useState({});
  const [superAdmins, setSuperAdmins] = useState([]);

  // ── Loaders ───────────────────────────────────────────────────────────────
  const loadTenant = useCallback(() => {
    if (!tenantId) return Promise.resolve();
    setLoading(true);
    return tenantsAPI.get(tenantId)
      .then(r => { setTenant(r.data); setLoadError(null); })
      .catch(e => setLoadError(e.response?.data?.detail || 'No se pudo cargar la configuración'))
      .finally(() => setLoading(false));
  }, [tenantId]);

  const loadFields   = useCallback(() => { if (!tenantId) return; extraFieldsAPI.list(tenantId, { page_size: 9999 }).then(r => setFields(r.data.results || r.data)).catch(() => {}); }, [tenantId]);
  const loadUsers    = useCallback(() => { if (!tenantId) return; usersAPI.list(tenantId, { page_size: 9999 }).then(r => setTenantUsers(r.data.results || r.data)).catch(() => {}); }, [tenantId]);
  const loadUnits    = useCallback(() => {
    if (!tenantId) return;
    // Carga todas las unidades; la paginación y búsqueda se manejan client-side
    unitsAPI.list(tenantId, { page_size: 9999 }).then(r => {
      const data = r.data;
      const items = data.results ?? data;
      setUnits(Array.isArray(items) ? items : []);
    }).catch(() => {});
  }, [tenantId]);
  const loadAssembly = useCallback(() => {
    if (!tenantId) return;
    assemblyAPI.positions(tenantId).then(r => setPositions(r.data.results || r.data)).catch(() => {});
    assemblyAPI.committees(tenantId).then(r => setCommittees(r.data.results || r.data)).catch(() => {});
  }, [tenantId]);

  const loadSuperAdmins = useCallback(() => {
    if (!isSuperAdmin) return;
    superAdminAPI.list().then(r => setSuperAdmins(r.data.results || r.data)).catch(() => {});
  }, [isSuperAdmin]);

  useEffect(() => {
    setTenant(null); setLoadError(null);
    loadTenant(); loadFields(); loadUsers(); loadUnits(); loadAssembly(); loadSuperAdmins();
  }, [loadTenant, loadFields, loadUsers, loadUnits, loadAssembly, loadSuperAdmins]);

  // Sync modulePerms + reservationSettings + customProfiles + closureFlow whenever tenant data changes
  useEffect(() => {
    if (tenant) {
      setModulePerms(tenant.module_permissions || {});
      setReservationSettings(tenant.reservation_settings || { approval_mode: 'require_vecinos' });
      setCustomProfiles(Array.isArray(tenant.custom_profiles) ? tenant.custom_profiles : []);
      const cf = tenant.closure_flow || {};
      setClosureFlow({ enabled: cf.enabled || false, steps: Array.isArray(cf.steps) ? cf.steps : [] });
    }
  }, [tenant]);

  // ── Auto-launch onboarding tour for admin if never completed ──────────────
  useEffect(() => {
    if (!tenant || !isAdmin) return;
    // Query param forces tour: /app/config?tour=1
    const params = new URLSearchParams(location.search);
    const forced = params.get('tour') === '1';
    if (forced) {
      setTourOpen(true);
      // Clean query param from URL
      navigate('/app/config', { replace: true });
      return;
    }
    // Auto-launch once: not completed AND never dismissed before
    if (!tenant.onboarding_completed && !tenant.onboarding_dismissed_at) {
      // Small delay so the page renders first
      const t = setTimeout(() => setTourOpen(true), 400);
      return () => clearTimeout(t);
    }
  }, [tenant, isAdmin, location.search, navigate]);

  // ── Save helpers ──────────────────────────────────────────────────────────
  const savePatch = async (data, onDone) => {
    setSaving(true);
    try {
      await tenantsAPI.update(tenantId, data);
      toast.success('Guardado correctamente');
      loadTenant();
      onDone?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error al guardar');
    } finally { setSaving(false); }
  };

  const handleLogoUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error('El logo debe ser menor a 2 MB'); return; }
    const reader = new FileReader();
    reader.onload = ev => savePatch({ logo: ev.target.result });
    reader.readAsDataURL(file);
  };

  const saveField = async () => {
    try {
      if (fieldForm.id) await extraFieldsAPI.update(tenantId, fieldForm.id, fieldForm);
      else await extraFieldsAPI.create(tenantId, { ...fieldForm, tenant: tenantId });
      toast.success('Campo guardado');
      setFieldForm(null);
      loadFields();
    } catch (e) { toast.error(e.response?.data?.detail || 'Error al guardar campo'); }
  };

  const toggleField = async (id, patch) => {
    if (!isAdmin) return;
    const f = fields.find(x => x.id === id);
    if (!f) return;
    try { await extraFieldsAPI.update(tenantId, id, { ...f, ...patch }); loadFields(); }
    catch { toast.error('Error'); }
  };

  const savePosition = async () => {
    try {
      const payload = {
        title: posForm.title || posForm.name,
        holder_name: posForm.holder_name || posForm.member_name || '',
        holder_unit: posForm.holder_unit || null,
        committee_id: posForm.committee_id || null,
        email: posForm.email || '',
        phone: posForm.phone || '',
        start_date: posForm.start_date || '',
        end_date: posForm.end_date || '',
        notes: posForm.notes || '',
      };
      if (posForm.id) {
        await assemblyAPI.updatePosition(tenantId, posForm.id, payload);
      } else {
        await assemblyAPI.createPosition(tenantId, { ...payload, tenant: tenantId });
      }
      toast.success('Cargo guardado'); setPosForm(null); loadAssembly();
    } catch { toast.error('Error'); }
  };

  const saveCommittee = async () => {
    try {
      const payload = { name: cmtForm.name, description: cmtForm.description || '', exemption: !!cmtForm.exemption, members: cmtForm.members || '' };
      if (cmtForm.id) {
        await assemblyAPI.updateCommittee(tenantId, cmtForm.id, payload);
      } else {
        await assemblyAPI.createCommittee(tenantId, { ...payload, tenant: tenantId });
      }
      toast.success(cmtForm.id ? 'Comité actualizado' : 'Comité creado');
      setCmtForm(null); loadAssembly();
    } catch { toast.error('Error'); }
  };

  // ── Área Común helpers ───────────────────────────────────────────────────
  const openNewArea = () => {
    setAreaForm({
      id: crypto.randomUUID(),
      name: '',
      active: true,
      reservations_enabled: false,
      charge_enabled: false,
      charge_amount: 0,
      usage_policy: '',
      reservation_policy: '',
      _isNew: true,
    });
    setAreaModalOpen(true);
  };

  const openEditArea = (area) => {
    setAreaForm({ ...area, _isNew: false });
    setAreaModalOpen(true);
  };

  const saveArea = async () => {
    if (!areaForm.name?.trim()) return toast.error('El nombre del área es obligatorio');
    setAreaSaving(true);
    try {
      const current = Array.isArray(tenant?.common_areas) ? tenant.common_areas : [];
      let updated;
      if (areaForm._isNew) {
        const { _isNew, ...clean } = areaForm;
        updated = [...current, clean];
      } else {
        const { _isNew, ...clean } = areaForm;
        updated = current.map(a => a.id === clean.id ? clean : a);
      }
      await savePatch({ common_areas: updated });
      setAreaModalOpen(false);
    } finally { setAreaSaving(false); }
  };

  const deleteArea = async (areaId) => {
    if (!window.confirm('¿Eliminar esta área común?')) return;
    const current = Array.isArray(tenant?.common_areas) ? tenant.common_areas : [];
    await savePatch({ common_areas: current.filter(a => a.id !== areaId) });
  };

  const toggleAreaField = async (areaId, field, value) => {
    const current = Array.isArray(tenant?.common_areas) ? tenant.common_areas : [];
    await savePatch({ common_areas: current.map(a => a.id === areaId ? { ...a, [field]: value } : a) });
  };

  const saveSuperAdmin = async () => {
    if (!addSAForm.name || !addSAForm.email || !addSAForm.password) return toast.error('Todos los campos son obligatorios');
    try {
      await superAdminAPI.create({ ...addSAForm, role: 'super_admin', is_super_admin: true });
      toast.success('Super Admin creado'); setAddSAOpen(false); setAddSAForm({}); loadSuperAdmins();
    } catch (e) { toast.error(e.response?.data?.detail || e.response?.data?.email?.[0] || 'Error al crear'); }
  };

  const deleteSuperAdmin = async (id) => {
    if (!window.confirm('¿Eliminar este Super Administrador?')) return;
    try { await superAdminAPI.delete(id); toast.success('Eliminado'); loadSuperAdmins(); }
    catch { toast.error('Error al eliminar'); }
  };

  const handleUnitSave = async () => {
    if (!unitForm.unit_name || !unitForm.unit_id_code) return toast.error('Nombre e ID son obligatorios');
    try {
      const payload = {
        unit_name: unitForm.unit_name,
        unit_id_code: unitForm.unit_id_code,
        occupancy: unitForm.occupancy || 'propietario',
        previous_debt: parseFloat(unitForm.previous_debt) || 0,
        previous_debt_evidence: unitForm.previous_debt_evidence || '',
        credit_balance: parseFloat(unitForm.credit_balance) || 0,
        admin_exempt: !!unitForm.admin_exempt,
        owner_first_name: unitForm.owner_first_name || '',
        owner_last_name: unitForm.owner_last_name || '',
        owner_email: unitForm.owner_email || '',
        owner_phone: unitForm.owner_phone || '',
        coowner_first_name: unitForm.coowner_first_name || '',
        coowner_last_name: unitForm.coowner_last_name || '',
        coowner_email: unitForm.coowner_email || '',
        coowner_phone: unitForm.coowner_phone || '',
        tenant_first_name: unitForm.tenant_first_name || '',
        tenant_last_name: unitForm.tenant_last_name || '',
        tenant_email: unitForm.tenant_email || '',
        tenant_phone: unitForm.tenant_phone || '',
      };
      if (unitModal === 'add') {
        await unitsAPI.create(tenantId, { ...payload, tenant: tenantId });
      } else {
        await unitsAPI.update(tenantId, unitForm.id, payload);
      }
      toast.success(unitModal === 'add' ? 'Unidad creada' : 'Unidad actualizada');
      setUnitModal(null);
      if (unitModal === 'add') setUnitsPage(1);
      loadUnits();
    } catch (e) { toast.error(e.response?.data?.unit_id_code?.[0] || 'Error guardando unidad'); }
  };

  const handleUnitDelete = async (unit) => {
    // Try hard delete; backend returns 400 if unit has records → show inactivate modal instead
    setUnitActionModal({ unit, mode: 'confirm_delete' });
  };

  const confirmUnitDelete = async () => {
    if (!unitActionModal) return;
    setUnitActionWorking(true);
    try {
      await unitsAPI.delete(tenantId, unitActionModal.unit.id);
      toast.success('Unidad eliminada');
      setUnitActionModal(null);
      loadUnits();
    } catch (e) {
      const code = e?.response?.data?.code || e?.response?.data?.[0]?.code;
      if (code === 'has_records' || e?.response?.status === 400) {
        // Has payment history — switch to inactivate offer
        setUnitActionModal(prev => ({ ...prev, mode: 'has_records' }));
      } else {
        toast.error(e?.response?.data?.detail || 'Error eliminando unidad');
        setUnitActionModal(null);
      }
    } finally {
      setUnitActionWorking(false);
    }
  };

  const confirmUnitInactivate = async () => {
    if (!unitActionModal) return;
    setUnitActionWorking(true);
    try {
      await unitsAPI.inactivate(tenantId, unitActionModal.unit.id);
      toast.success('Unidad inactivada — historial conservado en solo lectura');
      setUnitActionModal(null);
      loadUnits();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Error inactivando unidad');
    } finally {
      setUnitActionWorking(false);
    }
  };

  const handleUnitActivate = async (unit) => {
    try {
      await unitsAPI.activate(tenantId, unit.id);
      toast.success('Unidad reactivada');
      loadUnits();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Error reactivando unidad');
    }
  };

  const handleUnitCreateUser = async () => {
    if (!altaModal) return;
    setAltaSaving(true);
    try {
      const res = await unitsAPI.createUser(tenantId, altaModal.unit.id, altaModal.persona);
      const msg = res.status === 201
        ? 'Usuario creado y dado de alta como vecino.'
        : 'El usuario ya existe y fue asociado al condominio.';
      toast.success(msg);
      setAltaModal(null);
      loadUsers();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error al dar de alta al usuario');
    } finally {
      setAltaSaving(false);
    }
  };

  // ── Module permissions helpers ─────────────────────────────────────────────
  // Levels: "write" (visible+leer+escribir) | "read" (visible+leer) | "hidden" (sin acceso)
  // Backward-compatible: old format was {role: [moduleKeys]} — treated as "write" for listed keys.

  const getModuleAccess = (roleKey, moduleKey) => {
    const base = ROLE_BASE_MODULES[roleKey] || [];
    if (!base.includes(moduleKey)) return 'na'; // not applicable for this role
    const perms = modulePerms[roleKey];
    if (perms === undefined) return 'write'; // no config → full access by default
    if (Array.isArray(perms))                // old array format → backward compat
      return perms.includes(moduleKey) ? 'write' : 'hidden';
    return perms[moduleKey] ?? 'write';      // new object format, default write
  };

  const setModuleAccess = (roleKey, moduleKey, level) => {
    const base = ROLE_BASE_MODULES[roleKey] || [];
    if (!base.includes(moduleKey)) return;
    setModulePerms(prev => {
      // Migrate old array format on first edit
      const current = prev[roleKey];
      const normalized = Array.isArray(current)
        ? Object.fromEntries(base.map(k => [k, current.includes(k) ? 'write' : 'hidden']))
        : (current || {});
      return { ...prev, [roleKey]: { ...normalized, [moduleKey]: level } };
    });
  };

  // ── Update a per-role reservation permission (can_request / can_approve) ─────
  const updateReservationRolePerm = (roleKey, permKey, value) => {
    setReservationSettings(s => {
      const current  = s.role_permissions || {};
      const existing = current[roleKey] ?? DEFAULT_RESERVATION_ROLE_PERMS[roleKey] ?? { can_request: false, can_approve: false };
      return {
        ...s,
        role_permissions: { ...current, [roleKey]: { ...existing, [permKey]: value } },
      };
    });
  };

  const saveModulePermissions = async () => {
    setModuleSaving(true);
    try {
      await tenantsAPI.update(tenantId, {
        module_permissions:   modulePerms,
        reservation_settings: reservationSettings,
        custom_profiles:      customProfiles,
      });
      setTenant(prev => ({
        ...prev,
        module_permissions:   modulePerms,
        reservation_settings: reservationSettings,
        custom_profiles:      customProfiles,
      }));
      toast.success('Configuración de módulos guardada');
    } catch { toast.error('Error guardando configuración de módulos'); }
    finally { setModuleSaving(false); }
  };

  const handleAddUserEmailChange = (val) => {
    setAddUserForm(f => ({ ...f, email: val }));
    setAddUserExisting(null);
    clearTimeout(addUserEmailTimer.current);
    if (!val || !val.includes('@')) return;
    addUserEmailTimer.current = setTimeout(async () => {
      setAddUserChecking(true);
      try {
        const { data } = await authAPI.checkEmail(val.trim());
        setAddUserExisting(data.exists ? data : false);
      } catch { setAddUserExisting(false); }
      finally  { setAddUserChecking(false); }
    }, 500);
  };

  const saveUser = () => {
    if (!addUserForm.email) return toast.error('El email es obligatorio');
    // Only require name for genuinely new users (not existing ones being added to tenant)
    const isExistingUser = addUserExisting && addUserExisting.id;
    if (!isExistingUser && !addUserForm.name?.trim()) return toast.error('El nombre es obligatorio');
    if (!addUserForm.role) return toast.error('El rol es obligatorio');
    if (addUserForm.role === 'vecino' && !addUserForm.unit_id)
      return toast.error('Los vecinos deben tener una unidad asignada');
    // For new users show email confirmation; for existing users proceed directly
    if (!isExistingUser) {
      setShowUserEmailConfirm(true);
    } else {
      doCreateUser();
    }
  };

  const doCreateUser = async () => {
    const isExistingUser = addUserExisting && addUserExisting.id;
    setShowUserEmailConfirm(false);
    try {
      const payload = {
        email:     addUserForm.email.trim(),
        role:      addUserForm.role,
        tenant_id: tenantId,
        unit_id:   addUserForm.role === 'vecino' && addUserForm.unit_id ? addUserForm.unit_id : null,
      };
      if (!isExistingUser) {
        payload.name = addUserForm.name.trim();
      }
      await usersAPI.create(payload);
      toast.success(isExistingUser ? `${addUserExisting.name} agregado al condominio` : 'Usuario creado y bienvenida enviada por email');
      setAddUserOpen(false);
      setAddUserForm({});
      setAddUserExisting(null);
      setTab('users');
      loadUsers();
    } catch (e) { toast.error(e.response?.data?.detail || e.response?.data?.non_field_errors?.[0] || e.response?.data?.email?.[0] || 'Error al guardar usuario'); }
  };

  const openEditUser = (u) => {
    setEditUserId(u.id);
    setEditUserForm({ name: u.user_name || '', role: u.role || 'vecino', unit_id: u.unit || '', profile_id: u.profile_id || '' });
    setEditUserOpen(true);
  };

  const saveEditUser = async () => {
    if (!editUserForm.name?.trim())
      return toast.error('El nombre es obligatorio');
    // Vecinos always require a unit, regardless of whether a custom profile is set
    if (editUserForm.role === 'vecino' && !editUserForm.unit_id)
      return toast.error('Los vecinos deben tener una unidad asignada');
    try {
      await usersAPI.update(tenantId, editUserId, {
        name:       editUserForm.name.trim(),
        role:       editUserForm.role,
        unit:       editUserForm.role === 'vecino' ? (editUserForm.unit_id || null) : null,
        profile_id: editUserForm.profile_id || '',
      });
      toast.success('Usuario actualizado');
      setEditUserOpen(false);
      setEditUserId(null);
      setEditUserForm({});
      loadUsers();
    } catch (e) { toast.error(e.response?.data?.detail || 'Error al actualizar usuario'); }
  };

  // ── Guards ────────────────────────────────────────────────────────────────
  if (!tenantId) return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:'40vh', gap:12 }}>
      <Building2 size={40} color="var(--ink-200)" />
      <p style={{ fontWeight:700, color:'var(--ink-700)', fontSize:16 }}>Sin condominio seleccionado</p>
    </div>
  );

  if (!tenant && !loadError) return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:'40vh', gap:16 }}>
      <div style={{ width:36, height:36, borderRadius:'50%', border:'3px solid var(--sand-100)', borderTopColor:'var(--teal-400)', animation:'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <p style={{ color:'var(--ink-400)', fontSize:14 }}>Cargando configuración…</p>
    </div>
  );

  if (loadError && !tenant) return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:'40vh', gap:14 }}>
      <p style={{ fontWeight:700, color:'var(--ink-800)' }}>No se pudo cargar</p>
      <p style={{ color:'var(--ink-400)', fontSize:13 }}>{loadError}</p>
      <button className="btn btn-secondary btn-sm" onClick={loadTenant}><RefreshCw size={13} /> Reintentar</button>
    </div>
  );

  const t = tenant || {};
  const fiscal = !t.operation_type || t.operation_type === 'fiscal';
  const reqCobFields = fields.filter(f => f.enabled && f.required && (!f.field_type || f.field_type === 'normal'));
  const totalMonthly = parseFloat(t.maintenance_fee || 0) + reqCobFields.reduce((s, f) => s + parseFloat(f.default_amount || 0), 0);
  const filteredUnits = units.filter(u =>
    `${u.unit_name} ${u.unit_id_code} ${u.owner_first_name} ${u.owner_last_name} ${u.tenant_first_name||''} ${u.tenant_last_name||''}`.toLowerCase().includes(unitSearch.toLowerCase())
  );
  const pagedUnits = filteredUnits.slice((unitsPage - 1) * unitsPageSize, unitsPage * unitsPageSize);

  const tabs = [
    { key: 'general',  label: 'General' },
    { key: 'units',    label: 'Unidades' },
    { key: 'fields',   label: 'Gastos y Cobranza' },
    { key: 'users',    label: 'Usuarios' },
    { key: 'roles',    label: 'Roles y Perfiles' },
    { key: 'org',      label: 'Organización' },
    { key: 'modules',  label: 'Módulos' },
  ];

  // ────────────────────────────────────────────────────────────────────────────
  return (
    <div className="content-fade">
      <div className="tabs" style={{ flexWrap: 'wrap', marginBottom: 20 }} data-tour="config-tabs">
        {tabs.map(tb => (
          <button
            key={tb.key}
            className={`tab ${tab === tb.key ? 'active' : ''}`}
            onClick={() => setTab(tb.key)}
            data-tour={`config-tab-${tb.key}`}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {/* ════ GENERAL (con secciones colapsables) ════ */}
      {tab === 'general' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* ── Sección: Configuración General ── */}
          <div className="card">
            <div
              className="card-head"
              style={{ cursor: 'pointer', userSelect: 'none' }}
              onClick={() => setGenCollapsed(v => !v)}
            >
              <h3 data-tour="general-card-title">Configuración General</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {isAdmin && (
                  <button className="btn btn-primary btn-sm" data-tour="general-edit-btn" onClick={e => {
                    e.stopPropagation();
                    setEditGenForm({
                      name: t.name || '',
                      units_count: t.units_count || units.length || 0,
                      maintenance_fee: t.maintenance_fee || 0,
                      currency: t.currency || 'MXN',
                      operation_start_date: t.operation_start_date || '',
                      operation_type: t.operation_type || 'fiscal',
                      bank_initial_balance: t.bank_initial_balance || 0,
                      country: t.country || '',
                      state: t.state || '',
                      admin_type: t.admin_type || 'mesa_directiva',
                    });
                    setEditGenOpen(true);
                  }}>
                    <Edit2 size={13} /> Editar
                  </button>
                )}
                <ChevronRight size={16} color="var(--ink-400)"
                  style={{ transform: genCollapsed ? 'rotate(0deg)' : 'rotate(90deg)', transition: 'transform 0.2s' }} />
              </div>
            </div>
            {!genCollapsed && (
              <div className="card-body">
                <div className="form-grid">
                  <FieldView label="Nombre" value={t.name} />
                  <FieldView label="Unidades">
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600, color: 'var(--ink-700)' }}>
                      {units.length}
                    </span>
                    <span style={{ fontSize: 13, color: 'var(--ink-400)', marginLeft: 6 }}>registradas</span>
                  </FieldView>
                  <FieldView label="Mantenimiento">
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600, color: 'var(--ink-700)' }}>
                      {fmt(t.maintenance_fee)} {t.currency}
                    </span>
                  </FieldView>
                  <FieldView label="Moneda" value={CURRENCIES[t.currency]?.name || t.currency || '—'} />
                  <FieldView label="Inicio de Operaciones">
                    <span style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'4px 12px', background:'var(--teal-50)', border:'1px solid var(--teal-100)', borderRadius:'var(--radius-full)', fontSize:13, fontWeight:600, color:'var(--teal-700)' }}>
                      <Calendar size={13} />
                      {t.operation_start_date ? periodLabel(t.operation_start_date) : 'No configurado'}
                    </span>
                  </FieldView>
                  <FieldView label="Saldo Inicial de Banco">
                    <span style={{ fontFamily:'var(--font-display)', fontSize:16, fontWeight:600, color: parseFloat(t.bank_initial_balance||0)>0 ? 'var(--teal-600)' : 'var(--ink-500)' }}>
                      {fmt(t.bank_initial_balance)} {t.currency}
                    </span>
                  </FieldView>
                  <FieldView label="Tipo de Operación">
                    <span className={`badge ${fiscal ? 'badge-blue' : 'badge-teal'}`}>
                      <span className="badge-dot" style={{ background: fiscal ? 'var(--blue-500)' : 'var(--teal-500)' }} />
                      {fiscal ? 'Operación Fiscal' : 'Operación Libre'}
                    </span>
                  </FieldView>
                  <FieldView label="País" value={t.country || '—'} />
                  <FieldView label="Estado / Provincia" value={t.state || '—'} />
                  <FieldView label="Tipo de Administración">
                    <span className={`badge ${t.admin_type === 'administrador' ? 'badge-amber' : 'badge-teal'}`}>
                      {t.admin_type === 'administrador' ? 'Administración Externa' : 'Mesa Directiva Interna'}
                    </span>
                  </FieldView>
                </div>
              </div>
            )}
          </div>

          {/* ── Sección: Áreas Comunes ── */}
          {(() => {
            const areas = Array.isArray(t.common_areas) ? t.common_areas : [];
            return (
              <div className="card">
                <div
                  className="card-head"
                  style={{ cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => setAreasCollapsed(v => !v)}
                >
                  <h3>
                    Áreas Comunes
                    {areas.length > 0 && (
                      <span className="badge badge-teal" style={{ marginLeft: 8, fontSize: 11 }}>{areas.length}</span>
                    )}
                  </h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {isAdmin && (
                      <button className="btn btn-primary btn-sm" onClick={e => { e.stopPropagation(); openNewArea(); }}>
                        <Plus size={13} /> Nueva Área
                      </button>
                    )}
                    <ChevronRight size={16} color="var(--ink-400)"
                      style={{ transform: areasCollapsed ? 'rotate(0deg)' : 'rotate(90deg)', transition: 'transform 0.2s' }} />
                  </div>
                </div>

                {!areasCollapsed && (
                  <div className="card-body" style={{ padding: areas.length ? 0 : undefined }}>
                    {areas.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--ink-300)', fontSize: 13 }}>
                        <Building2 size={32} color="var(--sand-200)" style={{ marginBottom: 8, display: 'block', margin: '0 auto 8px' }} />
                        Sin áreas comunes registradas.
                        {isAdmin && <div style={{ marginTop: 8 }}><button className="btn btn-primary btn-sm" onClick={openNewArea}><Plus size={13} /> Agregar primera área</button></div>}
                      </div>
                    ) : (
                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>Nombre</th>
                              <th style={{ textAlign: 'center', width: 80 }}>Activa</th>
                              <th style={{ textAlign: 'center', width: 100 }}>Reservas</th>
                              <th style={{ textAlign: 'center', width: 80 }}>Cobro</th>
                              <th style={{ width: 110 }}>Monto/Reserva</th>
                              {isAdmin && <th style={{ width: 80, textAlign: 'center' }}>Acciones</th>}
                            </tr>
                          </thead>
                          <tbody>
                            {areas.map(area => (
                              <tr key={area.id}>
                                <td>
                                  <div style={{ fontWeight: 600, fontSize: 13 }}>{area.name}</div>
                                  {(area.usage_policy || area.reservation_policy) && (
                                    <div style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 2 }}>
                                      {[area.usage_policy && 'Política de uso', area.reservation_policy && 'Política de reserva'].filter(Boolean).join(' · ')}
                                    </div>
                                  )}
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                  <button
                                    className={`badge ${area.active ? 'badge-teal' : 'badge-amber'}`}
                                    style={{ cursor: isAdmin ? 'pointer' : 'default', border: 'none', fontSize: 11 }}
                                    onClick={() => isAdmin && toggleAreaField(area.id, 'active', !area.active)}
                                    title={area.active ? 'Activa — clic para desactivar' : 'Inactiva — clic para activar'}
                                  >
                                    {area.active ? 'Activa' : 'Inactiva'}
                                  </button>
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                  <button
                                    className={`badge ${area.reservations_enabled ? 'badge-blue' : ''}`}
                                    style={{ cursor: isAdmin ? 'pointer' : 'default', border: 'none', fontSize: 11, background: area.reservations_enabled ? undefined : 'var(--sand-100)', color: area.reservations_enabled ? undefined : 'var(--ink-400)' }}
                                    onClick={() => isAdmin && toggleAreaField(area.id, 'reservations_enabled', !area.reservations_enabled)}
                                    title={area.reservations_enabled ? 'Habilitada — clic para deshabilitar' : 'Deshabilitada — clic para habilitar'}
                                  >
                                    {area.reservations_enabled ? 'Habilitada' : 'Deshabilitada'}
                                  </button>
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                  {area.reservations_enabled ? (
                                    <button
                                      className={`badge ${area.charge_enabled ? 'badge-amber' : ''}`}
                                      style={{ cursor: isAdmin ? 'pointer' : 'default', border: 'none', fontSize: 11, background: area.charge_enabled ? undefined : 'var(--sand-100)', color: area.charge_enabled ? undefined : 'var(--ink-400)' }}
                                      onClick={() => isAdmin && toggleAreaField(area.id, 'charge_enabled', !area.charge_enabled)}
                                    >
                                      {area.charge_enabled ? 'Con cobro' : 'Sin cobro'}
                                    </button>
                                  ) : <span style={{ fontSize: 11, color: 'var(--ink-300)' }}>—</span>}
                                </td>
                                <td>
                                  {area.reservations_enabled && area.charge_enabled
                                    ? <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13 }}>
                                        {new Intl.NumberFormat('es-MX', { style: 'currency', currency: t.currency || 'MXN', maximumFractionDigits: 0 }).format(area.charge_amount || 0)}
                                      </span>
                                    : <span style={{ fontSize: 11, color: 'var(--ink-300)' }}>—</span>}
                                </td>
                                {isAdmin && (
                                  <td style={{ textAlign: 'center' }}>
                                    <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                                      <button className="btn-ghost" title="Editar" onClick={() => openEditArea(area)}><Edit2 size={13} /></button>
                                      <button className="btn-ghost" style={{ color: 'var(--coral-500)' }} title="Eliminar" onClick={() => deleteArea(area.id)}><Trash2 size={13} /></button>
                                    </div>
                                  </td>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── Sección: Datos Fiscales / Datos Generales ── */}
          <div className="card">
            <div
              className="card-head"
              style={{ cursor: 'pointer', userSelect: 'none' }}
              onClick={() => setFiscalCollapsed(v => !v)}
            >
              <h3>{fiscal ? 'Datos Fiscales' : 'Datos Generales'}</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {!fiscal && <span className="badge badge-teal" onClick={e => e.stopPropagation()}>{t.country || 'Sin país'}</span>}
                {isAdmin && (
                  <button className="btn btn-primary btn-sm" onClick={e => {
                    e.stopPropagation();
                    if (fiscal) {
                      setEditInfoForm({
                        razon_social: t.razon_social || '',
                        rfc: t.rfc || '',
                        info_calle: t.info_calle || '',
                        info_num_externo: t.info_num_externo || '',
                        info_colonia: t.info_colonia || '',
                        info_delegacion: t.info_delegacion || '',
                        info_ciudad: t.info_ciudad || '',
                        info_codigo_postal: t.info_codigo_postal || '',
                      });
                      setEditInfoOpen(true);
                    } else {
                      setEditAddrForm({
                        addr_nombre: t.addr_nombre || '',
                        addr_calle: t.addr_calle || '',
                        addr_num_externo: t.addr_num_externo || '',
                        addr_colonia: t.addr_colonia || '',
                        addr_delegacion: t.addr_delegacion || '',
                        addr_ciudad: t.addr_ciudad || '',
                        addr_codigo_postal: t.addr_codigo_postal || '',
                      });
                      setEditAddrOpen(true);
                    }
                  }}>
                    <Edit2 size={13} /> Editar
                  </button>
                )}
                <ChevronRight size={16} color="var(--ink-400)"
                  style={{ transform: fiscalCollapsed ? 'rotate(0deg)' : 'rotate(90deg)', transition: 'transform 0.2s' }} />
              </div>
            </div>
            {!fiscalCollapsed && (
              <div className="card-body">
                <div className="form-grid">
                  {fiscal ? (<>
                    <FieldView label="Razón Social" value={t.razon_social} />
                    <FieldView label="RFC" value={t.rfc} mono />
                    <FieldView label="Calle" value={t.info_calle} />
                    <FieldView label="No. Externo" value={t.info_num_externo} />
                    <FieldView label="Colonia" value={t.info_colonia} />
                    <FieldView label="Delegación" value={t.info_delegacion} />
                    <FieldView label="Ciudad" value={t.info_ciudad} />
                    <FieldView label="C.P." value={t.info_codigo_postal} />
                  </>) : (<>
                    <FieldView label="Nombre" value={t.addr_nombre} />
                    <FieldView label="Calle" value={t.addr_calle} />
                    <FieldView label="No. Externo" value={t.addr_num_externo} />
                    {(t.country === 'México' || t.country === 'Mexico' || !t.country) && <>
                      <FieldView label="Colonia" value={t.addr_colonia} />
                      <FieldView label="Delegación" value={t.addr_delegacion} />
                      <FieldView label="Ciudad" value={t.addr_ciudad} />
                      <FieldView label="C.P." value={t.addr_codigo_postal} />
                    </>}
                  </>)}
                </div>
              </div>
            )}
          </div>

          {/* ── Sección: Logo ── */}
          <div className="card">
            <div
              className="card-head"
              style={{ cursor: 'pointer', userSelect: 'none' }}
              onClick={() => setLogoCollapsed(v => !v)}
            >
              <h3>Logo del Condominio</h3>
              <ChevronRight size={16} color="var(--ink-400)"
                style={{ transform: logoCollapsed ? 'rotate(0deg)' : 'rotate(90deg)', transition: 'transform 0.2s' }} />
            </div>
            {!logoCollapsed && (
              <div className="card-body" style={{ display: 'flex', alignItems: 'flex-start', gap: 32, flexWrap: 'wrap' }}>
                {isAdmin ? (
                  <label className="logo-box" style={{ width: 180, height: 180, cursor: 'pointer', position: 'relative' }}>
                    {t.logo
                      ? <img src={t.logo} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                      : <Upload size={28} color="var(--ink-300)" />
                    }
                    <input ref={logoRef} type="file" accept="image/*"
                      style={{ position: 'absolute', width: '100%', height: '100%', opacity: 0, cursor: 'pointer', top: 0, left: 0 }}
                      onChange={handleLogoUpload} />
                  </label>
                ) : (
                  <div className="logo-box" style={{ width: 180, height: 180, cursor: 'default' }}>
                    {t.logo
                      ? <img src={t.logo} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                      : <Building2 size={28} color="var(--ink-300)" />
                    }
                  </div>
                )}
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>Imagen de logo</div>
                  <div style={{ fontSize: 13, color: 'var(--ink-400)', lineHeight: 1.7, maxWidth: 300 }}>
                    PNG o JPG recomendado. Máx 2 MB.<br />
                    El logo aparece en el sidebar y en reportes.
                  </div>
                  {isAdmin && t.logo && (
                    <button className="btn btn-danger btn-sm" style={{ marginTop: 14 }} onClick={() => savePatch({ logo: '' })}>
                      <Trash2 size={13} /> Eliminar logo
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

        </div>
      )}

      {/* ════ UNIDADES ════ */}
      {tab === 'units' && (
        <div>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:12, marginBottom:16 }}>
            <p style={{ fontSize:14, color:'var(--ink-400)' }}>
              {units.length === 0
                ? '0 unidades registradas'
                : unitSearch
                  ? `${filteredUnits.length} de ${units.length} unidades${filteredUnits.length > 0 ? ` · pág. ${(unitsPage - 1) * unitsPageSize + 1}–${Math.min(unitsPage * unitsPageSize, filteredUnits.length)}` : ''}`
                  : `${(unitsPage - 1) * unitsPageSize + 1}–${Math.min(unitsPage * unitsPageSize, units.length)} de ${units.length} unidades`}
            </p>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, background:'var(--white)', border:'1px solid var(--sand-200)', borderRadius:'var(--radius-full)', padding:'7px 14px', width:220 }}>
                <Search size={14} color="var(--ink-400)" style={{ flexShrink:0 }} />
                <input style={{ border:'none', background:'transparent', outline:'none', fontSize:13, width:'100%', fontFamily:'var(--font-body)', color:'var(--ink-800)' }}
                  placeholder="Buscar unidad..."
                  value={unitSearch} onChange={e => { setUnitSearch(e.target.value); setUnitsPage(1); }} />
              </div>
              {isAdmin && (
                <button className="btn btn-primary" onClick={() => {
                  setUnitForm({ unit_name:'', unit_id_code:'', owner_first_name:'', owner_last_name:'', owner_email:'', owner_phone:'', coowner_first_name:'', coowner_last_name:'', coowner_email:'', coowner_phone:'', occupancy:'propietario', previous_debt:0, previous_debt_evidence:'', credit_balance:0, admin_exempt:false, tenant_first_name:'', tenant_last_name:'', tenant_email:'', tenant_phone:'' });
                  setUnitModal('add');
                }}>
                  <Plus size={14} /> Nueva Unidad
                </button>
              )}
            </div>
          </div>

          <div className="card">
            {filteredUnits.length === 0 ? (
              <div className="card-body" style={{ textAlign:'center', padding:60, color:'var(--ink-400)' }}>
                <Home size={40} color="var(--sand-300)" style={{ marginBottom:12 }} />
                <div style={{ fontWeight:700, fontSize:15, marginBottom:4 }}>Sin unidades</div>
                <div style={{ fontSize:13 }}>{unitSearch ? 'No se encontraron resultados.' : 'Agrega la primera unidad del condominio.'}</div>
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>ID</th><th>Nombre</th><th>Propietario</th><th>Email</th>
                      <th>Ocupación</th><th>Inquilino</th>
                      {t.admin_type === 'mesa_directiva' && <th>Exención</th>}
                      <th style={{ textAlign:'right' }}>Adeudo Ant.</th>
                      <th>Evid.</th>
                      {isAdmin && <th style={{ width:100 }}>Acciones</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {pagedUnits.map(u => {
                      const pd = parseFloat(u.previous_debt || 0);
                      return (
                      <tr key={u.id}>
                        <td>
                          <span style={{ fontFamily:'monospace', fontWeight:700, color:'var(--teal-600)', background:'var(--teal-50)', padding:'3px 10px', borderRadius:6, fontSize:13 }}>
                            {u.unit_id_code}
                          </span>
                        </td>
                        <td style={{ fontWeight:600 }}>{u.unit_name}</td>
                        <td>{u.owner_first_name} {u.owner_last_name}</td>
                        <td style={{ fontSize:13, color:'var(--ink-500)' }}>{u.owner_email || '—'}</td>
                        <td>
                          <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                            <span className={`badge ${u.occupancy==='propietario'?'badge-teal':u.occupancy==='rentado'?'badge-amber':'badge-gray'}`}>
                              <span className="badge-dot" style={{ background: u.occupancy==='propietario'?'var(--teal-500)':u.occupancy==='rentado'?'var(--amber-500)':'var(--ink-300)' }} />
                              {u.occupancy==='propietario'?'Propietario':u.occupancy==='rentado'?'Rentado':'Sin habitar'}
                            </span>
                            {u.is_active === false && (
                              <span className="badge" style={{ background:'var(--sand-100)', color:'var(--ink-400)', fontSize:10 }}>Inactiva</span>
                            )}
                          </div>
                        </td>
                        <td style={{ fontSize:13 }}>
                          {u.occupancy==='rentado'
                            ? `${u.tenant_first_name||''} ${u.tenant_last_name||''}`.trim()||'—'
                            : <span style={{ color:'var(--ink-300)' }}>—</span>}
                        </td>
                        {t.admin_type === 'mesa_directiva' && (
                          <td>
                            {u.admin_exempt
                              ? <span style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'3px 10px', borderRadius:6, fontSize:11, fontWeight:700, background:'var(--teal-50)', color:'var(--teal-700)' }}>
                                  <Shield size={11}/> Exento
                                </span>
                              : <span style={{ color:'var(--ink-300)' }}>—</span>}
                          </td>
                        )}
                        <td style={{ textAlign:'right', fontFamily:'monospace', fontSize:13, fontWeight:600, color: pd > 0 ? 'var(--coral-500)' : 'var(--ink-300)' }}>
                          {pd > 0 ? fmt(pd) : '—'}
                        </td>
                        <td>
                          {u.has_evidence
                            ? <button
                                title="Ver evidencia de adeudo previo"
                                style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:11, fontWeight:600,
                                  color:'var(--blue-600)', background:'var(--blue-50)', border:'1px solid var(--blue-200)',
                                  borderRadius:6, padding:'3px 9px', cursor:'pointer' }}
                                onClick={async () => {
                                  try {
                                    const r = await unitsAPI.evidence(tenantId, u.id);
                                    const b64 = r.data.evidence;
                                    if (!b64) return toast.error('Sin evidencia adjunta.');
                                    const bytes=atob(b64); const arr=new Uint8Array(bytes.length);
                                    for(let i=0;i<bytes.length;i++) arr[i]=bytes.charCodeAt(i);
                                    const blob=new Blob([arr],{type:'application/pdf'});
                                    const url=URL.createObjectURL(blob);
                                    window.open(url,'_blank');
                                    setTimeout(()=>URL.revokeObjectURL(url),15000);
                                  } catch { toast.error('Error al cargar la evidencia.'); }
                                }}
                              ><FileText size={12}/> Ver PDF</button>
                            : <span style={{ color:'var(--ink-300)', fontSize:12 }}>—</span>}
                        </td>
                        {isAdmin && (
                          <td>
                            <div style={{ display:'flex', gap:4 }}>
                              <button className="btn-ghost" onClick={async () => {
                                // Defaults antes del spread para garantizar campos controlados (inquilino puede no venir en u)
                                setUnitForm({
                                  tenant_first_name: '', tenant_last_name: '', tenant_email: '', tenant_phone: '',
                                  owner_first_name: '', owner_last_name: '', owner_email: '', owner_phone: '',
                                  coowner_first_name: '', coowner_last_name: '', coowner_email: '', coowner_phone: '',
                                  previous_debt: 0, credit_balance: 0, admin_exempt: false,
                                  ...u,
                                  previous_debt_evidence: '',
                                });
                                setUnitModal('edit');
                                if (u.has_evidence) {
                                  try {
                                    const r = await unitsAPI.evidence(tenantId, u.id);
                                    setUnitForm(f => ({...f, previous_debt_evidence: r.data.evidence || ''}));
                                  } catch { /* silencioso: el usuario puede re-subir si falla */ }
                                }
                              }}><Edit2 size={14}/></button>
                              {u.is_active === false
                                ? <button className="btn-ghost" style={{ color:'var(--teal-600)' }} title="Reactivar unidad" onClick={() => handleUnitActivate(u)}>
                                    <RefreshCw size={14}/>
                                  </button>
                                : <button className="btn-ghost" style={{ color:'var(--coral-500)' }} title="Eliminar / inactivar" onClick={() => handleUnitDelete(u)}><Trash2 size={14}/></button>
                              }
                            </div>
                          </td>
                        )}
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Paginación client-side con ventana deslizante */}
            {filteredUnits.length > unitsPageSize && (() => {
              const totalPages = Math.max(1, Math.ceil(filteredUnits.length / unitsPageSize));
              const start = (unitsPage - 1) * unitsPageSize + 1;
              const end   = Math.min(unitsPage * unitsPageSize, filteredUnits.length);
              // Ventana deslizante ±2 alrededor de la página actual
              const pageNums = (() => {
                if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
                const lo = Math.max(2, unitsPage - 2);
                const hi = Math.min(totalPages - 1, unitsPage + 2);
                const arr = [1];
                if (lo > 2) arr.push('…');
                for (let p = lo; p <= hi; p++) arr.push(p);
                if (hi < totalPages - 1) arr.push('…');
                arr.push(totalPages);
                return arr;
              })();
              return (
                <div className="pag-bar">
                  <span className="pag-left">Mostrando {start}–{end} de {filteredUnits.length}</span>
                  <div className="pag-right">
                    <div className="pag-per-page">
                      Mostrar
                      <select value={unitsPageSize} onChange={e => { setUnitsPageSize(Number(e.target.value)); setUnitsPage(1); }}>
                        {UNITS_PAGE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                      por página
                    </div>
                    <div className="pag-btns">
                      <button className="pag-btn" disabled={unitsPage <= 1} onClick={() => setUnitsPage(1)} title="Primera página">«</button>
                      <button className="pag-btn" disabled={unitsPage <= 1} onClick={() => setUnitsPage(p => p - 1)} title="Anterior">‹</button>
                      {pageNums.map((p, i) =>
                        p === '…'
                          ? <span key={`el-${i}`} style={{ padding:'0 4px', color:'var(--ink-300)', lineHeight:'28px' }}>…</span>
                          : <button key={p} className={`pag-btn ${p === unitsPage ? 'active' : ''}`} onClick={() => setUnitsPage(p)}>{p}</button>
                      )}
                      <button className="pag-btn" disabled={unitsPage >= totalPages} onClick={() => setUnitsPage(p => p + 1)} title="Siguiente">›</button>
                      <button className="pag-btn" disabled={unitsPage >= totalPages} onClick={() => setUnitsPage(totalPages)} title="Última página">»</button>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ════ CONFIG. PAGOS ════ */}
      {tab === 'fields' && (() => {
        const cobFields = fields.filter(f => !f.field_type || f.field_type === 'normal' || f.field_type === 'adelanto');
        const gasFields = fields.filter(f => f.field_type === 'gastos');
        const cobActive = cobFields.filter(f => f.enabled);
        const gasActive = gasFields.filter(f => f.enabled);

        const FieldRow = ({ f }) => {
          const isCob = !f.field_type || f.field_type === 'normal' || f.field_type === 'adelanto';
          const isAdelanto = f.field_type === 'adelanto';
          const typeColor = isAdelanto ? 'var(--blue-500)' : isCob ? 'var(--teal-500)' : 'var(--amber-500)';
          const typeBg = isAdelanto ? 'var(--blue-50)' : isCob ? 'var(--teal-50)' : 'var(--amber-50)';
          const typeBorder = isAdelanto ? 'var(--blue-100)' : isCob ? 'var(--teal-100)' : 'var(--amber-100)';
          return (
            <div style={{ display:'flex', gap:0, padding:'16px 20px', borderBottom:'1px solid var(--sand-100)', alignItems:'flex-start', transition:'background 0.12s' }}
              onMouseOver={e => e.currentTarget.style.background='var(--sand-50)'} onMouseOut={e => e.currentTarget.style.background=''}>
              <div style={{ width:3, borderRadius:3, minHeight:40, background:f.enabled?typeColor:'var(--sand-200)', flexShrink:0, marginRight:16, marginTop:2, transition:'background 0.2s' }} />
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:4 }}>
                  <span style={{ fontSize:14, fontWeight:700, color:'var(--ink-800)' }}>{f.label}</span>
                  <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:'var(--radius-full)', background:typeBg, color:typeColor, border:`1px solid ${typeBorder}` }}>{isAdelanto?'Adelanto':isCob?'Cobranza':'Gastos'}</span>
                  {f.enabled && isCob && !isAdelanto && <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:'var(--radius-full)', background:f.required?'var(--coral-50)':'var(--sand-100)', color:f.required?'var(--coral-500)':'var(--ink-500)', border:`1px solid ${f.required?'var(--coral-100)':'var(--sand-200)'}` }}>{f.required?'Obligatorio':'Opcional'}</span>}
                  {f.enabled && isAdelanto && <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:'var(--radius-full)', background:'var(--blue-50)', color:'var(--blue-500)', border:'1px solid var(--blue-100)' }}>Saldo a Favor</span>}
                  {!f.enabled && <span style={{ fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:'var(--radius-full)', background:'var(--sand-100)', color:'var(--ink-400)' }}>Inactivo</span>}
                </div>
                {isCob && !isAdelanto && f.required && f.enabled && parseFloat(f.default_amount)>0 &&
                  <div style={{ fontSize:12, color:'var(--ink-500)' }}>Cargo mensual fijo: <strong style={{ color:'var(--teal-700)' }}>{fmt(f.default_amount)}</strong></div>}
                {isAdelanto && f.enabled && parseFloat(f.default_amount)>0 &&
                  <div style={{ fontSize:12, color:'var(--ink-500)' }}>Monto habitual: <strong style={{ color:'var(--blue-700)' }}>{fmt(f.default_amount)}</strong></div>}
                {!f.enabled && <div style={{ fontSize:12, color:'var(--ink-400)' }}>Activa este campo para usarlo en cobranza</div>}
                {f.enabled && isCob && !isAdelanto && !f.required && <div style={{ fontSize:12, color:'var(--ink-400)' }}>Campo opcional — monto variable por período</div>}
                {f.enabled && isAdelanto && <div style={{ fontSize:12, color:'var(--blue-400)' }}>Pagos suman como saldo a favor en el estado de cuenta</div>}
                {!isCob && f.enabled && <div style={{ fontSize:12, color:'var(--ink-400)' }}>Campo de gastos operativos del condominio</div>}

                {/* Gastos-specific settings: recurrent, active period, evidence */}
                {!isCob && f.enabled && isAdmin && (
                  <div style={{ marginTop:10, padding:'10px 12px', background:'var(--amber-50)', border:'1px solid var(--amber-100)', borderRadius:'var(--radius-sm)', display:'flex', flexDirection:'column', gap:8 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <div className={`switch ${f.recurrent?'on':''}`} style={{ background:f.recurrent?'var(--amber-400)':undefined, cursor:'pointer' }}
                        onClick={() => toggleField(f.id, { recurrent: !f.recurrent })}>
                        <div className="switch-knob" />
                      </div>
                      <span style={{ fontSize:12, fontWeight:600, color:'var(--amber-700)' }}>{f.recurrent?'Gasto Recurrente':'Gasto Único'}</span>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                      <span style={{ fontSize:11, fontWeight:600, color:'var(--ink-500)' }}>Período activo:</span>
                      <input type="month" style={{ padding:'3px 6px', border:'1px solid var(--amber-200)', borderRadius:4, fontSize:11, fontFamily:'var(--font-body)' }}
                        defaultValue={f.active_period_start||''} onBlur={e => toggleField(f.id, { active_period_start: e.target.value })} />
                      <span style={{ fontSize:11, color:'var(--ink-400)' }}>→</span>
                      <input type="month" style={{ padding:'3px 6px', border:'1px solid var(--amber-200)', borderRadius:4, fontSize:11, fontFamily:'var(--font-body)' }}
                        defaultValue={f.active_period_end||''} onBlur={e => toggleField(f.id, { active_period_end: e.target.value })} />
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <label style={{ cursor:'pointer', fontSize:11, color:'var(--blue-500)', fontWeight:600, display:'inline-flex', alignItems:'center', gap:4 }}>
                        <Upload size={12}/> {f.evidence_file_name || 'Adjuntar contrato/documento'}
                        <input type="file" accept=".pdf,.jpg,.png,.doc,.docx" style={{ display:'none' }}
                          onChange={e => {
                            const file = e.target.files[0]; if (!file) return;
                            const reader = new FileReader();
                            reader.onload = ev => toggleField(f.id, { evidence_file: ev.target.result, evidence_file_name: file.name });
                            reader.readAsDataURL(file);
                          }} />
                      </label>
                      {f.evidence_file_name && <button className="btn-ghost" style={{ fontSize:10, color:'var(--coral-400)', padding:2 }}
                        onClick={() => toggleField(f.id, { evidence_file: '', evidence_file_name: '' })}><X size={12}/></button>}
                    </div>
                  </div>
                )}
                {!isCob && f.enabled && !isAdmin && (() => {
                  const info = [];
                  if (f.recurrent) info.push('Recurrente');
                  if (f.active_period_start || f.active_period_end) info.push(`Período: ${f.active_period_start?periodLabel(f.active_period_start):'—'} → ${f.active_period_end?periodLabel(f.active_period_end):'Vigente'}`);
                  if (f.evidence_file_name) info.push(`📎 ${f.evidence_file_name}`);
                  return info.length > 0 ? <div style={{ fontSize:11, color:'var(--amber-600)', marginTop:4 }}>{info.join(' · ')}</div> : null;
                })()}

                {isAdmin && f.enabled && isCob && f.required && (
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:10, padding:'10px 12px', background:'var(--teal-50)', border:'1px solid var(--teal-100)', borderRadius:'var(--radius-sm)' }}>
                    <DollarSign size={14} color="var(--teal-600)" />
                    <span style={{ fontSize:12, color:'var(--teal-700)', fontWeight:600 }}>Monto mensual</span>
                    <span style={{ fontSize:12, color:'var(--teal-600)' }}>$</span>
                    <input style={{ width:110, padding:'5px 8px', border:'1.5px solid var(--teal-200)', borderRadius:6, fontSize:13, fontWeight:700, color:'var(--teal-700)', background:'white', outline:'none', textAlign:'right', fontFamily:'var(--font-body)' }}
                      type="number" min="0" step="0.01" defaultValue={f.default_amount||0}
                      onBlur={e => toggleField(f.id, { default_amount: e.target.value })} />
                  </div>
                )}
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:10, paddingLeft:16, flexShrink:0 }}>
                {isAdmin && isCob && f.enabled && (
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                    <div style={{ fontSize:9, fontWeight:700, letterSpacing:'0.06em', color:f.required?'var(--coral-500)':'var(--ink-400)' }}>OBLIG.</div>
                    <div className={`switch ${f.required?'on':''}`} style={{ background:f.required?'var(--coral-400)':undefined, cursor:'pointer' }} onClick={() => toggleField(f.id,{required:!f.required})}>
                      <div className="switch-knob" />
                    </div>
                  </div>
                )}
                {isAdmin && (
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                    <div style={{ fontSize:9, fontWeight:700, letterSpacing:'0.06em', color:f.enabled?'var(--teal-600)':'var(--ink-400)' }}>ACTIVO</div>
                    <div className={`switch ${f.enabled?'on':''}`} style={{ cursor:'pointer' }} onClick={() => toggleField(f.id,{enabled:!f.enabled})}>
                      <div className="switch-knob" />
                    </div>
                  </div>
                )}
                {isAdmin && (
                  <button className="btn-ghost" title="Editar nombre del campo" style={{ color:'var(--blue-500)', padding:6, borderRadius:'var(--radius-sm)' }}
                    onClick={() => setFieldForm({ ...f })}>
                    <Edit2 size={15}/>
                  </button>
                )}
                {isAdmin && !f.is_system_default && (
                  <button className="btn-ghost" style={{ color:'var(--coral-400)', padding:6, borderRadius:'var(--radius-sm)' }} onClick={async () => {
                    if (window.confirm('¿Eliminar campo?')) { await extraFieldsAPI.delete(tenantId,f.id); loadFields(); }
                  }}><Trash2 size={15}/></button>
                )}
                {!isAdmin && (
                  <span style={{ fontSize:11, fontWeight:600, padding:'4px 10px', borderRadius:'var(--radius-full)', background:f.enabled?'var(--teal-50)':'var(--sand-100)', color:f.enabled?'var(--teal-700)':'var(--ink-400)' }}>
                    {f.enabled?'Activo':'Inactivo'}
                  </span>
                )}
              </div>
            </div>
          );
        };

        return (
        <div>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:12, marginBottom:20 }}>
            <p style={{ fontSize:14, color:'var(--ink-400)' }}>Configura los campos de cobranza y gastos del condominio</p>
            {isAdmin && (
              <button className="btn btn-primary btn-sm" onClick={() => setFieldForm({ label:'', default_amount:0, required:false, enabled:true, field_type:'normal', cross_unit:false, description:'', show_in_normal:true, show_in_additional:true, show_in_gastos:false })}>
                <Plus size={14} /> Nuevo Campo
              </button>
            )}
          </div>

          {/* 1) Resumen de Cobranza Mensual */}
          <div className="card" style={{ marginBottom:16 }}>
            <div className="card-head"><h3>Resumen de Cobranza Mensual</h3></div>
            <div className="card-body">
              <div style={{ marginBottom:16 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 14px', background:'var(--sand-50)', borderRadius:'var(--radius-sm) var(--radius-sm) 0 0', border:'1px solid var(--sand-100)' }}>
                  <span style={{ fontSize:13, fontWeight:600, color:'var(--ink-600)', display:'flex', alignItems:'center', gap:6 }}><DollarSign size={14} /> Mantenimiento base</span>
                  <span style={{ fontFamily:'var(--font-display)', fontSize:18, fontWeight:600, color:'var(--ink-700)' }}>{fmt(t.maintenance_fee)}</span>
                </div>
                {reqCobFields.map(f => (
                  <div key={f.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 14px', border:'1px solid var(--sand-100)', borderTop:'none' }}>
                    <span style={{ fontSize:13, color:'var(--ink-500)' }}><span style={{ fontSize:10, fontWeight:700, padding:'2px 6px', borderRadius:'var(--radius-full)', background:'var(--coral-50)', color:'var(--coral-500)', marginRight:6 }}>Obligatorio</span>{f.label}</span>
                    <span style={{ fontFamily:'var(--font-display)', fontSize:16, fontWeight:600, color:'var(--ink-700)' }}>{fmt(f.default_amount)}</span>
                  </div>
                ))}
                {reqCobFields.length === 0 && (
                  <div style={{ padding:'8px 14px', border:'1px solid var(--sand-100)', borderTop:'none', fontSize:12, color:'var(--ink-300)', textAlign:'center' }}>Sin campos obligatorios adicionales</div>
                )}
              </div>
              <div style={{ padding:14, background:'var(--teal-50)', border:'1px solid var(--teal-100)', borderRadius:'var(--radius-md)', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:10 }}>
                <div style={{ fontSize:13, color:'var(--teal-700)', display:'flex', alignItems:'center', gap:6 }}>
                  <DollarSign size={14} /> <strong>Cargo mensual mínimo por unidad</strong> <span style={{ fontSize:11, fontWeight:400 }}>(Mant. + {reqCobFields.length} oblig.)</span>
                </div>
                <span style={{ fontFamily:'var(--font-display)', fontSize:22, fontWeight:500, color:'var(--teal-700)' }}>{fmt(totalMonthly)} <span style={{ fontSize:13, fontWeight:400 }}>MXN</span></span>
              </div>
              <div style={{ marginTop:12, fontSize:12, color:'var(--ink-400)', display:'flex', alignItems:'center', gap:4 }}>
                <AlertCircle size={13} /> Solo los campos <strong>Obligatorios</strong> con monto configurado generan deuda en el Estado de Cuenta.
              </div>
            </div>
          </div>

          {/* 2) Campos de Cobranza — collapsible */}
          <div className="card" style={{ marginBottom:16, overflow:'hidden' }}>
            <div className="collapsible-head" onClick={() => setCobCollapsed(p => !p)} style={{ cursor:'pointer' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <Receipt size={16} />
                <h3 style={{ margin:0 }}>Campos de Cobranza</h3>
                <span style={{ fontSize:12, color:'var(--ink-400)', marginLeft:6 }}>
                  {cobFields.length} campo(s)
                  {cobActive.length > 0 && <>&nbsp;<span className="badge badge-teal">{cobActive.length} activos</span></>}
                </span>
              </div>
              <ChevronRight size={16} style={{ transform:cobCollapsed?'rotate(0deg)':'rotate(90deg)', transition:'transform 0.2s', color:'var(--ink-400)' }} />
            </div>
            {!cobCollapsed && (
              cobFields.length === 0
                ? <div style={{ color:'var(--ink-300)', fontSize:14, textAlign:'center', padding:24 }}>Sin campos de cobranza</div>
                : cobFields.map(f => <FieldRow key={f.id} f={f} />)
            )}
          </div>

          {/* 3) Campos de Gastos — collapsible */}
          <div className="card" style={{ marginBottom:16, overflow:'hidden' }}>
            <div className="collapsible-head" onClick={() => setGasCollapsed(p => !p)} style={{ cursor:'pointer' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <ShoppingBag size={16} />
                <h3 style={{ margin:0 }}>Campos de Gastos</h3>
                <span style={{ fontSize:12, color:'var(--ink-400)', marginLeft:6 }}>
                  {gasFields.length} campo(s)
                  {gasActive.length > 0 && <>&nbsp;<span className="badge badge-amber">{gasActive.length} activos</span></>}
                </span>
              </div>
              <ChevronRight size={16} style={{ transform:gasCollapsed?'rotate(0deg)':'rotate(90deg)', transition:'transform 0.2s', color:'var(--ink-400)' }} />
            </div>
            {!gasCollapsed && (
              gasFields.length === 0
                ? <div style={{ color:'var(--ink-300)', fontSize:14, textAlign:'center', padding:24 }}>Sin campos de gastos</div>
                : gasFields.map(f => <FieldRow key={f.id} f={f} />)
            )}
          </div>
        </div>
        );
      })()}

      {/* ════ USUARIOS ════ */}
      {tab === 'users' && (() => {
        // ── Sort helper ──────────────────────────────────────────────────────
        const toggleSort = (col) => {
          setUserSort(prev => prev.col === col ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' });
          setUsersPage(1);
        };
        const SortIcon = ({ col }) => {
          if (userSort.col !== col) return <span style={{ color:'var(--ink-200)', fontSize:10, marginLeft:3 }}>⇅</span>;
          return <span style={{ color:'var(--teal-600)', fontSize:10, marginLeft:3 }}>{userSort.dir === 'asc' ? '↑' : '↓'}</span>;
        };

        // ── Filter + sort ────────────────────────────────────────────────────
        const q = userSearch.trim().toLowerCase();
        const filtered = tenantUsers
          .filter(u => {
            const name  = (u.user_name || u.name || '').toLowerCase();
            const email = (u.user_email || u.email || '').toLowerCase();
            const matchQ      = !q || name.includes(q) || email.includes(q);
            const matchRole   = userRoleFilter === 'all' || u.role === userRoleFilter;
            const matchStatus = userStatusFilter === 'all'
              || (userStatusFilter === 'pending' && u.must_change_password)
              || (userStatusFilter === 'active'  && !u.must_change_password);
            return matchQ && matchRole && matchStatus;
          })
          .sort((a, b) => {
            const dir  = userSort.dir === 'asc' ? 1 : -1;
            const col  = userSort.col;
            const nameA  = (a.user_name || a.name || a.user_email || '').toLowerCase();
            const nameB  = (b.user_name || b.name || b.user_email || '').toLowerCase();
            const emailA = (a.user_email || a.email || '').toLowerCase();
            const emailB = (b.user_email || b.email || '').toLowerCase();
            const roleA  = a.role || '';
            const roleB  = b.role || '';
            const unitA  = (() => { const ux = units.find(x => String(x.id) === String(a.unit)); return ux ? (ux.unit_id_code || '') : ''; })().toLowerCase();
            const unitB  = (() => { const ux = units.find(x => String(x.id) === String(b.unit)); return ux ? (ux.unit_id_code || '') : ''; })().toLowerCase();
            const statA  = a.must_change_password ? 1 : 0;
            const statB  = b.must_change_password ? 1 : 0;
            if (col === 'name')   return nameA  < nameB  ? -dir : nameA  > nameB  ? dir : 0;
            if (col === 'email')  return emailA < emailB ? -dir : emailA > emailB ? dir : 0;
            if (col === 'role')   return roleA  < roleB  ? -dir : roleA  > roleB  ? dir : 0;
            if (col === 'unit')   return unitA  < unitB  ? -dir : unitA  > unitB  ? dir : 0;
            if (col === 'status') return (statA - statB) * dir;
            return 0;
          });

        const totalUserPages = Math.max(1, Math.ceil(filtered.length / usersPageSize));
        const safePage = Math.min(usersPage, totalUserPages);
        const pagedUsers = filtered.slice((safePage - 1) * usersPageSize, safePage * usersPageSize);
        const userPageNums = (() => {
          if (totalUserPages <= 7) return Array.from({ length: totalUserPages }, (_, i) => i + 1);
          const lo = Math.max(2, safePage - 2);
          const hi = Math.min(totalUserPages - 1, safePage + 2);
          const arr = [1];
          if (lo > 2) arr.push('…');
          for (let p = lo; p <= hi; p++) arr.push(p);
          if (hi < totalUserPages - 1) arr.push('…');
          arr.push(totalUserPages);
          return arr;
        })();
        const uStart = filtered.length === 0 ? 0 : (safePage - 1) * usersPageSize + 1;
        const uEnd   = Math.min(safePage * usersPageSize, filtered.length);

        const allRoles = [...new Set(tenantUsers.map(u => u.role))].sort();

        return (
          <div>
            {/* Toolbar */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16, flexWrap:'wrap', gap:10 }}>
              {/* Buscador + filtro */}
              <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                <div style={{ position:'relative' }}>
                  <Search size={14} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'var(--ink-300)', pointerEvents:'none' }} />
                  <input
                    type="text"
                    placeholder="Buscar por nombre o email…"
                    value={userSearch}
                    onChange={e => { setUserSearch(e.target.value); setUsersPage(1); }}
                    style={{ paddingLeft:32, paddingRight:10, height:34, border:'1px solid var(--sand-200)', borderRadius:8, fontSize:13, color:'var(--ink-700)', width:220, background:'var(--white)' }}
                  />
                </div>
                <select
                  value={userRoleFilter}
                  onChange={e => { setUserRoleFilter(e.target.value); setUsersPage(1); }}
                  style={{ height:34, border:'1px solid var(--sand-200)', borderRadius:8, fontSize:13, color:'var(--ink-700)', padding:'0 10px', background:'var(--white)' }}
                >
                  <option value="all">Todos los roles</option>
                  {allRoles.map(r => {
                    const m = ROLE_META[r];
                    return <option key={r} value={r}>{m ? m.label : r}</option>;
                  })}
                </select>
                <select
                  value={userStatusFilter}
                  onChange={e => { setUserStatusFilter(e.target.value); setUsersPage(1); }}
                  style={{ height:34, border:'1px solid var(--sand-200)', borderRadius:8, fontSize:13, color:'var(--ink-700)', padding:'0 10px', background:'var(--white)' }}
                >
                  <option value="all">Todos los estatus</option>
                  <option value="active">Activa</option>
                  <option value="pending">Cambio pendiente</option>
                </select>
                <span style={{ fontSize:13, color:'var(--ink-400)' }}>
                  {filtered.length === 0
                    ? '0 usuarios'
                    : q || userRoleFilter !== 'all' || userStatusFilter !== 'all'
                      ? `${filtered.length} resultado${filtered.length !== 1 ? 's' : ''} de ${tenantUsers.length}`
                      : `${uStart}–${uEnd} de ${tenantUsers.length} usuario${tenantUsers.length !== 1 ? 's' : ''}`}
                </span>
              </div>
              {isAdmin && (
                <button className="btn btn-primary" onClick={() => { setAddUserForm({ role:'admin' }); setAddUserExisting(null); setAddUserOpen(true); }}>
                  <Plus size={14} /> Nuevo Usuario
                </button>
              )}
            </div>

            <div className="card">
              {tenantUsers.length === 0
                ? <div className="card-body" style={{ color:'var(--ink-300)', fontSize:13 }}>Sin usuarios registrados.</div>
                : filtered.length === 0
                  ? <div className="card-body" style={{ color:'var(--ink-300)', fontSize:13, textAlign:'center', padding:32 }}>
                      <Search size={28} style={{ display:'block', margin:'0 auto 10px', opacity:0.25 }} />
                      No se encontraron usuarios con esos filtros.
                    </div>
                  : (
                  <>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th style={{ cursor:'pointer', userSelect:'none' }} onClick={() => toggleSort('name')}>
                              Nombre <SortIcon col="name" />
                            </th>
                            <th style={{ cursor:'pointer', userSelect:'none' }} onClick={() => toggleSort('email')}>
                              Email <SortIcon col="email" />
                            </th>
                            <th style={{ cursor:'pointer', userSelect:'none' }} onClick={() => toggleSort('role')}>
                              Rol <SortIcon col="role" />
                            </th>
                            <th style={{ cursor:'pointer', userSelect:'none' }} onClick={() => toggleSort('unit')}>
                              Unidad <SortIcon col="unit" />
                            </th>
                            <th style={{ cursor:'pointer', userSelect:'none' }} onClick={() => toggleSort('status')}>
                              Estatus <SortIcon col="status" />
                            </th>
                            {isAdmin && <th style={{ width:100, textAlign:'center' }}>Acciones</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {pagedUsers.map(u => {
                            const name = u.user_name || u.name || u.user_email || '—';
                            const email = u.user_email || u.email || '—';
                            const meta = ROLE_META[u.role] || { label: u.role, color:'var(--ink-500)', bg:'var(--sand-100)' };
                            const activeProfile = u.profile_id
                              ? customProfiles.find(p => String(p.id) === String(u.profile_id))
                              : null;
                            return (
                              <tr key={u.id}>
                                <td style={{ fontWeight:600, fontSize:13 }}>
                                  <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                                    {name}
                                    {u.must_change_password && (
                                      <span title="Tiene contraseña temporal — debe cambiarla al ingresar"
                                        style={{ display:'inline-flex', alignItems:'center', gap:3, fontSize:10, fontWeight:700,
                                          color:'var(--amber-700)', background:'var(--amber-50)',
                                          border:'1px solid var(--amber-200)', borderRadius:20, padding:'2px 7px' }}>
                                        <ShieldAlert size={9}/> Clave temporal
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td style={{ fontSize:13, color:'var(--ink-500)' }}>{email}</td>
                                <td>
                                  {activeProfile ? (
                                    <span className="badge" style={{ background: activeProfile.color + '22', color: activeProfile.color, fontSize:11, border:`1px solid ${activeProfile.color}44` }}>
                                      <span className="badge-dot" style={{ background: activeProfile.color }} />
                                      {activeProfile.label}
                                    </span>
                                  ) : (
                                    <span className="badge" style={{ background:meta.bg, color:meta.color, fontSize:11 }}>
                                      <span className="badge-dot" style={{ background:meta.color }} />
                                      {meta.label}
                                    </span>
                                  )}
                                </td>
                                <td style={{ fontSize:13 }}>
                                  {u.role === 'vecino'
                                    ? (() => {
                                        const unit = units.find(x => String(x.id) === String(u.unit));
                                        return unit
                                          ? [unit.unit_id_code, unit.unit_name].filter(Boolean).join(' — ')
                                          : (u.unit_code || <span style={{ color:'var(--coral-400)' }}>Sin unidad</span>);
                                      })()
                                    : <span style={{ color:'var(--ink-300)' }}>—</span>
                                  }
                                </td>
                                <td>{u.must_change_password?<span className="badge badge-amber">Cambio pendiente</span>:<span className="badge badge-teal">Activa</span>}</td>
                                {isAdmin && (
                                  <td>
                                    <div style={{ display:'flex', gap:4, justifyContent:'center' }}>
                                      <button className="btn-ghost" style={{ color:'var(--teal-600)' }} title="Editar"
                                        onClick={() => openEditUser(u)}>
                                        <Pencil size={13}/>
                                      </button>
                                      {u.user !== user?.id && (
                                        <button className="btn-ghost" style={{ color:'var(--coral-500)' }} title="Eliminar" onClick={async () => {
                                          if (window.confirm(`¿Eliminar usuario ${email}?`)) {
                                            await usersAPI.delete(tenantId, u.id);
                                            loadUsers(); toast.success('Usuario eliminado');
                                          }
                                        }}><Trash2 size={13}/></button>
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

                    {filtered.length > usersPageSize && (
                      <div className="pag-bar">
                        <span className="pag-left">Mostrando {uStart}–{uEnd} de {filtered.length}</span>
                        <div className="pag-right">
                          <div className="pag-per-page">
                            Mostrar
                            <select value={usersPageSize} onChange={e => { setUsersPageSize(Number(e.target.value)); setUsersPage(1); }}>
                              {USERS_PAGE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
                            </select>
                            por página
                          </div>
                          <div className="pag-btns">
                            <button className="pag-btn" disabled={safePage <= 1} onClick={() => setUsersPage(1)} title="Primera página">«</button>
                            <button className="pag-btn" disabled={safePage <= 1} onClick={() => setUsersPage(p => p - 1)} title="Anterior">‹</button>
                            {userPageNums.map((p, i) =>
                              p === '…'
                                ? <span key={`el-${i}`} style={{ padding:'0 4px', color:'var(--ink-300)', lineHeight:'28px' }}>…</span>
                                : <button key={p} className={`pag-btn ${p === safePage ? 'active' : ''}`} onClick={() => setUsersPage(p)}>{p}</button>
                            )}
                            <button className="pag-btn" disabled={safePage >= totalUserPages} onClick={() => setUsersPage(p => p + 1)} title="Siguiente">›</button>
                            <button className="pag-btn" disabled={safePage >= totalUserPages} onClick={() => setUsersPage(totalUserPages)} title="Última página">»</button>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )
              }
            </div>
          </div>
        );
      })()}

      {/* ════ ROLES ════ */}
      {tab === 'roles' && (
        <div style={{ display:'grid', gap:20 }}>
          {isSuperAdmin && (
            <div className="card">
              <div className="card-head">
                <h3>Super Administradores</h3>
                <button className="btn btn-primary btn-sm" onClick={() => { setAddSAForm({ name:'', email:'', password:'' }); setAddSAOpen(true); }}>
                  <Plus size={14}/> Agregar
                </button>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Nombre</th><th>Email</th><th>Rol</th><th>Estado</th><th style={{ width:80 }}>Acciones</th></tr>
                  </thead>
                  <tbody>
                    {superAdmins.map(sa => (
                      <tr key={sa.id}>
                        <td style={{ fontWeight:600 }}>{sa.name || sa.email}</td>
                        <td style={{ fontSize:13, color:'var(--ink-400)' }}>{sa.email}</td>
                        <td><span className="badge badge-coral"><span className="badge-dot" style={{ background:'var(--coral-500)' }} />Super Admin</span></td>
                        <td>{sa.must_change_password
                          ? <span className="badge badge-amber">Cambio pendiente</span>
                          : <span className="badge badge-teal">Activa</span>}
                        </td>
                        <td>
                          <button className="btn-ghost" style={{ color:'var(--coral-500)' }} onClick={() => deleteSuperAdmin(sa.id)}>
                            <Trash2 size={16}/>
                          </button>
                        </td>
                      </tr>
                    ))}
                    {superAdmins.length === 0 && (
                      <tr><td colSpan={5} style={{ textAlign:'center', color:'var(--ink-300)', padding:20 }}>Sin super administradores</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="card">
            <div className="card-head"><h3>Roles del Sistema</h3></div>
            <div className="card-body">
              <div className="roles-grid">
                {Object.entries(ROLE_META).filter(([k]) => !['superadmin','super_admin'].includes(k)).map(([key, meta]) => {
                  const count = tenantUsers.filter(u => u.role === key).length;
                  return (
                    <div className="role-card" key={key}>
                      <div className="role-card-bar" style={{ background:meta.color }} />
                      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8, marginTop:6 }}>
                        <div style={{ width:28, height:28, borderRadius:8, background:meta.bg, display:'flex', alignItems:'center', justifyContent:'center' }}>
                          <Users size={13} color={meta.color} />
                        </div>
                        <h4 style={{ color:meta.color, fontSize:13 }}>{meta.label}</h4>
                      </div>
                      <p style={{ color:'var(--ink-400)', fontSize:12, lineHeight:1.5 }}>{meta.desc}</p>
                      <div className="role-card-count">{count} usuario{count!==1?'s':''}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ── Perfiles Personalizados ─────────────────────────────── */}
          <div className="card">
            <div className="card-head">
              <h3>Perfiles Personalizados</h3>
              {isAdmin && (
                <button className="btn btn-primary btn-sm"
                  onClick={() => {
                    setProfileForm({ label:'', color:'#0d9488', base_role:'tesorero', modules: [] });
                    setProfileModalOpen(true);
                  }}>
                  <Plus size={14}/> Nuevo Perfil
                </button>
              )}
            </div>
            <div className="card-body" style={{ paddingTop: customProfiles.length === 0 ? 20 : 0 }}>
              {customProfiles.length === 0 ? (
                <div style={{ padding:'24px 0', textAlign:'center', color:'var(--ink-400)' }}>
                  <Users size={32} style={{ display:'block', margin:'0 auto 10px', opacity:0.3 }} />
                  <div style={{ fontSize:13, fontWeight:600 }}>No hay perfiles personalizados</div>
                  <div style={{ fontSize:12, marginTop:4 }}>Crea un perfil para asignar accesos específicos a usuarios</div>
                </div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        {['Perfil','Rol Base','Módulos','Acciones'].map(h => (
                          <th key={h}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {customProfiles.map((p, idx) => {
                        const baseMeta = ROLE_META[p.base_role] || {};
                        const modCount = (p.modules || []).length;
                        return (
                          <tr key={p.id || idx}>
                            <td style={{ fontWeight:600 }}>
                              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                                <span style={{ display:'inline-block', width:10, height:10, borderRadius:'50%', background: p.color || 'var(--teal-500)', flexShrink:0 }} />
                                {p.label}
                              </div>
                            </td>
                            <td>
                              <span className="badge" style={{ background: baseMeta.bg || 'var(--sand-100)', color: baseMeta.color || 'var(--ink-500)' }}>
                                <span className="badge-dot" style={{ background: baseMeta.color || 'var(--ink-400)' }} />
                                {baseMeta.label || p.base_role}
                              </span>
                            </td>
                            <td style={{ fontSize:13, color:'var(--ink-500)' }}>
                              {modCount === 0 ? 'Todos (rol base)' : `${modCount} módulo${modCount !== 1 ? 's' : ''}`}
                            </td>
                            <td>
                              {isAdmin && (
                                <div style={{ display:'flex', gap:4 }}>
                                  <button className="btn-ghost" style={{ color:'var(--teal-600)' }} title="Editar"
                                    onClick={() => { setProfileForm({ ...p }); setProfileModalOpen(true); }}>
                                    <Pencil size={13}/>
                                  </button>
                                  <button className="btn-ghost" style={{ color:'var(--coral-500)' }} title="Eliminar"
                                    onClick={() => {
                                      if (window.confirm(`¿Eliminar el perfil "${p.label}"? Los usuarios asignados quedarán con su rol base.`)) {
                                        setCustomProfiles(prev => prev.filter(x => x.id !== p.id));
                                      }
                                    }}>
                                    <Trash2 size={13}/>
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {isAdmin && customProfiles.length > 0 && (
                <div style={{ marginTop:12, padding:'8px 0', fontSize:12, color:'var(--ink-400)', borderTop:'1px solid var(--sand-100)' }}>
                  Los cambios en perfiles se guardan al hacer clic en <strong>Guardar Cambios</strong> en el tab de Módulos.
                </div>
              )}
            </div>
          </div>

          {/* ── Flujo de Cierre de Período ──────────────────────────── */}
          <div className="card">
            <div className="card-head">
              <h3 style={{ display:'flex', alignItems:'center', gap:8 }}>
                <Lock size={16} style={{ color:'var(--teal-600)' }}/> Flujo de Cierre de Período
              </h3>
              {isAdmin && (
                <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, cursor:'pointer' }}>
                  <input
                    type="checkbox"
                    checked={closureFlow.enabled}
                    onChange={e => setClosureFlow(prev => ({ ...prev, enabled: e.target.checked }))}
                  />
                  Flujo habilitado
                </label>
              )}
            </div>
            <div className="card-body">
              <p style={{ fontSize:13, color:'var(--ink-400)', marginBottom:16 }}>
                Configura una cadena de aprobaciones requeridas antes de que un período contable pueda cerrarse.
                Si no hay pasos configurados, el administrador o tesorero puede cerrar directamente.
              </p>

              {/* Steps list */}
              <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:16 }}>
                {closureFlow.steps.length === 0 && (
                  <div style={{ padding:'16px 0', textAlign:'center', color:'var(--ink-300)', fontSize:13 }}>
                    <ListOrdered size={28} style={{ display:'block', margin:'0 auto 8px', opacity:0.3 }} />
                    No hay pasos configurados — el cierre es directo (sin aprobaciones).
                  </div>
                )}
                {closureFlow.steps.map((step, idx) => {
                  const approverUser = tenantUsers.find(u => u.user === step.user_id || u.id === step.user_id);
                  return (
                    <div key={idx} style={{
                      display:'flex', alignItems:'center', gap:10,
                      background:'var(--sand-50)', borderRadius:8, padding:'10px 14px',
                      border:'1px solid var(--sand-100)',
                    }}>
                      <span style={{
                        width:24, height:24, borderRadius:'50%',
                        background:'var(--teal-600)', color:'#fff',
                        display:'flex', alignItems:'center', justifyContent:'center',
                        fontSize:11, fontWeight:700, flexShrink:0,
                      }}>{idx + 1}</span>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontWeight:600, fontSize:13 }}>{step.label || `Paso ${idx + 1}`}</div>
                        <div style={{ fontSize:11, color:'var(--ink-400)' }}>
                          {approverUser?.name || step.user_name || 'Usuario no encontrado'}
                          {approverUser?.email ? ` · ${approverUser.email}` : ''}
                        </div>
                      </div>
                      {isAdmin && (
                        <div style={{ display:'flex', gap:4 }}>
                          <button
                            className="btn btn-sm"
                            disabled={idx === 0}
                            style={{ padding:'3px 7px', opacity: idx === 0 ? 0.4 : 1 }}
                            onClick={() => {
                              setClosureFlow(prev => {
                                const s = [...prev.steps];
                                [s[idx - 1], s[idx]] = [s[idx], s[idx - 1]];
                                return { ...prev, steps: s.map((x, i) => ({ ...x, order: i + 1 })) };
                              });
                            }}>
                            <ArrowUp size={12}/>
                          </button>
                          <button
                            className="btn btn-sm"
                            disabled={idx === closureFlow.steps.length - 1}
                            style={{ padding:'3px 7px', opacity: idx === closureFlow.steps.length - 1 ? 0.4 : 1 }}
                            onClick={() => {
                              setClosureFlow(prev => {
                                const s = [...prev.steps];
                                [s[idx], s[idx + 1]] = [s[idx + 1], s[idx]];
                                return { ...prev, steps: s.map((x, i) => ({ ...x, order: i + 1 })) };
                              });
                            }}>
                            <ArrowDown size={12}/>
                          </button>
                          <button
                            className="btn btn-sm btn-danger"
                            style={{ padding:'3px 7px' }}
                            onClick={() => {
                              setClosureFlow(prev => ({
                                ...prev,
                                steps: prev.steps.filter((_, i) => i !== idx).map((x, i) => ({ ...x, order: i + 1 })),
                              }));
                            }}>
                            <Trash2 size={12}/>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Add step form */}
              {isAdmin && (addingFlowStep ? (
                <div style={{
                  background:'var(--sand-50)', borderRadius:8, padding:14,
                  border:'1px solid var(--sand-200)', display:'flex', flexDirection:'column', gap:10,
                }}>
                  <div style={{ fontWeight:600, fontSize:13 }}>Agregar paso de aprobación</div>
                  <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
                    <div style={{ flex:1, minWidth:160 }}>
                      <label style={{ fontSize:11, color:'var(--ink-400)', display:'block', marginBottom:4 }}>Aprobador *</label>
                      <select
                        className="input"
                        value={newFlowStepUser}
                        onChange={e => setNewFlowStepUser(e.target.value)}
                        style={{ width:'100%' }}>
                        <option value="">— Seleccionar usuario —</option>
                        {tenantUsers.filter(tu => ['admin','tesorero','contador'].includes(tu.role)).map(tu => (
                          <option key={tu.user} value={tu.user}>{tu.name} ({ROLE_META[tu.role]?.label || tu.role})</option>
                        ))}
                      </select>
                    </div>
                    <div style={{ flex:1, minWidth:140 }}>
                      <label style={{ fontSize:11, color:'var(--ink-400)', display:'block', marginBottom:4 }}>Etiqueta del paso</label>
                      <input
                        className="input"
                        placeholder="ej. Aprobación Tesorero"
                        value={newFlowStepLabel}
                        onChange={e => setNewFlowStepLabel(e.target.value)}
                        style={{ width:'100%' }}
                      />
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:8 }}>
                    <button
                      className="btn btn-primary btn-sm"
                      disabled={!newFlowStepUser}
                      onClick={() => {
                        const selectedUser = tenantUsers.find(tu => tu.user === newFlowStepUser);
                        setClosureFlow(prev => ({
                          ...prev,
                          steps: [
                            ...prev.steps,
                            {
                              order: prev.steps.length + 1,
                              user_id: newFlowStepUser,
                              user_name: selectedUser?.name || '',
                              label: newFlowStepLabel || `Paso ${prev.steps.length + 1}`,
                            },
                          ],
                        }));
                        setNewFlowStepUser('');
                        setNewFlowStepLabel('');
                        setAddingFlowStep(false);
                      }}>
                      <Check size={13}/> Agregar paso
                    </button>
                    <button className="btn btn-sm" onClick={() => { setAddingFlowStep(false); setNewFlowStepUser(''); setNewFlowStepLabel(''); }}>
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <button className="btn btn-sm" onClick={() => setAddingFlowStep(true)}>
                  <Plus size={13}/> Agregar paso de aprobación
                </button>
              ))}

              {/* Save button */}
              {isAdmin && (
                <div style={{ marginTop:16, borderTop:'1px solid var(--sand-100)', paddingTop:12, display:'flex', justifyContent:'flex-end' }}>
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={closureFlowSaving}
                    onClick={async () => {
                      setClosureFlowSaving(true);
                      try {
                        await tenantsAPI.update(tenantId, { closure_flow: closureFlow });
                        toast.success('Flujo de cierre guardado');
                        loadTenant();
                      } catch (e) {
                        toast.error(e.response?.data?.detail || 'Error al guardar');
                      } finally { setClosureFlowSaving(false); }
                    }}>
                    {closureFlowSaving ? <Loader size={13} className="spin"/> : <Check size={13}/>}
                    {' '}Guardar Flujo
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ════ ORGANIZACIÓN ════ */}
      {tab === 'org' && (() => {
        const today = new Date().toISOString().slice(0,7);
        const activePos = positions.filter(p => (!p.start_date || p.start_date <= today) && (!p.end_date || p.end_date >= today));
        const futurePos = positions.filter(p => p.start_date && p.start_date > today);
        const pastPos = positions.filter(p => p.end_date && p.end_date < today);

        const PositionTable = ({ items, isActive: isActiveGroup }) => (
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
              <tr style={{ background:'var(--sand-50)' }}>
                <th style={{ padding:'10px 14px', textAlign:'left', fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:'var(--ink-400)' }}>Cargo</th>
                <th style={{ padding:'10px 14px', textAlign:'left', fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:'var(--ink-400)' }}>Responsable</th>
                <th style={{ padding:'10px 14px', textAlign:'left', fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:'var(--ink-400)' }}>Contacto</th>
                <th style={{ padding:'10px 14px', textAlign:'left', fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:'var(--ink-400)' }}>Comité</th>
                <th style={{ padding:'10px 14px', textAlign:'left', fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:'var(--ink-400)' }}>Unidad</th>
                <th style={{ padding:'10px 14px', textAlign:'left', fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:'var(--ink-400)' }}>Vigencia</th>
                {isAdmin && <th style={{ padding:'10px 14px', textAlign:'center', fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:'var(--ink-400)' }}>Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {items.map(pos => {
                const cm = pos.committee_id ? committees.find(c => c.id === pos.committee_id) : null;
                const posUnit = pos.holder_unit ? units.find(u => u.id === pos.holder_unit) : null;
                return (
                  <tr key={pos.id} style={{ borderBottom:'1px solid var(--sand-100)' }}>
                    <td style={{ padding:'12px 14px' }}><div style={{ fontWeight:700, color:'var(--ink-800)' }}>{pos.title}</div></td>
                    <td style={{ padding:'12px 14px' }}><div style={{ fontWeight:600, color:'var(--ink-700)' }}>{pos.holder_name || '—'}</div></td>
                    <td style={{ padding:'12px 14px' }}>
                      {pos.email && <div style={{ fontSize:12, color:'var(--ink-500)', display:'flex', alignItems:'center', gap:4 }}><Globe size={12}/> {pos.email}</div>}
                      {pos.phone && <div style={{ fontSize:12, color:'var(--ink-500)', marginTop:2 }}>{pos.phone}</div>}
                      {!pos.email && !pos.phone && <span style={{ color:'var(--ink-300)', fontSize:12 }}>—</span>}
                    </td>
                    <td style={{ padding:'12px 14px' }}>
                      {cm
                        ? <span style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'2px 8px', borderRadius:4, fontSize:11, fontWeight:600, background:'var(--blue-50)', color:'var(--blue-700)' }}><Users size={11}/> {cm.name}</span>
                        : <span style={{ color:'var(--ink-300)', fontSize:12 }}>—</span>}
                    </td>
                    <td style={{ padding:'12px 14px' }}>
                      {posUnit
                        ? <span style={{ fontFamily:'monospace', fontWeight:700, color:'var(--teal-600)', background:'var(--teal-50)', padding:'2px 8px', borderRadius:4, fontSize:12 }}>{posUnit.unit_id_code}</span>
                        : <span style={{ color:'var(--ink-300)', fontSize:12 }}>—</span>}
                    </td>
                    <td style={{ padding:'12px 14px' }}>
                      <div style={{ fontSize:12 }}>
                        {(pos.start_date || pos.end_date)
                          ? <span style={{ background:isActiveGroup?'var(--teal-50)':'var(--sand-100)', padding:'3px 8px', borderRadius:'var(--radius-full)', fontWeight:600, color:isActiveGroup?'var(--teal-700)':'var(--ink-500)' }}>
                              {pos.start_date ? periodLabel(pos.start_date) : '—'} → {pos.end_date ? periodLabel(pos.end_date) : 'Vigente'}
                            </span>
                          : <span style={{ color:'var(--ink-300)' }}>Sin definir</span>}
                      </div>
                    </td>
                    {isAdmin && (
                      <td style={{ padding:'12px 14px', textAlign:'center', whiteSpace:'nowrap' }}>
                        <button className="btn-ghost" style={{ marginRight:4 }} onClick={() => setPosForm({...pos})}><Edit2 size={14}/></button>
                        <button className="btn-ghost" style={{ color:'var(--coral-500)' }} onClick={async () => { if(window.confirm('¿Eliminar?')){await assemblyAPI.deletePosition(tenantId,pos.id);loadAssembly();}}}><Trash2 size={14}/></button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        );

        return (
        <div style={{ display:'grid', gap:20 }}>
          {/* Admin Externa panel */}
          {(t.admin_type === 'admin_externa' || t.admin_type === 'administrador') && (
            <div className="card" style={{ border:'2px solid var(--amber-200)' }}>
              <div className="card-head" style={{ background:'var(--amber-50)' }}>
                <h3 style={{ color:'var(--amber-700)', display:'flex', alignItems:'center', gap:6 }}><Building2 size={16}/> Administración Externa</h3>
                <span className="badge badge-amber">Servicio contratado</span>
              </div>
              <div className="card-body">
                <div className="form-grid">
                  <FieldView label="Empresa / Administrador" value={t.admin_externa_company} />
                  <FieldView label="Costo Mensual del Servicio" value={t.admin_externa_cost ? fmt(t.admin_externa_cost) : null} />
                  <FieldView label="Inicio del Contrato" value={t.admin_externa_start ? periodLabel(t.admin_externa_start) : null} />
                  <FieldView label="Fin del Contrato" value={t.admin_externa_end ? periodLabel(t.admin_externa_end) : null} />
                </div>
                <div style={{ marginTop:12, padding:'10px 14px', background:'var(--blue-50)', borderRadius:'var(--radius-sm)', fontSize:12, color:'var(--blue-700)', display:'flex', alignItems:'center', gap:6 }}>
                  <AlertCircle size={12}/> El costo del servicio de administración externa se registra como gasto obligatorio mensual.
                </div>
              </div>
            </div>
          )}

          {/* Committees */}
          <div className="card">
            <div className="card-head">
              <h3 style={{ color:'var(--blue-700)', display:'flex', alignItems:'center', gap:6 }}><Users size={16}/> Comités y Grupos de Trabajo</h3>
              {isAdmin && <button className="btn btn-primary btn-sm" onClick={() => setCmtForm({ name:'', description:'', exemption:false })}><Plus size={13}/> Nuevo Comité</button>}
            </div>
            {committees.length===0
              ? <div className="card-body" style={{ padding:24, textAlign:'center', color:'var(--ink-400)', fontSize:13 }}>Sin comités registrados. Agregue grupos de trabajo para organizar los cargos.</div>
              : <div style={{ padding:0 }}>
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                    <thead>
                      <tr style={{ background:'var(--sand-50)' }}>
                        <th style={{ padding:'10px 14px', textAlign:'left', fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:'var(--ink-400)' }}>Nombre</th>
                        <th style={{ padding:'10px 14px', textAlign:'left', fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:'var(--ink-400)' }}>Descripción</th>
                        <th style={{ padding:'10px 14px', textAlign:'center', fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:'var(--ink-400)' }}>Exención</th>
                        <th style={{ padding:'10px 14px', textAlign:'center', fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:'var(--ink-400)' }}>Miembros</th>
                        {isAdmin && <th style={{ padding:'10px 14px', textAlign:'center', fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:'var(--ink-400)' }}>Acciones</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {committees.map(cm => {
                        const memCount = positions.filter(p => p.committee_id === cm.id).length;
                        return (
                          <tr key={cm.id} style={{ borderBottom:'1px solid var(--sand-100)' }}>
                            <td style={{ padding:'12px 14px', fontWeight:700, color:'var(--ink-800)' }}>
                              <span style={{ display:'inline-flex', alignItems:'center', gap:6 }}><Users size={13}/> {cm.name}</span>
                            </td>
                            <td style={{ padding:'12px 14px', color:'var(--ink-500)', fontSize:12 }}>{cm.description || '—'}</td>
                            <td style={{ padding:'12px 14px', textAlign:'center' }}>
                              {cm.exemption
                                ? <span style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'2px 8px', borderRadius:4, fontSize:11, fontWeight:700, background:'var(--teal-50)', color:'var(--teal-700)' }}><Shield size={11}/> Sí</span>
                                : <span style={{ color:'var(--ink-300)' }}>No</span>}
                            </td>
                            <td style={{ padding:'12px 14px', textAlign:'center' }}><span className="badge badge-blue">{memCount}</span></td>
                            {isAdmin && (
                              <td style={{ padding:'12px 14px', textAlign:'center' }}>
                                <button className="btn-ghost" style={{ marginRight:4 }} onClick={() => setCmtForm({...cm})}><Edit2 size={14}/></button>
                                <button className="btn-ghost" style={{ color:'var(--coral-500)' }} onClick={async()=>{if(window.confirm('¿Eliminar?')){await assemblyAPI.deleteCommittee(tenantId,cm.id);loadAssembly();}}}><Trash2 size={14}/></button>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
            }
          </div>

          {/* Positions intro */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:12 }}>
            <div>
              <div style={{ fontSize:16, fontWeight:700, color:'var(--ink-800)' }}>Estructura de la Administración</div>
              <div style={{ fontSize:13, color:'var(--ink-400)', marginTop:4 }}>Cargos administrativos del condominio, información de contacto y vigencia de gestión.</div>
            </div>
            {isAdmin && <button className="btn btn-primary btn-sm" onClick={() => setPosForm({ title:'', holder_name:'', email:'', phone:'', start_date:'', end_date:'', holder_unit:'', committee_id:'', notes:'' })}><Plus size={13}/> Nuevo Cargo</button>}
          </div>

          {positions.length === 0 ? (
            <div style={{ textAlign:'center', padding:'48px 24px' }}>
              <Users size={48} color="var(--ink-300)" style={{ marginBottom:12 }}/>
              <h4 style={{ color:'var(--ink-500)' }}>Sin cargos registrados</h4>
              <p style={{ color:'var(--ink-400)', fontSize:13, marginTop:6 }}>Agregue los cargos de la mesa directiva y administración del condominio.</p>
            </div>
          ) : (
            <>
              {activePos.length > 0 && (
                <div className="card">
                  <div className="card-head">
                    <h3 style={{ color:'var(--teal-700)', display:'flex', alignItems:'center', gap:6 }}><Shield size={16}/> Cargos Vigentes</h3>
                    <span style={{ background:'var(--teal-50)', color:'var(--teal-700)', padding:'2px 10px', borderRadius:'var(--radius-full)', fontSize:12, fontWeight:700 }}>{activePos.length}</span>
                  </div>
                  <div style={{ padding:0 }}><PositionTable items={activePos} isActive /></div>
                </div>
              )}
              {futurePos.length > 0 && (
                <div className="card">
                  <div className="card-head">
                    <h3 style={{ color:'var(--blue-500)', display:'flex', alignItems:'center', gap:6 }}><Calendar size={16}/> Cargos Futuros</h3>
                    <span style={{ background:'var(--blue-50)', color:'var(--blue-500)', padding:'2px 10px', borderRadius:'var(--radius-full)', fontSize:12, fontWeight:700 }}>{futurePos.length}</span>
                  </div>
                  <div style={{ padding:0 }}><PositionTable items={futurePos} isActive={false} /></div>
                </div>
              )}
              {pastPos.length > 0 && (
                <div className="card">
                  <div className="card-head">
                    <h3 style={{ color:'var(--ink-400)', display:'flex', alignItems:'center', gap:6 }}><FileText size={16}/> Cargos Anteriores</h3>
                    <span style={{ background:'var(--sand-100)', color:'var(--ink-400)', padding:'2px 10px', borderRadius:'var(--radius-full)', fontSize:12, fontWeight:700 }}>{pastPos.length}</span>
                  </div>
                  <div style={{ padding:0 }}><PositionTable items={pastPos} isActive={false} /></div>
                </div>
              )}
            </>
          )}
        </div>
        );
      })()}

      {/* ══════════════════════════ TAB: MÓDULOS ══════════════════════════════ */}
      {tab === 'modules' && (
        <div>
          {/* Header */}
          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:20, flexWrap:'wrap', gap:12 }}>
            <div>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                <Layers size={18} color="var(--teal-600)" />
                <h3 style={{ margin:0, fontSize:16, fontWeight:700, color:'var(--ink-800)' }}>Visibilidad de Módulos</h3>
              </div>
              <p style={{ margin:0, fontSize:13, color:'var(--ink-400)' }}>
                Activa o desactiva los módulos del menú principal para cada perfil de usuario en este condominio.
                Los módulos desactivados no serán visibles para los usuarios de ese perfil.
              </p>
            </div>
            {isAdmin && (
              <button className="btn btn-primary" onClick={saveModulePermissions} disabled={moduleSaving}>
                <Check size={14} /> {moduleSaving ? 'Guardando…' : 'Guardar Cambios'}
              </button>
            )}
          </div>

          {/* Info banner */}
          <div style={{ padding:'10px 14px', background:'var(--amber-50)', border:'1px solid var(--amber-100)', borderRadius:'var(--radius-md)', fontSize:12, color:'var(--amber-700)', display:'flex', alignItems:'center', gap:8, marginBottom:20 }}>
            <AlertCircle size={14} style={{ flexShrink:0 }}/>
            <span>Las celdas en gris indican que el módulo no está disponible para ese perfil (sin importar la configuración). Solo puedes activar/desactivar los módulos que aplican a cada rol.</span>
          </div>

          {/* Matrix card */}
          <div className="card" style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', minWidth:700 }}>
              <thead>
                <tr style={{ background:'var(--sand-50)', borderBottom:'1px solid var(--sand-100)' }}>
                  <th style={{ padding:'12px 16px', textAlign:'left', fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.05em', color:'var(--ink-400)', width:220 }}>
                    Módulo
                  </th>
                  {TENANT_ROLES.map(role => {
                    const meta = ROLE_META[role] || {};
                    return (
                      <th key={role} style={{ padding:'10px 8px', textAlign:'center', fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.05em', color: meta.color || 'var(--ink-400)', minWidth:90 }}>
                        <span style={{ display:'inline-flex', flexDirection:'column', alignItems:'center', gap:3 }}>
                          <span style={{ padding:'2px 8px', borderRadius:'var(--radius-full)', background: meta.bg || 'var(--sand-50)', fontSize:10, fontWeight:700 }}>
                            {meta.label || role}
                          </span>
                        </span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {MODULE_DEFINITIONS.map((mod, idx) => {
                  const Icon = mod.icon;
                  return (
                    <tr key={mod.key} style={{ borderBottom:'1px solid var(--sand-100)', background: idx % 2 === 0 ? 'var(--white)' : 'var(--sand-50)' }}>
                      {/* Module name + description */}
                      <td style={{ padding:'14px 16px' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <span style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:30, height:30, borderRadius:'var(--radius-sm)', background:'var(--teal-50)', flexShrink:0 }}>
                            <Icon size={14} color="var(--teal-600)" />
                          </span>
                          <div>
                            <div style={{ fontSize:13, fontWeight:600, color:'var(--ink-800)' }}>{mod.label}</div>
                            <div style={{ fontSize:11, color:'var(--ink-400)', marginTop:1 }}>{mod.desc}</div>
                          </div>
                        </div>
                      </td>
                      {/* Permission level per role */}
                      {TENANT_ROLES.map(roleKey => {
                        const access = getModuleAccess(roleKey, mod.key);
                        const LEVELS = [
                          { key:'hidden', Icon:EyeOff, label:'Oculto',   activeColor:'var(--coral-500)', activeBg:'var(--coral-50)'  },
                          { key:'read',   Icon:Eye,    label:'Lectura',   activeColor:'var(--blue-600)',  activeBg:'var(--blue-50)'   },
                          { key:'write',  Icon:Pencil, label:'Completo',  activeColor:'var(--teal-600)',  activeBg:'var(--teal-50)'   },
                        ];
                        const active = LEVELS.find(l => l.key === access);
                        return (
                          <td key={roleKey} style={{ padding:'8px 6px', textAlign:'center' }}>
                            {access === 'na' ? (
                              <div style={{ display:'inline-flex', flexDirection:'column', alignItems:'center', gap:3 }}>
                                <span style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:66, height:24, borderRadius:8, background:'var(--sand-100)', color:'var(--ink-300)' }}>
                                  <Lock size={10}/>
                                </span>
                                <span style={{ fontSize:9, color:'var(--ink-300)', fontWeight:600 }}>N/A</span>
                              </div>
                            ) : (
                              <div style={{ display:'inline-flex', flexDirection:'column', alignItems:'center', gap:3 }}>
                                {/* Pill with 3 buttons */}
                                <div style={{ display:'inline-flex', borderRadius:8, overflow:'hidden', border:'1px solid var(--sand-200)' }}>
                                  {LEVELS.map(({ key, Icon: LvIcon, label, activeColor, activeBg }) => {
                                    const isActive = access === key;
                                    return (
                                      <button key={key} type="button"
                                        title={label}
                                        onClick={() => isAdmin && setModuleAccess(roleKey, mod.key, key)}
                                        style={{
                                          width:22, height:22, border:'none', padding:0,
                                          display:'flex', alignItems:'center', justifyContent:'center',
                                          background: isActive ? activeBg : 'var(--white)',
                                          color: isActive ? activeColor : 'var(--ink-200)',
                                          cursor: isAdmin ? 'pointer' : 'default',
                                          transition:'all 0.12s',
                                          borderRight: key !== 'write' ? '1px solid var(--sand-200)' : 'none',
                                        }}>
                                        <LvIcon size={10}/>
                                      </button>
                                    );
                                  })}
                                </div>
                                <span style={{ fontSize:9, fontWeight:700, color: active?.activeColor || 'var(--ink-400)' }}>
                                  {active?.label}
                                </span>
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div style={{ display:'flex', alignItems:'center', gap:16, marginTop:14, fontSize:11, color:'var(--ink-500)', flexWrap:'wrap' }}>
            <span style={{ display:'flex', alignItems:'center', gap:5 }}>
              <EyeOff size={12} color="var(--coral-500)"/>
              <span style={{ color:'var(--coral-600)', fontWeight:600 }}>Oculto</span> — sin acceso ni visibilidad
            </span>
            <span style={{ display:'flex', alignItems:'center', gap:5 }}>
              <Eye size={12} color="var(--blue-600)"/>
              <span style={{ color:'var(--blue-700)', fontWeight:600 }}>Lectura</span> — visible, solo consulta
            </span>
            <span style={{ display:'flex', alignItems:'center', gap:5 }}>
              <Pencil size={12} color="var(--teal-600)"/>
              <span style={{ color:'var(--teal-700)', fontWeight:600 }}>Completo</span> — lectura + escritura
            </span>
            <span style={{ display:'flex', alignItems:'center', gap:5 }}>
              <Lock size={12} color="var(--ink-300)"/>
              <span style={{ color:'var(--ink-400)' }}>N/A</span> — no aplica para este rol
            </span>
          </div>

          {/* ── Reservation Settings ─────────────────────────────────────── */}
          <div style={{
            marginTop: 28, padding: '20px 22px',
            background: 'var(--white)', border: '1px solid var(--sand-100)',
            borderRadius: 'var(--radius-lg)',
          }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
              <span style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:32, height:32, borderRadius:'var(--radius-sm)', background:'var(--teal-50)', flexShrink:0 }}>
                <Calendar size={15} color="var(--teal-600)" />
              </span>
              <div>
                <div style={{ fontSize:14, fontWeight:700, color:'var(--ink-800)' }}>Configuración de Reservas</div>
                <div style={{ fontSize:12, color:'var(--ink-400)', marginTop:1 }}>Define cómo se gestionan las solicitudes de reserva de áreas comunes</div>
              </div>
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {[
                {
                  value: 'require_vecinos',
                  label: 'Requerir aprobación solo para vecinos',
                  desc: 'Los vecinos y vigilantes envían solicitudes que deben aprobar admin / tesorero. Admins y tesoreros crean reservas auto-aprobadas.',
                },
                {
                  value: 'require_all',
                  label: 'Requerir aprobación para todos',
                  desc: 'Cualquier solicitud (incluidos admin y tesorero) queda en estado Pendiente hasta ser aprobada manualmente.',
                },
                {
                  value: 'auto_approve_all',
                  label: 'Auto-aprobar todas las reservas',
                  desc: 'Todas las solicitudes se aprueban automáticamente sin pasar por revisión.',
                },
              ].map(opt => {
                const active = (reservationSettings.approval_mode || 'require_vecinos') === opt.value;
                return (
                  <label
                    key={opt.value}
                    style={{
                      display:'flex', alignItems:'flex-start', gap:12,
                      padding:'12px 14px', borderRadius:'var(--radius-md)',
                      border:`1.5px solid ${active ? 'var(--teal-400)' : 'var(--sand-100)'}`,
                      background: active ? 'var(--teal-50)' : 'var(--white)',
                      cursor: isAdmin ? 'pointer' : 'default',
                      transition:'all 0.15s',
                    }}
                  >
                    <input
                      type="radio"
                      name="approval_mode"
                      value={opt.value}
                      checked={active}
                      disabled={!isAdmin}
                      onChange={() => isAdmin && setReservationSettings(s => ({ ...s, approval_mode: opt.value }))}
                      style={{ marginTop:3, accentColor:'var(--teal-500)', flexShrink:0 }}
                    />
                    <div>
                      <div style={{ fontSize:13, fontWeight:active ? 700 : 600, color: active ? 'var(--teal-700)' : 'var(--ink-700)' }}>
                        {opt.label}
                      </div>
                      <div style={{ fontSize:12, color:'var(--ink-400)', marginTop:2, lineHeight:1.4 }}>
                        {opt.desc}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* ── Per-role reservation permissions ─────────────────────────── */}
          <div style={{
            marginTop: 20, padding: '18px 22px',
            background: 'var(--white)', border: '1px solid var(--sand-100)',
            borderRadius: 'var(--radius-lg)',
          }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
              <span style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:32, height:32, borderRadius:'var(--radius-sm)', background:'var(--teal-50)', flexShrink:0 }}>
                <Shield size={15} color="var(--teal-600)" />
              </span>
              <div>
                <div style={{ fontSize:14, fontWeight:700, color:'var(--ink-800)' }}>Permisos de Reservas por Rol</div>
                <div style={{ fontSize:12, color:'var(--ink-400)', marginTop:1 }}>Define qué roles pueden solicitar y aprobar reservas de áreas comunes</div>
              </div>
            </div>

            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ borderBottom:'1.5px solid var(--sand-100)' }}>
                  <th style={{ textAlign:'left', fontSize:11, fontWeight:700, color:'var(--ink-400)', textTransform:'uppercase', letterSpacing:'0.05em', padding:'6px 10px 8px 0' }}>
                    Rol
                  </th>
                  <th style={{ textAlign:'center', fontSize:11, fontWeight:700, color:'var(--ink-400)', textTransform:'uppercase', letterSpacing:'0.05em', padding:'6px 0 8px', width:160 }}>
                    Puede Solicitar
                  </th>
                  <th style={{ textAlign:'center', fontSize:11, fontWeight:700, color:'var(--ink-400)', textTransform:'uppercase', letterSpacing:'0.05em', padding:'6px 0 8px', width:180 }}>
                    Puede Aprobar / Rechazar
                  </th>
                </tr>
              </thead>
              <tbody>
                {TENANT_ROLES.map((roleKey, ri) => {
                  const meta    = ROLE_META[roleKey];
                  const perms   = (reservationSettings.role_permissions || {})[roleKey] ?? DEFAULT_RESERVATION_ROLE_PERMS[roleKey] ?? { can_request: false, can_approve: false };
                  const isLocked = roleKey === 'admin'; // admin always has full access
                  const Toggle  = ({ checked, onChange, locked }) => (
                    <button
                      type="button"
                      onClick={() => !locked && isAdmin && onChange(!checked)}
                      disabled={locked || !isAdmin}
                      style={{
                        display:'inline-flex', alignItems:'center', gap:6,
                        padding:'4px 12px', borderRadius:20, border:'none',
                        background: checked ? 'var(--teal-50)' : 'var(--sand-50)',
                        color: checked ? 'var(--teal-700)' : 'var(--ink-400)',
                        fontWeight:700, fontSize:11,
                        cursor: (locked || !isAdmin) ? 'default' : 'pointer',
                        opacity: locked ? 0.65 : 1,
                        transition:'all 0.15s',
                      }}
                    >
                      <span style={{
                        width:10, height:10, borderRadius:'50%', flexShrink:0,
                        background: checked ? 'var(--teal-500)' : 'var(--sand-200)',
                      }} />
                      {checked ? 'Sí' : 'No'}
                    </button>
                  );
                  return (
                    <tr key={roleKey} style={{ borderBottom: ri < TENANT_ROLES.length - 1 ? '1px solid var(--sand-50)' : 'none' }}>
                      <td style={{ padding:'10px 10px 10px 0' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <span style={{
                            display:'inline-block', padding:'2px 9px', borderRadius:20, fontSize:11, fontWeight:700,
                            background: meta?.bg || 'var(--sand-100)',
                            color: meta?.color || 'var(--ink-600)',
                          }}>
                            {meta?.label || roleKey}
                          </span>
                          {isLocked && (
                            <span style={{ fontSize:10, color:'var(--ink-300)', fontStyle:'italic' }}>siempre habilitado</span>
                          )}
                        </div>
                      </td>
                      <td style={{ textAlign:'center', padding:'10px 0' }}>
                        <Toggle
                          checked={perms.can_request}
                          locked={isLocked}
                          onChange={v => updateReservationRolePerm(roleKey, 'can_request', v)}
                        />
                      </td>
                      <td style={{ textAlign:'center', padding:'10px 0' }}>
                        <Toggle
                          checked={perms.can_approve}
                          locked={isLocked}
                          onChange={v => updateReservationRolePerm(roleKey, 'can_approve', v)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
           MODALS
      ══════════════════════════════════════════════════════════ */}

      {/* Modal: Área Común */}
      {areaModalOpen && (
        <Modal
          title={areaForm._isNew ? 'Nueva Área Común' : 'Editar Área Común'}
          onClose={() => setAreaModalOpen(false)}
          onSave={saveArea}
          saving={areaSaving}
        >
          <div className="form-grid">
            {/* Nombre */}
            <div className="field field-full">
              <label className="field-label">Nombre del Área *</label>
              <input className="field-input" placeholder="Ej: Alberca, Gimnasio, Salón de eventos..."
                value={areaForm.name || ''}
                onChange={e => setAreaForm(f => ({ ...f, name: e.target.value }))} />
            </div>

            {/* Toggles */}
            <div className="field">
              <label className="field-label">Estado</label>
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button
                  className={`badge ${areaForm.active ? 'badge-teal' : 'badge-amber'}`}
                  style={{ cursor: 'pointer', border: 'none', padding: '6px 14px', fontSize: 12 }}
                  onClick={() => setAreaForm(f => ({ ...f, active: !f.active }))}
                >
                  {areaForm.active ? '✓ Activa' : '✗ Inactiva'}
                </button>
              </div>
            </div>

            <div className="field">
              <label className="field-label">Permitir Reservas</label>
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button
                  className={`badge ${areaForm.reservations_enabled ? 'badge-blue' : ''}`}
                  style={{ cursor: 'pointer', border: '1px solid var(--sand-200)', padding: '6px 14px', fontSize: 12,
                    background: areaForm.reservations_enabled ? undefined : 'var(--sand-50)', color: areaForm.reservations_enabled ? undefined : 'var(--ink-500)' }}
                  onClick={() => setAreaForm(f => ({ ...f, reservations_enabled: !f.reservations_enabled, charge_enabled: !f.reservations_enabled ? f.charge_enabled : false }))}
                >
                  {areaForm.reservations_enabled ? '✓ Habilitado' : '✗ Deshabilitado'}
                </button>
              </div>
            </div>

            {areaForm.reservations_enabled && (<>
              <div className="field">
                <label className="field-label">Cobrar por Reserva</label>
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <button
                    className={`badge ${areaForm.charge_enabled ? 'badge-amber' : ''}`}
                    style={{ cursor: 'pointer', border: '1px solid var(--sand-200)', padding: '6px 14px', fontSize: 12,
                      background: areaForm.charge_enabled ? undefined : 'var(--sand-50)', color: areaForm.charge_enabled ? undefined : 'var(--ink-500)' }}
                    onClick={() => setAreaForm(f => ({ ...f, charge_enabled: !f.charge_enabled, charge_amount: !f.charge_enabled ? f.charge_amount : 0 }))}
                  >
                    {areaForm.charge_enabled ? '✓ Con cobro' : '✗ Sin cobro'}
                  </button>
                </div>
              </div>

              {areaForm.charge_enabled && (
                <div className="field">
                  <label className="field-label">Monto por Reserva ({t.currency || 'MXN'})</label>
                  <input className="field-input" type="number" min="0" step="1"
                    placeholder="0"
                    value={areaForm.charge_amount || ''}
                    onChange={e => setAreaForm(f => ({ ...f, charge_amount: parseFloat(e.target.value) || 0 }))} />
                </div>
              )}
            </>)}

            {/* Políticas */}
            <div className="field field-full">
              <label className="field-label">Política de Uso</label>
              <textarea className="field-input" rows={3}
                placeholder="Horario permitido, reglas de uso, aforo máximo..."
                style={{ resize: 'vertical', fontFamily: 'var(--font-body)', fontSize: 13 }}
                value={areaForm.usage_policy || ''}
                onChange={e => setAreaForm(f => ({ ...f, usage_policy: e.target.value }))} />
            </div>

            {areaForm.reservations_enabled && (
              <div className="field field-full">
                <label className="field-label">Política de Reservas</label>
                <textarea className="field-input" rows={3}
                  placeholder="Tiempo de anticipación, duración máxima, cancelaciones..."
                  style={{ resize: 'vertical', fontFamily: 'var(--font-body)', fontSize: 13 }}
                  value={areaForm.reservation_policy || ''}
                  onChange={e => setAreaForm(f => ({ ...f, reservation_policy: e.target.value }))} />
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Edit Datos Fiscales */}
      {editInfoOpen && (
        <Modal title="Editar Datos Fiscales" large
          onClose={() => setEditInfoOpen(false)}
          onSave={() => savePatch(editInfoForm, () => setEditInfoOpen(false))}
          saving={saving}>
          <div className="form-grid">
            <div className="field field-full">
              <label className="field-label">Razón Social</label>
              <input className="field-input" value={editInfoForm.razon_social||''} onChange={e=>setEditInfoForm(f=>({...f,razon_social:e.target.value}))} />
            </div>
            <div className="field">
              <label className="field-label">RFC</label>
              <input className="field-input" style={{ fontFamily:'monospace' }} value={editInfoForm.rfc||''} onChange={e=>setEditInfoForm(f=>({...f,rfc:e.target.value}))} />
            </div>
            {[['info_calle','Calle'],['info_num_externo','No. Externo'],['info_colonia','Colonia'],['info_delegacion','Delegación'],['info_ciudad','Ciudad'],['info_codigo_postal','C.P.']].map(([k,l])=>(
              <div className="field" key={k}>
                <label className="field-label">{l}</label>
                <input className="field-input" value={editInfoForm[k]||''} onChange={e=>setEditInfoForm(f=>({...f,[k]:e.target.value}))} />
              </div>
            ))}
          </div>
        </Modal>
      )}

      {/* Edit Datos Generales */}
      {editAddrOpen && (() => {
        const isMX = t.country === 'México' || t.country === 'Mexico' || !t.country;
        return (
        <Modal title="Editar Datos Generales" large
          onClose={() => setEditAddrOpen(false)}
          onSave={() => savePatch(editAddrForm, () => setEditAddrOpen(false))}
          saving={saving}>
          <div className="form-grid">
            <div className="field field-full">
              <label className="field-label">Nombre del Edificio</label>
              <input className="field-input" value={editAddrForm.addr_nombre||''} onChange={e=>setEditAddrForm(f=>({...f,addr_nombre:e.target.value}))} />
            </div>
            {[['addr_calle','Calle'],['addr_num_externo','No. Externo']].map(([k,l])=>(
              <div className="field" key={k}>
                <label className="field-label">{l}</label>
                <input className="field-input" value={editAddrForm[k]||''} onChange={e=>setEditAddrForm(f=>({...f,[k]:e.target.value}))} />
              </div>
            ))}
            {isMX && [['addr_colonia','Colonia'],['addr_delegacion','Delegación'],['addr_ciudad','Ciudad'],['addr_codigo_postal','C.P.']].map(([k,l])=>(
              <div className="field" key={k}>
                <label className="field-label">{l}</label>
                <input className="field-input" value={editAddrForm[k]||''} onChange={e=>setEditAddrForm(f=>({...f,[k]:e.target.value}))} />
              </div>
            ))}
          </div>
        </Modal>
        );
      })()}

      {/* Edit General */}
      {editGenOpen && (
        <Modal title="Editar Configuración General" large
          onClose={() => setEditGenOpen(false)}
          onSave={() => savePatch(editGenForm, () => setEditGenOpen(false))}
          saveLabel="Actualizar" saving={saving}>
          <div className="form-grid">
            <div className="field field-full">
              <label className="field-label">Nombre del Condominio</label>
              <input className="field-input" value={editGenForm.name||''} onChange={e=>setEditGenForm(f=>({...f,name:e.target.value}))} />
            </div>
            <div className="field">
              <label className="field-label">Unidades</label>
              <input type="number" min="0" className="field-input" value={editGenForm.units_count||''} onChange={e=>setEditGenForm(f=>({...f,units_count:parseInt(e.target.value)||0}))} />
              <div style={{ fontSize:11, color:'var(--ink-400)', marginTop:4 }}>Número total de unidades del condominio</div>
            </div>
            <div className="field">
              <label className="field-label">Cuota de Mantenimiento</label>
              <input type="number" className="field-input" step="0.01" min="0" value={editGenForm.maintenance_fee||''} onChange={e=>setEditGenForm(f=>({...f,maintenance_fee:e.target.value}))} />
            </div>
            <div className="field">
              <label className="field-label">Moneda</label>
              <select className="field-select" value={editGenForm.currency||'MXN'} onChange={e=>setEditGenForm(f=>({...f,currency:e.target.value}))}>
                {Object.entries(CURRENCIES).map(([k,v])=><option key={k} value={k}>{v.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="field-label">Inicio de Operaciones</label>
              {(isSuperAdmin || isAdmin)
                ? <>
                    <input type="month" className="field-input" value={editGenForm.operation_start_date||''} onChange={e=>setEditGenForm(f=>({...f,operation_start_date:e.target.value}))} />
                    <div style={{ fontSize:11, color:'var(--teal-600)', marginTop:4, display:'flex', alignItems:'center', gap:4 }}><ShieldCheck size={11}/> {isSuperAdmin ? 'Como Super Admin puedes modificar la fecha de inicio' : 'Como Administrador puedes modificar la fecha de inicio'}</div>
                  </>
                : <>
                    <div className="field-value">
                      <span style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'4px 10px', background:'var(--teal-50)', border:'1px solid var(--teal-100)', borderRadius:'var(--radius-full)', fontSize:12, color:'var(--teal-700)' }}>
                        <Calendar size={12}/> {editGenForm.operation_start_date ? periodLabel(editGenForm.operation_start_date) : 'No configurado'}
                      </span>
                    </div>
                    <div style={{ fontSize:11, color:'var(--amber-500)', marginTop:4, display:'flex', alignItems:'center', gap:4 }}><Lock size={11}/> Solo el Administrador o Super Admin puede modificar el período inicial</div>
                  </>
              }
            </div>
            <div className="field">
              <label className="field-label">Tipo de Operación</label>
              <select className="field-select" value={editGenForm.operation_type||'fiscal'} onChange={e=>setEditGenForm(f=>({...f,operation_type:e.target.value}))}>
                <option value="fiscal">Operación Fiscal</option>
                <option value="custom">Operación Libre</option>
              </select>
              <div style={{ fontSize:11, color:'var(--ink-400)', marginTop:4 }}>
                {editGenForm.operation_type==='fiscal'?'Requiere datos fiscales (RFC, Razón Social, etc.)':'Solo datos básicos de dirección'}
              </div>
            </div>
            <div className="field">
              <label className="field-label">País</label>
              <select className="field-select" value={editGenForm.country||''} onChange={e=>setEditGenForm(f=>({...f,country:e.target.value}))}>
                <option value="">Seleccionar...</option>
                {COUNTRIES.map(c=><option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="field-label">Estado / Provincia</label>
              <select className="field-select" value={editGenForm.state||''} onChange={e=>setEditGenForm(f=>({...f,state:e.target.value}))}>
                <option value="">{getStatesForCountry(editGenForm.country).length===0?'Sin catálogo para este país':'— Seleccionar —'}</option>
                {getStatesForCountry(editGenForm.country).map(s=><option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="field-label">Tipo de Administración</label>
              <select className="field-select" value={editGenForm.admin_type||'mesa_directiva'} onChange={e=>setEditGenForm(f=>({...f,admin_type:e.target.value}))}>
                <option value="mesa_directiva">Mesa Directiva Interna</option>
                <option value="administrador">Administrador Externo</option>
                <option value="comite">Comité</option>
              </select>
              <div style={{ fontSize:11, color:'var(--ink-400)', marginTop:4 }}>
                {editGenForm.admin_type==='administrador'?'Administración profesional externa':'Administración por vecinos del condominio'}
              </div>
            </div>
            <div className="field">
              <label className="field-label">Saldo Inicial de Banco</label>
              <input type="number" step="0.01" min="0" className="field-input" value={editGenForm.bank_initial_balance||0} onChange={e=>setEditGenForm(f=>({...f,bank_initial_balance:parseFloat(e.target.value)||0}))} />
              <div style={{ fontSize:11, color:'var(--ink-400)', marginTop:4, display:'flex', alignItems:'center', gap:4 }}><DollarSign size={11}/> Saldo en cuenta bancaria al inicio de operaciones</div>
            </div>
          </div>
        </Modal>
      )}

      {/* Add/Edit Unit */}
      {unitModal && (
        <Modal title={unitModal==='add'?'Nueva Unidad':'Editar Unidad'} large
          onClose={() => setUnitModal(null)}
          onSave={handleUnitSave}
          saveLabel={unitModal==='add'?'Crear':'Actualizar'}
          saving={saving}>
          <div className="form-section-label">Datos de la Unidad</div>
          <div className="form-grid" style={{ marginBottom:24 }}>
            <div className="field"><label className="field-label">Nombre</label><input className="field-input" placeholder="Casa 1" value={unitForm.unit_name||''} onChange={e=>setUnitForm(f=>({...f,unit_name:e.target.value}))}/></div>
            <div className="field"><label className="field-label">ID / Código</label><input className="field-input" placeholder="C-001" value={unitForm.unit_id_code||''} onChange={e=>setUnitForm(f=>({...f,unit_id_code:e.target.value}))}/></div>
            <div className="field">
              <label className="field-label">Tipo de Ocupación</label>
              <select className="field-select" value={unitForm.occupancy||'propietario'} onChange={e=>setUnitForm(f=>({...f,occupancy:e.target.value}))}>
                <option value="propietario">Propietario habita la unidad</option>
                <option value="rentado">Rentada / Inquilino</option>
                <option value="vacío">Sin habitar</option>
              </select>
            </div>
            <div className="field">
              <label className="field-label">Adeudo previo</label>
              <input className="field-input" type="number" step="0.01" min="0" placeholder="0.00"
                value={unitForm.previous_debt || 0}
                onChange={e=>setUnitForm(f=>({...f,previous_debt:parseFloat(e.target.value)||0}))} />
              <div style={{ fontSize:11, color:'var(--ink-400)', marginTop:4 }}>Deuda previa al inicio de operaciones del sistema</div>
              <div style={{ marginTop:6, display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                <label className="btn btn-secondary btn-sm" style={{ cursor:'pointer', display:'inline-flex', alignItems:'center', gap:4 }}>
                  <Upload size={12} />
                  {unitForm.previous_debt_evidence ? '✓ PDF cargado' : 'Cargar PDF evidencia'}
                  <input type="file" accept=".pdf" style={{ display:'none' }} onChange={e=>{
                    const file=e.target.files?.[0]; if(!file) return;
                    if(file.type!=='application/pdf'){ toast.error('Solo se permiten archivos PDF.'); return; }
                    const r=new FileReader(); r.onload=()=>{ const b=r.result?.split(',')[1]||''; setUnitForm(f=>({...f,previous_debt_evidence:b})); }; r.readAsDataURL(file);
                    e.target.value='';
                  }} />
                </label>
                {unitForm.previous_debt_evidence && (
                  <button type="button" className="btn btn-secondary btn-sm" onClick={()=>{
                    const b64=unitForm.previous_debt_evidence;
                    if(!b64) return toast.error('No hay PDF cargado.');
                    const bytes=atob(b64); const arr=new Uint8Array(bytes.length);
                    for(let i=0;i<bytes.length;i++) arr[i]=bytes.charCodeAt(i);
                    const blob=new Blob([arr],{type:'application/pdf'});
                    const url=URL.createObjectURL(blob);
                    window.open(url,'_blank');
                    setTimeout(()=>URL.revokeObjectURL(url),15000);
                  }}><FileText size={12}/> Ver evidencia</button>
                )}
              </div>
            </div>
            <div className="field">
              <label className="field-label">Saldo a Favor Previo</label>
              <input className="field-input" type="number" step="0.01" min="0" placeholder="0.00"
                value={unitForm.credit_balance || 0}
                onChange={e=>setUnitForm(f=>({...f,credit_balance:parseFloat(e.target.value)||0}))} />
              <div style={{ fontSize:11, color:'var(--teal-600)', marginTop:4 }}>Saldo a favor acumulado antes del inicio de operaciones (reduce el adeudo inicial)</div>
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
            <div className="form-section-label" style={{ marginBottom:0 }}>Propietario</div>
            {unitForm.id && unitForm.owner_email && (
              <button type="button" className="btn btn-secondary btn-sm"
                style={{ fontSize:11, padding:'4px 10px', display:'inline-flex', alignItems:'center', gap:5 }}
                onClick={() => setAltaModal({ unit: unitForm, persona: 'owner' })}>
                <UserPlus size={12}/> Dar de alta
              </button>
            )}
          </div>
          <div className="form-grid" style={{ marginBottom:24 }}>
            {[['owner_first_name','Nombre','Carlos'],['owner_last_name','Apellido','Rodríguez'],['owner_email','Email','carlos@email.com'],['owner_phone','Teléfono','+52 55 1234 5678']].map(([k,l,ph])=>(
              <div className="field" key={k}><label className="field-label">{l}</label><input className="field-input" placeholder={ph} value={unitForm[k]||''} onChange={e=>setUnitForm(f=>({...f,[k]:e.target.value}))}/></div>
            ))}
          </div>

          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
            <div className="form-section-label" style={{ marginBottom:0, color:'var(--teal-600)' }}>Co-Propietario</div>
            {unitForm.id && unitForm.coowner_email && (
              <button type="button" className="btn btn-secondary btn-sm"
                style={{ fontSize:11, padding:'4px 10px', display:'inline-flex', alignItems:'center', gap:5 }}
                onClick={() => setAltaModal({ unit: unitForm, persona: 'coowner' })}>
                <UserPlus size={12}/> Dar de alta
              </button>
            )}
          </div>
          <div className="form-grid" style={{ marginBottom:24 }}>
            {[['coowner_first_name','Nombre','Ana'],['coowner_last_name','Apellido','García'],['coowner_email','Email','ana@email.com'],['coowner_phone','Teléfono','+52 55 0000 1111']].map(([k,l,ph])=>(
              <div className="field" key={k}><label className="field-label">{l}</label><input className="field-input" placeholder={ph} value={unitForm[k]||''} onChange={e=>setUnitForm(f=>({...f,[k]:e.target.value}))}/></div>
            ))}
          </div>

          {unitForm.occupancy==='rentado' && (
            <div className="tenant-panel">
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
                <div className="form-section-label" style={{ color:'var(--amber-500)', borderColor:'var(--teal-100)', marginTop:0, marginBottom:0 }}>Inquilino</div>
                {unitForm.id && unitForm.tenant_email && (
                  <button type="button" className="btn btn-secondary btn-sm"
                    style={{ fontSize:11, padding:'4px 10px', display:'inline-flex', alignItems:'center', gap:5 }}
                    onClick={() => setAltaModal({ unit: unitForm, persona: 'tenant' })}>
                    <UserPlus size={12}/> Dar de alta
                  </button>
                )}
              </div>
              <div className="form-grid">
                {[['tenant_first_name','Nombre','Juan'],['tenant_last_name','Apellido','Pérez'],['tenant_email','Email','juan@email.com'],['tenant_phone','Teléfono','+52 55 8765 4321']].map(([k,l,ph])=>(
                  <div className="field" key={k}><label className="field-label">{l}</label><input className="field-input" placeholder={ph} value={unitForm[k]||''} onChange={e=>setUnitForm(f=>({...f,[k]:e.target.value}))}/></div>
                ))}
              </div>
            </div>
          )}
          {t.admin_type === 'mesa_directiva' && (
            <>
              <div className="form-section-label" style={{ color:'var(--teal-700)', borderColor:'var(--teal-200)' }}>
                <Shield size={14}/> Exención por Administración
              </div>
              <div style={{ padding:'12px 16px', marginBottom:16, background:'var(--teal-50)', border:'1px solid var(--teal-100)', borderRadius:'var(--radius-md)' }}>
                <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                  <div className={`switch ${unitForm.admin_exempt?'on':''}`} style={{ cursor:'pointer' }} onClick={()=>setUnitForm(f=>({...f,admin_exempt:!f.admin_exempt}))}>
                    <div className="switch-knob" />
                  </div>
                  <div>
                    <div style={{ fontSize:13, fontWeight:700, color:unitForm.admin_exempt?'var(--teal-700)':'var(--ink-600)' }}>
                      {unitForm.admin_exempt ? '✓ Exento por Administración' : 'Sin exención'}
                    </div>
                    <div style={{ fontSize:11, color:'var(--ink-400)', marginTop:2 }}>No genera deuda de mantenimiento por ser parte de la Mesa Directiva</div>
                  </div>
                </div>
                {unitForm.admin_exempt && unitForm.id && (() => {
                  const today = new Date().toISOString().slice(0,7);
                  const hasPos = positions.some(p => p.holder_unit === unitForm.id && (!p.start_date || p.start_date <= today) && (!p.end_date || p.end_date >= today));
                  return hasPos
                    ? <div style={{ marginTop:10, padding:'8px 12px', background:'var(--teal-50)', border:'1px solid var(--teal-200)', borderRadius:'var(--radius-sm)', fontSize:12, color:'var(--teal-700)' }}>
                        <Shield size={13}/> Cargo activo encontrado — la exención de mantenimiento está vigente.
                      </div>
                    : <div style={{ marginTop:10, padding:'8px 12px', background:'var(--amber-50)', border:'1px solid var(--amber-200)', borderRadius:'var(--radius-sm)', fontSize:12, color:'var(--amber-700)' }}>
                        <AlertCircle size={13}/> <strong>Esta unidad no tiene cargo activo en la mesa directiva.</strong> Asigne un cargo en la pestaña Organización para que la exención sea efectiva.
                      </div>;
                })()}
              </div>
            </>
          )}
        </Modal>
      )}

      {/* Dar de alta — confirm create user from unit persona */}
      {altaModal && (() => {
        const { unit, persona } = altaModal;
        const labels = { owner: 'Propietario', coowner: 'Co-Propietario', tenant: 'Inquilino' };
        const emailMap = { owner: unit.owner_email, coowner: unit.coowner_email, tenant: unit.tenant_email };
        const nameMap = {
          owner:   `${unit.owner_first_name||''} ${unit.owner_last_name||''}`.trim(),
          coowner: `${unit.coowner_first_name||''} ${unit.coowner_last_name||''}`.trim(),
          tenant:  `${unit.tenant_first_name||''} ${unit.tenant_last_name||''}`.trim(),
        };
        return (
          <Modal
            title={`Dar de alta — ${labels[persona]}`}
            onClose={() => setAltaModal(null)}
            onSave={handleUnitCreateUser}
            saveLabel="Dar de alta"
            saving={altaSaving}>
            <div style={{ display:'flex', flexDirection:'column', gap:16, padding:'4px 0' }}>
              <div style={{ padding:'12px 16px', background:'var(--teal-50)', border:'1px solid var(--teal-100)', borderRadius:'var(--radius-md)', fontSize:13 }}>
                <div style={{ fontWeight:700, color:'var(--teal-700)', marginBottom:6 }}>
                  <UserPlus size={14} style={{ marginRight:6 }}/>{labels[persona]}
                </div>
                <div style={{ color:'var(--ink-700)' }}>
                  <strong>Nombre:</strong> {nameMap[persona] || '—'}
                </div>
                <div style={{ color:'var(--ink-700)', marginTop:4 }}>
                  <strong>Email:</strong> {emailMap[persona]}
                </div>
                <div style={{ color:'var(--ink-700)', marginTop:4 }}>
                  <strong>Unidad:</strong> {unit.unit_id_code} — {unit.unit_name}
                </div>
              </div>
              <p style={{ fontSize:13, color:'var(--ink-500)', margin:0 }}>
                Se creará (o asociará) este usuario en el sistema con el perfil de <strong>Vecino</strong> vinculado a esta unidad.
                Recibirá un correo de bienvenida con acceso al condominio.
              </p>
            </div>
          </Modal>
        );
      })()}

      {/* ── Unit delete / inactivate confirmation modal ── */}
      {unitActionModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:1100, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'var(--white)', borderRadius:16, padding:28, maxWidth:440, width:'100%', boxShadow:'0 20px 60px rgba(0,0,0,0.2)' }}>
            {unitActionModal.mode === 'confirm_delete' ? (
              <>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
                  <div style={{ width:36, height:36, borderRadius:10, background:'var(--coral-50)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    <Trash2 size={18} color="var(--coral-500)" />
                  </div>
                  <div>
                    <div style={{ fontWeight:700, fontSize:15, color:'var(--ink-800)' }}>Eliminar unidad</div>
                    <div style={{ fontSize:12, color:'var(--ink-400)' }}>{unitActionModal.unit.unit_id_code} — {unitActionModal.unit.unit_name}</div>
                  </div>
                </div>
                <p style={{ fontSize:13, color:'var(--ink-600)', lineHeight:1.6, marginBottom:20 }}>
                  ¿Estás seguro de que deseas eliminar esta unidad permanentemente? Si tiene registros de pagos o adeudos, se ofrecerá la opción de inactivarla en lugar de eliminarla.
                </p>
                <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
                  <button className="btn btn-secondary" disabled={unitActionWorking} onClick={() => setUnitActionModal(null)}>Cancelar</button>
                  <button className="btn" style={{ background:'var(--coral-500)', color:'#fff', opacity: unitActionWorking ? 0.7 : 1 }}
                    disabled={unitActionWorking} onClick={confirmUnitDelete}>
                    {unitActionWorking ? 'Eliminando…' : 'Eliminar'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
                  <div style={{ width:36, height:36, borderRadius:10, background:'var(--amber-50)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    <AlertCircle size={18} color="var(--amber-600)" />
                  </div>
                  <div>
                    <div style={{ fontWeight:700, fontSize:15, color:'var(--ink-800)' }}>No se puede eliminar</div>
                    <div style={{ fontSize:12, color:'var(--ink-400)' }}>{unitActionModal.unit.unit_id_code} — {unitActionModal.unit.unit_name}</div>
                  </div>
                </div>
                <div style={{ padding:'12px 14px', background:'var(--amber-50)', border:'1px solid var(--amber-200)', borderRadius:10, marginBottom:16, fontSize:13, color:'var(--amber-800)', lineHeight:1.6 }}>
                  Esta unidad tiene historial de pagos o adeudos registrados. No es posible eliminarla para preservar la integridad del historial.
                </div>
                <p style={{ fontSize:13, color:'var(--ink-600)', lineHeight:1.6, marginBottom:20 }}>
                  Puedes <strong>inactivarla</strong> para que quede de solo lectura. El historial se conserva y no se generarán nuevos cargos.
                </p>
                <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
                  <button className="btn btn-secondary" disabled={unitActionWorking} onClick={() => setUnitActionModal(null)}>Cancelar</button>
                  <button className="btn" style={{ background:'var(--amber-500)', color:'#fff', opacity: unitActionWorking ? 0.7 : 1 }}
                    disabled={unitActionWorking} onClick={confirmUnitInactivate}>
                    {unitActionWorking ? 'Inactivando…' : 'Inactivar unidad'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Add Custom Field */}
      {fieldForm && (
        <Modal title={fieldForm.id?'Editar Campo':'Nuevo Campo Extendido'} large
          onClose={() => setFieldForm(null)}
          onSave={saveField}
          saving={saving}>
          <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
            <div className="field field-full">
              <label className="field-label">Nombre del Campo <span style={{ color:'var(--coral-500)' }}>*</span></label>
              <input className="field-input" placeholder="Ej: Fondo de Reserva, Cuota extraordinaria" value={fieldForm.label||''} onChange={e=>setFieldForm(f=>({...f,label:e.target.value}))} />
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
              <div className="field">
                <label className="field-label">Tipo de Campo</label>
                <div style={{ display:'flex', border:'1.5px solid var(--sand-200)', borderRadius:'var(--radius-sm)', overflow:'hidden', marginTop:4 }}>
                  <button type="button" style={{ flex:1, padding:'8px 14px', fontSize:13, fontWeight:600, cursor:'pointer', border:'none', display:'flex', alignItems:'center', justifyContent:'center', gap:6, background:(!fieldForm.field_type||fieldForm.field_type==='normal')?'var(--teal-50)':'var(--white)', color:(!fieldForm.field_type||fieldForm.field_type==='normal')?'var(--teal-700)':'var(--ink-500)', transition:'all 0.15s' }}
                    onClick={()=>setFieldForm(f=>({...f,field_type:'normal',show_in_normal:true,show_in_additional:true,show_in_gastos:false}))}>
                    <Receipt size={14} /> Cobranza
                  </button>
                  <button type="button" style={{ flex:1, padding:'8px 14px', fontSize:13, fontWeight:600, cursor:'pointer', border:'none', borderLeft:'1.5px solid var(--sand-200)', display:'flex', alignItems:'center', justifyContent:'center', gap:6, background:fieldForm.field_type==='gastos'?'var(--amber-50)':'var(--white)', color:fieldForm.field_type==='gastos'?'var(--amber-700)':'var(--ink-500)', transition:'all 0.15s' }}
                    onClick={()=>setFieldForm(f=>({...f,field_type:'gastos',show_in_normal:false,show_in_additional:false,show_in_gastos:true}))}>
                    <ShoppingBag size={14} /> Gastos
                  </button>
                  <button type="button" style={{ flex:1, padding:'8px 14px', fontSize:13, fontWeight:600, cursor:'pointer', border:'none', borderLeft:'1.5px solid var(--sand-200)', display:'flex', alignItems:'center', justifyContent:'center', gap:6, background:fieldForm.field_type==='adelanto'?'var(--blue-50)':'var(--white)', color:fieldForm.field_type==='adelanto'?'var(--blue-700)':'var(--ink-500)', transition:'all 0.15s' }}
                    onClick={()=>setFieldForm(f=>({...f,field_type:'adelanto',required:false,show_in_normal:true,show_in_additional:false,show_in_gastos:false}))}>
                    <TrendingUp size={14} /> Adelanto
                  </button>
                </div>
              </div>
              <div className="field">
                <label className="field-label">Monto Fijo (opcional)</label>
                <input type="number" min="0" step="0.01" className="field-input" placeholder="0" value={fieldForm.default_amount||0} onChange={e=>setFieldForm(f=>({...f,default_amount:e.target.value}))} />
                <div style={{ fontSize:11, color:'var(--ink-400)', marginTop:4 }}>Déjalo en 0 si varía por unidad</div>
              </div>
            </div>
            {(!fieldForm.field_type || fieldForm.field_type==='normal') && (
              <div className="field">
                <label className="field-label">Obligatorio</label>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginTop:6 }}>
                  <div className={`switch ${fieldForm.required?'on':''}`} style={{ background:fieldForm.required?'var(--coral-400)':undefined, cursor:'pointer' }} onClick={()=>setFieldForm(f=>({...f,required:!f.required}))}>
                    <div className="switch-knob" />
                  </div>
                  <span style={{ fontSize:12, fontWeight:600, color:fieldForm.required?'var(--coral-500)':'var(--ink-400)' }}>
                    {fieldForm.required?'Obligatorio — genera deuda si no se paga':'Opcional — no genera deuda'}
                  </span>
                </div>
              </div>
            )}
            {fieldForm.field_type==='adelanto' && (
              <div className="field">
                <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 14px', background:'var(--blue-50)', border:'1px solid var(--blue-100)', borderRadius:'var(--radius-md)' }}>
                  <TrendingUp size={14} style={{ color:'var(--blue-500)', flexShrink:0 }} />
                  <span style={{ fontSize:12, color:'var(--blue-700)', fontWeight:600 }}>
                    Los campos de adelanto son siempre opcionales y sus pagos suman como saldo a favor en el estado de cuenta.
                  </span>
                </div>
              </div>
            )}
            {(!fieldForm.field_type || fieldForm.field_type==='normal') && (
              <div className="field">
                <label className="field-label" style={{ display:'flex', alignItems:'center', gap:4 }}><Calendar size={13}/> Duración (períodos)</label>
                <input type="number" min="0" className="field-input" value={fieldForm.duration_periods||0} onChange={e=>setFieldForm(f=>({...f,duration_periods:parseInt(e.target.value)||0}))} />
                <div style={{ fontSize:11, color:'var(--ink-400)', marginTop:4 }}>0 = permanente · 6 = seis meses · 12 = un año</div>
              </div>
            )}
            {/* Visibilidad por formulario */}
            <div className="field field-full">
              <label className="field-label">Mostrar en formularios</label>
              <div style={{ display:'flex', flexDirection:'column', gap:8, marginTop:6, padding:'12px 16px', background:'var(--sand-50)', border:'1.5px solid var(--sand-200)', borderRadius:'var(--radius-md)' }}>
                {/* Pagos normales */}
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', cursor:'pointer' }}
                  onClick={()=>setFieldForm(f=>({...f,show_in_normal:!f.show_in_normal}))}>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <Receipt size={14} style={{ color:'var(--teal-600)' }} />
                    <span style={{ fontSize:13, fontWeight:600, color:'var(--ink-700)' }}>Pagos normales</span>
                    <span style={{ fontSize:11, color:'var(--ink-400)' }}>Captura de pago mensual por unidad</span>
                  </div>
                  <div className={`switch ${fieldForm.show_in_normal?'on':''}`} style={{ flexShrink:0 }} onClick={e=>{e.stopPropagation();setFieldForm(f=>({...f,show_in_normal:!f.show_in_normal}))}}>
                    <div className="switch-knob" />
                  </div>
                </div>
                {/* Pagos adicionales */}
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', cursor:'pointer', paddingTop:8, borderTop:'1px solid var(--sand-200)' }}
                  onClick={()=>setFieldForm(f=>({...f,show_in_additional:!f.show_in_additional}))}>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <Plus size={14} style={{ color:'var(--blue-600)' }} />
                    <span style={{ fontSize:13, fontWeight:600, color:'var(--ink-700)' }}>Pagos adicionales</span>
                    <span style={{ fontSize:11, color:'var(--ink-400)' }}>Abonos extra en el mismo período</span>
                  </div>
                  <div className={`switch ${fieldForm.show_in_additional?'on':''}`} style={{ flexShrink:0 }} onClick={e=>{e.stopPropagation();setFieldForm(f=>({...f,show_in_additional:!f.show_in_additional}))}}>
                    <div className="switch-knob" />
                  </div>
                </div>
                {/* Gastos */}
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', cursor:'pointer', paddingTop:8, borderTop:'1px solid var(--sand-200)' }}
                  onClick={()=>setFieldForm(f=>({...f,show_in_gastos:!f.show_in_gastos}))}>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <ShoppingBag size={14} style={{ color:'var(--amber-600)' }} />
                    <span style={{ fontSize:13, fontWeight:600, color:'var(--ink-700)' }}>Gastos</span>
                    <span style={{ fontSize:11, color:'var(--ink-400)' }}>Registro de egresos del condominio</span>
                  </div>
                  <div className={`switch ${fieldForm.show_in_gastos?'on':''}`} style={{ flexShrink:0 }} onClick={e=>{e.stopPropagation();setFieldForm(f=>({...f,show_in_gastos:!f.show_in_gastos}))}}>
                    <div className="switch-knob" />
                  </div>
                </div>
              </div>
            </div>
            <div className="field">
              <label className="field-label">Aplicar a Otra Unidad</label>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginTop:6 }}>
                <div className={`switch ${fieldForm.cross_unit?'on':''}`} style={{ cursor:'pointer' }} onClick={()=>setFieldForm(f=>({...f,cross_unit:!f.cross_unit}))}>
                  <div className="switch-knob" />
                </div>
                <span style={{ fontSize:12, color:fieldForm.cross_unit?'var(--teal-600)':'var(--ink-400)' }}>
                  {fieldForm.cross_unit?'Sí — puede aplicarse a otra unidad':'No — cobra solo a la unidad asignada'}
                </span>
              </div>
            </div>
            <div className="field field-full">
              <label className="field-label">Descripción</label>
              <textarea className="field-input" rows={3} placeholder="Descripción que aparecerá en captura, estados de cuenta y reportes"
                value={fieldForm.description||''} onChange={e=>setFieldForm(f=>({...f,description:e.target.value}))}
                style={{ resize:'vertical' }} />
            </div>
          </div>
        </Modal>
      )}

      {/* Add User */}
      {addUserOpen && (
        <Modal title="Agregar Usuario" large
          onClose={() => { setAddUserOpen(false); setAddUserForm({}); setAddUserExisting(null); }}
          onSave={saveUser}
          saveLabel={addUserExisting && addUserExisting.id ? 'Agregar al Condominio' : 'Crear Usuario'}
          saving={saving}>
          <div className="form-grid">

            {/* Email + lookup en tiempo real */}
            <div className="field field-full">
              <label className="field-label">Email *</label>
              <div style={{ position:'relative' }}>
                <input type="email" className="field-input"
                  value={addUserForm.email||''}
                  onChange={e => handleAddUserEmailChange(e.target.value)}
                  placeholder="usuario@email.com"
                  style={{ paddingRight: 34 }} />
                {addUserChecking && (
                  <Loader size={14} style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', color:'var(--ink-400)', animation:'spin 0.8s linear infinite' }} />
                )}
              </div>
            </div>

            {/* Aviso: usuario ya existe en el sistema */}
            {addUserExisting && addUserExisting.id && (
              <div className="field field-full">
                <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', background:'var(--teal-50)', border:'1px solid var(--teal-100)', borderRadius:10 }}>
                  <UserCheck size={18} color="var(--teal-500)" style={{ flexShrink:0 }} />
                  <div>
                    <div style={{ fontWeight:700, fontSize:13, color:'var(--teal-700)' }}>
                      Usuario existente: {addUserExisting.name}
                    </div>
                    <div style={{ fontSize:12, color:'var(--teal-600)', marginTop:2 }}>
                      Se agregará a este condominio con el rol y unidad que selecciones.
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Nombre — siempre visible, se oculta si el usuario ya existe */}
            {!(addUserExisting && addUserExisting.id) && (
              <div className="field field-full">
                <label className="field-label">Nombre Completo *</label>
                <input className="field-input"
                  value={addUserForm.name||''}
                  onChange={e=>setAddUserForm(f=>({...f,name:e.target.value}))}
                  placeholder="Nombre y apellidos" />
              </div>
            )}

            {/* Rol — siempre visible */}
            <div className="field">
              <label className="field-label">Rol</label>
              <select className="field-select" value={addUserForm.role||'admin'}
                onChange={e=>setAddUserForm(f=>({...f,role:e.target.value,unit_id:e.target.value!=='vecino'?'':f.unit_id}))}>
                {TENANT_ROLES.map(r => {
                  const m = ROLE_META[r];
                  return <option key={r} value={r}>{m?.label||r} — {m?.desc||''}</option>;
                })}
              </select>
            </div>

            {/* Unidad — visible cuando el rol es vecino */}
            {(addUserForm.role||'admin')==='vecino' && (
              <div className="field field-full">
                <label className="field-label">Unidad Asignada *</label>
                <select className="field-select" value={addUserForm.unit_id||''} onChange={e=>setAddUserForm(f=>({...f,unit_id:e.target.value}))}>
                  <option value="">— Seleccione una unidad —</option>
                  {units.map(u=><option key={u.id} value={u.id}>{[u.unit_id_code,u.unit_name].filter(Boolean).join(' — ')}</option>)}
                </select>
              </div>
            )}

          </div>

          {/* Aviso de acceso por código de email */}
          <div style={{ marginTop:16, padding:14, background:'var(--teal-50)', border:'1px solid var(--teal-100)', borderRadius:'var(--radius-md)', fontSize:13, color:'var(--ink-600)', display:'flex', alignItems:'flex-start', gap:10 }}>
            <Mail size={16} color="var(--teal-500)" style={{ flexShrink:0, marginTop:1 }} />
            <div>
              <strong>Acceso por código de email:</strong> El usuario recibirá un correo de bienvenida con instrucciones.
              Para ingresar al sistema, solo necesita su correo — recibirá un código de verificación cada vez que inicie sesión.
            </div>
          </div>
        </Modal>
      )}

      {/* Confirm new-user email */}
      {showUserEmailConfirm && (
        <div className="modal-bg open" onClick={() => setShowUserEmailConfirm(false)}>
          <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3 style={{ display:'flex', alignItems:'center', gap:8 }}>
                <Mail size={18} color="var(--teal-500)" />
                Confirmar envío de correo
              </h3>
              <button className="modal-close" onClick={() => setShowUserEmailConfirm(false)}><X size={16} /></button>
            </div>
            <div className="modal-body" style={{ padding: '20px 24px' }}>
              <p style={{ margin:0, fontSize:14, color:'var(--ink-700)', lineHeight:1.6 }}>
                Se creará la cuenta y se enviará un <strong>correo de bienvenida</strong> a:
              </p>
              <p style={{ margin:'10px 0 0', fontSize:15, fontWeight:600, color:'var(--teal-600)', wordBreak:'break-all' }}>
                {addUserForm.email}
              </p>
              <p style={{ margin:'12px 0 0', fontSize:13, color:'var(--ink-500)', lineHeight:1.5 }}>
                El correo incluirá instrucciones para acceder al sistema mediante código de verificación.
              </p>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setShowUserEmailConfirm(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={doCreateUser} disabled={saving}>
                {saving ? 'Creando…' : 'Crear y enviar correo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit User */}
      {editUserOpen && (
        <Modal title="Editar Usuario" large
          onClose={() => { setEditUserOpen(false); setEditUserId(null); setEditUserForm({}); }}
          onSave={saveEditUser}
          saveLabel="Guardar Cambios"
          saving={saving}>
          <div className="form-grid">
            <div className="field field-full">
              <label className="field-label">Nombre Completo *</label>
              <input className="field-input" value={editUserForm.name||''}
                onChange={e => setEditUserForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="field">
              <label className="field-label">Rol</label>
              <select className="field-select" value={editUserForm.role||'vecino'}
                onChange={e => setEditUserForm(f => ({ ...f, role: e.target.value, profile_id: '', unit_id: e.target.value !== 'vecino' ? '' : f.unit_id }))}>
                {TENANT_ROLES.map(r => {
                  const m = ROLE_META[r];
                  return <option key={r} value={r}>{m?.label||r} — {m?.desc||''}</option>;
                })}
              </select>
            </div>
            {/* Custom profile selector */}
            {customProfiles.length > 0 && (
              <div className="field field-full">
                <label className="field-label">Perfil Personalizado <span style={{ fontWeight:400, color:'var(--ink-400)' }}>(opcional — sobrescribe visibilidad de módulos)</span></label>
                <select className="field-select" value={editUserForm.profile_id||''}
                  onChange={e => setEditUserForm(f => ({ ...f, profile_id: e.target.value }))}>
                  <option value="">— Sin perfil personalizado —</option>
                  {customProfiles.filter(p => {
                    // Only show profiles compatible with the selected role's base permissions
                    const baseRole = p.base_role;
                    if (!baseRole) return false;
                    // Admin can use any profile; vecino can only use vecino-based profiles; etc.
                    const roleOrder = ['vecino','vigilante','auditor','contador','tesorero','admin'];
                    const selectedIdx = roleOrder.indexOf(editUserForm.role || 'vecino');
                    const profileIdx  = roleOrder.indexOf(baseRole);
                    return profileIdx >= 0;
                  }).map(p => {
                    const m = ROLE_META[p.base_role] || {};
                    return <option key={p.id} value={p.id}>{p.label} (base: {m.label || p.base_role})</option>;
                  })}
                </select>
                {editUserForm.profile_id && (
                  <div style={{ fontSize:11, color:'var(--ink-400)', marginTop:4 }}>
                    El perfil personalizado determina los módulos visibles. Los permisos de backend corresponden al rol base del perfil.
                  </div>
                )}
              </div>
            )}
            {editUserForm.role === 'vecino' && (
              <div className="field field-full">
                <label className="field-label">Unidad Asignada *</label>
                <select className="field-select" value={editUserForm.unit_id||''}
                  onChange={e => setEditUserForm(f => ({ ...f, unit_id: e.target.value }))}>
                  <option value="">— Seleccione una unidad —</option>
                  {units.map(u => (
                    <option key={u.id} value={u.id}>
                      {[u.unit_id_code, u.unit_name].filter(Boolean).join(' — ')}
                      {u.owner_name ? ` · ${u.owner_name}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Profile Modal */}
      {profileModalOpen && profileForm && (() => {
        const isEdit     = !!(profileForm.id);
        const baseModules = ROLE_BASE_MODULES[profileForm.base_role] || [];

        // Normalise modules to object format { key: "write"|"read"|"hidden" }
        const normalizeMods = (mods, base) => {
          if (!mods || (Array.isArray(mods) && mods.length === 0)) return {};
          if (Array.isArray(mods))
            return Object.fromEntries(base.map(k => [k, mods.includes(k) ? 'write' : 'hidden']));
          return mods;
        };
        const profileModules = normalizeMods(profileForm.modules, baseModules);
        const hasAnyConfig   = Object.keys(profileModules).length > 0;

        const getProfileAccess = (key) => profileModules[key] ?? 'write'; // default write

        const setProfileAccess = (key, level) => {
          setProfileForm(f => {
            const base = ROLE_BASE_MODULES[f.base_role] || [];
            const current = normalizeMods(f.modules, base);
            return { ...f, modules: { ...current, [key]: level } };
          });
        };

        const saveProfile = async () => {
          if (!profileForm.label?.trim()) return toast.error('El nombre del perfil es obligatorio');
          if (!profileForm.base_role)     return toast.error('Selecciona un rol base');
          setProfileSaving(true);
          try {
            const entry = { ...profileForm };
            if (!entry.id) {
              // Generate a simple unique ID
              entry.id = `prof_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
            }
            setCustomProfiles(prev => {
              const exists = prev.findIndex(p => p.id === entry.id);
              if (exists >= 0) { const next = [...prev]; next[exists] = entry; return next; }
              return [...prev, entry];
            });
            setProfileModalOpen(false);
            setProfileForm(null);
            toast.success(isEdit ? 'Perfil actualizado' : 'Perfil creado — recuerda guardar los cambios');
          } finally { setProfileSaving(false); }
        };

        const PRESET_COLORS = [
          '#0d9488','#0ea5e9','#7c3aed','#db2777','#ea580c','#ca8a04','#16a34a','#64748b'
        ];

        return (
          <Modal
            title={isEdit ? 'Editar Perfil' : 'Nuevo Perfil Personalizado'}
            large
            onClose={() => { setProfileModalOpen(false); setProfileForm(null); }}
            onSave={saveProfile}
            saving={profileSaving}
            saveLabel={isEdit ? 'Guardar Cambios' : 'Crear Perfil'}
          >
            <div className="form-grid">
              {/* Name */}
              <div className="field field-full">
                <label className="field-label">Nombre del Perfil *</label>
                <input className="field-input" placeholder="Ej: Supervisor de Mantenimiento, Coordinador…"
                  value={profileForm.label || ''}
                  onChange={e => setProfileForm(f => ({ ...f, label: e.target.value }))} />
              </div>

              {/* Color */}
              <div className="field">
                <label className="field-label">Color identificador</label>
                <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginTop:4 }}>
                  {PRESET_COLORS.map(c => (
                    <button key={c}
                      onClick={() => setProfileForm(f => ({ ...f, color: c }))}
                      style={{
                        width:26, height:26, borderRadius:'50%', border: profileForm.color === c ? '3px solid var(--ink-800)' : '2px solid transparent',
                        background:c, cursor:'pointer', outline:'none', flexShrink:0,
                        boxShadow: profileForm.color === c ? '0 0 0 1px white inset' : 'none',
                      }} />
                  ))}
                  <input type="color" value={profileForm.color || '#0d9488'}
                    onChange={e => setProfileForm(f => ({ ...f, color: e.target.value }))}
                    style={{ width:28, height:28, border:'none', padding:0, borderRadius:4, cursor:'pointer' }} />
                </div>
              </div>

              {/* Base role */}
              <div className="field">
                <label className="field-label">Rol Base *</label>
                <select className="field-select"
                  value={profileForm.base_role || ''}
                  onChange={e => setProfileForm(f => ({ ...f, base_role: e.target.value, modules: {} }))}>
                  <option value="">— Selecciona un rol —</option>
                  {['admin','tesorero','contador','auditor','vigilante','vecino'].map(r => {
                    const m = ROLE_META[r] || {};
                    return <option key={r} value={r}>{m.label || r}</option>;
                  })}
                </select>
                <div style={{ fontSize:11, color:'var(--ink-400)', marginTop:4, lineHeight:1.4 }}>
                  El rol base determina los permisos de backend. Configura abajo el nivel de acceso por módulo.
                </div>
              </div>
            </div>

            {/* Module permission levels */}
            {profileForm.base_role && (
              <div style={{ marginTop:20 }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:'var(--ink-700)' }}>
                    Permisos por módulo
                  </div>
                  {/* Mini legend */}
                  <div style={{ display:'flex', gap:10, fontSize:10, color:'var(--ink-400)' }}>
                    {[
                      { Icon:EyeOff, label:'Oculto',  color:'var(--coral-500)' },
                      { Icon:Eye,    label:'Lectura',  color:'var(--blue-600)'  },
                      { Icon:Pencil, label:'Completo', color:'var(--teal-600)'  },
                    ].map(({ Icon: I, label, color }) => (
                      <span key={label} style={{ display:'flex', alignItems:'center', gap:3 }}>
                        <I size={10} color={color}/> <span style={{ color }}>{label}</span>
                      </span>
                    ))}
                  </div>
                </div>

                {!hasAnyConfig && (
                  <div style={{ marginBottom:10, padding:'8px 12px', background:'var(--amber-50)', border:'1px solid var(--amber-100)', borderRadius:'var(--radius-md)', fontSize:12, color:'var(--amber-700)' }}>
                    Sin configuración → el perfil hereda el acceso completo del rol base. Ajusta módulos individuales abajo.
                  </div>
                )}

                <div style={{ display:'grid', gap:6 }}>
                  {MODULE_DEFINITIONS.filter(mod => baseModules.includes(mod.key)).map(mod => {
                    const Icon   = mod.icon;
                    const access = getProfileAccess(mod.key);
                    const LEVELS = [
                      { key:'hidden', LvIcon:EyeOff, label:'Oculto',   activeColor:'var(--coral-500)', activeBg:'var(--coral-50)'  },
                      { key:'read',   LvIcon:Eye,    label:'Lectura',   activeColor:'var(--blue-600)',  activeBg:'var(--blue-50)'   },
                      { key:'write',  LvIcon:Pencil, label:'Completo',  activeColor:'var(--teal-600)',  activeBg:'var(--teal-50)'   },
                    ];
                    const active = LEVELS.find(l => l.key === access);
                    return (
                      <div key={mod.key} style={{
                        display:'flex', alignItems:'center', gap:12, padding:'10px 14px',
                        borderRadius:'var(--radius-md)',
                        border:`1.5px solid ${access === 'hidden' ? 'var(--coral-100)' : access === 'read' ? 'var(--blue-100)' : 'var(--teal-100)'}`,
                        background: access === 'hidden' ? 'var(--coral-50)' : access === 'read' ? 'var(--blue-50)' : 'var(--teal-50)',
                        transition:'all 0.15s',
                      }}>
                        {/* Module icon + label */}
                        <span style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:28, height:28, borderRadius:7, background:'white', flexShrink:0 }}>
                          <Icon size={13} color={active?.activeColor || 'var(--ink-400)'} />
                        </span>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:12, fontWeight:700, color:'var(--ink-800)' }}>{mod.label}</div>
                          <div style={{ fontSize:11, color:'var(--ink-400)', marginTop:1 }}>{mod.desc}</div>
                        </div>
                        {/* 3-level pill */}
                        <div style={{ display:'inline-flex', borderRadius:8, overflow:'hidden', border:'1px solid rgba(0,0,0,0.08)', flexShrink:0 }}>
                          {LEVELS.map(({ key, LvIcon, label, activeColor, activeBg }) => {
                            const isActive = access === key;
                            return (
                              <button key={key} type="button" title={label}
                                onClick={() => setProfileAccess(mod.key, key)}
                                style={{
                                  display:'flex', alignItems:'center', gap:4,
                                  padding:'5px 10px', border:'none',
                                  background: isActive ? activeBg : 'white',
                                  color: isActive ? activeColor : 'var(--ink-300)',
                                  cursor:'pointer', fontSize:11, fontWeight: isActive ? 700 : 500,
                                  transition:'all 0.12s',
                                  borderRight: key !== 'write' ? '1px solid rgba(0,0,0,0.08)' : 'none',
                                }}>
                                <LvIcon size={11}/> {label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </Modal>
        );
      })()}

      {/* Committee modal */}
      {cmtForm && (
        <Modal title={cmtForm.id ? 'Editar Comité' : 'Nuevo Comité'} large onClose={()=>setCmtForm(null)} onSave={saveCommittee} saveLabel={cmtForm.id?'Guardar':'Crear Comité'} saving={saving}>
          <div className="form-grid">
            <div className="field field-full">
              <label className="field-label">Nombre del Comité <span style={{ color:'var(--coral-500)' }}>*</span></label>
              <input className="field-input" placeholder="Ej: Comité de Vigilancia, Comité de Áreas Verdes..." value={cmtForm.name||''} onChange={e=>setCmtForm(f=>({...f,name:e.target.value}))}/>
            </div>
            <div className="field field-full">
              <label className="field-label">Descripción</label>
              <textarea className="field-input" rows={2} placeholder="Funciones y responsabilidades del comité..." value={cmtForm.description||''} onChange={e=>setCmtForm(f=>({...f,description:e.target.value}))} style={{ resize:'vertical' }} />
            </div>
            <div className="field field-full">
              <div style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', background:'var(--teal-50)', border:'1px solid var(--teal-100)', borderRadius:'var(--radius-md)' }}>
                <div className={`switch ${cmtForm.exemption?'on':''}`} style={{ cursor:'pointer' }} onClick={()=>setCmtForm(f=>({...f,exemption:!f.exemption}))}>
                  <div className="switch-knob" />
                </div>
                <div>
                  <div style={{ fontSize:13, fontWeight:700, color:cmtForm.exemption?'var(--teal-700)':'var(--ink-600)', display:'flex', alignItems:'center', gap:4 }}><Shield size={13}/> Exención por Administración</div>
                  <div style={{ fontSize:11, color:'var(--ink-400)', marginTop:2 }}>Los miembros de este comité vinculados a una unidad no generarán deuda de mantenimiento</div>
                </div>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Position modal */}
      {posForm && (
        <Modal title={posForm.id?'Editar Cargo':'Nuevo Cargo Administrativo'} large onClose={()=>setPosForm(null)} onSave={savePosition} saveLabel={posForm.id?'Guardar Cambios':'Crear Cargo'} saving={saving}>
          <div className="form-grid">
            <div className="field field-full">
              <label className="field-label">Cargo / Puesto <span style={{ color:'var(--coral-500)' }}>*</span></label>
              <input className="field-input" placeholder="Ej: Presidente, Tesorero, Vocal..." value={posForm.title||''} onChange={e=>setPosForm(f=>({...f,title:e.target.value}))}/>
            </div>
            <div className="field field-full">
              <label className="field-label">Nombre Completo <span style={{ color:'var(--coral-500)' }}>*</span></label>
              <input className="field-input" placeholder="Nombre de la persona" value={posForm.holder_name||''} onChange={e=>setPosForm(f=>({...f,holder_name:e.target.value}))}/>
            </div>
            <div className="field">
              <label className="field-label">Email</label>
              <input type="email" className="field-input" placeholder="correo@ejemplo.com" value={posForm.email||''} onChange={e=>setPosForm(f=>({...f,email:e.target.value}))}/>
            </div>
            <div className="field">
              <label className="field-label">Teléfono</label>
              <input className="field-input" placeholder="+52 55 1234 5678" value={posForm.phone||''} onChange={e=>setPosForm(f=>({...f,phone:e.target.value}))}/>
            </div>
            <div className="field">
              <label className="field-label">Inicio de Gestión</label>
              <input type="month" className="field-input" value={posForm.start_date||''} onChange={e=>setPosForm(f=>({...f,start_date:e.target.value}))}/>
              <div style={{ fontSize:11, color:'var(--ink-400)', marginTop:4 }}>Período desde el cual asume el cargo</div>
            </div>
            <div className="field">
              <label className="field-label">Fin de Gestión</label>
              <input type="month" className="field-input" value={posForm.end_date||''} onChange={e=>setPosForm(f=>({...f,end_date:e.target.value}))}/>
              <div style={{ fontSize:11, color:'var(--ink-400)', marginTop:4 }}>Dejar vacío si sigue vigente</div>
            </div>
            <div className="field field-full">
              <label className="field-label"><Building2 size={13}/> Unidad que Representa</label>
              <select className="field-select" value={posForm.holder_unit||''} onChange={e=>setPosForm(f=>({...f,holder_unit:e.target.value||null}))}>
                <option value="">— Sin unidad —</option>
                {units.map(u => <option key={u.id} value={u.id}>{u.unit_id_code} — {u.unit_name}</option>)}
              </select>
              <div style={{ fontSize:11, color:'var(--ink-400)', marginTop:4 }}>Vincular a una unidad para habilitar la exención de mantenimiento</div>
            </div>
            <div className="field field-full">
              <label className="field-label"><Users size={13}/> Comité / Grupo</label>
              <select className="field-select" value={posForm.committee_id||''} onChange={e=>setPosForm(f=>({...f,committee_id:e.target.value||null}))}>
                <option value="">— Sin comité —</option>
                {committees.map(cm => <option key={cm.id} value={cm.id}>{cm.name}{cm.exemption?' (Exención)':''}</option>)}
              </select>
            </div>
            <div className="field field-full">
              <label className="field-label">Notas</label>
              <textarea className="field-input" rows={2} placeholder="Observaciones adicionales..." value={posForm.notes||''} onChange={e=>setPosForm(f=>({...f,notes:e.target.value}))} style={{ resize:'vertical' }} />
            </div>
          </div>
        </Modal>
      )}

      {/* Super Admin modal */}
      {addSAOpen && (
        <Modal title="Nuevo Super Admin" onClose={() => { setAddSAOpen(false); setAddSAForm({}); }} onSave={saveSuperAdmin} saveLabel="Crear" saving={saving}>
          <div className="form-grid" style={{ gridTemplateColumns:'1fr' }}>
            <div className="field">
              <label className="field-label">Nombre</label>
              <input className="field-input" value={addSAForm.name||''} onChange={e=>setAddSAForm(f=>({...f,name:e.target.value}))}/>
            </div>
            <div className="field">
              <label className="field-label">Email</label>
              <input type="email" className="field-input" value={addSAForm.email||''} onChange={e=>setAddSAForm(f=>({...f,email:e.target.value}))}/>
            </div>
            <div className="field">
              <label className="field-label">Contraseña Inicial</label>
              <input type="text" className="field-input" placeholder="Mínimo 8 caracteres" value={addSAForm.password||''} onChange={e=>setAddSAForm(f=>({...f,password:e.target.value}))}/>
            </div>
          </div>
          <div style={{ marginTop:16, padding:14, background:'var(--amber-50)', border:'1px solid var(--amber-100)', borderRadius:'var(--radius-md)', fontSize:13, color:'var(--ink-600)', display:'flex', alignItems:'flex-start', gap:10 }}>
            <Lock size={16} color="var(--amber-500)" style={{ flexShrink:0, marginTop:1 }} />
            <div><strong>Cambio obligatorio:</strong> Deberá cambiar su contraseña al primer ingreso.</div>
          </div>
        </Modal>
      )}

      {/* ══════════ Onboarding Tour (Guía interactiva) ══════════ */}
      {isAdmin && (
        <AdminConfigTour
          open={tourOpen}
          activeTab={tab}
          tenantName={tenant?.name || 'tu condominio'}
          onNavigateTab={(k) => setTab(k)}
          onClose={async () => {
            setTourOpen(false);
            if (tenantId && !tenant?.onboarding_completed) {
              try { await tenantsAPI.onboardingDismiss(tenantId); } catch {}
            }
          }}
          onFinish={async () => {
            setTourOpen(false);
            if (tenantId) {
              try {
                await tenantsAPI.onboardingComplete(tenantId);
                setTenant(prev => prev ? { ...prev, onboarding_completed: true } : prev);
                toast.success('¡Onboarding completado!');
              } catch {
                toast.error('No se pudo marcar como completado');
              }
            }
          }}
        />
      )}
    </div>
  );
}
