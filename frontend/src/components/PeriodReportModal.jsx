import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import { Download, FileText, Loader2, X } from 'lucide-react';

function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function monthStart(d = new Date()) {
  return isoDate(new Date(d.getFullYear(), d.getMonth(), 1));
}

function lastMonthRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const to = new Date(now.getFullYear(), now.getMonth(), 0);
  return { from: isoDate(from), to: isoDate(to) };
}

function lastDays(n) {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - (n - 1));
  return { from: isoDate(from), to: isoDate(to) };
}

async function downloadPdf(request, filename) {
  const r = await request();
  const raw = r.data;
  const blob = raw instanceof Blob ? raw : new Blob([raw], { type: 'application/pdf' });
  if (blob.type && blob.type.includes('json')) {
    throw new Error('No se pudo generar el PDF');
  }
  if (blob.size < 80) throw new Error('No se pudo generar el PDF');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

const PRESETS = [
  { key: 'month', label: 'Este mes' },
  { key: 'last', label: 'Mes anterior' },
  { key: '7', label: 'Últimos 7 días' },
  { key: '30', label: 'Últimos 30 días' },
];

export default function PeriodReportModal({
  title,
  subtitle,
  tenantName,
  onClose,
  loadReport,
  downloadReport,
  filenamePrefix,
}) {
  const [preset, setPreset] = useState('month');
  const [dateFrom, setDateFrom] = useState(monthStart());
  const [dateTo, setDateTo] = useState(isoDate(new Date()));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const params = useMemo(() => ({ date_from: dateFrom, date_to: dateTo }), [dateFrom, dateTo]);

  const applyPreset = (key) => {
    setPreset(key);
    if (key === 'month') {
      setDateFrom(monthStart());
      setDateTo(isoDate(new Date()));
    } else if (key === 'last') {
      const range = lastMonthRange();
      setDateFrom(range.from);
      setDateTo(range.to);
    } else if (key === '7') {
      const range = lastDays(7);
      setDateFrom(range.from);
      setDateTo(range.to);
    } else if (key === '30') {
      const range = lastDays(30);
      setDateFrom(range.from);
      setDateTo(range.to);
    }
  };

  const load = (nextParams = params) => {
    if (nextParams.date_from && nextParams.date_to && nextParams.date_to < nextParams.date_from) {
      toast.error('La fecha final debe ser igual o posterior a la inicial');
      return;
    }
    setLoading(true);
    loadReport(nextParams)
      .then(r => setData(r.data))
      .catch(() => {
        toast.error('No se pudo cargar el reporte');
        setData(null);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(params); }, [params.date_from, params.date_to]);

  useEffect(() => {
    const onKey = (ev) => { if (ev.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const onDownload = async () => {
    setDownloading(true);
    try {
      await downloadPdf(
        () => downloadReport(params),
        `${filenamePrefix}_${dateFrom}_${dateTo}.pdf`,
      );
      toast.success('PDF descargado');
    } catch {
      toast.error('No se pudo descargar el PDF');
    } finally {
      setDownloading(false);
    }
  };

  const items = data?.items || [];
  const columns = data?.columns || [];
  const summary = data?.summary || [];
  const heading = data?.title || title;
  const condo = data?.tenant_name || tenantName || 'Condominio';

  return createPortal(
    <div className="ops-report-overlay" onClick={onClose}>
      <div className="ops-report-modal" onClick={e => e.stopPropagation()}>
        <div className="ops-report-head">
          <div style={{ display: 'flex', gap: 12, minWidth: 0 }}>
            <div style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 10, background: 'var(--teal-50)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--teal-700)' }}>
              <FileText size={18} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 800, lineHeight: 1.3 }}>{heading}</div>
              <div style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: 4, lineHeight: 1.4 }}>
                {condo}{subtitle ? ` · ${subtitle}` : ''}
              </div>
            </div>
          </div>
          <button className="btn-icon" onClick={onClose} style={{ flexShrink: 0 }}><X size={18} /></button>
        </div>

        <div className="ops-report-filters">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {PRESETS.map(item => (
              <button
                key={item.key}
                type="button"
                className={`btn ${preset === item.key ? 'btn-primary' : 'btn-outline'} btn-sm`}
                onClick={() => applyPreset(item.key)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, alignItems: 'end' }}>
            <div className="field" style={{ margin: 0 }}>
              <div className="field-label">Desde</div>
              <input
                type="date"
                className="field-input"
                value={dateFrom}
                onChange={e => { setPreset(''); setDateFrom(e.target.value); }}
              />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <div className="field-label">Hasta</div>
              <input
                type="date"
                className="field-input"
                value={dateTo}
                onChange={e => { setPreset(''); setDateTo(e.target.value); }}
              />
            </div>
          </div>
        </div>

        <div className="ops-report-body">
          {loading ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--ink-400)' }}>
              <Loader2 size={20} className="animate-spin" style={{ marginRight: 8 }} /> Cargando reporte...
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10, marginBottom: 16 }}>
                {summary.map(card => (
                  <div key={card.key} className="card" style={{ padding: 14, margin: 0 }}>
                    <div style={{ fontSize: 11, color: 'var(--ink-400)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{card.label}</div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--teal-700)', lineHeight: 1.15, marginTop: 6 }}>{card.value}</div>
                  </div>
                ))}
              </div>
              {data?.note && (
                <p style={{ fontSize: 12, color: 'var(--ink-400)', margin: '0 0 12px', lineHeight: 1.45 }}>{data.note}</p>
              )}
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                {items.length === 0 ? (
                  <div style={{ padding: 28, textAlign: 'center', color: 'var(--ink-400)', lineHeight: 1.45 }}>
                    No hay registros en el periodo seleccionado.
                  </div>
                ) : (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          {columns.map(col => <th key={col.key}>{col.label}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {items.map(row => (
                          <tr key={row.id}>
                            {columns.map(col => (
                              <td key={col.key} style={{ fontSize: 13, verticalAlign: 'middle' }}>
                                {col.key === 'folio' ? (
                                  <span style={{ fontFamily: 'monospace', fontWeight: 800, color: 'var(--teal-700)' }}>{row[col.key]}</span>
                                ) : (row[col.key] || '—')}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="ops-report-foot">
          <button className="btn btn-outline" onClick={onClose}>Cerrar</button>
          <button className="btn btn-primary" onClick={onDownload} disabled={downloading || loading}>
            <Download size={14} /> {downloading ? 'Generando…' : 'Descargar PDF'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
