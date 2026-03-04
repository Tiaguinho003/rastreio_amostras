#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <backup.tar.gz>" >&2
  exit 1
fi

BACKUP_FILE="$1"
if [[ ! -f "${BACKUP_FILE}" ]]; then
  echo "Backup file not found: ${BACKUP_FILE}" >&2
  exit 1
fi

if [[ "${CONFIRM_RESTORE:-}" != "yes" ]]; then
  echo "Restore is destructive. Re-run with CONFIRM_RESTORE=yes" >&2
  exit 1
fi

UPLOADS_DIR="${UPLOADS_DIR:-./data/uploads}"
mkdir -p "${UPLOADS_DIR}"

if [[ "${SKIP_UPLOADS_CLEANUP:-false}" != "true" ]]; then
  find "${UPLOADS_DIR}" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
fi

tar -xzf "${BACKUP_FILE}" -C "${UPLOADS_DIR}"

echo "Uploads restore completed from: ${BACKUP_FILE}"
