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

  if (loading) return <div className="text-center py-12 text-ink-400">Cargando...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
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
                <th>Nombre</th>
                <th>Unidades</th>
                <th>Mantenimiento</th>
                <th>País</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map(t => (
                <tr key={t.id}>
                  <td>
                    <button className="font-bold text-teal-700 hover:underline"
                      onClick={() => switchTenant(t.id, t.name)}>
                      {t.name}
                    </button>
                  </td>
                  <td>{t.units_actual || 0} / {t.units_count}</td>
                  <td>{fmtCurrency(t.maintenance_fee, t.currency)}</td>
                  <td>{t.country}</td>
                  <td>
                    <div className="flex gap-2">
                      <button className="btn-icon" onClick={() => { setForm(t); setShowModal(true); }}>
                        <Edit size={14} />
                      </button>
                      {isSuperAdmin && (
                        <button className="btn-icon text-coral-500" onClick={() => handleDelete(t.id, t.name)}>
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
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="text-lg font-bold">{form.id ? 'Editar' : 'Nuevo'} Condominio</h3>
              <button className="btn-icon" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body space-y-4">
              <div>
                <label className="field-label">Nombre</label>
                <input className="field-input" value={form.name || ''} onChange={e => setForm({...form, name: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="field-label">Unidades Planeadas</label>
                  <input type="number" className="field-input" value={form.units_count || ''} onChange={e => setForm({...form, units_count: e.target.value})} />
                </div>
                <div>
                  <label className="field-label">Cuota Mantenimiento</label>
                  <input type="number" className="field-input" value={form.maintenance_fee || ''} onChange={e => setForm({...form, maintenance_fee: e.target.value})} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="field-label">Moneda</label>
                  <select className="field-select" value={form.currency || 'MXN'} onChange={e => setForm({...form, currency: e.target.value})}>
                    {Object.entries(CURRENCIES).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="field-label">País</label>
                  <input className="field-input" value={form.country || ''} onChange={e => setForm({...form, country: e.target.value})} />
                </div>
              </div>
              <div>
                <label className="field-label">Áreas Comunes</label>
                <input className="field-input" value={form.common_areas || ''} onChange={e => setForm({...form, common_areas: e.target.value})} />
              </div>
              <div className="flex justify-end gap-3">
                <button className="btn btn-outline" onClick={() => setShowModal(false)}>Cancelar</button>
                <button className="btn btn-primary" onClick={handleSave}>Guardar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
