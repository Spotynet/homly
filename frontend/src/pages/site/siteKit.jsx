import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Lock, ArrowRight, Check, Mail, Menu, X, Plus, Minus } from 'lucide-react';
import { HomlyBrand } from '../../utils/helpers';

/* ═══════════════════════════════════════════════════════════════════════════
   Kit del sitio público de Homly (Inicio + una página por servicio).

   POLÍTICA DE CONTENIDO PÚBLICO — leer antes de editar textos:
   · El sitio atrae a clientes nuevos: habla de resultados y de qué resuelve cada
     servicio, con el nombre de los módulos y su beneficio.
   · NO publica el "cómo": reglas de negocio, fórmulas e indicadores, plazos,
     límites, configuraciones, integraciones ni el detalle de los flujos.
   · Cada página de servicio cierra con <LockedTeaser/>: lo que "se ve en la
     demostración". Es intencional que ahí quede algo sin revelar.
   ═══════════════════════════════════════════════════════════════════════════ */

export const SITE_EMAIL = 'soporte@homly.mx';

export const COLORS = {
  green: '#124A36', greenMid: '#175F45', coral: '#E85D43', sand: '#F3EDE4',
  paper: '#FDFBF7', ink: '#1A1612', body: '#5C5347', muted: '#7A7166', line: '#E8DFD1',
  blue: '#1D4ED8',
};

export const cardStyle = {
  background: '#fff', borderRadius: 20, padding: 24,
  border: `1px solid ${COLORS.line}`, boxShadow: '0 2px 8px rgba(26,22,18,0.06)',
};
export const tagStyle = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  background: '#FFF5F2', color: COLORS.coral, border: '1px solid #FFE4DC',
  borderRadius: 999, padding: '5px 14px', fontSize: 13, fontWeight: 700, letterSpacing: '0.3px',
};
export const btnOutlineStyle = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 20px', borderRadius: 999,
  border: '1.5px solid #D4C8B5', background: 'transparent', color: '#443D33',
  fontWeight: 600, fontSize: 14, textDecoration: 'none', transition: 'border-color 0.2s, color 0.2s',
};
export const btnCoralStyle = {
  display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 20px', borderRadius: 999,
  background: COLORS.coral, color: '#fff', fontWeight: 700, fontSize: 14, textDecoration: 'none',
  boxShadow: '0 4px 16px rgba(232,93,67,0.25)',
};
export const btnCoralLargeStyle = {
  display: 'inline-flex', alignItems: 'center', gap: 10, padding: '14px 32px', borderRadius: 999,
  background: COLORS.coral, color: '#fff', fontWeight: 700, fontSize: 16, textDecoration: 'none',
  boxShadow: '0 6px 24px rgba(232,93,67,0.30)',
};
export const btnOutlineLargeStyle = { ...btnOutlineStyle, padding: '14px 24px', fontSize: 16 };
const navLinkStyle = { fontSize: 14, fontWeight: 600, color: '#443D33', textDecoration: 'none', transition: 'color 0.2s' };

export const IconArrow = () => <ArrowRight size={18} strokeWidth={2.5} />;
export const IconCheck = ({ color = COLORS.coral, size = 18 }) => <Check size={size} color={color} strokeWidth={2.75} />;

/** Título y descripción por página (SEO + pestaña del navegador). */
export function useSeo(title, description) {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = title;
    let meta = document.querySelector('meta[name="description"]');
    const prevDesc = meta?.getAttribute('content');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'description');
      document.head.appendChild(meta);
    }
    if (description) meta.setAttribute('content', description);
    return () => {
      document.title = prevTitle;
      if (prevDesc != null) meta.setAttribute('content', prevDesc);
    };
  }, [title, description]);
}

const NAV = [
  { to: '/', label: 'Inicio', key: 'home' },
  { to: '/condominios', label: 'Homly Residencial', key: 'condominios' },
  { to: '/propiedades', label: 'Homly Propiedades', key: 'propiedades' },
];

/** Para el servicio y el CTA de registro: /registro?servicio=… */
export const registroHref = (servicio) => (servicio ? `/registro?servicio=${servicio}` : '/registro');
export const demoHref = (asunto) =>
  `mailto:${SITE_EMAIL}?subject=${encodeURIComponent(asunto || 'Quiero una demostración de Homly')}`;

/* ─────────────────────────────  LAYOUT  ───────────────────────────── */

export function SiteLayout({ active, title, description, children }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const { pathname, hash } = useLocation();
  useSeo(title, description);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setOpen(false);
    if (!hash) window.scrollTo(0, 0);
  }, [pathname, hash]);

  const linkStyle = (k) => ({
    ...navLinkStyle,
    color: active === k ? COLORS.coral : '#443D33',
    borderBottom: active === k ? `2px solid ${COLORS.coral}` : '2px solid transparent',
    paddingBottom: 4,
  });

  return (
    <div style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", background: COLORS.paper, color: COLORS.ink, overflowX: 'hidden' }}>
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        background: scrolled || open ? 'rgba(253,251,247,0.96)' : 'rgba(253,251,247,0.55)',
        backdropFilter: 'blur(12px)',
        borderBottom: scrolled ? '1px solid rgba(232,221,209,0.7)' : '1px solid transparent',
        transition: 'all 0.3s ease',
      }}>
        <div className="landing-nav-inner">
          <Link to="/" aria-label="Homly, inicio" style={{ display: 'flex' }}>
            <HomlyBrand iconSize={36} nameHeight={22} />
          </Link>

          <div className="site-nav-links hidden-mobile">
            {NAV.map((l) => <Link key={l.key} to={l.to} style={linkStyle(l.key)}>{l.label}</Link>)}
            <a href="#contacto" style={linkStyle('contacto')}>Contacto</a>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }} className="hidden-mobile">
            <Link to="/login" style={btnOutlineStyle}>Iniciar sesión</Link>
            <Link to="/registro" style={btnCoralStyle}>Empezar gratis <IconArrow /></Link>
          </div>

          <Link to="/login" style={{ ...btnOutlineStyle, fontSize: 13, padding: '8px 16px' }} className="show-mobile">Iniciar sesión</Link>
          <button
            type="button" onClick={() => setOpen((v) => !v)} className="show-mobile"
            aria-label={open ? 'Cerrar menú' : 'Abrir menú'} aria-expanded={open}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 8, color: COLORS.green }}
          >
            {open ? <X size={24} strokeWidth={2.5} /> : <Menu size={24} strokeWidth={2.5} />}
          </button>
        </div>

        {open && (
          <div style={{ background: COLORS.paper, borderTop: '1px solid #E8DFD1', padding: '20px 20px 28px', display: 'flex', flexDirection: 'column', gap: 18 }}>
            {NAV.map((l) => <Link key={l.key} to={l.to} style={{ ...linkStyle(l.key), fontSize: 16, borderBottom: 'none' }}>{l.label}</Link>)}
            <a href="#contacto" onClick={() => setOpen(false)} style={{ ...navLinkStyle, fontSize: 16 }}>Contacto</a>
            <Link to="/registro" style={{ ...btnCoralStyle, justifyContent: 'center' }}>Empezar gratis <IconArrow /></Link>
          </div>
        )}
      </nav>

      <main>{children}</main>
      <SiteFooter />

      <style>{`
        @media (max-width: 768px) {
          .hidden-mobile { display: none !important; }
          .show-mobile { display: block !important; }
        }
        @media (min-width: 769px) {
          .show-mobile { display: none !important; }
          .hidden-mobile { display: flex !important; }
        }
      `}</style>
    </div>
  );
}

function SiteFooter() {
  const col = { display: 'flex', flexDirection: 'column', gap: 10 };
  const h = { fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: COLORS.green, marginBottom: 2 };
  const a = { fontSize: 13, color: '#3D342C', textDecoration: 'none', fontWeight: 500 };
  return (
    <footer style={{ background: '#F4EFE6', padding: '48px 24px 28px', borderTop: '1px solid #E4D9CB' }}>
      <div className="site-footer-grid">
        <div style={{ ...col, maxWidth: 360 }}>
          <HomlyBrand iconSize={32} nameHeight={20} />
          <p style={{ fontSize: 13, color: COLORS.body, margin: '4px 0 0', lineHeight: 1.6 }}>
            Un solo acceso para administrar condominios y propiedades. Dos licencias, cuentas claras.
          </p>
        </div>
        <div style={col}>
          <div style={h}>Servicios</div>
          <Link to="/condominios" style={a}>Homly Residencial</Link>
          <Link to="/propiedades" style={a}>Homly Propiedades</Link>
        </div>
        <div style={col}>
          <div style={h}>Tu cuenta</div>
          <Link to="/registro" style={a}>Empezar gratis</Link>
          <Link to="/login" style={a}>Iniciar sesión</Link>
        </div>
        <div style={col}>
          <div style={h}>Contacto</div>
          <a href={`mailto:${SITE_EMAIL}`} style={a}>{SITE_EMAIL}</a>
          <a href="#contacto" style={a}>Agendar una demostración</a>
        </div>
      </div>
      <div style={{ maxWidth: 1200, margin: '28px auto 0', paddingTop: 20, borderTop: '1px solid rgba(26,22,18,0.1)', textAlign: 'center' }}>
        <div style={{ fontSize: 12, color: COLORS.muted, fontWeight: 500 }}>© 2026 Homly® · {SITE_EMAIL}</div>
        <div style={{ fontSize: 11, color: '#9E9588', fontWeight: 500, marginTop: 6 }}>
          Homly® es una marca registrada ante el Instituto Mexicano de la Propiedad Industrial (IMPI).
        </div>
      </div>
    </footer>
  );
}

/* ─────────────────────────  BLOQUES DE PÁGINA  ───────────────────────── */

export function Section({ id, bg, children, style }) {
  return (
    <section id={id} className="landing-section" style={{ background: bg, ...style }}>
      <div className="landing-section-inner">{children}</div>
    </section>
  );
}

export function SectionHead({ tag, title, sub, align = 'center' }) {
  return (
    <div style={{ textAlign: align, marginBottom: 44 }}>
      {tag && <div style={tagStyle}>{tag}</div>}
      <h2 style={{ fontSize: 'clamp(26px, 4vw, 42px)', fontWeight: 800, color: COLORS.green, marginTop: tag ? 16 : 0, letterSpacing: '-1px', lineHeight: 1.15 }}>
        {title}
      </h2>
      {sub && (
        <p style={{ color: COLORS.muted, fontSize: 17, marginTop: 14, maxWidth: 640, lineHeight: 1.7, marginLeft: align === 'center' ? 'auto' : 0, marginRight: align === 'center' ? 'auto' : 0 }}>
          {sub}
        </p>
      )}
    </div>
  );
}

export function IconBox({ icon: Icon, size = 24, tone = 'coral' }) {
  const t = tone === 'blue' ? { bg: '#EFF6FF', fg: COLORS.blue } : tone === 'green' ? { bg: '#EFFAF6', fg: '#1F7D5B' } : { bg: '#FFF5F2', fg: COLORS.coral };
  return (
    <div style={{ width: 48, height: 48, borderRadius: 14, background: t.bg, color: t.fg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <Icon size={size} strokeWidth={2} />
    </div>
  );
}

/** Tarjetas de capacidades: título + beneficio (sin el detalle de cómo funcionan). */
export function PillarGrid({ items, tone }) {
  return (
    <div className="site-pillars">
      {items.map((it) => (
        <div key={it.title} style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <IconBox icon={it.icon} tone={tone} />
          <h3 style={{ fontSize: 17, fontWeight: 800, color: COLORS.ink, margin: 0 }}>{it.title}</h3>
          <p style={{ fontSize: 14, color: COLORS.muted, lineHeight: 1.65, margin: 0 }}>{it.desc}</p>
        </div>
      ))}
    </div>
  );
}

export function Steps({ items }) {
  return (
    <div className="landing-steps-grid">
      {items.map((s, i) => (
        <div key={s.title} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 48, fontWeight: 800, color: '#E8DFD1', letterSpacing: '-2px', lineHeight: 1 }}>{String(i + 1).padStart(2, '0')}</div>
          <div style={{ width: 40, height: 3, background: COLORS.coral, borderRadius: 2 }} />
          <h3 style={{ fontSize: 18, fontWeight: 700, color: COLORS.green, margin: 0 }}>{s.title}</h3>
          <p style={{ fontSize: 15, color: COLORS.muted, lineHeight: 1.65, margin: 0 }}>{s.desc}</p>
        </div>
      ))}
    </div>
  );
}

/**
 * "Y hay más": muestra que existe más profundidad sin revelarla.
 * Los nombres son deliberadamente genéricos; el detalle se enseña en la demostración.
 */
export function LockedTeaser({ title, sub, items, demoSubject, tone = 'green' }) {
  const accent = tone === 'blue' ? COLORS.blue : '#1F7D5B';
  return (
    <div className="site-locked" style={{ '--accent': accent }}>
      <div className="site-locked-ghost" aria-hidden="true">
        {[78, 52, 91, 64, 40, 70].map((w, i) => <i key={i} style={{ width: `${w}%` }} />)}
      </div>
      <div className="site-locked-body">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <span className="site-locked-lock"><Lock size={18} strokeWidth={2.5} /></span>
          <h3 style={{ margin: 0, fontSize: 'clamp(20px, 3vw, 26px)', fontWeight: 800, color: COLORS.green, letterSpacing: '-0.5px' }}>{title}</h3>
        </div>
        <p style={{ margin: '0 0 22px', color: COLORS.body, fontSize: 15, lineHeight: 1.7, maxWidth: 620 }}>{sub}</p>
        <div className="site-locked-grid">
          {items.map((t) => (
            <div key={t} className="site-locked-chip"><Lock size={13} strokeWidth={2.5} /> <span>{t}</span></div>
          ))}
        </div>
        <div style={{ marginTop: 26, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <a href={demoHref(demoSubject)} style={btnCoralLargeStyle}>Ver todo en una demostración <IconArrow /></a>
        </div>
      </div>
    </div>
  );
}

export function FaqList({ items }) {
  const [openIdx, setOpenIdx] = useState(null);
  return (
    <div style={{ maxWidth: 820, margin: '0 auto' }}>
      {items.map((item, i) => {
        const isOpen = openIdx === i;
        return (
          <div key={item.q} style={{ borderBottom: '1px solid #DDD4C7' }}>
            <button
              type="button" onClick={() => setOpenIdx(isOpen ? null : i)} aria-expanded={isOpen}
              style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, padding: '20px 4px', textAlign: 'left' }}
            >
              <span style={{ fontSize: 15, fontWeight: 700, color: isOpen ? COLORS.coral : COLORS.ink, lineHeight: 1.45, flex: 1 }}>{item.q}</span>
              <span style={{ flexShrink: 0, width: 26, height: 26, borderRadius: '50%', background: isOpen ? COLORS.coral : '#fff', border: `1.5px solid ${isOpen ? COLORS.coral : '#D4C8B5'}`, color: isOpen ? '#fff' : COLORS.muted, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 2 }}>
                {isOpen ? <Minus size={13} strokeWidth={3} /> : <Plus size={13} strokeWidth={3} />}
              </span>
            </button>
            <div style={{ maxHeight: isOpen ? 400 : 0, overflow: 'hidden', transition: 'max-height 0.3s ease' }}>
              <p style={{ margin: 0, padding: '0 32px 20px 4px', fontSize: 14, color: COLORS.body, lineHeight: 1.75 }}>{item.a}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Banda final de contacto (id="contacto"): el ancla del menú funciona en todas las páginas. */
export function ContactBand({ heading, sub, servicio, demoSubject }) {
  return (
    <section id="contacto" className="landing-section" style={{ background: COLORS.green }}>
      <div className="landing-section-inner">
        <div style={{ textAlign: 'center', maxWidth: 720, margin: '0 auto 40px' }}>
          <h2 style={{ fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 800, color: COLORS.paper, letterSpacing: '-1px', margin: '0 0 16px', lineHeight: 1.15 }}>{heading}</h2>
          <p style={{ color: 'rgba(253,251,247,0.7)', fontSize: 17, margin: 0, lineHeight: 1.65 }}>{sub}</p>
        </div>
        <div className="landing-contact-grid">
          <div style={{ background: 'rgba(253,251,247,0.08)', border: '1px solid rgba(253,251,247,0.12)', borderRadius: 20, padding: 28 }}>
            <div style={{ color: COLORS.paper, fontWeight: 800, fontSize: 16, marginBottom: 8 }}>Agenda una demostración</div>
            <p style={{ color: 'rgba(253,251,247,0.65)', fontSize: 14, lineHeight: 1.6, margin: '0 0 16px' }}>
              Te mostramos Homly con un caso como el tuyo y respondemos tus dudas de planes.
            </p>
            <a href={demoHref(demoSubject)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: '#fff', fontWeight: 700, fontSize: 15, textDecoration: 'none' }}>
              <Mail size={20} /> {SITE_EMAIL}
            </a>
          </div>
          <div style={{ background: 'rgba(253,251,247,0.08)', border: '1px solid rgba(253,251,247,0.12)', borderRadius: 20, padding: 28 }}>
            <div style={{ color: COLORS.paper, fontWeight: 800, fontSize: 16, marginBottom: 8 }}>Prueba sin tarjeta</div>
            <p style={{ color: 'rgba(253,251,247,0.65)', fontSize: 14, lineHeight: 1.6, margin: '0 0 16px' }}>
              Registro en minutos. Un asesor te contacta y te confirma el plan.
            </p>
            <Link to={registroHref(servicio)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: COLORS.coral, color: '#fff', padding: '12px 22px', borderRadius: 999, fontWeight: 700, fontSize: 15, textDecoration: 'none' }}>
              Empezar ahora, es gratis <IconArrow />
            </Link>
          </div>
        </div>
        <div style={{ marginTop: 36, display: 'flex', gap: 24, justifyContent: 'center', flexWrap: 'wrap' }}>
          {['Sin tarjeta de crédito', 'Soporte incluido', 'Datos seguros'].map((t) => (
            <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'rgba(253,251,247,0.6)', fontSize: 13, fontWeight: 600 }}>
              <IconCheck color="#3BB990" size={15} /> {t}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Franja que conecta las páginas de servicio con la idea del sitio: un usuario, dos licencias. */
export function OtherServiceBand({ to, title, text, cta }) {
  return (
    <div style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap', background: '#FFF5F2', borderColor: '#FFE4DC' }}>
      <div style={{ flex: 1, minWidth: 260 }}>
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: COLORS.coral, marginBottom: 6 }}>Un usuario, dos licencias</div>
        <h3 style={{ margin: '0 0 6px', fontSize: 19, fontWeight: 800, color: COLORS.green }}>{title}</h3>
        <p style={{ margin: 0, fontSize: 14, color: COLORS.body, lineHeight: 1.65 }}>{text}</p>
      </div>
      <Link to={to} style={btnOutlineLargeStyle}>{cta} <IconArrow /></Link>
    </div>
  );
}
