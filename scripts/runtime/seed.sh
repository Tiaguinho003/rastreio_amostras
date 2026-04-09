#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/_lib.sh"

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <development>" >&2
  exit 1
fi

ENVIRONMENT="$(resolve_runtime_environment "$1")"
ENV_FILE_PATH="$(resolve_compose_env_file "${ENVIRONMENT}")"
COMPOSE_FILE_PATH="$(canonical_compose_file "${ENVIRONMENT}")"

print_runtime_context "${ENVIRONMENT}" "${COMPOSE_FILE_PATH}" "${ENV_FILE_PATH}"

source_local_env "${ENV_FILE_PATH}"
cd "${PROJECT_DIR}"
npm run db:seed
