import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Copy, ExternalLink, RefreshCw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTenantAccess } from '../../context/TenantAccessContext';
import { rentalAPI } from '../../api/client';
import { errMsg, Field, PRIORITY } from './opsUi';

export default function RentalOpsSettings() {
  const { tenantId } = useAuth();
  const { can } = useTenantAccess();
  const canWrite = can('rentas_config');
  const [data, setData] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!tenantId) return;
    rentalAPI.ops.settings(tenantId).then(r => setData(r.data)).catch(() => toast.error('No se pudo cargar la configuración'));
  }, [tenantId]);

  if (!data) return <div style={{ padding: 30, color: 'var(--ink-400)' }}>Cargando…</div>;

  const set = (k, v) => setData(d => ({ ...d, [k]: v }));
  const setSla = (prio, k, v) => setData(d => ({ ...d, sla: { ...d.sla, [prio]: { ...d.sla[prio], [k]: v } } }));
  const url = `${window.location.origin}${data.portal_path}`;

  const save = async () => {
    setSaving(true);
    try {
      const { data: out } = await rentalAPI.ops.saveSettings(tenantId, {
        portal_enabled: data.portal_enabled,
        portal_welcome: data.portal_welcome,
        notify_email: data.notify_email,
        sla: data.sla,
      });
      setData(out);
      toast.success('Configuración guardada');
    } catch (e) {
      const d = e.response?.data;
      toast.error(d?.sla || errMsg(e, 'No se pudo guardar'));
    } finally { setSaving(false); }
  };

  const regenerate = async () => {
    if (!window.confirm('El enlace anterior dejará de funcionar. ¿Generar uno nuevo?')) return;
    try {
      const { data: out } = await rentalAPI.ops.regeneratePortal(tenantId);
      setData(out);
      toast.success('Nuevo enlace generado');
    } catch (e) { toast.error(errMsg(e, 'No se pudo regenerar')); }
  };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="card" style={{ padding: 20 }}>
        <h3 style={{ margin: 0 }}>Portal de solicitudes</h3>
        <p style={{ color: 'var(--ink-400)', fontSize: 13, margin: '4px 0 14px' }}>
          Comparte un enlace con inquilinos y propietarios para que reporten incidencias sin crear una cuenta. Cada solicitud entra a tu bandeja con su SLA.
        </p>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, marginBottom: 12 }}>
          <input type="checkbox" disabled={!canWrite} checked={!!data.portal_enabled} onChange={e => set('portal_enabled', e.target.checked)} />
          Portal habilitado
        </label>
        {data.portal_enabled && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
            <code style={{ background: 'var(--sand-50)', padding: '8px 10px', borderRadius: 8, fontSize: 12, overflowWrap: 'anywhere', flex: 1, minWidth: 220 }}>{url}</code>
            <button className="btn btn-outline btn-sm" onClick={() => { navigator.clipboard?.writeText(url); toast.success('Enlace copiado'); }}><Copy size={13} /> Copiar</button>
            <a className="btn btn-outline btn-sm" href={url} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Abrir</a>
            {canWrite && <button className="btn btn-outline btn-sm" onClick={regenerate}><RefreshCw size={13} /> Regenerar</button>}
          </div>
        )}
        <div className="form-grid">
          <Field label="Mensaje de bienvenida">
            <input className="field-input" maxLength={300} disabled={!canWrite} value={data.portal_welcome || ''} onChange={e => set('portal_welcome', e.target.value)} placeholder="Cuéntanos qué sucede y te ayudamos lo antes posible." />
          </Field>
          <Field label="Correo para avisos de nuevas solicitudes" hint="Además de las notificaciones dentro de Homly.">
            <input className="field-input" type="email" disabled={!canWrite} value={data.notify_email || ''} onChange={e => set('notify_email', e.target.value)} />
          </Field>
        </div>
      </div>

      <div className="card" style={{ padding: 20 }}>
        <h3 style={{ margin: 0 }}>Acuerdos de servicio (SLA)</h3>
        <p style={{ color: 'var(--ink-400)', fontSize: 13, margin: '4px 0 14px' }}>
          Tiempo máximo en horas para responder y para resolver, según la prioridad. Se usa para fechas límite de solicitudes y órdenes correctivas.
        </p>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Prioridad</th><th>Primera respuesta (h)</th><th>Resolución (h)</th><th>Por defecto</th></tr></thead>
            <tbody>
              {Object.entries(PRIORITY).map(([prio, meta]) => (
                <tr key={prio}>
                  <td><span className="proj-chip" style={{ color: meta.color, background: meta.bg }}>{meta.label}</span></td>
                  <td><input type="number" min="1" className="field-input" style={{ maxWidth: 110 }} disabled={!canWrite} value={data.sla?.[prio]?.response_h ?? ''} onChange={e => setSla(prio, 'response_h', e.target.value)} /></td>
                  <td><input type="number" min="1" className="field-input" style={{ maxWidth: 110 }} disabled={!canWrite} value={data.sla?.[prio]?.resolution_h ?? ''} onChange={e => setSla(prio, 'resolution_h', e.target.value)} /></td>
                  <td style={{ fontSize: 12, color: 'var(--ink-400)' }}>{data.sla_defaults?.[prio]?.response_h} h / {data.sla_defaults?.[prio]?.resolution_h} h</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {canWrite && (
        <div>
          <button className="btn btn-primary" disabled={saving} onClick={save}>{saving ? 'Guardando…' : 'Guardar configuración'}</button>
        </div>
      )}
    </div>
  );
}
