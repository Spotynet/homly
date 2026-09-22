import React, { useEffect, useState } from 'react';
import { providersAPI } from '../../api/client';

/**
 * Dropdown of catalog providers visible in a given module.
 * allowOther: free-text fallback. Planeación uses catalog-only selection.
 */
export default function ProviderSelect({
  tenantId,
  moduleKey,
  providerId,
  name,
  rfc,
  disabled,
  onChange,
  nameLabel = 'Nombre',
  showRfc = true,
  allowOther = true,
  required = false,
  extraAfter,
}) {
  const [options, setOptions] = useState([]);
  const selected = providerId
    ? String(providerId)
    : (allowOther && name ? '__other' : '');

  useEffect(() => {
    if (!tenantId) return;
    providersAPI.options(tenantId, { module: moduleKey })
      .then(r => setOptions(Array.isArray(r.data) ? r.data : []))
      .catch(() => setOptions([]));
  }, [tenantId, moduleKey]);

  const pick = (value) => {
    if (!value) {
      onChange({ provider: null, provider_id: '', name: '', rfc: '' });
      return;
    }
    if (allowOther && value === '__other') {
      onChange({ provider: null, provider_id: '', name: name || '', rfc: rfc || '' });
      return;
    }
    const p = options.find(o => String(o.id) === String(value));
    if (!p) {
      onChange({ provider: null, provider_id: '', name: '', rfc: '' });
      return;
    }
    onChange({
      provider: p.id,
      provider_id: p.id,
      name: p.display_name || '',
      rfc: p.rfc || '',
      contact: p.contact_name || p.legal_rep_name || '',
      phone: p.phone || p.mobile || '',
      email: p.email || '',
    });
  };

  return (
    <>
      <div className={required ? 'field field-full' : 'field'}>
        <label className="field-label">
          Proveedor{required ? ' *' : ''}
        </label>
        <select
          className="field-select"
          value={selected}
          disabled={disabled}
          onChange={e => pick(e.target.value)}
        >
          <option value="">{required ? '— Selecciona un proveedor —' : '— Sin proveedor —'}</option>
          {providerId && !options.some(o => String(o.id) === String(providerId)) && (
            <option value={providerId}>{name || 'Proveedor actual'}</option>
          )}
          {options.map(p => (
            <option key={p.id} value={p.id}>
              {p.display_name}{p.rfc ? ` · ${p.rfc}` : ''}
            </option>
          ))}
          {allowOther && <option value="__other">Otro (escribir)</option>}
        </select>
        {!allowOther && options.length === 0 && (
          <div style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 6 }}>
            No hay proveedores activos para este módulo. Regístralos en Configuración → Proveedores.
          </div>
        )}
      </div>
      {allowOther && selected === '__other' && (
        <div className="field">
          <label className="field-label">{nameLabel}</label>
          <input
            className="field-input"
            value={name || ''}
            disabled={disabled}
            placeholder="Nombre del proveedor"
            onChange={e => onChange({ provider: null, provider_id: '', name: e.target.value, rfc })}
          />
        </div>
      )}
      {showRfc && (allowOther || providerId) && (
        <div className="field">
          <label className="field-label">RFC</label>
          <input
            className="field-input"
            style={{ fontFamily: 'monospace' }}
            value={rfc || ''}
            disabled={disabled || !allowOther}
            placeholder="RFC"
            onChange={e => onChange({
              provider: providerId || null,
              provider_id: providerId || '',
              name,
              rfc: e.target.value,
            })}
          />
        </div>
      )}
      {extraAfter}
    </>
  );
}
