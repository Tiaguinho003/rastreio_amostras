#!/usr/bin/env bash
set -euo pipefail

# Setup dos agendamentos dos lembretes diarios via Web Push. Idempotente:
# re-rodar atualiza os schedulers. Cria QUATRO agendamentos, todos
# disparando o MESMO job Cloud Run ${GCLOUD_CLOUD_RUN_PUSH_DIGEST_JOB} com
# override de args (--kind), via API v2 do Cloud Run:
#
#   *-classification  0 8 * * *     (todos os dias 08:00)  --kind=classification
#   *-registrations   0 8 * * 1-5   (seg-sex 08:00)         --kind=registrations
#   *-prospect        0 11 * * 1-5  (seg-sex 11:00)         --kind=prospect-reminder
#   *-weekly          0 8-20 * * *  (hora em hora 08-20)    --kind=weekly-reminder
#     (o kind avalia as regras por usuario e o marcador semanal garante no
#      maximo 1 push por usuario por semana — execucoes extras sao no-op;
#      a janela 08-20 evita lembrete de madrugada e cobre a sexta 17:00)
#
# Remove o scheduler legado *-daily (formato antigo sem kind), se existir.
#
# Pre-requisito: job deployado (deploy-cloud.sh) e GCLOUD_SERVICE_ACCOUNT
# com roles/run.invoker no job (concedido abaixo).
#
# Uso: scripts/gcp/setup-push-digest-scheduler.sh <cloud-env>

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/_lib.sh"

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <cloud-env>" >&2
  exit 1
fi
CLOUD_ENV="$1"
load_cloud_context "${CLOUD_ENV}"

if [[ -z "${GCLOUD_CLOUD_RUN_PUSH_DIGEST_JOB:-}" ]]; then
  echo "[gcp] ERRO: GCLOUD_CLOUD_RUN_PUSH_DIGEST_JOB nao definido no ops env." >&2
  exit 1
fi

TIME_ZONE="America/Sao_Paulo"
RUN_JOB_URI="https://run.googleapis.com/v2/projects/${GCLOUD_PROJECT_ID}/locations/${GCLOUD_REGION}/jobs/${GCLOUD_CLOUD_RUN_PUSH_DIGEST_JOB}:run"

echo "[gcp] habilitando Cloud Scheduler API (no-op se ja ativa)"
gcloud services enable cloudscheduler.googleapis.com --project "${GCLOUD_PROJECT_ID}"

# Os schedulers executam o job COM containerOverrides (--kind por agenda),
# e isso exige `run.jobs.runWithOverrides` — que NAO esta no run.invoker
# (so execucao simples). run.developer cobre run + runWithOverrides,
# escopado a ESTE job. Sem ele o disparo agendado falha com 403
# PERMISSION_DENIED (aconteceu na primeira execucao real, 2026-06-11).
echo "[gcp] concedendo run.developer (run + runWithOverrides) ao SA no job de digest"
gcloud run jobs add-iam-policy-binding "${GCLOUD_CLOUD_RUN_PUSH_DIGEST_JOB}" \
  --project "${GCLOUD_PROJECT_ID}" \
  --region "${GCLOUD_REGION}" \
  --member "serviceAccount:${GCLOUD_SERVICE_ACCOUNT}" \
  --role roles/run.developer

upsert_scheduler() {
  local name="$1"
  local schedule="$2"
  local kind="$3"
  local body
  body="$(printf '{"overrides":{"containerOverrides":[{"args":["run","push:digest","--","--kind=%s"]}]}}' "${kind}")"

  # `--headers` so existe no CREATE; o UPDATE usa `--update-headers`
  # (descoberto na primeira atualizacao real, 2026-06-11 — ate entao so o
  # caminho create tinha rodado).
  local args=(
    --project "${GCLOUD_PROJECT_ID}"
    --location "${GCLOUD_REGION}"
    --schedule "${schedule}"
    --time-zone "${TIME_ZONE}"
    --http-method POST
    --uri "${RUN_JOB_URI}"
    --message-body "${body}"
    --oauth-service-account-email "${GCLOUD_SERVICE_ACCOUNT}"
  )

  if gcloud scheduler jobs describe "${name}" \
    --project "${GCLOUD_PROJECT_ID}" --location "${GCLOUD_REGION}" >/dev/null 2>&1; then
    echo "[gcp] atualizando scheduler ${name} ('${schedule}', kind=${kind})"
    gcloud scheduler jobs update http "${name}" "${args[@]}" \
      --update-headers "Content-Type=application/json" >/dev/null
  else
    echo "[gcp] criando scheduler ${name} ('${schedule}', kind=${kind})"
    gcloud scheduler jobs create http "${name}" "${args[@]}" \
      --headers "Content-Type=application/json" >/dev/null
  fi
}

upsert_scheduler "${GCLOUD_CLOUD_RUN_PUSH_DIGEST_JOB}-classification" "0 8 * * *" "classification"
upsert_scheduler "${GCLOUD_CLOUD_RUN_PUSH_DIGEST_JOB}-registrations" "0 8 * * 1-5" "registrations"
upsert_scheduler "${GCLOUD_CLOUD_RUN_PUSH_DIGEST_JOB}-prospect" "0 11 * * 1-5" "prospect-reminder"
upsert_scheduler "${GCLOUD_CLOUD_RUN_PUSH_DIGEST_JOB}-weekly" "0 8-20 * * *" "weekly-reminder"

# Scheduler legado (formato unico sem kind): remover se existir.
LEGACY_NAME="${GCLOUD_CLOUD_RUN_PUSH_DIGEST_JOB}-daily"
if gcloud scheduler jobs describe "${LEGACY_NAME}" \
  --project "${GCLOUD_PROJECT_ID}" --location "${GCLOUD_REGION}" >/dev/null 2>&1; then
  echo "[gcp] removendo scheduler legado ${LEGACY_NAME}"
  gcloud scheduler jobs delete "${LEGACY_NAME}" \
    --project "${GCLOUD_PROJECT_ID}" --location "${GCLOUD_REGION}" --quiet
fi

echo "[gcp] ============================================================"
echo "[gcp]  Lembretes agendados (${TIME_ZONE}):"
echo "[gcp]   classification: todos os dias 08:00"
echo "[gcp]   registrations:  seg-sex 08:00"
echo "[gcp]   prospect:       seg-sex 11:00"
echo "[gcp]   weekly:         hora em hora 08:00-20:00 (relatorio semanal)"
echo "[gcp]  Teste manual: scripts/gcp/execute-job.sh push-digest ${CLOUD_ENV} [--kind=X]"
echo "[gcp] ============================================================"
