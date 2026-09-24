"""Visitas Autorizadas: altas de residente, QR, bitácora e ingreso/salida en caseta."""
from __future__ import annotations

import base64
import io
import json
import re
import secrets
from datetime import datetime

from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import validate_email
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from .asambleas import media_api_url
from .models import (
    CondoVisitAuth, CondoVisitBadge, CondoVisitEvent, CondoVisitParkingSpot,
    Notification, Tenant, TenantUser, Unit, User,
)
from .permissions import IsTenantMember

PHOTO_EXTS = {'.png', '.jpg', '.jpeg', '.webp', '.heic', '.gif'}
PHOTO_MAX = 12 * 1024 * 1024
QR_PREFIX = 'HOMLY-VIS:'
CREATE_ROLES = ('admin', 'vecino')
GATE_ROLES = ('admin', 'vigilante')


def _require_condominio(tenant):
    if getattr(tenant, 'workspace_type', 'condominio') != 'condominio':
        raise ValidationError({'detail': 'Este módulo solo aplica al espacio de condominios.'})


def request_user(request):
    user = getattr(request, 'user', None)
    if user and getattr(user, 'is_authenticated', False):
        return user
    return None


def tenant_role(user, tenant_id):
    if not user:
        return ''
    if getattr(user, 'is_super_admin', False):
        return 'admin'
    tu = TenantUser.objects.filter(user=user, tenant_id=tenant_id).first()
    return tu.role if tu else ''


def resident_unit_id(user, tenant_id):
    tu = TenantUser.objects.filter(user=user, tenant_id=tenant_id).select_related('unit').first()
    if tu and tu.role == 'vecino' and tu.unit_id:
        return tu.unit_id
    return None


def can_create_visits(user, tenant_id):
    return tenant_role(user, tenant_id) in CREATE_ROLES


def can_gate_visits(user, tenant_id):
    return tenant_role(user, tenant_id) in GATE_ROLES


def can_edit_settings(user, tenant_id):
    return tenant_role(user, tenant_id) == 'admin'


def _audit(request, action, description, tenant_id, object_type, object_id, object_repr, extra_data=None):
    from .views import _audit_log
    _audit_log(
        request, 'visitas', action, description,
        tenant_id=tenant_id, object_type=object_type,
        object_id=str(object_id) if object_id else '',
        object_repr=object_repr or '',
        extra_data=extra_data,
    )


def new_qr_token():
    return secrets.token_urlsafe(16)


def ensure_qr_token(visit):
    if visit.qr_token:
        return visit.qr_token
    visit.qr_token = new_qr_token()
    visit.save(update_fields=['qr_token', 'updated_at'])
    return visit.qr_token


def qr_payload(token):
    return f'{QR_PREFIX}{token}'


QR_MISMATCH_MSG = 'El QR no corresponde a la validación del registro escaneado.'


def parse_qr_payload(raw):
    text = (raw or '').strip()
    if not text:
        return None
    upper = text.upper()
    for foreign in ('HOMLY-PKG:', 'HOMLY:PKG:'):
        if upper.startswith(foreign):
            return None
    for prefix in (QR_PREFIX, 'HOMLY:VIS:', 'HOMLY-VIS:'):
        if upper.startswith(prefix):
            return text[len(prefix):].strip() or None
    return None


def qr_png_bytes(token):
    try:
        import qrcode
        from qrcode.constants import ERROR_CORRECT_M
    except ImportError:
        return None
    qr = qrcode.QRCode(version=None, error_correction=ERROR_CORRECT_M, box_size=8, border=2)
    qr.add_data(qr_payload(token))
    qr.make(fit=True)
    img = qr.make_image(fill_color='#1E594F', back_color='white')
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    return buf.getvalue()


def qr_data_url(token):
    raw = qr_png_bytes(token)
    if not raw:
        return ''
    return 'data:image/png;base64,' + base64.b64encode(raw).decode('ascii')


def unit_folio_code(unit):
    raw = (getattr(unit, 'unit_id_code', '') or '').strip()
    code = re.sub(r'[^A-Za-z0-9._-]+', '-', raw).strip('-')
    return code or 'U'


def next_visit_folio(unit):
    year = timezone.localtime().year
    last = (
        CondoVisitAuth.objects
        .select_for_update()
        .filter(tenant=unit.tenant, unit=unit, folio_year=year)
        .order_by('-folio_seq')
        .first()
    )
    seq = (last.folio_seq if last else 0) + 1
    if seq > 999:
        raise ValidationError({'folio': 'Esta unidad ya alcanzó el máximo de 999 autorizaciones del año.'})
    folio = f'{unit_folio_code(unit)}-{year}-{seq:03d}'
    return year, seq, folio


def validate_image(upload, field_name='photo'):
    if not upload:
        raise ValidationError({field_name: 'La foto de evidencia es obligatoria.'})
    name = (getattr(upload, 'name', '') or '').lower()
    ext = ''
    if '.' in name:
        ext = '.' + name.rsplit('.', 1)[-1]
    if ext not in PHOTO_EXTS:
        raise ValidationError({field_name: 'Solo se aceptan imágenes (JPG, PNG, WEBP).'})
    size = getattr(upload, 'size', 0) or 0
    if size > PHOTO_MAX:
        raise ValidationError({field_name: 'La imagen no puede superar 12 MB.'})
    return upload


def parse_dt(value, field):
    if not value:
        return None
    if isinstance(value, datetime):
        dt = value
    else:
        text = str(value).strip().replace('Z', '')
        dt = None
        for fmt in ('%Y-%m-%dT%H:%M:%S', '%Y-%m-%dT%H:%M', '%Y-%m-%d %H:%M:%S', '%Y-%m-%d %H:%M', '%Y-%m-%d'):
            try:
                sample = text[:19] if 'T' in text and len(text) >= 19 else text
                if fmt == '%Y-%m-%dT%H:%M' and 'T' in text:
                    sample = text[:16]
                dt = datetime.strptime(sample, fmt)
                break
            except ValueError:
                continue
        if dt is None:
            raise ValidationError({field: 'Indica una fecha y hora válidas.'})
    if timezone.is_naive(dt):
        dt = timezone.make_aware(dt, timezone.get_current_timezone())
    return dt


def parse_date(value, field):
    if not value:
        raise ValidationError({field: 'Este campo es obligatorio.'})
    if hasattr(value, 'year') and not isinstance(value, datetime):
        return value
    dt = parse_dt(value, field)
    return timezone.localtime(dt).date()


def _actor_name(user):
    if not user:
        return '—'
    return (getattr(user, 'name', None) or getattr(user, 'email', None) or '—').strip()


def effective_status(auth, today=None):
    if auth.status == 'cancelada':
        return 'cancelada'
    if auth.currently_inside:
        return 'en_condominio'
    today = today or timezone.localdate()
    if auth.valid_until and today > auth.valid_until:
        return 'vencida'
    if auth.kind == 'ocasional' and auth.visits_used >= 1:
        return 'completada'
    if auth.kind == 'permanente' and auth.duration_mode == 'count':
        if auth.max_visits and auth.visits_used >= auth.max_visits:
            return 'agotada'
    return 'vigente'


def refresh_status(auth, persist=True):
    computed = effective_status(auth)
    if persist and computed != auth.status:
        auth.status = computed
        auth.save(update_fields=['status', 'updated_at'])
    else:
        auth.status = computed
    return auth


def assert_can_enter(auth):
    refresh_status(auth)
    if auth.status == 'cancelada':
        raise ValidationError({'detail': 'Esta autorización está cancelada.'})
    if auth.currently_inside:
        raise ValidationError({'detail': 'Esta visita ya se encuentra dentro del condominio. Registra la salida primero.'})
    today = timezone.localdate()
    if auth.valid_from and today < auth.valid_from:
        raise ValidationError({'detail': 'La vigencia de esta autorización aún no inicia.'})
    if auth.valid_until and today > auth.valid_until:
        raise ValidationError({'detail': 'La vigencia de esta autorización ya venció.'})
    if auth.kind == 'ocasional' and auth.visits_used >= 1:
        raise ValidationError({'detail': 'Esta visita ocasional ya se utilizó.'})
    if auth.kind == 'permanente' and auth.duration_mode == 'count':
        if auth.max_visits and auth.visits_used >= auth.max_visits:
            raise ValidationError({'detail': 'Se agotó el número de visitas autorizadas.'})
    return auth


def unit_hosts(unit):
    """Personas del registro de la unidad a quienes se puede visitar."""
    hosts = []

    def add(key, kind, kind_label, first, last):
        name = f'{first or ""} {last or ""}'.strip()
        if not name:
            return
        hosts.append({
            'key': key,
            'kind': kind,
            'kind_label': kind_label,
            'name': name,
        })

    add('owner', 'propietario', 'Propietario', unit.owner_first_name, unit.owner_last_name)
    add('coowner', 'copropietario', 'Copropietario', unit.coowner_first_name, unit.coowner_last_name)
    add('tenant', 'inquilino', 'Inquilino', unit.tenant_first_name, unit.tenant_last_name)
    seen = {h['name'].lower() for h in hosts}
    for tu in TenantUser.objects.filter(tenant=unit.tenant, unit=unit).select_related('user'):
        user = tu.user
        name = (getattr(user, 'name', None) or '').strip() or (user.email or '').split('@')[0]
        if not name or name.lower() in seen:
            continue
        seen.add(name.lower())
        add(f'user:{user.id}', 'integrante', 'Integrante / usuario', name, '')
    return hosts


def resolve_host(unit, host_key, host_name):
    key = (host_key or '').strip()
    custom = (host_name or '').strip()
    if key in ('other', 'custom', 'otro', 'ninguno'):
        if not custom:
            raise ValidationError({'host_name': 'Escribe el nombre completo de quien recibe la visita.'})
        return 'other', 'Integrante', custom
    hosts = unit_hosts(unit)
    if key:
        match = next((h for h in hosts if h['key'] == key), None)
        if match:
            return match['key'], match['kind_label'], match['name']
        raise ValidationError({'host_key': 'La persona seleccionada no pertenece a esta unidad.'})
    if custom:
        return 'other', 'Integrante', custom
    raise ValidationError({'host_key': 'Selecciona a quién visita o escribe el nombre del integrante.'})


def catalog_item_label(item):
    if not item:
        return ''
    name = (item.name or '').strip()
    code = (item.code or '').strip()
    if name and code and name != code:
        return f'{name} ({code})'
    return name or code


def serialize_catalog_item(item, occupied_ids=None):
    return {
        'id': str(item.id),
        'code': item.code,
        'name': item.name or '',
        'notes': item.notes or '',
        'is_active': item.is_active,
        'label': catalog_item_label(item),
        'occupied': bool(occupied_ids and item.id in occupied_ids),
    }


def visit_catalog(tenant):
    occupied_parking = set(
        CondoVisitAuth.objects.filter(tenant=tenant, currently_inside=True, parking_spot_id__isnull=False)
        .values_list('parking_spot_id', flat=True)
    )
    occupied_badges = set(
        CondoVisitAuth.objects.filter(tenant=tenant, currently_inside=True, badge_id__isnull=False)
        .values_list('badge_id', flat=True)
    )
    return {
        'use_parking': bool(getattr(tenant, 'visit_use_parking', True)),
        'use_badges': bool(getattr(tenant, 'visit_use_badges', False)),
        'notify_rules': tenant.visit_notify_rules or '',
        'parking_spots': [
            serialize_catalog_item(s, occupied_parking)
            for s in CondoVisitParkingSpot.objects.filter(tenant=tenant)
        ],
        'badges': [
            serialize_catalog_item(b, occupied_badges)
            for b in CondoVisitBadge.objects.filter(tenant=tenant)
        ],
    }


def _upsert_catalog(model, tenant, data, item_id=None):
    code = (data.get('code') or '').strip()
    name = (data.get('name') or '').strip()
    notes = (data.get('notes') or '').strip()
    if not code:
        raise ValidationError({'code': 'Indica el código o número.'})
    qs = model.objects.filter(tenant=tenant, code__iexact=code)
    if item_id:
        qs = qs.exclude(id=item_id)
    if qs.exists():
        raise ValidationError({'code': 'Ya existe un registro con ese código.'})
    defaults = {
        'code': code,
        'name': name or code,
        'notes': notes,
    }
    if 'is_active' in data:
        defaults['is_active'] = bool(data.get('is_active'))
    if item_id:
        item = model.objects.filter(tenant=tenant, id=item_id).first()
        if not item:
            raise ValidationError({'detail': 'No se encontró el registro.'})
        for k, v in defaults.items():
            setattr(item, k, v)
        item.save()
        return item
    defaults.setdefault('is_active', True)
    return model.objects.create(tenant=tenant, **defaults)


def unit_resident_users(unit):
    users = []
    seen = set()
    for tu in TenantUser.objects.filter(tenant=unit.tenant, unit=unit).select_related('user'):
        if tu.user_id and tu.user_id not in seen:
            seen.add(tu.user_id)
            users.append(tu.user)
    return users


def notify_unit_users(tenant, unit, notif_type, title, message):
    for user in unit_resident_users(unit):
        Notification.objects.create(
            tenant=tenant,
            user=user,
            notif_type=notif_type,
            title=title,
            message=message,
        )


def unit_contacts(unit):
    from .paqueteria import unit_contacts as package_unit_contacts
    return package_unit_contacts(unit)


def parse_recipients(request):
    raw = request.data.get('recipients') or request.data.get('contacts') or []
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except json.JSONDecodeError:
            raw = []
    if not isinstance(raw, list):
        return []
    recipients = []
    seen = set()
    for item in raw:
        if not isinstance(item, dict):
            continue
        email = (item.get('email') or '').strip()
        name = (item.get('name') or '').strip()
        if not email:
            continue
        key = email.lower()
        if key in seen:
            continue
        seen.add(key)
        recipients.append({
            'name': name,
            'email': email,
            'user_id': item.get('user_id'),
        })
    return recipients


def _dt_label(value):
    if not value:
        return '—'
    if timezone.is_aware(value):
        value = timezone.localtime(value)
    return value.strftime('%d/%m/%Y %H:%M')


def gate_movement_details(visit, *, kind, method, notes, actor, when):
    method_label = 'Código QR' if method == 'qr' else 'Identificación'
    actor_name = (getattr(actor, 'name', None) or getattr(actor, 'email', None) or 'Caseta').strip()
    host = (visit.host_name or '').strip()
    host_kind = (visit.host_kind_label or '').strip()
    host_display = f'{host} ({host_kind})' if host and host_kind else host
    kind_label = 'Permanente' if visit.kind == 'permanente' else 'Ocasional'
    rows = [
        ('Folio', visit.folio),
        ('Visitante', visit.visitor_full_name),
        ('Unidad', visit.unit.display_label),
    ]
    if host_display:
        rows.append(('Visita a', host_display))
    rows += [
        ('Tipo', kind_label),
        ('Fecha y hora', _dt_label(when)),
        ('Método', method_label),
        ('Registró', actor_name),
    ]
    if kind == 'ingreso':
        if visit.arrived_by_vehicle:
            rows.append(('Ingresó en vehículo', 'Sí'))
            if visit.vehicle_plate:
                rows.append(('Placa', visit.vehicle_plate))
            if visit.parking_label:
                rows.append(('Cajón', visit.parking_label))
        if visit.badge_label:
            rows.append(('Gafete', visit.badge_label))
    else:
        if visit.last_check_in_at:
            rows.append(('Ingreso anterior', _dt_label(visit.last_check_in_at)))
        if visit.vehicle_plate:
            rows.append(('Placa', visit.vehicle_plate))
        if visit.parking_label:
            rows.append(('Cajón', visit.parking_label))
        if visit.badge_label:
            rows.append(('Gafete', visit.badge_label))
    if notes:
        rows.append(('Nota de caseta', notes))
    return rows


def notify_gate_recipients(visit, recipients, *, kind, method, notes, actor, when, event=None):
    from .email_service import image_field_inline, send_notification_email
    notif_type = 'visit_checked_in' if kind == 'ingreso' else 'visit_checked_out'
    host_bit = f' a {visit.host_name}' if visit.host_name else ''
    when_label = _dt_label(when)
    if kind == 'ingreso':
        title = f'Ingreso de {visit.visitor_full_name}'
        message = (
            f'{visit.visitor_full_name} ingresó{host_bit} en {visit.unit.display_label} '
            f'el {when_label}. Folio {visit.folio}.'
        )
    else:
        title = f'Salida de {visit.visitor_full_name}'
        message = (
            f'{visit.visitor_full_name} salió de {visit.unit.display_label} '
            f'el {when_label}. Folio {visit.folio}.'
        )
    details = gate_movement_details(
        visit, kind=kind, method=method, notes=notes, actor=actor, when=when,
    )
    extra_inline = []
    evidence_images = []

    def attach_photo(field, cid, label, filename):
        data, subtype = image_field_inline(field)
        if not data:
            return
        extra_inline.append((cid, data, subtype or 'jpeg', filename))
        evidence_images.append({'cid': cid, 'label': label})

    if event is not None:
        attach_photo(
            getattr(event, 'evidence_photo', None),
            'visitevidence',
            'Foto de evidencia de identificación',
            'evidencia-identificacion.jpg',
        )
        attach_photo(
            getattr(event, 'vehicle_photo', None),
            'visitvehicle',
            'Foto del vehículo',
            'evidencia-vehiculo.jpg',
        )
    if not any(item['cid'] == 'visitvehicle' for item in evidence_images):
        attach_photo(
            getattr(visit, 'vehicle_photo', None),
            'visitvehicle',
            'Foto del vehículo',
            'evidencia-vehiculo.jpg',
        )
    tenant_name = visit.tenant.name or 'Condominio'
    sent, skipped = [], []
    seen_users = set()
    for rec in recipients:
        email = (rec.get('email') or '').strip()
        name = (rec.get('name') or '').strip() or email
        user = None
        user_id = rec.get('user_id')
        if user_id:
            user = User.objects.filter(id=user_id).first()
        if user and user.id not in seen_users:
            seen_users.add(user.id)
            Notification.objects.create(
                tenant=visit.tenant,
                user=user,
                notif_type=notif_type,
                title=title,
                message=message,
            )
        if not email:
            skipped.append({'name': name, 'email': '', 'reason': 'sin correo'})
            continue
        ok = send_notification_email(
            email=email,
            user_name=name,
            notif_type=notif_type,
            title=title,
            message=message,
            tenant_name=tenant_name,
            workspace_label='Condominio',
            details=details,
            extra_inline=extra_inline,
            evidence_images=evidence_images,
        )
        if ok:
            sent.append({'name': name, 'email': email, 'user_id': str(user.id) if user else rec.get('user_id')})
        else:
            skipped.append({'name': name, 'email': email, 'reason': 'error de envío'})
    return sent, skipped


def send_visit_mail(visit, actor=None):
    from .email_service import send_visit_authorization_email
    return send_visit_authorization_email(
        email=visit.visitor_email,
        visitor_name=visit.visitor_full_name,
        tenant=visit.tenant,
        visit=visit,
    )


class VisitEventSerializer(serializers.ModelSerializer):
    actor_name = serializers.SerializerMethodField()
    evidence_photo_url = serializers.SerializerMethodField()
    vehicle_photo_url = serializers.SerializerMethodField()
    method_label = serializers.SerializerMethodField()

    class Meta:
        model = CondoVisitEvent
        fields = (
            'id', 'event_type', 'method', 'method_label',
            'notes', 'extra', 'evidence_photo_url', 'vehicle_photo_url',
            'actor_name', 'created_at',
        )

    def get_actor_name(self, obj):
        return _actor_name(obj.actor)

    def get_evidence_photo_url(self, obj):
        return media_api_url(obj.evidence_photo, self.context.get('request'))

    def get_vehicle_photo_url(self, obj):
        return media_api_url(obj.vehicle_photo, self.context.get('request'))

    def get_method_label(self, obj):
        if obj.method == 'qr':
            return 'Código QR'
        if obj.method == 'identificacion':
            return 'Identificación (foto de evidencia)'
        return ''


class VisitAuthSerializer(serializers.ModelSerializer):
    unit_code = serializers.CharField(source='unit.unit_id_code', read_only=True)
    unit_name = serializers.CharField(source='unit.unit_name', read_only=True)
    visitor_name = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()
    cancelled_by_name = serializers.SerializerMethodField()
    events = VisitEventSerializer(many=True, read_only=True)
    status_label = serializers.SerializerMethodField()
    kind_label = serializers.SerializerMethodField()
    duration_label = serializers.SerializerMethodField()
    qr_payload = serializers.SerializerMethodField()
    qr_data_url = serializers.SerializerMethodField()
    remaining_visits = serializers.SerializerMethodField()
    vehicle_photo_url = serializers.SerializerMethodField()
    host_label = serializers.SerializerMethodField()

    class Meta:
        model = CondoVisitAuth
        fields = (
            'id', 'folio', 'kind', 'kind_label', 'status', 'status_label',
            'unit', 'unit_code', 'unit_name',
            'visitor_first_name', 'visitor_last_name', 'visitor_name',
            'visitor_email', 'visitor_phone',
            'host_key', 'host_kind_label', 'host_name', 'host_label',
            'arrived_by_vehicle', 'vehicle_plate', 'vehicle_photo_url',
            'parking_label', 'badge_label',
            'expected_arrive_at', 'duration_mode', 'duration_label',
            'max_visits', 'visits_used', 'remaining_visits',
            'valid_from', 'valid_until',
            'currently_inside', 'last_check_in_at', 'last_check_out_at',
            'notes', 'qr_payload', 'qr_data_url',
            'created_by_name', 'cancelled_by_name', 'cancel_reason', 'cancelled_at',
            'events', 'created_at',
        )
        read_only_fields = fields

    def get_vehicle_photo_url(self, obj):
        return media_api_url(obj.vehicle_photo, self.context.get('request'))

    def get_host_label(self, obj):
        name = (obj.host_name or '').strip()
        kind = (obj.host_kind_label or '').strip()
        if name and kind:
            return f'{name} · {kind}'
        return name or kind or ''

    def get_visitor_name(self, obj):
        return obj.visitor_full_name

    def get_created_by_name(self, obj):
        return _actor_name(obj.created_by)

    def get_cancelled_by_name(self, obj):
        return _actor_name(obj.cancelled_by)

    def get_status_label(self, obj):
        return dict(CondoVisitAuth.STATUS_CHOICES).get(obj.status, obj.status)

    def get_kind_label(self, obj):
        return 'Permanente' if obj.kind == 'permanente' else 'Ocasional'

    def get_duration_label(self, obj):
        if obj.kind != 'permanente':
            return 'Visita única'
        if obj.duration_mode == 'count':
            return f'{obj.max_visits or 0} visita(s)'
        return 'Indefinido (con vigencia)'

    def get_qr_payload(self, obj):
        return qr_payload(ensure_qr_token(obj))

    def get_qr_data_url(self, obj):
        return qr_data_url(ensure_qr_token(obj))

    def get_remaining_visits(self, obj):
        if obj.kind == 'ocasional':
            return max(0, 1 - (obj.visits_used or 0))
        if obj.duration_mode == 'count' and obj.max_visits:
            return max(0, obj.max_visits - (obj.visits_used or 0))
        return None


class VisitAuthListSerializer(VisitAuthSerializer):
    class Meta(VisitAuthSerializer.Meta):
        fields = (
            'id', 'folio', 'kind', 'kind_label', 'status', 'status_label',
            'unit', 'unit_code', 'unit_name',
            'visitor_name', 'visitor_email', 'visitor_phone',
            'host_name', 'host_kind_label', 'host_label',
            'arrived_by_vehicle', 'vehicle_plate', 'parking_label', 'badge_label',
            'expected_arrive_at', 'duration_mode', 'duration_label',
            'max_visits', 'visits_used', 'remaining_visits',
            'valid_from', 'valid_until', 'currently_inside',
            'last_check_in_at', 'last_check_out_at', 'created_at',
        )


def serialize_visit(visit, request, events=True):
    refresh_status(visit)
    cls = VisitAuthSerializer if events else VisitAuthListSerializer
    if events:
        visit = CondoVisitAuth.objects.select_related(
            'unit', 'created_by', 'cancelled_by',
        ).prefetch_related('events__actor').get(pk=visit.pk)
        refresh_status(visit, persist=False)
    data = cls(visit, context={'request': request}).data
    data['contacts'] = unit_contacts(visit.unit)
    return data


class CondoVisitAuthViewSet(viewsets.ModelViewSet):
    permission_classes = [IsTenantMember]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    http_method_names = ['get', 'post', 'patch', 'delete', 'head', 'options']

    def get_serializer_class(self):
        if self.action == 'list':
            return VisitAuthListSerializer
        return VisitAuthSerializer

    def get_queryset(self):
        tid = self.kwargs['tenant_id']
        qs = CondoVisitAuth.objects.filter(tenant_id=tid).select_related(
            'unit', 'created_by', 'cancelled_by',
        )
        if self.action in ('retrieve', 'checkin', 'checkout', 'cancel', 'resend', 'lookup'):
            qs = qs.prefetch_related('events__actor')
        user = request_user(self.request)
        role = tenant_role(user, tid)
        if role == 'vecino':
            uid = resident_unit_id(user, tid)
            qs = qs.filter(unit_id=uid) if uid else qs.none()
        kind = (self.request.query_params.get('kind') or '').strip()
        if kind in ('ocasional', 'permanente'):
            qs = qs.filter(kind=kind)
        status_filter = (self.request.query_params.get('status') or '').strip()
        if status_filter:
            qs = qs.filter(status=status_filter)
        if (self.request.query_params.get('inside') or '').strip() in ('1', 'true', 'yes'):
            qs = qs.filter(currently_inside=True)
        unit_id = (self.request.query_params.get('unit') or self.request.query_params.get('unit_id') or '').strip()
        if unit_id:
            qs = qs.filter(unit_id=unit_id)
        search = (self.request.query_params.get('search') or '').strip()
        if search:
            qs = qs.filter(
                Q(folio__icontains=search)
                | Q(visitor_first_name__icontains=search)
                | Q(visitor_last_name__icontains=search)
                | Q(visitor_email__icontains=search)
                | Q(visitor_phone__icontains=search)
                | Q(unit__unit_id_code__icontains=search)
                | Q(unit__unit_name__icontains=search)
                | Q(host_name__icontains=search)
                | Q(vehicle_plate__icontains=search)
                | Q(parking_label__icontains=search)
                | Q(badge_label__icontains=search)
            )
        return qs

    def list(self, request, *args, **kwargs):
        qs = self.get_queryset()
        today = timezone.localdate()
        stale = qs.filter(
            currently_inside=False,
        ).exclude(status__in=('cancelada', 'completada', 'agotada', 'vencida')).filter(valid_until__lt=today)
        if stale.exists():
            stale.update(status='vencida')
        page = self.paginate_queryset(qs)
        ser = VisitAuthListSerializer(page or qs, many=True, context={'request': request})
        if page is not None:
            return self.get_paginated_response(ser.data)
        return Response(ser.data)

    def retrieve(self, request, *args, **kwargs):
        visit = self.get_object()
        return Response(serialize_visit(visit, request))

    def _scoped_visits(self, tenant_id):
        qs = CondoVisitAuth.objects.filter(tenant_id=tenant_id).select_related(
            'unit', 'created_by',
        )
        user = request_user(self.request)
        role = tenant_role(user, tenant_id)
        if role == 'vecino':
            uid = resident_unit_id(user, tenant_id)
            qs = qs.filter(unit_id=uid) if uid else qs.none()
        return qs

    def _visit_report(self, request, tenant_id):
        tenant = Tenant.objects.get(id=tenant_id)
        _require_condominio(tenant)
        from .ops_reports import parse_report_range, visit_report_payload
        date_from, date_to, start, end = parse_report_range(request)
        payload = visit_report_payload(self._scoped_visits(tenant_id), date_from, date_to, start, end)
        payload['tenant_name'] = (tenant.razon_social or tenant.name or '').strip()
        return tenant, payload

    @action(detail=False, methods=['get'], url_path='report')
    def report(self, request, tenant_id=None):
        _tenant, payload = self._visit_report(request, tenant_id)
        return Response(payload)

    @action(detail=False, methods=['get'], url_path='report-pdf')
    def report_pdf(self, request, tenant_id=None):
        from .ops_reports import generate_ops_report_pdf, generated_by, pdf_response
        tenant, payload = self._visit_report(request, tenant_id)
        pdf_bytes = generate_ops_report_pdf(tenant, payload, generated_by(request))
        if not pdf_bytes:
            return Response({'detail': 'No se pudo generar el PDF.'}, status=500)
        filename = f'Visitas_{payload["date_from"]}_{payload["date_to"]}.pdf'
        return pdf_response(pdf_bytes, filename)

    def update(self, request, *args, **kwargs):
        raise PermissionDenied('Las autorizaciones no se editan. Cancela y crea una nueva.')

    def partial_update(self, request, *args, **kwargs):
        raise PermissionDenied('Las autorizaciones no se editan. Cancela y crea una nueva.')

    def destroy(self, request, *args, **kwargs):
        raise PermissionDenied('Las autorizaciones no se eliminan. Cancélalas desde la ficha.')

    def create(self, request, tenant_id=None):
        if not can_create_visits(request.user, tenant_id):
            raise PermissionDenied('Solo el residente o el administrador pueden autorizar visitas.')
        tenant = Tenant.objects.get(id=tenant_id)
        _require_condominio(tenant)
        role = tenant_role(request.user, tenant_id)

        unit_id = request.data.get('unit') or request.data.get('unit_id')
        if role == 'vecino':
            own = resident_unit_id(request.user, tenant_id)
            if not own:
                raise ValidationError({'unit': 'Tu usuario no tiene una unidad asignada.'})
            unit_id = own
        if not unit_id:
            raise ValidationError({'unit': 'Selecciona la unidad que autoriza la visita.'})
        unit = Unit.objects.filter(tenant=tenant, id=unit_id, is_active=True).first()
        if not unit:
            raise ValidationError({'unit': 'La unidad no existe o está inactiva.'})

        first = (request.data.get('visitor_first_name') or '').strip()
        last = (request.data.get('visitor_last_name') or '').strip()
        email = (request.data.get('visitor_email') or '').strip()
        phone = (request.data.get('visitor_phone') or '').strip()
        kind = (request.data.get('kind') or '').strip()
        notes = (request.data.get('notes') or '').strip()
        if not first:
            raise ValidationError({'visitor_first_name': 'Indica el nombre del visitante.'})
        if not last:
            raise ValidationError({'visitor_last_name': 'Indica los apellidos del visitante.'})
        if not email:
            raise ValidationError({'visitor_email': 'El correo del visitante es obligatorio.'})
        try:
            validate_email(email)
        except DjangoValidationError:
            raise ValidationError({'visitor_email': 'Indica un correo válido.'})
        if kind not in ('ocasional', 'permanente'):
            raise ValidationError({'kind': 'Marca si la visita es ocasional o permanente.'})
        host_key, host_kind_label, host_name = resolve_host(
            unit,
            request.data.get('host_key'),
            request.data.get('host_name'),
        )

        expected = None
        duration_mode = ''
        max_visits = None
        if kind == 'ocasional':
            expected = parse_dt(request.data.get('expected_arrive_at'), 'expected_arrive_at')
            if not expected:
                raise ValidationError({'expected_arrive_at': 'Selecciona la fecha y hora estimada de llegada.'})
            day = timezone.localtime(expected).date()
            valid_from = day
            valid_until = day
        else:
            duration_mode = (request.data.get('duration_mode') or '').strip()
            if duration_mode not in ('count', 'indefinido'):
                raise ValidationError({'duration_mode': 'Indica si es por cantidad de visitas o indefinido.'})
            valid_from = parse_date(request.data.get('valid_from'), 'valid_from')
            valid_until = parse_date(request.data.get('valid_until'), 'valid_until')
            if valid_until < valid_from:
                raise ValidationError({'valid_until': 'La vigencia debe terminar en o después de la fecha de inicio.'})
            if duration_mode == 'count':
                try:
                    max_visits = int(request.data.get('max_visits'))
                except (TypeError, ValueError):
                    raise ValidationError({'max_visits': 'Indica cuántas visitas autorizas.'})
                if max_visits < 1 or max_visits > 999:
                    raise ValidationError({'max_visits': 'La cantidad debe estar entre 1 y 999.'})

        with transaction.atomic():
            unit = Unit.objects.select_for_update().get(pk=unit.pk)
            year, seq, folio = next_visit_folio(unit)
            visit = CondoVisitAuth.objects.create(
                tenant=tenant,
                unit=unit,
                folio=folio,
                folio_year=year,
                folio_seq=seq,
                visitor_first_name=first,
                visitor_last_name=last,
                visitor_email=email,
                visitor_phone=phone,
                host_key=host_key,
                host_kind_label=host_kind_label,
                host_name=host_name,
                kind=kind,
                expected_arrive_at=expected,
                duration_mode=duration_mode,
                max_visits=max_visits,
                valid_from=valid_from,
                valid_until=valid_until,
                status='vigente',
                notes=notes,
                created_by=request.user,
            )
            CondoVisitEvent.objects.create(
                visit=visit,
                event_type='creado',
                notes=notes,
                extra={'folio': folio, 'kind': kind, 'host_name': host_name, 'host_kind_label': host_kind_label},
                actor=request.user,
            )

        sent = send_visit_mail(visit)
        notify_unit_users(
            tenant, unit, 'visit_authorized',
            f'Visita autorizada {folio}',
            f'{first} {last} quedó autorizado(a) para visitar a {host_name} en {unit.display_label}. Folio {folio}.',
        )
        _audit(
            request, 'create',
            f'Visita {folio} autorizada para {first} {last} en {unit.display_label}',
            tenant_id, 'CondoVisitAuth', visit.id, folio,
            extra_data={'email_sent': bool(sent)},
        )
        data = serialize_visit(visit, request)
        data['email_sent'] = bool(sent)
        return Response(data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['get'], url_path='context')
    def context(self, request, tenant_id=None):
        tenant = Tenant.objects.get(id=tenant_id)
        _require_condominio(tenant)
        user = request.user
        role = tenant_role(user, tenant_id)
        qs = CondoVisitAuth.objects.filter(tenant=tenant)
        if role == 'vecino':
            uid = resident_unit_id(user, tenant_id)
            qs = qs.filter(unit_id=uid) if uid else qs.none()
        today = timezone.localdate()
        return Response({
            'role': role,
            'can_create': can_create_visits(user, tenant_id),
            'can_gate': can_gate_visits(user, tenant_id),
            'can_edit_settings': can_edit_settings(user, tenant_id),
            'notify_rules': tenant.visit_notify_rules or '',
            'tenant_name': tenant.name,
            'resident_unit_id': str(resident_unit_id(user, tenant_id) or '') or None,
            **visit_catalog(tenant),
            'counts': {
                'total': qs.count(),
                'ocasional': qs.filter(kind='ocasional').count(),
                'permanente': qs.filter(kind='permanente').count(),
                'vigente': qs.filter(status='vigente').count(),
                'en_condominio': qs.filter(currently_inside=True).count(),
                'vencidas': qs.filter(Q(status='vencida') | Q(valid_until__lt=today, currently_inside=False)).count(),
            },
        })

    @action(detail=False, methods=['get', 'patch'], url_path='settings')
    def visit_settings(self, request, tenant_id=None):
        tenant = Tenant.objects.get(id=tenant_id)
        _require_condominio(tenant)
        can_edit = can_edit_settings(request.user, tenant_id)
        if request.method == 'GET':
            return Response({**visit_catalog(tenant), 'can_edit': can_edit})
        if not can_edit:
            raise PermissionDenied('Solo el administrador puede personalizar las visitas.')
        if 'notify_rules' in request.data:
            tenant.visit_notify_rules = (request.data.get('notify_rules') or '').strip()
        if 'use_parking' in request.data:
            tenant.visit_use_parking = bool(request.data.get('use_parking'))
        if 'use_badges' in request.data:
            tenant.visit_use_badges = bool(request.data.get('use_badges'))
        tenant.save(update_fields=[
            'visit_notify_rules', 'visit_use_parking', 'visit_use_badges', 'updated_at',
        ])
        _audit(request, 'update', 'Personalización de visitas actualizada', tenant_id, 'Tenant', tenant.id, tenant.name)
        return Response({**visit_catalog(tenant), 'can_edit': True})

    @action(detail=False, methods=['get'], url_path='hosts')
    def hosts(self, request, tenant_id=None):
        unit_id = request.query_params.get('unit') or request.query_params.get('unit_id')
        role = tenant_role(request.user, tenant_id)
        if role == 'vecino':
            unit_id = resident_unit_id(request.user, tenant_id)
        if not unit_id:
            raise ValidationError({'unit': 'Indica la unidad.'})
        unit = Unit.objects.filter(tenant_id=tenant_id, id=unit_id).first()
        if not unit:
            raise ValidationError({'unit': 'Unidad no encontrada.'})
        return Response({'unit': str(unit.id), 'hosts': unit_hosts(unit)})

    @action(detail=False, methods=['get'], url_path='unit-contacts')
    def unit_contacts_view(self, request, tenant_id=None):
        unit_id = request.query_params.get('unit') or request.query_params.get('unit_id')
        role = tenant_role(request.user, tenant_id)
        if role == 'vecino':
            unit_id = resident_unit_id(request.user, tenant_id)
        if not unit_id:
            raise ValidationError({'unit': 'Indica la unidad.'})
        unit = Unit.objects.filter(tenant_id=tenant_id, id=unit_id).first()
        if not unit:
            raise ValidationError({'unit': 'Unidad no encontrada.'})
        return Response({'contacts': unit_contacts(unit)})

    @action(detail=False, methods=['get', 'post'], url_path='parking-spots')
    def parking_spots(self, request, tenant_id=None):
        tenant = Tenant.objects.get(id=tenant_id)
        _require_condominio(tenant)
        if request.method == 'GET':
            return Response({'results': visit_catalog(tenant)['parking_spots']})
        if not can_edit_settings(request.user, tenant_id):
            raise PermissionDenied('Solo el administrador puede configurar cajones de visitas.')
        item = _upsert_catalog(CondoVisitParkingSpot, tenant, request.data)
        _audit(request, 'create', f'Cajón de visitas {item.code}', tenant_id, 'CondoVisitParkingSpot', item.id, item.code)
        return Response(serialize_catalog_item(item), status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['patch', 'delete'], url_path=r'parking-spots/(?P<item_id>[^/.]+)')
    def parking_spot_item(self, request, tenant_id=None, item_id=None):
        tenant = Tenant.objects.get(id=tenant_id)
        if not can_edit_settings(request.user, tenant_id):
            raise PermissionDenied('Solo el administrador puede configurar cajones de visitas.')
        if request.method == 'DELETE':
            item = CondoVisitParkingSpot.objects.filter(tenant=tenant, id=item_id).first()
            if not item:
                raise ValidationError({'detail': 'Cajón no encontrado.'})
            code = item.code
            item.delete()
            _audit(request, 'delete', f'Cajón de visitas {code} eliminado', tenant_id, 'CondoVisitParkingSpot', item_id, code)
            return Response({'ok': True})
        item = _upsert_catalog(CondoVisitParkingSpot, tenant, request.data, item_id)
        _audit(request, 'update', f'Cajón de visitas {item.code}', tenant_id, 'CondoVisitParkingSpot', item.id, item.code)
        return Response(serialize_catalog_item(item))

    @action(detail=False, methods=['get', 'post'], url_path='badges')
    def badges(self, request, tenant_id=None):
        tenant = Tenant.objects.get(id=tenant_id)
        _require_condominio(tenant)
        if request.method == 'GET':
            return Response({'results': visit_catalog(tenant)['badges']})
        if not can_edit_settings(request.user, tenant_id):
            raise PermissionDenied('Solo el administrador puede configurar gafetes de visitas.')
        item = _upsert_catalog(CondoVisitBadge, tenant, request.data)
        _audit(request, 'create', f'Gafete de visitas {item.code}', tenant_id, 'CondoVisitBadge', item.id, item.code)
        return Response(serialize_catalog_item(item), status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['patch', 'delete'], url_path=r'badges/(?P<item_id>[^/.]+)')
    def badge_item(self, request, tenant_id=None, item_id=None):
        tenant = Tenant.objects.get(id=tenant_id)
        if not can_edit_settings(request.user, tenant_id):
            raise PermissionDenied('Solo el administrador puede configurar gafetes de visitas.')
        if request.method == 'DELETE':
            item = CondoVisitBadge.objects.filter(tenant=tenant, id=item_id).first()
            if not item:
                raise ValidationError({'detail': 'Gafete no encontrado.'})
            code = item.code
            item.delete()
            _audit(request, 'delete', f'Gafete de visitas {code} eliminado', tenant_id, 'CondoVisitBadge', item_id, code)
            return Response({'ok': True})
        item = _upsert_catalog(CondoVisitBadge, tenant, request.data, item_id)
        _audit(request, 'update', f'Gafete de visitas {item.code}', tenant_id, 'CondoVisitBadge', item.id, item.code)
        return Response(serialize_catalog_item(item))

    @action(detail=False, methods=['get', 'post'], url_path='lookup')
    def lookup(self, request, tenant_id=None):
        if not can_gate_visits(request.user, tenant_id):
            raise PermissionDenied('No tienes permiso para validar ingresos de visitas.')
        raw = (
            (request.data.get('qr') if hasattr(request.data, 'get') else None)
            or request.query_params.get('qr')
            or request.query_params.get('token')
            or ''
        )
        token = parse_qr_payload(raw)
        if not token:
            raise ValidationError({'qr': QR_MISMATCH_MSG})
        visit = CondoVisitAuth.objects.filter(tenant_id=tenant_id, qr_token=token).select_related(
            'unit', 'created_by',
        ).prefetch_related('events__actor').first()
        if not visit:
            raise ValidationError({'qr': QR_MISMATCH_MSG})
        return Response(serialize_visit(visit, request))

    def _gate_method(self, request, require_photo=False):
        method = (request.data.get('method') or '').strip()
        if method not in ('qr', 'identificacion'):
            raise ValidationError({'method': 'Confirma el ingreso con QR o con identificación.'})
        photo = request.FILES.get('photo') or request.FILES.get('evidence_photo')
        if method == 'identificacion':
            photo = validate_image(photo, 'photo')
        elif require_photo and photo:
            photo = validate_image(photo, 'photo')
        else:
            photo = None
        qr_raw = (request.data.get('qr') or '').strip()
        notes = (request.data.get('notes') or '').strip()
        return method, photo, qr_raw, notes

    def _assert_qr_matches(self, visit, qr_raw):
        token = parse_qr_payload(qr_raw)
        if not token or token != visit.qr_token:
            raise ValidationError({'qr': QR_MISMATCH_MSG})

    def _apply_vehicle(self, request, visit):
        raw_flag = request.data.get('arrived_by_vehicle')
        if isinstance(raw_flag, str):
            by_vehicle = raw_flag.strip().lower() in ('1', 'true', 'yes', 'si', 'sí')
        else:
            by_vehicle = bool(raw_flag)
        tenant = visit.tenant
        extra = {}
        update_fields = ['arrived_by_vehicle']
        visit.arrived_by_vehicle = by_vehicle
        vehicle_photo = request.FILES.get('vehicle_photo')
        plate = (request.data.get('vehicle_plate') or '').strip().upper()
        parking_id = (request.data.get('parking_spot') or request.data.get('parking_spot_id') or '').strip()
        parking_custom = (request.data.get('parking_label') or '').strip()
        badge_id = (request.data.get('badge') or request.data.get('badge_id') or '').strip()
        badge_custom = (request.data.get('badge_label') or '').strip()

        if by_vehicle:
            if not plate:
                raise ValidationError({'vehicle_plate': 'Escribe la placa del vehículo.'})
            if not vehicle_photo:
                raise ValidationError({'vehicle_photo': 'Toma la foto del vehículo.'})
            vehicle_photo = validate_image(vehicle_photo, 'vehicle_photo')
            visit.vehicle_plate = plate
            visit.vehicle_photo = vehicle_photo
            update_fields += ['vehicle_plate', 'vehicle_photo']
            extra['vehicle_plate'] = plate
            if getattr(tenant, 'visit_use_parking', True):
                spot = None
                if parking_id:
                    spot = CondoVisitParkingSpot.objects.filter(tenant=tenant, id=parking_id, is_active=True).first()
                    if not spot:
                        raise ValidationError({'parking_spot': 'El cajón seleccionado no existe o está inactivo.'})
                if not spot and not parking_custom:
                    raise ValidationError({'parking_label': 'Selecciona o escribe el cajón de visitas.'})
                visit.parking_spot = spot
                visit.parking_label = catalog_item_label(spot) if spot else parking_custom
                update_fields += ['parking_spot', 'parking_label']
                extra['parking_label'] = visit.parking_label
        else:
            visit.vehicle_plate = ''
            visit.parking_spot = None
            visit.parking_label = ''
            update_fields += ['vehicle_plate', 'parking_spot', 'parking_label']

        if getattr(tenant, 'visit_use_badges', False):
            badge = None
            if badge_id:
                badge = CondoVisitBadge.objects.filter(tenant=tenant, id=badge_id, is_active=True).first()
                if not badge:
                    raise ValidationError({'badge': 'El gafete seleccionado no existe o está inactivo.'})
            if not badge and not badge_custom:
                raise ValidationError({'badge_label': 'Selecciona o escribe el gafete de visitas.'})
            visit.badge = badge
            visit.badge_label = catalog_item_label(badge) if badge else badge_custom
            update_fields += ['badge', 'badge_label']
            extra['badge_label'] = visit.badge_label
        return extra, vehicle_photo if by_vehicle else None, update_fields

    @action(detail=True, methods=['post'], url_path='checkin')
    def checkin(self, request, tenant_id=None, pk=None):
        if not can_gate_visits(request.user, tenant_id):
            raise PermissionDenied('Solo vigilancia o el administrador pueden registrar el ingreso.')
        visit = self.get_object()
        assert_can_enter(visit)
        method, photo, qr_raw, notes = self._gate_method(request)
        if method == 'qr':
            self._assert_qr_matches(visit, qr_raw)
        available = [c for c in unit_contacts(visit.unit) if c.get('has_email')]
        recipients = parse_recipients(request)
        if available and not recipients:
            raise ValidationError({'recipients': 'Selecciona al menos un contacto con correo para avisar el ingreso.'})
        vehicle_extra, vehicle_photo, vehicle_fields = self._apply_vehicle(request, visit)
        now = timezone.now()
        visit.currently_inside = True
        visit.visits_used = (visit.visits_used or 0) + 1
        visit.last_check_in_at = now
        visit.status = 'en_condominio'
        visit.save(update_fields=[
            'currently_inside', 'visits_used', 'last_check_in_at', 'status', 'updated_at',
            *vehicle_fields,
        ])
        extra = {
            'method': method,
            'host_name': visit.host_name,
            'host_kind_label': visit.host_kind_label,
            **vehicle_extra,
        }
        ev = CondoVisitEvent(
            visit=visit,
            event_type='ingreso',
            method=method,
            notes=notes,
            extra=extra,
            actor=request.user,
        )
        if photo:
            ev.evidence_photo = photo
        if vehicle_photo:
            ev.vehicle_photo = vehicle_photo
        ev.save()
        sent, skipped = notify_gate_recipients(
            visit, recipients, kind='ingreso', method=method, notes=notes,
            actor=request.user, when=now, event=ev,
        )
        extra['notify'] = {'sent': sent, 'skipped': skipped}
        ev.extra = extra
        ev.save(update_fields=['extra'])
        _audit(
            request, 'update',
            f'Ingreso de visita {visit.folio} ({method})',
            tenant_id, 'CondoVisitAuth', visit.id, visit.folio,
            extra_data={'method': method, 'notified': len(sent)},
        )
        data = serialize_visit(visit, request)
        data['notify'] = {'sent': sent, 'skipped': skipped}
        return Response(data)

    @action(detail=True, methods=['post'], url_path='checkout')
    def checkout(self, request, tenant_id=None, pk=None):
        if not can_gate_visits(request.user, tenant_id):
            raise PermissionDenied('Solo vigilancia o el administrador pueden registrar la salida.')
        visit = self.get_object()
        if visit.status == 'cancelada':
            raise ValidationError({'detail': 'Esta autorización está cancelada.'})
        if not visit.currently_inside:
            raise ValidationError({'detail': 'Esta visita no está registrada dentro del condominio.'})
        method, photo, qr_raw, notes = self._gate_method(request)
        if method == 'qr':
            self._assert_qr_matches(visit, qr_raw)
        available = [c for c in unit_contacts(visit.unit) if c.get('has_email')]
        recipients = parse_recipients(request)
        if available and not recipients:
            raise ValidationError({'recipients': 'Selecciona al menos un contacto con correo para avisar la salida.'})
        now = timezone.now()
        visit.currently_inside = False
        visit.last_check_out_at = now
        visit.status = 'vigente'
        visit.save(update_fields=[
            'currently_inside', 'last_check_out_at', 'status', 'updated_at',
        ])
        refresh_status(visit)
        ev = CondoVisitEvent(
            visit=visit,
            event_type='salida',
            method=method,
            notes=notes,
            extra={'method': method},
            actor=request.user,
        )
        if photo:
            ev.evidence_photo = photo
        ev.save()
        sent, skipped = notify_gate_recipients(
            visit, recipients, kind='salida', method=method, notes=notes,
            actor=request.user, when=now, event=ev,
        )
        ev.extra = {'method': method, 'notify': {'sent': sent, 'skipped': skipped}}
        ev.save(update_fields=['extra'])
        _audit(
            request, 'update',
            f'Salida de visita {visit.folio} ({method})',
            tenant_id, 'CondoVisitAuth', visit.id, visit.folio,
            extra_data={'method': method, 'notified': len(sent)},
        )
        data = serialize_visit(visit, request)
        data['notify'] = {'sent': sent, 'skipped': skipped}
        return Response(data)

    @action(detail=True, methods=['post'], url_path='cancel')
    def cancel(self, request, tenant_id=None, pk=None):
        role = tenant_role(request.user, tenant_id)
        visit = self.get_object()
        if role == 'vecino':
            own = resident_unit_id(request.user, tenant_id)
            if str(own) != str(visit.unit_id):
                raise PermissionDenied('Solo puedes cancelar autorizaciones de tu unidad.')
        elif role != 'admin':
            raise PermissionDenied('No tienes permiso para cancelar esta autorización.')
        if visit.status == 'cancelada':
            raise ValidationError({'detail': 'Esta autorización ya está cancelada.'})
        if visit.currently_inside:
            raise ValidationError({'detail': 'La visita está dentro del condominio. Registra la salida antes de cancelar.'})
        reason = (request.data.get('reason') or request.data.get('comment') or '').strip()
        visit.status = 'cancelada'
        visit.cancelled_at = timezone.now()
        visit.cancelled_by = request.user
        visit.cancel_reason = reason
        visit.save(update_fields=['status', 'cancelled_at', 'cancelled_by', 'cancel_reason', 'updated_at'])
        CondoVisitEvent.objects.create(
            visit=visit,
            event_type='cancelado',
            notes=reason,
            actor=request.user,
        )
        notify_unit_users(
            visit.tenant, visit.unit, 'visit_cancelled',
            f'Visita {visit.folio} cancelada',
            f'Se canceló la autorización de {visit.visitor_full_name} para {visit.unit.display_label}.',
        )
        _audit(
            request, 'cancel',
            f'Visita {visit.folio} cancelada',
            tenant_id, 'CondoVisitAuth', visit.id, visit.folio,
            extra_data={'reason': reason},
        )
        return Response(serialize_visit(visit, request))

    @action(detail=True, methods=['post'], url_path='resend')
    def resend(self, request, tenant_id=None, pk=None):
        role = tenant_role(request.user, tenant_id)
        visit = self.get_object()
        if role == 'vecino':
            own = resident_unit_id(request.user, tenant_id)
            if str(own) != str(visit.unit_id):
                raise PermissionDenied('Solo puedes reenviar autorizaciones de tu unidad.')
        elif role != 'admin':
            raise PermissionDenied('No tienes permiso para reenviar esta autorización.')
        refresh_status(visit)
        if visit.status in ('cancelada', 'vencida', 'agotada', 'completada'):
            raise ValidationError({'detail': 'No se puede reenviar una autorización que ya no está vigente.'})
        sent = send_visit_mail(visit)
        CondoVisitEvent.objects.create(
            visit=visit,
            event_type='reenviado',
            notes=f'Reenviado a {visit.visitor_email}',
            extra={'email_sent': bool(sent)},
            actor=request.user,
        )
        _audit(
            request, 'send_email',
            f'Correo de visita {visit.folio} reenviado a {visit.visitor_email}',
            tenant_id, 'CondoVisitAuth', visit.id, visit.folio,
        )
        data = serialize_visit(visit, request)
        data['email_sent'] = bool(sent)
        return Response(data)
