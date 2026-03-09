import { format, parse } from 'date-fns';
import { es } from 'date-fns/locale';

// Currency formatting (matches fmtCurrency from original)
export const CURRENCIES = {
  MXN: { symbol: '$', name: 'Peso Mexicano' },
  USD: { symbol: 'US$', name: 'US Dollar' },
  EUR: { symbol: '€', name: 'Euro' },
  COP: { symbol: 'COL$', name: 'Peso Colombiano' },
};

export function fmtCurrency(amount, currency = 'MXN') {
  const c = CURRENCIES[currency] || CURRENCIES.MXN;
  const num = parseFloat(amount) || 0;
  return `${c.symbol}${num.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Period helpers (matches periodLabel, todayPeriod from original)
export function todayPeriod() {
  return format(new Date(), 'yyyy-MM');
}

export function periodLabel(period) {
  if (!period) return '';
  try {
    const [y, m] = period.split('-');
    const date = new Date(parseInt(y), parseInt(m) - 1);
    return format(date, 'MMMM yyyy', { locale: es })
      .replace(/^\w/, c => c.toUpperCase());
  } catch {
    return period;
  }
}

export function prevPeriod(period) {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(y, m - 2);
  return format(d, 'yyyy-MM');
}

export function nextPeriod(period) {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(y, m);
  return format(d, 'yyyy-MM');
}

/** Apply prevPeriod n times. Used for tenant start when operation_start_date is not set. */
export function prevMonthN(period, n) {
  let p = period;
  for (let i = 0; i < n; i++) p = prevPeriod(p);
  return p;
}

/** Minimum period for Cobranza (blocks viewing records before this date). */
export function tenantStartPeriod(tenantData) {
  return tenantData?.operation_start_date || prevMonthN(todayPeriod(), 11);
}

// Role labels and colors (matches roles object from original)
export const ROLES = {
  superadmin: { label: 'Super Administrador', color: '#6D28D9', bg: '#F5F3FF' },
  super_admin: { label: 'Super Administrador', color: '#6D28D9', bg: '#F5F3FF' },
  admin: { label: 'Administrador', color: '#1F7D5B', bg: '#EDFDF7' },
  tesorero: { label: 'Tesorero', color: '#D97706', bg: '#FFFBEB' },
  contador:  { label: 'Contador',   color: '#2563EB', bg: '#EFF6FF' },
  auditor:   { label: 'Auditor',    color: '#64748B', bg: '#F1F5F9' },
  vigilante: { label: 'Vigilante',  color: '#7C3AED', bg: '#F5F3FF' },
  vecino:    { label: 'Vecino / Residente', color: '#E85D43', bg: '#FFF5F3' },
};

// Payment type labels
export const PAYMENT_TYPES = {
  transferencia: { label: '🏦 Transferencia', short: 'Transferencia' },
  deposito: { label: '💵 Depósito', short: 'Depósito' },
  efectivo: { label: '💰 Efectivo', short: 'Efectivo' },
  excento: { label: '🛡 Exento', short: 'Exento' },
};

// Status badge classes
export function statusClass(status) {
  switch (status) {
    case 'pagado': return 'status-pagado';
    case 'parcial': return 'status-parcial';
    default: return 'status-pendiente';
  }
}

export function statusLabel(status) {
  switch (status) {
    case 'pagado': return '✓ Pagado';
    case 'parcial': return '◐ Parcial';
    default: return '○ Pendiente';
  }
}

// Date formatting
export function fmtDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr + 'T12:00:00');
    return format(d, 'dd MMM yyyy', { locale: es });
  } catch {
    return dateStr;
  }
}

// Country/state lists (matching original getStatesForCountry)
export const COUNTRIES = ['México', 'Colombia', 'Estados Unidos', 'España', 'Argentina'];

export function getStatesForCountry(country) {
  const states = {
    'México': [
      'Aguascalientes',
      'Baja California',
      'Baja California Sur',
      'Campeche',
      'Chiapas',
      'Chihuahua',
      'Ciudad de México',
      'Coahuila',
      'Colima',
      'Durango',
      'Estado de México',
      'Guanajuato',
      'Guerrero',
      'Hidalgo',
      'Jalisco',
      'Michoacán',
      'Morelos',
      'Nayarit',
      'Nuevo León',
      'Oaxaca',
      'Puebla',
      'Querétaro',
      'Quintana Roo',
      'San Luis Potosí',
      'Sinaloa',
      'Sonora',
      'Tabasco',
      'Tamaulipas',
      'Tlaxcala',
      'Veracruz',
      'Yucatán',
      'Zacatecas',
    ],
    'Colombia': [
      'Amazonas', 'Antioquia', 'Arauca', 'Atlántico', 'Bolívar',
      'Boyacá', 'Caldas', 'Caquetá', 'Casanare', 'Cauca',
      'Cesar', 'Chocó', 'Córdoba', 'Cundinamarca', 'Guainía',
      'Guaviare', 'Huila', 'La Guajira', 'Magdalena', 'Meta',
      'Nariño', 'Norte de Santander', 'Putumayo', 'Quindío',
      'Risaralda', 'San Andrés y Providencia', 'Santander', 'Sucre',
      'Tolima', 'Valle del Cauca', 'Vaupés', 'Vichada',
      'Bogotá D.C.',
    ],
    'Estados Unidos': [
      'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California',
      'Colorado', 'Connecticut', 'Delaware', 'Florida', 'Georgia',
      'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa',
      'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland',
      'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi', 'Missouri',
      'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey',
      'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio',
      'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina',
      'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont',
      'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming',
    ],
    'España': [
      'Andalucía', 'Aragón', 'Asturias', 'Baleares', 'Canarias',
      'Cantabria', 'Castilla-La Mancha', 'Castilla y León', 'Cataluña',
      'Ceuta', 'Comunidad de Madrid', 'Comunidad Foral de Navarra',
      'Comunidad Valenciana', 'Extremadura', 'Galicia', 'La Rioja',
      'Melilla', 'País Vasco', 'Región de Murcia',
    ],
    'Argentina': [
      'Buenos Aires', 'Catamarca', 'Chaco', 'Chubut', 'Córdoba',
      'Corrientes', 'Entre Ríos', 'Formosa', 'Jujuy', 'La Pampa',
      'La Rioja', 'Mendoza', 'Misiones', 'Neuquén', 'Río Negro',
      'Salta', 'San Juan', 'San Luis', 'Santa Cruz', 'Santa Fe',
      'Santiago del Estero', 'Tierra del Fuego', 'Tucumán',
      'Ciudad Autónoma de Buenos Aires',
    ],
  };
  return states[country] || [];
}

// Homly logo — icon only (used in sidebar, login, etc.)
export const HOMLY_LOGO = (
  <svg viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg">
    <g transform="translate(5, 4)">
      <path
        d="M12,52 L12,32 L30,14 L48,32 L48,52 L12,52 Z"
        fill="none"
        stroke="#E85D43"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M30,18 C24,24 20,28 20,33 C20,38 24,42 30,38 C36,42 40,38 40,33 C40,28 36,24 30,18 Z"
        fill="none"
        stroke="#E85D43"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  </svg>
);

// Homly full logo — icon + logotype (used on landing page hero / large displays)
export const HOMLY_LOGO_FULL = (
  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
    <svg viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: 52, height: 52, flexShrink: 0 }}>
      <g transform="translate(5, 4)">
        <path
          d="M12,52 L12,32 L30,14 L48,32 L48,52 L12,52 Z"
          fill="none" stroke="#E85D43" strokeWidth="4"
          strokeLinecap="round" strokeLinejoin="round"
        />
        <path
          d="M30,18 C24,24 20,28 20,33 C20,38 24,42 30,38 C36,42 40,38 40,33 C40,28 36,24 30,18 Z"
          fill="none" stroke="#E85D43" strokeWidth="4"
          strokeLinecap="round" strokeLinejoin="round"
        />
      </g>
    </svg>
    <span style={{ fontSize: 36, fontWeight: 800, color: '#124A36', letterSpacing: '-0.5px', lineHeight: 1 }}>
      homly<span style={{ color: '#E85D43' }}>.</span>
    </span>
  </div>
);

export const APP_VERSION = '10.1.0';
