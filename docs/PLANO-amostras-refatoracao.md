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
  - [ ] 1.2. Caminhos de classificação
- [ ] **Etapa 2** — Identificação de gargalos
- [ ] **Etapa 3** — Definição do plano de execução
  - [x] Fase 0 — Pré-requisito: PF sempre com ≥1 fazenda (definida + executada)
  - [x] Fase 0.1 — Defesa em profundidade da invariante PF ≥1 unit ACTIVE (definida + executada)
  - [x] Fase R — Refatoração do registro com filial obrigatória pra PF (definida + executada)
  - [ ] Fase D — Layout desktop do `/samples/new` (iterativa, em andamento)
  - [x] Fase P — Remove impressão do registro + lote numérico puro (definida)
  - [ ] Fase Pb — Impressão pós-classificação (futura, não definida)
  - [ ] Fase C — Refatoração da classificação (inclui unificação 3→1)
- [ ] **Etapa 4** — Execução
  - [x] Fase 0 (executada — commit `44fd144`)
  - [x] Fase 0.1 (executada — commit `d6f5d24`)
  - [x] Fase R (executada — commits `6d96aa7` + `62e54d7`)
  - [ ] Fase D (em andamento)
  - [ ] Fase P (próxima)
  - [ ] Fase Pb
  - [ ] Fase C

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

> A preencher.
>
> **Já mapeado em alto nível** (sessão atual): 3 fichas distintas por `ClassificationType` (`BICA`, `PREPARADO`, `LOW_CAFF`), config em `lib/classification-form.ts:161-282`. Extração via IA (GPT-4o) com 3 prompts + 3 schemas + 3 normalizadoras em `src/samples/classification-extraction-service.js`.
>
> **Pendente detalhar**: fluxo end-to-end (UI → upload → IA → revisão manual → persistência), eventos do event store gerados, auth, integração com a máquina de estados da amostra.

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

### Fase P — Remove impressão do registro + lote numérico puro

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

### Fase Pb — Impressão pós-classificação (futura, não definida)

Após Fase P + Fase C, definir:

- Quando dispara o `requestQrPrint` (auto após CLASSIFIED? botão manual?)
- Layout da etiqueta com dados de classificação (tipo, peneiras, defeitos)
- Estados pós-CLASSIFIED do sample
- Reaparecer card "Aguardando impressão" no dashboard

### Fase C — Refatoração da classificação

> A definir após Fase P (e talvez Fase Pb).
>
> Escopo confirmado: **unificação 3 fichas → 1 ficha única** (layout já desenhado e aprovado em PDF — ver histórico).

---

## 4. Histórico de decisões

| Data       | Decisão                                                                | Contexto                                                                                                                                                                              |
| ---------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-05-07 | Unificar 3 fichas de classificação em ficha única                      | Reduz complexidade do código (3 prompts IA → 1, 3 normalizadoras → 1, 3 layouts → 1). Layout final aprovado em PDF (Cat. estendida ao centro de P10, 2 FDs iguais, `=` centralizado). |
| 2026-05-07 | Plano vai cobrir registro + classificação no mesmo documento           | Os dois fluxos são acoplados; refatorar em conjunto evita retrabalho.                                                                                                                 |
| 2026-05-07 | PF sempre nasce com ≥1 fazenda (auto-create "Fazenda 1")               | Toda saca precisa rastreabilidade clara da origem. Auto-criar evita caso "PF com 0 units" e simplifica o registro de amostra (sempre há fazenda pra selecionar).                      |
| 2026-05-07 | PJ não tem filial — sucursais viram clientes PJ separados              | Cada CNPJ é um Client distinto. Decisão pré-existente do L5; explicitada no plano.                                                                                                    |
| 2026-05-07 | Auto-create silencioso quando `units: []` explícito                    | Trata `undefined` e `[]` igual. Garante invariante independente de como o caller chama.                                                                                               |
| 2026-05-07 | Helper `ensureDefaultPfUnit` em `client-support.js`                    | Isolado, testável em unit puro, reutilizável por imports futuros.                                                                                                                     |
| 2026-05-07 | Invariante PF≥1 unit só na app, sem trigger no banco                   | Único ponto de criação é `createClient`; trigger seria sobre-engenharia.                                                                                                              |
| 2026-05-07 | Fase 0.1 separada da Fase R                                            | Defesa em profundidade da invariante "PF ACTIVE tem ≥1 unit ACTIVE" no domínio de cliente. Fase R passa a confiar 100% nessa invariante.                                              |
| 2026-05-07 | `reactivateClient` auto-cria Fazenda 1 quando PF tem 0 units           | Mesma estratégia da Fase 0: garante invariante silenciosamente. UX não falha por dados pré-Fase 0.                                                                                    |
| 2026-05-07 | Fase R não toca SampleMovementModal                                    | Movements (vendas/perdas) é fluxo separado, mexe em buyer (não owner). Fica como "Fase R+1" se virar dor real.                                                                        |
| 2026-05-07 | Etiqueta QR mantém minimalista                                         | Hoje só mostra lote/safra/sacas + QR. Adicionar fazenda mexeria em layout físico térmico (Elgin L42 Pro). Vínculo fica no banco/UI por enquanto.                                      |
| 2026-05-07 | Fazenda incompleta no dropdown ganha `<IncompleteIcon />`              | Reusa o ícone SVG já presente em `components/clients/IncompleteIcon.tsx` (mesmo dos cards de cliente). Não bloqueia seleção.                                                          |
| 2026-05-07 | ClientLookupField em `/samples/new` vira só-cliente                    | Sem hierarquia inline de units. Seleção exclusiva pelo novo `OwnerUnitField`. Compat preservada — basta omitir `onSelectUnit`.                                                        |
| 2026-05-07 | Atalho "+ Nova fazenda" no dropdown abre `ClientUnitModal` reutilizado | Cadastra inline sem sair do registro de amostra. Após criar, auto-seleciona.                                                                                                          |
| 2026-05-07 | Fase D adicionada antes da Fase C, iterativa                           | Ajustes de layout desktop do `/samples/new` serão pedidos sob demanda. Constraints: mobile intacto, breakpoint ≥1024px, só visual.                                                    |
| 2026-05-07 | Etiqueta sai do registro e vai pra pós-classificação (Fase P + Pb)     | QR no registro era pro classificador escanear, mas a classificação hoje identifica lote sozinha (foto+AI). Etiqueta vale mais com dados completos pós-classificação.                  |
| 2026-05-07 | Lote vira numérico puro (sem `A-`)                                     | Mais simples de escrever na saca à mão, mais simples de comunicar. AI já tolera. Sem migration (L3.2 wipou prod).                                                                     |
| 2026-05-07 | Step `created` no modal mostra lote em destaque                        | Funcionário precisa anotar o lote na saca. Step pós-criação dentro do modal força a atenção ao número antes de seguir.                                                                |
| 2026-05-07 | Print pré-classificação fica como override manual                      | `requestQrPrint` continua aceitando REGISTRATION_CONFIRMED. Botão "Imprimir etiqueta" disponível como secundário na detail page.                                                      |
| 2026-05-07 | `startClassification` aceita REGISTRATION_CONFIRMED                    | Sem essa mudança, samples ficariam presos sem caminho pra frente. Mantém também `QR_PRINTED` (compat com fluxo legado).                                                               |
