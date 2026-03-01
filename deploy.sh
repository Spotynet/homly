#!/bin/bash
# ─────────────────────────────────────────────────────────────
#  Homly — Deploy Script
#  Uso: ./deploy.sh
#  Builds frontend on Mac, pushes to git, deploys to EC2.
# ─────────────────────────────────────────────────────────────

set -e  # Exit on any error

PEM="$HOME/Documents/homly/homly.pem"
EC2_USER="ubuntu"
EC2_HOST="98.81.122.194"
EC2="$EC2_USER@$EC2_HOST"
API_URL="https://homly.com.mx/api"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR"
FRONTEND_DIR="$SCRIPT_DIR/frontend"

echo ""
echo "╔══════════════════════════════════════╗"
echo "║        Homly — Deploy Script         ║"
echo "╚══════════════════════════════════════╝"
echo ""

# ── Step 1: Git push ─────────────────────────────────────────
echo "▶ [1/4] Pushing changes to git..."
cd "$PROJECT_DIR"
git add -A
git diff --cached --quiet && echo "  No changes to commit, skipping." || git commit -m "deploy: $(date '+%Y-%m-%d %H:%M')"
git push origin main
echo "  ✓ Git push done."
echo ""

# ── Step 2: Build frontend ───────────────────────────────────
echo "▶ [2/4] Building frontend (Mac)..."
cd "$FRONTEND_DIR"
REACT_APP_API_URL="$API_URL" GENERATE_SOURCEMAP=false npm run build
echo "  ✓ Build done."
echo ""

# ── Step 3: Upload build to EC2 ──────────────────────────────
echo "▶ [3/4] Uploading build to EC2..."
chmod 400 "$PEM"
rsync -az --delete -e "ssh -i $PEM" \
  "$FRONTEND_DIR/build/" \
  "$EC2:~/homly/frontend/build/"
echo "  ✓ Upload done."
echo ""

# ── Step 4: EC2 — pull, migrate, restart ─────────────────────
echo "▶ [4/4] Updating EC2 (pull + migrate + reload)..."
ssh -i "$PEM" "$EC2" << 'ENDSSH'
  set -e
  cd ~/homly

  echo "  → git pull..."
  git pull origin main

  echo "  → migrate..."
  source backend/venv/bin/activate
  cd backend
  python manage.py migrate --run-syncdb
  deactivate
  cd ..

  echo "  → restart backend PM2..."
  pm2 restart homly-backend

  echo "  → reload nginx..."
  sudo nginx -t && sudo nginx -s reload

  echo "  ✓ EC2 update done."
ENDSSH

echo ""
echo "╔══════════════════════════════════════╗"
echo "║  ✅  Deploy completado con éxito!    ║"
echo "╚══════════════════════════════════════╝"
echo ""
