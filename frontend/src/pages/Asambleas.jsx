import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { asambleasAPI, api } from '../api/client';
import toast from 'react-hot-toast';
import {
  Plus, Vote, X, Pencil, Trash2, Send, Check, Users, FileText,
  Landmark, Download, Upload, Printer, Scale, Gavel,
  Link2, ChevronUp, ChevronDown,
} from 'lucide-react';

const TABS = [
  ['convocatorias', 'Convocatorias'],
  ['reuniones', 'Reuniones'],
  ['minutas', 'Minutas'],
  ['historial', 'Historial'],
];

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
  minuta: 'Minuta / acta',
  evidencia: 'Evidencia de notificación',
  otro: 'Otro',
};

const TAB_STATUSES = {
  convocatorias: ['borrador', 'convocada'],
  reuniones: ['convocada', 'en_curso'],
  minutas: ['en_curso', 'cerrada'],
  historial: ['cerrada', 'cancelada'],
};

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

function AgendaBuilder({ agenda, catalog, canWrite, onChange }) {
  const [picker, setPicker] = useState(false);
  const [section, setSection] = useState('presupuesto');
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
    title: '', description: '', vote_type: 'simple', source_kind: 'manual', apply_on_approve: false,
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
      <div className="field-label" style={{ marginBottom: 8 }}>Orden del día</div>
      <p className="asm-agenda-hint">
        Redacta puntos a mano o agrégalos desde Planeación (presupuestos y proyectos), Cierres, Cuotas u Organización.
        La asamblea autoriza; un administrador o tesorero confirma que se actualice el módulo.
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
            <select
              className="field-select"
              value={item.vote_type}
              disabled={!canWrite}
              onChange={e => update(i, { vote_type: e.target.value })}
            >
              {Object.entries(VOTE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            {canWrite && (
              <div className="asm-agenda-actions">
                <button type="button" className="btn btn-outline" disabled={i === 0} onClick={() => move(i, -1)}><ChevronUp size={14} /></button>
                <button type="button" className="btn btn-outline" disabled={i === agenda.length - 1} onClick={() => move(i, 1)}><ChevronDown size={14} /></button>
                <button type="button" className="btn btn-outline" onClick={() => remove(i)}><Trash2 size={14} /></button>
              </div>
            )}
          </div>
          <div className="asm-agenda-meta">
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
    </div>
  );
}

function printAssembly(kind) {
  document.body.classList.add('printing-asamblea');
  document.body.dataset.asmPrint = kind;
  const done = () => {
    document.body.classList.remove('printing-asamblea');
    delete document.body.dataset.asmPrint;
    window.removeEventListener('afterprint', done);
  };
  window.addEventListener('afterprint', done);
  window.print();
  setTimeout(done, 1500);
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
            Convocatorias, quórum, votaciones y actas según la normativa de {rules.jurisdiction || 'tu condominio'}.
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

      <div className="tabs" style={{ marginBottom: 14 }}>
        {TABS.map(([k, l]) => (
          <button key={k} className={`tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-400)' }}>Cargando asambleas…</div>
      ) : shown.length === 0 ? (
        <div className="card" style={{ padding: 36, textAlign: 'center' }}>
          <Vote size={28} style={{ color: 'var(--teal-600)', marginBottom: 10 }} />
          <h3 style={{ margin: '0 0 8px' }}>
            {tab === 'convocatorias' && 'Sin convocatorias'}
            {tab === 'reuniones' && 'No hay reuniones pendientes'}
            {tab === 'minutas' && 'Sin minutas en curso'}
            {tab === 'historial' && 'Aún no hay historial'}
          </h3>
          <p style={{ color: 'var(--ink-400)', fontSize: 13, maxWidth: 480, margin: '0 auto' }}>
            {tab === 'convocatorias' && 'Crea una asamblea, arma el orden del día a mano o con presupuestos y proyectos de Planeación, y emite la convocatoria con el plazo legal.'}
            {tab === 'reuniones' && 'Cuando una convocatoria esté vigente, aquí tomas asistencia, validas quórum e instalas la mesa de debates.'}
            {tab === 'minutas' && 'Redacta el acta, registra votaciones, fírmala y, si aplica, protocolízala ante notario.'}
            {tab === 'historial' && 'Las asambleas cerradas o canceladas quedan archivadas con su convocatoria, lista y acuerdos.'}
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
        ...form,
        first_call_at: form.first_call_at || null,
        notice_days: Number(form.notice_days) || rules.notice_days_ordinary || 10,
        agenda: form.agenda.filter(i => i.title?.trim()),
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
              <input className="field-input" value={form.location} disabled={!canWrite} onChange={e => set('location', e.target.value)} placeholder="Salón de usos múltiples / Zoom" />
            </div>
          </div>
          <div className="field">
            <div className="field-label">Quién convoca</div>
            <input className="field-input" value={form.issued_by_name} disabled={!canWrite} onChange={e => set('issued_by_name', e.target.value)} placeholder="Administrador / comité / porcentaje de condóminos" />
          </div>
          <AgendaBuilder
            agenda={form.agenda}
            catalog={ctx?.catalog}
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

function AssemblyDetail({ tenantId, assembly, ctx, canWrite, tabHint, onClose, onRefresh }) {
  const [inner, setInner] = useState(tabHint === 'historial' ? 'minuta' : tabHint === 'minutas' ? 'minuta' : tabHint === 'reuniones' ? 'reunion' : 'convocatoria');
  const [editing, setEditing] = useState(false);
  const [mesa, setMesa] = useState({ president_name: assembly.president_name || '', secretary_name: assembly.secretary_name || '' });
  const [minute, setMinute] = useState(assembly.minute_body || '');
  const [notary, setNotary] = useState({ notary_name: assembly.notary_name || '', notary_folio: assembly.notary_folio || '' });
  const [fileKind, setFileKind] = useState('evidencia');
  const [votes, setVotes] = useState({});
  const q = assembly.quorum || {};
  const rules = assembly.legal_snapshot || ctx?.rules || {};
  const locked = ['cerrada', 'cancelada'].includes(assembly.status);

  useEffect(() => {
    setMesa({ president_name: assembly.president_name || '', secretary_name: assembly.secretary_name || '' });
    setMinute(assembly.minute_body || '');
    setNotary({ notary_name: assembly.notary_name || '', notary_folio: assembly.notary_folio || '' });
  }, [assembly.id, assembly.updated_at]);

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
          <div className="tabs" style={{ marginBottom: 14 }}>
            {[['convocatoria', 'Convocatoria'], ['reunion', 'Reunión'], ['minuta', 'Minuta'], ['archivos', 'Archivos']].map(([k, l]) => (
              <button key={k} className={`tab ${inner === k ? 'active' : ''}`} onClick={() => setInner(k)}>{l}</button>
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
                    <strong>{i.title}</strong> · {VOTE[i.vote_type]}
                    {i.result !== 'pendiente' && ` · ${RESULT[i.result]}`}
                    {i.source_kind && i.source_kind !== 'manual' && (
                      <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>
                        {SOURCE[i.source_kind]}: {i.source_label || i.title}
                        {i.apply_on_approve ? ' · Al votar se actualizará el módulo (admin/tesorero)' : ' · Solo constancia en acta'}
                      </div>
                    )}
                  </li>
                ))}
              </ol>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
                <button className="btn btn-outline" onClick={() => printAssembly('convocatoria')}><Printer size={14} /> Imprimir convocatoria</button>
                {canWrite && assembly.status === 'borrador' && (
                  <>
                    <button className="btn btn-outline" onClick={() => setEditing(true)}><Pencil size={14} /> Editar</button>
                    <button className="btn btn-primary" onClick={publish}><Send size={14} /> Emitir convocatoria</button>
                  </>
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

          {inner === 'reunion' && (
            <>
              <div className="asm-rules-grid">
                <div><span style={{ fontSize: 11, color: 'var(--ink-400)' }}>Asistencia</span><strong>{q.present || 0}/{q.total || 0}</strong></div>
                <div><span style={{ fontSize: 11, color: 'var(--ink-400)' }}>Quórum actual</span><strong>{q.present_pct || 0}%</strong></div>
                <div><span style={{ fontSize: 11, color: 'var(--ink-400)' }}>Requerido</span><strong>{q.required_pct || 0}%</strong></div>
                <div><span style={{ fontSize: 11, color: 'var(--ink-400)' }}>Estado</span><strong>{q.met ? 'Hay quórum' : 'Sin quórum'}</strong></div>
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
                  <h4 style={{ fontSize: 14, margin: '16px 0 8px' }}>Votaciones</h4>
                  {(assembly.agenda || []).map(item => {
                    const v = votes[item.id] || { votes_for: item.votes_for, votes_against: item.votes_against, votes_abstain: item.votes_abstain };
                    return (
                      <div key={item.id} className="card" style={{ padding: 12, marginBottom: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                          <div>
                            <strong>{item.title}</strong>
                            <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>{VOTE[item.vote_type]} · {RESULT[item.result]}</div>
                            <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                              <SourceChip kind={item.source_kind} label={item.source_label} />
                              {item.apply_on_approve && <span className="asm-agenda-note">Actualiza el módulo al votar</span>}
                            </div>
                            {item.source_meta && (item.source_meta.year || item.source_meta.budget_amount || item.source_meta.period) && (
                              <div style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: 4 }}>
                                {item.source_meta.year ? `Año ${item.source_meta.year}` : ''}
                                {item.source_meta.expense ? ` · Gastos ${money(item.source_meta.expense)}` : ''}
                                {item.source_meta.budget_amount ? ` · ${money(item.source_meta.budget_amount)}` : ''}
                                {item.source_meta.period ? ` · ${item.source_meta.period}` : ''}
                                {item.source_meta.status ? ` · ${BUDGET_ST[item.source_meta.status] || PROJECT_ST[item.source_meta.status] || item.source_meta.status}` : ''}
                              </div>
                            )}
                            {item.applied_notes && (
                              <div style={{ fontSize: 12, marginTop: 4, color: item.applied_status === 'error' ? 'var(--coral-600)' : 'var(--ink-500)' }}>
                                {APPLY[item.applied_status] || item.applied_status}: {item.applied_notes}
                              </div>
                            )}
                          </div>
                        </div>
                        {canWrite && (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 8, marginTop: 8 }}>
                            <input className="field-input" type="number" min="0" placeholder="A favor" value={v.votes_for} onChange={e => setVotes(s => ({ ...s, [item.id]: { ...v, votes_for: e.target.value } }))} />
                            <input className="field-input" type="number" min="0" placeholder="En contra" value={v.votes_against} onChange={e => setVotes(s => ({ ...s, [item.id]: { ...v, votes_against: e.target.value } }))} />
                            <input className="field-input" type="number" min="0" placeholder="Abstenciones" value={v.votes_abstain} onChange={e => setVotes(s => ({ ...s, [item.id]: { ...v, votes_abstain: e.target.value } }))} />
                            <button className="btn btn-primary" onClick={async () => {
                              await asambleasAPI.vote(tenantId, assembly.id, item.id, v);
                              toast.success('Votación registrada');
                              onRefresh();
                            }}><Check size={14} /></button>
                          </div>
                        )}
                        {canWrite && item.apply_on_approve && ['aprobado', 'rechazado'].includes(item.result) && ['pendiente', 'error'].includes(item.applied_status) && (
                          <button
                            className="btn btn-outline btn-sm"
                            style={{ marginTop: 8 }}
                            onClick={async () => {
                              try {
                                await asambleasAPI.applyItem(tenantId, assembly.id, item.id);
                                toast.success('Acuerdo aplicado al módulo');
                                onRefresh();
                              } catch (e) {
                                toast.error(errMsg(e, 'No se pudo aplicar el acuerdo'));
                              }
                            }}
                          >
                            Aplicar al módulo
                          </button>
                        )}
                      </div>
                    );
                  })}
                </>
              )}
            </>
          )}

          {inner === 'minuta' && (
            <>
              <textarea
                className="field-input"
                rows={10}
                value={minute}
                disabled={!canWrite || (locked && assembly.minute_status !== 'borrador')}
                onChange={e => setMinute(e.target.value)}
                placeholder="Redacta el acta: asistencia, quórum, acuerdos y firmas…"
              />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, margin: '10px 0' }}>
                <input className="field-input" placeholder="Notario (si se protocoliza)" disabled={!canWrite} value={notary.notary_name} onChange={e => setNotary(n => ({ ...n, notary_name: e.target.value }))} />
                <input className="field-input" placeholder="Folio / escritura" disabled={!canWrite} value={notary.notary_folio} onChange={e => setNotary(n => ({ ...n, notary_folio: e.target.value }))} />
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {canWrite && assembly.status === 'en_curso' && (
                  <>
                    <button className="btn btn-outline" onClick={async () => {
                      await asambleasAPI.saveMinute(tenantId, assembly.id, { minute_body: minute, ...notary });
                      toast.success('Minuta guardada');
                      onRefresh();
                    }}>Guardar acta</button>
                    <button className="btn btn-outline" onClick={async () => {
                      await asambleasAPI.saveMinute(tenantId, assembly.id, { minute_body: minute, ...notary });
                      await asambleasAPI.signMinute(tenantId, assembly.id);
                      toast.success('Acta firmada');
                      onRefresh();
                    }}><Check size={14} /> Firmar acta</button>
                    <button className="btn btn-primary" onClick={async () => {
                      await asambleasAPI.saveMinute(tenantId, assembly.id, { minute_body: minute, ...notary });
                      await asambleasAPI.close(tenantId, assembly.id);
                      toast.success('Asamblea cerrada');
                      onRefresh();
                    }}><Landmark size={14} /> Cerrar asamblea</button>
                  </>
                )}
                {canWrite && assembly.minute_status === 'firmada' && (
                  <button className="btn btn-outline" onClick={async () => {
                    await asambleasAPI.protocolize(tenantId, assembly.id, notary);
                    toast.success('Acta protocolizada');
                    onRefresh();
                  }}>Marcar protocolizada</button>
                )}
                <button className="btn btn-outline" onClick={() => printAssembly('minuta')}><Printer size={14} /> Imprimir minuta</button>
              </div>
              <p style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: 10 }}>
                Presidente: {assembly.president_name || '—'} · Secretario: {assembly.secretary_name || '—'} ·
                Estatus del acta: {assembly.minute_status}
                {assembly.protocolized ? ` · Notario ${assembly.notary_name || ''} ${assembly.notary_folio || ''}` : ''}
              </p>
            </>
          )}

          {inner === 'archivos' && (
            <>
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
            </>
          )}

          <AssemblyPrintBlock assembly={assembly} ctx={ctx} />
        </div>
        <div className="modal-foot">
          <button className="btn btn-outline" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}

function AssemblyPrintBlock({ assembly, ctx }) {
  const rules = assembly.legal_snapshot || ctx?.rules || {};
  return (
    <div className="asm-print" style={{ padding: 24, fontFamily: 'Georgia, serif', color: '#1c1917' }}>
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{ctx?.name || 'Condominio'}</div>
        <h2 style={{ margin: '6px 0' }}>{assembly.title}</h2>
        <div>{KIND[assembly.kind]} · {rules.jurisdiction}</div>
      </div>
      <p><strong>Convocatoria:</strong> {fmtWhen(assembly.first_call_at)} — {assembly.location}</p>
      <p><strong>2ª convocatoria:</strong> {fmtWhen(assembly.second_call_at)}</p>
      <p><strong>Quien convoca:</strong> {assembly.issued_by_name || 'Administración'}</p>
      <h3>Orden del día</h3>
      <ol>
        {(assembly.agenda || []).map(i => (
          <li key={i.id}>
            {i.title} ({VOTE[i.vote_type]})
            {i.source_kind && i.source_kind !== 'manual' ? ` — ${SOURCE[i.source_kind]}: ${i.source_label || ''}` : ''}
            {i.result !== 'pendiente' ? ` — ${RESULT[i.result]}` : ''}
            {i.applied_notes ? ` — ${i.applied_notes}` : ''}
          </li>
        ))}
      </ol>
      {assembly.minute_body && (
        <>
          <h3>Acta</h3>
          <div style={{ whiteSpace: 'pre-wrap' }}>{assembly.minute_body}</div>
          <p>Presidente: {assembly.president_name || '______________'} · Secretario: {assembly.secretary_name || '______________'}</p>
        </>
      )}
      <p style={{ fontSize: 11, marginTop: 24, color: '#78716c' }}>{rules.law}. {rules.disclaimer}</p>
    </div>
  );
}