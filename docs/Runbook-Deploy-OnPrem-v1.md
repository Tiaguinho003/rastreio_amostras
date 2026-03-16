# Runbook Deploy On-Prem v1

Status: Ativo  
Data: 2026-03-04  
Projeto: Rastreio Interno de Amostras

## Nota de uso atual

Este documento permanece como referencia historica.

Para a trilha canonica principal de implantacao/operacao, usar:

1. `docs/Runtime-Canonical-Guide.md`
2. `docs/Handoff-Implantacao-Internal-Production.md`

Guia completo de implantacao e atualizacao:
1. `docs/Guia-Implantacao-e-Atualizacao-Producao-v1.md`

## 1. Pre-deploy (obrigatorio)

1. Checklist de servidor preenchido:
2. `docs/Checklist-Servidor-OnPrem.md`
3. Variaveis obrigatorias definidas no host:
4. `DATABASE_URL`
5. `AUTH_SECRET`
6. `BOOTSTRAP_ADMIN_*`
7. `EMAIL_TRANSPORT` + `SMTP_*` (quando `smtp`)
8. `UPLOADS_DIR`

## 2. Validacao local/homolog antes do deploy

```bash
npm ci
npm run prisma:generate
npm run prisma:migrate:deploy
npm run typecheck
npm run build
npm test
npm run test:integration:db
```

Para desbloqueio de homolog sem informacoes de infra:
1. `docs/Pacote-Desbloqueio-Homolog-v1.md`
2. `scripts/ops/collect-server-facts.sh`
3. `scripts/ops/homolog-preflight.sh`

## 3. Deploy com Docker Compose

```bash
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml ps
```

Para homolog (recomendado), usar override com bind mounts:

```bash
cp ops/compose/docker-compose.homolog.override.example.yml /srv/rastreio/homolog/docker-compose.homolog.override.yml
docker compose -f docker-compose.prod.yml -f /srv/rastreio/homolog/docker-compose.homolog.override.yml up -d --build
```

## 4. Pos-deploy imediato

1. Validar healthcheck:

```bash
curl -i http://localhost:3000/api/health/ready
```

2. Rodar smoke test:

```bash
SMOKE_USERNAME="..." SMOKE_PASSWORD="..." scripts/ops/smoke-test.sh
```

3. Verificar logs:

```bash
docker compose -f docker-compose.prod.yml logs --tail=200 app
```

## 5. Rollback

Rollback de aplicacao:

```bash
docker compose -f docker-compose.prod.yml down
docker image ls | grep rastreio-interno-amostras
# subir novamente com imagem/tag anterior validada
```

Rollback de dados (apenas com aprovacao):
1. Restaurar backup DB.
2. Restaurar backup uploads.
3. Reexecutar smoke test.

## 6. Gate final de go-live

1. Smoke test aprovado.
2. Healthcheck estavel.
3. Backup agendado ativo.
4. Alertas ativos.
5. Aprovacao formal de Infra + Aplicacao.
