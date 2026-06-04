import React, { useState, useMemo } from 'react';
import {
  X, Search, ChevronDown, ChevronRight,
  Home, Receipt, ShoppingBag, Wallet, FileText, TrendingDown,
  Lock, Settings, Newspaper, Calendar, Bell, Building2, Send,
  DollarSign, HelpCircle, BookOpen, CreditCard, BarChart2,
} from 'lucide-react';

// ─── Contenido de ayuda ────────────────────────────────────────────────────────
const HELP_SECTIONS = [
  {
    id: 'dashboard',
    icon: BarChart2,
    color: '#6366f1',
    title: 'Dashboard',
    subtitle: 'Panel principal con métricas del condominio',
    articles: [
      {
        q: '¿Qué muestra el Dashboard?',
        a: 'El Dashboard presenta un resumen ejecutivo del estado financiero y operativo del condominio. Incluye dos vistas: Económicos (KPIs financieros del período seleccionado) y Comunidad (ocupación, actividad reciente, reservas próximas).',
      },
      {
        q: '¿Cómo leer el Dashboard Económico?',
        a: 'Las tarjetas superiores muestran: Total cobrado (suma de pagos recibidos en el período), Total adeudado (cuotas pendientes), Total egresos (gastos registrados) y Saldo estimado. Los gráficos de barras y dona detallan el cobro por unidad y los gastos por categoría. Usa el selector de período (arriba a la derecha) para cambiar el mes que estás analizando.',
      },
      {
        q: '¿Cómo cambiar el período del Dashboard?',
        a: 'En la parte superior del Dashboard encontrarás un selector de período (formato Mes/Año). Haz clic en las flechas "‹" y "›" para navegar entre meses, o haz clic en el nombre del mes para escribir uno específico.',
      },
      {
        q: '¿Qué es el porcentaje de cobranza?',
        a: 'Indica qué fracción de las unidades han pagado su cuota en el período actual. Se calcula como (unidades pagadas + exentas) ÷ total de unidades × 100. Un valor cercano al 100% indica que la mayoría de residentes están al corriente.',
      },
    ],
  },
  {
    id: 'cobranza',
    icon: Receipt,
    color: '#22c55e',
    title: 'Cobranza Mensual',
    subtitle: 'Registro y cobro de mantenimiento',
    articles: [
      {
        q: '¿Cómo registrar un pago de mantenimiento?',
        a: 'Ve a Cobranza Mensual → selecciona el período correspondiente → haz clic en la fila de la unidad que pagó → en el modal de captura ingresa el monto recibido en el campo "Mantenimiento" y cualquier cargo adicional → selecciona la forma de pago (Efectivo, Transferencia, Cheque) → haz clic en "Guardar Pago". El sistema generará un folio automáticamente.',
      },
      {
        q: '¿Cómo funcionan los estatus de pago?',
        a: '• Pendiente: la unidad no ha hecho ningún abono al período.\n• Parcial: la unidad abonó algo pero no cubrió el monto total requerido.\n• Pagado: el abono cubre el total de cargos obligatorios.\n• Exento: la unidad fue marcada como exenta por el administrador (sin cargo de mantenimiento).',
      },
      {
        q: '¿Qué es la Deuda Anterior?',
        a: 'Son los adeudos acumulados de períodos anteriores al mes actual. Cuando abres el modal de captura de una unidad con deuda, aparece la sección "Adeudos anteriores" con el detalle de cada período pendiente. Puedes abonar a la deuda anterior capturando el monto en esa sección.',
      },
      {
        q: '¿Cómo enviar el recibo de pago al residente?',
        a: 'Después de registrar el pago, busca el folio en la lista → haz clic en el ícono de correo (✉) → confirma los destinatarios (propietario y/o copropietario) → haz clic en "Enviar". El residente recibirá un correo con el recibo en PDF adjunto.',
      },
      {
        q: '¿Cómo agregar cargos adicionales a un pago?',
        a: 'En el modal de captura de pago, debajo de los campos obligatorios encontrarás la sección "Opcionales" con los conceptos adicionales configurados (multas, recargos, cuotas extraordinarias). Ingresa el monto en cada concepto que aplique. Todos los conceptos con monto mayor a cero se incluirán en el recibo.',
      },
      {
        q: '¿Qué son los adelantos de período?',
        a: 'Cuando un residente paga por anticipado meses futuros, puedes capturar esos montos como "Adelantos". En el modal de captura, selecciona el ícono "+" junto al campo de mantenimiento y elige el período futuro al que aplica el adelanto. El saldo se acreditará automáticamente cuando llegue ese mes.',
      },
      {
        q: '¿Cómo filtrar las unidades en Cobranza?',
        a: 'Usa la barra de búsqueda para buscar por número de unidad o nombre del propietario. Los filtros de estado (Todos / Pendientes / Parciales / Pagados / Exentos) permiten ver solo las unidades en cada situación. El contador superior muestra el resumen de cada categoría.',
      },
    ],
  },
  {
    id: 'gastos',
    icon: ShoppingBag,
    color: '#ec4899',
    title: 'Gastos',
    subtitle: 'Gestión de egresos del condominio',
    articles: [
      {
        q: '¿Cómo registrar un gasto?',
        a: 'Ve a Gastos → selecciona el período → haz clic en "Nuevo Gasto" → llena: concepto/categoría, monto, fecha del gasto, proveedor (opcional), forma de pago y si el gasto ya fue conciliado con el banco. Opcionalmente adjunta la foto o PDF del comprobante → haz clic en "Guardar".',
      },
      {
        q: '¿Qué diferencia hay entre Gastos Conciliados y En Tránsito?',
        a: '• Gastos Conciliados: el pago ya se reflejó en la cuenta bancaria o fue pagado en efectivo y está verificado. Estos aparecen en los reportes de egresos del período.\n• Gastos en Tránsito (No Conciliados): el gasto fue comprometido pero el cargo bancario aún no se refleja. Útil para registrar facturas con pago diferido.',
      },
      {
        q: '¿Cómo adjuntar el comprobante de un gasto?',
        a: 'Al crear o editar un gasto, haz clic en el área de "Evidencia / Comprobante". Puedes subir imágenes (JPG, PNG) o PDF hasta 10 MB. El comprobante queda vinculado al gasto y puede verse desde el detalle del registro.',
      },
      {
        q: '¿Puedo editar o eliminar un gasto?',
        a: 'Sí, mientras el período esté abierto. Haz clic en el ícono de lápiz (editar) o en el ícono de papelera (eliminar) en la fila del gasto. Una vez cerrado el período contable, los gastos quedan en solo lectura y no pueden modificarse.',
      },
      {
        q: '¿Cómo imprimir el reporte de gastos?',
        a: 'En la parte superior de la pantalla de Gastos, haz clic en el ícono de impresora (🖨). Se generará un reporte PDF con todos los gastos del período seleccionado, agrupados por conciliados y en tránsito, con totales por categoría.',
      },
    ],
  },
  {
    id: 'caja_chica',
    icon: Wallet,
    color: '#8b5cf6',
    title: 'Caja Chica',
    subtitle: 'Registro de gastos menores',
    articles: [
      {
        q: '¿Qué es la Caja Chica?',
        a: 'Es un fondo para gastos menores del día a día (limpieza, papelería, pequeñas reparaciones) que se pagan en efectivo sin pasar por la cuenta bancaria. Caja Chica es independiente del módulo de Gastos para llevar un control separado.',
      },
      {
        q: '¿Cómo registrar un movimiento de Caja Chica?',
        a: 'Ve a Caja Chica → selecciona el período → haz clic en "Nuevo Registro" → indica descripción, monto y fecha → opcionalmente adjunta un comprobante → guarda. El saldo total de caja se actualiza automáticamente.',
      },
      {
        q: '¿Cómo ver el historial de Caja Chica?',
        a: 'Usa las flechas de período para navegar entre meses. Todos los movimientos del período seleccionado se muestran en la lista con fecha, descripción, monto y comprobante adjunto si existe.',
      },
    ],
  },
  {
    id: 'estado_cuenta',
    icon: FileText,
    color: '#0ea5e9',
    title: 'Estado de Cuenta',
    subtitle: 'Reportes financieros por unidad',
    articles: [
      {
        q: '¿Cómo obtener el estado de cuenta de una unidad?',
        a: 'Ve a Estado de Cuenta → selecciona la unidad en el buscador → define el rango de fechas (período desde/hasta) → el sistema mostrará todos los movimientos: cargos de mantenimiento, pagos realizados, cargos adicionales, adeudos anteriores y el saldo final.',
      },
      {
        q: '¿Cómo leer el Estado de Cuenta?',
        a: 'El estado de cuenta muestra una tabla con:\n• Período: el mes al que corresponde cada movimiento.\n• Cargo: el monto que se cobró (cuota de mantenimiento + extras).\n• Pagado: el monto efectivamente abonado por el residente.\n• Saldo: la diferencia (negativo = a favor del residente; positivo = adeudo pendiente).\nAl final aparece el saldo total acumulado.',
      },
      {
        q: '¿Cómo enviar el estado de cuenta por correo?',
        a: 'En la pantalla de Estado de Cuenta, selecciona la unidad y el rango → haz clic en "Enviar por correo" → confirma los destinatarios (propietario y/o copropietario). También puedes hacer un envío masivo a todas las unidades con saldo pendiente desde el botón "Envío masivo".',
      },
      {
        q: '¿Cómo descargar el estado de cuenta en PDF?',
        a: 'Una vez seleccionada la unidad y el rango de fechas, haz clic en el botón "Descargar PDF". El archivo se generará y descargará automáticamente con el estado de cuenta completo en formato imprimible.',
      },
    ],
  },
  {
    id: 'plan_pagos',
    icon: TrendingDown,
    color: '#f59e0b',
    title: 'Plan de Pagos',
    subtitle: 'Gestión de adeudos de unidades',
    articles: [
      {
        q: '¿Qué es el Plan de Pagos?',
        a: 'Es un acuerdo entre el condominio y un residente con adeudo para que pague su deuda acumulada en cuotas mensuales. Permite organizar los adeudos sin bloquear la relación con el residente.',
      },
      {
        q: '¿Cómo proponer un plan de pagos a una unidad?',
        a: 'Ve a Plan de Pagos → busca la unidad con adeudo → haz clic en "Proponer plan" → define el número de mensualidades y el monto por cuota (el sistema calcula el resto) → haz clic en "Guardar propuesta". El plan queda en estado "Propuesto" hasta que el residente lo acepte.',
      },
      {
        q: '¿Cómo enviar la propuesta al residente?',
        a: 'Desde el detalle del plan en estado "Propuesto", haz clic en "Enviar propuesta". Selecciona si el correo va al propietario, copropietario o ambos → confirma. El residente recibirá un correo con el detalle del plan.',
      },
      {
        q: '¿Cómo se aplican los abonos al plan activo?',
        a: 'Una vez que el plan está en estado "Aceptado", los pagos capturados en Cobranza Mensual se aplican automáticamente a las cuotas del plan, en el orden establecido. No es necesario hacer ajustes manuales.',
      },
      {
        q: '¿Qué pasa si el residente no cumple el plan?',
        a: 'Puedes cancelar el plan en cualquier momento desde el detalle → "Cancelar plan". El adeudo vuelve a aparecer como deuda acumulada normal. Puedes proponer un nuevo plan cuando lo decidas.',
      },
    ],
  },
  {
    id: 'cierre',
    icon: Lock,
    color: '#8b5cf6',
    title: 'Cierre de Período',
    subtitle: 'Cierre y aprobación contable',
    articles: [
      {
        q: '¿Cómo cerrar un período contable?',
        a: 'Ve a Cierre de Período → selecciona el mes a cerrar → revisa el resumen (ingresos, egresos, saldo final) → si todo está correcto, haz clic en "Solicitar cierre". Si hay un flujo de aprobaciones configurado, el sistema notificará a los firmantes. Si no hay flujo, el cierre se procesa de inmediato.',
      },
      {
        q: '¿Qué significa que un período está cerrado?',
        a: 'Todos los movimientos de ese mes (pagos, gastos, caja chica) quedan en modo de solo lectura. No se pueden agregar, editar ni eliminar registros. Esto garantiza la integridad del histórico financiero para auditoría.',
      },
      {
        q: '¿Cómo reabrir un período cerrado?',
        a: 'Solo el administrador puede reabrir un período. Ve a Cierre de Período → selecciona el período cerrado → haz clic en "Reabrir período" → confirma. La acción queda registrada en la bitácora de auditoría. Úsalo solo cuando sea estrictamente necesario corregir un error.',
      },
      {
        q: '¿Qué es el flujo de aprobaciones?',
        a: 'Es una cadena de firmas obligatorias antes de cerrar el período. Se configura en Configuración → Flujos → Flujo de Cierre de Período. Por ejemplo, puedes requerir que el tesorero y el presidente aprueben antes de cerrar. Cada aprobador recibe una notificación y puede firmar o rechazar desde su sesión.',
      },
    ],
  },
  {
    id: 'config',
    icon: Settings,
    color: '#64748b',
    title: 'Configuración',
    subtitle: 'Configuración del condominio',
    articles: [
      {
        q: '¿Cómo agregar una nueva unidad?',
        a: 'Ve a Configuración → Unidades → haz clic en "Agregar unidad". Llena el número interno (ej. A-101), nombre, propietario y datos de contacto → guarda. También puedes importar múltiples unidades desde un archivo CSV usando el botón "Importar".',
      },
      {
        q: '¿Cómo invitar a un nuevo usuario al sistema?',
        a: 'Ve a Configuración → Usuarios → haz clic en "Invitar usuario". Ingresa el correo electrónico del nuevo usuario y asígnale un rol (Admin, Tesorero, Contador, Auditor, Vigilante) → envía la invitación. El usuario recibirá un correo con su contraseña provisional.',
      },
      {
        q: '¿Cómo configurar los conceptos de cobranza?',
        a: 'Ve a Configuración → Gastos y Cobranza → sección "Conceptos de cobranza". Aquí defines los cargos adicionales que aparecen en el modal de captura de pago (multas, recargos, cuotas extraordinarias). Cada concepto tiene nombre, monto sugerido y si es obligatorio u opcional.',
      },
      {
        q: '¿Cómo cambiar la cuota de mantenimiento?',
        a: 'La cuota base de mantenimiento se define por unidad. Ve a Configuración → Unidades → edita la unidad → campo "Cuota de mantenimiento". También puedes definir una cuota global que se aplica a todas las unidades desde Configuración → General → sección de Cobranza.',
      },
      {
        q: '¿Cómo configurar el logo del condominio?',
        a: 'Ve a Configuración → General → sección "Identidad". Haz clic en el área del logo para subir una imagen (PNG o JPG, recomendado 200×200 px). El logo aparecerá en los correos enviados a los residentes y en los reportes PDF.',
      },
      {
        q: '¿Cómo crear un perfil de permisos personalizados?',
        a: 'Ve a Configuración → Roles y Perfiles → sección "Perfiles personalizados" → "Agregar perfil". Define el nombre y color del perfil → selecciona qué módulos puede ver y en qué nivel (oculto, lectura, escritura). El perfil puede asignarse a cualquier usuario desde Configuración → Usuarios.',
      },
      {
        q: '¿Cómo activar o desactivar módulos del sistema?',
        a: 'Ve a Configuración → Permisos. Verás una matriz de módulos × roles. Para cada módulo y rol puedes elegir: Oculto (no aparece en el menú), Lectura (visible pero sin poder modificar) o Completo (acceso total). Los cambios aplican a todos los usuarios con ese rol al instante.',
      },
    ],
  },
  {
    id: 'comunicacion',
    icon: Newspaper,
    color: '#0d9488',
    title: 'Comunicación',
    subtitle: 'Publicaciones y avisos para la comunidad',
    articles: [
      {
        q: '¿Cómo publicar un artículo o aviso?',
        a: 'Ve a Comunicación → haz clic en "Nuevo Artículo" → elige una plantilla (Aviso, Mantenimiento, Evento, etc.) → escribe el título y contenido en el editor → define la audiencia (todos, por rol o usuarios específicos) → haz clic en "Publicar". El artículo aparecerá en el tablero de todos los usuarios con acceso.',
      },
      {
        q: '¿Cómo agregar una imagen de portada?',
        a: 'En el editor del artículo, a la derecha del área de contenido encontrarás la sección "Portada". Haz clic en "Cambiar imagen" para subir una foto desde tu dispositivo. También puedes elegir entre los gradientes de color predefinidos si prefieres no usar imagen.',
      },
      {
        q: '¿Cómo controlar quién ve un artículo?',
        a: 'En el paso de publicación, selecciona la "Audiencia": Todos los usuarios (todos los miembros del condominio), Por tipo de usuario (elige qué roles lo ven) o Usuarios específicos (selecciona personas individuales). Los artículos con audiencia restringida solo son visibles para los usuarios seleccionados.',
      },
      {
        q: '¿Los residentes pueden comentar y reaccionar?',
        a: 'Sí. Los residentes pueden dejar reacciones (👍 Me gusta, ❤️ Me encanta, 👏 Aplauso, 💡 Buena idea) en cualquier artículo publicado. Solo pueden tener una reacción activa por artículo. Los comentarios se muestran al final del artículo.',
      },
    ],
  },
  {
    id: 'reservas',
    icon: Calendar,
    color: '#f59e0b',
    title: 'Reservas',
    subtitle: 'Reserva de áreas comunes',
    articles: [
      {
        q: '¿Cómo reservar un área común?',
        a: 'Ve a Reservas → selecciona el área común (alberca, salón, gym, etc.) → elige la fecha en el calendario → selecciona el horario disponible → confirma la reserva. Tu solicitud quedará en estado "Pendiente" hasta que la administración la apruebe.',
      },
      {
        q: '¿Cómo aprobar o rechazar una reserva (admin)?',
        a: 'Ve a Reservas → pestaña "Solicitudes pendientes". Verás todas las reservas en espera de aprobación con el nombre del residente, área y horario. Haz clic en ✓ para aprobar o en ✗ para rechazar. El residente recibirá una notificación con el resultado.',
      },
      {
        q: '¿Cómo cancelar mi propia reserva?',
        a: 'Ve a Reservas → pestaña "Mis reservas" → busca la reserva activa → haz clic en "Cancelar". Revisa si el condominio tiene una política de cancelación mínima (se indica en la pantalla).',
      },
    ],
  },
  {
    id: 'notificaciones',
    icon: Bell,
    color: '#ef4444',
    title: 'Notificaciones',
    subtitle: 'Centro de avisos del condominio',
    articles: [
      {
        q: '¿Qué tipos de notificaciones existen?',
        a: 'Homly envía notificaciones automáticas para: pagos registrados, recibos enviados, propuestas de plan de pagos, aprobación/rechazo de reservas, cierre de período solicitado, recordatorios de adeudos y comunicados del administrador.',
      },
      {
        q: '¿Cómo marcar notificaciones como leídas?',
        a: 'Haz clic en el ícono de campana (🔔) en la barra superior → se abre el panel de notificaciones → haz clic en "Marcar todas como leídas" o haz clic en una notificación individual para marcarla. El contador desaparecerá cuando no haya pendientes.',
      },
    ],
  },
  {
    id: 'my_unit',
    icon: Building2,
    color: '#0d9488',
    title: 'Mi Unidad',
    subtitle: 'Vista del residente sobre su unidad',
    articles: [
      {
        q: '¿Qué información muestra Mi Unidad?',
        a: 'El panel "Mi Unidad" muestra: número y datos de tu unidad, estatus de tu cuota del mes actual (al corriente, parcial o pendiente), historial de los últimos pagos, datos de contacto del propietario y copropietario, y avisos relevantes de la administración.',
      },
      {
        q: '¿Cómo actualizar mis datos de contacto?',
        a: 'En Mi Unidad → sección "Mis datos" → haz clic en "Editar". Puedes actualizar teléfono, correo electrónico y datos del copropietario. Los cambios se reflejan de inmediato para la administración.',
      },
    ],
  },
  {
    id: 'enviar_pago',
    icon: Send,
    color: '#0d9488',
    title: 'Enviar Pago',
    subtitle: 'Envío de comprobantes de pago (residente)',
    articles: [
      {
        q: '¿Cómo enviar mi comprobante de pago?',
        a: 'Ve a Enviar Pago → haz clic en "Nuevo comprobante" → selecciona el período al que corresponde tu pago → adjunta la foto o archivo de tu comprobante (transferencia, depósito, etc.) usando "Adjuntar archivo" o "Tomar foto" → agrega una nota opcional → haz clic en "Enviar comprobante". La administración recibirá tu envío y lo revisará.',
      },
      {
        q: '¿Qué significa el estatus de mi comprobante?',
        a: '• Pendiente: tu comprobante fue recibido y está esperando revisión por parte de la administración.\n• Recibido: la administración validó tu comprobante y registró tu pago.\n• Rechazado: el comprobante no pudo ser aceptado. Verás el motivo del rechazo y podrás enviar uno nuevo.',
      },
      {
        q: '¿Cómo ver mi comprobante enviado?',
        a: 'En la sección "Mis envíos" de la pantalla de Enviar Pago, cada comprobante tiene un botón "Ver comprobante" que abre la imagen o PDF del archivo que enviaste.',
      },
    ],
  },
  {
    id: 'membresia',
    icon: CreditCard,
    color: '#8b5cf6',
    title: 'Mi Membresía',
    subtitle: 'Plan y suscripción del condominio',
    articles: [
      {
        q: '¿Cómo ver el plan de membresía actual?',
        a: 'Ve a Mi Membresía (accesible desde el menú lateral o desde la sección de Configuración). Verás el plan activo, la fecha de renovación, los módulos incluidos y el historial de facturación.',
      },
      {
        q: '¿Qué pasa si mi membresía vence?',
        a: 'Si la membresía expira, el sistema mostrará un banner de aviso. Las funciones quedan en modo lectura: puedes consultar información existente pero no registrar nuevos datos hasta renovar. Contacta a tu asesor de Homly para renovar el plan.',
      },
      {
        q: '¿Cómo solicitar un upgrade de plan?',
        a: 'En Mi Membresía → haz clic en "Ver planes disponibles" para comparar opciones. También puedes contactar al equipo de Homly directamente desde el botón "Solicitar upgrade" que aparece en los módulos no incluidos en tu plan actual.',
      },
    ],
  },
];

// ─── Componente principal ──────────────────────────────────────────────────────
export default function HelpDrawer({ open, onClose }) {
  const [search, setSearch]     = useState('');
  const [expanded, setExpanded] = useState({});

  const toggle = (id) => setExpanded(p => ({ ...p, [id]: !p[id] }));

  // Filtrado: busca en títulos de sección, subtítulos, preguntas y respuestas
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return HELP_SECTIONS;
    return HELP_SECTIONS
      .map(s => ({
        ...s,
        articles: s.articles.filter(a =>
          a.q.toLowerCase().includes(q) || a.a.toLowerCase().includes(q)
        ),
      }))
      .filter(s =>
        s.title.toLowerCase().includes(q) ||
        s.subtitle.toLowerCase().includes(q) ||
        s.articles.length > 0
      );
  }, [search]);

  // Al buscar, expandir automáticamente todas las secciones con resultados
  const sectionsToShow = useMemo(() => {
    if (!search.trim()) return filtered;
    return filtered.map(s => ({ ...s, _forceOpen: true }));
  }, [filtered, search]);

  if (!open) return null;

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(15,23,42,0.35)',
          zIndex: 1100,
          backdropFilter: 'blur(2px)',
        }}
      />

      {/* Drawer */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 'min(520px, 100vw)',
        background: '#fff',
        boxShadow: '-4px 0 32px rgba(0,0,0,0.15)',
        zIndex: 1101,
        display: 'flex', flexDirection: 'column',
        borderRadius: '16px 0 0 16px',
        overflow: 'hidden',
      }}>

        {/* Header */}
        <div style={{
          padding: '20px 24px 16px',
          background: 'linear-gradient(135deg, var(--teal-600) 0%, #0891b2 100%)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: 'rgba(255,255,255,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <HelpCircle size={20} color="#fff" />
              </div>
              <div>
                <div style={{ color: '#fff', fontWeight: 800, fontSize: 17, lineHeight: 1.2 }}>Centro de Ayuda</div>
                <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 2 }}>Guías y preguntas frecuentes de Homly</div>
              </div>
            </div>
            <button
              onClick={onClose}
              style={{
                background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8,
                width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: '#fff',
              }}>
              <X size={16} />
            </button>
          </div>

          {/* Search */}
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{
              position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
              color: 'rgba(255,255,255,0.6)', pointerEvents: 'none',
            }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar en la ayuda…"
              style={{
                width: '100%', boxSizing: 'border-box',
                padding: '9px 36px 9px 36px',
                borderRadius: 10, border: 'none',
                background: 'rgba(255,255,255,0.15)',
                color: '#fff', fontSize: 13, outline: 'none',
              }}
            />
            {search && (
              <button onClick={() => setSearch('')} style={{
                position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'rgba(255,255,255,0.7)', padding: 2,
              }}>
                <X size={13} />
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 0' }}>
          {sectionsToShow.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '56px 24px', color: 'var(--ink-400)' }}>
              <BookOpen size={40} style={{ display: 'block', margin: '0 auto 14px', opacity: 0.3 }} />
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>Sin resultados</div>
              <div style={{ fontSize: 13 }}>Intenta con otro término de búsqueda</div>
            </div>
          ) : (
            sectionsToShow.map(section => {
              const isOpen = section._forceOpen || expanded[section.id];
              const Icon = section.icon;
              return (
                <div key={section.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  {/* Section header */}
                  <button
                    onClick={() => toggle(section.id)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                      padding: '14px 24px', background: 'none', border: 'none',
                      cursor: 'pointer', textAlign: 'left',
                      transition: 'background 0.12s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                    onMouseLeave={e => e.currentTarget.style.background = 'none'}
                  >
                    <div style={{
                      width: 34, height: 34, borderRadius: 9, flexShrink: 0,
                      background: section.color + '18',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Icon size={16} color={section.color} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>{section.title}</div>
                      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>{section.articles.length} artículo{section.articles.length !== 1 ? 's' : ''} · {section.subtitle}</div>
                    </div>
                    {isOpen
                      ? <ChevronDown size={15} color="#94a3b8" style={{ flexShrink: 0 }} />
                      : <ChevronRight size={15} color="#94a3b8" style={{ flexShrink: 0 }} />}
                  </button>

                  {/* Articles */}
                  {isOpen && (
                    <div style={{ paddingBottom: 8 }}>
                      {section.articles.map((art, i) => (
                        <ArticleItem key={i} article={art} search={search} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}

          {/* Footer */}
          <div style={{
            margin: '20px 24px 12px',
            padding: '16px 20px',
            background: '#f8fafc',
            borderRadius: 12,
            border: '1px solid #e2e8f0',
          }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: '#334155', marginBottom: 4 }}>
              ¿No encontraste lo que buscas?
            </div>
            <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>
              Contacta al equipo de soporte de Homly a través de tu administrador de condominio o escríbenos directamente para obtener ayuda personalizada.
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Artículo individual con highlight de búsqueda ────────────────────────────
function ArticleItem({ article, search }) {
  const [open, setOpen] = useState(!!search);

  React.useEffect(() => { if (search) setOpen(true); }, [search]);

  const highlight = (text) => {
    if (!search.trim()) return text;
    const q = search.trim();
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark style={{ background: '#fef08a', borderRadius: 2, padding: '0 1px' }}>
          {text.slice(idx, idx + q.length)}
        </mark>
        {text.slice(idx + q.length)}
      </>
    );
  };

  return (
    <div style={{ margin: '0 24px 4px', borderRadius: 10, overflow: 'hidden', border: '1px solid #f1f5f9' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'flex-start', gap: 10,
          padding: '11px 14px', background: open ? '#f0fdf4' : '#fafafa',
          border: 'none', cursor: 'pointer', textAlign: 'left',
          borderBottom: open ? '1px solid #dcfce7' : 'none',
          transition: 'background 0.12s',
        }}
      >
        <span style={{
          marginTop: 1, flexShrink: 0,
          width: 18, height: 18, borderRadius: '50%',
          background: open ? '#22c55e' : '#e2e8f0',
          color: open ? '#fff' : '#94a3b8',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10, fontWeight: 800,
        }}>?</span>
        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#1e293b', lineHeight: 1.4 }}>
          {highlight(article.q)}
        </span>
        {open
          ? <ChevronDown size={13} color="#22c55e" style={{ flexShrink: 0, marginTop: 2 }} />
          : <ChevronRight size={13} color="#94a3b8" style={{ flexShrink: 0, marginTop: 2 }} />}
      </button>
      {open && (
        <div style={{ padding: '12px 14px 12px 42px', background: '#fff', fontSize: 13, color: '#475569', lineHeight: 1.65, whiteSpace: 'pre-line' }}>
          {highlight(article.a)}
        </div>
      )}
    </div>
  );
}
