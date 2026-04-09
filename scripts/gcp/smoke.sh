#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/_lib.sh"

CLOUD_ENV="${1:-cloud-homolog}"
load_cloud_context "${CLOUD_ENV}"

if [[ "${API_BASE_URL:-}" == "https://placeholder.invalid" || "${APP_BASE_URL:-}" == "https://placeholder.invalid" ]]; then
  SERVICE_URL="$(service_url || true)"
  if [[ -n "${SERVICE_URL}" ]]; then
    export API_BASE_URL="${SERVICE_URL}"
  fi
fi

cd "${PROJECT_DIR}"
"${PROJECT_DIR}/scripts/lib/smoke-test.sh"
