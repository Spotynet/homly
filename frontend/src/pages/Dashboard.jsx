import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { reportsAPI, tenantsAPI, assemblyAPI } from '../api/client';
import {
  Globe, Building2, DollarSign, Receipt, ShoppingBag,
  ChevronLeft, ChevronRight, RefreshCw, TrendingDown,
} from 'lucide-react';

// ─── SVG Donut (matches svgDonut in HTML ref) ──────────────────────────────
function SvgDonut({ pct = 0, color = 'var(--teal-400)', size = 110 }) {
  const stroke = 10;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = `${(Math.min(pct, 100) / 100) * circ} ${circ}`;
  const cx = size / 2;
  const cy = size / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}
      style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--sand-100)" strokeWidth={stroke} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={dash} strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.6s ease' }} />
    </svg>
  );
}

// ─── Donut card (4 in a grid-2, each is a card) ───────────────────────────
function DonutCard({ title, pct, color, darkColor, row1Label, row1Value, row2Label, row2Value }) {
  return (
    <div className="card">
      <div className="card-head"><h3>{title}</h3></div>
      <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: 24, justifyContent: 'center' }}>
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <SvgDonut pct={pct} color={color} size={110} />
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: darkColor,
          }}>
            {pct}%
          </div>
        </div>
        <div>
          <div style={{ fontSize: 13, color: 'var(--ink-500)' }}>
            {row1Label}: <strong style={{ color: darkColor }}>{row1Value}</strong>
          </div>
          {row2Label && (
            <div style={{ fontSize: 13, color: 'var(--ink-500)', marginTop: 4 }}>
              {row2Label}: <strong>{row2Value}</strong>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Formatters ────────────────────────────────────────────────────────────
function fmt(n) {
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
      const raw = cmtRes.data;
      setCommittees(Array.isArray(raw) ? raw : (raw?.results || []));
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

  // ── Super admin without tenant ──────────────────────────────────────────
  if (isSuperAdmin && !tenantId) {
    return (
      <div className="content-fade">
        <div style={{ marginBottom: 32 }}>
          <p style={{ color: 'var(--ink-400)', fontSize: 15 }}>Selecciona un condominio para continuar.</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px,1fr))', gap: 16 }}>
          {tenants.map(t => (
            <button key={t.id}
              onClick={() => navigate('/app/tenants')}
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

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading && !stats) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '50vh', gap: 16 }}>
        <div style={{ width: 44, height: 44, borderRadius: '50%', border: '3px solid var(--sand-100)', borderTopColor: 'var(--teal-400)', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <p style={{ color: 'var(--ink-400)', fontSize: 14 }}>Cargando dashboard…</p>
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────
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

  // ── Derived values ────────────────────────────────────────────────────────
  const registered = s.total_units ?? 0;
  const planned    = s.units_planned ?? t.units_count ?? 0;
  const rentedCnt  = s.rented_count ?? 0;
  const ownerCnt   = registered - rentedCnt;
  const unitPct    = planned > 0 ? Math.round((registered / planned) * 100) : 0;

  // General tab: paid count + total collected
  const paidCnt    = s.paid_count ?? 0;
  const totalColl  = s.total_collected ?? 0;

  // Economic tab
  const cargosFijos        = s.total_expected ?? 0;
  const cobranza           = s.total_collected ?? 0;
  // Gastos: solo los conciliados (bank_reconciled=True)
  const gastos             = s.total_gastos_conciliados ?? 0;
  const pctCobVsCargos     = cargosFijos > 0 ? Math.round((cobranza / cargosFijos) * 100) : 0;
  const pctGastosVsIng     = cobranza > 0 ? Math.round((gastos / cobranza) * 100) : 0;
  // Ingresos adicionales: backend ya calcula (no-maintenance FieldPayments menos adeudo)
  const ingAdicional       = s.ingreso_adicional ?? 0;
  const pctIngAdicional    = cargosFijos > 0 ? Math.round((ingAdicional / cargosFijos) * 100) : 0;
  // Recuperación de deuda
  const deudaTotal         = s.deuda_total ?? 0;
  const adeudoRecibido     = s.total_adeudo_recibido ?? 0;
  const pctDeudaRecuperada = deudaTotal > 0 ? Math.round((adeudoRecibido / deudaTotal) * 100) : 0;

  // Dynamic colors (match HTML ref F7)
  const gviRatio = cobranza > 0 ? gastos / cobranza : 0;
  const gviBg  = gviRatio > 1 ? 'var(--coral-400)' : gviRatio >= 0.9 ? 'var(--amber-400)' : 'var(--teal-400)';
  const gviDk  = gviRatio > 1 ? 'var(--coral-600)' : gviRatio >= 0.9 ? 'var(--amber-700)' : 'var(--teal-700)';
  const cvcBg  = cobranza < cargosFijos ? 'var(--coral-400)' : 'var(--teal-400)';
  const cvcDk  = cobranza < cargosFijos ? 'var(--coral-600)' : 'var(--teal-700)';

  // Tenant info fields
  const razonSocial = t.razon_social || t.name || '';
  const rfc = t.rfc || '';
  const address = [t.info_calle, t.info_num_externo, t.info_colonia, t.info_ciudad].filter(Boolean).join(', ') || '';
  const adminTypeBadge = t.admin_type === 'administrador' ? 'badge-amber' : 'badge-teal';
  const adminTypeLabel = t.admin_type === 'administrador' ? 'Administración Externa' : 'Mesa Directiva Interna';
  const commonAreas = typeof t.common_areas === 'string'
    ? t.common_areas.split(',').map(a => a.trim()).filter(Boolean)
    : (Array.isArray(t.common_areas) ? t.common_areas : []);

  // Status counts for economic bars
  const totalUnits = registered || 1;
  const bars = [
    { label: 'Pagado',    count: s.paid_count ?? 0,    color: 'var(--teal-400)',  bg: 'var(--teal-50)' },
    { label: 'Parcial',   count: s.partial_count ?? 0, color: 'var(--amber-400)', bg: 'var(--amber-50)' },
    { label: 'Pendiente', count: s.pending_count ?? 0,  color: 'var(--coral-400)', bg: 'var(--coral-50)' },
  ];

  return (
    <div className="content-fade">
      {/* Tabs */}
      <div className="tabs" style={{ marginBottom: 20 }}>
        <button className={`tab ${activeTab === 'general'  ? 'active' : ''}`} onClick={() => setActiveTab('general')}>
          General
        </button>
        <button className={`tab ${activeTab === 'economic' ? 'active' : ''}`} onClick={() => setActiveTab('economic')}>
          Económicos
        </button>
      </div>

      {/* ══════════════════════════════════════════ GENERAL ══ */}
      {activeTab === 'general' && (
        <div>
          {/* Stat cards */}
          <div className="stats">
            {isSuperAdmin && (
              <div className="stat">
                <div className="stat-icon teal"><Globe size={20} /></div>
                <div className="stat-label">Tenants</div>
                <div className="stat-value">{tenants.length}</div>
                <div className="stat-sub">condominios activos</div>
              </div>
            )}
            {/* Unidades Registradas with progress bar */}
            <div className="stat">
              <div className="stat-icon coral"><Building2 size={20} /></div>
              <div className="stat-label">Unidades Registradas</div>
              <div className="stat-value">
                {registered}
                <span style={{ fontSize: 16, color: 'var(--ink-400)' }}> / {planned}</span>
              </div>
              <div style={{ marginTop: 8 }}>
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${unitPct}%` }} />
                </div>
              </div>
            </div>
            {/* Cuota Mensual */}
            <div className="stat">
              <div className="stat-icon amber"><DollarSign size={20} /></div>
              <div className="stat-label">Cuota Mensual</div>
              <div className="stat-value" style={{ fontSize: 22 }}>
                {new Intl.NumberFormat('es-MX').format(s.maintenance_fee ?? 0)}
              </div>
              <div className="stat-sub">{t.currency || 'MXN'} / mes</div>
            </div>
            {/* Cobrado this period */}
            <div className="stat">
              <div className="stat-icon blue"><Receipt size={20} /></div>
              <div className="stat-label">Cobrado {monthLabel(s.period || period)}</div>
              <div className="stat-value">
                {paidCnt}
                <span style={{ fontSize: 14, color: 'var(--ink-400)' }}>/{registered}</span>
              </div>
              <div className="stat-sub">
                {new Intl.NumberFormat('es-MX').format(totalColl)} recaudado
              </div>
            </div>
          </div>

          {/* Info + Areas grid */}
          <div className="grid-2">
            {/* Info card */}
            <div className="card">
              <div className="card-head"><h3>Información</h3></div>
              <div className="card-body">
                <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                  {t.logo && (
                    <img src={t.logo} alt="Logo"
                      style={{ width: 56, height: 56, borderRadius: 12, objectFit: 'cover', flexShrink: 0 }} />
                  )}
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{razonSocial}</div>
                    <div style={{ fontSize: 13, color: 'var(--ink-400)' }}>RFC: {rfc || '—'}</div>
                    {address && (
                      <div style={{ fontSize: 13, color: 'var(--ink-400)', marginTop: 6 }}>{address}</div>
                    )}
                    <div style={{ marginTop: 8 }}>
                      <span className={`badge ${adminTypeBadge}`}>{adminTypeLabel}</span>
                    </div>
                    {t.country && (
                      <div style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: 6 }}>
                        {t.country}{t.state ? ' · ' + t.state : ''} · {t.currency || 'MXN'}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Áreas Comunes + Ocupación */}
            <div className="card">
              <div className="card-head"><h3>Áreas Comunes</h3></div>
              <div className="card-body">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {commonAreas.length === 0
                    ? <span style={{ fontSize: 13, color: 'var(--ink-300)' }}>Sin áreas registradas</span>
                    : commonAreas.map(a => <span key={a} className="badge badge-teal">{a}</span>)
                  }
                </div>
                {/* Occupancy section */}
                <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--sand-100)' }}>
                  <div style={{ fontSize: 12, color: 'var(--ink-400)', marginBottom: 6 }}>Ocupación</div>
                  <div style={{ display: 'flex', gap: 16 }}>
                    <span className="badge badge-teal">
                      <span className="badge-dot" style={{ background: 'var(--teal-500)' }} />
                      {ownerCnt} Propietarios
                    </span>
                    <span className="badge badge-amber">
                      <span className="badge-dot" style={{ background: 'var(--amber-500)' }} />
                      {rentedCnt} Rentados
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Committees */}
          {committees.length > 0 && (
            <div className="card" style={{ marginTop: 20 }}>
              <div className="card-head">
                <h3 style={{ color: 'var(--blue-700)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  Comités y Grupos de Trabajo
                </h3>
                <span className="badge badge-blue">{committees.length}</span>
              </div>
              <div style={{ padding: 0 }}>
                {committees.map(cm => (
                  <div key={cm.id} style={{ padding: '14px 20px', borderBottom: '1px solid var(--sand-100)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 700, color: 'var(--ink-800)' }}>{cm.name}</span>
                        {cm.type && <span className="badge badge-gray" style={{ fontSize: 10 }}>{cm.type}</span>}
                      </div>
                    </div>
                    {cm.description && (
                      <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>{cm.description}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Super admin: all tenants table */}
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
                        <tr key={tt.id} style={{ cursor: 'pointer' }}
                          onClick={() => navigate('/app/tenants')}>
                          <td style={{ fontWeight: 600 }}>{tt.name}</td>
                          <td>
                            <span className="badge badge-teal">
                              {tt.units_actual ?? tt.units_count ?? 0}/{tt.units_count ?? 0}
                            </span>
                          </td>
                          <td>
                            {new Intl.NumberFormat('es-MX').format(tt.maintenance_fee ?? 0)}
                          </td>
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

      {/* ══════════════════════════════════════════ ECONOMIC ══ */}
      {activeTab === 'economic' && (
        <div>
          {/* Period nav — in a card */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-body" style={{ padding: '14px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-600)' }}>Período:</span>
                <div className="period-nav" style={{ gap: 4 }}>
                  <button className="period-nav-btn" onClick={() => setPeriod(prevPeriod(period))}>
                    <ChevronLeft size={16} />
                  </button>
                  <input
                    type="month"
                    className="period-month-select"
                    style={{ fontSize: 15, fontWeight: 700 }}
                    value={period}
                    onChange={e => setPeriod(e.target.value)}
                  />
                  <button className="period-nav-btn" onClick={() => setPeriod(nextPeriod(period))}>
                    <ChevronRight size={16} />
                  </button>
                </div>
                {loading && (
                  <div style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid var(--sand-100)', borderTopColor: 'var(--teal-400)', animation: 'spin 0.8s linear infinite' }} />
                )}
              </div>
            </div>
          </div>

          {/* 3 KPI stats (Cargos, Cobranza, Gastos) */}
          <div className="stats" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
            <div className="stat">
              <div className="stat-icon blue"><DollarSign size={20} /></div>
              <div className="stat-label">Cargos Fijos</div>
              <div className="stat-value" style={{ fontSize: 20 }}>{fmt(cargosFijos)}</div>
              <div className="stat-sub">mantenimiento + obligatorios</div>
            </div>
            <div className="stat">
              <div className="stat-icon teal"><Receipt size={20} /></div>
              <div className="stat-label">Cobranza Mensual</div>
              <div className="stat-value" style={{ fontSize: 20 }}>{fmt(cobranza)}</div>
              <div className="stat-sub">recaudado en {monthLabel(period)}</div>
            </div>
            <div className="stat">
              <div className="stat-icon coral"><ShoppingBag size={20} /></div>
              <div className="stat-label">Gastos Mensuales</div>
              <div className="stat-value" style={{ fontSize: 20 }}>{fmt(gastos)}</div>
              <div className="stat-sub">{gastos > 0 ? 'gastos conciliados' : 'sin registros conciliados'}</div>
            </div>
          </div>

          {/* 4 Donut charts in grid-2 */}
          <div className="grid-2" style={{ marginTop: 20 }}>
            <DonutCard
              title="Cobranza vs Cargos Fijos"
              pct={pctCobVsCargos}
              color={cvcBg}
              darkColor={cvcDk}
              row1Label="Cobrado"
              row1Value={fmt(cobranza)}
              row2Label="Cargos"
              row2Value={fmt(cargosFijos)}
            />
            <DonutCard
              title="Gastos vs Ingresos"
              pct={pctGastosVsIng}
              color={gviBg}
              darkColor={gviDk}
              row1Label="Gastos conciliados"
              row1Value={fmt(gastos)}
              row2Label="Cobranza"
              row2Value={fmt(cobranza)}
            />
            <DonutCard
              title="Ingresos Adicionales"
              pct={pctIngAdicional}
              color="var(--blue-400)"
              darkColor="var(--blue-700)"
              row1Label="Adicional neto"
              row1Value={fmt(ingAdicional)}
              row2Label="Adeudo recibido"
              row2Value={fmt(adeudoRecibido)}
            />
            <DonutCard
              title="Recuperación de Deuda"
              pct={pctDeudaRecuperada}
              color="var(--coral-400)"
              darkColor="var(--coral-600)"
              row1Label="Recibido este período"
              row1Value={fmt(adeudoRecibido)}
              row2Label="Deuda inicial total"
              row2Value={fmt(deudaTotal)}
            />
          </div>

          {/* Units by status — individual horizontal bars */}
          <div className="card" style={{ marginTop: 20 }}>
            <div className="card-head">
              <h3>Unidades por Estatus — {monthLabel(s.period || period)}</h3>
            </div>
            <div className="card-body">
              {bars.map(b => {
                const bpct = Math.round((b.count / totalUnits) * 100);
                return (
                  <div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                    <div style={{ width: 80, fontSize: 13, fontWeight: 600, color: 'var(--ink-600)' }}>{b.label}</div>
                    <div style={{ flex: 1, height: 28, background: b.bg, borderRadius: 'var(--radius-full)', overflow: 'hidden', position: 'relative' }}>
                      <div style={{ height: '100%', width: `${bpct}%`, background: b.color, borderRadius: 'var(--radius-full)', transition: 'width 0.5s ease' }} />
                    </div>
                    <div style={{ width: 70, textAlign: 'right', fontSize: 13, fontWeight: 700, color: 'var(--ink-700)' }}>
                      {b.count} <span style={{ fontWeight: 400, color: 'var(--ink-400)' }}>({bpct}%)</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
