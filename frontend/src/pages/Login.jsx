import React, { useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authAPI } from '../api/client';
import { HomlyBrand, HomlyBrandDark, APP_VERSION } from '../utils/helpers';
import { Building2, ChevronDown, Check, ArrowLeft } from 'lucide-react';

// ── Tenant picker dropdown ──────────────────────────────────────────────────
function TenantPicker({ tenants, value, onChange }) {
  const [open, setOpen]       = useState(false);
  const [search, setSearch]   = useState('');
  const ref                   = useRef(null);

  // Close on outside click
  React.useEffect(() => {
    if (!open) return;
    const handle = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  const filtered = search
    ? tenants.filter(t => t.name.toLowerCase().includes(search.toLowerCase()))
    : tenants;

  const selected = tenants.find(t => t.id === value);
  const showSearch = tenants.length > 6;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 14px',
          background: 'var(--white)', border: '1.5px solid var(--sand-200)',
          borderRadius: 12, cursor: 'pointer', textAlign: 'left',
          transition: 'border-color 0.15s',
          ...(open ? { borderColor: 'var(--teal-400)', boxShadow: '0 0 0 3px rgba(20,184,166,0.12)' } : {}),
        }}
      >
        <div style={{
          width: 28, height: 28, borderRadius: 6, flexShrink: 0,
          background: selected ? 'var(--teal-500)' : 'var(--sand-100)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 800, color: selected ? 'white' : 'var(--ink-400)',
        }}>
          {selected ? selected.name[0].toUpperCase() : <Building2 size={14} />}
        </div>
        <span style={{
          flex: 1, fontSize: 14,
          color: selected ? 'var(--ink-800)' : 'var(--ink-400)',
          fontWeight: selected ? 600 : 400,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {selected ? selected.name : 'Selecciona un condominio…'}
        </span>
        <ChevronDown size={15} style={{
          color: 'var(--ink-400)', flexShrink: 0,
          transform: open ? 'rotate(180deg)' : 'none',
          transition: 'transform 0.2s',
        }} />
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 300,
          background: 'var(--white)', border: '1px solid var(--sand-100)',
          borderRadius: 12, boxShadow: '0 8px 28px rgba(0,0,0,0.14)',
          overflow: 'hidden', maxHeight: 260,
        }}>
          {showSearch && (
            <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--sand-50)' }}>
              <input
                autoFocus
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar condominio…"
                style={{
                  width: '100%', padding: '6px 10px', fontSize: 13,
                  border: '1px solid var(--sand-100)', borderRadius: 8,
                  outline: 'none', background: 'var(--sand-50)',
                }}
              />
            </div>
          )}
          <div style={{ overflowY: 'auto', maxHeight: showSearch ? 200 : 240 }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '12px 14px', fontSize: 13, color: 'var(--ink-400)' }}>
                Sin resultados
              </div>
            ) : filtered.map(t => {
              const active = t.id === value;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => { onChange(t.id); setOpen(false); setSearch(''); }}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                    padding: '9px 12px',
                    background: active ? 'var(--teal-50)' : 'transparent',
                    border: 'none', cursor: 'pointer', textAlign: 'left',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--sand-50)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = active ? 'var(--teal-50)' : 'transparent'; }}
                >
                  <div style={{
                    width: 26, height: 26, borderRadius: 6, flexShrink: 0,
                    background: active ? 'var(--teal-500)' : 'var(--sand-100)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 800,
                    color: active ? 'white' : 'var(--ink-500)',
                  }}>
                    {t.name[0]?.toUpperCase()}
                  </div>
                  <span style={{
                    flex: 1, fontSize: 13, fontWeight: active ? 700 : 500,
                    color: active ? 'var(--teal-700)' : 'var(--ink-700)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {t.name}
                  </span>
                  {active && <Check size={13} color="var(--teal-500)" style={{ flexShrink: 0 }} />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Login page ─────────────────────────────────────────────────────────
export default function Login() {
  // Step 1: email lookup
  const [email,      setEmail]      = useState('');
  const [lookingUp,  setLookingUp]  = useState(false);
  const [tenants,    setTenants]    = useState(null);   // null = not fetched yet
  const [isSuperAdminEmail, setIsSuperAdminEmail] = useState(false);

  // Step 2: tenant + code
  const [tenantId,   setTenantId]   = useState('');
  const [code,       setCode]       = useState('');
  const [codeSent,   setCodeSent]   = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [error,      setError]      = useState('');
  const [loading,    setLoading]    = useState(false);

  const { loginWithCode } = useAuth();
  const navigate   = useNavigate();

  // ── Step 1: look up tenants for the given email ──────────────────────────
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

      // Super admin advances without a tenant; regular users need at least one
      if (list.length === 0 && !isSuperAdmin) {
        setError('No se encontró ningún condominio asociado a este correo.');
        setLookingUp(false);
        return;
      }

      setIsSuperAdminEmail(isSuperAdmin);
      setTenants(list);
      // Auto-select the only tenant for regular users with exactly one tenant
      if (list.length === 1 && !isSuperAdmin) {
        setTenantId(list[0].id);
      } else {
        setTenantId('');
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

  // ── Step 2a: request code ────────────────────────────────────────────────
  const handleRequestCode = async (e) => {
    e.preventDefault();
    if (!isSuperAdminEmail && !tenantId) {
      setError('Selecciona un condominio.');
      return;
    }
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

  // ── Step 2b: submit login with code ───────────────────────────────────────
  const handleLogin = async (e) => {
    e.preventDefault();
    if (!isSuperAdminEmail && !tenantId) {
      setError('Selecciona un condominio.');
      return;
    }
    if (!code.trim()) {
      setError('Ingresa el código que recibiste por correo.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const data = await loginWithCode(
        email.trim(),
        code.trim(),
        isSuperAdminEmail ? null : tenantId
      );
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
    setTenants(null);
    setTenantId('');
    setCode('');
    setCodeSent(false);
    setError('');
    setIsSuperAdminEmail(false);
  };

  const step2 = tenants !== null;

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
          <p className="text-sm text-ink-400 mb-6">
            {!step2
              ? 'Ingresa tu correo para continuar.'
              : !codeSent
                ? isSuperAdminEmail
                  ? 'Solicita un código para acceder al sistema.'
                  : 'Selecciona tu condominio y solicita un código por correo.'
                : 'Ingresa el código que te enviamos a tu correo.'}
          </p>

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
                {lookingUp ? 'Buscando…' : 'Continuar'}
              </button>
            </form>
          )}

          {/* ── Step 2: tenant + code ─────────────────────────────────────── */}
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

              {/* Tenant picker — only for regular users */}
              {!isSuperAdminEmail && (
                <div>
                  <label className="field-label">Condominio</label>
                  {tenants.length === 1 ? (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 14px', background: 'var(--teal-50)',
                      border: '1.5px solid var(--teal-100)', borderRadius: 12,
                    }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: 6, background: 'var(--teal-500)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 12, fontWeight: 800, color: 'white', flexShrink: 0,
                      }}>
                        {tenants[0].name[0].toUpperCase()}
                      </div>
                      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--teal-800)' }}>
                        {tenants[0].name}
                      </span>
                    </div>
                  ) : (
                    <TenantPicker
                      tenants={tenants}
                      value={tenantId}
                      onChange={setTenantId}
                    />
                  )}
                </div>
              )}

              {/* Code request or code input */}
              {!codeSent ? (
                <button
                  type="button"
                  onClick={handleRequestCode}
                  disabled={sendingCode || (!isSuperAdminEmail && !tenantId)}
                  className="w-full btn btn-coral justify-center py-3 text-base"
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
          <div className="mt-4 text-center">
            <span className="badge badge-gray">Homly v{APP_VERSION}</span>
          </div>
        </div>
      </div>

      {/* ── Right: Feature panel ─────────────────────────────────────────── */}
      <div className="hidden lg:flex flex-1 bg-gradient-to-b from-teal-800 to-teal-600 items-center justify-center p-12">
        <div className="max-w-md text-white">
          <div style={{ marginBottom: 32 }}>
            <HomlyBrandDark iconSize={56} fontSize={32} />
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
