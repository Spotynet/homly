import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { reportsAPI } from '../api/client';
import { todayPeriod, periodLabel, prevPeriod, nextPeriod, fmtCurrency } from '../utils/helpers';
import { ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Users, DollarSign } from 'lucide-react';

export default function Dashboard() {
  const { tenantId } = useAuth();
  const [period, setPeriod] = useState(todayPeriod());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) return;
    setLoading(true);
    reportsAPI.dashboard(tenantId, period)
      .then(r => setData(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [tenantId, period]);

  if (loading) return <div className="text-center py-12 text-ink-400">Cargando dashboard...</div>;
  if (!data) return <div className="text-center py-12 text-ink-400">Sin datos disponibles.</div>;

  const cards = [
    { label: 'Unidades', value: data.total_units, icon: Users, color: 'teal', bg: 'bg-teal-50' },
    { label: 'Recaudado', value: fmtCurrency(data.total_collected), icon: DollarSign, color: 'teal', bg: 'bg-teal-50' },
    { label: 'Esperado', value: fmtCurrency(data.total_expected), icon: TrendingUp, color: 'ink', bg: 'bg-slate-50' },
    { label: 'Tasa de Cobro', value: `${data.collection_rate}%`, icon: TrendingUp, color: 'teal', bg: 'bg-teal-50' },
  ];

  return (
    <div className="space-y-6">
      {/* Period Selector */}
      <div className="flex items-center gap-4">
        <button className="btn btn-outline btn-sm" onClick={() => setPeriod(prevPeriod(period))}>
          <ChevronLeft size={16} />
        </button>
        <span className="text-lg font-bold text-ink-800">{periodLabel(period)}</span>
        <button className="btn btn-outline btn-sm" onClick={() => setPeriod(nextPeriod(period))}>
          <ChevronRight size={16} />
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c, i) => (
          <div key={i} className="card card-body">
            <div className="flex items-center gap-3 mb-2">
              <div className={`w-10 h-10 ${c.bg} rounded-xl flex items-center justify-center`}>
                <c.icon size={18} className={`text-${c.color}-600`} />
              </div>
            </div>
            <div className="text-2xl font-extrabold text-ink-800">{c.value}</div>
            <div className="text-xs font-semibold text-ink-400">{c.label}</div>
          </div>
        ))}
      </div>

      {/* Status Summary */}
      <div className="grid md:grid-cols-3 gap-4">
        <div className="card card-body text-center">
          <div className="text-3xl font-extrabold text-teal-600">{data.paid_count}</div>
          <div className="badge badge-teal mt-2">Pagados</div>
        </div>
        <div className="card card-body text-center">
          <div className="text-3xl font-extrabold text-amber-600">{data.partial_count}</div>
          <div className="badge badge-amber mt-2">Parciales</div>
        </div>
        <div className="card card-body text-center">
          <div className="text-3xl font-extrabold text-coral-600">{data.pending_count}</div>
          <div className="badge badge-coral mt-2">Pendientes</div>
        </div>
      </div>

      {/* Gastos Summary */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="card card-body">
          <h3 className="text-sm font-bold text-ink-600 mb-1">Gastos del Periodo</h3>
          <div className="text-2xl font-extrabold text-coral-600">
            {fmtCurrency(data.total_gastos)}
          </div>
        </div>
        <div className="card card-body">
          <h3 className="text-sm font-bold text-ink-600 mb-1">Caja Chica</h3>
          <div className="text-2xl font-extrabold text-amber-600">
            {fmtCurrency(data.total_caja_chica)}
          </div>
        </div>
      </div>
    </div>
  );
}
