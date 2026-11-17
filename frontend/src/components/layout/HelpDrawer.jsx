import React, { useState, useMemo } from 'react';
import {
  X, Search, ChevronDown, ChevronRight,
  Home, Receipt, ShoppingBag, Wallet, FileText, TrendingDown,
  Lock, Settings, Newspaper, Calendar, Bell, Building2, Send,
  DollarSign, HelpCircle, BookOpen, CreditCard, BarChart2, Package, UserCheck,
  Wrench, Vote, PiggyBank, ClipboardCheck, LifeBuoy, Cpu, CalendarClock, GraduationCap, FileBarChart,
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
        a: 'Al crear o editar un gasto, haz clic en el área de "Evidencia / Comprobante". Puedes subir imágenes (JPG, PNG) o PDF hasta 10 MB. El comprobante queda vinculado al gasto. En la lista, el ícono de ojo se ve verde si hay archivo para abrir y gris (apagado) si no hay adjunto.',
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
        a: 'Ve a Caja Chica → selecciona el período → haz clic en "Nuevo Registro" → indica descripción, monto y fecha → opcionalmente adjunta un comprobante → guarda. El saldo total de caja se actualiza automáticamente. El ícono de ojo se ve verde si hay evidencia y gris si no hay archivo.',
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
    title: 'Periodos',
    subtitle: 'Gestión del mes, cierre y expediente',
    articles: [
      {
        q: '¿Cómo cerrar un período contable?',
        a: 'Ve a Periodos → pestaña Gestión → selecciona el mes → revisa el resumen (ingresos, egresos, saldo) → "Solicitar cierre". Si hay flujo de firmas, se notifica al comité; si no, el cierre se aplica de inmediato.',
      },
      {
        q: '¿Qué es el Expediente de Periodos?',
        a: 'En Periodos → Expediente eliges año/mes (desde el inicio de operaciones del condominio) y ves documentos de Finanzas (cobranza, gastos, adeudos, cierre…) y de Operación (reservas, paquetería, visitas, mantenimientos). Puedes consultarlos, descargarlos o imprimirlos como respaldo del mes.',
      },
      {
        q: '¿Qué significa que un período está cerrado?',
        a: 'Los movimientos de ese mes (pagos, gastos, caja chica) quedan en solo lectura. No se agregan ni editan. Así se protege el histórico para auditoría y el expediente del mes.',
      },
      {
        q: '¿Cómo reabrir un período cerrado?',
        a: 'Solo el administrador. En Periodos → Gestión → período cerrado → "Reabrir período" → confirma. Queda en la bitácora. Úsalo solo para corregir un error real.',
      },
      {
        q: '¿Qué es el flujo de aprobaciones?',
        a: 'Cadena de firmas antes de cerrar. Se configura en Configuración (flujo de cierre). Por ejemplo, tesorero y presidente. Cada firmante recibe notificación y puede aprobar o rechazar.',
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
      {
        q: '¿Dónde consulto el directorio de propietarios e inquilinos?',
        a: 'En Comunicación, el botón "Directorio" abre un listado de propietarios, copropietarios e inquilinos de las unidades activas (nombre, email y teléfono). Quien tenga acceso al módulo puede consultarlo, buscar, filtrar e imprimirlo o descargarlo en CSV.',
      },
    ],
  },
  {
    id: 'paqueteria',
    icon: Package,
    color: '#0f766e',
    title: 'Paquetería / Mensajería',
    subtitle: 'Recepción en caseta y entrega al destinatario',
    articles: [
      {
        q: '¿Cómo registrar un paquete que llega a vigilancia?',
        a: 'Ve a Paquetería → "Recibir paquete" → selecciona la casa → toma o adjunta la foto de evidencia → (opcional) escribe una nota → Guardar. El sistema asigna el folio del año (AAAA-####). Después elige a qué contactos de la unidad se envía el aviso por correo y en Notificaciones.',
      },
      {
        q: '¿Cómo se entrega el paquete al destinatario?',
        a: 'Abre el paquete en "En vigilancia" → Entregar y elige Código QR o Firma. Con QR, escanea el código del correo (o de la pantalla del vecino); el código no se puede escribir ni borrar a mano y debe coincidir con el paquete. Con firma, el destinatario firma en pantalla. También puedes usar "Escanear QR" en el tablero para identificar el paquete y entregarlo.',
      },
      {
        q: '¿Qué llega en el correo de aviso?',
        a: 'El correo incluye el folio, la unidad, la foto de evidencia, el código QR de entrega y, si lo configuraste, el reglamento interno. El vecino muestra el QR en caseta para recoger.',
      },
      {
        q: '¿Cómo personalizo el reglamento y los recordatorios?',
        a: 'El administrador entra a Paquetería → Personalizar. En Reglamento editas el texto que viaja en el correo. En Recordatorios puedes activar avisos automáticos si el paquete sigue en vigilancia: primer aviso, repetición y máximo de envíos.',
      },
      {
        q: '¿Quién puede eliminar un paquete?',
        a: 'Solo el administrador del condominio. Al eliminar debe escribir un comentario (motivo). El registro se borra de la bitácora y el comentario queda en el log del sistema, junto con el folio y la unidad.',
      },
      {
        q: '¿Cómo saco un reporte de paquetes?',
        a: 'En Paquetería pulsa "Reporte". Elige el periodo (este mes, mes anterior o fechas). Verás el resumen y la lista de paquetes recibidos. Desde el mismo modal puedes descargar el PDF.',
      },
    ],
  },
  {
    id: 'visitas',
    icon: UserCheck,
    color: '#0d9488',
    title: 'Visitas Autorizadas',
    subtitle: 'Permanentes, ocasionales e ingreso en caseta',
    articles: [
      {
        q: '¿Cómo autorizo una visita desde mi unidad?',
        a: 'En Mi Unidad o en Visitas Autorizadas pulsa "Autorizar visita". Captura nombres, apellidos, correo y celular. Elige ocasional (fecha y hora de llegada) o permanente (cantidad de visitas o indefinido, siempre con vigencia). Al guardar se envía un correo al visitante con el QR, los datos del condominio y las normas.',
      },
      {
        q: '¿Qué diferencia hay entre visita permanente y ocasional?',
        a: 'Ocasional es una visita temporal: se indica la llegada estimada y la vigencia cubre ese día. Permanente es para familiares, amigos recurrentes o personal de trabajo: se elige si es por un número de visitas o indefinido, y siempre se define el periodo de vigencia.',
      },
      {
        q: '¿Cómo registra vigilancia el ingreso y la salida?',
        a: 'En Visitas Autorizadas el vigilante abre la bitácora de la unidad o usa "Escanear QR". El QR debe coincidir con esa autorización; no se puede escribir ni borrar a mano. Si el visitante no trae el QR, presenta una identificación con el mismo nombre registrado. Vigilancia toma una foto de evidencia y no resguarda el documento. Al confirmar el ingreso o la salida se eligen los contactos de la unidad y se les envía un correo con los detalles y las fotos de evidencia (identificación y, si aplica, vehículo).',
      },
      {
        q: '¿Qué significa el folio de la autorización?',
        a: 'Cada registro tiene un ID único formado por el ID de la unidad, el año (AAAA) y un consecutivo de 3 dígitos, por ejemplo C-001-2026-001.',
      },
      {
        q: '¿Quién puede usar este módulo?',
        a: 'El administrador tiene acceso completo, incluida la personalización de normas. El residente autoriza visitas de su unidad. El vigilante consulta la bitácora y registra ingresos y salidas. Cualquier otro rol se habilita en Configuración → Permisos del tenant.',
      },
      {
        q: '¿Cómo indico a quién visita y qué pasa si llega en auto?',
        a: 'Al autorizar eliges a la persona del registro de la unidad (propietario, copropietario, inquilino o usuario) o escribes el nombre de otro integrante. Ese dato va en el correo y en la bitácora. Si ingresa en vehículo, vigilancia toma foto, anota la placa y asigna cajón o gafete. Cajones y gafetes se dan de alta en Configuración → Visitas.',
      },
      {
        q: '¿Cómo saco un reporte de visitas?',
        a: 'En Visitas Autorizadas pulsa "Reporte". Elige el periodo y consulta el resumen (autorizaciones, ingresos y salidas) más la lista. Desde el mismo modal puedes descargar el PDF.',
      },
    ],
  },
  {
    id: 'mantenimientos',
    icon: Wrench,
    color: '#b45309',
    title: 'Mantenimientos',
    subtitle: 'Preventivos, correctivos y evidencias',
    articles: [
      {
        q: '¿Cómo registro un mantenimiento preventivo o correctivo?',
        a: 'Ve a Mantenimientos. El preventivo es una planeación (revisión programada de un área). El correctivo documenta una falla ya ocurrida. Indica el área, quién lo realiza y el estatus. Al terminar, márcalo como Realizado.',
      },
      {
        q: '¿Cómo cargo evidencias de un trabajo?',
        a: 'Abre la ficha del trabajo (debe estar En curso o Realizado) → Cargar evidencia → elige la fecha real de las fotos (puede ser distinta al día en que las subes) → adjunta imágenes o archivos. Quedan en la línea de tiempo de esa ficha.',
      },
      {
        q: '¿Puedo ver un reporte del mantenimiento?',
        a: 'Sí. Desde la ficha pulsa "Ver reporte". Ahí están la planeación, las evidencias y las fechas. El historial se conserva aunque el período financiero ya esté cerrado.',
      },
    ],
  },
  {
    id: 'asambleas',
    icon: Vote,
    color: '#0d9488',
    title: 'Asambleas',
    subtitle: 'Convocatoria, quórum, minuta y acta',
    articles: [
      {
        q: '¿Cómo convoco una asamblea?',
        a: 'Ve a Asambleas → crea una ordinaria o extraordinaria. Homly aplica los días de anticipación y el quórum según el estado configurado en el condominio. Completa lugar, orden del día y emite la convocatoria; se notifica a la comunidad.',
      },
      {
        q: '¿Qué pasa si no hay quórum?',
        a: 'Pasa lista y registra cartas poder. Solo instalas la mesa si hay quórum. Si no se reúne, abres la segunda convocatoria con el receso que marca la normativa.',
      },
      {
        q: '¿Dónde queda la minuta y el acta?',
        a: 'En la misma asamblea registras votaciones, redactas el acta y la firman presidente y secretario. Si el acuerdo lo requiere, la marcas como protocolizada. Los documentos (convocatoria, minuta, acta) se consultan y descargan desde la ficha.',
      },
    ],
  },
  {
    id: 'planeacion',
    icon: ClipboardCheck,
    color: '#b45309',
    title: 'Planeación',
    subtitle: 'Presupuesto anual y proyectos de obra',
    articles: [
      {
        q: '¿Cómo armo el presupuesto del año?',
        a: 'Ve a Planeación e indica los rubros y montos autorizados del año. Conforme se registran gastos, ves lo ejecutado contra lo planeado. Así el comité sabe si un rubro ya se pasó.',
      },
      {
        q: '¿Cómo sigo un proyecto de obra?',
        a: 'En la misma pantalla registras el proyecto (fachada, cisterna, techumbre…) con monto y avance. Los gastos reales se contrastan con lo autorizado para reportar en asamblea.',
      },
    ],
  },
  {
    id: 'rentas_guias',
    icon: GraduationCap,
    color: '#0f766e',
    title: 'Guías de uso',
    subtitle: 'Aprende cada módulo con tutoriales interactivos',
    articles: [
      {
        q: '¿Cómo funcionan las guías?',
        a: 'Guías de uso → elige un módulo. Cada guía tiene pasos con una demo animada, texto y consejos. Puedes avanzar a tu ritmo o pulsar “Ver demo automática” para verla como un video corto.',
      },
      {
        q: '¿Puedo practicar mientras aprendo?',
        a: 'Sí. En cada paso, “Hazlo ahora” abre la pantalla real y “Guiarme en pantalla” abre una ventanita flotante que puedes arrastrar mientras usas el módulo. Al final hay un mini quiz y tu progreso se guarda.',
      },
    ],
  },
  {
    id: 'rentas_dashboard',
    icon: BarChart2,
    color: '#0f766e',
    title: 'Dashboard de propiedades',
    subtitle: 'Un vistazo a todo tu portafolio',
    articles: [
      {
        q: '¿Qué muestra el dashboard?',
        a: 'Arriba ves cuatro indicadores: ocupación, renta mensual en operación, cobranza del mes y cartera vencida. Debajo, “Requiere tu atención” lista lo urgente (cobranza vencida, contratos por vencer, mantenimiento atrasado, REPSE, rentas variables por confirmar) con un botón que te lleva directo al módulo.',
      },
      {
        q: '¿Cómo leo las pestañas?',
        a: 'Panel global es un tablero de widgets personalizable: calendario de operación, cobranza, órdenes nuevas, estado de órdenes, órdenes por m², presupuesto, proveedores y SLA. Panel de FM trae un tablero para mover órdenes entre Planeadas, En curso y Realizadas. Portafolio muestra ocupación por tipo, renta fija vs variable y unidades sin renta. Cobranza trae facturado vs cobrado, antigüedad de la deuda y quién debe más. Contratos, Mantenimiento y Comercial (CRM y Airbnb) detallan cada módulo con gráficas simples.',
      },
      {
        q: '¿Cómo uso el mapa de propiedades?',
        a: 'En el Panel global, la tarjeta “Mapa de propiedades” muestra cada propiedad con un pin de color (por estado, ocupación o tipo; la insignia roja cuenta sus pendientes). Filtra por alertas, vacantes, órdenes, solicitudes, adeudos o equipos fuera de operación, busca por nombre o ciudad y cambia entre mapa y satélite. Haz clic en un pin o en la lista para ver sus indicadores y abrir órdenes, solicitudes, activos, inspecciones, preventivo, OPEX/CAPEX o contratos ya filtrados por esa propiedad, y “Cómo llegar” abre la ruta. Las propiedades sin ubicación aparecen en la lista: “Ubicar automáticamente por dirección” las busca por su dirección, o márcalas con un clic y afina con “Mover pin”. También puedes fijar la ubicación en la ficha de la propiedad, con el mapa del formulario.',
      },
      {
        q: '¿Cómo personalizo el Panel global?',
        a: 'Pulsa “Personalizar”: arrastra las tarjetas para reordenarlas, usa el botón de tamaño para hacerlas más grandes o chicas y el ojo para ocultarlas (se recuperan desde “Widgets ocultos”). Tu diseño se guarda en este navegador. “Restablecer” regresa al original.',
      },
      {
        q: '¿Cómo oculto el menú izquierdo?',
        a: 'Con el botón de panel en el encabezado, o con Ctrl/Cmd + B. Así ganas espacio en cualquier módulo; vuelve a pulsarlo para mostrar el menú.',
      },
      {
        q: '¿Puedo ver otro mes?',
        a: 'Sí. Cambia el mes arriba a la derecha: cobranza, gasto de mantenimiento y KPIs se recalculan. La ocupación se mide al corte de ese mes (hoy si es el mes en curso).',
      },
    ],
  },
  {
    id: 'rentas_reportes',
    icon: FileBarChart,
    color: '#6d28d9',
    title: 'Reportes',
    subtitle: 'Informes a pedido, informe anual y SLA',
    articles: [
      {
        q: '¿Qué informes puedo generar?',
        a: 'Órdenes de trabajo, solicitudes, activos, contratos, cargos, pagos, gastos, inspecciones y proveedores. Filtra por fechas, propiedad o estado, elige columnas, ordena y exporta a Excel, CSV o PDF. Puedes guardar tus configuraciones favoritas (en este navegador).',
      },
      {
        q: '¿Cómo leo el informe anual?',
        a: 'Cada fila es un plan de preventivo y cada columna una semana del año. Azul: programado. Verde: realizado. Naranja: en curso. Rojo: atrasado. La semana actual se resalta y arriba ves el cumplimiento.',
      },
      {
        q: '¿Qué mide Proveedores y SLA?',
        a: 'Para cada proveedor, cuántas órdenes cerró a tiempo, cuántas se pasaron de su fecha límite y cuántas siguen vencidas, con un nivel de riesgo. Expande la fila para ver el detalle de cada orden tardía.',
      },
    ],
  },
  {
    id: 'rentas_propiedades',
    icon: Building2,
    color: '#1d4ed8',
    title: 'Inventario de propiedades',
    subtitle: 'Tipos rentables y especificaciones',
    articles: [
      {
        q: '¿Qué tipos de propiedad puedo registrar?',
        a: 'En Administrar Propiedades → Inventario eliges el tipo: residencial (casa, departamento, studio, habitación), Airbnb / corta estancia, comercial (local, oficina, consultorio, kiosco, centro o plaza comercial, edificio de oficinas), hospedaje (Airbnb, hotel), industrial (bodega, nave, patio, parque industrial) u otros (terreno, estacionamiento, salón). Cada tipo abre su propia ficha de especificaciones.',
      },
      {
        q: '¿Puedo operar una propiedad sin contrato de renta?',
        a: 'Sí. En la ficha, “Uso de la propiedad” puede ser “En renta” o “Solo operación”. Una propiedad solo operación tiene órdenes de trabajo, activos, inspecciones, preventivo y CAPEX/OPEX, pero no contratos de renta ni aparece en el Rent Roll. Si todo tu espacio opera sin rentas, actívalo en Configuración → Modo de operación.',
      },
      {
        q: '¿Qué es Multi Tenant y cómo creo espacios?',
        a: 'En la ficha de la propiedad, “Modelo de inquilinos” puede ser Single Tenant (un inquilino renta todo) o Multi Tenant (la propiedad se divide en espacios, cada uno con su inquilino). Captura Park, # Building, Submercado y Total GLA SQM; luego, desde el botón Multi de la lista, crea los espacios (local, ancla, isla, temporal, bodega, oficina, piso, bay, habitación…) uno por uno o en lote. Cada espacio tiene M², ubicación, especificaciones, contactos y el inquilino que le asignas con un contrato de renta. La ocupación se mide también en m² de GLA. Las órdenes de trabajo, solicitudes (también las del portal), equipos, planes preventivos e inspecciones se pueden ligar a un espacio con el selector “Espacio” que aparece al elegir una propiedad Multi Tenant. Cada listado tiene también un filtro por espacio, y los botones del panel del espacio abren el módulo ya filtrado. Los proyectos CAPEX, gastos OPEX y partidas de presupuesto admiten además un espacio; el Resumen de CAPEX/OPEX muestra el resultado por espacio (ingresos, OPEX, CAPEX, NOI y OPEX por m²).',
      },
      {
        q: '¿En qué se diferencian las especificaciones?',
        a: 'Una casa pide recámaras, niveles, jardín y alberca. Un Airbnb pide huéspedes, camas, noches mínimas y check-in. Un local pide frente, uso de suelo y cortina. Una bodega o nave pide altura libre, andenes, carga de piso y acceso de tráiler. Así el inventario no trata todo como un departamento.',
      },
    ],
  },
  {
    id: 'rentas_mantenimiento',
    icon: Wrench,
    color: '#0f766e',
    title: 'Órdenes de trabajo',
    subtitle: 'Preventivos, correctivos, SLA, costos y proveedores del portafolio',
    articles: [
      {
        q: '¿Cómo registro un mantenimiento de una propiedad?',
        a: 'En Administrar Propiedades → Operación → Órdenes de trabajo elige Todas, Preventivos o Correctivos → "Nuevo trabajo" → selecciona la propiedad, la categoría de servicio (plomería, eléctrico, etc.) y el tipo de trabajo. Indica fechas, prioridad, quién reportó y el proveedor. Al guardar se asigna el folio del año (AAAA-####).',
      },
      {
        q: '¿Qué diferencia hay entre preventivo y correctivo?',
        a: 'Preventivo es una revisión o servicio programado (filtros, fumigación, poda) con frecuencia y próxima fecha. Correctivo documenta una falla ya ocurrida (fuga, corto, cerradura). Ambos llevan evidencia y costo.',
      },
      {
        q: '¿Cómo administro categorías, tipos de trabajo y proveedores?',
        a: 'En Mantenimiento → Catálogos das de alta categorías de servicio y tipos de trabajo. En Proveedores registras contratistas (persona física o moral), su contacto y qué servicios cubren. Luego los asignas al crear un trabajo.',
      },
      {
        q: '¿Qué es el expediente digital del proveedor?',
        a: 'Al crear un proveedor Homly pregunta si quieres dar de alta su expediente. Si aceptas, se abre una ficha con la información general ya capturada más contactos, ubicación, datos bancarios para pagos y documentos según sea persona física o moral (identificación, CSF, acta constitutiva, etc.). Puedes crearlo después desde el ícono de carpeta.',
      },
      {
        q: '¿Cuándo se pide el expediente REPSE?',
        a: 'Dentro del expediente, activa “Servicios especializados (REPSE)” si el proveedor prestará ese tipo de servicios. Homly solicita registro, folio, vigencia, actividades y documentos (constancia REPSE, ICSOE, SISUB, opiniones IMSS/INFONAVIT y contrato especializado).',
      },
      {
        q: '¿Cómo cargo evidencias?',
        a: 'Abre la ficha del trabajo → elige si la foto es Antes, Durante o Después → Cargar evidencia. Las fotos quedan en la bitácora de esa propiedad.',
      },
    ],
  },
  {
    id: 'rentas_solicitudes',
    icon: LifeBuoy,
    color: '#0f766e',
    title: 'Solicitudes de servicio',
    subtitle: 'Helpdesk con SLA y portal para inquilinos',
    articles: [
      {
        q: '¿Cómo recibo solicitudes de mis inquilinos?',
        a: 'En Configuración → Operación y SLA activa el portal y copia el enlace. Compártelo por WhatsApp o correo: el inquilino elige el inmueble, describe el problema y recibe un folio (SOL-AAAA-####). Sin crear cuenta. También puedes registrar solicitudes tú mismo desde Solicitudes → Nueva solicitud (teléfono, WhatsApp, presencial).',
      },
      {
        q: '¿Qué es el SLA?',
        a: 'Es el tiempo máximo que te comprometes a responder y a resolver según la prioridad. Cada solicitud nace con fecha límite de respuesta y de solución; verás si va en tiempo, por vencer o vencida. Puedes cambiar las horas en Configuración → Operación y SLA.',
      },
      {
        q: '¿Cómo convierto una solicitud en trabajo?',
        a: 'Abre la solicitud → “Crear orden de trabajo”, elige proveedor o responsable y listo: la orden hereda inmueble, equipo, prioridad y fecha límite. Cuando la orden se realiza, la solicitud pasa a resuelta; después la cierras con la calificación del cliente.',
      },
    ],
  },
  {
    id: 'rentas_preventivo',
    icon: CalendarClock,
    color: '#0f766e',
    title: 'Mantenimiento preventivo',
    subtitle: 'Planes recurrentes que generan órdenes solos',
    articles: [
      {
        q: '¿Cómo automatizo las rutinas?',
        a: 'En Preventivo crea un plan (puedes partir de plantillas: aire acondicionado, extintores, cisterna, fumigación…), define frecuencia, fecha de inicio, anticipación y lista de verificación. Cada día a las 6:00 Homly genera la orden de trabajo cuando se acerca la fecha y avanza el plan al siguiente periodo.',
      },
      {
        q: '¿Puedo generar una orden sin esperar?',
        a: 'Sí. Usa el rayo del plan para generar ahora, o “Generar órdenes pendientes” para todos los planes vencidos o próximos. Pausar un plan detiene la generación sin borrar su historial.',
      },
    ],
  },
  {
    id: 'rentas_activos',
    icon: Cpu,
    color: '#0f766e',
    title: 'Activos y equipos',
    subtitle: 'Inventario con garantía, vida útil e historial',
    articles: [
      {
        q: '¿Para qué registrar equipos?',
        a: 'Cada equipo (clima, bomba, elevador, planta, extintores…) tiene criticidad, garantía, vida útil y costo acumulado. Al ligarlo a solicitudes, órdenes y planes, ves su historial completo y detectas qué equipos fallan más o están por cumplir su vida útil.',
      },
      {
        q: '¿Cómo cambia el estado del equipo?',
        a: 'Se actualiza solo: una orden correctiva abierta lo marca en falla o mantenimiento y, al realizarse, vuelve a operativo. Puedes ajustarlo manualmente si lo necesitas.',
      },
    ],
  },
  {
    id: 'rentas_inspecciones',
    icon: ClipboardCheck,
    color: '#0f766e',
    title: 'Inspecciones',
    subtitle: 'Listas de verificación con órdenes automáticas',
    articles: [
      {
        q: '¿Cómo hago una inspección?',
        a: 'Inspecciones → Nueva inspección: elige plantilla (entrega, seguridad, áreas comunes…) e inmueble. Marca cada punto como Bien, Falla o N/A y agrega notas. Guarda el avance las veces que quieras y al completar se calcula la calificación.',
      },
      {
        q: '¿Cómo agrego fotos o archivos a una inspección?',
        a: 'En cada punto de la lista usa "Foto" (abre la cámara en el celular) o "Archivo" (PDF, Word, Excel, imágenes de hasta 20 MB); también hay evidencias generales al final. Si la plantilla marca un punto con evidencia obligatoria, debes adjuntarla para completar. Las evidencias de una falla viajan a la orden correctiva como fotos "Antes". En Plantillas puedes anexar material de referencia para el inspector.',
      },
      {
        q: '¿Qué pasa con las fallas?',
        a: 'Al completar, Homly crea una orden correctiva por cada falla, con la prioridad que marcaste y su fecha límite. Puedes desmarcar esa opción si prefieres revisarlas antes. Las plantillas se editan en la pestaña Plantillas.',
      },
    ],
  },
  {
    id: 'rentas_indicadores',
    icon: BarChart2,
    color: '#0f766e',
    title: 'Indicadores de operación',
    subtitle: 'MTTR, SLA, preventivo y costos',
    articles: [
      {
        q: '¿Qué mide el tablero?',
        a: 'Tiempo medio de reparación (MTTR), cumplimiento de SLA, cumplimiento del preventivo, proporción preventivo vs correctivo, costo de mantenimiento por categoría e inmueble, desempeño de proveedores, equipos con más fallas y ciclo de vida de activos. Cambia el periodo arriba a la derecha.',
      },
      {
        q: '¿Cómo mejoro los números?',
        a: 'Registra costos y fechas reales en cada orden, asigna proveedor y marca las órdenes como realizadas cuando terminen. Más preventivo y planes al día reducen correctivos y costos.',
      },
    ],
  },
  {
    id: 'rentas_contratos',
    icon: FileText,
    color: '#1d4ed8',
    title: 'Contratos de propiedades',
    subtitle: 'Tipos de contrato y asistente legal',
    articles: [
      {
        q: '¿Qué tipos de contrato puedo crear?',
        a: 'En Administrar Propiedades → Contratos eliges el tipo: renta de propiedad, proveedor de servicios, servicios generales, mantenimiento de inmueble, comodato, promesa de arrendamiento u otro. Cada tipo se liga a lo que corresponde: inmueble, cliente, proveedor, categoría u orden de mantenimiento.',
      },
      {
        q: '¿Cómo funciona el asistente legal?',
        a: 'Al crear un contrato Homly pregunta si quieres abrirlo. El asistente entrevista (objeto, ciudad, pagos y cláusulas), redacta el texto con los datos del espacio, te deja editarlo, lo presenta para revisión, registra firmas con acuse de nombre y lo publica. La publicación congela la versión oficial. No sustituye la revisión de un abogado.',
      },
      {
        q: '¿Los contratos de renta siguen generando cobranza?',
        a: 'Sí. Solo los de tipo “Renta de propiedad” entran al rent roll y a la generación de cargos del mes. Los de proveedor o servicios quedan en el mismo módulo, pero no mezclan la cobranza de inquilinos.',
      },
      {
        q: '¿Qué diferencia hay entre renta fija y renta variable?',
        a: 'Fija es un monto mensual pactado, con incremento anual y mora opcionales. Variable se administra con condiciones: % de ventas, INPC, tramos, ocupación (Airbnb), tarifa por m² o temporada. Homly calcula la renta vigente al corte y genera el cargo del mes con esa cifra (o el mínimo garantizado si aún no hay ventas reportadas).',
      },
    ],
  },
  {
    id: 'rentas_rentroll',
    icon: ClipboardCheck,
    color: '#0f766e',
    title: 'Rent Roll',
    subtitle: 'Detalle del portafolio al corte',
    articles: [
      {
        q: '¿Qué veo en el Rent Roll?',
        a: 'Unidad, tipo (casa, Airbnb, local, bodega…), especificaciones, inquilino, vigencia, esquema de renta (fija o variable), condiciones especiales, depósito, mercado, ocupación y cobranza. Clic en una fila abre la ficha completa. Puedes filtrar por grupo, tipo o esquema y agrupar por propietario, tipo o renta fija/variable.',
      },
      {
        q: '¿Cómo se calcula la renta variable en el corte?',
        a: 'Según las condiciones del contrato: mínimo más % de ventas, índice INPC con tope, tramo vigente, noches × ocupación, m² o temporada. Si falta el reporte (ventas o índice), Homly usa la renta base y la marca como estimada. Esa misma cifra se usa al generar el cargo del mes.',
      },
    ],
  },
  {
    id: 'rentas_capex',
    icon: PiggyBank,
    color: '#6d28d9',
    title: 'CAPEX y OPEX',
    subtitle: 'Inversión y gasto operativo del portafolio',
    articles: [
      {
        q: '¿Qué diferencia hay entre CAPEX y OPEX?',
        a: 'OPEX es el gasto de operar (mantenimiento, servicios, limpieza, seguros, predial…). CAPEX es inversión que mejora o repone el activo (remodelación, cambio de elevador, paneles solares). Homly los separa para calcular el NOI y evaluar el retorno de cada proyecto.',
      },
      {
        q: '¿Cómo ligo el mantenimiento a un proyecto CAPEX?',
        a: 'En Mantenimiento, al crear o editar una orden de trabajo, elige el "Proyecto CAPEX". Su costo se suma a la inversión del proyecto. Sin proyecto, el costo cuenta como OPEX por categoría.',
      },
      {
        q: '¿Cómo funciona el presupuesto?',
        a: 'En la pestaña Presupuesto capturas el OPEX por categoría y mes (o copias otro año). El CAPEX se presupuesta por proyecto, con un techo anual opcional. Homly muestra acumulado, real y porcentaje de uso, y avisa si te pasas.',
      },
    ],
  },
  {
    id: 'rentas_cobranza',
    icon: Receipt,
    color: '#0f766e',
    title: 'Cobranza de propiedades',
    subtitle: 'Cargos, renta variable y mora',
    articles: [
      {
        q: '¿Cómo se generan los cargos del mes?',
        a: 'En Administrar Propiedades → Cobranza pulsa “Generar mes”. Homly crea la renta de cada contrato vigente según su esquema: fija (con incremento anual si ya corrió) o variable (ventas, INPC, tramos, ocupación, m² o temporada). También agrega los conceptos recurrentes con monto. Los cargos muestran tipo de inmueble, specs y condiciones.',
      },
      {
        q: '¿Qué hago si cambia una renta variable?',
        a: 'Actualiza las condiciones en el contrato (ventas reportadas, índice, tramo, ocupación) y en Cobranza usa “Recalcular variables”. Solo toca cargos de renta pendientes o parciales. También puedes cargar un ajuste manual (complemento de ventas, depósito, servicios).',
      },
      {
        q: '¿Cómo se cobra la mora?',
        a: 'Si el contrato tiene % de mora y el cargo ya venció, aparece el botón con el monto sugerido. Homly crea un cargo aparte de mora de ese período; no se duplica si ya existe.',
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
