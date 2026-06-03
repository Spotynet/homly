import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { voucherAPI, api } from '../api/client';
import { todayPeriod, prevPeriod, periodLabel } from '../utils/helpers';
import toast from 'react-hot-toast';
import {
  Upload, Camera, FileText, Clock, CheckCircle, XCircle,
  Send, Loader2, Eye, Calendar,
  Receipt, AlertCircle, X, Image as ImageIcon,
} from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────────────────────
const STATUS = {
  pending:  { label: 'Pendiente', icon: Clock,       color: 'text-amber-600',   bg: 'bg-amber-50',   border: 'border-amber-200' },
  received: { label: 'Recibido',  icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  rejected: { label: 'Rechazado', icon: XCircle,     color: 'text-rose-600',    bg: 'bg-rose-50',    border: 'border-rose-200' },
};

function StatusBadge({ status }) {
  const s = STATUS[status];
  if (!s) return null;
  const Icon = s.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${s.color} ${s.bg} ${s.border}`}>
      <Icon size={11} /> {s.label}
    </span>
  );
}

// Build a list of selectable periods: 12 months back from current
function buildPeriodOptions() {
  const options = [];
  let p = todayPeriod();
  for (let i = 0; i < 12; i++) {
    options.push(p);
    p = prevPeriod(p);
  }
  return options;
}

// ─── Evidence popup (mirrors Cobranza's evidencePopup) — exported for reuse ──
// Fetches the protected media URL via axios (sends auth cookies), then
// converts the blob to a data URL for display.
export function EvidencePopup({ url, fileName, onClose }) {
  const [state, setState] = useState({ loading: true, b64: null, mime: null, error: null });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get(url, { responseType: 'blob' });
        const blob = res.data;
        const mime = blob.type || 'application/octet-stream';
        const reader = new FileReader();
        reader.onload = (ev) => {
          if (cancelled) return;
          // ev.target.result is "data:mime;base64,XXXX" — extract just the base64 part
          const dataUrl = ev.target.result;
          const b64 = dataUrl.split(',')[1] || '';
          setState({ loading: false, b64, mime, error: null });
        };
        reader.onerror = () => {
          if (!cancelled) setState({ loading: false, b64: null, mime: null, error: 'No se pudo leer el archivo.' });
        };
        reader.readAsDataURL(blob);
      } catch {
        if (!cancelled) setState({ loading: false, b64: null, mime: null, error: 'No se pudo cargar el comprobante.' });
      }
    })();
    return () => { cancelled = true; };
  }, [url]);

  const { loading, b64, mime, error } = state;

  const isPdf   = mime === 'application/pdf' || /\.pdf$/i.test(fileName || '');
  const isImage = mime?.startsWith('image/')
    || b64?.startsWith('iVBOR')   // PNG
    || b64?.startsWith('/9j/')    // JPEG
    || b64?.startsWith('R0lGO')   // GIF
    || b64?.startsWith('UklGR');  // WebP
  const effectiveMime = isPdf ? 'application/pdf'
    : mime && mime !== 'application/octet-stream' ? mime
    : b64?.startsWith('iVBOR') ? 'image/png'
    : b64?.startsWith('/9j/')  ? 'image/jpeg'
    : b64?.startsWith('R0lGO') ? 'image/gif'
    : b64?.startsWith('UklGR') ? 'image/webp'
    : 'application/octet-stream';

  return (
    <div className="modal-bg open" style={{ zIndex: 9999 }} onClick={onClose}>
      <div className="modal lg" onClick={e => e.stopPropagation()} style={{ maxWidth: 820, width: '92vw' }}>
        <div className="modal-head">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FileText size={16} /> {fileName || 'Comprobante de pago'}
          </h3>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body" style={{ padding: 16 }}>
          {loading && (
            <div style={{ textAlign: 'center', padding: 48, color: 'var(--ink-400)', fontSize: 13 }}>
              <Loader2 size={28} className="animate-spin" style={{ margin: '0 auto 10px' }} />
              Cargando comprobante…
            </div>
          )}
          {error && (
            <div style={{ textAlign: 'center', padding: 48, color: 'var(--coral-600)', fontSize: 13 }}>
              {error}
            </div>
          )}
          {!loading && !error && b64 && (
            isPdf ? (
              <div style={{ height: '72vh', border: '1px solid var(--sand-200)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                <iframe
                  src={`data:application/pdf;base64,${b64}`}
                  style={{ width: '100%', height: '100%', border: 'none' }}
                  title="Comprobante PDF"
                />
              </div>
            ) : isImage ? (
              <div style={{ textAlign: 'center', background: 'var(--sand-50)', borderRadius: 'var(--radius-md)', padding: 8, maxHeight: '72vh', overflow: 'auto' }}>
                <img
                  src={`data:${effectiveMime};base64,${b64}`}
                  alt="Comprobante"
                  style={{ maxWidth: '100%', borderRadius: 'var(--radius-sm)', display: 'inline-block' }}
                />
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: 48 }}>
                <FileText size={52} style={{ color: 'var(--ink-300)', marginBottom: 16 }} />
                <p style={{ color: 'var(--ink-500)', marginBottom: 20 }}>Vista previa no disponible para este tipo de archivo.</p>
                <a
                  href={`data:${effectiveMime};base64,${b64}`}
                  download={fileName || 'comprobante'}
                  className="btn btn-primary"
                >
                  Descargar archivo
                </a>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Image/file preview (local file before upload) ────────────────────────────
function FilePreview({ file, onRemove }) {
  const isImage = file?.type?.startsWith('image/');
  const url = file ? URL.createObjectURL(file) : null;
  return (
    <div className="relative border-2 border-teal-200 rounded-xl overflow-hidden bg-slate-50">
      {isImage ? (
        <img src={url} alt="Comprobante" className="w-full max-h-56 object-contain" />
      ) : (
        <div className="flex items-center gap-3 p-4">
          <FileText size={32} className="text-teal-600 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-700 truncate">{file.name}</p>
            <p className="text-xs text-slate-400">{(file.size / 1024).toFixed(1)} KB</p>
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={onRemove}
        className="absolute top-2 right-2 p-1 bg-white/90 rounded-full shadow text-slate-500 hover:text-rose-500 transition-colors">
        <X size={14} />
      </button>
    </div>
  );
}

// ─── New Voucher Form ─────────────────────────────────────────────────────────
function NewVoucherForm({ tenantId, onSuccess }) {
  const periodOptions = buildPeriodOptions();
  const [period, setPeriod] = useState(periodOptions[0]);
  const [notes, setNotes]   = useState('');
  const [file, setFile]     = useState(null);
  const fileInputRef   = useRef(null);
  const cameraInputRef = useRef(null);
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: (fd) => voucherAPI.create(tenantId, fd),
    onSuccess: () => {
      toast.success('Comprobante enviado correctamente');
      qc.invalidateQueries({ queryKey: ['vouchers', tenantId] });
      setFile(null);
      setNotes('');
      setPeriod(periodOptions[0]);
      onSuccess?.();
    },
    onError: (err) => {
      const detail = err?.response?.data?.detail || 'Error al enviar el comprobante';
      toast.error(detail);
    },
  });

  const handleFile = (e) => {
    const f = e.target.files?.[0];
    if (e.target) e.target.value = '';
    if (!f) return;
    const allowed = f.type.startsWith('image/') || f.type === 'application/pdf';
    if (!allowed) { toast.error('Solo se aceptan imágenes o PDF'); return; }
    if (f.size > 15 * 1024 * 1024) { toast.error('Archivo demasiado grande (máx 15 MB)'); return; }
    setFile(f);
  };

  const handleSubmit = () => {
    if (!file) { toast.error('Adjunta el comprobante de pago'); return; }
    const fd = new FormData();
    fd.append('period', period);
    fd.append('notes', notes);
    fd.append('evidence_file', file);
    mutation.mutate(fd);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
      <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
        <div className="w-9 h-9 rounded-xl bg-teal-50 flex items-center justify-center">
          <Receipt size={18} className="text-teal-600" />
        </div>
        <div>
          <h2 className="font-bold text-slate-800">Enviar comprobante de pago</h2>
          <p className="text-xs text-slate-500">Adjunta tu evidencia de pago para el período seleccionado</p>
        </div>
      </div>

      {/* Period selector */}
      <div>
        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-2">
          <Calendar size={11} className="inline mr-1" /> Período de pago
        </label>
        <select
          value={period}
          onChange={e => setPeriod(e.target.value)}
          className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white">
          {periodOptions.map(p => (
            <option key={p} value={p}>{periodLabel(p)}</option>
          ))}
        </select>
      </div>

      {/* File upload area */}
      <div>
        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-2">
          <ImageIcon size={11} className="inline mr-1" /> Comprobante / Evidencia
        </label>
        {file ? (
          <FilePreview file={file} onRemove={() => setFile(null)} />
        ) : (
          <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center space-y-3 hover:border-teal-300 transition-colors">
            <div className="flex items-center justify-center gap-3">
              <input ref={fileInputRef}   type="file" accept="image/*,application/pdf" onChange={handleFile} className="hidden" />
              <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handleFile} className="hidden" />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-teal-600 text-white rounded-xl text-sm font-semibold hover:bg-teal-700 transition-colors active:scale-95">
                <Upload size={15} /> Adjuntar archivo
              </button>
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="inline-flex items-center gap-2 px-4 py-2.5 border border-slate-200 text-slate-600 rounded-xl text-sm font-semibold hover:border-teal-400 hover:text-teal-600 transition-colors active:scale-95">
                <Camera size={15} /> Tomar foto
              </button>
            </div>
            <p className="text-xs text-slate-400">Imagen o PDF · Máx 15 MB</p>
          </div>
        )}
      </div>

      {/* Notes */}
      <div>
        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-2">Notas (opcional)</label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={2}
          placeholder="Ej: Transferencia del 1 de junio, banco BBVA..."
          className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none" />
      </div>

      <button
        type="button"
        disabled={!file || mutation.isPending}
        onClick={handleSubmit}
        className="w-full inline-flex items-center justify-center gap-2 py-3 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-sm font-bold transition-all active:scale-95 shadow-sm">
        {mutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        {mutation.isPending ? 'Enviando...' : 'Enviar comprobante'}
      </button>
    </div>
  );
}

// ─── Voucher history card ─────────────────────────────────────────────────────
function VoucherCard({ voucher, onViewEvidence }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-slate-700">{periodLabel(voucher.period)}</span>
        <StatusBadge status={voucher.status} />
      </div>

      {voucher.notes && (
        <p className="text-xs text-slate-500 italic">"{voucher.notes}"</p>
      )}

      {voucher.evidence_file_url && (
        <button
          type="button"
          onClick={() => onViewEvidence(voucher)}
          className="inline-flex items-center gap-1.5 text-xs text-teal-600 font-semibold hover:text-teal-700 transition-colors">
          <Eye size={12} /> Ver comprobante
        </button>
      )}

      {voucher.status === 'rejected' && voucher.review_notes && (
        <div className="flex items-start gap-2 p-3 bg-rose-50 rounded-lg border border-rose-200">
          <AlertCircle size={14} className="text-rose-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-rose-700"><strong>Motivo:</strong> {voucher.review_notes}</p>
        </div>
      )}

      {voucher.status === 'received' && (
        <div className="flex items-center gap-2 p-3 bg-emerald-50 rounded-lg border border-emerald-200">
          <CheckCircle size={14} className="text-emerald-500" />
          <p className="text-xs text-emerald-700 font-medium">Tu comprobante fue recibido y validado.</p>
        </div>
      )}

      <p className="text-[11px] text-slate-400">
        Enviado: {new Date(voucher.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}
      </p>
    </div>
  );
}

// ─── Main component (Resident view) ──────────────────────────────────────────
export default function EnviarPago() {
  const { tenantId, tenant } = useAuth();
  const [showForm, setShowForm]         = useState(false);
  const [evidencePopup, setEvidencePopup] = useState(null); // { url, fileName }

  const { data, isLoading } = useQuery({
    queryKey: ['vouchers', tenantId],
    queryFn:  () => voucherAPI.list(tenantId),
    enabled:  !!tenantId,
    select:   res => res.data?.results || res.data || [],
  });

  const vouchers = data || [];
  const pending  = vouchers.filter(v => v.status === 'pending').length;

  const handleViewEvidence = (voucher) => {
    // Extract a readable filename from the URL path
    const urlPath = voucher.evidence_file_url || '';
    const fileName = decodeURIComponent(urlPath.split('/').pop()) || 'comprobante';
    setEvidencePopup({ url: voucher.evidence_file_url, fileName });
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-8 py-5">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center shadow-md">
              <Receipt size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-800">Enviar pago</h1>
              <p className="text-xs text-slate-500">{tenant?.name || 'Mi condominio'}</p>
            </div>
          </div>
          <button
            onClick={() => setShowForm(v => !v)}
            className="inline-flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-4 py-2.5 rounded-xl text-sm font-semibold shadow-sm transition-all hover:shadow-md active:scale-95">
            {showForm ? <X size={16} /> : <Send size={16} />}
            {showForm ? 'Cancelar' : 'Nuevo comprobante'}
          </button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 sm:px-8 py-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Enviados',   value: vouchers.length,                                      color: 'text-slate-700',   bg: 'bg-slate-50',   icon: Send },
            { label: 'Pendientes', value: pending,                                               color: 'text-amber-600',   bg: 'bg-amber-50',   icon: Clock },
            { label: 'Recibidos',  value: vouchers.filter(v => v.status === 'received').length, color: 'text-emerald-600', bg: 'bg-emerald-50', icon: CheckCircle },
          ].map(({ label, value, color, bg, icon: Icon }) => (
            <div key={label} className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg ${bg} flex items-center justify-center flex-shrink-0`}>
                <Icon size={18} className={color} />
              </div>
              <div>
                <div className="text-2xl font-bold text-slate-800">{value}</div>
                <div className="text-xs text-slate-500">{label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Form */}
        {showForm && (
          <NewVoucherForm tenantId={tenantId} onSuccess={() => setShowForm(false)} />
        )}

        {/* History */}
        <div>
          <h3 className="text-sm font-bold text-slate-700 mb-3">Mis envíos</h3>
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-slate-400">
              <Loader2 size={28} className="animate-spin mr-2" /> Cargando...
            </div>
          ) : vouchers.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <Receipt size={40} className="mx-auto mb-3 opacity-30" />
              <p className="font-semibold">Aún no has enviado comprobantes</p>
              <p className="text-sm mt-1">Usa el botón de arriba para enviar tu primer pago</p>
            </div>
          ) : (
            <div className="space-y-3">
              {vouchers.map(v => (
                <VoucherCard key={v.id} voucher={v} onViewEvidence={handleViewEvidence} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Evidence popup — fetches file with auth and renders inline */}
      {evidencePopup && (
        <EvidencePopup
          url={evidencePopup.url}
          fileName={evidencePopup.fileName}
          onClose={() => setEvidencePopup(null)}
        />
      )}
    </div>
  );
}
