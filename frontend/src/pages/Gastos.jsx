import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { gastosAPI, cajaChicaAPI, extraFieldsAPI } from '../api/client';
import { todayPeriod, periodLabel, prevPeriod, nextPeriod, fmtCurrency, fmtDate, PAYMENT_TYPES } from '../utils/helpers';
import { ChevronLeft, ChevronRight, Plus, Edit, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Gastos() {
  const { tenantId, isReadOnly } = useAuth();
  const [period, setPeriod] = useState(todayPeriod());
  const [gastos, setGastos] = useState([]);
  const [cajaChica, setCajaChica] = useState([]);
  const [fields, setFields] = useState([]);
  const [modal, setModal] = useState(null); // 'gasto' | 'caja'
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

  const totalGastos = gastos.reduce((s, g) => s + parseFloat(g.amount), 0);
  const totalCaja = cajaChica.reduce((s, c) => s + parseFloat(c.amount), 0);

  const saveGasto = async () => {
    try {
      if (form.id) await gastosAPI.update(tenantId, form.id, { ...form, period });
      else await gastosAPI.create(tenantId, { ...form, period });
      toast.success('Gasto guardado');
      setModal(null); load();
    } catch { toast.error('Error'); }
  };

  const saveCaja = async () => {
    try {
      if (form.id) await cajaChicaAPI.update(tenantId, form.id, { ...form, period });
      else await cajaChicaAPI.create(tenantId, { ...form, period });
      toast.success('Registro guardado');
      setModal(null); load();
    } catch { toast.error('Error'); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <button className="btn btn-outline btn-sm" onClick={() => setPeriod(prevPeriod(period))}><ChevronLeft size={16} /></button>
        <span className="text-lg font-bold text-ink-800">{periodLabel(period)}</span>
        <button className="btn btn-outline btn-sm" onClick={() => setPeriod(nextPeriod(period))}><ChevronRight size={16} /></button>
      </div>

      {/* Gastos Table */}
      <div className="card">
        <div className="card-head">
          <h3 className="text-sm font-bold">Gastos del Periodo</h3>
          <span className="badge badge-coral">{fmtCurrency(totalGastos)}</span>
          {!isReadOnly && (
            <button className="btn btn-primary btn-sm ml-auto" onClick={() => { setForm({ amount: '', field: '', payment_type: 'transferencia' }); setModal('gasto'); }}>
              <Plus size={14} /> Registrar Gasto
            </button>
          )}
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Concepto</th><th className="text-right">Monto</th><th>Forma</th><th>Proveedor</th><th>Fecha</th><th>Acciones</th></tr></thead>
            <tbody>
              {gastos.map(g => (
                <tr key={g.id}>
                  <td className="font-semibold text-xs">{g.field_label || '—'}</td>
                  <td className="text-right font-bold text-xs text-coral-600">{fmtCurrency(g.amount)}</td>
                  <td className="text-xs">{PAYMENT_TYPES[g.payment_type]?.short || g.payment_type}</td>
                  <td className="text-xs">{g.provider_name || '—'}</td>
                  <td className="text-xs">{fmtDate(g.gasto_date)}</td>
                  <td>
                    {!isReadOnly && (
                      <div className="flex gap-1">
                        <button className="btn-icon" onClick={() => { setForm(g); setModal('gasto'); }}><Edit size={12} /></button>
                        <button className="btn-icon text-coral-500" onClick={async () => {
                          if (window.confirm('¿Eliminar?')) { await gastosAPI.delete(tenantId, g.id); toast.success('Eliminado'); load(); }
                        }}><Trash2 size={12} /></button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {gastos.length === 0 && <tr><td colSpan={6} className="text-center text-ink-400 py-8">Sin gastos registrados</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Caja Chica Table */}
      <div className="card">
        <div className="card-head">
          <h3 className="text-sm font-bold">Caja Chica</h3>
          <span className="badge badge-amber">{fmtCurrency(totalCaja)}</span>
          {!isReadOnly && (
            <button className="btn btn-primary btn-sm ml-auto" onClick={() => { setForm({ amount: '', description: '', payment_type: 'efectivo' }); setModal('caja'); }}>
              <Plus size={14} /> Registrar
            </button>
          )}
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Descripción</th><th className="text-right">Monto</th><th>Forma</th><th>Fecha</th><th>Acciones</th></tr></thead>
            <tbody>
              {cajaChica.map(c => (
                <tr key={c.id}>
                  <td className="text-xs">{c.description}</td>
                  <td className="text-right font-bold text-xs">{fmtCurrency(c.amount)}</td>
                  <td className="text-xs">{PAYMENT_TYPES[c.payment_type]?.short || c.payment_type}</td>
                  <td className="text-xs">{fmtDate(c.date)}</td>
                  <td>
                    {!isReadOnly && (
                      <button className="btn-icon text-coral-500" onClick={async () => {
                        if (window.confirm('¿Eliminar?')) { await cajaChicaAPI.delete(tenantId, c.id); toast.success('Eliminado'); load(); }
                      }}><Trash2 size={12} /></button>
                    )}
                  </td>
                </tr>
              ))}
              {cajaChica.length === 0 && <tr><td colSpan={5} className="text-center text-ink-400 py-8">Sin registros</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      {modal === 'gasto' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h3 className="text-lg font-bold">{form.id ? 'Editar' : 'Nuevo'} Gasto</h3><button className="btn-icon" onClick={() => setModal(null)}><X size={18} /></button></div>
            <div className="modal-body space-y-4">
              <div><label className="field-label">Concepto</label><select className="field-select" value={form.field || ''} onChange={e => setForm({...form, field: e.target.value})}><option value="">Seleccionar...</option>{fields.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}</select></div>
              <div><label className="field-label">Monto</label><input type="number" className="field-input" value={form.amount || ''} onChange={e => setForm({...form, amount: e.target.value})} /></div>
              <div><label className="field-label">Forma de Pago</label><select className="field-select" value={form.payment_type || ''} onChange={e => setForm({...form, payment_type: e.target.value})}>{Object.entries(PAYMENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v.short}</option>)}</select></div>
              <div><label className="field-label">Proveedor</label><input className="field-input" value={form.provider_name || ''} onChange={e => setForm({...form, provider_name: e.target.value})} /></div>
              <div><label className="field-label">Fecha</label><input type="date" className="field-input" value={form.gasto_date || ''} onChange={e => setForm({...form, gasto_date: e.target.value})} /></div>
              <div className="flex justify-end gap-3"><button className="btn btn-outline" onClick={() => setModal(null)}>Cancelar</button><button className="btn btn-primary" onClick={saveGasto}>Guardar</button></div>
            </div>
          </div>
        </div>
      )}

      {modal === 'caja' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h3 className="text-lg font-bold">{form.id ? 'Editar' : 'Nuevo'} Caja Chica</h3><button className="btn-icon" onClick={() => setModal(null)}><X size={18} /></button></div>
            <div className="modal-body space-y-4">
              <div><label className="field-label">Descripción</label><input className="field-input" value={form.description || ''} onChange={e => setForm({...form, description: e.target.value})} /></div>
              <div><label className="field-label">Monto</label><input type="number" className="field-input" value={form.amount || ''} onChange={e => setForm({...form, amount: e.target.value})} /></div>
              <div><label className="field-label">Forma de Pago</label><select className="field-select" value={form.payment_type || ''} onChange={e => setForm({...form, payment_type: e.target.value})}>{Object.entries(PAYMENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v.short}</option>)}</select></div>
              <div><label className="field-label">Fecha</label><input type="date" className="field-input" value={form.date || ''} onChange={e => setForm({...form, date: e.target.value})} /></div>
              <div className="flex justify-end gap-3"><button className="btn btn-outline" onClick={() => setModal(null)}>Cancelar</button><button className="btn btn-primary" onClick={saveCaja}>Guardar</button></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
