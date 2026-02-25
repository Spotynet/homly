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

// Role labels and colors (matches roles object from original)
export const ROLES = {
  superadmin: { label: 'Super Administrador', color: '#6D28D9', bg: '#F5F3FF' },
  admin: { label: 'Administrador', color: '#1F7D5B', bg: '#EDFDF7' },
  tesorero: { label: 'Tesorero', color: '#D97706', bg: '#FFFBEB' },
  contador: { label: 'Contador', color: '#2563EB', bg: '#EFF6FF' },
  auditor: { label: 'Auditor', color: '#64748B', bg: '#F1F5F9' },
  vecino: { label: 'Vecino / Residente', color: '#E85D43', bg: '#FFF5F3' },
};

// Payment type labels
export const PAYMENT_TYPES = {
  transferencia: { label: '🏦 Transferencia', short: 'Transferencia' },
  deposito: { label: '💵 Depósito', short: 'Depósito' },
  efectivo: { label: '💰 Efectivo', short: 'Efectivo' },
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

// Homly logo SVG
export const HOMLY_LOGO = (
  <svg viewBox="0 0 56 58" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M14 31 V46 Q14 52 20 52 L23 52 Q23 44.5 28 44.5 Q33 44.5 33 52 L36 52 Q42 52 42 46 V31"
      stroke="#E85D43" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M10 34 L27 15" stroke="#E85D43" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M46 34 L38 25" stroke="#E85D43" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M27 15 C29 11 32.5 9.5 35 12 C37.5 9.5 41 11 41 14.5 C41 18.5 35 23 35 23 C35 23 32 20 30 17"
      stroke="#E85D43" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

export const APP_VERSION = '10.1.0';
