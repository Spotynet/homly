import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { planeacionAPI } from '../api/client';
import { CURRENCIES, fmtCurrency, todayPeriod } from '../utils/helpers';
import toast from 'react-hot-toast';
import {
  Plus, Sparkles, Check, Archive, Trash2, X, Pencil, Wallet,
  FolderKanban, Building2, Users, AlertTriangle, Link2, Calendar,
  Printer, Copy, Settings2, Send, Percent,
} from 'lucide-react';

const MONTHS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
const MONTH_LBL = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

const BUDGET_STATUS = {
  borrador: { label: 'Borrador', color: 'var(--ink-500)', bg: 'var(--sand-50)' },
  en_aprobacion: { label: 'En aprobación', color: 'var(--blue-700)', bg: 'var(--blue-50)' },
  aprobado: { label: 'Aprobado', color: 'var(--teal-700)', bg: 'var(--teal-50)' },
  archivado: { label: 'Archivado', color: 'var(--ink-400)', bg: 'var(--sand-50)' },
};

const PROJECT_STATUS = {
  idea: { label: 'Idea', color: 'var(--ink-500)', bg: 'var(--sand-50)' },
  en_aprobacion: { label: 'En aprobación', color: 'var(--blue-700)', bg: 'var(--blue-50)' },
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

const ROLE_LBL = { admin: 'Admin', tesorero: 'Tesorero', contador: 'Contador' };

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

function sameMonths(monthly) {
  const n = Math.round((Number(monthly) || 0) * 100) / 100;
  return Object.fromEntries(MONTHS.map(m => [m, n]));
}

function lineTotal(amounts) {
  return MONTHS.reduce((s, m) => s + (Number(amounts?.[m]) || 0), 0);
}

function currencySymbol(currency) {
  return (CURRENCIES[currency] || CURRENCIES.MXN).symbol;
}

function flowEnabled(ctx) {
  const f = ctx?.planning_flow || {};
  return !!(f.enabled && (f.steps || []).length);
}

function pickBudget(list, selectedId) {
  if (!list?.length) return null;
  if (selectedId) {
    const found = list.find(b => b.id === selectedId);
    if (found) return found;
  }
  return list.find(b => b.status === 'aprobado')
    || list.find(b => b.status === 'en_aprobacion')
    || list.find(b => b.status === 'borrador')
    || list[0];
}

function printPlaneacion() {
  document.body.classList.add('printing-planeacion');
  const done = () => {
    document.body.classList.remove('printing-planeacion');
    window.removeEventListener('afterprint', done);
  };
  window.addEventListener('afterprint', done);
  window.print();
  setTimeout(done, 1200);
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
  const { tenantId, isReadOnly, user } = useAuth();
  const [tab, setTab] = useState('presupuesto');
  const [year, setYear] = useState(new Date().getFullYear());
  const [ctx, setCtx] = useState(null);
  const [loading, setLoading] = useState(true);
  const [flowOpen, setFlowOpen] = useState(false);

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
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {!isReadOnly && (
            <button className="btn btn-outline" onClick={() => setFlowOpen(true)}>
              <Settings2 size={14} /> Flujo de aprobación
            </button>
          )}
          <div className="tabs" style={{ marginBottom: 0 }}>
            {[
              ['presupuesto', 'Presupuesto'],
              ['proyectos', 'Proyectos'],
            ].map(([k, l]) => (
              <button key={k} className={`tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>{l}</button>
            ))}
          </div>
        </div>
      </div>

      {ctx && (
        <div className="plan-context">
          <span><Building2 size={14} /> {ctx.units_billable} unidad(es) cobrable(s)</span>
          <span><Users size={14} /> {ctx.units_exempt} exenta(s)</span>
          <span><Wallet size={14} /> Cuota {fmtCurrency(ctx.maintenance_fee, ctx.currency)} / mes</span>
          <span>Ingreso estimado {fmtCurrency(ctx.suggested_income_monthly, ctx.currency)} / mes</span>
          {flowEnabled(ctx) && <span>Flujo de aprobación activo ({(ctx.planning_flow.steps || []).length} paso(s))</span>}
        </div>
      )}

      {tab === 'presupuesto' ? (
        <PresupuestoTab
          tenantId={tenantId} year={year} setYear={setYear} years={years}
          ctx={ctx} isReadOnly={isReadOnly} loading={loading} setLoading={setLoading}
          onSeeded={loadCtx} user={user}
        />
      ) : (
        <ProyectosTab tenantId={tenantId} ctx={ctx} isReadOnly={isReadOnly} user={user} />
      )}

      {flowOpen && (
        <PlanningFlowModal
          ctx={ctx}
          tenantId={tenantId}
          onClose={() => setFlowOpen(false)}
          onSaved={(next) => {
            setCtx(c => ({ ...c, planning_flow: next.planning_flow, approvers: next.approvers || c?.approvers }));
            setFlowOpen(false);
          }}
        />
      )}
    </div>
  );
}

function PresupuestoTab({ tenantId, year, setYear, years, ctx, isReadOnly, loading, setLoading, onSeeded, user }) {
  const [scenarios, setScenarios] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [budget, setBudget] = useState(null);
  const [kind, setKind] = useState('gasto');
  const [editing, setEditing] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [seedName, setSeedName] = useState('');
  const [seedUnits, setSeedUnits] = useState('');
  const [seedFee, setSeedFee] = useState('');
  const currency = ctx?.currency || 'MXN';
  const maxUnits = ctx?.max_seed_units || ctx?.units_active || ctx?.units_count || 0;

  useEffect(() => {
    setSeedName(`Presupuesto ${year}`);
    setSeedUnits(ctx?.units_billable ?? '');
    setSeedFee(ctx?.maintenance_fee ?? '');
  }, [year, ctx?.units_billable, ctx?.maintenance_fee]);

  const loadList = (keepId) => {
    if (!tenantId) return;
    setLoading(true);
    planeacionAPI.budgets.list(tenantId, { year })
      .then(r => {
        const list = Array.isArray(r.data) ? r.data : (r.data?.results || []);
        setScenarios(list);
        const picked = pickBudget(list, keepId || selectedId);
        if (!picked) {
          setBudget(null);
          setSelectedId(null);
          setDirty(false);
          return;
        }
        setSelectedId(picked.id);
        return planeacionAPI.budgets.get(tenantId, picked.id, { include_actuals: 1 })
          .then(d => { setBudget(d.data); setDirty(false); });
      })
      .catch(() => toast.error('No se pudo cargar el presupuesto'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadList(null); }, [tenantId, year]);

  const openScenario = async (id) => {
    if (!id) return;
    if (dirty && !window.confirm('Hay cambios sin guardar. ¿Cambiar de escenario?')) return;
    setSelectedId(id);
    setLoading(true);
    try {
      const d = await planeacionAPI.budgets.get(tenantId, id, { include_actuals: 1 });
      setBudget(d.data);
      setDirty(false);
    } catch {
      toast.error('No se pudo abrir el escenario');
    } finally {
      setLoading(false);
    }
  };

  const seed = async (nameOverride) => {
    const units = Number(budget?.seed_units || seedUnits);
    if (maxUnits && units > maxUnits) {
      toast.error(`Las unidades no pueden superar ${maxUnits}`);
      return;
    }
    const name = (typeof nameOverride === 'string' ? nameOverride : seedName).trim() || `Presupuesto ${year}`;
    try {
      setSaving(true);
      const r = await planeacionAPI.budgets.seed(tenantId, {
        year,
        name,
        units,
        fee: Number(budget?.seed_fee || seedFee) || 0,
      });
      setBudget(r.data);
      setSelectedId(r.data.id);
      setDirty(false);
      toast.success(`Escenario ${year} armado con datos del condominio`);
      onSeeded?.();
      const list = await planeacionAPI.budgets.list(tenantId, { year });
      setScenarios(Array.isArray(list.data) ? list.data : (list.data?.results || []));
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
      toast.success('Presupuesto aprobado. Los demás escenarios de este año se archivaron si estaban aprobados.');
      loadList(r.data.id);
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo aprobar'));
    }
  };

  const submitApproval = async () => {
    if (!budget) return;
    if (dirty) await saveLines();
    try {
      const r = await planeacionAPI.budgets.submitApproval(tenantId, budget.id);
      setBudget(r.data);
      toast.success('Enviado a aprobación');
      loadList(r.data.id);
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo enviar a aprobación'));
    }
  };

  const archive = async () => {
    if (!budget || !window.confirm('¿Archivar este escenario? Dejará de ser editable.')) return;
    try {
      await planeacionAPI.budgets.archive(tenantId, budget.id);
      toast.success('Archivado');
      loadList();
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo archivar'));
    }
  };

  const removeBudget = async () => {
    if (!budget || !window.confirm('¿Eliminar este escenario de presupuesto?')) return;
    try {
      await planeacionAPI.budgets.delete(tenantId, budget.id);
      setBudget(null);
      setSelectedId(null);
      toast.success('Eliminado');
      loadList();
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo eliminar'));
    }
  };

  const cloneScenario = async () => {
    if (!budget) return;
    const name = window.prompt('Nombre del nuevo escenario', `${budget.name || 'Presupuesto'} (copia)`);
    if (name == null) return;
    try {
      setSaving(true);
      const r = await planeacionAPI.budgets.clone(tenantId, budget.id, { name: name.trim() || undefined });
      toast.success('Escenario duplicado');
      setBudget(r.data);
      setSelectedId(r.data.id);
      setDirty(false);
      onSeeded?.();
      const list = await planeacionAPI.budgets.list(tenantId, { year });
      setScenarios(Array.isArray(list.data) ? list.data : (list.data?.results || []));
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo duplicar'));
    } finally {
      setSaving(false);
    }
  };

  const renameScenario = async (name) => {
    if (!budget || locked) return;
    try {
      const r = await planeacionAPI.budgets.update(tenantId, budget.id, { name });
      setBudget(b => ({ ...b, name: r.data.name }));
      setScenarios(list => list.map(s => s.id === budget.id ? { ...s, name: r.data.name } : s));
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo renombrar'));
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
    if (!window.confirm('¿Eliminar esta partida del escenario?')) return;
    setBudget(b => ({ ...b, lines: b.lines.filter(l => l.id !== id) }));
    setDirty(true);
  };

  const locked = isReadOnly || ['archivado', 'aprobado', 'en_aprobacion'].includes(budget?.status);
  const lines = (budget?.lines || []).filter(l => l.kind === kind);
  const totals = budget?.totals || {};

  if (loading && !budget) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-400)' }}>Cargando presupuesto…</div>;
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
        <select className="field-select" value={year} onChange={e => setYear(Number(e.target.value))} style={{ width: 120 }}>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        {scenarios.length > 0 && (
          <select
            className="field-select"
            value={selectedId || ''}
            onChange={e => openScenario(e.target.value)}
            style={{ minWidth: 220 }}
          >
            {scenarios.map(s => (
              <option key={s.id} value={s.id}>
                {s.name || `Escenario ${year}`} · {BUDGET_STATUS[s.status]?.label || s.status}
              </option>
            ))}
          </select>
        )}
        {budget && <Pill map={BUDGET_STATUS} value={budget.status} />}
        {budget?.status === 'aprobado' && (
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--teal-700)' }}>Aprobado final del año</span>
        )}
        {dirty && !locked && <span style={{ fontSize: 12, color: '#92400e' }}>Cambios sin guardar</span>}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {budget && (
            <button className="btn btn-outline" onClick={printPlaneacion}><Printer size={14} /> Imprimir</button>
          )}
          {budget && !isReadOnly && (
            <button className="btn btn-outline" onClick={cloneScenario}><Copy size={14} /> Duplicar escenario</button>
          )}
          {!isReadOnly && scenarios.length > 0 && (
            <button className="btn btn-outline" disabled={saving} onClick={() => {
              const name = window.prompt('Nombre del nuevo escenario', `Escenario ${scenarios.length + 1} · ${year}`);
              if (name == null) return;
              seed(name);
            }}>
              <Plus size={14} /> Nuevo escenario
            </button>
          )}
          {budget && !locked && (
            <>
              <button className="btn btn-outline" onClick={addLine}><Plus size={14} /> Partida</button>
              <button className="btn btn-primary" disabled={saving || !dirty} onClick={saveLines}>Guardar</button>
              {budget.status === 'borrador' && (
                flowEnabled(ctx)
                  ? <button className="btn btn-outline" onClick={submitApproval}><Send size={14} /> Enviar a aprobación</button>
                  : <button className="btn btn-outline" onClick={approve}><Check size={14} /> Aprobar</button>
              )}
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
          <p style={{ color: 'var(--ink-400)', fontSize: 13, maxWidth: 560, margin: '0 auto 18px' }}>
            Homly lo arma con la cuota y las unidades que indiques (máximo {maxUnits || ctx?.units_active || 0} unidades activas)
            y las categorías de ingresos y gastos de Configuración.
          </p>
          {!isReadOnly && (
            <div style={{ maxWidth: 520, margin: '0 auto', display: 'grid', gap: 10, textAlign: 'left' }}>
              <div className="field">
                <div className="field-label">Nombre del escenario</div>
                <input className="field-input" value={seedName} onChange={e => setSeedName(e.target.value)} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="field">
                  <div className="field-label">Unidades (máx. {maxUnits})</div>
                  <input className="field-input" type="number" min="0" max={maxUnits || undefined} value={seedUnits} onChange={e => setSeedUnits(e.target.value)} />
                </div>
                <div className="field">
                  <div className="field-label">Cuota ({currencySymbol(currency)})</div>
                  <input className="field-input" type="number" min="0" step="0.01" value={seedFee} onChange={e => setSeedFee(e.target.value)} />
                </div>
              </div>
              <button className="btn btn-primary" disabled={saving} onClick={seed}>
                <Sparkles size={14} /> Crear presupuesto con datos del condominio
              </button>
            </div>
          )}
        </div>
      ) : (
        <>
          <SeedVarsPanel
            budget={budget}
            ctx={ctx}
            locked={locked}
            currency={currency}
            maxUnits={maxUnits}
            onRename={renameScenario}
            onApplied={(next) => { setBudget(next); setDirty(false); }}
            tenantId={tenantId}
          />

          <CashflowPanel
            budget={budget}
            locked={locked}
            currency={currency}
            tenantId={tenantId}
            onSaved={(next) => setBudget(next)}
          />

          <ApprovalPanel
            steps={budget.approval_steps}
            status={budget.status}
            userId={user?.id}
            onSubmit={submitApproval}
            onApprove={async (notes) => {
              const r = await planeacionAPI.budgets.approveStep(tenantId, budget.id, { notes });
              setBudget(r.data);
              toast.success(r.data.status === 'aprobado' ? 'Presupuesto aprobado' : 'Paso aprobado');
              loadList(r.data.id);
            }}
            onReject={async (notes) => {
              const r = await planeacionAPI.budgets.rejectStep(tenantId, budget.id, { notes });
              setBudget(r.data);
              toast.success('Devuelto a borrador');
              loadList(r.data.id);
            }}
            flowOn={flowEnabled(ctx)}
            canSubmit={!locked && budget.status === 'borrador' && !isReadOnly}
          />

          <div className="cob-stats" style={{ marginBottom: 14 }}>
            <Mini label="Ingresos brutos" value={fmtCurrency(totals.income, currency)} sub={totals.actual_income != null ? `Real ${fmtCurrency(totals.actual_income, currency)}` : ''} />
            <Mini label="Descuentos de cobranza" value={fmtCurrency(totals.discount_total || 0, currency)} sub={`${(totals.discounts || []).length} incentivo(s)`} />
            <Mini label="Ingreso neto" value={fmtCurrency(totals.net_income ?? totals.income, currency)} sub="Después de incentivos" />
            <Mini
              label={totals.surplus >= 0 ? 'Superávit neto' : 'Déficit neto'}
              value={fmtCurrency(totals.surplus, currency)}
              sub={totals.expense ? `${Math.round(((totals.net_income ?? totals.income) / (totals.expense || 1)) * 100)}% cubierto` : ''}
            />
          </div>

          {(totals.expense > (totals.net_income ?? totals.income)) && ctx?.units_billable > 0 && (
            <div className="plan-hint">
              <AlertTriangle size={14} /> El gasto anual supera el ingreso neto.
              Faltarían {fmtCurrency((totals.expense - (totals.net_income ?? totals.income)) / 12 / ctx.units_billable, currency)} extra por unidad al mes para equilibrar.
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
                              {n ? fmtCurrency(n, currency) : '—'}
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
                            <button className="btn btn-outline btn-sm" style={{ marginLeft: 4 }} onClick={() => removeLine(line.id)}><Trash2 size={12} /></button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <BudgetPrintLayout budget={budget} ctx={ctx} currency={currency} />
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

function SeedVarsPanel({ budget, ctx, locked, currency, maxUnits, onRename, onApplied, tenantId }) {
  const [name, setName] = useState(budget.name || '');
  const [units, setUnits] = useState(budget.seed_units || ctx?.units_billable || 0);
  const [fee, setFee] = useState(Number(budget.seed_fee) || ctx?.maintenance_fee || 0);
  const [saving, setSaving] = useState(false);
  const monthly = (Number(units) || 0) * (Number(fee) || 0);

  useEffect(() => {
    setName(budget.name || '');
    setUnits(budget.seed_units || ctx?.units_billable || 0);
    setFee(Number(budget.seed_fee) || ctx?.maintenance_fee || 0);
  }, [budget.id, budget.name, budget.seed_units, budget.seed_fee]);

  const apply = async () => {
    if (maxUnits && Number(units) > maxUnits) {
      toast.error(`Las unidades no pueden superar ${maxUnits}`);
      return;
    }
    try {
      setSaving(true);
      if (name.trim() && name.trim() !== budget.name) await onRename(name.trim());
      const r = await planeacionAPI.budgets.applySeed(tenantId, budget.id, { units: Number(units) || 0, fee: Number(fee) || 0 });
      onApplied(r.data);
      toast.success('Sugerido actualizado (cuota y extras de ingreso que siguen en el escenario)');
    } catch (e) {
      toast.error(errMsg(e, 'No se pudieron aplicar las variables'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card" style={{ padding: 14, marginBottom: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 8, color: 'var(--ink-600)' }}>Variables del sugerido</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr auto', gap: 10, alignItems: 'end' }}>
        <div className="field" style={{ margin: 0 }}>
          <div className="field-label">Nombre del escenario</div>
          <input className="field-input" value={name} disabled={locked} onChange={e => setName(e.target.value)} onBlur={() => { if (!locked && name.trim() && name.trim() !== budget.name) onRename(name.trim()); }} />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <div className="field-label">Unidades (máx. {maxUnits})</div>
          <input className="field-input" type="number" min="0" max={maxUnits || undefined} disabled={locked} value={units} onChange={e => setUnits(e.target.value)} />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <div className="field-label">Cuota mensual ({currencySymbol(currency)})</div>
          <input className="field-input" type="number" min="0" step="0.01" disabled={locked} value={fee} onChange={e => setFee(e.target.value)} />
        </div>
        {!locked && (
          <button className="btn btn-outline" disabled={saving} onClick={apply}>Aplicar al sugerido</button>
        )}
      </div>
      <div style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: 8 }}>
        Ingreso mensual de cuota: {fmtCurrency(monthly, currency)} · anual {fmtCurrency(monthly * 12, currency)}.
        No se recrean partidas que hayas eliminado.
      </div>
    </div>
  );
}

function CashflowPanel({ budget, locked, currency, tenantId, onSaved }) {
  const [rules, setRules] = useState(budget.cashflow_rules || []);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setRules(budget.cashflow_rules || []); }, [budget.id, budget.cashflow_rules]);

  const add = () => {
    setRules(r => [...r, {
      id: `tmp-${Date.now()}`, name: 'Pronto pago', pct: 5, takeup_pct: 40, apply_to: 'ingresos',
    }]);
  };

  const save = async () => {
    try {
      setSaving(true);
      await planeacionAPI.budgets.update(tenantId, budget.id, { cashflow_rules: rules });
      const full = await planeacionAPI.budgets.get(tenantId, budget.id, { include_actuals: 1 });
      onSaved(full.data);
      toast.success('Incentivos de cobranza guardados');
    } catch (e) {
      toast.error(errMsg(e, 'No se pudieron guardar los descuentos'));
    } finally {
      setSaving(false);
    }
  };

  const discounts = budget.totals?.discounts || [];

  return (
    <div className="card" style={{ padding: 14, marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--ink-600)' }}>
          <Percent size={13} style={{ verticalAlign: -1 }} /> Incentivos de flujo de caja
        </div>
        {!locked && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-outline btn-sm" onClick={add}><Plus size={12} /> Incentivo</button>
            <button className="btn btn-primary btn-sm" disabled={saving} onClick={save}>Guardar incentivos</button>
          </div>
        )}
      </div>
      <p style={{ fontSize: 12, color: 'var(--ink-400)', margin: '0 0 10px' }}>
        El descuento estimado es ingreso × % descuento × % de unidades que lo toman. Sirve para presentar a asamblea el efecto de pronto pago u otros incentivos, sin mezclarlo con las partidas.
      </p>
      {rules.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>Sin incentivos. Agrega uno para modelar descuentos de cobranza.</div>
      ) : rules.map((rule, idx) => (
        <div key={rule.id || idx} style={{ display: 'grid', gridTemplateColumns: '1.4fr 90px 90px 1.1fr auto', gap: 8, marginBottom: 8, alignItems: 'center' }}>
          <input className="field-input" disabled={locked} value={rule.name} onChange={e => setRules(rs => rs.map((x, i) => i === idx ? { ...x, name: e.target.value } : x))} />
          <input className="field-input" type="number" min="0" max="100" step="0.1" disabled={locked} value={rule.pct} onChange={e => setRules(rs => rs.map((x, i) => i === idx ? { ...x, pct: e.target.value } : x))} title="% descuento" />
          <input className="field-input" type="number" min="0" max="100" step="0.1" disabled={locked} value={rule.takeup_pct} onChange={e => setRules(rs => rs.map((x, i) => i === idx ? { ...x, takeup_pct: e.target.value } : x))} title="% adopción" />
          <select className="field-select" disabled={locked} value={rule.apply_to} onChange={e => setRules(rs => rs.map((x, i) => i === idx ? { ...x, apply_to: e.target.value } : x))}>
            <option value="ingresos">Sobre ingresos totales</option>
            <option value="maintenance">Solo cuota de mantenimiento</option>
          </select>
          {!locked && (
            <button className="btn btn-outline btn-sm" onClick={() => setRules(rs => rs.filter((_, i) => i !== idx))}><Trash2 size={12} /></button>
          )}
        </div>
      ))}
      {discounts.length > 0 && (
        <div style={{ fontSize: 12, color: 'var(--ink-600)', marginTop: 6 }}>
          {discounts.map(d => (
            <div key={d.id}>{d.name}: {d.pct}% × {d.takeup_pct}% adopción = {fmtCurrency(d.amount, currency)}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function ApprovalPanel({ steps, status, userId, onApprove, onReject, flowOn }) {
  const [notes, setNotes] = useState('');
  if (!flowOn && status !== 'en_aprobacion') return null;
  const pending = (steps || []).find(s => s.status === 'pending');
  const isMine = pending && String(pending.user_id) === String(userId);

  return (
    <div className="card" style={{ padding: 14, marginBottom: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 8, color: 'var(--ink-600)' }}>Flujo de aprobación</div>
      {(steps || []).length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>
          {status === 'borrador' ? 'Configura los aprobadores y envía este escenario a asamblea.' : 'Sin pasos registrados.'}
        </div>
      ) : (
        <ol className="plan-flow-steps">
          {(steps || []).map(s => (
            <li key={s.order} className={`plan-flow-step is-${s.status || 'pending'}`}>
              <strong>{s.label || `Paso ${s.order}`}</strong>
              <span> · {s.user_name || 'Sin asignar'}</span>
              <span style={{ color: 'var(--ink-400)' }}> · {s.status === 'approved' ? 'Aprobado' : s.status === 'rejected' ? 'Rechazado' : 'Pendiente'}</span>
              {s.notes && <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>{s.notes}</div>}
            </li>
          ))}
        </ol>
      )}
      {status === 'en_aprobacion' && isMine && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <input className="field-input" placeholder="Comentario (obligatorio al rechazar)" value={notes} onChange={e => setNotes(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
          <button className="btn btn-primary" onClick={() => onApprove(notes)}><Check size={14} /> Aprobar paso</button>
          <button className="btn btn-outline" onClick={() => {
            if (!notes.trim()) { toast.error('Indica el motivo del rechazo'); return; }
            onReject(notes.trim());
          }}>Rechazar</button>
        </div>
      )}
    </div>
  );
}

function PlanningFlowModal({ ctx, tenantId, onClose, onSaved }) {
  const [flow, setFlow] = useState({
    enabled: !!(ctx?.planning_flow?.enabled),
    steps: [...(ctx?.planning_flow?.steps || [])],
  });
  const [userId, setUserId] = useState('');
  const [label, setLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const approvers = ctx?.approvers || [];

  const addStep = () => {
    const u = approvers.find(a => String(a.user_id) === String(userId));
    if (!u) return;
    setFlow(f => ({
      ...f,
      steps: [...f.steps, {
        order: f.steps.length + 1,
        user_id: u.user_id,
        user_name: u.user_name,
        label: label.trim() || `Paso ${f.steps.length + 1}`,
      }],
    }));
    setUserId('');
    setLabel('');
  };

  const save = async () => {
    try {
      setSaving(true);
      const r = await planeacionAPI.savePlanningFlow(tenantId, flow);
      toast.success('Flujo de aprobación guardado');
      onSaved(r.data);
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo guardar el flujo'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-bg open" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Flujo de aprobación</h3>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: 13, color: 'var(--ink-500)', marginTop: 0 }}>
            Aplica a presupuestos y a proyectos presentados. Si está apagado, admin o tesorero pueden aprobar en un clic.
          </p>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, fontWeight: 600, marginBottom: 14 }}>
            <input type="checkbox" checked={!!flow.enabled} onChange={e => setFlow(f => ({ ...f, enabled: e.target.checked }))} />
            Activar flujo secuencial
          </label>
          {(flow.steps || []).map((s, idx) => (
            <div key={`${s.order}-${idx}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--sand-100)', fontSize: 13 }}>
              <div>
                <strong>{idx + 1}. {s.label}</strong>
                <div style={{ color: 'var(--ink-400)', fontSize: 12 }}>{s.user_name}</div>
              </div>
              <button className="btn btn-outline btn-sm" onClick={() => setFlow(f => ({
                ...f,
                steps: f.steps.filter((_, i) => i !== idx).map((x, i) => ({ ...x, order: i + 1 })),
              }))}><Trash2 size={12} /></button>
            </div>
          ))}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr auto', gap: 8, marginTop: 12 }}>
            <select className="field-select" value={userId} onChange={e => setUserId(e.target.value)}>
              <option value="">Aprobador…</option>
              {approvers.map(a => (
                <option key={a.user_id} value={a.user_id}>{a.user_name} ({ROLE_LBL[a.role] || a.role})</option>
              ))}
            </select>
            <input className="field-input" placeholder="Etiqueta (ej. Tesorero)" value={label} onChange={e => setLabel(e.target.value)} />
            <button className="btn btn-outline" disabled={!userId} onClick={addStep}>Agregar</button>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn btn-outline" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={saving} onClick={save}>Guardar flujo</button>
        </div>
      </div>
    </div>
  );
}

function BudgetPrintLayout({ budget, ctx, currency }) {
  const totals = budget?.totals || {};
  const ingresos = (budget.lines || []).filter(l => l.kind === 'ingreso');
  const gastos = (budget.lines || []).filter(l => l.kind === 'gasto');
  const printTable = (title, rows) => (
    <>
      <h3 style={{ fontSize: 13, margin: '14px 0 6px' }}>{title}</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 4 }}>Concepto</th>
            {MONTH_LBL.map(m => <th key={m} style={{ textAlign: 'right', borderBottom: '1px solid #ddd', padding: 4 }}>{m}</th>)}
            <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd', padding: 4 }}>Anual</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(line => (
            <tr key={line.id}>
              <td style={{ padding: 4, borderBottom: '1px solid #f0f0f0' }}>{line.name}</td>
              {MONTHS.map(m => (
                <td key={m} style={{ textAlign: 'right', padding: 4, borderBottom: '1px solid #f0f0f0' }}>
                  {fmtCurrency(line.monthly_amounts?.[m] || 0, currency)}
                </td>
              ))}
              <td style={{ textAlign: 'right', padding: 4, fontWeight: 700 }}>{fmtCurrency(lineTotal(line.monthly_amounts), currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );

  return (
    <div className="planeacion-print-layout">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#0f766e' }}>Homly · Planeación</div>
          <h2 style={{ margin: '4px 0 0', fontSize: 18 }}>{ctx?.name || 'Condominio'} — Presupuesto {budget.year}</h2>
          <div style={{ fontSize: 12 }}>{budget.name} · {BUDGET_STATUS[budget.status]?.label || budget.status}</div>
        </div>
        <div style={{ textAlign: 'right', fontSize: 11, color: '#57534e' }}>
          <div>Unidades: {budget.seed_units || '—'}</div>
          <div>Cuota: {fmtCurrency(budget.seed_fee, currency)}</div>
          {budget.approved_at && <div>Aprobado: {String(budget.approved_at).slice(0, 10)}</div>}
        </div>
      </div>
      {printTable('Ingresos', ingresos)}
      {printTable('Gastos', gastos)}
      {(totals.discounts || []).length > 0 && (
        <div style={{ marginTop: 12, fontSize: 11 }}>
          <strong>Incentivos de cobranza</strong>
          {(totals.discounts || []).map(d => (
            <div key={d.id}>{d.name}: {fmtCurrency(d.amount, currency)}</div>
          ))}
        </div>
      )}
      <div style={{ marginTop: 14, fontSize: 12 }}>
        <div>Ingresos brutos: {fmtCurrency(totals.income, currency)}</div>
        <div>Descuentos: {fmtCurrency(totals.discount_total || 0, currency)}</div>
        <div>Ingreso neto: {fmtCurrency(totals.net_income ?? totals.income, currency)}</div>
        <div>Gastos: {fmtCurrency(totals.expense, currency)}</div>
        <div style={{ fontWeight: 700 }}>Resultado neto: {fmtCurrency(totals.surplus, currency)}</div>
      </div>
      {(budget.approval_steps || []).length > 0 && (
        <div style={{ marginTop: 12, fontSize: 11 }}>
          <strong>Aprobaciones</strong>
          {(budget.approval_steps || []).map(s => (
            <div key={s.order}>{s.order}. {s.label} — {s.user_name} — {s.status}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function LineModal({ line, currency, locked, onClose, onSave }) {
  const [name, setName] = useState(line.name || '');
  const [amounts, setAmounts] = useState({ ...(line.monthly_amounts || evenMonths(0)) });
  const [annual, setAnnual] = useState(lineTotal(line.monthly_amounts));
  const [monthly, setMonthly] = useState(Number(line.monthly_amounts?.['01']) || 0);
  const sym = currencySymbol(currency);

  const setMonth = (m, v) => {
    const n = { ...amounts, [m]: Number(v) || 0 };
    setAmounts(n);
    setAnnual(lineTotal(n));
  };

  const spread = () => {
    const n = evenMonths(annual);
    setAmounts(n);
    setMonthly(n['01'] || 0);
  };

  const replicate = () => {
    const n = sameMonths(monthly);
    setAmounts(n);
    setAnnual(lineTotal(n));
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <div className="field" style={{ flex: 1, margin: 0 }}>
                  <div className="field-label">Monto mensual ({sym})</div>
                  <input className="field-input" type="number" min="0" step="0.01" value={monthly} disabled={locked} onChange={e => setMonthly(e.target.value)} />
                </div>
                {!locked && <button className="btn btn-outline" onClick={replicate}>Replicar a 12 meses</button>}
              </div>
            </div>
            <div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <div className="field" style={{ flex: 1, margin: 0 }}>
                  <div className="field-label">Total anual ({sym})</div>
                  <input className="field-input" type="number" min="0" step="0.01" value={annual} disabled={locked} onChange={e => setAnnual(e.target.value)} />
                </div>
                {!locked && <button className="btn btn-outline" onClick={spread}>Repartir en 12 meses</button>}
              </div>
            </div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink-400)', marginBottom: 10 }}>
            Moneda del condominio: {currency} ({sym}). También puedes capturar mes por mes.
          </div>
          <div className="plan-month-grid">
            {MONTHS.map((m, i) => (
              <div className="field" key={m} style={{ margin: 0 }}>
                <div className="field-label">{MONTH_LBL[i]} ({sym})</div>
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

function ProyectosTab({ tenantId, ctx, isReadOnly, user }) {
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
          {[['all', 'Todos'], ['idea', 'Ideas'], ['en_aprobacion', 'En aprobación'], ['en_curso', 'En curso'], ['concluido', 'Concluidos']].map(([k, l]) => (
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
          user={user}
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
  const flowOn = flowEnabled(ctx);

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
                {Object.entries(PROJECT_STATUS).map(([k, v]) => (
                  <option key={k} value={k} disabled={flowOn && k === 'aprobado' && ['idea', 'en_aprobacion'].includes(initial.status || 'idea')}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <div className="field-label">Prioridad</div>
              <select className="field-select" value={form.priority} disabled={isReadOnly} onChange={e => set('priority', e.target.value)}>
                {Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div className="field">
              <div className="field-label">Presupuesto ({currencySymbol(ctx?.currency)})</div>
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

function ProjectDetail({ tenantId, project, ctx, isReadOnly, user, onClose, onRefresh, onEdit, onDelete }) {
  const currency = ctx?.currency || 'MXN';
  const [period, setPeriod] = useState(todayPeriod());
  const [gastos, setGastos] = useState([]);
  const [picked, setPicked] = useState({});
  const [cost, setCost] = useState({ period: todayPeriod(), amount: '', description: '' });
  const over = (project.progress_pct || 0) > 100;
  const flowOn = flowEnabled(ctx);

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

          <ApprovalPanel
            steps={project.approval_steps}
            status={project.status}
            userId={user?.id}
            flowOn={flowOn}
            onApprove={async (notes) => {
              const r = await planeacionAPI.projects.approveStep(tenantId, project.id, { notes });
              toast.success(r.data.status === 'aprobado' ? 'Proyecto aprobado' : 'Paso aprobado');
              onRefresh();
            }}
            onReject={async (notes) => {
              await planeacionAPI.projects.rejectStep(tenantId, project.id, { notes });
              toast.success('Proyecto devuelto a idea');
              onRefresh();
            }}
          />

          {!isReadOnly && project.status === 'idea' && (
            <div style={{ marginBottom: 14 }}>
              <button className="btn btn-outline" onClick={async () => {
                try {
                  const r = await planeacionAPI.projects.submitApproval(tenantId, project.id);
                  toast.success(r.data.status === 'aprobado' ? 'Proyecto aprobado' : 'Enviado a aprobación');
                  onRefresh();
                } catch (e) {
                  toast.error(errMsg(e, 'No se pudo enviar a aprobación'));
                }
              }}>
                {flowOn ? <><Send size={14} /> Enviar a aprobación</> : <><Check size={14} /> Aprobar proyecto</>}
              </button>
            </div>
          )}

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
                <input type="number" className="field-input" placeholder={`Monto (${currencySymbol(currency)})`} value={cost.amount} onChange={e => setCost(c => ({ ...c, amount: e.target.value }))} />
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
