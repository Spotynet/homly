import React from 'react';
import { Link } from 'react-router-dom';
import {
  SiteLayout, Section, SectionHead, PillarGrid, Steps, FaqList, LockedTeaser, ContactBand,
  OtherServiceBand, IconArrow, IconCheck, cardStyle, tagStyle, btnCoralLargeStyle, btnOutlineLargeStyle,
  registroHref, demoHref, COLORS,
} from './siteKit';

/**
 * Plantilla de página de servicio. Cada servicio solo aporta sus textos (ver
 * CondominiosPage / PropiedadesPage). Respeta la política de contenido público de siteKit:
 * beneficios y nombres de módulos sí; reglas, indicadores, plazos y flujos no.
 */
export default function ServicePage({ cfg }) {
  const accent = cfg.tone === 'blue' ? COLORS.blue : '#1F7D5B';
  return (
    <SiteLayout active={cfg.active} title={cfg.seoTitle} description={cfg.seoDescription}>
      {/* Hero */}
      <section>
        <div className="landing-hero">
          <div className="landing-hero-grid">
            <div>
              <div style={tagStyle}>{cfg.tag}</div>
              <h1 style={{ fontSize: 'clamp(32px, 4.6vw, 52px)', fontWeight: 800, lineHeight: 1.12, color: COLORS.green, margin: '24px 0 20px', letterSpacing: '-1.4px' }}>
                {cfg.h1a}<br /><span style={{ color: COLORS.coral }}>{cfg.h1b}</span>
              </h1>
              <p style={{ fontSize: 18, color: COLORS.body, lineHeight: 1.7, maxWidth: 520, marginBottom: 32 }}>{cfg.lead}</p>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <Link to={registroHref(cfg.servicio)} style={btnCoralLargeStyle}>Empezar gratis <IconArrow /></Link>
                <a href={demoHref(cfg.demoSubject)} style={btnOutlineLargeStyle}>Agendar demostración</a>
              </div>
              <div className="site-hero-checks">
                {cfg.checks.map((t) => (
                  <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 6, color: COLORS.body, fontSize: 13, fontWeight: 600 }}>
                    <IconCheck color={accent} size={16} /> {t}
                  </div>
                ))}
              </div>
            </div>
            <div className="landing-hero-mockup">
              <div className="landing-mockup-glow" aria-hidden="true" />
              {cfg.card}
            </div>
          </div>
        </div>
      </section>

      {/* Antes / después */}
      <Section bg={COLORS.sand} style={{ paddingTop: 80, paddingBottom: 80 }}>
        <SectionHead tag={cfg.painTag} title={cfg.painTitle} />
        <div className="site-three">
          {cfg.pains.map((p) => (
            <div key={p.before} style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 13, color: COLORS.muted, textDecoration: 'line-through', textDecorationColor: '#D4C8B5' }}>{p.before}</div>
              <div style={{ fontSize: 17, fontWeight: 800, color: COLORS.green, lineHeight: 1.35 }}>{p.after}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* Capacidades */}
      <Section id="que-incluye">
        <SectionHead tag={cfg.pillarsTag} title={cfg.pillarsTitle} sub={cfg.pillarsSub} />
        <PillarGrid items={cfg.pillars} tone={cfg.tone} />
        {cfg.chips && (
          <div style={{ marginTop: 34, textAlign: 'center' }}>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#0F766E', marginBottom: 12 }}>{cfg.chips.label}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
              {cfg.chips.items.map((c) => (
                <span key={c} style={{ background: '#fff', border: `1px solid ${COLORS.line}`, borderRadius: 999, padding: '7px 14px', fontSize: 13, fontWeight: 700, color: '#443D33' }}>{c}</span>
              ))}
            </div>
          </div>
        )}
      </Section>

      {/* Para quién */}
      {cfg.who && (
        <Section bg={COLORS.sand} style={{ paddingTop: 80, paddingBottom: 80 }}>
          <SectionHead tag="¿Para quién es?" title={cfg.whoTitle} />
          <div className="site-four">
            {cfg.who.map((w) => (
              <div key={w.title} style={{ ...cardStyle, padding: 22 }}>
                <h3 style={{ fontSize: 16, fontWeight: 800, color: COLORS.green, margin: '0 0 10px' }}>{w.title}</h3>
                <p style={{ fontSize: 14, color: COLORS.body, lineHeight: 1.65, margin: 0 }}>{w.desc}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Equipo y perfiles */}
      {cfg.team && (
        <Section style={{ paddingTop: 80, paddingBottom: 0 }}>
          <SectionHead tag={cfg.team.tag} title={cfg.team.title} sub={cfg.team.sub} />
          <div className="site-three">
            {cfg.team.roles.map((r) => (
              <div key={r.title} style={{ ...cardStyle, padding: 22 }}>
                <h3 style={{ fontSize: 16, fontWeight: 800, color: COLORS.green, margin: '0 0 8px' }}>{r.title}</h3>
                <p style={{ fontSize: 14, color: COLORS.body, lineHeight: 1.65, margin: 0 }}>{r.desc}</p>
              </div>
            ))}
          </div>
          {cfg.team.note && (
            <p style={{ textAlign: 'center', fontSize: 13.5, color: COLORS.muted, margin: '22px auto 0', maxWidth: 640, lineHeight: 1.6 }}>{cfg.team.note}</p>
          )}
        </Section>
      )}

      {/* Lo que no se muestra aquí */}
      <Section style={{ paddingTop: 80, paddingBottom: 80 }}>
        <LockedTeaser
          tone={cfg.tone}
          title={cfg.lockedTitle}
          sub={cfg.lockedSub}
          items={cfg.lockedItems}
          demoSubject={cfg.demoSubject}
        />
      </Section>

      {/* Cómo empezar */}
      <Section bg={COLORS.sand}>
        <SectionHead tag="Cómo empezar" title={cfg.stepsTitle} />
        <Steps items={cfg.steps} />
      </Section>

      {/* FAQ */}
      <Section id="preguntas">
        <SectionHead tag="Preguntas frecuentes" title="Lo esencial antes de empezar" />
        <FaqList items={cfg.faq} />
        <div style={{ maxWidth: 960, margin: '56px auto 0' }}>
          <OtherServiceBand {...cfg.other} />
        </div>
      </Section>

      <ContactBand
        heading={cfg.ctaHeading}
        sub={cfg.ctaSub}
        servicio={cfg.servicio}
        demoSubject={cfg.demoSubject}
      />
    </SiteLayout>
  );
}
