#!/usr/bin/env bash
set -eu

if ! command -v psql >/dev/null 2>&1 || ! command -v pg_ctlcluster >/dev/null 2>&1; then
  sudo apt-get update
  sudo apt-get install -y postgresql-16 postgresql-client-16
fi

if ! command -v pg_lsclusters >/dev/null 2>&1; then
  echo "pg_lsclusters is not available after PostgreSQL install" >&2
  exit 1
fi

if pg_lsclusters | awk '$1=="16" && $2=="main" { found=1; status=$4 } END { exit(found ? 0 : 1) }'; then
  if pg_lsclusters | awk '$1=="16" && $2=="main" && $4=="online" { found=1 } END { exit(found ? 0 : 1) }'; then
    echo "PostgreSQL cluster 16/main already online"
  else
    sudo pg_ctlcluster 16 main start
  fi
else
  sudo pg_createcluster 16 main --start
fi

role_exists="$(sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='vettrack'" | tr -d '[:space:]')"
if [ "$role_exists" != "1" ]; then
  sudo -u postgres psql -c "CREATE USER vettrack WITH PASSWORD 'vettrack';"
fi

db_exists="$(sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='vettrack'" | tr -d '[:space:]')"
if [ "$db_exists" != "1" ]; then
  sudo -u postgres psql -c "CREATE DATABASE vettrack OWNER vettrack;"
fi

pnpm install

DATABASE_URL=postgres://vettrack:vettrack@localhost:5432/vettrack pnpm exec vitest --version
DATABASE_URL=postgres://vettrack:vettrack@localhost:5432/vettrack npx tsc --version
