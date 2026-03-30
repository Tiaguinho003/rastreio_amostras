#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/_lib.sh"

FAILURES=0
WARNINGS=0

check_cmd() {
  local bin="$1"
  if command -v "${bin}" >/dev/null 2>&1; then
    echo "[OK] command found: ${bin}"
  else
    echo "[FAIL] command missing: ${bin}"
    FAILURES=$((FAILURES + 1))
  fi
}

check_var() {
  local key="$1"
  local value="${!key:-}"

  if [[ -n "${value}" ]]; then
    echo "[OK] env set: ${key}"
  else
    echo "[FAIL] env missing: ${key}"
    FAILURES=$((FAILURES + 1))
  fi
}

warn_line() {
  echo "[WARN] $1"
  WARNINGS=$((WARNINGS + 1))
}

check_gcloud_resource() {
  local label="$1"
  shift

  if "$@" >/dev/null 2>&1; then
    echo "[OK] ${label}"
  else
    warn_line "${label} not found or not accessible yet"
  fi
}

CLOUD_ENV="${1:-cloud-homolog}"
load_cloud_context "${CLOUD_ENV}"

echo "=== Cloud Preflight (${CLOUD_ENV}) ==="
echo "[gcp] project: ${GCLOUD_PROJECT_ID:-<missing>}"
echo "[gcp] region: ${GCLOUD_REGION}"
echo "[gcp] service: ${GCLOUD_CLOUD_RUN_SERVICE}"
echo "[gcp] image: ${GCLOUD_IMAGE_URI:-<missing>}"

check_cmd gcloud
check_cmd curl

echo
echo "=== Env ==="
check_var GCLOUD_PROJECT_ID
check_var GCLOUD_ARTIFACT_REGISTRY_REPOSITORY
check_var GCLOUD_IMAGE_URI
check_var GCLOUD_CLOUD_RUN_SERVICE
check_var GCLOUD_CLOUD_RUN_MIGRATE_JOB
check_var GCLOUD_CLOUD_RUN_SEED_JOB
check_var GCLOUD_SERVICE_ACCOUNT
check_var GCLOUD_CLOUD_SQL_INSTANCE_CONNECTION_NAME
check_var GCLOUD_STORAGE_BUCKET
check_var GCLOUD_SECRET_DATABASE_URL
check_var GCLOUD_SECRET_AUTH_SECRET
check_var GCLOUD_SECRET_BOOTSTRAP_ADMIN_FULL_NAME
check_var GCLOUD_SECRET_BOOTSTRAP_ADMIN_USERNAME
check_var GCLOUD_SECRET_BOOTSTRAP_ADMIN_EMAIL
check_var GCLOUD_SECRET_BOOTSTRAP_ADMIN_PASSWORD
check_var APP_BASE_URL
check_var SESSION_COOKIE_SECURE
check_var EMAIL_TRANSPORT
check_var UPLOADS_DIR
check_var EMAIL_OUTBOX_DIR
check_var MAX_UPLOAD_SIZE_BYTES

echo
echo "=== gcloud Context ==="
ACTIVE_ACCOUNT="$(gcloud auth list --filter=status:ACTIVE --format='value(account)' 2>/dev/null || true)"
CONFIG_PROJECT="$(gcloud config get-value project 2>/dev/null || true)"

if [[ -n "${ACTIVE_ACCOUNT}" ]]; then
  echo "[OK] active account: ${ACTIVE_ACCOUNT}"
else
  warn_line "No active gcloud account found"
fi

if [[ "${CONFIG_PROJECT}" == "${GCLOUD_PROJECT_ID}" ]]; then
  echo "[OK] gcloud project matches GCLOUD_PROJECT_ID"
else
  warn_line "gcloud project differs from GCLOUD_PROJECT_ID (${CONFIG_PROJECT:-unset} != ${GCLOUD_PROJECT_ID})"
fi

echo
echo "=== Resource Checks ==="
check_gcloud_resource \
  "Artifact Registry repository available" \
  gcloud artifacts repositories describe "${GCLOUD_ARTIFACT_REGISTRY_REPOSITORY}" \
    --project "${GCLOUD_PROJECT_ID}" \
    --location "${GCLOUD_REGION}"

check_gcloud_resource \
  "Storage bucket available" \
  gcloud storage buckets describe "gs://${GCLOUD_STORAGE_BUCKET}" \
    --project "${GCLOUD_PROJECT_ID}"

check_gcloud_resource \
  "Service account available" \
  gcloud iam service-accounts describe "${GCLOUD_SERVICE_ACCOUNT}" \
    --project "${GCLOUD_PROJECT_ID}"

check_gcloud_resource \
  "Cloud SQL instance available" \
  gcloud sql instances describe "$(cloud_sql_instance_name)" \
    --project "${GCLOUD_PROJECT_ID}"

for secret_name in \
  "${GCLOUD_SECRET_DATABASE_URL}" \
  "${GCLOUD_SECRET_AUTH_SECRET}" \
  "${GCLOUD_SECRET_BOOTSTRAP_ADMIN_FULL_NAME}" \
  "${GCLOUD_SECRET_BOOTSTRAP_ADMIN_USERNAME}" \
  "${GCLOUD_SECRET_BOOTSTRAP_ADMIN_EMAIL}" \
  "${GCLOUD_SECRET_BOOTSTRAP_ADMIN_PASSWORD}"; do
  check_gcloud_resource \
    "Secret ${secret_name} available" \
    gcloud secrets describe "${secret_name}" \
      --project "${GCLOUD_PROJECT_ID}"
done

echo
if [[ "${FAILURES}" -gt 0 ]]; then
  echo "Cloud preflight FAILED with ${FAILURES} issue(s) and ${WARNINGS} warning(s)"
  exit 1
fi

echo "Cloud preflight PASSED with ${WARNINGS} warning(s)"
