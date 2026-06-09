---
name: deploy
description: Use this skill when deploying, troubleshooting deploys, or working with GCP infrastructure (Cloud Run, Cloud Build, Cloud SQL, Secret Manager).
---

## Ambiente

| Ambiente   | Projeto GCP          | Config gcloud | Cloud Run service |
| ---------- | -------------------- | ------------- | ----------------- |
| production | safras-amostras-prod | empresa       | rastreio-prod-app |

Nao ha mais ambiente de homologacao. Validacao pre-producao e feita via deploy canary (revision sem trafego com tag estavel).

## Deploy canary para producao

```bash
# 1. Working tree limpo (o script recusa sujo)
git status

# 2. Build da imagem (tag = git SHA, validado automaticamente)
scripts/gcp/build-image.sh cloud-production

# 3. Deploy canary (sem trafego, tag=canary)
scripts/gcp/deploy-cloud.sh cloud-production --canary
# Output imprime a URL canary: https://canary---rastreio-prod-app-<hash>.a.run.app

# 4. Executar migrate se ha migracao nova
scripts/gcp/execute-job.sh migrate cloud-production

# 5. Smoke test manual na URL canary
#    - login, dashboard, fluxo critico da feature

# 6. Promover trafego para nova revisao
gcloud run services update-traffic rastreio-prod-app \
  --to-latest --region=southamerica-east1
```

**Migrate em prod NAO e automatico.** Executar conscientemente via `execute-job.sh`.

## Rollback

**Antes de promover:** nao faca o passo 6. Trafego continua na revisao anterior automaticamente (rollback implicito, custo zero).

**Apos promover (emergencia):**

```bash
gcloud run revisions list --service=rastreio-prod-app \
  --region=southamerica-east1 --limit=5
# identifique a revisao anterior estavel
gcloud run services update-traffic rastreio-prod-app \
  --to-revisions=<REVISION_ANTERIOR>=100 \
  --region=southamerica-east1
```

## Scripts GCP

- `scripts/gcp/build-image.sh cloud-production` — build com tag=git SHA e guard de tree limpo
- `scripts/gcp/deploy-cloud.sh cloud-production [--canary]` — deploy service + jobs
- `scripts/gcp/execute-job.sh <migrate|seed|backfill-liga> cloud-production [--dry-run]` — executa jobs
- `scripts/gcp/preflight.sh cloud-production` — valida auth e recursos
- `scripts/gcp/smoke.sh cloud-production` — smoke test HTTP

O parametro `cloud-production` e obrigatorio em todos os scripts.

## Job `backfill-liga` (one-off)

Recalcula safra/proprietario das ligas existentes a partir das origens e emite um
`REGISTRATION_UPDATED` (ator `SYSTEM`) por liga stale. Reusa a imagem do job migrate
— que agora carrega `src/` + `scripts/` no Dockerfile — sobrescrevendo o comando.
Idempotente por re-derivacao (re-run = no-op). **Rodar SO depois** do recurso
owner+safra-reativo estar em prod (senao edicoes reintroduzem drift), e sempre
`--dry-run` antes do apply:

```bash
scripts/gcp/execute-job.sh backfill-liga cloud-production --dry-run  # so relatorio
scripts/gcp/execute-job.sh backfill-liga cloud-production            # aplica
```

## Antipadroes (NUNCA fazer)

1. **NUNCA** `gcloud builds submit` sem ter commitado (gera codigo sem rastreabilidade)
2. **NUNCA** editar `GCLOUD_IMAGE_TAG` em `.env.cloud-production.ops` (tag e dinamica do git SHA)
3. **NUNCA** promover trafego pra nova revisao sem smoke test no canary primeiro
4. **NUNCA** `gcloud run services update-traffic --to-revisions=...` sem desfazer depois (trafego fica pinned)

## Validacao pos-deploy

- Smoke test manual: login + dashboard + fluxo critico
- Headers HTTP: `curl -sI <URL> | grep -iE '(content-security-policy|strict-transport-security)'`

## Secret Manager

- Secrets de banco, auth, bootstrap admin, SMTP pass e OpenAI em Secret Manager (projeto `safras-amostras-prod`)
- Nunca em env files commitados
- `.env.cloud-production` e `.env.cloud-production.ops` sao locais (gitignored)

## Referencia completa

Para guia detalhado com troubleshoot, ver `docs/Deploy-e-Cloud-Build.md`.
