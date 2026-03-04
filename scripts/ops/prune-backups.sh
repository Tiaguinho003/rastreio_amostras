#!/usr/bin/env bash
set -euo pipefail

DRY_RUN="false"
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN="true"
fi

BACKUP_ROOT="${BACKUP_ROOT:-./data/backups}"

prune_tier() {
  local tier="$1"
  local kind="$2"
  local keep_count="$3"
  local dir="${BACKUP_ROOT}/${tier}/${kind}"

  if [[ ! -d "${dir}" ]]; then
    return
  fi

  mapfile -t archives < <(find "${dir}" -maxdepth 1 -type f \( -name '*.sql.gz' -o -name '*.tar.gz' \) -printf '%T@ %p\n' | sort -nr | awk '{print $2}')

  if (( ${#archives[@]} <= keep_count )); then
    return
  fi

  for ((idx=keep_count; idx<${#archives[@]}; idx++)); do
    archive="${archives[$idx]}"
    checksum="${archive}.sha256"

    if [[ "${DRY_RUN}" == "true" ]]; then
      echo "[dry-run] remove ${archive}"
      if [[ -f "${checksum}" ]]; then
        echo "[dry-run] remove ${checksum}"
      fi
      continue
    fi

    rm -f "${archive}"
    rm -f "${checksum}"
    echo "removed ${archive}"
  done
}

prune_tier "daily" "db" 14
prune_tier "daily" "uploads" 14
prune_tier "weekly" "db" 8
prune_tier "weekly" "uploads" 8
prune_tier "monthly" "db" 12
prune_tier "monthly" "uploads" 12

echo "Backup prune completed"
