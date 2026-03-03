"""
Script para habilitar show_in_normal / show_in_additional / show_in_gastos
en el serializer, DESPUÉS de haber aplicado la migración 0014.

Ejecutar desde la raíz del backend:
    python enable_show_in_forms_serializer.py
"""
import re, pathlib

FILE = pathlib.Path(__file__).parent / "core" / "serializers.py"
src = FILE.read_text()

OLD = (
    "        fields = ['id', 'tenant', 'label', 'default_amount', 'required',\n"
    "                  'enabled', 'cross_unit', 'field_type', 'sort_order',\n"
    "                  'is_system_default', 'created_at']\n"
    "        # NOTE: show_in_normal, show_in_additional, show_in_gastos are intentionally\n"
    "        # excluded here until migration 0014 is applied on the server.\n"
    "        # After running: python manage.py migrate\n"
    "        # Add them back to this fields list to enable the \"Mostrar en formularios\" feature."
)
NEW = (
    "        fields = ['id', 'tenant', 'label', 'default_amount', 'required',\n"
    "                  'enabled', 'cross_unit', 'field_type', 'sort_order',\n"
    "                  'is_system_default', 'created_at',\n"
    "                  'show_in_normal', 'show_in_additional', 'show_in_gastos']"
)

if OLD in src:
    FILE.write_text(src.replace(OLD, NEW))
    print("✅ Serializer actualizado. show_in_normal/additional/gastos habilitados.")
else:
    print("⚠️  No se encontró el bloque a reemplazar. ¿Ya fue habilitado?")
