#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "pg_dump command not found" >&2
  exit 1
fi

if ! command -v sha256sum >/dev/null 2>&1; then
  echo "sha256sum command not found" >&2
  exit 1
fi

BACKUP_ROOT="${BACKUP_ROOT:-./data/backups}"
BACKUP_TIER="${BACKUP_TIER:-daily}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
TARGET_DIR="${BACKUP_ROOT}/${BACKUP_TIER}/db"

mkdir -p "${TARGET_DIR}"

SQL_PATH="${TARGET_DIR}/rastreio-db-${TIMESTAMP}.sql"
ARCHIVE_PATH="${SQL_PATH}.gz"

pg_dump --no-owner --no-privileges "${DATABASE_URL}" > "${SQL_PATH}"
gzip -f "${SQL_PATH}"
sha256sum "${ARCHIVE_PATH}" > "${ARCHIVE_PATH}.sha256"

echo "DB backup created: ${ARCHIVE_PATH}"
echo "DB backup checksum: ${ARCHIVE_PATH}.sha256"
