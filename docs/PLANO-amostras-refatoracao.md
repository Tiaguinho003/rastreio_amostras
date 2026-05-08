# Plano: Refatoração do registro e classificação de amostras

> Documento vivo. Atualizado conforme avançamos na análise e execução.
> Iniciado em 2026-05-07.

## Objetivo

Reformular a lógica de **registro** e **classificação** de amostras:

- Simplificar o fluxo de registro e eliminar gargalos.
- Unificar as 3 fichas de classificação (`BICA`, `PREPARADO`, `LOW_CAFF`) em uma **ficha única**.
- Manter rastreabilidade completa via event store (append-only).

## Status geral

- [x] **Etapa 1** — Mapeamento do estado atual
  - [x] 1.1. Caminhos de registro de amostra
  - [x] 1.2. Caminhos de classificação (mapeado em 2026-05-07)
- [x] **Etapa 2** — Identificação de gargalos (consolidada na Fase Q)
- [ ] **Etapa 3** — Definição do plano de execução
  - [x] Fase 0 — Pré-requisito: PF sempre com ≥1 fazenda (definida + executada)
  - [x] Fase 0.1 — Defesa em profundidade da invariante PF ≥1 unit ACTIVE (definida + executada)
  - [x] Fase R — Refatoração do registro com filial obrigatória pra PF (definida + executada)
  - [ ] Fase D — Layout desktop do `/samples/new` (iterativa, em andamento)
  - [x] Fase P — Remove impressão do registro + lote numérico puro (definida + executada parcial: commits 1-4 + skill; commit #5 absorvido pela Fase Q)
  - [x] Fase Q — Lifecycle simplificado + impressão como ação + auto-print pós-classificação (definida; Fase Pb absorvida; Fase C original incorporada como Q.cls.2)
- [ ] **Etapa 4** — Execução
  - [x] Fase 0 (executada — commit `44fd144`)
  - [x] Fase 0.1 (executada — commit `d6f5d24`)
  - [x] Fase R (executada — commits `6d96aa7` + `62e54d7`)
  - [ ] Fase D (em andamento, sem prazo)
  - [x] Fase P (executada parcial — commits `0ae5a03`, `c4fb126`, `78b0621`, `9bd28f6` + skill prisma)
  - [ ] Fase Q (em andamento)
    - [x] Q registro (commits `6761a54` + `0b7c45f`)
    - [x] Q.cls.1 lifecycle classificação (commits `79385bc` + `d02eb73`)
    - [ ] Q.cls.2 ficha unificada (parcial — ficha física `a79626e`, CTA "Classificar" `f505926`, tela da câmera `e37deaa`, IA `864f619`, modal de revisão `a39e305`, modal de tipo `8dbe36f`, avisos 3a/3b + modo manual `983ccc3`, modais de cross-validation/reclassify/classifier `9411ffe`, payload ficha unificada + reason persistido + sub-caminho 5 Flow B `aa7c591`+`1aa4845`+`a2c7594`+`40d91e4`; restam tipo selecionado depois → `CLASSIFICATION_UPDATED` audit, cleanup do `TYPE_CONFIGS`, migration)
    - [ ] Q.print impressão como ação
    - [ ] Q.auto auto-print pós-classificação
    - [ ] Q.final migration de drop dos enums legados

---

## 1. Estado atual

### 1.1. Registro de amostra

#### 1.1.1. Visão geral

Hoje **só existe um caminho real** de registro: a tela `/samples/new`, que internamente orquestra uma **máquina de estados de 4 passos** sobre o event store. Não há import por planilha, nem job, nem caminho admin alternativo.

Os 4 passos podem ser disparados **isolados** via endpoints REST (uso manual ou retry), ou orquestrados de uma vez pela UI via `POST /api/v1/samples/create`.

#### 1.1.2. Entry points

| Entry point                         | Arquivo                                                           | Cria evento(s)           | Observação                                                                                                     |
| ----------------------------------- | ----------------------------------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------- |
| **UI form** (única tela do usuário) | `src/app/samples/new/page.tsx`                                    | 4 (todo o fluxo)         | Modal multi-step, gera QR client-side, faz polling de impressão (timeout 30s)                                  |
| **API orquestrada**                 | `src/app/api/v1/samples/create/route.ts`                          | 4                        | Endpoint que a UI chama; internamente roda os 4 passos com retries automáticos (até 12x em conflito de status) |
| **API passo 1**                     | `src/app/api/v1/samples/receive/route.ts`                         | `SAMPLE_RECEIVED`        | Pode ser chamado isolado                                                                                       |
| **API passo 2**                     | `src/app/api/v1/samples/[sampleId]/registration/start/route.ts`   | `REGISTRATION_STARTED`   | Pode ser chamado isolado                                                                                       |
| **API passo 3**                     | `src/app/api/v1/samples/[sampleId]/registration/confirm/route.ts` | `REGISTRATION_CONFIRMED` | Gera `internalLotNumber` (formato `A-####`); retry até 5x em colisão de unicidade                              |
| **API passo 4**                     | `src/app/api/v1/samples/[sampleId]/qr/print/request/route.ts`     | `QR_PRINT_REQUESTED`     | Cria `PrintJob` PENDING; print agent (Elgin L42 Pro) faz polling separado                                      |

> **Importante**: a tela do scanner (`src/app/camera/page.tsx`) **não cria amostra** — só resolve QR existente para a página de detalhe.

#### 1.1.3. Máquina de estados (lifecycle)

```
[null]
  ↓ SAMPLE_RECEIVED
PHYSICAL_RECEIVED
  ↓ REGISTRATION_STARTED
REGISTRATION_IN_PROGRESS
  ↓ REGISTRATION_CONFIRMED  ← gera A-####
REGISTRATION_CONFIRMED
  ↓ QR_PRINT_REQUESTED      ← cria PrintJob
QR_PENDING_PRINT
  ↓ QR_PRINTED              ← print agent (assíncrono)
QR_PRINTED
  → (depois) CLASSIFICATION_IN_PROGRESS → CLASSIFIED
  → (a qualquer hora) INVALIDATED (terminal)
```

A lógica de transição vive em `src/samples/sample-command-service.js`:

- `receiveSample()` — linhas 1459-1477
- `startRegistration()` — linhas 1647-1669
- `confirmRegistration()` — linhas 1803-1862
- `requestQrPrint()` — linhas 1862-1889

#### 1.1.4. Campos no registro

| Campo                          | Obrigatório | Origem   | Notas                                                                   |
| ------------------------------ | ----------- | -------- | ----------------------------------------------------------------------- |
| `owner`                        | sim         | usuário  | Texto livre OU lookup estruturado de cliente                            |
| `ownerClientId`, `ownerUnitId` | não         | usuário  | Se PJ, vincula a `Client` + `ClientUnit` (CNPJ); PJ exige unidade ativa |
| `sacks`                        | sim         | usuário  | Inteiro ≥ 1                                                             |
| `harvest`                      | sim         | usuário  | Texto livre (ex: "25/26")                                               |
| `originLot`                    | não         | usuário  | Máx 100 chars                                                           |
| `location`                     | não         | usuário  | Máx 30 chars                                                            |
| `notes`                        | não         | usuário  | Máx 500 chars                                                           |
| `receivedChannel`              | não         | usuário  | Enum: `in_person` (default) \| `courier` \| `driver` \| `other`         |
| `printerId`                    | não         | usuário  | Selecionado da lista de impressoras disponíveis                         |
| `clientDraftId`                | sim         | UI       | UUID gerado pela tela; chave de idempotência cross-retry                |
| `internalLotNumber`            | —           | servidor | Auto: `A-####`, único, gerado em `confirmRegistration`                  |
| `sampleId`                     | —           | servidor | UUID                                                                    |
| `commercialStatus`             | —           | servidor | `OPEN` (default no registro)                                            |

Schema Zod do form: `lib/form-schemas.ts:47-66` (`createSampleDraftSchema`).

#### 1.1.5. Eventos gerados (event store)

5 tipos durante o fluxo de registro+impressão. Todos passam pelo `sample-event-factory.buildEventEnvelope()` (linhas 39-86) e são apendados via `eventService.appendEvent()`. Tabela `SampleEvent`, append-only, com triggers do Postgres bloqueando UPDATE/DELETE.

| Evento                            | Quando                   | `idempotencyScope`                                                    |
| --------------------------------- | ------------------------ | --------------------------------------------------------------------- |
| `SAMPLE_RECEIVED`                 | passo 1                  | (nenhum — pode duplicar)                                              |
| `REGISTRATION_STARTED`            | passo 2                  | (nenhum)                                                              |
| `REGISTRATION_CONFIRMED`          | passo 3                  | `REGISTRATION_CONFIRM` + `draft:{clientDraftId}:registration-confirm` |
| `QR_PRINT_REQUESTED`              | passo 4                  | `QR_PRINT` + key derivada                                             |
| `QR_PRINTED` ou `QR_PRINT_FAILED` | print agent (assíncrono) | —                                                                     |

#### 1.1.6. Autorização

- Roles autorizadas: `ADMIN`, `CLASSIFIER`, `REGISTRATION`, `COMMERCIAL` (via `USER_ACTION_ROLES`).
- Auth: cookie `session_token` ou `Authorization: Bearer` (resolvido em `authenticateAuthorizationHeader`).
- Bloqueio adicional: usuários com senha pendente não conseguem agir até aceitar/redefinir.

#### 1.1.7. Idempotência e retry

- **Client-side**: `clientDraftId` em `sessionStorage` sobrevive a refresh; usuário pode reclicar "Criar amostra".
- **Server-side**: `IdempotencyRecord` por `(scope, key)`; segundo evento na mesma chave é dedup.
- **Auto-retry no orquestrador**: até 12x em conflito de status (passos 1→4); até 5x em colisão de `internalLotNumber`.

#### 1.1.8. Side effects assíncronos

- Geração do PNG do QR: client-side (`QRCodeSVG` de `qrcode.react`).
- Impressão: `PrintJob` PENDING vira `QR_PRINTED`/`QR_PRINT_FAILED` quando o agente local (Elgin L42 Pro) processa. Registro **não bloqueia** a impressão (UI só faz polling pra UX).

#### 1.1.9. Caminhos que **não existem** hoje (gaps confirmados)

- Bulk import (CSV/Excel/planilha) — não há.
- Job/worker que cria amostra — não há.
- Path admin-only diferenciado — não há.
- Edição/correção de amostra após `REGISTRATION_CONFIRMED` — não há (event store append-only).
- Backfill histórico (planilha pré-sistema A-4908..A-5561) — pendente, registrado em memória do projeto.

#### 1.1.10. Detalhamento campo a campo (A → B → C)

> Esta subseção organiza tudo do registro em três blocos para análise sequencial:
> **A** = o que o usuário preenche; **B** = o que o servidor gera; **C** = tudo que persiste no banco.

##### A. O que o usuário preenche em `/samples/new`

Schema oficial: `lib/form-schemas.ts:47-66` (`createSampleDraftSchema`).

| Campo             | Obrigatório | Tipo / regra                                                    | Notas                                                             |
| ----------------- | ----------- | --------------------------------------------------------------- | ----------------------------------------------------------------- |
| `owner`           | **sim**     | texto, ≥ 1 char                                                 | Pode virar `ownerClientId + ownerUnitId` se o lookup PJ for usado |
| `sacks`           | **sim**     | inteiro ≥ 1                                                     | Quantas sacas vieram                                              |
| `harvest`         | **sim**     | texto, ≥ 1 char                                                 | Safra (ex: "25/26")                                               |
| `originLot`       | não         | texto, máx 100                                                  | Lote de origem (cliente)                                          |
| `location`        | não         | texto, máx 30                                                   | Local físico onde a amostra está                                  |
| `notes`           | não         | texto, máx 500                                                  | Observações                                                       |
| `receivedChannel` | não         | enum: `in_person` (default) \| `courier` \| `driver` \| `other` | Como chegou                                                       |
| `printerId`       | não         | texto, máx 120                                                  | Qual impressora usar                                              |

Adicionalmente a UI envia (não é digitado pelo usuário):

- `clientDraftId` (UUID em `sessionStorage`) — chave de idempotência cross-retry.

##### B. O que o servidor gera automaticamente

| Campo                          | Quando                | Notas                                                                                                   |
| ------------------------------ | --------------------- | ------------------------------------------------------------------------------------------------------- |
| `sampleId` (UUID)              | passo 1               | Pode vir do client ou ser auto-gerado                                                                   |
| `status`                       | a cada passo          | `PHYSICAL_RECEIVED` → `REGISTRATION_IN_PROGRESS` → `REGISTRATION_CONFIRMED` → `QR_PENDING_PRINT`        |
| `internalLotNumber`            | passo 3               | Formato `A-####`, sequência única, retry até 5x se colidir                                              |
| `commercialStatus`             | criação               | `OPEN` (default)                                                                                        |
| `version`, `lastEventSequence` | a cada evento         | Optimistic locking                                                                                      |
| `soldSacks`, `lostSacks`       | criação               | Zero (preenchidos por movements depois)                                                                 |
| `createdAt`, `updatedAt`       | criação / cada update | timestamptz                                                                                             |
| Auditoria do evento            | cada evento           | `requestId`, `correlationId`, `causationId`, `actorUserId`, `metadataIp`, `metadataUserAgent`, `source` |

##### C. Tudo que é persistido no banco

###### C.1. Tabela `sample` (`prisma/schema.prisma:194-245`)

Os 5 campos digitados viram `declared_*` na tabela (prefixo "declared" porque é o que o usuário **declarou** no recebimento — depois a classificação confirma ou contesta):

| Coluna                                                                                | Origem                | Preenchido no registro?                 |
| ------------------------------------------------------------------------------------- | --------------------- | --------------------------------------- |
| `id`                                                                                  | servidor              | sim                                     |
| `internal_lot_number`                                                                 | servidor (passo 3)    | sim                                     |
| `status`                                                                              | servidor              | sim (vai mudando)                       |
| `commercial_status`                                                                   | default `OPEN`        | sim                                     |
| `version`, `last_event_sequence`                                                      | servidor              | sim                                     |
| `owner_client_id`, `owner_unit_id`                                                    | usuário (lookup PJ)   | sim, se PJ                              |
| `declared_owner`                                                                      | usuário (`owner`)     | sim                                     |
| `declared_sacks`                                                                      | usuário (`sacks`)     | sim                                     |
| `declared_harvest`                                                                    | usuário (`harvest`)   | sim                                     |
| `declared_origin_lot`                                                                 | usuário (`originLot`) | sim                                     |
| `declared_location`                                                                   | usuário (`location`)  | sim                                     |
| `classification_type`                                                                 | —                     | **não** (definido só na classificação)  |
| `sold_sacks`, `lost_sacks`                                                            | default 0             | sim (zero)                              |
| `latest_classification_*`, `classification_draft_*`, `latest_type/screen/density/...` | —                     | **não** (populados só na classificação) |
| `classified_at`                                                                       | —                     | **não**                                 |
| `created_at`, `updated_at`                                                            | servidor              | sim                                     |

> **`notes` e `printerId` não viram colunas do `sample`** — ficam apenas no payload dos eventos (passos 1, 2 e 4).

###### C.2. Tabela `sample_event` — 4 eventos no fluxo de registro+impressão

Cada evento grava em `sample_event` (`prisma/schema.prisma:247-279`), append-only com triggers do Postgres bloqueando UPDATE/DELETE.

Colunas comuns a todos os eventos:
`event_id`, `sample_id`, `sequence_number`, `event_type`, `schema_version`, `occurred_at`, `actor_type`, `actor_user_id`, `source`, `payload (JSON)`, `request_id`, `correlation_id`, `causation_id`, `idempotency_scope`, `idempotency_key`, `from_status`, `to_status`, `metadata_module`, `metadata_ip`, `metadata_user_agent`, `created_at`.

| Evento                   | Payload (JSON)                                                                                              | Idempotência                                                          |
| ------------------------ | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `SAMPLE_RECEIVED`        | `{ receivedChannel, notes }`                                                                                | nenhuma                                                               |
| `REGISTRATION_STARTED`   | `{ notes }`                                                                                                 | nenhuma                                                               |
| `REGISTRATION_CONFIRMED` | `{ sampleLotNumber, declared: { owner, sacks, harvest, originLot, location }, ownerClientId, ownerUnitId }` | `REGISTRATION_CONFIRM` + `draft:{clientDraftId}:registration-confirm` |
| `QR_PRINT_REQUESTED`     | `{ printAction: 'PRINT', attemptNumber, printerId }`                                                        | `QR_PRINT` + key derivada                                             |

Depois (assíncrono, pelo print agent):

- `QR_PRINTED` ou `QR_PRINT_FAILED` — completa o ciclo.

###### C.3. Tabela `print_job` (`prisma/schema.prisma:298+`)

Criada no passo 4 (`QR_PRINT_REQUESTED`). Status inicial `PENDING`. O agente local (Elgin L42 Pro) faz polling, processa, atualiza para `PRINTED`/`FAILED` e dispara o evento correspondente.

###### C.4. O que **não** é criado no registro

- `sample_attachment` (fotos/anexos) — só na classificação.
- `sample_movement` (vendas/perdas) — só depois, em movements.

##### Resumo visual

```
Usuário digita: owner, sacks, harvest, originLot, location,
                notes, receivedChannel, printerId
                       │
                       ▼
       ┌───────────────────────────────┐
       │  Tabela `sample`              │
       │  ─ id, internalLotNumber      │ ← gerados pelo servidor
       │  ─ status, commercialStatus   │
       │  ─ declared_owner             │ ← owner
       │  ─ declared_sacks             │ ← sacks
       │  ─ declared_harvest           │ ← harvest
       │  ─ declared_origin_lot        │ ← originLot
       │  ─ declared_location          │ ← location
       │  ─ ownerClientId/UnitId       │ ← se PJ
       │  ─ campos de classificação    │ ← TODOS null no registro
       └───────────────────────────────┘
                       │
                       ▼
       ┌───────────────────────────────┐
       │  Tabela `sample_event` (4x)   │
       │  ─ payload tem `notes`        │
       │  ─ payload tem `printerId`    │
       │  ─ payload do passo 3 tem     │
       │    o "declared" snapshot      │
       └───────────────────────────────┘
                       │
                       ▼
       ┌───────────────────────────────┐
       │  Tabela `print_job`           │
       │  ─ PENDING → PRINTED/FAILED   │
       └───────────────────────────────┘
```

#### 1.1.11. Regra PF/PJ no cadastro de cliente (esclarecida)

> **Correção**: na seção 1.1.4 reportei _"PJ clients must have at least one active unit"_ — **isso estava errado**. O modelo é o oposto:
>
> | Tipo   | Filial (`ClientUnit`)                                          | Identidade fiscal       | Validação backend                                                                          |
> | ------ | -------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------ |
> | **PF** | 0..N (chamamos de "Fazenda")                                   | Fica em `ClientUnit`    | `name` obrigatório por unit; até 14.3.C, `cnpj` e `phone` da unit foram tornados opcionais |
> | **PJ** | **Sem filial** (backend bloqueia com `CLIENT_PJ_HAS_NO_UNITS`) | Fica em `Client` direto | `phone` obrigatório no Client                                                              |
>
> Filiais/sucursais de empresas PJ são tratadas como **clientes PJ separados** (cada CNPJ é um Client distinto) — não há hierarquia matriz/filial pós-L5.

**Campos pra fazenda PF ser "completa"** (`lib/clients/client-completeness.ts:28-36`):
`addressLine`, `district`, `city`, `state`, `postalCode`, `registrationNumber` (IE), `car`. (`cnpj` e `phone` foram retirados da lista em `14.3.C`).

**Decisão tomada nesta sessão**: PF nasce sempre com **pelo menos 1 fazenda**. Se o caller não fornecer nenhuma, o backend auto-cria `{ name: 'Fazenda 1' }` (placeholder) com demais campos `NULL` e status `ACTIVE`. A fazenda fica marcada como "incompleta" pelo `client-completeness` (UI mostra aviso). Detalhamento da implementação em §3 — Fase 0.

### 1.2. Classificação

#### 1.2.1. Status atuais (antes da Fase Q)

- `CLASSIFICATION_IN_PROGRESS` — alguém clicou "Iniciar classificação" e ainda não fechou.
- `CLASSIFIED` — classificação fechada (terminal "ok"). Reclassificação volta a `CLASSIFIED` (audit).

#### 1.2.2. Eventos atuais (antes da Fase Q)

- `CLASSIFICATION_STARTED` — transição RC/QR_PRINTED → CLASSIFICATION_IN_PROGRESS
- `CLASSIFICATION_SAVED_PARTIAL` — audit (null/null), salva rascunho — feature presente em UI mas nunca usada na operação
- `CLASSIFICATION_COMPLETED` — transição IP/QR_PRINTED → CLASSIFIED (com foto obrigatória)
- `CLASSIFICATION_UPDATED` — audit (CLASSIFIED → CLASSIFIED), reclassificação
- `CLASSIFICATION_EXTRACTION_COMPLETED` — audit, IA terminou de extrair dados da foto
- `CLASSIFICATION_EXTRACTION_FAILED` — audit, IA falhou

#### 1.2.3. Comandos atuais (antes da Fase Q)

| Comando                           | Pré-condição                     | Efeito                                                                                            |
| --------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------- |
| `startClassification`             | RC ou QR_PRINTED                 | Status → IP, emite `CLASSIFICATION_STARTED`                                                       |
| `saveClassificationPartial`       | RC, IP ou QR_PRINTED             | Audit, salva rascunho                                                                             |
| `completeClassification`          | RC, IP ou QR_PRINTED + foto      | Status → CLASSIFIED, emite `CLASSIFICATION_COMPLETED`                                             |
| `updateClassification`            | CLASSIFIED                       | Audit, reclassifica                                                                               |
| `confirmClassificationFromCamera` | RC, IP, QR_PRINTED ou CLASSIFIED | Chama `completeClassification` ou `updateClassification` por baixo, com validação cruzada de lote |

#### 1.2.4. UI

- Detail page de RC tem CTA "Iniciar classificação" → leva pra `/camera` com `sampleId` fixado.
- Detail page de IP tem formulário de classificação manual + botões "Salvar rascunho" + "Concluir".
- Detail page de CLASSIFIED tem opção de reclassificar.
- Câmera (`/camera`) lê foto, IA extrai lote/dados, valida cruzado contra `sampleId` fixado (caminho A do plano).

#### 1.2.5. 3 fichas (escopo da Fase C, futura)

3 fichas distintas por `ClassificationType` (`BICA`, `PREPARADO`, `LOW_CAFF`), config em `lib/classification-form.ts:161-282`. Extração via IA (GPT-4o-mini) com 3 prompts + 3 schemas + 3 normalizadoras em `src/samples/classification-extraction-service.js`. Layout unificado já desenhado e aprovado em PDF (Cat. estendida ao centro de P10, 2 FDs iguais, `=` centralizado).

---

## 2. Gargalos identificados

> A preencher após Etapa 1.

---

## 3. Plano de execução

### Fase 0 — Pré-requisito: PF sempre com pelo menos 1 fazenda

Mudança no cadastro de **cliente** (não da amostra) que destrava o próximo passo da refatoração do registro de amostra (seleção de filial após proprietário PF).

#### 0.1. Decisões fechadas

| #   | Decisão                                              | Escolha                                                                               |
| --- | ---------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 1   | Comportamento se caller passar `units: []` explícito | **Auto-criar Fazenda 1 silenciosamente** (trata `undefined` e `[]` como equivalentes) |
| 2   | Onde fica o código de injeção do default             | **Helper `ensureDefaultPfUnit` em `src/clients/client-support.js`**                   |
| 3   | Garantia da invariante "PF tem ≥1 unit"              | **Apenas camada de aplicação** (sem trigger no Postgres)                              |
| 4   | Nome da fazenda placeholder                          | `'Fazenda 1'`                                                                         |
| 5   | Migration de backfill                                | **Não necessária** (produção não tem PF órfão)                                        |

#### 0.2. Trabalho a fazer

**Backend** (núcleo)

- [x] `src/clients/client-support.js`: criar `ensureDefaultPfUnit(personType, units)` que retorna a lista com `{ name: 'Fazenda 1' }` se PF e lista vazia, ou a lista original caso contrário.
- [x] `src/clients/client-service.js` (`createClient`, ~linha 975): chamar o helper logo após `normalizeCreateClientInput`.
- [x] Constante `DEFAULT_PF_UNIT_NAME = 'Fazenda 1'` exportada do mesmo arquivo do helper.

**Schema/DB**

- [x] `prisma/schema.prisma:360-362`: adicionar linha no comentário do bloco PF/PJ documentando a invariante.
- [x] **Sem migration de dados** (confirmado: zero PF órfão em produção).

**Testes**

- [x] Atualizar casos existentes que criam PF sem units esperando `units.length === 0` (Q-01 + #5 Q-02 idempotency).
- [x] Novo (integration): PF criado sem units recebe Fazenda 1 (`code=1`, `status=ACTIVE`, demais campos `NULL`).
- [x] Novo (integration): PF criado com `units: []` explícito também recebe Fazenda 1.
- [x] Novo (integration): PF criado com units explícitas mantém só as fornecidas (sem duplicação).
- [x] Novo (integration): PJ continua sem unit (auto-create não se aplica).
- [x] Novo (integration): audit event `CLIENT_UNIT_CREATED` é emitido pra Fazenda 1 auto-criada.
- [x] Novo (unit puro em `tests/client-support.test.js`): 4 casos de `ensureDefaultPfUnit`.

**UI** (`components/clients/ClientQuickCreateModal.tsx`)

- [x] Sem alteração — modal já não envia `units` ao criar PF, auto-create dispara naturalmente no backend.
- [ ] (opcional, futuro) Mensagem de sucesso pode mencionar "Fazenda 1 criada como placeholder — complete os dados depois".

**Documentação**

- [x] Atualizar `docs/PLANO-amostras-refatoracao.md` (este doc).
- [x] Rever skill `.claude/skills/prisma/SKILL.md` (atualizada com a invariante).

**Quality gates** (todos verdes)

- [x] `npm run typecheck` ✅
- [x] `npm run lint` ✅
- [x] `npm run format:check` ✅
- [x] `npm run build` ✅
- [x] `npm run validate:schemas` ✅
- [x] `npm run test:contracts` ✅ (22/22)
- [x] `npm run test:unit` ✅ (171/171, inclui 4 novos do helper)
- [x] `npm run test:integration:db` ✅ (134/134, inclui 5 novos)

**Commit**

- [x] `44fd144 feat(clients): PF auto-cria Fazenda 1 placeholder ao criar cliente`
- [x] `4b718c5 docs(samples): plano vivo de refatoracao do registro+classificacao`

### Fase 0.1 — Defesa em profundidade: PF ACTIVE tem ≥1 unit ACTIVE

Executada em commit `d6f5d24`.

**Decisões:**

- `inactivateUnit`: rejeita 409 `PF_LAST_ACTIVE_UNIT` se for a única unit ACTIVE de um PF. Mensagem sugere `inactivateClientWithCascade` pra parar de usar o cliente inteiro.
- `reactivateClient`: se PF reativado tiver 0 units ACTIVE (dados pré-Fase 0 ou unit forçada a INACTIVE direto no DB), auto-cria placeholder `Fazenda 1` na mesma transação.
- UI (`app/clients/[clientId]/page.tsx` `translateUnitError`): captura código 409 e propaga mensagem em pt-BR.
- 5 testes integration novos cobrindo PF/PJ/cascades.

### Fase D — Layout desktop do `/samples/new`

Iterativa. Usuário vai pedir ajustes pontuais; cada um vira commit atômico. Acumulam até o próximo deploy.

**Constraints fechadas:**

| #   | Decisão                                                                                                     |
| --- | ----------------------------------------------------------------------------------------------------------- |
| 1   | **Escopo**: somente a tela `/samples/new`. Demais telas ficam para fases futuras.                           |
| 2   | **Mobile intacto**: cada ajuste usa media query ativando só em ≥1024px. PWA mobile fica idêntico.           |
| 3   | **Breakpoint desktop**: `min-width: 1024px` (laptop padrão).                                                |
| 4   | **Sem mudança de comportamento**: só layout/visual. Lógica/validação/fluxo dos commits anteriores não mexe. |

**Trabalho a fazer**: definido conforme cada solicitação. Sem lista pré-fechada.

### Fase R — Filial obrigatória no registro de amostra PF (executada)

Executada em commits `6d96aa7` (backend + tests + zod) e `62e54d7` (frontend).

**Backend:**

- `resolveOwnerBinding` rejeita 422 `OWNER_UNIT_REQUIRED_FOR_PF` se proprietário PF e `ownerUnitId` vazio.
- 3 testes integration novos + helper `createPfSellerClient`.
- `lib/form-schemas.ts`: `createSampleDraftSchema` ganha `ownerClientId` e `ownerUnitId` opcionais (validação cross-field no backend).

**Frontend:**

- Novo `components/samples/OwnerUnitField.tsx` com 4 estados (PF 1-unit auto-selecionada / PF 2+ dropdown / PJ disabled / sem cliente disabled), badge `<IncompleteIcon />` para fazendas incompletas, atalho "+ Nova fazenda" abre `ClientUnitModal` reutilizado.
- `ClientLookupField` em `/samples/new` opera em modo só-cliente (basta omitir `onSelectUnit` — `isHierarchical` já é auto-detectado).
- `app/samples/new/page.tsx`: integra novo componente, valida `ownerUnitId` obrigatório para PF no submit, substitui validação stale (linha 539) por defesa em profundidade `PF + 0 units ATIVAS`.
- Helper `isUnitComplete` extraído em `lib/clients/client-completeness.ts` (reuso pelo OwnerUnitField).
- Estilos `.owner-unit-field*` em `app/globals.css`.

### Fase P — Remove impressão do registro + lote numérico puro (executada parcial)

**Status**: commits 1-4 executados (`0ae5a03`, `c4fb126`, `78b0621`, `9bd28f6`) + skill prisma atualizada. **Commit #5** (detail page CTA "Iniciar classificação" em REGISTRATION_CONFIRMED) **absorvido pela Fase Q** (revisão completa da detail page como parte da simplificação de lifecycle).

**Motivação**: o QR na etiqueta foi pensado pro classificador escanear, mas a classificação hoje identifica o lote sozinha (foto da ficha + AI). Portanto a etiqueta no registro é desperdício. Nova lógica:

1. Funcionário recebe amostra → registra
2. Sistema gera lote numérico puro (ex: `5562`)
3. Modal mostra o lote em destaque após criar (`step='created'`)
4. **Funcionário anota o número à mão na saca**
5. Saca vai pra estante com o número visível
6. Classificador depois lê o número, classifica
7. Etiqueta com QR + dados completos é impressa **pós-classificação** (Fase Pb futura)

#### P.1. Decisões fechadas

| #   | Decisão                                   | Escolha                                                                                                                    |
| --- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 1   | Formato do lote                           | **Numérico puro** (`5562`, sem `A-`)                                                                                       |
| 2   | Print pré-classificação                   | **Permitir como override manual** (botão "Imprimir etiqueta" continua disponível em REGISTRATION_CONFIRMED na detail page) |
| 3   | Saída do step `created` no modal          | **Botão explícito "Ir para amostra"** (sem auto-redirect, força a anotação)                                                |
| 4   | Dashboard `printPending` durante a Fase P | **Esconder o card** (volta na Fase Pb)                                                                                     |
| 5   | `startClassification` precondição         | Aceita `REGISTRATION_CONFIRMED` E `QR_PRINTED` (compat com fluxo legado)                                                   |
| 6   | Backwards compat de dados                 | Não há (L3.2 wipe; prod tem 0 amostras). Sem migration de dados.                                                           |
| 7   | Renomear `createSampleAndPreparePrint`    | Sim, vira `createSample` (rename hard, único caller é o frontend)                                                          |
| 8   | Estados `QR_PENDING_PRINT`/`QR_PRINTED`   | **Ficam no enum** (usados em reprint e na futura Fase Pb)                                                                  |

#### P.2. Trabalho a fazer

**Backend — formato do lote**

- [ ] `src/samples/sample-query-service.js` `getNextInternalLotNumber()` (linhas 1922-1937):
  - `LIKE 'A-%'` → `~ '^[0-9]+$'`
  - Remove `replace('A-', '')`
  - Retorna `String(nextSequence)` (sem prefixo)
- [ ] `src/samples/classification-extraction-service.js` linhas 101, 208, 327:
  - Limpa exemplo `"A-5490"` dos prompts (deixa só `"5487"`)
- [ ] `print-agent/test-print.js:13-14`: atualiza fixture pra `'5562'`

**Backend — fluxo de criação**

- [ ] `src/samples/sample-command-service.js`:
  - Renomeia `createSampleAndPreparePrint` → `createSample`
  - Remove o passo final `requestQrPrint` (sample termina em `REGISTRATION_CONFIRMED`)
  - Não cria mais `PrintJob` no registro
  - Não emite `QR_PRINT_REQUESTED` no registro
  - `startClassification` (linha 2020): aceita `['REGISTRATION_CONFIRMED', 'QR_PRINTED']`
  - `requestQrPrint` (linha 1870): **mantém** aceitando `REGISTRATION_CONFIRMED` (decisão #2)
- [ ] `src/api/v1/backend-api.js`: ajusta `createSample` handler — response sem `print` payload, sem `qr` derivado de print
- [ ] `lib/api-client.ts:createSampleAndPreparePrint`: renomeia + ajusta tipos do response

**Backend — agrupamentos de status**

- [ ] `src/samples/sample-query-service.js`:
  - `PRINT_PENDING_STATUSES`: `['QR_PENDING_PRINT']` (remove REGISTRATION_CONFIRMED)
  - `CLASSIFICATION_PENDING_STATUSES`: adiciona `REGISTRATION_CONFIRMED`
  - Outros pickers/agregações que tocam esses arrays

**Frontend — modal de criação**

- [ ] `app/samples/new/page.tsx`:
  - Modal mantém 2 steps mas redefine `LabelModalStep`: `'review' | 'created'` (era `'review' | 'completed'`)
  - **Remove** estados: `printStatus`, `printPollingRef`, `printTimeoutRef`, `printExitWarningOpen`
  - **Remove** useEffects: polling de impressão, cleanup, timeout
  - **Remove** JSX: QR placeholder, QRCodeSVG, animação check, status messages, botões "Ver detalhes"/"Nova amostra" do completed, exit warning overlay
  - `step='created'` JSX **novo**: lote em destaque (font ~3rem, centralizado), texto "Anote este número na saca antes de seguir", botão único "Ir para amostra"
  - `handleConfirmDraft` após sucesso → seta `step='created'` (em vez de `step='completed'`)
  - Botão "Ir para amostra" → `router.push('/samples/' + sampleId)`
  - Tipos: response do `createSample` sem `qr`/`print`

**Frontend — detail page**

- [ ] `app/samples/[sampleId]/page.tsx`:
  - Status `REGISTRATION_CONFIRMED`: CTA principal vira "Iniciar classificação" (em vez de "Imprimir etiqueta")
  - Botão "Imprimir etiqueta" continua disponível em REGISTRATION_CONFIRMED (decisão #2 — manual override) mas como CTA secundário
  - Demais lugares que tratam REGISTRATION_CONFIRMED/QR_PENDING_PRINT como "aguardando print" — revisar texto/lógica

**Frontend — dashboard**

- [ ] `app/dashboard/page.tsx`: esconder o card `printPending` enquanto Fase Pb não existe
- [ ] (Talvez) garantir que samples REGISTRATION_CONFIRMED apareçam no card `classificationPending` (já agrupado pelo backend após mudança em CLASSIFICATION_PENDING_STATUSES)

**Tests**

- [ ] `tests/sample-backend-sprint1.integration.test.js`: vários testes esperam o fluxo de 4 passos. Atualizar pra esperar parar em REGISTRATION_CONFIRMED.
- [ ] Helpers `moveSampleToQrPendingPrint`, `moveSampleToQrPrinted` continuam (usados em testes que precisam desses estados pra reprint/legacy)
- [ ] Novos casos:
  - `createSample` retorna sample em REGISTRATION_CONFIRMED (sem print payload)
  - `getNextInternalLotNumber` retorna número puro
  - `startClassification` aceita REGISTRATION_CONFIRMED
  - `startClassification` continua aceitando QR_PRINTED (regressão)

**Docs/Skill**

- [ ] `docs/PLANO-amostras-refatoracao.md`: marca Fase P executada (ao fim)
- [ ] `.claude/skills/prisma/SKILL.md`: novo significado de REGISTRATION_CONFIRMED ("aguardando classificação"), formato do lote numérico
- [ ] Comentários no código mencionando `A-####` ou "imprime no registro" — atualizar se relevante

#### P.3. Commits previstos (atômicos)

| #   | Commit                                                                             | Escopo                                                                                                                                                       |
| --- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `feat(samples): formato do lote interno passa a ser numerico (sem prefixo A-)`     | `getNextInternalLotNumber` + AI prompts + fixture + tests de format                                                                                          |
| 2   | `feat(samples): remove etapa de impressao do registro de amostra`                  | Backend orchestrator (rename pra `createSample`, sem `requestQrPrint`), endpoint, response shape, `startClassification` aceita REGISTRATION_CONFIRMED, tests |
| 3   | `feat(samples): modal de confirmacao com step "lote criado" pra anotar na saca`    | Frontend modal: remove polling/printStatus/exitWarning, adiciona step `created` com lote em destaque + botão "Ir para amostra"                               |
| 4   | `feat(samples): reagrupa REGISTRATION_CONFIRMED em "aguardando classificacao"`     | Backend status arrays (PRINT_PENDING / CLASSIFICATION_PENDING) + dashboard esconde card printPending                                                         |
| 5   | `feat(samples): detail page CTA "Iniciar classificacao" em REGISTRATION_CONFIRMED` | Detail page: muda CTA principal, mantém print como secundário                                                                                                |
| 6   | `docs(samples): marca Fase P no plano + atualiza skill prisma`                     | Plan + skills                                                                                                                                                |

(Quality gates rodam antes de **cada** commit.)

#### P.4. Verificação end-to-end

**Automatizada**: typecheck/lint/format/build/validate:schemas/test:contracts/test:unit/test:integration:db (≥142 testes verdes, +novos).

**Manual local**:

1. Criar amostra PF nova → modal abre em `review` → confirmar → modal vira `created` mostrando lote `5562` em destaque → botão "Ir para amostra" → redirect pra detail page
2. Detail page de REGISTRATION_CONFIRMED → CTA "Iniciar classificação" visível
3. Tentar imprimir manualmente em REGISTRATION_CONFIRMED → ainda funciona (override)
4. Dashboard → card "Aguardando impressão" não aparece, REGISTRATION_CONFIRMED conta no "Aguardando classificação"
5. `getNextInternalLotNumber()` retorna `'5562'` (sem prefixo)

### Fase Q — Lifecycle simplificado + impressão como ação + auto-print pós-classificação

> **Absorve** a Fase Pb original. **Pré-requisito** da Fase C.
>
> **Status de execução (2026-05-07)**: a frente do **registro** foi concluída nos commits `6761a54` (backend: command service, schemas JSON, migration do trigger, helpers de teste) e `0b7c45f` (frontend: api-client, detail page, modal de edição). Pendentes na Fase Q: classificação (Q.7.2 classificação + Q.7.3 + Q.7.5), impressão (Q.7.2 impressão + Q.7.6 + Q.7.7), auto-print pós-classificação (Q.1.d) e migration final dos enums (Q.6 etapas 5-10).

**Motivação**: a análise da Etapa 1 expôs **5 statuses fantasmas** no lifecycle (PHYSICAL_RECEIVED, REGISTRATION_IN_PROGRESS, QR_PENDING_PRINT, QR_PRINTED, CLASSIFICATION_IN_PROGRESS) que o usuário **nunca vê** — todos artefato técnico. Cada um inflagra o event store e a UI sem agregar valor de produto. Além disso:

- **Impressão é ação, não estado**: a tabela `PrintJob` (PENDING/SUCCESS/FAILED + `attemptNumber` + `error` + timestamps) **já é** a fonte da verdade do estado de impressão. Replicar esse estado no enum `SampleStatus` gera redundância e força hacks (ex: `recordQrPrinted` linha 1929-1947 com lógica de "se já passou de QR_PENDING_PRINT, retorna idempotente").
- **Distinção PRINT vs REPRINT é artefato**: nada no produto distingue 1ª de N-ésima impressão. `attemptNumber` + `createdAt` cobrem qualquer pergunta operacional.
- **Classificação parcial nunca foi usada** na operação real, apesar do botão "Salvar rascunho" existir na detail page.
- **Etiqueta vale mais pós-classificação**: registro só anota o lote à mão na saca (Fase P3); a etiqueta com QR sai automaticamente quando a amostra é classificada.

**Resultado**: lifecycle do Sample tem **3 estados** (RC, CLASSIFIED, INVALIDATED). Tudo mais é ação ou audit.

#### Q.1. Decisões fechadas

##### Q.1.a. Registro

| #   | Decisão                                                                      | Escolha                                                                  |
| --- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 1   | Quantos status no registro                                                   | **1 só**: `REGISTRATION_CONFIRMED`                                       |
| 2   | Quantos eventos de transição                                                 | **1 só**: `REGISTRATION_CONFIRMED` (`fromStatus: null` → `toStatus: RC`) |
| 3   | Statuses `PHYSICAL_RECEIVED`, `REGISTRATION_IN_PROGRESS`                     | **Cortar do enum** (sem manter como legado — prod zerado)                |
| 4   | Eventos `SAMPLE_RECEIVED`, `REGISTRATION_STARTED`                            | **Cortar do enum**                                                       |
| 5   | Comandos `receivePhysicalSample`, `startRegistration`, `confirmRegistration` | **Deletar** (orquestrador `createSample` passa a emitir 1 evento direto) |

##### Q.1.b. Classificação

| #   | Decisão                                                                  | Escolha                                                                                           |
| --- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| 1   | Quantos status na classificação                                          | **1 só terminal**: `CLASSIFIED`                                                                   |
| 2   | Status `CLASSIFICATION_IN_PROGRESS`                                      | **Cortar** — nunca era visível ao usuário, é detalhe técnico                                      |
| 3   | Evento `CLASSIFICATION_STARTED`                                          | **Cortar**                                                                                        |
| 4   | Evento `CLASSIFICATION_SAVED_PARTIAL` (rascunho)                         | **Cortar** — feature nunca usada na prática                                                       |
| 5   | Comando `startClassification`                                            | **Cortar** — sem status IP, perde sentido                                                         |
| 6   | Comando `saveClassificationPartial`                                      | **Cortar**                                                                                        |
| 7   | Comando `completeClassification`                                         | **Mantém** — RC → CLASSIFIED, exige foto                                                          |
| 8   | Comando `updateClassification` (reclassificação)                         | **Mantém** — CLASSIFIED → CLASSIFIED, audit                                                       |
| 9   | Comando `confirmClassificationFromCamera`                                | **Mantém** — caminho A: classifica via câmera com `sampleId` fixo                                 |
| 10  | Eventos da IA (`CLASSIFICATION_EXTRACTION_*`)                            | **Mantém** — audit-only, fluxo paralelo                                                           |
| 11  | Botão "Iniciar classificação" na detail page                             | **Mantém** — só pra direcionar pra câmera com `sampleId` fixado                                   |
| 12  | Caminho A (botão → câmera com `sampleId`) vs B (câmera direta sem fixar) | **Apenas A** — validação cruzada de lote protege contra "operador pegou a saca errada da estante" |
| 13  | Foto de classificação obrigatória em `completeClassification`            | **Mantém**                                                                                        |
| 14  | Reclassificação (CLASSIFIED → CLASSIFIED)                                | **Mantém** — necessidade real de corrigir erros ou re-medir                                       |

##### Q.1.c. Impressão (ação pura)

| #   | Decisão                                                       | Escolha                                                                                                           |
| --- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 1   | Statuses `QR_PENDING_PRINT` e `QR_PRINTED`                    | **Cortar do enum**                                                                                                |
| 2   | Impressão como ação ou estado                                 | **Ação pura** — não toca status do sample                                                                         |
| 3   | Fonte da verdade do estado de impressão                       | **Tabela `PrintJob`** (PENDING/SUCCESS/FAILED + `attemptNumber` + `error` + `createdAt`/`updatedAt`)              |
| 4   | Eventos `QR_PRINT_REQUESTED`, `QR_PRINTED`, `QR_PRINT_FAILED` | **Mantém** mas todos viram **audit-only** (`fromStatus: null`, `toStatus: null`)                                  |
| 5   | Evento `QR_REPRINT_REQUESTED`                                 | **Cortar** (substituído por `QR_PRINT_REQUESTED` com `attemptNumber > 1`)                                         |
| 6   | Distinção PRINT vs REPRINT                                    | **Cortar** — toda impressão é igual; `attemptNumber` sequencial cobre tudo                                        |
| 7   | Enum `PrintAction` (PRINT/REPRINT)                            | **Cortar inteiro**                                                                                                |
| 8   | Coluna `print_job.print_action`                               | **Cortar**                                                                                                        |
| 9   | `IdempotencyScope.QR_REPRINT`                                 | **Cortar**                                                                                                        |
| 10  | Constraint `uq_print_job_sample_action_attempt`               | Vira `uq_print_job_sample_attempt` em `(sample_id, attempt_number)`                                               |
| 11  | Comandos de impressão                                         | **Unificar** em `requestQrPrint` (sem distinguir 1ª de N-ésima)                                                   |
| 12  | Comando `requestQrReprint`                                    | **Cortar** (substituído por `requestQrPrint`)                                                                     |
| 13  | Concorrência: múltiplos PENDING simultâneos                   | **Bloquear**: 1 `PrintJob` PENDING por amostra. Nova request retorna 409 enquanto há PENDING válido               |
| 14  | Timeout de `PrintJob` travado                                 | **1 minuto**, lazy (sem worker/cron)                                                                              |
| 15  | Onde rodar o lazy timeout                                     | **D3** — em `requestQrPrint` E em `getSampleDetail` (path de leitura E escrita)                                   |
| 16  | `requestQrPrint` exige `expectedVersion`                      | **Não** — não muda o sample, sem optimistic lock                                                                  |
| 17  | Imprimir em `INVALIDATED`                                     | **Bloqueado** (único veto)                                                                                        |
| 18  | Print agent local                                             | **Não muda** — endpoints `recordQrPrinted` / `recordQrPrintFailed` mantêm assinatura                              |
| 19  | Override manual de print em RC                                | **Mantém** — botão "Imprimir etiqueta" disponível em qualquer status não-INVALIDATED (impressão é ação, não fase) |
| 20  | Card "Aguardando impressão" no dashboard                      | **Cortado** definitivamente (não volta na Fase Q nem depois) — toast + detail page bastam                         |

##### Q.1.d. Print automático pós-classificação (Fase Pb absorvida)

| #   | Decisão                                                                                                            | Escolha                                                                                                                                             |
| --- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `completeClassification` dispara `requestQrPrint` automaticamente                                                  | **Sim**                                                                                                                                             |
| 2   | `confirmClassificationFromCamera` (1ª classificação, RC → CLASSIFIED) dispara                                      | **Sim** (chama `completeClassification` por baixo)                                                                                                  |
| 3   | Reclassificação (`updateClassification` ou `confirmClassificationFromCamera` em CLASSIFIED) dispara nova impressão | **Não** — etiqueta minimalista (lote/safra/sacas/QR) não muda. Operador reimprime manualmente se quiser                                             |
| 4   | Layout da etiqueta                                                                                                 | **A1: minimalista** — lote, safra, sacas, QR. Sem dados de classificação. Sem mexer no layout físico Elgin L42 Pro                                  |
| 5   | UX da impressão automática                                                                                         | **C2: background** — classificação fecha imediato + redireciona pra detail page; print roda em background; modal de feedback aparece quando termina |
| 6   | Idempotency                                                                                                        | Idempotency key da classificação **deriva** key do print (hash composta) — protege duplo-clique de criar 2 PrintJobs                                |
| 7   | Override manual de reimpressão em CLASSIFIED                                                                       | **Mantém** — operador pode reimprimir a qualquer momento (impressão é ação)                                                                         |
| 8   | Feedback de print (sucesso/falha)                                                                                  | **Modal rápido com opções clicáveis** ao operador (ex: "Etiqueta impressa" / "Falha — Tentar novamente"). **Não fixo** em área da detail page       |
| 9   | Polling de `PrintJob`                                                                                              | **Polling simples**, intervalo curto (a definir, ex: 2-3s), só ativo enquanto há PENDING                                                            |

##### Q.1.e. Migration

| #   | Decisão                             | Escolha                                                                     |
| --- | ----------------------------------- | --------------------------------------------------------------------------- |
| 1   | Estratégia de migration             | **Single-shot** — prod zerado (L3.2 wipou); local descartável               |
| 2   | Eventos legados (statuses cortados) | **Cortar e limpar** — sem manter como legado; sem dados antigos a preservar |
| 3   | Backfill de dados                   | **Não necessário** (zero rows com valores legados)                          |

#### Q.2. Lifecycle final

```
                              ┌─────────────────────────────────────┐
                              │                                     │
   (criação direta — 1 evento)│                                     │
                              ▼                                     │
                    REGISTRATION_CONFIRMED                          │
                              │                                     │
        (completeClassification │                                   │
         ou confirmClassificationFromCamera)                        │
                              │                                     │
                              ▼                                     │
                          CLASSIFIED ─────► (reclassificação)        │
                              │              audit, fica em CLASSIFIED
                              │                                     │
       (a qualquer momento, exceto INVALIDATED → INVALIDATED)       │
                              │                                     │
                              ▼                                     │
                         INVALIDATED                                │
                          (terminal)                                │
                                                                    │
       ─── PRINT (operação paralela, sem mudar status) ─────────────┘

         requestQrPrint → cria PrintJob(PENDING) [emite QR_PRINT_REQUESTED audit]
         Print agent processa (polling)
         Agent reporta → recordQrPrinted ou recordQrPrintFailed
                         emite QR_PRINTED ou QR_PRINT_FAILED (audit, null/null)
                         PrintJob.status atualizado (SUCCESS/FAILED)

         Disparado:
           — automaticamente por completeClassification (idempotency derivada)
           — manualmente por botão "Imprimir etiqueta" em qualquer status ≠ INVALIDATED
```

#### Q.3. Transições permitidas (mudam status do Sample)

| De                     | Para                   | Como                                                                                         |
| ---------------------- | ---------------------- | -------------------------------------------------------------------------------------------- |
| (não existe)           | REGISTRATION_CONFIRMED | `createSample` (form do `/samples/new`)                                                      |
| REGISTRATION_CONFIRMED | CLASSIFIED             | `completeClassification` ou `confirmClassificationFromCamera` (foto obrigatória — caminho A) |
| qualquer não-terminal  | INVALIDATED            | `invalidateSample`                                                                           |

#### Q.4. Operações permitidas por status

| Operação                             | RC  | CLASSIFIED | INVALIDATED |
| ------------------------------------ | --- | ---------- | ----------- |
| `requestQrPrint` (manual ou auto)    | ✅  | ✅         | ❌          |
| `recordQrPrinted` (agente)           | ✅  | ✅         | ✅\*        |
| `recordQrPrintFailed` (agente)       | ✅  | ✅         | ✅\*        |
| `addSamplePhoto` (CLASSIFICATION)    | ✅  | ✅         | ❌          |
| `completeClassification`             | ✅  | ❌         | ❌          |
| `confirmClassificationFromCamera`    | ✅  | ✅ (recl.) | ❌          |
| `updateClassification`               | ❌  | ✅         | ❌          |
| `updateRegistration` (editar campos) | ✅  | ✅         | ❌          |
| Vendas/perdas (`SALE_*`, `LOSS_*`)   | ✅  | ✅         | ❌          |
| Envio físico                         | ✅  | ✅         | ❌          |
| `invalidateSample`                   | ✅  | ✅         | ❌          |

\* Se o sample foi invalidado **enquanto havia `PrintJob` PENDING**: agente pode reportar resultado (atualiza apenas o `PrintJob`, não muda nada no sample). Idempotência protege re-tentativas.

#### Q.5. Eventos finais

##### Q.5.a. Com mudança de status (3 eventos)

- `REGISTRATION_CONFIRMED` (`null` → `RC`)
- `CLASSIFICATION_COMPLETED` (`RC` → `CLASSIFIED`) — **dispara `requestQrPrint` automático**
- `SAMPLE_INVALIDATED` (qualquer não-terminal → `INVALIDATED`)

##### Q.5.b. Audit-only (`null/null`)

- **Registro**: `REGISTRATION_UPDATED`, `PHOTO_ADDED`
- **Classificação**: `CLASSIFICATION_UPDATED`, `CLASSIFICATION_EXTRACTION_COMPLETED`, `CLASSIFICATION_EXTRACTION_FAILED`
- **Impressão**: `QR_PRINT_REQUESTED`, `QR_PRINTED`, `QR_PRINT_FAILED`
- **Comercial**: `SALE_CREATED`, `SALE_UPDATED`, `SALE_CANCELLED`, `LOSS_RECORDED`, `LOSS_UPDATED`, `LOSS_CANCELLED`, `COMMERCIAL_STATUS_UPDATED`
- **Operacional**: `PHYSICAL_SAMPLE_SENT`, `PHYSICAL_SAMPLE_SEND_UPDATED`, `PHYSICAL_SAMPLE_SEND_CANCELLED`, `REPORT_EXPORTED`

##### Q.5.c. Cortados do enum

- **Statuses (5)**: `PHYSICAL_RECEIVED`, `REGISTRATION_IN_PROGRESS`, `QR_PENDING_PRINT`, `QR_PRINTED`, `CLASSIFICATION_IN_PROGRESS`
- **Eventos (5)**: `SAMPLE_RECEIVED`, `REGISTRATION_STARTED`, `CLASSIFICATION_STARTED`, `CLASSIFICATION_SAVED_PARTIAL`, `QR_REPRINT_REQUESTED`
- **Outros**: `PrintAction` (enum inteiro), `IdempotencyScope.QR_REPRINT`

#### Q.6. Mudanças no schema (migration single-shot)

> Ordem importa por causa das dependências FK e da limitação Postgres pra `DROP` de enum value.

1. **DELETE local** quaisquer rows em `sample` ou `sample_event` com valores legados (script, executar antes da migration). Prod já está zerado.
2. **DROP coluna** `print_job.print_action`.
3. **DROP constraint** `uq_print_job_sample_action_attempt`.
4. **CREATE constraint** `uq_print_job_sample_attempt` em `(sample_id, attempt_number)`.
5. **DROP enum** `PrintAction`.
6. **CREATE enum novo** `SampleStatus_v2` com 3 valores (RC, CLASSIFIED, INVALIDATED).
7. **ALTER TABLE** `sample` e `sample_event`: trocar `status`, `from_status`, `to_status` pra usar `SampleStatus_v2`.
8. **DROP enum antigo** `SampleStatus`. **Renomear** `SampleStatus_v2` → `SampleStatus`.
9. Repetir 6-8 para `SampleEventType` (3 → 19 valores ativos restantes).
10. Repetir 6-8 para `IdempotencyScope` (sem `QR_REPRINT`).
11. Atualizar `prisma/schema.prisma` refletindo o novo estado.

#### Q.7. Trabalho a fazer

##### Q.7.1. Backend — schema + migrations

- [x] **Registro (`6761a54`)**: migration `20260507201156_phaseq_registration_confirmed_creator` atualiza trigger `fn_guard_sample_event_insert` pra exigir `REGISTRATION_CONFIRMED` (com `fromStatus=null`) como primeiro evento.
- [ ] **Migration final**: Prisma única (passos Q.6.5 a Q.6.10) que dropa enum values legados de `SampleStatus`, `SampleEventType`, `IdempotencyScope` e a coluna `print_job.print_action`. Vai depois das frentes de classificação e impressão.
- [ ] `prisma/schema.prisma`: enums reduzidos + Model `PrintJob` sem `printAction` + constraint renomeada (junto da migration final).

##### Q.7.2. Backend — comandos

- [x] **Registro (`6761a54`)**: `createSample` emite 1 evento único `REGISTRATION_CONFIRMED` (`null` → `RC`). `receiveSample`, `startRegistration`, `confirmRegistration` deletados (sem callers fora do orquestrador) junto com handlers e endpoints REST.
- [x] `appendEvent` em ambos `event-contract-service.js` e `event-contract-db-service.js`: aceita `REGISTRATION_CONFIRMED` como evento criador (era `SAMPLE_RECEIVED`). Bloqueia recriação com 409.
- [x] `buildSampleCreateData` popula `declared.*` + `ownerClientId/UnitId` direto do payload do `REGISTRATION_CONFIRMED`.
- [ ] **Classificação**: `startClassification` deletar, `saveClassificationPartial` deletar.
- [ ] **Classificação**: `completeClassification` aceita partir de **RC apenas**. Emite `CLASSIFICATION_COMPLETED`. **Após emitir**, dispara `requestQrPrint` com `idempotencyKey` derivada.
- [ ] **Classificação**: `confirmClassificationFromCamera` aceita **RC** ou **CLASSIFIED** (reclassificação). Se RC → `completeClassification` (dispara print). Se CLASSIFIED → `updateClassification` (sem print).
- [ ] **Classificação**: `updateClassification` mantém comportamento atual. **Não dispara** print.
- [ ] **Impressão**: `requestQrPrint`:
  - aceita qualquer status **exceto** `INVALIDATED`
  - cria `PrintJob(PENDING)` + emite `QR_PRINT_REQUESTED` audit (null/null)
  - **sem** `expectedVersion` (não muda sample)
  - **antes** de criar: executa lazy timeout — marca `PrintJob`s PENDING > 1min como FAILED com `error: 'timeout 1min'`
  - **bloqueia (409)** se já houver PENDING válido pra essa amostra
  - **remove** parâmetro `printAction` da assinatura
- [ ] **Impressão**: `requestQrReprint` deletar.
- [ ] **Impressão**: `recordQrPrinted` atualiza `PrintJob` pra SUCCESS, emite `QR_PRINTED` audit (null/null), remove o hack "se já passou de QR_PENDING_PRINT", sem `expectedVersion`.
- [ ] **Impressão**: `recordQrPrintFailed` atualiza `PrintJob` pra FAILED com `error`, emite `QR_PRINT_FAILED` audit (null/null), sem `expectedVersion`.

##### Q.7.3. Backend — query + agrupamentos

- [x] **Registro (`6761a54`)**: `assertSampleStatus` em `createSample` removido (sample novo nunca está em status legado). `getNextInternalLotNumber` mantém (Fase P). Auditoria de callers de `receiveSample/startRegistration/confirmRegistration` feita — sem callers backend remanescentes.
- [ ] **Impressão**: `PRINT_PENDING_STATUSES` deletar (substituído por query em `PrintJob.status='PENDING'`); `getNextPrintAttemptNumber(sampleId)` remove parâmetro `printAction`; `getSampleDetail` aplica lazy timeout antes de retornar.
- [ ] **Classificação**: `CLASSIFICATION_PENDING_STATUSES` vira `['REGISTRATION_CONFIRMED']`.
- [ ] **Classificação**: `assertSampleStatus` em `completeClassification`/`startClassification`/`saveClassificationPartial`/`confirmClassificationFromCamera` revisar (`grep` por `QR_PRINTED`, `CLASSIFICATION_IN_PROGRESS`, `QR_PENDING_PRINT`).
- [ ] **Classificação**: `PHOTO_KINDS.CLASSIFICATION` (linha ~22 do command service) de `[QR_PRINTED, CLASSIFICATION_IN_PROGRESS, CLASSIFIED]` pra `[REGISTRATION_CONFIRMED, CLASSIFIED]`.

##### Q.7.4. Backend — schemas JSON (event contracts)

- [x] **Registro (`6761a54`)**: schemas `sample-received.event/payload` e `registration-started.event/payload` deletados. `registration-confirmed.event` relax pra `fromStatus: null`. `registration-confirmed.payload` ganha `receivedChannel` (required) e `notes`. `shared-defs.schema.json` perde `SAMPLE_RECEIVED`, `REGISTRATION_STARTED`, `PHYSICAL_RECEIVED`, `REGISTRATION_IN_PROGRESS`.
- [ ] **Classificação**: drop schemas `classification-started.event/payload`, `classification-saved-partial.event/payload`. `shared-defs` perde `CLASSIFICATION_IN_PROGRESS`, `CLASSIFICATION_STARTED`, `CLASSIFICATION_SAVED_PARTIAL`.
- [ ] **Impressão**: drop schema `qr-reprint-requested.event/payload`. Relax `qr-print-requested.event` (fromStatus null/null), `qr-printed.event` (fromStatus null/null), `qr-print-failed.event` (já é null/null). `shared-defs` perde `QR_PENDING_PRINT`, `QR_PRINTED`, `QR_REPRINT_REQUESTED`, e `printAction` enum inteiro, `IdempotencyScope.QR_REPRINT`.

##### Q.7.5. Frontend — detail page (Gargalo 4)

> Revisão exaustiva. ~30 referências a `QR_PRINTED` / `QR_PENDING_PRINT` em `app/samples/[sampleId]/page.tsx`. **Sub-fase Q.r dentro da execução**.

- [x] **Registro (`0b7c45f`)**: import `confirmRegistration` removido; `handleConfirmRegistration` + state `confirming` deletados; `REGISTRATION_EDITABLE_STATUSES` perde IP; helpers `getOperationalStatusDot*` perdem branches `PHYSICAL_RECEIVED`/`REGISTRATION_IN_PROGRESS`; modal de edição simplificado (header/labels/handler/validação sem condicionais de IP).
- [ ] CTA principal por status (frente classificação + impressão):
  - **RC**: "Iniciar classificação" (leva pra `/camera` com `sampleId` fixado) + secundário "Imprimir etiqueta" (override manual).
  - **CLASSIFIED**: "Reclassificar" + secundário "Reimprimir etiqueta".
  - **INVALIDATED**: nada (terminal).
- [ ] Botão "Salvar rascunho": deletar.
- [ ] Painel "etiqueta" (status do PrintJob): mostra última impressão (data, status). Sem painel fixo de "imprimindo agora" (decisão Gargalo A).
- [ ] Polling de `PrintJob` quando há PENDING ativo (ver Q.7.6).
- [ ] Limpar todas as condicionais que comparam contra statuses cortados (`QR_PRINTED`, `QR_PENDING_PRINT`, `CLASSIFICATION_IN_PROGRESS`).
- [ ] Sem código morto.

##### Q.7.6. Frontend — modal de feedback do print (auto + manual)

- [ ] Após `completeClassification` (auto), frontend redireciona pra detail page imediatamente.
- [ ] Detail page detecta `PrintJob` PENDING ativo → polling a cada N segundos (curto, ex: 2-3s).
- [ ] Quando `PrintJob` vira SUCCESS → modal "Etiqueta impressa com sucesso" + botão OK (auto-dismiss opcional).
- [ ] Quando `PrintJob` vira FAILED → modal "Falha na impressão" + opções: "Tentar novamente" / "Cancelar".
- [ ] Modal aparece **só uma vez** por job (depois de fechado, não reaparece sem novo print).
- [ ] Mesmo modal cobre print manual (override em RC ou reimpressão em CLASSIFIED).

##### Q.7.7. Frontend — dashboard

- [ ] `app/dashboard/page.tsx`: card "Aguardando impressão" — **deletar inteiro** (decisão Q.1.c #20). Sem volta.
- [ ] Card "Aguardando classificação": query continua, conta amostras em `RC`.

##### Q.7.8. Frontend — api-client

- [x] **Registro (`0b7c45f`)**: `receiveSample`, `startRegistration`, `confirmRegistration` deletados.
- [ ] **Classificação**: `saveClassificationPartial`, `startClassification` deletar.
- [ ] **Impressão**: `requestQrReprint` deletar; `requestQrPrint` remove parâmetros `printAction` e `expectedVersion` da assinatura.

##### Q.7.9. Tests

- [ ] `tests/sample-backend-sprint1.integration.test.js`: revisar todos os testes que tocam fluxo de registro (3 → 1 evento) e classificação (sem IP).
- [ ] Helpers a deletar:
  - `moveSampleToQrPendingPrint`
  - `moveSampleToQrPrinted`
  - `moveSampleToClassificationInProgress` (se existir)
- [ ] `moveSampleToRegistrationConfirmed`: simplificar (1 evento direto, sem `SAMPLE_RECEIVED` + `REGISTRATION_STARTED`).
- [ ] `moveSampleToClassified`: passar pelo novo fluxo (RC → CLASSIFIED em 1 transição) e considerar que `completeClassification` dispara print (mock o agent ou ignora `PrintJob`).
- [ ] Casos novos (mínimos):
  - `createSample` emite **1** evento (`REGISTRATION_CONFIRMED`, null/RC).
  - `requestQrPrint` aceita RC, CLASSIFIED; rejeita INVALIDATED (409).
  - `requestQrPrint` cria `PrintJob`; se já há PENDING, retorna 409.
  - Lazy timeout em `requestQrPrint`: PENDING > 1min vira FAILED antes da nova request criar.
  - Lazy timeout em `getSampleDetail`: PENDING vencido aparece como FAILED no GET.
  - `completeClassification` dispara `requestQrPrint` automaticamente; idempotency protege duplo-clique.
  - `confirmClassificationFromCamera` em RC dispara print; em CLASSIFIED **não** dispara.
  - `updateClassification` (reclassificação direta) **não** dispara print.

##### Q.7.10. Print agent

> **Sem mudança.** Endpoints `recordQrPrinted` / `recordQrPrintFailed` mantêm assinatura. Print agent continua fazendo polling de `PrintJob` PENDING (modelo atual). Mudança é interna ao backend.

##### Q.7.11. Skills + docs

- [ ] `.claude/skills/prisma/SKILL.md`: atualizar significados — Sample com 3 statuses, eventos audit-only, `PrintJob` sem `printAction`, novo lifecycle.
- [ ] `docs/PLANO-amostras-refatoracao.md` (este doc): marcar Fase Q como executada ao fim.
- [ ] Outros skills se relevante (verificar `tests`, `conventions`).

#### Q.8. Commits — plano vs execução

> **Reorganizado**: o "registro" originalmente previsto como 2 commits (#1 migration + #2 backend) virou 1 commit backend + 1 frontend. A migration final (drop de enums) foi adiada pra última frente da Fase Q (após classificação e impressão), porque cada `DROP` de enum value no Postgres é caro e queremos fazer uma vez só com tudo migrado.

| #   | Commit                                                                   | Status   | SHA / nota                                                                                                                                                                                                                                                                                                                                                                 |
| --- | ------------------------------------------------------------------------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `feat(samples): registro emite 1 evento unico (Fase Q backend)`          | ✅       | `6761a54` — command service (3 comandos deletados), schemas JSON, migration do trigger, append-event aceita REGISTRATION_CONFIRMED criador, tests                                                                                                                                                                                                                          |
| 2   | `feat(samples): frontend sem REGISTRATION_IN_PROGRESS (Fase Q frontend)` | ✅       | `0b7c45f` — api-client (3 fns deletadas), detail page (handleConfirmRegistration + estado + helpers + modal simplificados)                                                                                                                                                                                                                                                 |
| 3   | `feat(samples): classificacao sem CLASSIFICATION_IN_PROGRESS`            | pendente | Backend (startClassification + saveClassificationPartial deletar; completeClassification só de RC; confirmClassificationFromCamera RC ou CLASSIFIED) + tests + frontend (botão "Salvar rascunho", aba IP)                                                                                                                                                                  |
| 4   | `feat(samples): impressao como acao pura (sem QR_*)`                     | pendente | Backend `requestQrPrint` unificado, `recordQrPrinted`/`recordQrPrintFailed` sem `expectedVersion`, lazy timeout 1min (D3). Sem `PrintAction`. Tests                                                                                                                                                                                                                        |
| 5   | `feat(samples): impressao automatica apos completeClassification`        | pendente | `completeClassification` dispara `requestQrPrint` com `idempotencyKey` derivada. Tests                                                                                                                                                                                                                                                                                     |
| 6   | `feat(samples): polling + modal de feedback de print no frontend`        | pendente | Detail page polling de `PrintJob` PENDING, modal sucesso/falha (auto + manual)                                                                                                                                                                                                                                                                                             |
| 7   | `feat(samples): dashboard sem card "aguardando impressao"`               | pendente | Frontend dashboard remove card                                                                                                                                                                                                                                                                                                                                             |
| 8   | `feat(samples): detail page revisada (sem QR_PRINTED/QR_PENDING_PRINT)`  | pendente | Revisão exaustiva da detail page (Q.7.5 / Gargalo 4). CTAs por status, sem código morto. CTA "Iniciar classificação" em RC entra aqui                                                                                                                                                                                                                                      |
| 9   | `feat(samples): migration final — drop enum values legados`              | pendente | Drop de `PHYSICAL_RECEIVED`, `REGISTRATION_IN_PROGRESS`, `QR_PENDING_PRINT`, `QR_PRINTED`, `CLASSIFICATION_IN_PROGRESS` (SampleStatus); `SAMPLE_RECEIVED`, `REGISTRATION_STARTED`, `CLASSIFICATION_STARTED`, `CLASSIFICATION_SAVED_PARTIAL`, `QR_REPRINT_REQUESTED` (SampleEventType); `PrintAction` enum + coluna `print_job.print_action`; `IdempotencyScope.QR_REPRINT` |
| 10  | `docs(samples): marca Fase Q completa + skills atualizadas`              | pendente | Plan + skills (`prisma`, `tests`, `conventions`)                                                                                                                                                                                                                                                                                                                           |

(Quality gates rodam antes de **cada** commit: typecheck/lint/format/build/validate:schemas/test:contracts/test:unit/test:integration:db.)

#### Q.9. Verificação end-to-end

**Automatizada**: typecheck/lint/format/build/validate:schemas/test:contracts/test:unit/test:integration:db (≥142 testes verdes, +novos).

**Manual local**:

1. Criar amostra PF nova → modal `created` mostra lote → "Ir para amostra" → detail page de `RC`.
2. Detail page de `RC`: CTA "Iniciar classificação" + CTA secundário "Imprimir etiqueta".
3. Imprimir manualmente em `RC` → cria `PrintJob`, agente imprime, modal sucesso.
4. Imprimir 2x rápido na mesma amostra → 2ª request retorna 409 (PrintJob PENDING ativo).
5. Esperar > 1min com agente offline → próxima request marca o PENDING travado como FAILED e cria novo PrintJob.
6. Refresh da detail page com PrintJob PENDING > 1min → status mostra FAILED (lazy timeout no GET).
7. Clicar "Iniciar classificação" → vai pra `/camera` com `sampleId` fixado.
8. Tirar foto da ficha correta → IA valida lote (caminho A) → completa classificação → redireciona pra detail page → polling detecta PrintJob → modal "Imprimindo etiqueta..." → modal sucesso.
9. Tirar foto de ficha de outra amostra (lote diferente) → IA detecta divergência → avisa.
10. Detail page de `CLASSIFIED`: CTA "Reclassificar" + CTA secundário "Reimprimir etiqueta".
11. Reclassificar → `CLASSIFICATION_UPDATED` audit, **não** dispara nova impressão.
12. Reimprimir manualmente em `CLASSIFIED` → cria novo `PrintJob`, agente imprime, modal sucesso.
13. Invalidar amostra em qualquer estado → vira `INVALIDATED`, todas operações bloqueadas (incluindo print).
14. Dashboard: card "Aguardando impressão" não aparece. Card "Aguardando classificação" conta apenas `RC`.

#### Q.10. Open items

**Resolvidos durante a execução do registro:**

- [x] **Auditoria de callers do registro**: confirmado que `receiveSample`, `startRegistration`, `confirmRegistration` tinham handlers/endpoints REST e callers em testes (resolvido nos commits `6761a54` + `0b7c45f`).

**Pendentes pras próximas frentes:**

- [ ] **Auditoria de callers da classificação e impressão**: confirmar que `startClassification`, `saveClassificationPartial`, `requestQrReprint` têm callers só nos lugares já mapeados (frontend/api-client/tests).
- [ ] **Tempo exato do polling** (2-3s? backoff exponencial até 10s? apenas constante?).
- [ ] **Layout exato dos modals** (sucesso simples vs falha com opções) — pode ficar pra revisão visual durante implementação.
- [ ] **`Sample.version` em audit-only events**: confirmar que `appendEvent` continua subindo `version` mesmo em null/null events. Audit não é "transparente" pro optimistic lock — concorrência segue protegida.
- [ ] **Print agent local**: confirmar formato de polling (intervalo, batching) antes da migration final que dropa `print_action`.
- [ ] **Eventos legados no DB local antes da migration final**: rodar `SELECT COUNT(*) WHERE event_type IN (legacy values)` pra confirmar que precisa do `DELETE` da Q.6.1.

### Fase Q.cls.2 — Ficha unificada de classificação (em definição)

> **Absorve a Fase C original**. Aqui consolidamos as decisões e o caminho de execução. Mudanças do código ainda não foram iniciadas — apenas a ficha física (`print-templates/classification-form/`) e as decisões de produto.

#### Q.cls.2.1. Decisões fechadas

##### Ficha unificada (3 fichas → 1)

- [x] **Layout físico**: HTML/CSS imprimível em `print-templates/classification-form/index.html`. 6 fichas por A4 (3 linhas × 2 colunas), grid uniforme de 30 colunas internas (alinhamento entre linhas), labels CAIXA ALTA, linhas-guia de corte (vertical entre colunas + 2 horizontais entre fileiras + outline externo), CAT com largura aumentada (~27%), `=` e `%` centralizados verticalmente nos campos FD.
- [x] **22 campos da ficha** (lote no cabeçalho + 21 preenchíveis):
  - **Cabeçalho** (3): lote (sem rótulo, hash do registro — não persiste no payload de classificação), `scs` (sacas), `safra` — usados pra cross-validation com o sample.
  - **Identificação** (3): `padrao`, `aspecto`, `certif` — strings livres.
  - **Peneiras** (10): `peneiraP18`, `P17`, `P16`, `P15`, `P14`, `P13`, `P12`, `P11`, `P10`, `peneiraMk` — strings (% retenção, nem todas preenchidas).
  - **Fundos** (4): `fundo1Peneira` + `fundo1Percent`, `fundo2Peneira` + `fundo2Percent` — peneiras variáveis (operador escreve, ex: "fundo 13 = 8%").
  - **Catação** (1): `catacao` — string (% catação).
  - **Defeitos** (6): `imp`, `pva`, `broca`, `gpi` (Grão Perfeito Inteiro), `ap` (Aproveitamento), `defeito` (campo livre — "Def.", não é total calculado).
  - **Final** (2): `observacoes` (texto livre), `bebida` (string livre).
- [x] **Tipos de dado**: tudo como **string** (mantém padrão atual; IA extrai como string, UI trata como string com vírgula brasileira). Promover campos pra coluna decimal só se virar dor.
- [x] **DB**: JSON em `latestClassification.data` no Sample (atual). Filtros via JSON path do Postgres (`->>`). Promover campos pra coluna só sob demanda.

##### Tipos de classificação (ClassificationType)

- [x] **4 valores**: `BICA`, `PREPARADO`, `BAIXO` (renomeado de `LOW_CAFF`), `ESCOLHA` (novo).
- [x] **Labels iguais aos nomes**: `BICA`, `PREPARADO`, `BAIXO`, `ESCOLHA` (sem mais "CAFÉ BAIXO").
- [x] **Tipo agora é só metadata** — não influencia mais a extração da IA (1 prompt único, type-agnostic).
- [x] **Tipo obrigatório** (não pode ficar `null`).
- [x] **Seleção do tipo migrou pra após a extração**: modal próprio, entre revisão dos dados e seleção dos classificadores.
- [x] **Mudar tipo depois** = `CLASSIFICATION_UPDATED` (audit, mesmo evento da edição da classificação).
- [x] **Migration**: rename `LOW_CAFF` → `BAIXO` + add `ESCOLHA` no enum Postgres. Postgres não permite rename direto de enum value — vai num passo da migration final da Fase Q (drop dos legados + recriação do enum).

##### IA (extração)

- [x] **1 prompt único**, type-agnostic. Substitui os 3 prompts/schemas/normalizadoras atuais.
- [x] **Modelo**: continua GPT-4o-mini (sem mudança nesta frente).
- [x] **Cross-validation com o sample**: mantém o que existe hoje (compara lote, sacas, safra extraídos da ficha contra os declarados no registro). Detalhe das mensagens de aviso definido no fluxo da câmera.
- [x] **Resposta esperada**: JSON estruturado com os 22 campos + identificação (lote, sacas, safra) pra cross-validation.

#### Q.cls.2.2. Fluxo da câmera — Caminho A (único caminho mantido)

> **Operador entra exclusivamente pela detail page** clicando "Iniciar classificação" → URL `/camera?sampleId=X`. Acesso direto a `/camera` (sem sampleId) não existe mais. Caminho B (sem sampleId) descartado.

##### Sub-caminho 1 — Foto bate com o sample

Lote extraído = lote do sample, demais campos sem divergência crítica → segue pra modal de revisão.

##### Sub-caminho 2 — Lote diverge

- Aviso específico mostrando: lote extraído da ficha vs lote esperado do sample.
- **Mostra miniatura da foto capturada** no aviso (ajuda confirmação visual).
- Opções: **tirar outra foto** (volta pra câmera) ou **cancelar** (volta pra detail page).
- Sem opção de "forçar" — operador é obrigado a corrigir (foto certa) ou desistir.

##### Sub-caminho 3 — IA não lê o lote

Distinção entre 2 tipos de falha:

- **(3a) Lote ilegível** (IA rodou e não achou o lote na foto):
  - Aviso "Não foi possível identificar o lote na foto."
  - Opções: tirar outra foto / cancelar.
- **(3b) Erro técnico** (timeout, OpenAI offline, falha na chamada):
  - Aviso explicando o problema técnico (ex: "Erro ao processar a foto. Servico de extracao indisponivel.").
  - Opções: tirar outra foto / cancelar / **continuar manual** (segue com a foto sem extração).
  - Se continuar manual → 2º modal alertando "Analise bem as informações antes de salvar" → confirma → modal de revisão abre com **campos vazios** pro operador preencher manualmente. Foto continua salva como evidência.

##### Sub-caminho 4 — Divergência de sacas/safra (não-bloqueante)

- Aviso mostrando, **campo a campo**, valor extraído da ficha vs valor declarado no registro.
- Operador é **obrigado a escolher**, pra cada campo divergente, qual valor usar:
  - "Usar valor da ficha" → backend aplica `updateRegistration` com os novos valores antes de classificar (`applySampleUpdates`)
  - "Manter valor do registro" → mantém registro intacto; valores extraídos da ficha são corrigidos no payload da classificação
- Sem 2º modal de certeza (a obrigatoriedade da escolha campo a campo já garante que registro e ficha ficarão coerentes).

##### Sub-caminho 5 — Sample já classificado (reclassificação)

- Aviso "Esta amostra já foi classificada. Deseja reclassificá-la?" → confirmar / cancelar.
- Reclassificação permite mudar **tudo**: campos da ficha, **tipo** (modal de tipo aparece de novo), **classificadores**.
- **Reason code obrigatório** (operador escolhe entre `DATA_FIX`, `TYPO`, `MISSING_INFO`, `OTHER`).
- **Reason text** condicional: obrigatório só se reason code = `OTHER` — campo vira vermelho com mensagem "Justificativa obrigatória" se vazio.
- Backend: chama `updateClassification` (audit), não `completeClassification`.

##### Sub-caminho 6 — Sample em INVALIDATED

Erro upfront. Cenário raro (a detail page de INVALIDATED não tem CTA "Iniciar classificação" pós-Q.cls.1). Só aparece se URL acessada direto.

##### Gargalos transversais decididos

- **G1. Extração parcial**: IA lê o lote (válido) mas falha em peneiras/defeitos → continua o fluxo, modal de revisão abre com **campos vazios** nos que falharam (operador preenche).
- **G2. UX da extração**: foto mostrada antes de enviar (operador pode rejeitar e tirar de novo); spinner durante extração — mantém comportamento atual.
- **G3. Limite de tentativas / monitoramento de custo IA**: sem limite por enquanto, sem monitoramento. Reabrir se virar dor.
- **G4. Cancelar volta pra detail page**: URL completa `/samples/[sampleId]`, mantém estado intacto.

#### Q.cls.2.3. Modal de revisão dos dados extraídos

Aparece logo após a extração da IA (ou logo após o operador escolher "continuar manual" no sub-caminho 3b). É o ponto onde o operador confere/corrige os dados antes de avançar pra escolha de tipo + classificadores.

##### Layout

- **Espelha a ordem da ficha física**: cabeçalho → identificação → peneiras (2 linhas) → fundos+catação → defeitos (2 linhas) → final (obs+beb).
- **Foto da ficha em cima dos campos**, rola junto com o conteúdo (não-sticky).
- **Edição inline em todos os campos** — sem botão "editar"; cada input já vem editável.
- **Sem destaque visual** pra "campo extraído pela IA" vs "preenchido pelo operador" (nem na UI nem no payload — só o valor final entra).

##### Campos do cabeçalho (lote, sacas, safra)

Comportamento depende de como o operador chegou ao modal:

- **Fluxo normal** (IA extraiu OK, sub-caminhos 2/4 já validaram): lote/sacas/safra **read-only** (só referência).
- **Fluxo manual** (sub-caminho 3b — erro técnico de IA, operador escolheu "continuar manual"): lote/sacas/safra **pré-preenchidos com os valores do sample**, mas **editáveis**. Operador pode corrigir lendo da foto.
  - **Revalidação no manual**: se ele editar pra valor diferente do sample, ao avançar **reativa cross-validation** (sub-caminho 2 pra lote, sub-caminho 4 pra sacas/safra).

##### Campos da classificação (21 preenchíveis)

Todos editáveis sempre (texto livre / string). Nenhum campo individual é obrigatório.

- **Fundos**: layout fiel à ficha — `[peneira] = [%]`, com `=` e `%` decorativos (operador digita só os números).
- **Observações**: input de 1 linha, limite 500 caracteres, **sem aviso de truncamento** (na prática nunca chega perto do limite).
- **Bebida**: input de 1 linha (texto livre).

##### Foto — comportamento e zoom

- **Rola junto** com os campos (não-sticky).
- **Click na foto → overlay de zoom**: foto se expande sobre o modal de revisão, com botão **X** pra fechar. Permite **zoom em qualquer ponto** (não só no centro).
- **Campos do modal ficam bloqueados** durante o zoom (não-interagíveis até fechar o overlay).

##### Botões e validação

- **Botões**: somente `Cancelar` + `Avançar` (sem `Voltar` porque o modal de revisão é o **primeiro modal** pós-extração).
- **`Cancelar`** → volta pra câmera, **descarta a foto** (operador tira nova).
- **`Avançar`**: sempre habilitado, **valida ao clicar**. Se falhar, abre **modal de aviso** ("Falta de informação"); operador clica `OK`, volta pro modal de revisão **preservando todos os valores**.
- **Critério de validação**: precisa ter **pelo menos 1 campo preenchido além do lote**. Nenhum campo individual é obrigatório, mas só o lote não basta. Critério "preenchido" = string não-vazia (campos só com espaços contam como vazios).
- **Sucesso na validação** → modal de revisão fecha, **modal de seleção de tipo** abre.

##### Persistência ao voltar

- A partir do modal de tipo (e modais subsequentes), o operador pode clicar **`Voltar`** pra retornar ao modal de revisão.
- **Todos os valores editados se mantêm** ao voltar (sem perder trabalho).

#### Q.cls.2.4. Tela da câmera (Caminho A único)

> Decisões implementadas no commit `e37deaa`.

- **Layout, retake, preview, loading**: comportamento existente mantido.
- **Orientação**: retrato (portrait, comportamento natural — câmera mobile).
- **Câmera traseira obrigatória**: `getUserMedia` com `facingMode: { exact: 'environment' }` antes de iniciar o qr-scanner. Sem traseira (devices sem traseira ou desktops com webcam frontal) → `OverconstrainedError` → fallback de galeria.
- **Permissão negada / câmera indisponível / sem traseira**: galeria como fallback (e como botão sempre visível, ver abaixo). Mensagens orientativas:
  - Sem câmera: "Nenhuma camera disponivel neste dispositivo. Use a galeria pra selecionar uma foto."
  - Sem traseira: "Camera traseira nao disponivel neste dispositivo. Use a galeria pra selecionar uma foto."
  - Permissão negada: "Camera bloqueada. Use a galeria pra selecionar uma foto, ou habilite a camera nas configuracoes do navegador."
  - Outros erros: "Camera nao disponivel. Use a galeria pra selecionar uma foto."
- **Galeria sempre visível** (botão `camera-hub-gallery-btn`) em `flowState === 'idle'`, independente do status da câmera. Operador pode usar livremente quando câmera OK e ela é o único caminho quando câmera falha.
- **Sem flash** (não mexer no hardware).
- **Sem crop / sem rotação** após upload (operador escolhe foto bem orientada; manuseio adicional ficaria fora de escopo).
- **Loading durante extração**: spinner + "Extraindo dados da classificacao..." (existente).

#### Q.cls.2.5. Extração da IA (1 prompt + json_schema)

> Decisões implementadas no commit `864f619`.

- **1 prompt único, type-agnostic** (substitui BICA/PREPARADO/LOW_CAFF). O `ClassificationType` é metadata pós-extração — a IA não vê.
- **Modelo**: `gpt-4o`, `temperature: 0`, `max_tokens: 1500`, timeout 25s, `detail: 'high'` (mantém).
- **Cross-validation só no backend** (sem mudança) — IA só extrai, backend compara `identificacao.lote/sacas/safra` com o sample.
- **`response_format: json_schema` strict mode** (substitui `json_object` livre): garante formato, todos os campos `required`, `additionalProperties: false`, tipos `["string", "null"]`.
- **Estrutura JSON agrupada**:
  ```
  {
    identificacao: { lote, sacas, safra },
    classificacao: {
      padrao, aspecto, certif,
      peneiras: { p18, p17, p16, p15, p14, p13, p12, p11, p10, mk },
      fundos: [{ peneira, percentual }, { peneira, percentual }],  // sempre 2
      catacao,
      defeitos: { imp, pva, broca, gpi, ap, defeito },
      observacoes, bebida
    }
  }
  ```
- **Ficha identificada por estrutura tabular** descrita em detalhe no prompt (8 linhas, labels CAIXA ALTA NEGRITO no canto superior esquerdo de cada célula, larguras das células em proporção, layout especial dos fundos `[peneira] = [%]`). Sem âncora visual extra.
- **Anti-alucinação**: prompt forte ("NUNCA INVENTE: muitos campos ficam vazios. É ESPERADO. Retorne null sem hesitar.") + structured output + `KNOWN_LABELS` rejeitando rótulos impressos ecoados.
- **`Def.` é texto livre** (não numérico) — pode ser número, descrição ou ambos. `toStringOrNull`, não `toNumericOrNull`.
- **Imagem direta** sem pré-processamento (resize/crop/rotate). OpenAI redimensiona internamente com `detail: 'high'`.
- **Sem retry**: 1 chamada → erro técnico cai no fallback "continuar manual" do sub-caminho 3b.
- **Schema do evento `CLASSIFICATION_EXTRACTION_COMPLETED`** atualizado pra refletir a nova estrutura agrupada (peneiras/fundos array/defeitos).

#### Q.cls.2.6. CTAs na detail page (Caminho A único)

> Decisões implementadas nos commits `f505926` (FAB CTA "Classificar").

- **FAB "Classificar"** em `app/samples/[sampleId]/page.tsx`: aparece **somente em `REGISTRATION_CONFIRMED`** (único status do fluxo Caminho A após Q.cls.2). QR_PRINTED é dado legado (backend ainda aceita por compat até a migration final, mas UI não oferece entrada). Reclassificação de CLASSIFIED segue pelo modal próprio (`reclassifyModalOpen`) já existente.
- **Label**: `Classificar` (curto, cabe melhor em FAB; quando sample está em RC, "classificar" implica "iniciar").
- **Click**: `router.push('/camera?sampleId=...')`.

#### Q.cls.2.7. Trabalho a fazer (próximas frentes)

Decisões e implementações concluídas:

- [x] Tela da câmera (Q.cls.2.4) — commit `e37deaa`
- [x] Extração da IA (Q.cls.2.5) — commit `864f619`
- [x] CTA "Classificar" em RC (Q.cls.2.6) — commit `f505926`
- [x] Ficha unificada física (HTML) — commit `a79626e`
- [x] Modal de revisão dos dados extraídos (Q.cls.2.3) — commit `a39e305`
- [x] Modal de tipo pós-extração (Q.cls.2.8) + cleanup do tipo pré-câmera — commit `8dbe36f`
- [x] Caminho A da câmera (Q.cls.2.2) — sub-caminhos 2/3a/3b/4/5 implementados (`983ccc3` + `9411ffe`); modais próprios em `components/samples/Classification*Modal.tsx`

Próximas frentes pendentes (em ordem do fluxo do operador):

- [x] **Modal de classificadores** (Q.cls.2.9) — refatorado no commit `9411ffe` em `components/samples/ClassificationClassifierModal.tsx`. Header verde com seta de Voltar (alinhado ao TypeModal), chip pinned do user atual + chips removíveis dos co-classificadores, busca multi-select, persistência ao voltar.
- [ ] **Tipo selecionado depois → `CLASSIFICATION_UPDATED`** (audit): implementar fluxo de mudança de tipo na detail page.
- [x] **Backend `completeClassification`/`updateClassification`** ajustam payload pra ficha unificada — commits `aa7c591` (schemas), `1aa4845` (backend), `a2c7594` (frontend + sub-caminho 5 Flow B), `40d91e4` (tests + projection).
- [x] **Cross-validation no fluxo da câmera**: sub-caminhos 2/3a/3b/4/5 implementados (`983ccc3` + `9411ffe`).
- [ ] **Frontend Q.cls.2 cleanup**: deletar `TYPE_CONFIGS`, `extractionFieldMap` por tipo em `lib/classification-form.ts`. Form unificado no fluxo de classificação.
- [ ] **Migration de tipos**: rename `LOW_CAFF` → `BAIXO` + add `ESCOLHA` no enum Postgres (parte da migration final da Fase Q).
- [ ] **Tests**: completeClassification/updateClassification com novo payload, frontend tests do modal de revisão / tipo / classificadores.

#### Q.cls.2.8. Modal de seleção de tipo (implementado)

> Decisões implementadas no commit `8dbe36f`.

- **Posição no fluxo**: entre o modal de revisão e o modal de classificadores. Tipo é metadata pós-extração (decisão de 2026-05-07).
- **Layout**: grid 2x2 com 4 opções (BICA, PREPARADO, BAIXO, ESCOLHA).
- **Botão Voltar**: ícone de seta no canto esquerdo do header verde. **Sem X de fechar** — cancelar fica concentrado no modal de revisão (decisão "Modal de tipo tem só Voltar" de 2026-05-08).
- **ESCOLHA disabled** com hint "Em breve" — habilita junto com a migration final (Q.final) que adiciona `ESCOLHA` no enum.
- **BAIXO** mapeia pro enum legado `LOW_CAFF` até a migration final renomear no banco.
- **Click num tipo** seta `classificationType` e avança direto pro modal de classificadores (sem botão Avançar separado — click já é a seleção).
- **Tipo previamente selecionado** fica destacado com borda verde + glow ao reabrir o modal (operador volta do classifier).
- **ESC** volta pro modal de revisão.

#### Q.cls.2.9. Modal de classificadores (implementado)

> Decisões implementadas no commit `9411ffe`.

- **Componente próprio**: `components/samples/ClassificationClassifierModal.tsx` — substitui o JSX inline antigo (`cam-classifier-card`).
- **Padrão modal**: `.app-modal.is-themed` alinhado com a skill `modals`.
- **Header**: verde brand com seta de Voltar à esquerda (igual ao `TypeModal`). **Sem X** — cancelar fica concentrado no modal de revisão.
- **Chip pinned**: user atual sempre incluído, gradient verde, não-removível.
- **Co-classificadores**: chips removíveis (X individual). Busca por nome ou usuário; lista filtrada com check visual quando selecionado.
- **Persistência**: estado dos co-classificadores e da busca preservado ao voltar (vem do parent — `app/camera/page.tsx`).
- **Estados**: loading, erro com retry, lista vazia.
- **Continuar**: dispara `handleConfirmClassification` direto (a extração + revisão + tipo já aconteceram); muda para "Salvando..." durante submit.
- **ESC**: volta pro modal de tipo.

#### Q.cls.2.10. Open items (próximas decisões)

- [ ] **CTA "Mudar tipo"** na detail page (já que "tipo" é audit) — fica como? Botão separado ou só dentro de "Reclassificar"?
- [ ] **Cross-validation expandida**: além de lote/sacas/safra, comparar outros campos? (provavelmente não — outros são preenchidos só pelo classificador).

### Fase C — Refatoração da classificação (incorporada na Q.cls.2)

> A Fase C original (unificação 3 fichas → 1) foi **absorvida pela Fase Q.cls.2** acima. Sem trabalho separado.
>
> _Histórico_: a Fase C era originalmente planejada como pós-Q. Conforme o escopo da classificação se aprofundou na Fase Q (lifecycle simplificado + ficha unificada + tipos), fez sentido manter tudo dentro da mesma Fase Q em sub-frentes Q.cls.1 (lifecycle) e Q.cls.2 (ficha unificada).
>
> **Pré-requisito**: Fase Q (lifecycle simplificado e classificação sem IP/SAVED_PARTIAL). Sem isso, refatorar 3 prompts → 1 fica acoplado a uma máquina de estados que vai mudar.

---

## 4. Histórico de decisões

| Data       | Decisão                                                                                                           | Contexto                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-05-07 | Unificar 3 fichas de classificação em ficha única                                                                 | Reduz complexidade do código (3 prompts IA → 1, 3 normalizadoras → 1, 3 layouts → 1). Layout final aprovado em PDF (Cat. estendida ao centro de P10, 2 FDs iguais, `=` centralizado).                                                                                                                                                                                                        |
| 2026-05-07 | Plano vai cobrir registro + classificação no mesmo documento                                                      | Os dois fluxos são acoplados; refatorar em conjunto evita retrabalho.                                                                                                                                                                                                                                                                                                                        |
| 2026-05-07 | PF sempre nasce com ≥1 fazenda (auto-create "Fazenda 1")                                                          | Toda saca precisa rastreabilidade clara da origem. Auto-criar evita caso "PF com 0 units" e simplifica o registro de amostra (sempre há fazenda pra selecionar).                                                                                                                                                                                                                             |
| 2026-05-07 | PJ não tem filial — sucursais viram clientes PJ separados                                                         | Cada CNPJ é um Client distinto. Decisão pré-existente do L5; explicitada no plano.                                                                                                                                                                                                                                                                                                           |
| 2026-05-07 | Auto-create silencioso quando `units: []` explícito                                                               | Trata `undefined` e `[]` igual. Garante invariante independente de como o caller chama.                                                                                                                                                                                                                                                                                                      |
| 2026-05-07 | Helper `ensureDefaultPfUnit` em `client-support.js`                                                               | Isolado, testável em unit puro, reutilizável por imports futuros.                                                                                                                                                                                                                                                                                                                            |
| 2026-05-07 | Invariante PF≥1 unit só na app, sem trigger no banco                                                              | Único ponto de criação é `createClient`; trigger seria sobre-engenharia.                                                                                                                                                                                                                                                                                                                     |
| 2026-05-07 | Fase 0.1 separada da Fase R                                                                                       | Defesa em profundidade da invariante "PF ACTIVE tem ≥1 unit ACTIVE" no domínio de cliente. Fase R passa a confiar 100% nessa invariante.                                                                                                                                                                                                                                                     |
| 2026-05-07 | `reactivateClient` auto-cria Fazenda 1 quando PF tem 0 units                                                      | Mesma estratégia da Fase 0: garante invariante silenciosamente. UX não falha por dados pré-Fase 0.                                                                                                                                                                                                                                                                                           |
| 2026-05-07 | Fase R não toca SampleMovementModal                                                                               | Movements (vendas/perdas) é fluxo separado, mexe em buyer (não owner). Fica como "Fase R+1" se virar dor real.                                                                                                                                                                                                                                                                               |
| 2026-05-07 | Etiqueta QR mantém minimalista                                                                                    | Hoje só mostra lote/safra/sacas + QR. Adicionar fazenda mexeria em layout físico térmico (Elgin L42 Pro). Vínculo fica no banco/UI por enquanto.                                                                                                                                                                                                                                             |
| 2026-05-07 | Fazenda incompleta no dropdown ganha `<IncompleteIcon />`                                                         | Reusa o ícone SVG já presente em `components/clients/IncompleteIcon.tsx` (mesmo dos cards de cliente). Não bloqueia seleção.                                                                                                                                                                                                                                                                 |
| 2026-05-07 | ClientLookupField em `/samples/new` vira só-cliente                                                               | Sem hierarquia inline de units. Seleção exclusiva pelo novo `OwnerUnitField`. Compat preservada — basta omitir `onSelectUnit`.                                                                                                                                                                                                                                                               |
| 2026-05-07 | Atalho "+ Nova fazenda" no dropdown abre `ClientUnitModal` reutilizado                                            | Cadastra inline sem sair do registro de amostra. Após criar, auto-seleciona.                                                                                                                                                                                                                                                                                                                 |
| 2026-05-07 | Fase D adicionada antes da Fase C, iterativa                                                                      | Ajustes de layout desktop do `/samples/new` serão pedidos sob demanda. Constraints: mobile intacto, breakpoint ≥1024px, só visual.                                                                                                                                                                                                                                                           |
| 2026-05-07 | Etiqueta sai do registro e vai pra pós-classificação (Fase P + Pb)                                                | QR no registro era pro classificador escanear, mas a classificação hoje identifica lote sozinha (foto+AI). Etiqueta vale mais com dados completos pós-classificação.                                                                                                                                                                                                                         |
| 2026-05-07 | Lote vira numérico puro (sem `A-`)                                                                                | Mais simples de escrever na saca à mão, mais simples de comunicar. AI já tolera. Sem migration (L3.2 wipou prod).                                                                                                                                                                                                                                                                            |
| 2026-05-07 | Step `created` no modal mostra lote em destaque                                                                   | Funcionário precisa anotar o lote na saca. Step pós-criação dentro do modal força a atenção ao número antes de seguir.                                                                                                                                                                                                                                                                       |
| 2026-05-07 | Print pré-classificação fica como override manual                                                                 | `requestQrPrint` continua aceitando REGISTRATION_CONFIRMED. Botão "Imprimir etiqueta" disponível como secundário na detail page.                                                                                                                                                                                                                                                             |
| 2026-05-07 | `startClassification` aceita REGISTRATION_CONFIRMED                                                               | Sem essa mudança, samples ficariam presos sem caminho pra frente. Mantém também `QR_PRINTED` (compat com fluxo legado).                                                                                                                                                                                                                                                                      |
| 2026-05-07 | Lifecycle do Sample reduzido a 3 estados (RC → CLASSIFIED → INVALIDATED)                                          | Statuses intermediários (PHYSICAL_RECEIVED, REGISTRATION_IN_PROGRESS, QR_PENDING_PRINT, QR_PRINTED, CLASSIFICATION_IN_PROGRESS) eram fantasmas — usuário nunca via, só inflagiam o lifecycle e o event store. Lifecycle limpo facilita raciocínio e UI.                                                                                                                                      |
| 2026-05-07 | Registro emite 1 evento único (`REGISTRATION_CONFIRMED`, null → RC)                                               | Os 3 eventos sequenciais (RECEIVED + STARTED + CONFIRMED) eram artefato técnico — todos com timestamps quase iguais e sem usuário pra interagir nos intermediários. Reduz ruído no event store.                                                                                                                                                                                              |
| 2026-05-07 | `CLASSIFICATION_IN_PROGRESS` cortado                                                                              | Era cerimonial — câmera já pulava direto pra CLASSIFIED, classificação parcial nunca foi usada na operação. `startClassification` virava handshake sem valor.                                                                                                                                                                                                                                |
| 2026-05-07 | `CLASSIFICATION_SAVED_PARTIAL` e botão "Salvar rascunho" removidos                                                | Usuário confirmou: "nunca vi uma classificação ser salva pela metade." Botão presente na UI mas sem uso real. Sem essa feature, todo `saveClassificationPartial` cai junto.                                                                                                                                                                                                                  |
| 2026-05-07 | Câmera usa apenas caminho A (com `sampleId` fixado + validação cruzada)                                           | Validação cruzada protege contra erro humano de "peguei a saca errada da estante". Caminho B (câmera direta sem pré-seleção) descartado: não há valor de velocidade que justifique perder a proteção.                                                                                                                                                                                        |
| 2026-05-07 | Botão "Iniciar classificação" mantém — só pra direcionar pra câmera                                               | Sem `startClassification` o botão perde efeito de status, mas continua útil como atalho da detail page pra `/camera` com `sampleId` fixado. UX não regride.                                                                                                                                                                                                                                  |
| 2026-05-07 | Impressão é ação, não estado                                                                                      | `PrintJob` (PENDING/SUCCESS/FAILED + attemptNumber + error + timestamps) já é fonte da verdade. Replicar em `SampleStatus` era redundância e gerava hacks (ex: `recordQrPrinted` linha 1929-1947 com lógica "se sample já passou...").                                                                                                                                                       |
| 2026-05-07 | Comandos `requestQrPrint` e `requestQrReprint` unificados                                                         | Nada no produto distingue 1ª de N-ésima impressão. `attemptNumber` + `createdAt` cobrem qualquer pergunta operacional. Reduz API surface e elimina enum `PrintAction`.                                                                                                                                                                                                                       |
| 2026-05-07 | Enum `PrintAction` e coluna `print_action` removidos                                                              | Toda impressão é igual; distinção PRINT/REPRINT era artefato. Constraint vira `(sample_id, attempt_number)`.                                                                                                                                                                                                                                                                                 |
| 2026-05-07 | 1 `PrintJob` PENDING por amostra (lock)                                                                           | Evita criar 2 jobs paralelos pra mesma amostra com agente lento. Nova request → 409 enquanto há PENDING válido.                                                                                                                                                                                                                                                                              |
| 2026-05-07 | Timeout de 1 minuto, lazy (D3 — leitura E escrita)                                                                | `PrintJob` travado libera automaticamente. Lazy evita worker/cron na infra enxuta. Aplica em `getSampleDetail` E em `requestQrPrint` — cobre path de leitura e escrita.                                                                                                                                                                                                                      |
| 2026-05-07 | Imprimir em `INVALIDATED` bloqueado                                                                               | Único veto — amostra terminal não tem etiqueta nova.                                                                                                                                                                                                                                                                                                                                         |
| 2026-05-07 | Print automático ao concluir classificação (Fase Pb absorvida na Fase Q)                                          | Etiqueta vale mais com classificação fechada. Operador não precisa apertar "Imprimir" — sai sozinho. Reduz fricção do classificador, alinha com decisão "etiqueta sai do registro" da Fase P.                                                                                                                                                                                                |
| 2026-05-07 | Reclassificação NÃO dispara nova impressão                                                                        | Etiqueta minimalista (lote/safra/sacas/QR) — dados não mudam ao reclassificar. Operador reimprime manualmente se quiser (impressão é ação livre).                                                                                                                                                                                                                                            |
| 2026-05-07 | Layout da etiqueta mantém minimalista (decisão A1)                                                                | Sem mexer no layout físico Elgin L42 Pro. Justifica decisão de reclassificação não reimprimir. Eventual enriquecimento fica pra fase futura quando justificar redesenhar a etiqueta térmica.                                                                                                                                                                                                 |
| 2026-05-07 | UX da impressão automática em background (decisão C2)                                                             | Classificação fecha imediato, redireciona pra detail page. Polling detecta resultado e dispara modal. Operador classifica em série sem travar 1min esperando agente.                                                                                                                                                                                                                         |
| 2026-05-07 | Modal rápido de feedback (sucesso/falha)                                                                          | Aparece uma vez quando o print termina. Não fixa em área da detail page (decisão Gargalo A do usuário). Mantém UI limpa em estado padrão.                                                                                                                                                                                                                                                    |
| 2026-05-07 | Override manual de print mantém em qualquer status não-INVALIDATED                                                | Impressão é ação — operador pode imprimir mesmo antes de classificar (caso raro mas possível). Coerente com "1 PrintJob PENDING por amostra".                                                                                                                                                                                                                                                |
| 2026-05-07 | Card "Aguardando impressão" no dashboard cortado definitivamente                                                  | Com timeout 1min + print manual de baixa frequência, fila pendente é minúscula. Toast + detail page bastam. Sem volta na Fase Pb (que foi absorvida).                                                                                                                                                                                                                                        |
| 2026-05-07 | Idempotency derivada — `completeClassification` → `requestQrPrint`                                                | Hash composto (`hash(input.idempotencyKey + ':print')`) evita duplo `PrintJob` quando frontend retenta `completeClassification`.                                                                                                                                                                                                                                                             |
| 2026-05-07 | Migration single-shot                                                                                             | Prod zerado (L3.2 wipou). Sem dados pra preservar — single-shot é suficiente e atômico. Faseada seria overkill.                                                                                                                                                                                                                                                                              |
| 2026-05-07 | Eventos legados cortados (sem manter no enum)                                                                     | Sem dados antigos a preservar. Manter como legado seria ruído permanente no enum.                                                                                                                                                                                                                                                                                                            |
| 2026-05-07 | Print agent local sem mudança                                                                                     | Endpoints `recordQrPrinted` / `recordQrPrintFailed` mantêm assinatura. Mudança é interna ao backend (não atualiza mais status do sample, só `PrintJob` e evento audit).                                                                                                                                                                                                                      |
| 2026-05-07 | `requestQrPrint` sem `expectedVersion`                                                                            | Não muda o sample → optimistic lock desnecessário. Simplifica chamadas internas e externas (auto após classificação não precisa propagar version).                                                                                                                                                                                                                                           |
| 2026-05-07 | Polling simples no frontend, intervalo curto                                                                      | Detecta resultado do print rapidamente sem WebSocket/SSE (overkill). Tempo exato a definir durante implementação (provável 2-3s, só ativo enquanto há PENDING).                                                                                                                                                                                                                              |
| 2026-05-07 | Fase Pb (impressão pós-classificação) absorvida pela Fase Q                                                       | Decisão de "imprimir auto após classificação" entra junto com a simplificação de lifecycle pra evitar refatoração em duas etapas com retrabalho.                                                                                                                                                                                                                                             |
| 2026-05-07 | Fase C (unificação 3 fichas → 1) absorvida pela Q.cls.2                                                           | Conforme o escopo da classificação se aprofundou (lifecycle simplificado + ficha unificada + 4 tipos), fez sentido manter tudo dentro da Fase Q em sub-frentes (Q.cls.1 e Q.cls.2) em vez de tratar Fase C como fase pós-Q.                                                                                                                                                                  |
| 2026-05-07 | Ficha unificada física documentada como source HTML em `print-templates/`                                         | Em vez de PDF binário, o template é HTML/CSS impresso pelo navegador. Versionável no repo, fácil de iterar, qualquer um regenera. 6 fichas/A4, grid de 30 cols com alinhamento entre linhas, labels CAIXA ALTA, linhas-guia de corte.                                                                                                                                                        |
| 2026-05-07 | 4 tipos de classificação: BICA, PREPARADO, BAIXO, ESCOLHA                                                         | LOW_CAFF renomeado pra BAIXO (label simplificado, era "CAFÉ BAIXO"). ESCOLHA novo. Labels iguais aos nomes.                                                                                                                                                                                                                                                                                  |
| 2026-05-07 | Tipo de classificação vira só metadata pós-extração                                                               | Antes, tipo definia qual ficha (3 layouts diferentes) e qual prompt da IA. Agora ficha é unificada e IA é type-agnostic. Tipo entra via modal entre revisão dos dados e seleção dos classificadores. Obrigatório.                                                                                                                                                                            |
| 2026-05-07 | DB da classificação fica em JSON (`latestClassification.data`)                                                    | Volume baixo (centenas/milhares), ficha pode iterar; JSON evita migration toda mudança. Filtros via JSON path do Postgres bastam. Promover campos pra coluna só sob demanda.                                                                                                                                                                                                                 |
| 2026-05-07 | Fluxo da câmera mantém só Caminho A (com sampleId fixado)                                                         | Operador entra exclusivamente pela detail page → `/camera?sampleId=X`. Caminho B (acesso direto sem sampleId) descartado. Validação cruzada de lote protege contra "saca errada da estante" — proteção real que o caminho B perderia.                                                                                                                                                        |
| 2026-05-07 | Aviso de divergência de lote mostra miniatura da foto                                                             | Operador confirma visualmente qual ficha foi capturada antes de descartar/confirmar. Custo da foto perdida é baixo (chamada de IA), aceitável.                                                                                                                                                                                                                                               |
| 2026-05-07 | Falha de IA distingue "lote ilegível" de "erro técnico"                                                           | Mensagens diferentes evitam empurrar operador a tirar mais fotos quando o problema é de servidor. Erro técnico oferece "continuar manual" (preencher sem extração); lote ilegível só permite tirar outra foto ou cancelar.                                                                                                                                                                   |
| 2026-05-07 | "Continuar manual" abre modal de revisão com campos vazios                                                        | Quando IA falha tecnicamente, operador pode preencher tudo manualmente (com a foto salva como evidência). 2º modal alerta "analise bem antes de salvar". Fallback essencial pra não bloquear classificação por falha de OpenAI/timeout.                                                                                                                                                      |
| 2026-05-07 | Divergências sacas/safra obrigam escolha campo a campo (modelo c)                                                 | Operador é forçado a decidir, pra cada divergência, "usar valor da ficha" ou "manter valor do registro". Sem 2º modal de certeza. Garante coerência entre registro e classificação após o salvar.                                                                                                                                                                                            |
| 2026-05-07 | Reclassificação permite mudar tudo (campos, tipo, classificadores)                                                | Modal de tipo aparece de novo, classificadores podem mudar, reason code obrigatório (DATA_FIX/TYPO/MISSING_INFO/OTHER). Reason text obrigatório só se OTHER (campo vermelho com "Justificativa obrigatória" se vazio).                                                                                                                                                                       |
| 2026-05-07 | Foto sempre obrigatória pra completar classificação                                                               | Mesmo no fallback "continuar manual" (após erro técnico de IA), a foto capturada é exigida e salva como evidência. Operador preenche os campos manualmente, mas a foto fica vinculada à classificação.                                                                                                                                                                                       |
| 2026-05-08 | Modal de revisão espelha a ficha física (mesma ordem de blocos)                                                   | Operador vê os campos na mesma sequência da ficha que tem em mãos — reduz fricção visual ao conferir.                                                                                                                                                                                                                                                                                        |
| 2026-05-08 | Edição inline em todos os campos do modal de revisão                                                              | Sem botão "editar"; cada input já vem editável com o valor extraído (ou vazio). Reduz cliques em fluxo crítico.                                                                                                                                                                                                                                                                              |
| 2026-05-08 | Foto da ficha em cima dos campos, rola junto                                                                      | Foto fica como referência visual ao revisar. Não-sticky pra dar mais espaço aos campos quando o operador rola.                                                                                                                                                                                                                                                                               |
| 2026-05-08 | Click na foto abre overlay de zoom (qualquer ponto), bloqueia campos                                              | Operador precisa ler valores apertados na foto. Overlay próprio com X pra fechar; zoom em qualquer ponto (não só no centro). Campos atrás bloqueados pra evitar interação acidental.                                                                                                                                                                                                         |
| 2026-05-08 | Cabeçalho (lote/sacas/safra) read-only no fluxo normal, editável no manual                                        | No fluxo normal, esses 3 campos já passaram por cross-validation; mostrar editáveis convidaria erro. No manual (sub-caminho 3b), operador precisa preencher tudo lendo da foto, então são editáveis.                                                                                                                                                                                         |
| 2026-05-08 | Manual com edição de lote/sacas/safra reativa cross-validation                                                    | Se operador editar lote/sacas/safra no manual pra valor diferente do sample, ao avançar reativa sub-caminhos 2 (lote) e 4 (sacas/safra). Protege contra erro de digitação no fallback.                                                                                                                                                                                                       |
| 2026-05-08 | Modal de revisão sem destaque IA-vs-operador                                                                      | Nem na UI nem no payload. Só o valor final entra no payload. Operador é responsável pelo conteúdo total.                                                                                                                                                                                                                                                                                     |
| 2026-05-08 | Cancelar do modal de revisão descarta a foto e volta pra câmera                                                   | Foto perdida = chamada de IA já consumida; aceitável porque é raro o operador cancelar nesse ponto. Volta pra câmera limpa pra tirar nova foto.                                                                                                                                                                                                                                              |
| 2026-05-08 | Modal de revisão tem só Cancelar + Avançar (sem Voltar)                                                           | É o 1º modal pós-extração; "Voltar" não faz sentido (volta pra câmera = cancelar). Modais subsequentes (tipo, classificadores) têm "Voltar" pra retornar.                                                                                                                                                                                                                                    |
| 2026-05-08 | Avançar sempre habilitado; valida ao clicar (modal de aviso se falhar)                                            | Bloquear botão até preencher 1 campo seria mais fricção; melhor o operador clicar e ver o aviso. OK no aviso preserva todos os valores e volta pro modal de revisão.                                                                                                                                                                                                                         |
| 2026-05-08 | Critério de validação: pelo menos 1 campo preenchido além do lote                                                 | Nenhum campo individual é obrigatório, mas salvar uma classificação só com o lote não faz sentido. "Preenchido" = string não-vazia (espaços contam como vazio).                                                                                                                                                                                                                              |
| 2026-05-08 | Persistência de valores ao voltar entre modais                                                                    | Operador pode avançar pro modal de tipo e voltar pro modal de revisão sem perder o que digitou. Mesmo princípio se aplica aos modais subsequentes.                                                                                                                                                                                                                                           |
| 2026-05-08 | Modal de tipo tem só Voltar (sem Cancelar separado)                                                               | Cancelar fica concentrado no modal de revisão. Pra cancelar tudo, operador volta pro modal de revisão e clica Cancelar lá. Reduz duplicação de ações.                                                                                                                                                                                                                                        |
| 2026-05-08 | Fundos: `=` e `%` decorativos; operador digita só os números                                                      | Layout fiel à ficha (`[peneira] = [%]`), mas os símbolos não fazem parte do valor digitado — só são template visual.                                                                                                                                                                                                                                                                         |
| 2026-05-08 | Bebida e Observações: input 1 linha; observações limite 500 sem aviso                                             | Texto livre. Limite alto o suficiente que nunca chega perto na prática; sem aviso/truncamento pra não atrapalhar o operador.                                                                                                                                                                                                                                                                 |
| 2026-05-08 | Confirmação final dispara direto (sem "tem certeza?")                                                             | Após o modal de classificadores, clicar confirmar dispara `completeClassification` direto. Os modais sequenciais (revisão → tipo → classificadores) já são confirmação suficiente — adicionar mais um seria fricção desnecessária.                                                                                                                                                           |
| 2026-05-08 | Campos vazios pelo operador vão como string vazia no payload                                                      | Sem distinção entre "operador deixou em branco" e "IA não extraiu". Payload mostra exatamente o que está nos inputs no momento da confirmação.                                                                                                                                                                                                                                               |
| 2026-05-08 | IA passa a usar 1 prompt único type-agnostic (commit `864f619`)                                                   | Substitui os 3 prompts BICA/PREPARADO/LOW_CAFF. Tipo de classificação vira metadata pós-extração — IA não vê. Prompt descreve a ficha unificada (8 linhas tabulares, layout dos fundos `[peneira] = [%]`, larguras das células em proporção).                                                                                                                                                |
| 2026-05-08 | `response_format: json_schema` strict (substitui `json_object` livre)                                             | Garante formato com validação no servidor da OpenAI. `additionalProperties: false`, todos os campos `required`, tipos `["string", "null"]` pra nullable. Reduz necessidade de saneamento defensivo na app.                                                                                                                                                                                   |
| 2026-05-08 | Estrutura JSON da extração agrupada (identificacao + classificacao)                                               | `{ identificacao: {lote/sacas/safra}, classificacao: { padrao, aspecto, certif, peneiras: {p18..mk}, fundos: [{peneira,percentual} x2], catacao, defeitos: {imp,pva,broca,gpi,ap,defeito}, observacoes, bebida } }`. Espelha blocos da ficha física.                                                                                                                                         |
| 2026-05-08 | Fundos sempre retornam exatamente 2 elementos (defensive em normalizeFundos)                                      | Strict mode da OpenAI não suporta minItems/maxItems com confiança. Solução: prompt instrui "exatamente 2"; `normalizeFundos` força 2 (preenche com nulls se IA retornar 0/1, trunca se retornar 3+). Schema do evento exige `minItems: 2, maxItems: 2`.                                                                                                                                      |
| 2026-05-08 | `Def.` é texto livre (`toStringOrNull`), não numérico                                                             | Operador pode escrever número, descrição livre ou ambos no campo `Def.` da ficha (não é "total de defeitos" — é o defeito principal observado). Tratar como string evita rejeitar valores válidos.                                                                                                                                                                                           |
| 2026-05-08 | `extractClassificationFromPhoto(absolutePath)` sem `classificationType`                                           | Como tipo não influencia mais a extração, parâmetro foi removido completamente. Frontend não passa mais; sample-command-service só passa o caminho da foto.                                                                                                                                                                                                                                  |
| 2026-05-08 | Schema do evento `CLASSIFICATION_EXTRACTION_COMPLETED` reflete a estrutura agrupada                               | `extractedFields` com sub-objetos `peneiras` e `defeitos`, `fundos` como array de 2. `additionalProperties: false` em todos os níveis. Builder de testes em `event-builders.js` atualizado.                                                                                                                                                                                                  |
| 2026-05-08 | Tests da extração com mock do client OpenAI (sem rede)                                                            | 9 testes cobrem: payload da chamada, normalização da resposta agrupada, fundos sempre 2, `rejectIfLabel` em campos texto, `toNumericOrNull` em campos numéricos, PARSE_ERROR em conteúdo vazio/JSON inválido/chaves faltando, TIMEOUT em AbortError.                                                                                                                                         |
| 2026-05-08 | Modal de revisão (Q.cls.2.3) implementado em `ClassificationReviewModal.tsx` (commit `a39e305`)                   | Substitui o `ClassificationConfirmModal` antigo (`cam-cf-modal`). Componente próprio em `components/samples/`, segue a skill `modals` (`.app-modal.is-themed.is-wide`). Form externo (no `app/camera/page.tsx`) preserva valores entre reaberturas (lot-mismatch, data-mismatch, erro de save).                                                                                              |
| 2026-05-08 | Validação "≥1 campo da classificação" via overlay de aviso interno                                                | Não-bloqueante (botão Avançar sempre habilitado). Ao clicar com 0 campos preenchidos, abre overlay interno (sem novo backdrop) com ícone, mensagem e OK. OK preserva tudo e volta pro form. Decisão: lote, sacas e safra **não** contam (são identificação, não classificação).                                                                                                              |
| 2026-05-08 | `mapExtractionToForm(fields, null)` — universal map sempre                                                        | Em vez de filtrar por tipo, mapeia os 22 campos da ficha unificada pro form. Modal mostra todos sempre. Filtro por tipo permanece em `buildClassificationDataPayload` (cleanup do `TYPE_CONFIGS` fica pra Q.cls.2.7).                                                                                                                                                                        |
| 2026-05-08 | Foto da ficha no modal: clicável → `PhotoZoomViewer` existente                                                    | Reusa o componente já existente (`components/PhotoZoomViewer.tsx`) com pinch/double-tap/wheel zoom + pan + share + ESC. Foto em cima do form não-sticky, rola junto com os campos. Hint visual "Ampliar" no canto inferior direito da thumb.                                                                                                                                                 |
| 2026-05-08 | Modal de tipo (Q.cls.2.8) implementado em `ClassificationTypeModal.tsx` (commit `8dbe36f`)                        | Grid 2x2 com 4 opções (BICA/PREPARADO/BAIXO/ESCOLHA), header verde com seta de Voltar à esquerda (sem X). Click num tipo seleciona e avança direto pro classifier (sem Avançar separado). ESC = Voltar. Tipo previamente selecionado fica destacado com glow verde ao reabrir.                                                                                                               |
| 2026-05-08 | Tipo selecionado pré-câmera (`selecting-type` antigo) **removido** do fluxo                                       | Sequência nova: foto → IA extrai → revisão → tipo → classifier → save. IA é type-agnostic (commit `864f619`); `extractFromDetectedForm`/`extractAndPrepareClassification` agora chamados sem `classificationType`. `handleSendPhoto`/`handleContinueWithoutCrop` perdem o param `type`.                                                                                                      |
| 2026-05-08 | `handleClassifierContinue` dispara `handleConfirmClassification` direto (era `handleSendPhoto`)                   | Como a extração já rolou antes do classifier modal, "Continuar" agora salva direto. O fluxo de cross-validation (lot-mismatch, data-mismatch) continua acontecendo dentro do `handleConfirmClassification` — sem mudança nesse path.                                                                                                                                                         |
| 2026-05-08 | ESCOLHA disabled na UI até Q.final habilitar no enum                                                              | UI mostra ESCOLHA com badge "Em breve" porque o enum Postgres ainda não tem o valor (será adicionado na migration final junto com o rename `LOW_CAFF` → `BAIXO`). Botão fica `disabled` com cursor `not-allowed`.                                                                                                                                                                            |
| 2026-05-08 | Avisos de erro 3a/3b implementados em `ClassificationExtractionErrorModal` (commit `983ccc3`)                     | Sub-caminhos separados via prop `kind` (illegible vs technical). 3a: 2 botões (Tirar outra / Cancelar). 3b: 3 botões (Tirar outra / Continuar manual / Cancelar) — "Continuar manual" abre 2º modal de confirmação (`ClassificationManualConfirmModal`).                                                                                                                                     |
| 2026-05-08 | Detecção 3a vs 3b por origem do erro                                                                              | 3a (lote ilegível) detectado quando `result.identification.lote === null` em Flow B (`hasContext`). 3b (erro técnico) detectado no catch do try/catch (timeout/OpenAI offline/network). Em Flow A, lote=null não bloqueia — modal de revisão abre com lote vazio editável.                                                                                                                   |
| 2026-05-08 | Modo manual: lote+sacas+safra editáveis no `ClassificationReviewModal`                                            | Após 3b → "Continuar manual", `manualMode=true` faz cabeçalho do ReviewModal abrir editável pré-preenchido com `contextSampleLot/Sacks/Harvest`. Operador preenche tudo lendo da foto. Cross-validation (sub-caminhos 2/4) reativa naturalmente ao avançar com valores diferentes do sample.                                                                                                 |
| 2026-05-08 | `detectedPhotoToken` sempre setado após detect (mesmo se detected=true)                                           | Necessário pra modo manual ter um photoToken pro save (a foto foi enviada mas a extração técnica falhou). `saveClassification` em modo manual usa `detectedPhotoToken` em vez de `extractionResult.photoToken`.                                                                                                                                                                              |
| 2026-05-08 | Lot mismatch (sub-caminho 2) com miniatura da foto (commit `9411ffe`)                                             | Componente próprio `ClassificationLotMismatchModal`. Comparação visual lote-extraído (vermelho) vs lote-esperado (verde) separados por `≠`. Miniatura da foto capturada abaixo (decisão "ajuda confirmação visual"). Botões "Tirar outra foto" + "Cancelar" (volta detail page via router.back).                                                                                             |
| 2026-05-08 | Data mismatch (sub-caminho 4): sem default + Aplicar habilita só com escolha completa                             | Componente próprio `ClassificationDataMismatchModal`. `mismatchChoices` virou `Partial<Record<...>>` (sem default `'stored'`). Botão "Aplicar e salvar" disabled até todas as divergências terem escolha. Hint inline "Selecione um valor em cada linha para continuar" antes de ficar válido.                                                                                               |
| 2026-05-08 | Reclassificação (sub-caminho 5) com reason code obrigatório + reason text condicional                             | Componente próprio `ClassificationReclassifyModal`. 4 reason codes em grid com radios (DATA_FIX/TYPO/MISSING_INFO/OTHER). Reason text só aparece se code=OTHER, com validação "Justificativa obrigatória" em vermelho. Submit `.is-danger` (gradient vermelho — ação terminal).                                                                                                              |
| 2026-05-08 | Reason code/text **não enviado** ao backend hoje (TODO Q.cls.2.7)                                                 | Frontend coleta e valida na UI (operador é forçado a justificar), mas o payload de `confirmClassificationFromCamera` não tem reasonCode/reasonText hoje. Q.cls.2.7 vai incluir + ajustar `updateClassification` no backend. Comentário TODO no `handleConfirmOverwrite`.                                                                                                                     |
| 2026-05-08 | Modal de classificadores (Q.cls.2.9) refatorado pro padrão                                                        | Componente próprio `ClassificationClassifierModal`. JSX inline (`cam-classifier-card`) removido. Header verde com seta de Voltar (igual ao TypeModal). UX preservada: chip pinned do user atual + chips removíveis de co-classificadores + busca + lista filtrada. "Continuar" → save direto.                                                                                                |
| 2026-05-08 | Skill `modals` §11: inventário completo do fluxo da câmera + mapa visual ASCII                                    | Documenta todos os 9 modais da extração e suas posições no fluxo. Mapa ASCII mostra trajetos a partir de scanner → preview → extração → confirming/3a/3b/manual → tipo → classifier → save com mismatch/reclassify/not-found alcançáveis no caminho do save.                                                                                                                                 |
| 2026-05-08 | Schema `CLASSIFICATION_COMPLETED.payload.classificationData` reestruturado pra ficha unificada (commit `aa7c591`) | Removidos: `safra` (vive em `sample.declaredHarvest`), `peneirasPercentuais`, `p19`, e os deprecated `classifierUserId`/`classifierName`/`conferredBy`. Adicionados sub-objs `peneiras` (10 chaves p18..p10/mk number 0-100) + `fundos` (array top-level minItems:2 maxItems:2) + `defeitos` (6 chaves string). Mantidos flat: padrao/aspecto/certif/catacao/observacoes/bebida.             |
| 2026-05-08 | `CLASSIFICATION_UPDATED.payload.reasonText`: regex 1-10 palavras → `minLength:1, maxLength:500`                   | Frontend já permite até 500 chars no `ClassificationReclassifyModal` (textarea). Schema agora aceita texto livre, mais natural pra justificativa de reclassificação.                                                                                                                                                                                                                         |
| 2026-05-08 | Backend `parseClassificationUpdatePatch` aceita 3 sub-objs do classificationData (commit `1aa4845`)               | `parseClassificationPeneirasPatch`, `parseClassificationFundosPatch`, `parseClassificationDefeitosPatch` substituem o `parseClassificationSievePatch` antigo. `parseClassificationFundosPatch` exige array de exatamente 2 elementos com {peneira:string\|null, percentual:number\|null}.                                                                                                    |
| 2026-05-08 | `confirmClassificationFromCamera` aceita `reasonCode`/`reasonText` opcionais (commit `1aa4845`)                   | Default `'DATA_FIX'` / `'Reclassificacao via foto'` preserva compat. Frontend passa o que o `ClassificationReclassifyModal` coletou (commit `a2c7594`); backend repassa pro `updateClassification`.                                                                                                                                                                                          |
| 2026-05-08 | Sub-caminho 5 (reclassificação) agora funciona no Flow B (commit `a2c7594`)                                       | `handleConfirmClassification` detecta `contextSampleStatus === 'CLASSIFIED'` após cross-validation OK e vai pra `overwrite-confirm`. `mismatchOverwriteAfter` reativa quando CLASSIFIED + data-mismatch (operador clica "Aplicar" no DataMismatchModal → vai pra ReclassifyModal). Antes só funcionava no Flow A.                                                                            |
| 2026-05-08 | Projection `applyClassificationDataPatch` reescrito (commit `40d91e4`)                                            | `event-contract-db-service.js`: `CLASSIFICATION_DATA_KEYS` reduzido aos 6 flat fields. `peneiras`/`fundos`/`defeitos` tratados separadamente. peneiras+defeitos com merge campo a campo; fundos substitui inteiro (array de 2). `latestClassificationData` no Postgres agora reflete a ficha unificada.                                                                                      |
| 2026-05-08 | `validateClassificationForm` valida apenas peneiras + percentuais dos fundos como número                          | Os 6 campos de defeitos (imp/pva/broca/gpi/ap/defeito) viraram texto livre — sem validação numérica. Operador pode escrever "12", "ALTO", "0,5", etc. `parseInt` continua sendo tentado em `buildTechnicalFromClassificationData` pra `defectsCount`, mas tolera string não-numérica (vira `undefined`).                                                                                     |
| 2026-05-08 | Detail page edição rápida mantém `reasonCode='DATA_FIX'`/`reasonText='Edicao rapida'` hardcoded                   | Decisão do plano: edição rápida é correção pequena de campo, não reclassificação inteira. Para reclassificação com reason coletado, operador usa o botão "Reclassificar" que redireciona pra câmera (onde `ClassificationReclassifyModal` coleta).                                                                                                                                           |
| 2026-05-08 | 4 testes de integração novos cobrindo Q.cls.2.7 (commit `40d91e4`)                                                | (1) `completeClassification` aceita ficha unificada agrupada e persiste corretamente; (2) `confirmClassificationFromCamera` persiste reasonCode='TYPO' + reasonText custom no `CLASSIFICATION_UPDATED`; (3) fallback hardcoded quando reason omitido (compat); (4) `updateClassification` aceita patch com sub-objs e gera before/after corretos. Total integration:db: 144 testes passando. |
