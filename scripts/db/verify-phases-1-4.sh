#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DATABASE_URL="${DATABASE_URL:-}"

REQUIRED_MIGRATIONS=(
  "20260319110000_add_clients_and_sample_movements"
  "20260319111000_add_client_search_trigram_indexes"
  "20260319153000_add_sample_movement_events_and_indexes"
)

REQUIRED_TABLES=(
  "client"
  "client_registration"
  "client_audit_event"
  "sample_movement"
)

REQUIRED_SAMPLE_COLUMNS=(
  "owner_client_id"
  "owner_registration_id"
  "sold_sacks"
  "lost_sacks"
)

REQUIRED_SAMPLE_EVENT_TYPES=(
  "SALE_CREATED"
  "SALE_UPDATED"
  "SALE_CANCELLED"
  "LOSS_RECORDED"
  "LOSS_UPDATED"
  "LOSS_CANCELLED"
)

log_section() {
  echo
  echo "=== $1 ==="
}

require_command() {
  local bin="$1"
  if command -v "${bin}" >/dev/null 2>&1; then
    echo "[OK] command found: ${bin}"
  else
    echo "[FAIL] command missing: ${bin}" >&2
    exit 1
  fi
}

require_env() {
  local name="$1"
  local value="${!name:-}"
  if [[ -z "${value}" ]]; then
    echo "[FAIL] env missing: ${name}" >&2
    exit 1
  fi
  echo "[OK] env set: ${name}"
}

run_step() {
  local label="$1"
  shift

  echo "[RUN] ${label}"
  "$@"
  echo "[OK] ${label}"
}

sql_scalar() {
  local sql="$1"
  psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 -At -c "${sql}"
}

assert_no_missing_list() {
  local label="$1"
  local missing="$2"
  if [[ -n "${missing}" ]]; then
    echo "[FAIL] ${label}: ${missing}" >&2
    exit 1
  fi
  echo "[OK] ${label}"
}

build_values_sql() {
  local values=("$@")
  local first=true
  local sql=""

  for value in "${values[@]}"; do
    if [[ "${first}" == true ]]; then
      sql="('${value}')"
      first=false
    else
      sql="${sql}, ('${value}')"
    fi
  done

  printf "%s" "${sql}"
}

cd "${PROJECT_DIR}"

log_section "Preflight"
require_command node
require_command npm
require_command psql
require_env DATABASE_URL

log_section "Validation Sequence"
run_step "prisma generate" npm run prisma:generate
run_step "prisma migrate deploy" npm run prisma:migrate:deploy
run_step "typecheck" npm run typecheck
run_step "validate schemas" npm run validate:schemas
run_step "test contracts" npm run test:contracts
run_step "test unit" npm run test:unit
run_step "test integration db" npm run test:integration:db
run_step "build" npm run build

log_section "Database Sanity"

missing_tables="$(sql_scalar "
  SELECT COALESCE(string_agg(required.table_name, ', '), '')
  FROM (
    VALUES $(build_values_sql "${REQUIRED_TABLES[@]}")
  ) AS required(table_name)
  LEFT JOIN information_schema.tables t
    ON t.table_schema = 'public'
   AND t.table_name = required.table_name
  WHERE t.table_name IS NULL;
")"
assert_no_missing_list "required tables present" "${missing_tables}"

missing_columns="$(sql_scalar "
  SELECT COALESCE(string_agg(required.column_name, ', '), '')
  FROM (
    VALUES $(build_values_sql "${REQUIRED_SAMPLE_COLUMNS[@]}")
  ) AS required(column_name)
  LEFT JOIN information_schema.columns c
    ON c.table_schema = 'public'
   AND c.table_name = 'sample'
   AND c.column_name = required.column_name
  WHERE c.column_name IS NULL;
")"
assert_no_missing_list "sample columns present" "${missing_columns}"

missing_migrations="$(sql_scalar "
  SELECT COALESCE(string_agg(required.migration_name, ', '), '')
  FROM (
    VALUES $(build_values_sql "${REQUIRED_MIGRATIONS[@]}")
  ) AS required(migration_name)
  LEFT JOIN \"_prisma_migrations\" pm
    ON pm.migration_name = required.migration_name
  WHERE pm.migration_name IS NULL;
")"
assert_no_missing_list "required migrations applied" "${missing_migrations}"

missing_commercial_status="$(sql_scalar "
  SELECT COALESCE(string_agg(required.enum_label, ', '), '')
  FROM (
    VALUES ('PARTIALLY_SOLD')
  ) AS required(enum_label)
  LEFT JOIN (
    SELECT e.enumlabel
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'CommercialStatus'
  ) actual
    ON actual.enumlabel = required.enum_label
  WHERE actual.enumlabel IS NULL;
")"
assert_no_missing_list "CommercialStatus enum values present" "${missing_commercial_status}"

missing_sample_event_types="$(sql_scalar "
  SELECT COALESCE(string_agg(required.enum_label, ', '), '')
  FROM (
    VALUES $(build_values_sql "${REQUIRED_SAMPLE_EVENT_TYPES[@]}")
  ) AS required(enum_label)
  LEFT JOIN (
    SELECT e.enumlabel
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'SampleEventType'
  ) actual
    ON actual.enumlabel = required.enum_label
  WHERE actual.enumlabel IS NULL;
")"
assert_no_missing_list "SampleEventType enum values present" "${missing_sample_event_types}"

log_section "Completed"
echo "Verification phases 1-4 PASSED"
