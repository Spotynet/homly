/**
 * guideCatalog.jsx
 * ─────────────────────────────────────────────────────────────────
 * Catálogo de la Guía de Uso — Homly Residencial (condominios).
 *
 * Secciones:
 *   mapa      → cómo se conectan los módulos (financiero + operativo)
 *   admin     → configuración, operación, comunidad
 *   tesorero  → cobranza, egresos, periodos y expediente
 *   contador  → reportes, auditoría y cierre
 *   vecino    → portal del residente
 *   vigilante → caseta (paquetes y visitas)
 *
 * Cada capítulo (kind: 'modal' | 'interactive') alimenta GuideModal
 * o el AdminConfigTour.
 */
import {
  Settings, Sparkles, Users, Shield, Layers,
  Receipt, DollarSign, Wallet, TrendingDown, FileText, Send,
  ShoppingBag, BookOpen, Lock, ClipboardCheck, Vote,
  Home, Calendar, Bell, UserCheck,
  Package, Wrench, Newspaper, Camera, QrCode,
  Building2, Globe, Mail, CheckCircle2, FolderArchive,
  LayoutDashboard, ArrowRightLeft, Link2,
} from 'lucide-react';

const tipConnect = (text) => text;

// ═══════════════════════════════════════════════════════════════
//  MAPA — Cómo se conecta el condominio
// ═══════════════════════════════════════════════════════════════
const mapaChapters = [
  {
    id: 'mapa-overview',
    kind: 'modal',
    icon: LayoutDashboard,
    color: 'var(--teal-500)',
    bg: 'var(--teal-50)',
    title: 'Vista rápida del menú',
    subtitle: 'General · Operación · Comunidad · Finanzas · Ajustes',
    length: '4 pasos',
    steps: [
      {
        icon: LayoutDashboard, color: 'var(--teal-500)', bg: 'var(--teal-50)',
        title: 'Los 5 grupos del menú',
        subtitle: 'Todo tiene un lugar',
        body:
          'Homly Residencial organiza el trabajo en cinco grupos: General (Dashboard, Notificaciones y Guías), Operación (Reservas, Paquetería, Visitas y Mantenimientos), Comunidad (Comunicación y Asambleas), Finanzas (Cobranza, Gastos, Caja Chica, Estado de Cuenta, Plan de Pagos, Periodos y Planeación) y Ajustes (Membresía y Configuración). Solo ves lo que tu rol y el plan permiten.',
        tips: [
          'Si un módulo no aparece, puede estar apagado en Configuración → Permisos o fuera de tu rol.',
          'Empieza por Configuración (unidades y cuotas) y luego Operación + Finanzas.',
        ],
        route: '/app/dashboard',
      },
      {
        icon: ArrowRightLeft, color: 'var(--teal-500)', bg: 'var(--teal-50)',
        title: 'Dos motores que trabajan juntos',
        subtitle: 'Finanzas + Operación',
        body:
          'La parte financiera mueve dinero (cobrar cuotas, pagar gastos, cerrar el mes). La parte operativa cuida el día a día (visitas, paquetes, reservas, mantenimientos). Al final del mes, Periodos → Expediente junta ambos mundos en documentos listos para el comité.',
        tips: [
          tipConnect('Ejemplo: un mantenimiento puede generar un gasto; ese gasto aparece en el cierre y en el expediente.'),
        ],
      },
      {
        icon: Link2, color: 'var(--teal-500)', bg: 'var(--teal-50)',
        title: 'Quién hace qué',
        subtitle: 'Roles sin complicaciones',
        body:
          'Administrador configura y coordina. Tesorero cobra y registra egresos. Contador/auditor revisa y firma. Vigilante opera caseta (paquetes y visitas). Residente usa Mi Unidad, paga, reserva y autoriza visitas. Todos comparten la misma información; cambian los permisos.',
      },
      {
        icon: CheckCircle2, color: 'var(--teal-500)', bg: 'var(--teal-50)',
        title: 'Orden recomendado para empezar',
        subtitle: 'De cero a operar',
        body:
          '1) Configuración: datos del condominio, unidades y cuotas. 2) Usuarios del equipo. 3) Cobranza del mes actual. 4) Paquetería y Visitas en caseta. 5) Comunicación a la comunidad. 6) Al terminar el mes: Periodos (cerrar + expediente).',
        tips: ['Si el condominio ya opera, salta al capítulo de tu rol y practica con datos reales.'],
        route: '/app/config',
      },
    ],
  },
  {
    id: 'mapa-finanzas',
    kind: 'modal',
    icon: Wallet,
    color: '#22c55e',
    bg: '#dcfce7',
    title: 'Ciclo financiero del mes',
    subtitle: 'Cómo se conectan Cobranza, Gastos y Periodos',
    length: '5 pasos',
    steps: [
      {
        icon: Receipt, color: '#22c55e', bg: '#dcfce7',
        title: '1. Entra el dinero — Cobranza',
        subtitle: 'Pagos de mantenimiento y extras',
        body:
          'En Cobranza capturas cada pago por unidad y período. También llegan comprobantes desde Enviar pago (residentes). Cada folio alimenta el Estado de cuenta de la unidad y el resumen del mes en Periodos.',
        tips: [
          tipConnect('Se conecta con: Estado de Cuenta, Plan de Pagos, Enviar pago, Periodos → Expediente (ingresos).'),
        ],
        route: '/app/cobranza',
      },
      {
        icon: TrendingDown, color: '#22c55e', bg: '#dcfce7',
        title: '2. Adeudos — Plan de Pagos',
        subtitle: 'Cuando una unidad se atrasa',
        body:
          'Si hay saldo pendiente, en Plan de Pagos propones mensualidades. Al aceptar el plan, los abonos de Cobranza se aplican a esas cuotas. El residente ve el mismo plan en su portal.',
        tips: [tipConnect('Se conecta con: Cobranza (abonos), Estado de Cuenta (saldo), Notificaciones (propuesta).')],
        route: '/app/plan-pagos',
      },
      {
        icon: ShoppingBag, color: '#22c55e', bg: '#dcfce7',
        title: '3. Sale el dinero — Gastos y Caja Chica',
        subtitle: 'Egresos con evidencia',
        body:
          'Gastos registra egresos de cuenta bancaria (o vinculados a mantenimientos). Caja Chica es el fondo chico en efectivo. Ambos usan categorías contables y, al cerrar el mes, quedan congelados.',
        tips: [tipConnect('Se conecta con: Mantenimientos (costos), Planeación (presupuesto), Periodos (egresos del expediente).')],
        route: '/app/gastos',
      },
      {
        icon: ClipboardCheck, color: '#22c55e', bg: '#dcfce7',
        title: '4. Planeación',
        subtitle: 'Lo presupuestado vs lo real',
        body:
          'En Planeación armas el presupuesto anual y proyectos. Conforme se registran gastos, ves cuánto llevas ejecutado. Sirve para asamblea y para no pasarte de rubro.',
        tips: [tipConnect('Se conecta con: Gastos (ejecutado) y Asambleas (reportar avance).')],
        route: '/app/planeacion',
      },
      {
        icon: FolderArchive, color: '#22c55e', bg: '#dcfce7',
        title: '5. Periodos y Expediente',
        subtitle: 'Cerrar el mes y respaldar',
        body:
          'En Periodos revisas ingresos vs egresos, cierras el mes (con firmas del comité si aplica) y en el tab Expediente descargas o imprimes el respaldo: documentos de Finanzas (cobranza, gastos, adeudos…) y de Operación (reservas, paquetes, visitas, mantenimientos).',
        tips: [
          'Solo aparecen períodos desde el inicio de operaciones del condominio (Configuración).',
          tipConnect('El expediente une Finanzas + Operación del mismo mes.'),
        ],
        route: '/app/cierre-periodo',
      },
    ],
  },
  {
    id: 'mapa-operacion',
    kind: 'modal',
    icon: Package,
    color: '#0f766e',
    bg: '#ccfbf1',
    title: 'Ciclo operativo del día a día',
    subtitle: 'Caseta, áreas comunes y mantenimientos',
    length: '4 pasos',
    steps: [
      {
        icon: UserCheck, color: '#0f766e', bg: '#ccfbf1',
        title: 'Visitas Autorizadas',
        subtitle: 'Del residente a la caseta',
        body:
          'El residente (o administración) autoriza visitas con QR. Vigilancia registra ingreso y salida con QR o identificación + foto. Los contactos de la unidad reciben aviso. El reporte del período alimenta el Expediente.',
        tips: [tipConnect('Se conecta con: Notificaciones, Configuración (cajones/gafetes), Periodos → Expediente.')],
        route: '/app/visitas',
      },
      {
        icon: Package, color: '#0f766e', bg: '#ccfbf1',
        title: 'Paquetería',
        subtitle: 'Recibir → avisar → entregar',
        body:
          'Caseta recibe el paquete con foto y folio. El vecino recibe correo con QR. Al entregar, se escanea ese QR (o se firma). Todo queda en bitácora y en el reporte del mes.',
        tips: [tipConnect('Se conecta con: Notificaciones del residente y Expediente de Periodos.')],
        route: '/app/paqueteria',
      },
      {
        icon: Calendar, color: '#0f766e', bg: '#ccfbf1',
        title: 'Reservas',
        subtitle: 'Áreas comunes con control',
        body:
          'El residente solicita salón, alberca, gym, etc. Administración aprueba o rechaza. Evitas dobles reservas y dejas evidencia del uso del mes para el expediente.',
        tips: [tipConnect('Se conecta con: Notificaciones (aprobación) y Periodos → Expediente (reporte de reservas).')],
        route: '/app/reservas',
      },
      {
        icon: Wrench, color: '#0f766e', bg: '#ccfbf1',
        title: 'Mantenimientos',
        subtitle: 'Trabajo + evidencia + costo',
        body:
          'Planeas preventivos o abres correctivos, subes evidencias con fecha real y, si hubo gasto, lo vinculas. El historial sirve al comité y al Expediente del período.',
        tips: [tipConnect('Se conecta con: Gastos (dinero), Comunicación (avisar a vecinos) y Periodos → Expediente.')],
        route: '/app/mantenimientos',
      },
    ],
  },
  {
    id: 'mapa-comunidad',
    kind: 'modal',
    icon: Newspaper,
    color: '#0d9488',
    bg: '#ccfbf1',
    title: 'Comunidad y gobierno',
    subtitle: 'Avisos, asambleas y transparencia',
    length: '3 pasos',
    steps: [
      {
        icon: Newspaper, color: '#0d9488', bg: '#ccfbf1',
        title: 'Comunicación',
        subtitle: 'Avisos a quien corresponde',
        body:
          'Publica avisos, eventos o mantenimientos con audiencia (todos, por rol o personas). El Directorio te da contactos de unidades activas para localizar rápido a alguien.',
        tips: [tipConnect('Se conecta con: Notificaciones y Mantenimientos (avisar cortes o trabajos).')],
        route: '/app/blog',
      },
      {
        icon: Vote, color: '#0d9488', bg: '#ccfbf1',
        title: 'Asambleas',
        subtitle: 'Convocatoria → quórum → acta',
        body:
          'Creas la asamblea con plazos según la entidad del condominio, pasas lista, votas y protocolizas. Los vecinos ven convocatoria y documentos desde su menú.',
        tips: [tipConnect('Se conecta con: Planeación y Estado de Cuenta (información para acuerdos).')],
        route: '/app/asambleas',
      },
      {
        icon: Bell, color: '#0d9488', bg: '#ccfbf1',
        title: 'Notificaciones',
        subtitle: 'El hilo que une todo',
        body:
          'Pagos, paquetes, visitas, reservas, asambleas y firmas de cierre llegan al centro de notificaciones (y muchos también por correo). Es el “timbre” interno del condominio.',
        route: '/app/notificaciones',
      },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════
//  ADMIN
// ═══════════════════════════════════════════════════════════════
const adminChapters = [
  {
    id: 'admin-setup',
    kind: 'interactive',
    icon: Sparkles,
    color: 'var(--teal-500)',
    bg: 'var(--teal-50)',
    title: 'Tour interactivo de Configuración',
    subtitle: 'Guía paso a paso sobre la pantalla real',
    length: '~10 min',
    launchRoute: '/app/config?tour=1',
  },
  {
    id: 'admin-units',
    kind: 'modal',
    icon: Building2,
    color: '#0ea5e9',
    bg: '#e0f2fe',
    title: 'Unidades del condominio',
    subtitle: 'Alta, contactos y usuarios residentes',
    length: '4 pasos',
    steps: [
      {
        icon: Building2, color: '#0ea5e9', bg: '#e0f2fe',
        title: 'Dar de alta una unidad',
        subtitle: 'Una por una o por lote',
        body:
          'Ve a Configuración → Unidades. Usa "Agregar unidad" o "Importar" para varias. Cada unidad necesita un número/código interno único (ej. A-101): aparece en cobranza, reportes, paquetes y visitas.',
        tips: [
          'Si aún no tienes el correo del propietario, déjalo vacío y complétalo después.',
          tipConnect('Sin unidades bien dadas de alta, Cobranza y caseta no pueden operar.'),
        ],
        route: '/app/config',
      },
      {
        icon: Mail, color: '#0ea5e9', bg: '#e0f2fe',
        title: 'Propietario, copropietario e inquilino',
        subtitle: 'Tres contactos por unidad',
        body:
          'Captura hasta tres contactos. Cobros, planes de pago y muchos avisos van por default a propietario y copropietario. El inquilino usa el portal de residente de su unidad.',
        tips: ['Mantén correos al día: de ahí salen recibos, QR de paquetes y avisos de visitas.'],
      },
      {
        icon: Users, color: '#0ea5e9', bg: '#e0f2fe',
        title: 'Crear usuario desde la unidad',
        subtitle: 'Acceso al portal',
        body:
          'Desde la ficha de la unidad puedes crear el usuario residente. Homly envía credenciales provisionales; el vecino entra a Mi Unidad, ve su saldo, reserva y autoriza visitas.',
      },
      {
        icon: CheckCircle2, color: '#0ea5e9', bg: '#e0f2fe',
        title: 'Inactivar sin borrar',
        subtitle: 'Conserva el historial',
        body:
          'Si cambia el dueño o la unidad deja de operar, usa Inactivar. Conservas pagos y reportes para auditoría. Las unidades con historial de pagos no se eliminan.',
      },
    ],
  },
  {
    id: 'admin-users',
    kind: 'modal',
    icon: Users,
    color: '#f59e0b',
    bg: '#fef3c7',
    title: 'Usuarios y permisos',
    subtitle: 'Equipo, roles y módulos activos',
    length: '3 pasos',
    steps: [
      {
        icon: Users, color: '#f59e0b', bg: '#fef3c7',
        title: 'Invitar al equipo',
        subtitle: 'Admin, tesorero, contador, vigilante…',
        body:
          'En Configuración → Usuarios pulsa Invitar. Cada persona recibe correo con contraseña provisional y debe cambiarla al entrar. Así separas quien configura, quien cobra y quien atiende caseta.',
        route: '/app/config',
      },
      {
        icon: Shield, color: '#f59e0b', bg: '#fef3c7',
        title: 'Roles y perfiles a la medida',
        subtitle: 'Qué ve y qué edita cada quien',
        body:
          'Usa roles estándar o crea un perfil personalizado en Roles y Perfiles: módulo visible, solo lectura o editable. Los cambios aplican al instante.',
        tips: ['Desactiva usuarios en vez de borrarlos para conservar auditoría.'],
      },
      {
        icon: Layers, color: '#f59e0b', bg: '#fef3c7',
        title: 'Encender o apagar módulos',
        subtitle: 'Solo lo que usa tu condominio',
        body:
          'Si no usan Reservas o Paquetería, desactívalos en Permisos. Desaparecen del menú para todos y las guías de esos módulos también se ocultan.',
      },
    ],
  },
  {
    id: 'admin-dashboard',
    kind: 'modal',
    icon: LayoutDashboard,
    color: '#6366f1',
    bg: '#eef2ff',
    title: 'Dashboard',
    subtitle: 'El pulso del condominio',
    length: '2 pasos',
    steps: [
      {
        icon: LayoutDashboard, color: '#6366f1', bg: '#eef2ff',
        title: 'Lee el mes de un vistazo',
        subtitle: 'Cobranza, gastos y operación',
        body:
          'El Dashboard resume cuotas cobradas, pendientes, gastos y actividad reciente. Usa el selector de período para cambiar de mes. Desde aquí saltas a Cobranza, Gastos o Periodos cuando algo no cuadra.',
        tips: [tipConnect('Si el indicador de adeudos sube, abre Plan de Pagos o Estado de Cuenta.')],
        route: '/app/dashboard',
      },
      {
        icon: FileText, color: '#6366f1', bg: '#eef2ff',
        title: 'Reportes y conciliación',
        subtitle: 'Antes de cerrar el mes',
        body:
          'Desde la vista económica revisas el panorama que después formalizas en Periodos. Úsalo como checklist diario o semanal del tesorero y del administrador.',
      },
    ],
  },
  {
    id: 'admin-reservas',
    kind: 'modal',
    icon: Calendar,
    color: '#f59e0b',
    bg: '#fef3c7',
    title: 'Reservas de áreas comunes',
    subtitle: 'Solicitudes, aprobación y calendario',
    length: '3 pasos',
    steps: [
      {
        icon: Calendar, color: '#f59e0b', bg: '#fef3c7',
        title: 'Ver y gestionar solicitudes',
        subtitle: 'Pendientes, aprobadas, rechazadas',
        body:
          'En Reservas ves el calendario y la lista. El residente solicita; tú apruebas o rechazas. Evita choques de horario en salón, alberca u otras áreas.',
        tips: [tipConnect('Se conecta con: Notificaciones al residente y Expediente del período.')],
        route: '/app/reservas',
      },
      {
        icon: Settings, color: '#f59e0b', bg: '#fef3c7',
        title: 'Configura las áreas',
        subtitle: 'En Configuración',
        body:
          'Define qué áreas se pueden reservar, horarios y reglas básicas en Configuración. Sin áreas activas, el residente no puede solicitar.',
        route: '/app/config',
      },
      {
        icon: FileText, color: '#f59e0b', bg: '#fef3c7',
        title: 'Reporte del mes',
        subtitle: 'Para el expediente',
        body:
          'Al cerrar el mes, el reporte de reservas queda disponible en Periodos → Expediente → Operación, junto con paquetes, visitas y mantenimientos.',
      },
    ],
  },
  {
    id: 'admin-paqueteria',
    kind: 'modal',
    icon: Package,
    color: '#0f766e',
    bg: '#ccfbf1',
    title: 'Paquetería / Mensajería',
    subtitle: 'Recepción en caseta y entrega al vecino',
    length: '4 pasos',
    steps: [
      {
        icon: Package, color: '#0f766e', bg: '#ccfbf1',
        title: 'Recibir un paquete',
        subtitle: 'Foto, unidad y folio del año',
        body:
          'En Paquetería pulsa Recibir paquete, elige la unidad (nombre primero, ID después), toma la foto y guarda. Homly asigna el folio AAAA-####. Luego eliges a qué contactos avisar.',
        tips: ['Practica con vigilancia: el flujo es el mismo desde su rol.'],
        route: '/app/paqueteria',
      },
      {
        icon: Mail, color: '#0f766e', bg: '#ccfbf1',
        title: 'Aviso con QR y foto',
        subtitle: 'Lo que recibe el vecino',
        body:
          'El correo lleva folio, unidad, foto, QR de entrega y, si lo configuraste, el reglamento. El vecino muestra ese QR en caseta; no se escribe a mano.',
      },
      {
        icon: QrCode, color: '#0f766e', bg: '#ccfbf1',
        title: 'Entregar con QR o firma',
        subtitle: 'El código debe coincidir',
        body:
          'En En vigilancia → Entregar (o Escanear QR). Si el código no es de ese paquete, Homly avisa. Con firma, el destinatario firma en pantalla.',
        tips: ['El texto del QR es de solo lectura: solo se reemplaza al escanear de nuevo.'],
      },
      {
        icon: FileText, color: '#0f766e', bg: '#ccfbf1',
        title: 'Personalizar y reportar',
        subtitle: 'Reglamento, recordatorios y PDF',
        body:
          'En Personalizar editas reglamento y recordatorios si el paquete sigue en caseta. En Reporte eliges periodo y descargas PDF. Ese mismo reporte alimenta el Expediente de Periodos.',
        tips: [tipConnect('Se conecta con: Notificaciones y Periodos → Expediente → Operación.')],
        route: '/app/paqueteria',
      },
    ],
  },
  {
    id: 'admin-visitas',
    kind: 'modal',
    icon: UserCheck,
    color: '#0d9488',
    bg: '#ccfbf1',
    title: 'Visitas Autorizadas',
    subtitle: 'Permanentes, ocasionales y caseta',
    length: '4 pasos',
    steps: [
      {
        icon: UserCheck, color: '#0d9488', bg: '#ccfbf1',
        title: 'Autorizar una visita',
        subtitle: 'Anfitrión, vigencia y QR',
        body:
          'Registra nombre, correo y celular. Elige ocasional (llegada estimada) o permanente (cantidad de visitas o indefinido, con vigencia). Indica quién recibe. El visitante recibe el QR por correo.',
        route: '/app/visitas',
      },
      {
        icon: Settings, color: '#0d9488', bg: '#ccfbf1',
        title: 'Cajones y gafetes',
        subtitle: 'Configuración del condominio',
        body:
          'En Configuración → Visitas das de alta cajones y gafetes. En el ingreso, vigilancia asigna el que corresponda.',
        route: '/app/config',
      },
      {
        icon: Camera, color: '#0d9488', bg: '#ccfbf1',
        title: 'Ingreso y salida en caseta',
        subtitle: 'QR o identificación + foto',
        body:
          'El vigilante escanea el QR de esa autorización. Sin QR: identificación con el mismo nombre + foto de evidencia (no se guarda el documento). Vehículo: foto, placa y cajón/gafete.',
        tips: ['Al confirmar se eligen contactos de la unidad; reciben correo con fotos.'],
      },
      {
        icon: FileText, color: '#0d9488', bg: '#ccfbf1',
        title: 'Reporte del periodo',
        subtitle: 'Resumen y PDF',
        body:
          'En Visitas → Reporte eliges el periodo, ves ingresos/salidas y descargas PDF. También queda en Periodos → Expediente.',
        tips: [tipConnect('Se conecta con: Notificaciones, Configuración y Expediente.')],
        route: '/app/visitas',
      },
    ],
  },
  {
    id: 'admin-mantenimientos',
    kind: 'modal',
    icon: Wrench,
    color: '#b45309',
    bg: '#fffbeb',
    title: 'Mantenimientos',
    subtitle: 'Preventivos, correctivos, evidencias y costos',
    length: '4 pasos',
    steps: [
      {
        icon: Wrench, color: '#b45309', bg: '#fffbeb',
        title: 'Crear un trabajo',
        subtitle: 'Preventivo o correctivo',
        body:
          'Abre una planeación preventiva (revisiones programadas) o un correctivo (falla). Indica área, responsable y estatus. Al terminar, márcalo Realizado.',
        route: '/app/mantenimientos',
      },
      {
        icon: Camera, color: '#b45309', bg: '#fffbeb',
        title: 'Cargar evidencias',
        subtitle: 'Fecha real de la foto',
        body:
          'Con el trabajo En curso o Realizado, sube fotos o archivos y elige la fecha en que se tomó la evidencia (puede diferir del día en que la cargas).',
        tips: ['Si las fotos son de otro día, usa la fecha real de la evidencia.'],
      },
      {
        icon: ShoppingBag, color: '#b45309', bg: '#fffbeb',
        title: 'Vincular el costo',
        subtitle: 'Del trabajo al gasto',
        body:
          'Si el trabajo tuvo costo, regístralo o vincula el gasto. Así Planeación y el cierre del mes reflejan el dinero real de la operación.',
        tips: [tipConnect('Se conecta con: Gastos, Planeación y Expediente.')],
      },
      {
        icon: FileText, color: '#b45309', bg: '#fffbeb',
        title: 'Reporte e historial',
        subtitle: 'Comité y bitácora',
        body:
          'Desde la ficha ves el reporte. El historial se conserva aunque el período financiero ya esté cerrado, y el PDF del mes entra al Expediente.',
        route: '/app/mantenimientos',
      },
    ],
  },
  {
    id: 'admin-comunicacion',
    kind: 'modal',
    icon: Newspaper,
    color: '#0d9488',
    bg: '#ccfbf1',
    title: 'Comunicación y directorio',
    subtitle: 'Avisos a la comunidad y contactos',
    length: '3 pasos',
    steps: [
      {
        icon: Newspaper, color: '#0d9488', bg: '#ccfbf1',
        title: 'Publicar un aviso',
        subtitle: 'Audiencia y portada',
        body:
          'En Comunicación crea un artículo (aviso, mantenimiento, evento…). Elige audiencia: todos, por rol o personas. Puedes poner imagen de portada o un color. Los vecinos reaccionan y comentan.',
        route: '/app/blog',
      },
      {
        icon: Users, color: '#0d9488', bg: '#ccfbf1',
        title: 'Directorio de la comunidad',
        subtitle: 'Propietarios e inquilinos',
        body:
          'El botón Directorio lista contactos de unidades activas (nombre, correo, teléfono). Busca, filtra, imprime o baja CSV.',
        route: '/app/blog',
      },
      {
        icon: Bell, color: '#0d9488', bg: '#ccfbf1',
        title: 'Notificaciones',
        subtitle: 'En la app y por correo',
        body:
          'Paquetes, visitas, pagos y asambleas también llegan al centro de notificaciones. Pide a los vecinos revisar la campana con frecuencia.',
        route: '/app/notificaciones',
      },
    ],
  },
  {
    id: 'admin-asambleas',
    kind: 'modal',
    icon: Vote,
    color: '#0d9488',
    bg: '#ccfbf1',
    title: 'Asambleas del condominio',
    subtitle: 'Convocatoria, quórum, votación y acta',
    length: '3 pasos',
    steps: [
      {
        icon: Vote, color: '#0d9488', bg: '#ccfbf1',
        title: 'Convocatoria con plazo legal',
        subtitle: 'Según la entidad del tenant',
        body:
          'Crea ordinaria o extraordinaria. Homly aplica días de anticipación y quórum según la entidad configurada. Completa lugar, orden del día y emite; se notifica a la comunidad.',
        route: '/app/asambleas',
      },
      {
        icon: Users, color: '#0d9488', bg: '#ccfbf1',
        title: 'Reunión y quórum',
        subtitle: 'Primera y segunda convocatoria',
        body:
          'Pasa lista, registra cartas poder e instala la mesa solo con quórum. Si no se reúne, abre la segunda convocatoria con el receso normativo.',
      },
      {
        icon: FileText, color: '#0d9488', bg: '#ccfbf1',
        title: 'Minuta y protocolización',
        subtitle: 'Acuerdos y firmas',
        body:
          'Registra votaciones, redacta el acta, fírmala con presidente y secretario y, si aplica, márcala protocolizada ante notario.',
        tips: [tipConnect('Lleva a la asamblea datos de Planeación, Estado de Cuenta y Expediente del período.')],
      },
    ],
  },
  {
    id: 'admin-notificaciones',
    kind: 'modal',
    icon: Bell,
    color: 'var(--coral-500)',
    bg: 'var(--coral-50)',
    title: 'Notificaciones',
    subtitle: 'El centro de avisos del equipo',
    length: '2 pasos',
    steps: [
      {
        icon: Bell, color: 'var(--coral-500)', bg: 'var(--coral-50)',
        title: 'Qué llega aquí',
        subtitle: 'Operación + finanzas',
        body:
          'Firmas de cierre, comprobantes de pago, avisos de comunidad y alertas operativas aparecen en la campana. Márcalas leídas cuando ya las atendiste.',
        route: '/app/notificaciones',
      },
      {
        icon: CheckCircle2, color: 'var(--coral-500)', bg: 'var(--coral-50)',
        title: 'Buen hábito',
        subtitle: 'Revisa al inicio del día',
        body:
          'Empieza el día en Notificaciones: ahí detectas pagos por validar, firmas pendientes y mensajes de caseta sin salir a cada módulo.',
      },
    ],
  },
  {
    id: 'admin-committee',
    kind: 'modal',
    icon: Globe,
    color: '#8b5cf6',
    bg: '#ede9fe',
    title: 'Comité, Periodos y Expediente',
    subtitle: 'Gobierno del mes y respaldo documental',
    length: '4 pasos',
    steps: [
      {
        icon: Globe, color: '#8b5cf6', bg: '#ede9fe',
        title: 'Registrar el comité',
        subtitle: 'Presidente, tesorero, secretario',
        body:
          'En Configuración → Organización registra al comité. Sus nombres aparecen en reportes firmados y en el flujo de cierre.',
        route: '/app/config',
      },
      {
        icon: Lock, color: '#8b5cf6', bg: '#ede9fe',
        title: 'Flujo de cierre',
        subtitle: 'Quién firma antes de cerrar',
        body:
          'Activa firmas del comité si quieres que tesorero/presidente aprueben antes de cerrar. Si está inactivo, el admin puede cerrar directo.',
      },
      {
        icon: Lock, color: '#8b5cf6', bg: '#ede9fe',
        title: 'Cerrar el período',
        subtitle: 'Congela movimientos del mes',
        body:
          'En Periodos → Gestión revisas el resumen y cierras. Cobranza, gastos y caja chica del mes quedan en solo lectura. Para corregir, reabre (queda en bitácora).',
        route: '/app/cierre-periodo',
      },
      {
        icon: FolderArchive, color: '#8b5cf6', bg: '#ede9fe',
        title: 'Expediente de Periodos',
        subtitle: 'Finanzas + Operación en un solo lugar',
        body:
          'En el tab Expediente elige año/mes (desde el inicio de operaciones). Verás documentos de Finanzas y de Operación: consulta, descarga o imprime. Es el respaldo del mes para el comité y la auditoría.',
        tips: [
          'Define el inicio de operaciones en Configuración para limitar períodos válidos.',
          tipConnect('Une Cobranza, Gastos, Reservas, Paquetería, Visitas y Mantenimientos del mismo mes.'),
        ],
      },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════
//  TESORERO
// ═══════════════════════════════════════════════════════════════
const tesoreroChapters = [
  {
    id: 'tes-cobranza',
    kind: 'modal',
    icon: Receipt,
    color: '#22c55e',
    bg: '#dcfce7',
    title: 'Cobranza',
    subtitle: 'Registrar pagos de mantenimiento',
    length: '4 pasos',
    steps: [
      {
        icon: Receipt, color: '#22c55e', bg: '#dcfce7',
        title: 'Capturar un pago',
        subtitle: 'Unidad, período y monto',
        body:
          'En Cobranza elige la unidad, el mes al que aplica y el monto. Marca forma de pago (efectivo, transferencia, etc.). Al guardar se genera un folio único.',
        tips: [
          'Revisa también Enviar pago: ahí llegan comprobantes del residente listos para validar.',
          tipConnect('Se conecta con: Estado de Cuenta, Plan de Pagos y Expediente.'),
        ],
        route: '/app/cobranza',
      },
      {
        icon: DollarSign, color: '#22c55e', bg: '#dcfce7',
        title: 'Parciales y excedentes',
        subtitle: 'Homly lleva el saldo',
        body:
          'Si abona de menos, queda pendiente. Si abona de más, el excedente puede aplicarse al siguiente mes. Puedes cubrir varios meses en una captura.',
      },
      {
        icon: FileText, color: '#22c55e', bg: '#dcfce7',
        title: 'Cargos adicionales',
        subtitle: 'Multas, recargos, extras',
        body:
          'Agrega conceptos extra al pago (multa, cuota especial). Aparecen en el recibo y en el estado de cuenta del residente.',
      },
      {
        icon: Mail, color: '#22c55e', bg: '#dcfce7',
        title: 'Enviar el recibo',
        subtitle: 'Propietario y copropietario',
        body:
          'Desde el folio envía el recibo PDF por correo. Queda en el historial de la unidad.',
      },
    ],
  },
  {
    id: 'tes-plan-pagos',
    kind: 'modal',
    icon: TrendingDown,
    color: '#f59e0b',
    bg: '#fef3c7',
    title: 'Plan de Pagos',
    subtitle: 'Adeudos con mensualidades pactadas',
    length: '4 pasos',
    steps: [
      {
        icon: TrendingDown, color: '#f59e0b', bg: '#fef3c7',
        title: 'Ver unidades con adeudo',
        subtitle: 'Lista y búsqueda',
        body:
          'El módulo lista unidades con saldo pendiente. Busca por número o propietario. Usa Estado de Cuenta si necesitas el detalle mes a mes.',
        route: '/app/plan-pagos',
      },
      {
        icon: ClipboardCheck, color: '#f59e0b', bg: '#fef3c7',
        title: 'Proponer el plan',
        subtitle: 'Mensualidades y fechas',
        body:
          'Elige número de mensualidades, fecha de inicio y monto. Homly calcula el resto. Queda Propuesto hasta que el residente acepte.',
      },
      {
        icon: Send, color: '#f59e0b', bg: '#fef3c7',
        title: 'Enviar la propuesta',
        subtitle: 'Propietario / copropietario',
        body:
          'Marca destinatarios antes de enviar. El inquilino no recibe la propuesta de adeudo del propietario.',
        tips: ['La confirmación muestra a qué correos salió.'],
      },
      {
        icon: CheckCircle2, color: '#f59e0b', bg: '#fef3c7',
        title: 'Aceptar y cobrar',
        subtitle: 'Ciclo de vida',
        body:
          'Al aceptar, los abonos de Cobranza se aplican al plan. Si se incumple, puedes cancelar. Las cuotas del plan también aparecen en el Expediente del período.',
        tips: [tipConnect('Se conecta con: Cobranza (abonos) y Estado de Cuenta (saldo).')],
      },
    ],
  },
  {
    id: 'tes-gastos',
    kind: 'modal',
    icon: ShoppingBag,
    color: '#ec4899',
    bg: '#fce7f3',
    title: 'Registro de Gastos',
    subtitle: 'Egresos del condominio',
    length: '3 pasos',
    steps: [
      {
        icon: ShoppingBag, color: '#ec4899', bg: '#fce7f3',
        title: 'Capturar un gasto',
        subtitle: 'Fecha, categoría, proveedor, evidencia',
        body:
          'Pulsa Registrar gasto: fecha, categoría, proveedor, monto y concepto. Adjunta foto o PDF del comprobante. El ojo verde indica que hay archivo.',
        tips: [tipConnect('Se conecta con: Mantenimientos, Planeación y Periodos.')],
        route: '/app/gastos',
      },
      {
        icon: Wallet, color: '#ec4899', bg: '#fce7f3',
        title: 'Cuenta bancaria vs caja chica',
        subtitle: 'De dónde salió el dinero',
        body:
          'Indica la fuente del pago. Así los saldos y el expediente del mes cuadran con la realidad.',
      },
      {
        icon: FileText, color: '#ec4899', bg: '#fce7f3',
        title: 'Editar solo en período abierto',
        subtitle: 'Auditoría',
        body:
          'Puedes corregir o eliminar mientras el mes esté abierto. Al cerrar Periodos, el gasto queda congelado.',
      },
    ],
  },
  {
    id: 'tes-caja-chica',
    kind: 'modal',
    icon: Wallet,
    color: '#8b5cf6',
    bg: '#ede9fe',
    title: 'Caja Chica',
    subtitle: 'Gastos menores en efectivo',
    length: '3 pasos',
    steps: [
      {
        icon: Wallet, color: '#8b5cf6', bg: '#ede9fe',
        title: 'Para qué sirve',
        subtitle: 'Separada de Gastos bancarios',
        body:
          'Fondo para gastos chicos del día a día (papelería, limpieza menor) en efectivo. No se mezcla con egresos de cuenta bancaria.',
        route: '/app/caja-chica',
      },
      {
        icon: ShoppingBag, color: '#8b5cf6', bg: '#ede9fe',
        title: 'Registrar un movimiento',
        subtitle: 'Descripción, monto y evidencia',
        body:
          'Elige el período, Nuevo registro: descripción, monto, forma de pago y fecha. Adjunta comprobante si lo tienes.',
      },
      {
        icon: Lock, color: '#8b5cf6', bg: '#ede9fe',
        title: 'Al cerrar el mes',
        subtitle: 'Solo lectura',
        body:
          'Con el período cerrado, caja chica queda solo lectura. Para corregir hay que reabrir (queda en bitácora). El reporte entra al Expediente.',
      },
    ],
  },
  {
    id: 'tes-estado-cuenta',
    kind: 'modal',
    icon: FileText,
    color: '#6366f1',
    bg: '#eef2ff',
    title: 'Estado de Cuenta',
    subtitle: 'Movimientos por unidad y cartera',
    length: '3 pasos',
    steps: [
      {
        icon: FileText, color: '#6366f1', bg: '#eef2ff',
        title: 'Consultar una unidad',
        subtitle: 'Cuotas, pagos y saldo',
        body:
          'Elige unidad y rango. Ves cuotas, pagos, cargos y saldo. Descarga PDF para el propietario o para el comité.',
        route: '/app/estado-cuenta',
      },
      {
        icon: TrendingDown, color: '#6366f1', bg: '#eef2ff',
        title: 'Cartera de adeudos',
        subtitle: 'Quién debe y desde cuándo',
        body:
          'Usa el reporte de adeudos para priorizar cobranza o proponer Plan de Pagos. Es la misma base que verás en el Expediente del mes.',
      },
      {
        icon: Send, color: '#6366f1', bg: '#eef2ff',
        title: 'Enviar estados de cuenta',
        subtitle: 'Masivo o individual',
        body:
          'Puedes enviar el estado del período a unidades con adeudo. Cada propietario/copropietario recibe el suyo.',
        tips: [tipConnect('Se conecta con: Cobranza, Plan de Pagos y Expediente.')],
      },
    ],
  },
  {
    id: 'tes-planeacion',
    kind: 'modal',
    icon: ClipboardCheck,
    color: '#b45309',
    bg: '#fffbeb',
    title: 'Planeación',
    subtitle: 'Presupuesto anual y obras',
    length: '2 pasos',
    steps: [
      {
        icon: ClipboardCheck, color: '#b45309', bg: '#fffbeb',
        title: 'Presupuesto del año',
        subtitle: 'Planeado vs ejecutado',
        body:
          'Arma el presupuesto por rubro. Conforme se registran gastos, ves lo ejecutado. Detecta a tiempo si un rubro ya se pasó.',
        tips: [tipConnect('Se conecta con: Gastos y Asambleas.')],
        route: '/app/planeacion',
      },
      {
        icon: Wrench, color: '#b45309', bg: '#fffbeb',
        title: 'Proyectos de obra',
        subtitle: 'Avance y montos',
        body:
          'Registra proyectos (fachada, cisterna…) con montos y avance. Contrasta con gastos reales para reportar en asamblea.',
      },
    ],
  },
  {
    id: 'tes-cierre',
    kind: 'modal',
    icon: Lock,
    color: '#8b5cf6',
    bg: '#ede9fe',
    title: 'Periodos y Expediente',
    subtitle: 'Cerrar el mes y respaldar documentos',
    length: '4 pasos',
    steps: [
      {
        icon: Lock, color: '#8b5cf6', bg: '#ede9fe',
        title: 'Revisar antes de cerrar',
        subtitle: 'Ingresos vs egresos',
        body:
          'En Periodos → Gestión ves el resumen del mes. Confirma que no falten pagos ni gastos por capturar.',
        route: '/app/cierre-periodo',
      },
      {
        icon: ClipboardCheck, color: '#8b5cf6', bg: '#ede9fe',
        title: 'Firmas del comité',
        subtitle: 'Si el flujo está activo',
        body:
          'Al solicitar cierre, Homly notifica a los firmantes. Cada uno aprueba o rechaza desde su sesión (les llega notificación).',
      },
      {
        icon: CheckCircle2, color: '#8b5cf6', bg: '#ede9fe',
        title: 'Cerrar el período',
        subtitle: 'Queda en solo lectura',
        body:
          'Con las firmas en orden (o sin flujo), cierras el mes. Los movimientos quedan congelados. Reabrir deja huella en auditoría.',
      },
      {
        icon: FolderArchive, color: '#8b5cf6', bg: '#ede9fe',
        title: 'Expediente de Periodos',
        subtitle: 'Ver, descargar e imprimir',
        body:
          'En el tab Expediente elige el mes. Hay dos grupos: Finanzas (cierre, cobranza, gastos, caja chica, adeudos, planes, estado bancario…) y Operación (reservas, paquetería, visitas, mantenimientos). Consulta, descarga o imprime lo disponible.',
        tips: [
          'Los períodos listados empiezan en la fecha de inicio de operaciones del condominio.',
          tipConnect('Es el empaque final del mes: dinero + operación en un solo lugar.'),
        ],
      },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════
//  CONTADOR / AUDITOR
// ═══════════════════════════════════════════════════════════════
const contadorChapters = [
  {
    id: 'cont-dashboard',
    kind: 'modal',
    icon: BookOpen,
    color: '#6366f1',
    bg: '#eef2ff',
    title: 'Panel financiero',
    subtitle: 'Lectura rápida del condominio',
    length: '2 pasos',
    steps: [
      {
        icon: BookOpen, color: '#6366f1', bg: '#eef2ff',
        title: 'Dashboard económico',
        subtitle: 'KPIs del período',
        body:
          'En Dashboard ves cuotas cobradas, pendientes, gastos por categoría y panorama del mes. Cambia el período con el selector.',
        route: '/app/dashboard',
      },
      {
        icon: FileText, color: '#6366f1', bg: '#eef2ff',
        title: 'Antes del cierre',
        subtitle: 'Qué revisar',
        body:
          'Usa el dashboard como checklist: si algo no cuadra, baja a Cobranza, Gastos o Estado de Cuenta antes de firmar el cierre.',
        tips: [tipConnect('Se conecta con: Periodos (cierre) y Expediente (respaldo).')],
      },
    ],
  },
  {
    id: 'cont-reportes',
    kind: 'modal',
    icon: FileText,
    color: '#22c55e',
    bg: '#dcfce7',
    title: 'Reportes y estados de cuenta',
    subtitle: 'Unidades, adeudos y gastos',
    length: '3 pasos',
    steps: [
      {
        icon: FileText, color: '#22c55e', bg: '#dcfce7',
        title: 'Estado de cuenta por unidad',
        subtitle: 'Movimientos detallados',
        body:
          'Revisa cobros, pagos, cargos y saldo. Descarga PDF o exporta para análisis externo.',
        route: '/app/estado-cuenta',
      },
      {
        icon: TrendingDown, color: '#22c55e', bg: '#dcfce7',
        title: 'Cartera de adeudos',
        subtitle: 'Priorizar cobranza',
        body:
          'Lista unidades con saldo por antigüedad. Base para recordatorios o planes de pago.',
      },
      {
        icon: ShoppingBag, color: '#22c55e', bg: '#dcfce7',
        title: 'Gastos por categoría',
        subtitle: 'Dónde se fue el dinero',
        body:
          'Analiza egresos por categoría o proveedor. Contrasta con Planeación si hay presupuesto anual.',
        route: '/app/gastos',
      },
    ],
  },
  {
    id: 'cont-categorias',
    kind: 'modal',
    icon: Layers,
    color: '#f59e0b',
    bg: '#fef3c7',
    title: 'Categorías y conceptos',
    subtitle: 'Que los reportes salgan limpios',
    length: '2 pasos',
    steps: [
      {
        icon: Layers, color: '#f59e0b', bg: '#fef3c7',
        title: 'Categorías de gastos',
        subtitle: 'Plan de cuentas práctico',
        body:
          'Las define el admin en Configuración (luz, agua, limpieza…). Pide que reflejen la realidad del condominio para reportes claros.',
        route: '/app/config',
      },
      {
        icon: Receipt, color: '#f59e0b', bg: '#fef3c7',
        title: 'Conceptos de cobranza',
        subtitle: 'Mantenimiento, reserva, multas',
        body:
          'Separar ingresos por concepto permite ver cuánto entra por mantenimiento, fondo de reserva o extraordinarias.',
      },
    ],
  },
  {
    id: 'cont-cierre',
    kind: 'modal',
    icon: Lock,
    color: '#8b5cf6',
    bg: '#ede9fe',
    title: 'Auditoría, cierre y expediente',
    subtitle: 'Congelar el mes con evidencia',
    length: '3 pasos',
    steps: [
      {
        icon: ClipboardCheck, color: '#8b5cf6', bg: '#ede9fe',
        title: 'Checklist antes de firmar',
        subtitle: '4 puntos clave',
        body:
          '1) Pagos del mes capturados. 2) Gastos con comprobante. 3) Saldo/estado bancario conciliado. 4) Sin folios duplicados o faltantes.',
      },
      {
        icon: Lock, color: '#8b5cf6', bg: '#ede9fe',
        title: 'Firmar el cierre',
        subtitle: 'Desde Periodos',
        body:
          'Si eres firmante, te llega notificación. Firma o rechaza con comentario. El mes queda congelado al completar el flujo.',
        route: '/app/cierre-periodo',
      },
      {
        icon: FolderArchive, color: '#8b5cf6', bg: '#ede9fe',
        title: 'Expediente del período',
        subtitle: 'Respaldo financiero y operativo',
        body:
          'En Expediente descarga o imprime los PDFs del mes (finanzas y operación). Guárdalos junto con el estado bancario cargado. Si hay que reabrir, queda en bitácora.',
        tips: [tipConnect('El expediente es tu carpeta del mes para el comité y la auditoría.')],
      },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════
//  RESIDENTE
// ═══════════════════════════════════════════════════════════════
const residenteChapters = [
  {
    id: 'vec-my-unit',
    kind: 'modal',
    icon: Home,
    color: 'var(--teal-500)',
    bg: 'var(--teal-50)',
    title: 'Mi Unidad',
    subtitle: 'Tu espacio personal en Homly',
    length: '2 pasos',
    steps: [
      {
        icon: Home, color: 'var(--teal-500)', bg: 'var(--teal-50)',
        title: 'Tu panel',
        subtitle: 'Cuota, datos y avisos',
        body:
          'En Mi Unidad ves el estatus de tu cuota, datos de la unidad y avisos. Desde aquí también autorizas visitas y das seguimiento a lo tuyo.',
        route: '/app/my-unit',
      },
      {
        icon: Mail, color: 'var(--teal-500)', bg: 'var(--teal-50)',
        title: 'Actualiza tus datos',
        subtitle: 'Teléfono y contactos',
        body:
          'Mantén correo y teléfono al día: ahí llegan recibos, QR de paquetes y avisos de visitas.',
      },
    ],
  },
  {
    id: 'vec-estado-cuenta',
    kind: 'modal',
    icon: FileText,
    color: '#6366f1',
    bg: '#eef2ff',
    title: 'Estado de Cuenta',
    subtitle: 'Historial de tus pagos',
    length: '2 pasos',
    steps: [
      {
        icon: FileText, color: '#6366f1', bg: '#eef2ff',
        title: 'Ver tus movimientos',
        subtitle: 'Cuotas, pagos y cargos',
        body:
          'Consulta cuotas, pagos, cargos adicionales y saldo. Descarga PDF cuando lo necesites.',
        route: '/app/estado-cuenta',
      },
      {
        icon: TrendingDown, color: '#6366f1', bg: '#eef2ff',
        title: 'Si tienes adeudo',
        subtitle: 'Plan de pagos',
        body:
          'Administración puede proponerte un plan. Lo ves en Plan de Pagos con cada mensualidad. Mientras tanto, puedes Enviar pago con tu comprobante.',
        tips: [tipConnect('Se conecta con: Enviar pago y Plan de Pagos.')],
        route: '/app/plan-pagos',
      },
    ],
  },
  {
    id: 'vec-enviar-pago',
    kind: 'modal',
    icon: Send,
    color: '#0d9488',
    bg: '#ccfbf1',
    title: 'Enviar comprobante de pago',
    subtitle: 'Para que registren tu cuota',
    length: '2 pasos',
    steps: [
      {
        icon: Send, color: '#0d9488', bg: '#ccfbf1',
        title: 'Subir el comprobante',
        subtitle: 'Mes, archivo y nota',
        body:
          'En Enviar pago elige el mes, adjunta foto o PDF de la transferencia y, si quieres, una nota. Administración lo valida y lo captura en Cobranza.',
        route: '/app/enviar-pago',
      },
      {
        icon: CheckCircle2, color: '#0d9488', bg: '#ccfbf1',
        title: 'Estatus del envío',
        subtitle: 'Pendiente, recibido o rechazado',
        body:
          'Pendiente: en cola. Recibido: ya está en tu estado de cuenta. Rechazado: verás el motivo y puedes enviar otro.',
        tips: [tipConnect('Se conecta con: Cobranza (admin) y Estado de Cuenta (tu saldo).')],
      },
    ],
  },
  {
    id: 'vec-reservas',
    kind: 'modal',
    icon: Calendar,
    color: '#f59e0b',
    bg: '#fef3c7',
    title: 'Reservas',
    subtitle: 'Áreas comunes',
    length: '2 pasos',
    steps: [
      {
        icon: Calendar, color: '#f59e0b', bg: '#fef3c7',
        title: 'Reservar un área',
        subtitle: 'Fecha y horario',
        body:
          'Elige área, fecha y horario libres. Confirmas y queda pendiente de aprobación. Te avisamos cuando la acepten o rechacen.',
        route: '/app/reservas',
      },
      {
        icon: CheckCircle2, color: '#f59e0b', bg: '#fef3c7',
        title: 'Cancelar a tiempo',
        subtitle: 'Si cambian tus planes',
        body:
          'Puedes cancelar pendientes o aprobadas según las reglas del condominio. Revisa si piden anticipación mínima.',
      },
    ],
  },
  {
    id: 'vec-visitas',
    kind: 'modal',
    icon: UserCheck,
    color: '#0d9488',
    bg: '#ccfbf1',
    title: 'Visitas Autorizadas',
    subtitle: 'Familiares, personal y visitas',
    length: '3 pasos',
    steps: [
      {
        icon: UserCheck, color: '#0d9488', bg: '#ccfbf1',
        title: 'Autorizar desde tu unidad',
        subtitle: 'Permanente u ocasional',
        body:
          'Registra a la persona con correo y celular. Ocasional: llegada estimada. Permanente: cantidad de visitas o indefinido, con vigencia. Recibe el QR por correo.',
        route: '/app/visitas',
      },
      {
        icon: QrCode, color: '#0d9488', bg: '#ccfbf1',
        title: 'Cómo entra y sale',
        subtitle: 'QR o identificación',
        body:
          'En caseta escanean el QR. Sin QR: identificación con el mismo nombre + foto de evidencia. Vehículo: foto, placa y cajón/gafete.',
      },
      {
        icon: Bell, color: '#0d9488', bg: '#ccfbf1',
        title: 'Avisos de ingreso y salida',
        subtitle: 'A los contactos de tu unidad',
        body:
          'Al confirmar, vigilancia elige a quién avisar. El correo trae folio, visitante, hora y fotos.',
      },
    ],
  },
  {
    id: 'vec-paqueteria',
    kind: 'modal',
    icon: Package,
    color: '#0f766e',
    bg: '#ccfbf1',
    title: 'Recoger un paquete',
    subtitle: 'Aviso, QR y entrega en caseta',
    length: '2 pasos',
    steps: [
      {
        icon: Bell, color: '#0f766e', bg: '#ccfbf1',
        title: 'Cuando llega tu paquete',
        subtitle: 'Correo y notificación',
        body:
          'Caseta registra con foto. Te llega correo (y aviso en Homly) con folio, foto y QR.',
        route: '/app/paqueteria',
      },
      {
        icon: QrCode, color: '#0f766e', bg: '#ccfbf1',
        title: 'Recoger en caseta',
        subtitle: 'Muestra el QR o firma',
        body:
          'Muestra el QR del correo. Debe ser el de ese paquete. Si no lo tienes, puedes firmar en la tablet de vigilancia.',
      },
    ],
  },
  {
    id: 'vec-asambleas',
    kind: 'modal',
    icon: Vote,
    color: '#0d9488',
    bg: '#ccfbf1',
    title: 'Asambleas',
    subtitle: 'Convocatoria y documentos',
    length: '2 pasos',
    steps: [
      {
        icon: Vote, color: '#0d9488', bg: '#ccfbf1',
        title: 'Ver la convocatoria',
        subtitle: 'Fecha, lugar y orden del día',
        body:
          'Cuando emiten una asamblea te llega aviso. En Asambleas ves tipo, fecha, lugar, orden del día y documentos.',
        route: '/app/asambleas',
      },
      {
        icon: FileText, color: '#0d9488', bg: '#ccfbf1',
        title: 'Poderes y acuerdos',
        subtitle: 'Si no puedes asistir',
        body:
          'Si hay cartas poder, se registran en la misma asamblea. Después consultas minuta y acta.',
      },
    ],
  },
  {
    id: 'vec-notificaciones',
    kind: 'modal',
    icon: Bell,
    color: 'var(--coral-500)',
    bg: 'var(--coral-50)',
    title: 'Notificaciones',
    subtitle: 'Avisos del condominio',
    length: '1 paso',
    steps: [
      {
        icon: Bell, color: 'var(--coral-500)', bg: 'var(--coral-50)',
        title: 'Centro de avisos',
        subtitle: 'Pagos, paquetes, visitas y más',
        body:
          'Aquí llegan recordatorios de pago, reservas, paquetes, visitas y convocatorias. Marca como leído lo que ya revisaste.',
        route: '/app/notificaciones',
      },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════
//  VIGILANTE
// ═══════════════════════════════════════════════════════════════
const vigilanteChapters = [
  {
    id: 'vig-paquetes',
    kind: 'modal',
    icon: Package,
    color: '#0f766e',
    bg: '#ccfbf1',
    title: 'Paquetes en caseta',
    subtitle: 'Recibir, avisar y entregar',
    length: '3 pasos',
    steps: [
      {
        icon: Package, color: '#0f766e', bg: '#ccfbf1',
        title: 'Recibir el paquete',
        subtitle: 'Unidad, foto y folio',
        body:
          'Paquetería → Recibir paquete: elige la casa, toma la foto y guarda. Se asigna folio del año. Después eliges a quién avisar.',
        route: '/app/paqueteria',
      },
      {
        icon: QrCode, color: '#0f766e', bg: '#ccfbf1',
        title: 'Entregar al destinatario',
        subtitle: 'Escanear o firmar',
        body:
          'Abre el paquete en En vigilancia o usa Escanear QR. El código del correo debe ser el de ese paquete. También puedes pedir firma en pantalla.',
        tips: ['El campo del QR no se teclea: solo se reemplaza al escanear.'],
      },
      {
        icon: FileText, color: '#0f766e', bg: '#ccfbf1',
        title: 'Reporte del turno',
        subtitle: 'Resumen y PDF',
        body:
          'Con Reporte eliges el periodo y descargas PDF. Administración también lo usa en el Expediente del mes.',
        tips: [tipConnect('Se conecta con: Notificaciones del vecino y Periodos → Expediente.')],
      },
    ],
  },
  {
    id: 'vig-visitas',
    kind: 'modal',
    icon: UserCheck,
    color: '#0d9488',
    bg: '#ccfbf1',
    title: 'Ingreso y salida de visitas',
    subtitle: 'Bitácora, QR e identificación',
    length: '3 pasos',
    steps: [
      {
        icon: UserCheck, color: '#0d9488', bg: '#ccfbf1',
        title: 'Localizar la autorización',
        subtitle: 'Por unidad o por QR',
        body:
          'Abre la bitácora de la unidad o Escanear QR. Confirma nombre, folio, vigencia y anfitrión.',
        route: '/app/visitas',
      },
      {
        icon: Camera, color: '#0d9488', bg: '#ccfbf1',
        title: 'Registrar ingreso o salida',
        subtitle: 'QR, foto de ID y vehículo',
        body:
          'Escanea el QR de la autorización. Sin QR: ID con el mismo nombre + foto (no te quedes con el documento). Auto: foto, placa y cajón/gafete. Elige a quién avisar.',
        tips: ['El QR de un paquete no sirve para una visita, ni al revés.'],
      },
      {
        icon: FileText, color: '#0d9488', bg: '#ccfbf1',
        title: 'Reporte de visitas',
        subtitle: 'Cierre de turno',
        body:
          'En Reporte ves ingresos y salidas del periodo y descargas PDF para bitácora o administración.',
      },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════
//  Exportación
// ═══════════════════════════════════════════════════════════════
export const GUIDE_ROLES = [
  {
    key: 'mapa',
    label: 'Mapa del condominio',
    icon: Link2,
    color: 'var(--teal-600)',
    bg: 'var(--teal-50)',
    description: 'Cómo se conectan Finanzas, Operación y Comunidad — empieza aquí',
    chapters: mapaChapters,
  },
  {
    key: 'admin',
    label: 'Administrador',
    icon: Sparkles,
    color: 'var(--teal-500)',
    bg: 'var(--teal-50)',
    description: 'Configuración, operación, comunidad, periodos y expediente',
    chapters: adminChapters,
  },
  {
    key: 'tesorero',
    label: 'Tesorero',
    icon: Wallet,
    color: '#22c55e',
    bg: '#dcfce7',
    description: 'Cobranza, egresos, planeación, cierre y expediente del mes',
    chapters: tesoreroChapters,
  },
  {
    key: 'contador',
    label: 'Contador / Auditor',
    icon: BookOpen,
    color: '#6366f1',
    bg: '#eef2ff',
    description: 'Reportes, conciliación, firmas de cierre y respaldo',
    chapters: contadorChapters,
  },
  {
    key: 'vecino',
    label: 'Residente',
    icon: Home,
    color: 'var(--coral-500)',
    bg: 'var(--coral-50)',
    description: 'Mi unidad, pagos, reservas, visitas, paquetes y asambleas',
    chapters: residenteChapters,
  },
  {
    key: 'vigilante',
    label: 'Vigilante',
    icon: Shield,
    color: '#0f766e',
    bg: '#ccfbf1',
    description: 'Caseta: paquetes, visitas y bitácora de ingresos',
    chapters: vigilanteChapters,
  },
];

export default GUIDE_ROLES;
