# Reorganizacao de Clientes (TEMPORARIO)

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

### Q-08 — Definicao de "amostra ativa" + status pos-cascade (sugestao)

- **Sugestao** (aguardando confirmacao do usuario):
  - **"Amostra ativa" para o aviso** = `status NOT IN ('INVALIDATED')`.
    Inclui: `PHYSICAL_RECEIVED`, `REGISTRATION_IN_PROGRESS`,
    `REGISTRATION_CONFIRMED`, `QR_PENDING_PRINT`, `QR_PRINTED`,
    `CLASSIFICATION_IN_PROGRESS`, `CLASSIFIED`. (qualquer amostra que
    nao foi descartada).
  - **Status final pos-cascade** = `INVALIDATED` (status terminal ja
    existente no schema; nao precisa criar enum novo).
  - **Audit**: emite `SAMPLE_INVALIDATED` em cada amostra com payload
    `{ reason: 'OWNER_INACTIVATED', inactivatedClientId, inactivatedClientName, batchId }`,
    e `CLIENT_INACTIVATED` no cliente com payload listando os
    `cascadedSampleIds`.
- **Justificativa**: reusar `INVALIDATED` evita schema novo. O motivo
  fica explicito no payload pra distinguir de outras invalidacoes
  (ex: amostra defeituosa, devolvida).
- **Implementacao prevista**: novo metodo
  `inactivateClientWithCascade(clientId, sampleIds, reasonText, actor)`
  no service, transacional. Endpoint
  `POST /clients/:id/inactivate-with-cascade` chamado pelo modal Q-05.

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
git rm docs/Reorganizacao-Clientes-L1-L4.md
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
