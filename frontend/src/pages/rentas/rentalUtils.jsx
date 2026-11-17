import React from 'react';

export function fmtMoney(n, currency = 'MXN') {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency', currency,
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(n ?? 0);
}

export function fmtDate(value) {
  if (!value) return '—';
  const [y, m, d] = String(value).slice(0, 10).split('-');
  if (!y || !m || !d) return value;
  return new Date(+y, +m - 1, +d).toLocaleDateString('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

export function todayPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export const PROPERTY_TYPES = {
  casa: 'Casa',
  departamento: 'Departamento',
  studio: 'Studio / loft',
  cuarto: 'Habitación / cuarto',
  airbnb: 'Airbnb / corta estancia',
  hotel: 'Hotel',
  local: 'Local comercial',
  oficina: 'Oficina',
  edificio_oficinas: 'Edificio de oficinas',
  centro_comercial: 'Centro / plaza comercial',
  consultorio: 'Consultorio',
  kiosco: 'Kiosco / isla',
  bodega: 'Bodega',
  nave: 'Nave industrial',
  parque_industrial: 'Parque industrial',
  patio: 'Patio / yard',
  terreno: 'Terreno',
  estacionamiento: 'Estacionamiento',
  salon: 'Salón / eventos',
  otro: 'Otro',
};

export const PROPERTY_GROUPS = [
  { id: 'residencial', label: 'Residencial', types: ['casa', 'departamento', 'studio', 'cuarto'] },
  { id: 'corta_estancia', label: 'Hospedaje', types: ['airbnb', 'hotel'] },
  { id: 'comercial', label: 'Comercial', types: ['local', 'oficina', 'consultorio', 'kiosco', 'centro_comercial', 'edificio_oficinas'] },
  { id: 'industrial', label: 'Industrial y logística', types: ['bodega', 'nave', 'patio', 'parque_industrial'] },
  { id: 'otros', label: 'Otros rentables', types: ['terreno', 'estacionamiento', 'salon', 'otro'] },
];

/** Tipos de propiedad que normalmente se subdividen en espacios con inquilinos distintos. */
export const MULTI_TENANT_TYPES = ['centro_comercial', 'edificio_oficinas', 'hotel', 'parque_industrial'];
/** Tipos que pueden operar como Multi Tenant si el usuario lo decide (p. ej. una nave con varios bays). */
export const MULTI_CAPABLE_TYPES = [...MULTI_TENANT_TYPES, 'nave', 'bodega', 'patio', 'oficina', 'local', 'estacionamiento', 'terreno', 'salon', 'otro'];

export const TENANCY_MODELS = {
  single: { label: 'Single Tenant', hint: 'Un solo inquilino rentando la propiedad completa.' },
  multi: { label: 'Multi Tenant', hint: 'La propiedad se divide en espacios (locales, bays, oficinas, habitaciones…), cada uno con su inquilino, M² y contactos.' },
};

export const SPACE_TYPES = {
  local: 'Local comercial', ancla: 'Tienda ancla', isla: 'Isla / kiosco', temporal: 'Espacio temporal / pop-up',
  food: 'Comida / restaurante', bodega_com: 'Bodega del centro', amenidad: 'Amenidad / área de servicio',
  publicidad: 'Espacio publicitario', oficina: 'Oficina / suite', piso: 'Piso completo',
  coworking: 'Coworking / puesto', sala: 'Sala de juntas / auditorio', bay: 'Bodega / bay industrial',
  nave: 'Nave', oficina_nave: 'Oficinas de nave', patio: 'Patio / yard', mezzanine: 'Mezzanine',
  habitacion: 'Habitación / suite', salon: 'Salón de eventos', restaurante: 'Restaurante / bar',
  estacionamiento: 'Estacionamiento / cajones', otro: 'Otro',
};

/** Tipos de espacio sugeridos según el tipo de propiedad (el primero es el predeterminado). */
export const SPACE_TYPES_BY_PROPERTY = {
  centro_comercial: ['local', 'ancla', 'isla', 'temporal', 'food', 'bodega_com', 'publicidad', 'amenidad', 'estacionamiento'],
  edificio_oficinas: ['oficina', 'piso', 'coworking', 'sala', 'bodega_com', 'estacionamiento', 'publicidad'],
  hotel: ['habitacion', 'salon', 'restaurante', 'local', 'sala', 'estacionamiento', 'amenidad'],
  parque_industrial: ['nave', 'bay', 'patio', 'oficina_nave', 'mezzanine', 'estacionamiento'],
  nave: ['bay', 'oficina_nave', 'mezzanine', 'patio'],
  bodega: ['bay', 'oficina_nave', 'mezzanine', 'patio'],
  patio: ['patio', 'estacionamiento', 'bay'],
  oficina: ['oficina', 'coworking', 'sala', 'estacionamiento'],
  local: ['local', 'isla', 'bodega_com'],
  estacionamiento: ['estacionamiento', 'otro'],
  terreno: ['patio', 'otro'],
  salon: ['salon', 'otro'],
  otro: ['otro', 'local', 'oficina', 'bay'],
};
export const spaceTypesFor = (propertyType) => SPACE_TYPES_BY_PROPERTY[propertyType] || Object.keys(SPACE_TYPES);

export const SPACE_STATUS = {
  disponible: { label: 'Disponible', color: 'var(--teal-700)', bg: 'var(--teal-50)' },
  ocupado: { label: 'Ocupado', color: 'var(--blue-700)', bg: 'var(--blue-50)' },
  reservado: { label: 'Reservado', color: '#92400e', bg: 'var(--amber-50)' },
  mantenimiento: { label: 'En mantenimiento', color: 'var(--ink-600)', bg: 'var(--sand-50)' },
  inactivo: { label: 'Inactivo', color: 'var(--ink-400)', bg: 'var(--sand-50)' },
};

const SPACE_COMMERCIAL = [
  { key: 'frontage_m', label: 'Frente (m)', type: 'number' },
  { key: 'depth_m', label: 'Fondo (m)', type: 'number' },
  { key: 'level', label: 'Nivel / planta', type: 'text' },
  { key: 'trade', label: 'Giro comercial', type: 'text' },
  { key: 'zoning', label: 'Uso de suelo', type: 'text' },
  { key: 'hours', label: 'Horario permitido', type: 'text' },
  { key: 'storage', label: 'Bodega anexa', type: 'bool' },
];
const SPACE_INDUSTRIAL = [
  { key: 'clear_height', label: 'Altura libre (m)', type: 'number' },
  { key: 'docks', label: 'Andenes', type: 'number' },
  { key: 'floor_load', label: 'Resistencia de piso', type: 'text' },
  { key: 'voltage', label: 'Voltaje / KVA', type: 'text' },
  { key: 'office_m2', label: 'Oficinas m²', type: 'number' },
  { key: 'sprinklers', label: 'Sprinklers', type: 'bool' },
  { key: 'trailer_access', label: 'Acceso tráiler', type: 'bool' },
];
const SPACE_OFFICE = [
  { key: 'workstations', label: 'Puestos de trabajo', type: 'number' },
  { key: 'meeting_rooms', label: 'Salas de junta', type: 'number' },
  { key: 'parking', label: 'Cajones asignados', type: 'number' },
  { key: 'ac', label: 'Aire acondicionado', type: 'bool' },
  { key: 'furnished', label: 'Amueblada', type: 'bool' },
];
export const SPACE_SPEC_FIELDS = {
  local: SPACE_COMMERCIAL, ancla: SPACE_COMMERCIAL, food: [...SPACE_COMMERCIAL, { key: 'grease_trap', label: 'Trampa de grasa', type: 'bool' }, { key: 'extraction', label: 'Extracción de humos', type: 'bool' }],
  restaurante: [{ key: 'capacity', label: 'Aforo', type: 'number' }, { key: 'kitchen', label: 'Cocina equipada', type: 'bool' }, { key: 'hours', label: 'Horario', type: 'text' }, { key: 'level', label: 'Nivel', type: 'text' }],
  isla: [{ key: 'frontage_m', label: 'Frente (m)', type: 'number' }, { key: 'location', label: 'Ubicación en pasillo', type: 'text' }, { key: 'trade', label: 'Giro', type: 'text' }, { key: 'power', label: 'Toma eléctrica', type: 'bool' }],
  temporal: [{ key: 'location', label: 'Ubicación', type: 'text' }, { key: 'trade', label: 'Giro / marca', type: 'text' }, { key: 'power', label: 'Toma eléctrica', type: 'bool' }, { key: 'daily_rate', label: 'Tarifa diaria', type: 'number' }],
  bodega_com: [{ key: 'level', label: 'Nivel', type: 'text' }, { key: 'height', label: 'Altura (m)', type: 'number' }, { key: 'access', label: 'Acceso', type: 'text' }],
  publicidad: [{ key: 'format', label: 'Formato / medida', type: 'text' }, { key: 'face', label: 'Cara / posición', type: 'text' }, { key: 'lit', label: 'Iluminado', type: 'bool' }],
  amenidad: [{ key: 'use', label: 'Uso', type: 'text' }],
  oficina: SPACE_OFFICE, coworking: SPACE_OFFICE.slice(0, 3),
  piso: [{ key: 'floor_plate_m2', label: 'Planta libre m²', type: 'number' }, { key: 'elevator', label: 'Elevador directo', type: 'bool' }, ...SPACE_OFFICE.slice(2)],
  sala: [{ key: 'capacity', label: 'Aforo', type: 'number' }, { key: 'av', label: 'Audio / video', type: 'bool' }],
  bay: SPACE_INDUSTRIAL, nave: SPACE_INDUSTRIAL, mezzanine: [{ key: 'height', label: 'Altura (m)', type: 'number' }, { key: 'floor_load', label: 'Resistencia de piso', type: 'text' }],
  oficina_nave: SPACE_OFFICE,
  patio: [{ key: 'paved', label: 'Pavimentado', type: 'bool' }, { key: 'trailer_access', label: 'Acceso tráiler', type: 'bool' }, { key: 'security_24', label: 'Cercado / seguridad', type: 'bool' }],
  habitacion: [{ key: 'beds', label: 'Camas', type: 'number' }, { key: 'guests', label: 'Huéspedes', type: 'number' }, { key: 'view', label: 'Vista', type: 'text' }, { key: 'accessible', label: 'Accesible', type: 'bool' }, { key: 'kitchenette', label: 'Cocineta', type: 'bool' }],
  salon: [{ key: 'capacity', label: 'Aforo', type: 'number' }, { key: 'kitchen', label: 'Cocina / office', type: 'bool' }, { key: 'sound', label: 'Audio / video', type: 'bool' }],
  estacionamiento: [{ key: 'slots', label: 'Cajones', type: 'number' }, { key: 'covered', label: 'Techado', type: 'bool' }, { key: 'ev', label: 'Cargador eléctrico', type: 'bool' }],
  otro: [{ key: 'use', label: 'Uso previsto', type: 'text' }, { key: 'features', label: 'Características', type: 'text' }],
};

export const ROOM_TYPES = ['casa', 'departamento', 'studio', 'cuarto', 'airbnb'];

export const PROPERTY_SPEC_FIELDS = {
  casa: [
    { key: 'levels', label: 'Niveles', type: 'number' },
    { key: 'half_baths', label: 'Medios baños', type: 'number' },
    { key: 'parking', label: 'Cajones', type: 'number' },
    { key: 'garden_m2', label: 'Jardín m²', type: 'number' },
    { key: 'year_built', label: 'Año de construcción', type: 'number' },
    { key: 'furnished', label: 'Amueblada', type: 'bool' },
    { key: 'pool', label: 'Alberca', type: 'bool' },
    { key: 'pets', label: 'Acepta mascotas', type: 'bool' },
  ],
  departamento: [
    { key: 'floor', label: 'Piso', type: 'number' },
    { key: 'elevator', label: 'Elevador', type: 'bool' },
    { key: 'parking', label: 'Cajones', type: 'number' },
    { key: 'hoa_fee', label: 'Cuota mantenimiento', type: 'number' },
    { key: 'terrace', label: 'Terraza', type: 'bool' },
    { key: 'furnished', label: 'Amueblado', type: 'bool' },
    { key: 'pets', label: 'Acepta mascotas', type: 'bool' },
    { key: 'amenities', label: 'Amenidades', type: 'text' },
  ],
  studio: [
    { key: 'loft', label: 'Doble altura / loft', type: 'bool' },
    { key: 'furnished', label: 'Amueblado', type: 'bool' },
    { key: 'parking', label: 'Cajón', type: 'number' },
    { key: 'pets', label: 'Acepta mascotas', type: 'bool' },
  ],
  cuarto: [
    { key: 'private_bath', label: 'Baño privado', type: 'bool' },
    { key: 'furnished', label: 'Amueblado', type: 'bool' },
    { key: 'utilities_included', label: 'Servicios incluidos', type: 'bool' },
    { key: 'shared_areas', label: 'Áreas compartidas', type: 'text' },
  ],
  airbnb: [
    { key: 'guests', label: 'Huéspedes máx.', type: 'number' },
    { key: 'beds', label: 'Camas', type: 'number' },
    { key: 'min_nights', label: 'Noches mínimas', type: 'number' },
    { key: 'checkin', label: 'Check-in', type: 'text' },
    { key: 'checkout', label: 'Check-out', type: 'text' },
    { key: 'cleaning_fee', label: 'Tarifa de limpieza', type: 'number' },
    { key: 'wifi', label: 'Wi-Fi', type: 'bool' },
    { key: 'kitchen', label: 'Cocina', type: 'bool' },
    { key: 'pool', label: 'Alberca', type: 'bool' },
    { key: 'cancellation', label: 'Política de cancelación', type: 'text' },
  ],
  local: [
    { key: 'frontage_m', label: 'Frente (m)', type: 'number' },
    { key: 'depth_m', label: 'Fondo (m)', type: 'number' },
    { key: 'zoning', label: 'Uso de suelo', type: 'text' },
    { key: 'level', label: 'Planta', type: 'text' },
    { key: 'metal_shutter', label: 'Cortina metálica', type: 'bool' },
    { key: 'storage', label: 'Bodega anexa', type: 'bool' },
    { key: 'capacity', label: 'Aforo', type: 'number' },
    { key: 'hours', label: 'Horario permitido', type: 'text' },
  ],
  oficina: [
    { key: 'workstations', label: 'Puestos de trabajo', type: 'number' },
    { key: 'meeting_rooms', label: 'Salas de junta', type: 'number' },
    { key: 'floor', label: 'Piso', type: 'number' },
    { key: 'elevator', label: 'Elevador', type: 'bool' },
    { key: 'ac', label: 'Aire acondicionado', type: 'bool' },
    { key: 'reception', label: 'Recepción', type: 'bool' },
    { key: 'parking', label: 'Cajones', type: 'number' },
    { key: 'furnished', label: 'Amueblada', type: 'bool' },
  ],
  consultorio: [
    { key: 'specialty', label: 'Especialidad', type: 'text' },
    { key: 'rooms', label: 'Consultorios', type: 'number' },
    { key: 'waiting', label: 'Sala de espera', type: 'bool' },
    { key: 'patient_bath', label: 'Sanitario pacientes', type: 'bool' },
    { key: 'parking', label: 'Cajones', type: 'number' },
  ],
  kiosco: [
    { key: 'frontage_m', label: 'Frente (m)', type: 'number' },
    { key: 'mall', label: 'Plaza / centro', type: 'text' },
    { key: 'hours', label: 'Horario de plaza', type: 'text' },
    { key: 'storage', label: 'Bodega de apoyo', type: 'bool' },
  ],
  centro_comercial: [
    { key: 'anchor_stores', label: 'Tiendas ancla', type: 'number' },
    { key: 'levels', label: 'Niveles', type: 'number' },
    { key: 'parking_slots', label: 'Cajones de estacionamiento', type: 'number' },
    { key: 'footfall', label: 'Afluencia mensual', type: 'number' },
    { key: 'year_built', label: 'Año de apertura', type: 'number' },
    { key: 'mall_format', label: 'Formato (abierto / cerrado / strip)', type: 'text' },
    { key: 'cinema', label: 'Cine', type: 'bool' },
    { key: 'food_court', label: 'Plaza de comida', type: 'bool' },
  ],
  edificio_oficinas: [
    { key: 'floors', label: 'Pisos', type: 'number' },
    { key: 'class', label: 'Clase (A / B / C)', type: 'text' },
    { key: 'typical_floor_m2', label: 'Planta tipo m²', type: 'number' },
    { key: 'parking_slots', label: 'Cajones', type: 'number' },
    { key: 'elevators', label: 'Elevadores', type: 'number' },
    { key: 'leed', label: 'Certificación LEED / similar', type: 'bool' },
    { key: 'security_24', label: 'Seguridad 24 h', type: 'bool' },
    { key: 'year_built', label: 'Año de construcción', type: 'number' },
  ],
  hotel: [
    { key: 'stars', label: 'Estrellas', type: 'number' },
    { key: 'rooms_count', label: 'Habitaciones', type: 'number' },
    { key: 'floors', label: 'Pisos', type: 'number' },
    { key: 'brand', label: 'Marca / operador', type: 'text' },
    { key: 'restaurants', label: 'Restaurantes', type: 'number' },
    { key: 'event_halls', label: 'Salones de eventos', type: 'number' },
    { key: 'pool', label: 'Alberca', type: 'bool' },
    { key: 'spa', label: 'Spa / gimnasio', type: 'bool' },
  ],
  parque_industrial: [
    { key: 'buildings_count', label: 'Número de naves', type: 'number' },
    { key: 'clear_height', label: 'Altura libre (m)', type: 'number' },
    { key: 'docks', label: 'Andenes totales', type: 'number' },
    { key: 'land_m2', label: 'Terreno total m²', type: 'number' },
    { key: 'rail', label: 'Espuela de ferrocarril', type: 'bool' },
    { key: 'security_24', label: 'Seguridad 24 h', type: 'bool' },
    { key: 'customs', label: 'Recinto fiscal / aduana', type: 'bool' },
    { key: 'voltage', label: 'Subestación / KVA', type: 'text' },
  ],
  bodega: [
    { key: 'clear_height', label: 'Altura libre (m)', type: 'number' },
    { key: 'docks', label: 'Andenes', type: 'number' },
    { key: 'floor_load', label: 'Carga de piso', type: 'text' },
    { key: 'trailer_access', label: 'Acceso tráiler', type: 'bool' },
    { key: 'security_24', label: 'Seguridad 24 h', type: 'bool' },
    { key: 'climate', label: 'Temperatura controlada', type: 'bool' },
    { key: 'office', label: 'Oficina anexa', type: 'bool' },
  ],
  nave: [
    { key: 'clear_height', label: 'Altura (m)', type: 'number' },
    { key: 'span', label: 'Claros (m)', type: 'text' },
    { key: 'floor_load', label: 'Resistencia de piso', type: 'text' },
    { key: 'cranes', label: 'Grúas', type: 'number' },
    { key: 'docks', label: 'Andenes', type: 'number' },
    { key: 'voltage', label: 'Voltaje / KVA', type: 'text' },
    { key: 'office_m2', label: 'Oficinas m²', type: 'number' },
    { key: 'yard_m2', label: 'Patio de maniobras m²', type: 'number' },
    { key: 'sprinklers', label: 'Sprinklers', type: 'bool' },
  ],
  patio: [
    { key: 'paved', label: 'Pavimentado', type: 'bool' },
    { key: 'trailer_access', label: 'Acceso tráiler', type: 'bool' },
    { key: 'security_24', label: 'Cercado / seguridad', type: 'bool' },
    { key: 'power', label: 'Energía disponible', type: 'bool' },
  ],
  terreno: [
    { key: 'frontage_m', label: 'Frente (m)', type: 'number' },
    { key: 'depth_m', label: 'Fondo (m)', type: 'number' },
    { key: 'zoning', label: 'Uso de suelo', type: 'text' },
    { key: 'topography', label: 'Topografía', type: 'text' },
    { key: 'water', label: 'Agua', type: 'bool' },
    { key: 'power', label: 'Luz', type: 'bool' },
    { key: 'sewer', label: 'Drenaje', type: 'bool' },
  ],
  estacionamiento: [
    { key: 'parking_kind', label: 'Tipo (techado / descubierto)', type: 'text' },
    { key: 'size', label: 'Medidas', type: 'text' },
    { key: 'access_24', label: 'Acceso 24 h', type: 'bool' },
    { key: 'ev', label: 'Cargador eléctrico', type: 'bool' },
  ],
  salon: [
    { key: 'capacity', label: 'Aforo', type: 'number' },
    { key: 'kitchen', label: 'Cocina / office', type: 'bool' },
    { key: 'sound', label: 'Audio / video', type: 'bool' },
    { key: 'parking', label: 'Cajones', type: 'number' },
    { key: 'hours', label: 'Horario', type: 'text' },
  ],
  otro: [
    { key: 'use', label: 'Uso previsto', type: 'text' },
    { key: 'features', label: 'Características', type: 'text' },
  ],
};

export const PROPERTY_STATUS = {
  disponible: { label: 'Disponible', color: 'var(--teal-700)', bg: 'var(--teal-50)' },
  ocupada: { label: 'Ocupada', color: 'var(--blue-700)', bg: 'var(--blue-50)' },
  reservada: { label: 'Reservada', color: '#92400e', bg: 'var(--amber-50)' },
  mantenimiento: { label: 'Mantenimiento', color: 'var(--ink-600)', bg: 'var(--sand-50)' },
  operativa: { label: 'En operación', color: 'var(--purple-700, #6d28d9)', bg: 'var(--purple-50, #ede9fe)' },
  inactiva: { label: 'Inactiva', color: 'var(--ink-400)', bg: 'var(--sand-50)' },
};

export const PROPERTY_USAGE = {
  renta: { label: 'En renta', hint: 'Puede tener contratos de renta, cobranza y aparecer en el Rent Roll.' },
  operacion: { label: 'Solo operación', hint: 'Se administra y mantiene (órdenes, activos, inspecciones, CAPEX/OPEX) sin contrato de renta.' },
};

export const RENT_SCHEMES = {
  fija: { label: 'Renta fija', hint: 'Monto mensual pactado, con incremento anual opcional.' },
  variable: { label: 'Renta variable', hint: 'El monto cambia según ventas, INPC, tramos, ocupación, m² o temporada.' },
};

export const RENT_BASES = {
  ventas: { label: '% de ventas', hint: 'Mínimo garantizado más porcentaje sobre ventas (locales y plazas).' },
  inpc: { label: 'Indexada (INPC)', hint: 'Se ajusta con el índice y un tope o piso pactados.' },
  escalonada: { label: 'Escalonada', hint: 'Montos distintos por periodo (tramos).' },
  ocupacion: { label: 'Por ocupación', hint: 'Airbnb o corta estancia: tarifa por noche × ocupación.' },
  m2: { label: 'Por m²', hint: 'Tarifa por metro cuadrado, con factor de áreas comunes.' },
  temporada: { label: 'Por temporada', hint: 'Montos distintos según los meses del año.' },
  otro: { label: 'Otra condición', hint: 'Describe la fórmula en notas y deja una renta base.' },
};

export function emptyRentConditions() {
  return {
    basis: 'ventas',
    base_rent: 0,
    percent: 0,
    breakpoint: 0,
    reported_sales: 0,
    index_name: 'INPC',
    review_months: 12,
    index_base: 100,
    index_current: 100,
    cap_pct: 0,
    floor_pct: 0,
    steps: [],
    nightly_rate: 0,
    occupancy_pct: 0,
    nights: 30,
    platform_fee_pct: 0,
    rate_m2: 0,
    area_m2: 0,
    common_area_factor: 1,
    seasons: [],
    notes: '',
  };
}

export const CONTRACT_KINDS = {
  renta: { label: 'Renta de propiedad', hint: 'Inmueble + inquilino. Genera cargos de cobranza.' },
  proveedor: { label: 'Proveedor de servicios', hint: 'Contrato con un proveedor del catálogo o expediente.' },
  servicios_generales: { label: 'Servicios generales', hint: 'Limpieza, vigilancia u otros servicios del portafolio.' },
  mantenimiento: { label: 'Mantenimiento de inmueble', hint: 'Se liga a una propiedad, categoría u orden de trabajo.' },
  comodato: { label: 'Comodato', hint: 'Préstamo de uso de un inmueble sin renta.' },
  promesa: { label: 'Promesa de arrendamiento', hint: 'Reserva el inmueble antes del contrato definitivo.' },
  otro: { label: 'Otro', hint: 'Cualquier otro convenio del espacio.' },
};

export const LEGAL_STAGES = {
  none: { label: 'Sin asistente', color: 'var(--ink-400)', bg: 'var(--sand-50)' },
  entrevista: { label: 'Entrevista', color: 'var(--ink-500)', bg: 'var(--sand-50)' },
  redaccion: { label: 'Redacción', color: 'var(--blue-700)', bg: 'var(--blue-50)' },
  firmas: { label: 'En firmas', color: '#92400e', bg: 'var(--amber-50)' },
  publicado: { label: 'Publicado', color: 'var(--teal-700)', bg: 'var(--teal-50)' },
};

export const CONTRACT_STATUS = {
  borrador: { label: 'Borrador', color: 'var(--ink-500)', bg: 'var(--sand-50)' },
  activo: { label: 'Activo', color: 'var(--teal-700)', bg: 'var(--teal-50)' },
  por_vencer: { label: 'Por vencer', color: '#92400e', bg: 'var(--amber-50)' },
  vencido: { label: 'Vencido', color: 'var(--coral-600)', bg: 'var(--coral-50)' },
  renovado: { label: 'Renovado', color: 'var(--blue-700)', bg: 'var(--blue-50)' },
  finalizado: { label: 'Finalizado', color: 'var(--ink-500)', bg: 'var(--sand-50)' },
  cancelado: { label: 'Cancelado', color: 'var(--ink-400)', bg: 'var(--sand-50)' },
  airbnb: { label: 'Airbnb', color: '#E61E4D', bg: '#FFF0F3' },
};

export const CHARGE_STATUS = {
  pendiente: { label: 'Pendiente', color: '#92400e', bg: 'var(--amber-50)' },
  parcial: { label: 'Parcial', color: 'var(--blue-700)', bg: 'var(--blue-50)' },
  pagado: { label: 'Pagado', color: 'var(--teal-700)', bg: 'var(--teal-50)' },
  cancelado: { label: 'Cancelado', color: 'var(--ink-400)', bg: 'var(--sand-50)' },
};

export const LEAD_STAGES = [
  { key: 'nuevo', label: 'Nuevo', color: 'var(--ink-500)', bg: 'var(--sand-50)' },
  { key: 'contactado', label: 'Contactado', color: 'var(--blue-700)', bg: 'var(--blue-50)' },
  { key: 'visita', label: 'Visita', color: '#6d28d9', bg: '#f5f3ff' },
  { key: 'propuesta', label: 'Propuesta', color: '#92400e', bg: 'var(--amber-50)' },
  { key: 'negociacion', label: 'Negociación', color: '#9a3412', bg: '#fff7ed' },
  { key: 'ganado', label: 'Ganado', color: 'var(--teal-700)', bg: 'var(--teal-50)' },
  { key: 'perdido', label: 'Perdido', color: 'var(--coral-600)', bg: 'var(--coral-50)' },
];

export const LEAD_STAGE_MAP = Object.fromEntries(LEAD_STAGES.map(s => [s.key, { label: s.label, color: s.color, bg: s.bg }]));

export const LEAD_SOURCES = {
  web: 'Sitio web',
  whatsapp: 'WhatsApp',
  telefono: 'Teléfono',
  visita: 'Visita',
  airbnb: 'Airbnb',
  referido: 'Referido',
  otro: 'Otro',
};

export function StatusPill({ map, value }) {
  const s = map[value] || { label: value || '—', color: 'var(--ink-500)', bg: 'var(--sand-50)' };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      fontSize: 10, fontWeight: 700, color: s.color, background: s.bg,
      borderRadius: 20, padding: '2px 8px', textTransform: 'uppercase', letterSpacing: '0.04em',
    }}>
      {s.label}
    </span>
  );
}
