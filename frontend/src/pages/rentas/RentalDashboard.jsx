import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertCircle, Building2, CheckCircle, Cpu, LifeBuoy, RefreshCw, Receipt, Wallet, Wrench } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTenantAccess } from '../../context/TenantAccessContext';
import { rentalAPI } from '../../api/client';
import { CONTRACT_STATUS, fmtDate, fmtMoney, StatusPill, todayPeriod } from './rentalUtils';
import { Card, COLORS, CollectionChart, DaysBadge, Donut, Empty, HBars, MiniStat, PRIORITY_COLORS, SplitBar, STATUS_COLORS, TOOLTIP_STYLE, WorkRow, compact, money0 } from './dashUi';
import { FMBoard, GlobalPanel } from './DashWidgets';

const TABS = [
  { key: 'resumen', label: 'Panel global' },
  { key: 'portafolio', label: 'Portafolio' },
  { key: 'cobranza', label: 'Cobranza' },
  { key: 'contratos', label: 'Contratos' },
  { key: 'mantenimiento', label: 'Panel de FM' },
  { key: 'comercial', label: 'Comercial' },
];

function periodTitle(period) {
  const [y, m] = String(period).split('-').map(Number);
  if (!y || !m) return period;
  const s = new Date(y, m - 1, 1).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function RentalDashboard() {
  const { tenantId } = useAuth();
  const { can } = useTenantAccess();
  const canWrite = can('rentas_mantenimiento');
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [period, setPeriod] = useState(todayPeriod());
  const [tab, setTab] = useState('resumen');

  const load = useCallback((silent = false) => {
    if (!tenantId) return Promise.resolve();
    if (silent) setRefreshing(true); else setLoading(true);
    setError('');
    return rentalAPI.dashboard(tenantId, { period })
      .then(res => setData(res.data))
      .catch(() => setError('No se pudo cargar el dashboard. Intenta de nuevo.'))
      .finally(() => { setLoading(false); setRefreshing(false); });
  }, [tenantId, period]);

  useEffect(() => { load(false); }, [load]);

  const currency = data?.currency || 'MXN';
  const go = path => navigate(path);

  if (loading && !data) {
    return <div className="content-fade" style={{ color: 'var(--ink-400)', padding: 40, textAlign: 'center' }}>Cargando Administrar Propiedades…</div>;
  }
  if (!data) {
    return (
      <div className="content-fade rd-empty">
        {error || 'Sin datos.'}
        <div style={{ marginTop: 12 }}><button className="btn btn-outline" onClick={() => load(false)}>Reintentar</button></div>
      </div>
    );
  }

  const pf = data.portfolio?.summary || {};
  const fin = data.finance || {};
  const ct = data.contract_stats || {};
  const mt = data.maintenance || {};
  const pv = data.providers || {};
  const crm = data.crm_stats || {};
  const ab = data.airbnb || {};
  const alerts = data.alerts || [];
  const collectionPct = Math.min(100, Math.round(fin.collection_pct || 0));
  const mode = data.mode || {};
  const off = mode.leasing_enabled === false ? ['rentas_crm', 'rentas_cobranza', 'rentas_rentroll'] : (mode.off_modules || []);
  const showOcc = !off.includes('rentas_rentroll');
  const showCob = !off.includes('rentas_cobranza');
  const visibleTabs = TABS.filter(t => !(
    (t.key === 'portafolio' && !showOcc) || (t.key === 'cobranza' && !showCob) || (t.key === 'comercial' && off.includes('rentas_crm'))
  ));
  const activeTab = visibleTabs.some(t => t.key === tab) ? tab : 'resumen';

  return (
    <div className="content-fade">
      <div className="rd-head">
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', color: 'var(--teal-600)', textTransform: 'uppercase' }}>
            Administrar Propiedades
          </div>
          <h2 style={{ margin: '4px 0 0', fontSize: 24 }}>Dashboard</h2>
          <p style={{ color: 'var(--ink-400)', fontSize: 13, marginTop: 4 }}>
            Así va tu portafolio en {periodTitle(period)}: ocupación, cobranza, contratos y mantenimiento.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="month" className="period-month-select" value={period} onChange={e => e.target.value && setPeriod(e.target.value)} />
          <button className="btn btn-outline" onClick={() => load(true)} disabled={refreshing} title="Actualizar">
            <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
          </button>
        </div>
      </div>

      {/* KPIs principales: se adaptan a los módulos de renta que usa este espacio */}
      <div className="rd-kpis">
        {showOcc ? (
          <>
            <Kpi label="Ocupación" icon={Building2} iconTone="teal" value={`${pf.occupancy_pct ?? 0}%`} pct={pf.occupancy_pct || 0} barColor={COLORS.teal}
              sub={`${pf.occupied || 0} de ${pf.units || 0} unidades en renta ocupadas${pf.gla_total > 0 && pf.multi_tenant_properties > 0 ? ` · GLA ${pf.gla_occupancy_pct || 0}% (${Math.round(pf.gla_occupied || 0).toLocaleString('es-MX')} / ${Math.round(pf.gla_total).toLocaleString('es-MX')} m²)` : ''}`} />
            <Kpi label="Renta mensual" icon={Wallet} iconTone="blue" value={money0(pf.in_place_rent, currency)} pct={pf.economic_occupancy_pct || 0} barColor={COLORS.blue}
              sub={`${pf.economic_occupancy_pct || 0}% del potencial (${money0(pf.gpr, currency)})`} />
          </>
        ) : (
          <>
            <Kpi label="Propiedades" icon={Building2} iconTone="teal" value={mode.properties_total ?? 0}
              sub={`${mode.operation_only || 0} solo operación`} />
            <Kpi label="Órdenes abiertas" icon={Wrench} iconTone="blue" value={mt.open || 0}
              sub={`${mt.overdue || 0} atrasadas · ${(data.ops || {}).orders_sla_overdue || 0} fuera de SLA`} />
          </>
        )}
        {showCob ? (
          <>
            <Kpi label="Cobranza del mes" icon={Receipt} iconTone="teal" value={money0(fin.collected, currency)} pct={collectionPct}
              barColor={collectionPct >= 90 ? COLORS.teal : collectionPct >= 60 ? COLORS.amber : COLORS.coral}
              sub={`${collectionPct}% de ${money0(fin.expected, currency)} facturado`} />
            <Kpi label="Cartera vencida" icon={fin.overdue_amount > 0 ? AlertCircle : CheckCircle} iconTone={fin.overdue_amount > 0 ? 'coral' : 'teal'}
              value={money0(fin.overdue_amount, currency)} danger={fin.overdue_amount > 0}
              sub={fin.overdue_count ? `${fin.overdue_count} cargo(s) sin pagar a tiempo` : 'Sin adeudos vencidos'} />
          </>
        ) : (
          <>
            <Kpi label="Solicitudes abiertas" icon={LifeBuoy} iconTone="teal" value={(data.ops || {}).requests_open || 0}
              sub={`${(data.ops || {}).requests_new || 0} nuevas · ${(data.ops || {}).requests_overdue || 0} fuera de SLA`} />
            <Kpi label="Equipos fuera de operación" icon={Cpu} iconTone={(data.ops || {}).assets_down ? 'coral' : 'teal'} value={(data.ops || {}).assets_down || 0}
              danger={!!(data.ops || {}).assets_down}
              sub={`${(data.ops || {}).assets_warranty || 0} garantías por vencer`} />
          </>
        )}
      </div>

      <div className="tabs">
        {visibleTabs.map(t => (
          <button key={t.key} className={`tab${activeTab === t.key ? ' active' : ''}`} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>

      {activeTab === 'resumen' && (
        <GlobalPanel
          tenantId={tenantId} data={data} pf={pf} fin={fin} ct={ct} mt={mt} crm={crm} ab={ab}
          currency={currency} go={go} alerts={alerts} off={off} canWrite={canWrite}
        />
      )}
      {activeTab === 'portafolio' && <PortafolioTab data={data} pf={pf} currency={currency} go={go} />}
      {activeTab === 'cobranza' && <CobranzaTab fin={fin} currency={currency} go={go} />}
      {activeTab === 'contratos' && <ContratosTab ct={ct} pf={pf} currency={currency} go={go} />}
      {activeTab === 'mantenimiento' && <MantenimientoTab mt={mt} pv={pv} ops={data.ops || {}} currency={currency} go={go} tenantId={tenantId} canWrite={canWrite} />}
      {activeTab === 'comercial' && <ComercialTab crm={crm} ab={ab} pf={pf} currency={currency} go={go} />}
    </div>
  );
}

const KPI_TONES = {
  teal: { background: 'var(--teal-50)', color: 'var(--teal-600)' },
  blue: { background: 'var(--blue-50)', color: 'var(--blue-600)' },
  coral: { background: 'var(--coral-50)', color: 'var(--coral-500)' },
};

function Kpi({ label, icon: Icon, iconTone = 'teal', value, sub, pct, barColor, danger }) {
  return (
    <div className="rd-kpi" style={danger ? { borderColor: 'var(--coral-100)' } : undefined}>
      <div className="rd-kpi-top">
        <span className="rd-kpi-label">{label}</span>
        <span className="rd-kpi-icon" style={KPI_TONES[iconTone]}><Icon size={16} /></span>
      </div>
      <div className="rd-kpi-value" style={danger ? { color: 'var(--coral-600)' } : undefined}>{value}</div>
      {pct !== undefined && <div className="rd-bar"><span style={{ width: `${Math.min(100, pct)}%`, background: barColor }} /></div>}
      <div className="rd-kpi-sub">{sub}</div>
    </div>
  );
}

/* ─────────────── Pestañas ─────────────── */

function PortafolioTab({ data, pf, currency, go }) {
  const p = data.portfolio || {};
  const groups = (p.by_group || []).map(g => ({ label: g.label, value: g.units }));
  const types = (p.by_type || []).slice(0, 8).map(t => ({ name: t.name, Ocupadas: t.occupied, Vacantes: Math.max(0, t.units - t.occupied) }));
  const total = (pf.fixed_rent || 0) + (pf.variable_rent || 0);
  return (
    <>
      <div className="rd-mini-grid" style={{ marginBottom: 16 }}>
        <MiniStat label="Renta potencial" value={money0(pf.gpr, currency)} sub="Si todo estuviera rentado" />
        <MiniStat label="Renta en operación" value={money0(pf.in_place_rent, currency)} sub={`${money0(pf.annual_in_place, currency)} al año`} />
        <MiniStat label="Pérdida por vacancia" value={money0(pf.vacancy_loss, currency)} sub={`${(pf.vacant || 0) + (pf.reserved || 0)} unidad(es) sin renta`} tone={pf.vacancy_loss > 0 ? 'warn' : ''} />
        <MiniStat label="Renta bajo mercado" value={money0(pf.loss_to_lease, currency)} sub="Contratos por debajo de lo sugerido" />
        <MiniStat label="Depósitos en garantía" value={money0(pf.deposits_held, currency)} />
        <MiniStat label="Airbnb ocupados" value={pf.airbnb_occupied || 0} sub="Estancias hoy" />
      </div>

      <div className="rd-grid-2">
        <Card title="Unidades por grupo" hint="Residencial, vacacional, comercial, industrial…">
          <Donut data={groups} centerValue={pf.units || 0} centerLabel="unidades" />
        </Card>
        <Card title="Ocupación por tipo de propiedad" hint="Cuántas están ocupadas y cuántas libres.">
          {types.length === 0 ? <Empty text="Aún no hay propiedades." /> : (
            <div className="rd-card-body">
              <ResponsiveContainer width="100%" height={Math.max(180, types.length * 38)}>
                <BarChart data={types} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--sand-100)" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--ink-500)' }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11, fill: 'var(--ink-600)' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'var(--sand-50)' }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Ocupadas" stackId="a" fill={COLORS.teal} radius={[0, 0, 0, 0]} />
                  <Bar dataKey="Vacantes" stackId="a" fill={COLORS.sand} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      <div className="rd-grid-2">
        <Card title="Renta fija vs variable" hint="De dónde viene tu ingreso mensual.">
          {total <= 0 ? <Empty text="Aún no hay rentas en operación." /> : (
            <div className="rd-card-body">
              <SplitBar parts={[
                { label: 'Renta fija', value: pf.fixed_rent || 0, color: COLORS.teal },
                { label: 'Renta variable (estimada)', value: pf.variable_rent || 0, color: COLORS.amber },
              ]} currency={currency} />
              <div className="rd-legend" style={{ marginTop: 14 }}>
                <span>{pf.fixed_count || 0} contrato(s) fijos</span>
                <span>{pf.variable_count || 0} contrato(s) variables</span>
              </div>
            </div>
          )}
        </Card>
        <Card title="Mayores rentas" hint="Las unidades que más ingreso generan." action={{ label: 'Rent Roll', onClick: () => go('/app/rentas/rentroll') }}>
          {(p.top_rents || []).length === 0 ? <Empty text="Sin rentas registradas." /> : (
            <div className="rd-card-body" style={{ paddingTop: 0 }}>
              {p.top_rents.map(r => (
                <div key={r.property_id} className="rd-row">
                  <div className="rd-row-main">
                    <div className="rd-row-title">{r.code} · {r.name}</div>
                    <div className="rd-row-sub">{r.type_label} · {r.tenant_name || 'Sin inquilino'}</div>
                  </div>
                  <strong>{money0(r.rent_monthly, currency)}</strong>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="rd-grid-2">
        <Card title="Unidades sin renta" hint="Mayor renta sugerida primero." action={{ label: 'Inventario', onClick: () => go('/app/rentas/propiedades') }}>
          {(p.vacants || []).length === 0 ? <Empty icon={CheckCircle} text="No hay unidades vacantes. ¡Excelente!" /> : (
            <div className="rd-card-body" style={{ paddingTop: 0 }}>
              {p.vacants.map(r => (
                <div key={r.property_id} className="rd-row">
                  <div className="rd-row-main">
                    <div className="rd-row-title">{r.code} · {r.name}</div>
                    <div className="rd-row-sub">{r.type_label}{r.specs_summary ? ` · ${r.specs_summary}` : ''}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 700 }}>{money0(r.suggested_rent, currency)}</div>
                    <div className="rd-row-sub">{r.occupancy === 'vacante' ? 'Vacante' : r.occupancy === 'reservada' ? 'Reservada' : 'En mantenimiento'}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card title="Ingreso por propietario" hint="Top 5 por renta mensual.">
          {(p.by_owner || []).length === 0 ? <Empty text="Sin datos de propietarios." /> : (
            <div className="rd-card-body" style={{ paddingTop: 0 }}>
              {p.by_owner.map(o => (
                <div key={o.name} className="rd-row">
                  <div className="rd-row-main">
                    <div className="rd-row-title">{o.name}</div>
                    <div className="rd-row-sub">{o.units} unidad(es) rentadas</div>
                  </div>
                  <strong>{money0(o.rent, currency)}</strong>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

function CobranzaTab({ fin, currency, go }) {
  const aging = fin.aging || [];
  const agingTotal = aging.reduce((s, a) => s + a.amount, 0);
  return (
    <>
      <div className="rd-mini-grid" style={{ marginBottom: 16 }}>
        <MiniStat label="Facturado del mes" value={money0(fin.expected, currency)} />
        <MiniStat label="Cobrado" value={money0(fin.collected, currency)} sub={`${Math.round(fin.collection_pct || 0)}% de lo facturado`} tone="good" />
        <MiniStat label="Por cobrar" value={money0(fin.pending, currency)} />
        <MiniStat label="Recibido en el mes" value={money0(fin.received_in_month, currency)} sub="Pagos con fecha del mes" />
        <MiniStat label="Cartera vencida" value={money0(fin.overdue_amount, currency)} sub={`${fin.overdue_count || 0} cargo(s)`} tone={fin.overdue_amount > 0 ? 'warn' : ''} />
      </div>

      <div className="rd-grid-21">
        <Card title="Facturado vs cobrado" hint="Últimos 6 meses." action={{ label: 'Ir a cobranza', onClick: () => go('/app/rentas/cobranza') }}>
          <CollectionChart data={fin.trend} currency={currency} />
        </Card>
        <Card title="Antigüedad de la deuda" hint="Cuánto tiempo llevan vencidos los adeudos.">
          {agingTotal <= 0 ? <Empty icon={CheckCircle} text="No hay cartera vencida." /> : (
            <div className="rd-card-body">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={aging} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--sand-100)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--ink-500)' }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={compact} tick={{ fontSize: 10, fill: 'var(--ink-400)' }} axisLine={false} tickLine={false} width={48} />
                  <Tooltip formatter={v => [fmtMoney(v, currency), 'Adeudo']} contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'var(--sand-50)' }} />
                  <Bar dataKey="amount" radius={[6, 6, 0, 0]}>
                    {aging.map((a, i) => <Cell key={a.key} fill={[COLORS.amber, COLORS.amber, COLORS.coral, COLORS.coral][i]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      <div className="rd-grid-2">
        <Card title="Cobranza por tipo de renta" hint="Avance del mes en renta fija, variable y otros cargos.">
          <div className="rd-card-body">
            {(fin.by_scheme || []).filter(s => s.expected > 0).length === 0 ? <Empty text="Aún no hay cargos este mes. Usa “Generar mes” en Cobranza." /> : (
              fin.by_scheme.filter(s => s.expected > 0).map(s => {
                const pct = s.expected ? Math.round((s.collected / s.expected) * 100) : 0;
                return (
                  <div key={s.key} style={{ marginBottom: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                      <strong>{s.label}</strong>
                      <span style={{ color: 'var(--ink-500)' }}>{money0(s.collected, currency)} de {money0(s.expected, currency)} · {pct}%</span>
                    </div>
                    <div className="rd-bar"><span style={{ width: `${Math.min(100, pct)}%`, background: s.key === 'variable' ? COLORS.amber : s.key === 'extras' ? COLORS.blue : COLORS.teal }} /></div>
                  </div>
                );
              })
            )}
          </div>
        </Card>
        <Card title="Formas de pago del mes" hint="Cómo te están pagando.">
          <Donut
            data={(fin.by_method || []).map(m => ({ label: m.name, value: m.amount }))}
            centerValue={compact(fin.received_in_month || 0)} centerLabel="recibido" money currency={currency}
          />
        </Card>
      </div>

      <div className="rd-grid-2">
        <Card title="Quién debe más" hint="Top adeudos vencidos por contrato." action={{ label: 'Cobrar', onClick: () => go('/app/rentas/cobranza') }}>
          {(fin.top_overdue || []).length === 0 ? <Empty icon={CheckCircle} text="Nadie tiene adeudos vencidos." /> : (
            <div className="rd-card-body" style={{ paddingTop: 0 }}>
              {fin.top_overdue.map(r => (
                <div key={r.contract_id} className="rd-row">
                  <div className="rd-row-main">
                    <div className="rd-row-title">{r.property_code} · {r.tenant_name || 'Sin inquilino'}</div>
                    <div className="rd-row-sub">{r.charges} cargo(s) · hasta {r.max_days} día(s) de atraso</div>
                  </div>
                  <strong style={{ color: 'var(--coral-600)' }}>{money0(r.amount, currency)}</strong>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card title="Últimos pagos recibidos" hint="Del mes seleccionado.">
          {(fin.recent_payments || []).length === 0 ? <Empty text="Aún no hay pagos registrados este mes." /> : (
            <div className="rd-card-body" style={{ paddingTop: 0 }}>
              {fin.recent_payments.map(p => (
                <div key={p.id} className="rd-row">
                  <div className="rd-row-main">
                    <div className="rd-row-title">{p.property_code || 'Contrato'} · {p.tenant_name || '—'}</div>
                    <div className="rd-row-sub">{fmtDate(p.date)} · {p.method}</div>
                  </div>
                  <strong style={{ color: 'var(--teal-700)' }}>{money0(p.amount, currency)}</strong>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

function ContratosTab({ ct, pf, currency, go }) {
  const stage = (ct.by_stage || []).filter(s => s.value > 0);
  return (
    <>
      <div className="rd-mini-grid" style={{ marginBottom: 16 }}>
        <MiniStat label="Vigentes" value={ct.active || 0} tone="good" />
        <MiniStat label="Por vencer" value={ct.expiring || 0} tone={ct.expiring ? 'warn' : ''} />
        <MiniStat label="Vencidos" value={ct.expired || 0} tone={ct.expired ? 'bad' : ''} />
        <MiniStat label="Borradores" value={ct.draft || 0} />
        <MiniStat label="Pendientes de firma" value={ct.pending_signatures || 0} />
        <MiniStat label="Rentas por confirmar" value={ct.estimated_count || 0} sub="Variables estimadas" />
      </div>

      <div className="rd-grid-2">
        <Card title="Contratos por estado" action={{ label: 'Ver contratos', onClick: () => go('/app/rentas/contratos') }}>
          <Donut
            data={ct.by_status || []} colorMap={STATUS_COLORS}
            centerValue={ct.total || 0} centerLabel="contratos"
          />
        </Card>
        <Card title="¿Cuándo vencen tus contratos de renta?" hint="Para planear renovaciones con tiempo.">
          <div className="rd-card-body">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={ct.expiry_buckets || []} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--sand-100)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--ink-500)' }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--ink-400)' }} axisLine={false} tickLine={false} width={34} />
                <Tooltip formatter={v => [v, 'Contratos']} contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'var(--sand-50)' }} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {(ct.expiry_buckets || []).map((b, i) => <Cell key={b.key} fill={[COLORS.coral, COLORS.amber, COLORS.blue, COLORS.teal][i]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="rd-grid-3">
        <Card title="Por tipo de contrato">
          <HBars data={ct.by_kind || []} color={COLORS.blue} />
        </Card>
        <Card title="Asistente legal" hint="Contratos en proceso de redacción y firma.">
          {stage.length === 0 ? <Empty text="Ningún contrato en proceso legal." /> : <HBars data={ct.by_stage || []} color={COLORS.purple} />}
        </Card>
        <Card title="Esquema de renta" hint="Contratos de renta vigentes.">
          <div className="rd-card-body">
            <SplitBar parts={[
              { label: 'Fija', value: ct.fixed_count || 0, color: COLORS.teal },
              { label: 'Variable', value: ct.variable_count || 0, color: COLORS.amber },
            ]} counts />
            <p style={{ fontSize: 12, color: 'var(--ink-500)', marginTop: 12 }}>
              Renta fija {money0(pf.fixed_rent, currency)} · variable {money0(pf.variable_rent, currency)} al mes.
            </p>
          </div>
        </Card>
      </div>

      <Card title="Próximos vencimientos" hint="Contratos de renta que terminan en los próximos 90 días." action={{ label: 'Vigencias', onClick: () => go('/app/rentas/contratos?tab=vigencias') }}>
        {(ct.upcoming || []).length === 0 ? <Empty icon={CheckCircle} text="No hay vencimientos próximos." /> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Contrato</th><th>Inmueble</th><th>Inquilino</th><th>Renta</th><th>Vence</th><th>Estado</th></tr>
              </thead>
              <tbody>
                {ct.upcoming.map(r => (
                  <tr key={r.id}>
                    <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>{r.code}</td>
                    <td>{r.property_code} · {r.property_name}</td>
                    <td>{r.tenant_name || '—'}</td>
                    <td>{fmtMoney(r.rent, currency)}</td>
                    <td>
                      <div>{fmtDate(r.end_date)}</div>
                      <div style={{ fontSize: 11 }}><DaysBadge days={r.days_left} plain /></div>
                    </td>
                    <td><StatusPill map={CONTRACT_STATUS} value={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

function MantenimientoTab({ mt, pv, ops, currency, go, tenantId, canWrite }) {
  return (
    <>
      <div className="rd-mini-grid" style={{ marginBottom: 16 }}>
        <MiniStat label="Solicitudes abiertas" value={ops.requests_open || 0} tone={ops.requests_new ? 'warn' : ''} sub={`${ops.requests_new || 0} nuevas`} />
        <MiniStat label="Solicitudes fuera de SLA" value={ops.requests_overdue || 0} tone={ops.requests_overdue ? 'bad' : ''} />
        <MiniStat label="Órdenes fuera de SLA" value={ops.orders_sla_overdue || 0} tone={ops.orders_sla_overdue ? 'bad' : ''} />
        <MiniStat label="Planes preventivos" value={ops.plans_active || 0} tone={ops.plans_overdue ? 'warn' : ''} sub={`${ops.plans_overdue || 0} vencidos`} />
        <MiniStat label="Equipos fuera de operación" value={ops.assets_down || 0} tone={ops.assets_down ? 'warn' : ''} sub={`${ops.assets_warranty || 0} garantías por vencer`} />
      </div>

      <FMBoard tenantId={tenantId} canWrite={canWrite} go={go} />
      <div style={{ height: 16 }} />

      <div className="rd-mini-grid" style={{ marginBottom: 16 }}>
        <MiniStat label="Trabajos abiertos" value={mt.open || 0} sub={`${mt.open_preventivo || 0} prev. · ${mt.open_correctivo || 0} corr.`} />
        <MiniStat label="Atrasados" value={mt.overdue || 0} tone={mt.overdue ? 'warn' : ''} />
        <MiniStat label="Urgentes" value={mt.urgent || 0} tone={mt.urgent ? 'bad' : ''} sub={`${mt.high || 0} de prioridad alta`} />
        <MiniStat label="Gasto del mes" value={money0(mt.cost_month, currency)} sub={`6 meses: ${money0(mt.cost_window, currency)}`} />
        <MiniStat label="Realizados" value={mt.done_total || 0} />
      </div>

      <div className="rd-grid-21">
        <Card title="Gasto en mantenimiento" hint="Trabajos realizados por mes." action={{ label: 'Abrir', onClick: () => go('/app/rentas/mantenimiento') }}>
          <div className="rd-card-body">
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={mt.cost_trend || []} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--sand-100)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--ink-500)' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={compact} tick={{ fontSize: 10, fill: 'var(--ink-400)' }} axisLine={false} tickLine={false} width={48} />
                <Tooltip
                  formatter={(v, n) => [n === 'cost' ? fmtMoney(v, currency) : v, n === 'cost' ? 'Gasto' : 'Trabajos']}
                  contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'var(--sand-50)' }}
                />
                <Bar dataKey="cost" fill={COLORS.purple} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Trabajos abiertos por prioridad">
          <Donut
            data={(mt.by_priority || []).filter(x => x.value > 0)} colorMap={PRIORITY_COLORS}
            centerValue={mt.open || 0} centerLabel="abiertos"
          />
        </Card>
      </div>

      <div className="rd-grid-2">
        <Card title="Por atender" hint="Urgentes, prioridad alta o fuera de fecha.">
          {(mt.attention || []).length === 0 ? <Empty icon={CheckCircle} text="Nada crítico pendiente." /> : (
            <div className="rd-card-body" style={{ paddingTop: 0 }}>
              {mt.attention.map(w => <WorkRow key={w.id} w={w} />)}
            </div>
          )}
        </Card>
        <Card title="Próximos 14 días" hint="Trabajos programados.">
          {(mt.upcoming || []).length === 0 ? <Empty text="No hay trabajos programados en las próximas dos semanas." /> : (
            <div className="rd-card-body" style={{ paddingTop: 0 }}>
              {mt.upcoming.map(w => <WorkRow key={w.id} w={w} showDate />)}
            </div>
          )}
        </Card>
      </div>

      <div className="rd-grid-3">
        <Card title="Trabajos por categoría" hint="Últimos 6 meses.">
          {(mt.by_category || []).length === 0 ? <Empty text="Sin trabajos registrados." /> : (
            <HBars data={mt.by_category.map(c => ({ key: c.name, label: c.name, value: c.count }))} color={COLORS.teal} />
          )}
        </Card>
        <Card title="Propiedades con más gasto" hint="Últimos 6 meses.">
          {(mt.top_properties || []).length === 0 ? <Empty text="Sin costos capturados." /> : (
            <div className="rd-card-body" style={{ paddingTop: 0 }}>
              {mt.top_properties.map(p => (
                <div key={p.code} className="rd-row">
                  <div className="rd-row-main">
                    <div className="rd-row-title">{p.code} · {p.name}</div>
                    <div className="rd-row-sub">{p.count} trabajo(s)</div>
                  </div>
                  <strong>{money0(p.cost, currency)}</strong>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card title="Proveedores y REPSE" action={{ label: 'Proveedores', onClick: () => go('/app/rentas/mantenimiento') }}>
          <div className="rd-card-body">
            <div className="rd-row" style={{ paddingTop: 0 }}><span>Proveedores activos</span><strong>{pv.total || 0}</strong></div>
            <div className="rd-row"><span>Con expediente digital</span><strong>{pv.with_expediente || 0}</strong></div>
            <div className="rd-row"><span>Sin expediente</span><strong style={{ color: pv.without_expediente ? 'var(--amber-600)' : undefined }}>{pv.without_expediente || 0}</strong></div>
            <div className="rd-row"><span>REPSE vigentes</span><strong style={{ color: 'var(--teal-700)' }}>{pv.repse_vigente || 0}</strong></div>
            <div className="rd-row"><span>REPSE por vencer (60 d)</span><strong style={{ color: pv.repse_expiring ? 'var(--amber-600)' : undefined }}>{pv.repse_expiring || 0}</strong></div>
            <div className="rd-row"><span>REPSE vencidos</span><strong style={{ color: pv.repse_expired ? 'var(--coral-600)' : undefined }}>{pv.repse_expired || 0}</strong></div>
            {(pv.repse_alerts || []).length > 0 && (
              <div style={{ fontSize: 12, color: 'var(--ink-500)', marginTop: 8 }}>
                {pv.repse_alerts.map(a => `${a.name} (${a.expired ? 'vencido' : `vence ${fmtDate(a.expires_at)}`})`).join(' · ')}
              </div>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}

function ComercialTab({ crm, ab, pf, currency, go }) {
  return (
    <>
      <div className="rd-mini-grid" style={{ marginBottom: 16 }}>
        <MiniStat label="Prospectos abiertos" value={crm.open || 0} />
        <MiniStat label="Nuevos este mes" value={crm.new_month || 0} />
        <MiniStat label="Ganados este mes" value={crm.won_month || 0} tone="good" />
        <MiniStat label="Conversión" value={`${crm.conversion_pct || 0}%`} sub={`${crm.won || 0} ganados · ${crm.lost || 0} perdidos`} />
        <MiniStat label="Renta en negociación" value={money0(crm.pipeline_value, currency)} sub="Interés de prospectos abiertos" />
        <MiniStat label="Unidades vacantes" value={pf.vacant || 0} sub="Disponibles para ofrecer" />
      </div>

      <div className="rd-grid-21">
        <Card title="Embudo de prospectos" hint="Cuántos prospectos hay en cada etapa." action={{ label: 'Abrir CRM', onClick: () => go('/app/rentas/crm') }}>
          <div className="rd-card-body">
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={crm.funnel || []} layout="vertical" margin={{ top: 4, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--sand-100)" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--ink-500)' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="label" width={90} tick={{ fontSize: 12, fill: 'var(--ink-600)' }} axisLine={false} tickLine={false} />
                <Tooltip formatter={v => [v, 'Prospectos']} contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'var(--sand-50)' }} />
                <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                  {(crm.funnel || []).map((f, i) => <Cell key={f.key} fill={f.key === 'ganado' ? COLORS.teal : [COLORS.blue, COLORS.blue, COLORS.purple, COLORS.amber, COLORS.amber][i] || COLORS.blue} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="¿De dónde llegan?" hint="Origen de tus prospectos.">
          <Donut data={crm.by_source || []} centerValue={crm.total || 0} centerLabel="prospectos" />
        </Card>
      </div>

      <div className="card" style={{ padding: '14px 16px', display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#E61E4D' }}>Airbnb</div>
          <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>
            {ab.listings || 0} anuncio(s) en inventario
            {ab.occupied_now ? ` · ${ab.occupied_now} ocupado(s) ahora` : ''}
            {ab.connections ? ` · ${ab.connections} cuenta(s)` : ''}
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: 2 }}>
            {ab.last_synced_at
              ? `Última sync ${new Date(ab.last_synced_at).toLocaleString('es-MX')}`
              : 'Registra la cuenta del anfitrión e importa anuncios (URL + iCal). Sin contraseña.'}
          </div>
        </div>
        <button className="btn btn-outline" onClick={() => go('/app/rentas/config#airbnb')}>Gestionar Airbnb</button>
      </div>
    </>
  );
}

