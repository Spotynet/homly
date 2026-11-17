import { BRAND_HEADER_CSS, brandHeaderHtml, nowLabel } from './reportBrand';

/** Utilidades de exportación y formato para reportes. */

const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function fmtCell(value, type) {
  if (value === null || value === undefined || value === '') return '—';
  if (type === 'money') return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 }).format(Number(value) || 0);
  if (type === 'date') {
    const d = new Date(`${String(value).slice(0, 10)}T12:00:00`);
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  if (type === 'number') return Number(value).toLocaleString('es-MX');
  return String(value);
}

function rawCell(value, type) {
  if (value === null || value === undefined) return '';
  if (type === 'money' || type === 'number') return Number(value);
  return String(value);
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const stamp = () => new Date().toISOString().slice(0, 10);

/** CSV con BOM para que Excel respete los acentos. */
export function exportCSV(columns, rows, name = 'reporte') {
  const head = columns.map(c => `"${c.label.replace(/"/g, '""')}"`).join(',');
  const body = rows.map(r => columns.map(c => {
    const v = rawCell(r[c.key], c.type);
    return typeof v === 'number' ? String(v) : `"${String(v).replace(/"/g, '""')}"`;
  }).join(',')).join('\r\n');
  download(new Blob([`\ufeff${head}\r\n${body}`], { type: 'text/csv;charset=utf-8' }), `${name}-${stamp()}.csv`);
}

function xlsBrandBlock(brand) {
  const logo = brand.logo && brand.logo.startsWith('data:') ? `<img src="${esc(brand.logo)}" height="48" alt="" /><br/>` : '';
  const lines = [brand.alias, brand.rfc && `RFC: ${brand.rfc}`, brand.address].filter(Boolean).map(l => `<div>${esc(l)}</div>`).join('');
  return `<div style="margin-bottom:8px">${logo}<div style="font-size:16px;font-weight:bold">${esc(brand.name || '')}</div>${lines}`
    + `<div style="color:#6b7280">Administrar Propiedades · Generado: ${esc(nowLabel())}${brand.generatedBy ? ` · ${esc(brand.generatedBy)}` : ''}</div></div>`;
}

/** Libro de Excel (HTML tabular .xls) con encabezado, totales y formato numérico. */
export function exportXLS(columns, rows, name = 'reporte', { title, totals, brand } = {}) {
  const th = columns.map(c => `<th style="background:#0f766e;color:#fff;border:1px solid #ccc">${esc(c.label)}</th>`).join('');
  const body = rows.map(r => `<tr>${columns.map(c => {
    const v = rawCell(r[c.key], c.type);
    const fmt = c.type === 'money' ? ' style="mso-number-format:\'\\#\\,\\#\\#0\\.00\';border:1px solid #ddd"' : ' style="border:1px solid #ddd"';
    return `<td${fmt}>${esc(v)}</td>`;
  }).join('')}</tr>`).join('');
  const foot = totals
    ? `<tr>${columns.map((c, i) => `<td style="font-weight:bold;background:#f3efe7;border:1px solid #ccc">${i === 0 ? 'Totales' : (totals[c.key] !== undefined ? esc(totals[c.key]) : '')}</td>`).join('')}</tr>`
    : '';
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body>`
    + `${brand ? xlsBrandBlock(brand) : ''}${title ? `<h3>${esc(title)}</h3>` : ''}<table><thead><tr>${th}</tr></thead><tbody>${body}${foot}</tbody></table></body></html>`;
  download(new Blob([`\ufeff${html}`], { type: 'application/vnd.ms-excel;charset=utf-8' }), `${name}-${stamp()}.xls`);
}

/** Imprime (o guarda como PDF) una tabla con encabezado corporativo. */
export function printReport({ title, subtitle, columns, rows, totals, brand }) {
  const w = window.open('', '_blank', 'width=1100,height=800');
  if (!w) return false;
  const th = columns.map(c => `<th>${esc(c.label)}</th>`).join('');
  const body = rows.map(r => `<tr>${columns.map(c => `<td class="${c.type === 'money' || c.type === 'number' ? 'n' : ''}">${esc(fmtCell(r[c.key], c.type))}</td>`).join('')}</tr>`).join('');
  const foot = totals
    ? `<tr class="t">${columns.map((c, i) => `<td class="n">${i === 0 ? 'Totales' : (totals[c.key] !== undefined ? esc(fmtCell(totals[c.key], c.type)) : '')}</td>`).join('')}</tr>`
    : '';
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
    body{font-family:Arial,Helvetica,sans-serif;color:#1f2933;margin:24px}
    .sub{font-size:12px;color:#6b7280;margin:0 0 12px}
    table{border-collapse:collapse;width:100%;font-size:10.5px} th{background:#0f766e;color:#fff;text-align:left;padding:6px 8px}
    td{padding:5px 8px;border-bottom:1px solid #e5e7eb} td.n{text-align:right;white-space:nowrap} tr.t td{font-weight:700;background:#f3efe7}
    thead{display:table-header-group} tr{break-inside:avoid}
    ${BRAND_HEADER_CSS}
    *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
    @media print{@page{size:landscape;margin:12mm}}
  </style></head><body>${brandHeaderHtml(brand || {}, { title, subtitle })}
  <table><thead><tr>${th}</tr></thead><tbody>${body}${foot}</tbody></table></body></html>`);
  w.document.close();
  w.focus();
  const imgs = [...w.document.images].map(i => (i.complete ? null : new Promise(r => { i.onload = r; i.onerror = r; })));
  Promise.race([Promise.all(imgs), new Promise(r => setTimeout(r, 2500))]).then(() => setTimeout(() => w.print(), 200));
  return true;
}
