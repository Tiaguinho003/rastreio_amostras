#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/_lib.sh"

REGION="${REGION:-southamerica-east1}"
HML_CONFIG="${HML_CONFIG:-default}"
PROD_CONFIG="${PROD_CONFIG:-empresa}"
HML_SERVICE="${HML_SERVICE:-rastreio-hml-app}"
PROD_SERVICE="${PROD_SERVICE:-rastreio-prod-app}"

describe_field() {
  local config="$1" service="$2" field="$3"
  gcloud --configuration="${config}" run services describe "${service}" \
    --region="${REGION}" \
    --format="value(${field})" 2>/dev/null \
    || echo "ERROR"
}

HML_IMAGE="$(describe_field "${HML_CONFIG}" "${HML_SERVICE}" 'spec.template.spec.containers[0].image')"
PROD_IMAGE="$(describe_field "${PROD_CONFIG}" "${PROD_SERVICE}" 'spec.template.spec.containers[0].image')"
HML_REVISION="$(describe_field "${HML_CONFIG}" "${HML_SERVICE}" 'status.traffic[0].revisionName')"
PROD_REVISION="$(describe_field "${PROD_CONFIG}" "${PROD_SERVICE}" 'status.traffic[0].revisionName')"
HML_LATEST="$(describe_field "${HML_CONFIG}" "${HML_SERVICE}" 'spec.traffic[0].latestRevision')"
PROD_LATEST="$(describe_field "${PROD_CONFIG}" "${PROD_SERVICE}" 'spec.traffic[0].latestRevision')"

# Extrai a tag (depois do :)
HML_TAG="${HML_IMAGE##*:}"
PROD_TAG="${PROD_IMAGE##*:}"

echo "================================================================"
echo "  PARITY CHECK -- homolog vs producao"
echo "================================================================"
echo
printf "  %-15s %s\n" "HML  config:"  "${HML_CONFIG} (${HML_SERVICE})"
printf "  %-15s %s\n" "PROD config:"  "${PROD_CONFIG} (${PROD_SERVICE})"
echo
printf "  %-15s %s\n" "HML  tag:"     "${HML_TAG}"
printf "  %-15s %s\n" "PROD tag:"     "${PROD_TAG}"
echo
printf "  %-15s %s (latestRevision=%s)\n" "HML  revision:" "${HML_REVISION}"  "${HML_LATEST}"
printf "  %-15s %s (latestRevision=%s)\n" "PROD revision:" "${PROD_REVISION}" "${PROD_LATEST}"
echo

exit_code=0

if [[ "${HML_TAG}" == "ERROR" || "${PROD_TAG}" == "ERROR" ]]; then
  echo "  ! ERRO ao consultar gcloud (auth expirada? config errada? region?)"
  exit 2
fi

if [[ "${HML_TAG}" == "${PROD_TAG}" ]]; then
  echo "  OK MESMA VERSAO (${HML_TAG})"
else
  echo "  X DIVERGENCIA"
  echo
  echo "  Possiveis causas:"
  echo "    - Deploy de prod ainda nao foi feito a partir desse SHA"
  echo "    - Trafego pinned em revision antiga"
  echo "      Checar: gcloud --configuration=<conf> run services describe <svc> \\"
  echo "              --region=${REGION} --format='yaml(spec.traffic)'"
  echo "      Fix:    gcloud --configuration=<conf> run services update-traffic <svc> \\"
  echo "              --region=${REGION} --to-latest"
  exit_code=1
fi

# Avisar se trafego nao esta em latestRevision (pinning)
if [[ "${HML_LATEST}" != "True" ]]; then
  echo
  echo "  ! HML nao esta em latestRevision (trafego pinado em ${HML_REVISION})"
  echo "    Fix: gcloud --configuration=${HML_CONFIG} run services update-traffic ${HML_SERVICE} \\"
  echo "         --region=${REGION} --to-latest"
  exit_code=1
fi
if [[ "${PROD_LATEST}" != "True" ]]; then
  echo
  echo "  ! PROD nao esta em latestRevision (trafego pinado em ${PROD_REVISION})"
  echo "    Fix: gcloud --configuration=${PROD_CONFIG} run services update-traffic ${PROD_SERVICE} \\"
  echo "         --region=${REGION} --to-latest"
  exit_code=1
fi

exit "${exit_code}"
