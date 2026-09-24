import React, { useEffect, useRef } from 'react';

export default function SignaturePad({ onChange, disabled = false, height = 180 }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const dirty = useRef(false);

  const resize = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    const w = parent?.clientWidth || 320;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.floor(w * ratio);
    canvas.height = Math.floor(height * ratio);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1e293b';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, height);
    dirty.current = false;
    onChange?.(null);
  };

  useEffect(() => {
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [height]);

  const point = (ev) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const src = ev.touches ? ev.touches[0] : ev;
    return { x: src.clientX - rect.left, y: src.clientY - rect.top };
  };

  const start = (ev) => {
    if (disabled) return;
    ev.preventDefault();
    drawing.current = true;
    const ctx = canvasRef.current.getContext('2d');
    const p = point(ev);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };

  const move = (ev) => {
    if (!drawing.current || disabled) return;
    ev.preventDefault();
    const ctx = canvasRef.current.getContext('2d');
    const p = point(ev);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    if (!dirty.current) {
      dirty.current = true;
      canvasRef.current.toBlob((blob) => {
        if (blob) onChange?.(blob);
      }, 'image/png');
    }
  };

  const end = (ev) => {
    if (!drawing.current) return;
    ev.preventDefault();
    drawing.current = false;
    canvasRef.current.toBlob((blob) => {
      if (blob) onChange?.(blob);
    }, 'image/png');
  };

  return (
    <div>
      <div
        style={{
          border: '1px dashed var(--ink-300)',
          borderRadius: 12,
          overflow: 'hidden',
          background: '#fff',
          touchAction: 'none',
        }}
      >
        <canvas
          ref={canvasRef}
          onMouseDown={start}
          onMouseMove={move}
          onMouseUp={end}
          onMouseLeave={end}
          onTouchStart={start}
          onTouchMove={move}
          onTouchEnd={end}
          style={{ display: 'block', width: '100%', cursor: disabled ? 'default' : 'crosshair' }}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
        <span style={{ fontSize: 12, color: 'var(--ink-400)' }}>Firma con el dedo o el mouse</span>
        <button type="button" className="btn btn-outline btn-sm" onClick={resize} disabled={disabled}>
          Borrar
        </button>
      </div>
    </div>
  );
}
