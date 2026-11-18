import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Sparkles, X, GripHorizontal, BookOpen, Landmark, ChevronLeft, ArrowDownCircle, ArrowUpCircle,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTenantAccess } from '../../context/TenantAccessContext';
import { useRita } from '../../context/RitaContext';
import { todayPeriod } from '../../utils/helpers';
import RitaGuidesPanel from './RitaGuidesPanel';
import RitaAssistant from '../RitaAssistant';

const PANEL_W = 400;
const FAB_SIZE = 56;

function loadFabPos(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (typeof p?.x === 'number' && typeof p?.y === 'number') return p;
  } catch { /* ignore */ }
  return null;
}

/**
 * RitaShell — icono flotante arrastrable + panel del asistente IA.
 */
export default function RitaShell() {
  const { tenantId, isReadOnly, workspaceType } = useAuth();
  const { canAccessModule, canRita, accessReady } = useTenantAccess();
  const {
    open, view, bankMode, lastAssignedMovementId,
    openRita, closeRita, goHome, openGuides, openBank,
    getBankHost, fabPosKey,
  } = useRita();
  const location = useLocation();
  const navigate = useNavigate();

  const canGuides = canAccessModule('onboarding') || canRita('guides');
  const canBankIngresos = !isReadOnly && canRita('ingresos');
  const canBankEgresos = !isReadOnly && canRita('egresos');
  const canBankUpload = !isReadOnly && canRita('bank_upload');
  const canBank = canBankIngresos || canBankEgresos || canBankUpload;

  const showFab = accessReady && workspaceType !== 'rentas' && (canGuides || canBank || canAccessModule('rita'));

  const defaultFab = useCallback(() => ({
    x: Math.max(16, window.innerWidth - FAB_SIZE - 20),
    y: Math.max(80, window.innerHeight - FAB_SIZE - 28),
  }), []);

  const [fabPos, setFabPos] = useState(() => loadFabPos(fabPosKey) || null);
  const [panelPos, setPanelPos] = useState(null);
  const fabPosRef = useRef(fabPos);
  const drag = useRef({ active: false, kind: 'fab', ox: 0, oy: 0, sx: 0, sy: 0 });
  const dragMoved = useRef(false);

  useEffect(() => { fabPosRef.current = fabPos; }, [fabPos]);

  useEffect(() => {
    if (!fabPos) setFabPos(defaultFab());
  }, [fabPos, defaultFab]);

  useEffect(() => {
    if (open) {
      setPanelPos({
        x: Math.max(8, window.innerWidth - PANEL_W - 20),
        y: Math.max(64, window.innerHeight - 640),
      });
    }
  }, [open]);

  useEffect(() => {
    const onMove = (e) => {
      if (!drag.current.active) return;
      dragMoved.current = true;
      const cx = e.touches ? e.touches[0].clientX : e.clientX;
      const cy = e.touches ? e.touches[0].clientY : e.clientY;
      const nx = drag.current.sx + cx - drag.current.ox;
      const ny = drag.current.sy + cy - drag.current.oy;
      if (drag.current.kind === 'fab') {
        const next = {
          x: Math.max(8, Math.min(window.innerWidth - FAB_SIZE - 8, nx)),
          y: Math.max(8, Math.min(window.innerHeight - FAB_SIZE - 8, ny)),
        };
        setFabPos(next);
      } else {
        setPanelPos({
          x: Math.max(0, Math.min(window.innerWidth - PANEL_W, nx)),
          y: Math.max(0, Math.min(window.innerHeight - 80, ny)),
        });
      }
    };
    const onUp = () => {
      if (drag.current.active && drag.current.kind === 'fab' && fabPosRef.current) {
        try { localStorage.setItem(fabPosKey, JSON.stringify(fabPosRef.current)); } catch { /* ignore */ }
      }
      drag.current.active = false;
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onUp);
    };
  }, [fabPos, fabPosKey]);

  const startFabDrag = useCallback((e) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;
    drag.current = {
      active: true, kind: 'fab', ox: cx, oy: cy,
      sx: fabPos?.x ?? 0, sy: fabPos?.y ?? 0,
    };
    dragMoved.current = false;
  }, [fabPos]);

  const startPanelDrag = useCallback((e) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;
    drag.current = {
      active: true, kind: 'panel', ox: cx, oy: cy,
      sx: panelPos?.x ?? 0, sy: panelPos?.y ?? 0,
    };
    dragMoved.current = false;
  }, [panelPos]);

  const onFabClick = () => {
    if (dragMoved.current) return;
    if (open) closeRita();
    else openRita({ view: 'home' });
  };

  const host = getBankHost(bankMode);
  const bankPeriod = host?.period || todayPeriod();
  const bankUnits = host?.units || [];
  const bankFields = host?.gastoFields || [];

  const subtitle = useMemo(() => {
    if (view === 'guides') return 'Guías de uso';
    if (view === 'bank') return bankMode === 'egresos' ? 'Estados de cuenta · Gastos' : 'Estados de cuenta · Cobranza';
    return 'Asistente IA de Homly';
  }, [view, bankMode]);

  const startBank = (mode) => {
    if (mode === 'egresos' && !location.pathname.includes('/gastos')) {
      navigate('/app/gastos');
    } else if (mode === 'ingresos' && !location.pathname.includes('/cobranza')) {
      navigate('/app/cobranza');
    }
    openBank(mode);
  };

  if (!showFab || !tenantId) return null;

  return (
    <>
      {/* FAB */}
      {!open && fabPos && (
        <button
          type="button"
          title="Rita — asistente IA"
          onMouseDown={startFabDrag}
          onTouchStart={startFabDrag}
          onClick={onFabClick}
          style={{
            position: 'fixed', left: fabPos.x, top: fabPos.y, zIndex: 2700,
            width: FAB_SIZE, height: FAB_SIZE, borderRadius: 18,
            border: 'none', cursor: 'grab',
            background: 'linear-gradient(145deg, #0d9488, #0f766e)',
            boxShadow: '0 12px 28px rgba(13, 148, 136, 0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'white',
          }}
        >
          <Sparkles size={24} />
        </button>
      )}

      {/* Panel */}
      {open && panelPos && (
        <div
          style={{
            position: 'fixed', left: panelPos.x, top: panelPos.y, zIndex: 2700,
            width: PANEL_W, maxWidth: 'calc(100vw - 16px)',
            maxHeight: 'min(720px, calc(100vh - 24px))',
            background: 'white', borderRadius: 16,
            boxShadow: '0 18px 50px rgba(15, 92, 82, 0.22)',
            border: '1px solid var(--teal-100)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}
        >
          <div
            onMouseDown={startPanelDrag}
            onTouchStart={startPanelDrag}
            style={{
              padding: '10px 12px',
              background: 'linear-gradient(135deg, var(--teal-50), #ccfbf1)',
              borderBottom: '1px solid var(--teal-100)',
              display: 'flex', alignItems: 'center', gap: 8,
              cursor: 'grab', userSelect: 'none',
            }}
          >
            {view !== 'home' && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); goHome(); }}
                onMouseDown={(e) => e.stopPropagation()}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--teal-700)', padding: 4 }}
                title="Volver"
              >
                <ChevronLeft size={18} />
              </button>
            )}
            <div style={{
              width: 34, height: 34, borderRadius: 10, background: 'white',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(13,124,110,0.15)',
            }}>
              <Sparkles size={16} color="var(--teal-600)" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--ink-800)', display: 'flex', alignItems: 'center', gap: 6 }}>
                Rita
                <span style={{
                  fontSize: 9, fontWeight: 800, letterSpacing: '0.04em',
                  padding: '1px 6px', borderRadius: 999,
                  background: 'var(--teal-600)', color: 'white',
                }}>IA</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>{subtitle}</div>
            </div>
            <GripHorizontal size={14} color="var(--ink-300)" />
            <button
              type="button"
              onClick={closeRita}
              onMouseDown={(e) => e.stopPropagation()}
              style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--ink-400)' }}
            >
              <X size={18} />
            </button>
          </div>

          <div style={{ padding: 12, overflow: 'auto', flex: 1 }}>
            {view === 'home' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontSize: 12, color: 'var(--ink-500)', lineHeight: 1.45 }}>
                  Soy Rita, la asistente IA de Homly. Elige qué quieres hacer:
                </div>
                {canGuides && (
                  <button
                    type="button"
                    onClick={openGuides}
                    style={{
                      textAlign: 'left', border: '1px solid var(--teal-100)', borderRadius: 12,
                      padding: 12, background: 'var(--teal-50)', cursor: 'pointer',
                      display: 'flex', gap: 10, alignItems: 'flex-start',
                    }}
                  >
                    <BookOpen size={18} color="var(--teal-700)" style={{ marginTop: 2 }} />
                    <span>
                      <div style={{ fontWeight: 800, fontSize: 13, color: 'var(--teal-800)' }}>Guías de uso</div>
                      <div style={{ fontSize: 11, color: 'var(--ink-500)', marginTop: 2 }}>
                        Tutoriales interactivos para aprender el sistema
                      </div>
                    </span>
                  </button>
                )}
                {canBank && (
                  <div style={{
                    border: '1px solid var(--sand-200)', borderRadius: 12, padding: 12, background: 'white',
                  }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                      <Landmark size={16} color="var(--teal-700)" />
                      <div style={{ fontWeight: 800, fontSize: 13, color: 'var(--ink-800)' }}>Estados de cuenta</div>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--ink-500)', marginBottom: 10 }}>
                      Lee el PDF del banco y asigna movimientos a Cobranza o Gastos
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {canBankIngresos && (
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => startBank('ingresos')}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
                        >
                          <ArrowDownCircle size={13} /> Ingresos
                        </button>
                      )}
                      {canBankEgresos && (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => startBank('egresos')}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
                        >
                          <ArrowUpCircle size={13} /> Egresos
                        </button>
                      )}
                      {!canBankIngresos && !canBankEgresos && canBankUpload && (
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => startBank('ingresos')}
                        >
                          Cargar PDF
                        </button>
                      )}
                    </div>
                  </div>
                )}
                {!canGuides && !canBank && (
                  <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>
                    No tienes funciones de Rita habilitadas. Pide acceso en Configuración → Permisos.
                  </div>
                )}
              </div>
            )}

            {view === 'guides' && <RitaGuidesPanel />}

            {view === 'bank' && (
              <div>
                {(canBankIngresos || canBankEgresos) && (
                  <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                    {canBankIngresos && (
                      <button
                        type="button"
                        onClick={() => startBank('ingresos')}
                        style={{
                          fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999, border: 'none', cursor: 'pointer',
                          background: bankMode === 'ingresos' ? 'var(--teal-600)' : 'var(--sand-100)',
                          color: bankMode === 'ingresos' ? 'white' : 'var(--ink-500)',
                        }}
                      >
                        Ingresos
                      </button>
                    )}
                    {canBankEgresos && (
                      <button
                        type="button"
                        onClick={() => startBank('egresos')}
                        style={{
                          fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999, border: 'none', cursor: 'pointer',
                          background: bankMode === 'egresos' ? 'var(--teal-600)' : 'var(--sand-100)',
                          color: bankMode === 'egresos' ? 'white' : 'var(--ink-500)',
                        }}
                      >
                        Egresos
                      </button>
                    )}
                  </div>
                )}
                {!host && (
                  <div style={{
                    fontSize: 12, color: 'var(--amber-700)', background: 'var(--amber-50)',
                    border: '1px solid var(--amber-100)', borderRadius: 10, padding: 10, marginBottom: 10,
                  }}>
                    Abre {bankMode === 'egresos' ? 'Gastos' : 'Cobranza'} para confirmar la captura. Rita ya puede leer el estado de cuenta.
                  </div>
                )}
                <RitaAssistant
                  tenantId={tenantId}
                  period={bankPeriod}
                  units={bankUnits}
                  gastoFields={bankFields}
                  mode={bankMode}
                  open
                  embedded
                  onClose={goHome}
                  lastAssignedMovementId={lastAssignedMovementId}
                  onAssignIngreso={(unit, prefill) => {
                    const h = getBankHost('ingresos');
                    if (h?.onAssignIngreso) h.onAssignIngreso(unit, prefill);
                    else navigate('/app/cobranza');
                  }}
                  onAssignEgreso={(prefill) => {
                    const h = getBankHost('egresos');
                    if (h?.onAssignEgreso) h.onAssignEgreso(prefill);
                    else navigate('/app/gastos');
                  }}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
