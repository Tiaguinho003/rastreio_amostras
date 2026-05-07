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
  - [x] Fase 0 — Pré-requisito: PF sempre com ≥1 fazenda (definida)
  - [ ] Fase R — Refatoração do registro
  - [ ] Fase C — Refatoração da classificação (inclui unificação 3→1)
- [ ] **Etapa 4** — Execução
  - [x] Fase 0 (executada — commit `44fd144`)
  - [ ] Fase R
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

### Fase R — Refatoração do registro de amostra

> A definir. Depende da conclusão da Fase 0.
>
> Próximas decisões: seleção de filial pós-proprietário (PF mostra dropdown; PJ desabilitado), `ownerUnitId` obrigatório para PF, possíveis melhorias na máquina de 4 passos (ver gargalos identificados).

### Fase C — Refatoração da classificação

> A definir após Etapas 1 e 2.
>
> Escopo confirmado: **unificação 3 fichas → 1 ficha única** (layout já desenhado e aprovado em PDF — ver histórico).

---

## 4. Histórico de decisões

| Data       | Decisão                                                      | Contexto                                                                                                                                                                              |
| ---------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-05-07 | Unificar 3 fichas de classificação em ficha única            | Reduz complexidade do código (3 prompts IA → 1, 3 normalizadoras → 1, 3 layouts → 1). Layout final aprovado em PDF (Cat. estendida ao centro de P10, 2 FDs iguais, `=` centralizado). |
| 2026-05-07 | Plano vai cobrir registro + classificação no mesmo documento | Os dois fluxos são acoplados; refatorar em conjunto evita retrabalho.                                                                                                                 |
| 2026-05-07 | PF sempre nasce com ≥1 fazenda (auto-create "Fazenda 1")     | Toda saca precisa rastreabilidade clara da origem. Auto-criar evita caso "PF com 0 units" e simplifica o registro de amostra (sempre há fazenda pra selecionar).                      |
| 2026-05-07 | PJ não tem filial — sucursais viram clientes PJ separados    | Cada CNPJ é um Client distinto. Decisão pré-existente do L5; explicitada no plano.                                                                                                    |
| 2026-05-07 | Auto-create silencioso quando `units: []` explícito          | Trata `undefined` e `[]` igual. Garante invariante independente de como o caller chama.                                                                                               |
| 2026-05-07 | Helper `ensureDefaultPfUnit` em `client-support.js`          | Isolado, testável em unit puro, reutilizável por imports futuros.                                                                                                                     |
| 2026-05-07 | Invariante PF≥1 unit só na app, sem trigger no banco         | Único ponto de criação é `createClient`; trigger seria sobre-engenharia.                                                                                                              |
