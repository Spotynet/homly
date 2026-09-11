import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { rentalAPI, tenantsAPI } from '../../api/client';
import { Plus, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { CHARGE_STATUS, fmtDate, fmtMoney, StatusPill, todayPeriod } from './rentalUtils';

export default function RentalCobranza() {
  const { tenantId } = useAuth();
  const [period, setPeriod] = useState(todayPeriod());
  const [charges, setCharges] = useState([]);
  const [currency, setCurrency] = useState('MXN');
  const [loading, setLoading] = useState(true);
  const [pay, setPay] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = () => {
    if (!tenantId) return;
    setLoading(true);
    Promise.all([
      rentalAPI.charges.list(tenantId, { period, page_size: 500 }),
      tenantsAPI.get(tenantId).catch(() => ({ data: {} })),
    ]).then(([c, t]) => {
      setCharges(c.data.results || c.data || []);
      setCurrency(t.data?.currency || 'MXN');
    }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [tenantId, period]);

  const generate = async () => {
    try {
      const res = await rentalAPI.charges.generate(tenantId, period);
      toast.success(`Cargos generados: ${res.data.created}`);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'No se pudieron generar los cargos');
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
      toast.error(e.response?.data?.detail || 'No se pudo registrar el pago');
    } finally { setSaving(false); }
  };

  const expected = charges.reduce((s, c) => s + (parseFloat(c.amount) || 0), 0);
  const collected = charges.reduce((s, c) => s + (parseFloat(c.paid_amount) || 0), 0);

  return (
    <div className="content-fade">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', color: 'var(--teal-600)', textTransform: 'uppercase' }}>Finanzas</div>
          <h2 style={{ margin: '4px 0 0', fontSize: 22 }}>Cobranza de rentas</h2>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="month" className="period-month-select" value={period} onChange={e => setPeriod(e.target.value)} />
          <button className="btn btn-outline" onClick={generate}><RefreshCw size={14} /> Generar cargos del mes</button>
        </div>
      </div>

      <div className="cob-stats" style={{ marginBottom: 16 }}>
        <div className="cob-stat"><div><div className="cob-stat-label">Cargos</div><div className="cob-stat-value" style={{ fontSize: 18 }}>{fmtMoney(expected, currency)}</div></div></div>
        <div className="cob-stat"><div><div className="cob-stat-label">Cobrado</div><div className="cob-stat-value" style={{ fontSize: 18, color: 'var(--teal-700)' }}>{fmtMoney(collected, currency)}</div></div></div>
        <div className="cob-stat"><div><div className="cob-stat-label">Pendiente</div><div className="cob-stat-value" style={{ fontSize: 18, color: 'var(--coral-500)' }}>{fmtMoney(Math.max(0, expected - collected), currency)}</div></div></div>
      </div>

      <div className="card">
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-400)' }}>Cargando cobranza…</div>
        ) : charges.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--ink-400)' }}>
            <div style={{ fontWeight: 600 }}>Sin cargos en este período</div>
            <div style={{ fontSize: 13, marginTop: 6 }}>Genera la renta y conceptos recurrentes de los contratos vigentes.</div>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Inmueble</th>
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
                {charges.map(ch => {
                  const remaining = Math.max(0, (parseFloat(ch.amount) || 0) - (parseFloat(ch.paid_amount) || 0));
                  return (
                    <tr key={ch.id}>
                      <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>{ch.property_code}</td>
                      <td>{ch.tenant_name}</td>
                      <td>{ch.description}</td>
                      <td>{fmtDate(ch.due_date)}</td>
                      <td style={{ textAlign: 'right' }}>{fmtMoney(ch.amount, currency)}</td>
                      <td style={{ textAlign: 'right', color: 'var(--teal-700)' }}>{fmtMoney(ch.paid_amount, currency)}</td>
                      <td><StatusPill map={CHARGE_STATUS} value={ch.status} /></td>
                      <td>
                        {ch.status !== 'pagado' && ch.status !== 'cancelado' && (
                          <button className="btn btn-primary btn-sm" onClick={() => setPay({
                            ...ch,
                            amount: remaining,
                            payment_date: new Date().toISOString().slice(0, 10),
                            payment_type: 'transfer',
                            reference: '',
                          })}>
                            <Plus size={12} /> Cobrar
                          </button>
                        )}
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
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Registrar pago</h3>
              <button className="modal-close" onClick={() => setPay(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--ink-500)' }}>
                {pay.property_code} · {pay.tenant_name} · {pay.description}
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
                    <option value="transfer">Transferencia</option>
                    <option value="cash">Efectivo</option>
                    <option value="card">Tarjeta</option>
                    <option value="check">Cheque</option>
                    <option value="other">Otro</option>
                  </select>
                </div>
                <div className="field">
                  <label className="field-label">Referencia</label>
                  <input className="field-input" value={pay.reference} onChange={e => setPay({ ...pay, reference: e.target.value })} />
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
    </div>
  );
}
