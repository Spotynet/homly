import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { notificationsAPI } from '../api/client';
import { isModuleVisible } from '../constants/modulePermissions';
import { Bell, CheckCheck, Calendar, Filter, Lock } from 'lucide-react';
import toast from 'react-hot-toast';
import { useNotificacionesData } from '../hooks/useNotificacionesData';
import { useTenantData }         from '../hooks/useTenantData';
import { queryKeys }             from '../hooks/queryKeys';

// Maps notification type → required module key (mirrors backend _NOTIF_MODULE_MAP)
const NOTIF_MODULE_MAP = {
  reservation_new:       'reservas',
  reservation_approved:  'reservas',
  reservation_rejected:  'reservas',
  reservation_cancelled: 'reservas',
  payment_registered:    'estado_cuenta',
  payment_updated:       'estado_cuenta',
  payment_deleted:       'estado_cuenta',
  period_closed:         'cobranza',
  period_reopened:       'cobranza',
  plan_proposal_sent:    'plan_pagos',
  plan_accepted:         'plan_pagos',
  plan_rejected:         'plan_pagos',
  plan_cancelled:        'plan_pagos',
  plan_installment_paid: 'plan_pagos',
  rental_property_created:   'rentas_propiedades',
  rental_property_status:    'rentas_propiedades',
  rental_contract_created:   'rentas_contratos',
  rental_contract_activated: 'rentas_contratos',
  rental_contract_finished:  'rentas_contratos',
  rental_contract_expiring:  'rentas_calendario',
  rental_contract_expired:   'rentas_calendario',
  rental_charge_generated:   'rentas_cobranza',
  rental_payment_registered: 'rentas_cobranza',
  rental_payment_deleted:    'rentas_cobranza',
  rental_lead_created:       'rentas_crm',
  rental_lead_moved:         'rentas_crm',
  rental_lead_converted:     'rentas_crm',
  rental_lead_lost:          'rentas_crm',
  rental_airbnb_imported:    'rentas_propiedades',
  rental_airbnb_synced:      'rentas_propiedades',
  rental_airbnb_error:       'rentas_propiedades',
  package_received:          'paqueteria',
  package_delivered:         'paqueteria',
};

const TYPE_CFG = {
  // Reservas
  reservation_new:       { icon: '📅', label: 'Nueva reserva',         color: 'var(--blue-500)',   bg: 'var(--blue-50)'   },
  reservation_approved:  { icon: '✅', label: 'Reserva aprobada',      color: 'var(--teal-600)',   bg: 'var(--teal-50)'   },
  reservation_rejected:  { icon: '❌', label: 'Reserva rechazada',     color: 'var(--coral-600)',  bg: 'var(--coral-50)'  },
  reservation_cancelled: { icon: '🚫', label: 'Reserva cancelada',     color: 'var(--ink-500)',    bg: 'var(--sand-50)'   },
  // Cobranza
  payment_registered:    { icon: '💰', label: 'Pago registrado',       color: 'var(--teal-700)',   bg: 'var(--teal-50)'   },
  payment_updated:       { icon: '✏️', label: 'Pago actualizado',      color: 'var(--blue-600)',   bg: 'var(--blue-50)'   },
  payment_deleted:       { icon: '🗑️', label: 'Cobro eliminado',       color: 'var(--coral-600)',  bg: 'var(--coral-50)'  },
  // Plan de pagos
  plan_proposal_sent:    { icon: '📋', label: 'Propuesta de plan',     color: '#6366f1',           bg: '#eef2ff'          },
  plan_accepted:         { icon: '🤝', label: 'Plan aceptado',         color: 'var(--teal-700)',   bg: 'var(--teal-50)'   },
  plan_rejected:         { icon: '↩️', label: 'Plan rechazado',        color: 'var(--coral-600)',  bg: 'var(--coral-50)'  },
  plan_cancelled:        { icon: '🚫', label: 'Plan cancelado',        color: 'var(--ink-500)',    bg: 'var(--sand-50)'   },
  plan_installment_paid: { icon: '✅', label: 'Cuota del plan pagada', color: 'var(--teal-700)',   bg: 'var(--teal-50)'   },
  // Períodos
  period_closed:         { icon: '🔒', label: 'Período cerrado',       color: 'var(--amber-700)',  bg: 'var(--amber-50)'  },
  period_reopened:       { icon: '🔓', label: 'Período reabierto',     color: 'var(--teal-600)',   bg: 'var(--teal-50)'   },
  rental_property_created:   { icon: '🏠', label: 'Propiedad registrada', color: 'var(--teal-700)',  bg: 'var(--teal-50)'  },
  rental_property_status:    { icon: '🏷️', label: 'Estado de propiedad',  color: 'var(--blue-600)',  bg: 'var(--blue-50)'  },
  rental_contract_created:   { icon: '📄', label: 'Contrato creado',      color: 'var(--blue-600)',  bg: 'var(--blue-50)'  },
  rental_contract_activated: { icon: '✅', label: 'Contrato activado',    color: 'var(--teal-700)',  bg: 'var(--teal-50)'  },
  rental_contract_finished:  { icon: '📁', label: 'Contrato cerrado',     color: 'var(--amber-700)', bg: 'var(--amber-50)' },
  rental_contract_expiring:  { icon: '⏳', label: 'Contrato por vencer',  color: 'var(--amber-700)', bg: 'var(--amber-50)' },
  rental_contract_expired:   { icon: '⚠️', label: 'Contrato vencido',     color: 'var(--coral-600)', bg: 'var(--coral-50)' },
  rental_charge_generated:   { icon: '📑', label: 'Cargos del período',   color: 'var(--teal-700)',  bg: 'var(--teal-50)'  },
  rental_payment_registered: { icon: '💳', label: 'Pago de renta',        color: 'var(--teal-700)',  bg: 'var(--teal-50)'  },
  rental_payment_deleted:    { icon: '🗑️', label: 'Pago eliminado',       color: 'var(--coral-600)', bg: 'var(--coral-50)' },
  rental_lead_created:       { icon: '🎯', label: 'Nuevo lead',           color: 'var(--blue-600)',  bg: 'var(--blue-50)'  },
  rental_lead_moved:         { icon: '📌', label: 'Lead actualizado',     color: '#6366f1',          bg: '#eef2ff'         },
  rental_lead_converted:     { icon: '🤝', label: 'Lead convertido',      color: 'var(--teal-700)',  bg: 'var(--teal-50)'  },
  rental_lead_lost:          { icon: '↩️', label: 'Lead perdido',         color: 'var(--amber-700)', bg: 'var(--amber-50)' },
  rental_airbnb_imported:    { icon: '🔗', label: 'Airbnb importado',     color: 'var(--blue-700)',  bg: 'var(--blue-50)'  },
  rental_airbnb_synced:      { icon: '🔄', label: 'Airbnb sincronizado',  color: 'var(--blue-700)',  bg: 'var(--blue-50)'  },
  rental_airbnb_error:       { icon: '⚠️', label: 'Error de Airbnb',      color: 'var(--coral-600)', bg: 'var(--coral-50)' },
  general:               { icon: 'ℹ️', label: 'General',               color: 'var(--amber-600)',  bg: 'var(--amber-50)'  },
  package_received:      { icon: '📦', label: 'Paquete recibido',      color: 'var(--teal-700)',   bg: 'var(--teal-50)'   },
  package_delivered:     { icon: '✍️', label: 'Paquete entregado',     color: 'var(--teal-600)',   bg: 'var(--teal-50)'   },
};

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (diff < 60)    return 'hace un momento';
  if (diff < 3600)  return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
  if (diff < 86400 * 7) return `hace ${Math.floor(diff / 86400)} días`;
  return new Date(dateStr).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function Notificaciones() {
  const { tenantId, role, profileId, workspaceType } = useAuth();
  const navigate = useNavigate();

  const queryClient = useQueryClient();
  const [filter,     setFilter]    = useState('all'); // 'all' | 'unread'
  const [typeFilter, setTypeFilter] = useState('all');

  // ── React Query: notificaciones ──────────────────────────────────────────
  const { notifications: notifs, isLoading: loading } = useNotificacionesData(tenantId);

  // ── React Query: datos del tenant (para permisos de módulos) ─────────────
  const { data: tenantData } = useTenantData(tenantId);
  const modulePerms    = (role !== 'superadmin' ? tenantData?.module_permissions : null) || {};
  const customProfiles = Array.isArray(tenantData?.custom_profiles) ? tenantData.custom_profiles : [];

  // Resolve active custom profile
  const activeProfile = profileId
    ? customProfiles.find(p => String(p.id) === String(profileId)) || null
    : null;

  // Returns true if current role has access to the module linked to a notification
  const canNavigateNotif = (n) => {
    if (!role || role === 'superadmin' || role === 'admin') return true;
    const moduleKey = n.related_reservation_id ? 'reservas' : NOTIF_MODULE_MAP[n.notif_type];
    if (!moduleKey) return false;
    if (activeProfile) {
      return isModuleVisible(activeProfile.modules, moduleKey, null, true);
    }
    return isModuleVisible(modulePerms[role], moduleKey, role);
  };

  const handleMarkAll = async () => {
    await notificationsAPI.markAllRead(tenantId).catch(() => {});
    // Actualización optimista en caché: no hace falta un nuevo fetch
    queryClient.setQueryData(queryKeys.notificaciones(tenantId),
      (prev) => prev?.map(n => ({ ...n, is_read: true })) ?? []
    );
    toast.success('Todas marcadas como leídas');
  };

  const handleClickNotif = async (n) => {
    if (!n.is_read) {
      await notificationsAPI.markRead(tenantId, n.id).catch(() => {});
      queryClient.setQueryData(queryKeys.notificaciones(tenantId),
        (prev) => prev?.map(x => x.id === n.id ? { ...x, is_read: true } : x) ?? []
      );
    }
    if (!canNavigateNotif(n)) return; // no module access → mark read only, no navigation
    if (n.related_reservation_id) navigate('/app/reservas');
    else if (['plan_proposal_sent','plan_accepted','plan_rejected','plan_cancelled','plan_installment_paid'].includes(n.notif_type)) navigate('/app/plan-pagos');
    else if (['payment_registered','payment_updated','payment_deleted'].includes(n.notif_type)) {
      // Residentes only have EC access (no cobranza); all other roles go to cobranza
      navigate(role === 'vecino' ? '/app/estado-cuenta' : '/app/cobranza');
    }
    else if (['period_closed','period_reopened'].includes(n.notif_type)) navigate('/app/cobranza');
    else if ((n.notif_type || '').startsWith('rental_lead')) navigate('/app/rentas/crm');
    else if (['rental_contract_expiring','rental_contract_expired'].includes(n.notif_type)) navigate('/app/rentas/calendario');
    else if ((n.notif_type || '').startsWith('rental_contract')) navigate('/app/rentas/contratos');
    else if ((n.notif_type || '').startsWith('rental_charge') || (n.notif_type || '').startsWith('rental_payment')) navigate('/app/rentas/cobranza');
    else if ((n.notif_type || '').startsWith('rental_')) navigate('/app/rentas/propiedades');
    else if ((n.notif_type || '').startsWith('package_')) navigate('/app/paqueteria');
  };

  // Apply filters
  const visible = notifs.filter(n => {
    if (filter === 'unread' && n.is_read) return false;
    if (typeFilter !== 'all' && n.notif_type !== typeFilter) return false;
    return true;
  });

  const unreadCount = notifs.filter(n => !n.is_read).length;

  const isRentas = workspaceType === 'rentas';
  const typeOptions = isRentas ? [
    { value: 'all',                      label: 'Todos los tipos' },
    { value: 'rental_property_created',  label: '🏠 Propiedad registrada' },
    { value: 'rental_property_status',   label: '🏷️ Estado de propiedad' },
    { value: 'rental_contract_created',  label: '📄 Contrato creado' },
    { value: 'rental_contract_activated',label: '✅ Contrato activado' },
    { value: 'rental_contract_finished', label: '📁 Contrato cerrado' },
    { value: 'rental_contract_expiring', label: '⏳ Contrato por vencer' },
    { value: 'rental_contract_expired',  label: '⚠️ Contrato vencido' },
    { value: 'rental_charge_generated',  label: '📑 Cargos del período' },
    { value: 'rental_payment_registered',label: '💳 Pago de renta' },
    { value: 'rental_payment_deleted',   label: '🗑️ Pago eliminado' },
    { value: 'rental_lead_created',      label: '🎯 Nuevo lead' },
    { value: 'rental_lead_moved',        label: '📌 Lead actualizado' },
    { value: 'rental_lead_converted',    label: '🤝 Lead convertido' },
    { value: 'rental_lead_lost',         label: '↩️ Lead perdido' },
    { value: 'rental_airbnb_imported',   label: '🔗 Airbnb importado' },
    { value: 'rental_airbnb_synced',     label: '🔄 Airbnb sincronizado' },
    { value: 'rental_airbnb_error',      label: '⚠️ Error de Airbnb' },
    { value: 'general',                  label: 'ℹ️ General' },
  ] : [
    { value: 'all',                  label: 'Todos los tipos' },
    { value: 'reservation_new',      label: '📅 Nueva reserva' },
    { value: 'reservation_approved', label: '✅ Reserva aprobada' },
    { value: 'reservation_rejected', label: '❌ Reserva rechazada' },
    { value: 'reservation_cancelled',label: '🚫 Reserva cancelada' },
    { value: 'payment_registered',   label: '💰 Pago registrado' },
    { value: 'payment_updated',      label: '✏️ Pago actualizado' },
    { value: 'payment_deleted',      label: '🗑️ Cobro eliminado' },
    { value: 'plan_proposal_sent',   label: '📋 Propuesta de plan' },
    { value: 'plan_accepted',        label: '🤝 Plan aceptado' },
    { value: 'plan_rejected',        label: '↩️ Plan rechazado' },
    { value: 'plan_cancelled',       label: '🚫 Plan cancelado' },
    { value: 'period_closed',        label: '🔒 Período cerrado' },
    { value: 'period_reopened',      label: '🔓 Período reabierto' },
    { value: 'general',              label: 'ℹ️ General' },
  ];

  return (
    <div className="content-fade">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink-800)', margin: 0 }}>Notificaciones</h2>
          <p style={{ fontSize: 13, color: 'var(--ink-400)', margin: '4px 0 0' }}>
            {unreadCount > 0
              ? <><span style={{ color: 'var(--coral-500)', fontWeight: 700 }}>{unreadCount} sin leer</span> · {notifs.length} en total</>
              : `${notifs.length} notificacion${notifs.length !== 1 ? 'es' : ''}`
            }
          </p>
        </div>
        {unreadCount > 0 && (
          <button className="btn btn-secondary btn-sm" onClick={handleMarkAll} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <CheckCheck size={14} /> Marcar todas como leídas
          </button>
        )}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {[['all', 'Todas'], ['unread', 'Sin leer']].map(([v, l]) => (
            <button
              key={v}
              onClick={() => setFilter(v)}
              className={`tab ${filter === v ? 'active' : ''}`}
              style={{ padding: '5px 12px', fontSize: 12 }}
            >
              {l}
              {v === 'unread' && unreadCount > 0 && (
                <span className="badge badge-coral" style={{ marginLeft: 5, fontSize: 10, padding: '1px 5px' }}>{unreadCount}</span>
              )}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 4 }}>
          <Filter size={13} color="var(--ink-400)" />
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            style={{ fontSize: 12, padding: '4px 8px', border: '1px solid var(--sand-100)', borderRadius: 6, color: 'var(--ink-700)', background: 'var(--white)', cursor: 'pointer' }}
          >
            {typeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="card">
          <div className="card-body" style={{ textAlign: 'center', padding: '50px 20px', color: 'var(--ink-400)', fontSize: 13 }}>
            Cargando notificaciones…
          </div>
        </div>
      ) : visible.length === 0 ? (
        <div className="card">
          <div className="card-body" style={{ textAlign: 'center', padding: '60px 20px' }}>
            <Bell size={44} color="var(--sand-200)" style={{ display: 'block', margin: '0 auto 14px' }} />
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink-500)', marginBottom: 4 }}>
              {filter === 'unread' ? 'No tienes notificaciones sin leer' : 'Sin notificaciones'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-300)' }}>
              Las notificaciones de {isRentas ? 'contratos, cobranza, CRM y Airbnb' : 'pagos, reservas y avisos del condominio'} aparecerán aquí
            </div>
          </div>
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          {visible.map((n, idx) => {
            const cfg    = TYPE_CFG[n.notif_type] || TYPE_CFG.general;
            const canNav = canNavigateNotif(n);
            return (
              <button
                key={n.id}
                onClick={() => handleClickNotif(n)}
                title={canNav ? undefined : 'Tu rol no tiene acceso al módulo de esta notificación'}
                style={{
                  width: '100%', display: 'flex', alignItems: 'flex-start', gap: 14,
                  padding: '14px 20px', border: 'none', textAlign: 'left',
                  background: n.is_read ? 'transparent' : 'var(--teal-50)',
                  borderBottom: idx < visible.length - 1 ? '1px solid var(--sand-50)' : 'none',
                  cursor: canNav ? 'pointer' : 'default',
                  transition: 'background 0.1s',
                  opacity: canNav ? 1 : 0.72,
                }}
                onMouseEnter={e => { if (canNav) e.currentTarget.style.background = n.is_read ? 'var(--sand-50)' : 'var(--teal-100)'; }}
                onMouseLeave={e => e.currentTarget.style.background = n.is_read ? 'transparent' : 'var(--teal-50)'}
              >
                {/* Icon bubble */}
                <div style={{
                  width: 40, height: 40, borderRadius: 10, background: cfg.bg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 18, flexShrink: 0,
                }}>
                  {cfg.icon}
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: n.is_read ? 500 : 700, color: 'var(--ink-800)', lineHeight: 1.4 }}>
                      {n.title}
                    </span>
                    <span style={{
                      fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 20,
                      background: cfg.bg, color: cfg.color, flexShrink: 0,
                    }}>
                      {cfg.label}
                    </span>
                    {!canNav && (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 3,
                        fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 20,
                        background: 'var(--sand-100)', color: 'var(--ink-400)', flexShrink: 0,
                      }}>
                        <Lock size={9} /> Sin acceso
                      </span>
                    )}
                  </div>
                  {n.message && (
                    <div style={{ fontSize: 12, color: 'var(--ink-500)', marginTop: 3, lineHeight: 1.5 }}>
                      {n.message}
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                    <Calendar size={11} color="var(--ink-300)" />
                    <span style={{ fontSize: 11, color: 'var(--ink-300)' }}>{timeAgo(n.created_at)}</span>
                    {canNav && n.related_reservation_id && (
                      <span style={{ fontSize: 11, color: 'var(--teal-500)', fontWeight: 600 }}>Ver reserva →</span>
                    )}
                  </div>
                </div>

                {/* Unread dot */}
                {!n.is_read && (
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--teal-500)', flexShrink: 0, marginTop: 6 }} />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
