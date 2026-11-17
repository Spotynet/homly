import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { CalendarClock, Pause, Pencil, Play, Plus, Trash2, Zap } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTenantAccess } from '../../context/TenantAccessContext';
import { rentalAPI } from '../../api/client';
import {
  Chip, Empty, errMsg, Field, fmtD, Grid, Modal, money, PageHead, PRIORITY, SearchBar, Stat, todayISO,
} from './opsUi';
import { useSearchParams } from 'react-router-dom';
import SpaceField, { SpaceFilter, spacePayload } from './SpaceField';

const FREQ = {
  semanal: 'Semanal', quincenal: 'Quincenal', mensual: 'Mensual', bimestral: 'Bimestral',
  trimestral: 'Trimestral', semestral: 'Semestral', anual: 'Anual',
};
const STATE = {
  vencido: { label: 'Vencido', color: 'var(--coral-600)', bg: 'var(--coral-50)' },
  proximo: { label: 'Próximo', color: 'var(--amber-700)', bg: 'var(--amber-50)' },
  al_dia: { label: 'Al día', color: 'var(--teal-700)', bg: 'var(--teal-50)' },
  pausado: { label: 'Pausado', color: 'var(--ink-600)', bg: 'var(--sand-100)' },
};
const TEMPLATES = [
  { name: 'Mantenimiento de aire acondicionado', frequency: 'semestral', checklist: ['Limpiar filtros', 'Revisar nivel de gas', 'Limpiar condensadora', 'Revisar drenaje'] },
  { name: 'Revisión de extintores', frequency: 'anual', checklist: ['Verificar carga y fecha', 'Revisar sellos y manguera', 'Señalización visible'] },
  { name: 'Limpieza de cisterna y tinacos', frequency: 'semestral', checklist: ['Vaciar y lavar', 'Desinfectar', 'Revisar flotadores'] },
  { name: 'Fumigación', frequency: 'trimestral', checklist: ['Aplicación interior', 'Aplicación exterior', 'Constancia del proveedor'] },
  { name: 'Revisión eléctrica y tableros', frequency: 'anual', checklist: ['Apriete de conexiones', 'Prueba de interruptores', 'Termografía visual'] },
  { name: 'Revisión de impermeabilizante', frequency: 'anual', checklist: ['Inspeccionar grietas', 'Limpiar coladeras', 'Resanar si aplica'] },
];
const EMPTY = {
  name: '', property: '', space: '', asset: '', category: '', provider: '', priority: 'media', frequency: 'mensual',
  start_date: todayISO(), next_due_date: '', lead_days: 3, estimated_cost: '', assigned_to: '',
  description: '', checklist: [], auto_generate: true, is_active: true,
};

export default function RentalPreventivo() {
  const { tenantId } = useAuth();
  const { can } = useTenantAccess();
  const canWrite = can('rentas_preventivo');
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({});
  const [properties, setProperties] = useState([]);
  const [categories, setCategories] = useState([]);
  const [providers, setProviders] = useState([]);
  const [assets, setAssets] = useState([]);
  const [urlParams] = useSearchParams();
  const [filters, setFilters] = useState({ q: '', property: urlParams.get('property') || '', space: urlParams.get('space') || '', active: '1' });
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
    const [list, sum] = await Promise.all([
      rentalAPI.ops.plans.list(tenantId, params),
      rentalAPI.ops.plans.summary(tenantId),
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
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    setLoading(true);
    load().catch(() => toast.error('No se pudieron cargar los planes')).finally(() => setLoading(false));
  }, [load, tenantId]);

  useEffect(() => {
    if (!form?.property) { setAssets([]); return; }
    rentalAPI.ops.assets.list(tenantId, { property: form.property, active: 1 })
      .then(r => setAssets(r.data || [])).catch(() => setAssets([]));
  }, [form?.property, tenantId]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.name.trim()) return toast.error('Dale un nombre al plan');
    if (!form.property) return toast.error('Selecciona el inmueble');
    if (!form.start_date) return toast.error('Indica la fecha de inicio');
    setSaving(true);
    try {
      const payload = {
        ...form,
        ...spacePayload(form),
        asset: form.asset || null, category: form.category || null, provider: form.provider || null,
        estimated_cost: form.estimated_cost === '' ? 0 : form.estimated_cost,
        lead_days: Number(form.lead_days) || 0,
        checklist: (form.checklist || []).filter(x => String(x).trim()),
      };
      if (!payload.next_due_date) delete payload.next_due_date;
      if (form.id) await rentalAPI.ops.plans.update(tenantId, form.id, payload);
      else await rentalAPI.ops.plans.create(tenantId, payload);
      toast.success(form.id ? 'Plan actualizado' : 'Plan creado');
      setForm(null);
      load();
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo guardar'));
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (p) => {
    try {
      await rentalAPI.ops.plans.update(tenantId, p.id, { is_active: !p.is_active });
      load();
    } catch (e) { toast.error(errMsg(e, 'No se pudo actualizar')); }
  };

  const remove = async (p) => {
    if (!window.confirm(`¿Eliminar el plan "${p.name}"? Las órdenes ya generadas se conservan.`)) return;
    try {
      await rentalAPI.ops.plans.remove(tenantId, p.id);
      toast.success('Plan eliminado');
      load();
    } catch (e) { toast.error(errMsg(e, 'No se pudo eliminar')); }
  };

  const generateAll = async () => {
    setBusy(true);
    try {
      const { data } = await rentalAPI.ops.plans.generateDue(tenantId);
      toast.success(data.created ? `${data.created} orden(es) generada(s): ${data.folios.join(', ')}` : 'No hay órdenes pendientes por generar');
      load();
    } catch (e) { toast.error(errMsg(e, 'No se pudieron generar')); }
    finally { setBusy(false); }
  };

  const generateOne = async (p) => {
    setBusy(true);
    try {
      const { data } = await rentalAPI.ops.plans.generate(tenantId, p.id);
      toast.success(`Orden ${data.folio} generada`);
      load();
    } catch (e) { toast.error(errMsg(e, 'No se pudo generar')); }
    finally { setBusy(false); }
  };

  const edit = (p) => setForm({
    ...EMPTY, ...p, space: p.space || '', asset: p.asset || '', category: p.category || '', provider: p.provider || '',
    estimated_cost: p.estimated_cost ?? '', checklist: p.checklist || [],
  });

  return (
    <div className="content-fade">
      <PageHead
        title="Mantenimiento preventivo"
        subtitle="Planes recurrentes por inmueble o equipo. Homly genera las órdenes de trabajo automáticamente antes de cada vencimiento."
      >
        {canWrite && (
          <>
            <button className="btn btn-outline" disabled={busy} onClick={generateAll}><Zap size={15} /> Generar órdenes pendientes</button>
            <button className="btn btn-primary" onClick={() => setForm({ ...EMPTY, start_date: todayISO() })}><Plus size={15} /> Nuevo plan</button>
          </>
        )}
      </PageHead>

      <div className="cob-stats" style={{ marginBottom: 16 }}>
        <Stat label="Planes activos" value={summary.activos || 0} />
        <Stat label="Vencidos" value={summary.vencidos || 0} tone={summary.vencidos ? 'bad' : ''} sub="Sin generar orden" />
        <Stat label="Próximos 7 días" value={summary.proximos_7 || 0} tone={summary.proximos_7 ? 'warn' : ''} />
        <Stat label="Total de planes" value={summary.total || 0} />
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <SearchBar value={filters.q} onChange={v => setFilters(f => ({ ...f, q: v }))} placeholder="Buscar plan o inmueble" />
        <select className="field-input" style={{ maxWidth: 200 }} value={filters.property} onChange={e => setFilters(f => ({ ...f, property: e.target.value, space: '' }))}>
          <option value="">Todos los inmuebles</option>
          {properties.map(p => <option key={p.id} value={p.id}>{p.name} · {p.code}</option>)}
        </select>
        <SpaceFilter tenantId={tenantId} propertyId={filters.property} value={filters.space} onChange={v => setFilters(f => ({ ...f, space: v }))} />
        <select className="field-input" style={{ maxWidth: 150 }} value={filters.active} onChange={e => setFilters(f => ({ ...f, active: e.target.value }))}>
          <option value="1">Activos</option>
          <option value="0">Pausados</option>
          <option value="">Todos</option>
        </select>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-400)' }}>Cargando planes…</div>
      ) : rows.length === 0 ? (
        <Empty icon={CalendarClock} text="Aún no hay planes preventivos. Crea uno para automatizar las rutinas del portafolio.">
          {canWrite && <div style={{ marginTop: 12 }}><button className="btn btn-primary btn-sm" onClick={() => setForm({ ...EMPTY, start_date: todayISO() })}>Crear mi primer plan</button></div>}
        </Empty>
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Plan</th><th>Inmueble / equipo</th><th>Frecuencia</th><th>Próxima</th><th>Estado</th><th>Costo est.</th><th></th></tr>
              </thead>
              <tbody>
                {rows.map(p => (
                  <tr key={p.id}>
                    <td>
                      <div style={{ fontWeight: 700 }}>{p.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>
                        {p.auto_generate ? `Auto · ${p.lead_days} día(s) antes` : 'Manual'}{p.checklist?.length ? ` · ${p.checklist.length} pasos` : ''}
                      </div>
                    </td>
                    <td>
                      <div>{p.property_name}</div>
                      <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>{p.property_code}{p.space_code ? ` / ${p.space_code}` : ''}{p.asset_name ? ` · ${p.asset_code} ${p.asset_name}` : ''}</div>
                    </td>
                    <td>{p.frequency_label}<div style={{ marginTop: 4 }}><Chip map={PRIORITY} value={p.priority} /></div></td>
                    <td>
                      {fmtD(p.next_due_date)}
                      <div style={{ fontSize: 11, color: p.days_until < 0 ? 'var(--coral-600)' : 'var(--ink-400)' }}>
                        {p.days_until < 0 ? `${Math.abs(p.days_until)} día(s) de retraso` : p.days_until === 0 ? 'Hoy' : `En ${p.days_until} día(s)`}
                      </div>
                    </td>
                    <td>
                      <Chip map={STATE} value={p.state} />
                      {p.open_orders > 0 && <div style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 4 }}>{p.open_orders} orden(es) abierta(s)</div>}
                    </td>
                    <td>{money(p.estimated_cost)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {canWrite && p.is_active && <button className="btn-icon" title="Generar orden ahora" disabled={busy} onClick={() => generateOne(p)}><Zap size={14} /></button>}
                      {canWrite && <button className="btn-icon" title={p.is_active ? 'Pausar' : 'Reanudar'} onClick={() => toggle(p)}>{p.is_active ? <Pause size={14} /> : <Play size={14} />}</button>}
                      {canWrite && <button className="btn-icon" onClick={() => edit(p)}><Pencil size={14} /></button>}
                      {canWrite && <button className="btn-icon" style={{ color: 'var(--coral-500)' }} onClick={() => remove(p)}><Trash2 size={14} /></button>}
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
          title={form.id ? 'Editar plan preventivo' : 'Nuevo plan preventivo'} onClose={() => setForm(null)}
          footer={<>
            <button className="btn btn-outline" onClick={() => setForm(null)}>Cancelar</button>
            <button className="btn btn-primary" disabled={saving} onClick={save}>{saving ? 'Guardando…' : 'Guardar'}</button>
          </>}
        >
          {!form.id && (
            <div>
              <div className="field-label">Empezar desde una plantilla</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {TEMPLATES.map(t => (
                  <button key={t.name} type="button" className="proj-chip" style={{ cursor: 'pointer', border: '1px solid var(--sand-200)' }}
                    onClick={() => setForm(f => ({ ...f, name: t.name, frequency: t.frequency, checklist: t.checklist }))}>
                    {t.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <Field label="Nombre del plan *">
            <input className="field-input" value={form.name} onChange={e => set('name', e.target.value)} />
          </Field>
          <Grid>
            <Field label="Inmueble *">
              <select className="field-input" value={form.property} onChange={e => setForm(f => ({ ...f, property: e.target.value, asset: '', space: '' }))} disabled={!!form.id}>
                <option value="">Selecciona…</option>
                {properties.map(p => <option key={p.id} value={p.id}>{p.name} · {p.code}</option>)}
              </select>
            </Field>
            <SpaceField tenantId={tenantId} propertyId={form.property} value={form.space} onChange={v => set('space', v)} />
            <Field label="Equipo (opcional)">
              <select className="field-input" value={form.asset} onChange={e => set('asset', e.target.value)} disabled={!form.property}>
                <option value="">Todo el inmueble</option>
                {assets.map(a => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
              </select>
            </Field>
          </Grid>
          <Grid cols={3}>
            <Field label="Frecuencia">
              <select className="field-input" value={form.frequency} onChange={e => set('frequency', e.target.value)}>
                {Object.entries(FREQ).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field label={form.id ? 'Próxima fecha' : 'Fecha de inicio *'}>
              <input type="date" className="field-input"
                value={form.id ? (form.next_due_date || '') : form.start_date}
                onChange={e => (form.id ? set('next_due_date', e.target.value) : set('start_date', e.target.value))} />
            </Field>
            <Field label="Generar con anticipación (días)">
              <input type="number" min="0" max="60" className="field-input" value={form.lead_days} onChange={e => set('lead_days', e.target.value)} />
            </Field>
          </Grid>
          <Grid cols={3}>
            <Field label="Prioridad">
              <select className="field-input" value={form.priority} onChange={e => set('priority', e.target.value)}>
                {Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </Field>
            <Field label="Categoría">
              <select className="field-input" value={form.category} onChange={e => set('category', e.target.value)}>
                <option value="">Sin categoría</option>
                {categories.filter(c => c.is_active !== false).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Costo estimado">
              <input type="number" min="0" step="0.01" className="field-input" value={form.estimated_cost} onChange={e => set('estimated_cost', e.target.value)} />
            </Field>
          </Grid>
          <Grid>
            <Field label="Proveedor">
              <select className="field-input" value={form.provider} onChange={e => set('provider', e.target.value)}>
                <option value="">Sin asignar</option>
                {providers.filter(p => p.is_active !== false).map(p => <option key={p.id} value={p.id}>{p.trade_name || p.name}</option>)}
              </select>
            </Field>
            <Field label="Responsable interno">
              <input className="field-input" value={form.assigned_to} onChange={e => set('assigned_to', e.target.value)} />
            </Field>
          </Grid>
          <Field label="Lista de verificación" hint="Un paso por línea. Se copia a cada orden generada.">
            <textarea className="field-input" rows={4} value={(form.checklist || []).join('\n')}
              onChange={e => set('checklist', e.target.value.split('\n'))} />
          </Field>
          <Field label="Descripción">
            <textarea className="field-input" rows={2} value={form.description} onChange={e => set('description', e.target.value)} />
          </Field>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
            <input type="checkbox" checked={form.auto_generate} onChange={e => set('auto_generate', e.target.checked)} />
            Generar órdenes automáticamente cada día a las 6:00
          </label>
        </Modal>
      )}
    </div>
  );
}
