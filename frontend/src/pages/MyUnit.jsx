import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { reportsAPI, tenantsAPI, assemblyAPI } from '../api/client';
import { periodLabel, statusClass, statusLabel, fmtDate } from '../utils/helpers';
import {
  Home, User, DollarSign, FileText, Building2,
  Receipt, ShoppingBag, ChevronLeft, ChevronRight,
  TrendingDown, TrendingUp, Users, UserCheck, Mail, Phone,
  Wallet, Activity, CheckCircle, AlertCircle, Clock, BarChart2, Calendar,
} from 'lucide-react';

// ─── Formatters ────────────────────────────────────────────────────────────
function fmt(n) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency', currency: 'MXN',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n ?? 0);
}
function fmtDec(n) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency', currency: 'MXN',
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(n ?? 0);
}
function monthLabel(p) {
  if (!p) return '';
  const [y, m] = p.split('-');
  return new Date(+y, +m - 1, 1).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
}
function prevPeriod(p) {
  const [y, m] = p.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function nextPeriod(p) {
  const [y, m] = p.split('-').map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ─── SVG: Donut simple ────────────────────────────────────────────────────
function SvgDonut({ pct = 0, color = 'var(--teal-400)', size = 110 }) {
  const sw = 10;
  const r = (size - sw) / 2;
  const circ = 2 * Math.PI * r;
  const dash = `${(Math.min(pct, 100) / 100) * circ} ${circ}`;
  const cx = size / 2, cy = size / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}
      style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--sand-100)" strokeWidth={sw} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={sw}
        strokeDasharray={dash} strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.6s ease' }} />
    </svg>
  );
}

// ─── SVG: Gauge semicircular ───────────────────────────────────────────────
function SvgGauge({ pct = 0, color = 'var(--teal-400)', size = 200 }) {
  const safe = Math.min(Math.max(pct, 0), 100);
  const sw = 16;
  const r = (size - sw - 4) / 2;
  const circ = 2 * Math.PI * r;
  const half = circ / 2;
  const fgLen = (safe / 100) * half;
  const cx = size / 2, cy = size / 2;
  const angleDeg = 180 - (safe / 100) * 180;
  const angleRad = (angleDeg * Math.PI) / 180;
  const nLen = r * 0.66;
  const nx = cx + nLen * Math.cos(angleRad);
  const ny = cy - nLen * Math.sin(angleRad);
  const viewH = cy + sw / 2 + 6;
  const ticks = [0, 50, 100].map(v => {
    const a = (180 - v * 180 / 100) * Math.PI / 180;
    const outerR = r + sw / 2 + 3;
    const innerR = r - sw / 2 - 2;
    return {
      x1: cx + innerR * Math.cos(a), y1: cy - innerR * Math.sin(a),
      x2: cx + outerR * Math.cos(a), y2: cy - outerR * Math.sin(a),
    };
  });
  return (
    <svg width={size} height={viewH} viewBox={`0 0 ${size} ${viewH}`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--sand-100)" strokeWidth={sw}
        strokeDasharray={`${half} ${circ}`}
        style={{ transform: `rotate(180deg)`, transformOrigin: `${cx}px ${cy}px` }} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={sw}
        strokeDasharray={`${fgLen} ${circ}`} strokeLinecap="round"
        style={{ transform: `rotate(180deg)`, transformOrigin: `${cx}px ${cy}px`, transition: 'stroke-dasharray 0.7s ease', filter: `drop-shadow(0 0 4px ${color}66)` }} />
      {ticks.map((tk, i) => (
        <line key={i} x1={tk.x1} y1={tk.y1} x2={tk.x2} y2={tk.y2}
          stroke="var(--ink-300)" strokeWidth={1.5} strokeLinecap="round" />
      ))}
      <line x1={cx} y1={cy} x2={nx} y2={ny}
        stroke="var(--ink-600)" strokeWidth={3} strokeLinecap="round"
        style={{ transition: 'all 0.7s ease' }} />
      <circle cx={cx} cy={cy} r={sw / 2 - 1} fill="var(--ink-700)" />
      <circle cx={cx} cy={cy} r={sw / 4} fill="var(--white)" />
    </svg>
  );
}

// ─── SVG: Donut multi-segmento ─────────────────────────────────────────────
function SvgDonutMulti({ segments = [], size = 140 }) {
  const total = segments.reduce((a, b) => a + (b.value || 0), 0);
  if (total === 0) {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={(size - 16) / 2}
          fill="none" stroke="var(--sand-100)" strokeWidth={16} />
      </svg>
    );
  }
  const cx = size / 2, cy = size / 2;
  const r = (size - 20) / 2;
  const ir = r * 0.60;
  let current = -Math.PI / 2;
  const arcs = segments.map(seg => {
    const frac = (seg.value || 0) / total;
    const sweep = frac * 2 * Math.PI;
    const start = current, end = start + sweep;
    current = end;
    const x1 = cx + r * Math.cos(start), y1 = cy + r * Math.sin(start);
    const x2 = cx + r * Math.cos(end),   y2 = cy + r * Math.sin(end);
    const ix1 = cx + ir * Math.cos(end),  iy1 = cy + ir * Math.sin(end);
    const ix2 = cx + ir * Math.cos(start),iy2 = cy + ir * Math.sin(start);
    const lg = sweep > Math.PI ? 1 : 0;
    const path = sweep < 0.001 ? '' :
      `M ${x1} ${y1} A ${r} ${r} 0 ${lg} 1 ${x2} ${y2} L ${ix1} ${iy1} A ${ir} ${ir} 0 ${lg} 0 ${ix2} ${iy2} Z`;
    return { ...seg, path, frac };
  });
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {arcs.map((arc, i) => arc.path ? (
        <path key={i} d={arc.path} fill={arc.color} style={{ transition: 'all 0.5s ease' }}>
          <title>{arc.label}: {fmt(arc.value)}</title>
        </path>
      ) : null)}
    </svg>
  );
}

// ─── Gauge Card ────────────────────────────────────────────────────────────
function GaugeCard({ title, pct, color, subLeft, subRight, icon: Icon }) {
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="card-head">
        <h3 style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {Icon && <Icon size={15} color="var(--ink-400)" />}
          {title}
        </h3>
      </div>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
        <div style={{ position: 'relative', width: '100%', display: 'flex', justifyContent: 'center' }}>
          <SvgGauge pct={pct} color={color} size={220} />
          <div style={{ position: 'absolute', bottom: -4, left: '50%', transform: 'translateX(-50%)', textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 800, color, lineHeight: 1 }}>
              {pct}%
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', marginTop: 20, paddingTop: 12, borderTop: '1px solid var(--sand-100)' }}>
          <div style={{ textAlign: 'center', flex: 1 }}>
            <div style={{ fontSize: 11, color: 'var(--ink-400)', marginBottom: 2 }}>{subLeft?.label}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink-700)' }}>{subLeft?.value}</div>
          </div>
          <div style={{ width: 1, background: 'var(--sand-100)' }} />
          <div style={{ textAlign: 'center', flex: 1 }}>
            <div style={{ fontSize: 11, color: 'var(--ink-400)', marginBottom: 2 }}>{subRight?.label}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink-700)' }}>{subRight?.value}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Info Card ─────────────────────────────────────────────────────────────
function InfoCard({ label, value }) {
  return (
    <div className="info-item">
      <div className="info-item-label">{label}</div>
      <div className="info-item-value">
        {value || <span style={{ color: 'var(--ink-300)', fontWeight: 400, fontStyle: 'italic', fontSize: 14 }}>No registrado</span>}
      </div>
    </div>
  );
}

// ─── Sub-section label ─────────────────────────────────────────────────────
function SubLabel({ children }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--ink-400)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
      {children}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────
export default function MyUnit() {
  const { tenantId, tenantName, user } = useAuth();

  // Tab
  const [activeTab, setActiveTab] = useState('unidad');

  // Tu Unidad data (period-independent)
  const [data, setData] = useState(null);
  const [tenantData, setTenantData] = useState(null);
  const [committees, setCommittees] = useState([]);
  const [loading, setLoading] = useState(true);

  // General + Económicos data (period-dependent)
  const [period, setPeriod] = useState(todayStr());
  const [stats, setStats] = useState(null);
  const [generalReport, setGeneralReport] = useState(null);
  const [dashLoading, setDashLoading] = useState(false);

  // ── Initial load ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!tenantId) return;
    setLoading(true);
    Promise.all([
      reportsAPI.estadoCuenta(tenantId, { unit_id: 'me' }).catch(() => null),
      tenantsAPI.get(tenantId).catch(() => null),
      assemblyAPI.committees(tenantId).catch(() => ({ data: [] })),
    ]).then(([ecRes, tRes, cmtRes]) => {
      setData(ecRes?.data || null);
      setTenantData(tRes?.data || null);
      const raw = cmtRes?.data;
      setCommittees(Array.isArray(raw) ? raw : (raw?.results || []));
    }).finally(() => setLoading(false));
  }, [tenantId]);

  // ── Period-dependent load ─────────────────────────────────────────────
  const loadDash = useCallback(async () => {
    if (!tenantId) return;
    setDashLoading(true);
    try {
      const [dashRes, genRes] = await Promise.all([
        reportsAPI.dashboard(tenantId, period),
        reportsAPI.reporteGeneral(tenantId, period).catch(() => ({ data: null })),
      ]);
      setStats(dashRes.data);
      setGeneralReport(genRes.data);
    } catch { /* silently ignore */ }
    finally { setDashLoading(false); }
  }, [tenantId, period]);

  useEffect(() => { loadDash(); }, [loadDash]);

  // ── Loading state ─────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '50vh', gap: 16 }}>
        <div style={{ width: 40, height: 40, borderRadius: '50%', border: '3px solid var(--sand-100)', borderTopColor: 'var(--teal-400)', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <p style={{ color: 'var(--ink-400)', fontSize: 14 }}>Cargando tu unidad…</p>
      </div>
    );
  }

  if (!data?.unit) {
    return (
      <div className="content-fade">
        <div className="empty">
          <div className="empty-icon">🏠</div>
          <h4>Sin unidad asignada</h4>
          <p>Tu cuenta no tiene una unidad vinculada. Contacta al administrador para que te asigne tu unidad.</p>
        </div>
      </div>
    );
  }

  // ── Computed: Tu Unidad ───────────────────────────────────────────────
  const { unit, periods, total_charges, total_payments, balance, net_prev_debt, credit_balance } = data;
  const balanceNum  = parseFloat(balance) || 0;
  const netPrevDebt = parseFloat(net_prev_debt) || 0;
  const creditBal   = parseFloat(credit_balance) || 0;

  // ── Computed: General + Económicos ───────────────────────────────────
  const s = stats || {};
  const t = tenantData || {};

  const minPeriod = t.operation_start_date
    ? t.operation_start_date.slice(0, 7)
    : (t.created_at ? t.created_at.slice(0, 7) : '');

  const registered  = s.total_units ?? 0;
  const planned     = s.units_planned ?? t.units_count ?? 0;
  const rentedCnt   = s.rented_count ?? 0;
  const ownerCnt    = registered - rentedCnt;
  const unitPct     = planned > 0 ? Math.round((registered / planned) * 100) : 0;
  const paidCnt     = s.paid_count ?? 0;
  const partialCnt  = s.partial_count ?? 0;
  const pendingCnt  = s.pending_count ?? 0;
  const exemptCnt   = s.exempt_count ?? 0;
  const totalColl   = s.total_collected ?? 0;

  const gr  = generalReport;
  const rd  = gr?.report_data || {};

  const cargosFijos    = s.total_expected ?? 0;
  const cobranza       = parseFloat(rd.ingreso_mantenimiento ?? s.total_collected ?? 0);
  const ingAdelanto    = parseFloat(rd.ingreso_maint_adelanto ?? 0);
  const ingConceptos   = rd.ingresos_conceptos
    ? Object.values(rd.ingresos_conceptos).reduce((a, c) => a + (parseFloat(c.total) || 0), 0)
    : (s.ingreso_adicional ?? 0);
  const ingNoId        = parseFloat(rd.ingresos_no_identificados ?? 0);
  const totalIngresos  = parseFloat(rd.total_ingresos_reconciled ?? (s.total_ingresos ?? s.total_collected ?? 0));
  const gastos         = parseFloat(rd.total_egresos_reconciled ?? s.total_gastos_conciliados ?? 0);
  const saldoInicial   = parseFloat(gr?.saldo_inicial ?? 0);
  const saldoFinal     = parseFloat(gr?.saldo_final ?? 0);
  const hasSaldos      = saldoInicial !== 0 || saldoFinal !== 0;
  const ingAdicional   = ingConceptos;
  const adeudoRecibido = s.total_adeudo_recibido ?? 0;
  const deudaTotal     = s.deuda_total ?? 0;
  const balanceNeto    = totalIngresos - gastos;

  const pctCobVsCargos     = cargosFijos > 0 ? Math.round((cobranza / cargosFijos) * 100) : 0;
  const pctGastosVsIng     = totalIngresos > 0 ? Math.round((gastos / totalIngresos) * 100) : 0;
  const pctIngAdicional    = totalIngresos > 0 ? Math.round((ingAdicional / totalIngresos) * 100) : 0;
  const pctDeudaRecuperada = deudaTotal > 0 ? Math.round((adeudoRecibido / deudaTotal) * 100) : 0;

  const effColor = pctCobVsCargos >= 90 ? 'var(--teal-400)' : pctCobVsCargos >= 70 ? 'var(--amber-400)' : 'var(--coral-400)';
  const gvColor  = pctGastosVsIng <= 60 ? 'var(--teal-400)' : pctGastosVsIng <= 89 ? 'var(--amber-400)' : 'var(--coral-400)';

  const razonSocial = t.razon_social || t.name || '';
  const rfc         = t.rfc || '';
  const address     = [t.info_calle, t.info_num_externo, t.info_colonia, t.info_ciudad].filter(Boolean).join(', ') || '';

  const commonAreas = Array.isArray(t.common_areas)
    ? t.common_areas.filter(a => typeof a === 'object' && a !== null)
    : (typeof t.common_areas === 'string'
        ? t.common_areas.split(',').map(a => a.trim()).filter(Boolean).map(name => ({ id: name, name, active: true }))
        : []);
  const activeAreas = commonAreas.filter(a => a.active !== false);

  const totalUnits = registered || 1;
  const statusBars = [
    { label: 'Pagado',    count: paidCnt,    color: 'var(--teal-400)',  bg: 'var(--teal-50)',  icon: CheckCircle },
    { label: 'Parcial',   count: partialCnt, color: 'var(--amber-400)', bg: 'var(--amber-50)', icon: Activity },
    { label: 'Pendiente', count: pendingCnt, color: 'var(--coral-400)', bg: 'var(--coral-50)', icon: AlertCircle },
    ...(exemptCnt > 0 ? [{ label: 'Exento', count: exemptCnt, color: 'var(--blue-400)', bg: 'var(--blue-50)', icon: Clock }] : []),
  ];

  const incomeSegments = [
    { label: 'Mantenimiento',          value: cobranza,     color: 'var(--teal-500)' },
    ...(ingAdelanto  > 0 ? [{ label: 'Adelantos mant.',       value: ingAdelanto,  color: 'var(--teal-200)' }] : []),
    ...(ingConceptos > 0 ? [{ label: 'Conceptos adicionales', value: ingConceptos, color: 'var(--blue-400)' }] : []),
    ...(ingNoId      > 0 ? [{ label: 'No identificados',      value: ingNoId,      color: 'var(--amber-400)' }] : []),
  ].filter(seg => seg.value > 0);

  // ── Period navigator ───────────────────────────────────────────────────
  const PeriodNav = () => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--white)', border: '1px solid var(--sand-100)', borderRadius: 'var(--radius-lg)', padding: '6px 14px' }}>
      <BarChart2 size={14} color="var(--teal-500)" />
      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-500)' }}>Período:</span>
      <div className="period-nav" style={{ gap: 2 }}>
        <button className="period-nav-btn"
          onClick={() => setPeriod(prevPeriod(period))}
          disabled={!!minPeriod && period <= minPeriod}
          style={{ opacity: (!!minPeriod && period <= minPeriod) ? 0.3 : 1, cursor: (!!minPeriod && period <= minPeriod) ? 'not-allowed' : 'pointer' }}>
          <ChevronLeft size={15} />
        </button>
        <input type="month" className="period-month-select"
          style={{ fontSize: 14, fontWeight: 700 }}
          value={period}
          min={minPeriod || undefined}
          onChange={e => {
            const val = e.target.value;
            if (minPeriod && val < minPeriod) return;
            setPeriod(val);
          }} />
        <button className="period-nav-btn" onClick={() => setPeriod(nextPeriod(period))}>
          <ChevronRight size={15} />
        </button>
      </div>
      {dashLoading && (
        <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid var(--sand-100)', borderTopColor: 'var(--teal-400)', animation: 'spin 0.8s linear infinite', marginLeft: 4 }} />
      )}
    </div>
  );

  return (
    <div className="content-fade">
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .dash-kpi { background: var(--white); border: 1px solid var(--sand-100); border-radius: var(--radius-lg); padding: 20px; display: flex; flex-direction: column; gap: 4; position: relative; overflow: hidden; }
        .dash-kpi::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; background: var(--accent-color, var(--teal-400)); border-radius: var(--radius-lg) var(--radius-lg) 0 0; }
        .dash-kpi-icon { width: 36px; height: 36px; border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-bottom: 8px; }
        .dash-kpi-label { font-size: 11px; font-weight: 600; color: var(--ink-400); text-transform: uppercase; letter-spacing: 0.05em; }
        .dash-kpi-value { font-size: 22px; font-weight: 800; color: var(--ink-800); font-family: var(--font-display); line-height: 1.1; }
        .dash-kpi-sub { font-size: 11px; color: var(--ink-400); margin-top: 2px; }
        .dash-kpi-badge { position: absolute; top: 12px; right: 12px; font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 20px; }
        .kpi-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; }
      `}</style>

      {/* ── Welcome card ────────────────────────────────────────────────── */}
      <div className="welcome-card">
        <h2>Hola, {user?.name || unit.owner_first_name} 👋</h2>
        <p>Bienvenido a tu portal de vecino · {tenantName}</p>
      </div>

      {/* ── Tab bar + Period navigator ───────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <div className="tabs" style={{ marginBottom: 0 }}>
          <button className={`tab ${activeTab === 'unidad'   ? 'active' : ''}`} onClick={() => setActiveTab('unidad')}>
            Tu Unidad
          </button>
          <button className={`tab ${activeTab === 'general'  ? 'active' : ''}`} onClick={() => setActiveTab('general')}>
            General
          </button>
          <button className={`tab ${activeTab === 'economico' ? 'active' : ''}`} onClick={() => setActiveTab('economico')}>
            Económicos
          </button>
        </div>
        <PeriodNav />
      </div>

      {/* ════════════════════════ TAB: TU UNIDAD ═══════════════════════════ */}
      {activeTab === 'unidad' && (
        <div>
          {/* Condominio info simple */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-head"><h3>Información del Condominio</h3></div>
            <div className="card-body">
              <div className="info-grid">
                <InfoCard label="Condominio" value={tenantName} />
                <InfoCard label="Cuota Mensual" value={fmt(t.maintenance_fee)} />
                <InfoCard label="País" value={t.country} />
              </div>
            </div>
          </div>

          {/* Unit + Balance */}
          <div className="grid-2" style={{ marginBottom: 20 }}>
            <div className="card">
              <div className="card-head">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div className="stat-icon teal"><Home size={16} /></div>
                  <h3>Tu Unidad</h3>
                </div>
                <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--teal-600)', background: 'var(--teal-50)', padding: '4px 12px', borderRadius: 8, fontSize: 13 }}>
                  {unit.unit_id_code}
                </span>
              </div>
              <div className="card-body">
                <div className="info-grid">
                  <InfoCard label="Nombre" value={unit.unit_name} />
                  <InfoCard label="Ocupación" value={unit.occupancy ? unit.occupancy.charAt(0).toUpperCase() + unit.occupancy.slice(1) : null} />
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-head"><h3>Resumen de Cuenta</h3></div>
              <div className="card-body">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--sand-100)' }}>
                    <span style={{ fontSize: 13, color: 'var(--ink-500)' }}>Total Cargos</span>
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 500, color: 'var(--ink-800)' }}>{fmt(total_charges)}</span>
                  </div>
                  {netPrevDebt > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--sand-100)' }}>
                      <div>
                        <span style={{ fontSize: 13, color: 'var(--ink-500)' }}>Recaudo de adeudos</span>
                        <div style={{ fontSize: 11, color: 'var(--ink-300)', marginTop: 2 }}>saldo pendiente de períodos anteriores</div>
                      </div>
                      <span style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 500, color: 'var(--coral-500)' }}>{fmt(netPrevDebt)}</span>
                    </div>
                  )}
                  {creditBal > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--sand-100)' }}>
                      <div>
                        <span style={{ fontSize: 13, color: 'var(--ink-500)' }}>Saldo a favor</span>
                        <div style={{ fontSize: 11, color: 'var(--ink-300)', marginTop: 2 }}>crédito disponible en tu cuenta</div>
                      </div>
                      <span style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 500, color: 'var(--teal-600)' }}>{fmt(creditBal)}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--sand-100)' }}>
                    <span style={{ fontSize: 13, color: 'var(--ink-500)' }}>Total Pagado</span>
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 500, color: 'var(--teal-600)' }}>{fmt(total_payments)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0' }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink-700)' }}>Saldo Total</span>
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 500, color: balanceNum > 0 ? 'var(--coral-500)' : 'var(--teal-600)' }}>
                      {fmt(balanceNum)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Owner */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-head">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className="stat-icon blue"><User size={16} /></div>
                <h3>Propietario</h3>
              </div>
            </div>
            <div className="card-body">
              <div className="info-grid">
                <InfoCard label="Nombre" value={`${unit.owner_first_name || ''} ${unit.owner_last_name || ''}`.trim()} />
                <InfoCard label="Email" value={unit.owner_email} />
                <InfoCard label="Teléfono" value={unit.owner_phone} />
                <InfoCard label="RFC" value={unit.owner_rfc} />
              </div>
            </div>
          </div>

          {/* Inquilino (si aplica) */}
          {unit.occupancy === 'rentada' && (
            <div className="card" style={{ marginBottom: 20 }}>
              <div className="card-head">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div className="stat-icon amber"><User size={16} /></div>
                  <h3>Inquilino</h3>
                </div>
                <span className="badge badge-amber">Rentada</span>
              </div>
              <div className="card-body">
                <div className="info-grid">
                  <InfoCard label="Nombre" value={`${unit.tenant_first_name || ''} ${unit.tenant_last_name || ''}`.trim() || null} />
                  <InfoCard label="Email" value={unit.tenant_email} />
                  <InfoCard label="Teléfono" value={unit.tenant_phone} />
                </div>
              </div>
            </div>
          )}

          {/* Historial de pagos */}
          <div className="card">
            <div className="card-head">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className="stat-icon ink"><FileText size={16} /></div>
                <h3>Historial de Pagos</h3>
              </div>
              <span className="badge badge-gray">{periods.length} períodos</span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Período</th>
                    <th style={{ textAlign: 'right' }}>Cargo</th>
                    <th style={{ textAlign: 'right' }}>Pagado</th>
                    <th>Estado</th>
                    <th>Forma de Pago</th>
                    <th>Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {periods.map((p, i) => {
                    const rowBal = parseFloat(p.charge || 0) - parseFloat(p.paid || 0);
                    return (
                      <tr key={i} className={rowBal > 0.5 ? 'period-row-debt' : 'period-row-ok'}>
                        <td style={{ fontWeight: 700, fontSize: 13 }}>{periodLabel(p.period)}</td>
                        <td style={{ textAlign: 'right', fontSize: 13 }}>{fmt(p.charge)}</td>
                        <td style={{ textAlign: 'right', fontSize: 13, fontWeight: 700, color: 'var(--teal-700)' }}>{fmt(p.paid)}</td>
                        <td><span className={`badge ${statusClass(p.status)}`}>{statusLabel(p.status)}</span></td>
                        <td style={{ fontSize: 12 }}>{p.payment_type || '—'}</td>
                        <td style={{ fontSize: 12 }}>{fmtDate(p.payment_date)}</td>
                      </tr>
                    );
                  })}
                  {periods.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--ink-300)', fontSize: 14 }}>
                        Sin registros de pago
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════ TAB: GENERAL ═════════════════════════════ */}
      {activeTab === 'general' && (
        <div>
          {/* KPI strip */}
          <div className="kpi-grid" style={{ marginBottom: 20 }}>
            <div className="dash-kpi" style={{ '--accent-color': 'var(--teal-400)' }}>
              <div className="dash-kpi-icon" style={{ background: 'var(--teal-50)' }}><Building2 size={18} color="var(--teal-600)" /></div>
              <div className="dash-kpi-label">Unidades</div>
              <div className="dash-kpi-value">
                {registered}<span style={{ fontSize: 14, fontWeight: 400, color: 'var(--ink-400)' }}> / {planned}</span>
              </div>
              <div style={{ marginTop: 8, height: 4, background: 'var(--sand-100)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${unitPct}%`, background: 'var(--teal-400)', borderRadius: 4, transition: 'width 0.6s ease' }} />
              </div>
              <div className="dash-kpi-sub" style={{ marginTop: 4 }}>{unitPct}% registradas</div>
            </div>

            <div className="dash-kpi" style={{ '--accent-color': 'var(--amber-400)' }}>
              <div className="dash-kpi-icon" style={{ background: 'var(--amber-50)' }}><DollarSign size={18} color="var(--amber-600)" /></div>
              <div className="dash-kpi-label">Cuota Mensual</div>
              <div className="dash-kpi-value" style={{ fontSize: 18 }}>{new Intl.NumberFormat('es-MX').format(s.maintenance_fee ?? 0)}</div>
              <div className="dash-kpi-sub">{t.currency || 'MXN'} / unidad / mes</div>
            </div>

            <div className="dash-kpi" style={{ '--accent-color': 'var(--coral-400)' }}>
              <div className="dash-kpi-icon" style={{ background: 'var(--coral-50)' }}><Receipt size={18} color="var(--coral-600)" /></div>
              <div className="dash-kpi-label">Cobrado — {monthLabel(s.period || period)}</div>
              <div className="dash-kpi-value">
                {paidCnt}<span style={{ fontSize: 14, fontWeight: 400, color: 'var(--ink-400)' }}>/{registered - exemptCnt}</span>
              </div>
              <div className="dash-kpi-sub">
                {new Intl.NumberFormat('es-MX').format(totalColl)} recaudado
                {exemptCnt > 0 && <span style={{ color: 'var(--blue-500)', marginLeft: 4 }}>· {exemptCnt} exentas</span>}
              </div>
            </div>
          </div>

          {/* Condominio info + Áreas Comunes */}
          <div className="grid-2" style={{ marginBottom: 20 }}>
            <div className="card">
              <div className="card-head"><h3>Información del Condominio</h3></div>
              <div className="card-body">
                <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                  {t.logo ? (
                    <img src={t.logo} alt="Logo" style={{ width: 60, height: 60, borderRadius: 12, objectFit: 'cover', flexShrink: 0, border: '1px solid var(--sand-100)' }} />
                  ) : (
                    <div style={{ width: 60, height: 60, borderRadius: 12, background: 'var(--teal-50)', border: '1px solid var(--teal-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Building2 size={26} color="var(--teal-400)" />
                    </div>
                  )}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--ink-800)', marginBottom: 4 }}>{razonSocial}</div>
                    {rfc && <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>RFC: {rfc}</div>}
                    {address && <div style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: 4, lineHeight: 1.4 }}>{address}</div>}
                    {t.country && <div style={{ fontSize: 11, color: 'var(--ink-300)', marginTop: 6 }}>{t.country}{t.state ? ' · ' + t.state : ''} · {t.currency || 'MXN'}</div>}
                  </div>
                </div>
                {/* Ocupación */}
                <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--sand-100)', display: 'flex', alignItems: 'center', gap: 20 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-400)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>Ocupación</div>
                    {[
                      { label: 'Propietarios', count: ownerCnt,  pct: registered > 0 ? Math.round((ownerCnt  / registered) * 100) : 0, color: 'var(--teal-400)' },
                      { label: 'Rentados',     count: rentedCnt, pct: registered > 0 ? Math.round((rentedCnt / registered) * 100) : 0, color: 'var(--amber-400)' },
                    ].map(row => (
                      <div key={row.label} style={{ marginBottom: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                          <span style={{ color: 'var(--ink-600)', fontWeight: 600 }}>{row.label}</span>
                          <span style={{ color: 'var(--ink-400)' }}>{row.count} ({row.pct}%)</span>
                        </div>
                        <div style={{ height: 6, background: 'var(--sand-100)', borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${row.pct}%`, background: row.color, borderRadius: 4, transition: 'width 0.6s ease' }} />
                        </div>
                      </div>
                    ))}
                  </div>
                  {registered > 0 && (
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      <SvgDonut pct={ownerCnt > 0 ? Math.round((ownerCnt / registered) * 100) : 0} color="var(--teal-400)" size={80} />
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: 'var(--ink-700)' }}>
                        {Math.round((ownerCnt / registered) * 100)}%
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-head">
                <h3>Áreas Comunes</h3>
                {activeAreas.length > 0 && <span className="badge badge-teal">{activeAreas.length} área{activeAreas.length !== 1 ? 's' : ''}</span>}
              </div>
              <div className="card-body">
                {activeAreas.length === 0 ? (
                  <div style={{ fontSize: 13, color: 'var(--ink-300)', fontStyle: 'italic' }}>Sin áreas comunes activas registradas</div>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {activeAreas.map(a => (
                      <span key={a.id || a.name} className="badge badge-teal"
                        style={{ padding: '5px 12px', fontSize: 12, borderRadius: 20, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        {a.name}
                        {a.reservations_enabled && <Calendar size={11} style={{ opacity: 0.7 }} />}
                      </span>
                    ))}
                  </div>
                )}
                <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--sand-100)' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-400)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>
                    Estatus cobranza — {monthLabel(s.period || period)}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {[
                      { label: 'Pagadas',   count: paidCnt,    color: 'var(--teal-600)',  bg: 'var(--teal-50)',  border: 'var(--teal-100)' },
                      { label: 'Parcial',   count: partialCnt, color: 'var(--amber-700)', bg: 'var(--amber-50)', border: 'var(--amber-100)' },
                      { label: 'Pendiente', count: pendingCnt, color: 'var(--coral-600)', bg: 'var(--coral-50)', border: 'var(--coral-100)' },
                      ...(exemptCnt > 0 ? [{ label: 'Exenta', count: exemptCnt, color: 'var(--blue-600)', bg: 'var(--blue-50)', border: 'var(--blue-100)' }] : []),
                    ].map(b => (
                      <div key={b.label} style={{ padding: '6px 12px', borderRadius: 10, background: b.bg, border: `1px solid ${b.border}`, textAlign: 'center' }}>
                        <div style={{ fontSize: 18, fontWeight: 800, color: b.color, lineHeight: 1 }}>{b.count}</div>
                        <div style={{ fontSize: 10, color: b.color, marginTop: 2, fontWeight: 600 }}>{b.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Committees */}
          {committees.length > 0 && (
            <div className="card">
              <div className="card-head">
                <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Users size={15} color="var(--blue-500)" />
                  Comités y Grupos de Trabajo
                </h3>
                <span className="badge badge-blue">{committees.length} comité{committees.length !== 1 ? 's' : ''}</span>
              </div>
              <div style={{ padding: 0 }}>
                {committees.map((cm, cmIdx) => {
                  const todayDate = new Date().toISOString().slice(0, 10);
                  const allPositions = cm.positions || [];
                  const activePositions = allPositions.filter(p => {
                    const started = !p.start_date || p.start_date <= todayDate;
                    const notEnded = !p.end_date   || p.end_date   >= todayDate;
                    return started && notEnded && p.holder_name;
                  }).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
                  const vacantPositions = allPositions.filter(p => {
                    const started = !p.start_date || p.start_date <= todayDate;
                    const notEnded = !p.end_date   || p.end_date   >= todayDate;
                    return started && notEnded && !p.holder_name;
                  });
                  const historicPositions = allPositions.filter(p =>
                    p.end_date && p.end_date < todayDate && p.holder_name
                  ).sort((a, b) => b.end_date.localeCompare(a.end_date));
                  const extraMembers = cm.members ? cm.members.split(',').map(m => m.trim()).filter(Boolean) : [];
                  const totalActivos = activePositions.length + extraMembers.length;
                  const fmtPosPeriod = (start, end) => {
                    const f = d => d ? new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { month: 'short', year: 'numeric' }) : null;
                    const s2 = f(start), e2 = f(end);
                    if (s2 && e2) return `${s2} – ${e2}`;
                    if (s2) return `Desde ${s2}`;
                    if (e2) return `Hasta ${e2}`;
                    return null;
                  };
                  return (
                    <div key={cm.id} style={{ borderBottom: cmIdx < committees.length - 1 ? '1px solid var(--sand-100)' : 'none' }}>
                      <div style={{ padding: '14px 20px 10px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
                            <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink-800)' }}>{cm.name}</span>
                            {totalActivos > 0 && <span style={{ fontSize: 11, color: 'var(--teal-600)', fontWeight: 600 }}>· {totalActivos} activo{totalActivos !== 1 ? 's' : ''}</span>}
                            {historicPositions.length > 0 && <span style={{ fontSize: 11, color: 'var(--ink-300)' }}>· {historicPositions.length} histórico{historicPositions.length !== 1 ? 's' : ''}</span>}
                          </div>
                          {cm.description && <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>{cm.description}</div>}
                        </div>
                        {vacantPositions.length > 0 && (
                          <span style={{ fontSize: 10, color: 'var(--amber-600)', background: 'var(--amber-50)', border: '1px solid var(--amber-100)', borderRadius: 20, padding: '2px 8px', flexShrink: 0, marginTop: 2, fontWeight: 600 }}>
                            {vacantPositions.length} vacante{vacantPositions.length !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                      {activePositions.length > 0 && (
                        <div style={{ padding: '0 20px 4px' }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--teal-600)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Vigentes</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                            {activePositions.map(pos => {
                              const posPeriod = fmtPosPeriod(pos.start_date, pos.end_date);
                              return (
                                <div key={pos.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--teal-50)', border: '1px solid var(--teal-100)', borderRadius: 8, padding: '8px 12px' }}>
                                  <div style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0, background: 'var(--blue-100)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <UserCheck size={15} color="var(--blue-600)" />
                                  </div>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-500)' }}>{pos.title}</div>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-800)' }}>{pos.holder_name}</div>
                                    {posPeriod && <div style={{ fontSize: 10, color: 'var(--teal-600)', marginTop: 2, fontWeight: 500 }}>📅 {posPeriod}</div>}
                                  </div>
                                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                                    {pos.email && <a href={`mailto:${pos.email}`} style={{ color: 'var(--blue-500)', display: 'flex', alignItems: 'center' }} title={pos.email}><Mail size={13} /></a>}
                                    {pos.phone && <a href={`tel:${pos.phone}`} style={{ color: 'var(--teal-500)', display: 'flex', alignItems: 'center' }} title={pos.phone}><Phone size={13} /></a>}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      {extraMembers.length > 0 && (
                        <div style={{ padding: '0 20px 10px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {extraMembers.map((m, i) => (
                            <span key={i} style={{ fontSize: 12, padding: '3px 10px', borderRadius: 20, background: 'var(--teal-50)', border: '1px solid var(--teal-100)', color: 'var(--teal-700)', fontWeight: 500 }}>{m}</span>
                          ))}
                        </div>
                      )}
                      {activePositions.length === 0 && extraMembers.length === 0 && (
                        <div style={{ padding: '0 20px 8px', fontSize: 12, color: 'var(--ink-300)', fontStyle: 'italic' }}>Sin integrantes activos en este período</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════ TAB: ECONÓMICOS ══════════════════════════ */}
      {activeTab === 'economico' && (
        <div>
          {/* KPI Grid */}
          <SubLabel>KPI&apos;s Económicos</SubLabel>
          <div className="kpi-grid" style={{ marginBottom: 20 }}>
            <div className="dash-kpi" style={{ '--accent-color': 'var(--blue-400)' }}>
              <div className="dash-kpi-icon" style={{ background: 'var(--blue-50)' }}><DollarSign size={18} color="var(--blue-600)" /></div>
              <div className="dash-kpi-label">Cargos Fijos</div>
              <div className="dash-kpi-value" style={{ fontSize: 17 }}>{fmt(cargosFijos)}</div>
              <div className="dash-kpi-sub">mantenimiento + obligatorios</div>
            </div>
            <div className="dash-kpi" style={{ '--accent-color': effColor }}>
              <div className="dash-kpi-icon" style={{ background: 'var(--teal-50)' }}><Receipt size={18} color="var(--teal-600)" /></div>
              <div className="dash-kpi-label">Cobranza Mensual</div>
              <div className="dash-kpi-value" style={{ fontSize: 17 }}>{fmt(cobranza)}</div>
              <div className="dash-kpi-sub">mantenimiento fijo recibido</div>
              {cargosFijos > 0 && (
                <div className="dash-kpi-badge" style={{
                  background: effColor === 'var(--teal-400)' ? 'var(--teal-50)' : effColor === 'var(--amber-400)' ? 'var(--amber-50)' : 'var(--coral-50)',
                  color: effColor === 'var(--teal-400)' ? 'var(--teal-700)' : effColor === 'var(--amber-400)' ? 'var(--amber-700)' : 'var(--coral-700)',
                }}>{pctCobVsCargos}%</div>
              )}
            </div>
            <div className="dash-kpi" style={{ '--accent-color': 'var(--teal-500)' }}>
              <div className="dash-kpi-icon" style={{ background: 'var(--teal-50)' }}><Wallet size={18} color="var(--teal-600)" /></div>
              <div className="dash-kpi-label">Total Ingresos</div>
              <div className="dash-kpi-value" style={{ fontSize: 17 }}>{fmt(totalIngresos)}</div>
              <div className="dash-kpi-sub">conciliados con banco</div>
            </div>
            <div className="dash-kpi" style={{ '--accent-color': 'var(--coral-400)' }}>
              <div className="dash-kpi-icon" style={{ background: 'var(--coral-50)' }}><ShoppingBag size={18} color="var(--coral-600)" /></div>
              <div className="dash-kpi-label">Egresos Conciliados</div>
              <div className="dash-kpi-value" style={{ fontSize: 17 }}>{fmt(gastos)}</div>
              <div className="dash-kpi-sub">{gastos > 0 ? 'egresos conciliados con banco' : 'sin egresos conciliados'}</div>
              {totalIngresos > 0 && (
                <div className="dash-kpi-badge" style={{
                  background: gvColor === 'var(--teal-400)' ? 'var(--teal-50)' : gvColor === 'var(--amber-400)' ? 'var(--amber-50)' : 'var(--coral-50)',
                  color: gvColor === 'var(--teal-400)' ? 'var(--teal-700)' : gvColor === 'var(--amber-400)' ? 'var(--amber-700)' : 'var(--coral-700)',
                }}>{pctGastosVsIng}%</div>
              )}
            </div>
            <div className="dash-kpi" style={{ '--accent-color': balanceNeto >= 0 ? 'var(--teal-400)' : 'var(--coral-400)' }}>
              <div className="dash-kpi-icon" style={{ background: balanceNeto >= 0 ? 'var(--teal-50)' : 'var(--coral-50)' }}>
                {balanceNeto >= 0 ? <TrendingUp size={18} color="var(--teal-600)" /> : <TrendingDown size={18} color="var(--coral-600)" />}
              </div>
              <div className="dash-kpi-label">Balance Neto</div>
              <div className="dash-kpi-value" style={{ fontSize: 17, color: balanceNeto >= 0 ? 'var(--teal-700)' : 'var(--coral-600)' }}>{fmt(balanceNeto)}</div>
              <div className="dash-kpi-sub">{balanceNeto >= 0 ? 'superávit del período' : 'déficit del período'}</div>
            </div>
            <div className="dash-kpi" style={{ '--accent-color': 'var(--amber-400)' }}>
              <div className="dash-kpi-icon" style={{ background: 'var(--amber-50)' }}><Activity size={18} color="var(--amber-600)" /></div>
              <div className="dash-kpi-label">Conceptos Adicionales</div>
              <div className="dash-kpi-value" style={{ fontSize: 17 }}>{fmt(ingAdicional)}</div>
              <div className="dash-kpi-sub">{ingAdicional > 0 ? `${pctIngAdicional}% del total ingresos` : 'sin conceptos adicionales'}</div>
            </div>
          </div>

          {/* Gauges */}
          <SubLabel>Indicadores de Eficiencia</SubLabel>
          <div className="grid-2" style={{ marginBottom: 20 }}>
            <GaugeCard title="Eficiencia de Cobranza" pct={pctCobVsCargos} color={effColor} icon={Receipt}
              subLeft={{ label: 'Cobrado', value: fmtDec(cobranza) }}
              subRight={{ label: 'Cargos esperados', value: fmtDec(cargosFijos) }} />
            <GaugeCard title="Ratio Egresos vs Ingresos" pct={pctGastosVsIng} color={gvColor} icon={ShoppingBag}
              subLeft={{ label: 'Egresos conciliados', value: fmtDec(gastos) }}
              subRight={{ label: 'Total ingresos', value: fmtDec(totalIngresos) }} />
          </div>

          {/* Composición + Estatus */}
          <SubLabel>Composición y Estatus</SubLabel>
          <div className="grid-2" style={{ marginBottom: 20 }}>
            <div className="card">
              <div className="card-head">
                <h3>Composición de Ingresos</h3>
                <span style={{ fontSize: 11, color: 'var(--ink-400)' }}>conciliados</span>
              </div>
              <div className="card-body">
                {incomeSegments.length === 0 ? (
                  <div style={{ textAlign: 'center', color: 'var(--ink-300)', fontSize: 13, fontStyle: 'italic', padding: '20px 0' }}>
                    Sin ingresos registrados en este período
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
                    <div style={{ flexShrink: 0 }}><SvgDonutMulti segments={incomeSegments} size={140} /></div>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {incomeSegments.map((seg, i) => {
                        const tot2 = incomeSegments.reduce((a, b) => a + b.value, 0);
                        const pct2 = tot2 > 0 ? Math.round((seg.value / tot2) * 100) : 0;
                        return (
                          <div key={i}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                              <span style={{ width: 10, height: 10, borderRadius: '50%', background: seg.color, flexShrink: 0 }} />
                              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-600)', flex: 1 }}>{seg.label}</span>
                              <span style={{ fontSize: 11, color: 'var(--ink-400)', fontWeight: 600 }}>{pct2}%</span>
                            </div>
                            <div style={{ height: 4, background: 'var(--sand-100)', borderRadius: 4, overflow: 'hidden', marginLeft: 18 }}>
                              <div style={{ height: '100%', width: `${pct2}%`, background: seg.color, borderRadius: 4, transition: 'width 0.5s ease' }} />
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--ink-500)', marginLeft: 18, marginTop: 2 }}>{fmtDec(seg.value)}</div>
                          </div>
                        );
                      })}
                      <div style={{ paddingTop: 8, borderTop: '1px solid var(--sand-100)', fontSize: 12, fontWeight: 700, color: 'var(--ink-700)', display: 'flex', justifyContent: 'space-between' }}>
                        <span>Total</span>
                        <span>{fmtDec(incomeSegments.reduce((a, b) => a + b.value, 0))}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="card">
              <div className="card-head">
                <h3>Unidades por Estatus</h3>
                <span style={{ fontSize: 12, color: 'var(--ink-400)' }}>{monthLabel(s.period || period)}</span>
              </div>
              <div className="card-body">
                {statusBars.map(b => {
                  const bpct = Math.round((b.count / totalUnits) * 100);
                  const Ico = b.icon;
                  return (
                    <div key={b.label} style={{ marginBottom: 16 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <div style={{ width: 24, height: 24, borderRadius: 6, background: b.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {Ico && <Ico size={13} color={b.color} />}
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-700)', flex: 1 }}>{b.label}</span>
                        <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink-800)' }}>{b.count}</span>
                        <span style={{ fontSize: 11, color: 'var(--ink-400)', width: 38, textAlign: 'right' }}>({bpct}%)</span>
                      </div>
                      <div style={{ height: 10, background: b.bg, borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${bpct}%`, background: b.color, borderRadius: 'var(--radius-full)', transition: 'width 0.5s ease' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Balance Financiero */}
          <SubLabel>Balance Financiero del Período</SubLabel>
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-body">
              {(() => {
                const maxVal = Math.max(totalIngresos, gastos, 1);
                const ingPct = Math.round((totalIngresos / maxVal) * 100);
                const gasPct = Math.round((gastos / maxVal) * 100);
                return (
                  <div>
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--teal-400)' }} />
                          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-700)' }}>Total Ingresos</span>
                        </div>
                        <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--teal-700)' }}>{fmtDec(totalIngresos)}</span>
                      </div>
                      <div style={{ height: 14, background: 'var(--teal-50)', borderRadius: 8, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${ingPct}%`, background: 'var(--teal-400)', borderRadius: 8, transition: 'width 0.8s ease' }} />
                      </div>
                    </div>
                    <div style={{ marginBottom: 20 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--coral-400)' }} />
                          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-700)' }}>Gastos Conciliados</span>
                        </div>
                        <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--coral-600)' }}>{fmtDec(gastos)}</span>
                      </div>
                      <div style={{ height: 14, background: 'var(--coral-50)', borderRadius: 8, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${gasPct}%`, background: 'var(--coral-400)', borderRadius: 8, transition: 'width 0.8s ease' }} />
                      </div>
                    </div>
                    <div style={{ padding: '16px 20px', borderRadius: 12, background: balanceNeto >= 0 ? 'var(--teal-50)' : 'var(--coral-50)', border: `1px solid ${balanceNeto >= 0 ? 'var(--teal-100)' : 'var(--coral-100)'}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: balanceNeto >= 0 ? 'var(--teal-100)' : 'var(--coral-100)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {balanceNeto >= 0 ? <TrendingUp size={18} color="var(--teal-600)" /> : <TrendingDown size={18} color="var(--coral-600)" />}
                        </div>
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: balanceNeto >= 0 ? 'var(--teal-600)' : 'var(--coral-600)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Balance Neto del Período</div>
                          <div style={{ fontSize: 11, color: balanceNeto >= 0 ? 'var(--teal-600)' : 'var(--coral-600)' }}>
                            {balanceNeto >= 0 ? 'Superávit — ingresos superan egresos' : 'Déficit — egresos superan ingresos'}
                          </div>
                        </div>
                      </div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: balanceNeto >= 0 ? 'var(--teal-700)' : 'var(--coral-700)', fontFamily: 'var(--font-display)' }}>
                        {fmtDec(Math.abs(balanceNeto))}
                      </div>
                    </div>
                    {hasSaldos && (
                      <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--sand-100)', display: 'flex' }}>
                        {[
                          { label: 'Saldo Inicial Banco',        value: saldoInicial,  color: 'var(--ink-700)' },
                          { label: 'Total Ingresos Conciliados', value: totalIngresos, color: 'var(--teal-700)' },
                          { label: 'Total Egresos Conciliados',  value: gastos,        color: 'var(--coral-600)' },
                          { label: 'Saldo Final Banco',          value: saldoFinal,    color: saldoFinal >= 0 ? 'var(--teal-700)' : 'var(--coral-700)' },
                        ].map((item, i, arr) => (
                          <div key={item.label} style={{ flex: 1, textAlign: 'center', padding: '0 12px', borderRight: i < arr.length - 1 ? '1px solid var(--sand-100)' : 'none' }}>
                            <div style={{ fontSize: 10, color: 'var(--ink-400)', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{item.label}</div>
                            <div style={{ fontSize: 13, fontWeight: 800, color: item.color }}>{fmtDec(item.value)}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Recuperación de deuda */}
          {deudaTotal > 0 && (
            <>
              <SubLabel>Recuperación de Deuda</SubLabel>
              <div className="card" style={{ marginBottom: 20 }}>
                <div className="card-body">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      <SvgDonut pct={pctDeudaRecuperada} color="var(--amber-400)" size={100} />
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800, color: 'var(--amber-700)' }}>
                        {pctDeudaRecuperada}%
                      </div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink-800)', marginBottom: 8 }}>Recuperado este período</div>
                      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                        <div>
                          <div style={{ fontSize: 11, color: 'var(--ink-400)', marginBottom: 2 }}>Adeudo recibido</div>
                          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--amber-700)' }}>{fmtDec(adeudoRecibido)}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 11, color: 'var(--ink-400)', marginBottom: 2 }}>Deuda total inicial</div>
                          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink-700)' }}>{fmtDec(deudaTotal)}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
