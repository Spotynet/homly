import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, ChevronRight, PlayCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useGuide } from '../../context/GuideContext';
import { useRita } from '../../context/RitaContext';
import { useTenantAccess } from '../../context/TenantAccessContext';
import GUIDE_ROLES from '../../constants/guideCatalog';

function mapUserRoleToCatalog(role) {
  if (role === 'superadmin' || role === 'admin') return 'admin';
  if (role === 'tesorero') return 'tesorero';
  if (role === 'contador' || role === 'auditor') return 'contador';
  if (role === 'vecino') return 'vecino';
  if (role === 'vigilante') return 'vigilante';
  return 'admin';
}

const CHAPTER_MODULE = {
  'mapa-overview': null, 'mapa-finanzas': null, 'mapa-operacion': null, 'mapa-comunidad': null,
  'admin-setup': 'config', 'admin-units': 'config', 'admin-users': 'config',
  'admin-dashboard': 'dashboard', 'admin-reservas': 'reservas', 'admin-paqueteria': 'paqueteria',
  'admin-visitas': 'visitas', 'admin-mantenimientos': 'mantenimientos', 'admin-comunicacion': 'blog',
  'admin-asambleas': 'asambleas', 'admin-notificaciones': 'notificaciones', 'admin-committee': 'cierre_periodo',
  'tes-cobranza': 'cobranza', 'tes-plan-pagos': 'plan_pagos', 'tes-gastos': 'gastos',
  'tes-caja-chica': 'caja_chica', 'tes-estado-cuenta': 'estado_cuenta', 'tes-planeacion': 'planeacion',
  'tes-cierre': 'cierre_periodo',
  'cont-dashboard': 'dashboard', 'cont-reportes': 'estado_cuenta', 'cont-categorias': 'config', 'cont-cierre': 'cierre_periodo',
  'vec-my-unit': 'my_unit', 'vec-estado-cuenta': 'estado_cuenta', 'vec-enviar-pago': 'enviar_pago',
  'vec-reservas': 'reservas', 'vec-visitas': 'visitas', 'vec-paqueteria': 'paqueteria',
  'vec-asambleas': 'asambleas', 'vec-notificaciones': 'notificaciones',
  'vig-paquetes': 'paqueteria', 'vig-visitas': 'visitas',
};

/**
 * Lista compacta de guías dentro del panel Rita.
 */
export default function RitaGuidesPanel() {
  const { role, isAdmin, isSuperAdmin, profileId } = useAuth();
  const { launchGuide } = useGuide();
  const { closeRita } = useRita();
  const { canAccessModule } = useTenantAccess();
  const navigate = useNavigate();
  const isCustom = role === 'custom' || !!profileId;
  const roleKey = mapUserRoleToCatalog(role);
  const [expanded, setExpanded] = useState('mapa');

  const sections = useMemo(() => {
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
    })).filter(s => s.chapters.length > 0);
  }, [roleKey, isAdmin, isSuperAdmin, isCustom, canAccessModule]);

  const launchChapter = (chapter) => {
    closeRita();
    if (chapter.kind === 'interactive' && chapter.launchRoute) {
      navigate(chapter.launchRoute);
      return;
    }
    launchGuide(chapter);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 12, color: 'var(--ink-500)', lineHeight: 1.45 }}>
        Guías interactivas del condominio. Elige un capítulo y Rita te acompaña en pantalla.
      </div>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={() => navigate('/app/onboarding')}
        style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6 }}
      >
        <BookOpen size={13} /> Abrir hub de guías
      </button>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 360, overflow: 'auto' }}>
        {sections.map(section => {
          const open = expanded === section.key;
          return (
            <div key={section.key} style={{ border: '1px solid var(--sand-100)', borderRadius: 10, overflow: 'hidden' }}>
              <button
                type="button"
                onClick={() => setExpanded(open ? '' : section.key)}
                style={{
                  width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer',
                  padding: '8px 10px', background: open ? 'var(--teal-50)' : 'var(--sand-50)',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--ink-700)' }}>{section.label || section.title || section.key}</span>
                <ChevronRight size={14} style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }} />
              </button>
              {open && (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {section.chapters.map(ch => (
                    <button
                      key={ch.id}
                      type="button"
                      onClick={() => launchChapter(ch)}
                      style={{
                        textAlign: 'left', border: 'none', borderTop: '1px solid var(--sand-100)',
                        background: 'white', cursor: 'pointer', padding: '8px 10px',
                        display: 'flex', alignItems: 'center', gap: 8,
                      }}
                    >
                      <PlayCircle size={14} color="var(--teal-600)" />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-700)' }}>{ch.title}</div>
                        {ch.subtitle && <div style={{ fontSize: 10, color: 'var(--ink-400)' }}>{ch.subtitle}</div>}
                      </span>
                      <ChevronRight size={13} color="var(--ink-300)" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
