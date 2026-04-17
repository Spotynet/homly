import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ChevronRight, ChevronLeft, X, Check, Sparkles,
  Settings, Building2, Receipt, Users, Shield, Globe, Layers,
  PartyPopper,
} from 'lucide-react';

/**
 * AdminConfigTour
 * ─────────────────────────────────────────────────────────────────
 * Interactive onboarding tour that guides an admin through every
 * Configuración tab explaining what each section is for and how to
 * complete it. Designed to be intuitive for expert and non-expert
 * users alike.
 *
 * Props:
 *   open          – boolean, controls visibility
 *   onClose       – called on close/skip
 *   onFinish      – called after user clicks "Finalizar" (shows final popup)
 *   onNavigateTab – (tabKey) => void — the parent (Config) should setTab to this key
 *   tenantName    – name of the tenant (used in intro and final popup)
 *   activeTab     – current tab key, to sync the tour position
 */
export default function AdminConfigTour({
  open,
  onClose,
  onFinish,
  onNavigateTab,
  tenantName = 'tu condominio',
  activeTab = 'general',
}) {
  const [stepIdx, setStepIdx] = useState(0);
  const [showFinal, setShowFinal] = useState(false);
  const [highlightBox, setHighlightBox] = useState(null);
  const cardRef = useRef(null);

  // ── Reset on open ──────────────────────────────────────────────
  useEffect(() => {
    if (open) {
      setStepIdx(0);
      setShowFinal(false);
    }
  }, [open]);

  // ── Steps definition ───────────────────────────────────────────
  //   tabKey   -> which Config tab to activate before showing the step
  //   target   -> data-tour selector (optional — null = centered modal)
  //   icon     -> lucide icon component
  //   title    -> main heading
  //   body     -> explanation: what it is and how to complete it
  const steps = [
    {
      id: 'intro',
      tabKey: null,
      target: null,
      icon: Sparkles,
      color: 'var(--teal-500)',
      bg: 'var(--teal-50)',
      title: `¡Bienvenido a ${tenantName}!`,
      subtitle: 'Guía de inicio — Configuración paso a paso',
      body:
        'Te llevaremos de la mano por cada sección de Configuración. En unos minutos tu condominio estará listo para operar. Puedes pausar el tour en cualquier momento y retomarlo desde el menú lateral.',
      cta: 'Empezar tour',
    },
    {
      id: 'tabs',
      tabKey: 'general',
      target: '[data-tour="config-tabs"]',
      icon: Layers,
      color: 'var(--teal-500)',
      bg: 'var(--teal-50)',
      title: 'Las 7 secciones de Configuración',
      subtitle: 'Este es tu panel de control',
      body:
        'Configuración se divide en 7 pestañas. Recorreremos cada una mostrándote para qué sirve y cómo completarla. Puedes volver a cualquier pestaña cuando quieras.',
    },
    {
      id: 'general',
      tabKey: 'general',
      target: '[data-tour="config-tab-general"]',
      icon: Settings,
      color: '#6366f1',
      bg: '#eef2ff',
      title: '1. General',
      subtitle: 'Datos básicos de tu condominio',
      body:
        'Empieza aquí. Captura el nombre, el número de unidades, la cuota de mantenimiento, la moneda, la fecha de inicio de operación, el saldo inicial del banco y los datos del domicilio. Estos datos alimentan reportes y pantallas principales, así que es importante completarlos primero.',
    },
    {
      id: 'units',
      tabKey: 'units',
      target: '[data-tour="config-tab-units"]',
      icon: Building2,
      color: '#0ea5e9',
      bg: '#e0f2fe',
      title: '2. Unidades',
      subtitle: 'Da de alta cada casa, depto o local',
      body:
        'Registra cada unidad del condominio con su número interno, el nombre del propietario, copropietario (si aplica), inquilino (si está rentada) y sus correos. Puedes importar en lote o crear una por una. Los correos se usan para enviar estados de cuenta y avisos.',
    },
    {
      id: 'fields',
      tabKey: 'fields',
      target: '[data-tour="config-tab-fields"]',
      icon: Receipt,
      color: '#22c55e',
      bg: '#dcfce7',
      title: '3. Gastos y Cobranza',
      subtitle: 'Cómo se cobra y en qué se gasta',
      body:
        'Define las categorías de gastos (luz, agua, jardinería, etc.) y las categorías de cobranza (mantenimiento, reserva, multas). Estas categorías aparecerán al capturar movimientos y en los reportes financieros.',
    },
    {
      id: 'users',
      tabKey: 'users',
      target: '[data-tour="config-tab-users"]',
      icon: Users,
      color: '#f59e0b',
      bg: '#fef3c7',
      title: '4. Usuarios',
      subtitle: 'Quién accede a Homly',
      body:
        'Invita a tu equipo administrador, tesorero, contador o auditor, y a cada vecino. Cada usuario recibe un correo con su contraseña provisional. Puedes desactivar usuarios sin eliminarlos para mantener la auditoría.',
    },
    {
      id: 'roles',
      tabKey: 'roles',
      target: '[data-tour="config-tab-roles"]',
      icon: Shield,
      color: '#ec4899',
      bg: '#fce7f3',
      title: '5. Roles y Perfiles',
      subtitle: 'Qué puede ver y hacer cada quién',
      body:
        'Homly trae roles predefinidos (admin, tesorero, contador, etc.). Desde aquí puedes crear perfiles personalizados y decidir qué módulos son visibles, de solo lectura o editables para cada rol. Todo se aplica al instante en el menú lateral.',
    },
    {
      id: 'org',
      tabKey: 'org',
      target: '[data-tour="config-tab-org"]',
      icon: Globe,
      color: '#8b5cf6',
      bg: '#ede9fe',
      title: '6. Organización',
      subtitle: 'Tu estructura interna',
      body:
        'Registra el comité actual (presidente, tesorero, secretario) y el flujo de aprobación para el cierre de período. Este flujo determina quién debe firmar los estados financieros antes de cerrar un mes.',
    },
    {
      id: 'modules',
      tabKey: 'modules',
      target: '[data-tour="config-tab-modules"]',
      icon: Layers,
      color: '#14b8a6',
      bg: '#ccfbf1',
      title: '7. Módulos',
      subtitle: 'Activa o desactiva funciones completas',
      body:
        'Si tu condominio no usa reservas o plan de pagos, puedes apagarlos desde aquí y desaparecerán del menú de todos. Esto deja a Homly ajustado solo a lo que necesitas.',
    },
    {
      id: 'ready',
      tabKey: null,
      target: null,
      icon: Sparkles,
      color: 'var(--teal-500)',
      bg: 'var(--teal-50)',
      title: '¡Ya casi terminamos!',
      subtitle: 'Último paso',
      body:
        'Cuando confirmes, marcaremos el onboarding como completado para este condominio. Puedes ajustar cualquier sección más adelante — la configuración nunca se congela.',
      cta: 'Finalizar tour',
    },
  ];

  const step = steps[stepIdx];

  // ── Switch tab in Config when step changes ────────────────────
  useEffect(() => {
    if (!open || !step) return;
    if (step.tabKey && step.tabKey !== activeTab && onNavigateTab) {
      onNavigateTab(step.tabKey);
    }
  }, [open, stepIdx]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Measure target element and recalc on scroll/resize ────────
  const recalcHighlight = useCallback(() => {
    if (!open || !step || !step.target) { setHighlightBox(null); return; }
    const el = document.querySelector(step.target);
    if (!el) { setHighlightBox(null); return; }
    const r = el.getBoundingClientRect();
    setHighlightBox({
      top: r.top - 8,
      left: r.left - 8,
      width: r.width + 16,
      height: r.height + 16,
    });
    // Scroll into view if mostly off-screen
    if (r.top < 0 || r.bottom > window.innerHeight) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [open, step]);

  useEffect(() => {
    if (!open) return;
    // Small delay so the target element has time to render after tab switch
    const t = setTimeout(recalcHighlight, 80);
    window.addEventListener('resize', recalcHighlight);
    window.addEventListener('scroll', recalcHighlight, true);
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', recalcHighlight);
      window.removeEventListener('scroll', recalcHighlight, true);
    };
  }, [open, stepIdx, recalcHighlight]);

  // ── Handlers ──────────────────────────────────────────────────
  const next = () => {
    if (stepIdx >= steps.length - 1) {
      setShowFinal(true);
    } else {
      setStepIdx(i => Math.min(steps.length - 1, i + 1));
    }
  };
  const prev = () => setStepIdx(i => Math.max(0, i - 1));
  const skip = () => { if (onClose) onClose(); };

  const handleFinalConfirm = () => {
    setShowFinal(false);
    if (onFinish) onFinish();
  };

  if (!open) return null;

  // ── Final popup ───────────────────────────────────────────────
  if (showFinal) {
    return (
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 2000,
          background: 'rgba(15, 23, 42, 0.60)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 20, animation: 'fadeIn 0.25s ease-out',
        }}
        onClick={handleFinalConfirm}
      >
        <div
          onClick={e => e.stopPropagation()}
          style={{
            maxWidth: 460, width: '100%',
            background: 'white', borderRadius: 20,
            padding: '36px 32px 28px',
            boxShadow: '0 24px 60px rgba(0,0,0,0.25)',
            textAlign: 'center',
            animation: 'popIn 0.35s cubic-bezier(.22,1.4,.32,1)',
          }}
        >
          <div style={{
            width: 80, height: 80, borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--teal-50) 0%, #ccfbf1 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 18px',
          }}>
            <PartyPopper size={40} color="var(--teal-500)" />
          </div>
          <h2 style={{
            margin: 0, fontSize: 22, fontWeight: 800,
            color: 'var(--ink-800)',
          }}>
            ¡Buen trabajo!
          </h2>
          <p style={{
            margin: '10px 0 6px', fontSize: 15, color: 'var(--ink-600)',
            lineHeight: 1.5,
          }}>
            <strong>{tenantName}</strong> está listo para iniciar operación.
          </p>
          <p style={{
            margin: '0 0 24px', fontSize: 13, color: 'var(--ink-400)',
            lineHeight: 1.5,
          }}>
            Ya puedes empezar a registrar cobranza, gastos y reservas.
            Si necesitas ajustar algo, la configuración siempre está disponible.
          </p>
          <button
            onClick={handleFinalConfirm}
            className="btn btn-primary"
            style={{ width: '100%', padding: '11px 16px', fontSize: 14, fontWeight: 700 }}
          >
            <Check size={16} /> Empezar a operar
          </button>
        </div>
        <style>{`
          @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
          @keyframes popIn {
            0%   { opacity: 0; transform: scale(0.85); }
            100% { opacity: 1; transform: scale(1); }
          }
        `}</style>
      </div>
    );
  }

  // ── Tour step ─────────────────────────────────────────────────
  const Icon = step.icon;
  const isIntroOrReady = !step.target;

  // Position the info card: if we have a highlight, put the card next to it;
  // otherwise center it.
  let cardStyle = {
    position: 'fixed',
    zIndex: 2001,
    maxWidth: 420, width: 'calc(100% - 32px)',
    background: 'white',
    borderRadius: 16,
    boxShadow: '0 16px 48px rgba(0,0,0,0.20)',
    padding: 0,
    overflow: 'hidden',
  };
  if (isIntroOrReady || !highlightBox) {
    cardStyle = {
      ...cardStyle,
      top: '50%', left: '50%',
      transform: 'translate(-50%, -50%)',
    };
  } else {
    // Place card below the highlight (or above if not enough room)
    const below = highlightBox.top + highlightBox.height + 14;
    const roomBelow = window.innerHeight - below;
    const CARD_H_EST = 280;
    if (roomBelow >= CARD_H_EST) {
      cardStyle = { ...cardStyle, top: below, left: Math.max(16, Math.min(highlightBox.left, window.innerWidth - 436)) };
    } else {
      cardStyle = {
        ...cardStyle,
        top: Math.max(16, highlightBox.top - CARD_H_EST - 14),
        left: Math.max(16, Math.min(highlightBox.left, window.innerWidth - 436)),
      };
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1999, pointerEvents: 'none' }}>
      {/* Dim overlay with a "cut-out" around the highlighted area */}
      <div
        style={{
          position: 'absolute', inset: 0,
          background: 'rgba(15, 23, 42, 0.55)',
          pointerEvents: 'auto',
          animation: 'fadeIn 0.2s ease-out',
        }}
        onClick={skip}
      />

      {/* Highlight box (a bright ring around the target) */}
      {highlightBox && (
        <div
          style={{
            position: 'fixed',
            top: highlightBox.top,
            left: highlightBox.left,
            width: highlightBox.width,
            height: highlightBox.height,
            borderRadius: 12,
            boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.55), 0 0 0 3px var(--teal-500), 0 0 22px rgba(20, 184, 166, 0.55)',
            pointerEvents: 'none',
            transition: 'all 0.3s cubic-bezier(.22,1.4,.32,1)',
          }}
        />
      )}

      {/* Info card */}
      <div ref={cardRef} style={{ ...cardStyle, pointerEvents: 'auto', animation: 'popIn 0.25s ease-out' }}>
        {/* Header with accent bar */}
        <div style={{
          background: step.bg,
          padding: '16px 18px 14px',
          borderBottom: '1px solid rgba(0,0,0,0.04)',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: 'white',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 1px 3px rgba(0,0,0,0.08)', flexShrink: 0,
          }}>
            {Icon && <Icon size={20} color={step.color} />}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 10, fontWeight: 800, letterSpacing: '0.08em',
              color: step.color, textTransform: 'uppercase', marginBottom: 2,
            }}>
              {step.subtitle}
            </div>
            <div style={{
              fontSize: 16, fontWeight: 800, color: 'var(--ink-800)',
              lineHeight: 1.3,
            }}>
              {step.title}
            </div>
          </div>
          <button
            onClick={skip}
            title="Cerrar guía"
            style={{
              background: 'rgba(255,255,255,0.6)', border: 'none',
              width: 30, height: 30, borderRadius: 8, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--ink-500)',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '16px 18px 8px' }}>
          <p style={{
            margin: 0, fontSize: 13.5, lineHeight: 1.55,
            color: 'var(--ink-700)',
          }}>
            {step.body}
          </p>
        </div>

        {/* Progress + controls */}
        <div style={{ padding: '4px 18px 14px' }}>
          {/* Step dots */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
            {steps.map((_, i) => (
              <div
                key={i}
                style={{
                  flex: 1, height: 4, borderRadius: 2,
                  background: i <= stepIdx ? step.color : 'var(--sand-100)',
                  transition: 'background 0.2s',
                }}
              />
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 11, color: 'var(--ink-400)', fontWeight: 600 }}>
              Paso {stepIdx + 1} de {steps.length}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {stepIdx > 0 && (
                <button
                  onClick={prev}
                  className="btn btn-secondary btn-sm"
                  style={{ padding: '6px 10px', fontSize: 12 }}
                >
                  <ChevronLeft size={14} /> Atrás
                </button>
              )}
              <button
                onClick={next}
                className="btn btn-primary btn-sm"
                style={{ padding: '6px 12px', fontSize: 12, background: step.color, borderColor: step.color }}
              >
                {step.cta || (stepIdx === steps.length - 1 ? 'Finalizar' : 'Siguiente')}
                {stepIdx < steps.length - 1 && <ChevronRight size={14} />}
              </button>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes popIn {
          0%   { opacity: 0; transform: scale(0.95) translateY(8px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
}
