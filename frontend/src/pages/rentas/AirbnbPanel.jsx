import React, { useEffect, useState } from 'react';
import { rentalAPI } from '../../api/client';
import toast from 'react-hot-toast';
import { RefreshCw, Plus } from 'lucide-react';

const EMPTY_ROW = { listing_url: '', ical_url: '', name: '', city: '', bedrooms: '', suggested_rent: '' };

export default function AirbnbPanel({ tenantId, compact = false, onImported }) {
  const [connections, setConnections] = useState([]);
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [connForm, setConnForm] = useState({ label: '', host_email: '' });
  const [selected, setSelected] = useState('');
  const [rows, setRows] = useState([{ ...EMPTY_ROW }]);
  const [busy, setBusy] = useState(false);

  const load = () => {
    if (!tenantId) return;
    setLoading(true);
    Promise.all([
      rentalAPI.airbnb.connections.list(tenantId),
      rentalAPI.airbnb.listings.list(tenantId),
    ])
      .then(([c, l]) => {
        const conns = c.data.results || c.data || [];
        setConnections(conns);
        setListings(l.data.results || l.data || []);
        setSelected(prev => {
          if (prev && conns.some(x => String(x.id) === String(prev))) return String(prev);
          return conns[0] ? String(conns[0].id) : '';
        });
      })
      .catch(() => toast.error('No se pudieron cargar las cuentas de Airbnb'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [tenantId]);

  const createConnection = async () => {
    if (!connForm.label.trim()) { toast.error('Ponle un nombre a la cuenta, ej. Cuenta principal'); return; }
    setBusy(true);
    try {
      const res = await rentalAPI.airbnb.connections.create(tenantId, connForm);
      toast.success('Cuenta Airbnb registrada');
      setConnForm({ label: '', host_email: '' });
      setSelected(String(res.data.id));
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'No se pudo crear la cuenta');
    } finally { setBusy(false); }
  };

  const doImport = async () => {
    if (!selected) { toast.error('Crea o elige una cuenta Airbnb primero'); return; }
    const payload = rows
      .filter(r => (r.listing_url || '').trim())
      .map(r => ({
        listing_url: r.listing_url.trim(),
        ical_url: r.ical_url.trim(),
        name: r.name.trim(),
        city: r.city.trim(),
        bedrooms: Number(r.bedrooms) || 0,
        suggested_rent: Number(r.suggested_rent) || 0,
      }));
    if (!payload.length) { toast.error('Pega la URL del anuncio (airbnb.com/rooms/…)'); return; }
    setBusy(true);
    try {
      const res = await rentalAPI.airbnb.connections.importListings(tenantId, selected, { listings: payload });
      const created = res.data.created?.length || 0;
      const updated = res.data.updated?.length || 0;
      const errors = res.data.errors || [];
      if (errors.length) toast.error(`${errors.length} anuncio(s) no se pudieron importar`);
      else toast.success(`Listo: ${created} nuevo(s), ${updated} actualizado(s)`);
      setRows([{ ...EMPTY_ROW }]);
      load();
      onImported?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'No se pudo importar');
    } finally { setBusy(false); }
  };

  const syncAll = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await rentalAPI.airbnb.connections.sync(tenantId, selected);
      toast.success('Calendarios sincronizados');
      load();
      onImported?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'No se pudo sincronizar');
    } finally { setBusy(false); }
  };

  if (loading) {
    return <div style={{ padding: 24, color: 'var(--ink-400)', fontSize: 13 }}>Cargando Airbnb…</div>;
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {!compact && (
        <div style={{ background: 'var(--sand-50)', border: '1px solid var(--sand-200)', borderRadius: 14, padding: 16, fontSize: 13, color: 'var(--ink-600)', lineHeight: 1.6 }}>
          Airbnb no permite que Homly entre con tu usuario y contraseña, ni listar anuncios sin ser
          {' '}<strong>partner oficial</strong>. Lo que sí puedes hacer hoy, de forma permitida:
          <ol style={{ margin: '8px 0 0 18px', padding: 0 }}>
            <li>Crea una cuenta de anfitrión aquí (solo el correo, sin contraseña).</li>
            <li>En Airbnb: Anuncio → Calendario → <em>Exportar calendario</em>. Copia la URL iCal.</li>
            <li>Pega la URL del anuncio (<code>airbnb.com/rooms/…</code>) y la URL iCal. Homly crea la propiedad en el inventario y actualiza ocupación.</li>
          </ol>
        </div>
      )}
      {compact && (
        <div style={{ fontSize: 12, color: 'var(--ink-500)', lineHeight: 1.5 }}>
          Sin contraseña. Pega la URL del anuncio y el iCal exportado desde Airbnb (Calendario → Exportar).
        </div>
      )}

      <div className="card" style={{ padding: 16 }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>Cuentas de anfitrión</h3>
        <div className="form-grid">
          <div className="field">
            <label className="field-label">Nombre de la cuenta</label>
            <input className="field-input" placeholder="Ej. Cuenta principal" value={connForm.label} onChange={e => setConnForm({ ...connForm, label: e.target.value })} />
          </div>
          <div className="field">
            <label className="field-label">Correo del anfitrión en Airbnb</label>
            <input className="field-input" placeholder="opcional" value={connForm.host_email} onChange={e => setConnForm({ ...connForm, host_email: e.target.value })} />
          </div>
        </div>
        <button className="btn btn-primary btn-sm" style={{ marginTop: 10 }} disabled={busy} onClick={createConnection}>
          <Plus size={14} /> Registrar cuenta
        </button>
        {connections.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <label className="field-label">Usar cuenta</label>
            <select className="field-select" value={selected} onChange={e => setSelected(e.target.value)}>
              {connections.map(c => (
                <option key={c.id} value={c.id}>{c.label}{c.host_email ? ` · ${c.host_email}` : ''} ({c.listings_count || 0} anuncios)</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="card" style={{ padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>Importar anuncios al inventario</h3>
          <button className="btn btn-outline btn-sm" disabled={busy || !selected} onClick={syncAll}>
            <RefreshCw size={13} /> Sincronizar calendarios
          </button>
        </div>
        {rows.map((row, i) => (
          <div key={i} className="form-grid" style={{ marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid var(--sand-100)' }}>
            <div className="field field-full">
              <label className="field-label">URL del anuncio *</label>
              <input className="field-input" placeholder="https://www.airbnb.com/rooms/12345678" value={row.listing_url} onChange={e => setRows(rs => rs.map((r, n) => n === i ? { ...r, listing_url: e.target.value } : r))} />
            </div>
            <div className="field field-full">
              <label className="field-label">URL iCal (exportar calendario en Airbnb)</label>
              <input className="field-input" placeholder="https://www.airbnb.com/calendar/ical/….ics?s=…" value={row.ical_url} onChange={e => setRows(rs => rs.map((r, n) => n === i ? { ...r, ical_url: e.target.value } : r))} />
            </div>
            <div className="field">
              <label className="field-label">Nombre en Homly</label>
              <input className="field-input" placeholder="Depto Centro" value={row.name} onChange={e => setRows(rs => rs.map((r, n) => n === i ? { ...r, name: e.target.value } : r))} />
            </div>
            <div className="field">
              <label className="field-label">Ciudad</label>
              <input className="field-input" value={row.city} onChange={e => setRows(rs => rs.map((r, n) => n === i ? { ...r, city: e.target.value } : r))} />
            </div>
            <div className="field">
              <label className="field-label">Recámaras</label>
              <input className="field-input" type="number" value={row.bedrooms} onChange={e => setRows(rs => rs.map((r, n) => n === i ? { ...r, bedrooms: e.target.value } : r))} />
            </div>
            <div className="field">
              <label className="field-label">Renta / tarifa sugerida</label>
              <input className="field-input" type="number" value={row.suggested_rent} onChange={e => setRows(rs => rs.map((r, n) => n === i ? { ...r, suggested_rent: e.target.value } : r))} />
            </div>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-outline btn-sm" type="button" onClick={() => setRows(r => [...r, { ...EMPTY_ROW }])}>Otro anuncio</button>
          <button className="btn btn-primary" disabled={busy} onClick={doImport}>{busy ? 'Importando…' : 'Agregar al inventario'}</button>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h3>Anuncios vinculados</h3></div>
        {listings.length === 0 ? (
          <div style={{ padding: 20, fontSize: 13, color: 'var(--ink-400)' }}>Aún no hay anuncios. Impórtalos arriba para verlos como propiedades.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Anuncio</th>
                  <th>En Homly</th>
                  <th>Ocupación</th>
                  <th>Última sync</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {listings.map(l => (
                  <tr key={l.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{l.listing_name}</div>
                      <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>
                        ID {l.airbnb_listing_id}
                        {l.listing_url ? <> · <a href={l.listing_url} target="_blank" rel="noreferrer">ver en Airbnb</a></> : null}
                      </div>
                      {l.last_sync_error ? <div style={{ fontSize: 11, color: 'var(--coral-500)' }}>{l.last_sync_error}</div> : null}
                    </td>
                    <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>{l.property_code || '—'}</td>
                    <td>{l.occupied_now ? 'Ocupada ahora' : l.ical_configured ? 'Libre (iCal)' : 'Sin iCal'}</td>
                    <td style={{ fontSize: 12 }}>{l.last_synced_at ? new Date(l.last_synced_at).toLocaleString('es-MX') : '—'}</td>
                    <td>
                      <button
                        className="btn btn-outline btn-sm"
                        disabled={busy || !l.ical_configured}
                        onClick={async () => {
                          setBusy(true);
                          try {
                            await rentalAPI.airbnb.listings.sync(tenantId, l.id);
                            toast.success('Calendario actualizado');
                            load();
                            onImported?.();
                          } catch (e) {
                            toast.error(e.response?.data?.detail || e.response?.data?.sync?.error || 'No se pudo sincronizar');
                          } finally { setBusy(false); }
                        }}
                      >
                        Sync
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
