import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { rentalAPI } from '../../api/client';
import { errMsg, Field, Grid, Modal, todayISO } from './opsUi';
import { OPEX_CATEGORIES } from './capexUi';
import SpaceField from './SpaceField';

/**
 * Alta / edición de un gasto manual (OPEX o CAPEX).
 * `lockProject`: cuando se abre desde un proyecto, el gasto es CAPEX de ese proyecto.
 */
export default function ExpenseModal({ tenantId, initial, lockProject, projects, properties, providers, onClose, onSaved }) {
  const editing = !!initial?.id;
  const [form, setForm] = useState(() => ({
    kind: lockProject ? 'capex' : 'opex',
    status: 'pagado',
    date: todayISO(),
    amount: '',
    category: 'servicios',
    concept: '',
    property: '',
    project: lockProject || '',
    provider: '',
    vendor_name: '',
    invoice_ref: '',
    approved_by: '',
    notes: '',
    ...(initial || {}),
    property: initial?.property || '',
    space: initial?.space || '',
    provider: initial?.provider || '',
    project: initial?.project || lockProject || '',
  }));
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const capex = form.kind === 'capex';

  const save = async () => {
    if (!form.concept.trim()) return toast.error('Describe el concepto del gasto');
    if (!(Number(form.amount) > 0)) return toast.error('Captura un monto mayor a cero');
    if (capex && !form.project) return toast.error('Selecciona el proyecto CAPEX');
    setSaving(true);
    try {
      const payload = {
        kind: form.kind, status: form.status, date: form.date, amount: form.amount,
        concept: form.concept.trim(), property: form.property || null, space: form.property && form.space ? form.space : null, provider: form.provider || null,
        vendor_name: form.vendor_name, invoice_ref: form.invoice_ref, approved_by: form.approved_by, notes: form.notes,
        project: capex ? form.project : null,
        ...(capex ? {} : { category: form.category }),
      };
      if (editing) await rentalAPI.ops.finance.expenses.update(tenantId, initial.id, payload);
      else await rentalAPI.ops.finance.expenses.create(tenantId, payload);
      toast.success(editing ? 'Gasto actualizado' : 'Gasto registrado');
      onSaved();
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo guardar el gasto'));
    } finally {
      setSaving(false);
    }
  };

  const activeProjects = (projects || []).filter(p => p.status !== 'cancelado');

  return (
    <Modal
      title={editing ? 'Editar gasto' : capex ? 'Registrar gasto CAPEX' : 'Registrar gasto'}
      subtitle={capex ? 'Se suma al avance financiero del proyecto.' : 'Gasto operativo de la cartera o de una propiedad.'}
      onClose={onClose}
      footer={(
        <>
          <button className="btn btn-outline" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
        </>
      )}
    >
      {!lockProject && !editing && (
        <div className="tabs" style={{ marginBottom: 0 }}>
          <button className={`tab ${!capex ? 'active' : ''}`} onClick={() => set('kind', 'opex')}>OPEX · Operación</button>
          <button className={`tab ${capex ? 'active' : ''}`} onClick={() => set('kind', 'capex')}>CAPEX · Inversión</button>
        </div>
      )}
      <Grid cols={2}>
        <Field label="Concepto *" style={{ gridColumn: '1 / -1' }}>
          <input className="field-input" value={form.concept} onChange={e => set('concept', e.target.value)} placeholder={capex ? 'Ej. Anticipo 50 % de equipo' : 'Ej. Recibo de luz, limpieza mensual…'} />
        </Field>
        <Field label="Monto *">
          <input className="field-input" type="number" min="0" step="0.01" value={form.amount} onChange={e => set('amount', e.target.value)} />
        </Field>
        <Field label="Fecha">
          <input className="field-input" type="date" value={form.date} onChange={e => set('date', e.target.value)} />
        </Field>
        <Field label="Estado" hint={form.status === 'comprometido' ? 'Comprometido: ya está contratado pero aún no se paga.' : undefined}>
          <select className="field-select" value={form.status} onChange={e => set('status', e.target.value)}>
            <option value="pagado">Pagado</option>
            <option value="comprometido">Comprometido (por pagar)</option>
          </select>
        </Field>
        {capex ? (
          <Field label="Proyecto CAPEX *">
            <select className="field-select" value={form.project} disabled={!!lockProject} onChange={e => set('project', e.target.value)}>
              <option value="">Selecciona…</option>
              {activeProjects.map(p => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
            </select>
          </Field>
        ) : (
          <Field label="Categoría">
            <select className="field-select" value={form.category} onChange={e => set('category', e.target.value)}>
              {Object.entries(OPEX_CATEGORIES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Field>
        )}
        <Field label="Propiedad" hint="Vacío = gasto general de la cartera.">
          <select className="field-select" value={form.property} onChange={e => setForm(f => ({ ...f, property: e.target.value, space: '' }))}>
            <option value="">Toda la cartera / sin asignar</option>
            {(properties || []).map(p => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
          </select>
        </Field>
        <SpaceField tenantId={tenantId} propertyId={form.property} value={form.space} onChange={v => set('space', v)} />
        <Field label="Proveedor">
          <select className="field-select" value={form.provider} onChange={e => set('provider', e.target.value)}>
            <option value="">— Otro / sin proveedor registrado —</option>
            {(providers || []).map(p => <option key={p.id} value={p.id}>{p.trade_name || p.name}</option>)}
          </select>
        </Field>
        {!form.provider && (
          <Field label="Nombre del proveedor">
            <input className="field-input" value={form.vendor_name} onChange={e => set('vendor_name', e.target.value)} />
          </Field>
        )}
        <Field label="Factura / referencia">
          <input className="field-input" value={form.invoice_ref} onChange={e => set('invoice_ref', e.target.value)} />
        </Field>
        <Field label="Autorizado por">
          <input className="field-input" value={form.approved_by} onChange={e => set('approved_by', e.target.value)} />
        </Field>
        <Field label="Notas" style={{ gridColumn: '1 / -1' }}>
          <textarea className="field-input" rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} />
        </Field>
      </Grid>
    </Modal>
  );
}
