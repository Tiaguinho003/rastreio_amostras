#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

day_of_month="$(date +%d)"
day_of_week="$(date +%u)"

BACKUP_TIER="daily"
if [[ "${day_of_month}" == "01" ]]; then
  BACKUP_TIER="monthly"
elif [[ "${day_of_week}" == "7" ]]; then
  BACKUP_TIER="weekly"
fi

export BACKUP_TIER

"${SCRIPT_DIR}/backup-db.sh"
"${SCRIPT_DIR}/backup-uploads.sh"
"${SCRIPT_DIR}/prune-backups.sh"

echo "Backup cycle completed for tier: ${BACKUP_TIER}"
