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
COMPOSE_ENV_FILE_PATH="$(resolve_compose_env_file "${ENVIRONMENT}")"
OPS_ENV_FILE_PATH="$(resolve_ops_env_file "${ENVIRONMENT}")"
COMPOSE_FILE_PATH="$(canonical_compose_file "${ENVIRONMENT}")"

print_runtime_context "${ENVIRONMENT}" "${COMPOSE_FILE_PATH}" "${COMPOSE_ENV_FILE_PATH}"
echo "[runtime] ops env file: ${OPS_ENV_FILE_PATH}"
load_runtime_environment_context "${ENVIRONMENT}"

cd "${PROJECT_DIR}"
"${PROJECT_DIR}/scripts/lib/smoke-test.sh"
