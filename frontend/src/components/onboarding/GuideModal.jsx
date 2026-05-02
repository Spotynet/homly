import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronRight, ChevronLeft, X, Check, ArrowRight, GripHorizontal,
} from 'lucide-react';

/**
 * GuideModal
 * ─────────────────────────────────────────────────────────────────
 * Modal draggable reutilizable para los capítulos operativos.
 * Se arrastra desde la barra superior (drag handle).
 *
 * Props:
 *   open        – boolean
 *   onClose     – fn(): cerrar
 *   onFinish    – fn(): opcional, llamado al terminar el último paso
 *   chapter     – objeto con:
 *       title, subtitle, color, bg, steps[]
 */

const MODAL_W = 540;
const MODAL_H = 480; // estimado para calcular posición inicial

export default function GuideModal({ open, onClose, onFinish, chapter }) {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [exiting, setExiting] = useState(false);

  // ── Drag state ──────────────────────────────────────────────────
  const [pos, setPos] = useState(null); // { x, y } esquina superior-izquierda
  const drag = useRef({ active: false, ox: 0, oy: 0, sx: 0, sy: 0 });
  // Tracks whether the mouse actually moved during the current drag.
  // Used to prevent the backdrop onClick from firing after a drag ends.
  const dragMoved = useRef(false);

  // Centrar el modal al abrirse
  useEffect(() => {
    if (open) {
      setStep(0);
      setPos({
        x: Math.max(16, (window.innerWidth  - MODAL_W) / 2),
        y: Math.max(16, (window.innerHeight - MODAL_H) / 2),
      });
    }
  }, [open, chapter]);

  // Listeners globales de drag
  useEffect(() => {
    const onMove = (e) => {
      if (!drag.current.active) return;
      dragMoved.current = true; // mark that the mouse actually moved during drag
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const nx = drag.current.sx + clientX - drag.current.ox;
      const ny = drag.current.sy + clientY - drag.current.oy;
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
    if (e.button !== undefined && e.button !== 0) return; // solo botón izquierdo
    e.preventDefault();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    drag.current.active = true;
    drag.current.ox = clientX;
    drag.current.oy = clientY;
    drag.current.sx = pos?.x ?? 0;
    drag.current.sy = pos?.y ?? 0;
    dragMoved.current = false; // reset at the start of each new drag
  }, [pos]);

  if (!open || !chapter) return null;
  const steps = chapter.steps || [];
  if (steps.length === 0) return null;

  const total    = steps.length;
  const safeStep = step < total ? step : 0;
  const current  = steps[safeStep];
  const isFirst  = safeStep === 0;
  const isLast   = safeStep === total - 1;
  const accentColor = current.color || chapter.color || 'var(--teal-500)';
  const accentBg    = current.bg    || chapter.bg    || 'var(--teal-50)';
  const IconComp    = current.icon;

  const goNext = () => {
    setExiting(true);
    setTimeout(() => { setStep(s => s + 1); setExiting(false); }, 160);
  };
  const goPrev = () => {
    setExiting(true);
    setTimeout(() => { setStep(s => s - 1); setExiting(false); }, 160);
  };
  const finish = () => {
    if (onFinish) onFinish();
    onClose();
  };
  const goToModule = () => {
    if (current.route) { onClose(); navigate(current.route); }
  };

  const modalLeft = pos?.x ?? Math.max(16, (window.innerWidth  - MODAL_W) / 2);
  const modalTop  = pos?.y ?? Math.max(16, (window.innerHeight - MODAL_H) / 2);

  return (
    <>
      <style>{`
        @keyframes gm-fade-in { from { opacity: 0; transform: scale(0.97); } to { opacity: 1; transform: scale(1); } }
        @keyframes gm-backdrop { from { opacity: 0; } to { opacity: 1; } }
        @keyframes gm-step-in  { from { opacity: 0; transform: translateX(16px); } to { opacity: 1; transform: translateX(0); } }
        .gm-step { animation: gm-step-in 0.22s ease forwards; }
        .gm-step.exiting { opacity: 0; transform: translateX(-10px); transition: opacity 0.14s ease, transform 0.14s ease; }
        .gm-handle { cursor: grab; }
        .gm-handle:active { cursor: grabbing; }
      `}</style>

      {/* Backdrop — solo para blur, no intercepta drag */}
      <div
        onClick={() => {
          // If the mouse moved during a drag that ended over the backdrop,
          // swallow this click instead of closing the modal.
          if (dragMoved.current) { dragMoved.current = false; return; }
          onClose();
        }}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(26,22,18,0.40)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
          zIndex: 1600,
          animation: 'gm-backdrop 0.3s ease forwards',
        }}
      />

      {/* Panel arrastrable — encima del backdrop */}
      <div
        style={{
          position: 'fixed',
          left: modalLeft,
          top:  modalTop,
          width: MODAL_W,
          zIndex: 1601,
          background: 'white',
          borderRadius: 'var(--radius-xl)',
          overflow: 'hidden',
          boxShadow: '0 24px 60px rgba(0,0,0,0.22), 0 4px 16px rgba(0,0,0,0.08)',
          animation: 'gm-fade-in 0.35s cubic-bezier(.22,1,.36,1) forwards',
          display: 'flex', flexDirection: 'column',
          userSelect: 'none',
        }}
        onClick={e => e.stopPropagation()} // evitar que el click cierre el modal
      >
        {/* ── Drag handle + progreso + cerrar ───────────────────── */}
        <div
          className="gm-handle"
          onMouseDown={startDrag}
          onTouchStart={startDrag}
          style={{
            padding: '14px 18px 10px',
            borderBottom: '1px solid var(--sand-100)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            background: 'var(--sand-50)',
          }}
        >
          {/* Ícono de arrastre */}
          <GripHorizontal size={16} color="var(--ink-300)" style={{ flexShrink: 0 }} />

          {/* Dots de progreso */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flex: 1, justifyContent: 'center' }}>
            {steps.map((_, i) => (
              <button
                key={i}
                onMouseDown={e => e.stopPropagation()} // no iniciar drag al hacer click en dots
                onClick={() => {
                  if (i !== safeStep) {
                    setExiting(true);
                    setTimeout(() => { setStep(i); setExiting(false); }, 160);
                  }
                }}
                aria-label={`Paso ${i + 1}`}
                style={{
                  width: i === safeStep ? 22 : 8,
                  height: 8,
                  borderRadius: 999,
                  background: i === safeStep
                    ? accentColor
                    : i < safeStep ? 'var(--teal-200)' : 'var(--sand-200)',
                  border: 'none',
                  cursor: i !== safeStep ? 'pointer' : 'default',
                  padding: 0,
                  transition: 'all 0.3s ease',
                  flexShrink: 0,
                }}
              />
            ))}
          </div>

          {/* Contador + cerrar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <span style={{ fontSize: 11, color: 'var(--ink-400)', fontWeight: 600 }}>
              {safeStep + 1} / {total}
            </span>
            <button
              onMouseDown={e => e.stopPropagation()}
              onClick={onClose}
              title="Cerrar"
              style={{
                width: 28, height: 28, borderRadius: '50%',
                background: 'var(--sand-200)', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <X size={14} color="var(--ink-500)" />
            </button>
          </div>
        </div>

        {/* ── Cuerpo del paso ───────────────────────────────────── */}
        <div style={{ padding: '22px 26px 16px', minHeight: 260 }}>
          <div key={safeStep} className={`gm-step${exiting ? ' exiting' : ''}`}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
              <div style={{
                width: 56, height: 56, borderRadius: 16,
                background: accentBg,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
                boxShadow: `0 0 0 5px ${accentBg}`,
              }}>
                {IconComp ? <IconComp size={24} color={accentColor} /> : null}
              </div>
              <div>
                <div style={{
                  fontSize: 10, fontWeight: 800, letterSpacing: '0.07em',
                  color: accentColor, textTransform: 'uppercase', marginBottom: 3,
                }}>
                  {current.subtitle}
                </div>
                <h2 style={{
                  margin: 0, fontSize: 19, fontWeight: 800,
                  fontFamily: 'var(--font-display)',
                  color: 'var(--ink-900)', lineHeight: 1.25,
                }}>
                  {current.title}
                </h2>
              </div>
            </div>

            <p style={{ margin: '0 0 12px', fontSize: 14, lineHeight: 1.6, color: 'var(--ink-600)' }}>
              {current.body}
            </p>

            {Array.isArray(current.tips) && current.tips.length > 0 && (
              <ul style={{ margin: '6px 0 0', padding: 0, listStyle: 'none' }}>
                {current.tips.map((tip, i) => (
                  <li key={i} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                    padding: '7px 10px',
                    background: 'var(--sand-50)',
                    borderRadius: 10, marginBottom: 5,
                    fontSize: 12.5, color: 'var(--ink-700)', lineHeight: 1.5,
                  }}>
                    <Check size={14} color={accentColor} style={{ flexShrink: 0, marginTop: 2 }} />
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            )}

            {current.route && (
              <button
                onMouseDown={e => e.stopPropagation()}
                onClick={goToModule}
                style={{
                  marginTop: 12, background: 'none', border: 'none', cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  fontSize: 12, fontWeight: 700, color: accentColor,
                  padding: '4px 0', transition: 'gap 0.2s',
                }}
                onMouseEnter={e => e.currentTarget.style.gap = '10px'}
                onMouseLeave={e => e.currentTarget.style.gap = '6px'}
              >
                Ir a {current.title} ahora <ArrowRight size={13} />
              </button>
            )}
          </div>
        </div>

        {/* ── Footer ────────────────────────────────────────────── */}
        <div style={{
          padding: '10px 22px 16px',
          borderTop: '1px solid var(--sand-100)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <button
            onMouseDown={e => e.stopPropagation()}
            onClick={goPrev}
            disabled={isFirst}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'none', border: '1px solid var(--sand-200)',
              borderRadius: 'var(--radius-sm)', padding: '8px 14px',
              fontSize: 13, fontWeight: 600, color: 'var(--ink-500)',
              cursor: isFirst ? 'not-allowed' : 'pointer',
              opacity: isFirst ? 0 : 1,
            }}
          >
            <ChevronLeft size={14} /> Anterior
          </button>

          {isLast ? (
            <button
              onMouseDown={e => e.stopPropagation()}
              onClick={finish}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                background: accentColor, color: 'white',
                border: 'none', borderRadius: 'var(--radius-sm)',
                padding: '9px 22px', fontSize: 13, fontWeight: 700,
                cursor: 'pointer',
                boxShadow: `0 2px 10px ${accentColor}44`,
              }}
            >
              <Check size={15} /> Entendido
            </button>
          ) : (
            <button
              onMouseDown={e => e.stopPropagation()}
              onClick={goNext}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                background: accentColor, color: 'white',
                border: 'none', borderRadius: 'var(--radius-sm)',
                padding: '9px 22px', fontSize: 13, fontWeight: 700,
                cursor: 'pointer',
                boxShadow: `0 2px 10px ${accentColor}44`,
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
