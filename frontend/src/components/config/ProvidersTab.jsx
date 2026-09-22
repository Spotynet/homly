import React, { useCallback, useEffect, useState } from 'react';
import {
  Briefcase, Plus, Search, Pencil, Trash2, Check, X, Upload, FileText, Building2, User,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { providersAPI } from '../../api/client';

export const PROVIDER_MODULES = [
  { key: 'gastos',          label: 'Gastos' },
  { key: 'caja_chica',      label: 'Caja chica' },
  { key: 'mantenimientos',  label: 'Mantenimientos' },
  { key: 'planeacion',      label: 'Planeación' },
];

const STATUS = {
  activo:      { label: 'Activo',      color: 'var(--teal-700)',  bg: 'var(--teal-50)' },
  inactivo:    { label: 'Inactivo',    color: 'var(--ink-500)',   bg: 'var(--sand-100)' },
  suspendido:  { label: 'Suspendido',  color: 'var(--coral-600)', bg: 'var(--coral-50)' },
};

const DOC_KINDS = [
  { key: 'csf',                   label: 'Constancia de situación fiscal' },
  { key: 'identificacion',        label: 'Identificación oficial' },
  { key: 'acta_constitutiva',     label: 'Acta constitutiva' },
  { key: 'comprobante_domicilio', label: 'Comprobante de domicilio' },
  { key: 'estado_cuenta',         label: 'Estado de cuenta' },
  { key: 'contrato',              label: 'Contrato' },
  { key: 'otro',                  label: 'Otro' },
];

const EMPTY = {
  person_type: 'moral',
  legal_name: '',
  trade_name: '',
  first_name: '',
  last_name: '',
  rfc: '',
  curp: '',
  tax_regime: '',
  legal_rep_name: '',
  contact_name: '',
  email: '',
  phone: '',
  mobile: '',
  website: '',
  street: '',
  ext_number: '',
  int_number: '',
  colonia: '',
  city: '',
  state: '',
  zip_code: '',
  bank_name: '',
  bank_clabe: '',
  bank_account: '',
  notes: '',
  status: 'activo',
  visible_in_modules: PROVIDER_MODULES.map(m => m.key),
};

function errMsg(e, fallback) {
  const d = e?.response?.data;
  if (typeof d?.detail === 'string') return d.detail;
  if (d?.legal_name?.[0]) return d.legal_name[0];
  return fallback;
}

export default function ProvidersTab({ tenantId, isAdmin }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState(null);
  const [docKind, setDocKind] = useState('csf');
  const [docNotes, setDocNotes] = useState('');

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const r = await providersAPI.list(tenantId, {
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(q.trim() ? { q: q.trim() } : {}),
      });
      setList(Array.isArray(r.data) ? r.data : r.data?.results || []);
    } catch {
      toast.error('No se pudieron cargar los proveedores');
    } finally {
      setLoading(false);
    }
  }, [tenantId, statusFilter, q]);

  useEffect(() => { load(); }, [load]);

  const openNew = () => setForm({ ...EMPTY });
  const openEdit = async (row) => {
    try {
      const r = await providersAPI.get(tenantId, row.id);
      setForm({ ...EMPTY, ...r.data });
      setDetail(r.data);
    } catch {
      toast.error('No se pudo abrir el proveedor');
    }
  };

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const toggleModule = (key) => {
    setForm(f => {
      const cur = Array.isArray(f.visible_in_modules) ? f.visible_in_modules : [];
      return {
        ...f,
        visible_in_modules: cur.includes(key) ? cur.filter(x => x !== key) : [...cur, key],
      };
    });
  };

  const save = async () => {
    if (!form.legal_name?.trim()) return toast.error('Indica el nombre o razón social');
    setSaving(true);
    try {
      const payload = { ...form };
      delete payload.documents;
      delete payload.document_count;
      delete payload.display_name;
      delete payload.created_at;
      delete payload.updated_at;
      delete payload.id;
      if (form.id) {
        await providersAPI.update(tenantId, form.id, payload);
        toast.success('Proveedor actualizado');
      } else {
        await providersAPI.create(tenantId, payload);
        toast.success('Proveedor registrado');
      }
      setForm(null);
      setDetail(null);
      load();
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo guardar el proveedor'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row) => {
    if (!window.confirm(`¿Eliminar a "${row.display_name}" del catálogo? Los gastos y trabajos ya registrados conservan el nombre.`)) return;
    try {
      await providersAPI.delete(tenantId, row.id);
      toast.success('Proveedor eliminado');
      if (form?.id === row.id) { setForm(null); setDetail(null); }
      load();
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo eliminar'));
    }
  };

  const setStatus = async (row, status) => {
    try {
      await providersAPI.update(tenantId, row.id, { status });
      toast.success(`Estatus: ${STATUS[status]?.label || status}`);
      load();
      if (form?.id === row.id) setForm(f => ({ ...f, status }));
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo cambiar el estatus'));
    }
  };

  const uploadDoc = async (file) => {
    if (!form?.id || !file) return;
    if (file.size > 20 * 1024 * 1024) return toast.error('El archivo no puede superar 20 MB');
    const fd = new FormData();
    fd.append('file', file);
    fd.append('kind', docKind);
    fd.append('notes', docNotes);
    try {
      await providersAPI.uploadDocument(tenantId, form.id, fd);
      toast.success('Documento cargado');
      setDocNotes('');
      const r = await providersAPI.get(tenantId, form.id);
      setForm({ ...EMPTY, ...r.data });
      setDetail(r.data);
      load();
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo cargar el documento'));
    }
  };

  const deleteDoc = async (doc) => {
    if (!form?.id) return;
    if (!window.confirm(`¿Eliminar "${doc.original_name || 'documento'}"?`)) return;
    try {
      await providersAPI.deleteDocument(tenantId, form.id, doc.id);
      const r = await providersAPI.get(tenantId, form.id);
      setForm({ ...EMPTY, ...r.data });
      setDetail(r.data);
      load();
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo eliminar el documento'));
    }
  };

  const docs = form?.documents || detail?.documents || [];
  const isFisica = form?.person_type === 'fisica';

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Briefcase size={18} color="var(--teal-600)" />
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--ink-800)' }}>Proveedores</h3>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-400)', maxWidth: 640 }}>
            Catálogo del condominio para Gastos, Caja chica, Mantenimientos y Planeación.
            Controla el estatus y en qué módulos aparece cada proveedor.
          </p>
        </div>
        {isAdmin && (
          <button className="btn btn-primary" onClick={openNew}>
            <Plus size={14} /> Nuevo proveedor
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 220px' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-300)' }} />
          <input
            className="field-input"
            style={{ paddingLeft: 32 }}
            placeholder="Buscar por nombre, RFC o contacto"
            value={q}
            onChange={e => setQ(e.target.value)}
          />
        </div>
        <select className="field-select" style={{ width: 180 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">Todos los estatus</option>
          {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Proveedor</th>
                <th>Tipo</th>
                <th>RFC</th>
                <th>Contacto</th>
                <th>Visible en</th>
                <th>Estatus</th>
                {isAdmin && <th style={{ width: 120 }}>Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--ink-300)', padding: 24 }}>Cargando…</td></tr>
              )}
              {!loading && list.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', color: 'var(--ink-400)', padding: 28 }}>
                    <Building2 size={28} style={{ display: 'block', margin: '0 auto 8px', opacity: 0.35 }} />
                    Aún no hay proveedores. Registra el primero para usarlo en los módulos del condominio.
                  </td>
                </tr>
              )}
              {list.map(p => {
                const st = STATUS[p.status] || STATUS.inactivo;
                return (
                  <tr key={p.id}>
                    <td>
                      <div style={{ fontWeight: 700 }}>{p.display_name}</div>
                      {p.trade_name && p.legal_name && p.trade_name !== p.legal_name && (
                        <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>{p.legal_name}</div>
                      )}
                    </td>
                    <td>
                      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-500)' }}>
                        {p.person_type === 'fisica' ? 'Persona física' : 'Persona moral'}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{p.rfc || '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--ink-500)' }}>
                      {p.contact_name || '—'}
                      {p.phone && <div>{p.phone}</div>}
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {(p.visible_in_modules || []).map(k => {
                          const m = PROVIDER_MODULES.find(x => x.key === k);
                          return (
                            <span key={k} style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 999, background: 'var(--teal-50)', color: 'var(--teal-700)' }}>
                              {m?.label || k}
                            </span>
                          );
                        })}
                        {!(p.visible_in_modules || []).length && <span style={{ color: 'var(--ink-300)', fontSize: 11 }}>Ninguno</span>}
                      </div>
                    </td>
                    <td>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: st.bg, color: st.color }}>
                        {st.label}
                      </span>
                    </td>
                    {isAdmin && (
                      <td>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button className="btn-ghost" title="Editar" style={{ color: 'var(--teal-600)' }} onClick={() => openEdit(p)}>
                            <Pencil size={13} />
                          </button>
                          {p.status !== 'activo' && (
                            <button className="btn-ghost" title="Activar" style={{ color: 'var(--teal-600)' }} onClick={() => setStatus(p, 'activo')}>
                              <Check size={13} />
                            </button>
                          )}
                          {p.status === 'activo' && (
                            <button className="btn-ghost" title="Suspender" style={{ color: 'var(--amber-600)' }} onClick={() => setStatus(p, 'suspendido')}>
                              <X size={13} />
                            </button>
                          )}
                          <button className="btn-ghost" title="Eliminar" style={{ color: 'var(--coral-500)' }} onClick={() => remove(p)}>
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {form && (
        <div className="modal-bg open" onClick={() => { setForm(null); setDetail(null); }}>
          <div className="modal xl" onClick={e => e.stopPropagation()} style={{ maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-head" style={{ flexShrink: 0 }}>
              <h3>{form.id ? 'Editar proveedor' : 'Nuevo proveedor'}</h3>
              <button className="modal-close" onClick={() => { setForm(null); setDetail(null); }}><X size={16} /></button>
            </div>
            <div className="modal-body" style={{ overflowY: 'auto', flex: 1 }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                {[
                  { key: 'moral', label: 'Persona moral', Icon: Building2 },
                  { key: 'fisica', label: 'Persona física', Icon: User },
                ].map(({ key, label, Icon }) => {
                  const on = form.person_type === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => set('person_type', key)}
                      style={{
                        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
                        border: `1.5px solid ${on ? 'var(--teal-500)' : 'var(--sand-200)'}`,
                        background: on ? 'var(--teal-50)' : 'white',
                        color: on ? 'var(--teal-700)' : 'var(--ink-500)',
                        fontWeight: 700, fontSize: 13,
                      }}
                    >
                      <Icon size={15} /> {label}
                    </button>
                  );
                })}
              </div>

              <div className="form-grid">
                <div className={`field ${isFisica ? '' : 'field-full'}`}>
                  <label className="field-label">{isFisica ? 'Nombre completo / razón' : 'Razón social'} *</label>
                  <input className="field-input" value={form.legal_name} onChange={e => set('legal_name', e.target.value)} />
                </div>
                {isFisica && (
                  <>
                    <div className="field">
                      <label className="field-label">Nombre</label>
                      <input className="field-input" value={form.first_name} onChange={e => set('first_name', e.target.value)} />
                    </div>
                    <div className="field">
                      <label className="field-label">Apellidos</label>
                      <input className="field-input" value={form.last_name} onChange={e => set('last_name', e.target.value)} />
                    </div>
                  </>
                )}
                <div className="field">
                  <label className="field-label">Nombre comercial</label>
                  <input className="field-input" value={form.trade_name} onChange={e => set('trade_name', e.target.value)} placeholder="Cómo se muestra en los módulos" />
                </div>
                <div className="field">
                  <label className="field-label">RFC</label>
                  <input className="field-input" style={{ fontFamily: 'monospace' }} value={form.rfc} onChange={e => set('rfc', e.target.value.toUpperCase())} />
                </div>
                {isFisica && (
                  <div className="field">
                    <label className="field-label">CURP</label>
                    <input className="field-input" style={{ fontFamily: 'monospace' }} value={form.curp} onChange={e => set('curp', e.target.value.toUpperCase())} />
                  </div>
                )}
                {!isFisica && (
                  <div className="field">
                    <label className="field-label">Representante legal</label>
                    <input className="field-input" value={form.legal_rep_name} onChange={e => set('legal_rep_name', e.target.value)} />
                  </div>
                )}
                <div className="field">
                  <label className="field-label">Régimen fiscal</label>
                  <input className="field-input" value={form.tax_regime} onChange={e => set('tax_regime', e.target.value)} />
                </div>
                <div className="field">
                  <label className="field-label">Estatus</label>
                  <select className="field-select" value={form.status} onChange={e => set('status', e.target.value)}>
                    {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-500)', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid var(--sand-100)', paddingBottom: 6, margin: '18px 0 10px' }}>
                Contacto
              </div>
              <div className="form-grid">
                <div className="field">
                  <label className="field-label">Persona de contacto</label>
                  <input className="field-input" value={form.contact_name} onChange={e => set('contact_name', e.target.value)} />
                </div>
                <div className="field">
                  <label className="field-label">Email</label>
                  <input type="email" className="field-input" value={form.email} onChange={e => set('email', e.target.value)} />
                </div>
                <div className="field">
                  <label className="field-label">Teléfono</label>
                  <input className="field-input" value={form.phone} onChange={e => set('phone', e.target.value)} />
                </div>
                <div className="field">
                  <label className="field-label">Celular</label>
                  <input className="field-input" value={form.mobile} onChange={e => set('mobile', e.target.value)} />
                </div>
                <div className="field field-full">
                  <label className="field-label">Sitio web</label>
                  <input className="field-input" value={form.website} onChange={e => set('website', e.target.value)} />
                </div>
              </div>

              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-500)', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid var(--sand-100)', paddingBottom: 6, margin: '18px 0 10px' }}>
                Domicilio
              </div>
              <div className="form-grid">
                <div className="field field-full">
                  <label className="field-label">Calle</label>
                  <input className="field-input" value={form.street} onChange={e => set('street', e.target.value)} />
                </div>
                <div className="field">
                  <label className="field-label">No. exterior</label>
                  <input className="field-input" value={form.ext_number} onChange={e => set('ext_number', e.target.value)} />
                </div>
                <div className="field">
                  <label className="field-label">No. interior</label>
                  <input className="field-input" value={form.int_number} onChange={e => set('int_number', e.target.value)} />
                </div>
                <div className="field">
                  <label className="field-label">Colonia</label>
                  <input className="field-input" value={form.colonia} onChange={e => set('colonia', e.target.value)} />
                </div>
                <div className="field">
                  <label className="field-label">Ciudad</label>
                  <input className="field-input" value={form.city} onChange={e => set('city', e.target.value)} />
                </div>
                <div className="field">
                  <label className="field-label">Estado</label>
                  <input className="field-input" value={form.state} onChange={e => set('state', e.target.value)} />
                </div>
                <div className="field">
                  <label className="field-label">C.P.</label>
                  <input className="field-input" value={form.zip_code} onChange={e => set('zip_code', e.target.value)} />
                </div>
              </div>

              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-500)', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid var(--sand-100)', paddingBottom: 6, margin: '18px 0 10px' }}>
                Datos bancarios
              </div>
              <div className="form-grid">
                <div className="field">
                  <label className="field-label">Banco</label>
                  <input className="field-input" value={form.bank_name} onChange={e => set('bank_name', e.target.value)} />
                </div>
                <div className="field">
                  <label className="field-label">CLABE</label>
                  <input className="field-input" style={{ fontFamily: 'monospace' }} value={form.bank_clabe} onChange={e => set('bank_clabe', e.target.value)} />
                </div>
                <div className="field">
                  <label className="field-label">Cuenta</label>
                  <input className="field-input" style={{ fontFamily: 'monospace' }} value={form.bank_account} onChange={e => set('bank_account', e.target.value)} />
                </div>
                <div className="field field-full">
                  <label className="field-label">Notas internas</label>
                  <textarea className="field-input" rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} style={{ resize: 'vertical' }} />
                </div>
              </div>

              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-500)', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid var(--sand-100)', paddingBottom: 6, margin: '18px 0 10px' }}>
                Visible en módulos
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {PROVIDER_MODULES.map(m => {
                  const on = (form.visible_in_modules || []).includes(m.key);
                  return (
                    <label
                      key={m.key}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                        borderRadius: 10, cursor: 'pointer',
                        border: `1.5px solid ${on ? 'var(--teal-200)' : 'var(--sand-200)'}`,
                        background: on ? 'var(--teal-50)' : 'var(--sand-50)',
                      }}
                    >
                      <input type="checkbox" checked={on} onChange={() => toggleModule(m.key)} />
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{m.label}</span>
                    </label>
                  );
                })}
              </div>

              {form.id && (
                <>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-500)', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid var(--sand-100)', paddingBottom: 6, margin: '18px 0 10px' }}>
                    Documentos
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                    <select className="field-select" style={{ width: 240 }} value={docKind} onChange={e => setDocKind(e.target.value)}>
                      {DOC_KINDS.filter(d => form.person_type === 'moral' || d.key !== 'acta_constitutiva').map(d => (
                        <option key={d.key} value={d.key}>{d.label}</option>
                      ))}
                    </select>
                    <input className="field-input" style={{ flex: 1, minWidth: 160 }} placeholder="Notas (opcional)" value={docNotes} onChange={e => setDocNotes(e.target.value)} />
                    <label className="btn btn-outline" style={{ cursor: 'pointer' }}>
                      <Upload size={13} /> Cargar
                      <input type="file" hidden onChange={e => { const f = e.target.files?.[0]; if (f) uploadDoc(f); e.target.value = ''; }} />
                    </label>
                  </div>
                  {docs.length === 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>Sin documentos cargados.</div>
                  ) : (
                    <div style={{ display: 'grid', gap: 6 }}>
                      {docs.map(d => (
                        <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', border: '1px solid var(--sand-100)', borderRadius: 8 }}>
                          <FileText size={14} color="var(--teal-600)" />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 700 }}>{d.original_name || 'Documento'}</div>
                            <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>{d.kind_label || d.kind}{d.notes ? ` · ${d.notes}` : ''}</div>
                          </div>
                          {d.file_url && (
                            <a href={d.file_url} target="_blank" rel="noreferrer" className="btn-ghost" style={{ color: 'var(--teal-600)', fontSize: 12 }}>Ver</a>
                          )}
                          <button className="btn-ghost" style={{ color: 'var(--coral-500)' }} onClick={() => deleteDoc(d)}><Trash2 size={13} /></button>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
              {!form.id && (
                <div style={{ marginTop: 16, fontSize: 12, color: 'var(--ink-400)' }}>
                  Guarda el proveedor para poder cargar sus documentos.
                </div>
              )}
            </div>
            <div className="modal-foot" style={{ flexShrink: 0 }}>
              <button className="btn btn-secondary" onClick={() => { setForm(null); setDetail(null); }}>Cancelar</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>
                <Check size={14} /> {saving ? 'Guardando…' : (form.id ? 'Guardar cambios' : 'Registrar')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
