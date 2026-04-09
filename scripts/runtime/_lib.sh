#!/usr/bin/env bash

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

runtime_usage_environment() {
  cat >&2 <<'EOF'
Ambiente invalido. Use o ambiente canonico:
  - development
EOF
}

resolve_runtime_environment() {
  local environment="${1:-}"

  case "${environment}" in
    development)
      printf '%s\n' "${environment}"
      ;;
    *)
      runtime_usage_environment
      return 1
      ;;
  esac
}

canonical_compose_file() {
  local environment="$1"
  printf '%s/compose/%s.yml\n' "${PROJECT_DIR}" "${environment}"
}

canonical_compose_env_file() {
  local environment="$1"

  case "${environment}" in
    development)
      printf '%s/.env.development\n' "${PROJECT_DIR}"
      ;;
  esac
}

legacy_compose_env_fallback() {
  local environment="$1"

  case "${environment}" in
    development)
      printf '%s/.env\n' "${PROJECT_DIR}"
      ;;
  esac
}

canonical_ops_env_file() {
  local environment="$1"

  case "${environment}" in
    development)
      printf '%s/.env.development.ops\n' "${PROJECT_DIR}"
      ;;
  esac
}

resolve_compose_env_file() {
  local environment="$1"
  local canonical
  local fallback

  if [[ -n "${ENV_FILE:-}" ]]; then
    printf '%s\n' "${ENV_FILE}"
    return 0
  fi

  canonical="$(canonical_compose_env_file "${environment}")"
  if [[ -f "${canonical}" ]]; then
    printf '%s\n' "${canonical}"
    return 0
  fi

  fallback="$(legacy_compose_env_fallback "${environment}")"
  if [[ -f "${fallback}" ]]; then
    printf '%s\n' "${fallback}"
    return 0
  fi

  echo "Env file not found for ${environment}. Expected ${canonical} or fallback ${fallback}." >&2
  return 1
}

resolve_ops_env_file() {
  local environment="$1"
  local candidate
  local canonical_ops
  local canonical_compose
  local legacy_compose

  if [[ -n "${OPS_ENV_FILE:-}" ]]; then
    printf '%s\n' "${OPS_ENV_FILE}"
    return 0
  fi

  canonical_ops="$(canonical_ops_env_file "${environment}")"
  canonical_compose="$(canonical_compose_env_file "${environment}")"
  legacy_compose="$(legacy_compose_env_fallback "${environment}")"

  for candidate in "${canonical_ops}" "${canonical_compose}" "${legacy_compose}"; do
    if [[ -f "${candidate}" ]]; then
      printf '%s\n' "${candidate}"
      return 0
    fi
  done

  echo "Operational env file not found for ${environment}. Expected ${canonical_ops} or a compatible fallback." >&2
  return 1
}

resolve_optional_ops_env_file() {
  local environment="$1"
  local candidate
  local canonical_ops
  local canonical_compose
  local legacy_compose

  if [[ -n "${OPS_ENV_FILE:-}" ]]; then
    printf '%s\n' "${OPS_ENV_FILE}"
    return 0
  fi

  canonical_ops="$(canonical_ops_env_file "${environment}")"
  canonical_compose="$(canonical_compose_env_file "${environment}")"
  legacy_compose="$(legacy_compose_env_fallback "${environment}")"

  for candidate in "${canonical_ops}" "${canonical_compose}" "${legacy_compose}"; do
    if [[ -f "${candidate}" ]]; then
      printf '%s\n' "${candidate}"
      return 0
    fi
  done

  return 1
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

run_compose() {
  local environment="$1"
  local env_file="$2"
  shift 2

  local compose_file
  compose_file="$(canonical_compose_file "${environment}")"

  if [[ ! -f "${compose_file}" ]]; then
    echo "Compose file not found: ${compose_file}" >&2
    return 1
  fi

  docker compose --env-file "${env_file}" -f "${compose_file}" "$@"
}

print_runtime_context() {
  local environment="$1"
  local compose_file="$2"
  local env_file="$3"

  echo "[runtime] environment: ${environment}"
  echo "[runtime] compose file: ${compose_file}"
  echo "[runtime] env file: ${env_file}"
}

default_api_base_url() {
  local environment="$1"

  case "${environment}" in
    development)
      printf 'http://127.0.0.1:%s\n' "${DEVELOPMENT_APP_PORT:-3000}"
      ;;
  esac
}

derive_runtime_defaults() {
  local environment="$1"

  case "${environment}" in
    development)
      if [[ -z "${API_BASE_URL:-}" ]]; then
        export API_BASE_URL
        API_BASE_URL="$(default_api_base_url "${environment}")"
      fi
      ;;
  esac
}

load_runtime_environment_context() {
  local environment="$1"
  local compose_env_file
  local ops_env_file

  compose_env_file="$(resolve_compose_env_file "${environment}")"
  source_local_env "${compose_env_file}"

  ops_env_file="$(resolve_optional_ops_env_file "${environment}" || true)"
  if [[ -n "${ops_env_file}" && "${ops_env_file}" != "${compose_env_file}" ]]; then
    source_local_env "${ops_env_file}"
  fi

  derive_runtime_defaults "${environment}"
}
