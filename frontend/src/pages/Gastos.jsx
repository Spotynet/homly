import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { gastosAPI, cajaChicaAPI, extraFieldsAPI } from '../api/client';
import { todayPeriod, periodLabel, prevPeriod, nextPeriod, fmtDate, PAYMENT_TYPES } from '../utils/helpers';
import { ChevronLeft, ChevronRight, Plus, Edit, Trash2, X, ShoppingBag, DollarSign, Printer, Check, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';

const GASTO_PAYMENT_TYPES = [
  { value: 'transferencia', label: '🏦 Transferencia', short: 'Transferencia' },
  { value: 'cheque', label: '📝 Cheque', short: 'Cheque' },
  { value: 'efectivo', label: '💰 Efectivo', short: 'Efectivo' },
];
const gastoPaymentLabel = (v) => GASTO_PAYMENT_TYPES.find(p => p.value === v)?.short || v || '—';

// Caja Chica NO tiene Transferencia
const CAJA_PAYMENT_TYPES = Object.entries(PAYMENT_TYPES)
  .filter(([k]) => k !== 'transferencia')
  .map(([k, v]) => ({ value: k, ...v }));

function fmt(n) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n ?? 0);
}

function GastosTable({ rows, isReadOnly, onEdit, onDelete, showBadge }) {
  const cols = isReadOnly ? 6 : 7;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Concepto</th>
            <th style={{ textAlign: 'right' }}>Monto</th>
            <th>Forma de Pago</th>
            <th>No. Doc</th>
            <th>Fecha</th>
            <th>Proveedor / Notas</th>
            {!isReadOnly && <th style={{ width: 70 }}>Acc.</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map(g => (
            <tr key={g.id}>
              <td style={{ fontWeight: 600, fontSize: 13, color: 'var(--ink-700)' }}>
                {g.field_label || '—'}
                {showBadge && g.bank_reconciled && (
                  <span style={{ marginLeft: 6, fontSize: 10, background: 'var(--teal-50)', color: 'var(--teal-700)', padding: '1px 6px', borderRadius: 10, fontWeight: 700 }}>🏦</span>
                )}
              </td>
              <td style={{ textAlign: 'right', fontWeight: 700, fontSize: 13, color: 'var(--amber-700)' }}>{fmt(g.amount)}</td>
              <td style={{ fontSize: 11 }}>{gastoPaymentLabel(g.payment_type)}</td>
              <td style={{ fontSize: 11, color: 'var(--ink-500)' }}>{g.doc_number || '—'}</td>
              <td style={{ fontSize: 11, color: 'var(--ink-500)' }}>{fmtDate(g.gasto_date)}</td>
              <td style={{ fontSize: 11 }}>
                <div>{g.provider_name || '—'}</div>
                {g.notes && <div style={{ color: 'var(--ink-400)', fontStyle: 'italic', marginTop: 2 }}><AlertCircle size={10} style={{ display:'inline', verticalAlign: -1, marginRight: 3 }} />{g.notes}</div>}
              </td>
              {!isReadOnly && (
                <td style={{ textAlign: 'center' }}>
                  <button className="btn-icon" onClick={() => onEdit(g)}><Edit size={13} /></button>
                  <button className="btn-icon" style={{ color: 'var(--coral-500)' }} onClick={() => onDelete(g)}><Trash2 size={13} /></button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Gastos() {
  const { tenantId, isReadOnly } = useAuth();
  const [period, setPeriod] = useState(todayPeriod());
  const [gastos, setGastos] = useState([]);
  const [cajaChica, setCajaChica] = useState([]);
  const [fields, setFields] = useState([]);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [gastosCollapsed, setGastosCollapsed] = useState(false);
  const [cajaCollapsed, setCajaCollapsed] = useState(false);

  const load = async () => {
    if (!tenantId) return;
    const [g, cc, ef] = await Promise.all([
      gastosAPI.list(tenantId, { period, page_size: 9999 }),
      cajaChicaAPI.list(tenantId, { period, page_size: 9999 }),
      extraFieldsAPI.list(tenantId, { page_size: 9999 }),
    ]);
    setGastos(g.data.results || g.data);
    setCajaChica(cc.data.results || cc.data);
    setFields((ef.data.results || ef.data).filter(f => f.field_type === 'gastos' && f.enabled));
  };

  useEffect(() => { load(); }, [tenantId, period]);

  // Separar conciliados y no conciliados
  const gastosConciliados = gastos.filter(g => g.bank_reconciled);
  const gastosNoConciliados = gastos.filter(g => !g.bank_reconciled);
  const totalGastosConciliados = gastosConciliados.reduce((s, g) => s + parseFloat(g.amount || 0), 0);
  const totalGastosNoConciliados = gastosNoConciliados.reduce((s, g) => s + parseFloat(g.amount || 0), 0);
  // Total de gastos = solo conciliados
  const totalGastos = totalGastosConciliados;
  const totalCaja = cajaChica.reduce((s, c) => s + parseFloat(c.amount || 0), 0);
  const totalEgresos = totalGastos + totalCaja;

  const saveGasto = async () => {
    const amount = parseFloat(form.amount);
    if (isNaN(amount) || amount < 0) {
      toast.error('El monto debe ser un número válido mayor o igual a 0');
      return;
    }
    if (!form.field) {
      toast.error('Selecciona un concepto');
      return;
    }
    const payload = {
      field: form.field,
      amount,
      period,
      payment_type: form.payment_type || 'transferencia',
      doc_number: form.doc_number || form.invoice_folio || '',
      gasto_date: form.gasto_date || null,
      provider_name: form.provider_name || '',
      provider_rfc: form.provider_rfc || '',
      provider_invoice: form.provider_invoice || '',
      bank_reconciled: !!form.bank_reconciled,
      notes: form.notes || '',
    };
    try {
      if (form.id) await gastosAPI.update(tenantId, form.id, payload);
      else await gastosAPI.create(tenantId, payload);
      toast.success('Gasto guardado');
      setModal(null); load();
    } catch (e) {
      toast.error(e.response?.data?.amount?.[0] || e.response?.data?.field?.[0] || 'Error al guardar');
    }
  };

  const saveCaja = async () => {
    try {
      if (form.id) await cajaChicaAPI.update(tenantId, form.id, { ...form, period });
      else await cajaChicaAPI.create(tenantId, { ...form, period });
      toast.success('Registro guardado');
      setModal(null); load();
    } catch { toast.error('Error al guardar'); }
  };

  const handleDeleteGasto = async (g) => {
    if (window.confirm('¿Eliminar este gasto?')) {
      await gastosAPI.delete(tenantId, g.id);
      toast.success('Eliminado');
      load();
    }
  };

  return (
    <div className="content-fade">
      {/* ── Period nav + Action buttons ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <div className="period-nav">
          <button className="period-nav-btn" onClick={() => setPeriod(prevPeriod(period))}><ChevronLeft size={16} /></button>
          <input
            type="month"
            className="period-month-select"
            style={{ fontSize: 15, fontWeight: 700 }}
            value={period}
            onChange={e => setPeriod(e.target.value)}
          />
          <button className="period-nav-btn" onClick={() => setPeriod(nextPeriod(period))}><ChevronRight size={16} /></button>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {!isReadOnly && (
            <button className="btn btn-primary btn-sm" onClick={() => {
              setForm({ amount: '', field: '', payment_type: 'transferencia', doc_number: '', gasto_date: '', provider_name: '', provider_rfc: '', provider_invoice: '', bank_reconciled: false, notes: '' });
              setModal('gasto');
            }}>
              <Plus size={14} /> Nuevo Gasto
            </button>
          )}
          {!isReadOnly && (
            <button className="btn btn-outline btn-sm" style={{ borderColor: 'var(--purple-200, var(--sand-200))', color: 'var(--purple-700, var(--ink-700))' }}
              onClick={() => { setForm({ amount: '', description: '', payment_type: 'efectivo' }); setModal('caja'); }}>
              <Plus size={14} /> Caja Chica
            </button>
          )}
          <button className="btn btn-outline btn-sm" onClick={() => window.print()}>
            <Printer size={14} /> Imprimir
          </button>
        </div>
      </div>

      {/* ── Gastos Conciliados ── */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="card-head" style={{ cursor: 'pointer' }} onClick={() => setGastosCollapsed(!gastosCollapsed)}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {gastosCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
            <ShoppingBag size={16} />
            🏦 Gastos Conciliados — {periodLabel(period)}
          </h3>
          <span className="badge badge-teal">{gastosConciliados.length} reg. · {fmt(totalGastosConciliados)}</span>
        </div>
        {!gastosCollapsed && (
          gastosConciliados.length === 0 ? (
            <div className="card-body" style={{ textAlign: 'center', padding: '24px 20px', color: 'var(--ink-400)', fontSize: 13 }}>
              Sin gastos conciliados en este período
            </div>
          ) : (
            <>
              <GastosTable
                rows={gastosConciliados}
                isReadOnly={isReadOnly}
                onEdit={g => { setForm(g); setModal('gasto'); }}
                onDelete={handleDeleteGasto}
                showBadge={false}
              />
              <div style={{ padding: '10px 20px', background: 'var(--teal-50)', borderTop: '1px solid var(--teal-100)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 800, fontSize: 13, color: 'var(--teal-700)' }}>TOTAL GASTOS CONCILIADOS</span>
                <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--teal-700)' }}>{fmt(totalGastosConciliados)}</span>
              </div>
            </>
          )
        )}
      </div>

      {/* ── Gastos NO Conciliados (en tránsito) ── */}
      <div className="card" style={{ marginBottom: 16, border: '1.5px solid var(--amber-200)' }}>
        <div className="card-head" style={{ background: 'var(--amber-50)', cursor: 'pointer' }}
          onClick={() => setGastosCollapsed(!gastosCollapsed)}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--amber-700)' }}>
            {gastosCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
            <ShoppingBag size={16} />
            ⏳ Gastos en Tránsito (No Conciliados) — {periodLabel(period)}
          </h3>
          <span className="badge badge-amber">{gastosNoConciliados.length} reg. · {fmt(totalGastosNoConciliados)}</span>
        </div>
        {!gastosCollapsed && (
          gastosNoConciliados.length === 0 ? (
            <div className="card-body" style={{ textAlign: 'center', padding: '24px 20px', color: 'var(--ink-400)', fontSize: 13 }}>
              Sin gastos pendientes de conciliación
            </div>
          ) : (
            <>
              <GastosTable
                rows={gastosNoConciliados}
                isReadOnly={isReadOnly}
                onEdit={g => { setForm(g); setModal('gasto'); }}
                onDelete={handleDeleteGasto}
                showBadge={false}
              />
              <div style={{ padding: '10px 20px', background: 'var(--amber-50)', borderTop: '1px solid var(--amber-100)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 800, fontSize: 13, color: 'var(--amber-700)' }}>
                  TOTAL EN TRÁNSITO
                  <span style={{ fontWeight: 400, fontSize: 11, marginLeft: 8, color: 'var(--ink-400)' }}>(no incluido en total de egresos)</span>
                </span>
                <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--amber-700)' }}>{fmt(totalGastosNoConciliados)}</span>
              </div>
            </>
          )
        )}
      </div>

      {/* ── Caja Chica Collapsible Card (purple-themed) ── */}
      <div className="card" style={{ marginTop: 4, border: '1.5px solid var(--purple-200, #DDD6FE)' }}>
        <div className="card-head" style={{ background: 'var(--purple-50)', cursor: 'pointer' }}
          onClick={() => setCajaCollapsed(!cajaCollapsed)}>
          <h3 style={{ color: 'var(--purple-700, #6D28D9)', display: 'flex', alignItems: 'center', gap: 8 }}>
            {cajaCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
            <DollarSign size={16} />
            Caja Chica — {periodLabel(period)}
          </h3>
          <span className="badge" style={{ background: 'var(--purple-100, #EDE9FE)', color: 'var(--purple-700, #6D28D9)' }}>
            {cajaChica.length} reg. · {fmt(totalCaja)}
          </span>
        </div>
        {!cajaCollapsed && (
          cajaChica.length === 0 ? (
            <div className="card-body" style={{ textAlign: 'center', padding: 24, color: 'var(--ink-400)', fontSize: 13 }}>
              Sin registros de caja chica
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr style={{ background: 'var(--purple-50)' }}>
                    <th>Descripción</th>
                    <th style={{ textAlign: 'right' }}>Monto</th>
                    <th>Tipo</th>
                    <th>Fecha</th>
                    {!isReadOnly && <th style={{ width: 70 }}>Acc.</th>}
                  </tr>
                </thead>
                <tbody>
                  {cajaChica.map(c => (
                    <tr key={c.id} style={{ borderBottom: '1px solid var(--sand-100)' }}>
                      <td style={{ fontWeight: 600, color: 'var(--purple-700, #6D28D9)', fontSize: 13 }}>{c.description}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, fontSize: 13, color: 'var(--purple-700, #6D28D9)' }}>{fmt(c.amount)}</td>
                      <td style={{ fontSize: 11 }}>{PAYMENT_TYPES[c.payment_type]?.short || c.payment_type || '—'}</td>
                      <td style={{ fontSize: 11, color: 'var(--ink-500)' }}>{fmtDate(c.date)}</td>
                      {!isReadOnly && (
                        <td style={{ textAlign: 'center' }}>
                          <button className="btn-icon" onClick={() => { setForm(c); setModal('caja'); }}><Edit size={13} /></button>
                          <button className="btn-icon" style={{ color: 'var(--coral-500)' }} onClick={async () => {
                            if (window.confirm('¿Eliminar?')) { await cajaChicaAPI.delete(tenantId, c.id); toast.success('Eliminado'); load(); }
                          }}><Trash2 size={13} /></button>
                        </td>
                      )}
                    </tr>
                  ))}
                  <tr style={{ background: 'var(--purple-50)' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 800, color: 'var(--purple-800, #5B21B6)' }}>TOTAL CAJA CHICA</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: 'var(--purple-800, #5B21B6)', fontSize: 15 }}>{fmt(totalCaja)}</td>
                    <td colSpan={!isReadOnly ? 3 : 2}></td>
                  </tr>
                </tbody>
              </table>
            </div>
          )
        )}
      </div>

      {/* ── Total Egresos Banner ── */}
      <div style={{
        marginTop: 16, padding: 16,
        background: 'var(--amber-50)',
        border: '2px solid var(--amber-200, #FDE68A)',
        borderRadius: 'var(--radius-md)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--amber-700)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <ShoppingBag size={16} /> Total Egresos Conciliados {periodLabel(period)}
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 4 }}>
            Gastos conciliados: {fmt(totalGastosConciliados)}
            {totalCaja > 0 && ` + Caja Chica: ${fmt(totalCaja)}`}
            {totalGastosNoConciliados > 0 && (
              <span style={{ color: 'var(--amber-600)', marginLeft: 8 }}>
                · En tránsito (no incluido): {fmt(totalGastosNoConciliados)}
              </span>
            )}
          </div>
        </div>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 600, color: 'var(--amber-700)' }}>
          {fmt(totalEgresos)}
        </span>
      </div>

      {/* ── Gasto Modal ── */}
      {modal === 'gasto' && (
        <div className="modal-bg open" onClick={() => setModal(null)}>
          <div className="modal lg" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3><ShoppingBag size={16} style={{ display: 'inline', verticalAlign: -3, marginRight: 8 }} />{form.id ? 'Editar' : 'Nuevo'} Registro de Gasto</h3>
              <button className="modal-close" onClick={() => setModal(null)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="field">
                  <label className="field-label">Concepto <span style={{ color: 'var(--coral-500)' }}>*</span></label>
                  <select className="field-select" value={form.field || ''} onChange={e => setForm({ ...form, field: e.target.value })}>
                    <option value="">Seleccionar...</option>
                    {fields.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label className="field-label">Monto <span style={{ color: 'var(--coral-500)' }}>*</span></label>
                  <input type="number" className="field-input" step="0.01" min="0.01" placeholder="0.00" value={form.amount ?? ''} onChange={e => setForm({ ...form, amount: e.target.value })} />
                </div>
                <div className="field">
                  <label className="field-label">Tipo de Gasto</label>
                  <select className="field-select" value={form.payment_type || 'transferencia'} onChange={e => setForm({ ...form, payment_type: e.target.value })}>
                    {GASTO_PAYMENT_TYPES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label className="field-label">No. Documento</label>
                  <input className="field-input" placeholder="No. cheque, referencia..." value={form.doc_number || form.invoice_folio || ''} onChange={e => setForm({ ...form, doc_number: e.target.value })} />
                </div>
                <div className="field">
                  <label className="field-label">Fecha de Gasto</label>
                  <input type="date" className="field-input" value={form.gasto_date || ''} onChange={e => setForm({ ...form, gasto_date: e.target.value })} />
                </div>
                <div className="field">
                  <label className="field-label">Conciliado Banco</label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, cursor: 'pointer' }}>
                    <input type="checkbox" checked={!!form.bank_reconciled} onChange={e => setForm({ ...form, bank_reconciled: e.target.checked })} />
                    <span style={{ fontSize: 12, color: 'var(--ink-500)' }}>{form.bank_reconciled ? '🏦 Conciliado' : 'Sin conciliar'}</span>
                  </label>
                </div>
              </div>

              {/* Notas */}
              <div style={{ marginTop: 12 }}>
                <label className="field-label">Notas</label>
                <textarea
                  className="field-input"
                  rows={2}
                  placeholder="Observaciones, descripción adicional del gasto..."
                  value={form.notes || ''}
                  onChange={e => setForm({ ...form, notes: e.target.value })}
                  style={{ resize: 'vertical', minHeight: 56 }}
                />
              </div>

              <div style={{ marginTop: 12, fontSize: 11, fontWeight: 700, color: 'var(--ink-500)', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid var(--sand-100)', paddingBottom: 6 }}>Proveedor</div>
              <div className="form-grid" style={{ marginTop: 8 }}>
                <div className="field">
                  <label className="field-label">Nombre</label>
                  <input className="field-input" value={form.provider_name || ''} onChange={e => setForm({ ...form, provider_name: e.target.value })} placeholder="Nombre del proveedor" />
                </div>
                <div className="field">
                  <label className="field-label">RFC</label>
                  <input className="field-input" style={{ fontFamily: 'monospace' }} value={form.provider_rfc || ''} onChange={e => setForm({ ...form, provider_rfc: e.target.value })} placeholder="RFC del proveedor" />
                </div>
                <div className="field">
                  <label className="field-label">No. Factura</label>
                  <input className="field-input" value={form.provider_invoice || ''} onChange={e => setForm({ ...form, provider_invoice: e.target.value })} placeholder="Número de factura" />
                </div>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={saveGasto}><Check size={14} /> {form.id ? 'Guardar' : 'Registrar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Caja Chica Modal (sin Transferencia) ── */}
      {modal === 'caja' && (
        <div className="modal-bg open" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3>{form.id ? 'Editar' : 'Nuevo'} Registro de Caja Chica</h3>
              <button className="modal-close" onClick={() => setModal(null)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="field field-full">
                  <label className="field-label">Descripción</label>
                  <input className="field-input" value={form.description || ''} onChange={e => setForm({ ...form, description: e.target.value })} />
                </div>
                <div className="field">
                  <label className="field-label">Monto</label>
                  <input type="number" className="field-input" step="0.01" min="0" value={form.amount || ''} onChange={e => setForm({ ...form, amount: e.target.value })} />
                </div>
                <div className="field">
                  <label className="field-label">Forma de Pago</label>
                  <select className="field-select" value={form.payment_type || 'efectivo'} onChange={e => setForm({ ...form, payment_type: e.target.value })}>
                    {CAJA_PAYMENT_TYPES.map(p => (
                      <option key={p.value} value={p.value}>{p.short || p.label}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label className="field-label">Fecha</label>
                  <input type="date" className="field-input" value={form.date || ''} onChange={e => setForm({ ...form, date: e.target.value })} />
                </div>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-outline" onClick={() => setModal(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={saveCaja}>Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
