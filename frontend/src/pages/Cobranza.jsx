import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { paymentsAPI, unitsAPI, extraFieldsAPI } from '../api/client';
import { todayPeriod, periodLabel, prevPeriod, nextPeriod, fmtCurrency, statusClass, statusLabel, PAYMENT_TYPES, fmtDate } from '../utils/helpers';
import { ChevronLeft, ChevronRight, Search, Receipt, X } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Cobranza() {
  const { tenantId, isReadOnly } = useAuth();
  const [period, setPeriod] = useState(todayPeriod());
  const [units, setUnits] = useState([]);
  const [payments, setPayments] = useState([]);
  const [extraFields, setExtraFields] = useState([]);
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(1);
  const [showCapture, setShowCapture] = useState(null);
  const [captureForm, setCaptureForm] = useState({});
  const perPage = 25;

  const load = async () => {
    if (!tenantId) return;
    try {
      const [uRes, pRes, efRes] = await Promise.all([
        unitsAPI.list(tenantId),
        paymentsAPI.list(tenantId, { period }),
        extraFieldsAPI.list(tenantId),
      ]);
      setUnits(uRes.data.results || uRes.data);
      setPayments(pRes.data.results || pRes.data);
      setExtraFields((efRes.data.results || efRes.data).filter(f => f.enabled));
    } catch (err) { console.error(err); }
  };

  useEffect(() => { load(); }, [tenantId, period]);

  const paymentMap = useMemo(() => {
    const m = {};
    payments.forEach(p => { m[p.unit] = p; });
    return m;
  }, [payments]);

  const filtered = useMemo(() => {
    if (!filter) return units;
    const q = filter.toLowerCase();
    return units.filter(u =>
      u.unit_id_code.toLowerCase().includes(q) ||
      u.unit_name.toLowerCase().includes(q) ||
      u.responsible_name?.toLowerCase().includes(q)
    );
  }, [units, filter]);

  const totalPages = Math.ceil(filtered.length / perPage);
  const paged = filtered.slice((page - 1) * perPage, page * perPage);

  const openCapture = (unit) => {
    const existing = paymentMap[unit.id];
    const fp = {};
    if (existing?.field_payments) {
      existing.field_payments.forEach(f => {
        fp[f.field_key] = { received: f.received };
      });
    }
    setCaptureForm({
      unit_id: unit.id,
      period,
      payment_type: existing?.payment_type || '',
      payment_date: existing?.payment_date || '',
      notes: existing?.notes || '',
      field_payments: {
        maintenance: { received: fp.maintenance?.received || '' },
        ...Object.fromEntries(extraFields.map(ef => [ef.id, { received: fp[ef.id]?.received || '' }])),
      },
    });
    setShowCapture(unit);
  };

  const handleCapture = async () => {
    if (!captureForm.payment_type) { toast.error('La forma de pago es obligatoria'); return; }
    try {
      await paymentsAPI.capture(tenantId, captureForm);
      toast.success('Pago registrado');
      setShowCapture(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al registrar pago');
    }
  };

  return (
    <div className="space-y-6">
      {/* Period + filters */}
      <div className="flex flex-wrap items-center gap-4">
        <button className="btn btn-outline btn-sm" onClick={() => { setPeriod(prevPeriod(period)); setPage(1); }}>
          <ChevronLeft size={16} />
        </button>
        <span className="text-lg font-bold text-ink-800">{periodLabel(period)}</span>
        <button className="btn btn-outline btn-sm" onClick={() => { setPeriod(nextPeriod(period)); setPage(1); }}>
          <ChevronRight size={16} />
        </button>
        <div className="flex-1 min-w-[200px] flex items-center gap-2">
          <Search size={14} className="text-ink-400" />
          <input className="field-input" placeholder="Filtrar por unidad, ID o responsable..."
            value={filter} onChange={e => { setFilter(e.target.value); setPage(1); }} />
        </div>
        <span className="text-xs text-ink-400">{filtered.length} unidades</span>
      </div>

      {/* Table */}
      <div className="card">
        <div className="card-head">
          <h3 className="text-sm font-bold">Registro de Pagos — {periodLabel(period)}</h3>
          <span className="badge badge-gray">{units.length} unidades</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Unidad</th>
                <th>Responsable</th>
                <th className="text-right">Mantenimiento</th>
                {extraFields.filter(f => f.required).map(f => (
                  <th key={f.id} className="text-right">{f.label} ★</th>
                ))}
                <th className="text-right">Recaudo</th>
                <th>Estado</th>
                <th>Forma de Pago</th>
                <th>Fecha</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {paged.map(u => {
                const pay = paymentMap[u.id];
                const st = pay?.status || 'pendiente';
                return (
                  <tr key={u.id} className={st === 'pagado' ? 'bg-teal-50/30' : ''}>
                    <td>
                      <span className="font-mono font-bold text-teal-600 bg-teal-50 px-2 py-0.5 rounded text-xs mr-2">
                        {u.unit_id_code}
                      </span>
                      <span className="font-semibold text-xs">{u.unit_name}</span>
                    </td>
                    <td className="text-xs">{u.responsible_name}</td>
                    <td className="text-right font-semibold text-xs">
                      {fmtCurrency(pay?.field_payments?.find(f => f.field_key === 'maintenance')?.received || 0)}
                    </td>
                    {extraFields.filter(f => f.required).map(ef => {
                      const fp = pay?.field_payments?.find(f => f.field_key === ef.id);
                      return <td key={ef.id} className="text-right text-xs">{fmtCurrency(fp?.received || 0)}</td>;
                    })}
                    <td className="text-right font-bold text-xs text-teal-700">
                      {pay ? fmtCurrency(pay.field_payments?.reduce((s, f) => s + parseFloat(f.received || 0), 0)) : '—'}
                    </td>
                    <td><span className={`badge ${statusClass(st)}`}>{statusLabel(st)}</span></td>
                    <td className="text-xs">{pay?.payment_type ? PAYMENT_TYPES[pay.payment_type]?.label : '—'}</td>
                    <td className="text-xs">{fmtDate(pay?.payment_date)}</td>
                    <td>
                      {!isReadOnly && (
                        <button className="btn btn-primary btn-sm" onClick={() => openCapture(u)}>
                          <Receipt size={12} /> Capturar
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button className="btn btn-outline btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>‹</button>
          <span className="text-sm text-ink-500">Pág. {page} de {totalPages}</span>
          <button className="btn btn-outline btn-sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>›</button>
        </div>
      )}

      {/* Capture Modal */}
      {showCapture && (
        <div className="modal-overlay" onClick={() => setShowCapture(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="text-lg font-bold">
                Capturar Pago — {showCapture.unit_id_code} {showCapture.unit_name}
              </h3>
              <button className="btn-icon" onClick={() => setShowCapture(null)}><X size={18} /></button>
            </div>
            <div className="modal-body space-y-4">
              <div>
                <label className="field-label">Forma de Pago *</label>
                <select className="field-select" value={captureForm.payment_type}
                  onChange={e => setCaptureForm({...captureForm, payment_type: e.target.value})}>
                  <option value="">Seleccionar...</option>
                  {Object.entries(PAYMENT_TYPES).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="field-label">Fecha de Pago</label>
                <input type="date" className="field-input" value={captureForm.payment_date}
                  onChange={e => setCaptureForm({...captureForm, payment_date: e.target.value})} />
              </div>
              <div>
                <label className="field-label">Mantenimiento</label>
                <input type="number" className="field-input" placeholder="0.00"
                  value={captureForm.field_payments?.maintenance?.received || ''}
                  onChange={e => setCaptureForm({
                    ...captureForm,
                    field_payments: {
                      ...captureForm.field_payments,
                      maintenance: { received: e.target.value }
                    }
                  })} />
              </div>
              {extraFields.map(ef => (
                <div key={ef.id}>
                  <label className="field-label">{ef.label} {ef.required && '★'}</label>
                  <input type="number" className="field-input" placeholder="0.00"
                    value={captureForm.field_payments?.[ef.id]?.received || ''}
                    onChange={e => setCaptureForm({
                      ...captureForm,
                      field_payments: {
                        ...captureForm.field_payments,
                        [ef.id]: { received: e.target.value }
                      }
                    })} />
                </div>
              ))}
              <div>
                <label className="field-label">Notas</label>
                <input className="field-input" value={captureForm.notes}
                  onChange={e => setCaptureForm({...captureForm, notes: e.target.value})} />
              </div>
              <div className="flex justify-end gap-3">
                <button className="btn btn-outline" onClick={() => setShowCapture(null)}>Cancelar</button>
                <button className="btn btn-primary" onClick={handleCapture}>Guardar Pago</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
