import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { tenantsAPI, extraFieldsAPI, assemblyAPI, usersAPI } from '../api/client';
import { CURRENCIES, getStatesForCountry, COUNTRIES } from '../utils/helpers';
import { Settings, Plus, Trash2, Check, X, Upload, Users, Sliders, Building2, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';

function fmt(n) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n ?? 0);
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

export default function Config() {
  const { tenantId, isAdmin, user } = useAuth();
  const [tab, setTab] = useState('general');
  const [tenant, setTenant] = useState(null);
  const [tenantEdit, setTenantEdit] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [fields, setFields] = useState([]);
  const [fieldForm, setFieldForm] = useState(null);
  const [tenantUsers, setTenantUsers] = useState([]);
  const [positions, setPositions] = useState([]);
  const [committees, setCommittees] = useState([]);
  const [posForm, setPosForm] = useState(null);
  const [cmtForm, setCmtForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const logoRef = useRef();

  const isSuperAdmin = user?.role === 'super_admin' || user?.role === 'superadmin';

  const loadTenant = useCallback(() => {
    if (!tenantId) return Promise.resolve();
    setLoading(true);
    return tenantsAPI.get(tenantId)
      .then(r => {
        setTenant(r.data);
        setTenantEdit(r.data);
        setLoadError(null);
      })
      .catch(e => {
        setLoadError(e.response?.data?.detail || 'No se pudo cargar la configuración');
      })
      .finally(() => setLoading(false));
  }, [tenantId]);

  const loadFields = useCallback(() => {
    if (!tenantId) return;
    extraFieldsAPI.list(tenantId)
      .then(r => setFields(r.data.results || r.data))
      .catch(() => {});
  }, [tenantId]);

  const loadUsers = useCallback(() => {
    if (!tenantId) return;
    usersAPI.list(tenantId)
      .then(r => setTenantUsers(r.data.results || r.data))
      .catch(() => {});
  }, [tenantId]);

  const loadAssembly = useCallback(() => {
    if (!tenantId) return;
    assemblyAPI.positions(tenantId).then(r => setPositions(r.data.results || r.data)).catch(() => {});
    assemblyAPI.committees(tenantId).then(r => setCommittees(r.data.results || r.data)).catch(() => {});
  }, [tenantId]);

  useEffect(() => {
    // Reset state when tenantId changes
    setTenant(null);
    setLoadError(null);
    loadTenant();
    loadFields();
    loadUsers();
    loadAssembly();
  }, [loadTenant, loadFields, loadUsers, loadAssembly]);

  const saveTenant = async (data) => {
    setSaving(true);
    try {
      await tenantsAPI.update(tenantId, data);
      toast.success('Configuración guardada');
      loadTenant();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const saveField = async () => {
    try {
      if (fieldForm.id) await extraFieldsAPI.update(tenantId, fieldForm.id, fieldForm);
      else await extraFieldsAPI.create(tenantId, { ...fieldForm, tenant: tenantId });
      toast.success('Campo guardado');
      setFieldForm(null);
      loadFields();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error al guardar campo');
    }
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

  const toggleField = async (id, patch) => {
    if (!isAdmin) return;
    const f = fields.find(x => x.id === id);
    if (!f) return;
    try {
      await extraFieldsAPI.update(tenantId, id, { ...f, ...patch });
      loadFields();
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
      setTenantEdit(updated);
      saveTenant({ logo: ev.target.result });
    };
    reader.readAsDataURL(file);
  };

  // ── No tenant selected (superadmin without active tenant) ──
  if (!tenantId) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '40vh', gap: 12 }}>
        <Building2 size={40} color="var(--ink-200)" />
        <p style={{ fontWeight: 700, color: 'var(--ink-700)', fontSize: 16 }}>Sin condominio seleccionado</p>
        <p style={{ color: 'var(--ink-400)', fontSize: 13 }}>
          Selecciona un condominio desde el panel lateral para ver su configuración.
        </p>
      </div>
    );
  }

  // ── Loading — show spinner while fetching OR before first load ──
  if (!tenant && !loadError) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '40vh', gap: 16 }}>
        <div style={{ width: 36, height: 36, borderRadius: '50%', border: '3px solid var(--sand-100)', borderTopColor: 'var(--teal-400)', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <p style={{ color: 'var(--ink-400)', fontSize: 14 }}>Cargando configuración…</p>
      </div>
    );
  }

  // ── Error ──
  if (loadError && !tenant) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '40vh', gap: 14 }}>
        <p style={{ fontWeight: 700, color: 'var(--ink-800)' }}>No se pudo cargar</p>
        <p style={{ color: 'var(--ink-400)', fontSize: 13 }}>{loadError}</p>
        <button className="btn btn-outline btn-sm" onClick={loadTenant}>
          <RefreshCw size={13} /> Reintentar
        </button>
      </div>
    );
  }

  const te = tenantEdit || {};
  const reqCobFields = fields.filter(f => f.enabled && f.required && (!f.field_type || f.field_type === 'normal'));
  const totalMonthly = parseFloat(te.maintenance_fee || 0) + reqCobFields.reduce((s, f) => s + parseFloat(f.default_amount || 0), 0);

  const tabs = [
    { key: 'general', label: 'General' },
    { key: 'fiscal',  label: 'Datos Fiscales' },
    { key: 'address', label: 'Dirección' },
    { key: 'logo',    label: 'Logo' },
    { key: 'fields',  label: 'Config. Pagos' },
    { key: 'users',   label: 'Usuarios' },
    { key: 'roles',   label: 'Roles y Perfiles' },
    { key: 'org',     label: 'Organización' },
  ];

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1100, margin: '0 auto' }} className="content-fade">
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 500, marginBottom: 4 }}>
          Configuración<span className="brand-dot">.</span>
        </h1>
        <p style={{ color: 'var(--ink-400)', fontSize: 14 }}>{tenant?.name}</p>
      </div>

      {/* Tabs */}
      <div className="tabs">
        {tabs.map(t => (
          <button key={t.key} className={`tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ════ GENERAL ════ */}
      {tab === 'general' && (
        <div className="card" style={{ maxWidth: 760 }}>
          <div className="card-head">
            <h3>Configuración General</h3>
            {isAdmin && (
              <button className="btn btn-primary btn-sm" onClick={() => saveTenant(te)} disabled={saving}>
                {saving ? 'Guardando…' : 'Guardar Cambios'}
              </button>
            )}
          </div>
          <div className="card-body">
            <div className="form-grid">
              <div className="field field-full">
                <label className="field-label">Nombre del Condominio</label>
                {isAdmin
                  ? <input className="field-input" value={te.name || ''} onChange={e => setTenantEdit({ ...te, name: e.target.value })} />
                  : <div className="field-value">{tenant?.name}</div>
                }
              </div>
              <div className="field">
                <label className="field-label">Cuota de Mantenimiento</label>
                {isAdmin
                  ? <input type="number" className="field-input" value={te.maintenance_fee || ''} onChange={e => setTenantEdit({ ...te, maintenance_fee: e.target.value })} />
                  : <div className="field-value">{fmt(tenant.maintenance_fee)}</div>
                }
              </div>
              <div className="field">
                <label className="field-label">Moneda</label>
                {isAdmin
                  ? <select className="field-select" value={te.currency || 'MXN'} onChange={e => setTenantEdit({ ...te, currency: e.target.value })}>
                      {Object.entries(CURRENCIES).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
                    </select>
                  : <div className="field-value">{CURRENCIES[tenant.currency]?.name || tenant.currency}</div>
                }
              </div>
              <div className="field">
                <label className="field-label">País</label>
                {isAdmin
                  ? <select className="field-select" value={te.country || ''} onChange={e => setTenantEdit({ ...te, country: e.target.value })}>
                      <option value="">Seleccionar...</option>
                      {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  : <div className="field-value">{tenant.country || '—'}</div>
                }
              </div>
              <div className="field">
                <label className="field-label">Estado / Provincia</label>
                {isAdmin
                  ? <select className="field-select" value={te.state || ''} onChange={e => setTenantEdit({ ...te, state: e.target.value })}>
                      <option value="">Seleccionar...</option>
                      {getStatesForCountry(te.country).map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  : <div className="field-value">{tenant.state || '—'}</div>
                }
              </div>
              <div className="field">
                <label className="field-label">Tipo de Administración</label>
                {isAdmin
                  ? <select className="field-select" value={te.admin_type || 'mesa_directiva'} onChange={e => setTenantEdit({ ...te, admin_type: e.target.value })}>
                      <option value="mesa_directiva">Mesa Directiva Interna</option>
                      <option value="administrador">Administrador Externo</option>
                      <option value="comite">Comité</option>
                    </select>
                  : <div className="field-value">{tenant.admin_type}</div>
                }
              </div>
              <div className="field">
                <label className="field-label">Inicio de Operaciones</label>
                {isAdmin
                  ? <input type="month" className="field-input" value={te.operation_start_date || ''} onChange={e => setTenantEdit({ ...te, operation_start_date: e.target.value })} />
                  : <div className="field-value">{tenant.operation_start_date || '—'}</div>
                }
              </div>
              <div className="field">
                <label className="field-label">Saldo Inicial de Banco</label>
                {isAdmin
                  ? <input type="number" className="field-input" value={te.bank_initial_balance || ''} onChange={e => setTenantEdit({ ...te, bank_initial_balance: e.target.value })} />
                  : <div className="field-value">{fmt(tenant.bank_initial_balance)}</div>
                }
              </div>
              <div className="field field-full">
                <label className="field-label">Áreas Comunes (separadas por coma)</label>
                {isAdmin
                  ? <input className="field-input"
                      placeholder="Alberca, Gimnasio, Salón de eventos..."
                      value={Array.isArray(te.common_areas) ? te.common_areas.join(', ') : (te.common_areas || '')}
                      onChange={e => setTenantEdit({ ...te, common_areas: e.target.value })} />
                  : <div className="field-value">{Array.isArray(tenant.common_areas) ? tenant.common_areas.join(', ') : (tenant.common_areas || '—')}</div>
                }
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════ FISCAL ════ */}
      {tab === 'fiscal' && (
        <div className="card" style={{ maxWidth: 760 }}>
          <div className="card-head">
            <h3>Datos Fiscales</h3>
            {isAdmin && (
              <button className="btn btn-primary btn-sm" onClick={() => saveTenant(te)} disabled={saving}>
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            )}
          </div>
          <div className="card-body">
            <div className="form-grid">
              <div className="field field-full">
                <label className="field-label">Razón Social</label>
                {isAdmin
                  ? <input className="field-input" value={te.razon_social || ''} onChange={e => setTenantEdit({ ...te, razon_social: e.target.value })} />
                  : <div className={`field-value ${!tenant.razon_social ? 'empty' : ''}`}>{tenant.razon_social || 'Sin datos'}</div>
                }
              </div>
              <div className="field">
                <label className="field-label">RFC</label>
                {isAdmin
                  ? <input className="field-input" style={{ fontFamily: 'monospace' }} value={te.rfc || ''} onChange={e => setTenantEdit({ ...te, rfc: e.target.value })} />
                  : <div className={`field-value ${!tenant.rfc ? 'empty' : ''}`} style={{ fontFamily: 'monospace' }}>{tenant.rfc || 'Sin datos'}</div>
                }
              </div>
              {[
                ['info_calle', 'Calle'],
                ['info_num_externo', 'No. Exterior'],
                ['info_colonia', 'Colonia'],
                ['info_delegacion', 'Delegación / Municipio'],
                ['info_ciudad', 'Ciudad'],
                ['info_codigo_postal', 'Código Postal'],
              ].map(([k, label]) => (
                <div className="field" key={k}>
                  <label className="field-label">{label}</label>
                  {isAdmin
                    ? <input className="field-input" value={te[k] || ''} onChange={e => setTenantEdit({ ...te, [k]: e.target.value })} />
                    : <div className={`field-value ${!tenant[k] ? 'empty' : ''}`}>{tenant[k] || 'Sin datos'}</div>
                  }
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ════ ADDRESS ════ */}
      {tab === 'address' && (
        <div className="card" style={{ maxWidth: 760 }}>
          <div className="card-head">
            <h3>Dirección Física</h3>
            <span className="badge badge-teal">{tenant.country || 'Sin país'}</span>
            {isAdmin && (
              <button className="btn btn-primary btn-sm" onClick={() => saveTenant(te)} disabled={saving}>
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            )}
          </div>
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
                  {isAdmin
                    ? <input className="field-input" value={te[k] || ''} onChange={e => setTenantEdit({ ...te, [k]: e.target.value })} />
                    : <div className={`field-value ${!tenant[k] ? 'empty' : ''}`}>{tenant[k] || 'Sin datos'}</div>
                  }
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ════ LOGO ════ */}
      {tab === 'logo' && (
        <div className="card" style={{ maxWidth: 560 }}>
          <div className="card-head"><h3>Logo del Condominio</h3></div>
          <div className="card-body" style={{ display: 'flex', alignItems: 'flex-start', gap: 32, flexWrap: 'wrap' }}>
            {isAdmin ? (
              <label className="logo-box" style={{ width: 180, height: 180, cursor: 'pointer', position: 'relative' }}>
                {tenant.logo
                  ? <img src={tenant.logo} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  : <><Upload size={28} color="var(--ink-300)" /><span>Haz clic para subir</span></>
                }
                <input
                  ref={logoRef}
                  type="file"
                  accept="image/*"
                  style={{ position: 'absolute', width: '100%', height: '100%', opacity: 0, cursor: 'pointer', top: 0, left: 0 }}
                  onChange={handleLogoUpload}
                />
              </label>
            ) : (
              <div className="logo-box" style={{ width: 180, height: 180, cursor: 'default' }}>
                {tenant.logo
                  ? <img src={tenant.logo} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
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
              {isAdmin && tenant.logo && (
                <button className="btn btn-danger btn-sm" style={{ marginTop: 14 }} onClick={() => {
                  const updated = { ...tenant, logo: '' };
                  setTenant(updated);
                  setTenantEdit(updated);
                  saveTenant({ logo: '' });
                }}>
                  <Trash2 size={13} /> Eliminar logo
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ════ FIELDS (Config. Pagos) ════ */}
      {tab === 'fields' && (
        <div>
          {/* Monthly summary card */}
          <div style={{ background: 'var(--teal-50)', border: '1px solid var(--teal-100)', borderRadius: 'var(--radius-lg)', padding: '18px 24px', marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--teal-700)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                  Cargo mensual mínimo por unidad
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 500, color: 'var(--teal-800)' }}>{fmt(totalMonthly)}</span>
                  <span style={{ fontSize: 12, color: 'var(--teal-600)' }}>Mant. + {reqCobFields.length} oblig.</span>
                </div>
              </div>
              <div style={{ fontSize: 13, color: 'var(--teal-700)', lineHeight: 1.8 }}>
                <div>Mantenimiento: {fmt(tenant.maintenance_fee)}</div>
                {reqCobFields.map(f => (
                  <div key={f.id}>+ {f.label}: {fmt(f.default_amount)}</div>
                ))}
              </div>
            </div>
          </div>

          {isAdmin && (
            <div style={{ marginBottom: 16 }}>
              <button className="btn btn-primary btn-sm" onClick={() => setFieldForm({ label: '', default_amount: 0, required: false, enabled: true, field_type: 'normal' })}>
                <Plus size={14} /> Nuevo Campo
              </button>
            </div>
          )}

          {/* Field rows */}
          <div className="card">
            <div className="card-head">
              <h3>Campos de Cobranza y Gastos</h3>
              <span style={{ fontSize: 13, color: 'var(--ink-400)' }}>{fields.length} campos</span>
            </div>
            {fields.length === 0
              ? <div className="card-body" style={{ color: 'var(--ink-300)', fontSize: 13 }}>Sin campos configurados</div>
              : fields.map(f => {
                  const isCob = !f.field_type || f.field_type === 'normal';
                  const typeColor = isCob ? 'var(--teal-500)' : 'var(--amber-500)';
                  return (
                    <div key={f.id} style={{ display: 'flex', gap: 0, padding: '16px 20px', borderBottom: '1px solid var(--sand-100)', alignItems: 'flex-start' }}>
                      {/* Accent bar */}
                      <div style={{ width: 3, borderRadius: 3, minHeight: 40, background: f.enabled ? typeColor : 'var(--sand-200)', flexShrink: 0, marginRight: 16, marginTop: 2 }} />
                      {/* Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink-800)' }}>{f.label}</span>
                          <span className={`badge ${isCob ? 'badge-cobranza' : 'badge-gastos-type'}`}>{isCob ? 'Cobranza' : 'Gastos'}</span>
                          {f.enabled && isCob && <span className={`badge ${f.required ? 'badge-required' : 'badge-optional'}`}>{f.required ? 'Obligatorio' : 'Opcional'}</span>}
                          {!f.enabled && <span className="badge badge-gray">Inactivo</span>}
                          {f.is_system_default && <span className="badge badge-gray" style={{ fontSize: 10 }}>sistema</span>}
                        </div>
                        {isCob && f.required && f.enabled && parseFloat(f.default_amount) > 0 && (
                          <div style={{ fontSize: 12, color: 'var(--ink-500)' }}>
                            Cargo mensual fijo: <strong style={{ color: 'var(--teal-700)' }}>{fmt(f.default_amount)}</strong>
                          </div>
                        )}
                        {!f.enabled && <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>Activa este campo para usarlo en cobranza</div>}
                        {f.enabled && isCob && !f.required && <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>Campo opcional — monto variable por período</div>}
                        {!isCob && f.enabled && <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>Campo de gastos operativos del condominio</div>}

                        {/* Amount input for required cobranza fields */}
                        {isAdmin && f.enabled && isCob && f.required && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, padding: '10px 12px', background: 'var(--teal-50)', border: '1px solid var(--teal-100)', borderRadius: 'var(--radius-sm)' }}>
                            <span style={{ fontSize: 12, color: 'var(--teal-700)', fontWeight: 600 }}>Monto mensual:</span>
                            <input
                              style={{ width: 110, padding: '5px 8px', border: '1.5px solid var(--teal-200)', borderRadius: 6, fontSize: 13, fontWeight: 700, color: 'var(--teal-700)', background: 'white', outline: 'none', textAlign: 'right', fontFamily: 'var(--font-body)' }}
                              type="number" min="0"
                              defaultValue={f.default_amount || 0}
                              onBlur={e => toggleField(f.id, { default_amount: e.target.value })}
                            />
                          </div>
                        )}
                      </div>
                      {/* Controls */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingLeft: 16, flexShrink: 0 }}>
                        {isAdmin && isCob && f.enabled && (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', color: f.required ? 'var(--coral-500)' : 'var(--ink-400)' }}>OBLIG.</div>
                            <div
                              className={`switch ${f.required ? 'on' : ''}`}
                              style={{ background: f.required ? 'var(--coral-400)' : undefined, cursor: 'pointer' }}
                              onClick={() => toggleField(f.id, { required: !f.required })}
                            >
                              <div className="switch-knob" />
                            </div>
                          </div>
                        )}
                        {isAdmin && (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', color: f.enabled ? 'var(--teal-600)' : 'var(--ink-400)' }}>ACTIVO</div>
                            <div
                              className={`switch ${f.enabled ? 'on' : ''}`}
                              style={{ cursor: 'pointer' }}
                              onClick={() => toggleField(f.id, { enabled: !f.enabled })}
                            >
                              <div className="switch-knob" />
                            </div>
                          </div>
                        )}
                        {isAdmin && (
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button className="btn-icon" onClick={() => setFieldForm(f)}><Settings size={13} /></button>
                            {!f.is_system_default && (
                              <button className="btn-icon" style={{ color: 'var(--coral-400)' }} onClick={async () => {
                                if (window.confirm('¿Eliminar campo?')) { await extraFieldsAPI.delete(tenantId, f.id); loadFields(); }
                              }}><Trash2 size={13} /></button>
                            )}
                          </div>
                        )}
                        {!isAdmin && (
                          <span className="badge" style={{ background: f.enabled ? 'var(--teal-50)' : 'var(--sand-100)', color: f.enabled ? 'var(--teal-700)' : 'var(--ink-400)', fontSize: 11 }}>
                            {f.enabled ? 'Activo' : 'Inactivo'}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
            }
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
                      <select className="field-select" value={fieldForm.field_type || 'normal'} onChange={e => setFieldForm({ ...fieldForm, field_type: e.target.value })}>
                        <option value="normal">Cobranza</option>
                        <option value="gastos">Gastos</option>
                      </select>
                    </div>
                    <div className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 20, paddingTop: 12 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
                        <input type="checkbox" checked={!!fieldForm.required} onChange={e => setFieldForm({ ...fieldForm, required: e.target.checked })} /> Obligatorio
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
                        <input type="checkbox" checked={!!fieldForm.enabled} onChange={e => setFieldForm({ ...fieldForm, enabled: e.target.checked })} /> Activo
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

      {/* ════ USERS ════ */}
      {tab === 'users' && (
        <div className="card">
          <div className="card-head">
            <h3>Usuarios del Condominio</h3>
            <span className="badge badge-gray">{tenantUsers.length}</span>
          </div>
          {tenantUsers.length === 0
            ? <div className="card-body" style={{ color: 'var(--ink-300)', fontSize: 13 }}>
                {isAdmin ? 'Sin usuarios registrados.' : 'No tienes permisos para ver esta lista.'}
              </div>
            : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Nombre</th>
                      <th>Email</th>
                      <th>Rol</th>
                      <th>Unidad</th>
                      <th>Contraseña</th>
                      {isAdmin && <th>Acciones</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {tenantUsers.map(u => {
                      // TenantUserSerializer returns: user_name, user_email, role, unit_code
                      const name = u.user_name || u.name || u.user_email || '—';
                      const email = u.user_email || u.email || '—';
                      const role = u.role;
                      const unitCode = u.unit_code || u.unit_id_code;
                      const meta = ROLE_META[role] || { label: role, color: 'var(--ink-500)', bg: 'var(--sand-100)' };
                      return (
                        <tr key={u.id}>
                          <td style={{ fontWeight: 600, fontSize: 13 }}>{name}</td>
                          <td style={{ fontSize: 13, color: 'var(--ink-500)' }}>{email}</td>
                          <td>
                            <span className="badge" style={{ background: meta.bg, color: meta.color, fontSize: 11 }}>
                              {meta.label}
                            </span>
                          </td>
                          <td style={{ fontSize: 12, fontFamily: 'monospace' }}>{unitCode || '—'}</td>
                          <td>
                            {u.must_change_password
                              ? <span className="badge badge-amber">Cambio pendiente</span>
                              : <span className="badge badge-teal">Activa</span>
                            }
                          </td>
                          {isAdmin && (
                            <td>
                              {u.user !== user?.id && (
                                <button className="btn-icon" style={{ color: 'var(--coral-500)' }} onClick={async () => {
                                  if (window.confirm(`¿Eliminar usuario ${email}?`)) {
                                    await usersAPI.delete(tenantId, u.id);
                                    loadUsers();
                                    toast.success('Usuario eliminado');
                                  }
                                }}><Trash2 size={13} /></button>
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
      )}

      {/* ════ ROLES ════ */}
      {tab === 'roles' && (
        <div>
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-head"><h3>Roles del Sistema</h3></div>
            <div className="card-body">
              <div className="roles-grid">
                {Object.entries(ROLE_META).filter(([k]) => !['superadmin'].includes(k)).map(([key, meta]) => {
                  const count = tenantUsers.filter(u => u.role === key).length;
                  return (
                    <div className="role-card" key={key}>
                      <div className="role-card-bar" style={{ background: meta.color }} />
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, marginTop: 6 }}>
                        <div style={{ width: 28, height: 28, borderRadius: 8, background: meta.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Users size={13} color={meta.color} />
                        </div>
                        <h4 style={{ color: meta.color, fontSize: 13 }}>{meta.label}</h4>
                      </div>
                      <p style={{ color: 'var(--ink-400)', fontSize: 12, lineHeight: 1.5 }}>{meta.desc}</p>
                      <div className="role-card-count">{count} usuario{count !== 1 ? 's' : ''}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════ ORG ════ */}
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
            {committees.length === 0
              ? <div className="card-body" style={{ color: 'var(--ink-300)', fontSize: 13 }}>Sin comités registrados.</div>
              : (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Nombre</th><th>Tipo</th>{isAdmin && <th>Acciones</th>}</tr></thead>
                    <tbody>
                      {committees.map(c => (
                        <tr key={c.id}>
                          <td style={{ fontWeight: 600, fontSize: 13 }}>{c.name}</td>
                          <td><span className="badge badge-teal" style={{ fontSize: 11 }}>{c.type}</span></td>
                          {isAdmin && (
                            <td>
                              <button className="btn-icon" style={{ color: 'var(--coral-500)' }} onClick={async () => {
                                if (window.confirm('¿Eliminar comité?')) { await assemblyAPI.deleteCommittee(tenantId, c.id); loadAssembly(); }
                              }}><Trash2 size={12} /></button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            }
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
            {positions.length === 0
              ? <div className="card-body" style={{ color: 'var(--ink-300)', fontSize: 13 }}>Sin cargos registrados.</div>
              : (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Cargo</th><th>Titular</th><th>Inicio</th><th>Fin</th>{isAdmin && <th>Acciones</th>}</tr></thead>
                    <tbody>
                      {positions.map(p => (
                        <tr key={p.id}>
                          <td style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</td>
                          <td style={{ fontSize: 13 }}>{p.member_name || '—'}</td>
                          <td style={{ fontSize: 12 }}>{p.start_date || '—'}</td>
                          <td style={{ fontSize: 12 }}>{p.end_date || '—'}</td>
                          {isAdmin && (
                            <td>
                              <div style={{ display: 'flex', gap: 4 }}>
                                <button className="btn-icon" onClick={() => setPosForm(p)}><Settings size={12} /></button>
                                <button className="btn-icon" style={{ color: 'var(--coral-500)' }} onClick={async () => {
                                  if (window.confirm('¿Eliminar cargo?')) { await assemblyAPI.deletePosition(tenantId, p.id); loadAssembly(); }
                                }}><Trash2 size={12} /></button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            }
          </div>

          {/* Committee Modal */}
          {cmtForm && (
            <div className="modal-overlay" onClick={() => setCmtForm(null)}>
              <div className="modal-content" onClick={e => e.stopPropagation()}>
                <div className="modal-header"><h3>Nuevo Comité</h3><button className="btn-icon" onClick={() => setCmtForm(null)}><X size={18} /></button></div>
                <div className="modal-body">
                  <div className="form-grid">
                    <div className="field field-full">
                      <label className="field-label">Nombre</label>
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
                <div className="modal-header"><h3>{posForm.id ? 'Editar' : 'Nuevo'} Cargo</h3><button className="btn-icon" onClick={() => setPosForm(null)}><X size={18} /></button></div>
                <div className="modal-body">
                  <div className="form-grid">
                    <div className="field field-full">
                      <label className="field-label">Nombre del Cargo</label>
                      <input className="field-input" placeholder="Presidente, Tesorero..." value={posForm.name} onChange={e => setPosForm({ ...posForm, name: e.target.value })} />
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
