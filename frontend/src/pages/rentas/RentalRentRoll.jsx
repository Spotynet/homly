import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { rentalAPI, tenantsAPI } from '../../api/client';
import { Download, Printer, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { CONTRACT_STATUS, PROPERTY_TYPES, fmtDate, fmtMoney, StatusPill, todayPeriod } from './rentalUtils';

const OCC = {
  ocupada: { label: 'Ocupada', color: 'var(--teal-700)', bg: 'var(--teal-50)' },
  aviso: { label: 'En aviso', color: '#92400e', bg: 'var(--amber-50)' },
  holdover: { label: 'Holdover', color: 'var(--coral-600)', bg: 'var(--coral-50)' },
  reservada: { label: 'Reservada', color: '#92400e', bg: 'var(--amber-50)' },
  vacante: { label: 'Vacante', color: 'var(--ink-500)', bg: 'var(--sand-50)' },
  mantenimiento: { label: 'Mantenimiento', color: 'var(--ink-600)', bg: 'var(--sand-50)' },
};

const COLLECTION = {
  al_corriente: { label: 'Al corriente', color: 'var(--teal-700)', bg: 'var(--teal-50)' },
  pendiente_mes: { label: 'Pendiente del mes', color: '#92400e', bg: 'var(--amber-50)' },
  moroso: { label: 'Moroso', color: 'var(--coral-600)', bg: 'var(--coral-50)' },
  '—': { label: '—', color: 'var(--ink-400)', bg: 'var(--sand-50)' },
};

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function sum(list, key) {
  return list.reduce((acc, r) => acc + (Number(r[key]) || 0), 0);
}

export default function RentalRentRoll() {
  const { tenantId } = useAuth();
  const navigate = useNavigate();
  const [asOf, setAsOf] = useState(todayISO());
  const [data, setData] = useState(null);
  const [tenantName, setTenantName] = useState('');
  const [currency, setCurrency] = useState('MXN');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [occFilter, setOccFilter] = useState('all');
  const [cityFilter, setCityFilter] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [groupByOwner, setGroupByOwner] = useState(false);
  const [tab, setTab] = useState('roll');

  const load = () => {
    if (!tenantId) return;
    setLoading(true);
    Promise.all([
      rentalAPI.rentroll(tenantId, { as_of: asOf, include_inactive: includeInactive ? '1' : undefined }),
      tenantsAPI.get(tenantId).catch(() => ({ data: {} })),
    ]).then(([r, t]) => {
      setData(r.data);
      setCurrency(r.data?.currency || t.data?.currency || 'MXN');
      setTenantName(t.data?.name || '');
    }).catch(() => toast.error('No se pudo cargar el Rent Roll'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [tenantId, asOf, includeInactive]);

  const rows = data?.rows || [];
  const s = data?.summary || {};
  const cities = useMemo(() => [...new Set(rows.map(r => r.city).filter(Boolean))].sort(), [rows]);
  const owners = useMemo(() => [...new Set(rows.map(r => r.owner_name).filter(Boolean))].sort(), [rows]);
  const types = useMemo(() => [...new Set(rows.map(r => r.property_type).filter(Boolean))], [rows]);

  const filtered = useMemo(() => {
    let list = rows;
    if (tab === 'vacant') list = list.filter(r => ['vacante', 'reservada', 'mantenimiento'].includes(r.occupancy));
    if (tab === 'expiring') list = list.filter(r => r.days_left != null && r.days_left >= 0 && r.days_left <= 90);
    if (tab === 'delinquent') list = list.filter(r => r.collection_status === 'moroso');
    if (tab === 'notice') list = list.filter(r => r.occupancy === 'aviso' || r.occupancy === 'holdover');
    if (occFilter !== 'all') list = list.filter(r => r.occupancy === occFilter);
    if (cityFilter) list = list.filter(r => r.city === cityFilter);
    if (ownerFilter) list = list.filter(r => r.owner_name === ownerFilter);
    if (typeFilter) list = list.filter(r => r.property_type === typeFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(r =>
        [r.code, r.name, r.tenant_name, r.owner_name, r.contract_code, r.city, r.neighborhood, r.guarantor_name]
          .join(' ').toLowerCase().includes(q)
      );
    }
    return list;
  }, [rows, tab, occFilter, cityFilter, ownerFilter, typeFilter, search]);

  const totals = useMemo(() => ({
    rent: sum(filtered, 'rent_monthly'),
    annual: sum(filtered, 'rent_annual'),
    deposit: sum(filtered, 'deposit'),
    market: sum(filtered, 'suggested_rent'),
    ltl: sum(filtered, 'loss_to_lease'),
    vac: sum(filtered, 'vacancy_loss'),
    overdue: sum(filtered, 'overdue_amount'),
    balance: sum(filtered, 'balance_due'),
  }), [filtered]);

  const groups = useMemo(() => {
    if (!groupByOwner) return [{ key: '', label: '', rows: filtered }];
    const map = new Map();
    filtered.forEach(r => {
      const key = r.owner_name || 'Sin propietario';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(r);
    });
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es'))
      .map(([key, list]) => ({ key, label: key, rows: list }));
  }, [filtered, groupByOwner]);

  const exportCsv = async () => {
    try {
      const res = await rentalAPI.rentrollCsv(tenantId, {
        as_of: asOf,
        include_inactive: includeInactive ? '1' : undefined,
      });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `rent-roll-${asOf}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('No se pudo exportar el CSV');
    }
  };

  const printRoll = () => {
    document.body.classList.add('printing-rentroll');
    window.print();
    setTimeout(() => document.body.classList.remove('printing-rentroll'), 400);
  };

  return (
    <div className="content-fade">
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', color: 'var(--teal-600)', textTransform: 'uppercase' }}>Rent Roll</div>
          <h2 style={{ margin: '4px 0 0', fontSize: 22 }}>Rol de rentas</h2>
          <p style={{ color: 'var(--ink-400)', fontSize: 13, marginTop: 4 }}>
            Snapshot del portafolio a la fecha: ocupación, renta in-place, depósitos, vacancia y morosidad.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <label className="field-label" style={{ margin: 0 }}>Al</label>
          <input type="date" className="field-input" value={asOf} onChange={e => setAsOf(e.target.value)} style={{ width: 150 }} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ink-500)' }}>
            <input type="checkbox" checked={includeInactive} onChange={e => setIncludeInactive(e.target.checked)} />
            Incluir inactivas
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ink-500)' }}>
            <input type="checkbox" checked={groupByOwner} onChange={e => setGroupByOwner(e.target.checked)} />
            Agrupar por propietario
          </label>
          <button className="btn btn-outline" onClick={exportCsv}><Download size={14} /> CSV</button>
          <button className="btn btn-outline" onClick={printRoll}><Printer size={14} /> Imprimir</button>
        </div>
      </div>

      <div className="cob-stats no-print" style={{ marginBottom: 14 }}>
        <Mini label="Unidades" value={s.units || 0} sub={`${s.occupancy_pct || 0}% física · ${s.economic_occupancy_pct || 0}% económica`} />
        <Mini label="Ocupadas" value={s.occupied || 0} sub={`${s.notice || 0} en aviso · ${s.holdover || 0} holdover`} />
        <Mini label="Vacantes" value={s.vacant || 0} sub={`${s.reserved || 0} reservada(s)`} />
        <Mini label="Renta in-place" value={fmtMoney(s.in_place_rent, currency)} sub={`Anual ${fmtMoney(s.annual_in_place, currency)}`} />
      </div>
      <div className="cob-stats no-print" style={{ marginBottom: 16 }}>
        <Mini label="GPR (mercado)" value={fmtMoney(s.gpr, currency)} sub="Suma de rentas sugeridas" />
        <Mini label="Pérdida vacancia" value={fmtMoney(s.vacancy_loss, currency)} sub="Unidades sin contrato" />
        <Mini label="Loss-to-lease" value={fmtMoney(s.loss_to_lease, currency)} sub="Mercado − renta actual" />
        <Mini label="Depósitos" value={fmtMoney(s.deposits_held, currency)} sub={`${s.delinquent || 0} moroso(s) · ${fmtMoney(s.overdue_amount, currency)}`} />
      </div>
      <div className="no-print" style={{ fontSize: 12, color: 'var(--ink-400)', marginBottom: 12 }}>
        Vencen en 30 / 60 / 90 días: <strong>{s.expiring_30 || 0}</strong> / {s.expiring_60 || 0} / {s.expiring_90 || 0}
        {s.airbnb_occupied ? ` · ${s.airbnb_occupied} ocupada(s) por Airbnb (iCal)` : ''}
        {' · '}Período {todayPeriod()}
      </div>

      <div className="no-print" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
        <div className="tabs">
          {[
            ['roll', 'Rent roll'],
            ['vacant', 'Vacantes'],
            ['notice', 'Aviso / holdover'],
            ['expiring', 'Por vencer (90d)'],
            ['delinquent', 'Morosos'],
          ].map(([k, l]) => (
            <button key={k} className={`tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>
        <div style={{ position: 'relative', marginLeft: 'auto' }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--ink-400)' }} />
          <input className="field-input" placeholder="Buscar unidad, inquilino…" value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 30, width: 220 }} />
        </div>
        <select className="field-select" value={occFilter} onChange={e => setOccFilter(e.target.value)} style={{ width: 160 }}>
          <option value="all">Toda ocupación</option>
          {Object.entries(OCC).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select className="field-select" value={cityFilter} onChange={e => setCityFilter(e.target.value)} style={{ width: 150 }}>
          <option value="">Todas las ciudades</option>
          {cities.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="field-select" value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)} style={{ width: 170 }}>
          <option value="">Todos los propietarios</option>
          {owners.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        <select className="field-select" value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ width: 160 }}>
          <option value="">Todos los tipos</option>
          {types.map(t => <option key={t} value={t}>{PROPERTY_TYPES[t] || t}</option>)}
        </select>
      </div>

      <div className="card">
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-400)' }}>Armando el Rent Roll…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-400)', fontSize: 13 }}>
            No hay unidades en este recorte. Da de alta inventario o quita filtros.
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Unidad</th>
                  <th>Inquilino</th>
                  <th>Contrato / vigencia</th>
                  <th>Renta mes</th>
                  <th>Depósito</th>
                  <th>Mercado</th>
                  <th>Ocupación</th>
                  <th>Cobranza</th>
                </tr>
              </thead>
              {groups.map(g => (
                <tbody key={g.key || 'all'}>
                  {g.label ? (
                    <tr>
                      <td colSpan={8} style={{ background: 'var(--sand-50)', fontWeight: 700, fontSize: 12 }}>
                        {g.label} · {g.rows.length} unidad(es) · {fmtMoney(sum(g.rows, 'rent_monthly'), currency)}/mes
                      </td>
                    </tr>
                  ) : null}
                  {g.rows.map(r => (
                    <tr key={r.property_id}>
                      <td>
                        <div style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--teal-600)' }}>{r.code}</div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{r.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>
                          {PROPERTY_TYPES[r.property_type] || r.property_type}
                          {r.city ? ` · ${r.city}` : ''}
                          {r.bedrooms ? ` · ${r.bedrooms} rec.` : ''}
                          {r.bathrooms ? ` · ${r.bathrooms} baños` : ''}
                          {r.area_m2 ? ` · ${r.area_m2} m²` : ''}
                          {!groupByOwner && r.owner_name ? ` · ${r.owner_name}` : ''}
                        </div>
                      </td>
                      <td>
                        {r.tenant_name ? (
                          <>
                            <div>{r.tenant_name}</div>
                            <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>{r.tenant_phone || r.tenant_email || ''}</div>
                            {r.guarantor_name ? <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>Fiador: {r.guarantor_name}</div> : null}
                          </>
                        ) : '—'}
                      </td>
                      <td style={{ fontSize: 13 }}>
                        {r.contract_code ? (
                          <>
                            <button className="btn btn-outline btn-sm no-print" style={{ marginBottom: 4 }} onClick={() => navigate('/app/rentas/contratos')}>{r.contract_code}</button>
                            <div className="print-only" style={{ fontWeight: 700 }}>{r.contract_code}</div>
                            <div>{fmtDate(r.start_date)} — {fmtDate(r.end_date)}</div>
                            <div style={{ fontSize: 11, color: r.days_left != null && r.days_left <= 45 ? 'var(--coral-500)' : 'var(--ink-400)' }}>
                              {r.days_left != null ? `${r.days_left} d · ${r.months_left} mes(es)` : ''}
                              {r.lease_term_months ? ` · plazo ${r.lease_term_months} m` : ''}
                              {r.payment_day ? ` · día ${r.payment_day}` : ''}
                              {r.increment_pct > 0 ? ` · +${r.increment_pct}%` : ''}
                              {r.contract_status ? <> · <StatusPill map={CONTRACT_STATUS} value={r.contract_status} /></> : null}
                            </div>
                          </>
                        ) : (r.occupancy_source === 'airbnb' ? 'Airbnb iCal' : 'Sin contrato')}
                      </td>
                      <td>
                        <div>{fmtMoney(r.rent_monthly, currency)}</div>
                        {r.rent_m2 > 0 && <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>{fmtMoney(r.rent_m2, currency)}/m²</div>}
                      </td>
                      <td>{fmtMoney(r.deposit, currency)}</td>
                      <td>
                        <div>{fmtMoney(r.suggested_rent, currency)}</div>
                        {r.loss_to_lease > 0 && <div style={{ fontSize: 11, color: '#92400e' }}>LTL {fmtMoney(r.loss_to_lease, currency)}</div>}
                        {r.gain_to_lease > 0 && <div style={{ fontSize: 11, color: 'var(--teal-600)' }}>GTL {fmtMoney(r.gain_to_lease, currency)}</div>}
                        {r.vacancy_loss > 0 && <div style={{ fontSize: 11, color: 'var(--coral-500)' }}>Vac. {fmtMoney(r.vacancy_loss, currency)}</div>}
                      </td>
                      <td><StatusPill map={OCC} value={r.occupancy} /></td>
                      <td>
                        <StatusPill map={COLLECTION} value={r.collection_status} />
                        {r.overdue_amount > 0 && (
                          <div style={{ fontSize: 11, color: 'var(--coral-500)', marginTop: 4 }}>{fmtMoney(r.overdue_amount, currency)}</div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              ))}
              <tfoot>
                <tr>
                  <td colSpan={3} style={{ fontWeight: 700 }}>Totales ({filtered.length})</td>
                  <td style={{ fontWeight: 700 }}>{fmtMoney(totals.rent, currency)}</td>
                  <td style={{ fontWeight: 700 }}>{fmtMoney(totals.deposit, currency)}</td>
                  <td style={{ fontWeight: 700 }}>{fmtMoney(totals.market, currency)}</td>
                  <td />
                  <td style={{ fontWeight: 700, color: totals.overdue > 0 ? 'var(--coral-600)' : undefined }}>{fmtMoney(totals.overdue, currency)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        {!loading && (
          <div className="no-print" style={{ padding: '10px 16px', fontSize: 12, color: 'var(--ink-400)' }}>
            {filtered.length} de {rows.length} unidad(es) · corte {fmtDate(asOf)}
            {totals.ltl > 0 ? ` · LTL ${fmtMoney(totals.ltl, currency)}` : ''}
            {totals.vac > 0 ? ` · vacancia ${fmtMoney(totals.vac, currency)}` : ''}
          </div>
        )}
      </div>

      <div className="rentroll-print-layout">
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#0f766e' }}>Homly Rentas · Rent Roll</div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{tenantName || 'Portafolio'}</div>
            <div style={{ fontSize: 12, color: '#57534e' }}>Corte {fmtDate(asOf)} · {filtered.length} unidad(es)</div>
          </div>
          <div style={{ textAlign: 'right', fontSize: 12 }}>
            <div>Ocupación física {s.occupancy_pct || 0}% · económica {s.economic_occupancy_pct || 0}%</div>
            <div>In-place {fmtMoney(s.in_place_rent, currency)} · GPR {fmtMoney(s.gpr, currency)}</div>
            <div>Vacancia {fmtMoney(s.vacancy_loss, currency)} · LTL {fmtMoney(s.loss_to_lease, currency)}</div>
            <div>Depósitos {fmtMoney(s.deposits_held, currency)} · vencido {fmtMoney(s.overdue_amount, currency)}</div>
          </div>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
          <thead>
            <tr>
              {['Unidad', 'Inquilino', 'Contrato', 'Inicio', 'Fin', 'Renta', 'Depósito', 'Mercado', 'Ocupación', 'Cobranza'].map(h => (
                <th key={h} style={{ textAlign: 'left', borderBottom: '1px solid #d6d3d1', padding: '4px 6px' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <tr key={`p-${r.property_id}`}>
                <td style={{ padding: '4px 6px', borderBottom: '1px solid #f5f5f4' }}>{r.code}<br />{r.name}</td>
                <td style={{ padding: '4px 6px', borderBottom: '1px solid #f5f5f4' }}>{r.tenant_name || '—'}</td>
                <td style={{ padding: '4px 6px', borderBottom: '1px solid #f5f5f4' }}>{r.contract_code || '—'}</td>
                <td style={{ padding: '4px 6px', borderBottom: '1px solid #f5f5f4' }}>{fmtDate(r.start_date)}</td>
                <td style={{ padding: '4px 6px', borderBottom: '1px solid #f5f5f4' }}>{fmtDate(r.end_date)}</td>
                <td style={{ padding: '4px 6px', borderBottom: '1px solid #f5f5f4' }}>{fmtMoney(r.rent_monthly, currency)}</td>
                <td style={{ padding: '4px 6px', borderBottom: '1px solid #f5f5f4' }}>{fmtMoney(r.deposit, currency)}</td>
                <td style={{ padding: '4px 6px', borderBottom: '1px solid #f5f5f4' }}>{fmtMoney(r.suggested_rent, currency)}</td>
                <td style={{ padding: '4px 6px', borderBottom: '1px solid #f5f5f4' }}>{OCC[r.occupancy]?.label || r.occupancy}</td>
                <td style={{ padding: '4px 6px', borderBottom: '1px solid #f5f5f4' }}>{COLLECTION[r.collection_status]?.label || r.collection_status}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5} style={{ padding: '6px', fontWeight: 700 }}>Totales</td>
              <td style={{ padding: '6px', fontWeight: 700 }}>{fmtMoney(totals.rent, currency)}</td>
              <td style={{ padding: '6px', fontWeight: 700 }}>{fmtMoney(totals.deposit, currency)}</td>
              <td style={{ padding: '6px', fontWeight: 700 }}>{fmtMoney(totals.market, currency)}</td>
              <td />
              <td style={{ padding: '6px', fontWeight: 700 }}>{fmtMoney(totals.overdue, currency)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function Mini({ label, value, sub }) {
  return (
    <div className="cob-stat">
      <div>
        <div className="cob-stat-label">{label}</div>
        <div className="cob-stat-value" style={{ fontSize: 18 }}>{value}</div>
        {sub && <div style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );
}
