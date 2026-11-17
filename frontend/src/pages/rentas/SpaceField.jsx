import React, { useEffect, useState } from 'react';
import { rentalAPI } from '../../api/client';
import { SPACE_TYPES } from './rentalUtils';

/**
 * Selector de espacio para propiedades Multi Tenant. No se muestra si la propiedad no tiene espacios
 * (Single Tenant), así que se puede colocar junto al selector de propiedad en cualquier formulario.
 */
export function useSpaces(tenantId, propertyId) {
  const [spaces, setSpaces] = useState([]);
  useEffect(() => {
    if (!tenantId || !propertyId) { setSpaces([]); return undefined; }
    let alive = true;
    rentalAPI.spaces.list(tenantId, { property: propertyId, active: '1' })
      .then(r => { if (alive) setSpaces([].concat(r.data?.results || r.data || []).filter(x => x && x.id)); })
      .catch(() => { if (alive) setSpaces([]); });
    return () => { alive = false; };
  }, [tenantId, propertyId]);
  return spaces;
}

/** Filtro de listados: aparece solo cuando la propiedad filtrada es Multi Tenant. */
export function SpaceFilter({ tenantId, propertyId, value, onChange, style }) {
  const spaces = useSpaces(tenantId, propertyId);
  if (!propertyId || spaces.length === 0) return null;
  return (
    <select className="field-input" style={{ maxWidth: 190, ...style }} value={value || ''} onChange={e => onChange(e.target.value)} aria-label="Espacio">
      <option value="">Todos los espacios</option>
      {spaces.map(s => <option key={s.id} value={s.id}>{s.code}{s.name ? ` — ${s.name}` : ''}</option>)}
    </select>
  );
}

export default function SpaceField({ tenantId, propertyId, value, onChange, disabled, label = 'Espacio (opcional)', emptyLabel = 'Toda la propiedad' }) {
  const spaces = useSpaces(tenantId, propertyId);

  if (!propertyId || spaces.length === 0) return null;
  return (
    <div className="field" style={{ margin: 0 }}>
      <label className="field-label">{label}</label>
      <select className="field-input" value={value || ''} onChange={e => onChange(e.target.value)} disabled={disabled}>
        <option value="">{emptyLabel}</option>
        {spaces.map(s => (
          <option key={s.id} value={s.id}>
            {s.code}{s.name ? ` — ${s.name}` : ''}{s.building ? ` · Bldg ${s.building}` : ''}{s.space_type ? ` · ${SPACE_TYPES[s.space_type] || ''}` : ''}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Dato `space` para el payload: al editar permite quitarlo (null); al crear, omitirlo deja que herede del equipo. */
export const spacePayload = (form) => (form.space ? { space: form.space } : (form.id ? { space: null } : {}));

/** Texto corto "L-101" para tablas. */
export const spaceTag = (row) => (row?.space_code ? ` / ${row.space_code}` : '');
