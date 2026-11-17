import React, { useEffect, useMemo, useRef, useState } from 'react';
import { geoAPI } from '../../api/client';

/**
 * Ubicación guiada: país → estado/región → código postal → (municipio/delegación, ciudad y colonia
 * según el código postal) → calle y números. Los datos de cada país vienen de /api/geo/ (GeoNames).
 * Se coloca dentro de un `.form-grid`; actualiza el formulario con `onChange(patch)`.
 */

const FEATURED = ['MX', 'US', 'CO', 'ES', 'AR', 'CL', 'PE', 'BR', 'CA', 'PA', 'CR', 'GT', 'EC', 'UY', 'DO'];

// Etiquetas por país; el resto usa las genéricas
const LABELS = {
  MX: { state: 'Estado', postal: 'Código postal (C.P.)', municipality: 'Delegación / Municipio', neighborhood: 'Colonia' },
  US: { state: 'Estado', postal: 'ZIP code', municipality: 'Condado / Municipio', neighborhood: 'Barrio / Localidad' },
  CO: { state: 'Departamento', postal: 'Código postal', municipality: 'Municipio', neighborhood: 'Barrio' },
  ES: { state: 'Provincia / Comunidad', postal: 'Código postal', municipality: 'Municipio', neighborhood: 'Barrio / Localidad' },
  AR: { state: 'Provincia', postal: 'Código postal', municipality: 'Partido / Departamento', neighborhood: 'Barrio / Localidad' },
  CL: { state: 'Región', postal: 'Código postal', municipality: 'Comuna', neighborhood: 'Barrio / Localidad' },
  PE: { state: 'Departamento', postal: 'Código postal', municipality: 'Distrito', neighborhood: 'Urbanización / Localidad' },
  CA: { state: 'Provincia', postal: 'Código postal', municipality: 'Municipio', neighborhood: 'Barrio / Localidad' },
  BR: { state: 'Estado', postal: 'CEP', municipality: 'Municipio', neighborhood: 'Bairro / Localidad' },
};
const GENERIC = { state: 'Estado / Región', postal: 'Código postal', municipality: 'Municipio / Distrito', neighborhood: 'Colonia / Barrio / Localidad' };

let countriesPromise = null;
const regionsCache = new Map();

const loadCountries = () => {
  if (!countriesPromise) countriesPromise = geoAPI.countries().then(r => r.data || []).catch(() => { countriesPromise = null; return []; });
  return countriesPromise;
};
const loadRegions = (cc) => {
  if (!regionsCache.has(cc)) regionsCache.set(cc, geoAPI.regions(cc).then(r => r.data || []).catch(() => []));
  return regionsCache.get(cc);
};

let displayNames = null;
const countryName = (c) => {
  try {
    if (!displayNames) displayNames = new Intl.DisplayNames(['es'], { type: 'region' });
    return displayNames.of(c.code) || c.name_en;
  } catch { return c.name_en; }
};

const norm = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

function formatHint(fmt) {
  if (!fmt) return '';
  const n = (fmt.match(/#/g) || []).length;
  return n && !/[A-Z@]/.test(fmt) ? `${n} dígitos` : fmt.replace(/#/g, '0').replace(/@/g, 'A');
}

export default function AddressFields({ form, onChange }) {
  const cc = form.country_code || '';
  const [countries, setCountries] = useState([]);
  const [regions, setRegions] = useState([]);
  const [places, setPlaces] = useState([]);
  const [postalState, setPostalState] = useState({ status: 'idle', msg: '' });
  const seq = useRef(0);
  const label = LABELS[cc] || GENERIC;

  useEffect(() => { loadCountries().then(setCountries); }, []);
  useEffect(() => {
    if (!cc) { setRegions([]); return; }
    let alive = true;
    loadRegions(cc).then(r => { if (alive) setRegions(r); });
    return () => { alive = false; };
  }, [cc]);

  const countryOptions = useMemo(() => {
    const list = countries.map(c => ({ ...c, name: countryName(c) }));
    const byName = (a, b) => a.name.localeCompare(b.name, 'es');
    const featured = FEATURED.map(code => list.find(c => c.code === code)).filter(Boolean);
    const rest = list.filter(c => !FEATURED.includes(c.code)).sort(byName);
    return { featured, rest };
  }, [countries]);
  const current = countries.find(c => c.code === cc);

  const runLookup = async (code, { fill }) => {
    const id = ++seq.current;
    setPostalState({ status: 'loading', msg: '' });
    try {
      const { data } = await geoAPI.postal(cc, code);
      if (id !== seq.current) return;
      if (!data.found) {
        setPlaces([]);
        setPostalState({
          status: 'missing',
          msg: data.has_postal_data
            ? 'No encontramos ese código postal. Revisa el número o captura la ubicación a mano.'
            : 'Este país no tiene catálogo de códigos postales: captura municipio, ciudad y colonia a mano.',
        });
        return;
      }
      setPlaces(data.places || []);
      setPostalState({ status: 'ok', msg: '' });
      if (!fill) return;
      const regionName = data.state?.name || '';
      const match = regions.find(r => (data.state?.code && r.code === data.state.code) || norm(r.name) === norm(regionName));
      const patch = {
        state: match?.name || regionName || form.state,
        municipality: data.municipality || '',
        city: data.city || '',
        neighborhood: (data.places || []).length === 1 ? data.places[0] : ((data.places || []).includes(form.neighborhood) ? form.neighborhood : ''),
      };
      onChange(patch);
    } catch {
      if (id === seq.current) setPostalState({ status: 'idle', msg: '' });
    }
  };

  // Al editar una propiedad: cargar las colonias del C.P. sin pisar lo capturado
  const loadedFor = useRef('');
  useEffect(() => {
    const key = `${cc}|${form.postal_code || ''}`;
    if (!cc || !form.postal_code || loadedFor.current === key) return undefined;
    loadedFor.current = key;
    if (!form.id) return undefined;
    runLookup(form.postal_code, { fill: false });
    return undefined;
  }, [cc, form.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const timer = useRef(null);
  const onPostal = (value) => {
    onChange({ postal_code: value });
    clearTimeout(timer.current);
    const v = value.trim();
    if (!cc || v.length < 3) { setPlaces([]); setPostalState({ status: 'idle', msg: '' }); return; }
    timer.current = setTimeout(() => { loadedFor.current = `${cc}|${v}`; runLookup(v, { fill: true }); }, 450);
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  const onCountry = (code) => {
    clearTimeout(timer.current);
    seq.current += 1;
    const c = countries.find(x => x.code === code);
    setPlaces([]);
    setPostalState({ status: 'idle', msg: '' });
    loadedFor.current = '';
    onChange({
      country_code: code, country: c ? countryName(c) : '',
      state: '', postal_code: '', municipality: '', city: '', neighborhood: '',
    });
  };

  const stateKnown = !form.state || regions.some(r => r.name === form.state);

  return (
    <>
      <div className="field">
        <label className="field-label">País</label>
        <select className="field-select" value={cc} onChange={e => onCountry(e.target.value)}>
          <option value="">Selecciona el país…</option>
          {countryOptions.featured.length > 0 && (
            <optgroup label="Frecuentes">
              {countryOptions.featured.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
            </optgroup>
          )}
          <optgroup label="Todos los países">
            {countryOptions.rest.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
          </optgroup>
        </select>
      </div>

      <div className="field">
        <label className="field-label">{label.state}</label>
        {regions.length > 0 ? (
          <select className="field-select" value={form.state || ''} onChange={e => onChange({ state: e.target.value })} disabled={!cc}>
            <option value="">{cc ? `Selecciona (${label.state.toLowerCase()})…` : 'Primero elige el país'}</option>
            {!stateKnown && <option value={form.state}>{form.state}</option>}
            {regions.map(r => <option key={`${r.code}-${r.name}`} value={r.name}>{r.name}</option>)}
          </select>
        ) : (
          <input className="field-input" value={form.state || ''} onChange={e => onChange({ state: e.target.value })} disabled={!cc} placeholder={cc ? '' : 'Primero elige el país'} />
        )}
      </div>

      <div className="field">
        <label className="field-label">{label.postal}</label>
        <input
          className="field-input" value={form.postal_code || ''} onChange={e => onPostal(e.target.value)} disabled={!cc}
          maxLength={12} inputMode="text" autoComplete="postal-code"
          placeholder={cc ? (formatHint(current?.postal_format) || '') : 'Primero elige el país'}
        />
        <div style={{ fontSize: 11, marginTop: 4, color: postalState.status === 'missing' ? 'var(--amber-700)' : 'var(--ink-400)' }}>
          {postalState.status === 'loading' ? 'Buscando…'
            : postalState.status === 'ok' ? 'Código postal encontrado: se completaron municipio, ciudad y colonia.'
              : postalState.msg || (cc ? 'Al escribirlo se completan municipio, ciudad y colonia.' : '')}
        </div>
      </div>

      <div className="field">
        <label className="field-label">{label.municipality}</label>
        <input className="field-input" value={form.municipality || ''} onChange={e => onChange({ municipality: e.target.value })} disabled={!cc} />
      </div>
      <div className="field">
        <label className="field-label">Ciudad</label>
        <input className="field-input" value={form.city || ''} onChange={e => onChange({ city: e.target.value })} disabled={!cc} />
      </div>
      <div className="field">
        <label className="field-label">{label.neighborhood}</label>
        <input
          className="field-input" list="addr-places" value={form.neighborhood || ''} onChange={e => onChange({ neighborhood: e.target.value })}
          disabled={!cc} placeholder={places.length > 1 ? `Elige entre ${places.length} opciones o escribe` : ''}
        />
        <datalist id="addr-places">
          {places.map(p => <option key={p} value={p} />)}
        </datalist>
        {places.length > 1 && <div style={{ fontSize: 11, marginTop: 4, color: 'var(--ink-400)' }}>{places.length} {label.neighborhood.split(' ')[0].toLowerCase()}s comparten este código: elige la tuya.</div>}
      </div>

      <div className="field">
        <label className="field-label">Calle</label>
        <input className="field-input" value={form.street || ''} onChange={e => onChange({ street: e.target.value })} />
      </div>
      <div className="field">
        <label className="field-label">No. ext.</label>
        <input className="field-input" value={form.ext_number || ''} onChange={e => onChange({ ext_number: e.target.value })} />
      </div>
      <div className="field">
        <label className="field-label">No. int.</label>
        <input className="field-input" value={form.int_number || ''} onChange={e => onChange({ int_number: e.target.value })} />
      </div>
    </>
  );
}
