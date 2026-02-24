import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { tenantsAPI, extraFieldsAPI } from '../api/client';
import { CURRENCIES, getStatesForCountry, COUNTRIES } from '../utils/helpers';
import { Settings, Plus, Trash2, Check, X } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Config() {
  const { tenantId, isAdmin } = useAuth();
  const [tab, setTab] = useState('info');
  const [tenant, setTenant] = useState(null);
  const [fields, setFields] = useState([]);
  const [fieldForm, setFieldForm] = useState(null);

  const loadTenant = () => tenantId && tenantsAPI.get(tenantId).then(r => setTenant(r.data));
  const loadFields = () => tenantId && extraFieldsAPI.list(tenantId).then(r => setFields(r.data.results || r.data));

  useEffect(() => { loadTenant(); loadFields(); }, [tenantId]);

  const saveTenant = async (data) => {
    try {
      await tenantsAPI.update(tenantId, data);
      toast.success('Guardado');
      loadTenant();
    } catch { toast.error('Error al guardar'); }
  };

  const saveField = async () => {
    try {
      if (fieldForm.id) await extraFieldsAPI.update(tenantId, fieldForm.id, fieldForm);
      else await extraFieldsAPI.create(tenantId, { ...fieldForm, tenant: tenantId });
      toast.success('Campo guardado');
      setFieldForm(null);
      loadFields();
    } catch { toast.error('Error'); }
  };

  if (!tenant) return <div className="text-center py-12 text-ink-400">Cargando configuración...</div>;

  const tabs = [
    { key: 'info', label: 'Información General' },
    { key: 'fiscal', label: 'Datos Fiscales' },
    { key: 'address', label: 'Dirección' },
    { key: 'fields', label: 'Campos de Pago' },
  ];

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200 pb-2">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-semibold rounded-t-lg transition ${tab === t.key ? 'bg-white border border-b-0 border-slate-200 text-teal-700' : 'text-ink-400 hover:text-ink-600'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Info */}
      {tab === 'info' && (
        <div className="card card-body space-y-4 max-w-2xl">
          <div><label className="field-label">Nombre del Condominio</label><input className="field-input" value={tenant.name} onChange={e => setTenant({...tenant, name: e.target.value})} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="field-label">Cuota de Mantenimiento</label><input type="number" className="field-input" value={tenant.maintenance_fee} onChange={e => setTenant({...tenant, maintenance_fee: e.target.value})} /></div>
            <div><label className="field-label">Moneda</label><select className="field-select" value={tenant.currency} onChange={e => setTenant({...tenant, currency: e.target.value})}>{Object.entries(CURRENCIES).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}</select></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="field-label">País</label><select className="field-select" value={tenant.country} onChange={e => setTenant({...tenant, country: e.target.value})}><option value="">Seleccionar...</option>{COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
            <div><label className="field-label">Estado</label><select className="field-select" value={tenant.state} onChange={e => setTenant({...tenant, state: e.target.value})}><option value="">Seleccionar...</option>{getStatesForCountry(tenant.country).map(s => <option key={s} value={s}>{s}</option>)}</select></div>
          </div>
          <div><label className="field-label">Áreas Comunes</label><input className="field-input" value={tenant.common_areas} onChange={e => setTenant({...tenant, common_areas: e.target.value})} /></div>
          {isAdmin && <button className="btn btn-primary" onClick={() => saveTenant(tenant)}>Guardar Cambios</button>}
        </div>
      )}

      {/* Fiscal */}
      {tab === 'fiscal' && (
        <div className="card card-body space-y-4 max-w-2xl">
          <div><label className="field-label">Razón Social</label><input className="field-input" value={tenant.razon_social || ''} onChange={e => setTenant({...tenant, razon_social: e.target.value})} /></div>
          <div><label className="field-label">RFC</label><input className="field-input" value={tenant.rfc || ''} onChange={e => setTenant({...tenant, rfc: e.target.value})} /></div>
          {isAdmin && <button className="btn btn-primary" onClick={() => saveTenant(tenant)}>Guardar</button>}
        </div>
      )}

      {/* Address */}
      {tab === 'address' && (
        <div className="card card-body space-y-4 max-w-2xl">
          {['addr_nombre', 'addr_calle', 'addr_num_externo', 'addr_colonia', 'addr_delegacion', 'addr_ciudad', 'addr_codigo_postal'].map(k => (
            <div key={k}><label className="field-label">{k.replace('addr_', '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</label><input className="field-input" value={tenant[k] || ''} onChange={e => setTenant({...tenant, [k]: e.target.value})} /></div>
          ))}
          {isAdmin && <button className="btn btn-primary" onClick={() => saveTenant(tenant)}>Guardar</button>}
        </div>
      )}

      {/* Extra Fields */}
      {tab === 'fields' && (
        <div className="space-y-4">
          {isAdmin && (
            <button className="btn btn-primary" onClick={() => setFieldForm({ label: '', default_amount: 0, required: false, enabled: true, field_type: 'normal' })}>
              <Plus size={14} /> Nuevo Campo
            </button>
          )}
          <div className="card">
            <div className="table-wrap">
              <table>
                <thead><tr><th>Campo</th><th>Monto Default</th><th>Obligatorio</th><th>Activo</th><th>Tipo</th><th>Acciones</th></tr></thead>
                <tbody>
                  {fields.map(f => (
                    <tr key={f.id}>
                      <td className="font-semibold text-xs">{f.label}</td>
                      <td className="text-xs">${parseFloat(f.default_amount).toLocaleString()}</td>
                      <td>{f.required ? <Check size={14} className="text-teal-600" /> : <X size={14} className="text-ink-300" />}</td>
                      <td>{f.enabled ? <Check size={14} className="text-teal-600" /> : <X size={14} className="text-ink-300" />}</td>
                      <td className="text-xs">{f.field_type}</td>
                      <td>
                        {isAdmin && !f.is_system_default && (
                          <button className="btn-icon text-coral-500" onClick={async () => {
                            if (window.confirm('¿Eliminar campo?')) { await extraFieldsAPI.delete(tenantId, f.id); loadFields(); }
                          }}><Trash2 size={12} /></button>
                        )}
                        {isAdmin && (
                          <button className="btn-icon" onClick={() => setFieldForm(f)}><Settings size={12} /></button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Field Modal */}
          {fieldForm && (
            <div className="modal-overlay" onClick={() => setFieldForm(null)}>
              <div className="modal-content" onClick={e => e.stopPropagation()}>
                <div className="modal-header"><h3 className="text-lg font-bold">{fieldForm.id ? 'Editar' : 'Nuevo'} Campo</h3></div>
                <div className="modal-body space-y-4">
                  <div><label className="field-label">Nombre</label><input className="field-input" value={fieldForm.label} onChange={e => setFieldForm({...fieldForm, label: e.target.value})} /></div>
                  <div><label className="field-label">Monto Default</label><input type="number" className="field-input" value={fieldForm.default_amount} onChange={e => setFieldForm({...fieldForm, default_amount: e.target.value})} /></div>
                  <div className="flex gap-6">
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={fieldForm.required} onChange={e => setFieldForm({...fieldForm, required: e.target.checked})} /> Obligatorio</label>
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={fieldForm.enabled} onChange={e => setFieldForm({...fieldForm, enabled: e.target.checked})} /> Activo</label>
                  </div>
                  <div><label className="field-label">Tipo</label><select className="field-select" value={fieldForm.field_type} onChange={e => setFieldForm({...fieldForm, field_type: e.target.value})}><option value="normal">Normal</option><option value="gastos">Gastos</option></select></div>
                  <div className="flex justify-end gap-3"><button className="btn btn-outline" onClick={() => setFieldForm(null)}>Cancelar</button><button className="btn btn-primary" onClick={saveField}>Guardar</button></div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
