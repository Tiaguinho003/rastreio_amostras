# Homologacao Google Cloud

Status: Ativo  
Escopo: fluxo canonico de homologacao no Google Cloud com Cloud Run, Cloud SQL e Cloud Storage montado  
Ultima revisao: 2026-03-16  
Documentos relacionados: `docs/Operacao-e-Runtime.md`, `docs/Arquitetura-Tecnica.md`, `scripts/gcp/README.md`

## Topologia canonica

1. `Cloud Run` hospeda a aplicacao web/API.
2. `Cloud SQL for PostgreSQL` guarda o banco principal da homologacao.
3. `Cloud Storage` guarda uploads e outbox em um bucket montado em `/mnt/runtime`.
4. `Secret Manager` entrega `DATABASE_URL`, `AUTH_SECRET` e `BOOTSTRAP_ADMIN_*`.
5. `Artifact Registry` guarda a imagem publicada pelo `Cloud Build`.

## Contrato de runtime

Variaveis operacionais fixadas:

1. `SESSION_COOKIE_SECURE=auto`
2. `EMAIL_TRANSPORT=outbox`
3. `UPLOADS_DIR=/mnt/runtime/uploads`
4. `EMAIL_OUTBOX_DIR=/mnt/runtime/email-outbox`
5. `MAX_UPLOAD_SIZE_BYTES=8388608`

Segredos injetados por `Secret Manager`:

1. `DATABASE_URL`
2. `AUTH_SECRET`
3. `BOOTSTRAP_ADMIN_FULL_NAME`
4. `BOOTSTRAP_ADMIN_USERNAME`
5. `BOOTSTRAP_ADMIN_EMAIL`
6. `BOOTSTRAP_ADMIN_PASSWORD`

## Provisionamento inicial

Criar previamente:

1. instancia `Cloud SQL PostgreSQL 16`, single zone, `10 GB`
2. bucket regional `Standard` em `southamerica-east1`
3. service account dedicada do runtime
4. repositorio no `Artifact Registry`
5. segredos no `Secret Manager`

Permissoes minimas da service account:

1. `Cloud SQL Client`
2. `Secret Manager Secret Accessor`
3. `Storage Object Admin` no bucket da homologacao

## Fluxo canonico

1. copiar envs:

```bash
cp env/examples/cloud-homolog.env.example .env.cloud-homolog
cp env/examples/cloud-homolog.ops.env.example .env.cloud-homolog.ops
```

2. validar contexto Google Cloud:

```bash
scripts/gcp/preflight.sh
```

3. buildar e publicar imagem:

```bash
scripts/gcp/build-image.sh
```

4. implantar servico e jobs:

```bash
scripts/gcp/deploy-cloud-homolog.sh
```

5. executar migrations:

```bash
scripts/gcp/execute-job.sh migrate
```

6. executar seed inicial:

```bash
scripts/gcp/execute-job.sh seed
```

7. validar servico:

```bash
scripts/gcp/smoke.sh
```

## Regras operacionais

1. o servico Cloud Run usa `gen2`, `1 vCPU`, `1 GiB`, `concurrency=10`, `min-instances=0`, `max-instances=3` e `timeout=300s`;
2. a URL inicial oficial e a `run.app` gerada pelo Cloud Run;
3. uploads nao dependem do disco efemero do container;
4. cada imagem aceita no maximo `8 MiB`;
5. migrations e seed rodam em `Cloud Run Jobs`, nunca no startup do servico HTTP.

## Checklist de aceite

1. `/api/health/live` responde `200`;
2. `/api/health/ready` responde `200` com `database`, `uploads` e `emailOutbox` em `ok`;
3. login funciona na URL publica do Cloud Run;
4. criar amostra com foto de chegada funciona;
5. substituir foto de classificacao funciona;
6. exportar PDF com foto funciona;
7. fotos persistem apos novo deploy;
8. arquivos de outbox aparecem no bucket montado.
