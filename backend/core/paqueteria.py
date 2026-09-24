"""Paquetería / Mensajería del condominio: recepción, notificación y entrega."""
from __future__ import annotations

import base64
import io
import secrets
from datetime import timedelta

from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from .asambleas import media_api_url
from .models import CondoPackage, CondoPackageEvent, Notification, Tenant, TenantUser, Unit, User
from .permissions import IsTenantMember

PHOTO_EXTS = {'.png', '.jpg', '.jpeg', '.webp', '.heic', '.gif'}
PHOTO_MAX = 12 * 1024 * 1024
WRITE_ROLES = ('admin', 'vigilante')


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


def can_write_packages(user, tenant_id):
    if not user:
        return False
    if getattr(user, 'is_super_admin', False):
        return True
    return tenant_role(user, tenant_id) in WRITE_ROLES


def can_delete_packages(user, tenant_id):
    """Solo el administrador del tenant (o superadmin) puede eliminar un paquete."""
    return tenant_role(user, tenant_id) == 'admin'


def resident_unit_id(user, tenant_id):
    tu = TenantUser.objects.filter(user=user, tenant_id=tenant_id).select_related('unit').first()
    if tu and tu.role == 'vecino' and tu.unit_id:
        return tu.unit_id
    return None


def _audit(request, action, description, tenant_id, object_type, object_id, object_repr, extra_data=None):
    from .views import _audit_log
    _audit_log(
        request, 'paqueteria', action, description,
        tenant_id=tenant_id, object_type=object_type,
        object_id=str(object_id) if object_id else '',
        object_repr=object_repr or '',
        extra_data=extra_data,
    )


QR_PREFIX = 'HOMLY-PKG:'


def new_qr_token():
    return secrets.token_urlsafe(16)


def ensure_qr_token(package):
    if package.qr_token:
        return package.qr_token
    package.qr_token = new_qr_token()
    package.save(update_fields=['qr_token', 'updated_at'])
    return package.qr_token


def qr_payload(token):
    return f'{QR_PREFIX}{token}'


def parse_qr_payload(raw):
    text = (raw or '').strip()
    upper = text.upper()
    for prefix in (QR_PREFIX, 'HOMLY:PKG:', 'HOMLY-PKG:'):
        if upper.startswith(prefix):
            return text[len(prefix):].strip()
    return text


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


def package_photo_inline(package, max_dim=900):
    """Return (bytes, subtype) for the reception photo, resized for email."""
    field = getattr(package, 'receive_photo', None)
    if not field:
        return None, None
    try:
        field.open('rb')
        data = field.read()
        field.close()
    except Exception:
        return None, None
    if not data:
        return None, None
    name = (getattr(field, 'name', '') or '').lower()
    subtype = 'jpeg' if name.endswith(('.jpg', '.jpeg')) else 'png'
    if name.endswith('.gif'):
        subtype = 'gif'
    if name.endswith('.webp'):
        subtype = 'webp'
    try:
        from PIL import Image
        img = Image.open(io.BytesIO(data))
        img = img.convert('RGB')
        img.thumbnail((max_dim, max_dim))
        out = io.BytesIO()
        img.save(out, format='JPEG', quality=78)
        return out.getvalue(), 'jpeg'
    except Exception:
        return data, subtype


def reminder_settings(tenant):
    return {
        'enabled': bool(getattr(tenant, 'package_reminder_enabled', False)),
        'after_hours': int(getattr(tenant, 'package_reminder_after_hours', 24) or 24),
        'repeat_hours': int(getattr(tenant, 'package_reminder_repeat_hours', 24) or 0),
        'max_count': int(getattr(tenant, 'package_reminder_max', 3) or 3),
    }


def next_package_folio(tenant):
    year = timezone.now().year
    if tenant.package_folio_year != year:
        tenant.package_folio_year = year
        tenant.package_folio_seq = 1
    else:
        tenant.package_folio_seq = (tenant.package_folio_seq or 0) + 1
    tenant.save(update_fields=['package_folio_year', 'package_folio_seq', 'updated_at'])
    return year, tenant.package_folio_seq, f'{year}-{tenant.package_folio_seq:04d}'


def validate_image(upload, field_name='photo'):
    if not upload:
        raise ValidationError({field_name: 'Este archivo es obligatorio.'})
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


def tenant_address(tenant):
    parts = [
        getattr(tenant, 'addr_calle', '') or '',
        getattr(tenant, 'addr_num_externo', '') or '',
        getattr(tenant, 'addr_colonia', '') or '',
        getattr(tenant, 'addr_ciudad', '') or getattr(tenant, 'info_ciudad', '') or '',
        getattr(tenant, 'addr_codigo_postal', '') or '',
    ]
    return ' '.join(p.strip() for p in parts if p and str(p).strip()).strip()


def unit_contacts(unit):
    """Contactos de la unidad (propietario, copropietario, inquilino y usuarios)."""
    contacts = []

    def add(key, kind, kind_label, first, last, email, phone, user_id=None):
        name = f'{first or ""} {last or ""}'.strip()
        email = (email or '').strip()
        phone = (phone or '').strip()
        if not (name or email or phone):
            return
        contacts.append({
            'key': key,
            'kind': kind,
            'kind_label': kind_label,
            'name': name,
            'email': email,
            'phone': phone,
            'user_id': str(user_id) if user_id else None,
            'has_email': bool(email),
        })

    add(
        'owner', 'propietario', 'Propietario',
        unit.owner_first_name, unit.owner_last_name,
        unit.owner_email, unit.owner_phone,
    )
    add(
        'coowner', 'copropietario', 'Copropietario',
        unit.coowner_first_name, unit.coowner_last_name,
        unit.coowner_email, unit.coowner_phone,
    )
    add(
        'tenant', 'inquilino', 'Inquilino',
        unit.tenant_first_name, unit.tenant_last_name,
        unit.tenant_email, unit.tenant_phone,
    )

    seen_emails = {c['email'].lower() for c in contacts if c['email']}
    for tu in TenantUser.objects.filter(tenant=unit.tenant, unit=unit).select_related('user'):
        user = tu.user
        email = (user.email or '').strip()
        if email and email.lower() in seen_emails:
            for c in contacts:
                if c['email'].lower() == email.lower() and not c['user_id']:
                    c['user_id'] = str(user.id)
            continue
        if email:
            seen_emails.add(email.lower())
        add(
            f'user:{user.id}', 'usuario', 'Usuario del sistema',
            user.name, '', email, '', user.id,
        )
    return contacts


def _actor_name(user):
    if not user:
        return '—'
    return (getattr(user, 'name', None) or getattr(user, 'email', None) or '—').strip()


class PackageEventSerializer(serializers.ModelSerializer):
    actor_name = serializers.SerializerMethodField()

    class Meta:
        model = CondoPackageEvent
        fields = ('id', 'event_type', 'notes', 'extra', 'actor_name', 'created_at')

    def get_actor_name(self, obj):
        return _actor_name(obj.actor)


class PackageSerializer(serializers.ModelSerializer):
    unit_code = serializers.CharField(source='unit.unit_id_code', read_only=True)
    unit_name = serializers.CharField(source='unit.unit_name', read_only=True)
    received_by_name = serializers.SerializerMethodField()
    delivered_by_name = serializers.SerializerMethodField()
    receive_photo_url = serializers.SerializerMethodField()
    delivery_signature_url = serializers.SerializerMethodField()
    events = PackageEventSerializer(many=True, read_only=True)
    status_label = serializers.SerializerMethodField()
    qr_payload = serializers.SerializerMethodField()
    qr_data_url = serializers.SerializerMethodField()
    delivery_method_label = serializers.SerializerMethodField()

    class Meta:
        model = CondoPackage
        fields = (
            'id', 'folio', 'status', 'status_label',
            'unit', 'unit_code', 'unit_name',
            'receive_notes', 'receive_photo_url', 'received_at', 'received_by_name',
            'delivery_notes', 'delivery_method', 'delivery_method_label',
            'delivery_signature_url', 'delivered_at', 'delivered_by_name',
            'qr_payload', 'qr_data_url',
            'events', 'created_at',
        )
        read_only_fields = fields

    def get_received_by_name(self, obj):
        return _actor_name(obj.received_by)

    def get_delivered_by_name(self, obj):
        return _actor_name(obj.delivered_by)

    def get_receive_photo_url(self, obj):
        return media_api_url(obj.receive_photo, self.context.get('request'))

    def get_delivery_signature_url(self, obj):
        return media_api_url(obj.delivery_signature, self.context.get('request'))

    def get_status_label(self, obj):
        return 'Entregado' if obj.status == 'entregado' else 'En vigilancia'

    def get_qr_payload(self, obj):
        return qr_payload(ensure_qr_token(obj))

    def get_qr_data_url(self, obj):
        return qr_data_url(ensure_qr_token(obj))

    def get_delivery_method_label(self, obj):
        if obj.delivery_method == 'qr':
            return 'Código QR'
        if obj.delivery_method == 'firma':
            return 'Firma'
        return ''


class PackageListSerializer(PackageSerializer):
    class Meta(PackageSerializer.Meta):
        fields = (
            'id', 'folio', 'status', 'status_label',
            'unit', 'unit_code', 'unit_name',
            'receive_notes', 'receive_photo_url', 'received_at', 'received_by_name',
            'delivered_at', 'delivered_by_name', 'created_at',
        )


def notify_package_recipients(tenant, package, recipients, actor):
    """Crea notificaciones in-app y envía correos. recipients: [{name, email, user_id}]."""
    from .email_service import send_package_received_email

    sent, skipped = [], []
    notified_users = set()
    received_at = timezone.localtime(package.received_at) if package.received_at else timezone.now()
    received_label = received_at.strftime('%d/%m/%Y %H:%M')
    title = f'Paquete {package.folio} en vigilancia'
    message = (
        f'Se recibió un paquete para {package.unit.unit_id_code} — {package.unit.unit_name}. '
        f'Folio {package.folio}. Recibido el {received_label}.'
    )
    if package.receive_notes:
        message += f' Nota: {package.receive_notes}'

    for rec in recipients:
        email = (rec.get('email') or '').strip()
        name = (rec.get('name') or email or 'Vecino').strip()
        user_id = rec.get('user_id')
        user = None
        if user_id:
            user = User.objects.filter(id=user_id).first()
        if not user and email:
            user = User.objects.filter(email__iexact=email).first()
            if user and not TenantUser.objects.filter(tenant=tenant, user=user).exists():
                user = None

        if user and user.id not in notified_users:
            Notification.objects.create(
                tenant=tenant,
                user=user,
                notif_type='package_received',
                title=title,
                message=message,
            )
            notified_users.add(user.id)

        if not email:
            skipped.append({'name': name, 'reason': 'sin correo'})
            continue

        ok = send_package_received_email(
            email=email,
            user_name=name,
            tenant=tenant,
            package=package,
            received_label=received_label,
        )
        if ok:
            sent.append({'name': name, 'email': email, 'user_id': str(user.id) if user else rec.get('user_id')})
        else:
            skipped.append({'name': name, 'email': email, 'reason': 'error de envío'})

    stored = [
        {'name': r.get('name') or '', 'email': (r.get('email') or '').strip(), 'user_id': r.get('user_id')}
        for r in recipients if (r.get('email') or '').strip() or r.get('user_id')
    ]
    package.notify_recipients = stored
    package.save(update_fields=['notify_recipients', 'updated_at'])

    CondoPackageEvent.objects.create(
        package=package,
        event_type='notificado',
        notes=f'Se notificó a {len(sent)} destinatario(s).' if sent else 'No se enviaron correos.',
        extra={'sent': sent, 'skipped': skipped},
        actor=actor,
    )
    return sent, skipped


class CondoPackageViewSet(viewsets.ModelViewSet):
    permission_classes = [IsTenantMember]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    http_method_names = ['get', 'post', 'patch', 'delete', 'head', 'options']

    def get_serializer_class(self):
        if self.action == 'list':
            return PackageListSerializer
        return PackageSerializer

    def get_queryset(self):
        tid = self.kwargs['tenant_id']
        qs = CondoPackage.objects.filter(tenant_id=tid).select_related(
            'unit', 'received_by', 'delivered_by',
        )
        if self.action in ('retrieve', 'deliver', 'notify', 'lookup'):
            qs = qs.prefetch_related('events__actor')
        user = request_user(self.request)
        role = tenant_role(user, tid)
        if role == 'vecino':
            uid = resident_unit_id(user, tid)
            qs = qs.filter(unit_id=uid) if uid else qs.none()
        status_filter = (self.request.query_params.get('status') or '').strip()
        if status_filter in ('recibido', 'entregado'):
            qs = qs.filter(status=status_filter)
        search = (self.request.query_params.get('search') or '').strip()
        if search:
            qs = qs.filter(
                Q(folio__icontains=search)
                | Q(unit__unit_id_code__icontains=search)
                | Q(unit__unit_name__icontains=search)
                | Q(receive_notes__icontains=search)
            )
        year = (self.request.query_params.get('year') or '').strip()
        if year.isdigit():
            qs = qs.filter(folio_year=int(year))
        return qs

    def create(self, request, tenant_id=None):
        if not can_write_packages(request.user, tenant_id):
            raise PermissionDenied('No tienes permiso para registrar paquetes.')
        tenant = Tenant.objects.get(id=tenant_id)
        _require_condominio(tenant)

        unit_id = request.data.get('unit') or request.data.get('unit_id')
        if not unit_id:
            raise ValidationError({'unit': 'Selecciona la casa o unidad.'})
        unit = Unit.objects.filter(tenant=tenant, id=unit_id, is_active=True).first()
        if not unit:
            raise ValidationError({'unit': 'La unidad no existe o está inactiva.'})

        photo = validate_image(request.FILES.get('photo') or request.FILES.get('receive_photo'), 'photo')
        notes = (request.data.get('notes') or request.data.get('receive_notes') or '').strip()

        with transaction.atomic():
            tenant = Tenant.objects.select_for_update().get(id=tenant_id)
            year, seq, folio = next_package_folio(tenant)
            pkg = CondoPackage(
                tenant=tenant,
                unit=unit,
                folio=folio,
                folio_year=year,
                folio_seq=seq,
                status='recibido',
                receive_notes=notes,
                received_by=request.user,
            )
            pkg.receive_photo = photo
            pkg.save()
            CondoPackageEvent.objects.create(
                package=pkg,
                event_type='recibido',
                notes=notes,
                extra={'unit_code': unit.unit_id_code, 'unit_name': unit.unit_name},
                actor=request.user,
            )

        _audit(
            request, 'create',
            f'Paquete {folio} recibido para {unit.unit_id_code}',
            tenant_id, 'CondoPackage', pkg.id, folio,
        )
        data = PackageSerializer(pkg, context={'request': request}).data
        data['contacts'] = unit_contacts(unit)
        return Response(data, status=status.HTTP_201_CREATED)

    def retrieve(self, request, *args, **kwargs):
        pkg = self.get_object()
        data = PackageSerializer(pkg, context={'request': request}).data
        data['contacts'] = unit_contacts(pkg.unit)
        return Response(data)

    @action(detail=False, methods=['get'], url_path='context')
    def context(self, request, tenant_id=None):
        tenant = Tenant.objects.get(id=tenant_id)
        _require_condominio(tenant)
        user = request.user
        role = tenant_role(user, tenant_id)
        qs = CondoPackage.objects.filter(tenant=tenant)
        if role == 'vecino':
            uid = resident_unit_id(user, tenant_id)
            qs = qs.filter(unit_id=uid) if uid else qs.none()
        return Response({
            'can_write': can_write_packages(user, tenant_id),
            'can_delete': can_delete_packages(user, tenant_id),
            'can_edit_settings': role in ('admin',) or getattr(user, 'is_super_admin', False),
            'notify_rules': tenant.package_notify_rules or '',
            'reminders': reminder_settings(tenant),
            'tenant_name': tenant.name,
            'counts': {
                'total': qs.count(),
                'recibido': qs.filter(status='recibido').count(),
                'entregado': qs.filter(status='entregado').count(),
            },
        })

    @action(detail=False, methods=['get', 'patch'], url_path='settings')
    def package_settings(self, request, tenant_id=None):
        tenant = Tenant.objects.get(id=tenant_id)
        _require_condominio(tenant)
        can_edit = tenant_role(request.user, tenant_id) == 'admin' or getattr(request.user, 'is_super_admin', False)
        if request.method == 'GET':
            return Response({
                'notify_rules': tenant.package_notify_rules or '',
                'reminders': reminder_settings(tenant),
                'can_edit': can_edit,
            })
        if not can_edit:
            raise PermissionDenied('Solo el administrador puede personalizar paquetería.')
        if 'notify_rules' in request.data:
            tenant.package_notify_rules = (request.data.get('notify_rules') or '').strip()
        rem = request.data.get('reminders') if isinstance(request.data.get('reminders'), dict) else request.data
        if rem is not None:
            if 'enabled' in rem or 'reminder_enabled' in rem:
                tenant.package_reminder_enabled = bool(rem.get('enabled', rem.get('reminder_enabled')))
            for src, field, lo, hi, default in (
                ('after_hours', 'package_reminder_after_hours', 1, 720, 24),
                ('repeat_hours', 'package_reminder_repeat_hours', 0, 720, 24),
                ('max_count', 'package_reminder_max', 1, 20, 3),
            ):
                if src in rem:
                    try:
                        val = int(rem.get(src))
                    except (TypeError, ValueError):
                        raise ValidationError({src: 'Indica un número válido.'})
                    if val < lo or val > hi:
                        raise ValidationError({src: f'Debe estar entre {lo} y {hi}.'})
                    setattr(tenant, field, val)
        tenant.save(update_fields=[
            'package_notify_rules', 'package_reminder_enabled',
            'package_reminder_after_hours', 'package_reminder_repeat_hours',
            'package_reminder_max', 'updated_at',
        ])
        _audit(request, 'update', 'Personalización de paquetería actualizada', tenant_id, 'Tenant', tenant.id, tenant.name)
        return Response({
            'notify_rules': tenant.package_notify_rules,
            'reminders': reminder_settings(tenant),
            'can_edit': True,
        })

    @action(detail=False, methods=['get'], url_path='unit-contacts')
    def unit_contacts_view(self, request, tenant_id=None):
        unit_id = request.query_params.get('unit') or request.query_params.get('unit_id')
        if not unit_id:
            raise ValidationError({'unit': 'Indica la unidad.'})
        unit = Unit.objects.filter(tenant_id=tenant_id, id=unit_id).first()
        if not unit:
            raise ValidationError({'unit': 'Unidad no encontrada.'})
        if tenant_role(request.user, tenant_id) == 'vecino':
            uid = resident_unit_id(request.user, tenant_id)
            if str(uid) != str(unit.id):
                raise PermissionDenied('Solo puedes ver los contactos de tu unidad.')
        return Response({'contacts': unit_contacts(unit)})

    @action(detail=True, methods=['post'], url_path='notify')
    def notify(self, request, tenant_id=None, pk=None):
        if not can_write_packages(request.user, tenant_id):
            raise PermissionDenied('No tienes permiso para notificar.')
        pkg = self.get_object()
        raw = request.data.get('recipients') or request.data.get('contacts') or []
        if not isinstance(raw, list) or not raw:
            raise ValidationError({'recipients': 'Selecciona al menos un destinatario.'})
        recipients = []
        for item in raw:
            if not isinstance(item, dict):
                continue
            email = (item.get('email') or '').strip()
            name = (item.get('name') or '').strip()
            if not email and not name:
                continue
            recipients.append({
                'name': name,
                'email': email,
                'user_id': item.get('user_id'),
            })
        if not recipients:
            raise ValidationError({'recipients': 'Selecciona destinatarios con nombre o correo.'})

        sent, skipped = notify_package_recipients(pkg.tenant, pkg, recipients, request.user)
        _audit(
            request, 'send_email',
            f'Notificación del paquete {pkg.folio} a {len(sent)} destinatario(s)',
            tenant_id, 'CondoPackage', pkg.id, pkg.folio,
        )
        pkg = CondoPackage.objects.prefetch_related('events__actor').select_related(
            'unit', 'received_by', 'delivered_by',
        ).get(pk=pkg.pk)
        data = PackageSerializer(pkg, context={'request': request}).data
        data['notify'] = {'sent': sent, 'skipped': skipped}
        return Response(data)

    @action(detail=False, methods=['get', 'post'], url_path='lookup')
    def lookup(self, request, tenant_id=None):
        if not can_write_packages(request.user, tenant_id):
            raise PermissionDenied('No tienes permiso para escanear paquetes.')
        raw = (
            (request.data.get('qr') if hasattr(request.data, 'get') else None)
            or request.query_params.get('qr')
            or request.query_params.get('token')
            or ''
        )
        token = parse_qr_payload(raw)
        if not token:
            raise ValidationError({'qr': 'Escanea o escribe el código del paquete.'})
        pkg = CondoPackage.objects.filter(tenant_id=tenant_id, qr_token=token).select_related(
            'unit', 'received_by', 'delivered_by',
        ).prefetch_related('events__actor').first()
        if not pkg:
            raise ValidationError({'qr': 'No se encontró un paquete con ese código.'})
        data = PackageSerializer(pkg, context={'request': request}).data
        data['contacts'] = unit_contacts(pkg.unit)
        return Response(data)

    @action(detail=True, methods=['post'], url_path='deliver')
    def deliver(self, request, tenant_id=None, pk=None):
        if not can_write_packages(request.user, tenant_id):
            raise PermissionDenied('No tienes permiso para registrar la entrega.')
        pkg = self.get_object()
        if pkg.status == 'entregado':
            raise ValidationError({'detail': 'Este paquete ya fue entregado.'})
        method = (request.data.get('method') or request.data.get('delivery_method') or 'firma').strip().lower()
        if method not in ('qr', 'firma'):
            raise ValidationError({'method': 'Elige entrega con QR o con firma.'})
        notes = (request.data.get('notes') or request.data.get('delivery_notes') or '').strip()
        signature = request.FILES.get('signature') or request.FILES.get('delivery_signature')
        if method == 'qr':
            token = parse_qr_payload(request.data.get('qr') or request.data.get('qr_token') or '')
            if not token or token != ensure_qr_token(pkg):
                raise ValidationError({'qr': 'El código QR no corresponde a este paquete.'})
        else:
            signature = validate_image(signature, 'signature')
        now = timezone.now()
        pkg.status = 'entregado'
        pkg.delivery_notes = notes
        pkg.delivery_method = method
        pkg.delivered_at = now
        pkg.delivered_by = request.user
        update = [
            'status', 'delivery_notes', 'delivery_method',
            'delivered_at', 'delivered_by', 'updated_at',
        ]
        if signature:
            pkg.delivery_signature = signature
            update.append('delivery_signature')
        pkg.save(update_fields=update)
        CondoPackageEvent.objects.create(
            package=pkg,
            event_type='entregado',
            notes=notes,
            extra={'method': method, 'signed': method == 'firma'},
            actor=request.user,
        )
        _audit(
            request, 'update',
            f'Paquete {pkg.folio} entregado a {pkg.unit.unit_id_code} ({method})',
            tenant_id, 'CondoPackage', pkg.id, pkg.folio,
        )
        pkg = CondoPackage.objects.prefetch_related('events__actor').select_related(
            'unit', 'received_by', 'delivered_by',
        ).get(pk=pkg.pk)
        return Response(PackageSerializer(pkg, context={'request': request}).data)

    def destroy(self, request, tenant_id=None, pk=None):
        if not can_delete_packages(request.user, tenant_id):
            raise PermissionDenied('Solo el administrador del condominio puede eliminar un paquete.')
        pkg = self.get_object()
        data = getattr(request, 'data', None) or {}
        comment = ''
        if hasattr(data, 'get'):
            comment = data.get('comment') or data.get('notes') or data.get('motivo') or ''
        if not comment:
            comment = request.query_params.get('comment') or ''
        comment = str(comment).strip()
        if len(comment) < 3:
            raise ValidationError({'comment': 'Escribe un comentario para el log del sistema (mínimo 3 caracteres).'})

        unit_code = pkg.unit.unit_id_code
        unit_name = pkg.unit.unit_name
        folio = pkg.folio
        pkg_id = pkg.id
        pkg_status = pkg.status
        extra = {
            'comment': comment,
            'folio': folio,
            'unit_code': unit_code,
            'unit_name': unit_name,
            'status': pkg_status,
            'received_at': pkg.received_at.isoformat() if pkg.received_at else None,
            'delivered_at': pkg.delivered_at.isoformat() if pkg.delivered_at else None,
        }

        if pkg.receive_photo:
            pkg.receive_photo.delete(save=False)
        if pkg.delivery_signature:
            pkg.delivery_signature.delete(save=False)
        pkg.delete()

        _audit(
            request, 'delete',
            f'Paquete {folio} eliminado ({unit_code} — {unit_name}). Comentario: {comment}',
            tenant_id, 'CondoPackage', pkg_id, folio,
            extra_data=extra,
        )
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['post'], url_path='delete')
    def delete_record(self, request, tenant_id=None, pk=None):
        return self.destroy(request, tenant_id=tenant_id, pk=pk)


def run_package_reminders():
    """Envía recordatorios de paquetes en vigilancia según la config de cada tenant."""
    from .email_service import send_package_received_email

    now = timezone.now()
    sent_total = 0
    tenants = Tenant.objects.filter(package_reminder_enabled=True)
    for tenant in tenants:
        if getattr(tenant, 'workspace_type', 'condominio') != 'condominio':
            continue
        cfg = reminder_settings(tenant)
        after = timedelta(hours=cfg['after_hours'])
        repeat = cfg['repeat_hours']
        max_count = cfg['max_count']
        pkgs = CondoPackage.objects.filter(tenant=tenant, status='recibido').select_related('unit', 'tenant')
        for pkg in pkgs:
            if not pkg.received_at or now - pkg.received_at < after:
                continue
            if (pkg.reminder_count or 0) >= max_count:
                continue
            if pkg.reminder_count:
                if not repeat:
                    continue
                last = pkg.last_reminded_at or pkg.received_at
                if now - last < timedelta(hours=repeat):
                    continue
            recipients = list(pkg.notify_recipients or [])
            if not recipients:
                continue
            received_label = timezone.localtime(pkg.received_at).strftime('%d/%m/%Y %H:%M')
            title = f'Recordatorio: paquete {pkg.folio} en vigilancia'
            message = (
                f'El paquete {pkg.folio} de {pkg.unit.unit_id_code} — {pkg.unit.unit_name} '
                f'sigue en caseta. Recibido el {received_label}.'
            )
            notified_users = set()
            emailed = []
            for rec in recipients:
                email = (rec.get('email') or '').strip()
                name = (rec.get('name') or email or 'Vecino').strip()
                user = None
                if rec.get('user_id'):
                    user = User.objects.filter(id=rec.get('user_id')).first()
                if not user and email:
                    user = User.objects.filter(email__iexact=email).first()
                if user and user.id not in notified_users:
                    Notification.objects.create(
                        tenant=tenant, user=user,
                        notif_type='package_reminder',
                        title=title, message=message,
                    )
                    notified_users.add(user.id)
                if email and send_package_received_email(
                    email=email, user_name=name, tenant=tenant,
                    package=pkg, received_label=received_label, is_reminder=True,
                ):
                    emailed.append(email)
            pkg.reminder_count = (pkg.reminder_count or 0) + 1
            pkg.last_reminded_at = now
            pkg.save(update_fields=['reminder_count', 'last_reminded_at', 'updated_at'])
            CondoPackageEvent.objects.create(
                package=pkg,
                event_type='recordatorio',
                notes=f'Recordatorio automático #{pkg.reminder_count} a {len(emailed)} destinatario(s).',
                extra={'sent': emailed, 'count': pkg.reminder_count},
            )
            sent_total += 1
    return sent_total
