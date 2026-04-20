import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { tenantsAPI, tenantSubscriptionsAPI, subscriptionPlansAPI } from '../api/client';
import { fmtCurrency, CURRENCIES } from '../utils/helpers';
import {
  Plus, Edit, Trash2, LogIn, Building2, Check, X, CreditCard,
  AlertCircle, CheckCircle, Clock, XCircle, ShieldOff, RefreshCw,
  DollarSign, Calendar, ChevronDown, ChevronUp,
} from 'lucide-react';
import toast from 'react-hot-toast';

// ─── Subscription status helpers ─────────────────────────────────────────────

const SUB_STATUS = {
  trial:     { label: 'Prueba',     color: '#2563EB', bg: '#EFF6FF', icon: Clock },
  active:    { label: 'Activa',     color: '#16A34A', bg: '#F0FDF4', icon: CheckCircle },
  past_due:  { label: 'Vencida',    color: '#D97706', bg: '#FFFBEB', icon: AlertCircle },
  cancelled: { label: 'Cancelada',  color: '#6B7280', bg: '#F9FAFB', icon: ShieldOff },
  expired:   { label: 'Expirada',   color: '#DC2626', bg: '#FEF2F2', icon: XCircle },
};

function SubBadge({ status }) {
  if (!status) return (
    <span style={{ fontSize: 10, color: '#9CA3AF', background: '#F3F4F6',
      borderRadius: 20, padding: '2px 8px', fontWeight: 700, textTransform: 'uppercase' }}>
      Sin membresía
    </span>
  );
  const s = SUB_STATUS[status] || { label: status, color: '#6B7280', bg: '#F3F4F6', icon: AlertCircle };
  const Icon = s.icon;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 10, fontWeight: 700, color: s.color,
      background: s.bg, borderRadius: 20, padding: '2px 8px',
      textTransform: 'uppercase', letterSpacing: '0.04em',
    }}>
      <Icon size={10} /> {s.label}
    </span>
  );
}

const fmtAmt = (amount, currency = 'MXN') => {
  const sym = { MXN: '$', USD: 'US$', EUR: '€', COP: 'COP$' };
  return `${sym[currency] || '$'}${Number(amount || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
};

// ─── Subscription Modal ───────────────────────────────────────────────────────

function SubscriptionModal({ tenant, onClose, onUpdated }) {
  const [sub, setSub] = useState(null);
  const [payments, setPayments] = useState([]);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('info'); // 'info' | 'payments' | 'update'
  const [saving, setSaving] = useState(false);
  const [expandPay, setExpandPay] = useState(false);

  // Update form state
  const [upd, setUpd] = useState({});

  // New payment form
  const [pay, setPay] = useState({
    amount: '', currency: 'MXN', period_label: '', payment_date: '',
    payment_method: 'transfer', reference: '', notes: '',
  });

  const loadSub = useCallback(async () => {
    setLoading(true);
    try {
      const [rSubs, rPlans] = await Promise.all([
        tenantSubscriptionsAPI.list({ tenant: tenant.id }),
        subscriptionPlansAPI.list({ active_only: 1 }),
      ]);
      const subs = rSubs.data.results || rSubs.data;
      const current = subs[0] || null;
      setSub(current);
      setPlans(rPlans.data.results || rPlans.data);
      if (current) {
        setUpd({
          status: current.status,
          plan: current.plan || '',
          trial_start: current.trial_start || '',
          trial_end: current.trial_end || '',
          billing_start: current.billing_start || '',
          next_billing_date: current.next_billing_date || '',
          amount_per_cycle: current.amount_per_cycle || '',
          currency: current.currency || 'MXN',
          notes: current.notes || '',
        });
        const rPay = await tenantSubscriptionsAPI.payments(current.id);
        setPayments(rPay.data);
      }
    } catch { toast.error('Error al cargar la suscripción'); }
    finally { setLoading(false); }
  }, [tenant.id]);

  useEffect(() => { loadSub(); }, [loadSub]);

  const handleUpdateSub = async () => {
    if (!sub) return;
    setSaving(true);
    try {
      const payload = {
        ...upd,
        plan: upd.plan || null,
        amount_per_cycle: Number(upd.amount_per_cycle) || 0,
      };
      await tenantSubscriptionsAPI.update(sub.id, payload);
      await tenantSubscriptionsAPI.syncStatus(sub.id);
      toast.success('Membresía actualizada');
      loadSub();
      onUpdated();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Error al actualizar');
    } finally { setSaving(false); }
  };

  const handleRecordPayment = async () => {
    if (!sub || !pay.amount || !pay.payment_date) {
      toast.error('Monto y fecha son obligatorios');
      return;
    }
    setSaving(true);
    try {
      await tenantSubscriptionsAPI.recordPayment(sub.id, {
        ...pay,
        amount: Number(pay.amount),
      });
      toast.success('Pago registrado');
      setPay({ amount: '', currency: sub.currency || 'MXN', period_label: '', payment_date: '', payment_method: 'transfer', reference: '', notes: '' });
      setExpandPay(false);
      loadSub();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Error al registrar pago');
    } finally { setSaving(false); }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)',
      padding: '16px',
    }} onClick={onClose}>
      <div style={{
        background: 'var(--white)', borderRadius: 20, width: '100%',
        maxWidth: 600, maxHeight: '90vh', overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 24px 16px', borderBottom: '1px solid var(--sand-100)',
        }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--ink-800)' }}>
              Membresía — {tenant.name}
            </div>
            <div style={{ fontSize: 13, color: 'var(--ink-400)', marginTop: 2 }}>
              Gestión de suscripción y pagos
            </div>
          </div>
          <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }} onClick={onClose}>
            <X size={18} color="var(--ink-400)" />
          </button>
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex', gap: 4, padding: '8px 16px 0',
          background: 'var(--sand-50)', borderBottom: '1px solid var(--sand-100)',
        }}>
          {[
            { id: 'info', label: 'Estado' },
            { id: 'payments', label: `Pagos${payments.length ? ` (${payments.length})` : ''}` },
            { id: 'update', label: 'Actualizar' },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: '8px 16px', fontSize: 13, fontWeight: 600,
              background: tab === t.id ? 'var(--white)' : 'transparent',
              border: 'none', borderRadius: '8px 8px 0 0',
              color: tab === t.id ? 'var(--teal-700)' : 'var(--ink-500)',
              cursor: 'pointer', borderBottom: tab === t.id ? '2px solid var(--teal-500)' : '2px solid transparent',
            }}>{t.label}</button>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--ink-400)' }}>
              Cargando…
            </div>
          ) : !sub ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--ink-400)' }}>
              <CreditCard size={36} style={{ opacity: 0.3, margin: '0 auto 12px', display: 'block' }} />
              <p style={{ fontWeight: 600 }}>Sin suscripción registrada</p>
              <p style={{ fontSize: 13, marginTop: 4 }}>La suscripción se crea automáticamente al aprobar la solicitud de prueba.</p>
            </div>
          ) : (
            <>
              {/* ── INFO TAB ── */}
              {tab === 'info' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* Status card */}
                  {(() => {
                    const s = SUB_STATUS[sub.status] || { label: sub.status_label || sub.status, color: '#6B7280', bg: '#F3F4F6', icon: AlertCircle };
                    const Icon = s.icon;
                    return (
                      <div style={{ background: s.bg, border: `1px solid ${s.color}30`, borderRadius: 14, padding: 20 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                          <Icon size={22} color={s.color} />
                          <span style={{ fontSize: 18, fontWeight: 800, color: s.color }}>{sub.status_label || s.label}</span>
                          {sub.status === 'trial' && sub.trial_days_remaining > 0 && (
                            <span style={{
                              fontSize: 12, fontWeight: 700, color: '#2563EB',
                              background: '#DBEAFE', borderRadius: 20, padding: '2px 10px',
                            }}>
                              {sub.trial_days_remaining} días restantes
                            </span>
                          )}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                          {[
                            ['Plan', sub.plan_name || 'Demo gratuita'],
                            ['Monto/ciclo', sub.amount_per_cycle > 0 ? fmtAmt(sub.amount_per_cycle, sub.currency) : '—'],
                            ['Inicio prueba', sub.trial_start || '—'],
                            ['Fin prueba', sub.trial_end || '—'],
                            ['Inicio facturación', sub.billing_start || '—'],
                            ['Próx. cobro', sub.next_billing_date || '—'],
                          ].map(([k, v]) => (
                            <div key={k}>
                              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-400)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{k}</div>
                              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-800)', marginTop: 2 }}>{v}</div>
                            </div>
                          ))}
                        </div>
                        {sub.notes && (
                          <div style={{ marginTop: 12, fontSize: 13, color: 'var(--ink-600)', fontStyle: 'italic' }}>
                            {sub.notes}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Tenant active status */}
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: tenant.is_active ? '#F0FDF4' : '#FEF2F2',
                    border: `1px solid ${tenant.is_active ? '#BBF7D0' : '#FECACA'}`,
                    borderRadius: 12, padding: '12px 16px',
                  }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: tenant.is_active ? '#15803D' : '#DC2626' }}>
                        Tenant {tenant.is_active ? 'activo' : 'inactivo'}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--ink-500)', marginTop: 2 }}>
                        {tenant.is_active ? 'Los usuarios pueden ingresar al sistema' : 'Acceso bloqueado para los usuarios'}
                      </div>
                    </div>
                    <button onClick={async () => {
                      try {
                        await tenantSubscriptionsAPI.syncStatus(sub.id);
                        toast.success('Estado sincronizado');
                        loadSub(); onUpdated();
                      } catch { toast.error('Error al sincronizar'); }
                    }} style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
                      background: 'var(--white)', border: '1px solid var(--sand-200)',
                      borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      color: 'var(--ink-600)',
                    }}>
                      <RefreshCw size={13} /> Sincronizar
                    </button>
                  </div>
                </div>
              )}

              {/* ── PAYMENTS TAB ── */}
              {tab === 'payments' && (
                <div>
                  {/* Add payment button */}
                  <button onClick={() => setExpandPay(p => !p)} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 16px', marginBottom: 16,
                    background: 'var(--teal-600)', color: 'white', border: 'none',
                    borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    width: '100%', justifyContent: 'center',
                  }}>
                    <DollarSign size={15} />
                    {expandPay ? 'Cancelar' : 'Registrar Pago'}
                    {expandPay ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>

                  {/* Payment form */}
                  {expandPay && (
                    <div style={{
                      background: 'var(--sand-50)', border: '1px solid var(--sand-200)',
                      borderRadius: 12, padding: 16, marginBottom: 16,
                      display: 'flex', flexDirection: 'column', gap: 12,
                    }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        {[
                          { key: 'amount', label: 'Monto', type: 'number', placeholder: '0.00' },
                          { key: 'payment_date', label: 'Fecha', type: 'date' },
                          { key: 'period_label', label: 'Período cubierto', type: 'text', placeholder: 'Ej: Enero 2025' },
                          { key: 'reference', label: 'Referencia', type: 'text', placeholder: 'No. de transacción' },
                        ].map(({ key, label, type, placeholder }) => (
                          <div key={key}>
                            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--ink-500)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{label}</label>
                            <input type={type} value={pay[key]} placeholder={placeholder}
                              onChange={e => setPay(p => ({ ...p, [key]: e.target.value }))}
                              style={{ width: '100%', border: '1px solid var(--sand-200)', borderRadius: 8, padding: '7px 10px', fontSize: 13, boxSizing: 'border-box' }} />
                          </div>
                        ))}
                        <div>
                          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--ink-500)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Método</label>
                          <select value={pay.payment_method} onChange={e => setPay(p => ({ ...p, payment_method: e.target.value }))}
                            style={{ width: '100%', border: '1px solid var(--sand-200)', borderRadius: 8, padding: '7px 10px', fontSize: 13 }}>
                            <option value="transfer">Transferencia</option>
                            <option value="cash">Efectivo</option>
                            <option value="card">Tarjeta</option>
                            <option value="other">Otro</option>
                          </select>
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--ink-500)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Moneda</label>
                          <select value={pay.currency} onChange={e => setPay(p => ({ ...p, currency: e.target.value }))}
                            style={{ width: '100%', border: '1px solid var(--sand-200)', borderRadius: 8, padding: '7px 10px', fontSize: 13 }}>
                            {['MXN', 'USD', 'EUR', 'COP'].map(c => <option key={c}>{c}</option>)}
                          </select>
                        </div>
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--ink-500)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Notas</label>
                        <textarea value={pay.notes} onChange={e => setPay(p => ({ ...p, notes: e.target.value }))} rows={2}
                          style={{ width: '100%', border: '1px solid var(--sand-200)', borderRadius: 8, padding: '7px 10px', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }} />
                      </div>
                      <button onClick={handleRecordPayment} disabled={saving} style={{
                        padding: '9px 0', background: 'var(--teal-600)', color: 'white',
                        border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700,
                        cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1,
                      }}>
                        {saving ? 'Guardando…' : 'Confirmar Pago'}
                      </button>
                    </div>
                  )}

                  {/* Payment history */}
                  {payments.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--ink-400)' }}>
                      <DollarSign size={32} style={{ opacity: 0.3, margin: '0 auto 10px', display: 'block' }} />
                      <p style={{ fontSize: 13 }}>Sin pagos registrados</p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {payments.map(p => (
                        <div key={p.id} style={{
                          background: 'var(--sand-50)', border: '1px solid var(--sand-100)',
                          borderRadius: 10, padding: '12px 14px',
                          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                        }}>
                          <div>
                            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--teal-700)' }}>
                              {fmtAmt(p.amount, p.currency)}
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--ink-500)', marginTop: 3 }}>
                              {p.period_label ? `${p.period_label} · ` : ''}{p.payment_method_label}
                              {p.reference ? ` · Ref: ${p.reference}` : ''}
                            </div>
                            {p.recorded_by_name && (
                              <div style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 2 }}>
                                Registrado por {p.recorded_by_name}
                              </div>
                            )}
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-700)' }}>{p.payment_date}</div>
                            {p.notes && <div style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 2, maxWidth: 150 }}>{p.notes}</div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── UPDATE TAB ── */}
              {tab === 'update' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--ink-500)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Estado</label>
                      <select value={upd.status} onChange={e => setUpd(p => ({ ...p, status: e.target.value }))}
                        style={{ width: '100%', border: '1px solid var(--sand-200)', borderRadius: 8, padding: '8px 10px', fontSize: 13 }}>
                        <option value="trial">Período de Prueba</option>
                        <option value="active">Activa</option>
                        <option value="past_due">Vencida</option>
                        <option value="cancelled">Cancelada</option>
                        <option value="expired">Expirada</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--ink-500)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Plan</label>
                      <select value={upd.plan || ''} onChange={e => setUpd(p => ({ ...p, plan: e.target.value || null }))}
                        style={{ width: '100%', border: '1px solid var(--sand-200)', borderRadius: 8, padding: '8px 10px', fontSize: 13 }}>
                        <option value="">Sin plan</option>
                        {plans.map(pl => <option key={pl.id} value={pl.id}>{pl.name}</option>)}
                      </select>
                    </div>
                    {[
                      { key: 'trial_start', label: 'Inicio Prueba', type: 'date' },
                      { key: 'trial_end',   label: 'Fin Prueba',    type: 'date' },
                      { key: 'billing_start', label: 'Inicio Facturación', type: 'date' },
                      { key: 'next_billing_date', label: 'Próx. Cobro', type: 'date' },
                      { key: 'amount_per_cycle', label: 'Monto/Ciclo', type: 'number' },
                      { key: 'currency', label: 'Moneda', type: 'select', options: ['MXN','USD','EUR','COP'] },
                    ].map(({ key, label, type, options }) => (
                      <div key={key}>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--ink-500)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{label}</label>
                        {type === 'select' ? (
                          <select value={upd[key] || ''} onChange={e => setUpd(p => ({ ...p, [key]: e.target.value }))}
                            style={{ width: '100%', border: '1px solid var(--sand-200)', borderRadius: 8, padding: '8px 10px', fontSize: 13 }}>
                            {options.map(o => <option key={o}>{o}</option>)}
                          </select>
                        ) : (
                          <input type={type} value={upd[key] || ''}
                            onChange={e => setUpd(p => ({ ...p, [key]: e.target.value }))}
                            style={{ width: '100%', border: '1px solid var(--sand-200)', borderRadius: 8, padding: '8px 10px', fontSize: 13, boxSizing: 'border-box' }} />
                        )}
                      </div>
                    ))}
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--ink-500)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Notas Internas</label>
                    <textarea value={upd.notes || ''} onChange={e => setUpd(p => ({ ...p, notes: e.target.value }))} rows={3}
                      style={{ width: '100%', border: '1px solid var(--sand-200)', borderRadius: 8, padding: '8px 10px', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }} />
                  </div>
                  <div style={{ fontSize: 12, color: '#D97706', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '10px 12px' }}>
                    ⚠️ Cambiar el estado a Cancelado o Expirado desactivará automáticamente el acceso del tenant al sistema.
                  </div>
                  <button onClick={handleUpdateSub} disabled={saving} style={{
                    padding: '10px 0', background: 'var(--teal-600)', color: 'white',
                    border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700,
                    cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1,
                  }}>
                    {saving ? 'Guardando…' : 'Actualizar Membresía'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Tenants page ────────────────────────────────────────────────────────

export default function Tenants() {
  const { isSuperAdmin, switchTenant, tenantId: activeTenantId } = useAuth();
  const navigate = useNavigate();

  const [tenants,       setTenants]       = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [saving,        setSaving]        = useState(false);
  const [showModal,     setShowModal]     = useState(false);
  const [form,          setForm]          = useState({});
  const [entering,      setEntering]      = useState(null);
  const [subModal,      setSubModal]      = useState(null); // tenant object for sub modal

  const load = () => {
    tenantsAPI.list()
      .then(r => setTenants(r.data.results || r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleEnter = async (t) => {
    if (entering) return;
    setEntering(t.id);
    try {
      await switchTenant(t.id);
      navigate('/app/dashboard');
    } catch {
      toast.error('No se pudo acceder al condominio.');
    } finally {
      setEntering(null);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        units_count: form.units_count,
        maintenance_fee: form.maintenance_fee,
        currency: form.currency,
        country: form.country,
        state: form.state,
      };
      if (form.id) {
        await tenantsAPI.update(form.id, payload);
        toast.success('Condominio actualizado');
      } else {
        await tenantsAPI.create(payload);
        toast.success('Condominio creado');
      }
      setShowModal(false);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`¿Eliminar "${name}"? Esta acción es irreversible.`)) return;
    try {
      await tenantsAPI.delete(id);
      toast.success('Condominio eliminado');
      load();
    } catch { toast.error('Error al eliminar'); }
  };

  if (loading) return (
    <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--ink-400)' }}>
      Cargando condominios…
    </div>
  );

  return (
    <div className="content-fade">

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="badge badge-teal">{tenants.length} condominios</span>
          {activeTenantId && <span className="badge badge-gray">Activo seleccionado</span>}
        </div>
        {isSuperAdmin && (
          <button className="btn btn-primary" onClick={() => { setForm({}); setShowModal(true); }}>
            <Plus size={16} /> Nuevo Condominio
          </button>
        )}
      </div>

      {/* Tenant cards */}
      {tenants.length === 0 ? (
        <div className="card" style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--ink-400)' }}>
          <Building2 size={40} style={{ opacity: 0.3, marginBottom: 12, display: 'block', margin: '0 auto 12px' }} />
          <p style={{ fontWeight: 600 }}>No hay condominios registrados.</p>
          <p style={{ fontSize: 13, marginTop: 4 }}>Crea el primer condominio con el botón superior.</p>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: 16,
        }}>
          {tenants.map(t => {
            const isActive  = t.id === activeTenantId;
            const isLoading = entering === t.id;
            const subStatus = t.subscription_status;

            return (
              <div key={t.id} style={{
                background: 'var(--white)',
                border: `2px solid ${isActive ? 'var(--teal-400)' : t.is_active === false ? '#FECACA' : 'var(--sand-100)'}`,
                borderRadius: 16, padding: 20,
                display: 'flex', flexDirection: 'column', gap: 14,
                transition: 'box-shadow 0.15s, border-color 0.15s',
                boxShadow: isActive
                  ? '0 0 0 3px rgba(20,184,166,0.12)'
                  : t.is_active === false ? '0 2px 8px rgba(220,38,38,0.08)' : '0 1px 4px rgba(0,0,0,0.06)',
              }}>
                {/* Top row */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                    background: t.is_active === false ? '#FEE2E2' : isActive ? 'var(--teal-500)' : 'var(--sand-100)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 18, fontWeight: 800,
                    color: t.is_active === false ? '#DC2626' : isActive ? 'white' : 'var(--ink-500)',
                  }}>
                    {t.name?.[0]?.toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink-800)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.name}
                    </div>
                    {t.country && (
                      <div style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: 2 }}>
                        {t.state ? `${t.state}, ` : ''}{t.country}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    {isActive && (
                      <span style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        fontSize: 10, fontWeight: 700, color: 'var(--teal-600)',
                        background: 'var(--teal-50)', border: '1px solid var(--teal-200)',
                        borderRadius: 20, padding: '2px 8px',
                        textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0,
                      }}>
                        <Check size={10} /> Activo
                      </span>
                    )}
                    {t.is_active === false && (
                      <span style={{
                        fontSize: 10, fontWeight: 700, color: '#DC2626',
                        background: '#FEE2E2', borderRadius: 20, padding: '2px 8px',
                        textTransform: 'uppercase',
                      }}>Inactivo</span>
                    )}
                  </div>
                </div>

                {/* Subscription status row */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  background: 'var(--sand-50)', borderRadius: 10, padding: '8px 12px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <CreditCard size={13} color="var(--ink-400)" />
                    <span style={{ fontSize: 12, color: 'var(--ink-500)', fontWeight: 600 }}>
                      {t.subscription_plan_name || 'Sin plan'}
                    </span>
                  </div>
                  <SubBadge status={subStatus} />
                </div>

                {/* Stats row */}
                <div style={{ display: 'flex', gap: 8, padding: '10px 12px', background: 'var(--sand-50)', borderRadius: 10 }}>
                  <div style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink-800)' }}>
                      {t.units_actual ?? t.units_count ?? 0}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--ink-400)', fontWeight: 600 }}>Unidades</div>
                  </div>
                  <div style={{ width: 1, background: 'var(--sand-100)' }} />
                  <div style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--teal-700)' }}>
                      {fmtCurrency(t.maintenance_fee, t.currency)}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--ink-400)', fontWeight: 600 }}>Mantenimiento</div>
                  </div>
                  <div style={{ width: 1, background: 'var(--sand-100)' }} />
                  <div style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink-700)' }}>
                      {t.currency || 'MXN'}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--ink-400)', fontWeight: 600 }}>Moneda</div>
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button onClick={() => handleEnter(t)} disabled={!!entering}
                    style={{
                      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      gap: 6, padding: '8px 14px',
                      background: isActive ? 'var(--teal-500)' : 'var(--teal-600)',
                      color: 'white', border: 'none', borderRadius: 10,
                      fontSize: 13, fontWeight: 700, cursor: entering ? 'default' : 'pointer',
                      opacity: entering && !isLoading ? 0.5 : 1,
                    }}>
                    {isLoading ? 'Entrando…' : isActive ? <><Check size={14} /> Activo</> : <><LogIn size={14} /> Entrar</>}
                  </button>

                  {/* Subscription */}
                  <button title="Gestionar Membresía"
                    onClick={() => setSubModal(t)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      width: 36, height: 36, background: '#EFF6FF',
                      border: '1px solid #BFDBFE', borderRadius: 10, cursor: 'pointer',
                      color: '#2563EB',
                    }}>
                    <CreditCard size={14} />
                  </button>

                  <button className="btn-icon" onClick={() => { setForm(t); setShowModal(true); }} title="Editar">
                    <Edit size={14} />
                  </button>

                  {isSuperAdmin && (
                    <button className="btn-icon" style={{ color: 'var(--coral-500)' }}
                      onClick={() => handleDelete(t.id, t.name)} title="Eliminar">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit/Create modal */}
      {showModal && (
        <div className="modal-bg open" onClick={() => setShowModal(false)}>
          <div className="modal lg" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3>{form.id ? 'Editar' : 'Nuevo'} Condominio</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="field field-full">
                  <label className="field-label">Nombre</label>
                  <input className="field-input" value={form.name || ''} onChange={e => setForm({...form, name: e.target.value})} />
                </div>
                <div className="field">
                  <label className="field-label">Unidades Planeadas</label>
                  <input type="number" className="field-input" value={form.units_count || ''} onChange={e => setForm({...form, units_count: e.target.value})} />
                </div>
                <div className="field">
                  <label className="field-label">Cuota Mantenimiento</label>
                  <input type="number" className="field-input" step="0.01" min="0" value={form.maintenance_fee || ''} onChange={e => setForm({...form, maintenance_fee: e.target.value})} />
                </div>
                <div className="field">
                  <label className="field-label">Moneda</label>
                  <select className="field-select" value={form.currency || 'MXN'} onChange={e => setForm({...form, currency: e.target.value})}>
                    {Object.entries(CURRENCIES).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label className="field-label">País</label>
                  <input className="field-input" value={form.country || ''} onChange={e => setForm({...form, country: e.target.value})} />
                </div>
                <div className="field">
                  <label className="field-label">Estado / Región</label>
                  <input className="field-input" value={form.state || ''} onChange={e => setForm({...form, state: e.target.value})} />
                </div>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-outline" onClick={() => setShowModal(false)} disabled={saving}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Subscription modal */}
      {subModal && (
        <SubscriptionModal
          tenant={subModal}
          onClose={() => setSubModal(null)}
          onUpdated={load}
        />
      )}
    </div>
  );
}
