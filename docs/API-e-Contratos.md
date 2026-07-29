# API e Contratos

Status: Ativo  
Escopo: referencia oficial das rotas internas, contratos de eventos e regras de validacao  
Ultima revisao: 2026-04-15  
Documentos relacionados: `docs/Produto-e-Fluxos.md`, `docs/schemas/events/v1/README.md`

## Escopo da API

A API `v1` e interna ao sistema e atende o frontend web do proprio projeto. As rotas HTTP vivem em `app/api/v1`, mas a logica principal fica no backend framework-agnostic em `src/api/v1/backend-api.js`.

Este doc cobre as rotas de **amostras, clientes, usuarios e informes**. As rotas do dominio de **contratos** (`/sale-contracts/*`, `/approval-labels`, `/financeiro`, `/contract-lookups`) estao catalogadas na `Contratos-Visao-Geral.md` §10 — lista unica, sem duplicacao.

## Autenticacao

1. `POST /api/v1/auth/login`
   Valida credenciais, cria sessao em banco e devolve cookie HTTP-only para o navegador.
2. `POST /api/v1/auth/logout`
   Revoga a sessao atual e limpa o cookie.
3. `GET /api/v1/auth/session`
   Retorna sessao atual e dados do usuario autenticado.
4. `POST /api/v1/auth/forgot-password/request`
   Solicita codigo de recuperacao por email (resposta generica — nao revela se o email existe).
5. `POST /api/v1/auth/forgot-password/verify-code`
   Valida o codigo de 6 digitos sem consumi-lo (passo intermediario do modal; 5 erros invalidam o pedido).
6. `POST /api/v1/auth/forgot-password/reset`
   Redefine senha com codigo valido, consome o pedido e revoga todas as sessoes do usuario.

Notas das rotas publicas de auth:

1. Rate limit por IP (10 req/60s, mesma primitiva) no `login` e nas 3 rotas de `forgot-password`; 429 com `retryAfter`.
2. `verify-code`/`reset` respondem de forma unificada (422 `INVALID_CODE`) para email inexistente, conta inativa/bloqueada e pedido invalido — anti-enumeracao.
3. A pagina `/login` aceita `?reason=session-expired|session-ended` (produzido pelos gates ao expulsar a sessao) e mostra aviso informativo; o param sai da URL apos lido.
4. `POST /api/v1/auth/session/expired` foi removido em 2026-07-06 (rota orfa; a expiracao e registrada server-side ao autenticar).

Regra consolidada:

1. a API aceita Bearer token assinado;
2. o frontend web usa esse token dentro de cookie HTTP-only;
3. sessoes sao persistidas em `UserSession` e podem ser revogadas.

## Rotas de amostras

### Escrita

1. `POST /api/v1/samples/create`
   Cria o lote emitindo um unico evento `REGISTRATION_CONFIRMED`. Body: `clientDraftId` (obrigatorio — ancora da idempotencia), `ownerClientId` (obrigatorio; `resolveOwnerBinding` exige cliente existente, ativo e vendedor), `sacks` (inteiro >= 1), `harvest` (obrigatorio), `originLot` (opcional, <= 100), `location` (opcional, <= 30), `notes` (opcional, <= 500), `sampleLotNumber` + `lotNumberManual` (numero manual do lote — a API so repassa o numero quando `lotNumberManual === true`, hardening LNW-B1; `normalizeManualLotNumber` valida digitos/faixa e colisao responde 409 com `field: lotNumber`) e `receivedDate` (data de chegada `YYYY-MM-DD`; dia passado vira meio-dia SP, futuro 422). `receivedChannel` nao vem mais do frontend (LNW-D3): o backend aplica o default `in_person` e segue aceitando o enum completo. Idempotencia: `sampleId` deterministico (hash de `actorUserId` + `clientDraftId`) — retry do mesmo draft responde `200 { idempotent: true }` sem evento novo; draft de amostra INVALIDATED responde 409. Cobertura em `tests/sample-create-validation.integration.test.js`.
2. `POST /api/v1/samples/blends`
   Cria a liga a partir de 2+ lotes de origem. Mesma ancora de idempotencia da criacao (`clientDraftId`), mais `components[]`, `ownerClientId?`/`ownerFixed?`, `lotNumber?`/`lotNumberManual?` e `receivedDate?`. Safra, sacas e lote de origem sao **derivados** das origens — ver `Liga-Plano-de-Trabalho.md`.
3. `POST /api/v1/samples/:sampleId/revert-blend`
   Reverte a liga: emite `BLEND_REVERTED`, leva a liga a `INVALIDATED` e devolve as origens ao estado anterior. Composicao preservada no evento.
4. `POST /api/v1/samples/:sampleId/registration/update`
   Edita os campos declarados do lote. Guards de liga: 422 `BLEND_HARVEST_READ_ONLY` (safra) e `BLEND_SACKS_READ_ONLY` (sacas); o lote de origem, ao contrario, e editavel e a edicao **fixa** a origem (`blendOriginLotPinned`).
5. `POST /api/v1/samples/:sampleId/photos`
6. `POST /api/v1/samples/:sampleId/qr/print/request`
7. `POST /api/v1/samples/:sampleId/qr/print/failed`
8. `POST /api/v1/samples/:sampleId/qr/printed`
9. `POST /api/v1/samples/:sampleId/classification/update`
   (Nao existem `classification/start` nem `/partial` — cortados no Q.cls.1; `classification/complete` era DEPRECATED e foi REMOVIDA em 2026-07-13, CL13 — classificacao nova e exclusiva de `POST /api/v1/classification/confirm`. Tambem nao existem `registration/start`, `registration/confirm` nem `qr/reprint/request`: a criacao emite `REGISTRATION_CONFIRMED` direto e a reimpressao reusa `qr/print/request`.)
10. `POST /api/v1/samples/:sampleId/edits/revert`
11. `POST /api/v1/samples/:sampleId/commercial-status`
12. `POST /api/v1/samples/:sampleId/movements`
    Registra venda (`SALE`) ou perda (`LOSS`). Gate de status: so em `REGISTRATION_CONFIRMED` ou `CLASSIFIED`. Numa liga a perda e sempre 100% (sem campo de quantidade) e dispara a cascata nas ligas que a contem.
13. `PATCH /api/v1/samples/:sampleId/movements/:movementId`
    Edita uma movimentacao ativa (exige motivo). **Sem consumidor de UI hoje** — a superficie que a chamava era o `SampleMovementModal`, deletado no redesenho.
14. `POST /api/v1/samples/:sampleId/movements/:movementId/cancel`
    Cancela a movimentacao (exige motivo) e recalcula o status comercial.
15. `POST /api/v1/samples/:sampleId/physical-send`
    Registra o envio fisico. Um POST **por destinatario** (a UI itera a lista de clientes). Gate de status: `REGISTRATION_CONFIRMED` ou `CLASSIFIED`.
16. `PATCH /api/v1/samples/:sampleId/physical-send/:sendEventId`
    Edita destinatario e data do envio (`PHYSICAL_SAMPLE_SEND_UPDATED`).
17. `DELETE /api/v1/samples/:sampleId/physical-send/:sendEventId`
    Cancela o envio (`PHYSICAL_SAMPLE_SEND_CANCELLED`) e **revoga o laudo publico** vinculado (`revokeReportShareBySendEvent`).
18. `POST /api/v1/samples/:sampleId/export/pdf`
19. `POST /api/v1/samples/:sampleId/invalidate`
    Encerra o lote em `INVALIDATED` (soft-delete que libera o numero). A UI do detalhe rotula essa acao como **"Deletar"** (LDT-D2) — o endpoint continua `/invalidate`. 409 `SAMPLE_HAS_CONTRACT` se houver contrato vinculado; 409 `SAMPLE_HAS_ACTIVE_BLENDS` se o lote for origem de liga ativa.

### Leitura de anexo (foto)

- `GET /api/v1/samples/:sampleId/photos/:attachmentId`
  Serve o binario da foto da classificacao. **Exige sessao valida** (LDT-D4, 2026-07-08): a autorizacao passa por `getSampleAttachmentDescriptor` (`resolveActorContext` → 401 sem sessao, 403 PROSPECTOR pela allowlist), e so entao a rota le o arquivo do disco (com guard de path-traversal). `Cache-Control: private, max-age=3600, immutable`. O `<img>` same-origin ja envia o cookie httpOnly, entao o carregamento normal nao muda.

### Classificacao por camera e IA

Rotas top-level usadas pelo fluxo de `Camera inteligente` (o `sampleId` chega no body quando relevante):

1. `POST /api/v1/classification/detect-form`
   Recebe a foto (`multipart/form-data`), salva em area temporaria e tenta auto-cropar a ficha. Retorna `photoToken` e flag `detected`.
2. `POST /api/v1/classification/extract-and-prepare`
   Aceita `multipart/form-data` (upload direto) ou `application/json` com `photoToken` (obrigatoriamente UUID — 422 fora do formato). Envia a imagem ao modelo de extracao (GPT-4o pinado), retorna os campos extraidos (+ `extractionAvailable`) e grava o resultado bruto num sidecar que o confirm consome pra emitir os eventos de auditoria (CAM-P1). Falha da IA responde 504 (timeout) ou 502 (demais) com mensagem pt-BR. A extracao e type-agnostic (1 prompt unico da ficha unificada) — o tipo e escolhido depois pelo operador e nao influencia a IA.
3. `POST /api/v1/classification/confirm`
   Persiste a classificacao apos revisao do usuario, recebendo `sampleId`, `classificationData`, `photoToken`, `classificationType` e `classifiers` (obrigatorio, min 1 — o frontend envia a selecao como esta, SEM prepend do ator, que e apenas pre-selecionado e removivel desde 2026-06-01; backend valida existencia/ativo dos usuarios). Roteia entre `completeClassification` ou `updateClassification` conforme o status atual da amostra.
4. `POST /api/v1/classification/resolve-lot`
   Procura a amostra a partir do lote extraido, usado pelo fluxo sem contexto previo.

Validacoes criticas nessas rotas:

1. `detect-form` e o modo `multipart` de `extract-and-prepare` rejeitam com `415` se o `Content-Type` nao comecar com `multipart/form-data`;
2. o enum `ClassificationType` e `BICA / PREPARADO / BAIXO / ESCOLHA / CONILON` (pos Q.types + CONILON em 2026-06-01) e e validado no SAVE (`confirm`/`update`), nao no `extract-and-prepare` (que ignora tipo);
3. a extracao por IA depende de `OPENAI_API_KEY` configurada — caso contrario o fluxo degrada pra preenchimento manual (sem extracao).

### Leitura

1. `GET /api/v1/samples`
   Lista paginada (cursor keyset por numero de lote). Filtros: busca por texto (`search`, casa por prefixo); status de exibicao (`displayStatus`); **grupo de status (`statusGroup`, hoje so `CLASSIFICATION_PENDING` — e o que o KPI clicavel da lista aplica)**; safra multipla (`harvests`); proprietario / comprador / enviado-para por cliente (`ownerClientIds` / `buyerClientIds` / `sentToClientIds`); classificacao (`padroes` / `aspectos` / `catacoes` / `certificados`); faixa de sacas (`sacksMin` / `sacksMax`); periodo de registro (`createdFrom` / `createdTo`); apenas ligas (`isBlend`). Opcional `eligibleForBlend` enriquece cada item com `eligibility` + `committedSacks` (modo Liga). No load-more (com cursor) `page.total`/`page.totalPages` vem `null` (o COUNT so roda na carga inicial).
2. `GET /api/v1/samples/stats`
   KPI row da lista de Lotes. Contagens **globais**, independentes dos filtros da lista, com deletados de fora: `total`, `open`, `classificationPending`, `sold`, `soldThisWeek`, `soldLastWeek`, `newThisMonth`, `newLastMonth` (shape em `SampleStatsResponse`, `lib/types.ts`). Os pares `*ThisWeek`/`*LastWeek` e `*ThisMonth`/`*LastMonth` existem so pra render da variacao. `Cache-Control: private, max-age=30, must-revalidate`. So e chamado no desktop.
3. `GET /api/v1/samples/:sampleId`
   Retorna snapshot, anexos e preview inicial do historico.
4. `GET /api/v1/samples/:sampleId/events`
   Retorna timeline de eventos.
5. `GET /api/v1/samples/:sampleId/movements`
   Movimentacoes (vendas e perdas) ativas e canceladas do lote.
6. `GET /api/v1/samples/:sampleId/blend-feasibility`
   Pre-valida a cascata antes de vender/perder um lote que e origem de liga ativa: diz se a operacao cabe e o que ela derruba.
7. `GET /api/v1/samples/resolve`
   Resolve QR bruto para UUID ou lote interno.
8. `GET /api/v1/samples/classification-values`
   Valores distintos de um campo de classificacao (`?field=padrao|aspecto|catacao|certif`) — alimenta as opcoes dos multi-selects do painel de filtros.
9. `GET /api/v1/samples/next-lot-number`
   Sugestao do proximo numero da sequencia (`{ nextLotNumber }`) pra pre-preencher o campo editavel no formulario de criacao. E so sugestao: o numero real e gerado server-side no submit (com retry de colisao no modo automatico).

Duas rotas de leitura ficaram **sem consumidor** quando os cards que as alimentavam sairam de `/samples` no redesenho FV (a contagem de pendentes virou KPI da propria lista, servida por `/samples/stats`; o feed de envios saiu do produto). Continuam de pe, mas nada as chama:

- `GET /api/v1/dashboard/pending` — `{ classificationPending: { total } }`. Alimentava o card so-visualizacao "Classificacao pendente" (DSB-D2). Componente `ClassificationPendingCard` orfao.
- `GET /api/v1/samples/recent-sends` — `{ items }`, top-40, `kind ∈ {PHYSICAL_SAMPLE, REPORT}`, destinatario ATUAL (ultima `SEND_UPDATED` vence) e flag `cancelled`; excluia `INVALIDATED`. Alimentava o card "Amostras enviadas" (DSB-D14). O helper `getSampleRecentSends` do api-client tambem esta orfao.

> O feed de envios de APROVACAO (`GET /api/v1/sale-contracts/approvals/recent-sends`) **foi REMOVIDO em 2026-07-27** (RC-D26): a rota, o helper `getApprovalRecentSends` e o handler do backend sairam junto com o card "Aprovacoes enviadas" e com o `RecentSendsCard` — o ultimo consumidor vivo do componente, ja que a variante `'samples'` tinha morrido no redesenho FV de `/samples`. O que sobrou como sinal proativo de aprovacao e o **card de Avisos** do dashboard (`GET /api/v1/dashboard/avisos`), que usa o mesmo hook `use-recent-sends-feed`. A rota `GET /api/v1/samples/recent-sends` acima **nao** foi apagada: tem suite propria (`tests/sample-recent-sends.integration.test.js`).

> Autorização dos endpoints de dashboard e dos feeds de envios: apenas autenticação (PROSPECTOR é negado pela allowlist central). **Sem gate positivo de papel por decisão** (DSH-D2, 2026-07-07). As rotas `dashboard/commercial-timeseries` (card "Vendas e perdas", 2026-07-07 — DSH-D3), `dashboard/sales-availability` (donut "Lotes disponíveis", 2026-07-14 — DSB-D14) e `dashboard/recent-sends` (dividida/movida — DSB-D14) foram removidas.

## Rotas de clientes (L5)

### CRUD de cliente

1. `GET /api/v1/clients`
   Lista paginada com busca por nome, documento, codigo. Filtra por `personType`, `isBuyer`, `isSeller`, `commercialUserIds[]`.
2. `POST /api/v1/clients`
   Cria cliente. Para PJ exige `cnpj` direto no body (e aceita `addressLine`/`city`/`state`/`registrationNumber`/etc.). Para PF aceita `units[]` (fazendas opcionais com `name` obrigatorio + `cnpj`/`car`/endereco). PJ rejeita `units[]` com 422 `PJ_HAS_NO_UNITS`. **Suporta header opcional `Idempotency-Key` (#5/Q-02)** — duas chamadas com a mesma key (e mesmo escopo + actor) retornam a resposta da primeira sem criar duplicata. Cache 24h. Cache TUDO (sucessos e erros).
3. `GET /api/v1/clients/stats`
   KPI row da lista de `/cadastros` — contagens globais, independentes dos filtros. Mesmo racional de cache do `/samples/stats`: `Cache-Control: private, max-age=30, must-revalidate`, chamado so no desktop.
4. `GET /api/v1/clients/lookup`
   Smart resolve: 14 digitos batem CNPJ direto em Client (PJ) ou em ClientUnit (fazenda PF). Retorna `matchedUnitId` quando o match e via unit.
5. `GET /api/v1/clients/:clientId`
   Detalhe + lista de `units` (PF; PJ retorna `units: []`). Aceita query
   param **`?onlyActive=true`** (Q-01) que filtra unidades inativas do
   payload retornado. Default `false` (retrocompativel).
6. `PATCH /api/v1/clients/:clientId`
   Atualiza fields. **Aceita payload partial** — backend usa `Object.hasOwn` para detectar campos presentes (em `normalizeUpdateClientInput`); o front divide a edicao em duas tabs (`info` e `address`) e envia apenas os campos da tab atual + `reasonText`. PJ pode editar `cnpj` (UNIQUE), `addressLine`, `city`, `state`, `registrationNumber`, `email` direto. Bloqueia troca de `personType` com 422 `CLIENT_PERSON_TYPE_LOCKED`. Outros codigos de erro mapeados no front (em pt-BR): `COMMERCIAL_USER_REQUIRED_FOR_ACTIVE`, `COMMERCIAL_USER_NOT_FOUND`, `COMMERCIAL_USER_INACTIVE`, `PROSPECTOR_NOT_ASSIGNABLE` (422; papel nao atribuivel como responsavel — vale tambem em `createClient`, `addCommercialUserToClient` e `bulkAddCommercialUser`), `PJ_REQUIRES_CNPJ`. `email` e opcional em ambos PF e PJ. Exige `reasonText`.
7. `POST /api/v1/clients/:clientId/inactivate`
   Inativa cliente. **#6/Q-05 (E1): rejeita 409 `CLIENT_HAS_ACTIVE_SAMPLES`** se o cliente tem amostras ATIVAS (`status NOT IN ('INVALIDATED')`). Body `{ reasonText: string }` (obrigatorio). Resposta 409 inclui `details.code = 'CLIENT_HAS_ACTIVE_SAMPLES'` + `details.details.activeSampleIds`/`activeSamples` para o front abrir o modal de cascata.
8. `POST /api/v1/clients/:clientId/inactivate-with-cascade`
   **#6/Q-05+Q-08**: inativacao em cascata. Body `{ confirmedSampleIds: string[], reasonText?: string }`. Pre-valida que nenhuma sample tem `soldSacks>0` ou `lostSacks>0` (retorna 409 `SAMPLES_HAVE_ACTIVE_MOVEMENTS` se houver). Numa unica transacao, invalida cada sample (status=INVALIDATED + audit `SAMPLE_INVALIDATED` com payload `{ reason: 'OWNER_INACTIVATED', batchId, ... }`) e inativa o cliente (audit `CLIENT_INACTIVATED` com `cascade.{ batchId, cascadedSampleIds, skippedSampleIds }`). IDs ja INVALIDATED sao silenciosamente pulados (A1). reasonText opcional (D2). Reativar cliente NAO reativa samples — status terminal (B1).
9. `POST /api/v1/clients/:clientId/reactivate`
   Reativacao de cliente ACTIVE exige >= 1 user comercial vinculado.

### Unidades (PF — fazendas)

PJ rejeita TODAS as rotas abaixo com 422 `CLIENT_PJ_HAS_NO_UNITS`.

1. `POST /api/v1/clients/:clientId/units`
   Cria fazenda. Body aceita `name` (obrigatorio), `cnpj` opcional (UNIQUE), `addressLine`/`city`/`state`/etc., `registrationNumber` (UNIQUE canonico), `car` (Cadastro Ambiental Rural). **Suporta header opcional `Idempotency-Key` (#5/Q-02)** — mesma key + mesmo actor retorna resposta cached. Cache 24h.
2. `PATCH /api/v1/clients/:clientId/units/:unitId`
   Atualiza. Exige `reasonText`.
3. `POST /api/v1/clients/:clientId/units/:unitId/inactivate`
4. `POST /api/v1/clients/:clientId/units/:unitId/reactivate`

### Anexos do cliente (Contratos Fase 0 — D27/D139)

Acesso = qualquer usuario autenticado (D59). PROSPECTOR e negado pela allowlist central.

1. `GET /api/v1/clients/:clientId/attachments`
   Lista `{ items }` ordenada por `createdAt desc`. A view NAO expoe `storagePath`/`checksumSha256`; inclui `uploadedBy` e `unit` (a filial dona, so `{id,name,status}`) — `unit: null` = anexo do proprio cliente.
2. `POST /api/v1/clients/:clientId/attachments`
   `multipart/form-data` com `file` (+ `originalFileName`/`description` opcionais). Valida magic bytes (JPEG/PNG/WebP + PDF → 415) e tamanho (413 acima de `MAX_UPLOAD_SIZE_BYTES`). Nasce **sem filial** (`unitId: null`). Responde 201.
3. `GET /api/v1/clients/:clientId/attachments/:attachmentId`
   Download/preview inline direto do disco. Escopo por UUID do cliente + do anexo, com guard de path-traversal. Nao passa pelo backend-api.
4. `PATCH /api/v1/clients/:clientId/attachments/:attachmentId`
   **Vincula o anexo a uma filial** (D139). Body `{ unitId }`. O vinculo e **definitivo** e **nao move o arquivo** (`storagePath` intacto). Erros: 409 `CLIENT_ATTACHMENT_ALREADY_LINKED` (ja vinculado), 404 `CLIENT_ATTACHMENT_NOT_FOUND` (anexo de outro cliente), 404 `CLIENT_UNIT_NOT_FOUND` (filial de outro cliente; cobre PJ, que nao tem filial), 422 `CLIENT_UNIT_INACTIVE`.
5. `DELETE /api/v1/clients/:clientId/attachments/:attachmentId`
   Remove a linha e depois o arquivo (best-effort; a linha e a fonte da verdade). Funciona mesmo com a filial inativa.

### Joins comerciais

1. `POST /api/v1/clients/:clientId/users`
2. `DELETE /api/v1/clients/:clientId/users/:userId`
3. `POST /api/v1/clients/bulk-add-commercial-user`
4. `GET /api/v1/clients/:clientId/audit`

### Visao comercial (#14.7.N)

Endpoints somente-leitura usados pela pagina de detalhe do cliente (4 cards-filtro + lista paginada). Todos respeitam regra de filial ativa: amostras com `ownerUnitId IS NULL` ou `ownerUnit.status = 'ACTIVE'`. Movimentos com `status = 'CANCELLED'` sao ignorados.

1. `GET /api/v1/clients/:clientId/commercial-summary`
   Retorna 4 contadores agregados do cliente como **proprietario**: `{ openCount, soldCount, lostCount, boughtCount }`.
   - `openCount`: amostras nao invalidadas com `commercialStatus IN ('OPEN', 'PARTIALLY_SOLD')`.
   - `soldCount`: amostras nao invalidadas com `commercialStatus = 'SOLD'`.
   - `lostCount`: amostras nao invalidadas com `commercialStatus = 'LOST'`.
   - `boughtCount`: contagem distinta de `sampleId` em `SampleMovement` onde o cliente e o comprador (`movementType = 'SALE'`, `status = 'ACTIVE'`).
2. `GET /api/v1/clients/:clientId/samples?status=open|sold|lost&page=N&limit=20`
   Lista paginada de amostras do cliente como proprietario, filtrada por status comercial. `status` aceita os 3 valores acima (mesmo mapping do summary). Retorna `{ items: ClientSampleListItem[], page: { total, page, limit, hasNext, ... } }`. Ordenacao: `createdAt DESC, id DESC`.
3. `GET /api/v1/clients/:clientId/purchases?page=N&limit=20`
   Lista paginada de **movimentos de venda** onde o cliente e o comprador (perspectiva diferente do summary `boughtCount`, que e distinct por sample — aqui cada movimento e uma row). Retorna `{ items: ClientPurchaseListItem[], page: { ... } }` com `sampleId`, `sampleLotNumber`, `sellerName` (de `sample.declaredOwner`), `quantitySacks`, `movementDate` (ISO date string `YYYY-MM-DD`).

### Bindings de owner/buyer em sample

1. `Sample.ownerClientId` e obrigatorio em registration confirm; `Sample.ownerUnitId` e opcional (apenas PF, e a fazenda deve pertencer ao mesmo owner). PJ sempre tem `ownerUnitId=null`.
2. `SampleMovement.buyerClientId` e obrigatorio em SALE; `buyerUnitId` segue mesma regra (so PF, opcional).

## Rotas de usuarios

### Administracao

1. `GET /api/v1/users`
   ADMIN. Busca (`search`) + cursor alfabetico (`cursorFullName` + `cursorId`, espelha o de `listClients`) + `limit` (`USER_LIST_LIMIT_DEFAULT`/`_MAX`). Aceita tambem `role` e `status`, que **nenhuma tela envia** — o redesenho FV decidiu toolbar so-busca em `/users` (RD16 §2.11, decisao U-D3). Testados e mantidos de proposito.
2. `POST /api/v1/users`
3. `GET /api/v1/users/:userId`
4. `PATCH /api/v1/users/:userId`
5. `POST /api/v1/users/:userId/inactivate`
6. `POST /api/v1/users/:userId/reactivate`
7. `POST /api/v1/users/:userId/unlock`
8. `POST /api/v1/users/:userId/password/reset`
9. `GET /api/v1/users/audit`
   **Sem tela hoje, de proposito** (RD16 §2.11, decisao U-D5): a trilha de auditoria de usuario existe de ponta a ponta (service → rota → `listUserAuditEvents` no `api-client`) e nao tem consumidor de UI. O redesenho FV de `/users` decidiu nao abrir tela pra ela. Nao e codigo morto — nao remover sem reverter a U-D5.
10. `GET /api/v1/users/:userId/clients-impact`
    Quais clientes ficam **sem responsavel comercial** se este usuario sair: devolve `soleCustodianOf` (ele e o unico vinculado) e `coCustodianOf` (ha outros). Aberta a qualquer autenticado (`assertAuthenticatedActor`). **Tambem sem consumidor de UI** — a confirmacao de inativar em `/users` nao consulta esse impacto.
11. `GET /api/v1/users/lookup`
    Lista reduzida (`id`, `fullName`, `username`) de usuarios ativos. Endpoint unico por tras de TODOS os seletores de usuario do app: responsavel comercial de cliente, classificador de amostra (CameraSheet global), usuario vinculado a um corretor e **responsavel do embarque quando "Pela empresa" (EMB30)**. Aberta a qualquer usuario autenticado (nao restrita a `ADMIN`).

    **Nao devolve papeis de `NON_ASSIGNABLE_ROLES`** (hoje: `PROSPECTOR`) — 2026-07-09. Os `COMMERCIAL` vem primeiro na ordenacao.

### Conta propria

1. `GET /api/v1/users/me`
2. `PATCH /api/v1/users/me/profile`
3. `POST /api/v1/users/me/password`
4. `POST /api/v1/users/me/email/request-change`
5. `POST /api/v1/users/me/email/confirm-change`
6. `POST /api/v1/users/me/email/resend`
7. `POST /api/v1/users/me/initial-password-decision`

## Rotas de Relatorios (Visita unificada + Semanal)

Pagina "Relatorios" (rota `/relatorios` desde a **UNIFICACAO 2026-07-15**; `/informe` e `/resumo` redirecionam). Dois tipos: **Visita** (funde o antigo informe do prospector + a visita do comercial) e **Semanal**. As rotas `commercial-visits/*` e a curadoria de vinculo (`visit-reports/:id/client`, `commercial-visits/:id/client`) foram **REMOVIDAS**.

1. `POST /api/v1/visit-reports`
   VISITA unificada. **Qualquer autenticado, incl. PROSPECTOR.** **Nasce VINCULADA** a um `Client` ativo — `clientId` obrigatorio nos DOIS `clientKind` (EXISTING/NEW); em NEW o proprio form cadastra o cliente (`ClientQuickCreateModal`) e `newClientName/City/Phone` viram anotacao de campo. Campos de dominio TODOS OPCIONAIS: `farmSize`/`interestLevel`/`sellsCurrently`(+`sellsToWhom`) e `reason`/`outcome` (+`*Notes`), `generalNotes`. `userId`/`createdAt` no servidor. **Online-only** (sem fila offline, sem `Idempotency-Key`). `clientId` ausente/inexistente/inativo => `422` (`VALIDATION_ERROR` / `VISIT_CLIENT_NOT_FOUND` / `VISIT_CLIENT_INACTIVE`).
2. `GET /api/v1/visit-reports`
   Paginada (`page`, `limit` max 100), recentes primeiro. Viewer (`VISIT_REPORT_VIEWER_ROLES` = `NON_PROSPECTOR_ROLES`) ve TODAS; o **PROSPECTOR ve APENAS as PROPRIAS** (escopo forcado `where.userId`, alimenta a lista do dashboard dele). `search` (max 120) filtra por nome do cliente — acento-insensitive via colunas geradas (`new_client_name_normalized`/`client.search_normalized`). Inclui as canceladas (marcadas).
3. `GET /api/v1/visit-reports/stats`
   Contadores do dashboard do prospector, sempre do proprio ator: `{ todayCount, todayNewClientsCount }` — **EXCLUEM canceladas**. Janela do dia BRT (UTC-3), base `COALESCE(captured_at, created_at)`.
4. `DELETE /api/v1/visit-reports/:reportId` — **CANCELAMENTO SOFT** (`cancelVisitReport`): a visita e imutavel; marca `cancelled_at/by` e fica no historico como "Cancelado". **So o proprio autor** (nem ADMIN cancela alheia; alheia / ja-cancelada / inexistente => 404). Devolve a view atualizada.
5. `POST /api/v1/weekly-reports`
   Relatorio SEMANAL — **so ADMIN + COMMERCIAL** (`WEEKLY_REPORT_AUTHOR_ROLES`; demais papeis => 403). Body: `summary` (obrigatorio), `difficulties`, `nextWeekPlan`. Semana (segunda BRT) computada no servidor; max 1/usuario/semana (`409 WEEKLY_REPORT_ALREADY_EXISTS`).
6. `DELETE /api/v1/weekly-reports/:reportId` — cancelamento SOFT (`cancelWeeklyReport`), so o proprio autor (alheia / ja-cancelada => 404).
7. `GET /api/v1/informe-feed`
   Feed combinado da pagina "Relatorios" (**escopo `all` FIXO — nao ha parametro de escopo**): VISITA + SEMANAL de TODOS os autores, recentes primeiro, `type` discriminador (`VISIT_REPORT` / `WEEKLY_REPORT`). Gate `VISIT_REPORT_VIEWER_ROLES` (todo nao-PROSPECTOR; o PROSPECTOR nao e viewer => 403 — ele ve os proprios via `GET /visit-reports`).
   **Filtros (todos opcionais, aditivos, entram no WHERE das DUAS pernas)**: `page`/`limit` (max 100); `search` (max 120) casa nome/usuario do **AUTOR** nos dois tipos e, **so na visita**, o **CLIENTE** (acento-insensitive via `new_client_name_normalized`/`client.search_normalized`); `type` (`VISIT_REPORT`|`WEEKLY_REPORT`) descarta a outra perna; `authorId` (uuid); `from`/`to` (`YYYY-MM-DD` BRT); `status` (`active`|`cancelled`). Estrategia **top-K de listas ordenadas** — busca `offset+limit` de cada tabela ja filtrada e ordenada, funde, ordena e fatia; `total` = soma dos counts filtrados.
   _Hoje a UI so envia `page`/`limit`/`search`/`type` (os filtros da pagina viraram chips de tipo — Redesign §2.10 R13). `authorId`/`from`/`to`/`status` seguem aceitos e testados, sem consumidor de tela._
8. `GET /api/v1/relatorios/stats`
   Cards do topo da pagina "Relatorios". Mesmo gate do feed (`VISIT_REPORT_VIEWER_ROLES`). Devolve `{ visitsThisWeek, visitsLastWeek, weeklyTrend }` — visitas **NAO-canceladas**, de **todos** os autores. `weeklyTrend` = **13 semanas BRT** (a atual + 12 anteriores, ~90 dias), zero-preenchida, `weekStart` na segunda (`YYYY-MM-DD`); o **ultimo ponto e a semana atual** e seu `count` **e** o `visitsThisWeek` (invariante coberta por teste). **Sem `Cache-Control`**: quem cria uma visita esta na mesma pagina e precisa do refresh imediato.

### Politica de acesso do PROSPECTOR

Alem dos guards de navegacao, um gate central em `resolveActorContext` (`src/api/v1/backend-api.js`) responde `403 ROLE_FORBIDDEN` para o `PROSPECTOR` em qualquer metodo autenticado fora da allowlist `PROSPECTOR_ALLOWED_API_METHODS` — fonte canonica em `src/auth/prospector-access.js` (sessao/conta, push, lookup de clientes e informes). Consultar o modulo em vez de duplicar a lista aqui.

## Health e prontidao

1. `GET /api/health`
2. `GET /api/health/live`
3. `GET /api/health/ready`

## Regras contratuais importantes

1. Operacoes que mudam estado usam `expectedVersion` para concorrencia otimista.
2. Operacoes criticas usam idempotencia por escopo e chave.
3. Atualizacoes de registro e classificacao exigem motivo.
4. `resolve` aceita QR bruto, URL, UUID e lote interno embutido em texto.
5. A API retorna erros de negocio com `4xx` e mensagens explicitas do backend.
6. Uploads de imagem sao limitados por `MAX_UPLOAD_SIZE_BYTES`, com padrao de `12 MiB` por arquivo.
7. **Datas de acao do contrato recusam fim de semana (DSB-D7).** As datas planejadas de faturamento (`invoiceDate`) e pagamento (`paymentDate`) nao podem cair em sabado/domingo → `422 { code: 'WEEKEND_DATE', field }`. A **data do contrato** (`contractDate`, assinatura) e **isenta**. Enforcement em `assertBusinessDate` (`sale-contract-support.js`), via `normalizeEtapa2Input`. _(As datas reais de marco — `invoicedAt`/`paidAt`/`shippedAt` — sairam com as acoes que as gravavam, RC-D62/D65 em 2026-07-28; `finalize`/`reopen` nao tem data.)_ O front bloqueia antes (erro no campo). Reflexo no dashboard (DSB-D18): o card de Eventos virou calendario MENSAL com sab/dom visiveis — o antigo roll de fim de semana dos feeds (`rollWeekendToWeekday`) foi **removido** e um evento legado/borda de fim de semana aparece no **dia real**.

## Contrato de eventos

O dominio de amostras gera os seguintes eventos (o enum canonico vive em `SampleEventType` no `prisma/schema.prisma`):

1. `PHOTO_ADDED`
2. `REGISTRATION_CONFIRMED` (criador unico do Sample, fromStatus null → toStatus RC)
3. `REGISTRATION_UPDATED`
4. `QR_PRINT_REQUESTED` (audit-only, null/null)
5. `QR_PRINT_FAILED` (audit-only)
6. `QR_PRINTED` (audit-only)
7. `CLASSIFICATION_EXTRACTION_COMPLETED` (audit)
8. `CLASSIFICATION_EXTRACTION_FAILED` (audit)
9. `CLASSIFICATION_COMPLETED`
10. `CLASSIFICATION_UPDATED`
11. `SALE_CREATED`
12. `SALE_UPDATED`
13. `SALE_CANCELLED`
14. `LOSS_RECORDED`
15. `LOSS_UPDATED`
16. `LOSS_CANCELLED`
17. `COMMERCIAL_STATUS_UPDATED`
18. `PHYSICAL_SAMPLE_SENT`
19. `PHYSICAL_SAMPLE_SEND_UPDATED`
20. `PHYSICAL_SAMPLE_SEND_CANCELLED`
21. `REPORT_EXPORTED`
22. `SAMPLE_INVALIDATED`

Eventos historicos cortados na Fase Q (nao existem mais no enum):
`SAMPLE_RECEIVED`, `REGISTRATION_STARTED` (consolidados em `REGISTRATION_CONFIRMED`
unico — Q registro), `CLASSIFICATION_STARTED`, `CLASSIFICATION_SAVED_PARTIAL`
(sem maquina de estado intermediaria — Q.cls.1), `QR_REPRINT_REQUESTED`
(toda impressao usa `QR_PRINT_REQUESTED` com `attemptNumber` sequencial — Q.print).

Regras oficiais:

1. o envelope do evento e validado por JSON Schema;
2. `actorType=USER` exige `actorUserId`;
3. eventos de transicao mutadores precisam de `fromStatus` e `toStatus`. Eventos
   audit-only (impressao, fotos, extracao IA, reports, sends) tem `fromStatus: null`
   e `toStatus: null` — nao mutam status nem version do Sample. A lista canonica
   de mutadores vive em `MUTATING_EVENT_TYPES` em `src/events/event-contract-service.js`;
4. `SampleEvent` e append-only;
5. `Sample` materializa o estado atual, mas nao substitui a trilha de eventos.

## Schemas e validacao

Diretorio de schemas:

1. `docs/schemas/events/v1/base/`
2. `docs/schemas/events/v1/payloads/`
3. `docs/schemas/events/v1/events/`
4. `docs/schemas/events/v1/event.schema.json`

Comandos relevantes:

```bash
npm run validate:schemas
npm run test:contracts
npm run test:unit
npm run test:integration:db
```

## Decisoes documentadas nesta consolidacao

1. `v1` e um contrato interno da aplicacao, nao uma API publica estabilizada para terceiros.
2. Extracao de dados por IA esta implementada no modulo de classificacao via GPT-4o, com revisao manual obrigatoria antes de persistir os campos extraidos (ver `docs/Produto-e-Fluxos.md`).
3. O contrato de eventos segue ativo e executavel porque os schemas em `docs/schemas/events/v1/` continuam fazendo parte da validacao do repositorio.
