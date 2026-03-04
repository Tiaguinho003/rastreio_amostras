#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <backup.sql|backup.sql.gz>" >&2
  exit 1
fi

BACKUP_FILE="$1"
if [[ ! -f "${BACKUP_FILE}" ]]; then
  echo "Backup file not found: ${BACKUP_FILE}" >&2
  exit 1
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi

if [[ "${CONFIRM_RESTORE:-}" != "yes" ]]; then
  echo "Restore is destructive. Re-run with CONFIRM_RESTORE=yes" >&2
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "psql command not found" >&2
  exit 1
fi

if [[ "${SKIP_SCHEMA_RESET:-false}" != "true" ]]; then
  psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 -c 'DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;'
fi

if [[ "${BACKUP_FILE}" == *.gz ]]; then
  if ! command -v gzip >/dev/null 2>&1; then
    echo "gzip command not found" >&2
    exit 1
  fi
  gzip -dc "${BACKUP_FILE}" | psql "${DATABASE_URL}" -v ON_ERROR_STOP=1
else
  psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 < "${BACKUP_FILE}"
fi

echo "DB restore completed from: ${BACKUP_FILE}"
