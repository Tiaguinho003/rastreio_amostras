#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/_lib.sh"

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <cloud-env> [--canary]" >&2
  exit 1
fi
CLOUD_ENV="$1"
shift
CANARY="false"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --canary|--no-traffic)
      CANARY="true"
      shift
      ;;
    *)
      echo "Unknown flag: $1" >&2
      echo "Usage: $0 <cloud-env> [--canary]" >&2
      exit 1
      ;;
  esac
done
load_cloud_context "${CLOUD_ENV}"

RUNTIME_ENV_VARS="$(runtime_env_vars_csv "${APP_BASE_URL:-https://app.exemplo.local}")"
RUNTIME_SECRETS="$(runtime_secret_mappings_csv)"
VOLUME_SPEC="$(runtime_volume_spec)"
VOLUME_MOUNT_SPEC="$(runtime_volume_mount_spec)"

ALLOW_FLAG=(--no-allow-unauthenticated)
if bool_is_true "${GCLOUD_ALLOW_UNAUTHENTICATED}"; then
  ALLOW_FLAG=(--allow-unauthenticated)
fi

DEPLOY_ARGS=()
if [[ "${CANARY}" == "true" ]]; then
  DEPLOY_ARGS+=(--no-traffic --tag=canary)
  echo "[gcp] deploying CANARY revision of ${GCLOUD_CLOUD_RUN_SERVICE} (env: ${CLOUD_ENV}) — no traffic"
else
  echo "[gcp] deploying service ${GCLOUD_CLOUD_RUN_SERVICE} (env: ${CLOUD_ENV})"
fi

gcloud run deploy "${GCLOUD_CLOUD_RUN_SERVICE}" \
  --project "${GCLOUD_PROJECT_ID}" \
  --region "${GCLOUD_REGION}" \
  --platform managed \
  --image "${GCLOUD_IMAGE_URI}" \
  --execution-environment gen2 \
  --port 3000 \
  --cpu "${GCLOUD_CPU}" \
  --memory "${GCLOUD_MEMORY}" \
  --concurrency "${GCLOUD_CONCURRENCY}" \
  --min-instances "${GCLOUD_MIN_INSTANCES}" \
  --max-instances "${GCLOUD_MAX_INSTANCES}" \
  --timeout "${GCLOUD_TIMEOUT_SECONDS}" \
  --service-account "${GCLOUD_SERVICE_ACCOUNT}" \
  --set-cloudsql-instances "${GCLOUD_CLOUD_SQL_INSTANCE_CONNECTION_NAME}" \
  --clear-volumes \
  --add-volume "${VOLUME_SPEC}" \
  --clear-volume-mounts \
  --add-volume-mount "${VOLUME_MOUNT_SPEC}" \
  --set-env-vars "${RUNTIME_ENV_VARS}" \
  --set-secrets "${RUNTIME_SECRETS}" \
  "${DEPLOY_ARGS[@]}" \
  "${ALLOW_FLAG[@]}"

SERVICE_URL="$(service_url || true)"
if [[ -n "${SERVICE_URL}" ]]; then
  if [[ "${CANARY}" != "true" ]]; then
    echo "[gcp] service URL: ${SERVICE_URL}"

    if [[ "${APP_BASE_URL:-}" != "${SERVICE_URL}" ]]; then
      echo "[gcp] updating APP_BASE_URL to the generated Cloud Run URL"
      gcloud run services update "${GCLOUD_CLOUD_RUN_SERVICE}" \
        --project "${GCLOUD_PROJECT_ID}" \
        --region "${GCLOUD_REGION}" \
        --update-env-vars "APP_BASE_URL=${SERVICE_URL}"
    fi
  fi

  RUNTIME_ENV_VARS="$(runtime_env_vars_csv "${SERVICE_URL}")"
fi

if [[ "${CANARY}" == "true" && -n "${SERVICE_URL}" ]]; then
  CANARY_URL="${SERVICE_URL/https:\/\//https://canary---}"
  echo ""
  echo "[gcp] ============================================================"
  echo "[gcp]  CANARY deployed (sem trafego)"
  echo "[gcp]  URL: ${CANARY_URL}"
  echo "[gcp]  Trafego 100% continua na revisao anterior."
  echo "[gcp]  Para promover apos smoke test:"
  echo "[gcp]    gcloud run services update-traffic ${GCLOUD_CLOUD_RUN_SERVICE} \\"
  echo "[gcp]      --to-latest --region=${GCLOUD_REGION}"
  echo "[gcp] ============================================================"
fi

for job_name in "${GCLOUD_CLOUD_RUN_MIGRATE_JOB}" "${GCLOUD_CLOUD_RUN_SEED_JOB}"; do
  if [[ "${job_name}" == "${GCLOUD_CLOUD_RUN_MIGRATE_JOB}" ]]; then
    JOB_COMMAND="npm"
    JOB_ARGS="run,prisma:migrate:deploy"
  else
    JOB_COMMAND="npm"
    JOB_ARGS="run,db:seed"
  fi

  echo "[gcp] deploying job ${job_name}"
  gcloud run jobs deploy "${job_name}" \
    --project "${GCLOUD_PROJECT_ID}" \
    --region "${GCLOUD_REGION}" \
    --image "${GCLOUD_IMAGE_URI}" \
    --cpu "${GCLOUD_CPU}" \
    --memory "${GCLOUD_MEMORY}" \
    --task-timeout "${GCLOUD_TIMEOUT_SECONDS}s" \
    --max-retries 0 \
    --tasks 1 \
    --parallelism 1 \
    --service-account "${GCLOUD_SERVICE_ACCOUNT}" \
    --set-cloudsql-instances "${GCLOUD_CLOUD_SQL_INSTANCE_CONNECTION_NAME}" \
    --clear-volumes \
    --add-volume "${VOLUME_SPEC}" \
    --clear-volume-mounts \
    --add-volume-mount "${VOLUME_MOUNT_SPEC}" \
    --set-env-vars "${RUNTIME_ENV_VARS}" \
    --set-secrets "${RUNTIME_SECRETS}" \
    --command "${JOB_COMMAND}" \
    --args "${JOB_ARGS}"
done

echo "[gcp] deploy completed"
