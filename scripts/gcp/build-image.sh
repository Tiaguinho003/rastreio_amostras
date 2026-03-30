#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/_lib.sh"

CLOUD_ENV="${1:-cloud-homolog}"
load_cloud_context "${CLOUD_ENV}"

echo "[gcp] building image ${GCLOUD_IMAGE_URI} (env: ${CLOUD_ENV})"
gcloud builds submit "${PROJECT_DIR}" \
  --project "${GCLOUD_PROJECT_ID}" \
  --tag "${GCLOUD_IMAGE_URI}"
