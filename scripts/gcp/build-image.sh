#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/_lib.sh"

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <cloud-env>" >&2
  exit 1
fi
CLOUD_ENV="$1"
load_cloud_context "${CLOUD_ENV}"

ALLOW_DIRTY="${ALLOW_DIRTY:-false}"
if [[ "${ALLOW_DIRTY}" != "true" ]]; then
  if ! git -C "${PROJECT_DIR}" diff-index --quiet HEAD -- 2>/dev/null; then
    echo "[gcp] ERRO: working tree tem mudancas nao commitadas." >&2
    echo "" >&2
    echo "  Commita as mudancas antes de buildar (a tag da imagem usa o SHA do HEAD)." >&2
    echo "" >&2
    echo "  Para bypass excepcional (recovery, build de WIP):" >&2
    echo "    ALLOW_DIRTY=true scripts/gcp/build-image.sh ${CLOUD_ENV}" >&2
    echo "" >&2
    git -C "${PROJECT_DIR}" status --short >&2
    exit 1
  fi

  UNTRACKED="$(git -C "${PROJECT_DIR}" ls-files --others --exclude-standard)"
  if [[ -n "${UNTRACKED}" ]]; then
    echo "[gcp] ERRO: arquivos untracked nao ignorados pelo .gitignore:" >&2
    echo "${UNTRACKED}" | sed 's/^/    /' >&2
    echo "" >&2
    echo "  Esses arquivos iriam para o build context do gcloud builds submit." >&2
    echo "  Adiciona ao .gitignore (se for lixo) ou commita (se for relevante)." >&2
    echo "" >&2
    echo "  Para bypass excepcional:" >&2
    echo "    ALLOW_DIRTY=true scripts/gcp/build-image.sh ${CLOUD_ENV}" >&2
    exit 1
  fi
fi

echo "[gcp] building image ${GCLOUD_IMAGE_URI} (env: ${CLOUD_ENV})"
gcloud builds submit "${PROJECT_DIR}" \
  --project "${GCLOUD_PROJECT_ID}" \
  --tag "${GCLOUD_IMAGE_URI}"
