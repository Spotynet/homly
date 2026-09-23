import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { blogAPI } from '../api/client';
import {
  X, Search, Download, Printer, Contact, Mail, Phone,
  Building2, Users, Home, Loader2,
} from 'lucide-react';
import toast from 'react-hot-toast';

const KIND_FILTERS = [
  { key: 'all',           label: 'Todos' },
  { key: 'propietarios',  label: 'Propietarios' },
  { key: 'inquilinos',    label: 'Inquilinos' },
];

const KIND_STYLE = {
  propietario:   { label: 'Propietario',   bg: 'bg-teal-50',   text: 'text-teal-700',   border: 'border-teal-200' },
  copropietario: { label: 'Copropietario', bg: 'bg-cyan-50',   text: 'text-cyan-700',   border: 'border-cyan-200' },
  inquilino:     { label: 'Inquilino',     bg: 'bg-amber-50',  text: 'text-amber-700',  border: 'border-amber-200' },
};

function csvEscape(value) {
  const s = String(value ?? '');
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function downloadCsv(entries, tenantName) {
  const header = ['Unidad', 'Nombre unidad', 'Tipo', 'Nombre', 'Email', 'Teléfono'];
  const rows = entries.map(e => [
    e.unit_code, e.unit_name, e.kind_label, e.name, e.email, e.phone,
  ].map(csvEscape).join(','));
  const bom = '\uFEFF';
  const csv = bom + [header.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safe = (tenantName || 'condominio').replace(/[^\wÀ-ÿ\- ]+/g, '').trim().replace(/\s+/g, '_');
  a.href = url;
  a.download = `Directorio_${safe}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function printDirectory(entries, tenantName, counts) {
  const rows = entries.map(e => `
    <tr>
      <td>${escapeHtml(e.unit_code)}</td>
      <td>${escapeHtml(e.unit_name)}</td>
      <td>${escapeHtml(e.kind_label)}</td>
      <td>${escapeHtml(e.name || '—')}</td>
      <td>${escapeHtml(e.email || '—')}</td>
      <td>${escapeHtml(e.phone || '—')}</td>
    </tr>
  `).join('');
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Directorio — ${escapeHtml(tenantName || 'Condominio')}</title>
  <style>
    body { font-family: system-ui, -apple-system, Segoe UI, sans-serif; color: #1e293b; margin: 32px; }
    h1 { font-size: 20px; margin: 0 0 4px; }
    p { color: #64748b; font-size: 12px; margin: 0 0 20px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th { text-align: left; background: #f1f5f9; padding: 8px 10px; border-bottom: 2px solid #cbd5e1; }
    td { padding: 7px 10px; border-bottom: 1px solid #e2e8f0; }
    @media print { body { margin: 16px; } }
  </style>
</head>
<body>
  <h1>Directorio de propietarios e inquilinos</h1>
  <p>${escapeHtml(tenantName || 'Condominio')} · ${counts.owners} propietario${counts.owners === 1 ? '' : 's'} · ${counts.tenants} inquilino${counts.tenants === 1 ? '' : 's'} · ${entries.length} contacto${entries.length === 1 ? '' : 's'}</p>
  <table>
    <thead>
      <tr>
        <th>Unidad</th><th>Nombre unidad</th><th>Tipo</th><th>Nombre</th><th>Email</th><th>Teléfono</th>
      </tr>
    </thead>
    <tbody>${rows || '<tr><td colspan="6">Sin registros</td></tr>'}</tbody>
  </table>
</body>
</html>`;
  const win = window.open('', '_blank');
  if (!win) {
    toast.error('Permite ventanas emergentes para imprimir el directorio');
    return;
  }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => {
    win.print();
  }, 250);
}

export default function ResidentDirectoryModal({ tenantId, tenantName, onClose }) {
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState('all');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['resident-directory', tenantId],
    queryFn:  () => blogAPI.directory(tenantId).then(r => r.data),
    enabled:  !!tenantId,
    staleTime: 2 * 60 * 1000,
  });

  const entries = data?.entries || [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter(e => {
      const matchKind =
        kindFilter === 'all'
        || (kindFilter === 'propietarios' && (e.kind === 'propietario' || e.kind === 'copropietario'))
        || (kindFilter === 'inquilinos' && e.kind === 'inquilino');
      if (!matchKind) return false;
      if (!q) return true;
      return `${e.unit_code} ${e.unit_name} ${e.name} ${e.email} ${e.phone} ${e.kind_label}`
        .toLowerCase()
        .includes(q);
    });
  }, [entries, search, kindFilter]);

  const ownersCount  = data?.owners_count ?? 0;
  const tenantsCount = data?.tenants_count ?? 0;
  const titleName    = data?.tenant_name || tenantName || 'Condominio';

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

  const handleDownload = () => {
    if (!filtered.length) return toast.error('No hay contactos para descargar');
    downloadCsv(filtered, titleName);
    toast.success('Directorio descargado');
  };

  const handlePrint = () => {
    if (!filtered.length) return toast.error('No hay contactos para imprimir');
    printDirectory(filtered, titleName, {
      owners: kindFilter === 'inquilinos' ? 0 : filtered.filter(e => e.kind !== 'inquilino').length,
      tenants: kindFilter === 'propietarios' ? 0 : filtered.filter(e => e.kind === 'inquilino').length,
    });
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] sm:max-h-[88vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-4 sm:px-6 py-4 border-b border-slate-100 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center flex-shrink-0">
              <Contact size={18} className="text-teal-600" />
            </div>
            <div className="min-w-0">
              <h2 className="font-bold text-slate-800 leading-tight">Directorio de la comunidad</h2>
              <p className="text-xs text-slate-500 truncate">
                Propietarios e inquilinos de {titleName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors flex-shrink-0"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-4 sm:px-6 py-3 border-b border-slate-100 space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Contactos', value: data?.count ?? '—', icon: Users },
              { label: 'Propietarios', value: ownersCount || '—', icon: Home },
              { label: 'Inquilinos', value: tenantsCount || '—', icon: Building2 },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  <Icon size={11} /> {label}
                </div>
                <div className="text-lg font-bold text-slate-800 leading-tight">{value}</div>
              </div>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex-1 relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar por unidad, nombre, email o teléfono..."
                className="w-full pl-9 pr-8 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X size={13} />
                </button>
              )}
            </div>
            <div className="flex gap-1.5 overflow-x-auto">
              {KIND_FILTERS.map(f => (
                <button
                  key={f.key}
                  onClick={() => setKindFilter(f.key)}
                  className={`flex-shrink-0 px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
                    kindFilter === f.key
                      ? 'bg-teal-600 text-white border-teal-600'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-teal-300'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-20 text-slate-400">
              <Loader2 size={22} className="animate-spin mr-2" />
              <span className="text-sm font-medium">Cargando directorio...</span>
            </div>
          ) : isError ? (
            <div className="text-center py-16 text-slate-400 px-6">
              <p className="font-semibold text-slate-600">No se pudo cargar el directorio</p>
              <p className="text-sm mt-1">Intenta de nuevo en unos segundos.</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-slate-400 px-6">
              <Contact size={36} className="mx-auto mb-3 opacity-30" />
              <p className="font-semibold text-slate-600">Sin contactos</p>
              <p className="text-sm mt-1">
                {search || kindFilter !== 'all'
                  ? 'Prueba con otro filtro o búsqueda.'
                  : 'Aún no hay propietarios ni inquilinos registrados.'}
              </p>
            </div>
          ) : (
            <>
              <div className="hidden sm:block">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50 z-10">
                    <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400">
                      <th className="px-6 py-2.5 font-semibold">Unidad</th>
                      <th className="px-3 py-2.5 font-semibold">Tipo</th>
                      <th className="px-3 py-2.5 font-semibold">Nombre</th>
                      <th className="px-3 py-2.5 font-semibold">Email</th>
                      <th className="px-6 py-2.5 font-semibold">Teléfono</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((e, i) => {
                      const style = KIND_STYLE[e.kind] || KIND_STYLE.propietario;
                      return (
                        <tr key={`${e.unit_id}-${e.kind}-${i}`} className="border-t border-slate-100 hover:bg-slate-50/70">
                          <td className="px-6 py-3">
                            <div className="font-mono text-xs font-bold text-teal-700">{e.unit_code}</div>
                            <div className="text-xs text-slate-400">{e.unit_name}</div>
                          </td>
                          <td className="px-3 py-3">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold border ${style.bg} ${style.text} ${style.border}`}>
                              {style.label}
                            </span>
                          </td>
                          <td className="px-3 py-3 font-medium text-slate-800">{e.name || '—'}</td>
                          <td className="px-3 py-3">
                            {e.email ? (
                              <a href={`mailto:${e.email}`} className="inline-flex items-center gap-1 text-teal-700 hover:underline">
                                <Mail size={12} /> {e.email}
                              </a>
                            ) : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-6 py-3">
                            {e.phone ? (
                              <a href={`tel:${e.phone}`} className="inline-flex items-center gap-1 text-slate-700 hover:text-teal-700">
                                <Phone size={12} /> {e.phone}
                              </a>
                            ) : <span className="text-slate-300">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="sm:hidden divide-y divide-slate-100">
                {filtered.map((e, i) => {
                  const style = KIND_STYLE[e.kind] || KIND_STYLE.propietario;
                  return (
                    <div key={`${e.unit_id}-${e.kind}-${i}`} className="px-4 py-3">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="font-mono text-xs font-bold text-teal-700">{e.unit_code}</div>
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold border ${style.bg} ${style.text} ${style.border}`}>
                          {style.label}
                        </span>
                      </div>
                      <div className="font-semibold text-slate-800 text-sm">{e.name || 'Sin nombre'}</div>
                      <div className="text-xs text-slate-400 mb-1.5">{e.unit_name}</div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                        {e.email && (
                          <a href={`mailto:${e.email}`} className="inline-flex items-center gap-1 text-teal-700">
                            <Mail size={11} /> {e.email}
                          </a>
                        )}
                        {e.phone && (
                          <a href={`tel:${e.phone}`} className="inline-flex items-center gap-1 text-slate-600">
                            <Phone size={11} /> {e.phone}
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div className="px-4 sm:px-6 py-3 border-t border-slate-100 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2 bg-white">
          <p className="text-xs text-slate-400 text-center sm:text-left">
            {filtered.length} contacto{filtered.length === 1 ? '' : 's'}
            {(search || kindFilter !== 'all') && entries.length !== filtered.length ? ` de ${entries.length}` : ''}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handlePrint}
              disabled={!filtered.length}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 disabled:opacity-40"
            >
              <Printer size={14} /> Imprimir
            </button>
            <button
              type="button"
              onClick={handleDownload}
              disabled={!filtered.length}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-semibold bg-teal-600 hover:bg-teal-700 text-white rounded-xl disabled:opacity-40"
            >
              <Download size={14} /> Descargar CSV
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
