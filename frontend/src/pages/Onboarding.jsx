import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Sparkles, PlayCircle, RotateCcw,
  CheckCircle2, Clock, ChevronRight, ChevronDown,
  BookMarked,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useGuide } from '../context/GuideContext';
import { tenantsAPI } from '../api/client';
import { useTenantAccess } from '../context/TenantAccessContext';
import GUIDE_ROLES from '../constants/guideCatalog';

/**
 * Onboarding.jsx
 * ─────────────────────────────────────────────────────────────────
 * Hub central de Guías de uso (Homly Residencial).
 * Secciones: Mapa del condominio (conexiones) + guías por rol.
 *
 * Tipos de capítulos:
 *   - kind: 'interactive'  → AdminConfigTour en launchRoute
 *   - kind: 'modal'        → GuideModal flotante con pasos
 */

function mapUserRoleToCatalog(role) {
  if (role === 'superadmin' || role === 'admin') return 'admin';
  if (role === 'tesorero')   return 'tesorero';
  if (role === 'contador' || role === 'auditor') return 'contador';
  if (role === 'vecino') return 'vecino';
  if (role === 'vigilante') return 'vigilante';
  return 'admin';
}

// null = visible si el usuario puede abrir Guías (sin módulo extra)
const CHAPTER_MODULE = {
  'mapa-overview':        null,
  'mapa-finanzas':        null,
  'mapa-operacion':       null,
  'mapa-comunidad':       null,
  'admin-setup':           'config',
  'admin-units':           'config',
  'admin-users':           'config',
  'admin-dashboard':       'dashboard',
  'admin-reservas':        'reservas',
  'admin-paqueteria':      'paqueteria',
  'admin-visitas':         'visitas',
  'admin-mantenimientos':  'mantenimientos',
  'admin-comunicacion':    'blog',
  'admin-asambleas':       'asambleas',
  'admin-notificaciones':  'notificaciones',
  'admin-committee':       'cierre_periodo',
  'tes-cobranza':          'cobranza',
  'tes-plan-pagos':        'plan_pagos',
  'tes-gastos':            'gastos',
  'tes-caja-chica':        'caja_chica',
  'tes-estado-cuenta':     'estado_cuenta',
  'tes-planeacion':        'planeacion',
  'tes-cierre':            'cierre_periodo',
  'cont-dashboard':        'dashboard',
  'cont-reportes':         'estado_cuenta',
  'cont-categorias':       'config',
  'cont-cierre':           'cierre_periodo',
  'vec-my-unit':           'my_unit',
  'vec-estado-cuenta':     'estado_cuenta',
  'vec-enviar-pago':       'enviar_pago',
  'vec-reservas':          'reservas',
  'vec-visitas':           'visitas',
  'vec-paqueteria':        'paqueteria',
  'vec-asambleas':         'asambleas',
  'vec-notificaciones':    'notificaciones',
  'vig-paquetes':          'paqueteria',
  'vig-visitas':           'visitas',
};

// Todos ven el Mapa. Admin/superadmin/custom ven todos los roles;
// el resto ve Mapa + su rol. Capítulos filtrados por módulo del tenant.
function visibleSections(roleKey, isAdmin, isSuperAdmin, isCustom, canAccessModule) {
  const mapa = GUIDE_ROLES.filter(s => s.key === 'mapa');
  const rest = GUIDE_ROLES.filter(s => s.key !== 'mapa');
  const roleSections = (isAdmin || isSuperAdmin || isCustom)
    ? rest
    : rest.filter(s => s.key === roleKey);
  return [...mapa, ...roleSections].map(section => ({
    ...section,
    chapters: section.chapters.filter(ch => {
      const mod = CHAPTER_MODULE[ch.id];
      if (mod === undefined) return true;
      return !mod || canAccessModule(mod);
    }),
  })).filter(section => section.chapters.length > 0);
}

export default function Onboarding() {
  const { tenantId, role, isAdmin, isSuperAdmin, profileId } = useAuth();
  const { launchGuide } = useGuide();
  const { canAccessModule, accessReady } = useTenantAccess();
  const navigate = useNavigate();
  const isCustom = role === 'custom' || !!profileId;

  const [tenant, setTenant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);

  // Rol activo del usuario mapeado al catálogo
  const userRoleKey = useMemo(() => mapUserRoleToCatalog(role), [role]);

  // Mapa + sección del usuario abiertas por defecto
  const [expanded, setExpanded] = useState(() => ({ mapa: true, [userRoleKey]: true }));

  useEffect(() => {
    setExpanded(prev => ({ ...prev, mapa: true, [userRoleKey]: true }));
  }, [userRoleKey]);

  useEffect(() => {
    if (!tenantId) { setLoading(false); return; }
    setLoading(true);
    tenantsAPI.get(tenantId)
      .then(r => setTenant(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [tenantId]);

  const completed = !!tenant?.onboarding_completed;
  const tenantName = tenant?.name || 'tu condominio';
  const startAdminTour = () => {
    if (!canAccessModule('config')) {
      toast.error('No tienes acceso a Configuración');
      return;
    }
    navigate('/app/config?tour=1');
  };

  const resetTour = async () => {
    if (!tenantId) return;
    setResetting(true);
    try {
      await tenantsAPI.onboardingReset(tenantId);
      toast.success('Tour reiniciado');
      setTenant(prev => prev ? { ...prev, onboarding_completed: false, onboarding_dismissed_at: null } : prev);
    } catch {
      toast.error('No se pudo reiniciar');
    } finally {
      setResetting(false);
    }
  };

  const toggle = (key) => setExpanded(prev => ({ ...prev, [key]: !prev[key] }));

  const launchChapter = (chapter) => {
    const required = CHAPTER_MODULE[chapter.id];
    if (required && !canAccessModule(required)) {
      toast.error('No tienes permiso para este módulo');
      return;
    }
    if (chapter.kind === 'interactive') {
      if (!canAccessModule('config')) {
        toast.error('No tienes acceso a Configuración');
        return;
      }
      navigate(chapter.launchRoute || '/app/config?tour=1');
      return;
    }
    launchGuide(chapter);
  };

  if (loading || !accessReady) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-400)' }}>Cargando…</div>;
  }

  return (
    <div className="content-fade" style={{ maxWidth: 920 }}>
      {/* ── Hero ─────────────────────────────────────────────────── */}
      <div
        style={{
          borderRadius: 16,
          padding: '28px 28px 24px',
          background: 'linear-gradient(135deg, var(--teal-50) 0%, #ccfbf1 100%)',
          border: '1px solid var(--teal-100)',
          marginBottom: 20,
          display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap',
        }}
      >
        <div style={{
          width: 72, height: 72, borderRadius: 16,
          background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 12px rgba(20,184,166,0.15)',
          flexShrink: 0,
        }}>
          <Sparkles size={38} color="var(--teal-500)" />
        </div>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{
            fontSize: 11, fontWeight: 800, letterSpacing: '0.08em',
            color: 'var(--teal-600)', textTransform: 'uppercase', marginBottom: 4,
          }}>
            Guías de uso · Homly Residencial
          </div>
          <h2 style={{
            margin: 0, fontSize: 24, fontWeight: 800,
            color: 'var(--ink-800)', lineHeight: 1.25,
          }}>
            Aprende a operar {tenantName} con claridad
          </h2>
          <p style={{
            margin: '8px 0 0', fontSize: 14, color: 'var(--ink-600)',
            lineHeight: 1.55,
          }}>
            Empieza por el <strong>Mapa del condominio</strong> para ver cómo se
            conectan Finanzas y Operación. Luego abre los capítulos de tu rol:
            cada uno te dice qué hacer, en qué pantalla y con qué módulo se enlaza.
          </p>
        </div>
      </div>

      {/* ── Status card solo para admins ─────────────────────────── */}
      {isAdmin && canAccessModule('config') && (
        <div
          className="card"
          style={{ padding: 20, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 14 }}
        >
          {completed ? (
            <>
              <div style={{
                width: 44, height: 44, borderRadius: 10,
                background: 'var(--teal-50)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <CheckCircle2 size={22} color="var(--teal-500)" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink-800)' }}>
                  Configuración inicial completada
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>
                  {tenant?.updated_at ? `Última actualización: ${new Date(tenant.updated_at).toLocaleDateString('es-MX')}` : 'Listo para operar'}
                </div>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={resetTour} disabled={resetting}>
                <RotateCcw size={14} /> {resetting ? 'Reiniciando…' : 'Reiniciar tour'}
              </button>
            </>
          ) : (
            <>
              <div style={{
                width: 44, height: 44, borderRadius: 10,
                background: '#fef3c7',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Clock size={22} color="#f59e0b" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink-800)' }}>
                  Configuración inicial pendiente
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>
                  Termina el tour interactivo para marcar este condominio como listo para operar.
                </div>
              </div>
              <button className="btn btn-primary btn-sm" onClick={startAdminTour}>
                <PlayCircle size={14} /> Iniciar tour
              </button>
            </>
          )}
        </div>
      )}

      {/* ── Secciones colapsables por rol ────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
        {visibleSections(userRoleKey, isAdmin, isSuperAdmin, isCustom, canAccessModule).map(section => (
          <RoleSection
            key={section.key}
            section={section}
            isCurrentRole={section.key === userRoleKey}
            open={!!expanded[section.key]}
            onToggle={() => toggle(section.key)}
            onLaunchChapter={launchChapter}
          />
        ))}
      </div>

      {/* ── Tips ─────────────────────────────────────────────────── */}
      <div
        style={{
          padding: 16,
          borderRadius: 12,
          background: 'var(--sand-50)',
          border: '1px dashed var(--sand-200)',
          display: 'flex', alignItems: 'flex-start', gap: 12,
        }}
      >
        <Sparkles size={20} color="var(--teal-500)" style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={{ fontSize: 13, color: 'var(--ink-600)', lineHeight: 1.55 }}>
          <strong>Tip:</strong> Al abrir un capítulo, la guía flota sobre la
          pantalla real y te lleva al módulo. Arrástrala, practica y avanza a tu
          ritmo. Busca las frases “Se conecta con…” para entender el flujo completo
          del mes (cobranza → gastos → periodos/expediente, y caseta → avisos → reporte).
          {(isSuperAdmin || isAdmin)
            ? ' Como administrador ves las guías de todos los roles.'
            : ''}
        </div>
      </div>
      {/* GuideModal se renderiza en AppLayout para persistir durante la navegación */}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  RoleSection — tarjeta colapsable para un rol
// ═══════════════════════════════════════════════════════════════
function RoleSection({ section, isCurrentRole, open, onToggle, onLaunchChapter }) {
  const Icon = section.icon;
  const chapters = section.chapters || [];

  return (
    <div
      className="card"
      style={{
        padding: 0, overflow: 'hidden',
        border: isCurrentRole ? `1.5px solid ${section.color}` : undefined,
        boxShadow: isCurrentRole ? `0 2px 12px ${section.color}22` : undefined,
      }}
    >
      {/* Header colapsable */}
      <button
        onClick={onToggle}
        style={{
          width: '100%', border: 'none', background: 'transparent',
          padding: '14px 20px',
          display: 'flex', alignItems: 'center', gap: 14,
          cursor: 'pointer', textAlign: 'left',
          transition: 'background 0.15s',
        }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--sand-50)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        <div style={{
          width: 44, height: 44, borderRadius: 12,
          background: section.bg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Icon size={22} color={section.color} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink-800)' }}>
              {section.label}
            </span>
            {isCurrentRole && (
              <span style={{
                fontSize: 10, fontWeight: 800, letterSpacing: '0.05em',
                padding: '2px 8px', borderRadius: 999,
                background: section.color, color: 'white',
                textTransform: 'uppercase',
              }}>
                Tu rol
              </span>
            )}
            <span style={{
              fontSize: 10, fontWeight: 700, color: 'var(--ink-400)',
              background: 'var(--sand-100)', padding: '2px 7px',
              borderRadius: 6,
            }}>
              {chapters.length} {chapters.length === 1 ? 'capítulo' : 'capítulos'}
            </span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: 2 }}>
            {section.description}
          </div>
        </div>
        <ChevronDown
          size={18}
          color="var(--ink-400)"
          style={{
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.25s',
            flexShrink: 0,
          }}
        />
      </button>

      {/* Body con los capítulos */}
      {open && (
        <div style={{ borderTop: '1px solid var(--sand-100)' }}>
          {chapters.map((ch, i) => (
            <ChapterRow
              key={ch.id}
              chapter={ch}
              last={i === chapters.length - 1}
              onLaunch={() => onLaunchChapter(ch)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  ChapterRow — una línea por capítulo
// ═══════════════════════════════════════════════════════════════
function ChapterRow({ chapter, last, onLaunch }) {
  const Icon = chapter.icon || BookMarked;
  const interactive = chapter.kind === 'interactive';

  return (
    <button
      onClick={onLaunch}
      style={{
        width: '100%', border: 'none', background: 'transparent',
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '13px 20px', cursor: 'pointer', textAlign: 'left',
        borderBottom: last ? 'none' : '1px solid var(--sand-50)',
        transition: 'background 0.1s',
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--sand-50)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      <div style={{
        width: 36, height: 36, borderRadius: 10,
        background: chapter.bg || 'var(--sand-100)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <Icon size={18} color={chapter.color || 'var(--ink-500)'} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink-800)' }}>
            {chapter.title}
          </span>
          {interactive && (
            <span style={{
              fontSize: 9, fontWeight: 800, letterSpacing: '0.05em',
              padding: '2px 7px', borderRadius: 6,
              background: 'var(--teal-50)', color: 'var(--teal-600)',
              textTransform: 'uppercase',
            }}>
              Interactivo
            </span>
          )}
          {chapter.length && (
            <span style={{
              fontSize: 10, color: 'var(--ink-400)',
              background: 'var(--sand-50)', padding: '1px 6px',
              borderRadius: 5,
            }}>
              {chapter.length}
            </span>
          )}
        </div>
        <div style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: 2 }}>
          {chapter.subtitle}
        </div>
      </div>
      {interactive
        ? <PlayCircle size={18} color="var(--teal-500)" style={{ flexShrink: 0 }} />
        : <ChevronRight size={16} color="var(--ink-400)" style={{ flexShrink: 0 }} />
      }
    </button>
  );
}
