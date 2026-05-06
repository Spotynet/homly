import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { cajaChicaAPI, periodsAPI, tenantsAPI } from '../api/client';
import { todayPeriod, periodLabel, prevPeriod, nextPeriod, fmtDate, PAYMENT_TYPES } from '../utils/helpers';
import { ChevronLeft, ChevronRight, Plus, Edit, Trash2, X, DollarSign, Check, Lock, Paperclip, Eye, FileText, Image, Printer } from 'lucide-react';
import toast from 'react-hot-toast';

// ── Evidence helpers ────────────────────────────────────────────────────────

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(',')[1];
      resolve({ data: base64, mime: file.type, name: file.name });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function parseEvidence(raw) {
  if (!raw) return [];
  const s = String(raw).trim();
  if (s.startsWith('[')) {
    try { return JSON.parse(s); } catch { /* fall through */ }
  }
  return s ? [{ data: s, mime: '', name: 'Evidencia adjunta' }] : [];
}

const ACCEPTED_TYPES = 'image/png,image/jpeg,image/gif,image/webp,image/bmp,application/pdf';

// ── EvidenceViewer popup ────────────────────────────────────────────────────

function EvidenceViewer({ files, onClose }) {
  const [idx, setIdx] = useState(0);
  if (!files || files.length === 0) return null;
  const f = files[idx];
  const isPdf = f.mime === 'application/pdf' || /\.pdf$/i.test(f.name || '');
  const isImg = !isPdf && (f.mime?.startsWith('image/') || f.data?.startsWith('iVBOR') || f.data?.startsWith('/9j/'));
  const src = `data:${f.mime || (isPdf ? 'application/pdf' : 'image/png')};base64,${f.data}`;

  return (
    <div className="modal-bg open" style={{ zIndex: 9999 }} onClick={onClose}>
      <div className="modal lg" onClick={e => e.stopPropagation()} style={{ maxWidth: 840, width: '92vw' }}>
        <div className="modal-head">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {isPdf ? <FileText size={16} /> : <Image size={16} />}
            {f.name || 'Evidencia adjunta'}
            {files.length > 1 && (
              <span style={{ fontSize: 12, color: 'var(--ink-400)', fontWeight: 400 }}>
                ({idx + 1} / {files.length})
              </span>
            )}
          </h3>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body" style={{ padding: 0, background: '#111', borderRadius: '0 0 16px 16px', minHeight: 300, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          {isPdf ? (
            <iframe src={src} title="PDF" style={{ width: '100%', height: 520, border: 'none', borderRadius: '0 0 16px 16px' }} />
          ) : isImg ? (
            <img src={src} alt={f.name} style={{ maxWidth: '100%', maxHeight: 520, objectFit: 'contain', borderRadius: '0 0 16px 16px' }} />
          ) : (
            <div style={{ color: '#fff', padding: 40, textAlign: 'center' }}>
              <FileText size={40} style={{ opacity: 0.5 }} />
              <div style={{ marginTop: 12, fontSize: 13 }}>Vista previa no disponible</div>
            </div>
          )}
        </div>
        {files.length > 1 && (
          <div className="modal-foot" style={{ justifyContent: 'center', gap: 16 }}>
            <button className="btn btn-outline btn-sm" onClick={() => setIdx(i => Math.max(0, i - 1))} disabled={idx === 0}>
              <ChevronLeft size={14} /> Anterior
            </button>
            <button className="btn btn-outline btn-sm" onClick={() => setIdx(i => Math.min(files.length - 1, i + 1))} disabled={idx === files.length - 1}>
              Siguiente <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Constants ───────────────────────────────────────────────────────────────

// Caja Chica NO tiene Transferencia
const CAJA_PAYMENT_TYPES = Object.entries(PAYMENT_TYPES)
  .filter(([k]) => k !== 'transferencia')
  .map(([k, v]) => ({ value: k, ...v }));

function _fmt(n, currency = 'MXN') {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n ?? 0);
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function pdfTitle(report, period, tenant) {
  return `${(report || '').trim()} — ${(period || '').trim()} — ${(tenant || '').trim()}`;
}

// ── Print Layout ─────────────────────────────────────────────────────────────
// Oculto en pantalla; visible solo al imprimir con body.printing-caja-chica

function CajaChicaPrintLayout({ tenant, period, cajaChica, totalCaja }) {
  const cur      = tenant?.currency || 'MXN';
  const fmt      = (n) => _fmt(n, cur);
  const genDate  = new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });
  const periodStr = periodLabel(period);

  const tenantName = tenant?.razon_social || tenant?.name || 'Condominio';
  const tenantRFC  = tenant?.rfc || '';
  const tenantAddr = [tenant?.info_calle, tenant?.info_num_externo, tenant?.info_colonia, tenant?.info_ciudad]
    .filter(Boolean).join(', ');
  const tenantLogo = tenant?.logo || null;

  const thStyle = {
    background: '#4C1D95', color: '#fff', fontSize: 9,
    fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
    padding: '6px 8px', textAlign: 'left', borderRight: '1px solid rgba(255,255,255,0.15)',
  };
  const tdStyle = (extra = {}) => ({
    fontSize: 11, padding: '6px 8px', borderBottom: '1px solid #EEE',
    verticalAlign: 'top', ...extra,
  });

  return (
    <div className="caja-chica-print-layout" style={{ fontFamily: 'Arial, Helvetica, sans-serif', color: '#1A1612', fontSize: 12 }}>

      {/* ── MEMBRETE ── */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        borderBottom: '3px solid #4C1D95', paddingBottom: 14, marginBottom: 20,
      }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          {tenantLogo && (
            <img src={tenantLogo} alt="Logo" style={{ width: 64, height: 64, objectFit: 'contain', borderRadius: 8 }} />
          )}
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#4C1D95', lineHeight: 1.2 }}>{tenantName}</div>
            {tenantRFC  && <div style={{ fontSize: 10, color: '#555', marginTop: 3 }}>RFC: <strong>{tenantRFC}</strong></div>}
            {tenantAddr && <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>{tenantAddr}</div>}
            {tenant?.phone && <div style={{ fontSize: 10, color: '#666', marginTop: 1 }}>Tel: {tenant.phone}</div>}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#4C1D95', letterSpacing: '-0.02em' }}>REPORTE DE CAJA CHICA</div>
          <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>Período: <strong style={{ color: '#4C1D95' }}>{periodStr}</strong></div>
          <div style={{
            marginTop: 8, display: 'inline-block', padding: '4px 12px',
            background: '#4C1D95', color: '#fff', borderRadius: 4, fontSize: 10,
            fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
          }}>
            Gastos Menores
          </div>
        </div>
      </div>

      {/* ── TABLA DE REGISTROS ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#F5F3FF', borderLeft: '4px solid #5B21B6', padding: '7px 12px', marginBottom: 0 }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#5B21B6', flexShrink: 0 }} />
        <span style={{ fontSize: 11, fontWeight: 800, color: '#5B21B6', textTransform: 'uppercase', letterSpacing: '0.07em', flex: 1 }}>
          Registros de Caja Chica
        </span>
        <span style={{ fontSize: 10, color: '#555' }}>{cajaChica.length} registro(s)</span>
      </div>

      {cajaChica.length === 0 ? (
        <div style={{ padding: '10px 12px', fontSize: 11, color: '#999', fontStyle: 'italic', borderBottom: '1px solid #EEE' }}>
          Sin registros de caja chica en este período
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, width: '44%' }}>Descripción</th>
              <th style={{ ...thStyle, width: '22%' }}>Forma de Pago</th>
              <th style={{ ...thStyle, width: '16%' }}>Fecha</th>
              <th style={{ ...thStyle, width: '18%', textAlign: 'right' }}>Monto</th>
            </tr>
          </thead>
          <tbody>
            {cajaChica.map((c, i) => (
              <tr key={c.id} style={{ background: i % 2 === 0 ? '#FAF5FF' : '#F3E8FF' }}>
                <td style={tdStyle({ fontWeight: 600, color: '#5B21B6' })}>{c.description}</td>
                <td style={tdStyle()}>{PAYMENT_TYPES[c.payment_type]?.short || c.payment_type || '—'}</td>
                <td style={tdStyle({ fontSize: 10 })}>{fmtDate(c.date)}</td>
                <td style={tdStyle({ textAlign: 'right', fontWeight: 700, color: '#5B21B6' })}>{fmt(c.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* ── TOTAL ── */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
        <div style={{ background: '#4C1D95', color: '#fff', padding: '12px 22px', borderRadius: 6, textAlign: 'right', minWidth: 200 }}>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.75, marginBottom: 4 }}>Total Caja Chica</div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{fmt(totalCaja)}</div>
          <div style={{ fontSize: 9, opacity: 0.6, marginTop: 4 }}>Período {periodStr}</div>
        </div>
      </div>

      {/* ── PIE DE PÁGINA ── */}
      <div style={{ marginTop: 18, paddingTop: 10, borderTop: '1px solid #DDD', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 9, color: '#999' }}>
        <span>Generado el {genDate} · Sistema Homly</span>
        <span style={{ fontStyle: 'italic' }}>Documento de uso interno — Caja Chica</span>
      </div>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export default function CajaChica() {
  const { tenantId, isReadOnly } = useAuth();
  const [period, setPeriod]           = useState(todayPeriod());
  const [cajaChica, setCajaChica]     = useState([]);
  const [tenant, setTenant]           = useState(null);
  const [modal, setModal]             = useState(null);
  const [form, setForm]               = useState({});
  const [saving, setSaving]           = useState(false);
  const [closedPeriods, setClosedPeriods] = useState([]);
  const [cajaEvidence, setCajaEvidence]   = useState([]);
  const [viewerFiles, setViewerFiles]     = useState(null);
  const fileInputRef = useRef(null);

  const load = async () => {
    if (!tenantId) return;
    try {
      const [cc, tn, cp] = await Promise.all([
        cajaChicaAPI.list(tenantId, { period, page_size: 9999 }),
        tenantsAPI.get(tenantId).catch(() => ({ data: null })),
        periodsAPI.closedList(tenantId).catch(() => ({ data: [] })),
      ]);
      setCajaChica(cc.data.results || cc.data);
      setTenant(tn.data);
      const cpList = Array.isArray(cp.data) ? cp.data : (cp.data?.results || []);
      setClosedPeriods(cpList);
    } catch (e) {
      console.error('Error al cargar caja chica:', e);
    }
  };

  useEffect(() => { load(); }, [tenantId, period]);

  const isPeriodClosed = closedPeriods.some(cp => cp.period === period);
  const cur = tenant?.currency || 'MXN';
  const fmt = (n) => _fmt(n, cur);
  const totalCaja = cajaChica.reduce((s, c) => s + parseFloat(c.amount || 0), 0);

  const handleFileAdd = async (files) => {
    const arr = Array.from(files);
    const invalid = arr.filter(f => !f.type.startsWith('image/') && f.type !== 'application/pdf');
    if (invalid.length) { toast.error('Solo se permiten imágenes (PNG, JPG, GIF, WEBP) y PDF'); return; }
    const tooBig = arr.filter(f => f.size > 10 * 1024 * 1024);
    if (tooBig.length) { toast.error('Cada archivo debe ser menor a 10 MB'); return; }
    try {
      const encoded = await Promise.all(arr.map(fileToBase64));
      setCajaEvidence(prev => [...prev, ...encoded]);
    } catch { toast.error('Error al procesar el archivo'); }
  };

  const saveCaja = async () => {
    if (!form.description?.trim()) { toast.error('La descripción es requerida'); return; }
    if (!form.amount || isNaN(parseFloat(form.amount))) { toast.error('El monto debe ser un número válido'); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        period,
        evidence: cajaEvidence.length > 0 ? JSON.stringify(cajaEvidence) : (form.evidence || ''),
      };
      if (form.id) await cajaChicaAPI.update(tenantId, form.id, payload);
      else await cajaChicaAPI.create(tenantId, payload);
      toast.success('Registro guardado');
      setCajaEvidence([]);
      setModal(null);
      load();
    } catch { toast.error('Error al guardar'); }
    finally { setSaving(false); }
  };

  const handlePrint = () => {
    const prev = document.title;
    document.title = pdfTitle('Reporte de Caja Chica', period, tenant?.name);
    document.body.classList.add('printing-caja-chica');
    window.print();
    setTimeout(() => {
      document.body.classList.remove('printing-caja-chica');
      document.title = prev;
    }, 1500);
  };

  const handleDelete = async (c) => {
    if (!window.confirm('¿Eliminar este registro de caja chica?')) return;
    try {
      await cajaChicaAPI.delete(tenantId, c.id);
      toast.success('Eliminado');
      load();
    } catch { toast.error('No se pudo eliminar el registro'); }
  };

  return (
    <div className="content-fade">

      {/* ── PDF ejecutivo (oculto en pantalla, visible solo al imprimir con body.printing-caja-chica) ── */}
      <CajaChicaPrintLayout
        tenant={tenant}
        period={period}
        cajaChica={cajaChica}
        totalCaja={totalCaja}
      />

      {/* ── Period nav + action ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <div className="period-nav">
          <button className="period-nav-btn" onClick={() => setPeriod(prevPeriod(period))}><ChevronLeft size={16} /></button>
          <input
            type="month"
            className="period-month-select"
            style={{ fontSize: 15, fontWeight: 700 }}
            value={period}
            onChange={e => setPeriod(e.target.value)}
          />
          <button className="period-nav-btn" onClick={() => setPeriod(nextPeriod(period))}><ChevronRight size={16} /></button>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {isPeriodClosed && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '4px 12px', borderRadius: 20,
              background: 'var(--coral-50)', color: 'var(--coral-700)',
              fontSize: 12, fontWeight: 700, border: '1px solid var(--coral-100)',
            }}>
              <Lock size={11} /> Período cerrado
            </span>
          )}
          {!isReadOnly && !isPeriodClosed && (
            <button
              className="btn btn-primary btn-sm"
              style={{ borderColor: 'var(--purple-400, #A78BFA)', background: 'var(--purple-600, #7C3AED)' }}
              onClick={() => {
                setForm({ amount: '', description: '', payment_type: 'efectivo' });
                setCajaEvidence([]);
                setModal('caja');
              }}
            >
              <Plus size={14} /> Nuevo Registro
            </button>
          )}
          <button className="btn btn-outline btn-sm" onClick={handlePrint}>
            <Printer size={14} /> Descargar PDF
          </button>
        </div>
      </div>

      {/* ── Caja Chica Card ── */}
      <div className="card" style={{ border: '1.5px solid var(--purple-200, #DDD6FE)' }}>
        <div className="card-head" style={{ background: 'var(--purple-50)' }}>
          <h3 style={{ color: 'var(--purple-700, #6D28D9)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <DollarSign size={16} />
            Caja Chica — {periodLabel(period)}
          </h3>
          <span className="badge" style={{ background: 'var(--purple-100, #EDE9FE)', color: 'var(--purple-700, #6D28D9)' }}>
            {cajaChica.length} reg. · {fmt(totalCaja)}
          </span>
        </div>

        {cajaChica.length === 0 ? (
          <div className="card-body" style={{ textAlign: 'center', padding: 40, color: 'var(--ink-400)', fontSize: 13 }}>
            <DollarSign size={32} style={{ opacity: 0.2, display: 'block', margin: '0 auto 10px' }} />
            Sin registros de caja chica en este período
            {!isReadOnly && !isPeriodClosed && (
              <div style={{ marginTop: 12 }}>
                <button
                  className="btn btn-outline btn-sm"
                  style={{ borderColor: 'var(--purple-300, #C4B5FD)', color: 'var(--purple-700, #6D28D9)' }}
                  onClick={() => {
                    setForm({ amount: '', description: '', payment_type: 'efectivo' });
                    setCajaEvidence([]);
                    setModal('caja');
                  }}
                >
                  <Plus size={13} /> Agregar registro
                </button>
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr style={{ background: 'var(--purple-50)' }}>
                    <th>Descripción</th>
                    <th style={{ textAlign: 'right' }}>Monto</th>
                    <th>Forma de Pago</th>
                    <th>Fecha</th>
                    <th style={{ width: 52, textAlign: 'center' }}>Evidencia</th>
                    {!isReadOnly && <th style={{ width: 80 }}>Acc.</th>}
                  </tr>
                </thead>
                <tbody>
                  {cajaChica.map(c => {
                    const evFiles = parseEvidence(c.evidence);
                    return (
                      <tr key={c.id} style={{ borderBottom: '1px solid var(--sand-100)' }}>
                        <td style={{ fontWeight: 600, color: 'var(--purple-700, #6D28D9)', fontSize: 13 }}>{c.description}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, fontSize: 13, color: 'var(--purple-700, #6D28D9)' }}>{fmt(c.amount)}</td>
                        <td style={{ fontSize: 11 }}>{PAYMENT_TYPES[c.payment_type]?.short || c.payment_type || '—'}</td>
                        <td style={{ fontSize: 11, color: 'var(--ink-500)' }}>{fmtDate(c.date)}</td>
                        <td style={{ textAlign: 'center' }}>
                          {evFiles.length > 0 ? (
                            <button
                              className="btn-icon"
                              title={`Ver ${evFiles.length} evidencia${evFiles.length > 1 ? 's' : ''}`}
                              style={{ color: 'var(--purple-600, #7C3AED)' }}
                              onClick={() => setViewerFiles(evFiles)}
                            >
                              <Eye size={14} />
                              {evFiles.length > 1 && (
                                <span style={{ fontSize: 9, fontWeight: 800, marginLeft: 2 }}>{evFiles.length}</span>
                              )}
                            </button>
                          ) : (
                            <span style={{ fontSize: 10, color: 'var(--ink-300)' }}>—</span>
                          )}
                        </td>
                        {!isReadOnly && (
                          <td style={{ textAlign: 'center' }}>
                            {isPeriodClosed ? (
                              <span title="Período cerrado — solo lectura"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--ink-400)', padding: '2px 6px' }}>
                                <Lock size={12} /> Solo lectura
                              </span>
                            ) : (
                              <>
                                <button className="btn-icon" onClick={() => {
                                  setForm(c);
                                  setCajaEvidence(parseEvidence(c.evidence));
                                  setModal('caja');
                                }}>
                                  <Edit size={13} />
                                </button>
                                <button className="btn-icon" style={{ color: 'var(--coral-500)' }}
                                  onClick={() => handleDelete(c)}>
                                  <Trash2 size={13} />
                                </button>
                              </>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                  <tr style={{ background: 'var(--purple-50)' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 800, color: 'var(--purple-800, #5B21B6)' }}>
                      TOTAL CAJA CHICA
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: 'var(--purple-800, #5B21B6)', fontSize: 15 }}>
                      {fmt(totalCaja)}
                    </td>
                    <td colSpan={!isReadOnly ? 4 : 3}></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* ── Modal Nuevo / Editar ── */}
      {modal === 'caja' && (
        <div className="modal-bg open" onClick={() => { setModal(null); setCajaEvidence([]); }}>
          <div className="modal lg" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3>
                <DollarSign size={16} style={{ display: 'inline', verticalAlign: -3, marginRight: 8 }} />
                {form.id ? 'Editar' : 'Nuevo'} Registro de Caja Chica
              </h3>
              <button className="modal-close" onClick={() => { setModal(null); setCajaEvidence([]); }}>
                <X size={16} />
              </button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="field field-full">
                  <label className="field-label">Descripción <span style={{ color: 'var(--coral-500)' }}>*</span></label>
                  <input
                    className="field-input"
                    value={form.description || ''}
                    onChange={e => setForm({ ...form, description: e.target.value })}
                    placeholder="Descripción del gasto de caja chica"
                  />
                </div>
                <div className="field">
                  <label className="field-label">Monto <span style={{ color: 'var(--coral-500)' }}>*</span></label>
                  <input
                    type="number"
                    className="field-input"
                    step="0.01"
                    min="0"
                    value={form.amount || ''}
                    onChange={e => setForm({ ...form, amount: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label className="field-label">Forma de Pago</label>
                  <select
                    className="field-select"
                    value={form.payment_type || 'efectivo'}
                    onChange={e => setForm({ ...form, payment_type: e.target.value })}
                  >
                    {CAJA_PAYMENT_TYPES.map(p => (
                      <option key={p.value} value={p.value}>{p.short || p.label}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label className="field-label">Fecha</label>
                  <input
                    type="date"
                    className="field-input"
                    value={form.date || ''}
                    onChange={e => setForm({ ...form, date: e.target.value })}
                  />
                </div>
              </div>

              {/* ── Evidencia ── */}
              <div style={{ marginTop: 16 }}>
                <div style={{
                  fontSize: 11, fontWeight: 700, color: 'var(--ink-500)',
                  textTransform: 'uppercase', letterSpacing: '0.06em',
                  borderBottom: '1px solid var(--sand-100)', paddingBottom: 6, marginBottom: 10,
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <Paperclip size={12} /> Evidencia
                  <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--ink-400)', textTransform: 'none', letterSpacing: 0, marginLeft: 4 }}>
                    (imágenes o PDF, máx. 10 MB c/u)
                  </span>
                </div>

                {/* Drop zone */}
                <div
                  style={{
                    border: '2px dashed var(--sand-300)', borderRadius: 10,
                    padding: '16px 20px', textAlign: 'center', cursor: 'pointer',
                    background: 'var(--sand-50)', transition: 'border-color 0.15s',
                    marginBottom: cajaEvidence.length > 0 ? 10 : 0,
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--purple-400, #A78BFA)'; }}
                  onDragLeave={e => { e.currentTarget.style.borderColor = 'var(--sand-300)'; }}
                  onDrop={e => {
                    e.preventDefault();
                    e.currentTarget.style.borderColor = 'var(--sand-300)';
                    handleFileAdd(e.dataTransfer.files);
                  }}
                >
                  <Paperclip size={20} color="var(--ink-400)" style={{ display: 'block', margin: '0 auto 6px' }} />
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-500)' }}>
                    Arrastra archivos aquí o <span style={{ color: 'var(--purple-600, #7C3AED)', textDecoration: 'underline' }}>seleccionar</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 3 }}>PNG, JPG, GIF, WEBP, PDF</div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={ACCEPTED_TYPES}
                    multiple
                    style={{ display: 'none' }}
                    onChange={e => { handleFileAdd(e.target.files); e.target.value = ''; }}
                  />
                </div>

                {/* Archivos adjuntos */}
                {cajaEvidence.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {cajaEvidence.map((ev, i) => {
                      const isPdf = ev.mime === 'application/pdf' || /\.pdf$/i.test(ev.name || '');
                      return (
                        <div key={i} style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '8px 12px', background: 'var(--purple-50, #F5F3FF)',
                          border: '1px solid var(--purple-100, #EDE9FE)', borderRadius: 8,
                        }}>
                          {isPdf
                            ? <FileText size={16} color="var(--purple-600, #7C3AED)" style={{ flexShrink: 0 }} />
                            : <Image size={16} color="var(--purple-600, #7C3AED)" style={{ flexShrink: 0 }} />
                          }
                          <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: 'var(--ink-700)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {ev.name || `Evidencia ${i + 1}`}
                          </span>
                          <button
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--purple-600, #7C3AED)', padding: 2, flexShrink: 0 }}
                            title="Ver"
                            onClick={() => setViewerFiles([ev])}
                          >
                            <Eye size={14} />
                          </button>
                          <button
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--coral-500)', padding: 2, flexShrink: 0 }}
                            title="Quitar"
                            onClick={() => setCajaEvidence(prev => prev.filter((_, idx) => idx !== i))}
                          >
                            <X size={14} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="modal-foot">
              <button className="btn btn-outline" onClick={() => { setModal(null); setCajaEvidence([]); }}>
                Cancelar
              </button>
              <button className="btn btn-primary" onClick={saveCaja} disabled={saving}
                style={{ background: 'var(--purple-600, #7C3AED)', borderColor: 'var(--purple-600, #7C3AED)' }}>
                <Check size={14} /> {saving ? 'Guardando…' : form.id ? 'Guardar' : 'Registrar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Evidence Viewer ── */}
      {viewerFiles && (
        <EvidenceViewer files={viewerFiles} onClose={() => setViewerFiles(null)} />
      )}

    </div>
  );
}
