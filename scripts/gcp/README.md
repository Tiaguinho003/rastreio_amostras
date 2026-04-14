# Scripts GCP

Status: Ponteiro local
Escopo: wrappers operacionais para o ambiente `cloud-production` no Google Cloud
Ultima revisao: 2026-04-14
Documentos relacionados: `docs/Deploy-e-Cloud-Build.md`, `docs/Operacao-e-Runtime.md`

## Scripts oficiais

1. `scripts/gcp/preflight.sh cloud-production`
2. `scripts/gcp/build-image.sh cloud-production`
3. `scripts/gcp/deploy-cloud.sh cloud-production [--canary]`
4. `scripts/gcp/execute-job.sh <migrate|seed> cloud-production`
5. `scripts/gcp/smoke.sh cloud-production`

O parametro `<cloud-env>` e obrigatorio. Unico valor suportado: `cloud-production`.

## Ambiente

| Ambiente           | Env files                                             | Projeto GCP            |
| ------------------ | ----------------------------------------------------- | ---------------------- |
| `cloud-production` | `.env.cloud-production` + `.env.cloud-production.ops` | `safras-amostras-prod` |

## Fluxo canario (producao)

```bash
# 1. Working tree limpo (o script recusa sujo)
git status

# 2. Build (tag = git SHA)
scripts/gcp/build-image.sh cloud-production

# 3. Deploy canary (sem trafego, gera URL https://canary---<service>-<hash>.a.run.app)
scripts/gcp/deploy-cloud.sh cloud-production --canary

# 4. Executar migrate se houve migracao nova
scripts/gcp/execute-job.sh migrate cloud-production

# 5. Smoke test manual na URL canary

# 6. Promover trafego (se OK)
gcloud run services update-traffic rastreio-prod-app \
  --to-latest --region=southamerica-east1
```

## Regra

1. esses scripts usam `.env.cloud-production` e `.env.cloud-production.ops`;
2. o deploy nao usa Compose — apenas Cloud Run + Cloud SQL + GCS;
3. toda operacao de deploy deve seguir o fluxo canario descrito acima.
