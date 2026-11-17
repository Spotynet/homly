import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Copy, ExternalLink, LifeBuoy, Plus, Wrench } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTenantAccess } from '../../context/TenantAccessContext';
import { rentalAPI } from '../../api/client';
import {
  Chip, Empty, errMsg, Field, fmtDT, Grid, Modal, PageHead, PRIORITY, relTime, SearchBar, SLA_STATE, Stat,
} from './opsUi';
import SpaceField, { SpaceFilter, spacePayload } from './SpaceField';

const STATUS = {
  nueva: { label: 'Nueva', color: 'var(--blue-700)', bg: 'var(--blue-50)' },
  en_proceso: { label: 'En proceso', color: 'var(--amber-700)', bg: 'var(--amber-50)' },
  resuelta: { label: 'Resuelta', color: 'var(--teal-700)', bg: 'var(--teal-50)' },
  cerrada: { label: 'Cerrada', color: 'var(--ink-600)', bg: 'var(--sand-100)' },
  rechazada: { label: 'Rechazada', color: 'var(--coral-600)', bg: 'var(--coral-50)' },
};
const CHANNELS = {
  telefono: 'Teléfono', whatsapp: 'WhatsApp', correo: 'Correo', presencial: 'Presencial',
  portal: 'Portal', inspeccion: 'Inspección', otro: 'Otro',
};
const VIEWS = [
  ['abiertas', 'Abiertas'],
  ['resuelta', 'Resueltas'],
  ['cerrada', 'Cerradas'],
  ['rechazada', 'Rechazadas'],
  ['', 'Todas'],
];
const EMPTY = {
  property: '', space: '', asset: '', requester_name: '', requester_phone: '', requester_email: '',
  channel: 'telefono', category: '', priority: 'media', title: '', description: '',
};

export default function RentalSolicitudes() {
  const { tenantId } = useAuth();
  const { can } = useTenantAccess();
  const navigate = useNavigate();
  const canWrite = can('rentas_solicitudes');
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({});
  const [view, setView] = useState('abiertas');
  const [priority, setPriority] = useState('');
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [q, setQ] = useState('');
  const [urlParams] = useSearchParams();
  const [filterProp, setFilterProp] = useState(urlParams.get('property') || '');
  const [filterSpace, setFilterSpace] = useState(urlParams.get('space') || '');
  const [properties, setProperties] = useState([]);
  const [categories, setCategories] = useState([]);
  const [providers, setProviders] = useState([]);
  const [portal, setPortal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);
  const [assets, setAssets] = useState([]);
  const [detail, setDetail] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const params = {};
    if (view) params.status = view;
    if (priority) params.priority = priority;
    if (onlyOverdue) params.overdue = 1;
    if (q) params.q = q;
    if (filterProp) params.property = filterProp;
    if (filterSpace) params.space = filterSpace;
    const [list, sum] = await Promise.all([
      rentalAPI.ops.requests.list(tenantId, params),
      rentalAPI.ops.requests.summary(tenantId),
    ]);
    setRows(list.data || []);
    setSummary(sum.data || {});
    setDetail(d => (d ? (list.data || []).find(r => r.id === d.id) || d : d));
  }, [tenantId, view, priority, onlyOverdue, q, filterProp, filterSpace]);

  useEffect(() => {
    if (!tenantId) return;
    Promise.all([
      rentalAPI.properties.list(tenantId, { page_size: 500 }),
      rentalAPI.maintenance.categories.list(tenantId),
      rentalAPI.maintenance.providers.list(tenantId),
      rentalAPI.ops.settings(tenantId).catch(() => ({ data: null })),
    ]).then(([p, c, pr, s]) => {
      setProperties(p.data.results || p.data || []);
      setCategories(c.data || []);
      setProviders(pr.data || []);
      setPortal(s.data);
    }).catch(() => toast.error('No se pudieron cargar los catálogos'));
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    setLoading(true);
    load().catch(() => toast.error('No se pudieron cargar las solicitudes')).finally(() => setLoading(false));
  }, [load, tenantId]);

  useEffect(() => {
    if (!form?.property) { setAssets([]); return; }
    rentalAPI.ops.assets.list(tenantId, { property: form.property, active: 1 })
      .then(r => setAssets(r.data || [])).catch(() => setAssets([]));
  }, [form?.property, tenantId]);

  const portalUrl = portal?.portal_enabled ? `${window.location.origin}${portal.portal_path}` : '';

  const save = async () => {
    if (!form.property) return toast.error('Selecciona el inmueble');
    if (!form.title.trim()) return toast.error('Describe brevemente el problema');
    setSaving(true);
    try {
      await rentalAPI.ops.requests.create(tenantId, {
        ...form, ...spacePayload(form), asset: form.asset || null, category: form.category || null,
      });
      toast.success('Solicitud registrada');
      setForm(null);
      load();
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo guardar'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="content-fade">
      <PageHead
        title="Solicitudes de servicio"
        subtitle="Helpdesk del portafolio: recibe reportes de inquilinos y propietarios, mide el SLA y conviértelos en órdenes de trabajo."
      >
        {canWrite && (
          <button className="btn btn-primary" onClick={() => setForm({ ...EMPTY })}><Plus size={15} /> Nueva solicitud</button>
        )}
      </PageHead>

      {portalUrl && (
        <div className="card" style={{ padding: '12px 16px', marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>Portal de solicitudes para inquilinos</div>
            <div style={{ fontSize: 12, color: 'var(--ink-400)', overflowWrap: 'anywhere' }}>{portalUrl}</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-outline btn-sm" onClick={() => { navigator.clipboard?.writeText(portalUrl); toast.success('Enlace copiado'); }}>
              <Copy size={13} /> Copiar enlace
            </button>
            <a className="btn btn-outline btn-sm" href={portalUrl} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Abrir</a>
          </div>
        </div>
      )}

      <div className="cob-stats" style={{ marginBottom: 16 }}>
        <Stat label="Abiertas" value={summary.abiertas || 0} />
        <Stat label="Nuevas" value={summary.nueva || 0} tone={summary.nueva ? 'warn' : ''} />
        <Stat label="Fuera de SLA" value={summary.vencidas || 0} tone={summary.vencidas ? 'bad' : ''} />
        <Stat label="Urgentes" value={summary.urgentes || 0} tone={summary.urgentes ? 'bad' : ''} />
      </div>

      <div className="tabs" style={{ marginBottom: 14 }}>
        {VIEWS.map(([k, label]) => (
          <button key={label} className={`tab ${view === k ? 'active' : ''}`} onClick={() => setView(k)}>{label}</button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
        <SearchBar value={q} onChange={setQ} placeholder="Buscar folio, asunto, solicitante o inmueble" />
        <select className="field-input" style={{ maxWidth: 200 }} value={filterProp} onChange={e => { setFilterProp(e.target.value); setFilterSpace(''); }}>
          <option value="">Todos los inmuebles</option>
          {properties.map(p => <option key={p.id} value={p.id}>{p.name} · {p.code}</option>)}
        </select>
        <SpaceFilter tenantId={tenantId} propertyId={filterProp} value={filterSpace} onChange={setFilterSpace} />
        <select className="field-input" style={{ maxWidth: 160 }} value={priority} onChange={e => setPriority(e.target.value)}>
          <option value="">Toda prioridad</option>
          {Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
          <input type="checkbox" checked={onlyOverdue} onChange={e => setOnlyOverdue(e.target.checked)} /> Solo fuera de SLA
        </label>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-400)' }}>Cargando solicitudes…</div>
      ) : rows.length === 0 ? (
        <Empty icon={LifeBuoy} text="No hay solicitudes en este filtro." />
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Folio</th><th>Solicitud</th><th>Inmueble</th><th>Prioridad</th><th>SLA</th><th>Estado</th></tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => setDetail(r)}>
                    <td style={{ fontFamily: 'monospace', fontWeight: 800, color: 'var(--teal-700)' }}>{r.folio}</td>
                    <td>
                      <div style={{ fontWeight: 700 }}>{r.title}</div>
                      <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>
                        {r.requester_name || 'Sin nombre'} · {CHANNELS[r.channel] || r.channel} · {fmtDT(r.created_at)}
                      </div>
                    </td>
                    <td>
                      <div>{r.property_name}</div>
                      <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>{r.property_code}{r.space_code ? ` / ${r.space_code}` : ''}{r.asset_name ? ` · ${r.asset_name}` : ''}</div>
                    </td>
                    <td><Chip map={PRIORITY} value={r.priority} /></td>
                    <td><SlaCell r={r} /></td>
                    <td>
                      <Chip map={STATUS} value={r.status} />
                      {r.works?.length > 0 && <div style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 4 }}>{r.works.map(w => w.folio).join(', ')}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {form && (
        <Modal
          title="Nueva solicitud" subtitle="Registra un reporte recibido por teléfono, WhatsApp o en persona."
          onClose={() => setForm(null)}
          footer={<>
            <button className="btn btn-outline" onClick={() => setForm(null)}>Cancelar</button>
            <button className="btn btn-primary" disabled={saving} onClick={save}>{saving ? 'Guardando…' : 'Registrar'}</button>
          </>}
        >
          <Grid>
            <Field label="Inmueble *">
              <select className="field-input" value={form.property} onChange={e => setForm(f => ({ ...f, property: e.target.value, asset: '', space: '' }))}>
                <option value="">Selecciona…</option>
                {properties.map(p => <option key={p.id} value={p.id}>{p.name} · {p.code}</option>)}
              </select>
            </Field>
            <SpaceField tenantId={tenantId} propertyId={form.property} value={form.space} onChange={v => setForm(f => ({ ...f, space: v }))} label="Local / espacio (opcional)" />
            <Field label="Equipo afectado (opcional)">
              <select className="field-input" value={form.asset} onChange={e => setForm(f => ({ ...f, asset: e.target.value }))} disabled={!form.property}>
                <option value="">Ninguno</option>
                {assets.map(a => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
              </select>
            </Field>
          </Grid>
          <Field label="Asunto *">
            <input className="field-input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Ej. Fuga en baño principal" />
          </Field>
          <Field label="Detalle">
            <textarea className="field-input" rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </Field>
          <Grid cols={3}>
            <Field label="Prioridad">
              <select className="field-input" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
                {Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </Field>
            <Field label="Categoría">
              <select className="field-input" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                <option value="">Sin categoría</option>
                {categories.filter(c => c.is_active !== false).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Canal">
              <select className="field-input" value={form.channel} onChange={e => setForm(f => ({ ...f, channel: e.target.value }))}>
                {Object.entries(CHANNELS).filter(([k]) => k !== 'portal').map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
          </Grid>
          <Grid cols={3}>
            <Field label="Quién reporta">
              <input className="field-input" value={form.requester_name} onChange={e => setForm(f => ({ ...f, requester_name: e.target.value }))} />
            </Field>
            <Field label="Teléfono">
              <input className="field-input" value={form.requester_phone} onChange={e => setForm(f => ({ ...f, requester_phone: e.target.value }))} />
            </Field>
            <Field label="Correo">
              <input className="field-input" type="email" value={form.requester_email} onChange={e => setForm(f => ({ ...f, requester_email: e.target.value }))} />
            </Field>
          </Grid>
        </Modal>
      )}

      {detail && (
        <RequestDetail
          req={detail} tenantId={tenantId} canWrite={canWrite} providers={providers}
          onClose={() => setDetail(null)} onChanged={load}
          onOpenWork={() => navigate('/app/rentas/mantenimiento')}
        />
      )}
    </div>
  );
}

function SlaCell({ r }) {
  const open = r.status === 'nueva' || r.status === 'en_proceso';
  return (
    <div style={{ display: 'grid', gap: 4, fontSize: 11 }}>
      {r.response_state && (
        <div>
          <span style={{ color: 'var(--ink-400)' }}>Respuesta </span>
          <Chip map={SLA_STATE} value={r.response_state} />
        </div>
      )}
      {r.resolution_state && (
        <div>
          <span style={{ color: 'var(--ink-400)' }}>Solución </span>
          <Chip map={SLA_STATE} value={r.resolution_state} />
          {open && r.resolution_due_at && <span style={{ color: 'var(--ink-400)', marginLeft: 4 }}>{relTime(r.resolution_due_at)}</span>}
        </div>
      )}
    </div>
  );
}

function RequestDetail({ req, tenantId, canWrite, providers, onClose, onChanged, onOpenWork }) {
  const [notes, setNotes] = useState(req.resolution_notes || '');
  const [reason, setReason] = useState('');
  const [rating, setRating] = useState(req.satisfaction || 0);
  const [orderForm, setOrderForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const open = req.status === 'nueva' || req.status === 'en_proceso';

  const run = async (fn, okMsg) => {
    setBusy(true);
    try {
      await fn();
      if (okMsg) toast.success(okMsg);
      await onChanged();
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo completar la acción'));
    } finally {
      setBusy(false);
    }
  };

  const setStatus = (status, extra = {}) => run(
    () => rentalAPI.ops.requests.setStatus(tenantId, req.id, { status, ...extra }),
    'Solicitud actualizada',
  );

  return (
    <Modal
      wide
      title={`${req.folio} · ${req.title}`}
      subtitle={`${req.property_name} (${req.property_code}${req.space_code ? ` / ${req.space_code}` : ''})${req.asset_name ? ` · ${req.asset_name}` : ''}`}
      onClose={onClose}
      footer={<button className="btn btn-outline" onClick={onClose}>Cerrar</button>}
    >
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Chip map={STATUS} value={req.status} />
        <Chip map={PRIORITY} value={req.priority} />
        <span className="proj-chip">{CHANNELS[req.channel] || req.channel}</span>
        {req.category_name && <span className="proj-chip">{req.category_name}</span>}
      </div>
      {req.description && <p style={{ fontSize: 14, lineHeight: 1.55, margin: 0 }}>{req.description}</p>}
      <Grid>
        <div style={{ fontSize: 13 }}>
          <div className="field-label">Solicitante</div>
          {req.requester_name || '—'}
          <div style={{ color: 'var(--ink-400)', fontSize: 12 }}>{[req.requester_phone, req.requester_email].filter(Boolean).join(' · ')}</div>
        </div>
        <div style={{ fontSize: 13 }}>
          <div className="field-label">Compromisos (SLA)</div>
          <div>Respuesta: {fmtDT(req.response_due_at)} {req.response_state && <Chip map={SLA_STATE} value={req.response_state} />}</div>
          <div>Solución: {fmtDT(req.resolution_due_at)} {req.resolution_state && <Chip map={SLA_STATE} value={req.resolution_state} />}</div>
        </div>
      </Grid>
      {req.works?.length > 0 && (
        <div className="card" style={{ padding: 12 }}>
          <div className="field-label">Órdenes de trabajo</div>
          {req.works.map(w => (
            <div key={w.id} className="rd-row">
              <span><b style={{ fontFamily: 'monospace' }}>{w.folio}</b> · {w.title}</span>
              <span className="proj-chip">{w.status}</span>
            </div>
          ))}
          <button className="btn btn-outline btn-sm" style={{ marginTop: 8 }} onClick={onOpenWork}><Wrench size={13} /> Ir a órdenes de trabajo</button>
        </div>
      )}
      {req.resolution_notes && !open && (
        <div className="card" style={{ padding: 12, fontSize: 13 }}>
          <div className="field-label">Solución</div>{req.resolution_notes}
        </div>
      )}
      {req.status === 'rechazada' && <div className="card" style={{ padding: 12, fontSize: 13 }}><div className="field-label">Motivo del rechazo</div>{req.reject_reason}</div>}

      {canWrite && open && (
        <div style={{ display: 'grid', gap: 10 }}>
          {!orderForm ? (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => setOrderForm({ provider: '', assigned_to: '' })}>
                <Wrench size={13} /> Crear orden de trabajo
              </button>
              {req.status === 'nueva' && <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => setStatus('en_proceso')}>Marcar en proceso</button>}
            </div>
          ) : (
            <div className="card" style={{ padding: 12, display: 'grid', gap: 10 }}>
              <Grid>
                <Field label="Proveedor">
                  <select className="field-input" value={orderForm.provider} onChange={e => setOrderForm(f => ({ ...f, provider: e.target.value }))}>
                    <option value="">Sin asignar</option>
                    {providers.filter(p => p.is_active !== false && p.status !== 'inactivo').map(p => <option key={p.id} value={p.id}>{p.trade_name || p.name}</option>)}
                  </select>
                </Field>
                <Field label="Responsable interno">
                  <input className="field-input" value={orderForm.assigned_to} onChange={e => setOrderForm(f => ({ ...f, assigned_to: e.target.value }))} />
                </Field>
              </Grid>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => run(async () => {
                  const { data } = await rentalAPI.ops.requests.createOrder(tenantId, req.id, {
                    provider: orderForm.provider || undefined, assigned_to: orderForm.assigned_to || undefined,
                  });
                  toast.success(`Orden ${data.folio} creada`);
                  setOrderForm(null);
                })}>Crear orden</button>
                <button className="btn btn-outline btn-sm" onClick={() => setOrderForm(null)}>Cancelar</button>
              </div>
            </div>
          )}
          <Field label="Notas de solución">
            <textarea className="field-input" rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Qué se hizo para resolverlo" />
          </Field>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => setStatus('resuelta', { resolution_notes: notes })}>Marcar resuelta</button>
            <input className="field-input" style={{ maxWidth: 240 }} value={reason} onChange={e => setReason(e.target.value)} placeholder="Motivo si se rechaza" />
            <button className="btn btn-outline btn-sm" style={{ color: 'var(--coral-600)' }} disabled={busy || !reason.trim()} onClick={() => setStatus('rechazada', { reject_reason: reason })}>Rechazar</button>
          </div>
        </div>
      )}
      {canWrite && req.status === 'resuelta' && (
        <div className="card" style={{ padding: 12, display: 'grid', gap: 8 }}>
          <div className="field-label">Cerrar con calificación del cliente (opcional)</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[1, 2, 3, 4, 5].map(n => (
              <button key={n} className={`btn btn-sm ${rating === n ? 'btn-primary' : 'btn-outline'}`} onClick={() => setRating(n)}>{n} ★</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => setStatus('cerrada', { resolution_notes: req.resolution_notes, satisfaction: rating || undefined })}>Cerrar solicitud</button>
            <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => setStatus('en_proceso')}>Reabrir</button>
          </div>
        </div>
      )}
      {req.satisfaction && <div style={{ fontSize: 13 }}>Satisfacción: {'★'.repeat(req.satisfaction)}{'☆'.repeat(5 - req.satisfaction)}</div>}
    </Modal>
  );
}
