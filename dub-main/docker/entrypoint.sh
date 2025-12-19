#!/usr/bin/env bash
set -euo pipefail

APP_PORT="${PORT:-8888}"

echo "[dub] Starting container..."

# Wait for MySQL if configured
if [[ -n "${DATABASE_URL:-}" ]]; then
  echo "[dub] Waiting for database..."
  for i in $(seq 1 60); do
    if node -e "const u=new URL(process.env.DATABASE_URL); console.log('db host',u.hostname);" >/dev/null 2>&1; then
      # Use TCP check via /dev/tcp if available
      DB_HOST=$(node -e "const u=new URL(process.env.DATABASE_URL); process.stdout.write(u.hostname)")
      DB_PORT=$(node -e "const u=new URL(process.env.DATABASE_URL); process.stdout.write(u.port||'3306')")
      if (echo >"/dev/tcp/${DB_HOST}/${DB_PORT}") >/dev/null 2>&1; then
        echo "[dub] Database is reachable"
        break
      fi
    fi
    if [[ "$i" == "60" ]]; then
      echo "[dub] Database not reachable after waiting" >&2
      exit 1
    fi
    sleep 2
  done
fi

echo "[dub] Generating Prisma client..."
pnpm --filter web prisma:generate

echo "[dub] Syncing schema to database (prisma push)..."
pnpm --filter web prisma:push

echo "[dub] Building web app..."
pnpm --filter web build

echo "[dub] Starting Next.js on 0.0.0.0:${APP_PORT}"
cd apps/web
exec pnpm start --port "${APP_PORT}" --hostname 0.0.0.0
