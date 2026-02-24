import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { gastosAPI, cajaChicaAPI, extraFieldsAPI } from '../api/client';
import { todayPeriod, periodLabel, prevPeriod, nextPeriod, fmtCurrency, fmtDate, PAYMENT_TYPES } from '../utils/helpers';
import { ChevronLeft, ChevronRight, Plus, Edit, Trash2, X, TrendingDown, Wallet, BarChart3 } from 'lucide-react';
import toast from 'react-hot-toast';

function fmt(n) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n ?? 0);
}

export default function Gastos() {
  const { tenantId, isReadOnly } = useAuth();
  const [period, setPeriod] = useState(todayPeriod());
  const [gastos, setGastos] = useState([]);
  const [cajaChica, setCajaChica] = useState([]);
  const [fields, setFields] = useState([]);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});

  const load = async () => {
    if (!tenantId) return;
    const [g, cc, ef] = await Promise.all([
      gastosAPI.list(tenantId, { period }),
      cajaChicaAPI.list(tenantId, { period }),
      extraFieldsAPI.list(tenantId),
    ]);
    setGastos(g.data.results || g.data);
    setCajaChica(cc.data.results || cc.data);
    setFields((ef.data.results || ef.data).filter(f => f.field_type === 'gastos' && f.enabled));
  };

  useEffect(() => { load(); }, [tenantId, period]);

  const totalGastos = gastos.reduce((s, g) => s + parseFloat(g.amount || 0), 0);
  const totalCaja = cajaChica.reduce((s, c) => s + parseFloat(c.amount || 0), 0);
  const totalEgresos = totalGastos + totalCaja;

  const saveGasto = async () => {
    try {
      if (form.id) await gastosAPI.update(tenantId, form.id, { ...form, period });
      else await gastosAPI.create(tenantId, { ...form, period });
      toast.success('Gasto guardado');
      setModal(null); load();
    } catch { toast.error('Error al guardar'); }
  };

  const saveCaja = async () => {
    try {
      if (form.id) await cajaChicaAPI.update(tenantId, form.id, { ...form, period });
      else await cajaChicaAPI.create(tenantId, { ...form, period });
      toast.success('Registro guardado');
      setModal(null); load();
    } catch { toast.error('Error al guardar'); }
  };

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1200, margin: '0 auto' }} className="content-fade">
      {/* ── Header ── */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 500, marginBottom: 4 }}>
          Gastos<span className="brand-dot">.</span>
        </h1>
        <p style={{ color: 'var(--ink-400)', fontSize: 14 }}>{periodLabel(period)}</p>
      </div>

      {/* ── Period nav ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <div className="period-nav">
          <button className="period-nav-btn" onClick={() => setPeriod(prevPeriod(period))}><ChevronLeft size={16} /></button>
          <div className="period-label" style={{ fontSize: 14 }}>{periodLabel(period)}</div>
          <button className="period-nav-btn" onClick={() => setPeriod(nextPeriod(period))}><ChevronRight size={16} /></button>
        </div>
      </div>

      {/* ── Stat bar ── */}
      <div className="gasto-stat-bar">
        <div className="cob-stat">
          <div className="cob-stat-icon stat-icon coral"><TrendingDown size={16} /></div>
          <div>
            <div className="cob-stat-label">Gastos</div>
            <div className="cob-stat-value" style={{ color: 'var(--coral-500)' }}>{fmt(totalGastos)}</div>
          </div>
        </div>
        <div className="cob-stat">
          <div className="cob-stat-icon stat-icon amber"><Wallet size={16} /></div>
          <div>
            <div className="cob-stat-label">Caja Chica</div>
            <div className="cob-stat-value" style={{ color: 'var(--amber-600)' }}>{fmt(totalCaja)}</div>
          </div>
        </div>
        <div className="cob-stat">
          <div className="cob-stat-icon stat-icon ink"><BarChart3 size={16} /></div>
          <div>
            <div className="cob-stat-label">Total Egresos</div>
            <div className="cob-stat-value" style={{ color: 'var(--ink-700)' }}>{fmt(totalEgresos)}</div>
          </div>
        </div>
      </div>

      {/* ── Gastos Table ── */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-head">
          <h3>Gastos del Período</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="badge badge-coral">{fmt(totalGastos)}</span>
            {!isReadOnly && (
              <button className="btn btn-coral btn-sm" onClick={() => { setForm({ amount: '', field: '', payment_type: 'transferencia' }); setModal('gasto'); }}>
                <Plus size={14} /> Registrar Gasto
              </button>
            )}
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Concepto</th>
                <th style={{ textAlign: 'right' }}>Monto</th>
                <th>Forma de Pago</th>
                <th>Proveedor</th>
                <th>RFC</th>
                <th>Factura</th>
                <th>Fecha</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {gastos.map(g => (
                <tr key={g.id}>
                  <td style={{ fontWeight: 600, fontSize: 13 }}>{g.field_label || '—'}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, fontSize: 13, color: 'var(--coral-500)' }}>{fmt(g.amount)}</td>
                  <td style={{ fontSize: 12 }}>{PAYMENT_TYPES[g.payment_type]?.short || g.payment_type || '—'}</td>
                  <td style={{ fontSize: 12 }}>{g.provider_name || '—'}</td>
                  <td style={{ fontSize: 12, fontFamily: 'monospace' }}>{g.provider_rfc || '—'}</td>
                  <td style={{ fontSize: 12 }}>{g.invoice_folio || '—'}</td>
                  <td style={{ fontSize: 12 }}>{fmtDate(g.gasto_date)}</td>
                  <td>
                    {!isReadOnly && (
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn-icon" onClick={() => { setForm(g); setModal('gasto'); }}><Edit size={12} /></button>
                        <button className="btn-icon" style={{ color: 'var(--coral-500)' }} onClick={async () => {
                          if (window.confirm('¿Eliminar este gasto?')) { await gastosAPI.delete(tenantId, g.id); toast.success('Eliminado'); load(); }
                        }}><Trash2 size={12} /></button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {gastos.length === 0 && (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--ink-300)', fontSize: 14 }}>Sin gastos registrados este período</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Caja Chica Table ── */}
      <div className="card">
        <div className="card-head">
          <h3>Caja Chica</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="badge badge-amber">{fmt(totalCaja)}</span>
            {!isReadOnly && (
              <button className="btn btn-primary btn-sm" onClick={() => { setForm({ amount: '', description: '', payment_type: 'efectivo' }); setModal('caja'); }}>
                <Plus size={14} /> Registrar
              </button>
            )}
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Descripción</th>
                <th style={{ textAlign: 'right' }}>Monto</th>
                <th>Forma de Pago</th>
                <th>Fecha</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {cajaChica.map(c => (
                <tr key={c.id}>
                  <td style={{ fontSize: 13 }}>{c.description}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, fontSize: 13, color: 'var(--amber-600)' }}>{fmt(c.amount)}</td>
                  <td style={{ fontSize: 12 }}>{PAYMENT_TYPES[c.payment_type]?.short || c.payment_type || '—'}</td>
                  <td style={{ fontSize: 12 }}>{fmtDate(c.date)}</td>
                  <td>
                    {!isReadOnly && (
                      <button className="btn-icon" style={{ color: 'var(--coral-500)' }} onClick={async () => {
                        if (window.confirm('¿Eliminar?')) { await cajaChicaAPI.delete(tenantId, c.id); toast.success('Eliminado'); load(); }
                      }}><Trash2 size={12} /></button>
                    )}
                  </td>
                </tr>
              ))}
              {cajaChica.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--ink-300)', fontSize: 14 }}>Sin registros</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Gasto Modal ── */}
      {modal === 'gasto' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{form.id ? 'Editar' : 'Nuevo'} Gasto</h3>
              <button className="btn-icon" onClick={() => setModal(null)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="field field-full">
                  <label className="field-label">Concepto</label>
                  <select className="field-select" value={form.field || ''} onChange={e => setForm({ ...form, field: e.target.value })}>
                    <option value="">Seleccionar...</option>
                    {fields.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label className="field-label">Monto</label>
                  <input type="number" className="field-input" value={form.amount || ''} onChange={e => setForm({ ...form, amount: e.target.value })} />
                </div>
                <div className="field">
                  <label className="field-label">Forma de Pago</label>
                  <select className="field-select" value={form.payment_type || ''} onChange={e => setForm({ ...form, payment_type: e.target.value })}>
                    {Object.entries(PAYMENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v.short || v.label}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label className="field-label">Proveedor</label>
                  <input className="field-input" value={form.provider_name || ''} onChange={e => setForm({ ...form, provider_name: e.target.value })} />
                </div>
                <div className="field">
                  <label className="field-label">RFC Proveedor</label>
                  <input className="field-input" style={{ fontFamily: 'monospace' }} value={form.provider_rfc || ''} onChange={e => setForm({ ...form, provider_rfc: e.target.value })} />
                </div>
                <div className="field">
                  <label className="field-label">Folio Factura</label>
                  <input className="field-input" value={form.invoice_folio || ''} onChange={e => setForm({ ...form, invoice_folio: e.target.value })} />
                </div>
                <div className="field">
                  <label className="field-label">Fecha</label>
                  <input type="date" className="field-input" value={form.gasto_date || ''} onChange={e => setForm({ ...form, gasto_date: e.target.value })} />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setModal(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={saveGasto}>Guardar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Caja Chica Modal ── */}
      {modal === 'caja' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{form.id ? 'Editar' : 'Nuevo'} Registro de Caja Chica</h3>
              <button className="btn-icon" onClick={() => setModal(null)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="field field-full">
                  <label className="field-label">Descripción</label>
                  <input className="field-input" value={form.description || ''} onChange={e => setForm({ ...form, description: e.target.value })} />
                </div>
                <div className="field">
                  <label className="field-label">Monto</label>
                  <input type="number" className="field-input" value={form.amount || ''} onChange={e => setForm({ ...form, amount: e.target.value })} />
                </div>
                <div className="field">
                  <label className="field-label">Forma de Pago</label>
                  <select className="field-select" value={form.payment_type || ''} onChange={e => setForm({ ...form, payment_type: e.target.value })}>
                    {Object.entries(PAYMENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v.short || v.label}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label className="field-label">Fecha</label>
                  <input type="date" className="field-input" value={form.date || ''} onChange={e => setForm({ ...form, date: e.target.value })} />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setModal(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={saveCaja}>Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
