import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { unitsAPI } from '../api/client';
import { Plus, Edit2, Trash2, Search, X, Home } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Units() {
  const { tenantId, isAdmin, isReadOnly } = useAuth();
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});

  const load = async () => {
    try {
      const { data } = await unitsAPI.list(tenantId);
      setUnits(data.results || data);
    } catch { toast.error('Error cargando unidades'); }
    setLoading(false);
  };

  useEffect(() => { if (tenantId) load(); }, [tenantId]);

  const filtered = units.filter(u =>
    `${u.unit_name} ${u.unit_id_code} ${u.owner_first_name} ${u.owner_last_name}`.toLowerCase().includes(search.toLowerCase())
  );

  const openAdd = () => {
    setForm({ unit_name: '', unit_id_code: '', owner_first_name: '', owner_last_name: '',
      owner_email: '', owner_phone: '', occupancy: 'propietario',
      tenant_first_name: '', tenant_last_name: '', tenant_email: '', tenant_phone: '' });
    setModal('add');
  };

  const openEdit = (u) => {
    setForm({ ...u });
    setModal('edit');
  };

  const handleSave = async () => {
    if (!form.unit_name || !form.unit_id_code) return toast.error('Nombre e ID de unidad son obligatorios');
    try {
      if (modal === 'add') {
        await unitsAPI.create(tenantId, { ...form, tenant: tenantId });
        toast.success('Unidad creada');
      } else {
        await unitsAPI.update(tenantId, form.id, form);
        toast.success('Unidad actualizada');
      }
      setModal(null);
      load();
    } catch (e) {
      toast.error(e.response?.data?.unit_id_code?.[0] || 'Error guardando unidad');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Eliminar esta unidad? Se perderán todos sus pagos asociados.')) return;
    try {
      await unitsAPI.delete(tenantId, id);
      toast.success('Unidad eliminada');
      load();
    } catch { toast.error('Error eliminando unidad'); }
  };

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));

  if (loading) return <div style={{ padding: 32, textAlign: 'center', color: 'var(--ink-400)' }}>Cargando unidades...</div>;

  return (
    <div className="content-fade">
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 20 }}>
        <div>
          <p style={{ fontSize: 14, color: 'var(--ink-400)' }}>{units.length} unidades registradas</p>
        </div>
        {isAdmin && (
          <button onClick={openAdd} className="btn btn-primary">
            <Plus size={16} /> Nueva Unidad
          </button>
        )}
      </div>

      <div style={{ position: 'relative', marginBottom: 20, maxWidth: 360 }}>
        <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-400)' }} />
        <input className="field-input" style={{ paddingLeft: 36 }}
          placeholder="Buscar unidad, ID o propietario..."
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Nombre</th>
                <th>Propietario</th>
                <th>Email</th>
                <th>Teléfono</th>
                <th>Ocupación</th>
                <th>Inquilino</th>
                {isAdmin && <th style={{ width: 100 }}>Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map(u => (
                <tr key={u.id}>
                  <td>
                    <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--teal-600)', background: 'var(--teal-50)', padding: '3px 10px', borderRadius: 6, fontSize: 12 }}>
                      {u.unit_id_code}
                    </span>
                  </td>
                  <td style={{ fontWeight: 600 }}>{u.unit_name}</td>
                  <td>{u.owner_first_name} {u.owner_last_name}</td>
                  <td style={{ fontSize: 12, color: 'var(--ink-500)' }}>{u.owner_email || '—'}</td>
                  <td style={{ fontSize: 12, color: 'var(--ink-500)' }}>{u.owner_phone || '—'}</td>
                  <td>
                    <span className={`badge ${u.occupancy === 'propietario' ? 'badge-teal' : u.occupancy === 'rentado' ? 'badge-amber' : 'badge-gray'}`}>
                      {u.occupancy === 'propietario' ? 'Propietario' : u.occupancy === 'rentado' ? 'Rentado' : 'Vacío'}
                    </span>
                  </td>
                  <td style={{ fontSize: 12 }}>
                    {u.occupancy === 'rentado' ? `${u.tenant_first_name} ${u.tenant_last_name}` : '—'}
                  </td>
                  {isAdmin && (
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button onClick={() => openEdit(u)} className="btn-icon" title="Editar">
                          <Edit2 size={15} />
                        </button>
                        <button onClick={() => handleDelete(u.id)} className="btn-icon" style={{ color: 'var(--coral-500)' }} title="Eliminar">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: '32px 20px', color: 'var(--ink-400)' }}>
                  {search ? 'Sin resultados' : 'No hay unidades registradas'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {modal && (
        <div className="modal-bg open" onClick={() => setModal(null)}>
          <div className="modal lg" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3>{modal === 'add' ? 'Nueva Unidad' : 'Editar Unidad'}</h3>
              <button onClick={() => setModal(null)} className="modal-close"><X size={16} /></button>
            </div>
            <div className="modal-body">
              <div className="form-section-label">Datos de la Unidad</div>
              <div className="form-grid" style={{ marginBottom: 24 }}>
                <div className="field">
                  <label className="field-label">Nombre de Unidad *</label>
                  <input className="field-input" value={form.unit_name || ''} placeholder="Casa 1"
                    onChange={e => setField('unit_name', e.target.value)} />
                </div>
                <div className="field">
                  <label className="field-label">ID de Unidad *</label>
                  <input className="field-input" value={form.unit_id_code || ''} placeholder="C-001"
                    onChange={e => setField('unit_id_code', e.target.value)} />
                </div>
                <div className="field">
                  <label className="field-label">Tipo de Ocupación</label>
                  <select className="field-select" value={form.occupancy || 'propietario'}
                    onChange={e => setField('occupancy', e.target.value)}>
                    <option value="propietario">Propietario</option>
                    <option value="rentado">Rentado</option>
                    <option value="vacío">Vacío</option>
                  </select>
                </div>
              </div>

              <div className="form-section-label">Propietario</div>
              <div className="form-grid" style={{ marginBottom: 24 }}>
                <div className="field">
                  <label className="field-label">Nombre</label>
                  <input className="field-input" value={form.owner_first_name || ''}
                    onChange={e => setField('owner_first_name', e.target.value)} />
                </div>
                <div className="field">
                  <label className="field-label">Apellido</label>
                  <input className="field-input" value={form.owner_last_name || ''}
                    onChange={e => setField('owner_last_name', e.target.value)} />
                </div>
                <div className="field">
                  <label className="field-label">Email</label>
                  <input type="email" className="field-input" value={form.owner_email || ''}
                    onChange={e => setField('owner_email', e.target.value)} />
                </div>
                <div className="field">
                  <label className="field-label">Teléfono</label>
                  <input className="field-input" value={form.owner_phone || ''}
                    onChange={e => setField('owner_phone', e.target.value)} />
                </div>
              </div>

              {form.occupancy === 'rentado' && (
                <div className="tenant-panel">
                  <div className="form-section-label" style={{ color: 'var(--amber-500)', borderColor: 'var(--teal-100)', marginTop: 0 }}>Inquilino</div>
                  <div className="form-grid">
                    <div className="field">
                      <label className="field-label">Nombre</label>
                      <input className="field-input" value={form.tenant_first_name || ''}
                        onChange={e => setField('tenant_first_name', e.target.value)} />
                    </div>
                    <div className="field">
                      <label className="field-label">Apellido</label>
                      <input className="field-input" value={form.tenant_last_name || ''}
                        onChange={e => setField('tenant_last_name', e.target.value)} />
                    </div>
                    <div className="field">
                      <label className="field-label">Email</label>
                      <input type="email" className="field-input" value={form.tenant_email || ''}
                        onChange={e => setField('tenant_email', e.target.value)} />
                    </div>
                    <div className="field">
                      <label className="field-label">Teléfono</label>
                      <input className="field-input" value={form.tenant_phone || ''}
                        onChange={e => setField('tenant_phone', e.target.value)} />
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="modal-foot">
              <button onClick={() => setModal(null)} className="btn btn-outline">Cancelar</button>
              <button onClick={handleSave} className="btn btn-primary">
                {modal === 'add' ? 'Crear Unidad' : 'Guardar Cambios'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
