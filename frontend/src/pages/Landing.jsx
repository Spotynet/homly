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
const IconCalendar = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#E85D43" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
  </svg>
);
const IconFileText = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#E85D43" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
    <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
  </svg>
);
const IconLock = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#E85D43" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
  </svg>
);
const IconShoppingBag = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#E85D43" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/>
    <path d="M16 10a4 4 0 0 1-8 0"/>
  </svg>
);
const IconTrendingDown = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#E85D43" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/>
    <polyline points="17 18 23 18 23 12"/>
  </svg>
);
const IconBuilding = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#E85D43" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>
  </svg>
);
const IconStar = ({ color = '#E85D43', size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color} stroke={color} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
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
  const [openFaq, setOpenFaq] = useState(null);

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
            <a href="#preguntas" style={navLinkStyle}>Preguntas</a>
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
            <a href="#preguntas" onClick={() => setMobileOpen(false)} style={{ ...navLinkStyle, fontSize: 16 }}>Preguntas</a>
            <a href="#contacto" onClick={() => setMobileOpen(false)} style={{ ...navLinkStyle, fontSize: 16 }}>Contacto</a>
            <Link to="/login" style={{ ...btnOutlineStyle, justifyContent: 'center' }} onClick={() => setMobileOpen(false)}>
              Iniciar sesión
            </Link>
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
      <section id="beneficios" className="landing-section" style={{ paddingBottom: 80 }}>
        <div className="landing-section-inner">
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div style={tagStyle}>Funcionalidades</div>
            <h2 style={{ fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 800, color: '#124A36', marginTop: 16, letterSpacing: '-1px' }}>
              Todo lo que necesitas,<br />nada que no necesitas
            </h2>
            <p style={{ color: '#7A7166', fontSize: 17, marginTop: 16, maxWidth: 520, margin: '16px auto 0' }}>
              Diseñado para simplificar la vida de administradores, tesoreros y vecinos.
              Cada módulo está pensado para el día a día de un condominio real.
            </p>
          </div>
        </div>

        {/* ─ Horizontal scroll row ─ */}
        <div style={{
          display: 'flex',
          overflowX: 'auto',
          gap: 18,
          padding: '8px 48px 28px',
          scrollSnapType: 'x mandatory',
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'thin',
          scrollbarColor: '#E8DFD1 transparent',
          cursor: 'default',
        }}>
          {[
            {
              icon: <IconChart />,
              title: 'Dashboard Financiero',
              desc: 'Panel en tiempo real con KPIs de cobranza, ingresos del período, egresos, saldo disponible y evolución mensual.',
              highlight: true,
              badge: 'Principal',
            },
            {
              icon: <IconReceipt />,
              title: 'Cobranza Mensual',
              desc: 'Registra pagos de mantenimiento, genera recibos PDF con folio, aplica cargos extra y mantén el historial de cada unidad.',
            },
            {
              icon: <IconShoppingBag />,
              title: 'Gastos y Caja Chica',
              desc: 'Controla gastos ordinarios y caja chica por categorías. Adjunta comprobantes y lleva el libro contable al día.',
            },
            {
              icon: <IconCalendar />,
              title: 'Reservas de Áreas Comunes',
              desc: 'Calendario interactivo para salón de eventos, alberca, gimnasio y más. Con control de disponibilidad y reglas por área.',
            },
            {
              icon: <IconFileText />,
              title: 'Estado de Cuenta',
              desc: 'Estado de cuenta detallado por unidad con exportación a PDF. Movimientos, saldo acumulado, adeudos y comprobantes descargables.',
            },
            {
              icon: <IconTrendingDown />,
              title: 'Plan de Pagos',
              desc: 'Gestiona adeudos en cuotas personalizadas. Define frecuencia, plazos e intereses. El vecino acepta el plan y los pagos se sincronizan automáticamente.',
              badge: 'Nuevo',
            },
            {
              icon: <IconLock />,
              title: 'Cierre de Período',
              desc: 'Cierra períodos contables con flujo de aprobación multiusuario. Una vez cerrado, no se permiten más registros para ese mes.',
            },
            {
              icon: <IconBell />,
              title: 'Notificaciones y Avisos',
              desc: 'Centraliza la comunicación: avisos generales, recordatorios de cobranza y alertas del sistema directamente en la plataforma.',
            },
            {
              icon: <IconUsers />,
              title: 'Roles y Permisos',
              desc: 'Admin, tesorero, contador, auditor, vigilante y vecino — cada perfil con acceso exacto a los módulos que necesita.',
            },
            {
              icon: <IconShield />,
              title: 'Control de Acceso',
              desc: 'Permisos configurables por módulo y por rol. Define qué puede ver y qué puede editar cada persona de tu equipo.',
            },
            {
              icon: <IconBuilding />,
              title: 'Gestión de Unidades',
              desc: 'Administra propietarios, inquilinos, cuotas individuales y exenciones. Historial completo por departamento o casa.',
            },
            {
              icon: <HomlyIsotipo size={28} />,
              title: 'Multi-condominio',
              desc: 'Administra múltiples condominios desde una sola cuenta. Ideal para administradoras profesionales con portafolio de inmuebles.',
            },
          ].map((f, i) => (
            <div
              key={i}
              style={{
                ...cardStyle,
                minWidth: 260,
                maxWidth: 260,
                flexShrink: 0,
                scrollSnapAlign: 'start',
                display: 'flex',
                flexDirection: 'column',
                gap: 0,
                border: f.highlight ? '1.5px solid #E85D43' : '1px solid #E8DFD1',
                background: f.highlight ? '#FFF5F2' : '#fff',
                transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                position: 'relative',
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 12px 40px rgba(26,22,18,0.12)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(26,22,18,0.06)'; }}
            >
              {f.badge && (
                <div style={{
                  position: 'absolute', top: 14, right: 14,
                  fontSize: 10, fontWeight: 800, letterSpacing: '0.5px',
                  background: f.highlight ? '#E85D43' : '#EFFAF6',
                  color: f.highlight ? '#fff' : '#175F45',
                  padding: '3px 8px', borderRadius: 999, textTransform: 'uppercase',
                }}>{f.badge}</div>
              )}
              <div style={{ width: 48, height: 48, borderRadius: 13, background: f.highlight ? '#FFE4DC' : '#FFF5F2', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
                {f.icon}
              </div>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1A1612', marginBottom: 10, marginTop: 0 }}>{f.title}</h3>
              <p style={{ fontSize: 13, color: '#7A7166', lineHeight: 1.65, margin: 0 }}>{f.desc}</p>
            </div>
          ))}
        </div>

        {/* Scroll hint */}
        <div style={{ textAlign: 'center', marginTop: 8 }}>
          <span style={{ fontSize: 12, color: '#C5BAB0', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            Desliza para ver todas las funciones
          </span>
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

      {/* ── TESTIMONIALS CAROUSEL ── */}
      <section className="landing-section" style={{ overflow: 'hidden' }}>
        <div className="landing-section-inner" style={{ paddingBottom: 0 }}>
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <div style={tagStyle}>Testimonios</div>
            <h2 style={{ fontSize: 'clamp(26px, 4vw, 40px)', fontWeight: 800, color: '#124A36', marginTop: 16, letterSpacing: '-1px' }}>
              Lo que dicen nuestros usuarios
            </h2>
          </div>
        </div>

        {/* Horizontal scroll track */}
        <div style={{
          display: 'flex',
          overflowX: 'auto',
          gap: 20,
          padding: '4px 48px 32px',
          scrollSnapType: 'x mandatory',
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}>
          {[
            {
              quote: 'Antes perdíamos horas en hojas de Excel. Ahora el condominio se administra prácticamente solo. Recomiendo Homly al 100%.',
              name: 'María Fernanda G.',
              role: 'Presidenta de Mesa Directiva',
              condo: 'Residencial Los Pinos · CDMX',
            },
            {
              quote: 'La cobranza era un caos total. Hoy tenemos visibilidad completa de quién debe y quién ya pagó, con solo un clic.',
              name: 'Roberto Salas',
              role: 'Tesorero',
              condo: 'Privada Jardines · Monterrey',
            },
            {
              quote: 'El cierre de período y el flujo de aprobaciones nos da la seguridad que necesitábamos. Los reportes PDF son excelentes.',
              name: 'Claudia Herrera',
              role: 'Administradora Externa',
              condo: 'Torre Mirador · Guadalajara',
            },
            {
              quote: 'Como vecino, puedo ver mi estado de cuenta, mis pagos y reservar áreas comunes sin tener que hablarle a nadie. Muy conveniente.',
              name: 'Jorge Medina',
              role: 'Propietario · Unidad 3B',
              condo: 'Condominio Arboledas · Querétaro',
            },
            {
              quote: 'Administro 4 condominios y con Homly los tengo todos en una sola plataforma. Me ahorra horas cada semana.',
              name: 'Lucía Vargas',
              role: 'Directora · LV Administraciones',
              condo: 'Portafolio multi-condominio',
            },
            {
              quote: 'El control de gastos y caja chica es muy fácil de usar. Subir comprobantes y ver el resumen por categoría es justo lo que necesitábamos.',
              name: 'Andrés Campos',
              role: 'Secretario de Comité',
              condo: 'Fraccionamiento Las Palmas · Mérida',
            },
          ].map((t, i) => (
            <div key={i} style={{
              ...cardStyle,
              minWidth: 320,
              maxWidth: 340,
              flexShrink: 0,
              scrollSnapAlign: 'start',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}>
              {/* Stars */}
              <div style={{ display: 'flex', gap: 3 }}>
                {[...Array(5)].map((_, s) => <IconStar key={s} />)}
              </div>
              {/* Quote */}
              <p style={{ fontSize: 14, color: '#443D33', lineHeight: 1.7, fontStyle: 'italic', margin: 0 }}>
                "{t.quote}"
              </p>
              {/* Author */}
              <div style={{ marginTop: 'auto', paddingTop: 12, borderTop: '1px solid #F3EDE4' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#1A1612' }}>{t.name}</div>
                <div style={{ fontSize: 12, color: '#9E9588', marginTop: 2 }}>{t.role}</div>
                <div style={{ fontSize: 12, color: '#C5BAB0', marginTop: 1 }}>{t.condo}</div>
              </div>
            </div>
          ))}
        </div>
        <style>{`.landing-testimonials-scroll::-webkit-scrollbar { display: none; }`}</style>
      </section>

      {/* ── FAQ ── */}
      <section id="preguntas" className="landing-section" style={{ background: '#F3EDE4' }}>
        <div className="landing-section-inner">

          <div style={{ textAlign: 'center', marginBottom: 52 }}>
            <div style={tagStyle}>Preguntas frecuentes</div>
            <h2 style={{ fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 800, color: '#124A36', marginTop: 16, letterSpacing: '-1px' }}>
              Todo lo que quieres saber
            </h2>
            <p style={{ color: '#7A7166', fontSize: 16, marginTop: 14, maxWidth: 480, margin: '14px auto 0' }}>
              Resolvemos las dudas más comunes antes de que empieces.
            </p>
          </div>

          {/* Two-column layout on desktop */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(440px, 1fr))',
            gap: '0 40px',
            alignItems: 'start',
          }}>
            {[
              {
                q: '¿Qué es Homly y para qué tipo de condominio sirve?',
                a: 'Homly es una plataforma de gestión administrativa para condominios residenciales: conjuntos habitacionales, fraccionamientos, edificios de departamentos o privadas. Funciona para condominios de cualquier tamaño, desde 8 unidades hasta los que tienen cientos.',
              },
              {
                q: '¿Necesito conocimientos técnicos o contables para usarlo?',
                a: 'No. Homly está diseñado para administradores, tesoreros y vecinos sin formación técnica. La interfaz es visual e intuitiva — si sabes usar WhatsApp o Excel, sabrás usar Homly sin necesidad de capacitación.',
              },
              {
                q: '¿Los vecinos también tienen acceso?',
                a: 'Sí. Cada residente puede tener su propia cuenta con acceso a su estado de cuenta, historial de pagos, reservas de áreas comunes y notificaciones del condominio. Todo sin necesidad de contactar al administrador para cada consulta.',
              },
              {
                q: '¿Cómo se registran los pagos de mantenimiento?',
                a: 'El administrador o tesorero captura los pagos cuando los recibe. Puedes registrarlos uno a uno o de manera masiva. Al guardar un pago se genera automáticamente un recibo PDF con folio para entregarlo al residente.',
              },
              {
                q: '¿Puedo administrar más de un condominio?',
                a: 'Sí. Desde una sola cuenta puedes gestionar múltiples condominios de forma independiente, cada uno con sus propias unidades, cuotas, usuarios y reportes. Ideal para administradoras profesionales con portafolio de inmuebles.',
              },
              {
                q: '¿Qué pasa si un residente tiene adeudos acumulados?',
                a: 'Puedes crear un Plan de Pagos para ese residente: defines cuotas, frecuencia y si aplica intereses. El vecino recibe el plan por correo, lo acepta desde su cuenta y los pagos del plan se integran automáticamente a la cobranza mensual.',
              },
              {
                q: '¿La plataforma funciona en celular?',
                a: 'Sí. Homly está adaptada para funcionar correctamente en smartphones y tabletas desde el navegador. Administradores pueden registrar pagos y vecinos pueden consultar su cuenta desde cualquier dispositivo, sin instalar nada.',
              },
              {
                q: '¿Mis datos y los del condominio están seguros?',
                a: 'Los datos se almacenan en servidores seguros con acceso controlado por rol. Ningún usuario puede ver información que no le corresponde. Los períodos cerrados son inmutables: nadie puede modificar registros históricos una vez aprobados.',
              },
              {
                q: '¿Puedo exportar o descargar la información del condominio?',
                a: 'Sí. Los estados de cuenta, recibos de pago, reportes de gastos y resúmenes financieros se pueden exportar a PDF en cualquier momento. Siempre tendrás acceso a tu información sin depender de la plataforma para presentarla.',
              },
              {
                q: '¿Qué planes de membresía existen y cómo funcionan?',
                a: 'Homly ofrece varios planes según el tamaño y las necesidades de tu condominio. Todos incluyen un período de prueba gratuita para que explores la plataforma sin límites. Una vez concluido el período de prueba, el administrador de Homly te asignará el plan que mejor se adapte a tu condominio y definirá las condiciones de facturación.',
              },
              {
                q: '¿Cómo activo mi membresía después del período de prueba?',
                a: 'Al completar tu registro en Homly, un asesor revisará tu solicitud y te contactará para confirmar el plan adecuado para tu condominio. Una vez aprobado, recibirás un correo de confirmación y tu cuenta quedará activada con los módulos incluidos en tu plan. No necesitas ingresar tarjeta de crédito para empezar.',
              },
              {
                q: '¿Puedo cambiar de plan si mis necesidades crecen?',
                a: 'Sí. Puedes solicitar un upgrade de plan en cualquier momento contactando a soporte. Si tu condominio crece en unidades o requieres módulos adicionales, el equipo de Homly ajustará tu suscripción y actualizará los módulos disponibles de forma inmediata.',
              },
              {
                q: '¿Qué sucede si mi membresía vence o se cancela?',
                a: 'Si la suscripción expira o se cancela, el acceso al sistema se suspende automáticamente. Los datos de tu condominio se conservan de forma segura. Para reactivar el acceso basta con contactar a soporte y regularizar la membresía; todo quedará tal y como lo dejaste.',
              },
              {
                q: '¿Los módulos disponibles dependen del plan contratado?',
                a: 'Sí. Cada plan define qué módulos están habilitados para tu condominio (cobranza, reservas, gastos, estado de cuenta, plan de pagos, etc.). Si necesitas un módulo que no está incluido en tu plan actual, puedes solicitar un upgrade y el equipo de Homly lo activará en tu cuenta.',
              },
            ].map((item, i) => {
              const isOpen = openFaq === i;
              return (
                <div
                  key={i}
                  style={{
                    borderBottom: '1px solid #DDD4C7',
                    overflow: 'hidden',
                  }}
                >
                  <button
                    onClick={() => setOpenFaq(isOpen ? null : i)}
                    style={{
                      width: '100%', background: 'none', border: 'none', cursor: 'pointer',
                      display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
                      gap: 16, padding: '20px 4px', textAlign: 'left',
                    }}
                  >
                    <span style={{
                      fontSize: 15, fontWeight: 700,
                      color: isOpen ? '#E85D43' : '#1A1612',
                      lineHeight: 1.45, flex: 1,
                      transition: 'color 0.2s',
                    }}>
                      {item.q}
                    </span>
                    {/* +/- icon */}
                    <span style={{
                      flexShrink: 0, width: 26, height: 26,
                      borderRadius: '50%',
                      background: isOpen ? '#E85D43' : '#fff',
                      border: `1.5px solid ${isOpen ? '#E85D43' : '#D4C8B5'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all 0.2s',
                      marginTop: 2,
                    }}>
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        {isOpen
                          ? <line x1="2" y1="6" x2="10" y2="6" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
                          : <>
                              <line x1="6" y1="2" x2="6" y2="10" stroke="#7A7166" strokeWidth="2" strokeLinecap="round"/>
                              <line x1="2" y1="6" x2="10" y2="6" stroke="#7A7166" strokeWidth="2" strokeLinecap="round"/>
                            </>
                        }
                      </svg>
                    </span>
                  </button>

                  {/* Answer */}
                  <div style={{
                    maxHeight: isOpen ? 300 : 0,
                    overflow: 'hidden',
                    transition: 'max-height 0.3s ease',
                  }}>
                    <p style={{
                      margin: 0, padding: '0 32px 20px 4px',
                      fontSize: 14, color: '#5C5347', lineHeight: 1.75,
                    }}>
                      {item.a}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>


        </div>
      </section>

      {/* ── CTA FINAL ── */}
      <section id="contacto" className="landing-section" style={{ background: '#124A36' }}>
        <div style={{ maxWidth: 700, margin: '0 auto', textAlign: 'center', paddingTop: 24 }}>
          <h2 style={{
            fontSize: 'clamp(28px, 4vw, 48px)',
            fontWeight: 800,
            color: '#FDFBF7',
            letterSpacing: '-1px',
            margin: '0 0 16px',
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
          <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', justifyContent: 'center' }}>
            {['Beneficios', 'Cómo funciona', 'Preguntas', 'Iniciar sesión'].map((l, i) => (
              <a key={i} href={i === 3 ? '/login' : `#${['beneficios', 'como-funciona', 'preguntas'][i]}`}
                style={{ fontSize: 13, color: 'rgba(253,251,247,0.5)', textDecoration: 'none', fontWeight: 500, transition: 'color 0.2s' }}
                onMouseEnter={e => e.currentTarget.style.color = 'rgba(253,251,247,0.9)'}
                onMouseLeave={e => e.currentTarget.style.color = 'rgba(253,251,247,0.5)'}
              >{l}</a>
            ))}
          </div>
          <div style={{ width: '100%', height: 1, background: 'rgba(253,251,247,0.08)' }} />
          <div style={{ fontSize: 12, color: 'rgba(253,251,247,0.35)', fontWeight: 500 }}>
            © {new Date().getFullYear()} Homly
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
