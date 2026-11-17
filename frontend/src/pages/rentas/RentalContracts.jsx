import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTenantAccess } from '../../context/TenantAccessContext';
import RentalCalendar from './RentalCalendar';
import { rentalAPI, tenantsAPI } from '../../api/client';
import { Plus, Scale } from 'lucide-react';
import toast from 'react-hot-toast';
import { CONTRACT_KINDS, CONTRACT_STATUS, LEGAL_STAGES, RENT_BASES, RENT_SCHEMES, emptyRentConditions, fmtDate, fmtMoney, StatusPill } from './rentalUtils';
import RentalLegalAssistant from './RentalLegalAssistant';

const EMPTY = {
  kind: 'renta', title: '', code: '', property: '', space: '', tenant_party: '', guarantor: '',
  provider: '', category: '', work: '', counterparty_name: '', service_description: '',
  start_date: '', end_date: '', rent_amount: 0, deposit_amount: 0,
  payment_day: 1, increment_pct: 0, late_fee_pct: 0,
  rent_scheme: 'fija', rent_conditions: emptyRentConditions(),
  status: 'borrador', notes: '',
};

function errMsg(e, fallback) {
  const d = e?.response?.data;
  if (typeof d?.detail === 'string') return d.detail;
  const first = d && typeof d === 'object' ? Object.values(d)[0] : null;
  if (Array.isArray(first) && first[0]) return first[0];
  return fallback;
}

export default function RentalContracts() {
  const [params, setParams] = useSearchParams();
  const { canAccessModule } = useTenantAccess();
  const showVigencias = canAccessModule('rentas_calendario');
  const section = showVigencias && params.get('tab') === 'vigencias' ? 'vigencias' : 'contratos';
  const go = (key) => setParams(key === 'vigencias' ? { tab: 'vigencias' } : {}, { replace: true });

  const switcher = showVigencias ? (
    <div className="tabs" style={{ marginBottom: 14 }}>
      <button className={`tab ${section === 'contratos' ? 'active' : ''}`} onClick={() => go('contratos')}>Contratos</button>
      <button className={`tab ${section === 'vigencias' ? 'active' : ''}`} onClick={() => go('vigencias')}>Vigencias</button>
    </div>
  ) : null;

  if (section === 'vigencias') {
    return (
      <div className="content-fade">
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', color: 'var(--teal-600)', textTransform: 'uppercase' }}>Administrar Propiedades</div>
          <h2 style={{ margin: '4px 0 0', fontSize: 22 }}>Contratos · Vigencias</h2>
          <p style={{ color: 'var(--ink-400)', fontSize: 13, marginTop: 4 }}>
            Calendario de vida de los contratos y reservas sincronizadas de Airbnb.
          </p>
        </div>
        {switcher}
        <RentalCalendar embedded />
      </div>
    );
  }
  return <ContractsList switcher={switcher} />;
}

function ContractsList({ switcher }) {
  const { tenantId } = useAuth();
  const { can } = useTenantAccess();
  const canWrite = can('rentas_contratos');
  const [qs, setQs] = useSearchParams();
  const [spaceOptions, setSpaceOptions] = useState([]);
  const [items, setItems] = useState([]);
  const [properties, setProperties] = useState([]);
  const [leasingOn, setLeasingOn] = useState(true);
  const [parties, setParties] = useState([]);
  const [providers, setProviders] = useState([]);
  const [categories, setCategories] = useState([]);
  const [works, setWorks] = useState([]);
  const [currency, setCurrency] = useState('MXN');
  const [loading, setLoading] = useState(true);
  const [kindFilter, setKindFilter] = useState('');
  const [form, setForm] = useState(null);
  const [partyForm, setPartyForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [pickKind, setPickKind] = useState(false);
  const [assistantId, setAssistantId] = useState(null);
  const [askLegal, setAskLegal] = useState(null);

  const load = () => {
    if (!tenantId) return;
    setLoading(true);
    Promise.all([
      rentalAPI.contracts.list(tenantId, { page_size: 500, ...(kindFilter ? { kind: kindFilter } : {}) }),
      rentalAPI.properties.list(tenantId, { page_size: 500 }),
      rentalAPI.parties.list(tenantId, { page_size: 500 }),
      rentalAPI.maintenance.providers.list(tenantId).catch(() => ({ data: [] })),
      rentalAPI.maintenance.categories.list(tenantId).catch(() => ({ data: [] })),
      rentalAPI.maintenance.list(tenantId, { page_size: 200 }).catch(() => ({ data: [] })),
      tenantsAPI.get(tenantId).catch(() => ({ data: {} })),
    ]).then(([c, p, t, pr, cat, w, ten]) => {
      setItems(c.data.results || c.data || []);
      setProperties(p.data.results || p.data || []);
      setParties(t.data.results || t.data || []);
      setProviders(pr.data.results || pr.data || []);
      setCategories(cat.data.results || cat.data || []);
      setWorks(w.data.results || w.data || []);
      setCurrency(ten.data?.currency || 'MXN');
      setLeasingOn(ten.data?.rental_settings?.leasing_enabled !== false);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [tenantId, kindFilter]);

  // Espacios disponibles de la propiedad Multi Tenant elegida
  const selectedProp = properties.find(p => p.id === form?.property);
  const propIsMulti = selectedProp?.tenancy_model === 'multi';
  useEffect(() => {
    if (!tenantId || !form || !propIsMulti) { setSpaceOptions([]); return; }
    rentalAPI.spaces.list(tenantId, { property: form.property, active: '1' })
      .then(r => setSpaceOptions([].concat(r.data?.results || r.data || [])))
      .catch(() => setSpaceOptions([]));
  }, [tenantId, form?.property, propIsMulti]);

  // Atajo desde Espacios: /contratos?new=renta&property=…&space=…
  useEffect(() => {
    const kind = qs.get('new');
    if (!kind || loading || !CONTRACT_KINDS[kind]) return;
    const prop = qs.get('property') || '';
    const space = qs.get('space') || '';
    setForm({ ...EMPTY, kind, title: CONTRACT_KINDS[kind]?.label || 'Contrato', property: prop, space });
    setQs({}, { replace: true });
  }, [qs, loading]);

  const LEASE_KIND_KEYS = ['renta', 'comodato', 'promesa'];
  const availableKinds = Object.entries(CONTRACT_KINDS).filter(([k]) => leasingOn || !LEASE_KIND_KEYS.includes(k));
  const inquilinos = parties.filter(x => x.kind === 'inquilino' || x.kind === 'propietario');
  const fiadores = parties.filter(x => x.kind === 'fiador');

  const startNew = (kind) => {
    setPickKind(false);
    setForm({
      ...EMPTY,
      kind,
      title: CONTRACT_KINDS[kind]?.label || 'Contrato',
    });
  };

  const handleSave = async () => {
    if (!form.start_date || !form.end_date) {
      toast.error('Indica las fechas de vigencia');
      return;
    }
    if (form.kind === 'renta' && (!form.property || !form.tenant_party)) {
      toast.error('El contrato de renta requiere inmueble e inquilino');
      return;
    }
    if (LEASE_KIND_KEYS.includes(form.kind) && propIsMulti && !form.space) {
      toast.error('La propiedad es Multi Tenant: elige el espacio que se renta');
      return;
    }
    setSaving(true);
    try {
      const cond = { ...emptyRentConditions(), ...(form.rent_conditions || {}) };
      const scheme = form.kind === 'renta' || form.kind === 'promesa' ? (form.rent_scheme || 'fija') : 'fija';
      const baseRent = scheme === 'variable'
        ? (Number(cond.base_rent) || Number(form.rent_amount) || 0)
        : (Number(form.rent_amount) || 0);
      if (scheme === 'variable') cond.base_rent = baseRent;
      const payload = {
        ...form,
        code: (form.code || '').trim(),
        rent_amount: baseRent,
        deposit_amount: Number(form.deposit_amount) || 0,
        payment_day: Number(form.payment_day) || 1,
        increment_pct: Number(form.increment_pct) || 0,
        late_fee_pct: Number(form.late_fee_pct) || 0,
        rent_scheme: scheme,
        rent_conditions: scheme === 'variable' ? cond : {},
        property: form.property || null,
        space: form.space || null,
        tenant_party: form.tenant_party || null,
        guarantor: form.guarantor || null,
        provider: form.provider || null,
        category: form.category || null,
        work: form.work || null,
      };
      delete payload.space_code;
      delete payload.space_name;
      delete payload.signatures;
      delete payload.kind_label;
      delete payload.legal_stage_label;
      delete payload.rent_scheme_label;
      delete payload.rent_conditions_summary;
      delete payload.effective_rent;
      delete payload.rent_is_estimate;
      if (form.id) {
        await rentalAPI.contracts.update(tenantId, form.id, payload);
        toast.success('Contrato actualizado');
        setForm(null);
        load();
      } else {
        const r = await rentalAPI.contracts.create(tenantId, payload);
        toast.success('Contrato creado');
        setForm(null);
        load();
        setAskLegal(r.data);
      }
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo guardar el contrato'));
    } finally { setSaving(false); }
  };

  const saveParty = async () => {
    if (!partyForm.first_name) { toast.error('Nombre obligatorio'); return; }
    try {
      const res = await rentalAPI.parties.create(tenantId, partyForm);
      toast.success('Contacto creado');
      setParties(prev => [...prev, res.data]);
      if (partyForm.kind === 'inquilino' || partyForm.kind === 'propietario') {
        setForm(f => ({ ...f, tenant_party: res.data.id }));
      }
      if (partyForm.kind === 'fiador') setForm(f => ({ ...f, guarantor: res.data.id }));
      setPartyForm(null);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'No se pudo crear el contacto');
    }
  };

  const amountLabel = form?.kind === 'renta' || form?.kind === 'promesa' ? 'Renta mensual' : 'Importe / contraprestación';

  return (
    <div className="content-fade">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', color: 'var(--teal-600)', textTransform: 'uppercase' }}>Administrar Propiedades</div>
          <h2 style={{ margin: '4px 0 0', fontSize: 22 }}>Contratos</h2>
          <p style={{ color: 'var(--ink-400)', fontSize: 13, marginTop: 4 }}>
            Renta, proveedores, servicios y convenios, con asistente legal para redactar, firmar y publicar.
          </p>
        </div>
        {canWrite && <button className="btn btn-primary" onClick={() => setPickKind(true)}><Plus size={15} /> Nuevo contrato</button>}
      </div>

      {switcher}

      <div className="tabs" style={{ marginBottom: 14 }}>
        <button className={`tab ${!kindFilter ? 'active' : ''}`} onClick={() => setKindFilter('')}>Todos</button>
        {availableKinds.map(([k, v]) => (
          <button key={k} className={`tab ${kindFilter === k ? 'active' : ''}`} onClick={() => setKindFilter(k)}>{v.label}</button>
        ))}
      </div>

      <div className="card">
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-400)' }}>Cargando contratos…</div>
        ) : items.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--ink-400)' }}>
            <div style={{ fontWeight: 600 }}>Sin contratos</div>
            <div style={{ fontSize: 13, marginTop: 6 }}>Elige un tipo y crea el primero. El asistente legal te ayuda a redactarlo.</div>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Contrato</th>
                  <th>Tipo</th>
                  <th>Relacionado</th>
                  <th>Contraparte</th>
                  <th>Vigencia</th>
                  <th>Renta / importe</th>
                  <th>Legal</th>
                  <th>Estatus</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map(c => {
                  const legal = LEGAL_STAGES[c.legal_stage] || LEGAL_STAGES.none;
                  const related = [c.property_code && c.property_name ? `${c.property_code} · ${c.property_name}` : c.property_name, c.space_name, c.category_name, c.work_label].filter(Boolean).join(' · ') || '—';
                  return (
                    <tr key={c.id}>
                      <td>
                        <div style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 700, color: 'var(--teal-600)' }}>{c.code}</div>
                        {c.title && <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>{c.title}</div>}
                      </td>
                      <td style={{ fontSize: 12 }}>{c.kind_label || CONTRACT_KINDS[c.kind]?.label || c.kind}</td>
                      <td style={{ fontSize: 12 }}>{related}</td>
                      <td>
                        <div>{c.counterpart_label || c.tenant_name || c.provider_name || '—'}</div>
                        <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>{c.tenant_phone || c.tenant_email || ''}</div>
                      </td>
                      <td style={{ fontSize: 13 }}>{fmtDate(c.start_date)} — {fmtDate(c.end_date)}</td>
                      <td>
                        <div>{fmtMoney(c.effective_rent ?? c.rent_amount, currency)}</div>
                        {(c.kind === 'renta' || c.kind === 'promesa') && (
                          <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>
                            {c.rent_scheme === 'variable' ? (c.rent_conditions_summary || 'Variable') : 'Fija'}
                            {c.rent_is_estimate ? ' · estimada' : ''}
                          </div>
                        )}
                      </td>
                      <td><span className="proj-chip" style={{ color: legal.color, background: legal.bg }}>{legal.label}</span></td>
                      <td><StatusPill map={CONTRACT_STATUS} value={c.status} /></td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <button className="btn btn-outline btn-sm" onClick={() => setForm({
                            ...EMPTY, ...c,
                            property: c.property || '', space: c.space || '', tenant_party: c.tenant_party || '',
                            guarantor: c.guarantor || '', provider: c.provider || '',
                            category: c.category || '', work: c.work || '',
                            rent_scheme: c.rent_scheme || 'fija',
                            rent_conditions: { ...emptyRentConditions(), ...(c.rent_conditions || {}) },
                          })}>{canWrite ? 'Editar' : 'Ver'}</button>
                          {canWrite && (
                          <button className="btn btn-outline btn-sm" onClick={() => setAssistantId(c.id)}>
                            <Scale size={13} /> Asistente
                          </button>
                          )}
                          {canWrite && c.status === 'borrador' && (
                            <button className="btn btn-primary btn-sm" onClick={async () => { await rentalAPI.contracts.activate(tenantId, c.id); toast.success('Contrato activado'); load(); }}>Activar</button>
                          )}
                          {canWrite && ['activo', 'por_vencer', 'vencido'].includes(c.status) && (
                            <button className="btn btn-outline btn-sm" onClick={async () => { await rentalAPI.contracts.finish(tenantId, c.id, { status: 'finalizado' }); toast.success('Contrato finalizado'); load(); }}>Cerrar</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {pickKind && (
        <div className="ops-report-overlay" onClick={() => setPickKind(false)}>
          <div className="ops-report-modal" style={{ maxWidth: 640 }} onClick={e => e.stopPropagation()}>
            <div className="ops-report-head">
              <div style={{ fontWeight: 800 }}>Tipo de contrato</div>
              <button className="modal-close" onClick={() => setPickKind(false)}>✕</button>
            </div>
            <div className="ops-report-body" style={{ display: 'grid', gap: 10 }}>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-500)' }}>
                Elige el tipo. Luego lo ligas a propiedades, clientes, proveedores o servicios de este espacio.
              </p>
              {!leasingOn && (
                <p style={{ margin: 0, fontSize: 12.5, color: 'var(--amber-700)', background: 'var(--amber-50)', borderRadius: 10, padding: '8px 12px' }}>
                  Tu espacio opera sin rentas, por eso no aparecen los contratos de renta. Puedes cambiarlo en Configuración → Modo de operación.
                </p>
              )}
              {availableKinds.map(([k, v]) => (
                <button
                  key={k}
                  type="button"
                  className="btn btn-outline"
                  style={{ justifyContent: 'flex-start', textAlign: 'left', height: 'auto', padding: '12px 14px' }}
                  onClick={() => startNew(k)}
                >
                  <span>
                    <strong style={{ display: 'block' }}>{v.label}</strong>
                    <span style={{ fontSize: 12, color: 'var(--ink-400)', fontWeight: 500 }}>{v.hint}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {form && (
        <div className="modal-bg open" onClick={() => setForm(null)}>
          <div className="modal lg" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3>{form.id ? (canWrite ? 'Editar contrato' : 'Contrato') : `Nuevo · ${CONTRACT_KINDS[form.kind]?.label || 'Contrato'}`}</h3>
              <button className="modal-close" onClick={() => setForm(null)}>✕</button>
            </div>
            <div className="modal-body">
<div className={canWrite ? undefined : 'rental-readonly'}>
              <div className="form-grid">
                <div className="field">
                  <label className="field-label">Título</label>
                  <input className="field-input" value={form.title || ''} onChange={e => setForm({ ...form, title: e.target.value })} />
                </div>
                <div className="field">
                  <label className="field-label">Código (opcional)</label>
                  <input className="field-input" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="Se asigna al guardar" />
                </div>

                {(form.kind === 'renta' || form.kind === 'comodato' || form.kind === 'promesa' || form.kind === 'mantenimiento') && (
                  <div className="field">
                    <label className="field-label">Propiedad {form.kind === 'renta' ? '*' : ''}</label>
                    <select className="field-select" value={form.property || ''} onChange={e => setForm({ ...form, property: e.target.value, space: '' })}>
                      <option value="">Selecciona…</option>
                      {properties
                        .filter(p => !LEASE_KIND_KEYS.includes(form.kind) || p.usage !== 'operacion' || p.id === form.property)
                        .map(p => <option key={p.id} value={p.id}>{p.code} — {p.name}{p.tenancy_model === 'multi' ? ' (Multi Tenant)' : ''}</option>)}
                    </select>
                  </div>
                )}

                {propIsMulti && ['renta', 'comodato', 'promesa', 'mantenimiento'].includes(form.kind) && (
                  <div className="field">
                    <label className="field-label">Espacio {LEASE_KIND_KEYS.includes(form.kind) ? '*' : '(opcional)'}</label>
                    <select className="field-select" value={form.space || ''} onChange={e => {
                      const sp = spaceOptions.find(x => x.id === e.target.value);
                      setForm(f => ({
                        ...f, space: e.target.value,
                        rent_amount: sp && !f.id && !Number(f.rent_amount) ? (Number(sp.suggested_rent) || 0) : f.rent_amount,
                      }));
                    }}>
                      <option value="">Selecciona…</option>
                      {spaceOptions
                        .filter(x => x.id === form.space || (x.is_leasable && x.status !== 'ocupado' && x.status !== 'reservado'))
                        .map(x => <option key={x.id} value={x.id}>{x.code}{x.name ? ` — ${x.name}` : ''} · {Number(x.area_m2 || 0).toLocaleString('es-MX')} m²{x.building ? ` · ${x.building}` : ''}</option>)}
                    </select>
                    <div style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 4 }}>
                      Solo se listan los espacios libres. Si la renta es por m², se calcula con la superficie del espacio.
                    </div>
                  </div>
                )}

                {(form.kind === 'renta' || form.kind === 'promesa' || form.kind === 'comodato' || form.kind === 'servicios_generales' || form.kind === 'otro') && (
                  <div className="field">
                    <label className="field-label">{form.kind === 'renta' ? 'Inquilino / cliente *' : 'Cliente / parte'}</label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <select className="field-select" value={form.tenant_party || ''} onChange={e => setForm({ ...form, tenant_party: e.target.value })} style={{ flex: 1 }}>
                        <option value="">Selecciona…</option>
                        {inquilinos.map(p => <option key={p.id} value={p.id}>{p.full_name} ({p.kind})</option>)}
                      </select>
                      <button className="btn btn-outline btn-sm" type="button" onClick={() => setPartyForm({ kind: 'inquilino', first_name: '', last_name: '', email: '', phone: '' })}>+</button>
                    </div>
                  </div>
                )}

                {form.kind === 'renta' && (
                  <div className="field">
                    <label className="field-label">Fiador (opcional)</label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <select className="field-select" value={form.guarantor || ''} onChange={e => setForm({ ...form, guarantor: e.target.value })} style={{ flex: 1 }}>
                        <option value="">Ninguno</option>
                        {fiadores.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                      </select>
                      <button className="btn btn-outline btn-sm" type="button" onClick={() => setPartyForm({ kind: 'fiador', first_name: '', last_name: '', email: '', phone: '' })}>+</button>
                    </div>
                  </div>
                )}

                {(form.kind === 'proveedor' || form.kind === 'mantenimiento' || form.kind === 'servicios_generales') && (
                  <div className="field">
                    <label className="field-label">Proveedor {form.kind === 'proveedor' ? '*' : ''}</label>
                    <select className="field-select" value={form.provider || ''} onChange={e => setForm({ ...form, provider: e.target.value })}>
                      <option value="">Selecciona…</option>
                      {providers.map(p => <option key={p.id} value={p.id}>{p.trade_name || p.name}</option>)}
                    </select>
                  </div>
                )}

                {form.kind === 'proveedor' && !form.provider && (
                  <div className="field">
                    <label className="field-label">O nombre de la contraparte</label>
                    <input className="field-input" value={form.counterparty_name || ''} onChange={e => setForm({ ...form, counterparty_name: e.target.value })} />
                  </div>
                )}

                {(form.kind === 'servicios_generales' || form.kind === 'mantenimiento' || form.kind === 'proveedor') && (
                  <div className="field">
                    <label className="field-label">Categoría de servicio</label>
                    <select className="field-select" value={form.category || ''} onChange={e => setForm({ ...form, category: e.target.value })}>
                      <option value="">Ninguna</option>
                      {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                )}

                {form.kind === 'mantenimiento' && (
                  <div className="field">
                    <label className="field-label">Orden de mantenimiento</label>
                    <select className="field-select" value={form.work || ''} onChange={e => setForm({ ...form, work: e.target.value })}>
                      <option value="">Ninguna</option>
                      {works.map(w => <option key={w.id} value={w.id}>{w.folio} · {w.title}</option>)}
                    </select>
                  </div>
                )}

                {(form.kind === 'servicios_generales' || form.kind === 'proveedor' || form.kind === 'mantenimiento' || form.kind === 'otro') && (
                  <div className="field field-full">
                    <label className="field-label">Descripción del servicio</label>
                    <textarea className="field-input" rows={2} value={form.service_description || ''} onChange={e => setForm({ ...form, service_description: e.target.value })} />
                  </div>
                )}

                <div className="field">
                  <label className="field-label">Inicio</label>
                  <input type="date" className="field-input" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} />
                </div>
                <div className="field">
                  <label className="field-label">Fin</label>
                  <input type="date" className="field-input" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} />
                </div>
                {(form.kind === 'renta' || form.kind === 'promesa') ? (
                  <RentSchemeFields form={form} setForm={setForm} amountLabel={amountLabel} />
                ) : (
                  <div className="field">
                    <label className="field-label">{amountLabel}</label>
                    <input type="number" className="field-input" value={form.rent_amount} onChange={e => setForm({ ...form, rent_amount: e.target.value })} />
                  </div>
                )}
                <div className="field field-full">
                  <label className="field-label">Notas</label>
                  <textarea className="field-input" rows={2} value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} />
                </div>
              </div>
            </div>
            </div>
            <div className="modal-foot">
              {canWrite && form.id && (
                <button className="btn btn-outline" type="button" onClick={() => { setAssistantId(form.id); }}>
                  <Scale size={14} /> Asistente legal
                </button>
              )}
              <button className="btn btn-secondary" onClick={() => setForm(null)}>Cancelar</button>
              {canWrite && <button className="btn btn-primary" disabled={saving} onClick={handleSave}>{saving ? 'Guardando…' : 'Guardar contrato'}</button>}
            </div>
          </div>
        </div>
      )}

      {partyForm && (
        <div className="modal-bg open" onClick={() => setPartyForm(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Nuevo {partyForm.kind === 'fiador' ? 'fiador' : 'contacto'}</h3>
              <button className="modal-close" onClick={() => setPartyForm(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="field"><label className="field-label">Nombre</label><input className="field-input" value={partyForm.first_name} onChange={e => setPartyForm({ ...partyForm, first_name: e.target.value })} /></div>
                <div className="field"><label className="field-label">Apellido</label><input className="field-input" value={partyForm.last_name} onChange={e => setPartyForm({ ...partyForm, last_name: e.target.value })} /></div>
                <div className="field"><label className="field-label">Email</label><input className="field-input" value={partyForm.email} onChange={e => setPartyForm({ ...partyForm, email: e.target.value })} /></div>
                <div className="field"><label className="field-label">Teléfono</label><input className="field-input" value={partyForm.phone} onChange={e => setPartyForm({ ...partyForm, phone: e.target.value })} /></div>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setPartyForm(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={saveParty}>Guardar</button>
            </div>
          </div>
        </div>
      )}

      {askLegal && (
        <div className="ops-report-overlay" onClick={() => setAskLegal(null)}>
          <div className="ops-report-modal" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
            <div className="ops-report-head">
              <div style={{ fontWeight: 800 }}>Asistente legal</div>
              <button className="btn-icon" onClick={() => setAskLegal(null)}>✕</button>
            </div>
            <div className="ops-report-body">
              <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6 }}>
                ¿Quieres redactar <strong>{askLegal.code}</strong> con el asistente legal?
              </p>
              <p style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--ink-500)', lineHeight: 1.6 }}>
                Te guía en la entrevista, genera el texto, lo presenta, registra firmas y lo publica en el espacio.
              </p>
            </div>
            <div className="ops-report-foot">
              <button className="btn btn-outline" onClick={() => setAskLegal(null)}>Ahora no</button>
              <button className="btn btn-primary" onClick={() => { const id = askLegal.id; setAskLegal(null); setAssistantId(id); }}>
                Sí, abrir asistente
              </button>
            </div>
          </div>
        </div>
      )}

      {assistantId && (
        <RentalLegalAssistant
          tenantId={tenantId}
          contractId={assistantId}
          onClose={() => setAssistantId(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}

function setCond(form, setForm, patch) {
  setForm({ ...form, rent_conditions: { ...emptyRentConditions(), ...(form.rent_conditions || {}), ...patch } });
}

function RentSchemeFields({ form, setForm, amountLabel }) {
  const cond = { ...emptyRentConditions(), ...(form.rent_conditions || {}) };
  const scheme = form.rent_scheme || 'fija';
  const basis = cond.basis || 'ventas';

  return (
    <>
      <div className="field field-full">
        <label className="field-label">Esquema de renta</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {Object.entries(RENT_SCHEMES).map(([k, v]) => (
            <button
              key={k}
              type="button"
              className={`btn ${scheme === k ? 'btn-primary' : 'btn-outline'}`}
              style={{ justifyContent: 'flex-start', textAlign: 'left', height: 'auto', padding: '10px 12px' }}
              onClick={() => setForm({ ...form, rent_scheme: k, rent_conditions: cond })}
            >
              <span>
                <strong style={{ display: 'block' }}>{v.label}</strong>
                <span style={{ fontSize: 11, fontWeight: 500, opacity: 0.85 }}>{v.hint}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      {scheme === 'variable' && (
        <div className="field field-full">
          <label className="field-label">Condición especial</label>
          <select className="field-select" value={basis} onChange={e => setCond(form, setForm, { basis: e.target.value })}>
            {Object.entries(RENT_BASES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <div style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: 4 }}>{RENT_BASES[basis]?.hint}</div>
        </div>
      )}

      <div className="field">
        <label className="field-label">{scheme === 'variable' ? 'Renta base / mínima' : amountLabel}</label>
        <input
          type="number"
          className="field-input"
          value={scheme === 'variable' ? (cond.base_rent || form.rent_amount || 0) : form.rent_amount}
          onChange={e => {
            const n = e.target.value;
            if (scheme === 'variable') {
              setForm({ ...form, rent_amount: n, rent_conditions: { ...cond, base_rent: n } });
            } else {
              setForm({ ...form, rent_amount: n });
            }
          }}
        />
      </div>
      <div className="field">
        <label className="field-label">Depósito</label>
        <input type="number" className="field-input" value={form.deposit_amount} onChange={e => setForm({ ...form, deposit_amount: e.target.value })} />
      </div>
      <div className="field">
        <label className="field-label">Día de cobro</label>
        <input type="number" min={1} max={28} className="field-input" value={form.payment_day} onChange={e => setForm({ ...form, payment_day: e.target.value })} />
      </div>
      <div className="field">
        <label className="field-label">Incremento anual %</label>
        <input type="number" className="field-input" value={form.increment_pct} onChange={e => setForm({ ...form, increment_pct: e.target.value })} />
      </div>
      <div className="field">
        <label className="field-label">Mora %</label>
        <input type="number" className="field-input" value={form.late_fee_pct} onChange={e => setForm({ ...form, late_fee_pct: e.target.value })} />
      </div>

      {scheme === 'variable' && basis === 'ventas' && (
        <>
          <div className="field">
            <label className="field-label">% sobre ventas</label>
            <input type="number" className="field-input" value={cond.percent} onChange={e => setCond(form, setForm, { percent: e.target.value })} />
          </div>
          <div className="field">
            <label className="field-label">Punto de quiebre (ventas)</label>
            <input type="number" className="field-input" value={cond.breakpoint} onChange={e => setCond(form, setForm, { breakpoint: e.target.value })} />
          </div>
          <div className="field">
            <label className="field-label">Últimas ventas reportadas</label>
            <input type="number" className="field-input" value={cond.reported_sales} onChange={e => setCond(form, setForm, { reported_sales: e.target.value })} />
          </div>
        </>
      )}

      {scheme === 'variable' && basis === 'inpc' && (
        <>
          <div className="field">
            <label className="field-label">Índice</label>
            <input className="field-input" value={cond.index_name} onChange={e => setCond(form, setForm, { index_name: e.target.value })} />
          </div>
          <div className="field">
            <label className="field-label">Revisión (meses)</label>
            <input type="number" className="field-input" value={cond.review_months} onChange={e => setCond(form, setForm, { review_months: e.target.value })} />
          </div>
          <div className="field">
            <label className="field-label">Índice base</label>
            <input type="number" className="field-input" value={cond.index_base} onChange={e => setCond(form, setForm, { index_base: e.target.value })} />
          </div>
          <div className="field">
            <label className="field-label">Índice vigente</label>
            <input type="number" className="field-input" value={cond.index_current} onChange={e => setCond(form, setForm, { index_current: e.target.value })} />
          </div>
          <div className="field">
            <label className="field-label">Tope %</label>
            <input type="number" className="field-input" value={cond.cap_pct} onChange={e => setCond(form, setForm, { cap_pct: e.target.value })} />
          </div>
          <div className="field">
            <label className="field-label">Piso %</label>
            <input type="number" className="field-input" value={cond.floor_pct} onChange={e => setCond(form, setForm, { floor_pct: e.target.value })} />
          </div>
        </>
      )}

      {scheme === 'variable' && basis === 'escalonada' && (
        <div className="field field-full">
          <label className="field-label">Tramos (desde YYYY-MM)</label>
          {(cond.steps || []).map((step, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
              <input className="field-input" placeholder="2026-01" value={step.from || ''} onChange={e => {
                const steps = [...cond.steps];
                steps[i] = { ...steps[i], from: e.target.value };
                setCond(form, setForm, { steps });
              }} />
              <input type="number" className="field-input" placeholder="Monto" value={step.amount || ''} onChange={e => {
                const steps = [...cond.steps];
                steps[i] = { ...steps[i], amount: e.target.value };
                setCond(form, setForm, { steps });
              }} />
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setCond(form, setForm, { steps: cond.steps.filter((_, j) => j !== i) })}>Quitar</button>
            </div>
          ))}
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setCond(form, setForm, { steps: [...(cond.steps || []), { from: '', amount: 0 }] })}>+ Tramo</button>
        </div>
      )}

      {scheme === 'variable' && basis === 'ocupacion' && (
        <>
          <div className="field">
            <label className="field-label">Tarifa por noche</label>
            <input type="number" className="field-input" value={cond.nightly_rate} onChange={e => setCond(form, setForm, { nightly_rate: e.target.value })} />
          </div>
          <div className="field">
            <label className="field-label">Ocupación esperada %</label>
            <input type="number" className="field-input" value={cond.occupancy_pct} onChange={e => setCond(form, setForm, { occupancy_pct: e.target.value })} />
          </div>
          <div className="field">
            <label className="field-label">Noches del mes</label>
            <input type="number" className="field-input" value={cond.nights} onChange={e => setCond(form, setForm, { nights: e.target.value })} />
          </div>
          <div className="field">
            <label className="field-label">Comisión plataforma %</label>
            <input type="number" className="field-input" value={cond.platform_fee_pct} onChange={e => setCond(form, setForm, { platform_fee_pct: e.target.value })} />
          </div>
        </>
      )}

      {scheme === 'variable' && basis === 'm2' && (
        <>
          <div className="field">
            <label className="field-label">Tarifa por m²</label>
            <input type="number" className="field-input" value={cond.rate_m2} onChange={e => setCond(form, setForm, { rate_m2: e.target.value })} />
          </div>
          <div className="field">
            <label className="field-label">m² (si no usa los del inmueble)</label>
            <input type="number" className="field-input" value={cond.area_m2} onChange={e => setCond(form, setForm, { area_m2: e.target.value })} />
          </div>
          <div className="field">
            <label className="field-label">Factor áreas comunes</label>
            <input type="number" className="field-input" value={cond.common_area_factor} onChange={e => setCond(form, setForm, { common_area_factor: e.target.value })} />
          </div>
        </>
      )}

      {scheme === 'variable' && basis === 'temporada' && (
        <div className="field field-full">
          <label className="field-label">Temporadas (meses 1-12 separados por coma)</label>
          {(cond.seasons || []).map((season, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
              <input className="field-input" placeholder="12,1,2" value={(season.months || []).join(',')} onChange={e => {
                const seasons = [...cond.seasons];
                seasons[i] = { ...seasons[i], months: e.target.value.split(/[,\s]+/).map(n => parseInt(n, 10)).filter(n => n >= 1 && n <= 12) };
                setCond(form, setForm, { seasons });
              }} />
              <input type="number" className="field-input" placeholder="Monto" value={season.amount || ''} onChange={e => {
                const seasons = [...cond.seasons];
                seasons[i] = { ...seasons[i], amount: e.target.value };
                setCond(form, setForm, { seasons });
              }} />
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setCond(form, setForm, { seasons: cond.seasons.filter((_, j) => j !== i) })}>Quitar</button>
            </div>
          ))}
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setCond(form, setForm, { seasons: [...(cond.seasons || []), { months: [], amount: 0 }] })}>+ Temporada</button>
        </div>
      )}

      {scheme === 'variable' && (
        <div className="field field-full">
          <label className="field-label">Notas de la condición</label>
          <textarea className="field-input" rows={2} value={cond.notes || ''} onChange={e => setCond(form, setForm, { notes: e.target.value })} placeholder="Ej. reporte de ventas los días 5, o ajuste INPC de enero." />
        </div>
      )}
    </>
  );
}
