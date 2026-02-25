import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { tenantsAPI, extraFieldsAPI, assemblyAPI, usersAPI, unitsAPI } from '../api/client';
import { CURRENCIES, getStatesForCountry, COUNTRIES } from '../utils/helpers';
import {
  Settings, Plus, Trash2, Check, X, Upload, Users,
  Building2, RefreshCw, Edit2, Search, Home, Lock,
  Calendar, DollarSign, ShieldCheck,
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

  // Unit modal
  const [unitSearch, setUnitSearch] = useState('');
  const [unitModal, setUnitModal] = useState(null);
  const [unitForm, setUnitForm] = useState({});

  // Field modal
  const [fieldForm, setFieldForm] = useState(null);

  // User modal
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [addUserForm, setAddUserForm] = useState({});

  // Org modals
  const [cmtForm, setCmtForm] = useState(null);
  const [posForm, setPosForm] = useState(null);

  // ── Loaders ───────────────────────────────────────────────────────────────
  const loadTenant = useCallback(() => {
    if (!tenantId) return Promise.resolve();
    setLoading(true);
    return tenantsAPI.get(tenantId)
      .then(r => { setTenant(r.data); setLoadError(null); })
      .catch(e => setLoadError(e.response?.data?.detail || 'No se pudo cargar la configuración'))
      .finally(() => setLoading(false));
  }, [tenantId]);

  const loadFields   = useCallback(() => { if (!tenantId) return; extraFieldsAPI.list(tenantId).then(r => setFields(r.data.results || r.data)).catch(() => {}); }, [tenantId]);
  const loadUsers    = useCallback(() => { if (!tenantId) return; usersAPI.list(tenantId).then(r => setTenantUsers(r.data.results || r.data)).catch(() => {}); }, [tenantId]);
  const loadUnits    = useCallback(() => { if (!tenantId) return; unitsAPI.list(tenantId).then(r => setUnits(r.data.results || r.data)).catch(() => {}); }, [tenantId]);
  const loadAssembly = useCallback(() => {
    if (!tenantId) return;
    assemblyAPI.positions(tenantId).then(r => setPositions(r.data.results || r.data)).catch(() => {});
    assemblyAPI.committees(tenantId).then(r => setCommittees(r.data.results || r.data)).catch(() => {});
  }, [tenantId]);

  useEffect(() => {
    setTenant(null); setLoadError(null);
    loadTenant(); loadFields(); loadUsers(); loadUnits(); loadAssembly();
  }, [loadTenant, loadFields, loadUsers, loadUnits, loadAssembly]);

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
      if (posForm.id) await assemblyAPI.updatePosition(tenantId, posForm.id, posForm);
      else await assemblyAPI.createPosition(tenantId, posForm);
      toast.success('Cargo guardado'); setPosForm(null); loadAssembly();
    } catch { toast.error('Error'); }
  };

  const saveCommittee = async () => {
    try {
      await assemblyAPI.createCommittee(tenantId, cmtForm);
      toast.success('Comité creado'); setCmtForm(null); loadAssembly();
    } catch { toast.error('Error'); }
  };

  const handleUnitSave = async () => {
    if (!unitForm.unit_name || !unitForm.unit_id_code) return toast.error('Nombre e ID son obligatorios');
    try {
      if (unitModal === 'add') await unitsAPI.create(tenantId, { ...unitForm, tenant: tenantId });
      else await unitsAPI.update(tenantId, unitForm.id, unitForm);
      toast.success(unitModal === 'add' ? 'Unidad creada' : 'Unidad actualizada');
      setUnitModal(null); loadUnits();
    } catch (e) { toast.error(e.response?.data?.unit_id_code?.[0] || 'Error guardando unidad'); }
  };

  const handleUnitDelete = async (id) => {
    if (!window.confirm('¿Eliminar esta unidad? Se perderán todos sus pagos asociados.')) return;
    try { await unitsAPI.delete(tenantId, id); toast.success('Unidad eliminada'); loadUnits(); }
    catch { toast.error('Error eliminando unidad'); }
  };

  const saveUser = async () => {
    if (!addUserForm.name || !addUserForm.email || !addUserForm.role || !addUserForm.password)
      return toast.error('Todos los campos son obligatorios');
    try {
      await usersAPI.create({ ...addUserForm, tenant_id: tenantId });
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
              <FieldView label="Colonia" value={t.addr_colonia} />
              <FieldView label="Delegación" value={t.addr_delegacion} />
              <FieldView label="Ciudad" value={t.addr_ciudad} />
              <FieldView label="C.P." value={t.addr_codigo_postal} />
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
            <p style={{ fontSize:14, color:'var(--ink-400)' }}>{units.length} unidades registradas</p>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, background:'var(--white)', border:'1px solid var(--sand-200)', borderRadius:'var(--radius-full)', padding:'7px 14px', width:220 }}>
                <Search size={14} color="var(--ink-400)" style={{ flexShrink:0 }} />
                <input style={{ border:'none', background:'transparent', outline:'none', fontSize:13, width:'100%', fontFamily:'var(--font-body)', color:'var(--ink-800)' }}
                  placeholder="Buscar unidad..."
                  value={unitSearch} onChange={e => setUnitSearch(e.target.value)} />
              </div>
              {isAdmin && (
                <button className="btn btn-primary" onClick={() => {
                  setUnitForm({ unit_name:'', unit_id_code:'', owner_first_name:'', owner_last_name:'', owner_email:'', owner_phone:'', occupancy:'propietario', tenant_first_name:'', tenant_last_name:'', tenant_email:'', tenant_phone:'' });
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
                      {isAdmin && <th style={{ width:90 }}>Acciones</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUnits.map(u => (
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
                        {isAdmin && (
                          <td>
                            <div style={{ display:'flex', gap:4 }}>
                              <button className="btn-ghost" onClick={() => { setUnitForm({...u}); setUnitModal('edit'); }}><Edit2 size={14}/></button>
                              <button className="btn-ghost" style={{ color:'var(--coral-500)' }} onClick={() => handleUnitDelete(u.id)}><Trash2 size={14}/></button>
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
        </div>
      )}

      {/* ════ CONFIG. PAGOS ════ */}
      {tab === 'fields' && (
        <div>
          {/* Summary banner */}
          <div style={{ background:'var(--teal-50)', border:'1px solid var(--teal-100)', borderRadius:'var(--radius-lg)', padding:'18px 24px', marginBottom:20 }}>
            <div style={{ display:'flex', justifyContent:'space-between', flexWrap:'wrap', gap:12, alignItems:'center' }}>
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:'var(--teal-700)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 }}>Cargo mensual mínimo por unidad</div>
                <div style={{ display:'flex', alignItems:'baseline', gap:8 }}>
                  <span style={{ fontFamily:'var(--font-display)', fontSize:28, fontWeight:500, color:'var(--teal-800)' }}>{fmt(totalMonthly)}</span>
                  <span style={{ fontSize:12, color:'var(--teal-600)' }}>Mant. + {reqCobFields.length} oblig.</span>
                </div>
              </div>
              <div style={{ fontSize:13, color:'var(--teal-700)', lineHeight:1.8 }}>
                <div>Mantenimiento: {fmt(t.maintenance_fee)}</div>
                {reqCobFields.map(f => <div key={f.id}>+ {f.label}: {fmt(f.default_amount)}</div>)}
              </div>
            </div>
          </div>

          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
            <p style={{ fontSize:14, color:'var(--ink-400)' }}>Configura los campos de cobranza y gastos del condominio</p>
            {isAdmin && (
              <button className="btn btn-primary btn-sm" onClick={() => setFieldForm({ label:'', default_amount:0, required:false, enabled:true, field_type:'normal' })}>
                <Plus size={14} /> Nuevo Campo
              </button>
            )}
          </div>

          <div className="card">
            <div className="card-head">
              <h3>Campos de Cobranza y Gastos</h3>
              <span style={{ fontSize:13, color:'var(--ink-400)' }}>{fields.length} campos</span>
            </div>
            {fields.length === 0
              ? <div className="card-body" style={{ color:'var(--ink-300)', fontSize:13 }}>Sin campos configurados</div>
              : fields.map(f => {
                  const isCob = !f.field_type || f.field_type === 'normal';
                  const typeColor = isCob ? 'var(--teal-500)' : 'var(--amber-500)';
                  return (
                    <div key={f.id} style={{ display:'flex', padding:'16px 20px', borderBottom:'1px solid var(--sand-100)', alignItems:'flex-start' }}>
                      <div style={{ width:3, borderRadius:3, minHeight:40, background:f.enabled?typeColor:'var(--sand-200)', flexShrink:0, marginRight:16, marginTop:2 }} />
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:4 }}>
                          <span style={{ fontSize:14, fontWeight:700, color:'var(--ink-800)' }}>{f.label}</span>
                          <span className={`badge ${isCob?'badge-cobranza':'badge-gastos-type'}`}>{isCob?'Cobranza':'Gastos'}</span>
                          {f.enabled && isCob && <span className={`badge ${f.required?'badge-required':'badge-optional'}`}>{f.required?'Obligatorio':'Opcional'}</span>}
                          {!f.enabled && <span className="badge badge-gray">Inactivo</span>}
                          {f.is_system_default && <span className="badge badge-gray" style={{ fontSize:10 }}>sistema</span>}
                        </div>
                        {isCob && f.required && f.enabled && parseFloat(f.default_amount)>0 &&
                          <div style={{ fontSize:12, color:'var(--ink-500)' }}>Cargo mensual fijo: <strong style={{ color:'var(--teal-700)' }}>{fmt(f.default_amount)}</strong></div>}
                        {!f.enabled && <div style={{ fontSize:12, color:'var(--ink-400)' }}>Activa este campo para usarlo en cobranza</div>}
                        {f.enabled && isCob && !f.required && <div style={{ fontSize:12, color:'var(--ink-400)' }}>Campo opcional — monto variable por período</div>}
                        {!isCob && f.enabled && <div style={{ fontSize:12, color:'var(--ink-400)' }}>Campo de gastos operativos del condominio</div>}
                        {isAdmin && f.enabled && isCob && f.required && (
                          <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:10, padding:'10px 12px', background:'var(--teal-50)', border:'1px solid var(--teal-100)', borderRadius:'var(--radius-sm)' }}>
                            <DollarSign size={14} color="var(--teal-600)" />
                            <span style={{ fontSize:12, color:'var(--teal-700)', fontWeight:600 }}>Monto mensual:</span>
                            <input style={{ width:110, padding:'5px 8px', border:'1.5px solid var(--teal-200)', borderRadius:6, fontSize:13, fontWeight:700, color:'var(--teal-700)', background:'white', outline:'none', textAlign:'right', fontFamily:'var(--font-body)' }}
                              type="number" min="0" defaultValue={f.default_amount||0}
                              onBlur={e => toggleField(f.id, { default_amount: e.target.value })} />
                          </div>
                        )}
                      </div>
                      <div style={{ display:'flex', alignItems:'center', gap:12, paddingLeft:16, flexShrink:0 }}>
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
                          <div style={{ display:'flex', gap:4 }}>
                            <button className="btn-ghost" onClick={() => setFieldForm(f)}><Settings size={13}/></button>
                            {!f.is_system_default && (
                              <button className="btn-ghost" style={{ color:'var(--coral-400)' }} onClick={async () => {
                                if (window.confirm('¿Eliminar campo?')) { await extraFieldsAPI.delete(tenantId,f.id); loadFields(); }
                              }}><Trash2 size={13}/></button>
                            )}
                          </div>
                        )}
                        {!isAdmin && (
                          <span className="badge" style={{ background:f.enabled?'var(--teal-50)':'var(--sand-100)', color:f.enabled?'var(--teal-700)':'var(--ink-400)', fontSize:11 }}>
                            {f.enabled?'Activo':'Inactivo'}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
            }
          </div>
        </div>
      )}

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
                        <th>Nombre</th><th>Email</th><th>Rol</th><th>Unidad</th><th>Contraseña</th>
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
                            <td style={{ fontSize:12, fontFamily:'monospace' }}>{u.unit_code||u.unit_id_code||'—'}</td>
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
      )}

      {/* ════ ORGANIZACIÓN ════ */}
      {tab === 'org' && (
        <div style={{ display:'grid', gap:24 }}>
          <div className="card">
            <div className="card-head">
              <h3>Comités</h3>
              {isAdmin && <button className="btn btn-primary btn-sm" onClick={() => setCmtForm({ name:'', type:'comite' })}><Plus size={13}/> Nuevo Comité</button>}
            </div>
            {committees.length===0
              ? <div className="card-body" style={{ color:'var(--ink-300)', fontSize:13 }}>Sin comités registrados.</div>
              : <div className="table-wrap"><table>
                  <thead><tr><th>Nombre</th><th>Tipo</th>{isAdmin&&<th>Acciones</th>}</tr></thead>
                  <tbody>{committees.map(c=>(
                    <tr key={c.id}>
                      <td style={{ fontWeight:600, fontSize:13 }}>{c.name}</td>
                      <td><span className="badge badge-teal" style={{ fontSize:11 }}>{c.type}</span></td>
                      {isAdmin&&<td><button className="btn-ghost" style={{ color:'var(--coral-500)' }} onClick={async()=>{if(window.confirm('¿Eliminar?')){await assemblyAPI.deleteCommittee(tenantId,c.id);loadAssembly();}}}><Trash2 size={12}/></button></td>}
                    </tr>
                  ))}</tbody>
                </table></div>
            }
          </div>

          <div className="card">
            <div className="card-head">
              <h3>Cargos de Asamblea</h3>
              {isAdmin && <button className="btn btn-primary btn-sm" onClick={() => setPosForm({ name:'', member_name:'', start_date:'', end_date:'' })}><Plus size={13}/> Nuevo Cargo</button>}
            </div>
            {positions.length===0
              ? <div className="card-body" style={{ color:'var(--ink-300)', fontSize:13 }}>Sin cargos registrados.</div>
              : <div className="table-wrap"><table>
                  <thead><tr><th>Cargo</th><th>Titular</th><th>Inicio</th><th>Fin</th>{isAdmin&&<th>Acciones</th>}</tr></thead>
                  <tbody>{positions.map(p=>(
                    <tr key={p.id}>
                      <td style={{ fontWeight:600, fontSize:13 }}>{p.name}</td>
                      <td style={{ fontSize:13 }}>{p.member_name||'—'}</td>
                      <td style={{ fontSize:12 }}>{p.start_date||'—'}</td>
                      <td style={{ fontSize:12 }}>{p.end_date||'—'}</td>
                      {isAdmin&&<td><div style={{ display:'flex', gap:4 }}>
                        <button className="btn-ghost" onClick={()=>setPosForm(p)}><Settings size={12}/></button>
                        <button className="btn-ghost" style={{ color:'var(--coral-500)' }} onClick={async()=>{if(window.confirm('¿Eliminar?')){await assemblyAPI.deletePosition(tenantId,p.id);loadAssembly();}}}><Trash2 size={12}/></button>
                      </div></td>}
                    </tr>
                  ))}</tbody>
                </table></div>
            }
          </div>
        </div>
      )}

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
      {editAddrOpen && (
        <Modal title="Editar Datos Generales" large
          onClose={() => setEditAddrOpen(false)}
          onSave={() => savePatch(editAddrForm, () => setEditAddrOpen(false))}
          saving={saving}>
          <div className="form-grid">
            <div className="field field-full">
              <label className="field-label">Nombre del Edificio</label>
              <input className="field-input" value={editAddrForm.addr_nombre||''} onChange={e=>setEditAddrForm(f=>({...f,addr_nombre:e.target.value}))} />
            </div>
            {[['addr_calle','Calle'],['addr_num_externo','No. Externo'],['addr_colonia','Colonia'],['addr_delegacion','Delegación'],['addr_ciudad','Ciudad'],['addr_codigo_postal','C.P.']].map(([k,l])=>(
              <div className="field" key={k}>
                <label className="field-label">{l}</label>
                <input className="field-input" value={editAddrForm[k]||''} onChange={e=>setEditAddrForm(f=>({...f,[k]:e.target.value}))} />
              </div>
            ))}
          </div>
        </Modal>
      )}

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
              <label className="field-label">Cuota de Mantenimiento</label>
              <input type="number" className="field-input" value={editGenForm.maintenance_fee||''} onChange={e=>setEditGenForm(f=>({...f,maintenance_fee:e.target.value}))} />
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
        </Modal>
      )}

      {/* Add Custom Field */}
      {fieldForm && (
        <Modal title={fieldForm.id?'Editar Campo':'Nuevo Campo Extendido'} large
          onClose={() => setFieldForm(null)}
          onSave={saveField}
          saving={saving}>
          <div className="form-grid">
            <div className="field field-full">
              <label className="field-label">Nombre del Campo <span style={{ color:'var(--coral-500)' }}>*</span></label>
              <input className="field-input" placeholder="Ej: Fondo de Reserva, Cuota extraordinaria" value={fieldForm.label||''} onChange={e=>setFieldForm(f=>({...f,label:e.target.value}))} />
            </div>
            <div className="field">
              <label className="field-label">Tipo de Campo</label>
              <select className="field-select" value={fieldForm.field_type||'normal'} onChange={e=>setFieldForm(f=>({...f,field_type:e.target.value}))}>
                <option value="normal">Cobranza</option>
                <option value="gastos">Gastos</option>
              </select>
            </div>
            <div className="field">
              <label className="field-label">Monto Fijo (opcional)</label>
              <input type="number" min="0" step="0.01" className="field-input" placeholder="0" value={fieldForm.default_amount||0} onChange={e=>setFieldForm(f=>({...f,default_amount:e.target.value}))} />
              <div style={{ fontSize:11, color:'var(--ink-400)', marginTop:4 }}>Déjalo en 0 si varía por unidad</div>
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
            <div className="field">
              <label className="field-label">Activo</label>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginTop:6 }}>
                <div className={`switch ${fieldForm.enabled?'on':''}`} style={{ cursor:'pointer' }} onClick={()=>setFieldForm(f=>({...f,enabled:!f.enabled}))}>
                  <div className="switch-knob" />
                </div>
                <span style={{ fontSize:12, color:fieldForm.enabled?'var(--teal-600)':'var(--ink-400)' }}>{fieldForm.enabled?'Activo':'Inactivo'}</span>
              </div>
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
        <Modal title="Nuevo Comité" onClose={()=>setCmtForm(null)} onSave={saveCommittee} saving={saving}>
          <div className="form-grid">
            <div className="field field-full"><label className="field-label">Nombre</label><input className="field-input" value={cmtForm.name||''} onChange={e=>setCmtForm(f=>({...f,name:e.target.value}))}/></div>
            <div className="field field-full">
              <label className="field-label">Tipo</label>
              <select className="field-select" value={cmtForm.type||'comite'} onChange={e=>setCmtForm(f=>({...f,type:e.target.value}))}>
                <option value="comite">Comité</option><option value="subcomite">Subcomité</option><option value="brigada">Brigada</option>
              </select>
            </div>
          </div>
        </Modal>
      )}

      {/* Position modal */}
      {posForm && (
        <Modal title={posForm.id?'Editar Cargo':'Nuevo Cargo'} onClose={()=>setPosForm(null)} onSave={savePosition} saving={saving}>
          <div className="form-grid">
            <div className="field field-full"><label className="field-label">Nombre del Cargo</label><input className="field-input" placeholder="Presidente, Tesorero..." value={posForm.name||''} onChange={e=>setPosForm(f=>({...f,name:e.target.value}))}/></div>
            <div className="field field-full"><label className="field-label">Titular</label><input className="field-input" placeholder="Nombre del residente..." value={posForm.member_name||''} onChange={e=>setPosForm(f=>({...f,member_name:e.target.value}))}/></div>
            <div className="field"><label className="field-label">Fecha de inicio</label><input type="date" className="field-input" value={posForm.start_date||''} onChange={e=>setPosForm(f=>({...f,start_date:e.target.value}))}/></div>
            <div className="field"><label className="field-label">Fecha de fin</label><input type="date" className="field-input" value={posForm.end_date||''} onChange={e=>setPosForm(f=>({...f,end_date:e.target.value}))}/></div>
          </div>
        </Modal>
      )}
    </div>
  );
}
