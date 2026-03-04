# Guia de Implantacao e Atualizacao em Producao v1

Status: Ativo  
Data: 2026-03-04  
Projeto: Rastreio Interno de Amostras

## 1. Objetivo

Este guia descreve o passo a passo completo para:
1. Publicar o sistema com seguranca em servidor fisico.
2. Fazer atualizacoes futuras usando Git/GitHub.
3. Executar rollback rapido em caso de problema.

## 2. Estrategia recomendada (resumo)

1. Desenvolvimento no seu computador.
2. Versionamento em GitHub (repositorio central).
3. Servidor faz deploy por `git fetch/checkout` de tag de release.
4. Aplicacao sobe via `docker compose`.
5. Validacao obrigatoria com healthcheck + smoke test.
6. Backup e monitoramento ativos antes de go-live.

## 3. Fase A - Preparacao no seu computador

## A.1. Garantir repositorio remoto no GitHub

No projeto local:

```bash
git remote -v
```

Se nao existir remoto:

```bash
git remote add origin <URL_DO_SEU_REPOSITORIO_GITHUB>
```

Publicar branch principal:

```bash
git push -u origin main
```

## A.2. Criar padrao de release por tag

Antes de cada deploy:

```bash
git tag -a v1.0.0 -m "Release v1.0.0"
git push origin v1.0.0
```

Regra:
1. Deploy em producao sempre por tag.
2. Nunca deploy direto de codigo sem tag.

## A.3. Validacao obrigatoria antes de publicar

```bash
npm ci
npm run typecheck
npm run build
npm test
npm run test:integration:db
```

## 4. Fase B - Preparacao do servidor (primeira vez)

## B.1. Coletar informacoes do host

No servidor:

```bash
scripts/ops/collect-server-facts.sh
```

Guardar saida para auditoria.

## B.2. Preencher checklist de servidor

Arquivo:
1. `docs/Checklist-Servidor-OnPrem.md`

Sem checklist preenchido, nao avancar para producao.

## B.3. Estrutura recomendada no servidor

Pastas:
1. `/srv/rastreio/producao/app`
2. `/srv/rastreio/producao/uploads`
3. `/srv/rastreio/producao/backups`
4. `/srv/rastreio/producao/postgres`

## B.4. Clonar projeto no servidor

```bash
cd /srv/rastreio/producao
git clone <URL_DO_REPOSITORIO_GITHUB> app
cd app
```

## B.5. Configurar ambiente de producao

Criar arquivo `.env.prod` a partir de `.env.homolog.example` ou `.env.example`, com valores reais.

Campos criticos:
1. `DATABASE_URL`
2. `AUTH_SECRET`
3. `LOCAL_AUTH_USERS_JSON` com `passwordHash`
4. `AUTH_HEADER_FALLBACK_ENABLED=false`
5. `LOCAL_AUTH_ALLOW_PLAINTEXT_PASSWORDS=false`
6. `UPLOADS_DIR` e `BACKUP_ROOT`

Permissao recomendada:

```bash
chmod 600 .env.prod
```

## B.6. Criar override de producao para bind mounts

Criar arquivo local no servidor:
1. `/srv/rastreio/producao/docker-compose.prod.override.yml`

Conteudo sugerido:

```yaml
services:
  db:
    ports:
      - "127.0.0.1:5432:5432"
    volumes:
      - /srv/rastreio/producao/postgres:/var/lib/postgresql/data

  app:
    ports:
      - "3000:3000"
    volumes:
      - /srv/rastreio/producao/uploads:/var/lib/rastreio/uploads
```

## 5. Fase C - Primeiro deploy em producao

## C.1. Selecionar release por tag

```bash
git fetch --all --tags
git checkout v1.0.0
```

## C.2. Subir stack

```bash
set -a
source .env.prod
set +a

docker compose -f docker-compose.prod.yml -f /srv/rastreio/producao/docker-compose.prod.override.yml up -d --build
```

## C.3. Aplicar migrations

```bash
docker compose -f docker-compose.prod.yml -f /srv/rastreio/producao/docker-compose.prod.override.yml run --rm app npm run prisma:migrate:deploy
```

## C.4. Validar aplicacao

Healthcheck:

```bash
curl -i http://localhost:3000/api/health
```

Smoke test:

```bash
API_BASE_URL=http://localhost:3000 SMOKE_USERNAME="<usuario>" SMOKE_PASSWORD="<senha>" scripts/ops/smoke-test.sh
```

Logs:

```bash
docker compose -f docker-compose.prod.yml -f /srv/rastreio/producao/docker-compose.prod.override.yml logs --tail=200 app
```

## 6. Fase D - Backup e operacao obrigatoria

## D.1. Configurar backup automatico

Usar:
1. `ops/systemd/rastreio-backup.service`
2. `ops/systemd/rastreio-backup.timer`

Comandos:

```bash
sudo cp ops/systemd/rastreio-backup.service /etc/systemd/system/
sudo cp ops/systemd/rastreio-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now rastreio-backup.timer
sudo systemctl list-timers | grep rastreio-backup
```

## D.2. Configurar rotacao de logs

```bash
sudo cp ops/logrotate/rastreio /etc/logrotate.d/rastreio
sudo logrotate -d /etc/logrotate.d/rastreio
```

## D.3. Validar restore periodicamente

Executar o drill:

```bash
DRILL_CONFIRM=yes scripts/ops/bkd003-restore-drill.sh
```

## 7. Fase E - Atualizacoes futuras (Git/GitHub)

Resposta para sua pergunta: sim, voce consegue atualizar o servidor via GitHub.

Fluxo recomendado de atualizacao:

1. No seu computador:
2. fazer alteracoes.
3. validar testes.
4. `git commit`.
5. `git push`.
6. criar tag de release e publicar.

7. No servidor:
8. `git fetch --all --tags`
9. `git checkout <tag_nova>`
10. carregar `.env.prod`
11. `docker compose ... up -d --build`
12. `docker compose ... run --rm app npm run prisma:migrate:deploy`
13. rodar smoke test.

Comandos no servidor:

```bash
cd /srv/rastreio/producao/app
git fetch --all --tags
git checkout v1.0.1

set -a
source .env.prod
set +a

docker compose -f docker-compose.prod.yml -f /srv/rastreio/producao/docker-compose.prod.override.yml up -d --build
docker compose -f docker-compose.prod.yml -f /srv/rastreio/producao/docker-compose.prod.override.yml run --rm app npm run prisma:migrate:deploy
API_BASE_URL=http://localhost:3000 SMOKE_USERNAME="<usuario>" SMOKE_PASSWORD="<senha>" scripts/ops/smoke-test.sh
```

## 8. Fase F - Rollback seguro

Se der problema apos deploy:

1. Voltar para tag anterior.
2. Subir novamente stack.
3. Revalidar com smoke test.

Exemplo:

```bash
cd /srv/rastreio/producao/app
git checkout v1.0.0

set -a
source .env.prod
set +a

docker compose -f docker-compose.prod.yml -f /srv/rastreio/producao/docker-compose.prod.override.yml up -d --build
API_BASE_URL=http://localhost:3000 SMOKE_USERNAME="<usuario>" SMOKE_PASSWORD="<senha>" scripts/ops/smoke-test.sh
```

## 9. Regras de seguranca para nao quebrar producao

1. Nunca editar codigo diretamente no servidor.
2. Nunca deploy sem tag publicada.
3. Nunca rodar restore sem confirmacao e backup valido.
4. Nunca deixar `AUTH_HEADER_FALLBACK_ENABLED=true` em producao.
5. Nunca deixar `LOCAL_AUTH_ALLOW_PLAINTEXT_PASSWORDS=true` em producao.
6. Sempre validar healthcheck + smoke test apos deploy.

## 10. Definicao de pronto para go-live

1. BKD-003 concluido com evidencia.
2. BKE-003 concluido com alertas reais.
3. BKF-003 checklist homolog aprovado.
4. BKF-004 aprovacao formal de go-live.
