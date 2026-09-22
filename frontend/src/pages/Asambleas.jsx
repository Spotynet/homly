import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/AuthContext';
import { asambleasAPI, api } from '../api/client';
import toast from 'react-hot-toast';
import {
  Plus, Vote, X, Pencil, Trash2, Send, Check, Users, FileText,
  Landmark, Download, Upload, Printer, Scale, Gavel,
  Link2, ChevronUp, ChevronDown, CircleHelp, Eye,
} from 'lucide-react';

const TABS = [
  ['convocatorias', '1. Convocatoria'],
  ['desarrollo', '2. Desarrollo'],
  ['conclusiones', '3. Conclusiones'],
  ['historial', 'Historial'],
];
const TAB_HELP = {
  convocatorias: 'Paso 1. Prepara la asamblea: fecha, lugar, orden del día y decide qué puntos se votan. Luego emite la convocatoria.',
  desarrollo: 'Paso 2. El día de la reunión: toma asistencia, instala con quórum y desahoga cada punto. Solo se votan los que marcaste para votación.',
  conclusiones: 'Paso 3. Cierra la asamblea: la minuta es el registro interno de trabajo; el acta es el documento formal para firma y protocolización.',
  historial: 'Consulta asambleas ya cerradas o canceladas, con su convocatoria, minuta, acta y expediente.',
};

const STATUS = {
  borrador: { label: 'Borrador', color: 'var(--ink-500)', bg: 'var(--sand-50)' },
  convocada: { label: 'Convocada', color: 'var(--blue-700)', bg: 'var(--blue-50)' },
  en_curso: { label: 'En curso', color: 'var(--teal-700)', bg: 'var(--teal-50)' },
  cerrada: { label: 'Cerrada', color: 'var(--ink-600)', bg: 'var(--sand-50)' },
  cancelada: { label: 'Cancelada', color: 'var(--coral-600)', bg: 'var(--coral-50)' },
};

const KIND = { ordinaria: 'Ordinaria', extraordinaria: 'Extraordinaria' };
const VOTE = {
  informativo: 'Informativo',
  simple: 'Mayoría simple',
  calificada: 'Mayoría calificada',
  unanimidad: 'Unanimidad',
};
const RESULT = {
  pendiente: 'Pendiente',
  aprobado: 'Aprobado',
  rechazado: 'Rechazado',
  diferido: 'Diferido',
};
const SOURCE = {
  manual: 'Manual',
  presupuesto: 'Presupuesto',
  proyecto: 'Proyecto',
  cierre: 'Cierre',
  cuota: 'Cuota',
  organizacion: 'Organización',
};
const APPLY = {
  pendiente: 'Pendiente de aplicar',
  aplicado: 'Aplicado en el módulo',
  omitido: 'Solo constancia en acta',
  error: 'No se pudo aplicar',
};
const BUDGET_ST = {
  borrador: 'Borrador',
  guardado: 'Guardado',
  en_aprobacion: 'En aprobación',
  aprobado: 'Aprobado',
  archivado: 'Archivado',
};
const PROJECT_ST = {
  idea: 'Idea',
  en_aprobacion: 'En aprobación',
  aprobado: 'Aprobado',
  en_curso: 'En curso',
  pausado: 'Pausado',
  concluido: 'Concluido',
  cancelado: 'Cancelado',
};

const FILE_KINDS = {
  convocatoria: 'Convocatoria',
  poder: 'Carta poder',
  lista: 'Lista de asistencia',
  minuta: 'Minuta de trabajo',
  acta: 'Acta de asamblea',
  evidencia: 'Evidencia de notificación',
  otro: 'Otro',
};

const TAB_STATUSES = {
  convocatorias: ['borrador', 'convocada'],
  desarrollo: ['convocada', 'en_curso'],
  conclusiones: ['en_curso', 'cerrada'],
  historial: ['cerrada', 'cancelada'],
};

function needsVote(item) {
  return item?.vote_type && item.vote_type !== 'informativo';
}

function errMsg(e, fallback) {
  const d = e?.response?.data?.detail;
  if (typeof d === 'string') return d;
  return fallback;
}

function Pill({ map, value }) {
  const m = map[value] || { label: value, color: 'var(--ink-500)', bg: 'var(--sand-50)' };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 99,
      fontSize: 11, fontWeight: 700, color: m.color, background: m.bg,
    }}>{m.label}</span>
  );
}

function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 16);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtWhen(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
}

async function downloadProtected(url, name) {
  const res = await api.get(url, { responseType: 'blob' });
  const blobUrl = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = name || 'archivo';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);
}

function money(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '';
  return v.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
}

function SourceChip({ kind, label }) {
  if (!kind || kind === 'manual') {
    return <span className="asm-source-chip manual">Manual</span>;
  }
  return (
    <span className={`asm-source-chip ${kind}`}>
      {SOURCE[kind] || kind}{label ? ` · ${label}` : ''}
    </span>
  );
}

function alreadyLinked(agenda, kind, id) {
  return (agenda || []).some(i => i.source_kind === kind && String(i.source_id || '') === String(id));
}

function catalogToItem(kind, row) {
  if (kind === 'presupuesto') {
    return {
      title: `Aprobación del presupuesto: ${row.name} (${row.year})`,
      description: `Escenario ${BUDGET_ST[row.status] || row.status}. Ingresos ${money(row.income) || '—'} · Gastos ${money(row.expense) || '—'}.`,
      vote_type: 'calificada',
      source_kind: 'presupuesto',
      source_id: row.id,
      source_label: row.name,
      apply_on_approve: true,
    };
  }
  if (kind === 'proyecto') {
    return {
      title: `Aprobación del proyecto: ${row.name}`,
      description: [
        PROJECT_ST[row.status] || row.status,
        row.budget_amount ? `Monto ${money(row.budget_amount)}` : '',
        row.winner_supplier_name ? `Ganador ${row.winner_supplier_name}` : '',
      ].filter(Boolean).join(' · '),
      vote_type: 'calificada',
      source_kind: 'proyecto',
      source_id: row.id,
      source_label: row.name,
      apply_on_approve: true,
    };
  }
  if (kind === 'cierre') {
    return {
      title: `Informe y ratificación del cierre ${row.period}`,
      description: 'Constancia en el acta. No modifica el cierre ya aplicado.',
      vote_type: 'simple',
      source_kind: 'cierre',
      source_id: row.id,
      source_label: `Cierre ${row.period}`,
      apply_on_approve: false,
    };
  }
  if (kind === 'cuota') {
    return {
      title: `Revisión de cuota: ${row.label}`,
      description: row.default_amount ? `Monto de referencia ${money(row.default_amount)}` : '',
      vote_type: 'calificada',
      source_kind: 'cuota',
      source_id: row.id,
      source_label: row.label,
      apply_on_approve: false,
    };
  }
  if (kind === 'organizacion') {
    const title = row.title || row.name;
    const extra = row.holder_name || row.committee || row.members || '';
    return {
      title: row.title ? `Ratificación de cargo: ${row.title}` : `Comité: ${row.name}`,
      description: extra,
      vote_type: 'simple',
      source_kind: 'organizacion',
      source_id: row.id,
      source_label: title,
      apply_on_approve: false,
    };
  }
  return null;
}

function MeetingSourcePicker({ catalog, agenda, onAdd }) {
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState('presupuesto');
  const cat = catalog || {};
  const rows = section === 'proyecto' ? (cat.projects || []) : (cat.budgets || []);
  return (
    <div className="asm-meet-add">
      <button type="button" className="btn btn-outline btn-sm" onClick={() => setOpen(o => !o)}>
        <Plus size={12} /> Incluir presupuesto o proyecto
      </button>
      {open && (
        <div className="asm-catalog" style={{ marginTop: 8 }}>
          <div className="asm-catalog-tabs">
            {[['presupuesto', 'Presupuestos'], ['proyecto', 'Proyectos']].map(([k, l]) => (
              <button key={k} type="button" className={`asm-catalog-tab${section === k ? ' on' : ''}`} onClick={() => setSection(k)}>{l}</button>
            ))}
          </div>
          <div className="asm-catalog-body">
            {rows.length === 0 ? (
              <p>No hay {section === 'proyecto' ? 'proyectos' : 'presupuestos'} disponibles en Planeación.</p>
            ) : rows.map(row => {
              const added = alreadyLinked(agenda, section, row.id);
              return (
                <div key={row.id} className="asm-catalog-row">
                  <div>
                    <strong>{row.name}</strong>
                    <div>
                      {section === 'presupuesto'
                        ? `${row.year} · ${BUDGET_ST[row.status] || row.status}`
                        : `${PROJECT_ST[row.status] || row.status}${row.budget_amount ? ` · ${money(row.budget_amount)}` : ''}`}
                    </div>
                  </div>
                  <button type="button" className="btn btn-outline btn-sm" disabled={added} onClick={() => onAdd(section, row)}>
                    {added ? 'Ya está' : 'Incluir y votar'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function AgendaBuilder({ agenda, catalog, canWrite, onChange, rules }) {
  const [picker, setPicker] = useState(false);
  const [section, setSection] = useState('presupuesto');
  const [help, setHelp] = useState(false);
  const cat = catalog || {};
  const update = (i, patch) => onChange(agenda.map((item, j) => (j === i ? { ...item, ...patch } : item)));
  const remove = i => onChange(agenda.filter((_, j) => j !== i));
  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= agenda.length) return;
    const next = [...agenda];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const addManual = () => onChange([...agenda, {
    title: '', description: '', vote_type: 'informativo', source_kind: 'manual', apply_on_approve: false,
  }]);
  const addFrom = (kind, row) => {
    if (alreadyLinked(agenda, kind, row.id)) return;
    const item = catalogToItem(kind, row);
    if (item) onChange([...agenda, item]);
  };
  const sections = [
    ['presupuesto', 'Presupuestos', (cat.budgets || []).length],
    ['proyecto', 'Proyectos', (cat.projects || []).length],
    ['cierre', 'Cierres', (cat.periods || []).length],
    ['cuota', 'Cuotas', (cat.quotas || []).length],
    ['organizacion', 'Organización', (cat.positions || []).length + (cat.committees || []).length],
  ];

  return (
    <div>
      <div className="asm-agenda-head">
        <div className="field-label" style={{ margin: 0 }}>Orden del día</div>
        <button type="button" className="asm-info-btn" onClick={() => setHelp(true)} title="Qué significa cada opción">
          <CircleHelp size={16} />
        </button>
      </div>
      <p className="asm-agenda-hint">
        Cada punto de la convocatoria puede ser solo informativo o llevarse a votación.
        Los presupuestos y proyectos se pueden votar para que, si se aprueban, se actualicen en Planeación.
      </p>
      {agenda.map((item, i) => (
        <div key={item.id || `${item.source_kind || 'manual'}-${item.source_id || i}-${i}`} className="asm-agenda-item">
          <div className="asm-agenda-item-main">
            <input
              className="field-input"
              value={item.title}
              disabled={!canWrite}
              placeholder={`Punto ${i + 1}`}
              onChange={e => update(i, { title: e.target.value })}
            />
            {canWrite && (
              <div className="asm-agenda-actions">
                <button type="button" className="btn btn-outline" disabled={i === 0} onClick={() => move(i, -1)}><ChevronUp size={14} /></button>
                <button type="button" className="btn btn-outline" disabled={i === agenda.length - 1} onClick={() => move(i, 1)}><ChevronDown size={14} /></button>
                <button type="button" className="btn btn-outline" onClick={() => remove(i)}><Trash2 size={14} /></button>
              </div>
            )}
          </div>
          <div className="asm-agenda-meta">
            <label className="asm-apply-toggle">
              <input
                type="checkbox"
                disabled={!canWrite}
                checked={needsVote(item)}
                onChange={e => update(i, { vote_type: e.target.checked ? (item.vote_type === 'informativo' ? 'simple' : item.vote_type) : 'informativo' })}
              />
              Llevar a votación
            </label>
            {needsVote(item) ? (
              <select
                className="field-select"
                value={item.vote_type}
                disabled={!canWrite}
                onChange={e => update(i, { vote_type: e.target.value })}
              >
                <option value="simple">Mayoría simple</option>
                <option value="calificada">Mayoría calificada</option>
                <option value="unanimidad">Unanimidad</option>
              </select>
            ) : (
              <span className="asm-agenda-note">Solo se da lectura. Queda constancia, sin votación.</span>
            )}
            <SourceChip kind={item.source_kind} label={item.source_label} />
            {(item.source_kind === 'presupuesto' || item.source_kind === 'proyecto') && canWrite && (
              <label className="asm-apply-toggle">
                <input
                  type="checkbox"
                  checked={!!item.apply_on_approve}
                  onChange={e => update(i, { apply_on_approve: e.target.checked })}
                />
                Aplicar al módulo si la asamblea lo aprueba o rechaza
              </label>
            )}
            {item.source_kind && item.source_kind !== 'manual' && item.source_kind !== 'presupuesto' && item.source_kind !== 'proyecto' && (
              <span className="asm-agenda-note">Queda constancia en el acta; no altera el módulo automáticamente.</span>
            )}
          </div>
        </div>
      ))}
      {canWrite && (
        <div className="asm-agenda-add">
          <button type="button" className="btn btn-outline btn-sm" onClick={addManual}><Plus size={12} /> Punto manual</button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setPicker(p => !p)}>
            <Link2 size={12} /> {picker ? 'Cerrar catálogo' : 'Agregar de Homly'}
          </button>
        </div>
      )}
      {canWrite && picker && (
        <div className="asm-catalog">
          <div className="asm-catalog-tabs">
            {sections.map(([k, l, n]) => (
              <button
                key={k}
                type="button"
                className={`asm-catalog-tab${section === k ? ' on' : ''}`}
                onClick={() => setSection(k)}
              >
                {l} <span>{n}</span>
              </button>
            ))}
          </div>
          <div className="asm-catalog-body">
            {section === 'presupuesto' && (
              (cat.budgets || []).length === 0 ? (
                <p>No hay presupuestos disponibles. Créalos en Planeación.</p>
              ) : cat.budgets.map(b => {
                const added = alreadyLinked(agenda, 'presupuesto', b.id);
                return (
                  <div key={b.id} className="asm-catalog-row">
                    <div>
                      <strong>{b.name}</strong>
                      <div>{b.year} · {BUDGET_ST[b.status] || b.status}{b.expense ? ` · ${money(b.expense)}` : ''}</div>
                    </div>
                    <button type="button" className="btn btn-outline btn-sm" disabled={added} onClick={() => addFrom('presupuesto', b)}>
                      {added ? 'Ya está' : 'Agregar'}
                    </button>
                  </div>
                );
              })
            )}
            {section === 'proyecto' && (
              (cat.projects || []).length === 0 ? (
                <p>No hay proyectos abiertos. Créalos en Planeación.</p>
              ) : cat.projects.map(p => {
                const added = alreadyLinked(agenda, 'proyecto', p.id);
                return (
                  <div key={p.id} className="asm-catalog-row">
                    <div>
                      <strong>{p.name}</strong>
                      <div>
                        {PROJECT_ST[p.status] || p.status}
                        {p.budget_amount ? ` · ${money(p.budget_amount)}` : ''}
                        {p.winner_supplier_name ? ` · ${p.winner_supplier_name}` : ''}
                      </div>
                    </div>
                    <button type="button" className="btn btn-outline btn-sm" disabled={added} onClick={() => addFrom('proyecto', p)}>
                      {added ? 'Ya está' : 'Agregar'}
                    </button>
                  </div>
                );
              })
            )}
            {section === 'cierre' && (
              (cat.periods || []).length === 0 ? (
                <p>Aún no hay períodos cerrados para ratificar en acta.</p>
              ) : cat.periods.map(p => {
                const added = alreadyLinked(agenda, 'cierre', p.id);
                return (
                  <div key={p.id} className="asm-catalog-row">
                    <div>
                      <strong>Cierre {p.period}</strong>
                      <div>{p.closed_at ? fmtWhen(p.closed_at) : 'Cerrado'}</div>
                    </div>
                    <button type="button" className="btn btn-outline btn-sm" disabled={added} onClick={() => addFrom('cierre', p)}>
                      {added ? 'Ya está' : 'Agregar'}
                    </button>
                  </div>
                );
              })
            )}
            {section === 'cuota' && (
              (cat.quotas || []).length === 0 ? (
                <p>No hay cuotas o cargos extra configurados.</p>
              ) : cat.quotas.map(q => {
                const added = alreadyLinked(agenda, 'cuota', q.id);
                return (
                  <div key={q.id} className="asm-catalog-row">
                    <div>
                      <strong>{q.label}</strong>
                      <div>{q.field_type}{q.default_amount ? ` · ${money(q.default_amount)}` : ''}</div>
                    </div>
                    <button type="button" className="btn btn-outline btn-sm" disabled={added} onClick={() => addFrom('cuota', q)}>
                      {added ? 'Ya está' : 'Agregar'}
                    </button>
                  </div>
                );
              })
            )}
            {section === 'organizacion' && (
              <>
                {(cat.positions || []).length === 0 && (cat.committees || []).length === 0 && (
                  <p>No hay cargos ni comités en Organización.</p>
                )}
                {(cat.positions || []).map(pos => {
                  const added = alreadyLinked(agenda, 'organizacion', pos.id);
                  return (
                    <div key={pos.id} className="asm-catalog-row">
                      <div>
                        <strong>{pos.title}</strong>
                        <div>{[pos.holder_name, pos.committee, pos.unit].filter(Boolean).join(' · ') || 'Cargo'}</div>
                      </div>
                      <button type="button" className="btn btn-outline btn-sm" disabled={added} onClick={() => addFrom('organizacion', pos)}>
                        {added ? 'Ya está' : 'Agregar'}
                      </button>
                    </div>
                  );
                })}
                {(cat.committees || []).map(c => {
                  const added = alreadyLinked(agenda, 'organizacion', c.id);
                  return (
                    <div key={c.id} className="asm-catalog-row">
                      <div>
                        <strong>{c.name}</strong>
                        <div>{c.members || 'Comité'}</div>
                      </div>
                      <button type="button" className="btn btn-outline btn-sm" disabled={added} onClick={() => addFrom('organizacion', c)}>
                        {added ? 'Ya está' : 'Agregar'}
                      </button>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>
      )}
      {help && <AgendaHelpModal rules={rules} onClose={() => setHelp(false)} />}
    </div>
  );
}

function SuggestField({ value, onChange, disabled, placeholder, options, pickLabel }) {
  return (
    <div className="asm-combo">
      <input
        className="field-input"
        value={value}
        disabled={disabled}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
      />
      {!disabled && (options || []).length > 0 && (
        <select
          className="field-select"
          value=""
          onChange={e => { if (e.target.value) onChange(e.target.value); }}
        >
          <option value="">{pickLabel}</option>
          {options.map(o => (
            <option key={o.id || o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      )}
    </div>
  );
}

function AgendaHelpModal({ rules, onClose }) {
  const qQual = rules?.qualified_majority_pct || 75;
  return (
    <div className="modal-bg open" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Cómo armar el orden del día</h3>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body asm-help">
          <h4>Título del punto</h4>
          <p>Es el asunto que se leerá en la convocatoria y en el acta. Puedes redactarlo a mano o dejar el texto que Homly propone al elegir un presupuesto, proyecto u otro registro.</p>
          <h4>¿Se lleva a votación?</h4>
          <p>Marca <strong>Llevar a votación</strong> solo en los puntos que la asamblea debe aprobar o rechazar. Los demás se leen y quedan como informativos, sin boleta.</p>
          <ul>
            <li><strong>Informativo.</strong> Se da cuenta a la asamblea; no hay votación.</li>
            <li><strong>Mayoría simple.</strong> Se aprueba con el 50% + 1 de los <em>presentes</em> (si hay 10, se necesitan 6 votos a favor). No confundir con el quórum para instalar la reunión.</li>
            <li><strong>Mayoría calificada.</strong> Se aprueba con el {qQual}% de los <em>presentes</em> (presupuesto, obras mayores, reformas). Ese {qQual}% no es el quórum de instalación.</li>
            <li><strong>Unanimidad.</strong> Todos los presentes deben votar a favor y nadie en contra.</li>
          </ul>
          <h4>Punto manual o desde Homly</h4>
          <p><strong>Punto manual</strong> es texto libre: queda en la convocatoria, la minuta y, si se vota, en el acta.</p>
          <p><strong>Agregar de Homly</strong> toma un registro ya creado en otro módulo:</p>
          <ul>
            <li><strong>Presupuesto / Proyecto</strong> (Planeación). Si marcas “Aplicar al módulo”, al votar un administrador o tesorero actualiza el estatus en Planeación.</li>
            <li><strong>Cierre, cuota u organización.</strong> Se incluyen para constancia; no se reescriben automáticamente en su módulo.</li>
          </ul>
          <h4>Minuta y acta</h4>
          <p><strong>Minuta de trabajo:</strong> notas internas de la sesión. No se protocoliza.</p>
          <p><strong>Acta de asamblea:</strong> documento formal para firma y, si aplica, protocolización ante notario.</p>
          <h4>Aplicar al módulo</h4>
          <p>La asamblea autoriza. Un administrador o tesorero confirma que el acuerdo se refleje en Planeación. Un auditor puede ver el resultado, pero no aplica el cambio.</p>
          <p className="asm-help-note">Estas mayorías son una guía operativa. Prevalecen el reglamento interno y la ley aplicable.</p>
        </div>
        <div className="modal-foot">
          <button className="btn btn-primary" onClick={onClose}>Entendido</button>
        </div>
      </div>
    </div>
  );
}

const DOC_TITLES = {
  convocatoria: 'Convocatoria',
  minuta: 'Minuta de trabajo',
  acta: 'Acta de asamblea',
};

async function fetchAssemblyDoc(tenantId, assembly, kind) {
  const label = DOC_TITLES[kind] || kind;
  const res = await asambleasAPI.printDoc(tenantId, assembly.id, kind);
  const blob = new Blob([res.data], { type: 'application/pdf' });
  if (blob.size < 80) {
    const text = await blob.text();
    let msg = `No se pudo generar la ${label.toLowerCase()}.`;
    try { msg = JSON.parse(text).detail || msg; } catch { /* blob no JSON */ }
    throw new Error(msg);
  }
  const safe = (s) => (s || '').trim().replace(/[/\\:*?"<>|]/g, '').replace(/\s+/g, '_');
  return {
    url: URL.createObjectURL(blob),
    blob,
    filename: `${label}_${safe(assembly.title) || assembly.year}.pdf`,
    title: label,
    kind,
  };
}

function downloadBlob(url, filename) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'documento.pdf';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function pdfPreviewSrc(url) {
  const base = (url || '').split('#')[0];
  return `${base}#toolbar=1&navpanes=0&scrollbar=1&view=FitH&pagemode=none&zoom=page-width`;
}

function DocPreviewModal({ preview, onClose }) {
  useEffect(() => () => { if (preview?.url) URL.revokeObjectURL(preview.url); }, [preview?.url]);
  if (!preview) return null;
  return createPortal(
    <div className="asm-preview-overlay" onClick={e => { e.stopPropagation(); onClose(); }}>
      <div className="asm-preview-modal" onClick={e => e.stopPropagation()}>
        <div className="asm-preview-head">
          <h3>{preview.title}</h3>
          <div className="asm-preview-actions">
            <button className="btn btn-outline btn-sm" onClick={() => downloadBlob(preview.url, preview.filename)}>
              <Download size={14} /> Descargar
            </button>
            <button className="modal-close" onClick={onClose}><X size={16} /></button>
          </div>
        </div>
        <div className="asm-preview-frame">
          <iframe
            src={pdfPreviewSrc(preview.url)}
            title={preview.title}
            allow="fullscreen"
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default function Asambleas() {
  const { tenantId, isReadOnly, role } = useAuth();
  const canWrite = !isReadOnly && role !== 'vecino';
  const [tab, setTab] = useState('convocatorias');
  const [ctx, setCtx] = useState(null);
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);
  const [creating, setCreating] = useState(false);

  const loadCtx = () => {
    if (!tenantId) return;
    asambleasAPI.context(tenantId).then(r => setCtx(r.data)).catch(() => toast.error('No se pudo cargar la normativa'));
  };

  const loadList = () => {
    if (!tenantId) return;
    setLoading(true);
    asambleasAPI.list(tenantId)
      .then(r => setList(Array.isArray(r.data) ? r.data : (r.data?.results || [])))
      .catch(() => toast.error('No se pudieron cargar las asambleas'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadCtx(); loadList(); }, [tenantId]);

  const openDetail = async (id) => {
    try {
      const r = await asambleasAPI.get(tenantId, id);
      setDetail(r.data);
    } catch {
      toast.error('No se pudo abrir la asamblea');
    }
  };

  const shown = list.filter(a => (TAB_STATUSES[tab] || []).includes(a.status));
  const rules = ctx?.rules || {};

  return (
    <div className="content-fade">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', color: 'var(--teal-600)', textTransform: 'uppercase' }}>
            Condominio
          </div>
          <h2 style={{ margin: '4px 0 0', fontSize: 22 }}>Asambleas</h2>
          <p style={{ color: 'var(--ink-400)', fontSize: 13, marginTop: 4 }}>
            Tres pasos claros: convocatoria, desarrollo de la sesión y conclusiones.
            La minuta es el registro interno; el acta es el documento que se firma y, si aplica, se protocoliza.
            Normativa de {rules.jurisdiction || 'tu condominio'}.
          </p>
        </div>
        {canWrite && (
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            <Plus size={14} /> Nueva asamblea
          </button>
        )}
      </div>

      {rules.jurisdiction && (
        <div className="asm-rules">
          <h4><Scale size={15} style={{ verticalAlign: -2, marginRight: 6 }} />Normativa aplicable</h4>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{rules.jurisdiction}</div>
          <div style={{ fontSize: 12, color: 'var(--ink-500)', marginTop: 2 }}>{rules.law}</div>
          <div className="asm-rules-grid">
            <div><span style={{ fontSize: 11, color: 'var(--ink-400)' }}>Anticipación ordinaria</span><strong>{rules.notice_days_ordinary} días</strong></div>
            <div><span style={{ fontSize: 11, color: 'var(--ink-400)' }}>Anticipación extraordinaria</span><strong>{rules.notice_days_extraordinary} días</strong></div>
            <div><span style={{ fontSize: 11, color: 'var(--ink-400)' }}>Quórum 1ª convocatoria</span><strong>{rules.first_quorum_pct}%</strong></div>
            <div><span style={{ fontSize: 11, color: 'var(--ink-400)' }}>Quórum 2ª convocatoria</span><strong>{rules.second_quorum_pct}%</strong></div>
            <div><span style={{ fontSize: 11, color: 'var(--ink-400)' }}>Espera 2ª convocatoria</span><strong>{rules.second_call_wait_minutes} min</strong></div>
            <div><span style={{ fontSize: 11, color: 'var(--ink-400)' }}>Mayoría calificada</span><strong>{rules.qualified_majority_pct}%</strong></div>
          </div>
          <p>{rules.who_can_call}</p>
          <p style={{ marginTop: 6 }}>{rules.notes}</p>
          <p style={{ marginTop: 6, fontStyle: 'italic' }}>{rules.disclaimer}</p>
        </div>
      )}

      <div className="asm-flow">
        {TABS.filter(([k]) => k !== 'historial').map(([k, l], i) => (
          <button key={k} type="button" className={`asm-flow-step ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>
            <span>{i + 1}</span>
            <div>
              <strong>{l.replace(/^\d+\.\s*/, '')}</strong>
              <small>{
                k === 'convocatorias' ? 'Prepara el orden del día y decide qué se vota'
                  : k === 'desarrollo' ? 'Asistencia, quórum y desahogo'
                    : 'Minuta interna y acta para protocolizar'
              }</small>
            </div>
          </button>
        ))}
        <button type="button" className={`asm-flow-hist ${tab === 'historial' ? 'on' : ''}`} onClick={() => setTab('historial')}>
          Historial
        </button>
      </div>
      <p className="asm-tab-help">{TAB_HELP[tab]}</p>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-400)' }}>Cargando asambleas…</div>
      ) : shown.length === 0 ? (
        <div className="card" style={{ padding: 36, textAlign: 'center' }}>
          <Vote size={28} style={{ color: 'var(--teal-600)', marginBottom: 10 }} />
          <h3 style={{ margin: '0 0 8px' }}>
            {tab === 'convocatorias' && 'Sin convocatorias'}
            {tab === 'desarrollo' && 'No hay asambleas en desarrollo'}
            {tab === 'conclusiones' && 'Sin asambleas por cerrar'}
            {tab === 'historial' && 'Aún no hay historial'}
          </h3>
          <p style={{ color: 'var(--ink-400)', fontSize: 13, maxWidth: 480, margin: '0 auto' }}>
            {tab === 'convocatorias' && 'Crea una asamblea, arma el orden del día, marca qué puntos se votan y emite la convocatoria con el plazo legal.'}
            {tab === 'desarrollo' && 'El día de la reunión tomas asistencia, validas quórum, instalas la mesa y desahogas cada punto. Solo se votan los que marcaste.'}
            {tab === 'conclusiones' && 'Redacta la minuta de trabajo (interna) y el acta formal. Solo el acta se firma y, si aplica, se protocoliza ante notario.'}
            {tab === 'historial' && 'Las asambleas cerradas o canceladas quedan archivadas con su convocatoria, minuta, acta y expediente.'}
          </p>
        </div>
      ) : (
        <div className="asm-list">
          {shown.map(a => {
            const q = a.quorum || {};
            return (
              <button key={a.id} className="asm-row" onClick={() => openDetail(a.id)}>
                <div className="asm-row-top">
                  <div>
                    <div style={{ fontWeight: 700 }}>{a.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: 4 }}>
                      {KIND[a.kind]} · {a.year} · {fmtWhen(a.first_call_at)} · {a.location || 'Sin lugar'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <Pill map={STATUS} value={a.status} />
                    {a.call_number >= 2 && <span className="proj-chip">2ª convocatoria</span>}
                    {a.minute_status === 'firmada' && <span className="proj-chip">Acta firmada</span>}
                    {a.protocolized && <span className="proj-chip">Protocolizada</span>}
                  </div>
                </div>
                <div className="asm-quorum-bar">
                  <div style={{
                    width: `${Math.min(100, q.present_pct || 0)}%`, height: '100%',
                    background: q.met ? 'var(--teal-500)' : 'var(--amber-400)',
                  }} />
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink-500)', marginTop: 6 }}>
                  Asistencia {q.present || 0}/{q.total || 0} · {q.present_pct || 0}% (requiere {q.required_pct || 0}%)
                </div>
              </button>
            );
          })}
        </div>
      )}

      {creating && (
        <AssemblyForm
          ctx={ctx}
          canWrite={canWrite}
          onClose={() => setCreating(false)}
          onSaved={async (id) => {
            setCreating(false);
            loadList();
            loadCtx();
            if (id) openDetail(id);
          }}
        />
      )}

      {detail && (
        <AssemblyDetail
          tenantId={tenantId}
          assembly={detail}
          ctx={ctx}
          canWrite={canWrite}
          tabHint={tab}
          onClose={() => setDetail(null)}
          onRefresh={() => { openDetail(detail.id); loadList(); loadCtx(); }}
        />
      )}
    </div>
  );
}

function AssemblyForm({ ctx, canWrite, onClose, onSaved, initial }) {
  const { tenantId } = useAuth();
  const rules = ctx?.rules || {};
  const [form, setForm] = useState({
    title: initial?.title || `Asamblea ordinaria ${new Date().getFullYear()}`,
    kind: initial?.kind || 'ordinaria',
    year: initial?.year || new Date().getFullYear(),
    location: initial?.location || '',
    first_call_at: toLocalInput(initial?.first_call_at),
    issued_by_name: initial?.issued_by_name || '',
    notice_days: initial?.notice_days || rules.notice_days_ordinary || 10,
    delivery_methods: initial?.delivery_methods?.length ? initial.delivery_methods : (rules.delivery || []),
    notes: initial?.notes || '',
    agenda: (initial?.agenda || []).map(i => ({ ...i })) || [],
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!initial && !form.agenda.length) {
      set('agenda', (rules.typical_ordinary_topics || []).map((t, i) => ({
        title: t, description: '', vote_type: i === 0 ? 'informativo' : 'simple',
        source_kind: 'manual', apply_on_approve: false,
      })));
    }
  }, [rules.typical_ordinary_topics]);

  const save = async () => {
    if (!form.title.trim()) return toast.error('Indica el nombre de la asamblea');
    try {
      const payload = {
        title: form.title.trim(),
        kind: form.kind,
        year: Number(form.year) || new Date().getFullYear(),
        location: form.location || '',
        first_call_at: (() => {
          if (!form.first_call_at) return null;
          const d = new Date(form.first_call_at);
          return Number.isNaN(d.getTime()) ? null : d.toISOString();
        })(),
        issued_by_name: form.issued_by_name || '',
        notice_days: Number(form.notice_days) || rules.notice_days_ordinary || 10,
        notes: form.notes || '',
        delivery_methods: form.delivery_methods || [],
        agenda: form.agenda.filter(i => i.title?.trim()).map((item, idx) => ({
          id: item.id || undefined,
          sort_order: idx,
          title: item.title.trim(),
          description: item.description || '',
          vote_type: item.vote_type || 'simple',
          source_kind: item.source_kind || 'manual',
          source_id: item.source_id || null,
          source_label: item.source_label || '',
          source_meta: item.source_meta && typeof item.source_meta === 'object' ? item.source_meta : {},
          apply_on_approve: !!item.apply_on_approve,
        })),
      };
      if (initial?.id) {
        await asambleasAPI.update(tenantId, initial.id, payload);
        toast.success('Convocatoria actualizada');
        onSaved(initial.id);
      } else {
        const r = await asambleasAPI.create(tenantId, payload);
        toast.success('Asamblea creada');
        onSaved(r.data.id);
      }
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo guardar'));
    }
  };

  return (
    <div className="modal-bg open" onClick={onClose}>
      <div className="modal xl" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{initial ? 'Editar convocatoria' : 'Nueva asamblea'}</h3>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body" style={{ display: 'grid', gap: 12 }}>
          <p className="asm-agenda-hint" style={{ marginBottom: 0 }}>
            Paso 1 de 3. Define fecha, lugar y orden del día. Marca <strong>Llevar a votación</strong> solo en los puntos que la asamblea deba aprobar o rechazar.
          </p>
          <div className="field">
            <div className="field-label">Nombre</div>
            <input className="field-input" value={form.title} disabled={!canWrite} onChange={e => set('title', e.target.value)} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <div className="field">
              <div className="field-label">Tipo</div>
              <select className="field-select" value={form.kind} disabled={!canWrite} onChange={e => {
                const kind = e.target.value;
                setForm(f => ({
                  ...f, kind,
                  notice_days: kind === 'extraordinaria' ? (rules.notice_days_extraordinary || 8) : (rules.notice_days_ordinary || 10),
                }));
              }}>
                <option value="ordinaria">Ordinaria</option>
                <option value="extraordinaria">Extraordinaria</option>
              </select>
            </div>
            <div className="field">
              <div className="field-label">Año</div>
              <input className="field-input" type="number" value={form.year} disabled={!canWrite} onChange={e => set('year', e.target.value)} />
            </div>
            <div className="field">
              <div className="field-label">Días de anticipación</div>
              <input className="field-input" type="number" min="1" value={form.notice_days} disabled={!canWrite} onChange={e => set('notice_days', e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="field">
              <div className="field-label">Fecha y hora (1ª convocatoria)</div>
              <input className="field-input" type="datetime-local" value={form.first_call_at} disabled={!canWrite} onChange={e => set('first_call_at', e.target.value)} />
            </div>
            <div className="field">
              <div className="field-label">Lugar</div>
              <SuggestField
                value={form.location}
                disabled={!canWrite}
                placeholder="Escribe el lugar o elige un área común"
                pickLabel="Elegir área común…"
                options={(ctx?.common_areas || []).map(a => ({ id: a.id, value: a.name, label: a.name }))}
                onChange={v => set('location', v)}
              />
            </div>
          </div>
          <div className="field">
            <div className="field-label">Quién convoca</div>
            <SuggestField
              value={form.issued_by_name}
              disabled={!canWrite}
              placeholder="Escribe el nombre o elige un cargo / comité"
              pickLabel="Elegir de la organización…"
              options={[
                ...(ctx?.catalog?.positions || []).map(p => ({
                  id: `pos-${p.id}`,
                  value: [p.title, p.holder_name].filter(Boolean).join(' — '),
                  label: [p.title, p.holder_name, p.committee].filter(Boolean).join(' · '),
                })),
                ...(ctx?.catalog?.committees || []).map(c => ({
                  id: `com-${c.id}`,
                  value: `Comité ${c.name}`,
                  label: c.members ? `Comité · ${c.name} (${c.members})` : `Comité · ${c.name}`,
                })),
              ]}
              onChange={v => set('issued_by_name', v)}
            />
          </div>
          <AgendaBuilder
            agenda={form.agenda}
            catalog={ctx?.catalog}
            rules={rules}
            canWrite={canWrite}
            onChange={next => set('agenda', next)}
          />
        </div>
        <div className="modal-foot">
          <button className="btn btn-outline" onClick={onClose}>Cancelar</button>
          {canWrite && <button className="btn btn-primary" onClick={save}>Guardar</button>}
        </div>
      </div>
    </div>
  );
}

function presentVoters(assembly) {
  return (assembly.attendees || []).filter(a => a.present && a.capacity !== 'invitado');
}

function voteNeed(item, q) {
  const n = q?.vote?.present ?? q?.present ?? 0;
  if (item.vote_type === 'informativo') return { need: 0, label: 'Sin votación — punto informativo' };
  if (item.vote_type === 'unanimidad') return { need: n, label: `Unanimidad: ${n} a favor y 0 en contra` };
  if (item.vote_type === 'calificada') {
    const need = q?.vote?.qualified_need ?? 0;
    return { need, label: `${q?.qualified_majority_pct || 75}% de los presentes (${need} votos a favor)` };
  }
  const need = q?.vote?.simple_need ?? (n ? Math.floor(n / 2) + 1 : 0);
  return { need, label: `50% + 1 de los presentes (${need} votos a favor)` };
}

const BALLOT = { for: 'a favor', against: 'en contra', abstain: 'abstención' };

function compileActaFormal(assembly, ctx) {
  const q = assembly.quorum || {};
  const tenant = ctx?.razon_social || ctx?.name || 'el condominio';
  const when = fmtWhen(assembly.installed_at || assembly.first_call_at);
  const lines = [
    `ACTA DE ASAMBLEA ${(KIND[assembly.kind] || '').toUpperCase()}`,
    '',
    `En ${assembly.location || 'el domicilio del condominio'}, el ${when}, se reunieron los condóminos de ${tenant} para celebrar la asamblea ${KIND[assembly.kind] || ''} denominada «${assembly.title}».`,
    '',
    `Comparecieron ${q.present || 0} de ${q.total || 0} unidades con derecho a voto (${q.present_pct || 0}%). El quórum de instalación requerido era del ${q.required_pct || 0}%. ${q.met ? 'Se declaró legalmente instalada la asamblea.' : 'Quedó constancia de la asistencia registrada.'}`,
    '',
    `Presidió ${assembly.president_name || '____________________'} y actuó como secretario ${assembly.secretary_name || '____________________'}.`,
    '',
    'ORDEN DEL DÍA Y ACUERDOS',
    '',
  ];
  const roman = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
  (assembly.agenda || []).forEach((item, i) => {
    const n = roman[i] || `${i + 1}.`;
    lines.push(`${n}. ${item.title}`);
    if (item.source_kind && item.source_kind !== 'manual' && item.source_label) {
      lines.push(`Origen: ${SOURCE[item.source_kind]} — ${item.source_label}.`);
    }
    if (!needsVote(item)) {
      lines.push(`Punto de información. La asamblea se dio por enterada.${item.notes ? ` ${item.notes}` : ''}`);
    } else {
      lines.push(
        `Se sometió a votación por ${(VOTE[item.vote_type] || item.vote_type).toLowerCase()}. `
        + `Resultado: ${RESULT[item.result] || item.result}. `
        + `A favor ${item.votes_for || 0}, en contra ${item.votes_against || 0}, abstenciones ${item.votes_abstain || 0}.`
      );
    }
    lines.push('');
  });
  lines.push('No habiendo más asuntos que tratar, se da por concluida la asamblea y se firma la presente acta para constancia y, en su caso, protocolización ante notario público.');
  lines.push('');
  lines.push('Este documento es el acta formal. La minuta de trabajo es un registro interno y no se protocoliza.');
  return lines.join('\n');
}

function compileMinuta(assembly) {
  const header = `Minuta de trabajo · ${assembly.title}\nDocumento interno de la sesión. No sustituye el acta ni se protocoliza.\n\n`;
  const body = (assembly.agenda || []).map((item, i) => {
    const origin = item.source_kind && item.source_kind !== 'manual'
      ? `Origen: ${SOURCE[item.source_kind] || item.source_kind}${item.source_label ? ` — ${item.source_label}` : ''}`
      : '';
    const voteLine = item.vote_type === 'informativo'
      ? 'Punto informativo (sin votación).'
      : `Votos: a favor ${item.votes_for || 0}, en contra ${item.votes_against || 0}, abstenciones ${item.votes_abstain || 0}.`;
    const ballots = (item.vote_detail || []).map(b => {
      const who = [b.unit_code, b.name].filter(Boolean).join(' ');
      return `   · ${who || 'Asistente'}: ${BALLOT[b.choice] || b.choice}`;
    });
    return [
      `${i + 1}. ${item.title}`,
      origin ? `   ${origin}` : '',
      `   ${VOTE[item.vote_type]} · ${RESULT[item.result] || item.result}`,
      `   ${voteLine}`,
      ...ballots,
      item.notes ? `   Notas: ${item.notes}` : '',
      item.applied_notes ? `   ${item.applied_notes}` : '',
    ].filter(Boolean).join('\n');
  }).join('\n\n');
  return header + body;
}

function VoteDetailList({ item }) {
  const rows = item.vote_detail || [];
  if (!rows.length) return null;
  return (
    <div className="asm-vote-detail">
      {rows.map((b, i) => (
        <span key={b.attendee_id || i}>
          {[b.unit_code, b.name].filter(Boolean).join(' ') || 'Asistente'}: {BALLOT[b.choice] || b.choice}
        </span>
      ))}
    </div>
  );
}

function VoteModal({ assembly, item, q, canWrite, onClose, onSave }) {
  const voters = presentVoters(assembly);
  const prev = {};
  (item.vote_detail || []).forEach(b => { prev[b.attendee_id] = b.choice; });
  const [choices, setChoices] = useState(() => {
    const init = {};
    voters.forEach(a => { init[a.id] = prev[a.id] || ''; });
    return init;
  });
  const tally = voters.reduce((acc, a) => {
    const c = choices[a.id];
    if (c === 'for') acc.for += 1;
    else if (c === 'against') acc.against += 1;
    else if (c === 'abstain') acc.abstain += 1;
    return acc;
  }, { for: 0, against: 0, abstain: 0 });
  const need = voteNeed(item, q);
  const pending = voters.filter(a => !choices[a.id]).length;
  const wouldPass = item.vote_type === 'unanimidad'
    ? tally.against === 0 && tally.for >= need.need && pending === 0
    : tally.for >= need.need && need.need > 0;
  const setAll = (choice) => {
    const next = {};
    voters.forEach(a => { next[a.id] = choice; });
    setChoices(next);
  };

  return (
    <div className="modal-bg open" onClick={e => { e.stopPropagation(); onClose(); }}>
      <div className="modal xl" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Votación · {item.title}</h3>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body">
          <p className="asm-agenda-hint">
            {VOTE[item.vote_type]} · {need.label}. Se vota con los {voters.length} asistentes marcados como presentes.
          </p>
          {voters.length === 0 ? (
            <p>No hay presentes. Toma asistencia antes de votar.</p>
          ) : (
            <>
              <div className="asm-rules-grid" style={{ marginBottom: 10 }}>
                <div><span style={{ fontSize: 11, color: 'var(--ink-400)' }}>A favor</span><strong>{tally.for}</strong></div>
                <div><span style={{ fontSize: 11, color: 'var(--ink-400)' }}>En contra</span><strong>{tally.against}</strong></div>
                <div><span style={{ fontSize: 11, color: 'var(--ink-400)' }}>Abstenciones</span><strong>{tally.abstain}</strong></div>
                <div><span style={{ fontSize: 11, color: 'var(--ink-400)' }}>Sin votar</span><strong>{pending}</strong></div>
                <div><span style={{ fontSize: 11, color: 'var(--ink-400)' }}>Se necesitan</span><strong>{need.need}</strong></div>
                <div><span style={{ fontSize: 11, color: 'var(--ink-400)' }}>Pronóstico</span><strong>{wouldPass ? 'Se aprueba' : 'No se aprueba'}</strong></div>
              </div>
              {canWrite && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => setAll('for')}>Todos a favor</button>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => setAll('against')}>Todos en contra</button>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => setAll('abstain')}>Todos abstención</button>
                </div>
              )}
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Unidad</th><th>Asistente</th><th>A favor</th><th>En contra</th><th>Abstención</th></tr></thead>
                  <tbody>
                    {voters.map(a => (
                      <tr key={a.id}>
                        <td>{a.unit_code || '—'}</td>
                        <td>{a.attendee_name}{a.proxy_name ? ` (repr. ${a.proxy_name})` : ''}</td>
                        {['for', 'against', 'abstain'].map(c => (
                          <td key={c} style={{ textAlign: 'center' }}>
                            <input
                              type="radio"
                              name={`vote-${item.id}-${a.id}`}
                              checked={choices[a.id] === c}
                              disabled={!canWrite}
                              onChange={() => setChoices(s => ({ ...s, [a.id]: c }))}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn btn-outline" onClick={onClose}>Cancelar</button>
          {canWrite && (
            <button className="btn btn-primary" disabled={!voters.length} onClick={() => onSave({
              ballots: voters.filter(a => choices[a.id]).map(a => ({ attendee_id: a.id, choice: choices[a.id] })),
              votes_for: tally.for,
              votes_against: tally.against,
              votes_abstain: tally.abstain,
              notes: item.notes || '',
            })}>
              <Check size={14} /> Registrar votación
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const ASM_STEPS = [
  { id: 'convocatoria', n: 1, title: 'Convocatoria', hint: 'Prepara y emite' },
  { id: 'desarrollo', n: 2, title: 'Desarrollo', hint: 'Asistencia y puntos' },
  { id: 'conclusiones', n: 3, title: 'Conclusiones', hint: 'Minuta, acta y cierre' },
];

function AssemblyDetail({ tenantId, assembly, ctx, canWrite, tabHint, onClose, onRefresh }) {
  const [inner, setInner] = useState(
    tabHint === 'desarrollo' || tabHint === 'reuniones' ? 'desarrollo'
      : (tabHint === 'conclusiones' || tabHint === 'historial' || tabHint === 'minutas') ? 'conclusiones'
        : 'convocatoria'
  );
  const [editing, setEditing] = useState(false);
  const [mesa, setMesa] = useState({ president_name: assembly.president_name || '', secretary_name: assembly.secretary_name || '' });
  const [minute, setMinute] = useState(assembly.minute_body || '');
  const [acta, setActa] = useState(assembly.acta_body || '');
  const [notary, setNotary] = useState({ notary_name: assembly.notary_name || '', notary_folio: assembly.notary_folio || '' });
  const [fileKind, setFileKind] = useState('evidencia');
  const [preview, setPreview] = useState(null);
  const [votingItem, setVotingItem] = useState(null);
  const [pointNotes, setPointNotes] = useState({});
  const q = assembly.quorum || {};
  const rules = assembly.legal_snapshot || ctx?.rules || {};
  const locked = ['cerrada', 'cancelada'].includes(assembly.status);
  const canEditCall = canWrite && ['borrador', 'convocada'].includes(assembly.status);

  useEffect(() => {
    setMesa({ president_name: assembly.president_name || '', secretary_name: assembly.secretary_name || '' });
    setMinute(assembly.minute_body || '');
    setActa(assembly.acta_body || '');
    setNotary({ notary_name: assembly.notary_name || '', notary_folio: assembly.notary_folio || '' });
    const notes = {};
    (assembly.agenda || []).forEach(i => { notes[i.id] = i.notes || ''; });
    setPointNotes(notes);
  }, [assembly.id, assembly.updated_at]);

  const openDoc = async (kind) => {
    try {
      setPreview(await fetchAssemblyDoc(tenantId, assembly, kind));
    } catch (e) {
      toast.error(e.message || errMsg(e, 'No se pudo abrir el documento'));
    }
  };

  if (editing) {
    return (
      <AssemblyForm
        ctx={ctx}
        canWrite={canWrite}
        initial={assembly}
        onClose={() => setEditing(false)}
        onSaved={() => { setEditing(false); onRefresh(); }}
      />
    );
  }

  const publish = async () => {
    try {
      await asambleasAPI.publish(tenantId, assembly.id);
      toast.success('Convocatoria emitida y notificada a la comunidad');
      onRefresh();
    } catch (e) { toast.error(errMsg(e, 'No se pudo emitir')); }
  };

  return (
    <div className="modal-bg open" onClick={onClose}>
      <div className="modal xl" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{assembly.title}</h3>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            <Pill map={STATUS} value={assembly.status} />
            <span className="proj-chip">{KIND[assembly.kind]}</span>
            {assembly.call_number >= 2 && <span className="proj-chip">2ª convocatoria</span>}
            <span className="proj-chip">{fmtWhen(assembly.first_call_at)}</span>
          </div>
          <p className="asm-tab-help" style={{ marginTop: 0 }}>
            Sigue los tres pasos. En la convocatoria decides qué se vota; en el desarrollo se desahoga;
            al final la minuta queda como registro interno y el acta como documento para protocolizar.
          </p>
          <div className="asm-steps">
            {ASM_STEPS.map(s => (
              <button
                key={s.id}
                type="button"
                className={`asm-step ${inner === s.id ? 'on' : ''}`}
                onClick={() => setInner(s.id)}
              >
                <span>{s.n}</span>
                <div>
                  <strong>{s.title}</strong>
                  <small>{s.hint}</small>
                </div>
              </button>
            ))}
          </div>

          {inner === 'convocatoria' && (
            <>
              <p style={{ fontSize: 13, color: 'var(--ink-500)' }}>
                {assembly.issued_by_name || 'Administración'} convoca en {assembly.location || '—'} ·
                anticipación {assembly.notice_days} días · {rules.jurisdiction}
              </p>
              <h4 style={{ fontSize: 14, margin: '12px 0 8px' }}>Orden del día</h4>
              <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                {(assembly.agenda || []).map(i => (
                  <li key={i.id} style={{ marginBottom: 8 }}>
                    <strong>{i.title}</strong>
                    <span className={`asm-vote-flag ${needsVote(i) ? 'vote' : 'info'}`}>
                      {needsVote(i) ? `A votación · ${VOTE[i.vote_type]}` : 'Informativo · sin votación'}
                    </span>
                    {i.result !== 'pendiente' && ` · ${RESULT[i.result]}`}
                    {i.source_kind && i.source_kind !== 'manual' && (
                      <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>
                        {SOURCE[i.source_kind]}: {i.source_label || i.title}
                        {i.apply_on_approve ? ' · Al votar se actualizará el módulo (admin/tesorero)' : ' · Solo constancia'}
                      </div>
                    )}
                  </li>
                ))}
              </ol>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
                <button className="btn btn-outline" onClick={() => openDoc('convocatoria')}><Eye size={14} /> Ver convocatoria</button>
                {canEditCall && (
                  <button className="btn btn-outline" onClick={() => setEditing(true)}><Pencil size={14} /> Editar convocatoria</button>
                )}
                {canWrite && assembly.status === 'borrador' && (
                  <button className="btn btn-primary" onClick={publish}><Send size={14} /> Emitir convocatoria</button>
                )}
                {canWrite && assembly.status === 'borrador' && (
                  <button className="btn btn-outline" onClick={async () => {
                    if (!window.confirm('¿Eliminar este borrador?')) return;
                    await asambleasAPI.delete(tenantId, assembly.id);
                    toast.success('Eliminada');
                    onClose();
                    onRefresh();
                  }}><Trash2 size={14} /> Eliminar</button>
                )}
                {canWrite && ['borrador', 'convocada'].includes(assembly.status) && (
                  <button className="btn btn-outline" onClick={async () => {
                    const reason = window.prompt('Motivo de cancelación');
                    if (reason == null) return;
                    await asambleasAPI.cancel(tenantId, assembly.id, { reason });
                    toast.success('Asamblea cancelada');
                    onRefresh();
                  }}>Cancelar asamblea</button>
                )}
              </div>
            </>
          )}

          {inner === 'desarrollo' && (
            <>
              <p className="asm-agenda-hint">
                El <strong>quórum de instalación</strong> decide si se puede iniciar la reunión:
                {` ${q.install_first_pct || 75}% en 1ª convocatoria y ${q.install_second_pct || 51}% en 2ª.`}
                {' '}Las votaciones usan otra regla: <strong>50% + 1 de los presentes</strong> (mayoría simple)
                o el <strong>{q.qualified_majority_pct || 75}% de los presentes</strong> (mayoría calificada).
              </p>
              <div className="asm-rules-grid">
                <div><span style={{ fontSize: 11, color: 'var(--ink-400)' }}>Asistencia</span><strong>{q.present || 0}/{q.total || 0}</strong></div>
                <div><span style={{ fontSize: 11, color: 'var(--ink-400)' }}>Quórum de instalación</span><strong>{q.present_pct || 0}%</strong></div>
                <div><span style={{ fontSize: 11, color: 'var(--ink-400)' }}>Requerido ({q.call_label || '1ª convocatoria'})</span><strong>{q.required_pct || 0}%</strong></div>
                <div><span style={{ fontSize: 11, color: 'var(--ink-400)' }}>Puede iniciar</span><strong>{q.met ? 'Sí, hay quórum' : 'Aún no'}</strong></div>
                <div><span style={{ fontSize: 11, color: 'var(--ink-400)' }}>Simple (50%+1)</span><strong>{q.vote?.simple_need || 0} votos</strong></div>
                <div><span style={{ fontSize: 11, color: 'var(--ink-400)' }}>Calificada</span><strong>{q.vote?.qualified_need || 0} votos</strong></div>
              </div>
              <div className="asm-quorum-bar" style={{ marginBottom: 12 }}>
                <div style={{ width: `${Math.min(100, q.present_pct || 0)}%`, height: '100%', background: q.met ? 'var(--teal-500)' : 'var(--amber-400)' }} />
              </div>
              {canWrite && !locked && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto auto', gap: 8, marginBottom: 12 }}>
                  <input className="field-input" placeholder="Presidente de debates" value={mesa.president_name} onChange={e => setMesa(m => ({ ...m, president_name: e.target.value }))} />
                  <input className="field-input" placeholder="Secretario" value={mesa.secretary_name} onChange={e => setMesa(m => ({ ...m, secretary_name: e.target.value }))} />
                  {assembly.status === 'convocada' && !q.met && assembly.call_number < 2 && (
                    <button className="btn btn-outline" onClick={async () => {
                      try { await asambleasAPI.secondCall(tenantId, assembly.id); toast.success('Pasa a 2ª convocatoria'); onRefresh(); }
                      catch (e) { toast.error(errMsg(e, 'No se pudo abrir la 2ª convocatoria')); }
                    }}>2ª convocatoria</button>
                  )}
                  {assembly.status === 'convocada' && (
                    <button className="btn btn-primary" onClick={async () => {
                      try {
                        await asambleasAPI.install(tenantId, assembly.id, mesa);
                        toast.success('Asamblea instalada');
                        onRefresh();
                      } catch (e) { toast.error(errMsg(e, 'No se pudo instalar')); }
                    }}><Gavel size={14} /> Instalar</button>
                  )}
                </div>
              )}
              <div className="table-wrap" style={{ marginBottom: 14 }}>
                <table>
                  <thead><tr><th>Unidad</th><th>Asistente</th><th>Calidad</th><th>Poder</th><th>Presente</th></tr></thead>
                  <tbody>
                    {(assembly.attendees || []).map(a => (
                      <tr key={a.id}>
                        <td>{a.unit_code || '—'}</td>
                        <td>{a.attendee_name}</td>
                        <td>{a.capacity}</td>
                        <td>
                          {canWrite && !locked ? (
                            <input className="field-input" value={a.proxy_name || ''} onBlur={e => asambleasAPI.patchAttendee(tenantId, assembly.id, a.id, { proxy_name: e.target.value }).then(onRefresh)} onChange={() => {}} defaultValue={a.proxy_name || ''} />
                          ) : (a.proxy_name || '—')}
                        </td>
                        <td>
                          <input
                            type="checkbox"
                            disabled={!canWrite || locked}
                            checked={!!a.present}
                            onChange={async e => {
                              await asambleasAPI.patchAttendee(tenantId, assembly.id, a.id, { present: e.target.checked });
                              onRefresh();
                            }}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {canWrite && !locked && (
                <button className="btn btn-outline btn-sm" onClick={async () => {
                  const r = await asambleasAPI.seedAttendees(tenantId, assembly.id);
                  toast.success(`${r.data.created || 0} unidad(es) agregadas`);
                  onRefresh();
                }}><Users size={12} /> Completar lista con unidades</button>
              )}

              {assembly.status === 'en_curso' && (
                <>
                  <h4 style={{ fontSize: 14, margin: '16px 0 8px' }}>Desarrollo del orden del día</h4>
                  <p className="asm-agenda-hint">
                    Desahoga cada punto: anota la minuta de trabajo y, si el punto se lleva a votación, abre la boleta con los presentes.
                    El resultado queda en la minuta. El acta formal se redacta al final, en Conclusiones.
                  </p>
                  {canWrite && !locked && (
                    <MeetingSourcePicker
                      catalog={ctx?.catalog}
                      agenda={assembly.agenda}
                      onAdd={async (kind, row) => {
                        try {
                          await asambleasAPI.addFromPlaneacion(tenantId, assembly.id, {
                            source_kind: kind,
                            source_id: row.id,
                          });
                          toast.success(kind === 'proyecto' ? 'Proyecto incluido en la asamblea' : 'Presupuesto incluido en la asamblea');
                          onRefresh();
                        } catch (e) {
                          toast.error(errMsg(e, 'No se pudo incluir en la asamblea'));
                        }
                      }}
                    />
                  )}
                  {(assembly.agenda || []).map((item, idx) => {
                    const need = voteNeed(item, q);
                    const notes = pointNotes[item.id] ?? item.notes ?? '';
                    return (
                      <div key={item.id} className="card asm-meet-point">
                        <div className="asm-meet-point-head">
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--teal-600)' }}>Punto {idx + 1}</div>
                            <strong>{item.title}</strong>
                            <div style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: 4 }}>
                              {needsVote(item) ? `${VOTE[item.vote_type]} · ${RESULT[item.result]} · ${need.label}` : `Informativo · ${RESULT[item.result]}`}
                            </div>
                            <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                              {canWrite && !locked && (
                                <label className="asm-apply-toggle">
                                  <input
                                    type="checkbox"
                                    checked={needsVote(item)}
                                    onChange={async e => {
                                      const vote_type = e.target.checked
                                        ? (item.vote_type === 'informativo' ? 'simple' : item.vote_type)
                                        : 'informativo';
                                      try {
                                        await asambleasAPI.saveItemNotes(tenantId, assembly.id, item.id, {
                                          notes,
                                          vote_type,
                                        });
                                        toast.success(vote_type === 'informativo' ? 'Este punto ya no se vota' : 'Este punto se llevará a votación');
                                        onRefresh();
                                      } catch (err) {
                                        toast.error(errMsg(err, 'No se pudo actualizar el punto'));
                                      }
                                    }}
                                  />
                                  Llevar a votación
                                </label>
                              )}
                              {needsVote(item) && canWrite && !locked && (
                                <select
                                  className="field-select"
                                  value={item.vote_type}
                                  onChange={async e => {
                                    try {
                                      await asambleasAPI.saveItemNotes(tenantId, assembly.id, item.id, {
                                        notes,
                                        vote_type: e.target.value,
                                      });
                                      onRefresh();
                                    } catch (err) {
                                      toast.error(errMsg(err, 'No se pudo cambiar la mayoría'));
                                    }
                                  }}
                                >
                                  <option value="simple">Mayoría simple</option>
                                  <option value="calificada">Mayoría calificada</option>
                                  <option value="unanimidad">Unanimidad</option>
                                </select>
                              )}
                              <SourceChip kind={item.source_kind} label={item.source_label} />
                              {item.apply_on_approve && <span className="asm-agenda-note">Actualiza el módulo al votar</span>}
                            </div>
                            {item.vote_type !== 'informativo' && item.result !== 'pendiente' && (
                              <div style={{ fontSize: 12, color: 'var(--ink-500)', marginTop: 4 }}>
                                A favor {item.votes_for || 0} · En contra {item.votes_against || 0} · Abstenciones {item.votes_abstain || 0}
                              </div>
                            )}
                            <VoteDetailList item={item} />
                            {item.applied_notes && (
                              <div style={{ fontSize: 12, marginTop: 4, color: item.applied_status === 'error' ? 'var(--coral-600)' : 'var(--ink-500)' }}>
                                {APPLY[item.applied_status] || item.applied_status}: {item.applied_notes}
                              </div>
                            )}
                          </div>
                        </div>
                        <textarea
                          className="field-input"
                          rows={3}
                          value={notes}
                          disabled={!canWrite || locked}
                          placeholder="Notas de minuta de este punto…"
                          onChange={e => setPointNotes(s => ({ ...s, [item.id]: e.target.value }))}
                        />
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                          {canWrite && !locked && (
                            <button className="btn btn-outline btn-sm" onClick={async () => {
                              await asambleasAPI.saveItemNotes(tenantId, assembly.id, item.id, {
                                notes,
                                mark_done: item.vote_type === 'informativo',
                              });
                              toast.success(item.vote_type === 'informativo' ? 'Punto informativo desahogado' : 'Notas guardadas');
                              onRefresh();
                            }}>Guardar notas</button>
                          )}
                          {item.vote_type !== 'informativo' && canWrite && !locked && (
                            <button className="btn btn-primary btn-sm" onClick={() => setVotingItem(item)}>
                              <Vote size={12} /> {item.result === 'pendiente' ? 'Abrir votación' : 'Revisar votación'}
                            </button>
                          )}
                          {canWrite && item.apply_on_approve && ['aprobado', 'rechazado'].includes(item.result) && ['pendiente', 'error'].includes(item.applied_status) && (
                            <button className="btn btn-outline btn-sm" onClick={async () => {
                              try {
                                await asambleasAPI.applyItem(tenantId, assembly.id, item.id);
                                toast.success('Acuerdo aplicado al módulo');
                                onRefresh();
                              } catch (e) {
                                toast.error(errMsg(e, 'No se pudo aplicar el acuerdo'));
                              }
                            }}>Aplicar al módulo</button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
              {votingItem && (
                <VoteModal
                  assembly={assembly}
                  item={votingItem}
                  q={q}
                  canWrite={canWrite && !locked}
                  onClose={() => setVotingItem(null)}
                  onSave={async (payload) => {
                    try {
                      await asambleasAPI.vote(tenantId, assembly.id, votingItem.id, {
                        ...payload,
                        notes: pointNotes[votingItem.id] ?? votingItem.notes ?? '',
                      });
                      toast.success('Votación registrada en la minuta de trabajo');
                      setVotingItem(null);
                      onRefresh();
                    } catch (e) {
                      toast.error(errMsg(e, 'No se pudo registrar la votación'));
                    }
                  }}
                />
              )}
            </>
          )}

          {inner === 'conclusiones' && (
            <>
              <p className="asm-agenda-hint">
                Separan dos documentos: la <strong>minuta</strong> es el registro interno de trabajo.
                El <strong>acta</strong> es el único texto que se firma y, si procede, se protocoliza ante notario.
              </p>
              <div className="asm-docs-grid">
                <section className="asm-doc-card">
                  <header>
                    <span className="asm-doc-kicker">Registro interno</span>
                    <h4>Minuta de trabajo</h4>
                  </header>
                  <p>Notas de la sesión y el desahogo de cada punto. No sustituye el acta ni se protocoliza.</p>
                  <textarea
                    className="field-input"
                    rows={10}
                    value={minute}
                    disabled={!canWrite || locked}
                    onChange={e => setMinute(e.target.value)}
                    placeholder="Minuta de trabajo: notas de la sesión. Documento interno, no se protocoliza."
                  />
                  <div className="asm-doc-actions">
                    {canWrite && !locked && (
                      <button className="btn btn-outline btn-sm" onClick={() => {
                        setMinute(compileMinuta(assembly));
                        toast.success('Minuta armada con el desahogo de la sesión');
                      }}>Armar desde el desahogo</button>
                    )}
                    {canWrite && !locked && (
                      <button className="btn btn-primary btn-sm" onClick={async () => {
                        await asambleasAPI.saveMinute(tenantId, assembly.id, { minute_body: minute });
                        toast.success('Minuta de trabajo guardada');
                        onRefresh();
                      }}>Guardar minuta</button>
                    )}
                    <button className="btn btn-outline btn-sm" onClick={() => openDoc('minuta')}><Eye size={12} /> Ver minuta</button>
                  </div>
                </section>

                <section className="asm-doc-card asm-doc-card-formal">
                  <header>
                    <span className="asm-doc-kicker">Documento formal</span>
                    <h4>Acta de asamblea</h4>
                  </header>
                  <p>Texto para firma y protocolización. Redáctalo con lenguaje de comparecencia; no copies la minuta tal cual.</p>
                  <textarea
                    className="field-input"
                    rows={10}
                    value={acta}
                    disabled={!canWrite || (locked && assembly.minute_status !== 'borrador')}
                    onChange={e => setActa(e.target.value)}
                    placeholder="Acta formal: comparecencia, quórum, acuerdos y cláusulas de cierre para protocolizar…"
                  />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <input className="field-input" placeholder="Notario (si se protocoliza)" disabled={!canWrite} value={notary.notary_name} onChange={e => setNotary(n => ({ ...n, notary_name: e.target.value }))} />
                    <input className="field-input" placeholder="Folio / escritura" disabled={!canWrite} value={notary.notary_folio} onChange={e => setNotary(n => ({ ...n, notary_folio: e.target.value }))} />
                  </div>
                  <div className="asm-doc-actions">
                    {canWrite && !locked && (
                      <button className="btn btn-outline btn-sm" onClick={() => {
                        setActa(compileActaFormal(assembly, ctx));
                        toast.success('Borrador de acta formal generado');
                      }}>Generar borrador de acta</button>
                    )}
                    {canWrite && ['en_curso', 'cerrada'].includes(assembly.status) && (
                      <button className="btn btn-outline btn-sm" onClick={async () => {
                        await asambleasAPI.saveMinute(tenantId, assembly.id, { acta_body: acta, ...notary });
                        toast.success('Acta formal guardada');
                        onRefresh();
                      }}>Guardar acta</button>
                    )}
                    {canWrite && ['en_curso', 'cerrada'].includes(assembly.status) && assembly.minute_status === 'borrador' && (
                      <button className="btn btn-outline btn-sm" onClick={async () => {
                        await asambleasAPI.saveMinute(tenantId, assembly.id, { acta_body: acta, ...notary });
                        await asambleasAPI.signMinute(tenantId, assembly.id);
                        toast.success('Acta firmada');
                        onRefresh();
                      }}><Check size={12} /> Firmar acta</button>
                    )}
                    {canWrite && assembly.minute_status === 'firmada' && (
                      <button className="btn btn-outline btn-sm" onClick={async () => {
                        await asambleasAPI.protocolize(tenantId, assembly.id, notary);
                        toast.success('Acta protocolizada');
                        onRefresh();
                      }}>Marcar protocolizada</button>
                    )}
                    <button className="btn btn-outline btn-sm" onClick={() => openDoc('acta')}><Eye size={12} /> Ver acta</button>
                  </div>
                  <p className="asm-agenda-note">
                    Presidente: {assembly.president_name || '—'} · Secretario: {assembly.secretary_name || '—'} ·
                    Estatus del acta: {assembly.minute_status}
                    {assembly.protocolized ? ` · Notario ${assembly.notary_name || ''} ${assembly.notary_folio || ''}` : ''}
                  </p>
                </section>
              </div>

              {canWrite && assembly.status === 'en_curso' && (
                <div className="asm-close-bar">
                  <div>
                    <strong>Cerrar la asamblea</strong>
                    <p>Concluye la sesión. El acta se firma y protocoliza por separado; la minuta queda como expediente interno.</p>
                  </div>
                  <button className="btn btn-primary" onClick={async () => {
                    await asambleasAPI.saveMinute(tenantId, assembly.id, { acta_body: acta, minute_body: minute, ...notary });
                    await asambleasAPI.close(tenantId, assembly.id);
                    toast.success('Asamblea cerrada');
                    onRefresh();
                  }}><Landmark size={14} /> Cerrar asamblea</button>
                </div>
              )}

              <section className="asm-doc-card" style={{ marginTop: 14 }}>
                <header>
                  <span className="asm-doc-kicker">Expediente</span>
                  <h4>Archivos de la asamblea</h4>
                </header>
                <p>Convocatoria impresa, poderes, evidencia de notificación y el acta protocolizada, si ya existe.</p>
                {(assembly.files || []).length === 0 ? (
                  <div style={{ fontSize: 13, color: 'var(--ink-400)', marginBottom: 12 }}>Sin documentos adjuntos.</div>
                ) : (
                  <div className="proj-file-list">
                    {assembly.files.map(f => (
                      <div key={f.id} className="proj-file-row">
                        <FileText size={14} />
                        <span className="name">{f.original_name}</span>
                        <span className="proj-chip">{FILE_KINDS[f.kind] || f.kind}</span>
                        <button className="btn btn-outline btn-sm" onClick={() => downloadProtected(f.file_url, f.original_name)}><Download size={12} /></button>
                        {canWrite && (
                          <button className="btn btn-outline btn-sm" onClick={async () => {
                            await asambleasAPI.deleteFile(tenantId, assembly.id, f.id);
                            onRefresh();
                          }}><Trash2 size={12} /></button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {canWrite && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'end' }}>
                    <select className="field-select" value={fileKind} onChange={e => setFileKind(e.target.value)}>
                      {Object.entries(FILE_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                    </select>
                    <label className="btn btn-primary" style={{ cursor: 'pointer' }}>
                      <Upload size={14} /> Subir
                      <input type="file" hidden onChange={async e => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (!file) return;
                        const fd = new FormData();
                        fd.append('file', file, file.name);
                        fd.append('kind', fileKind);
                        try {
                          await asambleasAPI.uploadFile(tenantId, assembly.id, fd);
                          toast.success('Archivo cargado');
                          onRefresh();
                        } catch (err) { toast.error(errMsg(err, 'No se pudo subir')); }
                      }} />
                    </label>
                  </div>
                )}
              </section>
            </>
          )}

        </div>
        <div className="modal-foot">
          {inner !== 'convocatoria' && (
            <button className="btn btn-outline" onClick={() => setInner(inner === 'conclusiones' ? 'desarrollo' : 'convocatoria')}>
              Paso anterior
            </button>
          )}
          {inner !== 'conclusiones' && (
            <button className="btn btn-primary" onClick={() => setInner(inner === 'convocatoria' ? 'desarrollo' : 'conclusiones')}>
              Siguiente paso
            </button>
          )}
          <button className="btn btn-outline" onClick={onClose}>Cerrar</button>
        </div>
      </div>
      {preview && <DocPreviewModal preview={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}