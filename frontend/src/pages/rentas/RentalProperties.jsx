import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { rentalAPI, tenantsAPI } from '../../api/client';
import { Plus, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { fmtMoney, PROPERTY_STATUS, PROPERTY_TYPES, StatusPill } from './rentalUtils';
import AirbnbPanel from './AirbnbPanel';

const EMPTY = {
  code: '', name: '', property_type: 'departamento', status: 'disponible',
  street: '', ext_number: '', int_number: '', neighborhood: '', city: '', state: '', postal_code: '',
  bedrooms: 0, bathrooms: 1, area_m2: 0, suggested_rent: 0,
  owner_name: '', owner_email: '', owner_phone: '', notes: '',
};

export default function RentalProperties() {
  const { tenantId } = useAuth();
  const [items, setItems] = useState([]);
  const [currency, setCurrency] = useState('MXN');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showAirbnb, setShowAirbnb] = useState(false);

  const load = () => {
    if (!tenantId) return;
    setLoading(true);
    Promise.all([
      rentalAPI.properties.list(tenantId, { search, page_size: 500 }),
      tenantsAPI.get(tenantId).catch(() => ({ data: {} })),
    ])
      .then(([r, t]) => {
        setItems(r.data.results || r.data || []);
        setCurrency(t.data?.currency || 'MXN');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [tenantId]);

  const handleSave = async () => {
    if (!form.code || !form.name) { toast.error('Código y nombre son obligatorios'); return; }
    setSaving(true);
    try {
      const payload = { ...form, suggested_rent: Number(form.suggested_rent) || 0, bathrooms: Number(form.bathrooms) || 0, bedrooms: Number(form.bedrooms) || 0, area_m2: Number(form.area_m2) || 0 };
      if (form.id) await rentalAPI.properties.update(tenantId, form.id, payload);
      else await rentalAPI.properties.create(tenantId, payload);
      toast.success(form.id ? 'Propiedad actualizada' : 'Propiedad registrada');
      setForm(null);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || e.response?.data?.code?.[0] || 'No se pudo guardar');
    } finally { setSaving(false); }
  };

  return (
    <div className="content-fade">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', color: 'var(--teal-600)', textTransform: 'uppercase' }}>Inventario</div>
          <h2 style={{ margin: '4px 0 0', fontSize: 22 }}>Propiedades en renta</h2>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--ink-400)' }} />
            <input className="field-input" placeholder="Buscar…" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && load()} style={{ paddingLeft: 30, width: 220 }} />
          </div>
          <button className="btn btn-outline btn-sm" onClick={load}>Buscar</button>
          <button className="btn btn-outline" onClick={() => setShowAirbnb(true)}>Importar Airbnb</button>
          <button className="btn btn-primary" onClick={() => setForm({ ...EMPTY })}><Plus size={15} /> Nueva propiedad</button>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-400)' }}>Cargando inventario…</div>
        ) : items.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--ink-400)' }}>
            <div style={{ fontWeight: 600 }}>Aún no hay propiedades</div>
            <div style={{ fontSize: 13, marginTop: 6 }}>Registra el inventario o importa anuncios de Airbnb.</div>
            <button className="btn btn-outline" style={{ marginTop: 12 }} onClick={() => setShowAirbnb(true)}>Importar Airbnb</button>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Inmueble</th>
                  <th>Tipo</th>
                  <th>Estatus</th>
                  <th>Renta sugerida</th>
                  <th>Propietario</th>
                </tr>
              </thead>
              <tbody>
                {items.map(p => (
                  <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => setForm({ ...p })}>
                    <td style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--teal-600)' }}>{p.code}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>
                        {p.name}
                        {p.source === 'airbnb' && (
                          <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#E61E4D', background: '#FFF0F3', border: '1px solid #FFCDD8', borderRadius: 999, padding: '2px 8px' }}>Airbnb</span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>{p.address_line || 'Sin dirección'}</div>
                    </td>
                    <td>{PROPERTY_TYPES[p.property_type] || p.property_type}</td>
                    <td><StatusPill map={PROPERTY_STATUS} value={p.status} /></td>
                    <td>{fmtMoney(p.suggested_rent, currency)}</td>
                    <td style={{ fontSize: 13 }}>{p.owner_name || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {form && (
        <div className="modal-bg open" onClick={() => setForm(null)}>
          <div className="modal lg" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3>{form.id ? 'Editar propiedad' : 'Nueva propiedad'}</h3>
              <button className="modal-close" onClick={() => setForm(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <Field label="Código" value={form.code} onChange={v => setForm({ ...form, code: v })} />
                <Field label="Nombre" value={form.name} onChange={v => setForm({ ...form, name: v })} />
                <div className="field">
                  <label className="field-label">Tipo</label>
                  <select className="field-select" value={form.property_type} onChange={e => setForm({ ...form, property_type: e.target.value })}>
                    {Object.entries(PROPERTY_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label className="field-label">Estatus</label>
                  <select className="field-select" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                    {Object.entries(PROPERTY_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <Field label="Calle" value={form.street} onChange={v => setForm({ ...form, street: v })} />
                <Field label="No. ext." value={form.ext_number} onChange={v => setForm({ ...form, ext_number: v })} />
                <Field label="Colonia" value={form.neighborhood} onChange={v => setForm({ ...form, neighborhood: v })} />
                <Field label="Ciudad" value={form.city} onChange={v => setForm({ ...form, city: v })} />
                <Field label="Recámaras" type="number" value={form.bedrooms} onChange={v => setForm({ ...form, bedrooms: v })} />
                <Field label="Baños" type="number" value={form.bathrooms} onChange={v => setForm({ ...form, bathrooms: v })} />
                <Field label="m²" type="number" value={form.area_m2} onChange={v => setForm({ ...form, area_m2: v })} />
                <Field label="Renta sugerida" type="number" value={form.suggested_rent} onChange={v => setForm({ ...form, suggested_rent: v })} />
                <Field label="Propietario" value={form.owner_name} onChange={v => setForm({ ...form, owner_name: v })} />
                <Field label="Tel. propietario" value={form.owner_phone} onChange={v => setForm({ ...form, owner_phone: v })} />
                <div className="field field-full">
                  <label className="field-label">Notas</label>
                  <textarea className="field-input" rows={3} value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} />
                </div>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setForm(null)}>Cancelar</button>
              <button className="btn btn-primary" disabled={saving} onClick={handleSave}>{saving ? 'Guardando…' : 'Guardar'}</button>
            </div>
          </div>
        </div>
      )}

      {showAirbnb && (
        <div className="modal-bg open" onClick={() => setShowAirbnb(false)}>
          <div className="modal lg" onClick={e => e.stopPropagation()} style={{ maxWidth: 820 }}>
            <div className="modal-head">
              <h3>Integrar propiedades de Airbnb</h3>
              <button className="modal-close" onClick={() => setShowAirbnb(false)}>✕</button>
            </div>
            <div className="modal-body">
              <AirbnbPanel tenantId={tenantId} compact onImported={() => { load(); }} />
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setShowAirbnb(false)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, type = 'text' }) {
  return (
    <div className="field">
      <label className="field-label">{label}</label>
      <input className="field-input" type={type} value={value ?? ''} onChange={e => onChange(e.target.value)} />
    </div>
  );
}
