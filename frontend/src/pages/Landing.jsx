import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { HomlyBrand, HomlyBrandDark, HomlyIsotipo } from '../utils/helpers';

/* ─── Brand shorthands for Landing ─── */
/* Light bg (nav on scroll, footer light areas) */
const LogoFull = ({ iconSize = 38, nameHeight = 26 }) => (
  <HomlyBrand iconSize={iconSize} nameHeight={nameHeight} />
);
/* Dark bg (hero, dark sections, footer) */
const LogoFullDark = ({ iconSize = 38, fontSize = 26 }) => (
  <HomlyBrandDark iconSize={iconSize} fontSize={fontSize} />
);

/* ─── Feature icons (inline SVG, no emoji) ─── */
const IconChart = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#E85D43" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/>
    <line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/>
  </svg>
);
const IconReceipt = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#E85D43" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1z"/>
    <line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="16" y2="14"/>
  </svg>
);
const IconUsers = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#E85D43" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
);
const IconBell = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#E85D43" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
    <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
  </svg>
);
const IconShield = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#E85D43" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
  </svg>
);
const IconCheck = ({ color = '#E85D43', size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);
const IconArrow = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
  </svg>
);

/* ═══════════════════════════════════════
   LANDING PAGE
   ═══════════════════════════════════════ */
export default function Landing() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", background: '#FDFBF7', color: '#1A1612', overflowX: 'hidden' }}>

      {/* ── NAV ── */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        background: scrolled ? 'rgba(253,251,247,0.95)' : 'transparent',
        backdropFilter: scrolled ? 'blur(12px)' : 'none',
        borderBottom: scrolled ? '1px solid rgba(232,221,209,0.6)' : '1px solid transparent',
        transition: 'all 0.3s ease',
      }}>
        <div className="landing-nav-inner">
          {scrolled
            ? <LogoFull iconSize={36} nameHeight={22} />
            : <LogoFullDark iconSize={36} fontSize={22} />
          }

          {/* Desktop nav */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 36 }} className="hidden-mobile">
            <a href="#beneficios" style={navLinkStyle}>Beneficios</a>
            <a href="#como-funciona" style={navLinkStyle}>Cómo funciona</a>
            <a href="#contacto" style={navLinkStyle}>Contacto</a>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }} className="hidden-mobile">
            <Link to="/login" style={btnOutlineStyle}>Iniciar sesión</Link>
            <Link to="/registro" style={btnCoralStyle}>
              Empezar gratis <IconArrow />
            </Link>
          </div>

          {/* Mobile menu btn */}
          <button
            onClick={() => setMobileOpen(v => !v)}
            className="show-mobile"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 8, color: scrolled ? '#124A36' : '#fff' }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              {mobileOpen
                ? <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>
                : <><line x1="3" y1="8" x2="21" y2="8"/><line x1="3" y1="16" x2="21" y2="16"/></>
              }
            </svg>
          </button>
        </div>

        {/* Mobile dropdown */}
        {mobileOpen && (
          <div style={{ background: '#FDFBF7', borderTop: '1px solid #E8DFD1', padding: '20px 20px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>
            <a href="#beneficios" onClick={() => setMobileOpen(false)} style={{ ...navLinkStyle, fontSize: 16 }}>Beneficios</a>
            <a href="#como-funciona" onClick={() => setMobileOpen(false)} style={{ ...navLinkStyle, fontSize: 16 }}>Cómo funciona</a>
            <a href="#contacto" onClick={() => setMobileOpen(false)} style={{ ...navLinkStyle, fontSize: 16 }}>Contacto</a>
            <Link to="/registro" style={{ ...btnCoralStyle, justifyContent: 'center' }} onClick={() => setMobileOpen(false)}>
              Empezar gratis <IconArrow />
            </Link>
          </div>
        )}
      </nav>

      {/* ── HERO ── */}
      <section>
        <div className="landing-hero">
        <div className="landing-hero-grid">

          {/* Left — copy */}
          <div>
            <div style={tagStyle}>✦ Gestión de condominios</div>
            <h1 style={{
              fontSize: 'clamp(36px, 5vw, 60px)',
              fontWeight: 800,
              lineHeight: 1.1,
              color: '#124A36',
              margin: '24px 0 20px',
              letterSpacing: '-1.5px',
            }}>
              La administración<br />
              que tu hogar<br />
              <span style={{ color: '#E85D43' }}>se merece.</span>
            </h1>
            <p style={{ fontSize: 18, color: '#5C5347', lineHeight: 1.7, maxWidth: 460, marginBottom: 36 }}>
              Homly centraliza cobros, finanzas y comunicación de tu condominio en un solo lugar.
              Transparente, simple y pensado para la comunidad.
            </p>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <Link to="/registro" style={btnCoralLargeStyle}>
                Comenzar ahora <IconArrow />
              </Link>
            </div>

            {/* Trust badges */}
            <div style={{ display: 'flex', gap: 24, marginTop: 40, flexWrap: 'wrap' }}>
              {[
                'Cuentas claras',
                'Sin hojas de cálculo',
                'Roles por perfil',
              ].map(t => (
                <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#5C5347', fontSize: 13, fontWeight: 600 }}>
                  <IconCheck color="#1F7D5B" size={16} /> {t}
                </div>
              ))}
            </div>
          </div>

          {/* Right — product card mockup */}
          <div className="landing-hero-mockup" style={{ position: 'relative' }}>
            {/* Decorative blobs */}
            <div style={{
              position: 'absolute', top: -40, right: -40, width: 280, height: 280,
              borderRadius: '50%', background: 'radial-gradient(circle, rgba(232,93,67,0.10) 0%, transparent 70%)',
              zIndex: 0, pointerEvents: 'none',
            }} />
            <div style={{
              position: 'absolute', bottom: -20, left: -20, width: 200, height: 200,
              borderRadius: '50%', background: 'radial-gradient(circle, rgba(18,74,54,0.08) 0%, transparent 70%)',
              zIndex: 0, pointerEvents: 'none',
            }} />

            {/* Main card */}
            <div style={{ ...cardStyle, position: 'relative', zIndex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <div>
                  <div style={{ fontWeight: 700, color: '#1A1612', fontSize: 15 }}>Residencial Los Olivos</div>
                  <div style={{ fontSize: 12, color: '#9E9588', marginTop: 2 }}>48 unidades · Marzo 2025</div>
                </div>
                <div style={{ background: '#EFFAF6', borderRadius: 10, padding: '6px 12px', fontSize: 12, fontWeight: 700, color: '#1F7D5B' }}>
                  Activo
                </div>
              </div>

              {/* Stats row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
                <StatCard value="92%" label="Cobranza" bg="#EFFAF6" color="#175F45" />
                <StatCard value="$148K" label="Recaudado" bg="#FFF5F2" color="#D04E37" />
                <StatCard value="4" label="Pendientes" bg="#FFFBEB" color="#B45309" />
              </div>

              {/* Payment list */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { unit: 'C-001 · Casa Rodríguez', status: 'pagado' },
                  { unit: 'C-002 · Casa López', status: 'pagado' },
                  { unit: 'C-003 · Casa García', status: 'pendiente' },
                  { unit: 'C-004 · Casa Martínez', status: 'pagado' },
                ].map((r, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', background: '#FAF7F2', borderRadius: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#443D33' }}>{r.unit}</span>
                    <span style={{
                      fontSize: 11, fontWeight: 700, borderRadius: 20, padding: '3px 10px',
                      background: r.status === 'pagado' ? '#EFFAF6' : '#FFF5F2',
                      color: r.status === 'pagado' ? '#175F45' : '#D04E37',
                    }}>
                      {r.status === 'pagado' ? '✓ Pagado' : '○ Pendiente'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Floating mini card — notification */}
            <div style={{
              position: 'absolute', bottom: -20, left: -24, zIndex: 2,
              background: '#fff', borderRadius: 14, padding: '12px 16px',
              boxShadow: '0 8px 32px rgba(26,22,18,0.12)',
              border: '1px solid #F3EDE4',
              display: 'flex', alignItems: 'center', gap: 10,
              maxWidth: 220,
            }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: '#EFFAF6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1F7D5B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#1A1612' }}>Pago registrado</div>
                <div style={{ fontSize: 11, color: '#9E9588' }}>C-004 · $2,400</div>
              </div>
            </div>
          </div>
        </div>
        </div>
      </section>

      {/* ── STATS BAR ── */}
      <section className="landing-stats-bar">
        <div className="landing-stats-grid">
          {[
            { num: '+500', label: 'Unidades gestionadas' },
            { num: '98%', label: 'Satisfacción de usuarios' },
            { num: '+20', label: 'Condominios activos' },
            { num: '4 países', label: 'Presencia regional' },
          ].map((s, i) => (
            <div key={i}>
              <div style={{ fontSize: 36, fontWeight: 800, color: '#E85D43', letterSpacing: '-1px', lineHeight: 1 }}>{s.num}</div>
              <div style={{ fontSize: 13, color: 'rgba(253,251,247,0.7)', marginTop: 6, fontWeight: 500 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="beneficios" className="landing-section">
        <div className="landing-section-inner">
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div style={tagStyle}>Funcionalidades</div>
          <h2 style={{ fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 800, color: '#124A36', marginTop: 16, letterSpacing: '-1px' }}>
            Todo lo que necesitas,<br />nada que no necesitas
          </h2>
          <p style={{ color: '#7A7166', fontSize: 17, marginTop: 16, maxWidth: 500, margin: '16px auto 0' }}>
            Diseñado para simplificar la vida de administradores, tesoreros y vecinos.
          </p>
        </div>

        <div className="landing-features-grid">
          {[
            {
              icon: <IconChart />,
              title: 'Dashboard Financiero',
              desc: 'Visualiza el estado financiero de tu condominio en tiempo real. Ingresos, egresos y saldo disponible al instante.',
              highlight: true,
            },
            {
              icon: <IconReceipt />,
              title: 'Cobros y Recibos',
              desc: 'Registra pagos, genera recibos automáticamente y lleva un historial completo de cada unidad.',
            },
            {
              icon: <IconUsers />,
              title: 'Roles y Permisos',
              desc: 'Cada usuario accede solo a lo que le corresponde. Admin, tesorero, contador, auditor o vecino.',
            },
            {
              icon: <IconBell />,
              title: 'Avisos y Comunicados',
              desc: 'Centraliza la comunicación del condominio. Mantén a todos informados sin grupos de WhatsApp.',
            },
            {
              icon: <IconShield />,
              title: 'Control de Acceso',
              desc: 'Registro de entradas y salidas para vigilantes. Historial completo y acceso seguro.',
            },
            {
              icon: <HomlyIsotipo size={28} />,
              title: 'Multi-condominio',
              desc: 'Administra varios condominios desde una sola cuenta. Ideal para administradoras profesionales.',
            },
          ].map((f, i) => (
            <div key={i} style={{
              ...cardStyle,
              border: f.highlight ? '1.5px solid #E85D43' : '1px solid #E8DFD1',
              background: f.highlight ? '#FFF5F2' : '#fff',
              transition: 'transform 0.2s ease, box-shadow 0.2s ease',
            }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 12px 40px rgba(26,22,18,0.12)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(26,22,18,0.06)'; }}
            >
              <div style={{ width: 52, height: 52, borderRadius: 14, background: f.highlight ? '#FFE4DC' : '#FFF5F2', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
                {f.icon}
              </div>
              <h3 style={{ fontSize: 17, fontWeight: 700, color: '#1A1612', marginBottom: 10 }}>{f.title}</h3>
              <p style={{ fontSize: 14, color: '#7A7166', lineHeight: 1.65 }}>{f.desc}</p>
            </div>
          ))}
        </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="como-funciona" style={{ background: '#F3EDE4' }} className="landing-section">
        <div className="landing-section-inner">
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div style={tagStyle}>Proceso</div>
            <h2 style={{ fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 800, color: '#124A36', marginTop: 16, letterSpacing: '-1px' }}>
              Empieza en minutos
            </h2>
          </div>

          <div className="landing-steps-grid">
            {[
              { step: '01', title: 'Crea tu condominio', desc: 'Configura el perfil de tu condominio: nombre, unidades, cuota de mantenimiento y moneda.' },
              { step: '02', title: 'Agrega a tu equipo', desc: 'Invita a tu tesorero, contador o vecinos. Cada rol tiene acceso exacto a lo que necesita.' },
              { step: '03', title: 'Registra y cobra', desc: 'Captura pagos, genera recibos y lleva las cuentas al día. Todo en un solo lugar.' },
            ].map((s, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ fontSize: 52, fontWeight: 800, color: '#E8DFD1', letterSpacing: '-2px', lineHeight: 1 }}>{s.step}</div>
                <div style={{ width: 40, height: 3, background: '#E85D43', borderRadius: 2 }} />
                <h3 style={{ fontSize: 20, fontWeight: 700, color: '#124A36' }}>{s.title}</h3>
                <p style={{ fontSize: 15, color: '#7A7166', lineHeight: 1.65 }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TESTIMONIAL QUOTE ── */}
      <section className="landing-section" style={{ maxWidth: 900, margin: '0 auto', textAlign: 'center' }}>
        <HomlyIsotipo size={64} style={{ margin: '0 auto 8px', display: 'block', borderRadius: 16, boxShadow: '0 4px 20px rgba(18,74,54,0.15)' }} />
        <blockquote style={{
          fontSize: 'clamp(20px, 3vw, 32px)',
          fontWeight: 700,
          color: '#124A36',
          lineHeight: 1.45,
          letterSpacing: '-0.5px',
          margin: '32px 0',
        }}>
          "Antes perdíamos horas en hojas de Excel. Ahora el condominio se administra solo."
        </blockquote>
        <div style={{ fontSize: 14, color: '#9E9588', fontWeight: 600 }}>
          Administrador, Residencial Los Pinos · Ciudad de México
        </div>
      </section>

      {/* ── CTA FINAL ── */}
      <section id="contacto" className="landing-section" style={{ background: '#124A36' }}>
        <div style={{ maxWidth: 700, margin: '0 auto', textAlign: 'center' }}>
          <LogoFullDark iconSize={56} fontSize={38} />
          <h2 style={{
            fontSize: 'clamp(28px, 4vw, 48px)',
            fontWeight: 800,
            color: '#FDFBF7',
            letterSpacing: '-1px',
            margin: '32px 0 16px',
            lineHeight: 1.15,
          }}>
            ¿Listo para transformar<br />tu condominio?
          </h2>
          <p style={{ color: 'rgba(253,251,247,0.65)', fontSize: 17, marginBottom: 40, lineHeight: 1.65 }}>
            Únete a los condominios que ya administran con claridad y confianza.
          </p>
          <Link to="/registro" style={{
            display: 'inline-flex', alignItems: 'center', gap: 10,
            background: '#E85D43', color: '#fff',
            padding: '16px 36px', borderRadius: 999,
            fontWeight: 700, fontSize: 17,
            textDecoration: 'none',
            boxShadow: '0 8px 32px rgba(232,93,67,0.35)',
            transition: 'transform 0.2s ease, box-shadow 0.2s ease',
          }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 12px 40px rgba(232,93,67,0.45)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 8px 32px rgba(232,93,67,0.35)'; }}
          >
            Empezar ahora, es gratis <IconArrow />
          </Link>

          <div style={{ marginTop: 32, display: 'flex', gap: 24, justifyContent: 'center', flexWrap: 'wrap' }}>
            {['Sin tarjeta de crédito', 'Soporte incluido', 'Datos seguros'].map(t => (
              <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'rgba(253,251,247,0.6)', fontSize: 13, fontWeight: 600 }}>
                <IconCheck color="#3BB990" size={15} /> {t}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ background: '#0E3829', padding: '32px 20px' }}>
        <div className="landing-footer-inner">
          <LogoFullDark iconSize={32} fontSize={20} />
          <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', justifyContent: 'center' }}>
            {['Beneficios', 'Cómo funciona', 'Iniciar sesión'].map((l, i) => (
              <a key={i} href={i === 2 ? '/login' : `#${['beneficios', 'como-funciona'][i]}`}
                style={{ fontSize: 13, color: 'rgba(253,251,247,0.5)', textDecoration: 'none', fontWeight: 500, transition: 'color 0.2s' }}
                onMouseEnter={e => e.currentTarget.style.color = 'rgba(253,251,247,0.9)'}
                onMouseLeave={e => e.currentTarget.style.color = 'rgba(253,251,247,0.5)'}
              >{l}</a>
            ))}
          </div>
          <div style={{ width: '100%', height: 1, background: 'rgba(253,251,247,0.08)' }} />
          <div style={{ fontSize: 12, color: 'rgba(253,251,247,0.35)', fontWeight: 500 }}>
            © {new Date().getFullYear()} Homly · Powered by Spotynet
          </div>
        </div>
      </footer>

      {/* ── Responsive styles ── */}
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

/* ─── Sub-components ─── */
function StatCard({ value, label, bg, color }) {
  return (
    <div style={{ background: bg, borderRadius: 12, padding: '14px 10px', textAlign: 'center' }}>
      <div style={{ fontSize: 22, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, fontWeight: 600, color, opacity: 0.75, marginTop: 4 }}>{label}</div>
    </div>
  );
}

/* ─── Style constants ─── */
const cardStyle = {
  background: '#fff',
  borderRadius: 20,
  padding: 24,
  border: '1px solid #E8DFD1',
  boxShadow: '0 2px 8px rgba(26,22,18,0.06)',
};

const tagStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  background: '#FFF5F2',
  color: '#E85D43',
  border: '1px solid #FFE4DC',
  borderRadius: 999,
  padding: '5px 14px',
  fontSize: 13,
  fontWeight: 700,
  letterSpacing: '0.3px',
};

const navLinkStyle = {
  fontSize: 14,
  fontWeight: 600,
  color: '#443D33',
  textDecoration: 'none',
  transition: 'color 0.2s',
};

const btnOutlineStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '9px 20px',
  borderRadius: 999,
  border: '1.5px solid #D4C8B5',
  background: 'transparent',
  color: '#443D33',
  fontWeight: 600,
  fontSize: 14,
  textDecoration: 'none',
  transition: 'border-color 0.2s, color 0.2s',
};

const btnCoralStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '9px 20px',
  borderRadius: 999,
  background: '#E85D43',
  color: '#fff',
  fontWeight: 700,
  fontSize: 14,
  textDecoration: 'none',
  boxShadow: '0 4px 16px rgba(232,93,67,0.25)',
  transition: 'transform 0.2s ease, box-shadow 0.2s ease',
};

const btnCoralLargeStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 10,
  padding: '14px 32px',
  borderRadius: 999,
  background: '#E85D43',
  color: '#fff',
  fontWeight: 700,
  fontSize: 16,
  textDecoration: 'none',
  boxShadow: '0 6px 24px rgba(232,93,67,0.30)',
  transition: 'transform 0.2s ease, box-shadow 0.2s ease',
};
