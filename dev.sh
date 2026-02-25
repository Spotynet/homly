#!/bin/bash
# ─────────────────────────────────────────────────────────────
#  Homly — Desarrollo local
#  Uso: ./dev.sh
#  Inicia backend (Django) y frontend (React) en localhost.
# ─────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"

# Al salir (Ctrl+C), matar ambos procesos
cleanup() {
  echo ""
  echo "▶ Deteniendo servidores..."
  kill $BACKEND_PID 2>/dev/null
  kill $FRONTEND_PID 2>/dev/null
  exit 0
}
trap cleanup SIGINT SIGTERM

echo ""
echo "╔══════════════════════════════════════╗"
echo "║     Homly — Entorno de desarrollo   ║"
echo "╚══════════════════════════════════════╝"
echo ""
echo "  Backend:  http://localhost:8000"
echo "  Frontend: http://localhost:3000"
echo ""
echo "  Ctrl+C para detener ambos."
echo ""

# ── Backend ───────────────────────────────────────────────────
echo "▶ Iniciando backend (Django)..."
cd "$BACKEND_DIR"
source .venv/bin/activate
python manage.py runserver 0.0.0.0:8000 &
BACKEND_PID=$!
cd "$SCRIPT_DIR"

# Esperar un poco a que el backend arranque
sleep 2

# ── Frontend ───────────────────────────────────────────────────
echo "▶ Iniciando frontend (React)..."
cd "$FRONTEND_DIR"
npm run start &
FRONTEND_PID=$!
cd "$SCRIPT_DIR"

echo ""
echo "  ✓ Ambos servidores activos. Presiona Ctrl+C para detener."
echo ""

wait
