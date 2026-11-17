import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Plus, Wrench, Pencil, Trash2, X, Calendar, User,
  Image as ImageIcon, Upload, Search, FolderOpen, Play, CheckCircle2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTenantAccess } from '../../context/TenantAccessContext';
import { rentalAPI, api } from '../../api/client';
import RentalProviderExpediente, { AskExpedienteModal } from './RentalProviderExpediente';
import { PRIORITY as PRIO_CHIP, SLA_STATE, Chip, fmtDT } from './opsUi';
import SpaceField, { SpaceFilter, spacePayload } from './SpaceField';

const TABS = [
  ['todas', 'Todas'],
  ['preventivo', 'Preventivos'],
  ['correctivo', 'Correctivos'],
  ['proveedores', 'Proveedores'],
  ['catalogos', 'Catálogos'],
];
const STATUS = {
  planeado: { label: 'Planeado', color: 'var(--ink-500)', bg: 'var(--sand-50)' },
  en_curso: { label: 'En curso', color: 'var(--teal-700)', bg: 'var(--teal-50)' },
  realizado: { label: 'Realizado', color: 'var(--blue-700)', bg: 'var(--blue-50)' },
  cancelado: { label: 'Cancelado', color: 'var(--coral-600)', bg: 'var(--coral-50)' },
};
const PRIORITY = { baja: 'Baja', media: 'Media', alta: 'Alta', urgente: 'Urgente' };
const FREQ = {
  unica: 'Única', semanal: 'Semanal', quincenal: 'Quincenal', mensual: 'Mensual', bimestral: 'Bimestral',
  trimestral: 'Trimestral', semestral: 'Semestral', anual: 'Anual',
};
const EV_KIND = { antes: 'Antes', durante: 'Durante', despues: 'Después', otro: 'Otro' };

const EMPTY_WORK = {
  title: '', description: '', work_notes: '',
  property: '', space: '', category: '', work_type: '', provider: '',
  vendor_name: '', reported_by: '', assigned_to: '',
  status: 'planeado', priority: 'media', frequency: 'unica',
  scheduled_date: '', performed_date: '', next_due_date: '', cost: '',
  asset: '', capex_project: '', estimated_cost: '', parts_cost: '', labor_cost: '', checklist: [],
};
const isWorkTab = (t) => t === 'todas' || t === 'preventivo' || t === 'correctivo';

function errMsg(e, fallback) {
  const data = e?.response?.data;
  if (data && typeof data === 'object') {
    if (typeof data.detail === 'string') return data.detail;
    const first = Object.values(data).flat().find(v => typeof v === 'string');
    if (first) return first;
  }
  return fallback;
}

function fmtDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function money(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v === 0) return '—';
  return v.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

function Pill({ value }) {
  const m = STATUS[value] || { label: value, color: 'var(--ink-500)', bg: 'var(--sand-50)' };
  return <span className="proj-chip" style={{ color: m.color, background: m.bg }}>{m.label}</span>;
}

export default function RentalMantenimiento() {
  const { tenantId } = useAuth();
  const { can } = useTenantAccess();
  const canWrite = can('rentas_mantenimiento');
  const canOperate = can('rentas_mantenimiento', 'operate');
  const [tab, setTab] = useState('todas');
  const [works, setWorks] = useState([]);
  const [summary, setSummary] = useState({});
  const [properties, setProperties] = useState([]);
  const [categories, setCategories] = useState([]);
  const [workTypes, setWorkTypes] = useState([]);
  const [providers, setProviders] = useState([]);
  const [q, setQ] = useState('');
  const [urlParams] = useSearchParams();
  const [filterProp, setFilterProp] = useState(urlParams.get('property') || '');
  const [filterSpace, setFilterSpace] = useState(urlParams.get('space') || '');
  const [filterCat, setFilterCat] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterSource, setFilterSource] = useState('');
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [formAssets, setFormAssets] = useState([]);
  const [capexProjects, setCapexProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY_WORK);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState(null);

  const loadCatalogs = async () => {
    const [props, cats, types, provs] = await Promise.all([
      rentalAPI.properties.list(tenantId, { page_size: 500 }),
      rentalAPI.maintenance.categories.list(tenantId),
      rentalAPI.maintenance.workTypes.list(tenantId),
      rentalAPI.maintenance.providers.list(tenantId),
    ]);
    rentalAPI.ops.finance.projects.list(tenantId)
      .then(r => setCapexProjects((r.data || []).filter(p => !['completado', 'cancelado'].includes(p.status))))
      .catch(() => setCapexProjects([]));
    setProperties(props.data.results || props.data || []);
    setCategories(cats.data || []);
    setWorkTypes(types.data || []);
    setProviders(provs.data || []);
  };

  const loadWorks = async () => {
    const params = { kind: tab === 'preventivo' || tab === 'correctivo' ? tab : undefined };
    if (filterProp) params.property = filterProp;
    if (filterSpace) params.space = filterSpace;
    if (filterStatus) params.status = filterStatus;
    if (filterSource) params.source = filterSource;
    if (onlyOverdue) params.overdue = 1;
    if (filterCat) params.category = filterCat;
    if (q) params.q = q;
    const [list, sum] = await Promise.all([
      rentalAPI.maintenance.list(tenantId, params),
      rentalAPI.maintenance.summary(tenantId),
    ]);
    setWorks(list.data || []);
    setSummary(sum.data || {});
  };

  useEffect(() => {
    if (!tenantId) return;
    setLoading(true);
    loadCatalogs().catch(() => toast.error('No se pudieron cargar los catálogos')).finally(() => setLoading(false));
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId || !isWorkTab(tab)) return;
    loadWorks().catch(() => toast.error('No se pudieron cargar los mantenimientos'));
  }, [tenantId, tab, filterProp, filterSpace, filterCat, filterStatus, filterSource, onlyOverdue, q]);

  useEffect(() => {
    if (modal !== 'work' || !form.property) { setFormAssets([]); return; }
    rentalAPI.ops.assets.list(tenantId, { property: form.property, active: 1 })
      .then(r => setFormAssets(r.data || [])).catch(() => setFormAssets([]));
  }, [modal, form.property, tenantId]);

  const typesForForm = useMemo(() => {
    return workTypes.filter(t => {
      if (form.category && t.category !== form.category) return false;
      if (t.kind !== 'ambos' && t.kind !== tab && t.kind !== form.kind) return false;
      return t.is_active !== false;
    });
  }, [workTypes, form.category, form.kind, tab]);

  const openNew = () => {
    setForm({ ...EMPTY_WORK, kind: tab === 'preventivo' ? 'preventivo' : 'correctivo', checklist: [] });
    setModal('work');
  };

  const openEdit = (w) => {
    setForm({
      ...EMPTY_WORK,
      ...w,
      property: w.property,
      space: w.space || '',
      category: w.category || '',
      work_type: w.work_type || '',
      provider: w.provider || '',
      cost: w.cost || '',
      asset: w.asset || '',
      capex_project: w.capex_project || '',
      estimated_cost: w.estimated_cost ?? '',
      parts_cost: w.parts_cost ?? '',
      labor_cost: w.labor_cost ?? '',
      checklist: w.checklist || [],
      scheduled_date: w.scheduled_date || '',
      performed_date: w.performed_date || '',
      next_due_date: w.next_due_date || '',
    });
    setModal('work');
  };

  const saveWork = async () => {
    if (!form.property) return toast.error('Selecciona la propiedad');
    if (!form.title.trim()) return toast.error('Escribe el título del trabajo');
    setSaving(true);
    try {
      const payload = {
        ...form,
        ...spacePayload(form),
        kind: form.kind || (tab === 'preventivo' ? 'preventivo' : 'correctivo'),
        category: form.category || null,
        work_type: form.work_type || null,
        provider: form.provider || null,
        cost: form.cost === '' ? null : form.cost,
        asset: form.asset || null,
        capex_project: form.capex_project || null,
        estimated_cost: form.estimated_cost === '' ? 0 : form.estimated_cost,
        parts_cost: form.parts_cost === '' ? 0 : form.parts_cost,
        labor_cost: form.labor_cost === '' ? 0 : form.labor_cost,
        checklist: (form.checklist || []).filter(c => String(c.label || '').trim()),
        scheduled_date: form.scheduled_date || null,
        performed_date: form.performed_date || null,
        next_due_date: form.next_due_date || null,
      };
      if (form.id) await rentalAPI.maintenance.update(tenantId, form.id, payload);
      else await rentalAPI.maintenance.create(tenantId, payload);
      toast.success(form.id ? 'Trabajo actualizado' : 'Trabajo registrado');
      setModal(null);
      loadWorks();
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo guardar'));
    } finally {
      setSaving(false);
    }
  };

  const removeWork = async (w) => {
    if (!window.confirm(`¿Eliminar el trabajo ${w.folio || ''}?`)) return;
    try {
      await rentalAPI.maintenance.remove(tenantId, w.id);
      toast.success('Eliminado');
      loadWorks();
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo eliminar'));
    }
  };

  const quickStatus = async (w, status) => {
    try {
      const payload = { status };
      if (status === 'realizado') payload.performed_date = w.performed_date || todayISO();
      await rentalAPI.maintenance.update(tenantId, w.id, payload);
      toast.success(status === 'en_curso' ? 'Orden iniciada' : 'Orden completada');
      loadWorks();
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo actualizar'));
    }
  };

  const openDetail = async (w) => {
    try {
      const { data } = await rentalAPI.maintenance.get(tenantId, w.id);
      setDetail(data);
    } catch {
      toast.error('No se pudo abrir la ficha');
    }
  };

  if (loading) {
    return <div className="content-fade" style={{ padding: 40, textAlign: 'center', color: 'var(--ink-400)' }}>Cargando mantenimiento…</div>;
  }

  return (
    <div className="content-fade">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', color: 'var(--teal-600)', textTransform: 'uppercase' }}>
            Administrar Propiedades
          </div>
          <h2 style={{ margin: '4px 0 0', fontSize: 24 }}>Órdenes de trabajo</h2>
          <p style={{ color: 'var(--ink-400)', fontSize: 13, marginTop: 4 }}>
            Centro de órdenes de trabajo: preventivas, correctivas, de solicitudes e inspecciones, con SLA, equipos, costos y proveedores.
          </p>
        </div>
        {canWrite && tab !== 'catalogos' && (
          <button className="btn btn-primary" onClick={tab === 'proveedores' ? () => setModal('provider-new') : openNew}>
            <Plus size={15} /> {tab === 'proveedores' ? 'Nuevo proveedor' : 'Nuevo trabajo'}
          </button>
        )}
      </div>

      <div className="cob-stats" style={{ marginBottom: 16 }}>
        <Kpi label="Preventivos" value={summary.preventivo || 0} />
        <Kpi label="Correctivos" value={summary.correctivo || 0} />
        <Kpi label="En curso" value={summary.en_curso || 0} />
        <Kpi label="Vencidos" value={summary.vencidos || 0} warn />
        <Kpi label="Fuera de SLA" value={summary.sla_vencidas || 0} warn />
      </div>

      <div className="tabs" style={{ marginBottom: 14 }}>
        {TABS.map(([k, label]) => (
          <button key={k} className={`tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>

      {isWorkTab(tab) && (
        <>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
            <div style={{ flex: 1, minWidth: 180, position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: 12, color: 'var(--ink-400)' }} />
              <input className="field-input" style={{ paddingLeft: 32 }} value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar folio, título o propiedad" />
            </div>
            <select className="field-input" style={{ maxWidth: 220 }} value={filterProp} onChange={e => { setFilterProp(e.target.value); setFilterSpace(''); }}>
              <option value="">Todas las propiedades</option>
              {properties.map(p => <option key={p.id} value={p.id}>{p.name} · {p.code}</option>)}
            </select>
            <SpaceFilter tenantId={tenantId} propertyId={filterProp} value={filterSpace} onChange={setFilterSpace} />
            <select className="field-input" style={{ maxWidth: 200 }} value={filterCat} onChange={e => setFilterCat(e.target.value)}>
              <option value="">Todas las categorías</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select className="field-input" style={{ maxWidth: 150 }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="">Todo estatus</option>
              {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select className="field-input" style={{ maxWidth: 150 }} value={filterSource} onChange={e => setFilterSource(e.target.value)}>
              <option value="">Todo origen</option>
              <option value="plan">Plan preventivo</option>
              <option value="request">Solicitud</option>
              <option value="inspection">Inspección</option>
            </select>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
              <input type="checkbox" checked={onlyOverdue} onChange={e => setOnlyOverdue(e.target.checked)} /> Fuera de SLA
            </label>
          </div>
          <WorksTable
            rows={works}
            canWrite={canWrite}
            canOperate={canOperate}
            onQuick={quickStatus}
            onOpen={openDetail}
            onEdit={openEdit}
            onDelete={removeWork}
          />
        </>
      )}

      {tab === 'proveedores' && (
        <ProvidersPanel
          providers={providers}
          categories={categories}
          canWrite={canWrite}
          onReload={loadCatalogs}
          modal={modal}
          setModal={setModal}
        />
      )}

      {tab === 'catalogos' && (
        <CatalogsPanel
          tenantId={tenantId}
          categories={categories}
          workTypes={workTypes}
          canWrite={canWrite}
          onReload={loadCatalogs}
        />
      )}

      {modal === 'work' && (
        <WorkModal
          tenantId={tenantId}
          form={form}
          setForm={setForm}
          properties={properties}
          categories={categories}
          assets={formAssets}
          capexProjects={capexProjects}
          typesForForm={typesForForm}
          providers={providers}
          saving={saving}
          onClose={() => setModal(null)}
          onSave={saveWork}
        />
      )}

      {detail && (
        <DetailModal
          work={detail}
          tenantId={tenantId}
          canWrite={canWrite}
          canOperate={canOperate}
          onClose={() => setDetail(null)}
          onReload={async () => {
            const { data } = await rentalAPI.maintenance.get(tenantId, detail.id);
            setDetail(data);
            loadWorks();
          }}
        />
      )}
    </div>
  );
}

function Kpi({ label, value, warn }) {
  return (
    <div className="cob-stat">
      <div>
        <div className="cob-stat-label">{label}</div>
        <div className="cob-stat-value" style={{ color: warn && value > 0 ? 'var(--coral-600)' : undefined }}>{value}</div>
      </div>
    </div>
  );
}

function WorksTable({ rows, canWrite, canOperate, onOpen, onEdit, onDelete, onQuick }) {
  if (!rows.length) {
    return (
      <div className="card" style={{ padding: 36, textAlign: 'center', color: 'var(--ink-400)' }}>
        <Wrench size={22} style={{ marginBottom: 8, opacity: 0.5 }} />
        <div>No hay trabajos en este filtro.</div>
      </div>
    );
  }
  return (
    <div className="card">
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Folio</th>
              <th>Propiedad</th>
              <th>Trabajo</th>
              <th>Categoría</th>
              <th>Proveedor</th>
              <th>Fecha / SLA</th>
              <th>Estatus</th>
              <th>Costo</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(w => (
              <tr key={w.id}>
                <td style={{ fontFamily: 'monospace', fontWeight: 800, color: 'var(--teal-700)' }}>{w.folio || '—'}</td>
                <td>
                  <div style={{ fontWeight: 700 }}>{w.property_name}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>{w.property_code}{w.space_code ? ` / ${w.space_code}` : ''}</div>
                </td>
                <td>
                  <button type="button" onClick={() => onOpen(w)} style={{ background: 'none', border: 'none', padding: 0, fontWeight: 700, cursor: 'pointer', color: 'var(--ink-800)', textAlign: 'left' }}>
                    {w.title}
                  </button>
                  <div style={{ fontSize: 11, color: 'var(--ink-400)', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 2 }}>
                    <Chip map={PRIO_CHIP} value={w.priority} />
                    {w.asset_name && <span>{w.asset_code} · {w.asset_name}</span>}
                    {w.capex_code && <span style={{ color: 'var(--purple-700, #6d28d9)', fontWeight: 700 }}>CAPEX {w.capex_code}</span>}
                    {w.request_folio && <span>↩ {w.request_folio}</span>}
                    {w.inspection_folio && <span>↩ {w.inspection_folio}</span>}
                    {w.plan_name && <span>⟳ Preventivo</span>}
                  </div>
                </td>
                <td>
                  <span className="proj-chip" style={{ background: `${w.category_color || '#0f766e'}18`, color: w.category_color || '#0f766e' }}>
                    {w.category_name || '—'}
                  </span>
                </td>
                <td>{w.provider_name || '—'}</td>
                <td style={{ fontSize: 12 }}>
                  {fmtDate(w.scheduled_date || w.next_due_date)}
                  {w.sla_state && <div style={{ marginTop: 3 }}><Chip map={SLA_STATE} value={w.sla_state} /></div>}
                  {w.due_at && w.status !== 'realizado' && w.status !== 'cancelado' && (
                    <div style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 2 }}>Límite {fmtDT(w.due_at)}</div>
                  )}
                </td>
                <td><Pill value={w.status} /></td>
                <td>{money(w.cost)}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {canOperate && w.status === 'planeado' && <button className="btn-icon" title="Iniciar" onClick={() => onQuick(w, 'en_curso')}><Play size={14} /></button>}
                  {canOperate && (w.status === 'planeado' || w.status === 'en_curso') && <button className="btn-icon" title="Marcar realizada" style={{ color: 'var(--teal-600)' }} onClick={() => onQuick(w, 'realizado')}><CheckCircle2 size={14} /></button>}
                  <button className="btn-icon" title="Ver ficha" onClick={() => onOpen(w)}><Wrench size={14} /></button>
                  {canWrite && <button className="btn-icon" onClick={() => onEdit(w)}><Pencil size={14} /></button>}
                  {canWrite && <button className="btn-icon" style={{ color: 'var(--coral-500)' }} onClick={() => onDelete(w)}><Trash2 size={14} /></button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function WorkModal({ tenantId, form, setForm, properties, categories, assets, capexProjects, typesForForm, providers, saving, onClose, onSave }) {
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  return (
    <div className="ops-report-overlay" onClick={onClose}>
      <div className="ops-report-modal" style={{ maxWidth: 720 }} onClick={e => e.stopPropagation()}>
        <div className="ops-report-head">
          <div>
            <div style={{ fontWeight: 800 }}>{form.id ? 'Editar trabajo' : 'Nuevo trabajo'}</div>
            <div style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: 4 }}>
              {form.kind === 'preventivo' ? 'Mantenimiento preventivo' : 'Mantenimiento correctivo'}
            </div>
          </div>
          <button className="btn-icon" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="ops-report-body" style={{ display: 'grid', gap: 12 }}>
          <div className="field" style={{ margin: 0 }}>
            <div className="field-label">Tipo de orden</div>
            <select className="field-input" value={form.kind || 'correctivo'} onChange={e => set('kind', e.target.value)}>
              <option value="correctivo">Correctivo (reparación)</option>
              <option value="preventivo">Preventivo (rutina)</option>
            </select>
          </div>
          <div className="field" style={{ margin: 0 }}>
            <div className="field-label">Propiedad *</div>
            <select className="field-input" value={form.property} onChange={e => setForm(f => ({ ...f, property: e.target.value, asset: '', space: '' }))}>
              <option value="">Selecciona…</option>
              {properties.map(p => <option key={p.id} value={p.id}>{p.name} · {p.code}</option>)}
            </select>
          </div>
          <SpaceField tenantId={tenantId} propertyId={form.property} value={form.space} onChange={v => set('space', v)} />
          <div className="field" style={{ margin: 0 }}>
            <div className="field-label">Equipo afectado (opcional)</div>
            <select className="field-input" value={form.asset} onChange={e => set('asset', e.target.value)} disabled={!form.property}>
              <option value="">Ninguno</option>
              {assets.map(a => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
            </select>
          </div>
          {(capexProjects || []).length > 0 || form.capex_project ? (
            <div className="field" style={{ margin: 0 }}>
              <div className="field-label">Proyecto CAPEX (opcional)</div>
              <select className="field-input" value={form.capex_project || ''} onChange={e => set('capex_project', e.target.value)}>
                <option value="">Ninguno: es gasto operativo (OPEX)</option>
                {(capexProjects || []).map(p => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
                {form.capex_project && !(capexProjects || []).some(p => p.id === form.capex_project) && <option value={form.capex_project}>Proyecto actual</option>}
              </select>
              <div style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 4 }}>Si eliges un proyecto, el costo de esta orden suma a su inversión y no al OPEX.</div>
            </div>
          ) : null}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="field" style={{ margin: 0 }}>
              <div className="field-label">Categoría de servicio</div>
              <select className="field-input" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value, work_type: '' }))}>
                <option value="">Sin categoría</option>
                {categories.filter(c => c.is_active !== false).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="field" style={{ margin: 0 }}>
              <div className="field-label">Tipo de trabajo</div>
              <select className="field-input" value={form.work_type} onChange={e => {
                const t = typesForForm.find(x => x.id === e.target.value);
                setForm(f => ({
                  ...f,
                  work_type: e.target.value,
                  title: f.title || t?.name || '',
                  frequency: t?.default_frequency || f.frequency,
                }));
              }}>
                <option value="">Selecciona…</option>
                {typesForForm.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          </div>
          <div className="field" style={{ margin: 0 }}>
            <div className="field-label">Título *</div>
            <input className="field-input" value={form.title} onChange={e => set('title', e.target.value)} />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <div className="field-label">Descripción / hallazgo</div>
            <textarea className="field-input" rows={3} value={form.description} onChange={e => set('description', e.target.value)} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div className="field" style={{ margin: 0 }}>
              <div className="field-label">Estatus</div>
              <select className="field-input" value={form.status} onChange={e => set('status', e.target.value)}>
                {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div className="field" style={{ margin: 0 }}>
              <div className="field-label">Prioridad</div>
              <select className="field-input" value={form.priority} onChange={e => set('priority', e.target.value)}>
                {Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="field" style={{ margin: 0 }}>
              <div className="field-label">Frecuencia</div>
              <select className="field-input" value={form.frequency} onChange={e => set('frequency', e.target.value)}>
                {Object.entries(FREQ).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div className="field" style={{ margin: 0 }}>
              <div className="field-label">Fecha programada</div>
              <input type="date" className="field-input" value={form.scheduled_date} onChange={e => set('scheduled_date', e.target.value)} />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <div className="field-label">Realizado</div>
              <input type="date" className="field-input" value={form.performed_date} onChange={e => set('performed_date', e.target.value)} />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <div className="field-label">Próxima fecha</div>
              <input type="date" className="field-input" value={form.next_due_date} onChange={e => set('next_due_date', e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="field" style={{ margin: 0 }}>
              <div className="field-label">Proveedor</div>
              <select className="field-input" value={form.provider} onChange={e => set('provider', e.target.value)}>
                <option value="">Sin proveedor / otro</option>
                {providers.filter(p => p.is_active !== false && p.status !== 'inactivo').map(p => (
                  <option key={p.id} value={p.id}>{p.trade_name || p.name}</option>
                ))}
              </select>
            </div>
            <div className="field" style={{ margin: 0 }}>
              <div className="field-label">Otro proveedor (nombre)</div>
              <input className="field-input" value={form.vendor_name} onChange={e => set('vendor_name', e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div className="field" style={{ margin: 0 }}>
              <div className="field-label">Reportó</div>
              <input className="field-input" value={form.reported_by} onChange={e => set('reported_by', e.target.value)} placeholder="Inquilino, admin…" />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <div className="field-label">Asignado a</div>
              <input className="field-input" value={form.assigned_to} onChange={e => set('assigned_to', e.target.value)} />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <div className="field-label">Costo estimado</div>
              <input className="field-input" type="number" min="0" step="0.01" value={form.estimated_cost} onChange={e => set('estimated_cost', e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div className="field" style={{ margin: 0 }}>
              <div className="field-label">Refacciones / materiales</div>
              <input className="field-input" type="number" min="0" step="0.01" value={form.parts_cost} onChange={e => set('parts_cost', e.target.value)} />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <div className="field-label">Mano de obra</div>
              <input className="field-input" type="number" min="0" step="0.01" value={form.labor_cost} onChange={e => set('labor_cost', e.target.value)} />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <div className="field-label">Costo total real</div>
              <input className="field-input" type="number" min="0" step="0.01" value={form.cost} onChange={e => set('cost', e.target.value)} placeholder="Suma de refacciones + mano de obra" />
            </div>
          </div>
          <div className="field" style={{ margin: 0 }}>
            <div className="field-label">Lista de verificación (un paso por línea)</div>
            <textarea className="field-input" rows={3}
              value={(form.checklist || []).map(c => c.label).join('\n')}
              onChange={e => {
                const prev = form.checklist || [];
                set('checklist', e.target.value.split('\n').map((label, i) => ({ label, done: !!prev[i]?.done })));
              }} />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <div className="field-label">Notas de lo realizado</div>
            <textarea className="field-input" rows={2} value={form.work_notes} onChange={e => set('work_notes', e.target.value)} />
          </div>
        </div>
        <div className="ops-report-foot">
          <button className="btn btn-outline" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={saving} onClick={onSave}>{saving ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </div>
    </div>
  );
}

function DetailModal({ work, tenantId, canWrite, canOperate, onClose, onReload }) {
  const [kind, setKind] = useState('despues');
  const [uploading, setUploading] = useState(false);

  const upload = async (file) => {
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('kind', kind);
    fd.append('captured_at', todayISO());
    setUploading(true);
    try {
      await rentalAPI.maintenance.addEvidence(tenantId, work.id, fd);
      toast.success('Evidencia cargada');
      onReload();
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo subir'));
    } finally {
      setUploading(false);
    }
  };

  const removeEv = async (ev) => {
    if (!window.confirm('¿Eliminar esta evidencia?')) return;
    try {
      await rentalAPI.maintenance.removeEvidence(tenantId, work.id, ev.id);
      onReload();
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo eliminar'));
    }
  };

  return (
    <div className="ops-report-overlay" onClick={onClose}>
      <div className="ops-report-modal" style={{ maxWidth: 720 }} onClick={e => e.stopPropagation()}>
        <div className="ops-report-head">
          <div>
            <div style={{ fontFamily: 'monospace', fontWeight: 800, color: 'var(--teal-700)' }}>{work.folio}</div>
            <div style={{ fontWeight: 800, marginTop: 4 }}>{work.title}</div>
            <div style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: 4 }}>
              {work.property_name} · {work.property_code}{work.space_code ? ` / ${work.space_code}` : ''}
            </div>
          </div>
          <button className="btn-icon" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="ops-report-body">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            <Pill value={work.status} />
            <span className="proj-chip">{work.kind === 'preventivo' ? 'Preventivo' : 'Correctivo'}</span>
            {work.category_name && <span className="proj-chip">{work.category_name}</span>}
            <Chip map={PRIO_CHIP} value={work.priority} />
            {work.sla_state && <Chip map={SLA_STATE} value={work.sla_state} />}
            {work.plan_name && <span className="proj-chip">Plan: {work.plan_name}</span>}
            {work.request_folio && <span className="proj-chip">Solicitud {work.request_folio}</span>}
            {work.inspection_folio && <span className="proj-chip">Inspección {work.inspection_folio}</span>}
          </div>
          {work.asset_name && <div style={{ fontSize: 13, marginBottom: 10 }}><b>Equipo:</b> {work.asset_code} · {work.asset_name}</div>}
          {work.description && <p style={{ fontSize: 14, lineHeight: 1.55, margin: '0 0 12px' }}>{work.description}</p>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 13, marginBottom: 16 }}>
            <div><Calendar size={13} /> Programado: {fmtDate(work.scheduled_date)}</div>
            <div>Realizado: {fmtDate(work.performed_date)}</div>
            <div>Próxima: {fmtDate(work.next_due_date)}</div>
            <div>Límite SLA: {fmtDT(work.due_at)}</div>
            <div>Inicio: {fmtDT(work.started_at)} · Fin: {fmtDT(work.completed_at)}</div>
            <div>Costo estimado: {money(work.estimated_cost)}</div>
            <div>Costo real: {money(work.cost)} <span style={{ color: 'var(--ink-400)', fontSize: 11 }}>(refacc. {money(work.parts_cost)} · M.O. {money(work.labor_cost)})</span></div>
            <div><User size={13} /> Reportó: {work.reported_by || '—'}</div>
            <div>Asignado: {work.assigned_to || work.provider_name || '—'}</div>
          </div>
          {work.work_notes && (
            <div className="card" style={{ padding: 12, marginBottom: 14 }}>
              <div className="field-label">Lo realizado</div>
              <div style={{ fontSize: 13 }}>{work.work_notes}</div>
            </div>
          )}
          {(work.checklist || []).length > 0 && (
            <div className="card" style={{ padding: 12, marginBottom: 14 }}>
              <div className="field-label">Lista de verificación · {(work.checklist || []).filter(c => c.done).length}/{work.checklist.length}</div>
              {work.checklist.map((c, i) => (
                <label key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, padding: '3px 0', textDecoration: c.done ? 'line-through' : 'none', color: c.done ? 'var(--ink-400)' : undefined }}>
                  <input type="checkbox" checked={!!c.done} disabled={!canOperate || work.status === 'cancelado'} onChange={async () => {
                    try {
                      const next = work.checklist.map((x, j) => (j === i ? { ...x, done: !x.done } : x));
                      await rentalAPI.maintenance.update(tenantId, work.id, { checklist: next });
                      onReload();
                    } catch (e) { toast.error(errMsg(e, 'No se pudo actualizar')); }
                  }} />
                  {c.label}
                </label>
              ))}
            </div>
          )}
          <h4 style={{ margin: '0 0 10px' }}>Evidencias</h4>
          {(work.evidences || []).length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--ink-400)', marginBottom: 10 }}>Aún no hay evidencias.</div>
          )}
          <div style={{ display: 'grid', gap: 8, marginBottom: 14 }}>
            {(work.evidences || []).map(ev => (
              <div key={ev.id} className="card" style={{ padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{ev.original_name || 'Archivo'}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>{EV_KIND[ev.kind] || ev.kind} · {fmtDate(ev.captured_at)}</div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {ev.file_url && (
                    <a className="btn btn-outline btn-sm" href={ev.file_url} target="_blank" rel="noreferrer" onClick={async (e) => {
                      e.preventDefault();
                      const res = await api.get(ev.file_url, { responseType: 'blob' });
                      const url = URL.createObjectURL(res.data);
                      window.open(url, '_blank');
                    }}><ImageIcon size={13} /> Ver</a>
                  )}
                  {canOperate && <button className="btn-icon" style={{ color: 'var(--coral-500)' }} onClick={() => removeEv(ev)}><Trash2 size={14} /></button>}
                </div>
              </div>
            ))}
          </div>
          {canOperate && work.status !== 'cancelado' && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <select className="field-input" style={{ maxWidth: 140 }} value={kind} onChange={e => setKind(e.target.value)}>
                {Object.entries(EV_KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <label className="btn btn-outline btn-sm">
                <Upload size={13} /> {uploading ? 'Subiendo…' : 'Cargar evidencia'}
                <input type="file" hidden onChange={e => upload(e.target.files?.[0])} />
              </label>
            </div>
          )}
        </div>
        <div className="ops-report-foot">
          <button className="btn btn-outline" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}

const EMPTY_PROVIDER = {
  name: '', trade_name: '', person_type: 'moral', contact_name: '',
  email: '', phone: '', rfc: '', notes: '', category_ids: [], status: 'activo',
};

function ProvidersPanel({ providers, categories, canWrite, onReload, modal, setModal }) {
  const { tenantId } = useAuth();
  const [form, setForm] = useState({ ...EMPTY_PROVIDER });
  const [saving, setSaving] = useState(false);
  const [askFor, setAskFor] = useState(null);
  const [dossierId, setDossierId] = useState(null);

  useEffect(() => {
    if (modal === 'provider-new') {
      setForm({ ...EMPTY_PROVIDER });
    }
  }, [modal]);

  const open = (p) => {
    setForm(p ? { ...EMPTY_PROVIDER, ...p, category_ids: p.category_ids || [] } : { ...EMPTY_PROVIDER });
    setModal('provider');
  };

  const openExpediente = async (p) => {
    try {
      if (!p.has_expediente) {
        await rentalAPI.maintenance.providers.openExpediente(tenantId, p.id);
        onReload();
      }
      setDossierId(p.id);
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo abrir el expediente'));
    }
  };

  const save = async () => {
    if (!form.name.trim()) return toast.error('El nombre es obligatorio');
    setSaving(true);
    try {
      const payload = {
        name: form.name, trade_name: form.trade_name, person_type: form.person_type,
        contact_name: form.contact_name, email: form.email, phone: form.phone,
        rfc: form.rfc, notes: form.notes, category_ids: form.category_ids, status: form.status,
      };
      if (form.id) {
        await rentalAPI.maintenance.providers.update(tenantId, form.id, payload);
        toast.success('Proveedor guardado');
        setModal(null);
        onReload();
      } else {
        const r = await rentalAPI.maintenance.providers.create(tenantId, payload);
        toast.success('Proveedor guardado');
        setModal(null);
        onReload();
        setAskFor(r.data);
      }
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo guardar'));
    } finally { setSaving(false); }
  };

  const remove = async (p) => {
    if (!window.confirm(`¿Eliminar a ${p.name}?`)) return;
    try {
      await rentalAPI.maintenance.providers.remove(tenantId, p.id);
      onReload();
    } catch (e) { toast.error(errMsg(e, 'No se pudo eliminar')); }
  };

  return (
    <>
      <div className="card">
        {!providers.length ? (
          <div style={{ padding: 36, textAlign: 'center', color: 'var(--ink-400)' }}>Aún no hay proveedores. Agrégalos para asignarlos a los trabajos.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Proveedor</th><th>Contacto</th><th>Servicios</th><th>Expediente</th><th>Estatus</th><th></th></tr>
              </thead>
              <tbody>
                {providers.map(p => (
                  <tr key={p.id}>
                    <td>
                      <div style={{ fontWeight: 700 }}>{p.trade_name || p.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>
                        {p.person_type === 'fisica' ? 'Persona física' : 'Persona moral'}
                        {p.trade_name ? ` · ${p.name}` : ''}
                      </div>
                    </td>
                    <td style={{ fontSize: 12 }}>
                      <div>{p.contact_name || '—'}</div>
                      <div style={{ color: 'var(--ink-400)' }}>{p.phone || p.email}</div>
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {(p.category_ids || []).map(id => categories.find(c => c.id === id)?.name).filter(Boolean).join(', ') || '—'}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <span className="proj-chip" style={{
                          color: p.has_expediente ? 'var(--teal-700)' : 'var(--ink-500)',
                          background: p.has_expediente ? 'var(--teal-50)' : 'var(--sand-50)',
                        }}>{p.has_expediente ? 'Expediente' : 'Sin expediente'}</span>
                        {p.is_repse && (
                          <span className="proj-chip" style={{ color: '#1d4ed8', background: '#eff6ff' }}>
                            REPSE {p.repse_status === 'vigente' ? 'vigente' : p.repse_status === 'vencido' ? 'vencido' : ''}
                          </span>
                        )}
                      </div>
                    </td>
                    <td><span className="proj-chip">{p.status === 'activo' ? 'Activo' : 'Inactivo'}</span></td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button
                        className="btn-icon"
                        title={p.has_expediente ? 'Abrir expediente' : 'Crear expediente digital'}
                        onClick={() => (p.has_expediente ? setDossierId(p.id) : canWrite ? setAskFor(p) : null)}
                      >
                        <FolderOpen size={14} color={p.has_expediente ? 'var(--teal-600)' : 'var(--ink-400)'} />
                      </button>
                      {canWrite && <button className="btn-icon" onClick={() => open(p)}><Pencil size={14} /></button>}
                      {canWrite && <button className="btn-icon" style={{ color: 'var(--coral-500)' }} onClick={() => remove(p)}><Trash2 size={14} /></button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {(modal === 'provider' || modal === 'provider-new') && (
        <div className="ops-report-overlay" onClick={() => setModal(null)}>
          <div className="ops-report-modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
            <div className="ops-report-head">
              <div style={{ fontWeight: 800 }}>{form.id ? 'Editar proveedor' : 'Nuevo proveedor'}</div>
              <button className="btn-icon" onClick={() => setModal(null)}><X size={18} /></button>
            </div>
            <div className="ops-report-body" style={{ display: 'grid', gap: 12 }}>
              <div className="field" style={{ margin: 0 }}>
                <div className="field-label">Tipo de persona</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[['moral', 'Persona moral'], ['fisica', 'Persona física']].map(([k, label]) => (
                    <button
                      key={k}
                      type="button"
                      className={`btn btn-sm ${form.person_type === k ? 'btn-primary' : 'btn-outline'}`}
                      onClick={() => setForm(f => ({ ...f, person_type: k }))}
                    >{label}</button>
                  ))}
                </div>
              </div>
              <div className="field" style={{ margin: 0 }}>
                <div className="field-label">{form.person_type === 'fisica' ? 'Nombre completo *' : 'Razón social *'}</div>
                <input className="field-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <div className="field-label">Nombre comercial</div>
                <input className="field-input" value={form.trade_name} onChange={e => setForm(f => ({ ...f, trade_name: e.target.value }))} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="field" style={{ margin: 0 }}>
                  <div className="field-label">Contacto</div>
                  <input className="field-input" value={form.contact_name} onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))} />
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <div className="field-label">Teléfono</div>
                  <input className="field-input" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="field" style={{ margin: 0 }}>
                  <div className="field-label">Correo</div>
                  <input className="field-input" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <div className="field-label">RFC</div>
                  <input className="field-input" value={form.rfc} onChange={e => setForm(f => ({ ...f, rfc: e.target.value }))} />
                </div>
              </div>
              <div className="field" style={{ margin: 0 }}>
                <div className="field-label">Servicios que cubre</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {categories.map(c => {
                    const on = (form.category_ids || []).includes(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        className={`btn btn-sm ${on ? 'btn-primary' : 'btn-outline'}`}
                        onClick={() => setForm(f => ({
                          ...f,
                          category_ids: on ? f.category_ids.filter(x => x !== c.id) : [...(f.category_ids || []), c.id],
                        }))}
                      >{c.name}</button>
                    );
                  })}
                </div>
              </div>
              <div className="field" style={{ margin: 0 }}>
                <div className="field-label">Notas</div>
                <textarea className="field-input" rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
            <div className="ops-report-foot">
              {form.id && !form.has_expediente && canWrite && (
                <button className="btn btn-outline" type="button" onClick={() => { setModal(null); setAskFor(form); }}>
                  Crear expediente
                </button>
              )}
              {form.id && form.has_expediente && (
                <button className="btn btn-outline" type="button" onClick={() => { setModal(null); setDossierId(form.id); }}>
                  Ver expediente
                </button>
              )}
              <button className="btn btn-outline" onClick={() => setModal(null)}>Cancelar</button>
              <button className="btn btn-primary" disabled={saving} onClick={save}>{saving ? 'Guardando…' : 'Guardar'}</button>
            </div>
          </div>
        </div>
      )}
      {askFor && (
        <AskExpedienteModal
          provider={askFor}
          onNo={() => setAskFor(null)}
          onYes={async () => {
            const p = askFor;
            setAskFor(null);
            await openExpediente(p);
          }}
        />
      )}
      {dossierId && (
        <RentalProviderExpediente
          tenantId={tenantId}
          providerId={dossierId}
          canWrite={canWrite}
          onClose={() => setDossierId(null)}
          onChanged={onReload}
        />
      )}
    </>
  );
}

function CatalogsPanel({ tenantId, categories, workTypes, canWrite, onReload }) {
  const addCategory = async () => {
    const name = window.prompt('Nombre de la categoría de servicio');
    if (!name) return;
    try {
      await rentalAPI.maintenance.categories.create(tenantId, { name });
      onReload();
    } catch (e) { toast.error(errMsg(e, 'No se pudo crear')); }
  };
  const addType = async () => {
    if (!categories.length) return toast.error('Crea una categoría primero');
    const name = window.prompt('Nombre del tipo de trabajo');
    if (!name) return;
    try {
      await rentalAPI.maintenance.workTypes.create(tenantId, { name, category: categories[0].id, kind: 'ambos' });
      onReload();
    } catch (e) { toast.error(errMsg(e, 'No se pudo crear')); }
  };
  const removeCat = async (c) => {
    if (!window.confirm(`¿Eliminar ${c.name}?`)) return;
    try { await rentalAPI.maintenance.categories.remove(tenantId, c.id); onReload(); }
    catch (e) { toast.error(errMsg(e, 'No se pudo eliminar')); }
  };
  const removeType = async (t) => {
    if (!window.confirm(`¿Eliminar ${t.name}?`)) return;
    try { await rentalAPI.maintenance.workTypes.remove(tenantId, t.id); onReload(); }
    catch (e) { toast.error(errMsg(e, 'No se pudo eliminar')); }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 16 }}>
      <div className="card">
        <div className="card-head">
          <h3>Categorías de servicio</h3>
          {canWrite && <button className="btn btn-outline btn-sm" onClick={addCategory}><Plus size={13} /> Agregar</button>}
        </div>
        {(categories || []).map(c => (
          <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 16px', borderTop: '1px solid var(--sand-100)' }}>
            <span style={{ fontWeight: 600 }}>{c.name}</span>
            {canWrite && <button className="btn-icon" style={{ color: 'var(--coral-500)' }} onClick={() => removeCat(c)}><Trash2 size={13} /></button>}
          </div>
        ))}
      </div>
      <div className="card">
        <div className="card-head">
          <h3>Tipos de trabajo</h3>
          {canWrite && <button className="btn btn-outline btn-sm" onClick={addType}><Plus size={13} /> Agregar</button>}
        </div>
        {(workTypes || []).map(t => (
          <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 16px', borderTop: '1px solid var(--sand-100)', gap: 10 }}>
            <div>
              <div style={{ fontWeight: 600 }}>{t.name}</div>
              <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>{t.category_name} · {t.kind}</div>
            </div>
            {canWrite && <button className="btn-icon" style={{ color: 'var(--coral-500)' }} onClick={() => removeType(t)}><Trash2 size={13} /></button>}
          </div>
        ))}
      </div>
    </div>
  );
}
