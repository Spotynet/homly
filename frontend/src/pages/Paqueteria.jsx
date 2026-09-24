import React, { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Package, Plus, Search, X, Camera, Mail, PenLine, Settings, Loader2, Image as ImageIcon, Trash2,
  QrCode, ScanLine, Clock, SlidersHorizontal,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { paqueteriaAPI } from '../api/client';
import { useUnits } from '../hooks/useUnits';
import ProtectedImage from '../components/ProtectedImage';
import SignaturePad from '../components/SignaturePad';

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

function errMsg(e, fallback) {
  return e?.response?.data?.detail
    || e?.response?.data?.unit?.[0]
    || e?.response?.data?.photo?.[0]
    || e?.response?.data?.signature?.[0]
    || e?.response?.data?.recipients?.[0]
    || e?.response?.data?.comment?.[0]
    || e?.response?.data?.qr?.[0]
    || e?.response?.data?.method?.[0]
    || fallback;
}

const EVENT_META = {
  recibido:   { icon: '📦', label: 'Recepción en vigilancia', color: 'var(--teal-700)' },
  notificado: { icon: '✉️', label: 'Notificación enviada',    color: 'var(--blue-600)' },
  entregado:    { icon: '✍️', label: 'Entrega al destinatario', color: 'var(--teal-600)' },
  recordatorio: { icon: '⏰', label: 'Recordatorio automático', color: 'var(--amber-700)' },
  nota:         { icon: '📝', label: 'Nota',                    color: 'var(--ink-500)' },
};

export default function Paqueteria() {
  const { tenantId } = useAuth();
  const { data: units = [] } = useUnits(tenantId);
  const [ctx, setCtx] = useState(null);
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState(null);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [notifyPkg, setNotifyPkg] = useState(null);
  const [deliverPkg, setDeliverPkg] = useState(null);
  const [deletePkg, setDeletePkg] = useState(null);

  const canWrite = !!ctx?.can_write;
  const canDelete = !!ctx?.can_delete;
  const canEditSettings = !!ctx?.can_edit_settings;

  const loadCtx = () => {
    if (!tenantId) return;
    paqueteriaAPI.context(tenantId).then(r => setCtx(r.data)).catch(() => {});
  };

  const loadList = () => {
    if (!tenantId) return;
    setLoading(true);
    const params = { page_size: 200 };
    if (status) params.status = status;
    if (search.trim()) params.search = search.trim();
    paqueteriaAPI.list(tenantId, params)
      .then(r => {
        const raw = r.data;
        setList(Array.isArray(raw) ? raw : (raw?.results || []));
      })
      .catch(() => toast.error('No se pudo cargar la bitácora'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadCtx(); }, [tenantId]);
  useEffect(() => { loadList(); }, [tenantId, status]);

  const openDetail = async (id) => {
    try {
      const r = await paqueteriaAPI.get(tenantId, id);
      setDetail(r.data);
    } catch {
      toast.error('No se pudo abrir el paquete');
    }
  };

  const pending = ctx?.counts?.recibido ?? list.filter(p => p.status === 'recibido').length;
  const delivered = ctx?.counts?.entregado ?? list.filter(p => p.status === 'entregado').length;

  return (
    <div className="content-fade">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22 }}>Paquetería / Mensajería</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--ink-400)', fontSize: 13 }}>
            Recepción en vigilancia, aviso a la unidad y entrega con QR o firma.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {canEditSettings && (
            <button className="btn btn-outline" onClick={() => setCustomizeOpen(true)}>
              <SlidersHorizontal size={14} /> Personalizar
            </button>
          )}
          {canWrite && (
            <button className="btn btn-outline" onClick={() => setScanOpen(true)}>
              <ScanLine size={15} /> Escanear QR
            </button>
          )}
          {canWrite && (
            <button className="btn btn-primary" onClick={() => setReceiveOpen(true)}>
              <Plus size={15} /> Recibir paquete
            </button>
          )}
        </div>
      </div>

      <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, marginBottom: 16 }}>
            {[
              { label: 'En vigilancia', value: pending, color: 'var(--amber-600)' },
              { label: 'Entregados', value: delivered, color: 'var(--teal-700)' },
              { label: 'Total', value: ctx?.counts?.total ?? list.length, color: 'var(--ink-700)' },
            ].map(card => (
              <div key={card.label} className="card" style={{ padding: 14 }}>
                <div style={{ fontSize: 11, color: 'var(--ink-400)', fontWeight: 700, textTransform: 'uppercase' }}>{card.label}</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: card.color, lineHeight: 1.1 }}>{card.value}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            <div style={{ position: 'relative', flex: '1 1 220px', maxWidth: 360 }}>
              <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-400)' }} />
              <input
                className="field-input"
                style={{ paddingLeft: 36 }}
                placeholder="Buscar folio, unidad o nota..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && loadList()}
              />
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {[['','Todos'], ['recibido','En vigilancia'], ['entregado','Entregados']].map(([key, label]) => (
                <button
                  key={key || 'all'}
                  className={`btn ${status === key ? 'btn-primary' : 'btn-outline'} btn-sm`}
                  onClick={() => setStatus(key)}
                >
                  {label}
                </button>
              ))}
            </div>
            <button className="btn btn-outline btn-sm" onClick={loadList}>Buscar</button>
          </div>

          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {loading ? (
              <div style={{ padding: 32, textAlign: 'center', color: 'var(--ink-400)' }}>
                <Loader2 size={22} className="animate-spin" style={{ marginRight: 8 }} /> Cargando bitácora...
              </div>
            ) : list.length === 0 ? (
              <div style={{ padding: 36, textAlign: 'center', color: 'var(--ink-400)' }}>
                <Package size={36} style={{ opacity: 0.3, marginBottom: 8 }} />
                <div style={{ fontWeight: 700, color: 'var(--ink-600)' }}>Sin paquetes</div>
                <div style={{ fontSize: 13 }}>Registra la primera recepción desde vigilancia.</div>
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Folio</th>
                      <th>Unidad</th>
                      <th>Estado</th>
                      <th>Recepción</th>
                      <th>Entrega</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map(pkg => (
                      <tr key={pkg.id} style={{ cursor: 'pointer' }} onClick={() => openDetail(pkg.id)}>
                        <td style={{ fontFamily: 'monospace', fontWeight: 800, color: 'var(--teal-700)' }}>{pkg.folio}</td>
                        <td>
                          <div style={{ fontWeight: 700 }}>{pkg.unit_code}</div>
                          <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>{pkg.unit_name}</div>
                        </td>
                        <td>
                          <span className={`badge ${pkg.status === 'entregado' ? 'badge-teal' : 'badge-amber'}`}>
                            {pkg.status_label}
                          </span>
                        </td>
                        <td style={{ fontSize: 12 }}>
                          <div>{fmtDate(pkg.received_at)}</div>
                          <div style={{ color: 'var(--ink-400)' }}>{pkg.received_by_name}</div>
                        </td>
                        <td style={{ fontSize: 12 }}>
                          {pkg.delivered_at ? (
                            <>
                              <div>{fmtDate(pkg.delivered_at)}</div>
                              <div style={{ color: 'var(--ink-400)' }}>{pkg.delivered_by_name}</div>
                            </>
                          ) : '—'}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
                            {canWrite && pkg.status === 'recibido' && (
                              <>
                                <button className="btn btn-outline btn-sm" onClick={() => setNotifyPkg(pkg)}><Mail size={13} /> Avisar</button>
                                <button className="btn btn-primary btn-sm" onClick={() => setDeliverPkg(pkg)}><PenLine size={13} /> Entregar</button>
                              </>
                            )}
                            <button className="btn btn-outline btn-sm" onClick={() => openDetail(pkg.id)}>Ver</button>
                            {canDelete && (
                              <button className="btn btn-danger btn-sm" onClick={() => setDeletePkg(pkg)}><Trash2 size={13} /> Eliminar</button>
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
        </>

      {customizeOpen && (
        <CustomizeModal
          tenantId={tenantId}
          initialRules={ctx?.notify_rules || ''}
          initialReminders={ctx?.reminders}
          onClose={() => setCustomizeOpen(false)}
          onSaved={(data) => setCtx(c => ({
            ...c,
            notify_rules: data.notify_rules ?? c?.notify_rules,
            reminders: data.reminders || c?.reminders,
          }))}
        />
      )}

      {scanOpen && (
        <ScanDeliverModal
          tenantId={tenantId}
          onClose={() => setScanOpen(false)}
          onDelivered={() => {
            setScanOpen(false);
            loadList();
            loadCtx();
          }}
        />
      )}

      {receiveOpen && (
        <ReceiveModal
          tenantId={tenantId}
          units={units}
          onClose={() => setReceiveOpen(false)}
          onCreated={(pkg) => {
            setReceiveOpen(false);
            loadList();
            loadCtx();
            setNotifyPkg(pkg);
          }}
        />
      )}

      {notifyPkg && (
        <NotifyModal
          tenantId={tenantId}
          pkg={notifyPkg}
          onClose={() => setNotifyPkg(null)}
          onDone={() => {
            setNotifyPkg(null);
            loadList();
            if (detail?.id === notifyPkg.id) openDetail(notifyPkg.id);
          }}
        />
      )}

      {deliverPkg && (
        <DeliverModal
          tenantId={tenantId}
          pkg={deliverPkg}
          onClose={() => setDeliverPkg(null)}
          onDone={() => {
            setDeliverPkg(null);
            loadList();
            loadCtx();
            if (detail?.id === deliverPkg.id) openDetail(deliverPkg.id);
          }}
        />
      )}

      {deletePkg && (
        <DeleteModal
          tenantId={tenantId}
          pkg={deletePkg}
          onClose={() => setDeletePkg(null)}
          onDone={() => {
            if (detail?.id === deletePkg.id) setDetail(null);
            setDeletePkg(null);
            loadList();
            loadCtx();
          }}
        />
      )}

      {detail && (
        <DetailDrawer
          pkg={detail}
          canWrite={canWrite}
          canDelete={canDelete}
          onClose={() => setDetail(null)}
          onNotify={() => setNotifyPkg(detail)}
          onDeliver={() => setDeliverPkg(detail)}
          onDelete={() => setDeletePkg(detail)}
        />
      )}
    </div>
  );
}

function hoursLabel(n) {
  const v = Number(n);
  if (!v) return 'no se repite';
  if (v === 1) return '1 hora';
  if (v % 24 === 0) {
    const d = v / 24;
    return d === 1 ? '1 día' : `${d} días`;
  }
  return `${v} horas`;
}

function CustomizeModal({ tenantId, initialRules, initialReminders, onClose, onSaved }) {
  const rem = initialReminders || {};
  const [tab, setTab] = useState('reglamento');
  const [rules, setRules] = useState(initialRules || '');
  const [enabled, setEnabled] = useState(!!rem.enabled);
  const [afterHours, setAfterHours] = useState(String(rem.after_hours || 24));
  const [repeatHours, setRepeatHours] = useState(String(rem.repeat_hours ?? 24));
  const [maxCount, setMaxCount] = useState(String(rem.max_count || 3));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const r = await paqueteriaAPI.saveSettings(tenantId, {
        notify_rules: rules,
        reminders: {
          enabled,
          after_hours: Number(afterHours) || 24,
          repeat_hours: Number(repeatHours) || 0,
          max_count: Number(maxCount) || 3,
        },
      });
      onSaved(r.data);
      toast.success('Personalización guardada');
      onClose();
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo guardar'));
    } finally {
      setSaving(false);
    }
  };

  const preview = enabled
    ? `Si un paquete sigue en vigilancia, el primer aviso sale a las ${hoursLabel(afterHours)} y ${Number(repeatHours) ? `se repite cada ${hoursLabel(repeatHours)}` : 'no se vuelve a enviar'} (máximo ${maxCount}).`
    : 'Los recordatorios automáticos están desactivados. Solo se envía el aviso cuando vigilancia elige los contactos.';

  return (
    <Modal
      title="Personalizar paquetería"
      subtitle="Reglamento del correo y recordatorios de entrega"
      onClose={onClose}
      icon={<SlidersHorizontal size={18} />}
      wide
    >
      <div style={{
        display: 'flex', gap: 6, padding: 4, background: 'var(--sand-100)',
        borderRadius: 12, marginBottom: 18,
      }}>
        {[
          { key: 'reglamento', icon: <Settings size={14} />, label: 'Reglamento' },
          { key: 'recordatorios', icon: <Clock size={14} />, label: 'Recordatorios' },
        ].map(item => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              border: 'none', borderRadius: 10, padding: '10px 12px', cursor: 'pointer',
              fontWeight: 700, fontSize: 13,
              background: tab === item.key ? '#fff' : 'transparent',
              color: tab === item.key ? 'var(--teal-700)' : 'var(--ink-500)',
              boxShadow: tab === item.key ? '0 1px 4px rgba(26,22,18,0.08)' : 'none',
            }}
          >
            {item.icon} {item.label}
          </button>
        ))}
      </div>

      {tab === 'reglamento' ? (
        <div>
          <p style={{ color: 'var(--ink-500)', fontSize: 13, marginTop: 0, lineHeight: 1.5 }}>
            Este texto se incluye en el correo de aviso y en los recordatorios, junto con el QR y la foto de evidencia.
          </p>
          <textarea
            className="field-input"
            rows={8}
            value={rules}
            onChange={e => setRules(e.target.value)}
            placeholder="Ej. El paquete se entrega en caseta presentando identificación o el código QR del correo. El condominio no se hace responsable por paquetes no reclamados después de 5 días hábiles."
          />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <label className="card" style={{ padding: 14, display: 'flex', gap: 12, alignItems: 'center', cursor: 'pointer' }}>
            <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
            <div>
              <div style={{ fontWeight: 800, fontSize: 14 }}>Recordatorios automáticos</div>
              <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>Avisar de nuevo si el paquete sigue en caseta</div>
            </div>
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, opacity: enabled ? 1 : 0.45, pointerEvents: enabled ? 'auto' : 'none' }}>
            <div className="field" style={{ margin: 0 }}>
              <div className="field-label">Primer aviso</div>
              <select className="field-input" value={afterHours} onChange={e => setAfterHours(e.target.value)}>
                {[6, 12, 24, 48, 72, 120, 168].map(h => (
                  <option key={h} value={h}>A las {hoursLabel(h)}</option>
                ))}
              </select>
            </div>
            <div className="field" style={{ margin: 0 }}>
              <div className="field-label">Repetir</div>
              <select className="field-input" value={repeatHours} onChange={e => setRepeatHours(e.target.value)}>
                <option value="0">No repetir</option>
                {[6, 12, 24, 48, 72].map(h => (
                  <option key={h} value={h}>Cada {hoursLabel(h)}</option>
                ))}
              </select>
            </div>
            <div className="field" style={{ margin: 0, gridColumn: '1 / -1' }}>
              <div className="field-label">Máximo de recordatorios</div>
              <select className="field-input" value={maxCount} onChange={e => setMaxCount(e.target.value)}>
                {[1, 2, 3, 4, 5, 8, 10].map(n => (
                  <option key={n} value={n}>{n} {n === 1 ? 'aviso' : 'avisos'}</option>
                ))}
              </select>
            </div>
          </div>
          <div style={{
            padding: '12px 14px', borderRadius: 12, background: 'var(--teal-50)',
            color: 'var(--teal-800)', fontSize: 13, lineHeight: 1.5,
          }}>
            {preview}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
        <button className="btn btn-outline" onClick={onClose} disabled={saving}>Cancelar</button>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </div>
    </Modal>
  );
}

function ReceiveModal({ tenantId, units, onClose, onCreated }) {
  const [unitId, setUnitId] = useState('');
  const [unitQuery, setUnitQuery] = useState('');
  const [notes, setNotes] = useState('');
  const [photo, setPhoto] = useState(null);
  const [preview, setPreview] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);

  const filteredUnits = useMemo(() => {
    const q = unitQuery.trim().toLowerCase();
    const active = (units || []).filter(u => u.is_active !== false);
    if (!q) return active;
    return active.filter(u =>
      `${u.unit_id_code} ${u.unit_name} ${u.owner_first_name} ${u.owner_last_name}`.toLowerCase().includes(q)
    );
  }, [units, unitQuery]);

  const pickPhoto = async (file) => {
    if (!file) return;
    const compressed = await compressImage(file);
    setPhoto(compressed);
    setPreview(URL.createObjectURL(compressed));
  };

  const save = async () => {
    if (!unitId) return toast.error('Selecciona la casa o unidad');
    if (!photo) return toast.error('Toma o adjunta la foto de recepción');
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('unit', unitId);
      if (notes.trim()) fd.append('notes', notes.trim());
      fd.append('photo', photo);
      const r = await paqueteriaAPI.create(tenantId, fd);
      toast.success(`Paquete ${r.data.folio} registrado`);
      onCreated(r.data);
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo registrar el paquete'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Recibir paquete" subtitle="Captura sencilla para vigilancia" onClose={onClose} icon={<Package size={18} />}>
      <div className="field">
        <div className="field-label">Casa / unidad *</div>
        <input
          className="field-input"
          placeholder="Buscar por código, nombre o propietario..."
          value={unitQuery}
          onChange={e => { setUnitQuery(e.target.value); setUnitId(''); }}
        />
        <div style={{ maxHeight: 180, overflowY: 'auto', marginTop: 8, border: '1px solid var(--sand-200)', borderRadius: 10 }}>
          {filteredUnits.slice(0, 40).map(u => (
            <button
              key={u.id}
              type="button"
              onClick={() => { setUnitId(u.id); setUnitQuery(`${u.unit_id_code} — ${u.unit_name}`); }}
              style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px',
                background: unitId === u.id ? 'var(--teal-50)' : 'transparent',
                border: 'none', borderBottom: '1px solid var(--sand-100)', cursor: 'pointer',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 13 }}>{u.unit_id_code} · {u.unit_name}</div>
              <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>{u.owner_first_name} {u.owner_last_name}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <div className="field-label">Foto de evidencia *</div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={e => pickPhoto(e.target.files?.[0])}
        />
        {preview ? (
          <div>
            <img src={preview} alt="Evidencia" style={{ width: '100%', maxHeight: 220, objectFit: 'cover', borderRadius: 12 }} />
            <button type="button" className="btn btn-outline btn-sm" style={{ marginTop: 8 }} onClick={() => inputRef.current?.click()}>
              Cambiar foto
            </button>
          </div>
        ) : (
          <button type="button" className="btn btn-outline" style={{ width: '100%', justifyContent: 'center' }} onClick={() => inputRef.current?.click()}>
            <Camera size={16} /> Tomar o adjuntar foto
          </button>
        )}
      </div>

      <div className="field">
        <div className="field-label">Notas (opcional)</div>
        <textarea className="field-input" rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Empresa, número de guía u observación..." />
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="btn btn-outline" onClick={onClose} disabled={saving}>Cancelar</button>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar recepción'}
        </button>
      </div>
    </Modal>
  );
}

function NotifyModal({ tenantId, pkg, onClose, onDone }) {
  const [contacts, setContacts] = useState(pkg.contacts || []);
  const [selected, setSelected] = useState(() => new Set((pkg.contacts || []).filter(c => c.has_email).map(c => c.key)));
  const [loading, setLoading] = useState(!pkg.contacts);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (pkg.contacts) return;
    setLoading(true);
    paqueteriaAPI.unitContacts(tenantId, pkg.unit)
      .then(r => {
        const list = r.data.contacts || [];
        setContacts(list);
        setSelected(new Set(list.filter(c => c.has_email).map(c => c.key)));
      })
      .catch(() => toast.error('No se pudieron cargar los contactos'))
      .finally(() => setLoading(false));
  }, [tenantId, pkg]);

  const toggle = (key) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const send = async () => {
    const recipients = contacts.filter(c => selected.has(c.key) && c.email);
    if (!recipients.length) return toast.error('Selecciona al menos un destinatario con correo');
    setSending(true);
    try {
      const r = await paqueteriaAPI.notify(tenantId, pkg.id, {
        recipients: recipients.map(c => ({ name: c.name, email: c.email, user_id: c.user_id })),
      });
      const sent = r.data?.notify?.sent?.length || 0;
      toast.success(`Notificación enviada a ${sent} destinatario${sent === 1 ? '' : 's'}`);
      onDone();
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo enviar la notificación'));
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal title={`Avisar — ${pkg.folio}`} subtitle={`${pkg.unit_code} · ${pkg.unit_name}`} onClose={onClose} icon={<Mail size={18} />}>
      <p style={{ fontSize: 13, color: 'var(--ink-500)', marginTop: 0 }}>
        Elige a quién se envía el correo y la notificación en Homly.
      </p>
      {loading ? (
        <div style={{ padding: 20, textAlign: 'center', color: 'var(--ink-400)' }}>Cargando contactos...</div>
      ) : contacts.length === 0 ? (
        <div style={{ padding: 16, color: 'var(--ink-400)' }}>Esta unidad no tiene contactos registrados.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 280, overflowY: 'auto', marginBottom: 16 }}>
          {contacts.map(c => (
            <label key={c.key} className="card" style={{ padding: 10, display: 'flex', gap: 10, alignItems: 'flex-start', opacity: c.has_email ? 1 : 0.55 }}>
              <input
                type="checkbox"
                checked={selected.has(c.key)}
                disabled={!c.has_email}
                onChange={() => toggle(c.key)}
                style={{ marginTop: 3 }}
              />
              <div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{c.name || 'Sin nombre'}</div>
                <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>{c.kind_label}{c.email ? ` · ${c.email}` : ' · sin correo'}</div>
              </div>
            </label>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="btn btn-outline" onClick={onClose} disabled={sending}>Cancelar</button>
        <button className="btn btn-primary" onClick={send} disabled={sending || loading}>
          {sending ? 'Enviando…' : 'Enviar notificación'}
        </button>
      </div>
    </Modal>
  );
}

function MethodCard({ active, icon, title, desc, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1, textAlign: 'left', padding: 14, borderRadius: 14, cursor: 'pointer',
        border: active ? '2px solid var(--teal-600)' : '1px solid var(--sand-200)',
        background: active ? 'var(--teal-50)' : '#fff',
      }}
    >
      <div style={{ color: 'var(--teal-700)', marginBottom: 6 }}>{icon}</div>
      <div style={{ fontWeight: 800, fontSize: 14 }}>{title}</div>
      <div style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: 4, lineHeight: 1.4 }}>{desc}</div>
    </button>
  );
}

function QrCapture({ value, onChange }) {
  const videoRef = useRef(null);
  const [scanning, setScanning] = useState(false);
  const [camError, setCamError] = useState('');

  useEffect(() => {
    if (!scanning) return undefined;
    let stream;
    let timer;
    let stopped = false;
    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        if (typeof window.BarcodeDetector !== 'function') {
          setCamError('Este navegador no lee QR. Escribe el código que aparece bajo el QR del correo.');
          return;
        }
        const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
        const tick = async () => {
          if (stopped || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes[0]?.rawValue) {
              onChange(codes[0].rawValue);
              setScanning(false);
              return;
            }
          } catch { /* keep scanning */ }
          timer = setTimeout(tick, 280);
        };
        tick();
      } catch {
        setCamError('No se pudo abrir la cámara. Escribe el código manualmente.');
      }
    };
    start();
    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach(t => t.stop());
    };
  }, [scanning, onChange]);

  return (
    <div>
      {scanning && (
        <video ref={videoRef} muted playsInline style={{ width: '100%', borderRadius: 12, background: '#111', maxHeight: 220, objectFit: 'cover' }} />
      )}
      <div style={{ display: 'flex', gap: 8, margin: '8px 0' }}>
        <button type="button" className={`btn ${scanning ? 'btn-primary' : 'btn-outline'} btn-sm`} onClick={() => { setCamError(''); setScanning(s => !s); }}>
          <Camera size={13} /> {scanning ? 'Cerrar cámara' : 'Abrir cámara'}
        </button>
      </div>
      {camError && <div style={{ fontSize: 12, color: 'var(--amber-700)', marginBottom: 8 }}>{camError}</div>}
      <input
        className="field-input"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="HOMLY-PKG:… o el código del correo"
      />
    </div>
  );
}

function DeliverModal({ tenantId, pkg, onClose, onDone, initialMethod = '', initialQr = '' }) {
  const [method, setMethod] = useState(initialMethod || '');
  const [notes, setNotes] = useState('');
  const [signature, setSignature] = useState(null);
  const [qr, setQr] = useState(initialQr || '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!method) return toast.error('Elige entrega con QR o con firma');
    if (method === 'firma' && !signature) return toast.error('La firma del destinatario es obligatoria');
    if (method === 'qr' && !qr.trim()) return toast.error('Escanea o escribe el código QR');
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('method', method);
      if (notes.trim()) fd.append('notes', notes.trim());
      if (method === 'qr') fd.append('qr', qr.trim());
      if (method === 'firma' && signature) fd.append('signature', signature, 'firma.png');
      await paqueteriaAPI.deliver(tenantId, pkg.id, fd);
      toast.success(`Paquete ${pkg.folio} entregado`);
      onDone();
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo registrar la entrega'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={`Entregar — ${pkg.folio}`} subtitle={`${pkg.unit_code} · ${pkg.unit_name}`} onClose={onClose} icon={<Package size={18} />}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <MethodCard
          active={method === 'qr'}
          icon={<QrCode size={20} />}
          title="Código QR"
          desc="Escanea el QR del correo o de la pantalla del vecino."
          onClick={() => setMethod('qr')}
        />
        <MethodCard
          active={method === 'firma'}
          icon={<PenLine size={20} />}
          title="Firma"
          desc="El destinatario firma en pantalla al recoger."
          onClick={() => setMethod('firma')}
        />
      </div>
      {method === 'qr' && (
        <div className="field">
          <div className="field-label">Código del paquete *</div>
          <QrCapture value={qr} onChange={setQr} />
        </div>
      )}
      {method === 'firma' && (
        <div className="field">
          <div className="field-label">Firma de recepción *</div>
          <SignaturePad onChange={setSignature} />
        </div>
      )}
      <div className="field">
        <div className="field-label">Nota de entrega (opcional)</div>
        <textarea className="field-input" rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Quién recogió el paquete u observación..." />
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="btn btn-outline" onClick={onClose} disabled={saving}>Cancelar</button>
        <button className="btn btn-primary" onClick={save} disabled={saving || !method}>
          {saving ? 'Guardando…' : 'Confirmar entrega'}
        </button>
      </div>
    </Modal>
  );
}

function ScanDeliverModal({ tenantId, onClose, onDelivered }) {
  const [qr, setQr] = useState('');
  const [pkg, setPkg] = useState(null);
  const [loading, setLoading] = useState(false);
  const lastLookup = useRef('');

  const lookup = async (value) => {
    const code = (value || qr).trim();
    if (!code) return toast.error('Escanea o escribe el código');
    lastLookup.current = code;
    setLoading(true);
    try {
      const r = await paqueteriaAPI.lookup(tenantId, code);
      if (r.data.status === 'entregado') {
        toast.error(`El paquete ${r.data.folio} ya fue entregado`);
        setPkg(r.data);
      } else {
        setPkg(r.data);
        setQr(code);
      }
    } catch (e) {
      toast.error(errMsg(e, 'No se encontró ese código'));
      setPkg(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (/HOMLY-PKG:/i.test(qr) && lastLookup.current !== qr && !loading) {
      lookup(qr);
    }
  }, [qr]);

  if (pkg && pkg.status === 'recibido') {
    return (
      <DeliverModal
        tenantId={tenantId}
        pkg={pkg}
        initialMethod="qr"
        initialQr={qr || pkg.qr_payload || ''}
        onClose={onClose}
        onDone={onDelivered}
      />
    );
  }

  return (
    <Modal title="Escanear QR" subtitle="Identifica el paquete para entregarlo" onClose={onClose} icon={<ScanLine size={18} />}>
      <p style={{ fontSize: 13, color: 'var(--ink-500)', marginTop: 0 }}>
        Apunta la cámara al QR del correo o de la pantalla del vecino.
      </p>
      <QrCapture value={qr} onChange={setQr} />
      {pkg?.status === 'entregado' && (
        <div className="card" style={{ padding: 12, marginTop: 12 }}>
          <div style={{ fontFamily: 'monospace', fontWeight: 800, color: 'var(--teal-700)' }}>{pkg.folio}</div>
          <div style={{ fontSize: 13 }}>{pkg.unit_code} · {pkg.unit_name}</div>
          <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>Ya entregado el {fmtDate(pkg.delivered_at)}</div>
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
        <button className="btn btn-outline" onClick={onClose}>Cerrar</button>
        <button className="btn btn-primary" onClick={() => lookup()} disabled={loading}>
          {loading ? 'Buscando…' : 'Buscar paquete'}
        </button>
      </div>
    </Modal>
  );
}

function DeleteModal({ tenantId, pkg, onClose, onDone }) {
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (comment.trim().length < 3) {
      return toast.error('Escribe un comentario para el log del sistema');
    }
    setSaving(true);
    try {
      await paqueteriaAPI.delete(tenantId, pkg.id, { comment: comment.trim() });
      toast.success(`Paquete ${pkg.folio} eliminado`);
      onDone();
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo eliminar el paquete'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={`Eliminar — ${pkg.folio}`} subtitle={`${pkg.unit_code} · ${pkg.unit_name}`} onClose={onClose} icon={<Trash2 size={18} />}>
      <p style={{ fontSize: 13, color: 'var(--ink-500)', marginTop: 0 }}>
        Esta acción borra el registro de forma permanente, incluida la foto y la firma.
        El comentario queda en el log del sistema.
      </p>
      <div className="field">
        <div className="field-label">Comentario para el log *</div>
        <textarea
          className="field-input"
          rows={4}
          value={comment}
          onChange={e => setComment(e.target.value)}
          placeholder="Ej. Registro duplicado, captura de prueba o unidad incorrecta..."
        />
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="btn btn-outline" onClick={onClose} disabled={saving}>Cancelar</button>
        <button className="btn btn-danger" onClick={save} disabled={saving}>
          {saving ? 'Eliminando…' : 'Eliminar paquete'}
        </button>
      </div>
    </Modal>
  );
}

function DetailDrawer({ pkg, canWrite, canDelete, onClose, onNotify, onDeliver, onDelete }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex justify-end" onClick={onClose}>
      <div className="bg-white h-full w-full max-w-lg overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()} style={{ padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <div style={{ fontFamily: 'monospace', fontWeight: 800, color: 'var(--teal-700)', fontSize: 20 }}>{pkg.folio}</div>
            <div style={{ fontWeight: 700 }}>{pkg.unit_code} · {pkg.unit_name}</div>
            <span className={`badge ${pkg.status === 'entregado' ? 'badge-teal' : 'badge-amber'}`}>{pkg.status_label}</span>
          </div>
          <button className="btn-icon" onClick={onClose}><X size={18} /></button>
        </div>

        {(canWrite && pkg.status === 'recibido') || canDelete ? (
          <div style={{ display: 'flex', gap: 8, margin: '16px 0', flexWrap: 'wrap' }}>
            {canWrite && pkg.status === 'recibido' && (
              <>
                <button className="btn btn-outline" onClick={onNotify}><Mail size={14} /> Avisar</button>
                <button className="btn btn-primary" onClick={onDeliver}><PenLine size={14} /> Entregar</button>
              </>
            )}
            {canDelete && (
              <button className="btn btn-danger" onClick={onDelete}><Trash2 size={14} /> Eliminar</button>
            )}
          </div>
        ) : null}

        <h4 style={{ margin: '20px 0 8px' }}>Evidencia de recepción</h4>
        {pkg.receive_photo_url ? (
          <ProtectedImage
            src={pkg.receive_photo_url}
            alt="Recepción"
            style={{ width: '100%', borderRadius: 12, maxHeight: 240, objectFit: 'cover' }}
            fallback={<div style={{ padding: 24, textAlign: 'center', color: 'var(--ink-400)' }}><ImageIcon size={22} /></div>}
          />
        ) : null}
        {pkg.receive_notes && <p style={{ fontSize: 13, color: 'var(--ink-600)' }}>{pkg.receive_notes}</p>}

        {pkg.qr_data_url && (
          <>
            <h4 style={{ margin: '20px 0 8px' }}>Código QR del paquete</h4>
            <div className="card" style={{ padding: 16, textAlign: 'center' }}>
              <img src={pkg.qr_data_url} alt="QR del paquete" style={{ width: 180, height: 180 }} />
              <div style={{ fontSize: 12, color: 'var(--ink-500)', marginTop: 8 }}>
                Muestra este código en caseta para recoger el paquete.
              </div>
              {pkg.qr_payload && (
                <div style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--teal-700)', marginTop: 4 }}>{pkg.qr_payload}</div>
              )}
            </div>
          </>
        )}

        {(pkg.delivery_signature_url || pkg.delivery_method_label) && (
          <>
            <h4 style={{ margin: '20px 0 8px' }}>
              Entrega{pkg.delivery_method_label ? ` · ${pkg.delivery_method_label}` : ''}
            </h4>
            {pkg.delivery_signature_url && (
              <ProtectedImage
                src={pkg.delivery_signature_url}
                alt="Firma"
                style={{ width: '100%', background: '#fff', border: '1px solid var(--sand-200)', borderRadius: 12 }}
                fallback={null}
              />
            )}
            {pkg.delivery_notes && <p style={{ fontSize: 13, color: 'var(--ink-600)' }}>{pkg.delivery_notes}</p>}
          </>
        )}

        <h4 style={{ margin: '24px 0 10px' }}>Bitácora</h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {(pkg.events || []).map(ev => {
            const meta = EVENT_META[ev.event_type] || EVENT_META.nota;
            return (
              <div key={ev.id} className="card" style={{ padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: meta.color }}>{meta.icon} {meta.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>{fmtDate(ev.created_at)}</div>
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink-500)', marginTop: 4 }}>{ev.actor_name}</div>
                {ev.notes && <div style={{ fontSize: 13, marginTop: 6 }}>{ev.notes}</div>}
                {ev.event_type === 'notificado' && Array.isArray(ev.extra?.sent) && ev.extra.sent.length > 0 && (
                  <div style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: 6 }}>
                    Destinatarios: {ev.extra.sent.map(s => s.email || s.name).join(', ')}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Modal({ title, subtitle, icon, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-h-[92vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
        style={{ padding: 20, maxWidth: wide ? 640 : 512 }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--teal-50)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--teal-700)' }}>
              {icon}
            </div>
            <div>
              <div style={{ fontWeight: 800 }}>{title}</div>
              {subtitle && <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>{subtitle}</div>}
            </div>
          </div>
          <button className="btn-icon" onClick={onClose}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
