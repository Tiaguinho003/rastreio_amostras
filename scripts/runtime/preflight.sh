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
COMPOSE_ENV_FILE="$(resolve_compose_env_file "${ENVIRONMENT}")"
COMPOSE_FILE_PATH="$(canonical_compose_file "${ENVIRONMENT}")"
OPS_ENV_FILE_PATH="$(resolve_optional_ops_env_file "${ENVIRONMENT}" || true)"
FAILURES=0
WARNINGS=0

check_cmd() {
  local bin="$1"
  if command -v "${bin}" >/dev/null 2>&1; then
    echo "[OK] command found: ${bin}"
  else
    echo "[FAIL] command missing: ${bin}"
    FAILURES=$((FAILURES + 1))
  fi
}

check_var() {
  local key="$1"
  local value="${!key:-}"

  if [[ -n "${value}" ]]; then
    echo "[OK] env set: ${key}"
  else
    echo "[FAIL] env missing: ${key}"
    FAILURES=$((FAILURES + 1))
  fi
}

check_bootstrap_or_legacy_local_auth() {
  if [[ -n "${LOCAL_AUTH_USERS_JSON:-}" ]]; then
    echo "[OK] env set: LOCAL_AUTH_USERS_JSON (legacy compatibility)"
    return 0
  fi

  check_var BOOTSTRAP_ADMIN_FULL_NAME
  check_var BOOTSTRAP_ADMIN_USERNAME
  check_var BOOTSTRAP_ADMIN_EMAIL
  check_var BOOTSTRAP_ADMIN_PASSWORD
}

warn_line() {
  echo "[WARN] $1"
  WARNINGS=$((WARNINGS + 1))
}

check_optional_var() {
  local key="$1"
  local value="${!key:-}"

  if [[ -n "${value}" ]]; then
    echo "[OK] env set: ${key}"
  else
    warn_line "${key} not set; this wrapper step still depends on explicit operator input or a fuller local env."
  fi
}

check_optional_positive_integer_var() {
  local key="$1"
  local value="${!key:-}"

  if [[ -z "${value}" ]]; then
    warn_line "${key} not set; runtime will use the built-in default."
    return 0
  fi

  if [[ "${value}" =~ ^[1-9][0-9]*$ ]]; then
    echo "[OK] env set: ${key}=${value}"
  else
    echo "[FAIL] ${key} must be a positive integer"
    FAILURES=$((FAILURES + 1))
  fi
}

check_session_cookie_secure_setting() {
  local raw="${SESSION_COOKIE_SECURE:-}"
  local normalized

  if [[ -z "${raw}" ]]; then
    warn_line "SESSION_COOKIE_SECURE not set; legacy fallback still depends on automatic request detection."
    return 0
  fi

  normalized="$(printf '%s' "${raw}" | tr '[:upper:]' '[:lower:]')"
  case "${normalized}" in
    auto|true|false|1|0|yes|no|on|off)
      echo "[OK] env set: SESSION_COOKIE_SECURE=${raw}"
      ;;
    *)
      echo "[FAIL] SESSION_COOKIE_SECURE must be auto, true or false"
      FAILURES=$((FAILURES + 1))
      ;;
  esac
}

echo "=== Runtime Preflight (${ENVIRONMENT}) ==="
print_runtime_context "${ENVIRONMENT}" "${COMPOSE_FILE_PATH}" "${COMPOSE_ENV_FILE}"

check_cmd docker
check_cmd node

echo
echo "=== Compose Env ==="
source_local_env "${COMPOSE_ENV_FILE}"
derive_runtime_defaults "${ENVIRONMENT}"

if [[ "${ENVIRONMENT}" == "development" ]]; then
  check_var DATABASE_URL
  check_var AUTH_SECRET
  check_bootstrap_or_legacy_local_auth
  check_var UPLOADS_DIR
  check_optional_positive_integer_var MAX_UPLOAD_SIZE_BYTES
  check_var BACKUP_ROOT
  check_var API_BASE_URL
  check_session_cookie_secure_setting
else
  check_var APP_PORT
  check_var APP_BASE_URL
  check_var INTERNAL_PRODUCTION_DB_HOST
  check_var INTERNAL_PRODUCTION_DB_PORT
  check_var POSTGRES_USER
  check_var POSTGRES_PASSWORD
  check_var POSTGRES_DB
  check_var POSTGRES_DATA_DIR
  check_var UPLOADS_HOST_DIR
  check_var EMAIL_OUTBOX_HOST_DIR
  check_optional_positive_integer_var MAX_UPLOAD_SIZE_BYTES
  check_var BACKUP_ROOT
  check_var AUTH_SECRET
  check_var BOOTSTRAP_ADMIN_FULL_NAME
  check_var BOOTSTRAP_ADMIN_USERNAME
  check_var BOOTSTRAP_ADMIN_EMAIL
  check_var BOOTSTRAP_ADMIN_PASSWORD
  check_var EMAIL_TRANSPORT
  check_session_cookie_secure_setting

  case "${EMAIL_TRANSPORT:-}" in
    smtp)
      check_var SMTP_HOST
      check_var SMTP_PORT
      check_var SMTP_FROM
      ;;
    outbox)
      echo "[OK] EMAIL_TRANSPORT uses local outbox"
      ;;
    *)
      echo "[FAIL] EMAIL_TRANSPORT must be smtp or outbox"
      FAILURES=$((FAILURES + 1))
      ;;
  esac
fi

echo
echo "=== Compose Validation ==="
if command -v docker >/dev/null 2>&1; then
  if run_compose "${ENVIRONMENT}" "${COMPOSE_ENV_FILE}" config >/dev/null 2>&1; then
    echo "[OK] docker compose config is valid"
  else
    echo "[FAIL] docker compose config failed"
    FAILURES=$((FAILURES + 1))
  fi
fi

echo
echo "=== Operational Env ==="
if [[ -n "${OPS_ENV_FILE_PATH}" ]]; then
  echo "[OK] ops env file found: ${OPS_ENV_FILE_PATH}"
  if [[ "${OPS_ENV_FILE_PATH}" != "${COMPOSE_ENV_FILE}" ]]; then
    source_local_env "${OPS_ENV_FILE_PATH}"
    derive_runtime_defaults "${ENVIRONMENT}"
  fi

  if [[ "${ENVIRONMENT}" == "internal-production" ]]; then
    check_var API_BASE_URL
    check_var SMOKE_USERNAME
    check_var SMOKE_PASSWORD
    check_var UPLOADS_DIR
    check_var BACKUP_ROOT

    if [[ -z "${DATABASE_URL:-}" ]]; then
      warn_line "DATABASE_URL not set in ops env; host-side backup/restore remains pending for later phases."
    else
      echo "[OK] env set: DATABASE_URL"
    fi
  else
    check_optional_var SMOKE_USERNAME
    check_optional_var SMOKE_PASSWORD
  fi
else
  warn_line "No dedicated ops env file found. Smoke/backup separation still depends on local operator setup."
fi

echo
if [[ "${FAILURES}" -gt 0 ]]; then
  echo "Preflight FAILED with ${FAILURES} issue(s) and ${WARNINGS} warning(s)"
  exit 1
fi

echo "Preflight PASSED with ${WARNINGS} warning(s)"
