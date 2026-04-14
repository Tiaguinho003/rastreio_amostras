# Operacao e Runtime

Status: Ativo  
Escopo: ambientes oficiais, modelo operacional, envs, compose, scripts e operacao basica  
Ultima revisao: 2026-04-14  
Documentos relacionados: `docs/Arquitetura-Tecnica.md`, `docs/Deploy-e-Cloud-Build.md`

## Modelo operacional oficial

O projeto deve ser entendido em tres camadas:

1. sistema
2. perfil operacional
3. instalacao concreta

Regra consolidada:

1. o sistema e unico e mora no repositorio;
2. os perfis oficiais sao `development` e `cloud-production`;
3. `cloud-production` possui configuracoes proprias em `.env.cloud-production{,.ops}` e deploy via `scripts/gcp/`.

## Ambientes oficiais

### `development`

Uso:

1. desenvolvimento diario;
2. validacao rapida;
3. runtime descartavel.

Arquivos canonicos:

1. `env/examples/development.env.example`
2. `.env.development`
3. `compose/development.yml`

### `cloud-production`

Uso:

1. producao real com dados de clientes;
2. deploy manual via `scripts/gcp/` (nao automatico por push);
3. validacao pre-promocao via deploy canary (revision sem trafego com tag);
4. migration job executado manualmente (decisao consciente).

Arquivos canonicos:

1. `env/examples/cloud-production.env.example`
2. `env/examples/cloud-production.ops.env.example`
3. `.env.cloud-production`
4. `.env.cloud-production.ops`
5. `docs/Deploy-e-Cloud-Build.md`

## Fluxo canonico de development

1. copiar env:

```bash
cp env/examples/development.env.example .env.development
```

2. subir banco:

```bash
scripts/runtime/compose.sh development up -d db
```

3. aplicar migrations e seed:

```bash
scripts/runtime/migrate.sh development
scripts/runtime/seed.sh development
```

4. subir aplicacao:

```bash
npm run dev
```

5. validar runtime quando necessario:

```bash
scripts/runtime/preflight.sh development
scripts/runtime/smoke.sh development
```

## Fluxo canonico de cloud-production (deploy canary)

1. copiar envs dos templates se nao tiver:

```bash
cp env/examples/cloud-production.env.example .env.cloud-production
cp env/examples/cloud-production.ops.env.example .env.cloud-production.ops
# customizar com os valores reais do projeto
```

2. validar contexto:

```bash
scripts/gcp/preflight.sh cloud-production
```

3. publicar imagem:

```bash
scripts/gcp/build-image.sh cloud-production
```

4. implantar canary (sem trafego):

```bash
scripts/gcp/deploy-cloud.sh cloud-production --canary
```

5. executar migrations se houve mudanca de schema:

```bash
scripts/gcp/execute-job.sh migrate cloud-production
```

6. smoke test manual na URL canary impressa pelo deploy

7. promover trafego:

```bash
gcloud run services update-traffic rastreio-prod-app \
  --to-latest --region=southamerica-east1
```

## Scripts canonicos

1. `scripts/runtime/compose.sh`
   Wrapper oficial do Docker Compose para `development`.
2. `scripts/runtime/migrate.sh`
   Aplica `prisma migrate deploy`.
3. `scripts/runtime/seed.sh`
   Cria o bootstrap inicial quando necessario.
4. `scripts/runtime/preflight.sh`
   Valida comandos, envs e consistencia minima.
5. `scripts/runtime/smoke.sh`
   Executa smoke test operacional contra `development`.
6. `scripts/gcp/preflight.sh cloud-production`
   Valida envs, auth e recursos basicos de producao Google Cloud.
7. `scripts/gcp/build-image.sh cloud-production`
   Publica a imagem no Artifact Registry via Cloud Build.
8. `scripts/gcp/deploy-cloud.sh cloud-production [--canary]`
   Implanta o servico Cloud Run e os jobs de migration/seed.
9. `scripts/gcp/execute-job.sh <migrate|seed> cloud-production`
   Executa os jobs `migrate` e `seed`.
10. `scripts/gcp/smoke.sh cloud-production`
    Executa smoke test HTTP contra a URL de producao.
11. `scripts/lib/smoke-test.sh`
    Implementacao compartilhada do smoke test HTTP (chamada por `scripts/runtime/smoke.sh` e `scripts/gcp/smoke.sh`).
12. `scripts/db/verify-phases-1-4.sh`
    Sanity check de schema do banco (tabelas, colunas, migrations e enums).

## Variaveis importantes

### Banco e runtime

1. `DATABASE_URL`
2. `POSTGRES_USER`
3. `POSTGRES_PASSWORD`
4. `POSTGRES_DB`
5. `APP_PORT`
6. `APP_BASE_URL`
7. `MAX_UPLOAD_SIZE_BYTES`

### Autenticacao e sessao

1. `AUTH_SECRET`
2. `SESSION_COOKIE_SECURE`

### Bootstrap inicial

1. `BOOTSTRAP_ADMIN_FULL_NAME`
2. `BOOTSTRAP_ADMIN_USERNAME`
3. `BOOTSTRAP_ADMIN_EMAIL`
4. `BOOTSTRAP_ADMIN_PASSWORD`

### Email

1. `EMAIL_TRANSPORT`
2. `SMTP_HOST`
3. `SMTP_PORT`
4. `SMTP_USER`
5. `SMTP_PASS`
6. `SMTP_FROM`
7. `EMAIL_OUTBOX_DIR`
8. `EMAIL_OUTBOX_FROM`

### Storage

1. `UPLOADS_DIR`

### Ops env de `cloud-production`

1. `GCLOUD_PROJECT_ID`
2. `GCLOUD_REGION`
3. `GCLOUD_ARTIFACT_REGISTRY_REPOSITORY`
4. `GCLOUD_IMAGE_NAME`
5. `GCLOUD_CLOUD_RUN_SERVICE`
6. `GCLOUD_CLOUD_RUN_MIGRATE_JOB`
7. `GCLOUD_CLOUD_RUN_SEED_JOB`
8. `GCLOUD_SERVICE_ACCOUNT`
9. `GCLOUD_CLOUD_SQL_INSTANCE_CONNECTION_NAME`
10. `GCLOUD_STORAGE_BUCKET`
11. `GCLOUD_SECRET_DATABASE_URL`
12. `GCLOUD_SECRET_AUTH_SECRET`
13. `GCLOUD_SECRET_BOOTSTRAP_ADMIN_*`
14. `GCLOUD_SECRET_SMTP_PASS`
15. `GCLOUD_SECRET_OPENAI_API_KEY`
16. `SMOKE_USERNAME`
17. `SMOKE_PASSWORD`
18. `API_BASE_URL`

> `GCLOUD_IMAGE_TAG` NAO deve ser setado no env file — e derivado dinamicamente do `git rev-parse --short HEAD`.

## Politicas operacionais

### Cookie de sessao

`SESSION_COOKIE_SECURE` suporta:

1. `false`
   recomendado para piloto LAN em HTTP interno;
2. `auto`
   ativa `Secure` quando a request chega como HTTPS;
3. `true`
   forca `Secure` em qualquer request.

Em `cloud-production`, o valor canonico e `auto`.

### Email

1. `development` usa `outbox` por padrao.
2. `cloud-production` usa `smtp` por padrao.

### Uploads

1. o runtime oficial usa `MAX_UPLOAD_SIZE_BYTES=8388608` por padrao;
2. cada imagem acima de `8 MiB` deve ser rejeitada com erro `413`;
3. em `cloud-production`, `UPLOADS_DIR` aponta para o bucket GCS montado em `/mnt/runtime`.

### Bootstrap de usuarios

1. Se nao existir usuario no banco, o seed cria o administrador inicial com as variaveis `BOOTSTRAP_ADMIN_*`.
2. `LOCAL_AUTH_USERS_JSON` permanece apenas como compatibilidade de seed legado.

## Health, smoke e observabilidade minima

Endpoints:

1. `/api/health`
2. `/api/health/live`
3. `/api/health/ready`

Regras:

1. `preflight` valida envs e o contexto operacional do ambiente, incluindo `docker compose config` quando aplicavel;
2. `smoke` depende do ops env do ambiente;
3. `cloud-production` deve validar `database`, `uploads` e `emailOutbox` no readiness.

## Backup e restore

1. Em `cloud-production`, o backup do banco usa os mecanismos gerenciados do `Cloud SQL` (snapshots automaticos + point-in-time recovery), nao ha wrapper local.
2. `development` nao possui backup automatico — em caso de necessidade, usar `pg_dump` manual.
