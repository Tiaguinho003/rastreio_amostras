# Deploy guide

Guia operacional para deploy do `rastreio-interno-amostras` em homolog e produção.

> Este documento foi escrito após o incidente de 07-08/04/2026, em que 6 deploys
> consecutivos foram feitos para produção sem passar pelo git, gerando código
> rodando em produção sem rastreabilidade. A Fase B (commits B1-B5) blindou o
> tooling para evitar a repetição. Este guia documenta o caminho correto e os
> antipadrões que devemos evitar.

---

## Visão geral do fluxo

```
1. commit local
2. git push origin main
3. trigger Cloud Build (rastreio-hml-cloud-run) dispara automaticamente
4. build + push da imagem :<SHORT_SHA> + deploy hml + migrate job
5. validar hml em https://rastreio-hml-app-yvcijqvsca-rj.a.run.app
6. (depois de OK) build manual de prod com mesmo SHA
7. deploy de prod via scripts/gcp/deploy-cloud.sh
8. confirmar paridade via scripts/gcp/parity-check.sh
```

---

## Pré-requisitos

### Configs gcloud

- **`default`**: conta pessoal `flaviohfoliveira@gmail.com` → projeto `rastreio-amostras` → **homolog**
- **`empresa`**: conta Measy `measyia@gmail.com` → projeto `safras-amostras-prod` → **produção**

```bash
gcloud config configurations list
```

Trocar entre configs sem persistir:

```bash
gcloud --configuration=empresa <comando>
# OU
CLOUDSDK_ACTIVE_CONFIG_NAME=empresa <comando>
```

### Auth válido

```bash
gcloud --configuration=default auth print-access-token
gcloud --configuration=empresa auth print-access-token
```

Se expirado:

```bash
gcloud --configuration=<conf> auth login
```

### Working tree limpo

O `build-image.sh` recusa rodar se houver mudanças não commitadas. Antes de buildar:

```bash
git status
# nothing to commit, working tree clean
```

### Env files locais

Os arquivos `.env.cloud-{homolog,production}{,.ops}` são **ignorados pelo git**
(estão em `.gitignore`). Cada máquina tem sua cópia local com secrets de SMOKE
test, etc. Se você está em uma máquina nova, peça os arquivos pro Flavio.

> ⚠️ A partir de B1 (Fase B), **NÃO** definir `GCLOUD_IMAGE_TAG` nesses arquivos.
> A tag agora é gerada automaticamente do `git rev-parse --short HEAD`.
> Se você tem cópia antiga, remova/comente a linha `GCLOUD_IMAGE_TAG=`.

---

## Deploy pra homolog (automático)

100% automático via Cloud Build trigger. Apenas:

```bash
git push origin main
```

**O que acontece:**

1. GitHub recebe o push
2. Cloud Build trigger `rastreio-hml-cloud-run` (ID `23e4ad65-b17c-4925-939d-7fc0d1b9ebc6`) detecta o push em `main`
3. Roda `cloudbuild.homolog.yaml`:
   - Build da imagem com tag `:<SHORT_SHA>`
   - Push pro Artifact Registry de homolog
   - Deploy no Cloud Run service `rastreio-hml-app`
   - Executa o migrate job `rastreio-hml-migrate`
4. Hml fica disponível em https://rastreio-hml-app-yvcijqvsca-rj.a.run.app

**Acompanhar o build:**

```bash
gcloud --configuration=default builds list --limit=1 \
  --format='value(id,status,substitutions.SHORT_SHA)'
# pegar o ID, depois:
gcloud --configuration=default builds log <ID> --stream
```

Ou no console:
https://console.cloud.google.com/cloud-build/builds?project=rastreio-amostras

**Tempo total esperado:** 4-6 minutos (build ~3min + deploy ~30s + migrate ~30s).

---

## Deploy pra produção (manual)

Sequência completa:

```bash
# 1. Garantir working tree limpo (o script vai recusar senão)
git status

# 2. Garantir que está no commit que quer deployar
git log --oneline -1

# 3. Build da imagem
CLOUDSDK_ACTIVE_CONFIG_NAME=empresa scripts/gcp/build-image.sh cloud-production

# 4. Deploy
CLOUDSDK_ACTIVE_CONFIG_NAME=empresa scripts/gcp/deploy-cloud.sh cloud-production

# 5. Verificar paridade prod ↔ hml
scripts/gcp/parity-check.sh
```

**Detalhes:**

- A tag da imagem é gerada **automaticamente** do `git rev-parse --short HEAD`.
  Você não edita `.env.cloud-production.ops` nem precisa lembrar de mudar tag.
- O `build-image.sh` chama `gcloud builds submit .` no projeto da empresa.
  O working tree é empacotado e enviado pro Cloud Build remoto.
- O `deploy-cloud.sh` faz:
  - `gcloud run deploy` no service `rastreio-prod-app`
  - Atualiza `APP_BASE_URL` se mudou
  - Re-deploya os jobs `rastreio-prod-migrate` e `rastreio-prod-seed`
  - **NÃO executa** automaticamente o migrate job em prod (ver Troubleshoot)

**Tempo total esperado:** 5-8 minutos (build ~5min + deploy ~30s).

---

## Verificar paridade

```bash
scripts/gcp/parity-check.sh
```

Output esperado quando ok:

```
================================================================
  PARITY CHECK -- homolog vs producao
================================================================

  HML  config:    default (rastreio-hml-app)
  PROD config:    empresa (rastreio-prod-app)

  HML  tag:       6db9801
  PROD tag:       6db9801

  HML  revision:  rastreio-hml-app-00159-6gh (latestRevision=True)
  PROD revision:  rastreio-prod-app-00053-dmx (latestRevision=True)

  OK MESMA VERSAO (6db9801)
```

Exit codes:

- `0` — paridade total
- `1` — divergência (tags diferentes ou tráfego pinned)
- `2` — erro de gcloud (auth, config, region)

Útil em scripts de cron/CI:

```bash
if ! scripts/gcp/parity-check.sh > /dev/null; then
  echo "ALERTA: prod e hml estão divergentes"
fi
```

---

## Antipadrões

### NUNCA `gcloud builds submit` direto do working tree sem ter commitado

**Por quê:** gera código rodando em produção sem rastreabilidade no git. Fica
impossível auditar o que está rodando, fazer rollback, ou entender o estado
real do sistema.

**Já aconteceu:** 07-08/04/2026, gerou 6 imagens em prod com tags manuais
descritivas (`prod-20260407-location`, `prod-20260408-commercial-fixes`, etc),
nenhuma rastreável a um commit do git. O recovery custou ~4 horas e envolveu
extrair source da imagem Docker, recriar commits, dividir em commits temáticos
e rebuildar prod com SHA correto. Detalhes em `feedback_no_deploy_without_commit.md`
(memória do Claude Code).

**Bypass excepcional** (recovery, build de WIP pra teste):

```bash
ALLOW_DIRTY=true scripts/gcp/build-image.sh cloud-production
```

### NUNCA editar `.env.*.ops` pra mudar `GCLOUD_IMAGE_TAG`

**Por quê:** a tag agora é dinâmica (vem do `git rev-parse --short HEAD`).
Hardcoding traz de volta o problema antigo (cada build precisa lembrar de
editar o arquivo, e usar tags descritivas em vez de SHA é uma porta de entrada
pra deploys sem rastreabilidade).

**Bypass excepcional:**

```bash
SHORT_SHA=$(git rev-parse --short HEAD)
sed "s/^# GCLOUD_IMAGE_TAG.*$/GCLOUD_IMAGE_TAG=${SHORT_SHA}-recovery/" \
  .env.cloud-production.ops > /tmp/cloud-production-recovery.ops
OPS_ENV_FILE=/tmp/cloud-production-recovery.ops scripts/gcp/build-image.sh cloud-production
rm /tmp/cloud-production-recovery.ops
```

### NUNCA `gcloud run services update-traffic --to-revisions=...` sem desfazer depois

**Por quê:** o pinning de tráfego persiste indefinidamente. Deploys subsequentes
ficam `Retired` sem nunca servir tráfego.

**Já aconteceu:** entre 06 e 09/04/2026, hml ficou pinned na revision 00153-mf9
(do dia 06). Os deploys 154-159 foram criados mas nunca serviram tráfego — o
usuário não percebeu por dias.

**Como detectar:**

```bash
scripts/gcp/parity-check.sh
# Ele avisa se latestRevision != True
```

**Como desfazer:**

```bash
gcloud --configuration=<conf> run services update-traffic <svc> \
  --region=southamerica-east1 \
  --to-latest
```

---

## Troubleshoot

### Build de prod recusa rodar com "working tree sujo"

```
[gcp] ERRO: working tree tem mudancas nao commitadas.
```

**Causa:** B2 guard ativado (correto). Há mudanças não commitadas ou arquivos
untracked não-ignorados pelo `.gitignore`.

**Fix:**

```bash
git status        # ver o que está sujo
git add ... && git commit -m "..."   # commitar
# OU
git stash         # se quiser deixar pra depois
```

**Bypass excepcional** (recovery, build de WIP pra teste):

```bash
ALLOW_DIRTY=true scripts/gcp/build-image.sh cloud-production
```

### `parity-check.sh` diz "DIVERGENCIA"

**Causa 1**: deploy de prod não foi feito ainda.
**Fix:** rodar `scripts/gcp/build-image.sh cloud-production` + `deploy-cloud.sh cloud-production`.

**Causa 2**: tráfego pinned em revision antiga.
**Fix:**

```bash
gcloud --configuration=<conf> run services describe <svc> \
  --region=southamerica-east1 --format='yaml(spec.traffic)'
# Se mostrar revisionName especifica em vez de latestRevision: true:
gcloud --configuration=<conf> run services update-traffic <svc> \
  --region=southamerica-east1 --to-latest
```

### Cloud Build trigger não disparou após push

**Causa:** branch errada ou trigger desabilitado.

**Fix:**

```bash
# Listar triggers
gcloud --configuration=default builds triggers list

# Ver detalhes do trigger esperado
gcloud --configuration=default builds triggers describe rastreio-hml-cloud-run

# Disparar manualmente (caso emergencial)
gcloud --configuration=default builds triggers run rastreio-hml-cloud-run \
  --branch=main
```

### Migrate job não foi executado em prod

O `deploy-cloud.sh` **deploya** os jobs `migrate` e `seed` (atualiza a definição
com a nova imagem) mas **não os executa** automaticamente. Em prod, executar
migrações é decisão consciente.

**Para executar migrate em prod (idempotente):**

```bash
gcloud --configuration=empresa run jobs execute rastreio-prod-migrate \
  --region=southamerica-east1 \
  --wait
```

> O Prisma faz no-op em migrations já aplicadas. Seguro de rodar mesmo se você
> não tem certeza se já foi aplicado.

---

## Referência

### Scripts

- `scripts/gcp/build-image.sh <cloud-env>` — build da imagem (com guard de tree limpo)
- `scripts/gcp/deploy-cloud.sh <cloud-env>` — deploy do service e jobs
- `scripts/gcp/deploy-cloud-homolog.sh` — deploy de hml (usado pelo Cloud Build automático)
- `scripts/gcp/parity-check.sh` — comparar hml vs prod
- `scripts/gcp/_lib.sh` — funções compartilhadas (carrega env files, deriva defaults, computa tag dinâmica)

### Cloud Build

- **Config homolog:** `cloudbuild.homolog.yaml` (no repo)
- **Trigger homolog:** `rastreio-hml-cloud-run` (ID `23e4ad65-b17c-4925-939d-7fc0d1b9ebc6`)
- **Disparo:** push em `main`
- **Pipeline:** prepare-env → build-image → push-image → deploy → migrate → seed-optional
- **Não há trigger pra produção.** Deploy de prod é manual via scripts.

### Env files (NÃO versionados)

Cada máquina precisa ter cópias locais:

- `.env.cloud-homolog`
- `.env.cloud-homolog.ops`
- `.env.cloud-production`
- `.env.cloud-production.ops`

Se faltarem, peça pro Flavio.

### URLs

- **HML:** https://rastreio-hml-app-yvcijqvsca-rj.a.run.app
- **PROD:** https://rastreio-prod-app-r4au5o2iea-rj.a.run.app

### Secret Manager

- **Homolog (`rastreio-amostras` projeto):** `rastreio-hml-database-url`, `rastreio-hml-auth-secret`, `rastreio-hml-bootstrap-admin-{full-name,username,email,password}`, `rastreio-hml-openai-api-key`
- **Produção (`safras-amostras-prod` projeto):** `rastreio-prod-database-url`, `rastreio-prod-auth-secret`, `rastreio-prod-bootstrap-admin-{full-name,username,email,password}`, `rastreio-prod-openai-api-key`, `rastreio-prod-smtp-pass`

### Cloud SQL

- `rastreio-hml-pg` (Postgres homolog) — activation-policy=NEVER por default (liga sob demanda pra economizar custo)
- `rastreio-prod-pg` (Postgres produção) — 24/7

### Backup tags

Após qualquer recovery, criar tag de backup pra poder voltar:

```bash
git tag backup-recovery-main-$(date +%Y%m%d-%H%M)
```

Remover quando não precisar mais (~7 dias).
