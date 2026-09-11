import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { rentalAPI, tenantsAPI } from '../../api/client';
import { Building2, FileText, Calendar, Receipt, AlertCircle, CheckCircle, Clock, Home, Target } from 'lucide-react';
import { CONTRACT_STATUS, fmtDate, fmtMoney, StatusPill, todayPeriod } from './rentalUtils';

export default function RentalDashboard() {
  const { tenantId } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [currency, setCurrency] = useState('MXN');
  const [loading, setLoading] = useState(true);
  const period = todayPeriod();

  useEffect(() => {
    if (!tenantId) return;
    setLoading(true);
    Promise.all([
      rentalAPI.dashboard(tenantId, { period }),
      tenantsAPI.get(tenantId).catch(() => ({ data: {} })),
    ])
      .then(([dash, ten]) => {
        setData(dash.data);
        setCurrency(dash.data?.currency || ten.data?.currency || 'MXN');
      })
      .finally(() => setLoading(false));
  }, [tenantId]);

  if (loading) {
    return <div className="content-fade" style={{ color: 'var(--ink-400)', padding: 40, textAlign: 'center' }}>Cargando espacio de rentas…</div>;
  }

  const p = data?.properties || {};
  const c = data?.contracts || {};
  const f = data?.period_finance || {};
  const ab = data?.airbnb || {};
  const crm = data?.crm || {};
  const pct = f.expected > 0 ? Math.round((f.collected / f.expected) * 100) : 0;

  return (
    <div className="content-fade">
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', color: 'var(--teal-600)', textTransform: 'uppercase' }}>
          Espacio de rentas
        </div>
        <h2 style={{ margin: '4px 0 0', fontSize: 24 }}>Dashboard inmobiliario</h2>
        <p style={{ color: 'var(--ink-400)', fontSize: 13, marginTop: 4 }}>
          Inventario, contratos y cobranza del período en curso.
        </p>
      </div>

      <div className="cob-stats" style={{ marginBottom: 20 }}>
        <Kpi icon={Building2} color="var(--teal-500)" bg="var(--teal-50)" label="Propiedades" value={`${p.ocupada || 0} / ${p.total || 0}`} sub={`${p.disponible || 0} disponibles`} />
        <Kpi icon={FileText} color="var(--blue-500)" bg="var(--blue-50)" label="Contratos vigentes" value={c.active || 0} sub={`${c.expiring || 0} por vencer`} />
        <Kpi icon={Receipt} color="var(--teal-600)" bg="var(--teal-50)" label="Cobrado del mes" value={fmtMoney(f.collected, currency)} sub={`${pct}% de ${fmtMoney(f.expected, currency)}`} />
        <Kpi icon={AlertCircle} color="var(--coral-500)" bg="var(--coral-50)" label="Adeudo vencido" value={fmtMoney(f.overdue_amount, currency)} sub={`${f.overdue_count || 0} cargo(s)`} />
      </div>

      <div className="card" style={{ marginBottom: 16, padding: '14px 16px', display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
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
        <button className="btn btn-outline" onClick={() => navigate('/app/rentas/config#airbnb')}>Gestionar Airbnb</button>
      </div>

      <div className="card" style={{ marginBottom: 16, padding: '14px 16px', display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--teal-600)' }}>CRM</div>
          <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>
            {crm.open || 0} lead(s) abiertos
            {crm.visits ? ` · ${crm.visits} en visita` : ''}
            {crm.won_month ? ` · ${crm.won_month} ganado(s) este mes` : ''}
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: 2 }}>
            Convierte al ganador en inquilino y genera el contrato de la unidad.
          </div>
        </div>
        <button className="btn btn-outline" onClick={() => navigate('/app/rentas/crm')}>Abrir CRM</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 16 }}>
        <div className="card">
          <div className="card-head">
            <h3>Vigencias próximas</h3>
            <button className="btn btn-outline btn-sm" onClick={() => navigate('/app/rentas/calendario')}>Ver calendario</button>
          </div>
          {(data?.expiring_soon || []).length === 0 ? (
            <div style={{ padding: 28, color: 'var(--ink-400)', textAlign: 'center', fontSize: 13 }}>
              <CheckCircle size={22} style={{ marginBottom: 8, opacity: 0.5 }} />
              <div>No hay contratos por vencer en los próximos 60 días.</div>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Contrato</th>
                    <th>Inmueble</th>
                    <th>Inquilino</th>
                    <th>Vence</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {data.expiring_soon.map(row => (
                    <tr key={row.id}>
                      <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>{row.code}</td>
                      <td>{row.property_code} · {row.property_name}</td>
                      <td>{row.tenant_name}</td>
                      <td>
                        <div>{fmtDate(row.end_date)}</div>
                        <div style={{ fontSize: 11, color: row.days_left <= 15 ? 'var(--coral-500)' : '#b45309' }}>
                          {row.days_left} día(s)
                        </div>
                      </td>
                      <td><StatusPill map={CONTRACT_STATUS} value={row.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-head"><h3>Atajos</h3></div>
          <div style={{ padding: 16, display: 'grid', gap: 10 }}>
            <Shortcut icon={Building2} title="Inventario" text="Alta y estatus de inmuebles" onClick={() => navigate('/app/rentas/propiedades')} />
            <Shortcut icon={Target} title="CRM" text="Leads y conversión a contrato" onClick={() => navigate('/app/rentas/crm')} />
            <Shortcut icon={FileText} title="Nuevo contrato" text="Formalizar una renta" onClick={() => navigate('/app/rentas/contratos')} />
            <Shortcut icon={Receipt} title="Registrar cobro" text="Pagos de renta y extras" onClick={() => navigate('/app/rentas/cobranza')} />
            <Shortcut icon={Calendar} title="Calendario" text="Supervisar vigencias a tiempo" onClick={() => navigate('/app/rentas/calendario')} />
            <Shortcut icon={Home} title="Airbnb" text="Cuentas y anuncios en el inventario" onClick={() => navigate('/app/rentas/config#airbnb')} />
          </div>
          <div style={{ padding: '0 16px 16px', fontSize: 12, color: 'var(--ink-400)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Clock size={13} /> Período {period} · pendiente {fmtMoney(f.pending, currency)}
          </div>
        </div>
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, color, bg, label, value, sub }) {
  return (
    <div className="cob-stat">
      <div className="cob-stat-icon" style={{ background: bg, color }}><Icon size={18} /></div>
      <div>
        <div className="cob-stat-label">{label}</div>
        <div className="cob-stat-value" style={{ fontSize: 18 }}>{value}</div>
        {sub && <div style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );
}

function Shortcut({ icon: Icon, title, text, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
        padding: '12px 14px', borderRadius: 10, border: '1px solid var(--sand-100)',
        background: 'var(--white)', cursor: 'pointer',
      }}
    >
      <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--teal-50)', color: 'var(--teal-600)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={16} />
      </div>
      <div>
        <div style={{ fontWeight: 700, fontSize: 13 }}>{title}</div>
        <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>{text}</div>
      </div>
    </button>
  );
}
