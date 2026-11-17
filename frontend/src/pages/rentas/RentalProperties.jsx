import React, { Suspense, lazy, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTenantAccess } from '../../context/TenantAccessContext';
import { rentalAPI, tenantsAPI } from '../../api/client';
import { Layers, Plus, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  fmtMoney, PROPERTY_STATUS, PROPERTY_TYPES, PROPERTY_GROUPS, PROPERTY_USAGE,
  PROPERTY_SPEC_FIELDS, ROOM_TYPES, StatusPill, MULTI_TENANT_TYPES, TENANCY_MODELS,
} from './rentalUtils';
import AirbnbPanel from './AirbnbPanel';
import RentalSpaces from './RentalSpaces';
import AddressFields from './AddressFields';

const MapPicker = lazy(() => import('./MapPicker'));

const EMPTY = {
  code: '', name: '', property_type: 'departamento', status: 'disponible', usage: 'renta',
  country: 'México', country_code: 'MX',
  street: '', ext_number: '', int_number: '', neighborhood: '', municipality: '', city: '', state: '', postal_code: '',
  latitude: null, longitude: null,
  bedrooms: 0, bathrooms: 1, area_m2: 0, suggested_rent: 0,
  tenancy_model: 'single', park_name: '', building_number: '', submarket: '', gla_sqm: 0,
  specs: {}, owner_name: '', owner_email: '', owner_phone: '', notes: '',
};

export default function RentalProperties() {
  const { tenantId } = useAuth();
  const { can } = useTenantAccess();
  const canWrite = can('rentas_propiedades');
  const [items, setItems] = useState([]);
  const [currency, setCurrency] = useState('MXN');
  const [search, setSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);
  const [pickType, setPickType] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showAirbnb, setShowAirbnb] = useState(false);
  const [leasingOn, setLeasingOn] = useState(true);
  const [usageFilter, setUsageFilter] = useState('');
  const [tenancyFilter, setTenancyFilter] = useState('');
  const [spacesFor, setSpacesFor] = useState(null);

  const load = () => {
    if (!tenantId) return;
    setLoading(true);
    Promise.all([
      rentalAPI.properties.list(tenantId, {
        search, page_size: 500,
        ...(groupFilter ? { group: groupFilter } : {}),
        ...(typeFilter ? { property_type: typeFilter } : {}),
        ...(usageFilter ? { usage: usageFilter } : {}),
        ...(tenancyFilter ? { tenancy: tenancyFilter } : {}),
      }),
      tenantsAPI.get(tenantId).catch(() => ({ data: {} })),
    ])
      .then(([r, t]) => {
        setItems(r.data.results || r.data || []);
        setCurrency(t.data?.currency || 'MXN');
        setLeasingOn(t.data?.rental_settings?.leasing_enabled !== false);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [tenantId, groupFilter, typeFilter, usageFilter, tenancyFilter]);

  // Enlaces desde el mapa del dashboard: ?open=<id> abre la ficha y ?spaces=<id> los espacios
  const [urlParams, setUrlParams] = useSearchParams();
  useEffect(() => {
    const openId = urlParams.get('open');
    const spacesId = urlParams.get('spaces');
    if (!items.length || (!openId && !spacesId)) return;
    const hit = items.find(p => p.id === (spacesId || openId));
    if (!hit) return;
    if (spacesId) setSpacesFor(hit); else setForm({ ...EMPTY, ...hit, specs: hit.specs || {} });
    setUrlParams({}, { replace: true });
  }, [items]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sugiere el siguiente código libre (001, 002… o conserva el prefijo, p. ej. PL-007 → PL-008)
  const suggestCode = async () => {
    try {
      const { data } = await rentalAPI.properties.list(tenantId, { page_size: 500 });
      const codes = (data.results || data || []).map(p => String(p.code || ''));
      let best = null;
      codes.forEach(c => {
        const m = c.match(/^(.*?)(\d+)$/);
        if (m && (!best || Number(m[2]) > best.n)) best = { prefix: m[1], n: Number(m[2]), len: m[2].length };
      });
      const taken = new Set(codes.map(c => c.toLowerCase()));
      let n = best ? best.n + 1 : 1;
      const prefix = best ? best.prefix : '';
      const len = best ? best.len : 3;
      let code = `${prefix}${String(n).padStart(len, '0')}`;
      while (taken.has(code.toLowerCase())) { n += 1; code = `${prefix}${String(n).padStart(len, '0')}`; }
      setForm(f => (f && !f.id && !f.code ? { ...f, code } : f));
    } catch { /* el usuario puede capturarlo a mano */ }
  };

  const startNew = (type) => {
    setPickType(false);
    setForm({
      ...EMPTY, property_type: type, specs: {},
      usage: leasingOn ? 'renta' : 'operacion',
      status: leasingOn ? 'disponible' : 'operativa',
      tenancy_model: MULTI_TENANT_TYPES.includes(type) ? 'multi' : 'single',
    });
    suggestCode();
  };

  const handleSave = async () => {
    if (!form.code || !form.name) { toast.error('Código y nombre son obligatorios'); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        suggested_rent: Number(form.suggested_rent) || 0,
        bathrooms: Number(form.bathrooms) || 0,
        bedrooms: Number(form.bedrooms) || 0,
        area_m2: Number(form.area_m2) || 0,
        gla_sqm: Number(form.gla_sqm) || 0,
        specs: form.specs || {},
        latitude: form.latitude === null || form.latitude === '' || form.latitude === undefined ? null : Number(form.latitude),
        longitude: form.longitude === null || form.longitude === '' || form.longitude === undefined ? null : Number(form.longitude),
      };
      delete payload.type_label;
      delete payload.type_group;
      delete payload.specs_summary;
      delete payload.address_line;
      delete payload.active_contract_code;
      delete payload.usage_label;
      delete payload.is_leasable;
      delete payload.tenancy_label;
      delete payload.spaces_summary;
      let created = null;
      if (form.id) await rentalAPI.properties.update(tenantId, form.id, payload);
      else created = (await rentalAPI.properties.create(tenantId, payload)).data;
      toast.success(form.id ? 'Propiedad actualizada' : 'Propiedad registrada');
      setForm(null);
      load();
      // Multi Tenant recién creada: pasar directo a definir sus espacios
      if (created?.tenancy_model === 'multi') setSpacesFor(created);
    } catch (e) {
      const d = e.response?.data || {};
      toast.error(d.detail || d.latitude?.[0] || d.tenancy_model?.[0] || d.usage?.[0] || d.usage || d.code?.[0] || 'No se pudo guardar');
    } finally { setSaving(false); }
  };

  const setSpec = (key, value) => setForm(f => ({ ...f, specs: { ...(f.specs || {}), [key]: value } }));
  const specFields = PROPERTY_SPEC_FIELDS[form?.property_type] || PROPERTY_SPEC_FIELDS.otro;
  const usesRooms = ROOM_TYPES.includes(form?.property_type);
  const opOnly = form?.usage === 'operacion';
  const changeUsage = (usage) => setForm(f => {
    let status = f.status;
    if (usage === 'operacion' && ['disponible', 'ocupada', 'reservada'].includes(status)) status = 'operativa';
    if (usage === 'renta' && status === 'operativa') status = 'disponible';
    return { ...f, usage, status };
  });
  const statusOptions = Object.entries(PROPERTY_STATUS).filter(([k]) => (opOnly
    ? ['operativa', 'mantenimiento', 'inactiva'].includes(k)
    : k !== 'operativa'));

  if (spacesFor) {
    return (
      <RentalSpaces
        tenantId={tenantId}
        property={spacesFor}
        currency={currency}
        onBack={() => { setSpacesFor(null); load(); }}
        onChanged={load}
      />
    );
  }

  return (
    <div className="content-fade">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', color: 'var(--teal-600)', textTransform: 'uppercase' }}>Administrar Propiedades</div>
          <h2 style={{ margin: '4px 0 0', fontSize: 22 }}>Inventario</h2>
          <p style={{ color: 'var(--ink-400)', fontSize: 13, marginTop: 4 }}>
            {leasingOn
              ? 'Residencial, Airbnb, locales, bodegas, naves y todo lo que administres. Cada propiedad puede estar en renta o solo en operación, con las especificaciones de su tipo.'
              : 'Todas las propiedades que operas y mantienes, con las especificaciones de cada tipo. Tu espacio está configurado sin rentas.'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--ink-400)' }} />
            <input className="field-input" placeholder="Buscar…" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && load()} style={{ paddingLeft: 30, width: 200 }} />
          </div>
          <button className="btn btn-outline btn-sm" onClick={load}>Buscar</button>
          {canWrite && leasingOn && <button className="btn btn-outline" onClick={() => setShowAirbnb(true)}>Importar Airbnb</button>}
          {leasingOn && (
            <select className="field-select" value={usageFilter} onChange={e => setUsageFilter(e.target.value)} style={{ width: 150 }} aria-label="Uso">
              <option value="">Todo uso</option>
              <option value="renta">En renta</option>
              <option value="operacion">Solo operación</option>
            </select>
          )}
          <select className="field-select" value={tenancyFilter} onChange={e => setTenancyFilter(e.target.value)} style={{ width: 150 }} aria-label="Modelo de inquilinos">
            <option value="">Single y Multi</option>
            <option value="multi">Multi Tenant</option>
            <option value="single">Single Tenant</option>
          </select>
          {canWrite && <button className="btn btn-primary" onClick={() => setPickType(true)}><Plus size={15} /> Nueva propiedad</button>}
        </div>
      </div>

      <div className="tabs" style={{ marginBottom: 10 }}>
        <button className={`tab ${!groupFilter ? 'active' : ''}`} onClick={() => { setGroupFilter(''); setTypeFilter(''); }}>Todas</button>
        {PROPERTY_GROUPS.map(g => (
          <button key={g.id} className={`tab ${groupFilter === g.id ? 'active' : ''}`} onClick={() => { setGroupFilter(g.id); setTypeFilter(''); }}>{g.label}</button>
        ))}
      </div>
      {groupFilter && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {PROPERTY_GROUPS.find(g => g.id === groupFilter)?.types.map(t => (
            <button
              key={t}
              type="button"
              className={`btn btn-sm ${typeFilter === t ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setTypeFilter(typeFilter === t ? '' : t)}
            >{PROPERTY_TYPES[t]}</button>
          ))}
        </div>
      )}

      <div className="card">
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-400)' }}>Cargando inventario…</div>
        ) : items.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--ink-400)' }}>
            <div style={{ fontWeight: 600 }}>Aún no hay propiedades</div>
            <div style={{ fontSize: 13, marginTop: 6 }}>Elige un tipo (casa, Airbnb, local, nave…) o importa anuncios.</div>
            {canWrite && <button className="btn btn-outline" style={{ marginTop: 12 }} onClick={() => setPickType(true)}>Registrar propiedad</button>}
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Inmueble</th>
                  <th>Tipo</th>
                  <th>Especificaciones</th>
                  <th>Inquilinos / GLA</th>
                  <th>Estatus</th>
                  {leasingOn && <th>Renta sugerida</th>}
                  <th>Propietario</th>
                </tr>
              </thead>
              <tbody>
                {items.map(p => (
                  <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => setForm({ ...EMPTY, ...p, specs: p.specs || {} })}>
                    <td style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--teal-600)' }}>{p.code}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>
                        {p.name}
                        {(p.source === 'airbnb' || p.property_type === 'airbnb') && (
                          <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#E61E4D', background: '#FFF0F3', border: '1px solid #FFCDD8', borderRadius: 999, padding: '2px 8px' }}>Airbnb</span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>{p.address_line || 'Sin dirección'}</div>
                    </td>
                    <td style={{ fontSize: 12 }}>{p.type_label || PROPERTY_TYPES[p.property_type] || p.property_type}</td>
                    <td style={{ fontSize: 12, color: 'var(--ink-500)' }}>{p.specs_summary || '—'}</td>
                    <td onClick={e => e.stopPropagation()} style={{ fontSize: 12 }}>
                      {p.tenancy_model === 'multi' ? (
                        <button type="button" className="btn btn-outline btn-sm" onClick={() => setSpacesFor(p)} title="Administrar espacios">
                          <Layers size={13} /> Multi · {p.spaces_summary?.spaces_count || 0} esp. · {p.spaces_summary?.gla_occupancy_pct || 0}%
                        </button>
                      ) : <span style={{ color: 'var(--ink-400)' }}>Single Tenant</span>}
                    </td>
                    <td><StatusPill map={PROPERTY_STATUS} value={p.status} /></td>
                    {leasingOn && <td>{p.usage === 'operacion' ? <span style={{ color: 'var(--ink-400)', fontSize: 12 }}>Sin renta</span> : fmtMoney(p.suggested_rent, currency)}</td>}
                    <td style={{ fontSize: 13 }}>{p.owner_name || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {pickType && (
        <div className="ops-report-overlay" onClick={() => setPickType(false)}>
          <div className="ops-report-modal" style={{ maxWidth: 680 }} onClick={e => e.stopPropagation()}>
            <div className="ops-report-head">
              <div style={{ fontWeight: 800 }}>Tipo de propiedad</div>
              <button className="modal-close" onClick={() => setPickType(false)}>✕</button>
            </div>
            <div className="ops-report-body" style={{ display: 'grid', gap: 16 }}>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-500)' }}>
                Cada tipo tiene su propia ficha: recámaras en residencial, huéspedes en Airbnb, andenes en bodega o nave, frente en local, etc.
              </p>
              {PROPERTY_GROUPS.map(g => (
                <div key={g.id}>
                  <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-400)', marginBottom: 8 }}>{g.label}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {g.types.map(t => (
                      <button
                        key={t}
                        type="button"
                        className="btn btn-outline"
                        style={{ justifyContent: 'flex-start' }}
                        onClick={() => startNew(t)}
                      >{PROPERTY_TYPES[t]}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {form && (
        <div className="modal-bg open" onClick={() => setForm(null)}>
          <div className="modal lg" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3>{form.id ? (canWrite ? 'Editar propiedad' : 'Propiedad') : `Nueva · ${PROPERTY_TYPES[form.property_type] || 'Propiedad'}`}</h3>
              <button className="modal-close" onClick={() => setForm(null)}>✕</button>
            </div>
            <div className="modal-body">
<div className={canWrite ? undefined : 'rental-readonly'}>
              <div className="form-grid">
                <Field label="Código" value={form.code} onChange={v => setForm({ ...form, code: v })} />
                <Field label="Nombre" value={form.name} onChange={v => setForm({ ...form, name: v })} />
                <div className="field">
                  <label className="field-label">Tipo</label>
                  <select className="field-select" value={form.property_type} onChange={e => setForm({ ...form, property_type: e.target.value })}>
                    {PROPERTY_GROUPS.map(g => (
                      <optgroup key={g.id} label={g.label}>
                        {g.types.map(t => <option key={t} value={t}>{PROPERTY_TYPES[t]}</option>)}
                      </optgroup>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label className="field-label">Uso de la propiedad</label>
                  <select className="field-select" value={form.usage || 'renta'} onChange={e => changeUsage(e.target.value)} disabled={!leasingOn}>
                    {Object.entries(PROPERTY_USAGE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                  <div style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 4 }}>
                    {leasingOn ? PROPERTY_USAGE[form.usage || 'renta']?.hint : 'Tu espacio opera sin rentas (Configuración → Modo de operación).'}
                  </div>
                </div>
                <div className="field">
                  <label className="field-label">Estatus</label>
                  <select className="field-select" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                    {statusOptions.map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <AddressFields form={form} onChange={patch => setForm(f => ({ ...f, ...patch }))} />
                <Suspense fallback={<div style={{ gridColumn: '1 / -1', fontSize: 12, color: 'var(--ink-400)' }}>Cargando mapa…</div>}>
                  <MapPicker form={form} onChange={patch => setForm(f => ({ ...f, ...patch }))} />
                </Suspense>
                <Field label="m² (terreno / construcción)" type="number" value={form.area_m2} onChange={v => setForm({ ...form, area_m2: v })} />
                {!opOnly && form.tenancy_model !== 'multi' && <Field label="Renta sugerida" type="number" value={form.suggested_rent} onChange={v => setForm({ ...form, suggested_rent: v })} />}
                {usesRooms && (
                  <>
                    <Field label="Recámaras" type="number" value={form.bedrooms} onChange={v => setForm({ ...form, bedrooms: v })} />
                    <Field label="Baños" type="number" value={form.bathrooms} onChange={v => setForm({ ...form, bathrooms: v })} />
                  </>
                )}
              </div>

              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-400)', margin: '18px 0 10px' }}>
                Inquilinos y ubicación
              </div>
              <div className="form-grid">
                <div className="field">
                  <label className="field-label">Modelo de inquilinos</label>
                  <select className="field-select" value={form.tenancy_model || 'single'} onChange={e => setForm({ ...form, tenancy_model: e.target.value })}>
                    {Object.entries(TENANCY_MODELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                  <div style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 4 }}>{TENANCY_MODELS[form.tenancy_model || 'single'].hint}</div>
                </div>
                <Field label="Park" value={form.park_name} onChange={v => setForm({ ...form, park_name: v })} />
                <Field label="# Building" value={form.building_number} onChange={v => setForm({ ...form, building_number: v })} />
                <Field label="Submercado / zona" value={form.submarket} onChange={v => setForm({ ...form, submarket: v })} />
                {form.tenancy_model === 'multi' && (
                  <Field label="Total GLA SQM (m² rentables)" type="number" value={form.gla_sqm} onChange={v => setForm({ ...form, gla_sqm: v })} />
                )}
              </div>
              {form.tenancy_model === 'multi' && (
                <div style={{ marginTop: 10, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 12, color: 'var(--ink-500)' }}>
                  {form.id ? (
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => { setSpacesFor(form); setForm(null); }}>
                      <Layers size={13} /> Administrar espacios ({form.spaces_summary?.spaces_count || 0})
                    </button>
                  ) : <span>Al guardar podrás crear los espacios (locales, bays, oficinas, habitaciones…) de esta propiedad.</span>}
                  {form.spaces_summary && <span>GLA en espacios: <strong>{Number(form.spaces_summary.spaces_gla || 0).toLocaleString('es-MX')} m²</strong> · ocupación {form.spaces_summary.gla_occupancy_pct || 0}%</span>}
                </div>
              )}

              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-400)', margin: '18px 0 10px' }}>
                Especificaciones de {PROPERTY_TYPES[form.property_type] || 'este tipo'}
              </div>
              <div className="form-grid">
                {specFields.map(f => (
                  <SpecField key={f.key} field={f} value={(form.specs || {})[f.key]} onChange={v => setSpec(f.key, v)} />
                ))}
              </div>

              <div className="form-grid" style={{ marginTop: 16 }}>
                <Field label="Propietario" value={form.owner_name} onChange={v => setForm({ ...form, owner_name: v })} />
                <Field label="Tel. propietario" value={form.owner_phone} onChange={v => setForm({ ...form, owner_phone: v })} />
                <Field label="Correo propietario" value={form.owner_email} onChange={v => setForm({ ...form, owner_email: v })} />
                <div className="field field-full">
                  <label className="field-label">Notas</label>
                  <textarea className="field-input" rows={2} value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} />
                </div>
              </div>
            </div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setForm(null)}>Cancelar</button>
              {canWrite && <button className="btn btn-primary" disabled={saving} onClick={handleSave}>{saving ? 'Guardando…' : 'Guardar'}</button>}
            </div>
          </div>
        </div>
      )}

      {showAirbnb && (
        <div className="modal-bg open" onClick={() => setShowAirbnb(false)}>
          <div className="modal lg" onClick={e => e.stopPropagation()} style={{ maxWidth: 820 }}>
            <div className="modal-head">
              <h3>Integrar propiedades de Airbnb</h3>
              <button className="modal-close" onClick={() => setShowAirbnb(false)}>✕</button>
            </div>
            <div className="modal-body">
              <AirbnbPanel tenantId={tenantId} compact onImported={() => { load(); }} />
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setShowAirbnb(false)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, type = 'text' }) {
  return (
    <div className="field">
      <label className="field-label">{label}</label>
      <input className="field-input" type={type} value={value ?? ''} onChange={e => onChange(e.target.value)} />
    </div>
  );
}

function SpecField({ field, value, onChange }) {
  if (field.type === 'bool') {
    return (
      <label className="field" style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 22 }}>
        <input type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked)} />
        <span className="field-label" style={{ margin: 0 }}>{field.label}</span>
      </label>
    );
  }
  return (
    <Field
      label={field.label}
      type={field.type === 'number' ? 'number' : 'text'}
      value={value ?? ''}
      onChange={v => onChange(field.type === 'number' ? (v === '' ? '' : Number(v)) : v)}
    />
  );
}
