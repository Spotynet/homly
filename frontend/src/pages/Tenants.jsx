import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { tenantsAPI } from '../api/client';
import { fmtCurrency, CURRENCIES } from '../utils/helpers';
import { Plus, Edit, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Tenants() {
  const { isSuperAdmin, switchTenant } = useAuth();
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({});

  const load = () => {
    tenantsAPI.list().then(r => setTenants(r.data.results || r.data)).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleSave = async () => {
    try {
      if (form.id) {
        await tenantsAPI.update(form.id, form);
        toast.success('Tenant actualizado');
      } else {
        await tenantsAPI.create(form);
        toast.success('Tenant creado');
      }
      setShowModal(false);
      load();
    } catch (err) {
      toast.error('Error al guardar');
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`¿Eliminar "${name}"? Esta acción es irreversible.`)) return;
    try {
      await tenantsAPI.delete(id);
      toast.success('Tenant eliminado');
      load();
    } catch { toast.error('Error al eliminar'); }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--ink-400)' }}>Cargando...</div>;

  return (
    <div className="content-fade">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <span className="badge badge-gray">{tenants.length} condominios</span>
        </div>
        {isSuperAdmin && (
          <button className="btn btn-primary" onClick={() => { setForm({}); setShowModal(true); }}>
            <Plus size={16} /> Nuevo Condominio
          </button>
        )}
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Condominio</th>
                <th>Unidades</th>
                <th>Mantenimiento</th>
                <th>Moneda</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map(t => (
                <tr key={t.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 'var(--radius-sm)', background: 'var(--teal-50)', color: 'var(--teal-600)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
                        {t.name?.[0]}
                      </div>
                      <button style={{ fontWeight: 700, color: 'var(--teal-700)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-body)', textAlign: 'left' }}
                        onClick={() => switchTenant(t.id, t.name)}>
                        {t.name}
                      </button>
                    </div>
                  </td>
                  <td><span className="badge badge-teal">{t.units_actual || 0}/{t.units_count}</span></td>
                  <td>{fmtCurrency(t.maintenance_fee, t.currency)}</td>
                  <td><span className="badge badge-gray">{t.currency || 'MXN'}</span></td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn-icon" onClick={() => { setForm(t); setShowModal(true); }}>
                        <Edit size={14} />
                      </button>
                      {isSuperAdmin && (
                        <button className="btn-icon" style={{ color: 'var(--coral-500)' }} onClick={() => handleDelete(t.id, t.name)}>
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
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
