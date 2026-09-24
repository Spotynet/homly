/**
 * guideCatalog.jsx
 * ─────────────────────────────────────────────────────────────────
 * Catálogo de capítulos de la Guía de Uso, agrupados por rol.
 * Cada capítulo tiene:
 *   - id, title, subtitle (descripción corta)
 *   - color, bg (acento visual)
 *   - icon (lucide component)
 *   - steps[] (pasos del modal GuideModal)
 *
 * El rol 'admin' incluye además un capítulo especial tipo 'interactive'
 * que NO usa GuideModal sino el AdminConfigTour (tour interactivo
 * estilo Scribe que se lanza dentro de Configuración).
 */
import React from 'react';
import {
  // Admin
  Settings, Sparkles, Users, Shield, Layers,
  // Tesorero
  Receipt, DollarSign, Wallet, TrendingDown, FileText, Send,
  // Contador
  ShoppingBag, BookOpen, Lock, ClipboardCheck, Vote,
  // Residente
  Home, Calendar, Bell, UserCheck,
  // Operación
  Package, Wrench, Newspaper, Camera, QrCode,
  // Comunes
  Building2, Globe, Mail, CheckCircle2,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════
//  ADMIN — 4 capítulos
// ═══════════════════════════════════════════════════════════════
const adminChapters = [
  {
    id: 'admin-setup',
    kind: 'interactive',         // usa AdminConfigTour
    icon: Sparkles,
    color: 'var(--teal-500)',
    bg: 'var(--teal-50)',
    title: 'Tour interactivo de Configuración',
    subtitle: 'Guía paso a paso estilo Scribe sobre la pantalla real',
    length: '~10 min',
    launchRoute: '/app/config?tour=1',
  },
  {
    id: 'admin-units',
    kind: 'modal',
    icon: Building2,
    color: '#0ea5e9',
    bg: '#e0f2fe',
    title: 'Gestión de Unidades',
    subtitle: 'Dar de alta y mantener las unidades del condominio',
    length: '4 pasos',
    steps: [
      {
        icon: Building2, color: '#0ea5e9', bg: '#e0f2fe',
        title: 'Dar de alta una unidad',
        subtitle: 'Alta individual o por lote',
        body:
          'Ve a Configuración → Unidades y usa "Agregar unidad" para capturar una a una, o "Importar" para subir un archivo con varias unidades a la vez. Cada unidad debe tener un número interno único.',
        tips: [
          'Captura el número interno de la unidad (p.ej. A-101) — aparece en reportes y en los correos.',
          'Si el propietario no tiene correo, déjalo vacío y agrégalo después.',
        ],
        route: '/app/config',
      },
      {
        icon: Mail, color: '#0ea5e9', bg: '#e0f2fe',
        title: 'Propietario, copropietario e inquilino',
        subtitle: 'Los 3 tipos de contacto por unidad',
        body:
          'Cada unidad acepta hasta 3 contactos: propietario (dueño), copropietario (segundo dueño o familiar) e inquilino (arrendatario). Los estados de cuenta y planes de pago se envían por default a propietario y copropietario.',
        tips: [
          'Los correos del propietario y copropietario reciben los cobros y recordatorios.',
          'El inquilino solo tiene acceso a su unidad desde el portal de residente.',
        ],
      },
      {
        icon: Users, color: '#0ea5e9', bg: '#e0f2fe',
        title: 'Crear usuario desde la unidad',
        subtitle: 'Alta automática de residente',
        body:
          'Desde cada unidad puedes crear un usuario residente con un solo clic. Homly enviará un correo con credenciales provisionales y el residente podrá entrar al portal para ver su unidad, pagar y reservar áreas comunes.',
      },
      {
        icon: CheckCircle2, color: '#0ea5e9', bg: '#e0f2fe',
        title: 'Inactivar sin borrar',
        subtitle: 'Conserva el historial',
        body:
          'Si una unidad cambia de dueño o deja de operar, usa "Inactivar" en lugar de eliminar. Mantienes el historial de pagos y reportes para auditoría, y la unidad queda en solo lectura.',
        tips: ['Las unidades con pagos registrados no se pueden eliminar — solo inactivar.'],
      },
    ],
  },
  {
    id: 'admin-users',
    kind: 'modal',
    icon: Users,
    color: '#f59e0b',
    bg: '#fef3c7',
    title: 'Usuarios y Permisos',
    subtitle: 'Invitar al equipo y controlar accesos',
    length: '3 pasos',
    steps: [
      {
        icon: Users, color: '#f59e0b', bg: '#fef3c7',
        title: 'Invitar usuarios al equipo',
        subtitle: 'Admin, tesorero, contador, auditor',
        body:
          'En Configuración → Usuarios, haz clic en "Invitar" para agregar a tu equipo. Cada invitación envía un correo con la contraseña provisional. El usuario deberá cambiarla en su primer ingreso.',
        route: '/app/config',
      },
      {
        icon: Shield, color: '#f59e0b', bg: '#fef3c7',
        title: 'Roles estándar vs perfiles personalizados',
        subtitle: 'Permisos a tu medida',
        body:
          'Homly trae 6 roles predefinidos. Si ninguno encaja, crea un perfil personalizado en "Roles y Perfiles" eligiendo exactamente qué módulos son visibles, de solo lectura o editables.',
        tips: [
          'Los cambios de permisos aplican al instante — no hace falta cerrar sesión.',
          'Desactiva usuarios en vez de borrarlos para conservar la auditoría.',
        ],
      },
      {
        icon: Layers, color: '#f59e0b', bg: '#fef3c7',
        title: 'Módulos del sistema',
        subtitle: 'Prende/apaga funciones completas',
        body:
          'Si tu condominio no usa Reservas, Paquetería, Visitas u otro módulo, puedes desactivarlo en Configuración → Permisos. Desaparece del menú para todos los usuarios.',
      },
    ],
  },
  {
    id: 'admin-committee',
    kind: 'modal',
    icon: Globe,
    color: '#8b5cf6',
    bg: '#ede9fe',
    title: 'Comité y Cierre de Período',
    subtitle: 'Flujo de aprobación contable',
    length: '2 pasos',
    steps: [
      {
        icon: Globe, color: '#8b5cf6', bg: '#ede9fe',
        title: 'Registrar el comité actual',
        subtitle: 'Presidente, tesorero, secretario',
        body:
          'En Configuración → Organización registra a los integrantes del comité (presidente, tesorero, secretario). Su nombre aparece en los reportes firmados y en el flujo de cierre.',
      },
      {
        icon: Lock, color: '#8b5cf6', bg: '#ede9fe',
        title: 'Flujo de cierre de período',
        subtitle: 'Quién firma antes de cerrar',
        body:
          'Activa el flujo de aprobación si quieres que el tesorero y/o presidente firmen antes de cerrar un mes contable. Si lo dejas inactivo, el admin puede cerrar directamente.',
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
    length: '4 pasos',
    steps: [
      {
        icon: Vote, color: '#0d9488', bg: '#ccfbf1',
        title: 'Convocatoria con plazo legal',
        subtitle: 'Según el estado del tenant',
        body:
          'En Asambleas crea una ordinaria o extraordinaria. Homly aplica los días de anticipación y el quórum de la entidad configurada en el condominio. Completa lugar, orden del día y emite la convocatoria; se notifica a la comunidad.',
        route: '/app/asambleas',
      },
      {
        icon: Users, color: '#0d9488', bg: '#ccfbf1',
        title: 'Reunión y quórum',
        subtitle: 'Primera y segunda convocatoria',
        body:
          'Pasa lista, registra cartas poder e instala la mesa solo si hay quórum. Si no se reúne, abre la segunda convocatoria con el receso que marca la normativa.',
        route: '/app/asambleas',
      },
      {
        icon: FileText, color: '#0d9488', bg: '#ccfbf1',
        title: 'Minuta y protocolización',
        subtitle: 'Acuerdos y firmas',
        body:
          'Registra votaciones (simple, calificada o unanimidad), redacta el acta, fírmala con presidente y secretario y, si el acuerdo lo requiere, márcala como protocolizada ante notario.',
        route: '/app/asambleas',
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
    subtitle: 'Preventivos, correctivos y evidencias',
    length: '3 pasos',
    steps: [
      {
        icon: Wrench, color: '#b45309', bg: '#fffbeb',
        title: 'Crear un trabajo',
        subtitle: 'Preventivo o correctivo',
        body:
          'En Mantenimientos abre una planeación preventiva (revisiones programadas) o un correctivo (falla ya ocurrida). Indica el área, quién lo realiza y el estatus. Al concluir, cambia a Realizado.',
        route: '/app/mantenimientos',
      },
      {
        icon: Camera, color: '#b45309', bg: '#fffbeb',
        title: 'Cargar evidencias',
        subtitle: 'Fecha real de la foto',
        body:
          'Con el trabajo En curso o Realizado, sube fotos o archivos y elige la fecha en que se tomó la evidencia (puede ser distinta al día en que la cargas). Quedan en la línea de tiempo de la ficha.',
        tips: ['Si las fotos se tomaron un día y se suben después, usa la fecha real de la evidencia.'],
      },
      {
        icon: FileText, color: '#b45309', bg: '#fffbeb',
        title: 'Reporte e historial',
        subtitle: 'Para el comité y la bitácora',
        body:
          'Desde la ficha puedes ver el reporte del trabajo. El historial conserva planeación, evidencias y fechas aunque el período financiero ya esté cerrado.',
        route: '/app/mantenimientos',
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
          'En Paquetería pulsa "Recibir paquete", elige la unidad (el nombre se ve primero, el ID después), toma la foto de evidencia y guarda. Homly asigna el folio AAAA-####. Luego eliges a qué contactos de la unidad se envía el aviso.',
        route: '/app/paqueteria',
      },
      {
        icon: Mail, color: '#0f766e', bg: '#ccfbf1',
        title: 'Aviso con QR y foto',
        subtitle: 'Lo que recibe el vecino',
        body:
          'El correo incluye folio, unidad, foto, código QR de entrega y, si lo configuraste, el reglamento. El vecino muestra ese QR en caseta; no se escribe a mano.',
      },
      {
        icon: QrCode, color: '#0f766e', bg: '#ccfbf1',
        title: 'Entregar con QR o firma',
        subtitle: 'El código debe coincidir',
        body:
          'Abre el paquete en "En vigilancia" → Entregar. Con QR, escanea con la cámara: si no es el de ese paquete, Homly avisa "El QR no corresponde a la validación del registro escaneado". Con firma, el destinatario firma en pantalla. También puedes usar "Escanear QR" en el tablero.',
        tips: ['El texto del QR es de solo lectura: solo se reemplaza al escanear de nuevo.'],
      },
      {
        icon: FileText, color: '#0f766e', bg: '#ccfbf1',
        title: 'Personalizar y reportar',
        subtitle: 'Reglamento, recordatorios y PDF',
        body:
          'En Personalizar editas el reglamento del correo y los recordatorios automáticos si el paquete sigue en vigilancia. En Reporte eliges un periodo, ves el resumen y descargas el PDF. Solo el administrador puede eliminar un paquete, con comentario para el log.',
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
          'Registra nombres, apellidos, correo y celular. Elige ocasional (llegada estimada) o permanente (cantidad de visitas o indefinido, siempre con vigencia). Indica quién recibe: alguien del registro de la unidad u otro nombre. El visitante recibe el QR y las normas por correo.',
        route: '/app/visitas',
      },
      {
        icon: Settings, color: '#0d9488', bg: '#ccfbf1',
        title: 'Cajones y gafetes',
        subtitle: 'Configuración del condominio',
        body:
          'En Configuración → Visitas das de alta cajones de visita y gafetes, y activas si se usan. En el ingreso, vigilancia asigna el que corresponda. Un cajón o gafete ocupado se marca, pero se puede elegir si hace falta.',
        route: '/app/config',
      },
      {
        icon: Camera, color: '#0d9488', bg: '#ccfbf1',
        title: 'Ingreso y salida en caseta',
        subtitle: 'QR o identificación + foto',
        body:
          'El vigilante abre la bitácora o usa "Escanear QR". El código debe ser el de esa autorización. Si no trae QR, presenta identificación con el mismo nombre; se toma foto de evidencia y no se guarda el documento. Si llega en vehículo: foto, placa y cajón o gafete.',
        tips: ['Al confirmar ingreso o salida se eligen los contactos de la unidad; reciben correo con detalles y fotos.'],
      },
      {
        icon: FileText, color: '#0d9488', bg: '#ccfbf1',
        title: 'Reporte del periodo',
        subtitle: 'Resumen y PDF',
        body:
          'En Visitas → Reporte eliges el periodo. Ves autorizaciones, ingresos, salidas y la lista. Desde el mismo popup descargas el PDF. El folio de cada visita es ID-unidad + año + consecutivo de 3 dígitos.',
        route: '/app/visitas',
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
        subtitle: 'Artículo, audiencia y portada',
        body:
          'En Comunicación crea un artículo (aviso, mantenimiento, evento…). Elige audiencia: todos, por rol o personas. Puedes poner imagen de portada o un color. Los vecinos reaccionan y comentan.',
        route: '/app/blog',
      },
      {
        icon: Users, color: '#0d9488', bg: '#ccfbf1',
        title: 'Directorio de la comunidad',
        subtitle: 'Propietarios e inquilinos',
        body:
          'El botón Directorio lista propietarios, copropietarios e inquilinos de las unidades activas (nombre, correo y teléfono). Sirve para buscar, filtrar, imprimir o bajar CSV.',
        route: '/app/blog',
      },
      {
        icon: Bell, color: '#0d9488', bg: '#ccfbf1',
        title: 'Notificaciones',
        subtitle: 'En la app y por correo',
        body:
          'Los avisos de paquetes, visitas, pagos y asambleas también llegan al centro de notificaciones. El vecino marca como leído lo que ya revisó.',
        route: '/app/notificaciones',
      },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════
//  TESORERO — 5 capítulos
// ═══════════════════════════════════════════════════════════════
const tesoreroChapters = [
  {
    id: 'tes-cobranza',
    kind: 'modal',
    icon: Receipt,
    color: '#22c55e',
    bg: '#dcfce7',
    title: 'Cobranza Mensual',
    subtitle: 'Registrar pagos de mantenimiento',
    length: '4 pasos',
    steps: [
      {
        icon: Receipt, color: '#22c55e', bg: '#dcfce7',
        title: 'Capturar un pago',
        subtitle: 'Abonos por unidad',
        body:
          'En Cobranza Mensual selecciona la unidad, elige el período (mes) al que se aplica y captura el monto. Puedes marcarlo como Efectivo, Transferencia o Cheque. Al guardar se genera un folio único.',
        route: '/app/cobranza',
      },
      {
        icon: DollarSign, color: '#22c55e', bg: '#dcfce7',
        title: 'Pagos parciales y excedentes',
        subtitle: 'Homly lleva el saldo',
        body:
          'Si la unidad abona menos de la cuota, queda pendiente. Si abona de más, el excedente se aplica automáticamente al siguiente mes. No tienes que hacer ajustes manuales.',
        tips: [
          'Un residente con adeudo previo lo paga desde el módulo de Plan de Pagos.',
          'Puedes abonar a varios meses en una sola captura.',
        ],
      },
      {
        icon: FileText, color: '#22c55e', bg: '#dcfce7',
        title: 'Cargos adicionales',
        subtitle: 'Multas, recargos, extras',
        body:
          'A cada pago puedes agregarle conceptos adicionales (multa por atraso, cuota especial, recargo). Aparecen en el recibo y en el estado de cuenta del residente.',
      },
      {
        icon: Mail, color: '#22c55e', bg: '#dcfce7',
        title: 'Enviar recibo al residente',
        subtitle: 'Al propietario y copropietario',
        body:
          'Después de capturar el pago, desde el folio puedes enviar el recibo por correo al propietario y copropietario. Se adjunta el PDF y queda registrado en el historial.',
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
    subtitle: 'Gestionar adeudos de unidades',
    length: '4 pasos',
    steps: [
      {
        icon: TrendingDown, color: '#f59e0b', bg: '#fef3c7',
        title: 'Ver unidades con adeudo',
        subtitle: 'Lista paginada',
        body:
          'El módulo muestra todas las unidades con saldo pendiente. Puedes paginar de 10, 25 o 50 en 50 y buscar por número de unidad o propietario para llegar más rápido.',
        route: '/app/plan-pagos',
      },
      {
        icon: ClipboardCheck, color: '#f59e0b', bg: '#fef3c7',
        title: 'Proponer un plan de pagos',
        subtitle: 'Mensualidades pactadas',
        body:
          'Selecciona la unidad y elige número de mensualidades, fecha de inicio y monto por mes. Homly calcula el resto. El plan queda en estado "Propuesto" hasta que el residente lo acepte.',
      },
      {
        icon: Send, color: '#f59e0b', bg: '#fef3c7',
        title: 'Enviar la propuesta por correo',
        subtitle: 'Selecciona destinatarios',
        body:
          'Antes de enviar, marca si el correo va al propietario, copropietario o a ambos. La confirmación muestra exactamente a qué direcciones se envió.',
        tips: ['El inquilino NO recibe la propuesta — solo propietario/copropietario.'],
      },
      {
        icon: CheckCircle2, color: '#f59e0b', bg: '#fef3c7',
        title: 'Aceptar, rechazar o cancelar',
        subtitle: 'Ciclo de vida del plan',
        body:
          'Cuando el residente responde, marcas el plan como Aceptado. A partir de ese momento, los abonos que capturas en Cobranza se aplican al plan automáticamente. Si se incumple, se puede cancelar.',
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
        subtitle: 'Fecha, categoría, proveedor',
        body:
          'En Gastos usa "Registrar gasto" e indica la fecha, la categoría (definida por el admin), el proveedor, el monto y un concepto descriptivo. Puedes adjuntar la foto o PDF del comprobante. En la lista, el ojo se ve verde si hay archivo y gris si no hay nada que abrir.',
        route: '/app/gastos',
      },
      {
        icon: Wallet, color: '#ec4899', bg: '#fce7f3',
        title: 'Caja chica vs cuenta bancaria',
        subtitle: 'De dónde se paga',
        body:
          'Indica si el gasto salió de la cuenta bancaria o de la caja chica. Esto mantiene separados ambos saldos para reportes y conciliación.',
      },
      {
        icon: FileText, color: '#ec4899', bg: '#fce7f3',
        title: 'Editar o eliminar',
        subtitle: 'Solo en períodos abiertos',
        body:
          'Puedes corregir o eliminar un gasto siempre que su período no esté cerrado. Una vez cerrado el mes, los movimientos quedan congelados para auditoría.',
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
    subtitle: 'Reportes por unidad',
    length: '2 pasos',
    steps: [
      {
        icon: FileText, color: '#6366f1', bg: '#eef2ff',
        title: 'Consultar por unidad',
        subtitle: 'Selector y filtros',
        body:
          'Elige una unidad y el rango de fechas para ver todos los movimientos: cuotas, pagos, cargos adicionales, saldo inicial y saldo actual. Puedes descargar el reporte en PDF.',
        route: '/app/estado-cuenta',
      },
      {
        icon: Send, color: '#6366f1', bg: '#eef2ff',
        title: 'Enviar estado de cuenta general',
        subtitle: 'A todas las unidades',
        body:
          'Con un solo clic puedes enviar el estado de cuenta del período a todas las unidades con adeudo. Cada propietario/copropietario recibe el suyo por correo.',
      },
    ],
  },
  {
    id: 'tes-cierre',
    kind: 'modal',
    icon: Lock,
    color: '#8b5cf6',
    bg: '#ede9fe',
    title: 'Cierre de Período',
    subtitle: 'Cerrar el mes contable',
    length: '3 pasos',
    steps: [
      {
        icon: Lock, color: '#8b5cf6', bg: '#ede9fe',
        title: 'Revisar antes de cerrar',
        subtitle: 'Ingresos vs egresos',
        body:
          'En Cierre de Período verás el resumen del mes: total ingresos, total egresos, saldo final. Revisa que no falten pagos por capturar antes de continuar.',
        route: '/app/cierre-periodo',
      },
      {
        icon: ClipboardCheck, color: '#8b5cf6', bg: '#ede9fe',
        title: 'Solicitar firma / aprobación',
        subtitle: 'Flujo del comité',
        body:
          'Si el admin activó el flujo de aprobación, al solicitar el cierre Homly notifica a los firmantes (por ejemplo, presidente y secretario). Cada uno firma o rechaza desde su sesión.',
      },
      {
        icon: CheckCircle2, color: '#8b5cf6', bg: '#ede9fe',
        title: 'Cerrar el período',
        subtitle: 'Queda en solo lectura',
        body:
          'Cuando todas las firmas estén en orden, cierras el período. A partir de ese momento los movimientos son solo lectura. Si se necesita corregir algo, debes reabrirlo explícitamente.',
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
        subtitle: 'Separada de Gastos',
        body:
          'La caja chica es el fondo de gastos chicos del día a día (papelería, limpieza, una reparación menor) que se pagan en efectivo. No se mezcla con los gastos que salen de la cuenta bancaria.',
        route: '/app/caja-chica',
      },
      {
        icon: ShoppingBag, color: '#8b5cf6', bg: '#ede9fe',
        title: 'Registrar un movimiento',
        subtitle: 'Descripción, monto y evidencia',
        body:
          'Elige el período, pulsa "Nuevo registro" e indica descripción, monto, forma de pago y fecha. Adjunta el comprobante si lo tienes. El ícono de ojo se ve verde cuando hay archivo y gris si no hay nada que abrir.',
      },
      {
        icon: Lock, color: '#8b5cf6', bg: '#ede9fe',
        title: 'Periodo cerrado',
        subtitle: 'Solo lectura',
        body:
          'Cuando el mes se cierra, caja chica queda en solo lectura, igual que Gastos. Para corregir hay que reabrir el período (queda en la bitácora).',
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
        subtitle: 'Lo planeado vs lo real',
        body:
          'En Planeación armas el presupuesto anual por rubro. Conforme se registran gastos, ves lo ejecutado contra lo autorizado. Así el comité sabe si un rubro ya se pasó.',
        route: '/app/planeacion',
      },
      {
        icon: Wrench, color: '#b45309', bg: '#fffbeb',
        title: 'Proyectos de obra',
        subtitle: 'Seguimiento de avances',
        body:
          'Registra proyectos (fachada, cisterna, techumbre…) con montos y avance. Los gastos reales se contrastan con lo planeado para reportar en asamblea.',
      },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════
//  CONTADOR — 4 capítulos
// ═══════════════════════════════════════════════════════════════
const contadorChapters = [
  {
    id: 'cont-dashboard',
    kind: 'modal',
    icon: BookOpen,
    color: '#6366f1',
    bg: '#eef2ff',
    title: 'Panel Financiero',
    subtitle: 'Lectura rápida del condominio',
    length: '2 pasos',
    steps: [
      {
        icon: BookOpen, color: '#6366f1', bg: '#eef2ff',
        title: 'Dashboard económico',
        subtitle: 'KPIs en vivo',
        body:
          'En Dashboard → pestaña Económicos tienes los indicadores principales: cuotas cobradas, cuotas pendientes, gastos por categoría y saldo bancario. Cambia el período con el selector superior.',
        route: '/app/dashboard',
      },
      {
        icon: FileText, color: '#6366f1', bg: '#eef2ff',
        title: 'Reporte general',
        subtitle: 'Informe mensual completo',
        body:
          'El Reporte General consolida todo el mes: ingresos por concepto, egresos por categoría, saldo inicial/final y conciliación de caja. Útil para la asamblea y auditoría.',
      },
    ],
  },
  {
    id: 'cont-reportes',
    kind: 'modal',
    icon: FileText,
    color: '#22c55e',
    bg: '#dcfce7',
    title: 'Reportes por Unidad',
    subtitle: 'Estados de cuenta y adeudos',
    length: '3 pasos',
    steps: [
      {
        icon: FileText, color: '#22c55e', bg: '#dcfce7',
        title: 'Estado de cuenta por unidad',
        subtitle: 'Movimientos detallados',
        body:
          'Revisa todos los movimientos de una unidad: qué cobró, qué no, fechas, folios, cargos adicionales. Puedes descargar en PDF o Excel para análisis externo.',
        route: '/app/estado-cuenta',
      },
      {
        icon: TrendingDown, color: '#22c55e', bg: '#dcfce7',
        title: 'Reporte de adeudos',
        subtitle: 'Unidades con saldo pendiente',
        body:
          'Obtienes la lista de todas las unidades con saldo, ordenadas por antigüedad del adeudo. Es la base para decidir a quién proponer plan de pagos o enviar recordatorio.',
      },
      {
        icon: ShoppingBag, color: '#22c55e', bg: '#dcfce7',
        title: 'Reportes de gastos',
        subtitle: 'Por categoría y por proveedor',
        body:
          'Analiza en qué se fue el dinero: agrupado por categoría (luz, agua, jardinería…) o por proveedor. Identifica tendencias y gastos fuera de control.',
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
    title: 'Categorías Contables',
    subtitle: 'Plan de cuentas del condominio',
    length: '2 pasos',
    steps: [
      {
        icon: Layers, color: '#f59e0b', bg: '#fef3c7',
        title: 'Categorías de gastos',
        subtitle: 'Define el plan de cuentas',
        body:
          'Las categorías de gastos (luz, agua, limpieza, jardinería, mantenimiento, seguridad…) las define el admin en Configuración. Como contador, apóyate en que reflejen la realidad del condominio — así los reportes salen limpios.',
        route: '/app/config',
      },
      {
        icon: Receipt, color: '#f59e0b', bg: '#fef3c7',
        title: 'Conceptos de cobranza',
        subtitle: 'Mantenimiento, reserva, multas',
        body:
          'Los conceptos de cobranza separan los ingresos: mantenimiento regular, fondo de reserva, multas, aportaciones extraordinarias. Esto permite ver cuánto entra por cada concepto.',
      },
    ],
  },
  {
    id: 'cont-cierre',
    kind: 'modal',
    icon: Lock,
    color: '#8b5cf6',
    bg: '#ede9fe',
    title: 'Auditoría y Cierre',
    subtitle: 'Congelar el período contable',
    length: '3 pasos',
    steps: [
      {
        icon: ClipboardCheck, color: '#8b5cf6', bg: '#ede9fe',
        title: 'Revisión previa al cierre',
        subtitle: 'Checklist contable',
        body:
          'Antes de recomendar el cierre, revisa: (1) todos los pagos del mes capturados; (2) todos los gastos con comprobante; (3) saldo bancario conciliado; (4) no hay folios duplicados o faltantes.',
      },
      {
        icon: Lock, color: '#8b5cf6', bg: '#ede9fe',
        title: 'Firmar el cierre',
        subtitle: 'Como parte del flujo',
        body:
          'Si estás listado como firmante en el flujo de aprobación, recibirás una notificación cuando el tesorero solicite cerrar. Puedes firmar o rechazar con comentario desde tu sesión.',
        route: '/app/cierre-periodo',
      },
      {
        icon: BookOpen, color: '#8b5cf6', bg: '#ede9fe',
        title: 'Después del cierre',
        subtitle: 'Integridad del histórico',
        body:
          'Una vez cerrado el mes, todos los movimientos quedan congelados. Si descubres un error posterior, habla con el admin para reabrir el período — queda registrado en la bitácora de auditoría.',
        route: '/app/sistema/logs',
      },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════
//  VECINO / RESIDENTE — 4 capítulos
// ═══════════════════════════════════════════════════════════════
const residenteChapters = [
  {
    id: 'vec-my-unit',
    kind: 'modal',
    icon: Home,
    color: 'var(--teal-500)',
    bg: 'var(--teal-50)',
    title: 'Mi Unidad',
    subtitle: 'Tu espacio personal',
    length: '2 pasos',
    steps: [
      {
        icon: Home, color: 'var(--teal-500)', bg: 'var(--teal-50)',
        title: 'Panel principal',
        subtitle: 'Tu casa en Homly',
        body:
          'En Mi Unidad ves el estatus de tu cuota del mes, los datos de tu unidad (número interno, propietario, inquilino), tu cuota de mantenimiento y avisos relevantes del condominio.',
        route: '/app/my-unit',
      },
      {
        icon: Mail, color: 'var(--teal-500)', bg: 'var(--teal-50)',
        title: 'Actualizar mis datos',
        subtitle: 'Teléfono, correo, contactos',
        body:
          'Puedes actualizar tu teléfono, correos de contacto y datos de copropietarios. Los cambios se reflejan al instante para la administración.',
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
        title: 'Ver mis movimientos',
        subtitle: 'Cuotas, pagos, cargos',
        body:
          'Consulta todos tus movimientos: cuotas mensuales, pagos realizados, cargos adicionales (si los hay) y tu saldo actual. Puedes descargar el reporte en PDF.',
        route: '/app/estado-cuenta',
      },
      {
        icon: TrendingDown, color: '#6366f1', bg: '#eef2ff',
        title: 'Si tengo adeudo',
        subtitle: 'Plan de pagos',
        body:
          'Si acumulas saldo pendiente, la administración puede proponerte un plan de pagos. Lo verás en el módulo Plan de Pagos con el detalle de cada mensualidad.',
        route: '/app/plan-pagos',
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
        title: 'Reservar una área común',
        subtitle: 'Alberca, salón, gym…',
        body:
          'Elige la fecha y el horario en el calendario. Si el horario está libre, confirmas y queda en estado pendiente de aprobación por la administración.',
        route: '/app/reservas',
      },
      {
        icon: CheckCircle2, color: '#f59e0b', bg: '#fef3c7',
        title: 'Cancelar una reserva',
        subtitle: 'Con anticipación',
        body:
          'Puedes cancelar tus reservas pendientes o aprobadas. Revisa si el condominio tiene políticas de cancelación con anticipación mínima.',
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
        subtitle: 'Todo lo importante',
        body:
          'Recibe avisos de la administración: recordatorios de pago, aprobación/rechazo de reservas, mantenimientos programados, convocatorias a asamblea y más. Marca como leído lo que ya revisaste.',
        route: '/app/notificaciones',
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
    subtitle: 'Familiares, personal y visitas temporales',
    length: '3 pasos',
    steps: [
      {
        icon: UserCheck, color: '#0d9488', bg: '#ccfbf1',
        title: 'Autorizar desde tu unidad',
        subtitle: 'Permanente u ocasional',
        body:
          'En Mi Unidad o Visitas Autorizadas registra a la persona (nombre, apellidos, correo y celular). Si es ocasional indica la llegada estimada. Si es permanente elige cantidad de visitas o indefinido, siempre con vigencia. El visitante recibe el QR por correo.',
        route: '/app/visitas',
      },
      {
        icon: Mail, color: '#0d9488', bg: '#ccfbf1',
        title: 'Cómo entra y sale tu visita',
        subtitle: 'QR o identificación',
        body:
          'En caseta se escanea el QR. Si no lo trae, presenta una identificación con el mismo nombre; vigilancia toma una foto de evidencia y no se queda con el documento. La salida se registra igual. Si llega en auto, se toma foto del vehículo, placa y cajón o gafete.',
      },
      {
        icon: Mail, color: '#0d9488', bg: '#ccfbf1',
        title: 'Aviso de ingreso y salida',
        subtitle: 'A los contactos de tu unidad',
        body:
          'Al confirmar el ingreso o la salida, vigilancia elige a quién avisar (propietario, copropietario, inquilino). El correo trae folio, visitante, anfitrión, hora, método y las fotos de evidencia.',
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
          'Vigilancia registra el paquete con foto. Te llega un correo (y aviso en Homly) con el folio, la foto y un QR. Si configuraron reglamento, también lo ves en el mismo mensaje.',
        route: '/app/paqueteria',
      },
      {
        icon: QrCode, color: '#0f766e', bg: '#ccfbf1',
        title: 'Recoger en caseta',
        subtitle: 'Muestra el QR o firma',
        body:
          'En caseta muestran el QR del correo (o de la pantalla). Debe ser el de ese paquete; no se escribe a mano. Si no lo tienes, puedes firmar en la tablet de vigilancia.',
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
    subtitle: 'Que administración registre tu cuota',
    length: '2 pasos',
    steps: [
      {
        icon: Send, color: '#0d9488', bg: '#ccfbf1',
        title: 'Subir el comprobante',
        subtitle: 'Periodo, archivo y nota',
        body:
          'En Enviar Pago elige el mes, adjunta la foto o PDF de la transferencia y, si quieres, una nota. Administración lo revisa y lo captura en Cobranza.',
        route: '/app/enviar-pago',
      },
      {
        icon: CheckCircle2, color: '#0d9488', bg: '#ccfbf1',
        title: 'Estatus del envío',
        subtitle: 'Pendiente, recibido o rechazado',
        body:
          'Pendiente: ya lo vieron o está en cola. Recibido: ya quedó registrado tu pago. Rechazado: verás el motivo y puedes enviar otro comprobante.',
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
          'Cuando administración emite una asamblea, te llega aviso. En Asambleas ves tipo (ordinaria o extraordinaria), fecha, lugar, orden del día y los documentos (convocatoria, minuta, acta).',
        route: '/app/asambleas',
      },
      {
        icon: FileText, color: '#0d9488', bg: '#ccfbf1',
        title: 'Poderes y acuerdos',
        subtitle: 'Si no puedes asistir',
        body:
          'Si el condominio usa cartas poder, se registran en la misma asamblea. Después puedes consultar la minuta y, si ya se protocolizó, el acta.',
      },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════
//  VIGILANTE — caseta
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
          'En Paquetería → Recibir paquete elige la casa (primero el nombre, luego el ID), toma la foto y guarda. Se asigna el folio del año. Después eliges a quién avisar de esa unidad.',
        route: '/app/paqueteria',
      },
      {
        icon: QrCode, color: '#0f766e', bg: '#ccfbf1',
        title: 'Entregar al destinatario',
        subtitle: 'Escanear o firmar',
        body:
          'Abre el paquete en "En vigilancia" o usa "Escanear QR". El código del correo debe ser el de ese paquete. Si no coincide: "El QR no corresponde a la validación del registro escaneado". También puedes pedir firma en pantalla.',
        tips: ['El campo del QR no se borra ni se teclea: solo se reemplaza al escanear.'],
      },
      {
        icon: FileText, color: '#0f766e', bg: '#ccfbf1',
        title: 'Reporte del turno',
        subtitle: 'Resumen y PDF',
        body:
          'Con el botón Reporte eliges el periodo, ves cuántos paquetes llegaron y descargas el PDF para la bitácora del turno.',
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
          'En Visitas Autorizadas abre la bitácora de la unidad o pulsa "Escanear QR". Confirma que el visitante es el de esa autorización (nombre, folio, vigencia, anfitrión).',
        route: '/app/visitas',
      },
      {
        icon: Camera, color: '#0d9488', bg: '#ccfbf1',
        title: 'Registrar ingreso o salida',
        subtitle: 'QR, foto de ID y vehículo',
        body:
          'Escanea el QR de la autorización. Si no lo trae, pide identificación con el mismo nombre, toma foto y no te quedes con el documento. Si entra en auto: foto, placa y cajón o gafete. Luego elige a qué contactos de la unidad se envía el aviso (con las fotos).',
        tips: ['El QR de un paquete no sirve para una visita, ni al revés.'],
      },
      {
        icon: FileText, color: '#0d9488', bg: '#ccfbf1',
        title: 'Reporte de visitas',
        subtitle: 'Ingresos y salidas del periodo',
        body:
          'En Reporte ves autorizaciones, ingresos y salidas del periodo y descargas el PDF. Sirve para el cierre de turno o para administración.',
      },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════
//  Exportación
// ═══════════════════════════════════════════════════════════════
export const GUIDE_ROLES = [
  {
    key: 'admin',
    label: 'Administrador',
    icon: Sparkles,
    color: 'var(--teal-500)',
    bg: 'var(--teal-50)',
    description: 'Configurar el tenant, operación (paquetes, visitas, mantenimientos) y comité',
    chapters: adminChapters,
  },
  {
    key: 'tesorero',
    label: 'Tesorero',
    icon: Wallet,
    color: '#22c55e',
    bg: '#dcfce7',
    description: 'Cobranza, gastos, caja chica, planeación y cierre mensual',
    chapters: tesoreroChapters,
  },
  {
    key: 'contador',
    label: 'Contador',
    icon: BookOpen,
    color: '#6366f1',
    bg: '#eef2ff',
    description: 'Reportes financieros, auditoría y cierre contable',
    chapters: contadorChapters,
  },
  {
    key: 'vecino',
    label: 'Residente',
    icon: Home,
    color: 'var(--coral-500)',
    bg: 'var(--coral-50)',
    description: 'Mi unidad, visitas, paquetes, reservas, pagos y asambleas',
    chapters: residenteChapters,
  },
  {
    key: 'vigilante',
    label: 'Vigilante',
    icon: Shield,
    color: '#0f766e',
    bg: '#ccfbf1',
    description: 'Caseta: paquetes, visitas autorizadas y bitácora de ingresos',
    chapters: vigilanteChapters,
  },
];

export default GUIDE_ROLES;
