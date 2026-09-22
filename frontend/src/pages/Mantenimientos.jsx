import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { mantenimientosAPI, api } from '../api/client';
import ProviderSelect from '../components/providers/ProviderSelect';
import { todayPeriod, periodLabel, prevPeriod, nextPeriod } from '../utils/helpers';
import { useClosedPeriods } from '../hooks/useClosedPeriods';
import toast from 'react-hot-toast';
import {
  Plus, X, Pencil, Trash2, Wrench, FileText, Download, Upload, Eye,
  Calendar, MapPin, User, Image as ImageIcon, Check, ChevronLeft, ChevronRight,
  ShoppingBag, Lock,
} from 'lucide-react';

const TABS = [
  ['preventivo', 'Preventivos'],
  ['correctivo', 'Correctivos'],
];
const STATUS_FLOW = ['planeado', 'en_curso', 'realizado'];
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
const EV_KIND = { antes: 'Antes', durante: 'Durante', despues: 'Después', otro: 'Otro' };

const blobUrlCache = new Map();

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

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function money(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v === 0) return '';
  return v.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

function isImageFile(name, url) {
  const s = `${name || ''} ${url || ''}`.toLowerCase();
  return /\.(png|jpe?g|gif|webp|heic|bmp)(\?|$)/i.test(s);
}

function sortEvidences(rows) {
  return [...(rows || [])].sort((a, b) => {
    const da = String(a.captured_at || a.created_at || '');
    const db = String(b.captured_at || b.created_at || '');
    if (da !== db) return da.localeCompare(db);
    return String(a.id || '').localeCompare(String(b.id || ''));
  });
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

function ProtectedImage({ url, alt, className, onClick }) {
  const [src, setSrc] = useState('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!url) return undefined;
    let cancelled = false;
    (async () => {
      try {
        if (blobUrlCache.has(url)) {
          if (!cancelled) setSrc(blobUrlCache.get(url));
          return;
        }
        const r = await api.get(url, { responseType: 'blob' });
        const obj = URL.createObjectURL(r.data);
        blobUrlCache.set(url, obj);
        if (!cancelled) setSrc(obj);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => { cancelled = true; };
  }, [url]);

  if (failed) {
    return <div className="mnt-img-fallback">No se pudo cargar la imagen</div>;
  }
  if (!src) {
    return <div className="mnt-img-fallback">Cargando imagen…</div>;
  }
  return (
    <img
      src={src}
      alt={alt || ''}
      className={className}
      onClick={onClick}
    />
  );
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
    gasto_ids: [],
    period: todayPeriod(),
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
  const [period, setPeriod] = useState(todayPeriod());
  const { isPeriodClosed } = useClosedPeriods(tenantId);
  const periodClosed = isPeriodClosed(period);

  const loadCtx = () => {
    if (!tenantId) return;
    mantenimientosAPI.context(tenantId, { period }).then(r => setCtx(r.data)).catch(() => {});
  };

  const loadList = () => {
    if (!tenantId) return;
    setLoading(true);
    const params = { kind: tab, period };
    if (statusFilter) params.status = statusFilter;
    mantenimientosAPI.list(tenantId, params)
      .then(r => setList(Array.isArray(r.data) ? r.data : (r.data?.results || [])))
      .catch(() => toast.error('No se pudieron cargar los mantenimientos'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadCtx(); }, [tenantId, period]);
  useEffect(() => { loadList(); }, [tenantId, tab, statusFilter, period]);

  const openDetail = async (id) => {
    try {
      const r = await mantenimientosAPI.get(tenantId, id);
      setDetail(r.data);
      return r.data;
    } catch {
      toast.error('No se pudo abrir el trabajo');
      return null;
    }
  };

  const printHistory = async () => {
    try {
      const r = await mantenimientosAPI.printReport(tenantId, { period });
      await downloadBlob(r, `Historial_mantenimientos_${period}.pdf`);
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo generar el historial'));
    }
  };

  const write = canWrite && (ctx?.can_write !== false) && !periodClosed;
  const tabCounts = ctx?.by_kind?.[tab] || {};

  return (
    <div className="content-fade">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div className="period-nav">
          <button
            type="button"
            className="period-nav-btn"
            onClick={() => setPeriod(prevPeriod(period))}
            disabled={!!ctx?.operation_start_date && period <= ctx.operation_start_date}
          >
            <ChevronLeft size={16} />
          </button>
          <input
            type="month"
            className="period-month-select"
            style={{ fontSize: 15, fontWeight: 700 }}
            value={period}
            min={ctx?.operation_start_date || undefined}
            onChange={e => e.target.value && setPeriod(e.target.value)}
          />
          <button type="button" className="period-nav-btn" onClick={() => setPeriod(nextPeriod(period))}>
            <ChevronRight size={16} />
          </button>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {periodClosed && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '4px 12px', borderRadius: 20,
              background: 'var(--coral-50)', color: 'var(--coral-700)',
              fontSize: 12, fontWeight: 700, border: '1px solid var(--coral-100)',
            }}>
              <Lock size={11} /> Período cerrado
            </span>
          )}
          <button className="btn btn-outline" onClick={printHistory}>
            <FileText size={14} /> Historial PDF
          </button>
          {write && (
            <button className="btn btn-primary" onClick={() => setEditing({ ...emptyForm(tab), period })}>
              <Plus size={14} /> Nueva planeación
            </button>
          )}
        </div>
      </div>

      <div className="mnt-hero">
        <div>
          <div className="mnt-kicker">Condominio</div>
          <h2>Mantenimientos — {periodLabel(period)}</h2>
          <p>
            Los trabajos de este período del sistema. Si el período está abierto
            puedes planear, documentar y finalizar; si está cerrado no se puede
            crear, editar ni eliminar.
          </p>
        </div>
      </div>

      <ol className="mnt-howto">
        <li><span>1</span><strong>Planear</strong><small>Área, fecha y quién lo hace</small></li>
        <li><span>2</span><strong>Ejecutar</strong><small>Marca en curso o realizado</small></li>
        <li><span>3</span><strong>Evidencias</strong><small>Fotos y notas con su fecha</small></li>
        <li><span>4</span><strong>Reporte</strong><small>Revisa en pantalla y baja PDF</small></li>
      </ol>

      <div className="tabs" style={{ marginBottom: 8 }}>
        {TABS.map(([k, l]) => (
          <button key={k} className={`tab ${tab === k ? 'active' : ''}`} onClick={() => { setTab(k); setStatusFilter(''); }}>
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

      <div className="mnt-filters">
        <button
          type="button"
          className={`mnt-filter ${!statusFilter ? 'on' : ''}`}
          onClick={() => setStatusFilter('')}
        >
          Todos
          <em>{ctx?.counts?.[tab] ?? list.length}</em>
        </button>
        {Object.entries(STATUS).map(([k, v]) => (
          <button
            key={k}
            type="button"
            className={`mnt-filter ${statusFilter === k ? 'on' : ''}`}
            onClick={() => setStatusFilter(statusFilter === k ? '' : k)}
          >
            {v.label}
            {tabCounts[k] != null && <em>{tabCounts[k]}</em>}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="mnt-empty">Cargando trabajos…</div>
      ) : list.length === 0 ? (
        <div className="card mnt-empty">
          <Wrench size={28} />
          <h3>
            {tab === 'preventivo' ? 'Sin mantenimientos preventivos' : 'Sin mantenimientos correctivos'}
          </h3>
          <p>
            {periodClosed
              ? `El período ${periodLabel(period)} está cerrado. Solo puedes consultar y descargar el historial.`
              : statusFilter
                ? 'No hay trabajos con ese estatus. Prueba otro filtro o crea una planeación.'
                : 'Crea una planeación, elige el área, indica quién lo realiza y, al concluir, adjunta evidencias con la fecha en que se tomaron.'}
          </p>
          {write && !statusFilter && (
            <button className="btn btn-primary" onClick={() => setEditing({ ...emptyForm(tab), period })}>
              <Plus size={14} /> Nueva planeación
            </button>
          )}
        </div>
      ) : (
        <div className="mnt-list">
          {list.map(w => (
            <button key={w.id} type="button" className={`mnt-card mnt-card--${w.status}`} onClick={() => openDetail(w.id)}>
              <div className="mnt-card-main">
                <div className="mnt-card-title">{w.title}</div>
                <div className="mnt-card-meta">
                  <span><MapPin size={12} /> {w.area_name || 'Sin área'}</span>
                  <span><Calendar size={12} /> Prog. {fmtDate(w.scheduled_date)}</span>
                  {w.performed_date && <span><Check size={12} /> {fmtDate(w.performed_date)}</span>}
                  {w.performed_by && <span><User size={12} /> {w.performed_by}</span>}
                </div>
                <div className="mnt-mini-flow">
                  {STATUS_FLOW.map((st, i) => {
                    const idx = STATUS_FLOW.indexOf(w.status);
                    const done = w.status !== 'cancelado' && idx >= i;
                    const current = w.status === st;
                    return (
                      <span key={st} className={`mnt-mini-dot ${done ? 'done' : ''} ${current ? 'current' : ''}`}>
                        {STATUS[st].label}
                      </span>
                    );
                  })}
                  {w.status === 'cancelado' && <span className="mnt-mini-dot cancel">Cancelado</span>}
                </div>
              </div>
              <div className="mnt-card-side">
                <Pill value={w.status} />
                {(w.priority === 'urgente' || w.priority === 'alta') && (
                  <span className="proj-chip">{PRIORITY[w.priority]}</span>
                )}
                <span className="mnt-ev-count">
                  <ImageIcon size={12} /> {w.evidence_count || 0} evidencia{(w.evidence_count || 0) === 1 ? '' : 's'}
                </span>
                <span className="mnt-open-hint"><Eye size={13} /> Abrir ficha</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {editing && (
        <WorkForm
          ctx={ctx}
          canWrite={write}
          periodClosed={periodClosed}
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
          periodClosed={periodClosed || isPeriodClosed(detail.period)}
          onClose={() => { setDetail(null); loadList(); loadCtx(); }}
          onEdit={() => { setEditing(detail); setDetail(null); }}
          onRefresh={async () => { await openDetail(detail.id); loadList(); loadCtx(); }}
        />
      )}
    </div>
  );
}

function WorkForm({ ctx, canWrite, periodClosed, initial, onClose, onSaved }) {
  const { tenantId } = useAuth();
  const areas = ctx?.common_areas || [];
  const [gastoOptions, setGastoOptions] = useState([]);
  const [form, setForm] = useState(() => ({
    ...emptyForm(initial.kind || 'preventivo'),
    ...initial,
    scheduled_date: initial.scheduled_date || '',
    performed_date: initial.performed_date || '',
    next_due_date: initial.next_due_date || '',
    cost: initial.cost ?? '',
    period: initial.period || todayPeriod(),
    area_pick: initial.area_id || (initial.area_name && !initial.area_id ? '__other' : ''),
    gasto_ids: (initial.gastos || []).map(g => g.id).filter(Boolean).map(String),
  }));
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!tenantId) return;
    mantenimientosAPI.gastoOptions(tenantId, initial.id ? { work: initial.id } : {})
      .then(r => setGastoOptions(Array.isArray(r.data) ? r.data : []))
      .catch(() => setGastoOptions([]));
  }, [tenantId, initial.id]);

  const toggleGasto = (id) => {
    const key = String(id);
    setForm(f => {
      const has = (f.gasto_ids || []).map(String).includes(key);
      return {
        ...f,
        gasto_ids: has ? f.gasto_ids.filter(x => String(x) !== key) : [...(f.gasto_ids || []), key],
      };
    });
  };

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
    if (periodClosed) return toast.error('El período está cerrado y no acepta cambios');
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
        period: form.period || todayPeriod(),
        gasto_ids: (form.gasto_ids || []).map(String),
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
          <div>
            <h3>{initial.id ? 'Editar trabajo' : 'Nueva planeación'}</h3>
            <p className="mnt-modal-sub">
              {periodLabel(form.period)}
              {' · '}
              {form.kind === 'preventivo'
                ? 'Programa el servicio, el área y quién lo ejecuta.'
                : 'Describe la falla, el área afectada y quién la atiende.'}
            </p>
          </div>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body mnt-form">
          {periodClosed && (
            <p className="mnt-ev-empty">Este período está cerrado. No se pueden guardar cambios.</p>
          )}
          <section className="mnt-form-section">
            <h4>Qué se va a hacer</h4>
            <div className="field">
              <div className="field-label">Título</div>
              <input className="field-input" value={form.title} disabled={!canWrite} onChange={e => set('title', e.target.value)} placeholder="Ej. Servicio de bombas del cisterna" />
            </div>
            <div className="mnt-form-grid3">
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
              <div className="field-label">Planeación del trabajo</div>
              <textarea className="field-input" rows={3} value={form.description} disabled={!canWrite} onChange={e => set('description', e.target.value)} placeholder="Qué se va a hacer, materiales, alcance…" />
            </div>
          </section>

          <section className="mnt-form-section">
            <h4>Dónde y quién</h4>
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
          </section>

          <section className="mnt-form-section">
            <h4>Fechas y costo</h4>
            <div className={`mnt-form-grid${form.kind === 'preventivo' ? '3' : '2'}`}>
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
          </section>

          <section className="mnt-form-section">
            <h4>Gastos asociados</h4>
            <p className="mnt-modal-sub" style={{ margin: 0 }}>
              Relaciona registros del módulo de Gastos con este trabajo. También puedes ligarlos desde Gastos.
            </p>
            {gastoOptions.length === 0 ? (
              <p className="mnt-ev-empty">No hay gastos recientes para asociar.</p>
            ) : (
              <div className="mnt-gasto-pick">
                {gastoOptions.map(g => {
                  const checked = (form.gasto_ids || []).map(String).includes(String(g.id));
                  const other = g.maintenance_work && String(g.maintenance_work) !== String(initial.id || '');
                  return (
                    <label key={g.id} className={`mnt-gasto-item ${checked ? 'on' : ''}`}>
                      <input
                        type="checkbox"
                        disabled={!canWrite}
                        checked={checked}
                        onChange={() => toggleGasto(g.id)}
                      />
                      <span>
                        <strong>{g.field_label || 'Gasto'} · {money(g.amount) || g.amount}</strong>
                        <small>
                          {periodLabel(g.period) || g.period}
                          {g.gasto_date ? ` · ${fmtDate(g.gasto_date)}` : ''}
                          {g.provider_name ? ` · ${g.provider_name}` : ''}
                          {other && g.maintenance_work_title ? ` · Hoy ligado a: ${g.maintenance_work_title}` : ''}
                        </small>
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </section>

          <section className="mnt-form-section">
            <h4>Documentación de lo realizado</h4>
            <div className="field">
              <textarea className="field-input" rows={4} value={form.work_notes} disabled={!canWrite} onChange={e => set('work_notes', e.target.value)} placeholder="Qué se hizo, hallazgos, pendientes…" />
            </div>
          </section>
        </div>
        <div className="modal-foot">
          <button className="btn btn-outline" onClick={onClose}>Cancelar</button>
          {canWrite && !periodClosed && <button className="btn btn-primary" onClick={save}>Guardar</button>}
        </div>
      </div>
    </div>
  );
}

function WorkDetail({ tenantId, work, ctx, canWrite, periodClosed, onClose, onEdit, onRefresh }) {
  const fileRef = useRef(null);
  const timelineRef = useRef(null);
  const [evKind, setEvKind] = useState('antes');
  const [evNotes, setEvNotes] = useState('');
  const [evDate, setEvDate] = useState(todayISO);
  const [uploading, setUploading] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [pendingEvs, setPendingEvs] = useState([]);
  const locked = work.status === 'cancelado' || !!periodClosed;
  const serverEvs = work.evidences || [];
  const evidences = sortEvidences([
    ...serverEvs,
    ...pendingEvs.filter(ev => !serverEvs.some(s => String(s.id) === String(ev.id))),
  ]);

  useEffect(() => {
    setPendingEvs([]);
  }, [work.id]);

  const setStatus = async (status) => {
    if (!canWrite || locked) return;
    try {
      const extra = status === 'realizado' && !work.performed_date
        ? { performed_date: todayISO() }
        : {};
      await mantenimientosAPI.update(tenantId, work.id, { status, ...extra });
      toast.success(STATUS[status]?.label || 'Actualizado');
      onRefresh();
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo actualizar'));
    }
  };

  const uploadFiles = async (files) => {
    const list = Array.from(files || []).filter(Boolean);
    if (!list.length) return;
    if (!evDate) {
      toast.error('Indica la fecha de la evidencia');
      return;
    }
    setUploading(true);
    const created = [];
    try {
      for (const file of list) {
        const fd = new FormData();
        fd.append('file', file, file.name);
        fd.append('kind', evKind);
        fd.append('notes', evNotes);
        fd.append('captured_at', evDate);
        const r = await mantenimientosAPI.uploadEvidence(tenantId, work.id, fd);
        if (r?.data?.id) created.push(r.data);
      }
      if (!created.length) {
        toast.error('No se pudo registrar la evidencia');
        return;
      }
      setPendingEvs(prev => [...prev, ...created]);
      toast.success(created.length > 1 ? `${created.length} evidencias cargadas` : 'Evidencia cargada');
      setEvNotes('');
      await onRefresh();
      timelineRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      toast.error(errMsg(err, 'No se pudo subir'));
    } finally {
      setUploading(false);
    }
  };

  const currentIdx = STATUS_FLOW.indexOf(work.status);

  return (
    <div className="modal-bg open" onClick={onClose}>
      <div className="modal xl mnt-detail" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h3>{work.title}</h3>
            <p className="mnt-modal-sub">
              {work.kind === 'preventivo' ? 'Preventivo' : 'Correctivo'}
              {work.period ? ` · ${periodLabel(work.period)}` : ''}
              {work.area_name ? ` · ${work.area_name}` : ''}
            </p>
          </div>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body mnt-detail-body">
          {periodClosed && (
            <div className="mnt-ev-empty" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Lock size={14} /> Este período está cerrado. Solo consulta y descarga.
            </div>
          )}
          <div className="mnt-status-row">
            <div className="mnt-stepper" role="list">
              {STATUS_FLOW.map((st, i) => {
                const done = work.status !== 'cancelado' && currentIdx >= i;
                const current = work.status === st;
                return (
                  <button
                    key={st}
                    type="button"
                    role="listitem"
                    className={`mnt-step ${done ? 'done' : ''} ${current ? 'current' : ''}`}
                    disabled={!canWrite || locked}
                    onClick={() => setStatus(st)}
                  >
                    <span>{i + 1}</span>
                    <strong>{STATUS[st].label}</strong>
                    <small>
                      {st === 'planeado' && 'Programado'}
                      {st === 'en_curso' && 'En ejecución'}
                      {st === 'realizado' && 'Cerrado'}
                    </small>
                  </button>
                );
              })}
            </div>
            {work.status === 'cancelado' && <Pill value="cancelado" />}
          </div>

          <div className="mnt-meta-grid">
            <div><span>Período</span><strong>{work.period ? periodLabel(work.period) : '—'}</strong></div>
            <div><span>Área</span><strong>{work.area_name || '—'}</strong></div>
            <div><span>Quién lo realiza</span><strong>{work.performed_by || '—'}</strong></div>
            <div><span>Proveedor</span><strong>{work.vendor_name || '—'}</strong></div>
            <div><span>Programado</span><strong>{fmtDate(work.scheduled_date)}</strong></div>
            <div><span>Realizado</span><strong>{fmtDate(work.performed_date)}</strong></div>
            {work.kind === 'preventivo' && (
              <div><span>Periodicidad</span><strong>{FREQ[work.frequency] || work.frequency}</strong></div>
            )}
            {money(work.cost) && (
              <div><span>Costo</span><strong>{money(work.cost)}</strong></div>
            )}
            <div><span>Prioridad</span><strong>{PRIORITY[work.priority] || work.priority}</strong></div>
            {(work.gastos || []).length > 0 && (
              <div>
                <span>Gastos asociados</span>
                <strong>{(work.gastos || []).length} · {money(work.gastos_total) || '$0.00'}</strong>
              </div>
            )}
          </div>

          {work.description && (
            <section className="mnt-notes">
              <h4>Planeación</h4>
              <p>{work.description}</p>
            </section>
          )}
          {work.work_notes && (
            <section className="mnt-notes">
              <h4>Documentación de lo realizado</h4>
              <p>{work.work_notes}</p>
            </section>
          )}

          {(work.gastos || []).length > 0 && (
            <section className="mnt-notes">
              <h4><ShoppingBag size={13} style={{ marginRight: 6 }} />Gastos asociados</h4>
              <ul className="mnt-gasto-list">
                {(work.gastos || []).map(g => (
                  <li key={g.id}>
                    <strong>{g.field_label || 'Gasto'}</strong>
                    <span>{money(g.amount) || g.amount}</span>
                    <small>
                      {periodLabel(g.period) || g.period}
                      {g.gasto_date ? ` · ${fmtDate(g.gasto_date)}` : ''}
                      {g.provider_name ? ` · ${g.provider_name}` : ''}
                    </small>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="mnt-ev-section" ref={timelineRef}>
            <div className="mnt-ev-head">
              <h4>Línea de tiempo de evidencias</h4>
              <span>{evidences.length} archivo{evidences.length === 1 ? '' : 's'} · orden cronológico</span>
            </div>
            {evidences.length === 0 ? (
              <p className="mnt-ev-empty">Aún no hay fotos ni notas. Cárgalas con la fecha en que se tomaron, aunque subas el archivo después.</p>
            ) : (
              <div className="mnt-timeline">
                {evidences.map(ev => (
                  <article key={ev.id} className="mnt-tl-item">
                    <div className="mnt-tl-date">
                      <Calendar size={13} />
                      {fmtDate(ev.captured_at || ev.created_at)}
                    </div>
                    <div className="mnt-tl-card">
                      <div className="mnt-tl-top">
                        <span className={`mnt-kind mnt-kind--${ev.kind}`}>{EV_KIND[ev.kind] || ev.kind}</span>
                        <span className="mnt-tl-name">{ev.original_name}</span>
                        <div className="mnt-tl-actions">
                          <button className="btn btn-outline btn-sm" type="button" onClick={() => downloadProtected(ev.file_url, ev.original_name)}>
                            <Download size={12} />
                          </button>
                          {canWrite && !locked && (
                            <button
                              className="btn btn-outline btn-sm"
                              type="button"
                              onClick={async () => {
                                if (!window.confirm('¿Eliminar esta evidencia?')) return;
                                await mantenimientosAPI.deleteEvidence(tenantId, work.id, ev.id);
                                onRefresh();
                              }}
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="mnt-tl-who">
                        <User size={12} />
                        Registró {ev.uploaded_by_name || '—'}
                      </div>
                      {ev.notes && <p className="mnt-tl-notes">{ev.notes}</p>}
                      {isImageFile(ev.original_name, ev.file_url) ? (
                        <ProtectedImage url={ev.file_url} alt={ev.notes || ev.original_name} className="mnt-thumb" />
                      ) : (
                        <div className="mnt-file-chip"><FileText size={14} /> Archivo adjunto</div>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          {canWrite && !locked && (
            <section className="mnt-upload">
              <h4>Cargar evidencia</h4>
              <p>Si las fotos se toman un día y se suben después, elige la fecha real de la evidencia.</p>
              <div className="mnt-upload-grid">
                <div className="field">
                  <div className="field-label">Fecha de la evidencia</div>
                  <input className="field-input" type="date" value={evDate} max={todayISO()} onChange={e => setEvDate(e.target.value)} />
                </div>
                <div className="field">
                  <div className="field-label">Momento</div>
                  <select className="field-select" value={evKind} onChange={e => setEvKind(e.target.value)}>
                    {Object.entries(EV_KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div className="field mnt-upload-notes">
                  <div className="field-label">Nota (opcional)</div>
                  <input className="field-input" placeholder="Qué se ve o qué se hizo" value={evNotes} onChange={e => setEvNotes(e.target.value)} />
                </div>
              </div>
              <button
                type="button"
                className="btn btn-primary"
                disabled={uploading}
                style={{ alignSelf: 'flex-start' }}
                onClick={() => fileRef.current?.click()}
              >
                <Upload size={14} /> {uploading ? 'Subiendo…' : 'Elegir archivos'}
              </button>
              <input
                ref={fileRef}
                type="file"
                multiple
                accept="image/*,.pdf,.png,.jpg,.jpeg,.webp,.gif,.heic,.doc,.docx"
                disabled={uploading}
                style={{ display: 'none' }}
                onChange={async e => {
                  const files = Array.from(e.target.files || []);
                  e.target.value = '';
                  if (!files.length) return;
                  await uploadFiles(files);
                }}
              />
            </section>
          )}
        </div>
        <div className="modal-foot mnt-detail-foot">
          <div className="mnt-foot-main">
            <button className="btn btn-primary" onClick={() => setShowReport(true)}>
              <Eye size={14} /> Ver reporte
            </button>
            {canWrite && !locked && (
              <button className="btn btn-outline" onClick={onEdit}><Pencil size={14} /> Editar</button>
            )}
            <button className="btn btn-outline" onClick={onClose}>Cerrar</button>
          </div>
          {canWrite && !locked && (
            <div className="mnt-foot-danger">
              {work.status !== 'cancelado' && (
                <button className="btn btn-outline" onClick={() => setStatus('cancelado')}>Cancelar trabajo</button>
              )}
              {work.status === 'planeado' && (
                <button className="btn btn-outline" onClick={async () => {
                  if (!window.confirm('¿Eliminar esta planeación?')) return;
                  await mantenimientosAPI.delete(tenantId, work.id);
                  toast.success('Eliminado');
                  onClose();
                }}><Trash2 size={14} /> Eliminar</button>
              )}
            </div>
          )}
        </div>
      </div>

      {showReport && (
        <ReportPreview
          tenantName={ctx?.razon_social || ctx?.name || ''}
          work={work}
          evidences={evidences}
          onClose={() => setShowReport(false)}
          onDownload={async () => {
            try {
              const r = await mantenimientosAPI.printDoc(tenantId, work.id);
              await downloadBlob(r, `Mantenimiento_${work.title}.pdf`);
            } catch (e) {
              toast.error(errMsg(e, 'No se pudo generar el PDF'));
            }
          }}
        />
      )}
    </div>
  );
}

function ReportPreview({ tenantName, work, evidences, onClose, onDownload }) {
  const [lightbox, setLightbox] = useState(null);

  return (
    <div className="modal-bg open mnt-report-overlay" onClick={e => { e.stopPropagation(); onClose(); }}>
      <div className="modal mnt-report" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h3>Reporte de mantenimiento</h3>
            <p className="mnt-modal-sub">Revisa imágenes y notas en orden cronológico. Después puedes descargar el PDF.</p>
          </div>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body">
          <article className="mnt-paper">
            <header className="mnt-paper-head">
              <div className="mnt-paper-kicker">Historial de mantenimientos</div>
              <div className="mnt-paper-tenant">{tenantName || 'Condominio'}</div>
              <h2>{work.title}</h2>
              <div className="mnt-paper-pills">
                <span>{work.kind === 'preventivo' ? 'Preventivo' : 'Correctivo'}</span>
                <span>{STATUS[work.status]?.label || work.status}</span>
                {PRIORITY[work.priority] && <span>{PRIORITY[work.priority]}</span>}
              </div>
            </header>

            <dl className="mnt-paper-meta">
              <div><dt>Período</dt><dd>{work.period ? periodLabel(work.period) : '—'}</dd></div>
              <div><dt>Área</dt><dd>{work.area_name || '—'}</dd></div>
              <div><dt>Quién lo realiza</dt><dd>{work.performed_by || '—'}</dd></div>
              <div><dt>Proveedor</dt><dd>{work.vendor_name || '—'}</dd></div>
              <div><dt>Fecha programada</dt><dd>{fmtDate(work.scheduled_date)}</dd></div>
              <div><dt>Fecha de realización</dt><dd>{fmtDate(work.performed_date)}</dd></div>
              {work.kind === 'preventivo' && (
                <div><dt>Periodicidad</dt><dd>{FREQ[work.frequency] || work.frequency}</dd></div>
              )}
              {money(work.cost) && (
                <div><dt>Costo</dt><dd>{money(work.cost)}</dd></div>
              )}
              {(work.gastos || []).length > 0 && (
                <div>
                  <dt>Gastos asociados</dt>
                  <dd>{(work.gastos || []).length} · {money(work.gastos_total) || '$0.00'}</dd>
                </div>
              )}
            </dl>

            {work.description && (
              <section>
                <h3>Planeación del trabajo</h3>
                <p>{work.description}</p>
              </section>
            )}
            {work.work_notes && (
              <section>
                <h3>Documentación de lo realizado</h3>
                <p>{work.work_notes}</p>
              </section>
            )}
            {(work.gastos || []).length > 0 && (
              <section>
                <h3>Gastos asociados</h3>
                <ul className="mnt-gasto-list">
                  {(work.gastos || []).map(g => (
                    <li key={g.id}>
                      <strong>{g.field_label || 'Gasto'}</strong>
                      <span>{money(g.amount) || g.amount}</span>
                      <small>
                        {periodLabel(g.period) || g.period}
                        {g.gasto_date ? ` · ${fmtDate(g.gasto_date)}` : ''}
                        {g.provider_name ? ` · ${g.provider_name}` : ''}
                      </small>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section>
              <h3>Evidencias en orden cronológico</h3>
              {evidences.length === 0 ? (
                <p className="mnt-paper-muted">Este trabajo aún no tiene evidencias cargadas.</p>
              ) : evidences.map(ev => (
                <figure key={ev.id} className="mnt-paper-ev">
                  <figcaption>
                    <strong>{fmtDate(ev.captured_at || ev.created_at)}</strong>
                    {' · '}
                    {EV_KIND[ev.kind] || ev.kind}
                    {' · Registró '}
                    {ev.uploaded_by_name || '—'}
                    {ev.notes ? ` — ${ev.notes}` : ''}
                    {ev.original_name ? ` · ${ev.original_name}` : ''}
                  </figcaption>
                  {isImageFile(ev.original_name, ev.file_url) ? (
                    <ProtectedImage
                      url={ev.file_url}
                      alt={ev.notes || ev.original_name}
                      className="mnt-paper-img"
                      onClick={() => setLightbox(ev)}
                    />
                  ) : (
                    <button type="button" className="mnt-file-chip" onClick={() => downloadProtected(ev.file_url, ev.original_name)}>
                      <FileText size={14} /> Descargar {ev.original_name || 'archivo'}
                    </button>
                  )}
                </figure>
              ))}
            </section>

            <p className="mnt-paper-foot">
              Este documento forma parte del historial de mantenimientos del condominio.
              Las fotografías y notas quedan como constancia interna de los trabajos.
            </p>
          </article>
        </div>
        <div className="modal-foot">
          <button className="btn btn-outline" onClick={onClose}>Cerrar</button>
          <button className="btn btn-primary" onClick={onDownload}>
            <Download size={14} /> Descargar PDF
          </button>
        </div>
      </div>

      {lightbox && (
        <div className="mnt-lightbox" onClick={e => { e.stopPropagation(); setLightbox(null); }}>
          <button className="modal-close" type="button" onClick={() => setLightbox(null)}><X size={16} /></button>
          <ProtectedImage
            url={lightbox.file_url}
            alt={lightbox.notes || lightbox.original_name}
            className="mnt-lightbox-img"
          />
        </div>
      )}
    </div>
  );
}
