import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { reportsAPI, tenantsAPI, assemblyAPI, reservationsAPI, periodsAPI } from '../api/client';
import {
  Globe, Building2, DollarSign, Receipt, ShoppingBag,
  ChevronLeft, ChevronRight, RefreshCw, TrendingDown, TrendingUp,
  Users, UserCheck, Mail, Phone, Wallet, Activity,
  CheckCircle, AlertCircle, Clock, BarChart2, Calendar, X, Check, Lock, LockOpen,
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
  const sw = 18;           // stroke width del anillo
  const gap = 0.03;        // pequeña separación en radianes entre segmentos
  const total = segments.reduce((a, b) => a + (b.value || 0), 0);
  const cx = size / 2;
  const cy = size / 2;
  const r  = (size - sw - 4) / 2;

  if (total === 0) {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--sand-100)" strokeWidth={sw} />
      </svg>
    );
  }

  // Caso especial: un solo segmento → círculo completo (arc de punto a punto no renderiza)
  if (segments.filter(s => (s.value || 0) > 0).length === 1) {
    const seg = segments.find(s => (s.value || 0) > 0);
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--sand-50)" strokeWidth={sw} />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={seg.color} strokeWidth={sw}
          style={{ transition: 'all 0.5s ease' }}>
          <title>{seg.label}: {fmt(seg.value)}</title>
        </circle>
      </svg>
    );
  }

  // Múltiples segmentos → arcos individuales con pequeña separación visual
  const circ = 2 * Math.PI * r;
  let angle = -Math.PI / 2; // empieza arriba

  const arcs = segments
    .filter(seg => (seg.value || 0) > 0)
    .map(seg => {
      const frac   = seg.value / total;
      const sweep  = frac * 2 * Math.PI - gap;
      const start  = angle + gap / 2;
      const end    = start + sweep;
      angle += frac * 2 * Math.PI;

      // Longitud de arco proporcional al segmento, recortando el gap en strokeDasharray
      const arcLen = (sweep / (2 * Math.PI)) * circ;

      // Ángulo de inicio para la transformación rotate del elemento
      const startDeg = (start * 180) / Math.PI + 90; // +90 porque SVG 0° es derecha

      return { ...seg, arcLen, circ, startDeg };
    });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Anillo de fondo */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--sand-100)" strokeWidth={sw} />
      {arcs.map((arc, i) => (
        <circle
          key={i}
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke={arc.color}
          strokeWidth={sw}
          strokeLinecap="butt"
          strokeDasharray={`${arc.arcLen} ${arc.circ}`}
          style={{
            transform: `rotate(${arc.startDeg}deg)`,
            transformOrigin: `${cx}px ${cy}px`,
            transition: 'stroke-dasharray 0.5s ease',
          }}
        >
          <title>{arc.label}: {fmt(arc.value)}</title>
        </circle>
      ))}
    </svg>
  );
}

// ─── Gauge Card ────────────────────────────────────────────────────────────
// breakdown: [{ label, value, color, note? }]  — barras debajo del gauge
function GaugeCard({ title, pct, color, subLeft, subRight, icon: Icon, breakdown }) {
  const maxBreak = breakdown?.length
    ? Math.max(...breakdown.map(b => b.value), 1)
    : 1;
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="card-head">
        <h3 style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {Icon && <Icon size={15} color="var(--ink-400)" />}
          {title}
        </h3>
      </div>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>

        {/* ── Gauge semicircular ── */}
        <div style={{ position: 'relative', width: '100%', display: 'flex', justifyContent: 'center' }}>
          <SvgGauge pct={pct} color={color} size={200} />
          <div style={{
            position: 'absolute', bottom: -4, left: '50%', transform: 'translateX(-50%)',
            textAlign: 'center',
          }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 800, color, lineHeight: 1 }}>
              {pct}%
            </div>
          </div>
        </div>

        {/* ── Totales izq / der ── */}
        {(subLeft || subRight) && (
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', marginTop: 18, paddingTop: 12, borderTop: '1px solid var(--sand-100)' }}>
            {subLeft && (
              <div style={{ textAlign: 'center', flex: 1 }}>
                <div style={{ fontSize: 10, color: 'var(--ink-400)', marginBottom: 2 }}>{subLeft.label}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-700)' }}>{subLeft.value}</div>
              </div>
            )}
            {subLeft && subRight && <div style={{ width: 1, background: 'var(--sand-100)' }} />}
            {subRight && (
              <div style={{ textAlign: 'center', flex: 1 }}>
                <div style={{ fontSize: 10, color: 'var(--ink-400)', marginBottom: 2 }}>{subRight.label}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-700)' }}>{subRight.value}</div>
              </div>
            )}
          </div>
        )}

        {/* ── Breakdown: barras conciliado / no conciliado ── */}
        {breakdown && breakdown.length > 0 && (
          <div style={{ width: '100%', marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--sand-100)', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {breakdown.map((b, i) => {
              const bPct = maxBreak > 0 ? Math.round((b.value / maxBreak) * 100) : 0;
              return (
                <div key={i}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 3, background: b.color, flexShrink: 0, display: 'inline-block' }} />
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-600)' }}>{b.label}</span>
                      {b.note && <span style={{ fontSize: 10, color: 'var(--ink-400)' }}>{b.note}</span>}
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 800, color: b.color }}>{b.fmtVal}</span>
                  </div>
                  <div style={{ height: 8, background: 'var(--sand-100)', borderRadius: 6, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${bPct}%`, background: b.color, borderRadius: 6, transition: 'width 0.6s ease' }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { user, tenantId, tenantName, isSuperAdmin, isAdmin, role } = useAuth();
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
  const [closedPeriods, setClosedPeriods] = useState([]);

  // ── Reservas tab state ──────────────────────────────────
  const today = new Date();
  const [calYear,  setCalYear]  = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth()); // 0-indexed
  const [selectedDay,      setSelectedDay]      = useState(null); // 'YYYY-MM-DD' | null
  const [reservations,     setReservations]     = useState([]);
  const [resLoading,       setResLoading]       = useState(false);
  const [resStatusFilter,  setResStatusFilter]  = useState('all');
  const [rejectModalOpen,  setRejectModalOpen]  = useState(false);
  const [rejectReason,     setRejectReason]     = useState('');
  const [rejectTargetId,   setRejectTargetId]   = useState(null);

  const loadReservations = useCallback(async () => {
    if (!tenantId) return;
    setResLoading(true);
    try {
      const firstDay = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-01`;
      const lastDay  = new Date(calYear, calMonth + 1, 0);
      const lastStr  = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`;
      const res = await reservationsAPI.list(tenantId, { date_from: firstDay, date_to: lastStr });
      const data = res.data;
      setReservations(Array.isArray(data) ? data : (data?.results || []));
    } catch { setReservations([]); }
    finally { setResLoading(false); }
  }, [tenantId, calYear, calMonth]);


  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const [dashRes, tenantRes, cmtRes, genRes, closedRes] = await Promise.all([
        reportsAPI.dashboard(tenantId, period),
        tenantsAPI.get(tenantId),
        assemblyAPI.committees(tenantId).catch(() => ({ data: [] })),
        // reporteGeneral = fuente de verdad para conciliados (mismos números que EstadoCuenta)
        reportsAPI.reporteGeneral(tenantId, period).catch(() => ({ data: null })),
        periodsAPI.closedList(tenantId).catch(() => ({ data: [] })),
      ]);
      setStats(dashRes.data);
      setTenant(tenantRes.data);
      const raw = cmtRes.data;
      setCommittees(Array.isArray(raw) ? raw : (raw?.results || []));
      setGeneralReport(genRes.data);
      const closedRaw = closedRes.data;
      setClosedPeriods(Array.isArray(closedRaw) ? closedRaw : (closedRaw?.results || []));
    } catch (e) {
      setError(e.response?.data?.detail || 'Error al cargar el dashboard');
    } finally {
      setLoading(false);
    }
  }, [tenantId, period]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (activeTab === 'reservas') loadReservations(); }, [activeTab, loadReservations]);

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
            <button key={t.id} onClick={() => navigate('/app/sistema/tenants')}
              style={{ background: 'var(--white)', border: '1px solid var(--sand-100)', borderRadius: 'var(--radius-lg)', padding: 24, cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s' }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = 'var(--shadow-md)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = ''; e.currentTarget.style.transform = ''; }}
            >
              <div style={{ fontWeight: 700, color: 'var(--ink-800)', marginBottom: 4 }}>{t.name}</div>
              <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>{t.units_count ?? 0} unidades · {fmt(t.maintenance_fee)}/mes</div>
            </button>
          ))}
          <button onClick={() => navigate('/app/sistema/tenants')}
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

  // ── Período mínimo = inicio de operaciones del tenant ─────────────────
  const minPeriod = t.operation_start_date
    ? t.operation_start_date.slice(0, 7)
    : (t.created_at ? t.created_at.slice(0, 7) : '');

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
  // Ingresos no identificados (depósitos en banco sin asignar a unidad)
  const ingNoId        = parseFloat(rd.ingresos_no_identificados ?? 0);
  // Ingresos registrados en sistema pero NO conciliados con banco (bank_reconciled=False)
  const ingNoConc      = parseFloat(rd.ingresos_no_reconciled ?? 0);
  // Total ingresos conciliados con banco = mismo número que Reporte General
  const totalIngresos  = parseFloat(rd.total_ingresos_reconciled ?? (s.total_ingresos ?? s.total_collected ?? 0));
  // Gastos conciliados con banco = mismo número que Reporte General
  const gastos         = parseFloat(rd.total_egresos_reconciled ?? s.total_gastos_conciliados ?? 0);
  // Gastos registrados en sistema pero NO conciliados con banco
  const gastosTotal    = parseFloat(s.total_gastos ?? s.total_gastos_conciliados ?? gastos);
  const gastosNoConc   = Math.max(0, gastosTotal - gastos);
  // Saldos bancarios (del reporte general)
  const saldoInicial   = parseFloat(gr?.saldo_inicial ?? 0);
  const saldoFinal     = parseFloat(gr?.saldo_final ?? 0);
  const hasSaldos      = saldoInicial !== 0 || saldoFinal !== 0;

  // ingAdicional para mostrar en KPI = conceptos adicionales
  const ingAdicional   = ingConceptos;
  const adeudoRecibido = s.total_adeudo_recibido ?? 0;
  const deudaTotal     = s.deuda_total ?? 0;
  const balanceNeto    = totalIngresos - gastos;

  // Period open/closed status for the selected period
  const isPeriodClosed     = closedPeriods.some(cp => cp.period === period);

  const pctCobVsCargos     = cargosFijos > 0 ? Math.round((cobranza / cargosFijos) * 100) : 0;
  const pctGastosVsIng     = totalIngresos > 0 ? Math.round((gastos / totalIngresos) * 100) : 0;
  const pctIngAdicional    = totalIngresos > 0 ? Math.round((ingAdicional / totalIngresos) * 100) : 0;
  // pct = adeudoRecibido / (adeudoRecibido + deudaTotal): fracción cobrada del total antes de este período
  const pctDeudaRecuperada = (adeudoRecibido + deudaTotal) > 0
    ? Math.round((adeudoRecibido / (adeudoRecibido + deudaTotal)) * 100)
    : 0;

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
  // common_areas is now a JSONField array of area objects {id, name, active, reservations_enabled, ...}
  const commonAreas = Array.isArray(t.common_areas)
    ? t.common_areas.filter(a => typeof a === 'object' && a !== null)
    : (typeof t.common_areas === 'string'
        ? t.common_areas.split(',').map(a => a.trim()).filter(Boolean).map(name => ({ id: name, name, active: true }))
        : []);
  const activeAreas = commonAreas.filter(a => a.active !== false);

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
    ...(ingNoId > 0       ? [{ label: 'No Identificados',   value: ingNoId,      color: 'var(--amber-400)' }] : []),
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

      {/* ── Header: tabs + navegador de período ─────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <div className="tabs" style={{ marginBottom: 0 }}>
          <button className={`tab ${activeTab === 'general'  ? 'active' : ''}`} onClick={() => setActiveTab('general')}>
            General
          </button>
          <button className={`tab ${activeTab === 'economic' ? 'active' : ''}`} onClick={() => setActiveTab('economic')}>
            Económicos
          </button>
          <button className={`tab ${activeTab === 'reservas' ? 'active' : ''}`} onClick={() => setActiveTab('reservas')}>
            Reservas
          </button>
        </div>

        {/* Navegador de período — aplica a ambas pestañas */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--white)', border: '1px solid var(--sand-100)', borderRadius: 'var(--radius-lg)', padding: '6px 14px' }}>
          <BarChart2 size={14} color="var(--teal-500)" />
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-500)' }}>Período:</span>
          <div className="period-nav" style={{ gap: 2 }}>
            <button
              className="period-nav-btn"
              onClick={() => setPeriod(prevPeriod(period))}
              disabled={!!minPeriod && period <= minPeriod}
              style={{ opacity: (!!minPeriod && period <= minPeriod) ? 0.3 : 1, cursor: (!!minPeriod && period <= minPeriod) ? 'not-allowed' : 'pointer' }}
            >
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
              }}
            />
            <button className="period-nav-btn" onClick={() => setPeriod(nextPeriod(period))}>
              <ChevronRight size={15} />
            </button>
          </div>
          {loading && (
            <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid var(--sand-100)', borderTopColor: 'var(--teal-400)', animation: 'spin 0.8s linear infinite', marginLeft: 4 }} />
          )}
        </div>
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
                {activeAreas.length > 0 && (
                  <span className="badge badge-teal">{activeAreas.length} área{activeAreas.length !== 1 ? 's' : ''}</span>
                )}
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
                        {a.reservations_enabled && (
                          <Calendar size={11} style={{ opacity: 0.7 }} />
                        )}
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

          {/* Committees — activos vs históricos por período de cargo */}
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
                  const today = new Date().toISOString().slice(0, 10);
                  const allPositions = cm.positions || [];

                  // Vigentes: dentro del rango de fechas (o sin fechas) Y con titular
                  const activePositions = allPositions.filter(p => {
                    const started = !p.start_date || p.start_date <= today;
                    const notEnded = !p.end_date   || p.end_date   >= today;
                    return started && notEnded && p.holder_name;
                  }).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

                  // Vacantes vigentes: dentro del rango pero sin titular
                  const vacantPositions = allPositions.filter(p => {
                    const started = !p.start_date || p.start_date <= today;
                    const notEnded = !p.end_date   || p.end_date   >= today;
                    return started && notEnded && !p.holder_name;
                  });

                  // Históricos: end_date ya pasó Y tenían titular
                  const historicPositions = allPositions.filter(p =>
                    p.end_date && p.end_date < today && p.holder_name
                  ).sort((a, b) => b.end_date.localeCompare(a.end_date));

                  const extraMembers = cm.members
                    ? cm.members.split(',').map(m => m.trim()).filter(Boolean) : [];
                  const totalActivos = activePositions.length + extraMembers.length;

                  // Formatea un rango de fechas en español corto
                  const fmtPeriod = (start, end) => {
                    const f = d => d
                      ? new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { month: 'short', year: 'numeric' })
                      : null;
                    const s = f(start), e = f(end);
                    if (s && e) return `${s} – ${e}`;
                    if (s)     return `Desde ${s}`;
                    if (e)     return `Hasta ${e}`;
                    return null;
                  };

                  return (
                    <div key={cm.id} style={{ borderBottom: cmIdx < committees.length - 1 ? '1px solid var(--sand-100)' : 'none' }}>

                      {/* ── Encabezado del comité ── */}
                      <div style={{ padding: '14px 20px 10px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
                            <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink-800)' }}>{cm.name}</span>
                            {cm.exemption && <span className="badge badge-teal" style={{ fontSize: 10 }}>Exento</span>}
                            {totalActivos > 0 && (
                              <span style={{ fontSize: 11, color: 'var(--teal-600)', fontWeight: 600 }}>
                                · {totalActivos} activo{totalActivos !== 1 ? 's' : ''}
                              </span>
                            )}
                            {historicPositions.length > 0 && (
                              <span style={{ fontSize: 11, color: 'var(--ink-300)' }}>
                                · {historicPositions.length} histórico{historicPositions.length !== 1 ? 's' : ''}
                              </span>
                            )}
                          </div>
                          {cm.description && <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>{cm.description}</div>}
                        </div>
                        {vacantPositions.length > 0 && (
                          <span style={{ fontSize: 10, color: 'var(--amber-600)', background: 'var(--amber-50)', border: '1px solid var(--amber-100)', borderRadius: 20, padding: '2px 8px', flexShrink: 0, marginTop: 2, fontWeight: 600 }}>
                            {vacantPositions.length} vacante{vacantPositions.length !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>

                      {/* ── Miembros ACTIVOS (vigentes por período) ── */}
                      {activePositions.length > 0 && (
                        <div style={{ padding: '0 20px 4px' }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--teal-600)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                            Vigentes
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                            {activePositions.map(pos => {
                              const period = fmtPeriod(pos.start_date, pos.end_date);
                              return (
                                <div key={pos.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--teal-50)', border: '1px solid var(--teal-100)', borderRadius: 8, padding: '8px 12px' }}>
                                  <div style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0, background: 'var(--blue-100)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <UserCheck size={15} color="var(--blue-600)" />
                                  </div>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-500)' }}>{pos.title}</div>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-800)' }}>{pos.holder_name}</div>
                                    {period && (
                                      <div style={{ fontSize: 10, color: 'var(--teal-600)', marginTop: 2, fontWeight: 500 }}>
                                        📅 {period}
                                      </div>
                                    )}
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

                      {/* ── Extra members texto libre ── */}
                      {extraMembers.length > 0 && (
                        <div style={{ padding: '0 20px 10px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {extraMembers.map((m, i) => (
                            <span key={i} style={{ fontSize: 12, padding: '3px 10px', borderRadius: 20, background: 'var(--teal-50)', border: '1px solid var(--teal-100)', color: 'var(--teal-700)', fontWeight: 500 }}>{m}</span>
                          ))}
                        </div>
                      )}

                      {/* Sin activos */}
                      {activePositions.length === 0 && extraMembers.length === 0 && (
                        <div style={{ padding: '0 20px 8px', fontSize: 12, color: 'var(--ink-300)', fontStyle: 'italic' }}>
                          Sin integrantes activos en este período
                        </div>
                      )}

                      {/* ── Miembros HISTÓRICOS (end_date ya pasó) ── */}
                      {historicPositions.length > 0 && (
                        <div style={{ padding: '0 20px 12px' }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-300)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ display: 'inline-block', width: 28, borderTop: '1px solid var(--sand-200)' }} />
                            Histórico
                            <span style={{ display: 'inline-block', flex: 1, borderTop: '1px solid var(--sand-200)' }} />
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {historicPositions.map(pos => {
                              const period = fmtPeriod(pos.start_date, pos.end_date);
                              return (
                                <div key={pos.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--sand-50)', borderRadius: 7, padding: '6px 10px' }}>
                                  <div style={{ width: 26, height: 26, borderRadius: '50%', flexShrink: 0, background: 'var(--sand-100)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <UserCheck size={12} color="var(--ink-300)" />
                                  </div>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-400)' }}>{pos.title}</div>
                                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-500)' }}>{pos.holder_name}</div>
                                    {period && (
                                      <div style={{ fontSize: 10, color: 'var(--ink-300)', marginTop: 1 }}>{period}</div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
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
                        <tr key={tt.id} style={{ cursor: 'pointer' }} onClick={() => navigate('/app/sistema/tenants')}>
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
          {/* Period status indicator */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <span style={{ fontSize: 13, color: 'var(--ink-500)', fontWeight: 500 }}>
              Período: <strong style={{ color: 'var(--ink-800)' }}>{monthLabel(period)}</strong>
            </span>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700,
              background: isPeriodClosed ? 'var(--coral-50)' : 'var(--teal-50)',
              color: isPeriodClosed ? 'var(--coral-700)' : 'var(--teal-700)',
              border: `1px solid ${isPeriodClosed ? 'var(--coral-200)' : 'var(--teal-200)'}`,
            }}>
              {isPeriodClosed
                ? <><Lock size={11} /> Período Cerrado</>
                : <><LockOpen size={11} /> Período Abierto</>
              }
            </span>
          </div>

          {/* KPI Grid — 7 tarjetas */}
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
              <div className="dash-kpi-sub">
                {ingNoId > 0
                  ? `conciliados (incl. ${fmt(ingNoId)} no ident.)`
                  : 'conciliados con banco'
                }
              </div>
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

            {ingNoId > 0 && (
              <div className="dash-kpi" style={{ '--accent-color': 'var(--amber-500)' }}>
                <div className="dash-kpi-icon" style={{ background: 'var(--amber-50)' }}>
                  <AlertCircle size={18} color="var(--amber-600)" />
                </div>
                <div className="dash-kpi-label">No Identificados</div>
                <div className="dash-kpi-value" style={{ fontSize: 17, color: 'var(--amber-700)' }}>{fmt(ingNoId)}</div>
                <div className="dash-kpi-sub">ingresos sin asignar a unidad</div>
                <div className="dash-kpi-badge" style={{ background: 'var(--amber-50)', color: 'var(--amber-700)' }}>
                  Pendiente
                </div>
              </div>
            )}
          </div>

          {/* Gauges: Eficiencia de Cobranza + Ratio de Gastos */}
          <SectionLabel>Indicadores de Eficiencia</SectionLabel>
          <div className="grid-2" style={{ marginBottom: 20 }}>

            {/* ── Eficiencia de Cobranza ── */}
            <GaugeCard
              title="Eficiencia de Cobranza"
              pct={pctCobVsCargos}
              color={effColor}
              icon={Receipt}
              subLeft={{ label: 'Total cobrado', value: fmtDec(totalIngresos + ingNoConc) }}
              subRight={{ label: 'Cargos esperados', value: fmtDec(cargosFijos) }}
              breakdown={[
                {
                  label: 'Conciliados con banco',
                  note: 'identificados',
                  value: totalIngresos - ingNoId,
                  fmtVal: fmtDec(totalIngresos - ingNoId),
                  color: 'var(--teal-500)',
                },
                ...(ingNoId > 0 ? [{
                  label: 'No identificados',
                  note: 'en banco sin asignar',
                  value: ingNoId,
                  fmtVal: fmtDec(ingNoId),
                  color: 'var(--amber-400)',
                }] : []),
                ...(ingNoConc > 0 ? [{
                  label: 'Sin conciliar',
                  note: 'registrados, pend. banco',
                  value: ingNoConc,
                  fmtVal: fmtDec(ingNoConc),
                  color: 'var(--blue-400)',
                }] : []),
              ]}
            />

            {/* ── Ratio Egresos vs Ingresos ── */}
            <GaugeCard
              title="Ratio Egresos vs Ingresos"
              pct={pctGastosVsIng}
              color={gvColor}
              icon={ShoppingBag}
              subLeft={{ label: 'Total egresos', value: fmtDec(gastosTotal) }}
              subRight={{ label: 'Total ingresos', value: fmtDec(totalIngresos) }}
              breakdown={[
                {
                  label: 'Egresos conciliados',
                  note: 'con banco',
                  value: gastos,
                  fmtVal: fmtDec(gastos),
                  color: 'var(--coral-500)',
                },
                ...(gastosNoConc > 0 ? [{
                  label: 'Sin conciliar',
                  note: 'registrados, pend. banco',
                  value: gastosNoConc,
                  fmtVal: fmtDec(gastosNoConc),
                  color: 'var(--coral-200)',
                }] : []),
              ]}
            />
          </div>

          {/* Composición de ingresos + Estatus de unidades */}
          <SectionLabel>Composición y Estatus</SectionLabel>
          <div className="grid-2" style={{ marginBottom: 20 }}>
            {/* Donut multi: composición de ingresos */}
            {(() => {
              // Todos los segmentos de ingresos (conciliados + no conciliados)
              const allIncomeSegs = [
                { label: 'Mantenimiento',          value: cobranza,     color: 'var(--teal-500)' },
                ...(ingAdelanto  > 0 ? [{ label: 'Adelantos mant.',        value: ingAdelanto,  color: 'var(--teal-300)' }] : []),
                ...(ingConceptos > 0 ? [{ label: 'Conceptos adicionales',   value: ingConceptos, color: 'var(--blue-400)' }] : []),
                ...(ingNoId      > 0 ? [{ label: 'No identificados',        value: ingNoId,      color: 'var(--amber-400)' }] : []),
                ...(ingNoConc    > 0 ? [{ label: 'Sin conciliar',           value: ingNoConc,    color: 'var(--blue-300)' }] : []),
              ].filter(s => s.value > 0);
              const grandTotal = allIncomeSegs.reduce((a, b) => a + b.value, 0);
              return (
                <div className="card">
                  <div className="card-head">
                    <h3>Composición de Ingresos</h3>
                    <span style={{ fontSize: 11, color: 'var(--ink-400)' }}>
                      {grandTotal > 0 ? fmtDec(grandTotal) : 'sin datos'}
                    </span>
                  </div>
                  <div className="card-body">
                    {grandTotal === 0 ? (
                      <div style={{ textAlign: 'center', color: 'var(--ink-300)', fontSize: 13, fontStyle: 'italic', padding: '24px 0' }}>
                        Sin ingresos registrados en este período
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>

                        {/* Donut centrado + total en el centro */}
                        <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                          <SvgDonutMulti segments={allIncomeSegs} size={160} />
                          <div style={{
                            position: 'absolute', textAlign: 'center',
                            pointerEvents: 'none',
                          }}>
                            <div style={{ fontSize: 10, color: 'var(--ink-400)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total</div>
                            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink-800)' }}>{fmtDec(grandTotal)}</div>
                          </div>
                        </div>

                        {/* Leyenda con mini barras */}
                        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 9 }}>
                          {allIncomeSegs.map((seg, i) => {
                            const pct2 = grandTotal > 0 ? Math.round((seg.value / grandTotal) * 100) : 0;
                            return (
                              <div key={i}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                  <span style={{ width: 10, height: 10, borderRadius: 3, background: seg.color, flexShrink: 0 }} />
                                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-600)', flex: 1 }}>{seg.label}</span>
                                  <span style={{ fontSize: 11, color: 'var(--ink-500)', fontWeight: 700 }}>{fmtDec(seg.value)}</span>
                                  <span style={{ fontSize: 11, color: 'var(--ink-400)', minWidth: 32, textAlign: 'right' }}>{pct2}%</span>
                                </div>
                                <div style={{ height: 6, background: 'var(--sand-100)', borderRadius: 6, overflow: 'hidden' }}>
                                  <div style={{ height: '100%', width: `${pct2}%`, background: seg.color, borderRadius: 6, transition: 'width 0.5s ease' }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

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
                const ingConciliados = totalIngresos - ingNoId; // reconciled only
                const maxVal = Math.max(totalIngresos, gastos, ingNoId, 1);
                const ingPct    = Math.round((ingConciliados / maxVal) * 100);
                const noIdPct   = Math.round((ingNoId / maxVal) * 100);
                const gasPct    = Math.round((gastos / maxVal) * 100);
                return (
                  <div>
                    {/* Ingresos conciliados */}
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--teal-500)' }} />
                          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-700)' }}>Ingresos Conciliados</span>
                          <span style={{ fontSize: 11, color: 'var(--ink-400)', fontWeight: 500 }}>con banco</span>
                        </div>
                        <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--teal-700)' }}>{fmtDec(ingConciliados)}</span>
                      </div>
                      <div style={{ height: 12, background: 'var(--teal-50)', borderRadius: 8, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${ingPct}%`, background: 'var(--teal-500)', borderRadius: 8, transition: 'width 0.8s ease' }} />
                      </div>
                    </div>
                    {/* Ingresos no identificados (no conciliados) */}
                    {ingNoId > 0 && (
                      <div style={{ marginBottom: 14 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--amber-400)' }} />
                            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-700)' }}>Ingresos No Identificados</span>
                            <span style={{ fontSize: 11, color: 'var(--ink-400)', fontWeight: 500 }}>sin asignar</span>
                          </div>
                          <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--amber-700)' }}>{fmtDec(ingNoId)}</span>
                        </div>
                        <div style={{ height: 12, background: 'var(--amber-50)', borderRadius: 8, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${noIdPct}%`, background: 'var(--amber-400)', borderRadius: 8, transition: 'width 0.8s ease' }} />
                        </div>
                      </div>
                    )}
                    {/* Gastos */}
                    <div style={{ marginBottom: 20 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--coral-400)' }} />
                          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-700)' }}>Egresos Conciliados</span>
                          <span style={{ fontSize: 11, color: 'var(--ink-400)', fontWeight: 500 }}>con banco</span>
                        </div>
                        <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--coral-600)' }}>{fmtDec(gastos)}</span>
                      </div>
                      <div style={{ height: 12, background: 'var(--coral-50)', borderRadius: 8, overflow: 'hidden' }}>
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
                        Cobrado al adeudo en el período
                      </div>
                      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                        <div>
                          <div style={{ fontSize: 11, color: 'var(--ink-400)', marginBottom: 2 }}>Recibido en el período</div>
                          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--amber-700)' }}>{fmtDec(adeudoRecibido)}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 11, color: 'var(--ink-400)', marginBottom: 2 }}>Adeudo al corte</div>
                          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--coral-600)' }}>{fmtDec(deudaTotal)}</div>
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

      {/* ══════ TAB: RESERVAS ══════ */}
      {activeTab === 'reservas' && (() => {
        // ── helpers ─────────────────────────────────────────────────
        const DAYS_ES   = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
        const MONTHS_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

        const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
        const firstDOW    = new Date(calYear, calMonth, 1).getDay(); // 0=Sun

        // index reservations by date
        const resByDate = {};
        reservations.forEach(r => {
          if (!resByDate[r.date]) resByDate[r.date] = [];
          resByDate[r.date].push(r);
        });

        const pad = n => String(n).padStart(2, '0');
        const makeDateStr = d => `${calYear}-${pad(calMonth + 1)}-${pad(d)}`;

        // filtered list for right panel
        const visibleRes = reservations.filter(r => {
          if (selectedDay && r.date !== selectedDay) return false;
          if (resStatusFilter !== 'all' && r.status !== resStatusFilter) return false;
          return true;
        });

        const STATUS_CFG = {
          pending:   { label: 'Pendiente',  cls: 'badge-amber' },
          approved:  { label: 'Aprobada',   cls: 'badge-teal'  },
          rejected:  { label: 'Rechazada',  cls: 'badge-coral' },
          cancelled: { label: 'Cancelada',  cls: ''            },
        };

        const handleApprove = async (id) => {
          await reservationsAPI.approve(tenantId, id);
          loadReservations();
        };
        const openReject = (id) => {
          setRejectTargetId(id); setRejectReason(''); setRejectModalOpen(true);
        };
        const confirmReject = async () => {
          await reservationsAPI.reject(tenantId, rejectTargetId, rejectReason);
          setRejectModalOpen(false);
          loadReservations();
        };
        const handleCancel = async (id) => {
          if (!window.confirm('¿Cancelar esta reserva?')) return;
          await reservationsAPI.cancel(tenantId, id);
          loadReservations();
        };

        // pending count badge
        const pendingCount = reservations.filter(r => r.status === 'pending').length;

        return (
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>

            {/* ── Calendario ─────────────────────────────── */}
            <div className="card" style={{ flex: '0 0 320px', minWidth: 280 }}>
              {/* Month nav */}
              <div className="card-head" style={{ justifyContent: 'space-between' }}>
                <button className="btn-ghost" onClick={() => {
                  if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11); }
                  else setCalMonth(m => m - 1);
                  setSelectedDay(null);
                }}><ChevronLeft size={16} /></button>
                <span style={{ fontWeight: 700, fontSize: 14 }}>{MONTHS_ES[calMonth]} {calYear}</span>
                <button className="btn-ghost" onClick={() => {
                  if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0); }
                  else setCalMonth(m => m + 1);
                  setSelectedDay(null);
                }}><ChevronRight size={16} /></button>
              </div>
              <div className="card-body" style={{ padding: '8px 12px 16px' }}>
                {/* Day-of-week headers */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
                  {DAYS_ES.map(d => (
                    <div key={d} style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: 'var(--ink-400)', padding: '2px 0' }}>{d}</div>
                  ))}
                </div>
                {/* Day cells */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
                  {/* empty cells for first week offset */}
                  {Array.from({ length: firstDOW }, (_, i) => <div key={`e${i}`} />)}
                  {Array.from({ length: daysInMonth }, (_, i) => {
                    const d = i + 1;
                    const ds = makeDateStr(d);
                    const recs = resByDate[ds] || [];
                    const hasPending  = recs.some(r => r.status === 'pending');
                    const hasApproved = recs.some(r => r.status === 'approved');
                    const isSelected  = selectedDay === ds;
                    const isToday     = ds === `${today.getFullYear()}-${pad(today.getMonth()+1)}-${pad(today.getDate())}`;
                    return (
                      <button
                        key={d}
                        onClick={() => setSelectedDay(isSelected ? null : ds)}
                        style={{
                          position: 'relative', aspectRatio: '1', borderRadius: 8, border: 'none',
                          background: isSelected ? 'var(--teal-500)' : isToday ? 'var(--teal-50)' : 'transparent',
                          color: isSelected ? 'white' : isToday ? 'var(--teal-700)' : 'var(--ink-700)',
                          fontWeight: isToday ? 800 : 500, fontSize: 12, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          transition: 'background 0.15s',
                        }}
                      >
                        {d}
                        {recs.length > 0 && (
                          <span style={{
                            position: 'absolute', bottom: 2, right: 2,
                            width: 6, height: 6, borderRadius: '50%',
                            background: hasPending ? 'var(--amber-400)' : hasApproved ? 'var(--teal-400)' : 'var(--ink-300)',
                          }} />
                        )}
                      </button>
                    );
                  })}
                </div>
                {/* Legend */}
                <div style={{ display: 'flex', gap: 12, marginTop: 12, fontSize: 10, color: 'var(--ink-400)' }}>
                  <span><span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--amber-400)', marginRight: 3, verticalAlign: 'middle' }} />Pendiente</span>
                  <span><span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--teal-400)', marginRight: 3, verticalAlign: 'middle' }} />Aprobada</span>
                  <span><span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--ink-300)', marginRight: 3, verticalAlign: 'middle' }} />Otra</span>
                </div>
              </div>
            </div>

            {/* ── Lista de reservas ──────────────────────── */}
            <div style={{ flex: '1 1 400px', minWidth: 300, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Filter bar */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {[['all','Todas'],['pending','Pendientes'],['approved','Aprobadas'],['rejected','Rechazadas'],['cancelled','Canceladas']].map(([v,l]) => (
                    <button
                      key={v}
                      className={`tab ${resStatusFilter === v ? 'active' : ''}`}
                      style={{ padding: '4px 10px', fontSize: 12 }}
                      onClick={() => setResStatusFilter(v)}
                    >
                      {l}
                      {v === 'pending' && pendingCount > 0 && (
                        <span className="badge badge-amber" style={{ marginLeft: 5, fontSize: 10, padding: '1px 5px' }}>{pendingCount}</span>
                      )}
                    </button>
                  ))}
                </div>
                {selectedDay && (
                  <button className="btn btn-secondary btn-sm" onClick={() => setSelectedDay(null)}>
                    <X size={12} /> Quitar filtro fecha
                  </button>
                )}
              </div>

              {resLoading ? (
                <div style={{ textAlign: 'center', padding: 32, color: 'var(--ink-400)', fontSize: 13 }}>Cargando reservas…</div>
              ) : visibleRes.length === 0 ? (
                <div className="card">
                  <div className="card-body" style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--ink-300)' }}>
                    <Calendar size={36} color="var(--sand-200)" style={{ marginBottom: 8, display: 'block', margin: '0 auto 8px' }} />
                    <div style={{ fontSize: 13 }}>
                      {selectedDay ? `Sin reservas para el ${selectedDay}` : 'Sin reservas este mes'}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="card">
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Área</th>
                          <th>Fecha</th>
                          <th>Horario</th>
                          <th>Unidad</th>
                          <th>Estado</th>
                          {(isAdmin || role === 'admin') && <th style={{ width: 120, textAlign: 'center' }}>Acciones</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {visibleRes.map(r => {
                          const sc = STATUS_CFG[r.status] || { label: r.status, cls: '' };
                          return (
                            <tr key={r.id}>
                              <td>
                                <div style={{ fontWeight: 600, fontSize: 13 }}>{r.area_name}</div>
                                {r.notes && <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>{r.notes}</div>}
                              </td>
                              <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                                {new Date(r.date + 'T00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}
                              </td>
                              <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                                {r.start_time?.slice(0, 5)} – {r.end_time?.slice(0, 5)}
                              </td>
                              <td style={{ fontSize: 12 }}>
                                {r.unit_id_code || r.unit_name || <span style={{ color: 'var(--ink-300)' }}>—</span>}
                              </td>
                              <td>
                                <span className={`badge ${sc.cls}`} style={{ fontSize: 11 }}>{sc.label}</span>
                              </td>
                              {(isAdmin || role === 'admin') && (
                                <td style={{ textAlign: 'center' }}>
                                  <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                                    {r.status === 'pending' && (<>
                                      <button className="btn btn-primary btn-sm" style={{ padding: '2px 8px' }}
                                        onClick={() => handleApprove(r.id)} title="Aprobar">
                                        <Check size={11} />
                                      </button>
                                      <button className="btn btn-secondary btn-sm" style={{ padding: '2px 8px', color: 'var(--coral-500)' }}
                                        onClick={() => openReject(r.id)} title="Rechazar">
                                        <X size={11} />
                                      </button>
                                    </>)}
                                    {r.status === 'approved' && (
                                      <button className="btn btn-secondary btn-sm" style={{ padding: '2px 8px', fontSize: 11 }}
                                        onClick={() => handleCancel(r.id)}>
                                        Cancelar
                                      </button>
                                    )}
                                  </div>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Modal rechazo */}
            {rejectModalOpen && (
              <div className="modal-bg open" onClick={() => setRejectModalOpen(false)}>
                <div className="modal" onClick={e => e.stopPropagation()}>
                  <div className="modal-head">
                    <h3>Rechazar Reserva</h3>
                    <button className="modal-close" onClick={() => setRejectModalOpen(false)}><X size={16} /></button>
                  </div>
                  <div className="modal-body">
                    <label className="field-label">Motivo del rechazo (opcional)</label>
                    <textarea className="field-input" rows={3}
                      style={{ resize: 'vertical', fontFamily: 'var(--font-body)', fontSize: 13, marginTop: 6 }}
                      placeholder="Área no disponible, mantenimiento programado..."
                      value={rejectReason}
                      onChange={e => setRejectReason(e.target.value)} />
                  </div>
                  <div className="modal-foot">
                    <button className="btn btn-secondary" onClick={() => setRejectModalOpen(false)}>Cancelar</button>
                    <button className="btn btn-danger" onClick={confirmReject}>Confirmar rechazo</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
