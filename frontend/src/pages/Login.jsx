import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authAPI } from '../api/client';
import { HomlyBrand } from '../utils/helpers';
import { ArrowLeft } from 'lucide-react';

const FEATURES = [
  'Multi-tenant para múltiples condominios',
  'Gestión de unidades y propietarios',
  'Captura de pagos mensuales por unidad',
  'Roles y permisos por usuario',
];

// ── Main Login page ─────────────────────────────────────────────────────────
export default function Login() {
  // Step 1: email lookup
  const [email,      setEmail]      = useState('');
  const [lookingUp,  setLookingUp]  = useState(false);
  const [validated,  setValidated]  = useState(false); // true once email is confirmed valid
  const [isSuperAdminEmail, setIsSuperAdminEmail] = useState(false);

  // Step 2: code
  const [code,        setCode]        = useState('');
  const [codeSent,    setCodeSent]    = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [error,       setError]       = useState('');
  const [loading,     setLoading]     = useState(false);

  const { loginWithCode } = useAuth();
  const navigate = useNavigate();

  // ── Step 1: validate email and send the verification code ───────────────
  const handleEmailContinue = async (e) => {
    e.preventDefault();
    setError('');
    setLookingUp(true);
    try {
      const { data } = await authAPI.getTenantsForEmail(email.trim());

      // Handle both response formats:
      //   New: { is_super_admin: bool, tenants: [{id, name}] }
      //   Old: [{id, name}]  (array — backward compatibility with older backend)
      let list, isSuperAdmin;
      if (Array.isArray(data)) {
        list         = data;
        isSuperAdmin = false;
      } else {
        list         = data.tenants     || [];
        isSuperAdmin = data.is_super_admin || false;
      }

      if (list.length === 0 && !isSuperAdmin) {
        setError('No se encontró ningún condominio asociado a este correo.');
        return;
      }

      setIsSuperAdminEmail(isSuperAdmin);
      setLookingUp(false);
      setSendingCode(true);
      try {
        await authAPI.requestCode(email.trim());
        setCodeSent(true);
        setCode('');
      } catch (sendErr) {
        const msg =
          sendErr.response?.data?.detail ||
          sendErr.response?.data?.email?.[0] ||
          'No se pudo enviar el código. Usa el botón para reenviarlo.';
        setError(msg);
      } finally {
        setSendingCode(false);
        setValidated(true);
      }
    } catch (err) {
      const msg =
        err.response?.data?.detail ||
        err.response?.data?.non_field_errors?.[0] ||
        'Error al consultar los condominios. Verifica tu conexión e intenta de nuevo.';
      setError(msg);
    } finally {
      setLookingUp(false);
    }
  };

  // ── Step 2: resend code (same endpoint; invalidates the previous unused code) ──
  const handleRequestCode = async (e) => {
    if (e) e.preventDefault();
    setError('');
    setSendingCode(true);
    try {
      await authAPI.requestCode(email.trim());
      setCodeSent(true);
      setCode('');
    } catch (err) {
      const msg =
        err.response?.data?.detail ||
        err.response?.data?.email?.[0] ||
        'Error al enviar el código. Intenta de nuevo.';
      setError(msg);
    } finally {
      setSendingCode(false);
    }
  };

  // ── Step 2b: submit login with code ─────────────────────────────────────
  // No tenant_id — backend auto-assigns the user's first (or last-used) tenant.
  // The user can switch tenants from inside the app via the sidebar switcher.
  const handleLogin = async (e) => {
    e.preventDefault();
    if (!code.trim()) {
      setError('Ingresa el código que recibiste por correo.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await loginWithCode(email.trim(), code.trim(), null);
      const savedPath = sessionStorage.getItem('redirect_after_login');
      sessionStorage.removeItem('redirect_after_login');
      navigate(savedPath && savedPath.startsWith('/app') ? savedPath : '/app');
    } catch (err) {
      const msg =
        err.response?.data?.code?.[0] ||
        err.response?.data?.detail ||
        err.response?.data?.non_field_errors?.[0] ||
        'Código inválido o expirado. Solicita uno nuevo.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  // ── Reset back to step 1 ─────────────────────────────────────────────────
  const handleBack = () => {
    setValidated(false);
    setCode('');
    setCodeSent(false);
    setError('');
    setIsSuperAdminEmail(false);
  };

  const step2 = validated;

  // Subtitle text per state
  const subtitle = !step2
    ? 'Ingresa tu correo para continuar.'
    : 'Ingresa el código que te enviamos a tu correo.';

  return (
    <div className="login-page">
      {/* ── Left: Form ───────────────────────────────────────────────────── */}
      <div className="login-page-form">
        <div className="login-page-form-inner">

          {/* Brand */}
          <div style={{ marginBottom: 32 }}>
            <HomlyBrand iconSize={52} nameHeight={34} />
            <p style={{ marginTop: 6, fontSize: 11, color: 'var(--ink-400)', fontWeight: 500, letterSpacing: '0.04em' }}>
              Property Management
            </p>
          </div>

          <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink-800)', margin: '0 0 4px' }}>Bienvenido</h2>
          <p style={{ fontSize: 14, color: 'var(--ink-400)', margin: '0 0 24px' }}>{subtitle}</p>

          {error && (
            <div style={{
              background: 'var(--coral-50, #FFF5F2)',
              border: '1px solid var(--coral-100, #FFE4DC)',
              color: 'var(--coral-500, #E85D43)',
              fontSize: 13, fontWeight: 600,
              padding: '12px 16px', borderRadius: 12, marginBottom: 16,
            }}>
              {error}
            </div>
          )}

          {/* ── Step 1: email ──────────────────────────────────────────── */}
          {!step2 && (
            <form onSubmit={handleEmailContinue} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label className="field-label">Correo Electrónico</label>
                <input
                  type="email" className="field-input"
                  placeholder="usuario@email.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  autoFocus required
                />
              </div>
              <button type="submit" disabled={lookingUp || sendingCode || !email.trim()}
                className="btn btn-coral"
                style={{ width: '100%', justifyContent: 'center', padding: '12px 16px', fontSize: 16 }}>
                {lookingUp ? 'Verificando…' : sendingCode ? 'Enviando código…' : 'Continuar'}
              </button>
            </form>
          )}

          {/* ── Step 2: enter code (already sent on Continuar) ───────────── */}
          {step2 && (
            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Email (read-only) */}
              <div>
                <label className="field-label">Correo Electrónico</label>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '10px 14px', background: 'var(--sand-50)',
                  border: '1.5px solid var(--sand-100)', borderRadius: 12,
                  fontSize: 14, color: 'var(--ink-600)', fontWeight: 500,
                }}>
                  <span style={{ flex: 1 }}>{email}</span>
                  <button
                    type="button" onClick={handleBack}
                    title="Cambiar correo"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      fontSize: 12, color: 'var(--teal-600)', fontWeight: 600,
                      background: 'none', border: 'none', cursor: 'pointer',
                    }}
                  >
                    <ArrowLeft size={13} /> Cambiar
                  </button>
                </div>
              </div>

              <div>
                <label className="field-label">Código de verificación</label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={8}
                  className="field-input"
                  placeholder="123456"
                  value={code}
                  onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  autoFocus
                  style={{ letterSpacing: 8, fontSize: 18, textAlign: 'center' }}
                />
                <p style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: 6 }}>
                  {codeSent
                    ? 'Revisa tu bandeja de entrada. Si no llega o ya no es válido, reenvía un código nuevo.'
                    : 'Si no recibiste el código, pulsa el botón para enviarlo de nuevo.'}
                </p>
              </div>
              <button
                type="submit"
                disabled={loading || sendingCode || !code.trim()}
                className="btn btn-coral"
                style={{ width: '100%', justifyContent: 'center', padding: '12px 16px', fontSize: 16 }}
              >
                {loading ? 'Ingresando...' : 'Iniciar Sesión'}
              </button>
              <button
                type="button"
                onClick={handleRequestCode}
                disabled={sendingCode || loading}
                style={{
                  width: '100%',
                  background: 'linear-gradient(135deg, #0d9488, #059669)',
                  color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700,
                  fontSize: 15, cursor: sendingCode ? 'default' : 'pointer',
                  opacity: sendingCode ? 0.7 : 1, display: 'flex',
                  alignItems: 'center', justifyContent: 'center', gap: 8,
                  transition: 'all 0.15s', padding: '12px 16px',
                  boxShadow: sendingCode ? 'none' : '0 2px 8px rgba(13,148,136,0.3)',
                }}
                onMouseEnter={e => { if (!sendingCode) e.currentTarget.style.background = 'linear-gradient(135deg, #0f766e, #047857)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'linear-gradient(135deg, #0d9488, #059669)'; }}
              >
                {sendingCode ? 'Enviando código…' : (codeSent ? 'Reenviar código por correo' : 'Enviar código por correo')}
              </button>
            </form>
          )}

          <div style={{ marginTop: 16, textAlign: 'center' }}>
            <Link to="/" style={{ fontSize: 14, color: 'var(--coral-500)', fontWeight: 600, textDecoration: 'none' }}>
              ← Volver a Homly
            </Link>
          </div>
        </div>
      </div>

      {/* ── Right: Feature panel ─────────────────────────────────────────── */}
      <div className="login-page-panel">
        <div className="login-page-panel-inner">
          <div style={{ marginBottom: 32, display: 'flex', alignItems: 'center', gap: 12 }}>
            <img
              src="/img/homly-house.png"
              alt=""
              style={{ width: 56, height: 56, objectFit: 'contain', flexShrink: 0 }}
            />
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 600, color: '#fff', letterSpacing: '-0.02em', display: 'inline-flex', alignItems: 'baseline', gap: 4 }}>
              homly
              <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#F76F57', flexShrink: 0, marginLeft: 3, verticalAlign: 'middle', position: 'relative', top: 2 }} aria-hidden />
            </span>
          </div>
          <h2 style={{ fontSize: 30, fontWeight: 800, margin: '0 0 16px', lineHeight: 1.2 }}>
            La administración que tu hogar se merece
          </h2>
          <p style={{ color: 'var(--teal-100, #D0F0E4)', margin: '0 0 32px', fontSize: 15, lineHeight: 1.5 }}>
            Cuentas claras, pagos simples y una convivencia más feliz.
          </p>
          <div className="login-page-features">
            {FEATURES.map((f) => (
              <div key={f} className="login-page-feature">
                <div className="login-page-feature-dot" />
                <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--teal-50, #EFFAF6)' }}>{f}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
