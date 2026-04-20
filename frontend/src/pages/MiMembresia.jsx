import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { tenantsAPI } from '../api/client';
import {
  CreditCard, AlertCircle, CheckCircle, Clock, XCircle, ShieldOff,
  Calendar, DollarSign, RefreshCw, Building2,
} from 'lucide-react';

// ─── Status config ────────────────────────────────────────────────────────────
const SUB_STATUS = {
  trial:     { label: 'Período de Prueba', color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE', icon: Clock },
  active:    { label: 'Activa',            color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0', icon: CheckCircle },
  past_due:  { label: 'Vencida',           color: '#D97706', bg: '#FFFBEB', border: '#FDE68A', icon: AlertCircle },
  cancelled: { label: 'Cancelada',         color: '#6B7280', bg: '#F9FAFB', border: '#E5E7EB', icon: ShieldOff },
  expired:   { label: 'Expirada',          color: '#DC2626', bg: '#FEF2F2', border: '#FECACA', icon: XCircle },
};

const fmtAmt = (amount, currency = 'MXN') => {
  const sym = { MXN: '$', USD: 'US$', EUR: '€', COP: 'COP$' };
  return `${sym[currency] || '$'}${Number(amount || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
};

const fmtDate = (d) => {
  if (!d) return '—';
  try {
    return new Date(d + 'T00:00:00').toLocaleDateString('es-MX', {
      day: '2-digit', month: 'long', year: 'numeric',
    });
  } catch { return d; }
};

// ─── Info row component ───────────────────────────────────────────────────────
function InfoRow({ label, value, accent }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
      padding: '10px 0', borderBottom: '1px solid var(--sand-100)',
    }}>
      <span style={{ fontSize: 13, color: 'var(--ink-500)', fontWeight: 500 }}>{label}</span>
      <span style={{
        fontSize: 13, fontWeight: 700,
        color: accent || 'var(--ink-800)',
        textAlign: 'right', maxWidth: '60%',
      }}>{value || '—'}</span>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function MiMembresia() {
  const { tenantId, tenantName } = useAuth();

  const [sub,     setSub]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  const loadSub = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const r = await tenantsAPI.getSubscription(tenantId);
      setSub(r.data);
    } catch (e) {
      if (e?.response?.status === 404) {
        setSub(null); // No subscription — not an error
      } else {
        setError('No se pudo cargar la información de la membresía.');
      }
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { loadSub(); }, [loadSub]);

  // ── Loading ──
  if (loading) {
    return (
      <div className="content-fade" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 300 }}>
        <div style={{ textAlign: 'center', color: 'var(--ink-400)' }}>
          <RefreshCw size={28} className="spin" style={{ display: 'block', margin: '0 auto 12px' }} />
          Cargando membresía…
        </div>
      </div>
    );
  }

  // ── Error ──
  if (error) {
    return (
      <div className="content-fade">
        <div style={{
          background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 14,
          padding: 24, textAlign: 'center', maxWidth: 480, margin: '48px auto',
        }}>
          <AlertCircle size={32} color="#DC2626" style={{ display: 'block', margin: '0 auto 12px' }} />
          <p style={{ fontWeight: 700, color: '#DC2626', marginBottom: 8 }}>Error</p>
          <p style={{ fontSize: 14, color: 'var(--ink-600)' }}>{error}</p>
          <button onClick={loadSub} style={{
            marginTop: 16, padding: '8px 20px', background: 'var(--teal-600)',
            color: 'white', border: 'none', borderRadius: 10, fontWeight: 600, cursor: 'pointer',
          }}>
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  // ── No subscription ──
  if (!sub) {
    return (
      <div className="content-fade">
        <div style={{
          background: 'var(--sand-50)', border: '1px solid var(--sand-200)', borderRadius: 20,
          padding: '48px 24px', textAlign: 'center', maxWidth: 480, margin: '48px auto',
        }}>
          <CreditCard size={40} color="var(--sand-300)" style={{ display: 'block', margin: '0 auto 16px' }} />
          <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink-600)', marginBottom: 8 }}>
            Sin membresía configurada
          </p>
          <p style={{ fontSize: 14, color: 'var(--ink-400)' }}>
            Este condominio aún no tiene una membresía asignada. Comunícate con el equipo de Homly para activar tu plan.
          </p>
        </div>
      </div>
    );
  }

  const s = SUB_STATUS[sub.status] || { label: sub.status_label || sub.status, color: '#6B7280', bg: '#F9FAFB', border: '#E5E7EB', icon: AlertCircle };
  const Icon = s.icon;

  return (
    <div className="content-fade">

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12,
          background: 'var(--teal-50)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <CreditCard size={22} color="var(--teal-600)" />
        </div>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink-800)', margin: 0 }}>
            Mi Membresía
          </h2>
          <div style={{ fontSize: 13, color: 'var(--ink-400)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Building2 size={12} /> {tenantName}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 20 }}>

        {/* ── Status card ── */}
        <div style={{
          gridColumn: '1 / -1',
          background: s.bg, border: `1.5px solid ${s.border}`, borderRadius: 18, padding: 24,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <Icon size={28} color={s.color} />
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>
                {sub.status_label || s.label}
              </div>
              <div style={{ fontSize: 13, color: 'var(--ink-500)', marginTop: 2 }}>
                Estado actual de tu membresía
              </div>
            </div>
            {sub.status === 'trial' && sub.trial_days_remaining > 0 && (
              <span style={{
                marginLeft: 'auto', fontSize: 13, fontWeight: 700, color: '#2563EB',
                background: '#DBEAFE', border: '1px solid #BFDBFE',
                borderRadius: 20, padding: '4px 12px',
              }}>
                {sub.trial_days_remaining} días restantes
              </span>
            )}
          </div>

          {/* Quick metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
            {[
              {
                icon: <CreditCard size={16} />,
                label: 'Plan',
                value: sub.plan_name || 'Demo gratuita',
              },
              {
                icon: <DollarSign size={16} />,
                label: 'Monto por ciclo',
                value: sub.amount_per_cycle > 0 ? fmtAmt(sub.amount_per_cycle, sub.currency) : 'Por definir',
              },
              {
                icon: <Calendar size={16} />,
                label: 'Próximo cobro',
                value: fmtDate(sub.next_billing_date),
              },
            ].map(({ icon, label, value }) => (
              <div key={label} style={{
                background: 'rgba(255,255,255,0.65)', borderRadius: 12, padding: '12px 14px',
                display: 'flex', flexDirection: 'column', gap: 4,
              }}>
                <div style={{ color: s.color, display: 'flex', alignItems: 'center', gap: 5 }}>
                  {icon}
                  <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
                </div>
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink-800)' }}>{value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Trial period ── */}
        {(sub.trial_start || sub.trial_end) && (
          <div style={{ background: 'var(--white)', border: '1px solid var(--sand-200)', borderRadius: 16, padding: 20 }}>
            <div style={{
              fontSize: 11, fontWeight: 800, color: 'var(--ink-400)', textTransform: 'uppercase',
              letterSpacing: '0.07em', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <Clock size={13} /> Período de Prueba
            </div>
            <InfoRow label="Inicio del período de prueba" value={fmtDate(sub.trial_start)} />
            <InfoRow label="Fin del período de prueba"   value={fmtDate(sub.trial_end)} />
            {sub.status === 'trial' && sub.trial_days_remaining > 0 && (
              <InfoRow
                label="Días restantes de prueba"
                value={`${sub.trial_days_remaining} días`}
                accent="#2563EB"
              />
            )}
          </div>
        )}

        {/* ── Billing details ── */}
        <div style={{ background: 'var(--white)', border: '1px solid var(--sand-200)', borderRadius: 16, padding: 20 }}>
          <div style={{
            fontSize: 11, fontWeight: 800, color: 'var(--ink-400)', textTransform: 'uppercase',
            letterSpacing: '0.07em', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <DollarSign size={13} /> Facturación
          </div>
          <InfoRow label="Plan"               value={sub.plan_name || 'Demo gratuita'} />
          <InfoRow label="Monto por ciclo"    value={sub.amount_per_cycle > 0 ? fmtAmt(sub.amount_per_cycle, sub.currency) : '—'} />
          <InfoRow label="Moneda"             value={sub.currency} />
          <InfoRow label="Inicio facturación" value={fmtDate(sub.billing_start)} />
          <InfoRow label="Próximo cobro"      value={fmtDate(sub.next_billing_date)} />
        </div>

        {/* ── Notes ── */}
        {sub.notes && (
          <div style={{ gridColumn: '1 / -1', background: 'var(--sand-50)', border: '1px solid var(--sand-200)', borderRadius: 14, padding: 20 }}>
            <div style={{
              fontSize: 11, fontWeight: 800, color: 'var(--ink-400)', textTransform: 'uppercase',
              letterSpacing: '0.07em', marginBottom: 10,
            }}>
              Notas
            </div>
            <p style={{ fontSize: 14, color: 'var(--ink-600)', margin: 0, lineHeight: 1.6 }}>{sub.notes}</p>
          </div>
        )}

        {/* ── Contact CTA ── */}
        <div style={{
          gridColumn: '1 / -1',
          background: 'linear-gradient(135deg, var(--teal-600) 0%, var(--teal-500) 100%)',
          borderRadius: 16, padding: '20px 24px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
          flexWrap: 'wrap',
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'white', marginBottom: 4 }}>
              ¿Tienes dudas sobre tu membresía?
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)' }}>
              Nuestro equipo puede ayudarte con pagos, upgrades o cancelaciones.
            </div>
          </div>
          <a
            href="mailto:soporte@homly.mx"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '10px 20px', background: 'white', color: 'var(--teal-700)',
              borderRadius: 10, fontWeight: 700, fontSize: 13,
              textDecoration: 'none', flexShrink: 0,
            }}
          >
            Contactar soporte
          </a>
        </div>

      </div>
    </div>
  );
}
