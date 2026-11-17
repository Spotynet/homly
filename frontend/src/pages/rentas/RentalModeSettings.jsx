import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Building2, CheckCircle, FileSignature, Hammer, Lock, PiggyBank, Receipt, Target, ClipboardList } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTenantAccess } from '../../context/TenantAccessContext';
import { rentalAPI } from '../../api/client';
import { errMsg } from './opsUi';

const OPTIONAL = [
  { key: 'rentas_crm', icon: Target, title: 'CRM de rentas', desc: 'Prospectos y pipeline para rentar tus unidades; convierte un lead en contrato.' },
  { key: 'rentas_cobranza', icon: Receipt, title: 'Cobranza de rentas', desc: 'Cargos mensuales, pagos, renta variable y mora de tus contratos de renta.' },
  { key: 'rentas_rentroll', icon: ClipboardList, title: 'Rent Roll', desc: 'Ocupación, vacancia y renta potencial de las propiedades en renta.' },
];

const ALWAYS = [
  { icon: Hammer, title: 'Operación', desc: 'Solicitudes, órdenes de trabajo, preventivo, activos, inspecciones e indicadores.' },
  { icon: PiggyBank, title: 'CAPEX y OPEX', desc: 'Proyectos, gastos y presupuesto; las órdenes se ligan a CAPEX u OPEX aunque no haya renta.' },
  { icon: FileSignature, title: 'Contratos de servicio', desc: 'Contratos con proveedores, mantenimiento y servicios generales, y sus vigencias.' },
  { icon: Building2, title: 'Propiedades y reportes', desc: 'Inventario, dashboard y reportes (anual, SLA, informes a pedido).' },
];

function Switch({ on, disabled, onClick, label }) {
  return (
    <div
      className={`switch${on ? ' on' : ''}`}
      role="switch"
      aria-checked={on}
      aria-label={label}
      tabIndex={disabled ? -1 : 0}
      style={disabled ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
      onClick={() => !disabled && onClick()}
      onKeyDown={e => { if (!disabled && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); onClick(); } }}
    >
      <div className="switch-knob" />
    </div>
  );
}

export default function RentalModeSettings() {
  const { tenantId } = useAuth();
  const { can } = useTenantAccess();
  const canWrite = can('rentas_config');
  const [mode, setMode] = useState(null);
  const [saved, setSaved] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!tenantId) return;
    rentalAPI.ops.settings(tenantId)
      .then(r => { setMode(r.data.mode); setSaved(r.data.mode); })
      .catch(() => toast.error('No se pudo cargar el modo de operación'));
  }, [tenantId]);

  if (!mode) return <div style={{ padding: 30, color: 'var(--ink-400)' }}>Cargando…</div>;

  const dirty = saved && (
    mode.leasing_enabled !== saved.leasing_enabled
    || [...(mode.off_modules || [])].sort().join() !== [...(saved.off_modules || [])].sort().join()
  );

  const toggleModule = (key) => setMode(m => {
    const off = new Set(m.off_modules || []);
    if (off.has(key)) off.delete(key); else off.add(key);
    return { ...m, off_modules: [...off] };
  });

  const save = async () => {
    setSaving(true); setError('');
    try {
      const { data } = await rentalAPI.ops.saveSettings(tenantId, {
        leasing_enabled: mode.leasing_enabled,
        off_modules: mode.off_modules || [],
      });
      setMode(data.mode); setSaved(data.mode);
      toast.success('Modo de operación guardado');
      window.dispatchEvent(new Event('homly:tenant-settings-changed'));
    } catch (e) {
      const d = e.response?.data;
      const msg = d?.leasing_enabled || d?.off_modules || errMsg(e, 'No se pudo guardar');
      setError(typeof msg === 'string' ? msg : 'No se pudo guardar');
    } finally { setSaving(false); }
  };

  const choice = (value, title, desc) => {
    const active = mode.leasing_enabled === value;
    return (
      <button
        type="button"
        disabled={!canWrite}
        onClick={() => setMode(m => ({ ...m, leasing_enabled: value }))}
        className={`mode-choice${active ? ' active' : ''}`}
        aria-pressed={active}
      >
        <span className="mode-choice-check">{active ? <CheckCircle size={18} /> : null}</span>
        <strong>{title}</strong>
        <span>{desc}</span>
      </button>
    );
  };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="card" style={{ padding: 20 }}>
        <h3 style={{ margin: 0 }}>¿Cómo administras tus propiedades?</h3>
        <p style={{ color: 'var(--ink-400)', fontSize: 13, margin: '4px 0 14px' }}>
          Una propiedad se puede operar sin tener un contrato de renta. Elige si tu espacio administra rentas y qué módulos relacionados quieres usar. Operación y CAPEX/OPEX siempre están disponibles.
        </p>
        <div className="mode-choices">
          {choice(true, 'Rentas y operación', 'Tienes propiedades con contratos de renta, cobranza y Rent Roll, además de operarlas. Cada propiedad puede marcarse "En renta" o "Solo operación".')}
          {choice(false, 'Solo operación', 'Operas y mantienes tus inmuebles sin rentarlos (oficinas, plantas, activos propios). Se ocultan CRM, cobranza y Rent Roll, y no se crean contratos de renta.')}
        </div>
        <div className="mode-stats">
          <span><b>{mode.properties_total}</b> propiedades</span>
          <span><b>{mode.properties_operation_only}</b> solo operación</span>
          <span><b>{mode.live_lease_contracts}</b> contratos de renta vigentes</span>
        </div>
        {!mode.leasing_enabled && mode.live_lease_contracts > 0 && (
          <div className="mode-warn">
            Tienes contratos de renta vigentes. Finalízalos o cancélalos antes de guardar este modo.
          </div>
        )}
      </div>

      {mode.leasing_enabled && (
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ margin: 0 }}>Módulos de renta</h3>
          <p style={{ color: 'var(--ink-400)', fontSize: 13, margin: '4px 0 6px' }}>
            Apaga los que no uses; se ocultan del menú y del dashboard. Tus datos no se borran y puedes reactivarlos cuando quieras.
          </p>
          {OPTIONAL.map(m => {
            const on = !(mode.off_modules || []).includes(m.key);
            const Icon = m.icon;
            return (
              <div key={m.key} className="toggle-row">
                <div className="toggle-info" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <span className="mode-ico"><Icon size={16} /></span>
                  <div><h4>{m.title}</h4><p>{m.desc}</p></div>
                </div>
                <Switch on={on} disabled={!canWrite} label={m.title} onClick={() => toggleModule(m.key)} />
              </div>
            );
          })}
        </div>
      )}

      <div className="card" style={{ padding: 20 }}>
        <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}><Lock size={15} /> Siempre disponibles, con o sin renta</h3>
        <div className="mode-always">
          {ALWAYS.map(a => {
            const Icon = a.icon;
            return (
              <div key={a.title} className="mode-always-item">
                <span className="mode-ico"><Icon size={16} /></span>
                <div><b>{a.title}</b><small>{a.desc}</small></div>
              </div>
            );
          })}
        </div>
      </div>

      {error && <div className="mode-warn">{error}</div>}
      {canWrite ? (
        <div>
          <button className="btn btn-primary" disabled={saving || !dirty} onClick={save}>{saving ? 'Guardando…' : 'Guardar modo de operación'}</button>
        </div>
      ) : (
        <div style={{ fontSize: 12.5, color: 'var(--ink-400)' }}>Solo el administrador o el tesorero pueden cambiar el modo de operación.</div>
      )}
    </div>
  );
}
