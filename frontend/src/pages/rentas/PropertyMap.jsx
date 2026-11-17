import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Crosshair, ExternalLink, Layers, LocateFixed, MapPin, Move, Navigation, Pencil, Search, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { rentalAPI } from '../../api/client';
import { PROPERTY_GROUPS } from './rentalUtils';
import { COLORS, money0 } from './dashUi';
import { BASE_LAYERS, L, baseLayer, pinIcon, round6, validCoords } from './mapBase';
import { PRECISION_LABEL, geocodeProperty, hasAddressData } from './geocode';

const HEALTH = {
  ok: { label: 'Sin pendientes', color: COLORS.teal },
  atencion: { label: 'Por vigilar', color: COLORS.amber },
  critico: { label: 'Requiere atención', color: COLORS.coral },
};
const OCC = {
  llena: { label: 'Ocupada al 100 %', color: COLORS.teal },
  parcial: { label: 'Ocupación parcial', color: COLORS.amber },
  vacia: { label: 'Vacante', color: COLORS.coral },
  operacion: { label: 'Solo operación', color: COLORS.purple },
};
const GROUP_COLORS = {
  residencial: COLORS.teal, corta_estancia: COLORS.coral, comercial: COLORS.blue,
  industrial: COLORS.purple, otros: COLORS.amber,
};
const COLOR_MODES = [
  { key: 'salud', label: 'Estado' },
  { key: 'ocupacion', label: 'Ocupación' },
  { key: 'tipo', label: 'Tipo' },
];
const FOCUS = [
  { key: '', label: 'Todas las propiedades' },
  { key: 'alertas', label: 'Con alertas' },
  { key: 'vacantes', label: 'Con unidades vacantes' },
  { key: 'ordenes', label: 'Con órdenes abiertas' },
  { key: 'solicitudes', label: 'Con solicitudes abiertas' },
  { key: 'adeudos', label: 'Con adeudos' },
  { key: 'activos', label: 'Con equipos fuera de operación' },
];

const alertsOf = p => (p.late_orders || 0) + (p.delinquent || 0) + (p.assets_down || 0);
const norm = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function occKey(p) {
  if (!p.leasable) return 'operacion';
  if (p.occupied >= p.units) return 'llena';
  return p.occupied > 0 ? 'parcial' : 'vacia';
}
function colorOf(p, mode) {
  if (mode === 'ocupacion') return OCC[occKey(p)].color;
  if (mode === 'tipo') return GROUP_COLORS[p.type_group] || COLORS.ink;
  return HEALTH[p.health]?.color || COLORS.teal;
}
function matchFocus(p, f) {
  switch (f) {
    case 'alertas': return p.health === 'critico';
    case 'vacantes': return p.vacant > 0;
    case 'ordenes': return p.open_orders > 0;
    case 'solicitudes': return p.open_requests > 0;
    case 'adeudos': return p.overdue_amount > 0;
    case 'activos': return p.assets_down > 0;
    default: return true;
  }
}

export default function PropertyMap({ tenantId, go, canWrite, off = [] }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [mode, setMode] = useState('salud');
  const [group, setGroup] = useState('');
  const [focus, setFocus] = useState('');
  const [q, setQ] = useState('');
  const [base, setBase] = useState('calle');
  const [selectedId, setSelectedId] = useState(null);
  const [moving, setMoving] = useState(false);     // pin arrastrable de la propiedad seleccionada
  const [placing, setPlacing] = useState(false);   // el siguiente clic en el mapa fija la ubicación
  const [busy, setBusy] = useState(false);
  const [auto, setAuto] = useState(null);          // progreso de "Ubicar automáticamente"

  const mapEl = useRef(null);
  const mapRef = useRef(null);
  const tileRef = useRef(null);
  const layerRef = useRef(null);
  const placingRef = useRef({ on: false, id: null });
  const saveRef = useRef(null);
  const abortAuto = useRef(false);

  const load = useCallback(() => {
    if (!tenantId) return Promise.resolve();
    return rentalAPI.map(tenantId)
      .then(r => { setData(r.data); setError(''); })
      .catch(() => setError('No se pudo cargar el mapa.'));
  }, [tenantId]);
  useEffect(() => { load(); }, [load]);

  const currency = data?.currency || 'MXN';
  const showRent = data?.leasing_enabled !== false && !off.includes('rentas_rentroll');
  const showDebt = data?.leasing_enabled !== false && !off.includes('rentas_cobranza');
  const showLease = data?.leasing_enabled !== false;

  const points = useMemo(() => data?.points || [], [data]);
  const filtered = useMemo(() => {
    const nq = norm(q.trim());
    return points.filter(p => (
      (!group || p.type_group === group) && matchFocus(p, focus)
      && (!nq || norm(`${p.code} ${p.name} ${p.city} ${p.state} ${p.address}`).includes(nq))
    ));
  }, [points, group, focus, q]);
  const located = useMemo(() => filtered.filter(p => validCoords(p.latitude, p.longitude)), [filtered]);
  const unlocatedAll = useMemo(() => points.filter(p => !validCoords(p.latitude, p.longitude)), [points]);
  const selected = useMemo(() => points.find(p => p.id === selectedId) || null, [points, selectedId]);

  /* ─── Guardar ubicación ─── */
  const saveCoords = useCallback(async (id, lat, lng, silent = false) => {
    const la = round6(lat);
    const ln = round6(lng);
    await rentalAPI.properties.update(tenantId, id, { latitude: la, longitude: ln });
    setData(d => (d ? {
      ...d,
      points: d.points.map(p => (p.id === id ? { ...p, latitude: la, longitude: ln } : p)),
    } : d));
    if (!silent) toast.success('Ubicación guardada');
  }, [tenantId]);
  saveRef.current = saveCoords;

  /* ─── Mapa: creación y capa base ─── */
  useEffect(() => {
    if (!mapEl.current || mapRef.current) return undefined;
    const map = L.map(mapEl.current, { zoomControl: true, scrollWheelZoom: false, worldCopyJump: true }).setView([23.6, -102.5], 4);
    layerRef.current = L.layerGroup().addTo(map);
    // La rueda del mouse solo hace zoom después de hacer clic en el mapa, para no estorbar al desplazar la página
    map.on('click', e => {
      map.scrollWheelZoom.enable();
      const pl = placingRef.current;
      if (pl.on && pl.id) {
        saveRef.current(pl.id, e.latlng.lat, e.latlng.lng).catch(() => toast.error('No se pudo guardar la ubicación'));
        placingRef.current = { on: false, id: null };
        setPlacing(false);
      }
    });
    map.on('mouseout', () => map.scrollWheelZoom.disable());
    mapRef.current = map;
    const t = setTimeout(() => map.invalidateSize(), 80);
    // Si la tarjeta cambia de tamaño (personalizar el panel), el mapa se reajusta
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => map.invalidateSize()) : null;
    if (ro) ro.observe(mapEl.current);
    return () => { clearTimeout(t); if (ro) ro.disconnect(); map.remove(); mapRef.current = null; layerRef.current = null; tileRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (tileRef.current) map.removeLayer(tileRef.current);
    tileRef.current = baseLayer(base).addTo(map);
    tileRef.current.bringToBack();
  }, [base]);

  useEffect(() => {
    placingRef.current = { on: placing, id: selectedId };
    const el = mapEl.current;
    if (el) el.style.cursor = placing ? 'crosshair' : '';
  }, [placing, selectedId]);

  /* ─── Marcadores ─── */
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.clearLayers();
    located.forEach(p => {
      const isSel = p.id === selectedId;
      const m = L.marker([p.latitude, p.longitude], {
        icon: pinIcon({ color: colorOf(p, mode), badge: alertsOf(p), selected: isSel }),
        draggable: !!(canWrite && isSel && moving),
        zIndexOffset: isSel ? 1000 : 0,
        keyboard: true,
        title: `${p.code} · ${p.name}`,
      });
      m.bindTooltip(`<b>${p.code}</b> · ${p.name}`, { direction: 'top', offset: [0, -4] });
      m.on('click', () => { setSelectedId(p.id); setMoving(false); setPlacing(false); });
      m.on('dragend', ev => {
        const ll = ev.target.getLatLng();
        saveRef.current(p.id, ll.lat, ll.lng)
          .then(() => setMoving(false))
          .catch(() => { toast.error('No se pudo mover el pin'); load(); });
      });
      m.addTo(layer);
    });
  }, [located, mode, selectedId, moving, canWrite, load]);

  /* ─── Encuadre ─── */
  const fit = useCallback((list) => {
    const map = mapRef.current;
    if (!map) return;
    const pts = (list || located).map(p => [p.latitude, p.longitude]);
    if (!pts.length) return;
    if (pts.length === 1) map.setView(pts[0], 15);
    else map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 16 });
  }, [located]);
  const fitKey = located.map(p => p.id).join(',');
  const fittedFor = useRef('');
  useEffect(() => {
    if (!data || fittedFor.current === fitKey) return;
    fittedFor.current = fitKey;
    fit(located);
  }, [data, fitKey, fit, located]);

  const flyTo = (p) => {
    const map = mapRef.current;
    if (map && validCoords(p.latitude, p.longitude)) map.flyTo([p.latitude, p.longitude], Math.max(map.getZoom(), 15), { duration: 0.6 });
  };
  const pick = (p) => {
    setSelectedId(p.id); setMoving(false); setPlacing(false);
    flyTo(p);
  };

  /* ─── Ubicar por dirección ─── */
  const locateOne = async (p) => {
    if (!hasAddressData(p)) { toast.error('Captura al menos ciudad o código postal en la propiedad.'); return; }
    setBusy(true);
    try {
      const hit = await geocodeProperty(p);
      if (!hit) { toast.error('No encontramos esa dirección. Colócala a mano en el mapa.'); return; }
      await saveCoords(p.id, hit.lat, hit.lng, true);
      toast.success(`Ubicada: ${PRECISION_LABEL[hit.precision]}`);
      mapRef.current?.flyTo([hit.lat, hit.lng], hit.precision === 'exacta' ? 17 : 14, { duration: 0.6 });
    } catch { toast.error('No se pudo consultar el servicio de mapas.'); } finally { setBusy(false); }
  };

  const locateAll = async () => {
    const todo = unlocatedAll.filter(hasAddressData);
    if (!todo.length) { toast.error('Ninguna propiedad sin ubicar tiene ciudad o código postal capturado.'); return; }
    abortAuto.current = false;
    const res = { done: 0, fail: [], total: todo.length, running: true };
    setAuto({ ...res });
    for (const p of todo) {
      if (abortAuto.current) break;
      try {
        const hit = await geocodeProperty(p);
        if (hit) { await saveCoords(p.id, hit.lat, hit.lng, true); res.done += 1; } else res.fail.push(p.code);
      } catch { res.fail.push(p.code); }
      setAuto({ ...res });
    }
    res.running = false;
    setAuto({ ...res });
    if (res.done) toast.success(`${res.done} propiedad(es) ubicadas en el mapa`);
  };

  /* ─── Render ─── */
  const counts = useMemo(() => {
    const c = {};
    located.forEach(p => {
      const k = mode === 'ocupacion' ? occKey(p) : mode === 'tipo' ? p.type_group : p.health;
      c[k] = (c[k] || 0) + 1;
    });
    return c;
  }, [located, mode]);
  const legend = mode === 'ocupacion'
    ? Object.entries(OCC).map(([k, v]) => ({ k, ...v }))
    : mode === 'tipo'
      ? PROPERTY_GROUPS.map(g => ({ k: g.id, label: g.label, color: GROUP_COLORS[g.id] }))
      : Object.entries(HEALTH).map(([k, v]) => ({ k, ...v }));

  if (error && !data) {
    return <div className="rd-empty">{error} <button className="btn btn-outline btn-sm" onClick={load}>Reintentar</button></div>;
  }

  const sel = selected;
  const selLocated = sel && validCoords(sel.latitude, sel.longitude);
  const unlocatedList = filtered.filter(p => !validCoords(p.latitude, p.longitude));

  return (
    <div className="pm">
      <div className="pm-bar">
        <div className="pm-seg" role="group" aria-label="Colorear por">
          {COLOR_MODES.map(m => (
            <button key={m.key} type="button" className={mode === m.key ? 'on' : ''} onClick={() => setMode(m.key)}>{m.label}</button>
          ))}
        </div>
        <select className="field-select pm-sel" value={focus} onChange={e => setFocus(e.target.value)} aria-label="Mostrar">
          {FOCUS.filter(f => (f.key !== 'vacantes' && f.key !== 'adeudos') || (f.key === 'vacantes' ? showLease : showDebt)).map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
        </select>
        <select className="field-select pm-sel" value={group} onChange={e => setGroup(e.target.value)} aria-label="Tipo de propiedad">
          <option value="">Todos los tipos</option>
          {PROPERTY_GROUPS.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
        </select>
        <div className="pm-search">
          <Search size={13} />
          <input className="field-input" placeholder="Buscar propiedad o ciudad…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <div className="pm-seg" role="group" aria-label="Capa del mapa">
          {Object.entries(BASE_LAYERS).map(([k, v]) => (
            <button key={k} type="button" className={base === k ? 'on' : ''} onClick={() => setBase(k)}>{k === 'satelite' ? <Layers size={12} /> : <MapPin size={12} />} {v.label}</button>
          ))}
        </div>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => fit(located)} disabled={!located.length} title="Ajustar la vista a todas las propiedades">
          <LocateFixed size={13} /> Ver todas
        </button>
      </div>

      <div className="pm-body">
        <div className="pm-map-col">
          <div className="pm-map-box">
            <div ref={mapEl} className="pm-map" />
            {placing && sel && (
              <div className="pm-hint"><Crosshair size={14} /> Haz clic en el mapa para ubicar <b>{sel.code}</b>
                <button type="button" onClick={() => setPlacing(false)}><X size={13} /></button>
              </div>
            )}
            {moving && sel && (
              <div className="pm-hint"><Move size={14} /> Arrastra el pin de <b>{sel.code}</b> a su lugar exacto
                <button type="button" onClick={() => setMoving(false)}><X size={13} /></button>
              </div>
            )}
            {data && located.length === 0 && (
              <div className="pm-empty">
                <MapPin size={22} />
                <div>{points.length === 0 ? 'Aún no hay propiedades.' : unlocatedAll.length === points.length ? 'Todavía no hay propiedades ubicadas en el mapa.' : 'Ninguna propiedad coincide con el filtro.'}</div>
              </div>
            )}
          </div>
          <div className="pm-legend">
            {legend.map(l => (
              <span key={l.k}><i style={{ background: l.color }} />{l.label} <b>{counts[l.k] || 0}</b></span>
            ))}
            <span className="pm-legend-note">{located.length} en el mapa{unlocatedAll.length ? ` · ${unlocatedAll.length} sin ubicar` : ''}</span>
          </div>
        </div>

        <aside className="pm-side">
          {sel ? (
            <div className="pm-detail">
              <div className="pm-detail-head">
                <div style={{ minWidth: 0 }}>
                  <div className="pm-detail-code">{sel.code} <span>{sel.type_label}</span></div>
                  <div className="pm-detail-name">{sel.name}</div>
                  <div className="pm-detail-addr">{sel.address || 'Sin dirección capturada'}</div>
                </div>
                <button type="button" className="btn-icon" onClick={() => { setSelectedId(null); setMoving(false); setPlacing(false); }} aria-label="Cerrar"><X size={15} /></button>
              </div>

              {sel.health !== 'ok' && (
                <div className={`pm-flag ${sel.health}`}><AlertTriangle size={13} /> {HEALTH[sel.health].label}</div>
              )}

              <div className="pm-metrics">
                {showLease && sel.leasable && (
                  <button type="button" onClick={() => go('/app/rentas/rentroll')} disabled={off.includes('rentas_rentroll')}>
                    <b>{sel.occupied}/{sel.units}</b><span>unidades ocupadas{sel.occupancy_pct != null ? ` · ${sel.occupancy_pct}%` : ''}</span>
                  </button>
                )}
                {showRent && sel.leasable && (
                  <button type="button" onClick={() => go('/app/rentas/rentroll')}><b>{money0(sel.rent_monthly, currency)}</b><span>renta mensual</span></button>
                )}
                {showDebt && sel.leasable && (
                  <button type="button" className={sel.overdue_amount > 0 ? 'bad' : ''} onClick={() => go('/app/rentas/cobranza')}>
                    <b>{money0(sel.overdue_amount, currency)}</b><span>cartera vencida</span>
                  </button>
                )}
                <button type="button" className={sel.late_orders > 0 ? 'bad' : ''} onClick={() => go(`/app/rentas/mantenimiento?property=${sel.id}`)}>
                  <b>{sel.open_orders}</b><span>órdenes abiertas{sel.late_orders ? ` · ${sel.late_orders} atrasadas` : ''}</span>
                </button>
                <button type="button" onClick={() => go(`/app/rentas/solicitudes?property=${sel.id}`)}>
                  <b>{sel.open_requests}</b><span>solicitudes abiertas</span>
                </button>
                <button type="button" className={sel.assets_down > 0 ? 'bad' : ''} onClick={() => go(`/app/rentas/activos?property=${sel.id}`)}>
                  <b>{sel.assets_down}</b><span>equipos fuera de operación</span>
                </button>
                {showLease && sel.leasable && (
                  <button type="button" className={sel.expiring_60 > 0 ? 'warn' : ''} onClick={() => go(`/app/rentas/contratos?property=${sel.id}`)}>
                    <b>{sel.expiring_60}</b><span>contratos vencen en 60 días</span>
                  </button>
                )}
              </div>

              <div className="pm-actions">
                <button type="button" className="btn btn-outline btn-sm" onClick={() => go(`/app/rentas/propiedades?open=${sel.id}`)}><Pencil size={12} /> Ver propiedad</button>
                {sel.tenancy_model === 'multi' && (
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => go(`/app/rentas/propiedades?spaces=${sel.id}`)}>Espacios</button>
                )}
                <button type="button" className="btn btn-outline btn-sm" onClick={() => go(`/app/rentas/mantenimiento?property=${sel.id}`)}>Órdenes</button>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => go(`/app/rentas/solicitudes?property=${sel.id}`)}>Solicitudes</button>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => go(`/app/rentas/activos?property=${sel.id}`)}>Activos</button>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => go(`/app/rentas/inspecciones?property=${sel.id}`)}>Inspecciones</button>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => go(`/app/rentas/preventivo?property=${sel.id}`)}>Preventivo</button>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => go(`/app/rentas/capex?tab=gastos&property=${sel.id}`)}>OPEX / CAPEX</button>
                {showLease && sel.leasable && (
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => go(`/app/rentas/contratos?property=${sel.id}`)}>Contratos</button>
                )}
              </div>

              <div className="pm-loc">
                {selLocated ? (
                  <>
                    <a className="btn btn-primary btn-sm" target="_blank" rel="noreferrer"
                      href={`https://www.google.com/maps/dir/?api=1&destination=${sel.latitude},${sel.longitude}`}>
                      <Navigation size={12} /> Cómo llegar <ExternalLink size={11} />
                    </a>
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => flyTo(sel)}><LocateFixed size={12} /> Centrar</button>
                    {canWrite && (
                      <button type="button" className={`btn btn-sm ${moving ? 'btn-primary' : 'btn-outline'}`} onClick={() => { setMoving(v => !v); setPlacing(false); flyTo(sel); }}>
                        <Move size={12} /> {moving ? 'Cancelar' : 'Mover pin'}
                      </button>
                    )}
                    <div className="pm-coords">{Number(sel.latitude).toFixed(5)}, {Number(sel.longitude).toFixed(5)}</div>
                  </>
                ) : (
                  <>
                    <div className="pm-noloc"><MapPin size={13} /> Esta propiedad aún no tiene ubicación en el mapa.</div>
                    {canWrite ? (
                      <>
                        <button type="button" className="btn btn-primary btn-sm" disabled={busy || !hasAddressData(sel)} onClick={() => locateOne(sel)}>
                          {busy ? 'Buscando…' : 'Ubicar por su dirección'}
                        </button>
                        <button type="button" className={`btn btn-sm ${placing ? 'btn-primary' : 'btn-outline'}`} onClick={() => setPlacing(v => !v)}>
                          <Crosshair size={12} /> {placing ? 'Cancelar' : 'Marcar en el mapa'}
                        </button>
                        {!hasAddressData(sel) && <div className="pm-coords">Captura ciudad o código postal en la propiedad para ubicarla por dirección.</div>}
                      </>
                    ) : <div className="pm-coords">Pide a un administrador que la ubique.</div>}
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="pm-list">
              {canWrite && unlocatedAll.length > 0 && (
                <div className="pm-auto">
                  <div><b>{unlocatedAll.length}</b> propiedad(es) sin ubicación en el mapa.</div>
                  {auto?.running ? (
                    <>
                      <div className="rd-bar"><span style={{ width: `${Math.round(((auto.done + auto.fail.length) / auto.total) * 100)}%`, background: COLORS.teal }} /></div>
                      <div className="pm-coords">Ubicando {auto.done + auto.fail.length} de {auto.total}…</div>
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => { abortAuto.current = true; }}>Detener</button>
                    </>
                  ) : (
                    <button type="button" className="btn btn-primary btn-sm" onClick={locateAll}><LocateFixed size={12} /> Ubicar automáticamente por dirección</button>
                  )}
                  {auto && !auto.running && (
                    <div className="pm-coords">
                      {auto.done} ubicada(s){auto.fail.length ? ` · sin resultado: ${auto.fail.join(', ')} (ubícalas a mano)` : ''}
                    </div>
                  )}
                </div>
              )}
              {filtered.length === 0 ? (
                <div className="rd-empty" style={{ padding: 16 }}>Sin propiedades para mostrar.</div>
              ) : (
                <>
                  {located.map(p => (
                    <button key={p.id} type="button" className="pm-row" onClick={() => pick(p)}>
                      <i style={{ background: colorOf(p, mode) }} />
                      <span className="pm-row-main"><b>{p.code} · {p.name}</b><small>{p.city || p.state || p.type_label}</small></span>
                      {alertsOf(p) > 0 && <em>{alertsOf(p)}</em>}
                    </button>
                  ))}
                  {unlocatedList.map(p => (
                    <button key={p.id} type="button" className="pm-row ghost" onClick={() => pick(p)}>
                      <i />
                      <span className="pm-row-main"><b>{p.code} · {p.name}</b><small>Sin ubicar</small></span>
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
