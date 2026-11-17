import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  ArrowRight, Check, CheckCircle2, ChevronLeft, ChevronRight, ExternalLink, GraduationCap,
  Lightbulb, MapPin, Pause, Play, RotateCcw, Search, Trophy, Video,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useGuide } from '../../context/GuideContext';
import { useTenantAccess } from '../../context/TenantAccessContext';
import { GUIDE_BY_ID, GUIDE_GROUPS, RENTAL_GUIDES, toFloatingChapter } from '../../constants/rentalGuides';
import Mockup from './guideDemo';
import { PageHead } from './opsUi';

const STEP_SECONDS = 9;

/* ───────────── progreso (localStorage por usuario y espacio) ───────────── */
function useProgress(tenantId, userId) {
  const key = `homly_rguides_v1_${tenantId || 't'}_${userId || 'u'}`;
  const read = () => {
    try { return JSON.parse(localStorage.getItem(key)) || {}; } catch { return {}; }
  };
  const [data, setData] = useState(read);
  useEffect(() => { setData(read()); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = useCallback((fn) => {
    setData(prev => {
      const next = fn(prev);
      try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* sin espacio */ }
      return next;
    });
  }, [key]);

  const markViewed = (gid, idx) => update(p => {
    const cur = new Set(p.viewed?.[gid] || []);
    if (cur.has(idx)) return { ...p, last: { ...p.last, [gid]: idx } };
    cur.add(idx);
    return { ...p, viewed: { ...p.viewed, [gid]: [...cur] }, last: { ...p.last, [gid]: idx } };
  });
  const complete = (gid) => update(p => ({ ...p, done: { ...p.done, [gid]: Date.now() } }));
  const reset = () => update(() => ({}));

  return { data, markViewed, complete, reset };
}

const guideStatus = (g, data) => {
  if (data.done?.[g.id]) return 'done';
  return (data.viewed?.[g.id] || []).length > 0 ? 'doing' : 'new';
};
const guidePct = (g, data) => (data.done?.[g.id] ? 100
  : Math.round(((data.viewed?.[g.id] || []).filter(i => i < g.steps.length).length / g.steps.length) * 90));

/* ───────────── página ───────────── */
export default function RentalGuias() {
  const { tenantId, user } = useAuth();
  const { canAccessModule } = useTenantAccess();
  const [params, setParams] = useSearchParams();
  const progress = useProgress(tenantId, user?.id || user?.email);

  const guides = useMemo(
    () => RENTAL_GUIDES.filter(g => !g.module || canAccessModule(g.module)),
    [canAccessModule],
  );
  const gid = params.get('g');
  const active = gid && guides.find(g => g.id === gid);

  const openGuide = (id, step) => {
    const next = { g: id };
    if (step != null) next.s = String(step);
    setParams(next);
    window.scrollTo?.({ top: 0 });
  };
  const closeGuide = () => setParams({});

  if (active) {
    return (
      <Reader
        key={active.id} guide={active} guides={guides} progress={progress}
        startStep={params.get('s') != null ? Number(params.get('s')) : null}
        onBack={closeGuide} onOpen={openGuide}
      />
    );
  }
  return <Hub guides={guides} progress={progress} onOpen={openGuide} />;
}

/* ───────────── Hub ───────────── */
function Hub({ guides, progress, onOpen }) {
  const { data, reset } = progress;
  const [q, setQ] = useState('');
  const [group, setGroup] = useState('');

  const doneCount = guides.filter(g => data.done?.[g.id]).length;
  const pct = guides.length ? Math.round((doneCount / guides.length) * 100) : 0;
  const next = guides.find(g => !data.done?.[g.id]);
  const nextStatus = next ? guideStatus(next, data) : null;

  const filtered = guides.filter(g => {
    if (group && g.group !== group) return false;
    const t = q.trim().toLowerCase();
    return !t || `${g.title} ${g.summary}`.toLowerCase().includes(t);
  });

  return (
    <div className="content-fade">
      <PageHead
        title="Guías de uso"
        subtitle="Aprende cada módulo a tu ritmo: demos animadas, pasos prácticos, botones para probar en pantalla y un mini quiz al final."
      />

      <div className="gu-hero">
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <div className="gu-ring" style={{ '--p': pct }}><span>{pct}%</span></div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16 }}>
              {doneCount === guides.length && guides.length > 0 ? '¡Dominas Administrar Propiedades!' : `${doneCount} de ${guides.length} guías completadas`}
            </div>
            <div style={{ fontSize: 13, color: 'var(--ink-500)', marginTop: 2 }}>
              {next ? 'Cada guía toma entre 2 y 7 minutos.' : 'Puedes repasar cualquier guía cuando quieras.'}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {next && (
            <button className="btn btn-primary" onClick={() => onOpen(next.id, nextStatus === 'doing' ? (data.last?.[next.id] ?? 0) : 0)}>
              {nextStatus === 'doing' ? 'Continuar' : 'Empezar'}: {next.title} <ArrowRight size={15} />
            </button>
          )}
          {doneCount > 0 && (
            <button className="btn btn-outline btn-sm" onClick={() => { if (window.confirm('¿Reiniciar tu progreso en las guías?')) { reset(); toast.success('Progreso reiniciado'); } }}>
              <RotateCcw size={13} /> Reiniciar
            </button>
          )}
        </div>
      </div>

      <div className="gu-filters">
        <div style={{ position: 'relative', flex: '1 1 220px', maxWidth: 340 }}>
          <Search size={14} style={{ position: 'absolute', left: 11, top: 12, color: 'var(--ink-400)' }} />
          <input className="field-input" style={{ paddingLeft: 32 }} value={q} onChange={e => setQ(e.target.value)} placeholder="¿Qué quieres aprender? Ej. SLA, contratos…" />
        </div>
        <button className={`gu-pill ${!group ? 'on' : ''}`} onClick={() => setGroup('')}>Todas</button>
        {GUIDE_GROUPS.filter(gr => guides.some(g => g.group === gr.id)).map(gr => (
          <button key={gr.id} className={`gu-pill ${group === gr.id ? 'on' : ''}`} onClick={() => setGroup(gr.id)}>{gr.label}</button>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--ink-400)' }}>No encontramos guías con esa búsqueda.</div>
      )}

      {GUIDE_GROUPS.map(gr => {
        const list = filtered.filter(g => g.group === gr.id);
        if (!list.length) return null;
        return (
          <section key={gr.id}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '4px 0 10px' }}>
              <h3 style={{ margin: 0, fontSize: 15 }}>{gr.label}</h3>
              <span style={{ fontSize: 12, color: 'var(--ink-400)' }}>{gr.hint}</span>
            </div>
            <div className="gu-grid">
              {list.map(g => <GuideCard key={g.id} g={g} data={data} onOpen={() => onOpen(g.id, guideStatus(g, data) === 'doing' ? (data.last?.[g.id] ?? 0) : 0)} />)}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function GuideCard({ g, data, onOpen }) {
  const Icon = g.icon;
  const status = guideStatus(g, data);
  const pct = guidePct(g, data);
  return (
    <button className="gu-card" onClick={onOpen}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <span className="gu-icon" style={{ background: g.bg, color: g.color }}><Icon size={20} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 14.5, color: 'var(--ink-900)', lineHeight: 1.25 }}>{g.title}</div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-500)', marginTop: 4, lineHeight: 1.45 }}>{g.summary}</div>
        </div>
        {status === 'done' && <CheckCircle2 size={20} color="var(--teal-500)" style={{ flexShrink: 0 }} />}
      </div>
      <div className="gu-meta">
        <span>{g.minutes} min</span><span>·</span><span>{g.steps.length} pasos</span><span>·</span><span>{g.level}</span>
        {status === 'new' && <span style={{ marginLeft: 'auto', color: g.color }}>Nueva</span>}
        {status === 'doing' && <span style={{ marginLeft: 'auto', color: 'var(--amber-700)' }}>En curso</span>}
        {status === 'done' && <span style={{ marginLeft: 'auto', color: 'var(--teal-700)' }}>Completada</span>}
      </div>
      <div className="gu-progress"><i style={{ width: `${pct}%` }} /></div>
    </button>
  );
}

/* ───────────── Lector de guía ───────────── */
function ytEmbed(url) {
  const m = String(url || '').match(/(?:youtu\.be\/|v=|embed\/)([\w-]{11})/);
  return m ? `https://www.youtube-nocookie.com/embed/${m[1]}?autoplay=1&rel=0` : null;
}

function Reader({ guide, guides, progress, startStep, onBack, onOpen }) {
  const navigate = useNavigate();
  const { launchGuide } = useGuide();
  const { data, markViewed, complete } = progress;
  const total = guide.steps.length;
  const Icon = guide.icon;

  const [idx, setIdx] = useState(() => {
    const i = startStep != null ? startStep : (data.last?.[guide.id] ?? 0);
    return Math.max(0, Math.min(i, total));
  });
  const [playing, setPlaying] = useState(false);
  const [videoOn, setVideoOn] = useState(false);
  const [answers, setAnswers] = useState({});
  const timer = useRef(null);

  const isFinal = idx >= total;
  const step = guide.steps[idx];

  useEffect(() => { markViewed(guide.id, Math.min(idx, total - 1)); }, [idx]); // eslint-disable-line react-hooks/exhaustive-deps

  // Demo automática: avanza sola cada STEP_SECONDS
  useEffect(() => {
    clearTimeout(timer.current);
    if (!playing) return undefined;
    if (isFinal) { setPlaying(false); return undefined; }
    timer.current = setTimeout(() => setIdx(i => Math.min(i + 1, total)), STEP_SECONDS * 1000);
    return () => clearTimeout(timer.current);
  }, [playing, idx, isFinal, total]);

  const go = useCallback((i) => { setPlaying(false); setIdx(Math.max(0, Math.min(i, total))); }, [total]);

  useEffect(() => {
    const onKey = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
      if (e.key === 'ArrowRight') go(idx + 1);
      if (e.key === 'ArrowLeft') go(idx - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, idx]);

  const status = guideStatus(guide, data);
  const answered = Object.keys(answers).length;
  const correct = guide.quiz.filter((q, i) => answers[i] === q.answer).length;
  const nextGuide = guides[guides.findIndex(g => g.id === guide.id) + 1];
  const embed = guide.video?.url ? ytEmbed(guide.video.url) : null;

  const tryIt = () => {
    setPlaying(false);
    navigate(`${step.route}${step.search || ''}`);
  };
  const floatIt = () => {
    setPlaying(false);
    launchGuide(toFloatingChapter(guide, idx));
    toast.success('Guía en pantalla: puedes arrastrarla mientras practicas', { icon: '🧭' });
  };
  const finish = () => {
    complete(guide.id);
    toast.success('¡Guía completada!');
  };

  return (
    <div className="content-fade">
      <button className="btn btn-outline btn-sm" onClick={onBack} style={{ marginBottom: 12 }}><ChevronLeft size={14} /> Todas las guías</button>

      <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <span className="gu-icon" style={{ background: guide.bg, color: guide.color, width: 50, height: 50, borderRadius: 14 }}><Icon size={24} /></span>
        <div style={{ flex: 1, minWidth: 220 }}>
          <h2 style={{ margin: 0, fontSize: 22 }}>{guide.title}</h2>
          <div className="gu-meta" style={{ marginTop: 4 }}>
            <span>{guide.minutes} min</span><span>·</span><span>{total} pasos</span><span>·</span><span>{guide.level}</span>
            {status === 'done' && <span style={{ color: 'var(--teal-700)' }}>· Completada ✓</span>}
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => { setIdx(0); setPlaying(true); }}>
          <Play size={14} /> Ver demo automática
        </button>
      </div>

      {idx === 0 && !playing && (
        <div className="card" style={{ padding: '14px 18px', marginBottom: 16 }}>
          <div style={{ fontSize: 13.5, color: 'var(--ink-600)', marginBottom: 8 }}>{guide.summary}</div>
          <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--ink-400)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Qué aprenderás</div>
          <div style={{ display: 'grid', gap: 5 }}>
            {guide.learn.map(l => (
              <div key={l} style={{ display: 'flex', gap: 8, fontSize: 13.5 }}><Check size={15} color="var(--teal-500)" style={{ flexShrink: 0, marginTop: 2 }} />{l}</div>
            ))}
          </div>
        </div>
      )}

      {embed && (
        <div className="gu-video">
          {videoOn ? (
            <iframe src={embed} title={guide.video.title || guide.title} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen />
          ) : (
            <button onClick={() => setVideoOn(true)} style={{ background: `linear-gradient(135deg, ${guide.color}, #111)`, color: '#fff', cursor: 'pointer', fontSize: 15, fontWeight: 800, display: 'grid', placeItems: 'center' }}>
              <span style={{ display: 'grid', gap: 8, placeItems: 'center' }}><Video size={34} />{guide.video.title || 'Ver video'}</span>
            </button>
          )}
        </div>
      )}

      <div className="gu-reader">
        <nav className="gu-outline" aria-label="Pasos de la guía">
          {guide.steps.map((s, i) => {
            const seen = (data.viewed?.[guide.id] || []).includes(i) && i < idx;
            return (
              <button key={s.title} className={idx === i ? 'on' : ''} onClick={() => go(i)}>
                <span className={`gu-dot ${seen || data.done?.[guide.id] ? 'done' : ''}`}>{seen || data.done?.[guide.id] ? <Check size={12} /> : i + 1}</span>
                <span className="gu-lbl">{s.title}</span>
              </button>
            );
          })}
          <button className={isFinal ? 'on' : ''} onClick={() => go(total)}>
            <span className={`gu-dot ${data.done?.[guide.id] ? 'done' : ''}`}>{data.done?.[guide.id] ? <Check size={12} /> : <Trophy size={11} />}</span>
            <span className="gu-lbl">Ponte a prueba</span>
          </button>
        </nav>

        <div>
          {/* Controles tipo reproductor */}
          <div className="gu-player">
            <button className="btn btn-outline btn-sm" onClick={() => go(idx - 1)} disabled={idx === 0} aria-label="Paso anterior"><ChevronLeft size={14} /></button>
            <button className="btn btn-outline btn-sm" onClick={() => (isFinal ? go(0) : setPlaying(p => !p))} aria-label={playing ? 'Pausar' : 'Reproducir'}>
              {isFinal ? <RotateCcw size={14} /> : playing ? <Pause size={14} /> : <Play size={14} />}
              {isFinal ? 'Repetir' : playing ? 'Pausar' : 'Reproducir'}
            </button>
            <button className="btn btn-outline btn-sm" onClick={() => go(idx + 1)} disabled={isFinal} aria-label="Paso siguiente"><ChevronRight size={14} /></button>
            <div className={`gu-timeline ${playing ? 'run' : ''}`} style={{ '--dur': `${STEP_SECONDS}s` }}>
              <i key={`${idx}-${playing}`} style={playing ? undefined : { width: `${(Math.min(idx, total) / total) * 100}%`, animation: 'none' }} />
            </div>
            <span style={{ fontSize: 12, color: 'var(--ink-400)', fontWeight: 700 }}>{isFinal ? 'Final' : `${idx + 1}/${total}`}</span>
          </div>

          {!isFinal ? (
            <div className="gu-step" key={idx}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.07em', color: guide.color, textTransform: 'uppercase' }}>Paso {idx + 1} de {total}</div>
              <h3 style={{ margin: '4px 0 14px', fontSize: 19 }}>{step.title}</h3>

              <Mockup key={`${guide.id}-${idx}`} scene={step.scene} />

              <p style={{ fontSize: 14.5, lineHeight: 1.7, color: 'var(--ink-700)', margin: 0 }}>{step.body}</p>
              {(step.tips || []).map(t => (
                <div key={t} className="gu-tip"><Lightbulb size={15} color="var(--amber-600)" style={{ flexShrink: 0, marginTop: 2 }} />{t}</div>
              ))}

              <div className="gu-actions">
                {step.route && (
                  <button className="btn btn-primary" onClick={tryIt}><ExternalLink size={14} /> {step.cta || 'Hazlo ahora'}</button>
                )}
                {step.route && (
                  <button className="btn btn-outline" onClick={floatIt}><MapPin size={14} /> Guiarme en pantalla</button>
                )}
                <span style={{ flex: 1 }} />
                <button className="btn btn-outline" onClick={() => go(idx + 1)}>
                  {idx === total - 1 ? 'Ir al quiz' : 'Siguiente'} <ChevronRight size={14} />
                </button>
              </div>
            </div>
          ) : (
            <div className="gu-step">
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 6 }}>
                <GraduationCap size={22} color={guide.color} />
                <h3 style={{ margin: 0, fontSize: 19 }}>Ponte a prueba</h3>
              </div>
              <p style={{ margin: '0 0 8px', fontSize: 13.5, color: 'var(--ink-500)' }}>Responde para reforzar lo aprendido. No hay penalización: puedes volver a intentarlo.</p>

              {guide.quiz.map((q, qi) => (
                <div key={q.q} style={{ margin: '16px 0' }}>
                  <div style={{ fontWeight: 800, fontSize: 14 }}>{qi + 1}. {q.q}</div>
                  {q.options.map((o, oi) => {
                    const picked = answers[qi] === oi;
                    const show = answers[qi] != null;
                    const cls = show ? (oi === q.answer ? 'ok' : picked ? 'bad' : '') : '';
                    return (
                      <button key={o} className={`gu-quiz-opt ${cls}`} disabled={show && answers[qi] === q.answer}
                        onClick={() => setAnswers(a => ({ ...a, [qi]: oi }))}>{o}</button>
                    );
                  })}
                  {answers[qi] != null && (
                    <div style={{ fontSize: 12.5, marginTop: 6, color: answers[qi] === q.answer ? 'var(--teal-700)' : 'var(--coral-600)' }}>
                      {answers[qi] === q.answer ? `¡Correcto! ${q.why}` : 'Casi. Intenta con otra opción.'}
                    </div>
                  )}
                </div>
              ))}

              {guide.faq.length > 0 && (
                <div style={{ marginTop: 18 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--ink-400)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Preguntas frecuentes</div>
                  {guide.faq.map(f => (
                    <details key={f.q} style={{ borderTop: '1px solid var(--sand-100)', padding: '8px 0' }}>
                      <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: 13.5 }}>{f.q}</summary>
                      <div style={{ fontSize: 13.5, color: 'var(--ink-600)', lineHeight: 1.6, marginTop: 6 }}>{f.a}</div>
                    </details>
                  ))}
                </div>
              )}

              <div className="gu-actions" style={{ borderTop: '1px solid var(--sand-100)', paddingTop: 14 }}>
                {status === 'done' ? (
                  <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', color: 'var(--teal-700)', fontWeight: 800 }}>
                    <Trophy size={16} /> Guía completada
                  </span>
                ) : (
                  <button className="btn btn-primary" onClick={finish}>
                    <Trophy size={14} /> Finalizar guía{answered ? ` · ${correct}/${guide.quiz.length}` : ''}
                  </button>
                )}
                <span style={{ flex: 1 }} />
                {nextGuide && (
                  <button className="btn btn-outline" onClick={() => onOpen(nextGuide.id, 0)}>Siguiente guía: {nextGuide.title} <ArrowRight size={14} /></button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export { GUIDE_BY_ID };
