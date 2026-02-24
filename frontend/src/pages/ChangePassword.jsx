import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authAPI } from '../api/client';
import { HOMLY_LOGO } from '../utils/helpers';
import toast from 'react-hot-toast';

export default function ChangePassword() {
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [error, setError] = useState('');
  const { setMustChangePassword } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (newPw.length < 6) return setError('La contraseña debe tener al menos 6 caracteres.');
    if (newPw !== confirmPw) return setError('Las contraseñas no coinciden.');
    try {
      await authAPI.changePassword({ current_password: currentPw, new_password: newPw });
      setMustChangePassword(false);
      toast.success('Contraseña actualizada');
      navigate('/app');
    } catch (err) {
      setError(err.response?.data?.current_password?.[0] || 'Error al cambiar contraseña.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="w-10 h-10">{HOMLY_LOGO}</div>
          <h1 className="text-2xl font-extrabold text-teal-800">homly<span className="brand-dot">.</span></h1>
        </div>
        <div className="card card-body">
          <h2 className="text-lg font-bold text-ink-800 mb-1">Cambiar Contraseña</h2>
          <p className="text-sm text-ink-400 mb-6">Debes cambiar tu contraseña antes de continuar.</p>
          {error && <div className="bg-red-50 text-red-700 text-sm font-semibold px-4 py-3 rounded-xl mb-4">{error}</div>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="field-label">Contraseña Actual</label>
              <input type="password" className="field-input" value={currentPw} onChange={e => setCurrentPw(e.target.value)} required />
            </div>
            <div>
              <label className="field-label">Nueva Contraseña</label>
              <input type="password" className="field-input" value={newPw} onChange={e => setNewPw(e.target.value)} required />
            </div>
            <div>
              <label className="field-label">Confirmar Nueva Contraseña</label>
              <input type="password" className="field-input" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} required />
            </div>
            <button type="submit" className="w-full btn btn-primary justify-center py-3">Cambiar Contraseña</button>
          </form>
        </div>
      </div>
    </div>
  );
}
