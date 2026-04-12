import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { gastosAPI, cajaChicaAPI, extraFieldsAPI, tenantsAPI, periodsAPI } from '../api/client';
import { todayPeriod, periodLabel, prevPeriod, nextPeriod, fmtDate, PAYMENT_TYPES } from '../utils/helpers';
import { ChevronLeft, ChevronRight, Plus, Edit, Trash2, X, ShoppingBag, DollarSign, Printer, Check, AlertCircle, Lock } from 'lucide-react';
import toast from 'react-hot-toast';

const GASTO_PAYMENT_TYPES = [
  { value: 'transferencia', label: '🏦 Transferencia', short: 'Transferencia' },
  { value: 'cheque', label: '📝 Cheque', short: 'Cheque' },
  { value: 'efectivo', label: '💰 Efectivo', short: 'Efectivo' },
];
const gastoPaymentLabel = (v) => GASTO_PAYMENT_TYPES.find(p => p.value === v)?.short || v || '—';

// Caja Chica NO tiene Transferencia
const CAJA_PAYMENT_TYPES = Object.entries(PAYMENT_TYPES)
  .filter(([k]) => k !== 'transferencia')
  .map(([k, v]) => ({ value: k, ...v }));

function fmt(n) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n ?? 0);
}

function pdfTitle(report, period, tenant) {
  return `${(report || '').trim()} — ${(period || '').trim()} — ${(tenant || '').trim()}`;
}

function fmtShort(n) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n ?? 0);
}

function GastosTable({ rows, isReadOnly, onEdit, onDelete, showBadge }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Concepto</th>
            <th style={{ textAlign: 'right' }}>Monto</th>
            <th>Forma de Pago</th>
            <th>No. Doc</th>
            <th>Fecha</th>
            <th>Proveedor / Notas</th>
            {!isReadOnly && <th style={{ width: 70 }}>Acc.</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map(g => (
            <tr key={g.id}>
              <td style={{ fontWeight: 600, fontSize: 13, color: 'var(--ink-700)' }}>
                {g.field_label || '—'}
                {showBadge && g.bank_reconciled && (
                  <span style={{ marginLeft: 6, fontSize: 10, background: 'var(--teal-50)', color: 'var(--teal-700)', padding: '1px 6px', borderRadius: 10, fontWeight: 700 }}>🏦</span>
                )}
              </td>
              <td style={{ textAlign: 'right', fontWeight: 700, fontSize: 13, color: 'var(--amber-700)' }}>{fmt(g.amount)}</td>
              <td style={{ fontSize: 11 }}>{gastoPaymentLabel(g.payment_type)}</td>
              <td style={{ fontSize: 11, color: 'var(--ink-500)' }}>{g.doc_number || '—'}</td>
              <td style={{ fontSize: 11, color: 'var(--ink-500)' }}>{fmtDate(g.gasto_date)}</td>
              <td style={{ fontSize: 11 }}>
                <div>{g.provider_name || '—'}</div>
                {g.notes && <div style={{ color: 'var(--ink-400)', fontStyle: 'italic', marginTop: 2 }}><AlertCircle size={10} style={{ display:'inline', verticalAlign: -1, marginRight: 3 }} />{g.notes}</div>}
              </td>
              {!isReadOnly && (
                <td style={{ textAlign: 'center' }}>
                  <button className="btn-icon" onClick={() => onEdit(g)}><Edit size={13} /></button>
                  <button className="btn-icon" style={{ color: 'var(--coral-500)' }} onClick={() => onDelete(g)}><Trash2 size={13} /></button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   PDF EJECUTIVO — se muestra solo al imprimir (body.printing-gastos)
   ══════════════════════════════════════════════════════════════ */
function GastosPrintLayout({ tenant, period, gastosConciliados, gastosNoConciliados, cajaChica, totalGastosConciliados, totalGastosNoConciliados, totalCaja }) {

  // Agrupar gastos conciliados por categoría (field_label)
  const gruposConciliados = gastosConciliados.reduce((acc, g) => {
    const cat = g.field_label || 'Sin categoría';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(g);
    return acc;
  }, {});

  const tenantName  = tenant?.razon_social || tenant?.name || 'Condominio';
  const tenantRFC   = tenant?.rfc || '';
  const tenantAddr  = [tenant?.info_calle, tenant?.info_num_externo, tenant?.info_colonia, tenant?.info_ciudad]
    .filter(Boolean).join(', ');
  const tenantLogo  = tenant?.logo || null;
  const genDate     = new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });
  const periodStr   = periodLabel(period);

  const thStyle = {
    background: '#1E3A5F', color: '#fff', fontSize: 9,
    fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
    padding: '6px 8px', textAlign: 'left', borderRight: '1px solid rgba(255,255,255,0.15)',
  };
  const tdStyle = (extra = {}) => ({
    fontSize: 11, padding: '6px 8px', borderBottom: '1px solid #EEE',
    verticalAlign: 'top', ...extra,
  });
  const sectionHeaderStyle = (color = '#1E3A5F', bg = '#EBF0FA') => ({
    display: 'flex', alignItems: 'center', gap: 8,
    background: bg, borderLeft: `4px solid ${color}`,
    padding: '7px 12px', marginBottom: 0, marginTop: 18,
  });

  return (
    <div className="gastos-print-layout" style={{ fontFamily: 'Arial, Helvetica, sans-serif', color: '#1A1612', fontSize: 12 }}>

      {/* ── MEMBRETE ── */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        borderBottom: '3px solid #1E3A5F', paddingBottom: 14, marginBottom: 20,
      }}>
        {/* Logo + Datos tenant */}
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          {tenantLogo && (
            <img src={tenantLogo} alt="Logo" style={{ width: 64, height: 64, objectFit: 'contain', borderRadius: 8 }} />
          )}
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#1E3A5F', lineHeight: 1.2 }}>{tenantName}</div>
            {tenantRFC && <div style={{ fontSize: 10, color: '#555', marginTop: 3 }}>RFC: <strong>{tenantRFC}</strong></div>}
            {tenantAddr && <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>{tenantAddr}</div>}
            {tenant?.phone && <div style={{ fontSize: 10, color: '#666', marginTop: 1 }}>Tel: {tenant.phone}</div>}
          </div>
        </div>
        {/* Título del reporte */}
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#1E3A5F', letterSpacing: '-0.02em' }}>REPORTE DE EGRESOS</div>
          <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>Período: <strong style={{ color: '#1E3A5F' }}>{periodStr}</strong></div>
          <div style={{
            marginTop: 8, display: 'inline-block', padding: '4px 12px',
            background: '#1E3A5F', color: '#fff', borderRadius: 4, fontSize: 10,
            fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
          }}>
            Conciliación Bancaria
          </div>
        </div>
      </div>

      {/* ── SECCIÓN 1: GASTOS CONCILIADOS ── */}
      <div style={sectionHeaderStyle('#0D6E55', '#E6F7F3')}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#0D6E55', flexShrink: 0 }} />
        <span style={{ fontSize: 11, fontWeight: 800, color: '#0D6E55', textTransform: 'uppercase', letterSpacing: '0.07em', flex: 1 }}>
          Gastos Conciliados
        </span>
        <span style={{ fontSize: 10, color: '#555' }}>{gastosConciliados.length} registro(s)</span>
      </div>

      {gastosConciliados.length === 0 ? (
        <div style={{ padding: '10px 12px', fontSize: 11, color: '#999', fontStyle: 'italic', borderBottom: '1px solid #EEE' }}>
          Sin gastos conciliados en este período
        </div>
      ) : (
        Object.entries(gruposConciliados).map(([cat, items]) => {
          const subtotal = items.reduce((s, g) => s + parseFloat(g.amount || 0), 0);
          return (
            <div key={cat} style={{ marginBottom: 6 }}>
              {/* Sub-encabezado de categoría */}
              <div style={{ background: '#F0F7FF', padding: '4px 10px', fontSize: 10, fontWeight: 700, color: '#1E3A5F', borderBottom: '1px solid #DDEEFF', letterSpacing: '0.04em' }}>
                {cat.toUpperCase()}
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, width: '22%' }}>Forma de Pago</th>
                    <th style={{ ...thStyle, width: '12%' }}>No. Doc.</th>
                    <th style={{ ...thStyle, width: '10%' }}>Fecha</th>
                    <th style={{ ...thStyle, width: '22%' }}>Proveedor</th>
                    <th style={{ ...thStyle, width: '22%' }}>RFC / Factura</th>
                    <th style={{ ...thStyle, width: '12%', textAlign: 'right' }}>Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((g, i) => (
                    <tr key={g.id} style={{ background: i % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                      <td style={tdStyle()}>{gastoPaymentLabel(g.payment_type)}</td>
                      <td style={tdStyle({ fontFamily: 'monospace', fontSize: 10 })}>{g.doc_number || '—'}</td>
                      <td style={tdStyle({ fontSize: 10 })}>{fmtDate(g.gasto_date)}</td>
                      <td style={tdStyle()}>
                        {g.provider_name || '—'}
                        {g.notes && <div style={{ fontSize: 9, color: '#888', fontStyle: 'italic', marginTop: 1 }}>{g.notes}</div>}
                      </td>
                      <td style={tdStyle({ fontSize: 10, color: '#555' })}>
                        {g.provider_rfc && <div style={{ fontFamily: 'monospace' }}>{g.provider_rfc}</div>}
                        {g.provider_invoice && <div>Fac: {g.provider_invoice}</div>}
                        {!g.provider_rfc && !g.provider_invoice && '—'}
                      </td>
                      <td style={tdStyle({ textAlign: 'right', fontWeight: 700, color: '#B45309' })}>{fmt(g.amount)}</td>
                    </tr>
                  ))}
                  {/* Subtotal por categoría */}
                  <tr>
                    <td colSpan={5} style={{ padding: '5px 8px', fontSize: 10, fontWeight: 700, color: '#0D6E55', background: '#F0FDF4', borderTop: '1.5px solid #BBF7D0', textAlign: 'right' }}>
                      Subtotal {cat}
                    </td>
                    <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 800, fontSize: 12, color: '#0D6E55', background: '#F0FDF4', borderTop: '1.5px solid #BBF7D0' }}>
                      {fmt(subtotal)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          );
        })
      )}

      {/* Total gastos conciliados */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#0D6E55', color: '#fff', padding: '10px 14px', marginTop: 6, borderRadius: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total Gastos Conciliados</span>
        <span style={{ fontSize: 18, fontWeight: 700 }}>{fmt(totalGastosConciliados)}</span>
      </div>

      {/* ── SECCIÓN 2: GASTOS EN TRÁNSITO (informativo) ── */}
      {gastosNoConciliados.length > 0 && (
        <>
          <div style={{ ...sectionHeaderStyle('#B45309', '#FFFBEB'), marginTop: 22 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#B45309', flexShrink: 0 }} />
            <span style={{ fontSize: 11, fontWeight: 800, color: '#B45309', textTransform: 'uppercase', letterSpacing: '0.07em', flex: 1 }}>
              Gastos en Tránsito — Pendientes de Conciliación
            </span>
            <span style={{ fontSize: 10, color: '#888', fontStyle: 'italic' }}>Solo informativo · no incluido en total</span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, background: '#92400E', width: '28%' }}>Concepto</th>
                <th style={{ ...thStyle, background: '#92400E', width: '20%' }}>Forma de Pago</th>
                <th style={{ ...thStyle, background: '#92400E', width: '14%' }}>No. Doc.</th>
                <th style={{ ...thStyle, background: '#92400E', width: '12%' }}>Fecha</th>
                <th style={{ ...thStyle, background: '#92400E', width: '14%' }}>Proveedor</th>
                <th style={{ ...thStyle, background: '#92400E', width: '12%', textAlign: 'right' }}>Monto</th>
              </tr>
            </thead>
            <tbody>
              {gastosNoConciliados.map((g, i) => (
                <tr key={g.id} style={{ background: i % 2 === 0 ? '#FFFBEB' : '#FEF3C7' }}>
                  <td style={tdStyle({ fontWeight: 600 })}>{g.field_label || '—'}</td>
                  <td style={tdStyle()}>{gastoPaymentLabel(g.payment_type)}</td>
                  <td style={tdStyle({ fontSize: 10, fontFamily: 'monospace' })}>{g.doc_number || '—'}</td>
                  <td style={tdStyle({ fontSize: 10 })}>{fmtDate(g.gasto_date)}</td>
                  <td style={tdStyle()}>{g.provider_name || '—'}</td>
                  <td style={tdStyle({ textAlign: 'right', fontWeight: 700, color: '#92400E' })}>{fmt(g.amount)}</td>
                </tr>
              ))}
              <tr>
                <td colSpan={5} style={{ padding: '5px 8px', fontSize: 10, fontWeight: 700, color: '#92400E', background: '#FEF3C7', borderTop: '1.5px solid #FCD34D', textAlign: 'right' }}>
                  Total en Tránsito (referencial)
                </td>
                <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 800, fontSize: 12, color: '#92400E', background: '#FEF3C7', borderTop: '1.5px solid #FCD34D' }}>
                  {fmt(totalGastosNoConciliados)}
                </td>
              </tr>
            </tbody>
          </table>
        </>
      )}

      {/* ── SECCIÓN 3: CAJA CHICA (informativo) ── */}
      {cajaChica.length > 0 && (
        <>
          <div style={{ ...sectionHeaderStyle('#5B21B6', '#F5F3FF'), marginTop: 22 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#5B21B6', flexShrink: 0 }} />
            <span style={{ fontSize: 11, fontWeight: 800, color: '#5B21B6', textTransform: 'uppercase', letterSpacing: '0.07em', flex: 1 }}>
              Caja Chica
            </span>
            <span style={{ fontSize: 10, color: '#888', fontStyle: 'italic' }}>Solo informativo · no incluido en total</span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, background: '#4C1D95', width: '44%' }}>Descripción</th>
                <th style={{ ...thStyle, background: '#4C1D95', width: '22%' }}>Forma de Pago</th>
                <th style={{ ...thStyle, background: '#4C1D95', width: '16%' }}>Fecha</th>
                <th style={{ ...thStyle, background: '#4C1D95', width: '18%', textAlign: 'right' }}>Monto</th>
              </tr>
            </thead>
            <tbody>
              {cajaChica.map((c, i) => (
                <tr key={c.id} style={{ background: i % 2 === 0 ? '#FAF5FF' : '#F3E8FF' }}>
                  <td style={tdStyle({ fontWeight: 600, color: '#5B21B6' })}>{c.description}</td>
                  <td style={tdStyle()}>{PAYMENT_TYPES[c.payment_type]?.short || c.payment_type || '—'}</td>
                  <td style={tdStyle({ fontSize: 10 })}>{fmtDate(c.date)}</td>
                  <td style={tdStyle({ textAlign: 'right', fontWeight: 700, color: '#5B21B6' })}>{fmt(c.amount)}</td>
                </tr>
              ))}
              <tr>
                <td colSpan={3} style={{ padding: '5px 8px', fontSize: 10, fontWeight: 700, color: '#5B21B6', background: '#EDE9FE', borderTop: '1.5px solid #C4B5FD', textAlign: 'right' }}>
                  Total Caja Chica (referencial)
                </td>
                <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 800, fontSize: 12, color: '#5B21B6', background: '#EDE9FE', borderTop: '1.5px solid #C4B5FD' }}>
                  {fmt(totalCaja)}
                </td>
              </tr>
            </tbody>
          </table>
        </>
      )}

      {/* ── RESUMEN FINAL ── */}
      <div style={{ marginTop: 24, borderTop: '2px solid #1E3A5F', paddingTop: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 20 }}>
          {/* Desglose */}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Desglose</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <tbody>
                <tr>
                  <td style={{ padding: '3px 0', color: '#555' }}>Gastos conciliados</td>
                  <td style={{ textAlign: 'right', fontWeight: 600, color: '#0D6E55' }}>{fmt(totalGastosConciliados)}</td>
                </tr>
                {gastosNoConciliados.length > 0 && (
                  <tr>
                    <td style={{ padding: '3px 0', color: '#888', fontStyle: 'italic' }}>En tránsito (ref.)</td>
                    <td style={{ textAlign: 'right', color: '#B45309', fontStyle: 'italic' }}>{fmt(totalGastosNoConciliados)}</td>
                  </tr>
                )}
                {cajaChica.length > 0 && (
                  <tr>
                    <td style={{ padding: '3px 0', color: '#888', fontStyle: 'italic' }}>Caja chica (ref.)</td>
                    <td style={{ textAlign: 'right', color: '#5B21B6', fontStyle: 'italic' }}>{fmt(totalCaja)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {/* Total principal */}
          <div style={{ background: '#1E3A5F', color: '#fff', padding: '14px 22px', borderRadius: 6, textAlign: 'right', minWidth: 200 }}>
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.75, marginBottom: 4 }}>Total Egresos Conciliados</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{fmt(totalGastosConciliados)}</div>
            <div style={{ fontSize: 9, opacity: 0.6, marginTop: 4 }}>Período {periodStr}</div>
          </div>
        </div>
      </div>

      {/* ── PIE DE PÁGINA ── */}
      <div style={{ marginTop: 18, paddingTop: 10, borderTop: '1px solid #DDD', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 9, color: '#999' }}>
        <span>Generado el {genDate} · Sistema Homly</span>
        <span style={{ fontStyle: 'italic' }}>Documento de uso interno — Conciliación Bancaria</span>
      </div>
    </div>
  );
}

export default function Gastos() {
  const { tenantId, isReadOnly } = useAuth();
  const [period, setPeriod] = useState(todayPeriod());
  const [gastos, setGastos] = useState([]);
  const [cajaChica, setCajaChica] = useState([]);
  const [fields, setFields] = useState([]);
  const [tenant, setTenant] = useState(null);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [gastosCollapsed, setGastosCollapsed] = useState(false);
  const [cajaCollapsed, setCajaCollapsed] = useState(false);
  const [closedPeriods, setClosedPeriods] = useState([]);

  const load = async () => {
    if (!tenantId) return;
    const [g, cc, ef, tn, cp] = await Promise.all([
      gastosAPI.list(tenantId, { period, page_size: 9999 }),
      cajaChicaAPI.list(tenantId, { period, page_size: 9999 }),
      extraFieldsAPI.list(tenantId, { page_size: 9999 }),
      tenantsAPI.get(tenantId).catch(() => ({ data: null })),
      periodsAPI.closedList(tenantId).catch(() => ({ data: [] })),
    ]);
    setGastos(g.data.results || g.data);
    setCajaChica(cc.data.results || cc.data);
    setFields((ef.data.results || ef.data).filter(f => f.field_type === 'gastos' && f.enabled && f.show_in_gastos !== false));
    setTenant(tn.data);
    const cpList = Array.isArray(cp.data) ? cp.data : (cp.data?.results || []);
    setClosedPeriods(cpList);
  };

  useEffect(() => { load(); }, [tenantId, period]);

  const isPeriodClosed = closedPeriods.some(cp => cp.period === period);

  // Separar conciliados y no conciliados
  const gastosConciliados    = gastos.filter(g => g.bank_reconciled);
  const gastosNoConciliados  = gastos.filter(g => !g.bank_reconciled);
  const totalGastosConciliados   = gastosConciliados.reduce((s, g) => s + parseFloat(g.amount || 0), 0);
  const totalGastosNoConciliados = gastosNoConciliados.reduce((s, g) => s + parseFloat(g.amount || 0), 0);
  // Total de gastos = SOLO conciliados (caja chica es informativa)
  const totalGastos = totalGastosConciliados;
  const totalCaja   = cajaChica.reduce((s, c) => s + parseFloat(c.amount || 0), 0);
  // Egresos del periodo = solo gastos conciliados (caja chica NO se suma)
  const totalEgresos = totalGastos;

  const handlePrint = () => {
    const prev = document.title;
    document.title = pdfTitle('Reporte de Egresos', period, tenant?.name);
    document.body.classList.add('printing-gastos');
    window.print();
    setTimeout(() => {
      document.body.classList.remove('printing-gastos');
      document.title = prev;
    }, 1500);
  };

  const saveGasto = async () => {
    const amount = parseFloat(form.amount);
    if (isNaN(amount) || amount < 0) {
      toast.error('El monto debe ser un número válido mayor o igual a 0');
      return;
    }
    if (!form.field) {
      toast.error('Selecciona un concepto');
      return;
    }
    const payload = {
      field: form.field,
      amount,
      period,
      payment_type: form.payment_type || 'transferencia',
      doc_number: form.doc_number || form.invoice_folio || '',
      gasto_date: form.gasto_date || null,
      provider_name: form.provider_name || '',
      provider_rfc: form.provider_rfc || '',
      provider_invoice: form.provider_invoice || '',
      bank_reconciled: !!form.bank_reconciled,
      notes: form.notes || '',
    };
    setSaving(true);
    try {
      if (form.id) await gastosAPI.update(tenantId, form.id, payload);
      else await gastosAPI.create(tenantId, payload);
      toast.success('Gasto guardado');
      setModal(null); load();
    } catch (e) {
      const err = e.response?.data;
      toast.error(
        err?.detail || err?.amount?.[0] || err?.field?.[0] ||
        err?.non_field_errors?.[0] || 'Error al guardar el gasto'
      );
    } finally {
      setSaving(false);
    }
  };

  const saveCaja = async () => {
    try {
      if (form.id) await cajaChicaAPI.update(tenantId, form.id, { ...form, period });
      else await cajaChicaAPI.create(tenantId, { ...form, period });
      toast.success('Registro guardado');
      setModal(null); load();
    } catch { toast.error('Error al guardar'); }
  };

  const handleDeleteGasto = async (g) => {
    if (!window.confirm('¿Eliminar este gasto?')) return;
    try {
      await gastosAPI.delete(tenantId, g.id);
      toast.success('Gasto eliminado');
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'No se pudo eliminar el gasto');
    }
  };

  return (
    <div className="content-fade">

      {/* ── PDF ejecutivo (oculto en pantalla, visible solo al imprimir con body.printing-gastos) ── */}
      <GastosPrintLayout
        tenant={tenant}
        period={period}
        gastosConciliados={gastosConciliados}
        gastosNoConciliados={gastosNoConciliados}
        cajaChica={cajaChica}
        totalGastosConciliados={totalGastosConciliados}
        totalGastosNoConciliados={totalGastosNoConciliados}
        totalCaja={totalCaja}
      />

      {/* ══════════════════════════════════════════════════════
          VISTA DE PANTALLA (oculta al imprimir gastos)
          ══════════════════════════════════════════════════════ */}
      <div className="gastos-screen-only">
        {/* ── Period nav + Action buttons ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
          <div className="period-nav">
            <button className="period-nav-btn" onClick={() => setPeriod(prevPeriod(period))}><ChevronLeft size={16} /></button>
            <input
              type="month"
              className="period-month-select"
              style={{ fontSize: 15, fontWeight: 700 }}
              value={period}
              onChange={e => setPeriod(e.target.value)}
            />
            <button className="period-nav-btn" onClick={() => setPeriod(nextPeriod(period))}><ChevronRight size={16} /></button>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {isPeriodClosed && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '4px 12px', borderRadius: 20,
                background: 'var(--coral-50)', color: 'var(--coral-700)',
                fontSize: 12, fontWeight: 700, border: '1px solid var(--coral-100)',
              }}>
                <Lock size={11}/> Período cerrado
              </span>
            )}
            {!isReadOnly && !isPeriodClosed && (
              <button className="btn btn-primary btn-sm" onClick={() => {
                setForm({ amount: '', field: '', payment_type: 'transferencia', doc_number: '', gasto_date: '', provider_name: '', provider_rfc: '', provider_invoice: '', bank_reconciled: false, notes: '' });
                setModal('gasto');
              }}>
                <Plus size={14} /> Nuevo Gasto
              </button>
            )}
            {!isReadOnly && !isPeriodClosed && (
              <button className="btn btn-outline btn-sm" style={{ borderColor: 'var(--purple-200, var(--sand-200))', color: 'var(--purple-700, var(--ink-700))' }}
                onClick={() => { setForm({ amount: '', description: '', payment_type: 'efectivo' }); setModal('caja'); }}>
                <Plus size={14} /> Caja Chica
              </button>
            )}
            <button className="btn btn-outline btn-sm" onClick={handlePrint}>
              <Printer size={14} /> Descargar PDF
            </button>
          </div>
        </div>

        {/* ── Gastos Conciliados ── */}
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="card-head" style={{ cursor: 'pointer' }} onClick={() => setGastosCollapsed(!gastosCollapsed)}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {gastosCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
              <ShoppingBag size={16} />
              🏦 Gastos Conciliados — {periodLabel(period)}
            </h3>
            <span className="badge badge-teal">{gastosConciliados.length} reg. · {fmt(totalGastosConciliados)}</span>
          </div>
          {!gastosCollapsed && (
            gastosConciliados.length === 0 ? (
              <div className="card-body" style={{ textAlign: 'center', padding: '24px 20px', color: 'var(--ink-400)', fontSize: 13 }}>
                Sin gastos conciliados en este período
              </div>
            ) : (
              <>
                <GastosTable
                  rows={gastosConciliados}
                  isReadOnly={isReadOnly || isPeriodClosed}
                  onEdit={g => { setForm(g); setModal('gasto'); }}
                  onDelete={handleDeleteGasto}
                  showBadge={false}
                />
                <div style={{ padding: '10px 20px', background: 'var(--teal-50)', borderTop: '1px solid var(--teal-100)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 800, fontSize: 13, color: 'var(--teal-700)' }}>TOTAL GASTOS CONCILIADOS</span>
                  <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--teal-700)' }}>{fmt(totalGastosConciliados)}</span>
                </div>
              </>
            )
          )}
        </div>

        {/* ── Gastos NO Conciliados (en tránsito) ── */}
        <div className="card" style={{ marginBottom: 16, border: '1.5px solid var(--amber-200)' }}>
          <div className="card-head" style={{ background: 'var(--amber-50)', cursor: 'pointer' }}
            onClick={() => setGastosCollapsed(!gastosCollapsed)}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--amber-700)' }}>
              {gastosCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
              <ShoppingBag size={16} />
              ⏳ Gastos en Tránsito (No Conciliados) — {periodLabel(period)}
            </h3>
            <span className="badge badge-amber">{gastosNoConciliados.length} reg. · {fmt(totalGastosNoConciliados)}</span>
          </div>
          {!gastosCollapsed && (
            gastosNoConciliados.length === 0 ? (
              <div className="card-body" style={{ textAlign: 'center', padding: '24px 20px', color: 'var(--ink-400)', fontSize: 13 }}>
                Sin gastos pendientes de conciliación
              </div>
            ) : (
              <>
                <GastosTable
                  rows={gastosNoConciliados}
                  isReadOnly={isReadOnly || isPeriodClosed}
                  onEdit={g => { setForm(g); setModal('gasto'); }}
                  onDelete={handleDeleteGasto}
                  showBadge={false}
                />
                <div style={{ padding: '10px 20px', background: 'var(--amber-50)', borderTop: '1px solid var(--amber-100)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 800, fontSize: 13, color: 'var(--amber-700)' }}>
                    TOTAL EN TRÁNSITO
                    <span style={{ fontWeight: 400, fontSize: 11, marginLeft: 8, color: 'var(--ink-400)' }}>(no incluido en total de egresos)</span>
                  </span>
                  <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--amber-700)' }}>{fmt(totalGastosNoConciliados)}</span>
                </div>
              </>
            )
          )}
        </div>

        {/* ── Caja Chica Collapsible Card (purple-themed) ── */}
        <div className="card" style={{ marginTop: 4, border: '1.5px solid var(--purple-200, #DDD6FE)' }}>
          <div className="card-head" style={{ background: 'var(--purple-50)', cursor: 'pointer' }}
            onClick={() => setCajaCollapsed(!cajaCollapsed)}>
            <h3 style={{ color: 'var(--purple-700, #6D28D9)', display: 'flex', alignItems: 'center', gap: 8 }}>
              {cajaCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
              <DollarSign size={16} />
              Caja Chica — {periodLabel(period)}
              <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--ink-400)', marginLeft: 4 }}>(informativo)</span>
            </h3>
            <span className="badge" style={{ background: 'var(--purple-100, #EDE9FE)', color: 'var(--purple-700, #6D28D9)' }}>
              {cajaChica.length} reg. · {fmt(totalCaja)}
            </span>
          </div>
          {!cajaCollapsed && (
            cajaChica.length === 0 ? (
              <div className="card-body" style={{ textAlign: 'center', padding: 24, color: 'var(--ink-400)', fontSize: 13 }}>
                Sin registros de caja chica
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr style={{ background: 'var(--purple-50)' }}>
                      <th>Descripción</th>
                      <th style={{ textAlign: 'right' }}>Monto</th>
                      <th>Tipo</th>
                      <th>Fecha</th>
                      {!isReadOnly && <th style={{ width: 70 }}>Acc.</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {cajaChica.map(c => (
                      <tr key={c.id} style={{ borderBottom: '1px solid var(--sand-100)' }}>
                        <td style={{ fontWeight: 600, color: 'var(--purple-700, #6D28D9)', fontSize: 13 }}>{c.description}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, fontSize: 13, color: 'var(--purple-700, #6D28D9)' }}>{fmt(c.amount)}</td>
                        <td style={{ fontSize: 11 }}>{PAYMENT_TYPES[c.payment_type]?.short || c.payment_type || '—'}</td>
                        <td style={{ fontSize: 11, color: 'var(--ink-500)' }}>{fmtDate(c.date)}</td>
                        {!isReadOnly && (
                          <td style={{ textAlign: 'center' }}>
                            {isPeriodClosed ? (
                              <span title="Período cerrado — solo lectura"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--ink-400)', padding: '2px 6px' }}>
                                <Lock size={12} /> Solo lectura
                              </span>
                            ) : (
                              <>
                                <button className="btn-icon" onClick={() => { setForm(c); setModal('caja'); }}>
                                  <Edit size={13} />
                                </button>
                                <button className="btn-icon" style={{ color: 'var(--coral-500)' }} onClick={async () => {
                                  if (window.confirm('¿Eliminar este registro de caja chica?')) {
                                    await cajaChicaAPI.delete(tenantId, c.id);
                                    toast.success('Eliminado');
                                    load();
                                  }
                                }}>
                                  <Trash2 size={13} />
                                </button>
                              </>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                    <tr style={{ background: 'var(--purple-50)' }}>
                      <td style={{ padding: '10px 12px', fontWeight: 800, color: 'var(--purple-800, #5B21B6)' }}>
                        TOTAL CAJA CHICA
                        <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--ink-400)', marginLeft: 6 }}>(solo informativo)</span>
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: 'var(--purple-800, #5B21B6)', fontSize: 15 }}>{fmt(totalCaja)}</td>
                      <td colSpan={!isReadOnly ? 3 : 2}></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>

        {/* ── Total Egresos Banner ── */}
        <div style={{
          marginTop: 16, padding: 16,
          background: 'var(--teal-50)',
          border: '2px solid var(--teal-200)',
          borderRadius: 'var(--radius-md)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--teal-700)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <ShoppingBag size={16} /> Total Egresos del Período — {periodLabel(period)}
            </div>
            <div style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 4 }}>
              Gastos conciliados: {fmt(totalGastosConciliados)}
            </div>
            <div style={{ fontSize: 10, color: 'var(--ink-300)', marginTop: 2 }}>
              {totalGastosNoConciliados > 0 && (
                <span style={{ color: 'var(--amber-600)' }}>
                  En tránsito (ref.): {fmt(totalGastosNoConciliados)}
                </span>
              )}
              {totalGastosNoConciliados > 0 && totalCaja > 0 && ' · '}
              {totalCaja > 0 && (
                <span style={{ color: 'var(--purple-600, #7C3AED)' }}>
                  Caja chica (ref.): {fmt(totalCaja)}
                </span>
              )}
            </div>
          </div>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 700, color: 'var(--teal-700)' }}>
            {fmt(totalEgresos)}
          </span>
        </div>
      </div>{/* /gastos-screen-only */}

      {/* ── Gasto Modal ── */}
      {modal === 'gasto' && (
        <div className="modal-bg open" onClick={() => setModal(null)}>
          <div className="modal lg" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3><ShoppingBag size={16} style={{ display: 'inline', verticalAlign: -3, marginRight: 8 }} />{form.id ? 'Editar' : 'Nuevo'} Registro de Gasto</h3>
              <button className="modal-close" onClick={() => setModal(null)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="field">
                  <label className="field-label">Concepto <span style={{ color: 'var(--coral-500)' }}>*</span></label>
                  <select className="field-select" value={form.field || ''} onChange={e => setForm(f => ({ ...f, field: e.target.value }))}>
                    <option value="">Seleccionar...</option>
                    {fields.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label className="field-label">Monto <span style={{ color: 'var(--coral-500)' }}>*</span></label>
                  <input type="number" className="field-input" step="0.01" min="0.01" placeholder="0.00" value={form.amount ?? ''} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
                </div>
                <div className="field">
                  <label className="field-label">Tipo de Gasto</label>
                  <select className="field-select" value={form.payment_type || 'transferencia'} onChange={e => setForm(f => ({ ...f, payment_type: e.target.value }))}>
                    {GASTO_PAYMENT_TYPES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label className="field-label">No. Documento</label>
                  <input className="field-input" placeholder="No. cheque, referencia..." value={form.doc_number || form.invoice_folio || ''} onChange={e => setForm(f => ({ ...f, doc_number: e.target.value }))} />
                </div>
                <div className="field">
                  <label className="field-label">Fecha de Gasto</label>
                  <input type="date" className="field-input" value={form.gasto_date || ''} onChange={e => setForm(f => ({ ...f, gasto_date: e.target.value }))} />
                </div>
                <div className="field">
                  <label className="field-label">Conciliado Banco</label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, cursor: 'pointer' }}
                    onClick={e => e.stopPropagation()}>
                    <input type="checkbox" checked={!!form.bank_reconciled}
                      onChange={e => { e.stopPropagation(); setForm(f => ({ ...f, bank_reconciled: e.target.checked })); }} />
                    <span style={{ fontSize: 12, color: 'var(--ink-500)' }}>{form.bank_reconciled ? '🏦 Conciliado' : 'Sin conciliar'}</span>
                  </label>
                </div>
              </div>

              {/* Notas */}
              <div style={{ marginTop: 12 }}>
                <label className="field-label">Notas</label>
                <textarea
                  className="field-input"
                  rows={2}
                  placeholder="Observaciones, descripción adicional del gasto..."
                  value={form.notes || ''}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  style={{ resize: 'vertical', minHeight: 56 }}
                />
              </div>

              <div style={{ marginTop: 12, fontSize: 11, fontWeight: 700, color: 'var(--ink-500)', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid var(--sand-100)', paddingBottom: 6 }}>Proveedor</div>
              <div className="form-grid" style={{ marginTop: 8 }}>
                <div className="field">
                  <label className="field-label">Nombre</label>
                  <input className="field-input" value={form.provider_name || ''} onChange={e => setForm(f => ({ ...f, provider_name: e.target.value }))} placeholder="Nombre del proveedor" />
                </div>
                <div className="field">
                  <label className="field-label">RFC</label>
                  <input className="field-input" style={{ fontFamily: 'monospace' }} value={form.provider_rfc || ''} onChange={e => setForm(f => ({ ...f, provider_rfc: e.target.value }))} placeholder="RFC del proveedor" />
                </div>
                <div className="field">
                  <label className="field-label">No. Factura</label>
                  <input className="field-input" value={form.provider_invoice || ''} onChange={e => setForm(f => ({ ...f, provider_invoice: e.target.value }))} placeholder="Número de factura" />
                </div>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setModal(null)} disabled={saving}>Cancelar</button>
              <button className="btn btn-primary" onClick={saveGasto} disabled={saving}>
                <Check size={14} /> {saving ? 'Guardando…' : form.id ? 'Guardar' : 'Registrar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Caja Chica Modal (sin Transferencia) ── */}
      {modal === 'caja' && (
        <div className="modal-bg open" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3>{form.id ? 'Editar' : 'Nuevo'} Registro de Caja Chica</h3>
              <button className="modal-close" onClick={() => setModal(null)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="field field-full">
                  <label className="field-label">Descripción</label>
                  <input className="field-input" value={form.description || ''} onChange={e => setForm({ ...form, description: e.target.value })} />
                </div>
                <div className="field">
                  <label className="field-label">Monto</label>
                  <input type="number" className="field-input" step="0.01" min="0" value={form.amount || ''} onChange={e => setForm({ ...form, amount: e.target.value })} />
                </div>
                <div className="field">
                  <label className="field-label">Forma de Pago</label>
                  <select className="field-select" value={form.payment_type || 'efectivo'} onChange={e => setForm({ ...form, payment_type: e.target.value })}>
                    {CAJA_PAYMENT_TYPES.map(p => (
                      <option key={p.value} value={p.value}>{p.short || p.label}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label className="field-label">Fecha</label>
                  <input type="date" className="field-input" value={form.date || ''} onChange={e => setForm({ ...form, date: e.target.value })} />
                </div>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-outline" onClick={() => setModal(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={saveCaja}>Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
