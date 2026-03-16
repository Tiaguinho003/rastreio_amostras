#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-3000}"

detect_host() {
  if [[ -n "${DEV_LAN_HOSTS:-}" ]]; then
    printf '%s\n' "${DEV_LAN_HOSTS}" | tr ', ' '\n\n' | sed '/^$/d' | head -n 1
    return 0
  fi

  if command -v ip >/dev/null 2>&1; then
    ip -o -4 addr show scope global 2>/dev/null | awk '{split($4, parts, "/"); print parts[1]}' | grep -v '^169\.254\.' | head -n 1
    return 0
  fi

  if command -v hostname >/dev/null 2>&1; then
    hostname -I 2>/dev/null | tr ' ' '\n' | sed '/^$/d' | grep -v '^169\.254\.' | head -n 1
  fi
}

LAN_HOST="$(detect_host || true)"

printf 'Computador: https://localhost:%s/dev/camera\n' "${PORT}"
if [[ -n "${LAN_HOST}" ]]; then
  printf 'Celular:    https://%s:%s/dev/camera\n' "${LAN_HOST}" "${PORT}"
else
  echo "Nao foi possivel detectar o IP local. Defina DEV_LAN_HOSTS=\"192.168.x.x\" e rode novamente."
fi
