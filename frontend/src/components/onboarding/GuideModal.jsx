import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronRight, ChevronLeft, X, Check, ArrowRight,
} from 'lucide-react';

/**
 * GuideModal
 * ─────────────────────────────────────────────────────────────────
 * Modal genérico reutilizable (mismo estilo visual que el tour de
 * vecino) para presentar los capítulos operativos de cualquier rol.
 *
 * Props:
 *   open        – boolean
 *   onClose     – fn(): cerrar
 *   onFinish    – fn(): opcional, llamado al terminar el último paso
 *   chapter     – objeto con:
 *       title       string       → título del capítulo (mostrado en header)
 *       subtitle    string       → descripción corta
 *       color       string       → acento visual (p.ej. 'var(--teal-500)')
 *       bg          string       → color de fondo del icono (p.ej. 'var(--teal-50)')
 *       steps[]:
 *          id, icon, title, subtitle, body, route (opcional)
 */
export default function GuideModal({ open, onClose, onFinish, chapter }) {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [exiting, setExiting] = useState(false);

  // Reset al cambiar de capítulo
  React.useEffect(() => {
    if (open) setStep(0);
  }, [open, chapter]);

  if (!open || !chapter) return null;
  const steps = chapter.steps || [];
  if (steps.length === 0) return null;

  const total   = steps.length;
  const current = steps[step];
  const isFirst = step === 0;
  const isLast  = step === total - 1;
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
    if (current.route) {
      onClose();
      navigate(current.route);
    }
  };

  return (
    <>
      <style>{`
        @keyframes gm-fade-in { from { opacity: 0; transform: translateY(18px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes gm-backdrop { from { opacity: 0; } to { opacity: 1; } }
        @keyframes gm-step-in  { from { opacity: 0; transform: translateX(16px); } to { opacity: 1; transform: translateX(0); } }
        .gm-step { animation: gm-step-in 0.22s ease forwards; }
        .gm-step.exiting { opacity: 0; transform: translateX(-10px); transition: opacity 0.14s ease, transform 0.14s ease; }
      `}</style>

      <div
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(26,22,18,0.50)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          zIndex: 1600,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 20,
          animation: 'gm-backdrop 0.3s ease forwards',
        }}
      >
        <div
          style={{
            background: 'white',
            borderRadius: 'var(--radius-xl)',
            width: '100%', maxWidth: 540,
            overflow: 'hidden',
            boxShadow: 'var(--shadow-xl)',
            animation: 'gm-fade-in 0.35s cubic-bezier(.22,1,.36,1) forwards',
            display: 'flex', flexDirection: 'column',
          }}
        >
          {/* Header: dots de progreso + cerrar */}
          <div style={{
            padding: '16px 20px 12px',
            borderBottom: '1px solid var(--sand-100)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {steps.map((_, i) => (
                <button
                  key={i}
                  onClick={() => { if (i < step) { setExiting(true); setTimeout(() => { setStep(i); setExiting(false); }, 160); } }}
                  aria-label={`Paso ${i + 1}`}
                  style={{
                    width: i === step ? 22 : 8,
                    height: 8,
                    borderRadius: 999,
                    background: i === step
                      ? accentColor
                      : i < step ? 'var(--teal-200)' : 'var(--sand-200)',
                    border: 'none',
                    cursor: i < step ? 'pointer' : 'default',
                    padding: 0,
                    transition: 'all 0.3s ease',
                    flexShrink: 0,
                  }}
                />
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 11, color: 'var(--ink-400)', fontWeight: 600 }}>
                {step + 1} de {total}
              </span>
              <button
                onClick={onClose}
                title="Cerrar"
                style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: 'var(--sand-100)', border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <X size={14} color="var(--ink-500)" />
              </button>
            </div>
          </div>

          {/* Cuerpo del paso */}
          <div style={{ padding: '24px 26px 18px', minHeight: 300 }}>
            <div className={`gm-step${exiting ? ' exiting' : ''}`}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
                <div style={{
                  width: 58, height: 58, borderRadius: 16,
                  background: accentBg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                  boxShadow: `0 0 0 6px ${accentBg}`,
                }}>
                  {IconComp ? <IconComp size={26} color={accentColor} /> : null}
                </div>
                <div>
                  <div style={{
                    fontSize: 10, fontWeight: 800, letterSpacing: '0.07em',
                    color: accentColor, textTransform: 'uppercase', marginBottom: 4,
                  }}>
                    {current.subtitle}
                  </div>
                  <h2 style={{
                    margin: 0, fontSize: 20, fontWeight: 800,
                    fontFamily: 'var(--font-display)',
                    color: 'var(--ink-900)', lineHeight: 1.25,
                  }}>
                    {current.title}
                  </h2>
                </div>
              </div>

              <p style={{
                margin: '0 0 14px', fontSize: 14, lineHeight: 1.6,
                color: 'var(--ink-600)',
              }}>
                {current.body}
              </p>

              {/* Lista de acciones/tips opcional */}
              {Array.isArray(current.tips) && current.tips.length > 0 && (
                <ul style={{ margin: '8px 0 0', padding: 0, listStyle: 'none' }}>
                  {current.tips.map((tip, i) => (
                    <li key={i} style={{
                      display: 'flex', alignItems: 'flex-start', gap: 10,
                      padding: '8px 10px',
                      background: 'var(--sand-50)',
                      borderRadius: 10, marginBottom: 6,
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
                  onClick={goToModule}
                  style={{
                    marginTop: 14, background: 'none', border: 'none', cursor: 'pointer',
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

          {/* Footer */}
          <div style={{
            padding: '12px 22px 18px',
            borderTop: '1px solid var(--sand-100)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <button
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
      </div>
    </>
  );
}
