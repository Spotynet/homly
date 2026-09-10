import { Ban } from 'lucide-react';

/** Etiqueta compacta — tablas, formularios, encabezados. */
export default function ServicesSuspensionBadge({ size = 'sm', style }) {
  const compact = size === 'sm';
  return (
    <span
      title="Esta unidad tiene suspensión de servicios por adeudo"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: compact ? 4 : 7,
        background: 'var(--amber-50)',
        color: 'var(--amber-800)',
        border: '1px solid var(--amber-200)',
        borderRadius: compact ? 4 : 8,
        padding: compact ? '2px 7px' : '6px 10px',
        fontSize: compact ? 10 : 12,
        fontWeight: 700,
        lineHeight: 1.2,
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      <Ban size={compact ? 11 : 14} />
      Suspensión de servicios
    </span>
  );
}

/** Aviso informativo en dashboards / detalle de unidad. */
export function ServicesSuspensionBanner({ style }) {
  return (
    <div
      role="status"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        background: 'var(--amber-50)',
        border: '1px solid var(--amber-200)',
        borderRadius: 10,
        padding: '12px 14px',
        ...style,
      }}
    >
      <Ban size={18} color="var(--amber-700)" style={{ flexShrink: 0, marginTop: 1 }} />
      <div>
        <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--amber-800)' }}>
          Suspensión de servicios
        </div>
        <div style={{ fontSize: 12, color: 'var(--amber-700)', marginTop: 2, lineHeight: 1.45 }}>
          La administración marcó esta unidad con suspensión de servicios por adeudo.
          Es un aviso informativo; no impide consultar el estado de cuenta ni registrar pagos.
        </div>
      </div>
    </div>
  );
}
