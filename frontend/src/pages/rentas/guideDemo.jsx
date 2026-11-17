import React from 'react';
import { MousePointer2 } from 'lucide-react';

/**
 * Mockup — ilustración animada de una pantalla (estilo "demo").
 * Resalta un elemento (scene.hl), muestra un cursor que hace clic y un globo con la indicación.
 * Se re-anima al cambiar la `key` del componente padre (paso distinto).
 */

function Hl({ on, caption, children, className = '', style, as: Tag = 'div' }) {
  return (
    <Tag className={`${className} ${on ? 'gd-hl' : ''}`} style={style}>
      {children}
      {on && (
        <>
          <span className="gd-cursor"><MousePointer2 size={20} fill="#1A1612" color="#fff" /></span>
          {caption && <span className="gd-callout">{caption}</span>}
        </>
      )}
    </Tag>
  );
}

function Window({ title, action, hlAction, caption, children }) {
  return (
    <div className="gd-window" aria-hidden="true">
      <div className="gd-bar">
        <span className="gd-dots"><i /><i /><i /></span>
        <span className="gd-title">{title}</span>
        {action && (
          <Hl as="span" on={hlAction} caption={caption} className="gd-btn">{action}</Hl>
        )}
      </div>
      <div className="gd-body">{children}</div>
    </div>
  );
}

const toneColor = (t) => (t === 'bad' ? 'var(--coral-600)' : t === 'warn' ? 'var(--amber-600)' : undefined);

export default function Mockup({ scene }) {
  if (!scene) return null;
  const { type, title, action, hlAction, hl, caption } = scene;
  const win = { title, action, hlAction, caption: hlAction ? caption : undefined };
  const cap = (i) => (hl === i && !hlAction ? caption : undefined);

  switch (type) {
    case 'kpis':
      return (
        <Window {...win}>
          <div className="gd-grid gd-grid-4">
            {scene.items.map((it, i) => (
              <Hl key={i} on={hl === i} caption={cap(i)} className="gd-card gd-in" style={{ animationDelay: `${i * 0.08}s` }}>
                <div className="gd-muted">{it.label}</div>
                <div className="gd-big" style={{ color: toneColor(it.tone) }}>{it.value}</div>
              </Hl>
            ))}
          </div>
        </Window>
      );
    case 'table':
      return (
        <Window {...win}>
          <div className="gd-table">
            <div className="gd-tr gd-th" style={{ gridTemplateColumns: `repeat(${scene.cols.length}, 1fr)` }}>
              {scene.cols.map(c => <span key={c}>{c}</span>)}
            </div>
            {scene.rows.map((r, i) => (
              <Hl key={i} on={hl === i && !hlAction} caption={cap(i)} className="gd-tr gd-in" style={{ gridTemplateColumns: `repeat(${scene.cols.length}, 1fr)`, animationDelay: `${i * 0.08}s` }}>
                {r.map((c, j) => <span key={j}>{c}</span>)}
              </Hl>
            ))}
          </div>
        </Window>
      );
    case 'form':
      return (
        <Window {...win} action={null}>
          <div className="gd-form">
            {scene.fields.map((f, i) => (
              <Hl key={i} on={hl === i} caption={cap(i)} className="gd-field gd-in" style={{ animationDelay: `${i * 0.08}s` }}>
                <div className="gd-muted">{f.label}</div>
                <div className="gd-input">{f.value}</div>
              </Hl>
            ))}
            {scene.action && <span className="gd-btn gd-btn-solid">{scene.action}</span>}
          </div>
        </Window>
      );
    case 'tabs':
      return (
        <Window {...win}>
          <div className="gd-tabs">
            {scene.tabs.map((t, i) => (
              <Hl as="span" key={t} on={hl === i} caption={cap(i)} className={`gd-tab ${scene.active === i ? 'on' : ''}`}>{t}</Hl>
            ))}
          </div>
          <div className="gd-lines">
            {(scene.lines || []).map((l, i) => <div key={i} className="gd-line gd-in" style={{ animationDelay: `${0.2 + i * 0.1}s` }}>{l}</div>)}
          </div>
        </Window>
      );
    case 'cards':
      return (
        <Window {...win}>
          <div className="gd-grid gd-grid-4">
            {scene.items.map((it, i) => (
              <Hl key={i} on={hl === i} caption={cap(i)} className="gd-card gd-in" style={{ animationDelay: `${i * 0.08}s` }}>
                <div style={{ fontWeight: 800, fontSize: 13 }}>{it.title}</div>
                <div className="gd-muted">{it.sub}</div>
              </Hl>
            ))}
          </div>
        </Window>
      );
    case 'kanban':
      return (
        <Window {...win}>
          <div className="gd-grid" style={{ gridTemplateColumns: `repeat(${scene.columns.length}, 1fr)` }}>
            {scene.columns.map((c, i) => (
              <Hl key={i} on={hl === i} caption={cap(i)} className="gd-col gd-in" style={{ animationDelay: `${i * 0.1}s` }}>
                <div className="gd-col-h">{c.label}</div>
                {c.cards.map(k => <div key={k} className="gd-chip-card">{k}</div>)}
              </Hl>
            ))}
          </div>
        </Window>
      );
    case 'chart': {
      const max = Math.max(...scene.bars, 1);
      return (
        <Window {...win}>
          <div className="gd-chart">
            {scene.bars.map((b, i) => (
              <Hl key={i} on={hl === i} caption={cap(i)} className="gd-barwrap">
                <div className="gd-bar-fill" style={{ height: `${(b / max) * 100}%`, animationDelay: `${i * 0.08}s` }} />
                <span className="gd-muted">{scene.labels?.[i]}</span>
              </Hl>
            ))}
          </div>
        </Window>
      );
    }
    case 'checklist':
      return (
        <Window {...win}>
          <div className="gd-lines">
            {scene.items.map((it, i) => (
              <Hl key={i} on={hl === i} caption={cap(i)} className="gd-line gd-check gd-in" style={{ animationDelay: `${i * 0.1}s` }}>
                <span className={`gd-box ${it.done ? 'on' : ''}`}>{it.done ? '✓' : ''}</span>
                {it.label}
              </Hl>
            ))}
          </div>
        </Window>
      );
    case 'flow':
      return (
        <Window {...win}>
          <div className="gd-flow">
            {scene.nodes.map((n, i) => (
              <React.Fragment key={n}>
                <Hl on={hl === i} caption={cap(i)} className={`gd-node gd-in ${i < (hl ?? 0) ? 'past' : ''}`} style={{ animationDelay: `${i * 0.12}s` }}>
                  <b>{i + 1}</b> {n}
                </Hl>
                {i < scene.nodes.length - 1 && <span className="gd-arrow">→</span>}
              </React.Fragment>
            ))}
          </div>
        </Window>
      );
    default:
      return null;
  }
}
