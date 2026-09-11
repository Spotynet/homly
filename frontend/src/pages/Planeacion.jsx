import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { planeacionAPI, api } from '../api/client';
import { CURRENCIES, fmtCurrency, todayPeriod } from '../utils/helpers';
import toast from 'react-hot-toast';
import {
  Plus, Sparkles, Check, Archive, Trash2, X, Pencil, Wallet,
  FolderKanban, Building2, Users, AlertTriangle, Link2, Calendar,
  Printer, Copy, Settings2, Send, Percent, ChevronDown, SlidersHorizontal,
  Trophy, Paperclip, Landmark, FileText, Award, Download, Upload,
} from 'lucide-react';

const MONTHS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
const MONTH_LBL = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

const BUDGET_STATUS = {
  borrador: { label: 'Borrador', color: 'var(--ink-500)', bg: 'var(--sand-50)' },
  guardado: { label: 'Guardado', color: 'var(--ink-700)', bg: 'var(--sand-100)' },
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
  funding_mode: 'condominio', funding_condo_pct: 100, funding_residents_pct: 0,
  funding_units: 0, funding_notes: '',
};

const FUNDING_MODE = {
  condominio: { label: 'Recursos del condominio' },
  residentes: { label: 'Aportes de residentes' },
  compartido: { label: 'Compartido' },
};

const CONTEST_STATUS = {
  sin_concurso: { label: 'Sin concurso', color: 'var(--ink-500)', bg: 'var(--sand-50)' },
  en_concurso: { label: 'En concurso', color: '#92400e', bg: 'var(--amber-50)' },
  adjudicado: { label: 'Adjudicado', color: 'var(--teal-700)', bg: 'var(--teal-50)' },
};

const FILE_KINDS = {
  cotizacion: 'Cotización',
  plano: 'Plano',
  contrato: 'Contrato',
  foto: 'Foto',
  documento: 'Documento',
  otro: 'Otro',
};

const EMPTY_QUOTE = {
  supplier_name: '', supplier_rfc: '', supplier_contact: '',
  supplier_phone: '', supplier_email: '', supplier_notes: '',
  amount: '', validity_date: '', delivery_days: '', warranty_months: '', scope: '',
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

function isProjectLine(line) {
  if (!line) return false;
  if (line.project_id) return true;
  const key = String(line.concept_key || '');
  return key.startsWith('project:') || key.startsWith('project_income:');
}

async function downloadProtectedFile(url, name) {
  const res = await api.get(url, { responseType: 'blob' });
  const blobUrl = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = name || 'archivo';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);
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
    || list.find(b => b.status === 'guardado')
    || list.find(b => b.status === 'borrador')
    || list[0];
}

function tenantLogoSrc(src) {
  if (!src) return '';
  if (src.startsWith('data:') || src.startsWith('http') || src.startsWith('/')) return src;
  if (src.startsWith('/9j/')) return `data:image/jpeg;base64,${src}`;
  if (src.startsWith('iVBOR')) return `data:image/png;base64,${src}`;
  return `data:image/png;base64,${src}`;
}

function fmtPrintAmt(n, currency, compact = false) {
  const c = CURRENCIES[currency] || CURRENCIES.MXN;
  const num = Number(n) || 0;
  if (!num) return '—';
  return `${c.symbol}${num.toLocaleString('es-MX', {
    minimumFractionDigits: compact ? 0 : 2,
    maximumFractionDigits: compact ? 0 : 2,
  })}`;
}

function printPlaneacion({ title } = {}) {
  const prev = document.title;
  if (title) document.title = title;
  let pageStyle = document.getElementById('planeacion-print-page');
  if (!pageStyle) {
    pageStyle = document.createElement('style');
    pageStyle.id = 'planeacion-print-page';
    document.head.appendChild(pageStyle);
  }
  pageStyle.textContent = '@page { size: letter landscape; margin: 8mm 10mm; }';
  document.body.classList.add('printing-planeacion');
  const done = () => {
    document.body.classList.remove('printing-planeacion');
    pageStyle.textContent = '';
    document.title = prev;
    window.removeEventListener('afterprint', done);
  };
  window.addEventListener('afterprint', done);
  window.print();
  setTimeout(done, 1500);
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

function CollapsibleCard({ title, icon: Icon, summary, defaultOpen = false, children, actions }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="plan-collapse">
      <div className="plan-collapse-row">
        <button type="button" className="plan-collapse-head" onClick={() => setOpen(o => !o)} aria-expanded={open}>
          <ChevronDown
            size={16}
            className={`plan-collapse-chevron ${open ? 'is-open' : ''}`}
          />
          {Icon && <span className="plan-collapse-icon"><Icon size={15} /></span>}
          <span className="plan-collapse-title">{title}</span>
          {!open && summary ? <span className="plan-collapse-summary">{summary}</span> : null}
        </button>
        {open && actions ? <div className="plan-collapse-actions">{actions}</div> : null}
      </div>
      {open && <div className="plan-collapse-body">{children}</div>}
    </div>
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
        <ProyectosTab tenantId={tenantId} ctx={ctx} isReadOnly={isReadOnly} user={user} onCtxRefresh={loadCtx} />
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
  const [kind, setKind] = useState('ingreso');
  const [editing, setEditing] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [seedName, setSeedName] = useState('');
  const [seedUnits, setSeedUnits] = useState('');
  const [seedFee, setSeedFee] = useState('');
  const [budgetName, setBudgetName] = useState('');
  const currency = ctx?.currency || 'MXN';
  const maxUnits = ctx?.max_seed_units || ctx?.units_active || ctx?.units_count || 0;

  useEffect(() => {
    setSeedName(`Presupuesto ${year}`);
    setSeedUnits(ctx?.units_billable ?? '');
    setSeedFee(ctx?.maintenance_fee ?? '');
  }, [year, ctx?.units_billable, ctx?.maintenance_fee]);

  useEffect(() => {
    setBudgetName(budget?.name || '');
  }, [budget?.id, budget?.name]);

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
      setScenarios(list => list.map(s => s.id === r.data.id ? { ...s, status: r.data.status, name: r.data.name } : s));
      toast.success(r.data.status === 'guardado' ? 'Presupuesto guardado' : 'Partidas guardadas');
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
    const line = (budget?.lines || []).find(l => l.id === id);
    if (isProjectLine(line)) {
      toast.error('Esta partida viene de un proyecto. Quítala desde la pestaña Proyectos.');
      return;
    }
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
      <div className="plan-toolbar">
        <div className="plan-id-row">
          <div className="field" style={{ margin: 0 }}>
            <div className="field-label">Año</div>
            <select className="field-select" value={year} onChange={e => setYear(Number(e.target.value))}>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="field plan-id-name" style={{ margin: 0 }}>
            <div className="field-label">Nombre del presupuesto</div>
            <div className="plan-id-name-controls">
              {scenarios.length > 1 && (
                <select
                  className="field-select plan-id-switch"
                  value={selectedId || ''}
                  onChange={e => openScenario(e.target.value)}
                  title="Cambiar escenario"
                >
                  {scenarios.map(s => (
                    <option key={s.id} value={s.id}>{s.name || `Escenario ${year}`}</option>
                  ))}
                </select>
              )}
              <input
                className="field-input"
                value={budget ? budgetName : seedName}
                disabled={budget ? locked : isReadOnly}
                placeholder={budget ? 'Nombre del escenario' : 'Nombre del nuevo presupuesto'}
                onChange={e => {
                  if (budget) setBudgetName(e.target.value);
                  else setSeedName(e.target.value);
                }}
                onBlur={() => {
                  if (budget && !locked && budgetName.trim() && budgetName.trim() !== budget.name) {
                    renameScenario(budgetName.trim());
                  }
                }}
              />
            </div>
          </div>
          <div className="field" style={{ margin: 0 }}>
            <div className="field-label">Estado</div>
            <div className="plan-id-status">
              {budget ? <Pill map={BUDGET_STATUS} value={budget.status} /> : <span className="plan-id-status-empty">Sin presupuesto</span>}
              {budget?.status === 'aprobado' && <span className="plan-toolbar-flag">Final</span>}
              {dirty && !locked && <span className="plan-toolbar-dirty">Sin guardar</span>}
            </div>
          </div>
        </div>
        <div className="plan-toolbar-actions">
          {budget && (
            <button className="btn btn-outline" onClick={() => printPlaneacion({
              title: `Presupuesto ${budget.year} — ${budget.name || ''} — ${ctx?.name || 'Condominio'}`,
            })}><Printer size={14} /> Imprimir</button>
          )}
          {budget && !isReadOnly && (
            <button className="btn btn-outline" onClick={cloneScenario}><Copy size={14} /> Duplicar</button>
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
              {['borrador', 'guardado'].includes(budget.status) && (
                flowEnabled(ctx)
                  ? <button className="btn btn-outline" onClick={submitApproval}><Send size={14} /> Enviar a aprobación</button>
                  : <button className="btn btn-outline" onClick={approve}><Check size={14} /> Aprobar</button>
              )}
              <button className="btn btn-primary" disabled={saving || !dirty} onClick={saveLines}>Guardar</button>
              <button className="btn btn-outline" title="Archivar" onClick={archive}><Archive size={14} /></button>
              {budget.status !== 'aprobado' && <button className="btn btn-outline" title="Eliminar" onClick={removeBudget}><Trash2 size={14} /></button>}
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
          <div className="cob-stats plan-kpis">
            <Mini
              label="Ingresos brutos"
              value={fmtCurrency(totals.income, currency)}
              sub={totals.actual_income != null ? `Real ${fmtCurrency(totals.actual_income, currency)}` : 'Presupuestado anual'}
              accent="teal"
            />
            <Mini
              label="Total gastos"
              value={fmtCurrency(totals.expense, currency)}
              sub={totals.actual_expense != null ? `Real ${fmtCurrency(totals.actual_expense, currency)}` : 'Presupuestado anual'}
              accent="coral"
            />
            <Mini
              label="Descuentos de cobranza"
              value={fmtCurrency(totals.discount_total || 0, currency)}
              sub={`${(totals.discounts || []).length} incentivo(s)`}
            />
            <Mini
              label="Ingreso neto"
              value={fmtCurrency(totals.net_income ?? totals.income, currency)}
              sub="Después de incentivos"
              accent="teal"
            />
            <Mini
              label={totals.surplus >= 0 ? 'Superávit neto' : 'Déficit neto'}
              value={fmtCurrency(totals.surplus, currency)}
              sub={totals.expense ? `${Math.round(((totals.net_income ?? totals.income) / (totals.expense || 1)) * 100)}% cubierto` : ''}
              accent={totals.surplus >= 0 ? 'teal' : 'coral'}
            />
          </div>

          {(totals.expense > (totals.net_income ?? totals.income)) && ctx?.units_billable > 0 && (
            <div className="plan-hint">
              <AlertTriangle size={14} /> El gasto anual supera el ingreso neto.
              Faltarían {fmtCurrency((totals.expense - (totals.net_income ?? totals.income)) / 12 / ctx.units_billable, currency)} extra por unidad al mes para equilibrar.
            </div>
          )}

          <SeedVarsPanel
            budget={budget}
            ctx={ctx}
            locked={locked}
            currency={currency}
            maxUnits={maxUnits}
            onApplied={(next) => {
              setBudget(next);
              setDirty(false);
              setScenarios(list => list.map(s => s.id === next.id ? { ...s, status: next.status, name: next.name } : s));
            }}
            tenantId={tenantId}
          />

          <CashflowPanel
            budget={budget}
            locked={locked}
            currency={currency}
            tenantId={tenantId}
            onSaved={(next) => {
              setBudget(next);
              setScenarios(list => list.map(s => s.id === next.id ? { ...s, status: next.status, name: next.name } : s));
            }}
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
              toast.success('Devuelto a guardado');
              loadList(r.data.id);
            }}
            flowOn={flowEnabled(ctx)}
            canSubmit={!locked && ['borrador', 'guardado'].includes(budget.status) && !isReadOnly}
          />

          <div className="card plan-table-card">
            <div className="plan-table-toolbar">
              <div className="tabs" style={{ marginBottom: 0 }}>
                <button className={`tab ${kind === 'ingreso' ? 'active' : ''}`} onClick={() => setKind('ingreso')}>Ingresos</button>
                <button className={`tab ${kind === 'gasto' ? 'active' : ''}`} onClick={() => setKind('gasto')}>Gastos</button>
              </div>
              <div className="plan-table-toolbar-side">
                <span className="plan-table-count">{lines.length} partida(s)</span>
                {!locked && (
                  <button className="btn btn-outline btn-sm" onClick={addLine}><Plus size={13} /> Partida</button>
                )}
              </div>
            </div>
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
                    const fromProject = isProjectLine(line);
                    return (
                      <tr key={line.id}>
                        <td>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>
                            {line.name || 'Sin nombre'}
                            {fromProject && <span className="plan-line-proj">Proyecto</span>}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>
                            {fromProject
                              ? (line.project_name || 'Ligado a un proyecto')
                              : (line.concept_key === 'maintenance' ? 'Cuota del tenant' : (line.extra_field_label || line.concept_key))}
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
                            {fromProject ? (
                              <span style={{ fontSize: 11, color: 'var(--ink-400)' }}>Desde proyectos</span>
                            ) : (
                              <>
                                <button className="btn btn-outline btn-sm" onClick={() => setEditing(line)}><Pencil size={12} /></button>
                                <button className="btn btn-outline btn-sm" style={{ marginLeft: 4 }} onClick={() => removeLine(line.id)}><Trash2 size={12} /></button>
                              </>
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

function SeedVarsPanel({ budget, ctx, locked, currency, maxUnits, onApplied, tenantId }) {
  const [units, setUnits] = useState(budget.seed_units || ctx?.units_billable || 0);
  const [fee, setFee] = useState(Number(budget.seed_fee) || ctx?.maintenance_fee || 0);
  const [saving, setSaving] = useState(false);
  const monthly = (Number(units) || 0) * (Number(fee) || 0);

  useEffect(() => {
    setUnits(budget.seed_units || ctx?.units_billable || 0);
    setFee(Number(budget.seed_fee) || ctx?.maintenance_fee || 0);
  }, [budget.id, budget.seed_units, budget.seed_fee]);

  const apply = async () => {
    if (maxUnits && Number(units) > maxUnits) {
      toast.error(`Las unidades no pueden superar ${maxUnits}`);
      return;
    }
    try {
      setSaving(true);
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
    <CollapsibleCard
      title="Variables del sugerido"
      icon={SlidersHorizontal}
      summary={`${Number(units) || 0} un. · cuota ${fmtCurrency(fee, currency)}`}
    >
      <div className="plan-seed-grid">
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
    </CollapsibleCard>
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
    <CollapsibleCard
      title="Incentivos de flujo de caja"
      icon={Percent}
      summary={`${rules.length} incentivo(s) · ${fmtCurrency(discounts.reduce((s, d) => s + (Number(d.amount) || 0), 0), currency)}`}
      actions={!locked ? (
        <>
          <button className="btn btn-outline btn-sm" onClick={add}><Plus size={12} /> Incentivo</button>
          <button className="btn btn-primary btn-sm" disabled={saving} onClick={save}>Guardar incentivos</button>
        </>
      ) : null}
    >
      <p style={{ fontSize: 12, color: 'var(--ink-400)', margin: '0 0 10px' }}>
        El descuento estimado es ingreso × % descuento × % de unidades que lo toman. Sirve para presentar a asamblea el efecto de pronto pago u otros incentivos, sin mezclarlo con las partidas.
      </p>
      {rules.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>Sin incentivos. Agrega uno para modelar descuentos de cobranza.</div>
      ) : rules.map((rule, idx) => (
        <div key={rule.id || idx} className="plan-incentive-row">
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
    </CollapsibleCard>
  );
}

function ApprovalPanel({ steps, status, userId, onApprove, onReject, flowOn }) {
  const [notes, setNotes] = useState('');
  const pending = (steps || []).find(s => s.status === 'pending');
  const isMine = pending && String(pending.user_id) === String(userId);
  const done = (steps || []).filter(s => s.status === 'approved').length;
  const total = (steps || []).length;
  const summary = !flowOn && status !== 'en_aprobacion'
    ? 'Aprobación en un clic'
    : status === 'en_aprobacion'
      ? `Paso ${Math.min(done + 1, total || 1)} de ${total || 1}`
      : total ? `${done}/${total} paso(s)` : 'Sin pasos configurados';

  return (
    <CollapsibleCard
      title="Flujo de aprobación"
      icon={Send}
      summary={summary}
      defaultOpen={status === 'en_aprobacion'}
    >
      {!flowOn && status !== 'en_aprobacion' ? (
        <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>
          El flujo está desactivado. Admin o tesorero pueden aprobar este escenario en un clic desde la barra superior. Configúralo con «Flujo de aprobación».
        </div>
      ) : (steps || []).length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>
          {status === 'borrador' || status === 'guardado'
            ? 'Configura los aprobadores y envía este escenario a asamblea.'
            : 'Sin pasos registrados.'}
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
    </CollapsibleCard>
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
  const net = totals.net_income ?? totals.income ?? 0;
  const expense = totals.expense || 0;
  const surplus = totals.surplus ?? (net - expense);
  const coverage = expense ? Math.round((net / expense) * 100) : 0;
  const units = Number(budget.seed_units) || ctx?.units_billable || 0;
  const fee = Number(budget.seed_fee) || ctx?.maintenance_fee || 0;
  const monthlyQuota = units * fee;
  const logo = tenantLogoSrc(ctx?.logo);
  const tenantName = ctx?.razon_social || ctx?.name || 'Condominio';
  const genDate = new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });
  const statusLbl = BUDGET_STATUS[budget.status]?.label || budget.status;
  const surplusPositive = surplus >= 0;

  const monthTotals = (rows) => MONTHS.map(m => rows.reduce((s, l) => s + (Number(l.monthly_amounts?.[m]) || 0), 0));
  const ingMonths = monthTotals(ingresos);
  const gasMonths = monthTotals(gastos);

  const th = {
    background: '#0F5C54', color: '#fff', fontSize: 8, fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: '0.04em',
    padding: '5px 4px', textAlign: 'right', whiteSpace: 'nowrap',
    borderRight: '1px solid rgba(255,255,255,0.12)',
  };
  const td = (extra = {}) => ({
    fontSize: 8, padding: '4px 4px', borderBottom: '1px solid #E7E5E4',
    textAlign: 'right', fontVariantNumeric: 'tabular-nums', verticalAlign: 'middle',
    ...extra,
  });

  const printTable = (title, color, rows, months, annualTotal) => (
    <div style={{ marginTop: 10, breakInside: 'avoid' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        background: color === 'teal' ? '#E6F7F3' : '#FEF3C7',
        borderLeft: `4px solid ${color === 'teal' ? '#0D6E55' : '#B45309'}`,
        padding: '5px 10px',
      }}>
        <span style={{
          fontSize: 10, fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase',
          color: color === 'teal' ? '#0D6E55' : '#92400E', flex: 1,
        }}>{title}</span>
        <span style={{ fontSize: 9, color: '#57534e' }}>{rows.length} partida(s)</span>
        <span style={{ fontSize: 11, fontWeight: 800, color: color === 'teal' ? '#0D6E55' : '#92400E' }}>
          {fmtPrintAmt(annualTotal, currency)}
        </span>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: 'left', width: '18%' }}>Concepto</th>
            {MONTH_LBL.map(m => <th key={m} style={th}>{m}</th>)}
            <th style={{ ...th, background: '#0A4A44' }}>Anual</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={14} style={{ ...td({ textAlign: 'center', color: '#a8a29e', fontStyle: 'italic' }), padding: 10 }}>
                Sin partidas en esta sección
              </td>
            </tr>
          ) : rows.map((line, i) => {
            const annual = lineTotal(line.monthly_amounts);
            return (
              <tr key={line.id} style={{ background: i % 2 === 0 ? '#fff' : '#FAFAF9' }}>
                <td style={td({ textAlign: 'left', fontWeight: 600, color: '#1C1917' })}>
                  {line.name || 'Sin nombre'}
                </td>
                {MONTHS.map(m => (
                  <td key={m} style={td({ color: Number(line.monthly_amounts?.[m]) ? '#1C1917' : '#D6D3D1' })}>
                    {fmtPrintAmt(line.monthly_amounts?.[m], currency, true)}
                  </td>
                ))}
                <td style={td({ fontWeight: 800 })}>{fmtPrintAmt(annual, currency)}</td>
              </tr>
            );
          })}
          <tr>
            <td style={{ ...td({ textAlign: 'right', fontWeight: 800, background: '#F5F5F4' }) }}>Total</td>
            {months.map((n, i) => (
              <td key={MONTHS[i]} style={td({ fontWeight: 700, background: '#F5F5F4' })}>{fmtPrintAmt(n, currency, true)}</td>
            ))}
            <td style={td({ fontWeight: 800, background: '#F5F5F4' })}>{fmtPrintAmt(annualTotal, currency)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );

  const kpis = [
    { label: 'Ingresos brutos', value: fmtPrintAmt(totals.income, currency), sub: 'Anual' },
    { label: 'Incentivos', value: fmtPrintAmt(totals.discount_total || 0, currency), sub: `${(totals.discounts || []).length} regla(s)` },
    { label: 'Ingreso neto', value: fmtPrintAmt(net, currency), sub: 'Después de descuentos' },
    { label: 'Egresos', value: fmtPrintAmt(expense, currency), sub: 'Anual' },
    { label: surplusPositive ? 'Superávit' : 'Déficit', value: fmtPrintAmt(surplus, currency), sub: `${coverage}% cubierto`, accent: surplusPositive ? '#0D6E55' : '#B42318' },
    { label: 'Cuota × unidades', value: fmtPrintAmt(monthlyQuota, currency), sub: `${units} un. · ${fmtPrintAmt(fee, currency)}/mes` },
  ];

  return (
    <div className="planeacion-print-layout" style={{ fontFamily: 'Arial, Helvetica, sans-serif', color: '#1A1612', fontSize: 11 }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        borderBottom: '3px solid #0F5C54', paddingBottom: 10, marginBottom: 12,
      }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          {logo ? (
            <img src={logo} alt="" style={{ width: 56, height: 56, objectFit: 'contain', borderRadius: 6, border: '1px solid #E7E5E4', background: '#fff' }} />
          ) : null}
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#0F5C54', lineHeight: 1.2 }}>{tenantName}</div>
            {ctx?.razon_social && ctx?.name && ctx.razon_social !== ctx.name && (
              <div style={{ fontSize: 10, color: '#57534e', marginTop: 1 }}>{ctx.name}</div>
            )}
            {ctx?.rfc && <div style={{ fontSize: 9, color: '#57534e', marginTop: 2 }}>RFC: <strong>{ctx.rfc}</strong></div>}
            {ctx?.address && <div style={{ fontSize: 9, color: '#78716c', marginTop: 1 }}>{ctx.address}</div>}
            {(ctx?.state || ctx?.country) && (
              <div style={{ fontSize: 9, color: '#78716c' }}>{[ctx.state, ctx.country].filter(Boolean).join(', ')}</div>
            )}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#0F5C54', letterSpacing: '-0.02em' }}>PRESUPUESTO ANUAL</div>
          <div style={{ fontSize: 13, color: '#44403c', marginTop: 2 }}>
            Ejercicio <strong style={{ color: '#0F5C54' }}>{budget.year}</strong>
            {budget.name ? ` · ${budget.name}` : ''}
          </div>
          <div style={{
            marginTop: 6, display: 'inline-block', padding: '3px 10px',
            background: ({
              borrador: '#78716c',
              guardado: '#44403c',
              en_aprobacion: '#1E3A5F',
              aprobado: '#0D6E55',
              archivado: '#a8a29e',
            })[budget.status] || '#1E3A5F',
            color: '#fff', borderRadius: 4, fontSize: 9, fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '0.08em',
          }}>
            {statusLbl}
          </div>
          {budget.approved_at && (
            <div style={{ fontSize: 8, color: '#78716c', marginTop: 4 }}>
              Aprobado {String(budget.approved_at).slice(0, 10)}
              {budget.approved_by_name ? ` · ${budget.approved_by_name}` : ''}
            </div>
          )}
        </div>
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8, marginBottom: 4,
      }}>
        {kpis.map(k => (
          <div key={k.label} style={{
            border: '1px solid #E7E5E4', borderRadius: 6, padding: '8px 10px',
            background: '#FAFAF9',
          }}>
            <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#78716c' }}>
              {k.label}
            </div>
            <div style={{ fontSize: 13, fontWeight: 800, color: k.accent || '#1C1917', marginTop: 2, lineHeight: 1.2 }}>
              {k.value}
            </div>
            <div style={{ fontSize: 8, color: '#a8a29e', marginTop: 2 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {printTable('Ingresos', 'teal', ingresos, ingMonths, totals.income || 0)}
      {printTable('Egresos', 'amber', gastos, gasMonths, expense)}

      {(totals.discounts || []).length > 0 && (
        <div style={{ marginTop: 10, breakInside: 'avoid' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: '#EFF6FF', borderLeft: '4px solid #1D4ED8', padding: '5px 10px',
          }}>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#1D4ED8', flex: 1 }}>
              Incentivos de flujo de caja
            </span>
            <span style={{ fontSize: 11, fontWeight: 800, color: '#1D4ED8' }}>
              {fmtPrintAmt(totals.discount_total, currency)}
            </span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: 'left', background: '#1E3A5F' }}>Incentivo</th>
                <th style={{ ...th, background: '#1E3A5F' }}>% descuento</th>
                <th style={{ ...th, background: '#1E3A5F' }}>% adopción</th>
                <th style={{ ...th, background: '#1E3A5F' }}>Aplica a</th>
                <th style={{ ...th, background: '#1E3A5F' }}>Monto estimado</th>
              </tr>
            </thead>
            <tbody>
              {totals.discounts.map((d, i) => (
                <tr key={d.id || i} style={{ background: i % 2 === 0 ? '#fff' : '#F8FAFC' }}>
                  <td style={td({ textAlign: 'left', fontWeight: 600 })}>{d.name}</td>
                  <td style={td()}>{d.pct}%</td>
                  <td style={td()}>{d.takeup_pct}%</td>
                  <td style={td()}>{d.apply_to === 'maintenance' ? 'Cuota de mantenimiento' : 'Ingresos totales'}</td>
                  <td style={td({ fontWeight: 700 })}>{fmtPrintAmt(d.amount, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'stretch',
        marginTop: 12, gap: 10, breakInside: 'avoid',
      }}>
        <div style={{ flex: 1, background: '#0D6E55', color: '#fff', padding: '10px 14px', borderRadius: 6 }}>
          <div style={{ fontSize: 8, letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.8 }}>Ingreso neto anual</div>
          <div style={{ fontSize: 18, fontWeight: 800, marginTop: 2 }}>{fmtPrintAmt(net, currency)}</div>
        </div>
        <div style={{ flex: 1, background: '#92400E', color: '#fff', padding: '10px 14px', borderRadius: 6 }}>
          <div style={{ fontSize: 8, letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.8 }}>Egresos anuales</div>
          <div style={{ fontSize: 18, fontWeight: 800, marginTop: 2 }}>{fmtPrintAmt(expense, currency)}</div>
        </div>
        <div style={{
          flex: 1, background: surplusPositive ? '#14532D' : '#7F1D1D',
          color: '#fff', padding: '10px 14px', borderRadius: 6,
        }}>
          <div style={{ fontSize: 8, letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.8 }}>
            {surplusPositive ? 'Superávit' : 'Déficit'} · {coverage}% cubierto
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, marginTop: 2 }}>{fmtPrintAmt(surplus, currency)}</div>
        </div>
      </div>

      {(budget.approval_steps || []).length > 0 && (
        <div style={{ marginTop: 10, fontSize: 8, color: '#57534e', breakInside: 'avoid' }}>
          <strong style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>Aprobaciones</strong>
          {' · '}
          {(budget.approval_steps || []).map(s => (
            `${s.order}. ${s.label || ''} (${s.user_name || '—'}): ${s.status === 'approved' ? 'Aprobado' : s.status === 'rejected' ? 'Rechazado' : 'Pendiente'}`
          )).join('  ·  ')}
        </div>
      )}

      <div style={{
        marginTop: 12, paddingTop: 8, borderTop: '1px solid #DDD',
        display: 'flex', justifyContent: 'space-between', fontSize: 8, color: '#a8a29e',
      }}>
        <span>Generado el {genDate} · Homly Planeación</span>
        <span>Documento de uso interno — {statusLbl} {budget.year}</span>
      </div>
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

function ProyectosTab({ tenantId, ctx, isReadOnly, user, onCtxRefresh }) {
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
            Usa esta pestaña para obras, mejoras y extraordinarios: concurso de proveedores, archivos, plan de fondeo e inclusión en el presupuesto anual.
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
                <div className="proj-card-meta">
                  <Pill map={CONTEST_STATUS} value={p.contest_status || 'sin_concurso'} />
                  {p.winner_supplier_name && <span className="proj-chip">Ganador: {p.winner_supplier_name}</span>}
                  <span className="proj-chip">{FUNDING_MODE[p.funding_mode]?.label || 'Fondeo'}</span>
                  {p.budget_name && <span className="proj-chip">En {p.budget_name}</span>}
                  {(p.quotes_count || 0) > 0 && <span className="proj-chip">{p.quotes_count} cotiz.</span>}
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
          onRefresh={() => { openDetail(detail.id); load(); onCtxRefresh?.(); }}
          onEdit={() => { setModal(detail); setDetail(null); }}
          onDelete={async () => {
            if (!window.confirm('¿Eliminar este proyecto, sus cotizaciones, archivos y costos?')) return;
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
          <p style={{ fontSize: 12, color: 'var(--ink-400)', margin: 0 }}>
            Después de guardar podrás cargar cotizaciones, archivos del proyecto, el plan de fondeo y sumarlo a un presupuesto.
          </p>
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
  const [tab, setTab] = useState('resumen');
  const [period, setPeriod] = useState(todayPeriod());
  const [gastos, setGastos] = useState([]);
  const [picked, setPicked] = useState({});
  const [cost, setCost] = useState({ period: todayPeriod(), amount: '', description: '' });
  const [quote, setQuote] = useState({ ...EMPTY_QUOTE });
  const [editingQuoteId, setEditingQuoteId] = useState(null);
  const [fileKind, setFileKind] = useState('documento');
  const [fileQuoteId, setFileQuoteId] = useState('');
  const [funding, setFunding] = useState({
    funding_mode: project.funding_mode || 'condominio',
    funding_condo_pct: Number(project.funding_condo_pct) || 100,
    funding_units: project.funding_units || 0,
    funding_notes: project.funding_notes || '',
  });
  const [budgetId, setBudgetId] = useState(project.budget_id || '');
  const over = (project.progress_pct || 0) > 100;
  const flowOn = flowEnabled(ctx);
  const quotes = project.quotes || [];
  const files = project.files || [];
  const breakdown = project.funding || {};
  const budgets = ctx?.existing_budgets || [];
  const yearHint = (project.start_period || '').slice(0, 4);

  useEffect(() => {
    setFunding({
      funding_mode: project.funding_mode || 'condominio',
      funding_condo_pct: Number(project.funding_condo_pct) || 100,
      funding_units: project.funding_units || 0,
      funding_notes: project.funding_notes || '',
    });
    setBudgetId(project.budget_id || '');
  }, [project.id, project.funding_mode, project.funding_condo_pct, project.funding_units, project.funding_notes, project.budget_id]);

  const loadGastos = () => {
    planeacionAPI.projects.gastos(tenantId, project.id, { period })
      .then(r => setGastos(r.data || []))
      .catch(() => setGastos([]));
  };

  useEffect(() => { if (tab === 'costos') loadGastos(); }, [period, project.id, tab]);

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

  const saveQuote = async () => {
    if (!quote.supplier_name.trim() || !quote.amount) {
      toast.error('Indica proveedor y monto');
      return;
    }
    const payload = {
      ...quote,
      amount: Number(quote.amount) || 0,
      delivery_days: quote.delivery_days === '' ? null : Number(quote.delivery_days),
      warranty_months: quote.warranty_months === '' ? null : Number(quote.warranty_months),
      validity_date: quote.validity_date || null,
    };
    try {
      if (editingQuoteId) await planeacionAPI.projects.updateQuote(tenantId, project.id, editingQuoteId, payload);
      else await planeacionAPI.projects.addQuote(tenantId, project.id, payload);
      toast.success(editingQuoteId ? 'Cotización actualizada' : 'Cotización agregada');
      setQuote({ ...EMPTY_QUOTE });
      setEditingQuoteId(null);
      onRefresh();
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo guardar la cotización'));
    }
  };

  const pickWinner = async (quoteId) => {
    try {
      await planeacionAPI.projects.selectWinner(tenantId, project.id, quoteId);
      toast.success('Proveedor adjudicado. El monto pasa a ser el presupuesto del proyecto.');
      onRefresh();
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo adjudicar'));
    }
  };

  const saveFunding = async () => {
    try {
      await planeacionAPI.projects.update(tenantId, project.id, {
        funding_mode: funding.funding_mode,
        funding_condo_pct: Number(funding.funding_condo_pct) || 0,
        funding_units: Number(funding.funding_units) || 0,
        funding_notes: funding.funding_notes,
      });
      toast.success('Plan de fondeo guardado');
      onRefresh();
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo guardar el fondeo'));
    }
  };

  const include = async (id) => {
    if (!id) {
      toast.error('Elige un presupuesto');
      return;
    }
    try {
      await planeacionAPI.projects.includeInBudget(tenantId, project.id, { budget_id: id });
      toast.success('Proyecto sumado al presupuesto');
      onRefresh();
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo incluir en el presupuesto'));
    }
  };

  const includeBudget = () => include(budgetId || project.budget_id);

  const unlinkBudget = async () => {
    if (!window.confirm('¿Quitar este proyecto del presupuesto? Se eliminarán sus partidas.')) return;
    try {
      await planeacionAPI.projects.unlinkBudget(tenantId, project.id);
      toast.success('Proyecto retirado del presupuesto');
      onRefresh();
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo retirar'));
    }
  };

  const uploadFile = async (file, extra = {}) => {
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file, file.name);
    fd.append('kind', extra.kind || fileKind);
    if (extra.quote_id || fileQuoteId) fd.append('quote_id', extra.quote_id || fileQuoteId);
    try {
      await planeacionAPI.projects.uploadFile(tenantId, project.id, fd);
      toast.success('Archivo cargado');
      onRefresh();
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo subir el archivo'));
    }
  };

  const TABS = [
    ['resumen', 'Resumen'],
    ['concurso', `Concurso (${quotes.length})`],
    ['fondeo', 'Fondeo'],
    ['archivos', `Archivos (${files.length})`],
    ['costos', 'Costos'],
  ];

  return (
    <div className="modal-bg open" onClick={onClose}>
      <div className="modal xl" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{project.name}</h3>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            <Pill map={PROJECT_STATUS} value={project.status} />
            <Pill map={CONTEST_STATUS} value={project.contest_status || 'sin_concurso'} />
            <span style={{ fontSize: 12, color: PRIORITY[project.priority]?.color, fontWeight: 700 }}>{PRIORITY[project.priority]?.label}</span>
            {project.extra_field_label && <span style={{ fontSize: 12, color: 'var(--ink-400)' }}>{project.extra_field_label}</span>}
            {project.winner_supplier_name && <span className="proj-chip"><Award size={11} /> {project.winner_supplier_name}</span>}
            {project.budget_name && <span className="proj-chip">{project.budget_name}</span>}
          </div>
          {project.description && tab === 'resumen' && <p style={{ fontSize: 13, color: 'var(--ink-500)' }}>{project.description}</p>}
          <div style={{ margin: '8px 0 6px', height: 8, background: 'var(--sand-100)', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{ width: `${Math.min(100, project.progress_pct || 0)}%`, height: '100%', background: over ? 'var(--coral-500)' : 'var(--teal-500)' }} />
          </div>
          <div style={{ fontSize: 13, marginBottom: 12 }}>
            {fmtCurrency(project.spent, currency)} de {fmtCurrency(project.budget_amount, currency)}
            {over && <span style={{ color: 'var(--coral-600)', marginLeft: 8 }}>Sobre presupuesto</span>}
          </div>

          <div className="proj-detail-tabs">
            {TABS.map(([k, l]) => (
              <button key={k} className={`tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>{l}</button>
            ))}
          </div>

          {tab === 'resumen' && (
            <>
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
              <div className="fund-bar">
                <div className="fund-part">
                  <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>Condominio ({breakdown.condo_pct ?? 100}%)</div>
                  <strong>{fmtCurrency(breakdown.condo_amount, currency)}</strong>
                </div>
                <div className="fund-part">
                  <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>Residentes ({breakdown.residents_pct ?? 0}%)</div>
                  <strong>{fmtCurrency(breakdown.residents_amount, currency)}</strong>
                  {breakdown.per_unit != null && (
                    <div style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: 4 }}>
                      {fmtCurrency(breakdown.per_unit, currency)} por unidad · {breakdown.units} un.
                    </div>
                  )}
                </div>
              </div>
              <p style={{ fontSize: 12, color: 'var(--ink-400)', margin: '0 0 8px' }}>
                {project.start_period || '—'} → {project.end_period || '—'}
                {project.responsible_name ? ` · ${project.responsible_name}` : ''}
                {quotes.length < 3 ? ' · Tip: junta 3 cotizaciones para un concurso sólido.' : ''}
              </p>
            </>
          )}

          {tab === 'concurso' && (
            <>
              <p style={{ fontSize: 13, color: 'var(--ink-500)', margin: '0 0 12px' }}>
                Compara proveedores y elige al ganador. Lo habitual es un concurso de 3 cotizaciones; puedes cargar hasta 8.
              </p>
              {quotes.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--ink-400)', marginBottom: 12 }}>Todavía no hay cotizaciones.</div>
              ) : (
                <>
                  <div className="quote-grid">
                    {quotes.map(q => (
                      <div key={q.id} className={`quote-card ${q.is_winner ? 'is-winner' : ''}`}>
                        <div className="quote-card-head">
                          <div>
                            <div style={{ fontWeight: 700 }}>{q.supplier_name}</div>
                            <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>
                              {[q.supplier_rfc, q.supplier_phone || q.supplier_contact, q.supplier_email].filter(Boolean).join(' · ') || 'Sin datos de contacto'}
                            </div>
                          </div>
                          {q.is_winner && <Pill map={CONTEST_STATUS} value="adjudicado" />}
                        </div>
                        <div className="quote-amount">{fmtCurrency(q.amount, currency)}</div>
                        <div style={{ fontSize: 12, color: 'var(--ink-500)' }}>
                          {q.delivery_days != null ? `${q.delivery_days} días de entrega` : 'Entrega no indicada'}
                          {q.warranty_months != null ? ` · ${q.warranty_months} meses de garantía` : ''}
                          {q.validity_date ? ` · vigencia ${q.validity_date}` : ''}
                        </div>
                        {q.scope && <div style={{ fontSize: 12, color: 'var(--ink-500)' }}>{q.scope}</div>}
                        {(q.files || []).length > 0 && (
                          <div style={{ fontSize: 12 }}>
                            {q.files.map(f => (
                              <button key={f.id} className="btn btn-outline btn-sm" style={{ marginRight: 4, marginTop: 4 }} onClick={() => downloadProtectedFile(f.file_url, f.original_name)}>
                                <FileText size={12} /> {f.original_name}
                              </button>
                            ))}
                          </div>
                        )}
                        {!isReadOnly && (
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 'auto' }}>
                            {!q.is_winner && quotes.length >= 2 && (
                              <button className="btn btn-primary btn-sm" onClick={() => pickWinner(q.id)}><Trophy size={12} /> Elegir ganador</button>
                            )}
                            <button className="btn btn-outline btn-sm" onClick={() => {
                              setEditingQuoteId(q.id);
                              setQuote({
                                supplier_name: q.supplier_name || '',
                                supplier_rfc: q.supplier_rfc || '',
                                supplier_contact: q.supplier_contact || '',
                                supplier_phone: q.supplier_phone || '',
                                supplier_email: q.supplier_email || '',
                                supplier_notes: q.supplier_notes || '',
                                amount: q.amount ?? '',
                                validity_date: q.validity_date || '',
                                delivery_days: q.delivery_days ?? '',
                                warranty_months: q.warranty_months ?? '',
                                scope: q.scope || '',
                              });
                            }}><Pencil size={12} /></button>
                            <label className="btn btn-outline btn-sm" style={{ cursor: 'pointer' }}>
                              <Paperclip size={12} />
                              <input type="file" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; uploadFile(f, { kind: 'cotizacion', quote_id: q.id }); }} />
                            </label>
                            <button className="btn btn-outline btn-sm" onClick={async () => {
                              if (!window.confirm('¿Eliminar esta cotización?')) return;
                              await planeacionAPI.projects.deleteQuote(tenantId, project.id, q.id);
                              onRefresh();
                            }}><Trash2 size={12} /></button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  {quotes.length >= 2 && (
                    <div className="quote-cmp table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Criterio</th>
                            {quotes.map(q => <th key={q.id}>{q.supplier_name}{q.is_winner ? ' ★' : ''}</th>)}
                          </tr>
                        </thead>
                        <tbody>
                          {[
                            ['Monto', q => fmtCurrency(q.amount, currency)],
                            ['RFC', q => q.supplier_rfc || '—'],
                            ['Contacto', q => q.supplier_phone || q.supplier_email || q.supplier_contact || '—'],
                            ['Entrega', q => q.delivery_days != null ? `${q.delivery_days} días` : '—'],
                            ['Garantía', q => q.warranty_months != null ? `${q.warranty_months} meses` : '—'],
                            ['Vigencia', q => q.validity_date || '—'],
                          ].map(([label, fn]) => (
                            <tr key={label}>
                              <td style={{ fontWeight: 600 }}>{label}</td>
                              {quotes.map(q => <td key={q.id}>{fn(q)}</td>)}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
              {!isReadOnly && quotes.length < 8 && (
                <div className="card" style={{ padding: 14 }}>
                  <h4 style={{ margin: '0 0 10px', fontSize: 14 }}>{editingQuoteId ? 'Editar cotización' : 'Nueva cotización'}</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                    <div className="field"><div className="field-label">Proveedor</div><input className="field-input" value={quote.supplier_name} onChange={e => setQuote(q => ({ ...q, supplier_name: e.target.value }))} /></div>
                    <div className="field"><div className="field-label">RFC</div><input className="field-input" value={quote.supplier_rfc} onChange={e => setQuote(q => ({ ...q, supplier_rfc: e.target.value }))} /></div>
                    <div className="field"><div className="field-label">Monto ({currencySymbol(currency)})</div><input className="field-input" type="number" min="0" step="0.01" value={quote.amount} onChange={e => setQuote(q => ({ ...q, amount: e.target.value }))} /></div>
                    <div className="field"><div className="field-label">Teléfono</div><input className="field-input" value={quote.supplier_phone} onChange={e => setQuote(q => ({ ...q, supplier_phone: e.target.value }))} /></div>
                    <div className="field"><div className="field-label">Email</div><input className="field-input" value={quote.supplier_email} onChange={e => setQuote(q => ({ ...q, supplier_email: e.target.value }))} /></div>
                    <div className="field"><div className="field-label">Contacto</div><input className="field-input" value={quote.supplier_contact} onChange={e => setQuote(q => ({ ...q, supplier_contact: e.target.value }))} /></div>
                    <div className="field"><div className="field-label">Vigencia</div><input className="field-input" type="date" value={quote.validity_date} onChange={e => setQuote(q => ({ ...q, validity_date: e.target.value }))} /></div>
                    <div className="field"><div className="field-label">Días de entrega</div><input className="field-input" type="number" min="0" value={quote.delivery_days} onChange={e => setQuote(q => ({ ...q, delivery_days: e.target.value }))} /></div>
                    <div className="field"><div className="field-label">Garantía (meses)</div><input className="field-input" type="number" min="0" value={quote.warranty_months} onChange={e => setQuote(q => ({ ...q, warranty_months: e.target.value }))} /></div>
                  </div>
                  <div className="field" style={{ marginTop: 8 }}>
                    <div className="field-label">Alcance / notas del proveedor</div>
                    <textarea className="field-input" rows={2} value={quote.scope} onChange={e => setQuote(q => ({ ...q, scope: e.target.value }))} />
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    {editingQuoteId && (
                      <button className="btn btn-outline" onClick={() => { setEditingQuoteId(null); setQuote({ ...EMPTY_QUOTE }); }}>Cancelar</button>
                    )}
                    <button className="btn btn-primary" onClick={saveQuote}>{editingQuoteId ? 'Guardar cambios' : 'Agregar cotización'}</button>
                  </div>
                </div>
              )}
            </>
          )}

          {tab === 'fondeo' && (
            <>
              <p style={{ fontSize: 13, color: 'var(--ink-500)', margin: '0 0 12px' }}>
                Define cómo se paga el proyecto. Si lo sumas a un presupuesto, la parte del condominio entra como gasto y los aportes de residentes como ingreso extraordinario.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="field">
                  <div className="field-label">Origen de los recursos</div>
                  <select className="field-select" disabled={isReadOnly} value={funding.funding_mode} onChange={e => setFunding(f => ({ ...f, funding_mode: e.target.value }))}>
                    {Object.entries(FUNDING_MODE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                {funding.funding_mode === 'compartido' && (
                  <div className="field">
                    <div className="field-label">% condominio (residentes = {Math.round((100 - Number(funding.funding_condo_pct || 0)) * 100) / 100}%)</div>
                    <input className="field-input" type="number" min="0" max="100" step="0.01" disabled={isReadOnly} value={funding.funding_condo_pct} onChange={e => setFunding(f => ({ ...f, funding_condo_pct: e.target.value }))} />
                  </div>
                )}
                <div className="field">
                  <div className="field-label">Unidades que aportan (0 = las activas)</div>
                  <input className="field-input" type="number" min="0" disabled={isReadOnly} value={funding.funding_units} onChange={e => setFunding(f => ({ ...f, funding_units: e.target.value }))} />
                </div>
              </div>
              <div className="field">
                <div className="field-label">Notas de fondeo (asamblea, fondo de reserva, etc.)</div>
                <textarea className="field-input" rows={3} disabled={isReadOnly} value={funding.funding_notes} onChange={e => setFunding(f => ({ ...f, funding_notes: e.target.value }))} />
              </div>
              <div className="fund-bar">
                <div className="fund-part">
                  <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>A cargo del condominio</div>
                  <strong>{fmtCurrency(breakdown.condo_amount, currency)}</strong>
                </div>
                <div className="fund-part">
                  <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>Aportes extraordinarios</div>
                  <strong>{fmtCurrency(breakdown.residents_amount, currency)}</strong>
                  {breakdown.per_unit != null && (
                    <div style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: 4 }}>
                      {fmtCurrency(breakdown.per_unit, currency)} / unidad
                    </div>
                  )}
                </div>
              </div>
              {!isReadOnly && <button className="btn btn-primary" onClick={saveFunding} style={{ marginBottom: 16 }}><Landmark size={14} /> Guardar fondeo</button>}

              <h4 style={{ margin: '8px 0', fontSize: 14 }}>Incluir en presupuesto anual</h4>
              <p style={{ fontSize: 12, color: 'var(--ink-400)', margin: '0 0 10px' }}>
                Se crean partidas ligadas a este proyecto (no se pueden borrar desde el presupuesto). El monto se reparte entre los meses del proyecto.
              </p>
              {project.budget_id ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span className="proj-chip">Incluido en {project.budget_name} ({project.budget_year})</span>
                  {!isReadOnly && <button className="btn btn-outline" onClick={unlinkBudget}>Quitar del presupuesto</button>}
                  {!isReadOnly && <button className="btn btn-outline" onClick={includeBudget}>Actualizar montos</button>}
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 8, alignItems: 'end', flexWrap: 'wrap' }}>
                  <div className="field" style={{ margin: 0, minWidth: 260 }}>
                    <div className="field-label">Presupuesto</div>
                    <select className="field-select" disabled={isReadOnly} value={budgetId} onChange={e => setBudgetId(e.target.value)}>
                      <option value="">Selecciona un escenario</option>
                      {budgets.filter(b => !['archivado'].includes(b.status)).map(b => (
                        <option key={b.id} value={b.id}>
                          {b.year} · {b.name || 'Sin nombre'} · {BUDGET_STATUS[b.status]?.label || b.status}
                        </option>
                      ))}
                    </select>
                  </div>
                  {!isReadOnly && (
                    <button className="btn btn-primary" disabled={!budgetId} onClick={includeBudget}>Sumar al presupuesto</button>
                  )}
                </div>
              )}
              {yearHint && budgets.some(b => String(b.year) === yearHint) === false && (
                <div style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: 8 }}>
                  No hay presupuesto {yearHint}. Créalo primero en la pestaña Presupuesto.
                </div>
              )}
            </>
          )}

          {tab === 'archivos' && (
            <>
              <p style={{ fontSize: 13, color: 'var(--ink-500)', margin: '0 0 12px' }}>
                Planos, contratos y documentos generales. Las cotizaciones PDF también se pueden colgar en cada proveedor.
              </p>
              {files.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--ink-400)', marginBottom: 12 }}>Sin archivos del proyecto.</div>
              ) : (
                <div className="proj-file-list">
                  {files.map(f => (
                    <div key={f.id} className="proj-file-row">
                      <FileText size={14} />
                      <span className="name">{f.original_name}</span>
                      <span className="proj-chip">{FILE_KINDS[f.kind] || f.kind}</span>
                      {f.quote_supplier && <span className="proj-chip">{f.quote_supplier}</span>}
                      <button className="btn btn-outline btn-sm" onClick={() => downloadProtectedFile(f.file_url, f.original_name)}><Download size={12} /></button>
                      {!isReadOnly && (
                        <button className="btn btn-outline btn-sm" onClick={async () => {
                          await planeacionAPI.projects.deleteFile(tenantId, project.id, f.id);
                          onRefresh();
                        }}><Trash2 size={12} /></button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {!isReadOnly && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end' }}>
                  <div className="field" style={{ margin: 0 }}>
                    <div className="field-label">Tipo</div>
                    <select className="field-select" value={fileKind} onChange={e => setFileKind(e.target.value)}>
                      {Object.entries(FILE_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                    </select>
                  </div>
                  <div className="field" style={{ margin: 0 }}>
                    <div className="field-label">Ligar a cotización (opcional)</div>
                    <select className="field-select" value={fileQuoteId} onChange={e => setFileQuoteId(e.target.value)}>
                      <option value="">Archivo del proyecto</option>
                      {quotes.map(q => <option key={q.id} value={q.id}>{q.supplier_name}</option>)}
                    </select>
                  </div>
                  <label className="btn btn-primary" style={{ cursor: 'pointer' }}>
                    <Upload size={14} /> Subir archivo
                    <input type="file" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; uploadFile(f); }} />
                  </label>
                </div>
              )}
            </>
          )}

          {tab === 'costos' && (
            <>
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

function Mini({ label, value, sub, accent }) {
  return (
    <div className={`cob-stat plan-kpi ${accent ? `plan-kpi-${accent}` : ''}`}>
      <div>
        <div className="cob-stat-label">{label}</div>
        <div className="cob-stat-value" style={{ fontSize: 18 }}>{value}</div>
        {sub && <div style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );
}
