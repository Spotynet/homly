import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { reportsAPI, tenantsAPI, assemblyAPI } from '../api/client';
import {
  Globe, Building2, DollarSign, Receipt, ShoppingBag,
  ChevronLeft, ChevronRight, RefreshCw, TrendingDown, TrendingUp,
  Users, UserCheck, Mail, Phone, Wallet, Activity,
  CheckCircle, AlertCircle, Clock, BarChart2,
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
function monthLabel(period) {
  if (!period) return '';
  const [y, m] = period.split('-');
  return new Date(+y, +m - 1, 1).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
}
function prevPeriod(period) {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function nextPeriod(period) {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ─── SVG: Donut simple (1 arco) ───────────────────────────────────────────
function SvgDonut({ pct = 0, color = 'var(--teal-400)', size = 110 }) {
  const sw = 10;
  const r = (size - sw) / 2;
  const circ = 2 * Math.PI * r;
  const dash = `${(Math.min(pct, 100) / 100) * circ} ${circ}`;
  const cx = size / 2;
  const cy = size / 2;
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
// Muestra de izquierda (0%) a derecha (100%) pasando por arriba.
function SvgGauge({ pct = 0, color = 'var(--teal-400)', size = 200 }) {
  const safe = Math.min(Math.max(pct, 0), 100);
  const sw = 16;
  const r = (size - sw - 4) / 2;
  const circ = 2 * Math.PI * r;
  const half = circ / 2;
  const fgLen = (safe / 100) * half;

  const cx = size / 2;
  const cy = size / 2;

  // Aguja: 0% → oeste (180°), 100% → este (0°)
  const angleDeg = 180 - (safe / 100) * 180;
  const angleRad = (angleDeg * Math.PI) / 180;
  const nLen = r * 0.66;
  const nx = cx + nLen * Math.cos(angleRad);
  const ny = cy - nLen * Math.sin(angleRad); // SVG y crece hacia abajo

  // Solo mostrar mitad superior: recortar viewBox en cy + margen
  const viewH = cy + sw / 2 + 6;

  // Marcas de escala en 0%, 50%, 100%
  const ticks = [0, 50, 100].map(v => {
    const a = (180 - v * 180 / 100) * Math.PI / 180;
    const outerR = r + sw / 2 + 3;
    const innerR = r - sw / 2 - 2;
    return {
      x1: cx + innerR * Math.cos(a),
      y1: cy - innerR * Math.sin(a),
      x2: cx + outerR * Math.cos(a),
      y2: cy - outerR * Math.sin(a),
      lx: cx + (outerR + 6) * Math.cos(a),
      ly: cy - (outerR + 6) * Math.sin(a),
      label: `${v}%`,
    };
  });

  return (
    <svg width={size} height={viewH} viewBox={`0 0 ${size} ${viewH}`}>
      {/* Pista de fondo */}
      <circle cx={cx} cy={cy} r={r}
        fill="none" stroke="var(--sand-100)" strokeWidth={sw}
        strokeDasharray={`${half} ${circ}`}
        style={{ transform: `rotate(180deg)`, transformOrigin: `${cx}px ${cy}px` }}
      />
      {/* Relleno del gauge */}
      <circle cx={cx} cy={cy} r={r}
        fill="none" stroke={color} strokeWidth={sw}
        strokeDasharray={`${fgLen} ${circ}`}
        strokeLinecap="round"
        style={{
          transform: `rotate(180deg)`,
          transformOrigin: `${cx}px ${cy}px`,
          transition: 'stroke-dasharray 0.7s ease',
          filter: `drop-shadow(0 0 4px ${color}66)`,
        }}
      />
      {/* Marcas de escala */}
      {ticks.map((tk, i) => (
        <line key={i} x1={tk.x1} y1={tk.y1} x2={tk.x2} y2={tk.y2}
          stroke="var(--ink-300)" strokeWidth={1.5} strokeLinecap="round" />
      ))}
      {/* Aguja */}
      <line x1={cx} y1={cy} x2={nx} y2={ny}
        stroke="var(--ink-600)" strokeWidth={3} strokeLinecap="round"
        style={{ transition: 'all 0.7s ease' }}
      />
      {/* Hub de la aguja */}
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

  const cx = size / 2;
  const cy = size / 2;
  const r = (size - 20) / 2;
  const ir = r * 0.60;
  let current = -Math.PI / 2; // empieza arriba

  const arcs = segments.map(seg => {
    const frac = (seg.value || 0) / total;
    const sweep = frac * 2 * Math.PI;
    const start = current;
    const end = start + sweep;
    current = end;

    const x1 = cx + r * Math.cos(start);
    const y1 = cy + r * Math.sin(start);
    const x2 = cx + r * Math.cos(end);
    const y2 = cy + r * Math.sin(end);
    const ix1 = cx + ir * Math.cos(end);
    const iy1 = cy + ir * Math.sin(end);
    const ix2 = cx + ir * Math.cos(start);
    const iy2 = cy + ir * Math.sin(start);
    const lg = sweep > Math.PI ? 1 : 0;

    const path = sweep < 0.001
      ? ''
      : `M ${x1} ${y1} A ${r} ${r} 0 ${lg} 1 ${x2} ${y2} L ${ix1} ${iy1} A ${ir} ${ir} 0 ${lg} 0 ${ix2} ${iy2} Z`;

    return { ...seg, path, frac };
  });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {arcs.map((arc, i) =>
        arc.path ? (
          <path key={i} d={arc.path} fill={arc.color}
            style={{ transition: 'all 0.5s ease' }}>
            <title>{arc.label}: {fmt(arc.value)}</title>
          </path>
        ) : null
      )}
    </svg>
  );
}

// ─── Gauge Card ────────────────────────────────────────────────────────────
function GaugeCard({ title, pct, color, value, max, subLeft, subRight, icon: Icon }) {
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
          {/* Porcentaje centrado debajo del gauge */}
          <div style={{
            position: 'absolute', bottom: -4, left: '50%', transform: 'translateX(-50%)',
            textAlign: 'center',
          }}>
            <div style={{
              fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 800,
              color: color, lineHeight: 1,
            }}>
              {pct}%
            </div>
          </div>
        </div>
        {/* Sub-labels: izquierda y derecha */}
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

// ─── Main ──────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { user, tenantId, tenantName, isSuperAdmin } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('general');
  const [period, setPeriod] = useState(todayStr());
  const [stats, setStats] = useState(null);
  const [tenant, setTenant] = useState(null);
  const [committees, setCommittees] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [generalReport, setGeneralReport] = useState(null);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const [dashRes, tenantRes, cmtRes, genRes] = await Promise.all([
        reportsAPI.dashboard(tenantId, period),
        tenantsAPI.get(tenantId),
        assemblyAPI.committees(tenantId).catch(() => ({ data: [] })),
        // reporteGeneral = fuente de verdad para conciliados (mismos números que EstadoCuenta)
        reportsAPI.reporteGeneral(tenantId, period).catch(() => ({ data: null })),
      ]);
      setStats(dashRes.data);
      setTenant(tenantRes.data);
      const raw = cmtRes.data;
      setCommittees(Array.isArray(raw) ? raw : (raw?.results || []));
      setGeneralReport(genRes.data);
    } catch (e) {
      setError(e.response?.data?.detail || 'Error al cargar el dashboard');
    } finally {
      setLoading(false);
    }
  }, [tenantId, period]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (isSuperAdmin) {
      tenantsAPI.list().then(r => {
        const d = r.data;
        setTenants(Array.isArray(d) ? d : (d?.results || []));
      }).catch(() => {});
    }
  }, [isSuperAdmin]);

  // ── Super admin sin tenant ──────────────────────────────────────────────
  if (isSuperAdmin && !tenantId) {
    return (
      <div className="content-fade">
        <div style={{ marginBottom: 24 }}>
          <p style={{ color: 'var(--ink-400)', fontSize: 15 }}>Selecciona un condominio para continuar.</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px,1fr))', gap: 16 }}>
          {tenants.map(t => (
            <button key={t.id} onClick={() => navigate('/app/tenants')}
              style={{ background: 'var(--white)', border: '1px solid var(--sand-100)', borderRadius: 'var(--radius-lg)', padding: 24, cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s' }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = 'var(--shadow-md)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = ''; e.currentTarget.style.transform = ''; }}
            >
              <div style={{ fontWeight: 700, color: 'var(--ink-800)', marginBottom: 4 }}>{t.name}</div>
              <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>{t.units_count ?? 0} unidades · {fmt(t.maintenance_fee)}/mes</div>
            </button>
          ))}
          <button onClick={() => navigate('/app/tenants')}
            style={{ background: 'var(--teal-50)', border: '2px dashed var(--teal-200)', borderRadius: 'var(--radius-lg)', padding: 24, cursor: 'pointer', color: 'var(--teal-700)', fontWeight: 600, fontSize: 14 }}>
            + Ver todos los condominios
          </button>
        </div>
      </div>
    );
  }

  // ── Loading ────────────────────────────────────────────────────────────
  if (loading && !stats) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '50vh', gap: 16 }}>
        <div style={{ width: 44, height: 44, borderRadius: '50%', border: '3px solid var(--sand-100)', borderTopColor: 'var(--teal-400)', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <p style={{ color: 'var(--ink-400)', fontSize: 14 }}>Cargando dashboard…</p>
      </div>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '50vh', gap: 16 }}>
        <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--coral-50)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <TrendingDown size={22} color="var(--coral-500)" />
        </div>
        <p style={{ fontWeight: 700, color: 'var(--ink-800)' }}>No se pudo cargar</p>
        <p style={{ color: 'var(--ink-400)', fontSize: 13, textAlign: 'center', maxWidth: 300 }}>{error}</p>
        <button className="btn btn-outline btn-sm" onClick={load}><RefreshCw size={14} /> Reintentar</button>
      </div>
    );
  }

  const s = stats || {};
  const t = tenant || {};

  // ── Valores derivados ──────────────────────────────────────────────────
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

  // ── Económicos — reporteGeneral es la fuente de verdad (=EstadoCuenta) ──
  // rd = report_data del reporte general conciliado con banco
  const gr = generalReport;
  const rd = gr?.report_data || {};

  const cargosFijos    = s.total_expected ?? 0;

  // Cobranza de mantenimiento = lo que el reporte general muestra como ingreso_mantenimiento
  const cobranza       = parseFloat(rd.ingreso_mantenimiento ?? s.total_collected ?? 0);
  // Adelantos de mantenimiento (meses futuros pagados)
  const ingAdelanto    = parseFloat(rd.ingreso_maint_adelanto ?? 0);
  // Conceptos adicionales conciliados (campos extra: agua, gas, etc.)
  const ingConceptos   = rd.ingresos_conceptos
    ? Object.values(rd.ingresos_conceptos).reduce((a, c) => a + (parseFloat(c.total) || 0), 0)
    : (s.ingreso_adicional ?? 0);
  // Ingresos no identificados (no asignados a ninguna unidad)
  const ingNoId        = parseFloat(rd.ingresos_no_identificados ?? 0);
  // Total ingresos conciliados con banco = mismo número que Reporte General
  const totalIngresos  = parseFloat(rd.total_ingresos_reconciled ?? (s.total_ingresos ?? s.total_collected ?? 0));
  // Gastos conciliados con banco = mismo número que Reporte General
  const gastos         = parseFloat(rd.total_egresos_reconciled ?? s.total_gastos_conciliados ?? 0);
  // Saldos bancarios (del reporte general)
  const saldoInicial   = parseFloat(gr?.saldo_inicial ?? 0);
  const saldoFinal     = parseFloat(gr?.saldo_final ?? 0);
  const hasSaldos      = saldoInicial !== 0 || saldoFinal !== 0;

  // ingAdicional para mostrar en KPI = conceptos adicionales
  const ingAdicional   = ingConceptos;
  const adeudoRecibido = s.total_adeudo_recibido ?? 0;
  const deudaTotal     = s.deuda_total ?? 0;
  const balanceNeto    = totalIngresos - gastos;

  const pctCobVsCargos     = cargosFijos > 0 ? Math.round((cobranza / cargosFijos) * 100) : 0;
  const pctGastosVsIng     = totalIngresos > 0 ? Math.round((gastos / totalIngresos) * 100) : 0;
  const pctIngAdicional    = totalIngresos > 0 ? Math.round((ingAdicional / totalIngresos) * 100) : 0;
  const pctDeudaRecuperada = deudaTotal > 0 ? Math.round((adeudoRecibido / deudaTotal) * 100) : 0;

  // Colores dinámicos
  const effColor = pctCobVsCargos >= 90 ? 'var(--teal-400)'
    : pctCobVsCargos >= 70 ? 'var(--amber-400)'
    : 'var(--coral-400)';

  const gvColor = pctGastosVsIng <= 60 ? 'var(--teal-400)'
    : pctGastosVsIng <= 89 ? 'var(--amber-400)'
    : 'var(--coral-400)';

  // Tenant info
  const razonSocial  = t.razon_social || t.name || '';
  const rfc          = t.rfc || '';
  const address      = [t.info_calle, t.info_num_externo, t.info_colonia, t.info_ciudad].filter(Boolean).join(', ') || '';
  const adminTypeBadge = t.admin_type === 'administrador' ? 'badge-amber' : 'badge-teal';
  const adminTypeLabel = t.admin_type === 'administrador' ? 'Administración Externa' : 'Mesa Directiva';
  const commonAreas    = typeof t.common_areas === 'string'
    ? t.common_areas.split(',').map(a => a.trim()).filter(Boolean)
    : (Array.isArray(t.common_areas) ? t.common_areas : []);

  // Barras de estatus
  const totalUnits = registered || 1;
  const statusBars = [
    { label: 'Pagado',    count: paidCnt,    color: 'var(--teal-400)',   bg: 'var(--teal-50)',   icon: CheckCircle },
    { label: 'Parcial',   count: partialCnt, color: 'var(--amber-400)',  bg: 'var(--amber-50)',  icon: Activity },
    { label: 'Pendiente', count: pendingCnt, color: 'var(--coral-400)',  bg: 'var(--coral-50)',  icon: AlertCircle },
    ...(exemptCnt > 0 ? [{ label: 'Exento', count: exemptCnt, color: 'var(--blue-400)', bg: 'var(--blue-50)', icon: Clock }] : []),
  ];

  // Segmentos del donut de ingresos (desglose del Reporte General)
  const incomeSegments = [
    { label: 'Mantenimiento',       value: cobranza,     color: 'var(--teal-500)' },
    ...(ingAdelanto > 0   ? [{ label: 'Adelantos mant.',   value: ingAdelanto,  color: 'var(--teal-200)' }]  : []),
    ...(ingConceptos > 0  ? [{ label: 'Conceptos adicionales', value: ingConceptos, color: 'var(--blue-400)' }] : []),
    ...(ingNoId > 0       ? [{ label: 'No identificados',  value: ingNoId,      color: 'var(--amber-400)' }] : []),
  ].filter(seg => seg.value > 0);

  // ── Componentes de sección ─────────────────────────────────────────────
  const SectionLabel = ({ children }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
      <span style={{ width: 3, height: 16, borderRadius: 2, background: 'var(--teal-500)', flexShrink: 0 }} />
      <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--teal-700)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {children}
      </span>
    </div>
  );

  return (
    <div className="content-fade">
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .dash-kpi { background: var(--white); border: 1px solid var(--sand-100); border-radius: var(--radius-lg); padding: 20px; display: flex; flex-direction: column; gap: 4; position: relative; overflow: hidden; }
        .dash-kpi::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; background: var(--accent-color, var(--teal-400)); border-radius: var(--radius-lg) var(--radius-lg) 0 0; }
        .dash-kpi-icon { width: 36px; height: 36px; border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-bottom: 8; }
        .dash-kpi-label { font-size: 11px; font-weight: 600; color: var(--ink-400); text-transform: uppercase; letter-spacing: 0.05em; }
        .dash-kpi-value { font-size: 22px; font-weight: 800; color: var(--ink-800); font-family: var(--font-display); line-height: 1.1; }
        .dash-kpi-sub { font-size: 11px; color: var(--ink-400); margin-top: 2px; }
        .dash-kpi-badge { position: absolute; top: 12px; right: 12px; font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 20px; }
        .kpi-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; }
      `}</style>

      {/* ── Tabs ─────────────────────────────────────────────────────────── */}
      <div className="tabs" style={{ marginBottom: 20 }}>
        <button className={`tab ${activeTab === 'general'  ? 'active' : ''}`} onClick={() => setActiveTab('general')}>
          General
        </button>
        <button className={`tab ${activeTab === 'economic' ? 'active' : ''}`} onClick={() => setActiveTab('economic')}>
          Económicos
        </button>
      </div>

      {/* ════════════════════════════════════════ GENERAL ════════════════ */}
      {activeTab === 'general' && (
        <div>
          {/* Hero KPI strip */}
          <div className="kpi-grid" style={{ marginBottom: 20 }}>
            {isSuperAdmin && (
              <div className="dash-kpi" style={{ '--accent-color': 'var(--blue-400)' }}>
                <div className="dash-kpi-icon" style={{ background: 'var(--blue-50)' }}>
                  <Globe size={18} color="var(--blue-600)" />
                </div>
                <div className="dash-kpi-label">Condominios</div>
                <div className="dash-kpi-value">{tenants.length}</div>
                <div className="dash-kpi-sub">tenants activos</div>
              </div>
            )}
            {/* Unidades */}
            <div className="dash-kpi" style={{ '--accent-color': 'var(--teal-400)' }}>
              <div className="dash-kpi-icon" style={{ background: 'var(--teal-50)' }}>
                <Building2 size={18} color="var(--teal-600)" />
              </div>
              <div className="dash-kpi-label">Unidades</div>
              <div className="dash-kpi-value">
                {registered}
                <span style={{ fontSize: 14, fontWeight: 400, color: 'var(--ink-400)' }}> / {planned}</span>
              </div>
              <div style={{ marginTop: 8, height: 4, background: 'var(--sand-100)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${unitPct}%`, background: 'var(--teal-400)', borderRadius: 4, transition: 'width 0.6s ease' }} />
              </div>
              <div className="dash-kpi-sub" style={{ marginTop: 4 }}>{unitPct}% registradas</div>
            </div>
            {/* Cuota mensual */}
            <div className="dash-kpi" style={{ '--accent-color': 'var(--amber-400)' }}>
              <div className="dash-kpi-icon" style={{ background: 'var(--amber-50)' }}>
                <DollarSign size={18} color="var(--amber-600)" />
              </div>
              <div className="dash-kpi-label">Cuota Mensual</div>
              <div className="dash-kpi-value" style={{ fontSize: 18 }}>
                {new Intl.NumberFormat('es-MX').format(s.maintenance_fee ?? 0)}
              </div>
              <div className="dash-kpi-sub">{t.currency || 'MXN'} / unidad / mes</div>
            </div>
            {/* Cobrado */}
            <div className="dash-kpi" style={{ '--accent-color': 'var(--coral-400)' }}>
              <div className="dash-kpi-icon" style={{ background: 'var(--coral-50)' }}>
                <Receipt size={18} color="var(--coral-600)" />
              </div>
              <div className="dash-kpi-label">Cobrado — {monthLabel(s.period || period)}</div>
              <div className="dash-kpi-value">
                {paidCnt}
                <span style={{ fontSize: 14, fontWeight: 400, color: 'var(--ink-400)' }}>/{registered - exemptCnt}</span>
              </div>
              <div className="dash-kpi-sub">
                {new Intl.NumberFormat('es-MX').format(totalColl)} recaudado
                {exemptCnt > 0 && <span style={{ color: 'var(--blue-500)', marginLeft: 4 }}>· {exemptCnt} exentas</span>}
              </div>
            </div>
          </div>

          {/* Grid: Info + Áreas */}
          <div className="grid-2" style={{ marginBottom: 20 }}>
            {/* Condominio info */}
            <div className="card">
              <div className="card-head">
                <h3>Información del Condominio</h3>
                <span className={`badge ${adminTypeBadge}`}>{adminTypeLabel}</span>
              </div>
              <div className="card-body">
                <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                  {t.logo ? (
                    <img src={t.logo} alt="Logo"
                      style={{ width: 60, height: 60, borderRadius: 12, objectFit: 'cover', flexShrink: 0, border: '1px solid var(--sand-100)' }} />
                  ) : (
                    <div style={{ width: 60, height: 60, borderRadius: 12, background: 'var(--teal-50)', border: '1px solid var(--teal-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Building2 size={26} color="var(--teal-400)" />
                    </div>
                  )}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--ink-800)', marginBottom: 4 }}>{razonSocial}</div>
                    {rfc && <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>RFC: {rfc}</div>}
                    {address && <div style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: 4, lineHeight: 1.4 }}>{address}</div>}
                    {t.country && (
                      <div style={{ fontSize: 11, color: 'var(--ink-300)', marginTop: 6 }}>
                        {t.country}{t.state ? ' · ' + t.state : ''} · {t.currency || 'MXN'}
                      </div>
                    )}
                  </div>
                </div>

                {/* Ocupación */}
                <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--sand-100)', display: 'flex', alignItems: 'center', gap: 20 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-400)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>Ocupación</div>
                    {[
                      { label: 'Propietarios', count: ownerCnt, pct: registered > 0 ? Math.round((ownerCnt / registered) * 100) : 0, color: 'var(--teal-400)', bg: 'var(--teal-50)' },
                      { label: 'Rentados', count: rentedCnt, pct: registered > 0 ? Math.round((rentedCnt / registered) * 100) : 0, color: 'var(--amber-400)', bg: 'var(--amber-50)' },
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
                  {/* Mini donut */}
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

            {/* Áreas Comunes */}
            <div className="card">
              <div className="card-head">
                <h3>Áreas Comunes</h3>
                {commonAreas.length > 0 && (
                  <span className="badge badge-teal">{commonAreas.length} área{commonAreas.length !== 1 ? 's' : ''}</span>
                )}
              </div>
              <div className="card-body">
                {commonAreas.length === 0 ? (
                  <div style={{ fontSize: 13, color: 'var(--ink-300)', fontStyle: 'italic' }}>Sin áreas comunes registradas</div>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {commonAreas.map(a => (
                      <span key={a} className="badge badge-teal"
                        style={{ padding: '5px 12px', fontSize: 12, borderRadius: 20 }}>
                        {a}
                      </span>
                    ))}
                  </div>
                )}

                {/* Status rápido de cobranza mensual */}
                <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--sand-100)' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-400)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>
                    Estatus cobranza — {monthLabel(s.period || period)}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {[
                      { label: 'Pagadas', count: paidCnt, color: 'var(--teal-600)', bg: 'var(--teal-50)', border: 'var(--teal-100)' },
                      { label: 'Parcial', count: partialCnt, color: 'var(--amber-700)', bg: 'var(--amber-50)', border: 'var(--amber-100)' },
                      { label: 'Pendiente', count: pendingCnt, color: 'var(--coral-600)', bg: 'var(--coral-50)', border: 'var(--coral-100)' },
                      ...(exemptCnt > 0 ? [{ label: 'Exenta', count: exemptCnt, color: 'var(--blue-600)', bg: 'var(--blue-50)', border: 'var(--blue-100)' }] : []),
                    ].map(b => (
                      <div key={b.label} style={{
                        padding: '6px 12px', borderRadius: 10, background: b.bg,
                        border: `1px solid ${b.border}`, textAlign: 'center',
                      }}>
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
                  const activePositions = (cm.positions || []).filter(p => p.active).sort((a, b) => a.sort_order - b.sort_order);
                  const inactivePositions = (cm.positions || []).filter(p => !p.active);
                  const extraMembers = cm.members
                    ? cm.members.split(',').map(m => m.trim()).filter(Boolean) : [];
                  const totalIntegrantes = activePositions.length + extraMembers.length;

                  return (
                    <div key={cm.id} style={{ borderBottom: cmIdx < committees.length - 1 ? '1px solid var(--sand-100)' : 'none' }}>
                      <div style={{ padding: '14px 20px 10px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                            <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink-800)' }}>{cm.name}</span>
                            {cm.exemption && <span className="badge badge-teal" style={{ fontSize: 10 }}>Exento</span>}
                            {totalIntegrantes > 0 && (
                              <span style={{ fontSize: 11, color: 'var(--ink-400)', marginLeft: 2 }}>
                                · {totalIntegrantes} integrante{totalIntegrantes !== 1 ? 's' : ''}
                              </span>
                            )}
                          </div>
                          {cm.description && <div style={{ fontSize: 12, color: 'var(--ink-400)', marginBottom: 2 }}>{cm.description}</div>}
                        </div>
                        {inactivePositions.length > 0 && (
                          <span style={{ fontSize: 10, color: 'var(--ink-300)', flexShrink: 0, marginTop: 2 }}>
                            {inactivePositions.length} vacante{inactivePositions.length !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>

                      {activePositions.length > 0 && (
                        <div style={{ padding: '0 20px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {activePositions.map(pos => (
                            <div key={pos.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--sand-50)', borderRadius: 8, padding: '8px 12px' }}>
                              <div style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0, background: pos.holder_name ? 'var(--blue-100)' : 'var(--sand-100)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <UserCheck size={15} style={{ color: pos.holder_name ? 'var(--blue-600)' : 'var(--ink-300)' }} />
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-600)' }}>{pos.title}</div>
                                <div style={{ fontSize: 13, fontWeight: 700, color: pos.holder_name ? 'var(--ink-800)' : 'var(--ink-300)', fontStyle: pos.holder_name ? 'normal' : 'italic' }}>
                                  {pos.holder_name || 'Vacante'}
                                </div>
                              </div>
                              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                                {pos.email && <a href={`mailto:${pos.email}`} style={{ color: 'var(--blue-500)', display: 'flex', alignItems: 'center' }} title={pos.email}><Mail size={13} /></a>}
                                {pos.phone && <a href={`tel:${pos.phone}`} style={{ color: 'var(--teal-500)', display: 'flex', alignItems: 'center' }} title={pos.phone}><Phone size={13} /></a>}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {extraMembers.length > 0 && (
                        <div style={{ padding: '0 20px 12px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {extraMembers.map((m, i) => (
                            <span key={i} style={{ fontSize: 12, padding: '3px 10px', borderRadius: 20, background: 'var(--sand-100)', color: 'var(--ink-600)', fontWeight: 500 }}>{m}</span>
                          ))}
                        </div>
                      )}

                      {activePositions.length === 0 && extraMembers.length === 0 && (
                        <div style={{ padding: '0 20px 12px', fontSize: 12, color: 'var(--ink-300)', fontStyle: 'italic' }}>Sin integrantes registrados</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Super admin: todos los tenants */}
          {isSuperAdmin && tenants.length > 0 && (
            <div className="card" style={{ marginTop: 20 }}>
              <div className="card-head"><h3>Todos los Tenants</h3></div>
              <div style={{ padding: 0 }}>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Condominio</th>
                        <th>Unidades</th>
                        <th>Mantenimiento</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tenants.map(tt => (
                        <tr key={tt.id} style={{ cursor: 'pointer' }} onClick={() => navigate('/app/tenants')}>
                          <td style={{ fontWeight: 600 }}>{tt.name}</td>
                          <td><span className="badge badge-teal">{tt.units_actual ?? tt.units_count ?? 0}/{tt.units_count ?? 0}</span></td>
                          <td>{new Intl.NumberFormat('es-MX').format(tt.maintenance_fee ?? 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════ ECONÓMICOS ═════════════ */}
      {activeTab === 'economic' && (
        <div>
          {/* Navegador de período */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-body" style={{ padding: '12px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <BarChart2 size={16} color="var(--teal-500)" />
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-600)' }}>Período:</span>
                <div className="period-nav" style={{ gap: 4 }}>
                  <button className="period-nav-btn" onClick={() => setPeriod(prevPeriod(period))}>
                    <ChevronLeft size={16} />
                  </button>
                  <input type="month" className="period-month-select"
                    style={{ fontSize: 15, fontWeight: 700 }}
                    value={period} onChange={e => setPeriod(e.target.value)} />
                  <button className="period-nav-btn" onClick={() => setPeriod(nextPeriod(period))}>
                    <ChevronRight size={16} />
                  </button>
                </div>
                {loading && (
                  <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid var(--sand-100)', borderTopColor: 'var(--teal-400)', animation: 'spin 0.8s linear infinite' }} />
                )}
                <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--ink-400)' }}>
                  {monthLabel(s.period || period)}
                </div>
              </div>
            </div>
          </div>

          {/* KPI Grid — 6 tarjetas */}
          <SectionLabel>KPI's Económicos</SectionLabel>
          <div className="kpi-grid" style={{ marginBottom: 20 }}>
            <div className="dash-kpi" style={{ '--accent-color': 'var(--blue-400)' }}>
              <div className="dash-kpi-icon" style={{ background: 'var(--blue-50)' }}>
                <DollarSign size={18} color="var(--blue-600)" />
              </div>
              <div className="dash-kpi-label">Cargos Fijos</div>
              <div className="dash-kpi-value" style={{ fontSize: 17 }}>{fmt(cargosFijos)}</div>
              <div className="dash-kpi-sub">mantenimiento + obligatorios</div>
            </div>

            <div className="dash-kpi" style={{ '--accent-color': effColor }}>
              <div className="dash-kpi-icon" style={{ background: 'var(--teal-50)' }}>
                <Receipt size={18} color="var(--teal-600)" />
              </div>
              <div className="dash-kpi-label">Cobranza Mensual</div>
              <div className="dash-kpi-value" style={{ fontSize: 17 }}>{fmt(cobranza)}</div>
              <div className="dash-kpi-sub">mantenimiento fijo recibido</div>
              {cargosFijos > 0 && (
                <div className="dash-kpi-badge" style={{
                  background: effColor === 'var(--teal-400)' ? 'var(--teal-50)' : effColor === 'var(--amber-400)' ? 'var(--amber-50)' : 'var(--coral-50)',
                  color: effColor === 'var(--teal-400)' ? 'var(--teal-700)' : effColor === 'var(--amber-400)' ? 'var(--amber-700)' : 'var(--coral-700)',
                }}>
                  {pctCobVsCargos}%
                </div>
              )}
            </div>

            <div className="dash-kpi" style={{ '--accent-color': 'var(--teal-500)' }}>
              <div className="dash-kpi-icon" style={{ background: 'var(--teal-50)' }}>
                <Wallet size={18} color="var(--teal-600)" />
              </div>
              <div className="dash-kpi-label">Total Ingresos</div>
              <div className="dash-kpi-value" style={{ fontSize: 17 }}>{fmt(totalIngresos)}</div>
              <div className="dash-kpi-sub">conciliados con banco</div>
            </div>

            <div className="dash-kpi" style={{ '--accent-color': 'var(--coral-400)' }}>
              <div className="dash-kpi-icon" style={{ background: 'var(--coral-50)' }}>
                <ShoppingBag size={18} color="var(--coral-600)" />
              </div>
              <div className="dash-kpi-label">Egresos Conciliados</div>
              <div className="dash-kpi-value" style={{ fontSize: 17 }}>{fmt(gastos)}</div>
              <div className="dash-kpi-sub">{gastos > 0 ? 'egresos conciliados con banco' : 'sin egresos conciliados'}</div>
              {totalIngresos > 0 && (
                <div className="dash-kpi-badge" style={{
                  background: gvColor === 'var(--teal-400)' ? 'var(--teal-50)' : gvColor === 'var(--amber-400)' ? 'var(--amber-50)' : 'var(--coral-50)',
                  color: gvColor === 'var(--teal-400)' ? 'var(--teal-700)' : gvColor === 'var(--amber-400)' ? 'var(--amber-700)' : 'var(--coral-700)',
                }}>
                  {pctGastosVsIng}%
                </div>
              )}
            </div>

            <div className="dash-kpi" style={{ '--accent-color': balanceNeto >= 0 ? 'var(--teal-400)' : 'var(--coral-400)' }}>
              <div className="dash-kpi-icon" style={{ background: balanceNeto >= 0 ? 'var(--teal-50)' : 'var(--coral-50)' }}>
                {balanceNeto >= 0
                  ? <TrendingUp size={18} color="var(--teal-600)" />
                  : <TrendingDown size={18} color="var(--coral-600)" />
                }
              </div>
              <div className="dash-kpi-label">Balance Neto</div>
              <div className="dash-kpi-value" style={{ fontSize: 17, color: balanceNeto >= 0 ? 'var(--teal-700)' : 'var(--coral-600)' }}>
                {fmt(balanceNeto)}
              </div>
              <div className="dash-kpi-sub">{balanceNeto >= 0 ? 'superávit del período' : 'déficit del período'}</div>
            </div>

            <div className="dash-kpi" style={{ '--accent-color': 'var(--amber-400)' }}>
              <div className="dash-kpi-icon" style={{ background: 'var(--amber-50)' }}>
                <Activity size={18} color="var(--amber-600)" />
              </div>
              <div className="dash-kpi-label">Conceptos Adicionales</div>
              <div className="dash-kpi-value" style={{ fontSize: 17 }}>{fmt(ingAdicional)}</div>
              <div className="dash-kpi-sub">
                {ingAdicional > 0 ? `${pctIngAdicional}% del total ingresos` : 'sin conceptos adicionales'}
              </div>
            </div>
          </div>

          {/* Gauges: Eficiencia de Cobranza + Ratio de Gastos */}
          <SectionLabel>Indicadores de Eficiencia</SectionLabel>
          <div className="grid-2" style={{ marginBottom: 20 }}>
            <GaugeCard
              title="Eficiencia de Cobranza"
              pct={pctCobVsCargos}
              color={effColor}
              icon={Receipt}
              subLeft={{ label: 'Cobrado', value: fmtDec(cobranza) }}
              subRight={{ label: 'Cargos esperados', value: fmtDec(cargosFijos) }}
            />
            <GaugeCard
              title="Ratio Egresos vs Ingresos"
              pct={pctGastosVsIng}
              color={gvColor}
              icon={ShoppingBag}
              subLeft={{ label: 'Egresos conciliados', value: fmtDec(gastos) }}
              subRight={{ label: 'Total ingresos', value: fmtDec(totalIngresos) }}
            />
          </div>

          {/* Composición de ingresos + Estatus de unidades */}
          <SectionLabel>Composición y Estatus</SectionLabel>
          <div className="grid-2" style={{ marginBottom: 20 }}>
            {/* Donut multi: composición de ingresos */}
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
                    <div style={{ flexShrink: 0 }}>
                      <SvgDonutMulti segments={incomeSegments} size={140} />
                    </div>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {incomeSegments.map((seg, i) => {
                        const total2 = incomeSegments.reduce((a, b) => a + b.value, 0);
                        const pct2 = total2 > 0 ? Math.round((seg.value / total2) * 100) : 0;
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

            {/* Barras: estatus de unidades */}
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
                        <div style={{
                          height: '100%', width: `${bpct}%`, background: b.color,
                          borderRadius: 'var(--radius-full)', transition: 'width 0.5s ease',
                        }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Balance financiero */}
          <SectionLabel>Balance Financiero del Período</SectionLabel>
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-body">
              {(() => {
                const maxVal = Math.max(totalIngresos, gastos, 1);
                const ingPct = Math.round((totalIngresos / maxVal) * 100);
                const gasPct = Math.round((gastos / maxVal) * 100);
                return (
                  <div>
                    {/* Ingresos */}
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
                    {/* Gastos */}
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
                    {/* Balance neto */}
                    <div style={{
                      padding: '16px 20px', borderRadius: 12,
                      background: balanceNeto >= 0 ? 'var(--teal-50)' : 'var(--coral-50)',
                      border: `1px solid ${balanceNeto >= 0 ? 'var(--teal-100)' : 'var(--coral-100)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: balanceNeto >= 0 ? 'var(--teal-100)' : 'var(--coral-100)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {balanceNeto >= 0
                            ? <TrendingUp size={18} color="var(--teal-600)" />
                            : <TrendingDown size={18} color="var(--coral-600)" />
                          }
                        </div>
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: balanceNeto >= 0 ? 'var(--teal-600)' : 'var(--coral-600)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            Balance Neto del Período
                          </div>
                          <div style={{ fontSize: 11, color: balanceNeto >= 0 ? 'var(--teal-600)' : 'var(--coral-600)' }}>
                            {balanceNeto >= 0 ? 'Superávit — ingresos superan egresos' : 'Déficit — egresos superan ingresos'}
                          </div>
                        </div>
                      </div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: balanceNeto >= 0 ? 'var(--teal-700)' : 'var(--coral-700)', fontFamily: 'var(--font-display)' }}>
                        {fmtDec(Math.abs(balanceNeto))}
                      </div>
                    </div>

                    {/* Saldos bancarios (solo si existen en el reporte general) */}
                    {hasSaldos && (
                      <div style={{
                        marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--sand-100)',
                        display: 'flex', gap: 0,
                      }}>
                        {[
                          { label: 'Saldo Inicial Banco', value: saldoInicial, color: 'var(--ink-700)' },
                          { label: 'Total Ingresos Conciliados', value: totalIngresos, color: 'var(--teal-700)' },
                          { label: 'Total Egresos Conciliados', value: gastos, color: 'var(--coral-600)' },
                          { label: 'Saldo Final Banco', value: saldoFinal, color: saldoFinal >= 0 ? 'var(--teal-700)' : 'var(--coral-700)' },
                        ].map((item, i, arr) => (
                          <div key={item.label} style={{
                            flex: 1, textAlign: 'center', padding: '0 12px',
                            borderRight: i < arr.length - 1 ? '1px solid var(--sand-100)' : 'none',
                          }}>
                            <div style={{ fontSize: 10, color: 'var(--ink-400)', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                              {item.label}
                            </div>
                            <div style={{ fontSize: 13, fontWeight: 800, color: item.color }}>
                              {fmtDec(item.value)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Recuperación de deuda (solo si hay deuda) */}
          {deudaTotal > 0 && (
            <>
              <SectionLabel>Recuperación de Deuda</SectionLabel>
              <div className="card">
                <div className="card-body">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
                    {/* Mini donut */}
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      <SvgDonut pct={pctDeudaRecuperada} color="var(--amber-400)" size={100} />
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800, color: 'var(--amber-700)' }}>
                        {pctDeudaRecuperada}%
                      </div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink-800)', marginBottom: 8 }}>
                        Recuperado este período
                      </div>
                      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                        <div>
                          <div style={{ fontSize: 11, color: 'var(--ink-400)', marginBottom: 2 }}>Adeudo recibido</div>
                          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--amber-700)' }}>{fmtDec(adeudoRecibido)}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 11, color: 'var(--ink-400)', marginBottom: 2 }}>Deuda total inicial</div>
                          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink-700)' }}>{fmtDec(deudaTotal)}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 11, color: 'var(--ink-400)', marginBottom: 2 }}>Pendiente por recuperar</div>
                          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--coral-600)' }}>{fmtDec(Math.max(0, deudaTotal - adeudoRecibido))}</div>
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
