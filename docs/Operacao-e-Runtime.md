# Operacao e Runtime

Status: Ativo  
Escopo: ambientes oficiais, modelo operacional, envs, compose, scripts e operacao basica  
Ultima revisao: 2026-03-16  
Documentos relacionados: `docs/Arquitetura-Tecnica.md`, `docs/Homologacao-Google-Cloud.md`, `docs/Checklist-Servidor-OnPrem.md`

## Modelo operacional oficial

O projeto deve ser entendido em tres camadas:

1. sistema
2. perfil operacional
3. instalacao concreta

Regra consolidada:

1. o sistema e unico e mora no repositorio;
2. os perfis oficiais sao `development`, `cloud-homolog` e `internal-production`;
3. um host piloto local e um servidor definitivo sao instalacoes diferentes do mesmo perfil `internal-production`.

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

### `cloud-homolog`

Uso:

1. homologacao remota no Google Cloud;
2. validacao real de Cloud Run, Cloud SQL e storage montado;
3. ensaio de deploy por imagem antes da producao.

Arquivos canonicos:

1. `env/examples/cloud-homolog.env.example`
2. `env/examples/cloud-homolog.ops.env.example`
3. `.env.cloud-homolog`
4. `.env.cloud-homolog.ops`
5. `docs/Homologacao-Google-Cloud.md`
6. `scripts/gcp/README.md`

### `internal-production`

Uso:

1. operacao interna real;
2. piloto local persistente;
3. servidor definitivo.

Arquivos canonicos:

1. `env/examples/internal-production.env.example`
2. `env/examples/internal-production.ops.env.example`
3. `.env.internal-production`
4. `.env.internal-production.ops`
5. `compose/internal-production.yml`

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

6. rodar backup quando necessario:

```bash
scripts/runtime/backup.sh development
```

## Fluxo canonico de internal-production

1. copiar envs:

```bash
cp env/examples/internal-production.env.example .env.internal-production
cp env/examples/internal-production.ops.env.example .env.internal-production.ops
```

2. validar ambiente:

```bash
scripts/runtime/preflight.sh internal-production
```

3. subir stack:

```bash
scripts/runtime/compose.sh internal-production up -d --build
```

4. aplicar migrations e seed inicial:

```bash
scripts/runtime/migrate.sh internal-production
scripts/runtime/seed.sh internal-production
```

5. validar aplicacao:

```bash
scripts/runtime/smoke.sh internal-production
```

6. executar backup operacional:

```bash
scripts/runtime/backup.sh internal-production
```

## Fluxo canonico de cloud-homolog

1. copiar envs:

```bash
cp env/examples/cloud-homolog.env.example .env.cloud-homolog
cp env/examples/cloud-homolog.ops.env.example .env.cloud-homolog.ops
```

2. validar contexto:

```bash
scripts/gcp/preflight.sh
```

3. publicar imagem:

```bash
scripts/gcp/build-image.sh
```

4. implantar servico e jobs:

```bash
scripts/gcp/deploy-cloud-homolog.sh
```

5. executar migrations e seed:

```bash
scripts/gcp/execute-job.sh migrate
scripts/gcp/execute-job.sh seed
```

6. validar aplicacao:

```bash
scripts/gcp/smoke.sh
```

## Scripts canonicos

1. `scripts/runtime/compose.sh`
   Wrapper oficial do Docker Compose por ambiente.
2. `scripts/runtime/migrate.sh`
   Aplica `prisma migrate deploy`.
3. `scripts/runtime/seed.sh`
   Cria o bootstrap inicial quando necessario.
4. `scripts/runtime/preflight.sh`
   Valida comandos, envs e consistencia minima.
5. `scripts/runtime/smoke.sh`
   Executa smoke test operacional.
6. `scripts/runtime/backup.sh`
   Executa ciclo canonico de backup.
7. `scripts/gcp/preflight.sh`
   Valida envs, auth e recursos basicos da homologacao Google Cloud.
8. `scripts/gcp/build-image.sh`
   Publica a imagem no Artifact Registry via Cloud Build.
9. `scripts/gcp/deploy-cloud-homolog.sh`
   Implanta o servico Cloud Run e os jobs de migration/seed.
10. `scripts/gcp/execute-job.sh`
    Executa os jobs `migrate` e `seed`.
11. `scripts/gcp/smoke.sh`
    Executa smoke test HTTP contra a URL de homologacao.

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

### Storage e backup

1. `UPLOADS_DIR` ou `UPLOADS_HOST_DIR`
2. `BACKUP_ROOT`
3. `POSTGRES_DATA_DIR`
4. `EMAIL_OUTBOX_HOST_DIR`

### Ops env de `internal-production`

1. `SMOKE_USERNAME`
2. `SMOKE_PASSWORD`
3. `API_BASE_URL`

### Ops env de `cloud-homolog`

1. `GCLOUD_PROJECT_ID`
2. `GCLOUD_REGION`
3. `GCLOUD_ARTIFACT_REGISTRY_REPOSITORY`
4. `GCLOUD_IMAGE_NAME`
5. `GCLOUD_IMAGE_TAG`
6. `GCLOUD_CLOUD_RUN_SERVICE`
7. `GCLOUD_CLOUD_RUN_MIGRATE_JOB`
8. `GCLOUD_CLOUD_RUN_SEED_JOB`
9. `GCLOUD_SERVICE_ACCOUNT`
10. `GCLOUD_CLOUD_SQL_INSTANCE_CONNECTION_NAME`
11. `GCLOUD_STORAGE_BUCKET`
12. `GCLOUD_SECRET_DATABASE_URL`
13. `GCLOUD_SECRET_AUTH_SECRET`
14. `GCLOUD_SECRET_BOOTSTRAP_ADMIN_*`
15. `SMOKE_USERNAME`
16. `SMOKE_PASSWORD`
17. `API_BASE_URL`

## Politicas operacionais

### Cookie de sessao

`SESSION_COOKIE_SECURE` suporta:

1. `false`
   recomendado para piloto LAN em HTTP interno;
2. `auto`
   ativa `Secure` quando a request chega como HTTPS;
3. `true`
   forca `Secure` em qualquer request.

Em `cloud-homolog`, o valor canonico e `auto`.

### Email

1. `development` usa `outbox` por padrao.
2. `cloud-homolog` usa `outbox` por padrao.
3. `internal-production` usa `smtp` por padrao.
4. `internal-production` aceita `outbox` apenas como fallback operacional temporario.

### Uploads

1. o runtime oficial usa `MAX_UPLOAD_SIZE_BYTES=8388608` por padrao;
2. cada imagem acima de `8 MiB` deve ser rejeitada com erro `413`;
3. em `cloud-homolog`, `UPLOADS_DIR` e `EMAIL_OUTBOX_DIR` devem apontar para o bucket montado em `/mnt/runtime`.

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
3. `internal-production` publica o banco apenas em `127.0.0.1:${INTERNAL_PRODUCTION_DB_PORT}`;
4. `cloud-homolog` deve validar `database`, `uploads` e `emailOutbox` no readiness;
5. logs e backups devem ficar fora do repositorio.

## Backup e restore

1. O backup canonico e `scripts/runtime/backup.sh`.
2. Em `internal-production`, o modo padrao de banco e `compose-db`, sem depender de `pg_dump` no host.
3. Uploads, banco, outbox e backups devem viver em paths persistentes fora do repositorio.
4. O repositorio nao possui wrapper canonico dedicado para restore nesta data.
5. Quando houver necessidade de restore, o procedimento deve ser executado manualmente pelo operador com base nos artefatos gerados pelo ciclo de backup.
6. Em `cloud-homolog`, o backup do banco deve usar os mecanismos gerenciados do `Cloud SQL`, nao os wrappers locais.

## Artefatos legados e compatibilidade

Os arquivos abaixo continuam no repositorio por compatibilidade, mas nao sao o caminho oficial:

1. `docker-compose.yml`
2. `docker-compose.prod.yml`
3. `.env.example`
4. `.env.prod.example`
5. `.env.homolog.example`
6. `ops/compose/docker-compose.homolog.override.example.yml`
7. `ops/nginx/rastreio.public.conf.example`

Regra:

1. legado pode ajudar migracoes locais;
2. legado nao pode redefinir o fluxo canonico.
