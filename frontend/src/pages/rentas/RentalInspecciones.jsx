import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { ArrowDown, ArrowUp, Camera, CheckCircle2, ClipboardCheck, Paperclip, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTenantAccess } from '../../context/TenantAccessContext';
import { rentalAPI } from '../../api/client';
import {
  Chip, Empty, errMsg, Field, fmtD, Grid, Modal, PageHead, PRIORITY, SearchBar, Stat, todayISO,
} from './opsUi';
import EvidenceFiles from './EvidenceFiles';
import { useSearchParams } from 'react-router-dom';
import SpaceField, { SpaceFilter, spacePayload } from './SpaceField';

const STATUS = {
  en_proceso: { label: 'En proceso', color: 'var(--amber-700)', bg: 'var(--amber-50)' },
  completada: { label: 'Completada', color: 'var(--teal-700)', bg: 'var(--teal-50)' },
};
const RESULTS = [
  ['ok', 'Bien', 'var(--teal-600)'],
  ['falla', 'Falla', 'var(--coral-500)'],
  ['na', 'N/A', 'var(--ink-400)'],
];
const KIND_LABEL = {
  entrega: 'Entrega / recepción', seguridad: 'Seguridad y protección civil', areas_comunes: 'Áreas comunes',
  instalaciones: 'Instalaciones', limpieza: 'Limpieza y presentación', otro: 'Otra',
};

function scoreColor(raw) {
  if (raw == null) return undefined;
  const s = Number(raw);
  return s >= 90 ? 'var(--teal-700)' : s >= 70 ? 'var(--amber-700)' : 'var(--coral-600)';
}

export default function RentalInspecciones() {
  const { tenantId } = useAuth();
  const { can } = useTenantAccess();
  const canWrite = can('rentas_inspecciones');
  const canOperate = can('rentas_inspecciones', 'operate');
  const [tab, setTab] = useState('inspecciones');
  const [rows, setRows] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [properties, setProperties] = useState([]);
  const [urlParams] = useSearchParams();
  const [filters, setFilters] = useState({ q: '', status: '', property: urlParams.get('property') || '', space: urlParams.get('space') || '' });
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);
  const [tplForm, setTplForm] = useState(null);
  const [run, setRun] = useState(null);
  const [assets, setAssets] = useState([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
    const [list, tpl] = await Promise.all([
      rentalAPI.ops.inspections.list(tenantId, params),
      rentalAPI.ops.templates.list(tenantId),
    ]);
    setRows(list.data || []);
    setTemplates(tpl.data || []);
    setRun(r => (r ? (list.data || []).find(x => x.id === r.id) || r : r));
  }, [tenantId, filters]);

  useEffect(() => {
    if (!tenantId) return;
    rentalAPI.properties.list(tenantId, { page_size: 500 }).then(p => setProperties(p.data.results || p.data || []));
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    setLoading(true);
    load().catch(() => toast.error('No se pudieron cargar las inspecciones')).finally(() => setLoading(false));
  }, [load, tenantId]);

  useEffect(() => {
    if (!form?.property) { setAssets([]); return; }
    rentalAPI.ops.assets.list(tenantId, { property: form.property, active: 1 })
      .then(r => setAssets(r.data || [])).catch(() => setAssets([]));
  }, [form?.property, tenantId]);

  const open = rows.filter(r => r.status === 'en_proceso').length;
  const done = rows.filter(r => r.status === 'completada');
  const avg = done.length ? Math.round(done.reduce((s, r) => s + Number(r.score || 0), 0) / done.length) : null;

  const create = async () => {
    if (!form.property) return toast.error('Selecciona el inmueble');
    if (!form.template) return toast.error('Elige una plantilla');
    setSaving(true);
    try {
      const { data } = await rentalAPI.ops.inspections.create(tenantId, {
        ...form, ...spacePayload(form), asset: form.asset || null, inspected_date: form.inspected_date || todayISO(),
      });
      toast.success(`Inspección ${data.folio} creada`);
      setForm(null);
      await load();
      setRun(data);
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo crear'));
    } finally { setSaving(false); }
  };

  const removeInspection = async (r) => {
    if (!window.confirm(`¿Eliminar la inspección ${r.folio}?`)) return;
    try {
      await rentalAPI.ops.inspections.remove(tenantId, r.id);
      toast.success('Eliminada');
      load();
    } catch (e) { toast.error(errMsg(e, 'No se pudo eliminar')); }
  };

  const saveTemplate = async () => {
    if (!tplForm.name.trim()) return toast.error('Dale un nombre a la plantilla');
    const items = (tplForm.items || [])
      .map(i => ({ label: (i.label || '').trim(), require_evidence: !!i.require_evidence, hint: (i.hint || '').trim() }))
      .filter(i => i.label);
    if (!items.length) return toast.error('Agrega al menos un punto a revisar');
    setSaving(true);
    try {
      const payload = { name: tplForm.name, kind: tplForm.kind, description: tplForm.description, items, is_active: tplForm.is_active };
      if (tplForm.id) await rentalAPI.ops.templates.update(tenantId, tplForm.id, payload);
      else {
        const { data: created } = await rentalAPI.ops.templates.create(tenantId, payload);
        for (const f of tplForm.pendingFiles || []) {
          const fd = new FormData();
          fd.append('file', f);
          await rentalAPI.ops.templates.addFile(tenantId, created.id, fd); // eslint-disable-line no-await-in-loop
        }
      }
      toast.success('Plantilla guardada');
      setTplForm(null);
      load();
    } catch (e) { toast.error(errMsg(e, 'No se pudo guardar')); }
    finally { setSaving(false); }
  };

  const removeTemplate = async (t) => {
    if (!window.confirm(`¿Eliminar la plantilla "${t.name}"?`)) return;
    try {
      await rentalAPI.ops.templates.remove(tenantId, t.id);
      load();
    } catch (e) { toast.error(errMsg(e, 'No se pudo eliminar')); }
  };

  return (
    <div className="content-fade">
      <PageHead
        title="Inspecciones"
        subtitle="Revisiones con lista de verificación (entrega, recepción, periódicas, seguridad). Cada falla puede convertirse en una orden de trabajo."
      >
        {canOperate && tab === 'inspecciones' && (
          <button className="btn btn-primary" onClick={() => setForm({ property: '', space: '', asset: '', template: '', inspector_name: '', inspected_date: todayISO() })}>
            <Plus size={15} /> Nueva inspección
          </button>
        )}
        {canWrite && tab === 'plantillas' && (
          <button className="btn btn-primary" onClick={() => setTplForm({ name: '', kind: 'otro', description: '', items: [{ label: '', require_evidence: false, hint: '' }], pendingFiles: [], is_active: true })}>
            <Plus size={15} /> Nueva plantilla
          </button>
        )}
      </PageHead>

      <div className="cob-stats" style={{ marginBottom: 16 }}>
        <Stat label="En proceso" value={open} tone={open ? 'warn' : ''} />
        <Stat label="Completadas" value={done.length} />
        <Stat label="Calificación promedio" value={avg == null ? '—' : `${avg}%`} tone={avg == null ? '' : avg >= 90 ? 'good' : avg >= 70 ? 'warn' : 'bad'} />
        <Stat label="Plantillas" value={templates.length} />
      </div>

      <div className="tabs" style={{ marginBottom: 14 }}>
        <button className={`tab ${tab === 'inspecciones' ? 'active' : ''}`} onClick={() => setTab('inspecciones')}>Inspecciones</button>
        <button className={`tab ${tab === 'plantillas' ? 'active' : ''}`} onClick={() => setTab('plantillas')}>Plantillas</button>
      </div>

      {tab === 'inspecciones' && (
        <>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
            <SearchBar value={filters.q} onChange={v => setFilters(f => ({ ...f, q: v }))} placeholder="Buscar folio, nombre o inmueble" />
            <select className="field-input" style={{ maxWidth: 200 }} value={filters.property} onChange={e => setFilters(f => ({ ...f, property: e.target.value, space: '' }))}>
              <option value="">Todos los inmuebles</option>
              {properties.map(p => <option key={p.id} value={p.id}>{p.name} · {p.code}</option>)}
            </select>
            <SpaceFilter tenantId={tenantId} propertyId={filters.property} value={filters.space} onChange={v => setFilters(f => ({ ...f, space: v }))} />
            <select className="field-input" style={{ maxWidth: 160 }} value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
              <option value="">Todo estado</option>
              <option value="en_proceso">En proceso</option>
              <option value="completada">Completadas</option>
            </select>
          </div>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-400)' }}>Cargando inspecciones…</div>
          ) : rows.length === 0 ? (
            <Empty icon={ClipboardCheck} text="Aún no hay inspecciones. Crea una a partir de una plantilla." />
          ) : (
            <div className="card">
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Folio</th><th>Inspección</th><th>Inmueble</th><th>Fecha</th><th>Resultado</th><th>Estado</th><th></th></tr></thead>
                  <tbody>
                    {rows.map(r => (
                      <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => setRun(r)}>
                        <td style={{ fontFamily: 'monospace', fontWeight: 800, color: 'var(--teal-700)' }}>{r.folio}</td>
                        <td>
                          <div style={{ fontWeight: 700 }}>{r.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>{r.inspector_name || 'Sin inspector'}{r.asset_name ? ` · ${r.asset_name}` : ''}</div>
                        </td>
                        <td>{r.property_name}<div style={{ fontSize: 11, color: 'var(--ink-400)' }}>{r.property_code}{r.space_code ? ` / ${r.space_code}` : ''}</div></td>
                        <td>{fmtD(r.inspected_date)}</td>
                        <td>
                          {r.status === 'completada' ? (
                            <div>
                              <b style={{ color: scoreColor(r.score) }}>{Number(r.score)}%</b>
                              <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>{r.stats?.fail || 0} falla(s){r.works?.length ? ` · ${r.works.length} orden(es)` : ''}</div>
                            </div>
                          ) : (
                            <span style={{ fontSize: 12, color: 'var(--ink-400)' }}>{(r.results?.length || 0) - (r.stats?.pending || 0)}/{r.results?.length || 0} revisados</span>
                          )}
                        </td>
                        <td><Chip map={STATUS} value={r.status} /></td>
                        <td onClick={e => e.stopPropagation()}>
                          {canWrite && <button className="btn-icon" style={{ color: 'var(--coral-500)' }} onClick={() => removeInspection(r)}><Trash2 size={14} /></button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {tab === 'plantillas' && (
        templates.length === 0 ? <Empty icon={ClipboardCheck} text="Sin plantillas." /> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 12 }}>
            {templates.map(t => (
              <div key={t.id} className="card" style={{ padding: 16, opacity: t.is_active ? 1 : 0.6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ fontWeight: 800 }}>{t.name}</div>
                  <span className="proj-chip">{t.kind_label || KIND_LABEL[t.kind]}</span>
                </div>
                {t.description && <div style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: 4 }}>{t.description}</div>}
                <ul style={{ margin: '10px 0', paddingLeft: 18, fontSize: 12, color: 'var(--ink-600)' }}>
                  {(t.items || []).slice(0, 5).map(i => <li key={i.id}>{i.label}{i.require_evidence && <Camera size={11} style={{ marginLeft: 5, verticalAlign: -1, color: 'var(--amber-700)' }} />}</li>)}
                  {t.items?.length > 5 && <li style={{ listStyle: 'none', color: 'var(--ink-400)' }}>+{t.items.length - 5} más…</li>}
                </ul>
                {((t.files || []).length > 0 || (t.items || []).some(i => i.require_evidence)) && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                    {(t.files || []).length > 0 && <span className="proj-chip"><Paperclip size={11} /> {t.files.length} archivo(s) de referencia</span>}
                    {(t.items || []).some(i => i.require_evidence) && <span className="ev-req"><Camera size={11} /> {(t.items || []).filter(i => i.require_evidence).length} con evidencia obligatoria</span>}
                  </div>
                )}
                {canWrite && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-outline btn-sm" onClick={() => setTplForm({ ...t, items: (t.items || []).map(i => ({ label: i.label, require_evidence: !!i.require_evidence, hint: i.hint || '' })), pendingFiles: [] })}><Pencil size={13} /> Editar</button>
                    <button className="btn btn-outline btn-sm" style={{ color: 'var(--coral-600)' }} onClick={() => removeTemplate(t)}><Trash2 size={13} /></button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      )}

      {form && (
        <Modal
          title="Nueva inspección" onClose={() => setForm(null)}
          footer={<>
            <button className="btn btn-outline" onClick={() => setForm(null)}>Cancelar</button>
            <button className="btn btn-primary" disabled={saving} onClick={create}>{saving ? 'Creando…' : 'Crear y empezar'}</button>
          </>}
        >
          <Field label="Plantilla *">
            <select className="field-input" value={form.template} onChange={e => setForm(f => ({ ...f, template: e.target.value }))}>
              <option value="">Selecciona…</option>
              {templates.filter(t => t.is_active).map(t => <option key={t.id} value={t.id}>{t.name} ({t.items_count} puntos)</option>)}
            </select>
          </Field>
          <Grid>
            <Field label="Inmueble *">
              <select className="field-input" value={form.property} onChange={e => setForm(f => ({ ...f, property: e.target.value, asset: '', space: '' }))}>
                <option value="">Selecciona…</option>
                {properties.map(p => <option key={p.id} value={p.id}>{p.name} · {p.code}</option>)}
              </select>
            </Field>
            <SpaceField tenantId={tenantId} propertyId={form.property} value={form.space} onChange={v => setForm(f => ({ ...f, space: v }))} label="Espacio inspeccionado (opcional)" />
            <Field label="Equipo (opcional)">
              <select className="field-input" value={form.asset} onChange={e => setForm(f => ({ ...f, asset: e.target.value }))} disabled={!form.property}>
                <option value="">Ninguno</option>
                {assets.map(a => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
              </select>
            </Field>
            <Field label="Inspector">
              <input className="field-input" value={form.inspector_name} onChange={e => setForm(f => ({ ...f, inspector_name: e.target.value }))} placeholder="Por defecto, tu nombre" />
            </Field>
            <Field label="Fecha">
              <input type="date" className="field-input" value={form.inspected_date} onChange={e => setForm(f => ({ ...f, inspected_date: e.target.value }))} />
            </Field>
          </Grid>
        </Modal>
      )}

      {tplForm && (
        <Modal
          title={tplForm.id ? 'Editar plantilla' : 'Nueva plantilla'} onClose={() => setTplForm(null)}
          footer={<>
            <button className="btn btn-outline" onClick={() => setTplForm(null)}>Cancelar</button>
            <button className="btn btn-primary" disabled={saving} onClick={saveTemplate}>{saving ? 'Guardando…' : 'Guardar'}</button>
          </>}
        >
          <Grid>
            <Field label="Nombre *"><input className="field-input" value={tplForm.name} onChange={e => setTplForm(f => ({ ...f, name: e.target.value }))} /></Field>
            <Field label="Tipo">
              <select className="field-input" value={tplForm.kind} onChange={e => setTplForm(f => ({ ...f, kind: e.target.value }))}>
                {Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
          </Grid>
          <Field label="Descripción"><input className="field-input" value={tplForm.description || ''} onChange={e => setTplForm(f => ({ ...f, description: e.target.value }))} /></Field>
          <Field label="Puntos a revisar *" hint="Marca “Evidencia obligatoria” para exigir foto o archivo en ese punto antes de completar la inspección.">
            <div style={{ display: 'grid', gap: 8 }}>
              {(tplForm.items || []).map((it, n) => (
                <div key={n} className="card" style={{ padding: 8, display: 'grid', gap: 6 }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: 'var(--ink-400)', width: 18 }}>{n + 1}.</span>
                    <input className="field-input" style={{ flex: 1 }} value={it.label} placeholder="Qué se revisa"
                      onChange={e => setTplForm(f => ({ ...f, items: f.items.map((x, j) => (j === n ? { ...x, label: e.target.value } : x)) }))} />
                    <button type="button" className="btn-icon" disabled={n === 0} onClick={() => setTplForm(f => { const a = [...f.items]; [a[n - 1], a[n]] = [a[n], a[n - 1]]; return { ...f, items: a }; })}><ArrowUp size={14} /></button>
                    <button type="button" className="btn-icon" disabled={n === tplForm.items.length - 1} onClick={() => setTplForm(f => { const a = [...f.items]; [a[n + 1], a[n]] = [a[n], a[n + 1]]; return { ...f, items: a }; })}><ArrowDown size={14} /></button>
                    <button type="button" className="btn-icon" style={{ color: 'var(--coral-500)' }} onClick={() => setTplForm(f => ({ ...f, items: f.items.filter((_, j) => j !== n) }))}><X size={14} /></button>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', paddingLeft: 24 }}>
                    <input className="field-input" style={{ flex: 1, minWidth: 180, height: 32, fontSize: 12 }} value={it.hint || ''} placeholder="Instrucción para el inspector (opcional)"
                      onChange={e => setTplForm(f => ({ ...f, items: f.items.map((x, j) => (j === n ? { ...x, hint: e.target.value } : x)) }))} />
                    <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, whiteSpace: 'nowrap' }}>
                      <input type="checkbox" checked={!!it.require_evidence}
                        onChange={e => setTplForm(f => ({ ...f, items: f.items.map((x, j) => (j === n ? { ...x, require_evidence: e.target.checked } : x)) }))} />
                      Evidencia obligatoria
                    </label>
                  </div>
                </div>
              ))}
              <button type="button" className="btn btn-outline btn-sm" style={{ justifySelf: 'start' }}
                onClick={() => setTplForm(f => ({ ...f, items: [...(f.items || []), { label: '', require_evidence: false, hint: '' }] }))}>
                <Plus size={13} /> Agregar punto
              </button>
            </div>
          </Field>
          <Field label="Material de referencia" hint="Fotos del estado esperado, instructivos o formatos. El inspector los verá al realizar la inspección.">
            {tplForm.id ? (
              <EvidenceFiles
                files={templates.find(t => t.id === tplForm.id)?.files || []}
                onUpload={async (file, notes) => {
                  const fd = new FormData(); fd.append('file', file); if (notes) fd.append('notes', notes);
                  await rentalAPI.ops.templates.addFile(tenantId, tplForm.id, fd);
                  await load();
                }}
                onRemove={async (f) => { await rentalAPI.ops.templates.removeFile(tenantId, tplForm.id, f.id); await load(); }}
              />
            ) : (
              <div style={{ display: 'grid', gap: 6 }}>
                {(tplForm.pendingFiles || []).map((f, n) => (
                  <div key={n} className="rd-row"><span><Paperclip size={12} /> {f.name}</span>
                    <button type="button" className="btn-icon" onClick={() => setTplForm(x => ({ ...x, pendingFiles: x.pendingFiles.filter((_, j) => j !== n) }))}><X size={13} /></button></div>
                ))}
                <label className="btn btn-outline btn-sm" style={{ justifySelf: 'start' }}>
                  <Paperclip size={13} /> Adjuntar archivo
                  <input type="file" hidden multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.heic,.doc,.docx,.xls,.xlsx"
                    onChange={e => { const list = Array.from(e.target.files || []); setTplForm(x => ({ ...x, pendingFiles: [...(x.pendingFiles || []), ...list] })); e.target.value = ''; }} />
                </label>
                <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>Se cargan al guardar la plantilla.</div>
              </div>
            )}
          </Field>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
            <input type="checkbox" checked={tplForm.is_active} onChange={e => setTplForm(f => ({ ...f, is_active: e.target.checked }))} /> Plantilla activa
          </label>
        </Modal>
      )}

      {run && <InspectionRunner insp={run} tenantId={tenantId} canWrite={canOperate} onClose={() => setRun(null)} onChanged={load} />}
    </div>
  );
}

function InspectionRunner({ insp, tenantId, canWrite, onClose, onChanged }) {
  const [results, setResults] = useState(insp.results || []);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [createOrders, setCreateOrders] = useState(true);
  const [summary, setSummary] = useState(insp.summary || '');
  const editable = canWrite && insp.status === 'en_proceso';

  useEffect(() => {
    setResults(insp.results || []);
    setDirty(false);
  }, [insp.id, insp.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const patch = (id, change) => {
    setResults(rs => rs.map(r => (r.id === id ? { ...r, ...change } : r)));
    setDirty(true);
  };
  const stats = {
    total: results.length,
    pending: results.filter(r => r.result === 'pendiente').length,
    failed: results.filter(r => r.result === 'falla').length,
  };

  const saveProgress = async () => {
    await rentalAPI.ops.inspections.update(tenantId, insp.id, { results, summary });
    setDirty(false);
  };

  const save = async () => {
    setBusy(true);
    try { await saveProgress(); toast.success('Avance guardado'); await onChanged(); }
    catch (e) { toast.error(errMsg(e, 'No se pudo guardar')); }
    finally { setBusy(false); }
  };

  const evidenceOf = (itemId) => (insp.evidences || []).filter(e => (e.item_id || '') === itemId);
  const uploadEv = (itemId) => async (file, notes) => {
    const fd = new FormData();
    fd.append('file', file);
    if (itemId) fd.append('item_id', itemId);
    if (notes) fd.append('notes', notes);
    fd.append('captured_at', todayISO());
    await rentalAPI.ops.inspections.addEvidence(tenantId, insp.id, fd);
    await onChanged();
  };
  const removeEv = async (f) => {
    await rentalAPI.ops.inspections.removeEvidence(tenantId, insp.id, f.id);
    await onChanged();
  };
  const missingEvidence = results.filter(r => r.require_evidence && ['ok', 'falla'].includes(r.result) && evidenceOf(r.id).length === 0);

  const complete = async () => {
    if (missingEvidence.length) {
      toast.error(`Falta evidencia en: ${missingEvidence.slice(0, 3).map(r => r.label).join('; ')}${missingEvidence.length > 3 ? '…' : ''}`);
      return;
    }
    if (stats.pending && !window.confirm(`Quedan ${stats.pending} punto(s) sin revisar. ¿Completar de todos modos?`)) return;
    setBusy(true);
    try {
      await saveProgress();
      const { data } = await rentalAPI.ops.inspections.complete(tenantId, insp.id, { create_orders: createOrders, force: true });
      toast.success(data.orders_created?.length ? `Inspección completada · ${data.orders_created.length} orden(es) creada(s)` : 'Inspección completada');
      await onChanged();
    } catch (e) { toast.error(errMsg(e, 'No se pudo completar')); }
    finally { setBusy(false); }
  };

  return (
    <Modal
      wide title={`${insp.folio} · ${insp.name}`}
      subtitle={`${insp.property_name} (${insp.property_code}${insp.space_code ? ` / ${insp.space_code}` : ''})${insp.asset_name ? ` · ${insp.asset_name}` : ''} · ${fmtD(insp.inspected_date)}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-outline" onClick={onClose}>Cerrar</button>
          {editable && <button className="btn btn-outline" disabled={busy || !dirty} onClick={save}>Guardar avance</button>}
          {editable && <button className="btn btn-primary" disabled={busy} onClick={complete}><CheckCircle2 size={15} /> Completar</button>}
        </>
      }
    >
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Chip map={STATUS} value={insp.status} />
        {insp.status === 'completada' && <b style={{ color: scoreColor(insp.score) }}>{Number(insp.score)}%</b>}
        <span style={{ fontSize: 12, color: 'var(--ink-400)' }}>{stats.total - stats.pending}/{stats.total} revisados · {stats.failed} falla(s)</span>
      </div>

      {(insp.template_files || []).length > 0 && (
        <div className="card" style={{ padding: 10 }}>
          <EvidenceFiles compact label="Material de referencia de la plantilla" files={insp.template_files} />
        </div>
      )}

      <div style={{ display: 'grid', gap: 8 }}>
        {results.map(r => (
          <div key={r.id} className="card" style={{ padding: 10, borderColor: r.result === 'falla' ? 'var(--coral-300, #f0a0a0)' : undefined }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{r.label}</div>
                {r.hint && <div style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 2 }}>{r.hint}</div>}
                {r.require_evidence && (
                  <span className={`ev-req ${evidenceOf(r.id).length ? 'done' : ''}`} style={{ marginTop: 4 }}>
                    <Camera size={10} /> {evidenceOf(r.id).length ? 'Con evidencia' : 'Evidencia obligatoria'}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {RESULTS.map(([val, label, color]) => (
                  <button
                    key={val} type="button" disabled={!editable}
                    onClick={() => patch(r.id, { result: r.result === val ? 'pendiente' : val })}
                    className="btn btn-sm"
                    style={r.result === val
                      ? { background: color, color: '#fff', borderColor: color }
                      : { background: 'transparent', border: '1px solid var(--sand-200)', color: 'var(--ink-600)' }}
                  >{label}</button>
                ))}
              </div>
            </div>
            {(r.result === 'falla' || r.note) && (
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                <input className="field-input" style={{ flex: 1, minWidth: 180 }} disabled={!editable} value={r.note || ''}
                  onChange={e => patch(r.id, { note: e.target.value })} placeholder="Describe lo que encontraste" />
                {r.result === 'falla' && (
                  <select className="field-input" style={{ maxWidth: 130 }} disabled={!editable} value={r.priority || 'media'} onChange={e => patch(r.id, { priority: e.target.value })}>
                    {Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                )}
              </div>
            )}
            {(editable || evidenceOf(r.id).length > 0) && (
              <div style={{ marginTop: 8 }}>
                <EvidenceFiles
                  compact showNote={false}
                  files={evidenceOf(r.id)}
                  onUpload={editable ? uploadEv(r.id) : undefined}
                  onRemove={editable ? removeEv : undefined}
                />
              </div>
            )}
            {editable && r.result !== 'falla' && !r.note && (
              <button type="button" onClick={() => patch(r.id, { note: ' ' })} style={{ background: 'none', border: 'none', color: 'var(--ink-400)', fontSize: 11, cursor: 'pointer', padding: '4px 0 0' }}>+ Agregar nota</button>
            )}
          </div>
        ))}
      </div>

      {(editable || (insp.evidences || []).some(e => !e.item_id)) && (
        <div className="card" style={{ padding: 10 }}>
          <EvidenceFiles
            label="Evidencias generales (fachada, vista general, documentos)"
            files={evidenceOf('')}
            onUpload={editable ? uploadEv('') : undefined}
            onRemove={editable ? removeEv : undefined}
          />
        </div>
      )}

      {editable && (
        <>
          <Field label="Resumen / observaciones generales">
            <textarea className="field-input" rows={2} value={summary} onChange={e => { setSummary(e.target.value); setDirty(true); }} />
          </Field>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
            <input type="checkbox" checked={createOrders} onChange={e => setCreateOrders(e.target.checked)} />
            Crear una orden de trabajo correctiva por cada falla al completar
          </label>
        </>
      )}
      {insp.status === 'completada' && insp.works?.length > 0 && (
        <div className="card" style={{ padding: 12 }}>
          <div className="field-label">Órdenes generadas</div>
          {insp.works.map(w => (
            <div key={w.id} className="rd-row"><span><b style={{ fontFamily: 'monospace' }}>{w.folio}</b> · {w.title}</span><span className="proj-chip">{w.status}</span></div>
          ))}
        </div>
      )}
      {insp.status === 'completada' && insp.summary && <div style={{ fontSize: 13 }}><div className="field-label">Observaciones</div>{insp.summary}</div>}
    </Modal>
  );
}
