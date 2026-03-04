#!/usr/bin/env bash
set -euo pipefail

API_BASE_URL="${API_BASE_URL:-http://localhost:3000}"
SMOKE_USERNAME="${SMOKE_USERNAME:-}"
SMOKE_PASSWORD="${SMOKE_PASSWORD:-}"

if [[ -z "${SMOKE_USERNAME}" || -z "${SMOKE_PASSWORD}" ]]; then
  echo "SMOKE_USERNAME and SMOKE_PASSWORD are required" >&2
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "curl command not found" >&2
  exit 1
fi

HEALTH_CODE="$(curl -sS -o /tmp/rastreio-health.json -w '%{http_code}' "${API_BASE_URL}/api/health")"
if [[ "${HEALTH_CODE}" != "200" ]]; then
  echo "Healthcheck failed (${HEALTH_CODE})" >&2
  cat /tmp/rastreio-health.json >&2 || true
  exit 1
fi

LOGIN_CODE="$(
  curl -sS -o /tmp/rastreio-login.json -w '%{http_code}' \
    -H 'Content-Type: application/json' \
    -X POST "${API_BASE_URL}/api/v1/auth/login" \
    -d "{\"username\":\"${SMOKE_USERNAME}\",\"password\":\"${SMOKE_PASSWORD}\"}"
)"

if [[ "${LOGIN_CODE}" != "200" ]]; then
  echo "Login failed (${LOGIN_CODE})" >&2
  cat /tmp/rastreio-login.json >&2 || true
  exit 1
fi

ACCESS_TOKEN="$(
  node -e "const fs=require('node:fs');const body=JSON.parse(fs.readFileSync('/tmp/rastreio-login.json','utf8'));if(!body.accessToken){process.exit(1);}process.stdout.write(body.accessToken);"
)"

SAMPLES_CODE="$(
  curl -sS -o /tmp/rastreio-samples.json -w '%{http_code}' \
    -H "Authorization: Bearer ${ACCESS_TOKEN}" \
    "${API_BASE_URL}/api/v1/samples?limit=1"
)"

if [[ "${SAMPLES_CODE}" != "200" ]]; then
  echo "Samples list failed (${SAMPLES_CODE})" >&2
  cat /tmp/rastreio-samples.json >&2 || true
  exit 1
fi

echo "Smoke test succeeded"
