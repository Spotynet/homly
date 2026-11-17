import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { rentalAPI, tenantsAPI } from '../../api/client';
import { CURRENCIES, COUNTRIES, getStatesForCountry } from '../../utils/helpers';
import toast from 'react-hot-toast';
import AirbnbPanel from './AirbnbPanel';
import RentalOpsSettings from './RentalOpsSettings';
import RentalModeSettings from './RentalModeSettings';
import RentalTeam from './RentalTeam';
import { rentalOffModules } from '../../constants/modulePermissions';

export default function RentalConfig() {
  const { tenantId } = useAuth();
  const [tab, setTab] = useState('general');
  const [form, setForm] = useState({});
  const [concepts, setConcepts] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (window.location.hash === '#airbnb') setTab('airbnb');
  }, []);

  // Cuando cambia el modo de operación, refresca solo esos ajustes (sin perder lo que estés editando)
  useEffect(() => {
    if (!tenantId) return undefined;
    const onChange = () => tenantsAPI.get(tenantId).then(r => setForm(f => ({ ...f, rental_settings: r.data?.rental_settings || {} }))).catch(() => {});
    window.addEventListener('homly:tenant-settings-changed', onChange);
    return () => window.removeEventListener('homly:tenant-settings-changed', onChange);
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    tenantsAPI.get(tenantId).then(r => setForm(r.data || {}));
    rentalAPI.concepts.list(tenantId).then(r => setConcepts(r.data.results || r.data || []));
  }, [tenantId]);

  const saveGeneral = async () => {
    setSaving(true);
    try {
      await tenantsAPI.update(tenantId, {
        name: form.name,
        currency: form.currency,
        country: form.country,
        state: form.state,
        razon_social: form.razon_social,
        rfc: form.rfc,
        info_calle: form.info_calle,
        info_ciudad: form.info_ciudad,
        rental_settings: {
          ...(form.rental_settings || {}),
          payment_day: Number(form.rental_settings?.payment_day) || 1,
          expiry_alert_days: Number(form.rental_settings?.expiry_alert_days) || 45,
        },
      });
      toast.success('Configuración guardada');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'No se pudo guardar');
    } finally { setSaving(false); }
  };

  const addConcept = async () => {
    const name = window.prompt('Nombre del concepto');
    if (!name) return;
    try {
      const res = await rentalAPI.concepts.create(tenantId, { name, default_amount: 0, is_recurring: true });
      setConcepts(prev => [...prev, res.data]);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'No se pudo crear');
    }
  };

  const countryStates = getStatesForCountry(form.country || '');
  const offMods = rentalOffModules(form.rental_settings);
  const leasingOn = form.rental_settings?.leasing_enabled !== false;

  return (
    <div className="content-fade">
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', color: 'var(--teal-600)', textTransform: 'uppercase' }}>Ajustes</div>
        <h2 style={{ margin: '4px 0 0', fontSize: 22 }}>Configuración</h2>
        <p style={{ color: 'var(--ink-400)', fontSize: 13, marginTop: 4 }}>
          Independiente del espacio de condominios. Solo aplica a Administrar Propiedades.
        </p>
      </div>

      <div className="tabs" style={{ marginBottom: 16 }}>
        {[
          ['general', 'General'],
          ['modo', 'Modo de operación'],
          ['operacion', 'Operación y SLA'],
          ['airbnb', 'Airbnb'],
          ['concepts', 'Conceptos de cobro'],
          ['users', 'Equipo y perfiles'],
        ].filter(([k]) => (k === 'airbnb' ? leasingOn : k === 'concepts' ? !offMods.includes('rentas_cobranza') : true)).map(([k, label]) => (
          <button key={k} className={`tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>

      {tab === 'general' && (
        <div className="card" style={{ padding: 20 }}>
          <div className="form-grid">
            <div className="field field-full">
              <label className="field-label">Nombre de la inmobiliaria</label>
              <input className="field-input" value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="field">
              <label className="field-label">Moneda</label>
              <select className="field-select" value={form.currency || 'MXN'} onChange={e => setForm({ ...form, currency: e.target.value })}>
                {Object.entries(CURRENCIES).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="field-label">País</label>
              <select className="field-select" value={form.country || ''} onChange={e => setForm({ ...form, country: e.target.value, state: '' })}>
                <option value="">Selecciona</option>
                {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="field-label">Estado</label>
              {countryStates.length ? (
                <select className="field-select" value={form.state || ''} onChange={e => setForm({ ...form, state: e.target.value })}>
                  <option value="">Selecciona</option>
                  {countryStates.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              ) : (
                <input className="field-input" value={form.state || ''} onChange={e => setForm({ ...form, state: e.target.value })} />
              )}
            </div>
            <div className="field">
              <label className="field-label">Razón social</label>
              <input className="field-input" value={form.razon_social || ''} onChange={e => setForm({ ...form, razon_social: e.target.value })} />
            </div>
            <div className="field">
              <label className="field-label">RFC</label>
              <input className="field-input" value={form.rfc || ''} onChange={e => setForm({ ...form, rfc: e.target.value })} />
            </div>
            {!offMods.includes('rentas_cobranza') && (
            <div className="field">
              <label className="field-label">Día de cobro por defecto</label>
              <input type="number" min={1} max={28} className="field-input" value={form.rental_settings?.payment_day || 1} onChange={e => setForm({ ...form, rental_settings: { ...(form.rental_settings || {}), payment_day: e.target.value } })} />
            </div>
            )}
            <div className="field">
              <label className="field-label">Aviso de vencimiento (días)</label>
              <input type="number" className="field-input" value={form.rental_settings?.expiry_alert_days || 45} onChange={e => setForm({ ...form, rental_settings: { ...(form.rental_settings || {}), expiry_alert_days: e.target.value } })} />
            </div>
          </div>
          <div style={{ marginTop: 16 }}>
            <button className="btn btn-primary" disabled={saving} onClick={saveGeneral}>{saving ? 'Guardando…' : 'Guardar configuración'}</button>
          </div>
        </div>
      )}

      {tab === 'modo' && <RentalModeSettings />}

      {tab === 'operacion' && <RentalOpsSettings />}

      {tab === 'airbnb' && (
        <AirbnbPanel tenantId={tenantId} />
      )}

      {tab === 'concepts' && (
        <div className="card">
          <div className="card-head">
            <h3>Conceptos cobrables</h3>
            <button className="btn btn-primary btn-sm" onClick={addConcept}>Nuevo concepto</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Concepto</th><th>Monto default</th><th>Recurrente</th><th>Renta</th></tr>
              </thead>
              <tbody>
                {concepts.map(c => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 600 }}>{c.name}</td>
                    <td>{c.default_amount}</td>
                    <td>{c.is_recurring ? 'Sí' : 'No'}</td>
                    <td>{c.is_rent ? 'Sí' : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'users' && <RentalTeam />}
    </div>
  );
}
