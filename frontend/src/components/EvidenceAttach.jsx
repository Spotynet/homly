/**
 * Adjuntar uno o varios comprobantes de evidencia de pago.
 */
import React from 'react';
import { Upload } from 'lucide-react';
import toast from 'react-hot-toast';

function readFileAsEvidence(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = String(reader.result || '').split(',')[1] || '';
      resolve({ data: base64, mime: file.type, name: file.name });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function EvidenceAttach({ files = [], onChange, disabled = false, compact = false, onPreview }) {
  const handleFiles = async (e) => {
    const picked = Array.from(e.target.files || []);
    e.target.value = '';
    if (!picked.length) return;
    const accepted = [];
    for (const file of picked) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error(`${file.name}: máximo 5 MB`);
        continue;
      }
      accepted.push(file);
    }
    if (!accepted.length) return;
    try {
      const entries = await Promise.all(accepted.map(readFileAsEvidence));
      onChange([...(files || []), ...entries]);
    } catch {
      toast.error('No se pudo leer uno de los archivos');
    }
  };

  const removeAt = (idx) => onChange(files.filter((_, i) => i !== idx));

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <label className="btn btn-secondary btn-sm" style={{ cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1 }}>
          <Upload size={14} style={{ display: 'inline', verticalAlign: -2 }} /> Adjuntar comprobantes
          <input
            type="file"
            multiple
            disabled={disabled}
            style={{ display: 'none' }}
            accept="image/*,application/pdf,.doc,.docx,.odt,.ods,.odp,.xls,.xlsx,.csv,.ppt,.pptx,.txt,.rtf"
            onChange={handleFiles}
          />
        </label>
        {files.length === 0 && (
          <span style={{ fontSize: 12, color: 'var(--ink-300)' }}>
            Puedes adjuntar varios archivos — máx. 5 MB c/u
          </span>
        )}
        {files.length > 0 && (
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--blue-700)' }}>
            {files.length} comprobante{files.length === 1 ? '' : 's'}
          </span>
        )}
      </div>
      {files.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 4 : 6, marginTop: 8 }}>
          {files.map((ev, idx) => {
            const isImg = ev.mime && ev.mime.startsWith('image/');
            const isPdfEv = ev.mime === 'application/pdf' || /\.pdf$/i.test(ev.name || '');
            const evIcon = isImg ? '🖼️' : isPdfEv ? '📄' : '📎';
            return (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--blue-50)', border: '1px solid var(--blue-100)', padding: compact ? '5px 10px' : '6px 12px', borderRadius: 'var(--radius-sm)' }}>
                <span style={{ flexShrink: 0, fontSize: 15 }}>{evIcon}</span>
                <span style={{ fontSize: 12, color: 'var(--blue-600)', fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {ev.name || `Comprobante ${idx + 1}`}
                </span>
                {onPreview && (
                  <button type="button" className="btn btn-secondary btn-sm" style={{ padding: '3px 8px', fontSize: 11, flexShrink: 0 }}
                    onClick={() => onPreview(ev, idx)}>Ver</button>
                )}
                {!disabled && (
                  <button type="button" className="btn-ghost" style={{ color: 'var(--coral-500)', padding: 0, flexShrink: 0 }}
                    onClick={() => removeAt(idx)}>✕</button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
