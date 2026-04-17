#!/usr/bin/env bash

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

canonical_cloud_env_file() {
  local env_name="${1:?env_name required}"
  printf '%s/.env.%s\n' "${PROJECT_DIR}" "${env_name}"
}

canonical_cloud_ops_env_file() {
  local env_name="${1:?env_name required}"
  printf '%s/.env.%s.ops\n' "${PROJECT_DIR}" "${env_name}"
}

source_local_env() {
  local env_file="$1"

  if [[ ! -f "${env_file}" ]]; then
    echo "Env file not found: ${env_file}" >&2
    return 1
  fi

  set -a
  # shellcheck disable=SC1090
  source "${env_file}"
  set +a
}

load_cloud_context() {
  local env_name="${1:?env_name required}"
  local env_file
  local ops_env_file

  env_file="${ENV_FILE:-$(canonical_cloud_env_file "${env_name}")}"
  ops_env_file="${OPS_ENV_FILE:-$(canonical_cloud_ops_env_file "${env_name}")}"

  source_local_env "${env_file}"
  source_local_env "${ops_env_file}"
  derive_cloud_defaults
}

derive_cloud_defaults() {
  : "${GCLOUD_REGION:=southamerica-east1}"
  : "${GCLOUD_ARTIFACT_REGISTRY_HOST:=${GCLOUD_REGION}-docker.pkg.dev}"
  : "${GCLOUD_IMAGE_NAME:=rastreio-interno-amostras}"
  if [[ -z "${GCLOUD_IMAGE_TAG:-}" ]]; then
    GCLOUD_IMAGE_TAG="$(git -C "${PROJECT_DIR}" rev-parse --short HEAD 2>/dev/null || echo 'no-git')"
    export GCLOUD_IMAGE_TAG
  fi
  : "${GCLOUD_STORAGE_MOUNT_PATH:=/mnt/runtime}"
  : "${SESSION_COOKIE_SECURE:=auto}"
  : "${EMAIL_TRANSPORT:=outbox}"
  : "${MAX_UPLOAD_SIZE_BYTES:=12582912}"
  : "${GCLOUD_CPU:=1}"
  : "${GCLOUD_MEMORY:=1Gi}"
  : "${GCLOUD_CONCURRENCY:=10}"
  : "${GCLOUD_MIN_INSTANCES:=0}"
  : "${GCLOUD_MAX_INSTANCES:=3}"
  : "${GCLOUD_TIMEOUT_SECONDS:=300}"
  : "${GCLOUD_ALLOW_UNAUTHENTICATED:=true}"

  if [[ -z "${UPLOADS_DIR:-}" ]]; then
    export UPLOADS_DIR="${GCLOUD_STORAGE_MOUNT_PATH%/}/uploads"
  fi

  if [[ -z "${EMAIL_OUTBOX_DIR:-}" ]]; then
    export EMAIL_OUTBOX_DIR="${GCLOUD_STORAGE_MOUNT_PATH%/}/email-outbox"
  fi

  if [[ -z "${API_BASE_URL:-}" && -n "${APP_BASE_URL:-}" ]]; then
    export API_BASE_URL="${APP_BASE_URL}"
  fi

  if [[ -n "${GCLOUD_PROJECT_ID:-}" && -n "${GCLOUD_ARTIFACT_REGISTRY_REPOSITORY:-}" ]]; then
    export GCLOUD_IMAGE_URI="${GCLOUD_ARTIFACT_REGISTRY_HOST}/${GCLOUD_PROJECT_ID}/${GCLOUD_ARTIFACT_REGISTRY_REPOSITORY}/${GCLOUD_IMAGE_NAME}:${GCLOUD_IMAGE_TAG}"
  fi
}

runtime_env_vars_csv() {
  local app_base_url="${1:-${APP_BASE_URL:-https://app.exemplo.local}}"

  local csv
  csv="$(printf 'NODE_ENV=production,APP_BASE_URL=%s,SESSION_COOKIE_SECURE=%s,EMAIL_TRANSPORT=%s,UPLOADS_DIR=%s,MAX_UPLOAD_SIZE_BYTES=%s' \
    "${app_base_url}" \
    "${SESSION_COOKIE_SECURE}" \
    "${EMAIL_TRANSPORT}" \
    "${UPLOADS_DIR}" \
    "${MAX_UPLOAD_SIZE_BYTES}")"

  if [[ "${EMAIL_TRANSPORT}" == "smtp" ]]; then
    csv="${csv},SMTP_HOST=${SMTP_HOST},SMTP_PORT=${SMTP_PORT},SMTP_SECURE=${SMTP_SECURE:-false},SMTP_FROM=${SMTP_FROM}"
    if [[ -n "${SMTP_USER:-}" ]]; then csv="${csv},SMTP_USER=${SMTP_USER}"; fi
  else
    csv="${csv},EMAIL_OUTBOX_DIR=${EMAIL_OUTBOX_DIR},EMAIL_OUTBOX_FROM=${EMAIL_OUTBOX_FROM:-rastreio@example.local}"
  fi

  printf '%s' "${csv}"
}

runtime_secret_mappings_csv() {
  local csv
  csv="$(printf 'DATABASE_URL=%s:latest,AUTH_SECRET=%s:latest,BOOTSTRAP_ADMIN_FULL_NAME=%s:latest,BOOTSTRAP_ADMIN_USERNAME=%s:latest,BOOTSTRAP_ADMIN_EMAIL=%s:latest,BOOTSTRAP_ADMIN_PASSWORD=%s:latest' \
    "${GCLOUD_SECRET_DATABASE_URL}" \
    "${GCLOUD_SECRET_AUTH_SECRET}" \
    "${GCLOUD_SECRET_BOOTSTRAP_ADMIN_FULL_NAME}" \
    "${GCLOUD_SECRET_BOOTSTRAP_ADMIN_USERNAME}" \
    "${GCLOUD_SECRET_BOOTSTRAP_ADMIN_EMAIL}" \
    "${GCLOUD_SECRET_BOOTSTRAP_ADMIN_PASSWORD}")"

  if [[ -n "${GCLOUD_SECRET_SMTP_PASS:-}" ]]; then
    csv="${csv},SMTP_PASS=${GCLOUD_SECRET_SMTP_PASS}:latest"
  fi

  if [[ -n "${GCLOUD_SECRET_OPENAI_API_KEY:-}" ]]; then
    csv="${csv},OPENAI_API_KEY=${GCLOUD_SECRET_OPENAI_API_KEY}:latest"
  fi

  printf '%s' "${csv}"
}

runtime_volume_spec() {
  printf 'name=runtime,type=cloud-storage,bucket=%s,mount-options=implicit-dirs;uid=1001;gid=1001' "${GCLOUD_STORAGE_BUCKET}"
}

runtime_volume_mount_spec() {
  printf 'volume=runtime,mount-path=%s' "${GCLOUD_STORAGE_MOUNT_PATH}"
}

service_url() {
  gcloud run services describe "${GCLOUD_CLOUD_RUN_SERVICE}" \
    --project "${GCLOUD_PROJECT_ID}" \
    --region "${GCLOUD_REGION}" \
    --format='value(status.url)'
}

cloud_sql_instance_name() {
  printf '%s\n' "${GCLOUD_CLOUD_SQL_INSTANCE_CONNECTION_NAME##*:}"
}

bool_is_true() {
  local raw="${1:-}"
  case "$(printf '%s' "${raw}" | tr '[:upper:]' '[:lower:]')" in
    1|true|yes|on)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}
