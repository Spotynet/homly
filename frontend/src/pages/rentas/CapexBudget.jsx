import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { Copy, Pencil, Plus, Trash2 } from 'lucide-react';
import { rentalAPI } from '../../api/client';
import { errMsg, Field, Grid, Modal } from './opsUi';
import SpaceField from './SpaceField';
import { BudgetBar, COLORS, MONTHS, mon, num, OPEX_CATEGORIES, pctTxt } from './capexUi';

const zero12 = () => Array(12).fill(0);

export default function BudgetTab({ tenantId, canWrite, year, lines, summary, properties, reload }) {
  const [modal, setModal] = useState(null);
  const [copy, setCopy] = useState(null);

  const k = summary?.kpis || {};
  const cats = Object.fromEntries((summary?.categories || []).map(c => [c.key, c]));
  const portfolioLine = (kind, category) => lines.find(l => l.kind === kind && l.category === category && !l.property && !l.space);
  const scoped = lines.filter(l => l.property);
  const capexLine = portfolioLine('capex', 'total');

  const open = (kind, category, existing) => setModal(existing
    ? { ...existing, property: existing.property || '', space: existing.space || '' }
    : { kind, category, property: '', space: '', months: zero12(), year, notes: '' });

  return (
    <>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head" style={{ flexWrap: 'wrap', gap: 10 }}>
          <h3>Presupuesto OPEX {year}</h3>
          <span style={{ fontSize: 12, color: 'var(--ink-400)' }}>
            Presupuesto anual {mon(k.opex_budget_year)} · acumulado a la fecha {mon(k.opex_budget_ytd)} · real {mon(k.opex_ytd)}
            {k.opex_variance_pct != null && (
              <b style={{ color: k.opex_variance_pct > 5 ? 'var(--coral-600)' : 'var(--teal-700)', marginLeft: 6 }}>
                ({k.opex_variance_pct > 0 ? '+' : ''}{k.opex_variance_pct}%)
              </b>
            )}
          </span>
          {canWrite && (
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              <button className="btn btn-outline btn-sm" onClick={() => setCopy({ from_year: year - 1, to_year: year, factor: 1.05 })}><Copy size={13} /> Copiar de otro año</button>
              <button className="btn btn-outline btn-sm" onClick={() => setModal({ kind: 'opex', category: 'otros', property: '', space: '', months: zero12(), year, notes: '', scoped: true })}><Plus size={13} /> Partida por propiedad / espacio</button>
            </div>
          )}
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="table" style={{ minWidth: 760 }}>
            <thead>
              <tr><th>Categoría</th><th style={{ textAlign: 'right' }}>Anual</th><th style={{ textAlign: 'right' }}>Acumulado</th><th style={{ textAlign: 'right' }}>Real</th><th style={{ width: 200 }}>Uso del presupuesto</th><th /></tr>
            </thead>
            <tbody>
              {Object.entries(OPEX_CATEGORIES).map(([key, label]) => {
                const c = cats[key] || { actual: 0, committed: 0, budget_year: 0, budget_ytd: 0 };
                const line = portfolioLine('opex', key);
                const over = c.budget_ytd > 0 && c.actual > c.budget_ytd * 1.05;
                const usage = c.budget_year > 0 ? c.actual / c.budget_year * 100 : null;
                return (
                  <tr key={key}>
                    <td style={{ fontWeight: 600 }}>{label}</td>
                    <td style={{ textAlign: 'right' }}>{mon(c.budget_year, { dash: true })}</td>
                    <td style={{ textAlign: 'right' }}>{mon(c.budget_ytd, { dash: true })}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: over ? 'var(--coral-600)' : undefined }}>{mon(c.actual, { dash: true })}</td>
                    <td>
                      {c.budget_year > 0 ? (
                        <>
                          <BudgetBar budget={c.budget_year} spent={c.actual} committed={c.committed} height={7} showText={false} />
                          <div style={{ fontSize: 10.5, color: 'var(--ink-400)', marginTop: 3 }}>{pctTxt(usage)} del anual{c.committed > 0 ? ` · ${mon(c.committed)} comprometido` : ''}</div>
                        </>
                      ) : <span style={{ fontSize: 11, color: 'var(--ink-300)' }}>Sin presupuesto</span>}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {canWrite && <button className="btn btn-outline btn-sm" onClick={() => open('opex', key, line)}>{line ? <><Pencil size={12} /> Editar</> : <><Plus size={12} /> Definir</>}</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {scoped.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-head"><h3>Partidas por propiedad y espacio</h3></div>
          <div className="rd-card-body">
            {scoped.map(l => (
              <div key={l.id} className="rd-row">
                <div className="rd-row-main">
                  <div className="rd-row-title">{l.property_code}{l.space_code ? ` / ${l.space_code}` : ''} · {l.category_label}</div>
                  <div className="rd-row-sub">{l.kind.toUpperCase()}{l.notes ? ` · ${l.notes}` : ''}</div>
                </div>
                <b>{mon(l.total)}</b>
                {canWrite && <button className="btn-icon" onClick={() => open(l.kind, l.category, l)}><Pencil size={14} /></button>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-head"><h3>Techo de inversión CAPEX {year}</h3></div>
        <div className="rd-card-body">
          <div className="rd-hint" style={{ fontSize: 12.5, color: 'var(--ink-500)', marginBottom: 10 }}>
            Define cuánto puedes invertir en el año. Se compara contra lo ya comprometido en proyectos activos y lo ejecutado.
          </div>
          <div className="rd-mini-grid" style={{ marginBottom: 12 }}>
            <div className="rd-mini"><div className="rd-mini-label">Techo del año</div><div className="rd-mini-value">{mon(k.capex_budget_year, { dash: true })}</div></div>
            <div className="rd-mini"><div className="rd-mini-label">Ejecutado en {year}</div><div className="rd-mini-value">{mon(k.capex)}</div></div>
            <div className="rd-mini"><div className="rd-mini-label">Proyectos activos</div><div className="rd-mini-value">{mon(k.capex_active_budget)}</div><div className="rd-mini-sub">presupuesto aprobado</div></div>
            <div className="rd-mini"><div className="rd-mini-label">Pipeline</div><div className="rd-mini-value">{mon(k.capex_pipeline)}</div><div className="rd-mini-sub">propuestas por aprobar</div></div>
          </div>
          {num(k.capex_budget_year) > 0 && (
            <BudgetBar budget={k.capex_budget_year} spent={k.capex} committed={k.capex_committed} height={10} />
          )}
          {canWrite && (
            <button className="btn btn-outline btn-sm" style={{ marginTop: 12 }} onClick={() => open('capex', 'total', capexLine)}>
              {capexLine ? <><Pencil size={12} /> Editar techo</> : <><Plus size={12} /> Definir techo CAPEX</>}
            </button>
          )}
        </div>
      </div>

      {modal && <BudgetModal tenantId={tenantId} line={modal} properties={properties} onClose={() => setModal(null)} onSaved={() => { setModal(null); reload(); }} />}
      {copy && <CopyModal tenantId={tenantId} init={copy} onClose={() => setCopy(null)} onDone={() => { setCopy(null); reload(); }} />}
    </>
  );
}

function BudgetModal({ tenantId, line, properties, onClose, onSaved }) {
  const editing = !!line.id;
  const [form, setForm] = useState(() => ({ ...line, months: (line.months?.length === 12 ? line.months : zero12()).map(Number) }));
  const [annual, setAnnual] = useState('');
  const [saving, setSaving] = useState(false);
  const total = form.months.reduce((s, x) => s + num(x), 0);
  const setMonth = (i, v) => setForm(f => ({ ...f, months: f.months.map((x, j) => (j === i ? v : x)) }));
  const spread = () => {
    const n = num(annual);
    if (n <= 0) return toast.error('Captura el monto anual');
    const m = Math.round((n / 12) * 100) / 100;
    setForm(f => ({ ...f, months: Array(12).fill(m) }));
  };
  const isCapex = form.kind === 'capex';

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        year: form.year, kind: form.kind, category: form.category, property: form.property || null,
        space: form.property && form.space ? form.space : null,
        months: form.months.map(x => num(x)), notes: form.notes || '',
      };
      if (editing) await rentalAPI.ops.finance.budget.update(tenantId, form.id, payload);
      else await rentalAPI.ops.finance.budget.create(tenantId, payload);
      toast.success('Presupuesto guardado');
      onSaved();
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo guardar'));
    } finally {
      setSaving(false);
    }
  };
  const remove = async () => {
    if (!window.confirm('¿Eliminar esta partida?')) return;
    try {
      await rentalAPI.ops.finance.budget.remove(tenantId, form.id);
      toast.success('Partida eliminada');
      onSaved();
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo eliminar'));
    }
  };

  return (
    <Modal
      title={isCapex ? `Techo CAPEX ${form.year}` : `Presupuesto ${form.year}`}
      subtitle={isCapex ? 'Inversión total que planeas ejecutar en el año.' : (OPEX_CATEGORIES[form.category] || '')}
      onClose={onClose}
      footer={(
        <>
          {editing && <button className="btn btn-outline" style={{ color: 'var(--coral-600)', marginRight: 'auto' }} onClick={remove}><Trash2 size={14} /> Eliminar</button>}
          <button className="btn btn-outline" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
        </>
      )}
    >
      {line.scoped && !editing && (
        <Grid cols={2}>
          <Field label="Categoría">
            <select className="field-select" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
              {Object.entries(OPEX_CATEGORIES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Field>
          <Field label="Propiedad *">
            <select className="field-select" value={form.property} onChange={e => setForm(f => ({ ...f, property: e.target.value, space: '' }))}>
              <option value="">Selecciona…</option>
              {properties.map(p => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
            </select>
          </Field>
          <SpaceField tenantId={tenantId} propertyId={form.property} value={form.space} onChange={v => setForm(f => ({ ...f, space: v }))} />
        </Grid>
      )}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <Field label="Monto anual" style={{ flex: 1 }}>
          <input className="field-input" type="number" min="0" value={annual} onChange={e => setAnnual(e.target.value)} placeholder="Captura el total y distribúyelo parejo" />
        </Field>
        <button className="btn btn-outline" onClick={spread}>Distribuir parejo</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8 }}>
        {MONTHS.map((m, i) => (
          <label key={m} style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-500)' }}>
            {m}
            <input className="field-input" type="number" min="0" style={{ marginTop: 3 }} value={form.months[i]} onChange={e => setMonth(i, e.target.value)} />
          </label>
        ))}
      </div>
      <div style={{ textAlign: 'right', fontWeight: 800, color: COLORS.tealDark }}>Total anual: {mon(total)}</div>
      <Field label="Notas">
        <input className="field-input" value={form.notes || ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
      </Field>
    </Modal>
  );
}

function CopyModal({ tenantId, init, onClose, onDone }) {
  const [f, setF] = useState(init);
  const [saving, setSaving] = useState(false);
  const run = async () => {
    setSaving(true);
    try {
      const { data } = await rentalAPI.ops.finance.budget.copyYear(tenantId, { ...f, factor: Number(f.factor) || 1 });
      toast.success(data.created ? `${data.created} partida(s) copiadas` : 'No había partidas nuevas por copiar');
      onDone();
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo copiar'));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal title="Copiar presupuesto" subtitle="Usa un año como base y ajústalo por inflación o crecimiento." onClose={onClose}
      footer={(<><button className="btn btn-outline" onClick={onClose}>Cancelar</button><button className="btn btn-primary" onClick={run} disabled={saving}>Copiar</button></>)}>
      <Grid cols={3}>
        <Field label="Desde el año"><input className="field-input" type="number" value={f.from_year} onChange={e => setF({ ...f, from_year: e.target.value })} /></Field>
        <Field label="Al año"><input className="field-input" type="number" value={f.to_year} onChange={e => setF({ ...f, to_year: e.target.value })} /></Field>
        <Field label="Factor" hint="1.05 = +5 %"><input className="field-input" type="number" step="0.01" value={f.factor} onChange={e => setF({ ...f, factor: e.target.value })} /></Field>
      </Grid>
    </Modal>
  );
}
