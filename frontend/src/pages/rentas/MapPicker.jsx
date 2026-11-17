import React, { useEffect, useRef, useState } from 'react';
import { Crosshair, MapPin, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { L, baseLayer, pinIcon, round6, validCoords } from './mapBase';
import { PRECISION_LABEL, geocodeProperty, hasAddressData } from './geocode';

/**
 * Ubicación en el mapa dentro del formulario de la propiedad: se puede buscar por la dirección
 * capturada, hacer clic en el mapa o arrastrar el pin. Actualiza `latitude` y `longitude`.
 */
export default function MapPicker({ form, onChange }) {
  const el = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const changeRef = useRef(onChange);
  changeRef.current = onChange;
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const has = validCoords(form.latitude, form.longitude);

  const put = (lat, lng) => changeRef.current({ latitude: round6(lat), longitude: round6(lng) });

  useEffect(() => {
    if (!el.current || mapRef.current) return undefined;
    const map = L.map(el.current, { scrollWheelZoom: false }).setView([23.6, -102.5], 4);
    baseLayer('calle').addTo(map);
    map.on('click', e => { map.scrollWheelZoom.enable(); put(e.latlng.lat, e.latlng.lng); setNote(''); });
    map.on('mouseout', () => map.scrollWheelZoom.disable());
    mapRef.current = map;
    const t = setTimeout(() => map.invalidateSize(), 80);
    return () => { clearTimeout(t); map.remove(); mapRef.current = null; markerRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!has) {
      if (markerRef.current) { map.removeLayer(markerRef.current); markerRef.current = null; }
      return;
    }
    const ll = [Number(form.latitude), Number(form.longitude)];
    if (!markerRef.current) {
      markerRef.current = L.marker(ll, { icon: pinIcon({ selected: true }), draggable: true }).addTo(map);
      markerRef.current.on('dragend', ev => { const p = ev.target.getLatLng(); put(p.lat, p.lng); setNote(''); });
      map.setView(ll, 16);
    } else {
      markerRef.current.setLatLng(ll);
      if (!map.getBounds().contains(ll)) map.panTo(ll);
    }
  }, [form.latitude, form.longitude, has]);

  const search = async () => {
    if (!hasAddressData(form)) { toast.error('Captura al menos la ciudad o el código postal.'); return; }
    setBusy(true);
    try {
      const hit = await geocodeProperty(form);
      if (!hit) { toast.error('No encontramos esa dirección. Haz clic en el mapa para colocar el pin.'); return; }
      put(hit.lat, hit.lng);
      setNote(`${PRECISION_LABEL[hit.precision]}. Arrastra el pin si necesitas más precisión.`);
      mapRef.current?.setView([hit.lat, hit.lng], hit.precision === 'exacta' ? 17 : 14);
    } catch { toast.error('No se pudo consultar el servicio de mapas.'); } finally { setBusy(false); }
  };

  return (
    <div className="mp" style={{ gridColumn: '1 / -1' }}>
      <div className="mp-head">
        <label className="field-label" style={{ margin: 0 }}><MapPin size={13} style={{ verticalAlign: '-2px' }} /> Ubicación en el mapa</label>
        <div className="mp-btns">
          <button type="button" className="btn btn-outline btn-sm" onClick={search} disabled={busy}>
            <Crosshair size={12} /> {busy ? 'Buscando…' : 'Ubicar por la dirección'}
          </button>
          {has && (
            <button type="button" className="btn btn-outline btn-sm" onClick={() => { onChange({ latitude: null, longitude: null }); setNote(''); }}>
              <Trash2 size={12} /> Quitar
            </button>
          )}
        </div>
      </div>
      <div ref={el} className="mp-map" />
      <div className="mp-foot">
        {has
          ? <span>Latitud {Number(form.latitude).toFixed(6)} · Longitud {Number(form.longitude).toFixed(6)}</span>
          : <span>Sin ubicación. Usa el botón, haz clic en el mapa o arrastra el pin. Se usa en el mapa del dashboard.</span>}
        {note && <span className="mp-note">{note}</span>}
      </div>
    </div>
  );
}
