import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2, Loader2, UserCheck } from 'lucide-react';
import { visitasAPI } from '../../api/client';

function errDetail(e, fallback) {
  return e?.response?.data?.detail || e?.response?.data?.code?.[0] || fallback;
}

export default function VisitasConfigTab({ tenantId, isAdmin }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingFlags, setSavingFlags] = useState(false);
  const [rules, setRules] = useState('');
  const [useParking, setUseParking] = useState(true);
  const [useBadges, setUseBadges] = useState(false);
  const [form, setForm] = useState(null);

  const load = () => {
    if (!tenantId) return;
    setLoading(true);
    visitasAPI.settings(tenantId)
      .then(r => {
        setData(r.data);
        setRules(r.data.notify_rules || '');
        setUseParking(!!r.data.use_parking);
        setUseBadges(!!r.data.use_badges);
      })
      .catch(() => toast.error('No se pudo cargar la configuración de visitas'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [tenantId]);

  const saveFlags = async () => {
    setSavingFlags(true);
    try {
      const r = await visitasAPI.saveSettings(tenantId, {
        notify_rules: rules,
        use_parking: useParking,
        use_badges: useBadges,
      });
      setData(r.data);
      toast.success('Configuración de visitas guardada');
    } catch (e) {
      toast.error(errDetail(e, 'No se pudo guardar'));
    } finally {
      setSavingFlags(false);
    }
  };

  const saveItem = async () => {
    if (!form?.code?.trim()) return toast.error('Indica el código o número');
    try {
      const payload = { code: form.code.trim(), name: (form.name || '').trim(), notes: (form.notes || '').trim(), is_active: form.is_active !== false };
      if (form.kind === 'parking') {
        if (form.id) await visitasAPI.updateParking(tenantId, form.id, payload);
        else await visitasAPI.createParking(tenantId, payload);
      } else {
        if (form.id) await visitasAPI.updateBadge(tenantId, form.id, payload);
        else await visitasAPI.createBadge(tenantId, payload);
      }
      toast.success(form.id ? 'Registro actualizado' : 'Registro creado');
      setForm(null);
      load();
    } catch (e) {
      toast.error(errDetail(e, 'No se pudo guardar el registro'));
    }
  };

  const removeItem = async (kind, item) => {
    if (!window.confirm(`¿Eliminar ${item.label || item.code}?`)) return;
    try {
      if (kind === 'parking') await visitasAPI.deleteParking(tenantId, item.id);
      else await visitasAPI.deleteBadge(tenantId, item.id);
      toast.success('Registro eliminado');
      load();
    } catch (e) {
      toast.error(errDetail(e, 'No se pudo eliminar'));
    }
  };

  if (loading) {
    return (
      <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--ink-400)' }}>
        <Loader2 size={20} className="animate-spin" /> Cargando visitas…
      </div>
    );
  }

  const spots = data?.parking_spots || [];
  const badges = data?.badges || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card">
        <div className="card-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="stat-icon teal"><UserCheck size={16} /></div>
            <div>
              <h3 style={{ margin: 0 }}>Visitas Autorizadas</h3>
              <div style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: 2 }}>
                Cajones, gafetes y normas que usa caseta al registrar el ingreso.
              </div>
            </div>
          </div>
        </div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: isAdmin ? 'pointer' : 'default' }}>
            <input type="checkbox" checked={useParking} disabled={!isAdmin} onChange={e => setUseParking(e.target.checked)} style={{ marginTop: 3 }} />
            <span>
              <strong>Usar cajones de visitas</strong>
              <div style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: 2 }}>
                Al ingresar en vehículo, vigilancia selecciona o escribe el cajón ocupado.
              </div>
            </span>
          </label>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: isAdmin ? 'pointer' : 'default' }}>
            <input type="checkbox" checked={useBadges} disabled={!isAdmin} onChange={e => setUseBadges(e.target.checked)} style={{ marginTop: 3 }} />
            <span>
              <strong>Usar gafetes de visitas</strong>
              <div style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: 2 }}>
                Al ingreso se asigna un gafete del catálogo o se escribe el número entregado.
              </div>
            </span>
          </label>
          <div className="field">
            <div className="field-label">Normas que viajan en el correo</div>
            <textarea
              className="field-input"
              rows={6}
              value={rules}
              disabled={!isAdmin}
              onChange={e => setRules(e.target.value)}
              placeholder={'Ej.\n• Estacionarse solo en cajones de visitas.\n• Devolver el gafete al salir.\n• Horario de visitas: 8:00 a 22:00.'}
            />
          </div>
          {isAdmin && (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-primary" onClick={saveFlags} disabled={savingFlags}>
                {savingFlags ? 'Guardando…' : 'Guardar configuración'}
              </button>
            </div>
          )}
        </div>
      </div>

      <CatalogCard
        title="Cajones de visitas"
        empty="Aún no hay cajones. Agrégalos para que caseta los seleccione al ingreso."
        items={spots}
        isAdmin={isAdmin}
        onAdd={() => setForm({ kind: 'parking', code: '', name: '', notes: '', is_active: true })}
        onEdit={(item) => setForm({ kind: 'parking', ...item })}
        onDelete={(item) => removeItem('parking', item)}
      />

      <CatalogCard
        title="Gafetes de visitas"
        empty="Aún no hay gafetes. Agrégalos si el condominio entrega identificación temporal."
        items={badges}
        isAdmin={isAdmin}
        onAdd={() => setForm({ kind: 'badge', code: '', name: '', notes: '', is_active: true })}
        onEdit={(item) => setForm({ kind: 'badge', ...item })}
        onDelete={(item) => removeItem('badge', item)}
      />

      {form && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setForm(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full" style={{ maxWidth: 440, padding: 24 }} onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 800, marginBottom: 16 }}>
              {form.id ? 'Editar' : 'Nuevo'} {form.kind === 'parking' ? 'cajón' : 'gafete'}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="field">
                <div className="field-label">Código / número *</div>
                <input className="field-input" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder={form.kind === 'parking' ? 'V-12' : 'G-08'} />
              </div>
              <div className="field">
                <div className="field-label">Nombre o ubicación</div>
                <input className="field-input" value={form.name || ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder={form.kind === 'parking' ? 'Cajón visitas 12' : 'Gafete azul 08'} />
              </div>
              <div className="field">
                <div className="field-label">Nota</div>
                <input className="field-input" value={form.notes || ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <input type="checkbox" checked={form.is_active !== false} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} />
                Activo
              </label>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }}>
                <button className="btn btn-outline" onClick={() => setForm(null)}>Cancelar</button>
                <button className="btn btn-primary" onClick={saveItem}>Guardar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CatalogCard({ title, empty, items, isAdmin, onAdd, onEdit, onDelete }) {
  return (
    <div className="card">
      <div className="card-head">
        <h3 style={{ margin: 0 }}>
          {title}
          {items.length > 0 && <span className="badge badge-teal" style={{ marginLeft: 8, fontSize: 11 }}>{items.length}</span>}
        </h3>
        {isAdmin && (
          <button className="btn btn-primary btn-sm" onClick={onAdd}><Plus size={13} /> Agregar</button>
        )}
      </div>
      <div className="card-body" style={{ padding: items.length ? 0 : 24 }}>
        {items.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--ink-400)', fontSize: 13 }}>{empty}</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Nombre</th>
                  <th>Estado</th>
                  {isAdmin && <th style={{ width: 90, textAlign: 'center' }}>Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {items.map(item => (
                  <tr key={item.id}>
                    <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>{item.code}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{item.name || item.code}</div>
                      {item.notes && <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>{item.notes}</div>}
                    </td>
                    <td>
                      <span className={`badge ${item.is_active ? 'badge-teal' : 'badge-amber'}`}>{item.is_active ? 'Activo' : 'Inactivo'}</span>
                      {item.occupied && <div style={{ fontSize: 11, color: 'var(--amber-700)', marginTop: 4 }}>En uso</div>}
                    </td>
                    {isAdmin && (
                      <td>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                          <button className="btn-ghost" onClick={() => onEdit(item)}><Pencil size={13} /></button>
                          <button className="btn-ghost" style={{ color: 'var(--coral-500)' }} onClick={() => onDelete(item)}><Trash2 size={13} /></button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
