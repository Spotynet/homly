import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { reportsAPI } from '../api/client';
import { fmtCurrency, periodLabel, statusClass, statusLabel, fmtDate } from '../utils/helpers';
import { Home, FileText, DollarSign } from 'lucide-react';

export default function MyUnit() {
  const { tenantId, user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) return;
    // The API will find the unit assigned to this user
    reportsAPI.estadoCuenta(tenantId, { unit_id: 'me' })
      .then(r => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [tenantId]);

  if (loading) return <div className="p-8 text-center text-ink-400">Cargando información...</div>;

  if (!data || !data.unit) return (
    <div className="text-center py-16">
      <div className="text-5xl mb-4">🏠</div>
      <h3 className="text-lg font-bold text-ink-800 mb-2">Sin unidad asignada</h3>
      <p className="text-sm text-ink-400">Contacta al administrador para asignar tu unidad.</p>
    </div>
  );

  const { unit, periods, total_charges, total_payments, balance, currency } = data;

  return (
    <div className="space-y-6">
      {/* Unit info card */}
      <div className="card card-body">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-12 h-12 rounded-xl bg-teal-100 flex items-center justify-center">
            <Home size={24} className="text-teal-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-ink-800">{unit.unit_name}</h2>
            <p className="text-sm text-ink-400">
              <span className="font-mono font-bold text-teal-600">{unit.unit_id_code}</span>
              {' · '}
              {unit.occupancy === 'propietario' ? 'Propietario' : 'Inquilino'}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="text-xs text-ink-400 font-semibold mb-1">Propietario</div>
            <div className="text-sm font-bold">{unit.owner_first_name} {unit.owner_last_name}</div>
          </div>
          <div>
            <div className="text-xs text-ink-400 font-semibold mb-1">Email</div>
            <div className="text-sm">{unit.owner_email || '—'}</div>
          </div>
          <div>
            <div className="text-xs text-ink-400 font-semibold mb-1">Teléfono</div>
            <div className="text-sm">{unit.owner_phone || '—'}</div>
          </div>
          <div>
            <div className="text-xs text-ink-400 font-semibold mb-1">Ocupación</div>
            <div className="text-sm capitalize">{unit.occupancy}</div>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card card-body">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center">
              <DollarSign size={20} className="text-teal-600" />
            </div>
            <div>
              <div className="text-xs text-ink-400 font-semibold">Total Cargos</div>
              <div className="text-lg font-bold text-ink-800">
                {fmtCurrency(total_charges, currency)}
              </div>
            </div>
          </div>
        </div>
        <div className="card card-body">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center">
              <DollarSign size={20} className="text-teal-600" />
            </div>
            <div>
              <div className="text-xs text-ink-400 font-semibold">Total Pagado</div>
              <div className="text-lg font-bold text-teal-700">
                {fmtCurrency(total_payments, currency)}
              </div>
            </div>
          </div>
        </div>
        <div className="card card-body">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-coral-50 flex items-center justify-center">
              <FileText size={20} className="text-coral-500" />
            </div>
            <div>
              <div className="text-xs text-ink-400 font-semibold">Saldo</div>
              <div className={`text-lg font-bold ${parseFloat(balance) > 0 ? 'text-coral-600' : 'text-teal-700'}`}>
                {fmtCurrency(balance, currency)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Payment history */}
      <div className="card">
        <div className="card-head">
          <h3 className="font-bold text-ink-800">Historial de Pagos</h3>
          <span className="badge badge-gray">{periods.length} periodos</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Periodo</th>
                <th className="text-right">Cargo</th>
                <th className="text-right">Pagado</th>
                <th>Estado</th>
                <th>Forma de Pago</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {periods.map((p, i) => (
                <tr key={i}>
                  <td className="font-semibold">{periodLabel(p.period)}</td>
                  <td className="text-right font-semibold">{fmtCurrency(p.charge, currency)}</td>
                  <td className="text-right font-bold text-teal-700">{fmtCurrency(p.paid, currency)}</td>
                  <td>
                    <span className={`badge ${statusClass(p.status)}`}>
                      {statusLabel(p.status)}
                    </span>
                  </td>
                  <td className="text-sm capitalize">{p.payment_type || '—'}</td>
                  <td className="text-sm">{p.payment_date ? fmtDate(p.payment_date) : '—'}</td>
                </tr>
              ))}
              {periods.length === 0 && (
                <tr><td colSpan={6} className="text-center py-8 text-ink-400">
                  Sin registros de pago
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
