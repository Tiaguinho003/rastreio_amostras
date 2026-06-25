# Revisão da Página de Lotes (`/samples`, lista) — Plano de Trabalho

> **Escopo:** a **lista** de `/samples` (mobile + desktop). O **detalhe**
> (`/samples/[sampleId]`) está **fora** deste plano.
> **Origem:** revisão robusta por workflow multiagente com verificação
> adversarial (2026-06-24): **36 achados → 29 confirmados, 7 refutados**.
> **Objetivo:** deixar a página **sem bugs, inconsistências nem gargalos**.
> **Execução:** faseada — cada fase é aprovada no device e commitada
> separadamente. Push e deploy são do usuário.

## Status geral

| Fase | Tema                                                               | Status                                                            |
| ---- | ------------------------------------------------------------------ | ----------------------------------------------------------------- |
| 1    | Bugs do Modo Liga (unificar o fetch) — B1–B5                       | ✅ **Código pronto + commit `57dc023`** — falta validar no device |
| 2    | Gargalos de render — G1, G2, G4 (G5 descartado)                    | ✅ **Código pronto** — falta validar no device                    |
| 3    | Camada de dados (backend) — D1, D2, D3                             | ✅ **Código pronto** (247 unit + 290 integração) — falta deploy   |
| 4    | Render da lista longa — G3 (content-visibility, não react-virtual) | ✅ **Código pronto** — validar em device (iOS PWA)                |
| 5    | Inconsistências / acessibilidade — I2, I3, I4, I5, lacuna #6       | ✅ **Código pronto** — validar no device (visual + teclado/SR)    |
| 6    | Código morto (CSS) + docs — M1–M6, S1                              | ✅ **Código pronto** (M1 legado grande DEFERIDO — interleaved)    |
| —    | Testes de regressão (lacuna #7)                                    | ⏳ pendente (junto das fases de lógica/dados)                     |

> ⚠️ As referências `arquivo:linha` abaixo são **âncoras por símbolo** — os
> números deslocam conforme os arquivos mudam (a Fase 1 já deslocou o
> `page.tsx`). **Sempre `grep` pelo símbolo antes de editar.**

---

## Decisões do usuário (travadas)

1. **Escopo:** cobrir **todos os 29** achados, em fases.
2. **Modo Liga:** **unificar o fetch** num único caminho (resolver a raiz, não
   remendar bug a bug).
3. **`PARTIALLY_SOLD`:** **manter "Em aberto"** no card (consistente com o
   detalhe) → o achado I1 **não entra** no plano.
4. **Lista:** **virtualizar agora** (`@tanstack/react-virtual`).

---

## Arquivos centrais

- `app/samples/page.tsx` — página (fetch, reducer, snapshot, modo Liga, modal de filtros).
- `components/samples/SampleCard.tsx` — card do lote.
- `components/samples/BlendConfirmationSheet.tsx` — bottom sheet da liga.
- `components/samples/SampleCreateRadialFab.tsx` — FAB "+" (leque).
- `components/samples/ClassificationFilterField.tsx` — campo de filtro de classificação.
- `lib/api-client.ts` — `listSamples`, `listClassificationValues`, `createBlend`.
- `src/samples/sample-query-service.js` — `listSamples` no backend (Prisma).
- `app/globals.css` — estilos (**compartilhado com outro agente** — isolar hunks ao commitar).
- `docs/API-e-Contratos.md` — contrato do `GET /api/v1/samples`.

---

## Catálogo de achados

### ✅ Confirmados — Bugs do Modo Liga (Fase 1)

- **B1** — `runLoadMore` nunca passava `eligibleForBlend`: ao paginar dentro da
  Liga, os cards da 2ª página em diante voltavam "normais" (sem elegibilidade).
- **B2** — dois effects de fetch concorrendo: ao filtrar/buscar dentro da Liga,
  a elegibilidade sumia (o fetch normal vencia, sem `eligibleForBlend`).
- **B3** — o effect de blend ignorava o filtro de **Período** (`buildPeriodQuery`).
- **B4** — o snapshot persistia a lista enriquecida da Liga (eligibility/
  committedSacks); ao voltar do detalhe (sempre em modo normal) sobrava
  elegibilidade "fantasma".
- **B5** — load-more em andamento não era invalidado ao alternar de modo →
  resposta de página obsoleta podia ser concatenada.

### ✅ Confirmados — Gargalos de render (Fase 2)

- **G1** — `SampleCard` sem `React.memo`: toda a lista re-renderiza a cada
  tecla na busca / mudança de estado da página.
- **G2** — `animationDelay = index * 0.04s` sem teto: cards profundos (após
  vários load-more) demoram segundos para aparecer.
- **G5** — conteúdo do modal de filtros (`renderFilterFields` /
  `renderClientMultiFilter`) inline na página → re-render do modal acoplado ao
  da lista.
- **G4** — `listClassificationValues` chamado 4× sempre que monta; sem cache.

### ✅ Confirmado — Gargalo estrutural (Fase 4)

- **G3** — lista cresce sem teto no DOM; cada card monta 2 SVGs + painel
  expandido sempre presente. → virtualizar.

### ✅ Confirmados — Camada de dados (Fase 3)

- **D1** — `listSamples` faz `COUNT` em **toda** página (via `$transaction`),
  mesmo no load-more, onde o front ignora `total`.
- **D2** — projeção da lista traz PII do cliente (`cpf`, `cnpjRoot`, `phone`,
  `code`, `personType`) que o card não usa.
- **D3** _(opcional/baixo)_ — índice `idx_sample_lot_int_id` pode não casar com
  o `ORDER BY` do keyset (`DESC NULLS LAST, id ASC`).

### ✅ Confirmados — Inconsistências / a11y (Fase 5)

- **I2** — empty-state genérico ("Nenhuma amostra encontrada") mesmo no modo
  Liga (deveria ser "Nenhuma amostra disponível para liga").
- **I3** — skeleton de loading desalinhado do card v2 branco (estilo antigo).
- **I4** — leque do FAB sem gestão de foco (abrir/fechar/teclado).
- **I5** — card inelegível usa `aria-pressed` + `aria-disabled` juntos
  (semântica ambígua para leitor de tela).
- **lacuna #6** — a11y do `BlendConfirmationSheet` e do modal de filtros (foco
  ao abrir/fechar) + live region anunciando o load-more.

### ✅ Confirmados — Código morto / docs (Fase 6)

- **M1** — bloco legado `.samples-page-*` (não-v2) + `.samples-page-search`.
- **M2** — CSS de paginação por botões (`.spv2-footer`, `.spv2-page-btn`,
  `.spv2-page-info`) — a lista usa cursor/scroll infinito.
- **M3** — `.spv2-sort-btn` (sem uso).
- **M4** — `.spv2-card-stat-{num,divider,total,unit,--primary}` (manter
  `-label`, `-value`, `-value--empty`, `--peneira`).
- **M5** — overrides `.samples-page-v2 .spv2-chips/.spv2-chip` (desktop).
- **M6** — `BlendConfirmationSheet` effect com dep dupla `[samplesKey, samples]`
  (basta `samplesKey`, ler `samples` via ref).
- **S1** — `docs/API-e-Contratos.md` descreve filtros incompletos do
  `GET /samples`.

### ❌ Refutados (falso-positivo — **não** investigar de novo)

1. `SAMPLE_PAGE_LIMIT = 20` não é "cap de 30 vs 20" — é intencional.
2. "Overcommit" da liga (selecionar mais sacas que o disponível) é
   **intencional** (validado no commit).
3. Índice de `contains`/trigram **já existe** (busca por texto).
   4–7. Outros 4 alarmes de concorrência/índice/cap revisados e descartados na
   verificação adversarial.

### Lacunas levantadas (tratadas dentro das fases)

- **#2** — reconciliação de seleção quando item selecionado some da lista →
  tratada na Fase 1 (deseleciona inelegível + toast; `createBlend` só recebe
  ids válidos).
- **#3** — granularidade da mensagem de erro do `createBlend` → revisar UX na
  Fase 1/5.
- **#5** — ao remover CSS morto, conferir `.records-*` / `.records-client-*`
  **separadamente** (só os `.samples-page-*` estão confirmados mortos).
- **#7** — a página **não tem cobertura de teste** hoje → adicionar regressão.
- **#8** — virtualização + bottom sheet historicamente problemáticos em **iOS
  PWA standalone** → validar no device real na Fase 4.

---

## Fase 1 — Bugs do Modo Liga (unificar o fetch) ✅

**Status:** código pronto, gates verdes, **commit `57dc023`**. Falta a
validação no device.

**O que foi feito** (`app/samples/page.tsx`, +96/−89):

- Criados `selectionModeRef` (espelha `selectionMode`) e `prevFetchInputsRef`
  (último `{appliedHiddenFilters, appliedSearch, newSampleRefetchKey,
selectionMode}`).
- `runLoadMore` lê `selectionModeRef.current` e inclui
  `eligibleForBlend` + `...buildPeriodQuery(...)` no payload → **B1/B3** no
  load-more.
- **Fetch inicial unificado** (um único `useEffect`, deps
  `[appliedHiddenFilters, appliedSearch, session, newSampleRefetchKey,
selectionMode]`): `eligibleForBlend = selectionMode === 'blend'`, mesmos
  filtros (inclui Período). Eliminado o effect de blend separado → **B2/B3**.
- **Entrar/sair da Liga é otimista:** `prevFetchInputsRef` distingue "só trocou
  de modo" (mantém a lista, sem `fetch-initial` nem scroll-top) de "filtro
  mudou" (recarrega do zero). Reconciliação de seleção preservada (deseleciona
  inelegível + `toast.info`); erro no modo Liga → `toast.error` + sai do modo.
- Token do load-more invalidado ao alternar de modo (`token += 1; inFlight =
false`) → **B5**.
- Guard `if (selectionModeRef.current === 'blend') return;` no
  `saveSnapshotBeforeLeave` e no effect de save contínuo (via **ref**, não dep,
  pra não re-rodar o save ao alternar de modo) → **B4**.

**Verificação pendente no device (mobile + desktop):**

1. Filtrar → entrar na Liga: inelegíveis acinzentados? (B2)
2. Na Liga, rolar (2ª/3ª página): novos cards respeitam elegibilidade? (B1)
3. Filtro de Período + Liga: respeita o período? (B3)
4. Entrar/sair da Liga: sem flash de loading nem pulo pro topo; seleção zera ao sair?
5. Entrar na Liga → abrir lote → voltar: volta normal, sem elegibilidade fantasma? (B4)
6. Seleção que vira inelegível após refetch é removida com toast?

---

## Fase 2 — Gargalos de render (quick wins, preparam a virtualização) ✅

**Status:** código pronto, gates verdes. Falta validar no device. **G5 foi
descartado** (decisão do usuário 2026-06-25 — ver abaixo).

**O que foi feito:**

- **G1 ✅** — `SampleCard` agora é `export const SampleCard = memo(SampleCardComponent)`
  (`components/samples/SampleCard.tsx`). Os 4 handlers passados ao card foram
  estabilizados em `page.tsx`: `toggleSampleSelection`, `toggleCardExpand`,
  `showIneligibleReason` viraram `useCallback` (updater funcional → deps `[]`,
  exceto `showIneligibleReason` com `[toast]`); e `saveSnapshotBeforeLeave`
  (= `onClickCapture`, que antes mudava a cada tecla na busca) virou `useCallback`
  `[]` lendo um `snapshotInputsRef` (padrão "latest ref", atualizado a cada
  render). Sem isso o `onClickCapture` instável quebraria o memo a cada keystroke.
  Referências dos itens são preservadas no `success-more` (`[...state.items, …]`),
  então paginar não re-renderiza cards já montados.
- **G2 ✅** — `animationDelay` capado: `Math.min(index, 12) * 0.04` em
  `SampleCard.tsx` (satura ~0.48s; sem o teto, cards profundos demorariam
  segundos pra aparecer).
- **G4 ✅** — `listClassificationValues` (4 chamadas) agora carrega **uma vez por
  montagem** via `classificationOptionsLoadedRef`: reabrir o modal de filtros não
  refaz as chamadas; em erro/abort o ref fica `false` e tenta de novo.
- **G5 ❌ DESCARTADO** — extrair o modal de filtros pra um componente memoizado.
  Motivo (confirmado com o usuário): o **G1 já entrega o objetivo declarado do
  G5** ("isolar o re-render do modal da lista" — a lista agora é memoizada e não
  re-renderiza com a digitação no filtro). Um componente memoizado do modal
  re-renderizaria mesmo assim, porque o que muda durante o uso do modal
  (`draftHiddenFilters`/`openClientFilter`/busca de cliente) é justamente o que
  ele receberia como prop; e o `ClientLookupField` já é isolado. Extrair ~400
  linhas (campos retráteis, foco, scroll-to-section, refs) seria a parte mais
  intrincada da página, com risco de regressão e ganho não-mensurável.

**Verificação:** React DevTools Profiler — digitar na busca **não** deve
re-renderizar os cards; reabrir o modal de filtros **não** refaz as 4 chamadas.
Smoke funcional: expandir card, selecionar na Liga, "Ver detalhes" (snapshot),
filtros — tudo continua funcionando.

---

## Fase 3 — Camada de dados (backend) ✅

**Status:** código pronto, gates verdes, **247 unit + 290 integração passando**
(integração rodada contra o DB com a migration D3 aplicada). Falta deploy
(migrate job) — push/deploy são do usuário.

**O que foi feito:**

- **D1 ✅** — `listSamples` (`src/samples/sample-query-service.js`) só faz `COUNT`
  na carga inicial (sem cursor); no load-more (keyset) pula o COUNT —
  `findManyArgs` único, `$transaction([findMany, count])` só no caminho inicial,
  senão `findMany` solto + `total = null`. `totalPages` vira null junto.
  **Mudança de contrato (registrada):** `ListSamplesResponse.page.total` e
  `.totalPages` agora são `number | null` (`lib/types.ts`); o front faz
  `?? 0` no `success-initial` (caminho sem cursor, sempre numérico) e ignora
  `total` no `success-more`. Teste de cursor (`backend-api-v1-missing`) atualizado
  pra esperar `total: null` nas páginas com cursor.
- **D2 ✅** — projeção de lista enxuta `CLIENT_LIST_SELECT` + `SAMPLE_LIST_INCLUDE`
  (usados só no `findMany` da lista; detalhe/resolve seguem com `SAMPLE_INCLUDE`).
  Remove a PII **cpf, cnpjRoot, phone** do payload da lista. **Refino da nota do
  plano:** a nota dizia remover `code`/`personType` também, mas **ambos foram
  MANTIDOS** — `personType` é necessário pro `displayName` (`PF ? fullName :
legalName`) e `code` é não-nulável no tipo do front. Como `mapOwnerClient` faz
  `?? null`, o **shape** do retorno não muda (cpf/cnpj/phone saem `null`).
- **D3 ✅** — migration `20260625120000_sample_lot_int_id_nulls_last`: recria
  `idx_sample_lot_int_id` como `("internal_lot_number_int" DESC NULLS LAST,
"id" ASC)` pra casar com o keyset (antes era `DESC` = NULLS FIRST → mismatch →
  Sort). Aplicada com `migrate deploy` local sem erro; raw SQL (não no
  schema.prisma, consistente com o índice original). ⚠️ **Vai rodar no migrate
  job do próximo deploy.**

**Verificação:** ✅ `test:integration:db` (290) cobre `listSamples` filtros +
cursor; teste de cursor confirma `total: null` no load-more; nenhum teste lê
PII da lista. ⚠️ trunca o DB local — reseed feito (`db:seed`).

---

## Fase 4 — Gargalo de render da lista (G3) ✅

**Status:** código pronto, gates verdes (lint/format/typecheck/build). Falta
**validação em device real** (mobile + iOS PWA + desktop).

**Decisão (2026-06-25): NÃO usar `@tanstack/react-virtual` — usar
`content-visibility`.** A análise mostrou que o scroller difere por breakpoint
(mobile = janela; desktop = container `.spv2-list-scroll`), o que tornaria a
virtualização real arriscada (hooks `useWindowVirtualizer` vs `useVirtualizer`
não-condicionais → dois componentes ou unificar o scroller, mexendo no que o
iOS PWA já provou frágil) e complexa (remedir altura, reescrever load-more +
restauração de scroll, neutralizar re-animação no unmount). `content-visibility`
entrega o mesmo ganho de render com risco ~zero.

**O que foi feito:**

- **G3 ✅** — `content-visibility: auto` + `contain-intrinsic-size: auto <h>`
  (88px mobile / 108px desktop) nos itens da lista (`.spv2-card-wrap` idle +
  `.spv2-card.is-blend-selectable` liga) em `app/globals.css`. O browser pula
  render/layout/paint dos cards fora da tela (o gargalo real) **sem** tocar no
  scroller, load-more, observer nem na restauração de scroll. `auto` faz o
  browser lembrar a altura real após o 1º render. Degrada para render normal
  onde não há suporte (Safari < 18).
- **Animação de entrada:** removido o escalonamento por índice (o
  `animationDelay` inline + a prop `index` do `SampleCard`; supersede o cap do
  G2). Motivo: com `content-visibility`, um card revelado no scroll começaria a
  animação naquele momento e ficaria **invisível durante o delay** (`backwards`)
  → "branco→fade". O fade `spv2-cardIn` (0.35s) foi **mantido**, só sem stagger.

**Verificação (device real — iOS PWA é o ponto crítico):**

- Rolar lista longa (vários load-more): scroll suave, sem cards em branco.
- Animação de entrada: cards aparecem com fade (sem cascata), e revelados no
  scroll **não** piscam em branco.
- **Restauração de scroll** ao voltar do detalhe — ⚠️ ponto a observar: com
  `content-visibility`, cards acima do ponto restaurado usam a altura estimada
  até renderizar; se houver **cards expandidos** acima, pode haver leve deriva
  (o comum, tudo colapsado, casa com a estimativa). Conferir em scroll profundo.
- Expandir card, rolar pra longe e voltar: mantém a altura expandida.
- Modo Liga: cards seguem selecionáveis/acinzentados; entrada OK.
- Desktop: scroll do container suave.

---

## Fase 5 — Inconsistências / Acessibilidade ✅

**Status:** código pronto, gates verdes (lint/format/typecheck/build). Falta
validação no device (visual + teclado/leitor de tela).

**O que foi feito:**

- **I2 ✅** — empty-state da lista agora é condicional ao `selectionMode`: em
  modo Liga mostra "Nenhuma amostra disponível para liga" / "Ajuste os filtros
  ou saia do modo liga" (`app/samples/page.tsx`).
- **I3 ✅** — `.spv2-skeleton-card` (`app/globals.css`) realinhado ao card v2
  branco: raio `clamp(14px,4vw,16px)`, sombra suave (sai a borda verde
  tracejada), base cinza-clara neutra (shimmer segue visível), min-height 80px.
- **I4 ✅** — `SampleCreateRadialFab`: foca a 1ª opção (`Lote`) ao abrir o leque
  e devolve o foco ao FAB ao fechar SEM ação (Escape/tap-fora/toggle) — guard
  por `actionFiredRef` pra numa seleção o foco ir pro modal/tela aberta. Refs
  `firstOptionRef`/`fabButtonRef` + effect no `open`. (Setas = não feito, era
  opcional.)
- **I5 ✅** — card inelegível (`SampleCard.tsx`): `aria-pressed` omitido quando
  inelegível (`isIneligible ? undefined : isSelected`), mantém só `aria-disabled`.
- **lacuna #6 — parcialmente já pronto + live region ✅:** o foco de
  abrir/fechar do **`BlendConfirmationSheet`** já vem do `BottomSheet`
  compartilhado (`role="dialog"` + `aria-modal` + `useFocusTrap` + Escape) e o
  **modal de filtros** já tem trap + restauração + Escape próprios — nada a
  mudar. Adicionado o que faltava: **live region** `role="status"
aria-live="polite"` (classe `login-visually-hidden`) que anuncia "Carregando
  mais amostras" no load-more (rolagem infinita não entra mais em silêncio).

**Verificação:** visual (empty-state da Liga, skeleton no load-more) +
teclado/leitor de tela (foco do leque: abrir→1ª opção, Escape→FAB; card
inelegível sem "pressed"; anúncio do load-more).

---

## Fase 6 — Código morto (CSS) + docs [arquivo compartilhado] ✅

**Status:** código pronto, gates verdes (lint/format/typecheck/build). Todos os
seletores removidos foram confirmados com **0 usos no JSX** antes de apagar.

**O que foi feito (CSS morto /samples-scoped, removido cirurgicamente):**

- **M3 ✅** — bloco `.spv2-sort-btn` (isolado).
- **M4 ✅** — `.spv2-card-stat-{num,divider,total,unit}` + `--primary` (variantes
  do design antigo de stats), **mantendo** `-label`/`-value`/`-value--empty`/
  `--peneira` (vivos, intercalados — removido item a item).
- **M2 ✅** — bloco base `.spv2-footer`/`.spv2-page-btn`/`.spv2-page-info`
  (paginação por botão; a lista usa cursor) + os overrides desktop
  `.samples-page-v2 .spv2-footer/.spv2-page-btn` (2 `@media`).
- **M5 ✅** — overrides desktop `.samples-page-v2 .spv2-chips/.spv2-chip`
  (2 `@media`), mantendo a base/`.clients-page-v2`.
- **M1 (parcial) ✅** — `.samples-page-search` (regra isolada) removida.

**M6 ✅ (mecanismo corrigido):** a "dep dupla" `[samplesKey, samples]` do effect
de sync do `BlendConfirmationSheet` é **intencional** (o comentário explica: re-
sincroniza `availableSacks` quando o refetch muda o array sem mudar os ids). O
fix do plano ("ler via ref") **quebraria** essa re-sync. A raiz era a prop
`samples` recriada a cada render (`.filter()` inline no `page.tsx`) → agora
memoizada (`useMemo` `selectedSamplesForSheet`, deps `[items, selectedIds]`):
o effect só re-dispara quando o conteúdo muda. `BlendConfirmationSheet` intacto.

**S1 ✅** — `docs/API-e-Contratos.md` (`GET /api/v1/samples`) reescrito com os
filtros reais (busca/displayStatus/harvests/clientIds/classificação/sacas/
período/isBlend, `eligibleForBlend` opcional) + nota do `total: null` no load-more.

**⚠️ DEFERIDO — bloco legado grande `.samples-page-*` (não-v2):** ~83 regras
(toolbar/filtros/chips/search-bar/list) em `app/globals.css` (~`:14105–14762`),
confirmadas mortas (0 JSX), MAS **intercaladas com `.records-client-*` VIVAS**
(usadas pelo /clients, ~`:14498–14616`, sanduichadas entre dois trechos de
`.samples-page-*`). Remover 83 regras intercaladas à mão, preservando as vivas,
num arquivo compartilhado de 34k linhas, é arriscado demais pro valor (é higiene,
0 impacto no usuário). Fica pra um passe dedicado de limpeza de CSS — de
preferência com tooling que valide, e idealmente junto da revisão do /clients
(dono das `.records-*`). Os satélites `.clients-page-v2 .spv2-footer/chip`
(também mortos) também ficam pro passe do /clients.

---

## Testes (lacuna #7 — a página não tem cobertura hoje)

Stack de teste do repo: **`node:test`** (`node --test`, JS puro). **Não há**
harness de teste de componente React. O runner lista cada arquivo
explicitamente no script `test:unit` do `package.json` → ao adicionar um teste,
**incluir o arquivo nessa lista**.

- **Reducer** (`samplesListReducer`, hoje **privado** em `page.tsx:454`):
  para testar, **extrair** para um módulo próprio sem deps de React (ex.
  `lib/samples/samples-list-reducer.ts`), importar no `page.tsx`, e cobrir
  `success-initial`/`success-more`/reset/token em `tests/`. Essa extração é um
  passo dedicado (deve ser verificada por si).
- **Fetch unificado do Modo Liga** (effect com refs/otimista): difícil em
  `node:test` puro — validar no device por enquanto; reavaliar se vale um
  harness de componente.
- **`test:integration:db`** já cobre `listSamples` — estender para o cursor
  sem `COUNT` (D1) e a projeção enxuta (D2) na Fase 3.

---

## Protocolo de verificação (cada fase)

1. Gates: `npm run lint && npm run format:check && npm run typecheck && npm run build`.
   - ⚠️ **Nunca** `build` com `next dev` ativo (quebra o `.next`).
2. `npm run test:unit` (e `test:integration:db` nas fases de dados/backend —
   ⚠️ trunca o DB local; reseed com `npm run db:seed` depois).
3. Manual mobile + desktop (o usuário valida no device; a virtualização exige
   **iOS PWA real**).
4. **Commit por fase**, gates verdes, hunks isolados no `globals.css`.
   **Sem push/deploy** (é do usuário).

---

## Regras operacionais (lembrar a cada fase)

- **Agente paralelo:** commitar **só** o próprio escopo (`git add` seletivo /
  `git add -p`), nunca `git add -A`. O `globals.css` é compartilhado.
- **Migrations:** nunca editar existentes; criar novas.
- **Push é do usuário.** Eu commito; não faço push nem deploy.
- **Mensagens de UI sempre em pt-BR.**
- **Skill-maintenance:** após mexer em código, conferir se alguma skill em
  `.claude/skills/` precisa atualizar.
