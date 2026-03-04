# Contract Validation Guide

Este guia explica como usar a validacao de contrato de eventos (Ajv), a persistencia real em PostgreSQL via Prisma e os testes de CI.

## Arquivos principais

- `src/contracts/schema-loader.js`: carrega e compila os JSON Schemas
- `src/contracts/event-validator.js`: valida um evento e retorna `422` em caso de schema invalido
- `src/events/event-contract-service.js`: implementacao em memoria (referencia de contrato)
- `src/events/event-contract-db-service.js`: implementacao transacional para PostgreSQL
- `src/events/prisma-event-store.js`: repositorio Prisma e operacoes de lock/idempotencia
- `src/samples/sample-command-service.js`: comandos de negocio para fase 1/fase 2
- `src/samples/sample-query-service.js`: leitura para lista/detalhe/dashboard
- `src/auth/local-auth-service.js`: login local e token Bearer (MVP)
- `src/uploads/local-upload-service.js`: persistencia local de fotos
- `src/api/v1/backend-api.js`: handlers API v1 framework-agnosticos para front
- `prisma/schema.prisma`: modelo relacional oficial
- `prisma/migrations/20260227170000_init/migration.sql`: DDL inicial com constraints/triggers
- `src/api/create-event-handler.js`: handler agnostico para integrar em rotas API
- `tests/event-contract.test.js`: testes de contrato
- `tests/event-contract-db.integration.test.js`: testes de integracao com DB real
- `tests/sample-backend-sprint1.integration.test.js`: fluxo backend Sprint 1 (comando/leitura/upload)
- `.github/workflows/contracts.yml`: pipeline CI

## Comandos

- `npm run validate:schemas`
- `npm run prisma:generate`
- `npm run prisma:migrate:deploy`
- `npm run test:contracts`
- `npm run test:unit`
- `npm run test:backend:integration`
- `npm run test:integration:db`
- `npm test`

## Variavel de ambiente

- `DATABASE_URL` (PostgreSQL), ex.:
- `postgresql://postgres:postgres@localhost:5432/rastreio_test?schema=public`
- `AUTH_SECRET` (token local auth, minimo 16 chars)
- `AUTH_HEADER_FALLBACK_ENABLED` (default: `true` em dev/teste, `false` em producao)
- `LOCAL_AUTH_ALLOW_PLAINTEXT_PASSWORDS` (default: `true` em dev/teste, `false` em producao)
- `LOCAL_AUTH_USERS_JSON` (usuarios locais em JSON)
- `UPLOADS_DIR` (diretorio local de fotos no MVP)

## Exemplo de uso (route handler em memoria)

```js
import { InMemoryEventStore } from '../src/events/in-memory-event-store.js';
import { EventContractService } from '../src/events/event-contract-service.js';
import { createEventHandler } from '../src/api/create-event-handler.js';

const store = new InMemoryEventStore();
const service = new EventContractService({ store });

export async function POST(request) {
  const body = await request.json();
  const result = await createEventHandler({ eventService: service, body });
  return Response.json(result.body, { status: result.status });
}
```

## Exemplo de uso (route handler com PostgreSQL)

```js
import { createPrismaEventService } from '../src/events/create-prisma-event-service.js';
import { createEventHandler } from '../src/api/create-event-handler.js';

const service = createPrismaEventService();

export async function POST(request) {
  const body = await request.json();
  const result = await createEventHandler({ eventService: service, body });
  return Response.json(result.body, { status: result.status });
}
```

## Regras garantidas por implementacao

- Evento invalido -> `422`
- Conflito de versao (`expectedVersion`) -> `409`
- Idempotencia por `(sampleId, idempotencyScope, idempotencyKey)`
- Unicidade de tentativa de impressao por `(sampleId, printAction, attemptNumber)`
- Atomicidade: se falhar no meio da operacao, rollback completo
- `sample_event` append-only (trigger bloqueia update/delete)
- `internal_lot_number` imutavel apos definido
- `INVALIDATED` terminal no snapshot da amostra
- `print_job` atualizado automaticamente por `QR_*REQUESTED`, `QR_PRINT_FAILED` e `QR_PRINTED`
