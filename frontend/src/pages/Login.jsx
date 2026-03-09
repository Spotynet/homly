import React, { useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authAPI } from '../api/client';
import { HOMLY_LOGO, APP_VERSION } from '../utils/helpers';
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

  // Step 2: tenant + password
  const [tenantId,   setTenantId]   = useState('');
  const [password,   setPassword]   = useState('');
  const [error,      setError]      = useState('');
  const [loading,    setLoading]    = useState(false);

  const { login }  = useAuth();
  const navigate   = useNavigate();

  // ── Step 1: look up tenants for the given email ──────────────────────────
  const handleEmailContinue = async (e) => {
    e.preventDefault();
    setError('');
    setLookingUp(true);
    try {
      const { data } = await authAPI.getTenantsForEmail(email.trim());
      const list = data.tenants || [];

      if (list.length === 0) {
        // Email not found or has no tenants assigned — don't reveal which
        setError('No se encontró ningún condominio asociado a este correo.');
        setLookingUp(false);
        return;
      }

      setIsSuperAdminEmail(data.is_super_admin || false);
      setTenants(list);
      // Auto-select first when there's only one (and not superadmin — they should always choose)
      if (list.length === 1 && !data.is_super_admin) {
        setTenantId(list[0].id);
      } else {
        setTenantId('');
      }
    } catch {
      setError('Error al consultar los condominios. Intenta de nuevo.');
    } finally {
      setLookingUp(false);
    }
  };

  // ── Step 2: submit login ─────────────────────────────────────────────────
  const handleLogin = async (e) => {
    e.preventDefault();
    if (!tenantId) { setError('Selecciona un condominio.'); return; }
    setError('');
    setLoading(true);
    try {
      const data = await login(email.trim(), password, tenantId);
      if (data.must_change_password) {
        navigate('/change-password');
      } else {
        const savedPath = sessionStorage.getItem('redirect_after_login');
        sessionStorage.removeItem('redirect_after_login');
        navigate(savedPath && savedPath.startsWith('/app') ? savedPath : '/app');
      }
    } catch (err) {
      setError(
        err.response?.data?.non_field_errors?.[0] ||
        err.response?.data?.detail ||
        'Credenciales inválidas.'
      );
    } finally {
      setLoading(false);
    }
  };

  // ── Reset back to step 1 ─────────────────────────────────────────────────
  const handleBack = () => {
    setTenants(null);
    setTenantId('');
    setPassword('');
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
          <div className="flex items-center gap-4 mb-8">
            <div className="w-12 h-12">{HOMLY_LOGO}</div>
            <div>
              <h1 className="text-2xl font-extrabold text-teal-800">
                homly<span className="brand-dot">.</span>
              </h1>
              <span className="text-xs text-ink-400 font-semibold">Property Management</span>
            </div>
          </div>

          <h2 className="text-xl font-bold text-ink-800 mb-1">Bienvenido</h2>
          <p className="text-sm text-ink-400 mb-6">
            {step2 ? 'Selecciona tu condominio e ingresa tu contraseña.' : 'Ingresa tu correo para continuar.'}
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

          {/* ── Step 2: tenant + password ───────────────────────────────── */}
          {step2 && (
            <form onSubmit={handleLogin} className="space-y-4">
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

              {/* Tenant picker */}
              <div>
                <label className="field-label">
                  Condominio
                  {isSuperAdminEmail && (
                    <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700,
                      color: 'var(--teal-600)', textTransform: 'uppercase',
                      letterSpacing: '0.05em' }}>
                      · Super Admin
                    </span>
                  )}
                </label>
                {tenants.length === 1 && !isSuperAdminEmail ? (
                  /* Single tenant — show as static pill */
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

              {/* Password */}
              <div>
                <label className="field-label">Contraseña</label>
                <input
                  type="password" className="field-input"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoFocus required
                />
              </div>

              <button type="submit" disabled={loading || !password || !tenantId}
                className="w-full btn btn-coral justify-center py-3 text-base">
                {loading ? 'Ingresando...' : 'Iniciar Sesión'}
              </button>
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
          <div className="mt-3 text-center text-xs text-ink-300">Powered by Spotynet</div>
        </div>
      </div>

      {/* ── Right: Feature panel ─────────────────────────────────────────── */}
      <div className="hidden lg:flex flex-1 bg-gradient-to-b from-teal-800 to-teal-600 items-center justify-center p-12">
        <div className="max-w-md text-white">
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
