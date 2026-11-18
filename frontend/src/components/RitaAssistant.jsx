import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles, Upload, X, ChevronRight, SkipForward, CheckCircle2, Building2, ArrowDownCircle, ArrowUpCircle, Loader, FileText, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { ritaAPI } from '../api/client';
import { periodLabel } from '../utils/helpers';

const fmt = (n) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n ?? 0);

function suggestGastoField(fields, concept) {
  if (!concept || !fields?.length) return null;
  const c = String(concept).toLowerCase();
  const scored = fields.map(f => {
    const lab = (f.label || '').toLowerCase();
    let score = 0;
    if (lab && c.includes(lab)) score += 3;
    lab.split(/\s+/).filter(w => w.length > 3).forEach(w => { if (c.includes(w)) score += 1; });
    return { f, score };
  }).filter(x => x.score > 0).sort((a, b) => b.score - a.score);
  return scored[0]?.f || null;
}

/**
 * Rita — asistente de estados de cuenta (PDF único en Estado General).
 * mode: 'ingresos' | 'egresos'
 */
export default function RitaAssistant({
  tenantId,
  period,
  units = [],
  gastoFields = [],
  mode = 'ingresos',
  open,
  onClose,
  onAssignIngreso,
  onAssignEgreso,
  lastAssignedMovementId,
}) {
  const fileRef = useRef(null);
  const focus = mode === 'egresos' ? 'egresos' : 'ingresos';
  const [profiles, setProfiles] = useState([]);
  const [bankProfile, setBankProfile] = useState('generic');
  const [defaultPaymentType, setDefaultPaymentType] = useState('transferencia');
  const [caps, setCaps] = useState({ bank_upload: true, ingresos: true, egresos: true, settings: false });
  const [loading, setLoading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [session, setSession] = useState(null);
  const [periodInfo, setPeriodInfo] = useState(null);
  const [tab, setTab] = useState(focus);

  useEffect(() => {
    if (!open || !tenantId) return;
    setLoading(true);
    setTab(focus);
    Promise.all([
      ritaAPI.profiles(tenantId),
      ritaAPI.periodStatus(tenantId, { period, focus }),
    ])
      .then(([profRes, stRes]) => {
        const data = profRes.data || {};
        setProfiles(data.profiles || []);
        setBankProfile(data.settings?.bank_profile || 'generic');
        setDefaultPaymentType(data.settings?.default_payment_type || 'transferencia');
        const c = { ...(data.capabilities || {}), ...(stRes.data?.capabilities || {}) };
        setCaps({
          bank_upload: !!c.bank_upload,
          ingresos: !!c.ingresos,
          egresos: !!c.egresos,
          settings: !!c.settings,
        });
        setPeriodInfo(stRes.data || null);
        if (stRes.data?.open_session) {
          setSession(stRes.data.open_session);
        } else {
          setSession(null);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, tenantId, period, focus]);

  useEffect(() => {
    if (!lastAssignedMovementId || !session?.id) return;
    const mov = (session.movements || []).find(m => m.id === lastAssignedMovementId);
    if (!mov || mov.status === 'assigned') return;
    ritaAPI.movementAction(tenantId, session.id, {
      action: 'assign',
      movement_id: lastAssignedMovementId,
      focus,
    }).then(({ data }) => setSession(data)).catch(() => {});
  }, [lastAssignedMovementId]); // eslint-disable-line react-hooks/exhaustive-deps

  const ingresos = useMemo(
    () => (session?.movements || []).filter(m => m.kind === 'ingreso'),
    [session],
  );
  const egresos = useMemo(
    () => (session?.movements || []).filter(m => m.kind === 'egreso'),
    [session],
  );

  const pendingIngresos = session?.pending_ingresos || [];
  const pendingEgresos = session?.pending_egresos || [];
  const pending = focus === 'egresos' ? pendingEgresos : pendingIngresos;
  const current = useMemo(() => {
    if (!session) return null;
    if (session.current && session.current.kind === (focus === 'egresos' ? 'egreso' : 'ingreso')) {
      return session.current;
    }
    return pending[0] || null;
  }, [session, focus, pending]);

  const list = tab === 'egresos' ? egresos : tab === 'todos' ? (session?.movements || []) : ingresos;

  const applySession = (data, msg) => {
    setSession(data);
    setPeriodInfo(prev => ({
      ...(prev || {}),
      has_bank_statement: true,
      bank_statement_id: data.bank_statement_id || prev?.bank_statement_id,
      open_session: data,
    }));
    setTab(focus);
    if (msg) toast.success(msg);
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
      toast.error('Sube el estado de cuenta en PDF');
      return;
    }
    setParsing(true);
    try {
      const form = new FormData();
      form.append('file', file, file.name);
      form.append('period', period);
      form.append('bank_profile', bankProfile);
      form.append('focus', focus);
      const { data } = await ritaAPI.parse(tenantId, form);
      applySession(
        data,
        `Guardado en Estado General · ${data.summary?.ingresos || 0} ingresos · ${data.summary?.egresos || 0} egresos`,
      );
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'No se pudo leer el estado de cuenta');
    } finally {
      setParsing(false);
    }
  };

  const useSavedStatement = async (force = false) => {
    setParsing(true);
    try {
      const { data } = await ritaAPI.parseFromStatement(tenantId, {
        period,
        bank_profile: bankProfile,
        focus,
        force,
      });
      applySession(
        data,
        force
          ? `Releído · ${data.summary?.ingresos || 0} ingresos · ${data.summary?.egresos || 0} egresos`
          : `Usando estado de ${periodLabel(period)}`,
      );
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'No hay estado de cuenta para este período');
    } finally {
      setParsing(false);
    }
  };

  const skipCurrent = async () => {
    if (!current || !session) return;
    try {
      const { data } = await ritaAPI.movementAction(tenantId, session.id, {
        action: 'skip',
        movement_id: current.id,
        focus,
      });
      setSession(data);
    } catch {
      toast.error('No se pudo omitir el movimiento');
    }
  };

  const buildPrefill = () => ({
    movement_id: current.id,
    session_id: session.id,
    amount: current.amount,
    payment_date: current.date || undefined,
    gasto_date: current.date || undefined,
    payment_type: defaultPaymentType || 'transferencia',
    folio: current.folio || current.reference || '',
    doc_number: current.folio || current.reference || '',
    notes: [
      current.concept && `Concepto banco: ${current.concept}`,
      current.counterparty && (focus === 'egresos' ? `A: ${current.counterparty}` : `De: ${current.counterparty}`),
      current.bank_from && `Vía: ${current.bank_from}`,
      'Asignado con Rita',
    ].filter(Boolean).join(' · '),
    bank_reconciled: true,
    concept: current.concept,
    provider_name: focus === 'egresos' ? (current.counterparty || '') : '',
  });

  const assignIngreso = (unit) => {
    if (!current || current.kind !== 'ingreso') return;
    onAssignIngreso?.(unit, buildPrefill());
  };

  const assignCurrentIngreso = () => {
    if (!current) return;
    const unitId = current.suggested_unit_id;
    const unit = units.find(u => String(u.id) === String(unitId))
      || units.find(u => {
        const code = (u.unit_id_code || '').toLowerCase();
        const hint = `${current.suggested_unit_code || ''} ${current.concept || ''}`.toLowerCase();
        return current.suggested_unit_code && code === String(current.suggested_unit_code).toLowerCase()
          || (code && hint.includes(code));
      });
    if (!unit) {
      toast('Elige la unidad en la lista de abajo.', { icon: '🏠' });
      return;
    }
    assignIngreso(unit);
  };

  const assignCurrentEgreso = () => {
    if (!current || current.kind !== 'egreso') return;
    const suggested = suggestGastoField(gastoFields, current.concept || current.description);
    onAssignEgreso?.({
      ...buildPrefill(),
      field: suggested?.id || '',
      field_label: suggested?.label || '',
    });
  };

  if (!open) return null;

  const subtitle = mode === 'egresos'
    ? 'Estados de cuenta → Gastos'
    : 'Estados de cuenta → Cobranza';

  const currentKindLabel = focus === 'egresos' ? 'egreso' : 'ingreso';
  const accent = focus === 'egresos' ? 'var(--coral-600)' : 'var(--teal-700)';
  const panelBg = focus === 'egresos' ? 'var(--coral-50, #fff5f5)' : 'var(--teal-50)';
  const panelBorder = focus === 'egresos' ? '1.5px solid var(--coral-200, #fecaca)' : '1.5px solid var(--teal-200)';

  return (
    <div
      style={{
        position: 'fixed', right: 16, bottom: 16, zIndex: 2600,
        width: 400, maxWidth: 'calc(100vw - 24px)', maxHeight: 'min(720px, calc(100vh - 32px))',
        background: 'white', borderRadius: 16,
        boxShadow: '0 18px 50px rgba(15, 92, 82, 0.22)',
        border: '1px solid var(--teal-100)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}
    >
      <div style={{
        padding: '12px 14px', background: 'linear-gradient(135deg, var(--teal-50), #ccfbf1)',
        borderBottom: '1px solid var(--teal-100)', display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10, background: 'white',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 2px 8px rgba(13,124,110,0.15)',
        }}>
          <Sparkles size={18} color="var(--teal-600)" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--ink-800)' }}>Rita</div>
          <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>{subtitle}</div>
        </div>
        <button type="button" onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--ink-400)' }}>
          <X size={18} />
        </button>
      </div>

      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10, overflow: 'auto', flex: 1 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            className="field-input"
            value={bankProfile}
            onChange={e => setBankProfile(e.target.value)}
            style={{ flex: 1, minWidth: 120, fontSize: 12, padding: '6px 8px' }}
            disabled={parsing}
          >
            {(profiles.length ? profiles : [{ id: 'generic', label: 'Genérico' }]).map(p => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
          {caps.bank_upload && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={parsing || loading}
              onClick={() => fileRef.current?.click()}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              {parsing ? <Loader size={14} className="spin" /> : <Upload size={14} />}
              {parsing ? 'Leyendo…' : 'Subir PDF'}
            </button>
          )}
          <input ref={fileRef} type="file" accept=".pdf,application/pdf" hidden onChange={handleFile} />
        </div>

        <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>
          Período: <b>{periodLabel(period)}</b>. El PDF se guarda una vez en <b>Estado General</b> y sirve para ingresos y gastos.
        </div>

        {periodInfo?.has_bank_statement && (
          <div style={{
            display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
            padding: '8px 10px', borderRadius: 10, background: 'var(--sand-50)', border: '1px solid var(--sand-100)',
          }}>
            <FileText size={14} color="var(--teal-600)" />
            <span style={{ flex: 1, fontSize: 12, color: 'var(--ink-600)' }}>
              Hay estado bancario guardado para este período
            </span>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={parsing}
              onClick={() => useSavedStatement(false)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11 }}
            >
              Usar guardado
            </button>
            {session && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={parsing}
                onClick={() => useSavedStatement(true)}
                title="Volver a leer el PDF (reinicia pendientes)"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11 }}
              >
                <RefreshCw size={12} /> Releer
              </button>
            )}
          </div>
        )}

        {session && (
          <>
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8,
              background: 'var(--sand-50)', borderRadius: 10, padding: 10, fontSize: 12,
            }}>
              <div>
                <div style={{ color: 'var(--ink-400)', fontSize: 10 }}>Banco</div>
                <div style={{ fontWeight: 700 }}>{session.bank_label}</div>
              </div>
              <div>
                <div style={{ color: 'var(--ink-400)', fontSize: 10 }}>Archivo</div>
                <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{session.source_filename}</div>
              </div>
              <div style={{ color: 'var(--teal-700)' }}>
                <ArrowDownCircle size={12} style={{ verticalAlign: -2 }} /> Ingresos {session.summary?.ingresos || 0}
                <div style={{ fontWeight: 800 }}>{fmt(session.summary?.suma_ingresos)}</div>
                <div style={{ fontSize: 10 }}>{pendingIngresos.length} pend.</div>
              </div>
              <div style={{ color: 'var(--coral-600)' }}>
                <ArrowUpCircle size={12} style={{ verticalAlign: -2 }} /> Egresos {session.summary?.egresos || 0}
                <div style={{ fontWeight: 800 }}>{fmt(session.summary?.suma_egresos)}</div>
                <div style={{ fontSize: 10 }}>{pendingEgresos.length} pend.</div>
              </div>
            </div>

            {current ? (
              <div style={{ border: panelBorder, borderRadius: 12, padding: 12, background: panelBg }}>
                <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', color: accent, textTransform: 'uppercase', marginBottom: 6 }}>
                  Siguiente {currentKindLabel} · {pending.length} pendiente{pending.length === 1 ? '' : 's'}
                </div>
                <div style={{ fontSize: 20, fontWeight: 800, color: accent }}>{fmt(current.amount)}</div>
                <div style={{ fontSize: 12, color: 'var(--ink-600)', marginTop: 4 }}>
                  {current.date || 'Sin fecha'} {current.folio ? `· Folio ${current.folio}` : ''}
                </div>
                {current.concept && <div style={{ fontSize: 12, marginTop: 4 }}><b>Concepto:</b> {current.concept}</div>}
                {current.counterparty && (
                  <div style={{ fontSize: 12 }}>
                    <b>{focus === 'egresos' ? 'A:' : 'De:'}</b> {current.counterparty}
                  </div>
                )}
                <div style={{ fontSize: 11, color: 'var(--ink-500)', marginTop: 6 }}>{current.description}</div>

                {focus === 'ingresos' && (current.suggested_unit_name || current.suggested_unit_code) && (
                  <div style={{
                    marginTop: 8, padding: '6px 8px', borderRadius: 8, background: 'white',
                    fontSize: 12, display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    <Building2 size={14} color="var(--teal-600)" />
                    Sugerida: <b>{current.suggested_unit_name || current.suggested_unit_code}</b>
                  </div>
                )}

                {focus === 'egresos' && (() => {
                  const sug = suggestGastoField(gastoFields, current.concept || current.description);
                  return sug ? (
                    <div style={{
                      marginTop: 8, padding: '6px 8px', borderRadius: 8, background: 'white',
                      fontSize: 12,
                    }}>
                      Concepto sugerido: <b>{sug.label}</b>
                    </div>
                  ) : null;
                })()}

                <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  {focus === 'ingresos' && caps.ingresos && (
                    <button type="button" className="btn btn-primary btn-sm" onClick={assignCurrentIngreso} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <ChevronRight size={14} /> Capturar en cobranza
                    </button>
                  )}
                  {focus === 'egresos' && caps.egresos && (
                    <button type="button" className="btn btn-primary btn-sm" onClick={assignCurrentEgreso} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <ChevronRight size={14} /> Capturar en gastos
                    </button>
                  )}
                  {((focus === 'ingresos' && caps.ingresos) || (focus === 'egresos' && caps.egresos)) && (
                    <button type="button" className="btn btn-secondary btn-sm" onClick={skipCurrent} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <SkipForward size={14} /> Omitir
                    </button>
                  )}
                </div>

                {focus === 'ingresos' && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 11, color: 'var(--ink-400)', marginBottom: 4 }}>
                      {current.suggested_unit_id ? 'O elige otra unidad:' : 'Elige unidad para este ingreso:'}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 120, overflow: 'auto' }}>
                      {units.slice(0, 60).map(u => (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => assignIngreso(u)}
                          style={{
                            textAlign: 'left', border: '1px solid var(--sand-200)', borderRadius: 8,
                            padding: '6px 8px', background: 'white', cursor: 'pointer', fontSize: 12,
                          }}
                        >
                          {(u.unit_name || u.unit_id_code)} {u.unit_name && u.unit_id_code ? `(${u.unit_id_code})` : ''}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {focus === 'egresos' && gastoFields.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 11, color: 'var(--ink-400)', marginBottom: 4 }}>O elige concepto de gasto:</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 120, overflow: 'auto' }}>
                      {gastoFields.slice(0, 40).map(f => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => onAssignEgreso?.({ ...buildPrefill(), field: f.id, field_label: f.label })}
                          style={{
                            textAlign: 'left', border: '1px solid var(--sand-200)', borderRadius: 8,
                            padding: '6px 8px', background: 'white', cursor: 'pointer', fontSize: 12,
                          }}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{
                padding: 14, borderRadius: 12, background: panelBg, border: panelBorder,
                fontSize: 13, color: accent, display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <CheckCircle2 size={18} />
                No hay {currentKindLabel}s pendientes. ¡Buen trabajo!
              </div>
            )}

            <div style={{ display: 'flex', gap: 6 }}>
              {[['ingresos', `Ingresos (${ingresos.length})`], ['egresos', `Egresos (${egresos.length})`], ['todos', 'Todos']].map(([k, lab]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setTab(k)}
                  style={{
                    fontSize: 11, fontWeight: 700, padding: '4px 8px', borderRadius: 999, border: 'none', cursor: 'pointer',
                    background: tab === k ? 'var(--teal-600)' : 'var(--sand-100)',
                    color: tab === k ? 'white' : 'var(--ink-500)',
                  }}
                >
                  {lab}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 160, overflow: 'auto' }}>
              {list.map(m => (
                <div key={m.id} style={{
                  fontSize: 11, padding: '6px 8px', borderRadius: 8,
                  border: '1px solid var(--sand-100)',
                  background: m.status === 'pending' ? 'white' : 'var(--sand-50)',
                  opacity: m.status === 'pending' ? 1 : 0.7,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontWeight: 700, color: m.kind === 'ingreso' ? 'var(--teal-700)' : 'var(--coral-600)' }}>
                      {m.kind === 'ingreso' ? '+' : '−'}{fmt(m.amount)}
                    </span>
                    <span style={{ color: 'var(--ink-400)' }}>{m.date || '—'} · {m.status}</span>
                  </div>
                  <div style={{ color: 'var(--ink-600)' }}>{m.concept || m.description}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {!session && !parsing && !loading && (
          <div style={{ fontSize: 12, color: 'var(--ink-500)', lineHeight: 1.5, padding: '8px 2px' }}>
            {periodInfo?.has_bank_statement
              ? <>Pulsa <b>Usar guardado</b> para trabajar con el PDF de Estado General, o sube uno nuevo (reemplaza el del período).</>
              : <>Sube el PDF del banco o cárgalo en <b>Estado de Cuenta → Estado General</b>. Rita lo guarda una vez y lo usa en Cobranza y Gastos.</>}
          </div>
        )}
      </div>
    </div>
  );
}
