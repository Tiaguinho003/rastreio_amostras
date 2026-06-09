#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/_lib.sh"

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <migrate|seed|backfill-liga> <cloud-env> [--dry-run]" >&2
  exit 1
fi

CLOUD_ENV="$2"
load_cloud_context "${CLOUD_ENV}"

# Overrides opcionais de comando/args pro gcloud (vazio = roda o job como deployado).
OVERRIDE_ARGS=()

case "$1" in
  migrate)
    JOB_NAME="${GCLOUD_CLOUD_RUN_MIGRATE_JOB}"
    ;;
  seed)
    JOB_NAME="${GCLOUD_CLOUD_RUN_SEED_JOB}"
    ;;
  backfill-liga)
    # Backfill de safra/owner das ligas: reusa a imagem do job migrate (que carrega
    # src/ + scripts/) e sobrescreve o comando pra rodar o script. --dry-run (3o arg)
    # e repassado ao script via `npm run backfill:liga -- --dry-run`.
    JOB_NAME="${GCLOUD_CLOUD_RUN_MIGRATE_JOB}"
    if [[ "${3:-}" == "--dry-run" ]]; then
      OVERRIDE_ARGS=(--command npm --args "run,backfill:liga,--,--dry-run")
    else
      OVERRIDE_ARGS=(--command npm --args "run,backfill:liga")
    fi
    ;;
  *)
    echo "Invalid job. Use migrate, seed or backfill-liga." >&2
    exit 1
    ;;
esac

gcloud run jobs execute "${JOB_NAME}" \
  --project "${GCLOUD_PROJECT_ID}" \
  --region "${GCLOUD_REGION}" \
  ${OVERRIDE_ARGS[@]+"${OVERRIDE_ARGS[@]}"} \
  --wait
