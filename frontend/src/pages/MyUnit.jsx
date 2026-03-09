import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { reportsAPI, tenantsAPI, reservationsAPI } from '../api/client';
import { fmtCurrency, periodLabel, statusClass, statusLabel, fmtDate } from '../utils/helpers';
import { Home, User, Phone, Mail, DollarSign, FileText, Calendar, Plus, X, Check } from 'lucide-react';

function fmt(n) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n ?? 0);
}

function InfoCard({ label, value, icon }) {
  return (
    <div className="info-item">
      <div className="info-item-label">{label}</div>
      <div className="info-item-value">{value || <span style={{ color: 'var(--ink-300)', fontWeight: 400, fontStyle: 'italic', fontSize: 14 }}>No registrado</span>}</div>
    </div>
  );
}

export default function MyUnit() {
  const { tenantId, tenantName, user } = useAuth();
  const [data, setData] = useState(null);
  const [tenantData, setTenantData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Reservas
  const [myReservations, setMyReservations]   = useState([]);
  const [resFormOpen,    setResFormOpen]       = useState(false);
  const [resForm,        setResForm]           = useState({});
  const [resSaving,      setResSaving]         = useState(false);

  useEffect(() => {
    if (!tenantId) return;
    Promise.all([
      reportsAPI.estadoCuenta(tenantId, { unit_id: 'me' }).catch(() => null),
      tenantsAPI.get(tenantId).catch(() => null),
      reservationsAPI.list(tenantId).catch(() => null),
    ]).then(([ecRes, tRes, resRes]) => {
      setData(ecRes?.data || null);
      setTenantData(tRes?.data || null);
      const rd = resRes?.data;
      setMyReservations(Array.isArray(rd) ? rd : (rd?.results || []));
    }).finally(() => setLoading(false));
  }, [tenantId]);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '50vh', gap: 16 }}>
        <div style={{
          width: 40, height: 40, borderRadius: '50%',
          border: '3px solid var(--sand-100)', borderTopColor: 'var(--teal-400)',
          animation: 'spin 0.8s linear infinite'
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <p style={{ color: 'var(--ink-400)', fontSize: 14 }}>Cargando tu unidad…</p>
      </div>
    );
  }

  if (!data?.unit) {
    return (
      <div className="content-fade">
        <div className="empty">
          <div className="empty-icon">🏠</div>
          <h4>Sin unidad asignada</h4>
          <p>Tu cuenta no tiene una unidad vinculada. Contacta al administrador para que te asigne tu unidad.</p>
        </div>
      </div>
    );
  }

  const { unit, periods, total_charges, total_payments, balance, currency } = data;
  const balanceNum = parseFloat(balance) || 0;
  const commonAreas = tenantData?.common_areas || [];
  const adminType = tenantData?.admin_type === 'professional' ? 'Administración Profesional' : 'Autogestión';

  return (
    <div className="content-fade">
      {/* ── Welcome card ── */}
      <div className="welcome-card">
        <h2>Hola, {user?.name || unit.owner_first_name} 👋</h2>
        <p>Bienvenido a tu portal de vecino · {tenantName}</p>
      </div>

      {/* ── Condominio info ── */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-head"><h3>Información del Condominio</h3></div>
        <div className="card-body">
          <div className="info-grid">
            <InfoCard label="Condominio" value={tenantName} />
            <InfoCard label="Cuota Mensual" value={fmt(tenantData?.maintenance_fee)} />
            <InfoCard label="País" value={tenantData?.country} />
            <InfoCard label="Tipo de Administración" value={adminType} />
          </div>
        </div>
      </div>

      {/* ── Unit + Fee cards ── */}
      <div className="grid-2" style={{ marginBottom: 20 }}>
        <div className="card">
          <div className="card-head">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className="stat-icon teal"><Home size={16} /></div>
              <h3>Tu Unidad</h3>
            </div>
            <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--teal-600)', background: 'var(--teal-50)', padding: '4px 12px', borderRadius: 8, fontSize: 13 }}>
              {unit.unit_id_code}
            </span>
          </div>
          <div className="card-body">
            <div className="info-grid">
              <InfoCard label="Nombre" value={unit.unit_name} />
              <InfoCard label="Piso / Nivel" value={unit.floor} />
              <InfoCard label="Metros cuadrados" value={unit.area_m2 ? `${unit.area_m2} m²` : null} />
              <InfoCard label="Ocupación" value={unit.occupancy ? unit.occupancy.charAt(0).toUpperCase() + unit.occupancy.slice(1) : null} />
            </div>
          </div>
        </div>

        {/* Balance card */}
        <div className="card">
          <div className="card-head"><h3>Resumen de Cuenta</h3></div>
          <div className="card-body">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--sand-100)' }}>
                <span style={{ fontSize: 13, color: 'var(--ink-500)' }}>Total Cargos</span>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 500, color: 'var(--ink-800)' }}>{fmt(total_charges)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--sand-100)' }}>
                <span style={{ fontSize: 13, color: 'var(--ink-500)' }}>Total Pagado</span>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 500, color: 'var(--teal-600)' }}>{fmt(total_payments)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0' }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink-700)' }}>Saldo</span>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 500, color: balanceNum > 0 ? 'var(--coral-500)' : 'var(--teal-600)' }}>
                  {fmt(balanceNum)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Owner info ── */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="stat-icon blue"><User size={16} /></div>
            <h3>Propietario</h3>
          </div>
        </div>
        <div className="card-body">
          <div className="info-grid">
            <InfoCard label="Nombre" value={`${unit.owner_first_name || ''} ${unit.owner_last_name || ''}`.trim()} />
            <InfoCard label="Email" value={unit.owner_email} />
            <InfoCard label="Teléfono" value={unit.owner_phone} />
            <InfoCard label="RFC" value={unit.owner_rfc} />
          </div>
        </div>
      </div>

      {/* ── Tenant info (if rented) ── */}
      {unit.occupancy === 'rentada' && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-head">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className="stat-icon amber"><User size={16} /></div>
              <h3>Inquilino</h3>
            </div>
            <span className="badge badge-amber">Rentada</span>
          </div>
          <div className="card-body">
            <div className="info-grid">
              <InfoCard label="Nombre" value={`${unit.tenant_first_name || ''} ${unit.tenant_last_name || ''}`.trim() || null} />
              <InfoCard label="Email" value={unit.tenant_email} />
              <InfoCard label="Teléfono" value={unit.tenant_phone} />
            </div>
          </div>
        </div>
      )}

      {/* ── Reservas de Áreas Comunes ── */}
      {(() => {
        const areas = Array.isArray(commonAreas)
          ? commonAreas.filter(a => a && typeof a === 'object' && a.active && a.reservations_enabled)
          : [];

        const STATUS_CFG = {
          pending:   { label: 'Pendiente', cls: 'badge-amber' },
          approved:  { label: 'Aprobada',  cls: 'badge-teal'  },
          rejected:  { label: 'Rechazada', cls: 'badge-coral' },
          cancelled: { label: 'Cancelada', cls: ''            },
        };

        const loadReservations = () => {
          reservationsAPI.list(tenantId).then(r => {
            const d = r?.data;
            setMyReservations(Array.isArray(d) ? d : (d?.results || []));
          }).catch(() => {});
        };

        const openResForm = () => {
          setResForm({ area_id: areas[0]?.id || '', area_name: areas[0]?.name || '', date: '', start_time: '', end_time: '', notes: '' });
          setResFormOpen(true);
        };

        const submitReservation = async () => {
          if (!resForm.area_id || !resForm.date || !resForm.start_time || !resForm.end_time)
            return;
          setResSaving(true);
          try {
            const selectedArea = areas.find(a => a.id === resForm.area_id);
            await reservationsAPI.create(tenantId, {
              ...resForm,
              area_name: selectedArea?.name || resForm.area_name,
              unit: data?.unit?.id || null,
              charge_amount: selectedArea?.charge_amount || 0,
            });
            setResFormOpen(false);
            loadReservations();
          } catch { /* silently fail */ }
          finally { setResSaving(false); }
        };

        const handleCancel = async (id) => {
          if (!window.confirm('¿Cancelar esta reserva?')) return;
          await reservationsAPI.cancel(tenantId, id);
          loadReservations();
        };

        return (
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-head">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className="stat-icon teal"><Calendar size={16} /></div>
                <h3>Áreas Comunes y Reservas</h3>
              </div>
              {areas.length > 0 && (
                <button className="btn btn-primary btn-sm" onClick={openResForm}>
                  <Plus size={13} /> Solicitar Reserva
                </button>
              )}
            </div>
            <div className="card-body">
              {/* Areas disponibles */}
              {commonAreas.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: myReservations.length ? 16 : 0 }}>
                  {(Array.isArray(commonAreas) ? commonAreas : []).filter(a => typeof a === 'object' && a?.name).map(a => (
                    <span
                      key={a.id}
                      className={`badge ${a.active ? (a.reservations_enabled ? 'badge-teal' : 'badge-blue') : ''}`}
                      style={{ fontSize: 12, opacity: a.active ? 1 : 0.5, background: !a.active ? 'var(--sand-100)' : undefined, color: !a.active ? 'var(--ink-400)' : undefined }}
                      title={!a.active ? 'Área inactiva' : a.reservations_enabled ? 'Con reservas disponibles' : 'Sin reservas'}
                    >
                      {a.name}{!a.active && ' (inactiva)'}{a.active && !a.reservations_enabled && ' (sin reservas)'}
                    </span>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 13, color: 'var(--ink-300)', marginBottom: 8 }}>Sin áreas comunes configuradas.</div>
              )}

              {/* Mis reservas */}
              {myReservations.length > 0 && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-400)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                    Mis Reservas
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Área</th>
                          <th>Fecha</th>
                          <th>Horario</th>
                          <th>Estado</th>
                          <th style={{ width: 80 }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {myReservations.slice(0, 10).map(r => {
                          const sc = STATUS_CFG[r.status] || { label: r.status, cls: '' };
                          return (
                            <tr key={r.id}>
                              <td style={{ fontWeight: 600, fontSize: 13 }}>{r.area_name}</td>
                              <td style={{ fontSize: 12 }}>
                                {new Date(r.date + 'T00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}
                              </td>
                              <td style={{ fontSize: 12 }}>{r.start_time?.slice(0,5)} – {r.end_time?.slice(0,5)}</td>
                              <td><span className={`badge ${sc.cls}`} style={{ fontSize: 11 }}>{sc.label}</span></td>
                              <td>
                                {(r.status === 'pending' || r.status === 'approved') && (
                                  <button className="btn-ghost" style={{ color: 'var(--coral-500)', fontSize: 11 }}
                                    onClick={() => handleCancel(r.id)}>
                                    <X size={11} /> Cancelar
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
              )}
            </div>

            {/* Modal solicitar reserva */}
            {resFormOpen && (
              <div className="modal-bg open" onClick={() => setResFormOpen(false)}>
                <div className="modal" onClick={e => e.stopPropagation()}>
                  <div className="modal-head">
                    <h3>Solicitar Reserva</h3>
                    <button className="modal-close" onClick={() => setResFormOpen(false)}><X size={16} /></button>
                  </div>
                  <div className="modal-body">
                    <div className="form-grid">
                      <div className="field field-full">
                        <label className="field-label">Área Común</label>
                        <select className="field-input"
                          value={resForm.area_id || ''}
                          onChange={e => {
                            const a = areas.find(x => x.id === e.target.value);
                            setResForm(f => ({ ...f, area_id: e.target.value, area_name: a?.name || '' }));
                          }}>
                          {areas.map(a => <option key={a.id} value={a.id}>{a.name}{a.charge_enabled ? ` — ${new Intl.NumberFormat('es-MX', { style: 'currency', currency: tenantData?.currency || 'MXN', maximumFractionDigits: 0 }).format(a.charge_amount || 0)}` : ''}</option>)}
                        </select>
                        {(() => {
                          const sel = areas.find(a => a.id === resForm.area_id);
                          return sel?.reservation_policy ? (
                            <div style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 4, padding: '6px 10px', background: 'var(--sand-50)', borderRadius: 6 }}>
                              📋 {sel.reservation_policy}
                            </div>
                          ) : null;
                        })()}
                      </div>
                      <div className="field">
                        <label className="field-label">Fecha</label>
                        <input className="field-input" type="date"
                          min={new Date().toISOString().split('T')[0]}
                          value={resForm.date || ''}
                          onChange={e => setResForm(f => ({ ...f, date: e.target.value }))} />
                      </div>
                      <div className="field">
                        <label className="field-label">Hora inicio</label>
                        <input className="field-input" type="time"
                          value={resForm.start_time || ''}
                          onChange={e => setResForm(f => ({ ...f, start_time: e.target.value }))} />
                      </div>
                      <div className="field">
                        <label className="field-label">Hora fin</label>
                        <input className="field-input" type="time"
                          value={resForm.end_time || ''}
                          onChange={e => setResForm(f => ({ ...f, end_time: e.target.value }))} />
                      </div>
                      <div className="field field-full">
                        <label className="field-label">Notas (opcional)</label>
                        <textarea className="field-input" rows={2}
                          style={{ resize: 'vertical', fontFamily: 'var(--font-body)', fontSize: 13 }}
                          placeholder="Motivo de la reserva, número de personas..."
                          value={resForm.notes || ''}
                          onChange={e => setResForm(f => ({ ...f, notes: e.target.value }))} />
                      </div>
                    </div>
                  </div>
                  <div className="modal-foot">
                    <button className="btn btn-secondary" onClick={() => setResFormOpen(false)}>Cancelar</button>
                    <button className="btn btn-primary" onClick={submitReservation} disabled={resSaving || !resForm.date || !resForm.start_time || !resForm.end_time}>
                      <Check size={14} /> {resSaving ? 'Enviando…' : 'Enviar Solicitud'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Payment history ── */}
      <div className="card">
        <div className="card-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="stat-icon ink"><FileText size={16} /></div>
            <h3>Historial de Pagos</h3>
          </div>
          <span className="badge badge-gray">{periods.length} períodos</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Período</th>
                <th style={{ textAlign: 'right' }}>Cargo</th>
                <th style={{ textAlign: 'right' }}>Pagado</th>
                <th>Estado</th>
                <th>Forma de Pago</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {periods.map((p, i) => {
                const rowBal = parseFloat(p.charge || 0) - parseFloat(p.paid || 0);
                return (
                  <tr key={i} className={rowBal > 0.5 ? 'period-row-debt' : 'period-row-ok'}>
                    <td style={{ fontWeight: 700, fontSize: 13 }}>{periodLabel(p.period)}</td>
                    <td style={{ textAlign: 'right', fontSize: 13 }}>{fmt(p.charge)}</td>
                    <td style={{ textAlign: 'right', fontSize: 13, fontWeight: 700, color: 'var(--teal-700)' }}>{fmt(p.paid)}</td>
                    <td><span className={`badge ${statusClass(p.status)}`}>{statusLabel(p.status)}</span></td>
                    <td style={{ fontSize: 12 }}>{p.payment_type || '—'}</td>
                    <td style={{ fontSize: 12 }}>{fmtDate(p.payment_date)}</td>
                  </tr>
                );
              })}
              {periods.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--ink-300)', fontSize: 14 }}>
                    Sin registros de pago
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
