import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { rentalAPI, tenantsAPI } from '../../api/client';
import { Plus, Search, Target } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  CONTRACT_STATUS, LEAD_SOURCES, LEAD_STAGE_MAP, LEAD_STAGES,
  StatusPill, fmtDate, fmtMoney,
} from './rentalUtils';

const EMPTY_LEAD = {
  first_name: '', last_name: '', email: '', phone: '',
  property: '', source: 'whatsapp', stage: 'nuevo',
  interested_rent: '', expected_start: '', notes: '',
};

const OPEN = ['nuevo', 'contactado', 'visita', 'propuesta', 'negociacion'];

function addYear(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y) return '';
  return `${y + 1}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function RentalCRM() {
  const { tenantId } = useAuth();
  const navigate = useNavigate();
  const [leads, setLeads] = useState([]);
  const [properties, setProperties] = useState([]);
  const [currency, setCurrency] = useState('MXN');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [propertyFilter, setPropertyFilter] = useState('');
  const [view, setView] = useState('pipeline');
  const [form, setForm] = useState(null);
  const [detail, setDetail] = useState(null);
  const [activities, setActivities] = useState([]);
  const [note, setNote] = useState({ kind: 'note', body: '' });
  const [convert, setConvert] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    if (!tenantId) return;
    setLoading(true);
    Promise.all([
      rentalAPI.leads.list(tenantId, { search, property: propertyFilter || undefined }),
      rentalAPI.properties.list(tenantId, { page_size: 500 }),
      tenantsAPI.get(tenantId).catch(() => ({ data: {} })),
    ]).then(([l, p, t]) => {
      setLeads(l.data.results || l.data || []);
      setProperties(p.data.results || p.data || []);
      setCurrency(t.data?.currency || 'MXN');
    }).catch(() => toast.error('No se pudo cargar el CRM de rentas'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [tenantId]);

  const openDetail = async (lead) => {
    setDetail(lead);
    try {
      const r = await rentalAPI.leads.activities(tenantId, lead.id);
      setActivities(r.data || []);
    } catch {
      setActivities([]);
    }
  };

  const saveLead = async () => {
    if (!form.first_name.trim()) { toast.error('El nombre del lead es obligatorio'); return; }
    setBusy(true);
    try {
      const payload = {
        ...form,
        property: form.property || null,
        interested_rent: Number(form.interested_rent) || 0,
        expected_start: form.expected_start || null,
      };
      if (form.id) await rentalAPI.leads.update(tenantId, form.id, payload);
      else await rentalAPI.leads.create(tenantId, payload);
      toast.success(form.id ? 'Lead actualizado' : 'Lead registrado');
      setForm(null);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'No se pudo guardar el lead');
    } finally { setBusy(false); }
  };

  const moveLead = async (lead, stage) => {
    if (stage === 'ganado') {
      openConvert(lead);
      return;
    }
    let lost_reason = lead.lost_reason;
    if (stage === 'perdido') {
      lost_reason = window.prompt('Motivo de pérdida (opcional)', lead.lost_reason || '') ?? lead.lost_reason;
    }
    try {
      await rentalAPI.leads.move(tenantId, lead.id, { stage, lost_reason });
      load();
      if (detail?.id === lead.id) {
        const r = await rentalAPI.leads.get(tenantId, lead.id);
        setDetail(r.data);
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || 'No se pudo mover el lead');
    }
  };

  const openConvert = (lead) => {
    const start = lead.expected_start || todayISO();
    const prop = properties.find(p => p.id === lead.property);
    setConvert({
      lead,
      property: lead.property || '',
      start_date: start,
      end_date: addYear(start),
      rent_amount: lead.interested_rent || prop?.suggested_rent || 0,
      deposit_amount: lead.interested_rent || prop?.suggested_rent || 0,
      payment_day: 1,
      code: '',
      activate: false,
      notes: '',
    });
  };

  const doConvert = async () => {
    if (!convert.property || !convert.start_date || !convert.end_date) {
      toast.error('Unidad y vigencia del contrato son obligatorias');
      return;
    }
    setBusy(true);
    try {
      const res = await rentalAPI.leads.convert(tenantId, convert.lead.id, {
        property: convert.property,
        start_date: convert.start_date,
        end_date: convert.end_date,
        rent_amount: Number(convert.rent_amount) || 0,
        deposit_amount: Number(convert.deposit_amount) || 0,
        payment_day: Number(convert.payment_day) || 1,
        code: convert.code.trim(),
        activate: convert.activate,
        notes: convert.notes,
      });
      toast.success(`Cliente creado. Contrato ${res.data.contract?.code}`);
      setConvert(null);
      setDetail(null);
      load();
      navigate('/app/rentas/contratos');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'No se pudo convertir el lead');
    } finally { setBusy(false); }
  };

  const addNote = async () => {
    if (!detail || !note.body.trim()) return;
    try {
      const r = await rentalAPI.leads.addActivity(tenantId, detail.id, note);
      setActivities(prev => [r.data, ...prev]);
      setNote({ kind: 'note', body: '' });
    } catch (e) {
      toast.error(e.response?.data?.detail || 'No se pudo guardar el seguimiento');
    }
  };

  const stats = useMemo(() => ({
    open: leads.filter(l => OPEN.includes(l.stage)).length,
    visits: leads.filter(l => l.stage === 'visita').length,
    won: leads.filter(l => l.stage === 'ganado').length,
    lost: leads.filter(l => l.stage === 'perdido').length,
  }), [leads]);

  const byStage = useMemo(() => {
    const map = {};
    LEAD_STAGES.forEach(s => { map[s.key] = []; });
    leads.forEach(l => { (map[l.stage] || (map[l.stage] = [])).push(l); });
    return map;
  }, [leads]);

  return (
    <div className="content-fade">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', color: 'var(--teal-600)', textTransform: 'uppercase' }}>CRM de rentas</div>
          <h2 style={{ margin: '4px 0 0', fontSize: 22 }}>Leads y clientes</h2>
          <p style={{ color: 'var(--ink-400)', fontSize: 13, marginTop: 4 }}>
            Prospectos por unidad. Al ganarlo se crea el inquilino y el contrato.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--ink-400)' }} />
            <input className="field-input" placeholder="Buscar…" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && load()} style={{ paddingLeft: 30, width: 180 }} />
          </div>
          <select className="field-select" value={propertyFilter} onChange={e => setPropertyFilter(e.target.value)} style={{ width: 200 }}>
            <option value="">Todas las unidades</option>
            {properties.map(p => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
          </select>
          <button className="btn btn-outline btn-sm" onClick={load}>Filtrar</button>
          <div className="tabs">
            <button className={`tab ${view === 'pipeline' ? 'active' : ''}`} onClick={() => setView('pipeline')}>Pipeline</button>
            <button className={`tab ${view === 'list' ? 'active' : ''}`} onClick={() => setView('list')}>Lista</button>
          </div>
          <button className="btn btn-primary" onClick={() => setForm({ ...EMPTY_LEAD })}><Plus size={15} /> Nuevo lead</button>
        </div>
      </div>

      <div className="cob-stats" style={{ marginBottom: 16 }}>
        <MiniKpi label="Abiertos" value={stats.open} />
        <MiniKpi label="En visita" value={stats.visits} />
        <MiniKpi label="Ganados" value={stats.won} />
        <MiniKpi label="Perdidos" value={stats.lost} />
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-400)' }}>Cargando CRM…</div>
      ) : view === 'pipeline' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(190px, 1fr))', gap: 10, overflowX: 'auto', paddingBottom: 8 }}>
          {LEAD_STAGES.map(stage => (
            <div key={stage.key} className="card" style={{ minHeight: 280, display: 'flex', flexDirection: 'column' }}>
              <div className="card-head" style={{ padding: '10px 12px' }}>
                <h3 style={{ fontSize: 12, margin: 0, color: stage.color }}>{stage.label}</h3>
                <span style={{ fontSize: 11, color: 'var(--ink-400)' }}>{byStage[stage.key]?.length || 0}</span>
              </div>
              <div style={{ padding: 8, display: 'grid', gap: 8, flex: 1 }}>
                {(byStage[stage.key] || []).map(lead => (
                  <button
                    key={lead.id}
                    type="button"
                    onClick={() => openDetail(lead)}
                    style={{
                      textAlign: 'left', border: '1px solid var(--sand-100)', borderRadius: 10,
                      padding: 10, background: 'var(--white)', cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{lead.full_name}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 2 }}>
                      {lead.property_code ? `${lead.property_code} · ${lead.property_name}` : 'Sin unidad'}
                    </div>
                    {Number(lead.interested_rent) > 0 && (
                      <div style={{ fontSize: 12, marginTop: 4 }}>{fmtMoney(lead.interested_rent, currency)}</div>
                    )}
                    {lead.contract_code && (
                      <div style={{ fontSize: 11, marginTop: 4, color: 'var(--teal-600)' }}>Contrato {lead.contract_code}</div>
                    )}
                  </button>
                ))}
                {(byStage[stage.key] || []).length === 0 && (
                  <div style={{ fontSize: 12, color: 'var(--ink-400)', padding: 8 }}>Sin leads</div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card">
          {leads.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', color: 'var(--ink-400)' }}>
              <Target size={22} style={{ opacity: 0.5, marginBottom: 8 }} />
              <div style={{ fontWeight: 600 }}>Aún no hay leads</div>
              <div style={{ fontSize: 13, marginTop: 6 }}>Registra interesados y conviértelos en inquilinos con contrato.</div>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Lead</th>
                    <th>Unidad</th>
                    <th>Origen</th>
                    <th>Renta objetivo</th>
                    <th>Etapa</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map(l => (
                    <tr key={l.id} style={{ cursor: 'pointer' }} onClick={() => openDetail(l)}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{l.full_name}</div>
                        <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>{l.phone || l.email || '—'}</div>
                      </td>
                      <td>{l.property_code ? `${l.property_code} · ${l.property_name}` : '—'}</td>
                      <td>{LEAD_SOURCES[l.source] || l.source}</td>
                      <td>{fmtMoney(l.interested_rent, currency)}</td>
                      <td><StatusPill map={LEAD_STAGE_MAP} value={l.stage} /></td>
                      <td>
                        {l.stage !== 'ganado' && l.stage !== 'perdido' && (
                          <button className="btn btn-primary btn-sm" onClick={e => { e.stopPropagation(); openConvert(l); }}>Ganar</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {form && (
        <div className="modal-bg open" onClick={() => setForm(null)}>
          <div className="modal lg" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3>{form.id ? 'Editar lead' : 'Nuevo lead'}</h3>
              <button className="modal-close" onClick={() => setForm(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="field">
                  <label className="field-label">Nombre *</label>
                  <input className="field-input" value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} />
                </div>
                <div className="field">
                  <label className="field-label">Apellido</label>
                  <input className="field-input" value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} />
                </div>
                <div className="field">
                  <label className="field-label">Teléfono</label>
                  <input className="field-input" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
                </div>
                <div className="field">
                  <label className="field-label">Correo</label>
                  <input className="field-input" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
                </div>
                <div className="field">
                  <label className="field-label">Unidad de interés</label>
                  <select className="field-select" value={form.property || ''} onChange={e => setForm({ ...form, property: e.target.value })}>
                    <option value="">Por definir</option>
                    {properties.map(p => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label className="field-label">Origen</label>
                  <select className="field-select" value={form.source} onChange={e => setForm({ ...form, source: e.target.value })}>
                    {Object.entries(LEAD_SOURCES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label className="field-label">Renta objetivo</label>
                  <input type="number" className="field-input" value={form.interested_rent} onChange={e => setForm({ ...form, interested_rent: e.target.value })} />
                </div>
                <div className="field">
                  <label className="field-label">Ingreso estimado</label>
                  <input type="date" className="field-input" value={form.expected_start || ''} onChange={e => setForm({ ...form, expected_start: e.target.value })} />
                </div>
                <div className="field field-full">
                  <label className="field-label">Notas</label>
                  <textarea className="field-input" rows={3} value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} />
                </div>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setForm(null)}>Cancelar</button>
              <button className="btn btn-primary" disabled={busy} onClick={saveLead}>{busy ? 'Guardando…' : 'Guardar'}</button>
            </div>
          </div>
        </div>
      )}

      {detail && (
        <div className="modal-bg open" onClick={() => setDetail(null)}>
          <div className="modal lg" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3>{detail.full_name}</h3>
              <button className="modal-close" onClick={() => setDetail(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                <StatusPill map={LEAD_STAGE_MAP} value={detail.stage} />
                <span style={{ fontSize: 12, color: 'var(--ink-400)' }}>{LEAD_SOURCES[detail.source]}</span>
                {detail.property_code && <span style={{ fontSize: 12 }}>{detail.property_code} · {detail.property_name}</span>}
              </div>
              <div style={{ fontSize: 13, color: 'var(--ink-600)', marginBottom: 12 }}>
                {detail.phone || 'Sin teléfono'} · {detail.email || 'Sin correo'}
                {Number(detail.interested_rent) > 0 ? ` · ${fmtMoney(detail.interested_rent, currency)}` : ''}
              </div>
              {detail.notes && <p style={{ fontSize: 13, color: 'var(--ink-500)' }}>{detail.notes}</p>}
              {detail.contract_code && (
                <div style={{ fontSize: 13, marginBottom: 12 }}>
                  Contrato <strong>{detail.contract_code}</strong>
                  {' '}<StatusPill map={CONTRACT_STATUS} value={detail.contract_status} />
                </div>
              )}

              {!detail.contract && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
                  {OPEN.map(st => (
                    <button key={st} className="btn btn-outline btn-sm" disabled={detail.stage === st} onClick={() => moveLead(detail, st)}>
                      {LEAD_STAGE_MAP[st].label}
                    </button>
                  ))}
                  <button className="btn btn-primary btn-sm" onClick={() => openConvert(detail)}>Ganar y crear contrato</button>
                  <button className="btn btn-outline btn-sm" onClick={() => moveLead(detail, 'perdido')}>Perdido</button>
                </div>
              )}

              <h4 style={{ fontSize: 13, margin: '8px 0' }}>Seguimiento</h4>
              <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                <select className="field-select" value={note.kind} onChange={e => setNote(n => ({ ...n, kind: e.target.value }))} style={{ width: 130 }}>
                  <option value="note">Nota</option>
                  <option value="call">Llamada</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="email">Correo</option>
                  <option value="visit">Visita</option>
                </select>
                <input className="field-input" placeholder="Qué se habló…" value={note.body} onChange={e => setNote(n => ({ ...n, body: e.target.value }))} onKeyDown={e => e.key === 'Enter' && addNote()} />
                <button className="btn btn-outline btn-sm" onClick={addNote}>Agregar</button>
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                {activities.length === 0 && <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>Sin notas aún.</div>}
                {activities.map(a => (
                  <div key={a.id} style={{ border: '1px solid var(--sand-100)', borderRadius: 8, padding: '8px 10px' }}>
                    <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>
                      {a.kind} · {new Date(a.created_at).toLocaleString('es-MX')} {a.created_by_name ? `· ${a.created_by_name}` : ''}
                    </div>
                    <div style={{ fontSize: 13, marginTop: 2 }}>{a.body}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-outline" onClick={() => { setForm({ ...EMPTY_LEAD, ...detail, property: detail.property || '' }); setDetail(null); }}>Editar</button>
              <button className="btn btn-secondary" onClick={() => setDetail(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {convert && (
        <div className="modal-bg open" onClick={() => setConvert(null)}>
          <div className="modal lg" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Convertir a cliente · {convert.lead.full_name}</h3>
              <button className="modal-close" onClick={() => setConvert(null)}>✕</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 13, color: 'var(--ink-500)', marginTop: 0 }}>
                Se crea el inquilino (si no existe) y un contrato de la unidad. Puedes dejarlo en borrador o activarlo ya.
              </p>
              <div className="form-grid">
                <div className="field field-full">
                  <label className="field-label">Unidad *</label>
                  <select className="field-select" value={convert.property} onChange={e => {
                    const id = e.target.value;
                    const p = properties.find(x => x.id === id);
                    setConvert(c => ({
                      ...c,
                      property: id,
                      rent_amount: c.lead.interested_rent || p?.suggested_rent || c.rent_amount,
                      deposit_amount: c.lead.interested_rent || p?.suggested_rent || c.deposit_amount,
                    }));
                  }}>
                    <option value="">Selecciona…</option>
                    {properties.map(p => <option key={p.id} value={p.id}>{p.code} — {p.name} ({p.status})</option>)}
                  </select>
                </div>
                <div className="field">
                  <label className="field-label">Código de contrato</label>
                  <input className="field-input" placeholder="Automático" value={convert.code} onChange={e => setConvert({ ...convert, code: e.target.value })} />
                </div>
                <div className="field">
                  <label className="field-label">Día de pago</label>
                  <input type="number" className="field-input" value={convert.payment_day} onChange={e => setConvert({ ...convert, payment_day: e.target.value })} />
                </div>
                <div className="field">
                  <label className="field-label">Inicio *</label>
                  <input type="date" className="field-input" value={convert.start_date} onChange={e => setConvert({ ...convert, start_date: e.target.value, end_date: addYear(e.target.value) })} />
                </div>
                <div className="field">
                  <label className="field-label">Fin *</label>
                  <input type="date" className="field-input" value={convert.end_date} onChange={e => setConvert({ ...convert, end_date: e.target.value })} />
                </div>
                <div className="field">
                  <label className="field-label">Renta mensual</label>
                  <input type="number" className="field-input" value={convert.rent_amount} onChange={e => setConvert({ ...convert, rent_amount: e.target.value })} />
                </div>
                <div className="field">
                  <label className="field-label">Depósito</label>
                  <input type="number" className="field-input" value={convert.deposit_amount} onChange={e => setConvert({ ...convert, deposit_amount: e.target.value })} />
                </div>
                <div className="field field-full">
                  <label className="field-label">Notas del contrato</label>
                  <textarea className="field-input" rows={2} value={convert.notes} onChange={e => setConvert({ ...convert, notes: e.target.value })} />
                </div>
                <label className="field field-full" style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                  <input type="checkbox" checked={convert.activate} onChange={e => setConvert({ ...convert, activate: e.target.checked })} />
                  Activar el contrato ahora (si no, queda en borrador y la unidad se reserva)
                </label>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setConvert(null)}>Cancelar</button>
              <button className="btn btn-primary" disabled={busy} onClick={doConvert}>{busy ? 'Creando…' : 'Crear cliente y contrato'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MiniKpi({ label, value }) {
  return (
    <div className="cob-stat">
      <div>
        <div className="cob-stat-label">{label}</div>
        <div className="cob-stat-value" style={{ fontSize: 18 }}>{value}</div>
      </div>
    </div>
  );
}
