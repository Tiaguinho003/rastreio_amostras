# Pacote de Desbloqueio Homolog v1

Status: Ativo  
Data: 2026-03-04  
Projeto: Rastreio Interno de Amostras

## 1. Objetivo

Desbloquear a execucao do BKD-003 quando ainda nao existe acesso/informacoes do servidor de homolog/producao.

## 2. O que pedir para TI/Infra

1. Host e credenciais de acesso SSH ao ambiente de homolog.
2. Confirmacao de Docker e Docker Compose instalados.
3. Pastas persistentes:
4. `/srv/rastreio/homolog/uploads`
5. `/srv/rastreio/homolog/backups`
6. `/srv/rastreio/homolog/postgres`
7. Porta da aplicacao em homolog (default no projeto: `3001`).
8. Porta local do PostgreSQL em homolog (default no projeto: `55433`).
9. Politica de firewall para acesso interno.

## 3. Coleta rapida de informacoes do servidor (para TI executar)

No servidor de homolog, executar:

```bash
cd /caminho/do/projeto
scripts/ops/collect-server-facts.sh
```

Saida esperada:
1. Arquivo em `/tmp/rastreio-server-facts-YYYYMMDD-HHMMSS.txt`

Enviar esse arquivo para o time de aplicacao.

## 4. Preparacao do ambiente homolog (time de aplicacao)

1. Criar `.env.homolog` a partir de `.env.homolog.example`.
2. Criar override local:

```bash
cp ops/compose/docker-compose.homolog.override.example.yml /srv/rastreio/homolog/docker-compose.homolog.override.yml
```

3. Subir stack:

```bash
docker compose -f docker-compose.prod.yml -f /srv/rastreio/homolog/docker-compose.homolog.override.yml up -d --build
```

4. Aplicar migrations:

```bash
docker compose -f docker-compose.prod.yml -f /srv/rastreio/homolog/docker-compose.homolog.override.yml run --rm app npm run prisma:migrate:deploy
```

## 5. Preflight antes do drill BKD-003

```bash
ENV_FILE=.env.homolog scripts/ops/homolog-preflight.sh
```

Resultado esperado:
1. `Preflight PASSED`

## 6. Execucao BKD-003

```bash
set -a
source .env.homolog
set +a

DRILL_CONFIRM=yes scripts/ops/bkd003-restore-drill.sh
```

Evidencia gerada:
1. `docs/evidence/BKD-003-restore-homolog-YYYYMMDD-HHMMSS.md`

## 7. Criterio de sucesso

1. Drill executa sem erro.
2. Smoke test pos-restore aprovado.
3. Evidencia salva.
4. Atualizar backlog:
5. `BKD-003` para `DONE`.
