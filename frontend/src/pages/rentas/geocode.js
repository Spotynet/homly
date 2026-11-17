/**
 * Geocodificación de direcciones con Nominatim (OpenStreetMap), consultada desde el navegador.
 * Política de uso: máx. 1 consulta por segundo, así que todas pasan por una cola.
 */
const ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const GAP_MS = 1100;

let chain = Promise.resolve();
let lastAt = 0;

const wait = (ms) => new Promise(r => setTimeout(r, ms));

function queued(fn) {
  const run = chain.then(async () => {
    const delta = Date.now() - lastAt;
    if (delta < GAP_MS) await wait(GAP_MS - delta);
    try { return await fn(); } finally { lastAt = Date.now(); }
  });
  chain = run.catch(() => undefined);
  return run;
}

async function search(params) {
  const qs = new URLSearchParams({ format: 'jsonv2', limit: '1', addressdetails: '0', 'accept-language': 'es', ...params });
  const res = await fetch(`${ENDPOINT}?${qs}`, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  const rows = await res.json();
  if (!Array.isArray(rows) || !rows.length) return null;
  const lat = Number(rows[0].lat);
  const lng = Number(rows[0].lon);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng, label: rows[0].display_name || '' } : null;
}

/**
 * Busca la propiedad por su dirección, de lo más preciso a lo más general.
 * Devuelve { lat, lng, precision: 'exacta' | 'codigo_postal' | 'ciudad', label } o null.
 */
export async function geocodeProperty(p) {
  const cc = (p.country_code || '').toLowerCase();
  const base = cc ? { countrycodes: cc } : {};
  const street = [p.street, p.ext_number].filter(Boolean).join(' ').trim();
  const city = p.city || p.municipality || '';
  const attempts = [];

  if (street && (city || p.postal_code)) {
    attempts.push(['exacta', {
      ...base, street, ...(city ? { city } : {}), ...(p.state ? { state: p.state } : {}),
      ...(p.postal_code ? { postalcode: p.postal_code } : {}), ...(p.country ? { country: p.country } : {}),
    }]);
    if (p.neighborhood && city) {
      attempts.push(['exacta', { ...base, q: `${street}, ${p.neighborhood}, ${city}, ${p.state || ''}, ${p.country || ''}` }]);
    }
  }
  if (p.postal_code) {
    attempts.push(['codigo_postal', { ...base, postalcode: p.postal_code, ...(p.country ? { country: p.country } : {}) }]);
  }
  if (city) {
    attempts.push(['ciudad', { ...base, city, ...(p.state ? { state: p.state } : {}), ...(p.country ? { country: p.country } : {}) }]);
  }

  for (const [precision, params] of attempts) {
    const hit = await queued(() => search(params));
    if (hit) return { ...hit, precision };
  }
  return null;
}

export const PRECISION_LABEL = {
  exacta: 'Dirección exacta',
  codigo_postal: 'Centro del código postal (aprox.)',
  ciudad: 'Centro de la ciudad (aprox.)',
};

export const hasAddressData = (p) => !!(p.city || p.municipality || p.postal_code);
