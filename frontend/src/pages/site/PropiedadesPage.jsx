import React from 'react';
import {
  MapPin, FileText, Wrench, Layers, BarChart3, FileBarChart,
} from 'lucide-react';
import ServicePage from './ServicePage';
import { RentasSpaceCard } from './spaceCards';

/* Homly Propiedades — administrar propiedades (rentas y operación).
   Texto público: beneficios y nombre de módulos; sin indicadores, fórmulas ni flujos internos. */

const CFG = {
  active: 'propiedades',
  tone: 'blue',
  servicio: 'rentas',
  demoSubject: 'Quiero una demostración de Homly Propiedades',
  seoTitle: 'Homly Propiedades — Administrar propiedades en renta y operación',
  seoDescription: 'Homly Propiedades es el espacio para administrar inmuebles residenciales, comerciales e industriales: contratos, cobranza, mantenimiento, mapa del portafolio, espacios Multi Tenant y reportes con tu marca. Prueba sin tarjeta.',

  tag: '✦ Homly Propiedades · Administrar propiedades',
  h1a: 'Tu portafolio de inmuebles,',
  h1b: 'operado como un solo equipo.',
  lead: 'Contratos, cobranza, mantenimiento y una vista clara de cada propiedad. Para inmobiliarias, gestores y operadores de casas, departamentos, oficinas, locales, bodegas y naves.',
  checks: ['Del contrato al mantenimiento, en un solo lugar', 'Residencial, comercial e industrial', 'Prueba sin tarjeta'],
  card: <RentasSpaceCard />,

  painTag: 'Lo que cambia',
  painTitle: 'De muchos archivos sueltos a un portafolio bajo control',
  pains: [
    { before: 'Contratos y vencimientos en carpetas y Excel', after: 'Cada contrato ligado a su propiedad y a su vigencia' },
    { before: 'Mantenimiento por llamadas y mensajes', after: 'Cada trabajo con responsable, seguimiento y evidencia' },
    { before: 'No saber cómo va cada propiedad', after: 'Una vista del portafolio para decidir con datos' },
  ],

  pillarsTag: 'Qué incluye',
  pillarsTitle: 'Rentar y operar, en el mismo sistema',
  pillarsSub: 'Cada módulo resuelve una tarea concreta. Aquí te contamos qué hace; el detalle de cómo lo hace lo vemos juntos en una demostración.',
  pillars: [
    { icon: MapPin, title: 'Portafolio y mapa', desc: 'Todas tus propiedades en un catálogo y en un mapa, con su estado a la vista.' },
    { icon: FileText, title: 'Contratos y cobranza', desc: 'Contratos, vigencias y cobro de renta ligados a cada inmueble.' },
    { icon: Wrench, title: 'Operación y mantenimiento', desc: 'Solicitudes, órdenes de trabajo y mantenimiento preventivo, con seguimiento de proveedores.' },
    { icon: Layers, title: 'Espacios Multi Tenant', desc: 'Plazas, edificios y parques divididos en espacios, cada uno con su inquilino.' },
    { icon: BarChart3, title: 'Finanzas del portafolio', desc: 'Ocupación, ingresos, gastos e inversión por propiedad para decidir con datos.' },
    { icon: FileBarChart, title: 'Reportes con tu marca', desc: 'Informes con el logo y los datos de tu empresa, listos para compartir.' },
  ],
  chips: {
    label: 'Todo tipo de inmueble',
    items: ['Casas y departamentos', 'Locales comerciales', 'Oficinas', 'Bodegas', 'Naves industriales', 'Centros comerciales', 'Terrenos', 'Hoteles'],
  },

  who: [
    { title: 'Inmobiliarias y gestores', desc: 'Contratos, cobro y mantenimiento de la cartera de tus clientes.' },
    { title: 'Propietarios con portafolio', desc: 'Todas tus propiedades, ocupadas o vacantes, en un solo lugar.' },
    { title: 'Comercial e industrial', desc: 'Plazas, edificios de oficinas y parques con muchos espacios.' },
    { title: 'Equipos de operación', desc: 'Sedes, plantas y sucursales que se operan sin rentar.' },
  ],
  whoTitle: 'Para quien renta y para quien opera inmuebles',

  team: {
    tag: 'Tu equipo',
    title: 'Cada persona entra con el perfil que le toca',
    sub: 'Los perfiles de Homly Propiedades están pensados para la operación de inmuebles, no para condominios. Cada quien ve y hace lo de su función.',
    roles: [
      { title: 'Administración', desc: 'Dueño o director de la cuenta: configura la operación y da de alta a su equipo.' },
      { title: 'Gerencia de propiedades', desc: 'Coordina el día a día de todo el portafolio, de la renta al mantenimiento.' },
      { title: 'Comercial', desc: 'Da seguimiento a prospectos y ocupa los espacios vacantes, sin ver lo demás.' },
      { title: 'Mantenimiento y técnicos', desc: 'La coordinación asigna y da seguimiento; el técnico de campo atiende sus trabajos e inspecciones.' },
      { title: 'Finanzas y contabilidad', desc: 'Cobranza e información financiera para quien lleva el dinero y las cuentas.' },
      { title: 'Auditoría', desc: 'Consulta la operación completa, sin posibilidad de modificar nada.' },
    ],
    note: 'Los accesos de cada perfil se ajustan a la forma de trabajar de tu empresa; lo vemos contigo en la demostración.',
  },

  lockedTitle: 'Y hay más, que se ve en la demostración',
  lockedSub: 'Homly Propiedades tiene la profundidad que necesita un portafolio real. Preferimos enseñártela con un caso como el tuyo.',
  lockedItems: [
    'Tablero de operación en vivo',
    'Automatización del mantenimiento',
    'Rentabilidad por inmueble',
    'Reglas de renta a tu medida',
    'Herramientas para comercial e industrial',
    'Indicadores de desempeño',
    'Permisos a la medida de cada puesto',
  ],

  stepsTitle: 'De cero a tu portafolio operando',
  steps: [
    { title: 'Registra tu espacio', desc: 'Llenas el registro. Un asesor te contacta y no pedimos tarjeta para empezar la prueba.' },
    { title: 'Cargamos tus propiedades contigo', desc: 'Te ayudamos a dar de alta inmuebles, contratos y equipo para arrancar ordenado.' },
    { title: 'Opera y mide', desc: 'Cobras, atiendes el mantenimiento y ves cómo va cada propiedad desde el mismo lugar.' },
  ],

  faq: [
    { q: '¿Tengo que rentar mis propiedades para usarlo?', a: 'No. Sirve para inmuebles que rentas y también para los que solo operas, como oficinas propias, plantas o sucursales.' },
    { q: '¿Sirve para comercial e industrial?', a: 'Sí. Puedes dividir plazas, edificios o parques en espacios, cada uno con su inquilino, y operar cada inmueble por separado.' },
    { q: '¿Mis propiedades pueden estar fuera de México?', a: 'Sí. Puedes registrar propiedades en otros países y ubicarlas en el mapa.' },
    { q: '¿Mi equipo ve toda la información?', a: 'No. Cada persona entra con un perfil propio de la operación de propiedades (gerencia, comercial, mantenimiento, técnicos, finanzas o auditoría) y solo ve los módulos que le tocan.' },
    { q: '¿Mis inquilinos tienen que crear una cuenta?', a: 'No. Pueden reportar una incidencia con un enlace, sin crear cuenta. El resto lo opera tu equipo.' },
    { q: '¿Cómo empiezo y cuánto cuesta?', a: 'Haces tu registro y hay una prueba sin tarjeta. Un asesor te asigna el plan según el número de propiedades que vas a administrar.' },
    { q: '¿Y si también administro un condominio?', a: 'Con el mismo usuario puedes activar Homly Residencial como una segunda licencia, separada de la de propiedades.' },
  ],

  other: {
    to: '/condominios',
    title: '¿También administras condominios?',
    text: 'Con tu mismo usuario activas Homly Residencial como una licencia aparte, con su propio plan y sus propias cuentas.',
    cta: 'Conocer Homly Residencial',
  },
  ctaHeading: <>Pon tu portafolio<br />a trabajar para ti.</>,
  ctaSub: 'Cuéntanos qué administras hoy. Te mostramos Homly con un caso como el tuyo y te acompañamos en la prueba.',
};

export default function PropiedadesPage() {
  return <ServicePage cfg={CFG} />;
}
