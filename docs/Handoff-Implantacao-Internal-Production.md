# Handoff de Implantacao - Internal Production

Status: Ativo  
Escopo: roteiro de entrega para quem tem shell real no host de destino

## 1. Objetivo

Este documento existe para permitir que um operador do servidor:

1. copie o sistema para o host de destino
2. configure os arquivos locais corretos
3. suba a stack canonicamente
4. valide a instalacao sem depender do host piloto atual

Este handoff assume:

1. um unico repositorio
2. perfil operacional `internal-production`
3. implantacao paralela e isolada no host
4. sem interferir em outro sistema ja existente no servidor

## 2. O que copiar para o servidor

Copiar apenas o conteudo versionado do projeto.

Deve ir:

1. `app/`
2. `components/`
3. `compose/`
4. `docs/`
5. `env/examples/`
6. `lib/`
7. `ops/`
8. `prisma/`
9. `public/`
10. `scripts/`
11. `src/`
12. `tests/` se o servidor tambem for usado para validacao
13. `Dockerfile`
14. `next.config.mjs`
15. `package.json`
16. `package-lock.json`
17. `tsconfig.json`
18. demais arquivos versionados necessarios para build

Nao deve ir:

1. `node_modules/`
2. `.next/`
3. `.env*` locais do host piloto
4. uploads reais do piloto
5. backups reais do piloto
6. outbox real do piloto
7. qualquer referencia a WSL, `portproxy` ou firewall do Windows

## 3. Estrutura recomendada no host do servidor

Exemplo recomendado para instalacao paralela:

1. `/srv/rastreio/internal-production/app`
2. `/srv/rastreio/internal-production/postgres`
3. `/srv/rastreio/internal-production/uploads`
4. `/srv/rastreio/internal-production/email-outbox`
5. `/srv/rastreio/internal-production/backups`

Regras:

1. a pasta da aplicacao deve ser separada de qualquer outro sistema ja existente
2. uploads, banco, outbox e backups devem ficar fora do repositorio
3. nao reutilizar paths de outro sistema do servidor

## 4. Arquivos locais que o operador deve criar

Na pasta do projeto copiada para o servidor:

1. `.env.internal-production`
2. `.env.internal-production.ops`

Base inicial:

1. `env/examples/internal-production.env.example`
2. `env/examples/internal-production.ops.env.example`

## 5. Variaveis que precisam de valor real no servidor

### Runtime principal (`.env.internal-production`)

Obrigatorias:

1. `APP_PORT`
2. `APP_BASE_URL`
3. `INTERNAL_PRODUCTION_DB_HOST`
4. `INTERNAL_PRODUCTION_DB_PORT`
5. `POSTGRES_USER`
6. `POSTGRES_PASSWORD`
7. `POSTGRES_DB`
8. `POSTGRES_DATA_DIR`
9. `UPLOADS_HOST_DIR`
10. `EMAIL_OUTBOX_HOST_DIR`
11. `BACKUP_ROOT`
12. `AUTH_SECRET`
13. `SESSION_COOKIE_SECURE`
14. `BOOTSTRAP_ADMIN_FULL_NAME`
15. `BOOTSTRAP_ADMIN_USERNAME`
16. `BOOTSTRAP_ADMIN_EMAIL`
17. `BOOTSTRAP_ADMIN_PASSWORD`
18. `EMAIL_TRANSPORT`

Condicionais:

1. `SMTP_HOST`
2. `SMTP_PORT`
3. `SMTP_SECURE`
4. `SMTP_USER`
5. `SMTP_PASS`
6. `SMTP_FROM`

### Overlay operacional (`.env.internal-production.ops`)

Obrigatorias:

1. `API_BASE_URL`
2. `SMOKE_USERNAME`
3. `SMOKE_PASSWORD`

## 6. Regras de isolamento no servidor

Antes de subir qualquer coisa, o operador deve validar:

1. `APP_PORT` nao colide com outro sistema
2. `INTERNAL_PRODUCTION_DB_PORT` nao colide com outro banco/container
3. `POSTGRES_DATA_DIR`, `UPLOADS_HOST_DIR`, `EMAIL_OUTBOX_HOST_DIR` e `BACKUP_ROOT` sao exclusivos deste projeto
4. nao existe outro compose usando o mesmo nome de projeto `rastreio-internal-production`

Regra operacional:

1. nenhuma acao desta implantacao deve tocar containers, volumes, paths ou portas do sistema ja existente no host

## 7. Sequencia oficial de implantacao

No host do servidor, dentro da pasta do projeto:

### 7.1. Validar o ambiente

```bash
bash scripts/runtime/preflight.sh internal-production
```

### 7.2. Subir a stack

```bash
bash scripts/runtime/compose.sh internal-production up -d --build
```

### 7.3. Aplicar migrations

```bash
bash scripts/runtime/migrate.sh internal-production
```

### 7.4. Executar seed inicial

```bash
bash scripts/runtime/seed.sh internal-production
```

### 7.5. Validar smoke test

```bash
bash scripts/runtime/smoke.sh internal-production
```

## 8. Validacoes obrigatorias apos a subida

### Estado da stack

```bash
bash scripts/runtime/compose.sh internal-production ps
```

### Health HTTP

```bash
curl -i "http://127.0.0.1:${APP_PORT}/api/health/live"
curl -i "http://127.0.0.1:${APP_PORT}/api/health/ready"
```

### Logs

```bash
bash scripts/runtime/compose.sh internal-production logs --tail=200 app
bash scripts/runtime/compose.sh internal-production logs --tail=200 db
```

### Conferencias operacionais minimas

1. login funcionando
2. sessao persistindo
3. upload funcionando
4. `ready` com `200`
5. smoke passando

## 9. Backup e operacao

Procedimento canonico de backup:

```bash
bash scripts/runtime/backup.sh internal-production
```

Esse comando executa:

1. backup de banco
2. backup de uploads
3. aplicacao da politica de retencao

Uploads:

```bash
set -a
source ./.env.internal-production
source ./.env.internal-production.ops
set +a

export UPLOADS_DIR="${UPLOADS_HOST_DIR}"
scripts/ops/backup-uploads.sh
```

Banco:

1. o caminho canonico de `internal-production` usa `scripts/runtime/backup.sh internal-production`
2. esse wrapper usa o servico `db` do Compose para gerar o dump do banco quando o host nao tiver `pg_dump`
3. o host ainda pode usar `pg_dump` diretamente se o operador quiser forcar `DB_BACKUP_MODE=host`
4. nao assumir qualquer solucao especifica do host piloto local

## 10. O que o operador nao deve replicar do host piloto

Nao transportar para o servidor real:

1. IPs do host piloto
2. paths do piloto em `/home/...`
3. qualquer referencia a Windows
4. qualquer referencia a WSL2
5. qualquer regra de `portproxy`
6. ajustes temporarios de permissao feitos apenas para o piloto

O que deve ser replicado:

1. o perfil `internal-production`
2. o compose canonico
3. os wrappers canonicos
4. os envs locais equivalentes do servidor
5. o fluxo de `preflight -> up -> migrate -> seed -> smoke`

## 11. Rollback minimo seguro

Se a stack nova falhar e ela estiver isolada corretamente:

1. parar apenas a stack deste projeto
2. nao executar comandos globais no host
3. nao tocar no outro sistema existente

Comando basico:

```bash
bash scripts/runtime/compose.sh internal-production down
```

Observacao:

1. rollback de dados exige procedimento proprio de banco/uploads
2. esse roteiro cobre apenas rollback minimo da aplicacao isolada

## 12. Resultado esperado do handoff

Se o operador seguir este documento corretamente:

1. a implantacao acontece em paralelo
2. o outro sistema do host nao e afetado
3. o caminho canonicamente suportado pelo projeto e usado
4. o host piloto local deixa de ser referencia operacional obrigatoria
