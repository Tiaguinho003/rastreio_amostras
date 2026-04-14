# Deploy guide

Guia operacional para deploy do `rastreio-interno-amostras` em producao via
fluxo canary.

> Este guia substitui o fluxo antigo que passava por um ambiente de homolog
> intermediario. Desde 2026-04-14, validacao pre-producao e feita diretamente
> via deploy canario em producao (revision sem trafego com tag estavel).
> Rollback e instantaneo via `update-traffic` apontando pra revisao anterior.

---

## Visao geral do fluxo

```
1. commit local
2. git push origin main (sem trigger automatico — push so salva no git)
3. scripts/gcp/build-image.sh cloud-production (build da imagem com tag=SHA)
4. scripts/gcp/deploy-cloud.sh cloud-production --canary (deploy sem trafego)
5. (se houver migration nova) scripts/gcp/execute-job.sh migrate cloud-production
6. smoke test manual na URL canary: https://canary---rastreio-prod-app-<hash>.a.run.app
7. (se OK) gcloud run services update-traffic rastreio-prod-app --to-latest --region=southamerica-east1
```

---

## Pre-requisitos

### gcloud config

- **`empresa`**: conta Measy `measyia@gmail.com` -> projeto `safras-amostras-prod` -> producao

```bash
gcloud config configurations list
```

### Auth valido

```bash
gcloud auth print-access-token
```

Se expirado:

```bash
gcloud auth login
```

### Working tree limpo

O `build-image.sh` recusa rodar se houver mudancas nao commitadas. Antes de buildar:

```bash
git status
# nothing to commit, working tree clean
```

### Env files locais

Os arquivos `.env.cloud-production` e `.env.cloud-production.ops` sao **ignorados pelo git**
(estao em `.gitignore`). Cada maquina tem sua copia local com secrets de smoke test etc.

Se voce esta em uma maquina nova, copie dos templates versionados:

```bash
cp env/examples/cloud-production.env.example .env.cloud-production
cp env/examples/cloud-production.ops.env.example .env.cloud-production.ops
# customizar com os valores reais do projeto
```

> **NAO** definir `GCLOUD_IMAGE_TAG` nesses arquivos. A tag e gerada
> automaticamente do `git rev-parse --short HEAD`.

---

## Deploy canary (producao)

Sequencia completa:

```bash
# 1. Garantir working tree limpo (o script vai recusar senao)
git status

# 2. Garantir que esta no commit que quer deployar
git log --oneline -1

# 3. Build da imagem
scripts/gcp/build-image.sh cloud-production

# 4. Deploy canary (sem trafego, tag=canary)
scripts/gcp/deploy-cloud.sh cloud-production --canary
```

Output esperado do deploy canary:

```
[gcp] ============================================================
[gcp]  CANARY deployed (sem trafego)
[gcp]  URL: https://canary---rastreio-prod-app-r4au5o2iea-rj.a.run.app
[gcp]  Trafego 100% continua na revisao anterior.
[gcp]  Para promover apos smoke test:
[gcp]    gcloud run services update-traffic rastreio-prod-app \
[gcp]      --to-latest --region=southamerica-east1
[gcp] ============================================================
```

**Detalhes:**

- A tag da imagem e gerada **automaticamente** do `git rev-parse --short HEAD`.
- O `build-image.sh` chama `gcloud builds submit .` no projeto `safras-amostras-prod`.
- O `deploy-cloud.sh --canary` faz:
  - `gcloud run deploy --no-traffic --tag=canary` no service `rastreio-prod-app`
  - Nao atualiza `APP_BASE_URL` (evitaria criar revisao sem a tag canary)
  - Re-deploya os jobs `rastreio-prod-migrate` e `rastreio-prod-seed` (nao os executa)

**Tempo total esperado:** ~5 minutos (build ~3min + deploy canary ~1min).

### Smoke test na URL canary

A URL canary e estavel entre deploys (tag=canary sempre aponta pra revisao
mais recente com essa tag). Teste manualmente:

1. Login
2. Dashboard carrega
3. Fluxo critico da feature em desenvolvimento
4. Headers de seguranca: `curl -sI <canary-url> | grep -iE '(csp|hsts)'`

### Executar migrate (se houve mudanca de schema)

```bash
scripts/gcp/execute-job.sh migrate cloud-production
```

Rodar migrate **antes** de promover trafego. Migrations devem ser backward-
compatible — a revisao anterior (ainda servindo trafego) precisa continuar
funcionando com o novo schema.

### Promover trafego

Se smoke test passou:

```bash
gcloud run services update-traffic rastreio-prod-app \
  --to-latest --region=southamerica-east1
```

Trafego 100% muda pra revisao nova instantaneamente.

**Se smoke test falhou:** nao promover. Trafego continua 100% na revisao
anterior (rollback implicito). Corrigir o bug, commitar, voltar ao passo 3.

---

## Rollback

### Antes de promover

Simplesmente nao faca `update-traffic`. A revisao anterior continua servindo
100%. Opcionalmente, deletar a revisao canary pra limpeza.

### Apos promover (emergencia)

```bash
gcloud run revisions list --service=rastreio-prod-app \
  --region=southamerica-east1 --limit=5
# identifique a revisao anterior estavel, ex: rastreio-prod-app-00053-dmx
gcloud run services update-traffic rastreio-prod-app \
  --to-revisions=rastreio-prod-app-00053-dmx=100 \
  --region=southamerica-east1
```

> **Desfazer pin apos rollback:** depois que o bug for corrigido e a revisao
> nova deployada, rodar `--to-latest` pra desfazer o pin — senao deploys
> subsequentes criam revisoes mas nunca servem trafego.

---

## Antipadroes

### NUNCA `gcloud builds submit` direto do working tree sem ter commitado

**Por que:** gera codigo rodando em producao sem rastreabilidade no git. Fica
impossivel auditar o que esta rodando, fazer rollback, ou entender o estado
real do sistema.

**Ja aconteceu:** 07-08/04/2026, gerou 6 imagens em prod com tags manuais
descritivas sem rastreabilidade. Recovery custou ~4 horas. Detalhes em
`feedback_no_deploy_without_commit.md` (memoria do Claude Code).

**Bypass excepcional** (recovery, build de WIP pra teste):

```bash
ALLOW_DIRTY=true scripts/gcp/build-image.sh cloud-production
```

### NUNCA editar `.env.cloud-production.ops` pra mudar `GCLOUD_IMAGE_TAG`

**Por que:** a tag e dinamica (vem do `git rev-parse --short HEAD`).
Hardcoding traz de volta o problema antigo.

**Bypass excepcional:**

```bash
SHORT_SHA=$(git rev-parse --short HEAD)
sed "s/^# GCLOUD_IMAGE_TAG.*$/GCLOUD_IMAGE_TAG=${SHORT_SHA}-recovery/" \
  .env.cloud-production.ops > /tmp/cloud-production-recovery.ops
OPS_ENV_FILE=/tmp/cloud-production-recovery.ops scripts/gcp/build-image.sh cloud-production
rm /tmp/cloud-production-recovery.ops
```

### NUNCA promover trafego sem smoke test no canary

**Por que:** o canary existe exatamente pra essa validacao. Promover direto
equivale a deploy sem validacao.

### NUNCA `gcloud run services update-traffic --to-revisions=...` sem desfazer depois

**Por que:** o pinning de trafego persiste indefinidamente. Deploys subsequentes
ficam `Retired` sem nunca servir trafego.

**Como detectar:**

```bash
gcloud run services describe rastreio-prod-app \
  --region=southamerica-east1 --format='yaml(spec.traffic)'
```

Se mostrar `revisionName` especifica em vez de `latestRevision: true`, esta pinado.

**Como desfazer:**

```bash
gcloud run services update-traffic rastreio-prod-app \
  --region=southamerica-east1 --to-latest
```

---

## Troubleshoot

### Build recusa rodar com "working tree sujo"

```
[gcp] ERRO: working tree tem mudancas nao commitadas.
```

**Causa:** guard de integridade ativado (correto). Ha mudancas nao commitadas
ou arquivos untracked nao-ignorados pelo `.gitignore`.

**Fix:**

```bash
git status        # ver o que esta sujo
git add ... && git commit -m "..."   # commitar
# OU
git stash         # se quiser deixar pra depois
```

### Canary URL retorna 404 ou erro 503

**Causa 1:** deploy canary ainda nao completou. Aguardar ~30s.

**Causa 2:** revision canary falhou (por exemplo, migration nao aplicada). Checar:

```bash
gcloud run revisions list --service=rastreio-prod-app \
  --region=southamerica-east1 --limit=3
gcloud run revisions describe <REVISION_NAME> \
  --region=southamerica-east1 --format='yaml(status)'
```

### Migrate job nao foi executado

O `deploy-cloud.sh` **deploya** os jobs `migrate` e `seed` (atualiza a
definicao com a nova imagem) mas **nao os executa** automaticamente. Em prod,
executar migracoes e decisao consciente.

**Para executar migrate em prod (idempotente):**

```bash
scripts/gcp/execute-job.sh migrate cloud-production
# ou direto:
gcloud run jobs execute rastreio-prod-migrate \
  --region=southamerica-east1 --wait
```

> O Prisma faz no-op em migrations ja aplicadas. Seguro de rodar mesmo sem
> certeza se ja foi aplicado.

---

## Referencia

### Scripts

- `scripts/gcp/build-image.sh cloud-production` — build da imagem (com guard de tree limpo)
- `scripts/gcp/deploy-cloud.sh cloud-production [--canary]` — deploy do service e jobs
- `scripts/gcp/execute-job.sh <migrate|seed> cloud-production` — executa jobs
- `scripts/gcp/preflight.sh cloud-production` — valida envs, auth e recursos
- `scripts/gcp/smoke.sh cloud-production` — smoke test HTTP contra producao
- `scripts/gcp/_lib.sh` — funcoes compartilhadas (carrega env files, deriva defaults, computa tag dinamica)

### Env files (NAO versionados)

- `.env.cloud-production`
- `.env.cloud-production.ops`

Templates em `env/examples/cloud-production{,.ops}.env.example`.

### URLs

- **PROD:** https://rastreio-prod-app-r4au5o2iea-rj.a.run.app
- **CANARY (estavel entre deploys):** https://canary---rastreio-prod-app-r4au5o2iea-rj.a.run.app

### Secret Manager (projeto `safras-amostras-prod`)

- `rastreio-prod-database-url`
- `rastreio-prod-auth-secret`
- `rastreio-prod-bootstrap-admin-{full-name,username,email,password}`
- `rastreio-prod-openai-api-key`
- `rastreio-prod-smtp-pass`

### Cloud SQL

- `rastreio-prod-pg` (Postgres producao) — 24/7

### Backup tags

Apos qualquer recovery, criar tag de backup pra poder voltar:

```bash
git tag backup-recovery-main-$(date +%Y%m%d-%H%M)
```

Remover quando nao precisar mais (~7 dias).
