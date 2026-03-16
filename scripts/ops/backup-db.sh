#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi

if ! command -v sha256sum >/dev/null 2>&1; then
  echo "sha256sum command not found" >&2
  exit 1
fi

BACKUP_ROOT="${BACKUP_ROOT:-./data/backups}"
BACKUP_TIER="${BACKUP_TIER:-daily}"
DB_BACKUP_MODE="${DB_BACKUP_MODE:-auto}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
TARGET_DIR="${BACKUP_ROOT}/${BACKUP_TIER}/db"

mkdir -p "${TARGET_DIR}"

SQL_PATH="${TARGET_DIR}/rastreio-db-${TIMESTAMP}.sql"
ARCHIVE_PATH="${SQL_PATH}.gz"

host_pg_dump_available() {
  command -v pg_dump >/dev/null 2>&1
}

require_runtime_lib() {
  if [[ ! -f "${PROJECT_DIR}/scripts/runtime/_lib.sh" ]]; then
    echo "Runtime helper library not found: ${PROJECT_DIR}/scripts/runtime/_lib.sh" >&2
    exit 1
  fi

  # shellcheck disable=SC1091
  source "${PROJECT_DIR}/scripts/runtime/_lib.sh"
}

backup_db_via_host_pg_dump() {
  pg_dump --no-owner --no-privileges "${DATABASE_URL}" > "${SQL_PATH}"
}

backup_db_via_compose_service() {
  local environment="${BACKUP_COMPOSE_ENVIRONMENT:-}"
  local compose_env_file

  if [[ -z "${environment}" ]]; then
    echo "BACKUP_COMPOSE_ENVIRONMENT is required when DB_BACKUP_MODE=compose-db" >&2
    exit 1
  fi

  require_runtime_lib
  environment="$(resolve_runtime_environment "${environment}")"
  compose_env_file="$(resolve_compose_env_file "${environment}")"

  run_compose "${environment}" "${compose_env_file}" exec -T db sh -lc \
    'export PGPASSWORD="${POSTGRES_PASSWORD}"; pg_dump --no-owner --no-privileges -h 127.0.0.1 -U "${POSTGRES_USER}" -d "${POSTGRES_DB}"' \
    > "${SQL_PATH}"
}

case "${DB_BACKUP_MODE}" in
  auto)
    if host_pg_dump_available; then
      backup_db_via_host_pg_dump
    elif [[ -n "${BACKUP_COMPOSE_ENVIRONMENT:-}" ]]; then
      backup_db_via_compose_service
    else
      echo "pg_dump command not found and BACKUP_COMPOSE_ENVIRONMENT is not configured" >&2
      exit 1
    fi
    ;;
  host)
    if ! host_pg_dump_available; then
      echo "pg_dump command not found" >&2
      exit 1
    fi
    backup_db_via_host_pg_dump
    ;;
  compose-db)
    backup_db_via_compose_service
    ;;
  *)
    echo "DB_BACKUP_MODE must be auto, host or compose-db" >&2
    exit 1
    ;;
esac

gzip -f "${SQL_PATH}"
sha256sum "${ARCHIVE_PATH}" > "${ARCHIVE_PATH}.sha256"

echo "DB backup created: ${ARCHIVE_PATH}"
echo "DB backup checksum: ${ARCHIVE_PATH}.sha256"
