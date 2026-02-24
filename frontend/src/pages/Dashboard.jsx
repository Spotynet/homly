import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { reportsAPI, tenantsAPI, assemblyAPI } from '../api/client';
import {
  Building2, Users, DollarSign, CheckCircle, TrendingUp,
  TrendingDown, ChevronLeft, ChevronRight, BarChart3,
  MapPin, FileText, Home, RefreshCw
} from 'lucide-react';

// ─── Donut Chart ────────────────────────────────────────────
function DonutChart({ pct = 0, color = '#2A9D73', size = 110, stroke = 10, label, value, sub }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dashArr = `${(Math.min(pct, 100) / 100) * circ} ${circ}`;
  const cx = size / 2;
  const cy = size / 2;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--sand-100)" strokeWidth={stroke} />
        <circle
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={dashArr}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.6s ease' }}
        />
      </svg>
      <div style={{ textAlign: 'center', marginTop: -size * 0.82, marginBottom: size * 0.44, lineHeight: 1.2, pointerEvents: 'none' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 500, color: 'var(--ink-800)' }}>{value}</div>
        {sub && <div style={{ fontSize: 10, color: 'var(--ink-400)', marginTop: 1 }}>{sub}</div>}
      </div>
      {label && <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-500)', textAlign: 'center', marginTop: 4, maxWidth: 130 }}>{label}</div>}
    </div>
  );
}

// ─── Horizontal Bar Chart ──────────────────────────────────
function PaymentBar({ paid, partial, pending }) {
  const total = paid + partial + pending || 1;
  const paidPct = (paid / total) * 100;
  const partialPct = (partial / total) * 100;
  const pendingPct = (pending / total) * 100;

  const segments = [
    { pct: paidPct, color: 'var(--teal-400)', label: 'Pagado', count: paid },
    { pct: partialPct, color: 'var(--amber-400)', label: 'Parcial', count: partial },
    { pct: pendingPct, color: 'var(--sand-200)', label: 'Pendiente', count: pending },
  ];

  return (
    <div>
      <div style={{ height: 12, borderRadius: 6, overflow: 'hidden', display: 'flex', marginBottom: 12, background: 'var(--sand-100)' }}>
        {segments.map((s) =>
          s.pct > 0 ? (
            <div key={s.label} style={{ width: `${s.pct}%`, background: s.color, transition: 'width 0.5s ease' }} />
          ) : null
        )}
      </div>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        {segments.map((s) => (
          <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="status-indicator" style={{ background: s.color }} />
            <span style={{ fontSize: 12, color: 'var(--ink-500)' }}>
              {s.label} <strong style={{ color: 'var(--ink-800)' }}>{s.count}</strong>
              <span style={{ color: 'var(--ink-300)', marginLeft: 3 }}>({s.pct.toFixed(0)}%)</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Currency helper ──────────────────────────────────────
function fmt(n) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n ?? 0);
}

function monthLabel(period) {
  if (!period) return '';
  const [y, m] = period.split('-');
  const d = new Date(+y, +m - 1, 1);
  return d.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
}

function prevMonth(period) {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function nextMonth(period) {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ─── Main Component ──────────────────────────────────────
export default function Dashboard() {
  const { user, tenantId, tenantName } = useAuth();
  const navigate = useNavigate();

  const today = new Date();
  const todayPeriod = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

  const [activeTab, setActiveTab] = useState('general');
  const [period, setPeriod] = useState(todayPeriod);
  const [stats, setStats] = useState(null);
  const [tenant, setTenant] = useState(null);
  const [committees, setCommittees] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const isSuperAdmin = user?.role === 'super_admin';

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const [dashRes, tenantRes, cmtRes] = await Promise.all([
        reportsAPI.dashboard(tenantId, period),
        tenantsAPI.get(tenantId),
        assemblyAPI.committees(tenantId).catch(() => ({ data: [] })),
      ]);
      setStats(dashRes.data);
      setTenant(tenantRes.data);
      setCommittees(cmtRes.data || []);
    } catch (e) {
      setError(e.response?.data?.detail || 'Error al cargar el dashboard');
    } finally {
      setLoading(false);
    }
  }, [tenantId, period]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (isSuperAdmin) {
      tenantsAPI.list().then((r) => setTenants(r.data || [])).catch(() => {});
    }
  }, [isSuperAdmin]);

  // ── Super admin without tenant ──
  if (isSuperAdmin && !tenantId) {
    return (
      <div style={{ padding: 40, maxWidth: 800, margin: '0 auto' }}>
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 500, marginBottom: 6 }}>
            Panel de Control<span className="brand-dot">.</span>
          </h1>
          <p style={{ color: 'var(--ink-400)', fontSize: 15 }}>
            Bienvenido, {user?.name || 'Admin'} — Gestión de condominios
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px,1fr))', gap: 16 }}>
          {tenants.map((t) => (
            <button
              key={t.id}
              onClick={() => navigate(`/app/tenants`)}
              style={{
                background: 'var(--white)',
                border: '1px solid var(--sand-100)',
                borderRadius: 'var(--radius-lg)',
                padding: 24,
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.boxShadow = 'var(--shadow-md)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.boxShadow = ''; e.currentTarget.style.transform = ''; }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <div className="stat-icon teal"><Building2 size={18} /></div>
                <div>
                  <div style={{ fontWeight: 700, color: 'var(--ink-800)' }}>{t.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>{t.country}</div>
                </div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-400)', lineHeight: 1.6 }}>
                {t.units_count ?? 0} unidades · Cuota: {fmt(t.maintenance_fee)}/mes
              </div>
            </button>
          ))}

          <button
            onClick={() => navigate('/app/tenants')}
            style={{
              background: 'var(--teal-50)',
              border: '2px dashed var(--teal-200)',
              borderRadius: 'var(--radius-lg)',
              padding: 24,
              cursor: 'pointer',
              color: 'var(--teal-700)',
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            + Ver todos los condominios
          </button>
        </div>
      </div>
    );
  }

  // ── Loading ──
  if (loading && !stats) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '50vh', gap: 16 }}>
        <div style={{
          width: 44, height: 44, borderRadius: '50%',
          border: '3px solid var(--sand-100)', borderTopColor: 'var(--teal-400)',
          animation: 'spin 0.8s linear infinite'
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <p style={{ color: 'var(--ink-400)', fontSize: 14 }}>Cargando dashboard…</p>
      </div>
    );
  }

  // ── Error ──
  if (error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '50vh', gap: 16 }}>
        <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--coral-50)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <TrendingDown size={22} color="var(--coral-500)" />
        </div>
        <p style={{ fontWeight: 700, color: 'var(--ink-800)' }}>No se pudo cargar</p>
        <p style={{ color: 'var(--ink-400)', fontSize: 13, textAlign: 'center', maxWidth: 300 }}>{error}</p>
        <button className="btn btn-outline btn-sm" onClick={load}>
          <RefreshCw size={14} /> Reintentar
        </button>
      </div>
    );
  }

  const s = stats || {};
  const totalPaid = (s.paid_count || 0) + (s.partial_count || 0);
  const collectionPct = s.total_expected > 0 ? Math.min((s.total_collected / s.total_expected) * 100, 100) : 0;
  const gastosPct = s.total_collected > 0
    ? Math.min(((s.total_gastos || 0) + (s.total_caja_chica || 0)) / s.total_collected * 100, 100)
    : 0;
  const additionalPct = s.total_expected > 0
    ? Math.max(0, ((s.total_collected - s.total_expected) / s.total_expected) * 100)
    : 0;
  const netBalance = (s.total_collected || 0) - (s.total_gastos || 0) - (s.total_caja_chica || 0);

  const commonAreas = tenant?.common_areas || [];
  const adminType = tenant?.admin_type === 'professional' ? 'Administración Profesional' : 'Autogestión';

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1300, margin: '0 auto' }} className="content-fade">
      {/* ── Header ── */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 500, marginBottom: 4 }}>
          Dashboard<span className="brand-dot">.</span>
        </h1>
        <p style={{ color: 'var(--ink-400)', fontSize: 14 }}>
          {tenantName} · {monthLabel(s.period || period)}
        </p>
      </div>

      {/* ── Tabs ── */}
      <div className="tabs">
        <button className={`tab ${activeTab === 'general' ? 'active' : ''}`} onClick={() => setActiveTab('general')}>
          General
        </button>
        <button className={`tab ${activeTab === 'economic' ? 'active' : ''}`} onClick={() => setActiveTab('economic')}>
          Económico
        </button>
      </div>

      {/* ════════════════════════════════════════════
          GENERAL TAB
          ════════════════════════════════════════════ */}
      {activeTab === 'general' && (
        <div>
          {/* Stat cards */}
          <div className="stats">
            {isSuperAdmin && (
              <div className="stat">
                <div className="stat-icon blue"><Building2 size={18} /></div>
                <div className="stat-label">Condominios</div>
                <div className="stat-value">{tenants.length}</div>
                <div className="stat-sub">registrados</div>
              </div>
            )}
            <div className="stat">
              <div className="stat-icon teal"><Home size={18} /></div>
              <div className="stat-label">Unidades</div>
              <div className="stat-value">{s.total_units ?? 0}</div>
              <div className="stat-sub">registradas</div>
            </div>
            <div className="stat">
              <div className="stat-icon amber"><DollarSign size={18} /></div>
              <div className="stat-label">Cuota Mensual</div>
              <div className="stat-value" style={{ fontSize: 22 }}>{fmt(s.maintenance_fee)}</div>
              <div className="stat-sub">por unidad</div>
            </div>
            <div className="stat">
              <div className="stat-icon teal"><CheckCircle size={18} /></div>
              <div className="stat-label">Pagos Recibidos</div>
              <div className="stat-value">{totalPaid}<span style={{ fontSize: 14, color: 'var(--ink-300)' }}>/{s.total_units ?? 0}</span></div>
              <div className="stat-sub">{fmt(s.total_collected)} recaudados</div>
            </div>
            <div className="stat">
              <div className="stat-icon coral"><Users size={18} /></div>
              <div className="stat-label">Pendientes</div>
              <div className="stat-value" style={{ color: s.pending_count > 0 ? 'var(--coral-500)' : 'var(--ink-800)' }}>
                {s.pending_count ?? 0}
              </div>
              <div className="stat-sub">sin pagar</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 24, alignItems: 'start' }}>
            {/* Condominio info */}
            <div className="card">
              <div className="card-head"><h3>Información del Condominio</h3></div>
              <div className="card-body">
                <div className="info-grid">
                  {tenant?.razon_social && (
                    <div className="info-item">
                      <div className="info-item-label">Razón Social</div>
                      <div className="info-item-value">{tenant.razon_social}</div>
                    </div>
                  )}
                  {tenant?.rfc && (
                    <div className="info-item">
                      <div className="info-item-label">RFC</div>
                      <div className="info-item-value" style={{ fontFamily: 'monospace' }}>{tenant.rfc}</div>
                    </div>
                  )}
                  {tenant?.address && (
                    <div className="info-item" style={{ gridColumn: '1/-1' }}>
                      <div className="info-item-label"><MapPin size={10} style={{ display: 'inline', marginRight: 4 }} />Dirección</div>
                      <div className="info-item-value">{tenant.address}</div>
                    </div>
                  )}
                  <div className="info-item">
                    <div className="info-item-label">Tipo de Administración</div>
                    <div className="info-item-value">{adminType}</div>
                  </div>
                  <div className="info-item">
                    <div className="info-item-label">País</div>
                    <div className="info-item-value">{tenant?.country || '—'}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right column */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Áreas comunes */}
              <div className="card">
                <div className="card-head"><h3>Áreas Comunes</h3></div>
                <div className="card-body" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {commonAreas.length === 0 && (
                    <span style={{ fontSize: 13, color: 'var(--ink-300)' }}>Sin áreas registradas</span>
                  )}
                  {commonAreas.map((a) => (
                    <span key={a} className="badge badge-teal">{a}</span>
                  ))}
                </div>
              </div>

              {/* Comités */}
              <div className="card">
                <div className="card-head">
                  <h3>Comités</h3>
                  <span style={{ fontSize: 12, color: 'var(--ink-400)' }}>{committees.length} activos</span>
                </div>
                <div style={{ overflow: 'hidden' }}>
                  {committees.length === 0 && (
                    <div className="card-body" style={{ color: 'var(--ink-300)', fontSize: 13 }}>Sin comités registrados</div>
                  )}
                  {committees.slice(0, 5).map((c) => (
                    <div key={c.id} style={{ padding: '12px 24px', borderBottom: '1px solid var(--sand-50)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--ink-800)' }}>{c.name}</span>
                      <span className="badge badge-teal" style={{ fontSize: 10 }}>{c.type}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════
          ECONOMIC TAB
          ════════════════════════════════════════════ */}
      {activeTab === 'economic' && (
        <div>
          {/* Period nav */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28, flexWrap: 'wrap', gap: 12 }}>
            <div className="period-nav">
              <button className="period-nav-btn" onClick={() => setPeriod(prevMonth(period))}>
                <ChevronLeft size={16} />
              </button>
              <div className="period-label">{monthLabel(period)}</div>
              <button className="period-nav-btn" onClick={() => setPeriod(nextMonth(period))} disabled={period >= todayPeriod}>
                <ChevronRight size={16} />
              </button>
            </div>
            {loading && (
              <div style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid var(--sand-100)', borderTopColor: 'var(--teal-400)', animation: 'spin 0.8s linear infinite' }} />
            )}
          </div>

          {/* KPI Cards */}
          <div className="stats" style={{ marginBottom: 32 }}>
            <div className="stat">
              <div className="stat-icon blue"><FileText size={18} /></div>
              <div className="stat-label">Cargos Fijos</div>
              <div className="stat-value" style={{ fontSize: 22 }}>{fmt(s.total_expected)}</div>
              <div className="stat-sub">esperado</div>
            </div>
            <div className="stat">
              <div className="stat-icon teal"><TrendingUp size={18} /></div>
              <div className="stat-label">Cobranza</div>
              <div className="stat-value" style={{ fontSize: 22 }}>{fmt(s.total_collected)}</div>
              <div className="stat-sub">{collectionPct.toFixed(1)}% de lo esperado</div>
            </div>
            <div className="stat">
              <div className="stat-icon coral"><TrendingDown size={18} /></div>
              <div className="stat-label">Gastos</div>
              <div className="stat-value" style={{ fontSize: 22 }}>{fmt((s.total_gastos || 0) + (s.total_caja_chica || 0))}</div>
              <div className="stat-sub">Gastos + Caja Chica</div>
            </div>
            <div className="stat" style={{ borderLeft: `3px solid ${netBalance >= 0 ? 'var(--teal-400)' : 'var(--coral-400)'}` }}>
              <div className={`stat-icon ${netBalance >= 0 ? 'teal' : 'coral'}`}>
                <BarChart3 size={18} />
              </div>
              <div className="stat-label">Balance Neto</div>
              <div className="stat-value" style={{ fontSize: 22, color: netBalance >= 0 ? 'var(--teal-600)' : 'var(--coral-500)' }}>
                {fmt(netBalance)}
              </div>
              <div className="stat-sub">Cobranza − Gastos</div>
            </div>
          </div>

          {/* Donut charts */}
          <div className="card" style={{ marginBottom: 24 }}>
            <div className="card-head"><h3>Indicadores del Período</h3></div>
            <div className="card-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px,1fr))', gap: 32, justifyItems: 'center' }}>
              <DonutChart
                pct={collectionPct}
                color="var(--teal-400)"
                label="Cobranza vs Cargos"
                value={`${collectionPct.toFixed(0)}%`}
                sub="recaudado"
              />
              <DonutChart
                pct={gastosPct}
                color="var(--coral-400)"
                label="Gastos vs Ingresos"
                value={`${gastosPct.toFixed(0)}%`}
                sub="gastado"
              />
              <DonutChart
                pct={Math.min(additionalPct, 100)}
                color="var(--amber-400)"
                label="Ingresos Adicionales"
                value={`${additionalPct.toFixed(0)}%`}
                sub="excedente"
              />
              <DonutChart
                pct={0}
                color="var(--blue-400)"
                label="Recuperación Deuda"
                value="—"
                sub="próximamente"
              />
            </div>
          </div>

          {/* Payment status bar */}
          <div className="card">
            <div className="card-head">
              <h3>Estado de Pagos</h3>
              <span style={{ fontSize: 13, color: 'var(--ink-400)' }}>{s.total_units ?? 0} unidades</span>
            </div>
            <div className="card-body">
              <PaymentBar
                paid={s.paid_count || 0}
                partial={s.partial_count || 0}
                pending={s.pending_count || 0}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
