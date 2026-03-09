import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { tenantsAPI } from '../api/client';
import { fmtCurrency, CURRENCIES } from '../utils/helpers';
import { Plus, Edit, Trash2, LogIn, Building2, Check } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Tenants() {
  const { isSuperAdmin, switchTenant, tenantId: activeTenantId } = useAuth();
  const navigate = useNavigate();

  const [tenants,     setTenants]     = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [showModal,   setShowModal]   = useState(false);
  const [form,        setForm]        = useState({});
  const [entering,    setEntering]    = useState(null); // id of tenant being entered

  const load = () => {
    tenantsAPI.list()
      .then(r => setTenants(r.data.results || r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  // Switch to a tenant and navigate to its dashboard
  const handleEnter = async (t) => {
    if (entering) return;
    setEntering(t.id);
    try {
      await switchTenant(t.id);
      navigate('/app/dashboard');
    } catch {
      toast.error('No se pudo acceder al condominio.');
    } finally {
      setEntering(null);
    }
  };

  const handleSave = async () => {
    try {
      if (form.id) {
        await tenantsAPI.update(form.id, form);
        toast.success('Condominio actualizado');
      } else {
        await tenantsAPI.create(form);
        toast.success('Condominio creado');
      }
      setShowModal(false);
      load();
    } catch {
      toast.error('Error al guardar');
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`¿Eliminar "${name}"? Esta acción es irreversible.`)) return;
    try {
      await tenantsAPI.delete(id);
      toast.success('Condominio eliminado');
      load();
    } catch { toast.error('Error al eliminar'); }
  };

  if (loading) return (
    <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--ink-400)' }}>
      Cargando condominios…
    </div>
  );

  return (
    <div className="content-fade">

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="badge badge-teal">{tenants.length} condominios</span>
          {activeTenantId && (
            <span className="badge badge-gray">Activo seleccionado</span>
          )}
        </div>
        {isSuperAdmin && (
          <button className="btn btn-primary" onClick={() => { setForm({}); setShowModal(true); }}>
            <Plus size={16} /> Nuevo Condominio
          </button>
        )}
      </div>

      {/* Tenant cards grid */}
      {tenants.length === 0 ? (
        <div className="card" style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--ink-400)' }}>
          <Building2 size={40} style={{ opacity: 0.3, marginBottom: 12, display: 'block', margin: '0 auto 12px' }} />
          <p style={{ fontWeight: 600 }}>No hay condominios registrados.</p>
          <p style={{ fontSize: 13, marginTop: 4 }}>Crea el primer condominio con el botón superior.</p>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: 16,
        }}>
          {tenants.map(t => {
            const isActive  = t.id === activeTenantId;
            const isLoading = entering === t.id;

            return (
              <div
                key={t.id}
                style={{
                  background: 'var(--white)',
                  border: `2px solid ${isActive ? 'var(--teal-400)' : 'var(--sand-100)'}`,
                  borderRadius: 16,
                  padding: 20,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 14,
                  transition: 'box-shadow 0.15s, border-color 0.15s',
                  boxShadow: isActive ? '0 0 0 3px rgba(20,184,166,0.12)' : '0 1px 4px rgba(0,0,0,0.06)',
                }}
              >
                {/* Top row: avatar + name + active badge */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                    background: isActive ? 'var(--teal-500)' : 'var(--sand-100)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 18, fontWeight: 800,
                    color: isActive ? 'white' : 'var(--ink-500)',
                  }}>
                    {t.name?.[0]?.toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 15, fontWeight: 700,
                      color: 'var(--ink-800)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {t.name}
                    </div>
                    {t.country && (
                      <div style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: 2 }}>
                        {t.state ? `${t.state}, ` : ''}{t.country}
                      </div>
                    )}
                  </div>
                  {isActive && (
                    <span style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      fontSize: 10, fontWeight: 700, color: 'var(--teal-600)',
                      background: 'var(--teal-50)', border: '1px solid var(--teal-200)',
                      borderRadius: 20, padding: '2px 8px', flexShrink: 0,
                      textTransform: 'uppercase', letterSpacing: '0.05em',
                    }}>
                      <Check size={10} /> Activo
                    </span>
                  )}
                </div>

                {/* Stats row */}
                <div style={{
                  display: 'flex', gap: 8,
                  padding: '10px 12px',
                  background: 'var(--sand-50)',
                  borderRadius: 10,
                }}>
                  <div style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink-800)' }}>
                      {t.units_actual ?? t.units_count ?? 0}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--ink-400)', fontWeight: 600 }}>Unidades</div>
                  </div>
                  <div style={{ width: 1, background: 'var(--sand-100)' }} />
                  <div style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--teal-700)' }}>
                      {fmtCurrency(t.maintenance_fee, t.currency)}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--ink-400)', fontWeight: 600 }}>Mantenimiento</div>
                  </div>
                  <div style={{ width: 1, background: 'var(--sand-100)' }} />
                  <div style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink-700)' }}>
                      {t.currency || 'MXN'}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--ink-400)', fontWeight: 600 }}>Moneda</div>
                  </div>
                </div>

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {/* Enter tenant */}
                  <button
                    onClick={() => handleEnter(t)}
                    disabled={!!entering}
                    style={{
                      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      gap: 6, padding: '8px 14px',
                      background: isActive ? 'var(--teal-500)' : 'var(--teal-600)',
                      color: 'white', border: 'none', borderRadius: 10,
                      fontSize: 13, fontWeight: 700, cursor: entering ? 'default' : 'pointer',
                      opacity: entering && !isLoading ? 0.5 : 1,
                      transition: 'opacity 0.15s, background 0.15s',
                    }}
                  >
                    {isLoading
                      ? 'Entrando…'
                      : isActive
                        ? <><Check size={14} /> Condominio activo</>
                        : <><LogIn size={14} /> Entrar</>
                    }
                  </button>

                  {/* Edit */}
                  <button
                    className="btn-icon"
                    onClick={() => { setForm(t); setShowModal(true); }}
                    title="Editar"
                  >
                    <Edit size={14} />
                  </button>

                  {/* Delete (superadmin only) */}
                  {isSuperAdmin && (
                    <button
                      className="btn-icon"
                      style={{ color: 'var(--coral-500)' }}
                      onClick={() => handleDelete(t.id, t.name)}
                      title="Eliminar"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal — create / edit */}
      {showModal && (
        <div className="modal-bg open" onClick={() => setShowModal(false)}>
          <div className="modal lg" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3>{form.id ? 'Editar' : 'Nuevo'} Condominio</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="field field-full">
                  <label className="field-label">Nombre</label>
                  <input className="field-input" value={form.name || ''} onChange={e => setForm({...form, name: e.target.value})} />
                </div>
                <div className="field">
                  <label className="field-label">Unidades Planeadas</label>
                  <input type="number" className="field-input" value={form.units_count || ''} onChange={e => setForm({...form, units_count: e.target.value})} />
                </div>
                <div className="field">
                  <label className="field-label">Cuota Mantenimiento</label>
                  <input type="number" className="field-input" step="0.01" min="0" value={form.maintenance_fee || ''} onChange={e => setForm({...form, maintenance_fee: e.target.value})} />
                </div>
                <div className="field">
                  <label className="field-label">Moneda</label>
                  <select className="field-select" value={form.currency || 'MXN'} onChange={e => setForm({...form, currency: e.target.value})}>
                    {Object.entries(CURRENCIES).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label className="field-label">País</label>
                  <input className="field-input" value={form.country || ''} onChange={e => setForm({...form, country: e.target.value})} />
                </div>
                <div className="field">
                  <label className="field-label">Estado / Región</label>
                  <input className="field-input" value={form.state || ''} onChange={e => setForm({...form, state: e.target.value})} />
                </div>
                <div className="field field-full">
                  <label className="field-label">Áreas Comunes</label>
                  <input className="field-input" value={form.common_areas || ''} onChange={e => setForm({...form, common_areas: e.target.value})} />
                </div>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-outline" onClick={() => setShowModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSave}>Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
