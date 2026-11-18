import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

/**
 * RitaContext — asistente IA global (flotante).
 * Vistas: closed | home | guides | bank
 * Los módulos Cobranza/Gastos registran un "bank host" con callbacks de captura.
 */

const RitaContext = createContext(null);

const FAB_POS_KEY = 'homly.rita.fabPos';

export function RitaProvider({ children }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState('home'); // home | guides | bank
  const [bankMode, setBankMode] = useState('ingresos'); // ingresos | egresos
  const [lastAssignedMovementId, setLastAssignedMovementId] = useState(null);
  const hostsRef = useRef({ ingresos: null, egresos: null });
  const [, bump] = useState(0);

  const registerBankHost = useCallback((mode, host) => {
    hostsRef.current[mode] = host;
    bump(n => n + 1);
  }, []);

  const unregisterBankHost = useCallback((mode) => {
    if (hostsRef.current[mode]) {
      hostsRef.current[mode] = null;
      bump(n => n + 1);
    }
  }, []);

  const getBankHost = useCallback((mode) => hostsRef.current[mode] || null, []);

  const openRita = useCallback((opts = {}) => {
    setOpen(true);
    if (opts.view) setView(opts.view);
    else setView('home');
    if (opts.bankMode) setBankMode(opts.bankMode);
  }, []);

  const closeRita = useCallback(() => {
    setOpen(false);
    setView('home');
  }, []);

  const goHome = useCallback(() => setView('home'), []);

  const openGuides = useCallback(() => {
    setOpen(true);
    setView('guides');
  }, []);

  const openBank = useCallback((mode = 'ingresos') => {
    setBankMode(mode === 'egresos' ? 'egresos' : 'ingresos');
    setOpen(true);
    setView('bank');
  }, []);

  const notifyAssigned = useCallback((movementId) => {
    if (!movementId) return;
    setLastAssignedMovementId(movementId);
    setOpen(true);
    setView('bank');
  }, []);

  const value = useMemo(() => ({
    open,
    view,
    bankMode,
    lastAssignedMovementId,
    openRita,
    closeRita,
    goHome,
    openGuides,
    openBank,
    setBankMode,
    registerBankHost,
    unregisterBankHost,
    getBankHost,
    notifyAssigned,
    fabPosKey: FAB_POS_KEY,
  }), [
    open, view, bankMode, lastAssignedMovementId,
    openRita, closeRita, goHome, openGuides, openBank,
    registerBankHost, unregisterBankHost, getBankHost, notifyAssigned,
  ]);

  return <RitaContext.Provider value={value}>{children}</RitaContext.Provider>;
}

export function useRita() {
  const ctx = useContext(RitaContext);
  if (!ctx) throw new Error('useRita must be used inside <RitaProvider>');
  return ctx;
}
