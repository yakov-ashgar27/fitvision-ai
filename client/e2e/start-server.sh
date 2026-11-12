#!/usr/bin/env bash
# Starts the API (SQLite, demo data) serving the built client from the same origin, for end-to-end tests.
set -euo pipefail
cd "$(dirname "$0")/../../server"
export DATABASE_URL="sqlite:///./e2e.db" SEED_DEMO=1 PDF_ENGINE="${PDF_ENGINE:-chromium}" STATIC_DIR="../client/dist"
rm -f e2e.db
python -m alembic upgrade head
python -m app.seed
exec python -m uvicorn app.main:app --host 0.0.0.0 --port "${E2E_PORT:-8000}"
