import React, { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Cpu, Pencil, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTenantAccess } from '../../context/TenantAccessContext';
import { rentalAPI } from '../../api/client';
import {
  Chip, CRITICALITY, Empty, errMsg, Field, fmtD, Grid, Modal, money, PageHead, SearchBar, Stat,
} from './opsUi';
import SpaceField, { SpaceFilter, spacePayload } from './SpaceField';

const KINDS = {
  hvac: 'Clima / HVAC', elevador: 'Elevador', bomba: 'Bomba / hidroneumático', electrico: 'Equipo eléctrico',
  planta: 'Planta de emergencia', seguridad: 'Seguridad / CCTV', incendio: 'Contra incendio',
  plomeria: 'Plomería / calentador', iluminacion: 'Iluminación', electrodomestico: 'Electrodoméstico',
  mobiliario: 'Mobiliario', vehiculo: 'Vehículo', estructura: 'Estructura / instalación', otro: 'Otro',
};
const STATUS = {
  operativo: { label: 'Operativo', color: 'var(--teal-700)', bg: 'var(--teal-50)' },
  en_falla: { label: 'En falla', color: 'var(--coral-600)', bg: 'var(--coral-50)' },
  en_mantenimiento: { label: 'En mantenimiento', color: 'var(--amber-700)', bg: 'var(--amber-50)' },
  fuera_servicio: { label: 'Fuera de servicio', color: 'var(--ink-600)', bg: 'var(--sand-100)' },
  baja: { label: 'Dado de baja', color: 'var(--ink-500)', bg: 'var(--sand-50)' },
};
const WARRANTY = {
  vigente: { label: 'Vigente', color: 'var(--teal-700)', bg: 'var(--teal-50)' },
  por_vencer: { label: 'Por vencer', color: 'var(--amber-700)', bg: 'var(--amber-50)' },
  vencida: { label: 'Vencida', color: 'var(--coral-600)', bg: 'var(--coral-50)' },
  sin_garantia: { label: 'Sin garantía', color: 'var(--ink-500)', bg: 'var(--sand-50)' },
};
const EMPTY = {
  name: '', kind: 'otro', property: '', space: '', category: '', brand: '', model: '', serial_number: '', location: '',
  status: 'operativo', criticality: 'media', install_date: '', warranty_until: '', useful_life_years: '',
  purchase_cost: '', provider: '', capex_project: '', notes: '', code: '',
};

export default function RentalActivos() {
  const { tenantId } = useAuth();
  const { can } = useTenantAccess();
  const canWrite = can('rentas_activos');
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({});
  const [properties, setProperties] = useState([]);
  const [categories, setCategories] = useState([]);
  const [providers, setProviders] = useState([]);
  const [capexProjects, setCapexProjects] = useState([]);
  const [urlParams] = useSearchParams();
  const [filters, setFilters] = useState({ q: '', property: urlParams.get('property') || '', space: urlParams.get('space') || '', kind: '', status: '', criticality: '', warranty: '' });
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);
  const [detail, setDetail] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
    const [list, sum] = await Promise.all([
      rentalAPI.ops.assets.list(tenantId, { active: 1, ...params }),
      rentalAPI.ops.assets.summary(tenantId),
    ]);
    setRows(list.data || []);
    setSummary(sum.data || {});
  }, [tenantId, filters]);

  useEffect(() => {
    if (!tenantId) return;
    Promise.all([
      rentalAPI.properties.list(tenantId, { page_size: 500 }),
      rentalAPI.maintenance.categories.list(tenantId),
      rentalAPI.maintenance.providers.list(tenantId),
    ]).then(([p, c, pr]) => {
      setProperties(p.data.results || p.data || []);
      setCategories(c.data || []);
      setProviders(pr.data || []);
    });
    rentalAPI.ops.finance.projects.list(tenantId)
      .then(r => setCapexProjects((r.data || []).filter(x => x.status !== 'cancelado')))
      .catch(() => setCapexProjects([]));
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    setLoading(true);
    load().catch(() => toast.error('No se pudieron cargar los activos')).finally(() => setLoading(false));
  }, [load, tenantId]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setFilter = (k, v) => setFilters(f => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.property) return toast.error('Selecciona el inmueble');
    if (!form.name.trim()) return toast.error('Escribe el nombre del equipo');
    setSaving(true);
    try {
      const payload = {
        ...form,
        ...spacePayload(form),
        category: form.category || null,
        provider: form.provider || null,
        capex_project: form.capex_project || null,
        install_date: form.install_date || null,
        warranty_until: form.warranty_until || null,
        useful_life_years: form.useful_life_years === '' ? null : form.useful_life_years,
        purchase_cost: form.purchase_cost === '' ? null : form.purchase_cost,
      };
      if (form.id) await rentalAPI.ops.assets.update(tenantId, form.id, payload);
      else await rentalAPI.ops.assets.create(tenantId, payload);
      toast.success(form.id ? 'Activo actualizado' : 'Activo registrado');
      setForm(null);
      load();
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo guardar'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (a) => {
    if (!window.confirm(`¿Eliminar ${a.code} · ${a.name}?`)) return;
    try {
      await rentalAPI.ops.assets.remove(tenantId, a.id);
      toast.success('Eliminado');
      load();
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo eliminar'));
    }
  };

  const edit = (a) => setForm({
    ...EMPTY, ...a,
    space: a.space || '', category: a.category || '', provider: a.provider || '', capex_project: a.capex_project || '',
    install_date: a.install_date || '', warranty_until: a.warranty_until || '',
    useful_life_years: a.useful_life_years ?? '', purchase_cost: a.purchase_cost ?? '',
  });

  return (
    <div className="content-fade">
      <PageHead
        title="Activos y equipos"
        subtitle="Inventario de equipos por inmueble con garantía, vida útil, criticidad y su historial de mantenimiento."
      >
        {canWrite && <button className="btn btn-primary" onClick={() => setForm({ ...EMPTY })}><Plus size={15} /> Nuevo activo</button>}
      </PageHead>

      <div className="cob-stats" style={{ marginBottom: 16 }}>
        <Stat label="Activos" value={summary.total || 0} />
        <Stat label="En falla" value={summary.en_falla || 0} tone={summary.en_falla ? 'bad' : ''} />
        <Stat label="En mantenimiento" value={summary.en_mantenimiento || 0} tone={summary.en_mantenimiento ? 'warn' : ''} />
        <Stat label="Críticos" value={summary.criticos || 0} />
        <Stat label="Garantía por vencer" value={summary.garantia_por_vencer || 0} tone={summary.garantia_por_vencer ? 'warn' : ''} sub="Próximos 60 días" />
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <SearchBar value={filters.q} onChange={v => setFilter('q', v)} placeholder="Buscar código, nombre, marca, serie o inmueble" />
        <select className="field-input" style={{ maxWidth: 200 }} value={filters.property} onChange={e => setFilters(f => ({ ...f, property: e.target.value, space: '' }))}>
          <option value="">Todos los inmuebles</option>
          {properties.map(p => <option key={p.id} value={p.id}>{p.name} · {p.code}</option>)}
        </select>
        <SpaceFilter tenantId={tenantId} propertyId={filters.property} value={filters.space} onChange={v => setFilter('space', v)} />
        <select className="field-input" style={{ maxWidth: 170 }} value={filters.kind} onChange={e => setFilter('kind', e.target.value)}>
          <option value="">Todo tipo</option>
          {Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className="field-input" style={{ maxWidth: 160 }} value={filters.status} onChange={e => setFilter('status', e.target.value)}>
          <option value="">Todo estado</option>
          {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select className="field-input" style={{ maxWidth: 160 }} value={filters.warranty} onChange={e => setFilter('warranty', e.target.value)}>
          <option value="">Toda garantía</option>
          {Object.entries(WARRANTY).filter(([k]) => k !== 'sin_garantia').map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-400)' }}>Cargando activos…</div>
      ) : rows.length === 0 ? (
        <Empty icon={Cpu} text="Aún no hay activos con este filtro. Registra clima, bombas, elevadores, extintores y más." />
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Código</th><th>Equipo</th><th>Inmueble</th><th>Estado</th><th>Criticidad</th><th>Garantía</th><th>Vida útil</th><th>Costo acum.</th><th></th></tr>
              </thead>
              <tbody>
                {rows.map(a => (
                  <tr key={a.id}>
                    <td style={{ fontFamily: 'monospace', fontWeight: 800, color: 'var(--teal-700)' }}>{a.code}</td>
                    <td>
                      <button type="button" onClick={() => setDetail(a)} style={{ background: 'none', border: 'none', padding: 0, fontWeight: 700, cursor: 'pointer', color: 'var(--ink-800)', textAlign: 'left' }}>{a.name}</button>
                      <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>{a.kind_label}{a.brand ? ` · ${a.brand} ${a.model}` : ''}{a.capex_code && <span style={{ color: '#6d28d9', fontWeight: 700 }}> · CAPEX {a.capex_code}</span>}</div>
                    </td>
                    <td>
                      <div>{a.property_name}</div>
                      <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>{a.property_code}{a.space_code ? ` / ${a.space_code}` : ''}{a.location ? ` · ${a.location}` : ''}</div>
                    </td>
                    <td>
                      <Chip map={STATUS} value={a.status} />
                      {a.open_orders > 0 && <div style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 4 }}>{a.open_orders} orden(es) abierta(s)</div>}
                    </td>
                    <td><Chip map={CRITICALITY} value={a.criticality} /></td>
                    <td>
                      <Chip map={WARRANTY} value={a.warranty_state} />
                      {a.warranty_until && <div style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 4 }}>{fmtD(a.warranty_until)}</div>}
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {a.age_years != null ? `${a.age_years} años` : '—'}
                      {a.life_left_years != null && (
                        <div style={{ fontSize: 11, color: a.life_left_years <= 1 ? 'var(--coral-600)' : 'var(--ink-400)' }}>
                          {a.life_left_years > 0 ? `${a.life_left_years} restantes` : 'Vida útil cumplida'}
                        </div>
                      )}
                    </td>
                    <td>
                      {money(a.total_cost)}
                      {a.failures > 0 && <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>{a.failures} correctivo(s)</div>}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {canWrite && <button className="btn-icon" onClick={() => edit(a)}><Pencil size={14} /></button>}
                      {canWrite && <button className="btn-icon" style={{ color: 'var(--coral-500)' }} onClick={() => remove(a)}><Trash2 size={14} /></button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {form && (
        <Modal
          title={form.id ? `Editar ${form.code}` : 'Nuevo activo'} onClose={() => setForm(null)}
          footer={<>
            <button className="btn btn-outline" onClick={() => setForm(null)}>Cancelar</button>
            <button className="btn btn-primary" disabled={saving} onClick={save}>{saving ? 'Guardando…' : 'Guardar'}</button>
          </>}
        >
          <Grid>
            <Field label="Inmueble *">
              <select className="field-input" value={form.property} onChange={e => setForm(f => ({ ...f, property: e.target.value, space: '' }))} disabled={!!form.id}>
                <option value="">Selecciona…</option>
                {properties.map(p => <option key={p.id} value={p.id}>{p.name} · {p.code}</option>)}
              </select>
            </Field>
            <SpaceField tenantId={tenantId} propertyId={form.property} value={form.space} onChange={v => set('space', v)} emptyLabel="Toda la propiedad" label="Espacio donde está el equipo" />
            <Field label="Nombre *">
              <input className="field-input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Ej. Minisplit sala" />
            </Field>
          </Grid>
          <Grid cols={3}>
            <Field label="Tipo">
              <select className="field-input" value={form.kind} onChange={e => set('kind', e.target.value)}>
                {Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field label="Categoría de servicio">
              <select className="field-input" value={form.category} onChange={e => set('category', e.target.value)}>
                <option value="">Sin categoría</option>
                {categories.filter(c => c.is_active !== false).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Ubicación en el inmueble">
              <input className="field-input" value={form.location} onChange={e => set('location', e.target.value)} placeholder="Azotea, sótano…" />
            </Field>
          </Grid>
          <Grid cols={3}>
            <Field label="Marca"><input className="field-input" value={form.brand} onChange={e => set('brand', e.target.value)} /></Field>
            <Field label="Modelo"><input className="field-input" value={form.model} onChange={e => set('model', e.target.value)} /></Field>
            <Field label="No. de serie"><input className="field-input" value={form.serial_number} onChange={e => set('serial_number', e.target.value)} /></Field>
          </Grid>
          <Grid cols={3}>
            <Field label="Estado">
              <select className="field-input" value={form.status} onChange={e => set('status', e.target.value)}>
                {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </Field>
            <Field label="Criticidad" hint="Qué tanto afecta la operación si falla.">
              <select className="field-input" value={form.criticality} onChange={e => set('criticality', e.target.value)}>
                {Object.entries(CRITICALITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </Field>
            <Field label="Proveedor / mantenedor">
              <select className="field-input" value={form.provider} onChange={e => set('provider', e.target.value)}>
                <option value="">Sin proveedor</option>
                {providers.filter(p => p.is_active !== false).map(p => <option key={p.id} value={p.id}>{p.trade_name || p.name}</option>)}
              </select>
            </Field>
          </Grid>
          <Grid cols={4}>
            <Field label="Instalación"><input type="date" className="field-input" value={form.install_date} onChange={e => set('install_date', e.target.value)} /></Field>
            <Field label="Garantía hasta"><input type="date" className="field-input" value={form.warranty_until} onChange={e => set('warranty_until', e.target.value)} /></Field>
            <Field label="Vida útil (años)"><input type="number" min="1" className="field-input" value={form.useful_life_years} onChange={e => set('useful_life_years', e.target.value)} /></Field>
            <Field label="Costo de compra"><input type="number" min="0" step="0.01" className="field-input" value={form.purchase_cost} onChange={e => set('purchase_cost', e.target.value)} /></Field>
          </Grid>
          {(capexProjects.length > 0 || form.capex_project) && (
            <Field label="Proyecto CAPEX (opcional)" hint="Si este equipo es parte de una inversión (compra, reposición o mejora), lígalo al proyecto para dar seguimiento a su presupuesto.">
              <select className="field-input" value={form.capex_project || ''} onChange={e => set('capex_project', e.target.value)}>
                <option value="">Sin proyecto</option>
                {capexProjects.map(p => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
                {form.capex_project && !capexProjects.some(p => p.id === form.capex_project) && <option value={form.capex_project}>{form.capex_code || 'Proyecto actual'}</option>}
              </select>
            </Field>
          )}
          <Field label="Notas">
            <textarea className="field-input" rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} />
          </Field>
        </Modal>
      )}

      {detail && <AssetDetail asset={detail} tenantId={tenantId} onClose={() => setDetail(null)} />}
    </div>
  );
}

function AssetDetail({ asset, tenantId, onClose }) {
  const [hist, setHist] = useState(null);
  useEffect(() => {
    rentalAPI.ops.assets.history(tenantId, asset.id).then(r => setHist(r.data)).catch(() => setHist({ works: [], plans: [] }));
  }, [tenantId, asset.id]);
  return (
    <Modal
      wide title={`${asset.code} · ${asset.name}`}
      subtitle={`${asset.property_name} (${asset.property_code}${asset.space_code ? ` / ${asset.space_code}` : ''})${asset.location ? ` · ${asset.location}` : ''}`}
      onClose={onClose} footer={<button className="btn btn-outline" onClick={onClose}>Cerrar</button>}
    >
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Chip map={STATUS} value={asset.status} />
        <Chip map={CRITICALITY} value={asset.criticality} />
        <Chip map={WARRANTY} value={asset.warranty_state} />
        <span className="proj-chip">{asset.kind_label}</span>
        {asset.capex_code && <Link to={`/app/rentas/capex?tab=proyectos&project=${asset.capex_project}`} className="proj-chip" style={{ color: '#6d28d9', fontWeight: 700 }}>CAPEX {asset.capex_code}</Link>}
      </div>
      <Grid cols={3}>
        <div style={{ fontSize: 13 }}><div className="field-label">Equipo</div>{[asset.brand, asset.model].filter(Boolean).join(' ') || '—'}<div style={{ color: 'var(--ink-400)', fontSize: 12 }}>Serie: {asset.serial_number || '—'}</div></div>
        <div style={{ fontSize: 13 }}><div className="field-label">Ciclo de vida</div>Instalado: {fmtD(asset.install_date)}<div style={{ color: 'var(--ink-400)', fontSize: 12 }}>Garantía: {fmtD(asset.warranty_until)}</div></div>
        <div style={{ fontSize: 13 }}><div className="field-label">Costos</div>Compra: {money(asset.purchase_cost)}<div style={{ color: 'var(--ink-400)', fontSize: 12 }}>Mantenimiento: {money(asset.total_cost)}</div></div>
      </Grid>
      <h4 style={{ margin: '4px 0 0' }}>Planes preventivos</h4>
      {!hist ? <div style={{ color: 'var(--ink-400)', fontSize: 13 }}>Cargando…</div> : hist.plans.length === 0 ? (
        <div style={{ color: 'var(--ink-400)', fontSize: 13 }}>Sin planes. Créalos en Preventivo para que se generen órdenes automáticas.</div>
      ) : hist.plans.map(p => (
        <div key={p.id} className="rd-row"><span>{p.name} · {p.frequency_label}</span><span style={{ color: 'var(--ink-500)' }}>Próxima {fmtD(p.next_due_date)}</span></div>
      ))}
      <h4 style={{ margin: '8px 0 0' }}>Historial de órdenes</h4>
      {!hist ? null : hist.works.length === 0 ? (
        <div style={{ color: 'var(--ink-400)', fontSize: 13 }}>Este equipo aún no tiene órdenes de trabajo.</div>
      ) : hist.works.map(w => (
        <div key={w.id} className="rd-row">
          <div className="rd-row-main">
            <div className="rd-row-title"><b style={{ fontFamily: 'monospace' }}>{w.folio}</b> · {w.title}</div>
            <div className="rd-row-sub">{w.kind === 'preventivo' ? 'Preventivo' : 'Correctivo'} · {fmtD(w.performed_date || w.scheduled_date)} · {w.provider_name || 'Sin proveedor'}</div>
          </div>
          <div style={{ textAlign: 'right', fontSize: 12 }}><span className="proj-chip">{w.status}</span><div>{money(w.cost)}</div></div>
        </div>
      ))}
    </Modal>
  );
}
