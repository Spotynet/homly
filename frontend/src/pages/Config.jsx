import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { tenantsAPI, extraFieldsAPI, assemblyAPI, usersAPI } from '../api/client';
import { CURRENCIES, getStatesForCountry, COUNTRIES } from '../utils/helpers';
import { Settings, Plus, Trash2, Check, X, Upload, Image, Users, Sliders, Building2 } from 'lucide-react';
import toast from 'react-hot-toast';

function fmt(n) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n ?? 0);
}

const ROLE_META = {
  super_admin:  { label: 'Super Admin',   color: 'var(--purple-500)', bg: 'var(--purple-50)',  desc: 'Acceso total al sistema y todos los condominios' },
  admin:        { label: 'Administrador', color: 'var(--teal-700)',   bg: 'var(--teal-50)',    desc: 'Gestión completa del condominio' },
  tesorero:     { label: 'Tesorero',      color: 'var(--blue-600)',   bg: 'var(--blue-50)',    desc: 'Cobranza, gastos y reportes financieros' },
  vigilante:    { label: 'Vigilante',     color: 'var(--amber-600)',  bg: 'var(--amber-50)',   desc: 'Solo lectura de unidades y residentes' },
  vecino:       { label: 'Vecino',        color: 'var(--ink-500)',    bg: 'var(--sand-100)',   desc: 'Acceso a su unidad y estado de cuenta' },
};

export default function Config() {
  const { tenantId, isAdmin, user } = useAuth();
  const [tab, setTab] = useState('info');
  const [tenant, setTenant] = useState(null);
  const [fields, setFields] = useState([]);
  const [fieldForm, setFieldForm] = useState(null);
  const [tenantUsers, setTenantUsers] = useState([]);
  const [positions, setPositions] = useState([]);
  const [committees, setCommittees] = useState([]);
  const [posForm, setPosForm] = useState(null);
  const [cmtForm, setCmtForm] = useState(null);
  const logoRef = useRef();

  const isSuperAdmin = user?.role === 'super_admin';

  const loadTenant   = () => tenantId && tenantsAPI.get(tenantId).then(r => setTenant(r.data));
  const loadFields   = () => tenantId && extraFieldsAPI.list(tenantId).then(r => setFields(r.data.results || r.data));
  const loadUsers    = () => tenantId && usersAPI.list(tenantId).then(r => setTenantUsers(r.data.results || r.data)).catch(() => {});
  const loadAssembly = () => {
    if (!tenantId) return;
    assemblyAPI.positions(tenantId).then(r => setPositions(r.data.results || r.data)).catch(() => {});
    assemblyAPI.committees(tenantId).then(r => setCommittees(r.data.results || r.data)).catch(() => {});
  };

  useEffect(() => { loadTenant(); loadFields(); loadUsers(); loadAssembly(); }, [tenantId]);

  const saveTenant = async (data) => {
    try {
      await tenantsAPI.update(tenantId, data);
      toast.success('Guardado');
      loadTenant();
    } catch { toast.error('Error al guardar'); }
  };

  const saveField = async () => {
    try {
      if (fieldForm.id) await extraFieldsAPI.update(tenantId, fieldForm.id, fieldForm);
      else await extraFieldsAPI.create(tenantId, { ...fieldForm, tenant: tenantId });
      toast.success('Campo guardado');
      setFieldForm(null);
      loadFields();
    } catch { toast.error('Error'); }
  };

  const savePosition = async () => {
    try {
      if (posForm.id) await assemblyAPI.updatePosition(tenantId, posForm.id, posForm);
      else await assemblyAPI.createPosition(tenantId, posForm);
      toast.success('Cargo guardado');
      setPosForm(null);
      loadAssembly();
    } catch { toast.error('Error'); }
  };

  const saveCommittee = async () => {
    try {
      await assemblyAPI.createCommittee(tenantId, cmtForm);
      toast.success('Comité creado');
      setCmtForm(null);
      loadAssembly();
    } catch { toast.error('Error'); }
  };

  const handleLogoUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error('El logo debe ser menor a 2 MB'); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const updated = { ...tenant, logo: ev.target.result };
      setTenant(updated);
      saveTenant(updated);
    };
    reader.readAsDataURL(file);
  };

  if (!tenant) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '40vh', color: 'var(--ink-400)', fontSize: 14 }}>
      Cargando configuración…
    </div>
  );

  // Total monthly charge per unit
  const reqFields = fields.filter(f => f.enabled && f.required);
  const totalMonthly = parseFloat(tenant.maintenance_fee || 0) + reqFields.reduce((s, f) => s + parseFloat(f.default_amount || 0), 0);

  const tabs = [
    { key: 'info',   label: 'General',          icon: <Settings size={13} /> },
    { key: 'fiscal', label: 'Fiscal',            icon: null },
    { key: 'address',label: 'Dirección',         icon: null },
    { key: 'fields', label: 'Campos de Pago',    icon: <Sliders size={13} /> },
    { key: 'logo',   label: 'Logo',              icon: <Image size={13} /> },
    { key: 'roles',  label: 'Roles y Perfiles',  icon: <Users size={13} /> },
    { key: 'org',    label: 'Organización',       icon: <Building2 size={13} /> },
  ];

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1100, margin: '0 auto' }} className="content-fade">
      {/* ── Header ── */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 500, marginBottom: 4 }}>
          Configuración<span className="brand-dot">.</span>
        </h1>
        <p style={{ color: 'var(--ink-400)', fontSize: 14 }}>{tenant.name}</p>
      </div>

      {/* ── Tabs ── */}
      <div className="tabs">
        {tabs.map(t => (
          <button key={t.key} className={`tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            {t.icon && <span style={{ display: 'inline-flex', alignItems: 'center', marginRight: 5 }}>{t.icon}</span>}
            {t.label}
          </button>
        ))}
      </div>

      {/* ════════════ INFO ════════════ */}
      {tab === 'info' && (
        <div className="card" style={{ maxWidth: 720 }}>
          <div className="card-head"><h3>Información General</h3></div>
          <div className="card-body">
            <div className="form-grid">
              <div className="field field-full">
                <label className="field-label">Nombre del Condominio</label>
                <input className="field-input" value={tenant.name} onChange={e => setTenant({ ...tenant, name: e.target.value })} />
              </div>
              <div className="field">
                <label className="field-label">Cuota de Mantenimiento</label>
                <input type="number" className="field-input" value={tenant.maintenance_fee} onChange={e => setTenant({ ...tenant, maintenance_fee: e.target.value })} />
              </div>
              <div className="field">
                <label className="field-label">Moneda</label>
                <select className="field-select" value={tenant.currency} onChange={e => setTenant({ ...tenant, currency: e.target.value })}>
                  {Object.entries(CURRENCIES).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
                </select>
              </div>
              <div className="field">
                <label className="field-label">País</label>
                <select className="field-select" value={tenant.country} onChange={e => setTenant({ ...tenant, country: e.target.value })}>
                  <option value="">Seleccionar...</option>
                  {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="field">
                <label className="field-label">Estado</label>
                <select className="field-select" value={tenant.state} onChange={e => setTenant({ ...tenant, state: e.target.value })}>
                  <option value="">Seleccionar...</option>
                  {getStatesForCountry(tenant.country).map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="field">
                <label className="field-label">Tipo de Administración</label>
                <select className="field-select" value={tenant.admin_type || 'self'} onChange={e => setTenant({ ...tenant, admin_type: e.target.value })}>
                  <option value="self">Autogestión</option>
                  <option value="professional">Administración Profesional</option>
                </select>
              </div>
              <div className="field field-full">
                <label className="field-label">Áreas Comunes (separadas por coma)</label>
                <input className="field-input" placeholder="Alberca, Gimnasio, Salón de eventos..."
                  value={Array.isArray(tenant.common_areas) ? tenant.common_areas.join(', ') : (tenant.common_areas || '')}
                  onChange={e => setTenant({ ...tenant, common_areas: e.target.value })} />
              </div>
            </div>
            {isAdmin && (
              <div style={{ marginTop: 24 }}>
                <button className="btn btn-primary" onClick={() => saveTenant(tenant)}>Guardar Cambios</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════════ FISCAL ════════════ */}
      {tab === 'fiscal' && (
        <div className="card" style={{ maxWidth: 720 }}>
          <div className="card-head"><h3>Datos Fiscales</h3></div>
          <div className="card-body">
            <div className="form-grid">
              <div className="field field-full">
                <label className="field-label">Razón Social</label>
                <input className="field-input" value={tenant.razon_social || ''} onChange={e => setTenant({ ...tenant, razon_social: e.target.value })} />
              </div>
              <div className="field">
                <label className="field-label">RFC</label>
                <input className="field-input" style={{ fontFamily: 'monospace' }} value={tenant.rfc || ''} onChange={e => setTenant({ ...tenant, rfc: e.target.value })} />
              </div>
            </div>
            {isAdmin && (
              <div style={{ marginTop: 24 }}>
                <button className="btn btn-primary" onClick={() => saveTenant(tenant)}>Guardar</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════════ ADDRESS ════════════ */}
      {tab === 'address' && (
        <div className="card" style={{ maxWidth: 720 }}>
          <div className="card-head"><h3>Dirección</h3></div>
          <div className="card-body">
            <div className="form-grid">
              {[
                ['addr_nombre', 'Nombre del Edificio'],
                ['addr_calle', 'Calle'],
                ['addr_num_externo', 'Número Exterior'],
                ['addr_colonia', 'Colonia'],
                ['addr_delegacion', 'Municipio / Delegación'],
                ['addr_ciudad', 'Ciudad'],
                ['addr_codigo_postal', 'Código Postal'],
              ].map(([k, label]) => (
                <div className="field" key={k}>
                  <label className="field-label">{label}</label>
                  <input className="field-input" value={tenant[k] || ''} onChange={e => setTenant({ ...tenant, [k]: e.target.value })} />
                </div>
              ))}
            </div>
            {isAdmin && (
              <div style={{ marginTop: 24 }}>
                <button className="btn btn-primary" onClick={() => saveTenant(tenant)}>Guardar</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════════ FIELDS (Pagos) ════════════ */}
      {tab === 'fields' && (
        <div>
          {/* Summary card */}
          <div className="tenant-panel" style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--teal-700)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                  Cargo mensual total por unidad
                </div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 500, color: 'var(--teal-800)' }}>{fmt(totalMonthly)}</div>
              </div>
              <div style={{ fontSize: 13, color: 'var(--teal-700)' }}>
                Mantenimiento {fmt(tenant.maintenance_fee)}
                {reqFields.map(f => (
                  <div key={f.id}>+ {f.label} {fmt(f.default_amount)}</div>
                ))}
              </div>
            </div>
          </div>

          {isAdmin && (
            <div style={{ marginBottom: 16 }}>
              <button className="btn btn-primary" onClick={() => setFieldForm({ label: '', default_amount: 0, required: false, enabled: true, field_type: 'normal' })}>
                <Plus size={14} /> Nuevo Campo
              </button>
            </div>
          )}

          <div className="card">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Campo</th>
                    <th style={{ textAlign: 'right' }}>Monto Default</th>
                    <th>Tipo</th>
                    <th style={{ textAlign: 'center' }}>Obligatorio</th>
                    <th style={{ textAlign: 'center' }}>Activo</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {fields.map(f => (
                    <tr key={f.id}>
                      <td style={{ fontWeight: 600, fontSize: 13 }}>
                        {f.label}
                        {f.is_system_default && <span className="badge badge-gray" style={{ marginLeft: 8, fontSize: 10 }}>sistema</span>}
                      </td>
                      <td style={{ textAlign: 'right', fontSize: 13 }}>{fmt(f.default_amount)}</td>
                      <td>
                        <span className={`badge ${f.field_type === 'gastos' ? 'badge-gastos-type' : 'badge-cobranza'}`} style={{ fontSize: 10 }}>
                          {f.field_type}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>{f.required ? <Check size={14} color="var(--teal-600)" /> : <X size={14} color="var(--ink-300)" />}</td>
                      <td style={{ textAlign: 'center' }}>{f.enabled ? <Check size={14} color="var(--teal-600)" /> : <X size={14} color="var(--ink-300)" />}</td>
                      <td>
                        {isAdmin && (
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button className="btn-icon" onClick={() => setFieldForm(f)}><Settings size={12} /></button>
                            {!f.is_system_default && (
                              <button className="btn-icon" style={{ color: 'var(--coral-500)' }} onClick={async () => {
                                if (window.confirm('¿Eliminar este campo?')) { await extraFieldsAPI.delete(tenantId, f.id); loadFields(); }
                              }}><Trash2 size={12} /></button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Field Modal */}
          {fieldForm && (
            <div className="modal-overlay" onClick={() => setFieldForm(null)}>
              <div className="modal-content" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                  <h3>{fieldForm.id ? 'Editar' : 'Nuevo'} Campo</h3>
                  <button className="btn-icon" onClick={() => setFieldForm(null)}><X size={18} /></button>
                </div>
                <div className="modal-body">
                  <div className="form-grid">
                    <div className="field field-full">
                      <label className="field-label">Nombre del Campo</label>
                      <input className="field-input" value={fieldForm.label} onChange={e => setFieldForm({ ...fieldForm, label: e.target.value })} />
                    </div>
                    <div className="field">
                      <label className="field-label">Monto Default</label>
                      <input type="number" className="field-input" value={fieldForm.default_amount} onChange={e => setFieldForm({ ...fieldForm, default_amount: e.target.value })} />
                    </div>
                    <div className="field">
                      <label className="field-label">Tipo</label>
                      <select className="field-select" value={fieldForm.field_type} onChange={e => setFieldForm({ ...fieldForm, field_type: e.target.value })}>
                        <option value="normal">Cobranza</option>
                        <option value="gastos">Gastos</option>
                      </select>
                    </div>
                    <div className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 20, paddingTop: 12 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
                        <input type="checkbox" checked={fieldForm.required} onChange={e => setFieldForm({ ...fieldForm, required: e.target.checked })} />
                        Obligatorio
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
                        <input type="checkbox" checked={fieldForm.enabled} onChange={e => setFieldForm({ ...fieldForm, enabled: e.target.checked })} />
                        Activo
                      </label>
                    </div>
                  </div>
                </div>
                <div className="modal-footer">
                  <button className="btn btn-outline" onClick={() => setFieldForm(null)}>Cancelar</button>
                  <button className="btn btn-primary" onClick={saveField}>Guardar</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ════════════ LOGO ════════════ */}
      {tab === 'logo' && (
        <div className="card" style={{ maxWidth: 500 }}>
          <div className="card-head"><h3>Logo del Condominio</h3></div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
            <div
              className="logo-box"
              style={{ width: 200, height: 200 }}
              onClick={() => isAdmin && logoRef.current?.click()}
              title={isAdmin ? 'Haz clic para subir un logo' : ''}
            >
              {tenant.logo ? (
                <img src={tenant.logo} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              ) : (
                <>
                  <Upload size={28} color="var(--ink-300)" />
                  <span>Haz clic para subir</span>
                  <span style={{ fontSize: 10, color: 'var(--ink-300)' }}>PNG, JPG · máx 2 MB</span>
                </>
              )}
            </div>
            <input ref={logoRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleLogoUpload} />
            {isAdmin && tenant.logo && (
              <button className="btn btn-danger btn-sm" onClick={() => { setTenant({ ...tenant, logo: null }); saveTenant({ ...tenant, logo: null }); }}>
                <Trash2 size={13} /> Eliminar logo
              </button>
            )}
            <p style={{ fontSize: 12, color: 'var(--ink-400)', textAlign: 'center', maxWidth: 300 }}>
              El logo aparecerá en el portal de vecinos y en los reportes.
            </p>
          </div>
        </div>
      )}

      {/* ════════════ ROLES ════════════ */}
      {tab === 'roles' && (
        <div>
          <div style={{ marginBottom: 24 }}>
            <div className="roles-grid">
              {Object.entries(ROLE_META).map(([key, meta]) => {
                const count = tenantUsers.filter(u => u.role === key).length;
                return (
                  <div className="role-card" key={key}>
                    <div className="role-card-bar" style={{ background: meta.color }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, marginTop: 6 }}>
                      <div style={{ width: 28, height: 28, borderRadius: 8, background: meta.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Users size={13} color={meta.color} />
                      </div>
                      <h4 style={{ color: meta.color }}>{meta.label}</h4>
                    </div>
                    <p style={{ color: 'var(--ink-400)', fontSize: 12, lineHeight: 1.5 }}>{meta.desc}</p>
                    <div className="role-card-count">{count} usuario{count !== 1 ? 's' : ''}</div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card">
            <div className="card-head"><h3>Usuarios del Condominio</h3><span className="badge badge-gray">{tenantUsers.length}</span></div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Email</th>
                    <th>Rol</th>
                    <th>Unidad</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {tenantUsers.map(u => {
                    const meta = ROLE_META[u.role] || { label: u.role, color: 'var(--ink-500)', bg: 'var(--sand-100)' };
                    return (
                      <tr key={u.id}>
                        <td style={{ fontWeight: 600, fontSize: 13 }}>{u.name || `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email}</td>
                        <td style={{ fontSize: 13, color: 'var(--ink-500)' }}>{u.email}</td>
                        <td>
                          <span className="badge" style={{ background: meta.bg, color: meta.color, fontSize: 11 }}>{meta.label}</span>
                        </td>
                        <td style={{ fontSize: 12, fontFamily: 'monospace' }}>{u.unit_id_code || '—'}</td>
                        <td>
                          {isAdmin && u.id !== user?.id && (
                            <button className="btn-icon" style={{ color: 'var(--coral-500)' }} onClick={async () => {
                              if (window.confirm(`¿Eliminar usuario ${u.email}?`)) {
                                await usersAPI.delete(tenantId, u.id);
                                loadUsers();
                                toast.success('Usuario eliminado');
                              }
                            }}><Trash2 size={12} /></button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {tenantUsers.length === 0 && (
                    <tr><td colSpan={5} style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--ink-300)', fontSize: 14 }}>Sin usuarios</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ════════════ ORGANIZACIÓN ════════════ */}
      {tab === 'org' && (
        <div style={{ display: 'grid', gap: 24 }}>
          {/* Committees */}
          <div className="card">
            <div className="card-head">
              <h3>Comités</h3>
              {isAdmin && (
                <button className="btn btn-primary btn-sm" onClick={() => setCmtForm({ name: '', type: 'comite' })}>
                  <Plus size={13} /> Nuevo Comité
                </button>
              )}
            </div>
            {committees.length === 0 ? (
              <div className="card-body" style={{ color: 'var(--ink-300)', fontSize: 13 }}>Sin comités registrados.</div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Nombre</th><th>Tipo</th><th>Acciones</th></tr></thead>
                  <tbody>
                    {committees.map(c => (
                      <tr key={c.id}>
                        <td style={{ fontWeight: 600, fontSize: 13 }}>{c.name}</td>
                        <td><span className="badge badge-teal" style={{ fontSize: 11 }}>{c.type}</span></td>
                        <td>
                          {isAdmin && (
                            <button className="btn-icon" style={{ color: 'var(--coral-500)' }} onClick={async () => {
                              if (window.confirm('¿Eliminar comité?')) {
                                await assemblyAPI.deleteCommittee(tenantId, c.id);
                                loadAssembly();
                              }
                            }}><Trash2 size={12} /></button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Positions */}
          <div className="card">
            <div className="card-head">
              <h3>Cargos de Asamblea</h3>
              {isAdmin && (
                <button className="btn btn-primary btn-sm" onClick={() => setPosForm({ name: '', member_name: '', start_date: '', end_date: '' })}>
                  <Plus size={13} /> Nuevo Cargo
                </button>
              )}
            </div>
            {positions.length === 0 ? (
              <div className="card-body" style={{ color: 'var(--ink-300)', fontSize: 13 }}>Sin cargos registrados.</div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Cargo</th><th>Titular</th><th>Inicio</th><th>Fin</th><th>Acciones</th></tr></thead>
                  <tbody>
                    {positions.map(p => (
                      <tr key={p.id}>
                        <td style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</td>
                        <td style={{ fontSize: 13 }}>{p.member_name || '—'}</td>
                        <td style={{ fontSize: 12 }}>{p.start_date || '—'}</td>
                        <td style={{ fontSize: 12 }}>{p.end_date || '—'}</td>
                        <td>
                          {isAdmin && (
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button className="btn-icon" onClick={() => setPosForm(p)}><Settings size={12} /></button>
                              <button className="btn-icon" style={{ color: 'var(--coral-500)' }} onClick={async () => {
                                if (window.confirm('¿Eliminar cargo?')) {
                                  await assemblyAPI.deletePosition(tenantId, p.id);
                                  loadAssembly();
                                }
                              }}><Trash2 size={12} /></button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Committee Modal */}
          {cmtForm && (
            <div className="modal-overlay" onClick={() => setCmtForm(null)}>
              <div className="modal-content" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                  <h3>Nuevo Comité</h3>
                  <button className="btn-icon" onClick={() => setCmtForm(null)}><X size={18} /></button>
                </div>
                <div className="modal-body">
                  <div className="form-grid">
                    <div className="field field-full">
                      <label className="field-label">Nombre del Comité</label>
                      <input className="field-input" value={cmtForm.name} onChange={e => setCmtForm({ ...cmtForm, name: e.target.value })} />
                    </div>
                    <div className="field field-full">
                      <label className="field-label">Tipo</label>
                      <select className="field-select" value={cmtForm.type} onChange={e => setCmtForm({ ...cmtForm, type: e.target.value })}>
                        <option value="comite">Comité</option>
                        <option value="subcomite">Subcomité</option>
                        <option value="brigada">Brigada</option>
                      </select>
                    </div>
                  </div>
                </div>
                <div className="modal-footer">
                  <button className="btn btn-outline" onClick={() => setCmtForm(null)}>Cancelar</button>
                  <button className="btn btn-primary" onClick={saveCommittee}>Crear</button>
                </div>
              </div>
            </div>
          )}

          {/* Position Modal */}
          {posForm && (
            <div className="modal-overlay" onClick={() => setPosForm(null)}>
              <div className="modal-content" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                  <h3>{posForm.id ? 'Editar' : 'Nuevo'} Cargo</h3>
                  <button className="btn-icon" onClick={() => setPosForm(null)}><X size={18} /></button>
                </div>
                <div className="modal-body">
                  <div className="form-grid">
                    <div className="field field-full">
                      <label className="field-label">Nombre del Cargo</label>
                      <input className="field-input" placeholder="ej. Presidente, Tesorero..." value={posForm.name} onChange={e => setPosForm({ ...posForm, name: e.target.value })} />
                    </div>
                    <div className="field field-full">
                      <label className="field-label">Titular</label>
                      <input className="field-input" placeholder="Nombre del residente..." value={posForm.member_name || ''} onChange={e => setPosForm({ ...posForm, member_name: e.target.value })} />
                    </div>
                    <div className="field">
                      <label className="field-label">Fecha de inicio</label>
                      <input type="date" className="field-input" value={posForm.start_date || ''} onChange={e => setPosForm({ ...posForm, start_date: e.target.value })} />
                    </div>
                    <div className="field">
                      <label className="field-label">Fecha de fin</label>
                      <input type="date" className="field-input" value={posForm.end_date || ''} onChange={e => setPosForm({ ...posForm, end_date: e.target.value })} />
                    </div>
                  </div>
                </div>
                <div className="modal-footer">
                  <button className="btn btn-outline" onClick={() => setPosForm(null)}>Cancelar</button>
                  <button className="btn btn-primary" onClick={savePosition}>Guardar</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
