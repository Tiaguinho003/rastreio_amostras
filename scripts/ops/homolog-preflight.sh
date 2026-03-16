#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ENV_FILE:-${PROJECT_DIR}/.env.homolog}"
FAILURES=0

check_cmd() {
  local bin="$1"
  if command -v "${bin}" >/dev/null 2>&1; then
    echo "[OK] command found: ${bin}"
  else
    echo "[FAIL] command missing: ${bin}"
    FAILURES=$((FAILURES + 1))
  fi
}

read_env_key() {
  local key="$1"
  local file="$2"
  if [[ ! -f "${file}" ]]; then
    return
  fi

  local line
  line="$(grep -E "^${key}=" "${file}" | tail -n 1 || true)"
  if [[ -z "${line}" ]]; then
    return
  fi

  local value="${line#*=}"
  value="${value%\"}"
  value="${value#\"}"
  printf "%s" "${value}"
}

check_var() {
  local key="$1"
  local value="${!key:-}"
  if [[ -z "${value}" ]]; then
    value="$(read_env_key "${key}" "${ENV_FILE}")"
  fi

  if [[ -n "${value}" ]]; then
    export "${key}=${value}"
    echo "[OK] env set: ${key}"
  else
    echo "[FAIL] env missing: ${key}"
    FAILURES=$((FAILURES + 1))
  fi
}

echo "=== Homolog Preflight ==="
echo "Project dir: ${PROJECT_DIR}"
echo "Env file: ${ENV_FILE}"

check_cmd docker
check_cmd curl
check_cmd node
check_cmd sha256sum
check_cmd pg_dump
check_cmd psql

echo
echo "=== Required Environment Variables ==="
check_var DATABASE_URL
check_var AUTH_SECRET
check_var UPLOADS_DIR
check_var BACKUP_ROOT
check_var API_BASE_URL
check_var SMOKE_USERNAME
check_var SMOKE_PASSWORD
check_var BOOTSTRAP_ADMIN_FULL_NAME
check_var BOOTSTRAP_ADMIN_USERNAME
check_var BOOTSTRAP_ADMIN_EMAIL
check_var BOOTSTRAP_ADMIN_PASSWORD
check_var EMAIL_TRANSPORT

case "${EMAIL_TRANSPORT:-}" in
  smtp)
    check_var SMTP_HOST
    check_var SMTP_PORT
    check_var SMTP_FROM
    ;;
  outbox)
    echo "[OK] EMAIL_TRANSPORT uses local outbox"
    ;;
  "")
    ;;
  *)
    echo "[FAIL] EMAIL_TRANSPORT must be smtp or outbox"
    FAILURES=$((FAILURES + 1))
    ;;
esac

echo
echo "=== Safety Checks ==="
if [[ -n "${DATABASE_URL:-}" ]]; then
  if [[ "${ALLOW_NON_HOMOLOG_DATABASE:-false}" != "true" && "${DATABASE_URL}" != *homolog* ]]; then
    echo "[FAIL] DATABASE_URL does not contain 'homolog'"
    echo "       Set ALLOW_NON_HOMOLOG_DATABASE=true only for intentional override."
    FAILURES=$((FAILURES + 1))
  else
    echo "[OK] DATABASE_URL safety check"
  fi
fi

if [[ -n "${UPLOADS_DIR:-}" ]]; then
  if [[ "${UPLOADS_DIR}" = "/" ]]; then
    echo "[FAIL] UPLOADS_DIR cannot be /"
    FAILURES=$((FAILURES + 1))
  else
    echo "[OK] UPLOADS_DIR value check"
  fi
fi

if [[ -n "${BACKUP_ROOT:-}" ]]; then
  if [[ "${BACKUP_ROOT}" = "/" ]]; then
    echo "[FAIL] BACKUP_ROOT cannot be /"
    FAILURES=$((FAILURES + 1))
  else
    echo "[OK] BACKUP_ROOT value check"
  fi
fi

echo
echo "=== Compose Validation ==="
if command -v docker >/dev/null 2>&1; then
  if docker compose -f "${PROJECT_DIR}/docker-compose.prod.yml" config >/dev/null 2>&1; then
    echo "[OK] docker compose config (prod) is valid"
  else
    echo "[WARN] docker compose config check failed (verify env and docker permissions)"
  fi
fi

echo
if [[ "${FAILURES}" -gt 0 ]]; then
  echo "Preflight FAILED with ${FAILURES} issue(s)"
  exit 1
fi

echo "Preflight PASSED"
