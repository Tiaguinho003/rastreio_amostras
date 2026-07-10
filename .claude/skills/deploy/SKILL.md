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

## Compatibilidade de migration — o que sustenta a ordem acima

O passo 4 roda **enquanto a revisao antiga serve 100% do trafego**. Logo, toda
migration pendente tem de ser **backward-compatible**: o codigo velho precisa
continuar funcionando contra o schema novo. E o que torna o rollback do passo 6
gratuito — voltar o trafego NAO desfaz migration.

**Antes do passo 2**, ler o SQL de cada migration pendente (as que estao em
`prisma/migrations/` e nao em `_prisma_migrations` do banco) e classificar:

| Seguro (afrouxa ou cria)                          | Forca DOIS deploys (aperta ou remove)                     |
| ------------------------------------------------- | --------------------------------------------------------- |
| `CREATE TABLE` / `CREATE INDEX`                   | `DROP COLUMN`, `DROP TABLE`                               |
| `ADD COLUMN` **nullable** (ou com DEFAULT)        | `ADD COLUMN NOT NULL` sem default                         |
| `ALTER COLUMN ... DROP NOT NULL`                  | `ALTER COLUMN ... SET NOT NULL`                           |
| `DROP CONSTRAINT` / `DROP TRIGGER`                | `ADD CONSTRAINT` / `CHECK` mais restrito                  |
| `ALTER TYPE ... ADD VALUE`                        | remover valor de enum (recriar o tipo)                    |
| `CREATE OR REPLACE FUNCTION` que **permite mais** | `RENAME COLUMN/TABLE`; `UNIQUE` novo sobre dado existente |

Tabela que **nao existe em prod ainda** e sempre segura: o codigo velho nao a
conhece. So importa o que toca tabela ja aplicada.

**Se houver qualquer item da coluna direita**, a mudanca vira dois deploys
(expand/contract):

1. Deploy A — migration que **adiciona** o novo formato; codigo escreve nos dois.
2. Deploy B (depois de A promovido) — migration que **remove** o formato antigo.

Nunca juntar os dois: entre o passo 4 e o 6 o codigo velho quebraria, e o
rollback deixaria de existir.

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

## Modo manutencao — pausar nao-ADM (M1)

Gate `M1` no `middleware.ts` (em prod desde 04/2026): com `MAINTENANCE_MODE=true`
no env, **todo nao-ADMIN e redirecionado pra `/maintenance`** em qualquer rota —
inclusive as APIs. Ficam livres so `/login`, `/api/v1/auth`, health e assets (o
ADMIN loga e usa o app normal). Pagina em `app/maintenance/page.tsx`. Serve pra
janela de reformulacao/deploy: pausa os usuarios, o ADMIN confere sozinho.

- **Pausar agora (imagem atual, sem rebuild):**
  ```bash
  gcloud run services update rastreio-prod-app --region=southamerica-east1 \
    --update-env-vars MAINTENANCE_MODE=true
  ```
  `--update-env-vars` faz MERGE (nova revisao, mesma imagem; preserva as outras vars).
- **Sobreviver a um deploy:** o deploy usa `--set-env-vars` (substitui o conjunto
  inteiro), entao a flag SO entra na revisao nova se estiver no `runtime_env_vars_csv`
  (`_lib.sh`) — que a inclui quando `MAINTENANCE_MODE` esta setado no `.env.cloud-production`
  (ops). Setar la ANTES do build => canary + promote carregam a pausa (senao o promote
  despausa). Off por padrao.
- **Despausar (go-live):**
  ```bash
  gcloud run services update rastreio-prod-app --region=southamerica-east1 \
    --remove-env-vars MAINTENANCE_MODE
  ```
  Instantaneo (mesma imagem). **Depois:** limpar `MAINTENANCE_MODE` do `.env.cloud-production`
  pra um deploy futuro nao repausar sem querer.

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

## Web Push (notificacoes nativas)

Config por env (padrao OPENAI: faltou var -> feature desabilitada, app sobe normal):
`PUSH_VAPID_PUBLIC_KEY` + `PUSH_VAPID_SUBJECT` (env vars normais, `.env.cloud-production`)
e `PUSH_VAPID_PRIVATE_KEY` via secret `rastreio-prod-push-vapid-private-key`
(`GCLOUD_SECRET_PUSH_VAPID_PRIVATE_KEY` no ops env). Setup completo passo a passo
em `docs/Deploy-e-Cloud-Build.md` secao "Web Push".

**Nenhuma notificacao e enviada hoje** — o catalogo foi zerado em 2026-07-09 e o
job de cron `push-digest` (mais seus Cloud Scheduler jobs) saiu do repo. Nao ha
job nem scheduler a deployar; reimplementar uma notificacao agendada exige
recriar os dois. Catalogo canonico: `docs/Notificacoes.md`.

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
5. **NUNCA** aplicar migration destrutiva (coluna direita da tabela acima) no mesmo deploy que sobe o codigo que a exige — ver "Compatibilidade de migration"

## Validacao pos-deploy

- Smoke test manual: login + dashboard + fluxo critico
- Headers HTTP: `curl -sI <URL> | grep -iE '(content-security-policy|strict-transport-security)'`

## Secret Manager

- Secrets de banco, auth, bootstrap admin, SMTP pass e OpenAI em Secret Manager (projeto `safras-amostras-prod`)
- Nunca em env files commitados
- `.env.cloud-production` e `.env.cloud-production.ops` sao locais (gitignored)

## Referencia completa

Para guia detalhado com troubleshoot, ver `docs/Deploy-e-Cloud-Build.md`.
