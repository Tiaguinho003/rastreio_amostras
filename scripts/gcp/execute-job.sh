#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/_lib.sh"

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <migrate|seed>" >&2
  exit 1
fi

load_cloud_homolog_context

case "$1" in
  migrate)
    JOB_NAME="${GCLOUD_CLOUD_RUN_MIGRATE_JOB}"
    ;;
  seed)
    JOB_NAME="${GCLOUD_CLOUD_RUN_SEED_JOB}"
    ;;
  *)
    echo "Invalid job. Use migrate or seed." >&2
    exit 1
    ;;
esac

gcloud run jobs execute "${JOB_NAME}" \
  --project "${GCLOUD_PROJECT_ID}" \
  --region "${GCLOUD_REGION}" \
  --wait
