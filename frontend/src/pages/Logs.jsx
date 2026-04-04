import { useState, useEffect, useCallback } from 'react';
import { auditLogsAPI } from '../api/client';
import {
  Shield, RefreshCw, Search, ChevronLeft, ChevronRight,
  Activity, User, Building2, AlertCircle, Calendar,
} from 'lucide-react';

// ──────────────────────────────────────────────────────────────
//  Constants
// ──────────────────────────────────────────────────────────────
const MODULE_OPTIONS = [
  { value: '', label: 'Todos los módulos' },
  { value: 'auth',      label: 'Autenticación' },
  { value: 'cobranza',  label: 'Cobranza' },
  { value: 'gastos',    label: 'Gastos' },
  { value: 'reservas',  label: 'Reservas' },
  { value: 'usuarios',  label: 'Usuarios' },
  { value: 'unidades',  label: 'Unidades' },
  { value: 'config',    label: 'Configuración' },
  { value: 'tenants',   label: 'Tenants' },
  { value: 'sistema',   label: 'Sistema' },
];

const ACTION_OPTIONS = [
  { value: '', label: 'Todas las acciones' },
  { value: 'login',         label: 'Inicio de sesión' },
  { value: 'create',        label: 'Crear registro' },
  { value: 'update',        label: 'Actualizar registro' },
  { value: 'delete',        label: 'Eliminar registro' },
  { value: 'approve',       label: 'Aprobar' },
  { value: 'reject',        label: 'Rechazar' },
  { value: 'cancel',        label: 'Cancelar' },
  { value: 'close_period',  label: 'Cerrar período' },
  { value: 'reopen_period', label: 'Reabrir período' },
  { value: 'send_email',    label: 'Enviar correo' },
  { value: 'toggle_status', label: 'Cambiar estado' },
  { value: 'add_payment',   label: 'Agregar pago adicional' },
];

const ACTION_BADGE = {
  login:         { bg: '#e0f2fe', color: '#0369a1' },
  create:        { bg: '#dcfce7', color: '#15803d' },
  update:        { bg: '#fef9c3', color: '#854d0e' },
  delete:        { bg: '#fee2e2', color: '#b91c1c' },
  approve:       { bg: '#d1fae5', color: '#065f46' },
  reject:        { bg: '#fee2e2', color: '#991b1b' },
  cancel:        { bg: '#fce7f3', color: '#9d174d' },
  close_period:  { bg: '#e0e7ff', color: '#3730a3' },
  reopen_period: { bg: '#ede9fe', color: '#5b21b6' },
  send_email:    { bg: '#f0fdf4', color: '#166534' },
  toggle_status: { bg: '#fff7ed', color: '#9a3412' },
  add_payment:   { bg: '#ecfdf5', color: '#047857' },
};

const MODULE_COLOR = {
  auth:     '#6366f1',
  cobranza: '#0ea5e9',
  gastos:   '#f59e0b',
  reservas: '#8b5cf6',
  usuarios: '#10b981',
  unidades: '#ef4444',
  config:   '#64748b',
  tenants:  '#06b6d4',
  sistema:  '#94a3b8',
};

// ──────────────────────────────────────────────────────────────
//  Helpers
// ──────────────────────────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('es-MX', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function ActionBadge({ action, label }) {
  const style = ACTION_BADGE[action] || { bg: '#f1f5f9', color: '#475569' };
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 12,
      fontSize: 11,
      fontWeight: 600,
      backgroundColor: style.bg,
      color: style.color,
      whiteSpace: 'nowrap',
    }}>
      {label || action}
    </span>
  );
}

function ModuleBadge({ module, label }) {
  const color = MODULE_COLOR[module] || '#94a3b8';
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 12,
      fontSize: 11,
      fontWeight: 600,
      backgroundColor: color + '20',
      color,
      whiteSpace: 'nowrap',
    }}>
      {label || module}
    </span>
  );
}

// ──────────────────────────────────────────────────────────────
//  Main Component
// ──────────────────────────────────────────────────────────────
export default function Logs() {
  // Filters
  const [search,   setSearch]   = useState('');
  const [module,   setModule]   = useState('');
  const [action,   setAction]   = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo,   setDateTo]   = useState('');
  const [userQ,    setUserQ]    = useState('');

  // Data
  const [logs,     setLogs]     = useState([]);
  const [total,    setTotal]    = useState(0);
  const [page,     setPage]     = useState(1);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  // Summary
  const [summary,  setSummary]  = useState(null);

  const PER_PAGE = 50;

  // ── Fetch summary once ─────────────────────────────────────
  useEffect(() => {
    auditLogsAPI.summary()
      .then(r => setSummary(r.data))
      .catch(() => {});
  }, []);

  // ── Fetch logs ─────────────────────────────────────────────
  const fetchLogs = useCallback(async (pg = 1) => {
    setLoading(true);
    setError('');
    try {
      const params = {
        page: pg,
        per_page: PER_PAGE,
        ...(module   && { module }),
        ...(action   && { action }),
        ...(dateFrom && { date_from: dateFrom }),
        ...(dateTo   && { date_to: dateTo }),
        ...(userQ    && { user: userQ }),
        ...(search   && { search }),
      };
      const res = await auditLogsAPI.list(params);
      setLogs(res.data.results || []);
      setTotal(res.data.count  || 0);
      setPage(pg);
    } catch {
      setError('No se pudieron cargar los registros.');
    } finally {
      setLoading(false);
    }
  }, [module, action, dateFrom, dateTo, userQ, search]);

  useEffect(() => { fetchLogs(1); }, [fetchLogs]);

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  // ──────────────────────────────────────────────────────────
  //  Styles
  // ──────────────────────────────────────────────────────────
  const S = {
    page: {
      padding: '24px 28px',
      background: '#f8fafc',
      minHeight: '100vh',
      fontFamily: 'Inter, system-ui, sans-serif',
    },
    header: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      marginBottom: 20,
    },
    title: {
      fontSize: 22,
      fontWeight: 700,
      color: '#1e293b',
      margin: 0,
    },
    subtitle: {
      fontSize: 13,
      color: '#64748b',
      margin: '2px 0 0',
    },
    statsRow: {
      display: 'flex',
      gap: 16,
      marginBottom: 20,
      flexWrap: 'wrap',
    },
    statCard: {
      background: '#fff',
      borderRadius: 10,
      padding: '14px 20px',
      border: '1px solid #e2e8f0',
      minWidth: 140,
    },
    statLabel: { fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' },
    statValue: { fontSize: 26, fontWeight: 700, color: '#0f172a', margin: '4px 0 0' },
    filtersBar: {
      background: '#fff',
      border: '1px solid #e2e8f0',
      borderRadius: 10,
      padding: '14px 16px',
      marginBottom: 16,
      display: 'flex',
      flexWrap: 'wrap',
      gap: 10,
      alignItems: 'flex-end',
    },
    filterGroup: { display: 'flex', flexDirection: 'column', gap: 4 },
    filterLabel: { fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' },
    input: {
      height: 34,
      padding: '0 10px',
      borderRadius: 7,
      border: '1px solid #cbd5e1',
      fontSize: 13,
      color: '#1e293b',
      background: '#fff',
      outline: 'none',
    },
    select: {
      height: 34,
      padding: '0 8px',
      borderRadius: 7,
      border: '1px solid #cbd5e1',
      fontSize: 13,
      color: '#1e293b',
      background: '#fff',
      outline: 'none',
    },
    refreshBtn: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      height: 34,
      padding: '0 14px',
      borderRadius: 7,
      border: 'none',
      background: '#0f172a',
      color: '#fff',
      fontSize: 13,
      fontWeight: 600,
      cursor: 'pointer',
      marginLeft: 'auto',
    },
    tableWrapper: {
      background: '#fff',
      border: '1px solid #e2e8f0',
      borderRadius: 10,
      overflow: 'hidden',
    },
    table: {
      width: '100%',
      borderCollapse: 'collapse',
      fontSize: 13,
    },
    th: {
      padding: '10px 14px',
      textAlign: 'left',
      fontSize: 11,
      fontWeight: 700,
      color: '#64748b',
      textTransform: 'uppercase',
      letterSpacing: '0.04em',
      background: '#f8fafc',
      borderBottom: '1px solid #e2e8f0',
      whiteSpace: 'nowrap',
    },
    td: {
      padding: '10px 14px',
      borderBottom: '1px solid #f1f5f9',
      color: '#1e293b',
      verticalAlign: 'top',
    },
    pager: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '12px 16px',
      borderTop: '1px solid #f1f5f9',
      fontSize: 13,
      color: '#64748b',
    },
    pageBtn: (disabled) => ({
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      padding: '6px 12px',
      borderRadius: 7,
      border: '1px solid #e2e8f0',
      background: disabled ? '#f8fafc' : '#fff',
      color: disabled ? '#cbd5e1' : '#1e293b',
      cursor: disabled ? 'not-allowed' : 'pointer',
      fontSize: 13,
    }),
    emptyRow: {
      textAlign: 'center',
      padding: '48px 20px',
      color: '#94a3b8',
    },
    ipCell: {
      fontSize: 11,
      color: '#94a3b8',
      fontFamily: 'monospace',
    },
  };

  // ──────────────────────────────────────────────────────────
  //  Render
  // ──────────────────────────────────────────────────────────
  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.header}>
        <Shield size={26} color="#6366f1" />
        <div>
          <h1 style={S.title}>Registros del Sistema</h1>
          <p style={S.subtitle}>Auditoría de todas las acciones realizadas en la plataforma</p>
        </div>
      </div>

      {/* Summary stats */}
      {summary && (
        <div style={S.statsRow}>
          <div style={S.statCard}>
            <div style={S.statLabel}>Hoy</div>
            <div style={S.statValue}>{summary.total_today.toLocaleString()}</div>
          </div>
          <div style={S.statCard}>
            <div style={S.statLabel}>Últimos 30 días</div>
            <div style={S.statValue}>{summary.total_30d.toLocaleString()}</div>
          </div>
          {summary.by_module?.slice(0, 3).map(m => (
            <div key={m.module} style={{ ...S.statCard, borderLeft: `4px solid ${MODULE_COLOR[m.module] || '#94a3b8'}` }}>
              <div style={S.statLabel}>{MODULE_OPTIONS.find(o => o.value === m.module)?.label || m.module}</div>
              <div style={S.statValue}>{m.count.toLocaleString()}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div style={S.filtersBar}>
        <div style={S.filterGroup}>
          <label style={S.filterLabel}>Módulo</label>
          <select style={S.select} value={module} onChange={e => setModule(e.target.value)}>
            {MODULE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        <div style={S.filterGroup}>
          <label style={S.filterLabel}>Acción</label>
          <select style={S.select} value={action} onChange={e => setAction(e.target.value)}>
            {ACTION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        <div style={S.filterGroup}>
          <label style={S.filterLabel}>Desde</label>
          <input
            type="date"
            style={S.input}
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
          />
        </div>

        <div style={S.filterGroup}>
          <label style={S.filterLabel}>Hasta</label>
          <input
            type="date"
            style={S.input}
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
          />
        </div>

        <div style={S.filterGroup}>
          <label style={S.filterLabel}>Usuario</label>
          <input
            type="text"
            placeholder="Nombre o email…"
            style={{ ...S.input, width: 180 }}
            value={userQ}
            onChange={e => setUserQ(e.target.value)}
          />
        </div>

        <div style={S.filterGroup}>
          <label style={S.filterLabel}>Búsqueda libre</label>
          <div style={{ position: 'relative' }}>
            <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              placeholder="Descripción, objeto…"
              style={{ ...S.input, paddingLeft: 28, width: 200 }}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        <button
          style={S.refreshBtn}
          onClick={() => fetchLogs(1)}
          disabled={loading}
        >
          <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          Actualizar
        </button>
      </div>

      {/* Error */}
      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#ef4444', marginBottom: 12 }}>
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* Table */}
      <div style={S.tableWrapper}>
        <table style={S.table}>
          <thead>
            <tr>
              <th style={S.th}><Calendar size={11} style={{ marginRight: 4, verticalAlign: 'middle' }} />Fecha / Hora</th>
              <th style={S.th}><Building2 size={11} style={{ marginRight: 4, verticalAlign: 'middle' }} />Tenant</th>
              <th style={S.th}><User size={11} style={{ marginRight: 4, verticalAlign: 'middle' }} />Usuario</th>
              <th style={S.th}>Rol</th>
              <th style={S.th}><Activity size={11} style={{ marginRight: 4, verticalAlign: 'middle' }} />Módulo</th>
              <th style={S.th}>Acción</th>
              <th style={S.th}>Descripción</th>
              <th style={S.th}>Objeto</th>
              <th style={S.th}>IP</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} style={S.emptyRow}>
                  <RefreshCw size={20} color="#cbd5e1" style={{ animation: 'spin 1s linear infinite' }} />
                  <div style={{ marginTop: 8 }}>Cargando registros…</div>
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={9} style={S.emptyRow}>
                  <Shield size={32} color="#e2e8f0" />
                  <div style={{ marginTop: 8 }}>No hay registros para los filtros seleccionados</div>
                </td>
              </tr>
            ) : logs.map(log => (
              <tr key={log.id} style={{ background: '#fff' }}
                onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                onMouseLeave={e => e.currentTarget.style.background = '#fff'}
              >
                <td style={{ ...S.td, whiteSpace: 'nowrap', fontSize: 12, color: '#475569' }}>
                  {fmtDate(log.created_at)}
                </td>
                <td style={{ ...S.td, maxWidth: 140 }}>
                  <span style={{ fontSize: 12, color: '#1e293b', fontWeight: 500 }}>
                    {log.tenant_name || <span style={{ color: '#94a3b8' }}>—</span>}
                  </span>
                </td>
                <td style={{ ...S.td, maxWidth: 160 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#1e293b' }}>{log.user_name || '—'}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>{log.user_email}</div>
                </td>
                <td style={S.td}>
                  <span style={{
                    fontSize: 11, fontWeight: 600,
                    color: log.user_role === 'superadmin' ? '#7c3aed' : '#475569',
                  }}>
                    {log.user_role || '—'}
                  </span>
                </td>
                <td style={S.td}>
                  <ModuleBadge module={log.module} label={log.module_label} />
                </td>
                <td style={S.td}>
                  <ActionBadge action={log.action} label={log.action_label} />
                </td>
                <td style={{ ...S.td, maxWidth: 260, fontSize: 12, color: '#334155' }}>
                  {log.description || '—'}
                  {log.object_repr && (
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                      {log.object_type} · {log.object_repr}
                    </div>
                  )}
                </td>
                <td style={{ ...S.td, fontSize: 11, color: '#64748b', fontFamily: 'monospace' }}>
                  {log.object_id ? log.object_id.slice(0, 8) + '…' : '—'}
                </td>
                <td style={{ ...S.td, ...S.ipCell }}>
                  {log.ip_address || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Pager */}
        <div style={S.pager}>
          <span>
            {total > 0
              ? `Mostrando ${((page - 1) * PER_PAGE) + 1}–${Math.min(page * PER_PAGE, total)} de ${total.toLocaleString()} registros`
              : 'Sin registros'}
          </span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              style={S.pageBtn(page <= 1)}
              disabled={page <= 1}
              onClick={() => fetchLogs(page - 1)}
            >
              <ChevronLeft size={14} /> Anterior
            </button>
            <span style={{ fontSize: 12, color: '#1e293b', fontWeight: 600 }}>
              Pág. {page} / {totalPages}
            </span>
            <button
              style={S.pageBtn(page >= totalPages)}
              disabled={page >= totalPages}
              onClick={() => fetchLogs(page + 1)}
            >
              Siguiente <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* CSS keyframe for spinner */}
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
