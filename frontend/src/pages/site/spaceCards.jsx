import React, { useState, useEffect, useRef } from 'react';

export function Chip({ children, color, bg }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase',
      color, background: bg, padding: '3px 8px', borderRadius: 999,
    }}>{children}</span>
  );
}

/* Fotos de cada espacio de trabajo (carrusel de la tarjeta del hero). */
export const CONDO_SLIDES = [
  { src: '/img/landing-residencial.jpg', label: 'Edificios de departamentos', alt: 'Edificios de departamentos', pos: 'center 35%' },
  { src: '/img/landing-res-casas.jpg', label: 'Conjuntos privados de casas', alt: 'Conjunto privado de casas', pos: 'center 55%' },
  { src: '/img/landing-res-areas.jpg', label: 'Áreas comunes y alberca', alt: 'Áreas comunes con alberca', pos: 'center 60%' },
  { src: '/img/landing-res-torre.jpg', label: 'Torres residenciales', alt: 'Torre residencial al anochecer', pos: 'center 40%' },
];
export const RENTAS_SLIDES = [
  { src: '/img/landing-prop-nave.jpg', label: 'Naves industriales', alt: 'Nave industrial con andenes', pos: 'center 62%' },
  { src: '/img/landing-prop-local.jpg', label: 'Locales en centros comerciales', alt: 'Local en pasillo de centro comercial', pos: 'center 55%' },
  { src: '/img/landing-prop-bodega.jpg', label: 'Bodegas y almacenes', alt: 'Bodega con racks de almacenamiento', pos: 'center 55%' },
  { src: '/img/landing-prop-oficinas.jpg', label: 'Edificios de oficinas', alt: 'Edificio corporativo de oficinas', pos: 'center 45%' },
  { src: '/img/landing-inmobiliaria.jpg', label: 'Casas y residencias en renta', alt: 'Casa moderna en renta', pos: 'center 60%' },
];

export function SpaceCarousel({ slides, label, startDelay = 0, interval = 4800 }) {
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  const touchX = useRef(null);
  const n = slides.length;

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = (e) => setReduced(e.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  useEffect(() => {
    if (paused || reduced || n < 2) return undefined;
    let timer;
    const t0 = setTimeout(() => {
      timer = setInterval(() => {
        if (typeof document !== 'undefined' && document.hidden) return;
        setIdx((i) => (i + 1) % n);
      }, interval);
    }, startDelay);
    return () => { clearTimeout(t0); clearInterval(timer); };
  }, [paused, reduced, n, interval, startDelay]);

  const go = (i) => setIdx(((i % n) + n) % n);
  const onKey = (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); go(idx + 1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(idx - 1); }
  };
  const onTouchEnd = (e) => {
    if (touchX.current == null) return;
    const dx = (e.changedTouches?.[0]?.clientX ?? touchX.current) - touchX.current;
    touchX.current = null;
    if (Math.abs(dx) > 40) go(idx + (dx < 0 ? 1 : -1));
  };

  return (
    <div
      className="landing-space-art landing-carousel"
      role="group"
      aria-roledescription="carrusel"
      aria-label={label}
      tabIndex={0}
      onKeyDown={onKey}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onTouchStart={(e) => { touchX.current = e.touches?.[0]?.clientX ?? null; }}
      onTouchEnd={onTouchEnd}
    >
      {slides.map((s, i) => (
        <img
          key={s.src}
          src={s.src}
          alt={i === idx ? s.alt : ''}
          aria-hidden={i === idx ? undefined : 'true'}
          className={`landing-space-photo landing-carousel-img${i === idx ? ' is-active' : ''}`}
          style={{ objectPosition: s.pos }}
          loading={i === 0 ? 'eager' : 'lazy'}
          decoding="async"
          draggable={false}
        />
      ))}
      <div className="landing-space-photo-fade" aria-hidden="true" />
      <span className="landing-carousel-caption" aria-live={paused ? 'polite' : 'off'}>{slides[idx].label}</span>
      {n > 1 && (
        <>
          <button type="button" className="landing-carousel-btn is-prev" aria-label="Foto anterior" onClick={() => go(idx - 1)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <button type="button" className="landing-carousel-btn is-next" aria-label="Foto siguiente" onClick={() => go(idx + 1)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
          </button>
          <div className="landing-carousel-dots">
            {slides.map((s, i) => (
              <button
                key={s.src}
                type="button"
                className={i === idx ? 'is-active' : ''}
                aria-label={`Ver foto ${i + 1} de ${n}: ${s.label}`}
                aria-current={i === idx ? 'true' : undefined}
                onClick={() => go(i)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function CondoSpaceCard({ cardRef, slot = false }) {
  return (
    <div ref={cardRef} className={`landing-space-card landing-space-card--condo${slot ? ' landing-space-slot landing-space-slot--condo' : ''}`}>
      <div className="landing-space-chrome">
        <span className="landing-space-dots" aria-hidden="true"><i /><i /><i /></span>
        <span className="landing-space-chrome-title">Homly Residencial</span>
        <span className="landing-space-badge landing-space-badge--teal">Activo</span>
      </div>
      <SpaceCarousel slides={CONDO_SLIDES} label="Fotos de Homly Residencial" startDelay={0} />
      <div className="landing-space-body">
        <div className="landing-space-kicker" style={{ color: '#1F7D5B' }}>Administración de condominio</div>
        <div className="landing-space-meta">48 unidades · cobranza y planeación del mes</div>
        <div className="landing-space-stats">
          <div><strong>92%</strong><span>Cobranza</span></div>
          <div><strong>$148K</strong><span>Recaudado</span></div>
          <div><strong>4</strong><span>Pendientes</span></div>
        </div>
        <div className="landing-space-bar-label">
          <span>Planeación 2025</span>
          <span>78% ejecutado</span>
        </div>
        <div className="landing-space-bar"><i style={{ width: '78%', background: '#1F7D5B' }} /></div>
        <div className="landing-space-chips">
          <Chip color="#175F45" bg="#EFFAF6">Cobranza</Chip>
          <Chip color="#175F45" bg="#EFFAF6">Visitas</Chip>
          <Chip color="#B45309" bg="#FFFBEB">Paquetería</Chip>
        </div>
      </div>
    </div>
  );
}

export function RentasSpaceCard({ cardRef, slot = false }) {
  return (
    <div ref={cardRef} className={`landing-space-card landing-space-card--rentas${slot ? ' landing-space-slot landing-space-slot--rentas' : ''}`}>
      <div className="landing-space-chrome">
        <span className="landing-space-dots" aria-hidden="true"><i /><i /><i /></span>
        <span className="landing-space-chrome-title">Homly Propiedades</span>
        <span className="landing-space-badge landing-space-badge--blue">Activo</span>
      </div>
      <SpaceCarousel slides={RENTAS_SLIDES} label="Fotos de Homly Propiedades" startDelay={2400} />
      <div className="landing-space-body">
        <div className="landing-space-kicker" style={{ color: '#1D4ED8' }}>Administrar Propiedades</div>
        <div className="landing-space-meta">12 propiedades · rentas y operación</div>
        <div className="landing-space-bar-label">
          <span>Ocupación física</span>
          <span>10 / 12 · 83%</span>
        </div>
        <div className="landing-space-bar"><i style={{ width: '83%', background: '#2563EB' }} /></div>
        <div className="landing-rr-rows">
          {[
            ['C-01', 'Ana López', 'Ocupada'],
            ['C-04', '—', 'Vacante'],
            ['B-07', 'Bodega Norte', 'Ocupada'],
          ].map(([code, tenant, st]) => (
            <div key={code} className="landing-rr-row">
              <strong>{code}</strong>
              <span>{tenant}</span>
              <em className={st === 'Vacante' ? 'is-vacant' : ''}>{st}</em>
            </div>
          ))}
        </div>
        <div className="landing-space-chips">
          <Chip color="#1D4ED8" bg="#EFF6FF">Contratos</Chip>
          <Chip color="#1D4ED8" bg="#EFF6FF">Mantenimiento</Chip>
          <Chip color="#1D4ED8" bg="#EFF6FF">Mapa</Chip>
        </div>
      </div>
    </div>
  );
}

