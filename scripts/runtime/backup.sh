#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/_lib.sh"

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <development|internal-production>" >&2
  exit 1
fi

ENVIRONMENT="$(resolve_runtime_environment "$1")"
COMPOSE_ENV_FILE_PATH="$(resolve_compose_env_file "${ENVIRONMENT}")"
COMPOSE_FILE_PATH="$(canonical_compose_file "${ENVIRONMENT}")"
OPS_ENV_FILE_PATH="$(resolve_optional_ops_env_file "${ENVIRONMENT}" || true)"

print_runtime_context "${ENVIRONMENT}" "${COMPOSE_FILE_PATH}" "${COMPOSE_ENV_FILE_PATH}"
if [[ -n "${OPS_ENV_FILE_PATH}" ]]; then
  echo "[runtime] ops env file: ${OPS_ENV_FILE_PATH}"
fi

load_runtime_environment_context "${ENVIRONMENT}"

if [[ "${ENVIRONMENT}" == "internal-production" ]]; then
  export DB_BACKUP_MODE="${DB_BACKUP_MODE:-compose-db}"
else
  export DB_BACKUP_MODE="${DB_BACKUP_MODE:-auto}"
fi

export BACKUP_COMPOSE_ENVIRONMENT="${ENVIRONMENT}"

cd "${PROJECT_DIR}"
"${PROJECT_DIR}/scripts/ops/run-backup-cycle.sh"
