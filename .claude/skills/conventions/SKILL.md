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
- `lib/revalidation/` — barramento de invalidacao (ciclo SN, F3): `subjects` (o tipo `RevalidationSubject` + o mapa caminho→assunto), `bus` (pub/sub singleton, sem React, coalescedor de 120ms) e o hook `use-revalidate` (publish + foreground + poll). 🔴 **Quem publica e o `request()` do `api-client`, automatico pra todo metodo ≠ GET** — nenhum ponto de escrita publica na mao (SN-D14). Ver a skill `data-tables` §10 pra ligar uma tela
- `lib/snapshots/` — primeira pintura das listas (SN-D7/D9): `registry` (as chaves — o logout **itera o registro**, entao chave nasce aqui, nunca literal solto — + TTL + read/write/clear) e `scroll` (ler/aplicar scroll do container e o `restoreListScrollTop`, que reaplica por frame)
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
- `src/sale-contracts/` — dominio do contrato de venda (Mercado a vista + Futuro; "Fechamento" = o PDF gerado). `sale-contract-support.js` (PURO: normalizadores dos termos da venda + da etapa 2, calculo financeiro com agio/desagio, numero `NNNN/AA`, snapshots das partes/banco/armazens, view) + `sale-contract-service.js` (**gestao = todo nao-PROSPECTOR** via `SALE_CONTRACT_ACCESS_ROLES` = `NON_PROSPECTOR_ROLES` (ACESSO UNIFICADO 2026-07-15) — todos os papeis menos PROSPECTOR veem/gerenciam TODOS os contratos (escopo aberto, D140); `CONTRACT_LOOKUP_MANAGE_ROLES` e `FINANCEIRO_ROLES` idem = `NON_PROSPECTOR_ROLES` (Financeiro com todos os fechamentos; `/users` segue ADMIN)). O contrato **NASCE `EMITIDO`** (D97): `createSpotSaleContract` (a vista, na mesma tx da venda `createSampleMovement`) e `createFutureSaleContract` (Futuro, CRUD sem lote); `emitSaleContract` virou so **"Editar"** (salva a etapa 2 do contrato EMITIDO; os syncs de dono/venda sao cross-aggregate nao-atomicos por decisao — D143). **O vendedor NAO e editavel em contrato com lote (RC-D37, 2026-07-28)**: ele E o dono do lote, derivado no servidor nos 3 caminhos (criar a vista, Editar e **previa**) — o `sellerClientId` do payload e RECUSADO com 422 `SELLER_DERIVED_FROM_SAMPLE` (RC-D40 — aceitar-e-ignorar mentia sobre o que o campo faz; o FUTURO, sem lote, segue exigindo), e o `_syncSampleOwner` foi APAGADO (revoga a D48). Trocar o vendedor se faz no cadastro do lote; o `getSaleContract` devolve `sampleOwner` (dono ATUAL) pra tela mostrar o que sera emitido. Do que sobrou da cascata da **D146**: comprador/sacas/data→`SampleMovement` (`_syncMovementFromContract`); banco/filial/armazem sao **seleção** → snapshot-only (nao escrevem de volta no cadastro). A etapa 2 valida `paymentDate >= invoiceDate` (D142, 422 no campo); desde a D144, em contrato FUTURO cada data planejada pode vir `null` explicito ("A definir", `normalizeEtapa2Input(input, { allowOpenDates })`) — D142/dia-util so valem com data presente. **Situacao `EMITIDO` <-> `FINALIZADO` + `WASH_OUT` (RC-D62, 2026-07-28)**: `finalizeSaleContract`/`reopenSaleContract` (motor comum `_flipContractStatus` — guard de status + `expectedVersion` + log na mesma tx; **sem data no payload**, e **reversivel** por RC-D63) e `washoutSaleContract` (definitivo). `FATURADO`/`PAGO`, os metodos `invoiceSaleContract`/`paySaleContract` e o **embarque inteiro** foram apagados (RC-D65); os portoes AP18/EMB28 nao existem mais — a aprovacao **avisa e nao trava** (RC-D66). O que a lista mostra e a **agenda** (`deriveContractAgenda` no support, RC-D68): o proximo compromisso derivado de status + `requiresApproval` + etiqueta + as 2 datas planejadas, nunca persistido. Marcos auditados em `SaleContractStatusLog` (D123 — detalhe do enum na skill `prisma`) + `applyAgioSaleContract` (agio/desagio pos-emissao), `listContractLookups`/`createContractLookup` (as 3 listas), `listBrokerReceivables` (Financeiro — **RC-D89** revoga a D145: a corretagem do cancelado deixou de ser derivada do `type` e virou **resposta** dada no proprio washout, na coluna `washoutBillable`. Quem respondeu "nao cobrar" — e quem nao respondeu — sai do Financeiro (filtrado por `washoutBillable: true` no `where`, nao chega ao card) e tem o Espelho bloqueado (`ESPELHO_WASHOUT_NOT_BILLABLE`, predicado `isWashoutNotBillable`, `!== true` fail-closed). O washout passou a exigir a resposta como exige o motivo (422 `SALE_CONTRACT_WASHOUT_BILLABLE_REQUIRED`) e virou a **unica porta** de cancelar a venda: o lote nao desfaz movimentacao comercial (RC-D87). **RC-D93**: a resposta devolve `kpis` — os QUATRO estados (a_vencer/vencido/recebida/cancelado), cada um com `count` e `value` — no lugar de `totalCommission`/`overdueCount`/`overdueCommission`. Os `where` dos quatro sao UMA constante (`STATE_WHERE`), lida pelos grupos da paginacao E pelos quatro `aggregate`: na pagina o cartao E o filtro, entao os dois nao podem discordar. Os agregados ficam sob o `where` da BUSCA, independentes do filtro ativo e do cursor) e `getSaleContractTimeline`/`logEspelhoGenerated` (auditoria/Espelho). As mutacoes sao **CRUD direto** (`SaleContract` nao tem trigger de UPDATE) com concorrencia otimista por `version`. **PDF (Fase C)**: `sale-contract-pdf-service.js` (`SaleContractPdfService.renderContractPdf` — `pdf-lib`, mesmo stack do laudo; estilo do app) + `issuer-config.js` (`getContractIssuer`: nome/endereco fixos + **CNPJ via `CONTRACT_ISSUER_CNPJ`**). Gerado **on-demand, sem armazenar** (D32): handler `exportSaleContractPdf` (gate via `getSaleContract` = NON_PROSPECTOR; **sem gate de status**, todo contrato nasce EMITIDO) + rota GET `app/api/v1/sale-contracts/[id]/pdf` que serve binario (molde `samples/[id]/export/pdf`); client `downloadSaleContractPdf` + `shareOrDownloadFile`. **Previa da emissao (RC-D27/D28, 2026-07-28)**: `previewSaleContract` monta o contrato QUE SERIA emitido reusando o mesmo `_resolveEmitData` (sem gravar e **sem alocar numero** — a alocacao vive na tx sob advisory lock, entao na criacao o documento sai com numero provisorio) e o handler `previewSaleContractPdf` o entrega ao mesmo `renderContractPdf`; rota **POST** `app/api/v1/sale-contracts/preview/pdf` (POST, nao GET: o contrato ainda nao existe e o corpo do formulario e a entrada). O cliente rasteriza com `pdfjs-dist` (unica dependencia nova; import dinamico, chunk lazy)
- `src/visits/` — **Relatorios** (pagina `/relatorios`): **serviço único** `visit-report-service` (o `commercial-forms-service` foi ABSORVIDO na UNIFICACAO 2026-07-15). Dois tipos: **Visita** (`visit_report`, funde o antigo informe do prospector + a visita do comercial) — **nasce VINCULADA** (`clientId` obrigatório nos dois `clientKind`; cadastro no próprio form via `ClientQuickCreateModal`), campos de domínio `farmSize`/`interestLevel`/`sellsCurrently` + `reason`/`outcome` **TODOS opcionais**, **online-only** (sem fila offline); qualquer autenticado cria (incl. PROSPECTOR). E **Semanal** (`weekly_report`, `WEEKLY_REPORT_AUTHOR_ROLES` = **só ADMIN+COMMERCIAL**; UNIQUE por semana). Ambos IMUTÁVEIS: **cancelar soft** (`cancelVisitReport`/`cancelWeeklyReport`, `cancelled_at/by`, só o autor). Listagem: viewers (`VISIT_REPORT_VIEWER_ROLES` = todo não-PROSPECTOR) veem tudo; PROSPECTOR vê **só as próprias** (`where.userId`, alimenta o dashboard dele). Feed combinado `listInformeFeed` (**scope=all fixo**: visita + semanal). Curadoria de vínculo e fila offline **REMOVIDAS**. Allowlist do prospector (`src/auth/prospector-access.js`) **ganhou** `lookupClients`/`createClient`/`lookupUsersForReference` (relacionar/cadastrar cliente no form da visita)
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

### 🔴 Markup dentro de `<Suspense>` nao pode depender de efeito de FORA

Um `useLayoutEffect` **acima** de uma fronteira de Suspense roda **sempre antes** de o conteudo
**dentro** dela ser hidratado. Nao e corrida, e ordem garantida: no primeiro passe o React so
ESTACIONA a fronteira (`updateSuspenseComponent` grava a lane Offscreen e devolve `null` — nem chama
quem esta dentro) e volta nela numa tarefa de prioridade minima, ja com o estado novo commitado.

Logo: markup de dentro que dependa de estado que um efeito de fora introduz e **mismatch garantido**,
nao provavel. Foi o que aconteceu com o gate do `app/(app)/layout.tsx` (SN-D15).

Quando precisar, sao dois mecanismos, nesta ordem de preferencia:

1. **`useSyncExternalStore` + `getServerSnapshot`** — a unica API que sabe responder "este passe e de
   hidratacao" e devolve o valor do servidor enquanto for. Molde no repo:
   `lib/navigation/nav-progress.ts` (`getServerNavPending`, SN-D11).
2. **Latch local de hidratacao** — `useState(false)` + layout effect que vira `true`, tornando o
   primeiro render uma CONSTANTE. Molde: `app/(app)/layout.tsx` (SN-D15). Layout effect, **nunca**
   `useEffect`: com `useEffect` a troca cai depois da pintura e todo mundo ganha um frame do estado
   provisorio.

🔴 **Nunca `suppressHydrationWarning`.** Alem de contrariar a decisao da F5, ele costuma nao resolver:
ele cobre texto e atributos **do proprio no**, e o throw normalmente vem de um FILHO sem contraparte
no HTML servido — foi exatamente o caso da SN-D15.

⚠️ **`typeof window === 'undefined'` nao serve de guarda** — durante a hidratacao `window` existe.

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
- Uploads: sempre validar magic bytes (file-type), na ENTRADA — helper compartilhado `assertImageMagicBytes` em `src/uploads/upload-policy.js`. Fotos de amostra: JPEG/PNG/WebP (`saveSamplePhoto`, e tambem o detect/extract temporario da camera — CAM-I1); anexos de cliente: JPEG/PNG/WebP + PDF (`saveClientAttachment`). _(As fotos de embarque sairam na RC-D65, 2026-07-28.)_
- Inputs: usar normalizers no service layer.
- SQL: sempre Prisma parameterized ou tagged templates (`$queryRaw`). Nunca string concat.
- Headers HTTP: configurados em `next.config.mjs`. Nao remover sem justificativa.
- Rate limiting: `src/auth/rate-limiter.js` (10 req/min por IP).
- Papeis nao atribuiveis: `NON_ASSIGNABLE_ROLES` / `isAssignableUserRole` (`src/auth/roles.js`). Nao podem ser referenciados em vinculo nenhum. `lookupUsersForReference` os omite do seletor, mas o gate de verdade sao os 422 `PROSPECTOR_NOT_ASSIGNABLE` nos pontos de escrita (`assertCommercialUserAssignable`, `normalizeClassifiers`, `_assertUserExists` do broker, `createUser`). Esconder da UI sem barrar na API e alivio visual, nao fronteira.
