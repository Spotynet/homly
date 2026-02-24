import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authAPI } from '../api/client';
import { HOMLY_LOGO, APP_VERSION } from '../utils/helpers';

export default function Login() {
  const [tenants, setTenants] = useState([]);
  const [selectedTenant, setSelectedTenant] = useState('__super');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    authAPI.getTenants().then(r => setTenants(r.data)).catch(() => {});
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const tenantId = selectedTenant === '__super' ? null : selectedTenant;
      const data = await login(email, password, tenantId);
      if (data.must_change_password) {
        navigate('/change-password');
      } else {
        const savedPath = sessionStorage.getItem('redirect_after_login');
        sessionStorage.removeItem('redirect_after_login');
        navigate(savedPath && savedPath.startsWith('/app') ? savedPath : '/app');
      }
    } catch (err) {
      setError(err.response?.data?.non_field_errors?.[0] || err.response?.data?.detail || 'Credenciales inválidas.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left: Form */}
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
          <p className="text-sm text-ink-400 mb-6">Inicia sesión para acceder al sistema.</p>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm font-semibold px-4 py-3 rounded-xl mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="field-label">Condominio / Tenant</label>
              <select className="field-select" value={selectedTenant}
                onChange={e => setSelectedTenant(e.target.value)}>
                <option value="__super">— Super Administrador —</option>
                {tenants.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="field-label">Correo Electrónico</label>
              <input type="email" className="field-input" placeholder="usuario@email.com"
                value={email} onChange={e => setEmail(e.target.value)} required />
            </div>

            <div>
              <label className="field-label">Contraseña</label>
              <input type="password" className="field-input" placeholder="••••••••"
                value={password} onChange={e => setPassword(e.target.value)} required
                onKeyDown={e => e.key === 'Enter' && handleSubmit(e)} />
            </div>

            <button type="submit" disabled={loading}
              className="w-full btn btn-coral justify-center py-3 text-base">
              {loading ? 'Ingresando...' : 'Iniciar Sesión'}
            </button>
          </form>

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

      {/* Right: Feature panel */}
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
