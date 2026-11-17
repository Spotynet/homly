#!/usr/bin/env bash
# Homly API for shared EC2: DEBUG=False + SECRET_KEY from .secrets.env
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
if [[ ! -f "$ROOT/.secrets.env" ]]; then
  echo "Missing $ROOT/.secrets.env (SECRET_KEY=...)." >&2
  exit 1
fi
set -a
# shellcheck disable=SC1091
. "$ROOT/.secrets.env"
export DEBUG=False
set +a
exec "$ROOT/.venv/bin/python" manage.py runserver 127.0.0.1:3004
