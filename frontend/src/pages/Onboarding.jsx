import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Compass, Sparkles, PlayCircle, RotateCcw,
  CheckCircle2, Clock, Settings, ChevronRight,
  Building2, Receipt, Users, Shield, Globe, Layers,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { tenantsAPI } from '../api/client';

/**
 * Onboarding.jsx
 * ─────────────────────────────────────────────────────────────────
 * Intro page for the interactive onboarding tour. This is the page
 * behind the "Guía de Inicio" sidebar item. It shows the current
 * status, the steps the tour will cover, and a CTA to launch the
 * interactive tour (which lives inside Configuración).
 */
export default function Onboarding() {
  const { tenantId, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [tenant, setTenant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    if (!tenantId) { setLoading(false); return; }
    setLoading(true);
    tenantsAPI.get(tenantId)
      .then(r => setTenant(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [tenantId]);

  const startTour = () => navigate('/app/config?tour=1');

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

  const completed = !!tenant?.onboarding_completed;
  const tenantName = tenant?.name || 'tu condominio';

  const sections = [
    { key: 'general', icon: Settings,   color: '#6366f1', title: 'General',             desc: 'Nombre, cuota, moneda, saldo inicial, domicilio' },
    { key: 'units',   icon: Building2,  color: '#0ea5e9', title: 'Unidades',            desc: 'Alta de casas, deptos, propietarios y correos' },
    { key: 'fields',  icon: Receipt,    color: '#22c55e', title: 'Gastos y Cobranza',   desc: 'Categorías y conceptos financieros' },
    { key: 'users',   icon: Users,      color: '#f59e0b', title: 'Usuarios',            desc: 'Invitaciones y accesos al sistema' },
    { key: 'roles',   icon: Shield,     color: '#ec4899', title: 'Roles y Perfiles',    desc: 'Permisos y perfiles personalizados' },
    { key: 'org',     icon: Globe,      color: '#8b5cf6', title: 'Organización',        desc: 'Comité y flujo de aprobación de cierre' },
    { key: 'modules', icon: Layers,     color: '#14b8a6', title: 'Módulos',             desc: 'Activar o desactivar funciones del sistema' },
  ];

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-400)' }}>Cargando…</div>;
  }

  if (!isAdmin) {
    return (
      <div className="card" style={{ padding: 24, maxWidth: 620 }}>
        <h3 style={{ margin: 0 }}>Guía de Inicio</h3>
        <p style={{ color: 'var(--ink-500)', marginTop: 8 }}>
          Esta guía está disponible únicamente para los administradores del condominio.
        </p>
      </div>
    );
  }

  return (
    <div className="content-fade" style={{ maxWidth: 900 }}>
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
            Guía de inicio interactiva
          </div>
          <h2 style={{
            margin: 0, fontSize: 24, fontWeight: 800,
            color: 'var(--ink-800)', lineHeight: 1.25,
          }}>
            {completed
              ? `${tenantName} ya está configurado`
              : `Configuremos ${tenantName} paso a paso`}
          </h2>
          <p style={{
            margin: '8px 0 0', fontSize: 14, color: 'var(--ink-600)',
            lineHeight: 1.55,
          }}>
            {completed
              ? 'Ya completaste el tour de onboarding. Puedes volver a ejecutarlo cuando quieras para repasar las configuraciones.'
              : 'Un tour guiado te llevará por cada sección explicando para qué sirve y cómo completarla. No necesitas experiencia previa — te acompañamos hasta dejar todo listo.'}
          </p>
        </div>
      </div>

      {/* ── Status card ──────────────────────────────────────────── */}
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
                Onboarding completado
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
                Configuración pendiente
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>
                Termina el tour para marcar este condominio como listo para operar.
              </div>
            </div>
            <button className="btn btn-primary btn-sm" onClick={startTour}>
              <PlayCircle size={14} /> Iniciar tour
            </button>
          </>
        )}
      </div>

      {/* ── Sections preview ─────────────────────────────────────── */}
      <div className="card" style={{ padding: 0, marginBottom: 20, overflow: 'hidden' }}>
        <div className="card-head" style={{ padding: '16px 20px', borderBottom: '1px solid var(--sand-100)' }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>Lo que cubriremos</h3>
          <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>
            {sections.length} secciones de Configuración
          </div>
        </div>
        <div>
          {sections.map((s, i) => {
            const Icon = s.icon;
            return (
              <button
                key={s.key}
                onClick={() => navigate(`/app/config?tour=1`)}
                style={{
                  width: '100%', border: 'none', background: 'transparent',
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '14px 20px', cursor: 'pointer', textAlign: 'left',
                  borderBottom: i < sections.length - 1 ? '1px solid var(--sand-50)' : 'none',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--sand-50)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{
                  width: 38, height: 38, borderRadius: 10,
                  background: `${s.color}15`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <Icon size={19} color={s.color} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink-800)' }}>
                    {i + 1}. {s.title}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: 1 }}>
                    {s.desc}
                  </div>
                </div>
                <ChevronRight size={16} color="var(--ink-400)" />
              </button>
            );
          })}
        </div>
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
          <strong>Tip:</strong> Puedes cerrar el tour en cualquier momento y continuarlo después.
          Todo lo que captures se guarda al momento — el tour solo te indica por dónde empezar.
        </div>
      </div>
    </div>
  );
}
