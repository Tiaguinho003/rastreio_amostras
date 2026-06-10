#!/usr/bin/env bash
set -euo pipefail

# Setup ONE-TIME do agendamento do digest diario de push (08:00 America/
# Sao_Paulo, todos os dias). Idempotente: re-rodar atualiza o scheduler em
# vez de falhar. Pre-requisito: job ${GCLOUD_CLOUD_RUN_PUSH_DIGEST_JOB} ja
# deployado (deploy-cloud.sh) e GCLOUD_SERVICE_ACCOUNT com permissao de
# invocar Cloud Run jobs (roles/run.invoker, concedida abaixo).
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

SCHEDULER_JOB_NAME="${GCLOUD_CLOUD_RUN_PUSH_DIGEST_JOB}-daily"
SCHEDULE="${PUSH_DIGEST_SCHEDULE:-0 8 * * *}"
TIME_ZONE="America/Sao_Paulo"
RUN_JOB_URI="https://${GCLOUD_REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${GCLOUD_PROJECT_ID}/jobs/${GCLOUD_CLOUD_RUN_PUSH_DIGEST_JOB}:run"

echo "[gcp] habilitando Cloud Scheduler API (no-op se ja ativa)"
gcloud services enable cloudscheduler.googleapis.com --project "${GCLOUD_PROJECT_ID}"

echo "[gcp] concedendo run.invoker ao service account no job de digest"
gcloud run jobs add-iam-policy-binding "${GCLOUD_CLOUD_RUN_PUSH_DIGEST_JOB}" \
  --project "${GCLOUD_PROJECT_ID}" \
  --region "${GCLOUD_REGION}" \
  --member "serviceAccount:${GCLOUD_SERVICE_ACCOUNT}" \
  --role roles/run.invoker

SCHEDULER_ARGS=(
  --project "${GCLOUD_PROJECT_ID}"
  --location "${GCLOUD_REGION}"
  --schedule "${SCHEDULE}"
  --time-zone "${TIME_ZONE}"
  --http-method POST
  --uri "${RUN_JOB_URI}"
  --oauth-service-account-email "${GCLOUD_SERVICE_ACCOUNT}"
)

if gcloud scheduler jobs describe "${SCHEDULER_JOB_NAME}" \
  --project "${GCLOUD_PROJECT_ID}" --location "${GCLOUD_REGION}" >/dev/null 2>&1; then
  echo "[gcp] scheduler ja existe — atualizando ${SCHEDULER_JOB_NAME}"
  gcloud scheduler jobs update http "${SCHEDULER_JOB_NAME}" "${SCHEDULER_ARGS[@]}"
else
  echo "[gcp] criando scheduler ${SCHEDULER_JOB_NAME}"
  gcloud scheduler jobs create http "${SCHEDULER_JOB_NAME}" "${SCHEDULER_ARGS[@]}"
fi

echo "[gcp] ============================================================"
echo "[gcp]  Digest diario agendado: '${SCHEDULE}' (${TIME_ZONE})"
echo "[gcp]  Scheduler: ${SCHEDULER_JOB_NAME} -> job ${GCLOUD_CLOUD_RUN_PUSH_DIGEST_JOB}"
echo "[gcp]  Teste manual: scripts/gcp/execute-job.sh push-digest ${CLOUD_ENV}"
echo "[gcp] ============================================================"
