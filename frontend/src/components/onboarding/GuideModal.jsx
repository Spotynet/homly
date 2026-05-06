import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  ChevronRight, ChevronLeft, X, Check, GripHorizontal,
  MapPin,
} from 'lucide-react';

/**
 * GuideModal — Panel interactivo flotante
 * ─────────────────────────────────────────────────────────────────
 * Modal draggable NO bloqueante: no tiene backdrop, el usuario puede
 * interactuar con la pantalla mientras lee la guía.
 *
 * Comportamiento clave:
 *  - Al abrir un capítulo navega automáticamente al route del paso 1.
 *  - Al avanzar/retroceder entre pasos, si el nuevo paso tiene `route`,
 *    navega a esa pantalla automáticamente.
 *  - El panel flota fijo (position: fixed) por encima del contenido
 *    sin ningún overlay oscuro.
 *  - Es arrastrable desde la barra superior.
 *
 * Props:
 *   open        – boolean
 *   onClose     – fn()
 *   onFinish    – fn() opcional, llamado al terminar el último paso
 *   chapter     – { title, subtitle, color, bg, steps[] }
 */

const MODAL_W = 420;
const MODAL_H_EST = 460;

export default function GuideModal({ open, onClose, onFinish, chapter }) {
  const navigate  = useNavigate();
  const location  = useLocation();
  const [step,    setStep]    = useState(0);
  const [exiting, setExiting] = useState(false);

  // ── Drag ───────────────────────────────────────────────────────
  const [pos,     setPos]     = useState(null);
  const drag      = useRef({ active: false, ox: 0, oy: 0, sx: 0, sy: 0 });
  const dragMoved = useRef(false);

  // ── Helpers ────────────────────────────────────────────────────
  const positionModal = useCallback(() => ({
    x: window.innerWidth  - MODAL_W - 24,
    y: Math.max(80, (window.innerHeight - MODAL_H_EST) / 2),
  }), []);

  // Centrar (derecha) al abrirse o al cambiar de capítulo
  useEffect(() => {
    if (open) {
      setStep(0);
      setPos(positionModal());
    }
  }, [open, chapter, positionModal]);

  // Auto-navegar al route del paso actual
  useEffect(() => {
    if (!open || !chapter) return;
    const steps = chapter.steps || [];
    const safeStep = step < steps.length ? step : 0;
    const route = steps[safeStep]?.route;
    if (route && location.pathname !== route) {
      navigate(route);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, chapter, step]);

  // ── Drag listeners ─────────────────────────────────────────────
  useEffect(() => {
    const onMove = (e) => {
      if (!drag.current.active) return;
      dragMoved.current = true;
      const cx = e.touches ? e.touches[0].clientX : e.clientX;
      const cy = e.touches ? e.touches[0].clientY : e.clientY;
      const nx = drag.current.sx + cx - drag.current.ox;
      const ny = drag.current.sy + cy - drag.current.oy;
      setPos({
        x: Math.max(0, Math.min(window.innerWidth  - MODAL_W, nx)),
        y: Math.max(0, Math.min(window.innerHeight - 80,       ny)),
      });
    };
    const onUp = () => { drag.current.active = false; };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend',  onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend',  onUp);
    };
  }, []);

  const startDrag = useCallback((e) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;
    drag.current = { active: true, ox: cx, oy: cy, sx: pos?.x ?? 0, sy: pos?.y ?? 0 };
    dragMoved.current = false;
  }, [pos]);

  if (!open || !chapter) return null;
  const steps    = chapter.steps || [];
  if (steps.length === 0) return null;

  const total    = steps.length;
  const safeStep = step < total ? step : 0;
  const current  = steps[safeStep];
  const isFirst  = safeStep === 0;
  const isLast   = safeStep === total - 1;
  const accentColor = current.color || chapter.color || 'var(--teal-500)';
  const accentBg    = current.bg    || chapter.bg    || 'var(--teal-50)';
  const IconComp    = current.icon;

  const changeStep = (newStep) => {
    setExiting(true);
    setTimeout(() => { setStep(newStep); setExiting(false); }, 150);
  };
  const goNext = () => { if (!isLast)  changeStep(safeStep + 1); };
  const goPrev = () => { if (!isFirst) changeStep(safeStep - 1); };
  const finish = () => { if (onFinish) onFinish(); onClose(); };

  const left = pos?.x ?? positionModal().x;
  const top  = pos?.y ?? positionModal().y;

  // Indica si el paso actual está "en la pantalla correcta"
  const onCorrectScreen = current.route
    ? location.pathname === current.route
    : true;

  return (
    <>
      <style>{`
        @keyframes gm-slide-in {
          from { opacity: 0; transform: translateY(12px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)   scale(1);    }
        }
        @keyframes gm-step-in {
          from { opacity: 0; transform: translateX(14px); }
          to   { opacity: 1; transform: translateX(0);    }
        }
        .gm-panel   { animation: gm-slide-in 0.3s cubic-bezier(.22,1,.36,1) forwards; }
        .gm-step    { animation: gm-step-in 0.2s ease forwards; }
        .gm-step.exiting { opacity: 0; transform: translateX(-10px); transition: opacity 0.13s, transform 0.13s; }
        .gm-handle  { cursor: grab; user-select: none; }
        .gm-handle:active { cursor: grabbing; }
        .gm-next-btn:hover { filter: brightness(1.08); }
        .gm-prev-btn:hover { background: var(--sand-100) !important; }
      `}</style>

      {/* Panel flotante — SIN backdrop bloqueante */}
      <div
        className="gm-panel"
        onClick={e => e.stopPropagation()}
        style={{
          position:  'fixed',
          left:       left,
          top:        top,
          width:      MODAL_W,
          zIndex:     2000,
          background: 'white',
          borderRadius: 16,
          overflow:  'hidden',
          boxShadow: '0 8px 40px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08)',
          display:   'flex',
          flexDirection: 'column',
          userSelect: 'none',
          // Borde de acento sutil
          border: `1.5px solid ${accentColor}33`,
        }}
      >
        {/* ── Drag handle ──────────────────────────────────────── */}
        <div
          className="gm-handle"
          onMouseDown={startDrag}
          onTouchStart={startDrag}
          style={{
            padding: '10px 14px 8px',
            borderBottom: '1px solid var(--sand-100)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            background: 'var(--sand-50)',
          }}
        >
          {/* Grip + título del capítulo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <GripHorizontal size={15} color="var(--ink-300)" style={{ flexShrink: 0 }} />
            <span style={{
              fontSize: 11, fontWeight: 800, letterSpacing: '0.05em',
              color: accentColor, textTransform: 'uppercase',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {chapter.title}
            </span>
          </div>

          {/* Dots + contador + cerrar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {/* Dots de progreso */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {steps.map((_, i) => (
                <button
                  key={i}
                  onMouseDown={e => e.stopPropagation()}
                  onClick={() => { if (i !== safeStep) changeStep(i); }}
                  aria-label={`Paso ${i + 1}`}
                  style={{
                    width:  i === safeStep ? 18 : 7,
                    height: 7,
                    borderRadius: 999,
                    background: i === safeStep
                      ? accentColor
                      : i < safeStep ? `${accentColor}66` : 'var(--sand-300)',
                    border: 'none', padding: 0,
                    cursor: i !== safeStep ? 'pointer' : 'default',
                    transition: 'all 0.25s ease',
                    flexShrink: 0,
                  }}
                />
              ))}
            </div>
            <span style={{ fontSize: 10, color: 'var(--ink-400)', fontWeight: 600 }}>
              {safeStep + 1}/{total}
            </span>
            <button
              onMouseDown={e => e.stopPropagation()}
              onClick={onClose}
              title="Cerrar guía"
              style={{
                width: 26, height: 26, borderRadius: '50%',
                background: 'var(--sand-200)', border: 'none',
                cursor: 'pointer', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--sand-300)'}
              onMouseLeave={e => e.currentTarget.style.background = 'var(--sand-200)'}
            >
              <X size={13} color="var(--ink-500)" />
            </button>
          </div>
        </div>

        {/* ── Indicador de pantalla actual ─────────────────────── */}
        {current.route && (
          <div style={{
            padding: '6px 14px',
            background: onCorrectScreen ? `${accentColor}12` : '#fef9c3',
            borderBottom: `1px solid ${onCorrectScreen ? `${accentColor}22` : '#fde047'}`,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <MapPin size={12} color={onCorrectScreen ? accentColor : '#a16207'} style={{ flexShrink: 0 }} />
            <span style={{
              fontSize: 11, fontWeight: 600,
              color: onCorrectScreen ? accentColor : '#a16207',
            }}>
              {onCorrectScreen
                ? 'Estás en la pantalla correcta'
                : `Navega a: ${current.route.replace('/app/', '').replace(/-/g, ' ')}`}
            </span>
          </div>
        )}

        {/* ── Cuerpo del paso ──────────────────────────────────── */}
        <div style={{ padding: '18px 20px 14px', minHeight: 220 }}>
          <div key={safeStep} className={`gm-step${exiting ? ' exiting' : ''}`}>
            {/* Ícono + título */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <div style={{
                width: 48, height: 48, borderRadius: 14,
                background: accentBg, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: `0 0 0 4px ${accentBg}`,
              }}>
                {IconComp && <IconComp size={22} color={accentColor} />}
              </div>
              <div>
                <div style={{
                  fontSize: 10, fontWeight: 800, letterSpacing: '0.07em',
                  color: accentColor, textTransform: 'uppercase', marginBottom: 2,
                }}>
                  {current.subtitle}
                </div>
                <h2 style={{
                  margin: 0, fontSize: 17, fontWeight: 800,
                  color: 'var(--ink-900)', lineHeight: 1.25,
                }}>
                  {current.title}
                </h2>
              </div>
            </div>

            {/* Descripción */}
            <p style={{
              margin: '0 0 10px', fontSize: 13.5,
              lineHeight: 1.65, color: 'var(--ink-600)',
            }}>
              {current.body}
            </p>

            {/* Tips */}
            {Array.isArray(current.tips) && current.tips.length > 0 && (
              <ul style={{ margin: '4px 0 0', padding: 0, listStyle: 'none' }}>
                {current.tips.map((tip, i) => (
                  <li key={i} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 9,
                    padding: '6px 10px', marginBottom: 4,
                    background: 'var(--sand-50)', borderRadius: 9,
                    fontSize: 12, color: 'var(--ink-700)', lineHeight: 1.5,
                  }}>
                    <Check size={13} color={accentColor} style={{ flexShrink: 0, marginTop: 2 }} />
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* ── Footer de navegación ─────────────────────────────── */}
        <div style={{
          padding: '10px 16px 14px',
          borderTop: '1px solid var(--sand-100)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          {/* Anterior */}
          <button
            className="gm-prev-btn"
            onMouseDown={e => e.stopPropagation()}
            onClick={goPrev}
            disabled={isFirst}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              background: 'var(--sand-50)',
              border: '1px solid var(--sand-200)',
              borderRadius: 8, padding: '7px 13px',
              fontSize: 13, fontWeight: 600, color: 'var(--ink-500)',
              cursor: isFirst ? 'default' : 'pointer',
              opacity: isFirst ? 0 : 1,
              transition: 'background 0.15s',
            }}
          >
            <ChevronLeft size={14} /> Anterior
          </button>

          {/* Siguiente / Entendido */}
          {isLast ? (
            <button
              className="gm-next-btn"
              onMouseDown={e => e.stopPropagation()}
              onClick={finish}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                background: accentColor, color: 'white',
                border: 'none', borderRadius: 8,
                padding: '8px 20px', fontSize: 13, fontWeight: 700,
                cursor: 'pointer',
                boxShadow: `0 2px 10px ${accentColor}55`,
                transition: 'filter 0.15s',
              }}
            >
              <Check size={14} /> Entendido
            </button>
          ) : (
            <button
              className="gm-next-btn"
              onMouseDown={e => e.stopPropagation()}
              onClick={goNext}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                background: accentColor, color: 'white',
                border: 'none', borderRadius: 8,
                padding: '8px 20px', fontSize: 13, fontWeight: 700,
                cursor: 'pointer',
                boxShadow: `0 2px 10px ${accentColor}55`,
                transition: 'filter 0.15s',
              }}
            >
              Siguiente <ChevronRight size={14} />
            </button>
          )}
        </div>
      </div>
    </>
  );
}
