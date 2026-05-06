import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { tenantsAPI } from '../api/client';
import {
  CreditCard, AlertCircle, CheckCircle, Clock, XCircle, ShieldOff,
  Calendar, DollarSign, RefreshCw, Building2, Receipt, Eye,
  TrendingUp, Award, AlertTriangle, Bell, Info,
} from 'lucide-react';
import SubscriptionReceiptModal from '../components/SubscriptionReceiptModal';

// ─── Status config ─────────────────────────────────────────────────────────────
const SUB_STATUS = {
  trial:     { label: 'Período de Prueba', color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE', icon: Clock },
  active:    { label: 'Activa',            color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0', icon: CheckCircle },
  past_due:  { label: 'Pago Vencido',      color: '#D97706', bg: '#FFFBEB', border: '#FDE68A', icon: AlertCircle },
  cancelled: { label: 'Cancelada',         color: '#6B7280', bg: '#F9FAFB', border: '#E5E7EB', icon: ShieldOff },
  expired:   { label: 'Expirada',          color: '#DC2626', bg: '#FEF2F2', border: '#FECACA', icon: XCircle },
};

// ─── Helpers ───────────────────────────────────────────────────────────────────
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

const fmtDateShort = (d) => {
  if (!d) return '—';
  try {
    return new Date(d + 'T00:00:00').toLocaleDateString('es-MX', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  } catch { return d; }
};

/** Days between two ISO date strings (or Date objects). Positive = future. */
const daysDiff = (from, to) => {
  if (!from || !to) return null;
  const a = new Date(from + (from.includes('T') ? '' : 'T00:00:00'));
  const b = new Date(to + (to.includes('T') ? '' : 'T00:00:00'));
  return Math.round((b - a) / 86400000);
};

/** Build human-readable tenure string from a start date to today. */
const calcTenure = (startDateStr) => {
  if (!startDateStr) return null;
  const start = new Date(startDateStr + 'T00:00:00');
  const now = new Date();
  let years = now.getFullYear() - start.getFullYear();
  let months = now.getMonth() - start.getMonth();
  let days = now.getDate() - start.getDate();
  if (days < 0) { months--; }
  if (months < 0) { years--; months += 12; }
  if (years < 0) return 'Menos de un mes';
  if (years === 0 && months === 0) return 'Menos de un mes';
  const parts = [];
  if (years > 0) parts.push(`${years} ${years === 1 ? 'año' : 'años'}`);
  if (months > 0) parts.push(`${months} ${months === 1 ? 'mes' : 'meses'}`);
  return parts.join(', ');
};

// ─── Sub-components ────────────────────────────────────────────────────────────
function InfoRow({ label, value, accent, chip }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 0', borderBottom: '1px solid var(--sand-100)',
    }}>
      <span style={{ fontSize: 13, color: 'var(--ink-500)', fontWeight: 500 }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {chip && (
          <span style={{
            fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 12,
            background: chip.bg, color: chip.color, border: `1px solid ${chip.border}`,
          }}>{chip.label}</span>
        )}
        <span style={{
          fontSize: 13, fontWeight: 700,
          color: accent || 'var(--ink-800)',
          textAlign: 'right', maxWidth: '55%',
        }}>{value || '—'}</span>
      </div>
    </div>
  );
}

function MetricCard({ icon, label, value, sub: subtitle, color, bg, border }) {
  return (
    <div style={{
      background: bg || 'var(--white)', border: `1px solid ${border || 'var(--sand-200)'}`,
      borderRadius: 14, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: color || 'var(--ink-400)' }}>
        {icon}
        <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {label}
        </span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 900, color: color || 'var(--ink-800)', lineHeight: 1.1 }}>{value}</div>
      {subtitle && <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>{subtitle}</div>}
    </div>
  );
}

function AlertBanner({ type, title, message }) {
  const styles = {
    warning: { bg: '#FFFBEB', border: '#FDE68A', color: '#92400E', icon: <AlertTriangle size={18} color="#D97706" /> },
    danger:  { bg: '#FEF2F2', border: '#FECACA', color: '#7F1D1D', icon: <AlertCircle size={18} color="#DC2626" /> },
    info:    { bg: '#EFF6FF', border: '#BFDBFE', color: '#1E3A5F', icon: <Info size={18} color="#2563EB" /> },
    success: { bg: '#F0FDF4', border: '#BBF7D0', color: '#14532D', icon: <CheckCircle size={18} color="#16A34A" /> },
  };
  const s = styles[type] || styles.info;
  return (
    <div style={{
      background: s.bg, border: `1.5px solid ${s.border}`, borderRadius: 14,
      padding: '14px 18px', display: 'flex', alignItems: 'flex-start', gap: 12,
    }}>
      <div style={{ flexShrink: 0, marginTop: 1 }}>{s.icon}</div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 800, color: s.color, marginBottom: 3 }}>{title}</div>
        <div style={{ fontSize: 13, color: s.color, opacity: 0.85, lineHeight: 1.5 }}>{message}</div>
      </div>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function MiMembresia() {
  const { tenantId, tenantName } = useAuth();

  const [sub,            setSub]            = useState(null);
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState(null);
  const [payments,       setPayments]       = useState([]);
  const [tenantData,     setTenantData]     = useState(null);
  const [receiptPayment, setReceiptPayment] = useState(null);

  const loadSub = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const [subRes, paysRes, tenantRes] = await Promise.allSettled([
        tenantsAPI.getSubscription(tenantId),
        tenantsAPI.getSubscriptionPayments(tenantId),
        tenantsAPI.get(tenantId),
      ]);
      if (subRes.status === 'fulfilled') {
        setSub(subRes.value.data);
      } else if (subRes.reason?.response?.status === 404) {
        setSub(null);
      } else {
        setError('No se pudo cargar la información de la membresía.');
      }
      if (paysRes.status === 'fulfilled') {
        setPayments(Array.isArray(paysRes.value.data) ? paysRes.value.data : []);
      }
      if (tenantRes.status === 'fulfilled') {
        setTenantData(tenantRes.value.data || null);
      }
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { loadSub(); }, [loadSub]);

  // ─── Derived values ──────────────────────────────────────────────────────────
  const derived = useMemo(() => {
    if (!sub) return {};
    const today = new Date().toISOString().slice(0, 10);

    // Tenure: from billing_start or trial_start
    const tenureStart = sub.billing_start || sub.trial_start;
    const tenure = calcTenure(tenureStart);

    // Days until next billing
    const daysUntilDue = sub.next_billing_date ? daysDiff(today, sub.next_billing_date) : null;

    // Last payment
    const sortedPays = [...payments].sort((a, b) =>
      new Date(b.payment_date || 0) - new Date(a.payment_date || 0)
    );
    const lastPayment = sortedPays[0] || null;

    // Billing cycle label — plan_billing_cycle comes from TenantSubscriptionSerializer
    const cycleLabel = sub.plan_billing_cycle
      ? (sub.plan_billing_cycle === 'annual' ? 'Anual' : 'Mensual')
      : null;

    // Grace period: 5 days from next_billing_date
    const graceEnd = sub.next_billing_date
      ? new Date(sub.next_billing_date + 'T00:00:00')
      : null;
    if (graceEnd) graceEnd.setDate(graceEnd.getDate() + 5);
    const graceEndStr = graceEnd ? graceEnd.toISOString().slice(0, 10) : null;
    const daysUntilGrace = graceEndStr ? daysDiff(today, graceEndStr) : null;

    return { tenure, tenureStart, daysUntilDue, sortedPays, lastPayment, cycleLabel, graceEndStr, daysUntilGrace };
  }, [sub, payments]);

  // ─── Loading ─────────────────────────────────────────────────────────────────
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

  // ─── Error ───────────────────────────────────────────────────────────────────
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

  // ─── No subscription ─────────────────────────────────────────────────────────
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
  const StatusIcon = s.icon;
  const { tenure, tenureStart, daysUntilDue, sortedPays, lastPayment, cycleLabel, graceEndStr, daysUntilGrace } = derived;

  // Due date color
  const dueDateColor = daysUntilDue === null ? 'var(--ink-800)'
    : daysUntilDue < 0   ? '#DC2626'
    : daysUntilDue <= 3  ? '#D97706'
    : daysUntilDue <= 7  ? '#CA8A04'
    : '#16A34A';

  const dueDateLabel = daysUntilDue === null ? '—'
    : daysUntilDue < 0   ? `Vencido hace ${Math.abs(daysUntilDue)} ${Math.abs(daysUntilDue) === 1 ? 'día' : 'días'}`
    : daysUntilDue === 0 ? 'Vence hoy'
    : daysUntilDue === 1 ? 'Vence mañana'
    : `${daysUntilDue} días restantes`;

  return (
    <>
    <div className="content-fade">

      {/* ── Page header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12,
          background: 'var(--teal-50)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <CreditCard size={22} color="var(--teal-600)" />
        </div>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink-800)', margin: 0 }}>
            Estado de Cuenta — Membresía
          </h2>
          <div style={{ fontSize: 13, color: 'var(--ink-400)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Building2 size={12} /> {tenantName}
          </div>
        </div>
        <button
          onClick={loadSub}
          title="Actualizar"
          style={{
            marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 14px', background: 'var(--sand-50)', border: '1px solid var(--sand-200)',
            borderRadius: 10, fontSize: 12, fontWeight: 700, color: 'var(--ink-500)', cursor: 'pointer',
          }}
        >
          <RefreshCw size={13} /> Actualizar
        </button>
      </div>

      {/* ── Alert banners ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
        {sub.status === 'past_due' && (
          <AlertBanner
            type="danger"
            title="Pago de membresía vencido"
            message={`Tu membresía tiene un pago pendiente${sub.next_billing_date ? ` desde el ${fmtDate(sub.next_billing_date)}` : ''}. El acceso a la plataforma puede estar restringido hasta que se registre el pago. Comunícate con el equipo de Homly para regularizar tu cuenta.`}
          />
        )}
        {sub.status === 'trial' && sub.trial_days_remaining <= 7 && sub.trial_days_remaining > 0 && (
          <AlertBanner
            type="warning"
            title="Tu período de prueba está por vencer"
            message={`Te quedan ${sub.trial_days_remaining} ${sub.trial_days_remaining === 1 ? 'día' : 'días'} de prueba gratuita. Contacta a nuestro equipo para activar tu plan y continuar sin interrupciones.`}
          />
        )}
        {sub.status === 'trial' && sub.trial_days_remaining <= 0 && (
          <AlertBanner
            type="danger"
            title="Período de prueba expirado"
            message="Tu período de prueba ha concluido. Contacta al equipo de Homly para activar tu plan de membresía."
          />
        )}
        {sub.status === 'expired' && (
          <AlertBanner
            type="danger"
            title="Membresía expirada"
            message="Tu membresía ha expirado. Para reactivar el acceso completo, contacta a nuestro equipo de soporte."
          />
        )}
        {sub.status === 'cancelled' && (
          <AlertBanner
            type="info"
            title="Membresía cancelada"
            message="Esta membresía ha sido cancelada. Si deseas reactivarla, comunícate con el equipo de Homly."
          />
        )}
        {sub.status === 'active' && daysUntilDue !== null && daysUntilDue >= 0 && daysUntilDue <= 5 && (
          <AlertBanner
            type="warning"
            title="Próximo vencimiento de pago"
            message={`Tu pago mensual vence el ${fmtDate(sub.next_billing_date)}. Recuerda que tienes hasta 5 días después del vencimiento (${fmtDate(graceEndStr)}) antes de que la cuenta sea suspendida.`}
          />
        )}
        {sub.status === 'active' && (
          <AlertBanner
            type="info"
            title="Política de cobro"
            message="Los pagos deben registrarse dentro de los primeros 5 días de cada mes. Pasado este plazo sin confirmación de pago, la cuenta podrá ser suspendida temporalmente de forma automática."
          />
        )}
      </div>

      {/* ── Status hero card ── */}
      <div style={{
        background: s.bg, border: `2px solid ${s.border}`, borderRadius: 20, padding: '24px 28px',
        marginBottom: 20, display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap',
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: 16,
          background: 'rgba(255,255,255,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <StatusIcon size={32} color={s.color} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: s.color, marginBottom: 4 }}>
            Estado de membresía
          </div>
          <div style={{ fontSize: 28, fontWeight: 900, color: s.color, lineHeight: 1.1, marginBottom: 6 }}>
            {sub.status_label || s.label}
          </div>
          <div style={{ fontSize: 13, color: 'var(--ink-500)' }}>
            {sub.plan_name ? `Plan ${sub.plan_name}` : 'Sin plan asignado'}
            {cycleLabel && sub.plan_name ? ` · ${cycleLabel}` : ''}
            {tenure ? ` · ${tenure} de antigüedad` : ''}
          </div>
        </div>
        {sub.status === 'trial' && sub.trial_days_remaining > 0 && (
          <div style={{
            textAlign: 'center', flexShrink: 0,
            background: 'rgba(255,255,255,0.8)', borderRadius: 14, padding: '12px 20px',
          }}>
            <div style={{ fontSize: 32, fontWeight: 900, color: '#2563EB', lineHeight: 1 }}>
              {sub.trial_days_remaining}
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#1D4ED8', marginTop: 4 }}>
              días de prueba
            </div>
          </div>
        )}
        {sub.next_billing_date && sub.status === 'active' && (
          <div style={{
            textAlign: 'center', flexShrink: 0,
            background: 'rgba(255,255,255,0.8)', borderRadius: 14, padding: '12px 20px',
          }}>
            <div style={{ fontSize: 28, fontWeight: 900, color: dueDateColor, lineHeight: 1 }}>
              {daysUntilDue !== null ? (daysUntilDue < 0 ? Math.abs(daysUntilDue) : daysUntilDue) : '—'}
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: dueDateColor, marginTop: 4 }}>
              {dueDateLabel}
            </div>
          </div>
        )}
      </div>

      {/* ── Metric grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14, marginBottom: 20 }}>
        <MetricCard
          icon={<Award size={14} />}
          label="Antigüedad"
          value={tenure || 'Nuevo'}
          sub={tenureStart ? `Desde ${fmtDateShort(tenureStart)}` : undefined}
          color="var(--teal-700)"
          bg="var(--teal-50)"
          border="var(--teal-200)"
        />
        <MetricCard
          icon={<DollarSign size={14} />}
          label="Monto por ciclo"
          value={sub.amount_per_cycle > 0 ? fmtAmt(sub.amount_per_cycle, sub.currency) : 'Por definir'}
          sub={cycleLabel || undefined}
          color="var(--ink-700)"
        />
        <MetricCard
          icon={<Calendar size={14} />}
          label="Próximo vencimiento"
          value={sub.next_billing_date ? fmtDateShort(sub.next_billing_date) : '—'}
          sub={daysUntilDue !== null ? dueDateLabel : undefined}
          color={dueDateColor}
          bg={daysUntilDue !== null && daysUntilDue <= 3 ? '#FEF2F2' : undefined}
          border={daysUntilDue !== null && daysUntilDue <= 3 ? '#FECACA' : undefined}
        />
        <MetricCard
          icon={<Receipt size={14} />}
          label="Pagos registrados"
          value={payments.length}
          sub={lastPayment ? `Último: ${fmtDateShort(lastPayment.payment_date)}` : 'Ninguno aún'}
          color="var(--ink-700)"
        />
        {sub.units_count > 0 && (
          <MetricCard
            icon={<Building2 size={14} />}
            label="Unidades"
            value={sub.units_count}
            sub="Unidades en el plan"
            color="var(--ink-700)"
          />
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 18 }}>

        {/* ── Estado de cuenta detallado ── */}
        <div style={{ background: 'var(--white)', border: '1px solid var(--sand-200)', borderRadius: 16, padding: 20 }}>
          <div style={{
            fontSize: 11, fontWeight: 800, color: 'var(--ink-400)', textTransform: 'uppercase',
            letterSpacing: '0.07em', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <CreditCard size={13} /> Estado de Cuenta
          </div>
          <InfoRow
            label="Estado de membresía"
            value={sub.status_label || s.label}
            accent={s.color}
          />
          <InfoRow label="Plan" value={sub.plan_name || 'Sin plan'} />
          <InfoRow label="Ciclo de facturación" value={cycleLabel || '—'} />
          <InfoRow label="Monto por ciclo"    value={sub.amount_per_cycle > 0 ? fmtAmt(sub.amount_per_cycle, sub.currency) : '—'} />
          <InfoRow label="Moneda"             value={sub.currency || '—'} />
          <InfoRow
            label="Próximo vencimiento"
            value={fmtDate(sub.next_billing_date)}
            accent={dueDateColor}
          />
          {graceEndStr && sub.status === 'active' && (
            <InfoRow
              label="Límite con período de gracia"
              value={fmtDate(graceEndStr)}
              accent={daysUntilGrace !== null && daysUntilGrace <= 0 ? '#DC2626' : 'var(--ink-600)'}
            />
          )}
          <InfoRow label="Pagos registrados" value={payments.length > 0 ? `${payments.length} pagos` : 'Ninguno'} />
          {lastPayment && (
            <InfoRow
              label="Último pago"
              value={`${fmtAmt(lastPayment.amount, lastPayment.currency)} · ${fmtDateShort(lastPayment.payment_date)}`}
              accent="#16A34A"
            />
          )}
        </div>

        {/* ── Antigüedad y datos del condominio ── */}
        <div style={{ background: 'var(--white)', border: '1px solid var(--sand-200)', borderRadius: 16, padding: 20 }}>
          <div style={{
            fontSize: 11, fontWeight: 800, color: 'var(--ink-400)', textTransform: 'uppercase',
            letterSpacing: '0.07em', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <TrendingUp size={13} /> Membresía y Antigüedad
          </div>
          {tenantData && (
            <>
              <InfoRow label="Condominio"  value={tenantData.name} />
              {tenantData.city && <InfoRow label="Ciudad" value={tenantData.city} />}
            </>
          )}
          {sub.trial_start && (
            <InfoRow label="Inicio de prueba"       value={fmtDate(sub.trial_start)} />
          )}
          {sub.trial_end && (
            <InfoRow label="Fin de prueba"          value={fmtDate(sub.trial_end)} />
          )}
          {sub.billing_start && (
            <InfoRow label="Inicio de facturación"  value={fmtDate(sub.billing_start)} />
          )}
          <InfoRow
            label="Antigüedad en Homly"
            value={tenure || 'Nuevo miembro'}
            accent="var(--teal-700)"
          />
          {sub.trial_days_remaining > 0 && sub.status === 'trial' && (
            <InfoRow
              label="Días restantes de prueba"
              value={`${sub.trial_days_remaining} días`}
              accent="#2563EB"
            />
          )}
        </div>

        {/* ── Notas ── */}
        {sub.notes && (
          <div style={{ gridColumn: '1 / -1', background: 'var(--sand-50)', border: '1px solid var(--sand-200)', borderRadius: 14, padding: 20 }}>
            <div style={{
              fontSize: 11, fontWeight: 800, color: 'var(--ink-400)', textTransform: 'uppercase',
              letterSpacing: '0.07em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <Bell size={13} /> Notas
            </div>
            <p style={{ fontSize: 14, color: 'var(--ink-600)', margin: 0, lineHeight: 1.6 }}>{sub.notes}</p>
          </div>
        )}

        {/* ── Historial de pagos ── */}
        <div style={{
          gridColumn: '1 / -1',
          background: 'var(--white)', border: '1px solid var(--sand-200)', borderRadius: 16, padding: 20,
        }}>
          <div style={{
            fontSize: 11, fontWeight: 800, color: 'var(--ink-400)', textTransform: 'uppercase',
            letterSpacing: '0.07em', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <Receipt size={13} /> Historial de Pagos
            {payments.length > 0 && (
              <span style={{
                marginLeft: 'auto', fontSize: 11, fontWeight: 700,
                background: 'var(--teal-50)', color: 'var(--teal-700)',
                border: '1px solid var(--teal-200)', borderRadius: 12, padding: '2px 10px',
              }}>
                {payments.length} {payments.length === 1 ? 'pago' : 'pagos'}
              </span>
            )}
          </div>

          {payments.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--ink-400)', padding: '24px 0', fontSize: 13 }}>
              <CreditCard size={28} color="var(--sand-300)" style={{ display: 'block', margin: '0 auto 10px' }} />
              No hay pagos registrados aún.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {sortedPays.map((p, idx) => (
                <div key={p.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 14px',
                  background: idx === 0 ? '#F0FDF4' : 'var(--sand-50)',
                  border: `1px solid ${idx === 0 ? '#BBF7D0' : 'var(--sand-100)'}`,
                  borderRadius: 10, gap: 12,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                      background: idx === 0 ? '#DCFCE7' : 'var(--sand-100)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <CheckCircle size={16} color={idx === 0 ? '#16A34A' : 'var(--ink-400)'} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink-800)' }}>
                        {fmtAmt(p.amount, p.currency)}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: 2 }}>
                        {p.period_label || '—'}
                        {p.payment_method_label ? ` · ${p.payment_method_label}` : ''}
                        {p.payment_date ? ` · ${fmtDate(p.payment_date)}` : ''}
                      </div>
                      {p.reference && (
                        <div style={{ fontSize: 11, color: 'var(--ink-300)', marginTop: 1 }}>
                          Ref: {p.reference}
                        </div>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => setReceiptPayment(p)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '7px 14px', background: 'var(--teal-50)',
                      border: '1.5px solid var(--teal-200)', borderRadius: 8,
                      fontSize: 12, fontWeight: 700, color: 'var(--teal-700)',
                      cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap',
                    }}
                  >
                    <Eye size={13} /> Ver recibo
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

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
              Nuestro equipo puede ayudarte con pagos, upgrades o cualquier situación con tu cuenta.
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

    {/* Receipt modal */}
    {receiptPayment && (
      <SubscriptionReceiptModal
        payment={receiptPayment}
        tenant={tenantData}
        sub={sub}
        onClose={() => setReceiptPayment(null)}
      />
    )}
  </>
  );
}
