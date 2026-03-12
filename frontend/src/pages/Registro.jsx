import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { COUNTRIES, getStatesForCountry, HomlyBrand } from '../utils/helpers';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

/* ─── Brand colors ─── */
const C = {
  coral:     '#E85D43',
  coralDark: '#D04E37',
  coralBg:   '#FFF5F2',
  coralBd:   '#FFE4DC',
  green:     '#124A36',
  greenMid:  '#1F7D5B',
  greenBg:   '#EFFAF6',
  cream:     '#FDFBF7',
  sand:      '#F3EDE4',
  sandBd:    '#E8DFD1',
  ink9:      '#1A1612',
  ink7:      '#443D33',
  ink5:      '#7A7166',
  ink4:      '#9E9588',
  ink3:      '#B8B0A5',
};

/* ─── Logo brand using real SVG assets ─── */
const LogoFull = () => <HomlyBrand iconSize={36} nameHeight={24} />;

/* ─── Small icons ─── */
const IconCheck = ({ size = 16, color = C.greenMid }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);
const IconArrow = ({ left = false }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    {left
      ? <><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></>
      : <><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></>
    }
  </svg>
);
const IconBuilding = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.coral} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 9h.01M15 9h.01M9 15h.01M15 15h.01M9 21v-6h6v6" />
  </svg>
);
const IconUser = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.coral} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
  </svg>
);
const IconStar = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.coral} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
);

/* ─── Shared input style ─── */
const inputStyle = (hasError = false) => ({
  width: '100%',
  padding: '11px 14px',
  borderRadius: 10,
  border: `1.5px solid ${hasError ? C.coral : C.sandBd}`,
  background: '#fff',
  fontSize: 14,
  color: C.ink9,
  outline: 'none',
  fontFamily: 'inherit',
  transition: 'border-color 0.2s',
  boxSizing: 'border-box',
});
const labelStyle = {
  display: 'block',
  fontSize: 13,
  fontWeight: 600,
  color: C.ink7,
  marginBottom: 6,
};
const errorStyle = {
  fontSize: 12,
  color: C.coral,
  marginTop: 4,
  fontWeight: 500,
};

/* ═══════════════════════════════════════
   STEPS CONFIG
   ═══════════════════════════════════════ */
const STEPS = [
  { id: 1, label: 'Condominio', icon: <IconBuilding /> },
  { id: 2, label: 'Responsable', icon: <IconUser /> },
  { id: 3, label: 'Confirmar', icon: <IconStar /> },
];

const ADMIN_TYPES = [
  { value: 'mesa_directiva', label: 'Mesa Directiva' },
  { value: 'administrador',  label: 'Administrador Externo' },
  { value: 'comite',         label: 'Comité' },
];
const CURRENCIES = [
  { value: 'MXN', label: 'MXN — Peso Mexicano' },
  { value: 'USD', label: 'USD — Dólar' },
  { value: 'COP', label: 'COP — Peso Colombiano' },
  { value: 'EUR', label: 'EUR — Euro' },
];

/* ═══════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════ */
export default function Registro() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const [form, setForm] = useState({
    // Step 1 — Condominio
    condominio_nombre:     '',
    condominio_pais:       '',
    condominio_estado:     '',
    condominio_ciudad:     '',
    condominio_unidades:   '',
    condominio_tipo_admin: 'mesa_directiva',
    condominio_currency:   'MXN',
    // Step 2 — Admin
    admin_nombre:    '',
    admin_apellido:  '',
    admin_email:     '',
    admin_telefono:  '',
    admin_cargo:     '',
    mensaje:         '',
  });

  const set = (key, val) => {
    setForm(f => ({ ...f, [key]: val }));
    setErrors(e => ({ ...e, [key]: '' }));
    // Reset estado when pais changes
    if (key === 'condominio_pais') {
      setForm(f => ({ ...f, condominio_pais: val, condominio_estado: '' }));
    }
  };

  const states = getStatesForCountry(form.condominio_pais);

  /* ── Validation ── */
  const validateStep1 = () => {
    const e = {};
    if (!form.condominio_nombre.trim()) e.condominio_nombre = 'Nombre requerido';
    if (!form.condominio_pais)          e.condominio_pais   = 'Selecciona un país';
    if (!form.condominio_unidades || parseInt(form.condominio_unidades) < 1)
      e.condominio_unidades = 'Ingresa el número de unidades';
    return e;
  };

  const validateStep2 = () => {
    const e = {};
    if (!form.admin_nombre.trim())   e.admin_nombre   = 'Nombre requerido';
    if (!form.admin_apellido.trim()) e.admin_apellido = 'Apellido requerido';
    if (!form.admin_email.trim())    e.admin_email    = 'Correo requerido';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.admin_email))
      e.admin_email = 'Correo inválido';
    return e;
  };

  const goNext = () => {
    const e = step === 1 ? validateStep1() : step === 2 ? validateStep2() : {};
    if (Object.keys(e).length) { setErrors(e); return; }
    setStep(s => s + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const goBack = () => {
    setStep(s => s - 1);
    setErrors({});
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      await axios.post(`${API_BASE}/public/registro/`, {
        ...form,
        condominio_unidades: parseInt(form.condominio_unidades) || 0,
      });
      setStep(4); // success screen
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      const detail = err?.response?.data;
      if (detail && typeof detail === 'object') {
        const flat = {};
        Object.entries(detail).forEach(([k, v]) => {
          flat[k] = Array.isArray(v) ? v[0] : v;
        });
        setErrors(flat);
        // Return to step where error belongs
        const step1Keys = ['condominio_nombre','condominio_pais','condominio_unidades','condominio_tipo_admin','condominio_currency'];
        const hasStep1 = step1Keys.some(k => flat[k]);
        setStep(hasStep1 ? 1 : 2);
      } else {
        setErrors({ general: 'Error al enviar la solicitud. Intenta de nuevo.' });
      }
    } finally {
      setLoading(false);
    }
  };

  /* ── Success screen ── */
  if (step === 4) {
    return (
      <PageShell>
        <div style={{ textAlign: 'center', padding: '60px 32px' }}>
          <div style={{ width: 80, height: 80, borderRadius: '50%', background: C.greenBg, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={C.greenMid} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h2 style={{ fontSize: 30, fontWeight: 800, color: C.green, marginBottom: 12, letterSpacing: '-0.5px' }}>
            ¡Solicitud enviada!
          </h2>
          <p style={{ fontSize: 16, color: C.ink5, lineHeight: 1.7, maxWidth: 460, margin: '0 auto 32px' }}>
            Recibimos los datos de <strong style={{ color: C.ink7 }}>{form.condominio_nombre}</strong>.
            Nuestro equipo se pondrá en contacto con <strong style={{ color: C.ink7 }}>{form.admin_email}</strong> en las próximas 24 horas.
          </p>
          <Link to="/" style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: C.coral, color: '#fff',
            padding: '12px 28px', borderRadius: 999,
            fontWeight: 700, fontSize: 15, textDecoration: 'none',
          }}>
            Volver al inicio
          </Link>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      {/* ── Stepper ── */}
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '0 clamp(12px, 4vw, 20px) 40px' }}>

        <Stepper current={step} />

        {/* ── STEP 1: Condominio ── */}
        {step === 1 && (
          <StepCard title="Datos del condominio" subtitle="Cuéntanos sobre el condominio que deseas administrar con Homly.">

            <FormField label="Nombre del condominio *" error={errors.condominio_nombre}>
              <input
                style={inputStyle(!!errors.condominio_nombre)}
                placeholder="Ej. Residencial Los Pinos"
                value={form.condominio_nombre}
                onChange={e => set('condominio_nombre', e.target.value)}
              />
            </FormField>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <FormField label="País *" error={errors.condominio_pais}>
                <select
                  style={inputStyle(!!errors.condominio_pais)}
                  value={form.condominio_pais}
                  onChange={e => set('condominio_pais', e.target.value)}
                >
                  <option value="">Selecciona</option>
                  {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </FormField>

              <FormField label="Estado / Provincia">
                {states.length > 0
                  ? (
                    <select
                      style={inputStyle()}
                      value={form.condominio_estado}
                      onChange={e => set('condominio_estado', e.target.value)}
                    >
                      <option value="">Selecciona</option>
                      {states.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  ) : (
                    <input
                      style={inputStyle()}
                      placeholder="Ej. Jalisco"
                      value={form.condominio_estado}
                      onChange={e => set('condominio_estado', e.target.value)}
                    />
                  )
                }
              </FormField>
            </div>

            <FormField label="Ciudad">
              <input
                style={inputStyle()}
                placeholder="Ej. Guadalajara"
                value={form.condominio_ciudad}
                onChange={e => set('condominio_ciudad', e.target.value)}
              />
            </FormField>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <FormField label="Número de unidades *" error={errors.condominio_unidades}>
                <input
                  type="number"
                  min="1"
                  style={inputStyle(!!errors.condominio_unidades)}
                  placeholder="Ej. 48"
                  value={form.condominio_unidades}
                  onChange={e => set('condominio_unidades', e.target.value)}
                />
              </FormField>

              <FormField label="Moneda">
                <select
                  style={inputStyle()}
                  value={form.condominio_currency}
                  onChange={e => set('condominio_currency', e.target.value)}
                >
                  {CURRENCIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </FormField>
            </div>

            <FormField label="Tipo de administración">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
                {ADMIN_TYPES.map(t => (
                  <label key={t.value} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 14px',
                    borderRadius: 10,
                    border: `1.5px solid ${form.condominio_tipo_admin === t.value ? C.coral : C.sandBd}`,
                    background: form.condominio_tipo_admin === t.value ? C.coralBg : '#fff',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}>
                    <div style={{
                      width: 18, height: 18, borderRadius: '50%',
                      border: `2px solid ${form.condominio_tipo_admin === t.value ? C.coral : C.sandBd}`,
                      background: form.condominio_tipo_admin === t.value ? C.coral : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0, transition: 'all 0.15s',
                    }}>
                      {form.condominio_tipo_admin === t.value && (
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />
                      )}
                    </div>
                    <input
                      type="radio"
                      style={{ display: 'none' }}
                      checked={form.condominio_tipo_admin === t.value}
                      onChange={() => set('condominio_tipo_admin', t.value)}
                    />
                    <span style={{ fontSize: 14, fontWeight: 600, color: form.condominio_tipo_admin === t.value ? C.coralDark : C.ink7 }}>
                      {t.label}
                    </span>
                  </label>
                ))}
              </div>
            </FormField>

            <NavButtons onNext={goNext} />
          </StepCard>
        )}

        {/* ── STEP 2: Administrador ── */}
        {step === 2 && (
          <StepCard title="Datos del administrador" subtitle="¿Quién será el responsable de la cuenta? Esta persona recibirá las credenciales de acceso.">

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <FormField label="Nombre(s) *" error={errors.admin_nombre}>
                <input
                  style={inputStyle(!!errors.admin_nombre)}
                  placeholder="Ej. Carlos"
                  value={form.admin_nombre}
                  onChange={e => set('admin_nombre', e.target.value)}
                />
              </FormField>

              <FormField label="Apellido(s) *" error={errors.admin_apellido}>
                <input
                  style={inputStyle(!!errors.admin_apellido)}
                  placeholder="Ej. Rodríguez"
                  value={form.admin_apellido}
                  onChange={e => set('admin_apellido', e.target.value)}
                />
              </FormField>
            </div>

            <FormField label="Correo electrónico *" error={errors.admin_email}>
              <input
                type="email"
                style={inputStyle(!!errors.admin_email)}
                placeholder="correo@ejemplo.com"
                value={form.admin_email}
                onChange={e => set('admin_email', e.target.value)}
              />
            </FormField>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <FormField label="Teléfono" error={errors.admin_telefono}>
                <input
                  type="tel"
                  style={inputStyle(!!errors.admin_telefono)}
                  placeholder="Ej. +52 33 1234 5678"
                  value={form.admin_telefono}
                  onChange={e => set('admin_telefono', e.target.value)}
                />
              </FormField>

              <FormField label="Cargo / Rol">
                <input
                  style={inputStyle()}
                  placeholder="Ej. Presidente"
                  value={form.admin_cargo}
                  onChange={e => set('admin_cargo', e.target.value)}
                />
              </FormField>
            </div>

            <FormField label="¿Algo más que quieras contarnos?">
              <textarea
                style={{ ...inputStyle(), minHeight: 90, resize: 'vertical' }}
                placeholder="Comentarios, requerimientos especiales, preguntas..."
                value={form.mensaje}
                onChange={e => set('mensaje', e.target.value)}
              />
            </FormField>

            {errors.general && (
              <div style={{ padding: '12px 14px', background: C.coralBg, border: `1px solid ${C.coralBd}`, borderRadius: 10, fontSize: 13, color: C.coralDark, fontWeight: 600 }}>
                {errors.general}
              </div>
            )}

            <NavButtons onBack={goBack} onNext={goNext} nextLabel="Revisar solicitud" />
          </StepCard>
        )}

        {/* ── STEP 3: Confirm ── */}
        {step === 3 && (
          <StepCard title="Revisa tu solicitud" subtitle="Confirma que los datos son correctos antes de enviar.">

            <SummarySection title="Condominio">
              <SummaryRow label="Nombre" value={form.condominio_nombre} />
              <SummaryRow label="País" value={form.condominio_pais} />
              {form.condominio_estado && <SummaryRow label="Estado" value={form.condominio_estado} />}
              {form.condominio_ciudad && <SummaryRow label="Ciudad" value={form.condominio_ciudad} />}
              <SummaryRow label="Unidades" value={form.condominio_unidades} />
              <SummaryRow label="Moneda" value={form.condominio_currency} />
              <SummaryRow label="Administración" value={ADMIN_TYPES.find(t => t.value === form.condominio_tipo_admin)?.label} />
            </SummarySection>

            <SummarySection title="Administrador responsable">
              <SummaryRow label="Nombre" value={`${form.admin_nombre} ${form.admin_apellido}`} />
              <SummaryRow label="Correo" value={form.admin_email} />
              {form.admin_telefono && <SummaryRow label="Teléfono" value={form.admin_telefono} />}
              {form.admin_cargo && <SummaryRow label="Cargo" value={form.admin_cargo} />}
              {form.mensaje && <SummaryRow label="Notas" value={form.mensaje} />}
            </SummarySection>

            {errors.general && (
              <div style={{ padding: '12px 14px', background: C.coralBg, border: `1px solid ${C.coralBd}`, borderRadius: 10, fontSize: 13, color: C.coralDark, fontWeight: 600, marginBottom: 8 }}>
                {errors.general}
              </div>
            )}

            <NavButtons
              onBack={goBack}
              onNext={handleSubmit}
              nextLabel={loading ? 'Enviando...' : 'Enviar solicitud →'}
              loading={loading}
            />

            <p style={{ fontSize: 12, color: C.ink4, textAlign: 'center', marginTop: 16, lineHeight: 1.6 }}>
              Al enviar, aceptas que el equipo de Homly se ponga en contacto contigo
              para procesar tu solicitud de registro.
            </p>
          </StepCard>
        )}
      </div>
    </PageShell>
  );
}

/* ═══════════════════════════════════════
   SUB-COMPONENTS
   ═══════════════════════════════════════ */

function PageShell({ children }) {
  return (
    <div style={{ minHeight: '100vh', background: C.cream, fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}>
      {/* Nav */}
      <nav style={{
        background: 'rgba(253,251,247,0.95)',
        backdropFilter: 'blur(12px)',
        borderBottom: `1px solid ${C.sandBd}`,
        padding: '0 clamp(16px, 4vw, 32px)',
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link to="/" style={{ textDecoration: 'none' }}>
            <LogoFull />
          </Link>
          <Link to="/login" style={{
            fontSize: 13, fontWeight: 600, color: C.ink7,
            textDecoration: 'none', padding: '8px 16px',
            border: `1.5px solid ${C.sandBd}`, borderRadius: 999,
            transition: 'border-color 0.2s',
          }}>
            Ya tengo cuenta
          </Link>
        </div>
      </nav>

      {/* Hero header */}
      <div style={{ background: C.green, padding: 'clamp(36px, 6vw, 52px) clamp(16px, 4vw, 32px) clamp(40px, 6vw, 56px)', textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(232,93,67,0.15)', border: '1px solid rgba(232,93,67,0.3)', borderRadius: 999, padding: '5px 14px', fontSize: 13, fontWeight: 700, color: C.coral, marginBottom: 20 }}>
          ✦ Registro de condominio
        </div>
        <h1 style={{ fontSize: 'clamp(26px, 4vw, 40px)', fontWeight: 800, color: '#FDFBF7', letterSpacing: '-1px', lineHeight: 1.2, margin: '0 auto 14px', maxWidth: 520 }}>
          Empieza a administrar tu condominio con Homly
        </h1>
        <p style={{ fontSize: 15, color: 'rgba(253,251,247,0.65)', maxWidth: 440, margin: '0 auto', lineHeight: 1.65 }}>
          Llena el formulario y nuestro equipo te contactará en menos de 24 horas para activar tu cuenta.
        </p>

        {/* Trust badges */}
        <div style={{ display: 'flex', gap: 24, justifyContent: 'center', marginTop: 28, flexWrap: 'wrap' }}>
          {['Sin costo inicial', 'Configuración asistida', 'Soporte incluido'].map(t => (
            <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'rgba(253,251,247,0.6)', fontSize: 13, fontWeight: 600 }}>
              <IconCheck size={14} color="#3BB990" /> {t}
            </div>
          ))}
        </div>
      </div>

      {/* Pull card up */}
      <div style={{ marginTop: -24 }}>
        {children}
      </div>
    </div>
  );
}

function Stepper({ current }) {
  return (
    <div style={{
      background: '#fff',
      borderRadius: 16,
      border: `1px solid ${C.sandBd}`,
      padding: '20px 24px',
      marginBottom: 20,
      display: 'flex',
      alignItems: 'center',
      boxShadow: '0 2px 8px rgba(26,22,18,0.06)',
    }}>
      {STEPS.map((s, i) => (
        <React.Fragment key={s.id}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flex: 1 }}>
            <div style={{
              width: 40, height: 40,
              borderRadius: '50%',
              background: current > s.id ? C.greenBg : current === s.id ? C.coralBg : C.sand,
              border: `2px solid ${current > s.id ? C.greenMid : current === s.id ? C.coral : C.sandBd}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.3s',
            }}>
              {current > s.id
                ? <IconCheck size={16} color={C.greenMid} />
                : <span style={{ opacity: current === s.id ? 1 : 0.4 }}>{s.icon}</span>
              }
            </div>
            <span style={{
              fontSize: 11,
              fontWeight: 700,
              color: current === s.id ? C.coral : current > s.id ? C.greenMid : C.ink4,
              letterSpacing: '0.3px',
              transition: 'color 0.3s',
            }}>
              {s.label}
            </span>
          </div>

          {i < STEPS.length - 1 && (
            <div style={{
              flex: 2,
              height: 2,
              background: current > s.id ? C.greenMid : C.sandBd,
              borderRadius: 1,
              marginBottom: 22,
              transition: 'background 0.3s',
            }} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

function StepCard({ title, subtitle, children }) {
  return (
    <div style={{
      background: '#fff',
      borderRadius: 20,
      border: `1px solid ${C.sandBd}`,
      padding: '32px 28px',
      boxShadow: '0 2px 8px rgba(26,22,18,0.06)',
    }}>
      <h2 style={{ fontSize: 22, fontWeight: 800, color: C.green, marginBottom: 6, letterSpacing: '-0.3px' }}>
        {title}
      </h2>
      <p style={{ fontSize: 14, color: C.ink5, marginBottom: 28, lineHeight: 1.6 }}>
        {subtitle}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {children}
      </div>
    </div>
  );
}

function FormField({ label, error, children }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {children}
      {error && <div style={errorStyle}>{error}</div>}
    </div>
  );
}

function NavButtons({ onBack, onNext, nextLabel = 'Continuar', loading = false }) {
  return (
    <div style={{ display: 'flex', justifyContent: onBack ? 'space-between' : 'flex-end', marginTop: 8, gap: 12 }}>
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '11px 20px', borderRadius: 999,
            border: `1.5px solid ${C.sandBd}`, background: 'transparent',
            color: C.ink7, fontWeight: 600, fontSize: 14,
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          <IconArrow left /> Atrás
        </button>
      )}
      <button
        type="button"
        onClick={onNext}
        disabled={loading}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '11px 24px', borderRadius: 999,
          background: loading ? C.ink3 : C.coral,
          border: 'none', color: '#fff',
          fontWeight: 700, fontSize: 14,
          cursor: loading ? 'not-allowed' : 'pointer',
          fontFamily: 'inherit',
          boxShadow: loading ? 'none' : '0 4px 16px rgba(232,93,67,0.25)',
          transition: 'background 0.2s, box-shadow 0.2s',
        }}
      >
        {nextLabel} {!loading && <IconArrow />}
      </button>
    </div>
  );
}

function SummarySection({ title, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: C.coral,
        letterSpacing: '0.8px', textTransform: 'uppercase',
        marginBottom: 10,
      }}>
        {title}
      </div>
      <div style={{ background: C.sand, borderRadius: 12, overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  );
}

function SummaryRow({ label, value }) {
  if (!value && value !== 0) return null;
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
      padding: '10px 14px',
      borderBottom: `1px solid ${C.sandBd}`,
    }}>
      <span style={{ fontSize: 13, color: C.ink5, fontWeight: 500, flexShrink: 0, marginRight: 12 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: C.ink9, textAlign: 'right' }}>{value}</span>
    </div>
  );
}
