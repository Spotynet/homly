import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, Search, Wrench } from 'lucide-react';
import { rentalPortalAPI } from '../api/client';

const PRIORITIES = [
  ['media', 'Normal'],
  ['alta', 'Importante'],
  ['urgente', 'Urgente (riesgo o sin servicio)'],
];
const STATUS_TXT = {
  nueva: 'Recibida', en_proceso: 'En atención', resuelta: 'Resuelta', cerrada: 'Cerrada', rechazada: 'No procede',
};

const wrap = { minHeight: '100vh', background: 'var(--sand-50, #faf7f2)', padding: '28px 16px' };
const box = { maxWidth: 560, margin: '0 auto' };
const card = { background: '#fff', border: '1px solid var(--sand-100, #eee)', borderRadius: 16, padding: 22, boxShadow: '0 2px 12px rgba(0,0,0,0.04)' };

function Field({ label, error, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div className="field-label">{label}</div>
      {children}
      {error && <div style={{ color: 'var(--coral-600, #c0392b)', fontSize: 12, marginTop: 4 }}>{error}</div>}
    </div>
  );
}

export default function PublicSolicitud() {
  const { token } = useParams();
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    property: '', space: '', category: '', title: '', description: '', priority: 'media',
    requester_name: '', requester_email: '', requester_phone: '', website: '',
  });
  const [errors, setErrors] = useState({});
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(null);
  const [lookup, setLookup] = useState({ folio: '', email: '' });
  const [found, setFound] = useState(null);
  const [lookupError, setLookupError] = useState('');

  useEffect(() => {
    rentalPortalAPI.info(token).then(r => setInfo(r.data)).catch(() => setError('Este portal de solicitudes no está disponible.'));
  }, [token]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setSending(true);
    setErrors({});
    try {
      const { data } = await rentalPortalAPI.submit(token, form);
      setDone(data);
    } catch (err) {
      const d = err.response?.data;
      if (err.response?.status === 429) setErrors({ _: 'Has enviado demasiadas solicitudes. Intenta más tarde.' });
      else if (d && typeof d === 'object') setErrors(d);
      else setErrors({ _: 'No pudimos enviar tu solicitud. Intenta de nuevo.' });
    } finally {
      setSending(false);
    }
  };

  const check = async (e) => {
    e.preventDefault();
    setFound(null);
    setLookupError('');
    try {
      const { data } = await rentalPortalAPI.status(token, lookup);
      setFound(data);
    } catch (err) {
      setLookupError(err.response?.data?.detail || 'No pudimos consultar tu solicitud.');
    }
  };

  if (error) {
    return (
      <div style={wrap}><div style={box}><div style={{ ...card, textAlign: 'center', color: 'var(--ink-500)' }}>{error}</div></div></div>
    );
  }
  if (!info) return <div style={{ ...wrap, textAlign: 'center', color: 'var(--ink-400)' }}>Cargando…</div>;

  return (
    <div style={wrap}>
      <div style={box}>
        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <div style={{ display: 'inline-flex', width: 46, height: 46, borderRadius: 14, background: 'var(--teal-50, #e6f4ee)', color: 'var(--teal-700, #175f45)', alignItems: 'center', justifyContent: 'center' }}>
            <Wrench size={22} />
          </div>
          <h1 style={{ fontSize: 24, margin: '10px 0 4px' }}>{info.name}</h1>
          <div style={{ color: 'var(--ink-500)', fontSize: 14 }}>{info.welcome || 'Reporta un problema o solicita un servicio de mantenimiento.'}</div>
        </div>

        {done ? (
          <div style={{ ...card, textAlign: 'center' }}>
            <CheckCircle2 size={40} style={{ color: 'var(--teal-600, #2a9d73)' }} />
            <h2 style={{ margin: '10px 0 4px' }}>¡Solicitud enviada!</h2>
            <p style={{ color: 'var(--ink-500)', fontSize: 14 }}>{done.message}</p>
            <div style={{ fontSize: 13, color: 'var(--ink-400)' }}>Tu folio</div>
            <div style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 24, color: 'var(--teal-700, #175f45)' }}>{done.folio}</div>
            <p style={{ fontSize: 12, color: 'var(--ink-400)' }}>Guárdalo para consultar el avance con tu correo.</p>
            <button className="btn btn-outline" onClick={() => { setDone(null); setForm(f => ({ ...f, title: '', description: '' })); }}>Enviar otra solicitud</button>
          </div>
        ) : (
          <form onSubmit={submit} style={card}>
            <Field label="Inmueble o unidad *" error={errors.property}>
              <select className="field-input" value={form.property} onChange={e => setForm(f => ({ ...f, property: e.target.value, space: '' }))}>
                <option value="">Selecciona…</option>
                {info.properties.map(p => <option key={p.id} value={p.id}>{p.name} · {p.code}</option>)}
              </select>
            </Field>
            {(info.properties.find(p => p.id === form.property)?.spaces || []).length > 0 && (
              <Field label="Local o espacio" error={errors.space}>
                <select className="field-input" value={form.space} onChange={e => set('space', e.target.value)}>
                  <option value="">Áreas comunes / no aplica</option>
                  {info.properties.find(p => p.id === form.property).spaces.map(s => <option key={s.id} value={s.id}>{s.code}{s.name ? ` — ${s.name}` : ''}</option>)}
                </select>
              </Field>
            )}
            <Field label="¿Qué sucede? *" error={errors.title}>
              <input className="field-input" maxLength={240} value={form.title} onChange={e => set('title', e.target.value)} placeholder="Ej. Fuga de agua en el baño" />
            </Field>
            <Field label="Detalles" error={errors.description}>
              <textarea className="field-input" rows={3} value={form.description} onChange={e => set('description', e.target.value)} />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              {info.categories.length > 0 && (
                <Field label="Tipo de servicio">
                  <select className="field-input" value={form.category} onChange={e => set('category', e.target.value)}>
                    <option value="">Otro / no sé</option>
                    {info.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </Field>
              )}
              <Field label="Urgencia">
                <select className="field-input" value={form.priority} onChange={e => set('priority', e.target.value)}>
                  {PRIORITIES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Tu nombre *" error={errors.requester_name}>
              <input className="field-input" value={form.requester_name} onChange={e => set('requester_name', e.target.value)} />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              <Field label="Correo" error={errors.requester_email}>
                <input type="email" className="field-input" value={form.requester_email} onChange={e => set('requester_email', e.target.value)} />
              </Field>
              <Field label="Teléfono">
                <input className="field-input" value={form.requester_phone} onChange={e => set('requester_phone', e.target.value)} />
              </Field>
            </div>
            {/* Honeypot anti-spam */}
            <input tabIndex={-1} autoComplete="off" value={form.website} onChange={e => set('website', e.target.value)}
              style={{ position: 'absolute', left: -9999, opacity: 0, height: 0 }} aria-hidden="true" />
            {errors._ && <div style={{ color: 'var(--coral-600)', fontSize: 13, marginBottom: 8 }}>{errors._}</div>}
            <button className="btn btn-primary" style={{ width: '100%' }} disabled={sending}>{sending ? 'Enviando…' : 'Enviar solicitud'}</button>
          </form>
        )}

        <form onSubmit={check} style={{ ...card, marginTop: 16 }}>
          <div style={{ fontWeight: 800, marginBottom: 10, display: 'flex', gap: 8, alignItems: 'center' }}><Search size={16} /> Consultar una solicitud</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
            <input className="field-input" placeholder="Folio (SOL-2026-0001)" value={lookup.folio} onChange={e => setLookup(l => ({ ...l, folio: e.target.value }))} />
            <input className="field-input" type="email" placeholder="Correo con el que la enviaste" value={lookup.email} onChange={e => setLookup(l => ({ ...l, email: e.target.value }))} />
          </div>
          <button className="btn btn-outline btn-sm" style={{ marginTop: 10 }} disabled={!lookup.folio || !lookup.email}>Consultar</button>
          {lookupError && <div style={{ color: 'var(--coral-600)', fontSize: 13, marginTop: 8 }}>{lookupError}</div>}
          {found && (
            <div style={{ marginTop: 12, fontSize: 14 }}>
              <b>{found.folio}</b> · {found.title}
              <div style={{ color: 'var(--ink-500)', fontSize: 13 }}>{found.property}</div>
              <div style={{ marginTop: 6 }}>Estado: <b>{STATUS_TXT[found.status] || found.status_label}</b></div>
              {found.resolution_notes && <div style={{ marginTop: 6, color: 'var(--ink-600)' }}>{found.resolution_notes}</div>}
            </div>
          )}
        </form>
        <div style={{ textAlign: 'center', marginTop: 18, fontSize: 11, color: 'var(--ink-400)' }}>Con tecnología de Homly</div>
      </div>
    </div>
  );
}
