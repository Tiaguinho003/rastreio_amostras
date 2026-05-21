---
name: prisma
description: Use this skill when working with the database, Prisma schema, migrations, seed, or any data model changes.
---

## Stack de dados

- Prisma (ver versao em `package.json`) + PostgreSQL (ver imagem em `compose/development.yml`)
- Schema em `prisma/schema.prisma`
- Client singleton em `src/db/prisma-client.js`
- Seed em `prisma/seed.js`, configurado via `prisma.config.ts` (bootstrap admin via env vars `BOOTSTRAP_ADMIN_*`)

## Models principais

- **Sample** — snapshot atual da amostra (status, classificacao, comercial). `internalLotNumber` (UNIQUE) e gerado em `getNextInternalLotNumber` em `src/samples/sample-query-service.js` no formato **numerico puro** (ex: `5641`). Sequencia global iniciada em `initialSequence=5640` (proxima = `5641`). Antes da Fase P1 era `A-####` (ex: `A-5562`). **Fase Q.final**: `SampleStatus` enum tem apenas 3 valores — `REGISTRATION_CONFIRMED`, `CLASSIFIED`, `INVALIDATED`. Os 5 statuses legacy (`PHYSICAL_RECEIVED`, `REGISTRATION_IN_PROGRESS`, `QR_PENDING_PRINT`, `QR_PRINTED`, `CLASSIFICATION_IN_PROGRESS`) foram dropados do enum no Postgres em `20260508163528_qfinal_drop_legacy_enums`. Sample termina em `REGISTRATION_CONFIRMED` ate ser classificado. **Liga A1**: flag `isBlend` (default false) — Sample com `isBlend=true` e uma liga formada de outras amostras (ver `docs/Liga-Plano-de-Trabalho.md`). Em liga, `declaredOwner`, `declaredOriginLot` e `ownerClientId` podem ser null (semantica documentada via docstrings Prisma no schema). Composicao real fica em `SampleBlendComponent`.
- **SampleBlendComponent** — composicao da liga (Liga A1 / `docs/Liga-Plano-de-Trabalho.md`). Cada registro vincula uma liga (`sampleId`, com `isBlend=true`) a uma amostra de origem (`originSampleId`, pode ser liga ou amostra normal) + `contributedSacks` (Int). UNIQUE em `(sampleId, originSampleId)` — uma origem so aparece 1 vez por liga. Indices em ambos os FKs pra rastreabilidade nas 2 direcoes. Apos `BLEND_REVERTED`, registros sao **preservados como historico** (Liga F8.3 — composicao continua visivel no detalhe da liga revertida). **Liga A2**: `SampleQueryService.loadBlendTree(rootSampleId)` (primeira CTE recursiva do projeto) carrega arvore inteira de descendentes; `findActiveBlendsContainingOrigin(originSampleId)` lista ligas ativas que usam a amostra. Usado por createBlend (validacoes F7.7), createSampleMovement (cascata recursiva F7.4 + F7.5), invalidateSample (bloqueio F7.2/F7.D). **Liga B4**: `getBlendFeasibility` (viabilidade quantitativa da venda — embrulha `loadBlendTree`, marca origens sem saldo suficiente), `loadBlendCascadeMovements` (resolve os movimentos de uma cascata percorrendo `sample_event.causation_id` via CTE recursiva) e `loadMovementCreationEvent` (acha o evento criador de um movimento — `causationId != null` indica movimento cascateado, base do guard).
- **SampleEvent** — timeline append-only (event types definidos em `enum SampleEventType` no schema). Funcao `fn_prevent_sample_event_mutation` + triggers `trg_sample_event_prevent_update`/`trg_sample_event_prevent_delete` impedem mutacao. **Fase Q.print**: `QR_PRINT_REQUESTED`, `QR_PRINTED` e `QR_PRINT_FAILED` sao **audit-only** (`fromStatus: null`, `toStatus: null` — nao mutam status nem version do sample). **Fase Q.final**: enum `SampleEventType` perdeu 5 valores legacy (`SAMPLE_RECEIVED`, `REGISTRATION_STARTED`, `QR_REPRINT_REQUESTED`, `CLASSIFICATION_STARTED`, `CLASSIFICATION_SAVED_PARTIAL`); enum `IdempotencyScope` perdeu `QR_REPRINT`. Eventos historicos com tipos legacy foram DELETADOS — unica excecao ao append-only, justificada por single cleanup migration. `MUTATING_EVENT_TYPES` em `event-contract-service.js`/`event-contract-db-service.js` lista exatamente quais events bumpam version + checam `expectedVersion` (consultar a constante e nao adivinhar). **Liga A1**: `BLEND_CREATED` e `BLEND_REVERTED` (audit-only, `fromStatus`/`toStatus` null) + escopos `BLEND_CREATE`/`BLEND_REVERT` no `IdempotencyScope`. Set `RECEIVED_CHANNELS` em `src/samples/sample-command-service.js:16` (validador de `receivedChannel` no payload `REGISTRATION_CONFIRMED`) ganhou `'internal'` para liga (gerada internamente, nao recebida).
- **SampleAttachment** — fotos (CLASSIFICATION_PHOTO). Unique por `(sampleId, kind)`.
- **PrintJob** — fonte da verdade do estado de impressao (status `PENDING`/`SUCCESS`/`FAILED`/`EXPIRED`). **Fase Q.print**: 1 PrintJob `PENDING` por sample no maximo (`requestQrPrint` retorna 409 se ja houver um PENDING). Lazy timeout de 60s em `expireStalePrintJobs` (`src/samples/sample-query-service.js`) marca jobs PENDING > 60s como `EXPIRED` antes de criar um novo OU antes do `getSampleDetail` retornar — sem worker/cron. **Fase Q.final**: enum `PrintAction` + coluna `print_job.print_action` foram dropados; constraint nova e `uq_print_job_sample_attempt(sample_id, attempt_number)`. Toda tentativa usa `attemptNumber` sequencial. **Fase Q.auto**: `completeClassification` dispara `requestQrPrint` best-effort no fim, com idempotencyKey derivada do evento de classificacao (`${event.idempotencyKey}:auto-print`). `requestQrPrint` faz pre-check de idempotency (antes do bloqueio de PENDING) — retry da operacao composta retorna idempotent em vez de cair em 409. `updateClassification` (reclassificacao CLASSIFIED→CLASSIFIED) **nao** dispara auto-print.
- **SampleMovement** — vendas e perdas parciais, com snapshot de buyer.
- **User** — conta com role, status, password hash (bcrypt), lockout.
- **UserSession** — sessao JWT com expiracao e revogacao.
- **Client** — PF/PJ. Identidade fiscal e endereco/IE de PJ ficam direto no Client (cnpj, cnpjOrder, cnpjRoot, registrationNumber, addressLine, etc.). PF guarda esses campos vazios e usa `ClientUnit` (filiais). Tem N usuarios comerciais via `ClientCommercialUser` (join). Invariante "Client ACTIVE tem >=1 entrada na join" e garantida no banco por 2 triggers DEFERRABLE INITIALLY DEFERRED (ver "Triggers / invariantes"). API REST mantem campo singular `commercialUser` derivado da primeira entrada da join (compat ate Fase 2 expor multi-user).
- **ClientCommercialUser** — join N:N entre Client e User. PK composta `(clientId, userId)`. Relacao plana (sem hierarquia/principal). Vinculos historicos sao registrados via `ClientAuditEvent` (a tabela mantem apenas vinculos ativos).
- **ClientUnit** — unidade operacional (filial) ligada a um Client. Pos-L5, **so PF** possui ClientUnits (PJ rejeita create/update/inactivate/reactivate de unit com 422 `CLIENT_PJ_HAS_NO_UNITS`). Cada unit pode ter `cnpj` (UNIQUE), `registrationNumber` (UNIQUE canonical), `addressLine`/`city`/`state`, `car` (Cadastro Ambiental Rural) e `name` (obrigatorio). `isPrimary`, `cnpjOrder`, `registrationType` foram **dropados** sob L5. **Fase 0**: invariante "PF nasce com >=1 unit" — `createClient` injeta uma fazenda placeholder (nome `Fazenda 1`, demais campos `NULL`) se o caller nao fornecer nenhuma. Helper: `ensureDefaultPfUnit` em `src/clients/client-support.js`. **Fase 0.1**: invariante "PF ACTIVE tem >=1 unit ACTIVE" — `inactivateUnit` rejeita 409 `PF_LAST_ACTIVE_UNIT` se for a unica ativa de um PF; `reactivateClient` auto-cria placeholder Fazenda 1 se PF reativado tiver 0 units ativas. Garantia so na camada de aplicacao (sem trigger no banco). **Fase R**: `Sample.ownerUnitId` e obrigatorio quando `ownerClientId` referencia PF — validado em `resolveOwnerBinding` (`src/clients/client-service.js`) com codigo `OWNER_UNIT_REQUIRED_FOR_PF`. PJ continua aceito sem unit (PJ nao tem ClientUnit).
- **UserAuditEvent** / **ClientAuditEvent** — audit trails append-only.
- **PasswordResetRequest** / **EmailChangeRequest** — fluxos de recuperacao.

## Convencoes do schema

- Models usam `@map("snake_case")` para nomes de tabela/coluna no banco.
- IDs sao UUID (`@db.Uuid`).
- Timestamps: `@db.Timestamptz(6)`, `@default(now())`, `@updatedAt`.
- Enums: UPPER_SNAKE_CASE no Prisma, mapeados para snake_case no banco quando necessario (`@map`).
- Delecao: sempre `onDelete: Restrict` (nunca CASCADE em delete).
- Indices nomeados com `@@index(...)` + `map:` explicito.

## Workflow de migrations

1. Editar `prisma/schema.prisma`
2. `npx prisma migrate dev --name descricao-curta` — gera migration + aplica em dev
3. `npm run prisma:generate` — regenera o client
4. `npm run typecheck && npm run build` — verificar que nada quebrou
5. Commitar migration + schema juntos
6. **NUNCA editar migrations ja existentes em `prisma/migrations/`**

## Drift check

- `npx prisma migrate diff --from-schema-datamodel prisma/schema.prisma --to-schema-datasource prisma/schema.prisma` — deve retornar vazio (exit 0)

## Seed

- `npm run db:seed` ou `npx prisma db seed`
- Cria admin bootstrap se nao existe nenhum user
- Idempotente (nao duplica)

## Reset local

```bash
npm run db:down          # para o container
npm run db:up            # sobe limpo
npm run prisma:migrate:deploy  # aplica migrations
npm run db:seed          # seed inicial
```

## Triggers / invariantes

- **Append-only do event store**: `fn_prevent_sample_event_mutation` + triggers `trg_sample_event_prevent_update`/`trg_sample_event_prevent_delete` impedem UPDATE/DELETE em `sample_event`. Toda migration que tocar em `sample_event` deve preservar esses triggers.
- **Append-only do client_audit_event**: `reject_client_audit_event_mutation` + triggers `trg_reject_client_audit_event_update`/`trg_reject_client_audit_event_delete` impedem UPDATE/DELETE. Pos-L5 (migration `20260430120000_l5_simplify_pj_and_rename_branch_to_unit/migration.sql` Bloco D) o escape valve historico `app.allow_audit_mutation='wizard_f51'` foi removido — append-only sem porta dos fundos. Referencia historica em `prisma/migrations/20260428230000_branch_audit_types_and_audit_escape_valve/migration.sql`.
- **PJ NAO admite ClientUnit** (L5): a validacao mora no service (`assertClientAcceptsUnits` em `client-service.js`) e nas rotas `POST/PATCH /clients/:id/units/...` retornam 422 `CLIENT_PJ_HAS_NO_UNITS`. Em PJ, dados fiscais (cnpj/registrationNumber) e endereco vivem direto em Client.
- **Client ACTIVE tem >=1 entrada na join** (R1.3): `fn_assert_client_has_commercial_user` + 2 triggers `CONSTRAINT TRIGGER ... DEFERRABLE INITIALLY DEFERRED`:
  - `trg_assert_client_has_commercial_user_on_link` — em `client_commercial_user` AFTER DELETE OR UPDATE
  - `trg_assert_client_has_commercial_user_on_status` — em `client` AFTER UPDATE OF status (apenas quando status passa para ACTIVE)
  - Como sao DEFERRED, swap (DELETE old + INSERT new) na mesma tx funciona; a checagem so corre no commit.

## Regras criticas

- Concorrencia otimista via `version` + `expectedVersion` em Sample. **Apenas eventos mutadores** (lista em `MUTATING_EVENT_TYPES` em `event-contract-service.js`) checam `expectedVersion`. Audit events (`QR_PRINT_REQUESTED`/`QR_PRINTED`/`QR_PRINT_FAILED`/`PHOTO_ADDED`/`REPORT_EXPORTED`/`CLASSIFICATION_EXTRACTION_*`/`BLEND_CREATED`/`BLEND_REVERTED`) ignoram.
- **Liga A2 — `appendEventBatch`** em `event-contract-db-service.js`: abraca N eventos numa unica `prisma.$transaction`. Refator extraiu helper privado `_processEventInTx` reusado por `appendEvent` (1 evento) e `appendEventBatch` (N eventos). Usado por createBlend (REGISTRATION_CONFIRMED + BLEND_CREATED), revertBlend (BLEND_REVERTED + SAMPLE_INVALIDATED) e pelas 3 cascatas de liga (Liga B4) — venda/perda (`_createBlendCascadeMovement`), cancelamento reverso (`_cancelBlendCascadeMovement`) e edição (`_updateBlendCascadeMovement`), cada uma 1 evento na raiz + N descendentes. Aceita `beforeCommit(tx)` callback opcional pra trabalho extra na mesma tx (createBlend usa pra inserir `sample_blend_component` rows + marcar `isBlend=true`). `buildEventEnvelope` ganhou param opcional `eventId` (necessario pra construir causation chain antes do batch).
- Idempotencia via `idempotencyScope` + `idempotencyKey` em SampleEvent.
