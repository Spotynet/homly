import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Home, Calendar, FileText, Bell,
  ChevronRight, ChevronLeft, X, Check,
  DollarSign, Clock, CheckCircle, AlertCircle,
  Sparkles, MapPin, ArrowRight,
} from 'lucide-react';

// ─── Llave de localStorage por usuario ────────────────────────────────────
export const onboardingKey = (userId) => `homly_onboarding_done_${userId}`;

// ─── Pasos del tour ────────────────────────────────────────────────────────
function buildSteps(tenantName, userName) {
  return [
    // 0 — Bienvenida
    {
      id: 'welcome',
      icon: null,
      emoji: '👋',
      accentColor: 'var(--teal-500)',
      accentBg: 'var(--teal-50)',
      title: `¡Hola, ${userName}!`,
      subtitle: `Bienvenido a ${tenantName}`,
      body: 'Este es tu portal de vecino. En unos segundos te mostraremos todo lo que puedes hacer desde aquí.',
      preview: null,
    },
    // 1 — Mi Unidad
    {
      id: 'my_unit',
      icon: Home,
      emoji: null,
      accentColor: 'var(--teal-500)',
      accentBg: 'var(--teal-50)',
      route: '/app/my-unit',
      title: 'Mi Unidad',
      subtitle: 'Tu espacio personal en el condominio',
      body: 'Aquí puedes consultar el estado de tu unidad, los datos de tu propiedad, el estatus de tu pago mensual y la información general del condominio.',
      preview: <MiUnidadPreview />,
    },
    // 2 — Estado de Cuenta
    {
      id: 'estado_cuenta',
      icon: FileText,
      emoji: null,
      accentColor: 'var(--blue-500)',
      accentBg: 'var(--blue-50)',
      route: '/app/estado-cuenta',
      title: 'Estado de Cuenta',
      subtitle: 'Historial completo de tus pagos',
      body: 'Consulta el historial de tus cuotas de mantenimiento, pagos realizados, saldos y cualquier concepto adicional registrado en tu cuenta.',
      preview: <EstadoCuentaPreview />,
    },
    // 3 — Reservas
    {
      id: 'reservas',
      icon: Calendar,
      emoji: null,
      accentColor: 'var(--amber-500)',
      accentBg: 'var(--amber-50)',
      route: '/app/reservas',
      title: 'Reservas',
      subtitle: 'Reserva las áreas comunes',
      body: 'Agenda el uso de las áreas comunes disponibles — alberca, salón de eventos, gym, cancha y más — desde el calendario de disponibilidad.',
      preview: <ReservasPreview />,
    },
    // 4 — Notificaciones
    {
      id: 'notificaciones',
      icon: Bell,
      emoji: null,
      accentColor: 'var(--coral-500)',
      accentBg: 'var(--coral-50)',
      route: '/app/notificaciones',
      title: 'Notificaciones',
      subtitle: 'Mantente siempre informado',
      body: 'Recibe avisos importantes del condominio: recordatorios de pago, convocatorias, mantenimiento programado, anuncios de la administración y más.',
      preview: <NotificacionesPreview />,
    },
    // 5 — Listo
    {
      id: 'done',
      icon: null,
      emoji: '🎉',
      accentColor: 'var(--teal-500)',
      accentBg: 'var(--teal-50)',
      title: '¡Todo listo!',
      subtitle: 'Ya conoces tu portal',
      body: 'Puedes volver a este tour en cualquier momento desde el menú de tu perfil. Si tienes dudas, contacta a la administración del condominio.',
      preview: null,
    },
  ];
}

// ─── Previews mini de cada módulo ─────────────────────────────────────────

function MiUnidadPreview() {
  return (
    <div style={previewWrap}>
      <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
        {[
          { label: 'Unidad', val: '304', color: 'var(--teal-500)', bg: 'var(--teal-50)' },
          { label: 'Estatus', val: 'Pagado', color: 'var(--teal-600)', bg: 'var(--teal-50)' },
          { label: 'Cuota', val: '$1,800', color: 'var(--ink-700)', bg: 'var(--sand-50)' },
        ].map(k => (
          <div key={k.label} style={{ flex: 1, background: k.bg, borderRadius: 10, padding: '8px 10px', textAlign: 'center' }}>
            <div style={{ fontSize: 9, color: 'var(--ink-400)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 3 }}>{k.label}</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: k.color }}>{k.val}</div>
          </div>
        ))}
      </div>
      <div style={{ background: 'var(--sand-50)', borderRadius: 10, padding: '10px 12px' }}>
        <div style={{ fontSize: 10, color: 'var(--ink-400)', marginBottom: 6, fontWeight: 600 }}>HISTORIAL DE PAGOS</div>
        {['Abril 2025 · Pagado', 'Marzo 2025 · Pagado', 'Feb 2025 · Parcial'].map((row, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: i < 2 ? '1px solid var(--sand-100)' : 'none' }}>
            <span style={{ fontSize: 11, color: 'var(--ink-600)' }}>{row.split('·')[0]}</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: i < 2 ? 'var(--teal-600)' : 'var(--amber-600)', background: i < 2 ? 'var(--teal-50)' : 'var(--amber-50)', padding: '2px 8px', borderRadius: 20 }}>
              {row.split('·')[1]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function EstadoCuentaPreview() {
  return (
    <div style={previewWrap}>
      <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
        {[
          { label: 'Pagado', val: '$21,600', color: 'var(--teal-600)', bg: 'var(--teal-50)', icon: '✓' },
          { label: 'Saldo', val: '$0', color: 'var(--ink-600)', bg: 'var(--sand-50)', icon: '=' },
        ].map(k => (
          <div key={k.label} style={{ flex: 1, background: k.bg, borderRadius: 10, padding: '10px', textAlign: 'center' }}>
            <div style={{ fontSize: 18, marginBottom: 4 }}>{k.icon}</div>
            <div style={{ fontSize: 9, color: 'var(--ink-400)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>{k.label}</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: k.color }}>{k.val}</div>
          </div>
        ))}
      </div>
      <div style={{ background: 'var(--blue-50)', borderRadius: 10, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <FileText size={20} color="var(--blue-500)" />
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--blue-700)' }}>Reporte completo disponible</div>
          <div style={{ fontSize: 10, color: 'var(--ink-400)' }}>Descarga o envía por correo</div>
        </div>
      </div>
    </div>
  );
}

function ReservasPreview() {
  const days = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
  const slots = [null, null, 'teal', null, 'amber', null, null];
  return (
    <div style={previewWrap}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
        {days.map((d, i) => (
          <div key={d} style={{
            width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 700,
            background: slots[i] === 'teal' ? 'var(--teal-500)' : slots[i] === 'amber' ? 'var(--amber-100)' : 'var(--sand-50)',
            color: slots[i] === 'teal' ? 'white' : slots[i] === 'amber' ? 'var(--amber-700)' : 'var(--ink-400)',
          }}>
            {d}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {[
          { area: 'Alberca', hora: '10:00 – 12:00', status: 'teal', statusTxt: 'Confirmada' },
          { area: 'Salón de Eventos', hora: '18:00 – 22:00', status: 'amber', statusTxt: 'Pendiente' },
        ].map((r, i) => (
          <div key={i} style={{ background: 'var(--sand-50)', borderRadius: 8, padding: '8px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-700)' }}>{r.area}</div>
              <div style={{ fontSize: 10, color: 'var(--ink-400)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Clock size={9} /> {r.hora}
              </div>
            </div>
            <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: r.status === 'teal' ? 'var(--teal-50)' : 'var(--amber-50)', color: r.status === 'teal' ? 'var(--teal-600)' : 'var(--amber-700)' }}>
              {r.statusTxt}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function NotificacionesPreview() {
  const items = [
    { icon: <AlertCircle size={14} color="var(--coral-500)" />, text: 'Aviso de mantenimiento preventivo el sábado', time: 'Hoy', dot: 'coral' },
    { icon: <DollarSign size={14} color="var(--amber-500)" />, text: 'Recordatorio: cuota de mantenimiento Abril', time: 'Ayer', dot: 'amber' },
    { icon: <CheckCircle size={14} color="var(--teal-500)" />, text: 'Tu pago de Marzo fue registrado exitosamente', time: '2 días', dot: null },
  ];
  return (
    <div style={previewWrap}>
      {items.map((n, i) => (
        <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '9px 0', borderBottom: i < 2 ? '1px solid var(--sand-100)' : 'none' }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--sand-50)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {n.icon}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-700)', lineHeight: 1.3, display: 'flex', alignItems: 'center', gap: 6 }}>
              {n.text}
              {n.dot && <span style={{ width: 6, height: 6, borderRadius: '50%', background: n.dot === 'coral' ? 'var(--coral-400)' : 'var(--amber-400)', flexShrink: 0 }} />}
            </div>
            <div style={{ fontSize: 10, color: 'var(--ink-400)', marginTop: 2 }}>{n.time}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

const previewWrap = {
  background: 'var(--sand-50)',
  borderRadius: 12,
  padding: 14,
  border: '1px solid var(--sand-100)',
  marginTop: 4,
};

// ─── Componente principal ──────────────────────────────────────────────────
export default function VecinoOnboarding({ user, tenantName, onClose }) {
  const navigate  = useNavigate();
  const steps     = buildSteps(tenantName, user?.name || user?.first_name || 'vecino');
  const [step, setStep]       = useState(0);
  const [exiting, setExiting] = useState(false);   // para animación de salida de paso

  const total   = steps.length;
  const current = steps[step];
  const isFirst = step === 0;
  const isLast  = step === total - 1;

  // Función que finaliza el onboarding y guarda en localStorage
  const finish = () => {
    if (user?.id) {
      localStorage.setItem(onboardingKey(user.id), 'true');
    }
    onClose();
  };

  // Ir a paso siguiente con mini-animación
  const goNext = () => {
    setExiting(true);
    setTimeout(() => { setStep(s => s + 1); setExiting(false); }, 180);
  };
  const goPrev = () => {
    setExiting(true);
    setTimeout(() => { setStep(s => s - 1); setExiting(false); }, 180);
  };

  // Navegar al módulo del paso actual
  const goToModule = () => {
    if (current.route) {
      finish();
      navigate(current.route);
    }
  };

  const IconComp = current.icon;

  return (
    <>
      {/* ── Keyframes de animación ── */}
      <style>{`
        @keyframes ob-fade-in {
          from { opacity: 0; transform: translateY(18px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes ob-backdrop-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes ob-step-in {
          from { opacity: 0; transform: translateX(16px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        .ob-step-content {
          animation: ob-step-in 0.22s ease forwards;
        }
        .ob-step-content.exiting {
          opacity: 0;
          transform: translateX(-10px);
          transition: opacity 0.16s ease, transform 0.16s ease;
        }
      `}</style>

      {/* ── Backdrop ── */}
      <div style={{
        position: 'fixed', inset: 0,
        background: 'rgba(26,22,18,0.50)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        zIndex: 500,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '20px',
        animation: 'ob-backdrop-in 0.3s ease forwards',
      }}>

        {/* ── Modal card ── */}
        <div style={{
          background: 'var(--white)',
          borderRadius: 'var(--radius-xl)',
          width: '100%',
          maxWidth: 520,
          overflow: 'hidden',
          boxShadow: 'var(--shadow-xl)',
          animation: 'ob-fade-in 0.35s cubic-bezier(0.22,1,0.36,1) forwards',
          display: 'flex',
          flexDirection: 'column',
        }}>

          {/* ── Header con barra de progreso ── */}
          <div style={{
            padding: '18px 20px 14px',
            borderBottom: '1px solid var(--sand-100)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          }}>
            {/* Dots de progreso */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {steps.map((_, i) => (
                <button
                  key={i}
                  onClick={() => { if (i < step) { setExiting(true); setTimeout(() => { setStep(i); setExiting(false); }, 180); } }}
                  style={{
                    width: i === step ? 24 : 8,
                    height: 8,
                    borderRadius: 'var(--radius-full)',
                    background: i === step
                      ? current.accentColor
                      : i < step
                        ? 'var(--teal-200)'
                        : 'var(--sand-200)',
                    border: 'none',
                    cursor: i < step ? 'pointer' : 'default',
                    padding: 0,
                    transition: 'all 0.3s ease',
                    flexShrink: 0,
                  }}
                  aria-label={`Ir al paso ${i + 1}`}
                />
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 11, color: 'var(--ink-400)', fontWeight: 600 }}>
                {step + 1} de {total}
              </span>
              {/* Saltar */}
              {!isLast && (
                <button
                  onClick={finish}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: 11, color: 'var(--ink-400)', fontWeight: 600,
                    padding: '4px 8px', borderRadius: 6,
                    transition: 'color 0.15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.color = 'var(--ink-600)'}
                  onMouseLeave={e => e.currentTarget.style.color = 'var(--ink-400)'}
                >
                  Saltar tour
                </button>
              )}
              <button
                onClick={finish}
                style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: 'var(--sand-100)', border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--sand-200)'}
                onMouseLeave={e => e.currentTarget.style.background = 'var(--sand-100)'}
                title="Cerrar"
              >
                <X size={14} color="var(--ink-500)" />
              </button>
            </div>
          </div>

          {/* ── Cuerpo del paso ── */}
          <div style={{ padding: '28px 28px 24px', minHeight: 360 }}>
            <div className={`ob-step-content${exiting ? ' exiting' : ''}`}>

              {/* Icono / emoji grande */}
              <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 14 }}>
                {current.emoji ? (
                  <div style={{
                    width: 64, height: 64, borderRadius: 18,
                    background: current.accentBg,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 30, flexShrink: 0,
                    boxShadow: `0 0 0 6px ${current.accentBg}`,
                  }}>
                    {current.emoji}
                  </div>
                ) : (
                  IconComp && (
                    <div style={{
                      width: 64, height: 64, borderRadius: 18,
                      background: current.accentBg,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                      boxShadow: `0 0 0 6px ${current.accentBg}`,
                    }}>
                      <IconComp size={30} color={current.accentColor} />
                    </div>
                  )
                )}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: current.accentColor, marginBottom: 4 }}>
                    {current.subtitle}
                  </div>
                  <h2 style={{
                    margin: 0, fontSize: 22, fontWeight: 800,
                    fontFamily: 'var(--font-display)',
                    color: 'var(--ink-900)', lineHeight: 1.2,
                  }}>
                    {current.title}
                  </h2>
                </div>
              </div>

              {/* Descripción */}
              <p style={{
                fontSize: 14, color: 'var(--ink-500)', lineHeight: 1.65,
                margin: '0 0 20px 0',
              }}>
                {current.body}
              </p>

              {/* Preview del módulo */}
              {current.preview}

              {/* Botón "Ir a [módulo]" (pasos intermedios) */}
              {current.route && (
                <button
                  onClick={goToModule}
                  style={{
                    marginTop: 14,
                    background: 'none', border: 'none', cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    fontSize: 12, fontWeight: 700, color: current.accentColor,
                    padding: '6px 0',
                    transition: 'gap 0.2s ease',
                  }}
                  onMouseEnter={e => e.currentTarget.style.gap = '10px'}
                  onMouseLeave={e => e.currentTarget.style.gap = '6px'}
                >
                  Ir a {current.title} ahora <ArrowRight size={13} />
                </button>
              )}
            </div>
          </div>

          {/* ── Footer: botones de navegación ── */}
          <div style={{
            padding: '14px 24px 20px',
            borderTop: '1px solid var(--sand-100)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            {/* Anterior */}
            <button
              onClick={goPrev}
              disabled={isFirst}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: 'none', border: '1px solid var(--sand-200)',
                borderRadius: 'var(--radius-sm)', padding: '9px 16px',
                fontSize: 13, fontWeight: 600, color: 'var(--ink-500)',
                cursor: isFirst ? 'not-allowed' : 'pointer',
                opacity: isFirst ? 0 : 1,
                transition: 'all 0.15s',
              }}
            >
              <ChevronLeft size={15} /> Anterior
            </button>

            {/* Siguiente / Finalizar */}
            {isLast ? (
              <button
                onClick={finish}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  background: 'var(--teal-500)', color: 'white',
                  border: 'none', borderRadius: 'var(--radius-sm)',
                  padding: '10px 24px', fontSize: 14, fontWeight: 700,
                  cursor: 'pointer', boxShadow: '0 2px 12px rgba(42,157,115,0.30)',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--teal-600)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'var(--teal-500)'; e.currentTarget.style.transform = ''; }}
              >
                <Check size={15} /> Comenzar
              </button>
            ) : (
              <button
                onClick={goNext}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  background: current.accentColor, color: 'white',
                  border: 'none', borderRadius: 'var(--radius-sm)',
                  padding: '10px 24px', fontSize: 14, fontWeight: 700,
                  cursor: 'pointer', boxShadow: `0 2px 12px ${current.accentColor}44`,
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.opacity = '0.88'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                onMouseLeave={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = ''; }}
              >
                Siguiente <ChevronRight size={15} />
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
