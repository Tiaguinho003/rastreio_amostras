#!/usr/bin/env bash
set -euo pipefail

if ! command -v tar >/dev/null 2>&1; then
  echo "tar command not found" >&2
  exit 1
fi

if ! command -v sha256sum >/dev/null 2>&1; then
  echo "sha256sum command not found" >&2
  exit 1
fi

UPLOADS_DIR="${UPLOADS_DIR:-./data/uploads}"
if [[ ! -d "${UPLOADS_DIR}" ]]; then
  echo "UPLOADS_DIR does not exist: ${UPLOADS_DIR}" >&2
  exit 1
fi

BACKUP_ROOT="${BACKUP_ROOT:-./data/backups}"
BACKUP_TIER="${BACKUP_TIER:-daily}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
TARGET_DIR="${BACKUP_ROOT}/${BACKUP_TIER}/uploads"

mkdir -p "${TARGET_DIR}"

ARCHIVE_PATH="${TARGET_DIR}/rastreio-uploads-${TIMESTAMP}.tar.gz"

tar -czf "${ARCHIVE_PATH}" -C "${UPLOADS_DIR}" .
sha256sum "${ARCHIVE_PATH}" > "${ARCHIVE_PATH}.sha256"

echo "Uploads backup created: ${ARCHIVE_PATH}"
echo "Uploads backup checksum: ${ARCHIVE_PATH}.sha256"
