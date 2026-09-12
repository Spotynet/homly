"""Normativa de asambleas según país y entidad del tenant.

Los valores son una guía operativa basada en las leyes locales más usadas
(Ley de Propiedad en Condominio / Código Civil estatal / Ley 675 en Colombia).
No sustituyen el reglamento interno ni el texto vigente; Homly los usa para
plazos, quórum y mayorías por defecto.
"""
from __future__ import annotations

from copy import deepcopy


DEFAULT_MX = {
    'country': 'México',
    'law': 'Ley de Propiedad en Condominio / Código Civil de la entidad',
    'notice_days_ordinary': 10,
    'notice_days_extraordinary': 8,
    'first_quorum_pct': 75,
    'second_quorum_pct': 51,
    'second_call_wait_minutes': 30,
    'quorum_basis': 'unidades',
    'qualified_majority_pct': 75,
    'simple_majority_pct': 50,
    'ordinary_min_per_year': 1,
    'who_can_call': 'Administrador, comité de vigilancia o al menos el 25% de los condóminos.',
    'delivery': [
        'Publicación en lugares visibles de uso común',
        'Entrega en cada unidad o medio fehaciente (correo, app, acuse)',
    ],
    'typical_ordinary_topics': [
        'Informe de administración y estados financieros',
        'Presupuesto y cuotas del ejercicio',
        'Nombramiento o ratificación de administrador y comités',
        'Asuntos generales',
    ],
    'qualified_topics': [
        'Reforma al reglamento interno',
        'Obras mayores o cambio de destino de áreas comunes',
        'Gravamen, venta o desafectación de bienes comunes',
        'Modificación de porcentajes de indiviso',
    ],
    'notes': (
        'La primera convocatoria suele exigir un quórum alto (indivisos o unidades). '
        'Si no se reúne, la segunda convocatoria se celebra tras un receso breve '
        'con un quórum menor. Confirma el reglamento del condominio.'
    ),
}

MX_STATES = {
    'Ciudad de México': {
        'law': 'Ley de Propiedad en Condominio de Inmuebles para el Distrito Federal',
        'notice_days_ordinary': 10,
        'notice_days_extraordinary': 10,
        'first_quorum_pct': 75,
        'second_quorum_pct': 51,
        'second_call_wait_minutes': 30,
        'notes': (
            'En CDMX la convocatoria se notifica con al menos 10 días naturales. '
            'La primera asamblea requiere alrededor del 75% de los indivisos; '
            'la segunda, 30 minutos después, se instala con la mayoría prevista en la ley y el reglamento.'
        ),
    },
    'Estado de México': {
        'law': 'Ley de Propiedad en Condominio de Inmuebles para el Estado de México',
        'notice_days_ordinary': 10,
        'notice_days_extraordinary': 8,
        'first_quorum_pct': 75,
        'second_quorum_pct': 51,
    },
    'Jalisco': {
        'law': 'Ley de Condominio del Estado de Jalisco',
        'notice_days_ordinary': 8,
        'notice_days_extraordinary': 5,
        'first_quorum_pct': 51,
        'second_quorum_pct': 25,
        'second_call_wait_minutes': 30,
        'notes': (
            'En Jalisco es frecuente un quórum de primera convocatoria por mayoría de condóminos '
            'y una segunda más flexible. Revisa el reglamento y la ley estatal vigente.'
        ),
    },
    'Nuevo León': {
        'law': 'Código Civil del Estado de Nuevo León y normas de copropiedad',
        'notice_days_ordinary': 10,
        'notice_days_extraordinary': 7,
        'first_quorum_pct': 51,
        'second_quorum_pct': 25,
    },
    'Quintana Roo': {
        'law': 'Ley de Propiedad en Condominio del Estado de Quintana Roo',
        'notice_days_ordinary': 10,
        'notice_days_extraordinary': 7,
        'first_quorum_pct': 75,
        'second_quorum_pct': 51,
    },
    'Puebla': {
        'law': 'Ley de Propiedad en Condominio del Estado de Puebla',
        'notice_days_ordinary': 10,
        'first_quorum_pct': 75,
        'second_quorum_pct': 51,
    },
    'Querétaro': {
        'law': 'Ley de Propiedad en Condominio del Estado de Querétaro',
        'notice_days_ordinary': 10,
        'first_quorum_pct': 75,
        'second_quorum_pct': 51,
    },
    'Guanajuato': {
        'law': 'Código Civil / normativa de condominio de Guanajuato',
        'notice_days_ordinary': 8,
        'first_quorum_pct': 51,
        'second_quorum_pct': 25,
    },
    'Yucatán': {
        'law': 'Ley de Condominios del Estado de Yucatán',
        'notice_days_ordinary': 10,
        'first_quorum_pct': 75,
        'second_quorum_pct': 51,
    },
    'Baja California': {
        'law': 'Ley de Condominios del Estado de Baja California',
        'notice_days_ordinary': 10,
        'first_quorum_pct': 51,
        'second_quorum_pct': 25,
    },
    'Baja California Sur': {
        'law': 'Normativa de condominio de Baja California Sur',
        'notice_days_ordinary': 10,
        'first_quorum_pct': 51,
        'second_quorum_pct': 25,
    },
    'Morelos': {
        'law': 'Ley de Régimen de Propiedad en Condominio del Estado de Morelos',
        'notice_days_ordinary': 8,
        'first_quorum_pct': 75,
        'second_quorum_pct': 51,
    },
    'Hidalgo': {
        'law': 'Ley de Propiedad en Condominio del Estado de Hidalgo',
        'notice_days_ordinary': 10,
        'first_quorum_pct': 75,
        'second_quorum_pct': 51,
    },
    'Veracruz': {
        'law': 'Código Civil de Veracruz y normas de copropiedad',
        'notice_days_ordinary': 10,
        'first_quorum_pct': 51,
        'second_quorum_pct': 25,
    },
    'Chihuahua': {
        'law': 'Ley de Condominio del Estado de Chihuahua',
        'notice_days_ordinary': 8,
        'first_quorum_pct': 51,
        'second_quorum_pct': 25,
    },
    'Coahuila': {
        'law': 'Normativa de condominio de Coahuila',
        'notice_days_ordinary': 8,
        'first_quorum_pct': 51,
        'second_quorum_pct': 25,
    },
    'Tamaulipas': {
        'law': 'Normativa de condominio de Tamaulipas',
        'notice_days_ordinary': 8,
        'first_quorum_pct': 51,
        'second_quorum_pct': 25,
    },
    'Sinaloa': {
        'law': 'Ley de Condominios del Estado de Sinaloa',
        'notice_days_ordinary': 8,
        'first_quorum_pct': 51,
        'second_quorum_pct': 25,
    },
    'Sonora': {
        'law': 'Normativa de condominio de Sonora',
        'notice_days_ordinary': 8,
        'first_quorum_pct': 51,
        'second_quorum_pct': 25,
    },
    'Aguascalientes': {
        'law': 'Normativa de condominio de Aguascalientes',
        'notice_days_ordinary': 8,
        'first_quorum_pct': 51,
        'second_quorum_pct': 25,
    },
    'San Luis Potosí': {
        'law': 'Normativa de condominio de San Luis Potosí',
        'notice_days_ordinary': 8,
        'first_quorum_pct': 51,
        'second_quorum_pct': 25,
    },
    'Michoacán': {
        'law': 'Normativa de condominio de Michoacán',
        'notice_days_ordinary': 8,
        'first_quorum_pct': 51,
        'second_quorum_pct': 25,
    },
    'Guerrero': {
        'law': 'Normativa de condominio de Guerrero',
        'notice_days_ordinary': 8,
        'first_quorum_pct': 51,
        'second_quorum_pct': 25,
    },
    'Oaxaca': {
        'law': 'Normativa de condominio de Oaxaca',
        'notice_days_ordinary': 8,
        'first_quorum_pct': 51,
        'second_quorum_pct': 25,
    },
    'Chiapas': {
        'law': 'Normativa de condominio de Chiapas',
        'notice_days_ordinary': 8,
        'first_quorum_pct': 51,
        'second_quorum_pct': 25,
    },
    'Tabasco': {
        'law': 'Normativa de condominio de Tabasco',
        'notice_days_ordinary': 8,
        'first_quorum_pct': 51,
        'second_quorum_pct': 25,
    },
    'Campeche': {
        'law': 'Normativa de condominio de Campeche',
        'notice_days_ordinary': 8,
        'first_quorum_pct': 51,
        'second_quorum_pct': 25,
    },
    'Colima': {
        'law': 'Normativa de condominio de Colima',
        'notice_days_ordinary': 8,
        'first_quorum_pct': 51,
        'second_quorum_pct': 25,
    },
    'Nayarit': {
        'law': 'Normativa de condominio de Nayarit',
        'notice_days_ordinary': 8,
        'first_quorum_pct': 51,
        'second_quorum_pct': 25,
    },
    'Durango': {
        'law': 'Normativa de condominio de Durango',
        'notice_days_ordinary': 8,
        'first_quorum_pct': 51,
        'second_quorum_pct': 25,
    },
    'Zacatecas': {
        'law': 'Normativa de condominio de Zacatecas',
        'notice_days_ordinary': 8,
        'first_quorum_pct': 51,
        'second_quorum_pct': 25,
    },
    'Tlaxcala': {
        'law': 'Normativa de condominio de Tlaxcala',
        'notice_days_ordinary': 8,
        'first_quorum_pct': 51,
        'second_quorum_pct': 25,
    },
}

DEFAULT_CO = {
    'country': 'Colombia',
    'law': 'Ley 675 de 2001 (régimen de propiedad horizontal)',
    'notice_days_ordinary': 15,
    'notice_days_extraordinary': 5,
    'first_quorum_pct': 51,
    'second_quorum_pct': 0,
    'second_call_wait_minutes': 60,
    'quorum_basis': 'unidades',
    'qualified_majority_pct': 70,
    'simple_majority_pct': 50,
    'ordinary_min_per_year': 1,
    'who_can_call': 'Administrador, consejo de administración o un número de propietarios según el reglamento.',
    'delivery': [
        'Comunicación escrita a cada propietario',
        'Publicación en carteleras de la copropiedad',
    ],
    'typical_ordinary_topics': [
        'Informe del administrador y estados financieros',
        'Presupuesto y cuotas de administración',
        'Elección del consejo de administración y revisor fiscal',
    ],
    'qualified_topics': [
        'Reforma al reglamento de propiedad horizontal',
        'Obras o cambios sustanciales de bienes comunes',
    ],
    'notes': (
        'En Colombia la asamblea ordinaria se convoca con al menos 15 días hábiles. '
        'Si no hay quórum, la segunda convocatoria (suele ser una hora después o en nueva fecha) '
        'se instala con los asistentes. Verifica el reglamento de la copropiedad.'
    ),
}

DEFAULT_GENERIC = {
    'country': '',
    'law': 'Reglamento interno y legislación local de copropiedad',
    'notice_days_ordinary': 10,
    'notice_days_extraordinary': 7,
    'first_quorum_pct': 51,
    'second_quorum_pct': 25,
    'second_call_wait_minutes': 30,
    'quorum_basis': 'unidades',
    'qualified_majority_pct': 75,
    'simple_majority_pct': 50,
    'ordinary_min_per_year': 1,
    'who_can_call': 'Administrador o el porcentaje de propietarios que fije el reglamento.',
    'delivery': [
        'Publicación en áreas comunes',
        'Aviso a cada unidad por medio fehaciente',
    ],
    'typical_ordinary_topics': [
        'Informe anual y estados financieros',
        'Presupuesto y cuotas',
        'Nombramientos',
    ],
    'qualified_topics': [
        'Reformas al reglamento',
        'Obras mayores sobre bienes comunes',
    ],
    'notes': (
        'El tenant no tiene una entidad con catálogo específico. Se aplican plazos y quórums '
        'genéricos; ajústalos al reglamento interno y a la ley del lugar.'
    ),
}

STATE_ALIASES = {
    'cdmx': 'Ciudad de México',
    'ciudad de mexico': 'Ciudad de México',
    'df': 'Ciudad de México',
    'distrito federal': 'Ciudad de México',
    'edomex': 'Estado de México',
    'mexico': 'Estado de México',
    'méxico': 'Estado de México',
    'estado de mexico': 'Estado de México',
}


def _norm(text):
    raw = (text or '').strip()
    key = raw.lower().replace('á', 'a').replace('é', 'e').replace('í', 'i')
    key = key.replace('ó', 'o').replace('ú', 'u')
    return raw, key


def _is_mexico(country):
    c = (country or '').strip().lower()
    return c in ('', 'mexico', 'méxico', 'mx', 'mex')


def _is_colombia(country):
    c = (country or '').strip().lower()
    return c in ('colombia', 'co')


def resolve_assembly_rules(country='', state=''):
    country_raw, _ = _norm(country)
    state_raw, state_key = _norm(state)

    if _is_colombia(country_raw):
        rules = deepcopy(DEFAULT_CO)
        rules['jurisdiction'] = f'Colombia · {state_raw}' if state_raw else 'Colombia'
        rules['matched'] = True
        rules['disclaimer'] = (
            'Homly orienta el proceso con la Ley 675. Confirma el reglamento de la copropiedad '
            'y el texto vigente antes de protocolizar acuerdos.'
        )
        return rules

    if _is_mexico(country_raw):
        rules = deepcopy(DEFAULT_MX)
        mapped = STATE_ALIASES.get(state_key, state_raw)
        override = MX_STATES.get(mapped) or MX_STATES.get(state_raw)
        if override:
            rules.update(override)
            rules['matched'] = True
        else:
            rules['matched'] = bool(state_raw)
        rules['country'] = 'México'
        rules['jurisdiction'] = f'México · {mapped or state_raw or "sin entidad"}'
        rules['disclaimer'] = (
            'Esta guía no sustituye la ley estatal ni el reglamento del condominio. '
            'Úsala para armar convocatorias, quórum y actas; valida plazos y mayorías '
            'con tu asesor legal cuando el acuerdo deba protocolizarse.'
        )
        return rules

    rules = deepcopy(DEFAULT_GENERIC)
    rules['country'] = country_raw or 'Sin país'
    rules['jurisdiction'] = ' · '.join(p for p in [country_raw or 'Sin país', state_raw] if p)
    rules['matched'] = False
    rules['disclaimer'] = (
        'No hay un catálogo específico para este país. Se usan plazos genéricos de copropiedad. '
        'Ajusta el reglamento interno en la convocatoria y la minuta.'
    )
    return rules
