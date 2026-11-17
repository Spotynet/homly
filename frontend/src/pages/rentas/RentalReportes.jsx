import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  AlertTriangle, ChevronDown, ChevronRight, Columns3, Download, FileSpreadsheet, FileText, Printer, RefreshCw,
  Save, Search, Star, Trash2, X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTenantAccess } from '../../context/TenantAccessContext';
import { rentalAPI } from '../../api/client';
import { Empty, errMsg, PageHead } from './opsUi';
import { exportCSV, exportXLS, fmtCell, printReport } from './reportUtils';
import { printCurrentReport, ReportHeader, useTenantBrand } from './reportBrand';

const ALL_TABS = [
  { key: 'rapidos', label: 'Informes rápidos' },
  { key: 'anual', label: 'Informe anual', module: 'rentas_preventivo' },
  { key: 'proveedores', label: 'Proveedores y SLA', module: 'rentas_mantenimiento' },
];

const addDays = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Informes listos para usar: un clic aplica conjunto de datos + filtros. */
const PRESETS = [
  { id: 'p-vencidas', name: 'Órdenes fuera de SLA', desc: 'Trabajos abiertos cuyo plazo ya venció', dataset: 'ordenes', filters: { q: 'Vencida' } },
  { id: 'p-abiertas', name: 'Órdenes abiertas', desc: 'Planeadas y en curso', dataset: 'ordenes', filters: { status: 'planeado' } },
  { id: 'p-vigencias', name: 'Contratos por vencer (90 días)', desc: 'Vencimientos de los próximos tres meses', dataset: 'contratos', filters: { range: [0, 90] } },
  { id: 'p-cartera', name: 'Cartera vencida', desc: 'Cargos sin cobrar después de su fecha', dataset: 'cargos', filters: { q: 'Vencido' } },
  { id: 'p-opex', name: 'Gasto operativo y CAPEX del año', desc: 'Libro unificado con costos de órdenes', dataset: 'gastos', filters: {} },
  { id: 'p-gla', name: 'Espacios vacantes (GLA)', desc: 'Locales, bays y oficinas disponibles por rentar', dataset: 'espacios', filters: { q: 'Disponible' } },
  { id: 'p-espacios', name: 'Directorio de espacios', desc: 'Inquilino, M² y contactos de cada espacio', dataset: 'espacios', filters: {} },
  { id: 'p-fallas', name: 'Inspecciones con fallas', desc: 'Calificación y órdenes generadas', dataset: 'inspecciones', filters: {} },
];

const RISK = {
  alto: { label: 'Riesgo alto', color: 'var(--coral-600)', bg: 'var(--coral-50)' },
  medio: { label: 'En vigilancia', color: 'var(--amber-700)', bg: 'var(--amber-50)' },
  ok: { label: 'Cumple', color: 'var(--teal-700)', bg: 'var(--teal-50)' },
};

export default function RentalReportes() {
  const { tenantId } = useAuth();
  const { can } = useTenantAccess();
  const [sp, setSp] = useSearchParams();
  const TABS = ALL_TABS.filter(t => !t.module || can(t.module, 'read'));
  const tab = TABS.some(t => t.key === sp.get('tab')) ? sp.get('tab') : 'rapidos';
  const setTab = (k) => setSp(prev => { const n = new URLSearchParams(prev); n.set('tab', k); return n; }, { replace: true });

  return (
    <div className="content-fade">
      <PageHead
        title="Reportes"
        subtitle="Genera informes a pedido, revisa la planeación anual del mantenimiento y vigila el cumplimiento de tus proveedores. Todo se exporta a Excel, CSV o PDF."
      />
      <div className="tabs" style={{ marginBottom: 14 }}>
        {TABS.map(t => (
          <button key={t.key} className={`tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>
      {tab === 'rapidos' && <QuickReports tenantId={tenantId} initialDataset={sp.get('dataset')} />}
      {tab === 'anual' && <AnnualReport tenantId={tenantId} />}
      {tab === 'proveedores' && <ProviderSla tenantId={tenantId} />}
    </div>
  );
}

/* ───────────────────────── Informes rápidos ───────────────────────── */

function loadSaved(tenantId) {
  try { return JSON.parse(localStorage.getItem(`homly_rep_saved_${tenantId}`) || '[]'); } catch { return []; }
}

function QuickReports({ tenantId, initialDataset }) {
  const [catalog, setCatalog] = useState([]);
  const [catalogReady, setCatalogReady] = useState(false);
  const [properties, setProperties] = useState([]);
  const [saved, setSaved] = useState(() => loadSaved(tenantId));
  const [dataset, setDataset] = useState(initialDataset || 'ordenes');
  const [filters, setFilters] = useState({ date_from: '', date_to: '', property: '', status: '', q: '', order: '' });
  const [hidden, setHidden] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [colsOpen, setColsOpen] = useState(false);
  const [activeName, setActiveName] = useState('');
  const brand = useTenantBrand();

  useEffect(() => {
    if (!tenantId) return;
    rentalAPI.ops.reports.catalog(tenantId).then(r => {
      const list = r.data || [];
      setCatalog(list);
      setDataset(d => (list.length && !list.some(c => c.key === d) ? list[0].key : d));
      setCatalogReady(true);
    }).catch(() => setCatalogReady(true));
    rentalAPI.properties.list(tenantId, { page_size: 500 }).then(r => setProperties([].concat(r.data?.results || r.data || []).filter(x => x && x.id))).catch(() => {});
  }, [tenantId]);

  const run = useCallback(async () => {
    if (!tenantId || !catalogReady) return;
    setLoading(true);
    try {
      const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
      const r = await rentalAPI.ops.reports.run(tenantId, dataset, params);
      setData(r.data);
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo generar el informe'));
    } finally { setLoading(false); }
  }, [tenantId, dataset, filters, catalogReady]);

  useEffect(() => { run(); }, [run]);

  const pickDataset = (key, newFilters = {}, name = '', hiddenCols = []) => {
    setDataset(key);
    setFilters({ date_from: '', date_to: '', property: '', status: '', q: '', order: '', ...newFilters });
    setHidden(hiddenCols);
    setActiveName(name);
  };

  const applyPreset = (p) => {
    const f = { ...p.filters };
    if (f.range) {
      f.date_from = addDays(f.range[0]);
      f.date_to = addDays(f.range[1]);
      delete f.range;
    }
    pickDataset(p.dataset, f, p.name);
  };

  const persist = (list) => {
    setSaved(list);
    try { localStorage.setItem(`homly_rep_saved_${tenantId}`, JSON.stringify(list)); } catch { /* sin almacenamiento */ }
  };
  const saveCurrent = () => {
    const name = window.prompt('Nombre del informe guardado', activeName || `${data?.label || 'Informe'} ${new Date().toLocaleDateString('es-MX')}`);
    if (!name || !name.trim()) return;
    persist([{ id: `s-${Date.now()}`, name: name.trim(), dataset, filters, hidden }, ...saved].slice(0, 30));
    setActiveName(name.trim());
    toast.success('Informe guardado en tu lista');
  };
  const applySaved = (s) => pickDataset(s.dataset, s.filters, s.name, s.hidden || []);

  const columns = useMemo(() => (data?.columns || []).filter(c => !hidden.includes(c.key)), [data, hidden]);
  const rows = data?.rows || [];
  const shown = rows.slice(0, 500);
  const setF = (k, v) => setFilters(f => ({ ...f, [k]: v }));
  const toggleOrder = (key) => setF('order', filters.order === key ? `-${key}` : filters.order === `-${key}` ? '' : key);
  const title = `${data?.label || 'Informe'}${activeName && activeName !== data?.label ? ` · ${activeName}` : ''}`;
  const fileName = `homly-${dataset}`;
  const filterSummary = [
    filters.date_from && `desde ${filters.date_from}`, filters.date_to && `hasta ${filters.date_to}`,
    filters.property && properties.find(p => p.id === filters.property)?.name,
    filters.status && (data?.statuses || []).find(s => s.value === filters.status)?.label,
    filters.q && `búsqueda “${filters.q}”`,
  ].filter(Boolean).join(' · ');
  const hint = catalog.find(c => c.key === dataset)?.range_hint;

  return (
    <div className="rp-layout">
      <aside className="rp-side">
        <div className="rp-side-title">Conjuntos de datos</div>
        {catalog.map(c => (
          <button key={c.key} className={`rp-side-item ${dataset === c.key ? 'active' : ''}`} onClick={() => pickDataset(c.key)}>
            <span>{c.label}</span>
            <small>{c.description}</small>
          </button>
        ))}
        <div className="rp-side-title" style={{ marginTop: 16 }}>Informes rápidos</div>
        {PRESETS.filter(p => catalog.some(c => c.key === p.dataset)).map(p => (
          <button key={p.id} className="rp-side-item preset" onClick={() => applyPreset(p)} title={p.desc}>
            <span><Star size={11} style={{ marginRight: 5, color: 'var(--amber-600)' }} />{p.name}</span>
          </button>
        ))}
        {saved.length > 0 && (
          <>
            <div className="rp-side-title" style={{ marginTop: 16 }}>Mis informes guardados</div>
            {saved.map(s => (
              <div key={s.id} className="rp-saved">
                <button className="rp-side-item preset" onClick={() => applySaved(s)}><span>{s.name}</span></button>
                <button className="btn-icon" aria-label="Eliminar" onClick={() => persist(saved.filter(x => x.id !== s.id))}><Trash2 size={12} /></button>
              </div>
            ))}
          </>
        )}
      </aside>

      <section className="rp-main">
        <ReportHeader title={title} subtitle={filterSummary || (data?.count != null ? `${data.count} registro(s)` : '')} />
        <div className="card" style={{ padding: 14 }}>
          <div className="rp-toolbar">
            <div className="rp-field"><label>Desde</label><input type="date" className="field-input" value={filters.date_from} onChange={e => setF('date_from', e.target.value)} /></div>
            <div className="rp-field"><label>Hasta</label><input type="date" className="field-input" value={filters.date_to} onChange={e => setF('date_to', e.target.value)} /></div>
            <div className="rp-field">
              <label>Propiedad</label>
              <select className="field-input" value={filters.property} onChange={e => setF('property', e.target.value)}>
                <option value="">Todas</option>
                {properties.map(p => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
              </select>
            </div>
            <div className="rp-field">
              <label>Estatus</label>
              <select className="field-input" value={filters.status} onChange={e => setF('status', e.target.value)}>
                <option value="">Todos</option>
                {(data?.statuses || []).map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div className="rp-field" style={{ flex: 1, minWidth: 180 }}>
              <label>Buscar</label>
              <div style={{ position: 'relative' }}>
                <Search size={13} style={{ position: 'absolute', left: 10, top: 11, color: 'var(--ink-400)' }} />
                <input className="field-input" style={{ paddingLeft: 30 }} value={filters.q} onChange={e => setF('q', e.target.value)} placeholder="Folio, nombre, propiedad…" />
              </div>
            </div>
          </div>
          {hint && <div style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 6 }}>{hint}</div>}
        </div>

        <div className="rp-actions">
          <div style={{ fontSize: 13, color: 'var(--ink-500)' }}>
            {loading ? 'Generando…' : <><b style={{ color: 'var(--ink-800)' }}>{data?.count ?? 0}</b> registro(s){filterSummary ? ` · ${filterSummary}` : ''}</>}
            {data?.truncated && <span style={{ color: 'var(--amber-700)' }}> · se exportan los primeros 5,000</span>}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', position: 'relative' }}>
            <button className="btn btn-outline btn-sm" onClick={() => setColsOpen(v => !v)}><Columns3 size={13} /> Columnas</button>
            {colsOpen && (
              <div className="rp-cols">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <b style={{ fontSize: 12 }}>Columnas visibles</b>
                  <button className="btn-icon" onClick={() => setColsOpen(false)}><X size={13} /></button>
                </div>
                {(data?.columns || []).map(c => (
                  <label key={c.key}>
                    <input type="checkbox" checked={!hidden.includes(c.key)} onChange={() => setHidden(h => (h.includes(c.key) ? h.filter(k => k !== c.key) : [...h, c.key]))} />
                    {c.label}
                  </label>
                ))}
              </div>
            )}
            <button className="btn btn-outline btn-sm" onClick={run} disabled={loading} title="Actualizar"><RefreshCw size={13} className={loading ? 'spin' : ''} /></button>
            <button className="btn btn-outline btn-sm" onClick={saveCurrent} disabled={!data}><Save size={13} /> Guardar</button>
            <button className="btn btn-outline btn-sm" disabled={!rows.length} onClick={() => exportXLS(columns, rows, fileName, { title, totals: data?.totals, brand })}><FileSpreadsheet size={13} /> Excel</button>
            <button className="btn btn-outline btn-sm" disabled={!rows.length} onClick={() => exportCSV(columns, rows, fileName)}><Download size={13} /> CSV</button>
            <button className="btn btn-outline btn-sm" disabled={!rows.length} onClick={() => { if (!printReport({ title, subtitle: filterSummary, columns, rows: rows.slice(0, 1500), totals: data?.totals, brand })) toast.error('Permite las ventanas emergentes para imprimir'); }}><Printer size={13} /> PDF</button>
          </div>
        </div>

        {data && Object.keys(data.totals || {}).length > 0 && (
          <div className="rd-mini-grid" style={{ marginBottom: 12 }}>
            {Object.entries(data.totals).map(([k, v]) => {
              const col = (data.columns || []).find(c => c.key === k);
              return (
                <div key={k} className="rd-mini">
                  <div className="rd-mini-label">Total · {col?.label || k}</div>
                  <div className="rd-mini-value">{fmtCell(v, col?.type)}</div>
                </div>
              );
            })}
          </div>
        )}

        {!loading && rows.length === 0 ? (
          <Empty icon={FileText} text="Sin resultados con estos filtros. Ajusta el rango o limpia la búsqueda." />
        ) : (
          <div className="card">
            <div className="table-wrap" style={{ maxHeight: 560, overflow: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    {columns.map(c => (
                      <th key={c.key} onClick={() => toggleOrder(c.key)} style={{ cursor: 'pointer', whiteSpace: 'nowrap', textAlign: c.type === 'money' || c.type === 'number' ? 'right' : undefined }}>
                        {c.label}{filters.order === c.key ? ' ▲' : filters.order === `-${c.key}` ? ' ▼' : ''}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r, i) => (
                    <tr key={i}>
                      {columns.map(c => (
                        <td key={c.key} style={{ whiteSpace: c.type === 'text' ? 'normal' : 'nowrap', textAlign: c.type === 'money' || c.type === 'number' ? 'right' : undefined, fontVariantNumeric: 'tabular-nums' }}>
                          {fmtCell(r[c.key], c.type)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length > shown.length && (
              <div style={{ padding: 10, fontSize: 12, color: 'var(--ink-400)', textAlign: 'center' }}>
                Mostrando {shown.length} de {rows.length}. La exportación incluye todos los registros.
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

/* ───────────────────────── Informe anual ───────────────────────── */

const CELL = {
  d: { label: 'Realizado', cls: 'done' },
  p: { label: 'Programado', cls: 'plan' },
  c: { label: 'En curso', cls: 'prog' },
  o: { label: 'Atrasado', cls: 'late' },
};

function AnnualReport({ tenantId }) {
  const navigate = useNavigate();
  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState({});
  const brand = useTenantBrand();

  useEffect(() => {
    if (!tenantId) return;
    setLoading(true);
    rentalAPI.ops.reports.annual(tenantId, { year })
      .then(r => setData(r.data))
      .catch(() => toast.error('No se pudo cargar el informe anual'))
      .finally(() => setLoading(false));
  }, [tenantId, year]);

  const years = [year - 2, year - 1, year, year + 1].filter((v, i, a) => a.indexOf(v) === i);
  const allCollapsed = data && data.groups.length > 0 && data.groups.every(g => collapsed[g.category]);

  const exportAnnual = () => {
    if (!data) return;
    const cols = [
      { key: 'category', label: 'Categoría' }, { key: 'name', label: 'Plan' }, { key: 'property', label: 'Propiedad' },
      { key: 'frequency', label: 'Frecuencia' }, { key: 'd', label: 'Realizados', type: 'number' },
      { key: 'p', label: 'Programados', type: 'number' }, { key: 'o', label: 'Atrasados', type: 'number' },
      ...Array.from({ length: data.weeks }, (_, i) => ({ key: `w${i + 1}`, label: `S${i + 1}` })),
    ];
    const rows = [];
    data.groups.forEach(g => g.rows.forEach(r => {
      const row = { category: g.category, name: r.name, property: r.property, frequency: r.frequency, d: r.counts.d, p: r.counts.p, o: r.counts.o };
      r.cells.forEach((c, i) => { row[`w${i + 1}`] = c ? CELL[c].label : ''; });
      rows.push(row);
    }));
    exportXLS(cols, rows, `homly-informe-anual-${year}`, { title: `Informe anual de mantenimiento preventivo ${year}`, brand });
  };

  return (
    <div className="rental-report-print">
      <ReportHeader title={`Informe anual de mantenimiento preventivo ${year}`} subtitle={data ? `${data.totals?.d ?? 0} realizados · ${data.totals?.o ?? 0} atrasados` : ''} />
      <div className="rp-actions no-print" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select className="field-input" style={{ width: 110 }} value={year} onChange={e => setYear(Number(e.target.value))}>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button className="btn btn-outline btn-sm" onClick={() => setCollapsed(allCollapsed ? {} : Object.fromEntries((data?.groups || []).map(g => [g.category, true])))}>
            {allCollapsed ? <><ChevronDown size={13} /> Expandir todo</> : <><ChevronRight size={13} /> Contraer todo</>}
          </button>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-outline btn-sm" disabled={!data?.groups?.length} onClick={exportAnnual}><FileSpreadsheet size={13} /> Exportar a Excel</button>
          <button className="btn btn-outline btn-sm" onClick={printCurrentReport}><Printer size={13} /> Imprimir / PDF</button>
        </div>
      </div>

      {loading && !data ? <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-400)' }}>Cargando informe…</div> : !data || data.groups.length === 0 ? (
        <Empty icon={FileText} text="Aún no hay planes preventivos activos. Crea planes en Preventivo para ver su planeación anual." />
      ) : (
        <>
          <div className="rd-kpis">
            <div className="rd-kpi"><div className="rd-kpi-top"><span className="rd-kpi-label">Cumplimiento</span></div>
              <div className="rd-kpi-value" style={{ color: data.compliance_pct == null ? undefined : data.compliance_pct >= 90 ? 'var(--teal-700)' : data.compliance_pct >= 70 ? 'var(--amber-700)' : 'var(--coral-600)' }}>{data.compliance_pct == null ? '—' : `${data.compliance_pct}%`}</div>
              <div className="rd-kpi-sub">Realizados ÷ (realizados + atrasados)</div></div>
            <div className="rd-kpi"><div className="rd-kpi-top"><span className="rd-kpi-label">Realizados</span></div><div className="rd-kpi-value">{data.totals.d}</div><div className="rd-kpi-sub">Servicios preventivos ejecutados</div></div>
            <div className="rd-kpi"><div className="rd-kpi-top"><span className="rd-kpi-label">Programados</span></div><div className="rd-kpi-value">{data.totals.p + data.totals.c}</div><div className="rd-kpi-sub">Pendientes del año</div></div>
            <div className="rd-kpi"><div className="rd-kpi-top"><span className="rd-kpi-label">Atrasados</span></div><div className="rd-kpi-value" style={{ color: data.totals.o ? 'var(--coral-600)' : undefined }}>{data.totals.o}</div><div className="rd-kpi-sub">Fuera de fecha</div></div>
          </div>

          <div className="an-legend">
            {Object.values(CELL).map(c => <span key={c.cls}><i className={`an-cell ${c.cls}`} /> {c.label}</span>)}
          </div>

          <div className="card an-card">
            <div className="an-scroll">
              <div className="an-grid" style={{ '--weeks': data.weeks }}>
                <div className="an-head an-name">Semana</div>
                <div className="an-head an-weeks">
                  {Array.from({ length: data.weeks }, (_, i) => (
                    <span key={i} className={`an-wk ${data.today_week === i ? 'now' : ''}`}>
                      {data.month_starts[String(i)] ? <b>{data.month_starts[String(i)]}</b> : null}
                      <small>{i + 1}</small>
                    </span>
                  ))}
                </div>
                {data.groups.map(g => (
                  <React.Fragment key={g.category}>
                    <button className="an-group" onClick={() => setCollapsed(c => ({ ...c, [g.category]: !c[g.category] }))}>
                      {collapsed[g.category] ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                      {g.category}
                      <small>{g.rows.length} plan(es) · {g.counts.d} realizados{g.counts.o ? ` · ${g.counts.o} atrasados` : ''}</small>
                    </button>
                    {!collapsed[g.category] && g.rows.map(r => (
                      <React.Fragment key={r.id}>
                        <button className="an-name an-row-name" onClick={() => navigate('/app/rentas/preventivo')} title={`${r.name} · ${r.frequency}`}>
                          <span>{r.name}</span>
                          <small>{r.property}{r.asset ? ` · ${r.asset}` : ''}</small>
                        </button>
                        <div className="an-weeks an-row">
                          {r.cells.map((c, i) => (
                            <span key={i} className={`an-cell ${c ? CELL[c].cls : 'empty'} ${data.today_week === i ? 'now' : ''}`} title={c ? `Semana ${i + 1}: ${CELL[c].label}` : undefined} />
                          ))}
                        </div>
                      </React.Fragment>
                    ))}
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ───────────────────────── Proveedores y SLA ───────────────────────── */

function ProviderSla({ tenantId }) {
  const [months, setMonths] = useState(12);
  const [threshold, setThreshold] = useState(80);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(null);
  const brand = useTenantBrand();

  useEffect(() => {
    if (!tenantId) return;
    setLoading(true);
    rentalAPI.ops.reports.providerSla(tenantId, { months, threshold })
      .then(r => setData(r.data))
      .catch(() => toast.error('No se pudo cargar el informe'))
      .finally(() => setLoading(false));
  }, [tenantId, months, threshold]);

  const cols = [
    { key: 'provider', label: 'Proveedor' }, { key: 'evaluated', label: 'Órdenes evaluadas', type: 'number' },
    { key: 'on_time', label: 'A tiempo', type: 'number' }, { key: 'late', label: 'Tarde', type: 'number' },
    { key: 'overdue_open', label: 'Vencidas abiertas', type: 'number' }, { key: 'compliance_pct', label: 'Cumplimiento (%)', type: 'number' },
    { key: 'avg_delay_h', label: 'Retraso promedio (h)', type: 'number' }, { key: 'cost', label: 'Costo', type: 'money' },
    { key: 'risk_label', label: 'Situación' },
  ];
  const rows = (data?.providers || []).map(p => ({ ...p, risk_label: RISK[p.risk].label }));

  return (
    <div className="rental-report-print">
      <ReportHeader title="Cumplimiento de proveedores (SLA)" subtitle={`Últimos ${months} meses · mínimo aceptable ${threshold}%`} />
      <div className="rp-actions no-print" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select className="field-input" style={{ width: 160 }} value={months} onChange={e => setMonths(Number(e.target.value))}>
            <option value={6}>Últimos 6 meses</option><option value={12}>Últimos 12 meses</option><option value={24}>Últimos 24 meses</option>
          </select>
          <select className="field-input" style={{ width: 200 }} value={threshold} onChange={e => setThreshold(Number(e.target.value))} title="Cumplimiento mínimo aceptable">
            <option value={70}>Mínimo aceptable 70%</option><option value={80}>Mínimo aceptable 80%</option><option value={90}>Mínimo aceptable 90%</option><option value={95}>Mínimo aceptable 95%</option>
          </select>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-outline btn-sm" disabled={!rows.length} onClick={() => exportXLS(cols, rows, 'homly-sla-proveedores', { title: `Cumplimiento de proveedores (SLA) · últimos ${months} meses`, brand })}><FileSpreadsheet size={13} /> Excel</button>
          <button className="btn btn-outline btn-sm" disabled={!rows.length} onClick={() => printReport({ title: 'Cumplimiento de proveedores (SLA)', subtitle: `Últimos ${months} meses · mínimo ${threshold}%`, columns: cols, rows, brand })}><Printer size={13} /> PDF</button>
        </div>
      </div>

      {loading && !data ? <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-400)' }}>Cargando informe…</div> : !data || rows.length === 0 ? (
        <Empty icon={FileText} text="Todavía no hay órdenes con proveedor y plazo de SLA para evaluar." />
      ) : (
        <>
          <div className="rd-kpis">
            <div className="rd-kpi"><div className="rd-kpi-top"><span className="rd-kpi-label">Cumplimiento global</span></div><div className="rd-kpi-value">{data.overall_pct == null ? '—' : `${data.overall_pct}%`}</div><div className="rd-kpi-sub">Órdenes cerradas dentro del plazo</div></div>
            <div className="rd-kpi"><div className="rd-kpi-top"><span className="rd-kpi-label">Proveedores en riesgo</span></div><div className="rd-kpi-value" style={{ color: data.at_risk ? 'var(--coral-600)' : 'var(--teal-700)' }}>{data.at_risk}</div><div className="rd-kpi-sub">Bajo el mínimo o con vencidas</div></div>
            <div className="rd-kpi"><div className="rd-kpi-top"><span className="rd-kpi-label">Incumplimientos</span></div><div className="rd-kpi-value">{rows.reduce((s, r) => s + r.breaches, 0)}</div><div className="rd-kpi-sub">Tardías + vencidas abiertas</div></div>
            <div className="rd-kpi"><div className="rd-kpi-top"><span className="rd-kpi-label">Proveedores evaluados</span></div><div className="rd-kpi-value">{rows.length}</div><div className="rd-kpi-sub">Con órdenes y SLA en el periodo</div></div>
          </div>

          <div className="card" style={{ padding: '10px 14px', marginBottom: 12, display: 'flex', gap: 10, alignItems: 'center', fontSize: 12, color: 'var(--ink-500)' }}>
            <AlertTriangle size={15} color="var(--amber-600)" />
            Usa este informe como respaldo para aplicar penalizaciones conforme a los acuerdos de nivel de servicio de tus contratos. “En vigilancia” = bajo el mínimo o con 2+ órdenes vencidas; “Riesgo alto” = 15 puntos por debajo del mínimo.
          </div>

          <div className="card">
            <div className="table-wrap">
              <table>
                <thead><tr><th></th><th>Proveedor</th><th style={{ textAlign: 'right' }}>Evaluadas</th><th style={{ textAlign: 'right' }}>A tiempo</th><th style={{ textAlign: 'right' }}>Tarde</th><th style={{ textAlign: 'right' }}>Vencidas</th><th style={{ minWidth: 160 }}>Cumplimiento</th><th style={{ textAlign: 'right' }}>Retraso prom.</th><th style={{ textAlign: 'right' }}>Costo</th><th>Situación</th></tr></thead>
                <tbody>
                  {data.providers.map(p => {
                    const r = RISK[p.risk];
                    const pct = p.compliance_pct;
                    return (
                      <React.Fragment key={p.provider_id}>
                        <tr style={{ cursor: p.late_orders.length ? 'pointer' : 'default' }} onClick={() => p.late_orders.length && setOpen(open === p.provider_id ? null : p.provider_id)}>
                          <td style={{ width: 24 }}>{p.late_orders.length > 0 && (open === p.provider_id ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}</td>
                          <td style={{ fontWeight: 700 }}>{p.provider}</td>
                          <td style={{ textAlign: 'right' }}>{p.evaluated}</td>
                          <td style={{ textAlign: 'right', color: 'var(--teal-700)' }}>{p.on_time}</td>
                          <td style={{ textAlign: 'right', color: p.late ? 'var(--amber-700)' : undefined }}>{p.late}</td>
                          <td style={{ textAlign: 'right', color: p.overdue_open ? 'var(--coral-600)' : undefined, fontWeight: p.overdue_open ? 700 : 400 }}>{p.overdue_open}</td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div className="rd-bar" style={{ flex: 1 }}><span style={{ width: `${pct ?? 0}%`, background: pct == null ? 'var(--sand-200)' : pct >= data.threshold ? 'var(--teal-500)' : pct >= data.threshold - 15 ? 'var(--amber-500)' : 'var(--coral-500)' }} /></div>
                              <b style={{ fontSize: 12, minWidth: 40, textAlign: 'right' }}>{pct == null ? '—' : `${pct}%`}</b>
                            </div>
                          </td>
                          <td style={{ textAlign: 'right' }}>{p.avg_delay_h == null ? '—' : p.avg_delay_h >= 48 ? `${(p.avg_delay_h / 24).toFixed(1)} d` : `${p.avg_delay_h} h`}</td>
                          <td style={{ textAlign: 'right' }}>{fmtCell(p.cost, 'money')}</td>
                          <td><span style={{ fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 99, background: r.bg, color: r.color, whiteSpace: 'nowrap' }}>{r.label}</span></td>
                        </tr>
                        {open === p.provider_id && (
                          <tr><td></td><td colSpan={9} style={{ background: 'var(--sand-50)' }}>
                            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Órdenes con incumplimiento (más retrasadas)</div>
                            {p.late_orders.map(o => (
                              <div key={o.folio} className="rd-row">
                                <span><b style={{ fontFamily: 'monospace' }}>{o.folio}</b> · {o.title} <small style={{ color: 'var(--ink-400)' }}>({o.property})</small></span>
                                <span style={{ color: o.open ? 'var(--coral-600)' : 'var(--amber-700)', fontWeight: 700 }}>{o.open ? 'Sigue abierta · ' : ''}{o.delay_h >= 48 ? `${(o.delay_h / 24).toFixed(1)} d` : `${o.delay_h} h`} de retraso</span>
                              </div>
                            ))}
                          </td></tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
