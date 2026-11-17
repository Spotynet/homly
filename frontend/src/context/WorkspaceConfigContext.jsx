import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import { workspaceConfigsAPI } from '../api/client';
import {
  applyModuleOverrides, baseCatalogFor, disabledModuleKeys,
} from '../constants/modulePermissions';

/** Valores por defecto: se usan mientras carga o si la API falla. */
export const WORKSPACE_FALLBACK = {
  condominio: { workspace_type: 'condominio', label: 'Administración de condominios', short_label: 'Condominio', description: '', unit_noun: 'unidad', color: '#0f766e', is_enabled: true, sort_order: 0, module_overrides: {}, module_bundles: [] },
  rentas:     { workspace_type: 'rentas',     label: 'Administrar Propiedades',       short_label: 'Propiedades', description: '', unit_noun: 'propiedad', color: '#1d4ed8', is_enabled: true, sort_order: 1, module_overrides: {}, module_bundles: [] },
};

const noop = () => {};
const Ctx = createContext({
  configs: Object.values(WORKSPACE_FALLBACK),
  byType: WORKSPACE_FALLBACK,
  ready: false,
  reload: noop,
  wsLabel: (ws) => (WORKSPACE_FALLBACK[ws] || WORKSPACE_FALLBACK.condominio).label,
  wsShort: (ws) => (WORKSPACE_FALLBACK[ws] || WORKSPACE_FALLBACK.condominio).short_label,
  wsColor: (ws) => (WORKSPACE_FALLBACK[ws] || WORKSPACE_FALLBACK.condominio).color,
  unitNoun: (ws) => (WORKSPACE_FALLBACK[ws] || WORKSPACE_FALLBACK.condominio).unit_noun,
  getCatalog: (ws) => baseCatalogFor(ws),
  disabledFor: () => [],
});

export function WorkspaceConfigProvider({ children }) {
  const { user } = useAuth();
  const [byType, setByType] = useState(WORKSPACE_FALLBACK);
  const [ready, setReady] = useState(false);

  const reload = useCallback(async () => {
    try {
      const { data } = await workspaceConfigsAPI.list();
      const list = Array.isArray(data) ? data : (data?.results || []);
      const next = { ...WORKSPACE_FALLBACK };
      list.forEach(c => { next[c.workspace_type] = { ...WORKSPACE_FALLBACK[c.workspace_type], ...c }; });
      setByType(next);
    } catch { /* se queda con los valores por defecto */ }
    setReady(true);
  }, []);

  useEffect(() => { if (user) reload(); }, [user, reload]);

  const value = useMemo(() => {
    const cfg = (ws) => byType[ws] || WORKSPACE_FALLBACK[ws] || WORKSPACE_FALLBACK.condominio;
    return {
      configs: Object.values(byType).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
      byType,
      ready,
      reload,
      wsLabel: (ws) => cfg(ws).label,
      wsShort: (ws) => cfg(ws).short_label || cfg(ws).label,
      wsColor: (ws) => cfg(ws).color,
      unitNoun: (ws) => cfg(ws).unit_noun || 'unidad',
      /** Catálogo del espacio con nombres/descripciones personalizados. */
      getCatalog: (ws, opts) => applyModuleOverrides(baseCatalogFor(ws), cfg(ws).module_overrides, opts),
      disabledFor: (ws) => disabledModuleKeys(cfg(ws).module_overrides),
    };
  }, [byType, ready, reload]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useWorkspaceConfig = () => useContext(Ctx);
