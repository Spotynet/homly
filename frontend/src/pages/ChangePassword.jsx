import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authAPI } from '../api/client';
import { HomlyBrand } from '../utils/helpers';
import { Eye, EyeOff, ShieldAlert, KeyRound, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';

/* ── Password strength bar ─────────────────────────────────────── */
function strengthScore(pw) {
  if (!pw) return 0;
  let s = 0;
  if (pw.length >= 6)           s++;
  if (pw.length >= 10)          s++;
  if (/[A-Z]/.test(pw))         s++;
  if (/[0-9]/.test(pw))         s++;
  if (/[^A-Za-z0-9]/.test(pw))  s++;
  return s;
}
const STRENGTH_LABELS = ['', 'Muy débil', 'Débil', 'Regular', 'Buena', 'Excelente'];
const STRENGTH_COLORS = ['', '#E85D43', '#F59E0B', '#F59E0B', '#2A9D73', '#1F7D5B'];

function StrengthBar({ pw }) {
  const s = strengthScore(pw);
  if (!pw) return null;
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
        {[1,2,3,4,5].map(i => (
          <div key={i} style={{
            flex: 1, height: 4, borderRadius: 2,
            background: i <= s ? STRENGTH_COLORS[s] : 'var(--sand-200)',
            transition: 'background 0.25s',
          }} />
        ))}
      </div>
      <span style={{ fontSize: 11, fontWeight: 600, color: STRENGTH_COLORS[s] }}>
        {STRENGTH_LABELS[s]}
      </span>
    </div>
  );
}

/* ── Password input with show/hide toggle ──────────────────────── */
function PwInput({ value, onChange, placeholder, autoFocus }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <input
        type={show ? 'text' : 'password'}
        className="field-input"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        style={{ paddingRight: 40 }}
      />
      <button
        type="button"
        onClick={() => setShow(v => !v)}
        style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-400)', padding: 0 }}
      >
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════
   MAIN
   ═══════════════════════════════════════ */
export default function ChangePassword() {
  const { mustChangePassword, setMustChangePassword, user } = useAuth();
  const navigate = useNavigate();

  const [currentPw,  setCurrentPw]  = useState('');
  const [newPw,      setNewPw]      = useState('');
  const [confirmPw,  setConfirmPw]  = useState('');
  const [error,      setError]      = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done,       setDone]       = useState(false);

  // Forced flow: admin reset the password, user must create a new one.
  // In this case we skip the "current_password" check on the backend.
  const isForced = mustChangePassword;

  const requirements = [
    { ok: newPw.length >= 6,              label: 'Al menos 6 caracteres' },
    { ok: /[A-Z]/.test(newPw),            label: 'Una letra mayúscula' },
    { ok: /[0-9]/.test(newPw),            label: 'Un número' },
    { ok: newPw === confirmPw && !!newPw, label: 'Las contraseñas coinciden' },
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (newPw.length < 6)        return setError('La contraseña debe tener al menos 6 caracteres.');
    if (newPw !== confirmPw)     return setError('Las contraseñas no coinciden.');
    if (!isForced && !currentPw) return setError('Ingresa tu contraseña actual.');

    setSubmitting(true);
    try {
      await authAPI.changePassword({
        current_password: isForced ? '' : currentPw,
        new_password:     newPw,
      });
      setMustChangePassword(false);
      localStorage.setItem('must_change_password', 'false');
      setDone(true);
      toast.success('¡Contraseña actualizada exitosamente!');
      setTimeout(() => navigate('/app'), 1800);
    } catch (err) {
      const d = err.response?.data;
      setError(
        d?.current_password?.[0] ||
        d?.new_password?.[0]     ||
        d?.detail                ||
        'Error al cambiar la contraseña.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Success screen ── */
  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--cream)' }}>
        <div style={{ textAlign: 'center', maxWidth: 360 }}>
          <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--teal-50)', border: '2px solid var(--teal-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <CheckCircle2 size={34} color="var(--teal-500)" />
          </div>
          <h2 style={{ fontWeight: 800, fontSize: 22, color: 'var(--teal-800)', marginBottom: 8 }}>
            Contraseña actualizada
          </h2>
          <p style={{ fontSize: 14, color: 'var(--ink-400)' }}>Redirigiendo al sistema…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--cream)' }}>
      <div style={{ width: '100%', maxWidth: 420 }}>

        {/* Logo */}
        <div className="flex justify-center mb-8">
          <HomlyBrand iconSize={48} nameHeight={30} />
        </div>

        {/* Card */}
        <div className="card card-body" style={{ padding: '28px 28px 32px' }}>

          {/* Header with context-aware icon + title */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 20, paddingBottom: 18, borderBottom: '1px solid var(--sand-100)' }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: isForced ? 'var(--amber-50)' : 'var(--teal-50)',
              border: `1.5px solid ${isForced ? 'var(--amber-200)' : 'var(--teal-100)'}`,
            }}>
              {isForced
                ? <ShieldAlert size={22} color="var(--amber-600)" />
                : <KeyRound    size={22} color="var(--teal-600)"  />
              }
            </div>
            <div>
              <h2 style={{ fontSize: 17, fontWeight: 800, color: 'var(--ink-800)', marginBottom: 4 }}>
                {isForced ? 'Crea tu contraseña' : 'Cambiar contraseña'}
              </h2>
              <p style={{ fontSize: 13, color: 'var(--ink-400)', lineHeight: 1.55, margin: 0 }}>
                {isForced
                  ? `Hola${user?.name ? `, ${user.name.split(' ')[0]}` : ''}. El administrador restableció tu acceso. Crea una nueva contraseña para continuar.`
                  : 'Ingresa tu contraseña actual y elige una nueva.'
                }
              </p>
            </div>
          </div>

          {/* Error banner */}
          {error && (
            <div style={{ padding: '10px 14px', background: 'var(--coral-50)', border: '1px solid var(--coral-100)', borderRadius: 10, fontSize: 13, color: 'var(--coral-600)', fontWeight: 600, marginBottom: 18 }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Current password — voluntary change only */}
            {!isForced && (
              <div>
                <label className="field-label">Contraseña actual</label>
                <PwInput value={currentPw} onChange={setCurrentPw} placeholder="Tu contraseña actual" autoFocus />
              </div>
            )}

            {/* New password */}
            <div>
              <label className="field-label">Nueva contraseña</label>
              <PwInput value={newPw} onChange={setNewPw} placeholder="Mínimo 6 caracteres" autoFocus={isForced} />
              <StrengthBar pw={newPw} />
            </div>

            {/* Confirm */}
            <div>
              <label className="field-label">Confirmar nueva contraseña</label>
              <PwInput value={confirmPw} onChange={setConfirmPw} placeholder="Repite la contraseña" />
            </div>

            {/* Requirements checklist */}
            {newPw && (
              <div style={{ padding: '12px 14px', background: 'var(--sand-50)', borderRadius: 10, border: '1px solid var(--sand-200)', display: 'flex', flexDirection: 'column', gap: 7 }}>
                {requirements.map((r, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600, color: r.ok ? 'var(--teal-700)' : 'var(--ink-400)', transition: 'color 0.2s' }}>
                    <div style={{
                      width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background:  r.ok ? 'var(--teal-50)'  : 'var(--sand-200)',
                      border:      `1.5px solid ${r.ok ? 'var(--teal-400)' : 'var(--sand-300)'}`,
                      transition: 'all 0.2s',
                    }}>
                      {r.ok && <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--teal-500)' }} />}
                    </div>
                    {r.label}
                  </div>
                ))}
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary"
              style={{ justifyContent: 'center', padding: '12px', marginTop: 4 }}
              disabled={submitting}
            >
              {submitting
                ? 'Guardando…'
                : isForced
                  ? 'Crear contraseña y continuar →'
                  : 'Actualizar contraseña'
              }
            </button>

          </form>
        </div>

        {/* Back link — only for voluntary change */}
        {!isForced && (
          <p style={{ textAlign: 'center', marginTop: 16, fontSize: 13 }}>
            <button
              type="button"
              onClick={() => navigate(-1)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--teal-600)', fontWeight: 600, fontSize: 13 }}
            >
              ← Volver
            </button>
          </p>
        )}

      </div>
    </div>
  );
}
