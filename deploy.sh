#!/bin/bash
# ─────────────────────────────────────────────────────────────
#  Homly — Deploy Script
#  Uso: ./deploy.sh
#  Builds frontend on Mac, pushes to git, deploys to EC2.
# ─────────────────────────────────────────────────────────────

set -e  # Exit on any error

PEM="$HOME/projects/pem/homly.pem"
EC2_USER="ubuntu"
# M-02: IP del servidor leída desde variable de entorno (nunca hardcodeada en el repo).
# Definir en tu shell o en ~/.bashrc / ~/.zshrc:
#   export HOMLY_EC2_HOST="<ip-o-dominio-del-servidor>"
EC2_HOST="${HOMLY_EC2_HOST:?ERROR: Variable HOMLY_EC2_HOST no definida. Ejecuta: export HOMLY_EC2_HOST=<ip-del-servidor>}"
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
echo "▶ [1/5] Pushing changes to git..."
cd "$PROJECT_DIR"
# M-03: git add específico en lugar de 'git add -A' para evitar commit accidental
# de .env, *.pem u otros archivos sensibles.
git add backend/ frontend/src/ frontend/public/ frontend/package.json frontend/vite.config.js \
        nginx-homly-ssl.conf nginx-rate-limit.conf ecosystem.config.cjs 2>/dev/null || true
git diff --cached --quiet && echo "  No changes to commit, skipping." || git commit -m "deploy: $(date '+%Y-%m-%d %H:%M')"
git pull --rebase origin main
git push origin main
echo "  ✓ Git push done."
echo ""

# ── Step 2: Build frontend ───────────────────────────────────
echo "▶ [2/5] Building frontend (Mac)..."
cd "$FRONTEND_DIR"
REACT_APP_API_URL="$API_URL" GENERATE_SOURCEMAP=false npm run build
echo "  ✓ Build done."
echo ""

# ── Step 3: Upload build to EC2 ──────────────────────────────
echo "▶ [3/5] Uploading build to EC2..."
chmod 400 "$PEM"
rsync -az --delete -e "ssh -i $PEM" \
  "$FRONTEND_DIR/build/" \
  "$EC2:~/homly/frontend/build/"
echo "  ✓ Upload done."
echo ""

# ── Step 4: EC2 — pull, migrate, restart ─────────────────────
echo "▶ [4/5] Updating EC2 (pull + migrate + reload)..."
ssh -i "$PEM" "$EC2" << 'ENDSSH'
  set -e
  cd ~/homly

  echo "  → git update (reset to origin/main)..."
  git fetch origin
  git reset --hard origin/main
  git clean -fd

  echo "  → migrations..."
  source backend/venv/bin/activate
  cd backend
  # Merge conflicting branches (non-interactive; fixes EOFError over SSH)
  python manage.py makemigrations --merge --noinput 2>/dev/null || true
  # Apply migrations (non-interactive)
  set +e
  MIGRATE_OUT=$(python manage.py migrate --noinput --run-syncdb 2>&1)
  MIGRATE_OK=$?
  set -e
  if [ "$MIGRATE_OK" -ne 0 ]; then
    if echo "$MIGRATE_OUT" | grep -q "No index named amenity_tenant_date_idx"; then
      echo "  → Fixing duplicate index rename (0018_merge vs 0018_rename)..."
      python manage.py migrate core 0018_rename_amenity_tenant_date_idx_amenity_res_tenant__3e212d_idx_and_more --fake --noinput
      python manage.py migrate --noinput --run-syncdb
    else
      echo "$MIGRATE_OUT"
      exit 1
    fi
  fi
  deactivate
  cd ..

  echo "  → restart backend PM2..."
  pm2 restart all

  echo "  → reload nginx..."
  sudo nginx -t && sudo nginx -s reload

  echo "  ✓ EC2 update done."
ENDSSH

# ── Step 5: Pull back merge migrations (if any) so they're in the repo ──
echo "▶ [5/5] Syncing merge migrations to repo..."
(rsync -az -e "ssh -i $PEM" "$EC2:~/homly/backend/core/migrations/" "$PROJECT_DIR/backend/core/migrations/" 2>/dev/null && \
  cd "$PROJECT_DIR" && \
  git status --short backend/core/migrations/ | grep -q . && \
  (git add backend/core/migrations/ && git commit -m "chore: merge migrations from EC2 deploy" && git push origin main && echo "  ✓ Merge migrations pushed to repo.")) || true

echo ""
echo "╔══════════════════════════════════════╗"
echo "║  ✅  Deploy completado con éxito!    ║"
echo "╚══════════════════════════════════════╝"
echo ""
