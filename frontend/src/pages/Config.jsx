import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { tenantsAPI, extraFieldsAPI, assemblyAPI, usersAPI, unitsAPI, superAdminAPI } from '../api/client';
import { CURRENCIES, getStatesForCountry, COUNTRIES } from '../utils/helpers';
import {
  Settings, Plus, Trash2, Check, X, Upload, Users,
  Building2, RefreshCw, Edit2, Search, Home, Lock,
  Calendar, DollarSign, ShieldCheck, Receipt, ShoppingBag,
  AlertCircle, Shield, FileText, Globe, ChevronRight,
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
      <div className={`modal${large ? ' lg' : ''}`} onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body">{children}</div>
        <div className="modal-foot">
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

  // ── Core state ────────────────────────────────────────────────────────────
  const [tab, setTab] = useState('fiscal');
  const [tenant, setTenant] = useState(null);
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

  // Field modal
  const [fieldForm, setFieldForm] = useState(null);
  const [cobCollapsed, setCobCollapsed] = useState(false);
  const [gasCollapsed, setGasCollapsed] = useState(false);

  // User modal
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [addUserForm, setAddUserForm] = useState({});

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
  const loadUnits    = useCallback((pageNum = 1, size) => {
    if (!tenantId) return;
    const sz = size ?? unitsPageSize;
    unitsAPI.list(tenantId, { page: pageNum, page_size: sz }).then(r => {
      const data = r.data;
      const items = data.results ?? data;
      setUnits(Array.isArray(items) ? items : []);
      setUnitsTotalCount(typeof data.count === 'number' ? data.count : items.length);
    }).catch(() => {});
  }, [tenantId, unitsPageSize]);
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
      if (unitModal === 'add') { setUnitsPage(1); loadUnits(1, unitsPageSize); }
      else loadUnits(unitsPage, unitsPageSize);
    } catch (e) { toast.error(e.response?.data?.unit_id_code?.[0] || 'Error guardando unidad'); }
  };

  const handleUnitDelete = async (id) => {
    if (!window.confirm('¿Eliminar esta unidad? Se perderán todos sus pagos asociados.')) return;
    try { await unitsAPI.delete(tenantId, id); toast.success('Unidad eliminada'); loadUnits(unitsPage, unitsPageSize); }
    catch { toast.error('Error eliminando unidad'); }
  };

  const saveUser = async () => {
    if (!addUserForm.name || !addUserForm.email || !addUserForm.role || !addUserForm.password)
      return toast.error('Todos los campos son obligatorios');
    if (addUserForm.role === 'vecino' && !addUserForm.unit_id)
      return toast.error('Los vecinos deben tener una unidad asignada');
    try {
      const payload = {
        name: addUserForm.name,
        email: addUserForm.email,
        role: addUserForm.role,
        password: addUserForm.password,
        tenant_id: tenantId,
        unit_id: addUserForm.role === 'vecino' && addUserForm.unit_id ? addUserForm.unit_id : null,
      };
      await usersAPI.create(payload);
      toast.success('Usuario creado');
      setAddUserOpen(false);
      setAddUserForm({});
      loadUsers();
    } catch (e) { toast.error(e.response?.data?.detail || e.response?.data?.email?.[0] || 'Error al crear usuario'); }
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
    `${u.unit_name} ${u.unit_id_code} ${u.owner_first_name} ${u.owner_last_name}`.toLowerCase().includes(unitSearch.toLowerCase())
  );

  const tabs = [
    fiscal ? { key: 'fiscal', label: 'Datos Fiscales' } : { key: 'address', label: 'Datos Generales' },
    { key: 'logo',    label: 'Logo' },
    { key: 'general', label: 'General' },
    { key: 'units',   label: 'Unidades' },
    { key: 'fields',  label: 'Config. Pagos' },
    { key: 'users',   label: 'Usuarios' },
    { key: 'roles',   label: 'Roles y Perfiles' },
    { key: 'org',     label: 'Organización' },
  ];

  // ────────────────────────────────────────────────────────────────────────────
  return (
    <div className="content-fade">
      <div className="tabs" style={{ flexWrap: 'wrap', marginBottom: 20 }}>
        {tabs.map(tb => (
          <button key={tb.key} className={`tab ${tab === tb.key ? 'active' : ''}`} onClick={() => setTab(tb.key)}>
            {tb.label}
          </button>
        ))}
      </div>

      {/* ════ DATOS FISCALES ════ */}
      {tab === 'fiscal' && fiscal && (
        <div className="card">
          <div className="card-head">
            <h3>Datos Fiscales del Condominio</h3>
            {isAdmin && (
              <button className="btn btn-primary btn-sm" onClick={() => {
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
              }}>
                <Edit2 size={13} /> Editar
              </button>
            )}
          </div>
          <div className="card-body">
            <div className="form-grid">
              <FieldView label="Razón Social" value={t.razon_social} />
              <FieldView label="RFC" value={t.rfc} mono />
              <FieldView label="Calle" value={t.info_calle} />
              <FieldView label="No. Externo" value={t.info_num_externo} />
              <FieldView label="Colonia" value={t.info_colonia} />
              <FieldView label="Delegación" value={t.info_delegacion} />
              <FieldView label="Ciudad" value={t.info_ciudad} />
              <FieldView label="C.P." value={t.info_codigo_postal} />
            </div>
          </div>
        </div>
      )}

      {/* ════ DATOS GENERALES (non-fiscal) ════ */}
      {tab === 'address' && !fiscal && (
        <div className="card">
          <div className="card-head">
            <h3>Datos Generales del Condominio</h3>
            <span className="badge badge-teal">{t.country || 'Sin país'}</span>
            {isAdmin && (
              <button className="btn btn-primary btn-sm" onClick={() => {
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
              }}>
                <Edit2 size={13} /> Editar
              </button>
            )}
          </div>
          <div className="card-body">
            <div className="form-grid">
              <FieldView label="Nombre" value={t.addr_nombre} />
              <FieldView label="Calle" value={t.addr_calle} />
              <FieldView label="No. Externo" value={t.addr_num_externo} />
              {(t.country === 'México' || t.country === 'Mexico' || !t.country) && <>
                <FieldView label="Colonia" value={t.addr_colonia} />
                <FieldView label="Delegación" value={t.addr_delegacion} />
                <FieldView label="Ciudad" value={t.addr_ciudad} />
                <FieldView label="C.P." value={t.addr_codigo_postal} />
              </>}
            </div>
          </div>
        </div>
      )}

      {/* ════ LOGO ════ */}
      {tab === 'logo' && (
        <div className="card">
          <div className="card-head"><h3>Logo del Condominio</h3></div>
          <div className="card-body" style={{ display: 'flex', alignItems: 'flex-start', gap: 32, flexWrap: 'wrap' }}>
            {isAdmin ? (
              <label className="logo-box" style={{ width: 180, height: 180, cursor: 'pointer', position: 'relative' }}>
                {t.logo
                  ? <img src={t.logo} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  : <><Upload size={28} color="var(--ink-300)" /><span>Haz clic para subir</span></>
                }
                <input ref={logoRef} type="file" accept="image/*"
                  style={{ position: 'absolute', width: '100%', height: '100%', opacity: 0, cursor: 'pointer', top: 0, left: 0 }}
                  onChange={handleLogoUpload} />
              </label>
            ) : (
              <div className="logo-box" style={{ width: 180, height: 180, cursor: 'default' }}>
                {t.logo
                  ? <img src={t.logo} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  : <><Building2 size={28} color="var(--ink-300)" /><span>Sin logo</span></>
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
        </div>
      )}

      {/* ════ GENERAL ════ */}
      {tab === 'general' && (
        <div className="card">
          <div className="card-head">
            <h3>Configuración General</h3>
            {isAdmin && (
              <button className="btn btn-primary btn-sm" onClick={() => {
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
                  common_areas: Array.isArray(t.common_areas) ? t.common_areas.join(', ') : (t.common_areas || ''),
                });
                setEditGenOpen(true);
              }}>
                <Edit2 size={13} /> Editar
              </button>
            )}
          </div>
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
              <div className="field field-full">
                <div className="field-label">Áreas Comunes</div>
                <div className={`field-value${!t.common_areas ? ' empty' : ''}`}>
                  {Array.isArray(t.common_areas) ? t.common_areas.join(', ') : (t.common_areas || '—')}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════ UNIDADES ════ */}
      {tab === 'units' && (
        <div>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:12, marginBottom:16 }}>
            <p style={{ fontSize:14, color:'var(--ink-400)' }}>
              {unitsTotalCount > 0
                ? `${(unitsPage - 1) * unitsPageSize + 1}-${Math.min(unitsPage * unitsPageSize, unitsTotalCount)} de ${unitsTotalCount} unidades`
                : '0 unidades registradas'}
            </p>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, background:'var(--white)', border:'1px solid var(--sand-200)', borderRadius:'var(--radius-full)', padding:'7px 14px', width:220 }}>
                <Search size={14} color="var(--ink-400)" style={{ flexShrink:0 }} />
                <input style={{ border:'none', background:'transparent', outline:'none', fontSize:13, width:'100%', fontFamily:'var(--font-body)', color:'var(--ink-800)' }}
                  placeholder="Buscar unidad..."
                  value={unitSearch} onChange={e => setUnitSearch(e.target.value)} />
              </div>
              {isAdmin && (
                <button className="btn btn-primary" onClick={() => {
                  setUnitForm({ unit_name:'', unit_id_code:'', owner_first_name:'', owner_last_name:'', owner_email:'', owner_phone:'', occupancy:'propietario', previous_debt:0, previous_debt_evidence:'', credit_balance:0, admin_exempt:false, tenant_first_name:'', tenant_last_name:'', tenant_email:'', tenant_phone:'' });
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
                    {filteredUnits.map(u => {
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
                          <span className={`badge ${u.occupancy==='propietario'?'badge-teal':'badge-amber'}`}>
                            <span className="badge-dot" style={{ background: u.occupancy==='propietario'?'var(--teal-500)':'var(--amber-500)' }} />
                            {u.occupancy==='propietario'?'Propietario':'Rentado'}
                          </span>
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
                          {u.previous_debt_evidence
                            ? <button className="btn-ghost" title="Ver evidencia" style={{ fontSize:10, color:'var(--blue-500)' }} onClick={()=>{
                              const win=window.open('','_blank');
                              win.document.write('<html><body style="margin:0"><embed src="data:application/pdf;base64,'+u.previous_debt_evidence+'" type="application/pdf" width="100%" height="100%" style="position:absolute;inset:0"></body></html>');
                              win.document.close();
                            }}><FileText size={14}/> PDF</button>
                            : <span style={{ color:'var(--ink-300)', fontSize:12 }}>—</span>}
                        </td>
                        {isAdmin && (
                          <td>
                            <div style={{ display:'flex', gap:4 }}>
                              <button className="btn-ghost" onClick={() => { setUnitForm({...u}); setUnitModal('edit'); }}><Edit2 size={14}/></button>
                              <button className="btn-ghost" style={{ color:'var(--coral-500)' }} onClick={() => handleUnitDelete(u.id)}><Trash2 size={14}/></button>
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

            {/* Paginación (HTML original) */}
            {unitsTotalCount > 0 && (() => {
              const totalPages = Math.max(1, Math.ceil(unitsTotalCount / unitsPageSize));
              const start = (unitsPage - 1) * unitsPageSize + 1;
              const end = Math.min(unitsPage * unitsPageSize, unitsTotalCount);
              return (
                <div className="pag-bar">
                  <span className="pag-left">Mostrando {start}-{end} de {unitsTotalCount}</span>
                  <div className="pag-right">
                    <div className="pag-per-page">
                      Mostrar
                      <select value={unitsPageSize} onChange={e => { const v = Number(e.target.value); setUnitsPageSize(v); setUnitsPage(1); loadUnits(1, v); }}>
                        {UNITS_PAGE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                      por página
                    </div>
                    <div className="pag-btns">
                      <button className="pag-btn" disabled={unitsPage <= 1} onClick={() => { setUnitsPage(1); loadUnits(1, unitsPageSize); }} title="Primera página">«</button>
                      <button className="pag-btn" disabled={unitsPage <= 1} onClick={() => { setUnitsPage(p => p - 1); loadUnits(unitsPage - 1, unitsPageSize); }} title="Anterior">‹</button>
                      {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => i + 1).map(p => (
                        <button key={p} className={`pag-btn ${p === unitsPage ? 'active' : ''}`} onClick={() => { setUnitsPage(p); loadUnits(p, unitsPageSize); }}>{p}</button>
                      ))}
                      <button className="pag-btn" disabled={unitsPage >= totalPages} onClick={() => { setUnitsPage(p => p + 1); loadUnits(unitsPage + 1, unitsPageSize); }} title="Siguiente">›</button>
                      <button className="pag-btn" disabled={unitsPage >= totalPages} onClick={() => { setUnitsPage(totalPages); loadUnits(totalPages, unitsPageSize); }} title="Última página">»</button>
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
        const cobFields = fields.filter(f => !f.field_type || f.field_type === 'normal');
        const gasFields = fields.filter(f => f.field_type === 'gastos');
        const cobActive = cobFields.filter(f => f.enabled);
        const gasActive = gasFields.filter(f => f.enabled);

        const FieldRow = ({ f }) => {
          const isCob = !f.field_type || f.field_type === 'normal';
          const typeColor = isCob ? 'var(--teal-500)' : 'var(--amber-500)';
          const typeBg = isCob ? 'var(--teal-50)' : 'var(--amber-50)';
          const typeBorder = isCob ? 'var(--teal-100)' : 'var(--amber-100)';
          return (
            <div style={{ display:'flex', gap:0, padding:'16px 20px', borderBottom:'1px solid var(--sand-100)', alignItems:'flex-start', transition:'background 0.12s' }}
              onMouseOver={e => e.currentTarget.style.background='var(--sand-50)'} onMouseOut={e => e.currentTarget.style.background=''}>
              <div style={{ width:3, borderRadius:3, minHeight:40, background:f.enabled?typeColor:'var(--sand-200)', flexShrink:0, marginRight:16, marginTop:2, transition:'background 0.2s' }} />
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:4 }}>
                  <span style={{ fontSize:14, fontWeight:700, color:'var(--ink-800)' }}>{f.label}</span>
                  <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:'var(--radius-full)', background:typeBg, color:typeColor, border:`1px solid ${typeBorder}` }}>{isCob?'Cobranza':'Gastos'}</span>
                  {f.enabled && isCob && <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:'var(--radius-full)', background:f.required?'var(--coral-50)':'var(--sand-100)', color:f.required?'var(--coral-500)':'var(--ink-500)', border:`1px solid ${f.required?'var(--coral-100)':'var(--sand-200)'}` }}>{f.required?'Obligatorio':'Opcional'}</span>}
                  {!f.enabled && <span style={{ fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:'var(--radius-full)', background:'var(--sand-100)', color:'var(--ink-400)' }}>Inactivo</span>}
                </div>
                {isCob && f.required && f.enabled && parseFloat(f.default_amount)>0 &&
                  <div style={{ fontSize:12, color:'var(--ink-500)' }}>Cargo mensual fijo: <strong style={{ color:'var(--teal-700)' }}>{fmt(f.default_amount)}</strong></div>}
                {!f.enabled && <div style={{ fontSize:12, color:'var(--ink-400)' }}>Activa este campo para usarlo en cobranza</div>}
                {f.enabled && isCob && !f.required && <div style={{ fontSize:12, color:'var(--ink-400)' }}>Campo opcional — monto variable por período</div>}
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
              <button className="btn btn-primary btn-sm" onClick={() => setFieldForm({ label:'', default_amount:0, required:false, enabled:true, field_type:'normal', cross_unit:false, description:'' })}>
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
      {tab === 'users' && (
        <div>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16, flexWrap:'wrap', gap:12 }}>
            <p style={{ fontSize:14, color:'var(--ink-400)' }}>{tenantUsers.length} usuario{tenantUsers.length!==1?'s':''}</p>
            {isAdmin && (
              <button className="btn btn-primary" onClick={() => { setAddUserForm({ role:'admin' }); setAddUserOpen(true); }}>
                <Plus size={14} /> Nuevo Usuario
              </button>
            )}
          </div>
          <div className="card">
            {tenantUsers.length === 0
              ? <div className="card-body" style={{ color:'var(--ink-300)', fontSize:13 }}>Sin usuarios registrados.</div>
              : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Nombre</th><th>Email</th><th>Rol</th><th>Contraseña</th>
                        {isAdmin && <th style={{ width:80 }}>Acciones</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {tenantUsers.map(u => {
                        const name = u.user_name || u.name || u.user_email || '—';
                        const email = u.user_email || u.email || '—';
                        const meta = ROLE_META[u.role] || { label: u.role, color:'var(--ink-500)', bg:'var(--sand-100)' };
                        return (
                          <tr key={u.id}>
                            <td style={{ fontWeight:600, fontSize:13 }}>{name}</td>
                            <td style={{ fontSize:13, color:'var(--ink-500)' }}>{email}</td>
                            <td>
                              <span className="badge" style={{ background:meta.bg, color:meta.color, fontSize:11 }}>
                                <span className="badge-dot" style={{ background:meta.color }} />
                                {meta.label}
                              </span>
                            </td>
                            <td>{u.must_change_password?<span className="badge badge-amber">Cambio pendiente</span>:<span className="badge badge-teal">Activa</span>}</td>
                            {isAdmin && (
                              <td>
                                {u.user !== user?.id && (
                                  <button className="btn-ghost" style={{ color:'var(--coral-500)' }} onClick={async () => {
                                    if (window.confirm(`¿Eliminar usuario ${email}?`)) {
                                      await usersAPI.delete(tenantId, u.id);
                                      loadUsers(); toast.success('Usuario eliminado');
                                    }
                                  }}><Trash2 size={13}/></button>
                                )}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )
            }
          </div>
        </div>
      )}

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

      {/* ══════════════════════════════════════════════════════════
           MODALS
      ══════════════════════════════════════════════════════════ */}

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
              {isSuperAdmin
                ? <>
                    <input type="month" className="field-input" value={editGenForm.operation_start_date||''} onChange={e=>setEditGenForm(f=>({...f,operation_start_date:e.target.value}))} />
                    <div style={{ fontSize:11, color:'var(--teal-600)', marginTop:4, display:'flex', alignItems:'center', gap:4 }}><ShieldCheck size={11}/> Como Super Admin puedes modificar la fecha de inicio</div>
                  </>
                : <>
                    <div className="field-value">
                      <span style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'4px 10px', background:'var(--teal-50)', border:'1px solid var(--teal-100)', borderRadius:'var(--radius-full)', fontSize:12, color:'var(--teal-700)' }}>
                        <Calendar size={12}/> {editGenForm.operation_start_date ? periodLabel(editGenForm.operation_start_date) : 'No configurado'}
                      </span>
                    </div>
                    <div style={{ fontSize:11, color:'var(--amber-500)', marginTop:4, display:'flex', alignItems:'center', gap:4 }}><Lock size={11}/> Solo el Super Administrador puede modificar el período inicial</div>
                  </>
              }
            </div>
            <div className="field">
              <label className="field-label">Tipo de Operación</label>
              <select className="field-select" value={editGenForm.operation_type||'fiscal'} onChange={e=>setEditGenForm(f=>({...f,operation_type:e.target.value}))}>
                <option value="fiscal">Operación Fiscal</option>
                <option value="libre">Operación Libre</option>
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
            <div className="field field-full">
              <label className="field-label">Áreas Comunes</label>
              <input className="field-input" placeholder="Alberca, Gimnasio, Salón de eventos..." value={editGenForm.common_areas||''} onChange={e=>setEditGenForm(f=>({...f,common_areas:e.target.value}))} />
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
                <option value="propietario">Propietario</option>
                <option value="rentado">Rentado</option>
              </select>
            </div>
            <div className="field">
              <label className="field-label">Adeudo Anterior</label>
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
                    const data=unitForm.previous_debt_evidence;
                    if(!data) return toast.error('No hay PDF cargado.');
                    const win=window.open('','_blank');
                    win.document.write('<html><body style="margin:0"><embed src="data:application/pdf;base64,'+data+'" type="application/pdf" width="100%" height="100%" style="position:absolute;inset:0"></body></html>');
                    win.document.close();
                  }}><FileText size={12}/> Ver</button>
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
          <div className="form-section-label">Propietario</div>
          <div className="form-grid" style={{ marginBottom:24 }}>
            {[['owner_first_name','Nombre','Carlos'],['owner_last_name','Apellido','Rodríguez'],['owner_email','Email','carlos@email.com'],['owner_phone','Teléfono','+52 55 1234 5678']].map(([k,l,ph])=>(
              <div className="field" key={k}><label className="field-label">{l}</label><input className="field-input" placeholder={ph} value={unitForm[k]||''} onChange={e=>setUnitForm(f=>({...f,[k]:e.target.value}))}/></div>
            ))}
          </div>
          {unitForm.occupancy==='rentado' && (
            <div className="tenant-panel">
              <div className="form-section-label" style={{ color:'var(--amber-500)', borderColor:'var(--teal-100)', marginTop:0 }}>Inquilino</div>
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
                    onClick={()=>setFieldForm(f=>({...f,field_type:'normal'}))}>
                    <Receipt size={14} /> Cobranza
                  </button>
                  <button type="button" style={{ flex:1, padding:'8px 14px', fontSize:13, fontWeight:600, cursor:'pointer', border:'none', borderLeft:'1.5px solid var(--sand-200)', display:'flex', alignItems:'center', justifyContent:'center', gap:6, background:fieldForm.field_type==='gastos'?'var(--amber-50)':'var(--white)', color:fieldForm.field_type==='gastos'?'var(--amber-700)':'var(--ink-500)', transition:'all 0.15s' }}
                    onClick={()=>setFieldForm(f=>({...f,field_type:'gastos'}))}>
                    <ShoppingBag size={14} /> Gastos
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
            {(!fieldForm.field_type || fieldForm.field_type==='normal') && (
              <div className="field">
                <label className="field-label" style={{ display:'flex', alignItems:'center', gap:4 }}><Calendar size={13}/> Duración (períodos)</label>
                <input type="number" min="0" className="field-input" value={fieldForm.duration_periods||0} onChange={e=>setFieldForm(f=>({...f,duration_periods:parseInt(e.target.value)||0}))} />
                <div style={{ fontSize:11, color:'var(--ink-400)', marginTop:4 }}>0 = permanente · 6 = seis meses · 12 = un año</div>
              </div>
            )}
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
        <Modal title="Nuevo Usuario" large
          onClose={() => { setAddUserOpen(false); setAddUserForm({}); }}
          onSave={saveUser}
          saveLabel="Crear Usuario"
          saving={saving}>
          <div className="form-grid">
            <div className="field">
              <label className="field-label">Nombre Completo</label>
              <input className="field-input" value={addUserForm.name||''} onChange={e=>setAddUserForm(f=>({...f,name:e.target.value}))} />
            </div>
            <div className="field">
              <label className="field-label">Email</label>
              <input type="email" className="field-input" value={addUserForm.email||''} onChange={e=>setAddUserForm(f=>({...f,email:e.target.value}))} />
            </div>
            <div className="field">
              <label className="field-label">Rol</label>
              <select className="field-select" value={addUserForm.role||'admin'} onChange={e=>setAddUserForm(f=>({...f,role:e.target.value}))}>
                {TENANT_ROLES.map(r => {
                  const m = ROLE_META[r];
                  return <option key={r} value={r}>{m?.label||r} — {m?.desc||''}</option>;
                })}
              </select>
            </div>
            <div className="field">
              <label className="field-label">Contraseña Inicial</label>
              <input type="text" className="field-input" placeholder="Mínimo 8 caracteres" value={addUserForm.password||''} onChange={e=>setAddUserForm(f=>({...f,password:e.target.value}))} />
            </div>
            {addUserForm.role==='vecino' && (
              <div className="field field-full">
                <label className="field-label">Unidad Asignada</label>
                <select className="field-select" value={addUserForm.unit_id||''} onChange={e=>setAddUserForm(f=>({...f,unit_id:e.target.value}))}>
                  <option value="">— Sin asignar —</option>
                  {units.map(u=><option key={u.id} value={u.id}>{u.unit_id_code} - {u.unit_name}</option>)}
                </select>
              </div>
            )}
          </div>
          <div style={{ marginTop:16, padding:14, background:'var(--amber-50)', border:'1px solid var(--amber-100)', borderRadius:'var(--radius-md)', fontSize:13, color:'var(--ink-600)', display:'flex', alignItems:'flex-start', gap:10 }}>
            <Lock size={16} color="var(--amber-500)" style={{ flexShrink:0, marginTop:1 }} />
            <div><strong>Cambio obligatorio:</strong> El usuario deberá cambiar su contraseña en el primer inicio de sesión.</div>
          </div>
        </Modal>
      )}

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
    </div>
  );
}
