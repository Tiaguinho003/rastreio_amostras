# Reset, Refatoracao e Reimport de Clientes (TEMPORARIO)

Status: Temporario — **DELETAR ao concluir todas as fases de Clientes**
Escopo: planejamento, analise profunda, decisoes e acompanhamento da
reorganizacao da base de clientes (auditoria + reset destrutivo + analise
profunda + import via planilha) antes de continuar registrando amostras.
Documentos relacionados: `docs/Clientes-e-Movimentacoes-Especificacao.md`,
`docs/API-e-Contratos.md`, `.claude/skills/prisma/SKILL.md`.

> **Aviso:** este documento existe apenas durante a execucao deste ciclo.
> Ao concluir todas as fases (L4 + analise profunda + ajustes derivados),
> ele deve ser deletado no commit que finaliza a ultima fase, junto com os
> artefatos em `tmp/` gerados pela execucao.

---

## 1. Contexto e motivacao

Apos as fases F7 (cliente↔filial) e F8 (remocao do legacy backfill), o
sistema esta funcionalmente solido mas:

- a **base de dados de clientes em prod tinha inconsistencias historicas**
  (CNPJs sinteticos, vinculos imprecisos);
- as **regras de negocio acumuladas estao espalhadas em commits**, nunca
  consolidadas em um unico documento operacional;
- a **planilha mestre do usuario** (~600 clientes; sera filtrada) e a
  fonte da verdade para o reimport.

A decisao operacional foi reorganizar em ondas:

1. **Auditar** a logica atual (L1 — read-only).
2. **Backup** das amostras existentes (L2 — para re-cadastro manual).
3. **Reset destrutivo** de clientes + amostras + dependentes (L3).
4. **Modo manutencao** para nao-ADMIN durante o resto do ciclo (M1).
5. **Analise profunda** das regras de Clientes (em andamento, secao 8–11).
6. **Limpeza GCS + reimport via planilha** (L3.5 + L4).
7. **Desativar manutencao** + limpeza final (M2 + secao 15).

Refactor de **amostras** (liga, tipos, subtipos) **nao faz parte deste
plano** — fica para depois que a base de clientes estiver consistente.

---

## 2. Estado pre-execucao em prod

Snapshot capturado no inicio da reorganizacao (referencia para validacao
pos-execucao):

| Tabela                 | Linhas                           |
| ---------------------- | -------------------------------- |
| `client`               | 36 (30 PJ + 6 PF)                |
| `client_branch` ATIVAS | 35                               |
| `sample`               | 58 (todas LIVE; A-5562 → A-5619) |
| `sample_event`         | 489                              |
| `sample_attachment`    | 44 (fotos de classificacao)      |
| `print_job`            | 85                               |
| `sample_movement`      | 0                                |

Ultima revisao em prod no momento do plano: `7880571`.

---

## 3. Regras nao-negociaveis

1. **Logica de amostras nao muda nesta janela.** Schema e service de
   `sample/sample_event/sample_attachment/print_job` ficam intactos.
2. **F7 (cliente↔filial) permanece valida.** PJ admite 1 branch ATIVA;
   PF admite 0..N. Trigger DB e validacoes service ficam.
3. **Ações destrutivas em prod precisam confirmacao explicita** do usuario
   (auto mode regra 5 + `feedback_no_deploy_without_commit` + politica
   de prod).
4. **Push e responsabilidade do usuario.** Eu posso commitar/buildar/
   deployar mas nao executo `git push` (memoria
   `feedback_push_is_user_only`).
5. **Quality gates obrigatorios** antes de cada commit/deploy: `lint`,
   `format:check`, `typecheck`, `build`, `validate:schemas`,
   `test:contracts`, `test:unit`, `test:integration:db`.
6. **Toda pergunta e resposta da analise profunda fica gravada no doc.**
   Cada Q-XX feita ao usuario vai em §9 (com contexto e opcoes); cada
   resposta vai em §10 (com decisao tomada + justificativa breve +
   implementacao prevista). Isso garante rastreabilidade das decisoes
   sem precisar reler o chat.

---

# Parte 1 — Fases concluidas

## 4. L1 — Auditoria read-only de clientes ✅

### Objetivo

Conferir, sem alterar nada, que a logica de clientes esta solida o
suficiente para ser preservada no reset.

### Resultado

3 Explore agents em paralelo + queries de integridade em prod
apresentaram:

- **Schema/DB**: 🟢 solido (FKs Restrict, triggers ativos, UNIQUE parciais
  corretos).
- **Service/API**: 🟢 maioria solida; 🟡 `updateClient` permite PF↔PJ;
  🟡 `getClient` sem filtro de status nas branches; 🔴 sem idempotency
  por requestId (relevante pra L4 — mitigado pelo wizard).
- **Frontend/Tests**: 🟢 contextualizacao F7.4 OK; 🟡 gaps de tests
  E2E para terminologia visual.
- **Estado em prod**: 36 clientes, 35 branches ativas, **0 inconsistencias**
  (regra F7.1B respeitada, R1.3 respeitada, cnpj_root sincronizado).

Decisoes derivadas (ver §20): bloquear troca PF↔PJ no `updateClient`,
dropar tabelas `*_deprecated_2026q2`, modal de conversao guiada
descartado.

## 5. L2 — Backup estruturado das 58 amostras ✅

### Objetivo

Antes de apagar amostras em L3, produzir artefato local que permita
re-cadastrar manualmente as amostras com fidelidade aos dados historicos.

### Resultado

`scripts/audits/samples-export.mjs` gerou:

- `tmp/samples-backup.json` (5.713 linhas, 58 amostras + 44 attachments
  com `gcsUri`).
- `tmp/samples-backup.csv` (1 linha por amostra, abrir no Excel).
- `tmp/samples-backup-attachments.csv` (1 linha por foto).
- `tmp/gsutil-download-script.sh` (44 comandos `gsutil cp` idempotentes).

## 6. L3 — Reset destrutivo + cleanup deprecated ✅

### Objetivo

Apagar todos os clientes/amostras/dependentes em prod e fechar a
**Phase 10** do plano F5.2 (drop definitivo das tabelas/colunas
`*_deprecated_2026q2`).

### Implementacao

- **Service `updateClient`**: bloqueio de troca de `personType` (422
  com `code='CLIENT_PERSON_TYPE_LOCKED'`).
- **Migration** `20260429210000_l3_reset_clients_and_samples`:
  1. `DROP TABLE client_registration_deprecated_2026q2 CASCADE` (libera
     a FK `client_registration_client_id_fkey`).
  2. `DROP COLUMN` em `sample.owner_registration_id_deprecated_2026q2`,
     `sample_movement.buyer_registration_*`, `client.cnpj_deprecated_2026q2`,
     `client.document_canonical_deprecated_2026q2`.
  3. `DISABLE TRIGGER` append-only de `sample_event` e
     `client_audit_event`.
  4. `DELETE` em ordem (filhos antes de pais).
  5. `ENABLE TRIGGER`.

### Estado pos-L3 em prod

- 0 clients, 0 branches, 0 samples, 0 events, 0 attachments, 0 print_jobs,
  0 client_audit_events.
- Schema 100% intacto (modelos, enums, triggers, indices F7/F8 preservados).
- Tabelas/colunas deprecated: TODAS dropadas.
- Fotos no Cloud Storage continuam intactas (limpeza fica para L3.5).

Commit em prod: **`1b85620`**.

## 7. M1 — Modo manutencao ✅ (ativado)

### Objetivo

Bloquear navegacao no app para nao-ADMIN durante L3.5/L4. ADMIN navega
normal.

### Implementacao

- `app/maintenance/page.tsx`: tela estatica com tema design system
  (gradient verde + card creme + logo), bloqueio de touch/scroll/select.
- `middleware.ts`: intercepta requisicoes; quando
  `process.env.MAINTENANCE_MODE === 'true'`, decodifica JWT do cookie
  `rastreio_session` (base64url puro, Edge runtime safe). ADMIN passa;
  outros recebem 307 redirect para `/maintenance`. Whitelist:
  `/maintenance`, `/login`, `/api/v1/auth`, `/api/health`, assets,
  `/manifest`, `/sw.js`, `/workbox-`, logos.
- `app/globals.css`: classes `.maintenance-page`, `.maintenance-card`,
  `.maintenance-logo`, `.maintenance-divider`, `.maintenance-title`,
  `.maintenance-message`, `.maintenance-footer`.

### Bug detectado e corrigido

Primeira ativacao quebrou login porque a whitelist tinha `/api/auth` mas
a rota real e `/api/v1/auth/login`. Corrigido em commit `de4a032`
(`/api/auth` → `/api/v1/auth`).

### Como ativar / desativar

- **Ativar**: `gcloud run services update rastreio-prod-app --update-env-vars=MAINTENANCE_MODE=true --project=safras-amostras-prod --region=southamerica-east1`.
- **Desativar**: `gcloud run services update rastreio-prod-app --remove-env-vars=MAINTENANCE_MODE --project=safras-amostras-prod --region=southamerica-east1`.

Commit em prod: **`de4a032`** (revisao Cloud Run `00172-beg` + env override
`00126-tzb`). **Manutencao atualmente ATIVA**.

---

# Parte 2 — Analise profunda em andamento

## 8. Estado atual consolidado de Clientes

Esta secao mapeia, em um lugar so, **tudo que esta em vigor hoje** sobre
Clientes. Nao avalia — apenas descreve. A revisao critica fica em §9.

### 8.1 Modelo de dados

- **`Client`**: PF ou PJ, status ACTIVE/INACTIVE, role flags (`isBuyer` OR
  `isSeller`), code autoincrement UNIQUE, audit trail.
- **`ClientBranch`**: filiais (PJ matriz unica) ou fazendas (PF 0..N),
  CNPJ proprio (UNIQUE parcial), IE proprio (UNIQUE parcial),
  `isPrimary` UNIQUE parcial por client, code sequencial por client,
  status ACTIVE/INACTIVE.
- **`ClientCommercialUser`**: N:N entre Client e User, PK composta
  `(clientId, userId)`, sem hierarquia.
- **`ClientAuditEvent`**: append-only, eventType enum, payload JSONB,
  FK Restrict para `targetClientId` e `targetBranchId`.

### 8.2 Triggers e invariantes ativas no DB

| Trigger / CHECK                                  | Onde                 | O que enforca                                                                             |
| ------------------------------------------------ | -------------------- | ----------------------------------------------------------------------------------------- |
| `trg_enforce_pj_single_active_branch` (F7.1B)    | `client_branch`      | PJ admite no maximo 1 branch ATIVA. Escape valve: `app.allow_split_wizard='on'`.          |
| `trg_reject_client_audit_event_*` (append-only)  | `client_audit_event` | Bloqueia UPDATE/DELETE. Escape valve: `app.allow_audit_mutation='wizard_f51'`.            |
| `trg_assert_client_has_commercial_user_*` (R1.3) | join + client.status | Client ACTIVE precisa ter ≥1 commercial_user. CONSTRAINT TRIGGER DEFERRABLE.              |
| `chk_client_person_type_fields`                  | `client`             | PF: fullName + cpf; PJ: legalName + cpf NULL. Recriado em F7.1A sem ref a `*_deprecated`. |
| `chk_client_role_flags`                          | `client`             | `is_buyer OR is_seller`.                                                                  |
| `chk_sample_owner_branch_requires_client`        | `sample`             | branch_id NULL OR client_id NOT NULL.                                                     |
| `uq_client_cpf` (parcial)                        | `client.cpf`         | UNIQUE WHERE NOT NULL. PF only.                                                           |
| `uq_client_branch_cnpj` (parcial)                | `client_branch.cnpj` | UNIQUE WHERE NOT NULL. Garante que CNPJ aparece em uma matriz unica.                      |
| `uq_client_branch_primary_per_client` (parcial)  | `client_branch`      | 1 isPrimary por client.                                                                   |

### 8.3 Regras de negocio em vigor (acumuladas)

| Fase    | Regra                                                                                                                                    |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| F1.R1.3 | Client ACTIVE precisa de ≥1 commercial_user (trigger DEFERRABLE).                                                                        |
| F6.0    | Inativar matriz auto-promove proxima branch ACTIVE por `code asc`. Atualiza `cnpjRoot` do client conforme nova matriz.                   |
| F6.1    | CPF/CNPJ validados por checksum (mod 11). Mascara visual on-the-fly. Lookup hierarquico por 14 digitos exatos retorna `matchedBranchId`. |
| F7      | PJ admite 1 branch ATIVA; PF admite 0..N (fazendas com CNPJ/CAR/IE opcionais).                                                           |
| F7.1A   | Drop UNIQUE em `cnpj_root` (clients distintos podem compartilhar raiz). Recriado `chk_client_person_type_fields` sem ref deprecated.     |
| F7.1B   | Trigger DB que enforca PJ ≤ 1 branch ATIVA (com escape valve para wizards).                                                              |
| F7.2'   | Wizard de consolidacao destrutiva (executado em prod): COOPERCITRUS e COFCO consolidados em 1 branch cada.                               |
| F7.3    | Backend rejeita 2a branch ATIVA em PJ com 409 `code='PJ_BRANCH_LIMIT'`.                                                                  |
| F7.4    | UX contextualizada: PF mostra "Fazenda"; PJ mostra "Filial"/"Matriz". Banner empty-state PJ pede "Cadastre o CNPJ".                      |
| L3      | `updateClient` rejeita troca de `personType` com 422 `code='CLIENT_PERSON_TYPE_LOCKED'`.                                                 |

### 8.4 Fluxos principais

| Fluxo                        | Pontos-chave                                                                                                                                        |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Criar PJ**                 | `POST /clients` com `personType='PJ'`, `legalName`, `branches: [{ isPrimary: true, cnpj }]`. cnpjRoot derivado da primary. assertCnpjRootAvailable. |
| **Criar PJ transient**       | `POST /clients` com `branches: []`. cnpjRoot=null. Frontend roteia para `/clients/:id` para configurar matriz.                                      |
| **Criar PF**                 | `POST /clients` com `personType='PF'`, `fullName`, `cpf` (opcional). Sem branches inicialmente.                                                     |
| **Adicionar fazenda (PF)**   | `POST /clients/:id/branches` com cnpj/CAR/IE opcionais. F7.3 nao bloqueia (PF aceita 0..N).                                                         |
| **Tentar 2a filial em PJ**   | Bloqueado por F7.3 backend (409 PJ_BRANCH_LIMIT) e por F7.1B trigger DB. UI esconde o botao "Nova filial" preventivamente.                          |
| **Editar dados gerais (PJ)** | `PATCH /clients/:id`. PF↔PJ bloqueado por L3. Permite mudar legalName/tradeName/phone/role flags.                                                   |
| **Inativar matriz (PJ)**     | `POST /clients/:id/branches/:branchId/inactivate`. Auto-promove proxima ATIVA por code asc; atualiza cnpjRoot; se nenhuma → cnpjRoot=null.          |
| **Inativar cliente**         | `POST /clients/:id/inactivate`. Sem bloqueio por FK (samples vinculadas continuam — apenas registra impacto no audit).                              |
| **Reativar cliente**         | `POST /clients/:id/reactivate`. Trigger DEFERRABLE valida invariante R1.3 no commit.                                                                |
| **Lookup hierarquico**       | `POST /clients/lookup`. F6.1: smart resolve por 14 digitos; PJ retorna 1 linha; PF expande fazendas.                                                |
| **Vincular comercial**       | `POST/DELETE /clients/:id/users`. R1.3 enforce ≥1 user em client ACTIVE.                                                                            |

### 8.5 API (~17 endpoints em `app/api/v1/clients/**`)

- `GET /clients` (lista, filtros, paginacao 1..30)
- `POST /clients` (createClient + branches inline)
- `GET /clients/:id` (detail + branches)
- `PATCH /clients/:id` (updateClient — sem trocar personType)
- `POST /clients/lookup` (smart resolve)
- `POST /clients/:id/inactivate` / `reactivate`
- `GET /clients/:id/impact` (samples + movements + branches ATIVAS)
- `GET /clients/:id/audit`
- `GET /clients/:id/samples` (listClientSamples — paginado)
- `GET /clients/:id/purchases` (listClientPurchases — movimentos como buyer)
- `GET /clients/:id/commercial-summary`
- `GET /clients/:id/branches`
- `POST /clients/:id/branches`
- `GET /clients/:id/branches/:branchId`
- `PATCH /clients/:id/branches/:branchId`
- `POST /clients/:id/branches/:branchId/inactivate` / `reactivate`
- `GET /clients/:id/users` / `POST /users` / `DELETE /users/:userId`

### 8.6 UX e telas

- **`/clients`** (lista): busca, filtros (status, role flags, comercial),
  paginacao, link de detalhes.
- **`/clients/[clientId]`** (detail): tabs **Geral** + **Comercial**;
  cards de Filiais/Fazendas (terminologia contextual F7.4); banner empty
  PJ "Cadastre o CNPJ"; modal `ClientBranchModal` para create/edit.
- **`ClientLookupField`** (hierarquico): PJ 1 linha; PF expande fazendas.
- **`ClientQuickCreateModal`**: PF (fullName + cpf opcional) ou PJ
  (legalName + tradeName + cnpj inline). Validacao checksum F6.1.
- **`/maintenance`** (M1): bloqueio nao-ADMIN durante operacoes.

### 8.7 Tests

- `tests/client-backend.integration.test.js`: 45+ subtestes cobrindo CRUD,
  F6.0 auto-promote, F6.1 lookup, F7.3 PJ_BRANCH_LIMIT (positivo + negativo),
  R1.3, audit events, L3 bloqueio PF↔PJ.
- `tests/client-support.test.js`: 14 subtestes de normalizadores e
  buildDisplayName.
- `tests/helpers/cnpj-generator.js`: `generateValidCnpj`, `generateValidCpf`,
  `VALID_CPFS`. Total integration: 133 verde.

---

## 9. Pontos de revisao (🟢/🟡/🔴) — perguntas para o usuario

Itens identificados na auditoria L1 que nao sao bloqueantes mas merecem
decisao consciente. Cada item traz **1 pergunta direta** para o usuario
responder na proxima rodada.

### 🟢 Manter (sem mudancas)

- Triggers append-only + escape valves (R1.3, F7.1B, audit append-only).
- Cardinalidade F7 (PJ=1, PF=0..N).
- UNIQUE parciais (cpf, cnpj, registration_canonical, isPrimary).
- Lookup hierarquico F6.1 + smart resolve por 14 digitos.
- Auto-promote F6.0 ao inativar matriz.
- Bloqueio L3 PF↔PJ no `updateClient`.

### 🟡 Atencao — perguntas

| ID   | Item                                                                          | Pergunta                                                                                                                      |
| ---- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Q-01 | `getClient` retorna **todas** as branches (incluindo INACTIVE).               | Manter assim (frontend filtra) ou aceitar query param `?onlyActive=true` para listagens limpas?                               |
| Q-02 | Sem idempotencia por `requestId` em endpoints (retry duplo cria 2 registros). | Vale adicionar idempotencia em `POST /clients` antes do L4 wizard, ou aceitar que wizard tem propria idempotencia (CPF/CNPJ)? |
| Q-03 | Tests E2E nao cobrem terminologia visual contextual (Fazenda/Filial/Matriz).  | Adicionar tests E2E (Playwright) dessas verificacoes ou aceitar gap?                                                          |
| Q-04 | PF aceita CPF NULL (nao obrigatorio). Planilha pode trazer CPF para todos?    | Tornar CPF obrigatorio em PF, ou continuar opcional (algumas pessoas fisicas nao tem CPF cadastrado mesmo)?                   |
| Q-05 | Inativar cliente com samples ATIVAS vinculadas e permitido (apenas audita).   | Manter (historico) ou bloquear com 409 e exigir movimentacao previa?                                                          |
| Q-06 | PJ transient (sem branch) e estado valido. Cliente sem CNPJ pode existir.     | Manter como hoje (usado pelo fluxo "criar e configurar depois") ou exigir CNPJ inline em todo `POST /clients` PJ?             |
| Q-07 | `code` autoincrement de Client e ClientBranch nao foi resetado em L3.         | Resetar para 1 antes do reimport (`ALTER SEQUENCE … RESTART`), ou continuar do proximo numero (numeros altos pos-L3)?         |

### Perguntas derivadas — em andamento

**Status**: Q-07/Q-08/Q-09 ja respondidas/sugeridas (ver §10).
Q-10 expandida em Q-10a–Q-10f abaixo (mapeamento exaustivo de campos
antes de definir politica de completude). Q-11 adiada ate Q-10
fechar.

#### Q-10a — Mapeamento exaustivo dos campos de Cliente/Filial/Fazenda

Antes de decidir quais campos disparam aviso de "incompleto" (Q-10
original), o usuario pediu **revisar exaustivamente todos os campos**
existentes hoje, identificar lacunas, e so depois decidir.

**Campos atuais em `Client`** (todos os personTypes):

| Campo        | Tipo      | Obrigatorio hoje | Notas                                      |
| ------------ | --------- | ---------------- | ------------------------------------------ |
| `id`         | UUID      | sistema          | gerado                                     |
| `code`       | int       | sistema          | autoincrement                              |
| `personType` | PF \| PJ  | ✅ sim           | imutavel pos-criacao (L3)                  |
| `fullName`   | string    | so PF (CHECK)    |                                            |
| `legalName`  | string    | so PJ (CHECK)    |                                            |
| `tradeName`  | string    | nao              | "fantasia" da PJ                           |
| `cpf`        | string    | opcional (Q-04)  | UNIQUE parcial (PF)                        |
| `cnpjRoot`   | string    | sistema          | derivado dos 8 primeiros do CNPJ da matriz |
| `phone`      | string    | ✅ sim           | 10 ou 11 digitos                           |
| `isBuyer`    | bool      | ✅ sim           | role flag                                  |
| `isSeller`   | bool      | ✅ sim           | role flag (CHECK: ao menos um true)        |
| `status`     | ACT/INACT | sistema          | default ACTIVE                             |
| `createdAt`  | timestamp | sistema          |                                            |
| `updatedAt`  | timestamp | sistema          |                                            |

**Campos atuais em `ClientBranch`** (matriz PJ ou fazenda PF):

| Campo                         | Tipo      | Obrigatorio hoje     | Notas                                               |
| ----------------------------- | --------- | -------------------- | --------------------------------------------------- |
| `id`                          | UUID      | sistema              |                                                     |
| `clientId`                    | UUID FK   | sistema              | Restrict                                            |
| `code`                        | int       | sistema              | sequencial por client                               |
| `isPrimary`                   | bool      | sistema              | UNIQUE parcial: 1 primary por client                |
| `name`                        | string    | nao                  | apelido interno (ex: "Fazenda Boa Vista")           |
| `cnpj`                        | string    | PJ matriz: ✅ (Q-09) | UNIQUE parcial; PF opcional (CNPJ produtor)         |
| `cnpjOrder`                   | string    | sistema              | 4 digitos do meio do CNPJ (derivado)                |
| `legalName`                   | string    | nao                  | razao social da branch (geralmente igual ao client) |
| `tradeName`                   | string    | nao                  | fantasia da branch                                  |
| `phone`                       | string    | nao                  | telefone da branch                                  |
| `addressLine`                 | string    | nao                  | logradouro                                          |
| `district`                    | string    | nao                  | bairro                                              |
| `city`                        | string    | nao                  |                                                     |
| `state`                       | UF (2)    | nao                  |                                                     |
| `postalCode`                  | string    | nao                  | CEP                                                 |
| `complement`                  | string    | nao                  |                                                     |
| `registrationNumber`          | string    | nao                  | IE estadual ou CAR (rural)                          |
| `registrationNumberCanonical` | string    | sistema              | UNIQUE parcial; derivado de `registrationNumber`    |
| `registrationType`            | string    | nao                  | ex: "estadual", "municipal", "CAR"                  |
| `status`                      | ACT/INACT | sistema              |                                                     |
| `createdAt`                   | timestamp | sistema              |                                                     |
| `updatedAt`                   | timestamp | sistema              |                                                     |

**Campos que NAO existem hoje mas podem ser uteis** (a decidir):

- `email` (no Client e/ou Branch) — para notificacoes e contato.
- Campo explicito de `car` (Cadastro Ambiental Rural) separado do
  `registrationNumber`/`registrationType` — facilita filtro/relatorio.
- Campo de `municipalRegistration` (IM) separado da IE.
- Capacidade de armazenagem da fazenda/matriz (sacas).
- Socio responsavel / representante legal.

**Perguntas pontuais para fechar Q-10**:

| ID    | Pergunta                                                                                                                                                |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q-10a | A tabela acima representa todos os campos? Falta algum? (email? CAR explicito? IM? capacidade? representante?)                                          |
| Q-10b | **PF (Client)**: alem de `fullName` + `phone` + `isBuyer/isSeller` (ja obrigatorios), quais campos ficam OBRIGATORIOS no cadastro (rejeita salvar sem)? |
| Q-10c | **PF (Client)**: quais campos ficam RECOMENDADOS (salva mas dispara aviso de incompleto)?                                                               |
| Q-10d | **PF Fazenda (ClientBranch)**: quais campos sao obrigatorios? Quais sao recomendados? (PF pode ter 0 fazendas — nesse caso o aviso e zero?)             |
| Q-10e | **PJ (Client)**: alem de `legalName` + `phone` + `isBuyer/isSeller` + CNPJ na matriz (Q-09), quais campos ficam obrigatorios? Quais recomendados?       |
| Q-10f | **PJ Matriz (ClientBranch primary)**: alem de CNPJ (Q-09), quais campos sao obrigatorios? Quais recomendados?                                           |

#### Q-11 — Onde aparece o aviso (ADIADA)

Usuario adiou ate fechar Q-10. Direcao tentativa: filtros + emoji + cor
diferente no card. Sera reaberta apos a politica de completude estar
definida.

### 🔴 Mudar — pendente confirmacao

(Nenhum item bloqueante remanescente apos as decisoes de §20.)

---

## 10. Decisoes pos-analise (gravadas conforme respostas)

> Cada decisao traz: ID da pergunta, decisao tomada, justificativa, e
> implementacao prevista. Conforme §3.6, toda Q&A vai aqui.

### Q-01 — `getClient` filtro de branches ✅

- **Decisao**: aceitar query param `?onlyActive=true` em `GET /clients/:id`
  e em `GET /clients/:id/branches`.
- **Justificativa**: listagens "limpas" sem precisar filtrar no frontend;
  comportamento explicito.
- **Implementacao**: `getClient` no service ganha opcao
  `{ onlyActiveBranches?: boolean }`. Route handler le query param.
  Retrocompativel (default = `false`, retorna tudo).

### Q-02 — Idempotencia por requestId em `POST /clients` ✅

- **Decisao**: adicionar suporte a header `Idempotency-Key` em
  `POST /clients` (e tambem em `POST /clients/:id/branches`).
- **Justificativa**: protege contra retry duplo (rede instavel, click
  duplo no front). Wizard L4 ja tem idempotencia propria por CPF/CNPJ,
  mas o caminho UI tambem deve ser seguro.
- **Implementacao**: tabela nova `idempotency_record` (clientId
  opcional, scope = endpoint, key = header, status, createdAt) ou
  reuso do mecanismo de eventos. Decidir antes de codar; documentar
  em `docs/API-e-Contratos.md`.

### Q-03 — Tests E2E para terminologia visual ⏸️

- **Decisao**: nao adicionar agora. So sob demanda especifica (ex:
  "quero garantir que o botao 'Nova fazenda' aparece em PF").
- **Justificativa**: coverage de logica via integration tests ja e alto;
  tests E2E (Playwright) sao caros de manter.
- **Implementacao**: nenhuma agora. Skill `tests` continua sem mencionar
  Playwright; quando o usuario pedir um caso especifico, adicionamos
  pontual.

### Q-04 — CPF opcional em PF ✅

- **Decisao**: manter CPF opcional em PF (status quo).
- **Justificativa**: alguns produtores nao tem CPF cadastrado e ainda
  precisam aparecer no sistema; politica de completude (Q-10/11) cobre
  o aviso para o responsavel completar depois.
- **Implementacao**: nenhuma mudanca de schema. Schema de validacao
  da importacao (L4) aceita PF sem CPF, marca como "incompleto".

### Q-05 — Inativar cliente com amostras ATIVAS ✅

- **Decisao**: bloquear inativacao direta. UI mostra modal explicando
  as amostras vinculadas, com 2 acoes:
  - **Cancelar** (nao faz nada).
  - **Confirmar** (inativa cliente E inativa em cascata as amostras
    listadas, com audit em ambos os lados).
- **Justificativa**: evitar inativacao "silenciosa" que deixa amostras
  orfas de cliente ativo.
- **Implementacao**:
  - Backend: `inactivateClient` ganha endpoint paralelo
    `POST /clients/:id/inactivate-with-cascade` que recebe
    `{ confirmedSampleIds: string[] }`. Service valida que ids batem
    com amostras ATIVAS do cliente, inativa cliente + amostras numa
    transacao com audit em ambos.
  - Endpoint atual `POST /clients/:id/inactivate` passa a retornar 409
    `code='CLIENT_HAS_ACTIVE_SAMPLES'` com `details.activeSampleIds`
    quando ha amostras ativas.
  - Frontend: detail do cliente intercepta 409, abre modal listando
    as amostras (link clicavel, nome do lote, data), e em "Confirmar"
    chama o endpoint cascade.
- **Definir em Q-08**: o que exatamente conta como "amostra ativa".

### Q-06 — PJ exige CNPJ obrigatorio ✅

- **Decisao**: PJ NAO pode existir sem CNPJ (nem transient).
- **Justificativa**: identidade fiscal de PJ depende do CNPJ; cliente sem
  CNPJ nao tem como ser referenciado em nota fiscal.
- **Implementacao**:
  - Service `createClient`: rejeita 422
    `code='PJ_REQUIRES_CNPJ'` se `personType === 'PJ'` e
    `branches.length === 0` ou primeira branch sem `cnpj`.
  - Frontend `ClientQuickCreateModal`: campo CNPJ vira obrigatorio
    para PJ; remove o caminho "criar transient e configurar depois".
  - Banner empty-state "Esta empresa ainda nao tem CNPJ" some (estado
    nao existira mais).
  - L3 ja zerou o DB; nao ha PJs em prod sem CNPJ. Sem migracao de
    dados necessaria.
- **Definir em Q-09**: se essa regra vale para "rascunho" (provavel
  decisao: nao ha rascunho).

### Q-07 — Reset das sequences `code` antes de reimport ✅

- **Decisao**: `RESTART` das sequences de `client.code` e
  `client_branch.code` antes do reimport. Primeiro cliente novo recebe
  `code=1`.
- **Justificativa**: numeros baixos sao mais legiveis em conversas,
  relatorios e laudos. Como o DB foi totalmente zerado em L3, nao ha
  conflito com dados antigos.
- **Implementacao**: pequena migration L4-pre (ou bloco no proprio
  wizard L4) com:
  ```sql
  ALTER SEQUENCE client_code_seq RESTART WITH 1;
  ALTER SEQUENCE client_branch_code_seq RESTART WITH 1;
  ```
  Idempotente — rerun em DB vazio nao causa efeito colateral.

### Q-08 — Definicao de "amostra ativa" + status pos-cascade ✅

- **Decisao**:
  - **"Amostra ativa" para o aviso** = `status NOT IN ('INVALIDATED')`.
    Inclui: `PHYSICAL_RECEIVED`, `REGISTRATION_IN_PROGRESS`,
    `REGISTRATION_CONFIRMED`, `QR_PENDING_PRINT`, `QR_PRINTED`,
    `CLASSIFICATION_IN_PROGRESS`, `CLASSIFIED`.
  - **Status final pos-cascade** = `INVALIDATED` (status terminal ja
    existente).
  - **Audit**: `SAMPLE_INVALIDATED` em cada amostra com payload
    `{ reason: 'OWNER_INACTIVATED', inactivatedClientId, inactivatedClientName, batchId }`;
    `CLIENT_INACTIVATED` no cliente com payload listando
    `cascadedSampleIds`.
- **Justificativa**: reusa `INVALIDATED` (sem schema novo); motivo
  no payload distingue de outras invalidacoes.
- **Implementacao prevista**: metodo
  `inactivateClientWithCascade(clientId, sampleIds, reasonText, actor)`
  no service; endpoint
  `POST /clients/:id/inactivate-with-cascade`.

### Q-10a — Campos novos a adicionar ao schema ✅

- **Decisao**: adicionar **2 campos novos**:
  - `email` em `Client` (texto opcional). Util para PF e PJ.
  - `car` em `ClientBranch` (texto opcional, separado de
    `registrationNumber`). Especifico para fazendas PF; PJ matriz nao
    precisa.
- **Justificativa**: email e canal de contato moderno; CAR e legalmente
  diferente de IE/IM e deve ter campo proprio para filtro/relatorio.
- **Implementacao prevista**: migration nova adicionando colunas (ambas
  nullable; sem CHECK).

### Q-10b — Obrigatorios em PF (Client) ✅

- **Decisao**: apenas `fullName` e `phone` permanecem obrigatorios no
  cadastro (status quo). `isBuyer`/`isSeller` ja eram obrigatorios via
  CHECK.
- **Justificativa**: usuario quer cadastro rapido; demais campos viram
  recomendados (ver Q-10c/d).
- **Implementacao**: nenhuma mudanca de schema (status quo).

### Q-10c — Recomendados em PF (Client) — quando avisar incompleto ✅

- **Decisao**: nao avisar durante o cadastro. Apos o registro, avisar
  quando estiver incompleto.
- **Lista de campos recomendados em PF Client**: `cpf`, `email`,
  qualquer dado adicional do PF (a fechar com Q-11). Por enquanto:
  PF e considerado "incompleto" se faltar **qualquer um** desses.
- **Implementacao prevista**: helper `isClientComplete(client)` em
  backend e frontend que retorna `{ complete: boolean, missing: string[] }`.

### Q-10d — Fazendas em PF + completude ✅

- **Decisao**: PF aceita 0..N fazendas (regra F7 mantida). Mas PF **sem
  nenhuma fazenda e considerado INCOMPLETO**. Aviso aparece no detail
  do cliente.
- **Justificativa**: produtor PF sem fazenda nao tem onde produzir; a
  ausencia indica cadastro pendente.
- **Implementacao prevista**: regra de completude
  `pf.branches.length === 0 → incompleto`. Aviso na UI; no backend o
  helper retorna `missing: ['farms']`.

### Q-10e/f — Estrutura matriz separada para PJ → reorganizar (L5) ✅

- **Pergunta original**: quais campos da matriz PJ sao obrigatorios e
  quais sao recomendados.
- **Insight surgido na revisao**: sob F7 (PJ admite 1 branch ATIVA),
  manter `Client` e `ClientBranch matriz` separados duplica dados
  (legalName, tradeName, phone) e cria UX confusa. Faz mais sentido ter
  todos os dados de PJ direto no `Client`.
- **Decisao do usuario** (confirmada): seguir caminho A — simplificar
  agora, antes do L4 reimport. Momento ideal: DB esta vazio (L3 zerou),
  wizard fica mais simples, UX fica natural.
- **Pos-L5**: PJ tem todos os dados em `Client` direto; `ClientBranch`
  serve apenas para fazendas PF. Detalhes de implementacao em §12.5.
- **Q-10f extinta**: nao existe mais "matriz PJ" como branch separada.
- **Q-10e re-aberta sob L5**: precisa redefinir obrigatorios/
  recomendados de `Client` PJ pos-L5 (campos novos: cnpj, endereco,
  IE, email). Ver D1 abaixo.

### Q-09 — PJ exige CNPJ obrigatorio (banco + app) ✅

- **Decisao**: PJ NUNCA pode existir sem ao menos 1 branch com CNPJ.
  Validacao em **dois niveis**: (a) service (422 amigavel ja
  implementado em Q-06); (b) trigger no banco (defesa em profundidade,
  protege contra qualquer codigo que tente burlar).
- **Justificativa**: identidade fiscal de PJ depende do CNPJ. Sem ele,
  o cliente nao consegue ser referenciado em nota fiscal nem em
  processos comerciais.
- **Implementacao prevista**:
  - Trigger DB `fn_assert_pj_has_cnpj_branch()` em estilo similar ao
    R1.3 (CONSTRAINT TRIGGER DEFERRABLE INITIALLY DEFERRED). Dispara
    em INSERT/UPDATE de `client` (apenas quando `person_type='PJ'`)
    e em DELETE/UPDATE de `client_branch` (quando branch sai do PJ).
    Verifica que existe ao menos 1 ClientBranch com `cnpj IS NOT NULL`
    para o client. Se nao, RAISE EXCEPTION.
  - DEFERRED garante que `INSERT client + INSERT branch` na mesma tx
    nao gera falso-positivo (validacao corre no commit).
  - Migration nova `<TS>_pj_requires_cnpj_branch_trigger`.
  - Service ja implementa o 422 (Q-06). Wizard L4 valida no parse do
    CSV antes de tentar inserir.
  - **Pos-L5**: trigger simplifica para verificar
    `client.cnpj IS NOT NULL` quando `personType='PJ'` (CNPJ vai estar
    direto no `Client`, nao mais em branch separada). Detalhes em §12.5.

### Q-12 — Obrigatorios / recomendados em `Client` PJ pos-L5 ✅

- **Decisao**: dos campos novos (cnpjOrder e cnpjRoot derivados ja
  existem como sistema):
  - **Obrigatorios** (CHECK no DB, ja existentes ou ja decididos):
    `legalName`, `phone`, `cnpj` (Q-09), `isBuyer`/`isSeller`. Nenhum
    novo obrigatorio.
  - **Recomendados** (salva, mas marca cliente como incompleto + aviso
    UI): `tradeName`, `registrationNumber` (IE), `addressLine`,
    `district`, `city`, `state`, `postalCode`, `complement`, `email`.
  - **Opcionais puros** (sem aviso): nenhum.
- **Campo dropado da proposta L5**: `registrationType`. Justificativa:
  como o unico tipo de inscricao em PJ sera Inscricao Estadual (IE),
  o `registrationType` vira redundante; `registrationNumber` ja
  carrega a IE. Schema final do `Client` PJ nao tem essa coluna.
- **Justificativa geral**: cadastro rapido (ninguem fica preso por
  campo opcional faltando), mas todos os campos relevantes contam pro
  helper `isClientComplete`. Politica conservadora — o usuario sera
  notificado pra completar tudo, sem bloquear o fluxo.
- **Implementacao prevista**:
  - Migration L5: `ALTER TABLE client ADD COLUMN` para os 9 campos
    recomendados (todos NULLABLE; sem CHECK adicional alem do
    `chk_client_person_type_fields`).
  - Helper `isClientComplete`: PJ esta incompleto se qualquer um dos
    9 recomendados for NULL.
  - **NAO adicionar**: `registrationType` (decisao acima).
- **Atualiza §12.5**: schema-alvo de `Client` reflete decisao acima.

### Q-13 — Obrigatorios / recomendados em `ClientBranch` (fazenda PF) pos-L5 ✅

- **Decisao** (campos da fazenda PF):
  - **Obrigatorios** (CHECK no DB):
    - `name` (apelido — ex "Fazenda Boa Vista"). Justificativa: quando
      PF tem mais de uma fazenda, distinguir vira critico; quando tem
      uma so, o nome ainda e dado fundamental do imovel rural.
    - `clientId` (FK ja existente).
  - **Recomendados** (salva, mas marca PF como incompleto):
    `cnpj`, `phone`, `addressLine`, `district`, `city`, `state`,
    `postalCode`, `registrationNumber` (IE), `car`.
  - **Opcionais puros**: `legalName`, `tradeName`, `complement`.
- **Campo dropado**: `registrationType`. Mesma justificativa de Q-12 —
  unico tipo de inscricao sera IE. Como a coluna ja existe em
  `client_branch`, a migration L5 fara `DROP COLUMN registration_type`
  (DB vazio = sem perda de dado).
- **Decisao adicional sobre `cnpj` em fazenda PF**: classificado como
  **recomendado**, mesmo sendo raro produtor PF ter CNPJ. Razao: quando
  existe, e dado fiscal importante; o helper `isClientComplete`
  apontara que falta, e o usuario decide se preenche ou nao.
- **`isPrimary`**: tratamento decidido em Q-15 (proxima).
- **Implementacao prevista**:
  - Migration L5:
    - `ALTER TABLE client_branch ADD COLUMN car` (nullable).
    - `ALTER TABLE client_branch DROP COLUMN registration_type`.
    - `ALTER TABLE client_branch ALTER COLUMN name SET NOT NULL` +
      atualizar `chk_client_person_type_fields` ou novo CHECK
      garantindo `name` nao vazio.
  - Helper `isClientComplete`: PF incompleto se qualquer das 9
    recomendadas faltarem em **alguma** fazenda OU PF tiver 0
    fazendas (Q-10d) OU campo recomendado de Client faltar (Q-10c).

### Q-14 — Renomear `ClientBranch` → `ClientUnit` ("Unidade") ✅

- **Decisao**: renomear `ClientBranch` para `ClientUnit` (rotulo PT-BR:
  **Unidade**). O termo "branch" (filial) era correto sob F5/F6 mas
  perdeu sentido pos-L5 (PJ nao tem mais branch e PF tem fazendas).
  "Unidade" cobre fazenda, sitio, gleba, lote — vocabulario do
  produtor rural sem forcar o rotulo "fazenda".
- **Justificativa**: clareza semantica permanente. DB vazio +
  L5 ja toca tudo = momento ideal. PT-BR alinhado com codigo.
- **Escopo do rename**:
  - **DB**: `client_branch` → `client_unit`; indexes/constraints
    renomeados (`uq_client_branch_*` → `uq_client_unit_*`); FK
    columns: `sample.owner_branch_id` → `sample.owner_unit_id`;
    `sample_movement.buyer_branch_id` → `sample_movement.buyer_unit_id`;
    `client_audit_event.target_branch_id` →
    `client_audit_event.target_unit_id`.
  - **Schema Prisma**: model `ClientBranch` → `ClientUnit`; enum
    `ClientBranchStatus` → `ClientUnitStatus`; relations renomeadas
    (`Sample.ownerBranch` → `Sample.ownerUnit`, etc.).
  - **Service**: `createBranch` → `createUnit`,
    `inactivateBranch` → `inactivateUnit`, etc.
  - **API**: `/clients/:id/branches` → `/clients/:id/units`;
    `/clients/:id/branches/:branchId` →
    `/clients/:id/units/:unitId`.
  - **Frontend**: `ClientBranchModal` → `ClientUnitModal`;
    rotulos UI "Filial"/"Fazenda" → "Unidade" onde aplicavel
    (terminologia contextual F7.4 mantem "Fazenda" so onde o
    contexto e PF rural).
  - **Audit events**: enum `ClientAuditEventType` ja tem
    `CLIENT_BRANCH_CREATED/UPDATED/INACTIVATED/REACTIVATED`. Postgres
    nao remove enum value — adicionar
    `CLIENT_UNIT_CREATED/UPDATED/INACTIVATED/REACTIVATED`; deprecar
    os antigos (mantidos no enum so para deserializar audits
    historicos; novo codigo so emite os novos).
  - **Tests + fixtures**: `createBranchFixture` → `createUnitFixture`;
    todas as references a `branches` → `units`.
- **Decisao sobre rotulagem PT-BR na UI**:
  - Termo padrao no codigo, audit, API: "unidade" / "Unit".
  - F7.4 (terminologia contextual): mantem "Fazenda" como label
    visual para PF rural quando faz sentido (ex: botao "Nova
    Fazenda" em PF). O backend recebe/devolve `unit`; o frontend
    pode rotular como "Fazenda" no contexto certo. Decisao final
    de copy fica no momento da implementacao.

### Q-15 — `isPrimary` em `ClientUnit` ✅

- **Decisao**: dropar o campo `isPrimary` (e a UNIQUE parcial
  `uq_client_branch_one_primary` que o mantinha exclusivo por
  cliente).
- **Justificativa**: o caso de uso forte era marcar a matriz de PJ;
  pos-L5 PJ nao tem mais unidade. Para PF, o conceito "principal" e
  ambiguo (sede? endereco de cobranca? favorita?) e adiciona logica
  (UNIQUE parcial, auto-promote F6.0, validacao no service) sem
  retorno real.
- **Implicacoes**:
  - Migration L5: `ALTER TABLE client_unit DROP COLUMN is_primary` +
    drop UNIQUE parcial.
  - Service: remover `autoPromotePrimaryOnInactivate` (F6.0) e toda
    logica de primary handling em `client-service.js`.
  - Frontend: form de criar/editar unidade nao tem checkbox
    "principal"; listagem ordena por nome ou data.
  - Tests: remover assertions sobre primary.
- **UX alternativa**: form de criar amostra lista todas as unidades
  ativas em ordem alfabetica; usuario escolhe sem default
  automatico.

### Q-16 — Cutover do enum `ClientAuditEventType` ✅

- **Decisao**: opcao B — cutover para estado limpo.
- **Justificativa**: `client_audit_event` esta vazio (L3 zerou),
  cutover e gratuito (sem conversao de dado). Limpa cruft acumulado
  (F5 registration, F7.2 split, F7.2' consolidated, branch deprecated).
  Precedente: F8B fez cutover identico em `IdempotencyScope`.
- **Estado final do enum** (8 valores):
  ```
  CLIENT_CREATED
  CLIENT_UPDATED
  CLIENT_INACTIVATED
  CLIENT_REACTIVATED
  CLIENT_UNIT_CREATED
  CLIENT_UNIT_UPDATED
  CLIENT_UNIT_INACTIVATED
  CLIENT_UNIT_REACTIVATED
  ```
- **Implementacao prevista**: migration L5 inclui bloco de cutover:
  1. `CREATE TYPE "ClientAuditEventType_new" AS ENUM (...8 valores...)`.
  2. `ALTER TABLE client_audit_event ALTER COLUMN event_type TYPE
"ClientAuditEventType_new" USING ...::text::"ClientAuditEventType_new"`.
  3. `DROP TYPE "ClientAuditEventType"`.
  4. `ALTER TYPE "ClientAuditEventType_new" RENAME TO
"ClientAuditEventType"`.
- Schema Prisma: enum `ClientAuditEventType` reduz para 8 valores;
  todas as referencias a `CLIENT_BRANCH_*`, `CLIENT_REGISTRATION_*`,
  `CLIENT_SPLIT`, `CLIENT_BRANCH_CONSOLIDATED` sao removidas do
  codigo.

### Q-17 — `Sample.ownerUnitId` em PJ (confirmacao trivial) ✅

- **Decisao**: campo `Sample.ownerUnitId` continua nullable; PF
  preenche com a unidade, PJ deixa NULL. Mesma logica para
  `SampleMovement.buyerUnitId` e
  `ClientAuditEvent.targetUnitId`.
- **Justificativa**: consequencia direta de L5 + Q-14. Sem decisao
  arquitetural nova.
- **Implicacao UI**: F7.4 (terminologia contextual) ja trata —
  listagem mostra "Cliente — Unidade" para PF e so "Cliente" para PJ.

### Q-11 — Onde aparece o aviso "incompleto" ✅

- **Decisao**: aviso passivo (nao bloqueia fluxo) em 4 lugares.
- **Listagem `/clients`**:
  - Emoji 🟠 (ou icone Lucide `AlertCircle` cor laranja) na linha
    do card.
  - Borda esquerda laranja sutil no card (cor `--brand-warning`
    ou similar; design-system define o token exato).
  - Toggle "Mostrar so incompletos" no filtro lateral.
  - Contador no header: "X clientes · Y incompletos".
- **Detail page `/clients/[id]`**:
  - Card no topo (fundo laranja sutil) listando os campos faltando
    como checklist.
  - Cada campo e link para abrir o form/modal de edicao do campo
    relevante (Client ou Unit).
  - Card desaparece quando `isClientComplete` retorna `complete=true`.
- **Lookup field** (ao buscar cliente em form de amostra etc.):
  - Emoji 🟠 discreto na linha. Nao chama atencao excessiva — usuario
    pode ainda usar o cliente normalmente; aviso so informa.
- **Sem aviso modal/intrusivo**: usuario escolhe quando completar.
  Cadastro rapido continua valendo (Q-10b/c/Q-12/Q-13).
- **Implementacao prevista**:
  - Helper `isClientComplete(client)` em `src/clients/client-helpers.js`
    (compartilhado backend/frontend) retorna
    `{ complete: boolean, missing: string[] }` onde `missing` lista
    chaves canonicas (`cpf`, `email`, `units`, `cnpj`, etc.).
  - Frontend: novo componente `ClientCompleteBadge` (emoji + tooltip
    com contagem) usado em listagem e lookup; novo componente
    `ClientCompleteChecklist` na detail page.
  - Backend: nada a expor alem do helper; campos existentes ja
    permitem o calculo no client-side.
  - Filtro: `GET /clients?completeness=incomplete` query param novo.

### Q-23 — `email` UNIQUE em `Client`? ✅

- **Decisao**: NAO UNIQUE. Permite repetir email entre clientes.
- **Justificativa**: cenarios validos onde email se repete: PJ usa
  email generico (contato@empresa.com.br) que pode ser o mesmo de
  varios cadastros; PF familia compartilha email; produtor e
  intermediario sob mesmo dominio. Identidade do cliente vem de
  CPF/CNPJ, nao de email.
- **Implementacao prevista**: schema Prisma `email String?` sem
  `@unique`; sem index UNIQUE no DB.

### Q-24 — CEP lookup automatico no form de cadastro ✅

- **Decisao**: ativar CEP lookup automatico **apenas no form de
  cadastro/edicao** de cliente (PJ ou PF) e de unidade (PF). Ao
  digitar CEP completo, preencher automaticamente `addressLine`,
  `district`, `city`, `state`. Usuario pode editar os campos
  preenchidos.
- **Justificativa**: reduz fricao de cadastro e erros de digitacao
  em UF/cidade. Padrao de mercado.
- **Onde NAO usar**: nao roda em listagem, busca, detail page —
  so na entrada de dados.
- **Implementacao prevista**:
  - API externa: ViaCEP (`https://viacep.com.br/ws/<cep>/json/`).
    Servico publico, sem auth, sem rate limit relevante.
  - Hook React `useCepLookup(cep)` debounced; chama ao detectar
    CEP completo (8 digitos sem mascara).
  - Loading state discreto (spinner pequeno no campo CEP).
  - Erro silencioso (CEP invalido / API down) — usuario digita
    manualmente; sem alert/banner.
  - Aplicar em: `ClientQuickCreateModal` (PJ + PF), `ClientUnitModal`
    (criar/editar fazenda PF), `ClientEditModal` (editar enderecos).
- **NAO afeta**: wizard L4 (importa CSV ja preenchido).

### Q-25 — Implementacao do Idempotency-Key (fecha Q-02) ✅

- **Decisao**: opcao A — tabela nova `idempotency_record` dedicada,
  independente de `SampleEvent`.
- **Justificativa**: Cloud Run multi-instancia descarta in-memory;
  `SampleEvent` e specifico de samples (reuso conceitualmente errado).
  Tabela dedicada deixa o concern isolado e facilita expiracao.
- **Schema previsto** (a confirmar no commit de implementacao):

  ```prisma
  model IdempotencyRecord {
    id           String   @id @db.Uuid
    scope        String                    // "POST /clients"
    key          String                    // valor do header
    statusCode   Int
    responseBody Json
    createdAt    DateTime @default(now()) @db.Timestamptz(6)
    expiresAt    DateTime @db.Timestamptz(6)

    @@unique([scope, key], map: "uq_idempotency_scope_key")
    @@index([expiresAt], map: "idx_idempotency_expires")
    @@map("idempotency_record")
  }
  ```

- **Implementacao prevista**:
  - Middleware Next.js (ou helper proxy) intercepta requests com
    header `Idempotency-Key` em `POST /clients` e
    `POST /clients/:id/units`.
  - Lookup por `(scope, key)`: hit cached → retorna response;
    miss → executa, salva resultado, retorna.
  - TTL: 24h (`expiresAt = createdAt + 24h`).
  - Cleanup: cron job (Cloud Run job ou simples DELETE em
    migration/health) deleta `WHERE expiresAt < NOW()`.
- **Documentacao**: registrar no `docs/API-e-Contratos.md` o uso
  do header e contrato de resposta.

### Q-20 / Q-21 / Q-22 — Estrategia de execucao ✅

- **Q-20 (commit strategy)**: L5 = 1 commit atomico (schema +
  migration + service + API + frontend + tests). Cada Q-XX
  subsequente = commit dedicado.
- **Q-21 (ordem)**:
  1. **L5 atomico** — base do refactor (Q-12, Q-13, Q-14, Q-15, Q-16,
     Q-17, Q-23 incorporados; estrutura final do dominio Cliente).
  2. **Q-11** — aviso incompleto na UI (helper + badge + checklist +
     filtro listagem).
  3. **Q-24** — CEP lookup nos forms.
  4. **Q-01** — `?onlyActive=true` query param.
  5. **Q-02 + Q-25** — Idempotency-Key middleware + tabela.
  6. **Q-05 + Q-08** — endpoint `inactivate-with-cascade` + UI modal.
  7. **(gating)** Q-18 + Q-19 — fechar planilha (analise mais
     profunda; depende do excerpt da planilha real).
  8. **L4** — wizard de import.
  9. **L3.5** — apagar fotos no GCS (ops, requer confirmacao).
  10. **M2 + cleanup final** — desativar manutencao, deletar doc
      temporario e artefatos `tmp/`.
- **Q-22 (docs canonicos)**: `Clientes-e-Movimentacoes-Especificacao.md`
  e `API-e-Contratos.md` atualizados **no mesmo commit** que o feature
  relevante. Sem commit "spec antes de codar".
- **Objetivo do ciclo atual**: ate o #6. Apos isso, pausa pra analise
  da planilha (#7) antes de retomar com #8.

### Metodologia de execucao por etapa (acordada)

Para cada # da ordem (Q-21), seguir 5 passos:

1. **Analise das decisoes** — revisar tudo o que ja foi decidido
   relevante para esse #.
2. **Analisar estado atual** — ler codigo/schema/tests existentes pra
   saber o que muda.
3. **Verificar decisoes adicionais** — identificar micro-decisoes que
   nao apareceram na revisao geral mas sao necessarias para
   implementar com qualidade.
4. **Construir plano de acao** — lista de arquivos a tocar, ordem,
   quality gates, validacoes.
5. **Implementar** — codar, rodar gates, commitar.

### Status de execucao (Q-21)

| # | Etapa | Status |
| - | ----- | ------ |
| 1 | L5 atomico (schema + migration + service + API + frontend + tests + docs) | ✅ implementado, gates verdes, **aguardando commit** |
| 2 | Q-11 — aviso incompleto na UI (helper + badge + checklist) | pendente |
| 3 | Q-24 — CEP lookup nos forms | pendente |
| 4 | Q-01 — `?onlyActive=true` query param | pendente |
| 5 | Q-02 + Q-25 — Idempotency-Key middleware + tabela | pendente |
| 6 | Q-05 + Q-08 — `inactivate-with-cascade` + UI modal | pendente |
| 7 | (gating) Q-18 + Q-19 — fechar planilha | depende de excerpt |
| 8 | L4 — wizard de import | depende de #7 |
| 9 | L3.5 — apagar fotos no GCS | requer confirmacao |
| 10 | M2 + cleanup final | encerra ciclo |

---

## 11. Plano de implementacao derivado (a preencher)

> Esta secao sera populada apos §10 estar fechada. Ordem proposta:
>
> 1. Mudancas pequenas que viram 1 commit (ex: adicionar query param
>    `?onlyActive=true` em getClient se Q-01 confirmar).
> 2. Mudancas medias (ex: idempotency middleware se Q-02 confirmar).
> 3. Atualizacao de docs canonicos (`Clientes-e-Movimentacoes-Especificacao.md`,
>    `API-e-Contratos.md`) com a nova realidade — antes de codar.
> 4. Skill maintenance.

---

# Parte 3 — Fases pendentes

## 12. L3.5 — Limpeza das fotos orfas no GCS

### Objetivo

Apagar as 44 fotos que ficaram orfas no Cloud Storage apos L3 deletar
os registros do banco.

### Pre-requisito

Usuario confirmou que **baixou as 44 fotos** via
`bash tmp/gsutil-download-script.sh` e tem copia local em
`~/amostras-backup/`.

### Comando

```bash
gsutil -m rm -r gs://safras-amostras-prod-runtime/uploads/samples/
```

Idempotente (re-rodar em pasta vazia retorna no-op).

### Criterio de done

`gsutil ls gs://safras-amostras-prod-runtime/uploads/samples/` retorna
vazio.

### Riscos

- **Irreversivel sem backup local**: requer confirmacao explicita
  (auto mode regra 5).

## 12.5. L5 — Simplificacao da estrutura PJ + rename para Unidade (antes do L4)

### Objetivo

Mover todos os dados de identidade/contato/endereco de PJ do
`ClientBranch` matriz para o proprio `Client`. Pos-L5, `ClientUnit`
(novo nome de `ClientBranch`, decisao Q-14) serve apenas para
unidades de PF (fazendas/sitios/glebas); PJ nao tem unidade.

### Motivacao

Pos-F7 (PJ admite 1 branch ATIVA), a separacao `Client` + `Branch
matriz` virou redundancia: legalName, tradeName, phone aparecem em 2
lugares; UX confusa (2 cards para editar 1 empresa). Como o DB esta
vazio apos L3, este e o momento mais barato para reorganizar **e**
renomear o conceito (Q-14): "branch"/"filial" deixa de fazer sentido,
"Unidade" cobre fazenda/sitio/gleba sem forcar rotulo.

### Schema-alvo

**`Client`** (apenas PJ ganha campos):

Legenda: **obr** = obrigatorio (CHECK no DB) · **rec** = recomendado
(salva, mas conta para `isClientComplete`) · **opc** = opcional puro
(sem aviso) · **sis** = derivado pelo sistema.

| Campo                       | PF          | PJ              |
| --------------------------- | ----------- | --------------- |
| `id`                        | sis         | sis             |
| `code`                      | sis         | sis             |
| `personType`                | PF          | PJ              |
| `fullName`                  | ✅ obr      | NULL            |
| `legalName`                 | NULL        | ✅ obr          |
| `tradeName`                 | NULL        | rec (Q-12)      |
| `cpf`                       | rec (Q-10c) | NULL            |
| `cnpj` (NOVO)               | NULL        | ✅ obr (Q-09)   |
| `cnpjOrder` (NOVO)          | NULL        | sis (derivado)  |
| `cnpjRoot`                  | NULL        | sis (derivado)  |
| `registrationNumber` (NOVO) | NULL        | rec — IE (Q-12) |
| `addressLine` (NOVO)        | NULL        | rec (Q-12)      |
| `district` (NOVO)           | NULL        | rec (Q-12)      |
| `city` (NOVO)               | NULL        | rec (Q-12)      |
| `state` (NOVO)              | NULL        | rec (Q-12)      |
| `postalCode` (NOVO)         | NULL        | rec (Q-12)      |
| `complement` (NOVO)         | NULL        | rec (Q-12)      |
| `phone`                     | ✅ obr      | ✅ obr          |
| `email` (NOVO Q-10a)        | rec (Q-10c) | rec (Q-12)      |

| `isBuyer` / `isSeller` | ✅ obr (CHECK) | ✅ obr (CHECK) |
| `status` | sis | sis |
| `createdAt` / `updatedAt` | sis | sis |

**Campo dropado da proposta inicial**: `registrationType`. Como em PJ
o unico tipo de inscricao sera IE, o tipo vira redundante. A coluna
`registrationNumber` carrega a IE direto. Q-12 fechou essa decisao.

**`ClientUnit`** (novo nome de `ClientBranch` — Q-14; apenas para
unidades de PF — pos-L5 e Q-13):

| Campo                         | Categoria      |
| ----------------------------- | -------------- |
| `id`                          | sis            |
| `clientId`                    | ✅ obr (FK)    |
| `code`                        | sis            |
| `name`                        | ✅ obr (Q-13)  |
| `cnpj`                        | rec (Q-13)     |
| `legalName`                   | opc            |
| `tradeName`                   | opc            |
| `phone`                       | rec (Q-13)     |
| `addressLine`                 | rec (Q-13)     |
| `district`                    | rec (Q-13)     |
| `city`                        | rec (Q-13)     |
| `state`                       | rec (Q-13)     |
| `postalCode`                  | rec (Q-13)     |
| `complement`                  | opc            |
| `registrationNumber` (IE)     | rec (Q-13)     |
| `registrationNumberCanonical` | sis (derivado) |
| `car` (NOVO Q-10a)            | rec (Q-13)     |
| `status`, timestamps          | sis            |

**Campo dropado**: `registrationType` (mesma logica de Q-12 — unico
tipo sera IE). DB vazio = drop sem perda. Migration: `DROP COLUMN`.

**Outros campos dropados (passo 3 do workflow #1):**

- `cnpjOrder` em `ClientUnit` (D-C) — coluna existia em PJ filial pra
  distinguir matriz/filial; pos-L5, ClientUnit e so PF e nao tem
  semantica de "ordem". `cnpjOrder` continua existindo em `Client`
  (PJ ainda usa pra derivar do CNPJ).

**Constraints adicionais decididos no passo 3:**

- `ClientUnit.cnpj` UNIQUE GLOBAL parcial mantido (D-A) — `WHERE
cnpj IS NOT NULL`.
- `ClientUnit.name` UNIQUE por cliente (D-B) — `UNIQUE (client_id,
lower(name)) WHERE status='ACTIVE'`. Evita PF com 2 fazendas
  ATIVAS com mesmo nome.
- `ClientUnit.registrationNumberCanonical` UNIQUE GLOBAL parcial
  mantido (D-G) — status quo.

**Validacao no service (passo 3):**

- Email — regex simples `/^[^@\s]+@[^@\s]+\.[^@\s]+$/` no service
  (D-D); rejeita 422 se invalido.

**Triggers e escape valves (passo 3):**

- `fn_assert_pj_has_cnpj` (Q-09) — **omitido** (D-H). O CHECK
  `chk_client_person_type_fields` ja garante `cnpj NOT NULL` em PJ;
  trigger separado seria redundante.
- `enforce_pj_zero_units` (substitui F7.1B) — **sem escape valve**
  (D-I). O escape valve antigo `app.allow_split_wizard='on'` era pro
  wizard F7.2' que sai junto.
- `app.allow_audit_mutation='wizard_f51'` escape valve — **dropar**
  (D-E). Era pro wizard F5.1 de consolidacao que sai junto.

**Cleanup F7.2' completo (D-J):**

- Deletar `scripts/migrations/f7-pj-consolidate-wizard.mjs`.
- Deletar `scripts/audits/f7-prod-audit.mjs`.
- Remover codigo que emite `CLIENT_SPLIT` ou
  `CLIENT_BRANCH_CONSOLIDATED` (cutover Q-16 ja remove os enum
  values).

**Outros (D-K, D-L, D-M):**

- `code` autoincrement em ClientUnit (sequencial por cliente) — mantem.
- Helper `isClientComplete` — `src/clients/client-helpers.js` shared.
- Migration: arquivo unico `<TS>_l5_simplify_pj_and_rename_branch_to_unit/migration.sql`.

### Mudancas necessarias

1. **Migration nova** (timestamp pos-L4-prep) — bloco A
   (campos novos no Client) + bloco B (rename Q-14):
   - **A. Campos novos no Client (L5 + Q-12)**:
     - `ALTER TABLE client ADD COLUMN cnpj`, `cnpj_order`,
       `registration_number`, `registration_number_canonical`,
       `address_line`, `district`, `city`, `state`, `postal_code`,
       `complement`, `email`. **Sem** `registration_type` (Q-12).
     - `CREATE UNIQUE INDEX uq_client_cnpj ON client(cnpj) WHERE cnpj IS NOT NULL`.
     - `CREATE UNIQUE INDEX uq_client_registration_canonical ON client(registration_number_canonical) WHERE registration_number_canonical IS NOT NULL`.
     - Atualizar `chk_client_person_type_fields`: PF rejeita campos
       PJ (cnpj, IE, endereco PJ); PJ rejeita fullName/cpf.
     - Trigger novo `fn_assert_pj_has_cnpj` (Q-09): verifica
       `client.cnpj IS NOT NULL` quando personType=PJ.
       CONSTRAINT TRIGGER DEFERRABLE.
   - **B. Ajustes em client_branch + rename para client_unit (Q-13 + Q-14)**:
     - `ALTER TABLE client_branch ADD COLUMN car` (nullable, Q-13).
     - `ALTER TABLE client_branch DROP COLUMN registration_type` (Q-13;
       DB vazio = sem perda).
     - `ALTER TABLE client_branch ALTER COLUMN name SET NOT NULL` +
       CHECK `btrim(name) <> ''` (Q-13).
     - `ALTER TABLE client_branch DROP COLUMN is_primary` (Q-15) +
       drop UNIQUE parcial `uq_client_branch_one_primary`.
     - Drop `uq_client_branch_cnpj` (CNPJ migra para client).
     - Drop trigger `trg_enforce_pj_single_active_branch` (F7.1B);
       sera recriado como `trg_enforce_pj_zero_units` apos rename.
     - **Rename (Q-14)**:
       - `ALTER TABLE client_branch RENAME TO client_unit`.
       - Renomear indexes/constraints: `uq_client_branch_*` →
         `uq_client_unit_*`; `idx_client_branch_*` → `idx_client_unit_*`;
         `chk_client_branch_*` → `chk_client_unit_*` (se houver).
       - `ALTER TABLE sample RENAME COLUMN owner_branch_id TO owner_unit_id`
         - renomear FK + index.
       - `ALTER TABLE sample_movement RENAME COLUMN buyer_branch_id TO buyer_unit_id`.
       - `ALTER TABLE client_audit_event RENAME COLUMN target_branch_id TO target_unit_id`.
     - Recriar trigger `enforce_pj_zero_units` em `client_unit`
       (rejeita qualquer INSERT em client_unit se Client e PJ).
   - **C. Audit event enum (Q-14)**:
     - `ALTER TYPE "ClientAuditEventType" ADD VALUE 'CLIENT_UNIT_CREATED'`
       e similares para UPDATED/INACTIVATED/REACTIVATED.
     - Valores antigos `CLIENT_BRANCH_*` ficam no enum como
       deprecated — Postgres nao remove enum value; novo codigo nao
       emite mais.

2. **Schema Prisma**: model `ClientBranch` → `ClientUnit`; enum
   `ClientBranchStatus` → `ClientUnitStatus`; relations renomeadas
   (`Sample.ownerBranch` → `Sample.ownerUnit`, etc.); ClientAuditEvent
   `targetBranch` → `targetUnit`.

3. **Service** `client-service.js`:
   - `createClient` PJ aceita `cnpj`, `registrationNumber` (IE),
     endereco e demais recomendados direto (sem `branches[]`).
   - `createClient` PF aceita `branches[]` apenas para fazendas.
   - `createBranch`: rejeita 422 se `client.personType === 'PJ'`.
   - `createUnit`/`inactivateUnit`/`reactivateUnit`/`updateUnit`
     (renomeados — Q-14): rejeitam PJ (422).
   - `assertPjBranchLimit` removido (PJ nao tem unidade).
   - `lookupClients`: PJ retorna 1 linha simples (ja era assim no
     frontend; backend simplifica).

4. **API routes** (paths renomeados — Q-14):
   - `POST /clients/:id/units` rejeita PJ (404 ou 422).
   - `GET /clients/:id` retorna o Client com todos os campos PJ
     direto; sem `units` para PJ (ou `units: []` por compat).

5. **Frontend** (componentes renomeados — Q-14):
   - `ClientUnitModal` (ex `ClientBranchModal`) so abre para PF.
   - `ClientQuickCreateModal` PJ pede CNPJ + endereco inline (sem
     "configure depois").
   - `ClientLookupField`: PJ ja era 1 linha simples; PF mantem
     hierarquico (cliente → unidade).
   - Detail page `/clients/[id]` PJ: card "Empresa" mostra TUDO
     direto; aba "Unidades" some completamente.
   - Detail page PF: aba "Unidades" (rotulo PT-BR pode ser
     "Fazendas" no contexto rural — F7.4 contextual).

6. **Tests**:
   - Atualizar fixtures: `createPjClient` passa cnpj/endereco no client
     direto; remove `branches: []` para PJ.
   - Tests existentes que testavam branch matriz PJ → adaptar para
     campos no Client.
   - Renomear: `createBranchFixture` → `createUnitFixture`;
     references a `branches` → `units` (Q-14).

7. **Wizard L4**:
   - CSV PJ vai direto para `Client` (sem coluna unidade separada).
   - CSV PF mantem coluna por unidade (multi-row se mais de uma).

### Riscos

- **Schema migration grande** (~10 ALTER TABLE). DB vazio mitiga risco
  total.
- **Code refactor amplo** (~30 arquivos). Compense com tests.
- **Compat com frontend**: detail page atual tem aba Filiais para PJ —
  vai sumir. F7.4 ja escondia muita coisa, mas componentes especificos
  podem precisar deletar.

### Criterio de done

- Migration aplicada local e em prod (DB vazio = no-op de dado).
- 133+ tests integration passando.
- `createClient` PJ funciona sem `branches[]`.
- `createBranch` em PJ retorna 422.
- Frontend nao mostra aba "Filiais" em PJ.
- L4 wizard refatorado para o novo formato.

## 13. L4 — Wizard de import via planilha

### Objetivo

Re-criar os clientes principais da planilha do usuario, validados
(CPF/CNPJ com checksum), respeitando F7, idempotente.

### Formato esperado da planilha (CSV)

| Coluna                     | Tipo                             | Obrigatoria      | Observacao                          |
| -------------------------- | -------------------------------- | ---------------- | ----------------------------------- |
| `personType`               | `PF` ou `PJ`                     | sim              | ditado pela presenca de CPF vs CNPJ |
| `fullName`                 | string                           | so PF            |                                     |
| `legalName`                | string                           | so PJ            |                                     |
| `tradeName`                | string                           | nao              |                                     |
| `cpf`                      | XXX.XXX.XXX-XX ou 11 digitos     | so PF (ver Q-04) |                                     |
| `cnpj`                     | XX.XXX.XXX/XXXX-XX ou 14 digitos | so PJ (ver Q-06) | vai para `client_branch.cnpj`       |
| `phone`                    | string                           | sim              | 10 ou 11 digitos                    |
| `isBuyer`                  | bool                             | sim              |                                     |
| `isSeller`                 | bool                             | sim              |                                     |
| `branchAddressLine`        | string                           | nao              |                                     |
| `branchDistrict`           | string                           | nao              |                                     |
| `branchCity`               | string                           | nao              |                                     |
| `branchState`              | UF                               | nao              |                                     |
| `branchPostalCode`         | CEP                              | nao              |                                     |
| `branchRegistrationNumber` | IE                               | nao              |                                     |

A definicao final do schema do CSV sera fechada com o usuario antes de
codar o wizard.

### Wizard (`scripts/migrations/l4-import-clients-wizard.mjs`)

- Le CSV via `node:fs` + parser.
- Para cada linha: valida checksum CPF/CNPJ; cria PJ com matriz inline;
  cria PF com `branches: []`.
- Idempotencia: `cpf` (PF) ou `cnpj` da matriz (PJ) ja existente → skip.
- Flags: `--dry-run` (default) e `--apply`.
- Relatorio em `tmp/l4-import-report-<ts>.json`.

### Criterio de done

- Counts em prod batem com a planilha filtrada.
- Smoke: lookup, criacao manual, "criar amostra com cliente existente"
  funcionam.

## 14. M2 — Desativar manutencao

### Comando

```bash
gcloud run services update rastreio-prod-app \
  --remove-env-vars=MAINTENANCE_MODE \
  --project=safras-amostras-prod \
  --region=southamerica-east1
```

### Quando

Apos L4 finalizar e validar smoke completo do reimport.

## 15. Limpeza pos-execucao (CRITICO)

Ao concluir todas as fases, fazer no mesmo commit:

```bash
git rm docs/Reset-Refatoracao-e-Reimport-Clientes.md
rm -rf tmp/samples-backup.json tmp/samples-backup.csv
rm -rf tmp/samples-backup-attachments.csv tmp/gsutil-download-script.sh
rm -rf tmp/l4-import-report-*.json
# tmp/ ja eh gitignored, entao 'git rm' so para o documento docs/
```

---

# Parte 4 — Suporte

## 16. Riscos e mitigacoes

| Risco                                  | Quando | Mitigacao                                                            |
| -------------------------------------- | ------ | -------------------------------------------------------------------- |
| Auditoria L1 detecta bug critico       | L1     | (concluida sem bloqueante)                                           |
| Backup L2 nao cobre tudo               | L2     | (concluida — 4 artefatos validados)                                  |
| Migration L3 erra ordem de DELETE      | L3     | (corrigido em commit `1b85620` — DROP TABLE CASCADE antes de DELETE) |
| Permissao bloqueia dump em L2/L3       | L2/L3  | Usuario aprova caso a caso (precedente F8A)                          |
| Wizard L4 cria duplicatas              | L4     | Idempotencia por CPF/CNPJ; dry-run obrigatorio antes de `--apply`    |
| Fotos nao baixadas antes de L3.5       | L3.5   | Confirmacao explicita do usuario antes de `gsutil rm`                |
| Sequences ficam altas pos-DELETE       | L4     | Decidir Q-07 antes de codar wizard                                   |
| Manutencao quebra login (caminho real) | M1     | (corrigido em commit `de4a032` — whitelist `/api/v1/auth`)           |

### Plano de rollback

- **L1 / L2**: read-only, nao precisa.
- **L3**: irreversivel sem backup completo do banco.
- **L4**: rodar com `--dry-run` antes; se errar, `DELETE FROM client` no
  proprio wizard e re-rodar `--apply`.
- **M1**: desativar via env var (`--remove-env-vars=MAINTENANCE_MODE`).

## 17. Skill maintenance

Skills atualmente nao mencionam contagens nem dados especificos de
cliente (verificado pos-F8 com varredura `grep`). Apos L4, validar:

- `prisma/SKILL.md`: descricao do model `Client` e `ClientBranch`
  continua correta (a logica F7 nao muda).
- `tests/SKILL.md`: nenhuma menção a fixtures de cliente especificas;
  manter.
- `conventions/SKILL.md`: estrutura de pastas continua valida.

Caso §10 introduza mudancas que afetem skills (ex: query param novo,
idempotency middleware), atualizar no mesmo commit do ajuste.

## 18. Criterio de "feito" geral

A reorganizacao esta concluida quando:

1. ✅ L1 aprovado pelo usuario.
2. ✅ L2 backup validado.
3. ✅ L3 aplicado em prod (commit `1b85620`).
4. ✅ M1 ativado em prod (commit `de4a032`).
5. **Analise profunda fechada** (§9 → §10 → §11) — em andamento.
6. **L3.5 aplicado** (fotos orfas removidas).
7. **L4 import idempotente** em prod (counts batem com planilha
   filtrada).
8. **M2 aplicado** (manutencao desativada).
9. Smoke de criacao de amostra com cliente existente passa.
10. Skills validadas pos-execucao.
11. **Este documento e os artefatos `tmp/` deletados** no commit final.

## 19. Tracking

| Fase                       | Status       | Commit / Deploy                            |
| -------------------------- | ------------ | ------------------------------------------ |
| L1 — Auditoria             | ✅ concluida | sem commit (read-only)                     |
| L2 — Backup                | ✅ concluida | sem commit (artefatos em tmp/, gitignored) |
| L3 — Reset destrutivo      | ✅ concluida | `1b85620` em prod                          |
| M1 — Modo manutencao       | ✅ ativado   | `de4a032` em prod                          |
| §8 — Estado consolidado    | ✅ concluida | (nesta versao do doc)                      |
| §9 — Pontos de revisao     | ✅ proposta  | aguardando respostas Q-01..Q-07            |
| §10 — Decisoes pos-analise | em andamento | —                                          |
| §11 — Plano implementacao  | pendente     | depende de §10                             |
| L3.5 — Limpeza GCS         | pendente     | aguarda confirmacao de download            |
| L4 — Wizard import         | pendente     | depende de §10 + planilha filtrada         |
| M2 — Desativar manutencao  | pendente     | apos L4                                    |
| Limpeza final              | pendente     | apos M2                                    |

## 20. Decisoes fechadas (historico)

A auditoria L1 nao detectou bloqueantes. Decisoes pre-L3, todas
implementadas:

1. **Bloquear troca de personType em `updateClient`**. Service rejeita
   422 com `code='CLIENT_PERSON_TYPE_LOCKED'`. Workaround: inativar e
   criar novo do tipo correto. Implementado em `src/clients/client-service.js`.
2. **Dropar tabelas/colunas `*_deprecated_2026q2`** na migration L3
   (encerra a Phase 10 do F5.2). Inclui: `DROP TABLE
client_registration_deprecated_2026q2`, `DROP COLUMN
cnpj_deprecated_2026q2`, `DROP COLUMN
document_canonical_deprecated_2026q2`, `DROP COLUMN
owner_registration_id_deprecated_2026q2`, `DROP COLUMN
buyer_registration_id_deprecated_2026q2`, `DROP COLUMN
buyer_registration_snapshot_deprecated_2026q2`. Aplicado em prod.
3. **Bug fix M1** (`/api/v1/auth` na whitelist do middleware). Aplicado
   em prod via commit `de4a032`.

Recusados / postpostos:

- ❌ Modal guiado para conversao PF↔PJ (custo alto, frequencia baixa,
  workaround simples ja existe). Pode virar feature futura `M_x` se uso
  real justificar.
