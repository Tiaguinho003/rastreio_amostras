# Runbook de Operacao v1

Status: Ativo  
Data: 2026-03-04  
Projeto: Rastreio Interno de Amostras

## 1. Objetivo

Definir operacao minima para disponibilidade, diagnostico e resposta inicial a incidente.

## 2. Endpoints operacionais

1. Healthcheck: `GET /api/health`
2. API principal: `/api/v1/*`

Verificacao manual:

```bash
curl -i http://localhost:3000/api/health
```

## 3. Logs e correlacao

1. Sempre enviar `x-request-id` nas chamadas HTTP de clientes internos/gateways.
2. Em incidentes, localizar erro pelo `requestId` e cruzar com horario.
3. Centralizar logs no host (ex.: `/var/log/rastreio/*.log`).

## 4. Rotacao de logs

Arquivo base:
1. `ops/logrotate/rastreio`

Teste de configuracao:

```bash
logrotate -d ops/logrotate/rastreio
```

## 5. Alertas minimos recomendados

1. Healthcheck fora do ar por mais de 2 minutos.
2. Banco indisponivel.
3. Taxa de erro 5xx acima do limiar definido pela operacao.
4. Disco abaixo de 20% livre.

## 6. Procedimento rapido de incidente

1. Confirmar status do app (`/api/health`).
2. Confirmar status do DB (`pg_isready`).
3. Inspecionar logs do app.
4. Rodar smoke test para validar fluxo minimo.
5. Se necessario, executar rollback conforme runbook de deploy.

## 7. Comandos uteis

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs --tail=200 app
docker compose -f docker-compose.prod.yml logs --tail=200 db

SMOKE_USERNAME="..." SMOKE_PASSWORD="..." scripts/ops/smoke-test.sh
```
