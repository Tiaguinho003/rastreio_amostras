#!/usr/bin/env bash
set -euo pipefail

OUTPUT_FILE="${1:-}"
if [[ -z "${OUTPUT_FILE}" ]]; then
  OUTPUT_FILE="/tmp/rastreio-server-facts-$(date +%Y%m%d-%H%M%S).txt"
fi

cmd_exists() {
  command -v "$1" >/dev/null 2>&1
}

run_or_na() {
  local bin="$1"
  shift || true
  if cmd_exists "${bin}"; then
    "${bin}" "$@" 2>&1 || true
  else
    echo "not-installed"
  fi
}

read_os_pretty_name() {
  if [[ -f /etc/os-release ]]; then
    grep -E '^PRETTY_NAME=' /etc/os-release | head -n 1 | cut -d= -f2- | tr -d '"' || true
  else
    echo "unknown"
  fi
}

read_timezone() {
  if cmd_exists timedatectl; then
    timedatectl show -p Timezone --value 2>/dev/null || true
    return
  fi

  if [[ -f /etc/timezone ]]; then
    cat /etc/timezone
    return
  fi

  echo "unknown"
}

read_cpu_summary() {
  if cmd_exists lscpu; then
    lscpu | grep -E 'Model name|CPU\(s\):|Thread\(s\) per core|Core\(s\) per socket|Socket\(s\)' || true
    return
  fi

  if [[ -f /proc/cpuinfo ]]; then
    local model
    model="$(grep -m1 'model name' /proc/cpuinfo | cut -d: -f2- | xargs)"
    local cpus
    cpus="$(grep -c '^processor' /proc/cpuinfo)"
    echo "Model name: ${model:-unknown}"
    echo "CPU(s): ${cpus:-unknown}"
    return
  fi

  echo "unknown"
}

cat > "${OUTPUT_FILE}" <<EOF
# Rastreio - Server Facts

Timestamp: $(date -Is)
Hostname: $(hostname 2>/dev/null || echo unknown)
Current user: $(whoami 2>/dev/null || echo unknown)

## System

OS: $(read_os_pretty_name)
Kernel: $(uname -r 2>/dev/null || echo unknown)
Architecture: $(uname -m 2>/dev/null || echo unknown)
Timezone: $(read_timezone)
Uptime: $(run_or_na uptime)

## CPU

$(read_cpu_summary)

## Memory

$(run_or_na free -h)

## Disk

$(run_or_na df -h /)

## Network

Host IPs: $(hostname -I 2>/dev/null || echo unknown)

## Runtime Tools

Docker version: $(run_or_na docker --version)
Docker Compose version: $(run_or_na docker compose version)
Node version: $(run_or_na node --version)
npm version: $(run_or_na npm --version)
psql version: $(run_or_na psql --version)
pg_dump version: $(run_or_na pg_dump --version)

## Docker Service

docker info:
$(run_or_na docker info)

EOF

echo "Server facts written to: ${OUTPUT_FILE}"
