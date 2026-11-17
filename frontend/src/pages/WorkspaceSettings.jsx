import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Layers, Package, Plus, RotateCcw, Save, Trash2, AlertTriangle } from 'lucide-react';
import { subscriptionPlansAPI, workspaceConfigsAPI } from '../api/client';
import { useWorkspaceConfig } from '../context/WorkspaceConfigContext';
import { baseCatalogFor, groupModules } from '../constants/modulePermissions';

const PROTECTED = new Set(['mi_membresia']);
const FIELDS = ['label', 'short_label', 'description', 'unit_noun', 'color', 'is_enabled', 'module_overrides', 'module_bundles'];
const pick = (o) => Object.fromEntries(FIELDS.map(k => [k, o?.[k]]));
const same = (a, b) => JSON.stringify(pick(a)) === JSON.stringify(pick(b));

function Switch({ on, onChange, disabled, label }) {
  return (
    <button
      type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled}
      onClick={() => onChange(!on)}
      style={{
        width: 40, height: 22, borderRadius: 999, border: 'none', padding: 2, flexShrink: 0,
        background: on ? 'var(--teal-500, #14b8a6)' : 'var(--sand-200, #d6d3d1)',
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
        transition: 'background .15s', display: 'flex', justifyContent: on ? 'flex-end' : 'flex-start',
      }}
    >
      <span style={{ width: 18, height: 18, borderRadius: 999, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.25)' }} />
    </button>
  );
}

export default function WorkspaceSettings() {
  const { byType, configs, ready, reload } = useWorkspaceConfig();
  const [ws, setWs] = useState('condominio');
  const [draft, setDraft] = useState(null);
  const [plans, setPlans] = useState([]);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  const cfg = byType[ws];

  useEffect(() => {
    subscriptionPlansAPI.list()
      .then(r => setPlans(Array.isArray(r.data) ? r.data : (r.data?.results || [])))
      .catch(() => setPlans([]));
  }, []);

  useEffect(() => {
    if (ready && cfg) setDraft(JSON.parse(JSON.stringify(pick(cfg))));
  }, [ws, ready, cfg?.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = !!draft && !same(draft, cfg);
  const base = useMemo(() => baseCatalogFor(ws).filter(m => !PROTECTED.has(m.key) && m.key !== 'enviar_pago'), [ws]);
  const groups = useMemo(() => groupModules(base.filter(m => {
    const t = search.trim().toLowerCase();
    return !t || `${m.label} ${m.desc} ${m.key}`.toLowerCase().includes(t);
  })), [base, search]);

  const wsPlans = plans.filter(p => (p.workspace_type || 'condominio') === ws);
  const plansWith = (key) => wsPlans.filter(p => !p.allowed_modules?.length || p.allowed_modules.includes(key)).length;

  if (!draft) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-400)' }}>Cargando…</div>;
  }

  const set = (k, v) => setDraft(d => ({ ...d, [k]: v }));
  const ov = (key) => draft.module_overrides?.[key] || {};
  const setOv = (key, patch) => setDraft(d => {
    const next = { ...(d.module_overrides || {}) };
    const item = { ...(next[key] || {}), ...patch };
    const b = base.find(m => m.key === key);
    if (!item.label || item.label === b?.label) delete item.label;
    if (!item.desc || item.desc === b?.desc) delete item.desc;
    if (item.enabled !== false) delete item.enabled;
    if (Object.keys(item).length) next[key] = item; else delete next[key];
    return { ...d, module_overrides: next };
  });

  const enabledKeys = base.filter(m => ov(m.key).enabled !== false).map(m => m.key);
  const customizedCount = Object.keys(draft.module_overrides || {}).length;
  const disabledCount = Object.values(draft.module_overrides || {}).filter(o => o.enabled === false).length;

  const bundles = draft.module_bundles || [];
  const setBundle = (id, patch) => set('module_bundles', bundles.map(b => (b.id === id ? { ...b, ...patch } : b)));
  const addBundle = () => set('module_bundles', [...bundles, { id: `b${Date.now().toString(36)}`, name: 'Nuevo paquete', modules: [] }]);
  const toggleInBundle = (b, key) => setBundle(b.id, {
    modules: b.modules.includes(key) ? b.modules.filter(k => k !== key) : [...b.modules, key],
  });

  const save = async () => {
    setSaving(true);
    try {
      await workspaceConfigsAPI.update(ws, pick(draft));
      await reload();
      toast.success('Configuración guardada');
    } catch (e) {
      const d = e.response?.data;
      const msg = d?.is_enabled?.[0] || d?.label?.[0] || d?.color?.[0] || d?.module_bundles?.[0] || d?.detail || 'No se pudo guardar';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const discard = () => setDraft(JSON.parse(JSON.stringify(pick(cfg))));

  return (
    <div className="content-fade">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', color: 'var(--teal-600)', textTransform: 'uppercase' }}>Sistema</div>
          <h2 style={{ margin: '4px 0 0', fontSize: 24 }}>Espacios de trabajo y módulos</h2>
          <p style={{ color: 'var(--ink-400)', fontSize: 13, marginTop: 4, maxWidth: 680 }}>
            Personaliza cómo se llama cada espacio, qué módulos ofrece el sistema y arma paquetes para crear planes más rápido.
            Lo que definas aquí se refleja en planes, membresías y en la asignación de tenants.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          {dirty && <button className="btn btn-outline" onClick={discard}><RotateCcw size={14} /> Descartar</button>}
          <button className="btn btn-primary" onClick={save} disabled={!dirty || saving}>
            <Save size={14} /> {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </div>

      <div className="tabs" style={{ marginBottom: 16 }}>
        {configs.map(c => (
          <button key={c.workspace_type} className={`tab ${ws === c.workspace_type ? 'active' : ''}`} onClick={() => {
            if (dirty && !window.confirm('Tienes cambios sin guardar. ¿Descartarlos?')) return;
            setWs(c.workspace_type);
          }}>
            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 99, background: c.color, marginRight: 8 }} />
            {c.short_label || c.label}
            {!c.is_enabled && <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--coral-600, #dc2626)' }}>(desactivado)</span>}
          </button>
        ))}
      </div>

      {/* ── Identidad ── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head"><h3><Layers size={16} style={{ verticalAlign: -3, marginRight: 6 }} />Identidad del espacio</h3></div>
        <div style={{ padding: 18, display: 'grid', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            <div>
              <label className="field-label">Nombre del espacio</label>
              <input className="field-input" value={draft.label} maxLength={80} onChange={e => set('label', e.target.value)} />
            </div>
            <div>
              <label className="field-label">Nombre corto</label>
              <input className="field-input" value={draft.short_label} maxLength={40} onChange={e => set('short_label', e.target.value)} placeholder="Para etiquetas y menús" />
            </div>
            <div>
              <label className="field-label">Se cobra por…</label>
              <input className="field-input" value={draft.unit_noun} maxLength={30} onChange={e => set('unit_noun', e.target.value)} placeholder="unidad, propiedad, local…" />
            </div>
            <div>
              <label className="field-label">Color</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input type="color" value={/^#[0-9a-f]{6}$/i.test(draft.color) ? draft.color : '#0f766e'} onChange={e => set('color', e.target.value)}
                  style={{ width: 42, height: 38, border: '1px solid var(--sand-200)', borderRadius: 8, padding: 2, background: '#fff' }} />
                <input className="field-input" value={draft.color} maxLength={7} onChange={e => set('color', e.target.value)} />
              </div>
            </div>
          </div>
          <div>
            <label className="field-label">Descripción</label>
            <input className="field-input" value={draft.description} maxLength={240} onChange={e => set('description', e.target.value)} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 12, background: draft.is_enabled ? 'var(--sand-50, #fafaf9)' : '#fef2f2', border: '1px solid var(--sand-100)' }}>
            <Switch on={draft.is_enabled} onChange={v => set('is_enabled', v)} label="Espacio activo" />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: 14 }}>{draft.is_enabled ? 'Espacio activo' : 'Espacio desactivado'}</div>
              <div style={{ fontSize: 12.5, color: 'var(--ink-500)', marginTop: 2 }}>
                {draft.is_enabled
                  ? 'Se puede elegir al crear tenants y planes.'
                  : 'No se podrán crear tenants ni planes nuevos de este espacio. Los existentes siguen funcionando.'}
                {' '}Hoy hay <b>{cfg.tenants_count ?? 0}</b> tenant{cfg.tenants_count === 1 ? '' : 's'} y <b>{cfg.plans_count ?? 0}</b> plan{cfg.plans_count === 1 ? '' : 'es'}.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Módulos ── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head" style={{ gap: 12, flexWrap: 'wrap' }}>
          <h3>Módulos del espacio</h3>
          <span style={{ fontSize: 12, color: 'var(--ink-400)' }}>
            {enabledKeys.length} de {base.length} activos{customizedCount ? ` · ${customizedCount} personalizado${customizedCount === 1 ? '' : 's'}` : ''}
          </span>
          <input className="field-input" style={{ marginLeft: 'auto', maxWidth: 240 }} placeholder="Buscar módulo…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div style={{ padding: '4px 18px 18px' }}>
          <p style={{ fontSize: 12.5, color: 'var(--ink-500)', margin: '10px 0 6px' }}>
            Desactivar un módulo lo retira del catálogo de planes y lo oculta a <b>todos</b> los tenants de este espacio, sin importar su plan.
            Cambiar el nombre actualiza el menú y los planes. “Mi Membresía” siempre permanece disponible.
          </p>
          {disabledCount > 0 && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', padding: '8px 12px', borderRadius: 10, marginBottom: 6 }}>
              <AlertTriangle size={15} /> {disabledCount} módulo{disabledCount === 1 ? '' : 's'} desactivado{disabledCount === 1 ? '' : 's'}: dejarán de verse en cuanto guardes.
            </div>
          )}
          {groups.map(g => (
            <div key={g.id}>
              <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--teal-700)', margin: '16px 0 6px' }}>{g.label}</div>
              {g.items.map(m => {
                const o = ov(m.key);
                const on = o.enabled !== false;
                const n = plansWith(m.key);
                return (
                  <div key={m.key} style={{
                    display: 'grid', gridTemplateColumns: 'auto minmax(160px, 1fr) minmax(200px, 1.6fr) auto', gap: 12, alignItems: 'center',
                    padding: '10px 12px', border: '1px solid var(--sand-100)', borderRadius: 12, marginBottom: 6,
                    background: on ? '#fff' : 'var(--sand-50, #fafaf9)', opacity: on ? 1 : 0.75,
                  }}>
                    <Switch on={on} onChange={v => setOv(m.key, { enabled: v ? undefined : false })} label={`Activar ${m.label}`} />
                    <div>
                      <input className="field-input" value={o.label || ''} placeholder={m.label} maxLength={80} onChange={e => setOv(m.key, { label: e.target.value })} />
                      <div style={{ fontSize: 10.5, color: 'var(--ink-400)', marginTop: 3 }}><code>{m.key}</code>{wsPlans.length > 0 && <> · en {n} de {wsPlans.length} plan{wsPlans.length === 1 ? '' : 'es'}</>}</div>
                    </div>
                    <input className="field-input" value={o.desc || ''} placeholder={m.desc} maxLength={200} onChange={e => setOv(m.key, { desc: e.target.value })} />
                    <button className="btn btn-outline btn-sm" title="Restablecer" disabled={!Object.keys(o).length}
                      onClick={() => setOv(m.key, { label: '', desc: '', enabled: undefined })}><RotateCcw size={13} /></button>
                  </div>
                );
              })}
            </div>
          ))}
          {groups.length === 0 && <div style={{ textAlign: 'center', color: 'var(--ink-400)', padding: 24 }}>Sin resultados.</div>}
        </div>
      </div>

      {/* ── Paquetes ── */}
      <div className="card">
        <div className="card-head" style={{ gap: 12 }}>
          <h3><Package size={16} style={{ verticalAlign: -3, marginRight: 6 }} />Paquetes de módulos</h3>
          <button className="btn btn-outline btn-sm" style={{ marginLeft: 'auto' }} onClick={addBundle} disabled={bundles.length >= 20}><Plus size={13} /> Nuevo paquete</button>
        </div>
        <div style={{ padding: 18 }}>
          <p style={{ fontSize: 12.5, color: 'var(--ink-500)', margin: '0 0 12px' }}>
            Un paquete es una selección de módulos con nombre (por ejemplo “Esencial” o “Operación completa”). Al crear o editar un plan puedes aplicarlo con un clic.
          </p>
          {bundles.length === 0 && <div style={{ color: 'var(--ink-400)', fontSize: 13, textAlign: 'center', padding: 16 }}>Aún no hay paquetes para este espacio.</div>}
          {bundles.map(b => (
            <div key={b.id} style={{ border: '1px solid var(--sand-100)', borderRadius: 12, padding: 14, marginBottom: 10 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
                <input className="field-input" style={{ maxWidth: 280 }} value={b.name} maxLength={60} onChange={e => setBundle(b.id, { name: e.target.value })} />
                <span style={{ fontSize: 12, color: 'var(--ink-400)' }}>{b.modules.filter(k => enabledKeys.includes(k)).length} módulos</span>
                <button className="btn btn-outline btn-sm" onClick={() => setBundle(b.id, { modules: enabledKeys })}>Todos</button>
                <button className="btn btn-outline btn-sm" onClick={() => setBundle(b.id, { modules: [] })}>Ninguno</button>
                <button className="btn btn-outline btn-sm" style={{ marginLeft: 'auto', color: '#dc2626' }} onClick={() => set('module_bundles', bundles.filter(x => x.id !== b.id))}><Trash2 size={13} /></button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {base.filter(m => enabledKeys.includes(m.key)).map(m => {
                  const sel = b.modules.includes(m.key);
                  return (
                    <button key={m.key} type="button" onClick={() => toggleInBundle(b, m.key)}
                      style={{
                        fontSize: 12.5, fontWeight: 700, padding: '5px 10px', borderRadius: 999, cursor: 'pointer',
                        border: `1px solid ${sel ? 'var(--teal-300, #5eead4)' : 'var(--sand-200)'}`,
                        background: sel ? 'var(--teal-50, #f0fdfa)' : '#fff', color: sel ? 'var(--teal-800, #115e59)' : 'var(--ink-500)',
                      }}>
                      {ov(m.key).label || m.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
