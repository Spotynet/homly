#!/bin/bash

echo "🚀 Starting HOMLY DEV (frontend + api)"

FRONTEND_NAME="homly-dev"
BACKEND_NAME="homly-api-dev"

FRONTEND_PORT=3003
BACKEND_PORT=3004

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"

# -------------------------
# 🧹 Clean old processes
# -------------------------
echo "🧹 Cleaning old PM2 processes..."
pm2 delete $FRONTEND_NAME 2>/dev/null
pm2 delete $BACKEND_NAME 2>/dev/null

# -------------------------
# 🐍 Start Backend (Django)
# -------------------------
echo "🐍 Starting Django backend ($BACKEND_NAME) on port $BACKEND_PORT..."
pm2 start "$BACKEND_DIR/.venv/bin/python" \
  --name "$BACKEND_NAME" \
  --cwd "$BACKEND_DIR" \
  -- manage.py runserver 0.0.0.0:$BACKEND_PORT

# -------------------------
# 🎨 Start Frontend (Vite)
# -------------------------
echo "🎨 Starting Vite frontend ($FRONTEND_NAME) on port $FRONTEND_PORT..."
pm2 start npm \
  --name "$FRONTEND_NAME" \
  --cwd "$FRONTEND_DIR" \
  -- run start -- --port $FRONTEND_PORT --host 0.0.0.0

# -------------------------
# 💾 Save PM2 state
# -------------------------
pm2 save

# -------------------------
# 📊 Status
# -------------------------
echo "✅ HOMLY DEV running:"
pm2 list
echo ""
echo "  homly-dev      -> https://homly-dev.spotynet.com     (localhost:$FRONTEND_PORT)"
echo "  homly-api-dev  -> https://homly-api-dev.spotynet.com (localhost:$BACKEND_PORT)"
