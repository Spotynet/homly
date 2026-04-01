/**
 * SendEmailModal — Popup reutilizable para seleccionar destinatarios de correo.
 *
 * Muestra los correos configurados en la unidad (propietario, copropietario, inquilino)
 * como checkboxes y llama a onSend con el arreglo de emails seleccionados.
 *
 * Props:
 *   unit       – Unit object (owner_email, coowner_email, tenant_email)
 *   title      – Título del modal (default: 'Enviar por Email')
 *   isSending  – boolean (estado de carga mientras se envía)
 *   onSend     – (emails: string[]) => void
 *   onClose    – () => void
 */
import React, { useState } from 'react';
import { Mail, Send, X } from 'lucide-react';

export default function SendEmailModal({ unit, title = 'Enviar por Email', isSending, onSend, onClose }) {
  // Construir lista de destinatarios disponibles
  const candidates = [
    unit?.owner_email?.trim()   ? { key: 'owner',   label: 'Propietario',   email: unit.owner_email.trim() }   : null,
    unit?.coowner_email?.trim() ? { key: 'coowner', label: 'Copropietario', email: unit.coowner_email.trim() } : null,
    unit?.tenant_email?.trim()  ? { key: 'tenant',  label: 'Inquilino',     email: unit.tenant_email.trim() }  : null,
  ].filter(Boolean);

  // Pre-seleccionar todos los disponibles
  const [selected, setSelected] = useState(() => new Set(candidates.map(c => c.email)));

  const toggle = (email) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  };

  const handleSend = () => {
    const emails = candidates.map(c => c.email).filter(e => selected.has(e));
    if (!emails.length) return;
    onSend(emails);
  };

  return (
    <div className="modal-bg open" style={{ zIndex: 1100 }} onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420, width: '92vw' }}>

        {/* Encabezado */}
        <div className="modal-head">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Mail size={16} /> {title}
          </h3>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>

        {/* Cuerpo */}
        <div className="modal-body" style={{ padding: '18px 20px' }}>
          {candidates.length === 0 ? (
            /* Sin correos configurados */
            <div style={{ textAlign: 'center', padding: '28px 0', color: 'var(--ink-400)' }}>
              <Mail size={38} style={{ marginBottom: 12, opacity: 0.35 }} />
              <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--ink-600)' }}>
                Sin correos configurados
              </p>
              <p style={{ margin: '6px 0 0', fontSize: 12 }}>
                Agrega correos en la configuración de la unidad para poder enviar documentos.
              </p>
            </div>
          ) : (
            <>
              <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--ink-500)' }}>
                Selecciona las cuentas de correo a las que deseas enviar:
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {candidates.map(c => {
                  const isChecked = selected.has(c.email);
                  return (
                    <label
                      key={c.key}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        cursor: 'pointer', padding: '10px 12px', borderRadius: 8,
                        background: isChecked ? 'var(--teal-50)' : 'var(--sand-50)',
                        border: `1.5px solid ${isChecked ? 'var(--teal-200)' : 'var(--sand-200)'}`,
                        transition: 'background 0.15s, border-color 0.15s',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggle(c.email)}
                        style={{ width: 16, height: 16, accentColor: 'var(--teal-500)', cursor: 'pointer', flexShrink: 0 }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-700)', lineHeight: 1.3 }}>
                          {c.label}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--ink-400)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>
                          {c.email}
                        </div>
                      </div>
                      {isChecked && (
                        <span style={{ fontSize: 11, color: 'var(--teal-600)', fontWeight: 600, flexShrink: 0 }}>✓</span>
                      )}
                    </label>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Pie — solo si hay candidatos */}
        {candidates.length > 0 && (
          <div className="modal-foot" style={{ gap: 8 }}>
            <button className="btn btn-secondary" onClick={onClose} disabled={isSending}>
              Cancelar
            </button>
            <button
              className="btn btn-primary"
              onClick={handleSend}
              disabled={isSending || selected.size === 0}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Send size={14} />
              {isSending
                ? 'Enviando…'
                : `Enviar${selected.size > 0 ? ` (${selected.size})` : ''}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
