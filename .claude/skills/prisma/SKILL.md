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

- **Sample** — snapshot atual da amostra (status, classificacao, comercial)
- **SampleEvent** — timeline append-only (event types definidos em `enum SampleEventType` no schema). Funcao `fn_prevent_sample_event_mutation` + triggers `trg_sample_event_prevent_update`/`trg_sample_event_prevent_delete` impedem mutacao.
- **SampleAttachment** — fotos (CLASSIFICATION_PHOTO). Unique por `(sampleId, kind)`.
- **PrintJob** — tentativas de impressao/reimpressao.
- **SampleMovement** — vendas e perdas parciais, com snapshot de buyer.
- **User** — conta com role, status, password hash (bcrypt), lockout.
- **UserSession** — sessao JWT com expiracao e revogacao.
- **Client** — PF/PJ. Identidade fiscal e endereco/IE de PJ ficam direto no Client (cnpj, cnpjOrder, cnpjRoot, registrationNumber, addressLine, etc.). PF guarda esses campos vazios e usa `ClientUnit` (filiais). Tem N usuarios comerciais via `ClientCommercialUser` (join). Invariante "Client ACTIVE tem >=1 entrada na join" e garantida no banco por 2 triggers DEFERRABLE INITIALLY DEFERRED (ver "Triggers / invariantes"). API REST mantem campo singular `commercialUser` derivado da primeira entrada da join (compat ate Fase 2 expor multi-user).
- **ClientCommercialUser** — join N:N entre Client e User. PK composta `(clientId, userId)`. Relacao plana (sem hierarquia/principal). Vinculos historicos sao registrados via `ClientAuditEvent` (a tabela mantem apenas vinculos ativos).
- **ClientUnit** — unidade operacional (filial) ligada a um Client. Pos-L5, **so PF** possui ClientUnits (PJ rejeita create/update/inactivate/reactivate de unit com 422 `CLIENT_PJ_HAS_NO_UNITS`). Cada unit pode ter `cnpj` (UNIQUE), `registrationNumber` (UNIQUE canonical), `addressLine`/`city`/`state`, `car` (Cadastro Ambiental Rural) e `name` (obrigatorio). `isPrimary`, `cnpjOrder`, `registrationType` foram **dropados** sob L5. **Fase 0**: invariante "PF nasce com >=1 unit" — `createClient` injeta uma fazenda placeholder (nome `Fazenda 1`, demais campos `NULL`) se o caller nao fornecer nenhuma. Helper: `ensureDefaultPfUnit` em `src/clients/client-support.js`. Garantia so na camada de aplicacao (sem trigger no banco).
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

- Concorrencia otimista via `version` + `expectedVersion` em Sample.
- Idempotencia via `idempotencyScope` + `idempotencyKey` em SampleEvent.
