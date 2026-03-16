#!/usr/bin/env bash

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

runtime_usage_environment() {
  cat >&2 <<'EOF'
Ambiente invalido. Use um dos ambientes canonicos:
  - development
  - internal-production
EOF
}

resolve_runtime_environment() {
  local environment="${1:-}"

  case "${environment}" in
    development|internal-production)
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
    internal-production)
      printf '%s/.env.internal-production\n' "${PROJECT_DIR}"
      ;;
  esac
}

legacy_compose_env_fallback() {
  local environment="$1"

  case "${environment}" in
    development)
      printf '%s/.env\n' "${PROJECT_DIR}"
      ;;
    internal-production)
      printf '%s/.env.prod\n' "${PROJECT_DIR}"
      ;;
  esac
}

canonical_ops_env_file() {
  local environment="$1"

  case "${environment}" in
    development)
      printf '%s/.env.development.ops\n' "${PROJECT_DIR}"
      ;;
    internal-production)
      printf '%s/.env.internal-production.ops\n' "${PROJECT_DIR}"
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
    internal-production)
      printf 'http://127.0.0.1:%s\n' "${APP_PORT:-3001}"
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

      if [[ -z "${BACKUP_ROOT:-}" ]]; then
        export BACKUP_ROOT="${PROJECT_DIR}/.runtime/development/backups"
      fi
      ;;
    internal-production)
      if [[ -z "${INTERNAL_PRODUCTION_DB_HOST:-}" ]]; then
        export INTERNAL_PRODUCTION_DB_HOST="127.0.0.1"
      fi

      if [[ -z "${INTERNAL_PRODUCTION_DB_PORT:-}" ]]; then
        export INTERNAL_PRODUCTION_DB_PORT="55433"
      fi

      if [[ -z "${UPLOADS_DIR:-}" && -n "${UPLOADS_HOST_DIR:-}" ]]; then
        export UPLOADS_DIR="${UPLOADS_HOST_DIR}"
      fi

      if [[ -z "${EMAIL_OUTBOX_DIR:-}" && -n "${EMAIL_OUTBOX_HOST_DIR:-}" ]]; then
        export EMAIL_OUTBOX_DIR="${EMAIL_OUTBOX_HOST_DIR}"
      fi

      if [[ -z "${API_BASE_URL:-}" ]]; then
        export API_BASE_URL
        API_BASE_URL="$(default_api_base_url "${environment}")"
      fi

      if [[ -z "${DATABASE_URL:-}" && -n "${POSTGRES_USER:-}" && -n "${POSTGRES_PASSWORD:-}" && -n "${POSTGRES_DB:-}" ]]; then
        export DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${INTERNAL_PRODUCTION_DB_HOST}:${INTERNAL_PRODUCTION_DB_PORT}/${POSTGRES_DB}?schema=public"
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
