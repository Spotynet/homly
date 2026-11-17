import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  AlertTriangle, ArrowRight, Banknote, Building2, CheckCircle, Cpu, Hammer, Info, PiggyBank, Plus,
  RefreshCw, TrendingUp, Wallet,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTenantAccess } from '../../context/TenantAccessContext';
import { rentalAPI } from '../../api/client';
import { Empty, PageHead } from './opsUi';
import { printCurrentReport, ReportHeader } from './reportBrand';
import {
  BudgetBar, COLORS, compact, HealthBadge, mon, pctTxt, Progress, StatusChip,
} from './capexUi';
import ProjectsTab from './CapexProjects';
import LedgerTab from './CapexLedger';
import BudgetTab from './CapexBudget';
import ExpenseModal from './CapexExpenseModal';

const TABS = [
  { key: 'resumen', label: 'Resumen' },
  { key: 'proyectos', label: 'Proyectos CAPEX' },
  { key: 'gastos', label: 'OPEX y gastos' },
  { key: 'presupuesto', label: 'Presupuesto' },
];

const TOOLTIP = {
  background: 'white', border: '1px solid var(--sand-100)', borderRadius: 10,
  boxShadow: '0 4px 16px rgba(0,0,0,0.10)', fontSize: 12,
};

export default function RentalCapex() {
  const { tenantId } = useAuth();
  const { can } = useTenantAccess();
  const canWrite = can('rentas_capex');
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(t => t.key === params.get('tab')) ? params.get('tab') : 'resumen';
  const openId = params.get('project') || null;

  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [summary, setSummary] = useState(null);
  const [projects, setProjects] = useState([]);
  const [lines, setLines] = useState([]);
  const [properties, setProperties] = useState([]);
  const [assets, setAssets] = useState([]);
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [prefill, setPrefill] = useState(null);
  const [quickExpense, setQuickExpense] = useState(false);

  const go = useCallback((next) => {
    const p = new URLSearchParams(params);
    Object.entries(next).forEach(([k, v]) => { if (v) p.set(k, v); else p.delete(k); });
    setParams(p, { replace: false });
  }, [params, setParams]);

  const load = useCallback(async (soft) => {
    soft ? setRefreshing(true) : setLoading(true);
    try {
      const api = rentalAPI.ops.finance;
      const [s, p, b] = await Promise.all([
        api.summary(tenantId, { year }),
        api.projects.list(tenantId),
        api.budget.list(tenantId, { year }),
      ]);
      setSummary(s.data);
      setProjects(p.data || []);
      setLines(b.data || []);
    } catch {
      toast.error('No se pudo cargar CAPEX y OPEX');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tenantId, year]);

  useEffect(() => { if (tenantId) load(false); }, [tenantId, year]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!tenantId) return;
    Promise.all([
      rentalAPI.properties.list(tenantId, { page_size: 500 }),
      rentalAPI.ops.assets.list(tenantId, { active: 1 }),
      rentalAPI.maintenance.providers.list(tenantId),
    ]).then(([pr, as, pv]) => {
      setProperties(pr.data.results || pr.data || []);
      setAssets(as.data || []);
      setProviders(pv.data || []);
    }).catch(() => {});
  }, [tenantId]);

  const reload = () => load(true);
  const years = useMemo(() => [thisYear - 3, thisYear - 2, thisYear - 1, thisYear, thisYear + 1], [thisYear]);

  if (loading || !summary) {
    return <div className="content-fade" style={{ padding: 40, textAlign: 'center', color: 'var(--ink-400)' }}>Cargando CAPEX y OPEX…</div>;
  }

  const startProjectFrom = (c) => {
    setPrefill({
      name: `Reposición de ${c.name}`, category: 'equipamiento', property: c.property, asset: c.id,
      budget_amount: c.purchase_cost || '', justification: `${c.code} · ${c.reason}`,
      priority: ['critica', 'alta'].includes(c.criticality) ? 'alta' : 'media',
    });
    go({ tab: 'proyectos', project: null });
  };

  return (
    <div className="content-fade rental-report-print">
      <div className="no-print">
      <PageHead
        title="CAPEX y OPEX"
        subtitle="Inversión y gasto operativo de toda tu cartera en un solo lugar: presupuesto, ejecución, avance de proyectos y resultado por propiedad."
      >
        <select className="field-select" style={{ width: 96 }} value={year} onChange={e => setYear(Number(e.target.value))}>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <button className="btn btn-outline" onClick={reload} disabled={refreshing} title="Actualizar"><RefreshCw size={14} className={refreshing ? 'spin' : ''} /></button>
        {canWrite && <button className="btn btn-outline" onClick={() => setQuickExpense(true)}><Wallet size={14} /> Registrar gasto</button>}
        {canWrite && <button className="btn btn-primary" onClick={() => { setPrefill({}); go({ tab: 'proyectos', project: null }); }}><Plus size={14} /> Nuevo proyecto</button>}
        <button className="btn btn-outline" onClick={printCurrentReport} title="Imprimir o guardar como PDF">Imprimir / PDF</button>
      </PageHead>
      </div>

      <ReportHeader
        title={`CAPEX y OPEX ${year}${TABS.find(t => t.key === tab) && tab !== 'resumen' ? ` · ${TABS.find(t => t.key === tab).label}` : ' · Resumen'}`}
        subtitle="Inversión y gasto operativo de la cartera"
      />

      <div className="tabs no-print" style={{ marginBottom: 16 }}>
        {TABS.map(t => (
          <button key={t.key} className={`tab ${tab === t.key ? 'active' : ''}`} onClick={() => go({ tab: t.key === 'resumen' ? null : t.key, project: null })}>
            {t.label}
            {t.key === 'proyectos' && summary.kpis.projects_at_risk > 0 && (
              <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 800, background: 'var(--coral-50)', color: 'var(--coral-600)', padding: '1px 7px', borderRadius: 99 }}>{summary.kpis.projects_at_risk}</span>
            )}
          </button>
        ))}
      </div>

      {tab === 'resumen' && <Overview s={summary} year={year} go={go} onCandidate={startProjectFrom} canWrite={canWrite} />}

      {tab === 'proyectos' && (
        <ProjectsTab
          tenantId={tenantId} canWrite={canWrite} projects={projects} properties={properties} assets={assets}
          providers={providers} reload={reload} openId={openId} onOpen={(id) => go({ project: id })}
          prefill={prefill} onPrefillUsed={() => setPrefill(null)}
        />
      )}

      {tab === 'gastos' && (
        <LedgerTab
          tenantId={tenantId} canWrite={canWrite} year={year} projects={projects} properties={properties}
          providers={providers} onChanged={reload} onOpenProject={(id) => go({ tab: 'proyectos', project: id })}
        />
      )}

      {tab === 'presupuesto' && (
        <BudgetTab tenantId={tenantId} canWrite={canWrite} year={year} lines={lines} summary={summary} properties={properties} reload={reload} />
      )}

      {quickExpense && (
        <ExpenseModal
          tenantId={tenantId} projects={projects} properties={properties} providers={providers}
          onClose={() => setQuickExpense(false)} onSaved={() => { setQuickExpense(false); reload(); }}
        />
      )}
    </div>
  );
}

/* ───────────────────────── Resumen ───────────────────────── */
function delta(cur, prev) {
  if (!prev) return null;
  return ((cur - prev) / prev) * 100;
}

function Trend({ value, goodWhenDown }) {
  if (value == null) return null;
  const up = value > 0;
  const good = goodWhenDown ? !up : up;
  return (
    <span style={{ fontWeight: 800, color: Math.abs(value) < 0.5 ? 'var(--ink-400)' : good ? 'var(--teal-700)' : 'var(--coral-600)' }}>
      {up ? '▲' : '▼'} {Math.abs(value).toFixed(0)}%
    </span>
  );
}

function Overview({ s, year, go, onCandidate, canWrite }) {
  const k = s.kpis;
  const prev = s.prev_year || {};
  const eq = s.equipment || {};
  const empty = !k.income && !k.opex && !k.capex && !s.projects.length && !s.categories.length;

  const catRows = s.categories.slice(0, 8);
  const maxCat = Math.max(1, ...catRows.map(c => Math.max(c.actual, c.budget_ytd)));

  return (
    <>
      <div className="rd-kpis">
        <div className="rd-kpi">
          <div className="rd-kpi-top"><span className="rd-kpi-label">Ingresos cobrados</span><span className="rd-kpi-icon" style={{ background: 'var(--teal-50)', color: 'var(--teal-600)' }}><Banknote size={16} /></span></div>
          <div className="rd-kpi-value">{mon(k.income)}</div>
          <div className="rd-kpi-sub">{prev.income ? <><Trend value={delta(k.income, prev.income)} /> vs {year - 1} ({compact(prev.income)})</> : 'Pagos de contratos del año'}</div>
        </div>

        <div className="rd-kpi">
          <div className="rd-kpi-top"><span className="rd-kpi-label">OPEX del año</span><span className="rd-kpi-icon" style={{ background: 'var(--blue-50)', color: 'var(--blue-600)' }}><Wallet size={16} /></span></div>
          <div className="rd-kpi-value">{mon(k.opex)}</div>
          {k.opex_budget_year > 0 ? (
            <>
              <BudgetBar budget={k.opex_budget_year} spent={k.opex} committed={k.opex_committed} height={8} showText={false} />
              <div className="rd-kpi-sub">
                {k.opex_variance_pct != null && <b style={{ color: k.opex_variance_pct > 5 ? 'var(--coral-600)' : 'var(--teal-700)' }}>{k.opex_variance_pct > 0 ? '+' : ''}{k.opex_variance_pct}%</b>} vs presupuesto acumulado · anual {compact(k.opex_budget_year)}
              </div>
            </>
          ) : (
            <div className="rd-kpi-sub">{prev.opex ? <><Trend value={delta(k.opex, prev.opex)} goodWhenDown /> vs {year - 1}</> : 'Aún sin presupuesto OPEX'}{k.opex_budget_year === 0 && <> · <button className="cx-link" onClick={() => go({ tab: 'presupuesto' })}>Definir</button></>}</div>
          )}
        </div>

        <div className="rd-kpi">
          <div className="rd-kpi-top"><span className="rd-kpi-label">Resultado operativo (NOI)</span><span className="rd-kpi-icon" style={{ background: k.noi >= 0 ? 'var(--teal-50)' : 'var(--coral-50)', color: k.noi >= 0 ? 'var(--teal-600)' : 'var(--coral-500)' }}><TrendingUp size={16} /></span></div>
          <div className="rd-kpi-value" style={{ color: k.noi < 0 ? 'var(--coral-600)' : undefined }}>{mon(k.noi)}</div>
          <div className="rd-kpi-sub">{k.noi_margin != null ? `Margen ${k.noi_margin}%` : 'Ingresos − OPEX'}{k.opex_ratio != null && ` · OPEX = ${k.opex_ratio}% del ingreso`}</div>
        </div>

        <div className="rd-kpi">
          <div className="rd-kpi-top"><span className="rd-kpi-label">CAPEX ejecutado</span><span className="rd-kpi-icon" style={{ background: '#f3e8ff', color: '#7c3aed' }}><PiggyBank size={16} /></span></div>
          <div className="rd-kpi-value">{mon(k.capex)}</div>
          {k.capex_budget_year > 0 ? (
            <>
              <BudgetBar budget={k.capex_budget_year} spent={k.capex} committed={k.capex_committed} height={8} showText={false} />
              <div className="rd-kpi-sub">de {compact(k.capex_budget_year)} de techo anual</div>
            </>
          ) : (
            <div className="rd-kpi-sub">{k.capex_committed > 0 ? `${compact(k.capex_committed)} comprometido · ` : ''}{k.projects_active} proyecto(s) activos</div>
          )}
        </div>
      </div>

      <div className="rd-mini-grid" style={{ marginBottom: 16 }}>
        <div className="rd-mini"><div className="rd-mini-label">OPEX por propiedad</div><div className="rd-mini-value">{k.opex_per_property != null ? mon(k.opex_per_property) : '—'}</div><div className="rd-mini-sub">{s.properties_count} propiedad(es) activas</div></div>
        <div className="rd-mini"><div className="rd-mini-label">Cartera CAPEX activa</div><div className="rd-mini-value">{mon(k.capex_active_budget)}</div><div className="rd-mini-sub">{mon(k.capex_active_spent)} ejecutado</div></div>
        <div className="rd-mini" style={k.projects_at_risk ? { borderColor: 'var(--coral-100)' } : undefined}><div className="rd-mini-label">Proyectos en riesgo</div><div className="rd-mini-value" style={{ color: k.projects_at_risk ? 'var(--coral-600)' : undefined }}>{k.projects_at_risk}</div><div className="rd-mini-sub">de {k.projects_active} activos</div></div>
        <div className="rd-mini"><div className="rd-mini-label">Valor en libros de equipos</div><div className="rd-mini-value">{compact(eq.book_value)}</div><div className="rd-mini-sub">costo original {compact(eq.total_cost)} · {eq.count} equipos</div></div>
      </div>

      {s.alerts.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-head"><h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><AlertTriangle size={16} color="var(--amber-600)" /> Requiere tu atención</h3></div>
          <div className="rd-alerts">
            {s.alerts.map((a, i) => (
              <div key={i} className={`rd-alert ${a.level === 'critico' ? 'rd-alert-high' : a.level === 'riesgo' ? 'rd-alert-medium' : 'rd-alert-info'}`}>
                {a.level === 'info' ? <Info size={16} /> : <AlertTriangle size={16} />}
                <div style={{ flex: 1 }}><div className="rd-alert-title">{a.text}</div></div>
                <button className="btn btn-outline btn-sm" onClick={() => go({ tab: a.tab === 'resumen' ? null : a.tab, project: a.type === 'proyecto' ? a.id : null })}>
                  Ver <ArrowRight size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {empty && (
        <Empty icon={Wallet} text="Todavía no hay datos financieros este año. Registra gastos, crea un proyecto CAPEX o define un presupuesto para empezar a ver el panorama completo." />
      )}

      {!empty && (
        <>
          <div className="rd-grid-21">
            <div className="card">
              <div className="card-head"><h3>Ingresos, OPEX y CAPEX por mes</h3></div>
              <div className="rd-card-body">
                <ResponsiveContainer width="100%" height={280}>
                  <ComposedChart data={s.monthly} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#EFE9DD" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={compact} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={52} />
                    <Tooltip contentStyle={TOOLTIP} formatter={(v) => mon(v)} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="opex" name="OPEX" fill={COLORS.blue} radius={[4, 4, 0, 0]} maxBarSize={22} />
                    <Bar dataKey="capex" name="CAPEX" fill={COLORS.purple} radius={[4, 4, 0, 0]} maxBarSize={22} />
                    <Line type="monotone" dataKey="income" name="Ingresos" stroke={COLORS.teal} strokeWidth={2.5} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="opex_budget" name="Presupuesto OPEX" stroke={COLORS.amber} strokeWidth={2} strokeDasharray="5 4" dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="card">
              <div className="card-head"><h3>OPEX por categoría</h3></div>
              <div className="rd-card-body">
                {catRows.length === 0 && <div className="rd-empty">Sin gastos operativos registrados.</div>}
                {catRows.map(c => {
                  const over = c.budget_ytd > 0 && c.actual > c.budget_ytd * 1.05;
                  return (
                    <div key={c.key} style={{ marginBottom: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4, gap: 8 }}>
                        <span style={{ fontWeight: 600, color: 'var(--ink-800)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.label.replace(/ \(.*\)/, '')}</span>
                        <span style={{ fontWeight: 800, color: over ? 'var(--coral-600)' : undefined }}>{compact(c.actual)}</span>
                      </div>
                      <div style={{ position: 'relative', height: 8, background: 'var(--sand-100)', borderRadius: 99 }}>
                        <div style={{ width: `${(c.actual / maxCat) * 100}%`, height: '100%', background: over ? COLORS.coral : COLORS.blue, borderRadius: 99 }} />
                        {c.budget_ytd > 0 && <div title={`Presupuesto acumulado ${mon(c.budget_ytd)}`} style={{ position: 'absolute', left: `${Math.min(100, (c.budget_ytd / maxCat) * 100)}%`, top: -3, bottom: -3, width: 2, background: 'var(--ink-800)' }} />}
                      </div>
                    </div>
                  );
                })}
                {catRows.some(c => c.budget_ytd > 0) && <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>La marca negra es el presupuesto acumulado a la fecha.</div>}
              </div>
            </div>
          </div>

          <div className="rd-grid-2">
            <div className="card">
              <div className="card-head">
                <h3>Cartera de proyectos CAPEX</h3>
                <button className="btn btn-outline btn-sm" onClick={() => go({ tab: 'proyectos' })}>Ver tablero <ArrowRight size={12} /></button>
              </div>
              <div className="rd-card-body">
                {s.projects.length === 0 && <div className="rd-empty">No hay proyectos abiertos.</div>}
                {s.projects.slice(0, 6).map(p => (
                  <button key={p.id} className="cx-prow" onClick={() => go({ tab: 'proyectos', project: p.id })}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ minWidth: 0 }}>
                        <div className="rd-row-title" style={{ textAlign: 'left' }}>{p.name}</div>
                        <div className="rd-row-sub" style={{ textAlign: 'left' }}>{p.code} · {p.category_label}{p.property_code ? ` · ${p.property_code}` : ''}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                        <StatusChip status={p.status} />
                        {['aprobado', 'en_ejecucion', 'en_pausa'].includes(p.status) && <HealthBadge health={p.health} small />}
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 14, marginTop: 8, alignItems: 'center' }}>
                      <BudgetBar budget={p.budget} spent={p.spent} committed={p.committed} height={6} />
                      <div><Progress value={p.progress} height={5} /><div style={{ fontSize: 11, color: 'var(--ink-500)', marginTop: 3, textAlign: 'left' }}>Avance {p.progress}%</div></div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="card">
              <div className="card-head"><h3><Cpu size={15} style={{ verticalAlign: -2, marginRight: 6 }} />Equipos y reposición</h3></div>
              <div className="rd-card-body">
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 12 }}>
                  <div><div className="rd-mini-label">Costo original</div><div className="rd-mini-value">{compact(eq.total_cost)}</div></div>
                  <div><div className="rd-mini-label">Valor en libros hoy</div><div className="rd-mini-value">{compact(eq.book_value)}</div></div>
                  <div style={{ flex: 1, minWidth: 120, alignSelf: 'center' }}>
                    <Progress value={eq.total_cost ? (eq.book_value / eq.total_cost) * 100 : 0} color={COLORS.tealDark} height={8} />
                    <div style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 3 }}>{eq.total_cost ? pctTxt((eq.book_value / eq.total_cost) * 100) : '—'} del valor original (línea recta según vida útil)</div>
                  </div>
                </div>
                <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--ink-500)', textTransform: 'uppercase', letterSpacing: '.05em', margin: '6px 0' }}>Candidatos a CAPEX ({eq.candidates_count || 0})</div>
                {(eq.candidates || []).length === 0 && <div className="rd-empty" style={{ padding: 14 }}><CheckCircle size={16} style={{ verticalAlign: -3, marginRight: 6, color: 'var(--teal-600)' }} />Ningún equipo requiere reposición por ahora.</div>}
                {(eq.candidates || []).slice(0, 5).map(c => (
                  <div key={c.id} className="rd-row">
                    <div className="rd-row-main">
                      <div className="rd-row-title">{c.code} · {c.name}</div>
                      <div className="rd-row-sub">{c.property_code} · {c.reason}{c.repair_cost ? ` · ${compact(c.repair_cost)} en reparaciones` : ''}</div>
                    </div>
                    {canWrite && <button className="btn btn-outline btn-sm" onClick={() => onCandidate(c)}><Hammer size={12} /> Proyecto</button>}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-head"><h3><Building2 size={15} style={{ verticalAlign: -2, marginRight: 6 }} />Resultado por propiedad</h3></div>
            <div style={{ overflowX: 'auto' }}>
              <table className="table" style={{ minWidth: 640 }}>
                <thead><tr><th>Propiedad</th><th style={{ textAlign: 'right' }}>Ingresos</th><th style={{ textAlign: 'right' }}>OPEX</th><th style={{ textAlign: 'right' }}>NOI</th><th style={{ textAlign: 'right' }}>CAPEX</th><th style={{ width: 140 }}>Margen</th></tr></thead>
                <tbody>
                  {s.properties.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--ink-400)', padding: 20 }}>Sin movimientos por propiedad este año.</td></tr>}
                  {s.properties.map(p => {
                    const margin = p.income > 0 ? (p.noi / p.income) * 100 : null;
                    return (
                      <tr key={p.id || 'general'}>
                        <td><div style={{ fontWeight: 600 }}>{p.name}</div><div style={{ fontSize: 11, color: 'var(--ink-400)' }}>{p.code}</div></td>
                        <td style={{ textAlign: 'right' }}>{mon(p.income, { dash: true })}</td>
                        <td style={{ textAlign: 'right' }}>{mon(p.opex, { dash: true })}</td>
                        <td style={{ textAlign: 'right', fontWeight: 800, color: p.noi < 0 ? 'var(--coral-600)' : 'var(--teal-700)' }}>{mon(p.noi)}</td>
                        <td style={{ textAlign: 'right' }}>{mon(p.capex, { dash: true })}</td>
                        <td>{margin != null ? (<><Progress value={Math.max(0, margin)} color={margin < 30 ? COLORS.amber : COLORS.teal} /><div style={{ fontSize: 11, color: 'var(--ink-500)', marginTop: 3 }}>{margin.toFixed(0)}%</div></>) : <span style={{ color: 'var(--ink-300)' }}>—</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {(s.spaces || []).length > 0 && (
            <div className="card" style={{ marginTop: 16 }}>
              <div className="card-head"><h3><Building2 size={15} style={{ verticalAlign: -2, marginRight: 6 }} />Resultado por espacio (Multi Tenant)</h3></div>
              <div style={{ overflowX: 'auto' }}>
                <table className="table" style={{ minWidth: 720 }}>
                  <thead><tr><th>Espacio</th><th style={{ textAlign: 'right' }}>M²</th><th style={{ textAlign: 'right' }}>Ingresos</th><th style={{ textAlign: 'right' }}>OPEX</th><th style={{ textAlign: 'right' }}>OPEX / m²</th><th style={{ textAlign: 'right' }}>CAPEX</th><th style={{ textAlign: 'right' }}>NOI</th></tr></thead>
                  <tbody>
                    {s.spaces.map(sp => (
                      <tr key={sp.id}>
                        <td><div style={{ fontWeight: 600 }}>{sp.code}{sp.name && sp.name !== sp.code ? ` — ${sp.name}` : ''}</div><div style={{ fontSize: 11, color: 'var(--ink-400)' }}>{sp.property_code} · {sp.property_name}</div></td>
                        <td style={{ textAlign: 'right' }}>{sp.area_m2 ? Number(sp.area_m2).toLocaleString('es-MX') : '—'}</td>
                        <td style={{ textAlign: 'right' }}>{mon(sp.income, { dash: true })}</td>
                        <td style={{ textAlign: 'right' }}>{mon(sp.opex, { dash: true })}</td>
                        <td style={{ textAlign: 'right' }}>{sp.opex_per_m2 != null ? mon(sp.opex_per_m2) : '—'}</td>
                        <td style={{ textAlign: 'right' }}>{mon(sp.capex, { dash: true })}</td>
                        <td style={{ textAlign: 'right', fontWeight: 800, color: sp.noi < 0 ? 'var(--coral-600)' : 'var(--teal-700)' }}>{mon(sp.noi)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
