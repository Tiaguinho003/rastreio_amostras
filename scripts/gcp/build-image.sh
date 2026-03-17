#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/_lib.sh"

load_cloud_homolog_context

echo "[gcp] building image ${GCLOUD_IMAGE_URI}"
gcloud builds submit "${PROJECT_DIR}" \
  --project "${GCLOUD_PROJECT_ID}" \
  --tag "${GCLOUD_IMAGE_URI}"
