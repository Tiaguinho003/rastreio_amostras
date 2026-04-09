#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/_lib.sh"

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <development> <docker-compose-args...>" >&2
  exit 1
fi

ENVIRONMENT="$(resolve_runtime_environment "$1")"
shift

ENV_FILE_PATH="$(resolve_compose_env_file "${ENVIRONMENT}")"
COMPOSE_FILE_PATH="$(canonical_compose_file "${ENVIRONMENT}")"

print_runtime_context "${ENVIRONMENT}" "${COMPOSE_FILE_PATH}" "${ENV_FILE_PATH}"
run_compose "${ENVIRONMENT}" "${ENV_FILE_PATH}" "$@"
