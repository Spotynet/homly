import React from 'react';
import {
  Wallet, Receipt, ClipboardList, Vote, Package, CalendarDays,
} from 'lucide-react';
import ServicePage from './ServicePage';
import { CondoSpaceCard } from './spaceCards';

/* Homly Residencial — administración de condominios.
   Texto público: beneficios y nombre de módulos; sin reglas, plazos ni flujos internos. */

const CFG = {
  active: 'condominios',
  tone: 'green',
  servicio: 'condominio',
  demoSubject: 'Quiero una demostración de Homly Residencial',
  seoTitle: 'Homly Residencial — Administración de condominios',
  seoDescription: 'Homly Residencial es el espacio para administrar condominios: cuotas y estado de cuenta, gastos, planeación, asambleas, paquetería y visitas. Cuentas claras para la mesa directiva y los vecinos. Prueba sin tarjeta.',

  tag: '✦ Homly Residencial · Administración de condominios',
  h1a: 'El condominio en orden,',
  h1b: 'a la vista de todos.',
  lead: 'Cuotas, gastos, comunidad y operación diaria en un solo espacio de trabajo, pensado para mesas directivas, comités y administradoras de propiedad horizontal.',
  checks: ['Cuentas claras para la mesa directiva', 'Cada vecino ve su estado de cuenta', 'Prueba sin tarjeta'],
  card: <CondoSpaceCard />,

  painTag: 'Lo que cambia',
  painTitle: 'Del “¿quién ya pagó?” a tenerlo todo claro',
  pains: [
    { before: 'Cobranza en WhatsApp y hojas de cálculo', after: 'Cuotas con recibo y saber quién ya pagó, al instante' },
    { before: 'Vecinos preguntando cuánto deben', after: 'Cada unidad consulta su saldo y sus comprobantes' },
    { before: 'Cuentas que nadie puede revisar', after: 'Gastos con comprobante y un orden que se puede auditar' },
  ],

  pillarsTag: 'Qué incluye',
  pillarsTitle: 'Todo el día a día del condominio',
  pillarsSub: 'Cada módulo resuelve una tarea concreta. Aquí te contamos qué hace; el detalle de cómo lo hace lo vemos juntos en una demostración.',
  pillars: [
    { icon: Receipt, title: 'Cobranza y estado de cuenta', desc: 'Cuotas mensuales con recibo y folio. Cada unidad ve su saldo, sus adeudos y sus comprobantes.' },
    { icon: Wallet, title: 'Gastos y caja chica', desc: 'Egresos con comprobante y categorías claras, para rendir cuentas con confianza.' },
    { icon: ClipboardList, title: 'Planeación y mantenimiento', desc: 'Presupuesto del año frente a lo real, y seguimiento de los trabajos del conjunto.' },
    { icon: Vote, title: 'Comunidad y asambleas', desc: 'Avisos, directorio y asambleas con un proceso ordenado de principio a fin.' },
    { icon: Package, title: 'Operación en caseta', desc: 'Paquetería y visitas autorizadas, con aviso al residente cuando llegan.' },
    { icon: CalendarDays, title: 'Reservas de áreas comunes', desc: 'Salón, alberca o gimnasio con calendario, para que nadie se empalme.' },
  ],
  chips: {
    label: 'Cada quien ve lo que le toca',
    items: ['Mesa directiva', 'Tesorero', 'Contador', 'Auditor', 'Vigilancia', 'Vecino'],
  },

  who: [
    { title: 'Mesa directiva o comité', desc: 'Transparencia ante la comunidad, sin pasar las noches en Excel.' },
    { title: 'Administradora profesional', desc: 'Varios condominios, cada uno por separado y a un clic.' },
    { title: 'Tesorero o contador', desc: 'Ingresos y egresos ordenados, listos para revisar.' },
    { title: 'Vecinos y residentes', desc: 'Su saldo, sus reservas y sus avisos, desde el celular.' },
  ],
  whoTitle: 'Para toda la comunidad, no solo para quien administra',

  lockedTitle: 'Y hay más, que se ve en la demostración',
  lockedSub: 'Homly Residencial tiene herramientas que resuelven los casos difíciles del condominio. Preferimos enseñártelas con un caso como el tuyo.',
  lockedItems: [
    'Automatizaciones de cobranza',
    'Controles de cierre y auditoría',
    'Convenios para adeudos',
    'Herramientas de asamblea',
    'Reportes para el comité',
    'Permisos finos por rol',
  ],

  stepsTitle: 'Listo para cobrar el mes en poco tiempo',
  steps: [
    { title: 'Registra tu condominio', desc: 'Llenas el registro. Un asesor te contacta y no pedimos tarjeta para empezar la prueba.' },
    { title: 'Cargamos unidades y cuotas contigo', desc: 'Te ayudamos a dejar el condominio listo para operar desde el primer mes.' },
    { title: 'Cobra y comparte con la comunidad', desc: 'Registras pagos, emites recibos y cada vecino consulta su estado de cuenta.' },
  ],

  faq: [
    { q: '¿Para quién es Homly Residencial?', a: 'Para mesas directivas, comités y administradoras de condominios y propiedad horizontal que quieren cuentas claras y una comunidad mejor informada.' },
    { q: '¿Los vecinos también entran?', a: 'Sí. Cada residente tiene acceso a lo suyo: su unidad, su estado de cuenta y lo que la comunidad comparte. No ve información de otros.' },
    { q: '¿Puedo llevar varios condominios?', a: 'Sí. Cada condominio es un espacio separado dentro de tu misma cuenta, con su propio equipo y sus propias cuentas.' },
    { q: '¿Funciona en el celular?', a: 'Sí, desde el navegador del teléfono o la tablet. No hay que instalar una aplicación.' },
    { q: '¿Cómo empiezo y cuánto cuesta?', a: 'Haces tu registro y hay una prueba sin tarjeta. Un asesor te asigna el plan según el tamaño de tu condominio.' },
    { q: '¿Y si también administro propiedades en renta?', a: 'Con el mismo usuario puedes activar Homly Propiedades como una segunda licencia, separada de la del condominio.' },
  ],

  other: {
    to: '/propiedades',
    title: '¿También administras propiedades en renta?',
    text: 'Con tu mismo usuario activas Homly Propiedades como una licencia aparte, con su propio plan y sus propias cuentas.',
    cta: 'Conocer Homly Propiedades',
  },
  ctaHeading: <>Pon el condominio<br />en orden este mes.</>,
  ctaSub: 'Cuéntanos cómo administras hoy. Te mostramos Homly con un caso como el tuyo y te acompañamos en la prueba.',
};

export default function CondominiosPage() {
  return <ServicePage cfg={CFG} />;
}

