import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Check, FileText, PenLine, Scale, Send, Trash2, X } from 'lucide-react';
import { rentalAPI } from '../../api/client';
import { LEGAL_STAGES } from './rentalUtils';

const STEPS = [
  ['entrevista', 'Entrevista'],
  ['redaccion', 'Redacción'],
  ['presentacion', 'Presentación'],
  ['firmas', 'Firmas'],
  ['publicar', 'Publicar'],
];

function errMsg(e, fallback) {
  const d = e?.response?.data?.detail;
  return typeof d === 'string' ? d : fallback;
}

const EMPTY_BRIEF = {
  purpose: '',
  city: '',
  jurisdiction: 'los Estados Unidos Mexicanos',
  payment_terms: '',
  special_clauses: '',
  include_deposit: false,
  include_guarantor: false,
  include_inventory: false,
  include_confidentiality: false,
  include_termination: true,
  include_repse: false,
  include_maintenance: false,
};

export default function RentalLegalAssistant({ tenantId, contractId, onClose, onChanged }) {
  const [step, setStep] = useState('entrevista');
  const [data, setData] = useState(null);
  const [brief, setBrief] = useState({ ...EMPTY_BRIEF });
  const [body, setBody] = useState('');
  const [html, setHtml] = useState('');
  const [signer, setSigner] = useState({ signer_name: '', signer_role: '', signer_email: '' });
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const r = await rentalAPI.contracts.get(tenantId, contractId);
      setData(r.data);
      setBrief({ ...EMPTY_BRIEF, ...(r.data.assistant_brief || {}) });
      setBody(r.data.body || '');
      if (r.data.legal_stage === 'publicado') setStep('publicar');
      else if (r.data.legal_stage === 'firmas') setStep('firmas');
      else if (r.data.body) setStep('redaccion');
    } catch {
      toast.error('No se pudo abrir el asistente');
      onClose();
    }
  };

  useEffect(() => { load(); }, [tenantId, contractId]);

  const setB = (k, v) => setBrief(b => ({ ...b, [k]: v }));

  const generate = async () => {
    setBusy(true);
    try {
      const r = await rentalAPI.contracts.draft(tenantId, contractId, { brief });
      setData(r.data);
      setBody(r.data.body || '');
      setStep('redaccion');
      toast.success('Redacción generada. Revísala antes de presentar.');
      onChanged?.();
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo redactar'));
    } finally { setBusy(false); }
  };

  const saveBody = async () => {
    setBusy(true);
    try {
      const r = await rentalAPI.contracts.update(tenantId, contractId, { body, legal_stage: data.legal_stage === 'none' ? 'redaccion' : data.legal_stage });
      setData(r.data);
      toast.success('Borrador guardado');
      onChanged?.();
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo guardar'));
    } finally { setBusy(false); }
  };

  const present = async () => {
    setBusy(true);
    try {
      if (body !== data.body) {
        await rentalAPI.contracts.update(tenantId, contractId, { body });
      }
      const r = await rentalAPI.contracts.present(tenantId, contractId);
      setHtml(r.data.html || '');
      setStep('presentacion');
    } catch (e) {
      toast.error(errMsg(e, 'No hay texto para presentar'));
    } finally { setBusy(false); }
  };

  const addSigner = async () => {
    if (!signer.signer_name.trim()) return toast.error('Nombre de quien firma');
    try {
      await rentalAPI.contracts.addSigner(tenantId, contractId, signer);
      setSigner({ signer_name: '', signer_role: '', signer_email: '' });
      load();
      onChanged?.();
    } catch (e) { toast.error(errMsg(e, 'No se pudo agregar')); }
  };

  const doSign = async (sig) => {
    const name = window.prompt('Escribe tu nombre completo para el acuse de firma', sig.signer_name);
    if (!name) return;
    try {
      await rentalAPI.contracts.sign(tenantId, contractId, sig.id, { signed_name: name });
      toast.success('Firma registrada');
      load();
      onChanged?.();
    } catch (e) { toast.error(errMsg(e, 'No se pudo firmar')); }
  };

  const removeSig = async (sig) => {
    if (!window.confirm(`¿Quitar a ${sig.signer_name}?`)) return;
    try {
      await rentalAPI.contracts.removeSigner(tenantId, contractId, sig.id);
      load();
    } catch (e) { toast.error(errMsg(e, 'No se pudo quitar')); }
  };

  const publish = async (activate) => {
    setBusy(true);
    try {
      const r = await rentalAPI.contracts.publish(tenantId, contractId, {
        body, activate, require_signatures: false,
      });
      setData(r.data);
      toast.success(activate ? 'Contrato publicado y activado' : 'Contrato publicado');
      onChanged?.();
      setStep('publicar');
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo publicar'));
    } finally { setBusy(false); }
  };

  if (!data) {
    return (
      <div className="ops-report-overlay" onClick={onClose}>
        <div className="ops-report-modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
          <div className="ops-report-body" style={{ padding: 36, textAlign: 'center', color: 'var(--ink-400)' }}>
            Abriendo asistente legal…
          </div>
        </div>
      </div>
    );
  }

  const stage = LEGAL_STAGES[data.legal_stage] || LEGAL_STAGES.none;
  const sigs = data.signatures || [];

  return (
    <div className="ops-report-overlay" onClick={onClose}>
      <div className="ops-report-modal" style={{ maxWidth: 860, width: 'min(860px, 96vw)' }} onClick={e => e.stopPropagation()}>
        <div className="ops-report-head">
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', color: 'var(--teal-600)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Scale size={13} /> Asistente legal
            </div>
            <div style={{ fontWeight: 800, fontSize: 18 }}>{data.title || data.code}</div>
            <div style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: 2 }}>
              {data.code} · {data.kind_label} · {data.counterpart_label}
              <span className="proj-chip" style={{ marginLeft: 8, color: stage.color, background: stage.bg }}>{stage.label}</span>
            </div>
          </div>
          <button className="btn-icon" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="tabs" style={{ padding: '0 20px', marginTop: 8 }}>
          {STEPS.map(([k, label]) => (
            <button key={k} className={`tab ${step === k ? 'active' : ''}`} onClick={() => setStep(k)}>{label}</button>
          ))}
        </div>

        <div className="ops-report-body" style={{ display: 'grid', gap: 14, maxHeight: '66vh', overflow: 'auto' }}>
          {step === 'entrevista' && (
            <>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-500)', lineHeight: 1.6 }}>
                El asistente usa los datos ya ligados al contrato (propiedad, cliente, proveedor, servicio)
                y esta entrevista para redactar. Revisa siempre el texto; no sustituye a un abogado titulado.
              </p>
              <Field label="Objeto / propósito">
                <textarea className="field-input" rows={2} value={brief.purpose} onChange={e => setB('purpose', e.target.value)} placeholder="Para qué se celebra este contrato" />
              </Field>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="Ciudad de celebración">
                  <input className="field-input" value={brief.city} onChange={e => setB('city', e.target.value)} placeholder="Ciudad de México" />
                </Field>
                <Field label="Jurisdicción">
                  <input className="field-input" value={brief.jurisdiction} onChange={e => setB('jurisdiction', e.target.value)} />
                </Field>
              </div>
              <Field label="Condiciones de pago">
                <textarea className="field-input" rows={2} value={brief.payment_terms} onChange={e => setB('payment_terms', e.target.value)} placeholder="Transferencia a 15 días, contra factura…" />
              </Field>
              <Field label="Cláusulas especiales">
                <textarea className="field-input" rows={3} value={brief.special_clauses} onChange={e => setB('special_clauses', e.target.value)} />
              </Field>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {[
                  ['include_deposit', 'Depósito en garantía'],
                  ['include_guarantor', 'Fiador / obligado solidario'],
                  ['include_inventory', 'Inventario de entrega'],
                  ['include_maintenance', 'Conservación del inmueble'],
                  ['include_confidentiality', 'Confidencialidad'],
                  ['include_termination', 'Terminación anticipada'],
                  ['include_repse', 'Cláusula REPSE'],
                ].map(([k, label]) => (
                  <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600 }}>
                    <input type="checkbox" checked={!!brief[k]} onChange={e => setB(k, e.target.checked)} />
                    {label}
                  </label>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button className="btn btn-primary" disabled={busy} onClick={generate}>
                  <PenLine size={14} /> {busy ? 'Redactando…' : 'Redactar contrato'}
                </button>
              </div>
            </>
          )}

          {step === 'redaccion' && (
            <>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-500)' }}>
                Edita el texto. Puedes volver a la entrevista y regenerar; se reemplazará esta redacción.
              </p>
              <textarea className="field-input" rows={18} value={body} onChange={e => setBody(e.target.value)} style={{ fontFamily: 'ui-serif, Georgia, serif', lineHeight: 1.55 }} />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button className="btn btn-outline" disabled={busy} onClick={saveBody}>Guardar borrador</button>
                <button className="btn btn-primary" disabled={busy || !body.trim()} onClick={present}>
                  <FileText size={14} /> Presentar
                </button>
              </div>
            </>
          )}

          {step === 'presentacion' && (
            <>
              {!html ? (
                <div style={{ color: 'var(--ink-400)' }}>Genera la redacción para ver la presentación.</div>
              ) : (
                <div
                  style={{
                    background: '#fff', border: '1px solid var(--sand-200)', borderRadius: 12,
                    padding: 24, fontFamily: 'ui-serif, Georgia, serif', lineHeight: 1.65, fontSize: 14,
                  }}
                  dangerouslySetInnerHTML={{ __html: html }}
                />
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button className="btn btn-outline" onClick={() => window.print()}>Imprimir</button>
                <button className="btn btn-primary" onClick={() => setStep('firmas')}>Continuar a firmas</button>
              </div>
            </>
          )}

          {step === 'firmas' && (
            <>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-500)' }}>
                Agrega a las partes que deben firmar. Cada una deja un acuse con su nombre.
              </p>
              {sigs.map(s => (
                <div key={s.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 12px', border: '1px solid var(--sand-100)', borderRadius: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700 }}>{s.signer_name} {s.signer_role ? <span style={{ color: 'var(--ink-400)', fontWeight: 500 }}>· {s.signer_role}</span> : null}</div>
                    <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>
                      {s.status === 'firmado' ? `Firmado${s.signed_at ? ` · ${String(s.signed_at).slice(0, 10)}` : ''}` : 'Pendiente'}
                      {s.signed_name ? ` · ${s.signed_name}` : ''}
                    </div>
                  </div>
                  {s.status !== 'firmado' && <button className="btn btn-primary btn-sm" onClick={() => doSign(s)}><PenLine size={13} /> Firmar</button>}
                  {s.status === 'firmado' && <Check size={16} color="var(--teal-600)" />}
                  <button className="btn-icon" style={{ color: 'var(--coral-500)' }} onClick={() => removeSig(s)}><Trash2 size={14} /></button>
                </div>
              ))}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 8, alignItems: 'end' }}>
                <input className="field-input" placeholder="Nombre *" value={signer.signer_name} onChange={e => setSigner(s => ({ ...s, signer_name: e.target.value }))} />
                <input className="field-input" placeholder="Rol (arrendador, inquilino…)" value={signer.signer_role} onChange={e => setSigner(s => ({ ...s, signer_role: e.target.value }))} />
                <input className="field-input" placeholder="Correo" value={signer.signer_email} onChange={e => setSigner(s => ({ ...s, signer_email: e.target.value }))} />
                <button className="btn btn-outline" onClick={addSigner}>Agregar</button>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button className="btn btn-primary" onClick={() => setStep('publicar')}>Ir a publicar</button>
              </div>
            </>
          )}

          {step === 'publicar' && (
            <>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-500)', lineHeight: 1.65 }}>
                Al publicar se congela la versión oficial del contrato. Puedes activarlo para que
                {data.kind === 'renta' ? ' entre en cobranza y rent roll.' : ' quede vigente en el espacio.'}
              </p>
              {data.published_at && (
                <div style={{ padding: 12, borderRadius: 10, background: 'var(--teal-50)', color: 'var(--teal-700)', fontWeight: 700 }}>
                  Publicado el {String(data.published_at).slice(0, 10)}
                </div>
              )}
              <div style={{ fontSize: 13, color: 'var(--ink-400)' }}>
                Firmas: {(data.signed_count || 0)} / {(data.signature_count || 0)}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button className="btn btn-outline" disabled={busy || !body.trim()} onClick={() => publish(false)}>
                  <Send size={14} /> Publicar
                </button>
                {data.status === 'borrador' && (
                  <button className="btn btn-primary" disabled={busy || !body.trim()} onClick={() => publish(true)}>
                    Publicar y activar
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        <div className="ops-report-foot">
          <span style={{ fontSize: 12, color: 'var(--ink-400)' }}>Asistencia de redacción. Revisión legal a cargo del usuario.</span>
          <button className="btn btn-outline" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="field" style={{ margin: 0 }}>
      <div className="field-label">{label}</div>
      {children}
    </div>
  );
}
