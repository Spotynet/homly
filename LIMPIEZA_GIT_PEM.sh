#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
#  Homly — M-07: Limpieza de clave SSH homly.pem del historial Git
#
#  PROBLEMA: homly.pem (clave privada SSH de EC2) quedó registrada en el
#  historial de Git. Cualquier persona con acceso al repo puede recuperarla con:
#    git log --all -- homly.pem
#
#  ESTE SCRIPT:
#    1. Revoca la clave en AWS EC2 (OBLIGATORIO PRIMERO)
#    2. Limpia el historial de Git con git-filter-repo
#    3. Fuerza el push al repositorio remoto
#    4. Invalida todas las copias locales del repo en el equipo de los colaboradores
#
#  ADVERTENCIA: Este proceso es DESTRUCTIVO para el historial de Git.
#  Todos los colaboradores deberán hacer 'git clone' desde cero.
#  Coordinar con el equipo antes de ejecutar.
#
#  PRERREQUISITOS:
#    - pip install git-filter-repo
#    - Acceso de escritura al repositorio remoto (GitHub/GitLab)
#    - Credenciales AWS para revocar la clave
# ═══════════════════════════════════════════════════════════════════════════════

set -e

echo ""
echo "╔═══════════════════════════════════════════════════════╗"
echo "║  M-07: Limpieza de homly.pem del historial Git        ║"
echo "╚═══════════════════════════════════════════════════════╝"
echo ""
echo "⚠️  ADVERTENCIA: Este proceso modifica el historial de Git permanentemente."
echo "   Todos los colaboradores deberán clonar el repo de nuevo al terminar."
echo ""
read -p "¿Confirmas que ya revocaste la clave en AWS EC2? (sí/no): " confirm
if [ "$confirm" != "sí" ] && [ "$confirm" != "si" ] && [ "$confirm" != "yes" ]; then
  echo ""
  echo "PASO 0 (OBLIGATORIO): Revocar la clave en AWS primero"
  echo "────────────────────────────────────────────────────────"
  echo "  1. Ir a AWS Console → EC2 → Key Pairs"
  echo "  2. Seleccionar la key pair 'homly' (o el nombre que tenga)"
  echo "  3. Hacer 'Delete' de la key pair"
  echo "  4. Crear una nueva key pair con nombre diferente (ej: homly-2026)"
  echo "  5. Descargar el nuevo .pem a ~/projects/pem/ (NUNCA en el directorio del proyecto)"
  echo "  6. Actualizar HOMLY_EC2_HOST en tu entorno y el .pem en deploy.sh si es necesario"
  echo ""
  echo "Después de completar el paso 0, ejecuta este script de nuevo."
  exit 1
fi

echo ""
echo "▶ [1/4] Verificando que git-filter-repo está instalado..."
if ! command -v git-filter-repo &> /dev/null; then
  echo "   Instalando git-filter-repo..."
  pip install git-filter-repo --break-system-packages
fi
echo "   ✓ git-filter-repo disponible."

echo ""
echo "▶ [2/4] Eliminando homly.pem del historial de Git..."
# Eliminar el archivo de TODO el historial (todas las ramas y tags)
git filter-repo --path homly.pem --invert-paths --force
echo "   ✓ homly.pem eliminado del historial."

echo ""
echo "▶ [3/4] Verificando que el archivo ya no aparece en el historial..."
PEM_COUNT=$(git log --all --full-history -- homly.pem 2>/dev/null | wc -l | tr -d ' ')
if [ "$PEM_COUNT" -gt "0" ]; then
  echo "   ✗ ERROR: El archivo aún aparece en el historial. Revisar manualmente."
  exit 1
fi
echo "   ✓ Verificado: homly.pem no aparece en el historial."

echo ""
echo "▶ [4/4] Forzando push al repositorio remoto..."
echo "   NOTA: Esto reescribirá el historial remoto. Coordinar con el equipo."
read -p "   ¿Continuar con el force push? (sí/no): " confirm_push
if [ "$confirm_push" = "sí" ] || [ "$confirm_push" = "si" ] || [ "$confirm_push" = "yes" ]; then
  git push origin --force --all
  git push origin --force --tags
  echo "   ✓ Force push completado."
else
  echo "   Force push cancelado. Ejecuta manualmente cuando estés listo:"
  echo "   git push origin --force --all && git push origin --force --tags"
fi

echo ""
echo "╔═══════════════════════════════════════════════════════╗"
echo "║  ✅ Limpieza completada                               ║"
echo "╚═══════════════════════════════════════════════════════╝"
echo ""
echo "ACCIONES REQUERIDAS PARA TODOS LOS COLABORADORES:"
echo "───────────────────────────────────────────────────"
echo "  1. Eliminar su copia local del repo:"
echo "       rm -rf ~/projects/homly  (o donde tengan el repo)"
echo "  2. Clonar de nuevo:"
echo "       git clone <url-del-repo>"
echo "  3. Configurar HOMLY_EC2_HOST en su shell:"
echo "       echo 'export HOMLY_EC2_HOST=<nueva-ip>' >> ~/.zshrc"
echo ""
echo "NOTAS DE SEGURIDAD ADICIONALES:"
echo "───────────────────────────────"
echo "  - Si el repositorio es público, la clave PUEDE estar en caché en"
echo "    GitHub/GitLab. Contactar soporte de la plataforma para solicitar"
echo "    purga de cachés si el acceso al repo es/fue público."
echo "  - Considera activar 'branch protection' para prevenir futuros"
echo "    force pushes accidentales a main."
echo ""
