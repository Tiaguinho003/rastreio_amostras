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
- `scripts/gcp/execute-job.sh <migrate|seed|backfill-liga|push-digest> cloud-production [--dry-run]` — executa jobs
- `scripts/gcp/setup-push-digest-scheduler.sh cloud-production` — agenda os lembretes de push no Cloud Scheduler (idempotente; 4 schedulers no mesmo job com override de `--kind`: classification todos os dias 08:00, registrations seg-sex 08:00, prospect ter-qui 11:00, weekly-reminder de hora em hora 08-20 todos os dias — America/Sao_Paulo. O weekly-reminder avalia por usuario as regras do relatorio semanal do comercial; o marcador `weekly_report_reminder` garante max 1 push/usuario/semana e as execucoes extras sao no-op)
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

## Web Push (notificacoes nativas)

Config por env (padrao OPENAI: faltou var -> feature desabilitada, app sobe normal):
`PUSH_VAPID_PUBLIC_KEY` + `PUSH_VAPID_SUBJECT` (env vars normais, `.env.cloud-production`)
e `PUSH_VAPID_PRIVATE_KEY` via secret `rastreio-prod-push-vapid-private-key`
(`GCLOUD_SECRET_PUSH_VAPID_PRIVATE_KEY` no ops env). Job `push-digest`
(`GCLOUD_CLOUD_RUN_PUSH_DIGEST_JOB`) e deployado junto com os demais e disparado
1x/dia pelo Cloud Scheduler (`setup-push-digest-scheduler.sh`, one-time). Setup
completo passo a passo em `docs/Deploy-e-Cloud-Build.md` secao "Web Push".
Atencao: inscricao de push e POR ORIGEM — o canary valida rotas/card, mas a
notificacao real so se valida no host de producao pos-promote; rotacionar a chave
VAPID invalida todas as inscricoes existentes.

## Laudo publico do QR (Etiqueta de Envio) — `REPORT_PUBLIC_BASE_URL` + Firebase Hosting

O QR da Etiqueta de Envio aponta pra `${REPORT_PUBLIC_BASE_URL}/laudo/<token>`
(`buildLaudoReportUrl` em `src/api/v1/backend-api.js`; fallback `APP_BASE_URL`).
`REPORT_PUBLIC_BASE_URL` e env normal em `.env.cloud-production` e **precisa estar**
no `runtime_env_vars_csv` (`scripts/gcp/_lib.sh`) — senao o `--set-env-vars` do
deploy a dropa. Valor em prod: `https://safras-negocios-laudo.web.app`.

Esse dominio e um site DEDICADO do **Firebase Hosting** (`firebase.json` +
`.firebaserc`, target `laudo`) que faz rewrite SO de `/laudo/**` pro Cloud Run
(`rastreio-prod-app`, `southamerica-east1`): isola o laudo publico do app interno
(resto do dominio = 404 via `public-laudo/404.html`), SSL gratis. Deploy do site
(SEPARADO do Cloud Run; roda quem tem auth Google no projeto): `firebase deploy
--only hosting:laudo`. `Cache-Control: no-store` (origem + `firebase.json`) garante
que laudo revogado (D8) nao saia do cache do CDN.

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
