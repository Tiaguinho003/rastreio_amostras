---
name: deploy
description: Use this skill when deploying, troubleshooting deploys, or working with GCP infrastructure (Cloud Run, Cloud Build, Cloud SQL, Secret Manager).
---

## Ambientes

| Ambiente   | Projeto GCP          | Config gcloud | Cloud Run service  |
| ---------- | -------------------- | ------------- | ------------------ |
| homolog    | rastreio-amostras    | default       | rastreio-hml-app   |
| production | safras-amostras-prod | empresa       | rastreio-prod-app  |

## Deploy para homolog (automatico)

```bash
git push origin main
# Cloud Build trigger dispara automaticamente
# Build + push imagem :<SHORT_SHA> + deploy + migrate job
# ~4-6 minutos
```

## Deploy para producao (manual)

```bash
git status                    # working tree limpo obrigatorio
CLOUDSDK_ACTIVE_CONFIG_NAME=empresa scripts/gcp/build-image.sh cloud-production
CLOUDSDK_ACTIVE_CONFIG_NAME=empresa scripts/gcp/deploy-cloud.sh cloud-production
scripts/gcp/parity-check.sh   # verificar paridade hml <-> prod
```

**Migrate em prod NAO e automatico.** Executar conscientemente:

```bash
gcloud --configuration=empresa run jobs execute rastreio-prod-migrate --region=southamerica-east1 --wait
```

## Scripts GCP

- `scripts/gcp/build-image.sh <env>` — build com guard de tree limpo (tag automatica do git SHA)
- `scripts/gcp/deploy-cloud.sh <env>` — deploy service + jobs
- `scripts/gcp/deploy-cloud-homolog.sh` — usado pelo Cloud Build automatico
- `scripts/gcp/parity-check.sh` — compara hml vs prod (exit 0 = paridade)
- `scripts/gcp/preflight.sh` — valida auth e recursos
- `scripts/gcp/execute-job.sh` — executa jobs migrate/seed
- `scripts/gcp/smoke.sh` — smoke test HTTP contra URL do ambiente

## Antipadroes (NUNCA fazer)

1. **NUNCA** `gcloud builds submit` sem ter commitado (gera codigo sem rastreabilidade)
2. **NUNCA** editar `GCLOUD_IMAGE_TAG` nos `.env.*.ops` (tag e dinamica do git SHA)
3. **NUNCA** `gcloud run services update-traffic --to-revisions=...` sem desfazer depois (trafego fica pinned)

## Validacao pos-deploy

- `scripts/gcp/parity-check.sh` — verifica mesma tag em hml e prod
- Smoke test manual: login + dashboard em hml
- Headers HTTP: `curl -sI <URL> | grep -iE '(content-security-policy|strict-transport-security)'`

## Secret Manager

- Secrets de banco, auth, bootstrap admin e OpenAI em Secret Manager
- Nunca em env files commitados
- `.env.cloud-{homolog,production}` e `.env.cloud-{homolog,production}.ops` sao locais (gitignored)

## Referencia completa

Para guia detalhado com troubleshoot, ver `docs/Deploy-e-Cloud-Build.md`.
