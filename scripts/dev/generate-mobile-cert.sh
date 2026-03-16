#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CERT_DIR="${ROOT_DIR}/.certs"
CERT_FILE="${CERT_DIR}/mobile-cert.pem"
KEY_FILE="${CERT_DIR}/mobile-key.pem"
OPENSSL_CONFIG="${CERT_DIR}/openssl-mobile.cnf"

mkdir -p "${CERT_DIR}"

declare -a HOSTS
HOSTS=("localhost" "127.0.0.1" "::1")

normalize_hosts() {
  local raw_hosts="$1"
  if [[ -z "${raw_hosts}" ]]; then
    return 0
  fi

  while IFS= read -r value; do
    if [[ -n "${value}" ]]; then
      HOSTS+=("${value}")
    fi
  done < <(printf '%s' "${raw_hosts}" | tr ', ' '\n\n' | sed '/^$/d')
}

detect_ipv4_hosts() {
  if command -v ip >/dev/null 2>&1; then
    ip -o -4 addr show scope global 2>/dev/null | awk '{split($4, parts, "/"); print parts[1]}'
    return 0
  fi

  if command -v hostname >/dev/null 2>&1; then
    hostname -I 2>/dev/null | tr ' ' '\n'
  fi
}

if [[ "${#}" -gt 0 ]]; then
  normalize_hosts "$*"
elif [[ -n "${DEV_LAN_HOSTS:-}" ]]; then
  normalize_hosts "${DEV_LAN_HOSTS}"
else
  while IFS= read -r detected_host; do
    case "${detected_host}" in
      "" | 127.* | 169.254.*)
        continue
        ;;
      *)
        HOSTS+=("${detected_host}")
        ;;
    esac
  done < <(detect_ipv4_hosts)
fi

declare -A SEEN
declare -a UNIQUE_HOSTS
for host in "${HOSTS[@]}"; do
  if [[ -n "${host}" && -z "${SEEN[${host}]:-}" ]]; then
    SEEN["${host}"]=1
    UNIQUE_HOSTS+=("${host}")
  fi
done

HOSTS=("${UNIQUE_HOSTS[@]}")

printf 'Gerando certificado para os hosts:\n'
for host in "${HOSTS[@]}"; do
  printf '  - %s\n' "${host}"
done

if command -v mkcert >/dev/null 2>&1; then
  mkcert -install
  mkcert -cert-file "${CERT_FILE}" -key-file "${KEY_FILE}" "${HOSTS[@]}"
  printf '\nCertificado gerado com mkcert em %s\n' "${CERT_DIR}"
  printf 'Para confiar no celular, exporte a CA local com: mkcert -CAROOT\n'
  exit 0
fi

cat > "${OPENSSL_CONFIG}" <<EOF
[req]
default_bits = 2048
prompt = no
default_md = sha256
distinguished_name = dn
x509_extensions = v3_req

[dn]
CN = rastreio-mobile-local

[v3_req]
subjectAltName = @alt_names
extendedKeyUsage = serverAuth
keyUsage = digitalSignature, keyEncipherment

[alt_names]
EOF

dns_index=1
ip_index=1
for host in "${HOSTS[@]}"; do
  if [[ "${host}" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ || "${host}" == *:* ]]; then
    printf 'IP.%s = %s\n' "${ip_index}" "${host}" >> "${OPENSSL_CONFIG}"
    ip_index=$((ip_index + 1))
  else
    printf 'DNS.%s = %s\n' "${dns_index}" "${host}" >> "${OPENSSL_CONFIG}"
    dns_index=$((dns_index + 1))
  fi
done

openssl req \
  -x509 \
  -nodes \
  -newkey rsa:2048 \
  -sha256 \
  -days 30 \
  -keyout "${KEY_FILE}" \
  -out "${CERT_FILE}" \
  -config "${OPENSSL_CONFIG}" \
  -extensions v3_req

printf '\nCertificado autoassinado gerado em %s\n' "${CERT_DIR}"
printf 'Aviso: para liberar camera no navegador do celular, prefira instalar mkcert e confiar a CA no aparelho.\n'
