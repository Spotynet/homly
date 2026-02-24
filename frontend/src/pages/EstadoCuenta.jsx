import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { unitsAPI, reportsAPI } from '../api/client';
import { fmtCurrency, statusClass, statusLabel, fmtDate, todayPeriod, periodLabel } from '../utils/helpers';
import { FileText, Printer } from 'lucide-react';

export default function EstadoCuenta() {
  const { tenantId, isVecino } = useAuth();
  const [units, setUnits] = useState([]);
  const [selectedUnit, setSelectedUnit] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!tenantId) return;
    unitsAPI.list(tenantId).then(r => {
      const list = r.data.results || r.data;
      setUnits(list);
    });
  }, [tenantId]);

  useEffect(() => {
    if (!selectedUnit || !tenantId) return;
    setLoading(true);
    reportsAPI.estadoCuenta(tenantId, { unit_id: selectedUnit })
      .then(r => setData(r.data))
      .finally(() => setLoading(false));
  }, [selectedUnit, tenantId]);

  return (
    <div className="space-y-6">
      {/* Unit Selector */}
      <div className="card card-body">
        <label className="field-label">Seleccionar Unidad</label>
        <select className="field-select max-w-md" value={selectedUnit || ''}
          onChange={e => setSelectedUnit(e.target.value)}>
          <option value="">— Seleccionar —</option>
          {units.map(u => (
            <option key={u.id} value={u.id}>{u.unit_id_code} — {u.unit_name} ({u.responsible_name})</option>
          ))}
        </select>
      </div>

      {loading && <div className="text-center py-12 text-ink-400">Cargando...</div>}

      {data && !loading && (
        <>
          {/* Summary */}
          <div className="grid md:grid-cols-3 gap-4">
            <div className="card card-body text-center">
              <div className="text-2xl font-extrabold text-ink-800">{fmtCurrency(data.total_charges, data.currency)}</div>
              <div className="text-xs text-ink-400 font-semibold">Total Cargos</div>
            </div>
            <div className="card card-body text-center">
              <div className="text-2xl font-extrabold text-teal-600">{fmtCurrency(data.total_payments, data.currency)}</div>
              <div className="text-xs text-ink-400 font-semibold">Total Pagado</div>
            </div>
            <div className="card card-body text-center">
              <div className={`text-2xl font-extrabold ${parseFloat(data.balance) > 0 ? 'text-coral-600' : 'text-teal-600'}`}>
                {fmtCurrency(data.balance, data.currency)}
              </div>
              <div className="text-xs text-ink-400 font-semibold">Saldo</div>
            </div>
          </div>

          {/* Period Detail */}
          <div className="card">
            <div className="card-head">
              <FileText size={16} className="text-ink-400" />
              <h3 className="text-sm font-bold">Estado de Cuenta — {data.unit?.unit_id_code} {data.unit?.unit_name}</h3>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Periodo</th><th className="text-right">Cargo</th><th className="text-right">Pagado</th><th>Estado</th><th>Forma de Pago</th><th>Fecha</th></tr>
                </thead>
                <tbody>
                  {data.periods.map((p, i) => (
                    <tr key={i}>
                      <td className="font-semibold text-xs">{periodLabel(p.period)}</td>
                      <td className="text-right text-xs">{fmtCurrency(p.charge, data.currency)}</td>
                      <td className="text-right font-bold text-xs text-teal-700">{fmtCurrency(p.paid, data.currency)}</td>
                      <td><span className={`badge ${statusClass(p.status)}`}>{statusLabel(p.status)}</span></td>
                      <td className="text-xs">{p.payment_type || '—'}</td>
                      <td className="text-xs">{fmtDate(p.payment_date)}</td>
                    </tr>
                  ))}
                  {data.periods.length === 0 && (
                    <tr><td colSpan={6} className="text-center text-ink-400 py-8">Sin registros de pago</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
