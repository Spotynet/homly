import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Layers, Plus, Search, Trash2, UserPlus, FilePlus2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { rentalAPI } from '../../api/client';
import { useTenantAccess } from '../../context/TenantAccessContext';
import {
  fmtDate, fmtMoney, PROPERTY_TYPES, SPACE_SPEC_FIELDS, SPACE_STATUS, SPACE_TYPES,
  spaceTypesFor, StatusPill,
} from './rentalUtils';

const EMPTY_SPACE = {
  code: '', name: '', space_type: 'local', status: 'disponible', unit_number: '', external_ref: '',
  building: '', floor: '', zone: '', area_m2: 0, is_leasable: true, is_temporary: false,
  available_from: '', available_to: '', suggested_rent: 0, specs: {}, contacts: [], notes: '',
  is_active: true, parent: '',
};
const EMPTY_BULK = {
  prefix: '', start: 1, count: 10, pad: 2, space_type: 'local', building: '', floor: '', zone: '',
  area_m2: 0, suggested_rent: 0, name_prefix: '',
};

function errMsg(e, fallback) {
  const d = e?.response?.data;
  if (typeof d?.detail === 'string') return d.detail;
  const first = d && typeof d === 'object' ? Object.values(d)[0] : null;
  if (Array.isArray(first) && first[0]) return first[0];
  if (typeof first === 'string') return first;
  return fallback;
}

const num = (v) => Number(v || 0);
const fmtM2 = (v) => `${num(v).toLocaleString('es-MX', { maximumFractionDigits: 2 })} m²`;

function Mini({ label, value, sub, bar }) {
  return (
    <div className="cob-stat">
      <div style={{ width: '100%' }}>
        <div className="cob-stat-label">{label}</div>
        <div className="cob-stat-value" style={{ fontSize: 18 }}>{value}</div>
        {bar != null && (
          <div style={{ height: 6, borderRadius: 999, background: 'var(--sand-100, #eee)', margin: '6px 0 2px', overflow: 'hidden' }}>
            <div style={{ width: `${Math.min(100, Math.max(0, bar))}%`, height: '100%', background: 'var(--teal-600)' }} />
          </div>
        )}
        {sub && <div style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', placeholder, full }) {
  return (
    <div className={`field${full ? ' field-full' : ''}`}>
      <label className="field-label">{label}</label>
      <input className="field-input" type={type} value={value ?? ''} placeholder={placeholder} onChange={e => onChange(e.target.value)} />
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-400)', margin: '18px 0 10px' }}>
      {children}
    </div>
  );
}

export default function RentalSpaces({ tenantId, property, currency = 'MXN', onBack, onChanged }) {
  const navigate = useNavigate();
  const { can } = useTenantAccess();
  const canWrite = can('rentas_propiedades');
  const canLease = can('rentas_contratos');
  const [prop, setProp] = useState(property);
  const [spaces, setSpaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [buildingFilter, setBuildingFilter] = useState('');
  const [form, setForm] = useState(null);
  const [bulk, setBulk] = useState(null);
  const [saving, setSaving] = useState(false);

  const typeOptions = spaceTypesFor(prop.property_type);

  const load = () => {
    setLoading(true);
    Promise.all([
      rentalAPI.spaces.list(tenantId, { property: prop.id }),
      rentalAPI.properties.get(tenantId, prop.id).catch(() => ({ data: prop })),
    ])
      .then(([s, p]) => {
        setSpaces([].concat(s.data?.results || s.data || []).filter(x => x && x.id));
        if (p.data?.id) setProp(p.data);
      })
      .catch(() => toast.error('No se pudieron cargar los espacios'))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [prop.id]);

  const refresh = () => { load(); onChanged?.(); };

  const sm = prop.spaces_summary || {};
  const buildings = useMemo(
    () => [...new Set(spaces.map(s => s.building).filter(Boolean))].sort(),
    [spaces],
  );
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return spaces.filter(s => (
      (!statusFilter || s.status === statusFilter)
      && (!typeFilter || s.space_type === typeFilter)
      && (!buildingFilter || s.building === buildingFilter)
      && (!q || [s.code, s.name, s.unit_number, s.building, s.floor, s.zone, s.contract?.tenant_name, s.contract?.code]
        .some(v => String(v || '').toLowerCase().includes(q)))
    ));
  }, [spaces, search, statusFilter, typeFilter, buildingFilter]);

  const openNew = () => setForm({
    ...EMPTY_SPACE, space_type: typeOptions[0] || 'local', building: prop.building_number || '', specs: {}, contacts: [],
  });
  const openEdit = (s) => setForm({
    ...EMPTY_SPACE, ...s, parent: s.parent || '', specs: s.specs || {}, contacts: s.contacts || [],
    available_from: s.available_from || '', available_to: s.available_to || '',
  });

  const save = async () => {
    if (!form.code.trim()) { toast.error('El código del espacio es obligatorio'); return; }
    setSaving(true);
    try {
      const payload = {
        property: prop.id,
        code: form.code.trim(), name: form.name, space_type: form.space_type, status: form.status,
        unit_number: form.unit_number, external_ref: form.external_ref,
        building: form.building, floor: form.floor, zone: form.zone,
        area_m2: num(form.area_m2), suggested_rent: num(form.suggested_rent),
        is_leasable: !!form.is_leasable, is_temporary: !!form.is_temporary, is_active: !!form.is_active,
        available_from: form.available_from || null, available_to: form.available_to || null,
        parent: form.parent || null, specs: form.specs || {}, contacts: form.contacts || [], notes: form.notes,
      };
      if (form.id) await rentalAPI.spaces.update(tenantId, form.id, payload);
      else await rentalAPI.spaces.create(tenantId, payload);
      toast.success(form.id ? 'Espacio actualizado' : 'Espacio creado');
      setForm(null);
      refresh();
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo guardar el espacio'));
    } finally { setSaving(false); }
  };

  const remove = async () => {
    if (!window.confirm(`¿Eliminar el espacio ${form.code}?`)) return;
    try {
      await rentalAPI.spaces.delete(tenantId, form.id);
      toast.success('Espacio eliminado');
      setForm(null);
      refresh();
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo eliminar'));
    }
  };

  const saveBulk = async () => {
    setSaving(true);
    try {
      const r = await rentalAPI.spaces.bulk(tenantId, {
        ...bulk, property: prop.id,
        start: Number(bulk.start) || 1, count: Number(bulk.count) || 0, pad: Number(bulk.pad) || 0,
        area_m2: num(bulk.area_m2), suggested_rent: num(bulk.suggested_rent),
      });
      const { created, skipped } = r.data || {};
      toast.success(`${created} espacio(s) creado(s)${skipped?.length ? ` · ${skipped.length} omitido(s) por código repetido` : ''}`);
      setBulk(null);
      refresh();
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo generar el lote'));
    } finally { setSaving(false); }
  };

  const goContract = (s) => navigate(`/app/rentas/contratos?new=renta&property=${prop.id}&space=${s.id}`);

  const setSpec = (k, v) => setForm(f => ({ ...f, specs: { ...(f.specs || {}), [k]: v } }));
  const setContact = (i, k, v) => setForm(f => ({
    ...f, contacts: f.contacts.map((c, idx) => (idx === i ? { ...c, [k]: v } : c)),
  }));
  const specFields = SPACE_SPEC_FIELDS[form?.space_type] || SPACE_SPEC_FIELDS.otro;
  const parentOptions = spaces.filter(s => s.id !== form?.id && s.is_active);
  const location = [prop.park_name && `Park ${prop.park_name}`, prop.building_number && `Building ${prop.building_number}`, prop.city, prop.submarket].filter(Boolean).join(' · ');

  return (
    <div className="content-fade">
      <button className="btn btn-outline btn-sm" onClick={onBack} style={{ marginBottom: 12 }}>
        <ArrowLeft size={14} /> Volver al inventario
      </button>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', color: 'var(--teal-600)', textTransform: 'uppercase' }}>
            Multi Tenant · {PROPERTY_TYPES[prop.property_type] || prop.property_type}
          </div>
          <h2 style={{ margin: '4px 0 0', fontSize: 22 }}>{prop.code} · {prop.name}</h2>
          <p style={{ color: 'var(--ink-400)', fontSize: 13, marginTop: 4 }}>
            {location || 'Sin ubicación de park / building'}. Cada espacio tiene su identificación, M², contactos e inquilino.
          </p>
        </div>
        {canWrite && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-outline" onClick={() => setBulk({ ...EMPTY_BULK, space_type: typeOptions[0] || 'local', building: prop.building_number || '' })}>
            <Layers size={15} /> Generar en lote
          </button>
          <button className="btn btn-primary" onClick={openNew}><Plus size={15} /> Nuevo espacio</button>
        </div>
        )}
      </div>

      <div className="cob-stats" style={{ marginBottom: 14 }}>
        <Mini label="Total GLA SQM" value={fmtM2(sm.gla_total)} sub={`${sm.spaces_count || 0} espacio(s) · ${sm.leasable_count || 0} rentables`} />
        <Mini label="Rentado" value={fmtM2(sm.gla_occupied)} sub={`${sm.occupied_count || 0} espacio(s) ocupado(s)`} />
        <Mini label="Vacante" value={fmtM2(sm.gla_vacant)} sub={sm.gla_unassigned > 0 ? `${fmtM2(sm.gla_unassigned)} sin asignar a espacios` : 'Disponible para rentar'} />
        <Mini label="Ocupación GLA" value={`${sm.gla_occupancy_pct || 0}%`} bar={sm.gla_occupancy_pct || 0} />
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
        <div style={{ position: 'relative' }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--ink-400)' }} />
          <input className="field-input" placeholder="Buscar espacio, inquilino…" value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 30, width: 230 }} />
        </div>
        <select className="field-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ width: 160 }} aria-label="Estatus">
          <option value="">Todo estatus</option>
          {Object.entries(SPACE_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select className="field-select" value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ width: 190 }} aria-label="Tipo de espacio">
          <option value="">Todo tipo</option>
          {Object.entries(SPACE_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        {buildings.length > 0 && (
          <select className="field-select" value={buildingFilter} onChange={e => setBuildingFilter(e.target.value)} style={{ width: 150 }} aria-label="Building">
            <option value="">Todos los buildings</option>
            {buildings.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        )}
        <span style={{ fontSize: 12, color: 'var(--ink-400)', marginLeft: 'auto' }}>{visible.length} de {spaces.length}</span>
      </div>

      <div className="card">
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-400)' }}>Cargando espacios…</div>
        ) : spaces.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--ink-400)' }}>
            <div style={{ fontWeight: 600 }}>Esta propiedad aún no tiene espacios</div>
            <div style={{ fontSize: 13, marginTop: 6 }}>
              Crea locales, bays, oficinas o habitaciones uno por uno, o genera una serie completa en lote.
            </div>
            {canWrite && (
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 12 }}>
              <button className="btn btn-outline" onClick={() => setBulk({ ...EMPTY_BULK, space_type: typeOptions[0] || 'local', building: prop.building_number || '' })}>Generar en lote</button>
              <button className="btn btn-primary" onClick={openNew}>Nuevo espacio</button>
            </div>
            )}
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Espacio</th>
                  <th>Tipo</th>
                  <th>Ubicación</th>
                  <th style={{ textAlign: 'right' }}>M²</th>
                  <th>Estatus</th>
                  <th>Inquilino</th>
                  <th style={{ textAlign: 'right' }}>Renta</th>
                  <th>Contacto</th>
                  <th>Operación</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visible.map(s => {
                  const c = s.contract;
                  const main = (s.contacts || [])[0];
                  const where = [s.building && `Bldg ${s.building}`, s.floor && `Piso ${s.floor}`, s.zone].filter(Boolean).join(' · ');
                  return (
                    <tr key={s.id} style={{ cursor: 'pointer', opacity: s.is_active ? 1 : 0.55 }} onClick={() => openEdit(s)}>
                      <td>
                        <div style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 700, color: 'var(--teal-600)', paddingLeft: s.parent ? 14 : 0 }}>
                          {s.parent ? '↳ ' : ''}{s.code}
                          {s.is_temporary && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 800, color: '#92400e', background: 'var(--amber-50)', borderRadius: 999, padding: '1px 7px' }}>TEMP</span>}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--ink-400)', paddingLeft: s.parent ? 14 : 0 }}>{s.name || s.unit_number || '—'}</div>
                      </td>
                      <td style={{ fontSize: 12 }}>{s.type_label || SPACE_TYPES[s.space_type]}</td>
                      <td style={{ fontSize: 12, color: 'var(--ink-500)' }}>{where || '—'}</td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{num(s.area_m2).toLocaleString('es-MX')}</td>
                      <td><StatusPill map={SPACE_STATUS} value={s.status} /></td>
                      <td>
                        {c ? (
                          <>
                            <div style={{ fontWeight: 600, fontSize: 13 }}>{c.tenant_name || '—'}</div>
                            <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>{c.code} · vence {fmtDate(c.end_date)}</div>
                          </>
                        ) : <span style={{ color: 'var(--ink-400)', fontSize: 12 }}>Sin inquilino</span>}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {c && c.status !== 'borrador' ? fmtMoney(c.rent_amount, currency) : <span style={{ color: 'var(--ink-400)', fontSize: 12 }}>{s.suggested_rent ? `${fmtMoney(s.suggested_rent, currency)} sug.` : '—'}</span>}
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {main ? (<><div>{main.name || main.email}</div><div style={{ color: 'var(--ink-400)', fontSize: 11 }}>{main.phone || main.email}</div></>) : '—'}
                      </td>
                      <td style={{ fontSize: 11, color: 'var(--ink-500)', whiteSpace: 'nowrap' }}>
                        {(s.open_works || s.open_requests || s.assets_count) ? (
                          <>
                            {s.open_works > 0 && <div>{s.open_works} orden(es) abierta(s)</div>}
                            {s.open_requests > 0 && <div>{s.open_requests} solicitud(es)</div>}
                            {s.assets_count > 0 && <div>{s.assets_count} equipo(s)</div>}
                          </>
                        ) : <span style={{ color: 'var(--ink-300, #bbb)' }}>—</span>}
                      </td>
                      <td onClick={e => e.stopPropagation()}>
                        {canLease && !c && s.is_active && s.is_leasable && !['mantenimiento', 'inactivo'].includes(s.status) && (
                          <button className="btn btn-outline btn-sm" onClick={() => goContract(s)}><UserPlus size={13} /> Rentar</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {form && (
        <div className="modal-bg open" onClick={() => setForm(null)}>
          <div className="modal lg" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3>{form.id ? `Espacio ${form.code}${canWrite ? '' : ' · consulta'}` : `Nuevo espacio · ${prop.code}`}</h3>
              <button className="modal-close" onClick={() => setForm(null)}>✕</button>
            </div>
            <div className="modal-body">
<div className={canWrite ? undefined : 'rental-readonly'}>
              <SectionTitle>Identificación</SectionTitle>
              <div className="form-grid">
                <Field label="Código *" value={form.code} onChange={v => setForm({ ...form, code: v })} placeholder="L-101, B03, 402…" />
                <Field label="Nombre / marca" value={form.name} onChange={v => setForm({ ...form, name: v })} />
                <div className="field">
                  <label className="field-label">Tipo de espacio</label>
                  <select className="field-select" value={form.space_type} onChange={e => setForm({ ...form, space_type: e.target.value, is_temporary: e.target.value === 'temporal' ? true : form.is_temporary })}>
                    {[...new Set([...typeOptions, form.space_type])].map(k => <option key={k} value={k}>{SPACE_TYPES[k] || k}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label className="field-label">Estatus</label>
                  <select className="field-select" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                    {Object.entries(SPACE_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                  <div style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 4 }}>
                    Ocupado / reservado se calcula solo con el contrato. Aquí puedes marcarlo en mantenimiento o inactivo.
                  </div>
                </div>
                <Field label="# Unidad / local / suite" value={form.unit_number} onChange={v => setForm({ ...form, unit_number: v })} />
                <Field label="ID externo / ref." value={form.external_ref} onChange={v => setForm({ ...form, external_ref: v })} />
                <div className="field">
                  <label className="field-label">Dentro de (subnivel superior)</label>
                  <select className="field-select" value={form.parent || ''} onChange={e => setForm({ ...form, parent: e.target.value })}>
                    <option value="">— Nivel principal —</option>
                    {parentOptions.map(s => <option key={s.id} value={s.id}>{s.code}{s.name ? ` — ${s.name}` : ''}</option>)}
                  </select>
                </div>
              </div>

              <SectionTitle>Ubicación</SectionTitle>
              <div className="form-grid">
                <Field label="# Building" value={form.building} onChange={v => setForm({ ...form, building: v })} placeholder={prop.building_number || ''} />
                <Field label="Piso / nivel" value={form.floor} onChange={v => setForm({ ...form, floor: v })} />
                <Field label="Zona / ala / pasillo" value={form.zone} onChange={v => setForm({ ...form, zone: v })} />
                <div className="field">
                  <label className="field-label">Park · Ciudad (de la propiedad)</label>
                  <input className="field-input" disabled value={[prop.park_name, prop.city].filter(Boolean).join(' · ') || '—'} readOnly />
                </div>
              </div>

              <SectionTitle>Superficie y renta</SectionTitle>
              <div className="form-grid">
                <Field label="M² (GLA del espacio)" type="number" value={form.area_m2} onChange={v => setForm({ ...form, area_m2: v })} />
                <Field label="Renta sugerida mensual" type="number" value={form.suggested_rent} onChange={v => setForm({ ...form, suggested_rent: v })} />
                <div className="field" style={{ justifyContent: 'flex-end' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                    <input type="checkbox" checked={!!form.is_leasable} onChange={e => setForm({ ...form, is_leasable: e.target.checked })} />
                    Rentable (cuenta en el GLA)
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginTop: 8 }}>
                    <input type="checkbox" checked={!!form.is_temporary} onChange={e => setForm({ ...form, is_temporary: e.target.checked })} />
                    Espacio temporal
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginTop: 8 }}>
                    <input type="checkbox" checked={!!form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} />
                    Activo
                  </label>
                </div>
                {form.is_temporary && (
                  <>
                    <Field label="Disponible desde" type="date" value={form.available_from} onChange={v => setForm({ ...form, available_from: v })} />
                    <Field label="Disponible hasta" type="date" value={form.available_to} onChange={v => setForm({ ...form, available_to: v })} />
                  </>
                )}
              </div>

              <SectionTitle>Especificaciones de {SPACE_TYPES[form.space_type] || 'este tipo'}</SectionTitle>
              <div className="form-grid">
                {specFields.map(f => (f.type === 'bool' ? (
                  <label key={f.key} className="field" style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 22 }}>
                    <input type="checkbox" checked={!!(form.specs || {})[f.key]} onChange={e => setSpec(f.key, e.target.checked)} />
                    <span className="field-label" style={{ margin: 0 }}>{f.label}</span>
                  </label>
                ) : (
                  <Field
                    key={f.key} label={f.label} type={f.type === 'number' ? 'number' : 'text'}
                    value={(form.specs || {})[f.key] ?? ''}
                    onChange={v => setSpec(f.key, f.type === 'number' ? (v === '' ? '' : Number(v)) : v)}
                  />
                )))}
              </div>

              <SectionTitle>Inquilino asignado</SectionTitle>
              {form.contract ? (
                <div style={{ border: '1px solid var(--sand-200, #e5e7eb)', borderRadius: 10, padding: 12, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{form.contract.tenant_name || '—'}</div>
                    <div style={{ fontSize: 12, color: 'var(--ink-500)' }}>
                      {[form.contract.tenant_email, form.contract.tenant_phone].filter(Boolean).join(' · ') || 'Sin datos de contacto'}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: 4 }}>
                      Contrato {form.contract.code} · {fmtDate(form.contract.start_date)} — {fmtDate(form.contract.end_date)}
                      {' · '}{fmtMoney(form.contract.rent_amount, currency)}
                      {num(form.area_m2) > 0 && ` · ${fmtMoney(form.contract.rent_amount / num(form.area_m2), currency)}/m²`}
                    </div>
                  </div>
                  <button className="btn btn-outline btn-sm" onClick={() => navigate('/app/rentas/contratos')}>Ver contratos</button>
                </div>
              ) : (
                <div style={{ border: '1px dashed var(--sand-300, #d1d5db)', borderRadius: 10, padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 13, color: 'var(--ink-500)' }}>
                    {form.id ? 'Este espacio no tiene inquilino. El inquilino se asigna con un contrato de renta.' : 'Guarda el espacio para poder asignarle un inquilino con un contrato.'}
                  </div>
                  {canLease && form.id && form.is_leasable && (
                    <button className="btn btn-primary btn-sm" onClick={() => goContract(form)}><FilePlus2 size={13} /> Crear contrato de renta</button>
                  )}
                </div>
              )}

              {form.id && (
                <>
                  <SectionTitle>Operación del espacio</SectionTitle>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 12, color: 'var(--ink-500)', marginBottom: 6 }}>
                    <span><strong>{form.open_works || 0}</strong> orden(es) de trabajo abierta(s)</span>
                    <span>·</span>
                    <span><strong>{form.open_requests || 0}</strong> solicitud(es) abierta(s)</span>
                    <span>·</span>
                    <span><strong>{form.assets_count || 0}</strong> equipo(s)</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {can('rentas_mantenimiento', 'read') && <button type="button" className="btn btn-outline btn-sm" onClick={() => navigate(`/app/rentas/mantenimiento?property=${prop.id}&space=${form.id}`)}>Órdenes de trabajo</button>}
                    {can('rentas_solicitudes', 'read') && <button type="button" className="btn btn-outline btn-sm" onClick={() => navigate(`/app/rentas/solicitudes?property=${prop.id}&space=${form.id}`)}>Solicitudes</button>}
                    {can('rentas_preventivo', 'read') && <button type="button" className="btn btn-outline btn-sm" onClick={() => navigate(`/app/rentas/preventivo?property=${prop.id}&space=${form.id}`)}>Preventivo</button>}
                    {can('rentas_activos', 'read') && <button type="button" className="btn btn-outline btn-sm" onClick={() => navigate(`/app/rentas/activos?property=${prop.id}&space=${form.id}`)}>Activos</button>}
                    {can('rentas_inspecciones', 'read') && <button type="button" className="btn btn-outline btn-sm" onClick={() => navigate(`/app/rentas/inspecciones?property=${prop.id}&space=${form.id}`)}>Inspecciones</button>}
                    {can('rentas_capex', 'read') && <button type="button" className="btn btn-outline btn-sm" onClick={() => navigate(`/app/rentas/capex?tab=gastos&property=${prop.id}&space=${form.id}`)}>OPEX / CAPEX</button>}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 6 }}>
                    Al crear una orden, solicitud, equipo, plan o inspección elige este espacio en el formulario y quedará ligado aquí.
                  </div>
                </>
              )}

              <SectionTitle>Contactos del espacio</SectionTitle>
              {(form.contacts || []).length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--ink-400)', marginBottom: 8 }}>
                  Agrega representantes, gerentes de tienda, contacto de mantenimiento o emergencias.
                </div>
              )}
              {(form.contacts || []).map((c, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1.4fr 1fr auto', gap: 8, marginBottom: 8, alignItems: 'end' }}>
                  <Field label={i === 0 ? 'Nombre' : ''} value={c.name} onChange={v => setContact(i, 'name', v)} />
                  <Field label={i === 0 ? 'Rol' : ''} value={c.role} onChange={v => setContact(i, 'role', v)} placeholder="Gerente, TI…" />
                  <Field label={i === 0 ? 'Correo' : ''} type="email" value={c.email} onChange={v => setContact(i, 'email', v)} />
                  <Field label={i === 0 ? 'Teléfono' : ''} value={c.phone} onChange={v => setContact(i, 'phone', v)} />
                  <button className="btn btn-outline btn-sm" type="button" aria-label="Quitar contacto" onClick={() => setForm(f => ({ ...f, contacts: f.contacts.filter((_, idx) => idx !== i) }))}>
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
              {(form.contacts || []).length < 20 && (
                <button className="btn btn-outline btn-sm" type="button" onClick={() => setForm(f => ({ ...f, contacts: [...(f.contacts || []), { name: '', role: '', email: '', phone: '' }] }))}>
                  <Plus size={13} /> Agregar contacto
                </button>
              )}

              <div className="form-grid" style={{ marginTop: 16 }}>
                <div className="field field-full">
                  <label className="field-label">Notas</label>
                  <textarea className="field-input" rows={2} value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} />
                </div>
              </div>
            </div>
            </div>
            <div className="modal-foot">
              {canWrite && form.id && !form.contract && (
                <button className="btn btn-outline" style={{ marginRight: 'auto', color: 'var(--red-600, #dc2626)' }} onClick={remove}>
                  <Trash2 size={14} /> Eliminar
                </button>
              )}
              <button className="btn btn-secondary" onClick={() => setForm(null)}>Cancelar</button>
              {canWrite && <button className="btn btn-primary" disabled={saving} onClick={save}>{saving ? 'Guardando…' : 'Guardar'}</button>}
            </div>
          </div>
        </div>
      )}

      {bulk && (
        <div className="modal-bg open" onClick={() => setBulk(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Generar espacios en lote</h3>
              <button className="modal-close" onClick={() => setBulk(null)}>✕</button>
            </div>
            <div className="modal-body">
              <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--ink-500)' }}>
                Crea una serie de espacios con la misma ficha, p. ej. 12 bays <strong>B01…B12</strong> de 2,500 m² o 40 habitaciones.
                Los códigos que ya existan se omiten.
              </p>
              <div className="form-grid">
                <Field label="Prefijo" value={bulk.prefix} onChange={v => setBulk({ ...bulk, prefix: v })} placeholder="B, L-, H" />
                <Field label="Nombre base (opcional)" value={bulk.name_prefix} onChange={v => setBulk({ ...bulk, name_prefix: v })} placeholder="Bay, Local…" />
                <Field label="Empezar en" type="number" value={bulk.start} onChange={v => setBulk({ ...bulk, start: v })} />
                <Field label="Cantidad (máx. 200)" type="number" value={bulk.count} onChange={v => setBulk({ ...bulk, count: v })} />
                <Field label="Dígitos (relleno con ceros)" type="number" value={bulk.pad} onChange={v => setBulk({ ...bulk, pad: v })} />
                <div className="field">
                  <label className="field-label">Tipo de espacio</label>
                  <select className="field-select" value={bulk.space_type} onChange={e => setBulk({ ...bulk, space_type: e.target.value })}>
                    {typeOptions.map(k => <option key={k} value={k}>{SPACE_TYPES[k] || k}</option>)}
                  </select>
                </div>
                <Field label="# Building" value={bulk.building} onChange={v => setBulk({ ...bulk, building: v })} />
                <Field label="Piso / nivel" value={bulk.floor} onChange={v => setBulk({ ...bulk, floor: v })} />
                <Field label="M² de cada espacio" type="number" value={bulk.area_m2} onChange={v => setBulk({ ...bulk, area_m2: v })} />
                <Field label="Renta sugerida de cada uno" type="number" value={bulk.suggested_rent} onChange={v => setBulk({ ...bulk, suggested_rent: v })} />
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: 10 }}>
                Vista previa: <strong>{bulk.prefix}{String(Number(bulk.start) || 1).padStart(Number(bulk.pad) || 0, '0')}</strong>
                {' … '}
                <strong>{bulk.prefix}{String((Number(bulk.start) || 1) + Math.max(0, (Number(bulk.count) || 1) - 1)).padStart(Number(bulk.pad) || 0, '0')}</strong>
                {' · '}{Number(bulk.count) || 0} espacio(s) · {fmtM2((Number(bulk.count) || 0) * num(bulk.area_m2))} en total
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setBulk(null)}>Cancelar</button>
              <button className="btn btn-primary" disabled={saving} onClick={saveBulk}>{saving ? 'Generando…' : 'Generar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
