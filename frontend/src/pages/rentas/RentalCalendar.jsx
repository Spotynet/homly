import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { rentalAPI } from '../../api/client';
import { CONTRACT_STATUS, fmtDate, fmtMoney, StatusPill } from './rentalUtils';

export default function RentalCalendar() {
  const { tenantId } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) return;
    setLoading(true);
    rentalAPI.calendar(tenantId, { days: 180 })
      .then(r => setItems(r.data.items || []))
      .finally(() => setLoading(false));
  }, [tenantId]);

  const groups = useMemo(() => {
    const overdue = items.filter(i => i.days_left < 0 && i.status !== 'finalizado');
    const soon = items.filter(i => i.days_left >= 0 && i.days_left <= 45);
    const later = items.filter(i => i.days_left > 45);
    return { overdue, soon, later };
  }, [items]);

  return (
    <div className="content-fade">
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', color: 'var(--teal-600)', textTransform: 'uppercase' }}>Supervisión</div>
        <h2 style={{ margin: '4px 0 0', fontSize: 22 }}>Vigencias de contratos</h2>
        <p style={{ color: 'var(--ink-400)', fontSize: 13, marginTop: 4 }}>
          Calendario de vida de los contratos para renovar o cerrar a tiempo.
        </p>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-400)' }}>Cargando vigencias…</div>
      ) : (
        <div style={{ display: 'grid', gap: 16 }}>
          <Section title="Vencidos" hint="Requieren renovación o cierre" rows={groups.overdue} tone="coral" />
          <Section title="Por vencer (45 días)" hint="Atiende renovación con anticipación" rows={groups.soon} tone="amber" />
          <Section title="Vigentes más adelante" hint="Próximos 6 meses" rows={groups.later} tone="teal" />
        </div>
      )}
    </div>
  );
}

function Section({ title, hint, rows, tone }) {
  const accent = tone === 'coral' ? 'var(--coral-400)' : tone === 'amber' ? 'var(--amber-400)' : 'var(--teal-400)';
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: 99, background: accent }} />
            {title}
          </h3>
          <div style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: 2 }}>{hint} · {rows.length}</div>
        </div>
      </div>
      {rows.length === 0 ? (
        <div style={{ padding: 22, color: 'var(--ink-400)', fontSize: 13 }}>Sin contratos en este rango.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Contrato</th>
                <th>Inmueble</th>
                <th>Inquilino</th>
                <th>Inicio</th>
                <th>Fin</th>
                <th>Renta</th>
                <th>Estatus</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>{r.code}</td>
                  <td>{r.property_code} · {r.property_name}</td>
                  <td>{r.tenant_name}</td>
                  <td>{fmtDate(r.start_date)}</td>
                  <td>
                    <div>{fmtDate(r.end_date)}</div>
                    <div style={{ fontSize: 11, color: r.days_left < 0 ? 'var(--coral-500)' : 'var(--ink-400)' }}>
                      {r.days_left < 0 ? `Hace ${Math.abs(r.days_left)} día(s)` : `${r.days_left} día(s)`}
                    </div>
                  </td>
                  <td>{fmtMoney(r.rent_amount)}</td>
                  <td><StatusPill map={CONTRACT_STATUS} value={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
