import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { rentalAPI, tenantsAPI } from '../../api/client';
import { ChevronDown, ChevronRight, Download, Printer, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  CONTRACT_STATUS, LEGAL_STAGES, PROPERTY_SPEC_FIELDS, PROPERTY_TYPES,
  RENT_SCHEMES, fmtDate, fmtMoney, StatusPill, todayPeriod,
} from './rentalUtils';
import { ReportHeader, useTenantBrand } from './reportBrand';

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

function specLabel(type, key) {
  const field = (PROPERTY_SPEC_FIELDS[type] || []).find(f => f.key === key);
  return field?.label || key;
}

function formatSpecValue(value) {
  if (value === true) return 'Sí';
  if (value === false) return 'No';
  if (value == null || value === '') return '';
  return String(value);
}

export default function RentalRentRoll() {
  const { tenantId } = useAuth();
  const navigate = useNavigate();
  const [asOf, setAsOf] = useState(todayISO());
  const [data, setData] = useState(null);
  const [tenantName, setTenantName] = useState('');
  const brand = useTenantBrand();
  const [currency, setCurrency] = useState('MXN');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [occFilter, setOccFilter] = useState('all');
  const [cityFilter, setCityFilter] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [schemeFilter, setSchemeFilter] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [groupMode, setGroupMode] = useState('none');
  const [tab, setTab] = useState('roll');
  const [openId, setOpenId] = useState(null);

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
    if (tab === 'variable') list = list.filter(r => r.rent_scheme === 'variable');
    if (occFilter !== 'all') list = list.filter(r => r.occupancy === occFilter);
    if (cityFilter) list = list.filter(r => r.city === cityFilter);
    if (ownerFilter) list = list.filter(r => r.owner_name === ownerFilter);
    if (typeFilter) list = list.filter(r => r.property_type === typeFilter);
    if (groupFilter) list = list.filter(r => r.type_group === groupFilter);
    if (schemeFilter) list = list.filter(r => r.rent_scheme === schemeFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(r =>
        [r.code, r.name, r.tenant_name, r.owner_name, r.contract_code, r.city, r.neighborhood,
          r.guarantor_name, r.specs_summary, r.rent_conditions_summary, r.type_label, r.address]
          .join(' ').toLowerCase().includes(q)
      );
    }
    return list;
  }, [rows, tab, occFilter, cityFilter, ownerFilter, typeFilter, groupFilter, schemeFilter, search]);

  const totals = useMemo(() => ({
    rent: sum(filtered, 'rent_monthly'),
    annual: sum(filtered, 'rent_annual'),
    deposit: sum(filtered, 'deposit'),
    market: sum(filtered, 'suggested_rent'),
    ltl: sum(filtered, 'loss_to_lease'),
    vac: sum(filtered, 'vacancy_loss'),
    overdue: sum(filtered, 'overdue_amount'),
    balance: sum(filtered, 'balance_due'),
    contracted: sum(filtered, 'rent_contracted'),
  }), [filtered]);

  const groups = useMemo(() => {
    if (groupMode === 'none') return [{ key: '', label: '', rows: filtered }];
    const map = new Map();
    filtered.forEach(r => {
      let key = '—';
      if (groupMode === 'owner') key = r.owner_name || 'Sin propietario';
      if (groupMode === 'group') key = r.type_group_label || r.type_group || 'Otros';
      if (groupMode === 'scheme') key = r.rent_scheme === 'variable' ? 'Renta variable' : (r.rent_scheme === 'fija' ? 'Renta fija' : 'Sin esquema');
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(r);
    });
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es'))
      .map(([key, list]) => ({ key, label: key, rows: list }));
  }, [filtered, groupMode]);

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

  const groupSummary = s.by_group || {};

  return (
    <div className="content-fade">
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', color: 'var(--teal-600)', textTransform: 'uppercase' }}>Rent Roll</div>
          <h2 style={{ margin: '4px 0 0', fontSize: 22 }}>Rol de rentas</h2>
          <p style={{ color: 'var(--ink-400)', fontSize: 13, marginTop: 4 }}>
            Snapshot del portafolio: tipo de inmueble, especificaciones, renta fija o variable y cobranza.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <label className="field-label" style={{ margin: 0 }}>Al</label>
          <input type="date" className="field-input" value={asOf} onChange={e => setAsOf(e.target.value)} style={{ width: 150 }} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ink-500)' }}>
            <input type="checkbox" checked={includeInactive} onChange={e => setIncludeInactive(e.target.checked)} />
            Incluir inactivas
          </label>
          <select className="field-select" value={groupMode} onChange={e => setGroupMode(e.target.value)} style={{ width: 190 }}>
            <option value="none">Sin agrupar</option>
            <option value="owner">Agrupar por propietario</option>
            <option value="group">Agrupar por tipo</option>
            <option value="scheme">Agrupar por esquema</option>
          </select>
          <button className="btn btn-outline" onClick={exportCsv}><Download size={14} /> CSV</button>
          <button className="btn btn-outline" onClick={printRoll}><Printer size={14} /> Imprimir</button>
        </div>
      </div>

      <div className="no-print">
        <ReportHeader title="Rol de rentas (Rent Roll)" subtitle={`Corte al ${fmtDate(asOf)} · ${filtered.length} unidad(es)`} />
      </div>

      <div className="cob-stats no-print" style={{ marginBottom: 14 }}>
        <Mini label="Unidades" value={s.units || 0} sub={`${s.occupancy_pct || 0}% física · ${s.economic_occupancy_pct || 0}% económica`} />
        <Mini label="Ocupadas" value={s.occupied || 0} sub={`${s.notice || 0} en aviso · ${s.holdover || 0} holdover${s.comodato ? ` · ${s.comodato} comodato` : ''}`} />
        <Mini label="Vacantes" value={s.vacant || 0} sub={`${s.reserved || 0} reservada(s)`} />
        <Mini label="Renta in-place" value={fmtMoney(s.in_place_rent, currency)} sub={`Anual ${fmtMoney(s.annual_in_place, currency)}`} />
      </div>
      <div className="cob-stats no-print" style={{ marginBottom: 14 }}>
        <Mini label="Renta fija" value={fmtMoney(s.fixed_rent, currency)} sub={`${s.fixed_count || 0} contrato(s)`} />
        <Mini label="Renta variable" value={fmtMoney(s.variable_rent, currency)} sub={`${s.variable_count || 0} con condiciones`} />
        <Mini label="GPR (mercado)" value={fmtMoney(s.gpr, currency)} sub={`LTL ${fmtMoney(s.loss_to_lease, currency)}`} />
        <Mini label="Depósitos / vencido" value={fmtMoney(s.deposits_held, currency)} sub={`${s.delinquent || 0} moroso(s) · ${fmtMoney(s.overdue_amount, currency)}`} />
      </div>
      {s.multi_tenant_properties > 0 && (
        <div className="cob-stats no-print" style={{ marginBottom: 14 }}>
          <Mini label="GLA total (SQM)" value={`${Number(s.gla_total || 0).toLocaleString('es-MX')} m²`} sub={`${s.multi_tenant_properties} propiedad(es) Multi Tenant`} />
          <Mini label="GLA rentado" value={`${Number(s.gla_occupied || 0).toLocaleString('es-MX')} m²`} sub={`${s.gla_occupancy_pct || 0}% del GLA`} />
          <Mini label="GLA vacante" value={`${Number(s.gla_vacant || 0).toLocaleString('es-MX')} m²`} sub="Disponible para rentar" />
        </div>
      )}
      {Object.keys(groupSummary).length > 0 && (
        <div className="no-print" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {Object.entries(groupSummary).map(([k, g]) => (
            <button
              key={k}
              type="button"
              className={`btn ${groupFilter === k ? 'btn-primary' : 'btn-outline'} btn-sm`}
              onClick={() => setGroupFilter(groupFilter === k ? '' : k)}
            >
              {g.label} · {g.occupied}/{g.units} · {fmtMoney(g.rent, currency)}
            </button>
          ))}
        </div>
      )}
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
            ['variable', 'Renta variable'],
          ].map(([k, l]) => (
            <button key={k} className={`tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>
        <div style={{ position: 'relative', marginLeft: 'auto' }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--ink-400)' }} />
          <input className="field-input" placeholder="Buscar unidad, inquilino, specs…" value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 30, width: 240 }} />
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
        <select className="field-select" value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ width: 170 }}>
          <option value="">Todos los tipos</option>
          {types.map(t => <option key={t} value={t}>{PROPERTY_TYPES[t] || t}</option>)}
        </select>
        <select className="field-select" value={schemeFilter} onChange={e => setSchemeFilter(e.target.value)} style={{ width: 160 }}>
          <option value="">Todo esquema</option>
          <option value="fija">Renta fija</option>
          <option value="variable">Renta variable</option>
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
                  <th style={{ width: 28 }} />
                  <th>Unidad / tipo</th>
                  <th>Inquilino</th>
                  <th>Contrato / vigencia</th>
                  <th>Renta y condiciones</th>
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
                      <td colSpan={9} style={{ background: 'var(--sand-50)', fontWeight: 700, fontSize: 12 }}>
                        {g.label} · {g.rows.length} unidad(es) · {fmtMoney(sum(g.rows, 'rent_monthly'), currency)}/mes
                      </td>
                    </tr>
                  ) : null}
                  {g.rows.map(r => {
                    const unitKey = r.space_id || r.property_id;
                    const open = openId === unitKey;
                    return (
                      <React.Fragment key={unitKey}>
                        <tr style={{ cursor: 'pointer' }} onClick={() => setOpenId(open ? null : unitKey)}>
                          <td>{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
                          <td>
                            <div style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--teal-600)' }}>{r.code}</div>
                            <div style={{ fontWeight: 600, fontSize: 13 }}>{r.name}</div>
                            <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>
                              {r.space_type_label || r.type_label || PROPERTY_TYPES[r.property_type] || r.property_type}
                              {r.specs_summary ? ` · ${r.specs_summary}` : ''}
                              {r.park_name ? ` · Park ${r.park_name}` : ''}
                              {r.building ? ` · Bldg ${r.building}` : ''}
                              {r.floor ? ` · Piso ${r.floor}` : ''}
                              {r.city ? ` · ${r.city}` : ''}
                              {groupMode !== 'owner' && r.owner_name ? ` · ${r.owner_name}` : ''}
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
                                <button className="btn btn-outline btn-sm no-print" style={{ marginBottom: 4 }} onClick={e => { e.stopPropagation(); navigate('/app/rentas/contratos'); }}>{r.contract_code}</button>
                                <div className="print-only" style={{ fontWeight: 700 }}>{r.contract_code}</div>
                                <div>{fmtDate(r.start_date)} — {fmtDate(r.end_date)}</div>
                                <div style={{ fontSize: 11, color: r.days_left != null && r.days_left <= 45 ? 'var(--coral-500)' : 'var(--ink-400)' }}>
                                  {r.days_left != null ? `${r.days_left} d · ${r.months_left} mes(es)` : ''}
                                  {r.lease_term_months ? ` · plazo ${r.lease_term_months} m` : ''}
                                  {r.payment_day ? ` · día ${r.payment_day}` : ''}
                                  {r.contract_status ? <> · <StatusPill map={CONTRACT_STATUS} value={r.contract_status} /></> : null}
                                </div>
                              </>
                            ) : (r.occupancy_source === 'airbnb' ? 'Airbnb iCal' : 'Sin contrato')}
                          </td>
                          <td>
                            <div style={{ fontWeight: 700 }}>{fmtMoney(r.rent_monthly, currency)}</div>
                            {r.rent_m2 > 0 && <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>{fmtMoney(r.rent_m2, currency)}/m²</div>}
                            {r.rent_scheme ? (
                              <div style={{ marginTop: 4, display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                                <StatusPill map={{
                                  fija: { label: 'Fija', color: 'var(--teal-700)', bg: 'var(--teal-50)' },
                                  variable: { label: 'Variable', color: '#1d4ed8', bg: 'var(--blue-50)' },
                                }} value={r.rent_scheme} />
                                {r.rent_is_estimate ? <span style={{ fontSize: 10, color: '#92400e' }}>estimada</span> : null}
                              </div>
                            ) : null}
                            {r.rent_conditions_summary ? (
                              <div style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 2 }}>{r.rent_conditions_summary}</div>
                            ) : null}
                            {r.rent_contracted > 0 && Math.abs(r.rent_contracted - r.rent_monthly) > 0.5 && (
                              <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>Base {fmtMoney(r.rent_contracted, currency)}</div>
                            )}
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
                            {r.period_charge != null && (
                              <div style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 2 }}>Mes {fmtMoney(r.period_charge, currency)}</div>
                            )}
                          </td>
                        </tr>
                        {open && (
                          <tr>
                            <td colSpan={9} style={{ background: 'var(--sand-50)', padding: 0 }}>
                              <RowDetail r={r} currency={currency} navigate={navigate} />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              ))}
              <tfoot>
                <tr>
                  <td colSpan={4} style={{ fontWeight: 700 }}>Totales ({filtered.length})</td>
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
            {' · '}Clic en una fila para ver ficha completa
          </div>
        )}
      </div>

      <div className="rentroll-print-layout">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 10, paddingBottom: 8, borderBottom: '2px solid #0f766e' }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            {brand.logo && <img src={brand.logo} alt="" style={{ maxHeight: 56, maxWidth: 140, objectFit: 'contain' }} />}
            <div>
              <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#0f766e' }}>Administrar Propiedades · Rent Roll</div>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{brand.name || tenantName || 'Portafolio'}</div>
              {brand.alias && <div style={{ fontSize: 11, color: '#57534e' }}>{brand.alias}</div>}
              {brand.rfc && <div style={{ fontSize: 11, color: '#57534e' }}>RFC: {brand.rfc}</div>}
              {brand.address && <div style={{ fontSize: 11, color: '#57534e' }}>{brand.address}</div>}
              <div style={{ fontSize: 12, color: '#57534e', marginTop: 2 }}>Corte {fmtDate(asOf)} · {filtered.length} unidad(es){brand.generatedBy ? ` · Generó: ${brand.generatedBy}` : ''}</div>
            </div>
          </div>
          <div style={{ textAlign: 'right', fontSize: 12 }}>
            <div>Ocupación física {s.occupancy_pct || 0}% · económica {s.economic_occupancy_pct || 0}%</div>
            <div>In-place {fmtMoney(s.in_place_rent, currency)} · GPR {fmtMoney(s.gpr, currency)}</div>
            <div>Fija {fmtMoney(s.fixed_rent, currency)} · variable {fmtMoney(s.variable_rent, currency)}</div>
            <div>Vacancia {fmtMoney(s.vacancy_loss, currency)} · vencido {fmtMoney(s.overdue_amount, currency)}</div>
          </div>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
          <thead>
            <tr>
              {['Unidad', 'Tipo', 'Inquilino', 'Contrato', 'Esquema', 'Renta', 'Depósito', 'Mercado', 'Ocupación', 'Cobranza'].map(h => (
                <th key={h} style={{ textAlign: 'left', borderBottom: '1px solid #d6d3d1', padding: '4px 6px' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <tr key={`p-${r.space_id || r.property_id}`}>
                <td style={{ padding: '4px 6px', borderBottom: '1px solid #f5f5f4' }}>{r.code}<br />{r.name}</td>
                <td style={{ padding: '4px 6px', borderBottom: '1px solid #f5f5f4' }}>{r.type_label || r.property_type}<br />{r.specs_summary}</td>
                <td style={{ padding: '4px 6px', borderBottom: '1px solid #f5f5f4' }}>{r.tenant_name || '—'}</td>
                <td style={{ padding: '4px 6px', borderBottom: '1px solid #f5f5f4' }}>{r.contract_code || '—'}<br />{fmtDate(r.start_date)} — {fmtDate(r.end_date)}</td>
                <td style={{ padding: '4px 6px', borderBottom: '1px solid #f5f5f4' }}>{r.rent_scheme_label || '—'}<br />{r.rent_conditions_summary}</td>
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

function RowDetail({ r, currency, navigate }) {
  const specs = r.specs && typeof r.specs === 'object' ? r.specs : {};
  const specEntries = Object.entries(specs).filter(([, v]) => v !== '' && v != null && v !== false);
  const cond = r.rent_conditions && typeof r.rent_conditions === 'object' ? r.rent_conditions : {};
  const legal = LEGAL_STAGES[r.legal_stage] || null;
  return (
    <div style={{ padding: '14px 16px 16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
      <DetailBlock title="Inmueble">
        <Line k="Tipo" v={`${r.type_group_label || ''} · ${r.type_label || PROPERTY_TYPES[r.property_type] || r.property_type}`} />
        <Line k="Dirección" v={r.address || '—'} />
        <Line k="Colonia" v={[r.neighborhood, r.postal_code].filter(Boolean).join(' · ') || '—'} />
        <Line k="Superficie" v={r.area_m2 ? `${r.area_m2} m²` : '—'} />
        {r.bedrooms ? <Line k="Recámaras" v={r.bedrooms} /> : null}
        {r.bathrooms ? <Line k="Baños" v={r.bathrooms} /> : null}
        <Line k="Propietario" v={[r.owner_name, r.owner_phone, r.owner_email].filter(Boolean).join(' · ') || '—'} />
        {r.notes ? <Line k="Notas" v={r.notes} /> : null}
        {specEntries.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-500)', marginBottom: 4 }}>Especificaciones</div>
            {specEntries.map(([k, v]) => (
              <Line key={k} k={specLabel(r.property_type, k)} v={formatSpecValue(v)} />
            ))}
          </div>
        )}
      </DetailBlock>
      <DetailBlock title="Contrato">
        <Line k="Folio" v={r.contract_code || 'Sin contrato'} />
        {r.contract_title ? <Line k="Título" v={r.contract_title} /> : null}
        <Line k="Vigencia" v={r.start_date ? `${fmtDate(r.start_date)} — ${fmtDate(r.end_date)}` : '—'} />
        <Line k="Plazo" v={r.lease_term_months ? `${r.lease_term_months} meses` : '—'} />
        <Line k="Día de cobro" v={r.payment_day || '—'} />
        <Line k="Incremento" v={r.increment_pct ? `${r.increment_pct}% anual` : 'Ninguno'} />
        <Line k="Mora" v={r.late_fee_pct ? `${r.late_fee_pct}%` : 'Ninguna'} />
        {legal ? <Line k="Legal" v={legal.label} /> : null}
        {r.contract_notes ? <Line k="Notas" v={r.contract_notes} /> : null}
        {r.contract_id && (
          <button className="btn btn-outline btn-sm" style={{ marginTop: 8 }} onClick={() => navigate('/app/rentas/contratos')}>Abrir contratos</button>
        )}
      </DetailBlock>
      <DetailBlock title="Renta">
        <Line k="Esquema" v={r.rent_scheme_label || RENT_SCHEMES[r.rent_scheme]?.label || '—'} />
        {r.rent_basis_label ? <Line k="Base" v={r.rent_basis_label} /> : null}
        <Line k="Vigente al corte" v={`${fmtMoney(r.rent_monthly, currency)}${r.rent_is_estimate ? ' (estimada)' : ''}`} />
        {r.rent_contracted > 0 ? <Line k="Contratada / base" v={fmtMoney(r.rent_contracted, currency)} /> : null}
        <Line k="Anual" v={fmtMoney(r.rent_annual, currency)} />
        <Line k="Depósito" v={fmtMoney(r.deposit, currency)} />
        {r.rent_conditions_summary ? <Line k="Condiciones" v={r.rent_conditions_summary} /> : null}
        {r.rent_scheme === 'variable' && <ConditionLines cond={cond} currency={currency} />}
      </DetailBlock>
      <DetailBlock title="Cobranza y ocupación">
        <Line k="Ocupación" v={OCC[r.occupancy]?.label || r.occupancy} />
        <Line k="Origen" v={r.occupancy_source === 'airbnb' ? 'Airbnb iCal' : 'Contrato Homly'} />
        {r.airbnb?.listing_name ? <Line k="Anuncio" v={r.airbnb.listing_name} /> : null}
        <Line k="Estatus cobro" v={COLLECTION[r.collection_status]?.label || r.collection_status} />
        <Line k="Cargo del mes" v={r.period_charge != null ? `${fmtMoney(r.period_charge, currency)}${r.period_charge_label ? ` · ${r.period_charge_label}` : ''}` : 'Sin generar'} />
        <Line k="Pagado del mes" v={fmtMoney(r.period_paid, currency)} />
        <Line k="Saldo" v={fmtMoney(r.balance_due, currency)} />
        <Line k="Vencido" v={fmtMoney(r.overdue_amount, currency)} />
        {r.tenant_rfc ? <Line k="RFC inquilino" v={r.tenant_rfc} /> : null}
      </DetailBlock>
    </div>
  );
}

function ConditionLines({ cond, currency }) {
  const basis = cond.basis;
  return (
    <div style={{ marginTop: 8 }}>
      {basis === 'ventas' && (
        <>
          {cond.percent ? <Line k="% ventas" v={`${cond.percent}%`} /> : null}
          {cond.breakpoint > 0 ? <Line k="Punto de quiebre" v={fmtMoney(cond.breakpoint, currency)} /> : null}
          {cond.reported_sales > 0 ? <Line k="Ventas reportadas" v={fmtMoney(cond.reported_sales, currency)} /> : <Line k="Ventas" v="Sin reporte (usa mínimo)" />}
        </>
      )}
      {basis === 'inpc' && (
        <>
          <Line k="Índice" v={cond.index_name || 'INPC'} />
          <Line k="Base / vigente" v={`${cond.index_base || 100} → ${cond.index_current || '—'}`} />
          {cond.review_months ? <Line k="Revisión" v={`cada ${cond.review_months} mes(es)`} /> : null}
          {cond.cap_pct ? <Line k="Tope" v={`${cond.cap_pct}%`} /> : null}
        </>
      )}
      {basis === 'escalonada' && (cond.steps || []).map((step, i) => (
        <Line key={i} k={`Tramo ${step.from}`} v={fmtMoney(step.amount, currency)} />
      ))}
      {basis === 'ocupacion' && (
        <>
          {cond.nightly_rate ? <Line k="Por noche" v={fmtMoney(cond.nightly_rate, currency)} /> : null}
          {cond.occupancy_pct ? <Line k="Ocupación" v={`${cond.occupancy_pct}%`} /> : null}
          {cond.nights ? <Line k="Noches" v={cond.nights} /> : null}
          {cond.platform_fee_pct ? <Line k="Comisión" v={`${cond.platform_fee_pct}%`} /> : null}
        </>
      )}
      {basis === 'm2' && (
        <>
          {cond.rate_m2 ? <Line k="$ / m²" v={fmtMoney(cond.rate_m2, currency)} /> : null}
          {cond.area_m2 ? <Line k="m² pacto" v={cond.area_m2} /> : null}
          {cond.common_area_factor && Number(cond.common_area_factor) !== 1 ? <Line k="Factor" v={cond.common_area_factor} /> : null}
        </>
      )}
      {basis === 'temporada' && (cond.seasons || []).map((season, i) => (
        <Line key={i} k={`Meses ${(season.months || []).join(', ')}`} v={fmtMoney(season.amount, currency)} />
      ))}
      {cond.notes ? <Line k="Notas" v={cond.notes} /> : null}
    </div>
  );
}

function DetailBlock({ title, children }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--teal-700)', marginBottom: 6 }}>{title}</div>
      {children}
    </div>
  );
}

function Line({ k, v }) {
  return (
    <div style={{ display: 'flex', gap: 8, fontSize: 12, lineHeight: 1.45, marginBottom: 2 }}>
      <span style={{ color: 'var(--ink-400)', minWidth: 92 }}>{k}</span>
      <span style={{ color: 'var(--ink-700)' }}>{v || '—'}</span>
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
