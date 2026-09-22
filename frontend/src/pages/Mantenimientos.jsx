import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { mantenimientosAPI, api } from '../api/client';
import ProviderSelect from '../components/providers/ProviderSelect';
import toast from 'react-hot-toast';
import {
  Plus, X, Pencil, Trash2, Wrench, FileText, Download, Upload, Eye, Calendar,
} from 'lucide-react';

const TABS = [
  ['preventivo', 'Preventivos'],
  ['correctivo', 'Correctivos'],
];
const STATUS = {
  planeado: { label: 'Planeado', color: 'var(--ink-500)', bg: 'var(--sand-50)' },
  en_curso: { label: 'En curso', color: 'var(--teal-700)', bg: 'var(--teal-50)' },
  realizado: { label: 'Realizado', color: 'var(--blue-700)', bg: 'var(--blue-50)' },
  cancelado: { label: 'Cancelado', color: 'var(--coral-600)', bg: 'var(--coral-50)' },
};
const PRIORITY = { baja: 'Baja', media: 'Media', alta: 'Alta', urgente: 'Urgente' };
const FREQ = {
  unica: 'Única', semanal: 'Semanal', mensual: 'Mensual',
  trimestral: 'Trimestral', semestral: 'Semestral', anual: 'Anual',
};
const EV_KIND = { antes: 'Antes', despues: 'Después', otro: 'Otro' };

function errMsg(e, fallback) {
  const d = e?.response?.data?.detail;
  if (typeof d === 'string') return d;
  return fallback;
}

function Pill({ value }) {
  const m = STATUS[value] || { label: value, color: 'var(--ink-500)', bg: 'var(--sand-50)' };
  return (
    <span className="proj-chip" style={{ color: m.color, background: m.bg }}>{m.label}</span>
  );
}

function fmtDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function money(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v === 0) return '';
  return v.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

async function downloadBlob(res, filename) {
  const blob = new Blob([res.data], { type: 'application/pdf' });
  if (blob.size < 80) {
    toast.error('No se pudo generar el PDF');
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
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

function emptyForm(kind) {
  return {
    kind,
    status: 'planeado',
    priority: kind === 'correctivo' ? 'alta' : 'media',
    title: '',
    description: '',
    work_notes: '',
    area_id: '',
    area_name: '',
    performed_by: '',
    provider: null,
    vendor_name: '',
    scheduled_date: '',
    performed_date: '',
    next_due_date: '',
    frequency: 'unica',
    cost: '',
  };
}

export default function Mantenimientos() {
  const { tenantId, isReadOnly, role } = useAuth();
  const canWrite = !isReadOnly && role !== 'vecino' && role !== 'vigilante';
  const [tab, setTab] = useState('preventivo');
  const [ctx, setCtx] = useState(null);
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [detail, setDetail] = useState(null);
  const [editing, setEditing] = useState(null);

  const loadCtx = () => {
    if (!tenantId) return;
    mantenimientosAPI.context(tenantId).then(r => setCtx(r.data)).catch(() => {});
  };

  const loadList = () => {
    if (!tenantId) return;
    setLoading(true);
    const params = { kind: tab };
    if (statusFilter) params.status = statusFilter;
    mantenimientosAPI.list(tenantId, params)
      .then(r => setList(Array.isArray(r.data) ? r.data : (r.data?.results || [])))
      .catch(() => toast.error('No se pudieron cargar los mantenimientos'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadCtx(); }, [tenantId]);
  useEffect(() => { loadList(); }, [tenantId, tab, statusFilter]);

  const openDetail = async (id) => {
    try {
      const r = await mantenimientosAPI.get(tenantId, id);
      setDetail(r.data);
    } catch {
      toast.error('No se pudo abrir el trabajo');
    }
  };

  const printHistory = async () => {
    try {
      const r = await mantenimientosAPI.printReport(tenantId, { kind: tab });
      await downloadBlob(r, `Historial_mantenimientos_${tab}.pdf`);
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo generar el historial'));
    }
  };

  const write = canWrite && (ctx?.can_write !== false);

  return (
    <div className="content-fade">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', color: 'var(--teal-600)', textTransform: 'uppercase' }}>
            Condominio
          </div>
          <h2 style={{ margin: '4px 0 0', fontSize: 22 }}>Mantenimientos</h2>
          <p style={{ color: 'var(--ink-400)', fontSize: 13, marginTop: 4 }}>
            Planea y documenta trabajos preventivos y correctivos. El historial queda con evidencias de antes y después.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-outline" onClick={printHistory}>
            <FileText size={14} /> Historial PDF
          </button>
          {write && (
            <button className="btn btn-primary" onClick={() => setEditing(emptyForm(tab))}>
              <Plus size={14} /> Nueva planeación
            </button>
          )}
        </div>
      </div>

      <div className="tabs" style={{ marginBottom: 8 }}>
        {TABS.map(([k, l]) => (
          <button key={k} className={`tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>
            {l}
            {ctx?.counts?.[k] != null && <span style={{ marginLeft: 6, opacity: 0.65 }}>{ctx.counts[k]}</span>}
          </button>
        ))}
      </div>
      <p className="asm-tab-help">
        {tab === 'preventivo'
          ? 'Preventivos: trabajos programados para conservar áreas e instalaciones (limpieza, revisión, servicio periódico).'
          : 'Correctivos: atiende fallas o daños ya ocurridos. Documenta el hallazgo, quién lo repara y las evidencias.'}
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <select className="field-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ maxWidth: 200 }}>
          <option value="">Todos los estatus</option>
          {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-400)' }}>Cargando trabajos…</div>
      ) : list.length === 0 ? (
        <div className="card" style={{ padding: 36, textAlign: 'center' }}>
          <Wrench size={28} style={{ color: 'var(--teal-600)', marginBottom: 10 }} />
          <h3 style={{ margin: '0 0 8px' }}>
            {tab === 'preventivo' ? 'Sin mantenimientos preventivos' : 'Sin mantenimientos correctivos'}
          </h3>
          <p style={{ color: 'var(--ink-400)', fontSize: 13, maxWidth: 460, margin: '0 auto' }}>
            Crea una planeación, elige o escribe el área, indica quién lo realiza y, al concluir, adjunta evidencias de antes y después.
          </p>
        </div>
      ) : (
        <div className="asm-list">
          {list.map(w => (
            <button key={w.id} className="asm-row" onClick={() => openDetail(w.id)}>
              <div className="asm-row-top">
                <div>
                  <div style={{ fontWeight: 700 }}>{w.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: 4 }}>
                    {w.area_name || 'Sin área'}
                    {w.performed_by ? ` · ${w.performed_by}` : ''}
                    {` · Prog. ${fmtDate(w.scheduled_date)}`}
                    {w.performed_date ? ` · Realizado ${fmtDate(w.performed_date)}` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <Pill value={w.status} />
                  {w.priority === 'urgente' || w.priority === 'alta' ? (
                    <span className="proj-chip">{PRIORITY[w.priority]}</span>
                  ) : null}
                  {w.evidence_count > 0 && <span className="proj-chip">{w.evidence_count} evidencia(s)</span>}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {editing && (
        <WorkForm
          ctx={ctx}
          canWrite={write}
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={(id) => {
            setEditing(null);
            loadList();
            loadCtx();
            if (id) openDetail(id);
          }}
        />
      )}

      {detail && (
        <WorkDetail
          tenantId={tenantId}
          work={detail}
          ctx={ctx}
          canWrite={write}
          onClose={() => { setDetail(null); loadList(); loadCtx(); }}
          onEdit={() => { setEditing(detail); setDetail(null); }}
          onRefresh={() => { openDetail(detail.id); loadList(); loadCtx(); }}
        />
      )}
    </div>
  );
}

function WorkForm({ ctx, canWrite, initial, onClose, onSaved }) {
  const { tenantId } = useAuth();
  const areas = ctx?.common_areas || [];
  const [form, setForm] = useState(() => ({
    ...emptyForm(initial.kind || 'preventivo'),
    ...initial,
    scheduled_date: initial.scheduled_date || '',
    performed_date: initial.performed_date || '',
    next_due_date: initial.next_due_date || '',
    cost: initial.cost ?? '',
    area_pick: initial.area_id || (initial.area_name && !initial.area_id ? '__other' : ''),
  }));
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const pickArea = (value) => {
    if (value === '__other') {
      setForm(f => ({ ...f, area_pick: '__other', area_id: '', area_name: f.area_name }));
      return;
    }
    const area = areas.find(a => String(a.id) === String(value));
    setForm(f => ({
      ...f,
      area_pick: value,
      area_id: area?.id || '',
      area_name: area?.name || '',
    }));
  };

  const save = async () => {
    if (!form.title.trim()) return toast.error('Indica el título del trabajo');
    try {
      const payload = {
        kind: form.kind,
        status: form.status,
        priority: form.priority,
        title: form.title.trim(),
        description: form.description || '',
        work_notes: form.work_notes || '',
        area_id: form.area_pick === '__other' ? '' : (form.area_id || ''),
        area_name: form.area_name.trim(),
        performed_by: form.performed_by || '',
        provider: form.provider || null,
        vendor_name: form.vendor_name || '',
        scheduled_date: form.scheduled_date || null,
        performed_date: form.performed_date || null,
        next_due_date: form.next_due_date || null,
        frequency: form.kind === 'preventivo' ? (form.frequency || 'unica') : 'unica',
        cost: form.cost === '' || form.cost == null ? null : Number(form.cost),
      };
      if (initial.id) {
        await mantenimientosAPI.update(tenantId, initial.id, payload);
        toast.success('Trabajo actualizado');
        onSaved(initial.id);
      } else {
        const r = await mantenimientosAPI.create(tenantId, payload);
        toast.success('Planeación registrada');
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
          <h3>{initial.id ? 'Editar trabajo' : 'Nueva planeación'}</h3>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body" style={{ display: 'grid', gap: 12 }}>
          <p className="asm-agenda-hint" style={{ margin: 0 }}>
            {form.kind === 'preventivo'
              ? 'Programa el servicio, el área y quién lo ejecuta. Al concluir, documenta lo hecho y adjunta evidencias.'
              : 'Describe la falla, el área afectada y quién la atiende. Las fotos de antes y después cierran el historial.'}
          </p>
          <div className="field">
            <div className="field-label">Título</div>
            <input className="field-input" value={form.title} disabled={!canWrite} onChange={e => set('title', e.target.value)} placeholder="Ej. Servicio de bombas del cisterna" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <div className="field">
              <div className="field-label">Tipo</div>
              <select className="field-select" value={form.kind} disabled={!canWrite} onChange={e => set('kind', e.target.value)}>
                <option value="preventivo">Preventivo</option>
                <option value="correctivo">Correctivo</option>
              </select>
            </div>
            <div className="field">
              <div className="field-label">Estatus</div>
              <select className="field-select" value={form.status} disabled={!canWrite} onChange={e => set('status', e.target.value)}>
                {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div className="field">
              <div className="field-label">Prioridad</div>
              <select className="field-select" value={form.priority} disabled={!canWrite} onChange={e => set('priority', e.target.value)}>
                {Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
          <div className="field">
            <div className="field-label">Área común o lugar de trabajo</div>
            <select className="field-select" value={form.area_pick} disabled={!canWrite} onChange={e => pickArea(e.target.value)}>
              <option value="">Elegir área común…</option>
              {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              <option value="__other">Otra (escribir)</option>
            </select>
            {(form.area_pick === '__other' || !form.area_pick) && (
              <input
                className="field-input"
                style={{ marginTop: 8 }}
                value={form.area_name}
                disabled={!canWrite}
                placeholder="Escribe el área, zona o equipo"
                onChange={e => set('area_name', e.target.value)}
              />
            )}
          </div>
          <div className="field">
            <div className="field-label">Planeación del trabajo</div>
            <textarea className="field-input" rows={3} value={form.description} disabled={!canWrite} onChange={e => set('description', e.target.value)} placeholder="Qué se va a hacer, materiales, alcance…" />
          </div>
          <div className="field">
            <div className="field-label">Quién lo realiza</div>
            <input className="field-input" value={form.performed_by} disabled={!canWrite} onChange={e => set('performed_by', e.target.value)} placeholder="Personal interno o nombre" />
          </div>
          <ProviderSelect
            tenantId={tenantId}
            moduleKey="mantenimientos"
            providerId={form.provider}
            name={form.vendor_name}
            rfc=""
            showRfc={false}
            disabled={!canWrite}
            onChange={({ provider, name }) => setForm(f => ({
              ...f,
              provider: provider || null,
              vendor_name: name ?? f.vendor_name,
            }))}
          />
          <div style={{ display: 'grid', gridTemplateColumns: form.kind === 'preventivo' ? '1fr 1fr 1fr' : '1fr 1fr', gap: 10 }}>
            <div className="field">
              <div className="field-label">Fecha programada</div>
              <input className="field-input" type="date" value={form.scheduled_date || ''} disabled={!canWrite} onChange={e => set('scheduled_date', e.target.value)} />
            </div>
            <div className="field">
              <div className="field-label">Fecha de realización</div>
              <input className="field-input" type="date" value={form.performed_date || ''} disabled={!canWrite} onChange={e => set('performed_date', e.target.value)} />
            </div>
            {form.kind === 'preventivo' && (
              <div className="field">
                <div className="field-label">Periodicidad</div>
                <select className="field-select" value={form.frequency} disabled={!canWrite} onChange={e => set('frequency', e.target.value)}>
                  {Object.entries(FREQ).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            )}
          </div>
          {form.kind === 'preventivo' && form.frequency !== 'unica' && (
            <div className="field">
              <div className="field-label">Próxima fecha</div>
              <input className="field-input" type="date" value={form.next_due_date || ''} disabled={!canWrite} onChange={e => set('next_due_date', e.target.value)} />
            </div>
          )}
          <div className="field">
            <div className="field-label">Costo (opcional)</div>
            <input className="field-input" type="number" min="0" step="0.01" value={form.cost} disabled={!canWrite} onChange={e => set('cost', e.target.value)} />
          </div>
          <div className="field">
            <div className="field-label">Documentación de lo realizado</div>
            <textarea className="field-input" rows={4} value={form.work_notes} disabled={!canWrite} onChange={e => set('work_notes', e.target.value)} placeholder="Qué se hizo, hallazgos, pendientes…" />
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn btn-outline" onClick={onClose}>Cancelar</button>
          {canWrite && <button className="btn btn-primary" onClick={save}>Guardar</button>}
        </div>
      </div>
    </div>
  );
}

function WorkDetail({ tenantId, work, ctx, canWrite, onClose, onEdit, onRefresh }) {
  const [evKind, setEvKind] = useState('antes');
  const [evNotes, setEvNotes] = useState('');
  const locked = work.status === 'cancelado';

  const printWork = async () => {
    try {
      const r = await mantenimientosAPI.printDoc(tenantId, work.id);
      await downloadBlob(r, `Mantenimiento_${work.title}.pdf`);
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo generar el PDF'));
    }
  };

  const setStatus = async (status) => {
    try {
      const extra = status === 'realizado' && !work.performed_date
        ? { performed_date: new Date().toISOString().slice(0, 10) }
        : {};
      await mantenimientosAPI.update(tenantId, work.id, { status, ...extra });
      toast.success(STATUS[status]?.label || 'Actualizado');
      onRefresh();
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo actualizar'));
    }
  };

  const before = (work.evidences || []).filter(e => e.kind === 'antes');
  const after = (work.evidences || []).filter(e => e.kind === 'despues');
  const other = (work.evidences || []).filter(e => e.kind === 'otro');

  return (
    <div className="modal-bg open" onClick={onClose}>
      <div className="modal xl" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{work.title}</h3>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body" style={{ display: 'grid', gap: 14 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Pill value={work.status} />
            <span className="proj-chip">{work.kind === 'preventivo' ? 'Preventivo' : 'Correctivo'}</span>
            <span className="proj-chip">{PRIORITY[work.priority]}</span>
          </div>
          <div className="asm-rules-grid">
            <div><span style={{ fontSize: 11, color: 'var(--ink-400)' }}>Área</span><strong>{work.area_name || '—'}</strong></div>
            <div><span style={{ fontSize: 11, color: 'var(--ink-400)' }}>Quién lo realiza</span><strong>{work.performed_by || '—'}</strong></div>
            <div><span style={{ fontSize: 11, color: 'var(--ink-400)' }}>Proveedor</span><strong>{work.vendor_name || '—'}</strong></div>
            <div><span style={{ fontSize: 11, color: 'var(--ink-400)' }}>Programado</span><strong>{fmtDate(work.scheduled_date)}</strong></div>
            <div><span style={{ fontSize: 11, color: 'var(--ink-400)' }}>Realizado</span><strong>{fmtDate(work.performed_date)}</strong></div>
            {work.kind === 'preventivo' && (
              <div><span style={{ fontSize: 11, color: 'var(--ink-400)' }}>Periodicidad</span><strong>{FREQ[work.frequency] || work.frequency}</strong></div>
            )}
            {money(work.cost) && (
              <div><span style={{ fontSize: 11, color: 'var(--ink-400)' }}>Costo</span><strong>{money(work.cost)}</strong></div>
            )}
          </div>
          {work.description && (
            <div>
              <h4 style={{ fontSize: 13, margin: '0 0 6px' }}>Planeación</h4>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-600)', whiteSpace: 'pre-wrap' }}>{work.description}</p>
            </div>
          )}
          {work.work_notes && (
            <div>
              <h4 style={{ fontSize: 13, margin: '0 0 6px' }}>Documentación</h4>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-600)', whiteSpace: 'pre-wrap' }}>{work.work_notes}</p>
            </div>
          )}

          <EvidenceBlock title="Evidencias de antes" rows={before} canWrite={canWrite && !locked} tenantId={tenantId} workId={work.id} onRefresh={onRefresh} />
          <EvidenceBlock title="Evidencias de después" rows={after} canWrite={canWrite && !locked} tenantId={tenantId} workId={work.id} onRefresh={onRefresh} />
          {other.length > 0 && (
            <EvidenceBlock title="Otros archivos" rows={other} canWrite={canWrite && !locked} tenantId={tenantId} workId={work.id} onRefresh={onRefresh} />
          )}

          {canWrite && !locked && (
            <div className="card" style={{ padding: 12 }}>
              <div className="field-label">Subir evidencia</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end' }}>
                <select className="field-select" value={evKind} onChange={e => setEvKind(e.target.value)}>
                  {Object.entries(EV_KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <input className="field-input" placeholder="Nota (opcional)" value={evNotes} onChange={e => setEvNotes(e.target.value)} />
                <label className="btn btn-primary" style={{ cursor: 'pointer' }}>
                  <Upload size={14} /> Subir
                  <input type="file" hidden accept="image/*,.pdf" onChange={async e => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (!file) return;
                    const fd = new FormData();
                    fd.append('file', file, file.name);
                    fd.append('kind', evKind);
                    fd.append('notes', evNotes);
                    try {
                      await mantenimientosAPI.uploadEvidence(tenantId, work.id, fd);
                      toast.success('Evidencia cargada');
                      setEvNotes('');
                      onRefresh();
                    } catch (err) {
                      toast.error(errMsg(err, 'No se pudo subir'));
                    }
                  }} />
                </label>
              </div>
            </div>
          )}
        </div>
        <div className="modal-foot" style={{ flexWrap: 'wrap' }}>
          <button className="btn btn-outline" onClick={printWork}><Eye size={14} /> Ver PDF</button>
          {canWrite && work.status === 'planeado' && (
            <button className="btn btn-outline" onClick={() => setStatus('en_curso')}>Marcar en curso</button>
          )}
          {canWrite && ['planeado', 'en_curso'].includes(work.status) && (
            <button className="btn btn-primary" onClick={() => setStatus('realizado')}>Marcar realizado</button>
          )}
          {canWrite && !locked && (
            <button className="btn btn-outline" onClick={onEdit}><Pencil size={14} /> Editar</button>
          )}
          {canWrite && !locked && (
            <button className="btn btn-outline" onClick={() => setStatus('cancelado')}>Cancelar trabajo</button>
          )}
          {canWrite && work.status === 'planeado' && (
            <button className="btn btn-outline" onClick={async () => {
              if (!window.confirm('¿Eliminar esta planeación?')) return;
              await mantenimientosAPI.delete(tenantId, work.id);
              toast.success('Eliminado');
              onClose();
            }}><Trash2 size={14} /> Eliminar</button>
          )}
          <button className="btn btn-outline" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}

function EvidenceBlock({ title, rows, canWrite, tenantId, workId, onRefresh }) {
  if (!rows.length && !canWrite) return null;
  return (
    <div>
      <h4 style={{ fontSize: 13, margin: '0 0 8px' }}>{title}</h4>
      {rows.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--ink-400)', margin: 0 }}>Aún no hay archivos en este apartado.</p>
      ) : (
        <div className="proj-file-list">
          {rows.map(f => (
            <div key={f.id} className="proj-file-row">
              <Calendar size={14} />
              <span className="name">{f.original_name}</span>
              {f.notes && <span className="proj-chip">{f.notes}</span>}
              <button className="btn btn-outline btn-sm" onClick={() => downloadProtected(f.file_url, f.original_name)}>
                <Download size={12} />
              </button>
              {canWrite && (
                <button className="btn btn-outline btn-sm" onClick={async () => {
                  await mantenimientosAPI.deleteEvidence(tenantId, workId, f.id);
                  onRefresh();
                }}><Trash2 size={12} /></button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
