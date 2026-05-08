import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authAPI } from '../api/client';
import { HomlyBrand } from '../utils/helpers';
import { ArrowLeft } from 'lucide-react';

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

  // ── Step 1: validate email has access ───────────────────────────────────
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
      setValidated(true);
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

  // ── Step 2a: request code ────────────────────────────────────────────────
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
    : !codeSent
      ? 'Solicita un código de verificación por correo.'
      : 'Ingresa el código que te enviamos a tu correo.';

  return (
    <div className="min-h-screen flex">
      {/* ── Left: Form ───────────────────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">

          {/* Brand */}
          <div className="mb-8">
            <HomlyBrand iconSize={52} nameHeight={34} />
            <p style={{ marginTop: 6, fontSize: 11, color: 'var(--ink-400)', fontWeight: 500, letterSpacing: '0.04em' }}>
              Property Management
            </p>
          </div>

          <h2 className="text-xl font-bold text-ink-800 mb-1">Bienvenido</h2>
          <p className="text-sm text-ink-400 mb-6">{subtitle}</p>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm font-semibold px-4 py-3 rounded-xl mb-4">
              {error}
            </div>
          )}

          {/* ── Step 1: email ──────────────────────────────────────────── */}
          {!step2 && (
            <form onSubmit={handleEmailContinue} className="space-y-4">
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
              <button type="submit" disabled={lookingUp || !email.trim()}
                className="w-full btn btn-coral justify-center py-3 text-base">
                {lookingUp ? 'Verificando…' : 'Continuar'}
              </button>
            </form>
          )}

          {/* ── Step 2: code ─────────────────────────────────────────────── */}
          {step2 && (
            <form onSubmit={codeSent ? handleLogin : handleRequestCode} className="space-y-4">
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

              {/* Code request or code input */}
              {!codeSent ? (
                <button
                  type="button"
                  onClick={handleRequestCode}
                  disabled={sendingCode}
                  className="w-full justify-center py-3 text-base"
                  style={{ background: 'linear-gradient(135deg, #0d9488, #059669)', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: sendingCode ? 'default' : 'pointer', opacity: sendingCode ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.15s', boxShadow: sendingCode ? 'none' : '0 2px 8px rgba(13,148,136,0.3)' }}
                  onMouseEnter={e => { if (!sendingCode) e.currentTarget.style.background = 'linear-gradient(135deg, #0f766e, #047857)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'linear-gradient(135deg, #0d9488, #059669)'; }}
                >
                  {sendingCode ? 'Enviando código…' : 'Enviar código por correo'}
                </button>
              ) : (
                <>
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
                      ¿No recibiste el código?{' '}
                      <button
                        type="button"
                        onClick={handleRequestCode}
                        disabled={sendingCode}
                        style={{
                          background: 'none', border: 'none', color: 'var(--teal-600)',
                          fontWeight: 600, cursor: sendingCode ? 'default' : 'pointer',
                          padding: 0, textDecoration: 'underline',
                        }}
                      >
                        Reenviar
                      </button>
                    </p>
                  </div>
                  <button
                    type="submit"
                    disabled={loading || !code.trim()}
                    className="w-full btn btn-coral justify-center py-3 text-base"
                  >
                    {loading ? 'Ingresando...' : 'Iniciar Sesión'}
                  </button>
                </>
              )}
            </form>
          )}

          <div className="mt-4 text-center">
            <Link to="/" className="text-sm text-coral-500 font-semibold hover:underline">
              ← Volver a Homly
            </Link>
          </div>
        </div>
      </div>

      {/* ── Right: Feature panel ─────────────────────────────────────────── */}
      <div className="hidden lg:flex flex-1 bg-gradient-to-b from-teal-800 to-teal-600 items-center justify-center p-12">
        <div className="max-w-md text-white">
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
          <h2 className="text-3xl font-extrabold mb-4">
            La administración que tu hogar se merece
          </h2>
          <p className="text-teal-100 mb-8">
            Cuentas claras, pagos simples y una convivencia más feliz.
          </p>
          <div className="space-y-4">
            {[
              'Multi-tenant para múltiples condominios',
              'Gestión de unidades y propietarios',
              'Captura de pagos mensuales por unidad',
              'Roles y permisos por usuario',
            ].map((f, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-coral-400" />
                <span className="text-sm font-medium text-teal-50">{f}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
