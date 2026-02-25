import React from 'react';

/**
 * Barra de paginación reutilizable.
 * Soporta modo cliente (solo cambiar página) y modo servidor (con selector de tamaño).
 * @param {number} page - Página actual (1-based)
 * @param {number} totalPages - Total de páginas
 * @param {number} totalItems - Total de ítems
 * @param {number} perPage - Items por página
 * @param {(p: number) => void} onPageChange - Callback al cambiar página
 * @param {number[]} [pageSizeOptions] - Opciones para "mostrar por página" (ej: [10, 25, 50, 100])
 * @param {(n: number) => void} [onPerPageChange] - Callback al cambiar tamaño de página
 */
export default function PaginationBar({
  page,
  totalPages,
  totalItems,
  perPage,
  onPageChange,
  pageSizeOptions,
  onPerPageChange,
  itemLabel = 'registros',
}) {
  if (totalItems <= 0 || totalPages <= 0) return null;

  const start = (page - 1) * perPage + 1;
  const end = Math.min(page * perPage, totalItems);
  const showPerPageSelector = Array.isArray(pageSizeOptions) && pageSizeOptions.length > 0 && typeof onPerPageChange === 'function';

  return (
    <div className="pag-bar">
      <span className="pag-left">
        Mostrando {start}-{end} de {totalItems} {itemLabel}
      </span>
      <div className="pag-right">
        {showPerPageSelector && (
          <div className="pag-per-page">
            Mostrar
            <select
              value={perPage}
              onChange={(e) => {
                const v = Number(e.target.value);
                onPerPageChange(v);
                onPageChange(1);
              }}
            >
              {pageSizeOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            por página
          </div>
        )}
        <div className="pag-btns">
          <button
            className="pag-btn"
            disabled={page <= 1}
            onClick={() => onPageChange(1)}
            title="Primera página"
          >
            «
          </button>
          <button
            className="pag-btn"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            title="Anterior"
          >
            ‹
          </button>
          {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              className={`pag-btn ${p === page ? 'active' : ''}`}
              onClick={() => onPageChange(p)}
            >
              {p}
            </button>
          ))}
          <button
            className="pag-btn"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            title="Siguiente"
          >
            ›
          </button>
          <button
            className="pag-btn"
            disabled={page >= totalPages}
            onClick={() => onPageChange(totalPages)}
            title="Última página"
          >
            »
          </button>
        </div>
      </div>
    </div>
  );
}
