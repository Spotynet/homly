import React, { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  CalendarClock, CheckSquare, ClipboardList, LayoutGrid, List, Pencil, Plus, Trash2, Wrench,
} from 'lucide-react';
import { rentalAPI } from '../../api/client';
import { Empty, errMsg, Field, fmtD, Grid, Modal, SearchBar, todayISO } from './opsUi';
import {
  BOARD_COLS, BudgetBar, CAPEX_CATEGORIES, COLORS, compact, HealthBadge, HEALTH, mon, num, PRIORITIES,
  PROJECT_STATUS, Progress, StatusChip, Timeline,
} from './capexUi';
import ExpenseModal from './CapexExpenseModal';
import SpaceField, { SpaceFilter } from './SpaceField';

const EMPTY = {
  name: '', description: '', category: 'equipamiento', status: 'propuesta', priority: 'media',
  property: '', space: '', asset: '', owner_name: '', approved_by: '', budget_amount: '', start_date: '', end_date: '',
  justification: '', expected_annual_benefit: '',
};

/* ───────────────────────── Tracker (tablero / lista) ───────────────────────── */
export default function ProjectsTab({ tenantId, canWrite, projects, properties, assets, providers, reload, openId, onOpen, prefill, onPrefillUsed }) {
  const [view, setView] = useState('board');
  const [filters, setFilters] = useState({ q: '', property: '', space: '', category: '', health: '', status: '' });
  const [form, setForm] = useState(null);

  useEffect(() => {
    if (prefill) {
      setForm({ ...EMPTY, ...prefill });
      onPrefillUsed?.();
    }
  }, [prefill]); // eslint-disable-line react-hooks/exhaustive-deps

  const f = (k, v) => setFilters(s => ({ ...s, [k]: v }));
  const rows = useMemo(() => projects.filter(p => {
    if (filters.property && p.property !== filters.property) return false;
    if (filters.space && p.space !== filters.space) return false;
    if (filters.category && p.category !== filters.category) return false;
    if (filters.health && p.health !== filters.health) return false;
    if (filters.status && p.status !== filters.status) return false;
    const q = filters.q.trim().toLowerCase();
    return !q || `${p.code} ${p.name} ${p.owner_name} ${p.property_code} ${p.space_code || ''}`.toLowerCase().includes(q);
  }), [projects, filters]);

  const totalBudget = rows.filter(p => !['cancelado'].includes(p.status)).reduce((s, p) => s + num(p.budget_amount), 0);

  return (
    <>
      <div className="card" style={{ marginBottom: 14, padding: 12 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <SearchBar value={filters.q} onChange={v => f('q', v)} placeholder="Buscar proyecto, responsable o propiedad…" />
          <select className="field-select" style={{ maxWidth: 170 }} value={filters.property} onChange={e => setFilters(s => ({ ...s, property: e.target.value, space: '' }))}>
            <option value="">Todas las propiedades</option>
            {properties.map(p => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
          </select>
          <SpaceFilter tenantId={tenantId} propertyId={filters.property} value={filters.space} onChange={v => f('space', v)} style={{ maxWidth: 170 }} />
          <select className="field-select" style={{ maxWidth: 170 }} value={filters.category} onChange={e => f('category', e.target.value)}>
            <option value="">Todas las categorías</option>
            {Object.entries(CAPEX_CATEGORIES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <select className="field-select" style={{ maxWidth: 140 }} value={filters.health} onChange={e => f('health', e.target.value)}>
            <option value="">Toda salud</option>
            {Object.entries(HEALTH).map(([k, h]) => <option key={k} value={k}>{h.label}</option>)}
          </select>
          {view === 'list' && (
            <select className="field-select" style={{ maxWidth: 150 }} value={filters.status} onChange={e => f('status', e.target.value)}>
              <option value="">Todos los estados</option>
              {Object.entries(PROJECT_STATUS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
            </select>
          )}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            <button className={`btn btn-sm ${view === 'board' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setView('board')}><LayoutGrid size={13} /> Tablero</button>
            <button className={`btn btn-sm ${view === 'list' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setView('list')}><List size={13} /> Lista</button>
            {canWrite && <button className="btn btn-primary btn-sm" onClick={() => setForm({ ...EMPTY })}><Plus size={13} /> Nuevo proyecto</button>}
          </div>
        </div>
        <div style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: 8 }}>
          {rows.length} proyecto(s) · presupuesto total {mon(totalBudget)}
        </div>
      </div>

      {projects.length === 0 ? (
        <Empty icon={ClipboardList} text="Aún no hay proyectos CAPEX. Registra tu primera inversión para darle seguimiento de presupuesto, avance y retorno.">
          {canWrite && <div style={{ marginTop: 12 }}><button className="btn btn-primary" onClick={() => setForm({ ...EMPTY })}><Plus size={14} /> Crear proyecto</button></div>}
        </Empty>
      ) : view === 'board' ? (
        <div className="cx-board">
          {BOARD_COLS.map(col => {
            const list = rows.filter(p => p.status === col);
            const sum = list.reduce((s, p) => s + num(p.budget_amount), 0);
            const st = PROJECT_STATUS[col];
            return (
              <div key={col} className="cx-col">
                <div className="cx-col-head">
                  <span style={{ width: 9, height: 9, borderRadius: 99, background: st.dot }} />
                  <b>{st.label}</b>
                  <span className="cx-count">{list.length}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--ink-400)', fontWeight: 700 }}>{compact(sum)}</span>
                </div>
                <div className="cx-col-body">
                  {list.map(p => <ProjectCard key={p.id} p={p} onClick={() => onOpen(p.id)} />)}
                  {list.length === 0 && <div style={{ fontSize: 12, color: 'var(--ink-400)', textAlign: 'center', padding: '14px 4px' }}>Sin proyectos</div>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card" style={{ overflowX: 'auto' }}>
          <table className="table" style={{ minWidth: 860 }}>
            <thead>
              <tr><th>Proyecto</th><th>Estado</th><th>Salud</th><th style={{ width: 210 }}>Presupuesto</th><th style={{ width: 120 }}>Avance</th><th>Fin plan</th><th>Responsable</th></tr>
            </thead>
            <tbody>
              {rows.map(p => (
                <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => onOpen(p.id)}>
                  <td>
                    <div style={{ fontWeight: 700 }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>{p.code} · {p.category_label}{p.property_code ? ` · ${p.property_code}${p.space_code ? ` / ${p.space_code}` : ''}` : ' · Cartera'}</div>
                  </td>
                  <td><StatusChip status={p.status} /></td>
                  <td>{p.status === 'cancelado' || p.status === 'completado' ? '—' : <HealthBadge health={p.health} small />}</td>
                  <td><BudgetBar budget={p.budget_amount} spent={p.spent} committed={p.committed} /></td>
                  <td><Progress value={p.progress} /><div style={{ fontSize: 11, color: 'var(--ink-500)', marginTop: 3 }}>{p.progress}%</div></td>
                  <td style={{ fontSize: 12 }}>{fmtD(p.end_date)}</td>
                  <td style={{ fontSize: 12 }}>{p.owner_name || '—'}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--ink-400)', padding: 24 }}>Sin resultados.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {form && (
        <ProjectForm
          tenantId={tenantId} initial={form} properties={properties} assets={assets}
          onClose={() => setForm(null)}
          onSaved={(saved) => { setForm(null); reload(); if (!form.id && saved?.id) onOpen(saved.id); }}
        />
      )}
      {openId && (
        <ProjectDetail
          tenantId={tenantId} id={openId} canWrite={canWrite} projects={projects} properties={properties}
          assets={assets} providers={providers}
          onClose={() => onOpen(null)} onChanged={reload} onEdit={(p) => setForm(p)}
        />
      )}
    </>
  );
}

function ProjectCard({ p, onClick }) {
  const late = p.schedule_health === 'critico';
  return (
    <button className="cx-card" onClick={onClick}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, alignItems: 'flex-start' }}>
        <span style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--ink-400)' }}>{p.code}</span>
        {['aprobado', 'en_ejecucion', 'en_pausa'].includes(p.status) && <HealthBadge health={p.health} small />}
      </div>
      <div style={{ fontWeight: 800, fontSize: 13.5, color: 'var(--ink-900)', lineHeight: 1.3, margin: '3px 0 2px' }}>{p.name}</div>
      <div style={{ fontSize: 11, color: 'var(--ink-500)', marginBottom: 8 }}>
        {p.category_label} · {p.property_code ? `${p.property_code}${p.space_code ? ` / ${p.space_code}` : ''}` : 'Toda la cartera'}
      </div>
      <BudgetBar budget={p.budget_amount} spent={p.spent} committed={p.committed} height={6} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
        <div style={{ flex: 1 }}><Progress value={p.progress} height={5} /></div>
        <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--ink-600)' }}>{p.progress}%</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, color: late ? 'var(--coral-600)' : 'var(--ink-400)' }}>
        <span><CalendarClock size={11} style={{ verticalAlign: -1 }} /> {p.end_date ? fmtD(p.end_date) : 'Sin fecha'}</span>
        <span>{PRIORITIES[p.priority]}</span>
      </div>
    </button>
  );
}

/* ───────────────────────── Formulario de proyecto ───────────────────────── */
function ProjectForm({ tenantId, initial, properties, assets, onClose, onSaved }) {
  const editing = !!initial.id;
  const [form, setForm] = useState(() => ({
    ...EMPTY, ...initial,
    property: initial.property || '', space: initial.space || '', asset: initial.asset || '',
    budget_amount: initial.budget_amount ?? '', expected_annual_benefit: initial.expected_annual_benefit ?? '',
  }));
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const propAssets = assets.filter(a => !form.property || a.property === form.property);

  const save = async () => {
    if (!form.name.trim()) return toast.error('Ponle un nombre al proyecto');
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(), description: form.description, category: form.category, status: form.status,
        priority: form.priority, property: form.property || null, space: form.property && form.space ? form.space : null, asset: form.asset || null,
        owner_name: form.owner_name, approved_by: form.approved_by,
        budget_amount: form.budget_amount === '' ? 0 : form.budget_amount,
        start_date: form.start_date || null, end_date: form.end_date || null,
        justification: form.justification,
        expected_annual_benefit: form.expected_annual_benefit === '' ? null : form.expected_annual_benefit,
      };
      const { data } = editing
        ? await rentalAPI.ops.finance.projects.update(tenantId, form.id, payload)
        : await rentalAPI.ops.finance.projects.create(tenantId, payload);
      toast.success(editing ? 'Proyecto actualizado' : 'Proyecto creado');
      onSaved(data);
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo guardar el proyecto'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      wide title={editing ? `Editar ${form.code}` : 'Nuevo proyecto CAPEX'}
      subtitle="Define qué se va a invertir, cuánto, cuándo y qué beneficio se espera."
      onClose={onClose}
      footer={(<><button className="btn btn-outline" onClick={onClose}>Cancelar</button><button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Guardando…' : 'Guardar proyecto'}</button></>)}
    >
      <Grid cols={2}>
        <Field label="Nombre del proyecto *" style={{ gridColumn: '1 / -1' }}>
          <input className="field-input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Ej. Reposición de clima en edificio A" />
        </Field>
        <Field label="Categoría">
          <select className="field-select" value={form.category} onChange={e => set('category', e.target.value)}>
            {Object.entries(CAPEX_CATEGORIES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Field>
        <Field label="Prioridad">
          <select className="field-select" value={form.priority} onChange={e => set('priority', e.target.value)}>
            {Object.entries(PRIORITIES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Field>
        <Field label="Propiedad" hint="Vacío = proyecto de toda la cartera.">
          <select className="field-select" value={form.property} onChange={e => setForm(s => ({ ...s, property: e.target.value, space: '', asset: '' }))}>
            <option value="">Toda la cartera</option>
            {properties.map(p => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
          </select>
        </Field>
        <SpaceField tenantId={tenantId} propertyId={form.property} value={form.space} onChange={v => set('space', v)} />
        <Field label="Equipo que repone o mejora" hint="Opcional. Liga el proyecto con tu inventario de activos.">
          <select className="field-select" value={form.asset} onChange={e => set('asset', e.target.value)}>
            <option value="">— Ninguno —</option>
            {propAssets.map(a => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
          </select>
        </Field>
        <Field label="Presupuesto aprobado (MXN)">
          <input className="field-input" type="number" min="0" step="0.01" value={form.budget_amount} onChange={e => set('budget_amount', e.target.value)} />
        </Field>
        <Field label="Beneficio anual esperado (MXN)" hint="Ahorro o ingreso adicional por año; calcula ROI y recuperación.">
          <input className="field-input" type="number" min="0" step="0.01" value={form.expected_annual_benefit} onChange={e => set('expected_annual_benefit', e.target.value)} />
        </Field>
        <Field label="Inicio planeado"><input className="field-input" type="date" value={form.start_date || ''} onChange={e => set('start_date', e.target.value)} /></Field>
        <Field label="Fin planeado"><input className="field-input" type="date" value={form.end_date || ''} onChange={e => set('end_date', e.target.value)} /></Field>
        <Field label="Responsable"><input className="field-input" value={form.owner_name} onChange={e => set('owner_name', e.target.value)} /></Field>
        <Field label="Aprobado por"><input className="field-input" value={form.approved_by} onChange={e => set('approved_by', e.target.value)} /></Field>
        <Field label="Estado">
          <select className="field-select" value={form.status} onChange={e => set('status', e.target.value)}>
            {Object.entries(PROJECT_STATUS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
          </select>
        </Field>
        <Field label="Justificación" style={{ gridColumn: '1 / -1' }}>
          <textarea className="field-input" rows={3} value={form.justification} onChange={e => set('justification', e.target.value)} placeholder="¿Por qué se hace, qué problema resuelve, qué pasa si no se hace?" />
        </Field>
        <Field label="Descripción / alcance" style={{ gridColumn: '1 / -1' }}>
          <textarea className="field-input" rows={2} value={form.description} onChange={e => set('description', e.target.value)} />
        </Field>
      </Grid>
    </Modal>
  );
}

/* ───────────────────────── Detalle de proyecto ───────────────────────── */
function ProjectDetail({ tenantId, id, canWrite, projects, properties, assets, providers, onClose, onChanged, onEdit }) {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('hitos');
  const [expense, setExpense] = useState(null);
  const [ms, setMs] = useState({ title: '', due: '', weight: 1 });

  const load = useCallback(async () => {
    try {
      const { data: d } = await rentalAPI.ops.finance.projects.detail(tenantId, id);
      setData(d);
    } catch {
      toast.error('No se pudo cargar el proyecto');
      onClose();
    }
  }, [tenantId, id, onClose]);

  useEffect(() => { load(); }, [load]);

  if (!data) return null;
  const p = data.project;
  const refresh = () => { load(); onChanged(); };
  const patch = async (body, okMsg) => {
    try {
      await rentalAPI.ops.finance.projects.update(tenantId, p.id, body);
      if (okMsg) toast.success(okMsg);
      refresh();
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo actualizar'));
    }
  };

  const milestones = p.milestones || [];
  const saveMilestones = (list, msg) => patch({ milestones: list }, msg);
  const addMilestone = () => {
    if (!ms.title.trim()) return toast.error('Escribe el nombre del hito');
    saveMilestones([...milestones, { title: ms.title.trim(), due: ms.due, weight: Number(ms.weight) || 1, done: false }]);
    setMs({ title: '', due: '', weight: 1 });
  };
  const toggleMs = (m) => saveMilestones(milestones.map(x => (x.id === m.id ? { ...x, done: !x.done } : x)));
  const removeMs = (m) => saveMilestones(milestones.filter(x => x.id !== m.id));

  const removeEntry = async (e) => {
    if (!window.confirm(`¿Eliminar el gasto "${e.concept}"?`)) return;
    try {
      await rentalAPI.ops.finance.expenses.remove(tenantId, e.id);
      toast.success('Gasto eliminado');
      refresh();
    } catch (er) {
      toast.error(errMsg(er, 'No se pudo eliminar'));
    }
  };

  const removeProject = async () => {
    if (!window.confirm(`¿Eliminar ${p.code}? Solo se puede si no tiene gastos ni órdenes.`)) return;
    try {
      await rentalAPI.ops.finance.projects.remove(tenantId, p.id);
      toast.success('Proyecto eliminado');
      onChanged();
      onClose();
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo eliminar'));
    }
  };

  const available = num(p.remaining);
  const active = !['completado', 'cancelado'].includes(p.status);

  return (
    <>
    <Modal
      wide
      title={<span>{p.name} <span style={{ fontSize: 12, color: 'var(--ink-400)', fontWeight: 700 }}>· {p.code}</span></span>}
      subtitle={`${p.category_label} · ${p.property_code ? `${p.property_code} ${p.property_name}${p.space_code ? ` / ${p.space_code}` : ''}` : 'Toda la cartera'}${p.owner_name ? ` · Responsable: ${p.owner_name}` : ''}`}
      onClose={onClose}
      footer={canWrite ? (
        <>
          <button className="btn btn-outline" style={{ color: 'var(--coral-600)', marginRight: 'auto' }} onClick={removeProject}><Trash2 size={14} /> Eliminar</button>
          <button className="btn btn-outline" onClick={() => onEdit(p)}><Pencil size={14} /> Editar datos</button>
        </>
      ) : null}
    >
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <StatusChip status={p.status} />
        {active && p.status !== 'propuesta' && <HealthBadge health={p.health} />}
        <span style={{ fontSize: 12, color: 'var(--ink-400)' }}>Prioridad {PRIORITIES[p.priority]?.toLowerCase()}</span>
        {canWrite && (
          <select className="field-select" style={{ marginLeft: 'auto', maxWidth: 190 }} value={p.status}
            onChange={e => patch({ status: e.target.value }, 'Estado actualizado')}>
            {Object.entries(PROJECT_STATUS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
          </select>
        )}
      </div>

      <div className="rd-mini-grid">
        <div className="rd-mini"><div className="rd-mini-label">Presupuesto</div><div className="rd-mini-value">{mon(p.budget_amount)}</div></div>
        <div className="rd-mini"><div className="rd-mini-label">Ejecutado</div><div className="rd-mini-value">{mon(p.spent)}</div><div className="rd-mini-sub">{p.budget_used_pct != null ? `${p.budget_used_pct}% del presupuesto` : ''}</div></div>
        <div className="rd-mini"><div className="rd-mini-label">Comprometido</div><div className="rd-mini-value">{mon(p.committed)}</div></div>
        <div className="rd-mini" style={available < 0 ? { borderColor: 'var(--coral-100)' } : undefined}>
          <div className="rd-mini-label">Disponible</div>
          <div className="rd-mini-value" style={{ color: available < 0 ? 'var(--coral-600)' : undefined }}>{mon(available)}</div>
          {available < 0 && <div className="rd-mini-sub" style={{ color: 'var(--coral-600)' }}>Excede el presupuesto</div>}
        </div>
        <div className="rd-mini"><div className="rd-mini-label">Avance</div><div className="rd-mini-value">{p.progress}%</div><div className="rd-mini-sub">{p.milestones_done[0]}/{p.milestones_done[1]} hitos</div></div>
        <div className="rd-mini"><div className="rd-mini-label">Retorno</div><div className="rd-mini-value">{p.roi_pct != null ? `${p.roi_pct}%` : '—'}</div><div className="rd-mini-sub">{p.payback_years != null ? `Recupera en ${p.payback_years} años` : 'Sin beneficio capturado'}</div></div>
      </div>

      <div>
        <BudgetBar budget={p.budget_amount} spent={p.spent} committed={p.committed} height={10} />
      </div>
      <div className="card" style={{ padding: '10px 16px' }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--ink-400)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Cronograma</div>
        <Timeline project={p} />
      </div>

      <div className="tabs proj-detail-tabs" style={{ marginBottom: 0 }}>
        {[['hitos', `Hitos (${milestones.length})`], ['gastos', `Gastos (${data.entries.length})`], ['ordenes', `Órdenes (${data.works.length})`], ['info', 'Información']].map(([k, l]) => (
          <button key={k} className={`tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {tab === 'hitos' && (
        <div>
          {milestones.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--ink-500)', marginBottom: 10 }}>
              Divide el proyecto en hitos (cotización, anticipo, instalación, entrega…). El avance se calcula solo según los hitos completados y su peso.
            </div>
          )}
          {milestones.map(m => {
            const overdue = !m.done && m.due && m.due < todayISO();
            return (
              <div key={m.id} className="rd-row">
                <label style={{ display: 'flex', gap: 10, alignItems: 'center', cursor: canWrite ? 'pointer' : 'default', flex: 1, minWidth: 0 }}>
                  <input type="checkbox" checked={m.done} disabled={!canWrite} onChange={() => toggleMs(m)} style={{ width: 17, height: 17, accentColor: COLORS.teal }} />
                  <span style={{ textDecoration: m.done ? 'line-through' : 'none', color: m.done ? 'var(--ink-400)' : 'var(--ink-800)', fontWeight: 600 }}>{m.title}</span>
                </label>
                <span style={{ fontSize: 11, color: overdue ? 'var(--coral-600)' : 'var(--ink-400)', fontWeight: overdue ? 800 : 600 }}>{m.due ? fmtD(m.due) : 'Sin fecha'}</span>
                <span style={{ fontSize: 11, color: 'var(--ink-400)' }}>peso {m.weight}</span>
                {canWrite && <button className="btn-icon" onClick={() => removeMs(m)}><Trash2 size={14} /></button>}
              </div>
            );
          })}
          {canWrite && (
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <input className="field-input" style={{ flex: 2, minWidth: 180 }} placeholder="Nuevo hito…" value={ms.title} onChange={e => setMs(s => ({ ...s, title: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && addMilestone()} />
              <input className="field-input" type="date" style={{ maxWidth: 160 }} value={ms.due} onChange={e => setMs(s => ({ ...s, due: e.target.value }))} />
              <input className="field-input" type="number" min="1" max="100" style={{ maxWidth: 80 }} title="Peso" value={ms.weight} onChange={e => setMs(s => ({ ...s, weight: e.target.value }))} />
              <button className="btn btn-outline" onClick={addMilestone}><CheckSquare size={14} /> Agregar</button>
            </div>
          )}
          {canWrite && milestones.length === 0 && (
            <div style={{ marginTop: 14, maxWidth: 260 }}>
              <Field label="O captura el avance a mano (%)">
                <input className="field-input" type="number" min="0" max="100" defaultValue={p.progress_manual ?? ''}
                  onBlur={e => patch({ progress_manual: e.target.value === '' ? null : Number(e.target.value) })} />
              </Field>
            </div>
          )}
        </div>
      )}

      {tab === 'gastos' && (
        <div>
          {canWrite && p.status !== 'cancelado' && (
            <div style={{ marginBottom: 10 }}>
              <button className="btn btn-primary btn-sm" onClick={() => setExpense({})}><Plus size={13} /> Registrar gasto</button>
            </div>
          )}
          {data.entries.length === 0 ? (
            <div style={{ color: 'var(--ink-400)', fontSize: 13, padding: '8px 0' }}>Sin gastos registrados. Las órdenes de trabajo ligadas al proyecto también suman aquí.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="table" style={{ minWidth: 560 }}>
                <thead><tr><th>Fecha</th><th>Concepto</th><th>Proveedor</th><th>Estado</th><th style={{ textAlign: 'right' }}>Monto</th><th /></tr></thead>
                <tbody>
                  {data.entries.map(e => (
                    <tr key={e.id}>
                      <td style={{ fontSize: 12 }}>{fmtD(e.date)}</td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{e.concept}</div>
                        <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>{[e.invoice_ref && `Fact. ${e.invoice_ref}`, e.approved_by && `Autorizó ${e.approved_by}`].filter(Boolean).join(' · ')}</div>
                      </td>
                      <td style={{ fontSize: 12 }}>{e.provider_name || '—'}</td>
                      <td><span className="proj-chip" style={e.status === 'pagado' ? { color: 'var(--teal-700)', background: 'var(--teal-50)' } : { color: 'var(--amber-700)', background: 'var(--amber-50)' }}>{e.status === 'pagado' ? 'Pagado' : 'Comprometido'}</span></td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{mon(e.amount)}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {canWrite && (<>
                          <button className="btn-icon" onClick={() => setExpense(e)}><Pencil size={14} /></button>
                          <button className="btn-icon" onClick={() => removeEntry(e)}><Trash2 size={14} /></button>
                        </>)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'ordenes' && (
        <div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-500)', marginBottom: 8 }}>
            <Wrench size={13} style={{ verticalAlign: -2 }} /> Para sumar una orden de trabajo a este proyecto, elige “Proyecto CAPEX” al crearla o editarla en <b>Órdenes de trabajo</b>. Su costo se contabiliza como inversión y no como gasto operativo.
          </div>
          {data.works.length === 0 && <div style={{ color: 'var(--ink-400)', fontSize: 13 }}>Ninguna orden ligada todavía.</div>}
          {data.works.map(w => (
            <div key={w.id} className="rd-row">
              <div className="rd-row-main">
                <div className="rd-row-title">{w.folio} · {w.title}</div>
                <div className="rd-row-sub">{w.property_code} · {w.status_label}{w.provider ? ` · ${w.provider}` : ''} · {fmtD(w.date)}</div>
              </div>
              <b>{mon(w.status === 'realizado' ? w.cost : w.estimated_cost)}</b>
            </div>
          ))}
        </div>
      )}

      {tab === 'info' && (
        <div style={{ display: 'grid', gap: 12, fontSize: 13.5 }}>
          <Info label="Justificación" value={p.justification} />
          <Info label="Descripción / alcance" value={p.description} />
          <Grid cols={2}>
            <Info label="Aprobado por" value={p.approved_by ? `${p.approved_by}${p.approved_date ? ` · ${fmtD(p.approved_date)}` : ''}` : ''} />
            <Info label="Beneficio anual esperado" value={p.expected_annual_benefit ? mon(p.expected_annual_benefit) : ''} />
            <Info label="Inicio / fin planeado" value={`${fmtD(p.start_date)} → ${fmtD(p.end_date)}`} />
            <Info label="Inicio / fin real" value={`${fmtD(p.actual_start)} → ${fmtD(p.actual_end)}`} />
            <Info label="Equipo relacionado" value={p.asset_code ? `${p.asset_code} · ${p.asset_name}` : ''} />
            <Info label="Creado por" value={p.created_by_name} />
          </Grid>
          {data.assets.length > 0 && (
            <div>
              <div className="field-label">Activos adquiridos con este proyecto</div>
              {data.assets.map(a => (
                <div key={a.id} className="rd-row"><span>{a.code} · {a.name} <span style={{ color: 'var(--ink-400)', fontSize: 11 }}>({a.property_code})</span></span><b>{mon(a.purchase_cost, { dash: true })}</b></div>
              ))}
            </div>
          )}
        </div>
      )}

    </Modal>
    {expense && (
      <ExpenseModal
        tenantId={tenantId} initial={expense.id ? expense : null} lockProject={p.id}
        projects={projects} properties={properties} providers={providers}
        onClose={() => setExpense(null)}
        onSaved={() => { setExpense(null); refresh(); }}
      />
    )}
    </>
  );
}

function Info({ label, value }) {
  return (
    <div>
      <div className="field-label">{label}</div>
      <div style={{ color: value ? 'var(--ink-800)' : 'var(--ink-300)', whiteSpace: 'pre-wrap' }}>{value || '—'}</div>
    </div>
  );
}
