import React, { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Camera, FileText, Paperclip, X } from 'lucide-react';
import api from '../../api/client';
import { errMsg } from './opsUi';

const IMG = /\.(png|jpe?g|webp|gif|heic)$/i;

/** Descarga el archivo con la sesión (los medios requieren autenticación) y lo abre. */
export async function openProtected(url) {
  try {
    const res = await api.get(url, { responseType: 'blob' });
    window.open(URL.createObjectURL(res.data), '_blank');
  } catch (e) {
    toast.error(errMsg(e, 'No se pudo abrir el archivo'));
  }
}

function Thumb({ file, onRemove }) {
  const isImg = IMG.test(file.original_name || '');
  const [src, setSrc] = useState(null);
  useEffect(() => {
    if (!isImg || !file.file_url) return undefined;
    let url; let alive = true;
    api.get(file.file_url, { responseType: 'blob' }).then(r => {
      if (!alive) return;
      url = URL.createObjectURL(r.data);
      setSrc(url);
    }).catch(() => {});
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [file.file_url, isImg]);

  return (
    <div className="ev-thumb" title={[file.original_name, file.notes].filter(Boolean).join(' · ')}>
      <button type="button" className="ev-thumb-btn" onClick={() => openProtected(file.file_url)}>
        {isImg && src ? <img src={src} alt={file.original_name} />
          : <span className="ev-thumb-file"><FileText size={20} /><small>{(file.original_name || 'archivo').slice(0, 16)}</small></span>}
      </button>
      {file.notes && <div className="ev-thumb-note">{file.notes}</div>}
      {onRemove && <button type="button" className="ev-thumb-x" onClick={() => onRemove(file)} aria-label="Quitar"><X size={11} /></button>}
    </div>
  );
}

/**
 * Galería de evidencias (fotos y archivos) con carga.
 * files: [{id, original_name, notes, file_url}]
 * onUpload(File, notes) → Promise ; onRemove(file) → Promise (omitir = solo lectura)
 */
export default function EvidenceFiles({ files = [], onUpload, onRemove, label, compact, emptyText, showNote = true }) {
  const photoRef = useRef(null);
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  const pick = async (list) => {
    const arr = Array.from(list || []);
    if (!arr.length || !onUpload) return;
    setBusy(true);
    try {
      for (const f of arr) { await onUpload(f, note.trim()); } // eslint-disable-line no-await-in-loop
      setNote('');
      toast.success(arr.length > 1 ? `${arr.length} archivos cargados` : 'Evidencia cargada');
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo subir'));
    } finally {
      setBusy(false);
      if (photoRef.current) photoRef.current.value = '';
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const remove = async (f) => {
    if (!window.confirm('¿Quitar esta evidencia?')) return;
    try { await onRemove(f); } catch (e) { toast.error(errMsg(e, 'No se pudo eliminar')); }
  };

  return (
    <div className={`ev-box ${compact ? 'compact' : ''}`}>
      {label && <div className="field-label" style={{ marginBottom: 6 }}>{label}{files.length ? ` · ${files.length}` : ''}</div>}
      {files.length === 0 && !onUpload && <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>{emptyText || 'Sin evidencias.'}</div>}
      {files.length > 0 && (
        <div className="ev-grid">
          {files.map(f => <Thumb key={f.id} file={f} onRemove={onRemove ? remove : null} />)}
        </div>
      )}
      {onUpload && (
        <div className="ev-actions">
          {showNote && <input className="field-input ev-note" value={note} onChange={e => setNote(e.target.value)} placeholder="Nota de la evidencia (opcional)" />}
          <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => photoRef.current?.click()}>
            <Camera size={13} /> {busy ? 'Subiendo…' : 'Foto'}
          </button>
          <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => fileRef.current?.click()}>
            <Paperclip size={13} /> Archivo
          </button>
          <input ref={photoRef} type="file" hidden multiple accept="image/*" capture="environment" onChange={e => pick(e.target.files)} />
          <input ref={fileRef} type="file" hidden multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.heic,.doc,.docx,.xls,.xlsx" onChange={e => pick(e.target.files)} />
        </div>
      )}
    </div>
  );
}
