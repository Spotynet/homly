import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { planeacionAPI } from '../api/client';
import { fmtCurrency, todayPeriod } from '../utils/helpers';
import toast from 'react-hot-toast';
import {
  Plus, Sparkles, Check, Archive, Trash2, X, Pencil, Wallet,
  FolderKanban, Building2, Users, AlertTriangle, Link2, Calendar,
} from 'lucide-react';

const MONTHS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
const MONTH_LBL = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

const BUDGET_STATUS = {
  borrador: { label: 'Borrador', color: 'var(--ink-500)', bg: 'var(--sand-50)' },
  aprobado: { label: 'Aprobado', color: 'var(--teal-700)', bg: 'var(--teal-50)' },
  archivado: { label: 'Archivado', color: 'var(--ink-400)', bg: 'var(--sand-50)' },
};

const PROJECT_STATUS = {
  idea: { label: 'Idea', color: 'var(--ink-500)', bg: 'var(--sand-50)' },
  aprobado: { label: 'Aprobado', color: 'var(--blue-700)', bg: 'var(--blue-50)' },
  en_curso: { label: 'En curso', color: 'var(--teal-700)', bg: 'var(--teal-50)' },
  pausado: { label: 'Pausado', color: '#92400e', bg: 'var(--amber-50)' },
  concluido: { label: 'Concluido', color: 'var(--ink-600)', bg: 'var(--sand-50)' },
  cancelado: { label: 'Cancelado', color: 'var(--coral-600)', bg: 'var(--coral-50)' },
};

const PRIORITY = {
  baja: { label: 'Baja', color: 'var(--ink-400)' },
  media: { label: 'Media', color: 'var(--blue-600)' },
  alta: { label: 'Alta', color: '#92400e' },
  urgente: { label: 'Urgente', color: 'var(--coral-600)' },
};

const EMPTY_PROJECT = {
  name: '', description: '', status: 'idea', priority: 'media',
  extra_field_id: null, budget_amount: 0, start_period: '', end_period: '',
  responsible_name: '', notes: '',
};

function errMsg(e, fallback) {
  const d = e?.response?.data?.detail;
  if (typeof d === 'string') return d;
  return fallback;
}

function evenMonths(annual) {
  const n = Number(annual) || 0;
  if (n <= 0) return Object.fromEntries(MONTHS.map(m => [m, 0]));
  const base = Math.round((n / 12) * 100) / 100;
  const amounts = Object.fromEntries(MONTHS.map(m => [m, base]));
  amounts['12'] = Math.round((n - base * 11) * 100) / 100;
  return amounts;
}

function lineTotal(amounts) {
  return MONTHS.reduce((s, m) => s + (Number(amounts?.[m]) || 0), 0);
}

function Pill({ map, value }) {
  const m = map[value] || { label: value, color: 'var(--ink-500)', bg: 'var(--sand-50)' };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 99,
      fontSize: 11, fontWeight: 700, color: m.color, background: m.bg,
    }}>{m.label}</span>
  );
}

export default function Planeacion() {
  const { tenantId, isReadOnly } = useAuth();
  const [tab, setTab] = useState('presupuesto');
  const [year, setYear] = useState(new Date().getFullYear());
  const [ctx, setCtx] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadCtx = () => {
    if (!tenantId) return;
    planeacionAPI.context(tenantId, { year })
      .then(r => setCtx(r.data))
      .catch(() => toast.error('No se pudo cargar el contexto del condominio'));
  };

  useEffect(() => { loadCtx(); }, [tenantId, year]);

  const years = useMemo(() => {
    const start = ctx?.start_year || year - 2;
    const list = [];
    for (let y = Math.max(start, year - 4); y <= year + 2; y++) list.push(y);
    return list;
  }, [ctx, year]);

  return (
    <div className="content-fade">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', color: 'var(--teal-600)', textTransform: 'uppercase' }}>
            Condominio
          </div>
          <h2 style={{ margin: '4px 0 0', fontSize: 22 }}>Planeación</h2>
          <p style={{ color: 'var(--ink-400)', fontSize: 13, marginTop: 4 }}>
            Presupuesto anual y proyectos, con cuotas, unidades y categorías reales de {ctx?.name || 'tu condominio'}.
          </p>
        </div>
        <div className="tabs" style={{ marginBottom: 0 }}>
          {[
            ['presupuesto', 'Presupuesto'],
            ['proyectos', 'Proyectos'],
          ].map(([k, l]) => (
            <button key={k} className={`tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>
      </div>

      {ctx && (
        <div className="plan-context">
          <span><Building2 size={14} /> {ctx.units_billable} unidad(es) cobrable(s)</span>
          <span><Users size={14} /> {ctx.units_exempt} exenta(s)</span>
          <span><Wallet size={14} /> Cuota {fmtCurrency(ctx.maintenance_fee, ctx.currency)} / mes</span>
          <span>Ingreso estimado {fmtCurrency(ctx.suggested_income_monthly, ctx.currency)} / mes</span>
        </div>
      )}

      {tab === 'presupuesto' ? (
        <PresupuestoTab
          tenantId={tenantId} year={year} setYear={setYear} years={years}
          ctx={ctx} isReadOnly={isReadOnly} loading={loading} setLoading={setLoading} onSeeded={loadCtx}
        />
      ) : (
        <ProyectosTab tenantId={tenantId} ctx={ctx} isReadOnly={isReadOnly} />
      )}
    </div>
  );
}

function PresupuestoTab({ tenantId, year, setYear, years, ctx, isReadOnly, loading, setLoading, onSeeded }) {
  const [budget, setBudget] = useState(null);
  const [kind, setKind] = useState('gasto');
  const [editing, setEditing] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const currency = ctx?.currency || 'MXN';

  const load = () => {
    if (!tenantId) return;
    setLoading(true);
    planeacionAPI.budgets.list(tenantId)
      .then(r => {
        const list = Array.isArray(r.data) ? r.data : (r.data?.results || []);
        const found = list.find(b => b.year === year);
        if (!found) {
          setBudget(null);
          setDirty(false);
          return;
        }
        return planeacionAPI.budgets.get(tenantId, found.id, { include_actuals: 1 })
          .then(d => { setBudget(d.data); setDirty(false); });
      })
      .catch(() => toast.error('No se pudo cargar el presupuesto'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [tenantId, year]);

  const seed = async () => {
    try {
      setSaving(true);
      const r = await planeacionAPI.budgets.seed(tenantId, { year });
      setBudget(r.data);
      setDirty(false);
      toast.success(`Presupuesto ${year} armado con datos del condominio`);
      onSeeded?.();
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo crear el presupuesto'));
    } finally {
      setSaving(false);
    }
  };

  const saveLines = async () => {
    if (!budget) return;
    try {
      setSaving(true);
      const r = await planeacionAPI.budgets.saveLines(tenantId, budget.id, budget.lines);
      setBudget(r.data);
      setDirty(false);
      toast.success('Partidas guardadas');
    } catch (e) {
      toast.error(errMsg(e, 'No se pudieron guardar las partidas'));
    } finally {
      setSaving(false);
    }
  };

  const approve = async () => {
    if (!budget) return;
    if (dirty) await saveLines();
    try {
      const r = await planeacionAPI.budgets.approve(tenantId, budget.id);
      setBudget(r.data);
      toast.success('Presupuesto aprobado');
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo aprobar'));
    }
  };

  const archive = async () => {
    if (!budget || !window.confirm('¿Archivar este presupuesto? Dejará de ser el vigente del año.')) return;
    try {
      await planeacionAPI.budgets.archive(tenantId, budget.id);
      toast.success('Archivado');
      load();
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo archivar'));
    }
  };

  const removeBudget = async () => {
    if (!budget || !window.confirm('¿Eliminar el presupuesto de este año?')) return;
    try {
      await planeacionAPI.budgets.delete(tenantId, budget.id);
      setBudget(null);
      toast.success('Eliminado');
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo eliminar'));
    }
  };

  const updateLine = (id, patch) => {
    setBudget(b => ({
      ...b,
      lines: b.lines.map(l => l.id === id ? { ...l, ...patch } : l),
    }));
    setDirty(true);
  };

  const addLine = () => {
    const id = `tmp-${Date.now()}`;
    const line = {
      id, kind, concept_key: 'custom', name: '', extra_field_id: null,
      monthly_amounts: evenMonths(0), sort_order: (budget?.lines || []).length,
      annual_amount: 0, actual_monthly: null, actual_annual: 0,
    };
    setBudget(b => ({ ...b, lines: [...(b.lines || []), line] }));
    setDirty(true);
    setEditing(line);
  };

  const removeLine = (id) => {
    setBudget(b => ({ ...b, lines: b.lines.filter(l => l.id !== id) }));
    setDirty(true);
  };

  const lines = (budget?.lines || []).filter(l => l.kind === kind);
  const totals = budget?.totals || {};
  const locked = isReadOnly || budget?.status === 'archivado';

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-400)' }}>Cargando presupuesto…</div>;
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
        <select className="field-select" value={year} onChange={e => setYear(Number(e.target.value))} style={{ width: 120 }}>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        {budget && <Pill map={BUDGET_STATUS} value={budget.status} />}
        {dirty && !locked && <span style={{ fontSize: 12, color: '#92400e' }}>Cambios sin guardar</span>}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {budget && !locked && (
            <>
              <button className="btn btn-outline" onClick={addLine}><Plus size={14} /> Partida</button>
              <button className="btn btn-primary" disabled={saving || !dirty} onClick={saveLines}>Guardar</button>
              {budget.status !== 'aprobado' && <button className="btn btn-outline" onClick={approve}><Check size={14} /> Aprobar</button>}
              <button className="btn btn-outline" onClick={archive}><Archive size={14} /></button>
              {budget.status !== 'aprobado' && <button className="btn btn-outline" onClick={removeBudget}><Trash2 size={14} /></button>}
            </>
          )}
        </div>
      </div>

      {!budget ? (
        <div className="card" style={{ padding: 36, textAlign: 'center' }}>
          <Sparkles size={28} style={{ color: 'var(--teal-600)', marginBottom: 10 }} />
          <h3 style={{ margin: '0 0 8px' }}>Aún no hay presupuesto para {year}</h3>
          <p style={{ color: 'var(--ink-400)', fontSize: 13, maxWidth: 520, margin: '0 auto 18px' }}>
            Homly lo arma con la cuota de mantenimiento ({fmtCurrency(ctx?.maintenance_fee, currency)}) × {ctx?.units_billable || 0} unidades
            cobrables y las categorías de gastos e ingresos de Configuración.
          </p>
          {!isReadOnly && (
            <button className="btn btn-primary" disabled={saving} onClick={seed}>
              <Sparkles size={14} /> Crear presupuesto con datos del condominio
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="cob-stats" style={{ marginBottom: 14 }}>
            <Mini label="Ingresos presupuestados" value={fmtCurrency(totals.income, currency)} sub={totals.actual_income != null ? `Real ${fmtCurrency(totals.actual_income, currency)}` : ''} />
            <Mini label="Gastos presupuestados" value={fmtCurrency(totals.expense, currency)} sub={totals.actual_expense != null ? `Real ${fmtCurrency(totals.actual_expense, currency)}` : ''} />
            <Mini
              label={totals.surplus >= 0 ? 'Superávit' : 'Déficit'}
              value={fmtCurrency(totals.surplus, currency)}
              sub={totals.expense ? `${Math.round((totals.income / (totals.expense || 1)) * 100)}% cubierto` : ''}
            />
            <Mini
              label="Ejecución de gastos"
              value={totals.expense ? `${Math.min(999, Math.round((totals.actual_expense / totals.expense) * 100))}%` : '—'}
              sub="Real vs presupuesto"
            />
          </div>

          {(totals.expense > totals.income) && ctx?.units_billable > 0 && (
            <div className="plan-hint">
              <AlertTriangle size={14} /> El gasto anual supera los ingresos.
              Faltarían {fmtCurrency((totals.expense - totals.income) / 12 / ctx.units_billable, currency)} extra por unidad al mes para equilibrar.
            </div>
          )}

          <div className="tabs" style={{ marginBottom: 12 }}>
            <button className={`tab ${kind === 'ingreso' ? 'active' : ''}`} onClick={() => setKind('ingreso')}>Ingresos</button>
            <button className={`tab ${kind === 'gasto' ? 'active' : ''}`} onClick={() => setKind('gasto')}>Gastos</button>
          </div>

          <div className="card">
            <div className="table-wrap plan-table-wrap">
              <table className="plan-table">
                <thead>
                  <tr>
                    <th>Concepto</th>
                    {MONTH_LBL.map(m => <th key={m} style={{ textAlign: 'right' }}>{m}</th>)}
                    <th style={{ textAlign: 'right' }}>Anual</th>
                    <th style={{ textAlign: 'right' }}>Real</th>
                    <th style={{ textAlign: 'right' }}>Var.</th>
                    {!locked && <th />}
                  </tr>
                </thead>
                <tbody>
                  {lines.length === 0 ? (
                    <tr><td colSpan={16} style={{ textAlign: 'center', color: 'var(--ink-400)', padding: 28 }}>Sin partidas en esta sección.</td></tr>
                  ) : lines.map(line => {
                    const annual = lineTotal(line.monthly_amounts);
                    const real = Number(line.actual_annual) || 0;
                    const varn = annual ? real - annual : real;
                    return (
                      <tr key={line.id}>
                        <td>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{line.name || 'Sin nombre'}</div>
                          <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>
                            {line.concept_key === 'maintenance' ? 'Cuota del tenant' : (line.extra_field_label || line.concept_key)}
                          </div>
                        </td>
                        {MONTHS.map(m => {
                          const n = Number(line.monthly_amounts?.[m]) || 0;
                          return (
                            <td key={m} style={{ textAlign: 'right', fontSize: 11, fontVariantNumeric: 'tabular-nums', color: n ? 'var(--ink-700)' : 'var(--ink-300)' }}>
                              {n ? n.toLocaleString('es-MX', { maximumFractionDigits: 0 }) : '—'}
                            </td>
                          );
                        })}
                        <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmtCurrency(annual, currency)}</td>
                        <td style={{ textAlign: 'right' }}>{fmtCurrency(real, currency)}</td>
                        <td style={{ textAlign: 'right', color: varn > 0 ? (kind === 'gasto' ? 'var(--coral-600)' : 'var(--teal-700)') : (varn < 0 ? (kind === 'gasto' ? 'var(--teal-700)' : 'var(--coral-600)') : 'var(--ink-400)') }}>
                          {varn === 0 ? '—' : fmtCurrency(varn, currency)}
                        </td>
                        {!locked && (
                          <td>
                            <button className="btn btn-outline btn-sm" onClick={() => setEditing(line)}><Pencil size={12} /></button>
                            {line.concept_key === 'custom' && (
                              <button className="btn btn-outline btn-sm" style={{ marginLeft: 4 }} onClick={() => removeLine(line.id)}><Trash2 size={12} /></button>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {editing && (
        <LineModal
          line={editing}
          currency={currency}
          locked={locked}
          onClose={() => setEditing(null)}
          onSave={(next) => { updateLine(editing.id, next); setEditing(null); }}
        />
      )}
    </>
  );
}

function LineModal({ line, currency, locked, onClose, onSave }) {
  const [name, setName] = useState(line.name || '');
  const [amounts, setAmounts] = useState({ ...(line.monthly_amounts || evenMonths(0)) });
  const [annual, setAnnual] = useState(lineTotal(line.monthly_amounts));

  const setMonth = (m, v) => {
    const n = { ...amounts, [m]: Number(v) || 0 };
    setAmounts(n);
    setAnnual(lineTotal(n));
  };

  const spread = () => {
    const n = evenMonths(annual);
    setAmounts(n);
  };

  return (
    <div className="modal-bg open" onClick={onClose}>
      <div className="modal lg" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Partida · {line.kind === 'ingreso' ? 'Ingreso' : 'Gasto'}</h3>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body">
          <div className="field">
            <div className="field-label">Nombre</div>
            <input className="field-input" value={name} disabled={locked} onChange={e => setName(e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 12 }}>
            <div className="field" style={{ flex: 1, margin: 0 }}>
              <div className="field-label">Total anual</div>
              <input className="field-input" type="number" min="0" step="0.01" value={annual} disabled={locked} onChange={e => setAnnual(e.target.value)} />
            </div>
            {!locked && <button className="btn btn-outline" onClick={spread}>Repartir en 12 meses</button>}
          </div>
          <div className="plan-month-grid">
            {MONTHS.map((m, i) => (
              <div className="field" key={m} style={{ margin: 0 }}>
                <div className="field-label">{MONTH_LBL[i]}</div>
                <input className="field-input" type="number" min="0" step="0.01" disabled={locked} value={amounts[m] ?? 0} onChange={e => setMonth(m, e.target.value)} />
              </div>
            ))}
          </div>
          {line.actual_annual != null && (
            <div style={{ marginTop: 12, fontSize: 12, color: 'var(--ink-400)' }}>
              Real del año: {fmtCurrency(line.actual_annual, currency)} (cobranza o gastos registrados)
            </div>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn btn-outline" onClick={onClose}>Cerrar</button>
          {!locked && <button className="btn btn-primary" onClick={() => onSave({ name, monthly_amounts: amounts, annual_amount: lineTotal(amounts) })}>Aplicar</button>}
        </div>
      </div>
    </div>
  );
}

function ProyectosTab({ tenantId, ctx, isReadOnly }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [modal, setModal] = useState(null);
  const [detail, setDetail] = useState(null);
  const currency = ctx?.currency || 'MXN';

  const load = () => {
    if (!tenantId) return;
    setLoading(true);
    planeacionAPI.projects.list(tenantId)
      .then(r => setList(Array.isArray(r.data) ? r.data : (r.data?.results || [])))
      .catch(() => toast.error('No se pudieron cargar los proyectos'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [tenantId]);

  const openDetail = async (id) => {
    try {
      const r = await planeacionAPI.projects.get(tenantId, id);
      setDetail(r.data);
    } catch {
      toast.error('No se pudo abrir el proyecto');
    }
  };

  const shown = list.filter(p => filter === 'all' || p.status === filter);

  return (
    <>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <div className="tabs" style={{ marginBottom: 0 }}>
          {[['all', 'Todos'], ['idea', 'Ideas'], ['en_curso', 'En curso'], ['concluido', 'Concluidos']].map(([k, l]) => (
            <button key={k} className={`tab ${filter === k ? 'active' : ''}`} onClick={() => setFilter(k)}>{l}</button>
          ))}
        </div>
        {!isReadOnly && (
          <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={() => setModal({ ...EMPTY_PROJECT, start_period: todayPeriod() })}>
            <Plus size={14} /> Nuevo proyecto
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-400)' }}>Cargando proyectos…</div>
      ) : shown.length === 0 ? (
        <div className="card" style={{ padding: 36, textAlign: 'center' }}>
          <FolderKanban size={28} style={{ color: 'var(--teal-600)', marginBottom: 10 }} />
          <h3 style={{ margin: '0 0 8px' }}>Sin proyectos todavía</h3>
          <p style={{ color: 'var(--ink-400)', fontSize: 13, maxWidth: 480, margin: '0 auto 16px' }}>
            Usa esta pestaña para obras, mejoras y extraordinarios. Puedes ligarlos a una categoría de gastos y traer movimientos reales.
          </p>
          {!isReadOnly && (
            <button className="btn btn-primary" onClick={() => setModal({ ...EMPTY_PROJECT, start_period: todayPeriod() })}>
              Crear el primer proyecto
            </button>
          )}
        </div>
      ) : (
        <div className="proj-grid">
          {shown.map(p => {
            const pct = Math.min(100, p.progress_pct || 0);
            const over = (p.progress_pct || 0) > 100;
            return (
              <button key={p.id} className="proj-card" onClick={() => openDetail(p.id)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <Pill map={PROJECT_STATUS} value={p.status} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: PRIORITY[p.priority]?.color }}>{PRIORITY[p.priority]?.label}</span>
                </div>
                <div style={{ fontWeight: 700, fontSize: 15, marginTop: 10, textAlign: 'left' }}>{p.name}</div>
                <div style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: 4, textAlign: 'left' }}>
                  {p.extra_field_label || 'Sin categoría de gastos'}
                  {p.responsible_name ? ` · ${p.responsible_name}` : ''}
                </div>
                <div style={{ marginTop: 12, height: 6, background: 'var(--sand-100)', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: over ? 'var(--coral-500)' : 'var(--teal-500)' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 6, color: 'var(--ink-500)' }}>
                  <span>{fmtCurrency(p.spent, currency)} / {fmtCurrency(p.budget_amount, currency)}</span>
                  <span>{p.progress_pct || 0}%</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 8, textAlign: 'left' }}>
                  <Calendar size={11} style={{ verticalAlign: -1 }} /> {p.start_period || '—'} → {p.end_period || '—'}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {modal && (
        <ProjectForm
          ctx={ctx}
          initial={modal}
          isReadOnly={isReadOnly}
          onClose={() => setModal(null)}
          onSave={async (payload) => {
            try {
              if (payload.id) await planeacionAPI.projects.update(tenantId, payload.id, payload);
              else await planeacionAPI.projects.create(tenantId, payload);
              toast.success(payload.id ? 'Proyecto actualizado' : 'Proyecto creado');
              setModal(null);
              load();
            } catch (e) {
              toast.error(errMsg(e, 'No se pudo guardar el proyecto'));
            }
          }}
        />
      )}

      {detail && (
        <ProjectDetail
          tenantId={tenantId}
          project={detail}
          ctx={ctx}
          isReadOnly={isReadOnly}
          onClose={() => setDetail(null)}
          onRefresh={() => { openDetail(detail.id); load(); }}
          onEdit={() => { setModal(detail); setDetail(null); }}
          onDelete={async () => {
            if (!window.confirm('¿Eliminar este proyecto y sus costos?')) return;
            try {
              await planeacionAPI.projects.delete(tenantId, detail.id);
              toast.success('Proyecto eliminado');
              setDetail(null);
              load();
            } catch (e) {
              toast.error(errMsg(e, 'No se pudo eliminar'));
            }
          }}
        />
      )}
    </>
  );
}

function ProjectForm({ ctx, initial, isReadOnly, onClose, onSave }) {
  const [form, setForm] = useState({
    ...EMPTY_PROJECT,
    ...initial,
    extra_field_id: initial.extra_field_id || '',
    budget_amount: initial.budget_amount || 0,
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="modal-bg open" onClick={onClose}>
      <div className="modal lg" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{initial.id ? 'Editar proyecto' : 'Nuevo proyecto'}</h3>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body" style={{ display: 'grid', gap: 12 }}>
          <div className="field">
            <div className="field-label">Nombre</div>
            <input className="field-input" value={form.name} disabled={isReadOnly} onChange={e => set('name', e.target.value)} placeholder="Ej. Impermeabilización de azoteas" />
          </div>
          <div className="field">
            <div className="field-label">Descripción</div>
            <textarea className="field-input" rows={3} value={form.description} disabled={isReadOnly} onChange={e => set('description', e.target.value)} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <div className="field">
              <div className="field-label">Estatus</div>
              <select className="field-select" value={form.status} disabled={isReadOnly} onChange={e => set('status', e.target.value)}>
                {Object.entries(PROJECT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div className="field">
              <div className="field-label">Prioridad</div>
              <select className="field-select" value={form.priority} disabled={isReadOnly} onChange={e => set('priority', e.target.value)}>
                {Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div className="field">
              <div className="field-label">Presupuesto</div>
              <input className="field-input" type="number" min="0" step="0.01" value={form.budget_amount} disabled={isReadOnly} onChange={e => set('budget_amount', e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <div className="field">
              <div className="field-label">Inicio</div>
              <input className="field-input" type="month" value={form.start_period} disabled={isReadOnly} onChange={e => set('start_period', e.target.value)} />
            </div>
            <div className="field">
              <div className="field-label">Fin estimado</div>
              <input className="field-input" type="month" value={form.end_period} disabled={isReadOnly} onChange={e => set('end_period', e.target.value)} />
            </div>
            <div className="field">
              <div className="field-label">Responsable</div>
              <input className="field-input" value={form.responsible_name} disabled={isReadOnly} onChange={e => set('responsible_name', e.target.value)} placeholder="Comité / proveedor" />
            </div>
          </div>
          <div className="field">
            <div className="field-label">Categoría de gastos (opcional)</div>
            <select className="field-select" value={form.extra_field_id || ''} disabled={isReadOnly} onChange={e => set('extra_field_id', e.target.value || null)}>
              <option value="">Sin ligar</option>
              {(ctx?.gasto_fields || []).map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
            <div style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 4 }}>
              Permite importar gastos reales de esa categoría al proyecto.
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn btn-outline" onClick={onClose}>Cancelar</button>
          {!isReadOnly && (
            <button className="btn btn-primary" disabled={!form.name.trim()} onClick={() => onSave({
              ...form,
              budget_amount: Number(form.budget_amount) || 0,
              extra_field_id: form.extra_field_id || null,
            })}>Guardar</button>
          )}
        </div>
      </div>
    </div>
  );
}

function ProjectDetail({ tenantId, project, ctx, isReadOnly, onClose, onRefresh, onEdit, onDelete }) {
  const currency = ctx?.currency || 'MXN';
  const [period, setPeriod] = useState(todayPeriod());
  const [gastos, setGastos] = useState([]);
  const [picked, setPicked] = useState({});
  const [cost, setCost] = useState({ period: todayPeriod(), amount: '', description: '' });
  const over = (project.progress_pct || 0) > 100;

  const loadGastos = () => {
    planeacionAPI.projects.gastos(tenantId, project.id, { period })
      .then(r => setGastos(r.data || []))
      .catch(() => setGastos([]));
  };

  useEffect(() => { loadGastos(); }, [period, project.id]);

  const addManual = async () => {
    try {
      await planeacionAPI.projects.addCost(tenantId, project.id, {
        period: cost.period,
        amount: Number(cost.amount) || 0,
        description: cost.description,
      });
      setCost({ period: todayPeriod(), amount: '', description: '' });
      toast.success('Costo registrado');
      onRefresh();
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo registrar el costo'));
    }
  };

  const importSelected = async () => {
    const ids = Object.keys(picked).filter(k => picked[k]);
    if (!ids.length) return;
    try {
      await planeacionAPI.projects.importGastos(tenantId, project.id, { period, gasto_ids: ids });
      setPicked({});
      toast.success('Gastos ligados al proyecto');
      onRefresh();
      loadGastos();
    } catch (e) {
      toast.error(errMsg(e, 'No se pudieron importar los gastos'));
    }
  };

  return (
    <div className="modal-bg open" onClick={onClose}>
      <div className="modal lg" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{project.name}</h3>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            <Pill map={PROJECT_STATUS} value={project.status} />
            <span style={{ fontSize: 12, color: PRIORITY[project.priority]?.color, fontWeight: 700 }}>{PRIORITY[project.priority]?.label}</span>
            {project.extra_field_label && <span style={{ fontSize: 12, color: 'var(--ink-400)' }}>{project.extra_field_label}</span>}
          </div>
          {project.description && <p style={{ fontSize: 13, color: 'var(--ink-500)' }}>{project.description}</p>}
          <div style={{ margin: '12px 0 6px', height: 8, background: 'var(--sand-100)', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{ width: `${Math.min(100, project.progress_pct || 0)}%`, height: '100%', background: over ? 'var(--coral-500)' : 'var(--teal-500)' }} />
          </div>
          <div style={{ fontSize: 13, marginBottom: 16 }}>
            {fmtCurrency(project.spent, currency)} de {fmtCurrency(project.budget_amount, currency)}
            {over && <span style={{ color: 'var(--coral-600)', marginLeft: 8 }}>Sobre presupuesto</span>}
          </div>

          <h4 style={{ margin: '0 0 8px', fontSize: 14 }}>Costos</h4>
          {(project.costs || []).length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--ink-400)', marginBottom: 12 }}>Todavía no hay costos. Registra uno o importa gastos del período.</div>
          ) : (
            <div className="table-wrap" style={{ marginBottom: 14 }}>
              <table>
                <thead><tr><th>Período</th><th>Descripción</th><th>Monto</th>{!isReadOnly && <th />}</tr></thead>
                <tbody>
                  {(project.costs || []).map(c => (
                    <tr key={c.id}>
                      <td>{c.period}</td>
                      <td>{c.description || '—'}{c.gasto_entry_id ? ' · gasto' : ''}</td>
                      <td>{fmtCurrency(c.amount, currency)}</td>
                      {!isReadOnly && (
                        <td>
                          <button className="btn btn-outline btn-sm" onClick={async () => {
                            await planeacionAPI.projects.deleteCost(tenantId, project.id, c.id);
                            onRefresh();
                          }}><Trash2 size={12} /></button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!isReadOnly && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 140px auto', gap: 8, marginBottom: 18 }}>
                <input type="month" className="field-input" value={cost.period} onChange={e => setCost(c => ({ ...c, period: e.target.value }))} />
                <input className="field-input" placeholder="Descripción del costo" value={cost.description} onChange={e => setCost(c => ({ ...c, description: e.target.value }))} />
                <input type="number" className="field-input" placeholder="Monto" value={cost.amount} onChange={e => setCost(c => ({ ...c, amount: e.target.value }))} />
                <button className="btn btn-primary" disabled={!cost.amount} onClick={addManual}>Agregar</button>
              </div>

              <h4 style={{ margin: '0 0 8px', fontSize: 14 }}><Link2 size={14} /> Importar gastos del condominio</h4>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <input type="month" className="field-input" value={period} onChange={e => setPeriod(e.target.value)} style={{ width: 160 }} />
                <button className="btn btn-outline" onClick={importSelected}>Ligar seleccionados</button>
              </div>
              {gastos.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>No hay gastos en ese período{project.extra_field_label ? ` para ${project.extra_field_label}` : ''}.</div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th /><th>Período</th><th>Concepto</th><th>Monto</th></tr></thead>
                    <tbody>
                      {gastos.map(g => (
                        <tr key={g.id} style={{ opacity: g.already_linked ? 0.45 : 1 }}>
                          <td>
                            <input type="checkbox" disabled={g.already_linked} checked={!!picked[g.id]} onChange={e => setPicked(p => ({ ...p, [g.id]: e.target.checked }))} />
                          </td>
                          <td>{g.period}</td>
                          <td>{g.description}{g.provider_name ? ` · ${g.provider_name}` : ''}</td>
                          <td>{fmtCurrency(g.amount, currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
        <div className="modal-foot">
          {!isReadOnly && <button className="btn btn-outline" onClick={onDelete} style={{ marginRight: 'auto' }}><Trash2 size={14} /> Eliminar</button>}
          <button className="btn btn-outline" onClick={onClose}>Cerrar</button>
          {!isReadOnly && <button className="btn btn-primary" onClick={onEdit}><Pencil size={14} /> Editar</button>}
        </div>
      </div>
    </div>
  );
}

function Mini({ label, value, sub }) {
  return (
    <div className="cob-stat">
      <div>
        <div className="cob-stat-label">{label}</div>
        <div className="cob-stat-value" style={{ fontSize: 18 }}>{value}</div>
        {sub && <div style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );
}
