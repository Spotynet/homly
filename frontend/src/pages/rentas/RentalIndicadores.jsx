import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, ComposedChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { useAuth } from '../../context/AuthContext';
import { rentalAPI } from '../../api/client';
import { Printer } from 'lucide-react';
import { Empty, fmtD, money, PageHead } from './opsUi';
import { printCurrentReport, ReportHeader } from './reportBrand';

const COLORS = {
  teal: '#2A9D73', blue: '#3B82F6', amber: '#F59E0B', coral: '#E85D43',
  purple: '#7C3AED', sand: '#D4C8B5', ink: '#9E9588',
};
const PALETTE = [COLORS.teal, COLORS.blue, COLORS.amber, COLORS.purple, COLORS.coral, COLORS.sand, COLORS.ink];
const PRIO_COLORS = { urgente: COLORS.coral, alta: COLORS.amber, media: COLORS.blue, baja: COLORS.sand };
const TOOLTIP_STYLE = {
  background: 'white', border: '1px solid var(--sand-100)', borderRadius: 10,
  boxShadow: '0 4px 16px rgba(0,0,0,0.10)', fontSize: 12,
};
const AXIS = { fontSize: 11, fill: 'var(--ink-500)' };

function pctTone(v, good = 90, warn = 70) {
  if (v == null) return undefined;
  return v >= good ? 'var(--teal-700)' : v >= warn ? 'var(--amber-700)' : 'var(--coral-600)';
}

function Kpi({ label, value, sub, color }) {
  return (
    <div className="rd-kpi">
      <div className="rd-kpi-top"><div className="rd-kpi-label">{label}</div></div>
      <div className="rd-kpi-value" style={{ color }}>{value}</div>
      {sub && <div className="rd-kpi-sub">{sub}</div>}
    </div>
  );
}

function Card({ title, hint, children }) {
  return (
    <div className="card" style={{ minWidth: 0 }}>
      <div className="card-head">
        <div>
          <h3>{title}</h3>
          {hint && <div className="rd-card-hint" style={{ margin: '2px 0 0' }}>{hint}</div>}
        </div>
      </div>
      <div className="rd-card-body">{children}</div>
    </div>
  );
}

const pct = v => (v == null ? '—' : `${v}%`);
const hours = v => {
  if (v == null) return '—';
  return v >= 48 ? `${(v / 24).toFixed(1)} d` : `${v} h`;
};

export default function RentalIndicadores() {
  const { tenantId } = useAuth();
  const [months, setMonths] = useState(6);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) return;
    setLoading(true);
    rentalAPI.ops.indicators(tenantId, { months })
      .then(r => setData(r.data))
      .catch(() => toast.error('No se pudieron cargar los indicadores'))
      .finally(() => setLoading(false));
  }, [tenantId, months]);

  if (loading && !data) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-400)' }}>Cargando indicadores…</div>;
  if (!data) return <Empty text="No hay información disponible." />;

  const k = data.kpis;
  const mix = (data.mix || []).filter(m => m.value > 0);
  const prioBacklog = (data.backlog_priority || []);
  const noOps = !k.open_orders && !k.completed && !k.assets_total && !data.requests.total;

  return (
    <div className="content-fade rental-report-print">
      <div className="no-print">
      <PageHead
        title="Indicadores de operación"
        subtitle="Mide qué tan rápido, qué tan bien y a qué costo opera tu portafolio: tiempos de reparación, cumplimiento de SLA y preventivo, costos y activos críticos."
      >
        <select className="field-input" value={months} onChange={e => setMonths(Number(e.target.value))}>
          <option value={3}>Últimos 3 meses</option>
          <option value={6}>Últimos 6 meses</option>
          <option value={12}>Últimos 12 meses</option>
          <option value={24}>Últimos 24 meses</option>
        </select>
        <button className="btn btn-outline" onClick={printCurrentReport}><Printer size={14} /> Imprimir / PDF</button>
      </PageHead>
      </div>
      <ReportHeader title="Indicadores de operación" subtitle={`Últimos ${months} meses`} />

      {noOps && (
        <Empty text="Aún no hay datos operativos. Registra solicitudes, activos u órdenes de trabajo para ver tus indicadores." />
      )}

      <div className="rd-kpis">
        <Kpi label="Tiempo medio de reparación" value={hours(k.mttr_hours)} sub="MTTR · correctivos cerrados" />
        <Kpi label="Cumplimiento de SLA" value={pct(k.sla_pct)} color={pctTone(k.sla_pct)} sub="Órdenes cerradas a tiempo" />
        <Kpi label="Cumplimiento preventivo" value={pct(k.pm_compliance_pct)} color={pctTone(k.pm_compliance_pct)} sub="Planes realizados en fecha" />
        <Kpi label="Preventivo vs correctivo" value={pct(k.preventive_pct)} sub="% de trabajo preventivo" />
      </div>
      <div className="rd-kpis">
        <Kpi label="Órdenes abiertas" value={k.open_orders} sub={k.overdue_orders ? `${k.overdue_orders} fuera de SLA` : 'Todas en tiempo'} color={k.overdue_orders ? 'var(--coral-600)' : undefined} />
        <Kpi label="Costo de mantenimiento" value={money(k.cost_total)} sub={`Promedio ${money(k.cost_avg)} por orden`} />
        <Kpi label="Respuesta a solicitudes" value={hours(k.avg_response_hours)} sub={`${k.open_requests} abierta(s)${k.satisfaction ? ` · ★ ${k.satisfaction}` : ''}`} />
        <Kpi label="Equipos fuera de operación" value={k.assets_down} sub={`${k.assets_total} activos registrados`} color={k.assets_down ? 'var(--coral-600)' : undefined} />
      </div>

      <div className="rd-grid-21">
        <Card title="Órdenes creadas vs completadas" hint="Y el costo del trabajo realizado por mes.">
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={data.flow} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--sand-100)" vertical={false} />
              <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} />
              <YAxis yAxisId="l" allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
              <YAxis yAxisId="r" orientation="right" tick={AXIS} axisLine={false} tickLine={false} tickFormatter={v => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v, n) => (n === 'Costo' ? money(v, false) : v)} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar yAxisId="l" dataKey="created" name="Creadas" fill={COLORS.sand} radius={[4, 4, 0, 0]} />
              <Bar yAxisId="l" dataKey="completed" name="Completadas" fill={COLORS.teal} radius={[4, 4, 0, 0]} />
              <Line yAxisId="r" type="monotone" dataKey="cost" name="Costo" stroke={COLORS.purple} strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </Card>
        <Card title="Preventivo vs correctivo" hint="Más preventivo significa menos fallas costosas.">
          {mix.length === 0 ? <Empty text="Sin órdenes en el periodo." /> : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={mix} dataKey="value" nameKey="label" innerRadius={55} outerRadius={90} paddingAngle={3}>
                  {mix.map((m, i) => <Cell key={m.key} fill={i === 0 ? COLORS.teal : COLORS.coral} />)}
                </Pie>
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      <div className="rd-grid-2">
        <Card title="Órdenes abiertas por antigüedad" hint="Backlog actual del portafolio.">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.backlog_age} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--sand-100)" vertical={false} />
              <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'var(--sand-50)' }} />
              <Bar dataKey="value" name="Órdenes" radius={[4, 4, 0, 0]}>
                {(data.backlog_age || []).map((b, i) => <Cell key={b.key} fill={[COLORS.teal, COLORS.blue, COLORS.amber, COLORS.coral][i]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card title="Órdenes abiertas por prioridad" hint="Dónde está la urgencia.">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={prioBacklog} layout="vertical" margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--sand-100)" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="label" width={70} tick={AXIS} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'var(--sand-50)' }} />
              <Bar dataKey="value" name="Órdenes" radius={[0, 4, 4, 0]}>
                {prioBacklog.map(p => <Cell key={p.key} fill={PRIO_COLORS[p.key] || COLORS.ink} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <div className="rd-grid-2">
        <Card title="Costo por categoría" hint={`Mano de obra ${money(data.cost.labor)} · Refacciones ${money(data.cost.parts)}`}>
          {data.cost.by_category.length === 0 ? <Empty text="Sin costos registrados." /> : (
            <ResponsiveContainer width="100%" height={Math.max(180, data.cost.by_category.length * 36)}>
              <BarChart data={data.cost.by_category} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--sand-100)" horizontal={false} />
                <XAxis type="number" tick={AXIS} axisLine={false} tickLine={false} tickFormatter={v => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)} />
                <YAxis type="category" dataKey="name" width={110} tick={AXIS} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'var(--sand-50)' }} formatter={v => money(v, false)} />
                <Bar dataKey="cost" name="Costo" radius={[0, 4, 4, 0]}>
                  {data.cost.by_category.map((c, i) => <Cell key={c.name} fill={PALETTE[i % PALETTE.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
        <Card title="Costo por inmueble" hint="Los que más mantenimiento consumen.">
          {data.cost.by_property.length === 0 ? <Empty text="Sin costos registrados." /> : (
            data.cost.by_property.map(p => (
              <div key={p.code} className="rd-row">
                <div className="rd-row-main">
                  <div className="rd-row-title">{p.name}</div>
                  <div className="rd-row-sub">{p.code} · {p.count} orden(es)</div>
                </div>
                <b>{money(p.cost)}</b>
              </div>
            ))
          )}
        </Card>
      </div>

      <div className="rd-grid-2">
        <Card title="Desempeño de proveedores" hint="Órdenes, tiempo promedio y cumplimiento de SLA.">
          {data.providers.length === 0 ? <Empty text="Asigna proveedores a tus órdenes para comparar su desempeño." /> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Proveedor</th><th>Órdenes</th><th>Tiempo prom.</th><th>SLA</th><th>Costo</th></tr></thead>
                <tbody>
                  {data.providers.map(p => (
                    <tr key={p.name}>
                      <td style={{ fontWeight: 700 }}>{p.name}</td>
                      <td>{p.orders}</td>
                      <td>{hours(p.avg_hours)}</td>
                      <td style={{ color: pctTone(p.sla_pct), fontWeight: 700 }}>{pct(p.sla_pct)}</td>
                      <td>{money(p.cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card title="Equipos con más fallas" hint="Candidatos a reemplazo o a un plan preventivo.">
          {data.assets.top_failures.length === 0 ? <Empty text="Sin fallas registradas en equipos." /> : (
            data.assets.top_failures.map(a => (
              <div key={a.id} className="rd-row">
                <div className="rd-row-main">
                  <div className="rd-row-title">{a.code} · {a.name}</div>
                  <div className="rd-row-sub">{a.property_code}</div>
                </div>
                <div style={{ textAlign: 'right', fontSize: 12 }}><b>{a.failures} falla(s)</b><div style={{ color: 'var(--ink-400)' }}>{money(a.cost)}</div></div>
              </div>
            ))
          )}
        </Card>
      </div>

      <div className="rd-grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, marginBottom: 16 }}>
        <Card title="Solicitudes por canal" hint={`SLA respuesta ${pct(data.requests.response_sla_pct)} · solución ${pct(data.requests.resolution_sla_pct)}`}>
          {data.requests.by_channel.length === 0 ? <Empty text="Sin solicitudes en el periodo." /> : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={data.requests.by_channel} dataKey="value" nameKey="label" outerRadius={75}>
                  {data.requests.by_channel.map((c, i) => <Cell key={c.key} fill={PALETTE[i % PALETTE.length]} />)}
                </Pie>
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Card>
        <Card title="Estado de los activos" hint={`${k.assets_total} equipos registrados`}>
          {data.assets.by_status.length === 0 ? <Empty text="Aún no hay activos." /> : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={data.assets.by_status} dataKey="value" nameKey="label" innerRadius={40} outerRadius={75}>
                  {data.assets.by_status.map((c, i) => <Cell key={c.key} fill={[COLORS.teal, COLORS.coral, COLORS.amber, COLORS.ink, COLORS.sand][i % 5]} />)}
                </Pie>
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Card>
        <Card title="Ciclo de vida de equipos" hint="Vida útil por cumplirse y garantías próximas.">
          {data.assets.end_of_life.length === 0 && data.assets.warranty_soon.length === 0 ? (
            <Empty text="Nada por atender." />
          ) : (
            <>
              {data.assets.end_of_life.map(a => (
                <div key={`e${a.id}`} className="rd-row">
                  <div className="rd-row-main"><div className="rd-row-title">{a.code} · {a.name}</div><div className="rd-row-sub">{a.property_code} · {a.age} de {a.life} años</div></div>
                  <span className="proj-chip" style={{ color: 'var(--amber-700)', background: 'var(--amber-50)' }}>Fin de vida</span>
                </div>
              ))}
              {data.assets.warranty_soon.map(a => (
                <div key={`w${a.id}`} className="rd-row">
                  <div className="rd-row-main"><div className="rd-row-title">{a.code} · {a.name}</div><div className="rd-row-sub">{a.property_code} · vence {fmtD(a.warranty_until)}</div></div>
                  <span className="proj-chip" style={{ color: 'var(--blue-700)', background: 'var(--blue-50)' }}>Garantía</span>
                </div>
              ))}
            </>
          )}
        </Card>
      </div>

      {data.inspections.completed > 0 && (
        <div className="card" style={{ padding: '12px 18px', fontSize: 13 }}>
          Inspecciones completadas en el periodo: <b>{data.inspections.completed}</b> · calificación promedio{' '}
          <b style={{ color: pctTone(data.inspections.avg_score) }}>{pct(data.inspections.avg_score)}</b>
        </div>
      )}
    </div>
  );
}
