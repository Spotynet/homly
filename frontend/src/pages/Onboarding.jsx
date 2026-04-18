import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Compass, Sparkles, PlayCircle, RotateCcw,
  CheckCircle2, Clock, ChevronRight, ChevronDown,
  BookMarked,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { tenantsAPI } from '../api/client';
import GUIDE_ROLES from '../constants/guideCatalog';
import GuideModal from '../components/onboarding/GuideModal';

/**
 * Onboarding.jsx
 * ─────────────────────────────────────────────────────────────────
 * Hub central de la Guía de Uso. Muestra las guías agrupadas por
 * rol en secciones colapsables (Administrador, Tesorero, Contador,
 * Vecino / Residente). Cada sección expone los capítulos operativos
 * de ese rol.
 *
 * Tipos de capítulos:
 *   - kind: 'interactive'  → lanza el tour Scribe (AdminConfigTour)
 *     en la ruta `launchRoute` (p.ej. /app/config?tour=1).
 *   - kind: 'modal'        → abre GuideModal con los steps del capítulo.
 */

// Mapea el rol del usuario autenticado → key del catálogo
function mapUserRoleToCatalog(role) {
  if (role === 'superadmin' || role === 'admin') return 'admin';
  if (role === 'tesorero')   return 'tesorero';
  if (role === 'contador' || role === 'auditor') return 'contador';
  if (role === 'vecino' || role === 'vigilante') return 'vecino';
  return 'admin';
}

export default function Onboarding() {
  const { tenantId, role, isAdmin, isSuperAdmin } = useAuth();
  const navigate = useNavigate();

  const [tenant, setTenant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);

  // Rol activo del usuario mapeado al catálogo
  const userRoleKey = useMemo(() => mapUserRoleToCatalog(role), [role]);

  // Secciones colapsables por rol — autoexpandir la del usuario
  const [expanded, setExpanded] = useState(() => ({ [userRoleKey]: true }));

  // Capítulo que se está viendo en modal (null = cerrado)
  const [activeChapter, setActiveChapter] = useState(null);

  useEffect(() => {
    // Al cambiar el rol del usuario, abrir automáticamente su sección
    setExpanded(prev => ({ ...prev, [userRoleKey]: true }));
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

  const startAdminTour = () => navigate('/app/config?tour=1');

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
    if (chapter.kind === 'interactive') {
      navigate(chapter.launchRoute || '/app/config?tour=1');
      return;
    }
    setActiveChapter(chapter);
  };

  if (loading) {
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
          <Compass size={38} color="var(--teal-500)" />
        </div>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{
            fontSize: 11, fontWeight: 800, letterSpacing: '0.08em',
            color: 'var(--teal-600)', textTransform: 'uppercase', marginBottom: 4,
          }}>
            Guía de uso por rol
          </div>
          <h2 style={{
            margin: 0, fontSize: 24, fontWeight: 800,
            color: 'var(--ink-800)', lineHeight: 1.25,
          }}>
            Aprende a operar {tenantName} paso a paso
          </h2>
          <p style={{
            margin: '8px 0 0', fontSize: 14, color: 'var(--ink-600)',
            lineHeight: 1.55,
          }}>
            Encuentra la guía operativa de tu rol y repásala cuando quieras.
            Cada capítulo explica qué hacer, dónde hacerlo y por qué — sin
            bloquear tu pantalla.
          </p>
        </div>
      </div>

      {/* ── Status card solo para admins ─────────────────────────── */}
      {isAdmin && (
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
        {GUIDE_ROLES.map(section => (
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
          <strong>Tip:</strong> Puedes cerrar cualquier guía y retomarla luego.
          Las guías de otros roles están visibles para que puedas entender
          cómo colaboran las distintas personas del condominio.
          {(isSuperAdmin || isAdmin) && ' Como administrador, también puedes lanzar el tour interactivo de la configuración sobre la pantalla real.'}
        </div>
      </div>

      {/* ── Modal activo ─────────────────────────────────────────── */}
      <GuideModal
        open={!!activeChapter}
        chapter={activeChapter}
        onClose={() => setActiveChapter(null)}
      />
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
