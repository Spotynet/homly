import React, { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  UserCheck, Plus, Search, X, Camera, Mail, SlidersHorizontal, Loader2,
  QrCode, ScanLine, LogIn, LogOut, Ban, Clock, Contact, FileText,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { visitasAPI } from '../api/client';
import { useUnits } from '../hooks/useUnits';
import ProtectedImage from '../components/ProtectedImage';
import QrCapture from '../components/QrCapture';
import PeriodReportModal from '../components/PeriodReportModal';
import { QR_MISMATCH_MSG, qrMatchesExpected } from '../utils/homlyQr';

function compressImage(file, { maxDim = 1600, quality = 0.8 } = {}) {
  return new Promise((resolve) => {
    if (!file || !file.type?.startsWith('image/')) return resolve(file);
    if (file.type === 'image/gif' || file.type === 'image/svg+xml') return resolve(file);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new window.Image();
      img.onload = () => {
        try {
          const ratio = Math.min(1, maxDim / Math.max(img.width, img.height));
          const w = Math.max(1, Math.round(img.width * ratio));
          const h = Math.max(1, Math.round(img.height * ratio));
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          canvas.toBlob((blob) => {
            if (!blob) return resolve(file);
            resolve(new File([blob], (file.name || 'foto').replace(/\.[^.]+$/, '') + '.jpg', {
              type: 'image/jpeg', lastModified: Date.now(),
            }));
          }, 'image/jpeg', quality);
        } catch {
          resolve(file);
        }
      };
      img.onerror = () => resolve(file);
      img.src = ev.target.result;
    };
    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
}

function fmtDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function fmtDay(value) {
  if (!value) return '—';
  const raw = String(value);
  const d = raw.includes('T') ? new Date(raw) : new Date(`${raw}T12:00:00`);
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

function errMsg(e, fallback) {
  const data = e?.response?.data || {};
  return data.detail
    || data.unit?.[0]
    || data.visitor_first_name?.[0]
    || data.visitor_last_name?.[0]
    || data.visitor_email?.[0]
    || data.expected_arrive_at?.[0]
    || data.valid_from?.[0]
    || data.valid_until?.[0]
    || data.max_visits?.[0]
    || data.duration_mode?.[0]
    || data.kind?.[0]
    || data.qr?.[0]
    || data.method?.[0]
    || data.photo?.[0]
    || data.host_key?.[0]
    || data.host_name?.[0]
    || data.vehicle_plate?.[0]
    || data.vehicle_photo?.[0]
    || data.parking_label?.[0]
    || data.parking_spot?.[0]
    || data.badge?.[0]
    || data.badge_label?.[0]
    || data.recipients?.[0]
    || fallback;
}

function statusBadge(status) {
  if (status === 'en_condominio') return 'badge-teal';
  if (status === 'vigente') return 'badge-amber';
  if (status === 'cancelada' || status === 'vencida' || status === 'agotada') return 'badge-coral';
  return 'badge';
}

const EVENT_META = {
  creado:    { icon: '🪪', label: 'Autorización creada', color: 'var(--teal-700)' },
  ingreso:   { icon: '➡️', label: 'Ingreso al condominio', color: 'var(--teal-600)' },
  salida:    { icon: '⬅️', label: 'Salida del condominio', color: 'var(--blue-600)' },
  cancelado: { icon: '🚫', label: 'Autorización cancelada', color: 'var(--coral-600)' },
  reenviado: { icon: '✉️', label: 'Correo reenviado', color: 'var(--ink-500)' },
};

export default function Visitas() {
  const { tenantId, tenantName } = useAuth();
  const { data: units = [] } = useUnits(tenantId);
  const [ctx, setCtx] = useState(null);
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('permanente');
  const [insideOnly, setInsideOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [gateVisit, setGateVisit] = useState(null);
  const [cancelVisit, setCancelVisit] = useState(null);
  const [reportOpen, setReportOpen] = useState(false);

  const canCreate = !!ctx?.can_create;
  const canGate = !!ctx?.can_gate;
  const canEditSettings = !!ctx?.can_edit_settings;

  const loadCtx = () => {
    if (!tenantId) return;
    visitasAPI.context(tenantId).then(r => setCtx(r.data)).catch(() => {});
  };

  const loadList = () => {
    if (!tenantId) return;
    setLoading(true);
    const params = { page_size: 200, kind: tab };
    if (insideOnly) params.inside = 1;
    if (search.trim()) params.search = search.trim();
    visitasAPI.list(tenantId, params)
      .then(r => {
        const raw = r.data;
        setList(Array.isArray(raw) ? raw : (raw?.results || []));
      })
      .catch(() => toast.error('No se pudo cargar la bitácora de visitas'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadCtx(); }, [tenantId]);
  useEffect(() => { loadList(); }, [tenantId, tab, insideOnly]);

  const openDetail = async (id) => {
    try {
      const r = await visitasAPI.get(tenantId, id);
      setDetail(r.data);
    } catch {
      toast.error('No se pudo abrir la autorización');
    }
  };

  const refreshAll = () => {
    loadCtx();
    loadList();
    if (detail?.id) openDetail(detail.id);
  };

  return (
    <div className="content-fade visitas-page" style={{ paddingBottom: 24 }}>
      <style>{`
        .visitas-page .field { gap: 8px; }
        .visitas-page .field-label { margin-bottom: 0; }
        .visitas-form { display: flex; flex-direction: column; gap: 16px; }
        .visitas-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px; }
        .visitas-page table th, .visitas-page table td { padding: 12px 14px; }
      `}</style>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
        <div style={{ minWidth: 0, flex: '1 1 240px' }}>
          <h2 style={{ margin: 0, fontSize: 22, lineHeight: 1.25 }}>Visitas Autorizadas</h2>
          <p style={{ margin: '8px 0 0', color: 'var(--ink-400)', fontSize: 13, lineHeight: 1.45, maxWidth: 560 }}>
            Autoriza familiares, personal o visitas temporales. Vigilancia registra ingreso y salida con QR o identificación.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn btn-outline" onClick={() => setReportOpen(true)}>
            <FileText size={14} /> Reporte
          </button>
          {canEditSettings && (
            <button className="btn btn-outline" onClick={() => setCustomizeOpen(true)}>
              <SlidersHorizontal size={14} /> Personalizar
            </button>
          )}
          {canGate && (
            <button className="btn btn-outline" onClick={() => setScanOpen(true)}>
              <ScanLine size={15} /> Escanear QR
            </button>
          )}
          {canCreate && (
            <button className="btn btn-primary" onClick={() => setCreateOpen(true)}>
              <Plus size={15} /> Autorizar visita
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Permanentes', value: ctx?.counts?.permanente ?? '—', color: 'var(--teal-700)' },
          { label: 'Ocasionales', value: ctx?.counts?.ocasional ?? '—', color: 'var(--amber-700)' },
          { label: 'En condominio', value: ctx?.counts?.en_condominio ?? '—', color: 'var(--blue-600)' },
          { label: 'Vigentes', value: ctx?.counts?.vigente ?? '—', color: 'var(--ink-700)' },
        ].map(card => (
          <div key={card.label} className="card" style={{ padding: 14 }}>
            <div style={{ fontSize: 11, color: 'var(--ink-400)', fontWeight: 700, textTransform: 'uppercase' }}>{card.label}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: card.color, lineHeight: 1.1 }}>{card.value}</div>
          </div>
        ))}
      </div>

      <div className="tabs" style={{ marginBottom: 16 }}>
        <button className={`tab ${tab === 'permanente' ? 'active' : ''}`} onClick={() => setTab('permanente')}>
          Visitas permanentes
        </button>
        <button className={`tab ${tab === 'ocasional' ? 'active' : ''}`} onClick={() => setTab('ocasional')}>
          Visitas ocasionales
        </button>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 220px', maxWidth: 360 }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-400)' }} />
          <input
            className="field-input"
            style={{ paddingLeft: 36 }}
            placeholder="Buscar folio, visitante o unidad..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && loadList()}
          />
        </div>
        {canGate && (
          <button
            className={`btn ${insideOnly ? 'btn-primary' : 'btn-outline'} btn-sm`}
            onClick={() => setInsideOnly(v => !v)}
          >
            <Clock size={13} /> En condominio
          </button>
        )}
        <button className="btn btn-outline btn-sm" onClick={loadList}>Buscar</button>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--ink-400)' }}>
            <Loader2 size={22} className="animate-spin" style={{ marginRight: 8 }} /> Cargando autorizaciones...
          </div>
        ) : list.length === 0 ? (
          <div style={{ padding: 36, textAlign: 'center', color: 'var(--ink-400)' }}>
            <UserCheck size={36} style={{ opacity: 0.3, marginBottom: 8 }} />
            <div style={{ fontWeight: 700, color: 'var(--ink-600)' }}>
              {tab === 'permanente' ? 'Sin visitas permanentes' : 'Sin visitas ocasionales'}
            </div>
            <div style={{ fontSize: 13 }}>
              {canCreate ? 'Autoriza a un familiar, personal de trabajo o visita temporal.' : 'Aún no hay registros en esta bitácora.'}
            </div>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Folio</th>
                  <th>Visitante</th>
                  <th>Visita a</th>
                  <th>Unidad</th>
                  <th>Vigencia</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {list.map(v => (
                  <tr key={v.id} style={{ cursor: 'pointer' }} onClick={() => openDetail(v.id)}>
                    <td style={{ fontFamily: 'monospace', fontWeight: 800, color: 'var(--teal-700)' }}>{v.folio}</td>
                    <td>
                      <div style={{ fontWeight: 700 }}>{v.visitor_name}</div>
                      <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>{v.visitor_email}</div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{v.host_name || '—'}</div>
                      {v.host_kind_label && <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>{v.host_kind_label}</div>}
                    </td>
                    <td>
                      <div style={{ fontWeight: 700 }}>{v.unit_name}</div>
                      <div style={{ fontSize: 12, color: 'var(--ink-400)', fontFamily: 'monospace' }}>{v.unit_code}</div>
                    </td>
                    <td style={{ fontSize: 12 }}>
                      <div>{fmtDay(v.valid_from)} — {fmtDay(v.valid_until)}</div>
                      <div style={{ color: 'var(--ink-400)' }}>{v.duration_label}</div>
                    </td>
                    <td>
                      <span className={`badge ${statusBadge(v.status)}`}>{v.status_label}</span>
                      {v.currently_inside && (
                        <div style={{ fontSize: 11, color: 'var(--teal-700)', fontWeight: 700, marginTop: 4 }}>Dentro</div>
                      )}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {canGate && v.currently_inside && (
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={e => { e.stopPropagation(); setGateVisit({ ...v, gate: 'salida' }); }}
                        >
                          <LogOut size={13} /> Salida
                        </button>
                      )}
                      {canGate && !v.currently_inside && v.status === 'vigente' && (
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={e => { e.stopPropagation(); setGateVisit({ ...v, gate: 'ingreso' }); }}
                        >
                          <LogIn size={13} /> Ingreso
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {detail && (
        <DetailDrawer
          visit={detail}
          canCreate={canCreate}
          canGate={canGate}
          onClose={() => setDetail(null)}
          onGate={(gate) => setGateVisit({ ...detail, gate })}
          onCancel={() => setCancelVisit(detail)}
          onResent={() => refreshAll()}
        />
      )}
      {createOpen && (
        <CreateModal
          tenantId={tenantId}
          units={units}
          defaultKind={tab}
          residentUnitId={ctx?.resident_unit_id}
          onClose={() => setCreateOpen(false)}
          onDone={() => { setCreateOpen(false); refreshAll(); }}
        />
      )}
      {reportOpen && (
        <PeriodReportModal
          title="Reporte de visitas autorizadas"
          subtitle="Resumen y autorizaciones del periodo"
          tenantName={tenantName}
          filenamePrefix="Visitas"
          onClose={() => setReportOpen(false)}
          loadReport={(params) => visitasAPI.report(tenantId, params)}
          downloadReport={(params) => visitasAPI.reportPdf(tenantId, params)}
        />
      )}

      {customizeOpen && (
        <CustomizeModal
          tenantId={tenantId}
          onClose={() => setCustomizeOpen(false)}
          onSaved={() => { setCustomizeOpen(false); loadCtx(); }}
        />
      )}
      {scanOpen && (
        <ScanModal
          tenantId={tenantId}
          onClose={() => setScanOpen(false)}
          onOpenGate={(visit, gate, verifiedQr) => { setScanOpen(false); setGateVisit({ ...visit, gate, verifiedQr }); }}
          onOpenDetail={(visit) => { setScanOpen(false); setDetail(visit); }}
        />
      )}
      {gateVisit && (
        <GateModal
          tenantId={tenantId}
          visit={gateVisit}
          catalog={ctx}
          onClose={() => setGateVisit(null)}
          onDone={() => { setGateVisit(null); refreshAll(); }}
        />
      )}
      {cancelVisit && (
        <CancelModal
          tenantId={tenantId}
          visit={cancelVisit}
          onClose={() => setCancelVisit(null)}
          onDone={() => { setCancelVisit(null); setDetail(null); refreshAll(); }}
        />
      )}
    </div>
  );
}

function CreateModal({ tenantId, units, defaultKind, residentUnitId, onClose, onDone }) {
  const [saving, setSaving] = useState(false);
  const [hosts, setHosts] = useState([]);
  const [form, setForm] = useState({
    unit: residentUnitId || '',
    visitor_first_name: '',
    visitor_last_name: '',
    visitor_email: '',
    visitor_phone: '',
    host_key: '',
    host_name: '',
    kind: defaultKind || 'ocasional',
    expected_arrive_at: '',
    duration_mode: 'count',
    max_visits: '4',
    valid_from: '',
    valid_until: '',
    notes: '',
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const unitId = residentUnitId || form.unit;

  useEffect(() => {
    if (!tenantId || !unitId) { setHosts([]); return; }
    visitasAPI.hosts(tenantId, unitId)
      .then(r => setHosts(r.data.hosts || []))
      .catch(() => setHosts([]));
  }, [tenantId, unitId]);

  const save = async () => {
    if (!form.visitor_first_name.trim() || !form.visitor_last_name.trim()) {
      return toast.error('Escribe el nombre y los apellidos');
    }
    if (!form.visitor_email.trim()) return toast.error('El correo del visitante es obligatorio');
    if (!residentUnitId && !form.unit) return toast.error('Selecciona la unidad');
    if (!form.host_key) return toast.error('Indica a quién visita');
    if (form.host_key === 'other' && !form.host_name.trim()) {
      return toast.error('Escribe el nombre completo de quien recibe la visita');
    }
    if (form.kind === 'ocasional' && !form.expected_arrive_at) {
      return toast.error('Indica la fecha y hora estimada de llegada');
    }
    if (form.kind === 'permanente') {
      if (!form.valid_from || !form.valid_until) return toast.error('La visita permanente siempre requiere vigencia');
      if (form.duration_mode === 'count' && Number(form.max_visits) < 1) {
        return toast.error('Indica la cantidad de visitas');
      }
    }
    setSaving(true);
    try {
      const payload = { ...form };
      if (residentUnitId) payload.unit = residentUnitId;
      const r = await visitasAPI.create(tenantId, payload);
      toast.success(r.data.email_sent
        ? `Autorización ${r.data.folio} enviada a ${form.visitor_email}`
        : `Autorización ${r.data.folio} creada. No se pudo enviar el correo.`);
      onDone();
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo crear la autorización'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Autorizar visita" subtitle="El visitante recibe el QR y las normas por correo" onClose={onClose} icon={<UserCheck size={18} />} wide>
      <div className="visitas-form">
      {!residentUnitId && (
        <div className="field">
          <div className="field-label">Unidad *</div>
          <select className="field-input" value={form.unit} onChange={e => { set('unit', e.target.value); set('host_key', ''); }}>
            <option value="">Selecciona la unidad</option>
            {units.map(u => (
              <option key={u.id} value={u.id}>{u.unit_name}{u.unit_id_code ? ` (${u.unit_id_code})` : ''}</option>
            ))}
          </select>
        </div>
      )}
      <div className="field">
        <div className="field-label">¿A quién visita? *</div>
        <select className="field-input" value={form.host_key} onChange={e => set('host_key', e.target.value)} disabled={!unitId}>
          <option value="">{unitId ? 'Selecciona del registro de la unidad' : 'Primero elige la unidad'}</option>
          {hosts.map(h => (
            <option key={h.key} value={h.key}>{h.name} — {h.kind_label}</option>
          ))}
          <option value="other">Ninguno de la lista — escribir nombre</option>
        </select>
      </div>
      {form.host_key === 'other' && (
        <div className="field">
          <div className="field-label">Nombre completo de quien recibe *</div>
          <input
            className="field-input"
            value={form.host_name}
            onChange={e => set('host_name', e.target.value)}
            placeholder="Integrante de la unidad que no está en el registro"
          />
        </div>
      )}
      <div className="visitas-grid">
        <div className="field">
          <div className="field-label">Nombres *</div>
          <input className="field-input" value={form.visitor_first_name} onChange={e => set('visitor_first_name', e.target.value)} />
        </div>
        <div className="field">
          <div className="field-label">Apellidos *</div>
          <input className="field-input" value={form.visitor_last_name} onChange={e => set('visitor_last_name', e.target.value)} />
        </div>
      </div>
      <div className="visitas-grid">
        <div className="field">
          <div className="field-label">E-mail *</div>
          <input className="field-input" type="email" value={form.visitor_email} onChange={e => set('visitor_email', e.target.value)} />
        </div>
        <div className="field">
          <div className="field-label">Celular</div>
          <input className="field-input" value={form.visitor_phone} onChange={e => set('visitor_phone', e.target.value)} />
        </div>
      </div>

      <div className="field">
        <div className="field-label">Tipo de visita *</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {[
            ['ocasional', 'Ocasional / temporal'],
            ['permanente', 'Permanente / recurrente'],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`btn ${form.kind === key ? 'btn-primary' : 'btn-outline'} btn-sm`}
              onClick={() => set('kind', key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {form.kind === 'ocasional' ? (
        <div className="field">
          <div className="field-label">Fecha y hora de llegada estimada *</div>
          <input
            className="field-input"
            type="datetime-local"
            value={form.expected_arrive_at}
            onChange={e => set('expected_arrive_at', e.target.value)}
          />
          <div style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: 4 }}>
            La vigencia cubre el día de la llegada estimada.
          </div>
        </div>
      ) : (
        <>
          <div className="field">
            <div className="field-label">Modalidad *</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className={`btn ${form.duration_mode === 'count' ? 'btn-primary' : 'btn-outline'} btn-sm`} onClick={() => set('duration_mode', 'count')}>
                Cantidad de visitas
              </button>
              <button type="button" className={`btn ${form.duration_mode === 'indefinido' ? 'btn-primary' : 'btn-outline'} btn-sm`} onClick={() => set('duration_mode', 'indefinido')}>
                Indefinido
              </button>
            </div>
          </div>
          {form.duration_mode === 'count' && (
            <div className="field">
              <div className="field-label">Número de visitas autorizadas *</div>
              <input className="field-input" type="number" min="1" max="999" value={form.max_visits} onChange={e => set('max_visits', e.target.value)} />
            </div>
          )}
          <div className="visitas-grid">
            <div className="field">
              <div className="field-label">Vigencia desde *</div>
              <input className="field-input" type="date" value={form.valid_from} onChange={e => set('valid_from', e.target.value)} />
            </div>
            <div className="field">
              <div className="field-label">Vigencia hasta *</div>
              <input className="field-input" type="date" value={form.valid_until} onChange={e => set('valid_until', e.target.value)} />
            </div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink-400)', lineHeight: 1.45 }}>
            Toda visita recurrente necesita un periodo de vigencia, incluso si es indefinida.
          </div>
        </>
      )}

      <div className="field">
        <div className="field-label">Nota (opcional)</div>
        <textarea className="field-input" rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Parentesco, empresa o motivo de la visita..." />
      </div>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap', paddingTop: 4 }}>
        <button className="btn btn-outline" onClick={onClose} disabled={saving}>Cancelar</button>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? 'Guardando…' : 'Crear y enviar correo'}
        </button>
      </div>
      </div>
    </Modal>
  );
}

function CustomizeModal({ tenantId, onClose, onSaved }) {
  const [rules, setRules] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    visitasAPI.settings(tenantId)
      .then(r => setRules(r.data.notify_rules || ''))
      .catch(() => toast.error('No se pudo cargar la personalización'))
      .finally(() => setLoading(false));
  }, [tenantId]);

  const save = async () => {
    setSaving(true);
    try {
      await visitasAPI.saveSettings(tenantId, { notify_rules: rules });
      toast.success('Normas de visitas actualizadas');
      onSaved();
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo guardar'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Personalizar visitas" subtitle="Estas normas viajan en el correo del visitante" onClose={onClose} icon={<SlidersHorizontal size={18} />} wide>
      {loading ? (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink-400)' }}>Cargando…</div>
      ) : (
        <>
          <div className="field">
            <div className="field-label">Normas y reglamento</div>
            <textarea
              className="field-input"
              rows={10}
              value={rules}
              onChange={e => setRules(e.target.value)}
              placeholder={'Ej.\n• Estacionarse solo en visitas.\n• Registrar ingreso y salida en caseta.\n• Horario de visitas: 8:00 a 22:00.'}
            />
          </div>
          <p style={{ fontSize: 12, color: 'var(--ink-400)', margin: '0 0 8px', lineHeight: 1.45 }}>
            El correo siempre explica que, si no presenta el QR, debe mostrar una identificación a la entrada y a la salida. Cajones y gafetes se configuran en Configuración → Visitas.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <button className="btn btn-outline" onClick={onClose} disabled={saving}>Cerrar</button>
            <button className="btn btn-primary" onClick={save} disabled={saving}>Guardar</button>
          </div>
        </>
      )}
    </Modal>
  );
}

function ScanModal({ tenantId, onClose, onOpenGate, onOpenDetail }) {
  const [qr, setQr] = useState('');
  const [visit, setVisit] = useState(null);
  const [loading, setLoading] = useState(false);
  const lastLookup = useRef('');

  const lookup = async (value) => {
    const code = (value || qr).trim();
    if (!code) return toast.error('Escanea el código QR con la cámara');
    lastLookup.current = code;
    setLoading(true);
    try {
      const r = await visitasAPI.lookup(tenantId, code);
      setVisit(r.data);
      setQr(code);
    } catch (e) {
      toast.error(errMsg(e, QR_MISMATCH_MSG));
      setVisit(null);
      setQr('');
      lastLookup.current = '';
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (/HOMLY-VIS:/i.test(qr) && lastLookup.current !== qr && !loading) {
      lookup(qr);
    }
  }, [qr]);

  return (
    <Modal title="Escanear QR de visita" subtitle="Identifica la autorización para ingreso o salida" onClose={onClose} icon={<ScanLine size={18} />}>
      <p style={{ fontSize: 13, color: 'var(--ink-500)', marginTop: 0 }}>
        Apunta la cámara al QR del correo o de la pantalla del visitante.
      </p>
      <QrCapture value={qr} onChange={setQr} kind="vis" />
      {loading && <div style={{ fontSize: 13, color: 'var(--ink-400)', marginTop: 8 }}>Validando QR…</div>}
      {visit && (
        <div className="card" style={{ padding: 12, marginTop: 12 }}>
          <div style={{ fontFamily: 'monospace', fontWeight: 800, color: 'var(--teal-700)' }}>{visit.folio}</div>
          <div style={{ fontWeight: 700 }}>{visit.visitor_name}</div>
          <div style={{ fontSize: 13 }}>{visit.unit_name}{visit.unit_code ? ` (${visit.unit_code})` : ''}</div>
          <div style={{ marginTop: 6 }}>
            <span className={`badge ${statusBadge(visit.status)}`}>{visit.status_label}</span>
          </div>
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16, flexWrap: 'wrap' }}>
        <button className="btn btn-outline" onClick={onClose}>Cerrar</button>
        {visit && visit.currently_inside && (
          <button className="btn btn-primary" onClick={() => onOpenGate(visit, 'salida', qr)}>
            <LogOut size={14} /> Registrar salida
          </button>
        )}
        {visit && !visit.currently_inside && visit.status === 'vigente' && (
          <button className="btn btn-primary" onClick={() => onOpenGate(visit, 'ingreso', qr)}>
            <LogIn size={14} /> Registrar ingreso
          </button>
        )}
        {visit && visit.status !== 'vigente' && !visit.currently_inside && (
          <button className="btn btn-outline" onClick={() => onOpenDetail(visit)}>Ver ficha</button>
        )}
      </div>
    </Modal>
  );
}

function GateModal({ tenantId, visit, catalog, onClose, onDone }) {
  const gate = visit.gate || (visit.currently_inside ? 'salida' : 'ingreso');
  const verifiedQr = visit.verifiedQr && qrMatchesExpected(visit.verifiedQr, visit.qr_payload, 'vis')
    ? visit.verifiedQr
    : '';
  const [method, setMethod] = useState(verifiedQr ? 'qr' : '');
  const [qr, setQr] = useState(verifiedQr);
  const [photo, setPhoto] = useState(null);
  const [preview, setPreview] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [byVehicle, setByVehicle] = useState(false);
  const [plate, setPlate] = useState('');
  const [vehiclePhoto, setVehiclePhoto] = useState(null);
  const [vehiclePreview, setVehiclePreview] = useState('');
  const [parkingId, setParkingId] = useState('');
  const [parkingCustom, setParkingCustom] = useState('');
  const [badgeId, setBadgeId] = useState('');
  const [badgeCustom, setBadgeCustom] = useState('');
  const [contacts, setContacts] = useState(visit.contacts || []);
  const [selectedContacts, setSelectedContacts] = useState(
    () => new Set((visit.contacts || []).filter(c => c.has_email).map(c => c.key))
  );
  const [contactsLoading, setContactsLoading] = useState(!visit.contacts);

  useEffect(() => {
    if (visit.contacts) return undefined;
    setContactsLoading(true);
    visitasAPI.unitContacts(tenantId, visit.unit)
      .then(r => {
        const list = r.data.contacts || [];
        setContacts(list);
        setSelectedContacts(new Set(list.filter(c => c.has_email).map(c => c.key)));
      })
      .catch(() => toast.error('No se pudieron cargar los contactos de la unidad'))
      .finally(() => setContactsLoading(false));
  }, [tenantId, visit]);

  const toggleContact = (key) => {
    setSelectedContacts(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const useParking = !!catalog?.use_parking;
  const useBadges = !!catalog?.use_badges;
  const spots = (catalog?.parking_spots || []).filter(s => s.is_active);
  const badges = (catalog?.badges || []).filter(b => b.is_active);

  const onPhoto = async (file) => {
    const compressed = await compressImage(file);
    setPhoto(compressed);
    setPreview(URL.createObjectURL(compressed));
  };
  const onVehiclePhoto = async (file) => {
    const compressed = await compressImage(file);
    setVehiclePhoto(compressed);
    setVehiclePreview(URL.createObjectURL(compressed));
  };

  const save = async () => {
    if (!method) return toast.error('Elige QR o identificación');
    if (method === 'qr' && !qr.trim()) return toast.error('Escanea el código QR con la cámara');
    if (method === 'qr' && !qrMatchesExpected(qr, visit.qr_payload, 'vis')) {
      return toast.error(QR_MISMATCH_MSG);
    }
    if (method === 'identificacion' && !photo) return toast.error('Toma la foto de evidencia de la identificación');
    if (gate === 'ingreso' && byVehicle) {
      if (!plate.trim()) return toast.error('Escribe la placa del vehículo');
      if (!vehiclePhoto) return toast.error('Toma la foto del vehículo');
      if (useParking && !parkingId && !parkingCustom.trim()) return toast.error('Selecciona o escribe el cajón de visitas');
    }
    if (gate === 'ingreso' && useBadges && !badgeId && !badgeCustom.trim()) {
      return toast.error('Selecciona o escribe el gafete asignado');
    }
    const recipients = contacts.filter(c => selectedContacts.has(c.key) && c.email);
    if (contacts.some(c => c.has_email) && !recipients.length) {
      return toast.error('Selecciona al menos un contacto con correo para avisar a la unidad');
    }
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('method', method);
      if (notes.trim()) fd.append('notes', notes.trim());
      if (method === 'qr') fd.append('qr', qr.trim());
      if (photo) fd.append('photo', photo);
      if (gate === 'ingreso') {
        fd.append('arrived_by_vehicle', byVehicle ? 'true' : 'false');
        if (byVehicle) {
          fd.append('vehicle_plate', plate.trim().toUpperCase());
          if (vehiclePhoto) fd.append('vehicle_photo', vehiclePhoto);
          if (parkingId) fd.append('parking_spot', parkingId);
          if (parkingCustom.trim()) fd.append('parking_label', parkingCustom.trim());
        }
        if (useBadges) {
          if (badgeId) fd.append('badge', badgeId);
          if (badgeCustom.trim()) fd.append('badge_label', badgeCustom.trim());
        }
      }
      if (recipients.length) {
        fd.append('recipients', JSON.stringify(recipients.map(c => ({
          name: c.name, email: c.email, user_id: c.user_id,
        }))));
      }
      const r = gate === 'salida'
        ? await visitasAPI.checkout(tenantId, visit.id, fd)
        : await visitasAPI.checkin(tenantId, visit.id, fd);
      const sent = r.data?.notify?.sent?.length || 0;
      toast.success(
        gate === 'salida'
          ? (sent ? `Salida registrada · aviso enviado a ${sent}` : 'Salida registrada')
          : (sent ? `Ingreso registrado · aviso enviado a ${sent}` : 'Ingreso registrado')
      );
      onDone();
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo registrar el movimiento'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={gate === 'salida' ? `Salida — ${visit.folio}` : `Ingreso — ${visit.folio}`}
      subtitle={`${visit.visitor_name} · visita a ${visit.host_name || visit.unit_name}${visit.unit_code ? ` (${visit.unit_code})` : ''}`}
      onClose={onClose}
      icon={gate === 'salida' ? <LogOut size={18} /> : <LogIn size={18} />}
      wide
    >
      <div className="visitas-form">
      <p style={{ fontSize: 13, color: 'var(--ink-500)', margin: 0, lineHeight: 1.5 }}>
        Confirma con el QR de la autorización. Si no lo presenta, verifica que la identificación coincida con el nombre registrado y toma una foto de evidencia. No se resguarda la identificación.
      </p>
      <div className="field">
        <div className="field-label">Método *</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" className={`btn ${method === 'qr' ? 'btn-primary' : 'btn-outline'} btn-sm`} onClick={() => setMethod('qr')}>
            <QrCode size={13} /> Código QR
          </button>
          <button type="button" className={`btn ${method === 'identificacion' ? 'btn-primary' : 'btn-outline'} btn-sm`} onClick={() => setMethod('identificacion')}>
            <Contact size={13} /> Identificación
          </button>
        </div>
      </div>
      {method === 'qr' && (
        <div className="field">
          <div className="field-label">Código QR *</div>
          <QrCapture value={qr} onChange={setQr} kind="vis" expectedPayload={visit.qr_payload} />
        </div>
      )}
      {method === 'identificacion' && (
        <div className="field">
          <div className="field-label">Foto de evidencia *</div>
          <p style={{ fontSize: 12, color: 'var(--ink-400)', margin: '0 0 8px', lineHeight: 1.45 }}>
            Confirma que el nombre de la identificación es <strong>{visit.visitor_name}</strong>. Solo se guarda la foto, no el documento.
          </p>
          <PhotoCapture preview={preview} onFile={onPhoto} />
        </div>
      )}
      {gate === 'ingreso' && (
        <>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13, lineHeight: 1.45 }}>
            <input type="checkbox" checked={byVehicle} onChange={e => setByVehicle(e.target.checked)} style={{ marginTop: 2 }} />
            <span>La visita ingresa en vehículo</span>
          </label>
          {byVehicle && (
            <div className="card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="field">
                <div className="field-label">Placa *</div>
                <input className="field-input" value={plate} onChange={e => setPlate(e.target.value.toUpperCase())} placeholder="ABC-123" />
              </div>
              <div className="field">
                <div className="field-label">Foto del vehículo *</div>
                <PhotoCapture preview={vehiclePreview} onFile={onVehiclePhoto} />
              </div>
              {useParking && (
                <>
                  <div className="field">
                    <div className="field-label">Cajón de visitas</div>
                    <select className="field-input" value={parkingId} onChange={e => setParkingId(e.target.value)}>
                      <option value="">Seleccionar cajón o escribir abajo</option>
                      {spots.map(s => (
                        <option key={s.id} value={s.id}>{s.label}{s.occupied ? ' · ocupado' : ''}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <div className="field-label">O escribir el cajón</div>
                    <input className="field-input" value={parkingCustom} onChange={e => setParkingCustom(e.target.value)} placeholder="Si no está en la lista" />
                  </div>
                </>
              )}
            </div>
          )}
          {useBadges && (
            <div className="card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="field">
                <div className="field-label">Gafete de visitas *</div>
                <select className="field-input" value={badgeId} onChange={e => setBadgeId(e.target.value)}>
                  <option value="">Seleccionar gafete o escribir abajo</option>
                  {badges.map(b => (
                    <option key={b.id} value={b.id}>{b.label}{b.occupied ? ' · en uso' : ''}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <div className="field-label">O escribir el gafete</div>
                <input className="field-input" value={badgeCustom} onChange={e => setBadgeCustom(e.target.value)} placeholder="Número o color del gafete entregado" />
              </div>
            </div>
          )}
        </>
      )}
      <div className="field">
        <div className="field-label">Avisar a la unidad *</div>
        <p style={{ fontSize: 12, color: 'var(--ink-400)', margin: '0 0 8px', lineHeight: 1.45 }}>
          Elige a quién se envía el correo con los detalles de {gate === 'salida' ? 'la salida' : 'el ingreso'}.
        </p>
        {contactsLoading ? (
          <div style={{ padding: 16, textAlign: 'center', color: 'var(--ink-400)' }}>Cargando contactos...</div>
        ) : contacts.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--ink-400)', lineHeight: 1.45 }}>
            Esta unidad no tiene contactos registrados. El movimiento se guarda sin correo.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 220, overflowY: 'auto' }}>
            {contacts.map(c => (
              <label key={c.key} className="card" style={{ padding: 12, display: 'flex', gap: 12, alignItems: 'flex-start', margin: 0, opacity: c.has_email ? 1 : 0.55 }}>
                <input
                  type="checkbox"
                  checked={selectedContacts.has(c.key)}
                  disabled={!c.has_email}
                  onChange={() => toggleContact(c.key)}
                  style={{ marginTop: 3 }}
                />
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, lineHeight: 1.35 }}>{c.name || 'Sin nombre'}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 4, lineHeight: 1.4 }}>
                    {c.kind_label}{c.email ? ` · ${c.email}` : ' · sin correo'}
                  </div>
                </div>
              </label>
            ))}
          </div>
        )}
      </div>
      <div className="field">
        <div className="field-label">Nota (opcional)</div>
        <textarea className="field-input" rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Observación de caseta..." />
      </div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap', paddingTop: 4 }}>
        <button className="btn btn-outline" onClick={onClose} disabled={saving}>Cancelar</button>
        <button className="btn btn-primary" onClick={save} disabled={saving || contactsLoading || !method || (method === 'qr' && !qr)}>
          {saving ? 'Guardando…' : gate === 'salida' ? 'Confirmar salida' : 'Confirmar ingreso'}
        </button>
      </div>
      </div>
    </Modal>
  );
}

function CancelModal({ tenantId, visit, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      await visitasAPI.cancel(tenantId, visit.id, { reason: reason.trim() });
      toast.success(`Autorización ${visit.folio} cancelada`);
      onDone();
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo cancelar'));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal title={`Cancelar — ${visit.folio}`} subtitle={visit.visitor_name} onClose={onClose} icon={<Ban size={18} />}>
      <p style={{ fontSize: 13, color: 'var(--ink-500)', marginTop: 0 }}>
        El visitante ya no podrá ingresar con este folio. Si está dentro del condominio, registra primero la salida.
      </p>
      <div className="field">
        <div className="field-label">Motivo (opcional)</div>
        <textarea className="field-input" rows={3} value={reason} onChange={e => setReason(e.target.value)} />
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="btn btn-outline" onClick={onClose} disabled={saving}>Volver</button>
        <button className="btn btn-danger" onClick={save} disabled={saving}>Cancelar autorización</button>
      </div>
    </Modal>
  );
}

function DetailDrawer({ visit, canCreate, canGate, onClose, onGate, onCancel, onResent }) {
  const { tenantId } = useAuth();
  const [sending, setSending] = useState(false);
  const resend = async () => {
    setSending(true);
    try {
      const r = await visitasAPI.resend(tenantId, visit.id);
      toast.success(r.data.email_sent ? 'Correo reenviado al visitante' : 'No se pudo enviar el correo');
      onResent();
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo reenviar'));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex justify-end" onClick={onClose}>
      <div className="bg-white h-full w-full max-w-lg overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()} style={{ padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <div style={{ fontFamily: 'monospace', fontWeight: 800, color: 'var(--teal-700)', fontSize: 20 }}>{visit.folio}</div>
            <div style={{ fontWeight: 800, fontSize: 16 }}>{visit.visitor_name}</div>
            <div style={{ fontWeight: 700 }}>{visit.unit_name}{visit.unit_code ? <span style={{ fontWeight: 500, color: 'var(--ink-400)', marginLeft: 6 }}>({visit.unit_code})</span> : null}</div>
            <span className={`badge ${statusBadge(visit.status)}`} style={{ marginTop: 6 }}>{visit.status_label}</span>
          </div>
          <button className="btn-icon" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="card" style={{ padding: 16, marginTop: 18 }}>
          <Row label="Visita a" value={visit.host_label || visit.host_name || '—'} />
          <Row label="Tipo" value={`${visit.kind_label} · ${visit.duration_label}`} />
          <Row label="Vigencia" value={`${fmtDay(visit.valid_from)} — ${fmtDay(visit.valid_until)}`} />
          {visit.expected_arrive_at && <Row label="Llegada estimada" value={fmtDate(visit.expected_arrive_at)} />}
          <Row label="Correo" value={visit.visitor_email} />
          <Row label="Celular" value={visit.visitor_phone || '—'} />
          <Row label="Visitas usadas" value={visit.max_visits != null ? `${visit.visits_used} / ${visit.max_visits}` : String(visit.visits_used ?? 0)} />
          <Row label="Autorizó" value={visit.created_by_name} />
          {visit.arrived_by_vehicle && <Row label="Placa" value={visit.vehicle_plate || '—'} />}
          {visit.parking_label && <Row label="Cajón" value={visit.parking_label} />}
          {visit.badge_label && <Row label="Gafete" value={visit.badge_label} />}
        </div>
        {visit.vehicle_photo_url && (
          <div className="card" style={{ padding: 16, marginTop: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--ink-400)', marginBottom: 8 }}>Vehículo</div>
            <ProtectedImage
              src={visit.vehicle_photo_url}
              alt="Vehículo"
              style={{ width: '100%', borderRadius: 10, border: '1px solid var(--sand-200)' }}
              fallback={null}
            />
          </div>
        )}

        {visit.qr_data_url && (
          <div className="card" style={{ padding: 16, marginTop: 12, textAlign: 'center' }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--ink-400)' }}>Código QR</div>
            <img src={visit.qr_data_url} alt="QR de visita" width={180} height={180} style={{ margin: '10px auto', display: 'block' }} />
            <div style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--teal-700)' }}>{visit.qr_payload}</div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 18 }}>
          {canGate && visit.currently_inside && (
            <button className="btn btn-primary" onClick={() => onGate('salida')}><LogOut size={14} /> Registrar salida</button>
          )}
          {canGate && !visit.currently_inside && visit.status === 'vigente' && (
            <button className="btn btn-primary" onClick={() => onGate('ingreso')}><LogIn size={14} /> Registrar ingreso</button>
          )}
          {canCreate && visit.status === 'vigente' && (
            <button className="btn btn-outline" onClick={resend} disabled={sending}><Mail size={14} /> Reenviar correo</button>
          )}
          {canCreate && visit.status !== 'cancelada' && !visit.currently_inside && (
            <button className="btn btn-outline" onClick={onCancel}><Ban size={14} /> Cancelar</button>
          )}
        </div>

        <h4 style={{ margin: '24px 0 10px' }}>Bitácora</h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {(visit.events || []).map(ev => {
            const meta = EVENT_META[ev.event_type] || EVENT_META.creado;
            return (
              <div key={ev.id} className="card" style={{ padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: meta.color }}>{meta.icon} {meta.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>{fmtDate(ev.created_at)}</div>
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink-500)', marginTop: 4 }}>
                  {ev.actor_name}{ev.method_label ? ` · ${ev.method_label}` : ''}
                </div>
                {ev.notes && <div style={{ fontSize: 13, marginTop: 8, lineHeight: 1.45 }}>{ev.notes}</div>}
                {(ev.extra?.host_name || ev.extra?.parking_label || ev.extra?.badge_label || ev.extra?.vehicle_plate) && (
                  <div style={{ fontSize: 12, color: 'var(--ink-500)', marginTop: 8, lineHeight: 1.5 }}>
                    {ev.extra.host_name && <div>Visita a {ev.extra.host_name}{ev.extra.host_kind_label ? ` · ${ev.extra.host_kind_label}` : ''}</div>}
                    {ev.extra.vehicle_plate && <div>Placa {ev.extra.vehicle_plate}</div>}
                    {ev.extra.parking_label && <div>Cajón {ev.extra.parking_label}</div>}
                    {ev.extra.badge_label && <div>Gafete {ev.extra.badge_label}</div>}
                  </div>
                )}
                {Array.isArray(ev.extra?.notify?.sent) && ev.extra.notify.sent.length > 0 && (
                  <div style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: 8, lineHeight: 1.45 }}>
                    Aviso enviado a: {ev.extra.notify.sent.map(s => s.email || s.name).join(', ')}
                  </div>
                )}
                {ev.evidence_photo_url && (
                  <ProtectedImage
                    src={ev.evidence_photo_url}
                    alt="Evidencia"
                    style={{ width: '100%', marginTop: 10, borderRadius: 10, border: '1px solid var(--sand-200)' }}
                    fallback={null}
                  />
                )}
                {ev.vehicle_photo_url && (
                  <ProtectedImage
                    src={ev.vehicle_photo_url}
                    alt="Vehículo"
                    style={{ width: '100%', marginTop: 10, borderRadius: 10, border: '1px solid var(--sand-200)' }}
                    fallback={null}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '6px 0', borderBottom: '1px solid var(--sand-100)', fontSize: 13 }}>
      <span style={{ color: 'var(--ink-400)' }}>{label}</span>
      <span style={{ fontWeight: 600, textAlign: 'right' }}>{value}</span>
    </div>
  );
}

function PhotoCapture({ preview, onFile }) {
  const inputRef = useRef(null);
  return (
    <div>
      {preview && (
        <img src={preview} alt="Evidencia" style={{ width: '100%', maxHeight: 220, objectFit: 'cover', borderRadius: 12, marginBottom: 8 }} />
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => inputRef.current?.click()}>
          <Camera size={13} /> {preview ? 'Cambiar foto' : 'Tomar o adjuntar foto'}
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={e => e.target.files?.[0] && onFile(e.target.files[0])}
      />
    </div>
  );
}

function Modal({ title, subtitle, icon, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-3 sm:p-5" onClick={onClose}>
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-h-[92vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
        style={{ padding: '24px 22px 22px', maxWidth: wide ? 680 : 520, margin: '0 auto' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 12, minWidth: 0 }}>
            <div style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 10, background: 'var(--teal-50)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--teal-700)' }}>
              {icon}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 800, lineHeight: 1.3 }}>{title}</div>
              {subtitle && <div style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: 4, lineHeight: 1.4 }}>{subtitle}</div>}
            </div>
          </div>
          <button className="btn-icon" onClick={onClose} style={{ flexShrink: 0 }}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
