/**
 * rentalGuides.jsx
 * ─────────────────────────────────────────────────────────────────
 * Contenido de "Guías de uso" de Administrar Propiedades.
 *
 * Cada guía:
 *   id, group, module (clave de permiso; null = siempre visible), title, summary,
 *   icon, color, bg, minutes, level, learn[], steps[], quiz[], faq[], video?
 *
 * Cada paso:
 *   title, body, tips[], route? (+ search?), cta? (texto del botón "Hazlo ahora"),
 *   scene (ilustración animada, ver guideDemo.jsx)
 *
 * Escenas (scene.type): kpis | table | form | tabs | cards | kanban | chart | checklist | flow
 *   Comunes: title, action (botón primario simulado), hl (índice resaltado), caption (globo).
 *
 * Para añadir un video real a una guía: video: { url: 'https://www.youtube.com/watch?v=…', title: '…' }
 */
import {
  Rocket, Home, Bell, Building2, LifeBuoy, Wrench, Users, CalendarClock, Cpu, ScanSearch,
  Gauge, Target, FileText, Calendar, Receipt, ClipboardList, Settings, Globe, PiggyBank, FileBarChart,
} from 'lucide-react';

export const GUIDE_GROUPS = [
  { id: 'inicio', label: 'Primeros pasos', hint: 'Empieza por aquí' },
  { id: 'general', label: 'General', hint: 'Tu centro de control' },
  { id: 'operacion', label: 'Operación', hint: 'Solicitudes, mantenimiento y activos' },
  { id: 'comercial', label: 'Comercial', hint: 'Prospectos y contratos' },
  { id: 'finanzas', label: 'Finanzas', hint: 'Cobranza, rent roll y CAPEX / OPEX' },
  { id: 'ajustes', label: 'Ajustes', hint: 'Configuración y portal' },
];

const TEAL = { color: '#0f766e', bg: '#ccfbf1' };
const BLUE = { color: '#1d4ed8', bg: '#dbeafe' };
const AMBER = { color: '#b45309', bg: '#fef3c7' };
const PURPLE = { color: '#6d28d9', bg: '#ede9fe' };
const CORAL = { color: '#c2410c', bg: '#ffedd5' };
const SLATE = { color: '#475569', bg: '#e2e8f0' };

export const RENTAL_GUIDES = [
  // ═════════════════════════════ PRIMEROS PASOS ═════════════════════════════
  {
    id: 'empezar', group: 'inicio', module: null, icon: Rocket, ...TEAL, minutes: 6, level: 'Básico',
    title: 'Empieza aquí: configura tu espacio',
    summary: 'La ruta más corta para dejar tu portafolio operando: propiedades, proveedores, contratos, cobranza y portal.',
    learn: ['Qué hace cada grupo del menú', 'El orden recomendado para capturar tu información', 'Cómo dejar todo listo en menos de una hora'],
    steps: [
      {
        title: 'Conoce el menú', route: '/app/rentas/dashboard', cta: 'Abrir dashboard',
        body: 'El menú lateral se divide en General (dashboard y avisos), Operación (propiedades, solicitudes, órdenes, preventivo, activos, inspecciones e indicadores), Comercial (CRM y contratos), Finanzas (cobranza y rent roll) y Ajustes. Solo ves los módulos que tu rol y tu plan permiten.',
        tips: ['El dashboard resume todo y te lleva directo a lo urgente.', 'Los módulos se alimentan entre sí: una solicitud puede terminar en una orden, y una orden en un costo del indicador.'],
        scene: { type: 'cards', title: 'Menú de Administrar Propiedades', hl: 1, caption: 'Cada grupo agrupa tareas parecidas', items: [{ title: 'General', sub: 'Dashboard · Notificaciones' }, { title: 'Operación', sub: 'Propiedades · Solicitudes · Órdenes' }, { title: 'Comercial', sub: 'CRM · Contratos' }, { title: 'Finanzas', sub: 'Cobranza · Rent Roll · CAPEX y OPEX' }] },
      },
      {
        title: 'Registra tus propiedades', route: '/app/rentas/propiedades', cta: 'Ir a propiedades',
        body: 'En Operación → Propiedades pulsa "Nueva propiedad", elige el tipo (casa, local, bodega, Airbnb…) y completa su ficha. Cada tipo pide sus propias especificaciones. Si tienes anuncios de Airbnb, puedes importarlos.',
        tips: ['El código de la propiedad (ej. A-101) aparece en cobranza, contratos y órdenes.', 'Empieza con 2 o 3 propiedades para practicar y luego sigue con el resto.'],
        scene: { type: 'table', title: 'Inventario', action: 'Nueva propiedad', hlAction: true, caption: 'Empieza aquí', cols: ['Código', 'Propiedad', 'Tipo', 'Estado'], rows: [['A-101', 'Depto Reforma', 'Departamento', 'Disponible'], ['L-02', 'Local Centro', 'Local', 'Rentada'], ['B-07', 'Bodega Norte', 'Bodega', 'Disponible']] },
      },
      {
        title: 'Da de alta proveedores y categorías', route: '/app/rentas/mantenimiento', cta: 'Abrir órdenes de trabajo',
        body: 'En Órdenes de trabajo → pestañas Proveedores y Catálogos registra a tus contratistas y las categorías de servicio (plomería, eléctrico, clima…). Así podrás asignar quién hace cada trabajo y medir su desempeño.',
        tips: ['Puedes completar el expediente digital del proveedor después.'],
        scene: { type: 'tabs', title: 'Órdenes de trabajo', tabs: ['Todas', 'Preventivos', 'Correctivos', 'Proveedores', 'Catálogos'], active: 3, hl: 3, caption: 'Proveedores y catálogos', lines: ['Fontanería Pérez · Plomería', 'Electro Sur · Eléctrico', 'ClimaPro · Aire acondicionado'] },
      },
      {
        title: 'Crea tu primer contrato', route: '/app/rentas/contratos', cta: 'Ir a contratos',
        body: 'En Comercial → Contratos pulsa "Nuevo contrato", elige el tipo y completa inmueble, inquilino, vigencia y renta. Al guardarlo, el asistente legal te ofrece redactarlo y mandarlo a firma. Actívalo cuando esté listo.',
        tips: ['Un contrato en borrador no genera cobranza; al activarlo sí.'],
        scene: { type: 'flow', title: 'Ciclo del contrato', hl: 2, caption: 'Al activar se genera cobranza', nodes: ['Borrador', 'Asistente legal', 'Activo', 'Cobranza'] },
      },
      {
        title: 'Genera la cobranza del mes', route: '/app/rentas/cobranza', cta: 'Abrir cobranza',
        body: 'En Finanzas → Cobranza usa "Generar mes" para crear los cargos de renta de los contratos activos. Registra cada pago con "Registrar pago" y la mora se calcula sola.',
        tips: ['Si tienes rentas variables, usa "Recalcular variables" cuando captures las ventas del mes.'],
        scene: { type: 'table', title: 'Cobranza', action: 'Generar mes', hlAction: true, caption: 'Un clic crea los cargos', cols: ['Contrato', 'Inquilino', 'Monto', 'Estado'], rows: [['CT-0001', 'Ana López', '$12,500', 'Pendiente'], ['CT-0002', 'Café Aurora', '$28,000', 'Pagado']] },
      },
      {
        title: 'Activa el portal de solicitudes', route: '/app/rentas/config', cta: 'Abrir configuración',
        body: 'En Ajustes → Configuración → Operación y SLA activa el portal, copia el enlace y compártelo con tus inquilinos. Ahí mismo defines tus tiempos de respuesta (SLA).',
        tips: ['El portal viene apagado hasta que tú lo actives.'],
        scene: { type: 'form', title: 'Operación y SLA', hl: 0, caption: 'Actívalo y copia el enlace', fields: [{ label: 'Portal habilitado', value: 'Sí' }, { label: 'Enlace', value: 'homly.com.mx/solicitud/…' }, { label: 'SLA urgente', value: '1 h / 8 h' }], action: 'Guardar configuración' },
      },
    ],
    quiz: [
      { q: '¿Qué debes hacer para que un contrato genere cobranza?', options: ['Dejarlo en borrador', 'Activarlo', 'Imprimirlo'], answer: 1, why: 'Solo los contratos activos generan cargos al usar "Generar mes".' },
      { q: '¿Dónde defines los tiempos de respuesta a tus inquilinos?', options: ['Configuración → Operación y SLA', 'Dashboard', 'Rent Roll'], answer: 0, why: 'Ahí editas las horas de respuesta y resolución por prioridad.' },
    ],
    faq: [
      { q: '¿Tengo que seguir este orden?', a: 'No es obligatorio, pero propiedades primero y contratos después te ahorra trabajo, porque el contrato necesita un inmueble.' },
      { q: '¿Puedo ver una guía sin tener el módulo?', a: 'Solo aparecen las guías de los módulos incluidos en tu plan y rol.' },
    ],
  },

  // ═════════════════════════════ GENERAL ═════════════════════════════
  {
    id: 'dashboard', group: 'general', module: 'rentas_dashboard', icon: Home, ...BLUE, minutes: 4, level: 'Básico',
    title: 'Dashboard del portafolio',
    summary: 'Lee de un vistazo ocupación, cobranza, contratos y operación, personaliza tu panel y salta directo a lo urgente.',
    learn: ['Qué significan los indicadores de arriba', 'Cómo personalizar el Panel global con widgets', 'Cómo usar el Panel de FM y su tablero', 'Cómo ocultar el menú lateral'],
    steps: [
      {
        title: 'Los cuatro indicadores clave', route: '/app/rentas/dashboard', cta: 'Ver mi dashboard',
        body: 'Arriba ves ocupación, renta mensual en operación, cobranza del mes y cartera vencida. Son la salud rápida de tu portafolio: si uno cambia de color, necesita atención.',
        scene: { type: 'kpis', title: 'Dashboard', hl: 2, caption: 'Cobranza del mes', items: [{ label: 'Ocupación', value: '86%' }, { label: 'Renta mensual', value: '$412k' }, { label: 'Cobranza', value: '74%', tone: 'warn' }, { label: 'Cartera vencida', value: '$38k', tone: 'bad' }] },
      },
      {
        title: 'Requiere tu atención', route: '/app/rentas/dashboard',
        body: 'Este widget junta lo urgente: cobranza vencida, contratos por vencer, órdenes fuera de SLA, solicitudes nuevas, planes preventivos atrasados y más. Cada alerta tiene un botón que te lleva al módulo exacto.',
        tips: ['Las alertas rojas son prioridad; las ámbar, preventivas.'],
        scene: { type: 'checklist', title: 'Requiere tu atención', hl: 0, caption: 'Un clic y vas al módulo', items: [{ label: '3 solicitudes nuevas · Ver solicitudes' }, { label: '2 contratos vencen en 30 días · Ver vigencias' }, { label: 'Cobranza vencida $38k · Atender' }] },
      },
      {
        title: 'Mapa de propiedades', route: '/app/rentas/dashboard',
        body: 'En el Panel global, la tarjeta "Mapa de propiedades" ubica cada propiedad con un pin de color: por estado (verde sin pendientes, ámbar por vigilar, rojo requiere atención), por ocupación o por tipo. Filtra por alertas, vacantes, órdenes, solicitudes, adeudos o equipos fuera de operación, busca por nombre o ciudad y cambia entre mapa y satélite. Al hacer clic en un pin ves sus indicadores y botones que abren órdenes, solicitudes, activos, inspecciones, preventivo, OPEX/CAPEX o contratos ya filtrados por esa propiedad, además de "Cómo llegar".',
        tips: ['Las propiedades sin ubicación aparecen en la lista; con "Ubicar automáticamente" se busca su dirección y se guarda.', 'Para afinar un pin usa "Mover pin" y arrástralo; también puedes marcar el punto con un clic en el mapa.', 'En la ficha de cada propiedad hay un mapa para fijar su ubicación al darla de alta.'],
        scene: { type: 'cards', title: 'Mapa de propiedades', hl: 0, caption: 'Clic en un pin para ver sus indicadores', items: [{ title: 'Casa Centro', sub: '3 órdenes · 1 adeudo' }, { title: 'Bodega Norte', sub: '2 de 4 ocupadas' }, { title: 'Plaza Sur', sub: '2 contratos por vencer' }, { title: 'Sin ubicar', sub: 'Ubicar automáticamente' }] },
      },
      {
        title: 'Personaliza tu Panel global', route: '/app/rentas/dashboard',
        body: 'El Panel global es un tablero de widgets: calendario de operación, cobranza, órdenes nuevas, estado de órdenes, órdenes por m² de cada propiedad, seguimiento de presupuesto, proveedores y SLA, satisfacción y más. Pulsa "Personalizar" para arrastrar las tarjetas, cambiar su tamaño u ocultarlas; "Restablecer" vuelve al diseño original.',
        tips: ['Tu diseño se guarda en este navegador, por espacio de trabajo.', 'Sin ratón, usa las flechas de cada tarjeta para moverla.'],
        scene: { type: 'cards', title: 'Panel global · Personalizar', hl: 1, caption: 'Arrastra, redimensiona u oculta', items: [{ title: 'Calendario', sub: 'Eventos del mes' }, { title: 'Presupuesto', sub: 'OPEX / CAPEX / NOI' }, { title: 'SLA', sub: 'Proveedores en riesgo' }, { title: 'Órdenes por m²', sub: 'Promedio de referencia' }] },
      },
      {
        title: 'Panel de FM y otras pestañas', route: '/app/rentas/dashboard',
        body: 'Panel de FM (antes Mantenimiento) trae un tablero con las órdenes Planeadas, En curso y Realizadas: arrastra una tarjeta a otra columna para cambiar su estado. También verás la agenda de 7 días y la carga de trabajo por responsable. Portafolio, Cobranza, Contratos y Comercial detallan cada área. Cambia el mes arriba a la derecha y todo se recalcula.',
        scene: { type: 'kanban', title: 'Panel de FM', hl: 1, caption: 'Arrastra para cambiar de estado', columns: [{ label: 'Planeadas', cards: ['Fuga baño', 'Pintura'] }, { label: 'En curso', cards: ['Clima A-3'] }, { label: 'Realizadas', cards: ['Cerradura'] }] },
      },
      {
        title: 'Más espacio: oculta el menú', route: '/app/rentas/dashboard',
        body: 'Con el botón del encabezado (o Ctrl/Cmd + B) ocultas el menú izquierdo para ver más pantalla en cualquier módulo. Vuelve a pulsarlo para mostrarlo; Homly recuerda tu preferencia.',
        scene: { type: 'flow', title: 'Pantalla completa', hl: 1, caption: 'Ctrl/Cmd + B', nodes: ['Menú visible', 'Ocultar menú', 'Más espacio'] },
      },
      {
        title: 'Accesos por módulo', route: '/app/rentas/dashboard',
        body: 'Al final del Resumen hay tarjetas de acceso rápido con el dato más importante de cada módulo: unidades, rent roll, contratos, cobranza, órdenes, solicitudes y activos.',
        scene: { type: 'cards', title: 'Accesos por módulo', hl: 3, caption: 'Entra con un clic', items: [{ title: 'Propiedades', sub: '24 unidades' }, { title: 'Contratos', sub: '19 vigentes' }, { title: 'Solicitudes', sub: '4 abiertas' }, { title: 'Activos', sub: '36 equipos' }] },
      },
    ],
    quiz: [
      { q: '¿Cómo ves otro mes en el dashboard?', options: ['No se puede', 'Con el selector de mes arriba a la derecha', 'Borrando datos'], answer: 1, why: 'Al cambiar el mes se recalculan cobranza, gasto y KPIs.' },
    ],
    faq: [{ q: '¿Por qué no veo alguna pestaña o tarjeta?', a: 'Se muestran según los módulos que tiene tu rol y plan.' }],
  },
  {
    id: 'reportes', group: 'general', module: 'rentas_reportes', icon: FileBarChart, ...PURPLE, minutes: 5, level: 'Intermedio',
    title: 'Reportes e informes',
    summary: 'Genera informes a pedido, el informe anual de preventivo tipo Gantt y el cumplimiento de SLA de tus proveedores; expórtalos a Excel o PDF.',
    learn: ['Armar un informe rápido con filtros y columnas', 'Exportar a Excel, CSV o PDF', 'Leer el informe anual por semana', 'Evaluar proveedores por SLA'],
    steps: [
      {
        title: 'Informes rápidos', route: '/app/rentas/reportes', cta: 'Abrir reportes',
        body: 'Elige un informe en la lista (órdenes, solicitudes, activos, contratos, cargos, pagos, gastos, inspecciones o proveedores), filtra por fechas, propiedad o estado y ordena con un clic en el encabezado. Los atajos de arriba cargan combinaciones frecuentes, como "Órdenes vencidas".',
        scene: { type: 'table', title: 'Reportes · Órdenes de trabajo', action: 'Excel', hlAction: true, caption: 'Filtra y descarga', cols: ['Folio', 'Propiedad', 'Estado', 'Costo'], rows: [['OT-0012', 'A-101', 'Realizada', '$1,800'], ['OT-0013', 'B-07', 'En curso', '$950']] },
      },
      {
        title: 'Columnas, guardados y exportación', route: '/app/rentas/reportes',
        body: 'Con "Columnas" decides qué mostrar; los totales se calculan solos. Guarda tu configuración con un nombre para reutilizarla (queda en este navegador) y descarga en Excel, CSV o PDF/Imprimir.',
        tips: ['El Excel incluye el título y los totales.', 'El PDF se genera desde el diálogo de impresión del navegador.'],
        scene: { type: 'checklist', title: 'Columnas visibles', hl: 1, caption: 'Muestra solo lo que necesitas', items: [{ label: 'Folio' }, { label: 'Costo' }, { label: 'Proveedor' }] },
      },
      {
        title: 'Informe anual', route: '/app/rentas/reportes', search: '?tab=anual',
        body: 'Muestra las 52 semanas del año por plan de preventivo: azul es lo programado, verde lo realizado, naranja lo que está en curso y rojo lo atrasado. La columna de la semana actual se resalta y arriba ves el porcentaje de cumplimiento.',
        scene: { type: 'chart', title: 'Informe anual · 2026', hl: 2, caption: 'Cumplimiento por semana', labels: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun'], bars: [30, 55, 70, 62, 85, 90] },
      },
      {
        title: 'Proveedores y SLA', route: '/app/rentas/reportes', search: '?tab=proveedores',
        body: 'Evalúa a cada proveedor por órdenes a tiempo, retrasos y penalizaciones potenciales, con nivel de riesgo. Expande una fila para ver exactamente qué órdenes se pasaron de su fecha límite.',
        scene: { type: 'table', title: 'Cumplimiento de SLA', hl: 0, caption: 'Quién incumple', cols: ['Proveedor', 'Cumple', 'Riesgo'], rows: [['Frío SA', '33%', 'Alto'], ['Rápido SA', '100%', 'Cumple']] },
      },
    ],
    quiz: [{ q: '¿Qué significa un cuadro rojo en el informe anual?', options: ['Trabajo realizado', 'Mantenimiento atrasado sin realizar', 'Mes sin actividad'], answer: 1, why: 'Rojo indica que la fecha programada ya pasó y el trabajo sigue pendiente.' }],
    faq: [{ q: '¿Se envían los informes por correo automáticamente?', a: 'Todavía no: por ahora se descargan en Excel, CSV o PDF.' }],
  },
  {
    id: 'notificaciones', group: 'general', module: 'notificaciones', icon: Bell, ...SLATE, minutes: 2, level: 'Básico',
    title: 'Notificaciones',
    summary: 'Entérate de solicitudes nuevas, vencimientos y órdenes fuera de SLA sin tener que buscarlos.',
    learn: ['Qué eventos generan avisos', 'Cómo abrir el módulo desde el aviso'],
    steps: [
      {
        title: 'Tu bandeja de avisos', route: '/app/notificaciones', cta: 'Abrir notificaciones',
        body: 'Homly te avisa de contratos por vencer o vencidos, solicitudes nuevas, órdenes fuera de SLA y más. También llegan al correo según tu configuración.',
        scene: { type: 'checklist', title: 'Notificaciones', hl: 0, caption: 'Lo nuevo aparece primero', items: [{ label: 'Nueva solicitud SOL-2026-0012' }, { label: 'Contrato CT-0003 vence en 30 días' }, { label: 'Orden 2026-0045 fuera de SLA' }] },
      },
      {
        title: 'Ir directo al módulo', route: '/app/notificaciones',
        body: 'Al pulsar un aviso te lleva al módulo correspondiente: solicitudes, órdenes de trabajo o vigencias de contratos. Marca como leídas las que ya atendiste.',
        tips: ['Si no ves cierto tipo de aviso, revisa si tu rol tiene ese módulo.'],
        scene: { type: 'flow', title: 'Del aviso a la acción', hl: 1, caption: 'Un clic', nodes: ['Aviso', 'Módulo', 'Atender'] },
      },
    ],
    quiz: [{ q: '¿Qué pasa al pulsar un aviso?', options: ['Se borra', 'Te lleva al módulo relacionado', 'Nada'], answer: 1, why: 'Cada aviso abre la pantalla donde puedes atenderlo.' }],
    faq: [],
  },

  // ═════════════════════════════ OPERACIÓN ═════════════════════════════
  {
    id: 'propiedades', group: 'operacion', module: 'rentas_propiedades', icon: Building2, ...BLUE, minutes: 5, level: 'Básico',
    title: 'Propiedades e inventario',
    summary: 'Registra casas, departamentos, locales, bodegas, plazas y parques, cada uno con sus especificaciones y, si lo necesita, sus espacios.',
    learn: ['Elegir el tipo correcto de propiedad', 'Decidir si se renta o solo se opera', 'Dividir una propiedad Multi Tenant en espacios', 'Capturar especificaciones útiles', 'Importar anuncios de Airbnb'],
    steps: [
      {
        title: 'Nueva propiedad', route: '/app/rentas/propiedades', cta: 'Ir a propiedades',
        body: 'Pulsa "Nueva propiedad" y elige el tipo: residencial, Airbnb o corta estancia, comercial, industrial u otros. El tipo determina qué datos te pedirá la ficha.',
        scene: { type: 'cards', title: '¿Qué tipo de propiedad?', hl: 2, caption: 'Elige el tipo', items: [{ title: 'Residencial', sub: 'Casa, depto, studio' }, { title: 'Airbnb', sub: 'Corta estancia' }, { title: 'Comercial', sub: 'Local, oficina' }, { title: 'Industrial', sub: 'Bodega, nave' }] },
      },
      {
        title: 'Ficha y especificaciones', route: '/app/rentas/propiedades',
        body: 'Captura código, nombre, dirección y las especificaciones del tipo: recámaras y jardín en una casa; frente y uso de suelo en un local; altura libre y andenes en una nave. Agrega también datos del propietario y renta sugerida.',
        tips: ['Usa códigos cortos y consistentes (A-101, L-02); al crear una propiedad Homly sugiere el siguiente código libre.', 'Ubicación: elige primero el país y el estado, luego escribe el código postal; Homly completa delegación o municipio, ciudad y colonia (funciona para más de 120 países).', 'La renta sugerida se usa después en el rent roll.'],
        scene: { type: 'form', title: 'Nueva · Departamento', hl: 0, caption: 'Código único', fields: [{ label: 'Código', value: 'A-101' }, { label: 'Nombre', value: 'Depto Reforma' }, { label: 'Recámaras', value: '2' }, { label: 'Renta sugerida', value: '$14,500' }], action: 'Guardar' },
      },
      {
        title: 'En renta o solo operación', route: '/app/rentas/propiedades',
        body: 'En "Uso de la propiedad" eliges si el inmueble se renta o solo se opera. Una propiedad "Solo operación" (oficina propia, planta, bodega de la empresa) no necesita contrato de renta: igual tiene órdenes de trabajo, activos, inspecciones, preventivo y gastos CAPEX/OPEX, pero no aparece en el Rent Roll ni se le crean contratos de renta.',
        tips: ['Puedes cambiarla a "En renta" cuando quieras; para pasar a "Solo operación" no debe tener un contrato de renta vigente.', 'Si tu espacio completo opera sin rentas, actívalo en Configuración → Modo de operación.'],
        scene: { type: 'form', title: 'Ficha de propiedad', hl: 0, caption: 'Con o sin contrato de renta', fields: [{ label: 'Uso de la propiedad', value: 'Solo operación' }, { label: 'Estatus', value: 'En operación' }, { label: 'Renta sugerida', value: 'No aplica' }], action: 'Guardar' },
      },
      {
        title: 'Multi Tenant y espacios', route: '/app/rentas/propiedades', cta: 'Ir a propiedades',
        body: 'En "Modelo de inquilinos" eliges Single Tenant (un inquilino renta todo) o Multi Tenant (la propiedad se divide en espacios, cada uno con su inquilino). Centros comerciales, edificios de oficinas, hoteles y parques industriales nacen como Multi Tenant. Captura Park, # Building, Submercado y el Total GLA SQM; después pulsa el botón Multi de la lista para administrar sus espacios: locales, anclas, islas, espacios temporales, bodegas, oficinas, pisos, bays, habitaciones…',
        tips: ['Con "Generar en lote" creas, por ejemplo, 12 bays B01…B12 de 2,500 m² en un paso.', 'Cada espacio guarda # unidad, building, piso, M², renta sugerida, especificaciones propias y contactos.', 'El inquilino se asigna creando un contrato de renta sobre el espacio; ocupado y vacante se calculan solos y el GLA rentado aparece en el dashboard y el Rent Roll.', 'Las órdenes de trabajo, solicitudes, equipos, planes preventivos e inspecciones también pueden ligarse a un espacio: elige "Espacio" junto a la propiedad en su formulario.', 'Cada listado tiene filtro "Espacio" (aparece al elegir una propiedad Multi Tenant) y los botones del panel de espacios abren el módulo ya filtrado.', 'CAPEX y OPEX también se pueden asignar a un espacio (proyectos, gastos y presupuesto); en Resumen verás ingresos, OPEX, CAPEX, NOI y OPEX por m² de cada espacio.'],
        scene: { type: 'table', title: 'Park Norte · Espacios', hl: 1, caption: 'GLA rentado y vacante por espacio', cols: ['Espacio', 'Tipo', 'M²', 'Inquilino'], rows: [['B01', 'Bay industrial', '2,500', 'Acme SA'], ['B02', 'Bay industrial', '2,500', 'Disponible']] },
      },
      {
        title: 'Buscar y filtrar', route: '/app/rentas/propiedades',
        body: 'Usa la búsqueda y los filtros para encontrar propiedades por código, tipo o estado (disponible, rentada, mantenimiento…). El estado se actualiza con los contratos.',
        scene: { type: 'table', title: 'Inventario', hl: 1, caption: 'El estado cambia con tus contratos', cols: ['Código', 'Propiedad', 'Tipo', 'Estado'], rows: [['A-101', 'Depto Reforma', 'Departamento', 'Disponible'], ['L-02', 'Local Centro', 'Local', 'Rentada']] },
      },
      {
        title: 'Importar Airbnb', route: '/app/rentas/propiedades', cta: 'Ver el botón',
        body: 'Con "Importar Airbnb" agregas tus anuncios con URL y el iCal oficial. Sin guardar contraseña. Después sincroniza para ver reservas en las vigencias.',
        tips: ['La conexión de cuentas de anfitrión está en Configuración → Airbnb.'],
        scene: { type: 'table', title: 'Inventario', action: 'Importar Airbnb', hlAction: true, caption: 'Trae tus anuncios', cols: ['Anuncio', 'iCal', 'Estado'], rows: [['Loft Roma', 'Sincronizado', 'Activo']] },
      },
    ],
    quiz: [
      { q: '¿Por qué importa elegir bien el tipo de propiedad?', options: ['Cambia el color', 'Define las especificaciones que se piden', 'No importa'], answer: 1, why: 'Cada tipo tiene su propia ficha: no es lo mismo un departamento que una nave.' },
    ],
    faq: [{ q: '¿Cuándo uso Multi Tenant?', a: 'Cuando varios inquilinos rentan partes de la misma propiedad: locales de una plaza, oficinas de un edificio, bays de una nave o habitaciones de un hotel. Si un solo inquilino renta todo, déjala como Single Tenant.' }, { q: '¿Puedo cambiar el tipo después?', a: 'Sí, edita la propiedad. Revisa las especificaciones porque cambian según el tipo.' }],
  },
  {
    id: 'solicitudes', group: 'operacion', module: 'rentas_solicitudes', icon: LifeBuoy, ...CORAL, minutes: 6, level: 'Básico',
    title: 'Solicitudes de servicio y portal',
    summary: 'Recibe reportes de inquilinos, cumple tu SLA y conviértelos en órdenes de trabajo.',
    learn: ['Registrar una solicitud manual', 'Compartir el portal con inquilinos', 'Convertir una solicitud en orden y cerrarla'],
    steps: [
      {
        title: 'Entiende el SLA', route: '/app/rentas/solicitudes', cta: 'Abrir solicitudes',
        body: 'Cada solicitud nace con dos fechas límite según su prioridad: primera respuesta y resolución. Verás si va "En tiempo", "Por vencer" o "Vencida". Los tiempos se editan en Configuración → Operación y SLA.',
        scene: { type: 'table', title: 'Solicitudes', hl: 0, caption: 'Semáforo de SLA', cols: ['Folio', 'Solicitud', 'Prioridad', 'SLA'], rows: [['SOL-0012', 'Fuga en baño', 'Urgente', 'Por vencer'], ['SOL-0011', 'Foco fundido', 'Baja', 'En tiempo']] },
      },
      {
        title: 'Registrar una solicitud', route: '/app/rentas/solicitudes',
        body: 'Pulsa "Nueva solicitud" cuando te llamen o escriban por WhatsApp: elige inmueble (y equipo si aplica), describe el problema, prioridad y quién reporta.',
        tips: ['Si eliges el equipo, queda en su historial.'],
        scene: { type: 'form', title: 'Nueva solicitud', hl: 1, caption: 'Describe el problema', fields: [{ label: 'Inmueble', value: 'A-101 · Depto Reforma' }, { label: 'Asunto', value: 'Fuga en baño principal' }, { label: 'Prioridad', value: 'Urgente' }], action: 'Registrar' },
      },
      {
        title: 'Comparte el portal', route: '/app/rentas/config', cta: 'Abrir configuración',
        body: 'Activa el portal en Configuración → Operación y SLA y comparte el enlace por WhatsApp o correo. El inquilino reporta sin crear cuenta, recibe un folio y puede consultar el avance con su correo.',
        scene: { type: 'flow', title: 'Portal del inquilino', hl: 0, caption: 'Sin cuenta, desde su celular', nodes: ['Inquilino reporta', 'Folio SOL-####', 'Entra a tu bandeja', 'Consulta avance'] },
      },
      {
        title: 'Crear la orden de trabajo', route: '/app/rentas/solicitudes', cta: 'Atender solicitudes',
        body: 'Abre la solicitud y pulsa "Crear orden de trabajo": elige proveedor o responsable. La orden hereda inmueble, equipo, prioridad y fecha límite. Mientras tanto, la solicitud pasa a "En proceso".',
        scene: { type: 'flow', title: 'De solicitud a orden', hl: 1, caption: 'Hereda prioridad y fecha límite', nodes: ['Solicitud nueva', 'Crear orden', 'Orden realizada', 'Solicitud resuelta'] },
      },
      {
        title: 'Resolver y cerrar', route: '/app/rentas/solicitudes',
        body: 'Cuando la orden se realiza, la solicitud pasa a "Resuelta". Anota la solución y ciérrala con la calificación del cliente (1 a 5). Si no procede, recházala con un motivo.',
        tips: ['La calificación alimenta el indicador de satisfacción.'],
        scene: { type: 'checklist', title: 'SOL-2026-0012', hl: 2, caption: 'Califica al cerrar', items: [{ label: 'Orden creada', done: true }, { label: 'Orden realizada', done: true }, { label: 'Cerrar con calificación ★★★★★' }] },
      },
    ],
    quiz: [
      { q: '¿Qué hereda una orden creada desde una solicitud?', options: ['Nada', 'Inmueble, equipo, prioridad y fecha límite', 'Solo el folio'], answer: 1, why: 'Así no capturas lo mismo dos veces y se respeta el SLA.' },
      { q: '¿El inquilino necesita cuenta para usar el portal?', options: ['Sí', 'No, solo el enlace', 'Solo si es Airbnb'], answer: 1, why: 'El portal es público con enlace; consulta el avance con folio y correo.' },
    ],
    faq: [{ q: '¿Qué pasa si se vence el SLA?', a: 'Aparece como vencida, se cuenta en el dashboard y en los indicadores de cumplimiento.' }, { q: '¿Puedo apagar el portal?', a: 'Sí, desde Configuración → Operación y SLA, o regenerar el enlace.' }],
  },
  {
    id: 'ordenes', group: 'operacion', module: 'rentas_mantenimiento', icon: Wrench, ...TEAL, minutes: 7, level: 'Intermedio',
    title: 'Órdenes de trabajo',
    summary: 'Preventivas y correctivas con prioridad, SLA, equipo, costos, checklist y evidencias.',
    learn: ['Crear y seguir una orden', 'Registrar costos y evidencias', 'Filtrar por origen y SLA'],
    steps: [
      {
        title: 'Vista de órdenes', route: '/app/rentas/mantenimiento', cta: 'Abrir órdenes',
        body: 'La pestaña "Todas" junta preventivas y correctivas. Cada fila muestra prioridad, equipo, origen (plan, solicitud o inspección), fecha límite del SLA y estado. Filtra por propiedad, categoría, estatus, origen o "Fuera de SLA".',
        scene: { type: 'table', title: 'Órdenes de trabajo', hl: 2, caption: 'Fecha y semáforo de SLA', cols: ['Folio', 'Trabajo', 'Fecha / SLA', 'Estatus'], rows: [['2026-0045', 'Fuga baño', 'Vencida', 'En curso'], ['2026-0044', 'Filtros clima', 'En tiempo', 'Planeado']] },
      },
      {
        title: 'Nueva orden', route: '/app/rentas/mantenimiento',
        body: 'Pulsa "Nuevo trabajo": elige tipo (correctivo o preventivo), inmueble, equipo afectado, categoría, proveedor, prioridad y fechas. Puedes agregar una lista de verificación con un paso por línea.',
        tips: ['El tipo de trabajo propone título y frecuencia.', 'Un correctivo calcula solo su fecha límite según el SLA.', 'Si la orden es parte de una inversión, elige el "Proyecto CAPEX": su costo suma al proyecto y no al OPEX.'],
        scene: { type: 'form', title: 'Nuevo trabajo', hl: 1, caption: 'Liga el equipo', fields: [{ label: 'Inmueble', value: 'A-101 · Depto Reforma' }, { label: 'Equipo afectado', value: 'ACT-0001 · Minisplit sala' }, { label: 'Prioridad', value: 'Alta' }], action: 'Guardar' },
      },
      {
        title: 'Iniciar y completar', route: '/app/rentas/mantenimiento',
        body: 'Desde la tabla usa ▶ para iniciar y ✓ para marcar realizada. Al iniciar se registra la hora; al completar, el SLA se evalúa como cumplido o tardío y el equipo vuelve a operativo.',
        scene: { type: 'flow', title: 'Ciclo de la orden', hl: 1, caption: 'Se mide el SLA', nodes: ['Planeado', 'En curso', 'Realizado'] },
      },
      {
        title: 'Costos y evidencias', route: '/app/rentas/mantenimiento',
        body: 'En la ficha captura refacciones, mano de obra (el total se calcula) y sube fotos Antes, Durante y Después. El costo real alimenta los indicadores por categoría e inmueble.',
        tips: ['Ve la lista de verificación y marca cada paso desde la ficha.'],
        scene: { type: 'form', title: 'Ficha 2026-0045', hl: 2, caption: 'El total se suma solo', fields: [{ label: 'Refacciones', value: '$300' }, { label: 'Mano de obra', value: '$700' }, { label: 'Costo total real', value: '$1,000' }], action: 'Cargar evidencia' },
      },
    ],
    quiz: [
      { q: '¿Qué pasa con el equipo al completar una orden correctiva?', options: ['Se borra', 'Vuelve a operativo', 'Nada'], answer: 1, why: 'El estado del activo se sincroniza con sus órdenes.' },
      { q: '¿Para qué sirve el filtro "Fuera de SLA"?', options: ['Ver órdenes vencidas', 'Ocultar proveedores', 'Cambiar prioridad'], answer: 0, why: 'Te deja atender primero lo que ya pasó su fecha límite.' },
    ],
    faq: [{ q: '¿Puedo editar el costo total manualmente?', a: 'Sí. Si lo dejas vacío, se calcula como refacciones + mano de obra.' }],
  },
  {
    id: 'proveedores', group: 'operacion', module: 'rentas_mantenimiento', icon: Users, ...PURPLE, minutes: 5, level: 'Intermedio',
    title: 'Proveedores y catálogos',
    summary: 'Organiza contratistas, categorías de servicio y tipos de trabajo, con expediente digital.',
    learn: ['Dar de alta un proveedor', 'Crear categorías y tipos de trabajo', 'Abrir su expediente y REPSE'],
    steps: [
      {
        title: 'Alta de proveedor', route: '/app/rentas/mantenimiento', cta: 'Abrir proveedores',
        body: 'En Órdenes de trabajo → Proveedores pulsa "Nuevo proveedor": persona física o moral, contacto y qué categorías cubre. Luego podrás asignarlo a órdenes, planes y activos.',
        scene: { type: 'tabs', title: 'Órdenes de trabajo', tabs: ['Todas', 'Preventivos', 'Correctivos', 'Proveedores', 'Catálogos'], active: 3, hl: 3, caption: 'Aquí viven tus contratistas', lines: ['Fontanería Pérez', 'Electro Sur', 'ClimaPro'] },
      },
      {
        title: 'Categorías y tipos', route: '/app/rentas/mantenimiento',
        body: 'En Catálogos defines categorías (plomería, eléctrico, HVAC…) y tipos de trabajo (preventivo, correctivo o ambos) con frecuencia sugerida. Alimentan filtros, costos e indicadores.',
        scene: { type: 'cards', title: 'Catálogos', hl: 0, caption: 'Categoría → tipos de trabajo', items: [{ title: 'Plomería', sub: '4 tipos' }, { title: 'Eléctrico', sub: '3 tipos' }, { title: 'Aire acond.', sub: '2 tipos' }] },
      },
      {
        title: 'Expediente digital', route: '/app/rentas/mantenimiento',
        body: 'Al crear un proveedor, Homly pregunta si quieres abrir su expediente: contactos, domicilio, datos bancarios y documentos según persona física o moral. Puedes hacerlo después con el ícono de carpeta.',
        tips: ['Activa REPSE solo si presta servicios especializados.'],
        scene: { type: 'checklist', title: 'Expediente · Fontanería Pérez', hl: 1, caption: 'Documentos pendientes', items: [{ label: 'Contactos', done: true }, { label: 'Constancia de situación fiscal' }, { label: 'Datos bancarios', done: true }] },
      },
    ],
    quiz: [{ q: '¿Cuándo activar el apartado REPSE?', options: ['Siempre', 'Si presta servicios especializados', 'Nunca'], answer: 1, why: 'Solo aplica a ese tipo de servicios y pide documentación adicional.' }],
    faq: [],
  },
  {
    id: 'preventivo', group: 'operacion', module: 'rentas_preventivo', icon: CalendarClock, ...BLUE, minutes: 5, level: 'Intermedio',
    title: 'Mantenimiento preventivo automático',
    summary: 'Crea planes recurrentes y deja que Homly genere las órdenes antes de cada vencimiento.',
    learn: ['Crear un plan con frecuencia y checklist', 'Cómo y cuándo se generan las órdenes', 'Pausar o forzar la generación'],
    steps: [
      {
        title: 'Crear un plan', route: '/app/rentas/preventivo', cta: 'Abrir preventivo',
        body: 'Pulsa "Nuevo plan". Puedes partir de plantillas (aire acondicionado, extintores, cisterna, fumigación…). Define inmueble o equipo, frecuencia, fecha de inicio, anticipación y costo estimado.',
        scene: { type: 'form', title: 'Nuevo plan preventivo', hl: 0, caption: 'Empieza con una plantilla', fields: [{ label: 'Nombre', value: 'Limpieza de filtros' }, { label: 'Frecuencia', value: 'Mensual' }, { label: 'Anticipación', value: '3 días' }], action: 'Guardar' },
      },
      {
        title: 'Lista de verificación', route: '/app/rentas/preventivo',
        body: 'Escribe un paso por línea. Se copia a cada orden generada para que quien haga el trabajo no olvide nada.',
        scene: { type: 'checklist', title: 'Checklist del plan', hl: 0, caption: 'Un paso por línea', items: [{ label: 'Limpiar filtros' }, { label: 'Revisar nivel de gas' }, { label: 'Limpiar condensadora' }] },
      },
      {
        title: 'Generación automática', route: '/app/rentas/preventivo',
        body: 'Cada día a las 6:00 Homly revisa tus planes y crea la orden de trabajo cuando se acerca la fecha, y avanza el plan al siguiente periodo. No duplica órdenes.',
        tips: ['Con "Generar órdenes pendientes" lo haces al instante.', 'El rayo ⚡ de un plan genera solo esa orden.'],
        scene: { type: 'flow', title: 'Cada día a las 6:00', hl: 1, caption: 'Sin hacer nada', nodes: ['Plan vence en 3 días', 'Se crea la orden', 'Plan avanza al siguiente mes'] },
      },
      {
        title: 'Pausar y revisar estado', route: '/app/rentas/preventivo',
        body: 'Pausa un plan con ⏸ para detener la generación sin perder historial. Los estados son Al día, Próximo (≤7 días), Vencido y Pausado.',
        scene: { type: 'table', title: 'Preventivo', hl: 0, caption: 'Vencido = sin orden generada', cols: ['Plan', 'Próxima', 'Estado'], rows: [['Filtros clima', '12/11', 'Próximo'], ['Fumigación', '01/12', 'Al día']] },
      },
    ],
    quiz: [{ q: '¿Qué hace el rayo ⚡ de un plan?', options: ['Lo borra', 'Genera su orden ahora', 'Lo pausa'], answer: 1, why: 'Sirve para adelantar la orden sin esperar al proceso diario.' }],
    faq: [{ q: '¿Se generan órdenes duplicadas?', a: 'No. Homly verifica que no exista ya una orden del plan para esa fecha.' }],
  },
  {
    id: 'activos', group: 'operacion', module: 'rentas_activos', icon: Cpu, ...PURPLE, minutes: 4, level: 'Básico',
    title: 'Activos y equipos',
    summary: 'Inventaría equipos con garantía, vida útil e historial para decidir cuándo reparar o reemplazar.',
    learn: ['Registrar un equipo', 'Leer garantía y vida útil', 'Consultar su historial de órdenes'],
    steps: [
      {
        title: 'Registrar un equipo', route: '/app/rentas/activos', cta: 'Abrir activos',
        body: 'Pulsa "Nuevo activo": inmueble, nombre, tipo (clima, bomba, elevador…), marca, modelo, serie, criticidad, instalación, garantía y costo de compra.',
        tips: ['La criticidad indica qué tanto afecta la operación si falla.'],
        scene: { type: 'form', title: 'Nuevo activo', hl: 2, caption: 'Garantía y vida útil', fields: [{ label: 'Nombre', value: 'Minisplit sala' }, { label: 'Criticidad', value: 'Alta' }, { label: 'Garantía hasta', value: '15/12/2026' }], action: 'Guardar' },
      },
      {
        title: 'Garantía, vida útil y estado', route: '/app/rentas/activos',
        body: 'La tabla muestra estado (operativo, en falla, en mantenimiento…), garantía (vigente, por vencer, vencida) y años restantes de vida útil. El estado cambia solo con tus órdenes.',
        scene: { type: 'table', title: 'Activos y equipos', hl: 2, caption: 'Alertas de garantía', cols: ['Código', 'Equipo', 'Estado', 'Garantía'], rows: [['ACT-0001', 'Minisplit sala', 'Operativo', 'Por vencer'], ['ACT-0002', 'Bomba cisterna', 'En falla', 'Vencida']] },
      },
      {
        title: 'Historial del equipo', route: '/app/rentas/activos',
        body: 'Pulsa el nombre del equipo para ver sus planes preventivos y todas sus órdenes con costos. Así decides si conviene seguir reparando o reemplazar.',
        scene: { type: 'cards', title: 'ACT-0002 · Bomba cisterna', hl: 1, caption: 'Costo acumulado', items: [{ title: '3 fallas', sub: 'Último año' }, { title: '$7,200', sub: 'Costo acumulado' }, { title: '1 plan', sub: 'Preventivo' }] },
      },
      {
        title: 'Ligar un equipo a un proyecto CAPEX', route: '/app/rentas/activos',
        body: 'En el formulario del equipo elige "Proyecto CAPEX (opcional)" cuando su compra, reposición o mejora forme parte de una inversión. El equipo aparece en el detalle del proyecto y verás su código CAPEX en la tabla y en su ficha.',
        tips: ['Los equipos que superan su vida útil aparecen como candidatos a CAPEX en CAPEX y OPEX → Resumen.'],
        scene: { type: 'form', title: 'Editar activo', hl: 2, caption: 'Inversión ligada al equipo', fields: [{ label: 'Nombre', value: 'Elevador torre A' }, { label: 'Costo de compra', value: '$480,000' }, { label: 'Proyecto CAPEX', value: 'PRY-0003 · Sustitución de elevador' }], action: 'Guardar' },
      },
    ],
    quiz: [{ q: '¿Cómo cambia el estado de un equipo?', options: ['Solo a mano', 'Se sincroniza con sus órdenes', 'Nunca'], answer: 1, why: 'Una orden abierta lo marca en falla o mantenimiento y, al cerrarse, vuelve a operativo.' }],
    faq: [],
  },
  {
    id: 'inspecciones', group: 'operacion', module: 'rentas_inspecciones', icon: ScanSearch, ...AMBER, minutes: 5, level: 'Intermedio',
    title: 'Inspecciones con checklist',
    summary: 'Revisa inmuebles con plantillas; cada falla se convierte en una orden correctiva.',
    learn: ['Crear una inspección desde plantilla', 'Marcar Bien, Falla o N/A', 'Adjuntar fotos y archivos como evidencia', 'Completar y generar órdenes'],
    steps: [
      {
        title: 'Elegir plantilla', route: '/app/rentas/inspecciones', cta: 'Abrir inspecciones',
        body: 'Pulsa "Nueva inspección", elige plantilla (entrega, seguridad, áreas comunes, instalaciones, limpieza) e inmueble. Puedes ligar un equipo y poner al inspector.',
        scene: { type: 'form', title: 'Nueva inspección', hl: 0, caption: 'Parte de una plantilla', fields: [{ label: 'Plantilla', value: 'Entrega de inmueble' }, { label: 'Inmueble', value: 'A-101' }, { label: 'Inspector', value: 'Luis' }], action: 'Crear y empezar' },
      },
      {
        title: 'Revisar punto por punto', route: '/app/rentas/inspecciones',
        body: 'Marca cada punto como Bien, Falla o N/A. En una falla describe lo que encontraste y su prioridad. Guarda el avance las veces que quieras.',
        scene: { type: 'checklist', title: 'INS-2026-0001', hl: 1, caption: 'Anota qué falló', items: [{ label: 'Llaves y controles · Bien', done: true }, { label: 'Pintura de sala · Falla (humedad)' }, { label: 'Cerraduras · Bien', done: true }] },
      },
      {
        title: 'Evidencias: fotos y archivos', route: '/app/rentas/inspecciones',
        body: 'Además de la nota, cada punto acepta fotos y archivos (PDF, Word, Excel). Desde el celular, "Foto" abre la cámara. Al final hay una sección de evidencias generales (fachada, vista general, documentos). Si la plantilla marca un punto con "Evidencia obligatoria", no podrás completar la inspección sin adjuntarla.',
        tips: ['Las evidencias de un punto con falla pasan solas a la orden correctiva como fotos "Antes".', 'Al completar la inspección, sus evidencias quedan bloqueadas como registro.'],
        scene: { type: 'checklist', title: 'INS-2026-0001 · Evidencias', hl: 1, caption: 'Foto obligatoria en este punto', items: [{ label: 'Llaves y controles · 1 foto', done: true }, { label: 'Pintura de sala · falta foto' }, { label: 'Evidencias generales · 2 archivos', done: true }] },
      },
      {
        title: 'Completar y generar órdenes', route: '/app/rentas/inspecciones',
        body: 'Al pulsar "Completar" se calcula la calificación (Bien ÷ Bien + Falla) y, si dejas marcada la opción, se crea una orden correctiva por cada falla con su prioridad y fecha límite.',
        scene: { type: 'flow', title: 'Resultado', hl: 2, caption: 'Una orden por falla', nodes: ['Inspección', 'Calificación 83%', 'Órdenes correctivas'] },
      },
      {
        title: 'Plantillas propias', route: '/app/rentas/inspecciones',
        body: 'En la pestaña Plantillas crea o edita tus listas: nombre, tipo y puntos con instrucción para el inspector y la opción de evidencia obligatoria. También puedes adjuntar material de referencia (foto del estado esperado, instructivo o formato) que verá quien realice la inspección.',
        scene: { type: 'cards', title: 'Plantillas', hl: 3, caption: 'Crea las tuyas', items: [{ title: 'Entrega', sub: '12 puntos' }, { title: 'Seguridad', sub: '9 puntos' }, { title: 'Limpieza', sub: '8 puntos' }, { title: '+ Nueva', sub: 'Tu plantilla' }] },
      },
    ],
    quiz: [{ q: '¿Qué ocurre con cada falla al completar?', options: ['Se ignora', 'Se crea una orden correctiva', 'Se envía por correo'], answer: 1, why: 'Así no se pierde ningún hallazgo.' }],
    faq: [{ q: '¿Puedo editar una inspección completada?', a: 'No. Queda bloqueada como registro; crea una nueva si necesitas revisar de nuevo.' }],
  },
  {
    id: 'indicadores', group: 'operacion', module: 'rentas_indicadores', icon: Gauge, ...BLUE, minutes: 5, level: 'Intermedio',
    title: 'Indicadores de operación',
    summary: 'Mide MTTR, cumplimiento de SLA y preventivo, costos y desempeño de proveedores.',
    learn: ['Qué significa cada indicador', 'Cómo leer costos por categoría e inmueble', 'Cómo mejorar tus números'],
    steps: [
      {
        title: 'Los indicadores principales', route: '/app/rentas/indicadores', cta: 'Abrir indicadores',
        body: 'MTTR es el tiempo medio de reparación. Cumplimiento de SLA mide órdenes cerradas a tiempo. Cumplimiento preventivo mide planes realizados en fecha. También ves la proporción de preventivo contra correctivo.',
        scene: { type: 'kpis', title: 'Indicadores de operación', hl: 1, caption: 'Meta: arriba de 90%', items: [{ label: 'MTTR', value: '18 h' }, { label: 'SLA', value: '92%' }, { label: 'Preventivo', value: '78%', tone: 'warn' }, { label: '% preventivo', value: '40%' }] },
      },
      {
        title: 'Órdenes y backlog', route: '/app/rentas/indicadores',
        body: 'La gráfica compara órdenes creadas y completadas por mes, con el costo. El backlog por antigüedad y prioridad te dice dónde se acumula el trabajo.',
        scene: { type: 'chart', title: 'Creadas vs completadas', hl: 3, caption: 'Si crece la brecha, hay backlog', labels: ['Jun', 'Jul', 'Ago', 'Sep', 'Oct'], bars: [40, 55, 48, 70, 62] },
      },
      {
        title: 'Costos y proveedores', route: '/app/rentas/indicadores',
        body: 'Revisa el costo por categoría e inmueble, el desempeño de cada proveedor (órdenes, tiempo promedio y SLA) y los equipos con más fallas para decidir reemplazos.',
        tips: ['Registra costos reales en cada orden para que estos números sean confiables.'],
        scene: { type: 'table', title: 'Desempeño de proveedores', hl: 1, caption: 'Compara tiempos y SLA', cols: ['Proveedor', 'Órdenes', 'Tiempo', 'SLA'], rows: [['Fontanería Pérez', '12', '9 h', '95%'], ['ClimaPro', '7', '26 h', '71%']] },
      },
    ],
    quiz: [{ q: '¿Qué mide el MTTR?', options: ['El costo mensual', 'El tiempo medio de reparación', 'La ocupación'], answer: 1, why: 'Es el tiempo promedio entre que se reporta y se cierra un correctivo.' }],
    faq: [{ q: '¿Por qué mis indicadores salen vacíos?', a: 'Necesitas órdenes realizadas, activos o solicitudes en el periodo elegido.' }],
  },

  // ═════════════════════════════ COMERCIAL ═════════════════════════════
  {
    id: 'crm', group: 'comercial', module: 'rentas_crm', icon: Target, ...CORAL, minutes: 5, level: 'Básico',
    title: 'CRM: prospectos y visitas',
    summary: 'Da seguimiento a cada prospecto hasta convertirlo en inquilino con contrato.',
    learn: ['Registrar un lead', 'Mover etapas del pipeline', 'Convertir a cliente y contrato'],
    steps: [
      {
        title: 'Nuevo lead', route: '/app/rentas/crm', cta: 'Abrir CRM',
        body: 'Pulsa "Nuevo lead" y captura nombre, contacto, origen (web, WhatsApp, visita, Airbnb…), propiedad de interés y presupuesto.',
        scene: { type: 'form', title: 'Nuevo lead', hl: 0, caption: 'Captura al instante', fields: [{ label: 'Nombre', value: 'María Torres' }, { label: 'Origen', value: 'WhatsApp' }, { label: 'Interés', value: 'A-101' }], action: 'Guardar' },
      },
      {
        title: 'Pipeline por etapas', route: '/app/rentas/crm',
        body: 'Las columnas son Nuevo, Contactado, Visita, Propuesta, Negociación, Ganado y Perdido. Abre un lead para moverlo de etapa y registrar notas de cada contacto.',
        scene: { type: 'kanban', title: 'Leads y clientes', hl: 2, caption: 'Mueve el lead de etapa', columns: [{ label: 'Nuevo', cards: ['María T.'] }, { label: 'Visita', cards: ['Café Aurora', 'Jorge P.'] }, { label: 'Propuesta', cards: ['Ana L.'] }] },
      },
      {
        title: 'Ganar y crear contrato', route: '/app/rentas/crm',
        body: 'Con "Ganar" (o "Ganar y crear contrato" en el detalle) conviertes al lead en inquilino y creas su contrato en borrador. Si la propiedad ya tiene contrato vigente, no convierte.',
        scene: { type: 'flow', title: 'Conversión', hl: 2, caption: 'Un paso, dos registros', nodes: ['Lead', 'Ganar', 'Inquilino + contrato borrador'] },
      },
    ],
    quiz: [{ q: '¿Qué crea "Ganar y crear contrato"?', options: ['Solo una nota', 'Un inquilino y un contrato en borrador', 'Una factura'], answer: 1, why: 'Evita capturar de nuevo los datos del prospecto.' }],
    faq: [],
  },
  {
    id: 'contratos', group: 'comercial', module: 'rentas_contratos', icon: FileText, ...TEAL, minutes: 7, level: 'Intermedio',
    title: 'Contratos y asistente legal',
    summary: 'Crea contratos de renta, proveedores y servicios; redáctalos, fírmalos y publícalos desde Homly.',
    learn: ['Elegir el tipo de contrato', 'Renta fija o variable', 'Usar el asistente legal y activar'],
    steps: [
      {
        title: 'Tipo de contrato', route: '/app/rentas/contratos', cta: 'Abrir contratos',
        body: 'Pulsa "Nuevo contrato" y elige el tipo: renta, promesa, proveedor, servicios u otros convenios. Las pestañas superiores filtran por tipo.',
        scene: { type: 'cards', title: '¿Qué contrato necesitas?', hl: 0, caption: 'Elige el tipo', items: [{ title: 'Renta', sub: 'Inmueble e inquilino' }, { title: 'Proveedor', sub: 'Servicios recurrentes' }, { title: 'Obra', sub: 'Trabajos específicos' }, { title: 'Convenio', sub: 'Otros acuerdos' }] },
      },
      {
        title: 'Datos y renta', route: '/app/rentas/contratos',
        body: 'Indica inmueble, inquilino, fechas de vigencia, renta mensual, depósito, día de pago, incremento y mora. En renta variable defines una base más condiciones (porcentaje de ventas, mínimos).',
        tips: ['El contrato de renta exige inmueble e inquilino.', 'Si falta el inquilino, créalo desde el mismo formulario.'],
        scene: { type: 'form', title: 'Contrato de renta', hl: 2, caption: 'Fija o variable', fields: [{ label: 'Inmueble', value: 'L-02 · Local Centro' }, { label: 'Vigencia', value: '01/01/2027 — 31/12/2027' }, { label: 'Esquema de renta', value: 'Variable' }], action: 'Guardar' },
      },
      {
        title: 'Asistente legal', route: '/app/rentas/contratos', cta: 'Ver contratos',
        body: 'Al crear el contrato, Homly ofrece abrir el asistente: entrevista para reunir datos, redacción del documento, firmas y publicación. La etapa legal se ve en la columna "Legal".',
        scene: { type: 'flow', title: 'Etapa legal', hl: 1, caption: 'Redacta con el asistente', nodes: ['Entrevista', 'Redacción', 'En firmas', 'Publicado'] },
      },
      {
        title: 'Activar y cerrar', route: '/app/rentas/contratos',
        body: 'Cuando todo esté listo pulsa "Activar": el contrato empieza a generar cobranza y ocupa la propiedad. Al terminar, usa "Cerrar" para finalizarlo.',
        scene: { type: 'table', title: 'Contratos', hl: 0, caption: 'Activa el borrador', cols: ['Contrato', 'Contraparte', 'Vigencia', 'Estatus'], rows: [['CT-0004', 'Café Aurora', '2027', 'Borrador'], ['CT-0001', 'Ana López', '2026', 'Activo']] },
      },
    ],
    quiz: [
      { q: '¿Cuándo empieza a generar cobranza un contrato?', options: ['Al crearlo', 'Al activarlo', 'Al imprimirlo'], answer: 1, why: 'Los borradores no generan cargos.' },
      { q: '¿Qué es una renta variable?', options: ['Una renta que cambia sin control', 'Una base más condiciones (por ejemplo % de ventas)', 'Una renta en dólares'], answer: 1, why: 'Defines una renta base y condiciones; la cobranza la recalcula con "Recalcular variables".' },
    ],
    faq: [{ q: '¿Puedo usar el asistente después?', a: 'Sí, desde el botón "Asistente" de cada contrato.' }],
  },
  {
    id: 'vigencias', group: 'comercial', module: 'rentas_calendario', icon: Calendar, ...AMBER, minutes: 3, level: 'Básico',
    title: 'Vigencias de contratos',
    summary: 'Anticipa renovaciones y vencimientos con el calendario de vida de tus contratos.',
    learn: ['Dónde está Vigencias', 'Qué significan los grupos', 'Cómo actuar antes de que venza'],
    steps: [
      {
        title: 'Pestaña Vigencias', route: '/app/rentas/contratos', search: '?tab=vigencias', cta: 'Abrir vigencias',
        body: 'Vigencias es una pestaña dentro de Contratos. Agrupa Vencidos, Por vencer (45 días), Vigentes más adelante y Reservas Airbnb.',
        scene: { type: 'tabs', title: 'Contratos', tabs: ['Contratos', 'Vigencias'], active: 1, hl: 1, caption: 'Dentro de Contratos', lines: ['Vencidos · 1', 'Por vencer (45 días) · 2', 'Vigentes más adelante · 12'] },
      },
      {
        title: 'Actúa a tiempo', route: '/app/rentas/contratos', search: '?tab=vigencias',
        body: 'Los contratos por vencer te dan margen para negociar la renovación. Si ya venció, renueva o ciérralo. Recibirás avisos antes de la fecha.',
        tips: ['Los días de aviso se configuran en Configuración → General.'],
        scene: { type: 'table', title: 'Por vencer (45 días)', hl: 0, caption: 'Negocia la renovación', cols: ['Contrato', 'Inquilino', 'Fin', 'Días'], rows: [['CT-0003', 'Jorge P.', '12/12/2026', '38'], ['CT-0006', 'Café Aurora', '28/12/2026', '54']] },
      },
    ],
    quiz: [{ q: '¿Dónde encuentras Vigencias?', options: ['En el dashboard', 'Como pestaña dentro de Contratos', 'En Cobranza'], answer: 1, why: 'Ahora vive dentro del módulo Contratos.' }],
    faq: [],
  },

  // ═════════════════════════════ FINANZAS ═════════════════════════════
  {
    id: 'cobranza', group: 'finanzas', module: 'rentas_cobranza', icon: Receipt, ...TEAL, minutes: 6, level: 'Intermedio',
    title: 'Cobranza de rentas',
    summary: 'Genera cargos, registra pagos, calcula mora y rentas variables.',
    learn: ['Generar el mes', 'Registrar pagos totales o parciales', 'Aplicar mora y cargos extra'],
    steps: [
      {
        title: 'Generar el mes', route: '/app/rentas/cobranza', cta: 'Abrir cobranza',
        body: 'Elige el periodo y pulsa "Generar mes": se crean los cargos de renta de todos los contratos activos. Es seguro repetirlo; no duplica cargos.',
        scene: { type: 'table', title: 'Cobranza', action: 'Generar mes', hlAction: true, caption: 'Empieza cada mes aquí', cols: ['Contrato', 'Concepto', 'Monto', 'Estado'], rows: [['CT-0001', 'Renta noviembre', '$12,500', 'Pendiente'], ['CT-0002', 'Renta noviembre', '$28,000', 'Pendiente']] },
      },
      {
        title: 'Registrar un pago', route: '/app/rentas/cobranza',
        body: 'En el cargo pulsa "Registrar pago": monto, fecha y forma de pago. Si paga una parte, queda como Parcial. Los filtros Pendientes, Parciales, Pagados, Morosos y Variables te ayudan a revisar.',
        scene: { type: 'form', title: 'Registrar pago', hl: 0, caption: 'Total o parcial', fields: [{ label: 'Monto', value: '$12,500' }, { label: 'Fecha', value: '05/11/2026' }, { label: 'Forma de pago', value: 'Transferencia' }], action: 'Registrar pago' },
      },
      {
        title: 'Mora y cargos extra', route: '/app/rentas/cobranza',
        body: 'Para cargos vencidos puedes agregar mora con un clic. "Nuevo cargo" crea conceptos extra (mantenimiento, penalizaciones…). Los cargos erróneos se cancelan.',
        scene: { type: 'table', title: 'Morosos', hl: 1, caption: 'Aplica mora', cols: ['Contrato', 'Vencido', 'Mora'], rows: [['CT-0003', '$9,000', '—'], ['CT-0007', '$4,200', '$210']] },
      },
      {
        title: 'Rentas variables', route: '/app/rentas/cobranza',
        body: 'Si un contrato es variable, captura el dato del mes y usa "Recalcular variables" para actualizar su monto según las condiciones del contrato.',
        scene: { type: 'flow', title: 'Renta variable', hl: 2, caption: 'Actualiza el monto', nodes: ['Base', 'Dato del mes', 'Recalcular', 'Cargo final'] },
      },
    ],
    quiz: [{ q: '¿Qué pasa si repites "Generar mes"?', options: ['Duplica cargos', 'No duplica los ya generados', 'Borra pagos'], answer: 1, why: 'Es seguro volver a ejecutarlo.' }],
    faq: [{ q: '¿Cómo corrijo un cargo mal capturado?', a: 'Cancélalo desde la fila y crea uno nuevo con el monto correcto.' }],
  },
  {
    id: 'rentroll', group: 'finanzas', module: 'rentas_rentroll', icon: ClipboardList, ...BLUE, minutes: 4, level: 'Intermedio',
    title: 'Rent Roll (rol de rentas)',
    summary: 'Una foto de tu portafolio: ocupación, renta real contra potencial, vacancia y morosidad.',
    learn: ['Leer ocupación y vacancia', 'Entender renta real vs potencial', 'Exportar o imprimir'],
    steps: [
      {
        title: 'Foto del portafolio', route: '/app/rentas/rentroll', cta: 'Abrir rent roll',
        body: 'El rent roll muestra, a una fecha, cada propiedad con su inquilino, renta, depósito y estado. Arriba verás ocupación, renta en operación (in-place), potencial (GPR) y pérdida por vacancia.',
        scene: { type: 'kpis', title: 'Rol de rentas', hl: 2, caption: 'Potencial vs real', items: [{ label: 'Ocupación', value: '86%' }, { label: 'Renta in-place', value: '$412k' }, { label: 'Potencial (GPR)', value: '$455k' }, { label: 'Vacancia', value: '$43k', tone: 'warn' }] },
      },
      {
        title: 'Pestañas de análisis', route: '/app/rentas/rentroll',
        body: 'Rent roll, Vacantes, Morosos y Renta variable filtran el análisis. Cambia la fecha de corte para ver cómo estaba tu portafolio en otro momento.',
        scene: { type: 'tabs', title: 'Rol de rentas', tabs: ['Rent roll', 'Vacantes', 'Morosos', 'Renta variable'], active: 1, hl: 1, caption: 'Detecta vacantes', lines: ['B-07 · Bodega Norte · Vacante 45 días', 'A-203 · Depto Sur · Vacante 12 días'] },
      },
      {
        title: 'Exportar e imprimir', route: '/app/rentas/rentroll',
        body: 'Usa "CSV" para analizar en Excel o "Imprimir" para compartirlo con propietarios o inversionistas.',
        scene: { type: 'table', title: 'Rol de rentas', action: 'CSV', hlAction: true, caption: 'Descarga el análisis', cols: ['Propiedad', 'Inquilino', 'Renta'], rows: [['A-101', 'Ana López', '$12,500']] },
      },
    ],
    quiz: [{ q: '¿Qué es el GPR?', options: ['La renta potencial a precio de lista', 'Un tipo de contrato', 'Una multa'], answer: 0, why: 'GPR es lo que cobrarías si todo estuviera rentado a la renta sugerida.' }],
    faq: [],
  },

  {
    id: 'capex', group: 'finanzas', module: 'rentas_capex', icon: PiggyBank, ...PURPLE, minutes: 6, level: 'Intermedio',
    title: 'CAPEX y OPEX',
    summary: 'Presupuesta y sigue la inversión (CAPEX) y el gasto operativo (OPEX) de todo tu portafolio, ligado a órdenes de trabajo y equipos.',
    learn: ['Leer el resumen financiero (ingresos, OPEX, NOI)', 'Crear un proyecto CAPEX con hitos', 'Registrar gastos y ligar órdenes y equipos', 'Presupuestar el año por categoría'],
    steps: [
      {
        title: 'Resumen financiero', route: '/app/rentas/capex', cta: 'Abrir CAPEX y OPEX',
        body: 'Reúne en un lugar los ingresos cobrados, el OPEX contra presupuesto, el resultado operativo (NOI) y el CAPEX ejecutado. Compara contra el año anterior y detecta alertas de sobregasto o proyectos en riesgo.',
        scene: { type: 'kpis', title: 'CAPEX y OPEX', hl: 2, caption: 'Todo en una vista', items: [{ label: 'Ingresos cobrados', value: '$1.2M' }, { label: 'OPEX vs presupuesto', value: '-4%' }, { label: 'NOI', value: '$780k' }, { label: 'CAPEX ejecutado', value: '$310k', tone: 'warn' }] },
      },
      {
        title: 'Proyectos CAPEX', route: '/app/rentas/capex', search: '?tab=proyectos',
        body: 'Crea proyectos de inversión (remodelación, reposición de equipo, eficiencia energética…) con presupuesto, fechas e hitos con peso. El avance se calcula con los hitos y la salud combina costo y cronograma. Si capturas el beneficio anual esperado, Homly calcula ROI y recuperación.',
        tips: ['En el tablero, abre una tarjeta para ver hitos, gastos, órdenes y equipos del proyecto.', 'Los equipos que ya cumplieron su vida útil aparecen como candidatos a CAPEX en el resumen.'],
        scene: { type: 'kanban', title: 'Proyectos CAPEX', hl: 2, caption: 'De la propuesta a completado', columns: [{ label: 'Propuesta', cards: ['Lobby'] }, { label: 'Aprobado', cards: ['Elevador'] }, { label: 'En ejecución', cards: ['Clima', 'Fachada'] }] },
      },
      {
        title: 'Gastos y órdenes ligadas', route: '/app/rentas/capex', search: '?tab=gastos',
        body: 'Registra gastos OPEX o CAPEX (este último siempre ligado a un proyecto). Las órdenes de mantenimiento también aparecen en el libro: si eliges un "Proyecto CAPEX" en la orden, su costo suma a la inversión; si no, cuenta como OPEX.',
        scene: { type: 'flow', title: 'Planeación y ejecución', hl: 2, caption: 'Una sola cifra', nodes: ['Proyecto CAPEX', 'Orden de trabajo', 'Costo real', 'Presupuesto'] },
      },
      {
        title: 'Equipos ligados', route: '/app/rentas/activos', cta: 'Abrir activos',
        body: 'Desde Activos y equipos también puedes ligar un equipo a un proyecto CAPEX. El proyecto muestra sus equipos y el resumen sugiere reemplazos con base en el valor en libros y la vida útil.',
        scene: { type: 'cards', title: 'Proyecto PRY-0003', hl: 1, caption: 'Equipos y órdenes del proyecto', items: [{ title: 'Elevador torre A', sub: 'ACT-0012' }, { title: '2 órdenes', sub: '$86k ejecutado' }, { title: 'Avance', sub: '40% · 2/5 hitos' }] },
      },
      {
        title: 'Presupuesto anual', route: '/app/rentas/capex', search: '?tab=presupuesto',
        body: 'Captura el presupuesto OPEX por categoría (y por propiedad si lo necesitas) mes a mes, o copia el de otro año. Verás el acumulado, lo real y el uso del presupuesto.',
        scene: { type: 'table', title: 'Presupuesto OPEX', action: 'Copiar año', hlAction: true, caption: 'Planea y compara', cols: ['Categoría', 'Anual', 'Real'], rows: [['Mantenimiento', '$120,000', '$84,200'], ['Servicios', '$96,000', '$61,500']] },
      },
    ],
    quiz: [{ q: '¿Cuándo una orden de trabajo cuenta como CAPEX?', options: ['Siempre', 'Cuando se liga a un proyecto CAPEX', 'Nunca'], answer: 1, why: 'Sin proyecto es gasto operativo (OPEX); con proyecto suma a la inversión.' }],
    faq: [{ q: '¿Quién puede capturar gastos y proyectos?', a: 'Administrador, tesorero y contador. Gerente, coordinador de mantenimiento y auditor consultan.' }],
  },

  // ═════════════════════════════ AJUSTES ═════════════════════════════
  {
    id: 'config', group: 'ajustes', module: 'rentas_config', icon: Settings, ...SLATE, minutes: 5, level: 'Básico',
    title: 'Configuración, SLA y portal',
    summary: 'Ajusta datos generales, conceptos de cobro, usuarios, SLA y el portal de solicitudes.',
    learn: ['Datos generales y avisos', 'Editar el SLA por prioridad', 'Activar y regenerar el portal'],
    steps: [
      {
        title: 'Datos generales', route: '/app/rentas/config', cta: 'Abrir configuración',
        body: 'En General defines nombre, moneda, país y estado, datos fiscales, día de pago y los días de aviso antes de que venza un contrato.',
        scene: { type: 'form', title: 'Configuración · General', hl: 2, caption: 'Controla tus avisos', fields: [{ label: 'Nombre', value: 'Inmobiliaria Centro' }, { label: 'Moneda', value: 'MXN' }, { label: 'Aviso de vencimiento (días)', value: '45' }], action: 'Guardar' },
      },
      {
        title: 'Modo de operación', route: '/app/rentas/config', cta: 'Abrir configuración',
        body: 'En "Modo de operación" decides si tu espacio administra rentas o solo opera propiedades. Con rentas, puedes apagar los módulos que no uses (CRM, Cobranza, Rent Roll). En "Solo operación" se ocultan los tres y no se crean contratos de renta. Operación, CAPEX y OPEX, Contratos de servicio y Reportes siempre siguen disponibles.',
        tips: ['Tus datos no se borran: puedes reactivar los módulos después.', 'Para pasar a "Solo operación" primero finaliza o cancela los contratos de renta vigentes.'],
        scene: { type: 'cards', title: 'Modo de operación', hl: 1, caption: 'Elige cómo trabajas', items: [{ title: 'Rentas y operación', sub: 'Contratos + cobranza' }, { title: 'Solo operación', sub: 'Sin contratos de renta' }, { title: 'CAPEX y OPEX', sub: 'Siempre disponible' }] },
      },
      {
        title: 'Operación y SLA', route: '/app/rentas/config',
        body: 'Define en horas el tiempo de primera respuesta y de resolución por prioridad. Se usa para las fechas límite de solicitudes y órdenes correctivas.',
        tips: ['La respuesta no puede tardar más que la resolución.'],
        scene: { type: 'table', title: 'Acuerdos de servicio', hl: 0, caption: 'Edita las horas', cols: ['Prioridad', 'Respuesta', 'Resolución'], rows: [['Urgente', '1 h', '8 h'], ['Alta', '4 h', '48 h'], ['Media', '12 h', '120 h']] },
      },
      {
        title: 'Portal de solicitudes', route: '/app/rentas/config',
        body: 'Activa el portal, personaliza el mensaje de bienvenida y el correo que recibirá los avisos. Si el enlace se filtra, "Regenerar" crea uno nuevo y el anterior deja de funcionar.',
        scene: { type: 'form', title: 'Portal de solicitudes', hl: 0, caption: 'Actívalo cuando estés listo', fields: [{ label: 'Portal habilitado', value: 'Sí' }, { label: 'Mensaje', value: 'Cuéntanos qué sucede…' }, { label: 'Correo de avisos', value: 'ops@empresa.mx' }], action: 'Guardar configuración' },
      },
      {
        title: 'Conceptos de cobro', route: '/app/rentas/config',
        body: 'Conceptos de cobro lista lo que puedes cobrar (renta, mantenimiento…). Cada concepto puede ser recurrente o único.',
        scene: { type: 'tabs', title: 'Configuración', tabs: ['General', 'Operación y SLA', 'Airbnb', 'Conceptos de cobro', 'Equipo y perfiles'], active: 3, hl: 3, caption: 'Qué puedes cobrar', lines: ['Renta · recurrente', 'Mantenimiento · recurrente', 'Depósito · único'] },
      },
      {
        title: 'Equipo y perfiles', route: '/app/rentas/config',
        body: 'En Equipo y perfiles agregas a tu gente y eliges su perfil: gerente de propiedades, ejecutivo comercial, coordinador de mantenimiento, técnico de campo, tesorero, contador o auditor. Cada perfil ve solo los módulos que necesita; la pestaña Perfiles y accesos muestra qué puede hacer cada uno.',
        scene: { type: 'tabs', title: 'Configuración', tabs: ['General', 'Operación y SLA', 'Airbnb', 'Conceptos de cobro', 'Equipo y perfiles'], active: 4, hl: 4, caption: 'Cada quien ve lo suyo', lines: ['Gerente · propiedades, contratos y mantenimiento', 'Técnico · órdenes e inspecciones', 'Auditor · consulta de todo'] },
      },
    ],
    quiz: [{ q: '¿Qué hace "Regenerar" el enlace del portal?', options: ['Nada', 'Crea un enlace nuevo y el anterior deja de funcionar', 'Borra solicitudes'], answer: 1, why: 'Útil si el enlace se compartió donde no debía.' }],
    faq: [],
  },
  {
    id: 'airbnb', group: 'ajustes', module: 'rentas_config', icon: Globe, ...CORAL, minutes: 4, level: 'Intermedio',
    title: 'Airbnb por iCal',
    summary: 'Importa tus anuncios y sincroniza reservas sin dar tu contraseña de Airbnb.',
    learn: ['Crear una cuenta de anfitrión', 'Importar anuncios', 'Sincronizar el calendario'],
    steps: [
      {
        title: 'Cuenta de anfitrión', route: '/app/rentas/config', search: '#airbnb', cta: 'Abrir Airbnb',
        body: 'En Configuración → Airbnb crea una cuenta de anfitrión (solo un nombre para identificarla). No se guarda ninguna contraseña.',
        scene: { type: 'form', title: 'Cuentas de anfitrión', hl: 0, caption: 'Solo un nombre', fields: [{ label: 'Nombre de la cuenta', value: 'Cuenta principal' }], action: 'Crear cuenta' },
      },
      {
        title: 'Importar anuncios', route: '/app/rentas/config', search: '#airbnb',
        body: 'Pega la URL del anuncio y el enlace iCal oficial que Airbnb te da en el calendario del anuncio. Pulsa "Agregar al inventario" para crear la propiedad.',
        tips: ['Agrega varios anuncios con "Otro anuncio".'],
        scene: { type: 'table', title: 'Importar anuncios', hl: 0, caption: 'URL + iCal oficial', cols: ['Nombre', 'URL', 'iCal'], rows: [['Loft Roma', 'airbnb.mx/rooms/…', 'https://…ics']] },
      },
      {
        title: 'Sincronizar reservas', route: '/app/rentas/config', search: '#airbnb',
        body: 'Pulsa "Sincronizar" para traer reservas y bloqueos. Se ven en Contratos → Vigencias y marcan la ocupación en el rent roll.',
        scene: { type: 'flow', title: 'Sincronización', hl: 1, caption: 'Reservas al calendario', nodes: ['Airbnb iCal', 'Sincronizar', 'Vigencias y rent roll'] },
      },
    ],
    quiz: [{ q: '¿Homly guarda tu contraseña de Airbnb?', options: ['Sí', 'No, usa el iCal oficial', 'Solo la encriptada'], answer: 1, why: 'La integración usa solo URLs/iCal públicas de tus anuncios.' }],
    faq: [],
  },
];

export const GUIDE_BY_ID = Object.fromEntries(RENTAL_GUIDES.map(g => [g.id, g]));

/** Convierte una guía en "capítulo" del panel flotante GuideModal. */
export function toFloatingChapter(guide, startAt = 0) {
  const steps = guide.steps.map(s => ({
    icon: guide.icon, color: guide.color, bg: guide.bg,
    title: s.title, subtitle: guide.title,
    body: s.body, tips: s.tips,
    route: s.route,
  }));
  return { id: `rg-${guide.id}`, title: guide.title, color: guide.color, bg: guide.bg, steps: steps.slice(startAt) };
}
