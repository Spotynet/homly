import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { tenantsAPI } from '../../api/client';

/**
 * Identidad del tenant para encabezar reportes (pantalla, impresión/PDF y Excel).
 * Toma la configuración del tenant: logo, razón social / nombre, RFC y dirección.
 */

const cache = new Map(); // tenantId -> { at, promise }
const TTL = 60 * 1000;

const clean = (v) => String(v ?? '').trim();

export function logoSrcOf(t) {
  const b64 = clean(t?.logo);
  if (b64) return b64.startsWith('data:') || b64.startsWith('http') || b64.startsWith('/') ? b64 : `data:image/png;base64,${b64}`;
  const file = clean(t?.logo_file);
  if (file) {
    try { return new URL(file, window.location.origin).href; } catch { return file; }
  }
  return '';
}

export function brandFromTenant(t, fallbackName = '') {
  if (!t) return { name: fallbackName, legalName: '', alias: '', rfc: '', address: '', logo: '', currency: 'MXN' };
  const legal = clean(t.razon_social);
  const alias = clean(t.name) || fallbackName;
  const fiscal = [
    [t.info_calle, t.info_num_externo].map(clean).filter(Boolean).join(' '),
    t.info_colonia, t.info_ciudad, t.info_delegacion,
    t.info_codigo_postal ? `C.P. ${clean(t.info_codigo_postal)}` : '',
    t.state, t.country,
  ].map(clean).filter(Boolean);
  const physical = [
    [t.addr_calle, t.addr_num_externo].map(clean).filter(Boolean).join(' '),
    t.addr_colonia, t.addr_ciudad, t.addr_delegacion,
    t.addr_codigo_postal ? `C.P. ${clean(t.addr_codigo_postal)}` : '',
    t.state, t.country,
  ].map(clean).filter(Boolean);
  const hasFiscal = [t.info_calle, t.info_colonia, t.info_ciudad].some(v => clean(v));
  const address = (hasFiscal ? fiscal : physical).join(', ');
  return {
    name: legal || alias,
    legalName: legal,
    alias: legal && alias && alias !== legal ? alias : '',
    rfc: clean(t.rfc),
    address,
    logo: logoSrcOf(t),
    currency: t.currency || 'MXN',
  };
}

function loadTenant(tenantId) {
  const hit = cache.get(tenantId);
  if (hit && Date.now() - hit.at < TTL) return hit.promise;
  const promise = tenantsAPI.get(tenantId).then(r => r.data).catch(() => null);
  cache.set(tenantId, { at: Date.now(), promise });
  return promise;
}

/** Vacía el caché (por ejemplo, tras editar la configuración del tenant). */
export function resetBrandCache() { cache.clear(); }

export function useTenantBrand() {
  const { tenantId, tenantName, user } = useAuth();
  const [brand, setBrand] = useState(() => brandFromTenant(null, tenantName || ''));
  useEffect(() => {
    if (!tenantId) return undefined;
    let alive = true;
    loadTenant(tenantId).then(t => { if (alive) setBrand(brandFromTenant(t, tenantName || '')); });
    return () => { alive = false; };
  }, [tenantId, tenantName]);
  return { ...brand, generatedBy: clean(user?.name) || clean(user?.email) };
}

export const nowLabel = () => new Date().toLocaleString('es-MX', { dateStyle: 'long', timeStyle: 'short' });

const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Encabezado en HTML (ventana de impresión / PDF). */
export function brandHeaderHtml(brand, { title, subtitle } = {}) {
  const b = brand || {};
  const logo = b.logo ? `<img class="bh-logo" src="${esc(b.logo)}" alt="" />` : '';
  const lines = [
    b.alias ? `<div class="bh-line">${esc(b.alias)}</div>` : '',
    b.rfc ? `<div class="bh-line">RFC: ${esc(b.rfc)}</div>` : '',
    b.address ? `<div class="bh-line">${esc(b.address)}</div>` : '',
  ].join('');
  return `<div class="bh">
    <div class="bh-left">${logo}<div><div class="bh-kicker">Administrar Propiedades</div><div class="bh-name">${esc(b.name || 'Mi portafolio')}</div>${lines}</div></div>
    <div class="bh-right"><div class="bh-title">${esc(title || '')}</div>${subtitle ? `<div class="bh-line">${esc(subtitle)}</div>` : ''}
      <div class="bh-line">Generado: ${esc(nowLabel())}${b.generatedBy ? ` · ${esc(b.generatedBy)}` : ''}</div></div>
  </div>`;
}

export const BRAND_HEADER_CSS = `
  .bh{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;padding-bottom:10px;margin-bottom:14px;border-bottom:2px solid #0f766e}
  .bh-left{display:flex;gap:12px;align-items:center;min-width:0}
  .bh-logo{max-height:56px;max-width:140px;object-fit:contain}
  .bh-kicker{font-size:10px;font-weight:700;letter-spacing:.1em;color:#0f766e;text-transform:uppercase}
  .bh-name{font-size:17px;font-weight:800;color:#1f2933;line-height:1.2}
  .bh-line{font-size:11px;color:#6b7280;margin-top:2px}
  .bh-right{text-align:right;max-width:46%}
  .bh-title{font-size:15px;font-weight:800;color:#1f2933}
`;

/**
 * Encabezado de reporte en pantalla (y al imprimir): logo, nombre, RFC y dirección del tenant,
 * título del reporte, filtros/periodo y fecha de generación.
 */
export function ReportHeader({ title, subtitle, className = '' }) {
  const brand = useTenantBrand();
  return (
    <div className={`rpt-head ${className}`} data-testid="report-header">
      <div className="rpt-head-left">
        {brand.logo && <img className="rpt-head-logo" src={brand.logo} alt="" />}
        <div style={{ minWidth: 0 }}>
          <div className="rpt-head-kicker">Administrar Propiedades</div>
          <div className="rpt-head-name">{brand.name || 'Mi portafolio'}</div>
          {brand.alias && <div className="rpt-head-line">{brand.alias}</div>}
          {brand.rfc && <div className="rpt-head-line">RFC: {brand.rfc}</div>}
          {brand.address && <div className="rpt-head-line">{brand.address}</div>}
        </div>
      </div>
      <div className="rpt-head-right">
        <div className="rpt-head-title">{title}</div>
        {subtitle && <div className="rpt-head-line">{subtitle}</div>}
        <div className="rpt-head-line">Generado: {nowLabel()}{brand.generatedBy ? ` · ${brand.generatedBy}` : ''}</div>
      </div>
    </div>
  );
}

/** Imprime solo el área `.rental-report-print` de la página actual (guardar como PDF). */
export function printCurrentReport() {
  document.body.classList.add('printing-rentreport');
  const done = () => { document.body.classList.remove('printing-rentreport'); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  window.print();
  setTimeout(done, 1500);
}
