#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CERT_FILE="${ROOT_DIR}/.certs/mobile-cert.pem"
KEY_FILE="${ROOT_DIR}/.certs/mobile-key.pem"
NEXT_BIN="${ROOT_DIR}/node_modules/.bin/next"

if [[ ! -x "${NEXT_BIN}" ]]; then
  echo "Next.js nao encontrado. Rode npm install antes."
  exit 1
fi

if [[ ! -f "${CERT_FILE}" || ! -f "${KEY_FILE}" ]]; then
  echo "Certificados nao encontrados. Gerando agora..."
  bash "${ROOT_DIR}/scripts/dev/generate-mobile-cert.sh" "${@}"
fi

echo "Subindo Next.js em HTTPS na rede local..."
echo "Rota de teste de camera: /dev/camera"

exec "${NEXT_BIN}" dev \
  -H 0.0.0.0 \
  -p "${PORT:-3000}" \
  --experimental-https \
  --experimental-https-key "${KEY_FILE}" \
  --experimental-https-cert "${CERT_FILE}"
