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
- `src/banks/`, `src/brokers/` — cadastros do Fechamento (bancos com codigo COMPE; corretores com vinculo opcional a usuario). Acesso = qualquer autenticado (D59); padrao service+support espelhando `src/clients`
- `src/sale-contracts/` — dominio do contrato de venda (Mercado a vista + Futuro; "Fechamento" = o PDF gerado). `sale-contract-support.js` (PURO: normalizadores dos termos da venda + da etapa 2, calculo financeiro com agio/desagio, numero `NNNN/AA`, snapshots das partes/banco/armazens, view) + `sale-contract-service.js` (**gestao = ADMIN + COMMERCIAL** via `SALE_CONTRACT_ACCESS_ROLES`, o COMMERCIAL restrito aos contratos dele por `Broker.userId` — D110; `SALE_CONTRACT_MANAGE_ROLES`=ADMIN so pra criar valor das 3 listas; `FINANCEIRO_ROLES`=ADMIN+COMMERCIAL). O contrato **NASCE `EMITIDO`** (D97): `createSpotSaleContract` (a vista, na mesma tx da venda `createSampleMovement`) e `createFutureSaleContract` (Futuro, CRUD sem lote); `emitSaleContract` virou so **"Editar"** (salva a etapa 2 do contrato EMITIDO). Ciclo `EMITIDO -> FATURADO -> PAGO + WASH_OUT` (`invoiceSaleContract`/`paySaleContract`/`washoutSaleContract`; **Desfazer removido** D122; marcos auditados em `SaleContractStatusLog` D123 — detalhe do enum na skill `prisma`) + `applyAgioSaleContract` (agio/desagio pos-emissao), `listContractLookups`/`createContractLookup` (as 3 listas), `listBrokerReceivables` (Financeiro) e `getSaleContractTimeline`/`logEspelhoGenerated` (auditoria/Espelho). As mutacoes sao **CRUD direto** (`SaleContract` nao tem trigger de UPDATE) com concorrencia otimista por `version`. **PDF (Fase C)**: `sale-contract-pdf-service.js` (`SaleContractPdfService.renderContractPdf` — `pdf-lib`, mesmo stack do laudo; estilo do app) + `issuer-config.js` (`getContractIssuer`: nome/endereco fixos + **CNPJ via `CONTRACT_ISSUER_CNPJ`**). Gerado **on-demand, sem armazenar** (D32): handler `exportSaleContractPdf` (gate via `getSaleContract` = ADMIN+COMMERCIAL dono; **sem gate de status**, todo contrato nasce EMITIDO) + rota GET `app/api/v1/sale-contracts/[id]/pdf` que serve binario (molde `samples/[id]/export/pdf`); client `downloadSaleContractPdf` + `shareOrDownloadFile`
- `src/visits/` — formularios por papel: `visit-report-service` (informe do PROSPECTOR — sheet do dashboard dele, identificacao do cliente por DECLARACAO sem lookup, lista APENAS os proprios informes (`where.userId`) + stats proprios + busca por nome + curadoria do vinculo `linkVisitReportClient` ADM/Cadastro) e `commercial-forms-service` (visita do COMERCIAL + relatorio semanal com UNIQUE por semana + feed combinado `listInformeFeed` dos 3 tipos que alimenta a pagina /informe do comercial em scope=mine e o `/resumo` em scope=all); allowlist de API do prospector em `src/auth/prospector-access.js` (SEM `lookupClients` — papel de campo nao enumera a base de clientes)
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
