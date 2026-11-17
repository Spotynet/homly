import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTenantAccess } from '../../context/TenantAccessContext';
import { rentalAPI, tenantsAPI } from '../../api/client';
import { Plus, RefreshCw, RotateCcw, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  CHARGE_STATUS, PROPERTY_GROUPS, PROPERTY_TYPES, RENT_SCHEMES,
  fmtDate, fmtMoney, StatusPill, todayPeriod,
} from './rentalUtils';

const PAY_TYPES = {
  transfer: 'Transferencia',
  cash: 'Efectivo',
  card: 'Tarjeta',
  check: 'Cheque',
  other: 'Otro',
};

function errMsg(e, fallback) {
  const d = e?.response?.data;
  if (typeof d?.detail === 'string') return d.detail;
  const first = d && typeof d === 'object' ? Object.values(d)[0] : null;
  if (Array.isArray(first) && first[0]) return first[0];
  return fallback;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function RentalCobranza() {
  const { tenantId } = useAuth();
  const { can } = useTenantAccess();
  const canWrite = can('rentas_cobranza');
  const canSeeContracts = can('rentas_contratos', 'read');
  const navigate = useNavigate();
  const [period, setPeriod] = useState(todayPeriod());
  const [charges, setCharges] = useState([]);
  const [payments, setPayments] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [concepts, setConcepts] = useState([]);
  const [currency, setCurrency] = useState('MXN');
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('cargos');
  const [statusTab, setStatusTab] = useState('all');
  const [search, setSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [schemeFilter, setSchemeFilter] = useState('');
  const [pay, setPay] = useState(null);
  const [manual, setManual] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = () => {
    if (!tenantId) return;
    setLoading(true);
    Promise.all([
      rentalAPI.charges.list(tenantId, { period, page_size: 500 }),
      rentalAPI.payments.list(tenantId, { period, page_size: 500 }).catch(() => ({ data: [] })),
      rentalAPI.contracts.list(tenantId, { kind: 'renta', page_size: 500 }).catch(() => ({ data: [] })),
      rentalAPI.concepts.list(tenantId).catch(() => ({ data: [] })),
      tenantsAPI.get(tenantId).catch(() => ({ data: {} })),
    ]).then(([c, p, ct, cn, t]) => {
      setCharges(c.data.results || c.data || []);
      setPayments(p.data.results || p.data || []);
      setContracts(ct.data.results || ct.data || []);
      setConcepts(cn.data.results || cn.data || []);
      setCurrency(t.data?.currency || 'MXN');
    }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [tenantId, period]);

  const generate = async () => {
    try {
      const res = await rentalAPI.charges.generate(tenantId, period);
      const extra = res.data.variable ? ` · ${res.data.variable} variable${res.data.estimated ? `, ${res.data.estimated} estimada(s)` : ''}` : '';
      toast.success(`Cargos generados: ${res.data.created}${extra}`);
      load();
    } catch (e) {
      toast.error(errMsg(e, 'No se pudieron generar los cargos'));
    }
  };

  const recalculate = async () => {
    try {
      const res = await rentalAPI.charges.recalculate(tenantId, period);
      toast.success(res.data.updated ? `Se actualizaron ${res.data.updated} cargo(s) de renta` : 'Nada que recalcular');
      load();
    } catch (e) {
      toast.error(errMsg(e, 'No se pudieron recalcular los cargos'));
    }
  };

  const savePay = async () => {
    if (!pay.amount || !pay.payment_date) { toast.error('Monto y fecha son obligatorios'); return; }
    setSaving(true);
    try {
      await rentalAPI.payments.create(tenantId, {
        contract: pay.contract,
        charge: pay.id,
        amount: Number(pay.amount),
        payment_date: pay.payment_date,
        payment_type: pay.payment_type || 'transfer',
        reference: pay.reference || '',
        notes: pay.notes || '',
      });
      toast.success('Pago registrado');
      setPay(null);
      load();
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo registrar el pago'));
    } finally { setSaving(false); }
  };

  const addLateFee = async (ch) => {
    try {
      await rentalAPI.charges.lateFee(tenantId, ch.id);
      toast.success('Cargo de mora creado');
      load();
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo crear la mora'));
    }
  };

  const cancelCharge = async (ch) => {
    if (!window.confirm(`¿Cancelar el cargo “${ch.description}”?`)) return;
    try {
      await rentalAPI.charges.cancel(tenantId, ch.id);
      toast.success('Cargo cancelado');
      load();
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo cancelar'));
    }
  };

  const saveManual = async () => {
    if (!manual.contract || !manual.amount || !manual.description) {
      toast.error('Contrato, concepto y monto son obligatorios');
      return;
    }
    setSaving(true);
    try {
      await rentalAPI.charges.create(tenantId, {
        contract: manual.contract,
        concept: manual.concept || null,
        period,
        description: manual.description,
        amount: Number(manual.amount),
        due_date: manual.due_date || todayISO(),
      });
      toast.success('Cargo creado');
      setManual(null);
      load();
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo crear el cargo'));
    } finally { setSaving(false); }
  };

  const types = useMemo(() => [...new Set(charges.map(c => c.property_type).filter(Boolean))], [charges]);

  const filtered = useMemo(() => {
    let list = charges;
    if (statusTab === 'pendiente') list = list.filter(c => c.status === 'pendiente');
    if (statusTab === 'parcial') list = list.filter(c => c.status === 'parcial');
    if (statusTab === 'pagado') list = list.filter(c => c.status === 'pagado');
    if (statusTab === 'moroso') list = list.filter(c => c.is_overdue);
    if (statusTab === 'variable') list = list.filter(c => c.rent_scheme === 'variable');
    if (groupFilter) list = list.filter(c => c.type_group === groupFilter);
    if (typeFilter) list = list.filter(c => c.property_type === typeFilter);
    if (schemeFilter) list = list.filter(c => c.rent_scheme === schemeFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(c =>
        [c.property_code, c.property_name, c.tenant_name, c.contract_code, c.description,
          c.specs_summary, c.rent_conditions_summary, c.city, c.type_label]
          .join(' ').toLowerCase().includes(q)
      );
    }
    return list;
  }, [charges, statusTab, groupFilter, typeFilter, schemeFilter, search]);

  const expected = filtered.reduce((s, c) => s + (parseFloat(c.amount) || 0), 0);
  const collected = filtered.reduce((s, c) => s + (parseFloat(c.paid_amount) || 0), 0);
  const overdueAmt = filtered.filter(c => c.is_overdue).reduce((s, c) => s + (parseFloat(c.remaining) || 0), 0);
  const variableAmt = filtered.filter(c => c.rent_scheme === 'variable').reduce((s, c) => s + (parseFloat(c.amount) || 0), 0);
  const fixedAmt = filtered.filter(c => c.rent_scheme === 'fija').reduce((s, c) => s + (parseFloat(c.amount) || 0), 0);

  return (
    <div className="content-fade">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', color: 'var(--teal-600)', textTransform: 'uppercase' }}>Administrar Propiedades</div>
          <h2 style={{ margin: '4px 0 0', fontSize: 22 }}>Cobranza</h2>
          <p style={{ color: 'var(--ink-400)', fontSize: 13, marginTop: 4 }}>
            Cargos del mes por tipo de inmueble, renta fija o variable y mora pactada.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="month" className="period-month-select" value={period} onChange={e => setPeriod(e.target.value)} />
          {canWrite && <button className="btn btn-outline" onClick={generate}><RefreshCw size={14} /> Generar mes</button>}
          {canWrite && <button className="btn btn-outline" onClick={recalculate}><RotateCcw size={14} /> Recalcular variables</button>}
          {canWrite && <button className="btn btn-primary" onClick={() => setManual({
            contract: '', concept: '', description: '', amount: 0, due_date: todayISO(),
          })}><Plus size={14} /> Cargo extra</button>}
        </div>
      </div>

      <div className="cob-stats" style={{ marginBottom: 14 }}>
        <Mini label="Cargos" value={fmtMoney(expected, currency)} sub={`${filtered.length} concepto(s)`} />
        <Mini label="Cobrado" value={fmtMoney(collected, currency)} color="var(--teal-700)" sub={`${payments.length} pago(s) del mes`} />
        <Mini label="Pendiente" value={fmtMoney(Math.max(0, expected - collected), currency)} color="var(--coral-500)" />
        <Mini label="Vencido" value={fmtMoney(overdueAmt, currency)} color={overdueAmt ? 'var(--coral-600)' : undefined} sub={`${filtered.filter(c => c.is_overdue).length} moroso(s)`} />
      </div>
      <div className="cob-stats" style={{ marginBottom: 16 }}>
        <Mini label="Renta fija" value={fmtMoney(fixedAmt, currency)} sub={`${filtered.filter(c => c.rent_scheme === 'fija').length} cargo(s)`} />
        <Mini label="Renta variable" value={fmtMoney(variableAmt, currency)} sub={`${filtered.filter(c => c.rent_scheme === 'variable').length} · se puede recalcular`} />
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
        <div className="tabs">
          <button className={`tab ${tab === 'cargos' ? 'active' : ''}`} onClick={() => setTab('cargos')}>Cargos</button>
          <button className={`tab ${tab === 'pagos' ? 'active' : ''}`} onClick={() => setTab('pagos')}>Pagos</button>
        </div>
        {tab === 'cargos' && (
          <div className="tabs">
            {[
              ['all', 'Todos'],
              ['pendiente', 'Pendientes'],
              ['parcial', 'Parciales'],
              ['pagado', 'Pagados'],
              ['moroso', 'Morosos'],
              ['variable', 'Variables'],
            ].map(([k, l]) => (
              <button key={k} className={`tab ${statusTab === k ? 'active' : ''}`} onClick={() => setStatusTab(k)}>{l}</button>
            ))}
          </div>
        )}
        <div style={{ position: 'relative', marginLeft: 'auto' }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--ink-400)' }} />
          <input className="field-input" placeholder="Buscar inmueble, inquilino…" value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 30, width: 230 }} />
        </div>
        <select className="field-select" value={groupFilter} onChange={e => setGroupFilter(e.target.value)} style={{ width: 160 }}>
          <option value="">Todos los grupos</option>
          {PROPERTY_GROUPS.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
        </select>
        <select className="field-select" value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ width: 160 }}>
          <option value="">Todos los tipos</option>
          {types.map(t => <option key={t} value={t}>{PROPERTY_TYPES[t] || t}</option>)}
        </select>
        <select className="field-select" value={schemeFilter} onChange={e => setSchemeFilter(e.target.value)} style={{ width: 150 }}>
          <option value="">Todo esquema</option>
          <option value="fija">Renta fija</option>
          <option value="variable">Renta variable</option>
        </select>
      </div>

      <div className="card">
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-400)' }}>Cargando cobranza…</div>
        ) : tab === 'pagos' ? (
          payments.length === 0 ? (
            <Empty text="Sin pagos en este período." hint="Registra un cobro desde un cargo pendiente." />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Inmueble</th>
                    <th>Inquilino</th>
                    <th>Concepto</th>
                    <th>Forma</th>
                    <th style={{ textAlign: 'right' }}>Monto</th>
                    <th>Referencia</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map(p => (
                    <tr key={p.id}>
                      <td>{fmtDate(p.payment_date)}</td>
                      <td>
                        <div style={{ fontFamily: 'monospace', fontWeight: 700 }}>{p.property_code}</div>
                        <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>{p.type_label || p.property_name}</div>
                      </td>
                      <td>{p.tenant_name || '—'}</td>
                      <td>{p.charge_description || p.contract_code}</td>
                      <td>{p.payment_type_label || PAY_TYPES[p.payment_type] || p.payment_type}</td>
                      <td style={{ textAlign: 'right', color: 'var(--teal-700)', fontWeight: 700 }}>{fmtMoney(p.amount, currency)}</td>
                      <td style={{ fontSize: 12, color: 'var(--ink-400)' }}>{p.reference || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : filtered.length === 0 ? (
          <Empty text="Sin cargos en este recorte." hint="Genera la renta de los contratos vigentes o quita filtros." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Inmueble / tipo</th>
                  <th>Inquilino</th>
                  <th>Concepto</th>
                  <th>Vence</th>
                  <th style={{ textAlign: 'right' }}>Cargo</th>
                  <th style={{ textAlign: 'right' }}>Pagado</th>
                  <th>Estatus</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(ch => {
                  const remaining = Number(ch.remaining ?? Math.max(0, (parseFloat(ch.amount) || 0) - (parseFloat(ch.paid_amount) || 0)));
                  return (
                    <tr key={ch.id}>
                      <td>
                        <div style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--teal-600)' }}>{ch.property_code || '—'}</div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{ch.property_name}</div>
                        <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>
                          {ch.type_label || PROPERTY_TYPES[ch.property_type] || ''}
                          {ch.specs_summary ? ` · ${ch.specs_summary}` : ''}
                          {ch.city ? ` · ${ch.city}` : ''}
                        </div>
                      </td>
                      <td>
                        <div>{ch.tenant_name || '—'}</div>
                        <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>{ch.tenant_phone || ch.tenant_email || ''}</div>
                        {canSeeContracts && ch.contract_code && (
                          <button className="btn btn-outline btn-sm" style={{ marginTop: 4 }} onClick={() => navigate('/app/rentas/contratos')}>{ch.contract_code}</button>
                        )}
                      </td>
                      <td>
                        <div>{ch.description}</div>
                        <div style={{ marginTop: 4, display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                          {ch.rent_scheme && (
                            <StatusPill map={{
                              fija: { label: 'Fija', color: 'var(--teal-700)', bg: 'var(--teal-50)' },
                              variable: { label: 'Variable', color: '#1d4ed8', bg: 'var(--blue-50)' },
                            }} value={ch.rent_scheme} />
                          )}
                          {ch.rent_is_estimate && ch.is_rent ? <span style={{ fontSize: 10, color: '#92400e' }}>estimada</span> : null}
                        </div>
                        {ch.rent_conditions_summary ? (
                          <div style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 2 }}>{ch.rent_conditions_summary}</div>
                        ) : null}
                      </td>
                      <td>
                        <div>{fmtDate(ch.due_date)}</div>
                        {ch.payment_day ? <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>Día {ch.payment_day}</div> : null}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div>{fmtMoney(ch.amount, currency)}</div>
                        {ch.is_rent && ch.effective_rent != null && Math.abs(Number(ch.effective_rent) - Number(ch.amount)) > 0.5 && (
                          <div style={{ fontSize: 11, color: '#92400e' }}>Vigente {fmtMoney(ch.effective_rent, currency)}</div>
                        )}
                      </td>
                      <td style={{ textAlign: 'right', color: 'var(--teal-700)' }}>{fmtMoney(ch.paid_amount, currency)}</td>
                      <td>
                        <StatusPill map={CHARGE_STATUS} value={ch.status} />
                        {ch.is_overdue && <div style={{ fontSize: 11, color: 'var(--coral-500)', marginTop: 4 }}>Vencido</div>}
                      </td>
                      <td>
                        {canWrite && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {ch.status !== 'pagado' && ch.status !== 'cancelado' && (
                            <button className="btn btn-primary btn-sm" onClick={() => setPay({
                              ...ch,
                              amount: remaining,
                              payment_date: todayISO(),
                              payment_type: 'transfer',
                              reference: '',
                              notes: '',
                            })}>
                              <Plus size={12} /> Cobrar
                            </button>
                          )}
                          {ch.is_overdue && ch.suggested_late_fee > 0 && ch.status !== 'cancelado' && (
                            <button className="btn btn-outline btn-sm" onClick={() => addLateFee(ch)}>
                              Mora {fmtMoney(ch.suggested_late_fee, currency)}
                            </button>
                          )}
                          {ch.status === 'pendiente' && Number(ch.paid_amount) <= 0 && (
                            <button className="btn btn-outline btn-sm" onClick={() => cancelCharge(ch)}>Cancelar</button>
                          )}
                        </div>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {pay && (
        <div className="modal-bg open" onClick={() => setPay(null)}>
          <div className="modal lg" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Registrar pago</h3>
              <button className="modal-close" onClick={() => setPay(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom: 14, fontSize: 13, color: 'var(--ink-500)', lineHeight: 1.5 }}>
                <strong>{pay.property_code}</strong> {pay.property_name ? `· ${pay.property_name}` : ''}
                {pay.type_label ? ` · ${pay.type_label}` : ''}
                {pay.specs_summary ? ` · ${pay.specs_summary}` : ''}
                <div>{pay.tenant_name} · {pay.description}</div>
                {pay.rent_scheme && (
                  <div style={{ marginTop: 4 }}>
                    {RENT_SCHEMES[pay.rent_scheme]?.label || pay.rent_scheme_label}
                    {pay.rent_conditions_summary ? ` · ${pay.rent_conditions_summary}` : ''}
                    {pay.rent_is_estimate ? ' · monto estimado' : ''}
                  </div>
                )}
                <div>Saldo {fmtMoney(pay.remaining ?? pay.amount, currency)}</div>
              </div>
              <div className="form-grid">
                <div className="field">
                  <label className="field-label">Monto</label>
                  <input type="number" className="field-input" value={pay.amount} onChange={e => setPay({ ...pay, amount: e.target.value })} />
                </div>
                <div className="field">
                  <label className="field-label">Fecha</label>
                  <input type="date" className="field-input" value={pay.payment_date} onChange={e => setPay({ ...pay, payment_date: e.target.value })} />
                </div>
                <div className="field">
                  <label className="field-label">Forma de pago</label>
                  <select className="field-select" value={pay.payment_type} onChange={e => setPay({ ...pay, payment_type: e.target.value })}>
                    {Object.entries(PAY_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label className="field-label">Referencia</label>
                  <input className="field-input" value={pay.reference} onChange={e => setPay({ ...pay, reference: e.target.value })} />
                </div>
                <div className="field field-full">
                  <label className="field-label">Notas</label>
                  <textarea className="field-input" rows={2} value={pay.notes || ''} onChange={e => setPay({ ...pay, notes: e.target.value })} />
                </div>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setPay(null)}>Cancelar</button>
              <button className="btn btn-primary" disabled={saving} onClick={savePay}>{saving ? 'Guardando…' : 'Registrar pago'}</button>
            </div>
          </div>
        </div>
      )}

      {manual && (
        <div className="modal-bg open" onClick={() => setManual(null)}>
          <div className="modal lg" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Cargo extra</h3>
              <button className="modal-close" onClick={() => setManual(null)}>✕</button>
            </div>
            <div className="modal-body">
              <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--ink-500)' }}>
                Ajuste, depósito, servicios o un complemento de renta variable (ventas reportadas, temporada, etc.).
              </p>
              <div className="form-grid">
                <div className="field field-full">
                  <label className="field-label">Contrato / inmueble</label>
                  <select
                    className="field-select"
                    value={manual.contract}
                    onChange={e => {
                      const c = contracts.find(x => x.id === e.target.value);
                      setManual({
                        ...manual,
                        contract: e.target.value,
                        amount: c?.effective_rent || c?.rent_amount || manual.amount,
                        description: manual.description || (c ? `Ajuste ${period} · ${c.code}` : ''),
                      });
                    }}
                  >
                    <option value="">Selecciona…</option>
                    {contracts.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.property_code} · {c.property_name || ''} — {c.tenant_name || c.counterpart_label} · {c.rent_scheme === 'variable' ? 'variable' : 'fija'}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label className="field-label">Concepto</label>
                  <select className="field-select" value={manual.concept} onChange={e => {
                    const cn = concepts.find(x => x.id === e.target.value);
                    setManual({
                      ...manual,
                      concept: e.target.value,
                      description: cn ? `${cn.name} ${period}` : manual.description,
                      amount: cn?.default_amount || manual.amount,
                    });
                  }}>
                    <option value="">Libre</option>
                    {concepts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label className="field-label">Monto</label>
                  <input type="number" className="field-input" value={manual.amount} onChange={e => setManual({ ...manual, amount: e.target.value })} />
                </div>
                <div className="field">
                  <label className="field-label">Vence</label>
                  <input type="date" className="field-input" value={manual.due_date} onChange={e => setManual({ ...manual, due_date: e.target.value })} />
                </div>
                <div className="field field-full">
                  <label className="field-label">Descripción</label>
                  <input className="field-input" value={manual.description} onChange={e => setManual({ ...manual, description: e.target.value })} />
                </div>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setManual(null)}>Cancelar</button>
              <button className="btn btn-primary" disabled={saving} onClick={saveManual}>{saving ? 'Guardando…' : 'Crear cargo'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Mini({ label, value, sub, color }) {
  return (
    <div className="cob-stat">
      <div>
        <div className="cob-stat-label">{label}</div>
        <div className="cob-stat-value" style={{ fontSize: 18, color }}>{value}</div>
        {sub && <div style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );
}

function Empty({ text, hint }) {
  return (
    <div style={{ padding: 48, textAlign: 'center', color: 'var(--ink-400)' }}>
      <div style={{ fontWeight: 600 }}>{text}</div>
      {hint && <div style={{ fontSize: 13, marginTop: 6 }}>{hint}</div>}
    </div>
  );
}
