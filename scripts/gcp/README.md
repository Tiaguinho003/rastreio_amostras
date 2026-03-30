# Scripts GCP

Status: Ponteiro local
Escopo: wrappers operacionais para ambientes Google Cloud (homolog e producao)
Ultima revisao: 2026-03-30
Documentos relacionados: `docs/Homologacao-Google-Cloud.md`, `docs/Operacao-e-Runtime.md`

## Scripts oficiais

1. `scripts/gcp/preflight.sh [cloud-env]`
2. `scripts/gcp/build-image.sh [cloud-env]`
3. `scripts/gcp/deploy-cloud.sh [cloud-env]`
4. `scripts/gcp/execute-job.sh <migrate|seed> [cloud-env]`
5. `scripts/gcp/smoke.sh [cloud-env]`
6. `scripts/gcp/deploy-cloud-homolog.sh` (legado, use `deploy-cloud.sh cloud-homolog`)

O parametro `[cloud-env]` define o ambiente. Padrao: `cloud-homolog`.

## Ambientes

| Ambiente | Env files | Projeto GCP |
|----------|-----------|-------------|
| `cloud-homolog` | `.env.cloud-homolog` + `.env.cloud-homolog.ops` | `rastreio-amostras` |
| `cloud-production` | `.env.cloud-production` + `.env.cloud-production.ops` | `safras-amostras-prod` |

## Exemplos

```bash
# Homolog (padrao)
./scripts/gcp/build-image.sh
./scripts/gcp/deploy-cloud.sh

# Producao
./scripts/gcp/build-image.sh cloud-production
./scripts/gcp/deploy-cloud.sh cloud-production
./scripts/gcp/execute-job.sh migrate cloud-production
```

## Regra

1. esses scripts usam `.env.<cloud-env>` e `.env.<cloud-env>.ops`;
2. o deploy nao usa Compose — apenas Cloud Run + Cloud SQL + GCS;
3. build, deploy e jobs devem seguir o fluxo descrito em `docs/Homologacao-Google-Cloud.md`.
