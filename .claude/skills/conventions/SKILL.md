---
name: conventions
description: Use this skill when writing or reviewing any code in this project. Defines coding standards, commit conventions, file organization, and quality gates.
---

## Linguagem e runtime

- Node >= 22 (`.nvmrc`). TypeScript 5.9, compilado pelo Next.js.
- ESM (`"type": "module"` no package.json). Imports com extensao `.js` para arquivos em `src/`.
- Backend em JS puro (`.js`) com JSDoc types. Frontend em `.tsx`/`.ts`.

## Estrutura de pastas

- `app/` — telas e route handlers (Next.js App Router)
- `components/` — componentes React compartilhados
- `lib/` — tipos TS, schemas de formulario, cliente HTTP, utilitarios UI
- `lib/offline/` — infra offline da PWA: snapshot local de sessao (session-cache), fila de informes em IndexedDB (visit-outbox) + sync com Idempotency-Key (visit-sync)
- `lib/navigation/` — `route-history` (rastreador da rota anterior): `RouteHistoryTracker` no layout atualiza em efeito; `getRouteLeftBehind()` lido no render de uma pagina devolve a rota de origem (ex.: Lotes decide preservacao permanente vs com timer ao voltar)
- `src/api/` — API framework-agnostic (backend-api.js)
- `src/samples/` — dominio de amostras (command + query services)
- `src/users/`, `src/auth/` — usuarios, sessoes, roles, auditoria
- `src/events/` — event store append-only + validacao de contratos
- `src/contracts/` — event-validator, schema-loader
- `src/reports/` — laudos PDF (pdf-lib)
- `src/uploads/` — upload com magic bytes validation
- `src/email/` — email via SMTP ou outbox
- `src/clients/` — dominio de clientes (+ `client-bank-account-service` e `client-attachment-service`: sub-cadastros do Fechamento, escopados por cliente)
- `src/brokers/` — cadastro de corretores do Fechamento (vinculo opcional a usuario). Acesso = qualquer autenticado (D59); padrao service+support espelhando `src/clients`. (O `src/banks/` foi removido na D141 — banco virou texto livre na conta bancaria.)
- `src/sale-contracts/` — dominio do contrato de venda (Mercado a vista + Futuro; "Fechamento" = o PDF gerado). `sale-contract-support.js` (PURO: normalizadores dos termos da venda + da etapa 2, calculo financeiro com agio/desagio, numero `NNNN/AA`, snapshots das partes/banco/armazens, view) + `sale-contract-service.js` (**gestao = todo nao-PROSPECTOR** via `SALE_CONTRACT_ACCESS_ROLES` = `NON_PROSPECTOR_ROLES` (ACESSO UNIFICADO 2026-07-15) — todos os papeis menos PROSPECTOR veem/gerenciam TODOS os contratos (escopo aberto, D140); `CONTRACT_LOOKUP_MANAGE_ROLES` e `FINANCEIRO_ROLES` idem = `NON_PROSPECTOR_ROLES` (Financeiro com todos os fechamentos; `/users` segue ADMIN)). O contrato **NASCE `EMITIDO`** (D97): `createSpotSaleContract` (a vista, na mesma tx da venda `createSampleMovement`) e `createFutureSaleContract` (Futuro, CRUD sem lote); `emitSaleContract` virou so **"Editar"** (salva a etapa 2 do contrato EMITIDO; os syncs de dono/venda sao cross-aggregate nao-atomicos por decisao — D143). Cascata do Editar a vista → lote/venda auditada na **D146**: vendedor→`Sample.ownerClientId` (`_syncSampleOwner`, **auto-confirma a propagacao de liga** com `confirmHarvestPropagation: true` — evita 409 se o lote for origem de liga), comprador/sacas/data→`SampleMovement` (`_syncMovementFromContract`); banco/filial/armazem sao **seleção** → snapshot-only (nao escrevem de volta no cadastro). A etapa 2 valida `paymentDate >= invoiceDate` (D142, 422 no campo); desde a D144, em contrato FUTURO cada data planejada pode vir `null` explicito ("A definir", `normalizeEtapa2Input(input, { allowOpenDates })`) — D142/dia-util so valem com data presente, e a worklist de embarque inclui os sem `invoiceDate` (nunca atrasados). Ciclo `EMITIDO -> FATURADO -> PAGO + WASH_OUT` (`invoiceSaleContract`/`paySaleContract`/`washoutSaleContract`; **Desfazer removido** D122; marcos auditados em `SaleContractStatusLog` D123 — detalhe do enum na skill `prisma`) + `applyAgioSaleContract` (agio/desagio pos-emissao), `listContractLookups`/`createContractLookup` (as 3 listas), `listBrokerReceivables` (Financeiro — **D145** revisa D105: washout so cobra corretagem no FUTURO; o fisico a vista cancelado sai do Financeiro (filtrado por `type='FUTURO'` no `where`, nao chega ao card) e tem o Espelho bloqueado (`ESPELHO_WASHOUT_SPOT`, predicado `isSpotWashout`)) e `getSaleContractTimeline`/`logEspelhoGenerated` (auditoria/Espelho). As mutacoes sao **CRUD direto** (`SaleContract` nao tem trigger de UPDATE) com concorrencia otimista por `version`. **PDF (Fase C)**: `sale-contract-pdf-service.js` (`SaleContractPdfService.renderContractPdf` — `pdf-lib`, mesmo stack do laudo; estilo do app) + `issuer-config.js` (`getContractIssuer`: nome/endereco fixos + **CNPJ via `CONTRACT_ISSUER_CNPJ`**). Gerado **on-demand, sem armazenar** (D32): handler `exportSaleContractPdf` (gate via `getSaleContract` = NON_PROSPECTOR; **sem gate de status**, todo contrato nasce EMITIDO) + rota GET `app/api/v1/sale-contracts/[id]/pdf` que serve binario (molde `samples/[id]/export/pdf`); client `downloadSaleContractPdf` + `shareOrDownloadFile`
- `src/visits/` — formularios por papel: `visit-report-service` (informe do PROSPECTOR — sheet do dashboard dele, identificacao do cliente por DECLARACAO sem lookup, lista APENAS os proprios informes (`where.userId`) + stats proprios + busca por nome + curadoria do vinculo `linkVisitReportClient`, todo nao-PROSPECTOR desde 2026-07-15) e `commercial-forms-service` (visita do COMERCIAL — que exige `clientId` nos dois `clientKind`, cadastrando o cliente no proprio formulario — + relatorio semanal com UNIQUE por semana + feed combinado `listInformeFeed` dos 3 tipos que alimenta a pagina Relatorios — ACESSO UNIFICADO 2026-07-15: todo nao-PROSPECTOR e viewer (scope=all) e cria; scope=mine idem); allowlist de API do prospector em `src/auth/prospector-access.js` (SEM `lookupClients` — papel de campo nao enumera a base de clientes)
- `src/push/` — Web Push: inscricao do aparelho + API de envio VAPID (`sendToRoles` / `sendToUsers` / `sendPersonalizedToRoles`). **Catalogo vazio desde 2026-07-09** — os metodos de envio existem mas nenhum gatilho os chama; toda notificacao nova precisa de ficha em `docs/Notificacoes.md`
- `src/db/` — Prisma client singleton
- `tests/` — testes na raiz (nao em `__tests__/`)
- `prisma/` — schema + migrations + seed
- `scripts/runtime/` — wrappers operacionais (compose, migrate, seed, preflight, smoke)
- `scripts/gcp/` — deploy canary, build, preflight, smoke
- `docs/` — documentacao canonica
- `print-agent/` — agent de impressao (Node.js separado, roda no Windows do cliente)

## Padroes de codigo

- Indent: 2 espacos (`.editorconfig`)
- Prettier formata tudo (default 80 cols)
- ESLint 9 com flat config (ver `eslint.config.mjs` para regras e extensoes)
- Nomes de arquivo: kebab-case para `.js`/`.ts`, PascalCase para componentes React
- Nomes de variavel: camelCase. Enums Prisma: UPPER_SNAKE_CASE

## Commits

- Formato: `tipo(escopo): descricao curta` — ex: `fix(auth): handle expired session on login`
- Tipos: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`, `style`
- Commits atomicos tematicos. Nunca mega-commits que misturam temas.
- **NUNCA** `--amend` ou `--force-push` em `main`

## Quality gates (CI bloqueante)

Todos devem passar antes de qualquer push:

1. `npm run lint` — 0 errors, 0 warnings
2. `npm run format:check` — exit 0
3. `npm run typecheck` — exit 0
4. `npm run build` — exit 0
5. `npm run validate:schemas` — exit 0
6. `npm run test:contracts` — verde
7. `npm run test:unit` — verde
8. `npm run test:integration:db` — verde (requer PostgreSQL local via Docker)

Apoio (nao-gate): `npx knip` — deteccao de codigo morto (config em `knip.json`;
falso-positivos conhecidos em `ignoreDependencies`). Todo achado exige
verificacao manual antes de remover. Processo canonico da revisao geral:
`docs/Revisao-Geral-Plano-de-Trabalho.md`.

## Padroes de seguranca

- Nunca hardcodar secrets em codigo. Usar env vars + Secret Manager.
- Uploads: sempre validar magic bytes (file-type). Fotos de amostra: JPEG/PNG/WebP (`saveSamplePhoto`); anexos de cliente: JPEG/PNG/WebP + PDF (`saveClientAttachment`).
- Inputs: usar normalizers no service layer.
- SQL: sempre Prisma parameterized ou tagged templates (`$queryRaw`). Nunca string concat.
- Headers HTTP: configurados em `next.config.mjs`. Nao remover sem justificativa.
- Rate limiting: `src/auth/rate-limiter.js` (10 req/min por IP).
- Papeis nao atribuiveis: `NON_ASSIGNABLE_ROLES` / `isAssignableUserRole` (`src/auth/roles.js`). Nao podem ser referenciados em vinculo nenhum. `lookupUsersForReference` os omite do seletor, mas o gate de verdade sao os 422 `PROSPECTOR_NOT_ASSIGNABLE` nos pontos de escrita (`assertCommercialUserAssignable`, `normalizeClassifiers`, `_assertUserExists` do broker, `createUser`). Esconder da UI sem barrar na API e alivio visual, nao fronteira.
