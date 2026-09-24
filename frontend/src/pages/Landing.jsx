import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { HomlyBrand, HomlyBrandDark, HomlyIsotipo } from '../utils/helpers';

/* ─── Brand shorthands for Landing ─── */
const LogoFull = ({ iconSize = 38, nameHeight = 26 }) => (
  <HomlyBrand iconSize={iconSize} nameHeight={nameHeight} />
);
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
const IconNewspaper = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#E85D43" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/>
    <path d="M18 14h-8M15 18h-5M10 6h8v4h-8z"/>
  </svg>
);
const IconKey = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#E85D43" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
  </svg>
);
const IconHome = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#E85D43" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
    <polyline points="9 22 9 12 15 12 15 22"/>
  </svg>
);
const IconClipboard = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#E85D43" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
    <rect x="8" y="2" width="8" height="4" rx="1"/>
    <path d="M8 12h8M8 16h5"/>
  </svg>
);
const IconTarget = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#E85D43" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>
  </svg>
);
const IconPackage = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#E85D43" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/>
    <path d="M3.3 7 12 12l8.7-5M12 22V12"/>
  </svg>
);
const IconUserCheck = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#E85D43" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <polyline points="16 11 18 13 22 9"/>
  </svg>
);
const IconWrench = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#E85D43" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
  </svg>
);
const IconVote = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#E85D43" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m9 12 2 2 4-4"/>
    <path d="M5 7c0-1.1.9-2 2-2h10a2 2 0 0 1 2 2v12H5V7Z"/>
    <path d="M22 19H2"/>
  </svg>
);
const IconList = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#E85D43" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>
  </svg>
);
const IconSwitch = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#E85D43" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/>
    <polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
  </svg>
);
const IconMail = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 7l-10 7L2 7"/>
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

const CONDO_FEATURES = [
  { icon: <IconChart />, title: 'Dashboard financiero', desc: 'Cobranza, ingresos, egresos y saldo del condominio, en un vistazo.' },
  { icon: <IconReceipt />, title: 'Cobranza mensual', desc: 'Registra cuotas, genera recibos con folio y ve quién ya pagó.' },
  { icon: <IconShoppingBag />, title: 'Gastos y caja chica', desc: 'Controla egresos con comprobantes y categorías claras.' },
  { icon: <IconClipboard />, title: 'Planeación', desc: 'Presupuesto anual frente a lo real, y proyectos de obra del condominio.' },
  { icon: <IconWrench />, title: 'Mantenimientos', desc: 'Preventivos y correctivos con evidencias, fechas y bitácora de cada trabajo.' },
  { icon: <IconVote />, title: 'Asambleas', desc: 'Convocatoria, quórum, votación, minuta y acta, con plazos según tu estado.' },
  { icon: <IconPackage />, title: 'Paquetería', desc: 'Recepción en caseta, aviso con foto y QR, entrega por código o firma.' },
  { icon: <IconUserCheck />, title: 'Visitas autorizadas', desc: 'Permanentes u ocasionales, QR en caseta, bitácora y aviso al anfitrión.' },
  { icon: <IconCalendar />, title: 'Reservas de áreas', desc: 'Salón, alberca o gimnasio, con calendario y reglas por área.' },
  { icon: <IconFileText />, title: 'Estado de cuenta', desc: 'Cada unidad ve su saldo, adeudos y comprobantes en PDF.' },
  { icon: <IconTrendingDown />, title: 'Plan de pagos', desc: 'Acuerdos a plazos para adeudos, aceptados por el residente.' },
  { icon: <IconLock />, title: 'Cierre de período', desc: 'Cierra el mes con aprobación. Lo cerrado ya no se altera.' },
  { icon: <IconNewspaper />, title: 'Comunicación', desc: 'Avisos, directorio de la comunidad y notificaciones a vecinos.' },
  { icon: <IconUsers />, title: 'Roles y permisos', desc: 'Admin, tesorero, contador, auditor, vigilante y vecino.' },
];

const RENTAS_FEATURES = [
  { icon: <IconHome />, title: 'Catálogo de propiedades', desc: 'Casas, departamentos u oficinas: alta, estado y ocupación.' },
  { icon: <IconTarget />, title: 'CRM de rentas', desc: 'Leads, visitas y conversión a inquilino con contrato.' },
  { icon: <IconFileText />, title: 'Contratos y partes', desc: 'Inquilinos, propietarios y contratos con fechas de vigencia.' },
  { icon: <IconList />, title: 'Rent Roll', desc: 'Ocupación, renta in-place, vacancia, depósitos y morosidad.' },
  { icon: <IconReceipt />, title: 'Cobranza de rentas', desc: 'Cargos del mes, pagos parciales y recibos de la inmobiliaria.' },
  { icon: <IconCalendar />, title: 'Calendario de vigencias', desc: 'Vencimientos, renovaciones y ocupaciones en un solo calendario.' },
  { icon: <IconKey />, title: 'Airbnb (iCal)', desc: 'Importa anuncios con URL e iCal oficial, sin guardar contraseña.' },
  { icon: <IconChart />, title: 'Dashboard inmobiliario', desc: 'Rentas cobradas, pendientes y propiedades activas.' },
  { icon: <IconUsers />, title: 'Equipo de la inmobiliaria', desc: 'Admin, tesorero y contador, con acceso solo a rentas.' },
];

const NAV_LINKS = [
  { href: '#servicios', label: 'Servicios' },
  { href: '#beneficios', label: 'Beneficios' },
  { href: '#como-funciona', label: 'Cómo funciona' },
  { href: '#preguntas', label: 'Preguntas' },
  { href: '#contacto', label: 'Contacto' },
];

/* ═══════════════════════════════════════
   LANDING PAGE
   ═══════════════════════════════════════ */
export default function Landing() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState(null);
  const [featureTab, setFeatureTab] = useState('condominio');
  const [rentasOnTop, setRentasOnTop] = useState(false);
  const condoCardRef = useRef(null);
  const rentasCardRef = useRef(null);
  const swappingRef = useRef(false);
  const pendingFlip = useRef(null);

  const swapSpaces = () => {
    if (swappingRef.current) return;
    const condo = condoCardRef.current;
    const rentas = rentasCardRef.current;
    if (!condo || !rentas) return;
    swappingRef.current = true;
    pendingFlip.current = {
      condoTop: condo.getBoundingClientRect().top,
      rentasTop: rentas.getBoundingClientRect().top,
    };
    setRentasOnTop((v) => !v);
  };

  useLayoutEffect(() => {
    const flip = pendingFlip.current;
    if (!flip) return;
    pendingFlip.current = null;
    const condo = condoCardRef.current;
    const rentas = rentasCardRef.current;
    if (!condo || !rentas) {
      swappingRef.current = false;
      return;
    }
    const ms = 640;
    const ease = 'cubic-bezier(0.22, 1, 0.36, 1)';
    condo.animate(
      [{ transform: `translateY(${flip.condoTop - condo.getBoundingClientRect().top}px)` }, { transform: 'none' }],
      { duration: ms, easing: ease },
    );
    const anim = rentas.animate(
      [{ transform: `translateY(${flip.rentasTop - rentas.getBoundingClientRect().top}px)` }, { transform: 'none' }],
      { duration: ms, easing: ease },
    );
    const done = () => { swappingRef.current = false; };
    anim.onfinish = done;
    anim.oncancel = done;
  }, [rentasOnTop]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const features = featureTab === 'rentas' ? RENTAS_FEATURES : CONDO_FEATURES;

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

          <div style={{ display: 'flex', alignItems: 'center', gap: 28 }} className="hidden-mobile">
            {NAV_LINKS.map(l => (
              <a key={l.href} href={l.href} style={navLinkStyle}>{l.label}</a>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }} className="hidden-mobile">
            <Link to="/login" style={btnOutlineStyle}>Iniciar sesión</Link>
            <Link to="/registro" style={btnCoralStyle}>
              Empezar gratis <IconArrow />
            </Link>
          </div>

          <Link to="/login" style={{ ...btnOutlineStyle, fontSize: 13, padding: '8px 16px' }} className="show-mobile">
            Iniciar sesión
          </Link>

          <button
            onClick={() => setMobileOpen(v => !v)}
            className="show-mobile"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 8, color: '#124A36' }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              {mobileOpen
                ? <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>
                : <><line x1="3" y1="8" x2="21" y2="8"/><line x1="3" y1="16" x2="21" y2="16"/></>
              }
            </svg>
          </button>
        </div>

        {mobileOpen && (
          <div style={{ background: '#FDFBF7', borderTop: '1px solid #E8DFD1', padding: '20px 20px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>
            {NAV_LINKS.map(l => (
              <a key={l.href} href={l.href} onClick={() => setMobileOpen(false)} style={{ ...navLinkStyle, fontSize: 16 }}>{l.label}</a>
            ))}
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

          <div>
            <div style={tagStyle}>✦ Condominios y rentas · Un solo administrador</div>
            <h1 style={{
              fontSize: 'clamp(34px, 5vw, 56px)',
              fontWeight: 800,
              lineHeight: 1.12,
              color: '#124A36',
              margin: '24px 0 20px',
              letterSpacing: '-1.5px',
            }}>
              Administra condominios<br />
              y rentas<br />
              <span style={{ color: '#E85D43' }}>desde una sola cuenta.</span>
            </h1>
            <p style={{ fontSize: 18, color: '#5C5347', lineHeight: 1.7, maxWidth: 500, marginBottom: 36 }}>
              Homly tiene dos servicios independientes: administración de condominios
              y gestión de rentas inmobiliarias. Un mismo administrador puede usar ambos,
              cambiar de espacio en un clic, y mantener las cuentas completamente separadas.
            </p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
              <Link to="/registro" style={btnCoralLargeStyle}>
                Empezar gratis <IconArrow />
              </Link>
              <a href="#servicios" style={{ ...btnOutlineStyle, padding: '14px 24px', fontSize: 16 }}>
                Ver los dos servicios
              </a>
            </div>

            <div style={{ display: 'flex', gap: 20, marginTop: 28, flexWrap: 'wrap' }}>
              {[
                'Dos espacios, un login',
                'Cuentas y planes separados',
                'Sin mezclar el dinero',
                'Listo en minutos',
              ].map(t => (
                <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#5C5347', fontSize: 13, fontWeight: 600 }}>
                  <IconCheck color="#1F7D5B" size={16} /> {t}
                </div>
              ))}
            </div>
          </div>

          <div className={`landing-hero-mockup${rentasOnTop ? ' is-rentas-first' : ''}`}>
            <div className="landing-mockup-glow" aria-hidden="true" />
            <CondoSpaceCard cardRef={condoCardRef} />
            <div className="landing-space-switch">
              <div className="landing-space-switch-line" aria-hidden="true" />
              <button
                type="button"
                className={`landing-space-switch-pill${rentasOnTop ? ' is-flipped' : ''}`}
                onClick={swapSpaces}
                aria-label="Cambiar el orden de Homly Residencial y Homly Inmobiliaria"
              >
                <IconSwitch />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#1A1612' }}>Cambia de espacio</div>
                  <div style={{ fontSize: 11, color: '#9E9588' }}>
                    {rentasOnTop ? 'Inmobiliaria arriba · Residencial abajo' : 'Residencial arriba · Inmobiliaria abajo'}
                  </div>
                </div>
              </button>
            </div>
            <RentasSpaceCard cardRef={rentasCardRef} />
          </div>
        </div>
        </div>
      </section>

      {/* ── STATS ── */}
      <section className="landing-stats-bar">
        <div className="landing-stats-grid">
          {[
            { num: '2 servicios', label: 'Condominios y rentas' },
            { num: '1 cuenta', label: 'Para administrar ambos' },
            { num: 'Planes aparte', label: 'Membresía por espacio' },
            { num: '2 países', label: 'México y Colombia' },
          ].map((s, i) => (
            <div key={i}>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#E85D43', letterSpacing: '-0.5px', lineHeight: 1.15 }}>{s.num}</div>
              <div style={{ fontSize: 13, color: 'rgba(253,251,247,0.7)', marginTop: 6, fontWeight: 500 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── TWO SERVICES ── */}
      <section id="servicios" className="landing-section">
        <div className="landing-section-inner">
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div style={tagStyle}>Qué ofrece Homly</div>
            <h2 style={{ fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 800, color: '#124A36', marginTop: 16, letterSpacing: '-1px' }}>
              Dos servicios. Independientes.<br />Pueden convivir juntos.
            </h2>
            <p style={{ color: '#7A7166', fontSize: 17, marginTop: 16, maxWidth: 640, margin: '16px auto 0', lineHeight: 1.7 }}>
              No es un solo sistema mezclado. Cada servicio es un espacio de trabajo propio,
              con su propio equipo, su propia cobranza y su propia membresía.
              Si administras un condominio y también rentas inmuebles, entras una vez y cambias de espacio.
            </p>
          </div>

          <div className="landing-services-grid">
            <ServiceCard
              badge="Servicio 1"
              badgeColor="#175F45"
              badgeBg="#EFFAF6"
              title="Administración de condominios"
              lead="Para mesas directivas, comités y administradoras de propiedad horizontal."
              points={[
                'Cobranza de cuotas y recibos con folio',
                'Gastos, caja chica y cierre de período',
                'Planeación, mantenimientos y asambleas',
                'Paquetería y visitas autorizadas con QR',
                'Reservas, avisos y directorio de la comunidad',
              ]}
            />
            <ServiceCard
              badge="Servicio 2"
              badgeColor="#1D4ED8"
              badgeBg="#EFF6FF"
              title="Gestión de rentas"
              lead="Para inmobiliarias y quien renta casas, departamentos u oficinas."
              points={[
                'Catálogo de propiedades e inquilinos',
                'CRM de leads y conversión a contrato',
                'Rent Roll de ocupación y renta in-place',
                'Cobranza de rentas y calendario de vigencias',
                'Airbnb por iCal, sin mezclar con el condominio',
              ]}
            />
          </div>

          <div style={{
            marginTop: 28, background: '#FFF5F2', border: '1.5px solid #FFE4DC',
            borderRadius: 20, padding: '22px 28px',
            display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap',
          }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: '#FFE4DC', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <IconSwitch />
            </div>
            <div style={{ flex: 1, minWidth: 240 }}>
              <h3 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 800, color: '#124A36' }}>
                Un administrador, los dos servicios
              </h3>
              <p style={{ margin: 0, fontSize: 15, color: '#5C5347', lineHeight: 1.7 }}>
                Con una sola cuenta entras a Homly. Desde ahí abres el condominio o la inmobiliaria.
                El dinero, los usuarios y los planes no se mezclan: cada espacio tiene su kardex de membresía
                y su propia cobranza. Empiezas con uno y, cuando lo necesites, activas el otro.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── WHO ── */}
      <section className="landing-section" style={{ background: '#F3EDE4', paddingTop: 80, paddingBottom: 80 }}>
        <div className="landing-section-inner">
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <div style={tagStyle}>¿Para quién es?</div>
            <h2 style={{ fontSize: 'clamp(26px, 4vw, 40px)', fontWeight: 800, color: '#124A36', marginTop: 16, letterSpacing: '-1px' }}>
              Si administras inmuebles, Homly te ahorra el caos
            </h2>
          </div>
          <div className="landing-who-grid">
            {[
              { title: 'Mesa directiva o comité', desc: 'Quieren cuentas claras, cobranza al día y que los vecinos vean su estado de cuenta sin WhatsApp eterno.' },
              { title: 'Administradora profesional', desc: 'Llevan varios condominios. En Homly cada uno vive aparte, y se entra al que toca en un clic.' },
              { title: 'Inmobiliaria o gestor de rentas', desc: 'Necesitan propiedades, contratos y cobro de renta sin usar hojas de cálculo ni mezclarlo con un condominio.' },
              { title: 'Quien hace las dos cosas', desc: 'Administra el condominio y también renta inmuebles. Un login, dos espacios, dos membresías. Así de simple.' },
            ].map((w) => (
              <div key={w.title} style={{ ...cardStyle, padding: 22 }}>
                <h3 style={{ fontSize: 16, fontWeight: 800, color: '#124A36', margin: '0 0 10px' }}>{w.title}</h3>
                <p style={{ fontSize: 14, color: '#5C5347', lineHeight: 1.65, margin: 0 }}>{w.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── BENEFITS ── */}
      <section id="beneficios" className="landing-section">
        <div className="landing-section-inner">
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div style={tagStyle}>Ventajas</div>
            <h2 style={{ fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 800, color: '#124A36', marginTop: 16, letterSpacing: '-1px' }}>
              Por qué es más fácil vender y operar con Homly
            </h2>
            <p style={{ color: '#7A7166', fontSize: 17, marginTop: 16, maxWidth: 560, margin: '16px auto 0' }}>
              Menos Excel, menos mensajes sueltos, más claridad para cobrar y para reportar.
            </p>
          </div>
          <div className="landing-adv-grid">
            {[
              { icon: <IconSwitch />, title: 'Un acceso para todo', desc: 'El administrador entra una vez. Cambia entre condominios y rentas sin otra contraseña ni otro sistema.' },
              { icon: <IconShield />, title: 'Cuentas que no se mezclan', desc: 'La cuota del condominio no se junta con la renta del inquilino. Cada espacio tiene su dinero, sus recibos y su historial.' },
              { icon: <IconReceipt />, title: 'Cobrar es el centro', desc: 'Recibo de cobro del mes, registro de pago y recibo de pago. Igual de claro en condominios y en rentas.' },
              { icon: <IconUsers />, title: 'Cada quien ve lo suyo', desc: 'El vecino ve su unidad. El inquilino no entra al condominio. El tesorero solo toca finanzas.' },
              { icon: <HomlyIsotipo size={28} />, title: 'Crece sin empezar de cero', desc: 'Hoy un condominio. Mañana una inmobiliaria. La cuenta ya está; solo se abre el segundo espacio.' },
              { icon: <IconLock />, title: 'Orden que se puede auditar', desc: 'Cierres, folios, evidencias y permisos. Sirve para el comité, el contador y quien llega después.' },
            ].map((b) => (
              <div key={b.title} style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ width: 48, height: 48, borderRadius: 13, background: '#FFF5F2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {b.icon}
                </div>
                <h3 style={{ fontSize: 16, fontWeight: 800, color: '#1A1612', margin: 0 }}>{b.title}</h3>
                <p style={{ fontSize: 14, color: '#7A7166', lineHeight: 1.65, margin: 0 }}>{b.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── MODULES ── */}
      <section className="landing-section" style={{ background: '#F3EDE4', paddingTop: 80 }}>
        <div className="landing-section-inner" style={{ marginBottom: 8 }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={tagStyle}>Cómo trabaja cada servicio</div>
            <h2 style={{ fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 800, color: '#124A36', marginTop: 16, letterSpacing: '-1px' }}>
              Módulos claros, sin relleno
            </h2>
            <p style={{ color: '#7A7166', fontSize: 16, marginTop: 14, maxWidth: 520, margin: '14px auto 0' }}>
              Elige un servicio y ve lo que incluye. No se copian módulos: cada espacio tiene lo que necesita.
            </p>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 8 }}>
            {[
              { id: 'condominio', label: 'Condominios' },
              { id: 'rentas', label: 'Rentas' },
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFeatureTab(tab.id)}
                style={{
                  padding: '10px 22px', borderRadius: 999, cursor: 'pointer', fontWeight: 700, fontSize: 14,
                  border: featureTab === tab.id ? 'none' : '1.5px solid #D4C8B5',
                  background: featureTab === tab.id ? '#124A36' : '#fff',
                  color: featureTab === tab.id ? '#fff' : '#443D33',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{
          display: 'flex', overflowX: 'auto', gap: 18, padding: '8px 48px 28px',
          scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'thin', scrollbarColor: '#E8DFD1 transparent',
        }}>
          {features.map((f) => (
            <div
              key={f.title}
              style={{
                ...cardStyle, minWidth: 250, maxWidth: 250, flexShrink: 0, scrollSnapAlign: 'start',
              }}
            >
              <div style={{ width: 48, height: 48, borderRadius: 13, background: '#FFF5F2', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                {f.icon}
              </div>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1A1612', margin: '0 0 10px' }}>{f.title}</h3>
              <p style={{ fontSize: 13, color: '#7A7166', lineHeight: 1.65, margin: 0 }}>{f.desc}</p>
            </div>
          ))}
        </div>
        <div style={{ textAlign: 'center', marginTop: 4 }}>
          <span style={{ fontSize: 12, color: '#C5BAB0', fontWeight: 500 }}>Desliza para ver los módulos</span>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="como-funciona" className="landing-section">
        <div className="landing-section-inner">
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div style={tagStyle}>Cómo funciona</div>
            <h2 style={{ fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 800, color: '#124A36', marginTop: 16, letterSpacing: '-1px' }}>
              Empiezas con uno. El otro se suma cuando quieras.
            </h2>
          </div>

          <div className="landing-steps-grid">
            {[
              { step: '01', title: 'Pide tu acceso', desc: 'Llenas el formulario. Un asesor te contacta. No pedimos tarjeta para empezar la prueba.' },
              { step: '02', title: 'Abre tu primer espacio', desc: 'Condominio o rentas: eliges el que necesitas hoy. Configuras unidades o propiedades y tu equipo.' },
              { step: '03', title: 'Cobra el mes', desc: 'Generas el recibo de cobro, registras el pago y emites el recibo de pago. La comunidad o el inquilino quedan al día.' },
              { step: '04', title: 'Activa el segundo servicio', desc: 'Si también administras rentas —o un condominio extra—, se abre otro espacio en la misma cuenta, con su propio plan.' },
            ].map((s) => (
              <div key={s.step} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ fontSize: 48, fontWeight: 800, color: '#E8DFD1', letterSpacing: '-2px', lineHeight: 1 }}>{s.step}</div>
                <div style={{ width: 40, height: 3, background: '#E85D43', borderRadius: 2 }} />
                <h3 style={{ fontSize: 18, fontWeight: 700, color: '#124A36', margin: 0 }}>{s.title}</h3>
                <p style={{ fontSize: 15, color: '#7A7166', lineHeight: 1.65, margin: 0 }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ── */}
      <section className="landing-section" style={{ overflow: 'hidden', background: '#F3EDE4' }}>
        <div className="landing-section-inner" style={{ paddingBottom: 0 }}>
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <div style={tagStyle}>Quienes ya lo usan</div>
            <h2 style={{ fontSize: 'clamp(26px, 4vw, 40px)', fontWeight: 800, color: '#124A36', marginTop: 16, letterSpacing: '-1px' }}>
              Condominios, rentas y quienes llevan ambos
            </h2>
          </div>
        </div>

        <div style={{
          display: 'flex', overflowX: 'auto', gap: 20, padding: '4px 48px 32px',
          scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none',
        }}>
          {[
            {
              quote: 'Antes perdíamos horas en Excel. Ahora el condominio se administra con cuentas claras y los vecinos ven su estado de cuenta solos.',
              name: 'María Fernanda G.',
              role: 'Presidenta de Mesa Directiva',
              place: 'Condominio · CDMX',
            },
            {
              quote: 'La cobranza era un caos. Hoy vemos quién debe y quién ya pagó, con recibo. Eso nos cambió el mes a mes.',
              name: 'Roberto Salas',
              role: 'Tesorero',
              place: 'Condominio · Monterrey',
            },
            {
              quote: 'Rento 11 departamentos. En Homly tengo contratos, vigencias y cobro de renta sin mezclarlo con el condominio que también administro.',
              name: 'Elena Ruiz',
              role: 'Administradora e inmobiliaria',
              place: 'Ambos servicios · Guadalajara',
            },
            {
              quote: 'Buscábamos una plataforma que sirviera en Colombia. Homly se adaptó: cobranza, reportes PDF y acceso para copropietarios.',
              name: 'Catalina Ospina',
              role: 'Administradora de Propiedad Horizontal',
              place: 'Condominio · Cali',
            },
            {
              quote: 'Administro 4 condominios y ahora también las rentas de un edificio. Una cuenta, varios espacios. Me ahorra el doble de sistemas.',
              name: 'Lucía Vargas',
              role: 'Directora · LV Administraciones',
              place: 'Portafolio mixto',
            },
            {
              quote: 'El calendario de contratos nos avisa qué renta vence. Dejamos de perseguir inquilinos a ciegas.',
              name: 'Diego Paredes',
              role: 'Gestor de rentas',
              place: 'Rentas · Querétaro',
            },
          ].map((t) => (
            <div key={t.name} style={{
              ...cardStyle, minWidth: 320, maxWidth: 340, flexShrink: 0, scrollSnapAlign: 'start',
              display: 'flex', flexDirection: 'column', gap: 16,
            }}>
              <div style={{ display: 'flex', gap: 3 }}>
                {[...Array(5)].map((_, s) => <IconStar key={s} />)}
              </div>
              <p style={{ fontSize: 14, color: '#443D33', lineHeight: 1.7, fontStyle: 'italic', margin: 0 }}>
                “{t.quote}”
              </p>
              <div style={{ marginTop: 'auto', paddingTop: 12, borderTop: '1px solid #F3EDE4' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#1A1612' }}>{t.name}</div>
                <div style={{ fontSize: 12, color: '#9E9588', marginTop: 2 }}>{t.role}</div>
                <div style={{ fontSize: 12, color: '#C5BAB0', marginTop: 1 }}>{t.place}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="preguntas" className="landing-section">
        <div className="landing-section-inner">
          <div style={{ textAlign: 'center', marginBottom: 52 }}>
            <div style={tagStyle}>Preguntas frecuentes</div>
            <h2 style={{ fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 800, color: '#124A36', marginTop: 16, letterSpacing: '-1px' }}>
              Lo que suelen preguntar antes de empezar
            </h2>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 440px), 1fr))',
            gap: '0 40px',
            alignItems: 'start',
          }}>
            {[
              {
                q: '¿Homly es solo para condominios?',
                a: 'No. Homly tiene dos servicios: administración de condominios y gestión de rentas inmobiliarias. Puedes contratar uno o los dos. No estás obligado a usar ambos.',
              },
              {
                q: '¿Un mismo administrador puede usar condominios y rentas?',
                a: 'Sí. Esa es una de las ventajas. Entras con un usuario, ves tus espacios y cambias entre un condominio y la inmobiliaria. Cada espacio tiene su propio equipo, su propia cobranza y su propia membresía.',
              },
              {
                q: '¿Qué módulos nuevos tiene cada servicio?',
                a: 'En condominios, además de cobranza y finanzas: Planeación (presupuesto y obra), Mantenimientos (preventivos y correctivos con evidencias), Asambleas (convocatoria, quórum y acta), Paquetería (recepción, QR y entrega) y Visitas Autorizadas (permanentes u ocasionales, bitácora en caseta y aviso al anfitrión). En rentas, el CRM convierte leads a contrato, el Rent Roll muestra ocupación y vacancia, y Airbnb entra por iCal oficial sin guardar contraseña.',
              },
              {
                q: '¿Se mezclan el dinero del condominio y el de las rentas?',
                a: 'No. Son espacios de trabajo independientes. Las cuotas de mantenimiento no se mezclan con las rentas de inquilinos. Los recibos, reportes y planes de membresía van por separado.',
              },
              {
                q: '¿Puedo empezar solo con rentas, sin un condominio?',
                a: 'Sí. Si eres inmobiliaria o rentas departamentos por tu cuenta, abres un espacio de rentas. El de condominios lo puedes agregar después, o nunca.',
              },
              {
                q: '¿Los vecinos ven las rentas de la inmobiliaria?',
                a: 'No. El residente del condominio solo ve su unidad, su estado de cuenta y lo de su comunidad. Quien entra al espacio de rentas ve propiedades y contratos. Los permisos no se cruzan.',
              },
              {
                q: '¿Cómo se cobran las membresías si tengo los dos servicios?',
                a: 'Cada espacio tiene su plan. El plan de condominios se cobra por unidades; el de rentas, por propiedades. En Mi Membresía ves el recibo de cobro del mes, registras el pago y emites el recibo de pago, en cada espacio por separado.',
              },
              {
                q: '¿Necesito saber de sistemas o de contabilidad?',
                a: 'No. Está pensado para mesas directivas, tesoreros e inmobiliarias del día a día. Si usas WhatsApp o una hoja de cálculo, puedes usar Homly.',
              },
              {
                q: '¿Los residentes o inquilinos también entran?',
                a: 'En condominios, sí: cada vecino ve su unidad, estado de cuenta, reservas, autoriza visitas y recoge paquetes con el QR del correo. En rentas, el equipo de la inmobiliaria opera el espacio; el cobro y los recibos salen desde ahí.',
              },
              {
                q: '¿Puedo llevar varios condominios y varias inmobiliarias?',
                a: 'Sí. Una cuenta puede tener varios espacios de condominio y varios de rentas. Ideal para administradoras que crecen su portafolio.',
              },
              {
                q: '¿Funciona en el celular?',
                a: 'Sí, desde el navegador del teléfono o la tablet. No hay que instalar una app para cobrar, consultar o cambiar de espacio.',
              },
              {
                q: '¿Cómo empiezo y cuánto cuesta?',
                a: 'Llenas el registro. Hay periodo de prueba sin tarjeta. Un asesor te asigna el plan según el tamaño (unidades o propiedades) y el servicio que vas a usar. Si más adelante activas el otro servicio, se cotiza su plan aparte.',
              },
              {
                q: '¿Qué pasa si dejo de pagar o quiero pausar?',
                a: 'El acceso de ese espacio se suspende. Los datos se conservan. Al regularizar la membresía, vuelves exactamente donde lo dejaste. El otro servicio, si está al corriente, sigue funcionando.',
              },
            ].map((item, i) => {
              const isOpen = openFaq === i;
              return (
                <div key={item.q} style={{ borderBottom: '1px solid #DDD4C7' }}>
                  <button
                    type="button"
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
                    }}>
                      {item.q}
                    </span>
                    <span style={{
                      flexShrink: 0, width: 26, height: 26, borderRadius: '50%',
                      background: isOpen ? '#E85D43' : '#fff',
                      border: `1.5px solid ${isOpen ? '#E85D43' : '#D4C8B5'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 2,
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
                  <div style={{ maxHeight: isOpen ? 560 : 0, overflow: 'hidden', transition: 'max-height 0.3s ease' }}>
                    <p style={{ margin: 0, padding: '0 32px 20px 4px', fontSize: 14, color: '#5C5347', lineHeight: 1.75 }}>
                      {item.a}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── CONTACT ── */}
      <section id="contacto" className="landing-section" style={{ background: '#124A36' }}>
        <div className="landing-section-inner">
          <div style={{ textAlign: 'center', maxWidth: 720, margin: '0 auto 40px' }}>
            <h2 style={{
              fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 800, color: '#FDFBF7',
              letterSpacing: '-1px', margin: '0 0 16px', lineHeight: 1.15,
            }}>
              ¿Listo para ordenar condominios,<br />rentas, o ambos?
            </h2>
            <p style={{ color: 'rgba(253,251,247,0.7)', fontSize: 17, margin: 0, lineHeight: 1.65 }}>
              Cuéntanos qué administras. Te armamos el espacio correcto —o los dos—
              y te acompañamos en la prueba.
            </p>
          </div>

          <div className="landing-contact-grid">
            <div style={{ background: 'rgba(253,251,247,0.08)', border: '1px solid rgba(253,251,247,0.12)', borderRadius: 20, padding: 28 }}>
              <div style={{ color: '#FDFBF7', fontWeight: 800, fontSize: 16, marginBottom: 8 }}>Escríbenos</div>
              <p style={{ color: 'rgba(253,251,247,0.65)', fontSize: 14, lineHeight: 1.6, margin: '0 0 16px' }}>
                Dudas de planes, de los dos servicios o de cómo migrar lo que hoy llevas en Excel.
              </p>
              <a href="mailto:soporte@homly.mx" style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                color: '#fff', fontWeight: 700, fontSize: 15, textDecoration: 'none',
              }}>
                <IconMail /> soporte@homly.mx
              </a>
            </div>
            <div style={{ background: 'rgba(253,251,247,0.08)', border: '1px solid rgba(253,251,247,0.12)', borderRadius: 20, padding: 28 }}>
              <div style={{ color: '#FDFBF7', fontWeight: 800, fontSize: 16, marginBottom: 8 }}>Prueba sin tarjeta</div>
              <p style={{ color: 'rgba(253,251,247,0.65)', fontSize: 14, lineHeight: 1.6, margin: '0 0 16px' }}>
                Registro en minutos. Un asesor te confirma el plan de condominio, el de rentas, o los dos.
              </p>
              <Link to="/registro" style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                background: '#E85D43', color: '#fff', padding: '12px 22px', borderRadius: 999,
                fontWeight: 700, fontSize: 15, textDecoration: 'none',
              }}>
                Empezar ahora, es gratis <IconArrow />
              </Link>
            </div>
          </div>

          <div style={{ marginTop: 36, display: 'flex', gap: 24, justifyContent: 'center', flexWrap: 'wrap' }}>
            {['Sin tarjeta de crédito', 'Soporte incluido', 'Datos seguros', 'Planes por servicio'].map(t => (
              <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'rgba(253,251,247,0.6)', fontSize: 13, fontWeight: 600 }}>
                <IconCheck color="#3BB990" size={15} /> {t}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ background: '#F4EFE6', padding: '36px 20px 28px', borderTop: '1px solid #E4D9CB' }}>
        <div className="landing-footer-inner">
          <LogoFull iconSize={32} nameHeight={20} />
          <p style={{ fontSize: 13, color: '#5C5347', maxWidth: 420, margin: '4px 0 8px', lineHeight: 1.55 }}>
            Administración de condominios y gestión de rentas. Un administrador, dos servicios, cuentas claras.
          </p>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', justifyContent: 'center' }}>
            {[
              { label: 'Servicios', href: '#servicios' },
              { label: 'Beneficios', href: '#beneficios' },
              { label: 'Cómo funciona', href: '#como-funciona' },
              { label: 'Preguntas', href: '#preguntas' },
              { label: 'Contacto', href: '#contacto' },
              { label: 'Iniciar sesión', href: '/login' },
            ].map((l) => (
              <a key={l.href} href={l.href}
                style={{ fontSize: 13, color: '#3D342C', textDecoration: 'none', fontWeight: 500 }}
                onMouseEnter={e => e.currentTarget.style.color = '#175F45'}
                onMouseLeave={e => e.currentTarget.style.color = '#3D342C'}
              >{l.label}</a>
            ))}
          </div>
          <div style={{ width: '100%', height: 1, background: 'rgba(26,22,18,0.1)' }} />
          <div style={{ fontSize: 12, color: '#7A7166', fontWeight: 500 }}>
            © 2026 Homly · soporte@homly.mx
          </div>
        </div>
      </footer>

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

function Chip({ children, color, bg }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase',
      color, background: bg, padding: '3px 8px', borderRadius: 999,
    }}>{children}</span>
  );
}

function SpacePhoto({ src, alt }) {
  return (
    <div className="landing-space-art">
      <img src={src} alt={alt} className="landing-space-photo" />
      <div className="landing-space-photo-fade" aria-hidden="true" />
    </div>
  );
}

function CondoSpaceCard({ cardRef }) {
  return (
    <div ref={cardRef} className="landing-space-card landing-space-card--condo landing-space-slot landing-space-slot--condo">
      <div className="landing-space-chrome">
        <span className="landing-space-dots" aria-hidden="true"><i /><i /><i /></span>
        <span className="landing-space-chrome-title">Homly Residencial</span>
        <span className="landing-space-badge landing-space-badge--teal">Activo</span>
      </div>
      <SpacePhoto src="/img/landing-residencial.jpg" alt="Conjunto residencial" />
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

function RentasSpaceCard({ cardRef }) {
  return (
    <div ref={cardRef} className="landing-space-card landing-space-card--rentas landing-space-slot landing-space-slot--rentas">
      <div className="landing-space-chrome">
        <span className="landing-space-dots" aria-hidden="true"><i /><i /><i /></span>
        <span className="landing-space-chrome-title">Homly Inmobiliaria</span>
        <span className="landing-space-badge landing-space-badge--blue">Activo</span>
      </div>
      <SpacePhoto src="/img/landing-inmobiliaria.jpg" alt="Propiedad en renta" />
      <div className="landing-space-body">
        <div className="landing-space-kicker" style={{ color: '#1D4ED8' }}>Administración de rentas</div>
        <div className="landing-space-meta">12 propiedades · rent roll al corte</div>
        <div className="landing-space-bar-label">
          <span>Ocupación física</span>
          <span>10 / 12 · 83%</span>
        </div>
        <div className="landing-space-bar"><i style={{ width: '83%', background: '#2563EB' }} /></div>
        <div className="landing-rr-rows">
          {[
            ['C-01', 'Ana López', 'Ocupada'],
            ['C-04', '—', 'Vacante'],
            ['AB-12', 'Airbnb', 'iCal'],
          ].map(([code, tenant, st]) => (
            <div key={code} className="landing-rr-row">
              <strong>{code}</strong>
              <span>{tenant}</span>
              <em className={st === 'Vacante' ? 'is-vacant' : ''}>{st}</em>
            </div>
          ))}
        </div>
        <div className="landing-space-chips">
          <Chip color="#1D4ED8" bg="#EFF6FF">CRM</Chip>
          <Chip color="#1D4ED8" bg="#EFF6FF">Rent Roll</Chip>
          <Chip color="#9A3412" bg="#FFF5F2">Airbnb</Chip>
        </div>
      </div>
    </div>
  );
}

function ServiceCard({ badge, badgeColor, badgeBg, title, lead, points }) {
  return (
    <div style={{ ...cardStyle, padding: 28, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <span style={{
        alignSelf: 'flex-start', fontSize: 11, fontWeight: 800, letterSpacing: '0.06em',
        textTransform: 'uppercase', color: badgeColor, background: badgeBg,
        padding: '4px 10px', borderRadius: 999,
      }}>{badge}</span>
      <h3 style={{ fontSize: 22, fontWeight: 800, color: '#124A36', margin: 0, letterSpacing: '-0.4px' }}>{title}</h3>
      <p style={{ fontSize: 15, color: '#5C5347', lineHeight: 1.6, margin: 0 }}>{lead}</p>
      <ul style={{ margin: '8px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {points.map(p => (
          <li key={p} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 14, color: '#443D33', fontWeight: 600, lineHeight: 1.45 }}>
            <span style={{ marginTop: 2, flexShrink: 0 }}><IconCheck color="#1F7D5B" size={16} /></span>
            {p}
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatCard({ value, label, bg, color }) {
  return (
    <div style={{ background: bg, borderRadius: 12, padding: '14px 10px', textAlign: 'center' }}>
      <div style={{ fontSize: 22, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, fontWeight: 600, color, opacity: 0.75, marginTop: 4 }}>{label}</div>
    </div>
  );
}

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
};
