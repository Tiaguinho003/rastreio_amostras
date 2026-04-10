# Passe 6A — Relatorio de Auditoria de Testes e Cobertura

**Data:** 2026-04-10
**Executor:** Claude Code
**HEAD no inicio:** ea87094 (chore(contracts): remover campos warehouse legacy de REGISTRATION_CONFIRMED)
**Base do plano:** PLAN.md SS5 Passe 6, decisoes 2026-04-10

---

## 1. Inventario de testes

### 1.1 Arquivos de teste

| Arquivo                                    | Script npm                                     | Tipo           |  LoC | Tests | Status           |
| ------------------------------------------ | ---------------------------------------------- | -------------- | ---: | ----: | ---------------- |
| backend-api-auth-mode.test.js              | test:unit                                      | unit           |  118 |     3 | verde            |
| backend-api-v1-missing.integration.test.js | test:integration:db                            | integration-db | 2226 |    33 | skipped (sem DB) |
| client-backend.integration.test.js         | test:integration:db                            | integration-db |  529 |     8 | skipped (sem DB) |
| client-support.test.js                     | test:unit                                      | unit           |  152 |     8 | verde            |
| event-contract-db.integration.test.js      | test:integration:db                            | integration-db |  699 |    14 | skipped (sem DB) |
| event-contract.test.js                     | test:contracts                                 | contract       |  522 |    16 | verde            |
| local-auth.test.js                         | test:unit                                      | unit           |   87 |     4 | verde            |
| local-upload-service.test.js               | test:unit                                      | unit           |   71 |     3 | verde            |
| sample-backend-sprint1.integration.test.js | test:backend:integration + test:integration:db | integration-db |  741 |    11 | skipped (sem DB) |
| session-cookie-policy.test.js              | test:unit                                      | unit           |   63 |     4 | verde            |

**Totais:** 10 arquivos, 5207 LoC, 104 tests definidos, 38 executados localmente (verde), 66 skipped (DB).

### 1.2 Helpers

| Arquivo                         | LoC | Descricao                                                                                                                                                                |
| ------------------------------- | --: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| tests/helpers/event-builders.js | 457 | Builders puros de eventos (buildEvent, sampleReceivedEvent, registrationConfirmedEvent, etc.). Usado por event-contract.test.js e event-contract-db.integration.test.js. |

### 1.3 Descricao funcional por arquivo

- **backend-api-auth-mode** — Testa wiring de autenticacao no `createBackendApiV1`: rejeita request sem token (401), aceita Bearer header, aceita session cookie.
- **backend-api-v1-missing.integration** — Testa 33 endpoints v1 end-to-end via Prisma real + auth + upload + commandService. Cobre cenarios que estavam sem teste antes deste arquivo (criacao, sample lifecycle completo, exports, movimentos, clients via API).
- **client-backend.integration** — CRUD de clientes PF/PJ, registrations, lookup por owner/buyer, paginacao, audit trail, conflitos de documento e registration number duplicados (409).
- **client-support** — Normalizacao/validacao de inputs de cliente: displayName PF vs PJ, documento canonical, telefone invalido, PF->PJ switching, lookup constraints.
- **event-contract-db.integration** — Persistencia de eventos no Postgres: append + version increment, idempotency, owner binding projection, print job materialization, version conflict (409), transactional rollback, append-only enforcement (trigger impede UPDATE), terminal status (INVALIDATED bloqueia novos eventos), REPORT_EXPORTED sem mutar versao, QR REPRINT semantics, COMMERCIAL_STATUS_UPDATED, sale/loss lifecycle completo.
- **event-contract** — Contratos in-memory do EventContractService: rejeicao de schema invalido (422), aceitacao de payloads validos, idempotency, version conflict (409), status terminal, excecoes terminais (REPORT_EXPORTED apos CLASSIFIED), projecao de sale/loss/classification/commercial/reprint/extraction.
- **local-auth** — Emissao e verificacao de bearer token, senha invalida retorna 401, plaintext password rejeitado sem flag, plaintext aceito com `allowPlaintextPasswords: true`.
- **local-upload-service** — Parsing de MAX_UPLOAD_SIZE_BYTES (default + invalid), save abaixo do limite (verifica bytes em disco), rejeicao 413 acima do limite (verifica que diretorio nao foi criado).
- **sample-backend-sprint1.integration** — Lifecycle completo da amostra (sprint 1): recebimento, registration sem foto, phase1+phase2 flow end-to-end com read model, multi-event happy paths.
- **session-cookie-policy** — Resolucao de SESSION_COOKIE_SECURE (auto/true/false normalization), honra override explicito false mesmo com HTTPS, auto-detection via x-forwarded-proto, rejeicao de valores invalidos.

### 1.4 Cobertura de scripts

Todos os 10 arquivos de teste sao referenciados por pelo menos 1 script npm. Nenhum arquivo orfao.

**Observacao:** `sample-backend-sprint1.integration.test.js` e referenciado por DOIS scripts:

- `test:backend:integration` (explicitamente)
- `test:integration:db` (via glob `tests/**/*.integration.test.js`)

Quando o CI roda ambos os scripts, este arquivo executa duas vezes. Sugestao: remover `test:backend:integration` do package.json (o CI ja roda tudo via `test:integration:db`).

---

## 2. Testes orfaos

Grep executado em `tests/` para todos os simbolos de features removidas:

```
warehouseId | declaredWarehouse | WAREHOUSE_ | warehouses
arrival.*photo | ArrivalPhoto | ARRIVAL_PHOTO
ocr.*registration | OcrRegistration | OCR_REGISTRATION
MobileHeaderSearch | CameraTestPanel | SampleExportField
qrFailSchema | receiveSampleSchema
internal-production | dev:mobile
create-event-handler | create-local-auth-service
```

**Resultado: zero matches.**

Nenhuma referencia a features removidas existe em tests/. O cleanup de passes anteriores foi completo neste aspecto.

---

## 3. Baseline de cobertura

Ferramenta: c8 v11.0.0 (wrapper sobre node --test nativo)

### 3.1 Coverage por suite

| Suite          |    Lines | Statements | Functions | Branches | Tests executados |
| -------------- | -------: | ---------: | --------: | -------: | ---------------: |
| contracts      |   88.99% |     88.99% |      100% |   83.00% |               16 |
| unit           |   37.68% |     37.68% |    33.33% |   62.39% |               22 |
| backend-int    | 12.27%\* |   12.27%\* |      0%\* |   100%\* |         0 (skip) |
| integration:db |        - |          - |         - |        - |    nao executado |

\* `backend-int` mostra apenas cobertura de import-time (todos os testes pularam por falta de DATABASE_URL). Os numeros nao representam cobertura real.

### 3.2 Coverage combinado (contracts + unit)

| Metrica    | Porcentagem |
| ---------- | ----------: |
| Lines      |      43.00% |
| Statements |      43.00% |
| Functions  |      38.83% |
| Branches   |      68.23% |

**Tests executados no combinado:** 38 (16 contracts + 22 unit)

### 3.3 Cobertura por modulo (combinado contracts + unit)

| Modulo           |  Lines | Branches |  Funcs | Observacao                                                            |
| ---------------- | -----: | -------: | -----: | --------------------------------------------------------------------- |
| contracts/       | 97.56% |   88.23% |   100% | Bem coberto                                                           |
| events/ (in-mem) | 86.90% |   81.92% |   100% | Bem coberto (apenas EventContractService + InMemoryEventStore)        |
| auth/            | 85.47% |   70.52% | 95.65% | Razoavel. DatabaseAuthService nao testado (requer DB)                 |
| uploads/         | 84.80% |   65.21% | 85.71% | Razoavel                                                              |
| clients/         | 51.33% |   50.00% | 52.63% | Parcial — client-support.js testado, mas nao o ClientService (DB)     |
| api/             | 18.51% |   62.50% |  9.52% | **Baixo** — backend-api.js (1799 loc) quase sem cobertura sem DB      |
| users/           | 34.75% |   62.50% |  6.89% | **Baixo** — user-support.js parcialmente importado mas nao exercitado |

### 3.4 Suites nao executadas

- **integration:db**: porta 55432 ocupada por container antigo `rastreio-interno-amostras-db-1` (5 semanas, de um compose com nome antigo). Impede `npm run db:up`. O prompt autoriza pular nesta situacao.
- **backend-int (real)**: mesma razao (requer DB).

O CI (`.github/workflows/contracts.yml`) tem servico Postgres dedicado e roda TODAS as suites incluindo integration:db. A cobertura real e significativamente maior do que o baseline local.

---

## 4. Gaps em caminhos criticos

### 4.1 Event validator

- **Ponto de entrada:** `EventValidator.validate(event)` em `src/contracts/event-validator.js` (21 loc), que delega para `createAjvEventValidator` em `schema-loader.js` (54 loc).
- **Cobertura:** event-validator.js 100% lines, 83% branches. schema-loader.js 96% lines, 89% branches.
- `event-contract.test.js` cobre APPEND via `EventContractService.appendEvent()` que chama `validator.validate()` internamente.
- **Tipos de evento cobertos pelo contract test:** SAMPLE_RECEIVED, REGISTRATION_STARTED, REGISTRATION_CONFIRMED, QR_PRINT_REQUESTED, QR_PRINTED, QR_REPRINT_REQUESTED, PHOTO_ADDED, CLASSIFICATION_STARTED, CLASSIFICATION_COMPLETED, CLASSIFICATION_SAVED_PARTIAL, SALE_CREATED, SALE_UPDATED, LOSS_RECORDED, LOSS_CANCELLED, REPORT_EXPORTED, COMMERCIAL_STATUS_UPDATED, CLASSIFICATION_EXTRACTION_COMPLETED, CLASSIFICATION_EXTRACTION_FAILED.
- **Gap:** o invariante "validator so valida no APPEND, nunca no READ" (ADR-009) nao e testado diretamente. O read path (SampleQueryService) nunca chama EventValidator — correto, mas nao ha teste que garanta que isso continue assim.

### 4.2 State machine de SampleEvent

- **Nao ha modulo separado de state machine.** As transicoes sao implicitamente validadas dentro de `EventContractService.appendEvent()`:
  - Linha 119-129: se `fromStatus !== null`, verifica que `sample.status === event.fromStatus`.
  - Linha 107-117: mutating events requerem `expectedVersion`.
- **Cobertura:**
  - Version conflict: testado (409).
  - Terminal status (INVALIDATED bloqueia novos eventos): testado.
  - Terminal-extra exceptions (REPORT_EXPORTED apos CLASSIFIED, REPRINT apos PRINTED): testadas.
- **Gap:** nenhum teste para **transicao ilegal** generica (ex: `CLASSIFICATION_STARTED` quando status e `PHYSICAL_RECEIVED`). So o caso terminal e verificado.
- **Gap:** nenhum teste para idempotencia de transicao (enviar o mesmo evento com mesma idempotencyKey mas fromStatus diferente).

### 4.3 API v1 endpoints

- **73 metodos** em `createBackendApiV1` (`src/api/v1/backend-api.js`, 1799 loc).
- **Testes existentes:**
  - `backend-api-auth-mode.test.js`: 3 tests (auth wiring apenas para `listSamples`).
  - `backend-api-v1-missing.integration.test.js`: 33 tests (precisa DB, nao executado localmente).
- **Coverage:** 18.51% lines sem DB (wiring de import + 3 testes).
- **Gaps:**
  - Auth e testado apenas para `listSamples`. Os outros 72 endpoints nao tem teste de auth.
  - Nenhum teste de validacao de payload no nivel da API (validacao acontece no service layer).
  - O CI roda integration:db que cobre muito mais, mas a cobertura sem DB e muito baixa.

### 4.4 Autenticacao

- **Arquivos vivos:**
  - `local-auth-service.js` (156 loc): auth em memoria com bcrypt/JWT. **81% lines.**
  - `database-auth-service.js` (155 loc): auth contra Prisma/Users. **0% lines** (so testado via integration:db).
  - `token-service.js` (141 loc): emissao/verificacao JWT. **87% lines** (testado indiretamente via local-auth).
  - `session-cookie-policy.js` (63 loc): resolucao de Secure flag. **94% lines.**
  - `session-cookie.js` (33 loc): parse/serialize de cookie. **83% lines.**
  - `roles.js` (18 loc): enum de roles + assertRoleAllowed. **78% lines.**
- **`local-auth.test.js` cobre:** hash, verify, criacao, login, senha errada (401), plaintext reject/allow.
- **Gaps:**
  - User nao encontrado (username inexistente).
  - Token expirado.
  - `DatabaseAuthService` (0% cobertura sem DB).

### 4.5 Autorizacao / roles

- **Arquivo:** `src/auth/roles.js` (18 loc).
- **Funcoes:** `USER_ROLES` (enum), `assertRoleAllowed` (verifica role contra lista), `isKnownRole`.
- **Uso:** `assertRoleAllowed` e chamado em 2 pontos de `sample-command-service.js`.
- **Testes:** **ZERO.** Nenhum teste direto para `assertRoleAllowed` ou matriz role x endpoint.
- **Coverage:** 78% lines (importado mas parcialmente exercitado via unit tests que importam o modulo).
- **GAP CRITICO** para o Passe 7 (Security). Sem teste, nao ha garantia de que mudancas futuras em roles ou endpoints mantenham o enforcement.

### 4.6 Schemas Zod / Ajv nos endpoints v1

- **Zod:** usado SOMENTE em `lib/form-schemas.ts` (validacao client-side em formularios React). Nenhum uso de Zod em `src/api/`.
- **Validacao server-side:**
  - Event payloads: Ajv via event-validator (testado em contracts).
  - Client inputs: normalizer functions em `client-support.js` que lançam erro (testado em unit).
  - Outros endpoints: validacao ad-hoc em `backend-api.js` ou delegada ao command service.
- **Gap:** nao existe validacao de body no nivel do endpoint (route handler). Payloads invalidos propagam ate o service layer antes de serem rejeitados. Funcional, mas nao ideal para error messages consistentes.

---

## 5. Coerencia schema (features removidas)

### 5.1 Validacao pelo validate:schemas

O script `scripts/validate-schemas.js` carrega e compila todos os 53 schemas (incluindo `registration-confirmed.payload.schema.json`). Se o schema tiver erro sintatico ou referencia quebrada, falha. **Status: verde (53 schemas compilam).**

### 5.2 Verificacao empirica de rejeicao

Executei validacao direta via `EventValidator`:

| Payload                                                 | Resultado                            |
| ------------------------------------------------------- | ------------------------------------ |
| `{ sampleLotNumber, declared, warehouseId: 'x' }`       | **REJEITADO** (additionalProperties) |
| `{ sampleLotNumber, declared, declaredWarehouse: 'y' }` | **REJEITADO** (additionalProperties) |

O schema `registration-confirmed.payload.schema.json` tem `"additionalProperties": false`, o que garante a rejeicao de qualquer campo nao listado em `properties`.

### 5.3 Teste dedicado de rejeicao

**Nao existe** teste em `event-contract.test.js` (ou em qualquer outro arquivo) que explicitamente verifique que payloads de REGISTRATION_CONFIRMED com `warehouseId` ou `declaredWarehouse` sao rejeitados.

**Este e o gap #1 para o 6B** — Flavio ja decidiu que o unico teste de nao-regressao necessario e exatamente este (nivel de schema, nao nivel de endpoint).

---

## 6. Meta-observacoes

### 6.1 npm test vs CI

- `npm test` = `validate:schemas && test:contracts && test:unit` (38 tests).
- CI (`.github/workflows/contracts.yml`) = validate:schemas + lint + format:check + typecheck + build + test:contracts + test:unit + **test:integration:db** (muito mais abrangente).
- CI tem servico Postgres dedicado (postgres:16, porta 5432) e roda migrations automaticamente.
- `test:backend:integration` **nao e executado no CI** — redundante com `test:integration:db`.

### 6.2 Script duplicado

`sample-backend-sprint1.integration.test.js` aparece em:

- `test:backend:integration` (explicitamente)
- `test:integration:db` (via glob `tests/**/*.integration.test.js`)

No CI, so `test:integration:db` roda. Localmente, se alguem rodar ambos, o arquivo executa 2x.

### 6.3 Tipagem do client-backend.integration

`client-backend.integration.test.js` e capturado pelo glob `*.integration.test.js` no script `test:integration:db`. Ele **realmente precisa de DB** — usa `PrismaClient` com TRUNCATE no `beforeEach`.

### 6.4 Fixtures e helpers

- `tests/helpers/event-builders.js` (457 loc): builders puros, sem referencia a features removidas. Exporta 15 funcoes builder cobrindo todos os event types usados em testes.

### 6.5 .git-blame-ignore-revs

SHA `02239c71f09cd7993211f8f12bd7955e06d8bab8` e valido e resolve corretamente (git rev-parse OK). Corresponde ao commit `chore(format): introduz Prettier 3 + baseline format pass` do Passe 4B.

### 6.6 Conflito de porta do docker

Container antigo `rastreio-interno-amostras-db-1` (postgres:15.8-alpine, 5 semanas, de compose com nome antigo) ocupa porta 55432. O compose atual (`rastreio-development`) tenta usar a mesma porta e falha. Tambem existe um container `rastreio-internal-production-*` rodando (internal-production foi feature removida). Limpeza desses containers e recomendada.

---

## 7. Proposta de escopo para o Passe 6B

| #   | Acao                                               | Motivo                                                                                   | Arquivo(s)                                            | Risco | Custo |
| --- | -------------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------- | ----- | ----- |
| 1   | Teste de rejeicao schema warehouse                 | Nao-regressao para campos removidos no ea87094. Unico teste de feature removida acordado | tests/event-contract.test.js                          | Baixo | XS    |
| 2   | Teste de transicao ilegal de status                | Invariante critica do event sourcing nao coberta                                         | tests/event-contract.test.js                          | Baixo | XS    |
| 3   | Teste direto de assertRoleAllowed                  | Zero cobertura para autorizacao; prerequisito do Passe 7 Security                        | tests/roles.test.js (novo) + package.json (test:unit) | Baixo | XS    |
| 4   | Eliminar script test:backend:integration duplicado | Duplica execucao de sample-backend-sprint1 e nao e usado no CI                           | package.json                                          | Baixo | XS    |
| 5   | Expandir tests de auth                             | Cobrir user inexistente, token expirado                                                  | tests/local-auth.test.js                              | Baixo | S     |
| 6   | Resolver conflito de porta docker                  | Container antigo bloqueia npm run db:up                                                  | cleanup manual (docker rm + docker volume rm)         | Baixo | XS    |

### Itens que NAO entram no 6B (por decisao)

- Meta numerica de cobertura (decisao travada).
- Migracao para vitest/jest (decisao travada).
- Testes 404 para endpoints removidos (decisao travada — router nao os expoe).
- Teste de DatabaseAuthService (requer DB; ja coberto pelo CI via integration:db).
- Coverage step no CI (adiado para apos ver baseline — decidir no 6B se vale).

---

## 8. Invariantes sugeridas para o PLAN.md pos-Passe 6B

Apos o 6B, os seguintes invariantes devem ser verificaveis em cada deploy critico:

1. `npm run test` passa (validate:schemas + test:contracts + test:unit).
2. Schema `registration-confirmed.payload.schema.json` rejeita payloads com campos legacy (`warehouseId`, `declaredWarehouse`).
3. Nenhuma referencia a features removidas existe em `tests/`.
4. `assertRoleAllowed` tem cobertura direta com pelo menos 1 teste de allow + 1 teste de deny.
5. `event-contract.test.js` tem pelo menos 1 teste de transicao ilegal de status (alem do terminal).
6. CI (contracts.yml) continua rodando integration:db com Postgres.
