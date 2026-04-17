import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ChevronRight, ChevronLeft, X, Check, Sparkles,
  Settings, Building2, Receipt, Users, Shield, Globe, Layers,
  PartyPopper, Pause, Play, GripVertical,
} from 'lucide-react';

/**
 * AdminConfigTour — Scribe-style interactive onboarding
 * ─────────────────────────────────────────────────────────────────
 * Design principles (inspirado en scribe.com):
 *   • NO bloquea la interacción con la página: el usuario puede ir
 *     escribiendo en los campos mientras lee las explicaciones.
 *   • Hotspot numerado anclado al elemento real (pin flotante con un
 *     anillo pulsante que llama la atención sin tapar nada).
 *   • Tooltip flotante con flecha apuntando al hotspot. El tooltip
 *     se puede arrastrar si estorba y se puede minimizar.
 *   • Barra compacta de progreso fija en la parte inferior con
 *     controles (Atrás, Siguiente, Pausar, Cerrar).
 *   • Pasos intro/final: modal centrado amigable.
 *
 * Props:
 *   open, onClose, onFinish, onNavigateTab, tenantName, activeTab
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
  const [hotspotBox, setHotspotBox] = useState(null);      // {top,left,w,h}
  const [paused, setPaused] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 }); // manual tooltip offset
  const dragStateRef = useRef(null);

  // ── Reset on open ──────────────────────────────────────────────
  useEffect(() => {
    if (open) {
      setStepIdx(0);
      setShowFinal(false);
      setPaused(false);
      setMinimized(false);
      setDragOffset({ x: 0, y: 0 });
    }
  }, [open]);

  // ── Steps definition ───────────────────────────────────────────
  //   kind    -> 'modal' (centered intro/final) | 'hotspot' (attached to DOM el)
  //   tabKey  -> which Config tab to activate first
  //   target  -> data-tour selector (required for hotspot)
  //   icon    -> lucide icon component
  const steps = [
    {
      id: 'intro', kind: 'modal', tabKey: null, target: null,
      icon: Sparkles, color: 'var(--teal-500)', bg: 'var(--teal-50)',
      title: `¡Bienvenido a ${tenantName}!`,
      subtitle: 'Guía de inicio interactiva',
      body: 'Te acompañaré mientras configuras tu condominio. A diferencia de otros tutoriales, podrás escribir en los campos mientras lees las explicaciones. El tour se queda a un lado sin estorbar — puedes arrastrarlo, pausarlo o cerrarlo cuando quieras.',
      cta: 'Empezar tour',
    },
    {
      id: 'tabs', kind: 'hotspot', tabKey: 'general',
      target: '[data-tour="config-tabs"]',
      icon: Layers, color: '#6366f1', bg: '#eef2ff',
      title: 'Las 7 secciones de Configuración',
      subtitle: 'Tu panel de control',
      body: 'Configuración se divide en 7 pestañas. Recorreremos cada una. Puedes hacer clic en cualquiera ahora mismo — el tour seguirá tu navegación.',
    },
    {
      id: 'general', kind: 'hotspot', tabKey: 'general',
      target: '[data-tour="config-tab-general"]',
      icon: Settings, color: '#6366f1', bg: '#eef2ff',
      title: '1. General',
      subtitle: 'Datos básicos del condominio',
      body: 'Aquí defines el nombre, número de unidades, cuota de mantenimiento, moneda, fecha de inicio de operación, saldo inicial del banco y el domicilio. Estos datos alimentan el resto del sistema.',
    },
    {
      id: 'general-edit', kind: 'hotspot', tabKey: 'general',
      target: '[data-tour="general-edit-btn"]',
      icon: Settings, color: '#6366f1', bg: '#eef2ff',
      title: 'Edita tus datos generales',
      subtitle: 'Botón Editar',
      body: 'Haz clic en "Editar" para abrir el formulario. Captura cada campo y guarda. Puedes dejar la guía abierta y trabajar al mismo tiempo — no se cerrará.',
    },
    {
      id: 'units', kind: 'hotspot', tabKey: 'units',
      target: '[data-tour="config-tab-units"]',
      icon: Building2, color: '#0ea5e9', bg: '#e0f2fe',
      title: '2. Unidades',
      subtitle: 'Alta de casas, deptos o locales',
      body: 'Registra cada unidad con su número, propietario, copropietario (si aplica), inquilino y correos. Estos correos se usan para enviar estados de cuenta y avisos.',
    },
    {
      id: 'fields', kind: 'hotspot', tabKey: 'fields',
      target: '[data-tour="config-tab-fields"]',
      icon: Receipt, color: '#22c55e', bg: '#dcfce7',
      title: '3. Gastos y Cobranza',
      subtitle: 'Categorías financieras',
      body: 'Define las categorías de gastos (luz, agua, jardinería…) y de cobranza (mantenimiento, reserva, multas). Estas categorías aparecen al capturar movimientos y en los reportes.',
    },
    {
      id: 'users', kind: 'hotspot', tabKey: 'users',
      target: '[data-tour="config-tab-users"]',
      icon: Users, color: '#f59e0b', bg: '#fef3c7',
      title: '4. Usuarios',
      subtitle: 'Accesos al sistema',
      body: 'Invita a tu equipo (admin, tesorero, contador, auditor) y a los vecinos. Cada uno recibe un correo con su contraseña provisional. Puedes desactivar sin eliminar para mantener la auditoría.',
    },
    {
      id: 'roles', kind: 'hotspot', tabKey: 'roles',
      target: '[data-tour="config-tab-roles"]',
      icon: Shield, color: '#ec4899', bg: '#fce7f3',
      title: '5. Roles y Perfiles',
      subtitle: 'Permisos por rol',
      body: 'Homly trae roles predefinidos. Desde aquí creas perfiles personalizados y decides qué módulos son visibles, de solo lectura o editables por rol. Los cambios se aplican al instante.',
    },
    {
      id: 'org', kind: 'hotspot', tabKey: 'org',
      target: '[data-tour="config-tab-org"]',
      icon: Globe, color: '#8b5cf6', bg: '#ede9fe',
      title: '6. Organización',
      subtitle: 'Comité y flujo de aprobación',
      body: 'Registra el comité actual (presidente, tesorero, secretario) y el flujo de firmas para el cierre de período contable.',
    },
    {
      id: 'modules', kind: 'hotspot', tabKey: 'modules',
      target: '[data-tour="config-tab-modules"]',
      icon: Layers, color: '#14b8a6', bg: '#ccfbf1',
      title: '7. Módulos',
      subtitle: 'Activa o desactiva funciones',
      body: 'Si no usas reservas o plan de pagos, puedes apagarlos desde aquí y desaparecen del menú de todos. Deja Homly ajustado a tus necesidades.',
    },
    {
      id: 'ready', kind: 'modal', tabKey: null, target: null,
      icon: Sparkles, color: 'var(--teal-500)', bg: 'var(--teal-50)',
      title: '¡Ya casi terminamos!',
      subtitle: 'Último paso',
      body: 'Cuando confirmes, marcaremos el onboarding como completado. Siempre puedes volver a Configuración para ajustar lo que necesites.',
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

  // ── Measure target element for hotspot ────────────────────────
  const recalcHotspot = useCallback(() => {
    if (!open || !step || step.kind !== 'hotspot' || !step.target) {
      setHotspotBox(null); return;
    }
    const el = document.querySelector(step.target);
    if (!el) { setHotspotBox(null); return; }
    const r = el.getBoundingClientRect();
    setHotspotBox({
      top: r.top,
      left: r.left,
      width: r.width,
      height: r.height,
    });
    // Scroll target into view if off-screen
    if (r.top < 80 || r.bottom > window.innerHeight - 140) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [open, step]);

  useEffect(() => {
    if (!open) return;
    // Reset drag offset on step change
    setDragOffset({ x: 0, y: 0 });
    const t = setTimeout(recalcHotspot, 120);
    const onScroll = () => recalcHotspot();
    window.addEventListener('resize', onScroll);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', onScroll);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open, stepIdx, recalcHotspot]);

  // ── Drag handling for the floating tooltip ────────────────────
  const onDragStart = (e) => {
    e.preventDefault();
    const startX = e.clientX ?? e.touches?.[0]?.clientX;
    const startY = e.clientY ?? e.touches?.[0]?.clientY;
    if (startX == null) return;
    dragStateRef.current = { startX, startY, ox: dragOffset.x, oy: dragOffset.y };
    const move = (ev) => {
      const cx = ev.clientX ?? ev.touches?.[0]?.clientX;
      const cy = ev.clientY ?? ev.touches?.[0]?.clientY;
      if (cx == null || !dragStateRef.current) return;
      setDragOffset({
        x: dragStateRef.current.ox + (cx - dragStateRef.current.startX),
        y: dragStateRef.current.oy + (cy - dragStateRef.current.startY),
      });
    };
    const up = () => {
      dragStateRef.current = null;
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      window.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    window.addEventListener('touchmove', move);
    window.addEventListener('touchend', up);
  };

  // ── Handlers ──────────────────────────────────────────────────
  const next = () => {
    if (stepIdx >= steps.length - 1) setShowFinal(true);
    else setStepIdx(i => Math.min(steps.length - 1, i + 1));
  };
  const prev = () => setStepIdx(i => Math.max(0, i - 1));
  const skip = () => { if (onClose) onClose(); };
  const handleFinalConfirm = () => {
    setShowFinal(false);
    if (onFinish) onFinish();
  };

  if (!open) return null;

  // ══════════════ Final popup (bloqueante, único momento) ══════
  if (showFinal) {
    return (
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 2100,
          background: 'rgba(15, 23, 42, 0.55)',
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
            padding: '36px 32px 28px', textAlign: 'center',
            boxShadow: '0 24px 60px rgba(0,0,0,0.25)',
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
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--ink-800)' }}>
            ¡Buen trabajo!
          </h2>
          <p style={{ margin: '10px 0 6px', fontSize: 15, color: 'var(--ink-600)', lineHeight: 1.5 }}>
            <strong>{tenantName}</strong> está listo para iniciar operación.
          </p>
          <p style={{ margin: '0 0 24px', fontSize: 13, color: 'var(--ink-400)', lineHeight: 1.5 }}>
            Ya puedes registrar cobranza, gastos y reservas. La configuración siempre está disponible si necesitas ajustar algo.
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
          @keyframes popIn { 0% { opacity: 0; transform: scale(0.85); } 100% { opacity: 1; transform: scale(1); } }
        `}</style>
      </div>
    );
  }

  const Icon = step.icon;

  // ══════════════ MINIMIZED (pill flotante) ════════════════════
  // Cuando el usuario minimiza, solo queda una cápsula en la esquina inferior.
  if (minimized) {
    return (
      <div
        onClick={() => setMinimized(false)}
        style={{
          position: 'fixed', bottom: 20, right: 20, zIndex: 2000,
          background: step.color, color: 'white',
          padding: '10px 16px', borderRadius: 999, cursor: 'pointer',
          boxShadow: '0 8px 24px rgba(0,0,0,0.20)',
          display: 'flex', alignItems: 'center', gap: 10,
          fontSize: 13, fontWeight: 700,
          animation: 'popIn 0.2s ease-out',
        }}
      >
        <Icon size={16} />
        Guía · Paso {stepIdx + 1} / {steps.length}
        <Play size={14} />
        <style>{`
          @keyframes popIn { 0% { opacity: 0; transform: scale(0.8); } 100% { opacity: 1; transform: scale(1); } }
        `}</style>
      </div>
    );
  }

  // ══════════════ INTRO / MODAL (centrado, bloqueante) ═════════
  if (step.kind === 'modal') {
    return (
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 2000,
          background: 'rgba(15, 23, 42, 0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 20, animation: 'fadeIn 0.25s ease-out',
        }}
      >
        <div
          style={{
            maxWidth: 480, width: '100%',
            background: 'white', borderRadius: 18,
            padding: '28px 28px 22px',
            boxShadow: '0 20px 48px rgba(0,0,0,0.22)',
            animation: 'popIn 0.3s cubic-bezier(.22,1.4,.32,1)',
          }}
        >
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', marginBottom: 14 }}>
            <div style={{
              width: 48, height: 48, borderRadius: 12,
              background: step.bg,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <Icon size={24} color={step.color} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{
                fontSize: 11, fontWeight: 800, letterSpacing: '0.08em',
                color: step.color, textTransform: 'uppercase', marginBottom: 2,
              }}>
                {step.subtitle}
              </div>
              <h3 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: 'var(--ink-800)', lineHeight: 1.3 }}>
                {step.title}
              </h3>
            </div>
            <button
              onClick={skip}
              title="Cerrar guía"
              style={{
                background: 'var(--sand-50)', border: 'none',
                width: 30, height: 30, borderRadius: 8, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--ink-500)', flexShrink: 0,
              }}
            >
              <X size={16} />
            </button>
          </div>

          <p style={{ margin: 0, fontSize: 14, color: 'var(--ink-700)', lineHeight: 1.6 }}>
            {step.body}
          </p>

          {/* Progreso */}
          <div style={{ display: 'flex', gap: 3, margin: '20px 0 14px' }}>
            {steps.map((_, i) => (
              <div key={i} style={{
                flex: 1, height: 4, borderRadius: 2,
                background: i <= stepIdx ? step.color : 'var(--sand-100)',
                transition: 'background 0.2s',
              }} />
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 11, color: 'var(--ink-400)', fontWeight: 600 }}>
              Paso {stepIdx + 1} de {steps.length}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {stepIdx > 0 && (
                <button onClick={prev} className="btn btn-secondary btn-sm"
                  style={{ padding: '7px 12px', fontSize: 12 }}>
                  <ChevronLeft size={14} /> Atrás
                </button>
              )}
              <button onClick={next} className="btn btn-primary btn-sm"
                style={{ padding: '7px 14px', fontSize: 12, background: step.color, borderColor: step.color }}>
                {step.cta || (stepIdx === steps.length - 1 ? 'Finalizar' : 'Siguiente')}
                {stepIdx < steps.length - 1 && <ChevronRight size={14} />}
              </button>
            </div>
          </div>
        </div>
        <style>{`
          @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
          @keyframes popIn { 0% { opacity: 0; transform: scale(0.94) translateY(8px); } 100% { opacity: 1; transform: scale(1) translateY(0); } }
        `}</style>
      </div>
    );
  }

  // ══════════════ HOTSPOT (Scribe-style, no bloqueante) ════════
  // Renderiza:
  //   1. Un pin numerado con anillo pulsante sobre el elemento destino
  //   2. Un tooltip flotante con flecha, arrastrable, al lado del pin
  //   3. Una barra de controles fija abajo (progreso, Atrás/Siguiente, Pausar)
  //   La página NO se bloquea — el usuario puede hacer clic y escribir donde quiera.
  //
  // Solo se bloquea la interacción cuando `paused` es true (el usuario pausó).

  const TOOLTIP_W = 340;
  const TOOLTIP_EST_H = 220;
  const MARGIN = 14;

  // Calcula posición del tooltip y en qué lado va la flecha
  let tooltipPos = { top: 120, left: window.innerWidth - TOOLTIP_W - 20, side: 'right' };
  let pinPos = null;

  if (hotspotBox) {
    const box = hotspotBox;
    const cx = box.left + box.width / 2;
    const cy = box.top + box.height / 2;

    // Pin va en la esquina superior izquierda del elemento (offset un poco afuera)
    pinPos = { top: box.top - 12, left: box.left - 12 };

    // Decidir lado: preferir derecha, si no cabe → izquierda, arriba o abajo
    const spaceRight  = window.innerWidth - (box.left + box.width);
    const spaceLeft   = box.left;
    const spaceBelow  = window.innerHeight - (box.top + box.height);
    const spaceAbove  = box.top;

    if (spaceRight >= TOOLTIP_W + MARGIN + 20) {
      tooltipPos = {
        top: Math.max(16, Math.min(cy - TOOLTIP_EST_H / 2, window.innerHeight - TOOLTIP_EST_H - 16)),
        left: box.left + box.width + MARGIN,
        side: 'left',
      };
    } else if (spaceLeft >= TOOLTIP_W + MARGIN + 20) {
      tooltipPos = {
        top: Math.max(16, Math.min(cy - TOOLTIP_EST_H / 2, window.innerHeight - TOOLTIP_EST_H - 16)),
        left: box.left - TOOLTIP_W - MARGIN,
        side: 'right',
      };
    } else if (spaceBelow >= TOOLTIP_EST_H + MARGIN) {
      tooltipPos = {
        top: box.top + box.height + MARGIN,
        left: Math.max(16, Math.min(cx - TOOLTIP_W / 2, window.innerWidth - TOOLTIP_W - 16)),
        side: 'top',
      };
    } else if (spaceAbove >= TOOLTIP_EST_H + MARGIN) {
      tooltipPos = {
        top: box.top - TOOLTIP_EST_H - MARGIN,
        left: Math.max(16, Math.min(cx - TOOLTIP_W / 2, window.innerWidth - TOOLTIP_W - 16)),
        side: 'bottom',
      };
    }
  }

  // Aplicar offset del usuario (drag)
  const tooltipStyle = {
    position: 'fixed',
    top: tooltipPos.top + dragOffset.y,
    left: tooltipPos.left + dragOffset.x,
    width: TOOLTIP_W,
    zIndex: 2001,
    pointerEvents: 'auto',
  };

  // Flecha: en la cara del tooltip que da hacia el pin
  const arrowCommon = {
    position: 'absolute',
    width: 14, height: 14,
    background: 'white',
    transform: 'rotate(45deg)',
    border: '1px solid rgba(0,0,0,0.05)',
  };
  const arrowStyle = (() => {
    switch (tooltipPos.side) {
      case 'left':   return { ...arrowCommon, left: -7, top: 28, borderRight: 'none', borderTop: 'none' };
      case 'right':  return { ...arrowCommon, right: -7, top: 28, borderLeft: 'none', borderBottom: 'none' };
      case 'top':    return { ...arrowCommon, top: -7, left: 30, borderRight: 'none', borderBottom: 'none' };
      case 'bottom': return { ...arrowCommon, bottom: -7, left: 30, borderLeft: 'none', borderTop: 'none' };
      default:       return { ...arrowCommon, display: 'none' };
    }
  })();

  // Cuántos son los pasos hotspot (para mostrar número en el pin)
  const hotspotNumber = steps.slice(0, stepIdx + 1).filter(s => s.kind === 'hotspot').length;

  return (
    <>
      {/* ── Paused overlay (bloquea clic hasta reanudar) ── */}
      {paused && (
        <div
          onClick={() => setPaused(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1998,
            background: 'rgba(15, 23, 42, 0.28)',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            pointerEvents: 'auto',
          }}
        >
          <div style={{
            background: 'white', padding: '12px 18px', borderRadius: 999,
            boxShadow: '0 6px 20px rgba(0,0,0,0.15)',
            fontSize: 13, fontWeight: 700, color: 'var(--ink-700)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <Play size={14} color={step.color} /> Toca para reanudar la guía
          </div>
        </div>
      )}

      {/* ── Hotspot ring + numbered pin (overlay, NO captura clics) ── */}
      {hotspotBox && (
        <>
          {/* Anillo luminoso alrededor del elemento (no bloquea clics) */}
          <div
            style={{
              position: 'fixed',
              top: hotspotBox.top - 4,
              left: hotspotBox.left - 4,
              width: hotspotBox.width + 8,
              height: hotspotBox.height + 8,
              borderRadius: 10,
              boxShadow: `0 0 0 2px ${step.color}, 0 0 20px ${step.color}66`,
              pointerEvents: 'none',
              zIndex: 1999,
              transition: 'all 0.3s cubic-bezier(.22,1.4,.32,1)',
              animation: 'tourRingPulse 1.8s ease-in-out infinite',
            }}
          />
          {/* Pin numerado (sí captura clic → va al siguiente paso) */}
          {pinPos && (
            <button
              onClick={next}
              title="Siguiente"
              style={{
                position: 'fixed',
                top: pinPos.top,
                left: pinPos.left,
                width: 30, height: 30, borderRadius: '50%',
                background: step.color, color: 'white',
                border: '3px solid white',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 800,
                cursor: 'pointer', zIndex: 2000,
                boxShadow: `0 4px 14px ${step.color}88`,
                animation: 'tourPinBob 2s ease-in-out infinite',
              }}
            >
              {hotspotNumber}
            </button>
          )}
        </>
      )}

      {/* ── Floating tooltip (drag-gable, NO bloquea) ── */}
      <div style={tooltipStyle}>
        <div style={{
          position: 'relative',
          background: 'white',
          borderRadius: 12,
          boxShadow: '0 12px 36px rgba(0,0,0,0.18)',
          overflow: 'hidden',
          animation: 'popIn 0.22s ease-out',
        }}>
          {/* Flecha apuntando al hotspot */}
          <div style={arrowStyle} />

          {/* Header arrastrable */}
          <div
            onMouseDown={onDragStart}
            onTouchStart={onDragStart}
            style={{
              background: step.bg,
              padding: '10px 14px',
              display: 'flex', alignItems: 'center', gap: 10,
              borderBottom: '1px solid rgba(0,0,0,0.04)',
              cursor: 'grab',
              userSelect: 'none',
            }}
          >
            <GripVertical size={14} color={step.color} style={{ opacity: 0.6 }} />
            <div style={{
              width: 28, height: 28, borderRadius: 8,
              background: 'white',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 1px 3px rgba(0,0,0,0.08)', flexShrink: 0,
            }}>
              <Icon size={15} color={step.color} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 9, fontWeight: 800, letterSpacing: '0.08em',
                color: step.color, textTransform: 'uppercase',
              }}>
                {step.subtitle}
              </div>
              <div style={{
                fontSize: 13.5, fontWeight: 800, color: 'var(--ink-800)',
                lineHeight: 1.3, marginTop: 1,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {step.title}
              </div>
            </div>
            <button
              onClick={() => setMinimized(true)}
              title="Minimizar"
              style={{
                background: 'rgba(255,255,255,0.7)', border: 'none',
                width: 24, height: 24, borderRadius: 6, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--ink-500)', fontSize: 11, fontWeight: 800,
              }}
            >
              –
            </button>
          </div>

          {/* Body */}
          <div style={{ padding: '12px 14px' }}>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: 'var(--ink-700)' }}>
              {step.body}
            </p>
          </div>

          {/* Footer con navegación */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 8, padding: '8px 14px 12px', borderTop: '1px solid var(--sand-50)',
          }}>
            <div style={{ fontSize: 11, color: 'var(--ink-400)', fontWeight: 600 }}>
              Paso {stepIdx + 1} / {steps.length}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {stepIdx > 0 && (
                <button
                  onClick={prev}
                  title="Paso anterior"
                  style={{
                    background: 'var(--sand-50)', border: '1px solid var(--sand-100)',
                    padding: '5px 10px', borderRadius: 8, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 4,
                    fontSize: 12, fontWeight: 600, color: 'var(--ink-600)',
                  }}
                >
                  <ChevronLeft size={13} /> Atrás
                </button>
              )}
              <button
                onClick={next}
                title="Siguiente paso"
                style={{
                  background: step.color, border: 'none', color: 'white',
                  padding: '5px 12px', borderRadius: 8, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 4,
                  fontSize: 12, fontWeight: 700,
                }}
              >
                Siguiente <ChevronRight size={13} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Barra de control inferior (compacta) ── */}
      <div
        style={{
          position: 'fixed',
          bottom: 16,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 2001,
          background: 'white',
          borderRadius: 999,
          padding: '8px 14px 8px 10px',
          boxShadow: '0 8px 28px rgba(0,0,0,0.18)',
          display: 'flex', alignItems: 'center', gap: 10,
          pointerEvents: 'auto',
          border: '1px solid var(--sand-100)',
        }}
      >
        <div style={{
          width: 28, height: 28, borderRadius: '50%',
          background: step.bg, color: step.color,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 800,
        }}>
          {stepIdx + 1}
        </div>
        <div style={{ width: 140 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-400)', marginBottom: 3 }}>
            {Math.round(((stepIdx + 1) / steps.length) * 100)}% — {stepIdx + 1} / {steps.length}
          </div>
          <div style={{ height: 4, background: 'var(--sand-100)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{
              width: `${((stepIdx + 1) / steps.length) * 100}%`,
              height: '100%', background: step.color,
              transition: 'width 0.3s',
            }} />
          </div>
        </div>
        <div style={{ width: 1, height: 22, background: 'var(--sand-100)' }} />
        <button
          onClick={() => setPaused(p => !p)}
          title={paused ? 'Reanudar' : 'Pausar'}
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            width: 30, height: 30, borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--ink-600)',
          }}
        >
          {paused ? <Play size={15} /> : <Pause size={15} />}
        </button>
        <button
          onClick={skip}
          title="Cerrar guía"
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            width: 30, height: 30, borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--ink-500)',
          }}
        >
          <X size={15} />
        </button>
      </div>

      <style>{`
        @keyframes popIn { 0% { opacity: 0; transform: scale(0.96) translateY(6px); } 100% { opacity: 1; transform: scale(1) translateY(0); } }
        @keyframes tourRingPulse {
          0%, 100% { box-shadow: 0 0 0 2px ${step.color}, 0 0 20px ${step.color}66; }
          50%      { box-shadow: 0 0 0 3px ${step.color}, 0 0 32px ${step.color}aa; }
        }
        @keyframes tourPinBob {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-3px); }
        }
      `}</style>
    </>
  );
}
