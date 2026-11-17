import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Download, Pencil, Plus, Receipt, Trash2 } from 'lucide-react';
import { rentalAPI } from '../../api/client';
import { Empty, errMsg, fmtD, SearchBar } from './opsUi';
import { CAPEX_CATEGORIES, downloadCSV, MONTHS, mon, OPEX_CATEGORIES } from './capexUi';
import ExpenseModal from './CapexExpenseModal';
import { SpaceFilter } from './SpaceField';

const KIND_STYLE = {
  opex: { label: 'OPEX', color: 'var(--blue-700)', bg: 'var(--blue-50)' },
  capex: { label: 'CAPEX', color: 'var(--purple-700, #6d28d9)', bg: '#f3e8ff' },
};

export default function LedgerTab({ tenantId, canWrite, year, projects, properties, providers, onChanged, onOpenProject }) {
  const [urlParams] = useSearchParams();
  const [filters, setFilters] = useState({ month: '', kind: '', category: '', property: urlParams.get('property') || '', space: urlParams.get('space') || '', status: '', source: '', q: '' });
  const [q, setQ] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => setFilters(f => (f.q === q ? f : { ...f, q })), 300);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = Object.fromEntries(Object.entries({ year, ...filters }).filter(([, v]) => v !== ''));
      const { data: d } = await rentalAPI.ops.finance.ledger(tenantId, params);
      setData(d);
    } catch {
      toast.error('No se pudo cargar el libro de gastos');
    } finally {
      setLoading(false);
    }
  }, [tenantId, year, filters]);

  useEffect(() => { load(); }, [load]);

  const set = (k, v) => setFilters(f => ({ ...f, [k]: v }));
  const after = () => { setModal(null); load(); onChanged(); };

  const edit = async (row) => {
    try {
      const { data: e } = await rentalAPI.ops.finance.expenses.get(tenantId, row.id);
      setModal(e);
    } catch {
      toast.error('No se pudo abrir el gasto');
    }
  };
  const remove = async (row) => {
    if (!window.confirm(`¿Eliminar "${row.concept}"?`)) return;
    try {
      await rentalAPI.ops.finance.expenses.remove(tenantId, row.id);
      toast.success('Gasto eliminado');
      load();
      onChanged();
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo eliminar'));
    }
  };

  const exportCsv = () => {
    if (!data?.rows?.length) return;
    downloadCSV(`gastos-${year}.csv`, [
      { label: 'Fecha', value: 'date' },
      { label: 'Tipo', value: r => r.kind.toUpperCase() },
      { label: 'Estado', value: 'status' },
      { label: 'Categoría', value: 'category_label' },
      { label: 'Concepto', value: 'concept' },
      { label: 'Propiedad', value: r => [r.property_code, r.property_name].filter(Boolean).join(' ') },
      { label: 'Espacio', value: r => [r.space_code, r.space_name].filter(Boolean).join(' ') },
      { label: 'Proyecto', value: 'project_code' },
      { label: 'Proveedor', value: 'vendor' },
      { label: 'Referencia', value: 'ref' },
      { label: 'Origen', value: r => (r.source === 'orden' ? 'Orden de trabajo' : 'Manual') },
      { label: 'Monto', value: 'amount' },
    ], data.rows);
  };

  const t = data?.totals || {};
  const tiles = [
    ['OPEX pagado', t.opex_paid, 'var(--blue-700)'],
    ['OPEX comprometido', t.opex_committed, 'var(--ink-500)'],
    ['CAPEX pagado', t.capex_paid, 'var(--purple-700, #6d28d9)'],
    ['CAPEX comprometido', t.capex_committed, 'var(--ink-500)'],
  ];

  return (
    <>
      <div className="rd-mini-grid" style={{ marginBottom: 14 }}>
        {tiles.map(([l, v, c]) => (
          <div key={l} className="rd-mini"><div className="rd-mini-label">{l}</div><div className="rd-mini-value" style={{ color: c }}>{mon(v)}</div></div>
        ))}
      </div>

      <div className="card" style={{ padding: 12, marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <SearchBar value={q} onChange={setQ} placeholder="Buscar concepto, proveedor, folio…" />
          <select className="field-select" style={{ maxWidth: 110 }} value={filters.month} onChange={e => set('month', e.target.value)}>
            <option value="">Todo el año</option>
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <select className="field-select" style={{ maxWidth: 110 }} value={filters.kind} onChange={e => set('kind', e.target.value)}>
            <option value="">OPEX + CAPEX</option><option value="opex">Solo OPEX</option><option value="capex">Solo CAPEX</option>
          </select>
          <select className="field-select" style={{ maxWidth: 180 }} value={filters.category} onChange={e => set('category', e.target.value)}>
            <option value="">Todas las categorías</option>
            <optgroup label="OPEX">{Object.entries(OPEX_CATEGORIES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</optgroup>
            <optgroup label="CAPEX">{Object.entries(CAPEX_CATEGORIES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</optgroup>
          </select>
          <select className="field-select" style={{ maxWidth: 170 }} value={filters.property} onChange={e => setFilters(f => ({ ...f, property: e.target.value, space: '' }))}>
            <option value="">Todas las propiedades</option>
            {properties.map(p => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
          </select>
          <SpaceFilter tenantId={tenantId} propertyId={filters.property} value={filters.space} onChange={v => set('space', v)} style={{ maxWidth: 170 }} />
          <select className="field-select" style={{ maxWidth: 140 }} value={filters.status} onChange={e => set('status', e.target.value)}>
            <option value="">Pagado y comprometido</option><option value="pagado">Pagado</option><option value="comprometido">Comprometido</option>
          </select>
          <select className="field-select" style={{ maxWidth: 140 }} value={filters.source} onChange={e => set('source', e.target.value)}>
            <option value="">Todo origen</option><option value="manual">Manual</option><option value="orden">Órdenes de trabajo</option>
          </select>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            <button className="btn btn-outline btn-sm" onClick={exportCsv} disabled={!data?.rows?.length}><Download size={13} /> CSV</button>
            {canWrite && <button className="btn btn-primary btn-sm" onClick={() => setModal({})}><Plus size={13} /> Nuevo gasto</button>}
          </div>
        </div>
      </div>

      {!loading && data?.rows?.length === 0 ? (
        <Empty icon={Receipt} text="No hay movimientos con estos filtros. Registra gastos o liga costos desde Órdenes de trabajo: aparecerán aquí automáticamente." />
      ) : (
        <div className="card" style={{ overflowX: 'auto' }}>
          <table className="table" style={{ minWidth: 820 }}>
            <thead>
              <tr><th>Fecha</th><th>Tipo</th><th>Concepto</th><th>Categoría</th><th>Propiedad</th><th>Origen</th><th style={{ textAlign: 'right' }}>Monto</th><th /></tr>
            </thead>
            <tbody>
              {(data?.rows || []).map(r => {
                const k = KIND_STYLE[r.kind];
                return (
                  <tr key={`${r.source}-${r.id}`}>
                    <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{fmtD(r.date)}</td>
                    <td><span className="proj-chip" style={{ color: k.color, background: k.bg }}>{k.label}</span></td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{r.concept}</div>
                      <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>
                        {[r.vendor, r.ref && r.source === 'manual' && `Ref. ${r.ref}`].filter(Boolean).join(' · ')}
                        {r.project_code && (
                          <> {r.vendor ? '· ' : ''}<button className="cx-link" onClick={() => onOpenProject(r.project)}>{r.project_code}</button></>
                        )}
                      </div>
                    </td>
                    <td style={{ fontSize: 12 }}>{r.category_label}</td>
                    <td style={{ fontSize: 12 }}>{r.property_code ? `${r.property_code}${r.space_code ? ` / ${r.space_code}` : ''}` : <span style={{ color: 'var(--ink-300)' }}>General</span>}</td>
                    <td style={{ fontSize: 11.5 }}>
                      {r.source === 'orden' ? <span style={{ color: 'var(--teal-700)', fontWeight: 700 }}>Orden de trabajo</span> : 'Manual'}
                      {r.status === 'comprometido' && <div style={{ color: 'var(--amber-700)', fontWeight: 700 }}>Comprometido</div>}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 800, color: r.status === 'comprometido' ? 'var(--ink-400)' : undefined }}>{mon(r.amount)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {canWrite && r.editable && (<>
                        <button className="btn-icon" onClick={() => edit(r)}><Pencil size={14} /></button>
                        <button className="btn-icon" onClick={() => remove(r)}><Trash2 size={14} /></button>
                      </>)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {data?.truncated && <div style={{ padding: 10, fontSize: 12, color: 'var(--ink-400)' }}>Se muestran los primeros 1,500 movimientos. Afina los filtros para ver el resto.</div>}
        </div>
      )}

      {modal && (
        <ExpenseModal
          tenantId={tenantId} initial={modal.id ? modal : null}
          projects={projects} properties={properties} providers={providers}
          onClose={() => setModal(null)} onSaved={after}
        />
      )}
    </>
  );
}
