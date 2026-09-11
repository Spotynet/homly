import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { rentalAPI, tenantsAPI } from '../../api/client';
import { Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { CONTRACT_STATUS, fmtDate, fmtMoney, StatusPill } from './rentalUtils';

const EMPTY = {
  code: '', property: '', tenant_party: '', guarantor: '',
  start_date: '', end_date: '', rent_amount: 0, deposit_amount: 0,
  payment_day: 1, increment_pct: 0, late_fee_pct: 0, status: 'borrador', notes: '',
};

export default function RentalContracts() {
  const { tenantId } = useAuth();
  const [items, setItems] = useState([]);
  const [properties, setProperties] = useState([]);
  const [parties, setParties] = useState([]);
  const [currency, setCurrency] = useState('MXN');
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);
  const [partyForm, setPartyForm] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = () => {
    if (!tenantId) return;
    setLoading(true);
    Promise.all([
      rentalAPI.contracts.list(tenantId, { page_size: 500 }),
      rentalAPI.properties.list(tenantId, { page_size: 500 }),
      rentalAPI.parties.list(tenantId, { page_size: 500 }),
      tenantsAPI.get(tenantId).catch(() => ({ data: {} })),
    ]).then(([c, p, t, ten]) => {
      setItems(c.data.results || c.data || []);
      setProperties(p.data.results || p.data || []);
      setParties(t.data.results || t.data || []);
      setCurrency(ten.data?.currency || 'MXN');
    }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [tenantId]);

  const inquilinos = parties.filter(x => x.kind === 'inquilino');
  const fiadores = parties.filter(x => x.kind === 'fiador');

  const handleSave = async () => {
    if (!form.code || !form.property || !form.tenant_party || !form.start_date || !form.end_date) {
      toast.error('Completa código, inmueble, inquilino y fechas');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        rent_amount: Number(form.rent_amount) || 0,
        deposit_amount: Number(form.deposit_amount) || 0,
        payment_day: Number(form.payment_day) || 1,
        increment_pct: Number(form.increment_pct) || 0,
        late_fee_pct: Number(form.late_fee_pct) || 0,
        guarantor: form.guarantor || null,
      };
      if (form.id) await rentalAPI.contracts.update(tenantId, form.id, payload);
      else await rentalAPI.contracts.create(tenantId, payload);
      toast.success(form.id ? 'Contrato actualizado' : 'Contrato creado');
      setForm(null);
      load();
    } catch (e) {
      const d = e.response?.data;
      toast.error(d?.detail || d?.code?.[0] || 'No se pudo guardar el contrato');
    } finally { setSaving(false); }
  };

  const saveParty = async () => {
    if (!partyForm.first_name) { toast.error('Nombre obligatorio'); return; }
    try {
      const res = await rentalAPI.parties.create(tenantId, partyForm);
      toast.success('Contacto creado');
      setParties(prev => [...prev, res.data]);
      if (partyForm.kind === 'inquilino') setForm(f => ({ ...f, tenant_party: res.data.id }));
      if (partyForm.kind === 'fiador') setForm(f => ({ ...f, guarantor: res.data.id }));
      setPartyForm(null);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'No se pudo crear el contacto');
    }
  };

  return (
    <div className="content-fade">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', color: 'var(--teal-600)', textTransform: 'uppercase' }}>Contratos</div>
          <h2 style={{ margin: '4px 0 0', fontSize: 22 }}>Contratos de renta</h2>
        </div>
        <button className="btn btn-primary" onClick={() => setForm({ ...EMPTY })}><Plus size={15} /> Nuevo contrato</button>
      </div>

      <div className="card">
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-400)' }}>Cargando contratos…</div>
        ) : items.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--ink-400)' }}>
            <div style={{ fontWeight: 600 }}>Sin contratos</div>
            <div style={{ fontSize: 13, marginTop: 6 }}>Crea el primer contrato para vincular un inmueble con un inquilino.</div>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Contrato</th>
                  <th>Inmueble</th>
                  <th>Inquilino</th>
                  <th>Vigencia</th>
                  <th>Renta</th>
                  <th>Estatus</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map(c => (
                  <tr key={c.id}>
                    <td style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--teal-600)' }}>{c.code}</td>
                    <td>{c.property_code} · {c.property_name}</td>
                    <td>
                      <div>{c.tenant_name}</div>
                      <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>{c.tenant_phone || c.tenant_email || ''}</div>
                    </td>
                    <td style={{ fontSize: 13 }}>{fmtDate(c.start_date)} — {fmtDate(c.end_date)}</td>
                    <td>{fmtMoney(c.rent_amount, currency)}</td>
                    <td><StatusPill map={CONTRACT_STATUS} value={c.status} /></td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-outline btn-sm" onClick={() => setForm({ ...c, property: c.property, tenant_party: c.tenant_party, guarantor: c.guarantor || '' })}>Editar</button>
                        {c.status === 'borrador' && (
                          <button className="btn btn-primary btn-sm" onClick={async () => { await rentalAPI.contracts.activate(tenantId, c.id); toast.success('Contrato activado'); load(); }}>Activar</button>
                        )}
                        {['activo', 'por_vencer', 'vencido'].includes(c.status) && (
                          <button className="btn btn-outline btn-sm" onClick={async () => { await rentalAPI.contracts.finish(tenantId, c.id, { status: 'finalizado' }); toast.success('Contrato finalizado'); load(); }}>Cerrar</button>
                        )}
                      </div>
                    </td>
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
              <h3>{form.id ? 'Editar contrato' : 'Nuevo contrato'}</h3>
              <button className="modal-close" onClick={() => setForm(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="field">
                  <label className="field-label">Código</label>
                  <input className="field-input" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="CT-001" />
                </div>
                <div className="field">
                  <label className="field-label">Inmueble</label>
                  <select className="field-select" value={form.property} onChange={e => setForm({ ...form, property: e.target.value })}>
                    <option value="">Selecciona…</option>
                    {properties.map(p => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label className="field-label">Inquilino</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <select className="field-select" value={form.tenant_party} onChange={e => setForm({ ...form, tenant_party: e.target.value })} style={{ flex: 1 }}>
                      <option value="">Selecciona…</option>
                      {inquilinos.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                    </select>
                    <button className="btn btn-outline btn-sm" type="button" onClick={() => setPartyForm({ kind: 'inquilino', first_name: '', last_name: '', email: '', phone: '' })}>+</button>
                  </div>
                </div>
                <div className="field">
                  <label className="field-label">Fiador (opcional)</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <select className="field-select" value={form.guarantor || ''} onChange={e => setForm({ ...form, guarantor: e.target.value })} style={{ flex: 1 }}>
                      <option value="">Ninguno</option>
                      {fiadores.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                    </select>
                    <button className="btn btn-outline btn-sm" type="button" onClick={() => setPartyForm({ kind: 'fiador', first_name: '', last_name: '', email: '', phone: '' })}>+</button>
                  </div>
                </div>
                <div className="field">
                  <label className="field-label">Inicio</label>
                  <input type="date" className="field-input" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} />
                </div>
                <div className="field">
                  <label className="field-label">Fin</label>
                  <input type="date" className="field-input" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} />
                </div>
                <div className="field">
                  <label className="field-label">Renta mensual</label>
                  <input type="number" className="field-input" value={form.rent_amount} onChange={e => setForm({ ...form, rent_amount: e.target.value })} />
                </div>
                <div className="field">
                  <label className="field-label">Depósito</label>
                  <input type="number" className="field-input" value={form.deposit_amount} onChange={e => setForm({ ...form, deposit_amount: e.target.value })} />
                </div>
                <div className="field">
                  <label className="field-label">Día de cobro</label>
                  <input type="number" min={1} max={28} className="field-input" value={form.payment_day} onChange={e => setForm({ ...form, payment_day: e.target.value })} />
                </div>
                <div className="field">
                  <label className="field-label">Incremento %</label>
                  <input type="number" className="field-input" value={form.increment_pct} onChange={e => setForm({ ...form, increment_pct: e.target.value })} />
                </div>
                <div className="field field-full">
                  <label className="field-label">Notas</label>
                  <textarea className="field-input" rows={3} value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} />
                </div>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setForm(null)}>Cancelar</button>
              <button className="btn btn-primary" disabled={saving} onClick={handleSave}>{saving ? 'Guardando…' : 'Guardar contrato'}</button>
            </div>
          </div>
        </div>
      )}

      {partyForm && (
        <div className="modal-bg open" onClick={() => setPartyForm(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Nuevo {partyForm.kind === 'fiador' ? 'fiador' : 'inquilino'}</h3>
              <button className="modal-close" onClick={() => setPartyForm(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="field"><label className="field-label">Nombre</label><input className="field-input" value={partyForm.first_name} onChange={e => setPartyForm({ ...partyForm, first_name: e.target.value })} /></div>
                <div className="field"><label className="field-label">Apellido</label><input className="field-input" value={partyForm.last_name} onChange={e => setPartyForm({ ...partyForm, last_name: e.target.value })} /></div>
                <div className="field"><label className="field-label">Email</label><input className="field-input" value={partyForm.email} onChange={e => setPartyForm({ ...partyForm, email: e.target.value })} /></div>
                <div className="field"><label className="field-label">Teléfono</label><input className="field-input" value={partyForm.phone} onChange={e => setPartyForm({ ...partyForm, phone: e.target.value })} /></div>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setPartyForm(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={saveParty}>Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
