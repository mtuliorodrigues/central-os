#!/usr/bin/env bash
set -euo pipefail

: "${CENTRAL_OS_DB_PASSWORD:?CENTRAL_OS_DB_PASSWORD must be supplied by the runtime secret injector}"
: "${EVOLUTION_DB_PASSWORD:?EVOLUTION_DB_PASSWORD must be supplied by the runtime secret injector}"

create_database() {
  local name="$1"
  if ! psql -Atqc "SELECT 1 FROM pg_database WHERE datname='$name'" --username "$POSTGRES_USER" --dbname postgres | grep -q 1; then
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres -c "CREATE DATABASE $name"
  fi
}

create_database central_os
create_database evolution

psql -v ON_ERROR_STOP=1 --set=central_pw="$CENTRAL_OS_DB_PASSWORD" --set=evolution_pw="$EVOLUTION_DB_PASSWORD" --username "$POSTGRES_USER" --dbname postgres <<'SQL'
SELECT format('CREATE ROLE central_os_app LOGIN')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'central_os_app') \gexec
SELECT format('CREATE ROLE evolution_app LOGIN')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'evolution_app') \gexec
ALTER ROLE central_os_app PASSWORD :'central_pw';
ALTER ROLE evolution_app PASSWORD :'evolution_pw';
GRANT ALL PRIVILEGES ON DATABASE central_os TO central_os_app;
GRANT ALL PRIVILEGES ON DATABASE evolution TO evolution_app;
SQL
