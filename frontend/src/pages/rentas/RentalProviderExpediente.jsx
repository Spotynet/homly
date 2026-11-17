import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Building2, CreditCard, FileText, FolderOpen, MapPin, Plus, Shield, Trash2, Upload, User, Users, X,
} from 'lucide-react';
import { rentalAPI } from '../../api/client';

const TABS = [
  ['general', 'General', Building2],
  ['contactos', 'Contactos', Users],
  ['ubicacion', 'Ubicación', MapPin],
  ['pagos', 'Pagos', CreditCard],
  ['documentos', 'Documentos', FileText],
  ['repse', 'REPSE', Shield],
];

const BANK_TYPES = [
  ['clabe', 'CLABE interbancaria'],
  ['cheques', 'Cuenta de cheques'],
  ['ahorro', 'Cuenta de ahorro'],
];

const REPSE_STATUS = [
  ['pendiente', 'Pendiente de expediente'],
  ['vigente', 'Vigente'],
  ['vencido', 'Vencido'],
];

function errMsg(e, fallback) {
  const d = e?.response?.data?.detail;
  if (typeof d === 'string') return d;
  return fallback;
}

function Field({ label, children }) {
  return (
    <div className="field" style={{ margin: 0 }}>
      <div className="field-label">{label}</div>
      {children}
    </div>
  );
}

function Chip({ ok, children }) {
  return (
    <span
      className="proj-chip"
      style={{
        color: ok ? 'var(--teal-700)' : 'var(--ink-500)',
        background: ok ? 'var(--teal-50)' : 'var(--sand-50)',
      }}
    >
      {children}
    </span>
  );
}

export default function RentalProviderExpediente({ tenantId, providerId, canWrite, onClose, onChanged }) {
  const [tab, setTab] = useState('general');
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [contact, setContact] = useState({ name: '', role: '', email: '', phone: '', mobile: '', is_primary: false });
  const [docKind, setDocKind] = useState('');
  const [docSection, setDocSection] = useState('general');
  const [docNotes, setDocNotes] = useState('');

  const load = async () => {
    try {
      const r = await rentalAPI.maintenance.providers.expediente(tenantId, providerId);
      setData(r.data);
      setForm(r.data);
    } catch {
      toast.error('No se pudo abrir el expediente');
      onClose();
    }
  };

  useEffect(() => { load(); }, [tenantId, providerId]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const checklist = data?.checklist || { general: [], repse: [] };
  const generalKinds = useMemo(
    () => (checklist.general || []).map(i => ({ key: i.kind, label: i.label })),
    [checklist.general],
  );
  const repseKinds = useMemo(
    () => (checklist.repse || []).map(i => ({ key: i.kind, label: i.label })),
    [checklist.repse],
  );

  useEffect(() => {
    if (tab === 'repse') setDocSection('repse');
    if (tab === 'documentos') setDocSection('general');
  }, [tab]);

  useEffect(() => {
    const kinds = docSection === 'repse' ? repseKinds : generalKinds;
    if (kinds.length && !kinds.some(k => k.key === docKind)) {
      setDocKind(kinds[0].key);
    }
  }, [docSection, generalKinds, repseKinds, docKind]);

  const saveSection = async (fields) => {
    if (!canWrite || !form) return;
    setSaving(true);
    try {
      const payload = {};
      fields.forEach(k => { payload[k] = form[k]; });
      const r = await rentalAPI.maintenance.providers.saveExpediente(tenantId, providerId, payload);
      setData(r.data);
      setForm(r.data);
      toast.success('Expediente guardado');
      onChanged?.();
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo guardar'));
    } finally { setSaving(false); }
  };

  const addContact = async () => {
    if (!contact.name.trim()) return toast.error('El nombre del contacto es obligatorio');
    try {
      await rentalAPI.maintenance.providers.addContact(tenantId, providerId, contact);
      setContact({ name: '', role: '', email: '', phone: '', mobile: '', is_primary: false });
      toast.success('Contacto agregado');
      load();
      onChanged?.();
    } catch (e) { toast.error(errMsg(e, 'No se pudo agregar')); }
  };

  const removeContact = async (c) => {
    if (!window.confirm(`¿Quitar a ${c.name} de los contactos?`)) return;
    try {
      await rentalAPI.maintenance.providers.removeContact(tenantId, providerId, c.id);
      load();
      onChanged?.();
    } catch (e) { toast.error(errMsg(e, 'No se pudo eliminar')); }
  };

  const uploadDoc = async (file) => {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) return toast.error('El archivo no puede superar 20 MB');
    const fd = new FormData();
    fd.append('file', file);
    fd.append('section', docSection);
    fd.append('kind', docKind || 'otro');
    fd.append('notes', docNotes);
    try {
      await rentalAPI.maintenance.providers.addDocument(tenantId, providerId, fd);
      setDocNotes('');
      toast.success('Documento cargado');
      load();
      onChanged?.();
    } catch (e) { toast.error(errMsg(e, 'No se pudo cargar')); }
  };

  const removeDoc = async (d) => {
    if (!window.confirm(`¿Eliminar ${d.original_name || 'este documento'}?`)) return;
    try {
      await rentalAPI.maintenance.providers.removeDocument(tenantId, providerId, d.id);
      load();
      onChanged?.();
    } catch (e) { toast.error(errMsg(e, 'No se pudo eliminar')); }
  };

  if (!form) {
    return (
      <div className="ops-report-overlay" onClick={onClose}>
        <div className="ops-report-modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
          <div className="ops-report-body" style={{ padding: 36, textAlign: 'center', color: 'var(--ink-400)' }}>
            Abriendo expediente…
          </div>
        </div>
      </div>
    );
  }

  const docs = (data?.documents || []).filter(d => (tab === 'repse' ? d.section === 'repse' : d.section === 'general'));
  const kindsForUpload = docSection === 'repse' ? [...repseKinds, { key: 'otro', label: 'Otro' }] : [...generalKinds, { key: 'otro', label: 'Otro' }];
  const missingG = checklist.missing_general?.length || 0;
  const missingR = checklist.missing_repse?.length || 0;

  return (
    <div className="ops-report-overlay" onClick={onClose}>
      <div className="ops-report-modal" style={{ maxWidth: 820, width: 'min(820px, 96vw)' }} onClick={e => e.stopPropagation()}>
        <div className="ops-report-head">
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', color: 'var(--teal-600)', textTransform: 'uppercase' }}>
              Expediente digital
            </div>
            <div style={{ fontWeight: 800, fontSize: 18 }}>{form.trade_name || form.name}</div>
            <div style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: 2 }}>
              {form.person_type === 'fisica' ? 'Persona física' : 'Persona moral'}
              {form.rfc ? ` · RFC ${form.rfc}` : ''}
              {form.is_repse ? ' · REPSE' : ''}
            </div>
          </div>
          <button className="btn-icon" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="tabs" style={{ padding: '0 20px', margin: '8px 0 0' }}>
          {TABS.map(([k, label, Icon]) => (
            <button key={k} className={`tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>
              <Icon size={13} /> {label}
              {k === 'documentos' && missingG > 0 ? ` (${missingG})` : ''}
              {k === 'repse' && form.is_repse && missingR > 0 ? ` (${missingR})` : ''}
            </button>
          ))}
        </div>

        <div className="ops-report-body" style={{ display: 'grid', gap: 14, maxHeight: '68vh', overflow: 'auto' }}>
          {tab === 'general' && (
            <>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-500)', lineHeight: 1.55 }}>
                Información general capturada al crear el proveedor. Complétala según sea persona física o moral.
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                {[['fisica', 'Persona física'], ['moral', 'Persona moral']].map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    className={`btn btn-sm ${form.person_type === k ? 'btn-primary' : 'btn-outline'}`}
                    disabled={!canWrite}
                    onClick={() => set('person_type', k)}
                  >{label}</button>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label={form.person_type === 'fisica' ? 'Nombre completo *' : 'Razón social *'}>
                  <input className="field-input" value={form.name || ''} onChange={e => set('name', e.target.value)} />
                </Field>
                <Field label="Nombre comercial">
                  <input className="field-input" value={form.trade_name || ''} onChange={e => set('trade_name', e.target.value)} />
                </Field>
                <Field label="RFC">
                  <input className="field-input" value={form.rfc || ''} onChange={e => set('rfc', e.target.value)} />
                </Field>
                {form.person_type === 'fisica' ? (
                  <Field label="CURP">
                    <input className="field-input" value={form.curp || ''} onChange={e => set('curp', e.target.value)} />
                  </Field>
                ) : (
                  <Field label="Régimen fiscal">
                    <input className="field-input" value={form.tax_regime || ''} onChange={e => set('tax_regime', e.target.value)} />
                  </Field>
                )}
                {form.person_type === 'moral' && (
                  <>
                    <Field label="Representante legal">
                      <input className="field-input" value={form.legal_rep_name || ''} onChange={e => set('legal_rep_name', e.target.value)} />
                    </Field>
                    <Field label="RFC del representante">
                      <input className="field-input" value={form.legal_rep_rfc || ''} onChange={e => set('legal_rep_rfc', e.target.value)} />
                    </Field>
                  </>
                )}
                {form.person_type === 'fisica' && (
                  <Field label="Régimen fiscal">
                    <input className="field-input" value={form.tax_regime || ''} onChange={e => set('tax_regime', e.target.value)} />
                  </Field>
                )}
                <Field label="Correo">
                  <input className="field-input" value={form.email || ''} onChange={e => set('email', e.target.value)} />
                </Field>
                <Field label="Teléfono">
                  <input className="field-input" value={form.phone || ''} onChange={e => set('phone', e.target.value)} />
                </Field>
                <Field label="Celular">
                  <input className="field-input" value={form.mobile || ''} onChange={e => set('mobile', e.target.value)} />
                </Field>
                <Field label="Sitio web">
                  <input className="field-input" value={form.website || ''} onChange={e => set('website', e.target.value)} />
                </Field>
              </div>
              <Field label="Notas internas">
                <textarea className="field-input" rows={2} value={form.notes || ''} onChange={e => set('notes', e.target.value)} />
              </Field>
              {canWrite && (
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button className="btn btn-primary" disabled={saving} onClick={() => saveSection([
                    'person_type', 'name', 'trade_name', 'rfc', 'curp', 'tax_regime',
                    'legal_rep_name', 'legal_rep_rfc', 'email', 'phone', 'mobile', 'website', 'notes',
                  ])}>{saving ? 'Guardando…' : 'Guardar general'}</button>
                </div>
              )}
            </>
          )}

          {tab === 'contactos' && (
            <>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-500)' }}>
                Personas de contacto para coordinación, pagos o emergencias de mantenimiento.
              </p>
              {(data.contacts || []).length === 0 && (
                <div style={{ fontSize: 13, color: 'var(--ink-400)' }}>Aún no hay contactos en el expediente.</div>
              )}
              {(data.contacts || []).map(c => (
                <div key={c.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px', border: '1px solid var(--sand-100)', borderRadius: 10 }}>
                  <User size={16} color="var(--teal-600)" style={{ marginTop: 2 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700 }}>{c.name} {c.is_primary ? <Chip ok>Principal</Chip> : null}</div>
                    <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>
                      {[c.role, c.phone || c.mobile, c.email].filter(Boolean).join(' · ') || 'Sin datos de contacto'}
                    </div>
                  </div>
                  {canWrite && <button className="btn-icon" style={{ color: 'var(--coral-500)' }} onClick={() => removeContact(c)}><Trash2 size={14} /></button>}
                </div>
              ))}
              {canWrite && (
                <div style={{ display: 'grid', gap: 10, padding: 12, background: 'var(--sand-50)', borderRadius: 12 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>Agregar contacto</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <input className="field-input" placeholder="Nombre *" value={contact.name} onChange={e => setContact(c => ({ ...c, name: e.target.value }))} />
                    <input className="field-input" placeholder="Puesto / rol" value={contact.role} onChange={e => setContact(c => ({ ...c, role: e.target.value }))} />
                    <input className="field-input" placeholder="Correo" value={contact.email} onChange={e => setContact(c => ({ ...c, email: e.target.value }))} />
                    <input className="field-input" placeholder="Teléfono" value={contact.phone} onChange={e => setContact(c => ({ ...c, phone: e.target.value }))} />
                    <input className="field-input" placeholder="Celular" value={contact.mobile} onChange={e => setContact(c => ({ ...c, mobile: e.target.value }))} />
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600 }}>
                      <input type="checkbox" checked={contact.is_primary} onChange={e => setContact(c => ({ ...c, is_primary: e.target.checked }))} />
                      Contacto principal
                    </label>
                  </div>
                  <div><button className="btn btn-primary btn-sm" onClick={addContact}><Plus size={13} /> Agregar</button></div>
                </div>
              )}
            </>
          )}

          {tab === 'ubicacion' && (
            <>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-500)' }}>Domicilio fiscal o de operación del proveedor.</p>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12 }}>
                <Field label="Calle"><input className="field-input" value={form.street || ''} onChange={e => set('street', e.target.value)} /></Field>
                <Field label="No. ext."><input className="field-input" value={form.ext_number || ''} onChange={e => set('ext_number', e.target.value)} /></Field>
                <Field label="No. int."><input className="field-input" value={form.int_number || ''} onChange={e => set('int_number', e.target.value)} /></Field>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="Colonia"><input className="field-input" value={form.colonia || ''} onChange={e => set('colonia', e.target.value)} /></Field>
                <Field label="Ciudad"><input className="field-input" value={form.city || ''} onChange={e => set('city', e.target.value)} /></Field>
                <Field label="Estado"><input className="field-input" value={form.state || ''} onChange={e => set('state', e.target.value)} /></Field>
                <Field label="C.P."><input className="field-input" value={form.zip_code || ''} onChange={e => set('zip_code', e.target.value)} /></Field>
                <Field label="País"><input className="field-input" value={form.country || ''} onChange={e => set('country', e.target.value)} /></Field>
              </div>
              {canWrite && (
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button className="btn btn-primary" disabled={saving} onClick={() => saveSection([
                    'street', 'ext_number', 'int_number', 'colonia', 'city', 'state', 'zip_code', 'country',
                  ])}>{saving ? 'Guardando…' : 'Guardar ubicación'}</button>
                </div>
              )}
            </>
          )}

          {tab === 'pagos' && (
            <>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-500)' }}>
                Datos bancarios para pagar al proveedor. La CLABE debe tener 18 dígitos.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="Banco"><input className="field-input" value={form.bank_name || ''} onChange={e => set('bank_name', e.target.value)} /></Field>
                <Field label="Tipo de cuenta">
                  <select className="field-input" value={form.bank_account_type || 'clabe'} onChange={e => set('bank_account_type', e.target.value)}>
                    {BANK_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                </Field>
                <Field label="CLABE">
                  <input className="field-input" style={{ fontFamily: 'ui-monospace, monospace' }} value={form.bank_clabe || ''} onChange={e => set('bank_clabe', e.target.value)} maxLength={18} />
                </Field>
                <Field label="Número de cuenta">
                  <input className="field-input" style={{ fontFamily: 'ui-monospace, monospace' }} value={form.bank_account || ''} onChange={e => set('bank_account', e.target.value)} />
                </Field>
                <Field label="Beneficiario">
                  <input className="field-input" value={form.bank_beneficiary || ''} onChange={e => set('bank_beneficiary', e.target.value)} placeholder={form.name} />
                </Field>
              </div>
              {canWrite && (
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button className="btn btn-primary" disabled={saving} onClick={() => saveSection([
                    'bank_name', 'bank_account_type', 'bank_clabe', 'bank_account', 'bank_beneficiary',
                  ])}>{saving ? 'Guardando…' : 'Guardar datos de pago'}</button>
                </div>
              )}
            </>
          )}

          {tab === 'documentos' && (
            <DocsBlock
              title={form.person_type === 'fisica' ? 'Documentos de persona física' : 'Documentos de persona moral'}
              hint="Carga los documentos generales del tipo de persona. El listado cambia si es física o moral."
              items={checklist.general || []}
              docs={docs}
              canWrite={canWrite}
              kinds={kindsForUpload}
              docKind={docKind}
              setDocKind={setDocKind}
              docNotes={docNotes}
              setDocNotes={setDocNotes}
              onUpload={uploadDoc}
              onRemove={removeDoc}
            />
          )}

          {tab === 'repse' && (
            <>
              <div style={{
                padding: 14, borderRadius: 12,
                border: `1.5px solid ${form.is_repse ? 'var(--teal-200)' : 'var(--sand-200)'}`,
                background: form.is_repse ? 'var(--teal-50)' : 'var(--sand-50)',
              }}>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: canWrite ? 'pointer' : 'default' }}>
                  <input
                    type="checkbox"
                    checked={!!form.is_repse}
                    disabled={!canWrite}
                    onChange={async (e) => {
                      const on = e.target.checked;
                      setSaving(true);
                      try {
                        const r = await rentalAPI.maintenance.providers.saveExpediente(tenantId, providerId, {
                          is_repse: on,
                          repse_status: on
                            ? (form.repse_status === 'no_aplica' ? 'pendiente' : form.repse_status)
                            : 'no_aplica',
                        });
                        setData(r.data);
                        setForm(r.data);
                        onChanged?.();
                      } catch (err) {
                        toast.error(errMsg(err, 'No se pudo actualizar REPSE'));
                      } finally { setSaving(false); }
                    }}
                    style={{ marginTop: 3 }}
                  />
                  <div>
                    <div style={{ fontWeight: 800 }}>Activar para servicios especializados (REPSE)</div>
                    <div style={{ fontSize: 13, color: 'var(--ink-500)', lineHeight: 1.55, marginTop: 4 }}>
                      Márcalo si este proveedor prestará servicios u obras especializadas ante la STPS.
                      Se solicitará su expediente REPSE: constancia, ICSOE, SISUB, opiniones IMSS/INFONAVIT y contrato.
                    </div>
                  </div>
                </label>
              </div>

              {!form.is_repse ? (
                <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-400)' }}>
                  El expediente REPSE solo se pide cuando el proveedor está activado para servicios especializados.
                </p>
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <Field label="No. de registro REPSE">
                      <input className="field-input" value={form.repse_registro || ''} onChange={e => set('repse_registro', e.target.value)} />
                    </Field>
                    <Field label="Folio">
                      <input className="field-input" value={form.repse_folio || ''} onChange={e => set('repse_folio', e.target.value)} />
                    </Field>
                    <Field label="Fecha de inscripción">
                      <input type="date" className="field-input" value={form.repse_registered_at || ''} onChange={e => set('repse_registered_at', e.target.value)} />
                    </Field>
                    <Field label="Vigencia">
                      <input type="date" className="field-input" value={form.repse_expires_at || ''} onChange={e => set('repse_expires_at', e.target.value)} />
                    </Field>
                    <Field label="Estatus del registro">
                      <select className="field-input" value={form.repse_status || 'pendiente'} onChange={e => set('repse_status', e.target.value)}>
                        {REPSE_STATUS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                      </select>
                    </Field>
                  </div>
                  <Field label="Actividades especializadas">
                    <textarea className="field-input" rows={2} value={form.repse_activity || ''} onChange={e => set('repse_activity', e.target.value)} placeholder="Ej. mantenimiento eléctrico, jardinería especializada…" />
                  </Field>
                  <Field label="Notas REPSE">
                    <textarea className="field-input" rows={2} value={form.repse_notes || ''} onChange={e => set('repse_notes', e.target.value)} />
                  </Field>
                  {canWrite && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button className="btn btn-primary" disabled={saving} onClick={() => saveSection([
                        'is_repse', 'repse_registro', 'repse_folio', 'repse_activity',
                        'repse_registered_at', 'repse_expires_at', 'repse_status', 'repse_notes',
                      ])}>{saving ? 'Guardando…' : 'Guardar datos REPSE'}</button>
                    </div>
                  )}
                  <DocsBlock
                    title="Documentos del expediente REPSE"
                    hint="Adjunta la constancia de inscripción y los soportes que pide la STPS para el alta como prestador de servicios especializados."
                    items={checklist.repse || []}
                    docs={(data.documents || []).filter(d => d.section === 'repse')}
                    canWrite={canWrite}
                    kinds={[...repseKinds, { key: 'otro', label: 'Otro' }]}
                    docKind={docKind}
                    setDocKind={setDocKind}
                    docNotes={docNotes}
                    setDocNotes={setDocNotes}
                    onUpload={(file) => { setDocSection('repse'); uploadDoc(file); }}
                    onRemove={removeDoc}
                  />
                </>
              )}
            </>
          )}
        </div>

        <div className="ops-report-foot">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--ink-400)' }}>
            <FolderOpen size={14} />
            {missingG || missingR
              ? `Faltan ${missingG} docs. generales${form.is_repse ? ` y ${missingR} REPSE` : ''}`
              : 'Expediente al corriente'}
          </div>
          <button className="btn btn-outline" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}

function DocsBlock({ title, hint, items, docs, canWrite, kinds, docKind, setDocKind, docNotes, setDocNotes, onUpload, onRemove }) {
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div>
        <div style={{ fontWeight: 800 }}>{title}</div>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--ink-500)', lineHeight: 1.55 }}>{hint}</p>
      </div>
      <div style={{ display: 'grid', gap: 6 }}>
        {items.map(i => (
          <div key={i.kind} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '8px 10px', borderRadius: 8, background: i.uploaded ? 'var(--teal-50)' : 'var(--sand-50)' }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{i.label}</span>
            <Chip ok={i.uploaded}>{i.uploaded ? `Cargado${i.count > 1 ? ` (${i.count})` : ''}` : 'Pendiente'}</Chip>
          </div>
        ))}
      </div>
      {canWrite && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select className="field-input" style={{ width: 260 }} value={docKind} onChange={e => setDocKind(e.target.value)}>
            {kinds.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
          </select>
          <input className="field-input" style={{ flex: 1, minWidth: 140 }} placeholder="Notas (opcional)" value={docNotes} onChange={e => setDocNotes(e.target.value)} />
          <label className="btn btn-outline" style={{ cursor: 'pointer' }}>
            <Upload size={13} /> Cargar
            <input type="file" hidden onChange={e => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = ''; }} />
          </label>
        </div>
      )}
      {docs.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>Sin documentos cargados en este apartado.</div>
      ) : docs.map(d => (
        <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', border: '1px solid var(--sand-100)', borderRadius: 8 }}>
          <FileText size={14} color="var(--teal-600)" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700 }}>{d.original_name || 'Documento'}</div>
            <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>{d.kind_label || d.kind}{d.notes ? ` · ${d.notes}` : ''}</div>
          </div>
          {d.file_url && <a href={d.file_url} target="_blank" rel="noreferrer" className="btn-ghost" style={{ color: 'var(--teal-600)', fontSize: 12 }}>Ver</a>}
          {canWrite && <button className="btn-ghost" style={{ color: 'var(--coral-500)' }} onClick={() => onRemove(d)}><Trash2 size={13} /></button>}
        </div>
      ))}
    </div>
  );
}

export function AskExpedienteModal({ provider, onYes, onNo }) {
  return (
    <div className="ops-report-overlay" onClick={onNo}>
      <div className="ops-report-modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
        <div className="ops-report-head">
          <div style={{ fontWeight: 800 }}>Expediente digital</div>
          <button className="btn-icon" onClick={onNo}><X size={18} /></button>
        </div>
        <div className="ops-report-body" style={{ display: 'grid', gap: 12 }}>
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: 'var(--ink-700)' }}>
            ¿Requieres dar de alta el expediente digital de <strong>{provider.trade_name || provider.name}</strong>?
          </p>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-500)', lineHeight: 1.65 }}>
            Se incluirá la información general ya capturada y podrás agregar contactos, ubicación,
            datos bancarios y documentos según sea persona física o moral.
            Si el proveedor prestará servicios especializados, también se solicita su expediente REPSE.
          </p>
        </div>
        <div className="ops-report-foot">
          <button className="btn btn-outline" onClick={onNo}>Ahora no</button>
          <button className="btn btn-primary" onClick={onYes}>Sí, abrir expediente</button>
        </div>
      </div>
    </div>
  );
}
