"""
Homly — Configuración de espacios de trabajo y módulos (superadmin).

Lectura: cualquier usuario autenticado (el frontend necesita nombres, módulos
desactivados y sustantivos de unidad). Escritura: solo superadmin.
"""
import re
from rest_framework import serializers, viewsets, permissions

from .models import WorkspaceConfig
from .permissions import IsSuperAdmin

HEX_RE = re.compile(r'^#[0-9a-fA-F]{6}$')
KEY_RE = re.compile(r'^[a-z0-9_]{2,40}$')
# El acceso a la membresía nunca se puede retirar.
PROTECTED_MODULES = {'mi_membresia'}


class WorkspaceConfigSerializer(serializers.ModelSerializer):
    tenants_count = serializers.SerializerMethodField()
    plans_count = serializers.SerializerMethodField()

    class Meta:
        model = WorkspaceConfig
        fields = [
            'id', 'workspace_type', 'label', 'short_label', 'description',
            'unit_noun', 'color', 'is_enabled', 'sort_order',
            'module_overrides', 'module_bundles', 'tenants_count', 'plans_count',
            'updated_at',
        ]
        read_only_fields = ['id', 'workspace_type', 'updated_at', 'tenants_count', 'plans_count']

    def get_tenants_count(self, obj):
        from .models import Tenant
        return Tenant.objects.filter(workspace_type=obj.workspace_type).count()

    def get_plans_count(self, obj):
        from .models import SubscriptionPlan
        return SubscriptionPlan.objects.filter(workspace_type=obj.workspace_type).count()

    def validate_label(self, v):
        v = (v or '').strip()
        if not v:
            raise serializers.ValidationError('El nombre es obligatorio.')
        return v

    def validate_unit_noun(self, v):
        v = (v or '').strip().lower()
        return v or 'unidad'

    def validate_color(self, v):
        if not HEX_RE.match(v or ''):
            raise serializers.ValidationError('Usa un color hexadecimal, por ejemplo #0f766e.')
        return v

    def validate_module_overrides(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError('Formato inválido.')
        clean = {}
        for key, ov in value.items():
            if not KEY_RE.match(str(key)) or not isinstance(ov, dict):
                continue
            item = {}
            label = str(ov.get('label') or '').strip()[:80]
            desc = str(ov.get('desc') or '').strip()[:200]
            if label:
                item['label'] = label
            if desc:
                item['desc'] = desc
            if ov.get('enabled') is False and key not in PROTECTED_MODULES:
                item['enabled'] = False
            if item:
                clean[key] = item
        return clean

    def validate_module_bundles(self, value):
        if not isinstance(value, list) or len(value) > 20:
            raise serializers.ValidationError('Máximo 20 paquetes.')
        clean = []
        for i, b in enumerate(value):
            if not isinstance(b, dict):
                continue
            name = str(b.get('name') or '').strip()[:60]
            if not name:
                continue
            mods = [m for m in (b.get('modules') or []) if isinstance(m, str) and KEY_RE.match(m)]
            clean.append({
                'id': str(b.get('id') or f'b{i + 1}')[:20],
                'name': name,
                'modules': list(dict.fromkeys(mods)),
            })
        return clean

    def validate(self, data):
        if data.get('is_enabled') is False and self.instance:
            others = WorkspaceConfig.objects.exclude(pk=self.instance.pk).filter(is_enabled=True)
            if not others.exists():
                raise serializers.ValidationError({
                    'is_enabled': 'Debe quedar al menos un espacio de trabajo activo.',
                })
        return data


class WorkspaceConfigViewSet(viewsets.ModelViewSet):
    """GET /api/workspace-configs/  ·  PATCH /api/workspace-configs/<workspace_type>/"""
    serializer_class = WorkspaceConfigSerializer
    lookup_field = 'workspace_type'
    http_method_names = ['get', 'patch', 'post', 'head', 'options']

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [permissions.IsAuthenticated()]
        return [IsSuperAdmin()]

    def get_queryset(self):
        WorkspaceConfig.ensure_defaults()
        return WorkspaceConfig.objects.all()

    def create(self, request, *args, **kwargs):
        # Los espacios los define el sistema; solo se personalizan.
        from rest_framework.response import Response
        return Response({'detail': 'Los espacios de trabajo no se crean; solo se personalizan.'}, status=405)

    def perform_update(self, serializer):
        from .views import _audit_log
        obj = serializer.save()
        _audit_log(self.request, 'sistema', 'update',
                   f'Espacio de trabajo personalizado: {obj.label}',
                   object_type='WorkspaceConfig', object_id=str(obj.id), object_repr=obj.label)
