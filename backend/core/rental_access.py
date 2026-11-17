"""Perfiles de usuario del espacio «Administrar Propiedades» (rentas).

Independientes de los roles del condominio. Cada perfil recibe un nivel de acceso
por módulo:

    none     – el módulo no existe para ese perfil
    read     – solo consulta
    operate  – consulta y ejecuta (actualiza avance, evidencias, inspecciones),
               sin crear/eliminar ni configurar
    write    – control total del módulo

La misma matriz vive en el frontend (`RENTAL_ROLE_ACCESS` en
`constants/modulePermissions.js`); `tests` y el script de verificación comparan ambas.
"""
from __future__ import annotations

from rest_framework.permissions import SAFE_METHODS, BasePermission

from .models import TenantUser

NONE, READ, OPERATE, WRITE = 0, 1, 2, 3
LEVEL_NAMES = {NONE: 'none', READ: 'read', OPERATE: 'operate', WRITE: 'write'}
_CODE = {'-': NONE, 'R': READ, 'O': OPERATE, 'W': WRITE}

RENTAL_ROLES = (
    'admin', 'gerente', 'comercial', 'mantenimiento', 'tecnico', 'tesorero', 'contador', 'auditor',
)
CONDO_ROLES = ('admin', 'tesorero', 'contador', 'auditor', 'vecino', 'vigilante')

RENTAL_ROLE_LABELS = {
    'admin': 'Administrador',
    'gerente': 'Gerente de propiedades',
    'comercial': 'Ejecutivo comercial',
    'mantenimiento': 'Coordinador de mantenimiento',
    'tecnico': 'Técnico de campo',
    'tesorero': 'Tesorero',
    'contador': 'Contador',
    'auditor': 'Auditor',
}

RENTAL_ROLE_DESCRIPTIONS = {
    'admin': 'Control total del portafolio: propiedades, contratos, cobranza, mantenimiento, finanzas, configuración y equipo.',
    'gerente': 'Opera el portafolio día a día: propiedades, contratos, CRM y todo el mantenimiento. Consulta cobranza y finanzas; no cambia la configuración.',
    'comercial': 'Coloca espacios: gestiona el CRM de rentas, contratos y vigencias. Consulta propiedades y ocupación; no ve cobranza ni finanzas.',
    'mantenimiento': 'Dirige la operación técnica: solicitudes, órdenes de trabajo, preventivo, activos e inspecciones, con sus indicadores y costos.',
    'tecnico': 'Ejecuta en campo: actualiza el avance de las órdenes, sube evidencias y realiza inspecciones. No crea ni elimina registros.',
    'tesorero': 'Cobranza y tesorería: cargos, pagos, rent roll y CAPEX/OPEX. Consulta contratos y mantenimiento.',
    'contador': 'Contabilidad: CAPEX/OPEX y presupuesto; consulta cobranza, rent roll, contratos y reportes.',
    'auditor': 'Consulta de todo el portafolio para revisión, sin modificar datos ni ver la configuración.',
}

# Orden de columnas de la matriz: RENTAL_ROLES
_MATRIX_ROWS = {
    #                              admin gerente comercial mantto tecnico tesor contador auditor
    'rentas_dashboard':           'W      W       -        -      -       R     R        R',
    'rentas_reportes':            'W      R       R        R      -       R     R        R',
    'rentas_propiedades':         'W      W       R        R      R       R     R        R',
    'rentas_solicitudes':         'W      W       -        W      R       -     -        R',
    'rentas_mantenimiento':       'W      W       -        W      O       R     R        R',
    'rentas_preventivo':          'W      W       -        W      R       -     -        R',
    'rentas_activos':             'W      W       -        W      R       R     R        R',
    'rentas_inspecciones':        'W      W       -        W      O       -     -        R',
    'rentas_indicadores':         'W      R       -        R      -       R     R        R',
    'rentas_crm':                 'W      W       W        -      -       -     -        R',
    'rentas_contratos':           'W      W       W        -      -       R     R        R',
    'rentas_calendario':          'W      W       W        -      -       R     R        R',
    'rentas_cobranza':            'W      R       -        -      -       W     R        R',
    'rentas_rentroll':            'W      R       R        -      -       R     R        R',
    'rentas_capex':               'W      R       -        R      -       W     W        R',
    'rentas_config':              'W      -       -        -      -       -     -        -',
    'rentas_guias':               'W      R       R        R      R       R     R        R',
}

RENTAL_MODULES = tuple(_MATRIX_ROWS)

DEFAULT_ACCESS = {
    role: {mod: _CODE[row.split()[i]] for mod, row in _MATRIX_ROWS.items()}
    for i, role in enumerate(RENTAL_ROLES)
}


def default_level(role, module_key):
    """Nivel por defecto del perfil. Módulos fuera de la matriz (p. ej. notificaciones) → lectura."""
    mods = DEFAULT_ACCESS.get(role)
    if mods is None:
        return NONE
    if module_key in mods:
        return mods[module_key]
    if module_key == 'notificaciones':
        return READ
    if module_key == 'mi_membresia':
        return READ if role == 'admin' else NONE
    return NONE


def resolve_level(role, module_key, perms_entry=None):
    """Aplica personalizaciones del tenant (`module_permissions[role]`) sobre el valor por defecto."""
    base = default_level(role, module_key)
    if perms_entry is None:
        return base
    if isinstance(perms_entry, (list, tuple)):
        return max(base, READ) if module_key in perms_entry else base
    if isinstance(perms_entry, dict) and module_key in perms_entry:
        val = perms_entry[module_key]
        if val == 'hidden':
            return NONE
        if val == 'read':
            return min(base, READ) if base else READ
        if val == 'write':
            return WRITE
    return base


def _membership(request_or_user, tenant_id):
    """TenantUser del usuario en el tenant (cacheado por request)."""
    cache = None
    user = request_or_user
    if hasattr(request_or_user, 'user'):
        cache = request_or_user.__dict__.setdefault('_rental_tu_cache', {})
        user = request_or_user.user
    key = str(tenant_id)
    if cache is not None and key in cache:
        return cache[key]
    tu = (
        TenantUser.objects.select_related('tenant')
        .filter(user=user, tenant_id=tenant_id).first()
    )
    if cache is not None:
        cache[key] = tu
    return tu


def user_level(request_or_user, tenant_id, module_key):
    """Nivel efectivo (0-3) del usuario sobre un módulo de rentas."""
    user = getattr(request_or_user, 'user', request_or_user)
    if not user or not getattr(user, 'is_authenticated', True):
        return NONE
    if getattr(user, 'is_super_admin', False):
        return WRITE
    tu = _membership(request_or_user, tenant_id)
    if not tu:
        return NONE
    perms = (tu.tenant.module_permissions or {}).get(tu.role) if tu.tenant else None
    return resolve_level(tu.role, module_key, perms)


def has_level(request_or_user, tenant_id, module_key, need):
    return user_level(request_or_user, tenant_id, module_key) >= need


def role_has_module(role, module_key, module_perms=None):
    """¿El perfil ve el módulo? (notificaciones por correo/app, filtros de equipo)."""
    entry = (module_perms or {}).get(role) if module_perms else None
    return resolve_level(role, module_key, entry) > NONE


class _RentalAccessBase(BasePermission):
    """Acceso por módulo. Lectura → READ; escritura → WRITE (o OPERATE en acciones de ejecución)."""
    modules = ()
    operate_actions = frozenset()
    message = 'No tienes permiso para este módulo.'

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if getattr(user, 'is_super_admin', False):
            return True
        tenant_id = view.kwargs.get('tenant_id')
        if not tenant_id:
            return False
        if request.method in SAFE_METHODS:
            need = READ
        elif getattr(view, 'action', None) in self.operate_actions:
            need = OPERATE
        else:
            need = WRITE
        return any(user_level(request, tenant_id, m) >= need for m in self.modules)


def RentalAccess(*modules, operate=()):
    """Fábrica: `permission_classes = [RentalAccess('rentas_crm')]`.

    Con varios módulos basta tener el nivel necesario en cualquiera (catálogos compartidos).
    `operate` lista acciones del viewset que un perfil de ejecución (técnico) puede realizar.
    """
    return type('RentalAccess', (_RentalAccessBase,), {
        'modules': tuple(modules), 'operate_actions': frozenset(operate),
    })


def access_matrix():
    """Serializable para documentación / pruebas."""
    return {r: {m: LEVEL_NAMES[l] for m, l in mods.items()} for r, mods in DEFAULT_ACCESS.items()}


def check_role_for_workspace(role, workspace_type):
    """None si el perfil corresponde al espacio; si no, el mensaje de error."""
    ws = workspace_type or 'condominio'
    if role == 'custom':
        return None
    if ws == 'rentas':
        if role not in RENTAL_ROLES:
            return 'Este perfil no existe en Administrar Propiedades.'
    elif role not in CONDO_ROLES:
        return 'Este perfil solo existe en Administrar Propiedades.'
    return None
