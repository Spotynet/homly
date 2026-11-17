import React, { useState, useLayoutEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Repeat, Building2, Home as HomeIcon, Star } from 'lucide-react';
import { HomlyIsotipo } from '../utils/helpers';
import {
  SiteLayout, Section, SectionHead, Steps, FaqList, ContactBand, IconArrow, IconCheck, IconBox,
  cardStyle, tagStyle, btnCoralLargeStyle, btnOutlineLargeStyle, COLORS,
} from './site/siteKit';
import { CondoSpaceCard, RentasSpaceCard } from './site/spaceCards';

/* ═══════════════════════════════════════════════════════════════════════════
   INICIO — solo una muestra de lo que es Homly. Sin detalle de módulos:
   el detalle vive en /condominios y /propiedades (y parte, solo en la demo).
   ═══════════════════════════════════════════════════════════════════════════ */

const FAQ = [
  { q: '¿Qué es Homly?', a: 'Es una plataforma para administrar condominios y propiedades desde un solo acceso. Tiene dos servicios independientes: Homly Residencial, para condominios, y Homly Propiedades, para inmuebles en renta y su operación.' },
  { q: '¿Un mismo usuario puede tener las dos licencias?', a: 'Sí. Entras con un solo usuario y, según lo que hayas contratado, ves tus espacios y cambias entre ellos en un clic. Cada licencia tiene su propio plan, su membresía y su equipo.' },
  { q: '¿Se mezclan los datos o el dinero de los dos servicios?', a: 'No. Cada espacio es independiente: sus cuentas, recibos, reportes y permisos van por separado. Quien trabaja en uno no ve lo del otro.' },
  { q: '¿Tengo que contratar los dos servicios?', a: 'No. Puedes empezar con el que necesitas hoy y activar el otro cuando lo requieras, sin migrar nada. También puedes llevar varios condominios o varios portafolios en la misma cuenta.' },
  { q: '¿Cómo empiezo y cuánto cuesta?', a: 'Haces tu registro, hay una prueba sin tarjeta y un asesor te asigna el plan de cada servicio según tu tamaño. Cada licencia se cotiza por separado.' },
];

const TESTIMONIALS = [
  { quote: 'Antes perdíamos horas en Excel. Ahora el condominio se administra con cuentas claras y los vecinos ven su estado de cuenta solos.', name: 'María Fernanda G.', role: 'Presidenta de Mesa Directiva', place: 'Condominio · CDMX' },
  { quote: 'Rento 11 departamentos. En Homly tengo contratos, vigencias, cobro de renta y el mantenimiento de cada inmueble, sin mezclarlo con el condominio que también administro.', name: 'Elena Ruiz', role: 'Administradora e inmobiliaria', place: 'Ambos servicios · Guadalajara' },
  { quote: 'Administro 4 condominios y ahora también un edificio en renta. Una cuenta, varios espacios. Me ahorra el doble de sistemas.', name: 'Lucía Vargas', role: 'Directora · LV Administraciones', place: 'Portafolio mixto' },
];

const WHO = [
  { title: 'Mesa directiva o comité', desc: 'Cuentas claras y cobranza al día, con vecinos que consultan su estado de cuenta sin preguntar.' },
  { title: 'Administradora profesional', desc: 'Varios condominios, cada uno por separado, y el que toca a un clic de distancia.' },
  { title: 'Inmobiliaria o gestor', desc: 'Contratos, cobro y mantenimiento de cada inmueble, sin Excel y sin mezclarlo con un condominio.' },
  { title: 'Quien hace las dos cosas', desc: 'Un login, dos licencias. El condominio y el portafolio, bajo control desde el mismo lugar.' },
];

export default function Landing() {
  return (
    <SiteLayout
      active="home"
      title="Homly — Un acceso, dos licencias: condominios y propiedades"
      description="Con un solo usuario administras condominios (Homly Residencial) y propiedades en renta (Homly Propiedades). Dos licencias independientes, cuentas separadas y un solo lugar para controlar todo. Prueba sin tarjeta."
    >
      <Hero />

      <section className="landing-stats-bar">
        <div className="landing-stats-grid">
          {[
            { num: '1 usuario', label: 'Para entrar a todo' },
            { num: '2 licencias', label: 'Condominios y propiedades' },
            { num: 'Cuentas aparte', label: 'Sin mezclar el dinero' },
            { num: '2 países', label: 'México y Colombia' },
          ].map((s) => (
            <div key={s.num}>
              <div style={{ fontSize: 28, fontWeight: 800, color: COLORS.coral, letterSpacing: '-0.5px', lineHeight: 1.15 }}>{s.num}</div>
              <div style={{ fontSize: 13, color: 'rgba(253,251,247,0.7)', marginTop: 6, fontWeight: 500 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Un usuario, dos licencias ── */}
      <Section id="cuenta">
        <SectionHead
          tag="Así funciona tu cuenta"
          title={<>Entras una vez.<br />Controlas todo.</>}
          sub="Homly se diseñó para quien administra más de una cosa. Una sola identidad, licencias independientes y todo en el mismo sitio."
        />
        <div className="site-split">
          <div style={{ display: 'grid', gap: 22 }}>
            {[
              { n: '1', t: 'Un solo usuario', d: 'Un correo y una contraseña para todo lo que administras. Nada de cuentas duplicadas ni sistemas distintos.' },
              { n: '2', t: 'Dos licencias independientes', d: 'Homly Residencial para condominios y Homly Propiedades para inmuebles. Cada una con su plan, su membresía y su equipo.' },
              { n: '3', t: 'Cada cosa en su lugar', d: 'La cuota del condominio no se mezcla con la renta del inquilino. Cada espacio guarda su dinero, sus recibos y su historial.' },
              { n: '4', t: 'Creces cuando tú decidas', d: 'Empieza con una licencia y activa la otra cuando la necesites. Varios condominios o varios portafolios caben en la misma cuenta.' },
            ].map((p) => (
              <div key={p.n} style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                <div style={{ width: 34, height: 34, borderRadius: 11, background: COLORS.green, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 15, flexShrink: 0 }}>{p.n}</div>
                <div>
                  <h3 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 800, color: COLORS.green }}>{p.t}</h3>
                  <p style={{ margin: 0, fontSize: 14.5, color: COLORS.body, lineHeight: 1.7 }}>{p.d}</p>
                </div>
              </div>
            ))}
            <p style={{ margin: '4px 0 0', fontSize: 14, color: COLORS.muted, lineHeight: 1.7, paddingLeft: 50 }}>
              ¿Solo condominios o solo propiedades? Contratas únicamente la licencia que necesitas.
            </p>
          </div>
          <AccountDiagram />
        </div>
      </Section>

      {/* ── Los dos servicios (solo muestra) ── */}
      <Section id="servicios" bg={COLORS.sand}>
        <SectionHead
          tag="Los dos servicios"
          title="Dos licencias, cada una a su medida"
          sub="Conoce cada servicio en su propia página: qué resuelve, para quién es y cómo se ve."
        />
        <div className="site-two">
          <ServiceTeaser
            to="/condominios" photo="/img/landing-residencial.jpg" photoPos="center 35%"
            tag="Homly Residencial" accent="#1F7D5B" tone="green" icon={Building2}
            title="Administración de condominios"
            lead="Para mesas directivas, comités y administradoras de propiedad horizontal."
            points={['Cuotas y estado de cuenta por unidad', 'Comunidad, asambleas y operación diaria', 'Transparencia para la mesa directiva y los vecinos']}
            cta="Conocer Homly Residencial"
          />
          <ServiceTeaser
            to="/propiedades" photo="/img/landing-prop-nave.jpg" photoPos="center 62%"
            tag="Homly Propiedades" accent={COLORS.blue} tone="blue" icon={HomeIcon}
            title="Administrar propiedades"
            lead="Para inmobiliarias, gestores y operadores de inmuebles residenciales, comerciales e industriales."
            points={['Contratos, cobranza y mapa del portafolio', 'Mantenimiento y operación de cada inmueble', 'Perfiles de acceso para todo tu equipo']}
            cta="Conocer Homly Propiedades"
          />
        </div>
      </Section>

      {/* ── Cómo empezar ── */}
      <Section id="como-funciona">
        <SectionHead tag="Cómo empezar" title="Empiezas con uno. El otro se suma cuando quieras." />
        <Steps items={[
          { title: 'Pide tu acceso', desc: 'Llenas el registro. Un asesor te contacta. No pedimos tarjeta para empezar la prueba.' },
          { title: 'Abre tu primer espacio', desc: 'Condominio o propiedades: eliges el que necesitas hoy, y te ayudamos a dejarlo listo.' },
          { title: 'Suma el segundo cuando quieras', desc: 'Se abre otra licencia en la misma cuenta, con su propio plan. Sin cambiar de usuario.' },
        ]} />
      </Section>

      {/* ── Para quién ── */}
      <Section bg={COLORS.sand} style={{ paddingTop: 80, paddingBottom: 80 }}>
        <SectionHead tag="¿Para quién es?" title="Si administras inmuebles, Homly te ahorra el caos" />
        <div className="site-four">
          {WHO.map((w) => (
            <div key={w.title} style={{ ...cardStyle, padding: 22 }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, color: COLORS.green, margin: '0 0 10px' }}>{w.title}</h3>
              <p style={{ fontSize: 14, color: COLORS.body, lineHeight: 1.65, margin: 0 }}>{w.desc}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ── Testimonios ── */}
      <Section>
        <SectionHead tag="Quienes ya lo usan" title="Condominios, propiedades y quienes llevan ambos" />
        <div className="site-three">
          {TESTIMONIALS.map((t) => (
            <div key={t.name} style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', gap: 3 }}>
                {[...Array(5)].map((_, s) => <Star key={s} size={14} color={COLORS.coral} fill={COLORS.coral} />)}
              </div>
              <p style={{ fontSize: 14, color: '#443D33', lineHeight: 1.7, fontStyle: 'italic', margin: 0 }}>“{t.quote}”</p>
              <div style={{ marginTop: 'auto', paddingTop: 12, borderTop: '1px solid #F3EDE4' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.ink }}>{t.name}</div>
                <div style={{ fontSize: 12, color: '#9E9588', marginTop: 2 }}>{t.role}</div>
                <div style={{ fontSize: 12, color: '#B3A99C', marginTop: 1 }}>{t.place}</div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ── FAQ ── */}
      <Section id="preguntas" bg={COLORS.sand}>
        <SectionHead tag="Preguntas frecuentes" title="Lo esencial antes de empezar" />
        <FaqList items={FAQ} />
      </Section>

      <ContactBand
        heading={<>¿Listo para ordenar condominios,<br />propiedades, o ambos?</>}
        sub="Cuéntanos qué administras. Te armamos el espacio correcto —o los dos— y te acompañamos en la prueba."
        servicio="ambos"
        demoSubject="Quiero una demostración de Homly"
      />
    </SiteLayout>
  );
}

/* ─────────────────────────────  HERO  ───────────────────────────── */

function Hero() {
  const [rentasOnTop, setRentasOnTop] = useState(false);
  const condoRef = useRef(null);
  const rentasRef = useRef(null);
  const swappingRef = useRef(false);
  const pendingFlip = useRef(null);

  const swapSpaces = () => {
    if (swappingRef.current) return;
    const condo = condoRef.current;
    const rentas = rentasRef.current;
    if (!condo || !rentas) return;
    swappingRef.current = true;
    pendingFlip.current = { condoTop: condo.getBoundingClientRect().top, rentasTop: rentas.getBoundingClientRect().top };
    setRentasOnTop((v) => !v);
  };

  useLayoutEffect(() => {
    const flip = pendingFlip.current;
    if (!flip) return;
    pendingFlip.current = null;
    const condo = condoRef.current;
    const rentas = rentasRef.current;
    if (!condo || !rentas || !condo.animate) { swappingRef.current = false; return; }
    const opts = { duration: 640, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' };
    condo.animate([{ transform: `translateY(${flip.condoTop - condo.getBoundingClientRect().top}px)` }, { transform: 'none' }], opts);
    const anim = rentas.animate([{ transform: `translateY(${flip.rentasTop - rentas.getBoundingClientRect().top}px)` }, { transform: 'none' }], opts);
    const done = () => { swappingRef.current = false; };
    anim.onfinish = done;
    anim.oncancel = done;
  }, [rentasOnTop]);

  return (
    <section>
      <div className="landing-hero">
        <div className="landing-hero-grid">
          <div>
            <div style={tagStyle}>✦ Condominios y propiedades · Un solo acceso</div>
            <h1 style={{ fontSize: 'clamp(34px, 5vw, 56px)', fontWeight: 800, lineHeight: 1.12, color: COLORS.green, margin: '24px 0 20px', letterSpacing: '-1.5px' }}>
              Un usuario,<br />dos licencias,<br />
              <span style={{ color: COLORS.coral }}>todo bajo control.</span>
            </h1>
            <p style={{ fontSize: 18, color: COLORS.body, lineHeight: 1.7, maxWidth: 500, marginBottom: 36 }}>
              Con una sola cuenta de Homly administras condominios y propiedades en renta.
              Cada servicio tiene su propia licencia y se mantiene separado; tú los controlas
              desde el mismo lugar y cambias de uno a otro en un clic.
            </p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
              <Link to="/registro" style={btnCoralLargeStyle}>Empezar gratis <IconArrow /></Link>
              <a href="#servicios" style={btnOutlineLargeStyle}>Ver los dos servicios</a>
            </div>
            <div className="site-hero-checks">
              {['Un solo login', 'Cuentas y planes separados', 'Sin tarjeta para probar'].map((t) => (
                <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 6, color: COLORS.body, fontSize: 13, fontWeight: 600 }}>
                  <IconCheck color="#1F7D5B" size={16} /> {t}
                </div>
              ))}
            </div>
          </div>

          <div className={`landing-hero-mockup${rentasOnTop ? ' is-rentas-first' : ''}`}>
            <div className="landing-mockup-glow" aria-hidden="true" />
            <CondoSpaceCard cardRef={condoRef} slot />
            <div className="landing-space-switch">
              <div className="landing-space-switch-line" aria-hidden="true" />
              <button
                type="button"
                className={`landing-space-switch-pill${rentasOnTop ? ' is-flipped' : ''}`}
                onClick={swapSpaces}
                aria-label="Cambiar el orden de Homly Residencial y Homly Propiedades"
              >
                <Repeat size={26} color={COLORS.coral} strokeWidth={2} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: COLORS.ink }}>Cambia de espacio</div>
                  <div style={{ fontSize: 11, color: '#9E9588' }}>
                    {rentasOnTop ? 'Propiedades arriba · Residencial abajo' : 'Residencial arriba · Propiedades abajo'}
                  </div>
                </div>
              </button>
            </div>
            <RentasSpaceCard cardRef={rentasRef} slot />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ───────────────  Diagrama: un usuario → dos licencias  ─────────────── */

function AccountDiagram() {
  const lic = (cls, name, sub, accent, items) => (
    <div className={`site-license ${cls}`}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: accent }}>Licencia</div>
      <div style={{ fontSize: 16, fontWeight: 800, color: COLORS.green, marginTop: 2 }}>{name}</div>
      <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 2 }}>{sub}</div>
      <ul>
        {items.map((t) => <li key={t}><IconCheck color={accent} size={14} /> {t}</li>)}
      </ul>
    </div>
  );
  return (
    <div className="site-account" aria-label="Un usuario con dos licencias">
      <div className="site-account-user">
        <div className="site-account-avatar"><HomlyIsotipo size={22} style={{ filter: 'brightness(0) invert(1)' }} /></div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: COLORS.ink }}>Tu usuario Homly</div>
          <div style={{ fontSize: 11, color: COLORS.muted }}>Un solo acceso</div>
        </div>
      </div>
      <svg className="site-account-lines" viewBox="0 0 520 46" preserveAspectRatio="none" aria-hidden="true">
        <path d="M260 0 V16 H130 V46" fill="none" stroke="#D4C8B5" strokeWidth="2.5" strokeDasharray="5 5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M260 0 V16 H390 V46" fill="none" stroke="#D4C8B5" strokeWidth="2.5" strokeDasharray="5 5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="site-account-grid">
        {lic('site-license--condo', 'Homly Residencial', 'Condominios', '#1F7D5B', ['Plan propio', 'Equipo propio', 'Cobranza propia'])}
        {lic('site-license--rentas', 'Homly Propiedades', 'Inmuebles y operación', COLORS.blue, ['Plan propio', 'Equipo propio', 'Cobranza propia'])}
      </div>
      <div className="site-account-switch"><Repeat size={15} strokeWidth={2.5} /> Cambias de licencia en un clic</div>
    </div>
  );
}

/* ───────────────  Tarjeta de servicio (solo muestra)  ─────────────── */

function ServiceTeaser({ to, photo, photoPos, tag, accent, tone, icon, title, lead, points, cta }) {
  return (
    <Link to={to} className="site-svc" style={{ textDecoration: 'none', color: 'inherit' }}>
      <div className="site-svc-photo">
        <img src={photo} alt="" loading="lazy" style={{ objectPosition: photoPos }} />
        <span className="site-svc-tag">{tag}</span>
      </div>
      <div className="site-svc-body">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <IconBox icon={icon} tone={tone} size={22} />
          <h3 style={{ margin: 0, fontSize: 21, fontWeight: 800, color: COLORS.green, letterSpacing: '-0.4px' }}>{title}</h3>
        </div>
        <p style={{ margin: 0, fontSize: 15, color: COLORS.body, lineHeight: 1.65 }}>{lead}</p>
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 9 }}>
          {points.map((p) => (
            <li key={p} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 14, color: '#443D33', fontWeight: 600, lineHeight: 1.45 }}>
              <span style={{ marginTop: 2, flexShrink: 0 }}><IconCheck color={accent} size={16} /></span>{p}
            </li>
          ))}
        </ul>
        <span style={{ marginTop: 'auto', paddingTop: 6, display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: 15, color: accent }}>
          {cta} <IconArrow />
        </span>
      </div>
    </Link>
  );
}
