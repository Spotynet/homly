import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { voucherAPI, api } from '../api/client';
import { todayPeriod, prevPeriod, periodLabel } from '../utils/helpers';
import toast from 'react-hot-toast';
import {
  Upload, Camera, FileText, Clock, CheckCircle, XCircle,
  Send, Loader2, Eye, Calendar, Receipt, AlertCircle, X,
  Image as ImageIcon,
} from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────────────────────
const STATUS = {
  pending:  { label: 'Pendiente', icon: Clock,       color: 'text-amber-600',   bg: 'bg-amber-50',   border: 'border-amber-200' },
  received: { label: 'Recibido',  icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  rejected: { label: 'Rechazado', icon: XCircle,     color: 'text-rose-600',    bg: 'bg-rose-50',    border: 'border-rose-200' },
};

const ACCEPTED_EXT = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'pdf'];
const MAX_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB

function isAcceptedFile(f) {
  if (!f) return false;
  if (f.type?.startsWith('image/')) return true;
  if ((f.type || '').toLowerCase().includes('pdf')) return true;
  const ext = (f.name?.split('.').pop() || '').toLowerCase();
  return ACCEPTED_EXT.includes(ext);
}

// Convierte una imagen a JPEG vía canvas (reduce tamaño y garantiza compatibilidad
// del preview en el browser). No funciona para HEIC (browser no puede decodificar),
// en ese caso rechaza la promesa y el caller usa el archivo original.
function compressToJpeg(file, maxDim = 1600, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read-error'));
    reader.onload = (ev) => {
      const img = new window.Image();
      img.onerror = () => reject(new Error('decode-error'));
      img.onload = () => {
        try {
          const ratio = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
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
            if (!blob) { reject(new Error('blob-null')); return; }
            const baseName = (file.name || 'comprobante').replace(/\.[^.]+$/, '');
            resolve(new File([blob], `${baseName}.jpg`, {
              type: 'image/jpeg',
              lastModified: Date.now(),
            }));
          }, 'image/jpeg', quality);
        } catch (err) {
          reject(err);
        }
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
}

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

// Asegura nombre y MIME coherentes para el archivo que se sube.
// Para fotos de cámara sin nombre o MIME vacío los infiere del contexto.
function sanitizeFile(f) {
  if (!f) return f;
  let mime = f.type || '';
  let name = f.name?.trim() || '';

  // Nombre genérico o vacío → generar uno con timestamp
  if (!name || name === 'blob' || name === 'image' || name === 'photo') {
    const ext = mime === 'application/pdf' ? 'pdf'
      : mime === 'image/png'  ? 'png'
      : mime === 'image/gif'  ? 'gif'
      : mime === 'image/webp' ? 'webp'
      : mime === 'image/heic' || mime === 'image/heif' ? 'heic'
      : 'jpg';
    name = `comprobante_${Date.now()}.${ext}`;
  }

  // MIME vacío → inferir desde extensión
  if (!mime) {
    const ext = name.split('.').pop()?.toLowerCase() || '';
    mime = ext === 'pdf'  ? 'application/pdf'
      : ext === 'png'    ? 'image/png'
      : ext === 'gif'    ? 'image/gif'
      : ext === 'webp'   ? 'image/webp'
      : ext === 'heic' || ext === 'heif' ? 'image/heic'
      : 'image/jpeg';
  }

  if (mime === f.type && name === f.name) return f;
  return new File([f], name, { type: mime, lastModified: f.lastModified || Date.now() });
}

// ─── Evidence popup (exported for reuse in Cobranza) ─────────────────────────
// Descarga el archivo via el cliente API autenticado y lo muestra en un modal.
// Soporta imágenes (JPEG, PNG, WebP, GIF) y PDF.
// Para PDF usa <object> con fallback a enlace de descarga (compatible con iOS Safari).
export function EvidencePopup({ url, fileName, onClose }) {
  const [state, setState] = useState({ loading: true, objectUrl: null, mime: '', error: null });
  const [imgFailed, setImgFailed] = useState(false);
  const objUrlRef = useRef(null);

  useEffect(() => {
    setImgFailed(false);
    if (!url) {
      setState({ loading: false, objectUrl: null, mime: '', error: 'URL no disponible.' });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get(url, { responseType: 'blob' });
        if (cancelled) return;
        const blob = res.data;

        if (!blob || blob.size === 0) throw new Error('empty');

        // Inferir MIME desde blob o extensión del nombre
        const mimeFromBlob = (blob.type && blob.type !== 'application/octet-stream') ? blob.type : '';
        const ext = ((fileName || url).split('?')[0].split('.').pop() || '').toLowerCase();
        const mime = mimeFromBlob
          || (ext === 'pdf'  ? 'application/pdf'
          :   ext === 'png'  ? 'image/png'
          :   ext === 'gif'  ? 'image/gif'
          :   ext === 'webp' ? 'image/webp'
          :   'image/jpeg');

        const typedBlob  = blob.type === mime ? blob : new Blob([blob], { type: mime });
        const objectUrl  = URL.createObjectURL(typedBlob);
        objUrlRef.current = objectUrl;
        setState({ loading: false, objectUrl, mime, error: null });
      } catch (err) {
        if (!cancelled) {
          const msg = err?.response?.status === 404
            ? 'Archivo no encontrado en el servidor.'
            : err?.response?.status === 401
            ? 'Sin permiso para ver este archivo.'
            : 'No se pudo cargar el comprobante.';
          setState({ loading: false, objectUrl: null, mime: '', error: msg });
        }
      }
    })();
    return () => {
      cancelled = true;
      if (objUrlRef.current) { URL.revokeObjectURL(objUrlRef.current); objUrlRef.current = null; }
    };
  }, [url, fileName]);

  const { loading, objectUrl, mime, error } = state;
  const isPdf   = mime === 'application/pdf';
  const isImage = !isPdf && mime.startsWith('image/');
  const isHeic  = mime === 'image/heic' || mime === 'image/heif';

  const displayName = fileName || 'comprobante';

  return (
    <div className="modal-bg open" style={{ zIndex: 9999 }} onClick={onClose}>
      <div className="modal lg" onClick={e => e.stopPropagation()} style={{ maxWidth: 860, width: '94vw' }}>
        <div className="modal-head">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, minWidth: 0 }}>
            <FileText size={15} style={{ flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {displayName}
            </span>
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {objectUrl && (
              <a
                href={objectUrl}
                download={displayName}
                style={{ fontSize: 12, fontWeight: 600, color: 'var(--teal-600)', textDecoration: 'none',
                         display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px',
                         border: '1px solid var(--teal-200)', borderRadius: 'var(--radius-sm)',
                         background: 'var(--teal-50)' }}>
                ⬇ Descargar
              </a>
            )}
            <button className="modal-close" onClick={onClose}><X size={16} /></button>
          </div>
        </div>

        <div className="modal-body" style={{ padding: 16, minHeight: 180 }}>
          {/* ── Cargando ── */}
          {loading && (
            <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--ink-400)' }}>
              <Loader2 size={30} className="animate-spin" style={{ margin: '0 auto 12px', display: 'block' }} />
              <div style={{ fontSize: 13 }}>Cargando comprobante…</div>
            </div>
          )}

          {/* ── Error ── */}
          {error && (
            <div style={{ textAlign: 'center', padding: '48px 24px' }}>
              <AlertCircle size={36} style={{ color: 'var(--coral-400)', margin: '0 auto 12px', display: 'block' }} />
              <div style={{ fontSize: 13, color: 'var(--coral-600)', marginBottom: 8 }}>{error}</div>
              {url && (
                <a href={url} target="_blank" rel="noreferrer"
                  style={{ fontSize: 12, color: 'var(--teal-600)', textDecoration: 'underline' }}>
                  Intentar abrir en nueva pestaña
                </a>
              )}
            </div>
          )}

          {/* ── Contenido ── */}
          {!loading && !error && objectUrl && (
            <>
              {/* PDF — usa <object> + fallback enlace (compatible iOS Safari) */}
              {isPdf && (
                <div style={{ height: '72vh', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <object
                    data={objectUrl}
                    type="application/pdf"
                    style={{ width: '100%', flex: 1, border: '1px solid var(--sand-200)', borderRadius: 'var(--radius-md)' }}
                  >
                    {/* Fallback cuando el browser no puede mostrar PDF inline (iOS Safari) */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center',
                                  justifyContent: 'center', height: '100%', gap: 16, padding: 32,
                                  background: 'var(--sand-50)', borderRadius: 'var(--radius-md)',
                                  border: '1px solid var(--sand-200)' }}>
                      <FileText size={48} style={{ color: 'var(--ink-300)' }} />
                      <p style={{ fontSize: 13, color: 'var(--ink-500)', textAlign: 'center' }}>
                        Tu dispositivo no puede mostrar PDFs aquí.<br />
                        Usa el botón "Descargar" para abrirlo.
                      </p>
                      <a href={objectUrl} download={displayName} className="btn btn-primary" style={{ fontSize: 13 }}>
                        ⬇ Descargar PDF
                      </a>
                    </div>
                  </object>
                </div>
              )}

              {/* Imagen — con fallback para HEIC u otros formatos no renderizables */}
              {isImage && !isHeic && !imgFailed && (
                <div style={{ textAlign: 'center', background: 'var(--sand-50)',
                              borderRadius: 'var(--radius-md)', padding: 8, maxHeight: '76vh', overflow: 'auto' }}>
                  <img
                    src={objectUrl}
                    alt={displayName}
                    style={{ maxWidth: '100%', borderRadius: 'var(--radius-sm)', display: 'inline-block' }}
                    onError={() => setImgFailed(true)}
                  />
                </div>
              )}

              {/* HEIC o imagen que falló al renderizar → mostrar descarga */}
              {(isHeic || (isImage && imgFailed)) && (
                <div style={{ textAlign: 'center', padding: '48px 24px' }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>📷</div>
                  <p style={{ fontSize: 13, color: 'var(--ink-500)', marginBottom: 20 }}>
                    {isHeic
                      ? 'Formato HEIC — descárgala para verla en tu dispositivo.'
                      : 'No se pudo mostrar la imagen en el navegador.'}
                  </p>
                  <a href={objectUrl} download={displayName} className="btn btn-primary" style={{ fontSize: 13 }}>
                    ⬇ Descargar imagen
                  </a>
                </div>
              )}

              {/* Formato desconocido */}
              {!isPdf && !isImage && (
                <div style={{ textAlign: 'center', padding: '48px 24px' }}>
                  <FileText size={48} style={{ color: 'var(--ink-300)', margin: '0 auto 16px', display: 'block' }} />
                  <p style={{ fontSize: 13, color: 'var(--ink-500)', marginBottom: 20 }}>
                    Vista previa no disponible para este tipo de archivo.
                  </p>
                  <a href={objectUrl} download={displayName} className="btn btn-primary" style={{ fontSize: 13 }}>
                    ⬇ Descargar archivo
                  </a>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Local file preview (before upload) ──────────────────────────────────────
// Muestra preview de imagen cuando el browser puede renderizarla (JPEG, PNG, WebP…).
// Para HEIC u otros formatos no renderizables muestra icono + nombre + tamaño.
function FilePreview({ file, onRemove }) {
  const [previewUrl, setPreviewUrl] = useState(null);
  const [imgFailed, setImgFailed]   = useState(false);

  const isPdf  = file?.type === 'application/pdf';
  const isImgType = !isPdf && file?.type?.startsWith('image/');
  // HEIC/HEIF: el browser no puede renderizarlos → mostrar solo icono
  const isHeic = file?.type === 'image/heic' || file?.type === 'image/heif'
    || /\.(heic|heif)$/i.test(file?.name || '');

  useEffect(() => {
    setImgFailed(false);
    if (!file || !isImgType || isHeic) { setPreviewUrl(null); return; }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file, isImgType, isHeic]);

  const showImg = isImgType && !isHeic && previewUrl && !imgFailed;
  const sizeKb  = file ? (file.size / 1024) : 0;
  const sizeStr = sizeKb >= 1024
    ? `${(sizeKb / 1024).toFixed(1)} MB`
    : `${sizeKb.toFixed(0)} KB`;

  return (
    <div className="relative border-2 border-teal-200 rounded-xl overflow-hidden bg-slate-50">
      {showImg ? (
        <img
          src={previewUrl}
          alt="Comprobante"
          className="w-full max-h-56 object-contain"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <div className="flex items-center gap-3 p-4">
          {isPdf
            ? <FileText size={36} className="text-rose-500 flex-shrink-0" />
            : <ImageIcon size={36} className="text-teal-500 flex-shrink-0" />}
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-700 truncate max-w-[220px]">
              {file?.name || 'Archivo adjunto'}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">{sizeStr}</p>
            {isHeic && (
              <p className="text-[11px] text-amber-600 mt-0.5">
                Foto HEIC — se enviará tal cual
              </p>
            )}
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={onRemove}
        className="absolute top-2 right-2 p-1.5 bg-white/90 rounded-full shadow text-slate-500 hover:text-rose-600 transition-colors">
        <X size={13} />
      </button>
    </div>
  );
}

// ─── New Voucher Form ─────────────────────────────────────────────────────────
function NewVoucherForm({ tenantId, onSuccess, onFileChange }) {
  const periodOptions = buildPeriodOptions();
  const [period, setPeriod]       = useState(periodOptions[0]);
  const [notes, setNotes]         = useState('');
  const [file, setFile]           = useState(null);
  const [processing, setProcessing] = useState(false); // compresión en curso
  const fileInputRef   = useRef(null);
  const cameraInputRef = useRef(null);
  const qc = useQueryClient();

  useEffect(() => { onFileChange?.(!!file); }, [file, onFileChange]);

  const mutation = useMutation({
    mutationFn: (fd) => voucherAPI.create(tenantId, fd),
    onSuccess: () => {
      toast.success('Comprobante enviado correctamente');
      qc.invalidateQueries({ queryKey: ['vouchers', tenantId] });
      setFile(null);
      setNotes('');
      setPeriod(periodOptions[0]);
      onFileChange?.(false);
      onSuccess?.();
    },
    onError: (err) => {
      const data   = err?.response?.data;
      const detail = (typeof data === 'string' ? data : data?.detail)
        || Object.values(data || {}).flat()[0]
        || 'Error al enviar el comprobante';
      toast.error(String(detail));
    },
  });

  // Procesa el archivo seleccionado:
  // 1. Sanea nombre/MIME
  // 2. Valida formato y tamaño
  // 3. Intenta comprimir a JPEG via canvas para imágenes compatibles
  //    (reduce tamaño y garantiza que el browser pueda mostrar el preview)
  // 4. Para HEIC/HEIF o si la compresión falla, usa el original
  const processFile = async (raw) => {
    if (!raw) return;
    const f = sanitizeFile(raw);

    if (!isAcceptedFile(f)) {
      toast.error('Formato no permitido. Adjunta una imagen (JPG, PNG, HEIC) o PDF');
      return;
    }
    if (f.size > MAX_SIZE_BYTES) {
      toast.error('Archivo demasiado grande. El máximo es 15 MB');
      return;
    }

    const isHeic = f.type === 'image/heic' || f.type === 'image/heif'
      || /\.(heic|heif)$/i.test(f.name);
    const isImg  = f.type?.startsWith('image/');

    // Intentar compresión solo para imágenes que el canvas puede decodificar
    if (isImg && !isHeic) {
      setProcessing(true);
      try {
        const compressed = await compressToJpeg(f);
        setFile(compressed);
      } catch {
        // Canvas no pudo decodificar (e.g. formato exótico) → usar original
        setFile(f);
      } finally {
        setProcessing(false);
      }
    } else {
      setFile(f);
    }
  };

  const handleFileInput = async (e) => {
    const raw = e.target.files?.[0];
    // Limpiar input DESPUÉS de capturar el archivo para permitir
    // volver a seleccionar el mismo archivo si el usuario lo necesita
    try { if (e.target) e.target.value = ''; } catch {}
    await processFile(raw);
  };

  const handleSubmit = () => {
    if (!file) { toast.error('Adjunta el comprobante de pago'); return; }
    if (processing) { toast.error('Espera, procesando imagen…'); return; }
    const fd = new FormData();
    fd.append('period', period);
    fd.append('notes', notes);
    fd.append('evidence_file', file, file.name);
    mutation.mutate(fd);
  };

  const isBusy = processing || mutation.isPending;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 space-y-4 sm:space-y-5">
      <div className="flex items-center gap-3 pb-3 sm:pb-4 border-b border-slate-100">
        <div className="w-9 h-9 rounded-xl bg-teal-50 flex items-center justify-center flex-shrink-0">
          <Receipt size={18} className="text-teal-600" />
        </div>
        <div>
          <h2 className="font-bold text-slate-800 text-sm sm:text-base">Enviar comprobante de pago</h2>
          <p className="text-xs text-slate-500">Adjunta tu evidencia para el período seleccionado</p>
        </div>
      </div>

      {/* Period selector */}
      <div>
        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1 mb-2">
          <Calendar size={11} /> Período de pago
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

      {/* File / camera area */}
      <div>
        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1 mb-2">
          <ImageIcon size={11} /> Comprobante / Evidencia
        </label>

        {/* Inputs hidden — un input por tipo para máxima compatibilidad en móvil */}
        <input
          key="file-picker"
          ref={fileInputRef}
          type="file"
          accept="image/*,.pdf,.PDF,application/pdf"
          onChange={handleFileInput}
          className="hidden"
        />
        <input
          key="camera-capture"
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileInput}
          className="hidden"
        />

        {processing ? (
          /* Estado de procesamiento / compresión */
          <div className="border-2 border-teal-200 rounded-xl p-6 flex flex-col items-center gap-2 bg-teal-50">
            <Loader2 size={28} className="animate-spin text-teal-500" />
            <p className="text-sm font-semibold text-teal-700">Procesando imagen…</p>
            <p className="text-xs text-teal-500">Optimizando para envío</p>
          </div>
        ) : file ? (
          <FilePreview file={file} onRemove={() => { setFile(null); onFileChange?.(false); }} />
        ) : (
          <div className="border-2 border-dashed border-slate-200 rounded-xl p-5 sm:p-6 text-center hover:border-teal-300 transition-colors bg-slate-50/50">
            <div className="w-12 h-12 rounded-2xl bg-teal-50 flex items-center justify-center mx-auto mb-3">
              <ImageIcon size={22} className="text-teal-500" />
            </div>
            <p className="text-sm font-semibold text-slate-600 mb-1">Adjunta tu comprobante</p>
            <p className="text-xs text-slate-400 mb-4">Foto, captura de pantalla o PDF · Máx 15 MB</p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-teal-600 text-white rounded-xl text-sm font-semibold hover:bg-teal-700 transition-colors active:scale-95 shadow-sm">
                <Upload size={15} /> Adjuntar archivo
              </button>
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 border-2 border-slate-200 bg-white text-slate-600 rounded-xl text-sm font-semibold hover:border-teal-400 hover:text-teal-600 transition-colors active:scale-95">
                <Camera size={15} /> Tomar foto
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Notes */}
      <div>
        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-2">
          Notas (opcional)
        </label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={2}
          placeholder="Ej: Transferencia del 1 de junio, banco BBVA…"
          className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none" />
      </div>

      {/* Submit */}
      <button
        type="button"
        disabled={!file || isBusy}
        onClick={handleSubmit}
        className="w-full inline-flex items-center justify-center gap-2 py-3 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-sm font-bold transition-all active:scale-95 shadow-sm">
        {isBusy
          ? <><Loader2 size={16} className="animate-spin" /> {processing ? 'Procesando…' : 'Enviando…'}</>
          : <><Send size={16} /> Enviar comprobante</>}
      </button>
    </div>
  );
}

// ─── Voucher history card ─────────────────────────────────────────────────────
function VoucherCard({ voucher, onViewEvidence }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
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
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-600 hover:text-teal-700 transition-colors">
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
          <CheckCircle size={14} className="text-emerald-500 flex-shrink-0" />
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
  const [showForm, setShowForm]           = useState(false);
  const [formHasFile, setFormHasFile]     = useState(false); // elevado de NewVoucherForm
  const [evidencePopup, setEvidencePopup] = useState(null);  // { url, fileName }

  const { data, isLoading } = useQuery({
    queryKey: ['vouchers', tenantId],
    queryFn:  () => voucherAPI.list(tenantId),
    enabled:  !!tenantId,
    select:   res => res.data?.results || res.data || [],
  });

  const vouchers  = data || [];
  const pending   = vouchers.filter(v => v.status === 'pending').length;
  const received  = vouchers.filter(v => v.status === 'received').length;

  // Cancelar y limpiar: si hay archivo seleccionado, pedir confirmación
  const handleCancel = () => {
    if (formHasFile) {
      if (!window.confirm('¿Descartar el comprobante seleccionado?')) return;
    }
    setShowForm(false);
    setFormHasFile(false);
  };

  const handleViewEvidence = (voucher) => {
    const urlPath  = voucher.evidence_file_url || '';
    const fileName = decodeURIComponent(urlPath.split('/').pop()) || 'comprobante';
    setEvidencePopup({ url: urlPath, fileName });
  };

  // Botón principal: rojo cuando hay archivo pendiente, teal cuando no
  const cancelBtnClass = formHasFile
    ? 'bg-rose-600 hover:bg-rose-700 text-white'
    : 'bg-teal-600 hover:bg-teal-700 text-white';

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-8 py-4 sm:py-5">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center shadow-md flex-shrink-0">
              <Receipt size={20} className="text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-bold text-slate-800 leading-tight">Enviar pago</h1>
              <p className="text-xs text-slate-500 truncate">{tenant?.name || 'Mi condominio'}</p>
            </div>
          </div>

          <button
            onClick={showForm ? handleCancel : () => setShowForm(true)}
            className={`flex-shrink-0 inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-sm font-semibold shadow-sm transition-all hover:shadow-md active:scale-95 ${cancelBtnClass}`}>
            {showForm
              ? <><X size={15} /><span className="hidden sm:inline">Cancelar</span><span className="sm:hidden">✕</span></>
              : <><Send size={15} /><span className="hidden sm:inline">Nuevo comprobante</span><span className="sm:hidden">Nuevo</span></>
            }
          </button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-3 sm:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6">

        {/* Stats — compactos en mobile */}
        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          {[
            { label: 'Enviados',   value: vouchers.length, color: 'text-slate-700',   bg: 'bg-slate-50',   icon: Send },
            { label: 'Pendientes', value: pending,          color: 'text-amber-600',   bg: 'bg-amber-50',   icon: Clock },
            { label: 'Recibidos',  value: received,         color: 'text-emerald-600', bg: 'bg-emerald-50', icon: CheckCircle },
          ].map(({ label, value, color, bg, icon: Icon }) => (
            <div key={label} className="bg-white rounded-xl border border-slate-200 p-3 sm:p-4 flex items-center gap-2 sm:gap-3">
              <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg ${bg} flex items-center justify-center flex-shrink-0`}>
                <Icon size={16} className={color} />
              </div>
              <div className="min-w-0">
                <div className="text-xl sm:text-2xl font-bold text-slate-800 leading-none">{value}</div>
                <div className="text-[10px] sm:text-xs text-slate-500 mt-0.5 truncate">{label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Form */}
        {showForm && (
          <NewVoucherForm
            tenantId={tenantId}
            onSuccess={() => { setShowForm(false); setFormHasFile(false); }}
            onFileChange={setFormHasFile}
          />
        )}

        {/* History */}
        <div>
          <h3 className="text-sm font-bold text-slate-700 mb-3">Mis envíos</h3>
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-slate-400">
              <Loader2 size={26} className="animate-spin mr-2" /> Cargando...
            </div>
          ) : vouchers.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Receipt size={38} className="mx-auto mb-3 opacity-30" />
              <p className="font-semibold text-sm">Aún no has enviado comprobantes</p>
              <p className="text-xs mt-1">Usa "Nuevo comprobante" para enviar tu primer pago</p>
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

      {/* Evidence popup */}
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
