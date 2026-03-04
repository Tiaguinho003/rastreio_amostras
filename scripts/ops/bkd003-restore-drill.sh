#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

if [[ "${DRILL_CONFIRM:-}" != "yes" ]]; then
  echo "This drill performs destructive restore operations." >&2
  echo "Re-run with DRILL_CONFIRM=yes" >&2
  exit 1
fi

required_cmds=("curl" "node" "sha256sum")
for cmd in "${required_cmds[@]}"; do
  if ! command -v "${cmd}" >/dev/null 2>&1; then
    echo "Required command not found: ${cmd}" >&2
    exit 1
  fi
done

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi

if [[ "${ALLOW_NON_HOMOLOG_DATABASE:-false}" != "true" ]] && [[ "${DATABASE_URL}" != *homolog* ]]; then
  echo "Refusing to run because DATABASE_URL does not contain 'homolog'." >&2
  echo "Set ALLOW_NON_HOMOLOG_DATABASE=true only if this is intentional." >&2
  exit 1
fi

API_BASE_URL="${API_BASE_URL:-http://localhost:3001}"
SMOKE_USERNAME="${SMOKE_USERNAME:-}"
SMOKE_PASSWORD="${SMOKE_PASSWORD:-}"
UPLOADS_DIR="${UPLOADS_DIR:-/srv/rastreio/homolog/uploads}"
BACKUP_ROOT="${BACKUP_ROOT:-/srv/rastreio/homolog/backups}"
EVIDENCE_DIR="${EVIDENCE_DIR:-${PROJECT_DIR}/docs/evidence}"

if [[ -z "${SMOKE_USERNAME}" || -z "${SMOKE_PASSWORD}" ]]; then
  echo "SMOKE_USERNAME and SMOKE_PASSWORD are required" >&2
  exit 1
fi

mkdir -p "${UPLOADS_DIR}/sentinel" "${BACKUP_ROOT}" "${EVIDENCE_DIR}"

DRILL_TS="$(date +%Y%m%d-%H%M%S)"
START_EPOCH="$(date +%s)"
REQUEST_ID="bkd003-${DRILL_TS}"
TMP_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "${TMP_DIR}"
}
trap cleanup EXIT

LOGIN_PAYLOAD="${TMP_DIR}/login.json"
LOGIN_STATUS="$(
  curl -sS -o "${LOGIN_PAYLOAD}" -w '%{http_code}' \
    -H 'Content-Type: application/json' \
    -H "x-request-id: ${REQUEST_ID}-login" \
    -X POST "${API_BASE_URL}/api/v1/auth/login" \
    -d "{\"username\":\"${SMOKE_USERNAME}\",\"password\":\"${SMOKE_PASSWORD}\"}"
)"

if [[ "${LOGIN_STATUS}" != "200" ]]; then
  echo "Login failed with status ${LOGIN_STATUS}" >&2
  cat "${LOGIN_PAYLOAD}" >&2 || true
  exit 1
fi

ACCESS_TOKEN="$(node -e "const fs=require('node:fs');const j=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));if(typeof j.accessToken!=='string'){process.exit(1);}process.stdout.write(j.accessToken);" "${LOGIN_PAYLOAD}")"

BASELINE_SAMPLE_ID="${BASELINE_SAMPLE_ID:-$(node -e "process.stdout.write(require('node:crypto').randomUUID())")}"
MUTATED_SAMPLE_ID="${MUTATED_SAMPLE_ID:-$(node -e "process.stdout.write(require('node:crypto').randomUUID())")}"

BASELINE_CREATE_PAYLOAD="${TMP_DIR}/baseline-create.json"
BASELINE_CREATE_STATUS="$(
  curl -sS -o "${BASELINE_CREATE_PAYLOAD}" -w '%{http_code}' \
    -H "Authorization: Bearer ${ACCESS_TOKEN}" \
    -H 'Content-Type: application/json' \
    -H "x-request-id: ${REQUEST_ID}-baseline-create" \
    -X POST "${API_BASE_URL}/api/v1/samples/receive" \
    -d "{\"sampleId\":\"${BASELINE_SAMPLE_ID}\",\"receivedChannel\":\"in_person\",\"notes\":\"BKD003 baseline\"}"
)"

if [[ "${BASELINE_CREATE_STATUS}" != "201" ]]; then
  echo "Baseline sample creation failed with status ${BASELINE_CREATE_STATUS}" >&2
  cat "${BASELINE_CREATE_PAYLOAD}" >&2 || true
  exit 1
fi

BASELINE_SENTINEL_FILE="${UPLOADS_DIR}/sentinel/bkd003.txt"
echo "BKD003-BASELINE-${DRILL_TS}" > "${BASELINE_SENTINEL_FILE}"
sha256sum "${BASELINE_SENTINEL_FILE}" > "${TMP_DIR}/baseline-upload.sha256"

BACKUP_TIER=daily "${SCRIPT_DIR}/backup-db.sh"
BACKUP_TIER=daily "${SCRIPT_DIR}/backup-uploads.sh"

DB_BACKUP_FILE="$(ls -1t "${BACKUP_ROOT}/daily/db/"*.sql.gz 2>/dev/null | head -n 1 || true)"
UPLOADS_BACKUP_FILE="$(ls -1t "${BACKUP_ROOT}/daily/uploads/"*.tar.gz 2>/dev/null | head -n 1 || true)"

if [[ -z "${DB_BACKUP_FILE}" || -z "${UPLOADS_BACKUP_FILE}" ]]; then
  echo "Failed to locate generated backup files under ${BACKUP_ROOT}/daily" >&2
  exit 1
fi

sha256sum -c "${DB_BACKUP_FILE}.sha256"
sha256sum -c "${UPLOADS_BACKUP_FILE}.sha256"

MUTATED_CREATE_PAYLOAD="${TMP_DIR}/mutated-create.json"
MUTATED_CREATE_STATUS="$(
  curl -sS -o "${MUTATED_CREATE_PAYLOAD}" -w '%{http_code}' \
    -H "Authorization: Bearer ${ACCESS_TOKEN}" \
    -H 'Content-Type: application/json' \
    -H "x-request-id: ${REQUEST_ID}-mutated-create" \
    -X POST "${API_BASE_URL}/api/v1/samples/receive" \
    -d "{\"sampleId\":\"${MUTATED_SAMPLE_ID}\",\"receivedChannel\":\"in_person\",\"notes\":\"BKD003 mutation\"}"
)"

if [[ "${MUTATED_CREATE_STATUS}" != "201" ]]; then
  echo "Mutated sample creation failed with status ${MUTATED_CREATE_STATUS}" >&2
  cat "${MUTATED_CREATE_PAYLOAD}" >&2 || true
  exit 1
fi

AFTER_BACKUP_FILE="${UPLOADS_DIR}/sentinel/after-backup.txt"
echo "MUTATION-${DRILL_TS}" > "${AFTER_BACKUP_FILE}"

CONFIRM_RESTORE=yes "${SCRIPT_DIR}/restore-db.sh" "${DB_BACKUP_FILE}"
CONFIRM_RESTORE=yes "${SCRIPT_DIR}/restore-uploads.sh" "${UPLOADS_BACKUP_FILE}"

API_BASE_URL="${API_BASE_URL}" SMOKE_USERNAME="${SMOKE_USERNAME}" SMOKE_PASSWORD="${SMOKE_PASSWORD}" "${SCRIPT_DIR}/smoke-test.sh"

BASELINE_DETAIL_PAYLOAD="${TMP_DIR}/baseline-detail.json"
BASELINE_DETAIL_STATUS="$(
  curl -sS -o "${BASELINE_DETAIL_PAYLOAD}" -w '%{http_code}' \
    -H "Authorization: Bearer ${ACCESS_TOKEN}" \
    -H "x-request-id: ${REQUEST_ID}-baseline-detail" \
    "${API_BASE_URL}/api/v1/samples/${BASELINE_SAMPLE_ID}"
)"

if [[ "${BASELINE_DETAIL_STATUS}" != "200" ]]; then
  echo "Baseline sample not found after restore (status ${BASELINE_DETAIL_STATUS})" >&2
  cat "${BASELINE_DETAIL_PAYLOAD}" >&2 || true
  exit 1
fi

MUTATED_DETAIL_PAYLOAD="${TMP_DIR}/mutated-detail.json"
MUTATED_DETAIL_STATUS="$(
  curl -sS -o "${MUTATED_DETAIL_PAYLOAD}" -w '%{http_code}' \
    -H "Authorization: Bearer ${ACCESS_TOKEN}" \
    -H "x-request-id: ${REQUEST_ID}-mutated-detail" \
    "${API_BASE_URL}/api/v1/samples/${MUTATED_SAMPLE_ID}"
)"

if [[ "${MUTATED_DETAIL_STATUS}" == "200" ]]; then
  echo "Mutated sample still exists after restore; expected rollback to pre-backup state" >&2
  cat "${MUTATED_DETAIL_PAYLOAD}" >&2 || true
  exit 1
fi

sha256sum "${BASELINE_SENTINEL_FILE}" > "${TMP_DIR}/baseline-upload-post.sha256"
if ! diff -q "${TMP_DIR}/baseline-upload.sha256" "${TMP_DIR}/baseline-upload-post.sha256" >/dev/null 2>&1; then
  echo "Baseline upload checksum mismatch after restore" >&2
  exit 1
fi

if [[ -f "${AFTER_BACKUP_FILE}" ]]; then
  echo "Mutation upload file still exists after restore: ${AFTER_BACKUP_FILE}" >&2
  exit 1
fi

END_EPOCH="$(date +%s)"
DURATION_SEC="$((END_EPOCH - START_EPOCH))"
EVIDENCE_FILE="${EVIDENCE_DIR}/BKD-003-restore-homolog-${DRILL_TS}.md"

cat > "${EVIDENCE_FILE}" <<EOF
# BKD-003 Restore Drill Evidence

- Timestamp: ${DRILL_TS}
- API Base URL: ${API_BASE_URL}
- DATABASE_URL target: $(printf "%s" "${DATABASE_URL}" | sed 's/:[^:@/]*@/:***@/')
- Uploads dir: ${UPLOADS_DIR}
- Backup root: ${BACKUP_ROOT}
- Baseline sample ID: ${BASELINE_SAMPLE_ID}
- Mutated sample ID: ${MUTATED_SAMPLE_ID}
- DB backup file: ${DB_BACKUP_FILE}
- Uploads backup file: ${UPLOADS_BACKUP_FILE}
- Mutated detail status after restore: ${MUTATED_DETAIL_STATUS}
- Duration (seconds): ${DURATION_SEC}
- Result: SUCCESS
EOF

echo "BKD-003 drill completed successfully"
echo "Evidence file: ${EVIDENCE_FILE}"
