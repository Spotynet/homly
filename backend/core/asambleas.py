"""Asambleas del condominio: convocatoria, desarrollo, minuta de trabajo y acta formal."""
from __future__ import annotations

import math
import os
import re
from datetime import date, timedelta

from django.db.models import Sum
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from .asamblea_normativa import resolve_assembly_rules
from .models import (
    AssemblyPosition, ClosedPeriod, Committee, CondoAssembly,
    CondoAssemblyAgendaItem, CondoAssemblyAttendee, CondoAssemblyFile,
    CondoBudget, CondoProject, ExtraField, Tenant, TenantUser, Unit,
)
from .permissions import IsAdminOrTesOrAuditor, IsTenantMember

FILE_MAX = 20 * 1024 * 1024
FILE_EXTS = {'.pdf', '.png', '.jpg', '.jpeg', '.webp', '.doc', '.docx', '.xls', '.xlsx', '.zip'}
RESIDENT_STATUSES = ('convocada', 'en_curso', 'cerrada')
LOCKED_STATUSES = ('cerrada', 'cancelada')


def _require_condominio(tenant):
    if getattr(tenant, 'workspace_type', 'condominio') != 'condominio':
        raise ValidationError({'detail': 'Este módulo solo aplica al espacio de condominios.'})


def _audit(request, action, description, tenant_id, object_type, object_id, object_repr):
    from .views import _audit_log
    _audit_log(
        request, 'asambleas', action, description,
        tenant_id=tenant_id, object_type=object_type,
        object_id=str(object_id), object_repr=object_repr,
    )


def _f(n):
    try:
        return float(n or 0)
    except (TypeError, ValueError):
        return 0.0


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


def can_write_assemblies(user, tenant_id):
    if not user:
        return False
    if getattr(user, 'is_super_admin', False):
        return True
    return tenant_role(user, tenant_id) in ('admin', 'tesorero')


def media_api_url(file_field, request=None):
    if not file_field:
        return None
    path = f'/api/media/{file_field.name}'
    if request:
        return request.build_absolute_uri(path)
    return path


def assembly_rules_for(tenant):
    return resolve_assembly_rules(tenant.country, tenant.state)


def default_notice_days(rules, kind):
    if kind == 'extraordinaria':
        return int(rules.get('notice_days_extraordinary') or 8)
    return int(rules.get('notice_days_ordinary') or 10)


def vote_thresholds(present, rules):
    """Mayorías de votación sobre los presentes (no es el quórum de instalación)."""
    n = int(present or 0)
    qual_pct = _f((rules or {}).get('qualified_majority_pct') or 75)
    simple_need = (n // 2) + 1 if n else 0
    qual_need = int(math.ceil(n * qual_pct / 100.0)) if n else 0
    return {
        'present': n,
        'simple_need': simple_need,
        'simple_label': '50% + 1 de los presentes',
        'qualified_pct': qual_pct,
        'qualified_need': qual_need,
        'qualified_label': f'{int(qual_pct) if qual_pct == int(qual_pct) else qual_pct}% de los presentes',
        'unanimity_need': n,
    }


def resolve_vote_result(vote_type, votes_for, votes_against, votes_abstain, present, rules):
    th = vote_thresholds(present, rules)
    vf, va, vb = int(votes_for or 0), int(votes_against or 0), int(votes_abstain or 0)
    if vote_type == 'informativo':
        return 'aprobado', th, 'Punto informativo: se da cuenta a la asamblea, sin votación.'
    if vote_type == 'unanimidad':
        ok = present > 0 and va == 0 and vf >= th['unanimity_need']
        return (
            'aprobado' if ok else 'rechazado',
            th,
            f'Se requieren {th["unanimity_need"]} votos a favor y ninguno en contra.',
        )
    if vote_type == 'calificada':
        ok = present > 0 and vf >= th['qualified_need']
        return (
            'aprobado' if ok else 'rechazado',
            th,
            f'Se requieren {th["qualified_need"]} votos a favor ({th["qualified_label"]}).',
        )
    ok = present > 0 and vf >= th['simple_need']
    return (
        'aprobado' if ok else 'rechazado',
        th,
        f'Se requieren {th["simple_need"]} votos a favor ({th["simple_label"]}).',
    )


def quorum_snapshot(assembly):
    qs = assembly.attendees.exclude(capacity='invitado')
    total = qs.count()
    present_qs = qs.filter(present=True)
    present = present_qs.count()
    total_w = _f(qs.aggregate(s=Sum('vote_weight'))['s']) or float(total)
    present_w = _f(present_qs.aggregate(s=Sum('vote_weight'))['s'])
    pct = round((present_w / total_w) * 100, 2) if total_w else 0
    rules = assembly.legal_snapshot or {}
    first_need = _f(rules.get('first_quorum_pct') or 75)
    second_need = _f(rules.get('second_quorum_pct') or 51)
    required = second_need if assembly.call_number >= 2 else first_need
    th = vote_thresholds(present, rules)
    return {
        'total': total,
        'present': present,
        'total_weight': round(total_w, 4),
        'present_weight': round(present_w, 4),
        'present_pct': pct,
        'required_pct': required,
        'met': pct + 0.0001 >= required if required else True,
        'call_number': assembly.call_number,
        'call_label': '2ª convocatoria' if assembly.call_number >= 2 else '1ª convocatoria',
        'install_first_pct': first_need,
        'install_second_pct': second_need,
        'vote': th,
        'simple_majority_pct': _f(rules.get('simple_majority_pct') or 50),
        'qualified_majority_pct': th['qualified_pct'],
    }


def seed_attendees(assembly, tenant):
    existing = set(
        str(uid) for uid in assembly.attendees.filter(unit_id__isnull=False).values_list('unit_id', flat=True)
    )
    created = 0
    for unit in Unit.objects.filter(tenant=tenant, is_active=True).order_by('unit_id_code'):
        if str(unit.id) in existing:
            continue
        CondoAssemblyAttendee.objects.create(
            assembly=assembly,
            unit=unit,
            attendee_name=unit.responsible_name or unit.unit_name,
            capacity='propietario',
            vote_weight=1,
        )
        created += 1
    return created


def notify_assembly(tenant, notif_type, title, message):
    from .views import _notify_roles
    _notify_roles(
        tenant.id,
        ['admin', 'tesorero', 'contador', 'auditor', 'vecino'],
        notif_type, title, message,
    )


def tenant_common_areas(tenant):
    """Áreas comunes activas de la configuración del condominio."""
    raw = tenant.common_areas or []
    if isinstance(raw, str):
        raw = [part.strip() for part in raw.split(',') if part.strip()]
    out = []
    seen = set()
    for item in raw:
        if isinstance(item, str) and item.strip():
            name = item.strip()
            ident = name
            if ident in seen:
                continue
            seen.add(ident)
            out.append({'id': ident, 'name': name})
            continue
        if not isinstance(item, dict):
            continue
        name = (item.get('name') or '').strip()
        if not name or item.get('active') is False:
            continue
        ident = str(item.get('id') or name)
        if ident in seen:
            continue
        seen.add(ident)
        out.append({'id': ident, 'name': name})
    return out


def assembly_link_catalog(tenant):
    """Objetos de otros módulos que se pueden llevar al orden del día."""
    budgets = []
    for b in CondoBudget.objects.filter(tenant=tenant).exclude(status='archivado').order_by('-year', '-created_at')[:40]:
        from .planeacion import compute_budget_totals
        totals = compute_budget_totals(b)
        budgets.append({
            'id': str(b.id),
            'year': b.year,
            'name': b.name or f'Presupuesto {b.year}',
            'status': b.status,
            'income': totals.get('income'),
            'expense': totals.get('expense'),
            'surplus': totals.get('surplus'),
        })
    projects = []
    for p in CondoProject.objects.filter(tenant=tenant).exclude(
        status__in=('cancelado', 'concluido'),
    ).select_related('winner_quote').prefetch_related('budgets').order_by('-created_at')[:40]:
        linked = sorted(p.budgets.all(), key=lambda b: (-int(b.year or 0), b.name or ''))
        projects.append({
            'id': str(p.id),
            'name': p.name,
            'status': p.status,
            'priority': p.priority,
            'budget_amount': _f(p.budget_amount),
            'funding_mode': p.funding_mode,
            'contest_status': p.contest_status,
            'winner_supplier_name': p.winner_quote.supplier_name if p.winner_quote_id else '',
            'start_period': p.start_period,
            'end_period': p.end_period,
            'budget_names': [b.name or f'Presupuesto {b.year}' for b in linked],
        })
    periods = list(
        ClosedPeriod.objects.filter(tenant=tenant).order_by('-period')[:18].values('id', 'period', 'closed_at')
    )
    for row in periods:
        row['id'] = str(row['id'])
        if row.get('closed_at'):
            row['closed_at'] = row['closed_at'].isoformat()
    quotas = []
    for f in ExtraField.objects.filter(tenant=tenant, enabled=True).order_by('sort_order', 'label'):
        quotas.append({
            'id': str(f.id),
            'label': f.label,
            'field_type': f.field_type,
            'default_amount': _f(f.default_amount),
            'required': f.required,
        })
    positions = []
    for pos in AssemblyPosition.objects.filter(tenant=tenant, active=True).select_related('committee', 'holder_unit'):
        positions.append({
            'id': str(pos.id),
            'title': pos.title,
            'holder_name': pos.holder_name,
            'committee': pos.committee.name if pos.committee_id else '',
            'unit': pos.holder_unit.unit_id_code if pos.holder_unit_id else '',
        })
    committees = list(
        Committee.objects.filter(tenant=tenant).values('id', 'name', 'members')[:20]
    )
    for c in committees:
        c['id'] = str(c['id'])
    return {
        'budgets': budgets,
        'projects': projects,
        'periods': periods,
        'quotas': quotas,
        'positions': positions,
        'committees': committees,
    }


def resolve_source_item(tenant, kind, source_id):
    if not source_id:
        return None
    from django.core.exceptions import ValidationError as DjangoValidationError
    try:
        if kind == 'presupuesto':
            return CondoBudget.objects.filter(tenant=tenant, id=source_id).first()
        if kind == 'proyecto':
            return CondoProject.objects.filter(tenant=tenant, id=source_id).first()
        if kind == 'cierre':
            return ClosedPeriod.objects.filter(tenant=tenant, id=source_id).first()
        if kind == 'cuota':
            return ExtraField.objects.filter(tenant=tenant, id=source_id).first()
        if kind == 'organizacion':
            return (
                AssemblyPosition.objects.filter(tenant=tenant, id=source_id).first()
                or Committee.objects.filter(tenant=tenant, id=source_id).first()
            )
    except (DjangoValidationError, ValueError, TypeError):
        return None
    return None


def snapshot_source(kind, obj):
    if not obj:
        return '', {}
    if kind == 'presupuesto':
        from .planeacion import compute_budget_totals
        totals = compute_budget_totals(obj)
        return (obj.name or f'Presupuesto {obj.year}'), {
            'year': obj.year, 'status': obj.status,
            'income': totals.get('income'), 'expense': totals.get('expense'),
        }
    if kind == 'proyecto':
        return obj.name, {
            'status': obj.status, 'budget_amount': _f(obj.budget_amount),
            'funding_mode': obj.funding_mode, 'contest_status': obj.contest_status,
        }
    if kind == 'cierre':
        return f'Cierre {obj.period}', {'period': obj.period}
    if kind == 'cuota':
        return obj.label, {'field_type': obj.field_type, 'default_amount': _f(obj.default_amount)}
    if kind == 'organizacion':
        title = getattr(obj, 'title', None) or getattr(obj, 'name', '')
        return title, {'holder_name': getattr(obj, 'holder_name', '') or getattr(obj, 'members', '')}
    return str(obj), {}


VOTE_LABEL_ES = {
    'informativo': 'Informativo',
    'simple': 'Mayoría simple',
    'calificada': 'Mayoría calificada',
    'unanimidad': 'Unanimidad',
}
RESULT_LABEL_ES = {
    'pendiente': 'Pendiente',
    'aprobado': 'Aprobado',
    'rechazado': 'Rechazado',
    'diferido': 'Diferido',
}
SOURCE_LABEL_ES = {
    'presupuesto': 'Presupuesto de Planeación',
    'proyecto': 'Proyecto de Planeación',
    'cierre': 'Cierre de período',
    'cuota': 'Cuota',
    'organizacion': 'Organización',
}
BALLOT_LABEL_ES = {
    'for': 'a favor',
    'against': 'en contra',
    'abstain': 'abstención',
}


def compile_agenda_record(item, formal=False):
    kind = SOURCE_LABEL_ES.get(item.source_kind) or ''
    heading = 'ACUERDO' if formal else 'PUNTO'
    lines = [f'{heading}: {item.title}']
    if kind:
        origin = f'Origen: {kind}'
        if item.source_label:
            origin += f' — {item.source_label}'
        lines.append(origin)
    if item.description:
        lines.append(item.description.strip())
    lines.append(f'Tipo de votación: {VOTE_LABEL_ES.get(item.vote_type, item.vote_type)}')
    if item.vote_type == 'informativo':
        lines.append('Punto informativo (sin votación).')
    else:
        lines.append(f'Resultado: {RESULT_LABEL_ES.get(item.result, item.result)}')
        lines.append(
            f'Votos: a favor {item.votes_for or 0}, en contra {item.votes_against or 0}, '
            f'abstenciones {item.votes_abstain or 0}.'
        )
        detail = item.vote_detail or []
        if detail:
            lines.append('Detalle por unidad:')
            for ballot in detail:
                unit = (ballot.get('unit_code') or '—').strip()
                name = (ballot.get('name') or '').strip()
                who = f'{unit} {name}'.strip()
                choice = BALLOT_LABEL_ES.get(ballot.get('choice'), ballot.get('choice') or '')
                lines.append(f'  · {who}: {choice}')
    if item.notes:
        lines.append(f'Notas de minuta: {item.notes.strip()}')
    if item.applied_notes:
        lines.append(item.applied_notes.strip())
    return '\n'.join(lines)


def upsert_vote_block(text, item_id, block):
    token = str(item_id)[:8]
    start = f'«Registro de votación {token}»'
    end = f'«Fin de votación {token}»'
    chunk = f'{start}\n{block}\n{end}'
    current = text or ''
    pattern = re.compile(re.escape(start) + r'.*?' + re.escape(end), re.S)
    if pattern.search(current):
        return pattern.sub(chunk, current, count=1)
    sep = '\n\n' if current.strip() else ''
    return current.rstrip() + sep + chunk + '\n'


def record_vote_in_documents(assembly, item):
    """Escribe el desahogo en la minuta de trabajo. El acta formal se redacta aparte."""
    minuta = compile_agenda_record(item, formal=False)
    minute_body = assembly.minute_body or ''
    if not minute_body.strip():
        minute_body = (
            f'Minuta de trabajo · {assembly.title}\n'
            'Documento interno de la sesión. No sustituye el acta ni se protocoliza.\n\n'
        )
    assembly.minute_body = upsert_vote_block(minute_body, item.id, minuta)
    assembly.save(update_fields=['minute_body', 'updated_at'])
    return assembly


def add_source_to_assembly(assembly, kind, source_id, extra=None):
    extra = extra or {}
    if kind not in ('presupuesto', 'proyecto'):
        raise ValidationError({'detail': 'Solo se pueden incluir presupuestos o proyectos de Planeación.'})
    if assembly.status in LOCKED_STATUSES:
        raise ValidationError({'detail': 'Esta asamblea ya no admite puntos en el orden del día.'})
    obj = resolve_source_item(assembly.tenant, kind, source_id)
    if not obj:
        raise ValidationError({'detail': 'No se encontró el presupuesto o el proyecto.'})
    if assembly.agenda.filter(source_kind=kind, source_id=obj.id).exists():
        raise ValidationError({'detail': 'Ese registro ya está en el orden del día de esta asamblea.'})
    label, meta = snapshot_source(kind, obj)
    if kind == 'presupuesto':
        title = extra.get('title') or f'Aprobación del presupuesto: {label} ({getattr(obj, "year", "")})'
        description = extra.get('description') or (
            f'Escenario {obj.status}. Ingresos {meta.get("income") or "—"} · Gastos {meta.get("expense") or "—"}.'
        )
    else:
        title = extra.get('title') or f'Aprobación del proyecto: {label}'
        description = extra.get('description') or ''
    vote = extra.get('vote_type') if extra.get('vote_type') in dict(CondoAssemblyAgendaItem.VOTE_CHOICES) else 'calificada'
    item = CondoAssemblyAgendaItem.objects.create(
        assembly=assembly,
        sort_order=assembly.agenda.count(),
        title=str(title)[:240],
        description=str(description)[:4000],
        vote_type=vote,
        source_kind=kind,
        source_id=obj.id,
        source_label=(label or '')[:240],
        source_meta=meta if isinstance(meta, dict) else {},
        apply_on_approve=True,
    )
    return item


def apply_linked_module(item, assembly, user, result):
    """Aplica el acuerdo al módulo origen solo si el perfil puede escribir y el punto lo pide."""
    if item.applied_status == 'aplicado':
        return item
    if item.source_kind in ('manual', '') or not item.source_id:
        item.applied_status = 'omitido'
        item.applied_notes = 'Punto manual: queda solo en el acta.'
        item.save(update_fields=['applied_status', 'applied_notes'])
        return item
    if not item.apply_on_approve:
        item.applied_status = 'omitido'
        item.applied_notes = 'Queda constancia en el acta; no se pidió actualizar el módulo origen.'
        item.save(update_fields=['applied_status', 'applied_notes'])
        return item
    if result not in ('aprobado', 'rechazado'):
        return item
    obj = resolve_source_item(assembly.tenant, item.source_kind, item.source_id)
    if not obj:
        item.applied_status = 'error'
        item.applied_notes = 'El registro original ya no existe en el módulo.'
        item.save(update_fields=['applied_status', 'applied_notes'])
        return item
    try:
        if item.source_kind == 'presupuesto':
            from .planeacion import mark_budget_approved
            if result == 'aprobado':
                if obj.status != 'aprobado':
                    mark_budget_approved(obj, user)
                item.applied_notes = f'Presupuesto {obj.year} marcado como aprobado por la asamblea.'
            else:
                if obj.status == 'en_aprobacion':
                    obj.status = 'guardado'
                    obj.save(update_fields=['status', 'updated_at'])
                    item.applied_notes = 'El escenario volvió a guardado tras el rechazo de la asamblea.'
                else:
                    item.applied_notes = 'Rechazado en asamblea; el escenario no se aprobó.'
            item.applied_status = 'aplicado'
        elif item.source_kind == 'proyecto':
            if result == 'aprobado':
                if obj.status in ('idea', 'en_aprobacion'):
                    obj.status = 'aprobado'
                    obj.save(update_fields=['status', 'updated_at'])
                item.applied_notes = f'Proyecto «{obj.name}» aprobado por la asamblea.'
            else:
                if obj.status == 'en_aprobacion':
                    obj.status = 'idea'
                    obj.save(update_fields=['status', 'updated_at'])
                item.applied_notes = f'Proyecto «{obj.name}» no autorizado por la asamblea.'
            item.applied_status = 'aplicado'
        else:
            item.applied_status = 'omitido'
            item.applied_notes = 'El acuerdo queda en el acta; este tipo de punto no modifica el módulo automáticamente.'
        item.applied_at = timezone.now()
        item.save(update_fields=['applied_status', 'applied_at', 'applied_notes'])
    except Exception as exc:
        item.applied_status = 'error'
        item.applied_notes = str(exc)[:400]
        item.save(update_fields=['applied_status', 'applied_notes'])
    return item


class CondoAssemblyAgendaSerializer(serializers.ModelSerializer):
    class Meta:
        model = CondoAssemblyAgendaItem
        fields = (
            'id', 'sort_order', 'title', 'description', 'vote_type',
            'result', 'votes_for', 'votes_against', 'votes_abstain', 'notes',
            'vote_detail',
            'source_kind', 'source_id', 'source_label', 'source_meta',
            'apply_on_approve', 'applied_status', 'applied_at', 'applied_notes',
        )
        read_only_fields = ('id', 'applied_status', 'applied_at', 'applied_notes', 'vote_detail')


class CondoAssemblyAttendeeSerializer(serializers.ModelSerializer):
    unit_id = serializers.UUIDField(required=False, allow_null=True)
    unit_code = serializers.SerializerMethodField()
    unit_name = serializers.SerializerMethodField()

    class Meta:
        model = CondoAssemblyAttendee
        fields = (
            'id', 'unit_id', 'unit_code', 'unit_name', 'attendee_name',
            'capacity', 'proxy_name', 'present', 'vote_weight', 'signed_in_at',
        )
        read_only_fields = ('id', 'signed_in_at')

    def get_unit_code(self, obj):
        return obj.unit.unit_id_code if obj.unit_id else ''

    def get_unit_name(self, obj):
        return obj.unit.unit_name if obj.unit_id else ''


class CondoAssemblyFileSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()
    uploaded_by_name = serializers.SerializerMethodField()

    class Meta:
        model = CondoAssemblyFile
        fields = (
            'id', 'kind', 'original_name', 'notes', 'file_url',
            'uploaded_by_name', 'created_at',
        )
        read_only_fields = ('id', 'created_at')

    def get_file_url(self, obj):
        return media_api_url(obj.file, self.context.get('request'))

    def get_uploaded_by_name(self, obj):
        u = obj.uploaded_by
        return (getattr(u, 'name', None) or getattr(u, 'email', '') or '') if u else ''


class CondoAssemblySerializer(serializers.ModelSerializer):
    agenda = CondoAssemblyAgendaSerializer(many=True, read_only=True)
    attendees = CondoAssemblyAttendeeSerializer(many=True, read_only=True)
    files = CondoAssemblyFileSerializer(many=True, read_only=True)
    quorum = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()
    attendees_count = serializers.SerializerMethodField()
    present_count = serializers.SerializerMethodField()

    class Meta:
        model = CondoAssembly
        fields = (
            'id', 'title', 'kind', 'year', 'status', 'location',
            'first_call_at', 'second_call_at', 'call_number',
            'notice_issued_at', 'notice_days', 'delivery_methods',
            'issued_by_name', 'president_name', 'secretary_name',
            'legal_snapshot', 'minute_body', 'acta_body', 'minute_status',
            'minute_signed_at', 'protocolized', 'notary_name', 'notary_folio',
            'installed_at', 'closed_at', 'notes',
            'created_by_name', 'created_at', 'updated_at',
            'quorum', 'attendees_count', 'present_count',
            'agenda', 'attendees', 'files',
        )
        read_only_fields = (
            'id', 'status', 'call_number', 'notice_issued_at', 'legal_snapshot',
            'minute_status', 'minute_signed_at', 'protocolized',
            'installed_at', 'closed_at', 'created_at', 'updated_at',
        )

    def get_quorum(self, obj):
        return quorum_snapshot(obj)

    def get_created_by_name(self, obj):
        u = obj.created_by
        return (getattr(u, 'name', None) or getattr(u, 'email', '') or '') if u else ''

    def get_attendees_count(self, obj):
        return obj.attendees.exclude(capacity='invitado').count()

    def get_present_count(self, obj):
        return obj.attendees.exclude(capacity='invitado').filter(present=True).count()


class CondoAssemblyListSerializer(CondoAssemblySerializer):
    class Meta(CondoAssemblySerializer.Meta):
        fields = (
            'id', 'title', 'kind', 'year', 'status', 'location',
            'first_call_at', 'second_call_at', 'call_number',
            'notice_issued_at', 'notice_days', 'issued_by_name',
            'minute_status', 'protocolized', 'created_at',
            'quorum', 'attendees_count', 'present_count',
        )


class AsambleaContextView(APIView):
    permission_classes = [IsTenantMember]

    def get(self, request, tenant_id):
        tenant = Tenant.objects.get(id=tenant_id)
        _require_condominio(tenant)
        rules = assembly_rules_for(tenant)
        units = list(
            Unit.objects.filter(tenant=tenant, is_active=True)
            .order_by('unit_id_code')
            .values('id', 'unit_id_code', 'unit_name', 'owner_first_name', 'owner_last_name')
        )
        for u in units:
            u['id'] = str(u['id'])
            u['owner'] = f"{u.pop('owner_first_name', '')} {u.pop('owner_last_name', '')}".strip()
        counts = {
            'borrador': 0, 'convocada': 0, 'en_curso': 0, 'cerrada': 0, 'cancelada': 0,
        }
        for row in CondoAssembly.objects.filter(tenant=tenant).values('status'):
            st = row['status']
            if st in counts:
                counts[st] += 1
        return Response({
            'country': tenant.country or '',
            'state': tenant.state or '',
            'name': tenant.name,
            'razon_social': tenant.razon_social or '',
            'rules': rules,
            'units': units,
            'units_count': len(units),
            'counts': counts,
            'can_write': can_write_assemblies(request.user, tenant_id),
            'catalog': assembly_link_catalog(tenant),
            'common_areas': tenant_common_areas(tenant),
        })


class CondoAssemblyViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAdminOrTesOrAuditor]
    pagination_class = None

    def get_permissions(self):
        if self.action in ('list', 'retrieve', 'files', 'print_doc') and self.request.method == 'GET':
            return [IsTenantMember()]
        return super().get_permissions()

    def get_queryset(self):
        qs = CondoAssembly.objects.filter(
            tenant_id=self.kwargs['tenant_id']
        ).select_related('created_by').prefetch_related(
            'agenda', 'attendees__unit', 'files__uploaded_by',
        )
        if not can_write_assemblies(self.request.user, self.kwargs['tenant_id']):
            qs = qs.filter(status__in=RESIDENT_STATUSES)
        st = self.request.query_params.get('status')
        if st:
            qs = qs.filter(status=st)
        year = self.request.query_params.get('year')
        if year:
            try:
                qs = qs.filter(year=int(year))
            except (TypeError, ValueError):
                pass
        return qs

    def get_serializer_class(self):
        if self.action == 'list':
            return CondoAssemblyListSerializer
        return CondoAssemblySerializer

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx['request'] = self.request
        return ctx

    def _full(self, assembly):
        fresh = self.get_queryset().filter(pk=assembly.pk).first() or assembly
        return CondoAssemblySerializer(fresh, context=self.get_serializer_context()).data

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        assembly = CondoAssembly.objects.filter(pk=serializer.instance.pk).first() or serializer.instance
        return Response(self._full(assembly), status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return Response(self._full(serializer.instance))

    def perform_create(self, serializer):
        tenant = Tenant.objects.get(id=self.kwargs['tenant_id'])
        _require_condominio(tenant)
        rules = assembly_rules_for(tenant)
        kind = serializer.validated_data.get('kind') or 'ordinaria'
        year = serializer.validated_data.get('year') or date.today().year
        notice_days = serializer.validated_data.get('notice_days') or default_notice_days(rules, kind)
        assembly = serializer.save(
            tenant=tenant,
            year=year,
            notice_days=notice_days,
            legal_snapshot=rules,
            created_by=request_user(self.request),
            delivery_methods=serializer.validated_data.get('delivery_methods') or list(rules.get('delivery') or []),
        )
        agenda = self.request.data.get('agenda')
        if isinstance(agenda, list):
            self._replace_agenda(assembly, agenda)
        else:
            for i, title in enumerate(rules.get('typical_ordinary_topics') or []):
                CondoAssemblyAgendaItem.objects.create(
                    assembly=assembly, sort_order=i, title=title,
                    vote_type='informativo' if i == 0 else 'simple',
                )
        seed_attendees(assembly, tenant)
        _audit(
            self.request, 'create', f'Asamblea creada: {assembly.title}',
            tenant.id, 'CondoAssembly', assembly.id, assembly.title,
        )

    def perform_update(self, serializer):
        inst = serializer.instance
        if inst.status in LOCKED_STATUSES:
            raise ValidationError({'detail': 'Esta asamblea ya no se puede editar.'})
        agenda = self.request.data.get('agenda')
        instance = serializer.save()
        if isinstance(agenda, list):
            self._replace_agenda(instance, agenda)
        _audit(
            self.request, 'update', f'Asamblea actualizada: {instance.title}',
            instance.tenant_id, 'CondoAssembly', instance.id, instance.title,
        )

    def perform_destroy(self, instance):
        if instance.status == 'cerrada':
            raise ValidationError({'detail': 'No se puede eliminar una asamblea cerrada. Consérvala en el historial.'})
        desc = instance.title
        oid = instance.id
        tid = instance.tenant_id
        instance.delete()
        _audit(self.request, 'delete', f'Asamblea eliminada: {desc}', tid, 'CondoAssembly', oid, desc)

    def _replace_agenda(self, assembly, items):
        tenant = assembly.tenant
        keep_ids = []
        for i, raw in enumerate(items):
            if not isinstance(raw, dict):
                continue
            title = (raw.get('title') or '').strip()
            kind = raw.get('source_kind') if raw.get('source_kind') in dict(CondoAssemblyAgendaItem.SOURCE_CHOICES) else 'manual'
            source_id = raw.get('source_id') or None
            obj = resolve_source_item(tenant, kind, source_id) if kind != 'manual' else None
            label, meta = snapshot_source(kind, obj) if obj else (raw.get('source_label') or '', raw.get('source_meta') or {})
            if not isinstance(meta, dict):
                meta = {}
            if not title:
                title = label
            if not title:
                continue
            vote = raw.get('vote_type') if raw.get('vote_type') in dict(CondoAssemblyAgendaItem.VOTE_CHOICES) else 'simple'
            apply_flag = bool(raw.get('apply_on_approve'))
            if kind in ('presupuesto', 'proyecto') and 'apply_on_approve' not in raw:
                apply_flag = True
            fields = {
                'sort_order': raw.get('sort_order', i),
                'title': title[:240],
                'description': (raw.get('description') or '')[:4000],
                'vote_type': vote,
                'source_kind': kind,
                'source_id': obj.id if obj else None,
                'source_label': (label or '')[:240],
                'source_meta': meta,
                'apply_on_approve': apply_flag,
            }
            existing = None
            raw_id = raw.get('id')
            if raw_id:
                existing = assembly.agenda.filter(id=raw_id).first()
            if existing:
                for key, val in fields.items():
                    setattr(existing, key, val)
                existing.save()
                keep_ids.append(existing.id)
            else:
                created = CondoAssemblyAgendaItem.objects.create(assembly=assembly, **fields)
                keep_ids.append(created.id)
        assembly.agenda.exclude(id__in=keep_ids).delete()

    @action(detail=True, methods=['post'], url_path='add-from-planeacion')
    def add_from_planeacion(self, request, tenant_id, pk=None):
        assembly = self.get_object()
        kind = request.data.get('source_kind')
        source_id = request.data.get('source_id')
        if not source_id:
            return Response({'detail': 'Indica el presupuesto o proyecto (source_id).'}, status=400)
        item = add_source_to_assembly(assembly, kind, source_id, request.data)
        _audit(
            request, 'update',
            f'{item.source_kind} «{item.source_label}» agregado a {assembly.title}',
            tenant_id, 'CondoAssembly', assembly.id, assembly.title,
        )
        return Response(self._full(assembly), status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='publish-notice')
    def publish_notice(self, request, tenant_id, pk=None):
        assembly = self.get_object()
        if assembly.status not in ('borrador', 'convocada'):
            return Response({'detail': 'Solo un borrador o convocatoria se puede emitir.'}, status=400)
        if not assembly.first_call_at:
            return Response({'detail': 'Indica fecha y hora de la primera convocatoria.'}, status=400)
        if not assembly.location:
            return Response({'detail': 'Indica el lugar de la reunión.'}, status=400)
        if not assembly.agenda.exists():
            return Response({'detail': 'Agrega al menos un punto del orden del día.'}, status=400)
        now = timezone.now()
        meeting = assembly.first_call_at
        if meeting.tzinfo is None:
            meeting = timezone.make_aware(meeting)
        min_days = assembly.notice_days or default_notice_days(assembly.legal_snapshot or {}, assembly.kind)
        if meeting < now + timedelta(days=int(min_days)):
            return Response({
                'detail': (
                    f'La normativa de {assembly.legal_snapshot.get("jurisdiction", "tu entidad")} '
                    f'pide al menos {min_days} día(s) de anticipación.'
                ),
            }, status=400)
        assembly.status = 'convocada'
        assembly.notice_issued_at = now
        if not assembly.second_call_at:
            wait = int((assembly.legal_snapshot or {}).get('second_call_wait_minutes') or 30)
            assembly.second_call_at = meeting + timedelta(minutes=wait)
        assembly.save(update_fields=[
            'status', 'notice_issued_at', 'second_call_at', 'updated_at',
        ])
        when = timezone.localtime(assembly.first_call_at).strftime('%d/%m/%Y %H:%M')
        notify_assembly(
            assembly.tenant, 'assembly_notice',
            f'Convocatoria: {assembly.title}',
            f'Se convoca a asamblea {assembly.kind} el {when} en {assembly.location}. '
            f'Revisa el orden del día en Homly.',
        )
        _audit(
            request, 'update', f'Convocatoria emitida: {assembly.title}',
            tenant_id, 'CondoAssembly', assembly.id, assembly.title,
        )
        return Response(self._full(assembly))

    @action(detail=True, methods=['post'], url_path='seed-attendees')
    def seed_attendees_action(self, request, tenant_id, pk=None):
        assembly = self.get_object()
        if assembly.status in LOCKED_STATUSES:
            return Response({'detail': 'La lista de esta asamblea ya no se puede modificar.'}, status=400)
        created = seed_attendees(assembly, assembly.tenant)
        return Response({'created': created, **self._full(assembly)})

    @action(detail=True, methods=['post'], url_path='attendees')
    def add_attendee(self, request, tenant_id, pk=None):
        assembly = self.get_object()
        if assembly.status in LOCKED_STATUSES:
            return Response({'detail': 'La lista ya no se puede modificar.'}, status=400)
        ser = CondoAssemblyAttendeeSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        unit = None
        uid = ser.validated_data.get('unit_id')
        if uid:
            unit = Unit.objects.filter(tenant_id=tenant_id, id=uid).first()
        att = CondoAssemblyAttendee.objects.create(
            assembly=assembly,
            unit=unit,
            attendee_name=ser.validated_data.get('attendee_name') or (unit.responsible_name if unit else ''),
            capacity=ser.validated_data.get('capacity') or 'propietario',
            proxy_name=ser.validated_data.get('proxy_name') or '',
            present=bool(ser.validated_data.get('present')),
            vote_weight=ser.validated_data.get('vote_weight') or 1,
            signed_in_at=timezone.now() if ser.validated_data.get('present') else None,
        )
        return Response(CondoAssemblyAttendeeSerializer(att).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['patch', 'delete'], url_path='attendees/(?P<attendee_id>[^/.]+)')
    def attendee_detail(self, request, tenant_id, pk=None, attendee_id=None):
        assembly = self.get_object()
        att = assembly.attendees.filter(id=attendee_id).first()
        if not att:
            return Response({'detail': 'Asistente no encontrado.'}, status=404)
        if request.method == 'DELETE':
            if assembly.status in LOCKED_STATUSES:
                return Response({'detail': 'No se puede quitar de una asamblea cerrada.'}, status=400)
            att.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        present = request.data.get('present', serializers.empty)
        if present is not serializers.empty:
            att.present = bool(present)
            att.signed_in_at = timezone.now() if att.present else None
        if 'attendee_name' in request.data:
            att.attendee_name = (request.data.get('attendee_name') or '')[:240]
        if 'proxy_name' in request.data:
            att.proxy_name = (request.data.get('proxy_name') or '')[:200]
        if 'capacity' in request.data and request.data['capacity'] in dict(CondoAssemblyAttendee.CAPACITY_CHOICES):
            att.capacity = request.data['capacity']
        att.save()
        return Response(CondoAssemblyAttendeeSerializer(att).data)

    @action(detail=True, methods=['post'], url_path='second-call')
    def second_call(self, request, tenant_id, pk=None):
        assembly = self.get_object()
        if assembly.status not in ('convocada', 'en_curso'):
            return Response({'detail': 'La segunda convocatoria solo aplica a una asamblea convocada.'}, status=400)
        q = quorum_snapshot(assembly)
        if q['met'] and assembly.call_number == 1:
            return Response({'detail': 'Ya hay quórum de primera convocatoria.'}, status=400)
        assembly.call_number = 2
        if not assembly.second_call_at:
            wait = int((assembly.legal_snapshot or {}).get('second_call_wait_minutes') or 30)
            base = assembly.first_call_at or timezone.now()
            assembly.second_call_at = base + timedelta(minutes=wait)
        assembly.save(update_fields=['call_number', 'second_call_at', 'updated_at'])
        _audit(
            request, 'update', f'Segunda convocatoria: {assembly.title}',
            tenant_id, 'CondoAssembly', assembly.id, assembly.title,
        )
        return Response(self._full(assembly))

    @action(detail=True, methods=['post'], url_path='install')
    def install(self, request, tenant_id, pk=None):
        assembly = self.get_object()
        if assembly.status not in ('convocada', 'en_curso'):
            return Response({'detail': 'La asamblea debe estar convocada para instalarse.'}, status=400)
        q = quorum_snapshot(assembly)
        if not q['met']:
            return Response({
                'detail': (
                    f'Sin quórum de {"segunda" if assembly.call_number >= 2 else "primera"} '
                    f'convocatoria ({q["present_pct"]}% de {q["required_pct"]}% requerido).'
                ),
                'quorum': q,
            }, status=400)
        now = timezone.now()
        assembly.status = 'en_curso'
        assembly.installed_at = assembly.installed_at or now
        if request.data.get('president_name'):
            assembly.president_name = request.data['president_name'][:200]
        if request.data.get('secretary_name'):
            assembly.secretary_name = request.data['secretary_name'][:200]
        assembly.save(update_fields=[
            'status', 'installed_at', 'president_name', 'secretary_name', 'updated_at',
        ])
        notify_assembly(
            assembly.tenant, 'assembly_started',
            f'Asamblea instalada: {assembly.title}',
            f'Hay quórum ({q["present_pct"]}%). La reunión quedó en curso.',
        )
        _audit(
            request, 'update', f'Asamblea instalada: {assembly.title}',
            tenant_id, 'CondoAssembly', assembly.id, assembly.title,
        )
        return Response(self._full(assembly))

    @action(detail=True, methods=['post'], url_path='agenda/(?P<item_id>[^/.]+)/vote')
    def vote_item(self, request, tenant_id, pk=None, item_id=None):
        assembly = self.get_object()
        if assembly.status != 'en_curso':
            return Response({'detail': 'Solo se vota cuando la asamblea está en curso.'}, status=400)
        item = assembly.agenda.filter(id=item_id).first()
        if not item:
            return Response({'detail': 'Punto no encontrado.'}, status=404)
        present_atts = list(assembly.attendees.exclude(capacity='invitado').filter(present=True))
        present = len(present_atts)
        ballots = request.data.get('ballots')
        if isinstance(ballots, list) and ballots:
            allowed = {str(a.id): a for a in present_atts}
            detail, vf, va, vb = [], 0, 0, 0
            for raw in ballots:
                if not isinstance(raw, dict):
                    continue
                att = allowed.get(str(raw.get('attendee_id') or ''))
                choice = raw.get('choice')
                if not att or choice not in ('for', 'against', 'abstain'):
                    continue
                if choice == 'for':
                    vf += 1
                elif choice == 'against':
                    va += 1
                else:
                    vb += 1
                detail.append({
                    'attendee_id': str(att.id),
                    'unit_code': att.unit.unit_id_code if att.unit_id else '',
                    'name': att.attendee_name or '',
                    'choice': choice,
                })
            item.votes_for, item.votes_against, item.votes_abstain = vf, va, vb
            item.vote_detail = detail
        else:
            item.votes_for = max(0, int(request.data.get('votes_for') or 0))
            item.votes_against = max(0, int(request.data.get('votes_against') or 0))
            item.votes_abstain = max(0, int(request.data.get('votes_abstain') or 0))
        result = request.data.get('result')
        if result in dict(CondoAssemblyAgendaItem.RESULT_CHOICES):
            item.result = result
        else:
            item.result, _th, _why = resolve_vote_result(
                item.vote_type, item.votes_for, item.votes_against, item.votes_abstain,
                present, assembly.legal_snapshot or {},
            )
        if request.data.get('notes') is not None:
            item.notes = request.data.get('notes') or ''
        item.save()
        linked = item.source_kind not in ('manual', '') and item.source_id
        if item.result in ('aprobado', 'rechazado') and linked and can_write_assemblies(request.user, tenant_id):
            apply_linked_module(item, assembly, request_user(request), item.result)
        elif item.result in ('aprobado', 'rechazado') and linked and item.apply_on_approve:
            item.applied_status = 'pendiente'
            item.applied_notes = 'El acuerdo quedó en el acta. Un administrador o tesorero debe confirmar la aplicación en el módulo.'
            item.save(update_fields=['applied_status', 'applied_notes'])
        record_vote_in_documents(assembly, item)
        return Response(self._full(assembly))

    @action(detail=True, methods=['post'], url_path='agenda/(?P<item_id>[^/.]+)/notes')
    def save_item_notes(self, request, tenant_id, pk=None, item_id=None):
        assembly = self.get_object()
        if assembly.status in LOCKED_STATUSES:
            return Response({'detail': 'Esta asamblea ya no admite notas.'}, status=400)
        item = assembly.agenda.filter(id=item_id).first()
        if not item:
            return Response({'detail': 'Punto no encontrado.'}, status=404)
        if request.data.get('notes') is not None:
            item.notes = request.data.get('notes') or ''
        fields = ['notes'] if request.data.get('notes') is not None else []
        vote_type = request.data.get('vote_type')
        if vote_type in dict(CondoAssemblyAgendaItem.VOTE_CHOICES):
            item.vote_type = vote_type
            fields.append('vote_type')
        if item.vote_type == 'informativo' and request.data.get('mark_done'):
            item.result = 'aprobado'
            fields.append('result')
        if not fields:
            fields = ['notes']
        item.save(update_fields=fields)
        if item.result != 'pendiente' or item.notes:
            record_vote_in_documents(assembly, item)
        return Response(self._full(assembly))

    @action(detail=True, methods=['post'], url_path='agenda/(?P<item_id>[^/.]+)/apply')
    def apply_item(self, request, tenant_id, pk=None, item_id=None):
        if not can_write_assemblies(request.user, tenant_id):
            return Response({'detail': 'Solo administrador o tesorero puede aplicar el acuerdo al módulo.'}, status=403)
        assembly = self.get_object()
        item = assembly.agenda.filter(id=item_id).first()
        if not item:
            return Response({'detail': 'Punto no encontrado.'}, status=404)
        if item.result not in ('aprobado', 'rechazado'):
            return Response({'detail': 'Primero registra la votación de la asamblea.'}, status=400)
        item.applied_status = 'pendiente'
        apply_linked_module(item, assembly, request_user(request), item.result)
        _audit(
            request, 'update',
            f'Acuerdo aplicado: {item.title}',
            tenant_id, 'CondoAssemblyAgendaItem', item.id, item.title,
        )
        return Response(self._full(assembly))

    @action(detail=True, methods=['get'], url_path='print-doc')
    def print_doc(self, request, tenant_id, pk=None):
        assembly = self.get_object()
        kind = (request.query_params.get('kind') or 'convocatoria').strip()
        if kind not in ('convocatoria', 'minuta', 'acta'):
            return Response({'detail': 'Tipo de documento inválido.'}, status=400)
        user = request_user(request)
        generated_by = (
            (getattr(user, 'name', None) or '').strip()
            or (getattr(user, 'email', None) or '').strip()
            or '—'
        )
        from .asamblea_docs import _safe_filename, generate_assembly_pdf
        try:
            pdf_bytes = generate_assembly_pdf(assembly, kind, generated_by=generated_by)
        except Exception:
            import logging
            logging.getLogger(__name__).exception('Error generando PDF de asamblea %s', assembly.id)
            return Response({'detail': 'No se pudo generar el documento.'}, status=500)
        if not pdf_bytes:
            return Response({'detail': 'No se pudo generar el PDF en el servidor.'}, status=500)
        label = {'acta': 'Acta', 'minuta': 'Minuta'}.get(kind, 'Convocatoria')
        filename = f'{label}_{_safe_filename(assembly.title or str(assembly.year))}.pdf'
        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response

    @action(detail=True, methods=['post'], url_path='save-minute')
    def save_minute(self, request, tenant_id, pk=None):
        assembly = self.get_object()
        if assembly.status in ('cancelada',):
            return Response({'detail': 'No se puede minutar una asamblea cancelada.'}, status=400)
        if 'minute_body' in request.data:
            assembly.minute_body = request.data.get('minute_body') or ''
        if 'acta_body' in request.data:
            assembly.acta_body = request.data.get('acta_body') or ''
        if request.data.get('notary_name') is not None:
            assembly.notary_name = (request.data.get('notary_name') or '')[:200]
        if request.data.get('notary_folio') is not None:
            assembly.notary_folio = (request.data.get('notary_folio') or '')[:80]
        assembly.save(update_fields=['minute_body', 'acta_body', 'notary_name', 'notary_folio', 'updated_at'])
        return Response(self._full(assembly))

    @action(detail=True, methods=['post'], url_path='sign-minute')
    def sign_minute(self, request, tenant_id, pk=None):
        assembly = self.get_object()
        if assembly.status not in ('en_curso', 'cerrada'):
            return Response({'detail': 'La minuta se firma al concluir la reunión.'}, status=400)
        if not (assembly.acta_body or '').strip():
            return Response({
                'detail': 'Redacta el acta formal antes de firmarla. La minuta de trabajo no se protocoliza.',
            }, status=400)
        if not assembly.president_name or not assembly.secretary_name:
            return Response({'detail': 'Indica presidente y secretario de debates.'}, status=400)
        assembly.minute_status = 'firmada'
        assembly.minute_signed_at = timezone.now()
        assembly.save(update_fields=['minute_status', 'minute_signed_at', 'updated_at'])
        _audit(
            request, 'update', f'Acta firmada: {assembly.title}',
            tenant_id, 'CondoAssembly', assembly.id, assembly.title,
        )
        return Response(self._full(assembly))

    @action(detail=True, methods=['post'], url_path='protocolize')
    def protocolize(self, request, tenant_id, pk=None):
        assembly = self.get_object()
        if assembly.minute_status != 'firmada':
            return Response({'detail': 'Primero firma el acta.'}, status=400)
        assembly.protocolized = True
        assembly.minute_status = 'protocolizada'
        assembly.notary_name = (request.data.get('notary_name') or assembly.notary_name)[:200]
        assembly.notary_folio = (request.data.get('notary_folio') or assembly.notary_folio)[:80]
        assembly.save(update_fields=[
            'protocolized', 'minute_status', 'notary_name', 'notary_folio', 'updated_at',
        ])
        return Response(self._full(assembly))

    @action(detail=True, methods=['post'], url_path='close')
    def close(self, request, tenant_id, pk=None):
        assembly = self.get_object()
        if assembly.status != 'en_curso':
            return Response({'detail': 'Solo una asamblea en curso se puede cerrar.'}, status=400)
        assembly.status = 'cerrada'
        assembly.closed_at = timezone.now()
        if (assembly.acta_body or '').strip() and assembly.president_name and assembly.secretary_name:
            if assembly.minute_status == 'borrador':
                assembly.minute_status = 'firmada'
                assembly.minute_signed_at = assembly.closed_at
        assembly.save(update_fields=[
            'status', 'closed_at', 'minute_status', 'minute_signed_at', 'updated_at',
        ])
        notify_assembly(
            assembly.tenant, 'assembly_minute',
            f'Minuta disponible: {assembly.title}',
            'La asamblea quedó cerrada. Consulta la minuta de trabajo y el acta formal en Homly.',
        )
        _audit(
            request, 'update', f'Asamblea cerrada: {assembly.title}',
            tenant_id, 'CondoAssembly', assembly.id, assembly.title,
        )
        return Response(self._full(assembly))

    @action(detail=True, methods=['post'], url_path='cancel')
    def cancel(self, request, tenant_id, pk=None):
        assembly = self.get_object()
        if assembly.status in LOCKED_STATUSES:
            return Response({'detail': 'Esta asamblea ya está cerrada o cancelada.'}, status=400)
        assembly.status = 'cancelada'
        assembly.notes = ((assembly.notes or '') + '\n' + (request.data.get('reason') or 'Cancelada')).strip()
        assembly.save(update_fields=['status', 'notes', 'updated_at'])
        _audit(
            request, 'update', f'Asamblea cancelada: {assembly.title}',
            tenant_id, 'CondoAssembly', assembly.id, assembly.title,
        )
        return Response(self._full(assembly))

    @action(detail=True, methods=['get', 'post'], url_path='files')
    def files(self, request, tenant_id, pk=None):
        assembly = self.get_object()
        if request.method == 'GET':
            return Response(
                CondoAssemblyFileSerializer(
                    assembly.files.all(), many=True, context={'request': request},
                ).data
            )
        if not can_write_assemblies(request.user, tenant_id):
            return Response({'detail': 'No puedes subir archivos.'}, status=403)
        uploaded = request.FILES.get('file') or request.FILES.get('archivo')
        if not uploaded:
            return Response({'detail': 'Adjunta un archivo.'}, status=400)
        name = getattr(uploaded, 'name', '') or 'archivo'
        ext = os.path.splitext(name)[1].lower()
        if ext not in FILE_EXTS:
            return Response({'detail': f'Tipo de archivo no permitido ({ext or "sin extensión"}).'}, status=400)
        if (getattr(uploaded, 'size', 0) or 0) > FILE_MAX:
            return Response({'detail': 'El archivo no puede superar 20 MB.'}, status=400)
        kind = (request.data.get('kind') or 'otro').strip()
        if kind not in dict(CondoAssemblyFile.KIND_CHOICES):
            kind = 'otro'
        obj = CondoAssemblyFile.objects.create(
            assembly=assembly,
            kind=kind,
            original_name=name[:240],
            notes=(request.data.get('notes') or '')[:400],
            file=uploaded,
            uploaded_by=request_user(request),
        )
        return Response(
            CondoAssemblyFileSerializer(obj, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=['delete'], url_path='files/(?P<file_id>[^/.]+)')
    def destroy_file(self, request, tenant_id, pk=None, file_id=None):
        assembly = self.get_object()
        obj = assembly.files.filter(id=file_id).first()
        if not obj:
            return Response({'detail': 'Archivo no encontrado.'}, status=404)
        if obj.file:
            obj.file.delete(save=False)
        obj.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
