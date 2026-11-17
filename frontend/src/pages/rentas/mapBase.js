import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

/** Capas base gratuitas (OpenStreetMap y Esri World Imagery). Las teselas se piden desde el navegador. */
export const BASE_LAYERS = {
  calle: {
    label: 'Mapa',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    options: { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>' },
  },
  satelite: {
    label: 'Satélite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    options: { maxZoom: 19, attribution: 'Imágenes &copy; Esri, Maxar, Earthstar Geographics' },
  },
};

export function baseLayer(key) {
  const def = BASE_LAYERS[key] || BASE_LAYERS.calle;
  return L.tileLayer(def.url, def.options);
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Pin de color (sin imágenes externas) con insignia opcional de pendientes. */
export function pinIcon({ color = '#2A9D73', badge = 0, selected = false, ghost = false }) {
  const b = badge > 0 ? `<b class="pm-badge">${badge > 99 ? '99+' : esc(badge)}</b>` : '';
  return L.divIcon({
    className: 'pm-pin-wrap',
    html: `<span class="pm-pin${selected ? ' sel' : ''}${ghost ? ' ghost' : ''}" style="--c:${esc(color)}"><i></i>${b}</span>`,
    iconSize: [30, 38],
    iconAnchor: [15, 34],
    tooltipAnchor: [0, -32],
  });
}

export function validCoords(lat, lng) {
  const a = Number(lat);
  const b = Number(lng);
  return lat !== null && lat !== undefined && lat !== '' && lng !== null && lng !== undefined && lng !== ''
    && Number.isFinite(a) && Number.isFinite(b) && Math.abs(a) <= 90 && Math.abs(b) <= 180;
}

export const round6 = (n) => Math.round(Number(n) * 1e6) / 1e6;

export { L };
